import type IgnitePlugin from '@/main';
import { type App, PluginSettingTab, Setting } from 'obsidian';

/**
 * Plugin settings interface
 */
export interface IgniteSettings {
  /** Anthropic API key for LLM features */
  anthropicApiKey: string;
  /** Glob patterns for files to include (e.g., "notes/**", "projects/*.md") */
  includePaths: string[];
  /** Glob patterns for files to exclude (e.g., "templates/**", "archive/**") */
  excludePaths: string[];
}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: IgniteSettings = {
  anthropicApiKey: '',
  includePaths: [],
  excludePaths: [],
};

/**
 * Settings tab for the Ignite plugin
 */
export class IgniteSettingsTab extends PluginSettingTab {
  plugin: IgnitePlugin;

  constructor(app: App, plugin: IgnitePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl('h2', { text: 'Ignite Settings' });

    // LLM Settings section
    containerEl.createEl('h3', { text: 'API Keys' });

    new Setting(containerEl)
      .setName('Anthropic API key')
      .setDesc('API key for AI-powered features like question generation and research.')
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

    // Path filtering section
    containerEl.createEl('h3', { text: 'Note Filtering' });

    new Setting(containerEl)
      .setName('Include paths')
      .setDesc(
        'Glob patterns for files to include (one per line). Leave empty to include all files. Examples: "notes/**", "projects/*.md"',
      )
      .addTextArea((text) =>
        text
          .setPlaceholder('notes/**\nprojects/*.md')
          .setValue(this.plugin.settings.includePaths.join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.includePaths = value
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.length > 0);
            await this.plugin.saveSettings();
          }),
      )
      .then((setting) => {
        const textAreaEl = setting.controlEl.querySelector('textarea');
        if (textAreaEl) {
          textAreaEl.rows = 4;
        }
      });

    new Setting(containerEl)
      .setName('Exclude paths')
      .setDesc(
        'Glob patterns for files to exclude (one per line). Examples: "templates/**", "archive/**", "*.excalidraw.md"',
      )
      .addTextArea((text) =>
        text
          .setPlaceholder('templates/**\narchive/**\n*.excalidraw.md')
          .setValue(this.plugin.settings.excludePaths.join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.excludePaths = value
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.length > 0);
            await this.plugin.saveSettings();
          }),
      )
      .then((setting) => {
        const textAreaEl = setting.controlEl.querySelector('textarea');
        if (textAreaEl) {
          textAreaEl.rows = 4;
        }
      });

    // Info section
    containerEl.createEl('h3', { text: 'About' });
    containerEl.createEl('p', {
      text: 'Ignite transforms your notes into goal-oriented learning. Create goals, and Ignite will help you achieve mastery through personalized quizzes, research, and drafts.',
    });
  }
}
