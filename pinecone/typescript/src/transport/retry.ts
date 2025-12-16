import { PineconeError, RateLimitError } from '../errors/index.js';

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial backoff delay in milliseconds */
  initialBackoff: number;
  /** Maximum backoff delay in milliseconds */
  maxBackoff: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
}

/**
 * Executes operations with retry logic and exponential backoff
 */
export class RetryExecutor {
  private readonly config: RetryConfig;

  constructor(config: RetryConfig) {
    this.config = config;
  }

  /**
   * Execute an operation with retry logic
   * @param operation - The async operation to execute
   * @param isRetryable - Optional custom function to determine if error is retryable
   * @returns The result of the operation
   * @throws The last error if all retries are exhausted
   */
  async execute<T>(
    operation: () => Promise<T>,
    isRetryable?: (error: unknown) => boolean
  ): Promise<T> {
    let lastError: Error | undefined;
    const shouldRetry = isRetryable ?? isRetryableError;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry if error is not retryable or we've exhausted attempts
        if (!shouldRetry(error) || attempt === this.config.maxRetries) {
          throw error;
        }

        // Calculate backoff delay
        let delay = this.calculateBackoff(attempt);

        // Check for Retry-After header in RateLimitError
        if (error instanceof RateLimitError && error.retryAfter) {
          // retryAfter is in seconds, convert to milliseconds
          delay = Math.max(delay, error.retryAfter * 1000);
        }

        await this.sleep(delay);
      }
    }

    throw lastError ?? new Error('Retry loop exited unexpectedly');
  }

  /**
   * Calculate the backoff delay for a given retry attempt using exponential backoff with jitter
   * @param attempt - The current attempt number (0-indexed)
   * @returns Delay in milliseconds
   */
  private calculateBackoff(attempt: number): number {
    // Exponential backoff: initialBackoff * backoffMultiplier^attempt
    const exponentialDelay =
      this.config.initialBackoff * Math.pow(this.config.backoffMultiplier, attempt);

    // Cap at max backoff
    const cappedDelay = Math.min(exponentialDelay, this.config.maxBackoff);

    // Add jitter to prevent thundering herd
    return this.addJitter(cappedDelay);
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Add jitter to backoff delay
   * Uses full jitter strategy: random value between 0 and calculated delay
   */
  private addJitter(backoff: number): number {
    return Math.floor(Math.random() * backoff);
  }
}

/**
 * Determines if an error should be retried
 * Retries on:
 * - 429 (Rate Limit)
 * - 500, 502, 503, 504 (Server errors)
 * - TimeoutError
 * - ConnectionError
 * - NetworkError
 *
 * Does NOT retry on:
 * - 401, 403 (Authentication)
 * - 400 (Validation)
 * - 404 (Not Found)
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof PineconeError) {
    return error.isRetryable;
  }
  return false;
}

/**
 * Create a default retry configuration
 */
export function createDefaultRetryConfig(): RetryConfig {
  return {
    maxRetries: 3,
    initialBackoff: 100,
    maxBackoff: 10000,
    backoffMultiplier: 2.0,
  };
}
