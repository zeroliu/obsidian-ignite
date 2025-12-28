import { MockVaultAdapter } from '@/adapters/mock/MockVaultAdapter';
import emptyVault from '@/test/fixtures/empty-vault.json';
import reactVault from '@/test/fixtures/react-vault.json';
import type { VaultFixture } from '@/test/fixtures/types';
import { beforeEach, describe, expect, it } from 'vitest';

describe('MockVaultAdapter', () => {
  let adapter: MockVaultAdapter;

  beforeEach(() => {
    adapter = new MockVaultAdapter(reactVault as VaultFixture);
  });

  describe('listMarkdownFiles', () => {
    it('should return all markdown files', async () => {
      const files = await adapter.listMarkdownFiles();
      expect(files).toHaveLength(6);
      expect(files.every((f) => f.path.endsWith('.md'))).toBe(true);
    });

    it('should return empty array for empty vault', async () => {
      const emptyAdapter = new MockVaultAdapter(emptyVault as VaultFixture);
      const files = await emptyAdapter.listMarkdownFiles();
      expect(files).toHaveLength(0);
    });

    it('should include correct file info', async () => {
      const files = await adapter.listMarkdownFiles();
      const reactBasics = files.find((f) => f.basename === 'React Basics');
      expect(reactBasics).toBeDefined();
      expect(reactBasics?.path).toBe('react/React Basics.md');
      expect(reactBasics?.folder).toBe('react');
    });
  });

  describe('readFile', () => {
    it('should return file content', async () => {
      const content = await adapter.readFile('react/React Basics.md');
      expect(content).toContain('# React Basics');
      expect(content).toContain('#react');
    });

    it('should throw error for non-existent file', async () => {
      await expect(adapter.readFile('non-existent.md')).rejects.toThrow('File not found');
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const exists = await adapter.exists('react/React Basics.md');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const exists = await adapter.exists('non-existent.md');
      expect(exists).toBe(false);
    });
  });

  describe('getBasename', () => {
    it('should extract basename from path', () => {
      expect(adapter.getBasename('folder/file.md')).toBe('file');
      expect(adapter.getBasename('deep/nested/path/note.md')).toBe('note');
      expect(adapter.getBasename('root.md')).toBe('root');
    });
  });

  describe('getFolder', () => {
    it('should extract folder from path', () => {
      expect(adapter.getFolder('folder/file.md')).toBe('folder');
      expect(adapter.getFolder('deep/nested/path/note.md')).toBe('deep/nested/path');
      expect(adapter.getFolder('root.md')).toBe('');
    });
  });

  describe('_addFile', () => {
    it('should add a new file to the vault', async () => {
      adapter._addFile(
        {
          path: 'new/file.md',
          basename: 'file',
          folder: 'new',
          modifiedAt: Date.now(),
          createdAt: Date.now(),
        },
        '# New File\n\nContent here.',
      );

      const files = await adapter.listMarkdownFiles();
      expect(files).toHaveLength(7);

      const content = await adapter.readFile('new/file.md');
      expect(content).toContain('# New File');
    });
  });
});
