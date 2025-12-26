import type { FileMetadata, ResolvedLinks } from '@/ports/IMetadataProvider';
import { extractTitleKeywords } from './groupByTitleKeywords';
import { type Cluster, type ClusteringConfig, createCluster, generateClusterId } from './types';

/**
 * Configuration for link-based splitting
 */
export interface LinkSplitConfig {
	/** Minimum size threshold (clusters smaller than this won't be split) */
	minSizeForSplit: number;
	/** Link density threshold (clusters with higher density won't be split) */
	linkDensityThreshold: number;
	/** Minimum component size to keep as a separate cluster */
	minComponentSize: number;
	/** Percentage of top connected notes to use as cores (0-1) */
	corePercentage: number;
}

/**
 * Default configuration for link-based splitting
 */
export const DEFAULT_LINK_SPLIT_CONFIG: LinkSplitConfig = {
	minSizeForSplit: 50,
	linkDensityThreshold: 0.15,
	minComponentSize: 5,
	corePercentage: 0.1,
};

/**
 * Split large, low-density clusters by link communities
 *
 * For clusters that are large with low internal link density:
 * 1. Build bidirectional adjacency list
 * 2. Find connected components via BFS
 * 3. If multiple components >= minClusterSize, split into separate clusters
 * 4. Otherwise, find high-link "core" notes and assign remaining notes to nearest core
 *
 * @param clusters - Array of clusters to potentially split
 * @param resolvedLinks - Map of source -> { target -> count }
 * @param metadata - Map of path -> metadata (for word count, tags)
 * @param config - Clustering configuration
 * @returns Array of clusters after splitting
 */
