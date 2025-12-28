// Types
export type {
	CachedNoteEmbedding,
	EmbeddedNote,
	EmbeddingChunk,
	EmbeddingIndex,
	EmbeddingIndexEntry,
	EmbeddingStats,
	PreparedNote,
	TextPrepareConfig,
} from './types';
export { DEFAULT_TEXT_PREPARE_CONFIG } from './types';

// Text preparation
export {
	estimateTokens,
	generateContentHash,
	hashString,
	normalizeWhitespace,
	prepareTextForEmbedding,
	stripFrontmatter,
	stripImages,
	summarizeCodeBlocks,
	truncateToTokenLimit,
} from './prepareText';

// Cache
export type { CacheStats, EmbeddingCacheConfig } from './cache';
export { DEFAULT_CACHE_CONFIG, EmbeddingCacheManager } from './cache';

// Batch embedding
export type {
	EmbeddingOrchestratorConfig,
	EmbeddingProgressCallback,
	EmbeddingResult,
	NoteForEmbedding,
} from './embedBatch';
export { DEFAULT_ORCHESTRATOR_CONFIG, EmbeddingOrchestrator } from './embedBatch';
