import { MockMetadataAdapter } from '@/adapters/mock/MockMetadataAdapter';
import emptyVault from '@/test/fixtures/empty-vault.json';
import reactVault from '@/test/fixtures/react-vault.json';
import type { VaultFixture } from '@/test/fixtures/types';
import { beforeEach, describe, expect, it } from 'vitest';

describe('MockMetadataAdapter', () => {
  let adapter: MockMetadataAdapter;

  beforeEach(() => {
    adapter = new MockMetadataAdapter(reactVault as VaultFixture);
  });

  describe('getFileMetadata', () => {
    it('should return metadata for existing file', async () => {
      const metadata = await adapter.getFileMetadata('react/React Basics.md');
      expect(metadata).not.toBeNull();
      expect(metadata?.path).toBe('react/React Basics.md');
      expect(metadata?.tags).toContain('#react');
      expect(metadata?.tags).toContain('#frontend');
    });

    it('should return null for non-existent file', async () => {
      const metadata = await adapter.getFileMetadata('non-existent.md');
      expect(metadata).toBeNull();
    });

    it('should include links', async () => {
      const metadata = await adapter.getFileMetadata('react/React Hooks.md');
      expect(metadata?.links).toContain('react/useState Deep Dive.md');
      expect(metadata?.links).toContain('react/useEffect Guide.md');
    });

    it('should include headings', async () => {
      const metadata = await adapter.getFileMetadata('react/React Basics.md');
      expect(metadata?.headings).toHaveLength(2);
      expect(metadata?.headings[0].heading).toBe('React Basics');
      expect(metadata?.headings[0].level).toBe(1);
    });
  });

  describe('getResolvedLinks', () => {
    it('should return resolved links map', async () => {
      const links = await adapter.getResolvedLinks();
      expect(links['react/React Basics.md']).toBeDefined();
      expect(links['react/React Basics.md']['react/React Hooks.md']).toBe(1);
    });

    it('should return empty object for empty vault', async () => {
      const emptyAdapter = new MockMetadataAdapter(emptyVault as VaultFixture);
      const links = await emptyAdapter.getResolvedLinks();
      expect(Object.keys(links)).toHaveLength(0);
    });
  });

  describe('getBacklinks', () => {
    it('should return files that link to target', async () => {
      const backlinks = await adapter.getBacklinks('react/React Hooks.md');
      expect(backlinks).toContain('react/React Basics.md');
      expect(backlinks).toContain('react/useState Deep Dive.md');
      expect(backlinks).toContain('react/Performance Optimization.md');
    });

    it('should return empty array for file with no backlinks', async () => {
      const backlinks = await adapter.getBacklinks('react/React Basics.md');
      // React Basics is linked from React Hooks
      expect(backlinks).toContain('react/React Hooks.md');
    });
  });

  describe('getAllTags', () => {
    it('should return all unique tags sorted', async () => {
      const tags = await adapter.getAllTags();
      expect(tags).toContain('#react');
      expect(tags).toContain('#hooks');
      expect(tags).toContain('#performance');
      // Should be unique
      const uniqueTags = [...new Set(tags)];
      expect(tags).toHaveLength(uniqueTags.length);
      // Should be sorted
      const sortedTags = [...tags].sort();
      expect(tags).toEqual(sortedTags);
    });

    it('should return empty array for empty vault', async () => {
      const emptyAdapter = new MockMetadataAdapter(emptyVault as VaultFixture);
      const tags = await emptyAdapter.getAllTags();
      expect(tags).toHaveLength(0);
    });
  });

  describe('_setMetadata', () => {
    it('should add metadata for a file', async () => {
      adapter._setMetadata('new/file.md', {
        tags: ['#new', '#test'],
        links: [],
        headings: [],
        frontmatter: {},
        wordCount: 10,
      });

      const metadata = await adapter.getFileMetadata('new/file.md');
      expect(metadata?.tags).toContain('#new');
    });
  });

  describe('_addResolvedLink', () => {
    it('should add a resolved link', async () => {
      adapter._addResolvedLink('source.md', 'target.md', 2);

      const links = await adapter.getResolvedLinks();
      expect(links['source.md']['target.md']).toBe(2);

      const backlinks = await adapter.getBacklinks('target.md');
      expect(backlinks).toContain('source.md');
    });
  });
});
