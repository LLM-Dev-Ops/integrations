/**
 * HTTP request building for AWS SES API.
 *
 * This module provides type-safe request building for AWS SES API calls,
 * with a fluent interface for constructing requests.
 *
 * @module http/request
 */

import type { HttpMethod, HttpRequest } from './types.js';

/**
 * A request builder for AWS SES API calls.
 *
 * This class provides a fluent interface for building HTTP requests
 * with proper query parameters, headers, and body content.
 *
 * @example
 * ```typescript
 * const request = new SesRequest('POST', '/v2/email/outbound-emails')
 *   .withHeader('Content-Type', 'application/json')
 *   .withBody(JSON.stringify({
 *     FromEmailAddress: 'sender@example.com',
 *     Destination: {
 *       ToAddresses: ['recipient@example.com']
 *     },
 *     Content: {
 *       Simple: {
 *         Subject: { Data: 'Test' },
 *         Body: { Text: { Data: 'Hello' } }
 *       }
 *     }
 *   }));
 *
 * const httpRequest = request.toHttpRequest('https://email.us-east-1.amazonaws.com');
 * ```
 */
export class SesRequest {
  private queryParams: Map<string, string> = new Map();
  private headers: Map<string, string> = new Map();
  private requestBody?: string;

  /**
   * Create a new SES request.
   *
   * @param method - HTTP method (GET, POST, PUT, DELETE, PATCH)
   * @param path - Request path (e.g., '/v2/email/identities')
   * @param body - Optional request body (for POST, PUT, PATCH)
   *
   * @example
   * ```typescript
   * const request = new SesRequest('GET', '/v2/email/identities');
   * ```
   */
  constructor(
    public readonly method: HttpMethod,
    public readonly path: string,
    body?: unknown
  ) {
    if (body !== undefined) {
      this.withJsonBody(body);
    }
  }

  /**
   * Add a query parameter to the request.
   *
   * @param name - Parameter name
   * @param value - Parameter value
   * @returns This request for chaining
   *
   * @example
   * ```typescript
   * const request = new SesRequest('GET', '/v2/email/identities')
   *   .withQuery('PageSize', '100')
   *   .withQuery('NextToken', 'abc123');
   * ```
   */
  withQuery(name: string, value: string): this {
    this.queryParams.set(name, value);
    return this;
  }

  /**
   * Add multiple query parameters to the request.
   *
   * @param params - Object containing query parameters
   * @returns This request for chaining
   *
   * @example
   * ```typescript
   * const request = new SesRequest('GET', '/v2/email/identities')
   *   .withQueryParams({
   *     PageSize: '100',
   *     NextToken: 'abc123'
   *   });
   * ```
   */
  withQueryParams(params: Record<string, string>): this {
    for (const [name, value] of Object.entries(params)) {
      this.queryParams.set(name, value);
    }
    return this;
  }

