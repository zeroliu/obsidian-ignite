import type { GoalDraft } from '@/domain/goal/BrainstormService';
import type React from 'react';
import { createContext, useContext, useState } from 'react';

/**
 * Screen types for navigation.
 * Uses discriminated union for type safety.
 */
export type Screen =
  | { type: 'home' }
  | { type: 'brainstorm' }
  | { type: 'note-assignment'; goalDraft: GoalDraft }
  | { type: 'goal-detail'; goalId: string }
  | { type: 'discuss'; goalId: string; conversationId?: string }
  | { type: 'qa'; goalId: string };

/**
 * Router context value.
 */
export interface RouterContextValue {
  currentScreen: Screen;
  navigate: (screen: Screen) => void;
  goBack: () => void;
  canGoBack: boolean;
}

const RouterContext = createContext<RouterContextValue | undefined>(undefined);

/**
 * Simple state-based router for navigation.
 * Maintains history stack for back navigation.
 */
export function Router({ children }: { children: React.ReactNode }) {
  const [history, setHistory] = useState<Screen[]>([{ type: 'home' }]);
  const currentScreen = history[history.length - 1];

  const navigate = (screen: Screen) => {
    setHistory((prev) => [...prev, screen]);
  };

  const goBack = () => {
    if (history.length > 1) {
      setHistory((prev) => prev.slice(0, -1));
    }
  };

  const canGoBack = history.length > 1;

  const value: RouterContextValue = {
    currentScreen,
    navigate,
    goBack,
    canGoBack,
  };

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

/**
 * Hook to access router functionality.
 */
export function useRouter(): RouterContextValue {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouter must be used within Router');
  }
  return context;
}

/**
 * Type guard to check if screen is home screen.
 */
export function isHomeScreen(screen: Screen): screen is { type: 'home' } {
  return screen.type === 'home';
}

/**
 * Type guard to check if screen is brainstorm screen.
 */
export function isBrainstormScreen(screen: Screen): screen is { type: 'brainstorm' } {
  return screen.type === 'brainstorm';
}

/**
 * Type guard to check if screen is goal detail screen.
 */
export function isGoalDetailScreen(
  screen: Screen,
): screen is { type: 'goal-detail'; goalId: string } {
  return screen.type === 'goal-detail';
}

/**
 * Type guard to check if screen is discuss screen.
 */
export function isDiscussScreen(
  screen: Screen,
): screen is { type: 'discuss'; goalId: string; conversationId?: string } {
  return screen.type === 'discuss';
}

/**
 * Type guard to check if screen is Q&A screen.
 */
export function isQAScreen(screen: Screen): screen is { type: 'qa'; goalId: string } {
  return screen.type === 'qa';
}

/**
 * Type guard to check if screen is note assignment screen.
 */
export function isNoteAssignmentScreen(
  screen: Screen,
): screen is { type: 'note-assignment'; goalDraft: GoalDraft } {
  return screen.type === 'note-assignment';
}
