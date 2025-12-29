import { InMemoryStorageAdapter } from '@/adapters/mock/InMemoryStorageAdapter';
import { beforeEach, describe, expect, it } from 'vitest';
import { QuestionCacheManager, getQuestionCacheKey } from '../cache';
import type { Question } from '../types';
import { QUESTION_CACHE_VERSION } from '../types';

describe('getQuestionCacheKey', () => {
  it('generates consistent keys for same path', () => {
    const key1 = getQuestionCacheKey('folder/note.md');
    const key2 = getQuestionCacheKey('folder/note.md');
    expect(key1).toBe(key2);
  });

  it('normalizes path separators', () => {
    const key1 = getQuestionCacheKey('folder/note.md');
    const key2 = getQuestionCacheKey('folder\\note.md');
    expect(key1).toBe(key2);
  });

  it('normalizes case', () => {
    const key1 = getQuestionCacheKey('Folder/Note.md');
    const key2 = getQuestionCacheKey('folder/note.md');
    expect(key1).toBe(key2);
  });
});

describe('QuestionCacheManager', () => {
  let storage: InMemoryStorageAdapter;
  let cache: QuestionCacheManager;

  const mockQuestion: Question = {
    id: 'q1',
    format: 'multiple_choice',
    difficulty: 'medium',
    question: 'Test question?',
    sourceNoteId: 'test.md',
    qualityScore: 0.8,
    options: ['A', 'B', 'C', 'D'],
    correctAnswer: 0,
    generatedAt: Date.now(),
  };

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
    cache = new QuestionCacheManager(storage, { cacheMaxAgeDays: 7 });
  });

  describe('get', () => {
    it('returns null for non-existent entries', async () => {
      const result = await cache.get('nonexistent.md', 'hash123', 'fp123');
      expect(result).toBeNull();
    });

    it('returns null for version mismatch', async () => {
      const key = getQuestionCacheKey('test.md');
      await storage.write(key, {
        version: QUESTION_CACHE_VERSION + 1,
        notePath: 'test.md',
        contentHash: 'hash123',
        historyFingerprint: 'fp123',
        generatedAt: Date.now(),
        questions: [mockQuestion],
      });

      const result = await cache.get('test.md', 'hash123', 'fp123');
      expect(result).toBeNull();
    });

    it('returns null for content hash mismatch', async () => {
      await cache.set('test.md', 'hash123', 'fp123', [mockQuestion]);
      const result = await cache.get('test.md', 'different-hash', 'fp123');
      expect(result).toBeNull();
    });

    it('returns null for history fingerprint mismatch', async () => {
      await cache.set('test.md', 'hash123', 'fp123', [mockQuestion]);
      const result = await cache.get('test.md', 'hash123', 'different-fp');
      expect(result).toBeNull();
    });

    it('returns null for expired entries', async () => {
      const key = getQuestionCacheKey('test.md');
      await storage.write(key, {
        version: QUESTION_CACHE_VERSION,
        notePath: 'test.md',
        contentHash: 'hash123',
        historyFingerprint: 'fp123',
        generatedAt: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
        questions: [mockQuestion],
      });

      const result = await cache.get('test.md', 'hash123', 'fp123');
      expect(result).toBeNull();
    });

    it('returns questions for valid entries', async () => {
      await cache.set('test.md', 'hash123', 'fp123', [mockQuestion]);
      const result = await cache.get('test.md', 'hash123', 'fp123');
      expect(result).toHaveLength(1);
      expect(result?.[0].id).toBe('q1');
    });
  });

  describe('isValid', () => {
    it('returns false for non-existent entries', async () => {
      const result = await cache.isValid('nonexistent.md', 'hash123', 'fp123');
      expect(result).toBe(false);
    });

    it('returns true for valid entries', async () => {
      await cache.set('test.md', 'hash123', 'fp123', [mockQuestion]);
      const result = await cache.isValid('test.md', 'hash123', 'fp123');
      expect(result).toBe(true);
    });
  });

  describe('set', () => {
    it('stores questions with metadata', async () => {
      await cache.set('test.md', 'hash123', 'fp123', [mockQuestion]);
      const result = await cache.get('test.md', 'hash123', 'fp123');
      expect(result).toHaveLength(1);
    });

    it('overwrites existing entries', async () => {
      const question2: Question = { ...mockQuestion, id: 'q2' };
      await cache.set('test.md', 'hash123', 'fp123', [mockQuestion]);
      await cache.set('test.md', 'hash456', 'fp456', [question2]);

      const oldResult = await cache.get('test.md', 'hash123', 'fp123');
      expect(oldResult).toBeNull();

      const newResult = await cache.get('test.md', 'hash456', 'fp456');
      expect(newResult).toHaveLength(1);
      expect(newResult?.[0].id).toBe('q2');
    });
  });

  describe('invalidate', () => {
    it('removes cache entry', async () => {
      await cache.set('test.md', 'hash123', 'fp123', [mockQuestion]);
      await cache.invalidate('test.md');
      const result = await cache.get('test.md', 'hash123', 'fp123');
      expect(result).toBeNull();
    });

    it('does nothing for non-existent entries', async () => {
      // Should not throw
      await cache.invalidate('nonexistent.md');
    });
  });

  describe('cleanup', () => {
    it('removes expired entries', async () => {
      const key = getQuestionCacheKey('old.md');
      await storage.write(key, {
        version: QUESTION_CACHE_VERSION,
        notePath: 'old.md',
        contentHash: 'hash123',
        historyFingerprint: 'fp123',
        generatedAt: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
        questions: [mockQuestion],
      });

      const result = await cache.cleanup();
      expect(result.removed).toBe(1);
    });

    it('keeps non-expired entries', async () => {
      await cache.set('fresh.md', 'hash123', 'fp123', [mockQuestion]);
      const result = await cache.cleanup();
      expect(result.removed).toBe(0);

      const questions = await cache.get('fresh.md', 'hash123', 'fp123');
      expect(questions).toHaveLength(1);
    });
  });

  describe('getAllCachedPaths', () => {
    it('returns empty array when no cache exists', async () => {
      const paths = await cache.getAllCachedPaths();
      expect(paths).toEqual([]);
    });

    it('returns cached paths', async () => {
      await cache.set('a.md', 'hash1', 'fp1', [mockQuestion]);
      await cache.set('b.md', 'hash2', 'fp2', [mockQuestion]);

      const paths = await cache.getAllCachedPaths();
      expect(paths.length).toBe(2);
    });
  });
});
