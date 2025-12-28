import type { FileMetadata, ResolvedLinks } from '@/ports/IMetadataProvider';
import type { FileInfo } from '@/ports/IVaultProvider';

/**
 * Vault fixture data structure
 */
export interface VaultFixtureData {
  /** List of files in the vault */
  files: FileInfo[];
  /** Map of file path to content */
  contents: Record<string, string>;
}

/**
 * Metadata fixture data structure
 */
export interface MetadataFixtureData {
  /** Map of file path to metadata */
  metadata: Record<string, Omit<FileMetadata, 'path'>>;
  /** Resolved links map */
  resolvedLinks: ResolvedLinks;
}

/**
 * Complete fixture combining vault and metadata
 */
export interface VaultFixture {
  vault: VaultFixtureData;
  metadata: MetadataFixtureData;
}

/**
 * Helper to create a FileInfo object
 */
export function createFileInfo(
  path: string,
  options: Partial<Omit<FileInfo, 'path'>> = {},
): FileInfo {
  const parts = path.split('/');
  const filename = parts.pop() || '';
  const folder = parts.join('/');
  const basename = filename.replace(/\.[^/.]+$/, '');

  return {
    path,
    basename: options.basename ?? basename,
    folder: options.folder ?? folder,
    modifiedAt: options.modifiedAt ?? Date.now(),
    createdAt: options.createdAt ?? Date.now(),
  };
}

/**
 * Helper to create a FileMetadata object
 */
export function createFileMetadata(
  path: string,
  options: Partial<Omit<FileMetadata, 'path'>> = {},
): FileMetadata {
  return {
    path,
    tags: options.tags ?? [],
    links: options.links ?? [],
    headings: options.headings ?? [],
    frontmatter: options.frontmatter ?? {},
    wordCount: options.wordCount ?? 0,
  };
}
