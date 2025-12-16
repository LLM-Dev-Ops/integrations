/**
 * Resilience patterns for MySQL client following SPARC specification.
 *
 * Provides retry logic with exponential backoff, circuit breaker patterns,
 * and rate limiting to handle transient failures and prevent cascading failures.
 *
 * @module resilience
 */

import {
  MysqlError,
  DeadlockDetectedError,
  LockWaitTimeoutError,
  ConnectionLostError,
  ServerGoneError,
  TooManyConnectionsError,
  isMysqlError,
  isRetryableError,
} from '../errors/index.js';

// ============================================================================
// Backoff Strategies
// ============================================================================

/**
 * Backoff strategy interface for retry delays.
 */
export interface BackoffStrategy {
  /**
   * Calculates the next backoff delay.
   * @param attempt - The current attempt number (0-based)
   * @returns Delay in milliseconds
   */
  nextDelay(attempt: number): number;

  /**
   * Resets the backoff strategy state.
   */
  reset(): void;
}

/**
 * Exponential backoff with jitter.
 *
 * Delay = min(base * (2 ^ attempt), max) +/- (jitter * delay)
 */
export class ExponentialBackoff implements BackoffStrategy {
  constructor(
    private readonly baseMs: number,
    private readonly maxMs: number,
    private readonly jitter: number = 0.1
  ) {}

  nextDelay(attempt: number): number {
    // Exponential backoff: base * (2 ^ attempt)
    const exponentialDelay = this.baseMs * Math.pow(2, attempt);

    // Cap at max
    const cappedDelay = Math.min(exponentialDelay, this.maxMs);

    // Apply jitter: delay +/- (delay * jitter * random)
    const jitterRange = cappedDelay * this.jitter;
    const jitterValue = (Math.random() * 2 - 1) * jitterRange;

    return Math.max(0, Math.floor(cappedDelay + jitterValue));
  }

  reset(): void {
    // Stateless, nothing to reset
  }
}

/**
 * Fixed backoff strategy with constant delay.
 */
export class FixedBackoff implements BackoffStrategy {
  constructor(private readonly delayMs: number) {}

  nextDelay(_attempt: number): number {
    return this.delayMs;
  }

  reset(): void {
    // Stateless, nothing to reset
  }
}

// ============================================================================
// Retry Policy
// ============================================================================

/**
 * Retry policy configuration.
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Backoff strategy for delays between retries */
  backoff: BackoffStrategy;
  /** Error types that should trigger a retry */
  retryableErrors: string[];
}

/**
 * Gets the appropriate retry policy for a MySQL error.
 *
 * Based on SPARC refinement specification:
 * - DeadlockDetected: 3 retries, 50-500ms exponential
 * - LockWaitTimeout: 2 retries, 100-1000ms exponential
 * - ConnectionLost: 2 retries, 100-500ms exponential
 * - TooManyConnections: 3 retries, 500-2000ms exponential
 * - ServerGone: 1 retry, 100ms fixed
 *
 * @param error - The error to get retry policy for
 * @returns Retry policy or null if error should not be retried
 */
export function getRetryPolicy(error: unknown): RetryPolicy | null {
  if (!isMysqlError(error)) {
    return null;
  }

  // Match error by type
  if (error instanceof DeadlockDetectedError) {
    return {
      maxAttempts: 3,
      backoff: new ExponentialBackoff(50, 500, 0.2),
      retryableErrors: ['DEADLOCK_DETECTED'],
    };
  }

  if (error instanceof LockWaitTimeoutError) {
    return {
      maxAttempts: 2,
      backoff: new ExponentialBackoff(100, 1000, 0.1),
      retryableErrors: ['LOCK_WAIT_TIMEOUT'],
    };
  }

  if (error instanceof ConnectionLostError) {
    return {
      maxAttempts: 2,
      backoff: new ExponentialBackoff(100, 500, 0.1),
      retryableErrors: ['CONNECTION_LOST'],
    };
  }

  if (error instanceof TooManyConnectionsError) {
    return {
      maxAttempts: 3,
      backoff: new ExponentialBackoff(500, 2000, 0.3),
      retryableErrors: ['TOO_MANY_CONNECTIONS'],
    };
  }

  if (error instanceof ServerGoneError) {
    return {
      maxAttempts: 1,
      backoff: new FixedBackoff(100),
      retryableErrors: ['SERVER_GONE'],
    };
  }

  // Check generic retryable flag
  if (isRetryableError(error)) {
    return {
      maxAttempts: 2,
      backoff: new ExponentialBackoff(100, 1000, 0.1),
      retryableErrors: [],
    };
  }

  return null;
}

