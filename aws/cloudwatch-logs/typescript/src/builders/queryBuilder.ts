/**
 * AWS CloudWatch Logs QueryBuilder
 *
 * Fluent builder for CloudWatch Logs Insights queries.
 */

import type {
  StartQueryRequest,
  QueryResults,
} from '../types/index.js';

/**
 * Fluent builder for CloudWatch Logs Insights queries.
 *
 * @example
 * ```typescript
 * const results = await new QueryBuilder(executeQuery)
 *   .logGroup('/aws/lambda/my-function')
 *   .query('fields @timestamp, @message | filter @message like /ERROR/')
 *   .lastHours(24)
 *   .limit(1000)
 *   .execute();
 * ```
 */
export class QueryBuilder {
  private _logGroups: string[] = [];
  private _query?: string;
  private _startTime?: number;
  private _endTime?: number;
  private _limit?: number;
  private _timeoutMs: number = 60000;

  /**
   * Creates a new QueryBuilder.
   *
   * @param executeQuery - Function to execute the query (injected from service/client)
   */
  constructor(
    private executeQuery: (request: StartQueryRequest, timeout: number) => Promise<QueryResults>
  ) {}

  /**
   * Add a single log group to query.
   *
   * @param name - The log group name (e.g., '/aws/lambda/my-function')
   * @returns This builder instance for chaining
   */
  logGroup(name: string): this {
    if (!name || name.trim().length === 0) {
      throw new Error('Log group name cannot be empty');
    }
    this._logGroups.push(name);
    return this;
  }

  /**
   * Set multiple log groups to query.
   *
   * @param names - Array of log group names
   * @returns This builder instance for chaining
   */
  logGroups(names: string[]): this {
    if (!names || names.length === 0) {
      throw new Error('Log groups array cannot be empty');
    }
    for (const name of names) {
      if (!name || name.trim().length === 0) {
        throw new Error('Log group name cannot be empty');
      }
    }
    this._logGroups.push(...names);
    return this;
  }

  /**
   * Set the Insights query string.
   *
   * @param queryString - CloudWatch Logs Insights query string
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.query('fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc')
   * ```
   */
  query(queryString: string): this {
    if (!queryString || queryString.trim().length === 0) {
      throw new Error('Query string cannot be empty');
    }
    this._query = queryString;
    return this;
  }

  /**
   * Set the start time for the query (epoch seconds).
   *
   * @param ts - Start time in epoch seconds (not milliseconds)
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
   * Set the end time for the query (epoch seconds).
   *
   * @param ts - End time in epoch seconds (not milliseconds)
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
   * Set both start and end time for the query.
   *
   * @param start - Start time in epoch seconds (not milliseconds)
   * @param end - End time in epoch seconds (not milliseconds)
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
   * Set the time range to the last N hours from now.
   *
   * @param hours - Number of hours to look back
   * @returns This builder instance for chaining
   */
  lastHours(hours: number): this {
    if (hours <= 0) {
      throw new Error('Hours must be positive');
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    const hoursInSeconds = hours * 60 * 60;
    this._startTime = nowSeconds - hoursInSeconds;
    this._endTime = nowSeconds;
    return this;
  }

  /**
   * Set the time range to the last N minutes from now.
   *
   * @param minutes - Number of minutes to look back
   * @returns This builder instance for chaining
   */
  lastMinutes(minutes: number): this {
    if (minutes <= 0) {
      throw new Error('Minutes must be positive');
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    const minutesInSeconds = minutes * 60;
    this._startTime = nowSeconds - minutesInSeconds;
    this._endTime = nowSeconds;
    return this;
  }

  /**
   * Set the maximum number of results to return.
   *
   * @param max - Maximum number of results
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
   * Set the query timeout in milliseconds.
   *
   * @param ms - Timeout in milliseconds (default: 60000)
   * @returns This builder instance for chaining
   */
  timeout(ms: number): this {
    if (ms <= 0) {
      throw new Error('Timeout must be positive');
    }
    this._timeoutMs = ms;
    return this;
  }

  /**
   * Execute the query and return results.
   *
   * @returns Promise resolving to query results
   * @throws Error if required fields are missing or invalid
   */
  async execute(): Promise<QueryResults> {
    // Validate required fields
    if (this._logGroups.length === 0) {
      throw new Error('At least one log group is required');
    }
    if (!this._query) {
      throw new Error('Query string is required');
    }
    if (this._startTime === undefined) {
      throw new Error('Start time is required');
    }
    if (this._endTime === undefined) {
      throw new Error('End time is required');
    }

    // Build the request
    const request: StartQueryRequest = {
      logGroupNames: this._logGroups,
      queryString: this._query,
      startTime: this._startTime,
      endTime: this._endTime,
    };

    if (this._limit !== undefined) {
      request.limit = this._limit;
    }

    // Execute the query
    return this.executeQuery(request, this._timeoutMs);
  }
}
