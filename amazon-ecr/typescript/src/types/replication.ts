/**
 * Replication types for Amazon ECR.
 *
 * This module provides TypeScript type definitions for ECR replication entities,
 * matching the structure defined in the SPARC specification.
 *
 * @module types/replication
 */

/**
 * Replication state.
 */
export enum ReplicationState {
  /** Replication is in progress. */
  InProgress = 'IN_PROGRESS',
  /** Replication is complete. */
  Complete = 'COMPLETE',
  /** Replication failed. */
  Failed = 'FAILED',
}

/**
 * Replication status for a specific destination.
 */
export interface ReplicationStatus {
  /** AWS region of the destination. */
  readonly region: string;
  /** Registry ID of the destination. */
  readonly registryId: string;
  /** Current replication state. */
  readonly status: ReplicationState;
}

/**
 * Repository filter for replication rules.
 */
export interface RepositoryFilter {
  /** Repository name filter (exact match or prefix). */
  readonly filter: string;
  /** Filter type (PREFIX_MATCH). */
  readonly filterType: string;
}

/**
 * Replication destination configuration.
 */
export interface ReplicationDestination {
  /** AWS region for replication. */
  readonly region: string;
  /** Registry ID for replication. */
  readonly registryId: string;
}

/**
 * Replication rule configuration.
 */
export interface ReplicationRule {
  /** List of replication destinations. */
  readonly destinations: ReplicationDestination[];
  /** Optional repository filters. */
  readonly repositoryFilters?: RepositoryFilter[];
}

/**
 * Registry replication configuration.
 */
export interface ReplicationConfiguration {
  /** List of replication rules. */
  readonly rules: ReplicationRule[];
}

/**
 * Wait options for replication polling.
 */
export interface ReplicationWaitOptions {
  /** Timeout in seconds (default: 300). */
  readonly timeoutSeconds?: number;
  /** Poll interval in seconds (default: 10). */
  readonly pollIntervalSeconds?: number;
}
