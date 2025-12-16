/**
 * Fetch-based HTTP Transport Implementation
 *
 * Concrete implementation of HTTP transport using the native fetch API.
 * Compatible with both Node.js (18+) and browser environments.
 * @module @llmdevops/weaviate-integration/transport/fetch
 */

import { NetworkError, parseApiError } from '../errors';
import { BaseHttpTransport } from './http';
import type { HttpResponse, HttpMethod, TransportOptions } from './types';
import { ResponseType } from './types';

// ============================================================================
// Fetch Transport Implementation
// ============================================================================

/**
 * HTTP transport implementation using native fetch API.
 *
 * Features:
 * - Works in both Node.js (18+) and browser environments
 * - AbortController for timeout handling
 * - Automatic JSON parsing
 * - Support for different response types (JSON, text, blob)
 * - Proper error handling and mapping
 */
export class FetchHttpTransport extends BaseHttpTransport {
  constructor(options: TransportOptions) {
    super(options);
  }

  /**
   * Execute an HTTP request using fetch API.
   */
  protected async executeRequest<T>(
    url: string,
    method: HttpMethod,
    headers: Record<string, string>,
    body?: unknown,
    timeout: number = this.timeout
  ): Promise<HttpResponse<T>> {
    // Create abort controller for timeout
    const controller = this.createAbortController(timeout);

    try {
      // Execute fetch request
      const response = await fetch(url, {
        method,
        headers,
        body: body ? this.serializeBody(body) : undefined,
        signal: controller.signal,
      });

      // Parse response based on content type
      const responseBody = await this.parseResponse<T>(response, method);

      // Check for error status codes
      if (!response.ok) {
        throw parseApiError(response.status, responseBody, response.headers);
      }

      return {
        status: response.status,
        headers: response.headers,
        body: responseBody,
      };
    } catch (error) {
      // Handle abort/timeout errors
      this.handleAbortError(error, timeout);

      // Handle network errors
      if (error instanceof TypeError) {
        throw new NetworkError(`Network error: ${error.message}`, { cause: error });
      }

      // Re-throw other errors (including parsed API errors)
      throw error;
    }
  }

  /**
   * Parse response based on content type and method.
   */
  private async parseResponse<T>(
    response: Response,
    method: HttpMethod
  ): Promise<T> {
    // HEAD requests have no body
    if (method === 'HEAD') {
      return undefined as T;
    }

    // 204 No Content responses have no body
    if (response.status === 204) {
      return undefined as T;
    }

    // Get content type
    const contentType = response.headers.get('content-type');

    // Determine response type
    const responseType = this.getResponseType(contentType);

    // Parse based on type
    switch (responseType) {
      case 'json':
        return this.parseJsonResponse<T>(response);
      case 'text':
        return (await response.text()) as T;
      case 'blob':
        return (await response.blob()) as T;
      default:
        return {} as T;
    }
  }

  /**
   * Parse JSON response with error handling.
   */
  private async parseJsonResponse<T>(response: Response): Promise<T> {
    const text = await response.text();

    if (!text || text.trim().length === 0) {
      return {} as T;
    }

    return this.parseJson<T>(text);
  }

  /**
   * Determine response type from content-type header.
   */
  private getResponseType(contentType: string | null): ResponseType {
    if (!contentType) {
      return ResponseType.Json; // Default to JSON
    }

    if (contentType.includes('application/json')) {
      return ResponseType.Json;
    }

    if (contentType.includes('text/')) {
      return ResponseType.Text;
    }

    if (
      contentType.includes('application/octet-stream') ||
      contentType.includes('image/') ||
      contentType.includes('video/') ||
      contentType.includes('audio/')
    ) {
      return ResponseType.Blob;
    }

    return ResponseType.Json; // Default fallback
  }
}

// ============================================================================
// Fetch Transport Factory
// ============================================================================

/**
 * Create a new FetchHttpTransport instance.
 *
 * @param options - Transport options
 * @returns FetchHttpTransport instance
 */
export function createFetchTransport(options: TransportOptions): FetchHttpTransport {
  return new FetchHttpTransport(options);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if fetch API is available in the current environment.
 *
 * @returns true if fetch is available
 */
export function isFetchAvailable(): boolean {
  return typeof fetch !== 'undefined';
}

/**
 * Check if AbortController is available in the current environment.
 *
 * @returns true if AbortController is available
 */
export function isAbortControllerAvailable(): boolean {
  return typeof AbortController !== 'undefined';
}

/**
 * Verify that the current environment supports all required fetch features.
 *
 * @throws {Error} If required features are not available
 */
export function verifyFetchSupport(): void {
  if (!isFetchAvailable()) {
    throw new Error(
      'Fetch API is not available in this environment. ' +
        'Node.js 18+ or a modern browser is required.'
    );
  }

  if (!isAbortControllerAvailable()) {
    throw new Error(
      'AbortController is not available in this environment. ' +
        'Node.js 15+ or a modern browser is required.'
    );
  }
}
