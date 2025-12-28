/**
 * LLM Domain Types for Concept Naming
 *
 * This module provides types for the LLM-powered concept naming pipeline.
 * Stage 3 (naming) and Stage 3.5 (refinement) are merged into a single stage.
 */

import type { EvolutionEvent } from '@/domain/evolution/types';
import { QUIZZABILITY_THRESHOLD } from '@/domain/evolution/types';

/**
 * Minimal cluster info sent to LLM to save tokens
 */
export interface ClusterSummary {
	/** Unique cluster identifier */
	clusterId: string;
	/** Candidate concept names derived from cluster analysis */
	candidateNames: string[];
	/** Top note titles (max 5) representing the cluster */
	representativeTitles: string[];
	/** Most common tags in the cluster */
	commonTags: string[];
	/** Common folder path for notes */
	folderPath: string;
	/** Number of notes in the cluster */
	noteCount: number;
}

/**
 * A note that doesn't fit its cluster (detected during naming)
 */
export interface MisfitNote {
	/** Note ID (file path) */
	noteId: string;
	/** Reason why this note doesn't fit */
	reason: string;
}

/**
 * LLM response for a single cluster's concept naming
 * Includes misfit detection (merged Stage 3 + 3.5)
 */
export interface ConceptNamingResult {
	/** Cluster ID this result applies to */
	clusterId: string;
	/** LLM-assigned canonical concept name */
	canonicalName: string;
	/** Quizzability score (0-1) */
	quizzabilityScore: number;
	/** Reason if not quizzable (score < 0.4) */
	nonQuizzableReason?: string;
	/** Other cluster IDs that should merge with this one */
	suggestedMerges: string[];
	/** Notes that don't fit this cluster (misfit detection) */
	misfitNotes: MisfitNote[];
}

/**
 * TrackedConcept - A named concept with evolution tracking
 *
 * This is the primary concept type used throughout the application.
 * Quizzability is derived from quizzabilityScore >= QUIZZABILITY_THRESHOLD (0.4).
 */
export interface TrackedConcept {
	/** Unique concept identifier */
	id: string;
	/** Canonical concept name */
	canonicalName: string;
	/** Note IDs (file paths) belonging to this concept */
	noteIds: string[];
	/** Quizzability score (0-1) */
	quizzabilityScore: number;
	/** Current cluster ID (singular, updated on evolution) */
	clusterId: string;
	/** Metadata for concept lifecycle */
	metadata: {
		createdAt: number;
		lastUpdated: number;
	};
	/** History of evolution events for this concept */
	evolutionHistory: EvolutionEvent[];
}

/**
 * Request for concept naming batch
 */
export interface ConceptNamingRequest {
	/** Cluster summaries to name */
	clusters: ClusterSummary[];
}

/**
 * Response from concept naming batch
 */
export interface ConceptNamingResponse {
	/** Naming results for each cluster */
	results: ConceptNamingResult[];
	/** Token usage statistics */
	usage?: TokenUsage;
}

/**
 * Token usage statistics from LLM call
 */
export interface TokenUsage {
	/** Input tokens consumed */
	inputTokens: number;
	/** Output tokens generated */
	outputTokens: number;
}

/**
 * Configuration for LLM provider
 */
export interface LLMConfig {
	/** API key for the LLM service */
	apiKey?: string;
	/** Model to use */
	model: string;
	/** Maximum tokens in response */
	maxTokens: number;
	/** Temperature for generation (0-1) */
	temperature: number;
	/** Number of clusters per batch */
	batchSize: number;
	/** Maximum retries on failure */
	maxRetries: number;
	/** Base delay for exponential backoff (ms) */
	retryBaseDelay: number;
}

/**
 * Default LLM configuration
 */
export const DEFAULT_LLM_CONFIG: LLMConfig = {
	model: 'claude-sonnet-4-20250514',
	maxTokens: 4096,
	temperature: 0.3,
	batchSize: 20,
	maxRetries: 3,
	retryBaseDelay: 1000,
};

