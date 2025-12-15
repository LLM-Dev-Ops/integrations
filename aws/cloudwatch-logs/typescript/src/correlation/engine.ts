/**
 * AWS CloudWatch Logs Correlation Engine
 *
 * Provides methods for correlating log events across multiple log groups
 * using trace IDs, request IDs, and span IDs.
 *
 * @module correlation/engine
 */

import type { InsightsService } from '../services/insights.js';
import type { TimeRange } from '../types/structured.js';
import type {
  CorrelationType,
  CorrelatedEvent,
  CorrelationResult,
} from './types.js';
import { parseCorrelationIds } from './parser.js';

/**
 * Correlation Engine interface.
 *
 * Provides methods for querying and correlating log events across multiple
 * log groups using correlation IDs (trace_id, request_id, span_id).
 */
export interface CorrelationEngine {
  /**
   * Correlate log events by trace ID.
   *
   * Searches all specified log groups for events containing the given trace ID
   * and returns them sorted by timestamp.
   *
   * @param logGroups - Array of log group names to search
   * @param traceId - The trace ID to search for
   * @param timeRange - Time range to search within
   * @returns Promise resolving to correlation result
   * @throws {CloudWatchLogsError} On validation or API errors
   *
   * @example
   * ```typescript
   * const result = await engine.correlateByTrace(
   *   ['/aws/lambda/service-a', '/aws/lambda/service-b'],
   *   'trace-abc-123',
   *   {
   *     start: new Date(Date.now() - 3600000),
   *     end: new Date()
   *   }
   * );
   *
   * console.log(`Found ${result.events.length} correlated events`);
   * for (const event of result.events) {
   *   console.log(`[${event.logGroup}] ${new Date(event.timestamp)}: ${event.message}`);
   * }
   * ```
   */
  correlateByTrace(
    logGroups: string[],
    traceId: string,
    timeRange: TimeRange
  ): Promise<CorrelationResult>;

  /**
   * Correlate log events by request ID.
   *
   * Searches all specified log groups for events containing the given request ID
   * and returns them sorted by timestamp.
   *
   * @param logGroups - Array of log group names to search
   * @param requestId - The request ID to search for
   * @param timeRange - Time range to search within
   * @returns Promise resolving to correlation result
   * @throws {CloudWatchLogsError} On validation or API errors
   *
   * @example
   * ```typescript
   * const result = await engine.correlateByRequest(
   *   ['/aws/lambda/my-function'],
   *   'req-xyz-456',
   *   {
   *     start: new Date(Date.now() - 1800000),
   *     end: new Date()
   *   }
   * );
   *
   * console.log(`Request ${requestId} processed across ${result.events.length} events`);
   * ```
   */
  correlateByRequest(
    logGroups: string[],
    requestId: string,
    timeRange: TimeRange
  ): Promise<CorrelationResult>;

  /**
   * Correlate log events by span ID.
   *
   * Searches all specified log groups for events containing the given span ID
   * and returns them sorted by timestamp.
   *
   * @param logGroups - Array of log group names to search
   * @param spanId - The span ID to search for
   * @param timeRange - Time range to search within
   * @returns Promise resolving to correlation result
   * @throws {CloudWatchLogsError} On validation or API errors
   *
   * @example
   * ```typescript
   * const result = await engine.correlateBySpan(
   *   ['/aws/lambda/my-function'],
   *   'span-def-789',
   *   {
   *     start: new Date(Date.now() - 1800000),
   *     end: new Date()
   *   }
   * );
   *
   * console.log(`Span ${spanId} executed ${result.events.length} operations`);
   * ```
   */
  correlateBySpan(
    logGroups: string[],
    spanId: string,
    timeRange: TimeRange
  ): Promise<CorrelationResult>;

  /**
   * Parse a log message and extract correlation IDs.
   *
   * This method parses a log message (typically JSON) and extracts
   * correlation IDs and other structured fields.
   *
   * @param message - The log message to parse
   * @returns A CorrelatedEvent object with extracted fields
   *
   * @example
   * ```typescript
   * const event = engine.parseMessage(
   *   '{"level":"INFO","trace_id":"abc-123","message":"Request processed"}'
   * );
   *
   * console.log(event.traceId); // "abc-123"
   * console.log(event.parsedFields.level); // "INFO"
   * ```
   */
  parseMessage(message: string): CorrelatedEvent;

  /**
   * Build a CloudWatch Logs Insights query string for correlation.
   *
   * Generates the query string that will be used to search for events
   * with the specified correlation ID.
   *
   * @param correlationType - The type of correlation (trace, request, or span)
   * @param correlationId - The correlation ID to search for
   * @returns The CloudWatch Logs Insights query string
   *
   * @example
   * ```typescript
   * const query = engine.buildCorrelationQuery('trace', 'abc-123');
   * console.log(query);
   * // Output: fields @timestamp, @message, @logStream | filter trace_id = "abc-123" or traceId = "abc-123" | sort @timestamp asc
   * ```
   */
  buildCorrelationQuery(
    correlationType: CorrelationType,
    correlationId: string
  ): string;
}

/**
 * Default implementation of the Correlation Engine.
 *
 * Uses CloudWatch Logs Insights to perform cross-log-group queries
 * for correlation IDs.
 */
export class DefaultCorrelationEngine implements CorrelationEngine {
  private readonly insights: InsightsService;

  /**
   * Create a new Correlation Engine.
   *
   * @param insights - InsightsService for executing queries
   */
  constructor(insights: InsightsService) {
    this.insights = insights;
  }

