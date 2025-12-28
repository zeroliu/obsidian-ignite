#!/usr/bin/env npx tsx
/**
 * Refine clusters using LLM to name concepts
 *
 * Usage:
 *   ANTHROPIC_API_KEY=xxx npx tsx scripts/refine-clusters-llm.ts [options]
 *
 * Environment:
 *   ANTHROPIC_API_KEY   Required. API key for Anthropic Claude.
 *
 * Options:
 *   --clusters <path>   Input clusters file (default: outputs/vault-clusters-v2.json)
 *   --output <path>     Output file (default: outputs/vault-concepts-v2.json)
 *   --help, -h          Show help
 */

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, dirname} from 'node:path';
import {config} from 'dotenv';
import {AnthropicLLMAdapter} from '../src/adapters/anthropic/AnthropicLLMAdapter';
import type {Cluster} from '../src/domain/clustering/types';
import {runLLMPipeline} from '../src/domain/llm/pipeline';
import type {MisfitNote, TrackedConcept} from '../src/domain/llm/types';
import type {FileInfo} from '../src/ports/IVaultProvider';
import {getArg} from './lib/vault-helpers';

// Load environment variables
config();

// ============ Types ============

interface ClusteringInput {
	stats: {
		totalNotes: number;
		clusteredNotes: number;
		noiseNotes: number;
		stubNotes: number;
		clusterCount: number;
	};
	clusters: Array<{
		id: string;
		noteIds: string[];
		noteCount: number;
		representativeNotes: Array<{
			path: string;
			title: string;
		}>;
		candidateNames: string[];
		dominantTags: string[];
		folderPath: string;
		internalLinkDensity: number;
	}>;
	noiseNotes: string[];
	stubs: string[];
}

interface ConceptsOutput {
	stats: {
		totalConcepts: number;
		quizzableConceptCount: number;
		nonQuizzableConceptCount: number;
		misfitNotesRemoved: number;
		tokenUsage: {inputTokens: number; outputTokens: number};
	};
	concepts: Array<{
		id: string;
		canonicalName: string;
		clusterId: string;
		noteIds: string[];
		quizzabilityScore: number;
		metadata: {
			createdAt: number;
			lastUpdated: number;
		};
		evolutionHistory: [];
	}>;
	misfitNotes: Array<{
		noteId: string;
		reason: string;
	}>;
}

// ============ Main ============

