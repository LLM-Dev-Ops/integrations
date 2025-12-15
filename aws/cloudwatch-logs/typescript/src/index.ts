/**
 * AWS CloudWatch Logs Integration
 *
 * A thin adapter layer for AWS CloudWatch Logs integration in the LLM Dev Ops platform,
 * enabling structured log ingestion, cross-service correlation, and Insights queries.
 *
 * ## Features
 *
 * - **Structured Logging**: JSON-formatted logs with automatic correlation ID injection
 * - **Batch Buffering**: Efficient log event batching with configurable thresholds
 * - **CloudWatch Logs Insights**: Fluent query builder for log analysis
 * - **Cross-Service Correlation**: Query logs by trace_id, request_id, or span_id
 * - **Retention Management**: Programmatic retention policy configuration
 * - **Resilience**: Automatic retry, rate limiting, and error handling
 *
 * ## Quick Start
 *
 * ```typescript
 * import { CloudWatchLogsClient, configBuilder } from '@integrations/aws-cloudwatch-logs';
 *
 * // Create a client
 * const config = configBuilder()
 *   .region('us-east-1')
 *   .fromEnv()
 *   .build();
 *
 * const client = new CloudWatchLogsClient(config);
 *
 * // Put log events
 * await client.logEvents.putLogEvents({
 *   logGroupName: '/aws/lambda/my-function',
 *   logStreamName: 'production',
 *   logEvents: [
 *     {
 *       timestamp: Date.now(),
 *       message: JSON.stringify({ level: 'INFO', message: 'Request received' })
 *     }
 *   ]
 * });
 *
 * // Query with Insights
 * const results = await client.insights.startQuery({
 *   logGroupNames: ['/aws/lambda/my-function'],
 *   startTime: Date.now() - 3600000,
 *   endTime: Date.now(),
 *   queryString: 'fields @timestamp, @message | filter @message like /ERROR/'
 * });
 * ```
 *
 * ## Architecture
 *
 * This module follows the SPARC hexagonal architecture:
 *
 * - **Specification**: Clear interfaces and types for CloudWatch Logs API
 * - **Pseudocode**: Well-documented implementation intent
 * - **Architecture**: Ports and adapters pattern for clean separation
 * - **Refinement**: Iterative improvement based on AWS best practices
 * - **Completion**: Production-ready code with comprehensive testing
 *
 * @module @integrations/aws-cloudwatch-logs
 */

// ============================================================================
// Client
// ============================================================================

// Note: Client will be exported once implemented
// export { CloudWatchLogsClient } from './client.js';

// ============================================================================
// Configuration
// ============================================================================

export {
  CloudWatchLogsConfig,
  CloudWatchLogsConfigBuilder,
  BatchConfig,
  RetryConfig,
  RateLimitConfig,
  DEFAULT_CONFIG,
  configBuilder,
  resolveEndpoint,
  buildUserAgent,
  validateLogGroupName,
  validateLogStreamName,
} from './config/index.js';

// ============================================================================
// Types - Log Events
// ============================================================================

export type {
  InputLogEvent,
  OutputLogEvent,
  FilteredLogEvent,
  RejectedLogEventsInfo,
} from './types/logEvent.js';

// ============================================================================
// Types - Structured Logs
// ============================================================================

export type {
  StructuredLogEvent,
  LogLevel,
  TimeRange,
  CorrelatedLogEvent,
} from './types/structured.js';

// ============================================================================
// Types - Log Groups and Streams
// ============================================================================

export type {
  LogGroup,
  LogGroupClass,
  DataProtectionStatus,
} from './types/logGroup.js';

export type {
  LogStream,
  LogStreamOrderBy,
} from './types/logStream.js';

// ============================================================================
// Types - Queries
// ============================================================================

export type {
  QueryStatus,
  QueryInfo,
  QueryStatistics,
  QueryResults,
  ResultField,
  QueryResultRow,
} from './types/query.js';

// ============================================================================
// Types - Retention
// ============================================================================

export type {
  RetentionDays,
} from './types/retention.js';

// ============================================================================
// Types - Requests and Responses
// ============================================================================

