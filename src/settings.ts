import type AIRecallPlugin from '@/main';
import { type App, PluginSettingTab, Setting } from 'obsidian';

/**
 * Plugin settings interface
 */
export interface AIRecallSettings {
  /** Embedding provider to use: 'openai' or 'voyage' */
  embeddingProvider: 'openai' | 'voyage';
  /** OpenAI API key for embeddings */
  openaiApiKey: string;
  /** Voyage AI API key for embeddings */
  voyageApiKey: string;
  /** Anthropic API key for LLM concept naming */
  anthropicApiKey: string;
  /** Paths to exclude from clustering (one glob pattern per line) */
  excludePaths: string;
}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: AIRecallSettings = {
  embeddingProvider: 'openai',
  openaiApiKey: '',
  voyageApiKey: '',
  anthropicApiKey: '',
  excludePaths: '',
};

/**
 * Settings tab for the AI Recall plugin
 */
export class AIRecallSettingsTab extends PluginSettingTab {
  plugin: AIRecallPlugin;

  constructor(app: App, plugin: AIRecallPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl('h2', { text: 'AI Recall Settings' });

    // Embedding Provider Selection
    new Setting(containerEl)
      .setName('Embedding provider')
      .setDesc('Choose the embedding provider for semantic clustering')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('openai', 'OpenAI (text-embedding-3-small)')
          .addOption('voyage', 'Voyage AI (voyage-3-lite)')
          .setValue(this.plugin.settings.embeddingProvider)
          .onChange(async (value) => {
            this.plugin.settings.embeddingProvider = value as 'openai' | 'voyage';
            await this.plugin.saveSettings();
            // Refresh to show/hide relevant API key field
            this.display();
          }),
      );

    // OpenAI API Key
    if (this.plugin.settings.embeddingProvider === 'openai') {
      new Setting(containerEl)
        .setName('OpenAI API key')
        .setDesc('Your OpenAI API key for generating embeddings')
        .addText((text) =>
          text
            .setPlaceholder('sk-...')
            .setValue(this.plugin.settings.openaiApiKey)
            .onChange(async (value) => {
              this.plugin.settings.openaiApiKey = value;
              await this.plugin.saveSettings();
            }),
        )
        .then((setting) => {
          // Make it a password field
          const inputEl = setting.controlEl.querySelector('input');
          if (inputEl) {
            inputEl.type = 'password';
            inputEl.autocomplete = 'off';
          }
        });
    }

    // Voyage AI API Key
    if (this.plugin.settings.embeddingProvider === 'voyage') {
      new Setting(containerEl)
        .setName('Voyage AI API key')
        .setDesc('Your Voyage AI API key for generating embeddings')
        .addText((text) =>
          text
            .setPlaceholder('pa-...')
            .setValue(this.plugin.settings.voyageApiKey)
            .onChange(async (value) => {
              this.plugin.settings.voyageApiKey = value;
              await this.plugin.saveSettings();
            }),
        )
        .then((setting) => {
          // Make it a password field
          const inputEl = setting.controlEl.querySelector('input');
          if (inputEl) {
            inputEl.type = 'password';
            inputEl.autocomplete = 'off';
          }
        });
    }

    // Exclude Paths section
    containerEl.createEl('h3', { text: 'Path Exclusions' });

    new Setting(containerEl)
      .setName('Excluded paths')
      .setDesc(
        'Glob patterns for paths to exclude from clustering. One pattern per line. ' +
          'Examples: Templates/**, **/*.template.md, Archive/**',
      )
      .addTextArea((text) =>
        text
          .setPlaceholder('Templates/**\n**/*.template.md\nArchive/**')
          .setValue(this.plugin.settings.excludePaths)
          .onChange(async (value) => {
            this.plugin.settings.excludePaths = value;
            await this.plugin.saveSettings();
          }),
      )
      .then((setting) => {
        const textareaEl = setting.controlEl.querySelector('textarea');
        if (textareaEl) {
          textareaEl.rows = 5;
          textareaEl.cols = 40;
          textareaEl.style.fontFamily = 'monospace';
        }
      });

    // LLM Settings section
    containerEl.createEl('h3', { text: 'LLM Settings' });

    new Setting(containerEl)
      .setName('Anthropic API key')
      .setDesc(
        'API key for LLM concept naming and refinement. If not provided, the LLM step will be skipped.',
      )
      .addText((text) =>
        text
          .setPlaceholder('sk-ant-...')
          .setValue(this.plugin.settings.anthropicApiKey)
          .onChange(async (value) => {
            this.plugin.settings.anthropicApiKey = value;
            await this.plugin.saveSettings();
          }),
      )
      .then((setting) => {
        const inputEl = setting.controlEl.querySelector('input');
        if (inputEl) {
          inputEl.type = 'password';
          inputEl.autocomplete = 'off';
        }
      });

    // Info section
    containerEl.createEl('h3', { text: 'About' });
    containerEl.createEl('p', {
      text: 'AI Recall uses embeddings to cluster your notes into semantic topics. Run the "Run BERTopic Pipeline" command to generate clusters.',
    });

    // Cost information
    const costInfo = containerEl.createEl('div', { cls: 'setting-item-description' });
    costInfo.createEl('strong', { text: 'Estimated costs: ' });
    costInfo.createEl('span', {
      text: 'OpenAI: ~$0.02/1M tokens, Voyage: ~$0.02/1M tokens. A typical 10k note vault costs ~$0.10-0.20 for initial embedding.',
    });
  }
}
