import type { Cluster } from '@/domain/clustering/types';
import type { FileInfo } from '@/ports/IVaultProvider';
import { describe, expect, it } from 'vitest';
import {
	batchClusterSummaries,
	prepareClusterSummaries,
	selectRepresentativeTitles,
} from '../prepareClusterSummaries';

describe('prepareClusterSummaries', () => {
	const createFileMap = (paths: string[]): Map<string, FileInfo> => {
		const map = new Map<string, FileInfo>();
		for (const path of paths) {
			const basename = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
			const folder = path.split('/').slice(0, -1).join('/');
			map.set(path, { path, basename, folder, modifiedAt: Date.now(), createdAt: Date.now() });
		}
		return map;
	};

	const createCluster = (overrides: Partial<Cluster> = {}): Cluster => ({
		id: 'cluster-1',
		candidateNames: ['React', 'Frontend'],
		noteIds: ['tech/react/hooks.md', 'tech/react/state.md'],
		dominantTags: ['#react', '#frontend', '#javascript'],
		folderPath: 'tech/react',
		internalLinkDensity: 0.5,
		createdAt: Date.now(),
		reasons: ['folder', 'tags'],
		...overrides,
	});

	describe('prepareClusterSummaries', () => {
		it('should convert a cluster to summary', () => {
			const cluster = createCluster();
			const fileMap = createFileMap(cluster.noteIds);

			const summaries = prepareClusterSummaries([cluster], fileMap);

			expect(summaries).toHaveLength(1);
			expect(summaries[0].clusterId).toBe('cluster-1');
			expect(summaries[0].candidateNames).toEqual(['React', 'Frontend']);
			expect(summaries[0].representativeTitles).toEqual(['hooks', 'state']);
			expect(summaries[0].commonTags).toEqual(['#react', '#frontend', '#javascript']);
			expect(summaries[0].folderPath).toBe('tech/react');
			expect(summaries[0].noteCount).toBe(2);
		});

		it('should limit representative titles', () => {
			const noteIds = Array.from({ length: 10 }, (_, i) => `notes/note-${i}.md`);
			const cluster = createCluster({ noteIds });
			const fileMap = createFileMap(noteIds);

			const summaries = prepareClusterSummaries([cluster], fileMap, {
				maxRepresentativeTitles: 5,
			});

			expect(summaries[0].representativeTitles).toHaveLength(5);
		});

		it('should limit common tags', () => {
			const cluster = createCluster({
				dominantTags: ['#a', '#b', '#c', '#d', '#e', '#f', '#g'],
			});
			const fileMap = createFileMap(cluster.noteIds);

			const summaries = prepareClusterSummaries([cluster], fileMap, {
				maxCommonTags: 3,
			});

			expect(summaries[0].commonTags).toEqual(['#a', '#b', '#c']);
		});

		it('should handle empty clusters', () => {
			const cluster = createCluster({
				noteIds: [],
				candidateNames: [],
				dominantTags: [],
			});
			const fileMap = new Map<string, FileInfo>();

			const summaries = prepareClusterSummaries([cluster], fileMap);

			expect(summaries[0].representativeTitles).toEqual([]);
			expect(summaries[0].noteCount).toBe(0);
		});

		it('should handle missing files in fileMap', () => {
			const cluster = createCluster({
				noteIds: ['exists.md', 'missing.md'],
			});
			const fileMap = createFileMap(['exists.md']);

			const summaries = prepareClusterSummaries([cluster], fileMap);

			expect(summaries[0].representativeTitles).toEqual(['exists']);
			expect(summaries[0].noteCount).toBe(2); // Still counts all noteIds
		});

		it('should remove .md extension from titles', () => {
			const cluster = createCluster({
				noteIds: ['React Hooks.md', 'useState Guide.MD'],
			});
			const fileMap = createFileMap(cluster.noteIds);

			const summaries = prepareClusterSummaries([cluster], fileMap);

			expect(summaries[0].representativeTitles).toContain('React Hooks');
			expect(summaries[0].representativeTitles).toContain('useState Guide');
		});
	});

	describe('selectRepresentativeTitles', () => {
		it('should return all titles if less than max', () => {
			const titles = ['A', 'B', 'C'];
			const result = selectRepresentativeTitles(titles, 5);
			expect(result).toEqual(['A', 'B', 'C']);
		});

		it('should select diverse titles', () => {
			const titles = [
				'React Hooks Guide',
				'React Hooks Tutorial',
				'React Hooks Examples',
				'TypeScript Basics',
				'Python Introduction',
			];

			const result = selectRepresentativeTitles(titles, 3);

			// Should include titles from different topics, not just React Hooks variants
			expect(result).toContain('React Hooks Guide'); // First one always included
			// Should prefer diverse titles over similar ones
			expect(result.length).toBe(3);
		});

		it('should handle empty input', () => {
			const result = selectRepresentativeTitles([], 5);
			expect(result).toEqual([]);
		});

		it('should handle single title', () => {
			const result = selectRepresentativeTitles(['Only One'], 5);
			expect(result).toEqual(['Only One']);
		});
	});

	describe('batchClusterSummaries', () => {
		it('should batch summaries correctly', () => {
			const summaries = Array.from({ length: 25 }, (_, i) => ({
				clusterId: `cluster-${i}`,
				candidateNames: [],
				representativeTitles: [],
				commonTags: [],
				folderPath: '',
				noteCount: 1,
			}));

			const batches = batchClusterSummaries(summaries, 10);

			expect(batches).toHaveLength(3);
			expect(batches[0]).toHaveLength(10);
			expect(batches[1]).toHaveLength(10);
			expect(batches[2]).toHaveLength(5);
		});

		it('should return single batch for small input', () => {
			const summaries = Array.from({ length: 5 }, (_, i) => ({
				clusterId: `cluster-${i}`,
				candidateNames: [],
				representativeTitles: [],
				commonTags: [],
				folderPath: '',
				noteCount: 1,
			}));

			const batches = batchClusterSummaries(summaries, 20);

			expect(batches).toHaveLength(1);
			expect(batches[0]).toHaveLength(5);
		});

		it('should handle empty input', () => {
			const batches = batchClusterSummaries([], 10);
			expect(batches).toEqual([]);
		});

		it('should use default batch size', () => {
			const summaries = Array.from({ length: 45 }, (_, i) => ({
				clusterId: `cluster-${i}`,
				candidateNames: [],
				representativeTitles: [],
				commonTags: [],
				folderPath: '',
				noteCount: 1,
			}));

			const batches = batchClusterSummaries(summaries);

			expect(batches).toHaveLength(3); // 20 + 20 + 5
			expect(batches[0]).toHaveLength(20);
			expect(batches[1]).toHaveLength(20);
			expect(batches[2]).toHaveLength(5);
		});
	});
});
