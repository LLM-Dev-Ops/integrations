import type {
  Labels,
  MetricFamily,
  CounterOptions,
  GaugeOptions,
  HistogramOptions,
  MetricValue,
  HistogramValue,
} from '../types';
import { MetricType } from '../types';
import { CardinalityTracker } from './cardinality';
import { MetricFamilyImpl } from './family';

export interface RegistryConfig {
  namespace?: string;
  defaultLabels?: Labels;
  cardinalityLimits?: Record<string, number>;
}

/**
 * Counter interface for registry internal use
 */
interface Counter {
  inc(value?: number): void;
  get(): number;
}

/**
 * CounterVec interface for registry internal use
 */
interface CounterVec {
  withLabelValues(...values: string[]): Counter;
  reset(): void;
}

/**
 * Gauge interface for registry internal use
 */
interface Gauge {
  set(value: number): void;
  inc(value?: number): void;
  dec(value?: number): void;
  add(value: number): void;
  sub(value: number): void;
  get(): number;
  setToCurrentTime(): void;
}

/**
 * GaugeVec interface for registry internal use
 */
interface GaugeVec {
  withLabelValues(...values: string[]): Gauge;
  reset(): void;
}

/**
 * Histogram interface for registry internal use
 */
interface Histogram {
  observe(value: number): void;
  startTimer(): () => void;
}

/**
 * HistogramVec interface for registry internal use
 */
interface HistogramVec {
  withLabelValues(...values: string[]): Histogram;
  reset(): void;
}

/**
 * Collector interface for registry internal use
 */
interface Collector {
  collect(): MetricFamily[];
  describe(): MetricFamily[];
}

/**
 * Implementation of a Counter metric.
 */
class CounterImpl implements Counter {
  private value: number = 0;
  private readonly labels: Labels;
  private readonly name: string;
  private readonly help: string;

  constructor(name: string, help: string, labels: Labels = {}) {
    this.name = name;
    this.help = help;
    this.labels = labels;
  }

  inc(value: number = 1): void {
    if (value < 0) {
      throw new Error('Counter cannot be decreased');
    }
    this.value += value;
  }

  get(): number {
    return this.value;
  }

  getMetric(): MetricValue {
    return {
      labels: { ...this.labels },
      value: this.value,
    };
  }
}

/**
 * Implementation of a CounterVec (counter with labels).
 */
class CounterVecImpl implements CounterVec {
  private readonly name: string;
  private readonly help: string;
  private readonly labelNames: string[];
  private readonly counters: Map<string, CounterImpl> = new Map();
  private readonly cardinalityTracker: CardinalityTracker;

  constructor(
    name: string,
    help: string,
    labelNames: string[],
    cardinalityTracker: CardinalityTracker
  ) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.cardinalityTracker = cardinalityTracker;
  }

  withLabelValues(...values: string[]): Counter {
    if (values.length !== this.labelNames.length) {
      throw new Error(
        `Label count mismatch: expected ${this.labelNames.length}, got ${values.length}`
      );
    }

    const key = values.join('\0');

    // Check existing
    if (this.counters.has(key)) {
      return this.counters.get(key)!;
    }

    // Check cardinality
    if (!this.cardinalityTracker.tryRegister(this.name, key)) {
      throw new Error(`Cardinality limit exceeded for metric: ${this.name}`);
    }

    // Build labels map
    const labels: Labels = {};
    for (let i = 0; i < this.labelNames.length; i++) {
      labels[this.labelNames[i]] = values[i];
    }

    // Create new counter
    const counter = new CounterImpl(this.name, this.help, labels);
    this.counters.set(key, counter);

    return counter;
  }

  reset(): void {
    this.counters.clear();
  }

  collect(): MetricFamily {
    const metrics: MetricValue[] = [];
    for (const counter of this.counters.values()) {
      metrics.push(counter.getMetric());
    }
    return {
      name: this.name,
      help: this.help,
      type: MetricType.Counter,
      metrics,
    };
  }
}

/**
 * Implementation of a Gauge metric.
 */
class GaugeImpl implements Gauge {
  private value: number = 0;
  private readonly labels: Labels;
  private readonly name: string;
  private readonly help: string;

  constructor(name: string, help: string, labels: Labels = {}) {
    this.name = name;
    this.help = help;
    this.labels = labels;
  }

  set(value: number): void {
    this.value = value;
  }

  inc(value: number = 1): void {
    this.value += value;
  }

  dec(value: number = 1): void {
    this.value -= value;
  }

  add(value: number): void {
    this.value += value;
  }

