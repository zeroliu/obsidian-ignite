---
created: 2025-12-27
updated: 2025-12-27
---

# Development Plan: BERTopic-Style Clustering Pipeline

## Overview

This document describes the implementation of a BERTopic-style concept discovery pipeline that **replaces** the legacy metadata-based clustering with embedding-based semantic clustering.

### Current vs. New Architecture

| Aspect                 | Legacy (Current)                             | New (BERTopic)             |
| ---------------------- | -------------------------------------------- | -------------------------- |
| Pipeline               | 8 algorithms (folder, tags, links, keywords) | Embed → UMAP → HDBSCAN     |
| Input                  | File metadata, tags, links                   | Note content embeddings    |
| Cluster Count          | Heuristic-based                              | Auto-discovered by HDBSCAN |
| Semantic Understanding | None                                         | Via embeddings             |

```
Legacy:  Notes → clusterByFolder → refineByTags → analyzeLinks → ... → LLM Naming
New:     Notes → Embedding API → UMAP → HDBSCAN → LLM Naming
```

---

## What to Keep

1. **Hexagonal Architecture** - Ports and adapters pattern
2. **`src/ports/`** - All existing port interfaces
3. **`src/adapters/anthropic/`** - AnthropicLLMAdapter
4. **`src/adapters/mock/`** - MockLLMAdapter, MockVaultAdapter, etc.
5. **`src/domain/llm/`** - LLM pipeline structure - **NEEDS UPDATES** (see Step 12.5)
6. **`src/domain/clustering/handleSpecialNotes.ts`** - Stub/template detection
7. **`src/domain/clustering/filterFiles.ts`** - Path exclusion
8. **`src/domain/clustering/analyzeLinks.ts`** - Link density calculation (reuse as utility)

## What to Delete (After Validation)

Delete the entire `src/domain/clustering/` directory except:

- `handleSpecialNotes.ts` - Move to clustering-v2 (stub/template detection still useful)
- `filterFiles.ts` - Move to clustering-v2 (path exclusion still useful)
- `analyzeLinks.ts` - Move to clustering-v2 (link density calculation still useful)

Files to delete:

- `pipeline.ts` - Replaced by `clustering-v2/pipeline.ts`
- `clusterByFolder.ts`
- `refineByTags.ts`
- `mergeRelatedClusters.ts`
- `groupByTitleKeywords.ts`
- `normalizeClusterSizes.ts`
- `splitByLinkCommunities.ts`
- `enhanceCohesionWithImplicitLinks.ts`
- `mergeSmallClustersIntoLarge.ts`
- `types.ts` - Replaced by `clustering-v2/types.ts`
- `index.ts`
- All `__tests__/` files for the above

---

## File Structure

### New Files to Create

```
src/
├── ports/
│   └── IEmbeddingProvider.ts              # NEW: Embedding port interface
│
├── adapters/
│   ├── openai/
│   │   ├── OpenAIEmbeddingAdapter.ts      # NEW: OpenAI implementation
│   │   ├── index.ts
│   │   └── __tests__/
│   │       └── OpenAIEmbeddingAdapter.test.ts
│   │
│   ├── voyage/
│   │   ├── VoyageEmbeddingAdapter.ts      # NEW: Voyage AI implementation
│   │   ├── index.ts
│   │   └── __tests__/
│   │       └── VoyageEmbeddingAdapter.test.ts
│   │
│   └── mock/
│       ├── MockEmbeddingAdapter.ts        # NEW: Deterministic mock
│       └── __tests__/
│           └── MockEmbeddingAdapter.test.ts
│
├── domain/
│   ├── embedding/                          # NEW: Embedding domain module
│   │   ├── types.ts                       # Embedding types
│   │   ├── prepareText.ts                 # Text preparation for embedding
│   │   ├── embedBatch.ts                  # Batch embedding orchestration
│   │   ├── cache.ts                       # Embedding cache management
│   │   ├── index.ts
│   │   └── __tests__/
│   │       ├── prepareText.test.ts
│   │       ├── embedBatch.test.ts
│   │       └── cache.test.ts
│   │
│   ├── clustering-v2/                      # NEW: Embedding-based clustering
│   │   ├── types.ts                       # Cluster types
│   │   ├── umapReducer.ts                 # UMAP dimensionality reduction
│   │   ├── hdbscanClusterer.ts            # HDBSCAN clustering
│   │   ├── centroidCalculator.ts          # Centroid computation
│   │   ├── incrementalUpdater.ts          # Incremental cluster updates
│   │   ├── pipeline.ts                    # Main pipeline orchestration
│   │   ├── index.ts
│   │   └── __tests__/
│   │       ├── umapReducer.test.ts
│   │       ├── hdbscanClusterer.test.ts
│   │       ├── centroidCalculator.test.ts
│   │       ├── incrementalUpdater.test.ts
│   │       └── pipeline.test.ts
│   │
│   └── evolution/                          # NEW: Concept evolution
│       ├── types.ts                       # Evolution types
│       ├── jaccardSimilarity.ts           # Jaccard similarity calculation
│       ├── detectEvolution.ts             # Cluster evolution detection
│       ├── autoEvolveConcept.ts           # Auto-evolve tracked concepts
│       ├── index.ts
│       └── __tests__/
│           ├── jaccardSimilarity.test.ts
│           ├── detectEvolution.test.ts
│           └── autoEvolveConcept.test.ts
```

