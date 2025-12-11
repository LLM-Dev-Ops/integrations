/**
 * OAuth2 Retry Executor
 *
 * Retry logic with exponential backoff for OAuth2 operations.
 */

import { OAuth2Error, NetworkError, ProviderError, isRetryable } from "../error";

/**
 * Retry configuration.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial backoff delay in milliseconds */
  initialBackoffMs: number;
  /** Maximum backoff delay in milliseconds */
  maxBackoffMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Jitter factor (0-1) */
  jitter: number;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 500,
  maxBackoffMs: 30000,
  backoffMultiplier: 2.0,
  jitter: 0.1,
};

/**
 * Retry executor interface.
 */
export interface RetryExecutor {
  /**
   * Execute operation with retry.
   */
  execute<T>(operation: () => Promise<T>): Promise<T>;

  /**
   * Execute operation with retry and custom predicate.
   */
  executeIf<T>(
    operation: () => Promise<T>,
    shouldRetry: (error: Error, attempt: number) => boolean
  ): Promise<T>;
}

/**
 * OAuth2 retry executor implementation.
 */
export class OAuth2RetryExecutor implements RetryExecutor {
  private config: RetryConfig;

  constructor(config?: Partial<RetryConfig>) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    return this.executeIf(operation, (error) => {
      if (error instanceof OAuth2Error) {
        return isRetryable(error);
      }
      return false;
    });
  }

  async executeIf<T>(
    operation: () => Promise<T>,
    shouldRetry: (error: Error, attempt: number) => boolean
  ): Promise<T> {
    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt <= this.config.maxRetries) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        attempt++;

        // Check if we should retry
        if (attempt > this.config.maxRetries) {
          break;
        }

        if (!shouldRetry(lastError, attempt)) {
          break;
        }

        // Handle rate limit with Retry-After header
        const retryAfter = this.getRetryAfter(lastError);
        const backoff = retryAfter ?? this.calculateBackoff(attempt);

        await this.sleep(backoff);
      }
    }

    throw lastError;
  }

  private calculateBackoff(attempt: number): number {
    // Exponential backoff
    const baseDelay =
      this.config.initialBackoffMs *
      Math.pow(this.config.backoffMultiplier, attempt - 1);

    // Cap at max backoff
    const cappedDelay = Math.min(baseDelay, this.config.maxBackoffMs);

    // Add jitter
    const jitterAmount = cappedDelay * this.config.jitter;
    const jitter = (Math.random() * 2 - 1) * jitterAmount;

    return Math.round(cappedDelay + jitter);
  }

  private getRetryAfter(error: Error): number | undefined {
    if (error instanceof NetworkError && error.retryAfter) {
      return error.retryAfter * 1000; // Convert to milliseconds
    }
    return undefined;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Mock retry executor for testing.
 */
export class MockRetryExecutor implements RetryExecutor {
  private executeHistory: Array<{ attempts: number; success: boolean }> = [];
  private forceFailUntilAttempt: number = 0;

  /**
   * Force failure until specific attempt number.
   */
  setForceFailUntilAttempt(attempt: number): this {
    this.forceFailUntilAttempt = attempt;
    return this;
  }

  /**
   * Get execution history.
   */
  getExecuteHistory(): Array<{ attempts: number; success: boolean }> {
    return [...this.executeHistory];
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    return this.executeIf(operation, () => true);
  }

  async executeIf<T>(
    operation: () => Promise<T>,
    shouldRetry: (error: Error, attempt: number) => boolean
  ): Promise<T> {
    let attempts = 0;

    while (true) {
      attempts++;
      try {
        if (attempts <= this.forceFailUntilAttempt) {
          throw new NetworkError("Mock failure", "ConnectionFailed");
        }
        const result = await operation();
        this.executeHistory.push({ attempts, success: true });
        return result;
      } catch (error) {
        if (!shouldRetry(error as Error, attempts)) {
          this.executeHistory.push({ attempts, success: false });
          throw error;
        }
      }
    }
  }
}

/**
 * Create OAuth2 retry executor.
 */
export function createRetryExecutor(config?: Partial<RetryConfig>): RetryExecutor {
  return new OAuth2RetryExecutor(config);
}

/**
 * Create mock retry executor for testing.
 */
export function createMockRetryExecutor(): MockRetryExecutor {
  return new MockRetryExecutor();
}
