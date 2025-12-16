/**
 * Jira client core implementation following SPARC specification.
 *
 * Provides HTTP execution with authentication, rate limiting, circuit breaking,
 * and retry logic orchestration.
 */

import { JiraConfig, JiraConfigBuilder } from '../config/index.js';
import {
  JiraError,
  JiraApiErrorResponse,
  parseJiraApiError,
  NetworkError,
  TimeoutError,
} from '../errors/index.js';
import { AuthProvider, createAuthProvider } from '../auth/index.js';
import { ResilienceOrchestrator } from '../resilience/index.js';
import {
  Observability,
  createNoopObservability,
  MetricNames,
  Logger,
  MetricsCollector,
  Tracer,
} from '../observability/index.js';

// ============================================================================
// HTTP Request/Response Types
// ============================================================================

/**
 * HTTP method type.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Request options.
 */
export interface RequestOptions {
  /** HTTP method */
  method: HttpMethod;
  /** Request path (relative to API base) */
  path: string;
  /** Query parameters */
  query?: Record<string, string | number | boolean | undefined>;
  /** Request body */
  body?: unknown;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Skip retry logic */
  skipRetry?: boolean;
  /** Skip rate limiting */
  skipRateLimit?: boolean;
}

/**
 * Response wrapper.
 */
export interface Response<T> {
  /** Response data */
  data: T;
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers: Record<string, string>;
}

// ============================================================================
// Jira Client
// ============================================================================

/**
 * Jira API client with resilience and observability.
 */
export class JiraClient {
  private readonly config: JiraConfig;
  private readonly authProvider: AuthProvider;
  private readonly resilience: ResilienceOrchestrator;
  private readonly observability: Observability;

  constructor(config: JiraConfig, observability?: Observability) {
    this.config = config;
    this.observability = observability ?? createNoopObservability();
    this.authProvider = createAuthProvider(config.auth, this.observability.logger);
    this.resilience = new ResilienceOrchestrator(
      config.rateLimitConfig,
      config.circuitBreakerConfig,
      config.retryConfig,
      {
        onRetry: (attempt, error, delayMs) => {
          this.observability.logger.warn('Retrying request', {
            attempt,
            error: error.message,
            delayMs,
          });
        },
        onRetriesExhausted: (error, attempts) => {
          this.observability.logger.error('Retries exhausted', {
            error: error.message,
            attempts,
          });
        },
      }
    );
  }

  /**
   * Gets the logger instance.
   */
  get logger(): Logger {
    return this.observability.logger;
  }

  /**
   * Gets the metrics collector instance.
   */
  get metrics(): MetricsCollector {
    return this.observability.metrics;
  }

  /**
   * Gets the tracer instance.
   */
  get tracer(): Tracer {
    return this.observability.tracer;
  }

  /**
   * Gets the configuration.
   */
  get configuration(): JiraConfig {
    return this.config;
  }

  /**
   * Gets the base URL for API requests.
   */
  get baseUrl(): string {
    return `${this.config.siteUrl}${this.config.apiVersion}`;
  }

  /**
   * Executes an HTTP request.
   */
  async request<T>(options: RequestOptions): Promise<Response<T>> {
    const startTime = Date.now();
    const operationName = `${options.method} ${options.path}`;

    return this.observability.tracer.withSpan(
      `jira.request`,
      async (span) => {
        span.setAttribute('http.method', options.method);
        span.setAttribute('http.path', options.path);

        try {
          const response = await this.resilience.execute(
            () => this.executeRequest<T>(options),
            {
              skipRateLimit: options.skipRateLimit,
              skipRetry: options.skipRetry,
            }
          );

          // Record success metrics
          this.observability.metrics.increment(MetricNames.OPERATIONS_TOTAL, 1, {
            operation: options.method,
            status: 'success',
          });
          this.observability.metrics.timing(
            MetricNames.OPERATION_LATENCY,
            Date.now() - startTime,
            { operation: options.method }
          );

          span.setAttribute('http.status_code', response.status);
          span.setStatus('OK');

          return response;
        } catch (error) {
          // Record error metrics
          this.observability.metrics.increment(MetricNames.ERRORS_TOTAL, 1, {
            operation: options.method,
            error_type: (error as JiraError).code ?? 'unknown',
          });

          span.recordException(error as Error);
          throw error;
        }
      },
      { operation: operationName }
    );
  }