  sub(value: number): void {
    this.value -= value;
  }

  get(): number {
    return this.value;
  }

  setToCurrentTime(): void {
    this.value = Date.now() / 1000;
  }

  getMetric(): MetricValue {
    return {
      labels: { ...this.labels },
      value: this.value,
    };
  }
}

/**
 * Implementation of a GaugeVec (gauge with labels).
 */
class GaugeVecImpl implements GaugeVec {
  private readonly name: string;
  private readonly help: string;
  private readonly labelNames: string[];
  private readonly gauges: Map<string, GaugeImpl> = new Map();
  private readonly cardinalityTracker: CardinalityTracker;

  constructor(
    name: string,
    help: string,
    labelNames: string[],
    cardinalityTracker: CardinalityTracker
  ) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.cardinalityTracker = cardinalityTracker;
  }

  withLabelValues(...values: string[]): Gauge {
    if (values.length !== this.labelNames.length) {
      throw new Error(
        `Label count mismatch: expected ${this.labelNames.length}, got ${values.length}`
      );
    }

    const key = values.join('\0');

    // Check existing
    if (this.gauges.has(key)) {
      return this.gauges.get(key)!;
    }

    // Check cardinality
    if (!this.cardinalityTracker.tryRegister(this.name, key)) {
      throw new Error(`Cardinality limit exceeded for metric: ${this.name}`);
    }

    // Build labels map
    const labels: Labels = {};
    for (let i = 0; i < this.labelNames.length; i++) {
      labels[this.labelNames[i]] = values[i];
    }

    // Create new gauge
    const gauge = new GaugeImpl(this.name, this.help, labels);
    this.gauges.set(key, gauge);

    return gauge;
  }

  reset(): void {
    this.gauges.clear();
  }

  collect(): MetricFamily {
    const metrics: MetricValue[] = [];
    for (const gauge of this.gauges.values()) {
      metrics.push(gauge.getMetric());
    }
    return {
      name: this.name,
      help: this.help,
      type: MetricType.Gauge,
      metrics,
    };
  }
}

/**
 * Default latency buckets (in seconds).
 */
const DEFAULT_LATENCY_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0,
];

/**
 * Implementation of a Histogram metric.
 */
class HistogramImpl implements Histogram {
  private readonly name: string;
  private readonly help: string;
  private readonly labels: Labels;
  private readonly buckets: number[];
  private readonly bucketCounts: Map<number, number>;
  private sum: number = 0;
  private count: number = 0;

  constructor(name: string, help: string, buckets: number[], labels: Labels = {}) {
    this.name = name;
    this.help = help;
    this.labels = labels;

    // Ensure buckets are sorted and include +Inf
    this.buckets = [...buckets].sort((a, b) => a - b);
    if (this.buckets[this.buckets.length - 1] !== Infinity) {
      this.buckets.push(Infinity);
    }

    // Initialize bucket counts
    this.bucketCounts = new Map();
    for (const bucket of this.buckets) {
      this.bucketCounts.set(bucket, 0);
    }
  }

  observe(value: number): void {
    // Increment bucket counts (cumulative)
    for (const bucket of this.buckets) {
      if (value <= bucket) {
        this.bucketCounts.set(bucket, (this.bucketCounts.get(bucket) ?? 0) + 1);
      }
    }

    // Update sum and count
    this.sum += value;
    this.count++;
  }

  startTimer(): () => void {
    const start = Date.now();
    return () => {
      const durationSeconds = (Date.now() - start) / 1000;
      this.observe(durationSeconds);
    };
  }

  getMetric(): HistogramValue {
    return {
      labels: { ...this.labels },
      value: 0, // Not used for histograms, but required by interface
      buckets: new Map(this.bucketCounts),
      sum: this.sum,
      count: this.count,
    };
  }
}

/**
 * Implementation of a HistogramVec (histogram with labels).
 */
class HistogramVecImpl implements HistogramVec {
  private readonly name: string;
  private readonly help: string;
  private readonly labelNames: string[];
  private readonly buckets: number[];
  private readonly histograms: Map<string, HistogramImpl> = new Map();
  private readonly cardinalityTracker: CardinalityTracker;

