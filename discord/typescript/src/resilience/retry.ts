/**
 * Retry executor with exponential backoff for Discord API.
 */

import { RetryConfig } from '../config/index.js';
import { DiscordError, isRetryableError } from '../errors/index.js';

/**
 * Retry hook callbacks.
 */
export interface RetryHooks {
  /** Called before each retry attempt */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
  /** Called when all retries are exhausted */
  onExhausted?: (error: Error, attempts: number) => void;
}

/**
 * Retry executor for handling transient failures.
 */
export class RetryExecutor {
  private readonly config: RetryConfig;
  private readonly hooks: RetryHooks;

  constructor(config: RetryConfig, hooks: RetryHooks = {}) {
    this.config = config;
    this.hooks = hooks;
  }

  /**
   * Executes an operation with retry logic.
   * @param operation - The async operation to execute
   * @returns The result of the operation
   * @throws The last error if all retries are exhausted
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        if (!this.shouldRetry(lastError, attempt)) {
          throw lastError;
        }

        // Calculate delay
        const delayMs = this.calculateDelay(lastError, attempt);

        // Call hook
        this.hooks.onRetry?.(attempt, lastError, delayMs);

        // Wait before retry
        await this.sleep(delayMs);
      }
    }

    // All retries exhausted
    this.hooks.onExhausted?.(lastError!, this.config.maxRetries + 1);
    throw lastError;
  }

  /**
   * Determines if an error should trigger a retry.
   */
  private shouldRetry(error: Error, attempt: number): boolean {
    // Check if we have retries left
    if (attempt > this.config.maxRetries) {
      return false;
    }

    // Check if error is retryable
    return isRetryableError(error);
  }

  /**
   * Calculates the delay before the next retry.
   */
  private calculateDelay(error: Error, attempt: number): number {
    // If error specifies retry-after, use that
    if (error instanceof DiscordError && error.retryAfterMs) {
      return error.retryAfterMs;
    }

    // Exponential backoff: base * multiplier^(attempt-1)
    const exponentialDelay =
      this.config.initialBackoffMs *
      Math.pow(this.config.backoffMultiplier, attempt - 1);

    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, this.config.maxBackoffMs);

    // Add jitter
    const jitter = cappedDelay * this.config.jitterFactor * Math.random();
    const delayWithJitter = cappedDelay + jitter;

    return Math.floor(delayWithJitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Creates a retry executor with default configuration.
 */
export function createRetryExecutor(
  config: Partial<RetryConfig> = {},
  hooks: RetryHooks = {}
): RetryExecutor {
  const fullConfig: RetryConfig = {
    maxRetries: config.maxRetries ?? 3,
    initialBackoffMs: config.initialBackoffMs ?? 1000,
    maxBackoffMs: config.maxBackoffMs ?? 30000,
    backoffMultiplier: config.backoffMultiplier ?? 2,
    jitterFactor: config.jitterFactor ?? 0.1,
  };

  return new RetryExecutor(fullConfig, hooks);
}
