import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {runLLMPipeline} from '../src/domain/llm/pipeline';
import {runClusteringPipeline} from '../src/domain/clustering/pipeline';
import {MockLLMAdapter} from '../src/adapters/mock/MockLLMAdapter';
import {AnthropicLLMAdapter} from '../src/adapters/anthropic/AnthropicLLMAdapter';
import type {Cluster} from '../src/domain/clustering/types';
import type {FileInfo} from '../src/ports/IVaultProvider';
import type {FileMetadata, ResolvedLinks} from '../src/ports/IMetadataProvider';
import type {ILLMProvider} from '../src/ports/ILLMProvider';

// Parse command line arguments
const args = process.argv.slice(2);
const helpRequested = args.includes('--help') || args.includes('-h');

if (helpRequested) {
  console.log(`
Usage: npx tsx scripts/refine-clusters-llm.ts [options]

Options:
  --vault <path>      Path to vault fixture JSON (default: react-vault.json)
  --clusters <path>   Path to pre-computed clusters JSON (optional, runs clustering if not provided)
  --output <path>     Path to save results (default: <vault>-concepts.json)
  --help, -h          Show this help message

Environment:
  ANTHROPIC_API_KEY   Set to use real Anthropic API instead of mock

Examples:
  npx tsx scripts/refine-clusters-llm.ts
  npx tsx scripts/refine-clusters-llm.ts --vault ./src/test/fixtures/mixed-vault.json
  ANTHROPIC_API_KEY=sk-xxx npx tsx scripts/refine-clusters-llm.ts
`);
  process.exit(0);
}

function getArg(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }
  return undefined;
}

// Configuration with defaults
const vaultPath = getArg('--vault') ?? './src/test/fixtures/zeroliu-vault.json';
const clustersPath = getArg('--clusters');
const outputPath =
  getArg('--output') ?? vaultPath.replace('.json', '-concepts.json');

// Use mock adapter by default, set ANTHROPIC_API_KEY to use real API
const useRealApi = !!process.env.ANTHROPIC_API_KEY;

// Load vault data
if (!existsSync(vaultPath)) {
  console.error(`Error: Vault file not found: ${vaultPath}`);
  process.exit(1);
}

const vaultData = JSON.parse(readFileSync(vaultPath, 'utf-8'));
const files: FileInfo[] = vaultData.vault.files;
const metadata = new Map<string, FileMetadata>(
  Object.entries(vaultData.metadata.metadata)
);
const resolvedLinks: ResolvedLinks = vaultData.metadata.resolvedLinks;

// Build file map for title extraction
const fileMap = new Map<string, FileInfo>();
for (const file of files) {
  fileMap.set(file.path, file);
}

// Get clusters: either from file or run clustering
let clusters: Cluster[];

if (clustersPath && existsSync(clustersPath)) {
  // Load pre-computed clusters
  const clustersData = JSON.parse(readFileSync(clustersPath, 'utf-8'));
  clusters = clustersData.clusters.map(
    (c: {
      id: string;
      noteCount: number;
      linkDensity: number;
      reasons: string[];
      candidateNames: string[];
      dominantTags: string[];
      folderPath: string;
      noteIds: string[];
    }) => ({
      id: c.id,
      candidateNames: c.candidateNames,
      noteIds: c.noteIds,
      dominantTags: c.dominantTags,
      folderPath: c.folderPath,
      internalLinkDensity: c.linkDensity,
      createdAt: Date.now(),
      reasons: c.reasons,
    })
  );
  console.log('=== LLM Cluster Refinement ===');
  console.log(`Loaded ${clusters.length} clusters from: ${clustersPath}`);
} else {
  // Run clustering pipeline first
  console.log('=== Running Clustering Pipeline ===');
  const clusterResult = runClusteringPipeline({
    files,
    metadata,
    resolvedLinks,
  });
  clusters = clusterResult.clusters;
  console.log(`Created ${clusters.length} clusters from ${files.length} files`);
}

console.log(`File map entries: ${fileMap.size}`);
console.log(`Using ${useRealApi ? 'Anthropic API' : 'Mock LLM Adapter'}`);
console.log('');

// Create LLM provider
let llmProvider: ILLMProvider;
if (useRealApi) {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  llmProvider = new AnthropicLLMAdapter(apiKey, {
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 8192,
    batchSize: 10,
  });
} else {
  llmProvider = new MockLLMAdapter();
}

async function main() {
  console.log('Running LLM pipeline...');
  const startTime = Date.now();

  const result = await runLLMPipeline({
    clusters,
    fileMap,
    llmProvider,
    runRefinement: true,
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Sort concepts by note count
  const sortedConcepts = [...result.concepts].sort(
    (a, b) => b.noteIds.length - a.noteIds.length
  );

  // Prepare output
  const output = {
    stats: result.stats,
    quizzableConcepts: result.quizzableConcepts.map((c) => ({
      id: c.id,
      name: c.name,
      noteCount: c.noteIds.length,
      quizzabilityScore: c.quizzabilityScore,
      originalClusterIds: c.originalClusterIds,
      noteIds: c.noteIds,
    })),
    nonQuizzableConcepts: result.nonQuizzableConcepts.map((c) => ({
      id: c.id,
      name: c.name,
      noteCount: c.noteIds.length,
      quizzabilityScore: c.quizzabilityScore,
      originalClusterIds: c.originalClusterIds,
      noteIds: c.noteIds,
    })),
    misfitNotes: result.misfitNotes,
    allConcepts: sortedConcepts.map((c) => ({
      id: c.id,
      name: c.name,
      noteCount: c.noteIds.length,
      quizzabilityScore: c.quizzabilityScore,
      isQuizzable: c.isQuizzable,
      originalClusterIds: c.originalClusterIds,
      noteIds: c.noteIds,
    })),
  };

  writeFileSync(outputPath, JSON.stringify(output, null, 2));

  // Print summary
  console.log(`\n=== Results (${duration}s) ===`);
  console.log(`Total concepts: ${result.stats.totalConcepts}`);
  console.log(`  Quizzable: ${result.stats.quizzableConceptCount}`);
  console.log(`  Non-quizzable: ${result.stats.nonQuizzableConceptCount}`);
  console.log(`Synonym merges: ${result.stats.synonymMergesApplied}`);
  console.log(`Misfit notes: ${result.stats.misfitNotesRemoved}`);
  console.log(
    `Token usage: ${result.stats.tokenUsage.inputTokens} in / ${result.stats.tokenUsage.outputTokens} out`
  );

  console.log('\n=== Top 10 Quizzable Concepts ===');
  for (const concept of result.quizzableConcepts.slice(0, 10)) {
    console.log(
      `  ${concept.name} (${
        concept.noteIds.length
      } notes, score: ${concept.quizzabilityScore.toFixed(2)})`
    );
  }

  console.log('\n=== Non-Quizzable Concepts ===');
  for (const concept of result.nonQuizzableConcepts) {
    console.log(
      `  ${concept.name} (${
        concept.noteIds.length
      } notes, score: ${concept.quizzabilityScore.toFixed(2)})`
    );
  }

  if (result.misfitNotes.length > 0) {
    console.log('\n=== Misfit Notes ===');
    for (const misfit of result.misfitNotes.slice(0, 10)) {
      console.log(`  "${misfit.noteTitle}" - ${misfit.reason}`);
      console.log(`    Suggested tags: ${misfit.suggestedTags.join(', ')}`);
    }
  }

  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch(console.error);
