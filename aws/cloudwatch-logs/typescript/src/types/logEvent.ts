/**
 * AWS CloudWatch Logs Event Types
 *
 * This module contains type definitions for log events in AWS CloudWatch Logs.
 */

/**
 * Input log event for PutLogEvents.
 */
export interface InputLogEvent {
  /** The time the event occurred, expressed as the number of milliseconds since Jan 1, 1970 00:00:00 UTC */
  timestamp: number;
  /** The raw event message */
  message: string;
}

/**
 * Output log event from GetLogEvents/FilterLogEvents.
 */
export interface OutputLogEvent {
  /** The time the event occurred, expressed as the number of milliseconds since Jan 1, 1970 00:00:00 UTC */
  timestamp?: number;
  /** The data contained in the log event */
  message?: string;
  /** The time the event was ingested, expressed as the number of milliseconds since Jan 1, 1970 00:00:00 UTC */
  ingestionTime?: number;
  /** The unique identifier of the log event */
  eventId?: string;
}

/**
 * Filtered log event with stream info.
 */
export interface FilteredLogEvent extends OutputLogEvent {
  /** The name of the log stream to which this event belongs */
  logStreamName?: string;
}

/**
 * Information about rejected log events.
 */
export interface RejectedLogEventsInfo {
  /** The log events that are too new */
  tooNewLogEventStartIndex?: number;
  /** The log events that are too old */
  tooOldLogEventEndIndex?: number;
  /** The expired log event end index */
  expiredLogEventEndIndex?: number;
}
