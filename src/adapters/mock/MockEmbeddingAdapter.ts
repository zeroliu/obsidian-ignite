import type {
	BatchEmbeddingResult,
	EmbeddingConfig,
	EmbeddingInput,
	EmbeddingResult,
	IEmbeddingProvider,
} from '@/ports/IEmbeddingProvider';

/**
 * Default configuration for MockEmbeddingAdapter
 */
export const DEFAULT_MOCK_EMBEDDING_CONFIG: EmbeddingConfig = {
	model: 'mock-embedding-v1',
	maxTokensPerText: 8191,
	batchSize: 100,
	maxRetries: 3,
	retryBaseDelay: 1000,
};

/**
 * Record of an embedding call for testing
 */
export interface EmbeddingCallRecord {
	type: 'embed' | 'embedBatch';
	inputs: EmbeddingInput[];
	timestamp: number;
}

/**
 * Mock implementation of IEmbeddingProvider for testing
 * Uses deterministic hash-based embedding generation for reproducible tests
 */
export class MockEmbeddingAdapter implements IEmbeddingProvider {
	private config: EmbeddingConfig;
	private dimensions: number;
	private callHistory: EmbeddingCallRecord[] = [];

	/**
	 * Create a new MockEmbeddingAdapter
	 * @param config - Optional configuration overrides
	 * @param dimensions - Embedding dimensions (default: 1536)
	 */
	constructor(config?: Partial<EmbeddingConfig>, dimensions = 1536) {
		this.config = { ...DEFAULT_MOCK_EMBEDDING_CONFIG, ...config };
		this.dimensions = dimensions;
	}

	async embed(notePath: string, text: string): Promise<EmbeddingResult> {
		this.callHistory.push({
			type: 'embed',
			inputs: [{ notePath, text }],
			timestamp: Date.now(),
		});

		const embedding = this.generateEmbedding(text);
		const tokenCount = this.estimateTokens(text);

		return {
			notePath,
			embedding,
			tokenCount,
		};
	}

	async embedBatch(texts: EmbeddingInput[]): Promise<BatchEmbeddingResult> {
		this.callHistory.push({
			type: 'embedBatch',
			inputs: [...texts],
			timestamp: Date.now(),
		});

		const embeddings: EmbeddingResult[] = texts.map((input) => ({
			notePath: input.notePath,
			embedding: this.generateEmbedding(input.text),
			tokenCount: this.estimateTokens(input.text),
		}));

		const totalTokens = embeddings.reduce((sum, e) => sum + e.tokenCount, 0);

		return {
			embeddings,
			totalTokens,
			usage: {
				totalTokens,
				estimatedCost: this.estimateCost(totalTokens),
				apiCalls: Math.ceil(texts.length / this.config.batchSize),
			},
		};
	}

	getDimensions(): number {
		return this.dimensions;
	}

	getProviderName(): string {
		return 'mock';
	}

	getModelName(): string {
		return this.config.model;
	}

	/**
	 * Estimate the number of tokens in a text
	 * Uses a simple approximation: ~4 characters per token for English,
	 * ~2 characters per token for CJK
	 */
	estimateTokens(text: string): number {
		if (!text) return 0;

		// Count CJK characters
		const cjkPattern = /[\u4e00-\u9fff\u3400-\u4dbf\uac00-\ud7af\u3040-\u309f\u30a0-\u30ff]/g;
		const cjkMatches = text.match(cjkPattern);
		const cjkCount = cjkMatches?.length || 0;

		// Non-CJK text: roughly 4 chars per token
		// CJK text: roughly 1.5 chars per token (each CJK char is ~0.67 tokens)
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
	}

	// ============ Private Methods ============

	/**
	 * Generate a deterministic embedding from text using hash-based seeded RNG
	 */
	private generateEmbedding(text: string): number[] {
		const hash = this.hashString(text);
		return this.generateEmbeddingFromHash(hash);
	}

	/**
	 * Hash a string to a 32-bit integer
	 * Uses a simple but deterministic hash function
	 */
	private hashString(str: string): number {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32-bit integer
		}
		return hash;
	}

	/**
	 * Generate a unit-normalized embedding vector from a hash seed
	 */
	private generateEmbeddingFromHash(hash: number): number[] {
		const rng = this.createSeededRandom(hash);
		const embedding: number[] = [];

		// Generate random values
		for (let i = 0; i < this.dimensions; i++) {
			embedding.push(rng() * 2 - 1); // Range [-1, 1]
		}

		// Normalize to unit vector
		const magnitude = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
		if (magnitude === 0) {
			// Edge case: all zeros, return a simple unit vector
			const unit = new Array(this.dimensions).fill(0);
			unit[0] = 1;
			return unit;
		}

		return embedding.map((x) => x / magnitude);
	}

	/**
	 * Create a seeded random number generator (mulberry32)
	 * https://github.com/bryc/code/blob/master/jshash/PRNGs.md#mulberry32
	 */
	private createSeededRandom(seed: number): () => number {
		let t = seed >>> 0;
		return () => {
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	/**
	 * Estimate cost for tokens (mock value)
	 */
	private estimateCost(tokens: number): number {
		// OpenAI text-embedding-3-small: $0.02 per 1M tokens
		return (tokens / 1_000_000) * 0.02;
	}

	// ============ Test Helpers ============

	/**
	 * Get call history for testing
	 */
	_getCallHistory(): EmbeddingCallRecord[] {
		return [...this.callHistory];
	}

	/**
	 * Clear call history
	 */
	_clearCallHistory(): void {
		this.callHistory = [];
	}

	/**
	 * Set the dimensions (for testing different providers)
	 */
	_setDimensions(dimensions: number): void {
		this.dimensions = dimensions;
	}

	/**
	 * Get total number of embed calls
	 */
	_getEmbedCallCount(): number {
		return this.callHistory.filter((c) => c.type === 'embed').length;
	}

	/**
	 * Get total number of batch embed calls
	 */
	_getBatchCallCount(): number {
		return this.callHistory.filter((c) => c.type === 'embedBatch').length;
	}

	/**
	 * Get total number of texts embedded (across all calls)
	 */
	_getTotalTextsEmbedded(): number {
		return this.callHistory.reduce((sum, c) => sum + c.inputs.length, 0);
	}
}
