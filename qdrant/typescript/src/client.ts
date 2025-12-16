/**
 * Qdrant client implementation.
 * Provides a production-ready interface for vector storage, similarity search,
 * and retrieval-augmented generation (RAG) workflows.
 *
 * @module client
 */

import { QdrantConfig, sanitizeConfigForLogging } from './config.js';
import {
  QdrantError,
  ConfigurationError,
  ConnectionError,
  TimeoutError,
  CircuitBreakerError,
  createErrorFromResponse,
} from './errors.js';
import {
  HealthStatus,
  CollectionInfo,
} from './types.js';
import {
  RetryExecutor,
  CircuitBreaker,
  createDefaultRetryExecutor,
  createDefaultCircuitBreaker,
  CircuitOpenError,
} from './connection/resilience.js';

/**
 * Metrics for operations tracking.
 * Implements atomic operations for thread-safety.
 */
class Metrics {
  private operationsCount = 0;
  private totalDurationMs = 0;
  private errorCount = 0;

  /**
   * Record a successful operation.
   */
  recordOperation(durationMs: number): void {
    this.operationsCount++;
    this.totalDurationMs += durationMs;
  }

  /**
   * Record an error.
   */
  recordError(): void {
    this.errorCount++;
  }

  /**
   * Get current metrics snapshot.
   */
  getSnapshot(): {
    operationsCount: number;
    averageDurationMs: number;
    errorCount: number;
    errorRate: number;
  } {
    return {
      operationsCount: this.operationsCount,
      averageDurationMs:
        this.operationsCount > 0
          ? this.totalDurationMs / this.operationsCount
          : 0,
      errorCount: this.errorCount,
      errorRate:
        this.operationsCount > 0
          ? this.errorCount / this.operationsCount
          : 0,
    };
  }

  /**
   * Reset all metrics.
   */
  reset(): void {
    this.operationsCount = 0;
    this.totalDurationMs = 0;
    this.errorCount = 0;
  }
}

/**
 * Collection-scoped client for Qdrant operations.
 * Delegates to the main QdrantClient but scopes operations to a specific collection.
 */
export class CollectionClient {
  constructor(
    private readonly client: QdrantClient,
    private readonly collectionName: string
  ) {}

  /**
   * Get the collection name.
   */
  getName(): string {
    return this.collectionName;
  }

  /**
   * Get collection information.
   */
  async getInfo(): Promise<CollectionInfo> {
    const collections = await this.client.listCollections();
    const collection = collections.find(c => c.name === this.collectionName);
    if (!collection) {
      throw new QdrantError({
        type: 'collection_error',
        message: `Collection not found: ${this.collectionName}`,
        isRetryable: false,
        status: 404,
      });
    }
    return collection;
  }

  /**
   * Delete this collection.
   */
  async delete(): Promise<void> {
    await this.client.request('DELETE', `/collections/${this.collectionName}`);
  }
}

/**
 * Main Qdrant client.
 * Provides REST API access with circuit breaker and retry logic.
 */
export class QdrantClient {
  private readonly config: QdrantConfig;
  private readonly baseUrl: string;
  private readonly retryExecutor: RetryExecutor;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly metrics: Metrics;
  private closed = false;

  /**
   * Creates a new Qdrant client.
   * @param config - The Qdrant configuration.
   */
  constructor(config: QdrantConfig) {
    this.config = config;
    this.baseUrl = this.buildBaseUrl();
    this.retryExecutor = createDefaultRetryExecutor();
    this.circuitBreaker = createDefaultCircuitBreaker();
    this.metrics = new Metrics();
  }

  /**
   * Creates a Qdrant client from environment variables.
   *
   * Environment variables:
   * - QDRANT_URL: Full URL (overrides host/port)
   * - QDRANT_HOST: Server host
   * - QDRANT_PORT: Server port
   * - QDRANT_API_KEY: API key for authentication
   * - QDRANT_TLS: Enable TLS (true/false)
   * - QDRANT_CA_CERT: Path to CA certificate file
   * - QDRANT_VERIFY_TLS: Verify TLS certificates (true/false)
   * - QDRANT_TIMEOUT_SECS: Request timeout in seconds
   * - QDRANT_MAX_RETRIES: Maximum retry attempts
   * - QDRANT_POOL_SIZE: Connection pool size
   *
   * @returns A new Qdrant client instance.
   * @throws {ConfigurationError} If environment configuration is invalid.
   */
  static async fromEnv(): Promise<QdrantClient> {
    const { createConfigFromEnv } = await import('./config.js');
    const config = createConfigFromEnv().build();
    return new QdrantClient(config);
  }

  /**
   * Creates a Qdrant client for Qdrant Cloud.
   * @param url - The Qdrant Cloud URL (e.g., "https://xyz-example.eu-central.aws.cloud.qdrant.io:6333").
   * @param apiKey - The Qdrant Cloud API key.
   * @returns A new Qdrant client instance configured for cloud.
   */
  static async cloud(url: string, apiKey: string): Promise<QdrantClient> {
    const { QdrantConfig } = await import('./config.js');
    const config = QdrantConfig.cloud(url, apiKey).build();
    return new QdrantClient(config);
  }

  /**
   * Creates a collection-scoped client.
   * @param name - The collection name.
   * @returns A collection-scoped client.
   */
  collection(name: string): CollectionClient {
    return new CollectionClient(this, name);
  }

