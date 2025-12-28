import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoyageEmbeddingAdapter } from '../VoyageEmbeddingAdapter';

describe('VoyageEmbeddingAdapter', () => {
	let adapter: VoyageEmbeddingAdapter;
	const originalFetch = global.fetch;
	let mockFetch: ReturnType<typeof vi.fn>;

	beforeAll(() => {
		mockFetch = vi.fn();
		global.fetch = mockFetch;
	});

	afterAll(() => {
		global.fetch = originalFetch;
	});

	beforeEach(() => {
		mockFetch.mockReset();
		adapter = new VoyageEmbeddingAdapter({ apiKey: 'test-key' });
	});

	function mockSuccessResponse(embeddings: number[][], totalTokens = 100) {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				object: 'list',
				data: embeddings.map((embedding, index) => ({
					object: 'embedding',
					embedding,
					index,
				})),
				model: 'voyage-3-lite',
				usage: { total_tokens: totalTokens },
			}),
		});
	}

	function mockErrorResponse(status: number, detail: string) {
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status,
			json: async () => ({ detail }),
		});
	}

	describe('constructor', () => {
		it('should create adapter with API key', () => {
			expect(adapter.getProviderName()).toBe('voyage');
			expect(adapter.getModelName()).toBe('voyage-3-lite');
		});

		it('should use custom model when specified', () => {
			const customAdapter = new VoyageEmbeddingAdapter({
				apiKey: 'test-key',
				model: 'voyage-3',
			});
			expect(customAdapter.getModelName()).toBe('voyage-3');
		});
	});

	describe('embed', () => {
		it('should return embedding result', async () => {
			mockSuccessResponse([[0.1, 0.2, 0.3]]);

			const result = await adapter.embed('note.md', 'Test content');

			expect(result.notePath).toBe('note.md');
			expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
			expect(result.tokenCount).toBeGreaterThan(0);
		});

		it('should call API with correct parameters', async () => {
			mockSuccessResponse([[0.1, 0.2, 0.3]]);

			await adapter.embed('note.md', 'Test content');

			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.voyageai.com/v1/embeddings',
				expect.objectContaining({
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: 'Bearer test-key',
					},
					body: JSON.stringify({
						model: 'voyage-3-lite',
						input: ['Test content'],
						input_type: 'document',
					}),
				}),
			);
		});
	});

	describe('embedBatch', () => {
		it('should embed multiple texts', async () => {
			mockSuccessResponse([
				[0.1, 0.2, 0.3],
				[0.4, 0.5, 0.6],
			]);

			const result = await adapter.embedBatch([
				{ notePath: 'note1.md', text: 'Content one' },
				{ notePath: 'note2.md', text: 'Content two' },
			]);

			expect(result.embeddings).toHaveLength(2);
			expect(result.embeddings[0].notePath).toBe('note1.md');
			expect(result.embeddings[1].notePath).toBe('note2.md');
		});

		it('should handle empty batch', async () => {
			const result = await adapter.embedBatch([]);

			expect(result.embeddings).toHaveLength(0);
			expect(result.totalTokens).toBe(0);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('should split large batches', async () => {
			// Create adapter with small batch size
			const smallBatchAdapter = new VoyageEmbeddingAdapter({
				apiKey: 'test-key',
				batchSize: 2,
			});

			mockSuccessResponse([[0.1], [0.2]], 50);
			mockSuccessResponse([[0.3]], 25);

			const result = await smallBatchAdapter.embedBatch([
				{ notePath: 'note1.md', text: 'Content one' },
				{ notePath: 'note2.md', text: 'Content two' },
				{ notePath: 'note3.md', text: 'Content three' },
			]);

			expect(result.embeddings).toHaveLength(3);
			expect(result.usage.apiCalls).toBe(2);
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});

		it('should return usage statistics', async () => {
			mockSuccessResponse([[0.1, 0.2]], 150);

			const result = await adapter.embedBatch([{ notePath: 'note.md', text: 'Content' }]);

			expect(result.totalTokens).toBe(150);
			expect(result.usage.totalTokens).toBe(150);
			expect(result.usage.estimatedCost).toBeGreaterThan(0);
			expect(result.usage.apiCalls).toBe(1);
		});
	});

	describe('retry logic', () => {
		beforeEach(() => {
			mockFetch.mockReset();
		});

		it('should retry on rate limit (429) and succeed', async () => {
			const fastAdapter = new VoyageEmbeddingAdapter({
				apiKey: 'test-key',
				retryBaseDelay: 1,
			});

			mockErrorResponse(429, 'Rate limited');
			mockSuccessResponse([[0.1, 0.2]]);

			const result = await fastAdapter.embed('note.md', 'Content');

			expect(result.embedding).toEqual([0.1, 0.2]);
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});

		it('should retry on server error (500) and succeed', async () => {
			const fastAdapter = new VoyageEmbeddingAdapter({
				apiKey: 'test-key',
				retryBaseDelay: 1,
			});

			mockErrorResponse(500, 'Server error');
			mockSuccessResponse([[0.1, 0.2]]);

			const result = await fastAdapter.embed('note.md', 'Content');

			expect(result.embedding).toEqual([0.1, 0.2]);
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});

		it('should not retry on auth error (401)', async () => {
			const fastAdapter = new VoyageEmbeddingAdapter({
				apiKey: 'test-key',
				maxRetries: 3,
				retryBaseDelay: 1,
			});

			mockErrorResponse(401, 'Unauthorized');

			await expect(fastAdapter.embed('note.md', 'Content')).rejects.toThrow('Unauthorized');
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it('should not retry on bad request (400)', async () => {
			const fastAdapter = new VoyageEmbeddingAdapter({
				apiKey: 'test-key',
				maxRetries: 3,
				retryBaseDelay: 1,
			});

			mockErrorResponse(400, 'Bad request');

			await expect(fastAdapter.embed('note.md', 'Content')).rejects.toThrow('Bad request');
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it('should exhaust retries and throw on persistent rate limit', async () => {
			const fastAdapter = new VoyageEmbeddingAdapter({
				apiKey: 'test-key',
				maxRetries: 2,
				retryBaseDelay: 1,
			});

			mockErrorResponse(429, 'Rate limited');
			mockErrorResponse(429, 'Rate limited');

			await expect(fastAdapter.embed('note.md', 'Content')).rejects.toThrow('Rate limited');
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});
	});

	describe('getDimensions', () => {
		it('should return correct dimensions for voyage-3-lite', () => {
			expect(adapter.getDimensions()).toBe(512);
		});

		it('should return correct dimensions for voyage-3', () => {
			const largeAdapter = new VoyageEmbeddingAdapter({
				apiKey: 'test-key',
				model: 'voyage-3',
			});
			expect(largeAdapter.getDimensions()).toBe(1024);
		});

		it('should return default for unknown model', () => {
			const unknownAdapter = new VoyageEmbeddingAdapter({
				apiKey: 'test-key',
				model: 'unknown-model',
			});
			expect(unknownAdapter.getDimensions()).toBe(512);
		});
	});

	describe('estimateTokens', () => {
		it('should estimate tokens for English text', () => {
			const tokens = adapter.estimateTokens('This is a test sentence.');
			expect(tokens).toBeGreaterThan(0);
			expect(tokens).toBeLessThan(20);
		});

		it('should estimate tokens for CJK text', () => {
			const tokens = adapter.estimateTokens('这是中文测试');
			expect(tokens).toBeGreaterThan(0);
		});

		it('should return 0 for empty text', () => {
			expect(adapter.estimateTokens('')).toBe(0);
		});
	});

	describe('config management', () => {
		it('should update config', () => {
			adapter.updateConfig({ batchSize: 50 });
			expect(adapter.getConfig().batchSize).toBe(50);
		});

		it('should return copy of config', () => {
			const config1 = adapter.getConfig();
			config1.batchSize = 999;

			const config2 = adapter.getConfig();
			expect(config2.batchSize).not.toBe(999);
		});
	});
});
