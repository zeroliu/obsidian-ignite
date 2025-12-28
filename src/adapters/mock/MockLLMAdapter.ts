import type {
  ClusterSummary,
  ConceptNamingRequest,
  ConceptNamingResponse,
  ConceptNamingResult,
  LLMConfig,
  MisfitNote,
} from '@/domain/llm/types';
import { DEFAULT_LLM_CONFIG } from '@/domain/llm/types';
import type { ILLMProvider } from '@/ports/ILLMProvider';

/**
 * Rule for naming clusters based on pattern matching
 */
export interface NamingRule {
  /** Pattern to match against candidate names, titles, tags, or folder */
  pattern: RegExp;
  /** Canonical name to assign when pattern matches */
  canonicalName: string;
  /** Quizzability score (0-1) */
  quizzabilityScore: number;
  /** Reason if not quizzable (score < 0.4) */
  nonQuizzableReason?: string;
}

/**
 * Rule for detecting misfit notes
 */
export interface MisfitRule {
  /** Pattern to match note titles that are misfits in any concept */
  pattern: RegExp;
  /** Reason for being a misfit */
  reason: string;
}

/**
 * Fixture for testing with custom rules
 */
export interface MockLLMFixture {
  namingRules: NamingRule[];
  misfitRules: MisfitRule[];
}

/**
 * Record of an LLM call for testing
 */
export interface LLMCallRecord {
  type: 'nameConceptsBatch';
  request: ConceptNamingRequest;
  timestamp: number;
}

/**
 * Default naming rules for common patterns
 */
const DEFAULT_NAMING_RULES: NamingRule[] = [
  // Technical/Learning content (high quizzability)
  {
    pattern: /react/i,
    canonicalName: 'React Development',
    quizzabilityScore: 0.9,
  },
  {
    pattern: /typescript|ts\b/i,
    canonicalName: 'TypeScript',
    quizzabilityScore: 0.9,
  },
  {
    pattern: /javascript|js\b/i,
    canonicalName: 'JavaScript',
    quizzabilityScore: 0.85,
  },
  {
    pattern: /python/i,
    canonicalName: 'Python Programming',
    quizzabilityScore: 0.9,
  },
  {
    pattern: /golf/i,
    canonicalName: 'Golf Mechanics',
    quizzabilityScore: 0.75,
  },
  {
    pattern: /algorithm/i,
    canonicalName: 'Algorithms',
    quizzabilityScore: 0.95,
  },

  // Non-quizzable content (score < 0.4)
  {
    pattern: /meeting|standup|sync\b/i,
    canonicalName: 'Meeting Notes',
    quizzabilityScore: 0.1,
    nonQuizzableReason: 'Meeting notes are time-bound and not suitable for spaced repetition',
  },
  {
    pattern: /daily|journal/i,
    canonicalName: 'Daily Journal',
    quizzabilityScore: 0.15,
    nonQuizzableReason: 'Daily journal entries are personal reflections, not knowledge to recall',
  },
  {
    pattern: /todo|task/i,
    canonicalName: 'Task Lists',
    quizzabilityScore: 0.05,
    nonQuizzableReason: 'Task lists are ephemeral and not suitable for long-term recall',
  },
];

/**
 * Default misfit rules
 */
const DEFAULT_MISFIT_RULES: MisfitRule[] = [
  {
    pattern: /grocery|shopping\s*list/i,
    reason: 'Shopping lists are personal/productivity content, not knowledge',
  },
  {
    pattern: /recipe/i,
    reason: 'Recipes belong in a cooking/food category',
  },
];

/**
 * Mock implementation of ILLMProvider for testing
 *
 * Uses deterministic pattern-based rules for reproducible tests.
 * Integrates misfit detection into the naming stage.
 */
export class MockLLMAdapter implements ILLMProvider {
  private config: LLMConfig;
  private namingRules: NamingRule[];
  private misfitRules: MisfitRule[];
  private callHistory: LLMCallRecord[] = [];

  constructor(config?: Partial<LLMConfig>) {
    this.config = { ...DEFAULT_LLM_CONFIG, ...config };
    this.namingRules = [...DEFAULT_NAMING_RULES];
    this.misfitRules = [...DEFAULT_MISFIT_RULES];
  }

