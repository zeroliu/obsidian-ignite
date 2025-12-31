/**
 * Port for LLM (Large Language Model) interactions.
 * Provides abstraction for chat, streaming, and token management.
 */

/**
 * Represents a message in an LLM conversation.
 */
export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Response from an LLM chat completion.
 */
export interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Options for LLM chat requests.
 */
export interface LLMChatOptions {
  temperature?: number; // 0.0 to 1.0, controls randomness
  maxTokens?: number; // Max tokens to generate
  stopSequences?: string[]; // Stop generation at these strings
}

/**
 * Callbacks for streaming LLM responses.
 */
export interface LLMStreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (response: LLMResponse) => void;
  onError: (error: Error) => void;
  signal?: AbortSignal; // Allow cancellation
}

/**
 * Port interface for LLM providers.
 * Implementations should handle API-specific details (authentication, rate limiting, etc.).
 */
export interface ILLMProvider {
  /**
   * Send a chat message and receive a complete response.
   */
  chat(messages: LLMMessage[], options?: LLMChatOptions): Promise<LLMResponse>;

  /**
   * Send a chat message and stream the response token by token.
   */
  streamChat(
    messages: LLMMessage[],
    callbacks: LLMStreamCallbacks,
    options?: LLMChatOptions,
  ): Promise<void>;

  /**
   * Get the name of the LLM provider (e.g., "Anthropic").
   */
  getProviderName(): string;

  /**
   * Get the model name being used (e.g., "claude-3-5-sonnet-20241022").
   */
  getModelName(): string;

  /**
   * Get the maximum context window size in tokens.
   */
  getMaxTokens(): number;

  /**
   * Estimate the number of tokens in a text string.
   * Used for cost control and context management.
   */
  estimateTokens(text: string): number;
}
