# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Breaking Changes

#### `ILLMProvider` Interface Simplified

The `ILLMProvider` interface has been simplified by merging Stage 3 (naming) and Stage 3.5 (refinement) into a single stage.

**Removed method:**
- `refineClustersBatch(request: ClusterRefinementRequest): Promise<ClusterRefinementResponse>`

**Updated method:**
- `nameConceptsBatch()` now returns `misfitNotes` directly in the response, eliminating the need for a separate refinement stage

**Migration guide:**

If you have a custom `ILLMProvider` implementation:

```typescript
// Before (v0.x)
class MyLLMAdapter implements ILLMProvider {
  async nameConceptsBatch(request: ConceptNamingRequest): Promise<ConceptNamingResponse> {
    // naming logic
  }

  async refineClustersBatch(request: ClusterRefinementRequest): Promise<ClusterRefinementResponse> {
    // refinement logic - REMOVE THIS
  }
}

// After (v0.y)
class MyLLMAdapter implements ILLMProvider {
  async nameConceptsBatch(request: ConceptNamingRequest): Promise<ConceptNamingResponse> {
    // naming logic now includes misfitNotes in the response
    return {
      results: results.map(r => ({
        ...r,
        misfitNotes: detectMisfits(r), // Include misfits here
      })),
      usage: { inputTokens, outputTokens },
    };
  }
}
```

#### `Concept` Type Renamed to `TrackedConcept`

The primary concept type is now `TrackedConcept` with enhanced evolution tracking capabilities.

**Key changes:**
- `name` field renamed to `canonicalName`
- `originalClusterIds: string[]` replaced with `clusterId: string` (single current cluster)
- `createdAt: number` moved to `metadata.createdAt`
- Added `metadata.lastUpdated` field
- Added `evolutionHistory: EvolutionEvent[]` for tracking concept evolution

**Migration guide:**

```typescript
// Before
const concept: Concept = {
  id: 'concept-1',
  name: 'JavaScript Basics',
  noteIds: ['js-intro.md'],
  quizzabilityScore: 0.8,
  isQuizzable: true,
  originalClusterIds: ['cluster-1'],
  createdAt: Date.now(),
};

// After
const concept: TrackedConcept = {
  id: 'concept-1',
  canonicalName: 'JavaScript Basics',
  noteIds: ['js-intro.md'],
  quizzabilityScore: 0.8,
  clusterId: 'cluster-1',
  metadata: {
    createdAt: Date.now(),
    lastUpdated: Date.now(),
  },
  evolutionHistory: [],
};
```

**Helper functions:**
- `toLegacyConcept(tracked)` - Convert TrackedConcept to legacy Concept format
- `fromLegacyConcept(legacy)` - Convert legacy Concept to TrackedConcept format
- `isQuizzable(concept)` - Check if concept is quizzable (score >= 0.4)

### Added

- **Evolution Domain** (`src/domain/evolution/`): New module for tracking concept changes over time
  - `detectEvolution()` - Detect splits, merges, and growth patterns between cluster versions
  - `autoEvolveConcept()` - Apply evolution events to concepts
  - `jaccard()` - Calculate Jaccard similarity for note overlap
  - Deterministic tiebreaker logic for evolution detection

- **Utility Scripts**: New scripts for running the pipeline
  - `scripts/run-full-pipeline.ts` - Run complete vault → embeddings → clusters → concepts pipeline
  - `scripts/run-clustering.ts` - Run embedding-based clustering
  - `scripts/test-evolution.ts` - Test evolution detection
  - `scripts/test-embedding-provider.ts` - Test embedding providers

- **Shared Script Helpers** (`scripts/lib/vault-helpers.ts`): Common utilities for scripts
  - `findMarkdownFiles()` - Find all markdown files in a directory
  - `parseFrontmatter()` - Parse YAML frontmatter
  - `extractTags()` - Extract tags from content
  - `extractLinks()` - Extract wiki-style links
  - `buildResolvedLinks()` - Build resolved links map
  - `isStubNote()` - Check if note is a stub
  - `readVault()` - Read and parse all notes in a vault

### Changed

- LLM pipeline now runs in a single stage instead of two separate stages
- Misfit detection is now part of the concept naming response

### Fixed

- Evolution detection now uses deterministic tiebreaker logic when multiple clusters have equal Jaccard similarity scores
