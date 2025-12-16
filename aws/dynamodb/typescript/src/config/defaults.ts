/**
 * Default configuration values for DynamoDB client.
 * @module config/defaults
 */

import type { RetryConfig, CircuitBreakerConfig } from './config.js';

/**
 * Default AWS region.
 * Falls back to 'us-east-1' if not specified.
 */
export const DEFAULT_REGION = 'us-east-1';

/**
 * Default request timeout in milliseconds.
 * Set to 5 seconds.
 */
export const DEFAULT_TIMEOUT = 5000;

/**
 * Default maximum number of connections in the connection pool.
 */
export const DEFAULT_MAX_CONNECTIONS = 50;

/**
 * Creates default retry configuration.
 *
 * @returns Default retry configuration with:
 * - maxAttempts: 10
 * - baseDelayMs: 50 (exponential backoff starting point)
 * - maxDelayMs: 20000 (20 seconds maximum delay)
 */
export function createDefaultRetryConfig(): RetryConfig {
  return {
    maxAttempts: 10,
    baseDelayMs: 50,
    maxDelayMs: 20000,
  };
}

/**
 * Creates default circuit breaker configuration.
 *
 * @returns Default circuit breaker configuration with:
 * - failureThreshold: 5 (open circuit after 5 failures)
 * - successThreshold: 2 (close circuit after 2 successes)
 * - openDurationMs: 30000 (keep circuit open for 30 seconds)
 */
export function createDefaultCircuitBreakerConfig(): CircuitBreakerConfig {
  return {
    failureThreshold: 5,
    successThreshold: 2,
    openDurationMs: 30000,
  };
}

/**
 * Default retry configuration instance.
 */
export const DEFAULT_RETRY_CONFIG = createDefaultRetryConfig();

/**
 * Default circuit breaker configuration instance.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG = createDefaultCircuitBreakerConfig();
