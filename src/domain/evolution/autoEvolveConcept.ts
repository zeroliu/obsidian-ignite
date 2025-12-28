/**
 * Auto-Evolve Concept
 *
 * Automatically updates TrackedConcepts based on cluster evolution.
 * Handles rename, remap, and dissolve scenarios.
 */

import type { TrackedConcept } from '@/domain/llm/types';
import type { ClusterEvolution, EvolutionEvent } from './types';

/**
 * Result of auto-evolving a concept
 */
export interface AutoEvolveResult {
	/** Updated concept (null if dissolved) */
	concept: TrackedConcept | null;
	/** Whether the concept was modified */
	wasModified: boolean;
	/** Description of what happened */
	action: 'renamed' | 'remapped' | 'dissolved' | 'unchanged';
}

/**
 * Auto-evolve a TrackedConcept based on cluster evolution
 *
 * Evolution handling:
 * - rename: Keep name, update clusterId, add to history
 * - remap: Update clusterId, mark for name update, add to history
 * - dissolved: Return null (concept should be removed)
 *
 * @param concept - Concept to evolve
 * @param evolution - Cluster evolution information
 * @param newConceptName - New name for remap scenario (from LLM naming)
 * @returns AutoEvolveResult with updated concept or null
 */
export function autoEvolveConcept(
	concept: TrackedConcept,
	evolution: ClusterEvolution,
	newConceptName?: string,
): AutoEvolveResult {
	// Verify the evolution applies to this concept
	if (concept.clusterId !== evolution.oldClusterId) {
		return {
			concept,
			wasModified: false,
			action: 'unchanged',
		};
	}

	const now = Date.now();
	const evolutionEvent: EvolutionEvent = {
		ts: now,
		fromCluster: evolution.oldClusterId,
		toCluster: evolution.newClusterId,
		type: evolution.type,
		overlapScore: evolution.overlapScore,
	};

	switch (evolution.type) {
		case 'rename':
			// High overlap - keep the name, just update cluster ID
			return {
				concept: {
					...concept,
					clusterId: evolution.newClusterId as string,
					metadata: {
						...concept.metadata,
						lastUpdated: now,
					},
					evolutionHistory: [...concept.evolutionHistory, evolutionEvent],
				},
				wasModified: true,
				action: 'renamed',
			};

		case 'remap':
			// Medium overlap - update cluster ID and optionally name
			return {
				concept: {
					...concept,
					canonicalName: newConceptName ?? concept.canonicalName,
					clusterId: evolution.newClusterId as string,
					metadata: {
						...concept.metadata,
						lastUpdated: now,
					},
					evolutionHistory: [...concept.evolutionHistory, evolutionEvent],
				},
				wasModified: true,
				action: 'remapped',
			};

		case 'dissolved':
			// Low overlap - concept no longer exists
			// Return null to indicate the concept should be removed
			// The evolution history is lost, but that's intentional per the design
			return {
				concept: null,
				wasModified: true,
				action: 'dissolved',
			};

		default:
			return {
				concept,
				wasModified: false,
				action: 'unchanged',
			};
	}
}

/**
 * Batch auto-evolve multiple concepts
 *
 * @param concepts - Concepts to evolve
 * @param evolutions - All cluster evolutions
 * @param newNames - Map of new cluster ID to new concept name
 * @returns Results for each concept
 */
export function autoEvolveConceptBatch(
	concepts: TrackedConcept[],
	evolutions: ClusterEvolution[],
	newNames: Map<string, string> = new Map(),
): AutoEvolveResult[] {
	// Create evolution lookup by old cluster ID
	const evolutionByOldCluster = new Map<string, ClusterEvolution>();
	for (const evolution of evolutions) {
		evolutionByOldCluster.set(evolution.oldClusterId, evolution);
	}

	return concepts.map((concept) => {
		const evolution = evolutionByOldCluster.get(concept.clusterId);

		if (!evolution) {
			// No evolution found for this concept's cluster
			// This could happen if the cluster is new or unchanged
			return {
				concept,
				wasModified: false,
				action: 'unchanged' as const,
			};
		}

		// Get new name for remap scenario
		const newName = evolution.newClusterId ? newNames.get(evolution.newClusterId) : undefined;

		return autoEvolveConcept(concept, evolution, newName);
	});
}

/**
 * Filter out dissolved concepts from batch results
 *
 * @param results - Batch evolution results
 * @returns Only surviving concepts
 */
export function filterSurvivingConcepts(results: AutoEvolveResult[]): TrackedConcept[] {
	return results.filter((r) => r.concept !== null).map((r) => r.concept as TrackedConcept);
}

/**
 * Get evolution statistics from batch results
 */
export interface EvolutionStats {
	renamed: number;
	remapped: number;
	dissolved: number;
	unchanged: number;
}

/**
 * Calculate statistics from batch evolution results
 *
 * @param results - Batch evolution results
 * @returns Statistics about evolution actions
 */
export function calculateEvolutionStats(results: AutoEvolveResult[]): EvolutionStats {
	const stats: EvolutionStats = {
		renamed: 0,
		remapped: 0,
		dissolved: 0,
		unchanged: 0,
	};

	for (const result of results) {
		stats[result.action]++;
	}

	return stats;
}
