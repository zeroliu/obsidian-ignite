import type {
  FileMetadata,
  HeadingInfo,
  IMetadataProvider,
  ResolvedLinks,
} from '@/ports/IMetadataProvider';
import { type App, type CachedMetadata, TFile } from 'obsidian';

/**
 * Real Obsidian implementation of IMetadataProvider
 * Uses Obsidian's App.metadataCache API
 */
export class ObsidianMetadataAdapter implements IMetadataProvider {
  constructor(private app: App) {}

  async getFileMetadata(path: string): Promise<FileMetadata | null> {
    const cache = this.app.metadataCache.getCache(path);
    if (!cache) {
      return null;
    }

    // Read file content for word count calculation
    const file = this.app.vault.getAbstractFileByPath(path);
    let content = '';
    if (file instanceof TFile) {
      content = await this.app.vault.cachedRead(file);
    }

    return this.toFileMetadata(path, cache, content);
  }

  async getResolvedLinks(): Promise<ResolvedLinks> {
    // Obsidian's resolvedLinks is already in the correct format:
    // Record<string, Record<string, number>>
    return this.app.metadataCache.resolvedLinks;
  }

  async getBacklinks(path: string): Promise<string[]> {
    const resolvedLinks = this.app.metadataCache.resolvedLinks;
    const backlinks: string[] = [];

    for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
      if (path in targets) {
        backlinks.push(sourcePath);
      }
    }
    return backlinks;
  }

  async getAllTags(): Promise<string[]> {
    const tagSet = new Set<string>();
    const files = this.app.vault.getMarkdownFiles();

    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache?.tags) {
        for (const tagCache of cache.tags) {
          tagSet.add(tagCache.tag);
        }
      }
      // Also check frontmatter tags
      if (cache?.frontmatter?.tags) {
        this.extractFrontmatterTags(cache.frontmatter.tags, tagSet);
      }
    }
    return Array.from(tagSet).sort();
  }

  private toFileMetadata(path: string, cache: CachedMetadata, content: string): FileMetadata {
    // Extract tags from inline tags and frontmatter
    const tagSet = new Set<string>();
    if (cache.tags) {
      for (const tagCache of cache.tags) {
        tagSet.add(tagCache.tag);
      }
    }
    if (cache.frontmatter?.tags) {
      this.extractFrontmatterTags(cache.frontmatter.tags, tagSet);
    }
    const tags = Array.from(tagSet);

    // Extract links
    const links: string[] = [];
    if (cache.links) {
      for (const linkCache of cache.links) {
        links.push(linkCache.link);
      }
    }

    // Extract headings
    const headings: HeadingInfo[] = [];
    if (cache.headings) {
      for (const headingCache of cache.headings) {
        headings.push({
          heading: headingCache.heading,
          level: headingCache.level,
          line: headingCache.position.start.line,
        });
      }
    }

    // Extract frontmatter (excluding 'position' key)
    const frontmatter: Record<string, unknown> = {};
    if (cache.frontmatter) {
      for (const [key, value] of Object.entries(cache.frontmatter)) {
        if (key !== 'position') {
          frontmatter[key] = value;
        }
      }
    }

    // Calculate word count from content
    const wordCount = this.countWords(content);

    return {
      path,
      tags,
      links,
      headings,
      frontmatter,
      wordCount,
    };
  }

  private extractFrontmatterTags(fmTags: unknown, tagSet: Set<string>): void {
    if (Array.isArray(fmTags)) {
      for (const tag of fmTags) {
        if (typeof tag === 'string') {
          const normalized = tag.startsWith('#') ? tag : `#${tag}`;
          tagSet.add(normalized);
        }
      }
    } else if (typeof fmTags === 'string') {
      const normalized = fmTags.startsWith('#') ? fmTags : `#${fmTags}`;
      tagSet.add(normalized);
    }
  }

  /**
   * Count words in content, handling both Latin and CJK text
   */
  private countWords(content: string): number {
    if (!content) {
      return 0;
    }

    // Remove frontmatter (YAML between --- markers)
    const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n?/, '');

    // Remove code blocks
    const withoutCode = withoutFrontmatter.replace(/```[\s\S]*?```/g, '');

    // Remove inline code
    const withoutInlineCode = withoutCode.replace(/`[^`]+`/g, '');

    // Remove wiki-links but keep display text
    const withoutLinks = withoutInlineCode.replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1');

    // Remove markdown links but keep display text
    const withoutMdLinks = withoutLinks.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // Remove HTML tags
    const withoutHtml = withoutMdLinks.replace(/<[^>]+>/g, '');

    // Count Latin words (split by whitespace and punctuation)
    const latinWords = withoutHtml
      .split(/[\s\p{P}]+/u)
      .filter((word) => word.length > 0 && /[a-zA-Z]/.test(word));

    // Count CJK characters (each character counts as a word)
    const cjkChars = withoutHtml.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g);
    const cjkCount = cjkChars?.length ?? 0;

    return latinWords.length + cjkCount;
  }
}
