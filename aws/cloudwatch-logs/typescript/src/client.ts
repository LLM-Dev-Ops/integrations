/**
 * AWS CloudWatch Logs Client
 *
 * High-level client for AWS CloudWatch Logs operations.
 * Provides service accessors and convenience methods following the
 * SPARC hexagonal architecture pattern.
 *
 * @module client
 */

import { CloudWatchLogsConfig, CloudWatchLogsConfigBuilder, configBuilder } from "./config";
import { defaultProvider } from "./credentials/chain";
import { CloudWatchLogsError } from "./error";
import type {
  InputLogEvent,
  PutLogEventsResponse,
  FilteredLogEvent,
  QueryResultRow,
  LogGroup,
  LogStream,
  RetentionDays,
  StructuredLogEvent,
  CorrelatedLogEvent,
} from "./types";

// Service imports (lazy-loaded)
type LogEventsService = any;
type InsightsService = any;
type LogGroupsService = any;
type LogStreamsService = any;
type RetentionService = any;
type BatchBuffer = any;
type CorrelationEngine = any;

// Builder imports (lazy-loaded)
type QueryBuilder = any;
type FilterBuilder = any;
type LogEventBuilder = any;

/**
 * Correlation result from trace/request/span ID queries.
 */
export interface CorrelationResult {
  /**
   * The correlation ID used for the search.
   */
  correlationId: string;

  /**
   * Type of correlation (trace_id, request_id, span_id).
   */
  correlationType: "trace_id" | "request_id" | "span_id";

  /**
   * Matched correlated events.
   */
  events: CorrelatedLogEvent[];

  /**
   * Time range searched.
   */
  timeRange: {
    startTime: number;
    endTime: number;
  };

  /**
   * Log groups searched.
   */
  logGroups: string[];
}

/**
 * AWS CloudWatch Logs Client.
 *
 * Main entry point for interacting with AWS CloudWatch Logs.
 * Provides lazy-loaded service accessors and convenience methods.
 *
 * @example
 * ```typescript
 * // Create from environment
 * const client = await CloudWatchLogsClient.fromEnv();
 *
 * // Put log events
 * await client.putLogEvents('/aws/lambda/my-function', 'stream-1', [
 *   { timestamp: Date.now(), message: 'Hello CloudWatch!' }
 * ]);
 *
 * // Query with Insights
 * const results = await client.query(
 *   ['/aws/lambda/my-function'],
 *   'fields @timestamp, @message | filter @message like /ERROR/',
 *   startTime,
 *   endTime
 * );
 * ```
 *
 * @example
 * ```typescript
 * // Create with builder
 * const client = await CloudWatchLogsClient.builder()
 *   .region('us-east-1')
 *   .credentials('AKIAIOSFODNN7EXAMPLE', 'wJalrXUtn...')
 *   .build();
 *
 * // Access services
 * const logGroups = client.logGroups;
 * await logGroups.create('/my-app/logs');
 * ```
 */
export class CloudWatchLogsClient {
  private _config: CloudWatchLogsConfig;

  // Lazy-loaded services
  private _logEventsService?: LogEventsService;
  private _insightsService?: InsightsService;
  private _logGroupsService?: LogGroupsService;
  private _logStreamsService?: LogStreamsService;
  private _retentionService?: RetentionService;
  private _batchBuffer?: BatchBuffer;
  private _correlationEngine?: CorrelationEngine;

  /**
   * Create a new CloudWatch Logs client.
   *
   * Use `CloudWatchLogsClient.builder()` or `CloudWatchLogsClient.fromEnv()` instead of
   * calling this constructor directly.
   *
   * @param config - CloudWatch Logs configuration
   */
  constructor(config: CloudWatchLogsConfig) {
    this._config = config;
  }

  /**
   * Get the client configuration.
   *
   * @returns CloudWatch Logs configuration
   */
  getConfig(): CloudWatchLogsConfig {
    return this._config;
  }

