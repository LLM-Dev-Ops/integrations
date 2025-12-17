/**
 * Retry logic with exponential backoff for HubSpot API
 * Implements intelligent retry strategies based on error types
 */

import type { HttpError } from './client.js';

/**
 * Maximum backoff delay in milliseconds (30 seconds)
 */
const MAX_BACKOFF_MS = 30000;

/**
 * Base delay for exponential backoff (1 second)
 */
const BASE_DELAY_MS = 1000;

/**
 * Jitter percentage (30% of calculated delay)
 */
const JITTER_PERCENTAGE = 0.3;

/**
 * Determine if a request should be retried based on the error and attempt number
 *
 * Retry logic:
 * - Retry on 429 (rate limit)
 * - Retry on 5xx (server errors)
 * - Retry on network errors (ECONNRESET, ETIMEDOUT)
 * - Don't retry on 400 (bad request)
 * - Don't retry on 401 (unauthorized)
 * - Don't retry on 404 (not found)
 *
 * @param error - The HTTP error that occurred
 * @param attempt - Current attempt number (1-based)
 * @returns true if the request should be retried
 */
export function shouldRetry(error: HttpError | null, attempt: number): boolean {
  if (!error) {
    return false;
  }

  // Don't retry validation errors (400)
  if (error.statusCode === 400) {
    return false;
  }

  // Don't retry authentication errors (401)
  // (Token refresh should be handled separately)
  if (error.statusCode === 401) {
    return false;
  }

  // Don't retry not found errors (404)
  if (error.statusCode === 404) {
    return false;
  }

  // Retry rate limit errors (429)
  if (error.statusCode === 429) {
    return true;
  }

  // Retry server errors (5xx)
  if (error.statusCode && error.statusCode >= 500) {
    return true;
  }

  // Retry network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
    return true;
  }

  // Retry connection refused errors
  if (error.code === 'ECONNREFUSED') {
    return true;
  }

  // Don't retry other errors
  return false;
}

/**
 * Calculate backoff delay with exponential backoff and jitter
 *
 * Strategy:
 * 1. Check for Retry-After header and respect it
 * 2. Use exponential backoff: 1s, 2s, 4s, 8s, etc.
 * 3. Add random jitter to prevent thundering herd
 * 4. Cap at maximum delay
 *
 * @param error - The HTTP error that occurred
 * @param attempt - Current attempt number (1-based)
 * @returns Delay in milliseconds before next retry
 */
export function calculateBackoff(
  error: HttpError | null,
  attempt: number
): number {
  // Use Retry-After header if present
  if (error?.headers?.['retry-after']) {
    const retryAfter = error.headers['retry-after'];

    // Retry-After can be in seconds (number) or HTTP date
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000; // Convert to milliseconds
    }

    // Try parsing as HTTP date
    const date = new Date(retryAfter);
    if (!isNaN(date.getTime())) {
      const delay = date.getTime() - Date.now();
      return Math.max(0, delay);
    }
  }

  // Exponential backoff: baseDelay * 2^(attempt - 1)
  // Attempt 1: 1s, Attempt 2: 2s, Attempt 3: 4s, etc.
  const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt - 1);

  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, MAX_BACKOFF_MS);

  // Add jitter: random value between 0% and 30% of delay
  const jitter = Math.random() * JITTER_PERCENTAGE * cappedDelay;

  return Math.round(cappedDelay + jitter);
}

/**
 * Parse Retry-After header value
 *
 * The Retry-After header can contain either:
 * - Number of seconds (e.g., "120")
 * - HTTP date (e.g., "Wed, 21 Oct 2015 07:28:00 GMT")
 *
 * @param retryAfter - Retry-After header value
 * @returns Delay in milliseconds, or null if invalid
 */
export function parseRetryAfter(retryAfter: string): number | null {
  // Try parsing as seconds
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  // Try parsing as HTTP date
  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) {
    const delay = date.getTime() - Date.now();
    return Math.max(0, delay);
  }

  return null;
}
