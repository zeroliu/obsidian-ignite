import type React from 'react';

import {
  isBrainstormScreen,
  isDiscussScreen,
  isGoalDetailScreen,
  isHomeScreen,
  isNoteAssignmentScreen,
  isQAScreen,
  useRouter,
} from '@/ui/Router';
import { ErrorBoundary } from '@/ui/components/shared/ErrorBoundary';
import { BrainstormScreen } from '@/ui/screens/BrainstormScreen';
import { GoalDetailScreen } from '@/ui/screens/GoalDetailScreen';
import { HomeScreen } from '@/ui/screens/HomeScreen';
import { NoteAssignmentScreen } from '@/ui/screens/NoteAssignmentScreen';

const IgniteAppContent: React.FC = () => {
  const { currentScreen } = useRouter();

  if (isHomeScreen(currentScreen)) {
    return <HomeScreen />;
  }

  if (isGoalDetailScreen(currentScreen)) {
    return <GoalDetailScreen goalId={currentScreen.goalId} />;
  }

  if (isBrainstormScreen(currentScreen)) {
    return <BrainstormScreen />;
  }

  if (isNoteAssignmentScreen(currentScreen)) {
    return <NoteAssignmentScreen goalDraft={currentScreen.goalDraft} />;
  }

  if (isDiscussScreen(currentScreen)) {
    return (
      <div className="ignite-screen">
        <div className="ignite-screen-content">
          <div className="ignite-empty-state">
            <h3 className="ignite-empty-state-title">Discuss Screen</h3>
            <p className="ignite-empty-state-description">Coming in Phase 4</p>
          </div>
        </div>
      </div>
    );
  }

  if (isQAScreen(currentScreen)) {
    return (
      <div className="ignite-screen">
        <div className="ignite-screen-content">
          <div className="ignite-empty-state">
            <h3 className="ignite-empty-state-title">Q&A Screen</h3>
            <p className="ignite-empty-state-description">Coming in Phase 4</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ignite-screen">
      <div className="ignite-screen-content">
        <div className="ignite-empty-state">
          <h3 className="ignite-empty-state-title">Unknown Screen</h3>
          <p className="ignite-empty-state-description">This screen type is not recognized.</p>
        </div>
      </div>
    </div>
  );
};

export const IgniteApp: React.FC = () => {
  return (
    <ErrorBoundary>
      <div className="ignite-app">
        <IgniteAppContent />
      </div>
    </ErrorBoundary>
  );
};
