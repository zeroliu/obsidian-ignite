/**
 * A cluster of related notes
 */
export interface Cluster {
  /** Unique identifier for the cluster */
  id: string;
  /** Candidate names for this cluster (for LLM naming) */
  candidateNames: string[];
  /** File paths of notes in this cluster */
  noteIds: string[];
  /** Most common tags in this cluster */
  dominantTags: string[];
  /** Common folder path for notes in cluster */
  folderPath: string;
  /** Ratio of internal links to possible links (0-1) */
  internalLinkDensity: number;
  /** Timestamp when cluster was created */
  createdAt: number;
  /** Reasons explaining why notes are clustered together */
  reasons: string[];
}

/**
 * Helper to create a cluster with defaults
 */
export function createCluster(partial: Partial<Cluster> & { noteIds: string[] }): Cluster {
  return {
    id: partial.id ?? generateClusterId(),
    candidateNames: partial.candidateNames ?? [],
    noteIds: partial.noteIds,
    dominantTags: partial.dominantTags ?? [],
    folderPath: partial.folderPath ?? '',
    internalLinkDensity: partial.internalLinkDensity ?? 0,
    createdAt: partial.createdAt ?? Date.now(),
    reasons: partial.reasons ?? [],
  };
}

/**
 * Generate a unique cluster ID
 */
