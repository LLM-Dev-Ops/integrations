/**
 * Tracing utilities for distributed request tracking
 */

export interface RequestSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operation: string;
  startTime: number;
  endTime?: number;
  attributes: Map<string, string>;
  status: SpanStatus;
}

export type SpanStatus =
  | { type: 'ok' }
  | { type: 'error'; message: string }
  | { type: 'unset' };

export interface Tracer {
  startSpan(operation: string): RequestSpan;
  endSpan(span: RequestSpan): void;
}

/**
 * Creates a new span with a unique trace ID and span ID
 */
export function createSpan(operation: string): RequestSpan {
  return {
    traceId: generateTraceId(),
    spanId: generateSpanId(),
    operation,
    startTime: Date.now(),
    attributes: new Map(),
    status: { type: 'unset' },
  };
}

/**
 * Creates a child span with the given parent span ID
 */
export function withParent(span: RequestSpan, parentSpanId: string): RequestSpan {
  return { ...span, parentSpanId };
}

/**
 * Adds an attribute to a span (immutable operation)
 */
export function withAttribute(span: RequestSpan, key: string, value: string): RequestSpan {
  const attributes = new Map(span.attributes);
  attributes.set(key, value);
  return { ...span, attributes };
}

/**
 * Marks a span as successfully completed
 */
export function finishSpan(span: RequestSpan): RequestSpan {
  return { ...span, endTime: Date.now(), status: { type: 'ok' } };
}

/**
 * Marks a span as completed with an error
 */
export function finishSpanWithError(span: RequestSpan, error: string): RequestSpan {
  return { ...span, endTime: Date.now(), status: { type: 'error', message: error } };
}

/**
 * Calculates the duration of a span in milliseconds
 */
export function getSpanDuration(span: RequestSpan): number | undefined {
  if (span.endTime === undefined) return undefined;
  return span.endTime - span.startTime;
}

/**
 * Default tracer implementation that logs to console
 */
export class DefaultTracer implements Tracer {
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  startSpan(operation: string): RequestSpan {
    const span = withAttribute(createSpan(operation), 'service.name', this.serviceName);
    console.debug(`[TRACE] Span started: ${operation} (${span.traceId}/${span.spanId})`);
    return span;
  }

  endSpan(span: RequestSpan): void {
    const finished = finishSpan(span);
    const duration = getSpanDuration(finished);
    console.debug(
      `[TRACE] Span ended: ${span.operation} (${span.traceId}/${span.spanId}) - ${duration}ms`
    );
  }
}

/**
 * No-op tracer for production environments where tracing is disabled
 */
export class NoopTracer implements Tracer {
  startSpan(operation: string): RequestSpan {
    return createSpan(operation);
  }

  endSpan(_span: RequestSpan): void {}
}

/**
 * Generates a unique trace ID
 */
function generateTraceId(): string {
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`;
}

/**
 * Generates a unique span ID
 */
function generateSpanId(): string {
  return Math.random().toString(16).slice(2, 18);
}
