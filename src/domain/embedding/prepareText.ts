import { estimateTokens } from './tokenUtils';
import { DEFAULT_TEXT_PREPARE_CONFIG, type TextPrepareConfig } from './types';

// Re-export for backwards compatibility
export { estimateTokens };

/**
 * Prepare text content for embedding
 * Applies transformations to optimize for semantic understanding
 */
export function prepareTextForEmbedding(
  content: string,
  config: Partial<TextPrepareConfig> = {},
): string {
  const fullConfig = { ...DEFAULT_TEXT_PREPARE_CONFIG, ...config };
  let text = content;

  if (fullConfig.stripFrontmatter) {
    text = stripFrontmatter(text);
  }

  if (fullConfig.summarizeCode) {
    text = summarizeCodeBlocks(text);
  }

  if (fullConfig.stripImages) {
    text = stripImages(text);
  }

  // Normalize whitespace
  text = normalizeWhitespace(text);

  // Truncate if needed
  if (fullConfig.maxTokens > 0) {
    text = truncateToTokenLimit(text, fullConfig.maxTokens);
  }

  return text;
}

/**
 * Strip YAML frontmatter from markdown content
 * Frontmatter is delimited by --- at start and end
 */
export function stripFrontmatter(content: string): string {
  // Match frontmatter at the very beginning of the document
  // Use [\s\S]*? to match any content (including empty) between delimiters
  const frontmatterRegex = /^---\r?\n[\s\S]*?---\r?\n?/;
  return content.replace(frontmatterRegex, '');
}

/**
 * Summarize code blocks to reduce token usage
 * Replaces full code blocks with [code: language] placeholders
 */
export function summarizeCodeBlocks(content: string): string {
  // Match fenced code blocks with optional language
  const codeBlockRegex = /```(\w*)\r?\n[\s\S]*?```/g;

  return content.replace(codeBlockRegex, (_match, language) => {
    const lang = language || 'code';
    return `[code: ${lang}]`;
  });
}

/**
 * Strip images but keep alt text for context
 * Replaces ![alt](url) with [image: alt]
 */
export function stripImages(content: string): string {
  // Match markdown images: ![alt text](url) or ![alt text](url "title")
  const imageRegex = /!\[([^\]]*)\]\([^)]+\)/g;

  return content.replace(imageRegex, (_match, altText) => {
    const alt = altText.trim() || 'image';
    return `[image: ${alt}]`;
  });
}

/**
 * Normalize whitespace in text
 * - Collapse multiple newlines to double newlines
 * - Collapse multiple spaces to single space
 * - Trim leading/trailing whitespace
 */
export function normalizeWhitespace(content: string): string {
  return content
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
    .replace(/[ \t]+/g, ' ') // Collapse multiple spaces/tabs
    .replace(/^ +/gm, '') // Remove leading spaces from lines
    .trim();
}

/**
 * Truncate text to fit within token limit
 * Tries to truncate at word/sentence boundaries when possible
 */
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const currentTokens = estimateTokens(text);

  if (currentTokens <= maxTokens) {
    return text;
  }

  // Estimate chars to keep based on ratio
  // Use a slightly conservative estimate to ensure we're under the limit
  const ratio = maxTokens / currentTokens;
  const targetLength = Math.floor(text.length * ratio * 0.95);

  // Find a good truncation point (prefer sentence/paragraph boundaries)
  let truncateAt = targetLength;

  // Look for paragraph break
  const paragraphBreak = text.lastIndexOf('\n\n', targetLength);
  if (paragraphBreak > targetLength * 0.7) {
    truncateAt = paragraphBreak;
  } else {
    // Look for sentence break
    const sentenceBreak = findLastSentenceBreak(text, targetLength);
    if (sentenceBreak > targetLength * 0.7) {
      truncateAt = sentenceBreak;
    } else {
      // Look for word break
      const wordBreak = text.lastIndexOf(' ', targetLength);
      if (wordBreak > targetLength * 0.8) {
        truncateAt = wordBreak;
      }
    }
  }

  let truncated = text.slice(0, truncateAt).trim();

  // Add truncation indicator
  truncated += '\n\n[content truncated]';

  return truncated;
}

/**
 * Find the last sentence break before a position
 */
function findLastSentenceBreak(text: string, beforePos: number): number {
  const sentenceEnders = ['. ', '! ', '? ', '。', '！', '？'];
  let lastBreak = -1;

  for (const ender of sentenceEnders) {
    const pos = text.lastIndexOf(ender, beforePos);
    if (pos > lastBreak) {
      lastBreak = pos + ender.length;
    }
  }

  return lastBreak;
}

/**
 * Generate a content hash for change detection
 * Uses a sample of the content for efficiency with large files
 */
export function generateContentHash(content: string): string {
  // Normalize whitespace for consistent hashing
  const normalized = content.replace(/\s+/g, ' ').trim();

  // For long content, use a sample (first 1000 + last 500 chars + length)
  const sample =
    normalized.length <= 1500 ? normalized : normalized.slice(0, 1000) + normalized.slice(-500);

  // Simple string hash (djb2 algorithm)
  return hashString(`${sample}:${normalized.length}`);
}

/**
 * Hash a string using djb2 algorithm
 * Returns a hex string
 */
export function hashString(str: string): string {
  let hash = 5381;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) + hash + char; // hash * 33 + char
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Convert to positive hex string
  return (hash >>> 0).toString(16).padStart(8, '0');
}
