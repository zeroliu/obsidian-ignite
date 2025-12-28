/**
 * CJK character pattern for Chinese, Japanese, and Korean detection
 * - \u4e00-\u9fff: CJK Unified Ideographs
 * - \u3400-\u4dbf: CJK Unified Ideographs Extension A
 * - \uac00-\ud7af: Hangul Syllables (Korean)
 * - \u3040-\u309f: Hiragana (Japanese)
 * - \u30a0-\u30ff: Katakana (Japanese)
 */
const CJK_PATTERN = /[\u4e00-\u9fff\u3400-\u4dbf\uac00-\ud7af\u3040-\u309f\u30a0-\u30ff]/g;

/**
 * Estimate the number of tokens in a text
 *
 * Uses a conservative approximation based on character counts:
 * - English/Latin text: ~1.5 characters per token (very conservative for cl100k_base)
 * - CJK text: ~1 character per token (conservative for CJK content)
 *
 * These estimates are intentionally conservative to ensure we don't exceed
 * API limits. Actual token counts may be lower, but underestimating is safe
 * for truncation purposes.
 *
 * @param text - The text to estimate tokens for
 * @returns Estimated token count (conservative upper bound)
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // Count CJK characters
  const cjkMatches = text.match(CJK_PATTERN);
  const cjkCount = cjkMatches?.length ?? 0;

  // Non-CJK text: ~1.5 chars per token (very conservative to ensure we never exceed limits)
  // CJK text: ~1 char per token (conservative - each CJK char can be 1+ tokens)
  const nonCjkLength = text.length - cjkCount;
  const nonCjkTokens = Math.ceil(nonCjkLength / 1.5);
  const cjkTokens = cjkCount; // 1:1 ratio for safety

  return nonCjkTokens + cjkTokens;
}
