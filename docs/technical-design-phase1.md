---
created: 2025-12-25
updated: 2025-12-27
---

# Recall Plugin - Phase 1 Technical Design Document

## The Core Problem

**How do we generate relevant quiz questions from a vault of 100,000+ notes without:**

1. Calling the LLM on every note (too expensive, too slow)
2. Creating inconsistent/duplicate concepts
3. Missing important notes when a concept spans 1000+ files
4. Rebuilding everything when a single note changes

This document is organized into three focused sections:

1. **Concept Discovery** — How we cluster notes into quizzable topics
2. **Question Generation** — How we select notes and generate questions
3. **Quiz History** — How we store answers and use them to improve selection

---

## Part 1: Concept Discovery

### Overview

We use a BERTopic-style pipeline to discover concepts from notes:

```
100,000 notes
     ↓  (Embed via OpenAI/Voyage API)
100,000 embeddings (1536-dim vectors)
     ↓  (UMAP dimensionality reduction)
100,000 reduced embeddings (10-dim)
     ↓  (HDBSCAN clustering)
~200-500 clusters
     ↓  (LLM: Name and score clusters)
~50-100 named concepts
```

### 1.1 Metadata Extraction

Obsidian's `app.metadataCache` already parses and indexes all notes. We leverage this instead of building our own metadata layer:

```typescript
const cache = app.metadataCache.getFileCache(file);

// Available from metadataCache:
cache.tags;        // [{tag: '#react', position: ...}, ...]
cache.links;       // [{link: 'useState', ...}, ...]
cache.headings;    // [{heading: 'Introduction', level: 1}, ...]
cache.frontmatter; // {created: '2024-12-20', ...}
```

This metadata is used for:
- Candidate name generation (tags, folder paths)
- Filtering non-quizzable notes (daily notes, meetings)
- Preprocessing before embedding

### 1.2 Embedding Pipeline

#### IEmbeddingProvider Port Interface

```typescript
// src/ports/IEmbeddingProvider.ts

export interface IEmbeddingProvider {
  embedBatch(texts: string[]): Promise<BatchEmbeddingResult>;
  embed(text: string): Promise<EmbeddingResult>;
  getDimensions(): number;
  getProviderName(): string;
  getModelName(): string;
  estimateTokens(text: string): number;
}

export interface BatchEmbeddingResult {
  embeddings: EmbeddingResult[];
  totalTokens: number;
  usage: { totalTokens: number; estimatedCost: number; apiCalls: number };
}
```

**Supported Providers:**

| Provider  | Model                  | Dimensions | Cost            |
| --------- | ---------------------- | ---------- | --------------- |
| OpenAI    | text-embedding-3-small | 1536       | $0.02/1M tokens |
| Voyage AI | voyage-3-lite          | 512        | $0.02/1M tokens |

#### Text Preparation

Before embedding, we prepare note content:

```typescript
function prepareText(title: string, content: string, maxTokens: number): string {
  // Strip YAML frontmatter
  let text = content.replace(/^---[\s\S]*?---\n?/, '');

  // Summarize code blocks (keep language, remove body)
  text = text.replace(/```(\w+)?[\s\S]*?```/g, (_, lang) =>
    lang ? `[code: ${lang}]` : '[code]'
  );

  // Strip images, keep alt text
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, (_, alt) =>
    alt ? `[image: ${alt}]` : ''
  );

  // Truncate to token limit (~4 chars per token)
  const maxChars = maxTokens * 4;
  if (text.length > maxChars) {
    text = text.slice(0, maxChars) + '...';
  }

  return `Title: ${title}\n\n${text}`;
}
```

### 1.3 UMAP + HDBSCAN Clustering

#### UMAP Dimensionality Reduction

High-dimensional embeddings (1536-dim) are reduced to 10 dimensions:

```typescript
import { UMAP } from 'umap-js';

const DEFAULT_UMAP_CONFIG = {
  nNeighbors: 15,
  minDist: 0.1,
  nComponents: 10,
  metric: 'cosine',
};
```

**Why UMAP?**
- Speeds up HDBSCAN significantly
- Removes noise while preserving local + global structure
- Enables visualization (if reduced to 2-3 dims)

