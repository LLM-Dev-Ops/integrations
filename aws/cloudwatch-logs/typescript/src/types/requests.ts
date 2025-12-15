/**
 * AWS CloudWatch Logs Request Types
 *
 * This module contains type definitions for all API request types in AWS CloudWatch Logs.
 */

import type { InputLogEvent } from './logEvent.js';
import type { LogGroupClass } from './logGroup.js';
import type { LogStreamOrderBy } from './logStream.js';
import type { RetentionDays } from './retention.js';

/**
 * Request to put log events to a log stream.
 */
export interface PutLogEventsRequest {
  /** The name of the log group */
  logGroupName: string;
  /** The name of the log stream */
  logStreamName: string;
  /** The log events to upload */
  logEvents: InputLogEvent[];
  /** The sequence token (deprecated, now auto-managed by AWS) */
  sequenceToken?: string;
}

/**
 * Request to get log events from a log stream.
 */
export interface GetLogEventsRequest {
  /** The name of the log group */
  logGroupName: string;
  /** The name of the log stream */
  logStreamName: string;
  /** The start of the time range, expressed as the number of milliseconds since Jan 1, 1970 00:00:00 UTC */
  startTime?: number;
  /** The end of the time range, expressed as the number of milliseconds since Jan 1, 1970 00:00:00 UTC */
  endTime?: number;
  /** The token for the next set of items to return */
  nextToken?: string;
  /** The maximum number of log events to return */
  limit?: number;
  /** If true, returns the earliest log events first */
  startFromHead?: boolean;
  /** If true, unmasked data is returned */
  unmask?: boolean;
}

/**
 * Request to filter log events across log streams.
 */
export interface FilterLogEventsRequest {
  /** The name of the log group to search */
  logGroupName?: string;
  /** The ARN of the log group to search (alternative to logGroupName) */
  logGroupIdentifier?: string;
  /** Filters the results to only logs from the specified log streams */
  logStreamNames?: string[];
  /** Filters the results to include only events from log streams that have names starting with this prefix */
  logStreamNamePrefix?: string;
  /** The start of the time range, expressed as the number of milliseconds since Jan 1, 1970 00:00:00 UTC */
  startTime?: number;
  /** The end of the time range, expressed as the number of milliseconds since Jan 1, 1970 00:00:00 UTC */
  endTime?: number;
  /** The filter pattern to use */
  filterPattern?: string;
  /** The token for the next set of events to return */
  nextToken?: string;
  /** The maximum number of events to return */
  limit?: number;
  /** If true, the log event fields are returned as separate JSON objects */
  interleaved?: boolean;
  /** If true, unmasked data is returned */
  unmask?: boolean;
}

/**
 * Request to start a CloudWatch Logs Insights query.
 */
export interface StartQueryRequest {
  /** The list of log groups to query (use either this or logGroupIdentifiers) */
  logGroupNames?: string[];
  /** The list of log group ARNs to query (use either this or logGroupNames) */
  logGroupIdentifiers?: string[];
  /** The beginning of the time range to query (epoch seconds, not milliseconds) */
  startTime: number;
  /** The end of the time range to query (epoch seconds, not milliseconds) */
  endTime: number;
  /** The query string to use */
  queryString: string;
  /** The maximum number of results to return */
  limit?: number;
}

/**
 * Request to get the results of a CloudWatch Logs Insights query.
 */
export interface GetQueryResultsRequest {
  /** The ID of the query */
  queryId: string;
}

/**
 * Request to stop a CloudWatch Logs Insights query.
 */
export interface StopQueryRequest {
  /** The ID of the query to stop */
  queryId: string;
}

/**
 * Request to create a log group.
 */
export interface CreateLogGroupRequest {
  /** The name of the log group */
  logGroupName: string;
  /** The Amazon Resource Name (ARN) of the KMS key to use when encrypting log data */
  kmsKeyId?: string;
  /** The key-value pairs to use for the tags */
  tags?: Record<string, string>;
  /** The log group class */
  logGroupClass?: LogGroupClass;
}

/**
 * Request to delete a log group.
 */
export interface DeleteLogGroupRequest {
  /** The name of the log group */
  logGroupName: string;
}

/**
 * Request to describe log groups.
 */
export interface DescribeLogGroupsRequest {
  /** The prefix to match */
  logGroupNamePrefix?: string;
  /** A pattern to filter the results by log group name */
  logGroupNamePattern?: string;
  /** The token for the next set of items to return */
  nextToken?: string;
  /** The maximum number of items to return */
  limit?: number;
  /** Include log groups from linked accounts */
  includeLinkedAccounts?: boolean;
  /** Specify ACCOUNT_ID to filter by account */
  accountIdentifiers?: string[];
}

/**
 * Request to create a log stream.
 */
export interface CreateLogStreamRequest {
  /** The name of the log group */
  logGroupName: string;
  /** The name of the log stream */
  logStreamName: string;
}

/**
 * Request to delete a log stream.
 */
