import { ClusteringPipeline } from '@/domain/clustering/pipeline';
import { EmbeddingCacheManager } from '@/domain/embedding/cache';
import { EmbeddingOrchestrator } from '@/domain/embedding/embedBatch';
import type { IEmbeddingProvider } from '@/ports/IEmbeddingProvider';
import type { IMetadataProvider, ResolvedLinks } from '@/ports/IMetadataProvider';
import type { IStorageAdapter } from '@/ports/IStorageAdapter';
import type { FileInfo, IVaultProvider } from '@/ports/IVaultProvider';
import { filterExcludedPaths } from './pathFilter';
import {
  CLUSTERING_RESULT_VERSION,
  type PersistedClusteringResult,
  type PipelineProgress,
  type PipelineResult,
  serializeCluster,
} from './types';

/**
 * Minimum word count threshold for non-stub notes.
 * Notes with fewer words than this are considered stubs.
 */
const STUB_WORD_THRESHOLD = 50;

/**
 * Storage key for persisted clustering results
 */
const CLUSTERS_STORAGE_KEY = 'clusters';

/**
 * Orchestrates the full BERTopic pipeline within the Obsidian plugin context
 *
 * Pipeline stages:
 * 1. Reading - Scan vault for markdown files
 * 2. Embedding - Generate embeddings for notes (with caching)
 * 3. Clustering - UMAP dimensionality reduction + HDBSCAN clustering
 * 4. Saving - Persist results to .recall/clusters.json
 */
export class PipelineOrchestrator {
  constructor(
    private vaultProvider: IVaultProvider,
    private metadataProvider: IMetadataProvider,
    private storageAdapter: IStorageAdapter,
    private embeddingProvider: IEmbeddingProvider,
    private excludePatterns: string[] = [],
  ) {}

  /**
   * Run the full pipeline
   *
   * @param onProgress - Optional callback for progress updates
   * @returns Pipeline result with statistics
   */
  async run(onProgress?: (progress: PipelineProgress) => void): Promise<PipelineResult> {
    const totalStartTime = Date.now();

    // Stage 1: Reading vault
    this.reportProgress(onProgress, 'reading', 0, 1, 'Reading vault notes...');

    const { files, contents, noteTags, resolvedLinks, stubCount, excludedCount } =
      await this.readVault();

    const noteCount = files.size;
    this.reportProgress(
      onProgress,
      'reading',
      1,
      1,
      `Found ${noteCount} notes (${stubCount} stubs, ${excludedCount} excluded)`,
    );

    if (noteCount === 0) {
      return {
        clusterCount: 0,
        totalNotes: 0,
        noiseCount: 0,
        excludedCount,
        embeddingStats: { cacheHits: 0, cacheMisses: 0, tokensProcessed: 0, estimatedCost: 0 },
        timing: { embeddingMs: 0, clusteringMs: 0, totalMs: Date.now() - totalStartTime },
      };
    }

    // Stage 2: Embedding
    const embeddingStartTime = Date.now();
    this.reportProgress(onProgress, 'embedding', 0, noteCount, 'Initializing embedding cache...');

    const cache = new EmbeddingCacheManager(this.storageAdapter);
    await cache.initialize();
    await cache.setProviderModel(
      this.embeddingProvider.getProviderName(),
      this.embeddingProvider.getModelName(),
    );

    const orchestrator = new EmbeddingOrchestrator(this.embeddingProvider, cache, {
      useCache: true,
    });

    const notesToEmbed = Array.from(contents.entries()).map(([path, content]) => ({
      notePath: path,
      content,
    }));

    const embeddingResult = await orchestrator.embedNotes(notesToEmbed, (completed, total) => {
      this.reportProgress(
        onProgress,
        'embedding',
        completed,
        total,
        `Embedding notes: ${completed}/${total}`,
      );
    });

    await cache.flush();
    const embeddingMs = Date.now() - embeddingStartTime;

    // Stage 3: Clustering
    const clusteringStartTime = Date.now();
    this.reportProgress(onProgress, 'clustering', 0, 1, 'Running UMAP + HDBSCAN...');

    const pipeline = new ClusteringPipeline();
    const clusteringResult = await pipeline.run({
      embeddedNotes: embeddingResult.notes,
      noteTags,
      resolvedLinks,
      files,
      previousState: null,
    });

    const clusteringMs = Date.now() - clusteringStartTime;
    this.reportProgress(
      onProgress,
      'clustering',
      1,
      1,
      `Found ${clusteringResult.result.clusters.length} clusters`,
    );

    // Stage 4: Saving results
    this.reportProgress(onProgress, 'saving', 0, 1, 'Saving results...');

    const persistedResult: PersistedClusteringResult = {
      version: CLUSTERING_RESULT_VERSION,
      timestamp: Date.now(),
      stats: clusteringResult.result.stats,
      clusters: clusteringResult.result.clusters.map(serializeCluster),
      noiseNotes: clusteringResult.result.noiseNotes,
      embeddingProvider: this.embeddingProvider.getProviderName(),
      embeddingModel: this.embeddingProvider.getModelName(),
    };

    await this.storageAdapter.write(CLUSTERS_STORAGE_KEY, persistedResult);

    this.reportProgress(onProgress, 'saving', 1, 1, 'Results saved');

    return {
      clusterCount: clusteringResult.result.clusters.length,
      totalNotes: noteCount,
      noiseCount: clusteringResult.result.noiseNotes.length,
      excludedCount,
      embeddingStats: {
        cacheHits: embeddingResult.stats.cacheHits,
        cacheMisses: embeddingResult.stats.cacheMisses,
        tokensProcessed: embeddingResult.stats.tokensProcessed,
        estimatedCost: embeddingResult.stats.estimatedCost,
      },
      timing: {
        embeddingMs,
        clusteringMs,
        totalMs: Date.now() - totalStartTime,
      },
    };
  }

