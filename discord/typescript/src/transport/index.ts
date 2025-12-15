/**
 * HTTP transport layer for Discord API.
 */

import { DiscordConfig } from '../config/index.js';
import {
  parseDiscordApiError,
  NetworkError,
  DiscordApiErrorResponse,
} from '../errors/index.js';
import { RateLimiter, buildRoute } from '../resilience/rate-limiter.js';
import { RetryExecutor } from '../resilience/retry.js';
import { SimulationLayer, SerializedResponse } from '../simulation/index.js';
import {
  Logger,
  MetricsCollector,
  Tracer,
  SpanContext,
  MetricNames,
} from '../observability/index.js';

/**
 * Discord API request parameters.
 */
export interface DiscordRequest {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** API endpoint path (relative to base URL) */
  path: string;
  /** Request body */
  body?: unknown;
  /** Whether this is a webhook request (no auth header needed) */
  isWebhook?: boolean;
  /** Operation name for logging/metrics */
  operation: string;
  /** Major parameters for rate limiting */
  majorParams?: {
    channelId?: string;
    guildId?: string;
    webhookId?: string;
  };
  /** Query parameters */
  query?: Record<string, string | boolean | number>;
}

/**
 * Discord API response.
 */
export interface DiscordResponse<T = unknown> {
  /** Response data */
  data: T;
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers: Headers;
}

/**
 * HTTP transport for Discord API.
 */
export class DiscordTransport {
  private readonly config: DiscordConfig;
  private readonly rateLimiter: RateLimiter;
  private readonly retryExecutor: RetryExecutor;
  private readonly simulation: SimulationLayer;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;
  private readonly tracer: Tracer;

  constructor(options: {
    config: DiscordConfig;
    rateLimiter: RateLimiter;
    retryExecutor: RetryExecutor;
    simulation: SimulationLayer;
    logger: Logger;
    metrics: MetricsCollector;
    tracer: Tracer;
  }) {
    this.config = options.config;
    this.rateLimiter = options.rateLimiter;
    this.retryExecutor = options.retryExecutor;
    this.simulation = options.simulation;
    this.logger = options.logger;
    this.metrics = options.metrics;
    this.tracer = options.tracer;
  }

  /**
   * Executes a Discord API request.
   */
  async execute<T>(request: DiscordRequest): Promise<DiscordResponse<T>> {
    const span = this.tracer.startSpan(`discord.${request.operation}`, {
      'http.method': request.method,
      'http.url': request.path,
    });

    const startTime = Date.now();
    const route = buildRoute(request.method, request.path, request.majorParams);

    this.logger.debug('Executing Discord request', {
      operation: request.operation,
      method: request.method,
      path: request.path,
    });

    this.metrics.incrementCounter(MetricNames.REQUESTS_TOTAL, 1, {
      operation: request.operation,
      method: request.method,
    });

    try {
      // Check simulation replay mode
      if (this.simulation.isReplay()) {
        const simResponse = this.simulation.replay(request.operation, {
          method: request.method,
          url: this.buildUrl(request.path, request.query),
          headers: this.buildHeaders(request.isWebhook),
          body: request.body,
        });

        if (simResponse) {
          return this.handleSimulatedResponse<T>(simResponse, span);
        }
      }

      // Acquire rate limit slot
      await this.rateLimiter.acquire(route);

      // Execute with retry
      const response = await this.retryExecutor.execute(async () => {
        return this.executeRequest(request, route);
      });

      const durationMs = Date.now() - startTime;

      // Record simulation if in recording mode
      if (this.simulation.isRecording()) {
        this.simulation.record(
          request.operation,
          {
            method: request.method,
            url: this.buildUrl(request.path, request.query),
            headers: this.buildHeaders(request.isWebhook),
            body: request.body,
          },
          {
            status: response.status,
            statusText: 'OK',
            headers: response.headers,
            body: response.data,
          },
          durationMs
        );
      }

      // Record metrics
      this.metrics.incrementCounter(MetricNames.REQUESTS_SUCCESS, 1, {
        operation: request.operation,
      });
      this.metrics.recordHistogram(MetricNames.REQUEST_LATENCY, durationMs / 1000, {
        operation: request.operation,
      });

      span.setAttribute('http.status_code', response.status);
      span.setStatus('ok');
      span.end();

      return response as DiscordResponse<T>;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.metrics.incrementCounter(MetricNames.REQUESTS_FAILED, 1, {
        operation: request.operation,
      });
      this.metrics.recordHistogram(MetricNames.REQUEST_LATENCY, durationMs / 1000, {
        operation: request.operation,
      });

      span.setStatus('error', error instanceof Error ? error.message : 'Unknown error');
      span.end();

      this.logger.error('Discord request failed', {
        operation: request.operation,
        error: error instanceof Error ? error.message : String(error),
        durationMs,
      });

      throw error;
    }
  }

  /**
   * Executes a single HTTP request.
   */
  private async executeRequest(
    request: DiscordRequest,
    route: string
  ): Promise<DiscordResponse> {
    const url = this.buildUrl(request.path, request.query);
    const headers = this.buildHeaders(request.isWebhook);

    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    };

    if (request.body !== undefined) {
      fetchOptions.body = JSON.stringify(request.body);
    }

    let response: Response;
    try {
      response = await fetch(url, fetchOptions);
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.name === 'TimeoutError') {
          throw new NetworkError('Request timeout', error);
        }
        throw new NetworkError(error.message, error);
      }
      throw new NetworkError('Unknown network error');
    }

    // Update rate limit state
    this.rateLimiter.updateFromResponse(route, response.headers);

    // Parse response
    let data: unknown;
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = text || null;
    }

    // Handle errors
    if (!response.ok) {
      const apiError = data as DiscordApiErrorResponse | null;
      const retryAfter = response.headers.get('Retry-After');

      if (response.status === 429) {
        this.metrics.incrementCounter(MetricNames.RATE_LIMITS_HIT, 1, { route });
      }

      throw parseDiscordApiError(
        response.status,
        apiError,
        retryAfter ?? undefined
      );
    }

    return {
      data,
      status: response.status,
      headers: response.headers,
    };
  }

  /**
   * Builds the full URL for a request.
   */
  private buildUrl(path: string, query?: Record<string, string | boolean | number>): string {
    let url = `${this.config.baseUrl}${path}`;

    if (query && Object.keys(query).length > 0) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      }
      url += `?${params.toString()}`;
    }

    return url;
  }

  /**
   * Builds request headers.
   */
  private buildHeaders(isWebhook?: boolean): Headers {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'User-Agent': this.config.userAgent,
    });

    if (!isWebhook && this.config.botToken) {
      headers.set('Authorization', `Bot ${this.config.botToken}`);
    }

    return headers;
  }

  /**
   * Handles a simulated response.
   */
  private handleSimulatedResponse<T>(
    simResponse: SerializedResponse,
    span: SpanContext
  ): DiscordResponse<T> {
    const headers = new Headers(simResponse.headers);

    span.setAttribute('http.status_code', simResponse.status);
    span.setAttribute('simulation', true);
    span.setStatus('ok');
    span.end();

    this.logger.debug('Returning simulated response', {
      status: simResponse.status,
    });

    return {
      data: simResponse.body as T,
      status: simResponse.status,
      headers,
    };
  }
}
