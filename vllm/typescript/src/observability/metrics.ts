/**
 * Metrics Collection for vLLM Integration
 * Implements observability as per SPARC specification
 */

export interface MetricsCollector {
  incrementCounter(name: string, value: number, labels?: Record<string, string>): void;
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
  setGauge(name: string, value: number, labels?: Record<string, string>): void;
}

/**
 * In-memory metrics collector for testing and development
 */
export class InMemoryMetricsCollector implements MetricsCollector {
  private counters = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  private gauges = new Map<string, number>();

  incrementCounter(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    const current = this.counters.get(key) ?? 0;
    this.counters.set(key, current + value);
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    const values = this.histograms.get(key) ?? [];
    values.push(value);
    this.histograms.set(key, values);
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    this.gauges.set(key, value);
  }

  getCounter(name: string, labels?: Record<string, string>): number {
    return this.counters.get(this.makeKey(name, labels)) ?? 0;
  }

  getHistogram(name: string, labels?: Record<string, string>): number[] {
    return this.histograms.get(this.makeKey(name, labels)) ?? [];
  }

  getGauge(name: string, labels?: Record<string, string>): number | undefined {
    return this.gauges.get(this.makeKey(name, labels));
  }

  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }

  private makeKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}:${labelStr}`;
  }
}

/**
 * No-op metrics collector for production when metrics are disabled
 */
export class NoopMetricsCollector implements MetricsCollector {
  incrementCounter(_name: string, _value: number, _labels?: Record<string, string>): void {}
  recordHistogram(_name: string, _value: number, _labels?: Record<string, string>): void {}
  setGauge(_name: string, _value: number, _labels?: Record<string, string>): void {}
}

/**
 * Standard metric names for vLLM integration
 */
export const MetricNames = {
  // Request metrics
  REQUEST_COUNT: 'vllm.requests.total',
  REQUEST_DURATION_MS: 'vllm.requests.duration_ms',
  REQUEST_ERRORS: 'vllm.requests.errors',

  // Token metrics
  TOKENS_PROMPT: 'vllm.tokens.prompt',
  TOKENS_COMPLETION: 'vllm.tokens.completion',
  TOKENS_TOTAL: 'vllm.tokens.total',

  // Streaming metrics
  STREAM_CHUNKS: 'vllm.stream.chunks',
  STREAM_DURATION_MS: 'vllm.stream.duration_ms',

  // Batch metrics
  BATCH_SIZE: 'vllm.batch.size',
  BATCH_QUEUE_DEPTH: 'vllm.batch.queue_depth',
  BATCH_WAIT_TIME_MS: 'vllm.batch.wait_time_ms',

  // Connection metrics
  CONNECTION_POOL_SIZE: 'vllm.connection.pool_size',
  CONNECTION_POOL_ACTIVE: 'vllm.connection.pool_active',

  // Circuit breaker metrics
  CIRCUIT_BREAKER_STATE: 'vllm.circuit_breaker.state',
  CIRCUIT_BREAKER_FAILURES: 'vllm.circuit_breaker.failures',

  // Rate limiter metrics
  RATE_LIMIT_HITS: 'vllm.rate_limit.hits',
  RATE_LIMIT_WAIT_MS: 'vllm.rate_limit.wait_ms',

  // Server metrics (from vLLM /metrics endpoint)
  SERVER_KV_CACHE_USAGE: 'vllm.server.kv_cache_usage',
  SERVER_REQUESTS_RUNNING: 'vllm.server.requests_running',
  SERVER_REQUESTS_WAITING: 'vllm.server.requests_waiting',

  // Retry metrics
  RETRY_ATTEMPTS: 'vllm.retry.attempts',
} as const;

/**
 * Create a metrics collector based on environment
 */
export function createMetricsCollector(enabled: boolean): MetricsCollector {
  if (enabled) {
    return new InMemoryMetricsCollector();
  }
  return new NoopMetricsCollector();
}
