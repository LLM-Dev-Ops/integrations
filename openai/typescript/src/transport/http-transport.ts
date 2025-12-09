import type { RequestOptions } from '../types/common.js';
import { mapHttpError } from '../errors/mapping.js';
import { OpenAIError } from '../errors/error.js';
import { APIConnectionError, TimeoutError, APIError } from '../errors/categories.js';

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
  signal?: AbortSignal;
}

export interface HttpTransport {
  request<T>(request: HttpRequest): Promise<T>;
  stream<T>(request: HttpRequest): AsyncIterable<T>;
  upload<T>(path: string, formData: FormData, options?: RequestOptions): Promise<T>;
  download(path: string, options?: RequestOptions): Promise<ArrayBuffer>;
}

export class FetchHttpTransport implements HttpTransport {
  constructor(
    private readonly baseUrl: string,
    private readonly defaultHeaders: Record<string, string> = {},
    private readonly defaultTimeout: number = 60000
  ) {}

  async request<T>(request: HttpRequest): Promise<T> {
    const url = this.buildUrl(request.path, request.query);
    const headers = { ...this.defaultHeaders, ...request.headers };

    const controller = new AbortController();
    const timeout = request.timeout ?? this.defaultTimeout;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: request.method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: request.body ? JSON.stringify(request.body) : undefined,
        signal: request.signal ?? controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const body = await response.text();
        throw mapHttpError(response.status, body, response.headers);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof OpenAIError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError();
      }
      throw new APIConnectionError('Connection failed', { cause: error as Error });
    }
  }

  async *stream<T>(request: HttpRequest): AsyncIterable<T> {
    const url = this.buildUrl(request.path, request.query);
    const headers = { ...this.defaultHeaders, ...request.headers };

    const response = await fetch(url, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...headers,
      },
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal: request.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw mapHttpError(response.status, body, response.headers);
    }

    if (!response.body) {
      throw new APIError('No response body', response.status);
    }

    yield* this.parseSSEStream<T>(response.body);
  }

  private async *parseSSEStream<T>(body: ReadableStream<Uint8Array>): AsyncIterable<T> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') return;
            try {
              yield JSON.parse(data) as T;
            } catch {}
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async upload<T>(path: string, formData: FormData, options?: RequestOptions): Promise<T> {
    const url = this.buildUrl(path);
    const headers = { ...this.defaultHeaders, ...options?.headers };
    delete headers['Content-Type']; // Let fetch set multipart boundary

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      signal: options?.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw mapHttpError(response.status, body, response.headers);
    }

    return await response.json();
  }

  async download(path: string, options?: RequestOptions): Promise<ArrayBuffer> {
    const url = this.buildUrl(path);
    const headers = { ...this.defaultHeaders, ...options?.headers };

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: options?.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw mapHttpError(response.status, body, response.headers);
    }

    return await response.arrayBuffer();
  }

  private buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(path, this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }
}
