import type { IgniteSettings } from '@/settings';
import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type { Root } from 'react-dom/client';

export const IGNITE_VIEW_TYPE = 'ignite-view';

export class IgniteView extends ItemView {
  private root: Root | null = null;
  private settings: IgniteSettings;

  constructor(leaf: WorkspaceLeaf, settings: IgniteSettings) {
    super(leaf);
    this.settings = settings;
  }

  getViewType(): string {
    return IGNITE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Ignite';
  }

  getIcon(): string {
    return 'flame';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    if (!container) return;

    container.empty();
    container.addClass('ignite-view-container');

    // Show loading state while React loads
    const loadingEl = container.createDiv({ cls: 'ignite-loading' });
    loadingEl.createSpan({ text: 'Loading Ignite...' });

    // Dynamic import to ensure React is loaded
    const { createRoot } = await import('react-dom/client');
    const { IgniteRoot } = await import('@/ui/IgniteApp');
    const { ObsidianVaultAdapter } = await import('./ObsidianVaultAdapter');
    const { ObsidianStorageAdapter } = await import('./ObsidianStorageAdapter');
    const { ObsidianMetadataAdapter } = await import('./ObsidianMetadataAdapter');
    const { AnthropicLLMAdapter } = await import('@/adapters/anthropic');

    // Create adapters
    const vaultProvider = new ObsidianVaultAdapter(this.app);
    const storageAdapter = new ObsidianStorageAdapter(this.app);
    const metadataProvider = new ObsidianMetadataAdapter(this.app);
    const llmProvider = new AnthropicLLMAdapter({
      apiKey: this.settings.anthropicApiKey,
    });

    const appContext = {
      vaultProvider,
      storageAdapter,
      metadataProvider,
      llmProvider,
      settings: this.settings,
    };

    // Remove loading state and mount React
    loadingEl.remove();
    this.root = createRoot(container as HTMLElement);
    this.root.render(<IgniteRoot appContext={appContext} />);
  }

  async onClose(): Promise<void> {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }
}
