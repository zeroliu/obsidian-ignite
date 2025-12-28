import type { EmbeddingInput } from '@/ports/IEmbeddingProvider';

/**
 * Result of filtering empty texts from embedding inputs
 */
export interface FilteredEmbeddingInputs {
	/** Non-empty texts that should be sent to the API */
	nonEmptyTexts: EmbeddingInput[];
	/** Note paths that were excluded due to empty text */
	excludedNotePaths: string[];
}

/**
 * Filter out empty texts from embedding inputs.
 *
 * Embedding APIs (OpenAI, Voyage) reject empty strings, and empty texts
 * produce meaningless embeddings anyway. This utility separates non-empty
 * texts for API calls from empty texts that should be excluded.
 *
 * @param inputs - Array of embedding inputs to filter
 * @returns Object containing non-empty texts and excluded note paths
 */
export function filterEmptyTexts(inputs: EmbeddingInput[]): FilteredEmbeddingInputs {
	const nonEmptyTexts: EmbeddingInput[] = [];
	const excludedNotePaths: string[] = [];

	for (const input of inputs) {
		if (input.text.trim() === '') {
			excludedNotePaths.push(input.notePath);
		} else {
			nonEmptyTexts.push(input);
		}
	}

	return { nonEmptyTexts, excludedNotePaths };
}
