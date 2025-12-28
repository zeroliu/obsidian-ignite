import type { IStorageAdapter } from '@/ports/IStorageAdapter';
import type { App } from 'obsidian';

/**
 * Obsidian-based implementation of IStorageAdapter
 *
 * Stores data as JSON files in the vault using Obsidian's vault.adapter API.
 * Keys are converted to file paths (e.g., "embeddings/index" -> ".recall/embeddings/index.json")
 */
export class ObsidianStorageAdapter implements IStorageAdapter {
  private basePath: string;

  constructor(
    private app: App,
    basePath = '.recall',
  ) {
    this.basePath = basePath;
  }

  private getFilePath(key: string): string {
    return `${this.basePath}/${key}.json`;
  }

  private getParentPath(filePath: string): string {
    const parts = filePath.split('/');
    parts.pop();
    return parts.join('/');
  }

  async read<T>(key: string): Promise<T | null> {
    const filePath = this.getFilePath(key);
    const exists = await this.app.vault.adapter.exists(filePath);
    if (!exists) {
      return null;
    }
    try {
      const content = await this.app.vault.adapter.read(filePath);
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  async write<T>(key: string, data: T): Promise<void> {
    const filePath = this.getFilePath(key);
    const parentPath = this.getParentPath(filePath);

    // Ensure parent directory exists
    if (parentPath && !(await this.app.vault.adapter.exists(parentPath))) {
      await this.ensureDirectory(parentPath);
    }

    await this.app.vault.adapter.write(filePath, JSON.stringify(data));
  }

  async exists(key: string): Promise<boolean> {
    return this.app.vault.adapter.exists(this.getFilePath(key));
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    const exists = await this.app.vault.adapter.exists(filePath);
    if (exists) {
      await this.app.vault.adapter.remove(filePath);
    }
  }

  async keys(): Promise<string[]> {
    const exists = await this.app.vault.adapter.exists(this.basePath);
    if (!exists) {
      return [];
    }
    return this.collectKeys(this.basePath);
  }

  private async collectKeys(dir: string): Promise<string[]> {
    const exists = await this.app.vault.adapter.exists(dir);
    if (!exists) {
      return [];
    }

    const keys: string[] = [];
    const listing = await this.app.vault.adapter.list(dir);

    // Process files
    for (const file of listing.files) {
      if (file.endsWith('.json')) {
        // Extract relative path from base and remove .json extension
        const relativePath = file.slice(this.basePath.length + 1, -5);
        keys.push(relativePath);
      }
    }

    // Process subdirectories recursively
    for (const folder of listing.folders) {
      const subKeys = await this.collectKeys(folder);
      keys.push(...subKeys);
    }

    return keys;
  }

  async clear(): Promise<void> {
    const exists = await this.app.vault.adapter.exists(this.basePath);
    if (exists) {
      await this.removeRecursive(this.basePath);
    }
    await this.ensureDirectory(this.basePath);
  }

  private async ensureDirectory(path: string): Promise<void> {
    const parts = path.split('/');
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const exists = await this.app.vault.adapter.exists(currentPath);
      if (!exists) {
        await this.app.vault.adapter.mkdir(currentPath);
      }
    }
  }

  private async removeRecursive(path: string): Promise<void> {
    const listing = await this.app.vault.adapter.list(path);

    // Remove all files
    for (const file of listing.files) {
      await this.app.vault.adapter.remove(file);
    }

    // Remove all subdirectories recursively
    for (const folder of listing.folders) {
      await this.removeRecursive(folder);
    }

    // Remove the directory itself
    await this.app.vault.adapter.rmdir(path, false);
  }
}