  /**
   * Add a header to the request.
   *
   * @param name - Header name
   * @param value - Header value
   * @returns This request for chaining
   *
   * @example
   * ```typescript
   * const request = new SesRequest('POST', '/v2/email/outbound-emails')
   *   .withHeader('Content-Type', 'application/json')
   *   .withHeader('X-Custom-Header', 'value');
   * ```
   */
  withHeader(name: string, value: string): this {
    this.headers.set(name, value);
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
   * const request = new SesRequest('POST', '/v2/email/outbound-emails')
   *   .withHeaders({
   *     'Content-Type': 'application/json',
   *     'X-Custom-Header': 'value'
   *   });
   * ```
   */
  withHeaders(headers: Record<string, string>): this {
    for (const [name, value] of Object.entries(headers)) {
      this.headers.set(name, value);
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
   * const request = new SesRequest('POST', '/v2/email/outbound-emails')
   *   .withBody('{"test": "data"}');
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
   * request body. It also sets the Content-Type header to application/json.
   *
   * @param body - Value to serialize as JSON
   * @returns This request for chaining
   * @throws Error if serialization fails
   *
   * @example
   * ```typescript
   * const request = new SesRequest('POST', '/v2/email/outbound-emails')
   *   .withJsonBody({
   *     FromEmailAddress: 'sender@example.com',
   *     Destination: {
   *       ToAddresses: ['recipient@example.com']
   *     }
   *   });
   * ```
   */
  withJsonBody(body: unknown): this {
    this.requestBody = JSON.stringify(body);
    this.withHeader('Content-Type', 'application/json');
    return this;
  }

  /**
   * Get all query parameters.
   *
   * @returns Map of query parameters
   */
  getQueryParams(): ReadonlyMap<string, string> {
    return this.queryParams;
  }

  /**
   * Get all headers.
   *
   * @returns Map of headers
   */
  getHeaders(): ReadonlyMap<string, string> {
    return this.headers;
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
   * Build the complete URL for this request.
   *
   * @param baseUrl - Base URL (e.g., 'https://email.us-east-1.amazonaws.com')
   * @returns Complete URL with path and query parameters
   *
   * @example
   * ```typescript
   * const request = new SesRequest('GET', '/v2/email/identities')
   *   .withQuery('PageSize', '100');
   *
   * const url = request.buildUrl('https://email.us-east-1.amazonaws.com');
   * // Returns: 'https://email.us-east-1.amazonaws.com/v2/email/identities?PageSize=100'
   * ```
   */
  buildUrl(baseUrl: string): string {
    // Remove trailing slash from base URL
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

    // Build URL with path
    let url = `${base}${this.path}`;

    // Add query parameters if present
    if (this.queryParams.size > 0) {
      const queryString = Array.from(this.queryParams.entries())
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
      url += `?${queryString}`;
    }

    return url;
  }

  /**
   * Convert this SesRequest to an HttpRequest.
   *
   * @param baseUrl - Base URL for the request
   * @returns Complete HTTP request ready to send
   *
   * @example
   * ```typescript
   * const sesRequest = new SesRequest('POST', '/v2/email/outbound-emails')
   *   .withHeader('Content-Type', 'application/json')
   *   .withBody('{"test": "data"}');
   *
   * const httpRequest = sesRequest.toHttpRequest('https://email.us-east-1.amazonaws.com');
   * // Can now be sent via transport layer
   * ```
   */
  toHttpRequest(baseUrl: string): HttpRequest {
    const url = this.buildUrl(baseUrl);

    // Convert headers map to object
    const headers: Record<string, string> = {};
    for (const [name, value] of this.headers.entries()) {
      headers[name] = value;
    }

    return {
      method: this.method,
      url,
      headers,
      body: this.requestBody,
    };
  }

  /**
   * Create a GET request.
   *
   * @param path - Request path
   * @returns New SesRequest instance
   *
   * @example
   * ```typescript
   * const request = SesRequest.get('/v2/email/identities');
   * ```
   */
  static get(path: string): SesRequest {
    return new SesRequest('GET', path);
  }

  /**
   * Create a POST request.
   *
   * @param path - Request path
   * @param body - Optional request body
   * @returns New SesRequest instance
   *
   * @example
   * ```typescript
   * const request = SesRequest.post('/v2/email/outbound-emails', {
   *   FromEmailAddress: 'sender@example.com'
   * });
   * ```
   */
  static post(path: string, body?: unknown): SesRequest {
    return new SesRequest('POST', path, body);
  }

  /**
   * Create a PUT request.
   *
   * @param path - Request path
   * @param body - Optional request body
   * @returns New SesRequest instance
   *
   * @example
   * ```typescript
   * const request = SesRequest.put('/v2/email/identities/example.com', {
   *   DkimSigningAttributes: { /* config *\/ }
   * });
   * ```
   */
  static put(path: string, body?: unknown): SesRequest {
    return new SesRequest('PUT', path, body);
  }

  /**
   * Create a DELETE request.
   *
   * @param path - Request path
   * @returns New SesRequest instance
   *
   * @example
   * ```typescript
   * const request = SesRequest.delete('/v2/email/identities/example.com');
   * ```
   */
  static delete(path: string): SesRequest {
    return new SesRequest('DELETE', path);
  }

  /**
   * Create a PATCH request.
   *
   * @param path - Request path
   * @param body - Optional request body
   * @returns New SesRequest instance
   *
   * @example
   * ```typescript
   * const request = SesRequest.patch('/v2/email/configuration-sets/default', {
   *   SendingEnabled: true
   * });
   * ```
   */
  static patch(path: string, body?: unknown): SesRequest {
    return new SesRequest('PATCH', path, body);
  }
}
