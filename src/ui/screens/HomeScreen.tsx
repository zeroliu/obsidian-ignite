import { useRouter } from '@/ui/Router';
import { GoalCard } from '@/ui/components/goal/GoalCard';
import { Button } from '@/ui/components/shared/Button';
import { useGoals } from '@/ui/contexts/GoalContext';

/**
 * Home screen displaying goals list or empty state.
 */
export function HomeScreen() {
  const { goals } = useGoals();
  const { navigate } = useRouter();

  const handleGoalClick = (goalId: string) => {
    navigate({ type: 'goal-detail', goalId });
  };

  const handleCreateGoal = () => {
    navigate({ type: 'brainstorm' });
  };

  return (
    <div className="ignite-screen ignite-home-screen">
      <div className="ignite-screen-header">
        <h2 className="ignite-screen-title">My Goals</h2>
        <Button variant="primary" onClick={handleCreateGoal}>
          New Goal
        </Button>
      </div>

      <div className="ignite-screen-content">
        {goals.length === 0 ? (
          <div className="ignite-empty-state">
            <div className="ignite-empty-state-icon">🎯</div>
            <h3 className="ignite-empty-state-title">No goals yet</h3>
            <p className="ignite-empty-state-description">
              Create your first learning goal to get started with personalized quizzes and
              discussions.
            </p>
            <Button variant="primary" onClick={handleCreateGoal}>
              Create Your First Goal
            </Button>
          </div>
        ) : (
          <div className="ignite-goals-list">
            {goals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} onClick={() => handleGoalClick(goal.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
