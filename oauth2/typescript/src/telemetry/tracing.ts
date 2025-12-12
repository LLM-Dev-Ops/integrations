/**
 * OAuth2 Tracing
 *
 * Distributed tracing for OAuth2 operations.
 */

/**
 * Span attributes.
 */
export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Span status.
 */
export type SpanStatus = "unset" | "ok" | "error";

/**
 * Span interface.
 */
export interface Span {
  /**
   * Set attribute on span.
   */
  setAttribute(key: string, value: string | number | boolean): void;

  /**
   * Set multiple attributes.
   */
  setAttributes(attributes: SpanAttributes): void;

  /**
   * Set span status.
   */
  setStatus(status: SpanStatus, message?: string): void;

  /**
   * Record exception.
   */
  recordException(error: Error): void;

  /**
   * Add event to span.
   */
  addEvent(name: string, attributes?: SpanAttributes): void;

  /**
   * End span.
   */
  end(): void;
}

/**
 * Tracer interface.
 */
export interface Tracer {
  /**
   * Start a new span.
   */
  startSpan(name: string, attributes?: SpanAttributes): Span;

  /**
   * Execute operation within a span.
   */
  withSpan<T>(
    name: string,
    attributes: SpanAttributes | undefined,
    fn: (span: Span) => Promise<T>
  ): Promise<T>;
}

/**
 * Standard OAuth2 span names.
 */
export const OAuth2SpanNames = {
  FLOW: "oauth2.flow",
  AUTHORIZATION_URL: "oauth2.authorization_url_generation",
  STATE_GENERATION: "oauth2.state_generation",
  PKCE_GENERATION: "oauth2.pkce_generation",
  TOKEN_EXCHANGE: "oauth2.token_exchange",
  TOKEN_REFRESH: "oauth2.token_refresh",
  TOKEN_STORAGE: "oauth2.token_storage",
  TOKEN_RETRIEVAL: "oauth2.token_retrieval",
  INTROSPECTION: "oauth2.introspection",
  REVOCATION: "oauth2.revocation",
  DISCOVERY: "oauth2.discovery",
  DEVICE_AUTHORIZATION: "oauth2.device_authorization",
  DEVICE_POLL: "oauth2.device_poll",
} as const;

/**
 * Standard OAuth2 span attributes.
 */
export const OAuth2SpanAttributes = {
  FLOW: "oauth2.flow",
  GRANT_TYPE: "oauth2.grant_type",
  SCOPES: "oauth2.scopes",
  PROVIDER: "oauth2.provider",
  TOKEN_TYPE: "oauth2.token_type",
  EXPIRES_IN: "oauth2.expires_in",
  CLIENT_ID: "oauth2.client_id",
  REDIRECT_URI: "oauth2.redirect_uri",
  ERROR_CODE: "oauth2.error_code",
  ERROR_DESCRIPTION: "oauth2.error_description",
} as const;

/**
 * No-op span implementation.
 */
class NoOpSpan implements Span {
  setAttribute(): void {}
  setAttributes(): void {}
  setStatus(): void {}
  recordException(): void {}
  addEvent(): void {}
  end(): void {}
}

/**
 * No-op tracer implementation.
 */
export const noOpTracer: Tracer = {
  startSpan(): Span {
    return new NoOpSpan();
  },
  async withSpan<T>(
    _name: string,
    _attributes: SpanAttributes | undefined,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    return fn(new NoOpSpan());
  },
};

/**
 * In-memory span for testing.
 */
export class InMemorySpan implements Span {
  readonly name: string;
  readonly attributes: SpanAttributes = {};
  readonly events: Array<{ name: string; attributes?: SpanAttributes; timestamp: Date }> = [];
  status: SpanStatus = "unset";
  statusMessage?: string;
  exception?: Error;
  endTime?: Date;
  readonly startTime: Date = new Date();

  constructor(name: string, attributes?: SpanAttributes) {
    this.name = name;
    if (attributes) {
      this.attributes = { ...attributes };
    }
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.attributes[key] = value;
  }

  setAttributes(attributes: SpanAttributes): void {
    Object.assign(this.attributes, attributes);
  }

  setStatus(status: SpanStatus, message?: string): void {
    this.status = status;
    this.statusMessage = message;
  }

  recordException(error: Error): void {
    this.exception = error;
    this.setStatus("error", error.message);
  }

  addEvent(name: string, attributes?: SpanAttributes): void {
    this.events.push({ name, attributes, timestamp: new Date() });
  }

  end(): void {
    this.endTime = new Date();
  }

  /**
   * Get duration in milliseconds.
   */
  getDuration(): number | undefined {
    if (!this.endTime) return undefined;
    return this.endTime.getTime() - this.startTime.getTime();
  }
}

/**
 * In-memory tracer for testing.
 */
export class InMemoryTracer implements Tracer {
  private spans: InMemorySpan[] = [];

  startSpan(name: string, attributes?: SpanAttributes): InMemorySpan {
    const span = new InMemorySpan(name, attributes);
    this.spans.push(span);
    return span;
  }

  async withSpan<T>(
    name: string,
    attributes: SpanAttributes | undefined,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    const span = this.startSpan(name, attributes);
    try {
      const result = await fn(span);
      span.setStatus("ok");
      return result;
    } catch (error) {
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Get all recorded spans.
   */
  getSpans(): InMemorySpan[] {
    return [...this.spans];
  }

  /**
   * Get spans by name.
   */
  getSpansByName(name: string): InMemorySpan[] {
    return this.spans.filter((s) => s.name === name);
  }

  /**
   * Clear all spans.
   */
  clear(): void {
    this.spans = [];
  }
}

/**
 * Create in-memory tracer for testing.
 */
export function createInMemoryTracer(): InMemoryTracer {
  return new InMemoryTracer();
}
