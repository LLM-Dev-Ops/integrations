/**
 * Prometheus Metrics - Counter Implementation
 *
 * Counter is a monotonically increasing metric.
 * Use for: request counts, errors, task completions, etc.
 *
 * Thread-safety: JavaScript is single-threaded, but async operations
 * are handled safely through atomic value updates.
 */

import {
  Labels,
  CounterOptions,
  MetricType,
  MetricValue,
  CardinalityExceededError,
  formatMetricName,
} from '../types';
import { Metric, createLabelKey, validateLabelCount, buildLabelsObject } from './traits';

/**
 * Counter metric - monotonically increasing value.
 * Can only be incremented (never decremented).
 */
export class Counter implements Metric {
  private value: number = 0;
  readonly name: string;
  readonly help: string;
  readonly type = MetricType.Counter;
  readonly labels: Labels;

  constructor(options: CounterOptions, labels: Labels = {}) {
    this.name = formatMetricName(options.name, options.subsystem);
    this.help = options.help;
    this.labels = labels;
  }

  /**
   * Increment counter by 1.
   */
  inc(): void {
    this.incBy(1);
  }

  /**
   * Increment counter by specified value.
   * @param value - Amount to increment (must be >= 0)
   * @throws Error if value is negative
   */
  incBy(value: number): void {
    if (value < 0) {
      throw new Error('Counter cannot be decreased');
    }
    this.value += value;
  }

  /**
   * Get current counter value.
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
 * CounterVec - Counter with labels.
 * Manages multiple counter instances by label combinations.
 * Enforces cardinality limits to prevent metric explosion.
 */
export class CounterVec implements Metric {
  private readonly counters: Map<string, Counter> = new Map();
  private readonly options: CounterOptions;
  private readonly labelNames: string[];
  private readonly cardinalityLimit: number;
  readonly name: string;
  readonly help: string;
  readonly type = MetricType.Counter;

  /**
   * Create a new CounterVec.
   * @param options - Counter configuration
   * @param cardinalityLimit - Maximum number of unique label combinations (default: 1000)
   */
  constructor(options: CounterOptions, cardinalityLimit: number = 1000) {
    this.options = options;
    this.labelNames = options.labelNames || [];
    this.cardinalityLimit = cardinalityLimit;
    this.name = formatMetricName(options.name, options.subsystem);
    this.help = options.help;
  }

  /**
   * Get counter with specific label values.
   * Creates a new counter if it doesn't exist (unless cardinality limit reached).
   * @param labelValues - Values corresponding to labelNames
   * @returns Counter instance for the label combination
   * @throws Error if label count doesn't match
   * @throws CardinalityExceededError if cardinality limit reached
   */
  labels(labelValues: Labels): Counter;
  labels(...labelValues: string[]): Counter;
  labels(...args: any[]): Counter {
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

    // Return existing counter if found
    const existing = this.counters.get(key);
    if (existing) {
      return existing;
    }

    // Check cardinality limit before creating new counter
    if (this.counters.size >= this.cardinalityLimit) {
      throw new CardinalityExceededError(
        this.name,
        this.cardinalityLimit,
        this.counters.size
      );
    }

    // Create new counter instance
    const counter = new Counter(this.options, labelsObj);
    this.counters.set(key, counter);

    return counter;
  }

  /**
   * Remove counter with specific label values.
   * @param labelValues - Labels identifying the counter to remove
   * @returns true if counter was removed, false if not found
   */
  remove(labelValues: Labels): boolean {
    const key = createLabelKey(labelValues);
    return this.counters.delete(key);
  }

  /**
   * Reset all counters (clear all instances).
   */
  reset(): void {
    this.counters.clear();
  }

  /**
   * Collect all counter values for serialization.
   */
  collect(): MetricValue[] {
    const values: MetricValue[] = [];

    for (const counter of this.counters.values()) {
      values.push(counter.collect());
    }

    return values;
  }

  /**
   * Get current cardinality (number of unique label combinations).
   */
  getCardinality(): number {
    return this.counters.size;
  }

  /**
   * Check if at cardinality limit.
   */
  isAtLimit(): boolean {
    return this.counters.size >= this.cardinalityLimit;
  }
}
