import { BRAINSTORM_SYSTEM_PROMPT } from '@/adapters/anthropic/prompts/brainstorm';
import type { ILLMProvider, LLMMessage, LLMStreamCallbacks } from '@/ports';
import type { Milestone } from './types';

/**
 * Represents a goal draft extracted from conversation.
 */
export interface GoalDraft {
  name: string;
  description: string;
  deadline: string;
  milestones: string[];
}

/**
 * Service for goal creation through conversational brainstorming.
 */
export class BrainstormService {
  constructor(private llmProvider: ILLMProvider) {}

  /**
   * Stream a response from the brainstorming conversation.
   */
  async streamResponse(
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    callbacks: LLMStreamCallbacks,
  ): Promise<void> {
    const messages: LLMMessage[] = [
      { role: 'system', content: BRAINSTORM_SYSTEM_PROMPT },
      ...conversationHistory.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    ];

    await this.llmProvider.streamChat(messages, callbacks, {
      temperature: 0.7,
      maxTokens: 2000,
    });
  }

  /**
   * Extract a goal draft from the assistant's response.
   * Returns null if no valid goal structure is found.
   */
  extractGoalDraft(response: string): GoalDraft | null {
    // Look for JSON code block
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) {
      return null;
    }

    try {
      const parsed = JSON.parse(jsonMatch[1]);

      // Validate required fields
      if (
        !parsed.name ||
        !parsed.description ||
        !parsed.deadline ||
        !Array.isArray(parsed.milestones) ||
        parsed.milestones.length === 0
      ) {
        return null;
      }

      // Validate types
      if (
        typeof parsed.name !== 'string' ||
        typeof parsed.description !== 'string' ||
        typeof parsed.deadline !== 'string'
      ) {
        return null;
      }

      // Validate all milestones are strings
      if (!parsed.milestones.every((m: unknown) => typeof m === 'string')) {
        return null;
      }

      return {
        name: parsed.name.trim(),
        description: parsed.description.trim(),
        deadline: parsed.deadline.trim(),
        milestones: parsed.milestones.map((m: string) => m.trim()),
      };
    } catch (error) {
      // JSON parsing failed
      return null;
    }
  }

  /**
   * Convert goal draft to milestone objects.
   */
  convertToMilestones(milestoneTexts: string[]): Milestone[] {
    return milestoneTexts.map((content, index) => ({
      id: `milestone-${Date.now()}-${index}`,
      content,
      completed: false,
      order: index,
    }));
  }
}
