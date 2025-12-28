# Verification Checkpoints for BERTopic Pipeline

This document defines a repeatable testing process with 6 checkpoints. Each checkpoint has:
- **Artifact**: A concrete output file or test result
- **Verification**: Commands to run
- **Pass Criteria**: What success looks like

**Vault Testing**: Uses live vault path directly (e.g., `~/Documents/MyVault`)
**Output Format**: Full details with note titles for thorough inspection

---

## Checkpoint 1: Embedding Infrastructure (M1-M4)

**Milestones:** M1 (Port & Mock), M2 (Text Prep), M3 (Cache), M4 (Batch)

**Artifact:** Unit test results (all passing)

**Commands:**
```bash
# Run all embedding domain tests
npm run test -- src/domain/embedding/

# Run mock adapter tests
npm run test -- src/adapters/mock/MockEmbeddingAdapter.test.ts

# Type check
npm run typecheck
```

**Pass Criteria:**
- [ ] All tests pass
- [ ] `prepareText` tests cover: YAML frontmatter, code blocks, images, CJK, truncation
- [ ] `cache` tests cover: content hash stability, hit/miss, invalidation, chunking
- [ ] `embedBatch` tests cover: cache integration, progress callbacks, partial failures
- [ ] No type errors

---

## Checkpoint 2: Real Embedding Providers (M5-M6)

**Milestones:** M5 (OpenAI), M6 (Voyage)

**Artifact:** `outputs/embedding-provider-test.json`

**Script:** `scripts/test-embedding-provider.ts`

```typescript
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
    embeddingPreview: number[]; // first 10 values
  }>;
  timing: {
    totalMs: number;
    avgPerNote: number;
  };
}
```

**Commands:**
```bash
# Unit tests
npm run test -- src/adapters/openai/
npm run test -- src/adapters/voyage/

# Live API test (pick one)
OPENAI_API_KEY=xxx npx tsx scripts/test-embedding-provider.ts ~/Documents/MyVault --provider openai --limit 20
VOYAGE_API_KEY=xxx npx tsx scripts/test-embedding-provider.ts ~/Documents/MyVault --provider voyage --limit 20
```

**Pass Criteria:**
- [ ] Unit tests pass (mocked SDK)
- [ ] Script runs without API errors
- [ ] Output JSON shows:
  - Correct dimensions (1536 for OpenAI, 512 for Voyage)
  - Token count > 0 for each note
  - Reasonable cost estimate

---

## Checkpoint 3: Clustering V2 Pipeline (M7-M10)

**Milestones:** M7 (UMAP), M8 (HDBSCAN), M9 (Centroid), M10 (Pipeline)

**Artifact:** `outputs/vault-clusters-v2.json`

**Script:** `scripts/run-clustering-v2.ts`

```typescript
interface ClusteringV2Output {
  stats: {
    totalNotes: number;
    clusteredNotes: number;
    noiseNotes: number;    // HDBSCAN label -1
    stubNotes: number;
    clusterCount: number;
    avgClusterSize: number;
    embeddingDimensions: number;
    umapDimensions: number;
  };
  clusters: Array<{
    id: string;
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
}
```

**Commands:**
```bash
# Unit tests
npm run test -- src/domain/clustering-v2/

# Run on vault
OPENAI_API_KEY=xxx npx tsx scripts/run-clustering-v2.ts ~/Documents/MyVault
```

**Pass Criteria:**
- [ ] Unit tests pass
- [ ] `clusterCount > 0`
- [ ] `clusteredNotes + noiseNotes + stubNotes == totalNotes` (no notes lost)
- [ ] Each cluster has 5 `representativeNotes` (or all notes if < 5)
- [ ] Manual inspection: clusters make semantic sense (related topics grouped)

---

## Checkpoint 4: LLM Pipeline Refactor (M11)

**Milestones:** M11 (TrackedConcept type, merged Stage 3/3.5)

**Artifact:** `outputs/vault-concepts-v2.json`

**Commands:**
```bash
# Unit tests
npm run test -- src/domain/llm/

# Type check (critical for type refactor)
npm run typecheck

# Run LLM naming on clusters from Checkpoint 3
ANTHROPIC_API_KEY=xxx npx tsx scripts/refine-clusters-llm.ts \
  --clusters outputs/vault-clusters-v2.json \
  --output outputs/vault-concepts-v2.json
```

**Output Structure:**
```typescript
interface ConceptsOutput {
  stats: {
    totalConcepts: number;
    quizzableConceptCount: number;
    nonQuizzableConceptCount: number;
    misfitNotesRemoved: number;
    tokenUsage: { inputTokens: number; outputTokens: number };
  };
  concepts: Array<{
    id: string;
    canonicalName: string;        // NOT "name"
    clusterId: string;            // NOT "originalClusterIds[]"
    noteIds: string[];
    quizzabilityScore: number;
    metadata: {
      createdAt: number;
      lastUpdated: number;
    };
    evolutionHistory: [];         // Empty for new concepts
  }>;
  misfitNotes: Array<{
    noteId: string;
    reason: string;
  }>;
}
```

