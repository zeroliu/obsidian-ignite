import type { IEmbeddingProvider } from '@/ports/IEmbeddingProvider';
import type { EmbeddingCacheManager } from './cache';
import { generateContentHash, prepareTextForEmbedding } from './prepareText';
import type { EmbeddedNote, EmbeddingStats, PreparedNote, TextPrepareConfig } from './types';
import { DEFAULT_TEXT_PREPARE_CONFIG } from './types';

/**
 * Input for embedding a note
 */
export interface NoteForEmbedding {
	/** Path to the note */
	notePath: string;
	/** Raw content of the note */
	content: string;
}

/**
 * Progress callback for embedding operations
 */
export type EmbeddingProgressCallback = (completed: number, total: number) => void;

/**
 * Configuration for embedding orchestrator
 */
export interface EmbeddingOrchestratorConfig {
	/** Text preparation config */
	textPrepare: TextPrepareConfig;
	/** Whether to use cache */
	useCache: boolean;
}

/**
 * Default orchestrator configuration
 */
export const DEFAULT_ORCHESTRATOR_CONFIG: EmbeddingOrchestratorConfig = {
	textPrepare: DEFAULT_TEXT_PREPARE_CONFIG,
	useCache: true,
};

/**
 * Result of embedding operation
 */
export interface EmbeddingResult {
	/** Embedded notes */
	notes: EmbeddedNote[];
	/** Statistics */
	stats: EmbeddingStats;
}

/**
 * Orchestrates embedding operations with caching and progress reporting
 */
export class EmbeddingOrchestrator {
	private provider: IEmbeddingProvider;
	private cache: EmbeddingCacheManager | null;
	private config: EmbeddingOrchestratorConfig;

	constructor(
		provider: IEmbeddingProvider,
		cache: EmbeddingCacheManager | null = null,
		config: Partial<EmbeddingOrchestratorConfig> = {},
	) {
		this.provider = provider;
		this.cache = cache;
		this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
	}

	/**
	 * Embed a batch of notes
	 * Uses cache when available to skip already-embedded notes
	 */
	async embedNotes(
		notes: NoteForEmbedding[],
		onProgress?: EmbeddingProgressCallback,
	): Promise<EmbeddingResult> {
		const stats: EmbeddingStats = {
			cacheHits: 0,
			cacheMisses: 0,
			tokensProcessed: 0,
			estimatedCost: 0,
			apiCalls: 0,
			notesProcessed: notes.length,
		};

		// Prepare all notes
		const preparedNotes = notes.map((note) => this.prepareNote(note));

		// Check cache for existing embeddings
		const toEmbed: PreparedNote[] = [];
		const results: EmbeddedNote[] = [];

		if (this.cache && this.config.useCache) {
			await this.cache.initialize();

			for (const note of preparedNotes) {
				const cached = await this.cache.get(note.notePath, note.contentHash);
				if (cached) {
					stats.cacheHits++;
					results.push({
						notePath: note.notePath,
						embedding: cached.embedding,
						contentHash: cached.contentHash,
						tokenCount: cached.tokenCount,
						fromCache: true,
					});
				} else {
					stats.cacheMisses++;
					toEmbed.push(note);
				}
			}
		} else {
			// No cache - embed all
			toEmbed.push(...preparedNotes);
			stats.cacheMisses = notes.length;
		}

		// Report initial progress (cache hits)
		if (onProgress) {
			onProgress(stats.cacheHits, notes.length);
		}

		// Embed notes that weren't in cache
		if (toEmbed.length > 0) {
			const embedResult = await this.provider.embedBatch(
				toEmbed.map((note) => ({
					notePath: note.notePath,
					text: note.preparedText,
				})),
			);

			stats.tokensProcessed = embedResult.totalTokens;
			stats.estimatedCost = embedResult.usage.estimatedCost;
			stats.apiCalls = embedResult.usage.apiCalls;

			// Store in cache and collect results
			for (const embeddingResult of embedResult.embeddings) {
				const preparedNote = toEmbed.find((n) => n.notePath === embeddingResult.notePath);
				if (!preparedNote) continue;

				const embeddedNote: EmbeddedNote = {
					notePath: embeddingResult.notePath,
					embedding: embeddingResult.embedding,
					contentHash: preparedNote.contentHash,
					tokenCount: embeddingResult.tokenCount,
					fromCache: false,
				};

				results.push(embeddedNote);

				// Store in cache
				if (this.cache && this.config.useCache) {
					await this.cache.set({
						notePath: embeddingResult.notePath,
						contentHash: preparedNote.contentHash,
						embedding: embeddingResult.embedding,
						provider: this.provider.getProviderName(),
						model: this.provider.getModelName(),
						createdAt: Date.now(),
						tokenCount: embeddingResult.tokenCount,
					});
				}
			}

			// Flush cache
			if (this.cache && this.config.useCache) {
				await this.cache.flush();
			}
		}

		// Report final progress
		if (onProgress) {
			onProgress(notes.length, notes.length);
		}

		return { notes: results, stats };
	}

	/**
	 * Embed a single note
	 */
	async embedNote(note: NoteForEmbedding): Promise<EmbeddedNote> {
		const result = await this.embedNotes([note]);
		return result.notes[0];
	}

	/**
	 * Check which notes need embedding (not in cache or content changed)
	 */
	async getNotesToEmbed(notes: NoteForEmbedding[]): Promise<NoteForEmbedding[]> {
		if (!this.cache || !this.config.useCache) {
			return notes;
		}

		await this.cache.initialize();

		const toEmbed: NoteForEmbedding[] = [];

		for (const note of notes) {
			const contentHash = generateContentHash(note.content);
			const hasValid = await this.cache.has(note.notePath, contentHash);
			if (!hasValid) {
				toEmbed.push(note);
			}
		}

		return toEmbed;
	}

	/**
	 * Invalidate cached embeddings for notes
	 */
	async invalidateNotes(notePaths: string[]): Promise<void> {
		if (!this.cache) return;

		await this.cache.initialize();

		for (const path of notePaths) {
			await this.cache.invalidate(path);
		}

		await this.cache.flush();
	}

	/**
	 * Get the underlying provider
	 */
	getProvider(): IEmbeddingProvider {
		return this.provider;
	}

	/**
	 * Get the underlying cache
	 */
	getCache(): EmbeddingCacheManager | null {
		return this.cache;
	}

	// ============ Private Methods ============

	private prepareNote(note: NoteForEmbedding): PreparedNote {
		const preparedText = prepareTextForEmbedding(note.content, this.config.textPrepare);
		const contentHash = generateContentHash(note.content);
		const estimatedTokens = this.provider.estimateTokens(preparedText);

		return {
			notePath: note.notePath,
			originalContent: note.content,
			preparedText,
			contentHash,
			estimatedTokens,
			wasTruncated: preparedText.includes('[content truncated]'),
		};
	}
}
