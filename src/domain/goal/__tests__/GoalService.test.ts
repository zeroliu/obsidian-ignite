import type { IVaultProvider } from '@/ports';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoalService } from '../GoalService';
import type { Goal, Milestone } from '../types';

describe('GoalService', () => {
  let service: GoalService;
  let mockVaultProvider: IVaultProvider;
  let storedFiles: Map<string, string>;

  beforeEach(() => {
    storedFiles = new Map();

    mockVaultProvider = {
      listMarkdownFiles: vi.fn(async () => {
        const files = Array.from(storedFiles.keys()).map((path) => ({
          path,
          basename: path.split('/').pop()?.replace('.md', '') || '',
          folder: path.split('/').slice(0, -1).join('/'),
          modifiedAt: Date.now(),
          createdAt: Date.now(),
        }));
        return files;
      }),
      readFile: vi.fn(async (path: string) => {
        const content = storedFiles.get(path);
        if (!content) {
          throw new Error(`File not found: ${path}`);
        }
        return content;
      }),
      exists: vi.fn(async (path: string) => storedFiles.has(path)),
      getBasename: vi.fn((path: string) => path.split('/').pop()?.replace('.md', '') || ''),
      getFolder: vi.fn((path: string) => path.split('/').slice(0, -1).join('/')),
      createFile: vi.fn(async (path: string, content: string) => {
        storedFiles.set(path, content);
      }),
      modifyFile: vi.fn(async (path: string, content: string) => {
        if (!storedFiles.has(path)) {
          throw new Error(`File not found: ${path}`);
        }
        storedFiles.set(path, content);
      }),
      createFolder: vi.fn(async () => {}),
      deleteFile: vi.fn(async (path: string) => {
        if (!storedFiles.has(path)) {
          throw new Error(`File not found: ${path}`);
        }
        storedFiles.delete(path);
      }),
      deleteFolder: vi.fn(async (path: string) => {
        const pathPrefix = `${path}/`;
        const keysToDelete = Array.from(storedFiles.keys()).filter(
          (key) => key.startsWith(pathPrefix) || key === path,
        );
        for (const key of keysToDelete) {
          storedFiles.delete(key);
        }
      }),
    };

    service = new GoalService(mockVaultProvider);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createGoal', () => {
    const validParams = {
      name: 'Learn TypeScript',
      description: 'Master TypeScript fundamentals',
      deadline: '2025-12-31',
      milestones: [
        { id: 'm1', title: 'Learn basics', completed: false },
      ] as Milestone[],
    };

    it('should create a goal with valid inputs', async () => {
      const goal = await service.createGoal(validParams);

      expect(goal.name).toBe(validParams.name);
      expect(goal.description).toBe(validParams.description);
      expect(goal.deadline).toBe(validParams.deadline);
      expect(goal.milestones).toEqual(validParams.milestones);
      expect(goal.status).toBe('active');
      expect(goal.id).toMatch(/^goal-\d+-[a-z0-9]+$/);
      expect(mockVaultProvider.createFolder).toHaveBeenCalled();
      expect(mockVaultProvider.createFile).toHaveBeenCalled();
    });

    it('should throw error if name is empty', async () => {
      await expect(
        service.createGoal({ ...validParams, name: '' }),
      ).rejects.toThrow('Goal name cannot be empty');
    });

    it('should throw error if description is empty', async () => {
      await expect(
        service.createGoal({ ...validParams, description: '' }),
      ).rejects.toThrow('Goal description cannot be empty');
    });

    it('should throw error if deadline is empty', async () => {
      await expect(
        service.createGoal({ ...validParams, deadline: '' }),
      ).rejects.toThrow('Goal deadline cannot be empty');
    });

    it('should throw error if milestones array is empty', async () => {
      await expect(
        service.createGoal({ ...validParams, milestones: [] }),
      ).rejects.toThrow('Goal must have at least one milestone');
    });

    it('should create folder structure for goal', async () => {
      const goal = await service.createGoal(validParams);

      expect(mockVaultProvider.createFolder).toHaveBeenCalledWith(`ignite/${goal.id}`);
      expect(mockVaultProvider.createFolder).toHaveBeenCalledWith(
        `ignite/${goal.id}/conversations`,
      );
      expect(mockVaultProvider.createFolder).toHaveBeenCalledWith(
        `ignite/${goal.id}/qa-sessions`,
      );
    });
  });

  describe('getGoalById', () => {
    it('should return goal if it exists', async () => {
      const created = await service.createGoal({
        name: 'Test Goal',
        description: 'Test Description',
        deadline: '2025-12-31',
        milestones: [{ id: 'm1', title: 'Milestone 1', completed: false }],
      });

      const retrieved = await service.getGoalById(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('Test Goal');
    });

    it('should return null if goal does not exist', async () => {
      const result = await service.getGoalById('nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('getAllGoals', () => {
    it('should return empty array when no goals exist', async () => {
      const goals = await service.getAllGoals();
      expect(goals).toEqual([]);
    });

    it('should return all goals', async () => {
      await service.createGoal({
        name: 'Goal 1',
        description: 'Description 1',
        deadline: '2025-12-31',
        milestones: [{ id: 'm1', title: 'M1', completed: false }],
      });
      await service.createGoal({
        name: 'Goal 2',
        description: 'Description 2',
        deadline: '2025-12-31',
        milestones: [{ id: 'm2', title: 'M2', completed: false }],
      });

      const goals = await service.getAllGoals();
      expect(goals).toHaveLength(2);
      expect(goals.map((g) => g.name)).toContain('Goal 1');
      expect(goals.map((g) => g.name)).toContain('Goal 2');
    });

    it('should skip corrupted goals and return valid ones', async () => {
      await service.createGoal({
        name: 'Valid Goal',
        description: 'Description',
        deadline: '2025-12-31',
        milestones: [{ id: 'm1', title: 'M1', completed: false }],
      });

      // Add corrupted file
      storedFiles.set('ignite/corrupted-id/goal.md', 'invalid yaml');

      const goals = await service.getAllGoals();
      expect(goals).toHaveLength(1);
      expect(goals[0].name).toBe('Valid Goal');
    });
  });

  describe('updateGoal', () => {
    it('should update goal fields', async () => {
      const created = await service.createGoal({
        name: 'Original Name',
        description: 'Original Description',
        deadline: '2025-12-31',
        milestones: [{ id: 'm1', title: 'M1', completed: false }],
      });

      const updated = await service.updateGoal(created.id, {
        name: 'Updated Name',
        description: 'Updated Description',
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('Updated Description');
      expect(updated.id).toBe(created.id);
      expect(updated.createdAt).toBe(created.createdAt);
      expect(updated.updatedAt).not.toBe(created.updatedAt);
    });

    it('should throw error if goal does not exist', async () => {
      await expect(
        service.updateGoal('nonexistent-id', { name: 'New Name' }),
      ).rejects.toThrow('Goal not found: nonexistent-id');
    });
  });

  describe('deleteGoal', () => {
    it('should delete goal and its folder', async () => {
      const created = await service.createGoal({
        name: 'To Delete',
        description: 'Will be deleted',
        deadline: '2025-12-31',
        milestones: [{ id: 'm1', title: 'M1', completed: false }],
      });

      await service.deleteGoal(created.id);

      expect(mockVaultProvider.deleteFolder).toHaveBeenCalledWith(`ignite/${created.id}`);
      const retrieved = await service.getGoalById(created.id);
      expect(retrieved).toBeNull();
    });

    it('should throw error if goal does not exist', async () => {
      await expect(service.deleteGoal('nonexistent-id')).rejects.toThrow(
        'Goal not found: nonexistent-id',
      );
    });

    it('should prevent path traversal attacks', async () => {
      await expect(service.deleteGoal('../../../etc/passwd')).rejects.toThrow(
        'Invalid goal ID: cannot contain path separators',
      );
    });

    it('should prevent path traversal with backslashes', async () => {
      await expect(service.deleteGoal('..\\..\\dangerous')).rejects.toThrow(
        'Invalid goal ID: cannot contain path separators',
      );
    });

    it('should prevent parent directory references', async () => {
      await expect(service.deleteGoal('goal-..123')).rejects.toThrow(
        'Invalid goal ID: cannot contain path separators',
      );
    });
  });

  describe('completeGoal', () => {
    it('should mark goal as completed', async () => {
      const created = await service.createGoal({
        name: 'To Complete',
        description: 'Will be completed',
        deadline: '2025-12-31',
        milestones: [{ id: 'm1', title: 'M1', completed: false }],
      });

      const completed = await service.completeGoal(created.id);

      expect(completed.status).toBe('completed');
    });
  });

  describe('addNotesToGoal', () => {
    it('should add notes to goal', async () => {
      const created = await service.createGoal({
        name: 'Test Goal',
        description: 'Test',
        deadline: '2025-12-31',
        milestones: [{ id: 'm1', title: 'M1', completed: false }],
      });

      const updated = await service.addNotesToGoal(created.id, ['note1.md', 'note2.md']);

      expect(updated.notesPaths).toEqual(['note1.md', 'note2.md']);
    });

    it('should not add duplicate notes', async () => {
      const created = await service.createGoal({
        name: 'Test Goal',
        description: 'Test',
        deadline: '2025-12-31',
        milestones: [{ id: 'm1', title: 'M1', completed: false }],
        notesPaths: ['note1.md'],
      });

      const updated = await service.addNotesToGoal(created.id, ['note1.md', 'note2.md']);

      expect(updated.notesPaths).toHaveLength(2);
      expect(updated.notesPaths).toContain('note1.md');
      expect(updated.notesPaths).toContain('note2.md');
    });
  });

  describe('removeNotesFromGoal', () => {
    it('should remove notes from goal', async () => {
      const created = await service.createGoal({
        name: 'Test Goal',
        description: 'Test',
        deadline: '2025-12-31',
        milestones: [{ id: 'm1', title: 'M1', completed: false }],
        notesPaths: ['note1.md', 'note2.md', 'note3.md'],
      });

      const updated = await service.removeNotesFromGoal(created.id, ['note2.md']);

      expect(updated.notesPaths).toEqual(['note1.md', 'note3.md']);
    });
  });

  describe('updateMilestones', () => {
    it('should update milestones', async () => {
      const created = await service.createGoal({
        name: 'Test Goal',
        description: 'Test',
        deadline: '2025-12-31',
        milestones: [{ id: 'm1', title: 'Original', completed: false }],
      });

      const newMilestones: Milestone[] = [
        { id: 'm1', title: 'Updated', completed: true },
        { id: 'm2', title: 'New', completed: false },
      ];

      const updated = await service.updateMilestones(created.id, newMilestones);

      expect(updated.milestones).toEqual(newMilestones);
    });
  });
});
