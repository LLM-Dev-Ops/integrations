/**
 * Prometheus Metrics - Gauge Implementation
 *
 * Gauge is a metric that can go up and down.
 * Use for: temperature, memory usage, active connections, queue depth, etc.
 *
 * Thread-safety: JavaScript is single-threaded, but async operations
 * are handled safely through atomic value updates.
 */

import {
  Labels,
  GaugeOptions,
  MetricType,
  MetricValue,
  CardinalityExceededError,
  formatMetricName,
} from '../types';
import { Metric, createLabelKey, validateLabelCount, buildLabelsObject } from './traits';

/**
 * Gauge metric - can go up and down.
 * Represents a value that can arbitrarily increase or decrease.
 */
export class Gauge implements Metric {
  private value: number = 0;
  readonly name: string;
  readonly help: string;
  readonly type = MetricType.Gauge;
  readonly labels: Labels;

  constructor(options: GaugeOptions, labels: Labels = {}) {
    this.name = formatMetricName(options.name, options.subsystem);
    this.help = options.help;
    this.labels = labels;
  }

  /**
   * Set gauge to specific value.
   * @param value - New gauge value
   */
  set(value: number): void {
    this.value = value;
  }

  /**
   * Increment gauge by 1.
   */
  inc(): void {
    this.add(1);
  }

  /**
   * Decrement gauge by 1.
   */
  dec(): void {
    this.sub(1);
  }

  /**
   * Add value to gauge (can be negative).
   * @param value - Amount to add
   */
  add(value: number): void {
    this.value += value;
  }

  /**
   * Subtract value from gauge.
   * @param value - Amount to subtract
   */
  sub(value: number): void {
    this.value -= value;
  }

  /**
   * Set gauge to current timestamp (seconds since Unix epoch).
   */
  setToCurrentTime(): void {
    this.value = Date.now() / 1000;
  }

  /**
   * Get current gauge value.
   */
  get(): number {
    return this.value;
  }

  /**
   * Collect metric value for serialization.
   */
  collect(): MetricValue {
    return {
      name: this.name,
      help: this.help,
      type: this.type,
      labels: this.labels,
      value: this.value,
    };
  }
}

/**
 * GaugeVec - Gauge with labels.
 * Manages multiple gauge instances by label combinations.
 * Enforces cardinality limits to prevent metric explosion.
 */
export class GaugeVec implements Metric {
  private readonly gauges: Map<string, Gauge> = new Map();
  private readonly options: GaugeOptions;
  private readonly labelNames: string[];
  private readonly cardinalityLimit: number;
  readonly name: string;
  readonly help: string;
  readonly type = MetricType.Gauge;

  /**
   * Create a new GaugeVec.
   * @param options - Gauge configuration
   * @param cardinalityLimit - Maximum number of unique label combinations (default: 1000)
   */
  constructor(options: GaugeOptions, cardinalityLimit: number = 1000) {
    this.options = options;
    this.labelNames = options.labelNames || [];
    this.cardinalityLimit = cardinalityLimit;
    this.name = formatMetricName(options.name, options.subsystem);
    this.help = options.help;
  }

  /**
   * Get gauge with specific label values.
   * Creates a new gauge if it doesn't exist (unless cardinality limit reached).
   * @param labelValues - Values corresponding to labelNames
   * @returns Gauge instance for the label combination
   * @throws Error if label count doesn't match
   * @throws CardinalityExceededError if cardinality limit reached
   */
  labels(labelValues: Labels): Gauge;
  labels(...labelValues: string[]): Gauge;
  labels(...args: any[]): Gauge {
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

    // Return existing gauge if found
    const existing = this.gauges.get(key);
    if (existing) {
      return existing;
    }

    // Check cardinality limit before creating new gauge
    if (this.gauges.size >= this.cardinalityLimit) {
      throw new CardinalityExceededError(
        this.name,
        this.cardinalityLimit,
        this.gauges.size
      );
    }

    // Create new gauge instance
    const gauge = new Gauge(this.options, labelsObj);
    this.gauges.set(key, gauge);

    return gauge;
  }

  /**
   * Remove gauge with specific label values.
   * @param labelValues - Labels identifying the gauge to remove
   * @returns true if gauge was removed, false if not found
   */
  remove(labelValues: Labels): boolean {
    const key = createLabelKey(labelValues);
    return this.gauges.delete(key);
  }

  /**
   * Reset all gauges (clear all instances).
   */
  reset(): void {
    this.gauges.clear();
  }

  /**
   * Collect all gauge values for serialization.
   */
  collect(): MetricValue[] {
    const values: MetricValue[] = [];

    for (const gauge of this.gauges.values()) {
      values.push(gauge.collect());
    }

    return values;
  }

  /**
   * Get current cardinality (number of unique label combinations).
   */
  getCardinality(): number {
    return this.gauges.size;
  }

  /**
   * Check if at cardinality limit.
   */
  isAtLimit(): boolean {
    return this.gauges.size >= this.cardinalityLimit;
  }
}
