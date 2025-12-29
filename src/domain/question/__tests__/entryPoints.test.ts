import type { TrackedConcept } from '@/domain/llm/types';
import type { IVaultProvider } from '@/ports/IVaultProvider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getNotesDueForReview,
  getNotesForAllConcepts,
  getNotesForConcept,
  getNotesForDirectSelection,
  getNotesForTimeFilter,
  getTimeCutoff,
  isNoteDue,
  resolveNotesForEntry,
} from '../entryPoints';
import type { DerivedNoteStats } from '../types';
import { EMPTY_DERIVED_STATS } from '../types';

describe('getTimeCutoff', () => {
  const now = Date.now();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 3 days ago for last_3_days', () => {
    const cutoff = getTimeCutoff('last_3_days');
    expect(now - cutoff).toBe(3 * 24 * 60 * 60 * 1000);
  });

  it('returns 7 days ago for last_week', () => {
    const cutoff = getTimeCutoff('last_week');
    expect(now - cutoff).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('returns 14 days ago for last_2_weeks', () => {
    const cutoff = getTimeCutoff('last_2_weeks');
    expect(now - cutoff).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('returns 30 days ago for last_month', () => {
    const cutoff = getTimeCutoff('last_month');
    expect(now - cutoff).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe('getNotesForTimeFilter', () => {
  const now = Date.now();
  const mockVault: IVaultProvider = {
    listMarkdownFiles: vi.fn(),
    readFile: vi.fn(),
    exists: vi.fn(),
    getBasename: vi.fn(),
    getFolder: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.mocked(mockVault.listMarkdownFiles).mockResolvedValue([
      {
        path: 'recent.md',
        basename: 'recent',
        folder: '',
        createdAt: now - 1 * 24 * 60 * 60 * 1000, // 1 day ago
        modifiedAt: now - 1 * 24 * 60 * 60 * 1000,
      },
      {
        path: 'old.md',
        basename: 'old',
        folder: '',
        createdAt: now - 10 * 24 * 60 * 60 * 1000, // 10 days ago
        modifiedAt: now - 10 * 24 * 60 * 60 * 1000,
      },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it('filters by modified date for last_week', async () => {
    const result = await getNotesForTimeFilter(
      { range: 'last_week', dateType: 'modified' },
      mockVault,
    );
    expect(result).toContain('recent.md');
    expect(result).not.toContain('old.md');
  });

  it('filters by created date', async () => {
    const result = await getNotesForTimeFilter(
      { range: 'last_week', dateType: 'created' },
      mockVault,
    );
    expect(result).toContain('recent.md');
    expect(result).not.toContain('old.md');
  });
});

describe('getNotesForConcept', () => {
  it('returns empty array for non-existent concept', async () => {
    const loadConcept = vi.fn().mockResolvedValue(null);
    const result = await getNotesForConcept('nonexistent', loadConcept);
    expect(result).toEqual([]);
  });

  it('returns effective note IDs for existing concept', async () => {
    const concept: TrackedConcept = {
      id: 'concept1',
      canonicalName: 'Test Concept',
      noteIds: ['a.md', 'b.md'],
      quizzabilityScore: 0.8,
      clusterId: 'cluster1',
      metadata: { createdAt: Date.now(), lastUpdated: Date.now() },
      evolutionHistory: [],
    };
    const loadConcept = vi.fn().mockResolvedValue(concept);

    const result = await getNotesForConcept('concept1', loadConcept);
    expect(result).toEqual(['a.md', 'b.md']);
  });
});

describe('getNotesForAllConcepts', () => {
  it('returns empty array for no concepts', () => {
    const result = getNotesForAllConcepts([]);
    expect(result).toEqual([]);
  });

  it('returns unique notes from all concepts', () => {
    const concepts: TrackedConcept[] = [
      {
        id: 'c1',
        canonicalName: 'C1',
        noteIds: ['a.md', 'b.md'],
        quizzabilityScore: 0.8,
        clusterId: 'cluster1',
        metadata: { createdAt: Date.now(), lastUpdated: Date.now() },
        evolutionHistory: [],
      },
      {
        id: 'c2',
        canonicalName: 'C2',
        noteIds: ['b.md', 'c.md'], // b.md is shared
        quizzabilityScore: 0.7,
        clusterId: 'cluster2',
        metadata: { createdAt: Date.now(), lastUpdated: Date.now() },
        evolutionHistory: [],
      },
    ];

    const result = getNotesForAllConcepts(concepts);
    expect(result).toHaveLength(3);
    expect(result).toContain('a.md');
    expect(result).toContain('b.md');
    expect(result).toContain('c.md');
  });
});

describe('isNoteDue', () => {
  it('returns true for never-quizzed notes', () => {
    expect(isNoteDue(EMPTY_DERIVED_STATS)).toBe(true);
  });

  it('returns true when days since quiz >= target interval', () => {
    const stats: DerivedNoteStats = {
      lastQuizzed: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
      quizCount: 1,
      correctCount: 0,
      correctStreak: 0, // Interval = 1 day
    };
    expect(isNoteDue(stats)).toBe(true);
  });

  it('returns false when not yet due', () => {
    const stats: DerivedNoteStats = {
      lastQuizzed: Date.now() - 5 * 24 * 60 * 60 * 1000, // 5 days ago
      quizCount: 3,
      correctCount: 3,
      correctStreak: 3, // Interval = 14 days
    };
    expect(isNoteDue(stats)).toBe(false);
  });
});

describe('getNotesDueForReview', () => {
  it('returns all never-quizzed notes', async () => {
    const concepts: TrackedConcept[] = [
      {
        id: 'c1',
        canonicalName: 'C1',
        noteIds: ['a.md', 'b.md'],
        quizzabilityScore: 0.8,
        clusterId: 'cluster1',
        metadata: { createdAt: Date.now(), lastUpdated: Date.now() },
        evolutionHistory: [],
      },
    ];
    const deriveNoteStats = vi.fn().mockResolvedValue(EMPTY_DERIVED_STATS);

    const result = await getNotesDueForReview(concepts, deriveNoteStats);
    expect(result).toEqual(['a.md', 'b.md']);
  });

  it('filters out notes not due', async () => {
    const concepts: TrackedConcept[] = [
      {
        id: 'c1',
        canonicalName: 'C1',
        noteIds: ['due.md', 'not-due.md'],
        quizzabilityScore: 0.8,
        clusterId: 'cluster1',
        metadata: { createdAt: Date.now(), lastUpdated: Date.now() },
        evolutionHistory: [],
      },
    ];
    const deriveNoteStats = vi.fn().mockImplementation((noteId: string) => {
      if (noteId === 'due.md') {
        return Promise.resolve(EMPTY_DERIVED_STATS);
      }
      return Promise.resolve({
        lastQuizzed: Date.now(),
        quizCount: 1,
        correctCount: 1,
        correctStreak: 1,
      });
    });

    const result = await getNotesDueForReview(concepts, deriveNoteStats);
    expect(result).toEqual(['due.md']);
  });
});

describe('getNotesForDirectSelection', () => {
  const mockVault: IVaultProvider = {
    listMarkdownFiles: vi.fn(),
    readFile: vi.fn(),
    exists: vi.fn(),
    getBasename: vi.fn(),
    getFolder: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('filters out non-existent notes', async () => {
    vi.mocked(mockVault.exists).mockImplementation((path) => Promise.resolve(path === 'exists.md'));

    const result = await getNotesForDirectSelection(['exists.md', 'missing.md'], mockVault);
    expect(result).toEqual(['exists.md']);
  });

  it('returns all existing notes', async () => {
    vi.mocked(mockVault.exists).mockResolvedValue(true);

    const result = await getNotesForDirectSelection(['a.md', 'b.md'], mockVault);
    expect(result).toEqual(['a.md', 'b.md']);
  });
});

describe('resolveNotesForEntry', () => {
  const mockDeps = {
    vault: {
      listMarkdownFiles: vi.fn().mockResolvedValue([]),
      readFile: vi.fn(),
      exists: vi.fn().mockResolvedValue(true),
      getBasename: vi.fn(),
      getFolder: vi.fn(),
    } as IVaultProvider,
    loadConcept: vi.fn(),
    loadAllConcepts: vi.fn().mockResolvedValue([]),
    deriveNoteStats: vi.fn().mockResolvedValue(EMPTY_DERIVED_STATS),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(mockDeps.vault.exists).mockResolvedValue(true);
    vi.mocked(mockDeps.loadAllConcepts).mockResolvedValue([]);
    vi.mocked(mockDeps.deriveNoteStats).mockResolvedValue(EMPTY_DERIVED_STATS);
  });

  it('handles concept entry point', async () => {
    const concept: TrackedConcept = {
      id: 'c1',
      canonicalName: 'Test',
      noteIds: ['a.md'],
      quizzabilityScore: 0.8,
      clusterId: 'cluster1',
      metadata: { createdAt: Date.now(), lastUpdated: Date.now() },
      evolutionHistory: [],
    };
    mockDeps.loadConcept.mockResolvedValue(concept);

    const result = await resolveNotesForEntry({ type: 'concept', conceptId: 'c1' }, mockDeps);
    expect(result).toEqual(['a.md']);
  });

  it('handles all_concepts entry point', async () => {
    const concepts: TrackedConcept[] = [
      {
        id: 'c1',
        canonicalName: 'C1',
        noteIds: ['a.md'],
        quizzabilityScore: 0.8,
        clusterId: 'cluster1',
        metadata: { createdAt: Date.now(), lastUpdated: Date.now() },
        evolutionHistory: [],
      },
    ];
    vi.mocked(mockDeps.loadAllConcepts).mockResolvedValue(concepts);

    const result = await resolveNotesForEntry({ type: 'all_concepts' }, mockDeps);
    expect(result).toEqual(['a.md']);
  });

  it('handles specific_notes entry point', async () => {
    const result = await resolveNotesForEntry(
      { type: 'specific_notes', noteIds: ['a.md', 'b.md'] },
      mockDeps,
    );
    expect(result).toEqual(['a.md', 'b.md']);
  });

  it('throws for search without searchNotes function', async () => {
    await expect(resolveNotesForEntry({ type: 'search', query: 'test' }, mockDeps)).rejects.toThrow(
      'Search not available',
    );
  });

  it('handles search entry point with searchNotes function', async () => {
    const depsWithSearch = {
      ...mockDeps,
      searchNotes: vi.fn().mockResolvedValue(['found.md']),
    };

    const result = await resolveNotesForEntry({ type: 'search', query: 'test' }, depsWithSearch);
    expect(result).toEqual(['found.md']);
    expect(depsWithSearch.searchNotes).toHaveBeenCalledWith('test');
  });
});
