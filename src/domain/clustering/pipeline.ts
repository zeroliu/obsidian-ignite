import type { EmbeddedNote } from '@/domain/embedding/types';
import type { ResolvedLinks } from '@/ports/IMetadataProvider';
import type { FileInfo } from '@/ports/IVaultProvider';
import { computeCentroid, selectRepresentatives } from './centroidCalculator';
import { HDBSCANClusterer } from './hdbscanClusterer';
import { applyIncrementalUpdate, detectChanges, updateClusteringState } from './incrementalUpdater';
import { reassignNoiseNotes } from './noiseReassigner';
import {
  type ClusteringConfig,
  type ClusteringResult,
  type ClusteringState,
  DEFAULT_CLUSTERING_CONFIG,
  type EmbeddingCluster,
  generateEmbeddingClusterId,
} from './types';
import { UMAPReducer } from './umapReducer';

/**
 * Input for the clustering pipeline
 */
export interface PipelineInput {
  /** Embedded notes with their vectors */
  embeddedNotes: EmbeddedNote[];
  /** Tags for each note (path -> tags) */
  noteTags: Map<string, string[]>;
  /** Resolved links for link density calculation */
  resolvedLinks: ResolvedLinks;
  /** File info for each note */
  files: Map<string, FileInfo>;
  /** Previous clustering state for incremental updates */
  previousState: ClusteringState | null;
  /** Configuration */
  config?: Partial<ClusteringConfig>;
}

/**
 * Result of the clustering pipeline
 */
export interface PipelineResult {
  /** Clustering result with clusters and stats */
  result: ClusteringResult;
  /** Updated clustering state for future runs */
  state: ClusteringState;
}

/**
 * Embedding-based clustering pipeline
 *
 * Orchestrates the full clustering flow:
 * 1. UMAP dimensionality reduction
 * 2. HDBSCAN clustering
 * 3. Centroid and representative computation
 * 4. Cluster metadata population
 *
 * Supports both full and incremental modes based on change detection.
 */
export class ClusteringPipeline {
  private config: ClusteringConfig;
  private umapReducer: UMAPReducer;
  private hdbscanClusterer: HDBSCANClusterer;

  constructor(config: Partial<ClusteringConfig> = {}) {
    this.config = { ...DEFAULT_CLUSTERING_CONFIG, ...config };
    this.umapReducer = new UMAPReducer(this.config.umap);
    this.hdbscanClusterer = new HDBSCANClusterer(this.config.hdbscan);
  }

  /**
   * Run the clustering pipeline
   *
   * @param input - Pipeline input with embedded notes and metadata
   * @returns Clustering result and updated state
   */
  async run(input: PipelineInput): Promise<PipelineResult> {
    const config = { ...this.config, ...input.config };

    // Check if we have enough notes
    if (input.embeddedNotes.length < config.minNotesForClustering) {
      return this.handleTooFewNotes(input.embeddedNotes);
    }

    // Build note hash map for change detection
    const noteHashes = new Map<string, string>();
    for (const note of input.embeddedNotes) {
      noteHashes.set(note.notePath, note.contentHash);
    }

    // Detect changes to decide on full vs incremental
    const changes = detectChanges(noteHashes, input.previousState, config.incrementalThreshold);

    if (changes.shouldUseIncremental && input.previousState) {
      return this.runIncremental(input, changes, noteHashes, config);
    }

    return this.runFull(input, noteHashes, config);
  }

  /**
   * Run full clustering (UMAP → HDBSCAN → build clusters → optional noise reassignment)
   */
  private async runFull(
    input: PipelineInput,
    noteHashes: Map<string, string>,
    config: ClusteringConfig,
  ): Promise<PipelineResult> {
    // Prepare embeddings for UMAP
    const embeddings = input.embeddedNotes.map((note) => ({
      notePath: note.notePath,
      embedding: note.embedding,
    }));

    // Step 1: UMAP dimensionality reduction
    const { reducedEmbeddings, notePaths } = await this.umapReducer.fit(embeddings);

    // Step 2: HDBSCAN clustering
    const hdbscanResult = this.hdbscanClusterer.cluster(reducedEmbeddings);

    // Step 3: Compute centroids and representatives
    // Use ORIGINAL embeddings for centroids (high-dimensional for semantic similarity)
    const originalEmbeddingMap = new Map<string, number[]>();
    for (const note of input.embeddedNotes) {
      originalEmbeddingMap.set(note.notePath, note.embedding);
    }

    // Step 4: Build clusters
    let clusters = this.buildClusters(
      notePaths,
      hdbscanResult.labels,
      originalEmbeddingMap,
      input.noteTags,
      input.resolvedLinks,
      config,
    );

    // Collect noise notes
    let noiseNotes = hdbscanResult.noiseIndices.map((i) => notePaths[i]);
    const originalNoiseCount = noiseNotes.length;
    let reassignedCount = 0;

    // Step 5: Noise reassignment (always runs)
    if (clusters.length > 0 && noiseNotes.length > 0) {
      const reassignResult = reassignNoiseNotes(
        clusters,
        noiseNotes,
        originalEmbeddingMap,
        config.noiseReassign.threshold,
      );
      clusters = reassignResult.clusters;
      noiseNotes = reassignResult.remainingNoise;
      reassignedCount = reassignResult.reassignedCount;
    }

    // Step 6: Calculate representative notes and candidate names (after noise reassignment)
    clusters = this.computeRepresentativeNotes(clusters, originalEmbeddingMap, config, input.files);

    // Build state for future incremental updates
    const state = updateClusteringState(noteHashes, clusters);

    return {
      result: {
        clusters,
        noiseNotes,
        stats: {
          totalNotes: input.embeddedNotes.length,
          clusterCount: clusters.length,
          noiseCount: noiseNotes.length,
          wasIncremental: false,
          reassignment: {
            originalNoiseCount,
            reassignedCount,
          },
        },
      },
      state,
    };
  }

