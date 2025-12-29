import { ClusteringPipeline } from '@/domain/clustering/pipeline';
import { toLegacyCluster } from '@/domain/clustering/types';
import { EmbeddingCacheManager } from '@/domain/embedding/cache';
import { EmbeddingOrchestrator } from '@/domain/embedding/embedBatch';
import { runLLMPipeline } from '@/domain/llm/pipeline';
import type { IEmbeddingProvider } from '@/ports/IEmbeddingProvider';
import type { ILLMProvider } from '@/ports/ILLMProvider';
import type { IMetadataProvider, ResolvedLinks } from '@/ports/IMetadataProvider';
import type { IStorageAdapter } from '@/ports/IStorageAdapter';
import type { FileInfo, IVaultProvider } from '@/ports/IVaultProvider';
import { filterExcludedPaths } from './pathFilter';
import {
  CLUSTERING_RESULT_VERSION,
  type PersistedClusteringResult,
  type PipelineProgress,
  type PipelineResult,
  applyLLMResultsToCluster,
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
 * 4. Refining - LLM concept naming and quizzability scoring
 * 5. Saving - Persist results to .recall/clusters.json
 */
export class PipelineOrchestrator {
  constructor(
    private vaultProvider: IVaultProvider,
    private metadataProvider: IMetadataProvider,
    private storageAdapter: IStorageAdapter,
    private embeddingProvider: IEmbeddingProvider,
    private llmProvider: ILLMProvider,
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
        llmStats: {
          conceptsNamed: 0,
          quizzableCount: 0,
          nonQuizzableCount: 0,
          misfitNotesCount: 0,
          tokenUsage: { inputTokens: 0, outputTokens: 0 },
        },
        timing: {
          embeddingMs: 0,
          clusteringMs: 0,
          refiningMs: 0,
          totalMs: Date.now() - totalStartTime,
        },
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

    // Stage 4: LLM Refining
    const refiningStartTime = Date.now();
    this.reportProgress(onProgress, 'refining', 0, 1, 'Naming concepts with LLM...');

    const clustersForLLM = clusteringResult.result.clusters.map(toLegacyCluster);
    const llmResult = await runLLMPipeline({
      clusters: clustersForLLM,
      fileMap: files,
      llmProvider: this.llmProvider,
    });

    this.reportProgress(
      onProgress,
      'refining',
      1,
      1,
      `Named ${llmResult.stats.totalConcepts} concepts`,
    );

    const refiningMs = Date.now() - refiningStartTime;

    // Stage 5: Saving results
    this.reportProgress(onProgress, 'saving', 0, 1, 'Saving results...');

    // Build concept lookup map for merging LLM results
    const conceptMap = new Map(llmResult.concepts.map((c) => [c.clusterId, c]));

    const serializedClusters = clusteringResult.result.clusters.map((cluster) => {
      const base = serializeCluster(cluster);
      const concept = conceptMap.get(cluster.id);
      if (!concept) {
        throw new Error(`No concept found for cluster ${cluster.id}`);
      }
      return applyLLMResultsToCluster(base, concept, llmResult.misfitNotes);
    });

    const persistedResult: PersistedClusteringResult = {
      version: CLUSTERING_RESULT_VERSION,
      timestamp: Date.now(),
      stats: clusteringResult.result.stats,
      clusters: serializedClusters,
      noiseNotes: clusteringResult.result.noiseNotes,
      embeddingProvider: this.embeddingProvider.getProviderName(),
      embeddingModel: this.embeddingProvider.getModelName(),
      llmModel: this.llmProvider.getConfig().model,
      llmTokenUsage: llmResult.stats.tokenUsage,
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
      llmStats: {
        conceptsNamed: llmResult.stats.totalConcepts,
        quizzableCount: llmResult.stats.quizzableConceptCount,
        nonQuizzableCount: llmResult.stats.nonQuizzableConceptCount,
        misfitNotesCount: llmResult.stats.misfitNotesRemoved,
        tokenUsage: llmResult.stats.tokenUsage,
      },
      timing: {
        embeddingMs,
        clusteringMs,
        refiningMs,
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
      // Get metadata first to check word count (avoids reading content for stubs)
      const metadata = await this.metadataProvider.getFileMetadata(file.path);

      // Filter stubs using metadata wordCount
      if (!metadata || metadata.wordCount < STUB_WORD_THRESHOLD) {
        stubCount++;
        continue;
      }

      const content = await this.vaultProvider.readFile(file.path);

      files.set(file.path, file);
      contents.set(file.path, content);
      noteTags.set(file.path, metadata.tags);
    }

    // Get resolved links
    const resolvedLinks = await this.metadataProvider.getResolvedLinks();

    return { files, contents, noteTags, resolvedLinks, stubCount, excludedCount };
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
