/**
 * Retry logic with exponential backoff
 */
import { RateLimitError, NetworkError, ServerError, TimeoutError } from '../errors/categories.js';
import type { StripeError } from '../errors/error.js';

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
}

/**
 * Default retry configuration
 */
export function createDefaultRetryConfig(): RetryConfig {
  return {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitterFactor: 0.1,
  };
}

/**
 * Retry executor that handles retryable errors
 */
export class RetryExecutor {
  private readonly config: RetryConfig;

  constructor(config: RetryConfig) {
    this.config = config;
  }

  /**
   * Executes an operation with retry logic
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (!this.isRetryable(error)) {
          throw error;
        }

        if (attempt >= this.config.maxRetries) {
          throw error;
        }

        const delay = this.calculateDelay(attempt, error);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Checks if an error is retryable
   */
  private isRetryable(error: unknown): boolean {
    if (error instanceof RateLimitError) return true;
    if (error instanceof NetworkError) return true;
    if (error instanceof ServerError) return true;
    if (error instanceof TimeoutError) return true;

    // Check for generic retryable flag
    if (error && typeof error === 'object' && 'isRetryable' in error) {
      return (error as StripeError).isRetryable;
    }

    return false;
  }

  /**
   * Calculates delay for next retry attempt
   */
  private calculateDelay(attempt: number, error: unknown): number {
    // Use Retry-After header if present
    if (error instanceof RateLimitError && error.retryAfter) {
      return error.retryAfter * 1000;
    }

    // Exponential backoff with jitter
    const exponentialDelay =
      this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, attempt);
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);

    // Add jitter
    const jitter = cappedDelay * this.config.jitterFactor * (Math.random() * 2 - 1);
    return Math.max(0, cappedDelay + jitter);
  }

  /**
   * Sleep for the specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
