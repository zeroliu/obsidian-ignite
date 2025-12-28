import { HDBSCAN } from 'hdbscan-ts';
import type { ClusterAssignment, HDBSCANConfig } from './types';
import { DEFAULT_HDBSCAN_CONFIG } from './types';

/**
 * Result of HDBSCAN clustering
 */
export interface HDBSCANResult {
  /** Cluster assignments for each point */
  assignments: ClusterAssignment[];
  /** Labels for each point (-1 for noise) */
  labels: number[];
  /** Number of clusters found (excluding noise) */
  clusterCount: number;
  /** Indices of noise points */
  noiseIndices: number[];
}

/**
 * HDBSCAN-based clusterer for reduced embeddings
 *
 * Uses Hierarchical Density-Based Spatial Clustering of Applications with Noise
 * to automatically discover clusters without specifying the number of clusters.
 */
export class HDBSCANClusterer {
  private config: HDBSCANConfig;

  constructor(config: Partial<HDBSCANConfig> = {}) {
    this.config = { ...DEFAULT_HDBSCAN_CONFIG, ...config };
  }

  /**
   * Cluster points using HDBSCAN
   *
   * @param points - Array of points in reduced embedding space (n_samples x n_dimensions)
   * @returns Cluster assignments and statistics
   */
  cluster(points: number[][]): HDBSCANResult {
    if (points.length === 0) {
      return {
        assignments: [],
        labels: [],
        clusterCount: 0,
        noiseIndices: [],
      };
    }

    // Validate all points have same dimensions
    const dims = points[0].length;
    for (let i = 1; i < points.length; i++) {
      if (points[i].length !== dims) {
        throw new Error(
          `Inconsistent point dimensions: expected ${dims}, got ${points[i].length} at index ${i}`,
        );
      }
    }

    // Handle very small datasets
    if (points.length < this.config.minClusterSize) {
      // All points become noise when fewer than minClusterSize
      const labels = new Array(points.length).fill(-1);
      const assignments = points.map((_, index) => ({ index, label: -1 }));
      return {
        assignments,
        labels,
        clusterCount: 0,
        noiseIndices: points.map((_, i) => i),
      };
    }

    // Create HDBSCAN instance
    const hdbscan = new HDBSCAN({
      minClusterSize: this.config.minClusterSize,
      minSamples: Math.min(this.config.minSamples, points.length - 1),
    });

    // Fit the model
    const labels = hdbscan.fit(points);

    // Build assignments and find noise points
    const assignments: ClusterAssignment[] = [];
    const noiseIndices: number[] = [];
    const clusterIds = new Set<number>();

    for (let i = 0; i < labels.length; i++) {
      assignments.push({ index: i, label: labels[i] });
      if (labels[i] === -1) {
        noiseIndices.push(i);
      } else {
        clusterIds.add(labels[i]);
      }
    }

    return {
      assignments,
      labels,
      clusterCount: clusterIds.size,
      noiseIndices,
    };
  }

  /**
   * Get points grouped by cluster label
   *
   * @param _points - Original points (unused but kept for API consistency)
   * @param labels - Cluster labels from cluster()
   * @returns Map of cluster label to point indices
   */
  groupByCluster(_points: number[][], labels: number[]): Map<number, number[]> {
    const groups = new Map<number, number[]>();

    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      const group = groups.get(label);
      if (group) {
        group.push(i);
      } else {
        groups.set(label, [i]);
      }
    }

    return groups;
  }

  /**
   * Get current configuration
   */
  getConfig(): HDBSCANConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HDBSCANConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Convenience function to cluster points in one call
 *
 * @param points - Points to cluster
 * @param config - HDBSCAN configuration
 * @returns Clustering result
 */
export function clusterPoints(
  points: number[][],
  config: Partial<HDBSCANConfig> = {},
): HDBSCANResult {
  const clusterer = new HDBSCANClusterer(config);
  return clusterer.cluster(points);
}