  /**
   * Load previously saved clustering results
   */
  async loadPersistedClusters(): Promise<PersistedClusteringResult | null> {
    return this.storageAdapter.read<PersistedClusteringResult>(CLUSTERS_STORAGE_KEY);
  }

  /**
   * Read vault and prepare data for pipeline
   */
  private async readVault(): Promise<{
    files: Map<string, FileInfo>;
    contents: Map<string, string>;
    noteTags: Map<string, string[]>;
    resolvedLinks: ResolvedLinks;
    stubCount: number;
    excludedCount: number;
  }> {
    const allFiles = await this.vaultProvider.listMarkdownFiles();

    // Filter excluded paths FIRST (before any other processing)
    const { included: nonExcludedFiles, excludedCount } = filterExcludedPaths(
      allFiles,
      this.excludePatterns,
    );

    const files = new Map<string, FileInfo>();
    const contents = new Map<string, string>();
    const noteTags = new Map<string, string[]>();
    let stubCount = 0;

    for (const file of nonExcludedFiles) {
      const content = await this.vaultProvider.readFile(file.path);

      // Filter stubs
      if (this.isStubNote(content)) {
        stubCount++;
        continue;
      }

      files.set(file.path, file);
      contents.set(file.path, content);

      // Get tags from metadata cache
      const metadata = await this.metadataProvider.getFileMetadata(file.path);
      if (metadata) {
        noteTags.set(file.path, metadata.tags);
      } else {
        noteTags.set(file.path, []);
      }
    }

    // Get resolved links
    const resolvedLinks = await this.metadataProvider.getResolvedLinks();

    return { files, contents, noteTags, resolvedLinks, stubCount, excludedCount };
  }

  /**
   * Check if a note is a stub (has too few words)
   */
  private isStubNote(content: string): boolean {
    // Remove frontmatter and code blocks
    const withoutFrontmatter = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    const withoutCode = withoutFrontmatter.replace(/```[\s\S]*?```/g, '');
    const words = withoutCode.split(/\s+/).filter((w) => w.length > 0);
    return words.length < STUB_WORD_THRESHOLD;
  }

  /**
   * Report progress to callback
   */
  private reportProgress(
    onProgress: ((progress: PipelineProgress) => void) | undefined,
    stage: PipelineProgress['stage'],
    current: number,
    total: number,
    message: string,
  ): void {
    if (onProgress) {
      onProgress({ stage, current, total, message });
    }
  }
}
