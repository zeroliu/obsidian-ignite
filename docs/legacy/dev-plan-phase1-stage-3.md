---
created: 2025-12-26
updated: 2025-12-26
---

# Implementation Plan: Stage 3 & 3.5 - LLM Concept Naming and Refinement

## Overview

Implement LLM-powered concept naming (Stage 3) and cluster refinement (Stage 3.5) for the Obsidian AI Recall plugin. The design follows existing hexagonal architecture patterns with ports and adapters, ensuring full testability without actual LLM API calls.

---

## Goal

Transform clusters from the local clustering pipeline into named concepts with:
- Canonical concept names assigned by LLM
- Quizzability scores (0-1)
- Non-quizzable cluster identification
- Synonym/alias detection and merging
- Misfit note identification

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 CLUSTERING PIPELINE OUTPUT                  │
│                    Cluster[] + FileMap                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│               STAGE 3: LLM CONCEPT NAMING                   │
│  ┌────────────────────┐  ┌─────────────────────────────┐   │
│  │ prepareCluster     │  │ processConceptNaming        │   │
│  │ Summaries          │→→│ (handle LLM response)       │   │
│  └────────────────────┘  └─────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│              STAGE 3.5: CLUSTER REFINEMENT                  │
│  ┌────────────────────┐  ┌─────────────────────────────┐   │
│  │ applySynonymMerges │  │ handleMisfitNotes           │   │
│  └────────────────────┘  └─────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    Concept[] OUTPUT                          │
│         (Named, scored, merged, refined concepts)            │
└──────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/
├── ports/
│   ├── ILLMProvider.ts          # NEW: LLM port interface
│   └── index.ts                  # UPDATE: export ILLMProvider
├── domain/
│   └── llm/                      # NEW: LLM domain module
│       ├── types.ts              # LLM request/response types, Concept type
│       ├── prompts.ts            # LLM prompt templates for concept naming
│       ├── prepareClusterSummaries.ts
│       ├── processConceptNaming.ts
│       ├── applyClusterRefinements.ts
│       ├── pipeline.ts           # Orchestrates Stage 3 + 3.5
│       ├── index.ts              # Re-exports
│       └── __tests__/
│           ├── prepareClusterSummaries.test.ts
│           ├── processConceptNaming.test.ts
│           ├── applyClusterRefinements.test.ts
│           └── pipeline.test.ts
├── adapters/
│   ├── mock/
│   │   ├── MockLLMAdapter.ts     # NEW: Deterministic mock LLM
│   │   ├── index.ts              # UPDATE: export MockLLMAdapter
│   │   └── __tests__/
│   │       └── MockLLMAdapter.test.ts
│   └── anthropic/                # NEW: Real Claude API adapter
│       ├── AnthropicLLMAdapter.ts
│       ├── index.ts
│       └── __tests__/
│           └── AnthropicLLMAdapter.test.ts
└── test/
    └── fixtures/
        └── llm-fixtures.ts       # NEW: LLM test fixtures
```

---

## Key Types

### Core Types (`src/domain/llm/types.ts`)

```typescript
// Input to LLM - minimal cluster info to save tokens
interface ClusterSummary {
  clusterId: string;
  candidateNames: string[];
  representativeTitles: string[]; // Top 5 note titles
  commonTags: string[];
  folderPath: string;
  noteCount: number;
}

// LLM response for concept naming
interface ConceptNamingResult {
  clusterId: string;
  canonicalName: string;
  quizzabilityScore: number; // 0-1
  isQuizzable: boolean;
  nonQuizzableReason?: string;
  suggestedMerges: string[]; // clusterIds to merge
}

// Named concept (output)
interface Concept {
  id: string;
  name: string;
  noteIds: string[];
  quizzabilityScore: number;
  isQuizzable: boolean;
  originalClusterIds: string[];
  createdAt: number;
}

// Stage 3.5: Synonym detection
interface SynonymPattern {
  primaryConceptId: string;
  aliasConceptIds: string[];
  confidence: number;
  reason: string;
}

