import { CacheEntry } from './entry.js';

export interface CacheConfig {
  enabled: boolean;         // Default: true
  ttl: number;             // Default: 300000 (5 min)
  maxEntries: number;      // Default: 1000
  negativeTtl: number;     // Default: 30000 (30 sec)
  refreshAhead: boolean;   // Default: true
  refreshThreshold: number; // Default: 0.8
}

const DEFAULT_CONFIG: CacheConfig = {
  enabled: true,
  ttl: 300000,           // 5 minutes
  maxEntries: 1000,
  negativeTtl: 30000,    // 30 seconds
  refreshAhead: true,
  refreshThreshold: 0.8,
};

export class CacheManager {
  private entries: Map<string, CacheEntry<unknown>>;
  private accessOrder: string[]; // For LRU tracking
  private config: CacheConfig;

  constructor(config?: Partial<CacheConfig>) {
    this.entries = new Map();
    this.accessOrder = [];
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get a cached value
   * @returns The cached value if found and not expired, undefined otherwise
   */
  get<T>(key: string): T | undefined {
    if (!this.config.enabled) {
      return undefined;
    }

    const entry = this.entries.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (entry.isExpired()) {
      this.invalidate(key);
      return undefined;
    }

    // Skip negative cache entries
    if (entry.isNegative()) {
      return undefined;
    }

    // Update LRU access order
    this.updateAccessOrder(key);

    return entry.value;
  }

  /**
   * Set a cached value
   */
  set<T>(key: string, value: T, ttl?: number): void {
    if (!this.config.enabled) {
      return;
    }

    const effectiveTtl = ttl ?? this.config.ttl;
    const entry = new CacheEntry(value, effectiveTtl);

    // Check if we need to evict
    if (!this.entries.has(key) && this.entries.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    this.entries.set(key, entry);
    this.updateAccessOrder(key);
  }

  /**
   * Cache a "not found" result with a shorter TTL
   */
  setNegative(key: string): void {
    if (!this.config.enabled) {
      return;
    }

    const entry = CacheEntry.createNegative(this.config.negativeTtl);

    // Check if we need to evict
    if (!this.entries.has(key) && this.entries.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    this.entries.set(key, entry);
    this.updateAccessOrder(key);
  }

  /**
   * Check if a key exists in cache and is not expired
   */
  has(key: string): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const entry = this.entries.get(key);

    if (!entry) {
      return false;
    }

    if (entry.isExpired()) {
      this.invalidate(key);
      return false;
    }

    return !entry.isNegative();
  }

  /**
   * Check if a key has a negative cache entry
   */
  hasNegative(key: string): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const entry = this.entries.get(key);

    if (!entry) {
      return false;
    }

    if (entry.isExpired()) {
      this.invalidate(key);
      return false;
    }

    return entry.isNegative();
  }

  /**
   * Invalidate a specific cache entry
   */
  invalidate(key: string): void {
    this.entries.delete(key);
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Invalidate all cache entries matching a pattern
   * Pattern supports wildcard (*) at the end, e.g., "secret:my-secret:*"
   */
  invalidatePattern(pattern: string): void {
    // Convert glob pattern to regex
    // Escape special regex characters except *
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');

    const regex = new RegExp(`^${regexPattern}$`);

    // Find and remove all matching keys
    const keysToInvalidate: string[] = [];
    for (const key of this.entries.keys()) {
      if (regex.test(key)) {
        keysToInvalidate.push(key);
      }
    }

    for (const key of keysToInvalidate) {
      this.invalidate(key);
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.entries.clear();
    this.accessOrder = [];
  }

  /**
   * Build a standardized cache key
   * Format: {objectType}:{name}:{version|"latest"}
   */
  static buildKey(objectType: string, name: string, version?: string): string {
    const versionPart = version ?? 'latest';
    return `${objectType}:${name}:${versionPart}`;
  }

  /**
   * Get cache configuration
   */
  getConfig(): Readonly<CacheConfig> {
    return { ...this.config };
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate?: number;
  } {
    return {
      size: this.entries.size,
      maxSize: this.config.maxEntries,
    };
  }

  /**
   * Evict the least recently used entry
   */
  private evictOldest(): void {
    if (this.accessOrder.length === 0) {
      return;
    }

    const oldestKey = this.accessOrder[0];
    if (oldestKey !== undefined) {
      this.invalidate(oldestKey);
    }
  }

  /**
   * Update the access order for LRU tracking
   */
  private updateAccessOrder(key: string): void {
    // Remove from current position if exists
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }

    // Add to end (most recently used)
    this.accessOrder.push(key);
  }
}
