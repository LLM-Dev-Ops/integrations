/**
 * Metrics collection for the Mistral client.
 */

/**
 * Metrics collector interface.
 */
export interface MetricsCollector {
  /** Records a request. */
  recordRequest(endpoint: string, method: string, durationMs: number, status: number): void;

  /** Records token usage. */
  recordTokens(promptTokens: number, completionTokens: number): void;

  /** Records an error. */
  recordError(endpoint: string, errorType: string): void;

  /** Records a retry attempt. */
  recordRetry(endpoint: string, attempt: number): void;

  /** Records circuit breaker state change. */
  recordCircuitBreakerState(state: string): void;

  /** Gets current metrics snapshot. */
  getMetrics(): ServiceMetrics;
}

/**
 * Aggregated service metrics.
 */
export interface ServiceMetrics {
  /** Total requests made. */
  totalRequests: number;
  /** Successful requests. */
  successfulRequests: number;
  /** Failed requests. */
  failedRequests: number;
  /** Total retries. */
  totalRetries: number;
  /** Total prompt tokens. */
  totalPromptTokens: number;
  /** Total completion tokens. */
  totalCompletionTokens: number;
  /** Average request duration in milliseconds. */
  avgDurationMs: number;
  /** Requests per endpoint. */
  requestsByEndpoint: Record<string, number>;
  /** Errors by type. */
  errorsByType: Record<string, number>;
  /** Current circuit breaker state. */
  circuitBreakerState: string;
}

/**
 * Default in-memory metrics collector.
 */
export class DefaultMetricsCollector implements MetricsCollector {
  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private totalRetries = 0;
  private totalPromptTokens = 0;
  private totalCompletionTokens = 0;
  private totalDurationMs = 0;
  private requestsByEndpoint: Record<string, number> = {};
  private errorsByType: Record<string, number> = {};
  private circuitBreakerState = 'closed';

  recordRequest(endpoint: string, _method: string, durationMs: number, status: number): void {
    this.totalRequests++;
    this.totalDurationMs += durationMs;

    if (status < 400) {
      this.successfulRequests++;
    } else {
      this.failedRequests++;
    }

    this.requestsByEndpoint[endpoint] = (this.requestsByEndpoint[endpoint] ?? 0) + 1;
  }

  recordTokens(promptTokens: number, completionTokens: number): void {
    this.totalPromptTokens += promptTokens;
    this.totalCompletionTokens += completionTokens;
  }

  recordError(_endpoint: string, errorType: string): void {
    this.errorsByType[errorType] = (this.errorsByType[errorType] ?? 0) + 1;
  }

  recordRetry(_endpoint: string, _attempt: number): void {
    this.totalRetries++;
  }

  recordCircuitBreakerState(state: string): void {
    this.circuitBreakerState = state;
  }

  getMetrics(): ServiceMetrics {
    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      totalRetries: this.totalRetries,
      totalPromptTokens: this.totalPromptTokens,
      totalCompletionTokens: this.totalCompletionTokens,
      avgDurationMs: this.totalRequests > 0 ? this.totalDurationMs / this.totalRequests : 0,
      requestsByEndpoint: { ...this.requestsByEndpoint },
      errorsByType: { ...this.errorsByType },
      circuitBreakerState: this.circuitBreakerState,
    };
  }

  /** Resets all metrics. */
  reset(): void {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.totalRetries = 0;
    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
    this.totalDurationMs = 0;
    this.requestsByEndpoint = {};
    this.errorsByType = {};
    this.circuitBreakerState = 'closed';
  }
}

/**
 * No-op metrics collector for when metrics are disabled.
 */
export class NoopMetricsCollector implements MetricsCollector {
  recordRequest(): void {}
  recordTokens(): void {}
  recordError(): void {}
  recordRetry(): void {}
  recordCircuitBreakerState(): void {}
  getMetrics(): ServiceMetrics {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalRetries: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      avgDurationMs: 0,
      requestsByEndpoint: {},
      errorsByType: {},
      circuitBreakerState: 'unknown',
    };
  }
}

/**
 * Creates a default metrics collector.
 */
export function createMetricsCollector(): MetricsCollector {
  return new DefaultMetricsCollector();
}
