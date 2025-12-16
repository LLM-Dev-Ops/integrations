import { RetryConfig } from '../config/types.js';
import {
  isRetryableError,
  getRetryDelay,
} from '../errors/index.js';

/**
 * Options for retry execution.
 */
export interface RetryOptions {
  /** Operation name for logging */
  operationName: string;
  /** Retry configuration */
  config: RetryConfig;
  /** Optional callback for retry events */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

/**
 * Execute an operation with retry logic.
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { config, onRetry } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry on non-retryable errors
      if (!isRetryableError(error)) {
        throw error;
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= config.maxRetries) {
        throw error;
      }

      // Calculate backoff delay
      const delayMs = calculateBackoff(
        attempt,
        config.initialBackoffMs,
        config.maxBackoffMs,
        config.backoffMultiplier,
        getRetryDelay(error)
      );

      // Notify retry callback if provided
      if (onRetry) {
        onRetry(attempt + 1, error, delayMs);
      }

      // Wait before retry
      await sleep(delayMs);
    }
  }

  // Should not reach here, but TypeScript needs this
  throw lastError;
}

/**
 * Calculate backoff delay with exponential growth and jitter.
 */
export function calculateBackoff(
  attempt: number,
  initialBackoffMs: number,
  maxBackoffMs: number,
  multiplier: number,
  retryAfterMs?: number
): number {
  // Use retry-after if provided and it's larger than calculated backoff
  if (retryAfterMs !== undefined) {
    return Math.min(retryAfterMs, maxBackoffMs);
  }

  // Exponential backoff
  const exponentialDelay = initialBackoffMs * Math.pow(multiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxBackoffMs);

  // Add jitter (up to 25% of the delay)
  const jitter = Math.random() * cappedDelay * 0.25;

  return Math.floor(cappedDelay + jitter);
}

/**
 * Sleep for specified milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a timeout promise that rejects after specified time.
 */
export function createTimeout(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message));
    }, ms);
  });
}

/**
 * Execute operation with timeout.
 */
export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([operation, createTimeout(timeoutMs, message)]);
}
