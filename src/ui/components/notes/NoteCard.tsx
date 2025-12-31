import { Card } from '../shared/Card';

/**
 * Note card props.
 */
export interface NoteCardProps {
  path: string;
  score: number;
  reason: string;
  selected: boolean;
  onToggle: (path: string) => void;
}

/**
 * Note card with relevance score and selection.
 */
export function NoteCard({ path, score, reason, selected, onToggle }: NoteCardProps) {
  const scoreColor = getScoreColor(score);

  return (
    <Card
      interactive={true}
      className={`ignite-note-card ${selected ? 'ignite-note-card-selected' : ''}`}
      onClick={() => onToggle(path)}
    >
      <div className="ignite-note-card-header">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(path)}
          className="ignite-note-card-checkbox"
          onClick={(e) => e.stopPropagation()}
        />
        <div className="ignite-note-card-path">{path}</div>
        <div className={`ignite-note-card-score ${scoreColor}`}>{score}</div>
      </div>
      <div className="ignite-note-card-reason">{reason}</div>
    </Card>
  );
}

/**
 * Get CSS class for score color based on value.
 */
function getScoreColor(score: number): string {
  if (score >= 90) return 'ignite-score-excellent';
  if (score >= 70) return 'ignite-score-high';
  if (score >= 50) return 'ignite-score-medium';
  if (score >= 30) return 'ignite-score-low';
  return 'ignite-score-minimal';
}
