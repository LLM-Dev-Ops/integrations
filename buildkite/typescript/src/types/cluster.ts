/**
 * Buildkite cluster and queue types.
 *
 * @module types/cluster
 */

import type { Creator } from './build.js';

/**
 * Buildkite cluster.
 */
export interface Cluster {
  /** Cluster ID. */
  readonly id: string;
  /** GraphQL ID. */
  readonly graphql_id: string;
  /** Cluster name. */
  readonly name: string;
  /** Cluster description. */
  readonly description?: string;
  /** Cluster emoji. */
  readonly emoji?: string;
  /** Cluster color. */
  readonly color?: string;
  /** Default queue ID. */
  readonly default_queue_id?: string;
  /** Creation time. */
  readonly created_at: string;
  /** Creator information. */
  readonly created_by?: Creator;
}

/**
 * Buildkite queue.
 */
export interface Queue {
  /** Queue ID. */
  readonly id: string;
  /** GraphQL ID. */
  readonly graphql_id: string;
  /** Queue key (identifier). */
  readonly key: string;
  /** Queue description. */
  readonly description?: string;
  /** Cluster ID. */
  readonly cluster_id: string;
  /** Creation time. */
  readonly created_at: string;
}
