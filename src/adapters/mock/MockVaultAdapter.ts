import type { FileInfo, IVaultProvider } from '@/ports/IVaultProvider';
import type { VaultFixture } from '@/test/fixtures/types';

/**
 * Mock implementation of IVaultProvider for testing
 * Loads data from JSON fixtures
 */
export class MockVaultAdapter implements IVaultProvider {
  private files: FileInfo[];
  private contents: Record<string, string>;

  constructor(fixture: VaultFixture) {
    this.files = fixture.vault.files;
    this.contents = fixture.vault.contents;
  }

  async listMarkdownFiles(): Promise<FileInfo[]> {
    return this.files.filter((f) => f.path.endsWith('.md'));
  }

  async readFile(path: string): Promise<string> {
    const content = this.contents[path];
    if (content === undefined) {
      throw new Error(`File not found: ${path}`);
    }
    return content;
  }

  async exists(path: string): Promise<boolean> {
    return path in this.contents;
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

  /**
   * Add a file to the mock vault (for testing)
   */
  _addFile(fileInfo: FileInfo, content: string): void {
    this.files.push(fileInfo);
    this.contents[fileInfo.path] = content;
  }

  /**
   * Get all files (for testing)
   */
  _getFiles(): FileInfo[] {
    return this.files;
  }
}