  /**
   * List all collections.
   * @returns Array of collection information.
   */
  async listCollections(): Promise<CollectionInfo[]> {
    const response = await this.executeWithResilience(async () => {
      return await this.request<{ result: { collections: any[] } }>(
        'GET',
        '/collections'
      );
    });

    return response.result.collections.map((c: any) => ({
      name: c.name,
      status: c.status,
      vectorsCount: c.vectors_count,
      pointsCount: c.points_count,
      segmentsCount: c.segments_count,
    }));
  }

  /**
   * Perform a health check.
   * @returns Health status information.
   */
  async healthCheck(): Promise<HealthStatus> {
    const response = await this.request<{ title: string; version: string }>(
      'GET',
      '/healthz'
    );
    return {
      title: response.title,
      version: response.version,
    };
  }

  /**
   * Close the client and cleanup resources.
   */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    // Reset circuit breaker and metrics
    this.circuitBreaker.reset();
    this.metrics.reset();
  }

  /**
   * Check if the client is closed.
   */
  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Get current metrics snapshot.
   */
  getMetrics(): {
    operationsCount: number;
    averageDurationMs: number;
    errorCount: number;
    errorRate: number;
  } {
    return this.metrics.getSnapshot();
  }

  /**
   * Execute an operation with circuit breaker and retry logic.
   * @param operation - The operation to execute.
   * @returns The result of the operation.
   * @throws {CircuitBreakerError} If circuit breaker is open.
   * @throws {QdrantError} If operation fails after retries.
   */
  async executeWithResilience<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closed) {
      throw new ConfigurationError('Client is closed');
    }

    const startTime = Date.now();

    try {
      // Execute through circuit breaker
      const result = await this.circuitBreaker.execute(async () => {
        // Execute with retry logic
        return await this.retryExecutor.execute(operation);
      });

      // Record successful operation
      const duration = Date.now() - startTime;
      this.metrics.recordOperation(duration);

      return result;
    } catch (error) {
      // Record error
      this.metrics.recordError();

      // Wrap CircuitOpenError as CircuitBreakerError
      if (error instanceof CircuitOpenError) {
        throw new CircuitBreakerError(error.message);
      }

      throw error;
    }
  }

  /**
   * Make an HTTP request to the Qdrant API.
   * @param method - HTTP method.
   * @param path - API path (relative to base URL).
   * @param body - Optional request body.
   * @returns The response data.
   * @throws {QdrantError} If request fails.
   */
  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();

    // Set up timeout
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeout
    );

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add API key if configured (never log this)
      if (this.config.apiKey) {
        headers['api-key'] = this.config.apiKey;
      }

      // Add tracing headers if available
      // This could be extended to integrate with OpenTelemetry or similar
      const traceId = this.generateTraceId();
      headers['x-trace-id'] = traceId;

      const requestOptions: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (body !== undefined) {
        requestOptions.body = JSON.stringify(body);
      }

      // Log request (excluding sensitive headers)
      this.logRequest(method, path, traceId);

      const response = await fetch(url, requestOptions);

      clearTimeout(timeoutId);

      // Handle non-OK responses
      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      // Parse response
      const data = await response.json();

      // Log response
      this.logResponse(method, path, traceId, response.status);

      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      // Re-throw if it's already a QdrantError
      if (error instanceof QdrantError) {
        throw error;
      }

      // Handle abort/timeout
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError(
          `Request timeout after ${this.config.timeout}ms`,
          { path }
        );
      }

      // Handle network errors
      if (error instanceof Error) {
        if (
          error.message.includes('fetch') ||
          error.message.includes('network') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ENOTFOUND')
        ) {
          throw new ConnectionError(
            `Network request failed: ${error.message}`,
            error,
            { path }
          );
        }
      }

      // Generic error
      throw new QdrantError({
        type: 'unknown_error',
        message: error instanceof Error ? error.message : String(error),
        isRetryable: false,
        details: { path },
      });
    }
  }

  /**
   * Build the base URL from configuration.
   */
  private buildBaseUrl(): string {
    const protocol = this.config.useTls ? 'https' : 'http';
    return `${protocol}://${this.config.host}:${this.config.port}`;
  }

  /**
   * Handle error responses from the API.
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const status = response.status;
    let errorBody: any;

    try {
      errorBody = await response.json();
    } catch {
      // If response is not JSON, use text
      const text = await response.text();
      errorBody = { error: { message: text || `HTTP ${status} error` } };
    }

    const errorMessage =
      errorBody?.status?.error ??
      errorBody?.error?.message ??
      errorBody?.message ??
      `HTTP ${status} error`;

    const errorDetails = errorBody?.error ?? errorBody;

    // Extract retry-after header if present
    const retryAfterHeader = response.headers.get('retry-after');
    const retryAfter = retryAfterHeader
      ? parseInt(retryAfterHeader, 10)
      : undefined;

    if (retryAfter) {
      errorDetails.retryAfter = retryAfter;
    }

    throw createErrorFromResponse(status, errorMessage, errorDetails);
  }

  /**
   * Generate a trace ID for request tracking.
   */
  private generateTraceId(): string {
    return `qdrant-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Log request (excluding sensitive information).
   */
  private logRequest(method: string, path: string, traceId: string): void {
    // Only log in debug mode or if logging is configured
    if (process.env.QDRANT_DEBUG === 'true') {
      console.debug(`[${traceId}] ${method} ${path}`);
    }
  }

  /**
   * Log response.
   */
  private logResponse(
    method: string,
    path: string,
    traceId: string,
    status: number
  ): void {
    // Only log in debug mode or if logging is configured
    if (process.env.QDRANT_DEBUG === 'true') {
      console.debug(`[${traceId}] ${method} ${path} -> ${status}`);
    }
  }
}

/**
 * Export default client constructor.
 */
export default QdrantClient;