#### HDBSCAN Clustering

HDBSCAN automatically discovers the optimal number of clusters:

```typescript
import { HDBSCAN } from 'hdbscan-ts';

const DEFAULT_HDBSCAN_CONFIG = {
  minClusterSize: 5,
  minSamples: 3,
};
```

**Why HDBSCAN over K-Means?**
- Doesn't require specifying K upfront
- Handles clusters of varying sizes and densities
- Identifies outliers as noise (label = -1)

**Fallback:** If HDBSCAN fails in browser, use K-Means with silhouette scoring.

### 1.4 LLM Concept Naming

After clustering, we use an LLM to name and score clusters:

**Input to LLM** (batched, 20 clusters per call):
```
For each cluster:
- Candidate names (from tags, folders, representative titles)
- Top 5 representative note titles (closest to centroid)
- Common tags
- Folder path
```

**LLM Output:**
1. Canonical concept name
2. Quizzability score (0-1)
3. Suggested merges with similar clusters
4. Misfit notes that don't belong

### 1.5 Storage

```
.recall/
├── embeddings/
│   ├── index.json              # notePath -> contentHash lookup
│   ├── chunk-00.json           # ~1000 embeddings each
│   ├── chunk-01.json
│   └── ...
├── clusters.json               # Raw cluster assignments (regeneratable)
└── concepts/
    ├── index.json              # Lightweight concept list
    └── tracked/
        └── {concept_id}.json   # Full concept data
```

**Embedding Cache Entry:**

```typescript
interface CachedNoteEmbedding {
  notePath: string;
  contentHash: string;    // For change detection
  embedding: number[];
  provider: string;
  model: string;
  createdAt: number;
  tokenCount: number;
}
```

**Concept File:**

```json
{
  "id": "concept_a1b2c3d4",
  "canonicalName": "React Hooks",
  "quizzabilityScore": 0.85,
  "clusterId": "cluster_xyz",
  "noteIds": ["notes/react/hooks-guide.md", "notes/react/useState.md"],
  "metadata": {
    "createdAt": "2024-12-01",
    "lastUpdated": "2024-12-20"
  },
  "evolutionHistory": []
}
```

**Storage Size Estimates:**

| Vault Size | OpenAI (1536-dim) | Voyage (512-dim) |
| ---------- | ----------------- | ---------------- |
| 10k notes  | ~64 MB            | ~23 MB           |
| 100k notes | ~640 MB           | ~230 MB          |

### 1.6 When the Vault Changes

#### Change Detection

```typescript
function generateContentHash(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  const sample = normalized.length <= 1500
    ? normalized
    : normalized.slice(0, 1000) + normalized.slice(-500);
  return hashString(sample + ':' + normalized.length);
}
```

#### Incremental Updates

For small changes (<5% of vault):
1. Embed only new/modified notes
2. Project using existing UMAP transform
3. Assign to nearest cluster centroid
4. Remove deleted notes from clusters

For large changes (≥5%): Full re-cluster.

```typescript
async function incrementalUpdate(
  changes: { added: string[]; modified: string[]; deleted: string[] },
  existingClusters: Cluster[],
  embeddingProvider: IEmbeddingProvider
): Promise<Cluster[]> {
  // 1. Embed new/modified notes
  const newEmbeddings = await embeddingProvider.embedBatch(
    await prepareTexts(changes.added.concat(changes.modified))
  );

  // 2. Calculate cluster centroids
  const centroids = calculateCentroids(existingClusters);

  // 3. Assign to nearest centroid
  for (const embedding of newEmbeddings) {
    const nearest = findNearestCentroid(embedding, centroids, 0.5);
    if (nearest) {
      nearest.noteIds.push(embedding.notePath);
    }
  }

  // 4. Remove deleted notes
  for (const cluster of existingClusters) {
    cluster.noteIds = cluster.noteIds.filter(id => !changes.deleted.includes(id));
  }

  return existingClusters.filter(c => c.noteIds.length > 0);
}
```

#### Obsidian Event Integration

