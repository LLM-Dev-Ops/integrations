/**
 * Tracing for vLLM Integration
 * Provides span-based tracing for request tracking
 */

export interface Span {
  spanId: string;
  traceId: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
  status: SpanStatus;
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, string | number | boolean>;
}

export type SpanStatus = 'ok' | 'error' | 'unset';

export interface Tracer {
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): SpanContext;
  getCurrentSpan(): SpanContext | undefined;
}

export interface SpanContext {
  spanId: string;
  traceId: string;
  setAttribute(key: string, value: string | number | boolean): void;
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
  setStatus(status: SpanStatus, message?: string): void;
  end(): void;
}

/**
 * In-memory tracer for testing and development
 */
export class InMemoryTracer implements Tracer {
  private spans: Span[] = [];
  private currentSpan: InMemorySpanContext | undefined;

  startSpan(
    name: string,
    attributes?: Record<string, string | number | boolean>
  ): SpanContext {
    const span: Span = {
      spanId: this.generateId(),
      traceId: this.currentSpan?.traceId ?? this.generateId(),
      name,
      startTime: Date.now(),
      attributes: attributes ?? {},
      events: [],
      status: 'unset',
    };

    const context = new InMemorySpanContext(span, () => {
      this.spans.push(span);
      if (this.currentSpan === context) {
        this.currentSpan = undefined;
      }
    });

    this.currentSpan = context;
    return context;
  }

  getCurrentSpan(): SpanContext | undefined {
    return this.currentSpan;
  }

  getSpans(): Span[] {
    return [...this.spans];
  }

  reset(): void {
    this.spans = [];
    this.currentSpan = undefined;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 18);
  }
}

class InMemorySpanContext implements SpanContext {
  readonly spanId: string;
  readonly traceId: string;
  private readonly span: Span;
  private readonly onEnd: () => void;

  constructor(span: Span, onEnd: () => void) {
    this.span = span;
    this.spanId = span.spanId;
    this.traceId = span.traceId;
    this.onEnd = onEnd;
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.span.attributes[key] = value;
  }

  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
    this.span.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });
  }

  setStatus(status: SpanStatus, message?: string): void {
    this.span.status = status;
    if (message) {
      this.span.attributes['status.message'] = message;
    }
  }

  end(): void {
    this.span.endTime = Date.now();
    this.onEnd();
  }
}

/**
 * No-op tracer for production when tracing is disabled
 */
export class NoopTracer implements Tracer {
  private static readonly noopContext: SpanContext = {
    spanId: '',
    traceId: '',
    setAttribute: () => {},
    addEvent: () => {},
    setStatus: () => {},
    end: () => {},
  };

  startSpan(_name: string, _attributes?: Record<string, string | number | boolean>): SpanContext {
    return NoopTracer.noopContext;
  }

  getCurrentSpan(): SpanContext | undefined {
    return undefined;
  }
}

/**
 * Standard span names for vLLM integration
 */
export const SpanNames = {
  CHAT_COMPLETION: 'vllm.chat_completion',
  CHAT_COMPLETION_STREAM: 'vllm.chat_completion_stream',
  COMPLETION: 'vllm.completion',
  EMBEDDINGS: 'vllm.embeddings',
  LIST_MODELS: 'vllm.list_models',
  TOKENIZE: 'vllm.tokenize',
  DETOKENIZE: 'vllm.detokenize',
  HEALTH_CHECK: 'vllm.health_check',
  BATCH_PROCESS: 'vllm.batch_process',
} as const;

/**
 * Create a tracer based on environment
 */
export function createTracer(enabled: boolean): Tracer {
  if (enabled) {
    return new InMemoryTracer();
  }
  return new NoopTracer();
}
