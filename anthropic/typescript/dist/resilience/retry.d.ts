/**
 * Retry executor with exponential backoff and jitter
 */
import { RetryConfig, RetryHook } from './types.js';
/**
 * Executes operations with retry logic and exponential backoff
 */
export declare class RetryExecutor {
    private config;
    private hooks;
    constructor(config: RetryConfig);
    /**
     * Add a hook to be called on retry attempts
     */
    addHook(hook: RetryHook): void;
    /**
     * Execute an operation with retry logic
     * @param operation - The async operation to execute
     * @returns The result of the operation
     * @throws The last error if all retries are exhausted
     */
    execute<T>(operation: () => Promise<T>): Promise<T>;
    /**
     * Check if an error is retryable
     */
    private isRetryable;
    /**
     * Calculate the delay for a given retry attempt using exponential backoff with jitter
     * @param attempt - The current attempt number (1-indexed)
     * @returns Delay in milliseconds
     */
    private calculateDelay;
    /**
     * Sleep for a specified duration
     */
    private sleep;
}
/**
 * Create a default retry configuration
 */
export declare function createDefaultRetryConfig(): RetryConfig;
//# sourceMappingURL=retry.d.ts.map