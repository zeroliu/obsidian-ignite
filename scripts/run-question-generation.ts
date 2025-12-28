#!/usr/bin/env npx tsx
/**
 * Run question generation step only
 *
 * This script takes the output from a previous full pipeline run and runs
 * only the question generation step, allowing for iterative development
 * and testing of question generation without re-running embedding/clustering.
 *
 * Usage:
 *   npx tsx scripts/run-question-generation.ts [options]
 *
 * Environment (via direnv):
 *   TEST_VAULT_PATH     Required. Path to the Obsidian vault.
 *   ANTHROPIC_API_KEY   Required. For LLM question generation.
 *
 * Options:
 *   --input <path>     Input file from previous run (default: outputs/full-pipeline-run.json)
 *   --output <path>    Output file (default: outputs/question-generation-run.json)
 *   --concept <id>     Generate for specific concept ID (optional)
 *   --limit <n>        Limit number of concepts to process (default: 5)
 *   --notes <n>        Number of notes per concept (default: 15)
 *   --no-cache         Disable question caching
 *   --help, -h         Show help
 */

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, dirname} from 'node:path';
import {getArg, readVault, requireTestVaultPath} from './lib/vault-helpers';

// ============ Types ============

interface TrackedConcept {
	id: string;
	canonicalName: string;
	noteIds: string[];
	quizzabilityScore: number;
	clusterId: string;
	metadata: {
		createdAt: number;
		lastUpdated: number;
	};
	evolutionHistory: unknown[];
}

interface FullPipelineOutput {
	stages: {
		vaultRead: {noteCount: number; durationMs: number};
		embedding: {processed: number; cached: number; tokens: number; estimatedCost: number; durationMs: number};
		clustering: {clusterCount: number; noiseCount: number; durationMs: number};
		llmNaming: {conceptCount: number; inputTokens: number; outputTokens: number; durationMs: number};
	};
	finalResult: {
		concepts: TrackedConcept[];
		misfitNotes: Array<{noteId: string; reason: string}>;
	};
	totalDurationMs: number;
}

type QuestionFormat = 'multiple_choice' | 'true_false' | 'fill_blank' | 'free_form';
type Difficulty = 'easy' | 'medium' | 'hard';

