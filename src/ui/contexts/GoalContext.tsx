import { GoalService } from '@/domain/goal/GoalService';
import type { Goal, Milestone } from '@/domain/goal/types';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useApp } from './AppContext';

/**
 * Goal context value with state and operations.
 */
export interface GoalContextValue {
  goals: Goal[];
  loading: boolean;
  error: string | null;

  // Operations
  loadGoals: () => Promise<void>;
  getGoalById: (goalId: string) => Goal | undefined;
  createGoal: (params: {
    name: string;
    description: string;
    deadline: string;
    milestones: Milestone[];
    notesPaths?: string[];
  }) => Promise<Goal>;
  updateGoal: (goalId: string, updates: Partial<Omit<Goal, 'id' | 'createdAt'>>) => Promise<Goal>;
  deleteGoal: (goalId: string) => Promise<void>;
  completeGoal: (goalId: string) => Promise<Goal>;
  addNotesToGoal: (goalId: string, notesPaths: string[]) => Promise<Goal>;
  removeNotesFromGoal: (goalId: string, notesPaths: string[]) => Promise<Goal>;
  updateMilestones: (goalId: string, milestones: Milestone[]) => Promise<Goal>;
}

const GoalContext = createContext<GoalContextValue | undefined>(undefined);

/**
 * Provider for goal state and operations.
 */
export function GoalProvider({ children }: { children: React.ReactNode }) {
  const { vaultProvider } = useApp();
  const [goalService] = useState(() => new GoalService(vaultProvider));
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all goals
  const loadGoals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loadedGoals = await goalService.getAllGoals();
      setGoals(loadedGoals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load goals');
    } finally {
      setLoading(false);
    }
  }, [goalService]);

  // Load goals on mount
  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  // Get goal by ID
  const getGoalById = useCallback(
    (goalId: string) => {
      return goals.find((g) => g.id === goalId);
    },
    [goals],
  );

  // Create goal
  const createGoal = useCallback(
    async (params: {
      name: string;
      description: string;
      deadline: string;
      milestones: Milestone[];
      notesPaths?: string[];
    }) => {
      setError(null);
      try {
        const goal = await goalService.createGoal(params);
        setGoals((prev) => [...prev, goal]);
        return goal;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create goal';
        setError(message);
        throw new Error(message);
      }
    },
    [goalService],
  );

  // Update goal
  const updateGoal = useCallback(
    async (goalId: string, updates: Partial<Omit<Goal, 'id' | 'createdAt'>>) => {
      setError(null);
      try {
        const updatedGoal = await goalService.updateGoal(goalId, updates);
        setGoals((prev) => prev.map((g) => (g.id === goalId ? updatedGoal : g)));
        return updatedGoal;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update goal';
        setError(message);
        throw new Error(message);
      }
    },
    [goalService],
  );

  // Delete goal
  const deleteGoal = useCallback(
    async (goalId: string) => {
      setError(null);
      try {
        await goalService.deleteGoal(goalId);
        setGoals((prev) => prev.filter((g) => g.id !== goalId));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete goal';
        setError(message);
        throw new Error(message);
      }
    },
    [goalService],
  );

  // Complete goal
  const completeGoal = useCallback(
    async (goalId: string) => {
      return updateGoal(goalId, { status: 'completed' });
    },
    [updateGoal],
  );

  // Add notes to goal
  const addNotesToGoal = useCallback(
    async (goalId: string, notesPaths: string[]) => {
      setError(null);
      try {
        const updatedGoal = await goalService.addNotesToGoal(goalId, notesPaths);
        setGoals((prev) => prev.map((g) => (g.id === goalId ? updatedGoal : g)));
        return updatedGoal;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add notes to goal';
        setError(message);
        throw new Error(message);
      }
    },
    [goalService],
  );

  // Remove notes from goal
  const removeNotesFromGoal = useCallback(
    async (goalId: string, notesPaths: string[]) => {
      setError(null);
      try {
        const updatedGoal = await goalService.removeNotesFromGoal(goalId, notesPaths);
        setGoals((prev) => prev.map((g) => (g.id === goalId ? updatedGoal : g)));
        return updatedGoal;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to remove notes from goal';
        setError(message);
        throw new Error(message);
      }
    },
    [goalService],
  );

  // Update milestones
  const updateMilestones = useCallback(
    async (goalId: string, milestones: Milestone[]) => {
      setError(null);
      try {
        const updatedGoal = await goalService.updateMilestones(goalId, milestones);
        setGoals((prev) => prev.map((g) => (g.id === goalId ? updatedGoal : g)));
        return updatedGoal;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update milestones';
        setError(message);
        throw new Error(message);
      }
    },
    [goalService],
  );

  const value: GoalContextValue = {
    goals,
    loading,
    error,
    loadGoals,
    getGoalById,
    createGoal,
    updateGoal,
    deleteGoal,
    completeGoal,
    addNotesToGoal,
    removeNotesFromGoal,
    updateMilestones,
  };

  return <GoalContext.Provider value={value}>{children}</GoalContext.Provider>;
}

/**
 * Hook to access goal state and operations.
 */
export function useGoals(): GoalContextValue {
  const context = useContext(GoalContext);
  if (!context) {
    throw new Error('useGoals must be used within GoalProvider');
  }
  return context;
}
