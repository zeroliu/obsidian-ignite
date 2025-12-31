import type {
  ILLMProvider,
  LLMChatOptions,
  LLMMessage,
  LLMResponse,
  LLMStreamCallbacks,
} from '@/ports';

/**
 * Anthropic API message format.
 */
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Anthropic API request body for message creation.
 */
interface AnthropicMessageRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  temperature?: number;
  stop_sequences?: string[];
  system?: string;
  stream?: boolean;
}

/**
 * Anthropic API response for non-streaming requests.
 */
interface AnthropicMessageResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Anthropic API streaming event types.
 */
type AnthropicStreamEvent =
  | { type: 'message_start'; message: AnthropicMessageResponse }
  | { type: 'content_block_start'; index: number; content_block: { type: 'text'; text: string } }
  | { type: 'content_block_delta'; index: number; delta: { type: 'text_delta'; text: string } }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta?: { stop_reason: string }; usage: { output_tokens: number } }
  | { type: 'message_stop' }
  | { type: 'ping' };

/**
 * Configuration for the Anthropic LLM adapter.
 */
export interface AnthropicLLMConfig {
  apiKey: string;
  model?: string; // Default: claude-3-5-sonnet-20241022
  maxTokens?: number; // Default: 4096
  apiVersion?: string; // Default: 2023-06-01
}

/**
 * Adapter for Anthropic's Claude API.
 * Implements the ILLMProvider port for goal-oriented features.
 */
export class AnthropicLLMAdapter implements ILLMProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly defaultMaxTokens: number;
  private readonly apiVersion: string;
  private readonly baseUrl = 'https://api.anthropic.com/v1';

  constructor(config: AnthropicLLMConfig) {
    if (!config.apiKey || config.apiKey.trim().length === 0) {
      throw new Error('Anthropic API key is required');
    }
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'claude-3-5-sonnet-20241022';
    this.defaultMaxTokens = config.maxTokens ?? 4096;
    this.apiVersion = config.apiVersion ?? '2023-06-01';
  }

  async chat(messages: LLMMessage[], options?: LLMChatOptions): Promise<LLMResponse> {
    const { systemMessage, userMessages } = this.separateSystemMessage(messages);
    const requestBody = this.buildRequestBody(systemMessage, userMessages, options, false);

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as AnthropicMessageResponse;

    return {
      content: data.content.map((c) => c.text).join(''),
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      },
    };
  }

  async streamChat(
    messages: LLMMessage[],
    callbacks: LLMStreamCallbacks,
    options?: LLMChatOptions,
  ): Promise<void> {
    const { systemMessage, userMessages } = this.separateSystemMessage(messages);
    const requestBody = this.buildRequestBody(systemMessage, userMessages, options, true);

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(requestBody),
        signal: callbacks.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
      }

      await this.processStream(response, callbacks);
    } catch (error) {
      if (error instanceof Error) {
        callbacks.onError(error);
      } else {
        callbacks.onError(new Error('Unknown error during streaming'));
      }
    }
  }

  getProviderName(): string {
    return 'Anthropic';
  }

  getModelName(): string {
    return this.model;
  }

  getMaxTokens(): number {
    // Context window for Claude 3.5 Sonnet is 200K tokens
    return 200000;
  }

  estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for English text
    // Add 20% safety margin to avoid underestimating
    const baseEstimate = Math.ceil(text.length / 4);
    return Math.ceil(baseEstimate * 1.2);
  }

  /**
   * Separate system messages from user/assistant messages.
   * Anthropic API requires system messages to be passed separately.
   */
  private separateSystemMessage(messages: LLMMessage[]): {
    systemMessage: string | undefined;
    userMessages: AnthropicMessage[];
  } {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const userMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const systemMessage =
      systemMessages.length > 0 ? systemMessages.map((m) => m.content).join('\n\n') : undefined;

    return { systemMessage, userMessages };
  }

  /**
   * Build the request body for the Anthropic API.
   */
  private buildRequestBody(
    systemMessage: string | undefined,
    userMessages: AnthropicMessage[],
    options: LLMChatOptions | undefined,
    stream: boolean,
  ): AnthropicMessageRequest {
    const requestBody: AnthropicMessageRequest = {
      model: this.model,
      messages: userMessages,
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
      stream,
    };

    if (systemMessage) {
      requestBody.system = systemMessage;
    }

    if (options?.temperature !== undefined) {
      requestBody.temperature = options.temperature;
    }

    if (options?.stopSequences) {
      requestBody.stop_sequences = options.stopSequences;
    }

    return requestBody;
  }

  /**
   * Build headers for Anthropic API requests.
   */
  private buildHeaders(): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': this.apiVersion,
      'content-type': 'application/json',
    };
  }

  /**
   * Process the streaming response from Anthropic API.
   */
  private async processStream(response: Response, callbacks: LLMStreamCallbacks): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let parseErrors = 0;
    const MAX_PARSE_ERRORS = 5;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;

          const data = line.slice(6); // Remove 'data: ' prefix
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data) as AnthropicStreamEvent;

            switch (event.type) {
              case 'message_start':
                inputTokens = event.message.usage.input_tokens;
                break;
              case 'content_block_delta':
                if (event.delta.type === 'text_delta') {
                  callbacks.onToken(event.delta.text);
                  fullContent += event.delta.text;
                }
                break;
              case 'message_delta':
                outputTokens = event.usage.output_tokens;
                break;
            }
          } catch (parseError) {
            // Track parse errors and fail if too many occur
            parseErrors++;
            console.warn('Failed to parse streaming event:', parseError);

            if (parseErrors >= MAX_PARSE_ERRORS) {
              const error = new Error(`Too many parse errors (${parseErrors}) during streaming`);
              callbacks.onError(error);
              throw error;
            }
          }
        }
      }

      // Process any remaining data in the buffer
      if (buffer.trim() && buffer.startsWith('data: ')) {
        const data = buffer.slice(6); // Remove 'data: ' prefix
        if (data !== '[DONE]') {
          try {
            const event = JSON.parse(data) as AnthropicStreamEvent;

            switch (event.type) {
              case 'message_start':
                inputTokens = event.message.usage.input_tokens;
                break;
              case 'content_block_delta':
                if (event.delta.type === 'text_delta') {
                  callbacks.onToken(event.delta.text);
                  fullContent += event.delta.text;
                }
                break;
              case 'message_delta':
                outputTokens = event.usage.output_tokens;
                break;
            }
          } catch (parseError) {
            console.warn('Failed to parse final streaming event:', parseError);
          }
        }
      }

      callbacks.onComplete({
        content: fullContent,
        usage: {
          inputTokens,
          outputTokens,
        },
      });
    } finally {
      reader.releaseLock();
    }
  }
}
