/**
 * File information abstraction for vault files
 */
export interface FileInfo {
  /** Full path to the file (e.g., "folder/subfolder/note.md") */
  path: string;
  /** File name without extension (e.g., "note") */
  basename: string;
  /** Parent folder path (e.g., "folder/subfolder") */
  folder: string;
  /** Last modified timestamp in milliseconds */
  modifiedAt: number;
  /** Created timestamp in milliseconds */
  createdAt: number;
}

/**
 * Port interface for vault file operations
 * Abstracts away Obsidian's Vault API for testability
 */
export interface IVaultProvider {
  /**
   * Get all markdown files in the vault
   * @returns Promise resolving to array of file info
   */
  listMarkdownFiles(): Promise<FileInfo[]>;

  /**
   * Read the content of a file
   * @param path - Full path to the file
   * @returns Promise resolving to file content as string
   */
  readFile(path: string): Promise<string>;

  /**
   * Check if a file exists
   * @param path - Full path to the file
   * @returns Promise resolving to true if file exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * Get the basename (filename without extension) from a path
   * @param path - Full path to the file
   * @returns Basename of the file
   */
  getBasename(path: string): string;

  /**
   * Get the folder path from a file path
   * @param path - Full path to the file
   * @returns Folder path (empty string for root files)
   */
  getFolder(path: string): string;

  /**
   * Create a new file with content
   * @param path - Full path to the file to create
   * @param content - File content
   * @returns Promise resolving when file is created
   */
  createFile(path: string, content: string): Promise<void>;

  /**
   * Modify an existing file with new content
   * @param path - Full path to the file to modify
   * @param content - New file content
   * @returns Promise resolving when file is modified
   */
  modifyFile(path: string, content: string): Promise<void>;

  /**
   * Create a folder (and parent folders if they don't exist)
   * @param path - Full path to the folder to create
   * @returns Promise resolving when folder is created
   */
  createFolder(path: string): Promise<void>;

  /**
   * Delete a file
   * @param path - Full path to the file to delete
   * @returns Promise resolving when file is deleted
   */
  deleteFile(path: string): Promise<void>;
}
