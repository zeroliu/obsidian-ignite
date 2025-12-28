/**
 * Port interface for persistent storage operations
 * Abstracts away storage mechanism for testability
 */
export interface IStorageAdapter {
  /**
   * Read data from storage
   * @param key - Storage key
   * @returns Promise resolving to stored data, or null if not found
   */
  read<T>(key: string): Promise<T | null>;

  /**
   * Write data to storage
   * @param key - Storage key
   * @param data - Data to store
   * @returns Promise resolving when write is complete
   */
  write<T>(key: string, data: T): Promise<void>;

  /**
   * Check if a key exists in storage
   * @param key - Storage key
   * @returns Promise resolving to true if key exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * Delete data from storage
   * @param key - Storage key
   * @returns Promise resolving when delete is complete
   */
  delete(key: string): Promise<void>;

  /**
   * Get all keys in storage
   * @returns Promise resolving to array of keys
   */
  keys(): Promise<string[]>;

  /**
   * Clear all data from storage
   * @returns Promise resolving when clear is complete
   */
  clear(): Promise<void>;
}
