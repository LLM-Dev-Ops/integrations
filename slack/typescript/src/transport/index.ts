/**
 * HTTP Transport layer for Slack API.
 */

import { SlackError, NetworkError, RateLimitError, AuthenticationError, ServerError } from '../errors';
import { TelemetryEmitter } from '../telemetry';
import { randomUUID } from 'crypto';

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
  private telemetry: TelemetryEmitter;

  constructor(token: string, transport?: HttpTransport) {
    this.token = token;
    this.transport = transport ?? new FetchTransport();
    this.telemetry = new TelemetryEmitter();
  }

  async request<T extends SlackApiResponse>(
    endpoint: string,
    options: RequestOptions
  ): Promise<HttpResponse<T>> {
    // Generate correlation ID for request tracing
    const correlationId = randomUUID();
    const startTime = Date.now();

    // Extract method name from endpoint (e.g., "chat.postMessage" from "/chat.postMessage")
    const method = endpoint.replace(/^\//, '').split('?')[0];

    // Emit request_start telemetry event
    try {
      await this.telemetry.emit({
        correlationId,
        integration: 'slack',
        provider: method,
        eventType: 'request_start',
        timestamp: startTime,
        metadata: {
          method,
          httpMethod: options.method,
        },
      });
    } catch (error) {
      // Telemetry is fail-open, but catch any unexpected errors
    }

    try {
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

      // Calculate latency
      const latencyMs = Date.now() - startTime;

      // Emit request_complete and latency telemetry events
      try {
        await Promise.all([
          this.telemetry.emit({
            correlationId,
            integration: 'slack',
            provider: method,
            eventType: 'request_complete',
            timestamp: Date.now(),
            metadata: {
              method,
              statusCode: response.status,
              ok: response.data.ok,
            },
          }),
          this.telemetry.emit({
            correlationId,
            integration: 'slack',
            provider: method,
            eventType: 'latency',
            timestamp: Date.now(),
            metadata: {
              method,
              latencyMs,
            },
          }),
        ]);
      } catch (error) {
        // Telemetry is fail-open
      }

      return response;
    } catch (error) {
      // Calculate latency even for errors
      const latencyMs = Date.now() - startTime;

      // Emit error telemetry event
      try {
        await this.telemetry.emit({
          correlationId,
          integration: 'slack',
          provider: method,
          eventType: 'error',
          timestamp: Date.now(),
          metadata: {
            method,
            latencyMs,
            errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
            errorMessage: error instanceof Error ? error.message : String(error),
          },
        });
      } catch (telemetryError) {
        // Telemetry is fail-open
      }

      // Re-throw the original error
      throw error;
    }
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