/**
 * Default retry policy configuration.
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoff: new ExponentialBackoff(100, 5000, 0.1),
  retryableErrors: [
    'CONNECTION_REFUSED',
    'CONNECTION_LOST',
    'SERVER_GONE',
    'TOO_MANY_CONNECTIONS',
    'DEADLOCK_DETECTED',
    'LOCK_WAIT_TIMEOUT',
    'QUERY_TIMEOUT',
  ],
};

// ============================================================================
// Retry Executor
// ============================================================================

/**
 * Executes operations with retry logic.
 *
 * @example
 * ```typescript
 * const executor = new RetryExecutor();
 * const result = await executor.execute(
 *   async () => await db.query('SELECT 1'),
 *   DEFAULT_RETRY_POLICY
 * );
 * ```
 */
export class RetryExecutor {
  /**
   * Executes a function with retry logic.
   *
   * @param fn - The async function to execute
   * @param policy - Retry policy to use (or will be determined from error)
   * @returns The result of the function
   * @throws {MysqlError} If all retry attempts fail
   */
  async execute<T>(
    fn: () => Promise<T>,
    policy?: RetryPolicy
  ): Promise<T> {
    let lastError: Error | undefined;
    let attempt = 0;
    const maxAttempts = policy?.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts;

    while (attempt < maxAttempts) {
      try {
        const result = await fn();
        return result;
      } catch (error) {
        lastError = error as Error;
        attempt++;

        // Get retry policy for this specific error if not provided
        const retryPolicy = policy ?? getRetryPolicy(error);

        // Check if error is retryable
        if (!retryPolicy) {
          throw error;
        }

        // Don't sleep after last attempt
        if (attempt >= retryPolicy.maxAttempts) {
          break;
        }

        // Calculate backoff delay
        const delay = retryPolicy.backoff.nextDelay(attempt - 1);
        await this.sleep(delay);
      }
    }

    // All attempts failed
    throw lastError;
  }

  /**
   * Sleeps for the specified duration.
   *
   * @param ms - Duration in milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Circuit Breaker
// ============================================================================

/**
 * Circuit breaker state.
 */
export enum CircuitBreakerState {
  /** Circuit is closed, requests flow normally */
  Closed = 'closed',
  /** Circuit is open, requests are rejected */
  Open = 'open',
  /** Circuit is testing recovery, limited requests are allowed */
  HalfOpen = 'half_open',
}

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /** Name identifier for this circuit breaker */
  name: string;
  /** Number of consecutive failures before opening the circuit */
  threshold: number;
  /** Time window in milliseconds for counting failures */
  windowMs: number;
  /** Time in milliseconds to wait before transitioning from open to half-open */
  openDurationMs: number;
}

