/**
 * Question Cache Module
 *
 * Manages caching of generated questions per note.
 * Cache is invalidated when content or history changes.
 */

import { hashString } from '@/domain/embedding/prepareText';
import type { IStorageAdapter } from '@/ports/IStorageAdapter';
import type { Question, QuestionCacheEntry, QuestionGenerationConfig } from './types';
import { QUESTION_CACHE_VERSION } from './types';

const CACHE_KEY_PREFIX = 'cache/questions';

/**
 * Get storage key for question cache
 * Reuses existing hashString utility from prepareText.ts
 */
export function getQuestionCacheKey(notePath: string): string {
  const normalized = notePath.toLowerCase().replace(/\\/g, '/');
  return `${CACHE_KEY_PREFIX}/${hashString(normalized).slice(0, 8)}`;
}

/**
 * Manages question cache for efficient question generation
 */
export class QuestionCacheManager {
  private storage: IStorageAdapter;
  private maxAgeDays: number;

  constructor(storage: IStorageAdapter, config: Partial<QuestionGenerationConfig> = {}) {
    this.storage = storage;
    this.maxAgeDays = config.cacheMaxAgeDays ?? 7;
  }

  /**
   * Get cached questions for a note if valid
   *
   * Cache is invalidated when:
   * 1. Content has changed (contentHash mismatch)
   * 2. Question history has changed significantly (historyFingerprint mismatch)
   * 3. Cache has expired (age > maxAgeDays)
   */
  async get(
    notePath: string,
    contentHash: string,
    historyFingerprint: string,
  ): Promise<Question[] | null> {
    const key = getQuestionCacheKey(notePath);
    const entry = await this.storage.read<QuestionCacheEntry>(key);

    if (!entry) return null;
    if (entry.version !== QUESTION_CACHE_VERSION) return null;
    if (entry.contentHash !== contentHash) return null;
    if (entry.historyFingerprint !== historyFingerprint) return null;
    if (this.isExpired(entry.generatedAt)) return null;

    return entry.questions;
  }

  /**
   * Check if cache is valid without returning questions
   */
  async isValid(
    notePath: string,
    contentHash: string,
    historyFingerprint: string,
  ): Promise<boolean> {
    const questions = await this.get(notePath, contentHash, historyFingerprint);
    return questions !== null;
  }

  /**
   * Store questions for a note
   */
  async set(
    notePath: string,
    contentHash: string,
    historyFingerprint: string,
    questions: Question[],
  ): Promise<void> {
    const key = getQuestionCacheKey(notePath);
    const entry: QuestionCacheEntry = {
      version: QUESTION_CACHE_VERSION,
      notePath,
      contentHash,
      historyFingerprint,
      generatedAt: Date.now(),
      questions,
    };
    await this.storage.write(key, entry);
  }

  /**
   * Invalidate cache for a note
   */
  async invalidate(notePath: string): Promise<void> {
    const key = getQuestionCacheKey(notePath);
    await this.storage.delete(key);
  }

  /**
   * Check if entry is expired
   */
  private isExpired(generatedAt: number): boolean {
    const ageMs = Date.now() - generatedAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return ageDays > this.maxAgeDays;
  }

  /**
   * Get all cache keys (note: these are hashed keys, not original paths)
   *
   * The cache uses hashed keys for storage efficiency and to avoid path length issues.
   * To check if a specific note is cached, use `isValid()` with the note path.
   *
   * @returns Array of hashed cache key suffixes
   */
  async getAllCacheKeys(): Promise<string[]> {
    const keys = await this.storage.keys();
    return keys
      .filter((key) => key.startsWith(CACHE_KEY_PREFIX))
      .map((key) => key.replace(`${CACHE_KEY_PREFIX}/`, ''));
  }

  /**
   * Get count of cached entries
   */
  async getCacheCount(): Promise<number> {
    const keys = await this.getAllCacheKeys();
    return keys.length;
  }

  /**
   * Clean up expired entries
   */
  async cleanup(): Promise<{ removed: number }> {
    const keys = await this.storage.keys();
    const cacheKeys = keys.filter((key) => key.startsWith(CACHE_KEY_PREFIX));

    let removed = 0;
    for (const key of cacheKeys) {
      const entry = await this.storage.read<QuestionCacheEntry>(key);
      if (entry && this.isExpired(entry.generatedAt)) {
        await this.storage.delete(key);
        removed++;
      }
    }

    return { removed };
  }
}
