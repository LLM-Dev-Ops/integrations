/**
 * AWS CloudWatch Logs FilterBuilder
 *
 * Fluent builder for FilterLogEvents operations.
 */

import type {
  FilterLogEventsRequest,
  FilterLogEventsResponse,
  FilteredLogEvent,
} from '../types/index.js';

/**
 * Fluent builder for FilterLogEvents operations.
 *
 * @example
 * ```typescript
 * const events = await new FilterBuilder(executeFilter)
 *   .logGroup('/aws/lambda/my-function')
 *   .filterPattern('ERROR')
 *   .lastHours(1)
 *   .executeAll();
 * ```
 */
export class FilterBuilder {
  private _logGroup?: string;
  private _logStreams: string[] = [];
  private _logStreamPrefix?: string;
  private _startTime?: number;
  private _endTime?: number;
  private _filterPattern?: string;
  private _limit?: number;

  /**
   * Creates a new FilterBuilder.
   *
   * @param executeFilter - Function to execute the filter operation (injected from service/client)
   */
  constructor(
    private executeFilter: (request: FilterLogEventsRequest) => AsyncIterable<FilteredLogEvent>
  ) {}

  /**
   * Set the log group to filter.
   *
   * @param name - The log group name (e.g., '/aws/lambda/my-function')
   * @returns This builder instance for chaining
   */
  logGroup(name: string): this {
    if (!name || name.trim().length === 0) {
      throw new Error('Log group name cannot be empty');
    }
    this._logGroup = name;
    return this;
  }

  /**
   * Add a single log stream to filter.
   *
   * @param name - The log stream name
   * @returns This builder instance for chaining
   */
  logStream(name: string): this {
    if (!name || name.trim().length === 0) {
      throw new Error('Log stream name cannot be empty');
    }
    this._logStreams.push(name);
    return this;
  }

  /**
   * Set multiple log streams to filter.
   *
   * @param names - Array of log stream names
   * @returns This builder instance for chaining
   */
  logStreams(names: string[]): this {
    if (!names || names.length === 0) {
      throw new Error('Log streams array cannot be empty');
    }
    for (const name of names) {
      if (!name || name.trim().length === 0) {
        throw new Error('Log stream name cannot be empty');
      }
    }
    this._logStreams.push(...names);
    return this;
  }

  /**
   * Set the log stream prefix for filtering.
   *
   * @param prefix - The log stream name prefix
   * @returns This builder instance for chaining
   */
  logStreamPrefix(prefix: string): this {
    if (!prefix || prefix.trim().length === 0) {
      throw new Error('Log stream prefix cannot be empty');
    }
    this._logStreamPrefix = prefix;
    return this;
  }

  /**
   * Set the start time for filtering (epoch milliseconds).
   *
   * @param ts - Start time in epoch milliseconds
   * @returns This builder instance for chaining
   */
  startTime(ts: number): this {
    if (ts < 0) {
      throw new Error('Start time must be non-negative');
    }
    this._startTime = ts;
    return this;
  }

  /**
   * Set the end time for filtering (epoch milliseconds).
   *
   * @param ts - End time in epoch milliseconds
   * @returns This builder instance for chaining
   */
  endTime(ts: number): this {
    if (ts < 0) {
      throw new Error('End time must be non-negative');
    }
    this._endTime = ts;
    return this;
  }

  /**
   * Set both start and end time for filtering.
   *
   * @param start - Start time in epoch milliseconds
   * @param end - End time in epoch milliseconds
   * @returns This builder instance for chaining
   */
  timeRange(start: number, end: number): this {
    if (start < 0 || end < 0) {
      throw new Error('Time range values must be non-negative');
    }
    if (start >= end) {
      throw new Error('Start time must be before end time');
    }
    this._startTime = start;
    this._endTime = end;
    return this;
  }

  /**
   * Set the filter pattern for matching log events.
   *
   * @param pattern - CloudWatch Logs filter pattern
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.filterPattern('ERROR')
   * builder.filterPattern('[timestamp, request_id, event_type = ERROR]')
   * ```
   */
  filterPattern(pattern: string): this {
    if (!pattern || pattern.trim().length === 0) {
      throw new Error('Filter pattern cannot be empty');
    }
    this._filterPattern = pattern;
    return this;
  }

  /**
   * Set the maximum number of events to return.
   *
   * @param max - Maximum number of events
   * @returns This builder instance for chaining
   */
  limit(max: number): this {
    if (max <= 0) {
      throw new Error('Limit must be positive');
    }
    this._limit = max;
    return this;
  }

  /**
   * Execute the filter operation and return the first page of results.
   *
   * @returns Promise resolving to the filter response
   * @throws Error if required fields are missing
   */
  async execute(): Promise<FilterLogEventsResponse> {
    // Validate required fields
    if (!this._logGroup) {
      throw new Error('Log group is required');
    }

    // Build the request
    const request: FilterLogEventsRequest = {
      logGroupName: this._logGroup,
    };

    if (this._logStreams.length > 0) {
      request.logStreamNames = this._logStreams;
    }
    if (this._logStreamPrefix) {
      request.logStreamNamePrefix = this._logStreamPrefix;
    }
    if (this._startTime !== undefined) {
      request.startTime = this._startTime;
    }
    if (this._endTime !== undefined) {
      request.endTime = this._endTime;
    }
    if (this._filterPattern) {
      request.filterPattern = this._filterPattern;
    }
    if (this._limit !== undefined) {
      request.limit = this._limit;
    }

    // Execute and collect first page
    const events: FilteredLogEvent[] = [];
    let nextToken: string | undefined;

    for await (const event of this.executeFilter(request)) {
      events.push(event);
      // Only collect the first page
      break;
    }

    return {
      events,
      nextToken,
    };
  }

  /**
   * Execute the filter operation and return all matching events (with automatic pagination).
   *
   * @returns AsyncIterable of all matching log events
   * @throws Error if required fields are missing
   */
  executeAll(): AsyncIterable<FilteredLogEvent> {
    // Validate required fields
    if (!this._logGroup) {
      throw new Error('Log group is required');
    }

    // Build the request
    const request: FilterLogEventsRequest = {
      logGroupName: this._logGroup,
    };

    if (this._logStreams.length > 0) {
      request.logStreamNames = this._logStreams;
    }
    if (this._logStreamPrefix) {
      request.logStreamNamePrefix = this._logStreamPrefix;
    }
    if (this._startTime !== undefined) {
      request.startTime = this._startTime;
    }
    if (this._endTime !== undefined) {
      request.endTime = this._endTime;
    }
    if (this._filterPattern) {
      request.filterPattern = this._filterPattern;
    }
    if (this._limit !== undefined) {
      request.limit = this._limit;
    }

    // Return the async iterable directly
    return this.executeFilter(request);
  }
}