```typescript
this.registerEvent(
  this.app.vault.on('modify', (file) => this.onNoteModified(file))
);
this.registerEvent(
  this.app.metadataCache.on('changed', (file) => this.onMetadataChanged(file))
);
```

**Triggers:**

| Event        | Action                                    |
| ------------ | ----------------------------------------- |
| Note created | Embed, assign to nearest cluster          |
| Note modified| Re-embed if content hash changed          |
| Note deleted | Remove from cluster, delete cached embedding |
| Note renamed | Update path in cluster noteIds            |
| Re-cluster   | Auto-evolve tracked concepts (see 1.7)    |

### 1.7 Concept Evolution

When re-clustering produces different clusters, tracked concepts auto-evolve to maintain continuity.

#### Cluster Evolution Detection

After each re-clustering, compare old clusters to new using Jaccard similarity:

```typescript
interface ClusterEvolution {
  oldClusterId: string;
  newClusterId: string | null;
  overlapScore: number;  // Jaccard similarity
  type: 'rename' | 'remap' | 'dissolved';
}

function detectEvolution(oldClusters: Cluster[], newClusters: Cluster[]): ClusterEvolution[] {
  return oldClusters.map(old => {
    const matches = newClusters
      .map(n => ({ cluster: n, overlap: jaccard(old.noteIds, n.noteIds) }))
      .filter(m => m.overlap > 0.2)
      .sort((a, b) => b.overlap - a.overlap);

    if (matches.length === 0) {
      return { oldClusterId: old.id, newClusterId: null, overlapScore: 0, type: 'dissolved' };
    }
    const best = matches[0];
    return {
      oldClusterId: old.id,
      newClusterId: best.cluster.id,
      overlapScore: best.overlap,
      type: best.overlap > 0.6 ? 'rename' : 'remap'
    };
  });
}

function jaccard(setA: string[], setB: string[]): number {
  const a = new Set(setA);
  const b = new Set(setB);
  const intersection = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}
```

#### Auto-Evolution Rules

| Overlap | Action |
|---------|--------|
| >60% | Update `clusterId`, keep original concept name |
| 20-60% | Remap to best match, adopt new cluster's name |
| <20% | Dissolve concept (quiz history preserved on notes) |

```typescript
async function autoEvolveConcept(
  concept: TrackedConcept,
  newClusters: Cluster[]
): Promise<void> {
  const matches = newClusters
    .map(cluster => ({ cluster, overlap: jaccard(concept.noteIds, cluster.noteIds) }))
    .filter(m => m.overlap > 0.2)
    .sort((a, b) => b.overlap - a.overlap);

  if (matches.length > 0) {
    const best = matches[0];
    const oldClusterId = concept.clusterId;

    concept.clusterId = best.cluster.id;
    concept.noteIds = best.cluster.noteIds;

    concept.evolutionHistory.push({
      ts: Date.now(),
      fromCluster: oldClusterId,
      toCluster: best.cluster.id,
      type: best.overlap > 0.6 ? 'rename' : 'remap',
      overlapScore: best.overlap
    });

    // Update name if significantly different
    if (best.overlap < 0.6) {
      concept.canonicalName = best.cluster.name;
    }
  } else {
    // No match found — dissolve concept
    await deleteTrackedConcept(concept.id);
  }
}
```

#### Why This Works

Quiz history is **note-based**, not concept-based:
- `computeNoteHistory(events, noteId)` works regardless of which concept contains the note
- Spaced rep scores follow the notes, not the concepts
- When a concept is dissolved, the note-level history remains intact

#### Evolution History

Each concept tracks its evolution for debugging:

```json
{
  "id": "concept_abc",
  "canonicalName": "React State Management",
  "clusterId": "cluster_new",
  "evolutionHistory": [
    {
      "ts": 1703500000000,
      "fromCluster": "cluster_old",
      "toCluster": "cluster_new",
      "type": "remap",
      "overlapScore": 0.45
    }
  ]
}
```

### 1.8 Cost & Performance

**Embedding Cost (100k notes, ~62.5M tokens):**
- OpenAI Batch API: **$0.63**
- Voyage AI: **$1.25** (or free with 200M token tier)

**Runtime:**

