#!/usr/bin/env npx tsx
/**
 * Run complete pipeline: vault → embeddings → clusters → concepts
 *
 * Usage:
 *   OPENAI_API_KEY=xxx ANTHROPIC_API_KEY=xxx npx tsx scripts/run-full-pipeline.ts ~/path/to/vault [options]
 *
 * Options:
 *   --output <path>   Output file (default: outputs/full-pipeline-run.json)
 *   --help, -h        Show help
 */

import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {OpenAIEmbeddingAdapter} from '../src/adapters/openai/OpenAIEmbeddingAdapter';
import {AnthropicLLMAdapter} from '../src/adapters/anthropic/AnthropicLLMAdapter';
import {EmbeddingOrchestrator} from '../src/domain/embedding/embedBatch';
import {ClusteringPipeline} from '../src/domain/clustering/pipeline';
import {runLLMPipeline} from '../src/domain/llm/pipeline';
import type {Cluster} from '../src/domain/clustering/types';
import type {TrackedConcept, MisfitNote} from '../src/domain/llm/types';
import {getArg, readVault} from './lib/vault-helpers';

// ============ Types ============

interface FullPipelineOutput {
	stages: {
		vaultRead: {noteCount: number; durationMs: number};
		embedding: {processed: number; cached: number; tokens: number; estimatedCost: number; durationMs: number};
		clustering: {clusterCount: number; noiseCount: number; durationMs: number};
		llmNaming: {conceptCount: number; inputTokens: number; outputTokens: number; durationMs: number};
	};
	finalResult: {
		concepts: TrackedConcept[];
		misfitNotes: MisfitNote[];
	};
	totalDurationMs: number;
}

// ============ Main ============

