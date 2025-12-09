import type { CacheControl, SystemPromptWithCache, CacheUsage } from './types.js';
import type { Usage } from '../messages/types.js';
/**
 * Creates a cache control object for ephemeral caching
 * @returns CacheControl object
 */
export declare function createCacheControl(): CacheControl;
/**
 * Creates a system prompt with cache control
 * @param text - The system prompt text
 * @returns System prompt with cache control enabled
 */
export declare function createCacheableSystemPrompt(text: string): SystemPromptWithCache;
/**
 * Creates multiple system prompts with caching on the last one
 * This follows best practices for prompt caching where only the last
 * system message should have cache_control
 * @param prompts - Array of system prompt texts
 * @returns Array of system prompts with caching on the last one
 */
export declare function createCacheableSystemPrompts(prompts: string[]): SystemPromptWithCache[];
/**
 * Type guard to check if usage object contains cache information
 * @param usage - Usage object from API response
 * @returns True if usage contains cache information
 */
export declare function hasCacheUsage(usage: unknown): usage is Usage & CacheUsage;
/**
 * Calculates cache efficiency (ratio of cache reads to total cache activity)
 * @param usage - Usage object with cache information
 * @returns Efficiency ratio between 0 and 1 (0 = no cache hits, 1 = all cache hits)
 */
export declare function getCacheEfficiency(usage: CacheUsage): number;
/**
 * Calculates total tokens saved by caching
 * Cache reads cost 10% of regular tokens, so we calculate the savings
 * @param usage - Usage object with cache information
 * @returns Number of tokens saved by using caching
 */
export declare function calculateTokensSaved(usage: CacheUsage): number;
/**
 * Calculates estimated cost savings from caching
 * @param usage - Usage object with cache information
 * @param tokenCostPer1M - Cost per million tokens (default: 3.0 for Claude 3.5 Sonnet input)
 * @returns Estimated cost saved in dollars
 */
export declare function calculateCostSavings(usage: CacheUsage, tokenCostPer1M?: number): number;
/**
 * Gets cache statistics from usage
 * @param usage - Usage object from API response
 * @returns Object with cache statistics or null if no cache info available
 */
export declare function getCacheStats(usage: Usage): {
    cacheCreation: number;
    cacheReads: number;
    cacheHitRate: number;
    tokensSaved: number;
    efficiency: number;
} | null;
/**
 * Checks if caching is being used effectively
 * Effective means cache reads are at least 50% of total cached tokens
 * @param usage - Usage object with cache information
 * @returns True if caching is effective
 */
export declare function isCachingEffective(usage: CacheUsage): boolean;
//# sourceMappingURL=prompt-caching.d.ts.map