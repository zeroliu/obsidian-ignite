/**
 * Question Generation Pipeline Module
 *
 * Main orchestrator for the question generation process.
 * Handles note selection, caching, LLM calls, and question selection.
 */

import type { TrackedConcept } from '@/domain/llm/types';
import type { ILLMProvider } from '@/ports/ILLMProvider';
import type { IStorageAdapter } from '@/ports/IStorageAdapter';
import type { IVaultProvider } from '@/ports/IVaultProvider';
import { QuestionCacheManager } from './cache';
import { resolveNotesForEntry } from './entryPoints';
import { QuestionHistoryManager } from './historyManager';
import { scoreNote, selectNotes, shouldQuizNote } from './noteSelection';
import type {
  DerivedNoteStats,
  NoteSelectionInput,
  Question,
  QuestionGenerationConfig,
  QuizEntryPoint,
  QuizSession,
} from './types';
import { DEFAULT_QUESTION_CONFIG, generateSessionId } from './types';

// ============ Pipeline Types ============

/**
 * Input for question generation pipeline
 * Accepts noteIds directly (resolved from any entry point)
 */
export interface QuestionPipelineInput {
  /** Note IDs to generate questions for (from any entry point) */
  noteIds: string[];
  /** LLM provider for question generation */
  llmProvider: ILLMProvider;
  /** Storage adapter for caching and history */
  storageAdapter: IStorageAdapter;
  /** Function to read note content */
  readNote: (noteId: string) => Promise<{ content: string; title: string } | null>;
  /** Function to get note metadata */
  getNoteMetadata: (noteId: string) => Promise<NoteSelectionInput | null>;
  /** Function to compute content hash */
  getContentHash: (content: string) => string;
  /** Configuration overrides */
  config?: Partial<QuestionGenerationConfig>;
}

/**
 * Dependencies for unified quiz initialization
 */
export interface QuizDependencies {
  vault: IVaultProvider;
  llmProvider: ILLMProvider;
  storageAdapter: IStorageAdapter;
  loadConcept: (id: string) => Promise<TrackedConcept | null>;
  loadAllConcepts: () => Promise<TrackedConcept[]>;
  readNote: (noteId: string) => Promise<{ content: string; title: string } | null>;
  getNoteMetadata: (noteId: string) => Promise<NoteSelectionInput | null>;
  getContentHash: (content: string) => string;
  searchNotes?: (query: string) => Promise<string[]>;
  config?: Partial<QuestionGenerationConfig>;
}

export interface QuestionPipelineResult {
  questions: Question[];
  stats: {
    notesInput: number;
    notesQuizzable: number;
    notesSelected: number;
    cacheHits: number;
    cacheMisses: number;
    questionsGenerated: number;
    questionsFromCache: number;
    llmBatches: number;
    tokenUsage: { inputTokens: number; outputTokens: number };
  };
}

// ============ Main Pipeline ============

/**
 * Run question generation pipeline on a set of notes
 * Notes can come from any entry point (concept, time filter, direct selection, etc.)
 */
