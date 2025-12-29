import { AnthropicLLMAdapter } from '@/adapters/anthropic/AnthropicLLMAdapter';
import {
  ObsidianMetadataAdapter,
  ObsidianStorageAdapter,
  ObsidianVaultAdapter,
} from '@/adapters/obsidian';
import { OpenAIEmbeddingAdapter } from '@/adapters/openai/OpenAIEmbeddingAdapter';
import { VoyageEmbeddingAdapter } from '@/adapters/voyage/VoyageEmbeddingAdapter';
import { PipelineOrchestrator, parseExcludePatterns } from '@/domain/pipeline';
import type { IEmbeddingProvider } from '@/ports/IEmbeddingProvider';
import { type AIRecallSettings, AIRecallSettingsTab, DEFAULT_SETTINGS } from '@/settings';
import { Notice, Plugin } from 'obsidian';

/**
 * Obsidian AI Recall Plugin
 * AI-powered spaced repetition for Obsidian
 */
export default class AIRecallPlugin extends Plugin {
  settings: AIRecallSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    console.log('Loading AI Recall plugin');

    // Load settings
    await this.loadSettings();

    // Register settings tab
    this.addSettingTab(new AIRecallSettingsTab(this.app, this));

    // Register clustering command
    this.addCommand({
      id: 'run-clustering',
      name: 'Run BERTopic Pipeline',
      callback: () => this.runClustering(),
    });
  }

  async onunload(): Promise<void> {
    console.log('Unloading AI Recall plugin');
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * Get the configured API key for the selected embedding provider
   */
  private getApiKey(): string | null {
    if (this.settings.embeddingProvider === 'openai') {
      return this.settings.openaiApiKey || null;
    }
    return this.settings.voyageApiKey || null;
  }

  /**
   * Create the embedding provider based on settings
   */
  private createEmbeddingProvider(): IEmbeddingProvider | null {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return null;
    }

    if (this.settings.embeddingProvider === 'openai') {
      return new OpenAIEmbeddingAdapter({ apiKey });
    }
    return new VoyageEmbeddingAdapter({ apiKey });
  }

  /**
   * Run the BERTopic clustering pipeline
   */
  private async runClustering(): Promise<void> {
    // Validate API key
    const apiKey = this.getApiKey();
    if (!apiKey) {
      new Notice(
        `Please configure your ${this.settings.embeddingProvider === 'openai' ? 'OpenAI' : 'Voyage AI'} API key in settings.`,
      );
      return;
    }

    // Create embedding provider
    const embeddingProvider = this.createEmbeddingProvider();
    if (!embeddingProvider) {
      new Notice('Failed to initialize embedding provider.');
      return;
    }

    // Validate Anthropic API key (required for LLM naming)
    if (!this.settings.anthropicApiKey) {
      new Notice('Please configure your Anthropic API key in settings.');
      return;
    }

    // Create LLM provider
    const llmProvider = new AnthropicLLMAdapter(this.settings.anthropicApiKey);

    // Create adapters
    const vaultAdapter = new ObsidianVaultAdapter(this.app);
    const metadataAdapter = new ObsidianMetadataAdapter(this.app);
    const storageAdapter = new ObsidianStorageAdapter(this.app);

    // Parse exclude patterns from settings
    const excludePatterns = parseExcludePatterns(this.settings.excludePaths);

    // Create orchestrator
    const orchestrator = new PipelineOrchestrator(
      vaultAdapter,
      metadataAdapter,
      storageAdapter,
      embeddingProvider,
      llmProvider,
      excludePatterns,
    );

    // Show status notice
    const statusNotice = new Notice('Starting BERTopic pipeline...', 0);

    try {
      const result = await orchestrator.run((progress) => {
        statusNotice.setMessage(progress.message);
      });

      // Hide status and show completion notice
      statusNotice.hide();

      const costInfo =
        result.embeddingStats.cacheMisses > 0
          ? ` (est. cost: $${result.embeddingStats.estimatedCost.toFixed(4)})`
          : ' (all from cache)';

      const excludedInfo =
        result.excludedCount > 0 ? `\n${result.excludedCount} paths excluded` : '';

      const llmInfo =
        result.llmStats !== null
          ? `\n${result.llmStats.conceptsNamed} concepts named (${result.llmStats.quizzableCount} quizzable)`
          : '';

      new Notice(
        `Clustering complete!\n${result.clusterCount} clusters found\n${result.totalNotes} notes processed${excludedInfo}\n${result.noiseCount} noise notes${llmInfo}\nTime: ${(result.timing.totalMs / 1000).toFixed(1)}s${costInfo}`,
        8000,
      );

      console.log('Clustering result:', result);
    } catch (error) {
      statusNotice.hide();
      this.handleError(error);
    }
  }

  /**
   * Handle pipeline errors with user-friendly messages
   */
  private handleError(error: unknown): void {
    console.error('Clustering error:', error);

    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Check for common API errors
      if (
        message.includes('401') ||
        message.includes('unauthorized') ||
        message.includes('invalid api key')
      ) {
        new Notice('Invalid API key. Please check your settings.', 5000);
        return;
      }

      if (message.includes('429') || message.includes('rate limit')) {
        new Notice('Rate limited by API. Please try again later.', 5000);
        return;
      }

      if (message.includes('insufficient_quota') || message.includes('quota')) {
        new Notice('API quota exceeded. Please check your billing.', 5000);
        return;
      }

      // Generic error
      new Notice(`Clustering failed: ${error.message}`, 5000);
    } else {
      new Notice('Clustering failed. Check console for details.', 5000);
    }
  }
}
