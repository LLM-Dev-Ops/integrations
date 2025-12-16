/**
 * Jenkins Queue Service
 * Provides operations for managing Jenkins build queue, monitoring queue items,
 * and waiting for builds to start with exponential backoff polling.
 */

import type { JenkinsClient } from '../client/index.js';
import type { QueueRef, BuildRef } from '../types/refs.js';
import type { QueueItem } from '../types/resources.js';
import { buildNumber } from '../types/refs.js';
import { JenkinsError, JenkinsErrorKind } from '../types/errors.js';

/**
 * Default timeout for waiting for a build (5 minutes).
 */
const DEFAULT_WAIT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Initial poll interval (1 second).
 */
const INITIAL_POLL_INTERVAL_MS = 1000;

/**
 * Maximum poll interval (5 seconds).
 */
const MAX_POLL_INTERVAL_MS = 5000;

/**
 * Queue service for managing Jenkins build queue.
 */
export class QueueService {
  constructor(private readonly client: JenkinsClient) {}

  /**
   * Gets information about a queue item.
   *
   * @param queueRef - Queue reference (item ID)
   * @returns Queue item details
   */
  async getQueueItem(queueRef: QueueRef): Promise<QueueItem> {
    const response = await this.client.get<QueueItem>(
      `/queue/item/${queueRef.id}/api/json`
    );
    return response.data;
  }

  /**
   * Cancels a queued build.
   *
   * @param queueRef - Queue reference (item ID)
   */
  async cancelQueueItem(queueRef: QueueRef): Promise<void> {
    await this.client.post(
      `/queue/cancelItem`,
      undefined,
      { query: { id: queueRef.id } }
    );
  }

  /**
   * Lists all items in the build queue.
   *
   * @returns Array of queue items
   */
  async listQueue(): Promise<QueueItem[]> {
    const response = await this.client.get<{ items: QueueItem[] }>(
      '/queue/api/json'
    );
    return response.data.items || [];
  }

  /**
   * Waits for a queued item to start building with exponential backoff.
   * Polls with increasing intervals: 1s -> 2s -> 4s -> 5s (max).
   *
   * @param queueRef - Queue reference (item ID)
   * @param timeout - Maximum time to wait in milliseconds (default: 5 minutes)
   * @returns Build reference when build starts
   * @throws JenkinsError if timeout is reached or queue item is cancelled
   */
  async waitForBuild(
    queueRef: QueueRef,
    timeout: number = DEFAULT_WAIT_TIMEOUT_MS
  ): Promise<BuildRef> {
    const startTime = Date.now();
    let pollInterval = INITIAL_POLL_INTERVAL_MS;

    while (true) {
      // Check timeout
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeout) {
        throw new JenkinsError(
          JenkinsErrorKind.QueueTimeout,
          `Timeout waiting for queue item ${queueRef.id} to start building after ${timeout}ms`
        );
      }

      try {
        const queueItem = await this.getQueueItem(queueRef);

        // Check if cancelled
        if (queueItem.cancelled) {
          throw new JenkinsError(
            JenkinsErrorKind.QueueCancelled,
            `Queue item ${queueRef.id} was cancelled`
          );
        }

        // Check if build has started (executable property is set)
        if (queueItem.executable) {
          return buildNumber(queueItem.executable.number);
        }

        // Item still queued, wait before next poll
        await this.sleep(pollInterval);

        // Exponential backoff with max cap
        pollInterval = Math.min(pollInterval * 2, MAX_POLL_INTERVAL_MS);
      } catch (error) {
        // If it's our own error, rethrow
        if (error instanceof JenkinsError) {
          // If it's a 404, the queue item may have already been processed
          if (error.statusCode === 404) {
            throw new JenkinsError(
              JenkinsErrorKind.NotFound,
              `Queue item ${queueRef.id} not found - it may have already been processed or cancelled`
            );
          }
          throw error;
        }
        throw error;
      }
    }
  }

  /**
   * Sleep utility for polling delays.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
