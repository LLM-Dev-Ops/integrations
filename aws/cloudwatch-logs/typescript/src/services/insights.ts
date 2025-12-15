/**
 * CloudWatch Logs Insights Service
 *
 * Provides methods for executing CloudWatch Logs Insights queries including:
 * - Starting queries
 * - Retrieving query results with polling
 * - Stopping running queries
 * - Correlation queries by trace ID and request ID
 *
 * @module services/insights
 */

import type {
  StartQueryRequest,
  GetQueryResultsRequest,
  StopQueryRequest,
} from '../types/requests.js';
import type {
  StartQueryResponse,
  GetQueryResultsResponse,
} from '../types/responses.js';
import type {
  QueryResults,
  QueryStatus,
  QueryResultRow,
  ResultField,
} from '../types/query.js';
import type {
  TimeRange,
  CorrelatedLogEvent,
  LogLevel,
} from '../types/structured.js';
import { CloudWatchLogsError, timeoutError, validationError } from '../error/index.js';

/**
 * Interface for CloudWatch Logs Insights operations.
 *
 * Provides methods for executing Insights queries and retrieving results.
 */
export interface InsightsService {
  /**
   * Start a CloudWatch Logs Insights query.
   *
   * Returns immediately with a query ID that can be used to retrieve results.
   *
   * @param request - Query request parameters
   * @returns Promise resolving to the query ID
   * @throws {CloudWatchLogsError} On validation or API errors
   *
   * @example
   * ```typescript
   * const response = await insights.startQuery({
   *   logGroupNames: ['/aws/lambda/my-function'],
   *   startTime: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
   *   endTime: Math.floor(Date.now() / 1000),
   *   queryString: 'fields @timestamp, @message | sort @timestamp desc | limit 20'
   * });
   * console.log(`Query started: ${response.queryId}`);
   * ```
   */
  startQuery(request: StartQueryRequest): Promise<StartQueryResponse>;

  /**
   * Get the current results of a CloudWatch Logs Insights query.
   *
   * Returns the current status and any available results. Query may still be running.
   *
   * @param queryId - The ID of the query to retrieve results for
   * @returns Promise resolving to query results and status
   * @throws {CloudWatchLogsError} On API errors
   *
   * @example
   * ```typescript
   * const results = await insights.getResults(queryId);
   * if (results.status === 'Complete') {
   *   console.log(`Found ${results.results?.length} results`);
   * } else if (results.status === 'Running') {
   *   console.log('Query still running...');
   * }
   * ```
   */
  getResults(queryId: string): Promise<GetQueryResultsResponse>;

  /**
   * Stop a running CloudWatch Logs Insights query.
   *
   * Cancels a query that is currently running or scheduled.
   *
   * @param queryId - The ID of the query to stop
   * @returns Promise that resolves when the query is stopped
   * @throws {CloudWatchLogsError} On API errors
   *
   * @example
   * ```typescript
   * await insights.stopQuery(queryId);
   * console.log('Query stopped');
   * ```
   */
  stopQuery(queryId: string): Promise<void>;

  /**
   * Execute a query and wait for results (convenience method).
   *
   * Starts a query and polls for completion, returning the final results.
   * Automatically handles retries and polling intervals.
   *
   * @param request - Query request parameters
   * @param timeoutMs - Maximum time to wait for results in milliseconds
   * @returns Promise resolving to the complete query results
   * @throws {CloudWatchLogsError} On timeout, cancellation, or API errors
   *
   * @example
   * ```typescript
   * const results = await insights.query({
   *   logGroupNames: ['/aws/lambda/my-function'],
   *   startTime: Math.floor(Date.now() / 1000) - 3600,
   *   endTime: Math.floor(Date.now() / 1000),
   *   queryString: 'fields @timestamp, @message | filter @message like /ERROR/'
   * }, 60000); // 60 second timeout
   *
   * console.log(`Query found ${results.results?.length} matching events`);
   * ```
   */
  query(request: StartQueryRequest, timeoutMs: number): Promise<QueryResults>;

