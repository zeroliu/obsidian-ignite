import type { Cluster } from '@/domain/clustering/types';
import type { FileInfo } from '@/ports/IVaultProvider';
import type { ClusterSummary } from './types';

/**
 * Configuration for preparing cluster summaries
 */
export interface PrepareClusterSummariesConfig {
  /** Maximum number of representative titles to include */
  maxRepresentativeTitles: number;
  /** Maximum number of common tags to include */
  maxCommonTags: number;
  /** Batch size for LLM calls */
  batchSize: number;
}

/**
 * Default configuration
 */
export const DEFAULT_PREPARE_CONFIG: PrepareClusterSummariesConfig = {
  maxRepresentativeTitles: 5,
  maxCommonTags: 5,
  batchSize: 20,
};

/**
 * Convert clusters to minimal summaries for LLM processing
 * Extracts representative information while minimizing token usage
 *
 * @param clusters - Clusters to summarize
 * @param fileMap - Map of file paths to FileInfo for getting titles
 * @param config - Configuration options
 * @returns Array of cluster summaries
 */
export function prepareClusterSummaries(
  clusters: Cluster[],
  fileMap: Map<string, FileInfo>,
  config: Partial<PrepareClusterSummariesConfig> = {},
): ClusterSummary[] {
  const finalConfig = { ...DEFAULT_PREPARE_CONFIG, ...config };

  return clusters.map((cluster) => {
    const titles = cluster.noteIds
      .map((noteId) => {
        const file = fileMap.get(noteId);
        return file ? extractTitle(file.path) : null;
      })
      .filter((title): title is string => title !== null);

    return {
      clusterId: cluster.id,
      candidateNames: cluster.candidateNames,
      representativeTitles: selectRepresentativeTitles(titles, finalConfig.maxRepresentativeTitles),
      commonTags: cluster.dominantTags.slice(0, finalConfig.maxCommonTags),
      folderPath: cluster.folderPath,
      noteCount: cluster.noteIds.length,
    };
  });
}

/**
 * Extract title from file path (removes extension and path)
 */
function extractTitle(path: string): string {
  const fileName = path.split('/').pop() || path;
  return fileName.replace(/\.md$/i, '');
}

/**
 * Select diverse representative titles from a list
 * Prioritizes diverse titles over similar ones
 *
 * @param titles - All titles from the cluster
 * @param maxTitles - Maximum number of titles to select
 * @returns Selected representative titles
 */
export function selectRepresentativeTitles(titles: string[], maxTitles: number): string[] {
  if (titles.length <= maxTitles) {
    return titles;
  }

  const selected: string[] = [];
  const remaining = [...titles];

  // Add first title
  if (remaining.length > 0) {
    const first = remaining.shift();
    if (first) {
      selected.push(first);
    }
  }

  // Add diverse titles
  while (selected.length < maxTitles && remaining.length > 0) {
    // Find the title most different from already selected ones
    let bestIndex = 0;
    let bestScore = -1;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const minSimilarity = Math.min(...selected.map((s) => calculateSimilarity(s, candidate)));
      const diversityScore = 1 - minSimilarity;

      if (diversityScore > bestScore) {
        bestScore = diversityScore;
        bestIndex = i;
      }
    }

    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected;
}

/**
 * Calculate simple similarity between two strings (0-1)
 * Based on common word overlap
 */
function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(
    a
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
  const wordsB = new Set(
    b
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }

  return (2 * overlap) / (wordsA.size + wordsB.size);
}

/**
 * Batch cluster summaries for LLM calls
 * Groups summaries into batches of configurable size
 *
 * @param summaries - All cluster summaries
 * @param batchSize - Maximum summaries per batch
 * @returns Array of batches, each containing up to batchSize summaries
 */
export function batchClusterSummaries(
  summaries: ClusterSummary[],
  batchSize: number = DEFAULT_PREPARE_CONFIG.batchSize,
): ClusterSummary[][] {
  const batches: ClusterSummary[][] = [];

  for (let i = 0; i < summaries.length; i += batchSize) {
    batches.push(summaries.slice(i, i + batchSize));
  }

  return batches;
}
