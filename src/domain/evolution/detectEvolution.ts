/**
 * Cluster Evolution Detection
 *
 * Detects how clusters have evolved between two clustering runs.
 * Uses Jaccard similarity to match old clusters to new clusters.
 */

import type { Cluster } from '@/domain/clustering/types';
import { jaccard } from './jaccardSimilarity';
import type { ClusterEvolution, EvolutionConfig, EvolutionType } from './types';
import { DEFAULT_EVOLUTION_CONFIG } from './types';

/**
 * Result of evolution detection
 */
export interface EvolutionDetectionResult {
  /** Evolution mappings for each old cluster */
  evolutions: ClusterEvolution[];
  /** Old cluster IDs that were dissolved (no good match) */
  dissolved: string[];
  /** New cluster IDs that are new (didn't exist before) */
  newClusters: string[];
}

/**
 * Detect evolution between old and new cluster sets
 *
 * For each old cluster, finds the best matching new cluster and classifies:
 * - rename: >60% overlap (same concept, cluster ID changed)
 * - remap: 20-60% overlap (concept evolved, needs new name)
 * - dissolved: <20% overlap (concept no longer exists)
 *
 * @param oldClusters - Previous clustering result
 * @param newClusters - Current clustering result
 * @param config - Evolution detection configuration
 * @returns Evolution detection result
 */
export function detectEvolution(
  oldClusters: Cluster[],
  newClusters: Cluster[],
  config: EvolutionConfig = DEFAULT_EVOLUTION_CONFIG,
): EvolutionDetectionResult {
  const evolutions: ClusterEvolution[] = [];
  const dissolved: string[] = [];
  const matchedNewClusters = new Set<string>();

  // Convert new clusters to sets for efficient lookup
  const newClusterSets = newClusters.map((cluster) => ({
    id: cluster.id,
    noteIdSet: new Set(cluster.noteIds),
    noteCount: cluster.noteIds.length,
  }));

  // For each old cluster, find the best matching new cluster
  for (const oldCluster of oldClusters) {
    const oldNoteIdSet = new Set(oldCluster.noteIds);

    let bestMatch: { id: string; score: number; noteCount: number } | null = null;

    for (const newCluster of newClusterSets) {
      const score = jaccard(oldNoteIdSet, newCluster.noteIdSet);

      // Tiebreaker logic for deterministic results:
      // 1. Higher score wins
      // 2. If scores equal, prefer larger cluster (more notes)
      // 3. If still tied, prefer alphabetically earlier ID
      const isBetterMatch =
        bestMatch === null ||
        score > bestMatch.score ||
        (score === bestMatch.score && newCluster.noteCount > bestMatch.noteCount) ||
        (score === bestMatch.score &&
          newCluster.noteCount === bestMatch.noteCount &&
          newCluster.id < bestMatch.id);

      if (isBetterMatch) {
        bestMatch = { id: newCluster.id, score, noteCount: newCluster.noteCount };
      }
    }

    if (bestMatch === null || bestMatch.score < config.remapThreshold) {
      // No good match - cluster was dissolved
      dissolved.push(oldCluster.id);
      evolutions.push({
        oldClusterId: oldCluster.id,
        newClusterId: null,
        overlapScore: bestMatch?.score ?? 0,
        type: 'dissolved',
      });
    } else {
      // Found a match - classify the evolution type
      const evolutionType = classifyEvolution(bestMatch.score, config);
      matchedNewClusters.add(bestMatch.id);

      evolutions.push({
        oldClusterId: oldCluster.id,
        newClusterId: bestMatch.id,
        overlapScore: bestMatch.score,
        type: evolutionType,
      });
    }
  }

  // Find new clusters that weren't matched to any old cluster
  const newClusterIds = newClusters.map((c) => c.id).filter((id) => !matchedNewClusters.has(id));

  return {
    evolutions,
    dissolved,
    newClusters: newClusterIds,
  };
}

/**
 * Classify evolution type based on overlap score
 *
 * @param score - Jaccard similarity score (0-1)
 * @param config - Evolution configuration with thresholds
 * @returns Evolution type
 */
export function classifyEvolution(
  score: number,
  config: EvolutionConfig = DEFAULT_EVOLUTION_CONFIG,
): EvolutionType {
  if (score >= config.renameThreshold) {
    return 'rename';
  }
  if (score >= config.remapThreshold) {
    return 'remap';
  }
  return 'dissolved';
}

/**
 * Find evolution for a specific old cluster
 *
 * @param oldClusterId - ID of the old cluster
 * @param evolutions - List of all evolutions
 * @returns Evolution for this cluster, or undefined if not found
 */
export function findEvolutionForCluster(
  oldClusterId: string,
  evolutions: ClusterEvolution[],
): ClusterEvolution | undefined {
  return evolutions.find((e) => e.oldClusterId === oldClusterId);
}

/**
 * Group evolutions by type
 *
 * @param evolutions - List of cluster evolutions
 * @returns Evolutions grouped by type
 */
export function groupEvolutionsByType(
  evolutions: ClusterEvolution[],
): Record<EvolutionType, ClusterEvolution[]> {
  const groups: Record<EvolutionType, ClusterEvolution[]> = {
    rename: [],
    remap: [],
    dissolved: [],
  };

  for (const evolution of evolutions) {
    groups[evolution.type].push(evolution);
  }

  return groups;
}
