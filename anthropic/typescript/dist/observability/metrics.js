/**
 * Metrics collection for monitoring and observability
 */
/**
 * In-memory metrics collector for testing and development
 */
export class InMemoryMetricsCollector {
    counters = new Map();
    histograms = new Map();
    gauges = new Map();
    incrementCounter(name, value, labels) {
        const key = this.makeKey(name, labels);
        const current = this.counters.get(key) ?? 0;
        this.counters.set(key, current + value);
    }
    recordHistogram(name, value, labels) {
        const key = this.makeKey(name, labels);
        const values = this.histograms.get(key) ?? [];
        values.push(value);
        this.histograms.set(key, values);
    }
    setGauge(name, value, labels) {
        const key = this.makeKey(name, labels);
        this.gauges.set(key, value);
    }
    getCounter(name, labels) {
        return this.counters.get(this.makeKey(name, labels)) ?? 0;
    }
    getHistogram(name, labels) {
        return this.histograms.get(this.makeKey(name, labels)) ?? [];
    }
    getGauge(name, labels) {
        return this.gauges.get(this.makeKey(name, labels));
    }
    reset() {
        this.counters.clear();
        this.histograms.clear();
        this.gauges.clear();
    }
    makeKey(name, labels) {
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
 * No-op metrics collector for production environments where metrics are disabled
 */
export class NoopMetricsCollector {
    incrementCounter(_name, _value, _labels) { }
    recordHistogram(_name, _value, _labels) { }
    setGauge(_name, _value, _labels) { }
}
/**
 * Standard metric names for Anthropic API integration
 */
export const MetricNames = {
    REQUEST_COUNT: 'anthropic.requests.total',
    REQUEST_DURATION_MS: 'anthropic.requests.duration_ms',
    REQUEST_ERRORS: 'anthropic.requests.errors',
    TOKENS_INPUT: 'anthropic.tokens.input',
    TOKENS_OUTPUT: 'anthropic.tokens.output',
    RATE_LIMIT_HITS: 'anthropic.rate_limit.hits',
    CIRCUIT_BREAKER_STATE: 'anthropic.circuit_breaker.state',
    RETRY_ATTEMPTS: 'anthropic.retry.attempts',
};
//# sourceMappingURL=metrics.js.map