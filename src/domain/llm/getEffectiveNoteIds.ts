/**
 * Get Effective Note IDs for a Concept
 *
 * Computes the effective note IDs for a concept, applying manual overrides if present.
 * Effective = (clusterNoteIds ∪ addedNotes) - removedNotes
 *
 * This is a forward-compatible implementation that works with the current TrackedConcept
 * structure and will seamlessly support manual overrides when that feature is added.
 */

import type { TrackedConcept } from './types';

/**
 * Manual overrides for concept membership
 * Added here for forward compatibility - will be added to TrackedConcept later
 */
export interface ManualOverrides {
  /** Notes manually added to this concept */
  addedNotes: string[];
  /** Notes manually removed from this concept */
  removedNotes: string[];
}

/**
 * Extended TrackedConcept with optional manual overrides
 * This type allows the function to work with both current and future TrackedConcept versions
 */
type ConceptWithOverrides = TrackedConcept & {
  manualOverrides?: ManualOverrides;
};

/**
 * Computes the effective note IDs for a concept, applying manual overrides.
 * Effective = (clusterNoteIds ∪ addedNotes) - removedNotes
 *
 * @param concept - The tracked concept (with optional manual overrides)
 * @returns Array of effective note IDs
 */
export function getEffectiveNoteIds(concept: ConceptWithOverrides): string[] {
  const fromCluster = new Set(concept.noteIds);

  // Add manually added notes (if overrides exist)
  if (concept.manualOverrides?.addedNotes) {
    for (const noteId of concept.manualOverrides.addedNotes) {
      fromCluster.add(noteId);
    }
  }

  // Remove manually removed notes (if overrides exist)
  if (concept.manualOverrides?.removedNotes) {
    for (const noteId of concept.manualOverrides.removedNotes) {
      fromCluster.delete(noteId);
    }
  }

  return [...fromCluster];
}