  /**
   * Log events service for putting and filtering log events.
   *
   * Lazy-loaded on first access.
   *
   * @returns Log events service instance
   *
   * @example
   * ```typescript
   * const events = [
   *   { timestamp: Date.now(), message: 'Event 1' },
   *   { timestamp: Date.now(), message: 'Event 2' }
   * ];
   * await client.logEvents.put('/my-logs', 'stream-1', events);
   * ```
   */
  get logEvents(): LogEventsService {
    if (!this._logEventsService) {
      // Lazy-load log events service
      const { createLogEventsService } = require("./services/logEvents");
      this._logEventsService = createLogEventsService(this._config);
    }
    return this._logEventsService;
  }

  /**
   * Insights service for CloudWatch Logs Insights queries.
   *
   * Lazy-loaded on first access.
   *
   * @returns Insights service instance
   *
   * @example
   * ```typescript
   * const results = await client.insights.query(
   *   ['/aws/lambda/my-function'],
   *   'fields @timestamp, @message | filter @message like /ERROR/',
   *   startTime,
   *   endTime
   * );
   * ```
   */
  get insights(): InsightsService {
    if (!this._insightsService) {
      const { InsightsServiceImpl } = require("./services/insights");
      this._insightsService = new InsightsServiceImpl(this._config);
    }
    return this._insightsService;
  }

  /**
   * Log groups service for managing log groups.
   *
   * Lazy-loaded on first access.
   *
   * @returns Log groups service instance
   *
   * @example
   * ```typescript
   * await client.logGroups.create('/my-app/logs');
   * const groups = await client.logGroups.describe();
   * ```
   */
  get logGroups(): LogGroupsService {
    if (!this._logGroupsService) {
      const { DefaultLogGroupsService } = require("./services/logGroups");
      this._logGroupsService = new DefaultLogGroupsService(this._config);
    }
    return this._logGroupsService;
  }

  /**
   * Log streams service for managing log streams.
   *
   * Lazy-loaded on first access.
   *
   * @returns Log streams service instance
   *
   * @example
   * ```typescript
   * await client.logStreams.create('/my-app/logs', 'stream-1');
   * const streams = await client.logStreams.describe('/my-app/logs');
   * ```
   */
  get logStreams(): LogStreamsService {
    if (!this._logStreamsService) {
      const { DefaultLogStreamsService } = require("./services/logStreams");
      this._logStreamsService = new DefaultLogStreamsService(this._config);
    }
    return this._logStreamsService;
  }

  /**
   * Retention service for managing log group retention policies.
   *
   * Lazy-loaded on first access.
   *
   * @returns Retention service instance
   *
   * @example
   * ```typescript
   * await client.retention.put('/my-app/logs', 7);
   * await client.retention.delete('/my-app/logs');
   * ```
   */
  get retention(): RetentionService {
    if (!this._retentionService) {
      const { DefaultRetentionService } = require("./services/retention");
      this._retentionService = new DefaultRetentionService(this._config);
    }
    return this._retentionService;
  }

  /**
   * Batch buffer for efficient log event batching.
   *
   * Lazy-loaded on first access.
   *
   * @returns Batch buffer instance
   *
   * @example
   * ```typescript
   * await client.batchBuffer.add('/my-logs', 'stream-1', event);
   * await client.batchBuffer.flush();
   * ```
   */
  get batchBuffer(): BatchBuffer {
    if (!this._batchBuffer) {
      const { BatchBufferImpl } = require("./batch/buffer");
      this._batchBuffer = new BatchBufferImpl(this._config, this.logEvents);
    }
    return this._batchBuffer;
  }