export function splitByLinkCommunities(
	clusters: Cluster[],
	resolvedLinks: ResolvedLinks,
	metadata: Map<string, FileMetadata>,
	config: ClusteringConfig,
): Cluster[] {
	const linkConfig: LinkSplitConfig = {
		...DEFAULT_LINK_SPLIT_CONFIG,
		minComponentSize: config.minClusterSize,
	};

	const result: Cluster[] = [];

	for (const cluster of clusters) {
		// Check if cluster should be split
		const shouldSplit =
			cluster.noteIds.length >= linkConfig.minSizeForSplit &&
			cluster.internalLinkDensity < linkConfig.linkDensityThreshold;

		if (!shouldSplit) {
			result.push(cluster);
			continue;
		}

		// Build bidirectional adjacency list
		const adjacency = buildBidirectionalAdjacency(cluster.noteIds, resolvedLinks);

		// Find connected components
		const components = findConnectedComponents(cluster.noteIds, adjacency);

		// Filter components by minimum size
		const significantComponents = components.filter(
			(comp) => comp.length >= linkConfig.minComponentSize,
		);

		// Collect orphan notes (not in any significant component)
		const componentNotes = new Set(significantComponents.flat());
		const orphanNotes = cluster.noteIds.filter((id) => !componentNotes.has(id));

		if (significantComponents.length > 1) {
			// We have multiple distinct communities - split into separate clusters
			for (let i = 0; i < significantComponents.length; i++) {
				const componentNoteIds = significantComponents[i];
				result.push(
					createCluster({
						id: generateClusterId(),
						noteIds: componentNoteIds,
						folderPath: cluster.folderPath,
						dominantTags: findDominantTagsForNotes(componentNoteIds, metadata, config),
						candidateNames: [...cluster.candidateNames, `Community ${i + 1}`],
						internalLinkDensity: calculateComponentDensity(componentNoteIds, adjacency),
						reasons: [
							...cluster.reasons,
							`Split by link community: ${componentNoteIds.length} connected notes`,
						],
					}),
				);
			}

			// Handle orphan notes
			if (orphanNotes.length > 0) {
				const assignedOrphans = assignOrphansToComponents(
					orphanNotes,
					significantComponents,
					resolvedLinks,
					metadata,
				);

				// Add orphans assigned to components to existing result clusters
				for (let i = 0; i < significantComponents.length; i++) {
					const assigned = assignedOrphans.get(i) || [];
					if (assigned.length > 0) {
						const lastCluster = result[result.length - significantComponents.length + i];
						lastCluster.noteIds.push(...assigned);
						lastCluster.reasons.push(`Assigned ${assigned.length} orphan notes`);
					}
				}

				// Truly unassigned orphans go to uncategorized
				const unassigned = assignedOrphans.get(-1) || [];
				if (unassigned.length > 0) {
					result.push(
						createCluster({
							id: generateClusterId(),
							noteIds: unassigned,
							folderPath: cluster.folderPath,
							dominantTags: [],
							candidateNames: ['Uncategorized', ...cluster.candidateNames],
							internalLinkDensity: 0,
							reasons: [...cluster.reasons, `Unlinked orphan notes (${unassigned.length} notes)`],
						}),
					);
				}
			}
		} else if (significantComponents.length === 1) {
			// Only one significant component - use core-based splitting
			const cores = findCoreNotes(cluster.noteIds, adjacency, linkConfig.corePercentage);

			if (cores.length > 1) {
				// Assign all notes to their nearest core
				const coreAssignments = assignNotesToCores(
					cluster.noteIds,
					cores,
					adjacency,
					resolvedLinks,
					metadata,
				);

				for (let i = 0; i < cores.length; i++) {
					const coreNoteIds = coreAssignments.get(i) || [];
					if (coreNoteIds.length >= config.minClusterSize) {
						result.push(
							createCluster({
								id: generateClusterId(),
								noteIds: coreNoteIds,
								folderPath: cluster.folderPath,
								dominantTags: findDominantTagsForNotes(coreNoteIds, metadata, config),
								candidateNames: [...cluster.candidateNames, `Core ${i + 1}`],
								internalLinkDensity: calculateComponentDensity(coreNoteIds, adjacency),
								reasons: [
									...cluster.reasons,
									`Split by core note: ${coreNoteIds.length} notes around "${cores[i]}"`,
								],
							}),
						);
					} else {
						// Add undersized groups to orphans for later handling
						orphanNotes.push(...coreNoteIds);
					}
				}

				// Handle remaining orphans
				const unassigned = coreAssignments.get(-1) || [];
				if (unassigned.length > 0) {
					result.push(
						createCluster({
							id: generateClusterId(),
							noteIds: unassigned,
							folderPath: cluster.folderPath,
							dominantTags: [],
							candidateNames: ['Uncategorized', ...cluster.candidateNames],
							internalLinkDensity: 0,
							reasons: [...cluster.reasons, `Unassigned notes (${unassigned.length} notes)`],
						}),
					);
				}
			} else {
				// No clear cores - keep cluster as-is
				result.push(cluster);
			}
		} else {
			// No significant components - try keyword-based splitting for large clusters
			if (cluster.noteIds.length > config.maxClusterSize / 2) {
				const keywordClusters = splitOrphansByTitleKeywords(
					cluster.noteIds,
					cluster,
					metadata,
					config,
				);
				result.push(...keywordClusters);
			} else {
				// Keep as-is for smaller clusters
				result.push(
					createCluster({
						id: generateClusterId(),
						noteIds: cluster.noteIds,
						folderPath: cluster.folderPath,
						dominantTags: cluster.dominantTags,
						candidateNames: ['Uncategorized', ...cluster.candidateNames],
						internalLinkDensity: 0,
						reasons: [...cluster.reasons, 'No connected communities found'],
					}),
				);
			}
		}
	}

	return result;
}

/**
 * Split orphan notes by title keywords when no link communities exist
 * Extracts meaningful keywords from note titles and groups by most common keywords
 */
