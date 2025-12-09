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
export type SpanStatus = {
    type: 'ok';
} | {
    type: 'error';
    message: string;
} | {
    type: 'unset';
};
export interface Tracer {
    startSpan(operation: string): RequestSpan;
    endSpan(span: RequestSpan): void;
}
/**
 * Creates a new span with a unique trace ID and span ID
 */
export declare function createSpan(operation: string): RequestSpan;
/**
 * Creates a child span with the given parent span ID
 */
export declare function withParent(span: RequestSpan, parentSpanId: string): RequestSpan;
/**
 * Adds an attribute to a span (immutable operation)
 */
export declare function withAttribute(span: RequestSpan, key: string, value: string): RequestSpan;
/**
 * Marks a span as successfully completed
 */
export declare function finishSpan(span: RequestSpan): RequestSpan;
/**
 * Marks a span as completed with an error
 */
export declare function finishSpanWithError(span: RequestSpan, error: string): RequestSpan;
/**
 * Calculates the duration of a span in milliseconds
 */
export declare function getSpanDuration(span: RequestSpan): number | undefined;
/**
 * Default tracer implementation that logs to console
 */
export declare class DefaultTracer implements Tracer {
    private serviceName;
    constructor(serviceName: string);
    startSpan(operation: string): RequestSpan;
    endSpan(span: RequestSpan): void;
}
/**
 * No-op tracer for production environments where tracing is disabled
 */
export declare class NoopTracer implements Tracer {
    startSpan(operation: string): RequestSpan;
    endSpan(_span: RequestSpan): void;
}
//# sourceMappingURL=tracing.d.ts.map