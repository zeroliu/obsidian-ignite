import type { IStorageAdapter } from '@/ports/IStorageAdapter';

/**
 * In-memory implementation of IStorageAdapter for testing
 */
export class InMemoryStorageAdapter implements IStorageAdapter {
  private storage: Map<string, unknown> = new Map();

  async read<T>(key: string): Promise<T | null> {
    const value = this.storage.get(key);
    if (value === undefined) {
      return null;
    }
    return value as T;
  }

  async write<T>(key: string, data: T): Promise<void> {
    this.storage.set(key, data);
  }

  async exists(key: string): Promise<boolean> {
    return this.storage.has(key);
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async keys(): Promise<string[]> {
    return Array.from(this.storage.keys());
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }

  /**
   * Get the raw storage map (for testing)
   */
  _getStorage(): Map<string, unknown> {
    return this.storage;
  }

  /**
   * Set the storage directly (for testing)
   */
  _setStorage(data: Record<string, unknown>): void {
    this.storage = new Map(Object.entries(data));
  }
}
