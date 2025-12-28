---
created: 2025-12-27
updated: 2025-12-27
---

# Hyperparameter Tuning Framework for BERTopic Pipeline

## Goal

Design an evaluation process to find optimal hyperparameters for:
```
Embeddings (1536-dim) → UMAP (→ 10-dim) → HDBSCAN → Clusters
```

**Focus**: Tuning UMAP and HDBSCAN parameters to maximize clustering quality.

---

## Hyperparameters to Tune

### UMAP Parameters
| Parameter | Default | Search Range | Impact |
|-----------|---------|--------------|--------|
| `nNeighbors` | 15 | [5, 10, 15, 30, 50] | Local vs global structure preservation |
| `minDist` | 0.1 | [0.0, 0.05, 0.1, 0.2, 0.5] | How tightly packed clusters are |
| `nComponents` | 10 | [5, 10, 15, 20, 50] | Dimensionality of reduced space |
| `metric` | cosine | [cosine, euclidean] | Distance measure |

### HDBSCAN Parameters
| Parameter | Default | Search Range | Impact |
|-----------|---------|--------------|--------|
| `minClusterSize` | 5 | [3, 5, 10, 15, 20, 30] | Minimum notes per cluster |
| `minSamples` | 3 | [1, 3, 5, 10] | Core point density requirement |
| `clusterSelectionMethod` | eom | [eom, leaf] | Extraction method |
| `metric` | euclidean | [euclidean, manhattan] | Distance on UMAP output |

**Total Search Space**: 5 × 5 × 5 × 2 × 6 × 4 × 2 × 2 = 12,000 combinations

**Practical Approach**: Use grid search on most impactful parameters, fix others:
- Primary: `nNeighbors`, `minDist`, `minClusterSize` (5 × 5 × 6 = 150 combos)
- Secondary: Tune `nComponents`, `minSamples` after finding good primaries

---

## Evaluation Metrics (Ranked by Importance for Tuning)

### Tier 1: Intrinsic Clustering Metrics (Automated, No Labels Required)

These run automatically after each clustering:

| Metric | What It Measures | Target Range | Implementation |
|--------|------------------|--------------|----------------|
| **Silhouette Score** | How similar notes are to own cluster vs others | 0.3 - 0.7 | `sklearn.metrics.silhouette_score` on UMAP embeddings |
| **Davies-Bouldin Index** | Average similarity between clusters | < 1.5 | Lower is better |
| **Noise Ratio** | % notes in HDBSCAN noise cluster (-1) | 5% - 20% | Too low = over-clustering, too high = too strict |
| **Cluster Size Distribution** | Variance in cluster sizes | Gini < 0.6 | Avoid one mega-cluster + many singletons |

**Key Insight**: Silhouette score is the most actionable - it directly measures "are semantically similar notes grouped together?"

```typescript
// Proposed implementation
interface ClusteringMetrics {
  silhouetteScore: number;      // -1 to 1, higher is better
  daviesBouldinIndex: number;   // 0+, lower is better
  noiseRatio: number;           // 0-1, % of notes as noise
  clusterCount: number;
  avgClusterSize: number;
  clusterSizeGini: number;      // 0-1, inequality measure
}
```

### Tier 2: Semantic Coherence Metrics

Measure whether clusters are semantically meaningful:

| Metric | Formula | Target |
|--------|---------|--------|
| **Intra-cluster Similarity** | avg(cosine_sim(e_i, e_j)) for all pairs in cluster | > 0.7 |
| **Inter-cluster Separation** | avg(dist(centroid_i, centroid_j)) | > 0.5 |
| **Centroid Compactness** | avg(dist(e_i, centroid)) for all notes | < 0.3 |

```typescript
interface SemanticCoherenceMetrics {
  avgIntraClusterSimilarity: number;
  avgInterClusterDistance: number;
  avgCentroidCompactness: number;
}
```

### Tier 3: Domain-Specific Metrics (Leverage Obsidian Metadata)

These use metadata to validate semantic clusters:

| Metric | What It Measures | Rationale |
|--------|------------------|-----------|
| **Tag Homogeneity** | % notes sharing dominant tag | Tags are user-defined topics |
| **Internal Link Density** | % possible links that exist | Linked notes should cluster together |
| **Folder Coherence** | % notes from same folder subtree | Folders often represent topics |
| **Title Keyword Overlap** | TF-IDF similarity of titles | Similar titles = similar content |

**Key Insight**: These serve as **proxy ground truth**. If HDBSCAN clusters differ wildly from tag/folder/link structure, investigate why.

