import type React from 'react';

import {
  Router,
  isBrainstormScreen,
  isDiscussScreen,
  isGoalDetailScreen,
  isHomeScreen,
  isNoteAssignmentScreen,
  isQAScreen,
  useRouter,
} from '@/ui/Router';
import { ErrorBoundary } from '@/ui/components/shared/ErrorBoundary';
import { type AppContextValue, AppProvider } from '@/ui/contexts/AppContext';
import { GoalProvider } from '@/ui/contexts/GoalContext';
import { LLMProvider } from '@/ui/contexts/LLMContext';
import { BrainstormScreen } from '@/ui/screens/BrainstormScreen';
import { DiscussScreen } from '@/ui/screens/DiscussScreen';
import { GoalDetailScreen } from '@/ui/screens/GoalDetailScreen';
import { HomeScreen } from '@/ui/screens/HomeScreen';
import { NoteAssignmentScreen } from '@/ui/screens/NoteAssignmentScreen';
import { QAScreen } from '@/ui/screens/QAScreen';

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
      <DiscussScreen goalId={currentScreen.goalId} conversationId={currentScreen.conversationId} />
    );
  }

  if (isQAScreen(currentScreen)) {
    return <QAScreen goalId={currentScreen.goalId} />;
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

/**
 * Core app component that assumes context providers are in place.
 * Use IgniteRoot to render with providers.
 */
export const IgniteApp: React.FC = () => {
  return (
    <ErrorBoundary>
      <Router>
        <div className="ignite-app">
          <IgniteAppContent />
        </div>
      </Router>
    </ErrorBoundary>
  );
};

interface IgniteRootProps {
  appContext: AppContextValue;
}

/**
 * Root component that wraps IgniteApp with all required providers.
 * Use this in production (IgniteView) and tests to ensure consistent provider structure.
 */
export const IgniteRoot: React.FC<IgniteRootProps> = ({ appContext }) => {
  return (
    <AppProvider value={appContext}>
      <LLMProvider llmProvider={appContext.llmProvider}>
        <GoalProvider>
          <IgniteApp />
        </GoalProvider>
      </LLMProvider>
    </AppProvider>
  );
};