/**
 * Circuit breaker implementation to prevent cascading failures.
 *
 * The circuit breaker has three states:
 * - Closed: Normal operation, all requests are allowed
 * - Open: Failures have exceeded threshold, requests are rejected
 * - HalfOpen: Testing recovery, limited requests are allowed
 *
 * Config from SPARC specification:
 * - Primary: threshold 5, window 30s, open 60s
 * - Replica: threshold 3, window 20s, open 30s
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   name: 'primary',
 *   threshold: 5,
 *   windowMs: 30000,
 *   openDurationMs: 60000
 * });
 *
 * const result = await breaker.execute(async () => {
 *   return await db.query('SELECT 1');
 * });
 * ```
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.Closed;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime?: number;
  private windowStart: number = Date.now();
  private readonly config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  /**
   * Executes a function with circuit breaker protection.
   *
   * @param fn - The async function to execute
   * @returns The result of the function
   * @throws {MysqlError} If circuit breaker is open or execution fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.updateState();

    if (this.state === CircuitBreakerState.Open) {
      throw new MysqlError({
        code: 'CIRCUIT_BREAKER_OPEN',
        message: `Circuit breaker '${this.config.name}' is open`,
        retryable: false,
        details: {
          name: this.config.name,
          state: this.state,
          resetTimeMs: this.getRemainingOpenTime(),
        },
      });
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Records a successful operation.
   */
  recordSuccess(): void {
    if (this.state === CircuitBreakerState.HalfOpen) {
      this.successCount++;
      // After first success in half-open, transition to closed
      if (this.successCount >= 1) {
        this.transitionToClosed();
      }
    } else if (this.state === CircuitBreakerState.Closed) {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  /**
   * Records a failed operation.
   */
  recordFailure(): void {
    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.HalfOpen) {
      // Any failure in half-open state reopens the circuit
      this.transitionToOpen();
    } else if (this.state === CircuitBreakerState.Closed) {
      this.failureCount++;

      // Check if window has expired
      const now = Date.now();
      if (now - this.windowStart > this.config.windowMs) {
        // Reset window
        this.windowStart = now;
        this.failureCount = 1;
      }

      // Check threshold
      if (this.failureCount >= this.config.threshold) {
        this.transitionToOpen();
      }
    }
  }

  /**
   * Gets the current state of the circuit breaker.
   */
  getState(): CircuitBreakerState {
    this.updateState();
    return this.state;
  }

  /**
   * Manually resets the circuit breaker to closed state.
   */
  reset(): void {
    this.transitionToClosed();
  }

  /**
   * Updates the state based on time and thresholds.
   */
  private updateState(): void {
    if (this.state === CircuitBreakerState.Open && this.lastFailureTime) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.openDurationMs) {
        this.transitionToHalfOpen();
      }
    }

    // Reset window if expired
    const now = Date.now();
    if (this.state === CircuitBreakerState.Closed && now - this.windowStart > this.config.windowMs) {
      this.windowStart = now;
      this.failureCount = 0;
    }
  }

  /**
   * Gets remaining time in milliseconds before circuit breaker can transition to half-open.
   */
  private getRemainingOpenTime(): number {
    if (this.state !== CircuitBreakerState.Open || !this.lastFailureTime) {
      return 0;
    }
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.config.openDurationMs - elapsed);
  }

  /**
   * Transitions to the Closed state.
   */
  private transitionToClosed(): void {
    this.state = CircuitBreakerState.Closed;
    this.failureCount = 0;
    this.successCount = 0;
    this.windowStart = Date.now();
    this.lastFailureTime = undefined;
  }

  /**
   * Transitions to the Open state.
   */
  private transitionToOpen(): void {
    this.state = CircuitBreakerState.Open;
    this.successCount = 0;
  }

  /**
   * Transitions to the HalfOpen state.
   */
  private transitionToHalfOpen(): void {
    this.state = CircuitBreakerState.HalfOpen;
    this.failureCount = 0;
    this.successCount = 0;
  }
}

/**
 * Creates a circuit breaker for primary database.
 */
export function createPrimaryCircuitBreaker(): CircuitBreaker {
  return new CircuitBreaker({
    name: 'primary',
    threshold: 5,
    windowMs: 30000,
    openDurationMs: 60000,
  });
}

/**
 * Creates a circuit breaker for replica database.
 */
export function createReplicaCircuitBreaker(replicaId: string): CircuitBreaker {
  return new CircuitBreaker({
    name: `replica-${replicaId}`,
    threshold: 3,
    windowMs: 20000,
    openDurationMs: 30000,
  });
}

// ============================================================================
// Rate Limiter (Token Bucket)
// ============================================================================

