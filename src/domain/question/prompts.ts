/**
 * Question Generation Prompts Module
 *
 * Contains system prompts, user prompt builders, and response parsers
 * for LLM-based question generation.
 */

import type { Question, QuestionGenerationRequest, QuestionHistorySummary } from './types';
import { generateQuestionId } from './types';

// ============ System Prompt ============

export const QUESTION_GENERATION_SYSTEM_PROMPT = `You are an expert quiz generator for a spaced repetition learning system.
Your task is to generate high-quality quiz questions from personal knowledge notes.

Guidelines:
1. Generate 2-3 questions per note
2. Vary formats: multiple_choice, true_false, fill_blank, free_form
3. Test understanding, not trivia or memorization of exact wording
4. Include difficulty ratings (easy/medium/hard)
5. Each question should be self-contained (answerable without the note)
6. Avoid questions about dates, names, or trivial details
7. IMPORTANT: Review previously generated questions and avoid duplicates
8. For questions the user struggles with, consider generating related questions that test the same concept differently

Question Format Guidelines:
- multiple_choice: 4 options, one correct. Good for definitions, comparisons
- true_false: One statement to evaluate. Good for common misconceptions
- fill_blank: One key term missing. Good for terminology, syntax
- free_form: Open-ended, 1-2 sentence answer. Good for explanations, "why" questions

Quality Scoring (0-1):
- 0.9-1.0: Tests deep understanding, generalizable knowledge
- 0.7-0.9: Tests important concepts, clear and unambiguous
- 0.5-0.7: Tests useful but narrow knowledge
- <0.5: Trivia, ambiguous, or too easy

Return JSON only, no additional text.`;

// ============ User Prompt Builder ============

/**
 * Build user prompt for question generation
 * Includes optional history context to avoid generating duplicate questions
 */
export function buildQuestionGenerationPrompt(
  request: QuestionGenerationRequest,
  history?: QuestionHistorySummary,
): string {
  const noteDescriptions = request.notes
    .map(
      (note, i) => `
<note_${i + 1}>
Title: ${note.title}
Path: ${note.noteId}
Content:
${note.content.slice(0, 1500)}${note.content.length > 1500 ? '...' : ''}
</note_${i + 1}>`,
    )
    .join('\n');

  // Build history context section
  let historyContext = '';
  if (history) {
    const sections: string[] = [];

    if (history.masteredQuestions.length > 0) {
      sections.push(`## Mastered Questions (DO NOT regenerate these)
${history.masteredQuestions.map((q) => `- ${q}`).join('\n')}`);
    }

    if (history.wellKnownQuestions.length > 0) {
      sections.push(`## Well-Known Questions (avoid similar questions)
${history.wellKnownQuestions.map((q) => `- ${q}`).join('\n')}`);
    }

    if (history.strugglingQuestions.length > 0) {
      sections.push(`## Questions User Struggles With (consider variations)
${history.strugglingQuestions.map((q) => `- ${q}`).join('\n')}`);
    }

    if (history.recentlyShownQuestions.length > 0) {
      sections.push(`## Recently Shown (avoid immediate repetition)
${history.recentlyShownQuestions.map((q) => `- ${q}`).join('\n')}`);
    }

    if (sections.length > 0) {
      historyContext = `
<previous_questions>
${sections.join('\n\n')}
</previous_questions>
`;
    }
  }

  return `Generate quiz questions for these ${request.notes.length} notes:
${noteDescriptions}
${historyContext}
Return JSON array:
[
  {
    "sourceNoteId": "path/to/note.md",
    "format": "multiple_choice",
    "difficulty": "medium",
    "question": "What is...",
    "options": ["A", "B", "C", "D"],
    "correctAnswer": 0,
    "qualityScore": 0.85,
    "explanation": "Brief explanation why this is correct"
  },
  ...
]

Requirements:
- Generate 2-3 questions per note
- Vary formats across questions
- Ensure each question has a clear, unambiguous correct answer
- Rate your own question quality honestly
- For fill_blank, use ___ to mark the blank in the question
- AVOID generating questions similar to those listed in <previous_questions>`;
}

// ============ Response Parser ============

/**
 * Extract JSON from LLM response
 */
function extractJSON(response: string): string {
  let cleaned = response.trim();

  // Try to extract from ```json ... ``` blocks
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    cleaned = jsonBlockMatch[1].trim();
  }

  // Find array start
  const arrayStart = cleaned.indexOf('[');
  if (arrayStart === -1) {
    throw new Error('No JSON array found in response');
  }

  // Find matching end
  let depth = 0;
  let end = arrayStart;

  for (let i = arrayStart; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === '[' || char === '{') depth++;
    else if (char === ']' || char === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  return cleaned.slice(arrayStart, end);
}

/**
 * Validate question format
 */
const VALID_FORMATS = ['multiple_choice', 'true_false', 'fill_blank', 'free_form'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

function validateQuestion(item: Record<string, unknown>): boolean {
  if (typeof item.sourceNoteId !== 'string') return false;
  if (typeof item.question !== 'string') return false;
  if (!VALID_FORMATS.includes(item.format as string)) return false;
  if (!VALID_DIFFICULTIES.includes(item.difficulty as string)) return false;

  // Format-specific validation
  if (item.format === 'multiple_choice') {
    if (!Array.isArray(item.options) || item.options.length !== 4) return false;
    if (typeof item.correctAnswer !== 'number') return false;
  }

  return true;
}

/**
 * Parse LLM response into questions
 */
export function parseQuestionResponse(response: string): Question[] {
  const json = extractJSON(response);
  const parsed = JSON.parse(json);

  if (!Array.isArray(parsed)) {
    throw new Error('Expected array of questions');
  }

  const questions: Question[] = [];

  for (const item of parsed) {
    if (!validateQuestion(item as Record<string, unknown>)) {
      console.warn('Skipping invalid question:', item);
      continue;
    }

    questions.push({
      id: generateQuestionId(),
      format: item.format as Question['format'],
      difficulty: item.difficulty as Question['difficulty'],
      question: item.question,
      sourceNoteId: item.sourceNoteId,
      qualityScore:
        typeof item.qualityScore === 'number' ? Math.max(0, Math.min(1, item.qualityScore)) : 0.5,
      options: item.format === 'multiple_choice' ? item.options : undefined,
      correctAnswer: item.correctAnswer,
      explanation: typeof item.explanation === 'string' ? item.explanation : undefined,
      generatedAt: Date.now(),
    });
  }

  return questions;
}
