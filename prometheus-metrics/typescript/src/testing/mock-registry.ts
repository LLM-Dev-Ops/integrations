/**
 * Mock metrics registry for testing.
 * Records all metric operations for assertions.
 */

import type { Labels, MetricFamily, MetricType, MetricValue, HistogramValue } from '../types.js';

/**
 * Recorded metric operation.
 */
export interface RecordedMetric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram';
  operation: 'inc' | 'set' | 'observe' | 'add' | 'sub';
  value: number;
  labels: Labels;
  timestamp: number;
}

/**
 * Mock counter for testing.
 */
export class MockCounter {
  private value = 0;
  readonly name: string;
  readonly labels: Labels;
  private readonly recorder: (metric: RecordedMetric) => void;

  constructor(
    name: string,
    labels: Labels,
    recorder: (metric: RecordedMetric) => void
  ) {
    this.name = name;
    this.labels = labels;
    this.recorder = recorder;
  }

  inc(): void {
    this.incBy(1);
  }

  incBy(value: number): void {
    if (value < 0) {
      throw new Error('Counter cannot be decreased');
    }
    this.value += value;
    this.recorder({
      name: this.name,
      type: 'counter',
      operation: 'inc',
      value,
      labels: this.labels,
      timestamp: Date.now(),
    });
  }

  get(): number {
    return this.value;
  }
}

/**
 * Mock gauge for testing.
 */
export class MockGauge {
  private value = 0;
  readonly name: string;
  readonly labels: Labels;
  private readonly recorder: (metric: RecordedMetric) => void;

  constructor(
    name: string,
    labels: Labels,
    recorder: (metric: RecordedMetric) => void
  ) {
    this.name = name;
    this.labels = labels;
    this.recorder = recorder;
  }

  set(value: number): void {
    this.value = value;
    this.recorder({
      name: this.name,
      type: 'gauge',
      operation: 'set',
      value,
      labels: this.labels,
      timestamp: Date.now(),
    });
  }

  inc(): void {
    this.add(1);
  }

  dec(): void {
    this.sub(1);
  }

  add(value: number): void {
    this.value += value;
    this.recorder({
      name: this.name,
      type: 'gauge',
      operation: 'add',
      value,
      labels: this.labels,
      timestamp: Date.now(),
    });
  }

  sub(value: number): void {
    this.value -= value;
    this.recorder({
      name: this.name,
      type: 'gauge',
      operation: 'sub',
      value,
      labels: this.labels,
      timestamp: Date.now(),
    });
  }

  get(): number {
    return this.value;
  }
}

/**
 * Mock histogram for testing.
 */
export class MockHistogram {
  private observations: number[] = [];
  private sum = 0;
  private count = 0;
  readonly name: string;
  readonly labels: Labels;
  readonly buckets: number[];
  private readonly recorder: (metric: RecordedMetric) => void;

  constructor(
    name: string,
    labels: Labels,
    buckets: number[],
    recorder: (metric: RecordedMetric) => void
  ) {
    this.name = name;
    this.labels = labels;
    this.buckets = buckets;
    this.recorder = recorder;
  }

  observe(value: number): void {
    this.observations.push(value);
    this.sum += value;
    this.count++;
    this.recorder({
      name: this.name,
      type: 'histogram',
      operation: 'observe',
      value,
      labels: this.labels,
      timestamp: Date.now(),
    });
  }

  startTimer(): () => number {
    const start = process.hrtime.bigint();
    return () => {
      const durationNs = Number(process.hrtime.bigint() - start);
      const durationSeconds = durationNs / 1e9;
      this.observe(durationSeconds);
      return durationSeconds;
    };
  }

  getSum(): number {
    return this.sum;
  }

  getCount(): number {
    return this.count;
  }

  getObservations(): number[] {
    return [...this.observations];
  }
}

/**
 * Mock counter with labels support.
 */
export class MockCounterVec {
  private readonly counters = new Map<string, MockCounter>();
  readonly name: string;
  readonly help: string;
  readonly labelNames: string[];
  private readonly recorder: (metric: RecordedMetric) => void;

  constructor(
    name: string,
    help: string,
    labelNames: string[],
    recorder: (metric: RecordedMetric) => void
  ) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.recorder = recorder;
  }

  labels(labelValues: Labels): MockCounter {
    const key = this.labelsToKey(labelValues);
    let counter = this.counters.get(key);
    if (!counter) {
      counter = new MockCounter(this.name, labelValues, this.recorder);
      this.counters.set(key, counter);
    }
    return counter;
  }

  private labelsToKey(labels: Labels): string {
    return this.labelNames
      .map((name) => `${name}=${labels[name] ?? ''}`)
      .join(',');
  }

  getCardinality(): number {
    return this.counters.size;
  }
}

/**
 * Mock gauge with labels support.
 */
export class MockGaugeVec {
  private readonly gauges = new Map<string, MockGauge>();
  readonly name: string;
  readonly help: string;
  readonly labelNames: string[];
  private readonly recorder: (metric: RecordedMetric) => void;

  constructor(
    name: string,
    help: string,
    labelNames: string[],
    recorder: (metric: RecordedMetric) => void
  ) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.recorder = recorder;
  }

  labels(labelValues: Labels): MockGauge {
    const key = this.labelsToKey(labelValues);
    let gauge = this.gauges.get(key);
    if (!gauge) {
      gauge = new MockGauge(this.name, labelValues, this.recorder);
      this.gauges.set(key, gauge);
    }
    return gauge;
  }

  private labelsToKey(labels: Labels): string {
    return this.labelNames
      .map((name) => `${name}=${labels[name] ?? ''}`)
      .join(',');
  }
}