/**
 * Token bucket rate limiter.
 *
 * Allows a maximum number of operations per second with burst capacity.
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter(100, 200); // 100 tokens/sec, 200 bucket size
 * await limiter.acquire(); // Wait for token
 * // Perform operation
 * ```
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly tokensPerSecond: number;
  private readonly bucketSize: number;

  /**
   * Creates a new token bucket rate limiter.
   *
   * @param tokensPerSecond - Rate at which tokens are added
   * @param bucketSize - Maximum number of tokens in bucket
   */
  constructor(tokensPerSecond: number, bucketSize: number) {
    this.tokensPerSecond = tokensPerSecond;
    this.bucketSize = bucketSize;
    this.tokens = bucketSize;
    this.lastRefill = Date.now();
  }

  /**
   * Acquires a token, waiting if necessary.
   *
   * @returns Promise that resolves when token is acquired
   */
  async acquire(): Promise<void> {
    while (!this.tryAcquire()) {
      // Calculate time to next token
      const tokensNeeded = 1;
      const timePerToken = 1000 / this.tokensPerSecond;
      const waitTime = timePerToken * tokensNeeded;

      // Wait for next token
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitTime, 100)));
    }
  }

  /**
   * Tries to acquire a token without waiting.
   *
   * @returns true if token was acquired, false otherwise
   */
  tryAcquire(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Refills the token bucket based on elapsed time.
   */
  private refill(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefill;

    // Calculate tokens to add
    const tokensToAdd = (elapsedMs / 1000) * this.tokensPerSecond;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.bucketSize, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * Gets the current number of available tokens.
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Resets the rate limiter to full capacity.
   */
  reset(): void {
    this.tokens = this.bucketSize;
    this.lastRefill = Date.now();
  }
}

// ============================================================================
// Resilience Orchestrator
// ============================================================================

/**
 * Options for resilience orchestrator execution.
 */
export interface ResilienceOptions {
  /** Retry policy to use (or will be determined from error) */
  retryPolicy?: RetryPolicy;
  /** Circuit breaker to use */
  circuitBreaker?: CircuitBreaker;
  /** Rate limiter to use */
  rateLimiter?: RateLimiter;
  /** Context name for logging and debugging */
  context?: string;
}

/**
 * Orchestrates retry logic, circuit breaker, and rate limiting.
 *
 * Combines all resilience patterns for comprehensive failure handling.
 *
 * @example
 * ```typescript
 * const orchestrator = new ResilienceOrchestrator();
 *
 * const result = await orchestrator.execute(
 *   async () => await db.query('SELECT * FROM users'),
 *   {
 *     retryPolicy: DEFAULT_RETRY_POLICY,
 *     circuitBreaker: primaryCircuitBreaker,
 *     rateLimiter: queryRateLimiter,
 *     context: 'query-users'
 *   }
 * );
 * ```
 */
export class ResilienceOrchestrator {
  private readonly retryExecutor: RetryExecutor;

  constructor() {
    this.retryExecutor = new RetryExecutor();
  }

  /**
   * Executes a function with full resilience patterns.
   *
   * Applies rate limiting, circuit breaker, and retry logic.
   *
   * @param fn - The async function to execute
   * @param options - Resilience options
   * @returns The result of the function
   * @throws {MysqlError} If execution fails after all retries
   */
  async execute<T>(
    fn: () => Promise<T>,
    options: ResilienceOptions = {}
  ): Promise<T> {
    const { retryPolicy, circuitBreaker, rateLimiter, context } = options;

    // Apply rate limiting first
    if (rateLimiter) {
      await rateLimiter.acquire();
    }

    // Execute with circuit breaker and retry
    const executeFn = async () => {
      if (circuitBreaker) {
        return await circuitBreaker.execute(fn);
      }
      return await fn();
    };

    // Execute with retry logic
    return await this.retryExecutor.execute(executeFn, retryPolicy);
  }

  /**
   * Gets the retry executor.
   */
  getRetryExecutor(): RetryExecutor {
    return this.retryExecutor;
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  MysqlError,
  isMysqlError,
  isRetryableError,
} from '../errors/index.js';
