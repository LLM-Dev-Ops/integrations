export interface CacheEntryOptions {
  ttl: number; // milliseconds
}

const NEGATIVE_CACHE_MARKER = Symbol('NEGATIVE_CACHE');

export class CacheEntry<T> {
  readonly value: T;
  readonly createdAt: number;
  readonly expiresAt: number;
  private refreshInProgress: boolean = false;

  constructor(value: T, ttlMs: number) {
    this.value = value;
    this.createdAt = Date.now();
    this.expiresAt = this.createdAt + ttlMs;
  }

  /**
   * Check if the cache entry has expired
   */
  isExpired(): boolean {
    return Date.now() >= this.expiresAt;
  }

  /**
   * Check if the cache entry should be refreshed based on a threshold
   * @param threshold - Value between 0-1, e.g., 0.8 = refresh at 80% of TTL
   */
  shouldRefresh(threshold: number): boolean {
    if (threshold < 0 || threshold > 1) {
      throw new Error('Threshold must be between 0 and 1');
    }

    const now = Date.now();
    const lifetime = this.expiresAt - this.createdAt;
    const refreshPoint = this.createdAt + (lifetime * threshold);

    return now >= refreshPoint && !this.isExpired();
  }

  /**
   * Mark that a refresh operation is in progress
   * @returns false if refresh is already in progress, true if marked successfully
   */
  markRefreshInProgress(): boolean {
    if (this.refreshInProgress) {
      return false;
    }
    this.refreshInProgress = true;
    return true;
  }

  /**
   * Clear the refresh in progress flag
   */
  clearRefreshInProgress(): void {
    this.refreshInProgress = false;
  }

  /**
   * Check if this entry represents a negative cache (not found)
   */
  isNegative(): boolean {
    return this.value === NEGATIVE_CACHE_MARKER;
  }

  /**
   * Create a negative cache entry (for "not found" results)
   */
  static createNegative<T>(ttlMs: number): CacheEntry<T> {
    return new CacheEntry(NEGATIVE_CACHE_MARKER as T, ttlMs);
  }
}
