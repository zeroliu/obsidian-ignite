import type { Cluster } from '@/domain/clustering/types';
import type { TrackedConcept } from '@/domain/llm/types';
import { describe, expect, it } from 'vitest';
import {
	autoEvolveConceptBatch,
	calculateEvolutionStats,
	filterSurvivingConcepts,
} from '../autoEvolveConcept';
import { detectEvolution } from '../detectEvolution';
import type { EvolutionConfig } from '../types';

describe('Evolution Integration', () => {
	const createCluster = (id: string, noteIds: string[]): Cluster => ({
		id,
		noteIds,
		candidateNames: [`Candidate-${id}`],
		dominantTags: [],
		folderPath: '',
		internalLinkDensity: 0,
		createdAt: Date.now(),
		reasons: [],
	});

	const createTrackedConcept = (
		id: string,
		clusterId: string,
		noteIds: string[],
		name: string,
	): TrackedConcept => ({
		id,
		canonicalName: name,
		noteIds,
		quizzabilityScore: 0.8,
		clusterId,
		metadata: {
			createdAt: Date.now() - 10000,
			lastUpdated: Date.now() - 10000,
		},
		evolutionHistory: [],
	});

	describe('Full Evolution Flow', () => {
		it('should detect evolution and update concepts in one flow', () => {
			// Initial state: 3 clusters with tracked concepts
			const oldClusters = [
				createCluster('cluster-react', ['hooks.md', 'state.md', 'context.md']),
				createCluster('cluster-typescript', ['types.md', 'generics.md']),
				createCluster('cluster-css', ['flexbox.md', 'grid.md']),
			];

			const trackedConcepts = [
				createTrackedConcept(
					'concept-1',
					'cluster-react',
					['hooks.md', 'state.md', 'context.md'],
					'React Development',
				),
				createTrackedConcept(
					'concept-2',
					'cluster-typescript',
					['types.md', 'generics.md'],
					'TypeScript Fundamentals',
				),
				createTrackedConcept('concept-3', 'cluster-css', ['flexbox.md', 'grid.md'], 'CSS Layout'),
			];

			// After re-clustering: React largely the same (rename), TypeScript evolved (remap), CSS dissolved
			const newClusters = [
				createCluster('cluster-react-v2', ['hooks.md', 'state.md', 'context.md', 'effects.md']),
				createCluster('cluster-frontend', [
					'types.md',
					'generics.md',
					'components.md',
					'styling.md',
				]),
				createCluster('cluster-new', ['newNote1.md', 'newNote2.md']),
			];

			// Step 1: Detect evolution
			const evolutionResult = detectEvolution(oldClusters, newClusters);

			expect(evolutionResult.evolutions).toHaveLength(3);

			// React cluster should be renamed (high overlap)
			const reactEvolution = evolutionResult.evolutions.find(
				(e) => e.oldClusterId === 'cluster-react',
			);
			expect(reactEvolution?.type).toBe('rename');
			expect(reactEvolution?.newClusterId).toBe('cluster-react-v2');

			// TypeScript should be remapped (medium overlap with frontend cluster)
			const tsEvolution = evolutionResult.evolutions.find(
				(e) => e.oldClusterId === 'cluster-typescript',
			);
			expect(tsEvolution?.type).toBe('remap');

			// CSS should be dissolved (no good match)
			const cssEvolution = evolutionResult.evolutions.find((e) => e.oldClusterId === 'cluster-css');
			expect(cssEvolution?.type).toBe('dissolved');

			// cluster-new should be identified as new
			expect(evolutionResult.newClusters).toContain('cluster-new');

			// Step 2: Auto-evolve concepts
			const newNames = new Map([['cluster-frontend', 'Frontend Architecture']]);
			const evolveResults = autoEvolveConceptBatch(
				trackedConcepts,
				evolutionResult.evolutions,
				newNames,
			);

			expect(evolveResults).toHaveLength(3);

			// React concept: renamed (same name, new cluster ID)
			const reactResult = evolveResults.find((r) => r.concept?.id === 'concept-1');
			expect(reactResult?.action).toBe('renamed');
			expect(reactResult?.concept?.clusterId).toBe('cluster-react-v2');
			expect(reactResult?.concept?.canonicalName).toBe('React Development');
			expect(reactResult?.concept?.evolutionHistory).toHaveLength(1);

			// TypeScript concept: remapped (new name, new cluster ID)
			const tsResult = evolveResults.find((r) => r.concept?.id === 'concept-2');
			expect(tsResult?.action).toBe('remapped');
			expect(tsResult?.concept?.canonicalName).toBe('Frontend Architecture');
			expect(tsResult?.concept?.evolutionHistory).toHaveLength(1);

			// CSS concept: dissolved
			const cssResult = evolveResults.find((r) => r.action === 'dissolved');
			expect(cssResult?.concept).toBeNull();

			// Step 3: Filter surviving concepts
			const survivingConcepts = filterSurvivingConcepts(evolveResults);
			expect(survivingConcepts).toHaveLength(2);
			expect(survivingConcepts.map((c) => c.id)).toContain('concept-1');
			expect(survivingConcepts.map((c) => c.id)).toContain('concept-2');

			// Step 4: Calculate stats
			const stats = calculateEvolutionStats(evolveResults);
			expect(stats.renamed).toBe(1);
			expect(stats.remapped).toBe(1);
			expect(stats.dissolved).toBe(1);
			expect(stats.unchanged).toBe(0);
		});

		it('should handle stable clusters with no evolution', () => {
			const clusters = [
				createCluster('cluster-1', ['a.md', 'b.md', 'c.md']),
				createCluster('cluster-2', ['x.md', 'y.md', 'z.md']),
			];

			const concepts = [
				createTrackedConcept('concept-1', 'cluster-1', ['a.md', 'b.md', 'c.md'], 'Concept A'),
				createTrackedConcept('concept-2', 'cluster-2', ['x.md', 'y.md', 'z.md'], 'Concept X'),
			];

			// Re-cluster with identical clusters (different IDs though)
			const newClusters = [
				createCluster('cluster-1-v2', ['a.md', 'b.md', 'c.md']),
				createCluster('cluster-2-v2', ['x.md', 'y.md', 'z.md']),
			];

			const evolutionResult = detectEvolution(clusters, newClusters);

			// All should be renames (100% overlap)
			expect(evolutionResult.evolutions.every((e) => e.type === 'rename')).toBe(true);

			const evolveResults = autoEvolveConceptBatch(concepts, evolutionResult.evolutions);

			// All concepts should be renamed
			expect(evolveResults.every((r) => r.action === 'renamed')).toBe(true);

			// All concepts should survive
			const surviving = filterSurvivingConcepts(evolveResults);
			expect(surviving).toHaveLength(2);
		});

		it('should preserve evolution history across multiple cycles', () => {
			// Start with a concept that already has history
			const concept: TrackedConcept = {
				id: 'concept-with-history',
				canonicalName: 'Evolving Concept',
				noteIds: ['note1.md', 'note2.md'],
				quizzabilityScore: 0.9,
				clusterId: 'cluster-v2',
				metadata: { createdAt: Date.now() - 30000, lastUpdated: Date.now() - 10000 },
				evolutionHistory: [
					{
						ts: Date.now() - 20000,
						fromCluster: 'cluster-v1',
						toCluster: 'cluster-v2',
						type: 'rename',
						overlapScore: 0.95,
					},
				],
			};

			const oldClusters = [createCluster('cluster-v2', ['note1.md', 'note2.md'])];
			const newClusters = [createCluster('cluster-v3', ['note1.md', 'note2.md', 'note3.md'])];

			const evolutionResult = detectEvolution(oldClusters, newClusters);
			const evolveResults = autoEvolveConceptBatch([concept], evolutionResult.evolutions);

			expect(evolveResults[0].concept?.evolutionHistory).toHaveLength(2);
			expect(evolveResults[0].concept?.evolutionHistory[0].fromCluster).toBe('cluster-v1');
			expect(evolveResults[0].concept?.evolutionHistory[1].fromCluster).toBe('cluster-v2');
			expect(evolveResults[0].concept?.evolutionHistory[1].toCluster).toBe('cluster-v3');
		});
	});

	describe('Edge Cases', () => {
		it('should handle completely new clustering (all old dissolved, all new)', () => {
			const oldClusters = [
				createCluster('old-1', ['a.md', 'b.md']),
				createCluster('old-2', ['c.md', 'd.md']),
			];

			const concepts = [
				createTrackedConcept('concept-1', 'old-1', ['a.md', 'b.md'], 'Old Concept 1'),
				createTrackedConcept('concept-2', 'old-2', ['c.md', 'd.md'], 'Old Concept 2'),
			];

			// Completely different notes in new clusters
			const newClusters = [
				createCluster('new-1', ['x.md', 'y.md']),
				createCluster('new-2', ['z.md', 'w.md']),
			];

			const evolutionResult = detectEvolution(oldClusters, newClusters);

			// All old clusters should be dissolved
			expect(evolutionResult.dissolved).toHaveLength(2);
			expect(evolutionResult.newClusters).toHaveLength(2);

			const evolveResults = autoEvolveConceptBatch(concepts, evolutionResult.evolutions);

			// All concepts should be dissolved
			expect(evolveResults.every((r) => r.action === 'dissolved')).toBe(true);

			const surviving = filterSurvivingConcepts(evolveResults);
			expect(surviving).toHaveLength(0);
		});

		it('should handle concept with no matching evolution', () => {
			const oldClusters = [createCluster('cluster-a', ['a.md'])];
			const newClusters = [createCluster('cluster-a-v2', ['a.md'])];

			// Concept references a cluster that's not in the evolution
			const orphanedConcept = createTrackedConcept(
				'orphan',
				'cluster-unknown',
				['x.md'],
				'Orphaned Concept',
			);

			const evolutionResult = detectEvolution(oldClusters, newClusters);
			const evolveResults = autoEvolveConceptBatch([orphanedConcept], evolutionResult.evolutions);

			// Should be unchanged (no evolution applies)
			expect(evolveResults[0].action).toBe('unchanged');
			expect(evolveResults[0].concept).toBe(orphanedConcept);
		});

		it('should handle empty initial state', () => {
			const evolutionResult = detectEvolution([], []);

			expect(evolutionResult.evolutions).toHaveLength(0);
			expect(evolutionResult.dissolved).toHaveLength(0);
			expect(evolutionResult.newClusters).toHaveLength(0);

			const evolveResults = autoEvolveConceptBatch([], []);
			expect(evolveResults).toHaveLength(0);

			const stats = calculateEvolutionStats([]);
			expect(stats).toEqual({ renamed: 0, remapped: 0, dissolved: 0, unchanged: 0 });
		});

		it('should use custom thresholds for fine-grained control', () => {
			// With strict thresholds, more things will be remap/dissolved
			const strictConfig: EvolutionConfig = {
				renameThreshold: 0.9,
				remapThreshold: 0.5,
			};

			const oldClusters = [createCluster('old', ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'])];
			const newClusters = [createCluster('new', ['a.md', 'b.md', 'c.md', 'd.md', 'f.md'])];
			// Jaccard = 4/6 ≈ 0.67

			// With default thresholds (0.6), this would be a rename
			const defaultResult = detectEvolution(oldClusters, newClusters);
			expect(defaultResult.evolutions[0].type).toBe('rename');

			// With strict thresholds (0.9), this becomes a remap
			const strictResult = detectEvolution(oldClusters, newClusters, strictConfig);
			expect(strictResult.evolutions[0].type).toBe('remap');
		});
	});

	describe('Incremental Update Scenario', () => {
		it('should handle incremental note additions to existing clusters', () => {
			// Day 1: Initial clustering with enough notes for high Jaccard after addition
			const day1Clusters = [
				createCluster('react-day1', ['hooks.md', 'state.md', 'context.md', 'effects.md']),
				createCluster('ts-day1', ['types.md', 'generics.md', 'interfaces.md']),
			];

			const day1Concepts = [
				createTrackedConcept(
					'concept-react',
					'react-day1',
					['hooks.md', 'state.md', 'context.md', 'effects.md'],
					'React Hooks',
				),
				createTrackedConcept(
					'concept-ts',
					'ts-day1',
					['types.md', 'generics.md', 'interfaces.md'],
					'TypeScript Types',
				),
			];

			// Day 2: User added more notes, re-clustered
			// React: 4 old + 1 new = 5 total, Jaccard = 4/5 = 0.8 (rename)
			// TS: 3 old + 1 new = 4 total, Jaccard = 3/4 = 0.75 (rename)
			const day2Clusters = [
				createCluster('react-day2', [
					'hooks.md',
					'state.md',
					'context.md',
					'effects.md',
					'reducers.md',
				]),
				createCluster('ts-day2', ['types.md', 'generics.md', 'interfaces.md', 'decorators.md']),
				createCluster('css-day2', ['flexbox.md']), // Entirely new cluster
			];

			const evolutionResult = detectEvolution(day1Clusters, day2Clusters);

			// React and TS clusters should be renamed (high overlap with new notes)
			expect(evolutionResult.evolutions.find((e) => e.oldClusterId === 'react-day1')?.type).toBe(
				'rename',
			);
			expect(evolutionResult.evolutions.find((e) => e.oldClusterId === 'ts-day1')?.type).toBe(
				'rename',
			);

			// CSS is new
			expect(evolutionResult.newClusters).toContain('css-day2');

			const evolveResults = autoEvolveConceptBatch(day1Concepts, evolutionResult.evolutions);

			// Both existing concepts should be renamed
			expect(evolveResults.filter((r) => r.action === 'renamed')).toHaveLength(2);

			// All concepts survive
			const surviving = filterSurvivingConcepts(evolveResults);
			expect(surviving).toHaveLength(2);

			// Concepts are now linked to new cluster IDs
			expect(surviving.find((c) => c.id === 'concept-react')?.clusterId).toBe('react-day2');
			expect(surviving.find((c) => c.id === 'concept-ts')?.clusterId).toBe('ts-day2');
		});
	});
});
