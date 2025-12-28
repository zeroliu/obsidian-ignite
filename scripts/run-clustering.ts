#!/usr/bin/env npx tsx
/**
 * Run embedding-based clustering (V2) on a vault
 *
 * Usage:
 *   TEST_VAULT_PATH=~/Documents/MyVault OPENAI_API_KEY=xxx npx tsx scripts/run-clustering.ts [options]
 *
 * Environment:
 *   TEST_VAULT_PATH   Required. Path to the Obsidian vault to test with.
 *   OPENAI_API_KEY    Required for embedding
 *
 * Options:
 *   --output <path>   Output file (default: outputs/vault-clusters-v2.json)
 *   --help, -h        Show help
 *
 * Caching:
 *   Embeddings are cached in <output-dir>/.embedding-cache/ to avoid redundant API calls.
 *   The cache is content-hash based, so only modified notes are re-embedded.
 */

import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {basename, dirname, join} from 'node:path';
import {OpenAIEmbeddingAdapter} from '../src/adapters/openai/OpenAIEmbeddingAdapter';
import {EmbeddingOrchestrator} from '../src/domain/embedding/embedBatch';
import {EmbeddingCacheManager} from '../src/domain/embedding/cache';
import {ClusteringPipeline} from '../src/domain/clustering/pipeline';
import {cosineSimilarity} from '../src/domain/clustering/centroidCalculator';
import {getArg, readVault, requireTestVaultPath} from './lib/vault-helpers';
import {FileStorageAdapter} from './lib/file-storage';

// ============ Types ============

interface ClusteringOutput {
	stats: {
		totalNotes: number;
		clusteredNotes: number;
		noiseNotes: number;
		stubNotes: number;
		clusterCount: number;
		avgClusterSize: number;
		embeddingDimensions: number;
		umapDimensions: number;
		embeddingStats: {
			cacheHits: number;
			cacheMisses: number;
			tokensProcessed: number;
			estimatedCost: number;
		};
	};
	clusters: Array<{
		id: string;
		noteIds: string[];
		noteCount: number;
		representativeNotes: Array<{
			path: string;
			title: string;
			distanceToCentroid: number;
		}>;
		candidateNames: string[];
		dominantTags: string[];
		folderPath: string;
		internalLinkDensity: number;
	}>;
	noiseNotes: string[];
	stubs: string[];
	timing: {
		embeddingMs: number;
		clusteringMs: number;
		totalMs: number;
	};
}

// ============ Main ============

