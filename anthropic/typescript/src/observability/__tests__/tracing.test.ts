import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSpan,
  withParent,
  withAttribute,
  finishSpan,
  finishSpanWithError,
  getSpanDuration,
  DefaultTracer,
  NoopTracer,
  type RequestSpan,
} from '../tracing.js';

describe('Tracing', () => {
  describe('createSpan', () => {
    it('creates a span with required fields', () => {
      const span = createSpan('test-operation');

      expect(span.operation).toBe('test-operation');
      expect(span.traceId).toBeDefined();
      expect(span.spanId).toBeDefined();
      expect(span.startTime).toBeGreaterThan(0);
      expect(span.endTime).toBeUndefined();
      expect(span.attributes).toBeInstanceOf(Map);
      expect(span.status).toEqual({ type: 'unset' });
    });

    it('generates unique trace IDs', () => {
      const span1 = createSpan('op1');
      const span2 = createSpan('op2');

      expect(span1.traceId).not.toBe(span2.traceId);
    });

    it('generates unique span IDs', () => {
      const span1 = createSpan('op1');
      const span2 = createSpan('op2');

      expect(span1.spanId).not.toBe(span2.spanId);
    });
  });

  describe('withParent', () => {
    it('adds parent span ID to span', () => {
      const span = createSpan('child-operation');
      const parentId = 'parent-span-id';

      const childSpan = withParent(span, parentId);

      expect(childSpan.parentSpanId).toBe(parentId);
      expect(childSpan.operation).toBe('child-operation');
    });

    it('does not mutate original span', () => {
      const span = createSpan('operation');
      const originalParent = span.parentSpanId;

      withParent(span, 'new-parent');

      expect(span.parentSpanId).toBe(originalParent);
    });
  });

  describe('withAttribute', () => {
    it('adds attribute to span', () => {
      const span = createSpan('operation');

      const updated = withAttribute(span, 'key1', 'value1');

      expect(updated.attributes.get('key1')).toBe('value1');
    });

    it('adds multiple attributes', () => {
      let span = createSpan('operation');
      span = withAttribute(span, 'key1', 'value1');
      span = withAttribute(span, 'key2', 'value2');

      expect(span.attributes.get('key1')).toBe('value1');
      expect(span.attributes.get('key2')).toBe('value2');
    });

    it('does not mutate original span', () => {
      const span = createSpan('operation');
      const originalSize = span.attributes.size;

      withAttribute(span, 'key', 'value');

      expect(span.attributes.size).toBe(originalSize);
    });

    it('overwrites existing attribute', () => {
      let span = createSpan('operation');
      span = withAttribute(span, 'key', 'value1');
      span = withAttribute(span, 'key', 'value2');

      expect(span.attributes.get('key')).toBe('value2');
    });
  });

  describe('finishSpan', () => {
    it('sets end time and status to ok', () => {
      const span = createSpan('operation');
      const finished = finishSpan(span);

      expect(finished.endTime).toBeDefined();
      expect(finished.endTime).toBeGreaterThanOrEqual(finished.startTime);
      expect(finished.status).toEqual({ type: 'ok' });
    });

    it('does not mutate original span', () => {
      const span = createSpan('operation');

      finishSpan(span);

      expect(span.endTime).toBeUndefined();
      expect(span.status.type).toBe('unset');
    });
  });

  describe('finishSpanWithError', () => {
    it('sets end time and error status', () => {
      const span = createSpan('operation');
      const errorMessage = 'Something went wrong';

      const finished = finishSpanWithError(span, errorMessage);

      expect(finished.endTime).toBeDefined();
      expect(finished.status).toEqual({ type: 'error', message: errorMessage });
    });

    it('does not mutate original span', () => {
      const span = createSpan('operation');

      finishSpanWithError(span, 'error');

      expect(span.endTime).toBeUndefined();
      expect(span.status.type).toBe('unset');
    });
  });

  describe('getSpanDuration', () => {
    it('returns undefined for unfinished span', () => {
      const span = createSpan('operation');

      expect(getSpanDuration(span)).toBeUndefined();
    });

    it('returns duration for finished span', () => {
      const span = createSpan('operation');
      const finished = finishSpan(span);

      const duration = getSpanDuration(finished);

      expect(duration).toBeDefined();
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('calculates correct duration', () => {
      const span: RequestSpan = {
        traceId: 'trace',
        spanId: 'span',
        operation: 'test',
        startTime: 1000,
        endTime: 1500,
        attributes: new Map(),
        status: { type: 'ok' },
      };

      expect(getSpanDuration(span)).toBe(500);
    });
  });

  describe('DefaultTracer', () => {
    let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleDebugSpy.mockRestore();
    });

    it('creates tracer with service name', () => {
      const tracer = new DefaultTracer('my-service');

      expect(tracer).toBeDefined();
    });

    it('starts span with service name attribute', () => {
      const tracer = new DefaultTracer('my-service');

      const span = tracer.startSpan('test-operation');

      expect(span.operation).toBe('test-operation');
      expect(span.attributes.get('service.name')).toBe('my-service');
    });

    it('logs when starting span', () => {
      const tracer = new DefaultTracer('my-service');

      const span = tracer.startSpan('test-operation');

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TRACE] Span started: test-operation')
      );
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining(span.traceId)
      );
    });

    it('logs when ending span', () => {
      const tracer = new DefaultTracer('my-service');
      const span = tracer.startSpan('test-operation');

      consoleDebugSpy.mockClear();
      tracer.endSpan(span);

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TRACE] Span ended: test-operation')
      );
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('ms')
      );
    });
  });

  describe('NoopTracer', () => {
    it('starts span without side effects', () => {
      const tracer = new NoopTracer();

      const span = tracer.startSpan('test-operation');

      expect(span.operation).toBe('test-operation');
    });

    it('ends span without side effects', () => {
      const tracer = new NoopTracer();
      const span = tracer.startSpan('test-operation');

      expect(() => tracer.endSpan(span)).not.toThrow();
    });
  });

  describe('Integration scenarios', () => {
    it('supports nested spans', () => {
      const parentSpan = createSpan('parent-operation');
      const childSpan = withParent(createSpan('child-operation'), parentSpan.spanId);

      expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
      expect(childSpan.traceId).not.toBe(parentSpan.traceId);
    });

    it('tracks operation lifecycle', () => {
      let span = createSpan('http-request');
      span = withAttribute(span, 'http.method', 'POST');
      span = withAttribute(span, 'http.url', '/api/messages');

      // Simulate operation
      const finished = finishSpan(span);

      expect(finished.attributes.get('http.method')).toBe('POST');
      expect(finished.status.type).toBe('ok');
      expect(getSpanDuration(finished)).toBeDefined();
    });

    it('handles error scenarios', () => {
      let span = createSpan('database-query');
      span = withAttribute(span, 'db.statement', 'SELECT * FROM users');

      const finished = finishSpanWithError(span, 'Connection timeout');

      expect(finished.status).toEqual({ type: 'error', message: 'Connection timeout' });
      expect(getSpanDuration(finished)).toBeDefined();
    });
  });
});
