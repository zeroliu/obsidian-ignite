/**
 * Note Selection Module
 *
 * Handles scoring and selecting notes for question generation.
 * Uses a multi-factor scoring system with stratified sampling.
 */

import type { DerivedNoteStats, NoteScore, NoteSelectionInput } from './types';

// ============ Scoring Weights ============

const WEIGHTS = {
  spacedRep: 0.35,
  richness: 0.2,
  recency: 0.15,
  variety: 0.15,
  struggle: 0.15,
};

// ============ Spaced Repetition Intervals ============

/**
 * Spaced repetition intervals (days)
 * Based on SM-2 algorithm
 */
const SPACED_REP_INTERVALS = [1, 3, 7, 14, 30, 60, 120];

// ============ Note Quizzability Check ============

/**
 * Check if a note should be quizzed based on derived history stats
 *
 * NOTE: Content filtering (tags, word count) is NOT done here.
 * Concepts are pre-vetted by the LLM naming stage (quizzabilityScore >= 0.4).
 * When a concept is passed to question generation, all its notes are trusted.
 *
 * Rules:
 * 1. Not mastered (correctStreak > 5 && daysSinceQuiz < 14)
 * 2. Not quizzed too recently (daysSinceQuiz >= 1)
 */
export function shouldQuizNote(stats: DerivedNoteStats): boolean {
  // History-based checks (skip for never-quizzed notes)
  if (stats.lastQuizzed !== null) {
    const daysSinceQuiz = (Date.now() - stats.lastQuizzed) / (1000 * 60 * 60 * 24);

    // Mastered: high streak + recently quizzed
    if (stats.correctStreak > 5 && daysSinceQuiz < 14) return false;

    // Too recent
    if (daysSinceQuiz < 1) return false;
  }

  return true;
}

// ============ Scoring Functions ============

/**
 * Calculate spaced repetition score (35% weight)
 *
 * Never quizzed = 1.0 (highest priority)
 * Very overdue (>30 days past due) = 0.95
 * Moderately overdue (>7 days) = 0.85
 * Slightly overdue (>0 days) = 0.70
 * Coming due soon (<3 days) = 0.50
 * Not due yet = 0.20
 */
export function calculateSpacedRepScore(stats: DerivedNoteStats): number {
  if (stats.lastQuizzed === null) return 1.0;

  const daysSinceQuiz = (Date.now() - stats.lastQuizzed) / (1000 * 60 * 60 * 24);
  const targetInterval = SPACED_REP_INTERVALS[Math.min(stats.correctStreak, 6)];
  const daysSinceDue = daysSinceQuiz - targetInterval;

  if (daysSinceDue > 30) return 0.95;
  if (daysSinceDue > 7) return 0.85;
  if (daysSinceDue > 0) return 0.7;
  if (daysSinceDue > -3) return 0.5;
  return 0.2;
}

/**
 * Calculate richness score (20% weight)
 * Notes with more structure are more quizzable
 */
export function calculateRichnessScore(headingCount: number, wordCount: number): number {
  const headingScore = Math.min(1, headingCount * 0.15);
  const lengthScore = Math.min(1, wordCount / 1000);
  return headingScore * 0.6 + lengthScore * 0.4;
}

/**
 * Calculate recency score (15% weight)
 * Recently modified notes are more relevant
 */
export function calculateRecencyScore(modifiedAt: number, now: number = Date.now()): number {
  const daysSince = (now - modifiedAt) / (1000 * 60 * 60 * 24);
  if (daysSince < 7) return 1.0;
  if (daysSince < 30) return 0.7;
  if (daysSince < 90) return 0.5;
  return 0.1;
}

/**
 * Calculate variety score (15% weight)
 * Avoid over-quizzing the same notes
 *
 * Note: Since we now derive stats from question history, we use quizCount
 * as a proxy for variety (how often the note has been quizzed overall)
 */
export function calculateVarietyScore(stats: DerivedNoteStats): number {
  if (stats.quizCount === 0) return 1.0;
  if (stats.quizCount <= 2) return 0.9;
  if (stats.quizCount <= 5) return 0.7;
  if (stats.quizCount <= 10) return 0.5;
  return 0.2;
}

/**
 * Calculate struggle score (15% weight)
 * Prioritize notes the user struggles with
 */
export function calculateStruggleScore(stats: DerivedNoteStats): number {
  if (stats.quizCount === 0) return 0.5; // Neutral for never-quizzed

  const accuracy = stats.correctCount / stats.quizCount;
  if (accuracy < 0.3) return 1.0; // Struggling
  if (accuracy < 0.5) return 0.8;
  if (accuracy < 0.7) return 0.5;
  return 0.1; // Mastered
}

// ============ Cold-Start Scoring ============

/**
 * Options for cold-start scoring
 */
