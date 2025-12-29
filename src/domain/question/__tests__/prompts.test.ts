import { describe, expect, it } from 'vitest';
import {
  QUESTION_GENERATION_SYSTEM_PROMPT,
  buildQuestionGenerationPrompt,
  parseQuestionResponse,
} from '../prompts';

describe('QUESTION_GENERATION_SYSTEM_PROMPT', () => {
  it('includes format guidelines', () => {
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('multiple_choice');
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('true_false');
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('fill_blank');
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('free_form');
  });

  it('includes quality scoring guidelines', () => {
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('Quality Scoring');
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('0.9-1.0');
  });

  it('instructs to return JSON only', () => {
    expect(QUESTION_GENERATION_SYSTEM_PROMPT).toContain('Return JSON only');
  });
});

describe('buildQuestionGenerationPrompt', () => {
  it('includes note content', () => {
    const prompt = buildQuestionGenerationPrompt({
      notes: [
        {
          noteId: 'test.md',
          title: 'Test Note',
          content: 'This is the note content about TypeScript.',
        },
      ],
    });

    expect(prompt).toContain('Test Note');
    expect(prompt).toContain('test.md');
    expect(prompt).toContain('TypeScript');
  });

  it('truncates long content', () => {
    const longContent = 'A'.repeat(2000);
    const prompt = buildQuestionGenerationPrompt({
      notes: [
        {
          noteId: 'test.md',
          title: 'Test Note',
          content: longContent,
        },
      ],
    });

    expect(prompt).toContain('...');
    expect(prompt.length).toBeLessThan(longContent.length + 500);
  });

  it('handles multiple notes', () => {
    const prompt = buildQuestionGenerationPrompt({
      notes: [
        { noteId: 'a.md', title: 'Note A', content: 'Content A' },
        { noteId: 'b.md', title: 'Note B', content: 'Content B' },
      ],
    });

    expect(prompt).toContain('Note A');
    expect(prompt).toContain('Note B');
    expect(prompt).toContain('2 notes');
  });

  it('includes history context when provided', () => {
    const prompt = buildQuestionGenerationPrompt(
      {
        notes: [{ noteId: 'test.md', title: 'Test', content: 'Content' }],
      },
      {
        masteredQuestions: ['What is X?'],
        wellKnownQuestions: ['What is Y?'],
        strugglingQuestions: ['What is Z?'],
        recentlyShownQuestions: ['What is W?'],
      },
    );

    expect(prompt).toContain('Mastered Questions');
    expect(prompt).toContain('What is X?');
    expect(prompt).toContain('Well-Known Questions');
    expect(prompt).toContain('What is Y?');
    expect(prompt).toContain('Questions User Struggles With');
    expect(prompt).toContain('What is Z?');
    expect(prompt).toContain('Recently Shown');
    expect(prompt).toContain('What is W?');
  });

  it('excludes empty history sections', () => {
    const prompt = buildQuestionGenerationPrompt(
      {
        notes: [{ noteId: 'test.md', title: 'Test', content: 'Content' }],
      },
      {
        masteredQuestions: [],
        wellKnownQuestions: ['Known question'],
        strugglingQuestions: [],
        recentlyShownQuestions: [],
      },
    );

    expect(prompt).not.toContain('Mastered Questions');
    expect(prompt).toContain('Well-Known Questions');
    expect(prompt).not.toContain('Questions User Struggles With');
    expect(prompt).not.toContain('Recently Shown');
  });

  it('includes JSON format requirements', () => {
    const prompt = buildQuestionGenerationPrompt({
      notes: [{ noteId: 'test.md', title: 'Test', content: 'Content' }],
    });

    expect(prompt).toContain('Return JSON array');
    expect(prompt).toContain('sourceNoteId');
    expect(prompt).toContain('format');
    expect(prompt).toContain('difficulty');
  });
});

