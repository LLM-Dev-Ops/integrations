/**
 * Resilience patterns for Jenkins API client.
 *
 * Implements retry with exponential backoff for handling transient failures.
 * Focuses on network errors, timeouts, and server errors (5xx).
 *
 * @module client/resilience
 */

import { JenkinsError } from '../types/errors.js';
import type { RetryConfig } from '../types/config.js';

/**
 * Retry executor with exponential backoff.
 */
export class RetryExecutor {
  private readonly config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      initialDelayMs: config.initialDelayMs ?? 1000,
      maxDelayMs: config.maxDelayMs ?? 8000,
      multiplier: config.multiplier ?? 2,
      jitter: config.jitter ?? true,
    };
  }

  /**
   * Execute a function with retry logic.
   *
   * @param fn - Function to execute
   * @param shouldRetry - Optional custom retry predicate
   * @returns Promise resolving to function result
   * @throws Error from the last failed attempt
   */
  async execute<T>(
    fn: () => Promise<T>,
    shouldRetry?: (error: Error) => boolean
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Check if we should retry this error
        const retry = shouldRetry
          ? shouldRetry(lastError)
          : isRetryableError(lastError);

        if (!retry || attempt >= this.config.maxRetries) {
          throw lastError;
        }

        // Calculate delay and wait
        const delay = this.calculateDelay(attempt);
        await sleep(delay);
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError || new Error('Retry executor failed');
  }

  /**
   * Calculate delay for a retry attempt with exponential backoff.
   */
  private calculateDelay(attempt: number): number {
    // Exponential backoff: initialDelay * multiplier^attempt
    const baseDelay =
      this.config.initialDelayMs * Math.pow(this.config.multiplier, attempt);
    const cappedDelay = Math.min(baseDelay, this.config.maxDelayMs);

    // Add jitter if enabled
    if (this.config.jitter) {
      const jitter = cappedDelay * 0.5 * (Math.random() - 0.5);
      return Math.round(cappedDelay + jitter);
    }

    return Math.round(cappedDelay);
  }

  /**
   * Get the retry configuration.
   */
  getConfig(): Readonly<RetryConfig> {
    return { ...this.config };
  }
}

/**
 * Determine if an error is retryable.
 *
 * Retryable errors include:
 * - Server errors (5xx)
 * - Timeout errors (408)
 * - Network/connection errors
 * - DNS resolution failures
 *
 * @param error - Error to check
 * @returns True if the error is retryable
 */
export function isRetryableError(error: Error): boolean {
  // Retry on Jenkins errors marked as retryable
  if (error instanceof JenkinsError) {
    return error.isRetryable();
  }

  // Retry on timeout errors
  if (
    error.message.includes('timeout') ||
    error.message.includes('ETIMEDOUT')
  ) {
    return true;
  }

  // Retry on connection errors
  if (
    error.message.includes('ECONNRESET') ||
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('ENOTFOUND') ||
    error.message.includes('EAI_AGAIN') ||
    error.message.includes('socket hang up')
  ) {
    return true;
  }

  // Retry on abort errors (timeout)
  if (error.name === 'AbortError') {
    return true;
  }

  return false;
}

/**
 * Sleep for specified milliseconds.
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a retry executor with default configuration.
 *
 * @param config - Partial retry configuration
 * @returns RetryExecutor instance
 */
export function createRetryExecutor(
  config: Partial<RetryConfig> = {}
): RetryExecutor {
  return new RetryExecutor(config);
}
