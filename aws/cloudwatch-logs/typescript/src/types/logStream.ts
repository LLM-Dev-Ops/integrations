/**
 * AWS CloudWatch Logs Stream Types
 *
 * This module contains type definitions for log streams in AWS CloudWatch Logs.
 */

/**
 * Represents a log stream.
 */
export interface LogStream {
  /** The name of the log stream */
  logStreamName?: string;
  /** The creation time of the log stream, expressed as the number of milliseconds since Jan 1, 1970 00:00:00 UTC */
  creationTime?: number;
  /** The time of the first event, expressed as the number of milliseconds since Jan 1, 1970 00:00:00 UTC */
  firstEventTimestamp?: number;
  /** The time of the most recent log event in the log stream, expressed as the number of milliseconds since Jan 1, 1970 00:00:00 UTC */
  lastEventTimestamp?: number;
  /** The ingestion time of the most recent log event, expressed as the number of milliseconds since Jan 1, 1970 00:00:00 UTC */
  lastIngestionTime?: number;
  /** The sequence token (deprecated but may still be returned by API) */
  uploadSequenceToken?: string;
  /** The Amazon Resource Name (ARN) of the log stream */
  arn?: string;
  /** The number of bytes stored in the log stream */
  storedBytes?: number;
}

/**
 * Sort order for log streams.
 */
export type LogStreamOrderBy = 'LogStreamName' | 'LastEventTime';
