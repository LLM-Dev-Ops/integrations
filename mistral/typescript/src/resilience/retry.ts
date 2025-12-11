/**
 * Retry logic for the Mistral client.
 */

import { MistralError, isMistralError } from '../errors';

/**
 * Retry configuration.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts. */
  maxRetries: number;
  /** Initial delay in milliseconds. */
  initialDelayMs: number;
  /** Maximum delay in milliseconds. */
  maxDelayMs: number;
  /** Exponential backoff factor. */
  backoffFactor: number;
  /** Jitter factor (0-1). */
  jitterFactor: number;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  backoffFactor: 2,
  jitterFactor: 0.25,
};

/**
 * Retry hook for custom retry logic.
 */
export type RetryHook = (error: MistralError, attempt: number) => boolean | Promise<boolean>;

/**
 * Retry executor.
 */
export class RetryExecutor {
  private readonly config: RetryConfig;
  private readonly hooks: RetryHook[] = [];

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * Adds a retry hook.
   */
  addHook(hook: RetryHook): void {
    this.hooks.push(hook);
  }

  /**
   * Calculates the delay for a retry attempt.
   */
  calculateDelay(attempt: number, retryAfter?: number): number {
    if (retryAfter) {
      return retryAfter * 1000;
    }

    const baseDelay = this.config.initialDelayMs * Math.pow(this.config.backoffFactor, attempt);
    const cappedDelay = Math.min(baseDelay, this.config.maxDelayMs);

    // Add jitter
    const jitter = cappedDelay * this.config.jitterFactor * (Math.random() * 2 - 1);
    return Math.max(0, cappedDelay + jitter);
  }

  /**
   * Determines if an error should be retried.
   */
  async shouldRetry(error: unknown, attempt: number): Promise<boolean> {
    if (attempt >= this.config.maxRetries) {
      return false;
    }

    if (!isMistralError(error)) {
      return false;
    }

    // Run hooks
    for (const hook of this.hooks) {
      const result = await hook(error, attempt);
      if (!result) {
        return false;
      }
    }

    return error.retryable;
  }

  /**
   * Executes an operation with retries.
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (!(await this.shouldRetry(error, attempt))) {
          throw error;
        }

        const delay = this.calculateDelay(
          attempt,
          isMistralError(error) ? error.retryAfter : undefined
        );

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Creates a retry executor with the given configuration.
 */
export function createRetryExecutor(config?: Partial<RetryConfig>): RetryExecutor {
  return new RetryExecutor(config);
}
