/**
 * OpenTelemetry Metrics Module for LLM DevOps Platform
 *
 * Provides a comprehensive metrics helper for tracking LLM operations,
 * including latency, token usage, costs, and self-telemetry.
 */

import type {
  Meter,
  Counter,
  Histogram,
  UpDownCounter,
  MetricAttributes,
} from '../types/index.js';

/**
 * Key-Value pair for metric attributes
 */
export interface KeyValue {
  key: string;
  value: string | number | boolean;
}

/**
 * Predefined histogram buckets for LLM latency measurements (in milliseconds)
 * Covers typical LLM response times from 10ms to 60s
 */
export const LLM_LATENCY_BUCKETS = [
  10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000,
];

/**
 * Predefined histogram buckets for token counts
 * Covers typical token ranges from 10 to 100k tokens
 */
export const TOKEN_BUCKETS = [
  10, 50, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000, 100000,
];

/**
 * Predefined histogram buckets for cost tracking (in USD)
 * Covers typical LLM API costs from $0.0001 to $10.00
 */
export const COST_BUCKETS = [
  0.0001, 0.001, 0.01, 0.05, 0.10, 0.25, 0.50, 1.00, 5.00, 10.00,
];

/**
 * Gauge interface for tracking current values
 */
export interface Gauge {
  /**
   * Set the gauge to a specific value
   */
  set(value: number, attributes?: KeyValue[]): void;
}

/**
 * Internal Gauge implementation
 */
class GaugeImpl implements Gauge {
  private currentValue: number = 0;
  private name: string;
  private description: string;
  private unit: string;

  constructor(name: string, description: string, unit: string) {
    this.name = name;
    this.description = description;
    this.unit = unit;
  }

  set(value: number, attributes?: KeyValue[]): void {
    this.currentValue = value;
    // In a real implementation, this would update the observable gauge
    // For now, we store the value for later observation
  }

  getValue(): number {
    return this.currentValue;
  }
}

/**
 * Counter wrapper that implements custom counter interface
 */
class CounterWrapper implements Counter {
  constructor(private counter: Counter) {}

  add(value: number, attributes?: MetricAttributes): void {
    this.counter.add(value, attributes);
  }
}

/**
 * Histogram wrapper that implements custom histogram interface
 */
class HistogramWrapper implements Histogram {
  constructor(private histogram: Histogram) {}

  record(value: number, attributes?: MetricAttributes): void {
    this.histogram.record(value, attributes);
  }
}

/**
 * UpDownCounter wrapper that implements custom upDownCounter interface
 */
class UpDownCounterWrapper implements UpDownCounter {
  constructor(private upDownCounter: UpDownCounter) {}

  add(value: number, attributes?: MetricAttributes): void {
    this.upDownCounter.add(value, attributes);
  }
}

/**
 * MetricsHelper - Comprehensive metrics management for LLM operations
 *
 * Provides convenient methods for creating and recording various metric types,
 * including self-telemetry for monitoring the OpenTelemetry SDK itself.
 */
export class MetricsHelper {
  private meter: Meter;
  private counters: Map<string, Counter>;
  private histograms: Map<string, Histogram>;
  private gauges: Map<string, Gauge>;
  private upDownCounters: Map<string, UpDownCounter>;

  // Self-telemetry metrics
  private selfTelemetryCounters: Map<string, Counter>;
  private selfTelemetryHistograms: Map<string, Histogram>;
  private selfTelemetryGauges: Map<string, Gauge>;

  /**
   * Creates a new MetricsHelper instance
   * @param meter - OpenTelemetry Meter instance
   */
  constructor(meter: Meter) {
    this.meter = meter;
    this.counters = new Map();
    this.histograms = new Map();
    this.gauges = new Map();
    this.upDownCounters = new Map();
    this.selfTelemetryCounters = new Map();
    this.selfTelemetryHistograms = new Map();
    this.selfTelemetryGauges = new Map();

    this.initializeSelfTelemetry();
  }