  constructor(
    name: string,
    help: string,
    labelNames: string[],
    buckets: number[],
    cardinalityTracker: CardinalityTracker
  ) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.buckets = buckets;
    this.cardinalityTracker = cardinalityTracker;
  }

  withLabelValues(...values: string[]): Histogram {
    if (values.length !== this.labelNames.length) {
      throw new Error(
        `Label count mismatch: expected ${this.labelNames.length}, got ${values.length}`
      );
    }

    const key = values.join('\0');

    // Check existing
    if (this.histograms.has(key)) {
      return this.histograms.get(key)!;
    }

    // Check cardinality
    if (!this.cardinalityTracker.tryRegister(this.name, key)) {
      throw new Error(`Cardinality limit exceeded for metric: ${this.name}`);
    }

    // Build labels map
    const labels: Labels = {};
    for (let i = 0; i < this.labelNames.length; i++) {
      labels[this.labelNames[i]] = values[i];
    }

    // Create new histogram
    const histogram = new HistogramImpl(this.name, this.help, this.buckets, labels);
    this.histograms.set(key, histogram);

    return histogram;
  }

  reset(): void {
    this.histograms.clear();
  }

  collect(): MetricFamily {
    const metrics: HistogramValue[] = [];
    for (const histogram of this.histograms.values()) {
      metrics.push(histogram.getMetric());
    }
    return {
      name: this.name,
      help: this.help,
      type: MetricType.Histogram,
      metrics,
    };
  }
}

/**
 * Central registry for all Prometheus metrics.
 */
export class MetricsRegistry {
  private readonly families: Map<string, MetricFamilyImpl> = new Map();
  private readonly counters: Map<string, CounterImpl | CounterVecImpl> = new Map();
  private readonly gauges: Map<string, GaugeImpl | GaugeVecImpl> = new Map();
  private readonly histograms: Map<string, HistogramImpl | HistogramVecImpl> = new Map();
  private readonly collectors: Map<string, Collector> = new Map();
  private readonly cardinalityTracker: CardinalityTracker;
  private readonly defaultLabels: Labels;
  private readonly namespace: string;

  constructor(config: RegistryConfig = {}) {
    this.namespace = config.namespace ?? '';
    this.defaultLabels = config.defaultLabels ?? {};
    this.cardinalityTracker = new CardinalityTracker(
      config.cardinalityLimits,
      1000
    );
  }

  /**
   * Register a custom collector.
   */
  register(collector: Collector): void {
    const families = collector.describe();
    for (const family of families) {
      if (this.collectors.has(family.name)) {
        console.warn(`Collector already registered: ${family.name}`);
        return;
      }
      this.collectors.set(family.name, collector);
    }
  }

  /**
   * Unregister a collector.
   */
  unregister(name: string): boolean {
    return this.collectors.delete(name);
  }

  /**
   * Create or get a counter.
   */
  counter(options: CounterOptions): Counter {
    const fullName = this.formatMetricName(options.subsystem, options.name);

    if (this.counters.has(fullName)) {
      const existing = this.counters.get(fullName)!;
      if (existing instanceof CounterImpl) {
        return existing;
      }
      throw new Error(`Metric ${fullName} already registered as CounterVec`);
    }

    const counter = new CounterImpl(fullName, options.help);
    this.counters.set(fullName, counter);

    return counter;
  }

  /**
   * Create or get a counter with labels.
   */
  counterVec(options: CounterOptions): CounterVec {
    const fullName = this.formatMetricName(options.subsystem, options.name);
    const labelNames = options.labelNames ?? [];

    if (this.counters.has(fullName)) {
      const existing = this.counters.get(fullName)!;
      if (existing instanceof CounterVecImpl) {
        return existing;
      }
      throw new Error(`Metric ${fullName} already registered as Counter`);
    }

    const counterVec = new CounterVecImpl(
      fullName,
      options.help,
      labelNames,
      this.cardinalityTracker
    );
    this.counters.set(fullName, counterVec);

    return counterVec;
  }

  /**
   * Create or get a gauge.
   */
  gauge(options: GaugeOptions): Gauge {
    const fullName = this.formatMetricName(options.subsystem, options.name);

    if (this.gauges.has(fullName)) {
      const existing = this.gauges.get(fullName)!;
      if (existing instanceof GaugeImpl) {
        return existing;
      }
      throw new Error(`Metric ${fullName} already registered as GaugeVec`);
    }

    const gauge = new GaugeImpl(fullName, options.help);
    this.gauges.set(fullName, gauge);

    return gauge;
  }

  /**
   * Create or get a gauge with labels.
   */
  gaugeVec(options: GaugeOptions): GaugeVec {
    const fullName = this.formatMetricName(options.subsystem, options.name);
    const labelNames = options.labelNames ?? [];

    if (this.gauges.has(fullName)) {
      const existing = this.gauges.get(fullName)!;
      if (existing instanceof GaugeVecImpl) {
        return existing;
      }
      throw new Error(`Metric ${fullName} already registered as Gauge`);
    }

    const gaugeVec = new GaugeVecImpl(
      fullName,
      options.help,
      labelNames,
      this.cardinalityTracker
    );
    this.gauges.set(fullName, gaugeVec);

    return gaugeVec;
  }

