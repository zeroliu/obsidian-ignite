---
created: 2025-12-25
updated: 2025-12-25
---

# Obsidian AI Recall - Phase 1 Foundation Implementation Plan

## Goal
Implement a testable foundation (sub-phases A-B) for the Obsidian AI Recall plugin with:
- **Phase A**: Core infrastructure with hexagonal architecture
- **Phase B**: Clustering domain algorithms

All code must be testable via `npm test` without Obsidian runtime.

## Project Location
`~/Developer/obsidian-ai-recall` (separate from vault)

## Modern Tooling Stack
- **Test**: Vitest (faster, native ESM, better DX than Jest)
- **Linter/Formatter**: Biome (Rust-based, replaces ESLint + Prettier)
- **Build**: esbuild (fast bundling)
- **TypeScript**: Latest strict mode

---

## Architecture: Hexagonal (Ports & Adapters)

```
┌─────────────────────────────────────────────┐
│           CORE DOMAIN (Pure TS)             │
│  ┌─────────────┐  ┌─────────────────────┐   │
│  │ Clustering  │  │ (Future: Selection, │   │
│  │ Algorithms  │  │  History, Concepts) │   │
│  └─────────────┘  └─────────────────────┘   │
└──────────────────────┬──────────────────────┘
                       │ depends on
┌──────────────────────▼──────────────────────┐
│              PORTS (Interfaces)             │
│  IVaultProvider │ IMetadataProvider │ ...   │
└──────────────────────┬──────────────────────┘
                       │ implemented by
        ┌──────────────┴──────────────┐
        ▼                             ▼
┌───────────────┐           ┌─────────────────┐
│ Mock Adapters │           │ Obsidian Adapters│
│ (for testing) │           │ (for runtime)    │
└───────────────┘           └─────────────────┘
```

---

## Phase A: Core Infrastructure

### A1. Project Scaffolding
Create project at `~/Developer/obsidian-ai-recall`:

| File | Purpose |
|------|---------|
| `package.json` | Latest deps: vitest, typescript, esbuild, obsidian, @anthropic-ai/sdk |
| `tsconfig.json` | Strict TS with `@/` path alias, ESNext target |
| `biome.json` | Biome linter + formatter config |
| `vitest.config.ts` | Vitest with jsdom, path aliases |
| `vitest.setup.ts` | Global test setup with Obsidian mocks |
| `esbuild.config.mjs` | Build configuration |
| `manifest.json` | Obsidian plugin manifest |
| `src/test/mocks/obsidian.ts` | TypeScript Obsidian API mocks |

### A2. Port Interfaces
Create interfaces that abstract Obsidian dependencies:

```
src/ports/
├── IVaultProvider.ts      # listMarkdownFiles(), readFile(), exists()
├── IMetadataProvider.ts   # getFileMetadata(), getResolvedLinks(), getBacklinks()
├── IStorageAdapter.ts     # read(), write(), exists(), delete()
└── index.ts               # Re-exports
```

**Key Types:**
```typescript
// IVaultProvider
interface FileInfo {
  path: string;
  basename: string;
  folder: string;
  modifiedAt: number;
  createdAt: number;
}

// IMetadataProvider
interface FileMetadata {
  path: string;
  tags: string[];
  links: string[];
  headings: HeadingInfo[];
  frontmatter: Record<string, unknown>;
  wordCount: number;
}
```

### A3. Mock Adapters
Create test adapters that load from JSON fixtures:

```
src/adapters/mock/
├── MockVaultAdapter.ts       # Implements IVaultProvider from fixtures
├── MockMetadataAdapter.ts    # Implements IMetadataProvider from fixtures
├── InMemoryStorageAdapter.ts # In-memory key-value storage
└── index.ts
```

### A4. Test Fixtures
Create comprehensive fixture files:

```
src/test/fixtures/
├── types.ts                # VaultFixture, MetadataFixture types
├── react-vault.json        # React notes with links
├── golf-vault.json         # Golf notes
├── mixed-vault.json        # Mixed topics for clustering tests
└── empty-vault.json        # Edge case
```

**Fixture Format:**
```json
{
  "vault": {
    "files": [{ "path": "...", "folder": "...", ... }],
    "contents": { "path": "markdown content..." }
  },
  "metadata": {
    "metadata": { "path": { "tags": [...], "links": [...], ... } },
    "resolvedLinks": { "source.md": { "target.md": 1 } }
  }
}
```

### A5. Verification
- Run `npm test` with a trivial test
- Confirm fixtures load correctly
- Confirm mock adapters return expected data

---

## Phase B: Clustering Domain

### B1. Types and Configuration

```
src/domain/clustering/
├── types.ts              # Cluster, ClusteringConfig
```

