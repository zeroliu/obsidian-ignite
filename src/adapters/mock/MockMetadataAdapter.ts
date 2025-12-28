import type { FileMetadata, IMetadataProvider, ResolvedLinks } from '@/ports/IMetadataProvider';
import type { VaultFixture } from '@/test/fixtures/types';

/**
 * Mock implementation of IMetadataProvider for testing
 * Loads data from JSON fixtures
 */
export class MockMetadataAdapter implements IMetadataProvider {
  private metadata: Record<string, Omit<FileMetadata, 'path'>>;
  private resolvedLinks: ResolvedLinks;

  constructor(fixture: VaultFixture) {
    this.metadata = fixture.metadata.metadata;
    this.resolvedLinks = fixture.metadata.resolvedLinks;
  }

  async getFileMetadata(path: string): Promise<FileMetadata | null> {
    const meta = this.metadata[path];
    if (!meta) {
      return null;
    }
    return {
      path,
      ...meta,
    };
  }

  async getResolvedLinks(): Promise<ResolvedLinks> {
    return this.resolvedLinks;
  }

  async getBacklinks(path: string): Promise<string[]> {
    const backlinks: string[] = [];
    for (const [sourcePath, targets] of Object.entries(this.resolvedLinks)) {
      if (path in targets) {
        backlinks.push(sourcePath);
      }
    }
    return backlinks;
  }

  async getAllTags(): Promise<string[]> {
    const tagSet = new Set<string>();
    for (const meta of Object.values(this.metadata)) {
      for (const tag of meta.tags) {
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }

  /**
   * Set metadata for a file (for testing)
   */
  _setMetadata(path: string, metadata: Omit<FileMetadata, 'path'>): void {
    this.metadata[path] = metadata;
  }

  /**
   * Add a resolved link (for testing)
   */
  _addResolvedLink(source: string, target: string, count = 1): void {
    if (!this.resolvedLinks[source]) {
      this.resolvedLinks[source] = {};
    }
    this.resolvedLinks[source][target] = count;
  }
}
