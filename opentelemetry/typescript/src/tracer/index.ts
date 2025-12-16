/**
 * OpenTelemetry Span Builder and Tracing Utilities for LLM DevOps Platform
 *
 * This module provides comprehensive tracing capabilities including:
 * - SpanBuilder for fluent span construction
 * - Span implementation with full OpenTelemetry API support
 * - TracingHelper for simplified tracing operations
 * - Helper functions for trace/span ID generation and validation
 */

import type {
  Span,
  SpanContext,
  SpanAttributes,
  Tracer,
  Context,
  Link,
  KeyValue,
  SpanStatus,
  RedactionConfig,
} from '../types/index.js';
import { SpanKind } from '../types/index.js';

// ============================================================================
// SpanBuilder Class
// ============================================================================

/**
 * Builder class for creating and configuring spans with a fluent API
 *
 * Example:
 * ```typescript
 * const span = new SpanBuilder(tracer, 'my-operation')
 *   .withKind(SpanKind.CLIENT)
 *   .withAttribute('http.method', 'GET')
 *   .withParent(parentContext)
 *   .start();
 * ```
 */
export class SpanBuilder {
  private tracer: Tracer;
  private name: string;
  private kind: SpanKind = SpanKind.INTERNAL;
  private attributes: KeyValue[] = [];
  private links: Link[] = [];
  private parent?: Context;
  private startTime?: number;

  constructor(tracer: Tracer, name: string) {
    this.tracer = tracer;
    this.name = name;
  }

  /**
   * Set the span kind
   */
  withKind(kind: SpanKind): this {
    this.kind = kind;
    return this;
  }

  /**
   * Add a single attribute to the span
   */
  withAttribute(key: string, value: string | number | boolean | string[] | number[] | boolean[]): this {
    this.attributes.push({ key, value });
    return this;
  }

  /**
   * Add multiple attributes to the span
   */
  withAttributes(attrs: KeyValue[]): this {
    this.attributes.push(...attrs);
    return this;
  }

  /**
   * Add a link to another span
   */
  withLink(spanContext: SpanContext, attributes?: KeyValue[]): this {
    this.links.push({
      context: spanContext,
      attributes: attributes ? Object.fromEntries(attributes.map(kv => [kv.key, kv.value])) : undefined,
    });
    return this;
  }

  /**
   * Set the parent context for this span
   */
  withParent(context: Context): this {
    this.parent = context;
    return this;
  }

  /**
   * Set the start time for the span
   */
  withStartTime(startTime: number): this {
    this.startTime = startTime;
    return this;
  }

  /**
   * Start the span and return it
   */
  start(): Span {
    const spanAttributes = Object.fromEntries(
      this.attributes.map(kv => [kv.key, kv.value])
    );

    const span = this.tracer.startSpan(
      this.name,
      {
        kind: this.kind,
        attributes: spanAttributes,
        links: this.links,
        startTime: this.startTime,
      },
      this.parent
    );

    return span;
  }

  /**
   * Start the span and return both the span and an updated context
   */
  startWithContext(): [Span, Context] {
    const span = this.start();

    // Create a new context with the span
    const context = createContextWithSpan(span, this.parent);

    return [span, context];
  }
}

// ============================================================================
// SpanImpl - Internal Span Implementation
// ============================================================================

/**
 * Internal implementation of the Span interface
 * This provides a complete OpenTelemetry-compatible span implementation
 */
export class SpanImpl implements Span {
  private context: SpanContext;
  private name: string;
  private startTimeMs: number;
  private endTimeMs?: number;
  private attributes: SpanAttributes = {};
  private events: Array<{ name: string; timestamp: number; attributes?: SpanAttributes }> = [];
  private status: SpanStatus = { code: 'UNSET' };
  private recording = true;

  constructor(
    name: string,
    spanContext: SpanContext,
    startTime?: number
  ) {
    this.name = name;
    this.context = spanContext;
    this.startTimeMs = startTime ?? Date.now();
  }

  spanContext(): SpanContext {
    return this.context;
  }

  setAttribute(key: string, value: string | number | boolean | string[] | number[] | boolean[]): this {
    if (this.recording) {
      this.attributes[key] = value;
    }
    return this;
  }

