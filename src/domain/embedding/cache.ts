import type { IStorageAdapter } from '@/ports/IStorageAdapter';
import type { CachedNoteEmbedding, EmbeddingChunk, EmbeddingIndex } from './types';

/**
 * Configuration for embedding cache
 */
export interface EmbeddingCacheConfig {
	/** Maximum embeddings per chunk */
	chunkSize: number;
	/** Storage key prefix */
	keyPrefix: string;
}

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: EmbeddingCacheConfig = {
	chunkSize: 1000,
	keyPrefix: 'embeddings',
};

/**
 * Cache statistics
 */
export interface CacheStats {
	hits: number;
	misses: number;
	size: number;
	chunkCount: number;
}

/**
 * Current index version for migrations
 */
const INDEX_VERSION = 1;

/**
 * Manager for embedding cache with chunked storage
 */
export class EmbeddingCacheManager {
	private storage: IStorageAdapter;
	private config: EmbeddingCacheConfig;
	private index: EmbeddingIndex | null = null;
	private chunks: Map<string, EmbeddingChunk> = new Map();
	private stats: CacheStats = { hits: 0, misses: 0, size: 0, chunkCount: 0 };
	private dirty: Set<string> = new Set(); // Chunks that need saving

	constructor(storage: IStorageAdapter, config: Partial<EmbeddingCacheConfig> = {}) {
		this.storage = storage;
		this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
	}

	/**
	 * Initialize the cache by loading the index
	 */
	async initialize(): Promise<void> {
		const indexKey = this.getIndexKey();
		const storedIndex = await this.storage.read<EmbeddingIndex>(indexKey);

		if (storedIndex && storedIndex.version === INDEX_VERSION) {
			this.index = storedIndex;
			this.stats.size = Object.keys(storedIndex.entries).length;

			// Count unique chunks
			const chunkIds = new Set(Object.values(storedIndex.entries).map((e) => e.chunkId));
			this.stats.chunkCount = chunkIds.size;
		} else {
			// Create new index
			this.index = this.createEmptyIndex('', '');
		}
	}

	/**
	 * Get a cached embedding by note path and content hash
	 */
	async get(notePath: string, contentHash: string): Promise<CachedNoteEmbedding | null> {
		if (!this.index) {
			await this.initialize();
		}

		const entry = this.index!.entries[notePath];

		// Cache miss: no entry or hash mismatch
		if (!entry || entry.contentHash !== contentHash) {
			this.stats.misses++;
			return null;
		}

		// Load chunk if not in memory
		const chunk = await this.loadChunk(entry.chunkId);
		if (!chunk) {
			this.stats.misses++;
			return null;
		}

		const embedding = chunk.embeddings[entry.indexInChunk];
		if (!embedding || embedding.contentHash !== contentHash) {
			this.stats.misses++;
			return null;
		}

		this.stats.hits++;
		return embedding;
	}

	/**
	 * Store an embedding in the cache
	 */
	async set(embedding: CachedNoteEmbedding): Promise<void> {
		if (!this.index) {
			await this.initialize();
		}

		// Update provider/model if this is first embedding
		if (this.stats.size === 0) {
			this.index!.provider = embedding.provider;
			this.index!.model = embedding.model;
		}

		// Check for existing entry
		const existingEntry = this.index!.entries[embedding.notePath];

		if (existingEntry) {
			// Update existing entry
			const chunk = await this.loadChunk(existingEntry.chunkId);
			if (chunk) {
				chunk.embeddings[existingEntry.indexInChunk] = embedding;
				chunk.lastModified = Date.now();
				this.dirty.add(existingEntry.chunkId);
			}

			// Update index entry hash
			existingEntry.contentHash = embedding.contentHash;
		} else {
			// Find chunk with space or create new one
			const { chunkId, indexInChunk } = await this.findOrCreateChunkSlot();

			const chunk = await this.loadChunk(chunkId);
			if (chunk) {
				chunk.embeddings[indexInChunk] = embedding;
				chunk.lastModified = Date.now();
				this.dirty.add(chunkId);
			}

			// Add index entry
			this.index!.entries[embedding.notePath] = {
				notePath: embedding.notePath,
				contentHash: embedding.contentHash,
				chunkId,
				indexInChunk,
			};

			this.stats.size++;
		}

		this.index!.lastUpdated = Date.now();
	}

	/**
	 * Invalidate (remove) a cached embedding
	 */
	async invalidate(notePath: string): Promise<void> {
		if (!this.index) {
			await this.initialize();
		}

		const entry = this.index!.entries[notePath];
		if (!entry) {
			return;
		}

		// Mark embedding as null in chunk (will be compacted later)
		const chunk = await this.loadChunk(entry.chunkId);
		if (chunk?.embeddings[entry.indexInChunk]) {
			// We don't actually delete, just mark the slot as available
			// by setting it to a tombstone value
			chunk.embeddings[entry.indexInChunk] = null as unknown as CachedNoteEmbedding;
			chunk.lastModified = Date.now();
			this.dirty.add(entry.chunkId);
		}

		// Remove from index
		delete this.index!.entries[notePath];
		this.stats.size--;
		this.index!.lastUpdated = Date.now();
	}

