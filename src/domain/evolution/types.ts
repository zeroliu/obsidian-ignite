/**
 * Evolution Module Types
 *
 * Types for tracking cluster evolution and concept lifecycle.
 */

/**
 * Types of evolution that can occur when clusters change
 */
export type EvolutionType = 'rename' | 'remap' | 'dissolved';

/**
 * Represents evolution from an old cluster to a new cluster
 */
export interface ClusterEvolution {
  /** ID of the old cluster */
  oldClusterId: string;
  /** ID of the new cluster (null if dissolved) */
  newClusterId: string | null;
  /** Jaccard similarity overlap score (0-1) */
  overlapScore: number;
  /** Type of evolution detected */
  type: EvolutionType;
}

/**
 * A timestamped evolution event for tracking concept history
 */
export interface EvolutionEvent {
  /** Timestamp when evolution occurred */
  ts: number;
  /** Previous cluster ID */
  fromCluster: string;
  /** New cluster ID (null if dissolved) */
  toCluster: string | null;
  /** Type of evolution */
  type: EvolutionType;
  /** Overlap score that triggered this evolution */
  overlapScore: number;
}

/**
 * Configuration for evolution detection
 */
export interface EvolutionConfig {
  /** Minimum overlap for rename (keep name, update cluster) - default: 0.6 */
  renameThreshold: number;
  /** Minimum overlap for remap (adopt new name) - default: 0.2 */
  remapThreshold: number;
}

/**
 * Default evolution configuration
 *
 * Evolution thresholds:
 * - >60% overlap = rename (same concept, cluster ID changed)
 * - 20-60% overlap = remap (concept evolved, adopt new name)
 * - <20% overlap = dissolve (concept no longer exists)
 */
export const DEFAULT_EVOLUTION_CONFIG: EvolutionConfig = {
  renameThreshold: 0.6,
  remapThreshold: 0.2,
};

/**
 * Quizzability threshold - scores >= this value are considered quizzable
 */
export const QUIZZABILITY_THRESHOLD = 0.4;
