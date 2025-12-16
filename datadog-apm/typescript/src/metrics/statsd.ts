/**
 * DogStatsD wrapper - StatsD client implementation for Datadog metrics
 */

import { Tags, TagValue } from '../types';
import { MetricsClient } from './interface';
import { CardinalityProtector } from './cardinality';

/**
 * DogStatsDConfig - Configuration for DogStatsD client
 */
export interface DogStatsDConfig {
  host?: string;
  port?: number;
  prefix?: string;
  globalTags?: Tags;
  maxBufferSize?: number;
  flushInterval?: number;
  enableCardinalityProtection?: boolean;
}

/**
 * DogStatsD implements the MetricsClient interface
 * This is a wrapper around the hot-shots library or similar StatsD client
 */
export class DogStatsD implements MetricsClient {
  private config: DogStatsDConfig;
  private cardinalityProtector?: CardinalityProtector;
  private buffer: string[] = [];
  private flushTimer?: NodeJS.Timeout;
  private isClosed: boolean = false;

  constructor(config: DogStatsDConfig = {}) {
    this.config = {
      host: config.host ?? 'localhost',
      port: config.port ?? 8125,
      prefix: config.prefix ?? 'llmdevops.',
      globalTags: config.globalTags ?? {},
      maxBufferSize: config.maxBufferSize ?? 8192,
      flushInterval: config.flushInterval ?? 2000,
      enableCardinalityProtection: config.enableCardinalityProtection ?? true,
    };

    if (this.config.enableCardinalityProtection) {
      this.cardinalityProtector = new CardinalityProtector();
    }

    // Start flush timer
    this.startFlushTimer();
  }

  /**
   * Increment a counter
   */
  increment(name: string, value: number = 1, tags?: Tags): void {
    if (this.isClosed) return;

    const metricName = this.formatMetricName(name);
    const formattedTags = this.formatTags(tags);

    this.emit(`${metricName}:${value}|c${formattedTags}`);
  }

  /**
   * Decrement a counter
   */
  decrement(name: string, value: number = 1, tags?: Tags): void {
    this.increment(name, -value, tags);
  }

  /**
   * Set a gauge value
   */
  gauge(name: string, value: number, tags?: Tags): void {
    if (this.isClosed) return;

    const metricName = this.formatMetricName(name);
    const formattedTags = this.formatTags(tags);

    this.emit(`${metricName}:${value}|g${formattedTags}`);
  }

  /**
   * Record a histogram value
   */
  histogram(name: string, value: number, tags?: Tags): void {
    if (this.isClosed) return;

    const metricName = this.formatMetricName(name);
    const formattedTags = this.formatTags(tags);

    this.emit(`${metricName}:${value}|h${formattedTags}`);
  }

  /**
   * Record a distribution value
   */
  distribution(name: string, value: number, tags?: Tags): void {
    if (this.isClosed) return;

    const metricName = this.formatMetricName(name);
    const formattedTags = this.formatTags(tags);

    this.emit(`${metricName}:${value}|d${formattedTags}`);
  }

  /**
   * Record a timing value
   */
  timing(name: string, value: number, tags?: Tags): void {
    if (this.isClosed) return;

    const metricName = this.formatMetricName(name);
    const formattedTags = this.formatTags(tags);

    this.emit(`${metricName}:${value}|ms${formattedTags}`);
  }

  /**
   * Record a set value
   */
  set(name: string, value: string | number, tags?: Tags): void {
    if (this.isClosed) return;

    const metricName = this.formatMetricName(name);
    const formattedTags = this.formatTags(tags);

    this.emit(`${metricName}:${value}|s${formattedTags}`);
  }

  /**
   * Flush buffered metrics
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    // In a real implementation, this would send the buffer to the StatsD server
    // For now, we just clear the buffer
    this.buffer = [];
  }

  /**
   * Close the client
   */
  async close(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;

    // Stop flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    // Flush remaining metrics
    await this.flush();
  }

  /**
   * Format metric name
   */
  private formatMetricName(name: string): string {
    const prefix = this.config.prefix ?? '';
    const sanitized = name.replace(/[^a-zA-Z0-9_.]/g, '_');
    return prefix + sanitized;
  }

  /**
   * Format tags
   */
  private formatTags(tags?: Tags): string {
    const allTags = { ...this.config.globalTags, ...tags };

    if (Object.keys(allTags).length === 0) {
      return '';
    }

    // Apply cardinality protection
    const protectedTags = this.cardinalityProtector
      ? this.cardinalityProtector.filter(allTags)
      : allTags;

    const tagStrings = Object.entries(protectedTags).map(([key, value]) => {
      const sanitizedKey = this.sanitizeTagKey(key);
      const sanitizedValue = this.sanitizeTagValue(value);
      return `${sanitizedKey}:${sanitizedValue}`;
    });

    return `|#${tagStrings.join(',')}`;
  }

  /**
   * Sanitize tag key
   */
  private sanitizeTagKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9_.-]/g, '_').toLowerCase();
  }

  /**
   * Sanitize tag value
   */
  private sanitizeTagValue(value: TagValue): string {
    const strValue = String(value);
    // Remove special characters, limit length
    return strValue.replace(/[,|]/g, '_').substring(0, 200);
  }

  /**
   * Emit a metric to the buffer
   */
  private emit(metric: string): void {
    this.buffer.push(metric);

    // Flush if buffer is full
    if (this.buffer.length >= (this.config.maxBufferSize ?? 8192)) {
      this.flush().catch((err) => {
        console.error('Failed to flush metrics:', err);
      });
    }
  }

  /**
   * Start the flush timer
   */
  private startFlushTimer(): void {
    const interval = this.config.flushInterval ?? 2000;

    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => {
        console.error('Failed to flush metrics:', err);
      });
    }, interval);

    // Don't keep the process alive for the timer
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }
}