```typescript
interface DomainMetrics {
  tagHomogeneity: number;           // 0-1
  internalLinkDensity: number;      // 0-1 (already implemented)
  folderCoherence: number;          // 0-1
  avgTitleSimilarity: number;       // 0-1
}
```

### Tier 4: LLM Naming Quality

Evaluate the LLM's concept naming:

| Metric | Method |
|--------|--------|
| **Name-Content Alignment** | Embed concept name, compare to cluster centroid |
| **Quizzability Score Distribution** | Should be bimodal (quizzable vs not) |
| **Naming Consistency** | Same cluster → same name across runs |

```typescript
interface NamingMetrics {
  nameEmbeddingSimilarity: number;  // Concept name embedding vs cluster centroid
  quizzabilityDistribution: { high: number; medium: number; low: number };
}
```

### Tier 5: Task-Specific Metrics (Quiz Generation Quality)

The ultimate test - do clusters produce good quizzes?

| Metric | Collection Method |
|--------|-------------------|
| **Question Diversity** | Entropy of question types per concept |
| **Coverage** | % notes that produce ≥1 valid question |
| **User Accuracy** | Quiz answer correctness (implicit difficulty calibration) |
| **Skip Rate** | % questions skipped (too easy/hard/irrelevant) |
| **Flag Rate** | % questions flagged as bad |

### Tier 6: Stability Metrics

Evaluate robustness:

| Metric | Method | Target |
|--------|--------|--------|
| **Noise Sensitivity** | Add Gaussian noise (σ=0.01) to embeddings, re-cluster | Jaccard > 0.8 |
| **Subsample Stability** | Cluster 80% of notes, compare assignments | Jaccard > 0.8 |
| **Temporal Stability** | Compare clusters before/after 100 note additions | Jaccard > 0.7 |

---

## Evaluation Process

### Phase 1: Offline Benchmark

1. **Create Test Vaults**:
   - Small (1k notes): Manually label 100 notes into ground-truth concepts
   - Medium (10k notes): Use synthetic vault with known structure
   - Large (50k+ notes): Real vault from volunteer power user

2. **Run Pipeline with Multiple Configurations**:
   ```
   UMAP nNeighbors: [10, 15, 30]
   UMAP minDist: [0.05, 0.1, 0.2]
   HDBSCAN minClusterSize: [3, 5, 10, 20]
   HDBSCAN minSamples: [1, 3, 5]
   ```

3. **Compute All Metrics** for each configuration

4. **Select Optimal Defaults** based on metric combination

### Phase 2: Ablation Studies

Test each component's contribution:

| Experiment | Change | Measure |
|------------|--------|---------|
| No UMAP | Cluster on raw 1536-dim embeddings | Silhouette, runtime |
| UMAP dims | 5, 10, 20, 50 dimensions | Silhouette vs runtime tradeoff |
| Distance metric | cosine vs euclidean | Silhouette |
| Embedding model | OpenAI vs Voyage | Silhouette, coherence |

### Phase 3: User Studies

1. **Cluster Rating Task**: Show 10 clusters, ask user to rate coherence (1-5)
2. **Misfit Detection**: Show cluster + 5 notes, ask which doesn't belong
3. **Name Appropriateness**: Rate if LLM names match content
4. **Quiz Quality**: Rate generated questions

### Phase 4: Production Monitoring

Log metrics to `.recall/metrics/`:

```typescript
interface PipelineRun {
  timestamp: number;
  config: ClusteringConfig;
  metrics: {
    clustering: ClusteringMetrics;
    semantic: SemanticCoherenceMetrics;
    domain: DomainMetrics;
  };
  duration: { embedding: number; umap: number; hdbscan: number; llm: number };
}
```

---

## Improvement Signals

Use metrics to guide improvements:

| Problem | Signal | Action |
|---------|--------|--------|
| Too many noise points | noiseRatio > 25% | Reduce HDBSCAN minClusterSize |
| One mega-cluster | clusterSizeGini > 0.7 | Increase minClusterSize or add post-split step |
| Poor coherence | silhouetteScore < 0.2 | Tune UMAP nNeighbors, try different embeddings |
| Tag mismatch | tagHomogeneity < 0.3 | Investigate if semantic differs from user's mental model |
| Unstable clusters | noise sensitivity Jaccard < 0.5 | Increase minSamples in HDBSCAN |

---

## Composite Scoring Function

For automated hyperparameter search, combine metrics into a single objective:

