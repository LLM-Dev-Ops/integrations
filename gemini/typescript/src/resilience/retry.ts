/**
 * Retry executor with exponential backoff and jitter.
 */

import type { RetryConfig } from '../config/index.js';
import { DEFAULT_RETRY_CONFIG } from '../config/index.js';

/**
 * Executes operations with retry logic, exponential backoff, and jitter.
 */
export class RetryExecutor {
  constructor(private readonly config: RetryConfig = DEFAULT_RETRY_CONFIG) {}

  /**
   * Execute an operation with retry logic.
   *
   * @param operation - The async operation to execute
   * @param isRetryable - Function to determine if an error is retryable
   * @param getRetryAfter - Function to extract retry-after delay from error (in seconds)
   * @returns The result of the operation
   * @throws The error if all retries are exhausted or error is not retryable
   */
  async execute<T>(
    operation: () => Promise<T>,
    isRetryable: (error: unknown) => boolean,
    getRetryAfter?: (error: unknown) => number | undefined,
  ): Promise<T> {
    let attempts = 0;
    let delayMs = this.config.initialDelay;

    while (true) {
      try {
        return await operation();
      } catch (error) {
        attempts++;

        // Check if we should retry
        if (!isRetryable(error) || attempts >= this.config.maxAttempts) {
          throw error;
        }

        // Calculate wait time
        // Use retry-after if provided (convert from seconds to ms), otherwise use exponential backoff
        const retryAfterSeconds = getRetryAfter?.(error);
        const waitMs = retryAfterSeconds !== undefined
          ? retryAfterSeconds * 1000
          : delayMs;
        const jitteredWait = this.addJitter(waitMs);

        // Wait before retrying
        await this.sleep(jitteredWait);

        // Update delay for next attempt (exponential backoff)
        delayMs = Math.min(delayMs * this.config.multiplier, this.config.maxDelay);
      }
    }
  }

  /**
   * Add jitter to a delay value to prevent thundering herd.
   *
   * @param ms - Base delay in milliseconds
   * @returns Delay with jitter applied
   */
  private addJitter(ms: number): number {
    const jitterRange = ms * this.config.jitter;
    const jitter = (Math.random() * 2 - 1) * jitterRange;
    return Math.max(0, ms + jitter);
  }

  /**
   * Sleep for specified milliseconds.
   *
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