### Files to Modify

- `src/ports/index.ts` - Export IEmbeddingProvider
- `src/adapters/mock/index.ts` - Export MockEmbeddingAdapter
- `package.json` - Add new dependencies

---

## NPM Dependencies to Add

```json
{
  "dependencies": {
    "umap-js": "^1.4.0",
    "hdbscan-ts": "^1.5.4",
    "openai": "^4.x.x"
  }
}
```

---

## Type Definitions

### IEmbeddingProvider Port (`src/ports/IEmbeddingProvider.ts`)

```typescript
export interface EmbeddingResult {
  notePath: string;
  embedding: number[];
  tokenCount: number;
}

export interface BatchEmbeddingResult {
  embeddings: EmbeddingResult[];
  totalTokens: number;
  usage: {totalTokens: number; estimatedCost: number; apiCalls: number};
}

export interface EmbeddingConfig {
  apiKey?: string;
  model: string;
  maxTokensPerText: number;
  batchSize: number;
  maxRetries: number;
  retryBaseDelay: number;
}

export interface IEmbeddingProvider {
  embedBatch(
    texts: Array<{notePath: string; text: string}>
  ): Promise<BatchEmbeddingResult>;
  embed(notePath: string, text: string): Promise<EmbeddingResult>;
  getDimensions(): number;
  getProviderName(): string;
  getModelName(): string;
  estimateTokens(text: string): number;
  getConfig(): EmbeddingConfig;
  updateConfig(config: Partial<EmbeddingConfig>): void;
}
```

### Embedding Types (`src/domain/embedding/types.ts`)

```typescript
export interface CachedNoteEmbedding {
  notePath: string;
  contentHash: string;
  embedding: number[];
  provider: string;
  model: string;
  createdAt: number;
  tokenCount: number;
}

export interface EmbeddingIndex {
  version: number;
  provider: string;
  model: string;
  entries: Record<
    string,
    {
      notePath: string;
      contentHash: string;
      chunkId: string;
      indexInChunk: number;
    }
  >;
  lastUpdated: number;
}

export interface TextPrepareConfig {
  maxTokens: number; // 8191 for OpenAI
  stripFrontmatter: boolean;
  summarizeCode: boolean;
  stripImages: boolean;
}
```

### Clustering V2 Types (`src/domain/clustering-v2/types.ts`)

```typescript
export interface UMAPConfig {
  nNeighbors: number; // 15
  minDist: number; // 0.1
  nComponents: number; // 10
  metric: 'cosine' | 'euclidean';
}

export interface HDBSCANConfig {
  minClusterSize: number; // 5
  minSamples: number; // 3
}

export interface EmbeddingCluster {
  id: string;
  noteIds: string[];
  centroid: number[];
  originalCentroid?: number[];
  representativeNotes: string[];
  candidateNames: string[];
  dominantTags: string[];
  folderPath: string;
  internalLinkDensity: number;
  createdAt: number;
  reasons: string[];
}

export interface ClusteringV2Config {
  umap: UMAPConfig;
  hdbscan: HDBSCANConfig;
  incrementalThreshold: number; // 0.05 = 5%
  minNotesForClustering: number; // 10
}
```

### Evolution Types (`src/domain/evolution/types.ts`)

```typescript
export type EvolutionType = 'rename' | 'remap' | 'dissolved';

export interface ClusterEvolution {
  oldClusterId: string;
  newClusterId: string | null;
  overlapScore: number;
  type: EvolutionType;
}

export interface EvolutionEvent {
  ts: number;
  fromCluster: string;
  toCluster: string | null;
  type: EvolutionType;
  overlapScore: number;
}

/**
 * TrackedConcept replaces the legacy Concept type.
 * Used by both evolution module and LLM pipeline.
 */
export interface TrackedConcept {
  id: string;
  canonicalName: string;           // renamed from 'name'
  quizzabilityScore: number;       // 0-1, derive isQuizzable via threshold
  clusterId: string;               // singular, current cluster
  noteIds: string[];
  metadata: {
    createdAt: number;
    lastUpdated: number;
  };
  evolutionHistory: EvolutionEvent[];
}

// Quizzability: score >= 0.4 is quizzable
// Evolution thresholds: >60% = rename, 20-60% = remap, <20% = dissolve
```

---

## Implementation Steps

### Step 1: IEmbeddingProvider Port

1. Create `src/ports/IEmbeddingProvider.ts` with interface
2. Update `src/ports/index.ts` to export

### Step 2: MockEmbeddingAdapter