  /**
   * Correlation engine for cross-service log correlation.
   *
   * Lazy-loaded on first access.
   *
   * @returns Correlation engine instance
   *
   * @example
   * ```typescript
   * const result = await client.correlation.correlateByTrace(
   *   ['/app/api', '/app/auth'],
   *   'trace-123',
   *   startTime,
   *   endTime
   * );
   * ```
   */
  get correlation(): CorrelationEngine {
    if (!this._correlationEngine) {
      const { CorrelationEngine } = require("./correlation/engine");
      this._correlationEngine = new CorrelationEngine(this._config, this.insights);
    }
    return this._correlationEngine;
  }

  /**
   * Put log events to a log stream.
   *
   * Convenience method that delegates to the log events service.
   *
   * @param logGroup - Log group name
   * @param logStream - Log stream name
   * @param events - Log events to put
   * @returns Put log events response
   *
   * @example
   * ```typescript
   * const events = [
   *   { timestamp: Date.now(), message: 'User logged in' },
   *   { timestamp: Date.now(), message: 'Request processed' }
   * ];
   *
   * const response = await client.putLogEvents(
   *   '/aws/lambda/my-function',
   *   'stream-1',
   *   events
   * );
   * ```
   */
  async putLogEvents(
    logGroup: string,
    logStream: string,
    events: InputLogEvent[]
  ): Promise<PutLogEventsResponse> {
    return this.logEvents.put(logGroup, logStream, events);
  }

  /**
   * Put a structured log event.
   *
   * Convenience method that delegates to the log events service.
   *
   * @param logGroup - Log group name
   * @param logStream - Log stream name
   * @param event - Structured log event
   *
   * @example
   * ```typescript
   * const event = {
   *   timestamp: Date.now(),
   *   level: 'INFO' as const,
   *   message: 'User login',
   *   traceId: 'trace-123',
   *   fields: { userId: 'user-456' }
   * };
   *
   * await client.putStructuredLog('/my-app/logs', 'stream-1', event);
   * ```
   */
  async putStructuredLog(
    logGroup: string,
    logStream: string,
    event: StructuredLogEvent
  ): Promise<void> {
    return this.logEvents.putStructured(logGroup, logStream, event);
  }

  /**
   * Filter log events.
   *
   * Convenience method that delegates to the log events service.
   *
   * @param logGroup - Log group name
   * @param filterPattern - Optional filter pattern
   * @param startTime - Start time in milliseconds since epoch
   * @param endTime - End time in milliseconds since epoch
   * @returns Filtered log events
   *
   * @example
   * ```typescript
   * const events = await client.filterLogEvents(
   *   '/aws/lambda/my-function',
   *   'ERROR',
   *   Date.now() - 3600000, // 1 hour ago
   *   Date.now()
   * );
   *
   * for (const event of events) {
   *   console.log(event.message);
   * }
   * ```
   */
  async filterLogEvents(
    logGroup: string,
    filterPattern?: string,
    startTime?: number,
    endTime?: number
  ): Promise<FilteredLogEvent[]> {
    return this.logEvents.filter(logGroup, {
      filterPattern,
      startTime,
      endTime,
    });
  }

  /**
   * Run a CloudWatch Logs Insights query.
   *
   * Convenience method that delegates to the insights service.
   *
   * @param logGroups - Log group names to query
   * @param queryString - Insights query string
   * @param startTime - Start time in seconds since epoch
   * @param endTime - End time in seconds since epoch
   * @returns Query results
   *
   * @example
   * ```typescript
   * const results = await client.query(
   *   ['/aws/lambda/my-function', '/aws/ecs/my-service'],
   *   'fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc',
   *   Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
   *   Math.floor(Date.now() / 1000)
   * );
   *
   * for (const row of results) {
   *   console.log(row);
   * }
   * ```
   */
  async query(
    logGroups: string[],
    queryString: string,
    startTime: number,
    endTime: number
  ): Promise<QueryResultRow[]> {
    return this.insights.query(logGroups, queryString, startTime, endTime);
  }