// Stage 3.5: Misfit note
interface MisfitNote {
  noteId: string;
  noteTitle: string;
  currentConceptId: string;
  suggestedTags: string[]; // For re-clustering, not target concept
  confidence: number;
  reason: string;
}
```

### Port Interface (`src/ports/ILLMProvider.ts`)

```typescript
interface ILLMProvider {
  nameConceptsBatch(request: ConceptNamingRequest): Promise<ConceptNamingResponse>;
  refineClustersBatch(request: ClusterRefinementRequest): Promise<ClusterRefinementResponse>;
  getConfig(): LLMConfig;
  updateConfig(config: Partial<LLMConfig>): void;
}
```

---

## Implementation Steps

### Step 1: Types and Port Interface (~30 min)
1. Create `src/domain/llm/types.ts` with all type definitions
2. Create `src/ports/ILLMProvider.ts` with interface
3. Update `src/ports/index.ts` to export new interface
4. Run `npm run typecheck`

### Step 2: MockLLMAdapter (~45 min)
1. Create `src/adapters/mock/MockLLMAdapter.ts`
   - Pattern-based deterministic responses
   - Default rules for React, Golf, meetings, daily journals
   - Synonym rules (FW→Firework, JS→JavaScript)
   - Test helpers: `_getCallHistory()`, `_setFixture()`, `_addNamingRule()`
2. Create `src/adapters/mock/__tests__/MockLLMAdapter.test.ts`
3. Update `src/adapters/mock/index.ts`
4. Run `npm test`

### Step 3: prepareClusterSummaries (~30 min)
1. Create `src/domain/llm/prepareClusterSummaries.ts`
   - `prepareClusterSummaries()` - Convert clusters to minimal summaries
   - `selectRepresentativeTitles()` - Pick diverse titles
   - `batchClusterSummaries()` - Group into batches of 20
2. Create tests for edge cases (empty clusters, similar titles)
3. Run `npm test`

### Step 4: processConceptNaming (~40 min)
1. Create `src/domain/llm/processConceptNaming.ts`
   - `processConceptNaming()` - Handle LLM responses
   - `applyMergeSuggestions()` - Merge suggested clusters
   - `createConceptFromResult()` - Convert result to Concept
2. Create tests for single/multiple responses, non-quizzable handling
3. Run `npm test`

### Step 5: applyClusterRefinements (~40 min)
1. Create `src/domain/llm/applyClusterRefinements.ts`
   - `applyClusterRefinements()` - Apply all refinements
   - `applySynonymMerges()` - Merge synonym patterns
   - `handleMisfitNotes()` - Remove misfits, return with tags
2. Create tests for synonym merges, misfit removal
3. Run `npm test`

### Step 6: LLM Pipeline (~45 min)
1. Create `src/domain/llm/pipeline.ts`
   - `runLLMPipeline()` - Orchestrate Stage 3 + 3.5
   - Statistics collection (tokens, batches, counts)
2. Create `src/domain/llm/index.ts` with exports
3. Create integration tests with MockLLMAdapter
4. Run `npm test`

### Step 7: Prompt Templates (~30 min)
1. Create `src/domain/llm/prompts.ts`
   - `buildConceptNamingPrompt()` - System + user prompt for naming
   - `buildClusterRefinementPrompt()` - System + user prompt for refinement
   - `parseNamingResponse()` - Extract JSON from LLM response
   - `parseRefinementResponse()` - Extract JSON from LLM response
2. Create tests for prompt building and response parsing
3. Run `npm test`

### Step 8: Anthropic LLM Adapter (~60 min)
1. Create `src/adapters/anthropic/AnthropicLLMAdapter.ts`
   - Constructor takes API key and config
   - Implements `nameConceptsBatch()` using Claude API
   - Implements `refineClustersBatch()` using Claude API
   - Retry logic with exponential backoff (3 retries)
   - Error handling for rate limits, network errors
   - Token counting from API response
2. Create `src/adapters/anthropic/index.ts`
3. Create `src/adapters/anthropic/__tests__/AnthropicLLMAdapter.test.ts`
   - Mock the `@anthropic-ai/sdk` module
   - Test retry behavior
   - Test error handling
   - Test response parsing
4. Run `npm test`

### Step 9: Test Fixtures (~20 min)
1. Create `src/test/fixtures/llm-fixtures.ts`
   - Reusable cluster fixtures for LLM testing
   - Expected result fixtures for snapshot testing
2. Run `npm test`

### Step 10: Final Verification (~15 min)
1. Run `npm test` - All tests pass
2. Run `npm run lint` - No Biome errors
3. Run `npm run typecheck` - No TypeScript errors

---

## Testing Strategy

### MockLLMAdapter Design

The mock uses **deterministic pattern-based rules** for fully reproducible tests:

```typescript
// Default naming rules
{ pattern: /react/i, canonicalName: 'React Development', quizzabilityScore: 0.9, isQuizzable: true }
{ pattern: /meeting|standup/i, canonicalName: 'Meeting Notes', quizzabilityScore: 0.1, isQuizzable: false }
{ pattern: /daily|journal/i, canonicalName: 'Daily Journal', quizzabilityScore: 0.2, isQuizzable: false }

