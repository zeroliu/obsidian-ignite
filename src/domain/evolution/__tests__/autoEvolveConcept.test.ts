import type { TrackedConcept } from '@/domain/llm/types';
import { describe, expect, it } from 'vitest';
import {
	autoEvolveConcept,
	autoEvolveConceptBatch,
	calculateEvolutionStats,
	filterSurvivingConcepts,
} from '../autoEvolveConcept';
import type { ClusterEvolution } from '../types';

describe('autoEvolveConcept', () => {
	const createTrackedConcept = (
		id: string,
		clusterId: string,
		overrides: Partial<TrackedConcept> = {},
	): TrackedConcept => ({
		id,
		canonicalName: `Concept ${id}`,
		noteIds: ['note1.md', 'note2.md'],
		quizzabilityScore: 0.8,
		clusterId,
		metadata: {
			createdAt: Date.now() - 1000,
			lastUpdated: Date.now() - 1000,
		},
		evolutionHistory: [],
		...overrides,
	});

	describe('autoEvolveConcept', () => {
		it('should handle rename evolution - update clusterId, keep name', () => {
			const concept = createTrackedConcept('concept-1', 'old-cluster');
			const evolution: ClusterEvolution = {
				oldClusterId: 'old-cluster',
				newClusterId: 'new-cluster',
				overlapScore: 0.85,
				type: 'rename',
			};

			const result = autoEvolveConcept(concept, evolution);

			expect(result.action).toBe('renamed');
			expect(result.wasModified).toBe(true);
			expect(result.concept).not.toBeNull();
			expect(result.concept!.clusterId).toBe('new-cluster');
			expect(result.concept!.canonicalName).toBe('Concept concept-1');
			expect(result.concept!.evolutionHistory).toHaveLength(1);
			expect(result.concept!.evolutionHistory[0].type).toBe('rename');
			expect(result.concept!.evolutionHistory[0].fromCluster).toBe('old-cluster');
			expect(result.concept!.evolutionHistory[0].toCluster).toBe('new-cluster');
		});

		it('should handle remap evolution - update clusterId, optionally update name', () => {
			const concept = createTrackedConcept('concept-1', 'old-cluster');
			const evolution: ClusterEvolution = {
				oldClusterId: 'old-cluster',
				newClusterId: 'new-cluster',
				overlapScore: 0.45,
				type: 'remap',
			};

			const result = autoEvolveConcept(concept, evolution, 'New Concept Name');

			expect(result.action).toBe('remapped');
			expect(result.wasModified).toBe(true);
			expect(result.concept).not.toBeNull();
			expect(result.concept!.clusterId).toBe('new-cluster');
			expect(result.concept!.canonicalName).toBe('New Concept Name');
			expect(result.concept!.evolutionHistory).toHaveLength(1);
			expect(result.concept!.evolutionHistory[0].type).toBe('remap');
		});

		it('should handle remap without new name - keep existing name', () => {
			const concept = createTrackedConcept('concept-1', 'old-cluster', {
				canonicalName: 'Original Name',
			});
			const evolution: ClusterEvolution = {
				oldClusterId: 'old-cluster',
				newClusterId: 'new-cluster',
				overlapScore: 0.45,
				type: 'remap',
			};

			const result = autoEvolveConcept(concept, evolution);

			expect(result.concept!.canonicalName).toBe('Original Name');
		});

		it('should handle dissolved evolution - return null concept', () => {
			const concept = createTrackedConcept('concept-1', 'old-cluster');
			const evolution: ClusterEvolution = {
				oldClusterId: 'old-cluster',
				newClusterId: null,
				overlapScore: 0.1,
				type: 'dissolved',
			};

			const result = autoEvolveConcept(concept, evolution);

			expect(result.action).toBe('dissolved');
			expect(result.wasModified).toBe(true);
			expect(result.concept).toBeNull();
		});

		it('should return unchanged when evolution does not apply', () => {
			const concept = createTrackedConcept('concept-1', 'cluster-a');
			const evolution: ClusterEvolution = {
				oldClusterId: 'cluster-b', // Different cluster
				newClusterId: 'new-cluster',
				overlapScore: 0.85,
				type: 'rename',
			};

			const result = autoEvolveConcept(concept, evolution);

			expect(result.action).toBe('unchanged');
			expect(result.wasModified).toBe(false);
			expect(result.concept).toBe(concept);
		});

		it('should preserve existing evolution history', () => {
			const existingHistory = [
				{
					ts: Date.now() - 2000,
					fromCluster: 'ancient-cluster',
					toCluster: 'old-cluster',
					type: 'rename' as const,
					overlapScore: 0.9,
				},
			];
			const concept = createTrackedConcept('concept-1', 'old-cluster', {
				evolutionHistory: existingHistory,
			});
			const evolution: ClusterEvolution = {
				oldClusterId: 'old-cluster',
				newClusterId: 'new-cluster',
				overlapScore: 0.85,
				type: 'rename',
			};

			const result = autoEvolveConcept(concept, evolution);

			expect(result.concept!.evolutionHistory).toHaveLength(2);
			expect(result.concept!.evolutionHistory[0]).toEqual(existingHistory[0]);
			expect(result.concept!.evolutionHistory[1].fromCluster).toBe('old-cluster');
		});

		it('should update lastUpdated timestamp', () => {
			const oldTimestamp = Date.now() - 10000;
			const concept = createTrackedConcept('concept-1', 'old-cluster', {
				metadata: { createdAt: oldTimestamp, lastUpdated: oldTimestamp },
			});
			const evolution: ClusterEvolution = {
				oldClusterId: 'old-cluster',
				newClusterId: 'new-cluster',
				overlapScore: 0.85,
				type: 'rename',
			};

			const beforeUpdate = Date.now();
			const result = autoEvolveConcept(concept, evolution);
			const afterUpdate = Date.now();

			expect(result.concept!.metadata.lastUpdated).toBeGreaterThanOrEqual(beforeUpdate);
			expect(result.concept!.metadata.lastUpdated).toBeLessThanOrEqual(afterUpdate);
			expect(result.concept!.metadata.createdAt).toBe(oldTimestamp);
		});
	});

	describe('autoEvolveConceptBatch', () => {
		it('should evolve multiple concepts based on evolutions', () => {
			const concepts = [
				createTrackedConcept('c1', 'cluster-1'),
				createTrackedConcept('c2', 'cluster-2'),
				createTrackedConcept('c3', 'cluster-3'),
			];
			const evolutions: ClusterEvolution[] = [
				{ oldClusterId: 'cluster-1', newClusterId: 'new-1', overlapScore: 0.9, type: 'rename' },
				{ oldClusterId: 'cluster-2', newClusterId: 'new-2', overlapScore: 0.4, type: 'remap' },
				{ oldClusterId: 'cluster-3', newClusterId: null, overlapScore: 0.1, type: 'dissolved' },
			];
			const newNames = new Map([['new-2', 'Renamed Concept 2']]);

			const results = autoEvolveConceptBatch(concepts, evolutions, newNames);

			expect(results).toHaveLength(3);
			expect(results[0].action).toBe('renamed');
			expect(results[1].action).toBe('remapped');
			expect(results[1].concept!.canonicalName).toBe('Renamed Concept 2');
			expect(results[2].action).toBe('dissolved');
		});

		it('should mark concepts without evolution as unchanged', () => {
			const concepts = [
				createTrackedConcept('c1', 'cluster-1'),
				createTrackedConcept('c2', 'cluster-2'),
			];
			const evolutions: ClusterEvolution[] = [
				{ oldClusterId: 'cluster-1', newClusterId: 'new-1', overlapScore: 0.9, type: 'rename' },
				// No evolution for cluster-2
			];

			const results = autoEvolveConceptBatch(concepts, evolutions);

			expect(results[0].action).toBe('renamed');
			expect(results[1].action).toBe('unchanged');
			expect(results[1].concept).toBe(concepts[1]);
		});

		it('should handle empty concepts', () => {
			const evolutions: ClusterEvolution[] = [
				{ oldClusterId: 'cluster-1', newClusterId: 'new-1', overlapScore: 0.9, type: 'rename' },
			];

			const results = autoEvolveConceptBatch([], evolutions);

			expect(results).toHaveLength(0);
		});

		it('should handle empty evolutions', () => {
			const concepts = [createTrackedConcept('c1', 'cluster-1')];

			const results = autoEvolveConceptBatch(concepts, []);

			expect(results).toHaveLength(1);
			expect(results[0].action).toBe('unchanged');
		});
	});

	describe('filterSurvivingConcepts', () => {
		it('should filter out dissolved concepts', () => {
			const results = [
				{
					concept: createTrackedConcept('c1', 'new-1'),
					wasModified: true,
					action: 'renamed' as const,
				},
				{ concept: null, wasModified: true, action: 'dissolved' as const },
				{
					concept: createTrackedConcept('c3', 'new-3'),
					wasModified: false,
					action: 'unchanged' as const,
				},
			];

			const surviving = filterSurvivingConcepts(results);

			expect(surviving).toHaveLength(2);
			expect(surviving.map((c) => c.id)).toEqual(['c1', 'c3']);
		});

		it('should return empty array when all dissolved', () => {
			const results = [
				{ concept: null, wasModified: true, action: 'dissolved' as const },
				{ concept: null, wasModified: true, action: 'dissolved' as const },
			];

			const surviving = filterSurvivingConcepts(results);

			expect(surviving).toHaveLength(0);
		});

		it('should return all concepts when none dissolved', () => {
			const results = [
				{
					concept: createTrackedConcept('c1', 'new-1'),
					wasModified: true,
					action: 'renamed' as const,
				},
				{
					concept: createTrackedConcept('c2', 'new-2'),
					wasModified: true,
					action: 'remapped' as const,
				},
			];

			const surviving = filterSurvivingConcepts(results);

			expect(surviving).toHaveLength(2);
		});
	});

	describe('calculateEvolutionStats', () => {
		it('should calculate correct statistics', () => {
			const results = [
				{
					concept: createTrackedConcept('c1', 'new-1'),
					wasModified: true,
					action: 'renamed' as const,
				},
				{
					concept: createTrackedConcept('c2', 'new-2'),
					wasModified: true,
					action: 'renamed' as const,
				},
				{
					concept: createTrackedConcept('c3', 'new-3'),
					wasModified: true,
					action: 'remapped' as const,
				},
				{ concept: null, wasModified: true, action: 'dissolved' as const },
				{
					concept: createTrackedConcept('c5', 'old-5'),
					wasModified: false,
					action: 'unchanged' as const,
				},
			];

			const stats = calculateEvolutionStats(results);

			expect(stats.renamed).toBe(2);
			expect(stats.remapped).toBe(1);
			expect(stats.dissolved).toBe(1);
			expect(stats.unchanged).toBe(1);
		});

		it('should handle empty results', () => {
			const stats = calculateEvolutionStats([]);

			expect(stats.renamed).toBe(0);
			expect(stats.remapped).toBe(0);
			expect(stats.dissolved).toBe(0);
			expect(stats.unchanged).toBe(0);
		});
	});
});