  setAttributes(attributes: SpanAttributes): this {
    if (this.recording) {
      this.attributes = { ...this.attributes, ...attributes };
    }
    return this;
  }

  addEvent(name: string, attributes?: SpanAttributes, timestamp?: number): this {
    if (this.recording) {
      this.events.push({
        name,
        timestamp: timestamp ?? Date.now(),
        attributes,
      });
    }
    return this;
  }

  setStatus(status: SpanStatus): this {
    if (this.recording) {
      this.status = status;
    }
    return this;
  }

  recordException(error: Error, timestamp?: number): void {
    if (this.recording) {
      this.addEvent('exception', {
        'exception.type': error.name,
        'exception.message': error.message,
        'exception.stacktrace': error.stack || '',
      }, timestamp);

      // Automatically set status to error
      this.setStatus({ code: 'ERROR', message: error.message });
    }
  }

  end(endTime?: number): void {
    if (this.recording) {
      this.endTimeMs = endTime ?? Date.now();
      this.recording = false;
    }
  }

  isRecording(): boolean {
    return this.recording;
  }

  // Additional helper methods
  getDuration(): number | undefined {
    if (this.endTimeMs) {
      return this.endTimeMs - this.startTimeMs;
    }
    return undefined;
  }

  getAttributes(): SpanAttributes {
    return { ...this.attributes };
  }

  getEvents(): Array<{ name: string; timestamp: number; attributes?: SpanAttributes }> {
    return [...this.events];
  }

  getStatus(): SpanStatus {
    return this.status;
  }
}

// ============================================================================
// TracingHelper Class
// ============================================================================

/**
 * Helper class for simplified tracing operations
 *
 * Provides high-level utilities for common tracing patterns, including
 * automatic span lifecycle management and error handling.
 *
 * Example:
 * ```typescript
 * const helper = new TracingHelper(tracer, redactionConfig);
 *
 * // Wrap a function with automatic span creation
 * const result = await helper.trace('my-operation', async () => {
 *   // Your code here
 *   return someValue;
 * });
 * ```
 */
export class TracingHelper {
  private tracer: Tracer;
  private redactionConfig?: RedactionConfig;

  constructor(tracer: Tracer, redactionConfig?: RedactionConfig) {
    this.tracer = tracer;
    this.redactionConfig = redactionConfig;
  }

  /**
   * Create a new span builder
   */
  span(name: string): SpanBuilder {
    return new SpanBuilder(this.tracer, name);
  }