/**
 * Check if a concept is quizzable based on its score
 *
 * @param concept - Concept to check
 * @returns true if quizzability score >= threshold
 */
export function isQuizzable(concept: TrackedConcept): boolean {
	return concept.quizzabilityScore >= QUIZZABILITY_THRESHOLD;
}

/**
 * Check if a quizzability score indicates quizzable content
 *
 * @param score - Quizzability score (0-1)
 * @returns true if score >= threshold
 */
export function isQuizzableScore(score: number): boolean {
	return score >= QUIZZABILITY_THRESHOLD;
}

/**
 * Helper to create a TrackedConcept with defaults
 */
export function createTrackedConcept(
	partial: Partial<TrackedConcept> & {
		canonicalName: string;
		noteIds: string[];
		clusterId: string;
	},
): TrackedConcept {
	const now = Date.now();
	return {
		id: partial.id ?? `concept-${now}-${Math.random().toString(36).slice(2, 8)}`,
		canonicalName: partial.canonicalName,
		noteIds: partial.noteIds,
		quizzabilityScore: partial.quizzabilityScore ?? 0.5,
		clusterId: partial.clusterId,
		metadata: partial.metadata ?? {
			createdAt: now,
			lastUpdated: now,
		},
		evolutionHistory: partial.evolutionHistory ?? [],
	};
}

/**
 * Generate a unique concept ID
 */
export function generateConceptId(): string {
	return `concept-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ============ Legacy Types (Deprecated) ============
// These types are kept for backward compatibility during migration.
// They will be removed in a future version.

/**
 * @deprecated Use TrackedConcept instead
 */
export interface Concept {
	id: string;
	name: string;
	noteIds: string[];
	quizzabilityScore: number;
	isQuizzable: boolean;
	originalClusterIds: string[];
	createdAt: number;
}

/**
 * @deprecated Use createTrackedConcept instead
 */
export function createConcept(
	partial: Partial<Concept> & { name: string; noteIds: string[] },
): Concept {
	return {
		id: partial.id ?? `concept-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		name: partial.name,
		noteIds: partial.noteIds,
		quizzabilityScore: partial.quizzabilityScore ?? 0.5,
		isQuizzable: partial.isQuizzable ?? true,
		originalClusterIds: partial.originalClusterIds ?? [],
		createdAt: partial.createdAt ?? Date.now(),
	};
}

/**
 * Convert a TrackedConcept to legacy Concept format
 *
 * @deprecated Use TrackedConcept directly
 */
export function toLegacyConcept(tracked: TrackedConcept): Concept {
	return {
		id: tracked.id,
		name: tracked.canonicalName,
		noteIds: tracked.noteIds,
		quizzabilityScore: tracked.quizzabilityScore,
		isQuizzable: isQuizzable(tracked),
		originalClusterIds: [tracked.clusterId],
		createdAt: tracked.metadata.createdAt,
	};
}

/**
 * Convert a legacy Concept to TrackedConcept format
 *
 * @deprecated Use TrackedConcept directly
 */
export function fromLegacyConcept(legacy: Concept): TrackedConcept {
	return {
		id: legacy.id,
		canonicalName: legacy.name,
		noteIds: legacy.noteIds,
		quizzabilityScore: legacy.quizzabilityScore,
		clusterId: legacy.originalClusterIds[0] ?? '',
		metadata: {
			createdAt: legacy.createdAt,
			lastUpdated: legacy.createdAt,
		},
		evolutionHistory: [],
	};
}

// ============ Removed Types ============
// The following types have been removed as part of the Stage 3/3.5 merge:
// - SynonymPattern (synonym detection now handled via suggestedMerges in ConceptNamingResult)
// - ConceptSummary (no longer needed without separate refinement stage)
// - ClusterRefinementRequest (no longer needed without separate refinement stage)
// - ClusterRefinementResponse (no longer needed without separate refinement stage)
