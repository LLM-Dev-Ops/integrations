/**
 * Tracing utilities for distributed request tracking
 */
/**
 * Creates a new span with a unique trace ID and span ID
 */
export function createSpan(operation) {
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
export function withParent(span, parentSpanId) {
    return { ...span, parentSpanId };
}
/**
 * Adds an attribute to a span (immutable operation)
 */
export function withAttribute(span, key, value) {
    const attributes = new Map(span.attributes);
    attributes.set(key, value);
    return { ...span, attributes };
}
/**
 * Marks a span as successfully completed
 */
export function finishSpan(span) {
    return { ...span, endTime: Date.now(), status: { type: 'ok' } };
}
/**
 * Marks a span as completed with an error
 */
export function finishSpanWithError(span, error) {
    return { ...span, endTime: Date.now(), status: { type: 'error', message: error } };
}
/**
 * Calculates the duration of a span in milliseconds
 */
export function getSpanDuration(span) {
    if (span.endTime === undefined)
        return undefined;
    return span.endTime - span.startTime;
}
/**
 * Default tracer implementation that logs to console
 */
export class DefaultTracer {
    serviceName;
    constructor(serviceName) {
        this.serviceName = serviceName;
    }
    startSpan(operation) {
        const span = withAttribute(createSpan(operation), 'service.name', this.serviceName);
        console.debug(`[TRACE] Span started: ${operation} (${span.traceId}/${span.spanId})`);
        return span;
    }
    endSpan(span) {
        const finished = finishSpan(span);
        const duration = getSpanDuration(finished);
        console.debug(`[TRACE] Span ended: ${span.operation} (${span.traceId}/${span.spanId}) - ${duration}ms`);
    }
}
/**
 * No-op tracer for production environments where tracing is disabled
 */
export class NoopTracer {
    startSpan(operation) {
        return createSpan(operation);
    }
    endSpan(_span) { }
}
/**
 * Generates a unique trace ID
 */
function generateTraceId() {
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`;
}
/**
 * Generates a unique span ID
 */
function generateSpanId() {
    return Math.random().toString(16).slice(2, 18);
}
//# sourceMappingURL=tracing.js.map