async function main() {
	const args = process.argv.slice(2);

	if (args.includes('--help') || args.includes('-h')) {
		console.log(`
Usage: TEST_VAULT_PATH=~/Documents/MyVault OPENAI_API_KEY=xxx npx tsx scripts/run-clustering.ts [options]

Options:
  --output <path>   Output file (default: outputs/vault-clusters-v2.json)
  --help, -h        Show help

Environment:
  TEST_VAULT_PATH   Required. Path to the Obsidian vault to test with.
  OPENAI_API_KEY    Required for embedding

Caching:
  Embeddings are cached in <output-dir>/.embedding-cache/ to avoid redundant API calls.
  The cache is content-hash based, so only modified notes are re-embedded.

Example:
  TEST_VAULT_PATH=~/Documents/MyVault OPENAI_API_KEY=sk-xxx npx tsx scripts/run-clustering.ts
`);
		process.exit(0);
	}

	// Get vault path from environment
	const resolvedVaultPath = requireTestVaultPath();

	const outputPath = getArg(args, '--output') ?? 'outputs/vault-clusters-v2.json';

	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		console.error('Error: OPENAI_API_KEY environment variable required');
		process.exit(1);
	}

	console.error(`=== Clustering V2 Pipeline ===`);
	console.error(`Vault: ${resolvedVaultPath}`);
	console.error('');

	const totalStartTime = Date.now();

	// Step 1: Read vault
	console.error('Step 1: Reading vault...');
	const vault = readVault(resolvedVaultPath);
	const {files, contents, noteTags, resolvedLinks, stubs} = vault;

	console.error(`Non-stub notes: ${files.size}`);
	console.error(`Stub notes excluded: ${stubs.length}`);
	console.error('');

	// Step 2: Embed notes
	console.error('Step 2: Embedding notes...');
	const embeddingStartTime = Date.now();

	// Set up file-based cache for embeddings
	const cacheDir = join(dirname(outputPath), '.embedding-cache');
	const storage = new FileStorageAdapter(cacheDir);
	const cache = new EmbeddingCacheManager(storage);
	await cache.initialize();

	const provider = new OpenAIEmbeddingAdapter({apiKey});

	// Check for provider/model changes (invalidates cache if changed)
	await cache.setProviderModel(provider.getProviderName(), provider.getModelName());

	const orchestrator = new EmbeddingOrchestrator(provider, cache, {useCache: true});

	const notesToEmbed = Array.from(contents.entries()).map(([path, content]) => ({
		notePath: path,
		content,
	}));

	const embeddingResult = await orchestrator.embedNotes(notesToEmbed, (completed, total) => {
		process.stderr.write(`\r  Embedded ${completed}/${total} notes`);
	});
	console.error('');

	// Flush cache to persist new embeddings
	await cache.flush();

	const embeddingMs = Date.now() - embeddingStartTime;
	console.error(
		`Embedding complete: ${embeddingResult.notes.length} notes, ${embeddingResult.stats.tokensProcessed} tokens`,
	);
	console.error(
		`Cache: ${embeddingResult.stats.cacheHits} hits, ${embeddingResult.stats.cacheMisses} misses`,
	);
	if (embeddingResult.stats.cacheMisses > 0) {
		console.error(`Estimated cost (new embeddings): $${embeddingResult.stats.estimatedCost.toFixed(6)}`);
	}
	console.error('');

	// Step 3: Run clustering
	console.error('Step 3: Clustering (UMAP + HDBSCAN)...');
	const clusteringStartTime = Date.now();

	const pipeline = new ClusteringPipeline();
	const clusteringResult = await pipeline.run({
		embeddedNotes: embeddingResult.notes,
		noteTags,
		resolvedLinks,
		files,
		previousState: null,
	});

	const clusteringMs = Date.now() - clusteringStartTime;
	console.error(`Clustering complete: ${clusteringResult.result.clusters.length} clusters found`);
	console.error(`Noise notes: ${clusteringResult.result.noiseNotes.length}`);
	console.error('');

	// Build output
	const embeddingMap = new Map<string, number[]>();
	for (const note of embeddingResult.notes) {
		embeddingMap.set(note.notePath, note.embedding);
	}

	const output: ClusteringOutput = {
		stats: {
			totalNotes: files.size + stubs.length,
			clusteredNotes: clusteringResult.result.clusters.reduce((sum, c) => sum + c.noteIds.length, 0),
			noiseNotes: clusteringResult.result.noiseNotes.length,
			stubNotes: stubs.length,
			clusterCount: clusteringResult.result.clusters.length,
			avgClusterSize:
				clusteringResult.result.clusters.length > 0
					? clusteringResult.result.clusters.reduce((sum, c) => sum + c.noteIds.length, 0) /
						clusteringResult.result.clusters.length
					: 0,
			embeddingDimensions: provider.getDimensions(),
			umapDimensions: 10,
			embeddingStats: {
				cacheHits: embeddingResult.stats.cacheHits,
				cacheMisses: embeddingResult.stats.cacheMisses,
				tokensProcessed: embeddingResult.stats.tokensProcessed,
				estimatedCost: embeddingResult.stats.estimatedCost,
			},
		},
		clusters: clusteringResult.result.clusters.map((cluster) => ({
			id: cluster.id,
			noteIds: cluster.noteIds,
			noteCount: cluster.noteIds.length,
			representativeNotes: cluster.representativeNotes.map((notePath) => {
				const embedding = embeddingMap.get(notePath);
				const distance = embedding && cluster.centroid
					? 1 - cosineSimilarity(embedding, cluster.centroid)
					: 0;
				return {
					path: notePath,
					title: files.get(notePath)?.basename ?? basename(notePath, '.md'),
					distanceToCentroid: distance,
				};
			}),
			candidateNames: cluster.candidateNames,
			dominantTags: cluster.dominantTags,
			folderPath: cluster.folderPath,
			internalLinkDensity: cluster.internalLinkDensity,
		})),
		noiseNotes: clusteringResult.result.noiseNotes,
		stubs,
		timing: {
			embeddingMs,
			clusteringMs,
			totalMs: Date.now() - totalStartTime,
		},
	};

	// Ensure output directory exists
	const outputDir = dirname(outputPath);
	if (!existsSync(outputDir)) {
		mkdirSync(outputDir, {recursive: true});
	}

	writeFileSync(outputPath, JSON.stringify(output, null, 2));

	// Print summary
	console.error('=== Results ===');
	console.error(`Total notes: ${output.stats.totalNotes}`);
	console.error(`Clustered: ${output.stats.clusteredNotes}`);
	console.error(`Noise: ${output.stats.noiseNotes}`);
	console.error(`Stubs: ${output.stats.stubNotes}`);
	console.error(`Clusters: ${output.stats.clusterCount}`);
	console.error(`Avg cluster size: ${output.stats.avgClusterSize.toFixed(1)}`);
	console.error('');
	console.error(`Total time: ${(output.timing.totalMs / 1000).toFixed(2)}s`);
	console.error(`  Embedding: ${(output.timing.embeddingMs / 1000).toFixed(2)}s`);
	console.error(`  Clustering: ${(output.timing.clusteringMs / 1000).toFixed(2)}s`);
	console.error('');
	console.error(`Output saved to: ${outputPath}`);

	// Print top clusters
	console.error('');
	console.error('=== Top 10 Clusters ===');
	const sortedClusters = [...output.clusters].sort((a, b) => b.noteCount - a.noteCount);
	for (const cluster of sortedClusters.slice(0, 10)) {
		console.error(
			`  [${cluster.noteCount} notes] ${cluster.candidateNames.slice(0, 3).join(', ')}`,
		);
		console.error(`    Tags: ${cluster.dominantTags.slice(0, 5).join(', ') || '(none)'}`);
		console.error(`    Representatives: ${cluster.representativeNotes.map((n) => n.title).join(', ')}`);
	}
}

main().catch((err) => {
	console.error('Error:', err.message);
	console.error(err.stack);
	process.exit(1);
});
