import { findBestMatch, jaccard, jaccardArrays } from '@/domain/evolution/jaccardSimilarity';
import { describe, expect, it } from 'vitest';

describe('jaccardSimilarity', () => {
  describe('jaccard', () => {
    it('should return 1 for identical sets', () => {
      const setA = new Set(['a', 'b', 'c']);
      const setB = new Set(['a', 'b', 'c']);

      expect(jaccard(setA, setB)).toBe(1);
    });

    it('should return 0 for disjoint sets', () => {
      const setA = new Set(['a', 'b', 'c']);
      const setB = new Set(['d', 'e', 'f']);

      expect(jaccard(setA, setB)).toBe(0);
    });

    it('should return 1 for two empty sets', () => {
      const setA = new Set<string>();
      const setB = new Set<string>();

      expect(jaccard(setA, setB)).toBe(1);
    });

    it('should return 0 when one set is empty', () => {
      const setA = new Set(['a', 'b', 'c']);
      const setB = new Set<string>();

      expect(jaccard(setA, setB)).toBe(0);
      expect(jaccard(setB, setA)).toBe(0);
    });

    it('should calculate correct overlap for partial intersection', () => {
      // A = {a, b, c}, B = {b, c, d}
      // Intersection = {b, c} = 2
      // Union = {a, b, c, d} = 4
      // Jaccard = 2/4 = 0.5
      const setA = new Set(['a', 'b', 'c']);
      const setB = new Set(['b', 'c', 'd']);

      expect(jaccard(setA, setB)).toBe(0.5);
    });

    it('should return correct value when one set is subset of other', () => {
      // A = {a, b}, B = {a, b, c, d}
      // Intersection = {a, b} = 2
      // Union = {a, b, c, d} = 4
      // Jaccard = 2/4 = 0.5
      const setA = new Set(['a', 'b']);
      const setB = new Set(['a', 'b', 'c', 'd']);

      expect(jaccard(setA, setB)).toBe(0.5);
    });

    it('should handle single-element sets', () => {
      const setA = new Set(['a']);
      const setB = new Set(['a']);

      expect(jaccard(setA, setB)).toBe(1);

      const setC = new Set(['b']);
      expect(jaccard(setA, setC)).toBe(0);
    });

    it('should work with numeric sets', () => {
      const setA = new Set([1, 2, 3, 4, 5]);
      const setB = new Set([3, 4, 5, 6, 7]);
      // Intersection = {3, 4, 5} = 3
      // Union = {1, 2, 3, 4, 5, 6, 7} = 7
      // Jaccard = 3/7

      expect(jaccard(setA, setB)).toBeCloseTo(3 / 7);
    });
  });

  describe('jaccardArrays', () => {
    it('should work with arrays', () => {
      const arrayA = ['a', 'b', 'c'];
      const arrayB = ['b', 'c', 'd'];

      expect(jaccardArrays(arrayA, arrayB)).toBe(0.5);
    });

    it('should handle duplicate elements in arrays', () => {
      // Duplicates are removed when converting to set
      const arrayA = ['a', 'a', 'b', 'b', 'c'];
      const arrayB = ['b', 'c', 'd'];

      expect(jaccardArrays(arrayA, arrayB)).toBe(0.5);
    });

    it('should handle empty arrays', () => {
      expect(jaccardArrays([], [])).toBe(1);
      expect(jaccardArrays(['a'], [])).toBe(0);
    });
  });

  describe('findBestMatch', () => {
    it('should find the best matching set', () => {
      const target = new Set(['a', 'b', 'c']);
      const candidates = [
        { id: 'low', set: new Set(['x', 'y', 'z']) },
        { id: 'medium', set: new Set(['b', 'c', 'd']) },
        { id: 'high', set: new Set(['a', 'b', 'c']) },
      ];

      const result = findBestMatch(target, candidates);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('high');
      expect(result!.score).toBe(1);
    });

    it('should return null for empty candidates', () => {
      const target = new Set(['a', 'b', 'c']);

      const result = findBestMatch(target, []);

      expect(result).toBeNull();
    });

    it('should return the first best match if scores are equal', () => {
      const target = new Set(['a', 'b']);
      const candidates = [
        { id: 'first', set: new Set(['a', 'b']) },
        { id: 'second', set: new Set(['a', 'b']) },
      ];

      const result = findBestMatch(target, candidates);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('first');
      expect(result!.score).toBe(1);
    });

    it('should handle all zero scores', () => {
      const target = new Set(['a', 'b', 'c']);
      const candidates = [
        { id: 'none1', set: new Set(['x', 'y']) },
        { id: 'none2', set: new Set(['w', 'z']) },
      ];

      const result = findBestMatch(target, candidates);

      expect(result).not.toBeNull();
      expect(result!.score).toBe(0);
    });

    it('should work with complex objects', () => {
      const target = new Set(['note1.md', 'note2.md', 'note3.md']);
      const candidates = [
        { id: 'cluster-old', set: new Set(['note1.md', 'note2.md', 'note4.md']) },
        { id: 'cluster-new', set: new Set(['note1.md', 'note2.md', 'note3.md', 'note5.md']) },
      ];

      const result = findBestMatch(target, candidates);

      expect(result).not.toBeNull();
      // Target has 3, cluster-new has 4, intersection is 3
      // Union is 4, so Jaccard = 3/4 = 0.75
      expect(result!.id).toBe('cluster-new');
      expect(result!.score).toBe(0.75);
    });
  });
});