  /**
   * Initialize self-telemetry metrics for monitoring the OpenTelemetry SDK
   */
  private initializeSelfTelemetry(): void {
    // Spans created counter
    const spansCreated = this.meter.createCounter('otel_spans_created_total', {
      description: 'Total number of spans created',
      unit: 'spans',
    });
    this.selfTelemetryCounters.set('otel_spans_created_total', spansCreated);

    // Spans exported counter
    const spansExported = this.meter.createCounter('otel_spans_exported_total', {
      description: 'Total number of spans successfully exported',
      unit: 'spans',
    });
    this.selfTelemetryCounters.set('otel_spans_exported_total', spansExported);

    // Spans dropped counter
    const spansDropped = this.meter.createCounter('otel_spans_dropped_total', {
      description: 'Total number of spans dropped due to errors or queue overflow',
      unit: 'spans',
    });
    this.selfTelemetryCounters.set('otel_spans_dropped_total', spansDropped);

    // Export latency histogram
    const exportLatency = this.meter.createHistogram('otel_export_latency_ms', {
      description: 'Latency of span export operations',
      unit: 'ms',
    });
    this.selfTelemetryHistograms.set('otel_export_latency_ms', exportLatency);

    // Queue size gauge
    const queueSize = new GaugeImpl('otel_queue_size', 'Current size of the span export queue', 'spans');
    this.selfTelemetryGauges.set('otel_queue_size', queueSize);

    // Export errors counter
    const exportErrors = this.meter.createCounter('otel_export_errors_total', {
      description: 'Total number of span export errors',
      unit: 'errors',
    });
    this.selfTelemetryCounters.set('otel_export_errors_total', exportErrors);
  }

  /**
   * Create or retrieve a counter metric
   * @param name - Metric name
   * @param description - Metric description
   * @param unit - Unit of measurement
   * @returns Counter instance
   */
  counter(name: string, description: string = '', unit: string = '1'): Counter {
    if (!this.counters.has(name)) {
      const counter = this.meter.createCounter(name, {
        description,
        unit,
      });
      this.counters.set(name, new CounterWrapper(counter));
    }
    return this.counters.get(name)!;
  }

  /**
   * Create or retrieve a histogram metric
   * @param name - Metric name
   * @param description - Metric description
   * @param unit - Unit of measurement
   * @returns Histogram instance
   */
  histogram(name: string, description: string = '', unit: string = '1'): Histogram {
    if (!this.histograms.has(name)) {
      const histogram = this.meter.createHistogram(name, {
        description,
        unit,
      });
      this.histograms.set(name, new HistogramWrapper(histogram));
    }
    return this.histograms.get(name)!;
  }

  /**
   * Create or retrieve a gauge metric
   * @param name - Metric name
   * @param description - Metric description
   * @param unit - Unit of measurement
   * @returns Gauge instance
   */
  gauge(name: string, description: string = '', unit: string = '1'): Gauge {
    if (!this.gauges.has(name)) {
      const gauge = new GaugeImpl(name, description, unit);
      this.gauges.set(name, gauge);
    }
    return this.gauges.get(name)!;
  }

  /**
   * Create or retrieve an up-down counter metric
   * @param name - Metric name
   * @param description - Metric description
   * @param unit - Unit of measurement
   * @returns UpDownCounter instance
   */
  upDownCounter(name: string, description: string = '', unit: string = '1'): UpDownCounter {
    if (!this.upDownCounters.has(name)) {
      const upDownCounter = this.meter.createUpDownCounter(name, {
        description,
        unit,
      });
      this.upDownCounters.set(name, new UpDownCounterWrapper(upDownCounter));
    }
    return this.upDownCounters.get(name)!;
  }

  /**
   * Increment a counter metric
   * @param name - Metric name
   * @param value - Value to add (default: 1)
   * @param attributes - Metric attributes
   */
  increment(name: string, value: number = 1, attributes?: KeyValue[]): void {
    const counter = this.counters.get(name);
    if (counter) {
      const attrs = this.convertKeyValueToAttributes(attributes);
      counter.add(value, attrs);
    }
  }

  /**
   * Record a histogram value
   * @param name - Metric name
   * @param value - Value to record
   * @param attributes - Metric attributes
   */
  recordHistogram(name: string, value: number, attributes?: KeyValue[]): void {
    const histogram = this.histograms.get(name);
    if (histogram) {
      const attrs = this.convertKeyValueToAttributes(attributes);
      histogram.record(value, attrs);
    }
  }

