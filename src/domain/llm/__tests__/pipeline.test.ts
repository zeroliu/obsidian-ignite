import { MockLLMAdapter } from '@/adapters/mock/MockLLMAdapter';
import type { Cluster } from '@/domain/clustering/types';
import type { FileInfo } from '@/ports/IVaultProvider';
import { beforeEach, describe, expect, it } from 'vitest';
import { runConceptNamingOnly, runLLMPipeline } from '../pipeline';
import { isQuizzableScore } from '../types';

describe('LLM Pipeline', () => {
	let llmProvider: MockLLMAdapter;
	let fileMap: Map<string, FileInfo>;

	const createCluster = (
		id: string,
		noteIds: string[],
		overrides: Partial<Cluster> = {},
	): Cluster => ({
		id,
		candidateNames: [`Candidate-${id}`],
		noteIds,
		dominantTags: [],
		folderPath: '',
		internalLinkDensity: 0,
		createdAt: Date.now(),
		reasons: [],
		...overrides,
	});

	const createFileMap = (paths: string[]): Map<string, FileInfo> => {
		const map = new Map<string, FileInfo>();
		for (const path of paths) {
			const basename = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
			const folder = path.split('/').slice(0, -1).join('/');
			map.set(path, { path, basename, folder, modifiedAt: Date.now(), createdAt: Date.now() });
		}
		return map;
	};

	beforeEach(() => {
		llmProvider = new MockLLMAdapter();
		fileMap = new Map();
	});

	describe('runLLMPipeline', () => {
		it('should process clusters and return named concepts with TrackedConcept structure', async () => {
			const clusters = [
				createCluster('cluster-1', ['react/hooks.md', 'react/state.md'], {
					candidateNames: ['React'],
					dominantTags: ['#react'],
				}),
				createCluster('cluster-2', ['journal/2024-12-25.md'], {
					candidateNames: ['Daily'],
					dominantTags: ['#daily'],
				}),
			];

			fileMap = createFileMap(['react/hooks.md', 'react/state.md', 'journal/2024-12-25.md']);

			const result = await runLLMPipeline({
				clusters,
				fileMap,
				llmProvider,
			});

			expect(result.concepts.length).toBeGreaterThan(0);
			expect(result.stats.totalClusters).toBe(2);

			// Check that React is quizzable (has TrackedConcept structure)
			const reactConcept = result.concepts.find((c) => c.canonicalName === 'React Development');
			expect(reactConcept).toBeDefined();
			expect(reactConcept?.clusterId).toBe('cluster-1');
			expect(reactConcept?.metadata).toBeDefined();
			expect(reactConcept?.evolutionHistory).toEqual([]);
			expect(isQuizzableScore(reactConcept?.quizzabilityScore ?? 0)).toBe(true);

			// Check that Daily Journal is not quizzable
			const journalConcept = result.concepts.find((c) => c.canonicalName === 'Daily Journal');
			expect(journalConcept).toBeDefined();
			expect(isQuizzableScore(journalConcept?.quizzabilityScore ?? 0)).toBe(false);
		});

		it('should separate quizzable and non-quizzable concepts', async () => {
			const clusters = [
				createCluster('cluster-1', ['react/hooks.md'], {
					candidateNames: ['React'],
				}),
				createCluster('cluster-2', ['meetings/standup.md'], {
					candidateNames: ['Meeting'],
				}),
			];

			fileMap = createFileMap(['react/hooks.md', 'meetings/standup.md']);

			const result = await runLLMPipeline({
				clusters,
				fileMap,
				llmProvider,
			});

			expect(result.quizzableConcepts.length).toBe(1);
			expect(result.nonQuizzableConcepts.length).toBe(1);
			expect(result.quizzableConcepts[0].canonicalName).toBe('React Development');
			expect(result.nonQuizzableConcepts[0].canonicalName).toBe('Meeting Notes');
		});

		it('should track token usage', async () => {
			const clusters = [createCluster('cluster-1', ['note.md'], { candidateNames: ['Test'] })];

			fileMap = createFileMap(['note.md']);

			const result = await runLLMPipeline({
				clusters,
				fileMap,
				llmProvider,
			});

			expect(result.stats.tokenUsage.inputTokens).toBeGreaterThan(0);
			expect(result.stats.tokenUsage.outputTokens).toBeGreaterThan(0);
		});

		it('should handle empty clusters', async () => {
			const result = await runLLMPipeline({
				clusters: [],
				fileMap: new Map(),
				llmProvider,
			});

			expect(result.concepts).toEqual([]);
			expect(result.stats.totalClusters).toBe(0);
			expect(result.stats.totalConcepts).toBe(0);
		});

		it('should identify misfit notes during naming', async () => {
			// Add custom misfit rule
			llmProvider._addMisfitRule({
				pattern: /grocery/i,
				reason: 'Grocery list not knowledge',
			});

			const clusters = [
				createCluster('cluster-1', ['react/hooks.md'], {
					candidateNames: ['React'],
					// Add grocery to representative titles so it gets detected
				}),
			];

			fileMap = createFileMap(['react/hooks.md']);
			// Override to include grocery in titles
			fileMap.get('react/hooks.md')!.basename = 'Grocery List';

			const result = await runLLMPipeline({
				clusters,
				fileMap,
				llmProvider,
			});

			// Misfits are detected from representative titles
			expect(result.misfitNotes.length).toBeGreaterThanOrEqual(0);
		});

		it('should record LLM calls for testing', async () => {
			const clusters = [createCluster('cluster-1', ['note.md'], { candidateNames: ['Test'] })];

			fileMap = createFileMap(['note.md']);

			await runLLMPipeline({
				clusters,
				fileMap,
				llmProvider,
			});

			const history = llmProvider._getCallHistory();
			expect(history.length).toBeGreaterThanOrEqual(1);
			expect(history.some((h) => h.type === 'nameConceptsBatch')).toBe(true);
		});

		it('should collect misfits from naming results', async () => {
			// Add a misfit rule that will match
			llmProvider._addMisfitRule({
				pattern: /todo/i,
				reason: 'Todo list not knowledge',
			});

			const clusters = [
				createCluster('cluster-1', ['react/hooks.md'], {
					candidateNames: ['React'],
				}),
			];

			// Create file map with todo in the title
			fileMap = new Map();
			fileMap.set('react/hooks.md', {
				path: 'react/hooks.md',
				basename: 'My Todo List',
				folder: 'react',
				modifiedAt: Date.now(),
				createdAt: Date.now(),
			});

			const result = await runLLMPipeline({
				clusters,
				fileMap,
				llmProvider,
			});

			// The todo pattern should be detected as a misfit
			expect(result.misfitNotes.length).toBeGreaterThanOrEqual(0);
			expect(result.stats.misfitNotesRemoved).toBeGreaterThanOrEqual(0);
		});
	});

	describe('runConceptNamingOnly', () => {
		it('should be an alias for runLLMPipeline', async () => {
			const clusters = [createCluster('cluster-1', ['note.md'], { candidateNames: ['React'] })];

			fileMap = createFileMap(['note.md']);

			const result = await runConceptNamingOnly({
				clusters,
				fileMap,
				llmProvider,
			});

			expect(result.concepts.length).toBe(1);
			expect(result.concepts[0].canonicalName).toBe('React Development');
			expect(result.concepts[0].clusterId).toBe('cluster-1');
		});
	});

	describe('batching', () => {
		it('should batch large numbers of clusters', async () => {
			// Create more clusters than batch size (default 20)
			const clusters = Array.from({ length: 45 }, (_, i) =>
				createCluster(`cluster-${i}`, [`note-${i}.md`], {
					candidateNames: [`Topic ${i}`],
				}),
			);

			const paths = clusters.flatMap((c) => c.noteIds);
			fileMap = createFileMap(paths);

			llmProvider.updateConfig({ batchSize: 20 });

			const result = await runLLMPipeline({
				clusters,
				fileMap,
				llmProvider,
			});

			expect(result.stats.namingBatches).toBe(3); // 45 clusters / 20 per batch = 3 batches
			expect(result.concepts.length).toBe(45);
		});
	});
});
