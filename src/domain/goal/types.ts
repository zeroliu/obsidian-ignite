/**
 * Data models for goal-oriented learning features.
 * All types use discriminated unions for type safety where applicable.
 */

/**
 * Represents a learning goal with milestones, assigned notes, and metadata.
 */
export interface Goal {
  id: string;
  name: string;
  description: string;
  deadline: string; // ISO date
  milestones: Milestone[];
  notesPaths: string[];
  status: 'active' | 'completed';
  createdAt: string;
  updatedAt: string;
}

/**
 * Represents a milestone within a goal.
 */
export interface Milestone {
  id: string;
  content: string;
  completed: boolean;
  order: number;
}

/**
 * Represents a conversation/discussion session for a goal.
 */
export interface Conversation {
  id: string;
  goalId: string;
  topic: string; // AI-generated
  messages: ChatMessage[];
  createdAt: string;
}

/**
 * Represents a single message in a conversation.
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[]; // Note paths used
  timestamp: string;
}

/**
 * Represents a Q&A session with questions and answers.
 */
export interface QASession {
  id: string;
  goalId: string;
  questions: Question[];
  answers: Answer[];
  score: number;
  createdAt: string;
  completedAt?: string;
}

/**
 * Discriminated union for different question types.
 * Use the 'type' field to narrow the type and access type-specific fields.
 */
export type Question =
  | {
      id: string;
      type: 'multiple-choice';
      text: string;
      sourceNotePath: string;
      options: string[]; // Required for multiple-choice
      correctAnswer: number; // Required for multiple-choice
    }
  | {
      id: string;
      type: 'open-ended';
      text: string;
      sourceNotePath: string;
      // No options/correctAnswer for open-ended
    };

/**
 * Discriminated union for different answer types.
 * Use the 'type' field to narrow the type and access type-specific fields.
 */
export type Answer =
  | {
      questionId: string;
      type: 'multiple-choice';
      userAnswer: number;
      isCorrect: boolean;
      explanation: string;
    }
  | {
      questionId: string;
      type: 'open-ended';
      userAnswer: string;
      isCorrect: boolean;
      explanation: string;
    };

/**
 * Type guard to check if a question is multiple-choice.
 */
export function isMultipleChoiceQuestion(
  question: Question,
): question is Question & { type: 'multiple-choice' } {
  return question.type === 'multiple-choice';
}

/**
 * Type guard to check if a question is open-ended.
 */
export function isOpenEndedQuestion(
  question: Question,
): question is Question & { type: 'open-ended' } {
  return question.type === 'open-ended';
}

/**
 * Type guard to check if an answer is for a multiple-choice question.
 */
export function isMultipleChoiceAnswer(
  answer: Answer,
): answer is Answer & { type: 'multiple-choice' } {
  return answer.type === 'multiple-choice';
}

/**
 * Type guard to check if an answer is for an open-ended question.
 */
export function isOpenEndedAnswer(answer: Answer): answer is Answer & { type: 'open-ended' } {
  return answer.type === 'open-ended';
}
