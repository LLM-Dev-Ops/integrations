/**
 * Tests for observability components.
 */

import {
  LogLevel,
  ConsoleLogger,
  NoopLogger,
  InMemoryLogger,
  NoopMetricsCollector,
  InMemoryMetricsCollector,
  NoopTracer,
  InMemoryTracer,
} from '../index.js';

describe('Logging', () => {
  describe('InMemoryLogger', () => {
    it('should store log messages', () => {
      const logger = new InMemoryLogger();
      logger.info('test message', { key: 'value' });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe(LogLevel.Info);
      expect(logs[0].message).toBe('test message');
      expect(logs[0].context).toEqual({ key: 'value' });
    });

    it('should store all log levels', () => {
      const logger = new InMemoryLogger();
      logger.trace('trace');
      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(logger.getLogs()).toHaveLength(5);
    });

    it('should filter by log level', () => {
      const logger = new InMemoryLogger();
      logger.info('info1');
      logger.error('error1');
      logger.info('info2');
      logger.error('error2');

      const errors = logger.getLogsByLevel(LogLevel.Error);
      expect(errors).toHaveLength(2);
      expect(errors[0].message).toBe('error1');
    });

    it('should create child logger with context', () => {
      const logger = new InMemoryLogger({ module: 'parent' });
      const child = logger.child({ submodule: 'child' });

      child.info('child message');

      const logs = logger.getLogs();
      expect(logs[0].context).toEqual({ module: 'parent', submodule: 'child' });
    });

    it('should share logs between parent and child', () => {
      const logger = new InMemoryLogger();
      const child = logger.child({});

      logger.info('parent');
      child.info('child');

      expect(logger.getLogs()).toHaveLength(2);
    });

    it('should clear logs', () => {
      const logger = new InMemoryLogger();
      logger.info('test');
      expect(logger.getLogs()).toHaveLength(1);

      logger.clear();
      expect(logger.getLogs()).toHaveLength(0);
    });
  });

  describe('ConsoleLogger', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should log to console', () => {
      const logger = new ConsoleLogger({ level: LogLevel.Info });
      logger.info('test message');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0][0]).toContain('INFO');
      expect(consoleSpy.mock.calls[0][0]).toContain('test message');
    });

    it('should filter by log level', () => {
      const logger = new ConsoleLogger({ level: LogLevel.Warn });
      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleSpy).toHaveBeenCalledTimes(2);
    });

    it('should redact sensitive fields', () => {
      const logger = new ConsoleLogger({ level: LogLevel.Info });
      logger.info('test', { token: 'secret-token', normal: 'value' });

      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('[REDACTED]');
      expect(output).not.toContain('secret-token');
      expect(output).toContain('value');
    });

    it('should output JSON format', () => {
      const logger = new ConsoleLogger({ level: LogLevel.Info, format: 'json' });
      logger.info('test message', { key: 'value' });

      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.message).toBe('test message');
      expect(parsed.level).toBe('INFO');
      expect(parsed.key).toBe('value');
    });
  });

  describe('NoopLogger', () => {
    it('should not throw', () => {
      const logger = new NoopLogger();
      expect(() => {
        logger.trace('test');
        logger.debug('test');
        logger.info('test');
        logger.warn('test');
        logger.error('test');
        logger.child({}).info('child');
      }).not.toThrow();
    });
  });
});

