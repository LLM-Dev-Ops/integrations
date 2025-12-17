/**
 * Airtable client core implementation following SPARC specification.
 *
 * Provides HTTP execution with authentication, rate limiting, circuit breaking,
 * and retry logic orchestration.
 */

import { AirtableConfig, AirtableConfigBuilder } from '../config/index.js';
import {
  AirtableError,
  AirtableApiErrorResponse,
  parseAirtableApiError,
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
import { Base, TableSchema } from '../types/index.js';

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
// Airtable Client
// ============================================================================

/**
 * Airtable API client with resilience and observability.
 *
 * Provides HTTP request execution with authentication, rate limiting,
 * circuit breaking, and retry logic.
 *
 * @example
 * ```typescript
 * const config = new AirtableConfigBuilder()
 *   .withToken('patXXXXXXXXXXXXXX')
 *   .build();
 *
 * const client = new AirtableClient(config);
 * const response = await client.get('/meta/bases');
 * ```
 */
export class AirtableClient {
  private readonly config: AirtableConfig;
  private readonly authProvider: AuthProvider;
  private readonly resilience: ResilienceOrchestrator;
  private readonly observability: Observability;

  /**
   * Creates a new Airtable API client.
   *
   * @param config - Airtable configuration
   * @param observability - Optional observability components (logger, metrics, tracer)
   */
  constructor(config: AirtableConfig, observability?: Observability) {
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
  get configuration(): AirtableConfig {
    return this.config;
  }

  /**
   * Gets the observability container.
   * Used by services that need access to logging, metrics, and tracing.
   *
   * @returns The observability container
   */
  getObservability(): Observability {
    return this.observability;
  }

  /**
   * Gets the base URL for API requests.
   */
  get baseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Executes an HTTP request with resilience and observability.
   *
   * @param options - Request options
   * @returns Response with data, status, and headers
   * @throws {AirtableError} On API errors
   * @throws {NetworkError} On network errors
   * @throws {TimeoutError} On request timeout
   */
  async request<T>(options: RequestOptions): Promise<Response<T>> {
    const startTime = Date.now();
    const operationName = `${options.method} ${options.path}`;

    return this.observability.tracer.withSpan(
      `airtable.request`,
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
            error_type: (error as AirtableError).code ?? 'unknown',
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
   *
   * @private
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
        let errorBody: AirtableApiErrorResponse | null = null;
        try {
          errorBody = await response.json() as AirtableApiErrorResponse;
        } catch {
          // Ignore JSON parse errors
        }

        // Extract retry-after header (in seconds)
        const retryAfterHeader = responseHeaders['retry-after'];
        const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

        throw parseAirtableApiError(
          response.status,
          errorBody,
          retryAfter
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

      if (error instanceof AirtableError) {
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
   *
   * @private
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
   *
   * @param path - Request path
   * @param query - Optional query parameters
   * @returns Response data
   */
  async get<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const response = await this.request<T>({ method: 'GET', path, query });
    return response.data;
  }

  /**
   * Performs a POST request.
   *
   * @param path - Request path
   * @param body - Request body
   * @returns Response data
   */
  async post<T>(path: string, body?: unknown): Promise<T> {
    const response = await this.request<T>({ method: 'POST', path, body });
    return response.data;
  }

  /**
   * Performs a PUT request.
   *
   * @param path - Request path
   * @param body - Request body
   * @returns Response data
   */
  async put<T>(path: string, body?: unknown): Promise<T> {
    const response = await this.request<T>({ method: 'PUT', path, body });
    return response.data;
  }

  /**
   * Performs a PATCH request.
   *
   * @param path - Request path
   * @param body - Request body
   * @returns Response data
   */
  async patch<T>(path: string, body?: unknown): Promise<T> {
    const response = await this.request<T>({ method: 'PATCH', path, body });
    return response.data;
  }

  /**
   * Performs a DELETE request.
   *
   * @param path - Request path
   * @returns Response data
   */
  async delete<T = void>(path: string): Promise<T> {
    const response = await this.request<T>({ method: 'DELETE', path });
    return response.data;
  }

  // ============================================================================
  // Base Access
  // ============================================================================

  /**
   * Creates a handle for base-scoped operations.
   *
   * @param baseId - The Airtable base ID (e.g., "appXXXXXXXXXXXXXX")
   * @returns A BaseHandle instance for the specified base
   *
   * @example
   * ```typescript
   * const base = client.base('appXXXXXXXXXXXXXX');
   * const tables = await base.listTables();
   * ```
   */
  base(baseId: string): BaseHandle {
    return new BaseHandle(this, baseId);
  }

  // ============================================================================
  // Resilience Access
  // ============================================================================

  /**
   * Gets resilience statistics.
   *
   * @returns Current state of rate limiter and circuit breaker
   */
  getResilienceStats(): ReturnType<ResilienceOrchestrator['getStats']> {
    return this.resilience.getStats();
  }

  /**
   * Resets resilience state (use with caution).
   *
   * This will reset rate limiters, circuit breakers, and clear any queued requests.
   */
  resetResilience(): void {
    this.resilience.reset();
  }
}

// ============================================================================
// Base Handle
// ============================================================================

/**
 * Handle for base-scoped operations.
 * Provides access to tables and base-level metadata.
 */
export class BaseHandle {
  private readonly client: AirtableClient;
  private readonly baseId: string;

  /**
   * Creates a new BaseHandle.
   *
   * @param client - The AirtableClient instance
   * @param baseId - The Airtable base ID
   */
  constructor(client: AirtableClient, baseId: string) {
    this.client = client;
    this.baseId = baseId;
  }

  /**
   * Creates a handle for table-scoped operations.
   *
   * @param tableIdOrName - The table ID (e.g., "tblXXXXXXXXXXXXXX") or table name
   * @returns A TableHandle instance for the specified table
   *
   * @example
   * ```typescript
   * const table = base.table('tblXXXXXXXXXXXXXX');
   * // or by name
   * const table = base.table('Tasks');
   * ```
   */
  table(tableIdOrName: string): TableHandle {
    return new TableHandle(this.client, this.baseId, tableIdOrName);
  }

  /**
   * Lists all tables in the base.
   *
   * @returns Array of table schemas
   *
   * @example
   * ```typescript
   * const tables = await base.listTables();
   * console.log(tables.map(t => t.name));
   * ```
   */
  async listTables(): Promise<TableSchema[]> {
    const response = await this.client.get<{ tables: TableSchema[] }>(
      `/${this.baseId}/tables`
    );
    return response.tables;
  }

  /**
   * Gets the base schema including all tables and their metadata.
   *
   * @returns Base schema with table information
   *
   * @example
   * ```typescript
   * const schema = await base.getSchema();
   * console.log(schema.name);
   * ```
   */
  async getSchema(): Promise<Base> {
    return this.client.get<Base>(`/${this.baseId}`);
  }
}

// ============================================================================
// Table Handle
// ============================================================================

/**
 * Handle for table-scoped operations.
 * Provides access to records and table-level operations.
 */
export class TableHandle {
  private readonly client: AirtableClient;
  private readonly baseId: string;
  private readonly tableIdOrName: string;

  /**
   * Creates a new TableHandle.
   *
   * @param client - The AirtableClient instance
   * @param baseId - The Airtable base ID
   * @param tableIdOrName - The table ID or table name
   */
  constructor(client: AirtableClient, baseId: string, tableIdOrName: string) {
    this.client = client;
    this.baseId = baseId;
    this.tableIdOrName = tableIdOrName;
  }

  /**
   * Gets the underlying AirtableClient instance.
   * Useful for service implementations.
   *
   * @returns The AirtableClient instance
   */
  getClient(): AirtableClient {
    return this.client;
  }

  /**
   * Gets the base ID.
   *
   * @returns The base ID
   */
  getBaseId(): string {
    return this.baseId;
  }

  /**
   * Gets the table ID or name.
   *
   * @returns The table ID or name
   */
  getTableIdOrName(): string {
    return this.tableIdOrName;
  }
}

// ============================================================================
// Client Factory
// ============================================================================

/**
 * Creates an Airtable client from a configuration.
 *
 * @param config - Airtable configuration
 * @param observability - Optional observability components
 * @returns Configured Airtable client
 *
 * @example
 * ```typescript
 * const config = new AirtableConfigBuilder()
 *   .withToken('patXXXXXXXXXXXXXX')
 *   .build();
 *
 * const client = createAirtableClient(config);
 * ```
 */
export function createAirtableClient(config: AirtableConfig, observability?: Observability): AirtableClient {
  return new AirtableClient(config, observability);
}

/**
 * Creates an Airtable client from environment variables.
 *
 * Environment variables:
 * - AIRTABLE_PAT or AIRTABLE_API_KEY: Personal Access Token (required)
 * - AIRTABLE_BASE_URL: Custom base URL (optional)
 * - AIRTABLE_TIMEOUT_MS: Request timeout in milliseconds
 * - AIRTABLE_RATE_LIMIT_RPS: Rate limit requests per second
 * - AIRTABLE_MAX_RETRIES: Maximum retry attempts
 *
 * @param observability - Optional observability components
 * @returns Configured Airtable client
 *
 * @example
 * ```typescript
 * // Requires AIRTABLE_PAT environment variable
 * const client = createAirtableClientFromEnv();
 * ```
 */
export function createAirtableClientFromEnv(observability?: Observability): AirtableClient {
  const config = AirtableConfigBuilder.fromEnv().build();
  return new AirtableClient(config, observability);
}
