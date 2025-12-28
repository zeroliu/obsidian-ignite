# Self-Improvement Loop for Clustering Optimization

## Overview

This document describes an agent-driven self-improvement loop for achieving **noise ratio 5-20%** in note clustering. The agent has full autonomy to explore creative solutions beyond hyperparameter tuning, including different algorithms, pre/post-processing, and LLM-based approaches.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Self-Improvement Loop                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Subagent 1 │    │   Subagent 2 │    │   Subagent 1 │  ...  │
│  │  (Evaluator) │───▶│(Implementer) │───▶│  (Evaluator) │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                   │                   │                │
│         ▼                   ▼                   ▼                │
│  ┌────────────┐     ┌────────────┐     ┌────────────┐           │
│  │improvement-│     │ config.json │     │improvement-│           │
│  │plan-1.md   │     │ (updated)   │     │plan-2.md   │           │
│  └────────────┘     └────────────┘     └────────────┘           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Subagent Roles

### Subagent 1: Evaluator

**Responsibilities:**

1. Run clustering and save output to iteration folder
2. Execute evaluation script to compute all metrics
3. Analyze results and form hypothesis about why noise is high
4. Propose an experiment to reduce noise ratio
5. Create improvement plan with hypothesis, proposed approach, and expected outcomes

**Commands:**

```bash
# Run clustering with current config and save output to iteration folder
npx tsx scripts/run-clustering.ts \
  --config outputs/improvement-loop/current-config.json \
  --output outputs/improvement-loop/iteration-N/clustering-output.json

# Run evaluation
npx tsx scripts/evaluate-clustering.ts \
  --vault \
  --config outputs/improvement-loop/current-config.json \
  --output outputs/improvement-loop/iteration-N/evaluation.json
```

**Output:**
Create `outputs/improvement-loop/iteration-N/improvement-plan.md` with:

- Hypothesis about why current approach isn't working
- Analysis of what the metrics indicate
- Proposed experiment to test
- Expected outcomes and risks

### Subagent 2: Implementer

**Responsibilities:**

1. Read the improvement plan from Subagent 1
2. Implement the proposed changes (may involve code changes, not just config)
3. Run the experiment
4. Save all results to the iteration folder

**Commands:**

```bash
# Run clustering and save output to iteration folder
npx tsx scripts/run-clustering.ts \
  --config outputs/improvement-loop/current-config.json \
  --output outputs/improvement-loop/iteration-N/clustering-output.json
```

---

## Target Metrics

### Required (Non-negotiable)

| Metric      | Target |
| ----------- | ------ |
| Noise Ratio | 5-20%  |

### Agent-Proposed

After initial exploration, propose appropriate targets for:

- Silhouette score (justify based on data characteristics)
- Tag homogeneity (justify based on tag distribution)

Grid search showed: best silhouette was 0.22, best tag homogeneity was 9%.
These original targets (0.3, 50%) may be unrealistic for this dataset.

---

## Parameter Reference

These are the parameters explored in grid search. The agent is NOT limited to these values:

```typescript
// Grid search explored these values, but you can try others
const GRID_SEARCH_VALUES = {
  umap: {
    nNeighbors: [5, 10, 15, 30, 50],
    minDist: [0.0, 0.05, 0.1, 0.2, 0.5],
    nComponents: [5, 10, 15, 20],
  },
  hdbscan: {
    minClusterSize: [3, 5, 10, 15, 20, 30],
    minSamples: [1, 3, 5, 10],
  },
};

// You can also try completely different approaches:
// - Different clustering algorithms (K-means, DBSCAN, spectral, etc.)
// - Force-assign noise notes to nearest cluster
// - Use LLM to assign difficult notes
// - Two-pass clustering
```

---

## Improvement Plan Template

When creating an improvement plan, use this format:

```markdown
# Improvement Plan - Iteration N

## Current State

- Noise ratio: X% (target: 5-20%)
- Silhouette: X
- Clusters: X
- Approach used: [description]

## Hypothesis

I believe noise is high because [explanation].

Evidence:

- [observation 1]
- [observation 2]

## Proposed Experiment

**Approach**: [describe what you will try]

**Rationale**: [why you think this will reduce noise]

**Implementation**:

- [step 1]
- [step 2]

## Expected Outcomes

- Noise ratio should decrease because [reason]
- Potential side effects: [any trade-offs expected]

## Success Criteria

- Primary: Noise ratio reaches 5-20%
- Secondary: [any other metrics you're tracking]

## Fallback

If this doesn't work, next hypothesis to test: [brief description]
```

