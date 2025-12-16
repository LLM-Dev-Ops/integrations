/**
 * Resilience layer for Qdrant integration
 * Provides retry logic with exponential backoff and circuit breaker pattern
 */

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Base delay in milliseconds before first retry */
  baseDelayMs: number;
  /** Maximum delay in milliseconds between retries */
  maxDelayMs: number;
  /** Jitter factor (0-1) to add randomness to delays */
  jitterFactor: number;
}

/**
 * Configuration for circuit breaker behavior
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Number of successes required to close the circuit from half-open */
  successThreshold: number;
  /** Duration in milliseconds to wait before transitioning to half-open */
  openDurationMs: number;
}

/**
 * Circuit breaker states
 */
export type CircuitState = 'closed' | 'open' | 'half_open';

/**
 * Statistics about circuit breaker state
 */
export interface CircuitBreakerStats {
  /** Current circuit state */
  state: CircuitState;
  /** Number of consecutive failures */
  failureCount: number;
  /** Number of consecutive successes (in half-open state) */
  successCount: number;
  /** Timestamp of last failure */
  lastFailureTime: number | undefined;
  /** Current configuration */
  config: CircuitBreakerConfig;
  /** Time in ms until circuit transitions to half-open (if open) */
  timeUntilHalfOpen: number | undefined;
}

/**
 * Base error class for detecting retryable errors
 */
export interface QdrantErrorLike {
  readonly isRetryable?: boolean;
  readonly type?: string;
  message: string;
}

/**
 * Executes operations with retry logic and exponential backoff
 */
export class RetryExecutor {
  private config: RetryConfig;

  constructor(config: RetryConfig) {
    this.config = config;
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
        await this.sleep(delay);
      }
    }

    throw lastError ?? new Error('Retry loop exited unexpectedly');
  }

  /**
   * Check if an error is retryable
   */
  isRetryable(error: unknown): boolean {
    // Check if error has isRetryable property
    if (typeof error === 'object' && error !== null) {
      const qdrantError = error as QdrantErrorLike;
      if (typeof qdrantError.isRetryable === 'boolean') {
        return qdrantError.isRetryable;
      }

      // Check by error type
      const errorType = qdrantError.type;
      if (errorType) {
        return isTransientError(errorType);
      }
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
 * Error thrown when circuit breaker is open
 */
export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Circuit breaker that prevents cascading failures by failing fast when errors exceed threshold
 *
 * States:
 * - Closed: Normal operation, tracks failures
 * - Open: Fails fast, rejects all requests immediately
 * - Half-Open: Allows test requests through to check if service recovered
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | undefined = undefined;
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  /**
   * Execute an operation through the circuit breaker
   * @param operation - The async operation to execute
   * @returns The result of the operation
   * @throws CircuitOpenError if circuit is open
   * @throws The original error from the operation
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.checkStateTransition();

    if (this.state === 'open') {
      throw new CircuitOpenError('Circuit breaker is open');
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Check if circuit should transition from open to half-open
   */
  private checkStateTransition(): void {
    if (this.state === 'open' && this.shouldTransitionToHalfOpen()) {
      this.transitionTo('half_open');
    }
  }

  /**
   * Determine if enough time has passed to try half-open state
   */
  private shouldTransitionToHalfOpen(): boolean {
    if (!this.lastFailureTime) return false;
    return Date.now() - this.lastFailureTime >= this.config.openDurationMs;
  }

  /**
   * Record a successful operation
   */
  private recordSuccess(): void {
    if (this.state === 'half_open') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo('closed');
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed operation
   */
  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half_open') {
      // Any failure in half-open state reopens the circuit
      this.transitionTo('open');
    } else if (this.state === 'closed' && this.failureCount >= this.config.failureThreshold) {
      this.transitionTo('open');
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    this.state = newState;

    // Reset counters based on new state
    if (newState === 'closed') {
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === 'half_open') {
      this.successCount = 0;
    } else if (newState === 'open') {
      this.successCount = 0;
    }
  }

  /**
   * Get the current state of the circuit breaker
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get comprehensive statistics about the circuit breaker state
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      config: { ...this.config },
      timeUntilHalfOpen: this.getTimeUntilHalfOpen(),
    };
  }

  /**
   * Get time remaining until circuit transitions to half-open (if open)
   * Returns undefined if circuit is not open
   */
  private getTimeUntilHalfOpen(): number | undefined {
    if (this.state !== 'open' || !this.lastFailureTime) {
      return undefined;
    }
    const elapsed = Date.now() - this.lastFailureTime;
    const remaining = this.config.openDurationMs - elapsed;
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Reset the circuit breaker to closed state
   */
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
  }
}

/**
 * Retry configuration per error type based on SPARC specification
 */
const ERROR_RETRY_CONFIGS: Record<string, RetryConfig> = {
  connection_error: {
    maxAttempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 5000,
    jitterFactor: 0.1,
  },
  rate_limit_error: {
    maxAttempts: 5,
    baseDelayMs: 500,
    maxDelayMs: 30000,
    jitterFactor: 0.1,
  },
  service_unavailable: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    jitterFactor: 0.1,
  },
  timeout_error: {
    maxAttempts: 2,
    baseDelayMs: 1000,
    maxDelayMs: 2000,
    jitterFactor: 0.0, // Linear backoff for timeouts
  },
};

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 5000,
  jitterFactor: 0.1,
};

/**
 * Default circuit breaker configuration
 */
const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  openDurationMs: 30000,
};

/**
 * Get retry configuration for a specific error type
 * @param errorType - The error type string
 * @returns The retry configuration for the error type
 */
export function getRetryConfigForError(errorType: string): RetryConfig {
  return ERROR_RETRY_CONFIGS[errorType] ?? DEFAULT_RETRY_CONFIG;
}

/**
 * Check if an error type is transient and should be retried
 * Based on SPARC specification Section 6.1: Retry Configuration
 *
 * Transient errors:
 * - ConnectionError: retry 3x, exponential 100ms
 * - RateLimited: retry 5x, exponential 500ms
 * - ServiceUnavailable: retry 3x, exponential 1s
 * - SearchTimeout: retry 2x, linear 1s
 *
 * Non-transient errors (no retry):
 * - InvalidVector
 * - CollectionNotFound
 * - InvalidApiKey
 * - PermissionDenied
 * - etc.
 */
export function isTransientError(errorType: string): boolean {
  const transientTypes = [
    'connection_error',
    'connection_timeout',
    'rate_limit_error',
    'service_unavailable',
    'timeout_error',
    'search_timeout',
    'internal_error',
    'network_error',
  ];

  return transientTypes.includes(errorType);
}

/**
 * Create a default retry executor
 */
export function createDefaultRetryExecutor(): RetryExecutor {
  return new RetryExecutor(DEFAULT_RETRY_CONFIG);
}

/**
 * Create a retry executor for a specific error type
 */
export function createRetryExecutorForError(errorType: string): RetryExecutor {
  const config = getRetryConfigForError(errorType);
  return new RetryExecutor(config);
}

/**
 * Create a default circuit breaker
 */
export function createDefaultCircuitBreaker(): CircuitBreaker {
  return new CircuitBreaker(DEFAULT_CIRCUIT_BREAKER_CONFIG);
}

/**
 * Create a circuit breaker with custom configuration
 */
export function createCircuitBreaker(config: CircuitBreakerConfig): CircuitBreaker {
  return new CircuitBreaker(config);
}
