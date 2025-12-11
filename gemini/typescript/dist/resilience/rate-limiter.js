/**
 * Rate limiter implementation using token bucket algorithm.
 */
/**
 * Rate limiter to prevent exceeding API rate limits.
 */
export class RateLimiter {
    config;
    requestTokens;
    tokenBudget;
    lastRequestRefill;
    lastTokenRefill;
    constructor(config) {
        this.config = config;
        this.requestTokens = config.requestsPerMinute;
        this.tokenBudget = config.tokensPerMinute;
        this.lastRequestRefill = Date.now();
        this.lastTokenRefill = Date.now();
    }
    /**
     * Acquire permission to make a request.
     *
     * @param estimatedTokens - Estimated tokens for this request (optional)
     * @returns Promise that resolves when permission is granted
     */
    async acquire(estimatedTokens) {
        await this.acquireRequestToken();
        if (estimatedTokens !== undefined && this.tokenBudget !== undefined) {
            await this.acquireTokenBudget(estimatedTokens);
        }
    }
    /**
     * Acquire a request token.
     */
    async acquireRequestToken() {
        this.refillRequestTokens();
        if (this.requestTokens <= 0) {
            const waitMs = 60000 - (Date.now() - this.lastRequestRefill);
            if (waitMs > 0) {
                await this.sleep(waitMs);
                this.refillRequestTokens();
            }
        }
        this.requestTokens--;
    }
    /**
     * Acquire token budget.
     */
    async acquireTokenBudget(tokens) {
        if (this.tokenBudget === undefined) {
            return;
        }
        this.refillTokenBudget();
        if (this.tokenBudget < tokens) {
            const waitMs = 60000 - (Date.now() - this.lastTokenRefill);
            if (waitMs > 0) {
                await this.sleep(waitMs);
                this.refillTokenBudget();
            }
        }
        this.tokenBudget -= tokens;
    }
    /**
     * Refill request tokens based on elapsed time.
     */
    refillRequestTokens() {
        const now = Date.now();
        const elapsed = now - this.lastRequestRefill;
        if (elapsed >= 60000) {
            this.requestTokens = this.config.requestsPerMinute;
            this.lastRequestRefill = now;
        }
    }
    /**
     * Refill token budget based on elapsed time.
     */
    refillTokenBudget() {
        if (this.config.tokensPerMinute === undefined) {
            return;
        }
        const now = Date.now();
        const elapsed = now - this.lastTokenRefill;
        if (elapsed >= 60000) {
            this.tokenBudget = this.config.tokensPerMinute;
            this.lastTokenRefill = now;
        }
    }
    /**
     * Sleep for specified milliseconds.
     */
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    /**
     * Get current rate limiter state.
     */
    getState() {
        this.refillRequestTokens();
        this.refillTokenBudget();
        return {
            requestTokens: this.requestTokens,
            tokenBudget: this.tokenBudget,
            requestsPerMinute: this.config.requestsPerMinute,
            tokensPerMinute: this.config.tokensPerMinute,
        };
    }
    /**
     * Reset rate limiter to initial state.
     */
    reset() {
        this.requestTokens = this.config.requestsPerMinute;
        this.tokenBudget = this.config.tokensPerMinute;
        this.lastRequestRefill = Date.now();
        this.lastTokenRefill = Date.now();
    }
}
//# sourceMappingURL=rate-limiter.js.map