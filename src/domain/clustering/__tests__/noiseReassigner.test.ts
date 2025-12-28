import { describe, expect, it } from 'vitest';
import { reassignNoiseNotes } from '../noiseReassigner';
import type { EmbeddingCluster } from '../types';

/**
 * Helper to create a minimal EmbeddingCluster for testing
 */
function createTestCluster(
	id: string,
	noteIds: string[],
	centroid: number[],
	representativeNotes: string[] = [],
): EmbeddingCluster {
	return {
		id,
		noteIds,
		centroid,
		representativeNotes,
		candidateNames: [],
		dominantTags: [],
		folderPath: '',
		internalLinkDensity: 0,
		createdAt: Date.now(),
		reasons: [],
	};
}

describe('noiseReassigner', () => {
	describe('reassignNoiseNotes', () => {
		it('should return unchanged result for empty clusters', () => {
			const noiseNotes = ['note1.md', 'note2.md'];
			const embeddings = new Map([
				['note1.md', [1, 0]],
				['note2.md', [0, 1]],
			]);

			const result = reassignNoiseNotes([], noiseNotes, embeddings, 0.5);

			expect(result.clusters).toEqual([]);
			expect(result.remainingNoise).toEqual(noiseNotes);
			expect(result.reassignedCount).toBe(0);
		});

		it('should return unchanged result for empty noise notes', () => {
			const clusters = [createTestCluster('c1', ['a.md'], [1, 0])];
			const embeddings = new Map([['a.md', [1, 0]]]);

			const result = reassignNoiseNotes(clusters, [], embeddings, 0.5);

			expect(result.clusters).toEqual(clusters);
			expect(result.remainingNoise).toEqual([]);
			expect(result.reassignedCount).toBe(0);
		});

		it('should reassign noise note to nearest cluster above threshold', () => {
			const clusters = [
				createTestCluster('c1', ['a.md'], [1, 0]),
				createTestCluster('c2', ['b.md'], [0, 1]),
			];
			const embeddings = new Map([
				['a.md', [1, 0]],
				['b.md', [0, 1]],
				['noise.md', [0.9, 0.1]], // Very similar to c1
			]);

			const result = reassignNoiseNotes(clusters, ['noise.md'], embeddings, 0.5);

			expect(result.reassignedCount).toBe(1);
			expect(result.remainingNoise).toEqual([]);

			const updatedC1 = result.clusters.find((c) => c.id === 'c1');
			expect(updatedC1?.noteIds).toContain('noise.md');
		});

		it('should keep noise note as noise when below threshold', () => {
			const clusters = [createTestCluster('c1', ['a.md'], [1, 0])];
			const embeddings = new Map([
				['a.md', [1, 0]],
				['noise.md', [0, 1]], // Orthogonal to c1 (similarity = 0)
			]);

			const result = reassignNoiseNotes(clusters, ['noise.md'], embeddings, 0.5);

			expect(result.reassignedCount).toBe(0);
			expect(result.remainingNoise).toEqual(['noise.md']);
			expect(result.clusters[0].noteIds).not.toContain('noise.md');
		});

		it('should handle noise notes without embeddings', () => {
			const clusters = [createTestCluster('c1', ['a.md'], [1, 0])];
			const embeddings = new Map([['a.md', [1, 0]]]);
			// 'missing.md' has no embedding

			const result = reassignNoiseNotes(clusters, ['missing.md'], embeddings, 0.5);

			expect(result.reassignedCount).toBe(0);
			expect(result.remainingNoise).toEqual(['missing.md']);
		});

		it('should not recompute centroids (caller responsibility)', () => {
			const originalCentroid = [1, 0];
			const clusters = [createTestCluster('c1', ['a.md'], originalCentroid)];
			const embeddings = new Map([
				['a.md', [1, 0]],
				['noise.md', [0.8, 0.6]], // Would shift centroid if recomputed
			]);

			const result = reassignNoiseNotes(clusters, ['noise.md'], embeddings, 0.5);

			expect(result.reassignedCount).toBe(1);
			expect(result.clusters[0].noteIds).toContain('noise.md');
			// Centroid should remain unchanged - caller is responsible for recomputing
			expect(result.clusters[0].centroid).toEqual(originalCentroid);
		});

		it('should not update representative notes (caller responsibility)', () => {
			const clusters = [createTestCluster('c1', ['a.md', 'b.md'], [1, 0], ['a.md'])];
			const embeddings = new Map([
				['a.md', [1, 0]],
				['b.md', [0.95, 0.05]],
				['noise.md', [0.99, 0.01]], // Very close to centroid
			]);

			const result = reassignNoiseNotes(clusters, ['noise.md'], embeddings, 0.5);

			expect(result.clusters[0].noteIds).toContain('noise.md');
			// Representative notes should remain unchanged - caller is responsible for recomputing
			expect(result.clusters[0].representativeNotes).toEqual(['a.md']);
		});

		it('should assign to nearest cluster when multiple clusters exist', () => {
			const clusters = [
				createTestCluster('c1', ['a.md'], [1, 0, 0]),
				createTestCluster('c2', ['b.md'], [0, 1, 0]),
				createTestCluster('c3', ['c.md'], [0, 0, 1]),
			];
			const embeddings = new Map([
				['a.md', [1, 0, 0]],
				['b.md', [0, 1, 0]],
				['c.md', [0, 0, 1]],
				['noise.md', [0.1, 0.95, 0.05]], // Closest to c2
			]);

			const result = reassignNoiseNotes(clusters, ['noise.md'], embeddings, 0.5);

			expect(result.reassignedCount).toBe(1);
			const updatedC2 = result.clusters.find((c) => c.id === 'c2');
			expect(updatedC2?.noteIds).toContain('noise.md');
		});

		it('should handle multiple noise notes with mixed reassignment', () => {
			const clusters = [createTestCluster('c1', ['a.md'], [1, 0])];
			const embeddings = new Map([
				['a.md', [1, 0]],
				['close.md', [0.9, 0.1]], // Above threshold
				['far.md', [0, 1]], // Below threshold (orthogonal)
			]);

			const result = reassignNoiseNotes(clusters, ['close.md', 'far.md'], embeddings, 0.5);

			expect(result.reassignedCount).toBe(1);
			expect(result.remainingNoise).toEqual(['far.md']);
			expect(result.clusters[0].noteIds).toContain('close.md');
			expect(result.clusters[0].noteIds).not.toContain('far.md');
		});

		it('should respect threshold exactly at boundary', () => {
			// Create a scenario where similarity is exactly at threshold
			const clusters = [createTestCluster('c1', ['a.md'], [1, 0])];
			// Embedding with cosine similarity of exactly 0.5 to [1, 0]
			// cos(θ) = 0.5 → θ = 60° → [0.5, sqrt(3)/2] ≈ [0.5, 0.866]
			const embeddings = new Map([
				['a.md', [1, 0]],
				['boundary.md', [0.5, Math.sqrt(3) / 2]],
			]);

			const result = reassignNoiseNotes(clusters, ['boundary.md'], embeddings, 0.5);

			// Should be reassigned since similarity >= threshold
			expect(result.reassignedCount).toBe(1);
			expect(result.clusters[0].noteIds).toContain('boundary.md');
		});

		it('should handle high threshold rejecting all noise', () => {
			const clusters = [createTestCluster('c1', ['a.md'], [1, 0])];
			const embeddings = new Map([
				['a.md', [1, 0]],
				['noise.md', [0.9, 0.1]], // Similarity ~0.99
			]);

			const result = reassignNoiseNotes(clusters, ['noise.md'], embeddings, 0.999);

			// Even very similar note rejected at very high threshold
			expect(result.reassignedCount).toBe(0);
			expect(result.remainingNoise).toEqual(['noise.md']);
		});

		it('should handle low threshold accepting all noise', () => {
			const clusters = [createTestCluster('c1', ['a.md'], [1, 0])];
			const embeddings = new Map([
				['a.md', [1, 0]],
				['noise.md', [0.1, 0.99]], // Low similarity to cluster
			]);

			const result = reassignNoiseNotes(clusters, ['noise.md'], embeddings, 0.0);

			// Any positive similarity accepted at 0 threshold
			expect(result.reassignedCount).toBe(1);
		});

		it('should preserve other cluster properties after reassignment', () => {
			const clusters: EmbeddingCluster[] = [
				{
					id: 'c1',
					noteIds: ['a.md'],
					centroid: [1, 0],
					representativeNotes: ['a.md'],
					candidateNames: ['Test Cluster'],
					dominantTags: ['#tag1'],
					folderPath: '/folder',
					internalLinkDensity: 0.5,
					createdAt: 1234567890,
					reasons: ['reason1'],
				},
			];
			const embeddings = new Map([
				['a.md', [1, 0]],
				['noise.md', [0.9, 0.1]],
			]);

			const result = reassignNoiseNotes(clusters, ['noise.md'], embeddings, 0.5);

			const updated = result.clusters[0];
			expect(updated.candidateNames).toEqual(['Test Cluster']);
			expect(updated.dominantTags).toEqual(['#tag1']);
			expect(updated.folderPath).toBe('/folder');
			expect(updated.internalLinkDensity).toBe(0.5);
			expect(updated.createdAt).toBe(1234567890);
			expect(updated.reasons).toEqual(['reason1']);
		});
	});
});