1. Create `src/adapters/mock/MockEmbeddingAdapter.ts`
2. Use hash-based deterministic embedding generation
3. Write tests

### Step 3: Text Preparation

1. Create `src/domain/embedding/types.ts`
2. Create `src/domain/embedding/prepareText.ts`:
   - Strip YAML frontmatter
   - Summarize code blocks: ` ```ts ... ``` ` → `[code: ts]`
   - Strip images, keep alt: `![alt](url)` → `[image: alt]`
   - Truncate to token limit
3. Write tests

### Step 4: Embedding Cache

1. Create `src/domain/embedding/cache.ts`
2. Implement chunked storage (~1000 embeddings per chunk)
3. Content hash for change detection:
   ```typescript
   function generateContentHash(content: string): string {
     const normalized = content.replace(/\s+/g, ' ').trim();
     const sample =
       normalized.length <= 1500
         ? normalized
         : normalized.slice(0, 1000) + normalized.slice(-500);
     return hashString(sample + ':' + normalized.length);
   }
   ```
4. Write tests

### Step 5: Batch Embedding

1. Create `src/domain/embedding/embedBatch.ts`
2. Cache-aware: skip already-cached embeddings
3. Progress callbacks for UI
4. Write tests

### Step 6: OpenAI Embedding Adapter

1. Create `src/adapters/openai/OpenAIEmbeddingAdapter.ts`
2. Model: `text-embedding-3-small` (1536 dims, $0.02/1M tokens)
3. Batch size: 100 texts per API call
4. Retry with exponential backoff
5. Write tests (mock SDK in tests)

### Step 7: Voyage AI Embedding Adapter

1. Create `src/adapters/voyage/VoyageEmbeddingAdapter.ts`
2. Model: `voyage-3-lite` (512 dims, $0.02/1M tokens)
3. Similar structure to OpenAI
4. Write tests

### Step 8: UMAP Reducer

1. Create `src/domain/clustering-v2/umapReducer.ts`
2. Use `umap-js` library
3. Config: nNeighbors=15, minDist=0.1, nComponents=10, metric='cosine'
4. Save transform for incremental updates
5. Write tests

### Step 9: HDBSCAN Clusterer

1. Create `src/domain/clustering-v2/hdbscanClusterer.ts`
2. Use `hdbscan-ts` library
3. Config: minClusterSize=5, minSamples=3
4. Handle noise points (label = -1)
5. Write tests

### Step 10: Centroid Calculator

1. Create `src/domain/clustering-v2/centroidCalculator.ts`
2. Compute cluster centroids (mean of embeddings)
3. Select representative notes (closest to centroid)
4. Write tests

### Step 11: Incremental Updater

1. Create `src/domain/clustering-v2/incrementalUpdater.ts`
2. For <5% vault changes:
   - Embed only new/modified notes
   - Project using existing UMAP transform
   - Assign to nearest centroid
3. For ≥5% changes: trigger full re-cluster
4. Write tests

### Step 12: Clustering V2 Pipeline

1. Create `src/domain/clustering-v2/pipeline.ts`
2. Orchestrate: prepare text → embed → UMAP → HDBSCAN → build clusters
3. Populate cluster metadata for LLM compatibility:
   - `representativeNotes`: Select 5 notes closest to centroid (cosine similarity)
   - `candidateNames`: Extract keywords from representative note titles
   - `dominantTags`: Tags appearing in ≥30% of cluster notes (reuse existing logic)
   - `folderPath`: Most common folder among cluster notes (may be empty if diverse)
   - `internalLinkDensity`: Reuse `analyzeLinks()` from legacy (keep this utility)
4. Include `toLegacyCluster()` conversion function
5. Write integration tests

### Step 12.5: Refactor LLM Pipeline to Match Design

The current LLM implementation deviates from `docs/technical-design-phase1.md`. This step aligns them.

1. **Update `Concept` type to `TrackedConcept`** (`src/domain/llm/types.ts`):
   - Rename `name` → `canonicalName`
   - Change `originalClusterIds: string[]` → `clusterId: string`
   - Add `metadata: { createdAt: number; lastUpdated: number }`
   - Add `evolutionHistory: EvolutionEvent[]`
   - Remove `isQuizzable` boolean (derive from score threshold)

2. **Merge Stage 3 and Stage 3.5 into single-stage naming**:
   - Update `CONCEPT_NAMING_SYSTEM_PROMPT` to include misfit detection
   - Update `ConceptNamingResult` to include `misfitNotes` array
   - Remove `refineClustersBatch()` method from `ILLMProvider`
   - Remove `CLUSTER_REFINEMENT_SYSTEM_PROMPT`
   - Delete `applyClusterRefinements.ts` (logic moves to `processConceptNaming.ts`)

3. **Update LLM output format**:
   ```typescript
   interface ConceptNamingResult {
     clusterId: string;
     canonicalName: string;
     quizzabilityScore: number;
     suggestedMerges: string[];
     misfitNotes: Array<{           // NEW: moved from Stage 3.5
       noteId: string;
       reason: string;
     }>;
   }
   ```

