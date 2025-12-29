/**
 * Quiz Entry Points Module
 *
 * Handles resolving notes for different quiz entry points.
 * Users can start quizzes through multiple paths (by concept, time filter, etc.)
 */

import { getEffectiveNoteIds } from '@/domain/llm/getEffectiveNoteIds';
import type { TrackedConcept } from '@/domain/llm/types';
import type { IVaultProvider } from '@/ports/IVaultProvider';
import type { DerivedNoteStats, QuizEntryPoint, TimeFilter } from './types';

// ============ Time-Based Filtering ============

/**
 * Get time cutoff for a filter range
 */
export function getTimeCutoff(range: TimeFilter['range']): number {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  switch (range) {
    case 'last_3_days':
      return now - 3 * day;
    case 'last_week':
      return now - 7 * day;
    case 'last_2_weeks':
      return now - 14 * day;
    case 'last_month':
      return now - 30 * day;
  }
}

/**
 * Get notes matching a time filter
 */
export async function getNotesForTimeFilter(
  filter: TimeFilter,
  vault: IVaultProvider,
): Promise<string[]> {
  const cutoff = getTimeCutoff(filter.range);
  const files = await vault.listMarkdownFiles();

  return files
    .filter((file) => {
      const date = filter.dateType === 'created' ? file.createdAt : file.modifiedAt;
      return date >= cutoff;
    })
    .map((file) => file.path);
}

// ============ Concept-Based Entry ============

/**
 * Get notes for a single concept (applies manual overrides)
 */
export async function getNotesForConcept(
  conceptId: string,
  loadConcept: (id: string) => Promise<TrackedConcept | null>,
): Promise<string[]> {
  const concept = await loadConcept(conceptId);
  if (!concept) return [];
  return getEffectiveNoteIds(concept);
}

/**
 * Get notes for all tracked concepts
 */
export function getNotesForAllConcepts(concepts: TrackedConcept[]): string[] {
  const allNotes = new Set<string>();

  for (const concept of concepts) {
    const notes = getEffectiveNoteIds(concept);
    for (const noteId of notes) {
      allNotes.add(noteId);
    }
  }

  return [...allNotes];
}

// ============ Due for Review Entry ============

/**
 * Spaced repetition intervals (days)
 */
const SPACED_REP_INTERVALS = [1, 3, 7, 14, 30, 60, 120];

/**
 * Check if a note is due for review based on spaced rep
 */
export function isNoteDue(stats: DerivedNoteStats): boolean {
  if (stats.lastQuizzed === null) return true; // Never quizzed = due

  const daysSinceQuiz = (Date.now() - stats.lastQuizzed) / (1000 * 60 * 60 * 24);
  const targetInterval = SPACED_REP_INTERVALS[Math.min(stats.correctStreak, 6)];

  return daysSinceQuiz >= targetInterval;
}

/**
 * Get notes due for review from all concepts
 */
export async function getNotesDueForReview(
  concepts: TrackedConcept[],
  deriveNoteStats: (noteId: string) => Promise<DerivedNoteStats>,
): Promise<string[]> {
  const dueNotes: string[] = [];

  for (const concept of concepts) {
    const notes = getEffectiveNoteIds(concept);

    for (const noteId of notes) {
      const stats = await deriveNoteStats(noteId);
      if (isNoteDue(stats)) {
        dueNotes.push(noteId);
      }
    }
  }

  return dueNotes;
}

// ============ Direct Note Selection ============

/**
 * Validate and return existing notes from a list
 */
export async function getNotesForDirectSelection(
  noteIds: string[],
  vault: IVaultProvider,
): Promise<string[]> {
  const existing = await Promise.all(
    noteIds.map(async (id) => ({
      id,
      exists: await vault.exists(id),
    })),
  );

  return existing.filter((n) => n.exists).map((n) => n.id);
}

// ============ Unified Entry Point Resolver ============

export interface EntryPointDependencies {
  vault: IVaultProvider;
  loadConcept: (id: string) => Promise<TrackedConcept | null>;
  loadAllConcepts: () => Promise<TrackedConcept[]>;
  deriveNoteStats: (noteId: string) => Promise<DerivedNoteStats>;
  searchNotes?: (query: string) => Promise<string[]>;
}

/**
 * Resolve notes for any entry point type
 */
export async function resolveNotesForEntry(
  entry: QuizEntryPoint,
  deps: EntryPointDependencies,
): Promise<string[]> {
  switch (entry.type) {
    case 'concept': {
      return getNotesForConcept(entry.conceptId, deps.loadConcept);
    }

    case 'all_concepts': {
      const concepts = await deps.loadAllConcepts();
      return getNotesForAllConcepts(concepts);
    }

    case 'due_for_review': {
      const concepts = await deps.loadAllConcepts();
      return getNotesDueForReview(concepts, deps.deriveNoteStats);
    }

    case 'time_filter': {
      return getNotesForTimeFilter(entry.filter, deps.vault);
    }

    case 'specific_notes': {
      return getNotesForDirectSelection(entry.noteIds, deps.vault);
    }

    case 'search': {
      if (!deps.searchNotes) {
        throw new Error('Search not available');
      }
      return deps.searchNotes(entry.query);
    }
  }
}
