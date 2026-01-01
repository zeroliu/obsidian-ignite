import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ILLMProvider, IMetadataProvider, IStorageAdapter, IVaultProvider } from '@/ports';
import type { IgniteSettings } from '@/settings';
import { IgniteRoot } from '@/ui/IgniteApp';
import type { AppContextValue } from '@/ui/contexts/AppContext';

/**
 * Creates mock adapters for testing.
 * Used to construct AppContextValue for IgniteRoot.
 */
function createMockVaultProvider(): IVaultProvider {
  return {
    listMarkdownFiles: vi.fn(async () => []),
    readFile: vi.fn(async () => ''),
    exists: vi.fn(async () => false),
    getBasename: vi.fn((path: string) => path.split('/').pop()?.replace('.md', '') ?? ''),
    getFolder: vi.fn((path: string) => path.split('/').slice(0, -1).join('/')),
    createFile: vi.fn(async () => {}),
    modifyFile: vi.fn(async () => {}),
    createFolder: vi.fn(async () => {}),
    deleteFile: vi.fn(async () => {}),
    deleteFolder: vi.fn(async () => {}),
  };
}

function createMockStorageAdapter(): IStorageAdapter {
  return {
    read: vi.fn().mockResolvedValue(null),
    write: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    delete: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
    clear: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockMetadataProvider(): IMetadataProvider {
  return {
    getFileMetadata: vi.fn(async () => null),
    getResolvedLinks: vi.fn(async () => ({})),
    getBacklinks: vi.fn(async () => []),
    getAllTags: vi.fn(async () => []),
  };
}

function createMockLLMProvider(): ILLMProvider {
  return {
    chat: vi.fn(async () => ({ content: '' })),
    streamChat: vi.fn(async () => {}),
    getProviderName: vi.fn(() => 'Mock'),
    getModelName: vi.fn(() => 'mock-model'),
    getMaxTokens: vi.fn(() => 4096),
    estimateTokens: vi.fn(() => 0),
  };
}

function createMockSettings(): IgniteSettings {
  return {
    anthropicApiKey: '',
    voyageApiKey: '',
    includePaths: [],
    excludePaths: [],
  };
}

/**
 * Creates a mock AppContextValue for testing.
 * This is passed to IgniteRoot, the same component used in production.
 */
function createMockAppContext(): AppContextValue {
  return {
    vaultProvider: createMockVaultProvider(),
    storageAdapter: createMockStorageAdapter(),
    metadataProvider: createMockMetadataProvider(),
    llmProvider: createMockLLMProvider(),
    settings: createMockSettings(),
  };
}

describe('IgniteRoot', () => {
  it('renders without throwing context errors', () => {
    // Uses the same IgniteRoot component as production (IgniteView).
    // If IgniteRoot is missing any provider, this test will fail.
    const appContext = createMockAppContext();

    expect(() => render(<IgniteRoot appContext={appContext} />)).not.toThrow();
  });

  it('renders the home screen by default', () => {
    const appContext = createMockAppContext();

    render(<IgniteRoot appContext={appContext} />);

    // HomeScreen should render the goals list (empty state when no goals)
    expect(screen.getByText('My Goals')).toBeTruthy();
  });
});