  /**
   * Set a gauge value
   * @param name - Metric name
   * @param value - Value to set
   * @param attributes - Metric attributes
   */
  setGauge(name: string, value: number, attributes?: KeyValue[]): void {
    const gauge = this.gauges.get(name);
    if (gauge) {
      gauge.set(value, attributes);
    }
  }

  /**
   * Convert KeyValue array to MetricAttributes
   * @param keyValues - Array of key-value pairs
   * @returns MetricAttributes object
   */
  private convertKeyValueToAttributes(keyValues?: KeyValue[]): MetricAttributes | undefined {
    if (!keyValues || keyValues.length === 0) {
      return undefined;
    }

    const attributes: MetricAttributes = {};
    for (const kv of keyValues) {
      attributes[kv.key] = kv.value;
    }
    return attributes;
  }

  /**
   * Record that a span was created (self-telemetry)
   * @param attributes - Attributes for the metric
   */
  recordSpanCreated(attributes?: KeyValue[]): void {
    const counter = this.selfTelemetryCounters.get('otel_spans_created_total');
    if (counter) {
      const attrs = this.convertKeyValueToAttributes(attributes);
      counter.add(1, attrs);
    }
  }

  /**
   * Record that a span was exported (self-telemetry)
   * @param attributes - Attributes for the metric
   */
  recordSpanExported(attributes?: KeyValue[]): void {
    const counter = this.selfTelemetryCounters.get('otel_spans_exported_total');
    if (counter) {
      const attrs = this.convertKeyValueToAttributes(attributes);
      counter.add(1, attrs);
    }
  }

  /**
   * Record that a span was dropped (self-telemetry)
   * @param attributes - Attributes for the metric
   */
  recordSpanDropped(attributes?: KeyValue[]): void {
    const counter = this.selfTelemetryCounters.get('otel_spans_dropped_total');
    if (counter) {
      const attrs = this.convertKeyValueToAttributes(attributes);
      counter.add(1, attrs);
    }
  }

  /**
   * Record export latency (self-telemetry)
   * @param latencyMs - Export latency in milliseconds
   * @param attributes - Attributes for the metric
   */
  recordExportLatency(latencyMs: number, attributes?: KeyValue[]): void {
    const histogram = this.selfTelemetryHistograms.get('otel_export_latency_ms');
    if (histogram) {
      const attrs = this.convertKeyValueToAttributes(attributes);
      histogram.record(latencyMs, attrs);
    }
  }

  /**
   * Update the queue size (self-telemetry)
   * @param size - Current queue size
   * @param attributes - Attributes for the metric
   */
  updateQueueSize(size: number, attributes?: KeyValue[]): void {
    const gauge = this.selfTelemetryGauges.get('otel_queue_size');
    if (gauge) {
      gauge.set(size, attributes);
    }
  }

  /**
   * Record an export error (self-telemetry)
   * @param attributes - Attributes for the metric
   */
  recordExportError(attributes?: KeyValue[]): void {
    const counter = this.selfTelemetryCounters.get('otel_export_errors_total');
    if (counter) {
      const attrs = this.convertKeyValueToAttributes(attributes);
      counter.add(1, attrs);
    }
  }

  /**
   * Get all registered counters
   * @returns Map of counter names to Counter instances
   */
  getCounters(): Map<string, Counter> {
    return new Map(this.counters);
  }

  /**
   * Get all registered histograms
   * @returns Map of histogram names to Histogram instances
   */
  getHistograms(): Map<string, Histogram> {
    return new Map(this.histograms);
  }

  /**
   * Get all registered gauges
   * @returns Map of gauge names to Gauge instances
   */
  getGauges(): Map<string, Gauge> {
    return new Map(this.gauges);
  }

  /**
   * Get all registered up-down counters
   * @returns Map of up-down counter names to UpDownCounter instances
   */
  getUpDownCounters(): Map<string, UpDownCounter> {
    return new Map(this.upDownCounters);
  }
}

// Type re-exports from types module for convenience
export type { Counter, Histogram, UpDownCounter, MetricAttributes } from '../types/index.js';