  async nameConceptsBatch(request: ConceptNamingRequest): Promise<ConceptNamingResponse> {
    this.callHistory.push({
      type: 'nameConceptsBatch',
      request,
      timestamp: Date.now(),
    });

    const results: ConceptNamingResult[] = request.clusters.map((cluster) =>
      this.nameSingleCluster(cluster),
    );

    // Detect merge suggestions based on similar names
    this.detectMergeSuggestions(results);

    return {
      results,
      usage: {
        inputTokens: this.estimateInputTokens(request),
        outputTokens: this.estimateOutputTokens(results),
      },
    };
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Name a single cluster based on pattern matching
   * Also detects misfit notes
   */
  private nameSingleCluster(cluster: ClusterSummary): ConceptNamingResult {
    // Build search text from all cluster info
    const searchText = [
      ...cluster.candidateNames,
      ...cluster.representativeTitles,
      ...cluster.commonTags,
      cluster.folderPath,
    ].join(' ');

    // Detect misfit notes from representative titles
    const misfitNotes = this.detectMisfitsInTitles(cluster.representativeTitles);

    // Find matching rule
    for (const rule of this.namingRules) {
      if (rule.pattern.test(searchText)) {
        return {
          clusterId: cluster.clusterId,
          canonicalName: rule.canonicalName,
          quizzabilityScore: rule.quizzabilityScore,
          nonQuizzableReason: rule.nonQuizzableReason,
          suggestedMerges: [],
          misfitNotes,
        };
      }
    }

    // Default: use first candidate name or generate from folder
    const defaultName =
      cluster.candidateNames[0] ||
      this.generateNameFromFolder(cluster.folderPath) ||
      'Unnamed Concept';

    return {
      clusterId: cluster.clusterId,
      canonicalName: defaultName,
      quizzabilityScore: 0.5,
      suggestedMerges: [],
      misfitNotes,
    };
  }

  /**
   * Generate a concept name from folder path
   */
  private generateNameFromFolder(folderPath: string): string {
    if (!folderPath) return '';
    const parts = folderPath.split('/').filter(Boolean);
    if (parts.length === 0) return '';
    const lastPart = parts[parts.length - 1];
    // Title case and replace hyphens/underscores
    return lastPart.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Detect merge suggestions based on similar canonical names
   */
  private detectMergeSuggestions(results: ConceptNamingResult[]): void {
    const byName = new Map<string, ConceptNamingResult[]>();

    for (const result of results) {
      const normalized = result.canonicalName.toLowerCase();
      const existing = byName.get(normalized) || [];
      existing.push(result);
      byName.set(normalized, existing);
    }

    // Add merge suggestions for duplicates
    for (const group of byName.values()) {
      if (group.length > 1) {
        const primary = group[0];
        const mergeIds = group.slice(1).map((r) => r.clusterId);
        primary.suggestedMerges = mergeIds;
      }
    }
  }

  /**
   * Detect misfit notes from representative titles
   */
  private detectMisfitsInTitles(titles: string[]): MisfitNote[] {
    const misfits: MisfitNote[] = [];

    for (const title of titles) {
      for (const rule of this.misfitRules) {
        if (rule.pattern.test(title)) {
          misfits.push({
            noteId: this.generateNoteIdFromTitle(title),
            reason: rule.reason,
          });
        }
      }
    }

    return misfits;
  }

  /**
   * Generate a note ID from title (for testing)
   */
  private generateNoteIdFromTitle(title: string): string {
    return `note-${title
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')}`;
  }

  /**
   * Estimate input tokens (rough approximation)
   */
  private estimateInputTokens(request: ConceptNamingRequest): number {
    const json = JSON.stringify(request);
    // Rough estimate: ~4 characters per token
    return Math.ceil(json.length / 4);
  }

  /**
   * Estimate output tokens (rough approximation)
   */
  private estimateOutputTokens(results: ConceptNamingResult[]): number {
    const json = JSON.stringify(results);
    return Math.ceil(json.length / 4);
  }

  // ============ Test Helpers ============

  /**
   * Get call history for testing
   */
  _getCallHistory(): LLMCallRecord[] {
    return [...this.callHistory];
  }

  /**
   * Clear call history
   */
  _clearCallHistory(): void {
    this.callHistory = [];
  }

  /**
   * Set fixture to replace all rules
   */
  _setFixture(fixture: MockLLMFixture): void {
    this.namingRules = [...fixture.namingRules];
    this.misfitRules = [...fixture.misfitRules];
  }

  /**
   * Add a single naming rule
   */
  _addNamingRule(rule: NamingRule): void {
    // Add to beginning for priority
    this.namingRules.unshift(rule);
  }

  /**
   * Add a single misfit rule
   */
  _addMisfitRule(rule: MisfitRule): void {
    this.misfitRules.unshift(rule);
  }

  /**
   * Reset to default rules
   */
  _resetRules(): void {
    this.namingRules = [...DEFAULT_NAMING_RULES];
    this.misfitRules = [...DEFAULT_MISFIT_RULES];
  }
}