  /**
   * Executes the actual HTTP request.
   */
  private async executeRequest<T>(options: RequestOptions): Promise<Response<T>> {
    const url = this.buildUrl(options.path, options.query);
    const authHeaders = await this.authProvider.getAuthHeaders();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': this.config.userAgent,
      ...authHeaders,
      ...options.headers,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.requestTimeoutMs
    );

    try {
      const fetchOptions: RequestInit = {
        method: options.method,
        headers,
        signal: controller.signal,
      };

      if (options.body !== undefined) {
        fetchOptions.body = JSON.stringify(options.body);
      }

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      // Extract headers
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key.toLowerCase()] = value;
      });

      // Handle error responses
      if (!response.ok) {
        let errorBody: JiraApiErrorResponse | null = null;
        try {
          errorBody = await response.json() as JiraApiErrorResponse;
        } catch {
          // Ignore JSON parse errors
        }

        throw parseJiraApiError(
          response.status,
          errorBody,
          responseHeaders['retry-after']
        );
      }

      // Parse successful response
      let data: T;
      const contentType = responseHeaders['content-type'] ?? '';
      if (contentType.includes('application/json')) {
        const text = await response.text();
        data = text ? JSON.parse(text) as T : (undefined as T);
      } else {
        data = undefined as T;
      }

      return {
        data,
        status: response.status,
        headers: responseHeaders,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof JiraError) {
        throw error;
      }

      // Handle abort/timeout
      if ((error as Error).name === 'AbortError') {
        throw new TimeoutError(this.config.requestTimeoutMs);
      }

      // Handle network errors
      throw new NetworkError((error as Error).message, error as Error);
    }
  }

  /**
   * Builds the full URL with query parameters.
   */
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

  // ============================================================================
  // Convenience Methods
  // ============================================================================

  /**
   * Performs a GET request.
   */
  async get<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const response = await this.request<T>({ method: 'GET', path, query });
    return response.data;
  }

  /**
   * Performs a POST request.
   */
  async post<T>(path: string, body?: unknown): Promise<T> {
    const response = await this.request<T>({ method: 'POST', path, body });
    return response.data;
  }

  /**
   * Performs a PUT request.
   */
  async put<T>(path: string, body?: unknown): Promise<T> {
    const response = await this.request<T>({ method: 'PUT', path, body });
    return response.data;
  }

  /**
   * Performs a DELETE request.
   */
  async delete<T = void>(path: string): Promise<T> {
    const response = await this.request<T>({ method: 'DELETE', path });
    return response.data;
  }

  // ============================================================================
  // Resilience Access
  // ============================================================================

  /**
   * Gets resilience statistics.
   */
  getResilienceStats(): ReturnType<ResilienceOrchestrator['getStats']> {
    return this.resilience.getStats();
  }

  /**
   * Resets resilience state (use with caution).
   */
  resetResilience(): void {
    this.resilience.reset();
  }
}

// ============================================================================
// Client Factory
// ============================================================================

/**
 * Creates a Jira client from a configuration.
 */
export function createJiraClient(config: JiraConfig, observability?: Observability): JiraClient {
  return new JiraClient(config, observability);
}

/**
 * Creates a Jira client from environment variables.
 */
export function createJiraClientFromEnv(observability?: Observability): JiraClient {
  const config = JiraConfigBuilder.fromEnv().build();
  return new JiraClient(config, observability);
}
