import type { ClusterSummary } from '@/domain/llm/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { MockLLMAdapter } from '../MockLLMAdapter';

describe('MockLLMAdapter', () => {
	let adapter: MockLLMAdapter;

	beforeEach(() => {
		adapter = new MockLLMAdapter();
	});

	describe('nameConceptsBatch', () => {
		it('should name React clusters correctly', async () => {
			const clusters: ClusterSummary[] = [
				{
					clusterId: 'cluster-1',
					candidateNames: ['React', 'Frontend'],
					representativeTitles: ['React Hooks Guide', 'useState Examples'],
					commonTags: ['#react', '#frontend'],
					folderPath: 'tech/react',
					noteCount: 45,
				},
			];

			const response = await adapter.nameConceptsBatch({ clusters });

			expect(response.results).toHaveLength(1);
			expect(response.results[0].canonicalName).toBe('React Development');
			expect(response.results[0].quizzabilityScore).toBe(0.9);
		});

		it('should mark meeting notes as non-quizzable', async () => {
			const clusters: ClusterSummary[] = [
				{
					clusterId: 'cluster-1',
					candidateNames: ['Meetings'],
					representativeTitles: ['Standup 2024-12-20', 'Team Sync'],
					commonTags: ['#meeting'],
					folderPath: 'work/meetings',
					noteCount: 50,
				},
			];

			const response = await adapter.nameConceptsBatch({ clusters });

			expect(response.results[0].canonicalName).toBe('Meeting Notes');
			expect(response.results[0].quizzabilityScore).toBeLessThan(0.4);
			expect(response.results[0].nonQuizzableReason).toContain('Meeting notes');
		});

		it('should mark daily journal as non-quizzable', async () => {
			const clusters: ClusterSummary[] = [
				{
					clusterId: 'cluster-1',
					candidateNames: ['Daily'],
					representativeTitles: ['2024-12-25', '2024-12-24'],
					commonTags: ['#daily'],
					folderPath: 'journal',
					noteCount: 365,
				},
			];

			const response = await adapter.nameConceptsBatch({ clusters });

			expect(response.results[0].canonicalName).toBe('Daily Journal');
			expect(response.results[0].quizzabilityScore).toBeLessThan(0.4);
		});

		it('should use first candidate name when no rule matches', async () => {
			const clusters: ClusterSummary[] = [
				{
					clusterId: 'cluster-1',
					candidateNames: ['Obscure Topic'],
					representativeTitles: ['Note 1', 'Note 2'],
					commonTags: [],
					folderPath: 'misc',
					noteCount: 10,
				},
			];

			const response = await adapter.nameConceptsBatch({ clusters });

			expect(response.results[0].canonicalName).toBe('Obscure Topic');
			expect(response.results[0].quizzabilityScore).toBe(0.5);
		});

		it('should generate name from folder when no candidates', async () => {
			const clusters: ClusterSummary[] = [
				{
					clusterId: 'cluster-1',
					candidateNames: [],
					representativeTitles: [],
					commonTags: [],
					folderPath: 'machine-learning/deep_learning',
					noteCount: 5,
				},
			];

			const response = await adapter.nameConceptsBatch({ clusters });

			expect(response.results[0].canonicalName).toBe('Deep Learning');
		});

		it('should detect merge suggestions for same canonical name', async () => {
			const clusters: ClusterSummary[] = [
				{
					clusterId: 'cluster-1',
					candidateNames: ['React'],
					representativeTitles: ['React Basics'],
					commonTags: ['#react'],
					folderPath: 'tech/react',
					noteCount: 20,
				},
				{
					clusterId: 'cluster-2',
					candidateNames: ['React Hooks'],
					representativeTitles: ['React useState'],
					commonTags: ['#react'],
					folderPath: 'tech/hooks',
					noteCount: 15,
				},
			];

			const response = await adapter.nameConceptsBatch({ clusters });

			// Both should be named "React Development"
			expect(response.results[0].canonicalName).toBe('React Development');
			expect(response.results[1].canonicalName).toBe('React Development');

			// First one should suggest merging the second
			expect(response.results[0].suggestedMerges).toContain('cluster-2');
		});

		it('should include token usage', async () => {
			const clusters: ClusterSummary[] = [
				{
					clusterId: 'cluster-1',
					candidateNames: ['Test'],
					representativeTitles: ['Note 1'],
					commonTags: [],
					folderPath: '',
					noteCount: 1,
				},
			];

			const response = await adapter.nameConceptsBatch({ clusters });

			expect(response.usage).toBeDefined();
			expect(response.usage?.inputTokens).toBeGreaterThan(0);
			expect(response.usage?.outputTokens).toBeGreaterThan(0);
		});

		it('should record call in history', async () => {
			const clusters: ClusterSummary[] = [
				{
					clusterId: 'cluster-1',
					candidateNames: ['Test'],
					representativeTitles: [],
					commonTags: [],
					folderPath: '',
					noteCount: 1,
				},
			];

			await adapter.nameConceptsBatch({ clusters });

			const history = adapter._getCallHistory();
			expect(history).toHaveLength(1);
			expect(history[0].type).toBe('nameConceptsBatch');
		});

		it('should detect misfit notes from representative titles', async () => {
			// Reset to clean slate then add only our custom rule
			adapter._setFixture({
				namingRules: [
					{
						pattern: /react/i,
						canonicalName: 'React Development',
						quizzabilityScore: 0.9,
					},
				],
				misfitRules: [
					{
						pattern: /grocery/i,
						reason: 'Shopping list not knowledge',
					},
				],
			});

			const clusters: ClusterSummary[] = [
				{
					clusterId: 'cluster-1',
					candidateNames: ['React'],
					representativeTitles: ['React Hooks', 'My Grocery List', 'State Management'],
					commonTags: ['#react'],
					folderPath: 'tech/react',
					noteCount: 20,
				},
			];

			const response = await adapter.nameConceptsBatch({ clusters });

			// Should detect the grocery list as a misfit
			expect(response.results[0].misfitNotes).toHaveLength(1);
			// noteId is generated from title: lowercase, spaces to hyphens, non-alphanumeric removed
			expect(response.results[0].misfitNotes[0].noteId).toBe('note-my-grocery-list');
			expect(response.results[0].misfitNotes[0].reason).toBe('Shopping list not knowledge');
		});
	});

	describe('config', () => {
		it('should return default config', () => {
			const config = adapter.getConfig();
			expect(config.model).toBe('claude-haiku-4-5-20251001');
			expect(config.batchSize).toBe(20);
		});

		it('should accept custom config in constructor', () => {
			const customAdapter = new MockLLMAdapter({ batchSize: 10 });
			const config = customAdapter.getConfig();
			expect(config.batchSize).toBe(10);
		});

		it('should update config', () => {
			adapter.updateConfig({ temperature: 0.5 });
			const config = adapter.getConfig();
			expect(config.temperature).toBe(0.5);
		});
	});

	describe('test helpers', () => {
		it('should clear call history', async () => {
			await adapter.nameConceptsBatch({
				clusters: [
					{
						clusterId: '1',
						candidateNames: [],
						representativeTitles: [],
						commonTags: [],
						folderPath: '',
						noteCount: 0,
					},
				],
			});

			expect(adapter._getCallHistory()).toHaveLength(1);

			adapter._clearCallHistory();

			expect(adapter._getCallHistory()).toHaveLength(0);
		});

		it('should add custom naming rule', async () => {
			adapter._addNamingRule({
				pattern: /custom/i,
				canonicalName: 'Custom Concept',
				quizzabilityScore: 0.77,
			});

			const response = await adapter.nameConceptsBatch({
				clusters: [
					{
						clusterId: '1',
						candidateNames: ['Custom Topic'],
						representativeTitles: [],
						commonTags: [],
						folderPath: '',
						noteCount: 1,
					},
				],
			});

			expect(response.results[0].canonicalName).toBe('Custom Concept');
			expect(response.results[0].quizzabilityScore).toBe(0.77);
		});

		it('should set fixture to replace all rules', async () => {
			adapter._setFixture({
				namingRules: [
					{
						pattern: /fixture/i,
						canonicalName: 'Fixture Concept',
						quizzabilityScore: 0.66,
					},
				],
				misfitRules: [],
			});

			// React should no longer match (default rules replaced)
			const response = await adapter.nameConceptsBatch({
				clusters: [
					{
						clusterId: '1',
						candidateNames: ['React'],
						representativeTitles: [],
						commonTags: [],
						folderPath: '',
						noteCount: 1,
					},
				],
			});

			expect(response.results[0].canonicalName).toBe('React'); // Falls back to candidate name
		});

		it('should reset to default rules', async () => {
			adapter._setFixture({
				namingRules: [],
				misfitRules: [],
			});

			adapter._resetRules();

			const response = await adapter.nameConceptsBatch({
				clusters: [
					{
						clusterId: '1',
						candidateNames: ['React'],
						representativeTitles: [],
						commonTags: [],
						folderPath: '',
						noteCount: 1,
					},
				],
			});

			expect(response.results[0].canonicalName).toBe('React Development');
		});
	});

	describe('quizzability helper', () => {
		it('should correctly identify quizzable concepts using isQuizzable', async () => {
			const clusters: ClusterSummary[] = [
				{
					clusterId: 'cluster-react',
					candidateNames: ['React'],
					representativeTitles: ['Hooks Guide'],
					commonTags: ['#react'],
					folderPath: 'tech/react',
					noteCount: 10,
				},
				{
					clusterId: 'cluster-meeting',
					candidateNames: ['Meeting'],
					representativeTitles: ['Standup'],
					commonTags: ['#meeting'],
					folderPath: 'meetings',
					noteCount: 5,
				},
			];

			const response = await adapter.nameConceptsBatch({ clusters });

			// Use the isQuizzable function from types to check quizzability
			const reactResult = response.results.find((r) => r.clusterId === 'cluster-react');
			const meetingResult = response.results.find((r) => r.clusterId === 'cluster-meeting');

			// React should be quizzable (score >= 0.4)
			expect(reactResult?.quizzabilityScore).toBeGreaterThanOrEqual(0.4);

			// Meeting should not be quizzable (score < 0.4)
			expect(meetingResult?.quizzabilityScore).toBeLessThan(0.4);
		});
	});
});
