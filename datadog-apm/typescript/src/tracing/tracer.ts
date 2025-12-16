/**
 * Tracer wrapper for dd-trace integration.
 *
 * Provides a thin wrapper around dd-trace's tracer with:
 * - Type-safe interface
 * - Span creation and management
 * - Context propagation
 */

import type { Span } from './interface';
import { SpanImpl } from './span';
import type { SpanOptions, SpanContext } from '../types';
import type { Carrier, RedactionRule } from '../types';

/**
 * Datadog tracer wrapper (represents dd-trace tracer interface)
 */
interface DatadogTracerWrapper {
  startSpan(name: string, options?: {
    childOf?: unknown;
    tags?: Record<string, unknown>;
    startTime?: number;
    type?: string;
    resource?: string;
  }): any;

  scope(): {
    active(): any | null;
  };

  inject(spanContext: unknown, format: string, carrier: Carrier): void;
  extract(format: string, carrier: Carrier): unknown | null;
}

/**
 * Tracer provides access to tracing operations.
 *
 * This class wraps dd-trace's tracer and provides:
 * - Span creation with automatic redaction
 * - Active span retrieval
 * - Context injection and extraction for distributed tracing
 */
export class Tracer {
  private readonly tracer: DatadogTracerWrapper;
  private readonly redactionRules: RedactionRule[];

  constructor(tracer: DatadogTracerWrapper, redactionRules: RedactionRule[] = []) {
    this.tracer = tracer;
    this.redactionRules = redactionRules;
  }

  /**
   * Start a new span.
   *
   * @param name - Operation name for the span
   * @param options - Span options
   * @returns A new Span instance
   *
   * @example
   * ```typescript
   * const span = tracer.startSpan('http.request', {
   *   resource: '/api/users',
   *   type: SpanType.HTTP,
   *   tags: {
   *     'http.method': 'GET',
   *     'http.url': '/api/users'
   *   }
   * });
   * ```
   */
  startSpan(name: string, options?: SpanOptions): Span {
    const ddOptions: any = {};

    if (options?.childOf) {
      ddOptions.childOf = options.childOf;
    }

    if (options?.tags) {
      ddOptions.tags = options.tags;
    }

    if (options?.startTime) {
      ddOptions.startTime = options.startTime;
    }

    if (options?.type) {
      ddOptions.type = options.type;
    }

    if (options?.resource) {
      ddOptions.resource = options.resource;
    }

    const ddSpan = this.tracer.startSpan(name, ddOptions);
    return new SpanImpl(ddSpan, this.redactionRules);
  }

  /**
   * Get the currently active span.
   *
   * @returns The active span, or null if no span is active
   *
   * @example
   * ```typescript
   * const activeSpan = tracer.getCurrentSpan();
   * if (activeSpan) {
   *   activeSpan.setTag('user.id', userId);
   * }
   * ```
   */
  getCurrentSpan(): Span | null {
    const ddSpan = this.tracer.scope().active();
    if (!ddSpan) {
      return null;
    }
    return new SpanImpl(ddSpan, this.redactionRules);
  }

  /**
   * Inject span context into a carrier for propagation.
   *
   * This is used to propagate trace context across service boundaries,
   * typically via HTTP headers.
   *
   * @param carrier - Carrier object (typically HTTP headers)
   *
   * @example
   * ```typescript
   * const headers: Record<string, string> = {};
   * tracer.injectContext(headers);
   * // headers now contains x-datadog-trace-id, x-datadog-parent-id, etc.
   * ```
   */
  injectContext(carrier: Carrier): void {
    const activeSpan = this.tracer.scope().active();
    if (!activeSpan) {
      return;
    }

    const spanContext = activeSpan.context();
    this.tracer.inject(spanContext, 'text_map', carrier);
  }

  /**
   * Extract span context from a carrier.
   *
   * This is used to continue a trace started in another service,
   * typically from HTTP headers.
   *
   * @param carrier - Carrier object (typically HTTP headers)
   * @returns Extracted span context, or null if no context found
   *
   * @example
   * ```typescript
   * const context = tracer.extractContext(request.headers);
   * if (context) {
   *   const span = tracer.startSpan('handle.request', {
   *     childOf: context
   *   });
   * }
   * ```
   */
  extractContext(carrier: Carrier): SpanContext | null {
    const spanContext = this.tracer.extract('text_map', carrier);
    if (!spanContext) {
      return null;
    }

    // Convert dd-trace span context to our SpanContext interface
    const ddContext = spanContext as any;
    return {
      traceId: ddContext.toTraceId?.() || ddContext._traceId?.toString(16) || '',
      spanId: ddContext.toSpanId?.() || ddContext._spanId?.toString(16) || '',
      parentId: ddContext._parentId?.toString(16),
      samplingPriority: ddContext._sampling?.priority,
    };
  }
}
