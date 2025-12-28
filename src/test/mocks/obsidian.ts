/**
 * TypeScript mocks for Obsidian API
 * Used for testing without Obsidian runtime
 */

// Basic types
export class TFile {
  path: string;
  basename: string;
  extension: string;
  name: string;
  parent: TFolder | null;
  stat: { ctime: number; mtime: number; size: number };
  vault: Vault;

  constructor(path: string, vault: Vault) {
    this.path = path;
    this.name = path.split('/').pop() || '';
    this.basename = this.name.replace(/\.[^/.]+$/, '');
    this.extension = this.name.split('.').pop() || '';
    this.parent = null;
    this.stat = { ctime: Date.now(), mtime: Date.now(), size: 0 };
    this.vault = vault;
  }
}

export class TFolder {
  path: string;
  name: string;
  parent: TFolder | null;
  children: (TFile | TFolder)[];
  vault: Vault;
  isRoot(): boolean {
    return this.path === '/';
  }

  constructor(path: string, vault: Vault) {
    this.path = path;
    this.name = path.split('/').pop() || '';
    this.parent = null;
    this.children = [];
    this.vault = vault;
  }
}

export abstract class TAbstractFile {
  path = '';
  name = '';
  parent: TFolder | null = null;
  vault: Vault = null as unknown as Vault;
}

export class Vault {
  private files: Map<string, string> = new Map();
  private tfiles: Map<string, TFile> = new Map();

  getMarkdownFiles(): TFile[] {
    return Array.from(this.tfiles.values()).filter((f) => f.extension === 'md');
  }

  getFiles(): TFile[] {
    return Array.from(this.tfiles.values());
  }

  async read(file: TFile): Promise<string> {
    return this.files.get(file.path) || '';
  }

  async cachedRead(file: TFile): Promise<string> {
    return this.read(file);
  }

  async create(path: string, content: string): Promise<TFile> {
    this.files.set(path, content);
    const file = new TFile(path, this);
    this.tfiles.set(path, file);
    return file;
  }

  async modify(file: TFile, content: string): Promise<void> {
    this.files.set(file.path, content);
  }

  async delete(file: TFile): Promise<void> {
    this.files.delete(file.path);
    this.tfiles.delete(file.path);
  }

  getAbstractFileByPath(path: string): TAbstractFile | null {
    return this.tfiles.get(path) || null;
  }

  async adapter_exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  getName(): string {
    return 'MockVault';
  }

  // Helper method for tests
  _addFile(path: string, content: string): void {
    this.files.set(path, content);
    const file = new TFile(path, this);
    this.tfiles.set(path, file);
  }
}

export interface CachedMetadata {
  tags?: { tag: string; position: { start: { line: number }; end: { line: number } } }[];
  headings?: { heading: string; level: number; position: { start: { line: number } } }[];
  links?: { link: string; displayText?: string; position: { start: { line: number } } }[];
  frontmatter?: Record<string, unknown>;
  frontmatterPosition?: { start: { line: number }; end: { line: number } };
  sections?: { type: string; position: { start: { line: number }; end: { line: number } } }[];
}

export class MetadataCache {
  private cache: Map<string, CachedMetadata> = new Map();
  private resolvedLinks: Record<string, Record<string, number>> = {};

  getFileCache(file: TFile): CachedMetadata | null {
    return this.cache.get(file.path) || null;
  }

  getCache(path: string): CachedMetadata | null {
    return this.cache.get(path) || null;
  }

  get resolvedLinks_(): Record<string, Record<string, number>> {
    return this.resolvedLinks;
  }

  getFirstLinkpathDest(_linkpath: string, _sourcePath: string): TFile | null {
    return null;
  }

  // Helper method for tests
  _setCache(path: string, metadata: CachedMetadata): void {
    this.cache.set(path, metadata);
  }

  _setResolvedLinks(links: Record<string, Record<string, number>>): void {
    this.resolvedLinks = links;
  }
}

export class App {
  vault: Vault;
  metadataCache: MetadataCache;
  workspace: Workspace;

  constructor() {
    this.vault = new Vault();
    this.metadataCache = new MetadataCache();
    this.workspace = new Workspace();
  }
}

export class Workspace {
  getActiveFile(): TFile | null {
    return null;
  }

  getLeaf(): WorkspaceLeaf {
    return new WorkspaceLeaf();
  }

  on(_event: string, _callback: (...args: unknown[]) => void): EventRef {
    return { id: Math.random().toString() };
  }