  /**
   * Query logs by trace ID.
   *
   * Convenience method that delegates to the correlation engine.
   *
   * @param logGroups - Log group names to search
   * @param traceId - Trace ID to search for
   * @param startTime - Start time in seconds since epoch
   * @param endTime - End time in seconds since epoch
   * @returns Correlation result
   *
   * @example
   * ```typescript
   * const result = await client.queryByTraceId(
   *   ['/aws/lambda/my-function', '/aws/ecs/my-service'],
   *   'trace-abc-123',
   *   Math.floor(Date.now() / 1000) - 3600,
   *   Math.floor(Date.now() / 1000)
   * );
   *
   * console.log(`Found ${result.events.length} events for trace ${result.correlationId}`);
   * ```
   */
  async queryByTraceId(
    logGroups: string[],
    traceId: string,
    startTime: number,
    endTime: number
  ): Promise<CorrelationResult> {
    return this.correlation.correlateByTrace(logGroups, traceId, startTime, endTime);
  }

  /**
   * Create a log group.
   *
   * Convenience method that delegates to the log groups service.
   *
   * @param name - Log group name
   * @param options - Optional creation options (KMS key, tags)
   *
   * @example
   * ```typescript
   * await client.createLogGroup('/my-app/logs', {
   *   kmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/...',
   *   tags: { Environment: 'production', Application: 'my-app' }
   * });
   * ```
   */
  async createLogGroup(
    name: string,
    options?: { kmsKeyId?: string; tags?: Record<string, string> }
  ): Promise<void> {
    return this.logGroups.create(name, options);
  }

  /**
   * Describe log groups.
   *
   * Convenience method that delegates to the log groups service.
   *
   * @param prefix - Optional log group name prefix filter
   * @returns Log groups
   *
   * @example
   * ```typescript
   * const groups = await client.describeLogGroups('/aws/lambda/');
   * for (const group of groups) {
   *   console.log(group.logGroupName, group.storedBytes);
   * }
   * ```
   */
  async describeLogGroups(prefix?: string): Promise<LogGroup[]> {
    return this.logGroups.describe({ logGroupNamePrefix: prefix });
  }

  /**
   * Delete a log group.
   *
   * Convenience method that delegates to the log groups service.
   *
   * @param name - Log group name
   *
   * @example
   * ```typescript
   * await client.deleteLogGroup('/my-app/old-logs');
   * ```
   */
  async deleteLogGroup(name: string): Promise<void> {
    return this.logGroups.delete(name);
  }

  /**
   * Create a log stream.
   *
   * Convenience method that delegates to the log streams service.
   *
   * @param logGroup - Log group name
   * @param logStream - Log stream name
   *
   * @example
   * ```typescript
   * await client.createLogStream('/my-app/logs', 'stream-1');
   * ```
   */
  async createLogStream(logGroup: string, logStream: string): Promise<void> {
    return this.logStreams.create(logGroup, logStream);
  }

  /**
   * Describe log streams.
   *
   * Convenience method that delegates to the log streams service.
   *
   * @param logGroup - Log group name
   * @param prefix - Optional log stream name prefix filter
   * @returns Log streams
   *
   * @example
   * ```typescript
   * const streams = await client.describeLogStreams('/my-app/logs', 'production/');
   * for (const stream of streams) {
   *   console.log(stream.logStreamName, stream.lastEventTime);
   * }
   * ```
   */
  async describeLogStreams(logGroup: string, prefix?: string): Promise<LogStream[]> {
    return this.logStreams.describe(logGroup, { logStreamNamePrefix: prefix });
  }

  /**
   * Set retention policy for a log group.
   *
   * Convenience method that delegates to the retention service.
   *
   * @param logGroup - Log group name
   * @param retentionDays - Retention period in days
   *
   * @example
   * ```typescript
   * await client.setRetention('/my-app/logs', 7); // 7 days
   * ```
   */
  async setRetention(logGroup: string, retentionDays: RetentionDays): Promise<void> {
    return this.retention.put(logGroup, retentionDays);
  }

