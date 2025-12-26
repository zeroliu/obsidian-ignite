import type { FileMetadata } from '@/ports/IMetadataProvider';
import type { FileInfo } from '@/ports/IVaultProvider';

/**
 * A cluster of related notes
 */
export interface Cluster {
	/** Unique identifier for the cluster */
	id: string;
	/** Candidate names for this cluster (for LLM naming) */
	candidateNames: string[];
	/** File paths of notes in this cluster */
	noteIds: string[];
	/** Most common tags in this cluster */
	dominantTags: string[];
	/** Common folder path for notes in cluster */
	folderPath: string;
	/** Ratio of internal links to possible links (0-1) */
	internalLinkDensity: number;
	/** Timestamp when cluster was created */
	createdAt: number;
	/** Reasons explaining why notes are clustered together */
	reasons: string[];
}

/**
 * Configuration for clustering algorithms
 */
export interface ClusteringConfig {
	/** Minimum number of notes in a cluster (default: 5) */
	minClusterSize: number;
	/** Maximum number of notes in a cluster (default: 500) */
	maxClusterSize: number;
	/** Threshold for link density to consider merging (default: 0.3) */
	linkDensityThreshold: number;
	/** Number of notes to sample for link analysis (default: 50) */
	sampleSize: number;
	/** Minimum tag frequency to be considered dominant (default: 0.3) */
	dominantTagThreshold: number;
	/** Overlap threshold for merging clusters (default: 0.3) */
	mergeOverlapThreshold: number;
	/** Glob patterns for paths to exclude from clustering (default: []) */
	excludePaths: string[];
	/** Minimum word count to not be considered a stub note (default: 50) */
	stubWordThreshold: number;
	/** Whether to exclude template notes from clustering (default: true) */
	excludeTemplates: boolean;
	/** Link density threshold for splitting clusters (default: 0.15) */
	linkSplitDensityThreshold: number;
	/** Minimum cluster size to consider for link-based splitting (default: 50) */
	minSizeForLinkSplit: number;
}

/**
 * Default clustering configuration
 */
export const DEFAULT_CLUSTERING_CONFIG: ClusteringConfig = {
	minClusterSize: 5,
	maxClusterSize: 50,
	linkDensityThreshold: 0.3,
	sampleSize: 50,
	dominantTagThreshold: 0.3,
	mergeOverlapThreshold: 0.3,
	excludePaths: [],
	stubWordThreshold: 50,
	excludeTemplates: true,
	linkSplitDensityThreshold: 0.15,
	minSizeForLinkSplit: 30,
};

/**
 * Input data for clustering
 */
export interface ClusteringInput {
	/** File information for all notes */
	files: FileInfo[];
	/** Metadata for all notes (map of path to metadata) */
	metadata: Map<string, FileMetadata>;
	/** Configuration for clustering */
	config: ClusteringConfig;
}

/**
 * Helper to create a cluster with defaults
 */
export function createCluster(partial: Partial<Cluster> & { noteIds: string[] }): Cluster {
	return {
		id: partial.id ?? `cluster-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		candidateNames: partial.candidateNames ?? [],
		noteIds: partial.noteIds,
		dominantTags: partial.dominantTags ?? [],
		folderPath: partial.folderPath ?? '',
		internalLinkDensity: partial.internalLinkDensity ?? 0,
		createdAt: partial.createdAt ?? Date.now(),
		reasons: partial.reasons ?? [],
	};
}

/**
 * Generate a unique cluster ID
 */
export function generateClusterId(): string {
	return `cluster-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
