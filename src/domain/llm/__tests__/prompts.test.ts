import { describe, expect, it } from 'vitest';
import {
	CONCEPT_NAMING_SYSTEM_PROMPT,
	buildConceptNamingPrompt,
	parseNamingResponse,
} from '../prompts';
import type { ClusterSummary } from '../types';

describe('prompts', () => {
	describe('system prompts', () => {
		it('should have concept naming system prompt with misfit detection', () => {
			expect(CONCEPT_NAMING_SYSTEM_PROMPT).toContain('concept name');
			expect(CONCEPT_NAMING_SYSTEM_PROMPT).toContain('quizzability');
			expect(CONCEPT_NAMING_SYSTEM_PROMPT).toContain('misfit');
			expect(CONCEPT_NAMING_SYSTEM_PROMPT).toContain('JSON');
		});
	});

	describe('buildConceptNamingPrompt', () => {
		it('should build prompt with cluster information', () => {
			const clusters: ClusterSummary[] = [
				{
					clusterId: 'cluster-1',
					candidateNames: ['React', 'Frontend'],
					representativeTitles: ['Hooks Guide', 'State Management'],
					commonTags: ['#react', '#frontend'],
					folderPath: 'tech/react',
					noteCount: 45,
				},
			];

			const prompt = buildConceptNamingPrompt(clusters);

			expect(prompt).toContain('cluster-1');
			expect(prompt).toContain('React, Frontend');
			expect(prompt).toContain('Hooks Guide');
			expect(prompt).toContain('#react');
			expect(prompt).toContain('tech/react');
			expect(prompt).toContain('45');
		});

		it('should handle multiple clusters', () => {
			const clusters: ClusterSummary[] = [
				{
					clusterId: 'cluster-1',
					candidateNames: ['React'],
					representativeTitles: ['Note 1'],
					commonTags: [],
					folderPath: '',
					noteCount: 10,
				},
				{
					clusterId: 'cluster-2',
					candidateNames: ['Python'],
					representativeTitles: ['Note 2'],
					commonTags: [],
					folderPath: '',
					noteCount: 20,
				},
			];

			const prompt = buildConceptNamingPrompt(clusters);

			expect(prompt).toContain('2 note clusters');
			expect(prompt).toContain('Cluster 1');
			expect(prompt).toContain('Cluster 2');
		});

		it('should handle empty values', () => {
			const clusters: ClusterSummary[] = [
				{
					clusterId: 'cluster-1',
					candidateNames: [],
					representativeTitles: [],
					commonTags: [],
					folderPath: '',
					noteCount: 0,
				},
			];

			const prompt = buildConceptNamingPrompt(clusters);

			expect(prompt).toContain('Candidate names: None');
			expect(prompt).toContain('Common tags: None');
			expect(prompt).toContain('Folder: Root');
		});

		it('should include misfitNotes in expected format', () => {
			const clusters: ClusterSummary[] = [
				{
					clusterId: 'cluster-1',
					candidateNames: ['Test'],
					representativeTitles: [],
					commonTags: [],
					folderPath: '',
					noteCount: 5,
				},
			];

			const prompt = buildConceptNamingPrompt(clusters);

			expect(prompt).toContain('misfitNotes');
			expect(prompt).toContain('noteId');
			expect(prompt).toContain('reason');
		});
	});

	describe('parseNamingResponse', () => {
		it('should parse valid JSON array with misfitNotes', () => {
			const response = `[
				{
					"clusterId": "cluster-1",
					"canonicalName": "React Development",
					"quizzabilityScore": 0.9,
					"nonQuizzableReason": null,
					"suggestedMerges": [],
					"misfitNotes": [
						{
							"noteId": "grocery-list.md",
							"reason": "Not programming content"
						}
					]
				}
			]`;

			const results = parseNamingResponse(response);

			expect(results).toHaveLength(1);
			expect(results[0].clusterId).toBe('cluster-1');
			expect(results[0].canonicalName).toBe('React Development');
			expect(results[0].quizzabilityScore).toBe(0.9);
			expect(results[0].misfitNotes).toHaveLength(1);
			expect(results[0].misfitNotes[0].noteId).toBe('grocery-list.md');
			expect(results[0].misfitNotes[0].reason).toBe('Not programming content');
		});

		it('should parse JSON from markdown code block', () => {
			const response = `Here are the results:

\`\`\`json
[
	{
		"clusterId": "cluster-1",
		"canonicalName": "Test",
		"quizzabilityScore": 0.5,
		"suggestedMerges": [],
		"misfitNotes": []
	}
]
\`\`\`

That's all!`;

			const results = parseNamingResponse(response);

			expect(results).toHaveLength(1);
			expect(results[0].canonicalName).toBe('Test');
			expect(results[0].misfitNotes).toEqual([]);
		});

		it('should normalize score out of range', () => {
			const response = `[
				{
					"clusterId": "cluster-1",
					"canonicalName": "Test",
					"quizzabilityScore": 1.5,
					"suggestedMerges": [],
					"misfitNotes": []
				}
			]`;

			const results = parseNamingResponse(response);

			expect(results[0].quizzabilityScore).toBe(1);
		});

		it('should handle non-quizzable with reason', () => {
			const response = `[
				{
					"clusterId": "cluster-1",
					"canonicalName": "Meeting Notes",
					"quizzabilityScore": 0.1,
					"nonQuizzableReason": "Ephemeral content",
					"suggestedMerges": [],
					"misfitNotes": []
				}
			]`;

			const results = parseNamingResponse(response);

			expect(results[0].quizzabilityScore).toBe(0.1);
			expect(results[0].nonQuizzableReason).toBe('Ephemeral content');
		});

		it('should handle suggested merges', () => {
			const response = `[
				{
					"clusterId": "cluster-1",
					"canonicalName": "JavaScript",
					"quizzabilityScore": 0.9,
					"suggestedMerges": ["cluster-2", "cluster-3"],
					"misfitNotes": []
				}
			]`;

			const results = parseNamingResponse(response);

			expect(results[0].suggestedMerges).toEqual(['cluster-2', 'cluster-3']);
		});

		it('should handle missing misfitNotes gracefully', () => {
			const response = `[
				{
					"clusterId": "cluster-1",
					"canonicalName": "Test",
					"quizzabilityScore": 0.8,
					"suggestedMerges": []
				}
			]`;

			const results = parseNamingResponse(response);

			expect(results[0].misfitNotes).toEqual([]);
		});

		it('should handle malformed misfitNotes gracefully', () => {
			const response = `[
				{
					"clusterId": "cluster-1",
					"canonicalName": "Test",
					"quizzabilityScore": 0.8,
					"suggestedMerges": [],
					"misfitNotes": [
						{ "invalid": "entry" },
						{ "noteId": "valid.md", "reason": "Good reason" }
					]
				}
			]`;

			const results = parseNamingResponse(response);

			// Should only include valid entries
			expect(results[0].misfitNotes).toHaveLength(1);
			expect(results[0].misfitNotes[0].noteId).toBe('valid.md');
		});

		it('should throw on invalid JSON', () => {
			expect(() => parseNamingResponse('not json')).toThrow();
		});

		it('should throw on non-array', () => {
			expect(() => parseNamingResponse('{"foo": "bar"}')).toThrow('Expected array');
		});

		it('should throw on missing required fields', () => {
			expect(() => parseNamingResponse('[{"foo": "bar"}]')).toThrow('clusterId');
		});
	});
});
