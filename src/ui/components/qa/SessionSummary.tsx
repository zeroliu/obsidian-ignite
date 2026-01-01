import type { Answer, QASession, Question } from '@/domain/goal/types';
import { Button } from '@/ui/components/shared/Button';
import { Card } from '@/ui/components/shared/Card';
import { ProgressBar } from '@/ui/components/shared/ProgressBar';

/**
 * SessionSummary component props.
 */
export interface SessionSummaryProps {
  session: QASession;
  onFinish: () => void;
  onReview: () => void;
}

/**
 * Component for displaying Q&A session results.
 */
export function SessionSummary({ session, onFinish, onReview }: SessionSummaryProps) {
  const totalQuestions = session.questions.length;
  const correctAnswers = session.answers.filter((a) => a.isCorrect).length;
  const incorrectAnswers = totalQuestions - correctAnswers;

  const getScoreMessage = () => {
    const score = session.score;
    if (score >= 90) return 'Excellent work!';
    if (score >= 70) return 'Great job!';
    if (score >= 50) return 'Good effort!';
    return 'Keep practicing!';
  };

  const getScoreClass = () => {
    const score = session.score;
    if (score >= 90) return 'ignite-score-excellent';
    if (score >= 70) return 'ignite-score-great';
    if (score >= 50) return 'ignite-score-good';
    return 'ignite-score-needs-work';
  };

  return (
    <div className="ignite-session-summary">
      <Card className="ignite-session-summary-card">
        <h2 className="ignite-session-summary-title">Session Complete!</h2>

        <div className={`ignite-session-summary-score ${getScoreClass()}`}>
          <span className="ignite-session-summary-score-value">{session.score}%</span>
          <span className="ignite-session-summary-score-message">{getScoreMessage()}</span>
        </div>

        <ProgressBar
          value={correctAnswers}
          max={totalQuestions}
          label="Correct Answers"
          showPercentage={false}
        />

        <div className="ignite-session-summary-stats">
          <div className="ignite-session-summary-stat">
            <span className="ignite-session-summary-stat-value ignite-stat-correct">
              {correctAnswers}
            </span>
            <span className="ignite-session-summary-stat-label">Correct</span>
          </div>
          <div className="ignite-session-summary-stat">
            <span className="ignite-session-summary-stat-value ignite-stat-incorrect">
              {incorrectAnswers}
            </span>
            <span className="ignite-session-summary-stat-label">Incorrect</span>
          </div>
          <div className="ignite-session-summary-stat">
            <span className="ignite-session-summary-stat-value">{totalQuestions}</span>
            <span className="ignite-session-summary-stat-label">Total</span>
          </div>
        </div>

        <div className="ignite-session-summary-questions">
          <h3 className="ignite-session-summary-section-title">Question Review</h3>
          {session.questions.map((question: Question, index: number) => {
            const answer = session.answers.find((a: Answer) => a.questionId === question.id);
            return (
              <div
                key={question.id}
                className={`ignite-session-summary-question ${answer?.isCorrect ? 'ignite-question-correct' : 'ignite-question-incorrect'}`}
              >
                <div className="ignite-session-summary-question-header">
                  <span className="ignite-session-summary-question-number">Q{index + 1}</span>
                  <span
                    className={`ignite-session-summary-question-status ${answer?.isCorrect ? 'ignite-status-correct' : 'ignite-status-incorrect'}`}
                  >
                    {answer?.isCorrect ? 'Correct' : 'Incorrect'}
                  </span>
                </div>
                <p className="ignite-session-summary-question-text">{question.text}</p>
                {answer && (
                  <p className="ignite-session-summary-question-feedback">{answer.explanation}</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="ignite-session-summary-actions">
          <Button variant="secondary" onClick={onReview}>
            Review Questions
          </Button>
          <Button variant="primary" onClick={onFinish}>
            Finish
          </Button>
        </div>
      </Card>
    </div>
  );
}
