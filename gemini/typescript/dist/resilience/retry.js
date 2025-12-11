/**
 * Retry executor with exponential backoff and jitter.
 */
import { DEFAULT_RETRY_CONFIG } from '../config/index.js';
/**
 * Executes operations with retry logic, exponential backoff, and jitter.
 */
export class RetryExecutor {
    config;
    constructor(config = DEFAULT_RETRY_CONFIG) {
        this.config = config;
    }
    /**
     * Execute an operation with retry logic.
     *
     * @param operation - The async operation to execute
     * @param isRetryable - Function to determine if an error is retryable
     * @param getRetryAfter - Function to extract retry-after delay from error (in seconds)
     * @returns The result of the operation
     * @throws The error if all retries are exhausted or error is not retryable
     */
    async execute(operation, isRetryable, getRetryAfter) {
        let attempts = 0;
        let delayMs = this.config.initialDelay;
        while (true) {
            try {
                return await operation();
            }
            catch (error) {
                attempts++;
                // Check if we should retry
                if (!isRetryable(error) || attempts >= this.config.maxAttempts) {
                    throw error;
                }
                // Calculate wait time
                // Use retry-after if provided (convert from seconds to ms), otherwise use exponential backoff
                const retryAfterSeconds = getRetryAfter?.(error);
                const waitMs = retryAfterSeconds !== undefined
                    ? retryAfterSeconds * 1000
                    : delayMs;
                const jitteredWait = this.addJitter(waitMs);
                // Wait before retrying
                await this.sleep(jitteredWait);
                // Update delay for next attempt (exponential backoff)
                delayMs = Math.min(delayMs * this.config.multiplier, this.config.maxDelay);
            }
        }
    }
    /**
     * Add jitter to a delay value to prevent thundering herd.
     *
     * @param ms - Base delay in milliseconds
     * @returns Delay with jitter applied
     */
    addJitter(ms) {
        const jitterRange = ms * this.config.jitter;
        const jitter = (Math.random() * 2 - 1) * jitterRange;
        return Math.max(0, ms + jitter);
    }
    /**
     * Sleep for specified milliseconds.
     *
     * @param ms - Milliseconds to sleep
     */
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
//# sourceMappingURL=retry.js.map