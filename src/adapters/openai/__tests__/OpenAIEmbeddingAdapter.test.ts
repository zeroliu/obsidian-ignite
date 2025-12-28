import { beforeEach, describe, expect, it, vi } from 'vitest';

// Create mock functions
const mockCreate = vi.fn();

/**
 * Create a mock API error for testing
 */
function createAPIError(status: number, message: string): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  error.name = 'APIError';
  return error;
}

// Mock OpenAI module with a class (required for Vitest 4.x)
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      embeddings = {
        create: mockCreate,
      };
    },
  };
});

import { OpenAIEmbeddingAdapter } from '@/adapters/openai/OpenAIEmbeddingAdapter';

describe('OpenAIEmbeddingAdapter', () => {
  let adapter: OpenAIEmbeddingAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockReset();
    adapter = new OpenAIEmbeddingAdapter({ apiKey: 'test-key' });
  });

  function mockEmbeddingResponse(embeddings: number[][], totalTokens = 100) {
    mockCreate.mockResolvedValueOnce({
      data: embeddings.map((embedding, index) => ({
        embedding,
        index,
        object: 'embedding',
      })),
      model: 'text-embedding-3-small',
      object: 'list',
      usage: {
        prompt_tokens: totalTokens,
        total_tokens: totalTokens,
      },
    });
  }

  describe('constructor', () => {
    it('should create adapter with API key', () => {
      expect(adapter.getProviderName()).toBe('openai');
      expect(adapter.getModelName()).toBe('text-embedding-3-small');
    });

    it('should use custom model when specified', () => {
      const customAdapter = new OpenAIEmbeddingAdapter({
        apiKey: 'test-key',
        model: 'text-embedding-3-large',
      });
      expect(customAdapter.getModelName()).toBe('text-embedding-3-large');
    });
  });

  describe('embed', () => {
    it('should return embedding result', async () => {
      mockEmbeddingResponse([[0.1, 0.2, 0.3]]);

      const result = await adapter.embed('note.md', 'Test content');

      expect(result.notePath).toBe('note.md');
      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.tokenCount).toBeGreaterThan(0);
    });

    it('should call API with correct parameters', async () => {
      mockEmbeddingResponse([[0.1, 0.2, 0.3]]);

      await adapter.embed('note.md', 'Test content');

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: ['Test content'],
      });
    });
  });

  describe('embedBatch', () => {
    it('should embed multiple texts', async () => {
      mockEmbeddingResponse([
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
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should exclude empty texts from results', async () => {
      mockEmbeddingResponse([[0.1, 0.2, 0.3]]);

      const result = await adapter.embedBatch([
        { notePath: 'empty.md', text: '' },
        { notePath: 'content.md', text: 'Real content' },
        { notePath: 'whitespace.md', text: '   ' },
      ]);

      expect(result.embeddings).toHaveLength(1);
      expect(result.embeddings[0].notePath).toBe('content.md');
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: ['Real content'],
      });
    });

    it('should handle all empty texts', async () => {
      const result = await adapter.embedBatch([
        { notePath: 'empty1.md', text: '' },
        { notePath: 'empty2.md', text: '  ' },
      ]);

      expect(result.embeddings).toHaveLength(0);
      expect(result.totalTokens).toBe(0);
      expect(result.usage.apiCalls).toBe(0);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should handle mixed empty and non-empty texts in batches', async () => {
      const smallBatchAdapter = new OpenAIEmbeddingAdapter({
        apiKey: 'test-key',
        batchSize: 2,
      });

      mockCreate.mockResolvedValueOnce({
        data: [
          { embedding: [0.1], index: 0 },
          { embedding: [0.2], index: 1 },
        ],
        usage: { total_tokens: 50 },
      });
      mockCreate.mockResolvedValueOnce({
        data: [{ embedding: [0.3], index: 0 }],
        usage: { total_tokens: 25 },
      });

      const result = await smallBatchAdapter.embedBatch([
        { notePath: 'note1.md', text: 'Content one' },
        { notePath: 'empty.md', text: '' },
        { notePath: 'note2.md', text: 'Content two' },
        { notePath: 'note3.md', text: 'Content three' },
      ]);

      expect(result.embeddings).toHaveLength(3);
      expect(result.embeddings.map((e) => e.notePath)).toEqual([
        'note1.md',
        'note2.md',
        'note3.md',
      ]);
      expect(result.usage.apiCalls).toBe(2);
    });

    it('should split large batches', async () => {
      // Create adapter with small batch size
      const smallBatchAdapter = new OpenAIEmbeddingAdapter({
        apiKey: 'test-key',
        batchSize: 2,
      });

      mockCreate.mockResolvedValueOnce({
        data: [
          { embedding: [0.1], index: 0 },
          { embedding: [0.2], index: 1 },
        ],
        usage: { total_tokens: 50 },
      });
      mockCreate.mockResolvedValueOnce({
        data: [{ embedding: [0.3], index: 0 }],
        usage: { total_tokens: 25 },
      });

      const result = await smallBatchAdapter.embedBatch([
        { notePath: 'note1.md', text: 'Content one' },
        { notePath: 'note2.md', text: 'Content two' },
        { notePath: 'note3.md', text: 'Content three' },
      ]);

      expect(result.embeddings).toHaveLength(3);
      expect(result.usage.apiCalls).toBe(2);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should return usage statistics', async () => {
      mockEmbeddingResponse([[0.1, 0.2]], 150);

      const result = await adapter.embedBatch([{ notePath: 'note.md', text: 'Content' }]);

      expect(result.totalTokens).toBe(150);
      expect(result.usage.totalTokens).toBe(150);
      expect(result.usage.estimatedCost).toBeGreaterThan(0);
      expect(result.usage.apiCalls).toBe(1);
    });
  });

  describe('retry logic', () => {
    beforeEach(() => {
      // Reset mock for each retry test to ensure isolated call counts
      mockCreate.mockReset();
    });

    it('should retry on rate limit (429) and succeed', async () => {
      // Use adapter with fast retries
      const fastAdapter = new OpenAIEmbeddingAdapter({
        apiKey: 'test-key',
        retryBaseDelay: 1,
      });

      mockCreate.mockRejectedValueOnce(createAPIError(429, 'Rate limited')).mockResolvedValueOnce({
        data: [{ embedding: [0.1, 0.2], index: 0 }],
        usage: { total_tokens: 10 },
      });

      const result = await fastAdapter.embed('note.md', 'Content');

      expect(result.embedding).toEqual([0.1, 0.2]);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should retry on server error (500) and succeed', async () => {
      // Use adapter with fast retries
      const fastAdapter = new OpenAIEmbeddingAdapter({
        apiKey: 'test-key',
        retryBaseDelay: 1,
      });

      mockCreate.mockRejectedValueOnce(createAPIError(500, 'Server error')).mockResolvedValueOnce({
        data: [{ embedding: [0.1, 0.2], index: 0 }],
        usage: { total_tokens: 10 },
      });

      const result = await fastAdapter.embed('note.md', 'Content');

      expect(result.embedding).toEqual([0.1, 0.2]);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should not retry on auth error (401)', async () => {
      // Create adapter with minimal retries for faster test
      const fastAdapter = new OpenAIEmbeddingAdapter({
        apiKey: 'test-key',
        maxRetries: 3,
        retryBaseDelay: 1,
      });

      mockCreate.mockRejectedValueOnce(createAPIError(401, 'Unauthorized'));

      await expect(fastAdapter.embed('note.md', 'Content')).rejects.toThrow('Unauthorized');
      // Should fail immediately without retrying
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should not retry on bad request (400)', async () => {
      // Create adapter with minimal retries for faster test
      const fastAdapter = new OpenAIEmbeddingAdapter({
        apiKey: 'test-key',
        maxRetries: 3,
        retryBaseDelay: 1,
      });

      mockCreate.mockRejectedValueOnce(createAPIError(400, 'Bad request'));

      await expect(fastAdapter.embed('note.md', 'Content')).rejects.toThrow('Bad request');
      // Should fail immediately without retrying
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should exhaust retries and throw on persistent rate limit', async () => {
      // Create adapter with minimal retries for faster test
      const fastAdapter = new OpenAIEmbeddingAdapter({
        apiKey: 'test-key',
        maxRetries: 2,
        retryBaseDelay: 1,
      });

      // All attempts fail
      mockCreate
        .mockRejectedValueOnce(createAPIError(429, 'Rate limited'))
        .mockRejectedValueOnce(createAPIError(429, 'Rate limited'));

      await expect(fastAdapter.embed('note.md', 'Content')).rejects.toThrow('Rate limited');
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });
  });

  describe('getDimensions', () => {
    it('should return correct dimensions for text-embedding-3-small', () => {
      expect(adapter.getDimensions()).toBe(1536);
    });

    it('should return correct dimensions for text-embedding-3-large', () => {
      const largeAdapter = new OpenAIEmbeddingAdapter({
        apiKey: 'test-key',
        model: 'text-embedding-3-large',
      });
      expect(largeAdapter.getDimensions()).toBe(3072);
    });

    it('should return default for unknown model', () => {
      const unknownAdapter = new OpenAIEmbeddingAdapter({
        apiKey: 'test-key',
        model: 'unknown-model',
      });
      expect(unknownAdapter.getDimensions()).toBe(1536);
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
