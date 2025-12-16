/**
 * Retry logic with exponential backoff for Cloudflare R2
 */

import type { R2RetryConfig } from '../config/index.js';
import { R2Error, isRetryableError } from '../errors/index.js';

/**
 * Retry options
 */
export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
}

/**
 * Retry executor that handles retryable errors with exponential backoff
 */
export class RetryExecutor {
  private readonly config: RetryOptions;

  constructor(config: RetryOptions) {
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

        // Check if error is retryable
        if (!this.isRetryable(error)) {
          throw error;
        }

        // Don't retry if we've exhausted attempts
        if (attempt >= this.config.maxRetries) {
          throw error;
        }

        // Calculate delay and log retry attempt
        const delay = this.calculateDelay(attempt, error);
        this.logRetry(attempt, delay, error);

        // Wait before retrying
        await this.sleep(delay);
      }
    }

    // Should never reach here, but TypeScript needs this
    throw lastError ?? new Error('Retry executor failed without error');
  }

  /**
   * Checks if an error is retryable
   */
  private isRetryable(error: unknown): boolean {
    // Use the error mapping utility for standard retryability checks
    return isRetryableError(error);
  }

  /**
   * Calculates delay for next retry attempt
   */
  private calculateDelay(attempt: number, error: unknown): number {
    // Check for Retry-After header in R2Error
    if (error instanceof R2Error && error.retryAfter) {
      return Math.min(error.retryAfter * 1000, this.config.maxDelayMs);
    }

    // Exponential backoff with jitter
    const exponentialDelay = this.config.baseDelayMs * Math.pow(2, attempt);
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);

    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * this.config.jitterFactor * (Math.random() * 2 - 1);
    return Math.max(0, Math.floor(cappedDelay + jitter));
  }

  /**
   * Sleep for the specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Log retry attempt
   */
  private logRetry(attempt: number, delayMs: number, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = error instanceof R2Error ? error.type : 'unknown';
    const errorCode = error instanceof R2Error ? error.code : undefined;

    const codeInfo = errorCode ? ` [${errorCode}]` : '';
    console.warn(
      `[R2 Retry] Attempt ${attempt + 1}/${this.config.maxRetries + 1} failed: ${errorType}${codeInfo} - ${errorMessage}. ` +
      `Retrying in ${delayMs}ms...`
    );
  }
}

/**
 * Creates a retry executor from R2 retry config
 */
export function createRetryExecutor(config: R2RetryConfig): RetryExecutor {
  return new RetryExecutor({
    maxRetries: config.maxRetries,
    baseDelayMs: config.baseDelayMs,
    maxDelayMs: config.maxDelayMs,
    jitterFactor: config.jitterFactor,
  });
}

/**
 * Creates a default retry executor
 */
export function createDefaultRetryExecutor(): RetryExecutor {
  return new RetryExecutor({
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 30000,
    jitterFactor: 0.1,
  });
}
