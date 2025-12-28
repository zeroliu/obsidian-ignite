import {
  DEFAULT_MOCK_EMBEDDING_CONFIG,
  MockEmbeddingAdapter,
} from '@/adapters/mock/MockEmbeddingAdapter';
import { beforeEach, describe, expect, it } from 'vitest';

describe('MockEmbeddingAdapter', () => {
  let adapter: MockEmbeddingAdapter;

  beforeEach(() => {
    adapter = new MockEmbeddingAdapter();
  });

  describe('constructor', () => {
    it('should use default config and dimensions', () => {
      expect(adapter.getDimensions()).toBe(1536);
      expect(adapter.getConfig()).toEqual(DEFAULT_MOCK_EMBEDDING_CONFIG);
    });

    it('should allow custom dimensions', () => {
      const customAdapter = new MockEmbeddingAdapter({}, 512);
      expect(customAdapter.getDimensions()).toBe(512);
    });

    it('should allow custom config', () => {
      const customAdapter = new MockEmbeddingAdapter({
        model: 'custom-model',
        batchSize: 50,
      });
      expect(customAdapter.getConfig().model).toBe('custom-model');
      expect(customAdapter.getConfig().batchSize).toBe(50);
    });
  });

  describe('embed', () => {
    it('should return embedding result with correct structure', async () => {
      const result = await adapter.embed('notes/test.md', 'Hello world');

      expect(result.notePath).toBe('notes/test.md');
      expect(result.embedding).toHaveLength(1536);
      expect(result.tokenCount).toBeGreaterThan(0);
    });

    it('should produce deterministic embeddings for same input', async () => {
      const result1 = await adapter.embed('path1.md', 'Same text content');
      const result2 = await adapter.embed('path2.md', 'Same text content');

      expect(result1.embedding).toEqual(result2.embedding);
    });

    it('should produce different embeddings for different inputs', async () => {
      const result1 = await adapter.embed('path.md', 'First text');
      const result2 = await adapter.embed('path.md', 'Second text');

      expect(result1.embedding).not.toEqual(result2.embedding);
    });

    it('should produce unit vectors (magnitude close to 1)', async () => {
      const result = await adapter.embed('test.md', 'Some test content');
      const magnitude = Math.sqrt(result.embedding.reduce((sum, x) => sum + x * x, 0));

      expect(magnitude).toBeCloseTo(1, 5);
    });

    it('should record call in history', async () => {
      await adapter.embed('test.md', 'Test content');

      const history = adapter._getCallHistory();
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('embed');
      expect(history[0].inputs).toHaveLength(1);
      expect(history[0].inputs[0].notePath).toBe('test.md');
      expect(history[0].inputs[0].text).toBe('Test content');
    });
  });

  describe('embedBatch', () => {
    it('should embed multiple texts', async () => {
      const result = await adapter.embedBatch([
        { notePath: 'note1.md', text: 'First note content' },
        { notePath: 'note2.md', text: 'Second note content' },
        { notePath: 'note3.md', text: 'Third note content' },
      ]);

      expect(result.embeddings).toHaveLength(3);
      expect(result.embeddings[0].notePath).toBe('note1.md');
      expect(result.embeddings[1].notePath).toBe('note2.md');
      expect(result.embeddings[2].notePath).toBe('note3.md');
    });

    it('should produce same embeddings as individual embed calls', async () => {
      const batchResult = await adapter.embedBatch([
        { notePath: 'note1.md', text: 'Test content one' },
        { notePath: 'note2.md', text: 'Test content two' },
      ]);

      const singleResult1 = await adapter.embed('other.md', 'Test content one');
      const singleResult2 = await adapter.embed('other.md', 'Test content two');

      expect(batchResult.embeddings[0].embedding).toEqual(singleResult1.embedding);
      expect(batchResult.embeddings[1].embedding).toEqual(singleResult2.embedding);
    });

    it('should calculate total tokens correctly', async () => {
      const result = await adapter.embedBatch([
        { notePath: 'note1.md', text: 'Short' },
        { notePath: 'note2.md', text: 'A bit longer text' },
      ]);

      const expectedTotal = result.embeddings.reduce((sum, e) => sum + e.tokenCount, 0);
      expect(result.totalTokens).toBe(expectedTotal);
    });

    it('should return usage statistics', async () => {
      const result = await adapter.embedBatch([
        { notePath: 'note1.md', text: 'Content one' },
        { notePath: 'note2.md', text: 'Content two' },
      ]);

      expect(result.usage).toBeDefined();
      expect(result.usage.totalTokens).toBe(result.totalTokens);
      expect(result.usage.estimatedCost).toBeGreaterThan(0);
      expect(result.usage.apiCalls).toBeGreaterThanOrEqual(1);
    });

    it('should handle empty batch', async () => {
      const result = await adapter.embedBatch([]);

      expect(result.embeddings).toHaveLength(0);
      expect(result.totalTokens).toBe(0);
    });

    it('should record call in history', async () => {
      await adapter.embedBatch([
        { notePath: 'note1.md', text: 'Content' },
        { notePath: 'note2.md', text: 'Content' },
      ]);

      const history = adapter._getCallHistory();
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('embedBatch');
      expect(history[0].inputs).toHaveLength(2);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens for English text', () => {
      // Roughly 1.5 chars per token (conservative)
      const text = 'This is a test sentence with multiple words';
      const tokens = adapter.estimateTokens(text);

      expect(tokens).toBeGreaterThan(0);
      // ~44 chars / 1.5 = ~29 tokens
      expect(tokens).toBeGreaterThanOrEqual(25);
      expect(tokens).toBeLessThanOrEqual(35);
    });

    it('should estimate tokens for CJK text', () => {
      // CJK chars are 1:1 with tokens (conservative)
      const text = '这是一个中文测试';
      const tokens = adapter.estimateTokens(text);

      expect(tokens).toBeGreaterThan(0);
      // 8 CJK chars at 1:1 ratio = 8 tokens
      expect(tokens).toBe(8);
    });

    it('should handle mixed content', () => {
      const text = 'Hello 世界 World 你好';
      const tokens = adapter.estimateTokens(text);

      expect(tokens).toBeGreaterThan(0);
    });

    it('should return 0 for empty text', () => {
      expect(adapter.estimateTokens('')).toBe(0);
    });
  });

  describe('provider info', () => {
    it('should return provider name as mock', () => {
      expect(adapter.getProviderName()).toBe('mock');
    });

    it('should return model name from config', () => {
      expect(adapter.getModelName()).toBe('mock-embedding-v1');
    });

    it('should return configured dimensions', () => {
      expect(adapter.getDimensions()).toBe(1536);

      const adapter512 = new MockEmbeddingAdapter({}, 512);
      expect(adapter512.getDimensions()).toBe(512);
    });
  });

  describe('config management', () => {
    it('should update config partially', () => {
      adapter.updateConfig({ batchSize: 200 });

      const config = adapter.getConfig();
      expect(config.batchSize).toBe(200);
      expect(config.model).toBe('mock-embedding-v1'); // unchanged
    });

    it('should return a copy of config', () => {
      const config1 = adapter.getConfig();
      config1.batchSize = 999;

      const config2 = adapter.getConfig();
      expect(config2.batchSize).not.toBe(999);
    });
  });

  describe('unit vector normalization', () => {
    it('should produce unit vectors for various inputs', async () => {
      const texts = [
        'Short',
        'A longer piece of text with many words',
        'Special chars !@#$%^&*()',
        'Numbers 12345',
        '日本語テスト',
        'Émojis are 🚀 fun',
      ];

      for (const text of texts) {
        const result = await adapter.embed('test.md', text);
        const magnitude = Math.sqrt(result.embedding.reduce((sum, x) => sum + x * x, 0));
        expect(magnitude).toBeCloseTo(1, 5);
      }
    });

    it('should handle edge case of empty string', async () => {
      const result = await adapter.embed('test.md', '');
      const magnitude = Math.sqrt(result.embedding.reduce((sum, x) => sum + x * x, 0));
      expect(magnitude).toBeCloseTo(1, 5);
    });
  });

  describe('test helpers', () => {
    it('should track call history across multiple calls', async () => {
      await adapter.embed('note1.md', 'Content 1');
      await adapter.embed('note2.md', 'Content 2');
      await adapter.embedBatch([{ notePath: 'note3.md', text: 'Content 3' }]);

      const history = adapter._getCallHistory();
      expect(history).toHaveLength(3);
    });

    it('should clear call history', async () => {
      await adapter.embed('note.md', 'Content');
      adapter._clearCallHistory();

      expect(adapter._getCallHistory()).toHaveLength(0);
    });

    it('should count embed calls correctly', async () => {
      await adapter.embed('note1.md', 'Content');
      await adapter.embed('note2.md', 'Content');
      await adapter.embedBatch([{ notePath: 'note3.md', text: 'Content' }]);

      expect(adapter._getEmbedCallCount()).toBe(2);
      expect(adapter._getBatchCallCount()).toBe(1);
    });

    it('should count total texts embedded', async () => {
      await adapter.embed('note1.md', 'Content');
      await adapter.embedBatch([
        { notePath: 'note2.md', text: 'Content' },
        { notePath: 'note3.md', text: 'Content' },
      ]);

      expect(adapter._getTotalTextsEmbedded()).toBe(3);
    });

    it('should allow changing dimensions via test helper', async () => {
      adapter._setDimensions(512);

      const result = await adapter.embed('test.md', 'Content');
      expect(result.embedding).toHaveLength(512);
      expect(adapter.getDimensions()).toBe(512);
    });
  });

  describe('determinism', () => {
    it('should be deterministic across adapter instances', async () => {
      const adapter1 = new MockEmbeddingAdapter();
      const adapter2 = new MockEmbeddingAdapter();

      const result1 = await adapter1.embed('test.md', 'Same content');
      const result2 = await adapter2.embed('test.md', 'Same content');

      expect(result1.embedding).toEqual(result2.embedding);
    });

    it('should produce consistent results on repeated calls', async () => {
      const results: number[][] = [];

      for (let i = 0; i < 5; i++) {
        const result = await adapter.embed('test.md', 'Repeated content');
        results.push(result.embedding);
      }

      // All embeddings should be identical
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toEqual(results[0]);
      }
    });
  });
});
