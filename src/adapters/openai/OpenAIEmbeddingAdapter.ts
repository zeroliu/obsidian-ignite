import type {
	BatchEmbeddingResult,
	EmbeddingConfig,
	EmbeddingInput,
	EmbeddingResult,
	IEmbeddingProvider,
} from '@/ports/IEmbeddingProvider';
import OpenAI from 'openai';

/**
 * Default configuration for OpenAI embedding adapter
 */
export const DEFAULT_OPENAI_EMBEDDING_CONFIG: EmbeddingConfig = {
	model: 'text-embedding-3-small',
	maxTokensPerText: 8191,
	batchSize: 100,
	maxRetries: 3,
	retryBaseDelay: 1000,
};

/**
 * Cost per million tokens for OpenAI embedding models
 */
const MODEL_COSTS: Record<string, number> = {
	'text-embedding-3-small': 0.02,
	'text-embedding-3-large': 0.13,
	'text-embedding-ada-002': 0.1,
};

/**
 * Dimensions for OpenAI embedding models
 */
const MODEL_DIMENSIONS: Record<string, number> = {
	'text-embedding-3-small': 1536,
	'text-embedding-3-large': 3072,
	'text-embedding-ada-002': 1536,
};

/**
 * Errors that should not be retried
 */
const NON_RETRYABLE_STATUS_CODES = [400, 401, 403, 404];

/**
 * OpenAI embedding provider implementation
 */
export class OpenAIEmbeddingAdapter implements IEmbeddingProvider {
	private client: OpenAI;
	private config: EmbeddingConfig;

	constructor(config: Partial<EmbeddingConfig> & { apiKey: string }) {
		this.config = { ...DEFAULT_OPENAI_EMBEDDING_CONFIG, ...config };
		this.client = new OpenAI({ apiKey: config.apiKey });
	}

	async embed(notePath: string, text: string): Promise<EmbeddingResult> {
		const result = await this.embedBatch([{ notePath, text }]);
		return result.embeddings[0];
	}

	async embedBatch(texts: EmbeddingInput[]): Promise<BatchEmbeddingResult> {
		if (texts.length === 0) {
			return {
				embeddings: [],
				totalTokens: 0,
				usage: { totalTokens: 0, estimatedCost: 0, apiCalls: 0 },
			};
		}

		const results: EmbeddingResult[] = [];
		let totalTokens = 0;
		let apiCalls = 0;

		// Process in batches
		for (let i = 0; i < texts.length; i += this.config.batchSize) {
			const batch = texts.slice(i, i + this.config.batchSize);
			const batchResult = await this.embedBatchWithRetry(batch);

			results.push(...batchResult.embeddings);
			totalTokens += batchResult.totalTokens;
			apiCalls++;
		}

		return {
			embeddings: results,
			totalTokens,
			usage: {
				totalTokens,
				estimatedCost: this.estimateCost(totalTokens),
				apiCalls,
			},
		};
	}

	getDimensions(): number {
		return MODEL_DIMENSIONS[this.config.model] ?? 1536;
	}

	getProviderName(): string {
		return 'openai';
	}

	getModelName(): string {
		return this.config.model;
	}

	/**
	 * Estimate tokens using a simple approximation
	 * OpenAI's cl100k_base tokenizer averages ~4 chars per token for English
	 */
	estimateTokens(text: string): number {
		if (!text) return 0;

		// Count CJK characters (they typically use more tokens)
		const cjkPattern = /[\u4e00-\u9fff\u3400-\u4dbf\uac00-\ud7af\u3040-\u309f\u30a0-\u30ff]/g;
		const cjkMatches = text.match(cjkPattern);
		const cjkCount = cjkMatches?.length ?? 0;

		const nonCjkLength = text.length - cjkCount;
		const nonCjkTokens = Math.ceil(nonCjkLength / 4);
		const cjkTokens = Math.ceil(cjkCount / 1.5);

		return nonCjkTokens + cjkTokens;
	}

	getConfig(): EmbeddingConfig {
		return { ...this.config };
	}

	updateConfig(config: Partial<EmbeddingConfig>): void {
		this.config = { ...this.config, ...config };

		// Update client if API key changed
		if (config.apiKey) {
			this.client = new OpenAI({ apiKey: config.apiKey });
		}
	}

	// ============ Private Methods ============

	private async embedBatchWithRetry(
		inputs: EmbeddingInput[],
	): Promise<{ embeddings: EmbeddingResult[]; totalTokens: number }> {
		let lastError: Error | null = null;

		for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
			try {
				return await this.callEmbeddingAPI(inputs);
			} catch (error) {
				lastError = error as Error;

				// Check if error is retryable
				if (!this.isRetryableError(error)) {
					throw error;
				}

				// Wait before retry with exponential backoff
				if (attempt < this.config.maxRetries - 1) {
					const delay = this.config.retryBaseDelay * 2 ** attempt;
					await this.sleep(delay);
				}
			}
		}

		throw lastError ?? new Error('Embedding failed after retries');
	}

	private async callEmbeddingAPI(
		inputs: EmbeddingInput[],
	): Promise<{ embeddings: EmbeddingResult[]; totalTokens: number }> {
		const response = await this.client.embeddings.create({
			model: this.config.model,
			input: inputs.map((i) => i.text),
		});

		const embeddings: EmbeddingResult[] = response.data.map((item, index) => ({
			notePath: inputs[index].notePath,
			embedding: item.embedding,
			tokenCount: this.estimateTokens(inputs[index].text),
		}));

		return {
			embeddings,
			totalTokens:
				response.usage?.total_tokens ?? embeddings.reduce((sum, e) => sum + e.tokenCount, 0),
		};
	}

	private isRetryableError(error: unknown): boolean {
		// Check for OpenAI API errors by duck typing (works with mocks)
		if (this.isAPIError(error)) {
			// Rate limit (429) and server errors (5xx) are retryable
			if (error.status === 429) return true;
			if (error.status >= 500) return true;

			// Client errors (4xx except 429) are not retryable
			if (NON_RETRYABLE_STATUS_CODES.includes(error.status)) {
				return false;
			}
		}

		// Network errors are retryable
		if (error instanceof Error && error.message.includes('network')) {
			return true;
		}

		return false;
	}

	/**
	 * Check if error is an API error with status code (duck typing)
	 */
	private isAPIError(error: unknown): error is { status: number; message: string } {
		return (
			typeof error === 'object' &&
			error !== null &&
			'status' in error &&
			typeof (error as { status: unknown }).status === 'number'
		);
	}

	private estimateCost(tokens: number): number {
		const costPerMillion = MODEL_COSTS[this.config.model] ?? 0.02;
		return (tokens / 1_000_000) * costPerMillion;
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
