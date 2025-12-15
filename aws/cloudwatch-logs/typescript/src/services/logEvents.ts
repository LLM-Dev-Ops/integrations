/**
 * Log Events Service for AWS CloudWatch Logs
 *
 * Provides operations for putting, getting, and filtering log events.
 * Implements the SPARC specification section 4.1 and 5.2.2.
 *
 * @module services/logEvents
 */

import { BaseService } from './base.js';
import type { CloudWatchLogsConfig } from '../config/index.js';
import type { AwsCredentials } from '../credentials/types.js';
import type {
  PutLogEventsRequest,
  PutLogEventsResponse,
  GetLogEventsRequest,
  GetLogEventsResponse,
  FilterLogEventsRequest,
  FilterLogEventsResponse,
} from '../types/index.js';
import type {
  StructuredLogEvent,
  FilteredLogEvent,
} from '../types/index.js';
import { validationError } from '../error/index.js';

/**
 * Service interface for log event operations.
 *
 * Provides methods for:
 * - Putting log events to streams (batch and structured)
 * - Getting log events from streams
 * - Filtering log events across streams
 * - Auto-pagination of filter results
 */
export interface LogEventsService {
  /**
   * Put log events to a stream (batch).
   *
   * Uploads multiple log events to a log stream in a single batch.
   * CloudWatch Logs limits: max 10,000 events per batch, max 1 MB per batch.
   *
   * @param request - Put log events request
   * @returns Promise resolving to put response with sequence token and rejection info
   * @throws {CloudWatchLogsError} On validation or API errors
   *
   * @example
   * ```typescript
   * const response = await service.put({
   *   logGroupName: '/aws/lambda/my-function',
   *   logStreamName: '2024/12/15/[$LATEST]abc123',
   *   logEvents: [
   *     { timestamp: Date.now(), message: 'Event 1' },
   *     { timestamp: Date.now(), message: 'Event 2' }
   *   ]
   * });
   * ```
   */
  put(request: PutLogEventsRequest): Promise<PutLogEventsResponse>;

  /**
   * Put a single structured log event.
   *
   * Convenience method that takes a StructuredLogEvent, serializes it to JSON,
   * and calls put() with the serialized event.
   *
   * @param logGroup - Log group name
   * @param logStream - Log stream name
   * @param event - Structured log event with correlation fields
   * @returns Promise resolving when the event is put
   * @throws {CloudWatchLogsError} On validation or API errors
   *
   * @example
   * ```typescript
   * await service.putStructured(
   *   '/aws/lambda/my-function',
   *   '2024/12/15/[$LATEST]abc123',
   *   {
   *     level: 'info',
   *     message: 'Request processed',
   *     traceId: 'trace-123',
   *     requestId: 'req-456',
   *     fields: { duration: 123, status: 200 }
   *   }
   * );
   * ```
   */
  putStructured(
    logGroup: string,
    logStream: string,
    event: StructuredLogEvent
  ): Promise<void>;

  /**
   * Get log events from a stream.
   *
   * Retrieves log events from a specific log stream, optionally filtered by time range.
   * Supports pagination with nextToken.
   *
   * @param request - Get log events request
   * @returns Promise resolving to log events and pagination tokens
   * @throws {CloudWatchLogsError} On API errors
   *
   * @example
   * ```typescript
   * const response = await service.get({
   *   logGroupName: '/aws/lambda/my-function',
   *   logStreamName: '2024/12/15/[$LATEST]abc123',
   *   startTime: Date.now() - 3600000, // 1 hour ago
   *   limit: 100,
   *   startFromHead: true
   * });
   * ```
   */
  get(request: GetLogEventsRequest): Promise<GetLogEventsResponse>;

  /**
   * Filter log events across streams.
   *
   * Searches log events across multiple log streams in a log group.
   * Supports CloudWatch Logs filter pattern syntax.
   *
   * @param request - Filter log events request
   * @returns Promise resolving to matched events and pagination token
   * @throws {CloudWatchLogsError} On API errors
   *
   * @example
   * ```typescript
   * const response = await service.filter({
   *   logGroupName: '/aws/lambda/my-function',
   *   filterPattern: '[level=ERROR]',
   *   startTime: Date.now() - 3600000,
   *   limit: 100
   * });
   * ```
   */
  filter(request: FilterLogEventsRequest): Promise<FilterLogEventsResponse>;

