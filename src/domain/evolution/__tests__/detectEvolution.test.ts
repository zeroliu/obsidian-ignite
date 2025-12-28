import type { Cluster } from '@/domain/clustering/types';
import {
  classifyEvolution,
  detectEvolution,
  findEvolutionForCluster,
  groupEvolutionsByType,
} from '@/domain/evolution/detectEvolution';
import { describe, expect, it } from 'vitest';

describe('detectEvolution', () => {
  const createCluster = (id: string, noteIds: string[]): Cluster => ({
    id,
    noteIds,
    candidateNames: [],
    dominantTags: [],
    folderPath: '',
    internalLinkDensity: 0,
    createdAt: Date.now(),
    reasons: [],
  });

  describe('classifyEvolution', () => {
    it('should classify as rename when score >= 0.6', () => {
      expect(classifyEvolution(0.6)).toBe('rename');
      expect(classifyEvolution(0.8)).toBe('rename');
      expect(classifyEvolution(1.0)).toBe('rename');
    });

    it('should classify as remap when 0.2 <= score < 0.6', () => {
      expect(classifyEvolution(0.2)).toBe('remap');
      expect(classifyEvolution(0.4)).toBe('remap');
      expect(classifyEvolution(0.59)).toBe('remap');
    });

    it('should classify as dissolved when score < 0.2', () => {
      expect(classifyEvolution(0.0)).toBe('dissolved');
      expect(classifyEvolution(0.1)).toBe('dissolved');
      expect(classifyEvolution(0.19)).toBe('dissolved');
    });

    it('should use custom thresholds', () => {
      const customConfig = {
        renameThreshold: 0.8,
        remapThreshold: 0.4,
      };

      expect(classifyEvolution(0.9, customConfig)).toBe('rename');
      expect(classifyEvolution(0.7, customConfig)).toBe('remap');
      expect(classifyEvolution(0.3, customConfig)).toBe('dissolved');
    });
  });

  describe('detectEvolution', () => {
    it('should detect rename when cluster has high overlap', () => {
      const oldClusters = [createCluster('old-1', ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'])];
      const newClusters = [createCluster('new-1', ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'])];

      const result = detectEvolution(oldClusters, newClusters);

      expect(result.evolutions).toHaveLength(1);
      expect(result.evolutions[0].type).toBe('rename');
      expect(result.evolutions[0].oldClusterId).toBe('old-1');
      expect(result.evolutions[0].newClusterId).toBe('new-1');
      expect(result.evolutions[0].overlapScore).toBe(1);
    });

    it('should detect remap when cluster has medium overlap', () => {
      // 3 common out of 5 in old, 5 in new = 3/7 ≈ 0.43 (remap)
      const oldClusters = [createCluster('old-1', ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'])];
      const newClusters = [createCluster('new-1', ['a.md', 'b.md', 'c.md', 'x.md', 'y.md'])];

      const result = detectEvolution(oldClusters, newClusters);

      expect(result.evolutions).toHaveLength(1);
      expect(result.evolutions[0].type).toBe('remap');
      expect(result.evolutions[0].overlapScore).toBeCloseTo(3 / 7);
    });

    it('should detect dissolved when cluster has low overlap', () => {
      const oldClusters = [createCluster('old-1', ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'])];
      const newClusters = [createCluster('new-1', ['x.md', 'y.md', 'z.md'])];

      const result = detectEvolution(oldClusters, newClusters);

      expect(result.evolutions).toHaveLength(1);
      expect(result.evolutions[0].type).toBe('dissolved');
      expect(result.evolutions[0].newClusterId).toBeNull();
      expect(result.dissolved).toContain('old-1');
    });

    it('should identify new clusters that did not exist before', () => {
      const oldClusters = [createCluster('old-1', ['a.md', 'b.md'])];
      const newClusters = [
        createCluster('new-1', ['a.md', 'b.md']),
        createCluster('new-2', ['x.md', 'y.md']),
      ];

      const result = detectEvolution(oldClusters, newClusters);

      expect(result.newClusters).toContain('new-2');
      expect(result.newClusters).not.toContain('new-1');
    });

    it('should handle empty old clusters', () => {
      const newClusters = [createCluster('new-1', ['a.md', 'b.md'])];

      const result = detectEvolution([], newClusters);

      expect(result.evolutions).toHaveLength(0);
      expect(result.dissolved).toHaveLength(0);
      expect(result.newClusters).toContain('new-1');
    });

    it('should handle empty new clusters', () => {
      const oldClusters = [createCluster('old-1', ['a.md', 'b.md'])];

      const result = detectEvolution(oldClusters, []);

      expect(result.evolutions).toHaveLength(1);
      expect(result.evolutions[0].type).toBe('dissolved');
      expect(result.dissolved).toContain('old-1');
      expect(result.newClusters).toHaveLength(0);
    });

    it('should handle multiple old clusters mapping to same new cluster', () => {
      const oldClusters = [
        createCluster('old-1', ['a.md', 'b.md']),
        createCluster('old-2', ['c.md', 'd.md']),
      ];
      const newClusters = [createCluster('new-1', ['a.md', 'b.md', 'c.md', 'd.md'])];

      const result = detectEvolution(oldClusters, newClusters);

      expect(result.evolutions).toHaveLength(2);
      // Both old clusters should map to the same new cluster
      expect(result.evolutions.filter((e) => e.newClusterId === 'new-1')).toHaveLength(2);
    });

    it('should use custom thresholds', () => {
      // 4 common out of 5 = 0.8 Jaccard
      const oldClusters = [createCluster('old-1', ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'])];
      const newClusters = [createCluster('new-1', ['a.md', 'b.md', 'c.md', 'd.md'])];

      const strictConfig = { renameThreshold: 0.9, remapThreshold: 0.5 };
      const result = detectEvolution(oldClusters, newClusters, strictConfig);

      // 4/5 = 0.8, which is < 0.9, so it should be remap
      expect(result.evolutions[0].type).toBe('remap');
    });

    describe('tiebreaker logic', () => {
      it('should use alphabetical ID as tiebreaker when scores and sizes are equal', () => {
        // Old: [shared] (1 note)
        // new-b: [shared, x] -> Jaccard = 1/2
        // new-a: [shared, y] -> Jaccard = 1/2 (equal score, equal size)
        const oldClusters = [createCluster('old-1', ['shared'])];
        const newClusters = [
          createCluster('new-b', ['shared', 'x']),
          createCluster('new-a', ['shared', 'y']),
        ];

        const result = detectEvolution(oldClusters, newClusters);

        // With equal scores and equal sizes, should prefer alphabetically earlier ID
        expect(result.evolutions[0].newClusterId).toBe('new-a');
      });

      it('should prefer identical clusters with alphabetical tiebreaker', () => {
        // Two clusters with identical content -> Jaccard = 1.0 for both
        const oldClusters = [createCluster('old-1', ['a', 'b'])];
        const newClusters = [
          createCluster('new-z', ['a', 'b']),
          createCluster('new-a', ['a', 'b']),
        ];

        const result = detectEvolution(oldClusters, newClusters);

        // Same score (1.0), same size (2) -> alphabetical wins
        expect(result.evolutions[0].newClusterId).toBe('new-a');
      });

      it('should produce deterministic results regardless of input order', () => {
        const oldClusters = [createCluster('old-1', ['shared'])];

        // Test with different orderings of the same clusters
        const newClustersOrder1 = [
          createCluster('new-b', ['shared', 'x']),
          createCluster('new-a', ['shared', 'y']),
        ];

        const newClustersOrder2 = [
          createCluster('new-a', ['shared', 'y']),
          createCluster('new-b', ['shared', 'x']),
        ];

        const result1 = detectEvolution(oldClusters, newClustersOrder1);
        const result2 = detectEvolution(oldClusters, newClustersOrder2);

        // Both should pick the same cluster regardless of input order
        expect(result1.evolutions[0].newClusterId).toBe(result2.evolutions[0].newClusterId);
        expect(result1.evolutions[0].newClusterId).toBe('new-a');
      });
    });
  });

  describe('findEvolutionForCluster', () => {
    it('should find evolution for a specific cluster', () => {
      const evolutions = [
        {
          oldClusterId: 'old-1',
          newClusterId: 'new-1',
          overlapScore: 0.8,
          type: 'rename' as const,
        },
        {
          oldClusterId: 'old-2',
          newClusterId: null,
          overlapScore: 0.1,
          type: 'dissolved' as const,
        },
      ];

      const found = findEvolutionForCluster('old-1', evolutions);

      expect(found).toBeDefined();
      expect(found!.newClusterId).toBe('new-1');
    });

    it('should return undefined for unknown cluster', () => {
      const evolutions = [
        {
          oldClusterId: 'old-1',
          newClusterId: 'new-1',
          overlapScore: 0.8,
          type: 'rename' as const,
        },
      ];

      const found = findEvolutionForCluster('unknown', evolutions);

      expect(found).toBeUndefined();
    });
  });

  describe('groupEvolutionsByType', () => {
    it('should group evolutions by type', () => {
      const evolutions = [
        {
          oldClusterId: 'old-1',
          newClusterId: 'new-1',
          overlapScore: 0.8,
          type: 'rename' as const,
        },
        { oldClusterId: 'old-2', newClusterId: 'new-2', overlapScore: 0.4, type: 'remap' as const },
        {
          oldClusterId: 'old-3',
          newClusterId: null,
          overlapScore: 0.1,
          type: 'dissolved' as const,
        },
        {
          oldClusterId: 'old-4',
          newClusterId: 'new-4',
          overlapScore: 0.9,
          type: 'rename' as const,
        },
      ];

      const groups = groupEvolutionsByType(evolutions);

      expect(groups.rename).toHaveLength(2);
      expect(groups.remap).toHaveLength(1);
      expect(groups.dissolved).toHaveLength(1);
    });

    it('should handle empty evolutions', () => {
      const groups = groupEvolutionsByType([]);

      expect(groups.rename).toHaveLength(0);
      expect(groups.remap).toHaveLength(0);
      expect(groups.dissolved).toHaveLength(0);
    });
  });
});
