/**
 * Centroid calculator for embedding clusters
 *
 * Computes cluster centroids and selects representative notes
 * for LLM context and cluster characterization.
 */

/**
 * Compute the centroid (mean) of a set of embeddings
 *
 * @param embeddings - Array of embedding vectors (all same dimension)
 * @returns Centroid vector
 * @throws Error if embeddings array is empty or dimensions don't match
 */
export function computeCentroid(embeddings: number[][]): number[] {
	if (embeddings.length === 0) {
		throw new Error('Cannot compute centroid of empty embedding set');
	}

	const dims = embeddings[0].length;
	const centroid = new Array(dims).fill(0);

	for (const embedding of embeddings) {
		if (embedding.length !== dims) {
			throw new Error(
				`Inconsistent embedding dimensions: expected ${dims}, got ${embedding.length}`,
			);
		}
		for (let i = 0; i < dims; i++) {
			centroid[i] += embedding[i];
		}
	}

	// Compute mean
	for (let i = 0; i < dims; i++) {
		centroid[i] /= embeddings.length;
	}

	return centroid;
}

/**
 * Compute cosine similarity between two vectors
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity (-1 to 1, higher is more similar)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length) {
		throw new Error(`Vector dimensions must match: ${a.length} vs ${b.length}`);
	}

	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	const denominator = Math.sqrt(normA) * Math.sqrt(normB);
	if (denominator === 0) {
		return 0;
	}

	return dotProduct / denominator;
}

/**
 * Compute Euclidean distance between two vectors
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Euclidean distance (0 or greater, lower is more similar)
 */
export function euclideanDistance(a: number[], b: number[]): number {
	if (a.length !== b.length) {
		throw new Error(`Vector dimensions must match: ${a.length} vs ${b.length}`);
	}

	let sum = 0;
	for (let i = 0; i < a.length; i++) {
		const diff = a[i] - b[i];
		sum += diff * diff;
	}

	return Math.sqrt(sum);
}

/**
 * Select representative embeddings closest to centroid
 *
 * @param embeddings - Array of embeddings with their indices
 * @param centroid - Cluster centroid
 * @param topK - Number of representatives to select
 * @returns Indices of the most representative embeddings (closest to centroid)
 */
export function selectRepresentatives(
	embeddings: Array<{ index: number; embedding: number[] }>,
	centroid: number[],
	topK: number,
): number[] {
	if (embeddings.length === 0) {
		return [];
	}

	if (topK >= embeddings.length) {
		return embeddings.map((e) => e.index);
	}

	// Calculate similarity to centroid for each embedding
	const withSimilarity = embeddings.map((e) => ({
		index: e.index,
		similarity: cosineSimilarity(e.embedding, centroid),
	}));

	// Sort by similarity (descending) and take top K
	withSimilarity.sort((a, b) => b.similarity - a.similarity);

	return withSimilarity.slice(0, topK).map((e) => e.index);
}

/**
 * Result of cluster centroid computation
 */
export interface ClusterCentroidResult {
	/** Cluster label */
	label: number;
	/** Centroid vector */
	centroid: number[];
	/** Indices of representative members */
	representativeIndices: number[];
	/** Number of members in cluster */
	memberCount: number;
}

/**
 * Compute centroids and representatives for all clusters
 *
 * @param embeddings - All embeddings
 * @param labels - Cluster labels for each embedding (-1 for noise)
 * @param representativeCount - Number of representatives per cluster
 * @returns Array of cluster centroid results (excludes noise cluster)
 */
export function computeClusterCentroids(
	embeddings: number[][],
	labels: number[],
	representativeCount: number,
): ClusterCentroidResult[] {
	if (embeddings.length !== labels.length) {
		throw new Error(
			`Embeddings and labels length mismatch: ${embeddings.length} vs ${labels.length}`,
		);
	}

	// Group embeddings by cluster label
	const clusterEmbeddings = new Map<number, Array<{ index: number; embedding: number[] }>>();

	for (let i = 0; i < labels.length; i++) {
		const label = labels[i];
		if (label === -1) {
			// Skip noise points
			continue;
		}
		const cluster = clusterEmbeddings.get(label);
		if (cluster) {
			cluster.push({ index: i, embedding: embeddings[i] });
		} else {
			clusterEmbeddings.set(label, [{ index: i, embedding: embeddings[i] }]);
		}
	}

	// Compute centroid and representatives for each cluster
	const results: ClusterCentroidResult[] = [];

	for (const [label, members] of clusterEmbeddings.entries()) {
		const embeddingVectors = members.map((m) => m.embedding);
		const centroid = computeCentroid(embeddingVectors);
		const representativeIndices = selectRepresentatives(members, centroid, representativeCount);

		results.push({
			label,
			centroid,
			representativeIndices,
			memberCount: members.length,
		});
	}

	// Sort by label for consistent ordering
	results.sort((a, b) => a.label - b.label);

	return results;
}

/**
 * Find the nearest cluster centroid for a given embedding
 *
 * @param embedding - Embedding to assign
 * @param centroids - Map of cluster ID to centroid vector
 * @returns Cluster ID of nearest centroid, or null if no centroids
 */
export function findNearestCentroid(
	embedding: number[],
	centroids: Map<string, number[]>,
): string | null {
	let bestClusterId: string | null = null;
	let bestSimilarity = Number.NEGATIVE_INFINITY;

	for (const [clusterId, centroid] of centroids.entries()) {
		const similarity = cosineSimilarity(embedding, centroid);
		if (similarity > bestSimilarity) {
			bestSimilarity = similarity;
			bestClusterId = clusterId;
		}
	}

	return bestClusterId;
}
