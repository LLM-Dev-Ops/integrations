/**
 * Batch-specific retry logic and utilities.
 */

import type {
  BatchObject,
  BatchError,
  BatchResponse,
  BatchObjectResult,
} from '../types/batch.js';
import {
  RateLimitedError,
  ServiceUnavailableError,
  TimeoutError,
  ConnectionError,
  InternalError,
  InvalidObjectError,
  InvalidVectorError,
  ObjectNotFoundError,
  ClassNotFoundError,
} from '../errors/types.js';

/**
 * Determine if a batch error is retriable
 *
 * Retry on:
 * - Timeout errors
 * - Connection errors
 * - Rate limit errors (429)
 * - Service unavailable (503)
 * - Internal server errors (500)
 *
 * Don't retry on:
 * - Validation errors (invalid object, vector dimension mismatch)
 * - Not found errors (class/object doesn't exist)
 * - Authentication errors
 *
 * @param error - The error to check
 * @returns True if the error is retriable
 */
export function isRetriableBatchError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  // Check specific error types
  if (
    error instanceof RateLimitedError ||
    error instanceof ServiceUnavailableError ||
    error instanceof TimeoutError ||
    error instanceof ConnectionError ||
    error instanceof InternalError
  ) {
    return true;
  }

  // Non-retriable errors
  if (
    error instanceof InvalidObjectError ||
    error instanceof InvalidVectorError ||
    error instanceof ObjectNotFoundError ||
    error instanceof ClassNotFoundError
  ) {
    return false;
  }

  // Check by error message patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Retriable patterns
    if (
      message.includes('timeout') ||
      message.includes('temporarily unavailable') ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('connection') ||
      message.includes('econnreset') ||
      message.includes('econnrefused')
    ) {
      return true;
    }

    // Non-retriable patterns
    if (
      message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('not found') ||
      message.includes('unauthorized') ||
      message.includes('forbidden')
    ) {
      return false;
    }
  }

  // Default to non-retriable for unknown errors
  return false;
}

/**
 * Check if a batch error indicates a validation issue
 *
 * @param error - The batch error to check
 * @returns True if this is a validation error
 */
export function isValidationError(error: BatchError): boolean {
  const message = error.errorMessage.toLowerCase();
  return (
    message.includes('validation') ||
    message.includes('invalid') ||
    message.includes('dimension mismatch') ||
    message.includes('required property') ||
    message.includes('schema')
  );
}

/**
 * Extract failed objects from a batch response
 *
 * Returns the original objects that failed so they can be retried.
 *
 * @param response - Batch response with results
 * @param originalObjects - Original array of objects that were submitted
 * @returns Array of failed objects with their errors
 */
export function extractFailedObjects(
  response: BatchResponse,
  originalObjects: BatchObject[]
): Array<{ object: BatchObject; error: BatchError }> {
  if (!response.errors || response.errors.length === 0) {
    return [];
  }

  const failedObjects: Array<{ object: BatchObject; error: BatchError }> = [];

  for (const error of response.errors) {
    // Skip validation errors (non-retriable)
    if (isValidationError(error)) {
      continue;
    }

    const originalObject = originalObjects[error.index];
    if (originalObject) {
      failedObjects.push({
        object: originalObject,
        error,
      });
    }
  }

  return failedObjects;
}

/**
 * Aggregate multiple batch responses into a single response
 *
 * Combines results from multiple batch attempts (original + retries)
 * into a single aggregate response.
 *
 * @param responses - Array of batch responses to aggregate
 * @returns Aggregated batch response
 */
export function aggregateBatchResponses(
  responses: BatchResponse[]
): BatchResponse {
  if (responses.length === 0) {
    return {
      successful: 0,
      failed: 0,
      errors: [],
      results: [],
    };
  }

  let totalSuccessful = 0;
  let totalFailed = 0;
  const allErrors: BatchError[] = [];
  const allResults: BatchObjectResult[] = [];
  let totalElapsedMs = 0;

  for (const response of responses) {
    totalSuccessful += response.successful;
    totalFailed += response.failed;

    if (response.errors) {
      allErrors.push(...response.errors);
    }

    if (response.results) {
      allResults.push(...response.results);
    }

    if (response.elapsedMs) {
      totalElapsedMs += response.elapsedMs;
    }
  }

  return {
    successful: totalSuccessful,
    failed: totalFailed,
    errors: allErrors.length > 0 ? allErrors : undefined,
    results: allResults.length > 0 ? allResults : undefined,
    elapsedMs: totalElapsedMs,
  };
}

/**
 * Calculate retry delay with exponential backoff
 *
 * @param attempt - Current attempt number (1-indexed)
 * @param initialDelayMs - Initial delay in milliseconds
 * @param maxDelayMs - Maximum delay in milliseconds
 * @param multiplier - Backoff multiplier
 * @param jitter - Whether to add random jitter
 * @returns Delay in milliseconds
 */
export function calculateRetryDelay(
  attempt: number,
  initialDelayMs: number = 1000,
  maxDelayMs: number = 30000,
  multiplier: number = 2,
  jitter: boolean = true
): number {
  // Calculate exponential backoff
  const exponentialDelay = initialDelayMs * Math.pow(multiplier, attempt - 1);

  // Cap at max delay
  let delay = Math.min(exponentialDelay, maxDelayMs);

  // Add jitter (±25% of delay)
  if (jitter) {
    const jitterRange = delay * 0.25;
    const jitterAmount = Math.random() * jitterRange * 2 - jitterRange;
    delay = Math.max(0, delay + jitterAmount);
  }

  return Math.floor(delay);
}

/**
 * Group batch errors by error type
 *
 * Useful for analyzing patterns in batch failures.
 *
 * @param errors - Array of batch errors
 * @returns Map of error codes/types to errors
 */
export function groupErrorsByType(
  errors: BatchError[]
): Map<string, BatchError[]> {
  const grouped = new Map<string, BatchError[]>();

  for (const error of errors) {
    const key = error.errorCode || 'unknown';
    const existing = grouped.get(key) || [];
    existing.push(error);
    grouped.set(key, existing);
  }

  return grouped;
}

/**
 * Separate retriable and non-retriable errors
 *
 * @param errors - Array of batch errors
 * @returns Object with retriable and non-retriable errors
 */
export function separateRetriableErrors(errors: BatchError[]): {
  retriable: BatchError[];
  nonRetriable: BatchError[];
} {
  const retriable: BatchError[] = [];
  const nonRetriable: BatchError[] = [];

  for (const error of errors) {
    // Create a temporary error object to check
    const tempError = new Error(error.errorMessage);

    if (isRetriableBatchError(tempError)) {
      retriable.push(error);
    } else {
      nonRetriable.push(error);
    }
  }

  return { retriable, nonRetriable };
}
