import type { Cluster } from '@/domain/clustering/types';
import {
  createConceptFromResult,
  filterNonQuizzableConcepts,
  filterQuizzableConcepts,
  processConceptNaming,
} from '@/domain/llm/processConceptNaming';
import type { ConceptNamingResult, TrackedConcept } from '@/domain/llm/types';
import { describe, expect, it } from 'vitest';

describe('processConceptNaming', () => {
  const createCluster = (id: string, noteIds: string[]): Cluster => ({
    id,
    candidateNames: [`Candidate for ${id}`],
    noteIds,
    dominantTags: [],
    folderPath: '',
    internalLinkDensity: 0,
    createdAt: Date.now(),
    reasons: [],
  });

  const createResult = (
    clusterId: string,
    canonicalName: string,
    overrides: Partial<ConceptNamingResult> = {},
  ): ConceptNamingResult => ({
    clusterId,
    canonicalName,
    quizzabilityScore: 0.8,
    suggestedMerges: [],
    misfitNotes: [],
    ...overrides,
  });

  describe('processConceptNaming', () => {
    it('should create TrackedConcepts from clusters and results', () => {
      const clusters = [
        createCluster('cluster-1', ['note-1.md', 'note-2.md']),
        createCluster('cluster-2', ['note-3.md']),
      ];

      const results = [
        createResult('cluster-1', 'React Development'),
        createResult('cluster-2', 'TypeScript', { quizzabilityScore: 0.9 }),
      ];

      const { concepts } = processConceptNaming(clusters, results);

      expect(concepts).toHaveLength(2);
      expect(concepts[0].canonicalName).toBe('React Development');
      expect(concepts[0].noteIds).toEqual(['note-1.md', 'note-2.md']);
      expect(concepts[0].clusterId).toBe('cluster-1');

      expect(concepts[1].canonicalName).toBe('TypeScript');
      expect(concepts[1].quizzabilityScore).toBe(0.9);
    });

    it('should handle non-quizzable concepts (score < 0.4)', () => {
      const clusters = [createCluster('cluster-1', ['note-1.md'])];

      const results = [
        createResult('cluster-1', 'Meeting Notes', {
          quizzabilityScore: 0.1,
          nonQuizzableReason: 'Ephemeral content',
        }),
      ];

      const { concepts } = processConceptNaming(clusters, results);

      expect(concepts[0].quizzabilityScore).toBe(0.1);
      // Note: quizzability is now derived from score, not stored
    });

    it('should merge clusters based on suggestedMerges', () => {
      const clusters = [
        createCluster('cluster-1', ['note-1.md', 'note-2.md']),
        createCluster('cluster-2', ['note-3.md', 'note-4.md']),
      ];

      const results = [
        createResult('cluster-1', 'React Development', {
          suggestedMerges: ['cluster-2'],
        }),
        createResult('cluster-2', 'React Hooks'),
      ];

      const { concepts } = processConceptNaming(clusters, results);

      expect(concepts).toHaveLength(1);
      expect(concepts[0].canonicalName).toBe('React Development');
      expect(concepts[0].noteIds).toHaveLength(4);
      expect(concepts[0].noteIds).toContain('note-1.md');
      expect(concepts[0].noteIds).toContain('note-3.md');
      expect(concepts[0].clusterId).toBe('cluster-1');
    });

    it('should handle multiple merge targets', () => {
      const clusters = [
        createCluster('cluster-1', ['note-1.md']),
        createCluster('cluster-2', ['note-2.md']),
        createCluster('cluster-3', ['note-3.md']),
      ];

      const results = [
        createResult('cluster-1', 'JavaScript', {
          suggestedMerges: ['cluster-2', 'cluster-3'],
        }),
        createResult('cluster-2', 'JS'),
        createResult('cluster-3', 'ES6'),
      ];

      const { concepts } = processConceptNaming(clusters, results);

      expect(concepts).toHaveLength(1);
      expect(concepts[0].noteIds).toHaveLength(3);
    });

    it('should handle missing results with defaults', () => {
      const clusters = [
        createCluster('cluster-1', ['note-1.md']),
        createCluster('cluster-2', ['note-2.md']),
      ];

      const results = [createResult('cluster-1', 'React Development')];

      const { concepts } = processConceptNaming(clusters, results);

      expect(concepts).toHaveLength(2);
      expect(concepts[0].canonicalName).toBe('React Development');
      expect(concepts[1].canonicalName).toBe('Candidate for cluster-2'); // Falls back to candidate name
    });

    it('should handle empty clusters', () => {
      const { concepts, misfitNotes } = processConceptNaming([], []);
      expect(concepts).toEqual([]);
      expect(misfitNotes).toEqual([]);
    });

    it('should collect and filter out misfit notes', () => {
      const clusters = [createCluster('cluster-1', ['note-1.md', 'grocery-list.md', 'note-2.md'])];

      const results = [
        createResult('cluster-1', 'React Development', {
          misfitNotes: [{ noteId: 'grocery-list.md', reason: 'Not programming content' }],
        }),
      ];

      const { concepts, misfitNotes } = processConceptNaming(clusters, results);

      expect(misfitNotes).toHaveLength(1);
      expect(misfitNotes[0].noteId).toBe('grocery-list.md');

      // Misfit note should be filtered out of concept
      expect(concepts[0].noteIds).not.toContain('grocery-list.md');
      expect(concepts[0].noteIds).toHaveLength(2);
    });

    it('should not create concept if all notes are misfits', () => {
      const clusters = [createCluster('cluster-1', ['misfit-1.md', 'misfit-2.md'])];

      const results = [
        createResult('cluster-1', 'Mixed Content', {
          misfitNotes: [
            { noteId: 'misfit-1.md', reason: 'Not relevant' },
            { noteId: 'misfit-2.md', reason: 'Not relevant' },
          ],
        }),
      ];

      const { concepts } = processConceptNaming(clusters, results);

      expect(concepts).toHaveLength(0);
    });

    it('should initialize empty evolutionHistory', () => {
      const clusters = [createCluster('cluster-1', ['note-1.md'])];
      const results = [createResult('cluster-1', 'Test Concept')];

      const { concepts } = processConceptNaming(clusters, results);

      expect(concepts[0].evolutionHistory).toEqual([]);
    });

    it('should set metadata timestamps', () => {
      const clusters = [createCluster('cluster-1', ['note-1.md'])];
      const results = [createResult('cluster-1', 'Test Concept')];

      const before = Date.now();
      const { concepts } = processConceptNaming(clusters, results);
      const after = Date.now();

      expect(concepts[0].metadata.createdAt).toBeGreaterThanOrEqual(before);
      expect(concepts[0].metadata.createdAt).toBeLessThanOrEqual(after);
      expect(concepts[0].metadata.lastUpdated).toBe(concepts[0].metadata.createdAt);
    });
  });

  describe('createConceptFromResult', () => {
    it('should create a TrackedConcept from result and cluster', () => {
      const cluster = createCluster('cluster-1', ['note-1.md', 'note-2.md']);
      const result = createResult('cluster-1', 'React Development', {
        quizzabilityScore: 0.85,
      });

      const concept = createConceptFromResult(result, cluster);

      expect(concept.canonicalName).toBe('React Development');
      expect(concept.noteIds).toEqual(['note-1.md', 'note-2.md']);
      expect(concept.quizzabilityScore).toBe(0.85);
      expect(concept.clusterId).toBe('cluster-1');
    });

    it('should exclude misfit notes when creating concept', () => {
      const cluster = createCluster('cluster-1', ['note-1.md', 'misfit.md', 'note-2.md']);
      const result = createResult('cluster-1', 'React Development');

      const excludeMisfits = new Set(['misfit.md']);
      const concept = createConceptFromResult(result, cluster, excludeMisfits);

      expect(concept.noteIds).toEqual(['note-1.md', 'note-2.md']);
    });
  });

  describe('filterQuizzableConcepts', () => {
    it('should filter to only quizzable concepts (score >= 0.4)', () => {
      const now = Date.now();
      const concepts: TrackedConcept[] = [
        {
          id: '1',
          canonicalName: 'React',
          noteIds: [],
          quizzabilityScore: 0.9,
          clusterId: 'cluster-1',
          metadata: { createdAt: now, lastUpdated: now },
          evolutionHistory: [],
        },
        {
          id: '2',
          canonicalName: 'Meetings',
          noteIds: [],
          quizzabilityScore: 0.1,
          clusterId: 'cluster-2',
          metadata: { createdAt: now, lastUpdated: now },
          evolutionHistory: [],
        },
      ];

      const quizzable = filterQuizzableConcepts(concepts);

      expect(quizzable).toHaveLength(1);
      expect(quizzable[0].canonicalName).toBe('React');
    });

    it('should include concepts at threshold (0.4)', () => {
      const now = Date.now();
      const concepts: TrackedConcept[] = [
        {
          id: '1',
          canonicalName: 'Borderline',
          noteIds: [],
          quizzabilityScore: 0.4,
          clusterId: 'cluster-1',
          metadata: { createdAt: now, lastUpdated: now },
          evolutionHistory: [],
        },
      ];

      const quizzable = filterQuizzableConcepts(concepts);
      expect(quizzable).toHaveLength(1);
    });
  });

  describe('filterNonQuizzableConcepts', () => {
    it('should filter to only non-quizzable concepts (score < 0.4)', () => {
      const now = Date.now();
      const concepts: TrackedConcept[] = [
        {
          id: '1',
          canonicalName: 'React',
          noteIds: [],
          quizzabilityScore: 0.9,
          clusterId: 'cluster-1',
          metadata: { createdAt: now, lastUpdated: now },
          evolutionHistory: [],
        },
        {
          id: '2',
          canonicalName: 'Meetings',
          noteIds: [],
          quizzabilityScore: 0.1,
          clusterId: 'cluster-2',
          metadata: { createdAt: now, lastUpdated: now },
          evolutionHistory: [],
        },
      ];

      const nonQuizzable = filterNonQuizzableConcepts(concepts);

      expect(nonQuizzable).toHaveLength(1);
      expect(nonQuizzable[0].canonicalName).toBe('Meetings');
    });

    it('should exclude concepts at threshold (0.4)', () => {
      const now = Date.now();
      const concepts: TrackedConcept[] = [
        {
          id: '1',
          canonicalName: 'Borderline',
          noteIds: [],
          quizzabilityScore: 0.4,
          clusterId: 'cluster-1',
          metadata: { createdAt: now, lastUpdated: now },
          evolutionHistory: [],
        },
      ];

      const nonQuizzable = filterNonQuizzableConcepts(concepts);
      expect(nonQuizzable).toHaveLength(0);
    });
  });
});
