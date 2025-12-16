/**
 * Metric coalescing buffer for efficient metric submission
 *
 * Aggregates metrics locally before sending to reduce network overhead
 * and provide more accurate aggregates.
 *
 * @module metrics/coalescing
 */

import type { Tags, TagValue } from '../types/common.js';

/**
 * Coalesced metric entry
 */
interface CoalescedMetric {
  type: 'counter' | 'gauge' | 'histogram' | 'distribution';
  value: number;
  count: number;
  min: number;
  max: number;
  sum: number;
  values: number[]; // For histogram/distribution percentile calculation
  lastUpdate: number;
}

/**
 * Configuration for the coalescing buffer
 */
export interface CoalescingBufferConfig {
  /** Maximum number of unique metric keys to track */
  maxMetrics?: number;
  /** Flush interval in milliseconds */
  flushInterval?: number;
  /** Maximum values to store for histogram/distribution */
  maxHistogramValues?: number;
  /** Callback for flushing metrics */
  onFlush?: (metrics: FlushedMetric[]) => void;
}

/**
 * Flushed metric structure
 */
export interface FlushedMetric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'distribution';
  value: number;
  count: number;
  min?: number;
  max?: number;
  avg?: number;
  sum?: number;
  p50?: number;
  p95?: number;
  p99?: number;
  tags: Tags;
  timestamp: number;
}

/**
 * Coalescing metric buffer that aggregates metrics locally
 */
export class CoalescingMetricBuffer {
  private metrics: Map<string, CoalescedMetric> = new Map();
  private config: Required<CoalescingBufferConfig>;
  private flushTimer?: ReturnType<typeof setInterval>;
  private tagMap: Map<string, Tags> = new Map();

  constructor(config?: CoalescingBufferConfig) {
    this.config = {
      maxMetrics: config?.maxMetrics ?? 10000,
      flushInterval: config?.flushInterval ?? 10000,
      maxHistogramValues: config?.maxHistogramValues ?? 1000,
      onFlush: config?.onFlush ?? (() => {}),
    };
  }

  /**
   * Start automatic flushing
   */
  start(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval);
  }

  /**
   * Stop automatic flushing
   */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  /**
   * Generate a metric key from name and tags
   */
  private makeKey(name: string, tags?: Tags): string {
    if (!tags || Object.keys(tags).length === 0) {
      return name;
    }

    const sortedTags = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');

    return `${name}|${sortedTags}`;
  }

  /**
   * Increment a counter
   */
  increment(name: string, value: number = 1, tags?: Tags): void {
    const key = this.makeKey(name, tags);
    const existing = this.metrics.get(key);

    if (existing) {
      existing.value += value;
      existing.count++;
      existing.sum += value;
      existing.min = Math.min(existing.min, value);
      existing.max = Math.max(existing.max, value);
      existing.lastUpdate = Date.now();
    } else {
      if (this.metrics.size >= this.config.maxMetrics) {
        // Evict oldest metric
        this.evictOldest();
      }

      this.metrics.set(key, {
        type: 'counter',
        value,
        count: 1,
        min: value,
        max: value,
        sum: value,
        values: [],
        lastUpdate: Date.now(),
      });

      if (tags) {
        this.tagMap.set(key, tags);
      }
    }
  }

  /**
   * Set a gauge value
   */
  gauge(name: string, value: number, tags?: Tags): void {
    const key = this.makeKey(name, tags);
    const existing = this.metrics.get(key);

    if (existing) {
      existing.value = value; // Gauges use latest value
      existing.count++;
      existing.sum += value;
      existing.min = Math.min(existing.min, value);
      existing.max = Math.max(existing.max, value);
      existing.lastUpdate = Date.now();
    } else {
      if (this.metrics.size >= this.config.maxMetrics) {
        this.evictOldest();
      }

      this.metrics.set(key, {
        type: 'gauge',
        value,
        count: 1,
        min: value,
        max: value,
        sum: value,
        values: [],
        lastUpdate: Date.now(),
      });

      if (tags) {
        this.tagMap.set(key, tags);
      }
    }
  }

  /**
   * Record a histogram value
   */
  histogram(name: string, value: number, tags?: Tags): void {
    const key = this.makeKey(name, tags);
    const existing = this.metrics.get(key);

    if (existing) {
      existing.count++;
      existing.sum += value;
      existing.min = Math.min(existing.min, value);
      existing.max = Math.max(existing.max, value);
      existing.lastUpdate = Date.now();

      // Store value for percentile calculation
      if (existing.values.length < this.config.maxHistogramValues) {
        existing.values.push(value);
      } else {
        // Reservoir sampling for fixed-size buffer
        const index = Math.floor(Math.random() * existing.count);
        if (index < this.config.maxHistogramValues) {
          existing.values[index] = value;
        }
      }
    } else {
      if (this.metrics.size >= this.config.maxMetrics) {
        this.evictOldest();
      }

      this.metrics.set(key, {
        type: 'histogram',
        value,
        count: 1,
        min: value,
        max: value,
        sum: value,
        values: [value],
        lastUpdate: Date.now(),
      });

      if (tags) {
        this.tagMap.set(key, tags);
      }
    }
  }

  /**
   * Record a distribution value
   */
  distribution(name: string, value: number, tags?: Tags): void {
    // Distribution uses same aggregation as histogram
    this.histogram(name, value, tags);

    // Mark as distribution type
    const key = this.makeKey(name, tags);
    const metric = this.metrics.get(key);
    if (metric) {
      metric.type = 'distribution';
    }
  }

  /**
   * Evict the oldest metric to make room
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, metric] of this.metrics) {
      if (metric.lastUpdate < oldestTime) {
        oldestTime = metric.lastUpdate;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.metrics.delete(oldestKey);
      this.tagMap.delete(oldestKey);
    }
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) {
      return 0;
    }

    const index = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }

  /**
   * Flush all metrics
   */
  flush(): FlushedMetric[] {
    const flushed: FlushedMetric[] = [];
    const now = Date.now();

    for (const [key, metric] of this.metrics) {
      const name = key.split('|')[0];
      const tags = this.tagMap.get(key) ?? {};

      const flushedMetric: FlushedMetric = {
        name,
        type: metric.type,
        value: metric.value,
        count: metric.count,
        tags,
        timestamp: now,
      };

      // Add aggregation stats for histograms/distributions
      if (metric.type === 'histogram' || metric.type === 'distribution') {
        flushedMetric.min = metric.min;
        flushedMetric.max = metric.max;
        flushedMetric.sum = metric.sum;
        flushedMetric.avg = metric.count > 0 ? metric.sum / metric.count : 0;

        // Calculate percentiles
        if (metric.values.length > 0) {
          const sorted = [...metric.values].sort((a, b) => a - b);
          flushedMetric.p50 = this.percentile(sorted, 50);
          flushedMetric.p95 = this.percentile(sorted, 95);
          flushedMetric.p99 = this.percentile(sorted, 99);
        }
      }

      flushed.push(flushedMetric);
    }

    // Notify callback
    if (flushed.length > 0) {
      this.config.onFlush(flushed);
    }

    // Clear buffers
    this.metrics.clear();
    this.tagMap.clear();

    return flushed;
  }

  /**
   * Get current metric count
   */
  size(): number {
    return this.metrics.size;
  }

  /**
   * Clear all metrics without flushing
   */
  clear(): void {
    this.metrics.clear();
    this.tagMap.clear();
  }

  /**
   * Get a snapshot of current metrics (for testing)
   */
  getSnapshot(): Map<string, CoalescedMetric> {
    return new Map(this.metrics);
  }
}
