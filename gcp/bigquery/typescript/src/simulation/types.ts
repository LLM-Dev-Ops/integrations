/**
 * Simulation types for testing BigQuery operations.
 *
 * Following the SPARC specification for Google BigQuery integration.
 */

import { TableSchema } from "../types/schema.js";
import { TableRow } from "../types/row.js";
import { Job } from "../services/query/types.js";

/**
 * Mock query result for simulation.
 */
export interface MockQueryResult {
  /** Result schema. */
  schema: TableSchema;

  /** Result rows. */
  rows: TableRow[];

  /** Total bytes processed. */
  totalBytesProcessed: bigint;

  /** Whether the result was served from cache. */
  cacheHit: boolean;
}

/**
 * Job state for simulation.
 */
export type JobState = "PENDING" | "RUNNING" | "DONE";

/**
 * Replay scenario containing recorded queries and jobs.
 */
export interface ReplayScenario {
  /** Recorded queries mapped by query pattern. */
  queries: Map<string, MockQueryResult>;

  /** Recorded jobs mapped by job ID. */
  jobs: Map<string, Job>;
}

/**
 * Configuration for mock client behavior.
 */
export interface MockConfig {
  /** Default latency to simulate in milliseconds. */
  defaultLatencyMs?: number;

  /** Simulated failure rate (0.0 to 1.0). */
  failureRate?: number;

  /** Maximum bytes that can be processed. */
  maxBytesProcessed?: bigint;
}

/**
 * Call history entry for tracking method calls.
 */
export interface CallHistoryEntry {
  /** Method name that was called. */
  method: string;

  /** Arguments passed to the method. */
  args: unknown[];

  /** Timestamp of the call. */
  timestamp: Date;
}
