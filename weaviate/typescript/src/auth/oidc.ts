/**
 * OIDC Authentication Provider
 *
 * Implements OpenID Connect (OIDC) token-based authentication for Weaviate
 * with support for token refresh.
 *
 * @module @llmdevops/weaviate-integration/auth/oidc
 */

import type { AuthProvider, TokenRefreshCallback, CachedToken } from './types.js';

// ============================================================================
// OidcAuthProvider
// ============================================================================

/**
 * Authentication provider for OpenID Connect (OIDC) tokens.
 *
 * This provider uses OIDC access tokens for authentication via the
 * Authorization header with Bearer scheme. It supports automatic token
 * refresh if a refresh callback is provided.
 *
 * Features:
 * - Bearer token authentication
 * - Optional token refresh with callback
 * - Automatic refresh before expiration (60-second buffer)
 * - Token expiration tracking
 *
 * @example
 * ```typescript
 * // Simple OIDC with static token
 * const provider = new OidcAuthProvider({
 *   token: 'your-oidc-token',
 * });
 *
 * // OIDC with token refresh
 * const provider = new OidcAuthProvider({
 *   token: 'your-oidc-token',
 *   refreshToken: 'your-refresh-token',
 *   expiresIn: 3600, // 1 hour
 *   refreshCallback: async (token, refreshToken) => {
 *     // Implement your token refresh logic here
 *     const response = await fetch('https://oidc-provider.com/token', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({
 *         grant_type: 'refresh_token',
 *         refresh_token: refreshToken,
 *       }),
 *     });
 *     const data = await response.json();
 *     return {
 *       accessToken: data.access_token,
 *       refreshToken: data.refresh_token,
 *       expiresIn: data.expires_in,
 *     };
 *   },
 * });
 * ```
 */
export class OidcAuthProvider implements AuthProvider {
  private cachedToken: CachedToken | null = null;
  private refreshCallback?: TokenRefreshCallback;

  /**
   * Creates a new OIDC authentication provider.
   *
   * @param options - OIDC authentication options
   * @param options.token - The OIDC access token
   * @param options.refreshToken - Optional refresh token for automatic renewal
   * @param options.expiresIn - Token expiration time in seconds (if known)
   * @param options.refreshCallback - Optional callback for token refresh
   * @throws {Error} If token is empty
   */
  constructor(options: {
    token: string;
    refreshToken?: string;
    expiresIn?: number;
    refreshCallback?: TokenRefreshCallback;
  }) {
    if (!options.token || options.token.trim() === '') {
      throw new Error('OIDC token cannot be empty');
    }

    this.refreshCallback = options.refreshCallback;

    // Initialize cached token
    const expiresAt = options.expiresIn
      ? Date.now() + options.expiresIn * 1000
      : Date.now() + 3600 * 1000; // Default 1 hour if not specified

    this.cachedToken = {
      accessToken: options.token,
      tokenType: 'Bearer',
      expiresAt,
      refreshToken: options.refreshToken,
    };
  }

  /**
   * Gets the authentication headers with Bearer token.
   * Automatically refreshes the token if expired and refresh callback is available.
   *
   * @returns Promise resolving to headers object with Authorization header
   * @throws {Error} If token is expired and cannot be refreshed
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    // Refresh token if expired or near expiration
    if (this.isExpired() && this.refreshCallback) {
      await this.refresh();
    }

    if (!this.cachedToken) {
      throw new Error('No valid OIDC token available');
    }

    return {
      Authorization: `${this.cachedToken.tokenType} ${this.cachedToken.accessToken}`,
    };
  }

  /**
   * Checks if the OIDC token is expired or near expiration.
   * Uses a 60-second buffer to ensure token validity.
   *
   * @returns true if token is expired or near expiration, false otherwise
   */
  isExpired(): boolean {
    if (!this.cachedToken) {
      return true;
    }

    // If no refresh callback, we can't refresh, so never consider expired
    if (!this.refreshCallback) {
      return false;
    }

    // 60-second buffer before expiration
    const bufferMs = 60 * 1000;
    return Date.now() >= this.cachedToken.expiresAt - bufferMs;
  }

