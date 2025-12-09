/**
 * Token bucket rate limiter implementation
 */
/**
 * Token bucket rate limiter that controls request throughput
 *
 * Uses the token bucket algorithm:
 * - Tokens are added at a constant rate (requestsPerSecond)
 * - Each request consumes one token
 * - Bucket has a maximum capacity (burstSize)
 * - Requests wait if no tokens are available
 */
export class RateLimiter {
    tokens;
    lastRefill;
    config;
    hooks = [];
    constructor(config) {
        this.config = config;
        this.tokens = config.burstSize;
        this.lastRefill = Date.now();
    }
    /**
     * Add a hook to be called when rate limited
     */
    addHook(hook) {
        this.hooks.push(hook);
    }
    /**
     * Acquire a token to make a request
     * Waits if no tokens are available
     */
    async acquire() {
        this.refill();
        if (this.tokens >= 1) {
            this.tokens -= 1;
            return;
        }
        // Need to wait for tokens
        const waitTime = this.calculateWaitTime();
        // Notify hooks
        this.hooks.forEach(hook => hook.onRateLimited(waitTime));
        await this.sleep(waitTime);
        // Refill and consume token
        this.refill();
        this.tokens -= 1;
    }
    /**
     * Refill tokens based on elapsed time
     */
    refill() {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 1000; // Convert to seconds
        const tokensToAdd = elapsed * this.config.requestsPerSecond;
        this.tokens = Math.min(this.config.burstSize, this.tokens + tokensToAdd);
        this.lastRefill = now;
    }
    /**
     * Calculate how long to wait for a token to become available
     */
    calculateWaitTime() {
        const tokensNeeded = 1 - this.tokens;
        return Math.ceil((tokensNeeded / this.config.requestsPerSecond) * 1000);
    }
    /**
     * Sleep for a specified duration
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Get the current number of available tokens
     */
    getAvailableTokens() {
        this.refill();
        return this.tokens;
    }
    /**
     * Reset the rate limiter to full capacity
     */
    reset() {
        this.tokens = this.config.burstSize;
        this.lastRefill = Date.now();
    }
}
/**
 * Create a default rate limiter configuration
 */
export function createDefaultRateLimiterConfig() {
    return {
        requestsPerSecond: 10,
        burstSize: 20,
    };
}
//# sourceMappingURL=rate-limiter.js.map