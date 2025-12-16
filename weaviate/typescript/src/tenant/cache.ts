/**
 * Tenant Status Cache
 *
 * Provides short-lived caching of tenant status to reduce API calls.
 */

import type { TenantStatus } from '../types/tenant.js';

/**
 * Cache entry for tenant status
 */
export interface TenantCacheEntry {
  /** Tenant status */
  status: TenantStatus;
  /** Timestamp when cached (ms since epoch) */
  cachedAt: number;
}

/**
 * Cache key for tenant status
 */
interface CacheKey {
  className: string;
  tenantName: string;
}

/**
 * Options for TenantStatusCache
 */
export interface TenantCacheOptions {
  /**
   * Time-to-live for cache entries in milliseconds
   * Default: 60000 (60 seconds)
   */
  ttlMs?: number;

  /**
   * Maximum number of cache entries
   * Default: 1000
   */
  maxEntries?: number;
}

/**
 * TenantStatusCache provides short-lived caching of tenant status.
 *
 * Reduces API calls to Weaviate by caching tenant status for a short period.
 * The cache uses a TTL-based eviction strategy to ensure status stays fresh.
 *
 * Default TTL: 60 seconds (suitable for tenant status which doesn't change frequently)
 *
 * @example
 * ```typescript
 * const cache = new TenantStatusCache({ ttlMs: 60000 });
 *
 * // Set tenant status
 * cache.set('Article', 'tenant-a', TenantStatus.Active);
 *
 * // Get tenant status (within TTL)
 * const status = cache.get('Article', 'tenant-a');
 *
 * // Invalidate specific tenant
 * cache.invalidate('Article', 'tenant-a');
 *
 * // Invalidate all tenants for a class
 * cache.invalidate('Article');
 *
 * // Clear entire cache
 * cache.clear();
 * ```
 */
export class TenantStatusCache {
  private cache: Map<string, TenantCacheEntry>;
  private ttlMs: number;
  private maxEntries: number;

  /**
   * Create a new TenantStatusCache.
   *
   * @param options - Cache configuration options
   */
  constructor(options?: TenantCacheOptions) {
    this.cache = new Map();
    this.ttlMs = options?.ttlMs ?? 60000; // 60 seconds default
    this.maxEntries = options?.maxEntries ?? 1000;
  }

  /**
   * Get cached tenant status.
   *
   * Returns undefined if:
   * - Tenant is not in cache
   * - Cache entry has expired (past TTL)
   *
   * @param className - Name of the class
   * @param tenantName - Name of the tenant
   * @returns Cached tenant status or undefined
   *
   * @example
   * ```typescript
   * const status = cache.get('Article', 'tenant-a');
   * if (status !== undefined) {
   *   console.log(`Cached status: ${status}`);
   * } else {
   *   console.log('Not in cache or expired');
   * }
   * ```
   */
  get(className: string, tenantName: string): TenantStatus | undefined {
    const key = this.makeKey(className, tenantName);
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if expired
    const now = Date.now();
    const age = now - entry.cachedAt;

    if (age > this.ttlMs) {
      // Expired - remove and return undefined
      this.cache.delete(key);
      return undefined;
    }

    return entry.status;
  }

  /**
   * Set tenant status in cache.
   *
   * If cache is at max capacity, removes oldest entry before adding new one.
   *
   * @param className - Name of the class
   * @param tenantName - Name of the tenant
   * @param status - Tenant status to cache
   *
   * @example
   * ```typescript
   * cache.set('Article', 'tenant-a', TenantStatus.Active);
   * ```
   */
  set(className: string, tenantName: string, status: TenantStatus): void {
    // Check capacity
    if (this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }

    const key = this.makeKey(className, tenantName);
    const entry: TenantCacheEntry = {
      status,
      cachedAt: Date.now(),
    };

    this.cache.set(key, entry);
  }

  /**
   * Invalidate cached tenant status.
   *
   * If tenantName is provided, invalidates only that tenant.
   * If tenantName is omitted, invalidates all tenants for the class.
   *
   * @param className - Name of the class
   * @param tenantName - Optional tenant name
   *
   * @example
   * ```typescript
   * // Invalidate specific tenant
   * cache.invalidate('Article', 'tenant-a');
   *
   * // Invalidate all tenants for a class
   * cache.invalidate('Article');
   * ```
   */
  invalidate(className: string, tenantName?: string): void {
    if (tenantName) {
      // Invalidate specific tenant
      const key = this.makeKey(className, tenantName);
      this.cache.delete(key);
    } else {
      // Invalidate all tenants for class
      const prefix = `${className}:`;
      const keysToDelete: string[] = [];

      for (const key of this.cache.keys()) {
        if (key.startsWith(prefix)) {
          keysToDelete.push(key);
        }
      }

      for (const key of keysToDelete) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cached tenant status.
   *
   * @example
   * ```typescript
   * cache.clear();
   * ```
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics.
   *
   * @returns Cache statistics
   *
   * @example
   * ```typescript
   * const stats = cache.getStats();
   * console.log(`Cache size: ${stats.size}/${stats.maxEntries}`);
   * console.log(`TTL: ${stats.ttlMs}ms`);
   * ```
   */
  getStats(): {
    size: number;
    maxEntries: number;
    ttlMs: number;
  } {
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      ttlMs: this.ttlMs,
    };
  }

  /**
   * Remove expired entries from cache.
   *
   * This is called automatically during get() operations,
   * but can also be called manually for cleanup.
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
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.cachedAt;
      if (age > this.ttlMs) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }

    return keysToDelete.length;
  }

  /**
   * Create cache key from class name and tenant name.
   *
   * @param className - Name of the class
   * @param tenantName - Name of the tenant
   * @returns Cache key string
   * @private
   */
  private makeKey(className: string, tenantName: string): string {
    return `${className}:${tenantName}`;
  }

  /**
   * Evict oldest cache entry to make room for new entry.
   *
   * @private
   */
  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.cachedAt < oldestTime) {
        oldestTime = entry.cachedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}