4. **Update `processConceptNaming.ts`**:
   - Handle misfit notes from naming response
   - Populate `clusterId` (singular) instead of `originalClusterIds`
   - Initialize empty `evolutionHistory`
   - Create `TrackedConcept` objects

5. **Update `ILLMProvider` interface** (`src/ports/ILLMProvider.ts`):
   - Remove `refineClustersBatch()` method
   - Keep only `nameConceptsBatch()`

6. Write tests for new types and merged pipeline

### Step 13: Jaccard Similarity

1. Create `src/domain/evolution/jaccardSimilarity.ts`
2. `jaccard(setA, setB) = |A ∩ B| / |A ∪ B|`
3. Write tests

### Step 14: Evolution Detection

1. Create `src/domain/evolution/detectEvolution.ts`
2. Match old clusters to new using Jaccard similarity
3. Classify: >60% = rename, 20-60% = remap, <20% = dissolve
4. Write tests

### Step 15: Auto-Evolve Concept

1. Create `src/domain/evolution/autoEvolveConcept.ts`
2. Update tracked concepts when clusters evolve:
   - rename: keep name, update clusterId
   - remap: adopt new cluster's name
   - dissolve: delete concept (history preserved on notes)
3. Record in `evolutionHistory`
4. Write tests

### Step 16: Integration

1. Update `main.ts` to use new pipeline
2. Add feature flag for gradual rollout
3. Write E2E tests

---

## Storage Layout

```
.recall/
├── config.json                    # User settings
├── embeddings/
│   ├── index.json                 # notePath -> contentHash, chunkId
│   ├── chunk-00.json              # ~1000 embeddings
│   ├── chunk-01.json
│   └── ...
├── clusters.json                  # Raw clusters (regeneratable)
├── concepts/
│   ├── index.json                 # Lightweight concept list
│   └── tracked/{id}.json          # Full concept with evolutionHistory
└── history/                       # Quiz history (unchanged)
```

---

## Testing Strategy

### Unit Tests

| Module               | Key Test Cases                                             |
| -------------------- | ---------------------------------------------------------- |
| prepareText          | Frontmatter stripping, code summarization, CJK, truncation |
| cache                | Content hash, chunk management, invalidation               |
| MockEmbeddingAdapter | Deterministic output, token estimation, batching           |
| umapReducer          | Dimension reduction, transform preservation                |
| hdbscanClusterer     | Cluster formation, noise handling                          |
| incrementalUpdater   | Nearest centroid, threshold detection                      |
| jaccardSimilarity    | Set operations, edge cases                                 |
| detectEvolution      | Evolution type detection                                   |
| autoEvolveConcept    | Rename/remap/dissolve logic                                |

### Integration Tests

1. Embedding → UMAP → HDBSCAN → Cluster output
2. Incremental update flow (add/modify/delete notes)
3. Evolution flow (re-cluster → concept evolution)
4. Full pipeline with LLM naming

### MockEmbeddingAdapter Design

```typescript
class MockEmbeddingAdapter implements IEmbeddingProvider {
  async embed(notePath: string, text: string): Promise<EmbeddingResult> {
    const hash = this.hashString(text);
    const embedding = this.generateEmbeddingFromHash(hash); // deterministic
    return {notePath, embedding, tokenCount: this.estimateTokens(text)};
  }

  private generateEmbeddingFromHash(hash: number): number[] {
    const rng = this.seededRandom(hash);
    const embedding = Array.from({length: 1536}, () => rng() * 2 - 1);
    const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
    return embedding.map((x) => x / norm); // unit vector
  }
}
```

---

## Migration Strategy

The legacy clustering will be **completely removed** after the embedding pipeline is validated.

### Phase 1: Build New Pipeline

1. Implement embedding pipeline in `src/domain/clustering-v2/`
2. Keep legacy in `src/domain/clustering/` during development
3. Both pipelines exist but only new one is used

### Phase 2: Validate & Test

1. Run integration tests with MockEmbeddingAdapter
2. Test with real embedding APIs on sample vaults
3. Compare cluster quality to legacy

### Phase 3: Remove Legacy

1. Delete `src/domain/clustering/` (except `handleSpecialNotes.ts`, `filterFiles.ts`)
2. Move kept files to `src/domain/clustering-v2/`
3. Rename `clustering-v2/` to `clustering/`
4. Update all imports

No data migration needed - clusters regenerate on each run, embedding cache is new.

---

## Key Decisions

1. **Cluster Type Compatibility**: `EmbeddingCluster` extends legacy `Cluster`, with `toLegacyCluster()` for LLM pipeline
2. **Chunked Storage**: 1000 embeddings per chunk for memory efficiency
3. **HDBSCAN Only**: No K-Means fallback - Electron environment is robust enough
4. **Incremental Threshold**: <5% = incremental, ≥5% = full re-cluster
5. **Provider Abstraction**: IEmbeddingProvider allows OpenAI/Voyage/Mock swapping