| Stage        | Cold Start | Cached     |
| ------------ | ---------- | ---------- |
| Embedding    | 5-10 min   | 0s         |
| UMAP         | 30-60s     | 30-60s     |
| HDBSCAN      | 20-40s     | 20-40s     |
| **Total**    | **6-12 min** | **1-2 min** |

---

## Part 2: Question Generation

### Overview

```
Concept with 1,000 notes
     ↓  (Score each note using history)
1,000 scored notes
     ↓  (Stratified sampling)
15 selected notes
     ↓  (Check question cache)
10 cached + 5 need generation
     ↓  (Batch LLM call)
30-45 candidate questions
     ↓  (Select by format + difficulty)
10 final questions
```

### 2.1 Note Selection

Not all notes are equal. We score each note based on multiple factors:

```
score = (0.35 × spacedRepScore) +
        (0.20 × richnessScore) +
        (0.15 × recencyScore) +
        (0.15 × varietyScore) +
        (0.15 × struggleScore)
```

#### Pre-Filter

```typescript
function isQuizzable(note: Note, history: QuizHistory): boolean {
  if (note.wordCount < 100) return false;
  if (note.tags.includes('#daily') || note.tags.includes('#meeting')) return false;

  const h = history.getForNote(note.path);
  if (h.correctStreak > 5 && h.daysSinceQuiz < 14) return false; // Mastered
  if (h.daysSinceQuiz < 1) return false; // Too recent

  return true;
}
```

#### Scoring Factors

**Spaced Repetition Score (35%)** — Based on SM-2 intervals:

```typescript
function spacedRepScore(note: Note, history: QuizHistory): number {
  const h = history.getForNote(note.path);
  if (!h.lastQuizzed) return 1.0; // Never quizzed = highest priority

  const intervals = [1, 3, 7, 14, 30, 60, 120]; // days
  const targetInterval = intervals[Math.min(h.correctStreak, 6)];
  const daysSinceDue = h.daysSinceQuiz - targetInterval;

  if (daysSinceDue > 30) return 0.95;  // Very overdue
  if (daysSinceDue > 7) return 0.85;   // Moderately overdue
  if (daysSinceDue > 0) return 0.70;   // Slightly overdue
  if (daysSinceDue > -3) return 0.50;  // Coming due soon
  return 0.20;                          // Not due yet
}
```

**Richness Score (20%)** — Notes with more structure are more quizzable:

```typescript
function richnessScore(note: Note): number {
  const headingCount = note.headings.length;
  const hasBulletLists = (note.content.match(/^[-*]/gm) || []).length;
  return Math.min(1, headingCount * 0.1 + hasBulletLists * 0.05);
}
```

**Recency Score (15%)** — Recently modified notes are more relevant:

```typescript
function recencyScore(note: Note): number {
  const daysSince = (Date.now() - note.modifiedAt) / (1000 * 60 * 60 * 24);
  if (daysSince < 7) return 1.0;
  if (daysSince < 30) return 0.7;
  if (daysSince < 90) return 0.5;
  return 0.1;
}
```

**Variety Score (15%)** — Avoid over-quizzing the same notes:

```typescript
function varietyScore(note: Note, history: QuizHistory): number {
  const h = history.getForNote(note.path);
  if (!h.quizCount) return 1.0;

  const quizzesLast30Days = h.recentQuizDates.filter(
    d => Date.now() - d < 30 * 24 * 60 * 60 * 1000
  ).length;

  if (quizzesLast30Days === 0) return 0.9;
  if (quizzesLast30Days === 1) return 0.7;
  if (quizzesLast30Days >= 3) return 0.2;
  return 0.5;
}
```

**Struggle Score (15%)** — Prioritize notes the user struggles with:

```typescript
function struggleScore(note: Note, history: QuizHistory): number {
  const h = history.getForNote(note.path);
  if (!h.quizCount) return 0.5;

  const accuracy = h.correctCount / h.quizCount;
  if (accuracy < 0.3) return 1.0;  // Struggling
  if (accuracy < 0.5) return 0.8;
  if (accuracy < 0.7) return 0.5;
  return 0.1;                       // Mastered
}
```

