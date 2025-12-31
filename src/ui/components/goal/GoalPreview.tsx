import type { GoalDraft } from '@/domain/goal/BrainstormService';
import { Button } from '../shared/Button';
import { Card } from '../shared/Card';

/**
 * Goal preview props.
 */
export interface GoalPreviewProps {
  draft: GoalDraft;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Preview component showing generated goal details before creation.
 */
export function GoalPreview({ draft, onConfirm, onCancel }: GoalPreviewProps) {
  return (
    <Card className="ignite-goal-preview">
      <h2 className="ignite-goal-preview-title">Review Your Goal</h2>

      <div className="ignite-goal-preview-section">
        <h3 className="ignite-goal-preview-label">Goal Name</h3>
        <p className="ignite-goal-preview-name">{draft.name}</p>
      </div>

      <div className="ignite-goal-preview-section">
        <h3 className="ignite-goal-preview-label">Description</h3>
        <p className="ignite-goal-preview-description">{draft.description}</p>
      </div>

      <div className="ignite-goal-preview-section">
        <h3 className="ignite-goal-preview-label">Deadline</h3>
        <p className="ignite-goal-preview-deadline">{draft.deadline}</p>
      </div>

      <div className="ignite-goal-preview-section">
        <h3 className="ignite-goal-preview-label">Milestones</h3>
        <ul className="ignite-goal-preview-milestones">
          {draft.milestones.map((milestone) => (
            <li key={milestone} className="ignite-goal-preview-milestone">
              {milestone}
            </li>
          ))}
        </ul>
      </div>

      <div className="ignite-goal-preview-actions">
        <Button variant="primary" onClick={onConfirm}>
          Confirm and Assign Notes
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Continue Editing
        </Button>
      </div>
    </Card>
  );
}