**Key Types:**
```typescript
interface Cluster {
  id: string;
  candidateNames: string[];
  noteIds: string[];
  dominantTags: string[];
  folderPath: string;
  internalLinkDensity: number;
  createdAt: number;
}

interface ClusteringConfig {
  minClusterSize: number;     // Default: 5
  maxClusterSize: number;     // Default: 500
  linkDensityThreshold: number; // Default: 0.3
  sampleSize: number;         // Default: 50
}
```

### B2. Clustering Algorithms
Implement each as a pure function with tests:

| File | Function | Test Coverage |
|------|----------|---------------|
| `clusterByFolder.ts` | Group files by folder path | Flat vault, nested folders, root files |
| `refineByTags.ts` | Split clusters by dominant tags | No tags, mixed tags, single tag |
| `analyzeLinks.ts` | Sample-based link analysis | Dense links, sparse links, no links |
| `mergeRelatedClusters.ts` | Merge high-overlap clusters | 30% threshold, size similarity |
| `groupByTitleKeywords.ts` | TF-IDF + CJK segmentation | English, Chinese, Japanese, Korean |
| `normalizeClusterSizes.ts` | Split large, merge small | Edge cases at thresholds |
| `index.ts` | Exports + pipeline function | Full pipeline integration |

### B3. CJK Language Support
In `groupByTitleKeywords.ts`:

```typescript
function extractTitleKeywords(title: string): string[] {
  const lang = detectLanguage(title);
  if (isCJK(lang)) {
    return segmentCJK(title, lang); // Uses Intl.Segmenter
  }
  return extractEnglishKeywords(title); // TF-IDF
}
```

### B4. Integration Test

```typescript
// src/domain/clustering/__tests__/integration.test.ts
describe('Clustering Pipeline', () => {
  it('should cluster React notes together', async () => {
    const files = await vaultAdapter.listMarkdownFiles();
    const metadata = loadMetadata(files);
    const clusters = runClusteringPipeline(files, metadata, config);

    expect(clusters.find(c => c.dominantTags.includes('#react'))).toBeDefined();
    expect(clusters.find(c => c.dominantTags.includes('#golf'))).toBeDefined();
  });
});
```

---

## File Structure (Final)

```
~/Developer/obsidian-ai-recall/
├── src/
│   ├── ports/
│   │   ├── IVaultProvider.ts
│   │   ├── IMetadataProvider.ts
│   │   ├── IStorageAdapter.ts
│   │   └── index.ts
│   ├── domain/
│   │   └── clustering/
│   │       ├── types.ts
│   │       ├── clusterByFolder.ts
│   │       ├── refineByTags.ts
│   │       ├── analyzeLinks.ts
│   │       ├── mergeRelatedClusters.ts
│   │       ├── groupByTitleKeywords.ts
│   │       ├── normalizeClusterSizes.ts
│   │       ├── index.ts
│   │       └── __tests__/
│   │           ├── clusterByFolder.test.ts
│   │           ├── refineByTags.test.ts
│   │           ├── analyzeLinks.test.ts
│   │           ├── mergeRelatedClusters.test.ts
│   │           ├── groupByTitleKeywords.test.ts
│   │           ├── normalizeClusterSizes.test.ts
│   │           └── integration.test.ts
│   ├── adapters/
│   │   └── mock/
│   │       ├── MockVaultAdapter.ts
│   │       ├── MockMetadataAdapter.ts
│   │       ├── InMemoryStorageAdapter.ts
│   │       └── index.ts
│   ├── test/
│   │   ├── mocks/
│   │   │   └── obsidian.ts        # TypeScript Obsidian mocks
│   │   └── fixtures/
│   │       ├── types.ts
│   │       ├── react-vault.json
│   │       ├── golf-vault.json
│   │       ├── mixed-vault.json
│   │       └── empty-vault.json
│   └── main.ts                    # Placeholder plugin entry
├── docs/                          # Copy from vault for reference
│   ├── prd.md
│   ├── interaction-design-spec.md
│   └── technical-design-phase1.md
├── package.json
├── tsconfig.json
├── biome.json                     # Replaces ESLint + Prettier
├── vitest.config.ts               # Replaces jest.config.js
├── vitest.setup.ts                # Replaces jest.setup.js
├── esbuild.config.mjs
└── manifest.json
```

---

## Implementation Order (Step-by-Step)

### Step 1: Scaffolding (~30 min)
1. Create `~/Developer/obsidian-ai-recall` directory
2. Create `package.json` with latest dependencies (vitest, typescript, esbuild, obsidian, @biomejs/biome)
3. Create `tsconfig.json` with strict mode + ESNext
4. Create `biome.json` for linting/formatting
5. Create `vitest.config.ts` with jsdom and path aliases
6. Create `vitest.setup.ts` with Obsidian mocks
7. Create `src/test/mocks/obsidian.ts` (TypeScript mocks)
8. Run `npm install`
9. Verify `npm test` runs (with placeholder test)

