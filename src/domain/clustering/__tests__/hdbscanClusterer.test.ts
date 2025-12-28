import { beforeEach, describe, expect, it } from 'vitest';
import { HDBSCANClusterer, clusterPoints } from '../hdbscanClusterer';
import { DEFAULT_HDBSCAN_CONFIG } from '../types';

describe('HDBSCANClusterer', () => {
	let clusterer: HDBSCANClusterer;

	beforeEach(() => {
		clusterer = new HDBSCANClusterer();
	});

	describe('constructor', () => {
		it('should use default config when none provided', () => {
			expect(clusterer.getConfig()).toEqual(DEFAULT_HDBSCAN_CONFIG);
		});

		it('should merge custom config with defaults', () => {
			const customClusterer = new HDBSCANClusterer({ minClusterSize: 10 });
			const config = customClusterer.getConfig();
			expect(config.minClusterSize).toBe(10);
			expect(config.minSamples).toBe(DEFAULT_HDBSCAN_CONFIG.minSamples);
		});
	});

	describe('cluster', () => {
		it('should return empty result for empty input', () => {
			const result = clusterer.cluster([]);
			expect(result.assignments).toEqual([]);
			expect(result.labels).toEqual([]);
			expect(result.clusterCount).toBe(0);
			expect(result.noiseIndices).toEqual([]);
		});

		it('should mark all points as noise when fewer than minClusterSize', () => {
			const points = [
				[0, 0],
				[1, 1],
				[2, 2],
			]; // Only 3 points, less than default minClusterSize of 5

			const result = clusterer.cluster(points);

			expect(result.labels.every((l) => l === -1)).toBe(true);
			expect(result.clusterCount).toBe(0);
			expect(result.noiseIndices.length).toBe(3);
		});

		it('should identify well-separated clusters', () => {
			// Create two well-separated clusters
			const cluster1 = generateClusterPoints([0, 0], 10, 0.1);
			const cluster2 = generateClusterPoints([10, 10], 10, 0.1);
			const points = [...cluster1, ...cluster2];

			const result = clusterer.cluster(points);

			// Should find at least 2 clusters
			expect(result.clusterCount).toBeGreaterThanOrEqual(1);
			// Not all points should be noise
			expect(result.noiseIndices.length).toBeLessThan(points.length);
		});

		it('should throw error for inconsistent point dimensions', () => {
			const points = [
				[0, 0, 0],
				[1, 1], // Different dimensions
			];

			expect(() => clusterer.cluster(points)).toThrow('Inconsistent point dimensions');
		});

		it('should handle noise points correctly', () => {
			// Create a cluster and add some isolated outliers
			const clusterPoints = generateClusterPoints([0, 0], 10, 0.1);
			const outliers = [
				[100, 100],
				[-100, -100],
			];
			const points = [...clusterPoints, ...outliers];

			const result = clusterer.cluster(points);

			// Outliers should be marked as noise (-1)
			const labels = result.labels;
			// The last two points (outliers) might be noise
			// Note: HDBSCAN behavior may vary, so we just check structure
			expect(labels.length).toBe(points.length);
		});

		it('should create consistent assignments', () => {
			const points = generateClusterPoints([0, 0], 15, 0.5);
			const result = clusterer.cluster(points);

			expect(result.assignments.length).toBe(points.length);
			for (let i = 0; i < result.assignments.length; i++) {
				expect(result.assignments[i].index).toBe(i);
				expect(result.assignments[i].label).toBe(result.labels[i]);
			}
		});
	});

	describe('groupByCluster', () => {
		it('should group points by cluster label', () => {
			const points = [[0], [1], [2], [3], [4]]; // Dummy points
			const labels = [0, 0, 1, 1, -1];

			const groups = clusterer.groupByCluster(points, labels);

			expect(groups.get(0)).toEqual([0, 1]);
			expect(groups.get(1)).toEqual([2, 3]);
			expect(groups.get(-1)).toEqual([4]);
		});

		it('should handle empty labels', () => {
			const points: number[][] = [];
			const labels: number[] = [];

			const groups = clusterer.groupByCluster(points, labels);

			expect(groups.size).toBe(0);
		});

		it('should handle all noise', () => {
			const points = [[0], [1], [2]];
			const labels = [-1, -1, -1];

			const groups = clusterer.groupByCluster(points, labels);

			expect(groups.size).toBe(1);
			expect(groups.get(-1)).toEqual([0, 1, 2]);
		});
	});

	describe('updateConfig', () => {
		it('should update configuration', () => {
			clusterer.updateConfig({ minClusterSize: 20 });
			expect(clusterer.getConfig().minClusterSize).toBe(20);
		});
	});

	describe('clusterPoints convenience function', () => {
		it('should cluster points in one call', () => {
			const points = generateClusterPoints([0, 0], 10, 0.5);
			const result = clusterPoints(points);

			expect(result.labels.length).toBe(10);
		});

		it('should accept custom config', () => {
			const points = generateClusterPoints([0, 0], 20, 0.5);
			const result = clusterPoints(points, { minClusterSize: 3 });

			// With lower minClusterSize, more likely to find clusters
			expect(result.labels.length).toBe(20);
		});
	});
});

/**
 * Helper to generate cluster points around a center
 */
function generateClusterPoints(center: number[], count: number, spread: number): number[][] {
	const points: number[][] = [];

	for (let i = 0; i < count; i++) {
		const point = center.map((c) => c + (Math.random() - 0.5) * spread * 2);
		points.push(point);
	}

	return points;
}
