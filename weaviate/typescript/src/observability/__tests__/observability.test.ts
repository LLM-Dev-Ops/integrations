/**
 * Tests for the observability module
 */

import {
  createDefaultObservability,
  createDevObservability,
  createTestObservability,
  NoopTracer,
  ConsoleTracer,
  NoopMetricsCollector,
  InMemoryMetricsCollector,
  NoopLogger,
  ConsoleLogger,
  LogLevel,
  MetricNames,
  SpanNames,
  HealthStatus,
  createHealthCheck,
} from '../index';

describe('Observability', () => {
  describe('Context Factory', () => {
    it('should create default observability context', () => {
      const obs = createDefaultObservability();

      expect(obs.tracer).toBeInstanceOf(NoopTracer);
      expect(obs.metrics).toBeInstanceOf(NoopMetricsCollector);
      expect(obs.logger).toBeInstanceOf(ConsoleLogger);
    });

    it('should create dev observability context', () => {
      const obs = createDevObservability();

      expect(obs.tracer).toBeInstanceOf(ConsoleTracer);
      expect(obs.metrics).toBeInstanceOf(InMemoryMetricsCollector);
      expect(obs.logger).toBeInstanceOf(ConsoleLogger);
    });

    it('should create test observability context', () => {
      const obs = createTestObservability();

      expect(obs.tracer).toBeInstanceOf(ConsoleTracer);
      expect(obs.metrics).toBeInstanceOf(InMemoryMetricsCollector);
      expect(obs.logger).toBeInstanceOf(ConsoleLogger);
    });
  });

  describe('Tracer', () => {
    it('should create and end spans with NoopTracer', () => {
      const tracer = new NoopTracer();
      const span = tracer.startSpan('test.operation');

      expect(span).toBeDefined();
      span.setAttribute('key', 'value');
      span.end();
      expect(tracer.getActiveSpan()).toBeUndefined();
    });

    it('should create and end spans with ConsoleTracer', () => {
      const tracer = new ConsoleTracer();
      const span = tracer.startSpan('test.operation', { operation: 'test' });

      expect(span).toBeDefined();
      expect(span.name).toBe('test.operation');
      expect(span.attributes.operation).toBe('test');

      span.setAttribute('class_name', 'Article');
      span.addEvent('validation_complete');
      span.end('ok');

      expect(span.duration).toBeGreaterThan(0);
      expect(span.status).toBe('ok');
    });

    it('should support nested spans', () => {
      const tracer = new ConsoleTracer();

      const parentSpan = tracer.startSpan(SpanNames.NEAR_VECTOR);
      expect(tracer.getActiveSpan()?.id).toBe(parentSpan.id);

      const childSpan = tracer.startSpan(SpanNames.BUILD_GRAPHQL);
      expect(childSpan.parentId).toBe(parentSpan.id);
      expect(childSpan.traceId).toBe(parentSpan.traceId);

      childSpan.end();
      parentSpan.end();
    });

    it('should record errors on spans', () => {
      const tracer = new ConsoleTracer();
      const span = tracer.startSpan('test.operation');

      const error = new Error('Test error');
      span.recordError(error);

      expect(span.status).toBe('error');
      expect(span.events.length).toBeGreaterThan(0);
      expect(span.events[0].name).toBe('exception');
    });
  });

  describe('Metrics', () => {
    it('should collect counter metrics', () => {
      const metrics = new InMemoryMetricsCollector();

      metrics.increment(MetricNames.OBJECT_CREATE);
      metrics.increment(MetricNames.OBJECT_CREATE);
      metrics.increment(MetricNames.OBJECT_GET, 3);

      expect(metrics.getCounter(MetricNames.OBJECT_CREATE)).toBe(2);
      expect(metrics.getCounter(MetricNames.OBJECT_GET)).toBe(3);
    });

    it('should collect gauge metrics', () => {
      const metrics = new InMemoryMetricsCollector();

      metrics.gauge(MetricNames.CONNECTION_ACTIVE, 5);
      metrics.gauge(MetricNames.CONNECTION_ACTIVE, 10);

      expect(metrics.getGauge(MetricNames.CONNECTION_ACTIVE)).toBe(10);
    });

    it('should collect histogram metrics', () => {
      const metrics = new InMemoryMetricsCollector();

      metrics.histogram(MetricNames.SEARCH_LATENCY_MS, 45);
      metrics.histogram(MetricNames.SEARCH_LATENCY_MS, 67);
      metrics.histogram(MetricNames.SEARCH_LATENCY_MS, 89);

      const values = metrics.getHistogram(MetricNames.SEARCH_LATENCY_MS);
      expect(values).toEqual([45, 67, 89]);
    });

    it('should calculate histogram statistics', () => {
      const metrics = new InMemoryMetricsCollector();

      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      values.forEach((v) => metrics.histogram(MetricNames.GRAPHQL_LATENCY_MS, v));

      const stats = metrics.getHistogramStats(MetricNames.GRAPHQL_LATENCY_MS);

      expect(stats).toBeDefined();
      expect(stats?.count).toBe(10);
      expect(stats?.min).toBe(10);
      expect(stats?.max).toBe(100);
      expect(stats?.avg).toBe(55);
      expect(stats?.p50).toBe(55);
    });

    it('should support metric labels', () => {
      const metrics = new InMemoryMetricsCollector();

      metrics.increment(MetricNames.SEARCH_NEAR_VECTOR, 1, { class: 'Article' });
      metrics.increment(MetricNames.SEARCH_NEAR_VECTOR, 2, { class: 'Document' });
      metrics.increment(MetricNames.SEARCH_NEAR_VECTOR, 1, { class: 'Article' });

      expect(metrics.getCounter(MetricNames.SEARCH_NEAR_VECTOR, { class: 'Article' })).toBe(
        2
      );
      expect(metrics.getCounter(MetricNames.SEARCH_NEAR_VECTOR, { class: 'Document' })).toBe(
        2
      );
    });

    it('should reset metrics', () => {
      const metrics = new InMemoryMetricsCollector();

      metrics.increment(MetricNames.OBJECT_CREATE);
      metrics.gauge(MetricNames.CONNECTION_ACTIVE, 5);

      expect(metrics.getCounter(MetricNames.OBJECT_CREATE)).toBe(1);

      metrics.reset();

      expect(metrics.getCounter(MetricNames.OBJECT_CREATE)).toBe(0);
      expect(metrics.getGauge(MetricNames.CONNECTION_ACTIVE)).toBeUndefined();
    });
  });

  describe('Logger', () => {
    it('should log messages at different levels', () => {
      const logger = new ConsoleLogger({ name: 'test', level: LogLevel.Debug });

      // Should not throw
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');
    });

    it('should respect log level', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const logger = new ConsoleLogger({ name: 'test', level: LogLevel.Warn });

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');

      // Only warn should be logged
      expect(consoleSpy).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
    });

    it('should redact sensitive fields', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const logger = new ConsoleLogger({ name: 'test' });

      logger.info('Request made', {
        apiKey: 'secret-key',
        token: 'secret-token',
        data: 'public-data',
      });

      const loggedArgs = consoleSpy.mock.calls[0];
      const context = loggedArgs[1] as Record<string, unknown>;

      expect(context.apiKey).toBe('[REDACTED]');
      expect(context.token).toBe('[REDACTED]');
      expect(context.data).toBe('public-data');

      consoleSpy.mockRestore();
    });

    it('should redact vector arrays', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const logger = new ConsoleLogger({ name: 'test' });

      logger.info('Vector search', {
        vector: [0.1, 0.2, 0.3],
        results: 10,
      });

      const loggedArgs = consoleSpy.mock.calls[0];
      const context = loggedArgs[1] as Record<string, unknown>;

      expect(context.vector).toBe('[vector:3]');
      expect(context.results).toBe(10);

      consoleSpy.mockRestore();
    });

    it('should support JSON output', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const logger = new ConsoleLogger({ name: 'test', json: true });

      logger.info('Test message', { key: 'value' });

      const loggedArgs = consoleSpy.mock.calls[0];
      const jsonStr = loggedArgs[0] as string;
      const parsed = JSON.parse(jsonStr);

      expect(parsed.message).toBe('Test message');
      expect(parsed.component).toBe('test');
      expect(parsed.context?.key).toBe('value');

      consoleSpy.mockRestore();
    });

    it('should work with NoopLogger', () => {
      const logger = new NoopLogger();

      // Should not throw
      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');
      logger.setLevel(LogLevel.Debug);
    });
  });

  describe('Health Check', () => {
    it('should check Weaviate readiness', async () => {
      // Mock fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const healthCheck = createHealthCheck({
        baseUrl: 'http://localhost:8080',
        timeout: 5000,
      });

      const result = await healthCheck.check();

      expect(result.status).toBe(HealthStatus.Healthy);
      expect(result.components).toHaveLength(1);
      expect(result.components[0].name).toBe('weaviate_ready');
      expect(result.components[0].status).toBe(HealthStatus.Healthy);
    });

    it('should handle unhealthy Weaviate', async () => {
      // Mock fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      const healthCheck = createHealthCheck({
        baseUrl: 'http://localhost:8080',
      });

      const result = await healthCheck.check();

      expect(result.status).toBe(HealthStatus.Unhealthy);
      expect(result.components[0].status).toBe(HealthStatus.Unhealthy);
    });

    it('should check schema cache stats', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const healthCheck = createHealthCheck({
        baseUrl: 'http://localhost:8080',
        schemaCacheStats: () => ({
          size: 10,
          hitRate: 0.75,
          enabled: true,
        }),
      });

      const result = await healthCheck.check();

      const cacheComponent = result.components.find((c) => c.name === 'schema_cache');
      expect(cacheComponent).toBeDefined();
      expect(cacheComponent?.status).toBe(HealthStatus.Healthy);
      expect(cacheComponent?.metadata?.size).toBe(10);
      expect(cacheComponent?.metadata?.hitRate).toBe(0.75);
    });

    it('should detect degraded schema cache', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const healthCheck = createHealthCheck({
        baseUrl: 'http://localhost:8080',
        schemaCacheStats: () => ({
          size: 5,
          hitRate: 0.3, // Low hit rate
          enabled: true,
        }),
      });

      const result = await healthCheck.check();

      const cacheComponent = result.components.find((c) => c.name === 'schema_cache');
      expect(cacheComponent?.status).toBe(HealthStatus.Degraded);
    });

    it('should check circuit breaker state', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const healthCheck = createHealthCheck({
        baseUrl: 'http://localhost:8080',
        circuitBreakerState: () => ({
          state: 'open',
          failures: 5,
          lastFailure: Date.now(),
        }),
      });

      const result = await healthCheck.check();

      const cbComponent = result.components.find((c) => c.name === 'circuit_breaker');
      expect(cbComponent).toBeDefined();
      expect(cbComponent?.status).toBe(HealthStatus.Unhealthy);
    });

    it('should check gRPC connection', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const healthCheck = createHealthCheck({
        baseUrl: 'http://localhost:8080',
        grpcConnectionCheck: async () => true,
      });

      const result = await healthCheck.check();

      const grpcComponent = result.components.find((c) => c.name === 'grpc_connection');
      expect(grpcComponent).toBeDefined();
      expect(grpcComponent?.status).toBe(HealthStatus.Healthy);
    });
  });
});
