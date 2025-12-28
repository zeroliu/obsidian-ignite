/**
 * Cached embedding for a note
 */
export interface CachedNoteEmbedding {
	/** Path to the note */
	notePath: string;
	/** Hash of the note content for change detection */
	contentHash: string;
	/** The embedding vector */
	embedding: number[];
	/** Embedding provider name (e.g., 'openai', 'voyage') */
	provider: string;
	/** Model used for embedding */
	model: string;
	/** Timestamp when embedding was created */
	createdAt: number;
	/** Number of tokens in the input text */
	tokenCount: number;
}

/**
 * Index entry for a cached embedding
 */
export interface EmbeddingIndexEntry {
	/** Path to the note */
	notePath: string;
	/** Hash of the note content */
	contentHash: string;
	/** ID of the chunk containing the embedding */
	chunkId: string;
	/** Index within the chunk */
	indexInChunk: number;
}

/**
 * Index for chunked embedding storage
 */
export interface EmbeddingIndex {
	/** Schema version for migrations */
	version: number;
	/** Embedding provider name */
	provider: string;
	/** Model used for embeddings */
	model: string;
	/** Map of note path to index entry */
	entries: Record<string, EmbeddingIndexEntry>;
	/** Timestamp of last update */
	lastUpdated: number;
}

/**
 * A chunk of cached embeddings
 */
export interface EmbeddingChunk {
	/** Chunk ID */
	id: string;
	/** Embeddings in this chunk */
	embeddings: CachedNoteEmbedding[];
	/** Timestamp when chunk was created */
	createdAt: number;
	/** Timestamp when chunk was last modified */
	lastModified: number;
}

/**
 * Configuration for text preparation
 */
export interface TextPrepareConfig {
	/** Maximum tokens before truncation (e.g., 8191 for OpenAI) */
	maxTokens: number;
	/** Whether to strip YAML frontmatter */
	stripFrontmatter: boolean;
	/** Whether to summarize code blocks (```code``` → [code: lang]) */
	summarizeCode: boolean;
	/** Whether to strip images (![alt](url) → [image: alt]) */
	stripImages: boolean;
}

/**
 * Default configuration for text preparation
 */
export const DEFAULT_TEXT_PREPARE_CONFIG: TextPrepareConfig = {
	maxTokens: 8191,
	stripFrontmatter: true,
	summarizeCode: true,
	stripImages: true,
};

/**
 * Note prepared for embedding
 */
export interface PreparedNote {
	/** Path to the note */
	notePath: string;
	/** Original content */
	originalContent: string;
	/** Prepared text for embedding */
	preparedText: string;
	/** Content hash for caching */
	contentHash: string;
	/** Estimated token count */
	estimatedTokens: number;
	/** Whether text was truncated */
	wasTruncated: boolean;
}

/**
 * Note with embedding
 */
export interface EmbeddedNote {
	/** Path to the note */
	notePath: string;
	/** The embedding vector */
	embedding: number[];
	/** Content hash */
	contentHash: string;
	/** Token count */
	tokenCount: number;
	/** Whether this was retrieved from cache */
	fromCache: boolean;
}

/**
 * Statistics for embedding operations
 */
export interface EmbeddingStats {
	/** Number of cache hits */
	cacheHits: number;
	/** Number of cache misses */
	cacheMisses: number;
	/** Total tokens processed (new embeddings only) */
	tokensProcessed: number;
	/** Estimated cost in USD */
	estimatedCost: number;
	/** Number of API calls made */
	apiCalls: number;
	/** Total notes processed */
	notesProcessed: number;
}
