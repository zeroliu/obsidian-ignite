import { InMemoryStorageAdapter } from '@/adapters/mock/InMemoryStorageAdapter';
import { MockEmbeddingAdapter } from '@/adapters/mock/MockEmbeddingAdapter';
import { EmbeddingCacheManager } from '@/domain/embedding/cache';
import { EmbeddingOrchestrator, type NoteForEmbedding } from '@/domain/embedding/embedBatch';
import { beforeEach, describe, expect, it } from 'vitest';

describe('EmbeddingOrchestrator', () => {
  let provider: MockEmbeddingAdapter;
  let storage: InMemoryStorageAdapter;
  let cache: EmbeddingCacheManager;
  let orchestrator: EmbeddingOrchestrator;

  beforeEach(() => {
    provider = new MockEmbeddingAdapter();
    storage = new InMemoryStorageAdapter();
    cache = new EmbeddingCacheManager(storage);
    orchestrator = new EmbeddingOrchestrator(provider, cache);
  });

  function createNote(path: string, content: string): NoteForEmbedding {
    return { notePath: path, content };
  }

  describe('embedNotes', () => {
    it('should embed notes without cache', async () => {
      const orchestratorNoCache = new EmbeddingOrchestrator(provider, null);

      const result = await orchestratorNoCache.embedNotes([
        createNote('note1.md', 'Content one'),
        createNote('note2.md', 'Content two'),
      ]);

      expect(result.notes).toHaveLength(2);
      expect(result.notes[0].notePath).toBe('note1.md');
      expect(result.notes[1].notePath).toBe('note2.md');
      expect(result.notes[0].fromCache).toBe(false);
      expect(result.stats.cacheMisses).toBe(2);
    });

    it('should use cache for already-embedded notes', async () => {
      // First embedding
      await orchestrator.embedNotes([createNote('note.md', 'Content')]);

      // Reset provider call history
      provider._clearCallHistory();

      // Second embedding of same note
      const result = await orchestrator.embedNotes([createNote('note.md', 'Content')]);

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].fromCache).toBe(true);
      expect(result.stats.cacheHits).toBe(1);
      expect(result.stats.cacheMisses).toBe(0);

      // Provider should not have been called
      expect(provider._getBatchCallCount()).toBe(0);
    });

    it('should re-embed notes with changed content', async () => {
      // First embedding
      await orchestrator.embedNotes([createNote('note.md', 'Original content')]);
      provider._clearCallHistory();

      // Second embedding with different content
      const result = await orchestrator.embedNotes([createNote('note.md', 'Changed content')]);

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].fromCache).toBe(false);
      expect(result.stats.cacheMisses).toBe(1);
      expect(provider._getBatchCallCount()).toBe(1);
    });

    it('should handle mixed cache hits and misses', async () => {
      // Embed first note
      await orchestrator.embedNotes([createNote('note1.md', 'Content one')]);
      provider._clearCallHistory();

      // Embed both (one cached, one new)
      const result = await orchestrator.embedNotes([
        createNote('note1.md', 'Content one'),
        createNote('note2.md', 'Content two'),
      ]);

      expect(result.notes).toHaveLength(2);
      expect(result.stats.cacheHits).toBe(1);
      expect(result.stats.cacheMisses).toBe(1);

      // Only one note should have been embedded
      expect(provider._getTotalTextsEmbedded()).toBe(1);
    });

    it('should call progress callback', async () => {
      const progressCalls: Array<{ completed: number; total: number }> = [];

      await orchestrator.embedNotes(
        [createNote('note1.md', 'Content one'), createNote('note2.md', 'Content two')],
        (completed, total) => {
          progressCalls.push({ completed, total });
        },
      );

      // Should have at least initial and final progress
      expect(progressCalls.length).toBeGreaterThanOrEqual(2);
      expect(progressCalls[progressCalls.length - 1]).toEqual({ completed: 2, total: 2 });
    });

    it('should report correct stats', async () => {
      const result = await orchestrator.embedNotes([
        createNote('note1.md', 'Content one'),
        createNote('note2.md', 'Content two'),
      ]);

      expect(result.stats.notesProcessed).toBe(2);
      expect(result.stats.tokensProcessed).toBeGreaterThan(0);
      expect(result.stats.estimatedCost).toBeGreaterThan(0);
      expect(result.stats.apiCalls).toBeGreaterThanOrEqual(1);
    });

    it('should prepare text before embedding', async () => {
      const noteWithFrontmatter = `---
title: Test
---

# Heading

Some content here.`;

      await orchestrator.embedNotes([createNote('note.md', noteWithFrontmatter)]);

      const history = provider._getCallHistory();
      expect(history).toHaveLength(1);

      // The prepared text should not contain frontmatter
      const embeddedText = history[0].inputs[0].text;
      expect(embeddedText).not.toContain('title: Test');
      expect(embeddedText).toContain('Heading');
    });

    it('should handle empty batch', async () => {
      const result = await orchestrator.embedNotes([]);

      expect(result.notes).toHaveLength(0);
      expect(result.stats.notesProcessed).toBe(0);
    });
  });

  describe('embedNote', () => {
    it('should embed a single note', async () => {
      const result = await orchestrator.embedNote(createNote('note.md', 'Content'));

      expect(result.notePath).toBe('note.md');
      expect(result.embedding).toBeDefined();
      expect(result.embedding.length).toBeGreaterThan(0);
    });
  });

  describe('getNotesToEmbed', () => {
    it('should return all notes when cache is empty', async () => {
      const notes = [createNote('note1.md', 'Content one'), createNote('note2.md', 'Content two')];

      const toEmbed = await orchestrator.getNotesToEmbed(notes);

      expect(toEmbed).toHaveLength(2);
    });

    it('should filter out cached notes', async () => {
      // Embed first note
      await orchestrator.embedNotes([createNote('note1.md', 'Content one')]);

      // Check which notes need embedding
      const notes = [createNote('note1.md', 'Content one'), createNote('note2.md', 'Content two')];

      const toEmbed = await orchestrator.getNotesToEmbed(notes);

      expect(toEmbed).toHaveLength(1);
      expect(toEmbed[0].notePath).toBe('note2.md');
    });

    it('should include notes with changed content', async () => {
      await orchestrator.embedNotes([createNote('note.md', 'Original')]);

      const toEmbed = await orchestrator.getNotesToEmbed([createNote('note.md', 'Changed')]);

      expect(toEmbed).toHaveLength(1);
    });

    it('should return all notes when cache disabled', async () => {
      const orchestratorNoCache = new EmbeddingOrchestrator(provider, null, {
        useCache: false,
      });

      const notes = [createNote('note.md', 'Content')];
      const toEmbed = await orchestratorNoCache.getNotesToEmbed(notes);

      expect(toEmbed).toHaveLength(1);
    });
  });

  describe('invalidateNotes', () => {
    it('should invalidate cached embeddings', async () => {
      await orchestrator.embedNotes([createNote('note.md', 'Content')]);

      // Verify it's cached
      let toEmbed = await orchestrator.getNotesToEmbed([createNote('note.md', 'Content')]);
      expect(toEmbed).toHaveLength(0);

      // Invalidate
      await orchestrator.invalidateNotes(['note.md']);

      // Should need re-embedding now
      toEmbed = await orchestrator.getNotesToEmbed([createNote('note.md', 'Content')]);
      expect(toEmbed).toHaveLength(1);
    });

    it('should handle missing paths gracefully', async () => {
      // Should not throw
      await orchestrator.invalidateNotes(['nonexistent.md']);
    });

    it('should work without cache', async () => {
      const orchestratorNoCache = new EmbeddingOrchestrator(provider, null);

      // Should not throw
      await orchestratorNoCache.invalidateNotes(['note.md']);
    });
  });

  describe('getProvider and getCache', () => {
    it('should return the provider', () => {
      expect(orchestrator.getProvider()).toBe(provider);
    });

    it('should return the cache', () => {
      expect(orchestrator.getCache()).toBe(cache);
    });

    it('should return null cache when not configured', () => {
      const orchestratorNoCache = new EmbeddingOrchestrator(provider, null);
      expect(orchestratorNoCache.getCache()).toBeNull();
    });
  });

  describe('configuration', () => {
    it('should respect useCache: false config', async () => {
      const orchestratorNoCache = new EmbeddingOrchestrator(provider, cache, {
        useCache: false,
      });

      // First embedding
      await orchestratorNoCache.embedNotes([createNote('note.md', 'Content')]);
      provider._clearCallHistory();

      // Second embedding should not use cache
      const result = await orchestratorNoCache.embedNotes([createNote('note.md', 'Content')]);

      expect(result.notes[0].fromCache).toBe(false);
      expect(provider._getBatchCallCount()).toBe(1);
    });

    it('should use custom text prepare config', async () => {
      const orchestratorCustom = new EmbeddingOrchestrator(provider, null, {
        textPrepare: {
          maxTokens: 100,
          stripFrontmatter: false,
          summarizeCode: false,
          stripImages: false,
        },
      });

      const noteWithFrontmatter = `---
title: Keep Me
---

Content`;

      await orchestratorCustom.embedNotes([createNote('note.md', noteWithFrontmatter)]);

      const history = provider._getCallHistory();
      const embeddedText = history[0].inputs[0].text;
      expect(embeddedText).toContain('title: Keep Me');
    });
  });

  describe('embedding determinism', () => {
    it('should produce same embedding for same content', async () => {
      const result1 = await orchestrator.embedNote(createNote('note1.md', 'Same content'));

      // Clear cache to force re-embed
      await cache.clear();

      const result2 = await orchestrator.embedNote(createNote('note2.md', 'Same content'));

      expect(result1.embedding).toEqual(result2.embedding);
    });
  });
});
