import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryMetricsCollector,
  NoopMetricsCollector,
  MetricNames,
  type MetricsCollector,
} from '../metrics.js';

describe('Metrics', () => {
  describe('InMemoryMetricsCollector', () => {
    let collector: InMemoryMetricsCollector;

    beforeEach(() => {
      collector = new InMemoryMetricsCollector();
    });

    describe('Counter operations', () => {
      it('increments counter from zero', () => {
        collector.incrementCounter('test.counter', 1);

        expect(collector.getCounter('test.counter')).toBe(1);
      });

      it('increments counter multiple times', () => {
        collector.incrementCounter('test.counter', 5);
        collector.incrementCounter('test.counter', 3);

        expect(collector.getCounter('test.counter')).toBe(8);
      });

      it('handles counter with labels', () => {
        collector.incrementCounter('requests', 1, { method: 'GET', status: '200' });
        collector.incrementCounter('requests', 1, { method: 'POST', status: '201' });

        expect(collector.getCounter('requests', { method: 'GET', status: '200' })).toBe(1);
        expect(collector.getCounter('requests', { method: 'POST', status: '201' })).toBe(1);
      });

      it('maintains separate counters for different label values', () => {
        collector.incrementCounter('requests', 5, { method: 'GET' });
        collector.incrementCounter('requests', 3, { method: 'POST' });

        expect(collector.getCounter('requests', { method: 'GET' })).toBe(5);
        expect(collector.getCounter('requests', { method: 'POST' })).toBe(3);
      });

      it('returns 0 for non-existent counter', () => {
        expect(collector.getCounter('non.existent')).toBe(0);
      });

      it('sorts labels consistently', () => {
        collector.incrementCounter('metric', 1, { z: 'last', a: 'first', m: 'middle' });
        collector.incrementCounter('metric', 2, { a: 'first', m: 'middle', z: 'last' });

        expect(collector.getCounter('metric', { a: 'first', m: 'middle', z: 'last' })).toBe(3);
      });
    });

    describe('Histogram operations', () => {
      it('records histogram value', () => {
        collector.recordHistogram('response.time', 100);

        expect(collector.getHistogram('response.time')).toEqual([100]);
      });

      it('records multiple histogram values', () => {
        collector.recordHistogram('response.time', 100);
        collector.recordHistogram('response.time', 200);
        collector.recordHistogram('response.time', 150);

        expect(collector.getHistogram('response.time')).toEqual([100, 200, 150]);
      });

      it('handles histogram with labels', () => {
        collector.recordHistogram('latency', 50, { endpoint: '/api/messages' });
        collector.recordHistogram('latency', 75, { endpoint: '/api/messages' });
        collector.recordHistogram('latency', 100, { endpoint: '/api/models' });

        expect(collector.getHistogram('latency', { endpoint: '/api/messages' })).toEqual([50, 75]);
        expect(collector.getHistogram('latency', { endpoint: '/api/models' })).toEqual([100]);
      });

      it('returns empty array for non-existent histogram', () => {
        expect(collector.getHistogram('non.existent')).toEqual([]);
      });
    });

    describe('Gauge operations', () => {
      it('sets gauge value', () => {
        collector.setGauge('active.connections', 10);

        expect(collector.getGauge('active.connections')).toBe(10);
      });

      it('overwrites gauge value', () => {
        collector.setGauge('queue.size', 5);
        collector.setGauge('queue.size', 8);

        expect(collector.getGauge('queue.size')).toBe(8);
      });

      it('handles gauge with labels', () => {
        collector.setGauge('circuit.breaker.state', 0, { name: 'api' });
        collector.setGauge('circuit.breaker.state', 1, { name: 'database' });

        expect(collector.getGauge('circuit.breaker.state', { name: 'api' })).toBe(0);
        expect(collector.getGauge('circuit.breaker.state', { name: 'database' })).toBe(1);
      });

      it('returns undefined for non-existent gauge', () => {
        expect(collector.getGauge('non.existent')).toBeUndefined();
      });
    });

    describe('Reset operation', () => {
      it('clears all metrics', () => {
        collector.incrementCounter('counter', 5);
        collector.recordHistogram('histogram', 100);
        collector.setGauge('gauge', 10);

        collector.reset();

        expect(collector.getCounter('counter')).toBe(0);
        expect(collector.getHistogram('histogram')).toEqual([]);
        expect(collector.getGauge('gauge')).toBeUndefined();
      });
    });
  });

  describe('NoopMetricsCollector', () => {
    let collector: NoopMetricsCollector;

    beforeEach(() => {
      collector = new NoopMetricsCollector();
    });

    it('implements MetricsCollector interface', () => {
      const c: MetricsCollector = collector;
      expect(c).toBeDefined();
    });

    it('increments counter without errors', () => {
      expect(() => collector.incrementCounter('test', 1)).not.toThrow();
    });

    it('records histogram without errors', () => {
      expect(() => collector.recordHistogram('test', 100)).not.toThrow();
    });

    it('sets gauge without errors', () => {
      expect(() => collector.setGauge('test', 10)).not.toThrow();
    });

    it('handles operations with labels', () => {
      expect(() => {
        collector.incrementCounter('test', 1, { label: 'value' });
        collector.recordHistogram('test', 100, { label: 'value' });
        collector.setGauge('test', 10, { label: 'value' });
      }).not.toThrow();
    });
  });

  describe('MetricNames', () => {
    it('defines standard metric names', () => {
      expect(MetricNames.REQUEST_COUNT).toBe('anthropic.requests.total');
      expect(MetricNames.REQUEST_DURATION_MS).toBe('anthropic.requests.duration_ms');
      expect(MetricNames.REQUEST_ERRORS).toBe('anthropic.requests.errors');
      expect(MetricNames.TOKENS_INPUT).toBe('anthropic.tokens.input');
      expect(MetricNames.TOKENS_OUTPUT).toBe('anthropic.tokens.output');
      expect(MetricNames.RATE_LIMIT_HITS).toBe('anthropic.rate_limit.hits');
      expect(MetricNames.CIRCUIT_BREAKER_STATE).toBe('anthropic.circuit_breaker.state');
      expect(MetricNames.RETRY_ATTEMPTS).toBe('anthropic.retry.attempts');
    });

    it('has expected constant values', () => {
      // MetricNames is defined with 'as const' for TypeScript immutability
      // At runtime, the object is still mutable but TypeScript prevents this
      const originalValue = MetricNames.REQUEST_COUNT;
      expect(originalValue).toBe('anthropic.requests.total');
    });
  });

  describe('Integration scenarios', () => {
    let collector: InMemoryMetricsCollector;

    beforeEach(() => {
      collector = new InMemoryMetricsCollector();
    });

    it('tracks API request metrics', () => {
      // Track multiple requests
      collector.incrementCounter(MetricNames.REQUEST_COUNT, 1, { endpoint: '/messages' });
      collector.recordHistogram(MetricNames.REQUEST_DURATION_MS, 150, { endpoint: '/messages' });

      collector.incrementCounter(MetricNames.REQUEST_COUNT, 1, { endpoint: '/messages' });
      collector.recordHistogram(MetricNames.REQUEST_DURATION_MS, 200, { endpoint: '/messages' });

      expect(collector.getCounter(MetricNames.REQUEST_COUNT, { endpoint: '/messages' })).toBe(2);
      expect(collector.getHistogram(MetricNames.REQUEST_DURATION_MS, { endpoint: '/messages' }))
        .toEqual([150, 200]);
    });

    it('tracks token usage', () => {
      collector.incrementCounter(MetricNames.TOKENS_INPUT, 100);
      collector.incrementCounter(MetricNames.TOKENS_OUTPUT, 50);

      expect(collector.getCounter(MetricNames.TOKENS_INPUT)).toBe(100);
      expect(collector.getCounter(MetricNames.TOKENS_OUTPUT)).toBe(50);
    });

    it('tracks rate limit hits', () => {
      collector.incrementCounter(MetricNames.RATE_LIMIT_HITS, 1);

      expect(collector.getCounter(MetricNames.RATE_LIMIT_HITS)).toBe(1);
    });

    it('tracks circuit breaker state', () => {
      collector.setGauge(MetricNames.CIRCUIT_BREAKER_STATE, 0); // Open
      expect(collector.getGauge(MetricNames.CIRCUIT_BREAKER_STATE)).toBe(0);

      collector.setGauge(MetricNames.CIRCUIT_BREAKER_STATE, 1); // Closed
      expect(collector.getGauge(MetricNames.CIRCUIT_BREAKER_STATE)).toBe(1);
    });

    it('tracks retry attempts', () => {
      collector.incrementCounter(MetricNames.RETRY_ATTEMPTS, 1);
      collector.incrementCounter(MetricNames.RETRY_ATTEMPTS, 1);

      expect(collector.getCounter(MetricNames.RETRY_ATTEMPTS)).toBe(2);
    });

    it('calculates histogram statistics', () => {
      const durations = [100, 150, 200, 250, 300];
      durations.forEach(d => {
        collector.recordHistogram(MetricNames.REQUEST_DURATION_MS, d);
      });

      const values = collector.getHistogram(MetricNames.REQUEST_DURATION_MS);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);

      expect(avg).toBe(200);
      expect(max).toBe(300);
      expect(min).toBe(100);
    });
  });
});
