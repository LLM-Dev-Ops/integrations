/**
 * Configuration interfaces and types for the DynamoDB resilience layer
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
  jitterFactor?: number;
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
