import type { IVaultProvider } from '@/ports';
import { parseFrontmatter, serializeFrontmatter } from './frontmatterUtils';
import type { Goal, Milestone } from './types';

/**
 * Service for managing goals with markdown+frontmatter storage.
 * Goals are stored in `ignite/{goal-id}/goal.md` with frontmatter metadata.
 */
export class GoalService {
  private static readonly IGNITE_FOLDER = 'ignite';
  private static readonly GOAL_FILENAME = 'goal.md';

  constructor(private vaultProvider: IVaultProvider) {}

  /**
   * Get all goals from the vault.
   */
  async getAllGoals(): Promise<Goal[]> {
    const files = await this.vaultProvider.listMarkdownFiles();
    const goalFiles = files.filter((file) => file.path.match(/^ignite\/[^/]+\/goal\.md$/));

    // Load goals in parallel for better performance
    const goalPromises = goalFiles.map(async (file) => {
      try {
        return await this.loadGoal(file.path);
      } catch (error) {
        console.warn(`Failed to load goal from ${file.path}:`, error);
        return null;
      }
    });

    const results = await Promise.all(goalPromises);
    return results.filter((goal): goal is Goal => goal !== null);
  }

  /**
   * Get a goal by ID.
   */
  async getGoalById(goalId: string): Promise<Goal | null> {
    const path = this.getGoalPath(goalId);
    const exists = await this.vaultProvider.exists(path);

    if (!exists) {
      return null;
    }

    return this.loadGoal(path);
  }

  /**
   * Create a new goal.
   */
  async createGoal(params: {
    name: string;
    description: string;
    deadline: string;
    milestones: Milestone[];
    notesPaths?: string[];
  }): Promise<Goal> {
    // Validate inputs
    if (!params.name || params.name.trim().length === 0) {
      throw new Error('Goal name cannot be empty');
    }
    if (!params.description || params.description.trim().length === 0) {
      throw new Error('Goal description cannot be empty');
    }
    if (!params.deadline || params.deadline.trim().length === 0) {
      throw new Error('Goal deadline cannot be empty');
    }
    if (!params.milestones || params.milestones.length === 0) {
      throw new Error('Goal must have at least one milestone');
    }

    const goalId = this.generateGoalId();
    const now = new Date().toISOString();

    const goal: Goal = {
      id: goalId,
      name: params.name,
      description: params.description,
      deadline: params.deadline,
      milestones: params.milestones,
      notesPaths: params.notesPaths ?? [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    await this.saveGoal(goal);
    return goal;
  }

  /**
   * Update an existing goal.
   */
  async updateGoal(
    goalId: string,
    updates: Partial<Omit<Goal, 'id' | 'createdAt'>>,
  ): Promise<Goal> {
    const goal = await this.getGoalById(goalId);
    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    const updatedGoal: Goal = {
      ...goal,
      ...updates,
      id: goalId,
      createdAt: goal.createdAt,
      updatedAt: new Date().toISOString(),
    };

    await this.saveGoal(updatedGoal);
    return updatedGoal;
  }

  /**
   * Delete a goal and its folder.
   */
  async deleteGoal(goalId: string): Promise<void> {
    // Validate goalId to prevent path traversal
    this.validateGoalId(goalId);

    const path = this.getGoalPath(goalId);
    const exists = await this.vaultProvider.exists(path);

    if (!exists) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    // Delete the entire goal folder including all conversations and QA sessions
    const folderPath = this.getGoalFolderPath(goalId);
    await this.vaultProvider.deleteFolder(folderPath);
  }

  /**
   * Mark a goal as completed.
   */
  async completeGoal(goalId: string): Promise<Goal> {
    return this.updateGoal(goalId, { status: 'completed' });
  }

  /**
   * Add notes to a goal.
   */
  async addNotesToGoal(goalId: string, notesPaths: string[]): Promise<Goal> {
    const goal = await this.getGoalById(goalId);
    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    const existingPaths = goal.notesPaths ?? [];
    const uniquePaths = new Set([...existingPaths, ...notesPaths]);
    return this.updateGoal(goalId, {
      notesPaths: Array.from(uniquePaths),
    });
  }

  /**
   * Remove notes from a goal.
   */
  async removeNotesFromGoal(goalId: string, notesPaths: string[]): Promise<Goal> {
    const goal = await this.getGoalById(goalId);
    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    const existingPaths = goal.notesPaths ?? [];
    const pathsToRemove = new Set(notesPaths);
    const updatedPaths = existingPaths.filter((path) => !pathsToRemove.has(path));

    return this.updateGoal(goalId, { notesPaths: updatedPaths });
  }

  /**
   * Update milestones for a goal.
   */
  async updateMilestones(goalId: string, milestones: Milestone[]): Promise<Goal> {
    return this.updateGoal(goalId, { milestones });
  }

  /**
   * Load a goal from a file path.
   */
  private async loadGoal(path: string): Promise<Goal> {
    const content = await this.vaultProvider.readFile(path);
    const { frontmatter } = parseFrontmatter<Goal>(content);
    return frontmatter;
  }

  /**
   * Save a goal to the vault.
   */
  private async saveGoal(goal: Goal): Promise<void> {
    const folderPath = this.getGoalFolderPath(goal.id);
    const goalPath = this.getGoalPath(goal.id);

    // Create folder structure
    await this.vaultProvider.createFolder(folderPath);
    await this.vaultProvider.createFolder(`${folderPath}/conversations`);
    await this.vaultProvider.createFolder(`${folderPath}/qa-sessions`);

    // Serialize goal to markdown
    const body = `# ${goal.name}\n\n${goal.description}`;
    const content = serializeFrontmatter(goal, body);

    // Create or update file
    const exists = await this.vaultProvider.exists(goalPath);
    if (exists) {
      await this.vaultProvider.modifyFile(goalPath, content);
    } else {
      await this.vaultProvider.createFile(goalPath, content);
    }
  }

  /**
   * Generate a unique goal ID using UUID v4.
   */
  private generateGoalId(): string {
    // Use crypto.randomUUID() which is available in Node.js 14.17+ and modern browsers
    // Falls back to timestamp + random if not available (for compatibility)
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `goal-${crypto.randomUUID()}`;
    }
    // Fallback for environments without crypto.randomUUID()
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `goal-${timestamp}-${random}`;
  }

  /**
   * Get the folder path for a goal.
   */
  private getGoalFolderPath(goalId: string): string {
    return `${GoalService.IGNITE_FOLDER}/${goalId}`;
  }

  /**
   * Get the file path for a goal's markdown file.
   */
  private getGoalPath(goalId: string): string {
    return `${this.getGoalFolderPath(goalId)}/${GoalService.GOAL_FILENAME}`;
  }

  /**
   * Validate goal ID to prevent path traversal attacks.
   */
  private validateGoalId(goalId: string): void {
    if (!goalId || goalId.trim().length === 0) {
      throw new Error('Goal ID cannot be empty');
    }
    if (goalId.includes('/') || goalId.includes('\\') || goalId.includes('..')) {
      throw new Error(
        'Invalid goal ID: cannot contain path separators or parent directory references',
      );
    }
  }
}
