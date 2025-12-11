/**
 * Retry executor with exponential backoff and jitter
 */

import { AnthropicError } from '../errors/index.js';
import { RetryConfig, RetryHook, RetryDecision } from './types.js';

/**
 * Executes operations with retry logic and exponential backoff
 */
export class RetryExecutor {
  private config: RetryConfig;
  private hooks: RetryHook[];

  constructor(config: RetryConfig) {
    this.config = config;
    this.hooks = [];
  }

  /**
   * Add a hook to be called on retry attempts
   */
  addHook(hook: RetryHook): void {
    this.hooks.push(hook);
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

        const delay = this.calculateDelay(attempt);

        // Notify hooks and collect decisions
        let finalDelay = delay;
        for (const hook of this.hooks) {
          const decision = hook.onRetry(attempt, lastError!, delay);
          if (decision) {
            if (decision.type === 'abort') {
              throw error;
            } else if (decision.type === 'retry') {
              finalDelay = decision.delayMs;
            }
            // 'default' continues with calculated delay
          }
        }

        await this.sleep(finalDelay);
      }
    }

    throw lastError ?? new Error('Retry loop exited unexpectedly');
  }

  /**
   * Check if an error is retryable
   */
  private isRetryable(error: unknown): boolean {
    if (error instanceof AnthropicError) {
      return error.isRetryable;
    }
    return false;
  }

  /**
   * Calculate the delay for a given retry attempt using exponential backoff with jitter
   * @param attempt - The current attempt number (1-indexed)
   * @returns Delay in milliseconds
   */
  private calculateDelay(attempt: number): number {
    // Exponential backoff: baseDelay * 2^(attempt-1)
    const exponentialDelay = this.config.baseDelayMs * Math.pow(2, attempt - 1);

    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);

    // Add jitter: random value between -jitter% and +jitter%
    const jitter = cappedDelay * this.config.jitterFactor * (Math.random() * 2 - 1);

    return Math.floor(cappedDelay + jitter);
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a default retry configuration
 */
export function createDefaultRetryConfig(): RetryConfig {
  return {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    jitterFactor: 0.1,
  };
}
