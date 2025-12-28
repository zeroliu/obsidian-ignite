import { cosineSimilarity } from './centroidCalculator';
import type { ClusteringState, EmbeddingCluster } from './types';

/**
 * Result of change detection
 */
export interface ChangeDetectionResult {
  /** Note paths that are new (not in previous state) */
  newNotes: string[];
  /** Note paths that were modified (hash changed) */
  modifiedNotes: string[];
  /** Note paths that were deleted (in previous state but not current) */
  deletedNotes: string[];
  /** Total number of changes */
  totalChanges: number;
  /** Change percentage (0-1) */
  changePercentage: number;
  /** Whether incremental update is recommended */
  shouldUseIncremental: boolean;
}

/**
 * Detect changes between current notes and previous clustering state
 *
 * @param currentNotes - Current notes with their content hashes
 * @param previousState - State from previous clustering run
 * @param incrementalThreshold - Threshold for using incremental (default 0.05 = 5%)
 * @returns Change detection result
 */
export function detectChanges(
  currentNotes: Map<string, string>, // path -> contentHash
  previousState: ClusteringState | null,
  incrementalThreshold = 0.05,
): ChangeDetectionResult {
  const newNotes: string[] = [];
  const modifiedNotes: string[] = [];
  const deletedNotes: string[] = [];

  if (!previousState) {
    // No previous state, all notes are new
    return {
      newNotes: Array.from(currentNotes.keys()),
      modifiedNotes: [],
      deletedNotes: [],
      totalChanges: currentNotes.size,
      changePercentage: 1,
      shouldUseIncremental: false,
    };
  }

  // Find new and modified notes
  for (const [path, hash] of currentNotes.entries()) {
    const previousHash = previousState.noteHashes.get(path);
    if (!previousHash) {
      newNotes.push(path);
    } else if (previousHash !== hash) {
      modifiedNotes.push(path);
    }
  }

  // Find deleted notes
  for (const path of previousState.noteHashes.keys()) {
    if (!currentNotes.has(path)) {
      deletedNotes.push(path);
    }
  }

  const totalChanges = newNotes.length + modifiedNotes.length + deletedNotes.length;
  const totalNotes = Math.max(currentNotes.size, previousState.noteHashes.size);
  const changePercentage = totalNotes > 0 ? totalChanges / totalNotes : 0;

  return {
    newNotes,
    modifiedNotes,
    deletedNotes,
    totalChanges,
    changePercentage,
    shouldUseIncremental: changePercentage < incrementalThreshold,
  };
}

/**
 * Result of incremental update
 */
export interface IncrementalUpdateResult {
  /** Updated clusters */
  clusters: EmbeddingCluster[];
  /** Notes that were assigned to clusters */
  assignedNotes: Array<{ notePath: string; clusterId: string }>;
  /** Notes that couldn't be assigned (too far from any centroid) */
  unassignedNotes: string[];
}

/**
 * Assignment for a single note in incremental mode
 */
export interface NoteAssignment {
  /** Note path */
  notePath: string;
  /** Cluster ID assigned to */
  clusterId: string;
  /** Similarity to cluster centroid */
  similarity: number;
}

/**
 * Assign new or modified notes to existing clusters incrementally
 *
 * @param newEmbeddings - Embeddings for new/modified notes
 * @param clusters - Existing clusters with centroids
 * @param minSimilarity - Minimum similarity to assign (default 0.3)
 * @returns Assignment results
 */