export async function runQuestionPipeline(
  input: QuestionPipelineInput,
): Promise<QuestionPipelineResult> {
  const config = { ...DEFAULT_QUESTION_CONFIG, ...input.config };
  const cache = new QuestionCacheManager(input.storageAdapter, config);
  const historyManager = new QuestionHistoryManager(input.storageAdapter);

  const stats = {
    notesInput: input.noteIds.length,
    notesQuizzable: 0,
    notesSelected: 0,
    cacheHits: 0,
    cacheMisses: 0,
    questionsGenerated: 0,
    questionsFromCache: 0,
    llmBatches: 0,
    tokenUsage: { inputTokens: 0, outputTokens: 0 },
  };

  // 1. Get metadata and filter quizzable notes using derived stats
  const quizzableNotes: Array<{ input: NoteSelectionInput; stats: DerivedNoteStats }> = [];

  for (const noteId of input.noteIds) {
    const metadata = await input.getNoteMetadata(noteId);
    if (!metadata) continue;

    const derivedStats = await historyManager.deriveNoteStats(noteId);
    if (shouldQuizNote(derivedStats)) {
      quizzableNotes.push({ input: metadata, stats: derivedStats });
    }
  }

  stats.notesQuizzable = quizzableNotes.length;

  if (quizzableNotes.length === 0) {
    return { questions: [], stats };
  }

  // 2. Score notes using derived stats
  const scoredNotes = quizzableNotes.map(({ input: noteInput, stats: noteStats }) =>
    scoreNote(noteInput, noteStats),
  );

  // 3. Select notes via stratified sampling
  const targetNotes = Math.min(config.targetQuestionCount * 2, quizzableNotes.length);
  const selectedNoteIds = selectNotes(scoredNotes, targetNotes);
  stats.notesSelected = selectedNoteIds.length;

  // 4. Build history summary for LLM context and cache fingerprint
  const historySummary = await historyManager.buildHistorySummaryForNotes(selectedNoteIds);
  const historyFingerprint = historyManager.generateFingerprint(historySummary);

  // 5. Check cache and partition
  const cachedQuestions: Question[] = [];
  const needsGeneration: Array<{
    noteId: string;
    title: string;
    content: string;
    contentHash: string;
  }> = [];

  for (const noteId of selectedNoteIds) {
    const noteData = await input.readNote(noteId);
    if (!noteData) continue;

    const contentHash = input.getContentHash(noteData.content);
    const cached = await cache.get(noteId, contentHash, historyFingerprint);

    if (cached) {
      cachedQuestions.push(...cached);
      stats.cacheHits++;
      stats.questionsFromCache += cached.length;
    } else {
      needsGeneration.push({
        noteId,
        title: noteData.title,
        content: noteData.content,
        contentHash,
      });
      stats.cacheMisses++;
    }
  }

  // 6. Generate questions in batches with history context
  const generatedQuestions: Question[] = [];

  for (let i = 0; i < needsGeneration.length; i += config.notesPerBatch) {
    const batch = needsGeneration.slice(i, i + config.notesPerBatch);
    stats.llmBatches++;

    const response = await input.llmProvider.generateQuestionsBatch({
      notes: batch.map((n) => ({
        noteId: n.noteId,
        title: n.title,
        content: n.content,
      })),
    });

    if (response.usage) {
      stats.tokenUsage.inputTokens += response.usage.inputTokens;
      stats.tokenUsage.outputTokens += response.usage.outputTokens;
    }

    // Cache questions by source note
    const questionsByNote = new Map<string, Question[]>();
    for (const q of response.questions) {
      const existing = questionsByNote.get(q.sourceNoteId) ?? [];
      existing.push(q);
      questionsByNote.set(q.sourceNoteId, existing);
    }

    for (const note of batch) {
      const questions = questionsByNote.get(note.noteId) ?? [];
      if (questions.length > 0) {
        await cache.set(note.noteId, note.contentHash, historyFingerprint, questions);
      }
    }

    generatedQuestions.push(...response.questions);
    stats.questionsGenerated += response.questions.length;
  }

  // 7. Combine and select final questions
  const allCandidates = [...cachedQuestions, ...generatedQuestions];
  const finalQuestions = selectFinalQuestions(allCandidates, config);

  return { questions: finalQuestions, stats };
}

// ============ Question Selection ============

/**
 * Select final questions by format distribution
 */
export function selectFinalQuestions(
  candidates: Question[],
  config: QuestionGenerationConfig,
): Question[] {
  const selected: Question[] = [];

  for (const [format, count] of Object.entries(config.targetDistribution)) {
    const bucket = candidates
      .filter((q) => q.format === format)
      .sort((a, b) => b.qualityScore - a.qualityScore);
    selected.push(...bucket.slice(0, count));
  }

  // If we didn't get enough, fill from remaining high-quality questions
  if (selected.length < config.targetQuestionCount) {
    const selectedIds = new Set(selected.map((q) => q.id));
    const remaining = candidates
      .filter((q) => !selectedIds.has(q.id))
      .sort((a, b) => b.qualityScore - a.qualityScore);

    const needed = config.targetQuestionCount - selected.length;
    selected.push(...remaining.slice(0, needed));
  }

  return selected;
}

// ============ Unified Quiz Initialization ============

/**
 * Initialize a quiz from any entry point
 * This is the main entry point for starting a quiz session
 */
export async function initializeQuiz(
  entry: QuizEntryPoint,
  deps: QuizDependencies,
): Promise<QuizSession> {
  const historyManager = new QuestionHistoryManager(deps.storageAdapter);

  // 1. Resolve notes based on entry point type
  const noteIds = await resolveNotesForEntry(entry, {
    vault: deps.vault,
    loadConcept: deps.loadConcept,
    loadAllConcepts: deps.loadAllConcepts,
    deriveNoteStats: (noteId) => historyManager.deriveNoteStats(noteId),
    searchNotes: deps.searchNotes,
  });

  // 2. Run question generation pipeline
  const result = await runQuestionPipeline({
    noteIds,
    llmProvider: deps.llmProvider,
    storageAdapter: deps.storageAdapter,
    readNote: deps.readNote,
    getNoteMetadata: deps.getNoteMetadata,
    getContentHash: deps.getContentHash,
    config: deps.config,
  });

  // 3. Create quiz session
  return {
    id: generateSessionId(),
    sourceEntry: entry,
    questions: result.questions,
    createdAt: Date.now(),
  };
}
