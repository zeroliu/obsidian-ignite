import type { Cluster } from '@/domain/clustering/types';
import type { ILLMProvider } from '@/ports/ILLMProvider';
import type { FileInfo } from '@/ports/IVaultProvider';
import { batchClusterSummaries, prepareClusterSummaries } from './prepareClusterSummaries';
import { processConceptNaming } from './processConceptNaming';
import type { ConceptNamingResult, MisfitNote, TokenUsage, TrackedConcept } from './types';
import { isQuizzableScore } from './types';

/**
 * Input for the LLM pipeline
 */
export interface LLMPipelineInput {
	/** Clusters from the clustering pipeline */
	clusters: Cluster[];
	/** Map of file paths to FileInfo for getting titles */
	fileMap: Map<string, FileInfo>;
	/** LLM provider instance */
	llmProvider: ILLMProvider;
}

/**
 * Result from the LLM pipeline
 */
export interface LLMPipelineResult {
	/** All named concepts (using TrackedConcept) */
	concepts: TrackedConcept[];
	/** Quizzable concepts only (score >= 0.4) */
	quizzableConcepts: TrackedConcept[];
	/** Non-quizzable concepts (score < 0.4) */
	nonQuizzableConcepts: TrackedConcept[];
	/** Misfit notes identified during naming */
	misfitNotes: MisfitNote[];
	/** Pipeline statistics */
	stats: LLMPipelineStats;
}

/**
 * Statistics about the LLM pipeline run
 */
export interface LLMPipelineStats {
	/** Total clusters processed */
	totalClusters: number;
	/** Total concepts created */
	totalConcepts: number;
	/** Number of quizzable concepts */
	quizzableConceptCount: number;
	/** Number of non-quizzable concepts */
	nonQuizzableConceptCount: number;
	/** Number of batches for concept naming */
	namingBatches: number;
	/** Token usage statistics */
	tokenUsage: TokenUsage;
	/** Notes removed as misfits */
	misfitNotesRemoved: number;
}

/**
 * Run the complete LLM pipeline
 *
 * The pipeline executes the following steps:
 * 1. Prepare cluster summaries for LLM
 * 2. Batch clusters for efficient LLM calls
 * 3. Call LLM to name concepts (with misfit detection)
 * 4. Process naming results into TrackedConcepts
 * 5. Filter out misfit notes from concepts
 *
 * Note: Stage 3 (naming) and Stage 3.5 (refinement) have been merged.
 * Misfit detection now happens during the naming stage.
 *
 * @param input - Pipeline input
 * @returns Pipeline result with named concepts and statistics
 */
export async function runLLMPipeline(input: LLMPipelineInput): Promise<LLMPipelineResult> {
	const { clusters, fileMap, llmProvider } = input;
	const config = llmProvider.getConfig();

	// Initialize token tracking
	const tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

	// Step 1: Prepare cluster summaries
	const summaries = prepareClusterSummaries(clusters, fileMap, {
		batchSize: config.batchSize,
	});

	// Step 2: Batch summaries
	const batches = batchClusterSummaries(summaries, config.batchSize);

	// Step 3: Call LLM to name concepts (includes misfit detection)
	const allResults: ConceptNamingResult[] = [];

	for (const batch of batches) {
		const response = await llmProvider.nameConceptsBatch({ clusters: batch });
		allResults.push(...response.results);

		if (response.usage) {
			tokenUsage.inputTokens += response.usage.inputTokens;
			tokenUsage.outputTokens += response.usage.outputTokens;
		}
	}

	// Step 4: Process results into TrackedConcepts (handles merges and misfits)
	const { concepts, misfitNotes } = processConceptNaming(clusters, allResults);

	// Separate quizzable and non-quizzable
	const quizzableConcepts = concepts.filter((c) => isQuizzableScore(c.quizzabilityScore));
	const nonQuizzableConcepts = concepts.filter((c) => !isQuizzableScore(c.quizzabilityScore));

	return {
		concepts,
		quizzableConcepts,
		nonQuizzableConcepts,
		misfitNotes,
		stats: {
			totalClusters: clusters.length,
			totalConcepts: concepts.length,
			quizzableConceptCount: quizzableConcepts.length,
			nonQuizzableConceptCount: nonQuizzableConcepts.length,
			namingBatches: batches.length,
			tokenUsage,
			misfitNotesRemoved: misfitNotes.length,
		},
	};
}

/**
 * Run the LLM pipeline (alias for runLLMPipeline)
 *
 * @deprecated The runRefinement parameter is no longer used.
 * Refinement is now part of the naming stage.
 */
export async function runConceptNamingOnly(input: LLMPipelineInput): Promise<LLMPipelineResult> {
	return runLLMPipeline(input);
}