**Pass Criteria:**
- [ ] Unit tests pass
- [ ] No type errors
- [ ] Output uses new type structure:
  - `canonicalName` exists (not `name`)
  - `clusterId` is string (not `originalClusterIds: string[]`)
  - `metadata.createdAt` and `metadata.lastUpdated` exist
  - `evolutionHistory` is empty array
- [ ] `misfitNotes` array present (may be empty)
- [ ] Quizzability threshold: concepts with score < 0.4 in nonQuizzable list

---

## Checkpoint 5: Evolution Module (M12)

**Milestones:** M12 (Jaccard, detectEvolution, autoEvolveConcept)

**Artifact:** `outputs/evolution-test.json`

**Script:** `scripts/test-evolution.ts`

```typescript
interface EvolutionTestOutput {
  oldClusterCount: number;
  newClusterCount: number;
  evolutions: Array<{
    oldClusterId: string;
    newClusterId: string | null;
    overlapScore: number;
    type: 'rename' | 'remap' | 'dissolved';
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
```

**Commands:**
```bash
# Unit tests
npm run test -- src/domain/evolution/

# To test evolution, you need two clustering runs:
# 1. First run (already done in Checkpoint 3)
cp outputs/vault-clusters-v2.json outputs/vault-clusters-v2-baseline.json

# 2. Modify vault (add/edit/delete some notes), re-cluster
OPENAI_API_KEY=xxx npx tsx scripts/run-clustering-v2.ts ~/Documents/MyVault
mv outputs/vault-clusters-v2.json outputs/vault-clusters-v2-modified.json

# 3. Detect evolution
npx tsx scripts/test-evolution.ts \
  --old outputs/vault-clusters-v2-baseline.json \
  --new outputs/vault-clusters-v2-modified.json \
  --concepts outputs/vault-concepts-v2.json
```

**Pass Criteria:**
- [ ] Unit tests pass
- [ ] Evolution types correctly detected:
  - `rename` when overlap > 60%
  - `remap` when overlap 20-60%
  - `dissolved` when overlap < 20%
- [ ] Jaccard calculation correct: `|A ∩ B| / |A ∪ B|`
- [ ] Concept `evolutionHistory` updated with new event

---

## Checkpoint 6: Full Integration (M13)

**Milestones:** M13 (Integration, cleanup, legacy removal)

**Artifact:** Clean build + `outputs/full-pipeline-run.json`

**Script:** `scripts/run-full-pipeline.ts`

```typescript
interface FullPipelineOutput {
  stages: {
    vaultRead: { noteCount: number; durationMs: number };
    embedding: { processed: number; cached: number; tokens: number; durationMs: number };
    clustering: { clusterCount: number; noiseCount: number; durationMs: number };
    llmNaming: { conceptCount: number; tokens: number; durationMs: number };
  };
  finalResult: {
    concepts: TrackedConcept[];
    misfitNotes: MisfitNote[];
  };
  totalDurationMs: number;
}
```

**Commands:**
```bash
# Pre-flight checks
npm run typecheck
npm run test
npm run build

# Full pipeline
OPENAI_API_KEY=xxx ANTHROPIC_API_KEY=xxx npx tsx scripts/run-full-pipeline.ts ~/Documents/MyVault
```

**Pass Criteria:**
- [ ] No type errors
- [ ] All tests pass
- [ ] Build succeeds (`main.js` generated)
- [ ] Full pipeline completes without error
- [ ] Legacy cleanup verified:
  - `src/domain/clustering/` removed (except utilities)
  - `clustering-v2/` renamed to `clustering/`
  - All imports updated

---

## Quick Reference

| Checkpoint | Milestones | Artifact | Main Command |
|------------|------------|----------|--------------|
| 1 | M1-M4 | test pass | `npm test -- src/domain/embedding/` |
| 2 | M5-M6 | `embedding-provider-test.json` | `test-embedding-provider.ts` |
| 3 | M7-M10 | `vault-clusters-v2.json` | `run-clustering-v2.ts` |
| 4 | M11 | `vault-concepts-v2.json` | `refine-clusters-llm.ts` |
| 5 | M12 | `evolution-test.json` | `test-evolution.ts` |
| 6 | M13 | clean build | `npm run build` |

---

## Scripts Summary

| Script | Purpose | Inputs | Outputs |
|--------|---------|--------|---------|
| `test-embedding-provider.ts` | Test real embedding APIs | vault path, provider, limit | `embedding-provider-test.json` |
| `run-clustering-v2.ts` | Run embedding-based clustering | vault path | `vault-clusters-v2.json` |
| `test-evolution.ts` | Test cluster evolution detection | old/new clusters, concepts | `evolution-test.json` |
| `run-full-pipeline.ts` | End-to-end pipeline | vault path | `full-pipeline-run.json` |

---

## Output Directory

All artifacts go to `outputs/` directory:
```
outputs/
├── embedding-provider-test.json    # Checkpoint 2
├── vault-clusters-v2.json          # Checkpoint 3
├── vault-clusters-v2-baseline.json # Checkpoint 5 (copy)
├── vault-clusters-v2-modified.json # Checkpoint 5 (after edits)
├── vault-concepts-v2.json          # Checkpoint 4
├── evolution-test.json             # Checkpoint 5
└── full-pipeline-run.json          # Checkpoint 6
```
