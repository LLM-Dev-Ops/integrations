/**
 * Azure Key Vault Observability - Tracing
 *
 * Distributed tracing utilities for Key Vault operations following SPARC specification.
 */

/**
 * Span status
 */
export enum SpanStatus {
  OK = 'ok',
  ERROR = 'error',
}

/**
 * Span interface
 */
export interface Span {
  /** Span name */
  name: string;
  /** Start time */
  startTime: Date;
  /** End time */
  endTime?: Date;
  /** Status */
  status: SpanStatus;
  /** Attributes */
  attributes: Record<string, string | number | boolean>;
  /** Error if status is ERROR */
  error?: Error;

  /**
   * Set an attribute
   */
  setAttribute(key: string, value: string | number | boolean): void;

  /**
   * Set multiple attributes
   */
  setAttributes(attributes: Record<string, string | number | boolean>): void;

  /**
   * Set span status
   */
  setStatus(status: SpanStatus): void;

  /**
   * Record an error
   */
  recordError(error: Error): void;

  /**
   * End the span
   */
  end(): void;
}

/**
 * Tracer interface
 */
export interface Tracer {
  /**
   * Start a new span
   */
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span;
}

/**
 * No-op span implementation
 */
export class NoOpSpan implements Span {
  name: string;
  startTime: Date;
  endTime?: Date;
  status: SpanStatus = SpanStatus.OK;
  attributes: Record<string, string | number | boolean> = {};
  error?: Error;

  constructor(name: string) {
    this.name = name;
    this.startTime = new Date();
  }

  setAttribute(_key: string, _value: string | number | boolean): void {
    // No-op
  }

  setAttributes(_attributes: Record<string, string | number | boolean>): void {
    // No-op
  }

  setStatus(_status: SpanStatus): void {
    // No-op
  }

  recordError(_error: Error): void {
    // No-op
  }

  end(): void {
    // No-op
  }
}

/**
 * No-op tracer implementation
 */
export class NoOpTracer implements Tracer {
  startSpan(name: string, _attributes?: Record<string, string | number | boolean>): Span {
    return new NoOpSpan(name);
  }
}

/**
 * In-memory span implementation
 */
export class InMemorySpan implements Span {
  name: string;
  startTime: Date;
  endTime?: Date;
  status: SpanStatus = SpanStatus.OK;
  attributes: Record<string, string | number | boolean>;
  error?: Error;

  constructor(name: string, attributes: Record<string, string | number | boolean> = {}) {
    this.name = name;
    this.startTime = new Date();
    this.attributes = { ...attributes };
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.attributes[key] = value;
  }

  setAttributes(attributes: Record<string, string | number | boolean>): void {
    Object.assign(this.attributes, attributes);
  }

  setStatus(status: SpanStatus): void {
    this.status = status;
  }

  recordError(error: Error): void {
    this.error = error;
    this.status = SpanStatus.ERROR;
    this.attributes['error.type'] = error.name;
    this.attributes['error.message'] = error.message;
  }

  end(): void {
    this.endTime = new Date();
  }

  /**
   * Get span duration in milliseconds
   */
  getDuration(): number | undefined {
    if (!this.endTime) {
      return undefined;
    }
    return this.endTime.getTime() - this.startTime.getTime();
  }
}

/**
 * In-memory tracer implementation
 */
export class InMemoryTracer implements Tracer {
  private spans: InMemorySpan[] = [];

  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
    const span = new InMemorySpan(name, attributes);
    this.spans.push(span);
    return span;
  }

  getSpans(): InMemorySpan[] {
    return [...this.spans];
  }

  clear(): void {
    this.spans = [];
  }

  getSpansByName(name: string): InMemorySpan[] {
    return this.spans.filter((s) => s.name === name);
  }
}

/**
 * Create span attributes for Key Vault operations
 */
export function createKeyVaultSpanAttributes(
  vault: string,
  operation: string,
  resourceName?: string,
  resourceType?: string,
  version?: string,
  cacheHit?: boolean
): Record<string, string | boolean> {
  const attributes: Record<string, string | boolean> = {
    vault,
    operation,
  };

  if (resourceName) {
    attributes.resource_name = resourceName;
  }

  if (resourceType) {
    attributes.resource_type = resourceType;
  }

  if (version) {
    attributes.version = version;
  }

  if (cacheHit !== undefined) {
    attributes.cache_hit = cacheHit;
  }

  return attributes;
}

/**
 * Create span attributes for secret operations
 */
export function createSecretSpanAttributes(
  vault: string,
  secretName: string,
  version?: string,
  cacheHit?: boolean
): Record<string, string | boolean> {
  return createKeyVaultSpanAttributes(
    vault,
    'secret',
    secretName,
    'secret',
    version,
    cacheHit
  );
}