  /**
   * Query logs by trace ID for distributed tracing correlation.
   *
   * Finds all log events across specified log groups that contain the given trace ID.
   * Results are sorted by timestamp in ascending order.
   *
   * @param logGroups - Array of log group names to search
   * @param traceId - The trace ID to search for
   * @param timeRange - Time range to search within
   * @returns Promise resolving to array of correlated log events
   * @throws {CloudWatchLogsError} On validation or API errors
   *
   * @example
   * ```typescript
   * const events = await insights.queryByTraceId(
   *   ['/aws/lambda/service-a', '/aws/lambda/service-b'],
   *   'trace-123-abc-456',
   *   {
   *     start: new Date(Date.now() - 3600000), // 1 hour ago
   *     end: new Date()
   *   }
   * );
   *
   * for (const event of events) {
   *   console.log(`[${event.service}] ${event.timestamp}: ${event.message}`);
   * }
   * ```
   */
  queryByTraceId(
    logGroups: string[],
    traceId: string,
    timeRange: TimeRange
  ): Promise<CorrelatedLogEvent[]>;

  /**
   * Query logs by request ID for request-level correlation.
   *
   * Finds all log events across specified log groups that contain the given request ID.
   * Results are sorted by timestamp in ascending order.
   *
   * @param logGroups - Array of log group names to search
   * @param requestId - The request ID to search for
   * @param timeRange - Time range to search within
   * @returns Promise resolving to array of correlated log events
   * @throws {CloudWatchLogsError} On validation or API errors
   *
   * @example
   * ```typescript
   * const events = await insights.queryByRequestId(
   *   ['/aws/lambda/my-function'],
   *   'req-abc-123',
   *   {
   *     start: new Date(Date.now() - 1800000), // 30 minutes ago
   *     end: new Date()
   *   }
   * );
   *
   * console.log(`Found ${events.length} log events for request ${requestId}`);
   * ```
   */
  queryByRequestId(
    logGroups: string[],
    requestId: string,
    timeRange: TimeRange
  ): Promise<CorrelatedLogEvent[]>;
}

/**
 * Internal interface for making API calls.
 * This will be implemented by the HTTP client.
 */
export interface InsightsApiClient {
  startQuery(request: StartQueryRequest): Promise<StartQueryResponse>;
  getQueryResults(request: GetQueryResultsRequest): Promise<GetQueryResultsResponse>;
  stopQuery(request: StopQueryRequest): Promise<void>;
}

/**
 * Implementation of CloudWatch Logs Insights service.
 *
 * Provides comprehensive query functionality with automatic polling,
 * correlation support, and robust error handling.
 */
export class InsightsServiceImpl implements InsightsService {
  private readonly client: InsightsApiClient;
  private readonly defaultPollInterval: number = 1000; // 1 second
  private readonly maxPollInterval: number = 5000; // 5 seconds

  /**
   * Create a new Insights service instance.
   *
   * @param client - API client for making CloudWatch Logs API calls
   */
  constructor(client: InsightsApiClient) {
    this.client = client;
  }

  /**
   * Start a CloudWatch Logs Insights query.
   */
  async startQuery(request: StartQueryRequest): Promise<StartQueryResponse> {
    // Validate request
    this.validateStartQueryRequest(request);

    return this.client.startQuery(request);
  }

  /**
   * Get query results for a running or completed query.
   */
  async getResults(queryId: string): Promise<GetQueryResultsResponse> {
    if (!queryId) {
      throw validationError('Query ID cannot be empty');
    }

    return this.client.getQueryResults({ queryId });
  }

  /**
   * Stop a running query.
   */
  async stopQuery(queryId: string): Promise<void> {
    if (!queryId) {
      throw validationError('Query ID cannot be empty');
    }

    return this.client.stopQuery({ queryId });
  }

