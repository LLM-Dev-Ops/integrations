/**
 * Retry logic with exponential backoff.
 */

import { GroqError, isRetryableError } from '../errors';

/**
 * Retry configuration.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts. */
  maxRetries: number;
  /** Initial delay in milliseconds. */
  initialDelayMs: number;
  /** Maximum delay in milliseconds. */
  maxDelayMs: number;
  /** Multiplier for exponential backoff. */
  multiplier: number;
  /** Jitter factor (0-1) for randomizing delays. */
  jitterFactor: number;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  jitterFactor: 0.1,
};

/**
 * Retry policy for handling transient failures.
 */
export class RetryPolicy {
  private readonly config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * Executes a function with retry logic.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry if not retryable
        if (!this.shouldRetry(error, attempt)) {
          throw lastError;
        }

        // Get delay, considering retry-after header
        const delay = this.getDelay(error, attempt);
        await this.sleep(delay);
      }
    }

    throw lastError ?? new Error('Retry failed');
  }

  /**
   * Determines if a request should be retried.
   */
  private shouldRetry(error: unknown, attempt: number): boolean {
    // Don't retry if we've exhausted attempts
    if (attempt >= this.config.maxRetries) {
      return false;
    }

    return isRetryableError(error);
  }

  /**
   * Calculates the delay before the next retry.
   */
  private getDelay(error: unknown, attempt: number): number {
    // Check for retry-after from rate limit
    if (error instanceof GroqError) {
      const retryAfter = error.getRetryAfter();
      if (retryAfter !== undefined) {
        return retryAfter * 1000; // Convert to milliseconds
      }
    }

    // Exponential backoff with jitter
    const baseDelay = this.config.initialDelayMs * Math.pow(this.config.multiplier, attempt);
    const cappedDelay = Math.min(baseDelay, this.config.maxDelayMs);

    // Add jitter
    const jitter = cappedDelay * this.config.jitterFactor * (Math.random() * 2 - 1);
    return Math.max(0, cappedDelay + jitter);
  }

  /**
   * Sleeps for the specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Creates a new retry policy with updated config.
   */
  withConfig(config: Partial<RetryConfig>): RetryPolicy {
    return new RetryPolicy({ ...this.config, ...config });
  }
}

/**
 * Creates a retry policy.
 */
export function createRetryPolicy(config: Partial<RetryConfig> = {}): RetryPolicy {
  return new RetryPolicy(config);
}