---

## Phased Implementation Milestones

This section breaks down the implementation into **13 milestones**, each with concrete acceptance criteria and testable deliverables. Each milestone is designed to be completable in 1-2 focused sessions.

### Dependency Graph

```
M1 → M2 → M3 → M4 → M5 → M6 (Embedding infrastructure)
                        ↓
                  M7 → M8 → M9 → M10 (Clustering V2)
                                 ↓
                                M11 (LLM refactor)
                                 ↓
                                M12 (Evolution)
                                 ↓
                                M13 (Integration)
```

### Summary Table

| Milestone | Focus | Key Deliverable | Est. Files |
|-----------|-------|-----------------|------------|
| M1 | Embedding Port & Mock | `IEmbeddingProvider`, `MockEmbeddingAdapter` | 3 |
| M2 | Text Preparation | `prepareText.ts` with full preprocessing | 3 |
| M3 | Embedding Cache | `cache.ts` with chunked storage | 2 |
| M4 | Batch Orchestration | `embedBatch.ts` with cache integration | 2 |
| M5 | OpenAI Adapter | `OpenAIEmbeddingAdapter.ts` | 2 |
| M6 | Voyage AI Adapter | `VoyageEmbeddingAdapter.ts` | 2 |
| M7 | UMAP Reduction | `umapReducer.ts` + clustering-v2 types | 3 |
| M8 | HDBSCAN Clustering | `hdbscanClusterer.ts` | 2 |
| M9 | Centroid Calculator | `centroidCalculator.ts` | 1 |
| M10 | Clustering Pipeline | `pipeline.ts` + `incrementalUpdater.ts` | 5 |
| M11 | LLM Refactor | Updated types and merged stages | 5 |
| M12 | Evolution Module | Jaccard, detection, auto-evolve | 4 |
| M13 | Integration | Feature flag, wiring, cleanup | 3 |

---

### Milestone 1: Embedding Port & Mock Adapter

**Goal:** Establish the embedding abstraction layer with a testable mock implementation.

#### Tasks

1.1. **Create IEmbeddingProvider port** (`src/ports/IEmbeddingProvider.ts`)
   - Define `EmbeddingResult`, `BatchEmbeddingResult`, `EmbeddingConfig` types
   - Define `IEmbeddingProvider` interface with `embed()`, `embedBatch()`, `getDimensions()`, etc.
   - Export from `src/ports/index.ts`

1.2. **Create MockEmbeddingAdapter** (`src/adapters/mock/MockEmbeddingAdapter.ts`)
   - Implement hash-based deterministic embedding generation
   - Use seeded RNG for reproducible unit vectors
   - Support configurable dimensions (default: 1536)
   - Add test helpers: `_getCallHistory()`, `_clearCallHistory()`
   - Export from `src/adapters/mock/index.ts`

1.3. **Write unit tests** (`src/adapters/mock/__tests__/MockEmbeddingAdapter.test.ts`)
   - Determinism: same input → same embedding
   - Different inputs → different embeddings
   - Batch embedding works correctly
   - Token estimation works
   - Unit vector normalization (magnitude ≈ 1)

#### Acceptance Criteria

```bash
npm run test -- MockEmbeddingAdapter.test.ts
# All tests pass

npm run typecheck
# No type errors in new files
```

**Verification:** MockEmbeddingAdapter produces deterministic, normalized embeddings for any input text.

---

### Milestone 2: Text Preparation & Embedding Types

**Goal:** Create the text preprocessing pipeline for embedding.

#### Tasks

2.1. **Create embedding domain types** (`src/domain/embedding/types.ts`)
   - `CachedNoteEmbedding` - Cached embedding with metadata
   - `EmbeddingIndex` - Index for chunked storage
   - `TextPrepareConfig` - Configuration for text preparation

2.2. **Create text preparation module** (`src/domain/embedding/prepareText.ts`)
   - Strip YAML frontmatter
   - Summarize code blocks: ` ```ts ... ``` ` → `[code: ts]`
   - Strip images, keep alt text: `![alt](url)` → `[image: alt]`
   - Handle CJK text properly
   - Truncate to token limit
   - Export `prepareTextForEmbedding(content: string, config: TextPrepareConfig): string`

2.3. **Write unit tests** (`src/domain/embedding/__tests__/prepareText.test.ts`)
   - Frontmatter stripping
   - Code block summarization (various languages)
   - Image handling
   - CJK content preservation
   - Token truncation
   - Combined transformations

#### Acceptance Criteria

```bash
npm run test -- prepareText.test.ts
# All tests pass
```

**Verification:** A markdown note with frontmatter, code blocks, and images is correctly transformed to clean text suitable for embedding.

---

### Milestone 3: Embedding Cache

**Goal:** Implement efficient caching for embeddings to avoid redundant API calls.

#### Tasks

