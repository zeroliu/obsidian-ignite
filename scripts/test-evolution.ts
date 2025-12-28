#!/usr/bin/env npx tsx
/**
 * Test cluster evolution detection
 *
 * Usage:
 *   npx tsx scripts/test-evolution.ts \
 *     --old outputs/vault-clusters-v2-baseline.json \
 *     --new outputs/vault-clusters-v2-modified.json \
 *     --concepts outputs/vault-concepts-v2.json
 *
 * Options:
 *   --old <path>       Old clusters JSON (required)
 *   --new <path>       New clusters JSON (required)
 *   --concepts <path>  Concepts JSON (required)
 *   --output <path>    Output file (default: outputs/evolution-test.json)
 *   --help, -h         Show help
 *
 * Note: This script requires the evolution module (M12) to be implemented.
 * It imports from src/domain/evolution/ which needs:
 *   - jaccardSimilarity.ts
 *   - detectEvolution.ts
 *   - autoEvolveConcept.ts
 */

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import type {TrackedConcept} from '../src/domain/llm/types';
import type {ClusterEvolution, EvolutionType} from '../src/domain/evolution/types';

// ============ Types ============

interface ClusterData {
	id: string;
	noteIds: string[];
	candidateNames: string[];
}

interface EvolutionTestOutput {
	oldClusterCount: number;
	newClusterCount: number;
	evolutions: Array<{
		oldClusterId: string;
		newClusterId: string | null;
		overlapScore: number;
		type: EvolutionType;
		noteOverlap: {
			sharedNotes: number;
			oldTotal: number;
			newTotal: number;
		};
	}>;
	conceptUpdates: Array<{
		conceptId: string;
		canonicalName: string;
		action: 'kept' | 'renamed' | 'remapped' | 'dissolved';
		oldClusterId: string;
		newClusterId: string | null;
		evolutionEventAdded: boolean;
	}>;
	summary: {
		renames: number;
		remaps: number;
		dissolved: number;
	};
}

// ============ Jaccard Similarity (inline implementation) ============

