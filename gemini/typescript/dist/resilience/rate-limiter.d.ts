/**
 * Rate limiter implementation using token bucket algorithm.
 */
import type { RateLimitConfig } from '../config/index.js';
/**
 * Rate limiter to prevent exceeding API rate limits.
 */
export declare class RateLimiter {
    private readonly config;
    private requestTokens;
    private tokenBudget;
    private lastRequestRefill;
    private lastTokenRefill;
    constructor(config: RateLimitConfig);
    /**
     * Acquire permission to make a request.
     *
     * @param estimatedTokens - Estimated tokens for this request (optional)
     * @returns Promise that resolves when permission is granted
     */
    acquire(estimatedTokens?: number): Promise<void>;
    /**
     * Acquire a request token.
     */
    private acquireRequestToken;
    /**
     * Acquire token budget.
     */
    private acquireTokenBudget;
    /**
     * Refill request tokens based on elapsed time.
     */
    private refillRequestTokens;
    /**
     * Refill token budget based on elapsed time.
     */
    private refillTokenBudget;
    /**
     * Sleep for specified milliseconds.
     */
    private sleep;
    /**
     * Get current rate limiter state.
     */
    getState(): {
        requestTokens: number;
        tokenBudget: number | undefined;
        requestsPerMinute: number;
        tokensPerMinute: number | undefined;
    };
    /**
     * Reset rate limiter to initial state.
     */
    reset(): void;
}
//# sourceMappingURL=rate-limiter.d.ts.map