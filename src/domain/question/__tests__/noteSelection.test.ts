import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateColdStartScore,
  calculateRecencyScore,
  calculateRichnessScore,
  calculateSpacedRepScore,
  calculateStruggleScore,
  calculateVarietyScore,
  scoreNote,
  selectNotes,
  shouldQuizNote,
} from '../noteSelection';
import type { DerivedNoteStats, NoteSelectionInput } from '../types';
import { EMPTY_DERIVED_STATS } from '../types';

describe('shouldQuizNote', () => {
  it('returns true for never-quizzed notes', () => {
    expect(shouldQuizNote(EMPTY_DERIVED_STATS)).toBe(true);
  });

  it('returns false for mastered notes (high streak + recently quizzed)', () => {
    const stats: DerivedNoteStats = {
      lastQuizzed: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
      quizCount: 10,
      correctCount: 10,
      correctStreak: 6, // > 5
    };
    expect(shouldQuizNote(stats)).toBe(false);
  });

  it('returns true for mastered notes that are due (daysSinceQuiz >= 14)', () => {
    const stats: DerivedNoteStats = {
      lastQuizzed: Date.now() - 15 * 24 * 60 * 60 * 1000, // 15 days ago
      quizCount: 10,
      correctCount: 10,
      correctStreak: 6,
    };
    expect(shouldQuizNote(stats)).toBe(true);
  });

  it('returns false for notes quizzed too recently', () => {
    const stats: DerivedNoteStats = {
      lastQuizzed: Date.now() - 12 * 60 * 60 * 1000, // 12 hours ago
      quizCount: 1,
      correctCount: 1,
      correctStreak: 1,
    };
    expect(shouldQuizNote(stats)).toBe(false);
  });

  it('returns true for notes quizzed more than a day ago', () => {
    const stats: DerivedNoteStats = {
      lastQuizzed: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
      quizCount: 1,
      correctCount: 1,
      correctStreak: 1,
    };
    expect(shouldQuizNote(stats)).toBe(true);
  });
});

describe('calculateSpacedRepScore', () => {
  it('returns 1.0 for never-quizzed notes', () => {
    expect(calculateSpacedRepScore(EMPTY_DERIVED_STATS)).toBe(1.0);
  });

  it('returns high score for very overdue notes (>30 days past due)', () => {
    const stats: DerivedNoteStats = {
      lastQuizzed: Date.now() - 40 * 24 * 60 * 60 * 1000, // 40 days ago
      quizCount: 1,
      correctCount: 0,
      correctStreak: 0, // Interval = 1 day, so 39 days past due
    };
    expect(calculateSpacedRepScore(stats)).toBe(0.95);
  });

  it('returns moderate score for moderately overdue notes (>7 days)', () => {
    const stats: DerivedNoteStats = {
      lastQuizzed: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
      quizCount: 1,
      correctCount: 0,
      correctStreak: 0, // Interval = 1 day, so 9 days past due
    };
    expect(calculateSpacedRepScore(stats)).toBe(0.85);
  });

  it('returns lower score for notes coming due soon', () => {
    const stats: DerivedNoteStats = {
      lastQuizzed: Date.now() - 5 * 24 * 60 * 60 * 1000, // 5 days ago
      quizCount: 3,
      correctCount: 3,
      correctStreak: 3, // Interval = 14 days, so 9 days until due
    };
    expect(calculateSpacedRepScore(stats)).toBe(0.2); // Not due yet
  });
});

describe('calculateRichnessScore', () => {
  it('returns 0 for empty notes', () => {
    expect(calculateRichnessScore(0, 0)).toBe(0);
  });

  it('returns higher score for notes with more headings', () => {
    const lowHeadingScore = calculateRichnessScore(1, 500);
    const highHeadingScore = calculateRichnessScore(5, 500);
    expect(highHeadingScore).toBeGreaterThan(lowHeadingScore);
  });

  it('returns higher score for longer notes', () => {
    const shortNote = calculateRichnessScore(2, 100);
    const longNote = calculateRichnessScore(2, 800);
    expect(longNote).toBeGreaterThan(shortNote);
  });

  it('caps scores at 1.0', () => {
    expect(calculateRichnessScore(10, 2000)).toBeLessThanOrEqual(1.0);
  });
});

describe('calculateRecencyScore', () => {
  const now = Date.now();

  it('returns 1.0 for notes modified within last week', () => {
    expect(calculateRecencyScore(now - 3 * 24 * 60 * 60 * 1000, now)).toBe(1.0);
  });

  it('returns 0.7 for notes modified within last month', () => {
    expect(calculateRecencyScore(now - 15 * 24 * 60 * 60 * 1000, now)).toBe(0.7);
  });

  it('returns 0.5 for notes modified within last 3 months', () => {
    expect(calculateRecencyScore(now - 60 * 24 * 60 * 60 * 1000, now)).toBe(0.5);
  });

  it('returns 0.1 for old notes', () => {
    expect(calculateRecencyScore(now - 120 * 24 * 60 * 60 * 1000, now)).toBe(0.1);
  });
});