interface Question {
	id: string;
	format: QuestionFormat;
	difficulty: Difficulty;
	question: string;
	sourceNoteId: string;
	qualityScore: number;
	options?: string[];
	correctAnswer: string | number;
	explanation?: string;
	generatedAt: number;
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

// ============ Mock Question Generation ============
// TODO: Replace with actual implementation from src/domain/question/

function generateQuestionId(): string {
	return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateMockQuestions(noteId: string, title: string, _content: string): Question[] {
	// This is a mock implementation for testing the script structure
	// Will be replaced with actual LLM-based generation
	return [
		{
			id: generateQuestionId(),
			format: 'multiple_choice',
			difficulty: 'medium',
			question: `What is the main concept discussed in "${title}"?`,
			options: ['Concept A', 'Concept B', 'Concept C', 'Concept D'],
			correctAnswer: 0,
			qualityScore: 0.8,
			sourceNoteId: noteId,
			generatedAt: Date.now(),
		},
		{
			id: generateQuestionId(),
			format: 'true_false',
			difficulty: 'easy',
			question: `The note "${title}" contains important information.`,
			correctAnswer: 'true',
			qualityScore: 0.7,
			sourceNoteId: noteId,
			generatedAt: Date.now(),
		},
		{
			id: generateQuestionId(),
			format: 'free_form',
			difficulty: 'hard',
			question: `Summarize the key points from "${title}".`,
			correctAnswer: 'Key points include...',
			qualityScore: 0.85,
			sourceNoteId: noteId,
			generatedAt: Date.now(),
		},
	];
}

// ============ Main ============

async function main() {
	const args = process.argv.slice(2);

	if (args.includes('--help') || args.includes('-h')) {
		console.log(`
Question Generation Script

This script runs the question generation step using concepts from a previous
full pipeline run. It reads note content fresh from the vault.

Usage:
  npx tsx scripts/run-question-generation.ts [options]

Environment (via direnv):
  TEST_VAULT_PATH     Required. Path to the Obsidian vault.
  ANTHROPIC_API_KEY   Required. For LLM question generation.

Options:
  --input <path>     Input file from previous run (default: outputs/full-pipeline-run.json)
  --output <path>    Output file (default: outputs/question-generation-run.json)
  --concept <id>     Generate for specific concept ID (optional)
  --limit <n>        Limit number of concepts to process (default: 5)
  --notes <n>        Number of notes per concept (default: 15)
  --no-cache         Disable question caching
  --help, -h         Show help

Examples:
  # Generate questions for top 3 concepts
  npx tsx scripts/run-question-generation.ts --limit 3

  # Generate for specific concept
  npx tsx scripts/run-question-generation.ts --concept concept-123

  # Disable caching to force regeneration
  npx tsx scripts/run-question-generation.ts --no-cache --limit 1
`);
		process.exit(0);
	}

	// Get configuration
	const resolvedVaultPath = requireTestVaultPath();
	const inputPath = getArg(args, '--input') ?? 'outputs/full-pipeline-run.json';
	const outputPath = getArg(args, '--output') ?? 'outputs/question-generation-run.json';
	const specificConceptId = getArg(args, '--concept');
	const conceptLimit = parseInt(getArg(args, '--limit') ?? '5', 10);
	const notesPerConcept = parseInt(getArg(args, '--notes') ?? '15', 10);
	const cacheEnabled = !args.includes('--no-cache');

	const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
	if (!anthropicApiKey) {
		console.error('Error: ANTHROPIC_API_KEY environment variable required');
		process.exit(1);
	}

	// Load previous pipeline output
	if (!existsSync(inputPath)) {
		console.error(`Error: Input file not found: ${inputPath}`);
		console.error('Run the full pipeline first: npx tsx scripts/run-full-pipeline.ts');
		process.exit(1);
	}

	console.error('=== Question Generation ===');
	console.error(`Vault: ${resolvedVaultPath}`);
	console.error(`Input: ${inputPath}`);
	console.error(`Cache: ${cacheEnabled ? 'enabled' : 'disabled'}`);
	console.error('');

	const startTime = Date.now();

	// Parse input file
	console.error('Loading previous pipeline output...');
	const inputContent = readFileSync(inputPath, 'utf-8');
	const pipelineOutput: FullPipelineOutput = JSON.parse(inputContent);

	let concepts = pipelineOutput.finalResult.concepts;
	console.error(`  Found ${concepts.length} concepts`);

	// Filter to quizzable concepts
	concepts = concepts.filter((c) => c.quizzabilityScore >= 0.4);
	console.error(`  Quizzable: ${concepts.length}`);

	// Filter to specific concept if requested
	if (specificConceptId) {
		concepts = concepts.filter((c) => c.id === specificConceptId);
		if (concepts.length === 0) {
			console.error(`Error: Concept not found: ${specificConceptId}`);
			process.exit(1);
		}
		console.error(`  Selected: ${concepts[0].canonicalName}`);
	} else {
		// Sort by note count and limit
		concepts = concepts.sort((a, b) => b.noteIds.length - a.noteIds.length).slice(0, conceptLimit);
		console.error(`  Processing top ${concepts.length} concepts by note count`);
	}
	console.error('');

	// Read vault for note content
	console.error('Reading vault...');
	const vault = readVault(resolvedVaultPath);
	console.error(`  Notes: ${vault.files.size}`);
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

	for (const concept of concepts) {
		console.error(`Processing: ${concept.canonicalName} (${concept.noteIds.length} notes)`);

		const result: ConceptQuestionResult = {
			id: concept.id,
			name: concept.canonicalName,
			noteCount: concept.noteIds.length,
			notesSelected: 0,
			questions: [],
			stats: {
				cacheHits: 0,
				cacheMisses: 0,
				llmBatches: 0,
				tokensUsed: {input: 0, output: 0},
			},
		};

		// Select notes (simple: take first N that exist in vault)
		const selectedNotes: Array<{noteId: string; title: string; content: string}> = [];

		for (const noteId of concept.noteIds) {
			if (selectedNotes.length >= notesPerConcept) break;

			const content = vault.contents.get(noteId);
			if (content) {
				const title = basename(noteId, '.md');
				selectedNotes.push({noteId, title, content});
			}
		}

		result.notesSelected = selectedNotes.length;
		console.error(`  Selected ${selectedNotes.length} notes`);

		// Generate questions for each note
		// TODO: Replace with batched LLM calls when implementation is ready
		for (const note of selectedNotes) {
			const questions = generateMockQuestions(note.noteId, note.title, note.content);
			result.questions.push(...questions);
			result.stats.cacheMisses++;
		}

		// Mock token usage (will be real when using LLM)
		result.stats.llmBatches = Math.ceil(selectedNotes.length / 5);
		result.stats.tokensUsed = {
			input: selectedNotes.length * 500,
			output: result.questions.length * 100,
		};

		console.error(`  Generated ${result.questions.length} questions`);

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
