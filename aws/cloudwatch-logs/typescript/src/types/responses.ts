/**
 * AWS CloudWatch Logs Response Types
 *
 * This module contains type definitions for all API response types in AWS CloudWatch Logs.
 */

import type {
  OutputLogEvent,
  FilteredLogEvent,
  RejectedLogEventsInfo,
} from './logEvent.js';
import type { LogGroup } from './logGroup.js';
import type { LogStream } from './logStream.js';
import type { QueryResults } from './query.js';
import type { MetricTransformation, SubscriptionFilterDistribution } from './requests.js';

/**
 * Response from putting log events.
 */
export interface PutLogEventsResponse {
  /** The next sequence token (deprecated) */
  nextSequenceToken?: string;
  /** Information about rejected log events */
  rejectedLogEventsInfo?: RejectedLogEventsInfo;
}

/**
 * Response from getting log events.
 */
export interface GetLogEventsResponse {
  /** The log events */
  events?: OutputLogEvent[];
  /** The token for the next set of items in the forward direction */
  nextForwardToken?: string;
  /** The token for the next set of items in the backward direction */
  nextBackwardToken?: string;
}

/**
 * Response from filtering log events.
 */
export interface FilterLogEventsResponse {
  /** The matched log events */
  events?: FilteredLogEvent[];
  /** The token to use when requesting the next set of items */
  nextToken?: string;
  /** Important: searchedLogStreams has been moved to this field */
  searchedLogStreams?: SearchedLogStream[];
}

/**
 * Information about a searched log stream.
 */
export interface SearchedLogStream {
  /** The name of the log stream */
  logStreamName?: string;
  /** Indicates whether all the events in this log stream were searched */
  searchedCompletely?: boolean;
}

/**
 * Response from starting a query.
 */
export interface StartQueryResponse {
  /** The unique ID of the query */
  queryId?: string;
}

/**
 * Response from getting query results.
 */
export interface GetQueryResultsResponse extends QueryResults {
  // Inherits all properties from QueryResults
}

/**
 * Response from stopping a query.
 */
export interface StopQueryResponse {
  /** Whether the query was successfully stopped */
  success?: boolean;
}

/**
 * Response from creating a log group.
 */
export interface CreateLogGroupResponse {
  // Empty response
}

/**
 * Response from deleting a log group.
 */
export interface DeleteLogGroupResponse {
  // Empty response
}

/**
 * Response from describing log groups.
 */
export interface DescribeLogGroupsResponse {
  /** The log groups */
  logGroups?: LogGroup[];
  /** The token for the next set of items to return */
  nextToken?: string;
}

/**
 * Response from creating a log stream.
 */
export interface CreateLogStreamResponse {
  // Empty response
}

/**
 * Response from deleting a log stream.
 */
export interface DeleteLogStreamResponse {
  // Empty response
}

/**
 * Response from describing log streams.
 */
export interface DescribeLogStreamsResponse {
  /** The log streams */
  logStreams?: LogStream[];
  /** The token for the next set of items to return */
  nextToken?: string;
}

/**
 * Response from putting a retention policy.
 */
export interface PutRetentionPolicyResponse {
  // Empty response
}

/**
 * Response from deleting a retention policy.
 */
export interface DeleteRetentionPolicyResponse {
  // Empty response
}

/**
 * Response from putting a subscription filter.
 */
export interface PutSubscriptionFilterResponse {
  // Empty response
}

/**
 * Response from describing subscription filters.
 */
export interface DescribeSubscriptionFiltersResponse {
  /** The subscription filters */
  subscriptionFilters?: SubscriptionFilter[];
  /** The token for the next set of items to return */
  nextToken?: string;
}

/**
 * Represents a subscription filter.
 */
export interface SubscriptionFilter {
  /** The name of the subscription filter */
  filterName?: string;
  /** The name of the log group */
  logGroupName?: string;
  /** The filter pattern */
  filterPattern?: string;
  /** The ARN of the destination */
  destinationArn?: string;
  /** The ARN of the IAM role */
  roleArn?: string;
  /** The distribution method */
  distribution?: SubscriptionFilterDistribution;
  /** The creation time of the subscription filter, expressed as the number of milliseconds since Jan 1, 1970 00:00:00 UTC */
  creationTime?: number;
}

/**
 * Response from deleting a subscription filter.
 */
export interface DeleteSubscriptionFilterResponse {
  // Empty response
}

/**
 * Response from putting a metric filter.
 */
export interface PutMetricFilterResponse {
  // Empty response
}

/**
 * Response from describing metric filters.
 */
export interface DescribeMetricFiltersResponse {
  /** The metric filters */
  metricFilters?: MetricFilter[];
  /** The token for the next set of items to return */
  nextToken?: string;
}

/**
 * Represents a metric filter.
 */
export interface MetricFilter {
  /** The name of the metric filter */
  filterName?: string;
  /** The filter pattern */
  filterPattern?: string;
  /** The metric transformations */
  metricTransformations?: MetricTransformation[];
  /** The creation time of the metric filter, expressed as the number of milliseconds since Jan 1, 1970 00:00:00 UTC */
  creationTime?: number;
  /** The name of the log group */
  logGroupName?: string;
}

/**
 * Response from deleting a metric filter.
 */
export interface DeleteMetricFilterResponse {
  // Empty response
}
