#!/usr/bin/env npx tsx
/**
 * Run complete pipeline: vault → embeddings → clusters → concepts
 *
 * This script is a thin wrapper around PipelineOrchestrator that allows
 * running the production pipeline outside of the Obsidian environment.
 *
 * Usage:
 *   TEST_VAULT_PATH=~/Documents/MyVault OPENAI_API_KEY=xxx ANTHROPIC_API_KEY=xxx npx tsx scripts/run-full-pipeline.ts [options]
 *
 * Environment:
 *   TEST_VAULT_PATH     Required. Path to the Obsidian vault to test with.
 *   OPENAI_API_KEY      Required for embedding
 *   ANTHROPIC_API_KEY   Required for LLM naming
 *
 * Options:
 *   --output <path>   Output directory (default: outputs)
 *   --help, -h        Show help
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AnthropicLLMAdapter } from '../src/adapters/anthropic/AnthropicLLMAdapter';
import {
  FileStorageAdapter,
  FileSystemMetadataAdapter,
  FileSystemVaultAdapter,
} from '../src/adapters/filesystem';
import { OpenAIEmbeddingAdapter } from '../src/adapters/openai/OpenAIEmbeddingAdapter';
import { PipelineOrchestrator } from '../src/domain/pipeline/PipelineOrchestrator';
import type { PersistedClusteringResult, PipelineProgress } from '../src/domain/pipeline/types';
import { getArg, requireTestVaultPath } from './lib/vault-helpers';

// ============ Main ============

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: TEST_VAULT_PATH=~/Documents/MyVault OPENAI_API_KEY=xxx ANTHROPIC_API_KEY=xxx npx tsx scripts/run-full-pipeline.ts [options]

Options:
  --output <path>   Output directory (default: outputs)
  --help, -h        Show help

Environment:
  TEST_VAULT_PATH     Required. Path to the Obsidian vault to test with.
  OPENAI_API_KEY      Required for embedding
  ANTHROPIC_API_KEY   Required for LLM naming

Example:
  TEST_VAULT_PATH=~/Documents/MyVault OPENAI_API_KEY=sk-xxx ANTHROPIC_API_KEY=sk-xxx npx tsx scripts/run-full-pipeline.ts
`);
    process.exit(0);
  }

  // Get vault path from environment
  const resolvedVaultPath = requireTestVaultPath();

  const outputDir = getArg(args, '--output') ?? 'outputs';

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

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  console.error(`=== Full Pipeline ===`);
  console.error(`Vault: ${resolvedVaultPath}`);
  console.error(`Output: ${outputDir}`);
  console.error('');

  // Create adapters
  const vaultAdapter = new FileSystemVaultAdapter(resolvedVaultPath);
  const metadataAdapter = new FileSystemMetadataAdapter(resolvedVaultPath);
  const storageAdapter = new FileStorageAdapter(outputDir);
  const embeddingProvider = new OpenAIEmbeddingAdapter({ apiKey: openaiApiKey });
  const llmProvider = new AnthropicLLMAdapter(anthropicApiKey, {
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 8192,
    batchSize: 10,
  });

  // Create orchestrator
  const orchestrator = new PipelineOrchestrator(
    vaultAdapter,
    metadataAdapter,
    storageAdapter,
    embeddingProvider,
    llmProvider,
    [], // No exclude patterns
  );

  // Run pipeline with progress reporting
  const result = await orchestrator.run((progress: PipelineProgress) => {
    const stageNames: Record<PipelineProgress['stage'], string> = {
      reading: 'Reading',
      embedding: 'Embedding',
      clustering: 'Clustering',
      refining: 'Refining',
      saving: 'Saving',
    };
    process.stderr.write(`\r[${stageNames[progress.stage]}] ${progress.message}`);
    if (progress.current === progress.total) {
      console.error(''); // Newline after stage completion
    }
  });

  // Load persisted result for detailed output
  const persistedResult = await storageAdapter.read<PersistedClusteringResult>('clusters');

  // Print summary
  console.error('');
  console.error('=== Pipeline Complete ===');
  console.error(`Total duration: ${(result.timing.totalMs / 1000).toFixed(2)}s`);
  console.error('');
  console.error('Stage breakdown:');
  console.error(`  Embedding:   ${(result.timing.embeddingMs / 1000).toFixed(2)}s`);
  console.error(`  Clustering:  ${(result.timing.clusteringMs / 1000).toFixed(2)}s`);
  console.error(`  LLM naming:  ${(result.timing.refiningMs / 1000).toFixed(2)}s`);
  console.error('');
  console.error('Results:');
  console.error(`  Notes processed: ${result.totalNotes}`);
  console.error(`  Excluded: ${result.excludedCount}`);
  console.error(`  Clusters found: ${result.clusterCount}`);
  console.error(`  Noise notes: ${result.noiseCount}`);
  console.error(`  Concepts named: ${result.llmStats.conceptsNamed}`);
  console.error(`  Quizzable: ${result.llmStats.quizzableCount}`);
  console.error(`  Non-quizzable: ${result.llmStats.nonQuizzableCount}`);
  console.error(`  Misfit notes: ${result.llmStats.misfitNotesCount}`);
  console.error('');
  console.error('Embedding stats:');
  console.error(`  Cache hits: ${result.embeddingStats.cacheHits}`);
  console.error(`  Cache misses: ${result.embeddingStats.cacheMisses}`);
  console.error(`  Tokens: ${result.embeddingStats.tokensProcessed}`);
  console.error(`  Estimated cost: $${result.embeddingStats.estimatedCost.toFixed(6)}`);
  console.error('');
  console.error('LLM stats:');
  console.error(
    `  Tokens: ${result.llmStats.tokenUsage.inputTokens} in / ${result.llmStats.tokenUsage.outputTokens} out`,
  );
  console.error('');
  console.error(`Output saved to: ${join(outputDir, 'clusters.json')}`);

  // Print top clusters/concepts
  if (persistedResult) {
    console.error('');
    console.error('=== Top 10 Clusters ===');
    const sortedClusters = [...persistedResult.clusters].sort(
      (a, b) => b.noteIds.length - a.noteIds.length,
    );
    for (const cluster of sortedClusters.slice(0, 10)) {
      const quizzable = cluster.quizzabilityScore >= 0.4 ? 'Q' : ' ';
      console.error(
        `  [${quizzable}] ${cluster.canonicalName} (${cluster.noteIds.length} notes, score: ${cluster.quizzabilityScore.toFixed(2)})`,
      );
    }
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