  /**
   * Refreshes the OIDC token using the refresh callback.
   *
   * @throws {Error} If refresh callback is not provided
   * @throws {Error} If refresh token is not available
   * @throws {Error} If token refresh fails
   */
  async refresh(): Promise<void> {
    if (!this.refreshCallback) {
      throw new Error('Token refresh callback not provided');
    }

    if (!this.cachedToken?.refreshToken) {
      throw new Error('No refresh token available for OIDC token refresh');
    }

    try {
      const result = await this.refreshCallback(
        this.cachedToken.accessToken,
        this.cachedToken.refreshToken
      );

      // Calculate expiration time
      const expiresAt = result.expiresIn
        ? Date.now() + result.expiresIn * 1000
        : Date.now() + 3600 * 1000; // Default 1 hour

      this.cachedToken = {
        accessToken: result.accessToken,
        tokenType: result.tokenType || 'Bearer',
        expiresAt,
        refreshToken: result.refreshToken || this.cachedToken.refreshToken,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to refresh OIDC token: ${message}`);
    }
  }

  /**
   * Sets or updates the refresh callback.
   *
   * @param callback - The new refresh callback
   */
  setRefreshCallback(callback: TokenRefreshCallback): void {
    this.refreshCallback = callback;
  }

  /**
   * Sets or updates the refresh token.
   *
   * @param refreshToken - The new refresh token
   */
  setRefreshToken(refreshToken: string): void {
    if (this.cachedToken) {
      this.cachedToken.refreshToken = refreshToken;
    }
  }

  /**
   * Updates the access token manually.
   * Useful when token is refreshed externally.
   *
   * @param token - The new access token
   * @param expiresIn - Token expiration time in seconds
   */
  updateToken(token: string, expiresIn?: number): void {
    if (!token || token.trim() === '') {
      throw new Error('Token cannot be empty');
    }

    const expiresAt = expiresIn
      ? Date.now() + expiresIn * 1000
      : Date.now() + 3600 * 1000; // Default 1 hour

    this.cachedToken = {
      accessToken: token,
      tokenType: 'Bearer',
      expiresAt,
      refreshToken: this.cachedToken?.refreshToken,
    };
  }

  /**
   * Prevents accidental serialization with tokens.
   *
   * @returns Object with redacted token
   */
  toJSON(): Record<string, unknown> {
    return {
      type: 'OidcAuthProvider',
      token: '***REDACTED***',
      hasRefreshCallback: !!this.refreshCallback,
      isExpired: this.isExpired(),
    };
  }

  /**
   * Prevents accidental logging with tokens.
   *
   * @returns String representation with redacted token
   */
  toString(): string {
    return `[OidcAuthProvider: token=***REDACTED***, hasRefresh=${!!this.refreshCallback}]`;
  }

  /**
   * Prevents inspection of tokens in Node.js.
   *
   * @returns Redacted representation
   */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return this.toString();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates an OIDC authentication provider with static token (no refresh).
 *
 * @param token - The OIDC access token
 * @returns A new OidcAuthProvider instance
 * @throws {Error} If token is empty
 *
 * @example
 * ```typescript
 * import { createOidcAuthProvider } from '@llmdevops/weaviate-integration/auth';
 *
 * const provider = createOidcAuthProvider('your-oidc-token');
 * const headers = await provider.getAuthHeaders();
 * ```
 */
export function createOidcAuthProvider(token: string): OidcAuthProvider {
  return new OidcAuthProvider({ token });
}

/**
 * Creates an OIDC authentication provider with refresh support.
 *
 * @param options - OIDC authentication options
 * @returns A new OidcAuthProvider instance
 * @throws {Error} If token is empty
 *
 * @example
 * ```typescript
 * import { createOidcAuthProviderWithRefresh } from '@llmdevops/weaviate-integration/auth';
 *
 * const provider = createOidcAuthProviderWithRefresh({
 *   token: 'your-access-token',
 *   refreshToken: 'your-refresh-token',
 *   expiresIn: 3600,
 *   refreshCallback: async (token, refreshToken) => {
 *     // Implement your refresh logic
 *     return { accessToken: '...', expiresIn: 3600 };
 *   },
 * });
 * ```
 */
export function createOidcAuthProviderWithRefresh(options: {
  token: string;
  refreshToken: string;
  expiresIn?: number;
  refreshCallback: TokenRefreshCallback;
}): OidcAuthProvider {
  return new OidcAuthProvider(options);
}
