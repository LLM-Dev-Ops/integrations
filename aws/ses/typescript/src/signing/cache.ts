/**
 * AWS Signing Key Cache
 *
 * Caches derived signing keys to avoid expensive HMAC operations on every request.
 * Signing keys are valid for the same date, region, and service combination.
 */

import { CacheEntry } from './types';

/**
 * Default TTL for cache entries (24 hours in milliseconds).
 * AWS signing keys are valid for the date they were generated.
 */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Cache for AWS Signature V4 signing keys.
 *
 * The signing key is derived from:
 * - AWS secret access key
 * - Date (YYYYMMDD format)
 * - AWS region
 * - AWS service name
 *
 * Since deriving the key requires multiple HMAC-SHA256 operations,
 * caching significantly improves performance for multiple requests.
 *
 * @example
 * ```typescript
 * const cache = new SigningKeyCache();
 *
 * // Store a signing key
 * await cache.set('20231201', 'us-east-1', 'ses', signingKey);
 *
 * // Retrieve it later
 * const cached = await cache.get('20231201', 'us-east-1', 'ses');
 * if (cached) {
 *   console.log('Using cached signing key');
 * }
 *
 * // Clear expired entries
 * cache.cleanup();
 * ```
 */
export class SigningKeyCache {
  private cache: Map<string, CacheEntry>;
  private ttlMs: number;

  /**
   * Creates a new signing key cache.
   *
   * @param ttlMs - Time-to-live for cache entries in milliseconds (default: 24 hours)
   */
  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.cache = new Map();
    this.ttlMs = ttlMs;
  }

  /**
   * Generate a cache key from date, region, and service.
   *
   * @param date - Date in YYYYMMDD format
   * @param region - AWS region (e.g., 'us-east-1')
   * @param service - AWS service name (e.g., 'ses')
   * @returns Cache key string
   */
  private getCacheKey(date: string, region: string, service: string): string {
    return `${date}:${region}:${service}`;
  }

  /**
   * Store a signing key in the cache.
   *
   * @param date - Date in YYYYMMDD format
   * @param region - AWS region
   * @param service - AWS service name
   * @param key - Derived signing key
   */
  async set(
    date: string,
    region: string,
    service: string,
    key: ArrayBuffer
  ): Promise<void> {
    const cacheKey = this.getCacheKey(date, region, service);
    const entry: CacheEntry = {
      key,
      expiresAt: Date.now() + this.ttlMs,
    };

    this.cache.set(cacheKey, entry);
  }

  /**
   * Retrieve a signing key from the cache.
   *
   * Returns null if:
   * - Key is not in cache
   * - Key has expired
   *
   * @param date - Date in YYYYMMDD format
   * @param region - AWS region
   * @param service - AWS service name
   * @returns Cached signing key or null if not found or expired
   */
  async get(
    date: string,
    region: string,
    service: string
  ): Promise<ArrayBuffer | null> {
    const cacheKey = this.getCacheKey(date, region, service);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(cacheKey);
      return null;
    }

    return entry.key;
  }

  /**
   * Remove a specific key from the cache.
   *
   * @param date - Date in YYYYMMDD format
   * @param region - AWS region
   * @param service - AWS service name
   * @returns true if key was removed, false if not found
   */
  delete(date: string, region: string, service: string): boolean {
    const cacheKey = this.getCacheKey(date, region, service);
    return this.cache.delete(cacheKey);
  }

  /**
   * Remove all expired entries from the cache.
   *
   * This is useful for long-running processes to prevent memory leaks.
   * Call this periodically (e.g., once per hour) to clean up old entries.
   *
   * @returns Number of entries removed
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current number of entries in the cache.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Check if the cache has a specific key.
   *
   * Note: This does not check expiration. Use get() to ensure the entry is valid.
   *
   * @param date - Date in YYYYMMDD format
   * @param region - AWS region
   * @param service - AWS service name
   * @returns true if key exists in cache
   */
  has(date: string, region: string, service: string): boolean {
    const cacheKey = this.getCacheKey(date, region, service);
    return this.cache.has(cacheKey);
  }
}