  /**
   * Delete retention policy for a log group.
   *
   * Convenience method that delegates to the retention service.
   *
   * @param logGroup - Log group name
   *
   * @example
   * ```typescript
   * await client.deleteRetention('/my-app/logs'); // Never expire
   * ```
   */
  async deleteRetention(logGroup: string): Promise<void> {
    return this.retention.delete(logGroup);
  }

  /**
   * Create a query builder for fluent query construction.
   *
   * @returns Query builder instance
   *
   * @example
   * ```typescript
   * const results = await client.queryBuilder()
   *   .logGroups(['/aws/lambda/my-function'])
   *   .query('fields @timestamp, @message | filter @message like /ERROR/')
   *   .lastHours(24)
   *   .execute();
   * ```
   */
  queryBuilder(): QueryBuilder {
    const { QueryBuilder } = require("./builders/query");
    return new QueryBuilder(this);
  }

  /**
   * Create a filter builder for fluent filter construction.
   *
   * @returns Filter builder instance
   *
   * @example
   * ```typescript
   * const events = await client.filterBuilder()
   *   .logGroup('/aws/lambda/my-function')
   *   .filterPattern('ERROR')
   *   .lastHours(1)
   *   .execute();
   * ```
   */
  filterBuilder(): FilterBuilder {
    const { FilterBuilder } = require("./builders/filter");
    return new FilterBuilder(this);
  }

  /**
   * Create a log event builder for fluent structured log construction.
   *
   * @returns Log event builder instance
   *
   * @example
   * ```typescript
   * const event = client.logEventBuilder()
   *   .message('User login successful')
   *   .info()
   *   .traceId('trace-123')
   *   .field('userId', 'user-456')
   *   .build();
   *
   * await client.putStructuredLog('/my-app/logs', 'stream-1', event);
   * ```
   */
  logEventBuilder(): LogEventBuilder {
    const { LogEventBuilder } = require("./builders/logEvent");
    return new LogEventBuilder();
  }

  /**
   * Gracefully shutdown the client.
   *
   * Flushes any pending batched log events and cleans up resources.
   *
   * @example
   * ```typescript
   * await client.shutdown();
   * ```
   */
  async shutdown(): Promise<void> {
    if (this._batchBuffer) {
      await this._batchBuffer.flush();
      await this._batchBuffer.stop();
    }
  }

  /**
   * Create a new CloudWatch Logs client builder.
   *
   * @returns New configuration builder
   *
   * @example
   * ```typescript
   * const client = await CloudWatchLogsClient.builder()
   *   .region('us-east-1')
   *   .credentials('AKIAIOSFODNN7EXAMPLE', 'wJalrXUtn...')
   *   .timeout(60000)
   *   .build();
   * ```
   */
  static builder(): CloudWatchLogsClientBuilder {
    return new CloudWatchLogsClientBuilder();
  }

  /**
   * Create a client from environment variables.
   *
   * Reads configuration from:
   * - AWS_REGION or AWS_DEFAULT_REGION
   * - AWS_ENDPOINT_URL_LOGS or AWS_ENDPOINT_URL
   * - Credentials from default credential chain
   *
   * @returns New CloudWatch Logs client instance
   *
   * @example
   * ```typescript
   * const client = await CloudWatchLogsClient.fromEnv();
   * ```
   */
  static async fromEnv(): Promise<CloudWatchLogsClient> {
    const configBuilder = new CloudWatchLogsConfigBuilder()
      .fromEnv()
      .credentialsProvider(defaultProvider());

    const config = configBuilder.build();
    return new CloudWatchLogsClient(config);
  }
}

/**
 * CloudWatch Logs client builder.
 *
 * Provides a fluent API for constructing CloudWatch Logs clients.
 * Delegates to CloudWatchLogsConfigBuilder internally.
 */
export class CloudWatchLogsClientBuilder {
  private configBuilder: CloudWatchLogsConfigBuilder;

  /**
   * Create a new client builder.
   */
  constructor() {
    this.configBuilder = configBuilder();
  }

