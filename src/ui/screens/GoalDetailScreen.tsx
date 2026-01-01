import { ConversationService } from '@/domain/goal/ConversationService';
import { QAService } from '@/domain/goal/QAService';
import type { Conversation, Goal, QASession } from '@/domain/goal/types';
import { useRouter } from '@/ui/Router';
import { ActionCard } from '@/ui/components/goal/ActionCard';
import { ConversationList } from '@/ui/components/goal/ConversationList';
import { MilestoneList } from '@/ui/components/goal/MilestoneList';
import { QASessionList } from '@/ui/components/goal/QASessionList';
import { Button } from '@/ui/components/shared/Button';
import { LoadingSpinner } from '@/ui/components/shared/LoadingSpinner';
import { ProgressBar } from '@/ui/components/shared/ProgressBar';
import { useApp } from '@/ui/contexts/AppContext';
import { useGoals } from '@/ui/contexts/GoalContext';
import { useLLM } from '@/ui/contexts/LLMContext';
import { useEffect, useState } from 'react';

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
  const { vaultProvider } = useApp();
  const { llmProvider } = useLLM();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [qaSessions, setQASessions] = useState<QASession[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const goal = goals.find((g: Goal) => g.id === goalId);

  // Load conversations and Q&A sessions
  useEffect(() => {
    const loadHistory = async () => {
      if (!goal) return;

      setIsLoadingHistory(true);
      try {
        const conversationService = new ConversationService(vaultProvider, llmProvider);
        const qaService = new QAService(vaultProvider, llmProvider);

        const [loadedConversations, loadedSessions] = await Promise.all([
          conversationService.getConversationsForGoal(goalId),
          qaService.getSessionsForGoal(goalId),
        ]);

        setConversations(loadedConversations);
        setQASessions(loadedSessions);
      } catch (error) {
        console.error('Failed to load history:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [goalId, goal, vaultProvider, llmProvider]);

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

  const handleSelectConversation = (conversationId: string) => {
    navigate({ type: 'discuss', goalId: goal.id, conversationId });
  };

  const handleQA = () => {
    navigate({ type: 'qa', goalId: goal.id });
  };

  const handleSelectSession = (_sessionId: string) => {
    // For now, just start a new session. In the future, this could resume an incomplete session.
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

        <div className="ignite-goal-detail-section">
          <h3 className="ignite-goal-detail-section-title">Discussion History</h3>
          {isLoadingHistory ? (
            <div className="ignite-loading-inline">
              <LoadingSpinner size="sm" />
              <span>Loading discussions...</span>
            </div>
          ) : (
            <ConversationList conversations={conversations} onSelect={handleSelectConversation} />
          )}
        </div>

        <div className="ignite-goal-detail-section">
          <h3 className="ignite-goal-detail-section-title">Q&A History</h3>
          {isLoadingHistory ? (
            <div className="ignite-loading-inline">
              <LoadingSpinner size="sm" />
              <span>Loading sessions...</span>
            </div>
          ) : (
            <QASessionList sessions={qaSessions} onSelect={handleSelectSession} />
          )}
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
