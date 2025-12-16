/**
 * Token caching for Amazon ECR authorization tokens.
 *
 * This module provides caching for ECR authorization tokens to avoid
 * unnecessary API calls and improve performance.
 *
 * @module cache/token-cache
 */

/**
 * Cached authorization token with expiration metadata.
 */
export interface CachedToken {
  /** The authorization token value. */
  readonly token: string;
  /** Expiration timestamp. */
  readonly expiresAt: Date;
  /** Proxy endpoint URL for docker operations. */
  readonly proxyEndpoint: string;
  /** Creation timestamp. */
  readonly createdAt: Date;
}

/**
 * Token cache for managing ECR authorization tokens.
 *
 * Tokens are cached per registry ID and automatically considered expired
 * when they approach their expiration time (based on refresh buffer).
 */
export class TokenCache {
  private readonly tokens: Map<string, CachedToken>;
  private readonly refreshBufferMs: number;

  /**
   * Creates a new token cache.
   *
   * @param refreshBufferSecs - Buffer time in seconds before expiration to consider token expired (default: 300)
   */
  constructor(refreshBufferSecs: number = 300) {
    this.tokens = new Map();
    this.refreshBufferMs = refreshBufferSecs * 1000;
  }

  /**
   * Retrieves a cached token for a registry.
   *
   * @param registryId - AWS account ID (12-digit registry ID)
   * @returns Cached token if available and not expiring, undefined otherwise
   */
  get(registryId: string): CachedToken | undefined {
    const cached = this.tokens.get(registryId);
    if (!cached) {
      return undefined;
    }

    // Check if token is expired or expiring soon
    if (this.isExpiring(cached)) {
      this.tokens.delete(registryId);
      return undefined;
    }

    return cached;
  }

  /**
   * Stores a token in the cache.
   *
   * @param registryId - AWS account ID (12-digit registry ID)
   * @param token - Token to cache
   */
  set(registryId: string, token: CachedToken): void {
    this.tokens.set(registryId, token);
  }

  /**
   * Clears cached tokens.
   *
   * @param registryId - Optional registry ID to clear. If not provided, clears all tokens.
   */
  clear(registryId?: string): void {
    if (registryId) {
      this.tokens.delete(registryId);
    } else {
      this.tokens.clear();
    }
  }

  /**
   * Checks if a token is expiring soon.
   *
   * A token is considered expiring if the current time is within the refresh buffer
   * of the expiration time.
   *
   * @param token - Token to check
   * @returns true if token is expired or expiring soon
   */
  isExpiring(token: CachedToken): boolean {
    const now = new Date();
    const expiryThreshold = new Date(
      token.expiresAt.getTime() - this.refreshBufferMs
    );
    return now >= expiryThreshold;
  }

  /**
   * Invalidates a cached token.
   *
   * This is useful when a token is known to be invalid (e.g., due to an authentication error).
   *
   * @param registryId - AWS account ID (12-digit registry ID)
   */
  invalidate(registryId: string): void {
    this.tokens.delete(registryId);
  }

  /**
   * Gets the number of cached tokens.
   *
   * @returns Number of tokens in the cache
   */
  get size(): number {
    return this.tokens.size;
  }
}
