import type { QASession } from '@/domain/goal/types';
import { Card } from '@/ui/components/shared/Card';

/**
 * QASessionList component props.
 */
export interface QASessionListProps {
  sessions: QASession[];
  onSelect: (sessionId: string) => void;
}

/**
 * Component for displaying a list of past Q&A sessions.
 */
export function QASessionList({ sessions, onSelect }: QASessionListProps) {
  if (sessions.length === 0) {
    return (
      <p className="ignite-qa-session-list-empty">
        No Q&A sessions yet. Start a new session to test your knowledge.
      </p>
    );
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getScoreClass = (score: number): string => {
    if (score >= 90) return 'ignite-score-excellent';
    if (score >= 70) return 'ignite-score-great';
    if (score >= 50) return 'ignite-score-good';
    return 'ignite-score-needs-work';
  };

  return (
    <div className="ignite-qa-session-list">
      {sessions.map((session) => (
        <Card
          key={session.id}
          className="ignite-qa-session-item"
          interactive
          onClick={() => onSelect(session.id)}
        >
          <div className="ignite-qa-session-item-content">
            <div className="ignite-qa-session-item-header">
              <span className="ignite-qa-session-item-date">{formatDate(session.createdAt)}</span>
              <span className={`ignite-qa-session-item-score ${getScoreClass(session.score)}`}>
                {session.score}%
              </span>
            </div>
            <div className="ignite-qa-session-item-meta">
              <span className="ignite-qa-session-item-questions">
                {session.questions.length} question{session.questions.length !== 1 ? 's' : ''}
              </span>
              <span className="ignite-qa-session-item-status">
                {session.completedAt ? 'Completed' : 'In Progress'}
              </span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
