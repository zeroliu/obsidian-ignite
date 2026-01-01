import type { Question } from '@/domain/goal/types';
import { Card } from '@/ui/components/shared/Card';

/**
 * QuestionCard component props.
 */
export interface QuestionCardProps {
  question: Question;
  questionNumber: number;
  totalQuestions: number;
}

/**
 * Card component for displaying a question.
 */
export function QuestionCard({ question, questionNumber, totalQuestions }: QuestionCardProps) {
  return (
    <Card className="ignite-question-card">
      <div className="ignite-question-header">
        <span className="ignite-question-number">
          Question {questionNumber} of {totalQuestions}
        </span>
        <span className="ignite-question-type">
          {question.type === 'multiple-choice' ? 'Multiple Choice' : 'Open Ended'}
        </span>
      </div>
      <h3 className="ignite-question-text">{question.text}</h3>
      <div className="ignite-question-source">
        From: <span className="ignite-question-source-path">{question.sourceNotePath}</span>
      </div>
    </Card>
  );
}
