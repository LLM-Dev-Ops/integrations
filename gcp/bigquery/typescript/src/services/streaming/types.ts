/**
 * Streaming Service Types
 *
 * Types for BigQuery streaming inserts (tabledata.insertAll API).
 */

/**
 * Error details for a single failed field.
 */
export interface ErrorProto {
  /** Error reason code. */
  reason: string;

  /** Field location where error occurred. */
  location?: string;

  /** Human-readable error message. */
  message: string;
}

/**
 * Error information for a single failed row.
 */
export interface InsertError {
  /** Index of the row that failed (0-based). */
  index: number;

  /** Array of errors for this row. */
  errors: ErrorProto[];
}

/**
 * Response from streaming insert operation.
 */
export interface InsertAllResponse {
  /** Array of errors for failed rows. If empty/undefined, all rows succeeded. */
  insertErrors?: InsertError[];
}

/**
 * A single row to insert.
 */
export interface InsertRow {
  /**
   * Unique insert ID for deduplication.
   * BigQuery uses this to avoid inserting duplicate rows.
   * Optional but recommended for exactly-once semantics.
   */
  insertId?: string;

  /**
   * Row data as JSON object.
   * Field names must match the table schema.
   */
  json: Record<string, unknown>;
}

/**
 * Request for streaming insert operation.
 */
export interface InsertAllRequest {
  /** Array of rows to insert. */
  rows: InsertRow[];

  /**
   * Skip rows with invalid data and insert valid rows.
   * Default: false (reject entire request if any row is invalid).
   */
  skipInvalidRows?: boolean;

  /**
   * Accept rows with fields not in the table schema.
   * Default: false (reject rows with unknown fields).
   */
  ignoreUnknownValues?: boolean;

  /**
   * Template suffix for table decorators.
   * Used with date-sharded tables (e.g., "_20231201").
   */
  templateSuffix?: string;

  /**
   * Optional trace ID for request tracking.
   */
  traceId?: string;
}

/**
 * Options for buffered inserter.
 */
export interface BufferedInserterOptions {
  /**
   * Maximum number of rows to buffer before auto-flush.
   * Default: 500
   */
  maxRows?: number;

  /**
   * Maximum buffer size in bytes before auto-flush.
   * Default: 1048576 (1MB)
   */
  maxBytes?: number;

  /**
   * Auto-flush interval in milliseconds.
   * Default: 1000 (1 second)
   */
  flushIntervalMs?: number;
}

/**
 * Default buffered inserter options.
 */
export const DEFAULT_BUFFERED_OPTIONS: Required<BufferedInserterOptions> = {
  maxRows: 500,
  maxBytes: 1048576, // 1 MB
  flushIntervalMs: 1000, // 1 second
};
