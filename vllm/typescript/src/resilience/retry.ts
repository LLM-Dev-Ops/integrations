/**
 * Retry Handler for vLLM
 * Implements exponential backoff with configurable parameters
 */

import type { RetryConfig } from '../types/index.js';
import { isRetryableError, VllmError } from '../types/errors.js';

export interface RetryContext {
  attempt: number;
  startTime: number;
  lastError?: Error;
}

export interface RetryResult<T> {
  success: boolean;
  value?: T;
  error?: Error;
  attempts: number;
  totalTimeMs: number;
}

/**
 * Calculate delay for retry attempt using exponential backoff
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig
): number {
  const exponentialDelay =
    config.baseDelayMs * Math.pow(config.exponentialBase, attempt - 1);
  const delay = Math.min(exponentialDelay, config.maxDelayMs);
  // Add jitter: +/- 10%
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  return Math.floor(delay + jitter);
}

/**
 * Execute an operation with retries
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig,
  onRetry?: (context: RetryContext) => void
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      const value = await operation();
      return {
        success: true,
        value,
        attempts: attempt,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      if (!isRetryableError(error)) {
        return {
          success: false,
          error: lastError,
          attempts: attempt,
          totalTimeMs: Date.now() - startTime,
        };
      }

      // Last attempt, don't retry
      if (attempt >= config.maxAttempts) {
        break;
      }

      // Calculate and apply backoff delay
      const delay = calculateBackoffDelay(attempt, config);

      // Check retry-after header if present
      let actualDelay = delay;
      if (error instanceof VllmError && error.retryAfter) {
        actualDelay = Math.max(delay, error.retryAfter * 1000);
      }

      // Notify retry callback
      if (onRetry) {
        onRetry({
          attempt,
          startTime,
          lastError,
        });
      }

      await sleep(actualDelay);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: config.maxAttempts,
    totalTimeMs: Date.now() - startTime,
  };
}

/**
 * Retry handler class for more control
 */
export class RetryHandler {
  constructor(private readonly config: RetryConfig) {}

  /**
   * Execute with retries
   */
  async execute<T>(
    operation: () => Promise<T>,
    onRetry?: (context: RetryContext) => void
  ): Promise<T> {
    const result = await withRetry(operation, this.config, onRetry);

    if (result.success) {
      return result.value!;
    }

    throw result.error;
  }

  /**
   * Execute with retries, returning result object
   */
  async executeWithResult<T>(
    operation: () => Promise<T>,
    onRetry?: (context: RetryContext) => void
  ): Promise<RetryResult<T>> {
    return withRetry(operation, this.config, onRetry);
  }

  /**
   * Get the config
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