  off(_event: string, _callback: (...args: unknown[]) => void): void {}

  trigger(_event: string, ..._args: unknown[]): void {}
}

export class WorkspaceLeaf {
  view: View | null = null;
}

export class View {
  getViewType(): string {
    return 'unknown';
  }
}

export interface EventRef {
  id: string;
}

export class Plugin {
  app: App;
  manifest: PluginManifest;

  constructor(app: App, manifest: PluginManifest) {
    this.app = app;
    this.manifest = manifest;
  }

  async loadData(): Promise<unknown> {
    return {};
  }

  async saveData(_data: unknown): Promise<void> {}

  addCommand(command: Command): Command {
    return command;
  }

  addRibbonIcon(_icon: string, _title: string, _callback: () => void): HTMLElement {
    return document.createElement('div');
  }

  addSettingTab(_tab: PluginSettingTab): void {}

  registerEvent(_eventRef: EventRef): void {}

  registerInterval(id: number): number {
    return id;
  }
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  description: string;
  author: string;
  authorUrl?: string;
  isDesktopOnly?: boolean;
}

export interface Command {
  id: string;
  name: string;
  callback?: () => void;
  checkCallback?: (checking: boolean) => boolean | undefined;
  hotkeys?: Hotkey[];
}

export interface Hotkey {
  modifiers: string[];
  key: string;
}

export abstract class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
  }

  abstract display(): void;

  hide(): void {}
}

export class Setting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.settingEl = document.createElement('div');
    this.infoEl = document.createElement('div');
    this.nameEl = document.createElement('div');
    this.descEl = document.createElement('div');
    this.controlEl = document.createElement('div');
    containerEl.appendChild(this.settingEl);
  }

  setName(name: string): this {
    this.nameEl.textContent = name;
    return this;
  }

  setDesc(desc: string): this {
    this.descEl.textContent = desc;
    return this;
  }

  addText(cb: (text: TextComponent) => void): this {
    cb(new TextComponent(this.controlEl));
    return this;
  }

  addTextArea(cb: (text: TextAreaComponent) => void): this {
    cb(new TextAreaComponent(this.controlEl));
    return this;
  }

  addToggle(cb: (toggle: ToggleComponent) => void): this {
    cb(new ToggleComponent(this.controlEl));
    return this;
  }

  addDropdown(cb: (dropdown: DropdownComponent) => void): this {
    cb(new DropdownComponent(this.controlEl));
    return this;
  }

  addButton(cb: (button: ButtonComponent) => void): this {
    cb(new ButtonComponent(this.controlEl));
    return this;
  }

  addSlider(cb: (slider: SliderComponent) => void): this {
    cb(new SliderComponent(this.controlEl));
    return this;
  }
}

export class TextComponent {
  inputEl: HTMLInputElement;
  private value = '';

  constructor(containerEl: HTMLElement) {
    this.inputEl = document.createElement('input');
    containerEl.appendChild(this.inputEl);
  }

  getValue(): string {
    return this.value;
  }

  setValue(value: string): this {
    this.value = value;
    this.inputEl.value = value;
    return this;
  }

  setPlaceholder(placeholder: string): this {
    this.inputEl.placeholder = placeholder;
    return this;
  }

  onChange(callback: (value: string) => void): this {
    this.inputEl.addEventListener('change', () => callback(this.inputEl.value));
    return this;
  }
}

export class TextAreaComponent {
  inputEl: HTMLTextAreaElement;
  private value = '';

  constructor(containerEl: HTMLElement) {
    this.inputEl = document.createElement('textarea');
    containerEl.appendChild(this.inputEl);
  }

  getValue(): string {
    return this.value;
  }

  setValue(value: string): this {
    this.value = value;
    this.inputEl.value = value;
    return this;
  }

  setPlaceholder(placeholder: string): this {
    this.inputEl.placeholder = placeholder;
    return this;
  }

  onChange(callback: (value: string) => void): this {
    this.inputEl.addEventListener('change', () => callback(this.inputEl.value));
    return this;
  }
}

export class ToggleComponent {
  toggleEl: HTMLElement;
  private value = false;

  constructor(containerEl: HTMLElement) {
    this.toggleEl = document.createElement('div');
    containerEl.appendChild(this.toggleEl);
  }

  getValue(): boolean {
    return this.value;
  }

  setValue(value: boolean): this {
    this.value = value;
    return this;
  }

  onChange(_callback: (value: boolean) => void): this {
    return this;
  }
}