  /**
   * Create or get a histogram.
   */
  histogram(options: HistogramOptions): Histogram {
    const fullName = this.formatMetricName(options.subsystem, options.name);
    const buckets = options.buckets ?? DEFAULT_LATENCY_BUCKETS;

    if (this.histograms.has(fullName)) {
      const existing = this.histograms.get(fullName)!;
      if (existing instanceof HistogramImpl) {
        return existing;
      }
      throw new Error(`Metric ${fullName} already registered as HistogramVec`);
    }

    const histogram = new HistogramImpl(fullName, options.help, buckets);
    this.histograms.set(fullName, histogram);

    return histogram;
  }

  /**
   * Create or get a histogram with labels.
   */
  histogramVec(options: HistogramOptions): HistogramVec {
    const fullName = this.formatMetricName(options.subsystem, options.name);
    const labelNames = options.labelNames ?? [];
    const buckets = options.buckets ?? DEFAULT_LATENCY_BUCKETS;

    if (this.histograms.has(fullName)) {
      const existing = this.histograms.get(fullName)!;
      if (existing instanceof HistogramVecImpl) {
        return existing;
      }
      throw new Error(`Metric ${fullName} already registered as Histogram`);
    }

    const histogramVec = new HistogramVecImpl(
      fullName,
      options.help,
      labelNames,
      buckets,
      this.cardinalityTracker
    );
    this.histograms.set(fullName, histogramVec);

    return histogramVec;
  }

  /**
   * Gather all metrics for serialization.
   */
  gather(): MetricFamily[] {
    const families: MetricFamily[] = [];

    // Collect from counters
    for (const metric of this.counters.values()) {
      if (metric instanceof CounterVecImpl) {
        families.push(metric.collect());
      } else if (metric instanceof CounterImpl) {
        families.push({
          name: (metric as any).name,
          help: (metric as any).help,
          type: MetricType.Counter,
          metrics: [(metric as any).getMetric()],
        });
      }
    }

    // Collect from gauges
    for (const metric of this.gauges.values()) {
      if (metric instanceof GaugeVecImpl) {
        families.push(metric.collect());
      } else if (metric instanceof GaugeImpl) {
        families.push({
          name: (metric as any).name,
          help: (metric as any).help,
          type: MetricType.Gauge,
          metrics: [(metric as any).getMetric()],
        });
      }
    }

    // Collect from histograms
    for (const metric of this.histograms.values()) {
      if (metric instanceof HistogramVecImpl) {
        families.push(metric.collect());
      } else if (metric instanceof HistogramImpl) {
        families.push({
          name: (metric as any).name,
          help: (metric as any).help,
          type: MetricType.Histogram,
          metrics: [(metric as any).getMetric()],
        });
      }
    }

    // Collect from custom collectors
    for (const collector of this.collectors.values()) {
      try {
        families.push(...collector.collect());
      } catch (error) {
        console.error('Collector failed:', error);
        // Continue with other collectors
      }
    }

    // Apply default labels
    for (const family of families) {
      for (const metric of family.metrics) {
        for (const [key, value] of Object.entries(this.defaultLabels)) {
          if (!(key in metric.labels)) {
            metric.labels[key] = value;
          }
        }
      }
    }

    // Sort by name
    families.sort((a, b) => a.name.localeCompare(b.name));

    return families;
  }

  /**
   * Get metrics as Prometheus text format.
   */
  async metrics(): Promise<string> {
    const { PrometheusTextSerializer } = await import('../serialization/prometheus-text');
    const serializer = new PrometheusTextSerializer();
    const families = this.gather();
    return serializer.serialize(families);
  }

  /**
   * Clear all metrics.
   */
  clear(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.collectors.clear();
    this.families.clear();
    this.cardinalityTracker.reset();
  }

  /**
   * Get the namespace.
   */
  getNamespace(): string {
    return this.namespace;
  }

  /**
   * Format metric name with namespace and subsystem.
   */
  private formatMetricName(subsystem: string | undefined, name: string): string {
    const parts: string[] = [];

    if (this.namespace) {
      parts.push(this.namespace);
    }

    if (subsystem) {
      parts.push(subsystem);
    }

    parts.push(name);

    return parts.join('_');
  }
}
