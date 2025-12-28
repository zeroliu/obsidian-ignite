import type { ClusteringResult, EmbeddingCluster } from '@/domain/clustering/types';
import type { MisfitNote, TrackedConcept } from '@/domain/llm/types';

/**
 * Progress update during pipeline execution
 */
export interface PipelineProgress {
  /** Current stage of the pipeline */
  stage: 'reading' | 'embedding' | 'clustering' | 'refining' | 'saving';
  /** Current progress count */
  current: number;
  /** Total items to process */
  total: number;
  /** Human-readable message */
  message: string;
}

/**
 * Serialized cluster for JSON storage
 * Maps are converted to objects for JSON compatibility
 */
export interface SerializedCluster {
  /** Unique identifier for the cluster */
  id: string;
  /** File paths of notes in this cluster */
  noteIds: string[];
  /** Candidate names for this cluster */
  candidateNames: string[];
  /** Most common tags in this cluster */
  dominantTags: string[];
  /** Common folder path for notes in cluster */
  folderPath: string;
  /** Ratio of internal links to possible links */
  internalLinkDensity: number;
  /** Timestamp when cluster was created */
  createdAt: number;
  /** Reasons explaining why notes are clustered together */
  reasons: string[];
  /** Cluster centroid in embedding space */
  centroid: number[];
  /** Note paths closest to centroid */
  representativeNotes: string[];
  // LLM-derived fields (optional - only present after LLM step runs)
  /** Canonical name assigned by LLM */
  canonicalName?: string;
  /** Quizzability score (0-1) from LLM assessment */
  quizzabilityScore?: number;
  /** Reason if not quizzable (score < 0.4) */
  nonQuizzableReason?: string;
  /** Notes identified as misfits for this cluster */
  misfitNotes?: Array<{ noteId: string; reason: string }>;
}

/**
 * Persisted clustering result stored in .recall/clusters.json
 */
export interface PersistedClusteringResult {
  /** Schema version for future migrations */
  version: number;
  /** Timestamp when clustering was performed */
  timestamp: number;
  /** Clustering statistics */
  stats: ClusteringResult['stats'];
  /** Serialized clusters */
  clusters: SerializedCluster[];
  /** Notes that couldn't be clustered */
  noiseNotes: string[];
  /** Embedding provider used */
  embeddingProvider: string;
  /** Embedding model used */
  embeddingModel: string;
  // LLM processing metadata
  /** Whether LLM refinement was performed */
  llmRefined?: boolean;
  /** LLM model used for refinement */
  llmModel?: string;
  /** Token usage statistics from LLM */
  llmTokenUsage?: { inputTokens: number; outputTokens: number };
}

/**
 * Result from the pipeline orchestrator
 */
export interface PipelineResult {
  /** Number of clusters found */
  clusterCount: number;
  /** Total notes processed */
  totalNotes: number;
  /** Notes classified as noise */
  noiseCount: number;
  /** Notes excluded by path patterns */
  excludedCount: number;
  /** Embedding statistics */
  embeddingStats: {
    cacheHits: number;
    cacheMisses: number;
    tokensProcessed: number;
    estimatedCost: number;
  };
  /** LLM statistics (null if LLM step was skipped) */
  llmStats: {
    conceptsNamed: number;
    quizzableCount: number;
    nonQuizzableCount: number;
    misfitNotesCount: number;
    tokenUsage: { inputTokens: number; outputTokens: number };
  } | null;
  /** Timing information */
  timing: {
    embeddingMs: number;
    clusteringMs: number;
    refiningMs: number;
    totalMs: number;
  };
}

/**
 * Convert an EmbeddingCluster to a SerializedCluster for JSON storage
 */
export function serializeCluster(cluster: EmbeddingCluster): SerializedCluster {
  return {
    id: cluster.id,
    noteIds: cluster.noteIds,
    candidateNames: cluster.candidateNames,
    dominantTags: cluster.dominantTags,
    folderPath: cluster.folderPath,
    internalLinkDensity: cluster.internalLinkDensity,
    createdAt: cluster.createdAt,
    reasons: cluster.reasons,
    centroid: cluster.centroid,
    representativeNotes: cluster.representativeNotes,
  };
}

/**
 * Current schema version for persisted clustering results
 */
export const CLUSTERING_RESULT_VERSION = 1;

/**
 * Apply LLM results to a serialized cluster
 */
export function applyLLMResultsToCluster(
  cluster: SerializedCluster,
  concept: TrackedConcept | undefined,
  misfitNotes: MisfitNote[],
): SerializedCluster {
  if (!concept) {
    return cluster;
  }
  return {
    ...cluster,
    canonicalName: concept.canonicalName,
    quizzabilityScore: concept.quizzabilityScore,
    misfitNotes: misfitNotes
      .filter((m) => cluster.noteIds.includes(m.noteId))
      .map((m) => ({ noteId: m.noteId, reason: m.reason })),
  };
}
