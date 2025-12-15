/**
 * HTTP request building for AWS CloudWatch Logs API.
 *
 * CloudWatch Logs uses a JSON-RPC style API where all requests are POST to "/"
 * with an X-Amz-Target header specifying the operation.
 *
 * @module http/request
 */

import type { HttpMethod, HttpRequest } from './types';

/**
 * A request builder for AWS CloudWatch Logs API calls.
 *
 * CloudWatch Logs uses a JSON-RPC style API with the following characteristics:
 * - All requests are POST to "/"
 * - Content-Type: "application/x-amz-json-1.1"
 * - X-Amz-Target: "Logs_20140328.{Operation}"
 * - Request body is JSON
 *
 * @example
 * ```typescript
 * const request = new CloudWatchLogsRequest('PutLogEvents')
 *   .withBody({
 *     logGroupName: 'my-log-group',
 *     logStreamName: 'my-log-stream',
 *     logEvents: [
 *       { timestamp: Date.now(), message: 'Log message' }
 *     ]
 *   });
 *
 * const httpRequest = request.toHttpRequest('https://logs.us-east-1.amazonaws.com');
 * ```
 */
export class CloudWatchLogsRequest {
  private requestBody?: string;
  private additionalHeaders: Map<string, string> = new Map();

  /**
   * CloudWatch Logs API version for X-Amz-Target header.
   */
  private static readonly API_VERSION = 'Logs_20140328';

  /**
   * Create a new CloudWatch Logs request.
   *
   * @param operation - CloudWatch Logs operation name (e.g., 'PutLogEvents', 'CreateLogGroup')
   * @param body - Optional request body (will be JSON stringified)
   *
   * @example
   * ```typescript
   * const request = new CloudWatchLogsRequest('CreateLogGroup', {
   *   logGroupName: 'my-log-group'
   * });
   * ```
   */
  constructor(
    public readonly operation: string,
    body?: unknown
  ) {
    if (body !== undefined) {
      this.withJsonBody(body);
    }
  }

  /**
   * Add a header to the request.
   *
   * Note: Content-Type and X-Amz-Target are set automatically.
   *
   * @param name - Header name
   * @param value - Header value
   * @returns This request for chaining
   *
   * @example
   * ```typescript
   * const request = new CloudWatchLogsRequest('PutLogEvents')
   *   .withHeader('X-Custom-Header', 'value');
   * ```
   */
  withHeader(name: string, value: string): this {
    this.additionalHeaders.set(name, value);
    return this;
  }

  /**
   * Add multiple headers to the request.
   *
   * @param headers - Object containing headers
   * @returns This request for chaining
   *
   * @example
   * ```typescript
   * const request = new CloudWatchLogsRequest('PutLogEvents')
   *   .withHeaders({
   *     'X-Custom-Header': 'value'
   *   });
   * ```
   */
  withHeaders(headers: Record<string, string>): this {
    for (const [name, value] of Object.entries(headers)) {
      this.additionalHeaders.set(name, value);
    }
    return this;
  }

  /**
   * Set the request body as a string.
   *
   * @param body - Request body
   * @returns This request for chaining
   *
   * @example
   * ```typescript
   * const request = new CloudWatchLogsRequest('PutLogEvents')
   *   .withBody('{"logGroupName": "my-log-group"}');
   * ```
   */
  withBody(body: string): this {
    this.requestBody = body;
    return this;
  }

  /**
   * Set the request body as JSON.
   *
   * This method serializes the provided value to JSON and sets it as the
   * request body.
   *
   * @param body - Value to serialize as JSON
   * @returns This request for chaining
   * @throws Error if serialization fails
   *
   * @example
   * ```typescript
   * const request = new CloudWatchLogsRequest('PutLogEvents')
   *   .withJsonBody({
   *     logGroupName: 'my-log-group',
   *     logStreamName: 'my-log-stream',
   *     logEvents: [
   *       { timestamp: Date.now(), message: 'Log message' }
   *     ]
   *   });
   * ```
   */
  withJsonBody(body: unknown): this {
    this.requestBody = JSON.stringify(body);
    return this;
  }

  /**
   * Get the request body.
   *
   * @returns Request body or undefined
   */
  getBody(): string | undefined {
    return this.requestBody;
  }

  /**
   * Get all headers.
   *
   * @returns Map of additional headers
   */
  getHeaders(): ReadonlyMap<string, string> {
    return this.additionalHeaders;
  }

  /**
   * Get the X-Amz-Target header value.
   *
   * @returns Target header value (e.g., "Logs_20140328.PutLogEvents")
   *
   * @example
   * ```typescript
   * const request = new CloudWatchLogsRequest('PutLogEvents');
   * console.log(request.getTarget()); // "Logs_20140328.PutLogEvents"
   * ```
   */
  getTarget(): string {
    return `${CloudWatchLogsRequest.API_VERSION}.${this.operation}`;
  }

  /**
   * Build the complete URL for this request.
   *
   * CloudWatch Logs always uses "/" as the path.
   *
   * @param baseUrl - Base URL (e.g., 'https://logs.us-east-1.amazonaws.com')
   * @returns Complete URL
   *
   * @example
   * ```typescript
   * const request = new CloudWatchLogsRequest('PutLogEvents');
   * const url = request.buildUrl('https://logs.us-east-1.amazonaws.com');
   * // Returns: 'https://logs.us-east-1.amazonaws.com/'
   * ```
   */
  buildUrl(baseUrl: string): string {
    // Remove trailing slash from base URL if present
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    // CloudWatch Logs always uses "/" as the path
    return `${base}/`;
  }

  /**
   * Convert this CloudWatchLogsRequest to an HttpRequest.
   *
   * @param baseUrl - Base URL for the request
   * @returns Complete HTTP request ready to send
   *
   * @example
   * ```typescript
   * const cwlRequest = new CloudWatchLogsRequest('PutLogEvents')
   *   .withJsonBody({
   *     logGroupName: 'my-log-group',
   *     logStreamName: 'my-log-stream',
   *     logEvents: [{ timestamp: Date.now(), message: 'Hello' }]
   *   });
   *
   * const httpRequest = cwlRequest.toHttpRequest('https://logs.us-east-1.amazonaws.com');
   * // Can now be sent via transport layer
   * ```
   */
  toHttpRequest(baseUrl: string): HttpRequest {
    const url = this.buildUrl(baseUrl);

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': this.getTarget(),
    };

    // Add any additional headers
    for (const [name, value] of this.additionalHeaders.entries()) {
      headers[name] = value;
    }

    return {
      method: 'POST',
      path: '/',
      headers,
      body: this.requestBody,
    };
  }

  /**
   * Create a CloudWatch Logs request for a specific operation.
   *
   * @param operation - Operation name
   * @param body - Optional request body
   * @returns New CloudWatchLogsRequest instance
   *
   * @example
   * ```typescript
   * const request = CloudWatchLogsRequest.create('PutLogEvents', {
   *   logGroupName: 'my-log-group',
   *   logStreamName: 'my-log-stream',
   *   logEvents: [{ timestamp: Date.now(), message: 'Hello' }]
   * });
   * ```
   */
  static create(operation: string, body?: unknown): CloudWatchLogsRequest {
    return new CloudWatchLogsRequest(operation, body);
  }
}
