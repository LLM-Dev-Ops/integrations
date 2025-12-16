/**
 * Tests for MetricsRegistry implementation.
 * Validates registry functionality against SPARC pseudocode specification.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsRegistry } from '../registry';
import { MetricType } from '../../types';

describe('MetricsRegistry', () => {
  let registry: MetricsRegistry;

  beforeEach(() => {
    registry = new MetricsRegistry({
      namespace: 'test',
      cardinalityLimits: {
        test_counter_vec: 10,
      },
    });
  });

  describe('counter', () => {
    it('should create a counter', () => {
      const counter = registry.counter({
        name: 'requests_total',
        help: 'Total requests',
      });

      expect(counter).toBeDefined();
      expect(counter.get()).toBe(0);
    });

    it('should increment counter', () => {
      const counter = registry.counter({
        name: 'requests_total',
        help: 'Total requests',
      });

      counter.inc();
      expect(counter.get()).toBe(1);

      counter.inc(5);
      expect(counter.get()).toBe(6);
    });

    it('should throw on negative increment', () => {
      const counter = registry.counter({
        name: 'requests_total',
        help: 'Total requests',
      });

      expect(() => counter.inc(-1)).toThrow('Counter cannot be decreased');
    });

    it('should return same counter for duplicate registration', () => {
      const counter1 = registry.counter({
        name: 'requests_total',
        help: 'Total requests',
      });

      const counter2 = registry.counter({
        name: 'requests_total',
        help: 'Total requests',
      });

      expect(counter1).toBe(counter2);
    });
  });

  describe('counterVec', () => {
    it('should create a counter with labels', () => {
      const counterVec = registry.counterVec({
        name: 'http_requests_total',
        help: 'HTTP requests',
        labelNames: ['method', 'status'],
      });

      const counter = counterVec.withLabelValues('GET', '200');
      expect(counter).toBeDefined();
      expect(counter.get()).toBe(0);
    });

    it('should track separate counters per label combination', () => {
      const counterVec = registry.counterVec({
        name: 'http_requests_total',
        help: 'HTTP requests',
        labelNames: ['method', 'status'],
      });

      const counter1 = counterVec.withLabelValues('GET', '200');
      const counter2 = counterVec.withLabelValues('POST', '201');

      counter1.inc(5);
      counter2.inc(3);

      expect(counter1.get()).toBe(5);
      expect(counter2.get()).toBe(3);
    });

    it('should return same counter for duplicate label values', () => {
      const counterVec = registry.counterVec({
        name: 'http_requests_total',
        help: 'HTTP requests',
        labelNames: ['method'],
      });

      const counter1 = counterVec.withLabelValues('GET');
      const counter2 = counterVec.withLabelValues('GET');

      expect(counter1).toBe(counter2);
    });

    it('should enforce cardinality limits', () => {
      const counterVec = registry.counterVec({
        name: 'counter_vec',
        help: 'Test counter',
        labelNames: ['label'],
      });

      // Create counters up to the limit (10)
      for (let i = 0; i < 10; i++) {
        counterVec.withLabelValues(`value${i}`);
      }

      // Attempting to create one more should throw
      expect(() => counterVec.withLabelValues('value10')).toThrow(
        'Cardinality limit exceeded'
      );
    });

    it('should throw on label count mismatch', () => {
      const counterVec = registry.counterVec({
        name: 'http_requests_total',
        help: 'HTTP requests',
        labelNames: ['method', 'status'],
      });

      expect(() => counterVec.withLabelValues('GET')).toThrow('Label count mismatch');
    });
  });

  describe('gauge', () => {
    it('should create a gauge', () => {
      const gauge = registry.gauge({
        name: 'temperature',
        help: 'Current temperature',
      });

      expect(gauge).toBeDefined();
      expect(gauge.get()).toBe(0);
    });

    it('should set gauge value', () => {
      const gauge = registry.gauge({
        name: 'temperature',
        help: 'Current temperature',
      });

      gauge.set(25.5);
      expect(gauge.get()).toBe(25.5);
    });

    it('should increment and decrement gauge', () => {
      const gauge = registry.gauge({
        name: 'active_connections',
        help: 'Active connections',
      });

      gauge.inc();
      expect(gauge.get()).toBe(1);

      gauge.inc(4);
      expect(gauge.get()).toBe(5);

      gauge.dec(2);
      expect(gauge.get()).toBe(3);
    });

    it('should add and subtract from gauge', () => {
      const gauge = registry.gauge({
        name: 'temperature',
        help: 'Current temperature',
      });

      gauge.set(20);
      gauge.add(5);
      expect(gauge.get()).toBe(25);

      gauge.sub(10);
      expect(gauge.get()).toBe(15);
    });

    it('should set gauge to current time', () => {
      const gauge = registry.gauge({
        name: 'last_update',
        help: 'Last update timestamp',
      });

      const before = Date.now() / 1000;
      gauge.setToCurrentTime();
      const after = Date.now() / 1000;

      const value = gauge.get();
      expect(value).toBeGreaterThanOrEqual(before);
      expect(value).toBeLessThanOrEqual(after);
    });
  });

  describe('histogram', () => {
    it('should create a histogram', () => {
      const histogram = registry.histogram({
        name: 'request_duration_seconds',
        help: 'Request duration',
      });

      expect(histogram).toBeDefined();
    });

    it('should observe values', () => {
      const histogram = registry.histogram({
        name: 'request_duration_seconds',
        help: 'Request duration',
        buckets: [0.1, 0.5, 1.0, 5.0],
      });

      histogram.observe(0.05);
      histogram.observe(0.2);
      histogram.observe(0.8);
      histogram.observe(3.0);

      // Verify via gather
      const families = registry.gather();
      const histogramFamily = families.find(f => f.name === 'test_request_duration_seconds');

      expect(histogramFamily).toBeDefined();
      expect(histogramFamily!.type).toBe(MetricType.Histogram);
    });

    it('should support timer functionality', () => {
      const histogram = registry.histogram({
        name: 'operation_duration_seconds',
        help: 'Operation duration',
      });

      const end = histogram.startTimer();
      // Simulate some work
      end();

      const families = registry.gather();
      const histogramFamily = families.find(f => f.name === 'test_operation_duration_seconds');

      expect(histogramFamily).toBeDefined();
    });
  });

  describe('gather', () => {
    it('should gather all metrics', () => {
      const counter = registry.counter({
        name: 'requests_total',
        help: 'Total requests',
      });

      const gauge = registry.gauge({
        name: 'active_connections',
        help: 'Active connections',
      });

      counter.inc(5);
      gauge.set(10);

      const families = registry.gather();

      expect(families.length).toBeGreaterThanOrEqual(2);
      expect(families.map(f => f.name)).toContain('test_requests_total');
      expect(families.map(f => f.name)).toContain('test_active_connections');
    });

    it('should apply default labels', () => {
      const registryWithDefaults = new MetricsRegistry({
        namespace: 'test',
        defaultLabels: {
          environment: 'production',
          region: 'us-west-2',
        },
      });

      const counter = registryWithDefaults.counter({
        name: 'requests_total',
        help: 'Total requests',
      });

      counter.inc();

      const families = registryWithDefaults.gather();
      const counterFamily = families.find(f => f.name === 'test_requests_total');

      expect(counterFamily).toBeDefined();
      expect(counterFamily!.metrics[0].labels).toEqual({
        environment: 'production',
        region: 'us-west-2',
      });
    });

    it('should sort families by name', () => {
      registry.counter({ name: 'zzz', help: 'Last' });
      registry.counter({ name: 'aaa', help: 'First' });
      registry.counter({ name: 'mmm', help: 'Middle' });

      const families = registry.gather();
      const names = families.map(f => f.name);

      expect(names).toEqual([...names].sort());
    });
  });

  describe('metrics', () => {
    it('should serialize to Prometheus text format', async () => {
      const counter = registry.counter({
        name: 'requests_total',
        help: 'Total requests',
      });

      counter.inc(42);

      const output = await registry.metrics();

      expect(output).toContain('# HELP test_requests_total Total requests');
      expect(output).toContain('# TYPE test_requests_total counter');
      expect(output).toContain('test_requests_total 42');
    });
  });

  describe('clear', () => {
    it('should clear all metrics', () => {
      registry.counter({ name: 'counter1', help: 'Counter 1' });
      registry.gauge({ name: 'gauge1', help: 'Gauge 1' });

      let families = registry.gather();
      expect(families.length).toBeGreaterThan(0);

      registry.clear();

      families = registry.gather();
      expect(families.length).toBe(0);
    });
  });

  describe('namespace', () => {
    it('should apply namespace to metric names', () => {
      const counter = registry.counter({
        name: 'requests_total',
        help: 'Total requests',
      });

      counter.inc();

      const families = registry.gather();
      const counterFamily = families.find(f => f.name === 'test_requests_total');

      expect(counterFamily).toBeDefined();
    });

    it('should support subsystem', () => {
      const counter = registry.counter({
        name: 'requests_total',
        help: 'Total requests',
        subsystem: 'http',
      });

      counter.inc();

      const families = registry.gather();
      const counterFamily = families.find(f => f.name === 'test_http_requests_total');

      expect(counterFamily).toBeDefined();
    });
  });
});
