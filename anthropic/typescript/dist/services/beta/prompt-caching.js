/**
 * Creates a cache control object for ephemeral caching
 * @returns CacheControl object
 */
export function createCacheControl() {
    return { type: 'ephemeral' };
}
/**
 * Creates a system prompt with cache control
 * @param text - The system prompt text
 * @returns System prompt with cache control enabled
 */
export function createCacheableSystemPrompt(text) {
    if (!text || text.trim().length === 0) {
        throw new Error('System prompt text cannot be empty');
    }
    return {
        text,
        cache_control: createCacheControl(),
    };
}
/**
 * Creates multiple system prompts with caching on the last one
 * This follows best practices for prompt caching where only the last
 * system message should have cache_control
 * @param prompts - Array of system prompt texts
 * @returns Array of system prompts with caching on the last one
 */
export function createCacheableSystemPrompts(prompts) {
    if (!prompts || prompts.length === 0) {
        throw new Error('At least one system prompt is required');
    }
    return prompts.map((text, index) => {
        const isLast = index === prompts.length - 1;
        return {
            text,
            ...(isLast ? { cache_control: createCacheControl() } : {}),
        };
    });
}
/**
 * Type guard to check if usage object contains cache information
 * @param usage - Usage object from API response
 * @returns True if usage contains cache information
 */
export function hasCacheUsage(usage) {
    return (typeof usage === 'object' &&
        usage !== null &&
        'cache_creation_input_tokens' in usage &&
        'cache_read_input_tokens' in usage);
}
/**
 * Calculates cache efficiency (ratio of cache reads to total cache activity)
 * @param usage - Usage object with cache information
 * @returns Efficiency ratio between 0 and 1 (0 = no cache hits, 1 = all cache hits)
 */
export function getCacheEfficiency(usage) {
    const totalCached = usage.cache_creation_input_tokens + usage.cache_read_input_tokens;
    if (totalCached === 0)
        return 0;
    return usage.cache_read_input_tokens / totalCached;
}
/**
 * Calculates total tokens saved by caching
 * Cache reads cost 10% of regular tokens, so we calculate the savings
 * @param usage - Usage object with cache information
 * @returns Number of tokens saved by using caching
 */
export function calculateTokensSaved(usage) {
    // Cache reads cost 10% of normal tokens, so we save 90%
    return Math.floor(usage.cache_read_input_tokens * 0.9);
}
/**
 * Calculates estimated cost savings from caching
 * @param usage - Usage object with cache information
 * @param tokenCostPer1M - Cost per million tokens (default: 3.0 for Claude 3.5 Sonnet input)
 * @returns Estimated cost saved in dollars
 */
export function calculateCostSavings(usage, tokenCostPer1M = 3.0) {
    const tokensSaved = calculateTokensSaved(usage);
    return (tokensSaved / 1_000_000) * tokenCostPer1M;
}
/**
 * Gets cache statistics from usage
 * @param usage - Usage object from API response
 * @returns Object with cache statistics or null if no cache info available
 */
export function getCacheStats(usage) {
    if (!hasCacheUsage(usage)) {
        return null;
    }
    const cacheUsage = {
        cache_creation_input_tokens: usage.cache_creation_input_tokens,
        cache_read_input_tokens: usage.cache_read_input_tokens,
    };
    const total = usage.cache_creation_input_tokens + usage.cache_read_input_tokens;
    return {
        cacheCreation: usage.cache_creation_input_tokens,
        cacheReads: usage.cache_read_input_tokens,
        cacheHitRate: total > 0 ? usage.cache_read_input_tokens / total : 0,
        tokensSaved: calculateTokensSaved(cacheUsage),
        efficiency: getCacheEfficiency(cacheUsage),
    };
}
/**
 * Checks if caching is being used effectively
 * Effective means cache reads are at least 50% of total cached tokens
 * @param usage - Usage object with cache information
 * @returns True if caching is effective
 */
export function isCachingEffective(usage) {
    return getCacheEfficiency(usage) >= 0.5;
}
//# sourceMappingURL=prompt-caching.js.map