// Default synonym rules
{ primaryPattern: /firework/i, aliasPatterns: [/\bfw\b/i], confidence: 0.95 }
{ primaryPattern: /javascript/i, aliasPatterns: [/\bjs\b/i], confidence: 0.98 }
```

Test-specific rules can be injected via:
- `_setFixture(fixture)` - Replace all rules
- `_addNamingRule(rule)` - Add single rule
- `_addSynonymRule(rule)` - Add synonym rule

### Test Categories

| Component | Unit Tests | Integration Tests |
|-----------|------------|-------------------|
| MockLLMAdapter | Pattern matching, call history | - |
| AnthropicLLMAdapter | SDK mocking, retry logic, error handling | - |
| prepareClusterSummaries | Title selection, batching | - |
| processConceptNaming | Response handling, merging | - |
| applyClusterRefinements | Synonym merge, misfit removal | - |
| prompts | Prompt building, response parsing | - |
| pipeline | - | Full Stage 3 + 3.5 flow |

### Testing the Anthropic Adapter

Since we cannot make real API calls in tests, we mock the `@anthropic-ai/sdk` module:

```typescript
// In test file
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(mockResponse) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  })),
}));
```

Test cases:
- Successful API response parsing
- Retry on 429 rate limit errors
- Retry on 5xx server errors
- Timeout handling
- Invalid JSON response handling

---

## Critical Files to Modify

| File | Action |
|------|--------|
| `src/ports/index.ts` | Add ILLMProvider export |
| `src/adapters/mock/index.ts` | Add MockLLMAdapter export |
| `package.json` | Already has `@anthropic-ai/sdk` dependency |

## Critical Files to Reference

| File | Purpose |
|------|---------|
| `src/domain/clustering/types.ts` | Existing Cluster type |
| `src/ports/IMetadataProvider.ts` | Port interface pattern |
| `src/adapters/mock/MockMetadataAdapter.ts` | Mock adapter pattern |
| `src/domain/clustering/pipeline.ts` | Pipeline orchestration pattern |

---

## Design Decisions

1. **Batch size: 20 clusters** - Balances token efficiency with response quality
2. **Deterministic mock** - Pattern-based rules enable reliable testing
3. **Misfit notes return tags, not clusters** - Per requirements, allows re-clustering
4. **Separate naming and refinement stages** - Enables independent testing
5. **Separate LLM pipeline** - `runLLMPipeline()` called after `runClusteringPipeline()`, not integrated

---

## Verification Commands

After each step:
```bash
npm test                    # All tests pass
npm run lint               # No Biome errors
npm run typecheck          # No TypeScript errors
```

---

## LLM Prompts

### Stage 3: Concept Naming Prompt

**System Prompt:**
```
You are an expert at organizing and naming knowledge concepts from personal notes.
Your task is to analyze note clusters and assign meaningful concept names.

For each cluster, you will:
1. Assign a canonical concept name (concise, 2-5 words)
2. Score quizzability (0-1) - how suitable for spaced repetition quiz
3. Determine if quizzable (some content types are not suitable)
4. Suggest clusters that should merge (if conceptually the same topic)

Guidelines for naming:
- Use clear, descriptive names (e.g., "React Hooks", "Golf Swing Mechanics")
- Prefer common terminology over jargon
- Avoid overly broad names (e.g., "Programming" is too vague)
- Avoid overly narrow names (e.g., "useState Hook" is too specific for a cluster)

Guidelines for quizzability:
- HIGH (0.7-1.0): Technical concepts, learning notes, how-to guides, reference material
- MEDIUM (0.4-0.7): Project notes, research, mixed content
- LOW (0.1-0.4): Personal reflections, brainstorming
- NOT QUIZZABLE: Meeting notes, daily journals, to-do lists, ephemeral content

Output JSON format only, no additional text.
```

**User Prompt Template:**
```
Analyze these ${clusterCount} note clusters and provide concept naming results.

${clusters.map((c, i) => `
## Cluster ${i + 1}
- ID: ${c.clusterId}
- Candidate names: ${c.candidateNames.join(', ')}
- Sample note titles: ${c.representativeTitles.join(', ')}
- Common tags: ${c.commonTags.join(', ')}
- Folder: ${c.folderPath}
- Note count: ${c.noteCount}
`).join('\n')}

Return JSON array with this structure for each cluster:
[
  {
    "clusterId": "cluster-id",
    "canonicalName": "Concept Name",
    "quizzabilityScore": 0.85,
    "isQuizzable": true,
    "nonQuizzableReason": null,
    "suggestedMerges": []
  }
]

