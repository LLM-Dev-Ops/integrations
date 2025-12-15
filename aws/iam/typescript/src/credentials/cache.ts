/**
 * Credential cache for assumed role credentials.
 *
 * This module provides a thread-safe cache for AWS assumed role credentials
 * with support for proactive refresh before expiration and LRU eviction.
 *
 * @module credentials/cache
 */

import type { AssumedCredentials } from '../types/responses.js';
import type { AssumeRoleRequest } from '../types/requests.js';

/**
 * Configuration for credential cache.
 */
export interface CacheConfig {
  /**
   * Buffer time before expiration to trigger refresh (in milliseconds).
   * Defaults to 5 minutes (300000ms).
   *
   * When credentials are set to expire within this buffer time, they will
   * be marked as needing refresh on the next access.
   */
  refreshBuffer?: number;

  /**
   * Maximum number of cached credential entries.
   * When exceeded, least recently used entries are evicted.
   * Defaults to 100.
   */
  maxEntries?: number;

  /**
   * Enable async refresh while returning stale credentials.
   * Defaults to true.
   */
  asyncRefresh?: boolean;
}

/**
 * Cache statistics.
 */
export interface CacheStats {
  /** Total number of cached entries */
  size: number;
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Number of entries evicted */
  evictions: number;
}

/**
 * Cached credential entry.
 */
interface CachedEntry {
  /** The cached credentials */
  credentials: AssumedCredentials;
  /** When the credentials were cached */
  cachedAt: number;
  /** When to trigger refresh */
  refreshAt: number;
  /** Original assume role request for refresh */
  originalRequest?: AssumeRoleRequest;
  /** Last access time for LRU eviction */
  lastAccessedAt: number;
}

/**
 * Default refresh buffer: 5 minutes before expiration.
 */
const DEFAULT_REFRESH_BUFFER = 5 * 60 * 1000; // 5 minutes in ms

/**
 * Default maximum cache entries.
 */
const DEFAULT_MAX_ENTRIES = 100;

/**
 * Thread-safe cache for assumed role credentials.
 *
 * This cache provides:
 * - Thread-safe credential storage and retrieval
 * - Proactive refresh before expiration (configurable buffer)
 * - Async refresh while returning stale credentials
 * - LRU eviction when max entries exceeded
 * - Cache statistics for monitoring
 *
 * @example
 * ```typescript
 * const cache = new AssumedCredentialCache({
 *   refreshBuffer: 5 * 60 * 1000, // 5 minutes
 *   maxEntries: 100
 * });
 *
 * // Store credentials
 * cache.put(cacheKey, credentials, originalRequest);
 *
 * // Retrieve credentials
 * const cached = cache.get(cacheKey);
 * if (cached && !cache.needsRefresh(cacheKey)) {
 *   // Use cached credentials
 * }
 * ```
 */
export class AssumedCredentialCache {
  private readonly cache: Map<string, CachedEntry> = new Map();
  private readonly refreshBuffer: number;
  private readonly maxEntries: number;
  private readonly asyncRefresh: boolean;

  // Statistics
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  /**
   * Creates a new credential cache.
   *
   * @param config - Optional cache configuration
   */
  constructor(config: CacheConfig = {}) {
    this.refreshBuffer = config.refreshBuffer ?? DEFAULT_REFRESH_BUFFER;
    this.maxEntries = config.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.asyncRefresh = config.asyncRefresh ?? true;
  }

  /**
   * Retrieves cached credentials by key.
   *
   * This method returns cached credentials if they exist and are not expired.
   * Updates the last accessed time for LRU eviction.
   *
   * @param key - Cache key
   * @returns Cached credentials or null if not found/expired
   */
  public get(key: string): AssumedCredentials | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if credentials are expired
    if (this.isExpired(key)) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Update last accessed time for LRU
    entry.lastAccessedAt = Date.now();
    this.hits++;

    return { ...entry.credentials };
  }

  /**
   * Stores credentials in the cache.
   *
   * This method caches credentials and calculates when they should be refreshed.
   * If the cache is at capacity, evicts the least recently used entry.
   *
   * @param key - Cache key
   * @param credentials - Credentials to cache
   * @param originalRequest - Optional original request for refresh
   */
  public put(
    key: string,
    credentials: AssumedCredentials,
    originalRequest?: AssumeRoleRequest
  ): void {
    const now = Date.now();

    // Calculate refresh time (expiration - buffer)
    const expirationTime = credentials.expiration.getTime();
    const refreshAt = expirationTime - this.refreshBuffer;

    const entry: CachedEntry = {
      credentials: { ...credentials },
      cachedAt: now,
      refreshAt,
      originalRequest: originalRequest ? { ...originalRequest } : undefined,
      lastAccessedAt: now,
    };

    // Evict LRU entry if at capacity
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      this.evictLru();
    }

    this.cache.set(key, entry);
  }

  /**
   * Checks if cached credentials need refresh.
   *
   * Credentials need refresh if:
   * - They are within the refresh buffer window
   * - But not yet expired (still usable)
   *
   * @param key - Cache key
   * @returns true if credentials should be refreshed
   */
  public needsRefresh(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    const now = Date.now();

    // Already expired, not just needs refresh
    if (now >= entry.credentials.expiration.getTime()) {
      return false;
    }

    // Within refresh buffer window
    return now >= entry.refreshAt;
  }

  /**
   * Checks if cached credentials are expired.
   *
   * @param key - Cache key
   * @returns true if credentials are expired or not found
   */
  public isExpired(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return true;
    }

    const now = Date.now();
    return now >= entry.credentials.expiration.getTime();
  }

  /**
   * Builds a cache key from an assume role request.
   *
   * The cache key includes the role ARN, session name, and optional
   * parameters that affect the credentials returned.
   *
   * @param request - Assume role request
   * @returns Cache key string
   */
  public buildCacheKey(request: AssumeRoleRequest): string {
    const parts = [
      request.roleArn,
      request.sessionName,
      request.externalId ?? '',
      request.sessionPolicy ?? '',
      request.durationSeconds?.toString() ?? '',
    ];

    // Include policy ARNs if present
    if (request.policyArns && request.policyArns.length > 0) {
      parts.push(request.policyArns.sort().join(','));
    }

    return parts.join('|');
  }

  /**
   * Clears all cached credentials.
   *
   * This forces the next getCredentials() call to fetch fresh credentials.
   */
  public clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Gets cache statistics.
   *
   * @returns Cache statistics including size, hits, misses, and evictions
   */
  public getCacheStats(): CacheStats {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    };
  }

  /**
   * Evicts the least recently used cache entry.
   */
  private evictLru(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.cache.delete(oldestKey);
      this.evictions++;
    }
  }

  /**
   * Gets the original request for a cached entry.
   *
   * This is useful for async refresh operations.
   *
   * @param key - Cache key
   * @returns Original request or undefined
   */
  public getOriginalRequest(key: string): AssumeRoleRequest | undefined {
    const entry = this.cache.get(key);
    return entry?.originalRequest;
  }
}
