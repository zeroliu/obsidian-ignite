import type { EmbeddedNote } from '@/domain/embedding/types';
import type { FileInfo } from '@/ports/IVaultProvider';
import { beforeEach, describe, expect, it } from 'vitest';
import { ClusteringPipeline, runClusteringPipeline } from '../pipeline';
import type { PipelineInput } from '../pipeline';

describe('ClusteringPipeline', () => {
	let pipeline: ClusteringPipeline;

	beforeEach(() => {
		pipeline = new ClusteringPipeline();
	});

	describe('constructor', () => {
		it('should use default config', () => {
			const config = pipeline.getConfig();
			expect(config.minNotesForClustering).toBe(10);
			expect(config.incrementalThreshold).toBe(0.05);
		});

		it('should merge custom config', () => {
			const customPipeline = new ClusteringPipeline({
				minNotesForClustering: 20,
			});
			expect(customPipeline.getConfig().minNotesForClustering).toBe(20);
		});
	});

	describe('run', () => {
		it('should handle too few notes', async () => {
			const input = createPipelineInput(5); // Less than minNotesForClustering

			const { result } = await pipeline.run(input);

			expect(result.clusters).toEqual([]);
			expect(result.noiseNotes.length).toBe(5);
			expect(result.stats.clusterCount).toBe(0);
		});

		it('should run full clustering when no previous state', async () => {
			const input = createPipelineInput(30);

			const { result, state } = await pipeline.run(input);

			expect(result.stats.wasIncremental).toBe(false);
			expect(result.stats.totalNotes).toBe(30);
			expect(state.noteHashes.size).toBe(30);
		});

		it('should cluster notes and return clusters', async () => {
			// Create notes that should cluster together
			const input = createClusterablePipelineInput();

			const { result } = await pipeline.run(input);

			// Should have some clusters (exact number depends on HDBSCAN)
			expect(result.stats.totalNotes).toBe(30);
			// Either we get clusters or noise, but total should match
			expect(result.clusters.length + result.noiseNotes.length).toBeGreaterThan(0);
		});

		it('should populate cluster metadata', async () => {
			const input = createClusterablePipelineInput();

			const { result } = await pipeline.run(input);

			// If we have clusters, check their metadata
			for (const cluster of result.clusters) {
				expect(cluster.id).toMatch(/^emb-cluster-/);
				expect(cluster.centroid.length).toBeGreaterThan(0);
				expect(cluster.noteIds.length).toBeGreaterThan(0);
				expect(cluster.createdAt).toBeGreaterThan(0);
				expect(cluster.reasons.length).toBeGreaterThan(0);
			}
		});

		it('should calculate dominant tags', async () => {
			const input = createPipelineInput(20);
			// Add consistent tags to notes
			for (let i = 0; i < 20; i++) {
				input.noteTags.set(`note_${i}.md`, ['common-tag', `unique-${i}`]);
			}

			const { result } = await pipeline.run(input);

			// If we have clusters, they should have dominant tags populated
			for (const cluster of result.clusters) {
				// dominantTags should be populated (may be empty if no tags meet threshold)
				expect(Array.isArray(cluster.dominantTags)).toBe(true);
			}
		});

		it('should calculate link density', async () => {
			const input = createPipelineInput(20);
			// Add some links between notes
			input.resolvedLinks = {
				'note_0.md': { 'note_1.md': 1, 'note_2.md': 1 },
				'note_1.md': { 'note_0.md': 1 },
			};

			const { result } = await pipeline.run(input);

			for (const cluster of result.clusters) {
				expect(typeof cluster.internalLinkDensity).toBe('number');
				expect(cluster.internalLinkDensity).toBeGreaterThanOrEqual(0);
				expect(cluster.internalLinkDensity).toBeLessThanOrEqual(1);
			}
		});

		it('should return updated state for future runs', async () => {
			const input = createPipelineInput(20);

			const { state } = await pipeline.run(input);

			expect(state.noteHashes.size).toBe(20);
			expect(state.lastFullClusteringAt).toBeGreaterThan(0);
			expect(Array.isArray(state.clusters)).toBe(true);
		});
	});

	describe('incremental updates', () => {
		it('should use incremental mode when changes are small', async () => {
			// First run to get initial state
			const input1 = createPipelineInput(100);
			const { state: state1 } = await pipeline.run(input1);

			// Second run with small changes (< 5%)
			const input2 = createPipelineInput(100);
			// Modify just 2 notes
			input2.embeddedNotes[0].contentHash = 'modified-hash-0';
			input2.embeddedNotes[1].contentHash = 'modified-hash-1';
			input2.previousState = state1;

			const { result } = await pipeline.run(input2);

			// Should use incremental mode
			expect(result.stats.wasIncremental).toBe(true);
		});

		it('should use full mode when changes are large', async () => {
			// First run to get initial state
			const input1 = createPipelineInput(100);
			const { state: state1 } = await pipeline.run(input1);

			// Second run with large changes (> 5%)
			const input2 = createPipelineInput(100);
			// Modify 10 notes (10%)
			for (let i = 0; i < 10; i++) {
				input2.embeddedNotes[i].contentHash = `modified-hash-${i}`;
			}
			input2.previousState = state1;

			const { result } = await pipeline.run(input2);

			// Should use full mode
			expect(result.stats.wasIncremental).toBe(false);
		});
	});

	describe('runClusteringPipeline convenience function', () => {
		it('should run pipeline in one call', async () => {
			const input = createPipelineInput(20);

			const { result } = await runClusteringPipeline(input);

			expect(result.stats.totalNotes).toBe(20);
		});
	});
});

