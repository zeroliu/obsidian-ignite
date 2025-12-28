/**
 * Noise reassignment post-processing for HDBSCAN clustering
 *
 * HDBSCAN is a density-based clustering algorithm that labels points in
 * low-density regions as noise. For personal knowledge bases with diverse
 * topics, this often results in high noise ratios (50%+).
 *
 * This module provides post-processing to reassign noise notes to their
 * nearest cluster centroid if the cosine similarity exceeds a threshold,
 * reducing noise while maintaining cluster quality.
 */

import { computeCentroid, cosineSimilarity } from './centroidCalculator';
import type { EmbeddingCluster } from './types';

/**
 * Result of noise reassignment
 */
export interface NoiseReassignResult {
	/** Updated clusters with reassigned notes */
	clusters: EmbeddingCluster[];
	/** Notes that remain as noise (similarity below threshold) */
	remainingNoise: string[];
	/** Number of notes reassigned from noise to clusters */
	reassignedCount: number;
}

/**
 * Reassign noise notes to their nearest cluster centroid
 *
 * For each noise note:
 * 1. Calculate cosine similarity to all cluster centroids
 * 2. If max similarity >= threshold, assign to that cluster
 * 3. Otherwise, keep as noise
 *
 * After reassignment, cluster centroids are recomputed to include new notes.
 *
 * @param clusters - Current clusters with centroids
 * @param noiseNotes - Note paths currently marked as noise
 * @param embeddings - Map of note path to embedding vector
 * @param threshold - Minimum cosine similarity to reassign (default: 0.5)
 * @returns Updated clusters and remaining noise notes
 */
export function reassignNoiseNotes(
	clusters: EmbeddingCluster[],
	noiseNotes: string[],
	embeddings: Map<string, number[]>,
	threshold: number,
): NoiseReassignResult {
	if (clusters.length === 0 || noiseNotes.length === 0) {
		return { clusters, remainingNoise: noiseNotes, reassignedCount: 0 };
	}

	const remainingNoise: string[] = [];
	let reassignedCount = 0;

	// Track which notes get assigned to which clusters
	const assignments = new Map<string, string[]>();
	for (const cluster of clusters) {
		assignments.set(cluster.id, [...cluster.noteIds]);
	}

	for (const notePath of noiseNotes) {
		const embedding = embeddings.get(notePath);
		if (!embedding) {
			remainingNoise.push(notePath);
			continue;
		}

		// Find nearest cluster by cosine similarity to centroid
		let bestClusterId: string | null = null;
		let bestSimilarity = Number.NEGATIVE_INFINITY;

		for (const cluster of clusters) {
			const similarity = cosineSimilarity(embedding, cluster.centroid);
			if (similarity > bestSimilarity) {
				bestSimilarity = similarity;
				bestClusterId = cluster.id;
			}
		}

		if (bestClusterId && bestSimilarity >= threshold) {
			// Assign to nearest cluster
			const clusterNotes = assignments.get(bestClusterId);
			if (clusterNotes) {
				clusterNotes.push(notePath);
				reassignedCount++;
			}
		} else {
			// Keep as noise - similarity too low
			remainingNoise.push(notePath);
		}
	}

	// Rebuild clusters with updated noteIds and recompute centroids
	const updatedClusters: EmbeddingCluster[] = clusters.map((cluster) => {
		const noteIds = assignments.get(cluster.id) || cluster.noteIds;

		// Recompute centroid with new notes
		const clusterEmbeddings = noteIds
			.map((id) => embeddings.get(id))
			.filter((e): e is number[] => e !== undefined);

		const centroid =
			clusterEmbeddings.length > 0 ? computeCentroid(clusterEmbeddings) : cluster.centroid;

		return {
			...cluster,
			noteIds,
			centroid,
		};
	});

	return { clusters: updatedClusters, remainingNoise, reassignedCount };
}