export function splitOrphansByTitleKeywords(
	noteIds: string[],
	parentCluster: Cluster,
	metadata: Map<string, FileMetadata>,
	config: ClusteringConfig,
): Cluster[] {
	// Build keyword frequency map
	const keywordToNotes = new Map<string, string[]>();
	const noteToKeywords = new Map<string, string[]>();

	for (const noteId of noteIds) {
		// Extract filename from path
		const filename = noteId.split('/').pop()?.replace(/\.md$/, '') ?? noteId;
		const keywords = extractTitleKeywords(filename);
		noteToKeywords.set(noteId, keywords);

		for (const keyword of keywords) {
			const notes = keywordToNotes.get(keyword) || [];
			notes.push(noteId);
			keywordToNotes.set(keyword, notes);
		}
	}

	// Find keywords that can form valid clusters (appear in >= minClusterSize notes)
	const validKeywords = Array.from(keywordToNotes.entries())
		.filter(([, notes]) => notes.length >= config.minClusterSize)
		.sort((a, b) => b[1].length - a[1].length);

	if (validKeywords.length === 0) {
		// No valid keywords found - keep as single cluster
		return [
			createCluster({
				id: generateClusterId(),
				noteIds,
				folderPath: parentCluster.folderPath,
				dominantTags: parentCluster.dominantTags,
				candidateNames: ['Uncategorized', ...parentCluster.candidateNames],
				internalLinkDensity: 0,
				reasons: [...parentCluster.reasons, 'No keyword patterns found for splitting'],
			}),
		];
	}

	// Assign notes to their best keyword group
	const assigned = new Set<string>();
	const result: Cluster[] = [];

	for (const [keyword, keywordNotes] of validKeywords) {
		const unassignedNotes = keywordNotes.filter((id) => !assigned.has(id));

		if (unassignedNotes.length >= config.minClusterSize) {
			// Create cluster for this keyword
			for (const noteId of unassignedNotes) {
				assigned.add(noteId);
			}

			result.push(
				createCluster({
					id: generateClusterId(),
					noteIds: unassignedNotes,
					folderPath: parentCluster.folderPath,
					dominantTags: findDominantTagsForNotes(unassignedNotes, metadata, config),
					candidateNames: [formatKeywordAsName(keyword), ...parentCluster.candidateNames],
					internalLinkDensity: 0,
					reasons: [
						...parentCluster.reasons,
						`Split by title keyword: '${keyword}' (${unassignedNotes.length} notes)`,
					],
				}),
			);
		}
	}

	// Handle remaining unassigned notes
	const unassigned = noteIds.filter((id) => !assigned.has(id));
	if (unassigned.length > 0) {
		result.push(
			createCluster({
				id: generateClusterId(),
				noteIds: unassigned,
				folderPath: parentCluster.folderPath,
				dominantTags: [],
				candidateNames: ['Uncategorized', ...parentCluster.candidateNames],
				internalLinkDensity: 0,
				reasons: [...parentCluster.reasons, `Unmatched orphan notes (${unassigned.length} notes)`],
			}),
		);
	}

	return result;
}

/**
 * Format a keyword as a cluster name
 */
function formatKeywordAsName(keyword: string): string {
	return keyword.charAt(0).toUpperCase() + keyword.slice(1);
}

/**
 * Build bidirectional adjacency list from resolved links
 */
export function buildBidirectionalAdjacency(
	noteIds: string[],
	resolvedLinks: ResolvedLinks,
): Map<string, Set<string>> {
	const noteSet = new Set(noteIds);
	const adjacency = new Map<string, Set<string>>();

	// Initialize all notes with empty sets
	for (const noteId of noteIds) {
		adjacency.set(noteId, new Set());
	}

	// Build adjacency (bidirectional)
	for (const noteId of noteIds) {
		const targets = resolvedLinks[noteId];
		if (!targets) continue;

		for (const target of Object.keys(targets)) {
			if (noteSet.has(target) && target !== noteId) {
				// Add both directions
				adjacency.get(noteId)?.add(target);
				adjacency.get(target)?.add(noteId);
			}
		}
	}

	return adjacency;
}

/**
 * Find connected components using BFS
 */
