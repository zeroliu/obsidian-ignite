import {
  QA_EVALUATION_SYSTEM_PROMPT,
  QA_GENERATION_SYSTEM_PROMPT,
  buildEvaluationContext,
  buildQAContext,
} from '@/adapters/anthropic/prompts/qaGeneration';
import type { ILLMProvider, IVaultProvider, LLMMessage } from '@/ports';
import { parseFrontmatter, serializeFrontmatter } from './frontmatterUtils';
import type { Answer, Goal, QASession, Question } from './types';

/**
 * Frontmatter structure for Q&A session markdown files.
 */
interface QASessionFrontmatter {
  id: string;
  goalId: string;
  score: number;
  createdAt: string;
  completedAt?: string;
}

/**
 * Raw question from LLM response before validation.
 */
interface RawQuestion {
  type: 'multiple-choice' | 'open-ended';
  text: string;
  sourceNotePath: string;
  options?: string[];
  correctAnswer?: number;
}

/**
 * Service for managing Q&A sessions for goals.
 * Handles question generation, answer evaluation, and session persistence.
 */
export class QAService {
  private static readonly QA_SESSIONS_FOLDER = 'qa-sessions';

  constructor(
    private vaultProvider: IVaultProvider,
    private llmProvider: ILLMProvider,
  ) {}

