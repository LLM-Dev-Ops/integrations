/**
 * Cached credential provider.
 *
 * This module provides a credential provider wrapper that caches credentials
 * from an underlying provider and refreshes them before expiration.
 *
 * @module credentials/cache
 */

import { AwsCredentials, CredentialProvider } from './types.js';

/**
 * Configuration for cached credential provider.
 */
export interface CacheConfig {
  /**
   * Time-to-live for cached credentials in milliseconds.
   * If not specified, uses the credential's expiration time.
   */
  ttl?: number;

  /**
   * Buffer time before expiration to refresh credentials (in milliseconds).
   * Defaults to 5 minutes (300000ms).
   *
   * When credentials are set to expire within this buffer time, they will
   * be refreshed on the next getCredentials() call.
   */
  refreshBuffer?: number;
}

/**
 * Cached credential data.
 */
interface CachedCredential {
  credentials: AwsCredentials;
  cachedAt: number;
  expiresAt: number;
}

/**
 * Default refresh buffer: 5 minutes before expiration.
 */
const DEFAULT_REFRESH_BUFFER = 5 * 60 * 1000; // 5 minutes in ms

/**
 * Default TTL for credentials without expiration: 1 hour.
 */
const DEFAULT_TTL = 60 * 60 * 1000; // 1 hour in ms

/**
 * Provider that caches credentials from an underlying provider.
 *
 * This provider wraps another credential provider and caches its results
 * to avoid repeated credential fetches. It automatically refreshes credentials
 * before they expire.
 *
 * Features:
 * - Caches credentials with configurable TTL
 * - Automatic refresh before expiration
 * - Respects credential expiration times
 * - Thread-safe credential refresh
 *
 * @example
 * ```typescript
 * const baseProvider = new IMDSCredentialProvider();
 * const cachedProvider = new CachedCredentialProvider(baseProvider);
 *
 * // First call fetches from IMDS
 * const creds1 = await cachedProvider.getCredentials();
 *
 * // Second call uses cache
 * const creds2 = await cachedProvider.getCredentials();
 * ```
 *
 * @example With custom TTL
 * ```typescript
 * const cachedProvider = new CachedCredentialProvider(provider, {
 *   ttl: 30 * 60 * 1000, // 30 minutes
 *   refreshBuffer: 10 * 60 * 1000 // Refresh 10 minutes before expiry
 * });
 * ```
 */
export class CachedCredentialProvider implements CredentialProvider {
  private cache: CachedCredential | null = null;
  private refreshPromise: Promise<AwsCredentials> | null = null;
  private readonly ttl: number | undefined;
  private readonly refreshBuffer: number;

  /**
   * Creates a new cached credential provider.
   *
   * @param provider - Underlying provider to cache
   * @param config - Optional cache configuration
   */
  constructor(
    private readonly provider: CredentialProvider,
    config: CacheConfig = {}
  ) {
    this.ttl = config.ttl;
    this.refreshBuffer = config.refreshBuffer ?? DEFAULT_REFRESH_BUFFER;
  }

  /**
   * Retrieves AWS credentials, using cache when possible.
   *
   * This method returns cached credentials if they are still valid.
   * If credentials are expired or will expire soon (within refreshBuffer),
   * it fetches fresh credentials from the underlying provider.
   *
   * @returns Promise resolving to AWS credentials
   * @throws {CredentialError} If underlying provider fails
   */
  public async getCredentials(): Promise<AwsCredentials> {
    // Check if we have valid cached credentials
    if (this.cache && !this.shouldRefresh()) {
      return { ...this.cache.credentials };
    }

    // If a refresh is already in progress, wait for it
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // Start a new refresh
    this.refreshPromise = this.refresh();

    try {
      const credentials = await this.refreshPromise;
      return credentials;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Checks if cached credentials are expired or need refresh.
   *
   * @returns true if credentials should be refreshed
   */
  public isExpired(): boolean {
    if (!this.cache) {
      return true;
    }

    return this.shouldRefresh();
  }

  /**
   * Determines if credentials should be refreshed.
   *
   * @returns true if cache is empty, expired, or within refresh buffer
   */
  private shouldRefresh(): boolean {
    if (!this.cache) {
      return true;
    }

    const now = Date.now();

    // Check if cache has expired based on our calculated expiry
    if (now >= this.cache.expiresAt) {
      return true;
    }

    // Check if we're within the refresh buffer window
    if (now >= this.cache.expiresAt - this.refreshBuffer) {
      return true;
    }

    return false;
  }

  /**
   * Refreshes credentials from the underlying provider.
   *
   * @returns Promise resolving to fresh credentials
   */
  private async refresh(): Promise<AwsCredentials> {
    try {
      const credentials = await this.provider.getCredentials();
      const now = Date.now();

      // Calculate when these credentials should be considered expired
      let expiresAt: number;

      if (credentials.expiration) {
        // Use the credential's expiration time
        expiresAt = credentials.expiration.getTime();
      } else if (this.ttl !== undefined) {
        // Use configured TTL
        expiresAt = now + this.ttl;
      } else {
        // Use default TTL for non-expiring credentials
        expiresAt = now + DEFAULT_TTL;
      }

      // Cache the credentials
      this.cache = {
        credentials,
        cachedAt: now,
        expiresAt,
      };

      return { ...credentials };
    } catch (error) {
      // Clear cache on error
      this.cache = null;
      throw error;
    }
  }

  /**
   * Clears the credential cache.
   *
   * This forces the next getCredentials() call to fetch fresh credentials
   * from the underlying provider.
   */
  public clearCache(): void {
    this.cache = null;
    this.refreshPromise = null;
  }

  /**
   * Gets cache statistics.
   *
   * @returns Cache stats or null if no cache
   */
  public getCacheStats(): { cachedAt: Date; expiresAt: Date } | null {
    if (!this.cache) {
      return null;
    }

    return {
      cachedAt: new Date(this.cache.cachedAt),
      expiresAt: new Date(this.cache.expiresAt),
    };
  }
}