export function findConnectedComponents(
	noteIds: string[],
	adjacency: Map<string, Set<string>>,
): string[][] {
	const visited = new Set<string>();
	const components: string[][] = [];

	for (const noteId of noteIds) {
		if (visited.has(noteId)) continue;

		// BFS to find all connected notes
		const component: string[] = [];
		const queue = [noteId];

		while (queue.length > 0) {
			const current = queue.shift();
			if (current === undefined || visited.has(current)) continue;

			visited.add(current);
			component.push(current);

			const neighbors = adjacency.get(current) || new Set();
			for (const neighbor of neighbors) {
				if (!visited.has(neighbor)) {
					queue.push(neighbor);
				}
			}
		}

		if (component.length > 0) {
			components.push(component);
		}
	}

	// Sort by size (largest first)
	return components.sort((a, b) => b.length - a.length);
}

/**
 * Find core notes (top connected notes by number of connections)
 */
export function findCoreNotes(
	noteIds: string[],
	adjacency: Map<string, Set<string>>,
	corePercentage: number,
): string[] {
	// Calculate connection counts
	const connectionCounts: Array<[string, number]> = noteIds.map((noteId) => [
		noteId,
		adjacency.get(noteId)?.size || 0,
	]);

	// Sort by connection count (descending)
	connectionCounts.sort((a, b) => b[1] - a[1]);

	// Take top percentage, but at least 2 cores if there are enough connected notes
	const connectedNotes = connectionCounts.filter(([, count]) => count > 0);
	const numCores = Math.max(2, Math.ceil(connectedNotes.length * corePercentage));

	return connectedNotes.slice(0, numCores).map(([noteId]) => noteId);
}

/**
 * Assign notes to their nearest core based on:
 * 1. Direct link exists → assign to that core
 * 2. Shared tags → assign to core with highest Jaccard similarity
 * 3. Same parent folder → assign to core in same folder
 * 4. Else → leave in "uncategorized" (index -1)
 */
export function assignNotesToCores(
	noteIds: string[],
	cores: string[],
	adjacency: Map<string, Set<string>>,
	_resolvedLinks: ResolvedLinks,
	metadata: Map<string, FileMetadata>,
): Map<number, string[]> {
	const assignments = new Map<number, string[]>();

	// Initialize assignment arrays
	for (let i = 0; i < cores.length; i++) {
		assignments.set(i, []);
	}
	assignments.set(-1, []); // Unassigned

	for (const noteId of noteIds) {
		// Cores assign to themselves
		const coreIndex = cores.indexOf(noteId);
		if (coreIndex >= 0) {
			assignments.get(coreIndex)?.push(noteId);
			continue;
		}

		// 1. Check direct links to cores
		const neighbors = adjacency.get(noteId) || new Set();
		let assignedCore = -1;

		for (let i = 0; i < cores.length; i++) {
			if (neighbors.has(cores[i])) {
				assignedCore = i;
				break;
			}
		}

		// 2. If no direct link, check tag similarity
		if (assignedCore === -1) {
			const noteMeta = metadata.get(noteId);
			if (noteMeta && noteMeta.tags.length > 0) {
				const noteTags = new Set(noteMeta.tags);
				let bestSimilarity = 0;

				for (let i = 0; i < cores.length; i++) {
					const coreMeta = metadata.get(cores[i]);
					if (coreMeta && coreMeta.tags.length > 0) {
						const similarity = jaccardSimilarity(noteTags, new Set(coreMeta.tags));
						if (similarity > bestSimilarity) {
							bestSimilarity = similarity;
							assignedCore = i;
						}
					}
				}

				// Only assign if similarity is meaningful
				if (bestSimilarity < 0.1) {
					assignedCore = -1;
				}
			}
		}

		// 3. If still unassigned, check folder similarity
		if (assignedCore === -1) {
			const noteFolder = noteId.split('/').slice(0, -1).join('/');
			for (let i = 0; i < cores.length; i++) {
				const coreFolder = cores[i].split('/').slice(0, -1).join('/');
				if (noteFolder === coreFolder) {
					assignedCore = i;
					break;
				}
			}
		}

		assignments.get(assignedCore)?.push(noteId);
	}

	return assignments;
}

/**
 * Assign orphan notes to components based on links and tags
 */
