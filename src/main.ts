import { IGNITE_VIEW_TYPE, IgniteView } from '@/adapters/obsidian';
import { DEFAULT_SETTINGS, type IgniteSettings, IgniteSettingsTab } from '@/settings';
import { Plugin } from 'obsidian';

/**
 * Ignite Plugin for Obsidian
 * Goal-oriented learning that transforms your notes into actionable knowledge
 */
export default class IgnitePlugin extends Plugin {
  settings: IgniteSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    console.log('Loading Ignite plugin');

    // Load settings
    await this.loadSettings();

    // Register settings tab
    this.addSettingTab(new IgniteSettingsTab(this.app, this));

    // Register the Ignite view
    this.registerView(IGNITE_VIEW_TYPE, (leaf) => new IgniteView(leaf, this.settings));

    // Add ribbon icon to open Ignite
    this.addRibbonIcon('flame', 'Open Ignite', () => {
      this.activateIgniteView();
    });

    // Add command to open Ignite
    this.addCommand({
      id: 'open-ignite-view',
      name: 'Open Ignite panel',
      callback: () => {
        this.activateIgniteView();
      },
    });
  }

  async onunload(): Promise<void> {
    console.log('Unloading Ignite plugin');
    // Detach all Ignite views
    this.app.workspace.detachLeavesOfType(IGNITE_VIEW_TYPE);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async activateIgniteView(): Promise<void> {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(IGNITE_VIEW_TYPE)[0];

    if (!leaf) {
      // Open in right sidebar
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: IGNITE_VIEW_TYPE,
          active: true,
        });
        leaf = rightLeaf;
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
}
