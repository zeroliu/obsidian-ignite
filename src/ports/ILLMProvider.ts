import type { ConceptNamingRequest, ConceptNamingResponse, LLMConfig } from '@/domain/llm/types';

/**
 * Port interface for LLM operations
 *
 * Abstracts away specific LLM providers (Claude, OpenAI, etc.) for testability.
 * Stage 3 (naming) and Stage 3.5 (refinement) are merged into a single stage.
 * Misfit detection is now part of the naming response.
 */
export interface ILLMProvider {
	/**
	 * Process a batch of clusters for concept naming
	 *
	 * The naming response includes:
	 * - Canonical concept names
	 * - Quizzability scores
	 * - Suggested merges for similar concepts
	 * - Misfit notes that don't belong to their clusters
	 *
	 * @param request - Cluster summaries to name
	 * @returns Promise resolving to naming results with misfits
	 */
	nameConceptsBatch(request: ConceptNamingRequest): Promise<ConceptNamingResponse>;

	/**
	 * Get current LLM configuration
	 * @returns Current configuration
	 */
	getConfig(): LLMConfig;

	/**
	 * Update LLM configuration
	 * @param config - Partial configuration to update
	 */
	updateConfig(config: Partial<LLMConfig>): void;
}