async function main() {
	const args = process.argv.slice(2);

	if (args.includes('--help') || args.includes('-h')) {
		console.log(`
Usage: ANTHROPIC_API_KEY=xxx npx tsx scripts/refine-clusters-llm.ts [options]

Options:
  --clusters <path>   Input clusters file (default: outputs/vault-clusters-v2.json)
  --output <path>     Output file (default: outputs/vault-concepts-v2.json)
  --help, -h          Show help

Environment:
  ANTHROPIC_API_KEY   Required. API key for Anthropic Claude.

Example:
  ANTHROPIC_API_KEY=sk-ant-xxx npx tsx scripts/refine-clusters-llm.ts
  npx tsx scripts/refine-clusters-llm.ts --clusters outputs/vault-clusters-v2.json
`);
		process.exit(0);
	}

	const clustersPath = getArg(args, '--clusters') ?? 'outputs/vault-clusters-v2.json';
	const outputPath = getArg(args, '--output') ?? 'outputs/vault-concepts-v2.json';

	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		console.error('Error: ANTHROPIC_API_KEY environment variable required');
		process.exit(1);
	}

	// Check if clusters file exists
	if (!existsSync(clustersPath)) {
		console.error(`Error: Clusters file not found: ${clustersPath}`);
		console.error('Run the clustering script first: npx tsx scripts/run-clustering.ts');
		process.exit(1);
	}

	console.error('=== LLM Concept Naming Pipeline ===');
	console.error(`Input: ${clustersPath}`);
	console.error('');

	const startTime = Date.now();

	// Step 1: Load clusters
	console.error('Step 1: Loading clusters...');
	const clusteringInput: ClusteringInput = JSON.parse(readFileSync(clustersPath, 'utf-8'));
	console.error(`Loaded ${clusteringInput.clusters.length} clusters`);
	console.error('');

	// Step 2: Convert to Cluster type and build fileMap
	console.error('Step 2: Preparing data for LLM...');
	const clusters: Cluster[] = clusteringInput.clusters.map((c) => ({
		id: c.id,
		candidateNames: c.candidateNames,
		noteIds: c.noteIds,
		dominantTags: c.dominantTags,
		folderPath: c.folderPath,
		internalLinkDensity: c.internalLinkDensity,
		createdAt: Date.now(),
		reasons: [],
	}));

	// Build fileMap from representative notes (for titles)
	const fileMap = new Map<string, FileInfo>();
	for (const cluster of clusteringInput.clusters) {
		for (const rep of cluster.representativeNotes) {
			if (!fileMap.has(rep.path)) {
				fileMap.set(rep.path, {
					path: rep.path,
					basename: rep.title,
					extension: 'md',
				});
			}
		}
		// Also add noteIds with basename derived from path
		for (const noteId of cluster.noteIds) {
			if (!fileMap.has(noteId)) {
				fileMap.set(noteId, {
					path: noteId,
					basename: basename(noteId, '.md'),
					extension: 'md',
				});
			}
		}
	}
	console.error(`Built fileMap with ${fileMap.size} entries`);
	console.error('');

	// Step 3: Create LLM provider
	console.error('Step 3: Initializing LLM provider...');
	const llmProvider = new AnthropicLLMAdapter(apiKey);
	const config = llmProvider.getConfig();
	console.error(`Model: ${config.model}`);
	console.error(`Batch size: ${config.batchSize}`);
	console.error('');

	// Step 4: Run LLM pipeline
	console.error('Step 4: Running LLM naming pipeline...');
	const result = await runLLMPipeline({
		clusters,
		fileMap,
		llmProvider,
	});

	const durationMs = Date.now() - startTime;

	// Step 5: Build output
	console.error('');
	console.error('Step 5: Building output...');
	const output: ConceptsOutput = {
		stats: {
			totalConcepts: result.stats.totalConcepts,
			quizzableConceptCount: result.stats.quizzableConceptCount,
			nonQuizzableConceptCount: result.stats.nonQuizzableConceptCount,
			misfitNotesRemoved: result.stats.misfitNotesRemoved,
			tokenUsage: result.stats.tokenUsage,
		},
		concepts: result.concepts.map((c: TrackedConcept) => ({
			id: c.id,
			canonicalName: c.canonicalName,
			clusterId: c.clusterId,
			noteIds: c.noteIds,
			quizzabilityScore: c.quizzabilityScore,
			metadata: c.metadata,
			evolutionHistory: [] as [],
		})),
		misfitNotes: result.misfitNotes.map((m: MisfitNote) => ({
			noteId: m.noteId,
			reason: m.reason,
		})),
	};

	// Ensure output directory exists
	const outputDir = dirname(outputPath);
	if (!existsSync(outputDir)) {
		mkdirSync(outputDir, {recursive: true});
	}

	writeFileSync(outputPath, JSON.stringify(output, null, 2));

	// Print summary
	console.error('');
	console.error('=== Results ===');
	console.error(`Total concepts: ${output.stats.totalConcepts}`);
	console.error(`Quizzable: ${output.stats.quizzableConceptCount}`);
	console.error(`Non-quizzable: ${output.stats.nonQuizzableConceptCount}`);
	console.error(`Misfit notes removed: ${output.stats.misfitNotesRemoved}`);
	console.error('');
	console.error(`Token usage:`);
	console.error(`  Input: ${output.stats.tokenUsage.inputTokens}`);
	console.error(`  Output: ${output.stats.tokenUsage.outputTokens}`);
	console.error('');
	console.error(`Duration: ${(durationMs / 1000).toFixed(2)}s`);
	console.error(`Output saved to: ${outputPath}`);

	// Print sample concepts
	console.error('');
	console.error('=== Sample Concepts (Top 10) ===');
	const sortedConcepts = [...output.concepts].sort((a, b) => b.noteIds.length - a.noteIds.length);
	for (const concept of sortedConcepts.slice(0, 10)) {
		const quizzable = concept.quizzabilityScore >= 0.4 ? '✓' : '✗';
		console.error(`  [${quizzable}] ${concept.canonicalName} (${concept.noteIds.length} notes, score: ${concept.quizzabilityScore.toFixed(2)})`);
	}
}

main().catch((err) => {
	console.error('Error:', err.message);
	console.error(err.stack);
	process.exit(1);
});
