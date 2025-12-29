/**
 * Question Generation Module
 *
 * This module provides all the components for generating quiz questions from notes.
 */

// Types
export type {
  Difficulty,
  DerivedNoteStats,
  NoteQuestionHistory,
  NoteScore,
  NoteSelectionInput,
  Question,
  QuestionCacheEntry,
  QuestionFormat,
  QuestionGenerationConfig,
  QuestionGenerationRequest,
  QuestionGenerationResponse,
  QuestionHistoryEntry,
  QuestionHistorySummary,
  QuestionInteraction,
  QuestionStatus,
  QuizEntryPoint,
  QuizSession,
  TimeFilter,
} from './types';

export {
  DEFAULT_QUESTION_CONFIG,
  EMPTY_DERIVED_STATS,
  QUESTION_CACHE_VERSION,
  QUESTION_HISTORY_VERSION,
  generateQuestionId,
  generateSessionId,
} from './types';

// Note Selection
export {
  calculateColdStartScore,
  calculateRecencyScore,
  calculateRichnessScore,
  calculateSpacedRepScore,
  calculateStruggleScore,
  calculateVarietyScore,
  scoreNote,
  selectNotes,
  shouldQuizNote,
} from './noteSelection';

// Entry Points
export type { EntryPointDependencies } from './entryPoints';
export {
  getNotesForAllConcepts,
  getNotesForConcept,
  getNotesForDirectSelection,
  getNotesForTimeFilter,
  getNotesDueForReview,
  getTimeCutoff,
  isNoteDue,
  resolveNotesForEntry,
} from './entryPoints';

// Cache
export { QuestionCacheManager, getQuestionCacheKey } from './cache';

// History Manager
export { QuestionHistoryManager, getQuestionHistoryKey } from './historyManager';

// Prompts
export {
  QUESTION_GENERATION_SYSTEM_PROMPT,
  buildQuestionGenerationPrompt,
  parseQuestionResponse,
} from './prompts';

// Pipeline
export type {
  QuestionPipelineInput,
  QuestionPipelineResult,
  QuizDependencies,
} from './pipeline';
export { initializeQuiz, runQuestionPipeline, selectFinalQuestions } from './pipeline';