---

## Termination Conditions

### Success

```
noiseRatio >= 0.05 AND noiseRatio <= 0.20
```

(Other metrics are agent-proposed and justified)

### Continue Exploring

- As long as you have new hypotheses to test
- As long as you're making progress or learning

### Stop and Report

- When noise ratio target is achieved
- When you've exhausted reasonable approaches and want human input
- When you discover a fundamental limitation that needs discussion

---

## Output Structure

Each iteration must save outputs for manual inspection:

```
outputs/
└── improvement-loop/
    ├── current-config.json         # Active configuration
    ├── experiment-log.md           # Running log of all experiments
    ├── iteration-1/
    │   ├── config.json             # Config/approach used for this iteration
    │   ├── clustering-output.json  # Full clustering results
    │   ├── evaluation.json         # Computed metrics
    │   └── improvement-plan.md     # Hypothesis, action, result, learnings
    ├── iteration-2/
    │   └── ...
```

### Clustering Output Schema

The `clustering-output.json` must include:

```typescript
interface ClusteringOutput {
  config: object; // Whatever config/approach was used
  clusters: Array<{
    id: string;
    noteIds: string[];
    centroid: number[];
    representativeNotes: string[];
    candidateNames: string[];
    dominantTags: string[];
  }>;
  noiseNotes: string[]; // List of all noise note paths
  metadata: {
    totalNotes: number;
    clusteredNotes: number;
    noiseCount: number;
    noiseRatio: number;
    clusterCount: number;
    timestamp: number;
  };
}
```

This enables manual inspection of which notes ended up as noise.

---

## Invoking the Loop

### Manual Invocation with Claude Code

The loop is designed to be driven by Claude Code through conversation. Each iteration involves:

**Step 1: Run Clustering and Evaluate**

```
User: "Run iteration N of the improvement loop"

Claude:
1. Runs clustering with output to iteration folder:
   npx tsx scripts/run-clustering.ts \
     --config outputs/improvement-loop/current-config.json \
     --output outputs/improvement-loop/iteration-N/clustering-output.json

2. Runs evaluation:
   npx tsx scripts/evaluate-clustering.ts \
     --vault \
     --config outputs/improvement-loop/current-config.json \
     --output outputs/improvement-loop/iteration-N/evaluation.json

3. Analyzes results and forms hypothesis about why noise ratio is still high

4. Creates: outputs/improvement-loop/iteration-N/improvement-plan.md
   with hypothesis, proposed experiment, and expected outcomes
```

**Step 2: Implement and Iterate**

```
Claude:
1. Implements the proposed changes (config updates, code changes, new approaches)
2. Runs the next iteration with changes applied
3. Saves all outputs to outputs/improvement-loop/iteration-N/
4. Reports findings and proposes next steps
```

**Loop continues until noise ratio 5-20% is achieved.**

---

## Prompt Templates

### Evaluator Prompt

```
You are a clustering researcher investigating how to reduce noise ratio to 5-20%.

## Context
- Grid search tested 150 hyperparameter combinations
- Best noise ratio achieved: 36.1% (target: 5-20%)
- Hyperparameter tuning alone cannot solve this problem

## Your Task
1. Analyze the current clustering results
2. Form a hypothesis about why noise is still too high
3. Propose an experiment to test your hypothesis
4. Run the experiment and evaluate results

## You Are NOT Limited To
- Hyperparameter tuning
- The current clustering algorithm
- The current pipeline structure

## You CAN
- Modify scripts or create new ones
- Try different algorithms
- Add pre/post-processing steps
- Use LLM for cluster assignment
- Anything else that might work

## Output Requirements
Save all outputs to `outputs/improvement-loop/iteration-N/`:
- `config.json` - Configuration or approach used
- `clustering-output.json` - Full results with clusters and noise notes
- `evaluation.json` - All computed metrics
- `improvement-plan.md` - Your hypothesis, what you tried, results, and next steps
```

### Implementer Prompt

````
You are implementing the experiment proposed in the improvement plan.

## Your Task
1. Read the improvement plan: outputs/improvement-loop/iteration-N/improvement-plan.md
2. Implement whatever changes are proposed (config, code, new scripts, etc.)
3. Run the experiment
4. Save results to the iteration folder

