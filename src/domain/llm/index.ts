// LLM Domain Module
// Provides concept naming using LLMs with integrated misfit detection

// Types
export type {
  ClusterSummary,
  ConceptNamingResult,
  TrackedConcept,
  MisfitNote,
  ConceptNamingRequest,
  ConceptNamingResponse,
  TokenUsage,
  LLMConfig,
  // Legacy types (deprecated)
  Concept,
} from './types';

export {
  DEFAULT_LLM_CONFIG,
  createTrackedConcept,
  generateConceptId,
  isQuizzable,
  isQuizzableScore,
  // Legacy helpers (deprecated)
  createConcept,
  toLegacyConcept,
  fromLegacyConcept,
} from './types';

// Cluster Summary Preparation
export {
  prepareClusterSummaries,
  selectRepresentativeTitles,
  batchClusterSummaries,
  DEFAULT_PREPARE_CONFIG,
} from './prepareClusterSummaries';
export type { PrepareClusterSummariesConfig } from './prepareClusterSummaries';

// Concept Naming
export {
  processConceptNaming,
  createConceptFromResult,
  filterQuizzableConcepts,
  filterNonQuizzableConcepts,
} from './processConceptNaming';
export type { ProcessNamingResult } from './processConceptNaming';

// Pipeline
export { runLLMPipeline, runConceptNamingOnly } from './pipeline';
export type { LLMPipelineInput, LLMPipelineResult, LLMPipelineStats } from './pipeline';

// Prompts
export {
  CONCEPT_NAMING_SYSTEM_PROMPT,
  buildConceptNamingPrompt,
  parseNamingResponse,
} from './prompts';

// Helpers
export { getEffectiveNoteIds } from './getEffectiveNoteIds';
export type { ManualOverrides } from './getEffectiveNoteIds';
