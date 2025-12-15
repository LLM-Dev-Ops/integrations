/**
 * HTTP Transport Layer for vLLM
 * Implements connection management and request/response handling
 */

import {
  ConnectionError,
  ServerUnreachableError,
  TimeoutError,
  ConnectionTimeoutError,
  ReadTimeoutError,
  createErrorFromHttpStatus,
  StreamInterruptedError,
} from '../types/errors.js';

export interface RequestOptions {
  timeout?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface HttpTransport {
  request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T>;

  requestStream(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<ReadableStream<Uint8Array>>;
}

export class FetchHttpTransport implements HttpTransport {
  constructor(
    private readonly baseUrl: string,
    private readonly defaultHeaders: Record<string, string>,
    private readonly defaultTimeout: number,
    private readonly fetchImpl: typeof fetch = globalThis.fetch
  ) {}

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const timeout = options?.timeout ?? this.defaultTimeout;
    const controller = new AbortController();

    // Link external signal if provided
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...this.defaultHeaders,
          ...options?.headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
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
          throw new ConnectionTimeoutError(timeout, this.baseUrl);
        }

        if (
          error.message.includes('fetch') ||
          error.message.includes('network') ||
          error.message.includes('ECONNREFUSED')
        ) {
          throw new ServerUnreachableError(this.baseUrl, error);
        }
      }

      throw error;
    }
  }

  async requestStream(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<ReadableStream<Uint8Array>> {
    const url = `${this.baseUrl}${path}`;
    const timeout = options?.timeout ?? this.defaultTimeout;
    const controller = new AbortController();

    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...this.defaultHeaders,
          ...options?.headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      if (!response.body) {
        throw new StreamInterruptedError('Response body is null');
      }

      return response.body;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new ConnectionTimeoutError(timeout, this.baseUrl);
        }

        if (
          error.message.includes('fetch') ||
          error.message.includes('network') ||
          error.message.includes('ECONNREFUSED')
        ) {
          throw new ServerUnreachableError(this.baseUrl, error);
        }
      }

      throw error;
    }
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    const status = response.status;
    let errorBody: { error?: { message?: string; type?: string } } = {};

    try {
      const parsed = await response.json() as unknown;
      if (typeof parsed === 'object' && parsed !== null) {
        errorBody = parsed as { error?: { message?: string; type?: string } };
      }
    } catch {
      const text = await response.text();
      errorBody = { error: { message: text } };
    }

    const errorMessage =
      errorBody?.error?.message ?? `HTTP ${status} error`;
    const details = errorBody?.error;

    throw createErrorFromHttpStatus(status, errorMessage, details);
  }
}

export function createHttpTransport(
  baseUrl: string,
  defaultHeaders: Record<string, string>,
  defaultTimeout: number,
  fetchImpl?: typeof fetch
): HttpTransport {
  return new FetchHttpTransport(baseUrl, defaultHeaders, defaultTimeout, fetchImpl);
}
