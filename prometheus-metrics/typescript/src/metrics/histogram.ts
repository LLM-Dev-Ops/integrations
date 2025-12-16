/**
 * Prometheus Metrics - Histogram Implementation
 *
 * Histogram samples observations and counts them in configurable buckets.
 * Use for: request durations, response sizes, latency distributions.
 *
 * Histogram buckets are cumulative: each bucket counts all observations
 * less than or equal to its upper bound.
 *
 * Thread-safety: JavaScript is single-threaded, but async operations
 * are handled safely through atomic value updates.
 */

import {
  Labels,
  HistogramOptions,
  MetricType,
  HistogramValue,
  CardinalityExceededError,
  DEFAULT_LATENCY_BUCKETS,
  formatMetricName,
} from '../types';
import { Metric, createLabelKey, validateLabelCount, buildLabelsObject } from './traits';

/**
 * Histogram metric for latency distributions.
 * Maintains bucket counts, sum, and total count.
 */
export class Histogram implements Metric {
  private bucketCounts: number[];
  private sum: number = 0;
  private count: number = 0;
  readonly name: string;
  readonly help: string;
  readonly type = MetricType.Histogram;
  readonly buckets: number[]; // Sorted, includes +Inf
  readonly labels: Labels;

  constructor(options: HistogramOptions, labels: Labels = {}) {
    this.name = formatMetricName(options.name, options.subsystem);
    this.help = options.help;
    this.labels = labels;

    // Use provided buckets or defaults
    let buckets = options.buckets || DEFAULT_LATENCY_BUCKETS;

    // Sort buckets in ascending order
    buckets = [...buckets].sort((a, b) => a - b);

    // Ensure +Inf bucket exists
    if (buckets[buckets.length - 1] !== Infinity) {
      buckets.push(Infinity);
    }

    this.buckets = buckets;
    this.bucketCounts = new Array(buckets.length).fill(0);
  }

  /**
   * Observe a value (record a measurement).
   * Updates appropriate buckets, sum, and count.
   * @param value - The observed value
   */
  observe(value: number): void {
    // Increment bucket counts (cumulative)
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        this.bucketCounts[i]++;
      }
    }

    // Update sum and count
    this.sum += value;
    this.count++;
  }

  /**
   * Start a timer, returns function to observe duration on completion.
   * Uses high-resolution timer for accurate measurements.
   * @returns Function that when called, observes the elapsed time in seconds
   *
   * @example
   * const end = histogram.startTimer();
   * // ... do work ...
   * const duration = end(); // Observes duration and returns it
   */
  startTimer(): () => number {
    const start = process.hrtime.bigint();

    return () => {
      const durationNs = Number(process.hrtime.bigint() - start);
      const durationSeconds = durationNs / 1e9;
      this.observe(durationSeconds);
      return durationSeconds;
    };
  }

  /**
   * Get current sum of all observations.
   */
  getSum(): number {
    return this.sum;
  }

  /**
   * Get current count of all observations.
   */
  getCount(): number {
    return this.count;
  }

  /**
   * Get bucket counts.
   * @returns Array of counts for each bucket
   */
  getBucketCounts(): number[] {
    return [...this.bucketCounts];
  }

  /**
   * Collect histogram data for serialization.
   */
  collect(): HistogramValue {
    // Build bucket array with le (less than or equal) labels
    const buckets = this.buckets.map((le, i) => ({
      le,
      count: this.bucketCounts[i],
    }));

    return {
      name: this.name,
      help: this.help,
      type: this.type,
      labels: this.labels,
      buckets,
      sum: this.sum,
      count: this.count,
    };
  }
}

/**
 * HistogramVec - Histogram with labels.
 * Manages multiple histogram instances by label combinations.
 * Enforces cardinality limits to prevent metric explosion.
 */
export class HistogramVec implements Metric {
  private readonly histograms: Map<string, Histogram> = new Map();
  private readonly options: HistogramOptions;
  private readonly labelNames: string[];
  private readonly cardinalityLimit: number;
  readonly name: string;
  readonly help: string;
  readonly type = MetricType.Histogram;

  /**
   * Create a new HistogramVec.
   * @param options - Histogram configuration
   * @param cardinalityLimit - Maximum number of unique label combinations (default: 1000)
   */
  constructor(options: HistogramOptions, cardinalityLimit: number = 1000) {
    this.options = options;
    this.labelNames = options.labelNames || [];
    this.cardinalityLimit = cardinalityLimit;
    this.name = formatMetricName(options.name, options.subsystem);
    this.help = options.help;
  }

  /**
   * Get histogram with specific label values.
   * Creates a new histogram if it doesn't exist (unless cardinality limit reached).
   * @param labelValues - Values corresponding to labelNames
   * @returns Histogram instance for the label combination
   * @throws Error if label count doesn't match
   * @throws CardinalityExceededError if cardinality limit reached
   */
  labels(labelValues: Labels): Histogram;
  labels(...labelValues: string[]): Histogram;
  labels(...args: any[]): Histogram {
    let labelValues: string[];

    // Handle both object and array arguments
    if (args.length === 1 && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      // Labels object passed
      const labelsObj = args[0] as Labels;
      labelValues = this.labelNames.map((name) => labelsObj[name] || '');
    } else {
      // Individual values passed
      labelValues = args as string[];
    }

    // Validate label count
    validateLabelCount(this.name, this.labelNames, labelValues);

    // Create label key for storage
    const labelsObj = buildLabelsObject(this.labelNames, labelValues);
    const key = createLabelKey(labelsObj);

    // Return existing histogram if found
    const existing = this.histograms.get(key);
    if (existing) {
      return existing;
    }

    // Check cardinality limit before creating new histogram
    if (this.histograms.size >= this.cardinalityLimit) {
      throw new CardinalityExceededError(
        this.name,
        this.cardinalityLimit,
        this.histograms.size
      );
    }

    // Create new histogram instance
    const histogram = new Histogram(this.options, labelsObj);
    this.histograms.set(key, histogram);

    return histogram;
  }

  /**
   * Remove histogram with specific label values.
   * @param labelValues - Labels identifying the histogram to remove
   * @returns true if histogram was removed, false if not found
   */
  remove(labelValues: Labels): boolean {
    const key = createLabelKey(labelValues);
    return this.histograms.delete(key);
  }

  /**
   * Reset all histograms (clear all instances).
   */
  reset(): void {
    this.histograms.clear();
  }

  /**
   * Collect all histogram values for serialization.
   */
  collect(): HistogramValue[] {
    const values: HistogramValue[] = [];

    for (const histogram of this.histograms.values()) {
      values.push(histogram.collect());
    }

    return values;
  }

  /**
   * Get current cardinality (number of unique label combinations).
   */
  getCardinality(): number {
    return this.histograms.size;
  }

  /**
   * Check if at cardinality limit.
   */
  isAtLimit(): boolean {
    return this.histograms.size >= this.cardinalityLimit;
  }
}