## Output Requirements
Save all outputs to `outputs/improvement-loop/iteration-N/`:
- `config.json` - Configuration or approach used
- `clustering-output.json` - Full results with clusters and noise notes
- `evaluation.json` - All computed metrics

## Example Commands
```bash
# Run clustering with output
npx tsx scripts/run-clustering.ts \
  --config outputs/improvement-loop/current-config.json \
  --output outputs/improvement-loop/iteration-N/clustering-output.json

# Run evaluation
npx tsx scripts/evaluate-clustering.ts \
  --vault \
  --config outputs/improvement-loop/current-config.json \
  --output outputs/improvement-loop/iteration-N/evaluation.json
````

```

---

## Agent Exploration Guidelines

You are an AI researcher tasked with achieving noise ratio 5-20%. You have full autonomy to explore creative solutions.

### 1. Investigate the Problem
- Analyze why noise ratio is high (36% was best in grid search)
- Examine the actual noise notes - what do they have in common?
- Consider: Is HDBSCAN the right algorithm for this data?
- Read and analyze: `outputs/grid-search/grid-search-results.json`

### 2. Form Hypotheses
Before making changes, document your hypothesis:
- "I believe noise is high because..."
- "This approach might help because..."

### 3. Think Beyond Hyperparameters
Consider approaches not in the current pipeline:
- Different clustering algorithms (DBSCAN, K-means, spectral, agglomerative)
- Pre-processing (filter short notes, weight embeddings by note quality)
- Post-processing (force-assign noise to nearest cluster, LLM-based assignment)
- Different embedding models or dimensions
- Ensemble methods (combine multiple clustering runs)
- Hierarchical approaches (cluster in stages)
- Two-pass clustering (coarse then fine)

### 4. Use Available Tools Creatively
- LLM refinement can do more than naming - use it for cluster assignment
- The embedding cache (`outputs/grid-search/embeddings-cache.json`) enables fast iteration
- You can modify existing scripts or create new ones
- You can read the codebase: `src/domain/clustering/`, `src/domain/llm/`

### 5. Document Everything
For each experiment, record:
- Hypothesis: Why you think this will work
- Action: What you changed
- Result: What happened
- Learning: What you learned, even if it failed

---

## Example Loop Execution

### Iteration 1: Baseline
- **Approach**: HDBSCAN with default params (minClusterSize=5, minSamples=3)
- **Results**: Noise=58%, Silhouette=0.21
- **Hypothesis**: Noise is high because HDBSCAN requires dense regions; many notes are isolated

### Iteration 2: Lower Density Threshold
- **Approach**: Reduce minClusterSize=2, minSamples=1
- **Results**: Noise=42%, Silhouette=0.15
- **Learning**: Helped but still too much noise; many tiny clusters created

### Iteration 3: Force-Assign Noise
- **Approach**: After HDBSCAN, assign each noise note to nearest cluster centroid
- **Results**: Noise=0%, Silhouette=0.08
- **Learning**: Noise eliminated but silhouette dropped; some assignments are poor fits

### Iteration 4: Hybrid Approach
- **Approach**: HDBSCAN + force-assign only notes with similarity > 0.3 to nearest cluster
- **Results**: Noise=12%, Silhouette=0.18
- **Status**: SUCCESS - Noise ratio 5-20% achieved

---

## Experiment Tracking

### Document Each Iteration
Save to `outputs/improvement-loop/experiment-log.md`:
- Hypothesis tested
- Approach used
- Results (metrics)
- What was learned

### When to Pivot
- If an approach clearly isn't working after 2-3 variations, try something different
- If you discover a fundamental limitation, document it and discuss with the user

### Best Practices
- Keep the best-performing configuration saved
- Document failed approaches so you don't repeat them
- Consider combining successful elements from different iterations

---

## Grid Search Reference Data

The following grid search results were generated on 2025-12-28 with 660 notes (267 stubs excluded).
Use this data to inform parameter choices without re-running the full grid search.

### Top 10 by Silhouette Score

