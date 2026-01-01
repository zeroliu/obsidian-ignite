import { QAService } from '@/domain/goal/QAService';
import type { Answer, Goal, QASession, Question } from '@/domain/goal/types';
import type { ILLMProvider, IVaultProvider } from '@/ports';
import { useCallback, useState } from 'react';

/**
 * State for a Q&A session.
 */
export interface QASessionState {
  session: QASession | null;
  currentQuestionIndex: number;
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
}

/**
 * Hook for managing Q&A session state.
 */
export function useQASession(vaultProvider: IVaultProvider, llmProvider: ILLMProvider) {
  const [qaService] = useState(() => new QAService(vaultProvider, llmProvider));
  const [session, setSession] = useState<QASession | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteContents, setNoteContents] = useState<Array<{ path: string; content: string }>>([]);

  /**
   * Start a new Q&A session for a goal.
   */
  const startSession = useCallback(
    async (goal: Goal) => {
      setIsLoading(true);
      setError(null);
      setCurrentQuestionIndex(0);

      try {
        // Load note contents
        const contents: Array<{ path: string; content: string }> = [];
        for (const notePath of goal.notesPaths) {
          try {
            const exists = await vaultProvider.exists(notePath);
            if (exists) {
              const content = await vaultProvider.readFile(notePath);
              contents.push({ path: notePath, content });
            }
          } catch (err) {
            console.warn(`Failed to load note: ${notePath}`, err);
          }
        }
        setNoteContents(contents);

        if (contents.length === 0) {
          throw new Error('No notes found for this goal. Please assign notes first.');
        }

        const newSession = await qaService.createSession(goal, contents);
        setSession(newSession);
        return newSession;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start session';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [qaService, vaultProvider],
  );

  /**
   * Load an existing Q&A session.
   */
  const loadSession = useCallback(
    async (goalId: string, sessionId: string, goal: Goal) => {
      setIsLoading(true);
      setError(null);

      try {
        // Load note contents
        const contents: Array<{ path: string; content: string }> = [];
        for (const notePath of goal.notesPaths) {
          try {
            const exists = await vaultProvider.exists(notePath);
            if (exists) {
              const content = await vaultProvider.readFile(notePath);
              contents.push({ path: notePath, content });
            }
          } catch (err) {
            console.warn(`Failed to load note: ${notePath}`, err);
          }
        }
        setNoteContents(contents);

        const loadedSession = await qaService.getSessionById(goalId, sessionId);
        if (!loadedSession) {
          throw new Error('Session not found');
        }

        setSession(loadedSession);

        // Set current question index to first unanswered question
        const unansweredIndex = loadedSession.questions.findIndex(
          (q) => !loadedSession.answers.some((a) => a.questionId === q.id),
        );
        setCurrentQuestionIndex(
          unansweredIndex === -1 ? loadedSession.questions.length : unansweredIndex,
        );

        return loadedSession;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load session';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [qaService, vaultProvider],
  );

  /**
   * Submit an answer to the current question.
   */
  const submitAnswer = useCallback(
    async (userAnswer: number | string): Promise<Answer> => {
      if (!session) {
        throw new Error('No active session');
      }

      const question = session.questions[currentQuestionIndex];
      if (!question) {
        throw new Error('No current question');
      }

      setIsSubmitting(true);
      setError(null);

      try {
        const result = await qaService.submitAnswer(
          session.goalId,
          session.id,
          question.id,
          userAnswer,
          noteContents,
        );

        setSession(result.session);
        return result.answer;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to submit answer';
        setError(message);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [session, currentQuestionIndex, qaService, noteContents],
  );

  /**
   * Move to the next question.
   */
  const nextQuestion = useCallback(() => {
    if (!session) return;
    if (currentQuestionIndex < session.questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  }, [session, currentQuestionIndex]);

  /**
   * Move to the previous question.
   */
  const previousQuestion = useCallback(() => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
    }
  }, [currentQuestionIndex]);

  /**
   * Go to a specific question.
   */
  const goToQuestion = useCallback(
    (index: number) => {
      if (!session) return;
      if (index >= 0 && index < session.questions.length) {
        setCurrentQuestionIndex(index);
      }
    },
    [session],
  );

  /**
   * Get the current question.
   */
  const getCurrentQuestion = useCallback((): Question | null => {
    if (!session || currentQuestionIndex >= session.questions.length) {
      return null;
    }
    return session.questions[currentQuestionIndex];
  }, [session, currentQuestionIndex]);

  /**
   * Get the answer for a question.
   */
  const getAnswerForQuestion = useCallback(
    (questionId: string): Answer | null => {
      if (!session) return null;
      return session.answers.find((a) => a.questionId === questionId) ?? null;
    },
    [session],
  );

  /**
   * Check if the session is complete.
   */
  const isSessionComplete = useCallback((): boolean => {
    if (!session) return false;
    return session.answers.length === session.questions.length;
  }, [session]);

  /**
   * Reset the session state.
   */
  const resetSession = useCallback(() => {
    setSession(null);
    setCurrentQuestionIndex(0);
    setError(null);
    setNoteContents([]);
  }, []);

  return {
    session,
    currentQuestionIndex,
    isLoading,
    isSubmitting,
    error,
    startSession,
    loadSession,
    submitAnswer,
    nextQuestion,
    previousQuestion,
    goToQuestion,
    getCurrentQuestion,
    getAnswerForQuestion,
    isSessionComplete,
    resetSession,
  };
}
