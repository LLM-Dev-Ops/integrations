/**
 * Retry logic for SQL Server operations following SPARC specification.
 *
 * Implements exponential backoff with jitter for retryable errors such as deadlocks,
 * lock timeouts, and transient connection failures.
 *
 * @module operations/retry
 */

import {
  SqlServerError,
  DeadlockDetectedError,
  LockTimeoutError,
  QueryTimeoutError,
  ConnectionFailedError,
  NetworkError,
  AcquireTimeoutError,
  PoolExhaustedError,
  SnapshotIsolationConflictError,
} from '../errors/index.js';
import type { Observability } from '../observability/index.js';

// ============================================================================
// Retry Policy Configuration
// ============================================================================

/**
 * Retry policy configuration.
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Base delay in milliseconds for exponential backoff */
  baseDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Jitter factor (0.0 to 1.0+) - adds randomness to delay */
  jitterFactor: number;
  /** Custom function to determine if an error is retryable */
  isRetryable?: (error: unknown) => boolean;
}

/**
 * Default retry policy based on SPARC specification.
 */
export const DefaultRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 2000,
  jitterFactor: 1.0,
};

/**
 * Deadlock-specific retry policy with settings optimized for deadlock scenarios.
 */
export const DeadlockRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 2000,
  jitterFactor: 1.0,
  isRetryable: isDeadlockError,
};

// ============================================================================
// Retryable Error Detection
// ============================================================================

/**
 * SQL Server error codes that indicate retryable conditions.
 *
 * Based on SPARC architecture specification:
 * - 1205: Deadlock victim
 * - 1222: Lock request timeout
 * - -2: Query timeout
 * - 40613: Database unavailable (Azure)
 * - 40197: Service error during failover (Azure)
 * - 40501: Service is busy (Azure)
 * - 10928: Resource limit reached (Azure)
 * - 10929: Resource limit reached (Azure)
 */
const RETRYABLE_ERROR_NUMBERS = new Set([
  1205, // Deadlock
  1222, // Lock timeout
  -2, // Query timeout
  40613, // Database offline (Azure)
  40197, // Failover in progress (Azure)
  40501, // Service busy (Azure)
  10928, // Resource limit (Azure)
  10929, // Resource limit (Azure)
]);

/**
 * Checks if an error is retryable based on SQL Server error numbers and error types.
 *
 * @param error - The error to check
 * @returns True if the error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  // Check if it's a SqlServerError with retryable flag
  if (error instanceof SqlServerError) {
    // First check the retryable flag on the error
    if (error.retryable) {
      return true;
    }

    // Check error number against known retryable codes
    if (error.errorNumber && RETRYABLE_ERROR_NUMBERS.has(error.errorNumber)) {
      return true;
    }

    // Check specific error types
    if (
      error instanceof DeadlockDetectedError ||
      error instanceof LockTimeoutError ||
      error instanceof QueryTimeoutError ||
      error instanceof SnapshotIsolationConflictError ||
      error instanceof ConnectionFailedError ||
      error instanceof NetworkError ||
      error instanceof AcquireTimeoutError ||
      error instanceof PoolExhaustedError
    ) {
      return true;
    }
  }

  // Check for network-level errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('etimedout') ||
      message.includes('econnreset') ||
      message.includes('epipe') ||
      message.includes('socket hang up')
    );
  }

  return false;
}

/**
 * Checks if an error is specifically a deadlock error.
 *
 * @param error - The error to check
 * @returns True if the error is a deadlock
 */
export function isDeadlockError(error: unknown): boolean {
  if (error instanceof DeadlockDetectedError) {
    return true;
  }

  if (error instanceof SqlServerError && error.errorNumber === 1205) {
    return true;
  }

  return false;
}

/**
 * Checks if an error is a lock timeout error.
 *
 * @param error - The error to check
 * @returns True if the error is a lock timeout
 */
export function isLockTimeoutError(error: unknown): boolean {
  if (error instanceof LockTimeoutError) {
    return true;
  }

  if (error instanceof SqlServerError && error.errorNumber === 1222) {
    return true;
  }

  return false;
}

// ============================================================================
// Backoff Calculation
// ============================================================================

/**
 * Calculates exponential backoff delay with jitter.
 *
 * Formula: min(maxDelayMs, baseDelayMs * 2^(attempt-1)) * (1 + random * jitterFactor)
 *
 * @param attempt - Current attempt number (1-based)
 * @param policy - Retry policy configuration
 * @returns Delay in milliseconds
 *
 * @example
 * ```typescript
 * const delay1 = calculateBackoff(1, DefaultRetryPolicy); // ~100-200ms
 * const delay2 = calculateBackoff(2, DefaultRetryPolicy); // ~200-400ms
 * const delay3 = calculateBackoff(3, DefaultRetryPolicy); // ~400-800ms
 * ```
 */
export function calculateBackoff(attempt: number, policy: RetryPolicy): number {
  // Exponential backoff: baseDelay * 2^(attempt-1)
  const exponentialDelay = policy.baseDelayMs * Math.pow(2, attempt - 1);

  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, policy.maxDelayMs);

  // Add jitter: multiply by (1 + random * jitterFactor)
  // This spreads retry attempts over time to avoid thundering herd
  const jitter = 1 + Math.random() * policy.jitterFactor;
  const delayWithJitter = cappedDelay * jitter;

  return Math.floor(delayWithJitter);
}

/**
 * Sleeps for the specified duration.
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Retry Execution
// ============================================================================

/**
 * Context for retry attempts, passed to the operation function.
 */
