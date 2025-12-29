#!/usr/bin/env npx tsx
/**
 * Run question generation step only
 *
 * This script takes the output from a previous full pipeline run and runs
 * only the question generation step, allowing for iterative development
 * and testing of question generation without re-running embedding/clustering.
 *
 * Alternatively, you can use --note-ids to generate questions for specific
 * notes directly (specific_notes entry point), bypassing the concept system.
 *
 * Usage:
 *   npx tsx scripts/run-question-generation.ts [options]
 *
 * Environment (via direnv):
 *   TEST_VAULT_PATH     Required. Path to the Obsidian vault.
 *   ANTHROPIC_API_KEY   Required. For LLM question generation.
 *
 * Options:
 *   --input <path>     Input file from previous run (default: outputs/clusters.json)
 *   --output <path>    Output file (default: outputs/question-generation-run.json)
 *   --concept <id>     Generate for specific concept ID (optional)
 *   --limit <n>        Limit number of concepts to process (default: 5)
 *   --notes <n>        Number of notes per concept (default: 15)
 *   --note-ids <ids>   Comma-separated note paths (specific_notes entry point)
 *   --no-cache         Disable question caching
 *   --help, -h         Show help
 */

import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, dirname} from 'node:path';
import {AnthropicLLMAdapter} from '../src/adapters/anthropic/AnthropicLLMAdapter';
import {InMemoryStorageAdapter} from '../src/adapters/mock/InMemoryStorageAdapter';
import type {NoteSelectionInput, Question} from '../src/domain/question/types';
import {runQuestionPipeline} from '../src/domain/question/pipeline';
import {getArg, readVault, requireTestVaultPath, type VaultReadResult} from './lib/vault-helpers';

// ============ Types ============

/**
 * Serialized cluster from the pipeline output (matches PersistedClusteringResult.clusters)
 */
interface SerializedCluster {
	id: string;
	noteIds: string[];
	canonicalName: string;
	quizzabilityScore: number;
	candidateNames: string[];
	dominantTags: string[];
	folderPath: string;
	internalLinkDensity: number;
	createdAt: number;
	reasons: string[];
	centroid: number[];
	representativeNotes: string[];
	nonQuizzableReason?: string;
	misfitNotes: Array<{noteId: string; reason: string}>;
}

/**
 * Output from run-full-pipeline.ts (PersistedClusteringResult)
 */
interface PipelineOutput {
	version: number;
	timestamp: number;
	stats: {
		totalNotes: number;
		clusteredNotes: number;
		noiseNotes: number;
		clusterCount: number;
	};
	clusters: SerializedCluster[];
	noiseNotes: string[];
	embeddingProvider: string;
	embeddingModel: string;
	llmModel: string;
	llmTokenUsage: {inputTokens: number; outputTokens: number};
}


interface ConceptQuestionResult {
	id: string;
	name: string;
	noteCount: number;
	notesSelected: number;
	questions: Question[];
	stats: {
		cacheHits: number;
		cacheMisses: number;
		llmBatches: number;
		tokensUsed: {input: number; output: number};
	};
}

interface QuestionGenerationOutput {
	timestamp: number;
	config: {
		inputFile: string;
		vaultPath: string;
		conceptLimit: number;
		notesPerConcept: number;
		cacheEnabled: boolean;
	};
	concepts: ConceptQuestionResult[];
	totalStats: {
		conceptsProcessed: number;
		totalQuestions: number;
		totalTokens: {input: number; output: number};
		durationMs: number;
	};
}

// ============ Helper Functions ============

/**
 * Create a content hash for cache invalidation
 */