  /**
   * Correlate log events by trace ID.
   */
  async correlateByTrace(
    logGroups: string[],
    traceId: string,
    timeRange: TimeRange
  ): Promise<CorrelationResult> {
    // Build the correlation query
    const queryString = this.buildCorrelationQuery('trace', traceId);

    // Execute the query via InsightsService
    const correlatedEvents = await this.insights.query(
      {
        logGroupNames: logGroups,
        startTime: Math.floor(timeRange.start.getTime() / 1000),
        endTime: Math.floor(timeRange.end.getTime() / 1000),
        queryString,
        limit: 10000,
      },
      60000 // 60 second timeout
    );

    // Convert CorrelatedLogEvent[] to CorrelatedEvent[]
    const events: CorrelatedEvent[] = (correlatedEvents.results || []).map(
      (row) => this.parseResultRow(row, logGroups[0] || 'unknown')
    );

    return {
      correlationId: traceId,
      correlationType: 'trace',
      events,
      timeRange,
      logGroups,
    };
  }

  /**
   * Correlate log events by request ID.
   */
  async correlateByRequest(
    logGroups: string[],
    requestId: string,
    timeRange: TimeRange
  ): Promise<CorrelationResult> {
    // Build the correlation query
    const queryString = this.buildCorrelationQuery('request', requestId);

    // Execute the query via InsightsService
    const correlatedEvents = await this.insights.query(
      {
        logGroupNames: logGroups,
        startTime: Math.floor(timeRange.start.getTime() / 1000),
        endTime: Math.floor(timeRange.end.getTime() / 1000),
        queryString,
        limit: 10000,
      },
      60000 // 60 second timeout
    );

    // Convert CorrelatedLogEvent[] to CorrelatedEvent[]
    const events: CorrelatedEvent[] = (correlatedEvents.results || []).map(
      (row) => this.parseResultRow(row, logGroups[0] || 'unknown')
    );

    return {
      correlationId: requestId,
      correlationType: 'request',
      events,
      timeRange,
      logGroups,
    };
  }

  /**
   * Correlate log events by span ID.
   */
  async correlateBySpan(
    logGroups: string[],
    spanId: string,
    timeRange: TimeRange
  ): Promise<CorrelationResult> {
    // Build the correlation query
    const queryString = this.buildCorrelationQuery('span', spanId);

    // Execute the query via InsightsService
    const correlatedEvents = await this.insights.query(
      {
        logGroupNames: logGroups,
        startTime: Math.floor(timeRange.start.getTime() / 1000),
        endTime: Math.floor(timeRange.end.getTime() / 1000),
        queryString,
        limit: 10000,
      },
      60000 // 60 second timeout
    );

    // Convert CorrelatedLogEvent[] to CorrelatedEvent[]
    const events: CorrelatedEvent[] = (correlatedEvents.results || []).map(
      (row) => this.parseResultRow(row, logGroups[0] || 'unknown')
    );

    return {
      correlationId: spanId,
      correlationType: 'span',
      events,
      timeRange,
      logGroups,
    };
  }

  /**
   * Parse a log message and extract correlation IDs.
   */
  parseMessage(message: string): CorrelatedEvent {
    const parsed = parseCorrelationIds(message);

    return {
      logGroup: '',
      logStream: '',
      timestamp: Date.now(),
      message,
      traceId: parsed.traceId,
      requestId: parsed.requestId,
      spanId: parsed.spanId,
      parsedFields: parsed.parsedFields,
    };
  }

  /**
   * Build a CloudWatch Logs Insights query string for correlation.
   */
  buildCorrelationQuery(
    correlationType: CorrelationType,
    correlationId: string
  ): string {
    // Escape the correlation ID for use in the query
    const escapedId = this.escapeQueryString(correlationId);

    // Determine the field names to search based on correlation type
    let snakeCaseField: string;
    let camelCaseField: string;

    switch (correlationType) {
      case 'trace':
        snakeCaseField = 'trace_id';
        camelCaseField = 'traceId';
        break;
      case 'request':
        snakeCaseField = 'request_id';
        camelCaseField = 'requestId';
        break;
      case 'span':
        snakeCaseField = 'span_id';
        camelCaseField = 'spanId';
        break;
      default:
        throw new Error(`Unknown correlation type: ${correlationType}`);
    }

    // Build query that searches for both snake_case and camelCase variants
    // This handles logs from different sources with different naming conventions
    return `fields @timestamp, @message, @logStream | filter ${snakeCaseField} = "${escapedId}" or ${camelCaseField} = "${escapedId}" | sort @timestamp asc`;
  }

  /**
   * Parse a query result row into a CorrelatedEvent.
   *
   * CloudWatch Logs Insights returns results as an array of arrays of {field, value} objects.
   */
  private parseResultRow(row: any[], defaultLogGroup: string): CorrelatedEvent {
    // Convert array of ResultField objects into a map
    const fieldMap = new Map<string, string>();
    for (const field of row) {
      if (field.field && field.value !== undefined) {
        fieldMap.set(field.field, field.value);
      }
    }

    // Extract required fields
    const timestampStr = fieldMap.get('@timestamp') || '';
    const message = fieldMap.get('@message') || '';
    const logStream = fieldMap.get('@logStream') || 'unknown';

    // Parse timestamp
    const timestamp = timestampStr ? new Date(timestampStr).getTime() : Date.now();

    // Parse correlation IDs from the message
    const parsed = parseCorrelationIds(message);

    return {
      logGroup: defaultLogGroup,
      logStream,
      timestamp,
      message,
      traceId: parsed.traceId,
      requestId: parsed.requestId,
      spanId: parsed.spanId,
      parsedFields: parsed.parsedFields,
    };
  }

  /**
   * Escape special characters in query strings.
   *
   * Escapes backslashes and double quotes for CloudWatch Logs Insights query syntax.
   */
  private escapeQueryString(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
}