If a cluster should merge with another, include the target cluster ID(s) in suggestedMerges.
If not quizzable, set isQuizzable to false and provide nonQuizzableReason.
```

**Example Input:**
```json
{
  "clusters": [
    {
      "clusterId": "cluster-001",
      "candidateNames": ["React", "Frontend", "Web"],
      "representativeTitles": ["React Hooks Guide", "useState Examples", "Custom Hooks"],
      "commonTags": ["#react", "#frontend"],
      "folderPath": "tech/react",
      "noteCount": 45
    },
    {
      "clusterId": "cluster-002",
      "candidateNames": ["Daily", "Journal"],
      "representativeTitles": ["2024-12-25", "2024-12-24", "2024-12-23"],
      "commonTags": ["#daily"],
      "folderPath": "journal",
      "noteCount": 365
    }
  ]
}
```

**Example Output:**
```json
[
  {
    "clusterId": "cluster-001",
    "canonicalName": "React Hooks",
    "quizzabilityScore": 0.9,
    "isQuizzable": true,
    "nonQuizzableReason": null,
    "suggestedMerges": []
  },
  {
    "clusterId": "cluster-002",
    "canonicalName": "Daily Journal",
    "quizzabilityScore": 0.15,
    "isQuizzable": false,
    "nonQuizzableReason": "Daily journal entries are time-bound personal reflections, not knowledge to recall",
    "suggestedMerges": []
  }
]
```

---

### Stage 3.5: Cluster Refinement Prompt

**System Prompt:**
```
You are an expert at analyzing knowledge organization and detecting inconsistencies.
Your task is to identify two types of issues in named concepts:

1. SYNONYM PATTERNS: Concepts that should be merged because they refer to the same topic
   - Abbreviations: "JS" and "JavaScript", "FW" and "Firework"
   - Alternative names: "React Hooks" and "Hooks in React"
   - Subsets: "useState" should merge into "React Hooks"

2. MISFIT NOTES: Notes that don't belong in their current concept
   - A todo list in a "Programming" concept
   - A recipe in a "Work Projects" concept
   - Suggest tags for re-clustering, NOT a target concept

Be conservative - only flag clear issues with high confidence.
Output JSON format only, no additional text.
```

**User Prompt Template:**
```
Analyze these ${conceptCount} concepts for synonyms and misfits.

${concepts.map((c, i) => `
## Concept ${i + 1}
- ID: ${c.conceptId}
- Name: ${c.name}
- Sample note titles: ${c.sampleTitles.join(', ')}
- Note count: ${c.noteCount}
`).join('\n')}

Return JSON with this structure:
{
  "synonymPatterns": [
    {
      "primaryConceptId": "concept-to-keep",
      "aliasConceptIds": ["concept-to-merge-1", "concept-to-merge-2"],
      "confidence": 0.95,
      "reason": "Explanation of why these are synonyms"
    }
  ],
  "misfitNotes": [
    {
      "noteId": "note-id",
      "noteTitle": "Note Title",
      "currentConceptId": "current-concept-id",
      "suggestedTags": ["#tag1", "#tag2"],
      "confidence": 0.8,
      "reason": "Explanation of why this note doesn't fit"
    }
  ]
}

Guidelines:
- Only include synonyms with confidence >= 0.8
- Only include misfits with confidence >= 0.7
- For misfits, suggest tags that describe where the note SHOULD go, not the target concept
- If no issues found, return empty arrays
```

**Example Input:**
```json
{
  "concepts": [
    {
      "conceptId": "concept-001",
      "name": "JavaScript Development",
      "sampleTitles": ["ES6 Features", "Async/Await Guide", "Array Methods"],
      "noteCount": 30
    },
    {
      "conceptId": "concept-002",
      "name": "JS Tutorials",
      "sampleTitles": ["JS Basics", "JavaScript Functions", "DOM Manipulation"],
      "noteCount": 15
    },
    {
      "conceptId": "concept-003",
      "name": "React Development",
      "sampleTitles": ["React Hooks", "My Grocery List", "Component Patterns"],
      "noteCount": 20
    }
  ]
}
```

**Example Output:**
```json
{
  "synonymPatterns": [
    {
      "primaryConceptId": "concept-001",
      "aliasConceptIds": ["concept-002"],
      "confidence": 0.95,
      "reason": "JS is the standard abbreviation for JavaScript. Both concepts cover JavaScript programming."
    }
  ],
  "misfitNotes": [
    {
      "noteId": "note-grocery-list",
      "noteTitle": "My Grocery List",
      "currentConceptId": "concept-003",
      "suggestedTags": ["#personal", "#shopping", "#lists"],
      "confidence": 0.9,
      "reason": "A grocery list is personal/productivity content, not React development knowledge."
    }
  ]
}
```

---

## Prompt Design Rationale

1. **Structured JSON output**: Easier to parse, reduces LLM hallucination
2. **Clear scoring guidelines**: Reduces ambiguity in quizzability assessment
3. **Examples included**: Helps LLM understand expected format
4. **Conservative flagging**: Only high-confidence refinements to avoid over-correction
5. **Tags not clusters for misfits**: Allows flexible re-clustering without requiring all cluster names in context
6. **Batch-friendly**: Prompts designed for 20 clusters/concepts per call

---

## Reference

- Technical Design: `docs/technical-design-phase1.md` (Stage 3 and Stage 3.5)
- Previous Implementation Plan: `docs/dev-plan-phase1-phase-A-B.md`
