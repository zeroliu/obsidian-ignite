import {
  filterExcludedPaths,
  isPathExcluded,
  parseExcludePatterns,
} from '@/domain/pipeline/pathFilter';
import { describe, expect, it } from 'vitest';

describe('parseExcludePatterns', () => {
  it('should return empty array for empty string', () => {
    expect(parseExcludePatterns('')).toEqual([]);
    expect(parseExcludePatterns('   ')).toEqual([]);
  });

  it('should split by newlines and trim', () => {
    const input = 'Templates/**\n  Archive/**  \n*.template.md';
    expect(parseExcludePatterns(input)).toEqual(['Templates/**', 'Archive/**', '*.template.md']);
  });

  it('should filter out empty lines', () => {
    const input = 'Templates/**\n\nArchive/**\n  \n*.md';
    expect(parseExcludePatterns(input)).toEqual(['Templates/**', 'Archive/**', '*.md']);
  });

  it('should support comment lines starting with #', () => {
    const input = '# Comment\nTemplates/**\n# Another comment\nArchive/**';
    expect(parseExcludePatterns(input)).toEqual(['Templates/**', 'Archive/**']);
  });
});

describe('isPathExcluded', () => {
  it('should return false for empty patterns', () => {
    expect(isPathExcluded('any/path.md', [])).toBe(false);
  });

  it('should match exact paths', () => {
    expect(isPathExcluded('Templates/daily.md', ['Templates/daily.md'])).toBe(true);
    expect(isPathExcluded('Templates/other.md', ['Templates/daily.md'])).toBe(false);
  });

  it('should match glob double stars for recursive directories', () => {
    expect(isPathExcluded('Templates/daily.md', ['Templates/**'])).toBe(true);
    expect(isPathExcluded('Templates/sub/note.md', ['Templates/**'])).toBe(true);
    expect(isPathExcluded('Other/note.md', ['Templates/**'])).toBe(false);
  });

  it('should match wildcards in filenames', () => {
    expect(isPathExcluded('note.template.md', ['*.template.md'])).toBe(true);
    // * doesn't match path separators - use **/*.template.md for subdirectories
    expect(isPathExcluded('folder/note.template.md', ['*.template.md'])).toBe(false);
    expect(isPathExcluded('folder/note.template.md', ['**/*.template.md'])).toBe(true);
    expect(isPathExcluded('note.md', ['*.template.md'])).toBe(false);
  });

  it('should match multiple patterns', () => {
    const patterns = ['Templates/**', 'Archive/**', '*.draft.md'];
    expect(isPathExcluded('Templates/note.md', patterns)).toBe(true);
    expect(isPathExcluded('Archive/old.md', patterns)).toBe(true);
    expect(isPathExcluded('note.draft.md', patterns)).toBe(true);
    expect(isPathExcluded('notes/idea.md', patterns)).toBe(false);
  });

  it('should match dotfiles when enabled', () => {
    expect(isPathExcluded('.obsidian/config.json', ['.obsidian/**'])).toBe(true);
  });
});

describe('filterExcludedPaths', () => {
  const files = [
    {
      path: 'notes/idea.md',
      basename: 'idea',
      folder: 'notes',
      modifiedAt: 0,
      createdAt: 0,
    },
    {
      path: 'Templates/daily.md',
      basename: 'daily',
      folder: 'Templates',
      modifiedAt: 0,
      createdAt: 0,
    },
    {
      path: 'Archive/old.md',
      basename: 'old',
      folder: 'Archive',
      modifiedAt: 0,
      createdAt: 0,
    },
    {
      path: 'draft.template.md',
      basename: 'draft.template',
      folder: '',
      modifiedAt: 0,
      createdAt: 0,
    },
  ];

  it('should return all files when no patterns', () => {
    const result = filterExcludedPaths(files, []);
    expect(result.included).toHaveLength(4);
    expect(result.excludedCount).toBe(0);
  });

  it('should filter matching paths', () => {
    const result = filterExcludedPaths(files, ['Templates/**', 'Archive/**']);
    expect(result.included).toHaveLength(2);
    expect(result.excludedCount).toBe(2);
    expect(result.included.map((f) => f.path)).toEqual(['notes/idea.md', 'draft.template.md']);
  });

  it('should handle wildcard patterns', () => {
    const result = filterExcludedPaths(files, ['*.template.md']);
    expect(result.included).toHaveLength(3);
    expect(result.excludedCount).toBe(1);
    expect(result.included.map((f) => f.path)).not.toContain('draft.template.md');
  });
});