describe('parseQuestionResponse', () => {
  it('parses valid JSON array', () => {
    const response = JSON.stringify([
      {
        sourceNoteId: 'test.md',
        format: 'multiple_choice',
        difficulty: 'medium',
        question: 'What is X?',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 0,
        qualityScore: 0.85,
        explanation: 'Because A is correct',
      },
    ]);

    const questions = parseQuestionResponse(response);
    expect(questions).toHaveLength(1);
    expect(questions[0].question).toBe('What is X?');
    expect(questions[0].format).toBe('multiple_choice');
    expect(questions[0].options).toEqual(['A', 'B', 'C', 'D']);
  });

  it('extracts JSON from markdown code blocks', () => {
    const response = `Here are the questions:
\`\`\`json
[
  {
    "sourceNoteId": "test.md",
    "format": "true_false",
    "difficulty": "easy",
    "question": "Is X true?",
    "correctAnswer": "true",
    "qualityScore": 0.7
  }
]
\`\`\``;

    const questions = parseQuestionResponse(response);
    expect(questions).toHaveLength(1);
    expect(questions[0].format).toBe('true_false');
  });

  it('handles questions with missing optional fields', () => {
    const response = JSON.stringify([
      {
        sourceNoteId: 'test.md',
        format: 'free_form',
        difficulty: 'hard',
        question: 'Explain X',
        correctAnswer: 'X is...',
      },
    ]);

    const questions = parseQuestionResponse(response);
    expect(questions).toHaveLength(1);
    expect(questions[0].qualityScore).toBe(0.5); // Default
    expect(questions[0].explanation).toBeUndefined();
  });

  it('clamps quality score to 0-1 range', () => {
    const response = JSON.stringify([
      {
        sourceNoteId: 'test.md',
        format: 'free_form',
        difficulty: 'medium',
        question: 'Q1',
        correctAnswer: 'A',
        qualityScore: 1.5,
      },
      {
        sourceNoteId: 'test.md',
        format: 'free_form',
        difficulty: 'medium',
        question: 'Q2',
        correctAnswer: 'A',
        qualityScore: -0.5,
      },
    ]);

    const questions = parseQuestionResponse(response);
    expect(questions[0].qualityScore).toBe(1);
    expect(questions[1].qualityScore).toBe(0);
  });

  it('skips invalid questions', () => {
    const response = JSON.stringify([
      {
        // Missing sourceNoteId
        format: 'multiple_choice',
        difficulty: 'medium',
        question: 'Invalid',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 0,
      },
      {
        sourceNoteId: 'test.md',
        format: 'multiple_choice',
        difficulty: 'medium',
        question: 'Valid',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 0,
      },
    ]);

    const questions = parseQuestionResponse(response);
    expect(questions).toHaveLength(1);
    expect(questions[0].question).toBe('Valid');
  });

  it('validates multiple choice has 4 options', () => {
    const response = JSON.stringify([
      {
        sourceNoteId: 'test.md',
        format: 'multiple_choice',
        difficulty: 'medium',
        question: 'Invalid - only 2 options',
        options: ['A', 'B'],
        correctAnswer: 0,
      },
    ]);

    const questions = parseQuestionResponse(response);
    expect(questions).toHaveLength(0);
  });

  it('generates unique IDs for each question', () => {
    const response = JSON.stringify([
      {
        sourceNoteId: 'test.md',
        format: 'free_form',
        difficulty: 'easy',
        question: 'Q1',
        correctAnswer: 'A',
      },
      {
        sourceNoteId: 'test.md',
        format: 'free_form',
        difficulty: 'easy',
        question: 'Q2',
        correctAnswer: 'B',
      },
    ]);

    const questions = parseQuestionResponse(response);
    expect(questions[0].id).not.toBe(questions[1].id);
  });

  it('throws for response without JSON array', () => {
    // When response has no array at all, extractJSON throws
    expect(() => parseQuestionResponse('Just some text without JSON')).toThrow(
      'No JSON array found',
    );
    // An object without an array also fails
    expect(() => parseQuestionResponse('{"key": "value"}')).toThrow('No JSON array found');
  });

  it('throws when no JSON found', () => {
    expect(() => parseQuestionResponse('No JSON here')).toThrow('No JSON array found');
  });
});
