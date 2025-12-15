/**
 * HTTP Transport Implementation
 *
 * Implements the HttpTransport interface using fetch API.
 * Based on SPARC specification Section 4.2.
 */

import { OllamaConfig } from '../config/types.js';
import { OllamaError } from '../types/errors.js';
import { HttpTransport, HttpResponse } from './types.js';

/**
 * HTTP transport implementation using fetch
 */
export class HttpTransportImpl implements HttpTransport {
  private readonly config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this.config = config;
  }

  /**
   * Build full URL from base URL and path
   */
  private buildUrl(path: string): string {
    return `${this.config.baseUrl}${path}`;
  }

  /**
   * Create headers for request
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.defaultHeaders,
    };

    // Add Authorization header if auth token is set
    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }

    return headers;
  }

  /**
   * Map fetch errors to OllamaError types
   */
  private mapFetchError(error: unknown, operation: string): OllamaError {
    if (!(error instanceof Error)) {
      return OllamaError.internalError('Unknown error occurred');
    }

    // Check for connection refused (server not running)
    if (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('fetch failed') ||
      error.message.includes('Failed to fetch')
    ) {
      return OllamaError.serverNotRunning(
        'Cannot connect to Ollama server. ' +
        "Run 'ollama serve' or start the Ollama application."
      );
    }

    // Check for timeout
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return OllamaError.timeout(operation, this.config.timeoutMs);
    }

    // Generic connection error
    return OllamaError.connectionError(
      error.message,
      this.config.baseUrl,
      error.name
    );
  }

  /**
   * Handle error response from server
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const status = response.status;
    let errorBody: { error?: string; message?: string } | string;

    try {
      const text = await response.text();
      try {
        errorBody = JSON.parse(text);
      } catch {
        errorBody = text;
      }
    } catch {
      errorBody = `HTTP ${status} error`;
    }

    const errorMessage =
      typeof errorBody === 'object'
        ? errorBody.error || errorBody.message || `HTTP ${status} error`
        : errorBody;

    // Map status codes to specific errors
    switch (status) {
      case 404:
        throw OllamaError.modelNotFound('unknown');
      case 408:
        throw OllamaError.timeout('Request', this.config.timeoutMs);
      case 500:
      case 502:
      case 503:
      case 504:
        throw OllamaError.internalError(errorMessage, status);
      default:
        throw OllamaError.internalError(errorMessage, status);
    }
  }

  /**
   * Send GET request
   */
  async get(path: string): Promise<HttpResponse> {
    const url = this.buildUrl(path);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const body = await response.json();

      return {
        status: response.status,
        body,
        headers: response.headers,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      // Re-throw if already an OllamaError
      if (error instanceof OllamaError) {
        throw error;
      }

      throw this.mapFetchError(error, 'GET request');
    }
  }

  /**
   * Send POST request with JSON body
   */
  async post<T>(path: string, body: T): Promise<HttpResponse> {
    const url = this.buildUrl(path);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const responseBody = await response.json();

      return {
        status: response.status,
        body: responseBody,
        headers: response.headers,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      // Re-throw if already an OllamaError
      if (error instanceof OllamaError) {
        throw error;
      }

      throw this.mapFetchError(error, 'POST request');
    }
  }

  /**
   * Send POST request and receive streaming response
   */
  async *postStreaming<T>(path: string, body: T): AsyncIterable<Uint8Array> {
    const url = this.buildUrl(path);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      if (!response.body) {
        throw OllamaError.streamError('Response body is null');
      }

      // Yield chunks from the response body
      const reader = response.body.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      clearTimeout(timeoutId);

      // Re-throw if already an OllamaError
      if (error instanceof OllamaError) {
        throw error;
      }

      throw this.mapFetchError(error, 'POST streaming request');
    }
  }

  /**
   * Check if server is reachable
   */
  async isReachable(): Promise<boolean> {
    try {
      await this.get('/');
      return true;
    } catch {
      return false;
    }
  }
}
