import { BrainstormService } from '@/domain/goal/BrainstormService';
import type { GoalDraft } from '@/domain/goal/BrainstormService';
import { NoteRelevanceService, type ScoredNote } from '@/domain/goal/NoteRelevanceService';
import { useEffect, useState } from 'react';
import { useRouter } from '../Router';
import { NoteList } from '../components/notes';
import { Button } from '../components/shared/Button';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { useApp } from '../contexts/AppContext';
import { useGoals } from '../contexts/GoalContext';
import { useLLM } from '../contexts/LLMContext';

/**
 * Note assignment screen props.
 */
export interface NoteAssignmentScreenProps {
  goalDraft: GoalDraft;
}

/**
 * Note assignment screen with AI-ranked notes.
 */
export function NoteAssignmentScreen({ goalDraft }: NoteAssignmentScreenProps) {
  const router = useRouter();
  const { vaultProvider, settings } = useApp();
  const { llmProvider } = useLLM();
  const { createGoal } = useGoals();

  const [scoredNotes, setScoredNotes] = useState<ScoredNote[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load and score notes on mount
  useEffect(() => {
    const scoreNotes = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const noteRelevanceService = new NoteRelevanceService(vaultProvider, llmProvider);
        const scored = await noteRelevanceService.scoreNotes(
          goalDraft,
          settings.includePaths,
          settings.excludePaths,
        );
        setScoredNotes(scored);

        // Auto-select notes with score >= 70
        const highScorePaths = scored.filter((note) => note.score >= 70).map((note) => note.path);
        setSelectedPaths(highScorePaths);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to score notes');
      } finally {
        setIsLoading(false);
      }
    };

    scoreNotes();
  }, [goalDraft, vaultProvider, llmProvider, settings.includePaths, settings.excludePaths]);

  const handleToggle = (path: string) => {
    setSelectedPaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
  };

  const handleSelectAll = () => {
    setSelectedPaths(scoredNotes.map((note) => note.path));
  };

  const handleDeselectAll = () => {
    setSelectedPaths([]);
  };

  const handleCreateGoal = async () => {
    setIsCreating(true);
    setError(null);

    try {
      const brainstormService = new BrainstormService(llmProvider);
      const milestones = brainstormService.convertToMilestones(goalDraft.milestones);

      const goal = await createGoal({
        name: goalDraft.name,
        description: goalDraft.description,
        deadline: goalDraft.deadline,
        milestones,
        notesPaths: selectedPaths,
      });

      // Navigate to goal detail
      router.navigate({ type: 'goal-detail', goalId: goal.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create goal');
      setIsCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="ignite-note-assignment-screen">
        <div className="ignite-screen-header">
          <h1 className="ignite-screen-title">Loading Notes...</h1>
        </div>
        <div className="ignite-note-assignment-loading">
          <LoadingSpinner />
          <p>Analyzing your notes for relevance to the goal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ignite-note-assignment-screen">
      <div className="ignite-screen-header">
        <h1 className="ignite-screen-title">Assign Notes to Goal</h1>
        {router.canGoBack && (
          <Button variant="secondary" onClick={() => router.goBack()}>
            Back
          </Button>
        )}
      </div>

      <div className="ignite-note-assignment-content">
        <div className="ignite-note-assignment-info">
          <h2>{goalDraft.name}</h2>
          <p>
            Select the notes you want to use for this goal. Notes are ranked by relevance based on
            your goal description.
          </p>
        </div>

        {error && <div className="ignite-error-message">{error}</div>}

        {scoredNotes.length === 0 ? (
          <div className="ignite-note-assignment-empty">
            <p>No notes found in your vault.</p>
            <Button variant="primary" onClick={handleCreateGoal} disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create Goal Anyway'}
            </Button>
          </div>
        ) : (
          <>
            <NoteList
              notes={scoredNotes}
              selectedPaths={selectedPaths}
              onToggle={handleToggle}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
            />

            <div className="ignite-note-assignment-actions">
              <Button
                variant="primary"
                onClick={handleCreateGoal}
                disabled={isCreating || selectedPaths.length === 0}
              >
                {isCreating ? 'Creating Goal...' : `Create Goal with ${selectedPaths.length} Notes`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
