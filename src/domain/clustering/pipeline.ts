import type { FileMetadata, ResolvedLinks } from '@/ports/IMetadataProvider';
import type { FileInfo } from '@/ports/IVaultProvider';
import { analyzeLinks } from './analyzeLinks';
import { clusterByFolder } from './clusterByFolder';
import { enhanceCohesionWithImplicitLinks } from './enhanceCohesionWithImplicitLinks';
import { filterExcludedPaths } from './filterFiles';
import { groupByTitleKeywords } from './groupByTitleKeywords';
import {
	type SpecialNotesConfig,
	assignStubNotesToClusters,
	createTemplatesCluster,
	preprocessSpecialNotes,
} from './handleSpecialNotes';
import { mergeRelatedClusters } from './mergeRelatedClusters';
import { mergeSmallClustersIntoLarge } from './mergeSmallClustersIntoLarge';
import { normalizeClusterSizes } from './normalizeClusterSizes';
import { refineByTags } from './refineByTags';
import { splitByLinkCommunities } from './splitByLinkCommunities';
import type { Cluster, ClusteringConfig } from './types';
import { DEFAULT_CLUSTERING_CONFIG } from './types';

/**
 * Input for the clustering pipeline
 */
export interface PipelineInput {
	files: FileInfo[];
	metadata: Map<string, FileMetadata>;
	resolvedLinks: ResolvedLinks;
	config?: Partial<ClusteringConfig>;
}

/**
 * Result from the clustering pipeline
 */
export interface PipelineResult {
	clusters: Cluster[];
	stats: PipelineStats;
}

/**
 * Statistics about the clustering run
 */
export interface PipelineStats {
	totalNotes: number;
	totalClusters: number;
	averageClusterSize: number;
	minClusterSize: number;
	maxClusterSize: number;
}

/**
 * Run the complete clustering pipeline
 *
 * The pipeline executes the following steps:
 * 0. Preprocess: Separate stub/template notes
 * 1. Group notes by folder (initial clustering)
 * 2. Refine clusters by dominant tags
 * 3. Analyze link density within clusters
 * 3.5. Split large low-density clusters by link communities
 * 4. Merge highly-connected clusters
 * 5. Further refine by title keywords
 * 6. Normalize cluster sizes (split large, merge small)
 * 6.5. Merge small clusters into related large clusters
 * 7. Enhance cohesion with implicit tag links
 * 8. Assign stub notes back to clusters
 * 9. Add template cluster if applicable
 *
 * @param input - Pipeline input containing files, metadata, and config
 * @returns Pipeline result with clusters and statistics
 */
export function runClusteringPipeline(input: PipelineInput): PipelineResult {
	const config: ClusteringConfig = {
		...DEFAULT_CLUSTERING_CONFIG,
		...input.config,
	};

	const { metadata, resolvedLinks } = input;

	// Filter excluded paths before clustering
	const filteredFiles = filterExcludedPaths(input.files, config);

	// Create file map for quick lookups
	const fileMap = new Map<string, FileInfo>();
	for (const file of filteredFiles) {
		fileMap.set(file.path, file);
	}

	// Step 0: Preprocess - separate stub and template notes
	const specialNotesConfig: SpecialNotesConfig = {
		stubWordThreshold: config.stubWordThreshold,
		templatePatterns: [
			/^template/i,
			/template$/i,
			/^_template/i,
			/\.template$/i,
			/\/templates?\//i,
		],
		excludeTemplates: config.excludeTemplates,
	};

	const { regularFiles, stubFiles, templateFiles } = preprocessSpecialNotes(
		filteredFiles,
		metadata,
		specialNotesConfig,
	);

	// Use regular files for main clustering
	const files = regularFiles;

	// Step 1: Initial clustering by folder
	let clusters = clusterByFolder(files, config);

	// Step 2: Refine by tags
	clusters = refineByTags(clusters, metadata, config);

	// Step 3: Analyze link density
	clusters = analyzeLinks(clusters, resolvedLinks, config);

	// Step 3.5: Split large low-density clusters by link communities
	clusters = splitByLinkCommunities(clusters, resolvedLinks, metadata, config);

	// Step 4: Merge related clusters based on links
	clusters = mergeRelatedClusters(clusters, resolvedLinks, config);

	// Step 5: Further refine by title keywords
	clusters = groupByTitleKeywords(clusters, fileMap, config);

	// Step 6: Normalize cluster sizes
	clusters = normalizeClusterSizes(clusters, resolvedLinks, config);

	// Step 6.5: Merge small clusters into related large clusters
	clusters = mergeSmallClustersIntoLarge(clusters, metadata, config);

	// Step 7: Enhance cohesion with implicit tag links
	clusters = enhanceCohesionWithImplicitLinks(clusters, metadata, config);

	// Step 8: Assign stub notes back to clusters
	if (stubFiles.length > 0) {
		clusters = assignStubNotesToClusters(
			stubFiles.map((f) => f.path),
			clusters,
			resolvedLinks,
			metadata,
		);
	}

	// Step 9: Add template cluster if applicable
	if (templateFiles.length > 0 && !config.excludeTemplates) {
		const templateCluster = createTemplatesCluster(
			templateFiles.map((f) => f.path),
			'',
		);
		if (templateCluster) {
			clusters.push(templateCluster);
		}
	}

	// Calculate statistics
	const stats = calculateStats(clusters);

	return {
		clusters,
		stats,
	};
}

/**
 * Calculate statistics about the clusters
 */
function calculateStats(clusters: Cluster[]): PipelineStats {
	if (clusters.length === 0) {
		return {
			totalNotes: 0,
			totalClusters: 0,
			averageClusterSize: 0,
			minClusterSize: 0,
			maxClusterSize: 0,
		};
	}

	const sizes = clusters.map((c) => c.noteIds.length);
	const totalNotes = sizes.reduce((sum, size) => sum + size, 0);

	return {
		totalNotes,
		totalClusters: clusters.length,
		averageClusterSize: totalNotes / clusters.length,
		minClusterSize: Math.min(...sizes),
		maxClusterSize: Math.max(...sizes),
	};
}