  /**
   * Execute a query and poll for results until completion.
   */
  async query(request: StartQueryRequest, timeoutMs: number): Promise<QueryResults> {
    if (timeoutMs <= 0) {
      throw validationError('Timeout must be greater than 0');
    }

    // Start the query
    const startResponse = await this.startQuery(request);
    const queryId = startResponse.queryId;

    if (!queryId) {
      throw new CloudWatchLogsError(
        'Query ID not returned from StartQuery',
        'QUERY_ERROR',
        false
      );
    }

    // Poll for results
    const startTime = Date.now();
    let pollInterval = this.defaultPollInterval;

    while (true) {
      // Check timeout
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        // Try to stop the query before throwing timeout error
        try {
          await this.stopQuery(queryId);
        } catch {
          // Ignore errors when stopping - we're already timing out
        }
        throw timeoutError(
          `Query timed out after ${timeoutMs}ms (query ID: ${queryId})`
        );
      }

      // Get current results
      const results = await this.getResults(queryId);

      // Check status
      const status = results.status || 'Unknown';

      if (status === 'Complete') {
        return results;
      } else if (status === 'Failed') {
        throw new CloudWatchLogsError(
          `Query failed (query ID: ${queryId})`,
          'QUERY_ERROR',
          false
        );
      } else if (status === 'Cancelled') {
        throw new CloudWatchLogsError(
          `Query was cancelled (query ID: ${queryId})`,
          'QUERY_ERROR',
          false
        );
      } else if (status === 'Timeout') {
        throw new CloudWatchLogsError(
          `Query timed out on server (query ID: ${queryId})`,
          'QUERY_ERROR',
          false
        );
      } else if (status === 'Unknown') {
        throw new CloudWatchLogsError(
          `Query status is unknown (query ID: ${queryId})`,
          'QUERY_ERROR',
          false
        );
      }

      // Status is 'Scheduled' or 'Running' - continue polling
      // Wait before next poll (exponential backoff up to max)
      await this.sleep(Math.min(pollInterval, timeoutMs - elapsed));
      pollInterval = Math.min(pollInterval * 1.5, this.maxPollInterval);
    }
  }

  /**
   * Query logs by trace ID for distributed tracing correlation.
   */
  async queryByTraceId(
    logGroups: string[],
    traceId: string,
    timeRange: TimeRange
  ): Promise<CorrelatedLogEvent[]> {
    if (logGroups.length === 0) {
      throw validationError('At least one log group must be specified');
    }

    if (!traceId) {
      throw validationError('Trace ID cannot be empty');
    }

    this.validateTimeRange(timeRange);

    // Build CloudWatch Logs Insights query for trace ID
    const queryString = `fields @timestamp, @message, @logStream | filter trace_id = "${this.escapeQueryString(traceId)}" | sort @timestamp asc`;

    // Execute query with 60 second timeout
    const results = await this.query(
      {
        logGroupNames: logGroups,
        startTime: Math.floor(timeRange.start.getTime() / 1000),
        endTime: Math.floor(timeRange.end.getTime() / 1000),
        queryString,
        limit: 10000,
      },
      60000
    );

    // Parse results into CorrelatedLogEvent objects
    return this.parseCorrelatedEvents(results, logGroups[0]);
  }

  /**
   * Query logs by request ID for request-level correlation.
   */
  async queryByRequestId(
    logGroups: string[],
    requestId: string,
    timeRange: TimeRange
  ): Promise<CorrelatedLogEvent[]> {
    if (logGroups.length === 0) {
      throw validationError('At least one log group must be specified');
    }

    if (!requestId) {
      throw validationError('Request ID cannot be empty');
    }

    this.validateTimeRange(timeRange);

    // Build CloudWatch Logs Insights query for request ID
    const queryString = `fields @timestamp, @message, @logStream | filter request_id = "${this.escapeQueryString(requestId)}" | sort @timestamp asc`;

    // Execute query with 60 second timeout
    const results = await this.query(
      {
        logGroupNames: logGroups,
        startTime: Math.floor(timeRange.start.getTime() / 1000),
        endTime: Math.floor(timeRange.end.getTime() / 1000),
        queryString,
        limit: 10000,
      },
      60000
    );

    // Parse results into CorrelatedLogEvent objects
    return this.parseCorrelatedEvents(results, logGroups[0]);
  }

  /**
   * Validate StartQuery request.
   */
  private validateStartQueryRequest(request: StartQueryRequest): void {
    if (!request.logGroupNames && !request.logGroupIdentifiers) {
      throw validationError(
        'Either logGroupNames or logGroupIdentifiers must be specified'
      );
    }

    if (request.logGroupNames && request.logGroupNames.length === 0) {
      throw validationError('At least one log group must be specified');
    }

    if (request.logGroupNames && request.logGroupNames.length > 50) {
      throw validationError('Maximum 50 log groups allowed per query');
    }

    if (!request.queryString) {
      throw validationError('Query string cannot be empty');
    }

    if (request.startTime >= request.endTime) {
      throw validationError('Start time must be before end time');
    }

    if (request.limit && (request.limit < 1 || request.limit > 10000)) {
      throw validationError('Limit must be between 1 and 10000');
    }
  }

  /**
   * Validate time range.
   */
  private validateTimeRange(timeRange: TimeRange): void {
    if (!timeRange.start || !timeRange.end) {
      throw validationError('Time range must have both start and end times');
    }

    if (timeRange.start >= timeRange.end) {
      throw validationError('Start time must be before end time');
    }
  }

  /**
   * Parse query results into CorrelatedLogEvent objects.
   */
  private parseCorrelatedEvents(
    results: QueryResults,
    defaultLogGroup: string
  ): CorrelatedLogEvent[] {
    if (!results.results || results.results.length === 0) {
      return [];
    }

    const events: CorrelatedLogEvent[] = [];

    for (const row of results.results) {
      try {
        const event = this.parseResultRow(row, defaultLogGroup);
        if (event) {
          events.push(event);
        }
      } catch (error) {
        // Skip rows that can't be parsed
        continue;
      }
    }

    return events;
  }

  /**
   * Parse a single query result row into a CorrelatedLogEvent.
   *
   * CloudWatch Logs Insights returns results as an array of arrays of {field, value} objects.
   */
  private parseResultRow(
    row: QueryResultRow,
    defaultLogGroup: string
  ): CorrelatedLogEvent | null {
    // Convert array of ResultField objects into a map
    const fieldMap = new Map<string, string>();
    for (const field of row) {
      if (field.field && field.value !== undefined) {
        fieldMap.set(field.field, field.value);
      }
    }

    // Extract required fields
    const timestampStr = fieldMap.get('@timestamp');
    const message = fieldMap.get('@message');

    if (!timestampStr || !message) {
      return null; // Skip incomplete rows
    }

    // Parse timestamp (ISO 8601 format from CloudWatch Logs Insights)
    const timestamp = new Date(timestampStr);
    if (isNaN(timestamp.getTime())) {
      return null; // Skip invalid timestamps
    }

    // Extract log stream (may be from @logStream field or logStream field)
    const logStream =
      fieldMap.get('@logStream') || fieldMap.get('logStream') || 'unknown';

    // Try to parse message as JSON to extract structured fields
    let parsedMessage: any = null;
    let fields: Record<string, unknown> = {};

    try {
      parsedMessage = JSON.parse(message);
      if (typeof parsedMessage === 'object' && parsedMessage !== null) {
        fields = { ...parsedMessage };
      }
    } catch {
      // Message is not JSON, that's fine
    }

    // Extract correlation IDs from parsed message or direct fields
    const traceId =
      fieldMap.get('trace_id') ||
      fieldMap.get('traceId') ||
      (parsedMessage?.trace_id) ||
      (parsedMessage?.traceId) ||
      undefined;

    const requestId =
      fieldMap.get('request_id') ||
      fieldMap.get('requestId') ||
      (parsedMessage?.request_id) ||
      (parsedMessage?.requestId) ||
      undefined;

    const spanId =
      fieldMap.get('span_id') ||
      fieldMap.get('spanId') ||
      (parsedMessage?.span_id) ||
      (parsedMessage?.spanId) ||
      undefined;

    const service =
      fieldMap.get('service') ||
      (parsedMessage?.service) ||
      undefined;

    const level =
      fieldMap.get('level') ||
      (parsedMessage?.level) ||
      undefined;

    // Validate level if present
    let logLevel: LogLevel | undefined;
    if (level) {
      const normalizedLevel = level.toLowerCase();
      if (
        normalizedLevel === 'trace' ||
        normalizedLevel === 'debug' ||
        normalizedLevel === 'info' ||
        normalizedLevel === 'warn' ||
        normalizedLevel === 'error' ||
        normalizedLevel === 'fatal'
      ) {
        logLevel = normalizedLevel as LogLevel;
      }
    }

    // Build correlated event
    const event: CorrelatedLogEvent = {
      timestamp,
      message,
      logGroup: defaultLogGroup,
      logStream,
      traceId,
      requestId,
      spanId,
      service,
      level: logLevel,
      fields,
    };

    return event;
  }

  /**
   * Escape special characters in query strings.
   */
  private escapeQueryString(str: string): string {
    // Escape double quotes and backslashes for CloudWatch Logs Insights query syntax
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  /**
   * Sleep for a specified number of milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
