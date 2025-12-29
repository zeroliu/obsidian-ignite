/**
 * Question Generation Domain Types
 *
 * This module provides types for the question generation pipeline
 * that transforms notes into quiz questions.
 */

// ============ Question Types ============

/**
 * Question format types
 */
export type QuestionFormat = 'multiple_choice' | 'true_false' | 'fill_blank' | 'free_form';

/**
 * Difficulty levels
 */
export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * A generated quiz question
 */
export interface Question {
  /** Unique question identifier */
  id: string;
  /** Question format type */
  format: QuestionFormat;
  /** Difficulty rating */
  difficulty: Difficulty;
  /** The question text */
  question: string;
  /** Source note path */
  sourceNoteId: string;
  /** LLM-assigned quality score (0-1) */
  qualityScore: number;
  /** Options for multiple choice (4 items) */
  options?: string[];
  /** Correct answer - index for MC, string for others */
  correctAnswer: string | number;
  /** Optional explanation */
  explanation?: string;
  /** Generation timestamp */
  generatedAt: number;
}

/**
 * Generate a unique question ID
 */
export function generateQuestionId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============ Cache Types ============

/**
 * Question cache entry (stored per note)
 */
export interface QuestionCacheEntry {
  /** Schema version for migrations */
  version: number;
  /** Note file path */
  notePath: string;
  /** Content hash for invalidation */
  contentHash: string;
  /** Hash of relevant history state when generated */
  historyFingerprint: string;
  /** When questions were generated */
  generatedAt: number;
  /** Cached questions for this note */
  questions: Question[];
}

/** Current cache schema version */
export const QUESTION_CACHE_VERSION = 1;

// ============ Question History Types ============

/**
 * Status of a question from the user's perspective
 */
export type QuestionStatus = 'answered' | 'skipped' | 'mastered';

/**
 * Record of a single interaction with a question
 */
export interface QuestionInteraction {
  /** When the interaction occurred */
  timestamp: number;
  /** Was the answer correct (null if skipped) */
  correct: boolean | null;
  /** User's response (for free-form, optional) */
  userAnswer?: string;
}

/**
 * History for a single question
 */
export interface QuestionHistoryEntry {
  /** Question ID (from Question.id) */
  questionId: string;
  /** The question text (for LLM context) */
  questionText: string;
  /** Source note path */
  sourceNoteId: string;
  /** Current status */
  status: QuestionStatus;
  /** All interactions with this question */
  interactions: QuestionInteraction[];
  /** Number of times answered correctly */
  correctCount: number;
  /** Number of times answered incorrectly */
  incorrectCount: number;
  /** Current correct streak */
  correctStreak: number;
  /** When first generated */
  firstSeen: number;
  /** When last interacted with */
  lastInteraction: number | null;
}

/**
 * Complete question history for a note
 * Stored per note for efficient lookup
 */
export interface NoteQuestionHistory {
  /** Schema version for migrations */
  version: number;
  /** Note file path this history belongs to */
  noteId: string;
  /** Map of questionId -> QuestionHistoryEntry */
  questions: Record<string, QuestionHistoryEntry>;
  /** Last time this history was updated */
  lastUpdated: number;
}

/** Current history schema version */
export const QUESTION_HISTORY_VERSION = 1;

/**
 * Summary of question history for LLM context
 * Lightweight version sent to LLM prompt
 */
export interface QuestionHistorySummary {
  /** Questions the user has mastered (don't regenerate) */
  masteredQuestions: string[];
  /** Questions answered correctly multiple times (lower priority) */
  wellKnownQuestions: string[];
  /** Questions user struggles with (may want variations) */
  strugglingQuestions: string[];
  /** Recently shown questions (avoid immediate repetition) */
  recentlyShownQuestions: string[];
}

/**
 * Derived note-level stats from question history
 * Replaces the old NoteQuizHistory type
 */
export interface DerivedNoteStats {
  lastQuizzed: number | null;
  quizCount: number;
  correctCount: number;
  correctStreak: number;
}

/**
 * Empty derived stats for cold-start mode
 */
export const EMPTY_DERIVED_STATS: DerivedNoteStats = {
  lastQuizzed: null,
  quizCount: 0,
  correctCount: 0,
  correctStreak: 0,
};

// ============ Note Scoring Types ============

/**
 * Input for note scoring
 */
export interface NoteSelectionInput {
  noteId: string;
  wordCount: number;
  headingCount: number;
  modifiedAt: number;
  incomingLinkCount: number;
}

/**
 * Scored note with factor breakdown
 */
export interface NoteScore {
  noteId: string;
  totalScore: number;
  factors: {
    spacedRepScore: number;
    richnessScore: number;
    recencyScore: number;
    varietyScore: number;
    struggleScore: number;
  };
  isNeverQuizzed: boolean;
}

// ============ Pipeline Types ============

/**
 * Request for question generation batch
 */
export interface QuestionGenerationRequest {
  notes: Array<{
    noteId: string;
    title: string;
    content: string;
  }>;
}

/**
 * Response from question generation
 */
export interface QuestionGenerationResponse {
  questions: Question[];
  /** Questions that failed validation during parsing */
  skipped?: Array<{ item: unknown; reason: string }>;
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * Configuration for question generation
 */
export interface QuestionGenerationConfig {
  /** Notes per LLM batch (default: 5) */
  notesPerBatch: number;
  /** Target questions per note (default: 3) */
  questionsPerNote: number;
  /** Final question count target (default: 10) */
  targetQuestionCount: number;
  /** Cache expiry in days (default: 7) */
  cacheMaxAgeDays: number;
  /** Format distribution for final selection */
  targetDistribution: Record<QuestionFormat, number>;
}

export const DEFAULT_QUESTION_CONFIG: QuestionGenerationConfig = {
  notesPerBatch: 5,
  questionsPerNote: 3,
  targetQuestionCount: 10,
  cacheMaxAgeDays: 7,
  targetDistribution: {
    multiple_choice: 4,
    true_false: 2,
    fill_blank: 2,
    free_form: 2,
  },
};

// ============ Quiz Entry Point Types ============

/**
 * Time filter for "Last week's notes" entry point
 */
export interface TimeFilter {
  range: 'last_3_days' | 'last_week' | 'last_2_weeks' | 'last_month';
  dateType: 'created' | 'modified';
}

/**
 * All possible quiz entry points
 */
export type QuizEntryPoint =
  | { type: 'concept'; conceptId: string }
  | { type: 'all_concepts' }
  | { type: 'due_for_review' }
  | { type: 'time_filter'; filter: TimeFilter }
  | { type: 'specific_notes'; noteIds: string[] }
  | { type: 'search'; query: string };

/**
 * Quiz session created from an entry point
 */
export interface QuizSession {
  /** Unique session ID */
  id: string;
  /** Entry point that created this session */
  sourceEntry: QuizEntryPoint;
  /** Questions for this session */
  questions: Question[];
  /** When session was created */
  createdAt: number;
}

/**
 * Generate session ID
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