  /**
   * Set the AWS region.
   *
   * @param region - AWS region code
   * @returns This builder for chaining
   */
  region(region: string): this {
    this.configBuilder.region(region);
    return this;
  }

  /**
   * Set a custom endpoint URL.
   *
   * @param endpoint - Endpoint URL
   * @returns This builder for chaining
   */
  endpoint(endpoint: string): this {
    this.configBuilder.endpoint(endpoint);
    return this;
  }

  /**
   * Set static credentials.
   *
   * @param accessKey - AWS access key ID
   * @param secretKey - AWS secret access key
   * @param sessionToken - Optional session token
   * @returns This builder for chaining
   */
  credentials(accessKey: string, secretKey: string, sessionToken?: string): this {
    this.configBuilder.credentials(accessKey, secretKey, sessionToken);
    return this;
  }

  /**
   * Set a custom credentials provider.
   *
   * @param provider - Credentials provider
   * @returns This builder for chaining
   */
  credentialsProvider(provider: any): this {
    this.configBuilder.credentialsProvider(provider);
    return this;
  }

  /**
   * Set request timeout.
   *
   * @param ms - Timeout in milliseconds
   * @returns This builder for chaining
   */
  timeout(ms: number): this {
    this.configBuilder.timeout(ms);
    return this;
  }

  /**
   * Set connection timeout.
   *
   * @param ms - Connection timeout in milliseconds
   * @returns This builder for chaining
   */
  connectTimeout(ms: number): this {
    this.configBuilder.connectTimeout(ms);
    return this;
  }

  /**
   * Set maximum retry attempts.
   *
   * @param n - Maximum retries
   * @returns This builder for chaining
   */
  maxRetries(n: number): this {
    this.configBuilder.maxRetries(n);
    return this;
  }

  /**
   * Set rate limiting configuration.
   *
   * @param config - Rate limit config
   * @returns This builder for chaining
   */
  rateLimit(config: any): this {
    this.configBuilder.rateLimit(config);
    return this;
  }

  /**
   * Set batch configuration.
   *
   * @param config - Batch config
   * @returns This builder for chaining
   */
  batchConfig(config: any): this {
    this.configBuilder.batchConfig(config);
    return this;
  }

  /**
   * Set default log group.
   *
   * @param name - Log group name
   * @returns This builder for chaining
   */
  defaultLogGroup(name: string): this {
    this.configBuilder.defaultLogGroup(name);
    return this;
  }

  /**
   * Set default log stream.
   *
   * @param name - Log stream name
   * @returns This builder for chaining
   */
  defaultLogStream(name: string): this {
    this.configBuilder.defaultLogStream(name);
    return this;
  }

  /**
   * Load configuration from environment.
   *
   * @returns This builder for chaining
   */
  fromEnv(): this {
    this.configBuilder.fromEnv();
    return this;
  }

  /**
   * Build the CloudWatch Logs client.
   *
   * @returns New CloudWatch Logs client instance
   */
  async build(): Promise<CloudWatchLogsClient> {
    const config = this.configBuilder.build();
    return new CloudWatchLogsClient(config);
  }
}

/**
 * Create a new CloudWatch Logs client builder.
 *
 * @returns New client builder
 */
export function clientBuilder(): CloudWatchLogsClientBuilder {
  return new CloudWatchLogsClientBuilder();
}

/**
 * Create a CloudWatch Logs client from environment variables.
 *
 * @returns New CloudWatch Logs client instance
 */
export async function createClientFromEnv(): Promise<CloudWatchLogsClient> {
  return CloudWatchLogsClient.fromEnv();
}

/**
 * Create a CloudWatch Logs client with explicit configuration.
 *
 * @param config - CloudWatch Logs configuration
 * @returns New CloudWatch Logs client instance
 */
export function createClient(config: CloudWatchLogsConfig): CloudWatchLogsClient {
  return new CloudWatchLogsClient(config);
}
