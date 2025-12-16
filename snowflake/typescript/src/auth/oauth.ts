/**
 * OAuth Authentication Handler
 *
 * Implements OAuth-based authentication for Snowflake with token refresh support.
 * @module @llmdevops/snowflake-integration/auth/oauth
 */

import type { OAuthAuthConfig } from '../config/index.js';
import {
  AuthenticationError,
  InvalidCredentialsError,
  TokenExpiredError,
} from '../errors/index.js';
import { BaseCredentialProvider, type Credentials } from './provider.js';

// ============================================================================
// Types
// ============================================================================

/**
 * OAuth token refresh callback function.
 *
 * This function should implement the logic to refresh an OAuth token
 * using a refresh token or other mechanism specific to the OAuth provider.
 *
 * @param currentToken - The current (possibly expired) access token
 * @param refreshToken - The refresh token (if available)
 * @returns Promise resolving to the new access token and optional refresh token
 */
export type TokenRefreshCallback = (
  currentToken: string,
  refreshToken?: string
) => Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
}>;

/**
 * OAuth credential provider options.
 */
export interface OAuthProviderOptions {
  /** OAuth configuration */
  config: OAuthAuthConfig;
  /** Optional callback for token refresh */
  refreshCallback?: TokenRefreshCallback;
  /** Optional refresh token for automatic token renewal */
  refreshToken?: string;
  /** Token expiration time in seconds (if known) */
  expiresIn?: number;
}

// ============================================================================
// OAuth Credential Provider
// ============================================================================

/**
 * Credential provider for OAuth authentication.
 *
 * This provider uses OAuth bearer tokens for authentication. It supports
 * automatic token refresh if a refresh callback is provided.
 *
 * @example
 * ```typescript
 * // Simple OAuth with static token
 * const provider = new OAuthCredentialProvider({
 *   config: {
 *     method: 'oauth',
 *     token: 'my-access-token',
 *     tokenType: 'Bearer'
 *   }
 * });
 *
 * // OAuth with token refresh
 * const provider = new OAuthCredentialProvider({
 *   config: {
 *     method: 'oauth',
 *     token: 'my-access-token'
 *   },
 *   refreshToken: 'my-refresh-token',
 *   expiresIn: 3600,
 *   refreshCallback: async (token, refreshToken) => {
 *     const response = await fetch('https://oauth-provider.com/token', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({
 *         grant_type: 'refresh_token',
 *         refresh_token: refreshToken
 *       })
 *     });
 *     const data = await response.json();
 *     return {
 *       accessToken: data.access_token,
 *       refreshToken: data.refresh_token,
 *       expiresIn: data.expires_in
 *     };
 *   }
 * });
 * ```
 */
export class OAuthCredentialProvider extends BaseCredentialProvider {
  private readonly config: OAuthAuthConfig;
  private refreshCallback?: TokenRefreshCallback;
  private currentRefreshToken?: string;

  /**
   * Creates a new OAuth credential provider.
   *
   * @param options - OAuth provider options
   * @throws {InvalidCredentialsError} If configuration is invalid
   */
  constructor(options: OAuthProviderOptions) {
    super();
    this.validateConfig(options.config);
    this.config = options.config;
    this.refreshCallback = options.refreshCallback;
    this.currentRefreshToken = options.refreshToken;

    // Initialize credentials with the provided token
    const expiresAt = options.expiresIn
      ? new Date(Date.now() + options.expiresIn * 1000)
      : undefined;

    this.updateCredentials({
      method: 'oauth',
      accessToken: this.config.token,
      tokenType: this.config.tokenType || 'Bearer',
      expiresAt,
      refreshToken: this.currentRefreshToken,
    });
  }

  /**
   * Validates the OAuth authentication configuration.
   *
   * @param config - Configuration to validate
   * @throws {InvalidCredentialsError} If configuration is invalid
   */
  private validateConfig(config: OAuthAuthConfig): void {
    if (!config.token || config.token.trim() === '') {
      throw new InvalidCredentialsError('Token is required for OAuth authentication');
    }
  }