export interface ColdStartOptions {
  /** Current time for recency calculation */
  now?: number;
  /** Random jitter value (0-1). Pass explicit value for deterministic tests. */
  jitter?: number;
}

/**
 * Calculate score for never-quizzed notes
 * Uses content-based signals instead of history
 *
 * @param note - Note metadata for scoring
 * @param options - Optional configuration for deterministic testing
 */
export function calculateColdStartScore(
  note: NoteSelectionInput,
  options: ColdStartOptions = {},
): number {
  const now = options.now ?? Date.now();
  const jitter = options.jitter ?? Math.random();

  const structureScore = Math.min(1, note.headingCount * 0.15);
  const linkPopularity = Math.min(1, note.incomingLinkCount / 10);
  const recency = calculateRecencyScore(note.modifiedAt, now);
  const jitterScore = jitter * 0.2; // Scale jitter to 0-0.2 range

  return 0.25 * structureScore + 0.25 * linkPopularity + 0.3 * recency + 0.2 * jitterScore;
}

// ============ Main Scoring Function ============

/**
 * Options for scoring notes
 */
export interface ScoringOptions {
  /** Current time for recency calculation */
  now?: number;
  /** Random jitter value (0-1) for cold-start. Pass explicit value for deterministic tests. */
  jitter?: number;
}

/**
 * Score a single note based on all factors
 *
 * @param note - Note metadata for scoring
 * @param stats - Derived quiz history stats
 * @param options - Optional configuration for deterministic testing
 */
export function scoreNote(
  note: NoteSelectionInput,
  stats: DerivedNoteStats,
  options: ScoringOptions = {},
): NoteScore {
  const isNeverQuizzed = stats.quizCount === 0;
  const now = options.now ?? Date.now();

  const factors = {
    spacedRepScore: calculateSpacedRepScore(stats),
    richnessScore: calculateRichnessScore(note.headingCount, note.wordCount),
    recencyScore: calculateRecencyScore(note.modifiedAt, now),
    varietyScore: calculateVarietyScore(stats),
    struggleScore: calculateStruggleScore(stats),
  };

  // Use cold-start scoring for never-quizzed notes
  const totalScore = isNeverQuizzed
    ? calculateColdStartScore(note, { now: options.now, jitter: options.jitter })
    : WEIGHTS.spacedRep * factors.spacedRepScore +
      WEIGHTS.richness * factors.richnessScore +
      WEIGHTS.recency * factors.recencyScore +
      WEIGHTS.variety * factors.varietyScore +
      WEIGHTS.struggle * factors.struggleScore;

  return { noteId: note.noteId, totalScore, factors, isNeverQuizzed };
}

// ============ Stratified Sampling ============

/**
 * Weighted random sample from array
 */
function weightedSample<T extends { totalScore: number }>(items: T[], count: number): T[] {
  if (items.length <= count) return items;

  const result: T[] = [];
  const remaining = [...items];

  for (let i = 0; i < count && remaining.length > 0; i++) {
    const totalWeight = remaining.reduce((sum, item) => sum + item.totalScore, 0);
    let random = Math.random() * totalWeight;

    for (let j = 0; j < remaining.length; j++) {
      random -= remaining[j].totalScore;
      if (random <= 0) {
        result.push(remaining[j]);
        remaining.splice(j, 1);
        break;
      }
    }
  }

  return result;
}

/**
 * Select notes using stratified sampling
 *
 * Distribution:
 * - 40% from top 20% (high priority)
 * - 35% from middle 40% (medium priority)
 * - 25% from never-quizzed (fresh notes)
 */
export function selectNotes(scoredNotes: NoteScore[], targetCount = 15): string[] {
  // Sort by score descending
  const sorted = [...scoredNotes].sort((a, b) => b.totalScore - a.totalScore);

  const topCount = Math.ceil(targetCount * 0.4);
  const midCount = Math.ceil(targetCount * 0.35);
  const freshCount = Math.ceil(targetCount * 0.25);

  // Top 20% of scored notes
  const topPool = sorted.slice(0, Math.ceil(sorted.length * 0.2));
  const topSelected = weightedSample(topPool, topCount);

  // Middle 40% (20% to 60%)
  const midPool = sorted.slice(Math.ceil(sorted.length * 0.2), Math.ceil(sorted.length * 0.6));
  const midSelected = weightedSample(midPool, midCount);

  // Never-quizzed notes
  const freshPool = sorted.filter((n) => n.isNeverQuizzed);
  const freshSelected = weightedSample(freshPool, freshCount);

  // Combine and dedupe
  const allSelected = [...topSelected, ...midSelected, ...freshSelected];
  const uniqueIds = [...new Set(allSelected.map((n) => n.noteId))];

  return uniqueIds.slice(0, targetCount);
}