#### Cold Start Handling

For never-quizzed notes, use content-based signals:

```typescript
function calculateColdStartScore(note: Note): number {
  const structureScore = Math.min(1, (note.headings?.length || 0) * 0.15);
  const linkPopularity = getIncomingLinkCount(note.path) / 10;
  const recency = recencyScore(note);
  const jitter = Math.random() * 0.2;

  return 0.25 * structureScore + 0.25 * linkPopularity + 0.3 * recency + 0.2 * jitter;
}
```

#### Stratified Sampling

Don't just take top 15 by score — ensure diversity:

```typescript
function selectNotes(concept: Concept, targetCount: number = 15): Note[] {
  const scored = concept.notes.filter(isQuizzable).map(n => ({
    note: n,
    score: calculateScore(n)
  })).sort((a, b) => b.score - a.score);

  const selected: Note[] = [];

  // 40% from top 20% (high priority)
  selected.push(...weightedSample(scored.slice(0, scored.length * 0.2), targetCount * 0.4));

  // 35% from middle 40% (medium priority)
  selected.push(...weightedSample(scored.slice(scored.length * 0.2, scored.length * 0.6), targetCount * 0.35));

  // 25% from never-quizzed (fresh notes)
  const fresh = scored.filter(n => !history.hasQuizzed(n.note.path));
  selected.push(...weightedSample(fresh, targetCount * 0.25));

  return [...new Set(selected)].slice(0, targetCount);
}
```

### 2.2 Question Generation

#### Batched LLM Generation

```
Prompt:
"Generate quiz questions for these 5 notes from the user's vault.
Each note should yield 2-3 questions across different formats.

<note_1>
Title: useState Basics
Content: [first 1500 chars]
</note_1>

Requirements:
- Vary formats: multiple choice, true/false, fill-blank, free-form
- Test understanding, not trivia
- Include difficulty ratings (easy/medium/hard)
- Map each question to source note

Return JSON array of questions..."
```

**Why batch?**
- 5 notes × 3 questions = 15 questions in ONE LLM call
- LLM sees context across notes, avoids duplicate questions

#### Question Selection

Ensure format and difficulty variety:

```typescript
function selectQuestions(candidates: Question[], targetCount: number = 10): Question[] {
  const targetDistribution = {
    multiple_choice: 4,
    true_false: 2,
    fill_blank: 2,
    free_form: 2
  };

  const selected: Question[] = [];
  for (const [format, count] of Object.entries(targetDistribution)) {
    const bucket = candidates.filter(q => q.format === format)
      .sort((a, b) => b.qualityScore - a.qualityScore);
    selected.push(...bucket.slice(0, count));
  }

  return selected;
}
```

#### Error Handling

```typescript
class ResilientLLMClient {
  private retryDelays = [1000, 2000, 4000];

  async generateQuestions(notes: Note[]): Promise<Question[]> {
    for (let attempt = 0; attempt <= this.retryDelays.length; attempt++) {
      try {
        return await this.callLLM(notes);
      } catch (error) {
        if (this.isRetryable(error) && attempt < this.retryDelays.length) {
          await this.delay(this.retryDelays[attempt]);
          continue;
        }
        throw error;
      }
    }
  }
}

// Fallback to cached questions when LLM fails
async function getQuestionsWithFallback(notes: Note[]): Promise<Question[]> {
  try {
    return await llmClient.generateQuestions(notes);
  } catch {
    const cached = await loadCachedQuestions(notes);
    if (cached.length >= 5) return cached;
    new Notice('Could not generate questions. Using cached content.');
    return cached;
  }
}
```

### 2.3 Storage

```
.recall/
└── cache/
    └── questions/
        └── {note_path_hash}.json
```

**Question Cache Entry:**

```json
{
  "version": 1,
  "notePath": "notes/react/hooks-guide.md",
  "contentHash": "abc123",
  "generatedAt": "2024-12-15T10:00:00Z",
  "questions": [
    {
      "id": "q_001",
      "format": "multiple_choice",
      "question": "What does useState return?",
      "options": ["A tuple", "An object", "A function", "A string"],
      "correctAnswer": 0,
      "difficulty": "easy"
    }
  ]
}
```