/**
 * Mock histogram with labels support.
 */
export class MockHistogramVec {
  private readonly histograms = new Map<string, MockHistogram>();
  readonly name: string;
  readonly help: string;
  readonly labelNames: string[];
  readonly buckets: number[];
  private readonly recorder: (metric: RecordedMetric) => void;

  constructor(
    name: string,
    help: string,
    labelNames: string[],
    buckets: number[],
    recorder: (metric: RecordedMetric) => void
  ) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.buckets = buckets;
    this.recorder = recorder;
  }

  labels(labelValues: Labels): MockHistogram {
    const key = this.labelsToKey(labelValues);
    let histogram = this.histograms.get(key);
    if (!histogram) {
      histogram = new MockHistogram(this.name, labelValues, this.buckets, this.recorder);
      this.histograms.set(key, histogram);
    }
    return histogram;
  }

  private labelsToKey(labels: Labels): string {
    return this.labelNames
      .map((name) => `${name}=${labels[name] ?? ''}`)
      .join(',');
  }
}

/**
 * Mock metrics registry for testing.
 * Records all metric operations for later assertions.
 */
export class MockRegistry {
  private readonly recordedMetrics: RecordedMetric[] = [];
  private readonly counters = new Map<string, MockCounter | MockCounterVec>();
  private readonly gauges = new Map<string, MockGauge | MockGaugeVec>();
  private readonly histograms = new Map<string, MockHistogram | MockHistogramVec>();
  readonly namespace: string;

  constructor(namespace = 'llmdevops') {
    this.namespace = namespace;
  }

  private record(metric: RecordedMetric): void {
    this.recordedMetrics.push(metric);
  }

  /**
   * Create a counter without labels.
   */
  counter(options: { name: string; help: string }): MockCounter {
    const fullName = `${this.namespace}_${options.name}`;
    let counter = this.counters.get(fullName);
    if (!counter || counter instanceof MockCounterVec) {
      counter = new MockCounter(fullName, {}, this.record.bind(this));
      this.counters.set(fullName, counter);
    }
    return counter as MockCounter;
  }

  /**
   * Create a counter with labels.
   */
  counterVec(options: { name: string; help: string; labelNames: string[] }): MockCounterVec {
    const fullName = `${this.namespace}_${options.name}`;
    let counterVec = this.counters.get(fullName);
    if (!counterVec || counterVec instanceof MockCounter) {
      counterVec = new MockCounterVec(
        fullName,
        options.help,
        options.labelNames,
        this.record.bind(this)
      );
      this.counters.set(fullName, counterVec);
    }
    return counterVec as MockCounterVec;
  }

  /**
   * Create a gauge without labels.
   */
  gauge(options: { name: string; help: string }): MockGauge {
    const fullName = `${this.namespace}_${options.name}`;
    let gauge = this.gauges.get(fullName);
    if (!gauge || gauge instanceof MockGaugeVec) {
      gauge = new MockGauge(fullName, {}, this.record.bind(this));
      this.gauges.set(fullName, gauge);
    }
    return gauge as MockGauge;
  }

  /**
   * Create a gauge with labels.
   */
  gaugeVec(options: { name: string; help: string; labelNames: string[] }): MockGaugeVec {
    const fullName = `${this.namespace}_${options.name}`;
    let gaugeVec = this.gauges.get(fullName);
    if (!gaugeVec || gaugeVec instanceof MockGauge) {
      gaugeVec = new MockGaugeVec(
        fullName,
        options.help,
        options.labelNames,
        this.record.bind(this)
      );
      this.gauges.set(fullName, gaugeVec);
    }
    return gaugeVec as MockGaugeVec;
  }

  /**
   * Create a histogram without labels.
   */
  histogram(options: { name: string; help: string; buckets?: number[] }): MockHistogram {
    const fullName = `${this.namespace}_${options.name}`;
    const buckets = options.buckets ?? [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
    let histogram = this.histograms.get(fullName);
    if (!histogram || histogram instanceof MockHistogramVec) {
      histogram = new MockHistogram(fullName, {}, buckets, this.record.bind(this));
      this.histograms.set(fullName, histogram);
    }
    return histogram as MockHistogram;
  }

  /**
   * Create a histogram with labels.
   */
  histogramVec(options: {
    name: string;
    help: string;
    labelNames: string[];
    buckets?: number[];
  }): MockHistogramVec {
    const fullName = `${this.namespace}_${options.name}`;
    const buckets = options.buckets ?? [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
    let histogramVec = this.histograms.get(fullName);
    if (!histogramVec || histogramVec instanceof MockHistogram) {
      histogramVec = new MockHistogramVec(
        fullName,
        options.help,
        options.labelNames,
        buckets,
        this.record.bind(this)
      );
      this.histograms.set(fullName, histogramVec);
    }
    return histogramVec as MockHistogramVec;
  }

  /**
   * Get all recorded metrics.
   */
  getRecordedMetrics(): RecordedMetric[] {
    return [...this.recordedMetrics];
  }

  /**
   * Get recorded metrics filtered by name.
   */
  getMetricsByName(name: string): RecordedMetric[] {
    const fullName = name.startsWith(this.namespace) ? name : `${this.namespace}_${name}`;
    return this.recordedMetrics.filter((m) => m.name === fullName);
  }

  /**
   * Reset all recorded metrics.
   */
  reset(): void {
    this.recordedMetrics.length = 0;
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  /**
   * Get namespace.
   */
  getNamespace(): string {
    return this.namespace;
  }
}
