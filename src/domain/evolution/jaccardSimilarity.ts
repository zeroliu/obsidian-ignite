/**
 * Jaccard Similarity Calculator
 *
 * Computes Jaccard similarity between sets for cluster evolution detection.
 * Jaccard similarity = |A ∩ B| / |A ∪ B|
 */

/**
 * Calculate Jaccard similarity between two sets
 *
 * @param setA - First set
 * @param setB - Second set
 * @returns Jaccard similarity score (0-1)
 */
export function jaccard<T>(setA: Set<T>, setB: Set<T>): number {
	if (setA.size === 0 && setB.size === 0) {
		return 1; // Both empty sets are considered identical
	}

	if (setA.size === 0 || setB.size === 0) {
		return 0; // One empty set means no overlap
	}

	// Calculate intersection size
	let intersectionSize = 0;
	for (const item of setA) {
		if (setB.has(item)) {
			intersectionSize++;
		}
	}

	// Calculate union size: |A| + |B| - |A ∩ B|
	const unionSize = setA.size + setB.size - intersectionSize;

	return intersectionSize / unionSize;
}

/**
 * Calculate Jaccard similarity between two arrays
 * Converts arrays to sets internally
 *
 * @param arrayA - First array
 * @param arrayB - Second array
 * @returns Jaccard similarity score (0-1)
 */
export function jaccardArrays<T>(arrayA: T[], arrayB: T[]): number {
	return jaccard(new Set(arrayA), new Set(arrayB));
}

/**
 * Find the best matching set from a list based on Jaccard similarity
 *
 * @param target - Target set to match against
 * @param candidates - List of candidate sets with IDs
 * @returns Best match with ID and score, or null if no candidates
 */
export function findBestMatch<T>(
	target: Set<T>,
	candidates: Array<{ id: string; set: Set<T> }>,
): { id: string; score: number } | null {
	if (candidates.length === 0) {
		return null;
	}

	let bestMatch: { id: string; score: number } | null = null;

	for (const candidate of candidates) {
		const score = jaccard(target, candidate.set);
		if (bestMatch === null || score > bestMatch.score) {
			bestMatch = { id: candidate.id, score };
		}
	}

	return bestMatch;
}
