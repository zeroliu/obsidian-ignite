/**
 * Evolution Module
 *
 * Handles cluster evolution detection and concept auto-evolution.
 * Uses Jaccard similarity to track how clusters change between runs.
 */

// Types
export type { EvolutionType, ClusterEvolution, EvolutionEvent, EvolutionConfig } from './types';
export { DEFAULT_EVOLUTION_CONFIG, QUIZZABILITY_THRESHOLD } from './types';

// Jaccard Similarity
export { jaccard, jaccardArrays, findBestMatch } from './jaccardSimilarity';

// Evolution Detection
export type { EvolutionDetectionResult } from './detectEvolution';
export {
  detectEvolution,
  classifyEvolution,
  findEvolutionForCluster,
  groupEvolutionsByType,
} from './detectEvolution';

// Auto-Evolve Concept
export type { AutoEvolveResult, EvolutionStats } from './autoEvolveConcept';
export {
  autoEvolveConcept,
  autoEvolveConceptBatch,
  filterSurvivingConcepts,
  calculateEvolutionStats,
} from './autoEvolveConcept';
