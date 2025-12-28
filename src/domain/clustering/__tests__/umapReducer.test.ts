import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_UMAP_CONFIG } from '../types';
import { UMAPReducer, reduceEmbeddings } from '../umapReducer';

describe('UMAPReducer', () => {
	let reducer: UMAPReducer;

	beforeEach(() => {
		reducer = new UMAPReducer();
	});

	describe('constructor', () => {
		it('should use default config when none provided', () => {
			expect(reducer.getConfig()).toEqual(DEFAULT_UMAP_CONFIG);
		});

		it('should merge custom config with defaults', () => {
			const customReducer = new UMAPReducer({ nNeighbors: 30, minDist: 0.2 });
			const config = customReducer.getConfig();
			expect(config.nNeighbors).toBe(30);
			expect(config.minDist).toBe(0.2);
			expect(config.nComponents).toBe(DEFAULT_UMAP_CONFIG.nComponents);
		});
	});

	describe('fit', () => {
		it('should return empty result for empty input', async () => {
			const result = await reducer.fit([]);
			expect(result.reducedEmbeddings).toEqual([]);
			expect(result.notePaths).toEqual([]);
		});

		it('should handle very small datasets by truncating/padding', async () => {
			// With nNeighbors=15, we need at least 16 samples for UMAP
			// Fewer samples will get truncated/padded
			const embeddings = [
				{ notePath: 'note1.md', embedding: [1, 2, 3, 4, 5] },
				{ notePath: 'note2.md', embedding: [2, 3, 4, 5, 6] },
			];

			const result = await reducer.fit(embeddings);

			expect(result.notePaths).toEqual(['note1.md', 'note2.md']);
			expect(result.reducedEmbeddings.length).toBe(2);
			// Should be padded to nComponents dimensions
			expect(result.reducedEmbeddings[0].length).toBe(DEFAULT_UMAP_CONFIG.nComponents);
		});

		it('should reduce high-dimensional embeddings', async () => {
			// Generate enough embeddings for UMAP to work
			const embeddings = generateRandomEmbeddings(30, 50);

			const result = await reducer.fit(embeddings);

			expect(result.notePaths.length).toBe(30);
			expect(result.reducedEmbeddings.length).toBe(30);
			// Each reduced embedding should have nComponents dimensions
			for (const reduced of result.reducedEmbeddings) {
				expect(reduced.length).toBe(DEFAULT_UMAP_CONFIG.nComponents);
			}
		});

		it('should throw error for inconsistent embedding dimensions', async () => {
			const embeddings = [
				{ notePath: 'note1.md', embedding: [1, 2, 3] },
				{ notePath: 'note2.md', embedding: [1, 2] }, // Different dimensions
			];

			await expect(reducer.fit(embeddings)).rejects.toThrow('Inconsistent embedding dimensions');
		});

		it('should set fitted state after successful fit', async () => {
			expect(reducer.isFitted()).toBe(false);

			const embeddings = generateRandomEmbeddings(20, 50);
			await reducer.fit(embeddings);

			expect(reducer.isFitted()).toBe(true);
		});
	});

	describe('transform', () => {
		it('should throw error if not fitted', () => {
			const embeddings = [{ notePath: 'note1.md', embedding: [1, 2, 3] }];
			expect(() => reducer.transform(embeddings)).toThrow('UMAP has not been fitted');
		});

		it('should return empty result for empty input after fitting', async () => {
			const trainEmbeddings = generateRandomEmbeddings(20, 50);
			await reducer.fit(trainEmbeddings);

			const result = reducer.transform([]);
			expect(result.reducedEmbeddings).toEqual([]);
			expect(result.notePaths).toEqual([]);
		});

		it('should transform new embeddings using fitted model', async () => {
			// Fit with training data
			const trainEmbeddings = generateRandomEmbeddings(20, 50);
			await reducer.fit(trainEmbeddings);

			// Transform new embeddings
			const newEmbeddings = generateRandomEmbeddings(5, 50, 'new_');
			const result = reducer.transform(newEmbeddings);

			expect(result.notePaths.length).toBe(5);
			expect(result.reducedEmbeddings.length).toBe(5);
			for (const reduced of result.reducedEmbeddings) {
				expect(reduced.length).toBe(DEFAULT_UMAP_CONFIG.nComponents);
			}
		});
	});

	describe('reset', () => {
		it('should clear fitted state', async () => {
			const embeddings = generateRandomEmbeddings(20, 50);
			await reducer.fit(embeddings);
			expect(reducer.isFitted()).toBe(true);

			reducer.reset();
			expect(reducer.isFitted()).toBe(false);
		});
	});

	describe('reduceEmbeddings convenience function', () => {
		it('should reduce embeddings in one call', async () => {
			const embeddings = generateRandomEmbeddings(20, 50);
			const result = await reduceEmbeddings(embeddings);

			expect(result.notePaths.length).toBe(20);
			expect(result.reducedEmbeddings.length).toBe(20);
		});

		it('should accept custom config', async () => {
			const embeddings = generateRandomEmbeddings(20, 50);
			const result = await reduceEmbeddings(embeddings, { nComponents: 5 });

			for (const reduced of result.reducedEmbeddings) {
				expect(reduced.length).toBe(5);
			}
		});
	});
});

/**
 * Helper to generate random embeddings for testing
 */
function generateRandomEmbeddings(
	count: number,
	dimensions: number,
	prefix = 'note_',
): Array<{ notePath: string; embedding: number[] }> {
	const embeddings: Array<{ notePath: string; embedding: number[] }> = [];

	for (let i = 0; i < count; i++) {
		const embedding = new Array(dimensions).fill(0).map(() => Math.random() * 2 - 1);
		// Normalize to unit vector
		const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
		const normalizedEmbedding = embedding.map((x) => x / norm);

		embeddings.push({
			notePath: `${prefix}${i}.md`,
			embedding: normalizedEmbedding,
		});
	}

	return embeddings;
}
