#!/usr/bin/env npx tsx
/**
 * Test embedding provider with real vault
 *
 * Usage:
 *   TEST_VAULT_PATH=~/Documents/MyVault OPENAI_API_KEY=xxx npx tsx scripts/test-embedding-provider.ts [options]
 *
 * Environment:
 *   TEST_VAULT_PATH   Required. Path to the Obsidian vault to test with.
 *   OPENAI_API_KEY    Required for OpenAI provider
 *   VOYAGE_API_KEY    Required for Voyage provider
 *
 * Options:
 *   --provider <openai|voyage>  Embedding provider (default: openai)
 *   --limit <number>            Max notes to embed (default: 20)
 *   --output <path>             Output file (default: outputs/embedding-provider-test.json)
 *   --help, -h                  Show help
 */

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, dirname} from 'node:path';
import {OpenAIEmbeddingAdapter} from '../src/adapters/openai/OpenAIEmbeddingAdapter';
import {VoyageEmbeddingAdapter} from '../src/adapters/voyage/VoyageEmbeddingAdapter';
import type {IEmbeddingProvider} from '../src/ports/IEmbeddingProvider';
import {prepareTextForEmbedding} from '../src/domain/embedding/prepareText';
import {DEFAULT_TEXT_PREPARE_CONFIG} from '../src/domain/embedding/types';
import {findMarkdownFiles, getArg, requireTestVaultPath} from './lib/vault-helpers';

// ============ Types ============

interface EmbeddingTestOutput {
	provider: string;
	model: string;
	dimensions: number;
	notesProcessed: number;
	totalTokens: number;
	estimatedCost: number;
	sampleEmbeddings: Array<{
		notePath: string;
		noteTitle: string;
		tokenCount: number;
		embeddingPreview: number[];
	}>;
	timing: {
		totalMs: number;
		avgPerNote: number;
	};
}

// ============ Helpers ============

function shuffleArray<T>(array: T[]): T[] {
	const shuffled = [...array];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}

// ============ Main ============

async function main() {
	const args = process.argv.slice(2);

	// Help
	if (args.includes('--help') || args.includes('-h')) {
		console.log(`
Usage: TEST_VAULT_PATH=~/Documents/MyVault OPENAI_API_KEY=xxx npx tsx scripts/test-embedding-provider.ts [options]

Options:
  --provider <openai|voyage>  Embedding provider (default: openai)
  --limit <number>            Max notes to embed (default: 20)
  --output <path>             Output file (default: outputs/embedding-provider-test.json)
  --help, -h                  Show help

Environment:
  TEST_VAULT_PATH   Required. Path to the Obsidian vault to test with.
  OPENAI_API_KEY    Required for OpenAI provider
  VOYAGE_API_KEY    Required for Voyage provider

Example:
  TEST_VAULT_PATH=~/Documents/MyVault OPENAI_API_KEY=sk-xxx npx tsx scripts/test-embedding-provider.ts --limit 10
`);
		process.exit(0);
	}

	// Get vault path from environment
	const resolvedVaultPath = requireTestVaultPath();

	const providerName = getArg(args, '--provider') ?? 'openai';
	const limit = parseInt(getArg(args, '--limit') ?? '20', 10);
	const outputPath = getArg(args, '--output') ?? 'outputs/embedding-provider-test.json';

	// Create provider
	let provider: IEmbeddingProvider;

	if (providerName === 'openai') {
		const apiKey = process.env.OPENAI_API_KEY;
		if (!apiKey) {
			console.error('Error: OPENAI_API_KEY environment variable required');
			process.exit(1);
		}
		provider = new OpenAIEmbeddingAdapter({apiKey});
	} else if (providerName === 'voyage') {
		const apiKey = process.env.VOYAGE_API_KEY;
		if (!apiKey) {
			console.error('Error: VOYAGE_API_KEY environment variable required');
			process.exit(1);
		}
		provider = new VoyageEmbeddingAdapter({apiKey});
	} else {
		console.error(`Error: Unknown provider: ${providerName}`);
		console.error('Supported providers: openai, voyage');
		process.exit(1);
	}

	console.error(`=== Embedding Provider Test ===`);
	console.error(`Vault: ${resolvedVaultPath}`);
	console.error(`Provider: ${provider.getProviderName()} (${provider.getModelName()})`);
	console.error(`Dimensions: ${provider.getDimensions()}`);
	console.error(`Limit: ${limit} notes`);
	console.error('');

	// Find markdown files
	console.error('Scanning vault...');
	const allFiles = findMarkdownFiles(resolvedVaultPath);
	console.error(`Found ${allFiles.length} markdown files`);

	// Sample random files
	const sampledFiles = shuffleArray(allFiles).slice(0, limit);
	console.error(`Sampling ${sampledFiles.length} files for embedding`);
	console.error('');

	// Prepare texts
	const textsToEmbed: Array<{notePath: string; text: string; title: string}> = [];

	for (const filePath of sampledFiles) {
		const content = readFileSync(filePath, 'utf-8');
		const relativePath = filePath.replace(resolvedVaultPath + '/', '');
		const title = basename(filePath, '.md');
		const preparedText = prepareTextForEmbedding(content, DEFAULT_TEXT_PREPARE_CONFIG);

		textsToEmbed.push({
			notePath: relativePath,
			text: preparedText,
			title,
		});
	}

	// Embed
	console.error('Embedding notes...');
	const startTime = Date.now();

	const result = await provider.embedBatch(
		textsToEmbed.map((t) => ({notePath: t.notePath, text: t.text})),
	);

	const endTime = Date.now();
	const totalMs = endTime - startTime;

	console.error(`Done in ${(totalMs / 1000).toFixed(2)}s`);
	console.error('');

	// Build output
	const output: EmbeddingTestOutput = {
		provider: provider.getProviderName(),
		model: provider.getModelName(),
		dimensions: provider.getDimensions(),
		notesProcessed: result.embeddings.length,
		totalTokens: result.totalTokens,
		estimatedCost: result.usage.estimatedCost,
		sampleEmbeddings: result.embeddings.map((emb, i) => ({
			notePath: emb.notePath,
			noteTitle: textsToEmbed[i].title,
			tokenCount: emb.tokenCount,
			embeddingPreview: emb.embedding.slice(0, 10),
		})),
		timing: {
			totalMs,
			avgPerNote: totalMs / result.embeddings.length,
		},
	};

	// Ensure output directory exists
	const outputDir = dirname(outputPath);
	if (!existsSync(outputDir)) {
		mkdirSync(outputDir, {recursive: true});
	}

	// Write output
	writeFileSync(outputPath, JSON.stringify(output, null, 2));

	// Print summary
	console.error('=== Results ===');
	console.error(`Provider: ${output.provider} (${output.model})`);
	console.error(`Dimensions: ${output.dimensions}`);
	console.error(`Notes processed: ${output.notesProcessed}`);
	console.error(`Total tokens: ${output.totalTokens}`);
	console.error(`Estimated cost: $${output.estimatedCost.toFixed(6)}`);
	console.error(`Total time: ${(output.timing.totalMs / 1000).toFixed(2)}s`);
	console.error(`Avg per note: ${output.timing.avgPerNote.toFixed(0)}ms`);
	console.error('');
	console.error(`Output saved to: ${outputPath}`);
}

main().catch((err) => {
	console.error('Error:', err.message);
	process.exit(1);
});