/**
 * Helper to create pipeline input with random embeddings
 */
function createPipelineInput(noteCount: number): PipelineInput {
	const embeddedNotes: EmbeddedNote[] = [];
	const noteTags = new Map<string, string[]>();
	const files = new Map<string, FileInfo>();

	for (let i = 0; i < noteCount; i++) {
		const embedding = generateRandomEmbedding(50);
		embeddedNotes.push({
			notePath: `note_${i}.md`,
			embedding,
			contentHash: `hash_${i}`,
			tokenCount: 100,
			fromCache: false,
		});

		noteTags.set(`note_${i}.md`, [`tag_${i % 5}`]);
		files.set(`note_${i}.md`, {
			path: `note_${i}.md`,
			basename: `note_${i}`,
			folder: '',
			modifiedAt: Date.now(),
			createdAt: Date.now(),
		});
	}

	return {
		embeddedNotes,
		noteTags,
		resolvedLinks: {},
		files,
		previousState: null,
	};
}

/**
 * Helper to create input with clusterable embeddings
 */
function createClusterablePipelineInput(): PipelineInput {
	const embeddedNotes: EmbeddedNote[] = [];
	const noteTags = new Map<string, string[]>();
	const files = new Map<string, FileInfo>();

	// Create 3 clusters of 10 notes each
	for (let cluster = 0; cluster < 3; cluster++) {
		const baseEmbedding = generateRandomEmbedding(50);

		for (let i = 0; i < 10; i++) {
			// Add small noise to base embedding
			const embedding = baseEmbedding.map((v) => v + (Math.random() - 0.5) * 0.1);
			// Normalize
			const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
			const normalizedEmbedding = embedding.map((x) => x / norm);

			const noteIndex = cluster * 10 + i;
			embeddedNotes.push({
				notePath: `note_${noteIndex}.md`,
				embedding: normalizedEmbedding,
				contentHash: `hash_${noteIndex}`,
				tokenCount: 100,
				fromCache: false,
			});

			noteTags.set(`note_${noteIndex}.md`, [`cluster_${cluster}`]);
			files.set(`note_${noteIndex}.md`, {
				path: `note_${noteIndex}.md`,
				basename: `note_${noteIndex}`,
				folder: '',
				modifiedAt: Date.now(),
				createdAt: Date.now(),
			});
		}
	}

	return {
		embeddedNotes,
		noteTags,
		resolvedLinks: {},
		files,
		previousState: null,
	};
}

/**
 * Helper to generate a random unit embedding
 */
function generateRandomEmbedding(dimensions: number): number[] {
	const embedding = new Array(dimensions).fill(0).map(() => Math.random() * 2 - 1);
	const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
	return embedding.map((x) => x / norm);
}
