/**
 * LLM metrics collector - Tracks LLM API requests, tokens, latencies, and errors.
 */

/**
 * LLM latency buckets (in seconds) - optimized for typical LLM response times.
 */
export const LLM_LATENCY_BUCKETS = [
  0.1,   // 100ms - very fast cached responses
  0.5,   // 500ms - fast responses
  1.0,   // 1s - typical short responses
  2.5,   // 2.5s - medium responses
  5.0,   // 5s - longer responses
  10.0,  // 10s - very long responses
  30.0,  // 30s - streaming or complex requests
  60.0   // 60s - maximum expected
];

/**
 * LLM request parameters for recording metrics.
 */
export interface LlmRequestParams {
  model: string;
  provider: string;
  operation: string;
  status: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/**
 * Minimal MetricsRegistry interface.
 */
interface MetricsRegistry {
  counterVec(config: any): CounterVec;
  histogramVec(config: any): HistogramVec;
  gaugeVec(config: any): GaugeVec;
}

/**
 * Minimal Counter Vector interface.
 */
interface CounterVec {
  labels(labels: Record<string, string>): Counter;
}

/**
 * Minimal Counter interface.
 */
interface Counter {
  inc(value?: number): void;
}

/**
 * Minimal Histogram Vector interface.
 */
interface HistogramVec {
  labels(labels: Record<string, string>): Histogram;
}

/**
 * Minimal Histogram interface.
 */
interface Histogram {
  observe(value: number): void;
}

/**
 * Minimal Gauge Vector interface.
 */
interface GaugeVec {
  labels(labels: Record<string, string>): Gauge;
}

/**
 * Minimal Gauge interface.
 */
interface Gauge {
  inc(value?: number): void;
  dec(value?: number): void;
  set(value: number): void;
}

/**
 * Collector for LLM-specific metrics.
 * Tracks requests, tokens, latencies, and errors.
 */
export class LlmMetricsCollector {
  private readonly requestsTotal: CounterVec;
  private readonly requestDuration: HistogramVec;
  private readonly tokensTotal: CounterVec;
  private readonly streamingChunks: CounterVec;
  private readonly errorsTotal: CounterVec;
  private readonly activeRequests: GaugeVec;

  constructor(registry: MetricsRegistry) {
    // Total number of LLM API requests
    this.requestsTotal = registry.counterVec({
      name: 'llm_requests_total',
      help: 'Total number of LLM API requests',
      labelNames: ['model', 'provider', 'operation', 'status']
    });

    // LLM request latency distribution
    this.requestDuration = registry.histogramVec({
      name: 'llm_request_duration_seconds',
      help: 'LLM request latency distribution',
      labelNames: ['model', 'provider', 'operation'],
      buckets: LLM_LATENCY_BUCKETS
    });

    // Total tokens processed
    this.tokensTotal = registry.counterVec({
      name: 'llm_tokens_total',
      help: 'Total number of tokens processed',
      labelNames: ['model', 'provider', 'type']
    });

    // Streaming chunks received
    this.streamingChunks = registry.counterVec({
      name: 'llm_streaming_chunks_total',
      help: 'Total number of streaming chunks received',
      labelNames: ['model', 'provider']
    });

    // LLM errors
    this.errorsTotal = registry.counterVec({
      name: 'llm_errors_total',
      help: 'Total number of LLM API errors',
      labelNames: ['model', 'provider', 'error_type']
    });

    // Active LLM requests
    this.activeRequests = registry.gaugeVec({
      name: 'llm_active_requests',
      help: 'Number of currently active LLM requests',
      labelNames: ['model', 'provider']
    });
  }

  /**
   * Record an LLM request completion.
   */
  recordRequest(params: LlmRequestParams): void {
    // Increment request counter
    this.requestsTotal.labels({
      model: params.model,
      provider: params.provider,
      operation: params.operation,
      status: params.status
    }).inc();

    // Record request duration
    this.requestDuration.labels({
      model: params.model,
      provider: params.provider,
      operation: params.operation
    }).observe(params.durationMs / 1000);

    // Record tokens if provided
    if (params.inputTokens !== undefined) {
      this.tokensTotal.labels({
        model: params.model,
        provider: params.provider,
        type: 'input'
      }).inc(params.inputTokens);
    }

    if (params.outputTokens !== undefined) {
      this.tokensTotal.labels({
        model: params.model,
        provider: params.provider,
        type: 'output'
      }).inc(params.outputTokens);
    }

    if (params.totalTokens !== undefined) {
      this.tokensTotal.labels({
        model: params.model,
        provider: params.provider,
        type: 'total'
      }).inc(params.totalTokens);
    }
  }

  /**
   * Record a streaming chunk received.
   */
  recordStreamingChunk(model: string, provider: string): void {
    this.streamingChunks.labels({
      model,
      provider
    }).inc();
  }

  /**
   * Record an LLM error.
   */
  recordError(model: string, provider: string, errorType: string): void {
    this.errorsTotal.labels({
      model,
      provider,
      error_type: errorType
    }).inc();
  }

  /**
   * Track active request (returns cleanup function).
   */
  trackActiveRequest(model: string, provider: string): () => void {
    const gauge = this.activeRequests.labels({
      model,
      provider
    });

    gauge.inc();

    return () => {
      gauge.dec();
    };
  }
}