async function main() {
	const args = process.argv.slice(2);

	if (args.includes('--help') || args.includes('-h')) {
		console.log(`
Usage: OPENAI_API_KEY=xxx ANTHROPIC_API_KEY=xxx npx tsx scripts/run-full-pipeline.ts ~/path/to/vault [options]

Options:
  --output <path>   Output file (default: outputs/full-pipeline-run.json)
  --help, -h        Show help

Environment:
  OPENAI_API_KEY      Required for embedding
  ANTHROPIC_API_KEY   Required for LLM naming

Example:
  OPENAI_API_KEY=sk-xxx ANTHROPIC_API_KEY=sk-xxx npx tsx scripts/run-full-pipeline.ts ~/Documents/MyVault
`);
		process.exit(0);
	}

	const vaultPath = args.find((a) => !a.startsWith('--'));
	if (!vaultPath) {
		console.error('Error: Vault path required');
		process.exit(1);
	}

	const resolvedVaultPath = resolve(vaultPath);
	if (!existsSync(resolvedVaultPath)) {
		console.error(`Error: Vault path does not exist: ${resolvedVaultPath}`);
		process.exit(1);
	}

	const outputPath = getArg(args, '--output') ?? 'outputs/full-pipeline-run.json';

	const openaiApiKey = process.env.OPENAI_API_KEY;
	const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

	if (!openaiApiKey) {
		console.error('Error: OPENAI_API_KEY environment variable required');
		process.exit(1);
	}

	if (!anthropicApiKey) {
		console.error('Error: ANTHROPIC_API_KEY environment variable required');
		process.exit(1);
	}

	console.error(`=== Full Pipeline ===`);
	console.error(`Vault: ${resolvedVaultPath}`);
	console.error('');

	const totalStartTime = Date.now();
	const output: FullPipelineOutput = {
		stages: {
			vaultRead: {noteCount: 0, durationMs: 0},
			embedding: {processed: 0, cached: 0, tokens: 0, estimatedCost: 0, durationMs: 0},
			clustering: {clusterCount: 0, noiseCount: 0, durationMs: 0},
			llmNaming: {conceptCount: 0, inputTokens: 0, outputTokens: 0, durationMs: 0},
		},
		finalResult: {concepts: [], misfitNotes: []},
		totalDurationMs: 0,
	};

	// ========== Stage 1: Read Vault ==========
	console.error('Stage 1: Reading vault...');
	const vaultStartTime = Date.now();

	const vault = readVault(resolvedVaultPath);
	const {files, contents, noteTags, resolvedLinks, stubs} = vault;

	output.stages.vaultRead = {
		noteCount: files.size,
		durationMs: Date.now() - vaultStartTime,
	};
	console.error(`  Found ${files.size} notes (${stubs.length} stubs excluded)`);
	console.error(`  Duration: ${(output.stages.vaultRead.durationMs / 1000).toFixed(2)}s`);
	console.error('');

	// ========== Stage 2: Embedding ==========
	console.error('Stage 2: Embedding notes...');
	const embeddingStartTime = Date.now();

	const embeddingProvider = new OpenAIEmbeddingAdapter({apiKey: openaiApiKey});
	const orchestrator = new EmbeddingOrchestrator(embeddingProvider, null, {useCache: false});

	const notesToEmbed = Array.from(contents.entries()).map(([path, content]) => ({
		notePath: path,
		content,
	}));

	const embeddingResult = await orchestrator.embedNotes(notesToEmbed, (completed, total) => {
		process.stderr.write(`\r  Embedded ${completed}/${total} notes`);
	});
	console.error('');

	output.stages.embedding = {
		processed: embeddingResult.notes.length,
		cached: embeddingResult.stats.cacheHits,
		tokens: embeddingResult.stats.tokensProcessed,
		estimatedCost: embeddingResult.stats.estimatedCost,
		durationMs: Date.now() - embeddingStartTime,
	};
	console.error(`  Processed: ${output.stages.embedding.processed} notes`);
	console.error(`  Tokens: ${output.stages.embedding.tokens}`);
	console.error(`  Estimated cost: $${output.stages.embedding.estimatedCost.toFixed(6)}`);
	console.error(`  Duration: ${(output.stages.embedding.durationMs / 1000).toFixed(2)}s`);
	console.error('');

	// ========== Stage 3: Clustering ==========
	console.error('Stage 3: Clustering (UMAP + HDBSCAN)...');
	const clusteringStartTime = Date.now();

	const clusteringPipeline = new ClusteringPipeline();
	const clusteringResult = await clusteringPipeline.run({
		embeddedNotes: embeddingResult.notes,
		noteTags,
		resolvedLinks,
		files,
		previousState: null,
	});

	output.stages.clustering = {
		clusterCount: clusteringResult.result.clusters.length,
		noiseCount: clusteringResult.result.noiseNotes.length,
		durationMs: Date.now() - clusteringStartTime,
	};
	console.error(`  Clusters: ${output.stages.clustering.clusterCount}`);
	console.error(`  Noise notes: ${output.stages.clustering.noiseCount}`);
	console.error(`  Duration: ${(output.stages.clustering.durationMs / 1000).toFixed(2)}s`);
	console.error('');

	// ========== Stage 4: LLM Naming ==========
	console.error('Stage 4: LLM concept naming...');
	const llmStartTime = Date.now();

	// Convert EmbeddingCluster to Cluster for LLM pipeline
	const clusters: Cluster[] = clusteringResult.result.clusters.map((c) => ({
		id: c.id,
		candidateNames: c.candidateNames,
		noteIds: c.noteIds,
		dominantTags: c.dominantTags,
		folderPath: c.folderPath,
		internalLinkDensity: c.internalLinkDensity,
		createdAt: c.createdAt,
		reasons: c.reasons,
	}));

	const llmProvider = new AnthropicLLMAdapter(anthropicApiKey, {
		model: 'claude-haiku-4-5-20251001',
		maxTokens: 8192,
		batchSize: 10,
	});

	const llmResult = await runLLMPipeline({
		clusters,
		fileMap: files,
		llmProvider,
		runRefinement: true,
	});

	output.stages.llmNaming = {
		conceptCount: llmResult.concepts.length,
		inputTokens: llmResult.stats.tokenUsage.inputTokens,
		outputTokens: llmResult.stats.tokenUsage.outputTokens,
		durationMs: Date.now() - llmStartTime,
	};
	console.error(`  Concepts: ${output.stages.llmNaming.conceptCount}`);
	console.error(`  Tokens: ${output.stages.llmNaming.inputTokens} in / ${output.stages.llmNaming.outputTokens} out`);
	console.error(`  Duration: ${(output.stages.llmNaming.durationMs / 1000).toFixed(2)}s`);
	console.error('');

	// ========== Final Result ==========
	// Convert legacy Concept to TrackedConcept format
	output.finalResult = {
		concepts: llmResult.concepts.map((c) => ({
			id: c.id,
			canonicalName: c.name,
			noteIds: c.noteIds,
			quizzabilityScore: c.quizzabilityScore,
			clusterId: c.originalClusterIds[0] ?? '',
			metadata: {
				createdAt: c.createdAt,
				lastUpdated: c.createdAt,
			},
			evolutionHistory: [],
		})),
		misfitNotes: llmResult.misfitNotes.map((m) => ({
			noteId: m.noteTitle,
			reason: m.reason,
		})),
	};

	output.totalDurationMs = Date.now() - totalStartTime;

	// Ensure output directory exists
	const outputDir = dirname(outputPath);
	if (!existsSync(outputDir)) {
		mkdirSync(outputDir, {recursive: true});
	}

	writeFileSync(outputPath, JSON.stringify(output, null, 2));

	// Print summary
	console.error('=== Pipeline Complete ===');
	console.error(`Total duration: ${(output.totalDurationMs / 1000).toFixed(2)}s`);
	console.error('');
	console.error('Stage breakdown:');
	console.error(`  Vault read:  ${(output.stages.vaultRead.durationMs / 1000).toFixed(2)}s`);
	console.error(`  Embedding:   ${(output.stages.embedding.durationMs / 1000).toFixed(2)}s`);
	console.error(`  Clustering:  ${(output.stages.clustering.durationMs / 1000).toFixed(2)}s`);
	console.error(`  LLM naming:  ${(output.stages.llmNaming.durationMs / 1000).toFixed(2)}s`);
	console.error('');
	console.error('Results:');
	console.error(`  Notes processed: ${output.stages.vaultRead.noteCount}`);
	console.error(`  Clusters found: ${output.stages.clustering.clusterCount}`);
	console.error(`  Concepts named: ${output.stages.llmNaming.conceptCount}`);
	console.error(`  Quizzable: ${output.finalResult.concepts.filter((c) => c.quizzabilityScore >= 0.4).length}`);
	console.error(`  Non-quizzable: ${output.finalResult.concepts.filter((c) => c.quizzabilityScore < 0.4).length}`);
	console.error(`  Misfit notes: ${output.finalResult.misfitNotes.length}`);
	console.error('');
	console.error('Cost estimate:');
	console.error(`  Embedding: $${output.stages.embedding.estimatedCost.toFixed(6)}`);
	console.error('');
	console.error(`Output saved to: ${outputPath}`);

	// Print top concepts
	console.error('');
	console.error('=== Top 10 Concepts ===');
	const sortedConcepts = [...output.finalResult.concepts].sort(
		(a, b) => b.noteIds.length - a.noteIds.length,
	);
	for (const concept of sortedConcepts.slice(0, 10)) {
		const quizzable = concept.quizzabilityScore >= 0.4 ? 'Q' : ' ';
		console.error(
			`  [${quizzable}] ${concept.canonicalName} (${concept.noteIds.length} notes, score: ${concept.quizzabilityScore.toFixed(2)})`,
		);
	}
}

main().catch((err) => {
	console.error('Error:', err.message);
	console.error(err.stack);
	process.exit(1);
});
