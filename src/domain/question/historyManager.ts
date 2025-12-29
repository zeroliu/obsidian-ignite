/**
 * Question History Manager Module
 *
 * Manages question-level history for tracking user interactions with questions.
 * Provides derived stats for note scoring and history summaries for LLM context.
 */

import { hashString } from '@/domain/embedding/prepareText';
import type { IStorageAdapter } from '@/ports/IStorageAdapter';
import type {
  DerivedNoteStats,
  NoteQuestionHistory,
  QuestionHistorySummary,
  QuestionInteraction,
} from './types';
import { QUESTION_HISTORY_VERSION } from './types';

const HISTORY_KEY_PREFIX = 'history/questions';

/**
 * Get storage key for note question history
 */
export function getQuestionHistoryKey(noteId: string): string {
  const normalized = noteId.toLowerCase().replace(/\\/g, '/');
  return `${HISTORY_KEY_PREFIX}/${hashString(normalized).slice(0, 8)}`;
}

/**
 * Manages question-level history for spaced repetition
 */
export class QuestionHistoryManager {
  constructor(private storage: IStorageAdapter) {}

  /**
   * Get history for a note
   */
  async getNoteHistory(noteId: string): Promise<NoteQuestionHistory | null> {
    const key = getQuestionHistoryKey(noteId);
    const history = await this.storage.read<NoteQuestionHistory>(key);

    if (!history || history.version !== QUESTION_HISTORY_VERSION) {
      return null;
    }

    return history;
  }

  /**
   * Record an interaction with a question
   */
  async recordInteraction(
    noteId: string,
    questionId: string,
    questionText: string,
    correct: boolean | null,
    userAnswer?: string,
  ): Promise<void> {
    let history = await this.getNoteHistory(noteId);

    if (!history) {
      history = this.createEmptyHistory(noteId);
    }

    const existing = history.questions[questionId];
    const interaction: QuestionInteraction = {
      timestamp: Date.now(),
      correct,
      userAnswer,
    };

    if (existing) {
      existing.interactions.push(interaction);
      existing.lastInteraction = interaction.timestamp;

      if (correct === true) {
        existing.correctCount++;
        existing.correctStreak++;
      } else if (correct === false) {
        existing.incorrectCount++;
        existing.correctStreak = 0;
      }
      // correct === null means skipped, don't update streak
    } else {
      history.questions[questionId] = {
        questionId,
        questionText,
        sourceNoteId: noteId,
        status: 'answered',
        interactions: [interaction],
        correctCount: correct === true ? 1 : 0,
        incorrectCount: correct === false ? 1 : 0,
        correctStreak: correct === true ? 1 : 0,
        firstSeen: Date.now(),
        lastInteraction: interaction.timestamp,
      };
    }

    history.lastUpdated = Date.now();
    await this.saveHistory(noteId, history);
  }

  /**
   * Mark a question as mastered
   */
  async markMastered(noteId: string, questionId: string): Promise<void> {
    const history = await this.getNoteHistory(noteId);
    if (!history) return;

    const entry = history.questions[questionId];
    if (entry) {
      entry.status = 'mastered';
      history.lastUpdated = Date.now();
      await this.saveHistory(noteId, history);
    }
  }

  /**
   * Mark a question as skipped
   */
  async markSkipped(noteId: string, questionId: string, questionText: string): Promise<void> {
    await this.recordInteraction(noteId, questionId, questionText, null);

    const history = await this.getNoteHistory(noteId);
    if (history) {
      const entry = history.questions[questionId];
      if (entry) {
        entry.status = 'skipped';
        await this.saveHistory(noteId, history);
      }
    }
  }

  /**
   * Build a summary for LLM context from multiple notes
   */
  async buildHistorySummaryForNotes(noteIds: string[]): Promise<QuestionHistorySummary> {
    const summary: QuestionHistorySummary = {
      masteredQuestions: [],
      wellKnownQuestions: [],
      strugglingQuestions: [],
      recentlyShownQuestions: [],
    };

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const wellKnownThreshold = 3;
    const strugglingThreshold = 0.5;

    for (const noteId of noteIds) {
      const history = await this.getNoteHistory(noteId);
      if (!history) continue;

      for (const entry of Object.values(history.questions)) {
        // Mastered questions
        if (entry.status === 'mastered') {
          summary.masteredQuestions.push(entry.questionText);
          continue;
        }

        // Recently shown (within 24 hours)
        if (entry.lastInteraction && entry.lastInteraction > oneDayAgo) {
          summary.recentlyShownQuestions.push(entry.questionText);
        }

        // Calculate accuracy
        const totalAttempts = entry.correctCount + entry.incorrectCount;
        if (totalAttempts > 0) {
          const accuracy = entry.correctCount / totalAttempts;

          if (accuracy < strugglingThreshold && totalAttempts >= 2) {
            summary.strugglingQuestions.push(entry.questionText);
          } else if (entry.correctCount >= wellKnownThreshold) {
            summary.wellKnownQuestions.push(entry.questionText);
          }
        }
      }
    }

    return summary;
  }

  /**
   * Generate a fingerprint for cache invalidation
   * Only includes mastered + struggling as these affect question generation
   */
  generateFingerprint(summary: QuestionHistorySummary): string {
    const relevantState = [
      ...summary.masteredQuestions.sort(),
      '|',
      ...summary.strugglingQuestions.sort(),
    ].join(',');
    return hashString(relevantState);
  }

  /**
   * Derive note-level stats from question history
   */
  async deriveNoteStats(noteId: string): Promise<DerivedNoteStats> {
    const history = await this.getNoteHistory(noteId);

    if (!history || Object.keys(history.questions).length === 0) {
      return {
        lastQuizzed: null,
        quizCount: 0,
        correctCount: 0,
        correctStreak: 0,
      };
    }

    const allInteractions = Object.values(history.questions)
      .flatMap((q) => q.interactions)
      .filter((i) => i.correct !== null); // Only count actual attempts

    if (allInteractions.length === 0) {
      return {
        lastQuizzed: null,
        quizCount: 0,
        correctCount: 0,
        correctStreak: 0,
      };
    }

    // Calculate aggregate stats
    const sortedByTime = allInteractions.sort((a, b) => b.timestamp - a.timestamp);
    const lastQuizzed = sortedByTime[0].timestamp;
    const quizCount = allInteractions.length;
    const correctCount = allInteractions.filter((i) => i.correct === true).length;

    // Calculate streak from most recent consecutive correct answers
    let correctStreak = 0;
    for (const interaction of sortedByTime) {
      if (interaction.correct === true) {
        correctStreak++;
      } else {
        break;
      }
    }

    return { lastQuizzed, quizCount, correctCount, correctStreak };
  }

  private createEmptyHistory(noteId: string): NoteQuestionHistory {
    return {
      version: QUESTION_HISTORY_VERSION,
      noteId,
      questions: {},
      lastUpdated: Date.now(),
    };
  }

  private async saveHistory(noteId: string, history: NoteQuestionHistory): Promise<void> {
    const key = getQuestionHistoryKey(noteId);
    await this.storage.write(key, history);
  }
}