export function generateClusterId(): string {
  return `cluster-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * UMAP dimensionality reduction configuration
 */
export interface UMAPConfig {
  /** Number of nearest neighbors for local structure (default: 15) */
  nNeighbors: number;
  /** Minimum distance between points in low-dim space (default: 0.1) */
  minDist: number;
  /** Number of dimensions in output (default: 10) */
  nComponents: number;
  /** Distance metric to use (default: 'cosine') */
  metric: 'cosine' | 'euclidean';
}

/**
 * Default UMAP configuration
 */
export const DEFAULT_UMAP_CONFIG: UMAPConfig = {
  nNeighbors: 15,
  minDist: 0.1,
  nComponents: 10,
  metric: 'cosine',
};

/**
 * HDBSCAN clustering configuration
 */
export interface HDBSCANConfig {
  /** Minimum cluster size for a group to be considered a cluster (default: 5) */
  minClusterSize: number;
  /** Minimum samples for core point definition (default: 3) */
  minSamples: number;
}

/**
 * Default HDBSCAN configuration
 */
export const DEFAULT_HDBSCAN_CONFIG: HDBSCANConfig = {
  minClusterSize: 5,
  minSamples: 3,
};

/**
 * Configuration for noise reassignment post-processing
 *
 * After HDBSCAN clustering, noise notes can be reassigned to their nearest
 * cluster centroid if the cosine similarity exceeds a threshold. This helps
 * reduce high noise ratios that are common with density-based clustering.
 */
export interface NoiseReassignConfig {
  /** Whether to enable noise reassignment (default: false) */
  enabled: boolean;
  /** Minimum cosine similarity to reassign a noise note to a cluster (default: 0.5) */
  threshold: number;
}

/**
 * Default noise reassignment configuration
 */
export const DEFAULT_NOISE_REASSIGN_CONFIG: NoiseReassignConfig = {
  enabled: false,
  threshold: 0.5,
};

/**
 * Cluster assignment result from HDBSCAN
 */
export interface ClusterAssignment {
  /** Index of the point in the input array */
  index: number;
  /** Cluster label (-1 for noise) */
  label: number;
}

/**
 * Embedding-based cluster with centroid information
 * Extends legacy Cluster with embedding-specific fields
 */
export interface EmbeddingCluster extends Cluster {
  /** Cluster centroid in embedding space */
  centroid: number[];
  /** Original centroid before any updates (for evolution tracking) */
  originalCentroid?: number[];
  /** Note paths closest to centroid (for LLM context) */
  representativeNotes: string[];
}

/**
 * Configuration for the clustering pipeline
 */
export interface ClusteringConfig {
  /** UMAP configuration */
  umap: UMAPConfig;
  /** HDBSCAN configuration */
  hdbscan: HDBSCANConfig;
  /** Noise reassignment configuration */
  noiseReassign: NoiseReassignConfig;
  /** Threshold for incremental vs full re-clustering (default: 0.05 = 5%) */
  incrementalThreshold: number;
  /** Minimum notes required to run clustering (default: 10) */
  minNotesForClustering: number;
  /** Number of representative notes to select per cluster (default: 5) */
  representativeCount: number;
  /** Minimum tag frequency to be considered dominant (default: 0.3) */
  dominantTagThreshold: number;
  /** Minimum cosine similarity for incremental note assignment (default: 0.3) */
  minAssignmentSimilarity: number;
}

/**
 * Default clustering configuration
 */
export const DEFAULT_CLUSTERING_CONFIG: ClusteringConfig = {
  umap: DEFAULT_UMAP_CONFIG,
  hdbscan: DEFAULT_HDBSCAN_CONFIG,
  noiseReassign: DEFAULT_NOISE_REASSIGN_CONFIG,
  incrementalThreshold: 0.05,
  minNotesForClustering: 10,
  representativeCount: 5,
  dominantTagThreshold: 0.3,
  minAssignmentSimilarity: 0.3,
};

/**
 * Input for the clustering pipeline
 */
export interface ClusteringInput {
  /** Embedded notes with their vectors */
  embeddings: Array<{
    notePath: string;
    embedding: number[];
  }>;
  /** Tags for each note (for metadata) */
  noteTags: Map<string, string[]>;
  /** Links for each note (for link density) */
  noteLinks: Map<string, string[]>;
  /** Configuration */
  config: ClusteringConfig;
}

/**
 * Result of the clustering pipeline
 */
export interface ClusteringResult {
  /** Embedding-based clusters */
  clusters: EmbeddingCluster[];
  /** Notes that couldn't be clustered (noise) */
  noiseNotes: string[];
  /** Statistics about the clustering run */
  stats: {
    /** Total notes processed */
    totalNotes: number;
    /** Number of clusters formed */
    clusterCount: number;
    /** Notes assigned to noise */
    noiseCount: number;
    /** Whether this was a full or incremental run */
    wasIncremental: boolean;
    /** Noise reassignment stats (only present if reassignment was enabled) */
    reassignment?: {
      /** Original noise count before reassignment */
      originalNoiseCount: number;
      /** Number of notes reassigned from noise to clusters */
      reassignedCount: number;
    };
  };
}

/**
 * State saved between clustering runs for incremental updates
 */
export interface ClusteringState {
  /** Current clusters with their noteIds (needed for incremental updates) */
  clusters: EmbeddingCluster[];
  /** Current cluster centroids (in original embedding space for cosine similarity) */
  centroids: Map<string, number[]>;
  /** Last full clustering timestamp */
  lastFullClusteringAt: number;
  /** Note hashes from last run (for change detection) */
  noteHashes: Map<string, string>;
}

/**
 * Convert an EmbeddingCluster to a legacy Cluster
 * Useful for compatibility with existing LLM pipeline
 */
export function toLegacyCluster(embeddingCluster: EmbeddingCluster): Cluster {
  return {
    id: embeddingCluster.id,
    candidateNames: embeddingCluster.candidateNames,
    noteIds: embeddingCluster.noteIds,
    dominantTags: embeddingCluster.dominantTags,
    folderPath: embeddingCluster.folderPath,
    internalLinkDensity: embeddingCluster.internalLinkDensity,
    createdAt: embeddingCluster.createdAt,
    reasons: embeddingCluster.reasons,
  };
}

/**
 * Generate a unique cluster ID for embedding-based clusters
 */
export function generateEmbeddingClusterId(): string {
  return `emb-cluster-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