function assignOrphansToComponents(
	orphans: string[],
	components: string[][],
	resolvedLinks: ResolvedLinks,
	metadata: Map<string, FileMetadata>,
): Map<number, string[]> {
	const assignments = new Map<number, string[]>();

	for (let i = 0; i < components.length; i++) {
		assignments.set(i, []);
	}
	assignments.set(-1, []); // Unassigned

	const componentSets = components.map((c) => new Set(c));

	for (const orphan of orphans) {
		let assignedComponent = -1;

		// 1. Check if orphan links to any component
		const targets = resolvedLinks[orphan];
		if (targets) {
			for (const target of Object.keys(targets)) {
				for (let i = 0; i < componentSets.length; i++) {
					if (componentSets[i].has(target)) {
						assignedComponent = i;
						break;
					}
				}
				if (assignedComponent >= 0) break;
			}
		}

		// 2. Check if any component links to orphan
		if (assignedComponent === -1) {
			for (let i = 0; i < components.length; i++) {
				for (const noteId of components[i]) {
					const noteTargets = resolvedLinks[noteId];
					if (noteTargets?.[orphan]) {
						assignedComponent = i;
						break;
					}
				}
				if (assignedComponent >= 0) break;
			}
		}

		// 3. Check tag similarity
		if (assignedComponent === -1) {
			const orphanMeta = metadata.get(orphan);
			if (orphanMeta && orphanMeta.tags.length > 0) {
				const orphanTags = new Set(orphanMeta.tags);
				let bestSimilarity = 0;

				for (let i = 0; i < components.length; i++) {
					// Get tags from first few notes in component
					const sampleSize = Math.min(5, components[i].length);
					const componentTags = new Set<string>();

					for (let j = 0; j < sampleSize; j++) {
						const noteMeta = metadata.get(components[i][j]);
						if (noteMeta) {
							for (const tag of noteMeta.tags) {
								componentTags.add(tag);
							}
						}
					}

					const similarity = jaccardSimilarity(orphanTags, componentTags);
					if (similarity > bestSimilarity && similarity >= 0.1) {
						bestSimilarity = similarity;
						assignedComponent = i;
					}
				}
			}
		}

		assignments.get(assignedComponent)?.push(orphan);
	}

	return assignments;
}

/**
 * Calculate Jaccard similarity between two sets
 */
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
	if (setA.size === 0 || setB.size === 0) return 0;

	let intersection = 0;
	for (const item of setA) {
		if (setB.has(item)) intersection++;
	}

	const union = setA.size + setB.size - intersection;
	return union > 0 ? intersection / union : 0;
}

/**
 * Find dominant tags for a set of notes
 */
function findDominantTagsForNotes(
	noteIds: string[],
	metadata: Map<string, FileMetadata>,
	config: ClusteringConfig,
): string[] {
	const tagCounts = new Map<string, number>();

	for (const noteId of noteIds) {
		const meta = metadata.get(noteId);
		if (meta) {
			for (const tag of meta.tags) {
				tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
			}
		}
	}

	const threshold = noteIds.length * config.dominantTagThreshold;
	const dominantTags: string[] = [];

	for (const [tag, count] of tagCounts) {
		if (count >= threshold) {
			dominantTags.push(tag);
		}
	}

	return dominantTags.sort((a, b) => (tagCounts.get(b) || 0) - (tagCounts.get(a) || 0));
}

/**
 * Calculate link density for a component
 */
function calculateComponentDensity(noteIds: string[], adjacency: Map<string, Set<string>>): number {
	if (noteIds.length < 2) return 0;

	let totalEdges = 0;
	for (const noteId of noteIds) {
		const neighbors = adjacency.get(noteId) || new Set();
		// Only count neighbors within this component
		const noteSet = new Set(noteIds);
		for (const neighbor of neighbors) {
			if (noteSet.has(neighbor)) {
				totalEdges++;
			}
		}
	}

	// Each edge is counted twice (bidirectional), so divide by 2
	const edges = totalEdges / 2;
	const maxEdges = (noteIds.length * (noteIds.length - 1)) / 2;

	return maxEdges > 0 ? edges / maxEdges : 0;
}