### 2.4 When the Vault Changes

**Cache Invalidation Rules:**

| Event              | Action                              |
| ------------------ | ----------------------------------- |
| Note content changed | Invalidate if contentHash differs |
| Note deleted       | Delete question cache file          |
| Question flagged   | Regenerate for that note            |
| Cache age > 7 days | Regenerate for variety              |

```typescript
async function onNoteModified(file: TFile) {
  const content = await vault.read(file);
  const newHash = generateContentHash(content);
  const cached = await loadQuestionCache(file.path);

  if (cached && cached.contentHash !== newHash) {
    await invalidateQuestionCache(file.path);
  }
}
```

---

## Part 3: Quiz History

### Overview

Quiz history serves two purposes:
1. **Spaced repetition** — Prioritize notes due for review
2. **Struggle detection** — Focus on notes the user finds difficult

### 3.1 Event-Sourced Storage

**Why event sourcing?** Traditional state-based history causes sync conflicts when quizzing on multiple devices. Event sourcing stores what happened, computes state on load.

```
.recall/
└── history/
    ├── 2024-11.json
    ├── 2024-12.json
    └── 2025-01.json
```

**Event Types:**

```json
{
  "version": 1,
  "events": [
    {
      "id": "evt_a1b2c3",
      "ts": 1703500000000,
      "type": "answer",
      "noteId": "notes/react/hooks-guide.md",
      "conceptId": "concept_react_hooks",
      "questionId": "q_001",
      "correct": true
    },
    {
      "id": "evt_d4e5f6",
      "ts": 1703500100000,
      "type": "skip",
      "noteId": "notes/react/hooks-guide.md",
      "questionId": "q_002"
    },
    {
      "id": "evt_g7h8i9",
      "ts": 1703500200000,
      "type": "flag",
      "questionId": "q_003",
      "reason": "incorrect_answer"
    }
  ]
}
```

### 3.2 Computing State from Events

```typescript
interface ComputedNoteHistory {
  firstQuizzed: number;
  lastQuizzed: number;
  quizCount: number;
  correctCount: number;
  correctStreak: number;
  recentQuizDates: number[];
}

function computeNoteHistory(events: QuizEvent[], noteId: string): ComputedNoteHistory {
  const noteEvents = events
    .filter(e => e.noteId === noteId && e.type === 'answer')
    .sort((a, b) => a.ts - b.ts);

  if (noteEvents.length === 0) return null;

  let correctStreak = 0;
  let correctCount = 0;

  for (const event of noteEvents) {
    if (event.correct) {
      correctStreak++;
      correctCount++;
    } else {
      correctStreak = 0; // Reset on wrong answer
    }
  }

  return {
    firstQuizzed: noteEvents[0].ts,
    lastQuizzed: noteEvents[noteEvents.length - 1].ts,
    quizCount: noteEvents.length,
    correctCount,
    correctStreak,
    recentQuizDates: noteEvents.slice(-10).map(e => e.ts),
  };
}
```

### 3.3 How History Influences Question Generation

History directly affects the scoring factors in Part 2:

| Factor           | History Data Used                     | Effect                              |
| ---------------- | ------------------------------------- | ----------------------------------- |
| Spaced Rep (35%) | `correctStreak`, `lastQuizzed`        | Overdue notes get higher scores     |
| Variety (15%)    | `recentQuizDates`                     | Frequently quizzed notes get lower scores |
| Struggle (15%)   | `correctCount / quizCount`            | Low-accuracy notes get higher scores |

**Spaced Repetition Intervals:**

```
Quiz 1: Correct → Next review in 1 day
Quiz 2: Correct → Next review in 3 days
Quiz 3: Wrong → Reset to 1 day
Quiz 4: Correct → Next review in 1 day
Quiz 5: Correct → Next review in 3 days
Quiz 6: Correct → Next review in 7 days
...
```

### 3.4 Sync Conflict Resolution

Events have unique IDs and timestamps, enabling conflict-free merging:

