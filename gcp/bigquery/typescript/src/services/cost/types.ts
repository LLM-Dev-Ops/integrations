/**
 * Cost tracking types for BigQuery.
 *
 * Following the SPARC specification for Google BigQuery integration.
 */

/**
 * Cost estimate for a query.
 *
 * Provides information about bytes processed/billed and estimated USD cost.
 */
export interface CostEstimate {
  /** Total bytes that will be processed by the query. */
  totalBytesProcessed: bigint;

  /** Total bytes that will be billed (after applying 10MB minimum). */
  totalBytesBilled: bigint;

  /** Estimated cost in USD. */
  estimatedCostUsd: number;

  /** Whether the query result was cached (cached queries are free). */
  cacheHit: boolean;
}

/**
 * Byte limit configuration for cost control.
 *
 * Allows setting thresholds for warning and aborting queries.
 */
export interface ByteLimitConfig {
  /** Maximum bytes billed - query will be aborted if exceeded. */
  maximumBytesBilled?: bigint;

  /** Warning threshold - log warning if exceeded but don't abort. */
  warnAtBytes?: bigint;

  /** Abort threshold - throw error if exceeded. */
  abortAtBytes?: bigint;
}

/**
 * Accumulated cost metrics for tracking query costs over time.
 */
export interface CostMetrics {
  /** Total number of queries executed. */
  queriesExecuted: number;

  /** Total bytes processed across all queries. */
  totalBytesProcessed: bigint;

  /** Total bytes billed across all queries. */
  totalBytesBilled: bigint;

  /** Estimated total cost in USD. */
  estimatedTotalCostUsd: number;

  /** Number of cache hits. */
  cacheHits: number;

  /** Number of cache misses. */
  cacheMisses: number;
}