| Rank | nNeighbors | minDist | minClusterSize | Silhouette | Noise% | Clusters | Tag Homogeneity |
|------|------------|---------|----------------|------------|--------|----------|-----------------|
| 1 | 50 | 0.1 | 5 | 0.2191 | 62.7% | 41 | 8.1% |
| 2 | 30 | 0.2 | 5 | 0.2175 | 60.9% | 37 | 6.6% |
| 3 | 50 | 0.5 | 3 | 0.2149 | 66.2% | 49 | 6.7% |
| 4 | 50 | 0.5 | 10 | 0.2144 | 66.8% | 17 | 6.8% |
| 5 | 10 | 0.5 | 30 | 0.2139 | 72.9% | 5 | 3.9% |
| 6 | 30 | 0.5 | 5 | 0.2128 | 62.4% | 38 | 6.9% |
| 7 | 10 | 0.5 | 5 | 0.2114 | 57.9% | 42 | 9.0% |
| 8 | 50 | 0.5 | 5 | 0.2108 | 64.5% | 38 | 8.1% |
| 9 | 30 | 0.5 | 3 | 0.2106 | 65.0% | 48 | 5.6% |
| 10 | 15 | 0.2 | 5 | 0.2105 | 57.4% | 40 | 6.0% |

### Top 10 by Noise Ratio (closest to 12.5%)

| Rank | nNeighbors | minDist | minClusterSize | Noise% | Silhouette | Clusters | Tag Homogeneity |
|------|------------|---------|----------------|--------|------------|----------|-----------------|
| 1 | 5 | 0.05 | 30 | 36.1% | 0.0583 | 11 | 3.1% |
| 2 | 5 | 0.1 | 20 | 38.0% | 0.0889 | 15 | 3.7% |
| 3 | 5 | 0 | 15 | 38.9% | 0.1006 | 20 | 3.7% |
| 4 | 30 | 0 | 30 | 40.6% | 0.1006 | 11 | 3.6% |
| 5 | 5 | 0 | 10 | 41.1% | 0.1206 | 29 | 4.9% |
| 6 | 5 | 0.05 | 10 | 41.2% | 0.1258 | 29 | 4.9% |
| 7 | 5 | 0.05 | 15 | 43.2% | 0.1002 | 19 | 4.3% |
| 8 | 5 | 0.1 | 10 | 43.5% | 0.1292 | 28 | 4.8% |
| 9 | 15 | 0.05 | 30 | 43.5% | 0.1155 | 8 | 2.9% |
| 10 | 5 | 0.05 | 5 | 43.8% | 0.1579 | 59 | 5.4% |

### Top 10 by Tag Homogeneity

| Rank | nNeighbors | minDist | minClusterSize | Tag Homogeneity | Silhouette | Noise% | Clusters |
|------|------------|---------|----------------|-----------------|------------|--------|----------|
| 1 | 10 | 0.5 | 5 | 9.0% | 0.2114 | 57.9% | 42 |
| 2 | 50 | 0.2 | 3 | 8.5% | 0.1848 | 60.9% | 56 |
| 3 | 30 | 0.1 | 5 | 8.3% | 0.1951 | 54.5% | 44 |
| 4 | 50 | 0.1 | 5 | 8.1% | 0.2191 | 62.7% | 41 |
| 5 | 50 | 0.5 | 5 | 8.1% | 0.2108 | 64.5% | 38 |
| 6 | 50 | 0 | 5 | 8.0% | 0.1896 | 62.1% | 43 |
| 7 | 15 | 0 | 5 | 7.9% | 0.1951 | 52.3% | 48 |
| 8 | 15 | 0.5 | 5 | 7.8% | 0.2023 | 57.1% | 39 |
| 9 | 50 | 0.2 | 5 | 7.7% | 0.2081 | 62.6% | 39 |
| 10 | 10 | 0.5 | 3 | 7.5% | 0.1869 | 65.8% | 52 |

### Key Observations

1. **No hyperparameter configuration achieved noise ratio 5-20%**
   - Best noise ratio: 36.1% (still above target)
   - This confirms that hyperparameter tuning alone cannot solve the problem

2. **Trade-offs observed**:
   - Higher `nNeighbors` (30-50) gives better silhouette but higher noise
   - Lower `minClusterSize` (3-5) creates more clusters but doesn't help noise ratio much
   - Lower noise configs tend to have worse silhouette

3. **Implication for the improvement loop**:
   - Must go beyond hyperparameter tuning
   - Consider post-processing (force-assign noise notes)
   - Consider different algorithms or hybrid approaches
   - The agent should propose appropriate silhouette/homogeneity targets based on what's achievable
```
