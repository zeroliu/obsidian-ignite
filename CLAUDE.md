# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin that provides AI-powered spaced repetition for note recall. It uses the Anthropic Claude API to intelligently cluster and surface notes for review.

## Commands

```bash
npm run dev          # Start esbuild in watch mode for development
npm run build        # Production build (outputs main.js)
npm run test         # Run all tests
npm run test:watch   # Run tests in watch mode
vitest run src/path/to/file.test.ts  # Run a single test file
npm run lint         # Lint source files with Biome
npm run format       # Format source files with Biome
npm run check        # Run Biome check (lint + format)
npm run typecheck    # TypeScript type checking
```

## Architecture

### Ports and Adapters Pattern

The codebase uses a hexagonal architecture to decouple domain logic from Obsidian's APIs:

- **Ports** (`src/ports/`): Interfaces defining contracts for external dependencies

  - `IVaultProvider`: File operations (list, read, exists)
  - `IMetadataProvider`: Note metadata (tags, links, headings, frontmatter)
  - `IStorageAdapter`: Persistent storage

- **Adapters** (`src/adapters/`): Implementations of port interfaces

  - `mock/`: In-memory implementations for testing

- **Domain** (`src/domain/`): Pure business logic with no Obsidian dependencies

### Embedding-Based Clustering Pipeline

The `src/domain/clustering/` module clusters notes using semantic embeddings:

1. **Embedding Generation** - Notes are embedded using OpenAI or Voyage embedding APIs
2. **UMAP Dimensionality Reduction** - High-dimensional embeddings are reduced to ~10 dimensions
3. **HDBSCAN Clustering** - Density-based clustering identifies semantic groups
4. **Incremental Updates** - New notes are assigned to existing clusters via cosine similarity

Run the full pipeline via `ClusteringV2Pipeline` from `src/domain/clustering/pipeline.ts`.

### LLM Pipeline

The `src/domain/llm/` module refines clusters into quizzable concepts:

1. **Naming** - LLM assigns descriptive names to clusters
2. **Refinement** - Clusters are merged/split based on semantic similarity
3. **Quizzability Scoring** - Concepts are scored for spaced repetition suitability

### Testing

- Tests use Vitest with jsdom environment
- Obsidian API is mocked via `src/test/mocks/obsidian.ts` (aliased in vitest.config.ts)
- Path alias `@/` maps to `src/`
- Test files are colocated with source: `__tests__/*.test.ts`

### Code Style

- Biome for linting/formatting (tabs, single quotes, semicolons)
- Strict TypeScript with strict null checks
- `noNonNullAssertion` is a warning (allowed but discouraged)
- Never use `any` to get rid of type errors. Figure out the right type always.
