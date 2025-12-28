import micromatch from 'micromatch';

/**
 * Parse multi-line exclude patterns string into an array of patterns
 *
 * @param patternsString - Raw string with one pattern per line
 * @returns Array of non-empty, trimmed patterns
 */
export function parseExcludePatterns(patternsString: string): string[] {
  if (!patternsString.trim()) {
    return [];
  }

  return patternsString
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/**
 * Check if a file path matches any of the exclude patterns
 *
 * @param path - File path to check (e.g., "Templates/daily.md")
 * @param patterns - Array of glob patterns
 * @returns true if path should be excluded
 */
export function isPathExcluded(path: string, patterns: string[]): boolean {
  if (patterns.length === 0) {
    return false;
  }

  return micromatch.isMatch(path, patterns, {
    dot: true,
  });
}

/**
 * Filter an array of files, removing those matching exclude patterns
 *
 * @param files - Array of objects with path property
 * @param patterns - Array of glob patterns to exclude
 * @returns Object with included files and excluded count
 */
export function filterExcludedPaths<T extends { path: string }>(
  files: T[],
  patterns: string[],
): { included: T[]; excludedCount: number } {
  if (patterns.length === 0) {
    return { included: files, excludedCount: 0 };
  }

  const included: T[] = [];
  let excludedCount = 0;

  for (const file of files) {
    if (isPathExcluded(file.path, patterns)) {
      excludedCount++;
    } else {
      included.push(file);
    }
  }

  return { included, excludedCount };
}