  /**
   * Get all Q&A sessions for a goal.
   */
  async getSessionsForGoal(goalId: string): Promise<QASession[]> {
    const folderPath = this.getSessionsFolderPath(goalId);
    const exists = await this.vaultProvider.exists(folderPath);

    if (!exists) {
      return [];
    }

    const files = await this.vaultProvider.listMarkdownFiles();
    const sessionFiles = files.filter(
      (file) => file.path.startsWith(`${folderPath}/`) && file.path.endsWith('.md'),
    );

    const sessionPromises = sessionFiles.map(async (file) => {
      try {
        return await this.loadSession(file.path);
      } catch (error) {
        console.warn(`Failed to load Q&A session from ${file.path}:`, error);
        return null;
      }
    });

    const results = await Promise.all(sessionPromises);
    return results
      .filter((session): session is QASession => session !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Get a Q&A session by ID.
   */
  async getSessionById(goalId: string, sessionId: string): Promise<QASession | null> {
    const path = this.getSessionPath(goalId, sessionId);
    const exists = await this.vaultProvider.exists(path);

    if (!exists) {
      return null;
    }

    return this.loadSession(path);
  }

  /**
   * Create a new Q&A session with generated questions.
   */
  async createSession(
    goal: Goal,
    noteContents: Array<{ path: string; content: string }>,
  ): Promise<QASession> {
    // Generate questions
    const questions = await this.generateQuestions(goal, noteContents);

    if (questions.length === 0) {
      throw new Error('Failed to generate questions. Please try again.');
    }

    const sessionId = this.generateSessionId();
    const now = new Date().toISOString();

    const session: QASession = {
      id: sessionId,
      goalId: goal.id,
      questions,
      answers: [],
      score: 0,
      createdAt: now,
    };

    await this.saveSession(session);
    return session;
  }

  /**
   * Submit an answer to a question.
   */
  async submitAnswer(
    goalId: string,
    sessionId: string,
    questionId: string,
    userAnswer: number | string,
    noteContents: Array<{ path: string; content: string }>,
  ): Promise<{ session: QASession; answer: Answer }> {
    const session = await this.getSessionById(goalId, sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const question = session.questions.find((q) => q.id === questionId);
    if (!question) {
      throw new Error(`Question not found: ${questionId}`);
    }

    // Check if already answered
    const existingAnswer = session.answers.find((a) => a.questionId === questionId);
    if (existingAnswer) {
      return { session, answer: existingAnswer };
    }

    let answer: Answer;

    if (question.type === 'multiple-choice') {
      // Evaluate multiple-choice answer
      const isCorrect = userAnswer === question.correctAnswer;
      const explanation = isCorrect
        ? 'Correct! This answer demonstrates understanding of the concept.'
        : `Incorrect. The correct answer was: ${question.options[question.correctAnswer]}`;

      answer = {
        questionId,
        type: 'multiple-choice',
        userAnswer: userAnswer as number,
        isCorrect,
        explanation,
      };
    } else {
      // Evaluate open-ended answer with LLM
      const sourceNote = noteContents.find((n) => n.path === question.sourceNotePath);
      const evaluation = await this.evaluateOpenEndedAnswer(
        question.text,
        sourceNote?.content ?? '',
        userAnswer as string,
      );

      answer = {
        questionId,
        type: 'open-ended',
        userAnswer: userAnswer as string,
        isCorrect: evaluation.isCorrect,
        explanation: evaluation.explanation,
      };
    }

    session.answers.push(answer);

    // Update score
    const correctCount = session.answers.filter((a) => a.isCorrect).length;
    session.score = Math.round((correctCount / session.questions.length) * 100);

    // Check if session is complete
    if (session.answers.length === session.questions.length) {
      session.completedAt = new Date().toISOString();
    }

    await this.saveSession(session);
    return { session, answer };
  }

  /**
   * Delete a Q&A session.
   */
  async deleteSession(goalId: string, sessionId: string): Promise<void> {
    const path = this.getSessionPath(goalId, sessionId);
    const exists = await this.vaultProvider.exists(path);

    if (!exists) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    await this.vaultProvider.deleteFile(path);
  }

  /**
   * Generate questions from goal's notes.
   */
  private async generateQuestions(
    goal: Goal,
    noteContents: Array<{ path: string; content: string }>,
  ): Promise<Question[]> {
    if (noteContents.length === 0) {
      return [];
    }

    const context = buildQAContext(goal.name, goal.description, noteContents);

    const messages: LLMMessage[] = [
      { role: 'system', content: QA_GENERATION_SYSTEM_PROMPT },
      { role: 'user', content: context },
    ];

    const response = await this.llmProvider.chat(messages, {
      temperature: 0.7,
      maxTokens: 3000,
    });

    return this.parseQuestions(
      response.content,
      noteContents.map((n) => n.path),
    );
  }

  /**
   * Parse questions from LLM response.
   */
  private parseQuestions(response: string, availableNotePaths: string[]): Question[] {
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) {
      return [];
    }

    try {
      const parsed = JSON.parse(jsonMatch[1]) as { questions?: RawQuestion[] };
      if (!parsed.questions || !Array.isArray(parsed.questions)) {
        return [];
      }

      const questions: Question[] = [];

      for (let i = 0; i < parsed.questions.length; i++) {
        const q = parsed.questions[i];

        // Validate common fields
        if (!q.type || !q.text || !q.sourceNotePath) {
          continue;
        }

        // Validate sourceNotePath exists in available notes
        const validSourcePath = availableNotePaths.find(
          (p) => p === q.sourceNotePath || p.endsWith(q.sourceNotePath),
        );

        if (!validSourcePath) {
          continue;
        }

        const id = `q-${Date.now()}-${i}`;

        if (q.type === 'multiple-choice') {
          // Validate multiple-choice specific fields
          if (
            !Array.isArray(q.options) ||
            q.options.length !== 4 ||
            typeof q.correctAnswer !== 'number' ||
            q.correctAnswer < 0 ||
            q.correctAnswer > 3
          ) {
            continue;
          }

          questions.push({
            id,
            type: 'multiple-choice',
            text: q.text,
            sourceNotePath: validSourcePath,
            options: q.options,
            correctAnswer: q.correctAnswer,
          });
        } else if (q.type === 'open-ended') {
          questions.push({
            id,
            type: 'open-ended',
            text: q.text,
            sourceNotePath: validSourcePath,
          });
        }
      }

      return questions;
    } catch (error) {
      console.error('Failed to parse questions:', error);
      return [];
    }
  }

  /**
   * Evaluate an open-ended answer using LLM.
   */
  private async evaluateOpenEndedAnswer(
    question: string,
    sourceContent: string,
    userAnswer: string,
  ): Promise<{ isCorrect: boolean; explanation: string }> {
    const context = buildEvaluationContext(question, sourceContent, userAnswer);

    const messages: LLMMessage[] = [
      { role: 'system', content: QA_EVALUATION_SYSTEM_PROMPT },
      { role: 'user', content: context },
    ];

    try {
      const response = await this.llmProvider.chat(messages, {
        temperature: 0.3,
        maxTokens: 500,
      });

      const jsonMatch = response.content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as { isCorrect: boolean; explanation: string };
        return {
          isCorrect: Boolean(parsed.isCorrect),
          explanation: parsed.explanation || 'No explanation provided.',
        };
      }

      // Fallback if no JSON found
      return {
        isCorrect: false,
        explanation: 'Unable to evaluate answer. Please try again.',
      };
    } catch (error) {
      console.error('Failed to evaluate answer:', error);
      return {
        isCorrect: false,
        explanation: 'Error evaluating answer. Please try again.',
      };
    }
  }

  /**
   * Load a Q&A session from a file path.
   */
  private async loadSession(path: string): Promise<QASession> {
    const content = await this.vaultProvider.readFile(path);
    const { frontmatter, body } = parseFrontmatter<QASessionFrontmatter>(content);

    // Parse questions and answers from body
    const { questions, answers } = this.parseSessionBody(body);

    return {
      id: frontmatter.id,
      goalId: frontmatter.goalId,
      questions,
      answers,
      score: frontmatter.score,
      createdAt: frontmatter.createdAt,
      completedAt: frontmatter.completedAt,
    };
  }

  /**
   * Save a Q&A session to the vault.
   */
  private async saveSession(session: QASession): Promise<void> {
    const folderPath = this.getSessionsFolderPath(session.goalId);
    const sessionPath = this.getSessionPath(session.goalId, session.id);

    // Ensure folder exists
    await this.vaultProvider.createFolder(folderPath);

    const frontmatter: QASessionFrontmatter = {
      id: session.id,
      goalId: session.goalId,
      score: session.score,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
    };

    const body = this.serializeSessionBody(session.questions, session.answers);
    const content = serializeFrontmatter(frontmatter, body);

    const exists = await this.vaultProvider.exists(sessionPath);
    if (exists) {
      await this.vaultProvider.modifyFile(sessionPath, content);
    } else {
      await this.vaultProvider.createFile(sessionPath, content);
    }
  }

  /**
   * Parse questions and answers from markdown body.
   */
  private parseSessionBody(body: string): { questions: Question[]; answers: Answer[] } {
    const questions: Question[] = [];
    const answers: Answer[] = [];

    // Split by question sections
    const sections = body.split(/\n## Question \d+/).filter((s) => s.trim());

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i].trim();
      if (!section) continue;

      // Parse question metadata
      const typeMatch = section.match(/Type: (multiple-choice|open-ended)/);
      const sourceMatch = section.match(/Source: (.+)/);
      const textMatch = section.match(/### (.+)/);

      if (!typeMatch || !sourceMatch || !textMatch) continue;

      const type = typeMatch[1] as 'multiple-choice' | 'open-ended';
      const sourceNotePath = sourceMatch[1].trim();
      const text = textMatch[1].trim();
      const id = `q-loaded-${i}`;

      if (type === 'multiple-choice') {
        // Parse options
        const optionsMatch = section.match(/Options:\n((?:- .+\n?)+)/);
        const correctMatch = section.match(/Correct: (\d)/);

        if (!optionsMatch || !correctMatch) continue;

        const options = optionsMatch[1]
          .split('\n')
          .filter((l) => l.startsWith('- '))
          .map((l) => l.replace(/^- /, '').trim());

        if (options.length !== 4) continue;

        questions.push({
          id,
          type: 'multiple-choice',
          text,
          sourceNotePath,
          options,
          correctAnswer: Number.parseInt(correctMatch[1], 10),
        });
      } else {
        questions.push({
          id,
          type: 'open-ended',
          text,
          sourceNotePath,
        });
      }

      // Parse answer if present
      const answerMatch = section.match(/#### User Answer\n([\s\S]*?)(?=\n#### Feedback|$)/);
      const feedbackMatch = section.match(/#### Feedback\n([\s\S]*?)(?=\n## Question|$)/);
      const correctStatusMatch = section.match(/Status: (Correct|Incorrect)/);

      if (answerMatch && feedbackMatch && correctStatusMatch) {
        const userAnswer = answerMatch[1].trim();
        const explanation = feedbackMatch[1].trim();
        const isCorrect = correctStatusMatch[1] === 'Correct';

        if (type === 'multiple-choice') {
          const answerNum = Number.parseInt(userAnswer, 10);
          if (!Number.isNaN(answerNum)) {
            answers.push({
              questionId: id,
              type: 'multiple-choice',
              userAnswer: answerNum,
              isCorrect,
              explanation,
            });
          }
        } else {
          answers.push({
            questionId: id,
            type: 'open-ended',
            userAnswer,
            isCorrect,
            explanation,
          });
        }
      }
    }

    return { questions, answers };
  }

  /**
   * Serialize questions and answers to markdown body.
   */
  private serializeSessionBody(questions: Question[], answers: Answer[]): string {
    const lines: string[] = ['# Q&A Session\n'];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const answer = answers.find((a) => a.questionId === q.id);

      lines.push(`## Question ${i + 1}`);
      lines.push(`Type: ${q.type}`);
      lines.push(`Source: ${q.sourceNotePath}`);
      lines.push('');
      lines.push(`### ${q.text}`);
      lines.push('');

      if (q.type === 'multiple-choice') {
        lines.push('Options:');
        for (const opt of q.options) {
          lines.push(`- ${opt}`);
        }
        lines.push(`Correct: ${q.correctAnswer}`);
        lines.push('');
      }

      if (answer) {
        lines.push('#### User Answer');
        lines.push(String(answer.userAnswer));
        lines.push('');
        lines.push(`Status: ${answer.isCorrect ? 'Correct' : 'Incorrect'}`);
        lines.push('');
        lines.push('#### Feedback');
        lines.push(answer.explanation);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Get the folder path for a goal's Q&A sessions.
   */
  private getSessionsFolderPath(goalId: string): string {
    return `ignite/${goalId}/${QAService.QA_SESSIONS_FOLDER}`;
  }

  /**
   * Get the file path for a Q&A session.
   */
  private getSessionPath(goalId: string, sessionId: string): string {
    return `${this.getSessionsFolderPath(goalId)}/${sessionId}.md`;
  }

  /**
   * Generate a unique session ID.
   */
  private generateSessionId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `qa-${crypto.randomUUID()}`;
    }
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `qa-${timestamp}-${random}`;
  }
}
