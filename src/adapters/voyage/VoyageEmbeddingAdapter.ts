import type {
	BatchEmbeddingResult,
	EmbeddingConfig,
	EmbeddingInput,
	EmbeddingResult,
	IEmbeddingProvider,
} from '@/ports/IEmbeddingProvider';

/**
 * Default configuration for Voyage AI embedding adapter
 */
export const DEFAULT_VOYAGE_EMBEDDING_CONFIG: EmbeddingConfig = {
	model: 'voyage-3-lite',
	maxTokensPerText: 16000,
	batchSize: 128,
	maxRetries: 3,
	retryBaseDelay: 1000,
};

/**
 * Voyage AI API endpoint
 */
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';

/**
 * Cost per million tokens for Voyage embedding models
 */
const MODEL_COSTS: Record<string, number> = {
	'voyage-3-lite': 0.02,
	'voyage-3': 0.06,
	'voyage-code-3': 0.06,
	'voyage-finance-2': 0.12,
	'voyage-law-2': 0.12,
};

/**
 * Dimensions for Voyage embedding models
 */
const MODEL_DIMENSIONS: Record<string, number> = {
	'voyage-3-lite': 512,
	'voyage-3': 1024,
	'voyage-code-3': 1024,
	'voyage-finance-2': 1024,
	'voyage-law-2': 1024,
};

/**
 * Errors that should not be retried
 */
const NON_RETRYABLE_STATUS_CODES = [400, 401, 403, 404];

/**
 * Voyage AI API response
 */
interface VoyageAPIResponse {
	object: 'list';
	data: Array<{
		object: 'embedding';
		embedding: number[];
		index: number;
	}>;
	model: string;
	usage: {
		total_tokens: number;
	};
}

/**
 * Voyage AI API error response
 */
interface VoyageAPIError {
	detail: string;
}

/**
 * Voyage AI embedding provider implementation
 */
export class VoyageEmbeddingAdapter implements IEmbeddingProvider {
	private apiKey: string;
	private config: EmbeddingConfig;

	constructor(config: Partial<EmbeddingConfig> & { apiKey: string }) {
		this.config = { ...DEFAULT_VOYAGE_EMBEDDING_CONFIG, ...config };
		this.apiKey = config.apiKey;
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
		return MODEL_DIMENSIONS[this.config.model] ?? 512;
	}

	getProviderName(): string {
		return 'voyage';
	}

	getModelName(): string {
		return this.config.model;
	}

	/**
	 * Estimate tokens using a simple approximation
	 */
	estimateTokens(text: string): number {
		if (!text) return 0;

		// Count CJK characters
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

		if (config.apiKey) {
			this.apiKey = config.apiKey;
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
		const response = await fetch(VOYAGE_API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({
				model: this.config.model,
				input: inputs.map((i) => i.text),
				input_type: 'document',
			}),
		});

		if (!response.ok) {
			const errorBody = (await response.json().catch(() => ({}))) as VoyageAPIError;
			const error = new Error(errorBody.detail ?? `API error: ${response.status}`);
			(error as Error & { status: number }).status = response.status;
			throw error;
		}

		const data = (await response.json()) as VoyageAPIResponse;

		const embeddings: EmbeddingResult[] = data.data.map((item, index) => ({
			notePath: inputs[index].notePath,
			embedding: item.embedding,
			tokenCount: this.estimateTokens(inputs[index].text),
		}));

		return {
			embeddings,
			totalTokens: data.usage?.total_tokens ?? embeddings.reduce((sum, e) => sum + e.tokenCount, 0),
		};
	}

	private isRetryableError(error: unknown): boolean {
		// Check for API errors with status code
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