export function assignNotesToClusters(
  newEmbeddings: Array<{ notePath: string; embedding: number[] }>,
  clusters: EmbeddingCluster[],
  minSimilarity = 0.3,
): { assigned: NoteAssignment[]; unassigned: string[] } {
  if (clusters.length === 0) {
    return {
      assigned: [],
      unassigned: newEmbeddings.map((e) => e.notePath),
    };
  }

  // Build centroid map
  const centroids = new Map<string, number[]>();
  for (const cluster of clusters) {
    centroids.set(cluster.id, cluster.centroid);
  }

  const assigned: NoteAssignment[] = [];
  const unassigned: string[] = [];

  for (const { notePath, embedding } of newEmbeddings) {
    // Find nearest centroid
    let bestClusterId: string | null = null;
    let bestSimilarity = Number.NEGATIVE_INFINITY;

    for (const [clusterId, centroid] of centroids.entries()) {
      const similarity = cosineSimilarity(embedding, centroid);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestClusterId = clusterId;
      }
    }

    if (bestClusterId && bestSimilarity >= minSimilarity) {
      assigned.push({
        notePath,
        clusterId: bestClusterId,
        similarity: bestSimilarity,
      });
    } else {
      unassigned.push(notePath);
    }
  }

  return { assigned, unassigned };
}

/**
 * Apply incremental updates to clusters
 *
 * @param clusters - Existing clusters
 * @param changes - Change detection result
 * @param newEmbeddings - Embeddings for new/modified notes
 * @param minSimilarity - Minimum similarity for assignment
 * @returns Updated clusters and statistics
 */
export function applyIncrementalUpdate(
  clusters: EmbeddingCluster[],
  changes: ChangeDetectionResult,
  newEmbeddings: Array<{ notePath: string; embedding: number[] }>,
  minSimilarity = 0.3,
): IncrementalUpdateResult {
  // Create mutable copies of clusters
  const updatedClusters = clusters.map((c) => ({
    ...c,
    noteIds: [...c.noteIds],
  }));

  // Remove deleted notes from clusters
  const deletedSet = new Set(changes.deletedNotes);
  for (const cluster of updatedClusters) {
    cluster.noteIds = cluster.noteIds.filter((id) => !deletedSet.has(id));
  }

  // Remove modified notes (they'll be re-assigned)
  const modifiedSet = new Set(changes.modifiedNotes);
  for (const cluster of updatedClusters) {
    cluster.noteIds = cluster.noteIds.filter((id) => !modifiedSet.has(id));
  }

  // Assign new and modified notes to clusters
  const { assigned, unassigned } = assignNotesToClusters(
    newEmbeddings,
    updatedClusters,
    minSimilarity,
  );

  // Add assigned notes to their clusters
  const clusterMap = new Map<string, EmbeddingCluster>();
  for (const cluster of updatedClusters) {
    clusterMap.set(cluster.id, cluster);
  }

  for (const { notePath, clusterId } of assigned) {
    const cluster = clusterMap.get(clusterId);
    if (cluster && !cluster.noteIds.includes(notePath)) {
      cluster.noteIds.push(notePath);
    }
  }

  // Update cluster reasons
  for (const cluster of updatedClusters) {
    if (assigned.some((a) => a.clusterId === cluster.id)) {
      const assignedCount = assigned.filter((a) => a.clusterId === cluster.id).length;
      cluster.reasons = [
        ...cluster.reasons.filter((r) => !r.startsWith('Incremental update:')),
        `Incremental update: +${assignedCount} notes`,
      ];
    }
  }

  // Filter out empty clusters
  const nonEmptyClusters = updatedClusters.filter((c) => c.noteIds.length > 0);

  return {
    clusters: nonEmptyClusters,
    assignedNotes: assigned.map(({ notePath, clusterId }) => ({ notePath, clusterId })),
    unassignedNotes: unassigned,
  };
}

/**
 * Update clustering state after a run
 *
 * @param noteHashes - Current note hashes
 * @param clusters - Current clusters
 * @returns Updated clustering state
 */
export function updateClusteringState(
  noteHashes: Map<string, string>,
  clusters: EmbeddingCluster[],
): ClusteringState {
  const centroids = new Map<string, number[]>();
  for (const cluster of clusters) {
    centroids.set(cluster.id, cluster.centroid);
  }

  return {
    clusters: clusters.map((c) => ({ ...c })), // Deep copy clusters
    centroids,
    lastFullClusteringAt: Date.now(),
    noteHashes: new Map(noteHashes),
  };
}