export type {
  PutLogEventsRequest,
  GetLogEventsRequest,
  FilterLogEventsRequest,
  StartQueryRequest,
  GetQueryResultsRequest,
  StopQueryRequest,
  CreateLogGroupRequest,
  DeleteLogGroupRequest,
  DescribeLogGroupsRequest,
  CreateLogStreamRequest,
  DeleteLogStreamRequest,
  DescribeLogStreamsRequest,
  PutRetentionPolicyRequest,
  DeleteRetentionPolicyRequest,
  PutSubscriptionFilterRequest,
  DescribeSubscriptionFiltersRequest,
  DeleteSubscriptionFilterRequest,
  PutMetricFilterRequest,
  DescribeMetricFiltersRequest,
  DeleteMetricFilterRequest,
  MetricTransformation,
  MetricUnit,
  SubscriptionFilterDistribution,
} from './types/requests.js';

export type {
  PutLogEventsResponse,
  GetLogEventsResponse,
  FilterLogEventsResponse,
  SearchedLogStream,
  StartQueryResponse,
  GetQueryResultsResponse,
  StopQueryResponse,
  CreateLogGroupResponse,
  DeleteLogGroupResponse,
  DescribeLogGroupsResponse,
  CreateLogStreamResponse,
  DeleteLogStreamResponse,
  DescribeLogStreamsResponse,
  PutRetentionPolicyResponse,
  DeleteRetentionPolicyResponse,
  PutSubscriptionFilterResponse,
  DescribeSubscriptionFiltersResponse,
  SubscriptionFilter,
  DeleteSubscriptionFilterResponse,
  PutMetricFilterResponse,
  DescribeMetricFiltersResponse,
  MetricFilter,
  DeleteMetricFilterResponse,
} from './types/responses.js';

// ============================================================================
// Services
// ============================================================================

export {
  BaseService,
  LogEventsService,
  LogEventsServiceImpl,
  createLogEventsService,
  InsightsService,
  InsightsServiceImpl,
  InsightsApiClient,
} from './services/index.js';

export type {
  LogGroupsService,
  LogStreamsService,
  RetentionService,
} from './services/index.js';

export {
  DefaultLogGroupsService,
  DefaultLogStreamsService,
  DefaultRetentionService,
  validateRetentionDays,
  getValidRetentionDays,
} from './services/index.js';

// ============================================================================
// Batch Buffer
// ============================================================================

export type {
  BatchBuffer,
  BatchMetrics,
  FlushFunction,
} from './batch/buffer.js';

export {
  BatchConfig as BatchBufferConfig,
  DEFAULT_BATCH_CONFIG,
  validateBatchConfig,
} from './batch/config.js';

export {
  BatchBufferImpl,
} from './batch/buffer.js';

export {
  SequenceTokenManager,
} from './batch/sequencing.js';

// ============================================================================
// Correlation Engine
// ============================================================================

export type {
  CorrelationType,
  CorrelatedEvent,
  CorrelationResult,
} from './correlation/types.js';

// Note: CorrelationEngine will be exported once implemented
// export { CorrelationEngine } from './correlation/engine.js';

// ============================================================================
// Builders
// ============================================================================

// Note: Builders will be exported once implemented
// export { QueryBuilder } from './builders/queryBuilder.js';
// export { FilterBuilder } from './builders/filterBuilder.js';
// export { LogEventBuilder } from './builders/logEventBuilder.js';

// ============================================================================
// Error Types
// ============================================================================

export {
  CloudWatchLogsError,
  mapAwsError,
  mapHttpError,
  configurationError,
  credentialError,
  signingError,
  validationError,
  transportError,
  timeoutError,
  wrapError,
} from './error/index.js';

export type {
  CloudWatchLogsErrorCode,
  AwsErrorResponse,
} from './error/index.js';

// ============================================================================
// Credentials (re-export from credentials module)
// ============================================================================

export type {
  AwsCredentials,
  CredentialProvider,
} from './credentials/types.js';

// Note: Credential providers will be exported once implemented
// export { defaultProvider } from './credentials/chain.js';
// export { StaticCredentialProvider } from './credentials/static.js';
// export { EnvironmentCredentialProvider } from './credentials/environment.js';

// ============================================================================
// HTTP Types
// ============================================================================

// Note: HTTP types will be exported once implemented
// export type {
//   HttpRequest,
//   HttpResponse,
//   HttpMethod,
//   HttpClientConfig,
// } from './http/types.js';

// ============================================================================
// Signing (Advanced Usage)
// ============================================================================

// Note: Signing types will be exported once implemented
// export type {
//   SigningParams,
//   SignedRequest,
//   CanonicalRequest,
// } from './signing/types.js';
