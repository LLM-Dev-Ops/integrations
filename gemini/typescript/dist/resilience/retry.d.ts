/**
 * Retry executor with exponential backoff and jitter.
 */
import type { RetryConfig } from '../config/index.js';
/**
 * Executes operations with retry logic, exponential backoff, and jitter.
 */
export declare class RetryExecutor {
    private readonly config;
    constructor(config?: RetryConfig);
    /**
     * Execute an operation with retry logic.
     *
     * @param operation - The async operation to execute
     * @param isRetryable - Function to determine if an error is retryable
     * @param getRetryAfter - Function to extract retry-after delay from error (in seconds)
     * @returns The result of the operation
     * @throws The error if all retries are exhausted or error is not retryable
     */
    execute<T>(operation: () => Promise<T>, isRetryable: (error: unknown) => boolean, getRetryAfter?: (error: unknown) => number | undefined): Promise<T>;
    /**
     * Add jitter to a delay value to prevent thundering herd.
     *
     * @param ms - Base delay in milliseconds
     * @returns Delay with jitter applied
     */
    private addJitter;
    /**
     * Sleep for specified milliseconds.
     *
     * @param ms - Milliseconds to sleep
     */
    private sleep;
}
//# sourceMappingURL=retry.d.ts.map