  /**
   * Run incremental update (assign new notes to existing clusters)
   */
  private async runIncremental(
    input: PipelineInput,
    changes: ReturnType<typeof detectChanges>,
    noteHashes: Map<string, string>,
    config: ClusteringConfig,
  ): Promise<PipelineResult> {
    if (!input.previousState) {
      throw new Error('Cannot run incremental without previous state');
    }

    // Get embeddings for new and modified notes (in original high-dim space)
    const changedPaths = new Set([...changes.newNotes, ...changes.modifiedNotes]);
    const changedEmbeddings = input.embeddedNotes
      .filter((note) => changedPaths.has(note.notePath))
      .map((note) => ({
        notePath: note.notePath,
        embedding: note.embedding,
      }));

    // Use clusters from previous state (centroids are in original embedding space)
    const previousClusters = input.previousState.clusters;

    // Apply incremental updates using cosine similarity on original embeddings
    const updateResult = applyIncrementalUpdate(
      previousClusters,
      changes,
      changedEmbeddings,
      config.minAssignmentSimilarity,
    );

    // Update state with new clusters
    const state = updateClusteringState(noteHashes, updateResult.clusters);

    return {
      result: {
        clusters: updateResult.clusters,
        noiseNotes: updateResult.unassignedNotes,
        stats: {
          totalNotes: input.embeddedNotes.length,
          clusterCount: updateResult.clusters.length,
          noiseCount: updateResult.unassignedNotes.length,
          wasIncremental: true,
        },
      },
      state,
    };
  }

  /**
   * Build EmbeddingCluster objects from clustering results
   */
  private buildClusters(
    notePaths: string[],
    labels: number[],
    embeddingMap: Map<string, number[]>,
    noteTags: Map<string, string[]>,
    resolvedLinks: ResolvedLinks,
    config: ClusteringConfig,
  ): EmbeddingCluster[] {
    // Group notes by cluster label
    const clusterNotes = new Map<number, string[]>();
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      if (label === -1) continue; // Skip noise

      const notes = clusterNotes.get(label);
      if (notes) {
        notes.push(notePaths[i]);
      } else {
        clusterNotes.set(label, [notePaths[i]]);
      }
    }

    const clusters: EmbeddingCluster[] = [];

    for (const [label, noteIds] of clusterNotes.entries()) {
      // Get embeddings for this cluster
      const clusterEmbeddings: number[][] = [];
      for (const noteId of noteIds) {
        const embedding = embeddingMap.get(noteId);
        if (embedding) {
          clusterEmbeddings.push(embedding);
        }
      }

      if (clusterEmbeddings.length === 0) continue;

      // Compute centroid
      const centroid = computeCentroid(clusterEmbeddings);

      // Calculate dominant tags
      const dominantTags = this.calculateDominantTags(
        noteIds,
        noteTags,
        config.dominantTagThreshold,
      );

      // Calculate most common folder
      const folderPath = this.calculateCommonFolder(noteIds);

      // Calculate link density
      const internalLinkDensity = this.calculateLinkDensity(noteIds, resolvedLinks);

      clusters.push({
        id: generateEmbeddingClusterId(),
        candidateNames: [], // Will be populated after representative notes are computed
        noteIds,
        dominantTags,
        folderPath,
        internalLinkDensity,
        createdAt: Date.now(),
        reasons: [`Embedding-based cluster (label: ${label})`],
        centroid,
        representativeNotes: [], // Will be computed after noise reassignment
      });
    }

