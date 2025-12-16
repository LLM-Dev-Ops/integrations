/**
 * OpenTelemetry Export Layer
 *
 * Provides span export functionality including various exporters, batch processing,
 * resilience patterns, and circuit breaker implementation.
 *
 * @module export
 */

import type {
  Span,
  SpanAttributes,
  Context,
  ExporterConfig,
} from '../types/index.js';

/**
 * Represents span data in a serializable format for export
 */
export interface SpanData {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: 'CLIENT' | 'SERVER' | 'PRODUCER' | 'CONSUMER' | 'INTERNAL';
  startTime: number;
  endTime: number;
  attributes: SpanAttributes;
  status: {
    code: 'UNSET' | 'OK' | 'ERROR';
    message?: string;
  };
  events: Array<{
    name: string;
    timestamp: number;
    attributes?: SpanAttributes;
  }>;
  links: Array<{
    context: Context;
    attributes?: SpanAttributes;
  }>;
  resource: SpanAttributes;
}

/**
 * Result of an export operation
 */
export type ExportResult = 'success' | 'failed_retryable' | 'failed_not_retryable';

/**
 * Interface for span exporters
 */
export interface SpanExporter {
  /**
   * Export a batch of spans
   */
  export(spans: SpanData[]): Promise<ExportResult>;

  /**
   * Shutdown the exporter and cleanup resources
   */
  shutdown(): Promise<void>;
}

/**
 * Configuration for batch span processor
 */
export interface BatchConfig {
  /**
   * Maximum queue size
   * @default 2048
   */
  maxQueueSize?: number;

  /**
   * Maximum batch size
   * @default 512
   */
  maxBatchSize?: number;

  /**
   * Maximum time to wait before exporting (ms)
   * @default 5000
   */
  scheduledDelayMillis?: number;

  /**
   * Export timeout (ms)
   * @default 30000
   */
  exportTimeoutMillis?: number;
}

/**
 * Mock span exporter for testing purposes
 */
export class MockSpanExporter implements SpanExporter {
  private spans: SpanData[] = [];
  private isShutdown = false;

  /**
   * Export spans to in-memory storage
   */
  async export(spans: SpanData[]): Promise<ExportResult> {
    if (this.isShutdown) {
      return 'failed_not_retryable';
    }
    this.spans.push(...spans);
    return 'success';
  }

  /**
   * Get all exported spans
   */
  getSpans(): SpanData[] {
    return [...this.spans];
  }

  /**
   * Get spans by name
   */
  getSpansByName(name: string): SpanData[] {
    return this.spans.filter(span => span.name === name);
  }

  /**
   * Assert that a span with the given name exists
   * @throws {Error} if span doesn't exist
   */
  assertSpanExists(name: string): void {
    const spans = this.getSpansByName(name);
    if (spans.length === 0) {
      throw new Error(`Expected span with name "${name}" but found none`);
    }
  }

  /**
   * Assert that a span has a specific attribute value
   * @throws {Error} if assertion fails
   */
  assertAttribute(spanName: string, key: string, value: unknown): void {
    const spans = this.getSpansByName(spanName);
    if (spans.length === 0) {
      throw new Error(`No span found with name "${spanName}"`);
    }

    const span = spans[0];
    const actualValue = span.attributes[key];

    if (actualValue !== value) {
      throw new Error(
        `Expected attribute "${key}" to be ${JSON.stringify(value)} but got ${JSON.stringify(actualValue)}`
      );
    }
  }

  /**
   * Clear all stored spans
   */
  clear(): void {
    this.spans = [];
  }

  /**
   * Shutdown the exporter
   */
  async shutdown(): Promise<void> {
    this.isShutdown = true;
    this.spans = [];
  }
}

/**
 * Options for stdout exporter
 */
export interface StdoutExporterOptions {
  /**
   * Pretty print JSON output
   * @default false
   */
  pretty?: boolean;
}

/**
 * Exports spans to stdout (console)
 */
export class StdoutSpanExporter implements SpanExporter {
  private readonly pretty: boolean;
  private isShutdown = false;

  constructor(options?: StdoutExporterOptions) {
    this.pretty = options?.pretty ?? false;
  }

  /**
   * Export spans to console
   */
  async export(spans: SpanData[]): Promise<ExportResult> {
    if (this.isShutdown) {
      return 'failed_not_retryable';
    }

    try {
      for (const span of spans) {
        const output = this.pretty
          ? JSON.stringify(span, null, 2)
          : JSON.stringify(span);
        console.log(output);
      }
      return 'success';
    } catch (error) {
      console.error('Failed to export spans to stdout:', error);
      return 'failed_not_retryable';
    }
  }

  /**
   * Shutdown the exporter
   */
  async shutdown(): Promise<void> {
    this.isShutdown = true;
  }
}