export class DropdownComponent {
  selectEl: HTMLSelectElement;
  private value = '';

  constructor(containerEl: HTMLElement) {
    this.selectEl = document.createElement('select');
    containerEl.appendChild(this.selectEl);
  }

  getValue(): string {
    return this.value;
  }

  setValue(value: string): this {
    this.value = value;
    return this;
  }

  addOption(value: string, display: string): this {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = display;
    this.selectEl.appendChild(option);
    return this;
  }

  addOptions(options: Record<string, string>): this {
    Object.entries(options).forEach(([value, display]) => {
      this.addOption(value, display);
    });
    return this;
  }

  onChange(callback: (value: string) => void): this {
    this.selectEl.addEventListener('change', () => callback(this.selectEl.value));
    return this;
  }
}

export class ButtonComponent {
  buttonEl: HTMLButtonElement;

  constructor(containerEl: HTMLElement) {
    this.buttonEl = document.createElement('button');
    containerEl.appendChild(this.buttonEl);
  }

  setButtonText(text: string): this {
    this.buttonEl.textContent = text;
    return this;
  }

  setCta(): this {
    this.buttonEl.classList.add('mod-cta');
    return this;
  }

  setWarning(): this {
    this.buttonEl.classList.add('mod-warning');
    return this;
  }

  onClick(callback: () => void): this {
    this.buttonEl.addEventListener('click', callback);
    return this;
  }
}

export class SliderComponent {
  sliderEl: HTMLInputElement;
  private value = 0;

  constructor(containerEl: HTMLElement) {
    this.sliderEl = document.createElement('input');
    this.sliderEl.type = 'range';
    containerEl.appendChild(this.sliderEl);
  }

  getValue(): number {
    return this.value;
  }

  setValue(value: number): this {
    this.value = value;
    this.sliderEl.value = value.toString();
    return this;
  }

  setLimits(min: number, max: number, step: number): this {
    this.sliderEl.min = min.toString();
    this.sliderEl.max = max.toString();
    this.sliderEl.step = step.toString();
    return this;
  }

  setDynamicTooltip(): this {
    return this;
  }

  onChange(callback: (value: number) => void): this {
    this.sliderEl.addEventListener('change', () => callback(Number(this.sliderEl.value)));
    return this;
  }
}

export class Modal {
  app: App;
  containerEl: HTMLElement;
  contentEl: HTMLElement;
  titleEl: HTMLElement;

  constructor(app: App) {
    this.app = app;
    this.containerEl = document.createElement('div');
    this.contentEl = document.createElement('div');
    this.titleEl = document.createElement('div');
  }

  open(): void {}
  close(): void {}
  onOpen(): void {}
  onClose(): void {}
}

export class Notice {
  private _message: string;
  private _timeout?: number;

  constructor(message: string, timeout?: number) {
    this._message = message;
    this._timeout = timeout;
  }

  hide(): void {}

  get message(): string {
    return this._message;
  }

  get timeout(): number | undefined {
    return this._timeout;
  }
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function parseFrontMatterTags(frontmatter: Record<string, unknown>): string[] | null {
  const tags = frontmatter?.tags;
  if (!tags) return null;
  if (Array.isArray(tags)) return tags.map((t) => (t.startsWith('#') ? t : `#${t}`));
  if (typeof tags === 'string') return [tags.startsWith('#') ? tags : `#${tags}`];
  return null;
}

export function parseFrontMatterAliases(frontmatter: Record<string, unknown>): string[] | null {
  const aliases = frontmatter?.aliases;
  if (!aliases) return null;
  if (Array.isArray(aliases)) return aliases;
  if (typeof aliases === 'string') return [aliases];
  return null;
}

export function getLinkpath(link: string): string {
  return link.split('#')[0].split('|')[0];
}

export const Platform = {
  isMobile: false,
  isDesktop: true,
  isMacOS: true,
  isWin: false,
  isLinux: false,
  isIosApp: false,
  isAndroidApp: false,
};

export function requestUrl(
  _request:
    | string
    | { url: string; method?: string; body?: string; headers?: Record<string, string> },
): Promise<{ json: unknown; text: string; status: number }> {
  return Promise.resolve({ json: {}, text: '', status: 200 });
}

export function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number,
  _immediate?: boolean,
): T {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return ((...args: unknown[]) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  }) as T;
}

export function moment(): { format: (f: string) => string } {
  return {
    format: (_f: string) => new Date().toISOString(),
  };
}
