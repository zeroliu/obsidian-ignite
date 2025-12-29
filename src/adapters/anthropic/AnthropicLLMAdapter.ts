import {
  CONCEPT_NAMING_SYSTEM_PROMPT,
  buildConceptNamingPrompt,
  parseNamingResponse,
} from '@/domain/llm/prompts';
import type { ConceptNamingRequest, ConceptNamingResponse, LLMConfig } from '@/domain/llm/types';
import { DEFAULT_LLM_CONFIG } from '@/domain/llm/types';
import {
  QUESTION_GENERATION_SYSTEM_PROMPT,
  buildQuestionGenerationPrompt,
  parseQuestionResponse,
} from '@/domain/question/prompts';
import type {
  QuestionGenerationRequest,
  QuestionGenerationResponse,
} from '@/domain/question/types';
import type { ILLMProvider } from '@/ports/ILLMProvider';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Error thrown when LLM API call fails
 */
export class LLMApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly isRetryable: boolean = false,
  ) {
    super(message);
    this.name = 'LLMApiError';
  }
}

/**
 * Anthropic Claude API implementation of ILLMProvider
 *
 * Handles concept naming with integrated misfit detection.
 * Stage 3 (naming) and Stage 3.5 (refinement) are merged into a single call.
 */
export class AnthropicLLMAdapter implements ILLMProvider {
  private client: Anthropic;
  private config: LLMConfig;

  constructor(apiKey: string, config?: Partial<LLMConfig>) {
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    this.config = { ...DEFAULT_LLM_CONFIG, ...config, apiKey };
  }

  async nameConceptsBatch(request: ConceptNamingRequest): Promise<ConceptNamingResponse> {
    const userPrompt = buildConceptNamingPrompt(request.clusters);

    const response = await this.callWithRetry(CONCEPT_NAMING_SYSTEM_PROMPT, userPrompt);

    const results = parseNamingResponse(response.content);

    return {
      results,
      usage: response.usage,
    };
  }

  async generateQuestionsBatch(
    request: QuestionGenerationRequest,
  ): Promise<QuestionGenerationResponse> {
    const userPrompt = buildQuestionGenerationPrompt(request);

    const response = await this.callWithRetry(QUESTION_GENERATION_SYSTEM_PROMPT, userPrompt);

    const { questions, skipped } = parseQuestionResponse(response.content);

    return {
      questions,
      skipped,
      usage: response.usage,
    };
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...config };

    // Update API key if provided
    if (config.apiKey) {
      this.client = new Anthropic({ apiKey: config.apiKey, dangerouslyAllowBrowser: true });
    }
  }

  /**
   * Call the API with retry logic for transient errors
   */
  private async callWithRetry(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number } }> {
    let lastError: Error | null = null;
    let delay = this.config.retryBaseDelay;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await this.callApi(systemPrompt, userPrompt);
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        if (error instanceof LLMApiError && !error.isRetryable) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === this.config.maxRetries) {
          throw error;
        }

        // Wait with exponential backoff
        await this.sleep(delay);
        delay *= 2;
      }
    }

    throw lastError || new Error('Unknown error during API call');
  }

  /**
   * Make a single API call
   */
  private async callApi(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number } }> {
    try {
      const message = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });

      // Extract text content from response
      const textContent = message.content.find((block) => block.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new LLMApiError('No text content in response');
      }

      return {
        content: textContent.text,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        },
      };
    } catch (error) {
      // Handle Anthropic API errors (check by name or status property for testability)
      const apiError = error as { status?: number; message?: string; name?: string };
      if (apiError.status !== undefined) {
        const statusCode = apiError.status;
        const isRetryable = this.isRetryableError(statusCode);

        throw new LLMApiError(apiError.message || 'API error', statusCode, isRetryable);
      }

      // Handle network errors
      if (error instanceof Error && error.message.includes('network')) {
        throw new LLMApiError(error.message, undefined, true);
      }

      throw error;
    }
  }

  /**
   * Check if an error status code is retryable
   */
  private isRetryableError(statusCode: number): boolean {
    // 429 = Rate limit, 5xx = Server errors
    return statusCode === 429 || (statusCode >= 500 && statusCode < 600);
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
