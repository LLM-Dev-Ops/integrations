/**
 * Tracer implementations for the Weaviate client.
 *
 * Provides NoopTracer, ConsoleTracer, and TracerSpan implementations.
 */

import { Span, SpanStatus, Tracer } from './types';

// ============================================================================
// TracerSpan Implementation
// ============================================================================

/**
 * TracerSpan class with parent/child relationships
 */
export class TracerSpan implements Span {
  id: string;
  parentId?: string;
  traceId: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status?: SpanStatus;
  attributes: Record<string, string | number | boolean>;
  events: Array<{
    name: string;
    timestamp: number;
    attributes?: Record<string, string | number | boolean>;
  }>;

  private started = false;
  private ended = false;

  constructor(
    id: string,
    traceId: string,
    name: string,
    parentId?: string,
    attributes?: Record<string, string | number | boolean>
  ) {
    this.id = id;
    this.traceId = traceId;
    this.name = name;
    this.parentId = parentId;
    this.startTime = 0;
    this.attributes = attributes ?? {};
    this.events = [];
  }

  start(): void {
    if (this.started) {
      throw new Error('Span already started');
    }
    this.started = true;
    this.startTime = Date.now();
  }

  end(status: SpanStatus = 'ok'): void {
    if (!this.started) {
      throw new Error('Span not started');
    }
    if (this.ended) {
      throw new Error('Span already ended');
    }
    this.ended = true;
    this.endTime = Date.now();
    this.duration = this.endTime - this.startTime;
    this.status = status;
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.attributes[key] = value;
  }

  recordError(error: Error): void {
    this.addEvent('exception', {
      'exception.type': error.name,
      'exception.message': error.message,
      'exception.stacktrace': error.stack ?? '',
    });
    this.status = 'error';
  }

  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
    this.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });
  }

  isEnded(): boolean {
    return this.ended;
  }

  isStarted(): boolean {
    return this.started;
  }
}

// ============================================================================
// NoopTracer Implementation
// ============================================================================

/**
 * No-op span implementation
 */
class NoopSpan implements Span {
  id = '';
  traceId = '';
  name = '';
  startTime = 0;
  attributes: Record<string, string | number | boolean> = {};
  events: Array<{
    name: string;
    timestamp: number;
    attributes?: Record<string, string | number | boolean>;
  }> = [];

  start(): void {
    // No-op
  }

  end(_status?: SpanStatus): void {
    // No-op
  }

  setAttribute(_key: string, _value: string | number | boolean): void {
    // No-op
  }

  recordError(_error: Error): void {
    // No-op
  }

  addEvent(_name: string, _attributes?: Record<string, string | number | boolean>): void {
    // No-op
  }
}

/**
 * No-op tracer implementation
 */
export class NoopTracer implements Tracer {
  private noopSpan = new NoopSpan();

  startSpan(_name: string, _attributes?: Record<string, string | number | boolean>): Span {
    return this.noopSpan;
  }

  endSpan(_span: Span, _status?: SpanStatus): void {
    // No-op
  }

  getActiveSpan(): Span | undefined {
    return undefined;
  }
}

// ============================================================================
// ConsoleTracer Implementation
// ============================================================================

/**
 * Console-based tracer for development
 */
export class ConsoleTracer implements Tracer {
  private activeSpan?: Span;
  private spanIdCounter = 0;
  private traceIdCounter = 0;

  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
    const span = new TracerSpan(
      `span-${++this.spanIdCounter}`,
      this.activeSpan?.traceId ?? `trace-${++this.traceIdCounter}`,
      name,
      this.activeSpan?.id,
      attributes
    );

    span.start();
    this.activeSpan = span;

    console.log(`[TRACE] Started span: ${name}`, {
      spanId: span.id,
      traceId: span.traceId,
      parentId: span.parentId,
      attributes: span.attributes,
    });

    return span;
  }

  endSpan(span: Span, status: SpanStatus = 'ok'): void {
    span.end(status);

    console.log(`[TRACE] Ended span: ${span.name}`, {
      spanId: span.id,
      traceId: span.traceId,
      duration: span.duration,
      status,
      attributes: span.attributes,
      events: span.events,
    });

    // Clear active span if it's the one we just ended
    if (this.activeSpan?.id === span.id) {
      // If there's a parent, restore it as active
      if (span.parentId) {
        // In a real implementation, we'd maintain a span stack
        // For now, just clear the active span
        this.activeSpan = undefined;
      } else {
        this.activeSpan = undefined;
      }
    }
  }

  getActiveSpan(): Span | undefined {
    return this.activeSpan;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a tracer based on configuration
 */
export function createTracer(options?: { enabled?: boolean; type?: 'console' | 'noop' }): Tracer {
  if (options?.enabled === false || options?.type === 'noop') {
    return new NoopTracer();
  }

  if (options?.type === 'console') {
    return new ConsoleTracer();
  }

  // Default to noop
  return new NoopTracer();
}
