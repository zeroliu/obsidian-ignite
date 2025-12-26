import type { FileMetadata } from '@/ports/IMetadataProvider';
import { normalizeTag } from './refineByTags';
import { type Cluster, type ClusteringConfig, createCluster, generateClusterId } from './types';

/**
 * Merges clusters smaller than minClusterSize into related larger clusters
 *
 * This is a post-processing step that runs after initial clustering to
 * consolidate micro-clusters that were created by aggressive splitting.
 *
 * Similarity scoring:
 * - Same folder path: +10 points
 * - Related folder path (parent/child): +5 points
 * - Shared dominant tags: +3 points per tag (max 9)
 * - Similar candidate names/keywords: +2 points per match (max 6)
 *
 * @param clusters - Array of clusters to process
 * @param metadata - Map of path -> metadata
 * @param config - Clustering configuration
 * @returns Array of clusters with small ones merged into large ones
 */
export function mergeSmallClustersIntoLarge(
	clusters: Cluster[],
	_metadata: Map<string, FileMetadata>,
	config: ClusteringConfig,
): Cluster[] {
	// Separate small and large clusters
	const smallClusters: Cluster[] = [];
	const largeClusters: Cluster[] = [];

	for (const cluster of clusters) {
		if (cluster.noteIds.length < config.minClusterSize) {
			smallClusters.push(cluster);
		} else {
			largeClusters.push(cluster);
		}
	}

	// If no small clusters, return as-is
	if (smallClusters.length === 0) {
		return clusters;
	}

	// If no large clusters to merge into, consolidate small ones by folder
	if (largeClusters.length === 0) {
		return consolidateByFolder(smallClusters, config);
	}

	// Try to merge each small cluster into a related large cluster
	const result = [...largeClusters];
	const unmerged: Cluster[] = [];

	for (const smallCluster of smallClusters) {
		const bestMatch = findBestLargeCluster(smallCluster, result, config);

		if (bestMatch !== null) {
			// Merge small cluster into the best match
			const targetCluster = result[bestMatch.index];
			const newSize = targetCluster.noteIds.length + smallCluster.noteIds.length;

			// Only merge if it won't exceed maxClusterSize
			if (newSize <= config.maxClusterSize) {
				result[bestMatch.index] = mergeIntoLarge(targetCluster, smallCluster);
			} else {
				unmerged.push(smallCluster);
			}
		} else {
			unmerged.push(smallCluster);
		}
	}

	// Consolidate remaining unmerged small clusters by folder
	if (unmerged.length > 0) {
		const consolidated = consolidateByFolder(unmerged, config);
		result.push(...consolidated);
	}

	return result;
}

/**
 * Find the best large cluster to merge a small cluster into
 */
function findBestLargeCluster(
	smallCluster: Cluster,
	largeClusters: Cluster[],
	config: ClusteringConfig,
): { index: number; score: number } | null {
	let bestIndex = -1;
	let bestScore = 0;

	for (let i = 0; i < largeClusters.length; i++) {
		const largeCluster = largeClusters[i];

		// Skip if merging would exceed max size
		if (largeCluster.noteIds.length + smallCluster.noteIds.length > config.maxClusterSize) {
			continue;
		}

		const score = calculateSimilarityScore(smallCluster, largeCluster);

		if (score > bestScore) {
			bestScore = score;
			bestIndex = i;
		}
	}

	// Require minimum score to merge
	if (bestIndex >= 0 && bestScore >= 3) {
		return { index: bestIndex, score: bestScore };
	}

	return null;
}

/**
 * Calculate similarity score between two clusters
 */
function calculateSimilarityScore(small: Cluster, large: Cluster): number {
	let score = 0;

	// Folder path matching (highest priority)
	if (small.folderPath && large.folderPath) {
		if (small.folderPath === large.folderPath) {
			score += 10;
		} else if (isRelatedFolder(small.folderPath, large.folderPath)) {
			score += 5;
		}
	}

	// Shared dominant tags (+3 per tag, max 9)
	const smallTags = new Set(small.dominantTags.map((t) => normalizeTag(t)));
	let tagMatches = 0;
	for (const tag of large.dominantTags) {
		if (smallTags.has(normalizeTag(tag))) {
			tagMatches++;
		}
	}
	score += Math.min(tagMatches * 3, 9);

	// Similar candidate names/keywords (+2 per match, max 6)
	const smallNames = new Set(small.candidateNames.map((n) => n.toLowerCase()));
	let nameMatches = 0;
	for (const name of large.candidateNames) {
		if (smallNames.has(name.toLowerCase())) {
			nameMatches++;
		}
	}
	score += Math.min(nameMatches * 2, 6);

	return score;
}

/**
 * Check if two folder paths are related (parent/child)
 */
function isRelatedFolder(pathA: string, pathB: string): boolean {
	if (!pathA || !pathB) return false;

	// Check if one is a parent of the other
	return pathA.startsWith(`${pathB}/`) || pathB.startsWith(`${pathA}/`);
}

/**
 * Merge a small cluster into a large cluster
 */
function mergeIntoLarge(large: Cluster, small: Cluster): Cluster {
	const noteIds = [...large.noteIds, ...small.noteIds];
	const dominantTags = [...new Set([...large.dominantTags, ...small.dominantTags])];
	const candidateNames = [...new Set([...large.candidateNames, ...small.candidateNames])];

	// Weighted average of link density
	const totalSize = large.noteIds.length + small.noteIds.length;
	const avgDensity =
		(large.internalLinkDensity * large.noteIds.length +
			small.internalLinkDensity * small.noteIds.length) /
		totalSize;

	return createCluster({
		id: large.id, // Preserve the large cluster's ID
		noteIds,
		dominantTags,
		candidateNames,
		folderPath: large.folderPath,
		internalLinkDensity: avgDensity,
		reasons: [
			...large.reasons,
			`Merged small cluster (${small.noteIds.length} notes) from '${small.folderPath || 'root'}'`,
		],
	});
}

/**
 * Consolidate small clusters by folder path
 */
function consolidateByFolder(clusters: Cluster[], config: ClusteringConfig): Cluster[] {
	// Group by folder path
	const byFolder = new Map<string, Cluster[]>();

	for (const cluster of clusters) {
		const folder = cluster.folderPath || '_root';
		const existing = byFolder.get(folder) || [];
		existing.push(cluster);
		byFolder.set(folder, existing);
	}

	const result: Cluster[] = [];

	for (const [folder, folderClusters] of byFolder) {
		if (folderClusters.length === 1) {
			result.push(folderClusters[0]);
			continue;
		}

		// Merge all clusters in this folder
		const allNoteIds = folderClusters.flatMap((c) => c.noteIds);
		const allTags = [...new Set(folderClusters.flatMap((c) => c.dominantTags))];
		const allNames = [...new Set(folderClusters.flatMap((c) => c.candidateNames))];
		const allReasons = [...new Set(folderClusters.flatMap((c) => c.reasons))];

		// If merged would be too large, keep separate
		if (allNoteIds.length > config.maxClusterSize) {
			result.push(...folderClusters);
			continue;
		}

		result.push(
			createCluster({
				id: generateClusterId(),
				noteIds: allNoteIds,
				dominantTags: allTags,
				candidateNames: ['Miscellaneous', ...allNames],
				folderPath: folder === '_root' ? '' : folder,
				internalLinkDensity: 0,
				reasons: [
					...allReasons,
					`Consolidated ${folderClusters.length} small clusters from '${folder}'`,
				],
			}),
		);
	}

	return result;
}
