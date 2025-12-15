/**
 * Transport layer abstraction for HTTP communication.
 *
 * This module provides a pluggable transport layer for sending HTTP requests.
 * The default implementation uses the Fetch API, which is available in Node.js 18+
 * and all modern browsers.
 *
 * @module http/transport
 */

import type { HttpRequest, HttpResponse, HttpClientConfig } from './types';

/**
 * Transport interface for HTTP communication.
 *
 * This abstraction allows for different HTTP implementations
 * (e.g., fetch, undici, mock for testing).
 *
 * @example
 * ```typescript
 * class CustomTransport implements Transport {
 *   async send(request: HttpRequest): Promise<HttpResponse> {
 *     // Custom implementation
 *     return { status: 200, headers: {}, body: '' };
 *   }
 * }
 * ```
 */
export interface Transport {
  /**
   * Send an HTTP request and return the response.
   *
   * @param request - The HTTP request to send
   * @param baseUrl - Base URL for the request
   * @returns Promise resolving to the HTTP response
   * @throws Error if the request cannot be sent or times out
   */
  send(request: HttpRequest, baseUrl: string): Promise<HttpResponse>;
}

/**
 * Fetch-based HTTP transport implementation.
 *
 * This transport uses the native Fetch API for HTTP communication.
 * It supports timeouts, connection management, and proper error handling.
 *
 * @example
 * ```typescript
 * const transport = new FetchTransport({
 *   timeout: 30000,
 *   connectTimeout: 10000
 * });
 *
 * const response = await transport.send(
 *   {
 *     method: 'POST',
 *     path: '/',
 *     headers: { 'Content-Type': 'application/x-amz-json-1.1' },
 *     body: '{}'
 *   },
 *   'https://logs.us-east-1.amazonaws.com'
 * );
 * ```
 */
export class FetchTransport implements Transport {
  private readonly config: Required<HttpClientConfig>;

  /**
   * Create a new fetch transport.
   *
   * @param config - Optional configuration for the transport
   *
   * @example
   * ```typescript
   * const transport = new FetchTransport({
   *   timeout: 60000,       // 60 second timeout
   *   connectTimeout: 5000  // 5 second connection timeout
   * });
   * ```
   */
  constructor(config?: HttpClientConfig) {
    this.config = {
      timeout: config?.timeout ?? 30000,
      connectTimeout: config?.connectTimeout ?? 10000,
      maxRetries: config?.maxRetries ?? 3,
      retryDelayMs: config?.retryDelayMs ?? 1000,
    };
  }

  /**
   * Send an HTTP request using the Fetch API.
   *
   * This method handles:
   * - Request timeout via AbortController
   * - Proper header forwarding
   * - Response body reading
   * - Error conversion to standardized format
   *
   * @param request - The HTTP request to send
   * @param baseUrl - Base URL for the request
   * @returns Promise resolving to the HTTP response
   * @throws Error if the request fails or times out
   *
   * @example
   * ```typescript
   * const transport = new FetchTransport();
   *
   * try {
   *   const response = await transport.send(
   *     {
   *       method: 'POST',
   *       path: '/',
   *       headers: { 'Content-Type': 'application/x-amz-json-1.1' },
   *       body: JSON.stringify({ logGroupName: 'my-log-group' })
   *     },
   *     'https://logs.us-east-1.amazonaws.com'
   *   );
   *   console.log('Status:', response.status);
   * } catch (error) {
   *   console.error('Request failed:', error);
   * }
   * ```
   */
  async send(request: HttpRequest, baseUrl: string): Promise<HttpResponse> {
    // Create an AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      // Build full URL
      const url = new URL(request.path, baseUrl).toString();

      // Prepare fetch options
      const fetchOptions: RequestInit = {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
      };

      // Execute the fetch request
      const response = await fetch(url, fetchOptions);

      // Read the response body
      const body = await response.text();

      // Extract headers
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      return {
        status: response.status,
        headers,
        body,
      };
    } catch (error) {
      // Handle abort/timeout errors
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.config.timeout}ms`);
      }

      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`Network error: ${error.message}`);
      }

      // Re-throw other errors
      throw error;
    } finally {
      // Clean up the timeout
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get the current transport configuration.
   *
   * @returns The transport configuration
   *
   * @example
   * ```typescript
   * const transport = new FetchTransport({ timeout: 60000 });
   * const config = transport.getConfig();
   * console.log('Timeout:', config.timeout); // 60000
   * ```
   */
  getConfig(): Readonly<HttpClientConfig> {
    return { ...this.config };
  }
}

/**
 * Create a default transport instance.
 *
 * This is a convenience function for creating a FetchTransport
 * with default settings.
 *
 * @param config - Optional configuration
 * @returns A new FetchTransport instance
 *
 * @example
 * ```typescript
 * const transport = createDefaultTransport();
 *
 * // Or with custom config:
 * const customTransport = createDefaultTransport({
 *   timeout: 60000
 * });
 * ```
 */
export function createDefaultTransport(config?: HttpClientConfig): Transport {
  return new FetchTransport(config);
}