function getContentHash(content: string): string {
	return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Create a readNote function that reads from the pre-loaded vault
 */
function createReadNote(vault: VaultReadResult): (noteId: string) => Promise<{content: string; title: string} | null> {
	return async (noteId: string) => {
		const content = vault.contents.get(noteId);
		if (!content) return null;
		return {
			content,
			title: basename(noteId, '.md'),
		};
	};
}

/**
 * Create a getNoteMetadata function that returns note scoring metadata
 */
function createGetNoteMetadata(vault: VaultReadResult): (noteId: string) => Promise<NoteSelectionInput | null> {
	return async (noteId: string) => {
		const fileInfo = vault.files.get(noteId);
		const content = vault.contents.get(noteId);
		if (!fileInfo || !content) return null;

		// Count headings
		const headingMatches = content.match(/^#{1,6}\s+/gm);
		const headingCount = headingMatches ? headingMatches.length : 0;

		// Count words (rough estimate)
		const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length;

		// Count incoming links
		let incomingLinkCount = 0;
		for (const links of Object.values(vault.resolvedLinks)) {
			if (links[noteId]) {
				incomingLinkCount += links[noteId];
			}
		}

		return {
			noteId,
			wordCount,
			headingCount,
			modifiedAt: fileInfo.modifiedAt,
			incomingLinkCount,
		};
	};
}

// ============ Specific Notes Mode ============

interface SpecificNotesModeConfig {
	vaultPath: string;
	noteIds: string[];
	outputPath: string;
	cacheEnabled: boolean;
	anthropicApiKey: string;
	startTime: number;
}

interface SpecificNotesOutput {
	timestamp: number;
	entryPoint: 'specific_notes';
	config: {
		vaultPath: string;
		noteIds: string[];
		cacheEnabled: boolean;
	};
	result: {
		notesRequested: number;
		notesFound: number;
		notesSelected: number;
		questions: Question[];
		stats: {
			cacheHits: number;
			cacheMisses: number;
			llmBatches: number;
			tokensUsed: {input: number; output: number};
		};
	};
	durationMs: number;
}

async function runSpecificNotesMode(config: SpecificNotesModeConfig): Promise<void> {
	const {vaultPath, noteIds, outputPath, cacheEnabled, anthropicApiKey, startTime} = config;

	console.error(`Requested notes: ${noteIds.length}`);
	for (const noteId of noteIds) {
		console.error(`  - ${noteId}`);
	}
	console.error('');

	// Read vault
	console.error('Reading vault...');
	const vault = readVault(vaultPath);
	console.error(`  Total notes in vault: ${vault.files.size}`);

	// Validate requested notes exist
	const foundNoteIds: string[] = [];
	const missingNoteIds: string[] = [];

	for (const noteId of noteIds) {
		if (vault.contents.has(noteId)) {
			foundNoteIds.push(noteId);
		} else {
			missingNoteIds.push(noteId);
		}
	}

	if (missingNoteIds.length > 0) {
		console.error(`  Warning: ${missingNoteIds.length} notes not found:`);
		for (const noteId of missingNoteIds) {
			console.error(`    - ${noteId}`);
		}
	}

	console.error(`  Notes found: ${foundNoteIds.length}/${noteIds.length}`);
	console.error('');

	if (foundNoteIds.length === 0) {
		console.error('Error: No valid notes found. Check your note paths.');
		process.exit(1);
	}

	// Initialize LLM adapter and storage
	console.error('Initializing LLM adapter...');
	const llmProvider = new AnthropicLLMAdapter(anthropicApiKey);
	const storageAdapter = new InMemoryStorageAdapter();
	const readNote = createReadNote(vault);
	const getNoteMetadata = createGetNoteMetadata(vault);
	console.error('');

	// Run the question generation pipeline
	console.error('Generating questions...');
	const pipelineResult = await runQuestionPipeline({
		noteIds: foundNoteIds,
		llmProvider,
		storageAdapter,
		readNote,
		getNoteMetadata,
		getContentHash,
		config: {
			notesPerBatch: 5,
			questionsPerNote: 3,
			targetQuestionCount: foundNoteIds.length * 3,
			cacheMaxAgeDays: cacheEnabled ? 7 : 0,
			targetDistribution: {
				multiple_choice: 4,
				true_false: 2,
				fill_blank: 2,
				free_form: 2,
			},
		},
	});

	const durationMs = Date.now() - startTime;

	// Build output
	const output: SpecificNotesOutput = {
		timestamp: Date.now(),
		entryPoint: 'specific_notes',
		config: {
			vaultPath,
			noteIds,
			cacheEnabled,
		},
		result: {
			notesRequested: noteIds.length,
			notesFound: foundNoteIds.length,
			notesSelected: pipelineResult.stats.notesSelected,
			questions: pipelineResult.questions,
			stats: {
				cacheHits: pipelineResult.stats.cacheHits,
				cacheMisses: pipelineResult.stats.cacheMisses,
				llmBatches: pipelineResult.stats.llmBatches,
				tokensUsed: {
					input: pipelineResult.stats.tokenUsage.inputTokens,
					output: pipelineResult.stats.tokenUsage.outputTokens,
				},
			},
		},
		durationMs,
	};

	// Ensure output directory exists
	const outputDir = dirname(outputPath);
	if (!existsSync(outputDir)) {
		mkdirSync(outputDir, {recursive: true});
	}

	writeFileSync(outputPath, JSON.stringify(output, null, 2));

	// Print summary
	console.error('');
	console.error('=== Complete ===');
	console.error(`Duration: ${(durationMs / 1000).toFixed(2)}s`);
	console.error('');
	console.error('Results:');
	console.error(`  Notes: ${output.result.notesSelected}/${output.result.notesFound} selected`);
	console.error(`  Questions: ${output.result.questions.length} (${output.result.stats.cacheHits} cached, ${output.result.stats.cacheMisses} new)`);
	console.error(`  Tokens: ${output.result.stats.tokensUsed.input} in / ${output.result.stats.tokensUsed.output} out`);
	console.error('');
	console.error(`Output saved to: ${outputPath}`);

	// Print question breakdown
	console.error('');
	console.error('=== Question Breakdown ===');
	const formatCounts = {
		multiple_choice: output.result.questions.filter((q) => q.format === 'multiple_choice').length,
		true_false: output.result.questions.filter((q) => q.format === 'true_false').length,
		fill_blank: output.result.questions.filter((q) => q.format === 'fill_blank').length,
		free_form: output.result.questions.filter((q) => q.format === 'free_form').length,
	};
	console.error(`  Multiple Choice: ${formatCounts.multiple_choice}`);
	console.error(`  True/False: ${formatCounts.true_false}`);
	console.error(`  Fill Blank: ${formatCounts.fill_blank}`);
	console.error(`  Free Form: ${formatCounts.free_form}`);

	// Print questions by source note
	console.error('');
	console.error('=== Questions by Note ===');
	const questionsByNote = new Map<string, Question[]>();
	for (const q of output.result.questions) {
		const existing = questionsByNote.get(q.sourceNoteId) ?? [];
		existing.push(q);
		questionsByNote.set(q.sourceNoteId, existing);
	}
	for (const [noteId, questions] of questionsByNote) {
		console.error(`  ${basename(noteId, '.md')}: ${questions.length} questions`);
	}
}

// ============ Main ============

async function main() {
	const args = process.argv.slice(2);

	if (args.includes('--help') || args.includes('-h')) {
		console.log(`
Question Generation Script

This script runs the question generation step using concepts from a previous
full pipeline run. It reads note content fresh from the vault.

Alternatively, use --note-ids to generate questions for specific notes directly
(specific_notes entry point), bypassing the concept system entirely.

Usage:
  npx tsx scripts/run-question-generation.ts [options]

Environment (via direnv):
  TEST_VAULT_PATH     Required. Path to the Obsidian vault.
  ANTHROPIC_API_KEY   Required. For LLM question generation.

Options:
  --input <path>     Input file from previous run (default: outputs/clusters.json)
  --output <path>    Output file (default: outputs/question-generation-run.json)
  --concept <id>     Generate for specific concept ID (optional)
  --limit <n>        Limit number of concepts to process (default: 5)
  --notes <n>        Number of notes per concept (default: 15)
  --note-ids <ids>   Comma-separated note paths for direct generation (specific_notes entry point)
  --no-cache         Disable question caching
  --help, -h         Show help

Examples:
  # Generate questions for top 3 concepts
  npx tsx scripts/run-question-generation.ts --limit 3

  # Generate for specific concept
  npx tsx scripts/run-question-generation.ts --concept concept-123

  # Generate for specific notes directly (bypasses concepts)
  npx tsx scripts/run-question-generation.ts --note-ids "notes/react-hooks.md,notes/typescript-basics.md"

  # Disable caching to force regeneration
  npx tsx scripts/run-question-generation.ts --no-cache --limit 1
`);
		process.exit(0);
	}

	// Get configuration
	const resolvedVaultPath = requireTestVaultPath();
	const inputPath = getArg(args, '--input') ?? 'outputs/clusters.json';
	const outputPath = getArg(args, '--output') ?? 'outputs/question-generation-run.json';
	const specificConceptId = getArg(args, '--concept');
	const conceptLimit = parseInt(getArg(args, '--limit') ?? '5', 10);
	const notesPerConcept = parseInt(getArg(args, '--notes') ?? '15', 10);
	const specificNoteIds = getArg(args, '--note-ids');
	const cacheEnabled = !args.includes('--no-cache');

	const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
	if (!anthropicApiKey) {
		console.error('Error: ANTHROPIC_API_KEY environment variable required');
		process.exit(1);
	}

	// Determine entry point mode
	const isSpecificNotesMode = specificNoteIds !== undefined;

	console.error('=== Question Generation ===');
	console.error(`Vault: ${resolvedVaultPath}`);
	console.error(`Mode: ${isSpecificNotesMode ? 'specific_notes' : 'concept-based'}`);
	console.error(`Cache: ${cacheEnabled ? 'enabled' : 'disabled'}`);
	console.error('');

	const startTime = Date.now();

	// Handle specific_notes entry point
	if (isSpecificNotesMode) {
		await runSpecificNotesMode({
			vaultPath: resolvedVaultPath,
			noteIds: specificNoteIds.split(',').map((id) => id.trim()),
			outputPath,
			cacheEnabled,
			anthropicApiKey,
			startTime,
		});
		return;
	}

	// Load previous pipeline output for concept-based mode
	if (!existsSync(inputPath)) {
		console.error(`Error: Input file not found: ${inputPath}`);
		console.error('Run the full pipeline first: npx tsx scripts/run-full-pipeline.ts');
		process.exit(1);
	}

	console.error(`Input: ${inputPath}`);

	// Parse input file
	console.error('Loading previous pipeline output...');
	const inputContent = readFileSync(inputPath, 'utf-8');
	const pipelineOutput: PipelineOutput = JSON.parse(inputContent);

	let clusters = pipelineOutput.clusters;
	console.error(`  Found ${clusters.length} clusters`);

	// Filter to quizzable clusters
	clusters = clusters.filter((c) => c.quizzabilityScore >= 0.4);
	console.error(`  Quizzable: ${clusters.length}`);

	// Filter to specific cluster if requested
	if (specificConceptId) {
		clusters = clusters.filter((c) => c.id === specificConceptId);
		if (clusters.length === 0) {
			console.error(`Error: Cluster not found: ${specificConceptId}`);
			process.exit(1);
		}
		console.error(`  Selected: ${clusters[0].canonicalName}`);
	} else {
		// Sort by quizzability score (highest first), then by note count
		clusters = clusters
			.sort((a, b) => b.quizzabilityScore - a.quizzabilityScore || b.noteIds.length - a.noteIds.length)
			.slice(0, conceptLimit);
		console.error(`  Processing top ${clusters.length} clusters by quizzability score`);
	}
	console.error('');

	// Read vault for note content
	console.error('Reading vault...');
	const vault = readVault(resolvedVaultPath);
	console.error(`  Notes: ${vault.files.size}`);
	console.error('');

	// Initialize LLM adapter and storage
	console.error('Initializing LLM adapter...');
	const llmProvider = new AnthropicLLMAdapter(anthropicApiKey);
	const storageAdapter = new InMemoryStorageAdapter();
	const readNote = createReadNote(vault);
	const getNoteMetadata = createGetNoteMetadata(vault);
	console.error('');

	// Process each concept
	const output: QuestionGenerationOutput = {
		timestamp: Date.now(),
		config: {
			inputFile: inputPath,
			vaultPath: resolvedVaultPath,
			conceptLimit,
			notesPerConcept,
			cacheEnabled,
		},
		concepts: [],
		totalStats: {
			conceptsProcessed: 0,
			totalQuestions: 0,
			totalTokens: {input: 0, output: 0},
			durationMs: 0,
		},
	};

	for (const cluster of clusters) {
		console.error(`Processing: ${cluster.canonicalName} (${cluster.noteIds.length} notes, score: ${cluster.quizzabilityScore})`);

		// Get note IDs that exist in the vault (limited to notesPerConcept)
		const availableNoteIds: string[] = [];
		for (const noteId of cluster.noteIds) {
			if (availableNoteIds.length >= notesPerConcept) break;
			if (vault.contents.has(noteId)) {
				availableNoteIds.push(noteId);
			}
		}

		console.error(`  Available notes: ${availableNoteIds.length}`);

		// Run the question generation pipeline
		const pipelineResult = await runQuestionPipeline({
			noteIds: availableNoteIds,
			llmProvider,
			storageAdapter,
			readNote,
			getNoteMetadata,
			getContentHash,
			config: {
				notesPerBatch: 5,
				questionsPerNote: 3,
				targetQuestionCount: availableNoteIds.length * 3,
				cacheMaxAgeDays: cacheEnabled ? 7 : 0,
				targetDistribution: {
					multiple_choice: 4,
					true_false: 2,
					fill_blank: 2,
					free_form: 2,
				},
			},
		});

		const result: ConceptQuestionResult = {
			id: cluster.id,
			name: cluster.canonicalName,
			noteCount: cluster.noteIds.length,
			notesSelected: pipelineResult.stats.notesSelected,
			questions: pipelineResult.questions,
			stats: {
				cacheHits: pipelineResult.stats.cacheHits,
				cacheMisses: pipelineResult.stats.cacheMisses,
				llmBatches: pipelineResult.stats.llmBatches,
				tokensUsed: {
					input: pipelineResult.stats.tokenUsage.inputTokens,
					output: pipelineResult.stats.tokenUsage.outputTokens,
				},
			},
		};

		console.error(`  Notes selected: ${result.notesSelected}`);
		console.error(`  Generated ${result.questions.length} questions (${result.stats.cacheHits} cached, ${result.stats.cacheMisses} new)`);
		console.error(`  Tokens: ${result.stats.tokensUsed.input} in / ${result.stats.tokensUsed.output} out`);

		output.concepts.push(result);
		output.totalStats.conceptsProcessed++;
		output.totalStats.totalQuestions += result.questions.length;
		output.totalStats.totalTokens.input += result.stats.tokensUsed.input;
		output.totalStats.totalTokens.output += result.stats.tokensUsed.output;
	}

	output.totalStats.durationMs = Date.now() - startTime;

	// Ensure output directory exists
	const outputDir = dirname(outputPath);
	if (!existsSync(outputDir)) {
		mkdirSync(outputDir, {recursive: true});
	}

	writeFileSync(outputPath, JSON.stringify(output, null, 2));

	// Print summary
	console.error('');
	console.error('=== Complete ===');
	console.error(`Duration: ${(output.totalStats.durationMs / 1000).toFixed(2)}s`);
	console.error('');
	console.error('Results:');
	console.error(`  Concepts processed: ${output.totalStats.conceptsProcessed}`);
	console.error(`  Total questions: ${output.totalStats.totalQuestions}`);
	console.error(`  Tokens: ${output.totalStats.totalTokens.input} in / ${output.totalStats.totalTokens.output} out`);
	console.error('');
	console.error(`Output saved to: ${outputPath}`);

	// Print concept summary
	console.error('');
	console.error('=== Concept Summary ===');
	for (const concept of output.concepts) {
		const formatCounts = {
			multiple_choice: concept.questions.filter((q) => q.format === 'multiple_choice').length,
			true_false: concept.questions.filter((q) => q.format === 'true_false').length,
			fill_blank: concept.questions.filter((q) => q.format === 'fill_blank').length,
			free_form: concept.questions.filter((q) => q.format === 'free_form').length,
		};
		console.error(`  ${concept.name}`);
		console.error(`    Notes: ${concept.notesSelected}/${concept.noteCount}`);
		console.error(`    Questions: ${concept.questions.length} (MC:${formatCounts.multiple_choice} TF:${formatCounts.true_false} FB:${formatCounts.fill_blank} FF:${formatCounts.free_form})`);
	}
}

main().catch((err) => {
	console.error('Error:', err.message);
	console.error(err.stack);
	process.exit(1);
});
