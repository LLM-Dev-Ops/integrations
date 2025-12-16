/**
 * DynamoDB-specific retry executor with exponential backoff and jitter
 */

import { DynamoDBError } from '../error/error.js';
import {
  ProvisionedThroughputExceededError,
  ThrottlingExceptionError,
  RequestLimitExceededError,
} from '../error/categories.js';
import { RetryConfig } from './types.js';

/**
 * Executes DynamoDB operations with retry logic and exponential backoff
 *
 * DynamoDB-specific retry behavior:
 * - Retries throttling errors (ProvisionedThroughputExceeded, ThrottlingException, RequestLimitExceeded)
 * - Retries transient service errors (InternalServerError, ServiceUnavailable)
 * - Retries transaction conflicts
 * - Uses shorter base delay (50ms) for throttling errors
 * - Uses longer base delay (100ms) for other retryable errors
 * - Adds jitter to prevent thundering herd
 */
export class DynamoDBRetryExecutor {
  private config: RetryConfig;

  constructor(config: RetryConfig) {
    this.config = config;
  }

  /**
   * Execute an operation with retry logic
   * @param operation - The async operation to execute
   * @returns The result of the operation
   * @throws The last error if all retries are exhausted
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry if error is not retryable or we've exhausted attempts
        if (!this.isRetryable(error) || attempt === this.config.maxAttempts) {
          throw error;
        }

        const delay = this.calculateDelay(attempt, error);
        await this.sleep(delay);
      }
    }

    throw lastError ?? new Error('Retry loop exited unexpectedly');
  }

  /**
   * Check if an error is retryable
   * @param error - The error to check
   * @returns true if the error should be retried
   */
  private isRetryable(error: unknown): boolean {
    if (error instanceof DynamoDBError) {
      return error.isRetryable;
    }
    return false;
  }

  /**
   * Check if an error is a throttling error
   * @param error - The error to check
   * @returns true if the error is throttling-related
   */
  private isThrottlingError(error: unknown): boolean {
    return (
      error instanceof ProvisionedThroughputExceededError ||
      error instanceof ThrottlingExceptionError ||
      error instanceof RequestLimitExceededError
    );
  }

  /**
   * Calculate the delay for a given retry attempt using exponential backoff with jitter
   * @param attempt - The current attempt number (1-indexed)
   * @param error - The error that triggered the retry
   * @returns Delay in milliseconds
   */
  private calculateDelay(attempt: number, error: unknown): number {
    // Use different base delays for throttling vs other errors
    // Throttling errors use 50ms base, others use 100ms
    const baseDelay = this.isThrottlingError(error) ? 50 : 100;

    // Exponential backoff: baseDelay * 2^(attempt-1)
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);

    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);

    // Add jitter if jitterFactor is configured
    const jitterFactor = this.config.jitterFactor ?? 0.5;
    // Jitter formula: delay * (1 + random * jitterFactor)
    // This adds between 0% and jitterFactor% to the delay
    const jitter = cappedDelay * Math.random() * jitterFactor;

    return Math.floor(cappedDelay + jitter);
  }

  /**
   * Sleep for a specified duration
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a default retry configuration for DynamoDB
 *
 * Default values:
 * - maxAttempts: 10 (DynamoDB can have transient throttling)
 * - baseDelayMs: 50 (will be overridden based on error type)
 * - maxDelayMs: 20000 (20 seconds max wait)
 * - jitterFactor: 0.5 (add up to 50% jitter)
 */
export function createDefaultRetryConfig(): RetryConfig {
  return {
    maxAttempts: 10,
    baseDelayMs: 50,
    maxDelayMs: 20000,
    jitterFactor: 0.5,
  };
}
