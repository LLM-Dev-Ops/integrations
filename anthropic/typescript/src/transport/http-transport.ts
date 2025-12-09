import {
  NetworkError,
  ServerError,
  RateLimitError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  OverloadedError,
  ContentTooLargeError,
} from '../errors/categories.js';
import { StreamError } from '../errors/categories.js';

/**
 * Options for HTTP requests
 */
export interface RequestOptions {
  /**
   * Request timeout in milliseconds
   */
  timeout?: number;

  /**
   * Additional headers to include in the request
   */
  headers?: Record<string, string>;

  /**
   * Signal for request cancellation
   */
  signal?: AbortSignal;
}

/**
 * Interface for HTTP transport layer
 */
export interface HttpTransport {
  /**
   * Makes a standard HTTP request
   */
  request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T>;

  /**
   * Makes a streaming HTTP request
   */
  requestStream(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<ReadableStream<Uint8Array>>;
}

/**
 * Server-Sent Events (SSE) line parser
 */
interface SSEMessage {
  event?: string;
  data?: string;
  id?: string;
  retry?: number;
}

/**
 * Implementation of HttpTransport using the Fetch API
 */
export class FetchHttpTransport implements HttpTransport {
  constructor(
    private readonly baseUrl: string,
    private readonly defaultHeaders: Record<string, string>,
    private readonly defaultTimeout: number,
    private readonly fetchImpl: typeof fetch = globalThis.fetch
  ) {}

  /**
   * Makes a standard HTTP request
   */
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const timeout = options?.timeout ?? this.defaultTimeout;
    const controller = new AbortController();
    const signal = options?.signal ?? controller.signal;

    // Set up timeout
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: {
          ...this.defaultHeaders,
          ...options?.headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new NetworkError(
            `Request timeout after ${timeout}ms`,
            error
          );
        }

        // Network-level errors
        if (error.message.includes('fetch') || error.message.includes('network')) {
          throw new NetworkError('Network request failed', error);
        }
      }

      throw error;
    }
  }

  /**
   * Makes a streaming HTTP request
   */
  async requestStream(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<ReadableStream<Uint8Array>> {
    const url = `${this.baseUrl}${path}`;
    const timeout = options?.timeout ?? this.defaultTimeout;
    const controller = new AbortController();
    const signal = options?.signal ?? controller.signal;

    // Set up timeout
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: {
          ...this.defaultHeaders,
          'accept': 'text/event-stream',
          ...options?.headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      if (!response.body) {
        throw new StreamError('Response body is null');
      }

      return response.body;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new NetworkError(
            `Request timeout after ${timeout}ms`,
            error
          );
        }

        if (error.message.includes('fetch') || error.message.includes('network')) {
          throw new NetworkError('Network request failed', error);
        }
      }

      throw error;
    }
  }

  /**
   * Handles error responses from the API
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const status = response.status;
    let errorBody: any;

    try {
      errorBody = await response.json();
    } catch {
      errorBody = { error: { message: await response.text() } };
    }

    const errorMessage = errorBody?.error?.message ?? `HTTP ${status} error`;
    const errorType = errorBody?.error?.type;
    const errorDetails = errorBody?.error;

    // Extract retry-after header if present
    const retryAfterHeader = response.headers.get('retry-after');
    const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

    switch (status) {
      case 401:
        throw new AuthenticationError(errorMessage, status, errorDetails);
      case 400:
        throw new ValidationError(errorMessage, status, errorDetails);
      case 404:
        throw new NotFoundError(errorMessage, errorDetails);
      case 413:
        throw new ContentTooLargeError(errorMessage, errorDetails);
      case 429:
        throw new RateLimitError(errorMessage, retryAfter, errorDetails);
      case 529:
        throw new OverloadedError(errorMessage, retryAfter, errorDetails);
      case 500:
      case 502:
      case 503:
      case 504:
        throw new ServerError(errorMessage, status, errorDetails);
      default:
        throw new ServerError(
          `Unexpected error: ${errorMessage}`,
          status,
          errorDetails
        );
    }
  }
}

/**
 * Creates a Server-Sent Events (SSE) stream reader
 */
export async function* readSSEStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<SSEMessage, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? '';

      let currentMessage: SSEMessage = {};

      for (const line of lines) {
        // Empty line indicates end of message
        if (line.trim() === '') {
          if (Object.keys(currentMessage).length > 0) {
            yield currentMessage;
            currentMessage = {};
          }
          continue;
        }

        // Parse SSE field
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) {
          continue;
        }

        const field = line.slice(0, colonIndex);
        let value = line.slice(colonIndex + 1);

        // Remove leading space if present
        if (value.startsWith(' ')) {
          value = value.slice(1);
        }

        switch (field) {
          case 'event':
            currentMessage.event = value;
            break;
          case 'data':
            currentMessage.data = (currentMessage.data ?? '') + value;
            break;
          case 'id':
            currentMessage.id = value;
            break;
          case 'retry':
            currentMessage.retry = parseInt(value, 10);
            break;
        }
      }

      // Yield final message if present
      if (Object.keys(currentMessage).length > 0) {
        yield currentMessage;
      }
    }
  } catch (error) {
    throw new StreamError(
      'Error reading SSE stream',
      error instanceof Error ? error : undefined
    );
  } finally {
    reader.releaseLock();
  }
}

/**
 * Creates an HTTP transport instance
 */
export function createHttpTransport(
  baseUrl: string,
  defaultHeaders: Record<string, string>,
  defaultTimeout: number,
  fetchImpl?: typeof fetch
): HttpTransport {
  return new FetchHttpTransport(baseUrl, defaultHeaders, defaultTimeout, fetchImpl);
}