  /**
   * Wrap a function with automatic span creation and error handling
   *
   * The span will automatically:
   * - Start before the function executes
   * - End after the function completes
   * - Record exceptions if the function throws
   * - Set appropriate status codes
   */
  async trace<T>(
    name: string,
    fn: () => Promise<T>,
    options?: {
      kind?: SpanKind;
      attributes?: KeyValue[];
      parent?: Context;
    }
  ): Promise<T> {
    const builder = this.span(name);

    if (options?.kind) {
      builder.withKind(options.kind);
    }

    if (options?.attributes) {
      builder.withAttributes(options.attributes);
    }

    if (options?.parent) {
      builder.withParent(options.parent);
    }

    const span = builder.start();

    try {
      const result = await fn();
      span.setStatus({ code: 'OK' });
      return result;
    } catch (error) {
      if (error instanceof Error) {
        span.recordException(error);
      } else {
        span.setStatus({ code: 'ERROR', message: String(error) });
      }
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Add an event to a span with optional attributes
   */
  addEvent(span: Span, name: string, attributes?: KeyValue[]): void {
    const attrObj = attributes
      ? Object.fromEntries(attributes.map(kv => [kv.key, kv.value]))
      : undefined;
    span.addEvent(name, attrObj);
  }

  /**
   * Set an attribute on a span, applying redaction if configured
   */
  setAttribute(span: Span, key: string, value: string | number | boolean | string[] | number[] | boolean[]): void {
    const shouldRedact = this.shouldRedactKey(key);

    if (shouldRedact && typeof value === 'string') {
      span.setAttribute(key, '[REDACTED]');
    } else {
      span.setAttribute(key, value);
    }
  }

  /**
   * Record an exception on a span
   */
  recordException(span: Span, error: Error): void {
    span.recordException(error);
  }

  /**
   * Check if a key should be redacted based on configuration
   */
  private shouldRedactKey(key: string): boolean {
    if (!this.redactionConfig) {
      return false;
    }

    const lowerKey = key.toLowerCase();

    // Check if it matches prompt/response redaction patterns
    if (this.redactionConfig.redactPrompts &&
        (lowerKey.includes('prompt') || lowerKey.includes('input'))) {
      return true;
    }

    if (this.redactionConfig.redactResponses &&
        (lowerKey.includes('response') || lowerKey.includes('completion') || lowerKey.includes('output'))) {
      return true;
    }

    if (this.redactionConfig.redactToolInputs &&
        lowerKey.includes('tool')) {
      return true;
    }

    return false;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a valid OpenTelemetry trace ID (32 hex characters)
 *
 * Format: 32 lowercase hexadecimal characters representing a 16-byte array
 * Example: "4bf92f3577b34da6a3ce929d0e0e4736"
 */
export function generateTraceId(): string {
  const bytes = new Uint8Array(16);

  // Use crypto.getRandomValues if available, otherwise fallback to Math.random
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a valid OpenTelemetry span ID (16 hex characters)
 *
 * Format: 16 lowercase hexadecimal characters representing an 8-byte array
 * Example: "00f067aa0ba902b7"
 */
export function generateSpanId(): string {
  const bytes = new Uint8Array(8);

  // Use crypto.getRandomValues if available, otherwise fallback to Math.random
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 8; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Validate that a trace ID is well-formed
 *
 * A valid trace ID must be:
 * - Exactly 32 hexadecimal characters
 * - Not all zeros
 */
export function isValidTraceId(id: string): boolean {
  if (!id || id.length !== 32) {
    return false;
  }

  // Check if all characters are valid hex
  if (!/^[0-9a-f]{32}$/i.test(id)) {
    return false;
  }

  // Check if it's not all zeros
  if (id === '00000000000000000000000000000000') {
    return false;
  }

  return true;
}

/**
 * Validate that a span ID is well-formed
 *
 * A valid span ID must be:
 * - Exactly 16 hexadecimal characters
 * - Not all zeros
 */
export function isValidSpanId(id: string): boolean {
  if (!id || id.length !== 16) {
    return false;
  }

  // Check if all characters are valid hex
  if (!/^[0-9a-f]{16}$/i.test(id)) {
    return false;
  }

  // Check if it's not all zeros
  if (id === '0000000000000000') {
    return false;
  }

  return true;
}

/**
 * Create a span context from trace and span IDs
 */
export function createSpanContext(
  traceId: string,
  spanId: string,
  traceFlags: number = 1,
  traceState?: string,
  isRemote: boolean = false
): SpanContext {
  if (!isValidTraceId(traceId)) {
    throw new Error(`Invalid trace ID: ${traceId}`);
  }

  if (!isValidSpanId(spanId)) {
    throw new Error(`Invalid span ID: ${spanId}`);
  }

  return {
    traceId,
    spanId,
    traceFlags,
    traceState,
  };
}

/**
 * Create a new context with a span
 * This is a simplified implementation - in a real OpenTelemetry setup,
 * you would use the actual Context API
 */
function createContextWithSpan(span: Span, parent?: Context): Context {
  const SPAN_KEY = Symbol.for('OpenTelemetry Context Key SPAN');

  if (parent) {
    return {
      getValue(key: symbol): unknown {
        if (key === SPAN_KEY) {
          return span;
        }
        return parent.getValue(key);
      },
      setValue(key: symbol, value: unknown): Context {
        if (key === SPAN_KEY) {
          return createContextWithSpan(value as Span, parent);
        }
        return this;
      },
    };
  }

  return {
    getValue(key: symbol): unknown {
      if (key === SPAN_KEY) {
        return span;
      }
      return undefined;
    },
    setValue(key: symbol, value: unknown): Context {
      if (key === SPAN_KEY) {
        return createContextWithSpan(value as Span);
      }
      return this;
    },
  };
}

/**
 * Extract span from context
 */
export function getSpanFromContext(context: Context): Span | undefined {
  const SPAN_KEY = Symbol.for('OpenTelemetry Context Key SPAN');
  return context.getValue(SPAN_KEY) as Span | undefined;
}

// ============================================================================
// Exports
// ============================================================================

export type { Span, SpanContext, Context };
