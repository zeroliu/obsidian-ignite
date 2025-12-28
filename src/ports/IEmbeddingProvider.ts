/**
 * Result of embedding a single text
 */
export interface EmbeddingResult {
  /** Path to the note that was embedded */
  notePath: string;
  /** The embedding vector (unit normalized) */
  embedding: number[];
  /** Number of tokens in the input text */
  tokenCount: number;
}

/**
 * Result of embedding a batch of texts
 */
export interface BatchEmbeddingResult {
  /** Individual embedding results */
  embeddings: EmbeddingResult[];
  /** Total tokens across all inputs */
  totalTokens: number;
  /** Usage statistics for the batch */
  usage: {
    /** Total tokens processed */
    totalTokens: number;
    /** Estimated cost in USD */
    estimatedCost: number;
    /** Number of API calls made */
    apiCalls: number;
  };
}

/**
 * Configuration for embedding providers
 */
export interface EmbeddingConfig {
  /** API key for the embedding provider (optional for mock) */
  apiKey?: string;
  /** Model identifier (e.g., 'text-embedding-3-small') */
  model: string;
  /** Maximum tokens per text before truncation */
  maxTokensPerText: number;
  /** Number of texts to embed in a single API call */
  batchSize: number;
  /** Maximum retry attempts for failed requests */
  maxRetries: number;
  /** Base delay in ms for exponential backoff */
  retryBaseDelay: number;
}

/**
 * Input for embedding operations
 */
export interface EmbeddingInput {
  /** Path to the note */
  notePath: string;
  /** Prepared text content to embed */
  text: string;
}

/**
 * Port interface for embedding operations
 * Abstracts away specific embedding providers (OpenAI, Voyage, etc.) for testability
 */
export interface IEmbeddingProvider {
  /**
   * Embed a batch of texts
   * @param texts - Array of note paths and their text content
   * @returns Promise resolving to batch embedding results
   */
  embedBatch(texts: EmbeddingInput[]): Promise<BatchEmbeddingResult>;

  /**
   * Embed a single text
   * @param notePath - Path to the note
   * @param text - Text content to embed
   * @returns Promise resolving to embedding result
   */
  embed(notePath: string, text: string): Promise<EmbeddingResult>;

  /**
   * Get the dimensionality of embeddings produced by this provider
   * @returns Number of dimensions (e.g., 1536 for OpenAI, 512 for Voyage)
   */
  getDimensions(): number;

  /**
   * Get the provider name
   * @returns Provider identifier (e.g., 'openai', 'voyage', 'mock')
   */
  getProviderName(): string;

  /**
   * Get the model name
   * @returns Model identifier (e.g., 'text-embedding-3-small')
   */
  getModelName(): string;

  /**
   * Estimate the number of tokens in a text
   * @param text - Text to estimate tokens for
   * @returns Estimated token count
   */
  estimateTokens(text: string): number;

  /**
   * Get current configuration
   * @returns Current embedding configuration
   */
  getConfig(): EmbeddingConfig;

  /**
   * Update configuration
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<EmbeddingConfig>): void;
}
