/**
 * Fetch-based HTTP transport implementation for Cloudflare R2
 */

import type {
  HttpRequest,
  HttpResponse,
  StreamingHttpResponse,
  HttpTransport,
} from './types.js';
import { NetworkError, ServerError } from '../errors/index.js';
import { getRetryAfter, getRequestId } from './types.js';

/**
 * Fetch transport options
 */
export interface FetchTransportOptions {
  /** Request timeout in milliseconds */
  timeout: number;
  /** Whether to use keep-alive connections */
  keepAlive?: boolean;
}

/**
 * Fetch-based HTTP transport implementation
 *
 * Uses the standard Fetch API for making HTTP requests.
 * Supports both buffered and streaming responses.
 */
export class FetchTransport implements HttpTransport {
  private readonly options: FetchTransportOptions;

  constructor(options: FetchTransportOptions) {
    this.options = options;
  }

  /**
   * Sends an HTTP request and returns buffered response
   */
  async send(request: HttpRequest): Promise<HttpResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

    try {
      // Make the fetch request
      const response = await this.makeFetchRequest(request, controller.signal);

      clearTimeout(timeoutId);

      // Convert headers
      const headers = this.convertHeaders(response.headers);

      // Check for errors
      this.checkResponse(response, headers);

      // Read body as buffer
      const arrayBuffer = await response.arrayBuffer();
      const body = new Uint8Array(arrayBuffer);

      return {
        status: response.status,
        headers,
        body,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw this.handleError(error, request);
    }
  }

  /**
   * Sends an HTTP request and returns streaming response
   */
  async sendStreaming(request: HttpRequest): Promise<StreamingHttpResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

    try {
      // Make the fetch request
      const response = await this.makeFetchRequest(request, controller.signal);

      clearTimeout(timeoutId);

      // Convert headers
      const headers = this.convertHeaders(response.headers);

      // Check for errors
      this.checkResponse(response, headers);

      // Get body stream (should always exist)
      if (!response.body) {
        throw NetworkError.connectionFailed('Response body stream is null');
      }

      return {
        status: response.status,
        headers,
        body: response.body,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw this.handleError(error, request);
    }
  }

  /**
   * Closes the transport (no-op for fetch-based transport)
   */
  async close(): Promise<void> {
    // Fetch API doesn't require explicit cleanup
  }

  /**
   * Makes a fetch request
   */
  private async makeFetchRequest(
    request: HttpRequest,
    signal: AbortSignal
  ): Promise<Response> {
    const init: RequestInit = {
      method: request.method,
      headers: request.headers,
      signal,
    };

    // Add body if present
    if (request.body) {
      if (request.body instanceof Uint8Array) {
        // Fetch API accepts Uint8Array directly
        init.body = request.body;
      } else {
        // Body is a ReadableStream
        init.body = request.body as ReadableStream;
      }
    }

    // Add keep-alive if configured
    if (this.options.keepAlive !== false) {
      init.keepalive = true;
    }

    return fetch(request.url, init);
  }

  /**
   * Converts Headers object to plain object
   */
  private convertHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Checks response for errors and throws appropriate error types
   */
  private checkResponse(response: Response, headers: Record<string, string>): void {
    if (response.ok) {
      return;
    }

    const requestId = getRequestId(headers);
    const retryAfter = getRetryAfter(headers);

    // Handle specific error status codes
    switch (response.status) {
      case 429:
      case 503:
        // Both 429 and 503 can indicate throttling/rate limiting
        throw ServerError.slowDown(retryAfter, requestId);

      case 500:
        throw ServerError.internalError(requestId);

      case 502:
        throw ServerError.badGateway(requestId);

      case 504:
        throw ServerError.gatewayTimeout(requestId);

      default:
        // Let other status codes be handled by specific operations
        return;
    }
  }

  /**
   * Handles errors from fetch operations
   */
  private handleError(error: unknown, request: HttpRequest): Error {
    if (error instanceof Error) {
      // Already an R2 error, pass through
      if (error.name.endsWith('Error') && 'type' in error) {
        return error;
      }

      // Timeout/abort errors
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        return NetworkError.timeout(this.options.timeout);
      }

      // Network errors
      const message = error.message.toLowerCase();

      if (message.includes('enotfound') || message.includes('dns')) {
        return NetworkError.dnsError(request.url);
      }

      if (message.includes('econnrefused') || message.includes('econnreset')) {
        return NetworkError.connectionReset();
      }

      if (message.includes('network') || message.includes('fetch')) {
        return NetworkError.connectionFailed(error.message);
      }

      // Generic network error
      return NetworkError.connectionFailed(error.message);
    }

    // Unknown error type
    return NetworkError.connectionFailed(String(error));
  }
}

/**
 * Creates a fetch-based HTTP transport
 */
export function createFetchTransport(timeout: number = 30000): HttpTransport {
  return new FetchTransport({ timeout });
}

/**
 * Creates a fetch transport with custom options
 */
export function createFetchTransportWithOptions(
  options: FetchTransportOptions
): HttpTransport {
  return new FetchTransport(options);
}
