import {
  computeCentroid,
  computeClusterCentroids,
  cosineSimilarity,
  euclideanDistance,
  findNearestCentroid,
  selectRepresentatives,
} from '@/domain/clustering/centroidCalculator';
import { describe, expect, it } from 'vitest';

describe('centroidCalculator', () => {
  describe('computeCentroid', () => {
    it('should throw error for empty embedding set', () => {
      expect(() => computeCentroid([])).toThrow('Cannot compute centroid of empty embedding set');
    });

    it('should return the embedding itself for single embedding', () => {
      const embeddings = [[1, 2, 3]];
      const centroid = computeCentroid(embeddings);
      expect(centroid).toEqual([1, 2, 3]);
    });

    it('should compute mean of embeddings', () => {
      const embeddings = [
        [0, 0, 0],
        [2, 4, 6],
      ];
      const centroid = computeCentroid(embeddings);
      expect(centroid).toEqual([1, 2, 3]);
    });

    it('should handle negative values', () => {
      const embeddings = [
        [-2, -4],
        [2, 4],
      ];
      const centroid = computeCentroid(embeddings);
      expect(centroid).toEqual([0, 0]);
    });

    it('should throw error for inconsistent dimensions', () => {
      const embeddings = [
        [1, 2, 3],
        [1, 2], // Different dimensions
      ];
      expect(() => computeCentroid(embeddings)).toThrow('Inconsistent embedding dimensions');
    });

    it('should handle many embeddings', () => {
      const embeddings = [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ];
      const centroid = computeCentroid(embeddings);
      expect(centroid).toEqual([0, 0]);
    });
  });

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const a = [1, 2, 3];
      const b = [1, 2, 3];
      expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
    });

    it('should return -1 for opposite vectors', () => {
      const a = [1, 0, 0];
      const b = [-1, 0, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
    });

    it('should return 0 for orthogonal vectors', () => {
      const a = [1, 0];
      const b = [0, 1];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
    });

    it('should be scale-invariant', () => {
      const a = [1, 2, 3];
      const b = [2, 4, 6]; // Same direction, different magnitude
      expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
    });

    it('should throw error for mismatched dimensions', () => {
      const a = [1, 2, 3];
      const b = [1, 2];
      expect(() => cosineSimilarity(a, b)).toThrow('Vector dimensions must match');
    });

    it('should handle zero vectors', () => {
      const a = [0, 0, 0];
      const b = [1, 2, 3];
      expect(cosineSimilarity(a, b)).toBe(0);
    });
  });

  describe('euclideanDistance', () => {
    it('should return 0 for identical vectors', () => {
      const a = [1, 2, 3];
      const b = [1, 2, 3];
      expect(euclideanDistance(a, b)).toBeCloseTo(0.0);
    });

    it('should compute correct distance for simple case', () => {
      const a = [0, 0];
      const b = [3, 4];
      expect(euclideanDistance(a, b)).toBeCloseTo(5.0); // 3-4-5 triangle
    });

    it('should throw error for mismatched dimensions', () => {
      const a = [1, 2, 3];
      const b = [1, 2];
      expect(() => euclideanDistance(a, b)).toThrow('Vector dimensions must match');
    });

    it('should be symmetric', () => {
      const a = [1, 2, 3];
      const b = [4, 5, 6];
      expect(euclideanDistance(a, b)).toBeCloseTo(euclideanDistance(b, a));
    });
  });

  describe('selectRepresentatives', () => {
    it('should return empty array for empty embeddings', () => {
      const result = selectRepresentatives([], [0, 0, 0], 5);
      expect(result).toEqual([]);
    });

    it('should return all indices when topK >= embeddings length', () => {
      const embeddings = [
        { index: 0, embedding: [1, 0] },
        { index: 1, embedding: [0, 1] },
      ];
      const result = selectRepresentatives(embeddings, [0.5, 0.5], 10);
      expect(result).toEqual([0, 1]);
    });

    it('should select indices closest to centroid', () => {
      const embeddings = [
        { index: 0, embedding: [1, 0] }, // Similarity to centroid: depends on centroid
        { index: 1, embedding: [0.9, 0.1] }, // Close to [1, 0]
        { index: 2, embedding: [0, 1] }, // Far from [1, 0]
      ];
      const centroid = [1, 0];
      const result = selectRepresentatives(embeddings, centroid, 2);

      // Index 0 should be first (identical to centroid), then index 1
      expect(result).toContain(0);
      expect(result.length).toBe(2);
    });

    it('should order by similarity (highest first)', () => {
      const embeddings = [
        { index: 0, embedding: [0, 1] }, // Orthogonal to centroid
        { index: 1, embedding: [1, 0] }, // Same as centroid
        { index: 2, embedding: [Math.SQRT1_2, Math.SQRT1_2] }, // 45 degrees
      ];
      const centroid = [1, 0];
      const result = selectRepresentatives(embeddings, centroid, 2);

      // Index 1 should be first (highest similarity)
      expect(result[0]).toBe(1);
    });
  });

  describe('computeClusterCentroids', () => {
    it('should throw error for mismatched lengths', () => {
      expect(() => computeClusterCentroids([[1, 2]], [0, 1], 5)).toThrow('length mismatch');
    });

    it('should skip noise points (label -1)', () => {
      const embeddings = [
        [1, 0],
        [0, 1],
        [5, 5], // noise
      ];
      const labels = [0, 0, -1];
      const results = computeClusterCentroids(embeddings, labels, 2);

      expect(results.length).toBe(1);
      expect(results[0].label).toBe(0);
      expect(results[0].memberCount).toBe(2);
    });

    it('should compute centroids for multiple clusters', () => {
      const embeddings = [
        [0, 0],
        [1, 1], // cluster 0
        [10, 10],
        [11, 11], // cluster 1
      ];
      const labels = [0, 0, 1, 1];
      const results = computeClusterCentroids(embeddings, labels, 2);

      expect(results.length).toBe(2);

      const cluster0 = results.find((r) => r.label === 0);
      expect(cluster0).toBeDefined();
      expect(cluster0?.centroid).toEqual([0.5, 0.5]);
      expect(cluster0?.memberCount).toBe(2);

      const cluster1 = results.find((r) => r.label === 1);
      expect(cluster1).toBeDefined();
      expect(cluster1?.centroid).toEqual([10.5, 10.5]);
      expect(cluster1?.memberCount).toBe(2);
    });

    it('should select correct number of representatives', () => {
      const embeddings = [
        [0, 0],
        [0.1, 0.1],
        [0.2, 0.2],
        [1, 1],
        [0.3, 0.3],
      ];
      const labels = [0, 0, 0, 0, 0];
      const results = computeClusterCentroids(embeddings, labels, 2);

      expect(results.length).toBe(1);
      expect(results[0].representativeIndices.length).toBe(2);
    });
  });

  describe('findNearestCentroid', () => {
    it('should return null for empty centroids', () => {
      const result = findNearestCentroid([1, 2, 3], new Map());
      expect(result).toBeNull();
    });

    it('should find the nearest centroid', () => {
      const centroids = new Map<string, number[]>([
        ['cluster-1', [1, 0]],
        ['cluster-2', [0, 1]],
        ['cluster-3', [-1, 0]],
      ]);

      // Embedding close to cluster-1
      const embedding = [0.9, 0.1];
      const result = findNearestCentroid(embedding, centroids);

      expect(result).toBe('cluster-1');
    });

    it('should handle equidistant cases (returns first found)', () => {
      const centroids = new Map<string, number[]>([
        ['cluster-1', [1, 0]],
        ['cluster-2', [-1, 0]],
      ]);

      // Equidistant from both
      const embedding = [0, 1];
      const result = findNearestCentroid(embedding, centroids);

      // Should return one of them (implementation dependent)
      expect(['cluster-1', 'cluster-2']).toContain(result);
    });
  });
});