  /**
   * Refreshes the OAuth token using the refresh callback.
   *
   * If no refresh callback is provided, this returns the current token
   * (assuming it's a long-lived token that doesn't need refresh).
   *
   * @returns Promise resolving to refreshed OAuth credentials
   * @throws {TokenExpiredError} If token is expired and cannot be refreshed
   * @throws {AuthenticationError} If token refresh fails
   */
  async refreshCredentials(): Promise<Credentials> {
    try {
      // If no refresh callback is provided, use the current token
      if (!this.refreshCallback) {
        const credentials: Credentials = {
          method: 'oauth',
          accessToken: this.config.token,
          tokenType: this.config.tokenType || 'Bearer',
          // No expiration means long-lived token
        };

        this.updateCredentials(credentials);
        return credentials;
      }

      // Attempt to refresh the token
      if (!this.currentRefreshToken) {
        throw new TokenExpiredError(
          'OAuth token expired and no refresh token available'
        );
      }

      try {
        const result = await this.refreshCallback(
          this.config.token,
          this.currentRefreshToken
        );

        // Update the refresh token if a new one was provided
        if (result.refreshToken) {
          this.currentRefreshToken = result.refreshToken;
        }

        // Calculate expiration time
        const expiresAt = result.expiresIn
          ? new Date(Date.now() + result.expiresIn * 1000)
          : undefined;

        const credentials: Credentials = {
          method: 'oauth',
          accessToken: result.accessToken,
          tokenType: result.tokenType || this.config.tokenType || 'Bearer',
          expiresAt,
          refreshToken: this.currentRefreshToken,
        };

        this.updateCredentials(credentials);
        return credentials;
      } catch (error) {
        // If refresh fails, check if it's due to invalid refresh token
        if (error instanceof Error && error.message.includes('invalid_grant')) {
          throw new TokenExpiredError(
            'OAuth refresh token is invalid or expired'
          );
        }
        throw error;
      }
    } catch (error) {
      if (
        error instanceof InvalidCredentialsError ||
        error instanceof TokenExpiredError
      ) {
        throw error;
      }

      throw new AuthenticationError(
        'Failed to refresh OAuth credentials',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Checks if the OAuth token is expired.
   *
   * If no expiration time is set, the token is considered non-expiring.
   *
   * @returns true if token is expired, false otherwise
   */
  isExpired(): boolean {
    // If no refresh callback, we can't refresh, so never consider expired
    if (!this.refreshCallback) {
      return false;
    }

    return super.isExpired();
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
    this.currentRefreshToken = refreshToken;
    if (this.credentials) {
      this.credentials.refreshToken = refreshToken;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates an OAuth credential provider from configuration.
 *
 * @param options - OAuth provider options
 * @returns A new OAuthCredentialProvider instance
 * @throws {InvalidCredentialsError} If configuration is invalid
 *
 * @example
 * ```typescript
 * const provider = createOAuthProvider({
 *   config: {
 *     method: 'oauth',
 *     token: 'my-access-token',
 *     tokenType: 'Bearer'
 *   }
 * });
 * ```
 */
export function createOAuthProvider(options: OAuthProviderOptions): OAuthCredentialProvider {
  return new OAuthCredentialProvider(options);
}

/**
 * Creates a simple OAuth provider with a static token (no refresh).
 *
 * @param config - OAuth authentication configuration
 * @returns A new OAuthCredentialProvider instance
 * @throws {InvalidCredentialsError} If configuration is invalid
 *
 * @example
 * ```typescript
 * const provider = createSimpleOAuthProvider({
 *   method: 'oauth',
 *   token: 'my-long-lived-token'
 * });
 * ```
 */
export function createSimpleOAuthProvider(config: OAuthAuthConfig): OAuthCredentialProvider {
  return new OAuthCredentialProvider({ config });
}
