/**
 * Idempotency key management for Stripe API operations
 */
import { createHash, randomUUID } from 'crypto';
import type { IdempotencyConfig, IdempotencyStrategy } from '../config/config.js';

/**
 * Interface for idempotency key generation
 */
export interface IdempotencyManager {
  /**
   * Generates an idempotency key for a request
   */
  generateKey(operation: string, params: Record<string, unknown>): string;

  /**
   * Generates a key using a specific strategy
   */
  generateKeyWithStrategy(
    strategy: IdempotencyStrategy,
    operation: string,
    params: Record<string, unknown>
  ): string;

  /**
   * Checks if a key is cached and returns cached response if available
   */
  getCached<T>(key: string): T | undefined;

  /**
   * Stores a response in the cache
   */
  setCached<T>(key: string, response: T): void;

  /**
   * Clears a specific key from cache
   */
  clearKey(key: string): void;

  /**
   * Clears all cached entries
   */
  clearAll(): void;

  /**
   * Gets cache statistics
   */
  getStats(): IdempotencyCacheStats;
}

/**
 * Cache statistics
 */
export interface IdempotencyCacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
}

/**
 * Cache entry with TTL
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Default implementation of IdempotencyManager
 */
export class DefaultIdempotencyManager implements IdempotencyManager {
  private readonly config: IdempotencyConfig;
  private readonly cache: Map<string, CacheEntry<unknown>>;
  private hits: number = 0;
  private misses: number = 0;

  constructor(config: IdempotencyConfig) {
    this.config = config;
    this.cache = new Map();
  }

  /**
   * Generates an idempotency key using the configured strategy
   */
  generateKey(operation: string, params: Record<string, unknown>): string {
    return this.generateKeyWithStrategy(this.config.strategy, operation, params);
  }

  /**
   * Generates a key using a specific strategy
   */
  generateKeyWithStrategy(
    strategy: IdempotencyStrategy,
    operation: string,
    params: Record<string, unknown>
  ): string {
    switch (strategy) {
      case 'content_hash':
        return this.generateContentHashKey(operation, params);
      case 'uuid':
        return this.generateUuidKey();
      case 'custom':
        // For custom strategy, expect params to contain the key
        if ('idempotencyKey' in params && typeof params.idempotencyKey === 'string') {
          return params.idempotencyKey;
        }
        // Fall back to content hash if no custom key provided
        return this.generateContentHashKey(operation, params);
      default:
        return this.generateContentHashKey(operation, params);
    }
  }

  /**
   * Generates a content-based hash key
   */
  private generateContentHashKey(operation: string, params: Record<string, unknown>): string {
    const content = JSON.stringify({
      operation,
      params: this.sortObjectKeys(params),
    });

    const hash = createHash('sha256').update(content).digest('hex');
    return `idem_${hash.substring(0, 32)}`;
  }

  /**
   * Generates a UUID-based key
   */
  private generateUuidKey(): string {
    return `idem_${randomUUID().replace(/-/g, '')}`;
  }

  /**
   * Recursively sorts object keys for consistent hashing
   */
  private sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) =>
        typeof item === 'object' && item !== null
          ? this.sortObjectKeys(item as Record<string, unknown>)
          : item
      ) as unknown as Record<string, unknown>;
    }

    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, unknown> = {};

    for (const key of sortedKeys) {
      const value = obj[key];
      result[key] =
        typeof value === 'object' && value !== null
          ? this.sortObjectKeys(value as Record<string, unknown>)
          : value;
    }

    return result;
  }

  /**
   * Gets a cached response
   */
  getCached<T>(key: string): T | undefined {
    this.pruneExpired();

    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    this.hits++;
    return entry.value as T;
  }

  /**
   * Stores a response in the cache
   */
  setCached<T>(key: string, response: T): void {
    // Enforce cache size limit
    if (this.cache.size >= this.config.cacheSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      value: response,
      expiresAt: Date.now() + this.config.cacheTtl,
    });
  }

  /**
   * Clears a specific key from cache
   */
  clearKey(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clears all cached entries
   */
  clearAll(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Gets cache statistics
   */
  getStats(): IdempotencyCacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Removes expired entries from cache
   */
  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Evicts the oldest entries when cache is full
   */
  private evictOldest(): void {
    // Remove 10% of entries when at capacity
    const toRemove = Math.ceil(this.config.cacheSize * 0.1);
    const keys = Array.from(this.cache.keys()).slice(0, toRemove);
    for (const key of keys) {
      this.cache.delete(key);
    }
  }
}

/**
 * Creates an idempotency manager with the given config
 */
export function createIdempotencyManager(config: IdempotencyConfig): IdempotencyManager {
  return new DefaultIdempotencyManager(config);
}

/**
 * Decorator function for adding idempotency to operations
 */
export function withIdempotency<T>(
  manager: IdempotencyManager,
  operation: string,
  params: Record<string, unknown>,
  execute: (key: string) => Promise<T>
): Promise<T> {
  const key = manager.generateKey(operation, params);

  // Check cache first
  const cached = manager.getCached<T>(key);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  // Execute and cache
  return execute(key).then((result) => {
    manager.setCached(key, result);
    return result;
  });
}
