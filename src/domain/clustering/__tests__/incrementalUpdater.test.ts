import { describe, expect, it } from 'vitest';
import {
	applyIncrementalUpdate,
	assignNotesToClusters,
	detectChanges,
	updateClusteringState,
} from '../incrementalUpdater';
import type { ClusteringState, EmbeddingCluster } from '../types';

describe('incrementalUpdater', () => {
	describe('detectChanges', () => {
		it('should detect all notes as new when no previous state', () => {
			const currentNotes = new Map([
				['note1.md', 'hash1'],
				['note2.md', 'hash2'],
			]);

			const result = detectChanges(currentNotes, null);

			expect(result.newNotes).toEqual(['note1.md', 'note2.md']);
			expect(result.modifiedNotes).toEqual([]);
			expect(result.deletedNotes).toEqual([]);
			expect(result.changePercentage).toBe(1);
			expect(result.shouldUseIncremental).toBe(false);
		});

		it('should detect new notes', () => {
			const previousState: ClusteringState = {
				clusters: [],
				centroids: new Map(),
				lastFullClusteringAt: Date.now(),
				noteHashes: new Map([['note1.md', 'hash1']]),
			};

			const currentNotes = new Map([
				['note1.md', 'hash1'],
				['note2.md', 'hash2'], // New
			]);

			const result = detectChanges(currentNotes, previousState);

			expect(result.newNotes).toEqual(['note2.md']);
			expect(result.modifiedNotes).toEqual([]);
			expect(result.deletedNotes).toEqual([]);
		});

		it('should detect modified notes', () => {
			const previousState: ClusteringState = {
				clusters: [],
				centroids: new Map(),
				lastFullClusteringAt: Date.now(),
				noteHashes: new Map([['note1.md', 'hash1']]),
			};

			const currentNotes = new Map([['note1.md', 'hash1-modified']]);

			const result = detectChanges(currentNotes, previousState);

			expect(result.newNotes).toEqual([]);
			expect(result.modifiedNotes).toEqual(['note1.md']);
			expect(result.deletedNotes).toEqual([]);
		});

		it('should detect deleted notes', () => {
			const previousState: ClusteringState = {
				clusters: [],
				centroids: new Map(),
				lastFullClusteringAt: Date.now(),
				noteHashes: new Map([
					['note1.md', 'hash1'],
					['note2.md', 'hash2'],
				]),
			};

			const currentNotes = new Map([['note1.md', 'hash1']]);

			const result = detectChanges(currentNotes, previousState);

			expect(result.newNotes).toEqual([]);
			expect(result.modifiedNotes).toEqual([]);
			expect(result.deletedNotes).toEqual(['note2.md']);
		});

		it('should calculate change percentage correctly', () => {
			const previousState: ClusteringState = {
				clusters: [],
				centroids: new Map(),
				lastFullClusteringAt: Date.now(),
				noteHashes: new Map([
					['note1.md', 'hash1'],
					['note2.md', 'hash2'],
					['note3.md', 'hash3'],
					['note4.md', 'hash4'],
				]),
			};

			// 1 change out of 4 = 25%
			const currentNotes = new Map([
				['note1.md', 'hash1'],
				['note2.md', 'hash2-modified'], // 1 change
				['note3.md', 'hash3'],
				['note4.md', 'hash4'],
			]);

			const result = detectChanges(currentNotes, previousState);

			expect(result.changePercentage).toBeCloseTo(0.25);
		});

		it('should recommend incremental when below threshold', () => {
			const previousState: ClusteringState = {
				clusters: [],
				centroids: new Map(),
				lastFullClusteringAt: Date.now(),
				noteHashes: new Map(Array.from({ length: 100 }, (_, i) => [`note${i}.md`, `hash${i}`])),
			};

			// 4 changes out of 100 = 4% (below 5% threshold)
			const currentNotes = new Map(
				Array.from({ length: 100 }, (_, i) => [
					`note${i}.md`,
					i < 4 ? `hash${i}-modified` : `hash${i}`,
				]),
			);

			const result = detectChanges(currentNotes, previousState, 0.05);

			expect(result.shouldUseIncremental).toBe(true);
		});

		it('should recommend full clustering when above threshold', () => {
			const previousState: ClusteringState = {
				clusters: [],
				centroids: new Map(),
				lastFullClusteringAt: Date.now(),
				noteHashes: new Map(Array.from({ length: 100 }, (_, i) => [`note${i}.md`, `hash${i}`])),
			};

			// 10 changes out of 100 = 10% (above 5% threshold)
			const currentNotes = new Map(
				Array.from({ length: 100 }, (_, i) => [
					`note${i}.md`,
					i < 10 ? `hash${i}-modified` : `hash${i}`,
				]),
			);

			const result = detectChanges(currentNotes, previousState, 0.05);

			expect(result.shouldUseIncremental).toBe(false);
		});
	});

	describe('assignNotesToClusters', () => {
		const createCluster = (id: string, centroid: number[]): EmbeddingCluster => ({
			id,
			candidateNames: [],
			noteIds: [],
			dominantTags: [],
			folderPath: '',
			internalLinkDensity: 0,
			createdAt: Date.now(),
			reasons: [],
			centroid,
			representativeNotes: [],
		});

		it('should return all notes as unassigned when no clusters', () => {
			const embeddings = [
				{ notePath: 'note1.md', embedding: [1, 0] },
				{ notePath: 'note2.md', embedding: [0, 1] },
			];

			const result = assignNotesToClusters(embeddings, []);

			expect(result.assigned).toEqual([]);
			expect(result.unassigned).toEqual(['note1.md', 'note2.md']);
		});

		it('should assign notes to nearest cluster', () => {
			const clusters = [createCluster('cluster-1', [1, 0]), createCluster('cluster-2', [0, 1])];

			const embeddings = [
				{ notePath: 'note1.md', embedding: [0.9, 0.1] }, // Close to cluster-1
				{ notePath: 'note2.md', embedding: [0.1, 0.9] }, // Close to cluster-2
			];

			const result = assignNotesToClusters(embeddings, clusters);

			expect(result.assigned.length).toBe(2);
			expect(result.assigned.find((a) => a.notePath === 'note1.md')?.clusterId).toBe('cluster-1');
			expect(result.assigned.find((a) => a.notePath === 'note2.md')?.clusterId).toBe('cluster-2');
		});

		it('should mark notes as unassigned when below similarity threshold', () => {
			const clusters = [createCluster('cluster-1', [1, 0])];

			const embeddings = [
				{ notePath: 'note1.md', embedding: [0, 1] }, // Orthogonal - similarity 0
			];

			const result = assignNotesToClusters(embeddings, clusters, 0.3);

			expect(result.assigned).toEqual([]);
			expect(result.unassigned).toEqual(['note1.md']);
		});

		it('should include similarity score in assignments', () => {
			const clusters = [createCluster('cluster-1', [1, 0])];

			const embeddings = [{ notePath: 'note1.md', embedding: [1, 0] }]; // Identical

			const result = assignNotesToClusters(embeddings, clusters, 0.3);

			expect(result.assigned[0].similarity).toBeCloseTo(1.0);
		});
	});

	describe('applyIncrementalUpdate', () => {
		const createCluster = (
			id: string,
			noteIds: string[],
			centroid: number[],
		): EmbeddingCluster => ({
			id,
			candidateNames: [],
			noteIds,
			dominantTags: [],
			folderPath: '',
			internalLinkDensity: 0,
			createdAt: Date.now(),
			reasons: [],
			centroid,
			representativeNotes: [],
		});

		it('should remove deleted notes from clusters', () => {
			const clusters = [createCluster('cluster-1', ['note1.md', 'note2.md', 'note3.md'], [1, 0])];

			const changes = {
				newNotes: [],
				modifiedNotes: [],
				deletedNotes: ['note2.md'],
				totalChanges: 1,
				changePercentage: 0.01,
				shouldUseIncremental: true,
			};

			const result = applyIncrementalUpdate(clusters, changes, []);

			expect(result.clusters[0].noteIds).toEqual(['note1.md', 'note3.md']);
		});

		it('should reassign modified notes', () => {
			const clusters = [
				createCluster('cluster-1', ['note1.md'], [1, 0]),
				createCluster('cluster-2', ['note2.md'], [0, 1]),
			];

			const changes = {
				newNotes: [],
				modifiedNotes: ['note1.md'],
				deletedNotes: [],
				totalChanges: 1,
				changePercentage: 0.01,
				shouldUseIncremental: true,
			};

			// Modified note1 is now closer to cluster-2
			const newEmbeddings = [{ notePath: 'note1.md', embedding: [0.1, 0.9] }];

			const result = applyIncrementalUpdate(clusters, changes, newEmbeddings);

			// note1 should be removed from cluster-1 (which will be empty and filtered)
			// and added to cluster-2
			const cluster1 = result.clusters.find((c) => c.id === 'cluster-1');
			const cluster2 = result.clusters.find((c) => c.id === 'cluster-2');

			// cluster-1 should either be removed (empty) or not contain note1
			if (cluster1) {
				expect(cluster1.noteIds).not.toContain('note1.md');
			}
			// cluster-2 should contain both note1 and note2
			expect(cluster2).toBeDefined();
			expect(cluster2?.noteIds).toContain('note1.md');
			expect(cluster2?.noteIds).toContain('note2.md');
		});

		it('should add new notes to appropriate clusters', () => {
			const clusters = [createCluster('cluster-1', ['note1.md'], [1, 0])];

			const changes = {
				newNotes: ['note2.md'],
				modifiedNotes: [],
				deletedNotes: [],
				totalChanges: 1,
				changePercentage: 0.01,
				shouldUseIncremental: true,
			};

			const newEmbeddings = [{ notePath: 'note2.md', embedding: [0.9, 0.1] }];

			const result = applyIncrementalUpdate(clusters, changes, newEmbeddings);

			expect(result.clusters[0].noteIds).toContain('note2.md');
			expect(result.assignedNotes).toContainEqual({
				notePath: 'note2.md',
				clusterId: 'cluster-1',
			});
		});

		it('should filter out empty clusters', () => {
			const clusters = [
				createCluster('cluster-1', ['note1.md'], [1, 0]),
				createCluster('cluster-2', ['note2.md'], [0, 1]),
			];

			const changes = {
				newNotes: [],
				modifiedNotes: [],
				deletedNotes: ['note2.md'], // This will empty cluster-2
				totalChanges: 1,
				changePercentage: 0.01,
				shouldUseIncremental: true,
			};

			const result = applyIncrementalUpdate(clusters, changes, []);

			expect(result.clusters.length).toBe(1);
			expect(result.clusters[0].id).toBe('cluster-1');
		});
	});

	describe('updateClusteringState', () => {
		it('should create new state with provided data', () => {
			const noteHashes = new Map([
				['note1.md', 'hash1'],
				['note2.md', 'hash2'],
			]);

			const clusters: EmbeddingCluster[] = [
				{
					id: 'cluster-1',
					candidateNames: [],
					noteIds: ['note1.md'],
					dominantTags: [],
					folderPath: '',
					internalLinkDensity: 0,
					createdAt: Date.now(),
					reasons: [],
					centroid: [1, 0],
					representativeNotes: [],
				},
			];

			const state = updateClusteringState(noteHashes, clusters);

			expect(state.noteHashes.get('note1.md')).toBe('hash1');
			expect(state.noteHashes.get('note2.md')).toBe('hash2');
			expect(state.centroids.get('cluster-1')).toEqual([1, 0]);
			expect(state.clusters.length).toBe(1);
			expect(state.clusters[0].id).toBe('cluster-1');
			expect(state.lastFullClusteringAt).toBeGreaterThan(0);
		});
	});
});
