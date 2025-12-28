import type { Cluster } from '@/domain/clustering/types';
import type { ConceptNamingResult, MisfitNote, TrackedConcept } from './types';
import { createTrackedConcept, isQuizzableScore } from './types';

/**
 * Result of processing concept naming
 */
export interface ProcessNamingResult {
  /** Created concepts */
  concepts: TrackedConcept[];
  /** All misfit notes detected across all clusters */
  misfitNotes: MisfitNote[];
}

/**
 * Process LLM naming results and create TrackedConcepts from clusters
 *
 * This function:
 * 1. Creates TrackedConcepts from naming results
 * 2. Handles merge suggestions (combines clusters with same concept)
 * 3. Collects all misfit notes for removal
 * 4. Removes misfit notes from their respective concepts
 *
 * @param clusters - Original clusters that were sent for naming
 * @param results - LLM naming results for each cluster
 * @returns ProcessNamingResult with concepts and misfits
 */
export function processConceptNaming(
  clusters: Cluster[],
  results: ConceptNamingResult[],
): ProcessNamingResult {
  // Create a map of cluster ID to result for quick lookup
  const resultMap = new Map<string, ConceptNamingResult>();
  for (const result of results) {
    resultMap.set(result.clusterId, result);
  }

  // Create a map of cluster ID to cluster
  const clusterMap = new Map<string, Cluster>();
  for (const cluster of clusters) {
    clusterMap.set(cluster.id, cluster);
  }

  // Track which clusters have been merged into others
  const mergedInto = new Map<string, string>();

  // Process merge suggestions first
  for (const result of results) {
    for (const mergeTarget of result.suggestedMerges) {
      // Only merge if not already merged elsewhere
      if (!mergedInto.has(mergeTarget)) {
        mergedInto.set(mergeTarget, result.clusterId);
      }
    }
  }

  // Collect all misfit notes and create a set for quick lookup
  const allMisfitNotes: MisfitNote[] = [];
  const misfitNoteIds = new Set<string>();

  for (const result of results) {
    for (const misfit of result.misfitNotes) {
      allMisfitNotes.push(misfit);
      misfitNoteIds.add(misfit.noteId);
    }
  }

  // Create concepts, handling merges
  const concepts: TrackedConcept[] = [];
  const processedClusterIds = new Set<string>();

  for (const cluster of clusters) {
    // Skip if this cluster was merged into another
    if (mergedInto.has(cluster.id)) {
      continue;
    }

    // Skip if already processed
    if (processedClusterIds.has(cluster.id)) {
      continue;
    }

    const result = resultMap.get(cluster.id);
    if (!result) {
      // No result for this cluster, create with defaults
      const noteIds = filterMisfits(cluster.noteIds, misfitNoteIds);
      if (noteIds.length > 0) {
        concepts.push(
          createTrackedConcept({
            canonicalName: cluster.candidateNames[0] || 'Unnamed Concept',
            noteIds,
            clusterId: cluster.id,
          }),
        );
      }
      processedClusterIds.add(cluster.id);
      continue;
    }

    // Collect all note IDs including from merged clusters
    const allNoteIds: string[] = [...cluster.noteIds];

    for (const [mergedId, targetId] of mergedInto.entries()) {
      if (targetId === cluster.id) {
        const mergedCluster = clusterMap.get(mergedId);
        if (mergedCluster) {
          allNoteIds.push(...mergedCluster.noteIds);
          processedClusterIds.add(mergedId);
        }
      }
    }

    // Filter out misfit notes
    const filteredNoteIds = filterMisfits(allNoteIds, misfitNoteIds);

    // Only create concept if it has notes remaining
    if (filteredNoteIds.length > 0) {
      concepts.push(
        createTrackedConcept({
          canonicalName: result.canonicalName,
          noteIds: filteredNoteIds,
          quizzabilityScore: result.quizzabilityScore,
          clusterId: cluster.id,
        }),
      );
    }

    processedClusterIds.add(cluster.id);
  }

  return {
    concepts,
    misfitNotes: allMisfitNotes,
  };
}

/**
 * Filter out misfit note IDs from a list
 */
function filterMisfits(noteIds: string[], misfitNoteIds: Set<string>): string[] {
  return noteIds.filter((noteId) => !misfitNoteIds.has(noteId));
}

/**
 * Filter concepts to only quizzable ones
 *
 * @param concepts - All concepts
 * @returns Only quizzable concepts (score >= 0.4)
 */
export function filterQuizzableConcepts(concepts: TrackedConcept[]): TrackedConcept[] {
  return concepts.filter((c) => isQuizzableScore(c.quizzabilityScore));
}

/**
 * Filter concepts to only non-quizzable ones
 *
 * @param concepts - All concepts
 * @returns Only non-quizzable concepts (score < 0.4)
 */
export function filterNonQuizzableConcepts(concepts: TrackedConcept[]): TrackedConcept[] {
  return concepts.filter((c) => !isQuizzableScore(c.quizzabilityScore));
}

/**
 * Create a TrackedConcept from a naming result and cluster
 *
 * @param result - LLM naming result
 * @param cluster - Original cluster
 * @param excludeMisfits - Misfit note IDs to exclude
 * @returns Created concept
 */
export function createConceptFromResult(
  result: ConceptNamingResult,
  cluster: Cluster,
  excludeMisfits: Set<string> = new Set(),
): TrackedConcept {
  const noteIds = filterMisfits(cluster.noteIds, excludeMisfits);
  return createTrackedConcept({
    canonicalName: result.canonicalName,
    noteIds,
    quizzabilityScore: result.quizzabilityScore,
    clusterId: cluster.id,
  });
}
