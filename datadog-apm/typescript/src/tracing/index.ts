/**
 * Tracing module for Datadog APM integration.
 *
 * Exports span interfaces, implementations, and tracer functionality.
 */

// Span interface
export type { Span } from './interface';

// Span implementation
export { SpanImpl } from './span';

// Tracer
export { Tracer } from './tracer';
