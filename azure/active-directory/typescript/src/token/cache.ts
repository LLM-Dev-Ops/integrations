/**
 * Token cache for Azure AD OAuth2.
 *
 * In-memory, thread-safe token caching with automatic eviction.
 * Following the SPARC specification - no disk persistence for security.
 */

import type { AccessToken } from '../types/index.js';
import type { CacheConfig } from '../config.js';

/**
 * Cached token entry.
 */
interface CachedToken {
  token: AccessToken;
  cachedAt: number;
}

/**
 * Token cache for storing access tokens.
 */
export class TokenCache {
  private readonly accessTokens: Map<string, CachedToken> = new Map();
  private readonly refreshTokens: Map<string, string> = new Map();
  private readonly config: CacheConfig;

  constructor(config: CacheConfig) {
    this.config = config;
  }

  /**
   * Get a cached token by key.
   */
  get(key: string): AccessToken | undefined {
    if (!this.config.enabled) {
      return undefined;
    }

    const cached = this.accessTokens.get(key);
    if (!cached) {
      return undefined;
    }

    // Check if expired
    if (this.isExpired(cached.token)) {
      this.accessTokens.delete(key);
      return undefined;
    }

    return cached.token;
  }

  /**
   * Set a token in the cache.
   */
  set(key: string, token: AccessToken): void {
    if (!this.config.enabled) {
      return;
    }

    // Evict if at capacity
    if (this.accessTokens.size >= this.config.maxEntries) {
      this.evictExpired();

      // If still at capacity, evict oldest
      if (this.accessTokens.size >= this.config.maxEntries) {
        const oldestKey = this.accessTokens.keys().next().value;
        if (oldestKey) {
          this.accessTokens.delete(oldestKey);
        }
      }
    }

    this.accessTokens.set(key, {
      token,
      cachedAt: Date.now(),
    });
  }

  /**
   * Get a cached refresh token.
   */
  getRefreshToken(key: string): string | undefined {
    return this.refreshTokens.get(key);
  }

  /**
   * Set a refresh token in the cache.
   */
  setRefreshToken(key: string, refreshToken: string): void {
    if (!this.config.enabled) {
      return;
    }
    this.refreshTokens.set(key, refreshToken);
  }

  /**
   * Check if token needs refresh (within buffer period).
   */
  needsRefresh(token: AccessToken): boolean {
    const expiresAt = token.expiresOn.getTime();
    const now = Date.now();
    return expiresAt - now <= this.config.refreshBufferMs;
  }

  /**
   * Check if token is expired.
   */
  isExpired(token: AccessToken): boolean {
    return token.expiresOn.getTime() <= Date.now();
  }

  /**
   * Evict expired tokens.
   */
  evictExpired(): void {
    for (const [key, cached] of this.accessTokens.entries()) {
      if (this.isExpired(cached.token)) {
        this.accessTokens.delete(key);
        this.refreshTokens.delete(key);
      }
    }
  }

  /**
   * Clear all cached tokens.
   */
  clear(): void {
    this.accessTokens.clear();
    this.refreshTokens.clear();
  }

  /**
   * Get cache statistics.
   */
  getStats(): { accessTokenCount: number; refreshTokenCount: number } {
    return {
      accessTokenCount: this.accessTokens.size,
      refreshTokenCount: this.refreshTokens.size,
    };
  }

  /**
   * Build a cache key from components.
   */
  static buildKey(tenantId: string, clientId: string, flowType: string, scopes: string[]): string {
    const sortedScopes = [...scopes].sort().join(' ');
    return `${tenantId}:${clientId}:${flowType}:${sortedScopes}`;
  }
}

/**
 * Create a token cache.
 */
export function createTokenCache(config: CacheConfig): TokenCache {
  return new TokenCache(config);
}
