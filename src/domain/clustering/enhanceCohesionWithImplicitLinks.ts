import type { FileMetadata } from '@/ports/IMetadataProvider';
import { normalizeTag } from './refineByTags';
import type { Cluster, ClusteringConfig } from './types';

/**
 * Configuration for implicit link calculation
 */
export interface ImplicitLinkConfig {
	/** Minimum density threshold - clusters above this won't be enhanced */
	minDensityThreshold: number;
	/** Weight for explicit links when combining (0-1) */
	explicitWeight: number;
	/** Scale factor for implicit-only clusters (0-1) */
	implicitOnlyScale: number;
}

/**
 * Default configuration for implicit link calculation
 */
export const DEFAULT_IMPLICIT_LINK_CONFIG: ImplicitLinkConfig = {
	minDensityThreshold: 0.2,
	explicitWeight: 0.7,
	implicitOnlyScale: 0.5,
};

/**
 * Enhances cluster cohesion by calculating implicit links based on shared tags
 *
 * For clusters with low or zero explicit link density, this function calculates
 * "implicit" connections based on shared tags between notes. This helps
 * improve the cohesion score for semantically related but unlinked notes.
 *
 * @param clusters - Array of clusters to enhance
 * @param metadata - Map of path -> metadata
 * @param _config - Clustering configuration (unused but kept for consistency)
 * @returns Array of clusters with enhanced internalLinkDensity
 */
export function enhanceCohesionWithImplicitLinks(
	clusters: Cluster[],
	metadata: Map<string, FileMetadata>,
	_config: ClusteringConfig,
): Cluster[] {
	const implicitConfig = DEFAULT_IMPLICIT_LINK_CONFIG;

	return clusters.map((cluster) => {
		// Skip if already has good link density
		if (cluster.internalLinkDensity >= implicitConfig.minDensityThreshold) {
			return cluster;
		}

		// Calculate implicit link density based on shared tags
		const implicitDensity = calculateImplicitLinkDensity(cluster.noteIds, metadata);

		if (implicitDensity === 0) {
			return cluster;
		}

		// Combine explicit and implicit density
		const enhancedDensity = combineExplicitAndImplicitDensity(
			cluster.internalLinkDensity,
			implicitDensity,
			implicitConfig,
		);

		// Only update if there's meaningful improvement
		if (enhancedDensity <= cluster.internalLinkDensity) {
			return cluster;
		}

		return {
			...cluster,
			internalLinkDensity: enhancedDensity,
			reasons: [
				...cluster.reasons,
				`Cohesion enhanced with implicit tag links: ${(cluster.internalLinkDensity * 100).toFixed(1)}% -> ${(enhancedDensity * 100).toFixed(1)}%`,
			],
		};
	});
}

/**
 * Calculate implicit link density based on shared tags
 *
 * Counts pairs of notes that share at least one tag and calculates
 * the ratio to total possible pairs.
 */
export function calculateImplicitLinkDensity(
	noteIds: string[],
	metadata: Map<string, FileMetadata>,
): number {
	if (noteIds.length < 2) {
		return 0;
	}

	// Build tag sets for each note
	const noteTags = new Map<string, Set<string>>();

	for (const noteId of noteIds) {
		const meta = metadata.get(noteId);
		if (meta && meta.tags.length > 0) {
			const tags = new Set(meta.tags.map((t) => normalizeTag(t)));
			noteTags.set(noteId, tags);
		}
	}

	// If no notes have tags, no implicit links possible
	if (noteTags.size < 2) {
		return 0;
	}

	// Count pairs with shared tags
	let sharedTagPairs = 0;
	let totalWeight = 0;
	const noteList = Array.from(noteTags.keys());

	for (let i = 0; i < noteList.length; i++) {
		for (let j = i + 1; j < noteList.length; j++) {
			const tagsA = noteTags.get(noteList[i]);
			const tagsB = noteTags.get(noteList[j]);

			if (tagsA && tagsB) {
				// Count shared tags
				let sharedCount = 0;
				for (const tag of tagsA) {
					if (tagsB.has(tag)) {
						sharedCount++;
					}
				}

				if (sharedCount > 0) {
					sharedTagPairs++;
					// Weight by number of shared tags (more = stronger connection)
					totalWeight += Math.min(sharedCount, 3) / 3;
				}
			}
		}
	}

	// Calculate density
	const maxPairs = (noteIds.length * (noteIds.length - 1)) / 2;

	// Use weighted density for more accurate scoring
	return maxPairs > 0 ? totalWeight / maxPairs : 0;
}

/**
 * Combine explicit and implicit link density
 */
export function combineExplicitAndImplicitDensity(
	explicitDensity: number,
	implicitDensity: number,
	config: ImplicitLinkConfig,
): number {
	if (explicitDensity > 0) {
		// Combine with explicit links weighted higher
		return explicitDensity * config.explicitWeight + implicitDensity * (1 - config.explicitWeight);
	}

	// No explicit links - use implicit only, but scaled down
	return implicitDensity * config.implicitOnlyScale;
}

/**
 * Analyze tag cohesion for a cluster (for debugging/stats)
 */
export function analyzeTagCohesion(
	noteIds: string[],
	metadata: Map<string, FileMetadata>,
): {
	notesWithTags: number;
	uniqueTags: number;
	avgTagsPerNote: number;
	implicitDensity: number;
} {
	let notesWithTags = 0;
	let totalTags = 0;
	const allTags = new Set<string>();

	for (const noteId of noteIds) {
		const meta = metadata.get(noteId);
		if (meta && meta.tags.length > 0) {
			notesWithTags++;
			totalTags += meta.tags.length;
			for (const tag of meta.tags) {
				allTags.add(normalizeTag(tag));
			}
		}
	}

	return {
		notesWithTags,
		uniqueTags: allTags.size,
		avgTagsPerNote: notesWithTags > 0 ? totalTags / notesWithTags : 0,
		implicitDensity: calculateImplicitLinkDensity(noteIds, metadata),
	};
}
