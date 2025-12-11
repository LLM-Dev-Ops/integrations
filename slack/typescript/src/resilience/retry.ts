/**
 * Retry utilities for Slack API.
 */

import { RateLimitError, NetworkError, ServerError } from '../errors';

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
  retryableErrors: string[];
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
  retryableErrors: [
    'rate_limited',
    'service_unavailable',
    'internal_error',
    'request_timeout',
  ],
};

/**
 * Retry result
 */
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDelayMs: number;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown, config: RetryConfig = DEFAULT_RETRY_CONFIG): boolean {
  if (error instanceof RateLimitError) {
    return true;
  }
  if (error instanceof NetworkError) {
    return true;
  }
  if (error instanceof ServerError) {
    return true;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return config.retryableErrors.some((code) => message.includes(code));
  }
  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  rateLimitRetryAfter?: number
): number {
  // If rate limited with retry-after, use that
  if (rateLimitRetryAfter !== undefined) {
    return rateLimitRetryAfter * 1000;
  }

  // Exponential backoff
  const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const cappedDelay = Math.min(baseDelay, config.maxDelayMs);

  // Add jitter
  const jitter = cappedDelay * config.jitterFactor * (Math.random() * 2 - 1);
  return Math.max(0, cappedDelay + jitter);
}

/**
 * Sleep for a duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;
  let totalDelayMs = 0;

  for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
    try {
      const result = await fn();
      return {
        success: true,
        result,
        attempts: attempt + 1,
        totalDelayMs,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt >= fullConfig.maxRetries || !isRetryableError(error, fullConfig)) {
        return {
          success: false,
          error: lastError,
          attempts: attempt + 1,
          totalDelayMs,
        };
      }

      // Calculate delay
      const rateLimitRetryAfter = error instanceof RateLimitError ? error.retryAfter : undefined;
      const delay = calculateDelay(attempt, fullConfig, rateLimitRetryAfter);

      totalDelayMs += delay;
      await sleep(delay);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: fullConfig.maxRetries + 1,
    totalDelayMs,
  };
}

/**
 * Create retry wrapper
 */
export function createRetryWrapper(config: Partial<RetryConfig> = {}): <T>(fn: () => Promise<T>) => Promise<T> {
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    const result = await retry(fn, config);
    if (result.success && result.result !== undefined) {
      return result.result;
    }
    throw result.error ?? new Error('Retry failed without error');
  };
}

/**
 * Retry decorator factory
 */
export function withRetry(config: Partial<RetryConfig> = {}) {
  const wrapper = createRetryWrapper(config);
  return function <T extends (...args: unknown[]) => Promise<unknown>>(
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value as T;
    descriptor.value = async function (...args: unknown[]) {
      return wrapper(() => originalMethod.apply(this, args));
    };
    return descriptor;
  };
}
