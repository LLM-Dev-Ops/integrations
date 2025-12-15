/**
 * HTTP Transport Module
 *
 * Provides HTTP transport functionality for AWS Secrets Manager API requests.
 *
 * @module http
 */

import type { HttpRequest, HttpResponse } from '../types/index.js';

/**
 * Transport options.
 */
export interface TransportOptions {
  /**
   * Request timeout in milliseconds.
   */
  timeout?: number;

  /**
   * Connection timeout in milliseconds.
   */
  connectTimeout?: number;
}

/**
 * HTTP transport interface.
 */
export interface Transport {
  /**
   * Send an HTTP request.
   *
   * @param request - HTTP request to send
   * @returns Promise resolving to HTTP response
   */
  send(request: HttpRequest): Promise<HttpResponse>;
}

/**
 * Fetch-based HTTP transport.
 *
 * Uses the native fetch API for HTTP requests.
 */
export class FetchTransport implements Transport {
  private readonly timeout: number;

  /**
   * Create a new fetch transport.
   *
   * @param options - Transport options
   */
  constructor(options: TransportOptions = {}) {
    this.timeout = options.timeout ?? 30000;
  }

  /**
   * Send an HTTP request using fetch.
   *
   * @param request - HTTP request to send
   * @returns Promise resolving to HTTP response
   */
  async send(request: HttpRequest): Promise<HttpResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
      });

      const body = await response.text();

      // Extract response headers
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      return {
        status: response.status,
        headers,
        body,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export { HttpRequest, HttpResponse };