describe('Metrics', () => {
  describe('InMemoryMetricsCollector', () => {
    it('should increment counter', () => {
      const metrics = new InMemoryMetricsCollector();
      metrics.incrementCounter('requests_total');
      metrics.incrementCounter('requests_total');
      metrics.incrementCounter('requests_total', 3);

      expect(metrics.getCounter('requests_total')).toBe(5);
    });

    it('should handle labels', () => {
      const metrics = new InMemoryMetricsCollector();
      metrics.incrementCounter('requests_total', 1, { method: 'POST' });
      metrics.incrementCounter('requests_total', 1, { method: 'GET' });
      metrics.incrementCounter('requests_total', 1, { method: 'POST' });

      expect(metrics.getCounter('requests_total', { method: 'POST' })).toBe(2);
      expect(metrics.getCounter('requests_total', { method: 'GET' })).toBe(1);
    });

    it('should record histogram values', () => {
      const metrics = new InMemoryMetricsCollector();
      metrics.recordHistogram('latency', 100);
      metrics.recordHistogram('latency', 200);
      metrics.recordHistogram('latency', 150);

      expect(metrics.getHistogram('latency')).toEqual([100, 200, 150]);
    });

    it('should set gauge', () => {
      const metrics = new InMemoryMetricsCollector();
      metrics.setGauge('queue_size', 10);
      expect(metrics.getGauge('queue_size')).toBe(10);

      metrics.setGauge('queue_size', 5);
      expect(metrics.getGauge('queue_size')).toBe(5);
    });

    it('should clear all metrics', () => {
      const metrics = new InMemoryMetricsCollector();
      metrics.incrementCounter('counter');
      metrics.recordHistogram('histogram', 100);
      metrics.setGauge('gauge', 50);

      metrics.clear();

      expect(metrics.getCounter('counter')).toBe(0);
      expect(metrics.getHistogram('histogram')).toEqual([]);
      expect(metrics.getGauge('gauge')).toBeUndefined();
    });
  });

  describe('NoopMetricsCollector', () => {
    it('should not throw', () => {
      const metrics = new NoopMetricsCollector();
      expect(() => {
        metrics.incrementCounter('test');
        metrics.recordHistogram('test', 100);
        metrics.setGauge('test', 50);
      }).not.toThrow();
    });
  });
});

describe('Tracing', () => {
  describe('InMemoryTracer', () => {
    it('should create spans', () => {
      const tracer = new InMemoryTracer();
      const span = tracer.startSpan('test-operation');

      expect(span.spanId).toBeDefined();
      expect(span.traceId).toBeDefined();
    });

    it('should track span attributes', () => {
      const tracer = new InMemoryTracer();
      const span = tracer.startSpan('test', { initial: 'value' });
      span.setAttribute('added', 'later');
      span.end();

      const spans = tracer.getSpans();
      expect(spans[0].attributes).toEqual({ initial: 'value', added: 'later' });
    });

    it('should track span events', () => {
      const tracer = new InMemoryTracer();
      const span = tracer.startSpan('test');
      span.addEvent('event1', { detail: 'value' });
      span.addEvent('event2');
      span.end();

      const spans = tracer.getSpans();
      expect(spans[0].events).toHaveLength(2);
      expect(spans[0].events[0].name).toBe('event1');
    });

    it('should track span status', () => {
      const tracer = new InMemoryTracer();
      const span = tracer.startSpan('test');
      span.setStatus('error', 'Something failed');
      span.end();

      const spans = tracer.getSpans();
      expect(spans[0].status).toBe('error');
      expect(spans[0].statusMessage).toBe('Something failed');
    });

    it('should calculate duration', () => {
      const tracer = new InMemoryTracer();
      const span = tracer.startSpan('test') as import('../observability/index.js').InMemorySpanContext;

      // Wait a bit
      const start = Date.now();
      while (Date.now() - start < 10) {
        // Busy wait
      }

      span.end();
      const duration = span.getDurationMs();
      expect(duration).toBeGreaterThanOrEqual(10);
    });

    it('should track current span', () => {
      const tracer = new InMemoryTracer();
      expect(tracer.getCurrentSpan()).toBeUndefined();

      const span = tracer.startSpan('test');
      expect(tracer.getCurrentSpan()).toBe(span);
    });

    it('should clear spans', () => {
      const tracer = new InMemoryTracer();
      tracer.startSpan('test1');
      tracer.startSpan('test2');
      expect(tracer.getSpans()).toHaveLength(2);

      tracer.clear();
      expect(tracer.getSpans()).toHaveLength(0);
    });

    it('should generate new trace ID after clear', () => {
      const tracer = new InMemoryTracer();
      const span1 = tracer.startSpan('test');
      const traceId1 = span1.traceId;

      tracer.clear();
      const span2 = tracer.startSpan('test');
      const traceId2 = span2.traceId;

      expect(traceId2).not.toBe(traceId1);
    });
  });

  describe('NoopTracer', () => {
    it('should not throw', () => {
      const tracer = new NoopTracer();
      const span = tracer.startSpan('test');

      expect(() => {
        span.setAttribute('key', 'value');
        span.addEvent('event');
        span.setStatus('ok');
        span.end();
      }).not.toThrow();

      expect(tracer.getCurrentSpan()).toBeUndefined();
    });
  });
});
