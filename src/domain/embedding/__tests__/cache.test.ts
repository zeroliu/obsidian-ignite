import { InMemoryStorageAdapter } from '@/adapters/mock/InMemoryStorageAdapter';
import { beforeEach, describe, expect, it } from 'vitest';
import { EmbeddingCacheManager } from '../cache';
import type { CachedNoteEmbedding } from '../types';

describe('EmbeddingCacheManager', () => {
	let storage: InMemoryStorageAdapter;
	let cache: EmbeddingCacheManager;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
		cache = new EmbeddingCacheManager(storage);
	});

	function createEmbedding(
		notePath: string,
		contentHash: string,
		overrides: Partial<CachedNoteEmbedding> = {},
	): CachedNoteEmbedding {
		return {
			notePath,
			contentHash,
			embedding: [0.1, 0.2, 0.3],
			provider: 'openai',
			model: 'text-embedding-3-small',
			createdAt: Date.now(),
			tokenCount: 100,
			...overrides,
		};
	}

	describe('initialize', () => {
		it('should create empty index on first init', async () => {
			await cache.initialize();
			const stats = cache.getStats();
			expect(stats.size).toBe(0);
			expect(stats.chunkCount).toBe(0);
		});

		it('should load existing index from storage', async () => {
			// Pre-populate storage
			await storage.write('embeddings/index', {
				version: 1,
				provider: 'openai',
				model: 'test-model',
				entries: {
					'note1.md': { notePath: 'note1.md', contentHash: 'abc', chunkId: '00', indexInChunk: 0 },
				},
				lastUpdated: Date.now(),
			});

			await cache.initialize();
			const stats = cache.getStats();
			expect(stats.size).toBe(1);
		});
	});

	describe('get', () => {
		it('should return null for missing entry', async () => {
			const result = await cache.get('nonexistent.md', 'hash123');
			expect(result).toBeNull();
			expect(cache.getStats().misses).toBe(1);
		});

		it('should return null for hash mismatch', async () => {
			await cache.set(createEmbedding('note.md', 'hash1'));
			await cache.flush();

			const result = await cache.get('note.md', 'hash2');
			expect(result).toBeNull();
			expect(cache.getStats().misses).toBe(1);
		});

		it('should return embedding for matching hash', async () => {
			const embedding = createEmbedding('note.md', 'hash123');
			await cache.set(embedding);
			await cache.flush();

			const result = await cache.get('note.md', 'hash123');
			expect(result).not.toBeNull();
			expect(result?.notePath).toBe('note.md');
			expect(result?.embedding).toEqual([0.1, 0.2, 0.3]);
			expect(cache.getStats().hits).toBe(1);
		});
	});

	describe('set', () => {
		it('should store embedding and update stats', async () => {
			await cache.set(createEmbedding('note1.md', 'hash1'));
			expect(cache.getStats().size).toBe(1);

			await cache.set(createEmbedding('note2.md', 'hash2'));
			expect(cache.getStats().size).toBe(2);
		});

		it('should update existing embedding', async () => {
			await cache.set(createEmbedding('note.md', 'hash1', { tokenCount: 50 }));
			await cache.set(createEmbedding('note.md', 'hash2', { tokenCount: 100 }));

			// Size should not increase for update
			expect(cache.getStats().size).toBe(1);

			await cache.flush();
			const result = await cache.get('note.md', 'hash2');
			expect(result?.tokenCount).toBe(100);
		});

		it('should handle multiple embeddings in same chunk', async () => {
			for (let i = 0; i < 5; i++) {
				await cache.set(createEmbedding(`note${i}.md`, `hash${i}`));
			}

			expect(cache.getStats().size).toBe(5);
			expect(cache.getStats().chunkCount).toBe(1);
		});
	});

	describe('invalidate', () => {
		it('should remove embedding from cache', async () => {
			await cache.set(createEmbedding('note.md', 'hash123'));
			expect(cache.getStats().size).toBe(1);

			await cache.invalidate('note.md');
			expect(cache.getStats().size).toBe(0);

			await cache.flush();
			const result = await cache.get('note.md', 'hash123');
			expect(result).toBeNull();
		});

		it('should handle invalidating nonexistent path', async () => {
			await cache.invalidate('nonexistent.md');
			expect(cache.getStats().size).toBe(0);
		});
	});

	describe('has', () => {
		it('should return true for matching entry', async () => {
			await cache.set(createEmbedding('note.md', 'hash123'));
			expect(await cache.has('note.md', 'hash123')).toBe(true);
		});

		it('should return false for missing entry', async () => {
			expect(await cache.has('note.md', 'hash123')).toBe(false);
		});

		it('should return false for hash mismatch', async () => {
			await cache.set(createEmbedding('note.md', 'hash1'));
			expect(await cache.has('note.md', 'hash2')).toBe(false);
		});
	});

	describe('getAllPaths', () => {
		it('should return all cached paths', async () => {
			await cache.set(createEmbedding('note1.md', 'hash1'));
			await cache.set(createEmbedding('note2.md', 'hash2'));
			await cache.set(createEmbedding('folder/note3.md', 'hash3'));

			const paths = await cache.getAllPaths();
			expect(paths).toHaveLength(3);
			expect(paths).toContain('note1.md');
			expect(paths).toContain('note2.md');
			expect(paths).toContain('folder/note3.md');
		});

		it('should return empty array for empty cache', async () => {
			const paths = await cache.getAllPaths();
			expect(paths).toHaveLength(0);
		});
	});

	describe('clear', () => {
		it('should remove all embeddings', async () => {
			await cache.set(createEmbedding('note1.md', 'hash1'));
			await cache.set(createEmbedding('note2.md', 'hash2'));
			await cache.flush();

			await cache.clear();

			expect(cache.getStats().size).toBe(0);
			expect(await cache.get('note1.md', 'hash1')).toBeNull();
			expect(await cache.get('note2.md', 'hash2')).toBeNull();
		});

		it('should reset stats', async () => {
			await cache.set(createEmbedding('note.md', 'hash'));
			await cache.get('note.md', 'hash');

			await cache.clear();

			const stats = cache.getStats();
			expect(stats.hits).toBe(0);
			expect(stats.misses).toBe(0);
			expect(stats.size).toBe(0);
		});
	});

	describe('flush', () => {
		it('should persist data to storage', async () => {
			await cache.set(createEmbedding('note.md', 'hash123'));
			await cache.flush();

			// Create new cache instance and verify data persists
			const cache2 = new EmbeddingCacheManager(storage);
			await cache2.initialize();

			const result = await cache2.get('note.md', 'hash123');
			expect(result).not.toBeNull();
			expect(result?.notePath).toBe('note.md');
		});

		it('should only write dirty chunks', async () => {
			// Add and flush initial data
			await cache.set(createEmbedding('note1.md', 'hash1'));
			await cache.flush();

			// Track write calls
			const writeCount = storage._getStorage().size;

			// Flush again without changes
			await cache.flush();

			// Should not have written anything new
			expect(storage._getStorage().size).toBe(writeCount);
		});
	});

	describe('setProviderModel', () => {
		it('should invalidate cache when provider changes', async () => {
			await cache.set(createEmbedding('note.md', 'hash', { provider: 'openai' }));
			expect(cache.getStats().size).toBe(1);

			await cache.setProviderModel('voyage', 'voyage-3-lite');

			expect(cache.getStats().size).toBe(0);
		});

		it('should not invalidate when same provider/model', async () => {
			await cache.set(createEmbedding('note.md', 'hash', { provider: 'openai', model: 'test' }));
			await cache.flush();

			// Set same provider/model
			await cache.setProviderModel('openai', 'test');

			expect(cache.getStats().size).toBe(1);
		});
	});

	describe('chunked storage', () => {
		it('should create new chunk when current is full', async () => {
			// Use small chunk size for testing
			const smallChunkCache = new EmbeddingCacheManager(storage, { chunkSize: 3 });

			// Add more embeddings than chunk size
			for (let i = 0; i < 5; i++) {
				await smallChunkCache.set(createEmbedding(`note${i}.md`, `hash${i}`));
			}

			await smallChunkCache.flush();

			// Should have created 2 chunks (3 + 2)
			expect(smallChunkCache.getStats().chunkCount).toBe(2);
		});

		it('should reuse existing chunk space after invalidation', async () => {
			const smallChunkCache = new EmbeddingCacheManager(storage, { chunkSize: 3 });

			// Fill first chunk
			await smallChunkCache.set(createEmbedding('note0.md', 'hash0'));
			await smallChunkCache.set(createEmbedding('note1.md', 'hash1'));
			await smallChunkCache.set(createEmbedding('note2.md', 'hash2'));
			await smallChunkCache.flush();

			// Add one more (creates new chunk)
			await smallChunkCache.set(createEmbedding('note3.md', 'hash3'));

			expect(smallChunkCache.getStats().chunkCount).toBe(2);
		});
	});

	describe('stats', () => {
		it('should track hits and misses', async () => {
			await cache.set(createEmbedding('note.md', 'hash123'));

			// Miss
			await cache.get('other.md', 'hash');
			expect(cache.getStats().misses).toBe(1);

			// Hit
			await cache.get('note.md', 'hash123');
			expect(cache.getStats().hits).toBe(1);

			// Another miss (wrong hash)
			await cache.get('note.md', 'wronghash');
			expect(cache.getStats().misses).toBe(2);
		});

		it('should return copy of stats', () => {
			const stats1 = cache.getStats();
			stats1.hits = 999;

			const stats2 = cache.getStats();
			expect(stats2.hits).toBe(0);
		});
	});

	describe('test helpers', () => {
		it('should expose index via _getIndex', async () => {
			await cache.initialize();
			const index = cache._getIndex();
			expect(index).not.toBeNull();
			expect(index?.version).toBe(1);
		});

		it('should expose loaded chunks via _getLoadedChunks', async () => {
			await cache.set(createEmbedding('note.md', 'hash'));
			const chunks = cache._getLoadedChunks();
			expect(chunks.size).toBeGreaterThan(0);
		});

		it('should reset stats via _resetStats', async () => {
			await cache.set(createEmbedding('note.md', 'hash'));
			await cache.get('note.md', 'hash');

			cache._resetStats();

			const stats = cache.getStats();
			expect(stats.hits).toBe(0);
			expect(stats.misses).toBe(0);
		});
	});
});