3.1. **Create cache module** (`src/domain/embedding/cache.ts`)
   - `generateContentHash(content: string): string` - Content-based hash for change detection
   - `EmbeddingCacheManager` class:
     - `get(notePath: string, contentHash: string): CachedNoteEmbedding | null`
     - `set(embedding: CachedNoteEmbedding): void`
     - `invalidate(notePath: string): void`
     - `getStats(): { hits: number, misses: number, size: number }`
   - Chunked storage support (~1000 embeddings per chunk)
   - Integration with `IStorageAdapter` port

3.2. **Write unit tests** (`src/domain/embedding/__tests__/cache.test.ts`)
   - Content hash stability (same content → same hash)
   - Content hash sensitivity (different content → different hash)
   - Cache hit/miss behavior
   - Invalidation works correctly
   - Chunk management (simulated large vault)
   - Statistics tracking

#### Acceptance Criteria

```bash
npm run test -- cache.test.ts
# All tests pass
```

**Verification:** Embeddings are cached and retrieved correctly. Modified notes get re-embedded while unchanged notes use cache.

---

### Milestone 4: Batch Embedding Orchestration

**Goal:** Create the orchestration layer that coordinates embedding with caching and progress reporting.

#### Tasks

4.1. **Create batch embedding module** (`src/domain/embedding/embedBatch.ts`)
   - `EmbeddingOrchestrator` class:
     - Constructor takes `IEmbeddingProvider` and `EmbeddingCacheManager`
     - `embedNotes(notes: NoteForEmbedding[]): Promise<EmbeddedNote[]>`
     - Cache-aware: skip already-cached embeddings
     - Progress callback for UI: `onProgress?: (completed: number, total: number) => void`
   - Parallel batching for efficiency
   - Error handling with partial results

4.2. **Create domain index** (`src/domain/embedding/index.ts`)
   - Export all public APIs

4.3. **Write unit tests** (`src/domain/embedding/__tests__/embedBatch.test.ts`)
   - Cache hits skip embedding calls
   - Cache misses trigger embedding
   - Mixed cache hit/miss handling
   - Progress callbacks fire correctly
   - Partial failure handling
   - Usage statistics accurate

#### Acceptance Criteria

```bash
npm run test -- embedBatch.test.ts
# All tests pass
```

**Verification:** Given a set of notes, only changed notes are sent to the embedding provider; cached notes are retrieved from cache.

---

### Milestone 5: OpenAI Embedding Adapter

**Goal:** Implement a real embedding provider using OpenAI's API.

#### Tasks

5.1. **Create OpenAI adapter** (`src/adapters/openai/OpenAIEmbeddingAdapter.ts`)
   - Model: `text-embedding-3-small` (1536 dims, $0.02/1M tokens)
   - Batch size: 100 texts per API call
   - Retry with exponential backoff (429, 5xx errors)
   - Token estimation using tiktoken or approximation
   - Export from `src/adapters/openai/index.ts`

5.2. **Add npm dependency**
   - Add `openai` package to `package.json`

5.3. **Write unit tests** (`src/adapters/openai/__tests__/OpenAIEmbeddingAdapter.test.ts`)
   - Mock the OpenAI SDK
   - Successful embedding
   - Batch handling
   - Retry on rate limit
   - Retry on server error
   - Non-retryable errors (400, 401)
   - Token counting

#### Acceptance Criteria

```bash
npm run test -- OpenAIEmbeddingAdapter.test.ts
# All tests pass

npm run typecheck
# No type errors
```

**Verification:** OpenAI adapter correctly calls the API, handles errors with retry, and returns properly formatted embeddings.

---

### Milestone 6: Voyage AI Embedding Adapter

**Goal:** Add alternative embedding provider for cost/performance flexibility.

#### Tasks

6.1. **Create Voyage adapter** (`src/adapters/voyage/VoyageEmbeddingAdapter.ts`)
   - Model: `voyage-3-lite` (512 dims, $0.02/1M tokens)
   - Similar structure to OpenAI adapter
   - Batch size: 128 texts per API call
   - Retry with exponential backoff
   - Export from `src/adapters/voyage/index.ts`

6.2. **Write unit tests** (`src/adapters/voyage/__tests__/VoyageEmbeddingAdapter.test.ts`)
   - Mock the Voyage API
   - Successful embedding
   - Batch handling
   - Retry logic
   - Different dimensions than OpenAI (512 vs 1536)

#### Acceptance Criteria

```bash
npm run test -- VoyageEmbeddingAdapter.test.ts
# All tests pass
```

**Verification:** Voyage adapter works identically to OpenAI adapter but produces 512-dimensional embeddings.

---

### Milestone 7: UMAP Dimensionality Reduction

**Goal:** Reduce high-dimensional embeddings for clustering.

#### Tasks

7.1. **Create clustering-v2 types** (`src/domain/clustering-v2/types.ts`)
   - `UMAPConfig` - nNeighbors, minDist, nComponents, metric
   - `HDBSCANConfig` - minClusterSize, minSamples
   - `EmbeddingCluster` - Cluster with centroid, noteIds, metadata
   - `ClusteringV2Config` - Full pipeline configuration

