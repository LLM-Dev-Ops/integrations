/**
 * HTTP Transport layer for Slack API.
 */

import { SlackError, NetworkError, RateLimitError, AuthenticationError, ServerError } from '../errors';

/**
 * HTTP request options
 */
export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

/**
 * HTTP response
 */
export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  data: T;
}

/**
 * Slack API response structure
 */
export interface SlackApiResponse<T = unknown> {
  ok: boolean;
  error?: string;
  warning?: string;
  response_metadata?: {
    next_cursor?: string;
    messages?: string[];
  };
  [key: string]: unknown;
}

/**
 * Transport interface
 */
export interface HttpTransport {
  request<T>(url: string, options: RequestOptions): Promise<HttpResponse<T>>;
}

/**
 * Default fetch-based transport
 */
export class FetchTransport implements HttpTransport {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private defaultTimeout: number;

  constructor(options: {
    baseUrl?: string;
    defaultHeaders?: Record<string, string>;
    defaultTimeout?: number;
  } = {}) {
    this.baseUrl = options.baseUrl ?? 'https://slack.com/api';
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.defaultTimeout = options.defaultTimeout ?? 30000;
  }

  async request<T>(url: string, options: RequestOptions): Promise<HttpResponse<T>> {
    const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}/${url}`;
    const timeout = options.timeout ?? this.defaultTimeout;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: Record<string, string> = {
        ...this.defaultHeaders,
        ...options.headers,
      };

      let body: string | FormData | undefined;
      if (options.body) {
        if (options.body instanceof FormData) {
          body = options.body;
        } else {
          headers['Content-Type'] = headers['Content-Type'] ?? 'application/json; charset=utf-8';
          body = JSON.stringify(options.body);
        }
      }

      const response = await fetch(fullUrl, {
        method: options.method,
        headers,
        body,
        signal: controller.signal,
      });

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key.toLowerCase()] = value;
      });

      const data = await response.json() as T;

      return {
        status: response.status,
        headers: responseHeaders,
        data,
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new NetworkError(`Request timeout after ${timeout}ms`);
        }
        throw new NetworkError(error.message);
      }
      throw new NetworkError('Unknown network error');
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Slack API client transport with authentication
 */
export class SlackTransport implements HttpTransport {
  private transport: HttpTransport;
  private token: string;

  constructor(token: string, transport?: HttpTransport) {
    this.token = token;
    this.transport = transport ?? new FetchTransport();
  }

  async request<T extends SlackApiResponse>(
    endpoint: string,
    options: RequestOptions
  ): Promise<HttpResponse<T>> {
    const headers: Record<string, string> = {
      ...options.headers,
      'Authorization': `Bearer ${this.token}`,
    };

    const response = await this.transport.request<T>(endpoint, {
      ...options,
      headers,
    });

    // Handle Slack-specific errors
    this.handleSlackResponse(response);

    return response;
  }

  private handleSlackResponse<T extends SlackApiResponse>(response: HttpResponse<T>): void {
    const { status, data, headers } = response;

    // Handle HTTP errors
    if (status === 429) {
      const retryAfter = parseInt(headers['retry-after'] ?? '60', 10);
      throw new RateLimitError('Rate limited by Slack API', retryAfter);
    }

    if (status === 401) {
      throw new AuthenticationError('Invalid or expired token');
    }

    if (status >= 500) {
      throw new ServerError(`Slack server error: ${status}`);
    }

    // Handle Slack API errors
    if (!data.ok && data.error) {
      throw SlackError.fromApiError(data.error, data);
    }
  }
}

/**
 * Create transport with token
 */
export function createTransport(token: string): SlackTransport {
  return new SlackTransport(token);
}
