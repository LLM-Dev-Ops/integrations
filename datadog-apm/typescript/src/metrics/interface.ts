/**
 * MetricsClient interface
 */

import { Tags } from '../types';

/**
 * MetricsClient interface for emitting metrics to Datadog
 */
export interface MetricsClient {
  /**
   * Increment a counter metric
   */
  increment(name: string, value?: number, tags?: Tags): void;

  /**
   * Decrement a counter metric
   */
  decrement(name: string, value?: number, tags?: Tags): void;

  /**
   * Set a gauge metric
   */
  gauge(name: string, value: number, tags?: Tags): void;

  /**
   * Record a histogram value
   */
  histogram(name: string, value: number, tags?: Tags): void;

  /**
   * Record a distribution value
   */
  distribution(name: string, value: number, tags?: Tags): void;

  /**
   * Record a timing value (in milliseconds)
   */
  timing(name: string, value: number, tags?: Tags): void;

  /**
   * Record a set value (for cardinality tracking)
   */
  set(name: string, value: string | number, tags?: Tags): void;

  /**
   * Flush buffered metrics
   */
  flush(): Promise<void>;

  /**
   * Close the metrics client
   */
  close(): Promise<void>;
}