```
score = 0.35 × silhouette_normalized
      + 0.20 × (1 - noise_ratio)
      + 0.15 × tag_homogeneity
      + 0.15 × link_density
      + 0.10 × cluster_count_penalty
      + 0.05 × size_distribution_penalty
```

Where:
- `silhouette_normalized` = (silhouette + 1) / 2  (map -1..1 to 0..1)
- `cluster_count_penalty` = 1 if 50-500 clusters, else decreasing penalty
- `size_distribution_penalty` = 1 - gini_coefficient

**Rationale**: Silhouette is primary (35%) because it directly measures semantic coherence. Domain metrics (tag + link = 30%) serve as proxy ground truth. Noise and distribution penalties prevent degenerate solutions.

---

## Tuning Process

### Step 1: Create Test Dataset
- Use a real vault (ideally 5k-20k notes)
- Pre-compute embeddings once (expensive step)
- Cache UMAP projections for each `nNeighbors`/`minDist` combo

### Step 2: Grid Search Phase 1 (Primary Parameters)
```
for nNeighbors in [5, 10, 15, 30, 50]:
  for minDist in [0.0, 0.05, 0.1, 0.2, 0.5]:
    umap_embedding = UMAP(nNeighbors, minDist, nComponents=10)

    for minClusterSize in [3, 5, 10, 15, 20, 30]:
      clusters = HDBSCAN(minClusterSize, minSamples=3)
      score = compute_composite_score(clusters)
      log(params, score, metrics)
```

### Step 3: Analyze Results
- Plot score vs each parameter (sensitivity analysis)
- Identify parameter interactions (heatmaps)
- Find Pareto frontier of silhouette vs cluster count

### Step 4: Fine-Tune Secondary Parameters
Using top 5 primary configs:
- Test `nComponents` in [5, 10, 15, 20]
- Test `minSamples` in [1, 3, 5]
- Test `clusterSelectionMethod` in [eom, leaf]

### Step 5: Validate on Different Vaults
- Test optimal params on 2-3 different vaults
- Check if one config works universally or needs per-vault tuning

---

## Expected Outcomes

| Metric | Poor | Acceptable | Good |
|--------|------|------------|------|
| Silhouette Score | < 0.1 | 0.1 - 0.3 | > 0.3 |
| Noise Ratio | > 30% | 10-30% | < 10% |
| Tag Homogeneity | < 0.3 | 0.3 - 0.5 | > 0.5 |
| Cluster Count (per 10k notes) | < 20 or > 1000 | 50-200 | 100-300 |

---

## Key Tradeoffs to Monitor

1. **nNeighbors**: Low values preserve local structure (many small clusters), high values preserve global structure (fewer large clusters)

2. **minClusterSize**: Low values create many fine-grained clusters, high values create fewer coarse clusters. Too low = noise becomes clusters, too high = loses nuance.

3. **minDist**: 0.0 packs points tightly (good for HDBSCAN), higher values spread them out (worse for density-based clustering).

4. **nComponents**: More dimensions = more information preserved but slower clustering. Sweet spot is typically 10-20.

---

## Failure Modes to Detect

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| 1-2 mega-clusters | nNeighbors too high, minClusterSize too high | Reduce both |
| 90%+ noise | minClusterSize too high, minSamples too high | Reduce both |
| 1000+ tiny clusters | minClusterSize too low | Increase to 10+ |
| Silhouette negative | Poor embedding quality or UMAP misconfigured | Check embedding model, try different nNeighbors |
| Low tag homogeneity but high silhouette | Semantic and tag-based topics differ | Expected for some vaults; trust silhouette |

---

## Summary: Key Recommendations

### Primary Metric: Silhouette Score
The single most important metric for hyperparameter tuning. It directly answers: "are semantically similar notes in the same cluster?"

### Composite Score for Automation
Use weighted combination (35% silhouette + 30% domain metrics + 35% penalties) to enable automated grid search.

### Proxy Ground Truth
Leverage Obsidian metadata (tags, links, folders) as validation. If semantic clusters align with user-defined tags, the clustering is likely useful.

### Most Impactful Parameters
1. `minClusterSize` (HDBSCAN) - Most direct control over cluster granularity
2. `nNeighbors` (UMAP) - Controls local vs global structure
3. `minDist` (UMAP) - Keep low (0.0-0.1) for density-based clustering

### Starting Point
Based on BERTopic defaults and typical knowledge base characteristics:
```
UMAP:    nNeighbors=15, minDist=0.1, nComponents=10
HDBSCAN: minClusterSize=10, minSamples=3
```

Tune from here based on vault size and desired cluster granularity.
