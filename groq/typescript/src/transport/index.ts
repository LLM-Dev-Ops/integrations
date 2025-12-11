/**
 * HTTP transport layer for the Groq client.
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import FormData from 'form-data';
import { AuthProvider } from '../auth';
import { GroqConfig } from '../config';
import { GroqError, fromApiError, ApiErrorResponse } from '../errors';

/**
 * HTTP request options.
 */
export interface HttpRequest {
  /** HTTP method. */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** URL path (relative to base URL). */
  path: string;
  /** Request body (JSON or FormData). */
  body?: unknown;
  /** Additional headers. */
  headers?: Record<string, string>;
  /** Request timeout override. */
  timeout?: number;
  /** Whether this is a streaming request. */
  stream?: boolean;
}

/**
 * HTTP response.
 */
export interface HttpResponse<T = unknown> {
  /** HTTP status code. */
  status: number;
  /** Response headers. */
  headers: Record<string, string>;
  /** Response body. */
  data: T;
  /** Request ID from headers. */
  requestId?: string;
}

/**
 * Streaming response.
 */
export interface StreamingResponse {
  /** Async iterator for SSE events. */
  events: AsyncIterable<string>;
  /** Request ID from headers. */
  requestId?: string;
}

/**
 * HTTP transport interface.
 */
export interface HttpTransport {
  /**
   * Sends a request and returns the response.
   */
  request<T>(req: HttpRequest): Promise<HttpResponse<T>>;

  /**
   * Sends a streaming request.
   */
  stream(req: HttpRequest): Promise<StreamingResponse>;
}

/**
 * Default HTTP transport using axios.
 */
export class AxiosTransport implements HttpTransport {
  private readonly client: AxiosInstance;
  private readonly auth: AuthProvider;
  private readonly config: GroqConfig;

  constructor(config: GroqConfig, auth: AuthProvider) {
    this.config = config;
    this.auth = auth;
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...config.customHeaders,
      },
      validateStatus: () => true, // Handle all status codes
    });
  }

  async request<T>(req: HttpRequest): Promise<HttpResponse<T>> {
    const axiosConfig: AxiosRequestConfig = {
      method: req.method,
      url: req.path,
      headers: {
        Authorization: this.auth.getAuthHeader(),
        ...req.headers,
      },
      timeout: req.timeout ?? this.config.timeout,
    };

    if (req.body) {
      if (req.body instanceof FormData) {
        axiosConfig.data = req.body;
        axiosConfig.headers = {
          ...axiosConfig.headers,
          ...req.body.getHeaders(),
        };
      } else {
        axiosConfig.data = req.body;
      }
    }

    try {
      const response: AxiosResponse = await this.client.request(axiosConfig);
      const requestId = this.extractRequestId(response);

      if (response.status >= 400) {
        throw this.handleErrorResponse(response.status, response.data, requestId);
      }

      return {
        status: response.status,
        headers: this.normalizeHeaders(response.headers),
        data: response.data as T,
        requestId,
      };
    } catch (error) {
      if (error instanceof GroqError) {
        throw error;
      }
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw GroqError.timeout(`Request timed out after ${this.config.timeout}ms`);
        }
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
          throw GroqError.network(`Network error: ${error.message}`, error);
        }
        throw GroqError.network(error.message, error);
      }
      throw GroqError.network(
        error instanceof Error ? error.message : 'Unknown network error'
      );
    }
  }

  async stream(req: HttpRequest): Promise<StreamingResponse> {
    const axiosConfig: AxiosRequestConfig = {
      method: req.method,
      url: req.path,
      headers: {
        Authorization: this.auth.getAuthHeader(),
        Accept: 'text/event-stream',
        ...req.headers,
      },
      timeout: 0, // No timeout for streaming
      responseType: 'stream',
    };

    if (req.body) {
      axiosConfig.data = req.body;
    }

    try {
      const response = await this.client.request(axiosConfig);
      const requestId = this.extractRequestId(response);

      if (response.status >= 400) {
        // For streaming errors, we need to read the body
        const chunks: Buffer[] = [];
        for await (const chunk of response.data) {
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        throw this.handleErrorResponse(response.status, body, requestId);
      }

      return {
        events: this.createEventIterator(response.data),
        requestId,
      };
    } catch (error) {
      if (error instanceof GroqError) {
        throw error;
      }
      if (axios.isAxiosError(error)) {
        throw GroqError.network(error.message, error);
      }
      throw GroqError.network(
        error instanceof Error ? error.message : 'Unknown streaming error'
      );
    }
  }

  private async *createEventIterator(
    stream: NodeJS.ReadableStream
  ): AsyncIterable<string> {
    let buffer = '';

    for await (const chunk of stream) {
      buffer += chunk.toString('utf-8');

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data !== '[DONE]') {
            yield data;
          }
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim().startsWith('data: ')) {
      const data = buffer.trim().slice(6);
      if (data !== '[DONE]') {
        yield data;
      }
    }
  }

  private extractRequestId(response: AxiosResponse): string | undefined {
    return (
      response.headers['x-request-id'] ??
      response.headers['x-groq-request-id'] ??
      undefined
    );
  }

  private normalizeHeaders(headers: Record<string, unknown>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string') {
        result[key.toLowerCase()] = value;
      } else if (Array.isArray(value)) {
        result[key.toLowerCase()] = value.join(', ');
      }
    }
    return result;
  }

  private handleErrorResponse(
    status: number,
    data: unknown,
    requestId?: string
  ): GroqError {
    if (this.isApiErrorResponse(data)) {
      return fromApiError(status, data, requestId);
    }
    return GroqError.server(
      `HTTP ${status}: ${JSON.stringify(data)}`,
      status,
      requestId
    );
  }

  private isApiErrorResponse(data: unknown): data is ApiErrorResponse {
    return (
      typeof data === 'object' &&
      data !== null &&
      'error' in data &&
      typeof (data as ApiErrorResponse).error === 'object' &&
      'message' in (data as ApiErrorResponse).error
    );
  }
}

/**
 * Creates an HTTP transport.
 */
export function createTransport(config: GroqConfig, auth: AuthProvider): HttpTransport {
  return new AxiosTransport(config, auth);
}
