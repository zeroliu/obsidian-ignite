import type { Answer, Goal } from '@/domain/goal/types';
import { isMultipleChoiceQuestion } from '@/domain/goal/types';
import { useRouter } from '@/ui/Router';
import { AnswerOption, OpenEndedInput, QuestionCard, SessionSummary } from '@/ui/components/qa';
import { Button } from '@/ui/components/shared/Button';
import { Card } from '@/ui/components/shared/Card';
import { LoadingSpinner } from '@/ui/components/shared/LoadingSpinner';
import { useApp } from '@/ui/contexts/AppContext';
import { useGoals } from '@/ui/contexts/GoalContext';
import { useLLM } from '@/ui/contexts/LLMContext';
import { useQASession } from '@/ui/hooks/useQASession';
import { useCallback, useEffect, useState } from 'react';

/**
 * QAScreen component props.
 */
export interface QAScreenProps {
  goalId: string;
}

/**
 * Screen for Q&A sessions.
 */
export function QAScreen({ goalId }: QAScreenProps) {
  const { vaultProvider } = useApp();
  const { llmProvider } = useLLM();
  const { goals } = useGoals();
  const { goBack } = useRouter();

  const {
    session,
    currentQuestionIndex,
    isLoading,
    isSubmitting,
    error,
    startSession,
    submitAnswer,
    nextQuestion,
    previousQuestion,
    goToQuestion,
    getCurrentQuestion,
    getAnswerForQuestion,
    isSessionComplete,
    resetSession,
  } = useQASession(vaultProvider, llmProvider);

  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<Answer | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const goal = goals.find((g: Goal) => g.id === goalId);

  // Start session on mount
  useEffect(() => {
    if (goal && !session && !isLoading) {
      startSession(goal).catch(console.error);
    }
  }, [goal, session, isLoading, startSession]);

  const currentQuestion = getCurrentQuestion();

  // Reset state when question changes
  useEffect(() => {
    setSelectedOption(null);
    setShowFeedback(false);
    setLastAnswer(null);

    // Check if this question was already answered
    if (currentQuestion) {
      const existingAnswer = getAnswerForQuestion(currentQuestion.id);
      if (existingAnswer) {
        setLastAnswer(existingAnswer);
        setShowFeedback(true);
        if (existingAnswer.type === 'multiple-choice') {
          setSelectedOption(existingAnswer.userAnswer);
        }
      }
    }
  }, [currentQuestion, getAnswerForQuestion]);

  const handleSelectOption = useCallback((index: number) => {
    setSelectedOption(index);
  }, []);

  const handleSubmitMultipleChoice = useCallback(async () => {
    if (selectedOption === null) return;

    try {
      const answer = await submitAnswer(selectedOption);
      setLastAnswer(answer);
      setShowFeedback(true);
    } catch (err) {
      console.error('Failed to submit answer:', err);
    }
  }, [selectedOption, submitAnswer]);

  const handleSubmitOpenEnded = useCallback(
    async (answer: string) => {
      try {
        const result = await submitAnswer(answer);
        setLastAnswer(result);
        setShowFeedback(true);
      } catch (err) {
        console.error('Failed to submit answer:', err);
      }
    },
    [submitAnswer],
  );

  const handleNext = useCallback(() => {
    if (isSessionComplete()) {
      setShowSummary(true);
    } else {
      nextQuestion();
    }
  }, [isSessionComplete, nextQuestion]);

  const handleReviewQuestions = useCallback(() => {
    setShowSummary(false);
    goToQuestion(0);
  }, [goToQuestion]);

  const handleFinish = useCallback(() => {
    resetSession();
    goBack();
  }, [resetSession, goBack]);

  if (!goal) {
    return (
      <div className="ignite-screen ignite-qa-screen">
        <div className="ignite-screen-header">
          <h1 className="ignite-screen-title">Q&A Session</h1>
          <Button variant="secondary" onClick={goBack}>
            Back
          </Button>
        </div>
        <div className="ignite-screen-content">
          <div className="ignite-empty-state">
            <h3 className="ignite-empty-state-title">Goal Not Found</h3>
            <p className="ignite-empty-state-description">
              The goal you are looking for does not exist.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="ignite-screen ignite-qa-screen">
        <div className="ignite-screen-header">
          <h1 className="ignite-screen-title">Q&A Session</h1>
          <Button variant="secondary" onClick={goBack}>
            Back
          </Button>
        </div>
        <div className="ignite-screen-content">
          <div className="ignite-loading-container">
            <LoadingSpinner size="lg" />
            <p className="ignite-loading-text">Generating questions from your notes...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ignite-screen ignite-qa-screen">
        <div className="ignite-screen-header">
          <h1 className="ignite-screen-title">Q&A Session</h1>
          <Button variant="secondary" onClick={goBack}>
            Back
          </Button>
        </div>
        <div className="ignite-screen-content">
          <div className="ignite-empty-state">
            <h3 className="ignite-empty-state-title">Error</h3>
            <p className="ignite-empty-state-description">{error}</p>
            <Button variant="primary" onClick={goBack}>
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (showSummary && session) {
    return (
      <div className="ignite-screen ignite-qa-screen">
        <div className="ignite-screen-header">
          <h1 className="ignite-screen-title">Session Results</h1>
        </div>
        <div className="ignite-screen-content">
          <SessionSummary
            session={session}
            onFinish={handleFinish}
            onReview={handleReviewQuestions}
          />
        </div>
      </div>
    );
  }

  if (!session || !currentQuestion) {
    return (
      <div className="ignite-screen ignite-qa-screen">
        <div className="ignite-screen-header">
          <h1 className="ignite-screen-title">Q&A Session</h1>
          <Button variant="secondary" onClick={goBack}>
            Back
          </Button>
        </div>
        <div className="ignite-screen-content">
          <div className="ignite-empty-state">
            <h3 className="ignite-empty-state-title">No Questions</h3>
            <p className="ignite-empty-state-description">
              Unable to generate questions. Make sure your goal has assigned notes.
            </p>
            <Button variant="primary" onClick={goBack}>
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ignite-screen ignite-qa-screen">
      <div className="ignite-screen-header">
        <div className="ignite-qa-header-content">
          <h1 className="ignite-screen-title">Q&A Session</h1>
          <span className="ignite-qa-goal-name">{goal.name}</span>
        </div>
        <Button variant="secondary" onClick={goBack}>
          Exit
        </Button>
      </div>

      <div className="ignite-screen-content">
        <div className="ignite-qa-content">
          <QuestionCard
            question={currentQuestion}
            questionNumber={currentQuestionIndex + 1}
            totalQuestions={session.questions.length}
          />

          {isMultipleChoiceQuestion(currentQuestion) ? (
            <div className="ignite-qa-options">
              {currentQuestion.options.map((option, index) => {
                const isAnswered = lastAnswer?.type === 'multiple-choice';
                const isCorrect = isAnswered && index === currentQuestion.correctAnswer;
                const isIncorrect =
                  isAnswered &&
                  index === (lastAnswer as Answer & { type: 'multiple-choice' }).userAnswer &&
                  !isCorrect;
                const optionKey = `${currentQuestion.id}-option-${index}`;

                return (
                  <AnswerOption
                    key={optionKey}
                    option={option}
                    index={index}
                    isSelected={selectedOption === index}
                    isCorrect={isCorrect}
                    isIncorrect={isIncorrect}
                    disabled={showFeedback}
                    onSelect={handleSelectOption}
                  />
                );
              })}

              {!showFeedback && (
                <Button
                  variant="primary"
                  onClick={handleSubmitMultipleChoice}
                  disabled={selectedOption === null || isSubmitting}
                  fullWidth
                >
                  {isSubmitting ? 'Checking...' : 'Submit Answer'}
                </Button>
              )}
            </div>
          ) : (
            <div className="ignite-qa-open-ended">
              {!showFeedback ? (
                <OpenEndedInput
                  onSubmit={handleSubmitOpenEnded}
                  disabled={isSubmitting}
                  placeholder="Type your answer here..."
                />
              ) : lastAnswer?.type === 'open-ended' ? (
                <Card className="ignite-qa-user-answer">
                  <h4 className="ignite-qa-user-answer-title">Your Answer:</h4>
                  <p className="ignite-qa-user-answer-text">{lastAnswer.userAnswer}</p>
                </Card>
              ) : null}
            </div>
          )}

          {showFeedback && lastAnswer && (
            <Card
              className={`ignite-qa-feedback ${lastAnswer.isCorrect ? 'ignite-qa-feedback-correct' : 'ignite-qa-feedback-incorrect'}`}
            >
              <div className="ignite-qa-feedback-header">
                <span
                  className={`ignite-qa-feedback-status ${lastAnswer.isCorrect ? 'ignite-status-correct' : 'ignite-status-incorrect'}`}
                >
                  {lastAnswer.isCorrect ? 'Correct!' : 'Incorrect'}
                </span>
              </div>
              <p className="ignite-qa-feedback-explanation">{lastAnswer.explanation}</p>
            </Card>
          )}

          <div className="ignite-qa-navigation">
            <Button
              variant="secondary"
              onClick={previousQuestion}
              disabled={currentQuestionIndex === 0}
            >
              Previous
            </Button>
            {showFeedback && (
              <Button variant="primary" onClick={handleNext}>
                {isSessionComplete() ? 'View Results' : 'Next Question'}
              </Button>
            )}
          </div>

          <div className="ignite-qa-progress">
            {session.questions.map((q, index) => {
              const answer = getAnswerForQuestion(q.id);
              const isCurrent = index === currentQuestionIndex;
              const isAnswered = !!answer;
              const isCorrectAnswer = answer?.isCorrect ?? false;

              return (
                <button
                  key={q.id}
                  type="button"
                  className={`ignite-qa-progress-dot ${isCurrent ? 'ignite-qa-progress-dot-current' : ''} ${isAnswered ? (isCorrectAnswer ? 'ignite-qa-progress-dot-correct' : 'ignite-qa-progress-dot-incorrect') : ''}`}
                  onClick={() => goToQuestion(index)}
                  aria-label={`Go to question ${index + 1}`}
                  title={`Question ${index + 1}`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
