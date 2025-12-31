import type { Goal } from '@/domain/goal/types';
import { Card } from '@/ui/components/shared/Card';
import { ProgressBar } from '@/ui/components/shared/ProgressBar';

/**
 * GoalCard component props.
 */
export interface GoalCardProps {
  goal: Goal;
  onClick?: () => void;
}

/**
 * Goal summary card displaying goal name, description, and progress.
 */
export function GoalCard({ goal, onClick }: GoalCardProps) {
  const completedMilestones = goal.milestones.filter((m) => m.completed).length;
  const totalMilestones = goal.milestones.length;

  const deadlineDate = new Date(goal.deadline);
  const formattedDeadline = deadlineDate.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <Card interactive={Boolean(onClick)} onClick={onClick} className="ignite-goal-card">
      <div className="ignite-goal-card-header">
        <h3 className="ignite-goal-card-title">{goal.name}</h3>
        {goal.status === 'completed' && (
          <span className="ignite-goal-card-badge ignite-goal-card-badge-completed">Completed</span>
        )}
      </div>

      <p className="ignite-goal-card-description">{goal.description}</p>

      <div className="ignite-goal-card-meta">
        <div className="ignite-goal-card-deadline">
          <span className="ignite-goal-card-meta-label">Deadline:</span> {formattedDeadline}
        </div>
        <div className="ignite-goal-card-notes">
          <span className="ignite-goal-card-meta-label">Notes:</span> {goal.notesPaths.length}
        </div>
      </div>

      <ProgressBar
        value={completedMilestones}
        max={totalMilestones}
        label={`${completedMilestones}/${totalMilestones} milestones`}
        showPercentage={false}
      />
    </Card>
  );
}
