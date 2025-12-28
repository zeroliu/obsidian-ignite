/**
 * Heading information from a note
 */
export interface HeadingInfo {
  /** Heading text */
  heading: string;
  /** Heading level (1-6) */
  level: number;
  /** Line number where heading appears */
  line: number;
}

/**
 * Metadata information for a file
 */
export interface FileMetadata {
  /** Full path to the file */
  path: string;
  /** Tags found in the file (including frontmatter), normalized with # prefix */
  tags: string[];
  /** Outgoing links from this file (target paths) */
  links: string[];
  /** Headings in the file */
  headings: HeadingInfo[];
  /** Frontmatter key-value pairs */
  frontmatter: Record<string, unknown>;
  /** Approximate word count */
  wordCount: number;
}

/**
 * Resolved links map: source path -> { target path -> link count }
 */
export type ResolvedLinks = Record<string, Record<string, number>>;

/**
 * Port interface for file metadata operations
 * Abstracts away Obsidian's MetadataCache for testability
 */
export interface IMetadataProvider {
  /**
   * Get metadata for a specific file
   * @param path - Full path to the file
   * @returns Promise resolving to file metadata, or null if not found
   */
  getFileMetadata(path: string): Promise<FileMetadata | null>;

  /**
   * Get the resolved links map for all files
   * Maps source file path to { target file path -> link count }
   * @returns Promise resolving to resolved links map
   */
  getResolvedLinks(): Promise<ResolvedLinks>;

  /**
   * Get backlinks for a specific file (files that link to this file)
   * @param path - Full path to the target file
   * @returns Promise resolving to array of source file paths
   */
  getBacklinks(path: string): Promise<string[]>;

  /**
   * Get all tags used across the vault
   * @returns Promise resolving to array of unique tags
   */
  getAllTags(): Promise<string[]>;
}