  /**
   * Get all events matching filter (auto-pagination).
   *
   * Async generator that automatically handles pagination, yielding all
   * matching log events until no more results are available.
   *
   * @param request - Filter log events request
   * @returns AsyncIterable of filtered log events
   * @throws {CloudWatchLogsError} On API errors
   *
   * @example
   * ```typescript
   * for await (const event of service.filterAll({
   *   logGroupName: '/aws/lambda/my-function',
   *   filterPattern: '[level=ERROR]',
   *   startTime: Date.now() - 3600000
   * })) {
   *   console.log(event.message);
   * }
   * ```
   */
  filterAll(request: FilterLogEventsRequest): AsyncIterable<FilteredLogEvent>;
}

/**
 * Implementation of the LogEventsService.
 *
 * Handles all log event operations for CloudWatch Logs, including
 * batching, validation, and structured logging.
 */
export class LogEventsServiceImpl extends BaseService implements LogEventsService {
  /**
   * Maximum message size for a single log event (256 KB).
   *
   * CloudWatch Logs rejects events with messages larger than this.
   */
  private static readonly MAX_MESSAGE_SIZE = 262144; // 256 KB

  /**
   * Maximum timestamp age (14 days in the past).
   *
   * CloudWatch Logs rejects events older than 14 days.
   */
  private static readonly MAX_TIMESTAMP_AGE_MS = 14 * 24 * 60 * 60 * 1000;

  /**
   * Maximum timestamp future offset (2 hours).
   *
   * CloudWatch Logs rejects events more than 2 hours in the future.
   */
  private static readonly MAX_TIMESTAMP_FUTURE_MS = 2 * 60 * 60 * 1000;

  /**
   * Create a new log events service.
   *
   * @param config - CloudWatch Logs configuration
   * @param credentials - AWS credentials
   */
  constructor(config: CloudWatchLogsConfig, credentials: AwsCredentials) {
    super(config, credentials);
  }

  /**
   * Put log events to a stream.
   *
   * Validates events before sending:
   * - Timestamp within acceptable range (not too old or too new)
   * - Message size < 256 KB
   * - Events sorted by timestamp
   *
   * @param request - Put log events request
   * @returns Promise resolving to put response
   */
  async put(request: PutLogEventsRequest): Promise<PutLogEventsResponse> {
    // Validate request
    this.validatePutRequest(request);

    // Make API request
    return this.request<PutLogEventsResponse>({
      action: 'Logs_20140328.PutLogEvents',
      body: request,
    });
  }

  /**
   * Put a single structured log event.
   *
   * Serializes the structured event to JSON with all correlation fields,
   * then sends it via put().
   *
   * @param logGroup - Log group name
   * @param logStream - Log stream name
   * @param event - Structured log event
   */
  async putStructured(
    logGroup: string,
    logStream: string,
    event: StructuredLogEvent
  ): Promise<void> {
    // Use provided timestamp or generate current timestamp
    const timestamp = event.timestamp ?? Date.now();

    // Build structured log message
    const structuredMessage: Record<string, unknown> = {
      timestamp,
      level: event.level,
      message: event.message,
    };

    // Add correlation fields if present
    if (event.traceId) {
      structuredMessage.trace_id = event.traceId;
    }
    if (event.requestId) {
      structuredMessage.request_id = event.requestId;
    }
    if (event.spanId) {
      structuredMessage.span_id = event.spanId;
    }
    if (event.service) {
      structuredMessage.service = event.service;
    }

    // Merge additional fields
    if (event.fields) {
      Object.assign(structuredMessage, event.fields);
    }

    // Serialize to JSON
    const message = JSON.stringify(structuredMessage);

    // Call put() with the serialized event
    await this.put({
      logGroupName: logGroup,
      logStreamName: logStream,
      logEvents: [
        {
          timestamp,
          message,
        },
      ],
    });
  }

