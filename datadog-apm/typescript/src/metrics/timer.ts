/**
 * Timer - Utility for timing operations and recording metrics
 */

import { Tags, TagValue } from '../types';
import { MetricsClient } from './interface';

/**
 * Timer class for measuring operation duration and emitting timing metrics
 */
export class Timer {
  private startTime: number;
  private metricName: string;
  private tags: Tags;
  private client: MetricsClient;
  private stopped: boolean = false;

  constructor(client: MetricsClient, metricName: string, tags?: Tags) {
    this.client = client;
    this.metricName = metricName;
    this.tags = tags ?? {};
    this.startTime = performance.now();
  }

  /**
   * Stop the timer and record the timing metric
   * Returns the elapsed time in milliseconds
   */
  stop(): number {
    if (this.stopped) {
      return 0;
    }

    this.stopped = true;
    const elapsed = performance.now() - this.startTime;

    this.client.timing(this.metricName, elapsed, this.tags);

    return elapsed;
  }

  /**
   * Add a tag to the timer (fluent API)
   */
  addTag(key: string, value: TagValue): Timer {
    this.tags[key] = value;
    return this;
  }

  /**
   * Get elapsed time without stopping the timer
   */
  elapsed(): number {
    return performance.now() - this.startTime;
  }

  /**
   * Check if the timer has been stopped
   */
  isStopped(): boolean {
    return this.stopped;
  }
}

/**
 * Create a timer instance
 */
export function createTimer(
  client: MetricsClient,
  metricName: string,
  tags?: Tags
): Timer {
  return new Timer(client, metricName, tags);
}