7.2. **Add npm dependency**
   - Add `umap-js` to `package.json`

7.3. **Create UMAP reducer** (`src/domain/clustering-v2/umapReducer.ts`)
   - `UMAPReducer` class:
     - `fit(embeddings: number[][]): Promise<number[][]>` - Full fit and transform
     - `transform(newEmbeddings: number[][]): Promise<number[][]>` - Transform using fitted model
     - `isFitted(): boolean`
   - Config: nNeighbors=15, minDist=0.1, nComponents=10, metric='cosine'
   - Save transform for incremental updates

7.4. **Write unit tests** (`src/domain/clustering-v2/__tests__/umapReducer.test.ts`)
   - Output has correct dimensions (n_samples x nComponents)
   - Similar inputs cluster together in reduced space
   - Transform preserves learned structure
   - Different random seeds produce consistent quality

#### Acceptance Criteria

```bash
npm run test -- umapReducer.test.ts
# All tests pass
```

**Verification:** 1536-dimensional embeddings are reduced to 10 dimensions while preserving relative distances.

---

### Milestone 8: HDBSCAN Clustering

**Goal:** Cluster reduced embeddings using HDBSCAN.

#### Tasks

8.1. **Add npm dependency**
   - Add `hdbscan-ts` to `package.json`

8.2. **Create HDBSCAN clusterer** (`src/domain/clustering-v2/hdbscanClusterer.ts`)
   - `HDBSCANClusterer` class:
     - `cluster(points: number[][]): ClusterAssignment[]`
     - Handle noise points (label = -1)
   - Config: minClusterSize=5, minSamples=3

8.3. **Write unit tests** (`src/domain/clustering-v2/__tests__/hdbscanClusterer.test.ts`)
   - Well-separated clusters are identified
   - Noise points are labeled -1
   - Configuration affects cluster count
   - Edge cases (all noise, single cluster)

#### Acceptance Criteria

```bash
npm run test -- hdbscanClusterer.test.ts
# All tests pass
```

**Verification:** HDBSCAN correctly identifies clusters in the reduced embedding space and handles noise points.

---

### Milestone 9: Centroid Calculator

**Goal:** Compute cluster centroids and select representative notes.

#### Tasks

9.1. **Create centroid calculator** (`src/domain/clustering-v2/centroidCalculator.ts`)
   - `computeCentroid(embeddings: number[][]): number[]` - Mean of embeddings
   - `selectRepresentatives(embeddings: number[][], centroid: number[], topK: number): number[]` - Indices closest to centroid
   - `cosineSimilarity(a: number[], b: number[]): number` - Similarity function

9.2. **Write unit tests** (`src/domain/clustering-v2/__tests__/centroidCalculator.test.ts`)
   - Centroid is mean of cluster embeddings
   - Representatives are closest to centroid
   - Cosine similarity is correct
   - Edge cases (single item, identical items)

#### Acceptance Criteria

```bash
npm run test -- centroidCalculator.test.ts
# All tests pass
```

**Verification:** Centroids accurately represent cluster centers, and selected representatives are indeed closest to the centroid.

---

### Milestone 10: Clustering V2 Pipeline

**Goal:** Orchestrate the full embedding-based clustering pipeline.

#### Tasks

10.1. **Move utility files to clustering-v2**
   - Copy `handleSpecialNotes.ts` → `src/domain/clustering-v2/`
   - Copy `filterFiles.ts` → `src/domain/clustering-v2/`
   - Copy `analyzeLinks.ts` → `src/domain/clustering-v2/`
   - Update imports

10.2. **Create incremental updater** (`src/domain/clustering-v2/incrementalUpdater.ts`)
   - Detect change percentage (new/modified/deleted notes)
   - For <5% changes: assign to nearest centroid
   - For ≥5% changes: trigger full re-cluster

10.3. **Create pipeline** (`src/domain/clustering-v2/pipeline.ts`)
   - `ClusteringV2Pipeline` class:
     - `run(input: ClusteringV2Input): Promise<ClusteringV2Result>`
   - Orchestrate: filter → preprocess → embed → UMAP → HDBSCAN → build clusters
   - Populate cluster metadata:
     - `representativeNotes`: 5 notes closest to centroid
     - `candidateNames`: Keywords from representative titles
     - `dominantTags`: Tags in ≥30% of cluster notes
     - `folderPath`: Most common folder
     - `internalLinkDensity`: Reuse `analyzeLinks()`
   - Include `toLegacyCluster()` for compatibility

10.4. **Write tests**
   - `src/domain/clustering-v2/__tests__/incrementalUpdater.test.ts`
   - `src/domain/clustering-v2/__tests__/pipeline.test.ts`

#### Acceptance Criteria

```bash
npm run test -- src/domain/clustering-v2/
# All tests pass
```

**Verification:** Full pipeline runs end-to-end using MockEmbeddingAdapter and produces valid clusters with all required metadata.