	/**
	 * Flush all dirty chunks to storage
	 */
	async flush(): Promise<void> {
		if (!this.index) {
			return;
		}

		// Save dirty chunks
		for (const chunkId of this.dirty) {
			const chunk = this.chunks.get(chunkId);
			if (chunk) {
				// Filter out null tombstones before saving
				chunk.embeddings = chunk.embeddings.filter((e) => e !== null);
				await this.storage.write(this.getChunkKey(chunkId), chunk);
			}
		}
		this.dirty.clear();

		// Save index
		await this.storage.write(this.getIndexKey(), this.index);
	}

	/**
	 * Get cache statistics
	 */
	getStats(): CacheStats {
		return { ...this.stats };
	}

	/**
	 * Check if cache has a valid embedding for a note
	 */
	async has(notePath: string, contentHash: string): Promise<boolean> {
		if (!this.index) {
			await this.initialize();
		}

		const entry = this.index!.entries[notePath];
		return entry !== undefined && entry.contentHash === contentHash;
	}

	/**
	 * Get all cached note paths
	 */
	async getAllPaths(): Promise<string[]> {
		if (!this.index) {
			await this.initialize();
		}

		return Object.keys(this.index!.entries);
	}

	/**
	 * Clear all cached embeddings
	 */
	async clear(): Promise<void> {
		if (!this.index) {
			await this.initialize();
		}

		// Get all chunk IDs to delete
		const chunkIds = new Set(Object.values(this.index!.entries).map((e) => e.chunkId));

		// Delete all chunks
		for (const chunkId of chunkIds) {
			await this.storage.delete(this.getChunkKey(chunkId));
		}

		// Reset index
		this.index = this.createEmptyIndex(this.index!.provider, this.index!.model);
		await this.storage.write(this.getIndexKey(), this.index);

		// Clear in-memory state
		this.chunks.clear();
		this.dirty.clear();
		this.stats = { hits: 0, misses: 0, size: 0, chunkCount: 0 };
	}

	/**
	 * Update cache for a different provider/model (invalidates all)
	 */
	async setProviderModel(provider: string, model: string): Promise<void> {
		if (!this.index) {
			await this.initialize();
		}

		if (this.index!.provider !== provider || this.index!.model !== model) {
			// Provider/model changed, invalidate all
			await this.clear();
			this.index!.provider = provider;
			this.index!.model = model;
		}
	}

	// ============ Private Methods ============

	private getIndexKey(): string {
		return `${this.config.keyPrefix}/index`;
	}

	private getChunkKey(chunkId: string): string {
		return `${this.config.keyPrefix}/chunk-${chunkId}`;
	}

	private createEmptyIndex(provider: string, model: string): EmbeddingIndex {
		return {
			version: INDEX_VERSION,
			provider,
			model,
			entries: {},
			lastUpdated: Date.now(),
		};
	}

	private async loadChunk(chunkId: string): Promise<EmbeddingChunk | null> {
		// Check in-memory cache
		if (this.chunks.has(chunkId)) {
			return this.chunks.get(chunkId)!;
		}

		// Load from storage
		const chunk = await this.storage.read<EmbeddingChunk>(this.getChunkKey(chunkId));
		if (chunk) {
			this.chunks.set(chunkId, chunk);
		}

		return chunk;
	}

	private async findOrCreateChunkSlot(): Promise<{ chunkId: string; indexInChunk: number }> {
		// Find existing chunk with space
		const chunkIds = new Set(Object.values(this.index!.entries).map((e) => e.chunkId));

		for (const chunkId of chunkIds) {
			const chunk = await this.loadChunk(chunkId);
			if (chunk && chunk.embeddings.length < this.config.chunkSize) {
				return { chunkId, indexInChunk: chunk.embeddings.length };
			}
		}

		// Create new chunk
		const newChunkId = this.generateChunkId();
		const newChunk: EmbeddingChunk = {
			id: newChunkId,
			embeddings: [],
			createdAt: Date.now(),
			lastModified: Date.now(),
		};

		this.chunks.set(newChunkId, newChunk);
		this.dirty.add(newChunkId);
		this.stats.chunkCount++;

		return { chunkId: newChunkId, indexInChunk: 0 };
	}

	private generateChunkId(): string {
		// Simple incrementing chunk ID
		const existingIds = new Set(Object.values(this.index!.entries).map((e) => e.chunkId));
		let id = 0;
		while (existingIds.has(id.toString().padStart(2, '0'))) {
			id++;
		}
		return id.toString().padStart(2, '0');
	}

	// ============ Test Helpers ============

	/**
	 * Get the current index (for testing)
	 */
	_getIndex(): EmbeddingIndex | null {
		return this.index;
	}

	/**
	 * Get loaded chunks (for testing)
	 */
	_getLoadedChunks(): Map<string, EmbeddingChunk> {
		return new Map(this.chunks);
	}

	/**
	 * Reset stats (for testing)
	 */
	_resetStats(): void {
		this.stats = { hits: 0, misses: 0, size: 0, chunkCount: 0 };
	}
}