function jaccard(setA: Set<string>, setB: Set<string>): number {
	if (setA.size === 0 && setB.size === 0) return 1;
	if (setA.size === 0 || setB.size === 0) return 0;

	let intersection = 0;
	for (const item of setA) {
		if (setB.has(item)) intersection++;
	}

	const union = setA.size + setB.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

// ============ Evolution Detection (inline implementation) ============

interface DetectEvolutionConfig {
	renameThreshold: number;
	remapThreshold: number;
}

const DEFAULT_CONFIG: DetectEvolutionConfig = {
	renameThreshold: 0.6,
	remapThreshold: 0.2,
};

function detectEvolution(
	oldClusters: ClusterData[],
	newClusters: ClusterData[],
	config: DetectEvolutionConfig = DEFAULT_CONFIG,
): ClusterEvolution[] {
	const evolutions: ClusterEvolution[] = [];

	for (const oldCluster of oldClusters) {
		const oldNoteSet = new Set(oldCluster.noteIds);
		let bestMatch: {cluster: ClusterData; score: number} | null = null;

		// Find best matching new cluster
		for (const newCluster of newClusters) {
			const newNoteSet = new Set(newCluster.noteIds);
			const score = jaccard(oldNoteSet, newNoteSet);

			if (!bestMatch || score > bestMatch.score) {
				bestMatch = {cluster: newCluster, score};
			}
		}

		// Classify evolution type
		let type: EvolutionType;
		let newClusterId: string | null = null;

		if (bestMatch && bestMatch.score >= config.renameThreshold) {
			type = 'rename';
			newClusterId = bestMatch.cluster.id;
		} else if (bestMatch && bestMatch.score >= config.remapThreshold) {
			type = 'remap';
			newClusterId = bestMatch.cluster.id;
		} else {
			type = 'dissolved';
		}

		evolutions.push({
			oldClusterId: oldCluster.id,
			newClusterId,
			overlapScore: bestMatch?.score ?? 0,
			type,
		});
	}

	return evolutions;
}

// ============ Auto-Evolve Concept (inline implementation) ============

function autoEvolveConcept(
	concept: TrackedConcept,
	evolution: ClusterEvolution,
): TrackedConcept | null {
	if (evolution.type === 'dissolved') {
		// Concept is dissolved - return null to indicate deletion
		return null;
	}

	// Create evolution event
	const event = {
		ts: Date.now(),
		fromCluster: evolution.oldClusterId,
		toCluster: evolution.newClusterId,
		type: evolution.type,
		overlapScore: evolution.overlapScore,
	};

	// Update concept
	const updated: TrackedConcept = {
		...concept,
		clusterId: evolution.newClusterId ?? concept.clusterId,
		metadata: {
			...concept.metadata,
			lastUpdated: Date.now(),
		},
		evolutionHistory: [...concept.evolutionHistory, event],
	};

	return updated;
}

// ============ Helpers ============

function getArg(args: string[], name: string): string | undefined {
	const index = args.indexOf(name);
	if (index !== -1 && args[index + 1]) {
		return args[index + 1];
	}
	return undefined;
}

// ============ Main ============

async function main() {
	const args = process.argv.slice(2);

	if (args.includes('--help') || args.includes('-h')) {
		console.log(`
Usage: npx tsx scripts/test-evolution.ts [options]

Options:
  --old <path>       Old clusters JSON (required)
  --new <path>       New clusters JSON (required)
  --concepts <path>  Concepts JSON (required)
  --output <path>    Output file (default: outputs/evolution-test.json)
  --help, -h         Show help

Example:
  npx tsx scripts/test-evolution.ts \\
    --old outputs/vault-clusters-v2-baseline.json \\
    --new outputs/vault-clusters-v2-modified.json \\
    --concepts outputs/vault-concepts-v2.json

Workflow:
  1. Run clustering to get baseline: run-clustering.ts
  2. Copy baseline: cp outputs/vault-clusters-v2.json outputs/vault-clusters-v2-baseline.json
  3. Run LLM naming: refine-clusters-llm.ts
  4. Modify vault (add/edit/delete notes)
  5. Re-cluster: run-clustering.ts
  6. Rename: mv outputs/vault-clusters-v2.json outputs/vault-clusters-v2-modified.json
  7. Run this script to detect evolution
`);
		process.exit(0);
	}

	const oldPath = getArg(args, '--old');
	const newPath = getArg(args, '--new');
	const conceptsPath = getArg(args, '--concepts');
	const outputPath = getArg(args, '--output') ?? 'outputs/evolution-test.json';

	if (!oldPath || !newPath || !conceptsPath) {
		console.error('Error: --old, --new, and --concepts are required');
		console.error('Run with --help for usage');
		process.exit(1);
	}

	for (const [name, path] of [
		['old', oldPath],
		['new', newPath],
		['concepts', conceptsPath],
	]) {
		if (!existsSync(path)) {
			console.error(`Error: ${name} file not found: ${path}`);
			process.exit(1);
		}
	}

	console.error('=== Evolution Detection Test ===');
	console.error(`Old clusters: ${oldPath}`);
	console.error(`New clusters: ${newPath}`);
	console.error(`Concepts: ${conceptsPath}`);
	console.error('');

	// Load data
	const oldData = JSON.parse(readFileSync(oldPath, 'utf-8'));
	const newData = JSON.parse(readFileSync(newPath, 'utf-8'));
	const conceptsData = JSON.parse(readFileSync(conceptsPath, 'utf-8'));

	// Extract clusters (handle both direct array and {clusters: [...]} format)
	const oldClusters: ClusterData[] = (oldData.clusters ?? oldData).map((c: ClusterData) => ({
		id: c.id,
		noteIds: c.noteIds ?? [],
		candidateNames: c.candidateNames ?? [],
	}));

	const newClusters: ClusterData[] = (newData.clusters ?? newData).map((c: ClusterData) => ({
		id: c.id,
		noteIds: c.noteIds ?? [],
		candidateNames: c.candidateNames ?? [],
	}));

	// Extract concepts (handle allConcepts or concepts field)
	const concepts: TrackedConcept[] = conceptsData.allConcepts ?? conceptsData.concepts ?? [];

	console.error(`Old clusters: ${oldClusters.length}`);
	console.error(`New clusters: ${newClusters.length}`);
	console.error(`Concepts: ${concepts.length}`);
	console.error('');

	// Detect evolution
	console.error('Detecting evolution...');
	const evolutions = detectEvolution(oldClusters, newClusters);

	// Build cluster maps for note overlap info
	const oldClusterMap = new Map(oldClusters.map((c) => [c.id, c]));
	const newClusterMap = new Map(newClusters.map((c) => [c.id, c]));

	// Process concepts
	console.error('Processing concept updates...');
	const conceptUpdates: EvolutionTestOutput['conceptUpdates'] = [];

	for (const concept of concepts) {
		// Find evolution for this concept's cluster
		const clusterId = concept.clusterId ?? (concept as {originalClusterIds?: string[]}).originalClusterIds?.[0];
		if (!clusterId) continue;

		const evolution = evolutions.find((e) => e.oldClusterId === clusterId);
		if (!evolution) {
			// No evolution found - cluster might be new or unchanged
			conceptUpdates.push({
				conceptId: concept.id,
				canonicalName: concept.canonicalName ?? (concept as {name?: string}).name ?? '',
				action: 'kept',
				oldClusterId: clusterId,
				newClusterId: clusterId,
				evolutionEventAdded: false,
			});
			continue;
		}

		// Apply evolution
		const evolved = autoEvolveConcept(concept, evolution);

		let action: 'kept' | 'renamed' | 'remapped' | 'dissolved';
		if (!evolved) {
			action = 'dissolved';
		} else if (evolution.type === 'rename') {
			action = 'renamed';
		} else if (evolution.type === 'remap') {
			action = 'remapped';
		} else {
			action = 'kept';
		}

		conceptUpdates.push({
			conceptId: concept.id,
			canonicalName: concept.canonicalName ?? (concept as {name?: string}).name ?? '',
			action,
			oldClusterId: clusterId,
			newClusterId: evolution.newClusterId,
			evolutionEventAdded: evolved !== null,
		});
	}

	// Build output
	const output: EvolutionTestOutput = {
		oldClusterCount: oldClusters.length,
		newClusterCount: newClusters.length,
		evolutions: evolutions.map((e) => {
			const oldCluster = oldClusterMap.get(e.oldClusterId);
			const newCluster = e.newClusterId ? newClusterMap.get(e.newClusterId) : null;
			const oldSet = new Set(oldCluster?.noteIds ?? []);
			const newSet = new Set(newCluster?.noteIds ?? []);

			let sharedNotes = 0;
			for (const note of oldSet) {
				if (newSet.has(note)) sharedNotes++;
			}

			return {
				oldClusterId: e.oldClusterId,
				newClusterId: e.newClusterId,
				overlapScore: e.overlapScore,
				type: e.type,
				noteOverlap: {
					sharedNotes,
					oldTotal: oldCluster?.noteIds.length ?? 0,
					newTotal: newCluster?.noteIds.length ?? 0,
				},
			};
		}),
		conceptUpdates,
		summary: {
			renames: evolutions.filter((e) => e.type === 'rename').length,
			remaps: evolutions.filter((e) => e.type === 'remap').length,
			dissolved: evolutions.filter((e) => e.type === 'dissolved').length,
		},
	};

	// Ensure output directory exists
	const outputDir = dirname(outputPath);
	if (!existsSync(outputDir)) {
		mkdirSync(outputDir, {recursive: true});
	}

	writeFileSync(outputPath, JSON.stringify(output, null, 2));

	// Print summary
	console.error('');
	console.error('=== Evolution Summary ===');
	console.error(`Renames (>60% overlap): ${output.summary.renames}`);
	console.error(`Remaps (20-60% overlap): ${output.summary.remaps}`);
	console.error(`Dissolved (<20% overlap): ${output.summary.dissolved}`);
	console.error('');
	console.error(`Concept updates: ${conceptUpdates.length}`);
	console.error(`  Kept: ${conceptUpdates.filter((c) => c.action === 'kept').length}`);
	console.error(`  Renamed: ${conceptUpdates.filter((c) => c.action === 'renamed').length}`);
	console.error(`  Remapped: ${conceptUpdates.filter((c) => c.action === 'remapped').length}`);
	console.error(`  Dissolved: ${conceptUpdates.filter((c) => c.action === 'dissolved').length}`);
	console.error('');
	console.error(`Output saved to: ${outputPath}`);

	// Print top evolutions
	if (output.evolutions.length > 0) {
		console.error('');
		console.error('=== Evolution Details ===');
		for (const e of output.evolutions.slice(0, 10)) {
			const oldCluster = oldClusterMap.get(e.oldClusterId);
			const newCluster = e.newClusterId ? newClusterMap.get(e.newClusterId) : null;
			console.error(
				`  [${e.type.toUpperCase()}] ${(e.overlapScore * 100).toFixed(0)}% overlap`,
			);
			console.error(`    Old: ${oldCluster?.candidateNames.slice(0, 2).join(', ') ?? e.oldClusterId}`);
			console.error(`    New: ${newCluster?.candidateNames.slice(0, 2).join(', ') ?? e.newClusterId ?? '(dissolved)'}`);
			console.error(`    Notes: ${e.noteOverlap.sharedNotes} shared of ${e.noteOverlap.oldTotal} → ${e.noteOverlap.newTotal}`);
		}
	}
}

main().catch((err) => {
	console.error('Error:', err.message);
	console.error(err.stack);
	process.exit(1);
});
