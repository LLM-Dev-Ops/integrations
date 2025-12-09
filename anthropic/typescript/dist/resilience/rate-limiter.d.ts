/**
 * Token bucket rate limiter implementation
 */
import { RateLimiterConfig, RateLimitHook } from './types.js';
/**
 * Token bucket rate limiter that controls request throughput
 *
 * Uses the token bucket algorithm:
 * - Tokens are added at a constant rate (requestsPerSecond)
 * - Each request consumes one token
 * - Bucket has a maximum capacity (burstSize)
 * - Requests wait if no tokens are available
 */
export declare class RateLimiter {
    private tokens;
    private lastRefill;
    private config;
    private hooks;
    constructor(config: RateLimiterConfig);
    /**
     * Add a hook to be called when rate limited
     */
    addHook(hook: RateLimitHook): void;
    /**
     * Acquire a token to make a request
     * Waits if no tokens are available
     */
    acquire(): Promise<void>;
    /**
     * Refill tokens based on elapsed time
     */
    private refill;
    /**
     * Calculate how long to wait for a token to become available
     */
    private calculateWaitTime;
    /**
     * Sleep for a specified duration
     */
    private sleep;
    /**
     * Get the current number of available tokens
     */
    getAvailableTokens(): number;
    /**
     * Reset the rate limiter to full capacity
     */
    reset(): void;
}
/**
 * Create a default rate limiter configuration
 */
export declare function createDefaultRateLimiterConfig(): RateLimiterConfig;
//# sourceMappingURL=rate-limiter.d.ts.map