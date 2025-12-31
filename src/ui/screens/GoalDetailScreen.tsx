import type { Goal } from '@/domain/goal/types';
import { useRouter } from '@/ui/Router';
import { ActionCard } from '@/ui/components/goal/ActionCard';
import { MilestoneList } from '@/ui/components/goal/MilestoneList';
import { Button } from '@/ui/components/shared/Button';
import { ProgressBar } from '@/ui/components/shared/ProgressBar';
import { useGoals } from '@/ui/contexts/GoalContext';

/**
 * GoalDetailScreen component props.
 */
export interface GoalDetailScreenProps {
  goalId: string;
}

/**
 * Goal detail screen showing milestones, notes, and action buttons.
 */
export function GoalDetailScreen({ goalId }: GoalDetailScreenProps) {
  const { goals, updateGoal } = useGoals();
  const { navigate, goBack } = useRouter();

  const goal = goals.find((g: Goal) => g.id === goalId);

  if (!goal) {
    return (
      <div className="ignite-screen ignite-goal-detail-screen">
        <div className="ignite-screen-header">
          <Button variant="secondary" onClick={goBack}>
            ← Back
          </Button>
        </div>
        <div className="ignite-screen-content">
          <div className="ignite-empty-state">
            <h3 className="ignite-empty-state-title">Goal not found</h3>
            <p className="ignite-empty-state-description">
              The goal you are looking for does not exist.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const completedMilestones = goal.milestones.filter((m) => m.completed).length;
  const totalMilestones = goal.milestones.length;

  const handleMilestoneToggle = (milestoneId: string) => {
    const updatedMilestones = goal.milestones.map((m) =>
      m.id === milestoneId ? { ...m, completed: !m.completed } : m,
    );

    updateGoal(goal.id, {
      milestones: updatedMilestones,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleDiscuss = () => {
    navigate({ type: 'discuss', goalId: goal.id });
  };

  const handleQA = () => {
    navigate({ type: 'qa', goalId: goal.id });
  };

  const deadlineDate = new Date(goal.deadline);
  const formattedDeadline = deadlineDate.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="ignite-screen ignite-goal-detail-screen">
      <div className="ignite-screen-header">
        <Button variant="secondary" onClick={goBack}>
          ← Back
        </Button>
      </div>

      <div className="ignite-screen-content">
        <div className="ignite-goal-detail-header">
          <h2 className="ignite-goal-detail-title">{goal.name}</h2>
          {goal.status === 'completed' && (
            <span className="ignite-goal-badge ignite-goal-badge-completed">Completed</span>
          )}
        </div>

        <p className="ignite-goal-detail-description">{goal.description}</p>

        <div className="ignite-goal-detail-meta">
          <div className="ignite-goal-detail-meta-item">
            <span className="ignite-goal-detail-meta-label">Deadline:</span> {formattedDeadline}
          </div>
          <div className="ignite-goal-detail-meta-item">
            <span className="ignite-goal-detail-meta-label">Assigned Notes:</span>{' '}
            {goal.notesPaths.length}
          </div>
        </div>

        <div className="ignite-goal-detail-section">
          <h3 className="ignite-goal-detail-section-title">Progress</h3>
          <ProgressBar
            value={completedMilestones}
            max={totalMilestones}
            label={`${completedMilestones} of ${totalMilestones} milestones completed`}
            showPercentage={true}
          />
        </div>

        <div className="ignite-goal-detail-section">
          <h3 className="ignite-goal-detail-section-title">Milestones</h3>
          <MilestoneList milestones={goal.milestones} onToggle={handleMilestoneToggle} />
        </div>

        <div className="ignite-goal-detail-section">
          <h3 className="ignite-goal-detail-section-title">Actions</h3>
          <div className="ignite-goal-detail-actions">
            <ActionCard
              title="Discuss"
              description="Have a conversation about your learning materials with AI guidance"
              icon="💬"
              onClick={handleDiscuss}
            />
            <ActionCard
              title="Q&A"
              description="Test your knowledge with AI-generated questions from your notes"
              icon="❓"
              onClick={handleQA}
            />
          </div>
        </div>

        {goal.notesPaths.length > 0 && (
          <div className="ignite-goal-detail-section">
            <h3 className="ignite-goal-detail-section-title">Assigned Notes</h3>
            <ul className="ignite-goal-detail-notes-list">
              {goal.notesPaths.map((path) => (
                <li key={path} className="ignite-goal-detail-notes-item">
                  {path}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