### Step 2: Port Interfaces (~20 min)
1. Create `src/ports/IVaultProvider.ts`
2. Create `src/ports/IMetadataProvider.ts`
3. Create `src/ports/IStorageAdapter.ts`
4. Create `src/ports/index.ts`

### Step 3: Mock Adapters + Fixtures (~40 min)
1. Create fixture types in `src/test/fixtures/types.ts`
2. Create `react-vault.json` fixture
3. Create `MockVaultAdapter.ts` with tests
4. Create `MockMetadataAdapter.ts` with tests
5. Create `InMemoryStorageAdapter.ts` with tests

### Step 4: Clustering - Pass 1 (Folder) (~30 min)
1. Create `src/domain/clustering/types.ts`
2. Implement `clusterByFolder.ts` with tests
3. Handle edge cases: flat vault, nested folders, root files

### Step 5: Clustering - Pass 2 (Tags) (~30 min)
1. Implement `refineByTags.ts` with tests
2. Test tag-based splitting logic

### Step 6: Clustering - Pass 3 (Links) (~40 min)
1. Implement `analyzeLinks.ts` with tests (sample-based)
2. Implement `mergeRelatedClusters.ts` with tests
3. Test link density calculations

### Step 7: Clustering - Pass 4 (Keywords) (~45 min)
1. Implement `groupByTitleKeywords.ts`
2. Add CJK segmentation with `Intl.Segmenter`
3. Add language detection
4. Test English, Chinese, Japanese, Korean titles

### Step 8: Clustering - Pass 5 (Normalization) (~20 min)
1. Implement `normalizeClusterSizes.ts` with tests
2. Test split/merge logic at thresholds

### Step 9: Integration (~30 min)
1. Create `index.ts` with pipeline export
2. Create integration test with full fixture
3. Verify complete clustering pipeline

---

## Testing Strategy

| Layer | Test Type | Run With |
|-------|-----------|----------|
| Clustering functions | Unit tests | `npm test` (vitest) |
| Mock adapters | Unit tests | `npm test` |
| Full pipeline | Integration tests | `npm test` |
| Linting/Formatting | Biome | `npm run lint` / `npm run format` |

**Agent Verification**: After each step, run:
- `npm test` - All tests pass
- `npm run lint` - No Biome errors
- `npm run typecheck` - No TypeScript errors

---

## Reference Files

| Purpose | File |
|---------|------|
| Technical spec | Vault: `obsidian-ai-recall/docs/technical-design-phase1.md` |
| Obsidian mock patterns | Vault: `.obsidian/plugins/obsidian-copilot-dev/__mocks__/obsidian.js` |
| Vitest docs | https://vitest.dev/config/ |
| Biome docs | https://biomejs.dev/guides/getting-started/ |

---

## Future Phases (After A-B)

When A-B is validated, continue with:
- **Phase C**: Concept matching and scoring
- **Phase D**: Note selection (spaced repetition)
- **Phase E**: Event-sourced history
- **Phase F**: Obsidian adapters (runtime integration)
- **Phase G**: Claude API integration for concept naming & questions

LLM Provider: Claude API (Anthropic) - to be integrated in Phase G.

---

## Future Clustering Improvements

These improvements are documented for future implementation after Phase B.

### Link-Based Splitting (After Phase B)

Currently links are only used for merging clusters. Add splitting for low-density clusters:

**New Pass 3.5: Split by Link Communities**
```
For each cluster with size > maxClusterSize/2 and linkDensity < 0.15:
  Build bidirectional adjacency list (sample-based if cluster > 500 notes)
  Find connected components via BFS
  If multiple components >= minClusterSize:
    Split into separate clusters
  Else:
    Find high-link "core" notes (top 10% by connections)
    Assign remaining notes to nearest core by:
      1. Direct link exists → assign to that core
      2. Shared tags → assign to core with highest Jaccard similarity
      3. Same parent folder → assign to core in same folder
      4. Else → leave in "uncategorized" sub-cluster
```

### Edge Cases to Handle (Local Clustering)

| Case | Handling |
|------|----------|
| Unlinked orphan notes | Separate into "Uncategorized" cluster |
| Multi-language notes (EN + ZH on same topic) | Cluster by dominant language, cross-link via shared wiki-links |
| Template/boilerplate notes | Detect via high structural similarity, create "Templates" cluster or exclude |
| Stub notes (< 50 words, just links) | Assign to cluster of most-linked note, exclude from cluster naming |
