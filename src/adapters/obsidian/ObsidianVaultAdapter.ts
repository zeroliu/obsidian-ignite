import type { FileInfo, IVaultProvider } from '@/ports/IVaultProvider';
import { type App, TFile, TFolder } from 'obsidian';

/**
 * Real Obsidian implementation of IVaultProvider
 * Uses Obsidian's App.vault API
 */
export class ObsidianVaultAdapter implements IVaultProvider {
  constructor(private app: App) {}

  async listMarkdownFiles(): Promise<FileInfo[]> {
    const files = this.app.vault.getMarkdownFiles();
    return files.map((file) => this.toFileInfo(file));
  }

  async readFile(path: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }
    return this.app.vault.cachedRead(file);
  }

  async exists(path: string): Promise<boolean> {
    return this.app.vault.getAbstractFileByPath(path) !== null;
  }

  getBasename(path: string): string {
    const filename = path.split('/').pop() || '';
    return filename.replace(/\.[^/.]+$/, '');
  }

  getFolder(path: string): string {
    const parts = path.split('/');
    parts.pop(); // Remove filename
    return parts.join('/');
  }

  async createFile(path: string, content: string): Promise<void> {
    await this.app.vault.create(path, content);
  }

  async modifyFile(path: string, content: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }
    await this.app.vault.modify(file, content);
  }

  async createFolder(path: string): Promise<void> {
    const exists = await this.exists(path);
    if (!exists) {
      await this.app.vault.createFolder(path);
    }
  }

  async deleteFile(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }
    await this.app.vault.delete(file);
  }

  async deleteFolder(path: string): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(path);
    if (!folder || !(folder instanceof TFolder)) {
      throw new Error(`Folder not found: ${path}`);
    }
    await this.app.vault.delete(folder, true);
  }

  private toFileInfo(file: TFile): FileInfo {
    return {
      path: file.path,
      basename: file.basename,
      folder: file.parent?.path || '',
      modifiedAt: file.stat.mtime,
      createdAt: file.stat.ctime,
    };
  }
}