```typescript
function mergeHistoryFiles(local: HistoryFile, remote: HistoryFile): HistoryFile {
  const allEvents = [...local.events, ...remote.events];
  const uniqueEvents = dedupeById(allEvents);
  const sorted = uniqueEvents.sort((a, b) => a.ts - b.ts);
  return { version: 1, events: sorted };
}

function dedupeById(events: QuizEvent[]): QuizEvent[] {
  const seen = new Set<string>();
  return events.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}
```

**Benefits:**
- Events have unique IDs → duplicates detected
- Events have timestamps → can merge and sort
- No "which value is correct" conflicts
- Append-only within a month → minimal conflict scope

### 3.5 When the Vault Changes

| Event        | Action                                         |
| ------------ | ---------------------------------------------- |
| Note deleted | History remains (for analytics); optionally clean up after 30 days |
| Note renamed | Update `noteId` in future events (history is immutable) |
| Concept merged | Map old conceptId → new conceptId when querying |

**Orphan Cleanup (optional maintenance job):**

```typescript
async function cleanupOrphanHistory() {
  const existingNotes = new Set(vault.getMarkdownFiles().map(f => f.path));
  const events = await loadAllHistory();

  const orphanNoteIds = new Set<string>();
  for (const event of events) {
    if (event.noteId && !existingNotes.has(event.noteId)) {
      orphanNoteIds.add(event.noteId);
    }
  }

  // Log orphans but don't delete — history is valuable for analytics
  console.log(`Found ${orphanNoteIds.size} orphan notes in history`);
}
```

### 3.6 Edge Cases

| Case                       | Handling                                        |
| -------------------------- | ----------------------------------------------- |
| Concept has < 15 notes     | Use all quizzable notes                         |
| All notes recently quizzed | Lower freshness threshold, allow re-quiz        |
| User skips many questions  | Track skips, reduce penalty for skipped notes   |
| User always gets it right  | Extend intervals, suggest concept as "mastered" |

---

## Summary

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER VAULT                              │
│                       100,000 notes                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │  EMBEDDING LAYER  │  ← IEmbeddingProvider
                    │  OpenAI/Voyage AI │     Cached in .recall/embeddings/
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │  UMAP + HDBSCAN   │  ← Semantic clustering
                    │  1536 → 10 dims   │     Auto-discovers K
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │  LLM NAMING       │  ← Claude API
                    │  ~200 clusters    │     Batched, 20 per call
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │  CONCEPTS         │  ← .recall/concepts/
                    │  ~50-100 named    │     User selects which to track
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │  NOTE SELECTION   │  ← Uses quiz history
                    │  Spaced rep + variety │  Stratified sampling
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │  QUESTION GEN     │  ← .recall/cache/questions/
                    │  Batched LLM      │     Cached per note
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │  QUIZ SESSION     │
                    │  10 questions     │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │  HISTORY          │  ← .recall/history/
                    │  Event-sourced    │     Monthly partitions
                    └───────────────────┘
```

### Storage Layout

```
.recall/
├── config.json                    # User settings
├── embeddings/
│   ├── index.json                 # notePath -> contentHash
│   └── chunk-*.json               # Embedding vectors
├── clusters.json                  # Raw clusters (regeneratable)
├── concepts/
│   ├── index.json                 # Lightweight concept list
│   └── tracked/{id}.json          # Full concept data
├── cache/
│   └── questions/{hash}.json      # Question cache per note
└── history/
    └── {year}-{month}.json        # Event-sourced quiz history
```

### Key Design Decisions

| Decision          | Choice                  | Rationale                              |
| ----------------- | ----------------------- | -------------------------------------- |
| Clustering        | HDBSCAN on embeddings   | Auto-discovers K, handles noise        |
| Embedding provider| Abstracted via port     | User choice: OpenAI vs Voyage AI       |
| Dim reduction     | UMAP (10 dims)          | Preserves structure, speeds up HDBSCAN |
| Concept evolution | Auto-evolve via Jaccard | Preserves history across vault refactors |
| Question cache    | Per-note, content-hashed| Invalidate only changed notes          |
| Quiz history      | Event-sourced           | Sync-friendly, conflict-free merging   |
| Note scoring      | 5-factor weighted       | Balances learning effectiveness + variety |