export interface DeleteLogStreamRequest {
  /** The name of the log group */
  logGroupName: string;
  /** The name of the log stream */
  logStreamName: string;
}

/**
 * Request to describe log streams.
 */
export interface DescribeLogStreamsRequest {
  /** The name of the log group */
  logGroupName?: string;
  /** The ARN of the log group */
  logGroupIdentifier?: string;
  /** The prefix to match */
  logStreamNamePrefix?: string;
  /** How to order the results (LogStreamName or LastEventTime) */
  orderBy?: LogStreamOrderBy;
  /** If true, results are returned in descending order */
  descending?: boolean;
  /** The token for the next set of items to return */
  nextToken?: string;
  /** The maximum number of items to return */
  limit?: number;
}

/**
 * Request to put a retention policy on a log group.
 */
export interface PutRetentionPolicyRequest {
  /** The name of the log group */
  logGroupName: string;
  /** The number of days to retain the log events */
  retentionInDays: RetentionDays;
}

/**
 * Request to delete a retention policy from a log group.
 */
export interface DeleteRetentionPolicyRequest {
  /** The name of the log group */
  logGroupName: string;
}

/**
 * Request to put a subscription filter on a log group.
 */
export interface PutSubscriptionFilterRequest {
  /** The name of the log group */
  logGroupName: string;
  /** A name for the subscription filter */
  filterName: string;
  /** A filter pattern for subscribing to a filtered stream of log events */
  filterPattern: string;
  /** The ARN of the destination to deliver matching log events to */
  destinationArn: string;
  /** The ARN of an IAM role that grants CloudWatch Logs permissions to deliver ingested log events to the destination stream */
  roleArn?: string;
  /** The method used to distribute log data to the destination */
  distribution?: SubscriptionFilterDistribution;
}

/**
 * Distribution method for subscription filters.
 */
export type SubscriptionFilterDistribution = 'Random' | 'ByLogStream';

/**
 * Request to describe subscription filters.
 */
export interface DescribeSubscriptionFiltersRequest {
  /** The name of the log group */
  logGroupName: string;
  /** The prefix to match */
  filterNamePrefix?: string;
  /** The token for the next set of items to return */
  nextToken?: string;
  /** The maximum number of items to return */
  limit?: number;
}

/**
 * Request to delete a subscription filter.
 */
export interface DeleteSubscriptionFilterRequest {
  /** The name of the log group */
  logGroupName: string;
  /** The name of the subscription filter */
  filterName: string;
}

/**
 * Request to put a metric filter on a log group.
 */
export interface PutMetricFilterRequest {
  /** The name of the log group */
  logGroupName: string;
  /** A name for the metric filter */
  filterName: string;
  /** A filter pattern for extracting metric data out of ingested log events */
  filterPattern: string;
  /** A collection of information that defines how metric data gets emitted */
  metricTransformations: MetricTransformation[];
}

/**
 * Metric transformation configuration.
 */
export interface MetricTransformation {
  /** The name of the CloudWatch metric */
  metricName: string;
  /** The namespace of the CloudWatch metric */
  metricNamespace: string;
  /** The value to publish to the CloudWatch metric */
  metricValue: string;
  /** The value to emit when a filter pattern does not match a log event */
  defaultValue?: number;
  /** The fields to use as dimensions for the metric */
  dimensions?: Record<string, string>;
  /** The unit to assign to the metric */
  unit?: MetricUnit;
}

/**
 * CloudWatch metric units.
 */
export type MetricUnit =
  | 'Seconds'
  | 'Microseconds'
  | 'Milliseconds'
  | 'Bytes'
  | 'Kilobytes'
  | 'Megabytes'
  | 'Gigabytes'
  | 'Terabytes'
  | 'Bits'
  | 'Kilobits'
  | 'Megabits'
  | 'Gigabits'
  | 'Terabits'
  | 'Percent'
  | 'Count'
  | 'Bytes/Second'
  | 'Kilobytes/Second'
  | 'Megabytes/Second'
  | 'Gigabytes/Second'
  | 'Terabytes/Second'
  | 'Bits/Second'
  | 'Kilobits/Second'
  | 'Megabits/Second'
  | 'Gigabits/Second'
  | 'Terabits/Second'
  | 'Count/Second'
  | 'None';

/**
 * Request to describe metric filters.
 */
export interface DescribeMetricFiltersRequest {
  /** The name of the log group */
  logGroupName?: string;
  /** The prefix to match */
  filterNamePrefix?: string;
  /** The namespace to filter by */
  metricNamespace?: string;
  /** The name of the CloudWatch metric to filter by */
  metricName?: string;
  /** The token for the next set of items to return */
  nextToken?: string;
  /** The maximum number of items to return */
  limit?: number;
}

/**
 * Request to delete a metric filter.
 */
export interface DeleteMetricFilterRequest {
  /** The name of the log group */
  logGroupName: string;
  /** The name of the metric filter */
  filterName: string;
}
