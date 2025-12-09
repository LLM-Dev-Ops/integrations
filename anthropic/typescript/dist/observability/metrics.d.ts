/**
 * Metrics collection for monitoring and observability
 */
export interface MetricsCollector {
    incrementCounter(name: string, value: number, labels?: Record<string, string>): void;
    recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
    setGauge(name: string, value: number, labels?: Record<string, string>): void;
}
/**
 * In-memory metrics collector for testing and development
 */
export declare class InMemoryMetricsCollector implements MetricsCollector {
    private counters;
    private histograms;
    private gauges;
    incrementCounter(name: string, value: number, labels?: Record<string, string>): void;
    recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
    setGauge(name: string, value: number, labels?: Record<string, string>): void;
    getCounter(name: string, labels?: Record<string, string>): number;
    getHistogram(name: string, labels?: Record<string, string>): number[];
    getGauge(name: string, labels?: Record<string, string>): number | undefined;
    reset(): void;
    private makeKey;
}
/**
 * No-op metrics collector for production environments where metrics are disabled
 */
export declare class NoopMetricsCollector implements MetricsCollector {
    incrementCounter(_name: string, _value: number, _labels?: Record<string, string>): void;
    recordHistogram(_name: string, _value: number, _labels?: Record<string, string>): void;
    setGauge(_name: string, _value: number, _labels?: Record<string, string>): void;
}
/**
 * Standard metric names for Anthropic API integration
 */
export declare const MetricNames: {
    readonly REQUEST_COUNT: "anthropic.requests.total";
    readonly REQUEST_DURATION_MS: "anthropic.requests.duration_ms";
    readonly REQUEST_ERRORS: "anthropic.requests.errors";
    readonly TOKENS_INPUT: "anthropic.tokens.input";
    readonly TOKENS_OUTPUT: "anthropic.tokens.output";
    readonly RATE_LIMIT_HITS: "anthropic.rate_limit.hits";
    readonly CIRCUIT_BREAKER_STATE: "anthropic.circuit_breaker.state";
    readonly RETRY_ATTEMPTS: "anthropic.retry.attempts";
};
//# sourceMappingURL=metrics.d.ts.map