---

### Milestone 11: LLM Pipeline Refactor

**Goal:** Update the LLM pipeline to align with the new design.

#### Tasks

11.1. **Update types** (`src/domain/llm/types.ts`)
   - Rename `Concept` → `TrackedConcept`
   - Change `name` → `canonicalName`
   - Change `originalClusterIds: string[]` → `clusterId: string`
   - Add `metadata: { createdAt: number; lastUpdated: number }`
   - Add `evolutionHistory: EvolutionEvent[]`
   - Remove `isQuizzable` boolean (derive from score threshold ≥0.4)

11.2. **Merge Stage 3 and 3.5**
   - Update `CONCEPT_NAMING_SYSTEM_PROMPT` to include misfit detection
   - Update `ConceptNamingResult` to include `misfitNotes` array
   - Update `parseNamingResponse()` for new format

11.3. **Update ILLMProvider** (`src/ports/ILLMProvider.ts`)
   - Remove `refineClustersBatch()` method

11.4. **Update processConceptNaming.ts**
   - Handle misfit notes from naming response
   - Populate `clusterId` (singular)
   - Initialize empty `evolutionHistory`
   - Create `TrackedConcept` objects

11.5. **Cleanup**
   - Delete `applyClusterRefinements.ts`
   - Remove `CLUSTER_REFINEMENT_SYSTEM_PROMPT`
   - Update all imports

11.6. **Update tests**
   - Update all LLM-related tests for new types
   - Update MockLLMAdapter if needed

#### Acceptance Criteria

```bash
npm run test -- src/domain/llm/
# All tests pass

npm run typecheck
# No type errors
```

**Verification:** LLM pipeline still works correctly with the updated `TrackedConcept` type and merged naming+misfit detection.

---

### Milestone 12: Evolution Module

**Goal:** Implement cluster evolution detection and concept tracking.

#### Tasks

12.1. **Create evolution types** (`src/domain/evolution/types.ts`)
   - `EvolutionType = 'rename' | 'remap' | 'dissolved'`
   - `ClusterEvolution` - old/new cluster mapping with overlap score
   - `EvolutionEvent` - Timestamped evolution record

12.2. **Create Jaccard similarity** (`src/domain/evolution/jaccardSimilarity.ts`)
   - `jaccard(setA: Set<string>, setB: Set<string>): number`
   - `|A ∩ B| / |A ∪ B|`

12.3. **Create evolution detection** (`src/domain/evolution/detectEvolution.ts`)
   - `detectEvolution(oldClusters: Cluster[], newClusters: Cluster[]): ClusterEvolution[]`
   - Match old → new using Jaccard similarity
   - Classify: >60% = rename, 20-60% = remap, <20% = dissolve

12.4. **Create auto-evolve** (`src/domain/evolution/autoEvolveConcept.ts`)
   - `autoEvolveConcept(concept: TrackedConcept, evolution: ClusterEvolution): TrackedConcept | null`
   - Handle rename, remap, dissolve cases
   - Record in `evolutionHistory`

12.5. **Write tests**
   - `src/domain/evolution/__tests__/jaccardSimilarity.test.ts`
   - `src/domain/evolution/__tests__/detectEvolution.test.ts`
   - `src/domain/evolution/__tests__/autoEvolveConcept.test.ts`

#### Acceptance Criteria

```bash
npm run test -- src/domain/evolution/
# All tests pass
```

**Verification:** Given old and new clusters, evolution is correctly detected and concepts are properly updated or dissolved.

---

### Milestone 13: Integration & Migration

**Goal:** Wire up the new pipeline and migrate from legacy.

#### Tasks

13.1. **Create integration tests**
   - Full pipeline: notes → embedding → clustering → LLM naming → concepts
   - Incremental update scenario
   - Evolution detection scenario

13.2. **Add feature flag** (optional)
   - Allow switching between legacy and v2 pipeline
   - Configure via settings

13.3. **Update main.ts / plugin entry**
   - Wire new pipeline
   - Add embedding provider selection (OpenAI/Voyage)
   - Add API key configuration

13.4. **Cleanup legacy code**
   - Delete old clustering files (after validation):
     - `clusterByFolder.ts`, `refineByTags.ts`, `mergeRelatedClusters.ts`
     - `groupByTitleKeywords.ts`, `normalizeClusterSizes.ts`
     - `splitByLinkCommunities.ts`, `enhanceCohesionWithImplicitLinks.ts`
     - `mergeSmallClustersIntoLarge.ts`
   - Rename `clustering-v2/` → `clustering/`
   - Update all imports

13.5. **Final verification**
   - All tests pass
   - No type errors
   - Manual testing with sample vault

#### Acceptance Criteria

```bash
npm run test
# All tests pass (including integration)

npm run typecheck
# No type errors

npm run build
# Build succeeds
```

**Verification:** Complete end-to-end pipeline works with real embedding APIs and produces meaningful clusters.