describe('calculateVarietyScore', () => {
  it('returns 1.0 for never-quizzed notes', () => {
    expect(calculateVarietyScore(EMPTY_DERIVED_STATS)).toBe(1.0);
  });

  it('returns decreasing scores for more frequently quizzed notes', () => {
    const score1 = calculateVarietyScore({ ...EMPTY_DERIVED_STATS, quizCount: 1 });
    const score5 = calculateVarietyScore({ ...EMPTY_DERIVED_STATS, quizCount: 5 });
    const score10 = calculateVarietyScore({ ...EMPTY_DERIVED_STATS, quizCount: 10 });
    const score20 = calculateVarietyScore({ ...EMPTY_DERIVED_STATS, quizCount: 20 });

    expect(score1).toBeGreaterThan(score5);
    expect(score5).toBeGreaterThan(score10);
    expect(score10).toBeGreaterThan(score20);
  });
});

describe('calculateStruggleScore', () => {
  it('returns 0.5 for never-quizzed notes', () => {
    expect(calculateStruggleScore(EMPTY_DERIVED_STATS)).toBe(0.5);
  });

  it('returns high score for notes with low accuracy', () => {
    const stats: DerivedNoteStats = {
      ...EMPTY_DERIVED_STATS,
      quizCount: 10,
      correctCount: 2, // 20% accuracy
    };
    expect(calculateStruggleScore(stats)).toBe(1.0);
  });

  it('returns low score for notes with high accuracy', () => {
    const stats: DerivedNoteStats = {
      ...EMPTY_DERIVED_STATS,
      quizCount: 10,
      correctCount: 9, // 90% accuracy
    };
    expect(calculateStruggleScore(stats)).toBe(0.1);
  });
});

describe('calculateColdStartScore', () => {
  let mockMathRandom: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Mock Math.random for deterministic tests
    mockMathRandom = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    mockMathRandom.mockRestore();
  });

  it('returns higher score for notes with more headings', () => {
    const lowHeading: NoteSelectionInput = {
      noteId: 'a.md',
      wordCount: 500,
      headingCount: 1,
      modifiedAt: Date.now(),
      incomingLinkCount: 0,
    };
    const highHeading: NoteSelectionInput = {
      noteId: 'b.md',
      wordCount: 500,
      headingCount: 5,
      modifiedAt: Date.now(),
      incomingLinkCount: 0,
    };

    expect(calculateColdStartScore(highHeading)).toBeGreaterThan(
      calculateColdStartScore(lowHeading),
    );
  });

  it('returns higher score for notes with more incoming links', () => {
    const lowLinks: NoteSelectionInput = {
      noteId: 'a.md',
      wordCount: 500,
      headingCount: 2,
      modifiedAt: Date.now(),
      incomingLinkCount: 1,
    };
    const highLinks: NoteSelectionInput = {
      noteId: 'b.md',
      wordCount: 500,
      headingCount: 2,
      modifiedAt: Date.now(),
      incomingLinkCount: 10,
    };

    expect(calculateColdStartScore(highLinks)).toBeGreaterThan(calculateColdStartScore(lowLinks));
  });
});

describe('scoreNote', () => {
  it('uses cold-start scoring for never-quizzed notes', () => {
    const note: NoteSelectionInput = {
      noteId: 'test.md',
      wordCount: 500,
      headingCount: 3,
      modifiedAt: Date.now(),
      incomingLinkCount: 5,
    };

    const score = scoreNote(note, EMPTY_DERIVED_STATS);
    expect(score.isNeverQuizzed).toBe(true);
  });

  it('uses weighted scoring for previously quizzed notes', () => {
    const note: NoteSelectionInput = {
      noteId: 'test.md',
      wordCount: 500,
      headingCount: 3,
      modifiedAt: Date.now(),
      incomingLinkCount: 5,
    };
    const stats: DerivedNoteStats = {
      lastQuizzed: Date.now() - 7 * 24 * 60 * 60 * 1000,
      quizCount: 5,
      correctCount: 3,
      correctStreak: 2,
    };

    const score = scoreNote(note, stats);
    expect(score.isNeverQuizzed).toBe(false);
    expect(score.factors.spacedRepScore).toBeGreaterThan(0);
  });
});

describe('selectNotes', () => {
  it('returns empty array for empty input', () => {
    expect(selectNotes([], 10)).toEqual([]);
  });

  it('returns all notes when count <= target', () => {
    const notes = [
      { noteId: 'a.md', totalScore: 0.8, factors: {} as never, isNeverQuizzed: false },
      { noteId: 'b.md', totalScore: 0.6, factors: {} as never, isNeverQuizzed: false },
    ];
    const result = selectNotes(notes, 5);
    expect(result.length).toBe(2);
    expect(result).toContain('a.md');
    expect(result).toContain('b.md');
  });

  it('includes never-quizzed notes in selection', () => {
    const notes = [
      { noteId: 'old1.md', totalScore: 0.9, factors: {} as never, isNeverQuizzed: false },
      { noteId: 'old2.md', totalScore: 0.8, factors: {} as never, isNeverQuizzed: false },
      { noteId: 'new.md', totalScore: 0.3, factors: {} as never, isNeverQuizzed: true },
    ];
    const result = selectNotes(notes, 3);
    expect(result).toContain('new.md');
  });

  it('deduplicates notes', () => {
    const notes = [
      { noteId: 'a.md', totalScore: 0.9, factors: {} as never, isNeverQuizzed: false },
      { noteId: 'a.md', totalScore: 0.9, factors: {} as never, isNeverQuizzed: true },
    ];
    const result = selectNotes(notes, 5);
    expect(result.length).toBe(1);
  });
});
