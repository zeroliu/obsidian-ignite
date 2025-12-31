import { createNoteRelevancePrompt } from '@/adapters/anthropic/prompts/noteRelevance';
import { filterByIncludePatterns, filterExcludedPaths } from '@/domain/pipeline/pathFilter';
import type { ILLMProvider, IVaultProvider } from '@/ports';
import type { GoalDraft } from './BrainstormService';

/**
 * Represents a note with its relevance score.
 */
export interface ScoredNote {
  path: string;
  score: number;
  reason: string;
  preview?: string;
}

/**
 * Service for AI-based note relevance scoring.
 */
export class NoteRelevanceService {
  constructor(
    private vaultProvider: IVaultProvider,
    private llmProvider: ILLMProvider,
  ) {}

  /**
   * Score all notes in the vault for relevance to a goal.
   * Returns notes sorted by relevance score (highest first).
   */
  async scoreNotes(
    goalDraft: GoalDraft,
    includePatterns: string[],
    excludePatterns: string[],
  ): Promise<ScoredNote[]> {
    // Get all markdown files
    let files = await this.vaultProvider.listMarkdownFiles();

    // Filter by include patterns
    files = filterByIncludePatterns(files, includePatterns);

    // Filter by exclude patterns
    const { included } = filterExcludedPaths(files, excludePatterns);
    files = included;

    // Exclude ignite folder
    files = files.filter((file) => !file.path.startsWith('ignite/'));

    if (files.length === 0) {
      return [];
    }

    // Read file contents for analysis
    const notesWithContent = await Promise.all(
      files.map(async (file) => {
        const content = await this.vaultProvider.readFile(file.path);
        return {
          path: file.path,
          content,
          preview: this.createPreview(content),
        };
      }),
    );

    // Build prompt with note previews
    const systemPrompt = createNoteRelevancePrompt(goalDraft.name, goalDraft.description);

    // Build user message with note previews
    const notesDescription = notesWithContent
      .map((note) => {
        return `### ${note.path}\n${note.preview}`;
      })
      .join('\n\n');

    const userMessage = `Please score the relevance of the following notes to the learning goal:\n\n${notesDescription}`;

    // Call LLM for scoring
    const response = await this.llmProvider.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      {
        temperature: 0.3,
        maxTokens: 4000,
      },
    );

    // Parse the response
    const scores = this.parseScores(response.content);

    // Combine scores with note data
    const scoredNotes = scores
      .map((score) => {
        const note = notesWithContent.find((n) => n.path === score.notePath);
        if (!note) {
          return null;
        }
        return {
          path: note.path,
          score: score.score,
          reason: score.reason,
          preview: note.preview,
        };
      })
      .filter(
        (note): note is { path: string; score: number; reason: string; preview: string } =>
          note !== null,
      );

    // Sort by score descending
    scoredNotes.sort((a, b) => b.score - a.score);

    return scoredNotes;
  }

  /**
   * Create a preview of note content (first 500 characters).
   */
  private createPreview(content: string): string {
    const preview = content.substring(0, 500).trim();
    if (content.length > 500) {
      return `${preview}...`;
    }
    return preview;
  }

  /**
   * Parse LLM response to extract scores.
   */
  private parseScores(
    response: string,
  ): Array<{ notePath: string; score: number; reason: string }> {
    // Look for JSON code block
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) {
      return [];
    }

    try {
      const parsed = JSON.parse(jsonMatch[1]);

      if (!Array.isArray(parsed)) {
        return [];
      }

      // Validate and extract scores
      return parsed
        .filter((item) => {
          return (
            typeof item === 'object' &&
            item !== null &&
            typeof item.notePath === 'string' &&
            typeof item.score === 'number' &&
            typeof item.reason === 'string'
          );
        })
        .map((item) => ({
          notePath: item.notePath,
          score: Math.max(0, Math.min(100, item.score)), // Clamp to 0-100
          reason: item.reason,
        }));
    } catch (error) {
      console.error('Failed to parse note scores:', error);
      return [];
    }
  }
}
