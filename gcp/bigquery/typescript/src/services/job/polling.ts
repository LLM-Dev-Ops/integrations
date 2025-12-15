/**
 * Job Polling Utilities
 *
 * Utilities for polling job status until completion with exponential backoff.
 */

import { Job } from "../../types/job.js";
import { JobError } from "../../error/index.js";
import { WaitOptions, JobCompletionResult } from "./types.js";

/**
 * Default polling interval in milliseconds.
 */
const DEFAULT_POLLING_INTERVAL_MS = 1000;

/**
 * Default timeout in milliseconds (10 minutes).
 */
const DEFAULT_TIMEOUT_MS = 600000;

/**
 * Maximum polling interval in milliseconds (30 seconds).
 */
const MAX_POLLING_INTERVAL_MS = 30000;

/**
 * Backoff multiplier for exponential backoff.
 */
const BACKOFF_MULTIPLIER = 1.5;

/**
 * Calculate the next backoff delay using exponential backoff.
 *
 * @param attempt - Current attempt number (0-based)
 * @param baseMs - Base delay in milliseconds
 * @param maxMs - Maximum delay in milliseconds
 * @returns Delay in milliseconds
 */
export function calculateBackoff(attempt: number, baseMs: number, maxMs: number): number {
  const delay = baseMs * Math.pow(BACKOFF_MULTIPLIER, attempt);
  return Math.min(delay, maxMs);
}

/**
 * Sleep for a specified duration.
 *
 * @param ms - Duration in milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll a function until a job completes with exponential backoff.
 *
 * @param checkFn - Function that checks job status
 * @param options - Wait options
 * @returns Job completion result
 * @throws JobError if job fails or timeout is reached
 */
export async function pollUntilDone(
  checkFn: () => Promise<Job>,
  options?: WaitOptions
): Promise<JobCompletionResult> {
  const pollingInterval = options?.pollingIntervalMs ?? DEFAULT_POLLING_INTERVAL_MS;
  const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const startTime = Date.now();
  let pollCount = 0;
  let currentInterval = pollingInterval;

  while (true) {
    // Check if timeout exceeded
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeout) {
      throw new JobError(
        `Job polling timeout after ${timeout}ms`,
        "Timeout",
        { retryable: false }
      );
    }

    // Poll job status
    const job = await checkFn();
    pollCount++;

    // Check job state
    if (job.status.state === "DONE") {
      // Check for job errors
      if (job.status.errorResult) {
        throw new JobError(
          `Job failed: ${job.status.errorResult.message}`,
          "Failed",
          {
            jobId: job.jobReference.jobId,
            retryable: false,
          }
        );
      }

      // Job completed successfully
      return {
        job,
        durationMs: Date.now() - startTime,
        pollCount,
      };
    }

    // Job still running, wait before next poll
    const nextInterval = calculateBackoff(pollCount - 1, pollingInterval, MAX_POLLING_INTERVAL_MS);
    currentInterval = nextInterval;

    // Don't wait longer than remaining timeout
    const remainingTimeout = timeout - (Date.now() - startTime);
    const waitTime = Math.min(currentInterval, remainingTimeout);

    if (waitTime > 0) {
      await sleep(waitTime);
    }
  }
}

/**
 * Poll multiple jobs until all complete.
 *
 * @param checkFns - Functions that check job status
 * @param options - Wait options
 * @returns Array of job completion results
 */
export async function pollMultipleUntilDone(
  checkFns: Array<() => Promise<Job>>,
  options?: WaitOptions
): Promise<JobCompletionResult[]> {
  const promises = checkFns.map((fn) => pollUntilDone(fn, options));
  return Promise.all(promises);
}

/**
 * Poll a job with cancellation support.
 *
 * @param checkFn - Function that checks job status
 * @param cancelFn - Function to cancel the job
 * @param options - Wait options
 * @returns Job completion result
 */
export async function pollWithCancellation(
  checkFn: () => Promise<Job>,
  cancelFn: () => Promise<void>,
  options?: WaitOptions
): Promise<JobCompletionResult> {
  const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startTime = Date.now();

  try {
    return await pollUntilDone(checkFn, options);
  } catch (error) {
    // If we timeout, try to cancel the job
    if (error instanceof JobError && error.code === "Job.Timeout") {
      const elapsed = Date.now() - startTime;
      try {
        await cancelFn();
      } catch (cancelError) {
        // Ignore cancellation errors
      }
      throw new JobError(
        `Job polling timeout after ${elapsed}ms (job cancelled)`,
        "Timeout",
        { retryable: false }
      );
    }
    throw error;
  }
}