    return clusters;
  }

  /**
   * Extract candidate names from representative note titles
   */
  private extractCandidateNames(
    representativeNotes: string[],
    files: Map<string, FileInfo>,
  ): string[] {
    const names: string[] = [];

    for (const notePath of representativeNotes) {
      const file = files.get(notePath);
      if (file) {
        // Extract meaningful words from basename
        const words = file.basename
          .replace(/[-_]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 2);
        names.push(...words.slice(0, 3));
      }
    }

    // Return unique names, limited to 10
    return [...new Set(names)].slice(0, 10);
  }

  /**
   * Calculate dominant tags for a cluster
   */
  private calculateDominantTags(
    noteIds: string[],
    noteTags: Map<string, string[]>,
    threshold: number,
  ): string[] {
    const tagCounts = new Map<string, number>();

    for (const noteId of noteIds) {
      const tags = noteTags.get(noteId) || [];
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    const minCount = Math.max(1, Math.floor(noteIds.length * threshold));
    const dominantTags: string[] = [];

    for (const [tag, count] of tagCounts.entries()) {
      if (count >= minCount) {
        dominantTags.push(tag);
      }
    }

    // Sort by frequency
    dominantTags.sort((a, b) => (tagCounts.get(b) || 0) - (tagCounts.get(a) || 0));

    return dominantTags.slice(0, 10);
  }

  /**
   * Calculate most common folder path
   */
  private calculateCommonFolder(noteIds: string[]): string {
    const folderCounts = new Map<string, number>();

    for (const noteId of noteIds) {
      const parts = noteId.split('/');
      if (parts.length > 1) {
        const folder = parts.slice(0, -1).join('/');
        folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1);
      }
    }

    let maxFolder = '';
    let maxCount = 0;

    for (const [folder, count] of folderCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        maxFolder = folder;
      }
    }

    return maxFolder;
  }

  /**
   * Calculate internal link density for a cluster
   */
  private calculateLinkDensity(noteIds: string[], resolvedLinks: ResolvedLinks): number {
    if (noteIds.length < 2) {
      return 0;
    }

    const noteSet = new Set(noteIds);
    let internalLinks = 0;

    for (const noteId of noteIds) {
      const targets = resolvedLinks[noteId];
      if (!targets) continue;

      for (const target of Object.keys(targets)) {
        if (noteSet.has(target)) {
          internalLinks += targets[target];
        }
      }
    }

    // Possible links in a directed graph: n * (n - 1)
    const possibleLinks = noteIds.length * (noteIds.length - 1);
    if (possibleLinks === 0) return 0;

    return Math.min(1, internalLinks / possibleLinks);
  }

  /**
   * Compute representative notes and candidate names for all clusters
   * Called after noise reassignment to ensure final cluster membership is used
   */
  private computeRepresentativeNotes(
    clusters: EmbeddingCluster[],
    embeddingMap: Map<string, number[]>,
    config: ClusteringConfig,
    files: Map<string, FileInfo>,
  ): EmbeddingCluster[] {
    return clusters.map((cluster) => {
      // Build embeddings with indices for selectRepresentatives
      const clusterEmbeddings: Array<{ index: number; embedding: number[] }> = [];
      for (let i = 0; i < cluster.noteIds.length; i++) {
        const embedding = embeddingMap.get(cluster.noteIds[i]);
        if (embedding) {
          clusterEmbeddings.push({ index: i, embedding });
        }
      }

      if (clusterEmbeddings.length === 0) {
        return cluster;
      }

      // Recompute centroid based on final membership
      const centroid = computeCentroid(clusterEmbeddings.map((e) => e.embedding));

      // Select representative notes
      const representativeIndices = selectRepresentatives(
        clusterEmbeddings,
        centroid,
        config.representativeCount,
      );
      const representativeNotes = representativeIndices.map((i) => cluster.noteIds[i]);

      // Extract candidate names from representative notes
      const candidateNames = this.extractCandidateNames(representativeNotes, files);

      return {
        ...cluster,
        centroid,
        representativeNotes,
        candidateNames,
      };
    });
  }

  /**
   * Handle case with too few notes for clustering
   */
  private handleTooFewNotes(embeddedNotes: EmbeddedNote[]): PipelineResult {
    // Put all notes in noise
    return {
      result: {
        clusters: [],
        noiseNotes: embeddedNotes.map((n) => n.notePath),
        stats: {
          totalNotes: embeddedNotes.length,
          clusterCount: 0,
          noiseCount: embeddedNotes.length,
          wasIncremental: false,
        },
      },
      state: {
        clusters: [],
        centroids: new Map(),
        lastFullClusteringAt: Date.now(),
        noteHashes: new Map(),
      },
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): ClusteringConfig {
    return { ...this.config };
  }
}

/**
 * Convenience function to run clustering in one call
 */
export async function runClusteringPipeline(input: PipelineInput): Promise<PipelineResult> {
  const pipeline = new ClusteringPipeline(input.config);
  return pipeline.run(input);
}