/**
 * Batch span processor that accumulates spans and exports them in batches
 */
export class BatchSpanProcessor {
  private readonly exporter: SpanExporter;
  private readonly config: Required<BatchConfig>;
  private readonly queue: SpanData[] = [];
  private timer?: NodeJS.Timeout;
  private isShutdown = false;
  private isExporting = false;

  constructor(exporter: SpanExporter, config?: BatchConfig) {
    this.exporter = exporter;
    this.config = {
      maxQueueSize: config?.maxQueueSize ?? 2048,
      maxBatchSize: config?.maxBatchSize ?? 512,
      scheduledDelayMillis: config?.scheduledDelayMillis ?? 5000,
      exportTimeoutMillis: config?.exportTimeoutMillis ?? 30000,
    };

    this.startTimer();
  }

  /**
   * Called when a span ends
   */
  onEnd(span: Span): void {
    if (this.isShutdown) {
      return;
    }

    const spanData = this.spanToSpanData(span);
    this.queue.push(spanData);

    // Check if we should export immediately
    if (this.queue.length >= this.config.maxBatchSize) {
      this.triggerExport();
    } else if (this.queue.length >= this.config.maxQueueSize) {
      // Queue is full, drop oldest spans
      this.queue.shift();
    }
  }

  /**
   * Force flush all pending spans
   */
  async forceFlush(): Promise<void> {
    if (this.queue.length === 0 || this.isShutdown) {
      return;
    }

    await this.export();
  }

  /**
   * Shutdown the processor
   */
  async shutdown(): Promise<void> {
    if (this.isShutdown) {
      return;
    }

    this.isShutdown = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    // Flush remaining spans
    await this.forceFlush();

    // Shutdown exporter
    await this.exporter.shutdown();
  }

  /**
   * Convert Span to SpanData
   */
  private spanToSpanData(span: Span): SpanData {
    // This is a simplified conversion - actual implementation would need
    // to access internal span properties
    return {
      traceId: (span as any).traceId || '',
      spanId: (span as any).spanId || '',
      parentSpanId: (span as any).parentSpanId,
      name: (span as any).name || '',
      kind: (span as any).kind || 'INTERNAL',
      startTime: (span as any).startTime || Date.now(),
      endTime: (span as any).endTime || Date.now(),
      attributes: (span as any).attributes || {},
      status: (span as any).status || { code: 'UNSET' },
      events: (span as any).events || [],
      links: (span as any).links || [],
      resource: (span as any).resource || {},
    };
  }

  /**
   * Start the export timer
   */
  private startTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.triggerExport();
      if (!this.isShutdown) {
        this.startTimer();
      }
    }, this.config.scheduledDelayMillis);
  }

  /**
   * Trigger an export if not already exporting
   */
  private triggerExport(): void {
    if (this.isExporting || this.queue.length === 0) {
      return;
    }

    this.export().catch((error) => {
      console.error('Failed to export spans:', error);
    });
  }

  /**
   * Export spans from the queue
   */
  private async export(): Promise<void> {
    if (this.isExporting || this.queue.length === 0) {
      return;
    }

    this.isExporting = true;

    try {
      // Take batch from queue
      const batchSize = Math.min(this.queue.length, this.config.maxBatchSize);
      const batch = this.queue.splice(0, batchSize);

      // Export with timeout
      const exportPromise = this.exporter.export(batch);
      const timeoutPromise = new Promise<ExportResult>((_, reject) =>
        setTimeout(() => reject(new Error('Export timeout')), this.config.exportTimeoutMillis)
      );

      const result = await Promise.race([exportPromise, timeoutPromise]);

      if (result === 'failed_retryable') {
        // Put spans back in queue for retry
        this.queue.unshift(...batch);
      }
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      this.isExporting = false;
    }
  }
}

/**
 * Abstract base class for OTLP exporters
 */
export abstract class OtlpExporter implements SpanExporter {
  protected readonly config: ExporterConfig;
  private isShutdown = false;

  constructor(config: ExporterConfig) {
    this.config = config;
  }

  /**
   * Serialize spans to OTLP format
   */
  protected abstract serializeSpans(spans: SpanData[]): Uint8Array;

  /**
   * Export spans via OTLP protocol
   */
  async export(spans: SpanData[]): Promise<ExportResult> {
    if (this.isShutdown) {
      return 'failed_not_retryable';
    }

    try {
      const serialized = this.serializeSpans(spans);

      // Send to endpoint
      const response = await fetch(this.config.endpoint || '', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-protobuf',
          ...(this.config.headers || {}),
        },
        body: serialized,
      });

      if (response.ok) {
        return 'success';
      }

      // Determine if retryable based on status code
      if (response.status >= 500 || response.status === 429) {
        return 'failed_retryable';
      }

