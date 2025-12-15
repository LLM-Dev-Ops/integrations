/**
 * AWS CloudWatch Logs Insights Query Types
 *
 * This module contains type definitions for CloudWatch Logs Insights queries.
 */

/**
 * Status of a CloudWatch Logs Insights query.
 */
export type QueryStatus = 'Scheduled' | 'Running' | 'Complete' | 'Failed' | 'Cancelled' | 'Timeout' | 'Unknown';

/**
 * Information about a CloudWatch Logs Insights query.
 */
export interface QueryInfo {
  /** The unique ID of the query */
  queryId?: string;
  /** The query string used in this query */
  queryString?: string;
  /** The status of the query execution */
  status?: QueryStatus;
  /** The date and time that this query was created */
  createTime?: number;
  /** The date and time that the query results were ingested by CloudWatch Logs */
  logGroupName?: string;
}

/**
 * Statistics about the query execution.
 */
export interface QueryStatistics {
  /** The number of log events that matched the query string */
  recordsMatched?: number;
  /** The total number of log events scanned during the query */
  recordsScanned?: number;
  /** The total amount of bytes processed by the query */
  bytesScanned?: number;
}

/**
 * A single field and its value in a query result.
 */
export interface ResultField {
  /** The name of the field */
  field?: string;
  /** The value of this field */
  value?: string;
}

/**
 * A single row in a query result.
 */
export type QueryResultRow = ResultField[];

/**
 * Complete query results.
 */
export interface QueryResults {
  /** The status of the query */
  status?: QueryStatus;
  /** The result rows */
  results?: QueryResultRow[];
  /** Statistics about the query execution */
  statistics?: QueryStatistics;
  /** The encryption key used for the query results */
  encryptionKey?: string;
}
