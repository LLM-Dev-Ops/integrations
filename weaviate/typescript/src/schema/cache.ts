/**
 * Schema Cache
 *
 * Provides caching for class definitions to reduce API calls and improve performance.
 * Implements TTL-based expiration with manual invalidation support.
 *
 * @module @weaviate/schema/cache
 */

import type { ClassDefinition } from '../types/schema.js';
import type { SchemaService } from './service.js';
import { ClassNotFoundError } from '../errors/types.js';

/**
 * Cached class definition with timestamp
 */
interface CachedClass {
  /**
   * The class definition
   */
  definition: ClassDefinition;

  /**
   * Timestamp when this was cached (milliseconds since epoch)
   */
  fetchedAt: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /**
   * Number of cached entries
   */
  size: number;

  /**
   * Number of cache hits
   */
  hits: number;

  /**
   * Number of cache misses
   */
  misses: number;

  /**
   * Cache hit rate (0-1)
   */
  hitRate: number;
}

/**
 * Schema cache for storing class definitions
 *
 * Caches class definitions with configurable TTL to reduce API calls.
 * Supports manual invalidation for cases where schema changes are detected.
 *
 * @example
 * ```typescript
 * const cache = new SchemaCache(schemaService);
 *
 * // Get cached or fetch
 * const articleClass = await cache.getClass('Article');
 * console.log(`Article has ${articleClass.properties.length} properties`);
 *
 * // Second call uses cache (if within TTL)
 * const articleClass2 = await cache.getClass('Article'); // Fast!
 *
 * // Invalidate on schema change
 * cache.invalidate('Article');
 *
 * // Force fresh fetch
 * const fresh = await cache.getClass('Article'); // Fetches from API
 *
 * // Check cache stats
 * const stats = cache.getStats();
 * console.log(`Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
 * ```
 */
export class SchemaCache {
  /**
   * Map of class name to cached class definition
   */
  private readonly cache: Map<string, CachedClass> = new Map();

  /**
   * TTL in seconds (default: 5 minutes)
   */
  private readonly ttlSeconds: number;

  /**
   * Number of cache hits
   */
  private hits = 0;

  /**
   * Number of cache misses
   */
  private misses = 0;

  /**
   * Create a new schema cache
   *
   * @param schemaService - Schema service for fetching class definitions
   * @param ttlSeconds - Cache TTL in seconds (default: 300 = 5 minutes)
   *
   * @example
   * ```typescript
   * // Default 5-minute TTL
   * const cache = new SchemaCache(schemaService);
   *
   * // Custom 1-minute TTL for frequently changing schemas
   * const fastCache = new SchemaCache(schemaService, 60);
   *
   * // Long 1-hour TTL for stable schemas
   * const longCache = new SchemaCache(schemaService, 3600);
   * ```
   */
  constructor(
    private readonly schemaService: SchemaService,
    ttlSeconds: number = 300
  ) {
    this.ttlSeconds = ttlSeconds;
  }

  /**
   * Get a class definition, using cache if available
   *
   * Checks the cache first. If the class is cached and not expired, returns
   * the cached version. Otherwise, fetches from the API and caches the result.
   *
   * @param className - Name of the class to retrieve
   * @returns Promise resolving to the class definition
   * @throws {ClassNotFoundError} If the class does not exist
   *
   * @example
   * ```typescript
   * try {
   *   const classDef = await cache.getClass('Article');
   *   console.log(`Article vectorizer: ${classDef.vectorizer}`);
   * } catch (error) {
   *   if (error instanceof ClassNotFoundError) {
   *     console.log('Article class not found');
   *   }
   * }
   * ```
   */
  async getClass(className: string): Promise<ClassDefinition> {
    // Check cache
    const cached = this.cache.get(className);

    if (cached && !this.isExpired(cached)) {
      this.hits++;
      return cached.definition;
    }

    // Cache miss or expired
    this.misses++;

    // Fetch from service
    const definition = await this.schemaService.getClass(className);

    if (definition === null) {
      throw new ClassNotFoundError(className);
    }

    // Store in cache
    this.cache.set(className, {
      definition,
      fetchedAt: Date.now(),
    });

    return definition;
  }

  /**
   * Invalidate a specific class in the cache
   *
   * Removes the class from the cache, forcing the next getClass() call
   * to fetch fresh data from the API.
   *
   * Call this when you know a schema has been modified externally.
   *
   * @param className - Name of the class to invalidate
   *
   * @example
   * ```typescript
   * // After external schema modification
   * cache.invalidate('Article');
   *
   * // Next call will fetch fresh data
   * const fresh = await cache.getClass('Article');
   * ```
   */
  invalidate(className: string): void {
    this.cache.delete(className);
  }

  /**
   * Invalidate all cached classes
   *
   * Clears the entire cache, forcing all subsequent getClass() calls
   * to fetch fresh data from the API.
   *
   * Call this when you know multiple schemas have been modified or
   * want to ensure fresh data.
   *
   * @example
   * ```typescript
   * // After bulk schema modification
   * cache.invalidateAll();
   *
   * // All subsequent calls fetch fresh data
   * const article = await cache.getClass('Article');
   * const author = await cache.getClass('Author');
   * ```
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Get list of cached class names
   *
   * Returns the names of all classes currently in the cache,
   * including expired entries.
   *
   * @returns Array of cached class names
   *
   * @example
   * ```typescript
   * const cached = cache.getCachedClasses();
   * console.log(`Cached classes: ${cached.join(', ')}`);
   * ```
   */
  getCachedClasses(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache statistics
   *
   * Returns statistics about cache performance, including size,
   * hits, misses, and hit rate.
   *
   * Useful for monitoring cache effectiveness and tuning TTL.
   *
   * @returns Cache statistics object
   *
   * @example
   * ```typescript
   * const stats = cache.getStats();
   * console.log(`Cache size: ${stats.size}`);
   * console.log(`Cache hits: ${stats.hits}`);
   * console.log(`Cache misses: ${stats.misses}`);
   * console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
   *
   * // Monitor cache effectiveness
   * if (stats.hitRate < 0.5) {
   *   console.warn('Low cache hit rate - consider increasing TTL');
   * }
   * ```
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    const hitRate = total === 0 ? 0 : this.hits / total;

    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate,
    };
  }

  /**
   * Check if a cached entry is expired
   *
   * @param cached - Cached class entry
   * @returns True if the entry is expired
   */
  private isExpired(cached: CachedClass): boolean {
    const now = Date.now();
    const ageMs = now - cached.fetchedAt;
    const ttlMs = this.ttlSeconds * 1000;
    return ageMs >= ttlMs;
  }

  /**
   * Reset cache statistics
   *
   * Resets hit and miss counters to zero without clearing cached data.
   * Useful for measuring cache performance over specific periods.
   *
   * @example
   * ```typescript
   * // Start measuring
   * cache.resetStats();
   *
   * // ... perform operations ...
   *
   * // Check performance
   * const stats = cache.getStats();
   * console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
   * ```
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Remove expired entries from the cache
   *
   * Cleans up expired entries to free memory. This is called automatically
   * during normal cache operations, but can be called manually for
   * explicit cleanup.
   *
   * @returns Number of entries removed
   *
   * @example
   * ```typescript
   * const removed = cache.cleanup();
   * console.log(`Removed ${removed} expired entries`);
   * ```
   */
  cleanup(): number {
    let removed = 0;

    for (const [className, cached] of this.cache.entries()) {
      if (this.isExpired(cached)) {
        this.cache.delete(className);
        removed++;
      }
    }

    return removed;
  }
}
