/**
 * OAuth2 Metrics
 *
 * Metrics collection for OAuth2 operations.
 */

/**
 * Metric labels.
 */
export interface MetricLabels {
  flow?: string;
  status?: string;
  provider?: string;
  endpoint?: string;
  errorType?: string;
  tokenType?: string;
}

/**
 * Counter metric interface.
 */
export interface Counter {
  /**
   * Increment counter by 1.
   */
  inc(labels?: MetricLabels): void;

  /**
   * Increment counter by value.
   */
  add(value: number, labels?: MetricLabels): void;
}

/**
 * Gauge metric interface.
 */
export interface Gauge {
  /**
   * Set gauge value.
   */
  set(value: number, labels?: MetricLabels): void;

  /**
   * Increment gauge by 1.
   */
  inc(labels?: MetricLabels): void;

  /**
   * Decrement gauge by 1.
   */
  dec(labels?: MetricLabels): void;
}

/**
 * Histogram metric interface.
 */
export interface Histogram {
  /**
   * Record observation.
   */
  observe(value: number, labels?: MetricLabels): void;

  /**
   * Start timer and return function to stop it.
   */
  startTimer(labels?: MetricLabels): () => number;
}

/**
 * OAuth2 metrics interface.
 */
export interface OAuth2Metrics {
  /** Authorization request counter */
  authorizationRequests: Counter;

  /** Token exchange counter */
  tokenExchanges: Counter;

  /** Token refresh counter */
  tokenRefreshes: Counter;

  /** Token exchange duration histogram */
  tokenExchangeDuration: Histogram;

  /** Token refresh duration histogram */
  tokenRefreshDuration: Histogram;

  /** Device flow poll counter */
  deviceFlowPolls: Counter;

  /** Active tokens gauge */
  activeTokens: Gauge;

  /** Expired tokens counter */
  expiredTokens: Counter;

  /** Introspection request counter */
  introspectionRequests: Counter;

  /** Revocation request counter */
  revocationRequests: Counter;

  /** Error counter */
  errors: Counter;

  /** Circuit breaker state gauge */
  circuitBreakerState: Gauge;
}

/**
 * Default no-op counter.
 */
class NoOpCounter implements Counter {
  inc(): void {}
  add(): void {}
}

/**
 * Default no-op gauge.
 */
class NoOpGauge implements Gauge {
  set(): void {}
  inc(): void {}
  dec(): void {}
}

/**
 * Default no-op histogram.
 */
class NoOpHistogram implements Histogram {
  observe(): void {}
  startTimer(): () => number {
    const start = Date.now();
    return () => Date.now() - start;
  }
}

/**
 * No-op metrics implementation (default when metrics are disabled).
 */
export const noOpMetrics: OAuth2Metrics = {
  authorizationRequests: new NoOpCounter(),
  tokenExchanges: new NoOpCounter(),
  tokenRefreshes: new NoOpCounter(),
  tokenExchangeDuration: new NoOpHistogram(),
  tokenRefreshDuration: new NoOpHistogram(),
  deviceFlowPolls: new NoOpCounter(),
  activeTokens: new NoOpGauge(),
  expiredTokens: new NoOpCounter(),
  introspectionRequests: new NoOpCounter(),
  revocationRequests: new NoOpCounter(),
  errors: new NoOpCounter(),
  circuitBreakerState: new NoOpGauge(),
};

/**
 * In-memory metrics for testing.
 */
export class InMemoryMetrics implements OAuth2Metrics {
  private counters: Map<string, Map<string, number>> = new Map();
  private gauges: Map<string, Map<string, number>> = new Map();
  private histograms: Map<string, Map<string, number[]>> = new Map();

  private createCounter(name: string): Counter {
    return {
      inc: (labels?: MetricLabels) => this.incCounter(name, 1, labels),
      add: (value: number, labels?: MetricLabels) => this.incCounter(name, value, labels),
    };
  }

  private createGauge(name: string): Gauge {
    return {
      set: (value: number, labels?: MetricLabels) => this.setGauge(name, value, labels),
      inc: (labels?: MetricLabels) => this.incGauge(name, 1, labels),
      dec: (labels?: MetricLabels) => this.incGauge(name, -1, labels),
    };
  }

  private createHistogram(name: string): Histogram {
    return {
      observe: (value: number, labels?: MetricLabels) =>
        this.recordHistogram(name, value, labels),
      startTimer: (labels?: MetricLabels) => {
        const start = Date.now();
        return () => {
          const duration = (Date.now() - start) / 1000;
          this.recordHistogram(name, duration, labels);
          return duration;
        };
      },
    };
  }

  authorizationRequests = this.createCounter("oauth2_authorization_requests_total");
  tokenExchanges = this.createCounter("oauth2_token_exchanges_total");
  tokenRefreshes = this.createCounter("oauth2_token_refreshes_total");
  tokenExchangeDuration = this.createHistogram("oauth2_token_exchange_duration_seconds");
  tokenRefreshDuration = this.createHistogram("oauth2_token_refresh_duration_seconds");
  deviceFlowPolls = this.createCounter("oauth2_device_flow_polls_total");
  activeTokens = this.createGauge("oauth2_tokens_active");
  expiredTokens = this.createCounter("oauth2_tokens_expired_total");
  introspectionRequests = this.createCounter("oauth2_introspection_requests_total");
  revocationRequests = this.createCounter("oauth2_revocation_requests_total");
  errors = this.createCounter("oauth2_errors_total");
  circuitBreakerState = this.createGauge("oauth2_circuit_breaker_state");

  private labelsToKey(labels?: MetricLabels): string {
    if (!labels) return "";
    return Object.entries(labels)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
  }

  private incCounter(name: string, value: number, labels?: MetricLabels): void {
    if (!this.counters.has(name)) {
      this.counters.set(name, new Map());
    }
    const key = this.labelsToKey(labels);
    const current = this.counters.get(name)!.get(key) ?? 0;
    this.counters.get(name)!.set(key, current + value);
  }

  private setGauge(name: string, value: number, labels?: MetricLabels): void {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, new Map());
    }
    const key = this.labelsToKey(labels);
    this.gauges.get(name)!.set(key, value);
  }

  private incGauge(name: string, delta: number, labels?: MetricLabels): void {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, new Map());
    }
    const key = this.labelsToKey(labels);
    const current = this.gauges.get(name)!.get(key) ?? 0;
    this.gauges.get(name)!.set(key, current + delta);
  }

  private recordHistogram(name: string, value: number, labels?: MetricLabels): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, new Map());
    }
    const key = this.labelsToKey(labels);
    if (!this.histograms.get(name)!.has(key)) {
      this.histograms.get(name)!.set(key, []);
    }
    this.histograms.get(name)!.get(key)!.push(value);
  }

  /**
   * Get counter value.
   */
  getCounter(name: string, labels?: MetricLabels): number {
    return this.counters.get(name)?.get(this.labelsToKey(labels)) ?? 0;
  }

  /**
   * Get gauge value.
   */
  getGauge(name: string, labels?: MetricLabels): number {
    return this.gauges.get(name)?.get(this.labelsToKey(labels)) ?? 0;
  }

  /**
   * Get histogram values.
   */
  getHistogram(name: string, labels?: MetricLabels): number[] {
    return this.histograms.get(name)?.get(this.labelsToKey(labels)) ?? [];
  }

  /**
   * Reset all metrics.
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

/**
 * Create in-memory metrics for testing.
 */
export function createInMemoryMetrics(): InMemoryMetrics {
  return new InMemoryMetrics();
}