  /**
   * Get log events from a stream.
   *
   * @param request - Get log events request
   * @returns Promise resolving to log events
   */
  async get(request: GetLogEventsRequest): Promise<GetLogEventsResponse> {
    return this.request<GetLogEventsResponse>({
      action: 'Logs_20140328.GetLogEvents',
      body: request,
    });
  }

  /**
   * Filter log events across streams.
   *
   * @param request - Filter log events request
   * @returns Promise resolving to filtered events
   */
  async filter(request: FilterLogEventsRequest): Promise<FilterLogEventsResponse> {
    return this.request<FilterLogEventsResponse>({
      action: 'Logs_20140328.FilterLogEvents',
      body: request,
    });
  }

  /**
   * Get all events matching filter with auto-pagination.
   *
   * Yields events one by one, automatically fetching additional pages
   * as needed until no more results are available.
   *
   * @param request - Filter log events request
   * @yields Filtered log events
   */
  async *filterAll(request: FilterLogEventsRequest): AsyncIterable<FilteredLogEvent> {
    let nextToken: string | undefined = request.nextToken;
    let hasMore = true;

    while (hasMore) {
      // Make request with current token
      const response = await this.filter({
        ...request,
        nextToken,
      });

      // Yield all events from this page
      if (response.events) {
        for (const event of response.events) {
          yield event;
        }
      }

      // Check if there are more pages
      nextToken = response.nextToken;
      hasMore = nextToken !== undefined;
    }
  }

  /**
   * Validate a PutLogEvents request.
   *
   * Checks:
   * - Log group and stream names are provided
   * - At least one event is provided
   * - Event timestamps are within acceptable range
   * - Event messages are within size limits
   *
   * @param request - Request to validate
   * @throws {CloudWatchLogsError} If validation fails
   *
   * @private
   */
  private validatePutRequest(request: PutLogEventsRequest): void {
    if (!request.logGroupName) {
      throw validationError('logGroupName is required');
    }

    if (!request.logStreamName) {
      throw validationError('logStreamName is required');
    }

    if (!request.logEvents || request.logEvents.length === 0) {
      throw validationError('At least one log event is required');
    }

    if (request.logEvents.length > 10000) {
      throw validationError(
        `Too many events: ${request.logEvents.length} (max 10,000)`
      );
    }

    const now = Date.now();
    const minTimestamp = now - LogEventsServiceImpl.MAX_TIMESTAMP_AGE_MS;
    const maxTimestamp = now + LogEventsServiceImpl.MAX_TIMESTAMP_FUTURE_MS;

    // Validate each event
    for (let i = 0; i < request.logEvents.length; i++) {
      const event = request.logEvents[i];

      // Validate timestamp
      if (event.timestamp < minTimestamp) {
        throw validationError(
          `Event ${i} timestamp too old (more than 14 days in the past)`
        );
      }

      if (event.timestamp > maxTimestamp) {
        throw validationError(
          `Event ${i} timestamp too new (more than 2 hours in the future)`
        );
      }

      // Validate message size
      const messageSize = Buffer.byteLength(event.message, 'utf8');
      if (messageSize > LogEventsServiceImpl.MAX_MESSAGE_SIZE) {
        throw validationError(
          `Event ${i} message too large: ${messageSize} bytes (max 256 KB)`
        );
      }
    }

    // Validate events are sorted by timestamp
    for (let i = 1; i < request.logEvents.length; i++) {
      if (request.logEvents[i].timestamp < request.logEvents[i - 1].timestamp) {
        throw validationError(
          'Log events must be sorted by timestamp in ascending order'
        );
      }
    }
  }
}

/**
 * Create a new log events service.
 *
 * @param config - CloudWatch Logs configuration
 * @param credentials - AWS credentials
 * @returns New log events service instance
 */
export function createLogEventsService(
  config: CloudWatchLogsConfig,
  credentials: AwsCredentials
): LogEventsService {
  return new LogEventsServiceImpl(config, credentials);
}
