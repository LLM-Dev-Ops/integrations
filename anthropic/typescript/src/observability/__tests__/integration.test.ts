import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DefaultTracer,
  InMemoryMetricsCollector,
  ConsoleLogger,
  MetricNames,
  withAttribute,
  finishSpan,
  finishSpanWithError,
  getSpanDuration,
  logRequest,
  logResponse,
  logError,
} from '../index.js';

describe('Observability Integration', () => {
  describe('Complete workflow', () => {
    let tracer: DefaultTracer;
    let metrics: InMemoryMetricsCollector;
    let logger: ConsoleLogger;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      tracer = new DefaultTracer('test-service');
      metrics = new InMemoryMetricsCollector();
      logger = new ConsoleLogger({ level: 'debug', format: 'json', includeTimestamps: false });
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('tracks successful API request lifecycle', () => {
      // Start span
      const span = tracer.startSpan('api-request');
      let requestSpan = withAttribute(span, 'http.method', 'POST');
      requestSpan = withAttribute(requestSpan, 'http.url', '/v1/messages');

      // Log request
      logRequest(logger, 'POST', '/v1/messages', { max_tokens: 1024 });

      // Track metrics
      metrics.incrementCounter(MetricNames.REQUEST_COUNT, 1, { endpoint: 'messages' });

      // Simulate API call
      const startTime = Date.now();
      const duration = 150;

      // Record metrics
      metrics.recordHistogram(MetricNames.REQUEST_DURATION_MS, duration, { endpoint: 'messages' });
      metrics.incrementCounter(MetricNames.TOKENS_INPUT, 100);
      metrics.incrementCounter(MetricNames.TOKENS_OUTPUT, 50);

      // Log response
      logResponse(logger, 200, duration, { id: 'msg_123' });

      // Finish span
      const finished = finishSpan(requestSpan);
      tracer.endSpan(finished);

      // Verify metrics
      expect(metrics.getCounter(MetricNames.REQUEST_COUNT, { endpoint: 'messages' })).toBe(1);
      expect(metrics.getHistogram(MetricNames.REQUEST_DURATION_MS, { endpoint: 'messages' })).toEqual([150]);
      expect(metrics.getCounter(MetricNames.TOKENS_INPUT)).toBe(100);
      expect(metrics.getCounter(MetricNames.TOKENS_OUTPUT)).toBe(50);

      // Verify span
      expect(finished.status.type).toBe('ok');
      expect(getSpanDuration(finished)).toBeDefined();

      // Verify logging (at least 2 calls: 1 for request, 1 for response)
      // Note: span logging goes to console.debug which is not mocked by console.log spy
      expect(consoleLogSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('tracks failed API request lifecycle', () => {
      // Start span
      const span = tracer.startSpan('api-request');
      let requestSpan = withAttribute(span, 'http.method', 'POST');
      requestSpan = withAttribute(requestSpan, 'http.url', '/v1/messages');

      // Log request
      logRequest(logger, 'POST', '/v1/messages', { max_tokens: 1024 });

      // Track metrics
      metrics.incrementCounter(MetricNames.REQUEST_COUNT, 1, { endpoint: 'messages' });

      // Simulate error
      const error = new Error('Rate limit exceeded');
      const duration = 50;

      // Record error metrics
      metrics.recordHistogram(MetricNames.REQUEST_DURATION_MS, duration, { endpoint: 'messages' });
      metrics.incrementCounter(MetricNames.REQUEST_ERRORS, 1, { endpoint: 'messages' });
      metrics.incrementCounter(MetricNames.RATE_LIMIT_HITS, 1);

      // Log error
      logError(logger, error, 'API request');

      // Finish span with error
      const finished = finishSpanWithError(requestSpan, error.message);
      tracer.endSpan(finished);

      // Verify metrics
      expect(metrics.getCounter(MetricNames.REQUEST_COUNT, { endpoint: 'messages' })).toBe(1);
      expect(metrics.getCounter(MetricNames.REQUEST_ERRORS, { endpoint: 'messages' })).toBe(1);
      expect(metrics.getCounter(MetricNames.RATE_LIMIT_HITS)).toBe(1);

      // Verify span
      expect(finished.status.type).toBe('error');
      expect(finished.status).toEqual({ type: 'error', message: 'Rate limit exceeded' });
    });

    it('tracks retry attempts', () => {
      const attempts = 3;

      for (let i = 0; i < attempts; i++) {
        const span = tracer.startSpan(`api-request-attempt-${i + 1}`);
        let requestSpan = withAttribute(span, 'retry.attempt', String(i + 1));

        logger.debug(`Retry attempt ${i + 1}`, { attempt: i + 1 });

        metrics.incrementCounter(MetricNames.RETRY_ATTEMPTS, 1);
        metrics.recordHistogram(MetricNames.REQUEST_DURATION_MS, 100 + i * 50);

        const finished = i < attempts - 1
          ? finishSpanWithError(requestSpan, 'Temporary failure')
          : finishSpan(requestSpan);

        tracer.endSpan(finished);
      }

      expect(metrics.getCounter(MetricNames.RETRY_ATTEMPTS)).toBe(3);
      expect(metrics.getHistogram(MetricNames.REQUEST_DURATION_MS)).toEqual([100, 150, 200]);
    });

    it('tracks circuit breaker state changes', () => {
      // Circuit breaker closed
      metrics.setGauge(MetricNames.CIRCUIT_BREAKER_STATE, 1);
      logger.info('Circuit breaker state', { state: 'closed' });

      expect(metrics.getGauge(MetricNames.CIRCUIT_BREAKER_STATE)).toBe(1);

      // Simulate failures
      for (let i = 0; i < 5; i++) {
        metrics.incrementCounter(MetricNames.REQUEST_ERRORS, 1);
      }

      // Circuit breaker opens
      metrics.setGauge(MetricNames.CIRCUIT_BREAKER_STATE, 0);
      logger.warn('Circuit breaker opened', { failureCount: 5 });

      expect(metrics.getGauge(MetricNames.CIRCUIT_BREAKER_STATE)).toBe(0);
    });

    it('supports nested spans', () => {
      const parentSpan = tracer.startSpan('parent-operation');
      let parent = withAttribute(parentSpan, 'operation.type', 'batch');

      const childSpan1 = tracer.startSpan('child-operation-1');
      let child1 = withAttribute(childSpan1, 'operation.type', 'request');
      child1 = { ...child1, parentSpanId: parent.spanId };

      const childSpan2 = tracer.startSpan('child-operation-2');
      let child2 = withAttribute(childSpan2, 'operation.type', 'request');
      child2 = { ...child2, parentSpanId: parent.spanId };

      // Finish children
      tracer.endSpan(finishSpan(child1));
      tracer.endSpan(finishSpan(child2));

      // Finish parent
      tracer.endSpan(finishSpan(parent));

      expect(child1.parentSpanId).toBe(parent.spanId);
      expect(child2.parentSpanId).toBe(parent.spanId);
    });

    it('aggregates metrics across multiple requests', () => {
      const endpoints = ['/messages', '/models', '/batches'];
      const requestsPerEndpoint = 10;

      for (const endpoint of endpoints) {
        for (let i = 0; i < requestsPerEndpoint; i++) {
          const span = tracer.startSpan('api-request');
          let requestSpan = withAttribute(span, 'endpoint', endpoint);

          metrics.incrementCounter(MetricNames.REQUEST_COUNT, 1, { endpoint });
          metrics.recordHistogram(
            MetricNames.REQUEST_DURATION_MS,
            Math.random() * 200 + 100,
            { endpoint }
          );

          tracer.endSpan(finishSpan(requestSpan));
        }
      }

      // Verify counts
      endpoints.forEach(endpoint => {
        expect(metrics.getCounter(MetricNames.REQUEST_COUNT, { endpoint })).toBe(requestsPerEndpoint);
        expect(metrics.getHistogram(MetricNames.REQUEST_DURATION_MS, { endpoint }).length)
          .toBe(requestsPerEndpoint);
      });

      // Calculate aggregate statistics
      const totalRequests = endpoints.reduce(
        (sum, endpoint) => sum + metrics.getCounter(MetricNames.REQUEST_COUNT, { endpoint }),
        0
      );
      expect(totalRequests).toBe(endpoints.length * requestsPerEndpoint);
    });

    it('supports different log levels', () => {
      const debugLogger = new ConsoleLogger({ level: 'debug', format: 'compact' });
      const infoLogger = new ConsoleLogger({ level: 'info', format: 'compact' });
      const errorLogger = new ConsoleLogger({ level: 'error', format: 'compact' });

      const debugSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Debug logger sees all
      debugLogger.debug('Debug message');
      debugLogger.info('Info message');
      debugLogger.error('Error message');
      expect(debugSpy.mock.calls.length).toBe(3);

      debugSpy.mockClear();

      // Info logger skips debug
      infoLogger.debug('Debug message');
      infoLogger.info('Info message');
      infoLogger.error('Error message');
      expect(debugSpy.mock.calls.length).toBe(2);

      debugSpy.mockClear();

      // Error logger only sees errors
      errorLogger.debug('Debug message');
      errorLogger.info('Info message');
      errorLogger.error('Error message');
      expect(debugSpy.mock.calls.length).toBe(1);

      debugSpy.mockRestore();
    });
  });

  describe('No-op implementations', () => {
    it('no-op implementations have no side effects', async () => {
      const { NoopTracer, NoopMetricsCollector, NoopLogger } = await import('../index.js');

      const tracer = new NoopTracer();
      const metrics = new NoopMetricsCollector();
      const logger = new NoopLogger();

      // Should not throw or produce side effects
      expect(() => {
        const span = tracer.startSpan('test');
        tracer.endSpan(span);

        metrics.incrementCounter('test', 1);
        metrics.recordHistogram('test', 100);
        metrics.setGauge('test', 10);

        logger.trace('test');
        logger.debug('test');
        logger.info('test');
        logger.warn('test');
        logger.error('test');
      }).not.toThrow();
    });
  });
});
