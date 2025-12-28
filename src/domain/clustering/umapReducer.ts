import { UMAP } from 'umap-js';
import type { UMAPConfig } from './types';
import { DEFAULT_UMAP_CONFIG } from './types';

/**
 * Cosine distance function for UMAP
 */
function cosineDistance(x: number[], y: number[]): number {
	let dotProduct = 0;
	let normX = 0;
	let normY = 0;
	for (let i = 0; i < x.length; i++) {
		dotProduct += x[i] * y[i];
		normX += x[i] * x[i];
		normY += y[i] * y[i];
	}
	const denominator = Math.sqrt(normX) * Math.sqrt(normY);
	if (denominator === 0) return 1; // Maximum distance
	return 1 - dotProduct / denominator;
}

/**
 * Euclidean distance function for UMAP
 */
function euclideanDistance(x: number[], y: number[]): number {
	let sum = 0;
	for (let i = 0; i < x.length; i++) {
		const diff = x[i] - y[i];
		sum += diff * diff;
	}
	return Math.sqrt(sum);
}

/**
 * Result of UMAP dimensionality reduction
 */
export interface UMAPResult {
	/** Reduced embeddings (n_samples x nComponents) */
	reducedEmbeddings: number[][];
	/** Note paths in the same order as embeddings */
	notePaths: string[];
}

/**
 * UMAP-based dimensionality reducer for embeddings
 *
 * Reduces high-dimensional embeddings (e.g., 1536 dims from OpenAI)
 * to lower dimensions (e.g., 10) for efficient clustering with HDBSCAN.
 */
export class UMAPReducer {
	private config: UMAPConfig;
	private umap: UMAP | null = null;
	private fitted = false;

	constructor(config: Partial<UMAPConfig> = {}) {
		this.config = { ...DEFAULT_UMAP_CONFIG, ...config };
	}

	/**
	 * Fit UMAP on embeddings and transform to reduced dimensions
	 *
	 * @param embeddings - Array of note embeddings with their paths
	 * @returns Reduced embeddings in the same order
	 */
	async fit(embeddings: Array<{ notePath: string; embedding: number[] }>): Promise<UMAPResult> {
		if (embeddings.length === 0) {
			return { reducedEmbeddings: [], notePaths: [] };
		}

		// Extract vectors and note paths
		const vectors = embeddings.map((e) => e.embedding);
		const notePaths = embeddings.map((e) => e.notePath);

		// Validate embedding dimensions are consistent
		const dims = vectors[0].length;
		for (let i = 1; i < vectors.length; i++) {
			if (vectors[i].length !== dims) {
				throw new Error(
					`Inconsistent embedding dimensions: expected ${dims}, got ${vectors[i].length} at index ${i}`,
				);
			}
		}

		// Need at least nNeighbors+1 samples for UMAP to work
		const minSamples = this.config.nNeighbors + 1;
		if (embeddings.length < minSamples) {
			// For very small datasets, just return the original embeddings
			// truncated/padded to nComponents dimensions
			const reducedEmbeddings = vectors.map((v) => this.truncateOrPad(v, this.config.nComponents));
			return { reducedEmbeddings, notePaths };
		}

		// Create UMAP instance with configuration
		this.umap = new UMAP({
			nNeighbors: Math.min(this.config.nNeighbors, embeddings.length - 1),
			minDist: this.config.minDist,
			nComponents: this.config.nComponents,
			distanceFn: this.config.metric === 'cosine' ? cosineDistance : euclideanDistance,
		});

		// Fit and transform
		const reducedEmbeddings = this.umap.fit(vectors);
		this.fitted = true;

		return { reducedEmbeddings, notePaths };
	}

	/**
	 * Transform new embeddings using the fitted UMAP model
	 *
	 * @param newEmbeddings - New embeddings to transform
	 * @returns Transformed embeddings
	 * @throws Error if UMAP has not been fitted yet
	 */
	transform(newEmbeddings: Array<{ notePath: string; embedding: number[] }>): UMAPResult {
		if (!this.fitted || !this.umap) {
			throw new Error('UMAP has not been fitted. Call fit() first.');
		}

		if (newEmbeddings.length === 0) {
			return { reducedEmbeddings: [], notePaths: [] };
		}

		const vectors = newEmbeddings.map((e) => e.embedding);
		const notePaths = newEmbeddings.map((e) => e.notePath);

		const reducedEmbeddings = this.umap.transform(vectors);

		return { reducedEmbeddings, notePaths };
	}

	/**
	 * Check if UMAP has been fitted
	 */
	isFitted(): boolean {
		return this.fitted;
	}

	/**
	 * Get the current configuration
	 */
	getConfig(): UMAPConfig {
		return { ...this.config };
	}

	/**
	 * Reset the reducer state (clears fitted model)
	 */
	reset(): void {
		this.umap = null;
		this.fitted = false;
	}

	/**
	 * Truncate or pad a vector to target length
	 * Used for very small datasets where UMAP can't run
	 */
	private truncateOrPad(vector: number[], targetLength: number): number[] {
		if (vector.length >= targetLength) {
			return vector.slice(0, targetLength);
		}
		// Pad with zeros
		return [...vector, ...new Array(targetLength - vector.length).fill(0)];
	}
}

/**
 * Convenience function to reduce embeddings in one call
 *
 * @param embeddings - Embeddings to reduce
 * @param config - UMAP configuration
 * @returns Reduced embeddings
 */
export async function reduceEmbeddings(
	embeddings: Array<{ notePath: string; embedding: number[] }>,
	config: Partial<UMAPConfig> = {},
): Promise<UMAPResult> {
	const reducer = new UMAPReducer(config);
	return reducer.fit(embeddings);
}