      return 'failed_not_retryable';
    } catch (error) {
      console.error('OTLP export error:', error);
      // Network errors are typically retryable
      return 'failed_retryable';
    }
  }

  /**
   * Shutdown the exporter
   */
  async shutdown(): Promise<void> {
    this.isShutdown = true;
  }
}

/**
 * Circuit breaker states
 */
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /**
   * Number of failures before opening circuit
   * @default 5
   */
  failureThreshold: number;

  /**
   * Time in ms before attempting to close circuit
   * @default 60000
   */
  resetTimeout: number;
}

/**
 * Circuit breaker pattern implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime?: number;
  private readonly config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  /**
   * Check if circuit allows execution
   */
  canExecute(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      // Check if we should transition to half-open
      if (
        this.lastFailureTime &&
        Date.now() - this.lastFailureTime >= this.config.resetTimeout
      ) {
        this.state = CircuitState.HALF_OPEN;
        return true;
      }
      return false;
    }

    // HALF_OPEN state
    return true;
  }

  /**
   * Record a successful execution
   */
  recordSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
  }

  /**
   * Record a failed execution
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }
}

/**
 * Resilient exporter configuration
 */
export interface ResilientExporterConfig {
  /**
   * Circuit breaker configuration
   */
  circuitBreaker?: CircuitBreakerConfig;

  /**
   * Maximum buffer size for failed spans
   * @default 10000
   */
  maxBufferSize?: number;

  /**
   * Retry delay in ms
   * @default 1000
   */
  retryDelayMs?: number;
}

/**
 * Resilient exporter with fallback and circuit breaker
 */
export class ResilientExporter implements SpanExporter {
  private readonly primary: SpanExporter;
  private readonly fallback: SpanExporter;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly buffer: SpanData[] = [];
  private readonly maxBufferSize: number;
  private readonly retryDelayMs: number;
  private isShutdown = false;

  constructor(
    primary: SpanExporter,
    fallback: SpanExporter,
    config?: ResilientExporterConfig
  ) {
    this.primary = primary;
    this.fallback = fallback;
    this.circuitBreaker = new CircuitBreaker(
      config?.circuitBreaker || {
        failureThreshold: 5,
        resetTimeout: 60000,
      }
    );
    this.maxBufferSize = config?.maxBufferSize ?? 10000;
    this.retryDelayMs = config?.retryDelayMs ?? 1000;
  }

  /**
   * Export spans with resilience patterns
   */
  async export(spans: SpanData[]): Promise<ExportResult> {
    if (this.isShutdown) {
      return 'failed_not_retryable';
    }

    // Try to export buffered spans first
    await this.retryBuffered();

    let result: ExportResult;

    // Try primary exporter if circuit allows
    if (this.circuitBreaker.canExecute()) {
      result = await this.primary.export(spans);

      if (result === 'success') {
        this.circuitBreaker.recordSuccess();
        return 'success';
      }

      this.circuitBreaker.recordFailure();

      // If not retryable, don't try fallback
      if (result === 'failed_not_retryable') {
        return result;
      }
    }

    // Try fallback exporter
    try {
      result = await this.fallback.export(spans);

      if (result === 'success') {
        return 'success';
      }
    } catch (error) {
      console.error('Fallback exporter error:', error);
    }

    // Buffer spans for later retry
    this.bufferSpans(spans);

    return 'failed_retryable';
  }

  /**
   * Shutdown both exporters
   */
  async shutdown(): Promise<void> {
    this.isShutdown = true;

    await Promise.all([
      this.primary.shutdown(),
      this.fallback.shutdown(),
    ]);

    this.buffer.length = 0;
  }

  /**
   * Buffer spans for retry
   */
  private bufferSpans(spans: SpanData[]): void {
    if (this.buffer.length + spans.length > this.maxBufferSize) {
      // Remove oldest spans to make room
      const overflow = this.buffer.length + spans.length - this.maxBufferSize;
      this.buffer.splice(0, overflow);
    }

    this.buffer.push(...spans);
  }

  /**
   * Retry exporting buffered spans
   */
  private async retryBuffered(): Promise<void> {
    if (this.buffer.length === 0 || !this.circuitBreaker.canExecute()) {
      return;
    }

    // Take a batch from buffer
    const batchSize = Math.min(this.buffer.length, 100);
    const batch = this.buffer.splice(0, batchSize);

    try {
      const result = await this.primary.export(batch);

      if (result === 'success') {
        this.circuitBreaker.recordSuccess();
      } else {
        // Put back in buffer
        this.buffer.unshift(...batch);
        this.circuitBreaker.recordFailure();
      }
    } catch (error) {
      // Put back in buffer
      this.buffer.unshift(...batch);
      this.circuitBreaker.recordFailure();
    }
  }
}

// Types are already exported via interface/type declarations above
