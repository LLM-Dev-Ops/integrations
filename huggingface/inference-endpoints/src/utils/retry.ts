/**
 * Retry Utility
 * Implements exponential backoff retry logic as specified in SPARC documentation
 */

import { HfError, HfErrorCode } from '../types/errors.js';

export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay between retries (ms) */
  baseDelay: number;
  /** Maximum delay between retries (ms) */
  maxDelay: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Add jitter to delays */
  jitter: boolean;
  /** Custom retry condition */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Called before each retry */
  onRetry?: (error: unknown, attempt: number, delay: number) => void;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Default retry condition - checks if error is retryable
 */
function defaultShouldRetry(error: unknown, _attempt: number): boolean {
  if (error instanceof HfError) {
    return error.isRetryable();
  }

  // Retry network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // Retry on abort errors (could be timeout)
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }

  return false;
}

/**
 * Calculate delay with optional jitter
 */
function calculateDelay(
  attempt: number,
  options: RetryOptions
): number {
  let delay = options.baseDelay * Math.pow(options.backoffMultiplier, attempt - 1);
  delay = Math.min(delay, options.maxDelay);

  if (options.jitter) {
    // Add up to 25% random jitter
    const jitter = delay * 0.25 * Math.random();
    delay = delay + jitter;
  }

  return Math.floor(delay);
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const shouldRetry = opts.shouldRetry || defaultShouldRetry;

  let lastError: unknown;
  let attempt = 0;

  while (attempt <= opts.maxRetries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      attempt++;

      // Check if we should retry
      if (attempt > opts.maxRetries || !shouldRetry(error, attempt)) {
        throw error;
      }

      // Check for retry-after header in rate limit errors
      let delay = calculateDelay(attempt, opts);
      if (error instanceof HfError && error.code === HfErrorCode.RateLimited) {
        const retryAfter = error.getRetryAfter();
        if (retryAfter) {
          delay = Math.max(delay, retryAfter);
        }
      }

      // Call onRetry callback
      if (opts.onRetry) {
        opts.onRetry(error, attempt, delay);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Create a retry wrapper for a specific function
 */
export function createRetryWrapper<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options?: Partial<RetryOptions>
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => withRetry(() => fn(...args), options);
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry decorator for class methods
 */
export function Retry(options?: Partial<RetryOptions>) {
  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return withRetry(() => originalMethod.apply(this, args), options);
    };

    return descriptor;
  };
}

/**
 * Circuit breaker state
 */
enum CircuitState {
  Closed = 'closed',
  Open = 'open',
  HalfOpen = 'half-open',
}

export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in ms before attempting to close circuit */
  resetTimeout: number;
  /** Number of successes needed to close circuit from half-open */
  successThreshold: number;
}

const DEFAULT_CIRCUIT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeout: 60000,
  successThreshold: 2,
};

/**
 * Simple circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.Closed;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private options: CircuitBreakerOptions;

  constructor(options?: Partial<CircuitBreakerOptions>) {
    this.options = { ...DEFAULT_CIRCUIT_OPTIONS, ...options };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from open to half-open
    if (this.state === CircuitState.Open) {
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeout) {
        this.state = CircuitState.HalfOpen;
        this.successCount = 0;
      } else {
        throw new HfError(
          'Circuit breaker is open',
          HfErrorCode.ServiceUnavailable,
          { retryable: true }
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HalfOpen) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.state = CircuitState.Closed;
        this.failureCount = 0;
      }
    } else if (this.state === CircuitState.Closed) {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HalfOpen) {
      this.state = CircuitState.Open;
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.Open;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  isOpen(): boolean {
    return this.state === CircuitState.Open;
  }

  reset(): void {
    this.state = CircuitState.Closed;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }
}