export interface RetryContext {
  /** Current attempt number (1-based) */
  attempt: number;
  /** Total number of attempts allowed */
  maxAttempts: number;
  /** Whether this is the last attempt */
  isLastAttempt: boolean;
  /** Errors from previous attempts */
  previousErrors: unknown[];
}

/**
 * Executes an async operation with retry logic.
 *
 * @template T - Return type of the operation
 * @param operation - Async function to execute
 * @param policy - Retry policy configuration
 * @param observability - Observability container for logging
 * @param operationName - Name of the operation for logging purposes
 * @returns Result of the operation
 * @throws The last error encountered if all retries are exhausted
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   async () => {
 *     return await client.execute('SELECT * FROM users WHERE id = @id', { id: 1 });
 *   },
 *   DefaultRetryPolicy,
 *   observability,
 *   'fetch_user'
 * );
 * ```
 */
export async function withRetry<T>(
  operation: (context: RetryContext) => Promise<T>,
  policy: RetryPolicy,
  observability: Observability,
  operationName?: string
): Promise<T> {
  const errors: unknown[] = [];
  const opName = operationName || 'operation';

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    const context: RetryContext = {
      attempt,
      maxAttempts: policy.maxAttempts,
      isLastAttempt: attempt === policy.maxAttempts,
      previousErrors: [...errors],
    };

    try {
      observability.logger.debug(`Executing ${opName}`, {
        attempt,
        maxAttempts: policy.maxAttempts,
      });

      const result = await operation(context);

      // Success - log if we had previous failures
      if (attempt > 1) {
        observability.logger.info(`${opName} succeeded after retry`, {
          attempt,
          totalAttempts: attempt,
        });
      }

      return result;
    } catch (error) {
      errors.push(error);

      // Determine if we should retry
      const shouldRetry =
        attempt < policy.maxAttempts &&
        (policy.isRetryable ? policy.isRetryable(error) : isRetryableError(error));

      if (!shouldRetry) {
        // Log final failure
        observability.logger.error(`${opName} failed`, {
          attempt,
          totalAttempts: attempt,
          error: error instanceof Error ? error.message : String(error),
          retryable: false,
        });

        throw error;
      }

      // Calculate backoff delay
      const delayMs = calculateBackoff(attempt, policy);

      // Log retry attempt
      observability.logger.warn(`${opName} failed, retrying`, {
        attempt,
        maxAttempts: policy.maxAttempts,
        error: error instanceof Error ? error.message : String(error),
        errorType: getErrorType(error),
        delayMs,
      });

      // Sleep before retry
      await sleep(delayMs);
    }
  }

  // This should never be reached due to the throw in the catch block
  // but TypeScript doesn't know that
  throw errors[errors.length - 1];
}

/**
 * Executes an async operation with retry logic, using a simplified callback.
 *
 * @template T - Return type of the operation
 * @param operation - Async function to execute (no context parameter)
 * @param policy - Retry policy configuration
 * @param observability - Observability container for logging
 * @param operationName - Name of the operation for logging purposes
 * @returns Result of the operation
 * @throws The last error encountered if all retries are exhausted
 *
 * @example
 * ```typescript
 * const result = await withRetrySimple(
 *   async () => await client.execute('SELECT 1'),
 *   DefaultRetryPolicy,
 *   observability,
 *   'health_check'
 * );
 * ```
 */
export async function withRetrySimple<T>(
  operation: () => Promise<T>,
  policy: RetryPolicy,
  observability: Observability,
  operationName?: string
): Promise<T> {
  return withRetry(async (_context) => operation(), policy, observability, operationName);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Gets a human-readable error type name for logging.
 *
 * @param error - The error to classify
 * @returns Error type name
 */
function getErrorType(error: unknown): string {
  if (error instanceof DeadlockDetectedError) {
    return 'deadlock';
  }
  if (error instanceof LockTimeoutError) {
    return 'lock_timeout';
  }
  if (error instanceof QueryTimeoutError) {
    return 'query_timeout';
  }
  if (error instanceof ConnectionFailedError) {
    return 'connection_failed';
  }
  if (error instanceof NetworkError) {
    return 'network_error';
  }
  if (error instanceof AcquireTimeoutError) {
    return 'acquire_timeout';
  }
  if (error instanceof PoolExhaustedError) {
    return 'pool_exhausted';
  }
  if (error instanceof SnapshotIsolationConflictError) {
    return 'snapshot_conflict';
  }
  if (error instanceof SqlServerError) {
    return error.code.toLowerCase();
  }
  if (error instanceof Error) {
    return error.constructor.name;
  }
  return 'unknown';
}

/**
 * Gets the delay hint from an error, if available.
 *
 * Some errors (particularly Azure throttling errors) may include a
 * recommended retry-after delay.
 *
 * @param error - The error to check
 * @returns Delay in milliseconds, or undefined if not specified
 */
export function getRetryAfterMs(error: unknown): number | undefined {
  if (error instanceof SqlServerError) {
    return error.retryAfterMs;
  }
  return undefined;
}

/**
 * Creates a custom retry policy.
 *
 * @param options - Partial retry policy options
 * @returns Complete retry policy
 *
 * @example
 * ```typescript
 * const aggressiveRetry = createRetryPolicy({
 *   maxAttempts: 5,
 *   baseDelayMs: 50,
 * });
 * ```
 */
export function createRetryPolicy(options: Partial<RetryPolicy>): RetryPolicy {
  return {
    ...DefaultRetryPolicy,
    ...options,
  };
}
