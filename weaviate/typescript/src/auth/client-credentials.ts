/**
 * Client Credentials OAuth2 Authentication Provider
 *
 * Implements OAuth2 Client Credentials flow for Weaviate with automatic
 * token refresh and caching.
 *
 * @module @llmdevops/weaviate-integration/auth/client-credentials
 */

import type { AuthProvider, OAuth2TokenResponse, CachedToken } from './types.js';

// ============================================================================
// SecretString Helper
// ============================================================================

/**
 * Secure string wrapper that prevents accidental exposure of secrets.
 */
class SecretString {
  private readonly value: string;

  constructor(value: string) {
    if (!value || value.trim() === '') {
      throw new Error('SecretString cannot be empty');
    }
    this.value = value;
  }

  expose(): string {
    return this.value;
  }

  toJSON(): string {
    return '***REDACTED***';
  }

  toString(): string {
    return '***REDACTED***';
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return '***REDACTED***';
  }
}

// ============================================================================
// ClientCredentialsAuthProvider
// ============================================================================

/**
 * Authentication provider for OAuth2 Client Credentials flow.
 *
 * This provider implements the OAuth2 client credentials grant type,
 * which is designed for machine-to-machine authentication. It automatically
 * handles token caching, expiration tracking, and refresh.
 *
 * Features:
 * - OAuth2 client credentials flow implementation
 * - Automatic token caching with expiry tracking
 * - Auto-refresh before expiration (60-second buffer)
 * - Secure credential handling
 * - Configurable scopes
 *
 * OAuth2 Flow:
 * 1. Client sends credentials to token endpoint
 * 2. Server validates and returns access token
 * 3. Token is cached with expiration time
 * 4. Token is automatically refreshed before expiry
 *
 * @example
 * ```typescript
 * const provider = new ClientCredentialsAuthProvider({
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-client-secret',
 *   tokenEndpoint: 'https://auth.weaviate.io/oauth2/token',
 *   scopes: ['weaviate.read', 'weaviate.write'],
 * });
 *
 * const headers = await provider.getAuthHeaders();
 * // headers = { 'Authorization': 'Bearer <access-token>' }
 * ```
 */
export class ClientCredentialsAuthProvider implements AuthProvider {
  private readonly clientId: string;
  private readonly clientSecret: SecretString;
  private readonly scopes: string[];
  private readonly tokenEndpoint: string;
  private cachedToken: CachedToken | null = null;

  /**
   * Creates a new Client Credentials authentication provider.
   *
   * @param options - Client credentials options
   * @param options.clientId - OAuth2 client ID
   * @param options.clientSecret - OAuth2 client secret
   * @param options.tokenEndpoint - OAuth2 token endpoint URL
   * @param options.scopes - Optional array of scopes to request
   * @throws {Error} If any required parameter is empty
   */
  constructor(options: {
    clientId: string;
    clientSecret: string;
    tokenEndpoint: string;
    scopes?: string[];
  }) {
    this.validateConfig(options);

    this.clientId = options.clientId;
    this.clientSecret = new SecretString(options.clientSecret);
    this.tokenEndpoint = options.tokenEndpoint;
    this.scopes = options.scopes || [];
  }

  /**
   * Validates the client credentials configuration.
   *
   * @param options - Configuration to validate
   * @throws {Error} If any required parameter is invalid
   */
  private validateConfig(options: {
    clientId: string;
    clientSecret: string;
    tokenEndpoint: string;
    scopes?: string[];
  }): void {
    if (!options.clientId || options.clientId.trim() === '') {
      throw new Error('Client ID is required for client credentials authentication');
    }
    if (!options.clientSecret || options.clientSecret.trim() === '') {
      throw new Error('Client secret is required for client credentials authentication');
    }
    if (!options.tokenEndpoint || options.tokenEndpoint.trim() === '') {
      throw new Error('Token endpoint is required for client credentials authentication');
    }

    // Validate token endpoint is a valid URL
    try {
      new URL(options.tokenEndpoint);
    } catch {
      throw new Error(
        `Invalid token endpoint URL: ${options.tokenEndpoint}`
      );
    }
  }

  /**
   * Gets the authentication headers with Bearer token.
   * Automatically fetches or refreshes the token if needed.
   *
   * @returns Promise resolving to headers object with Authorization header
   * @throws {Error} If token cannot be obtained
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    // Fetch or refresh token if needed
    if (!this.cachedToken || this.isExpired()) {
      await this.refresh();
    }

    if (!this.cachedToken) {
      throw new Error('Failed to obtain access token');
    }

    return {
      Authorization: `${this.cachedToken.tokenType} ${this.cachedToken.accessToken}`,
    };
  }

  /**
   * Checks if the current token is expired or near expiration.
   * Uses a 60-second buffer to ensure token validity.
   *
   * @returns true if token is expired or near expiration, false otherwise
   */
  isExpired(): boolean {
    if (!this.cachedToken) {
      return true;
    }

    // 60-second buffer before expiration
    const bufferMs = 60 * 1000;
    return Date.now() >= this.cachedToken.expiresAt - bufferMs;
  }

  /**
   * Refreshes the access token by requesting a new one from the OAuth2 provider.
   *
   * OAuth2 Client Credentials Flow:
   * POST {tokenEndpoint}
   * Content-Type: application/x-www-form-urlencoded
   * Body: {
   *   grant_type: "client_credentials",
   *   client_id: clientId,
   *   client_secret: clientSecret,
   *   scope: scopes.join(" ")
   * }
   *
   * @throws {Error} If token request fails
   */
  async refresh(): Promise<void> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret.expose(),
    });

    // Add scopes if specified
    if (this.scopes.length > 0) {
      body.append('scope', this.scopes.join(' '));
    }

    try {
      const response = await fetch(this.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OAuth2 token request failed: ${response.status} ${response.statusText}. ${errorText}`
        );
      }

      const data: OAuth2TokenResponse = await response.json();

      // Validate response
      if (!data.access_token) {
        throw new Error('OAuth2 response missing access_token');
      }

      // Calculate expiration time
      const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;

      this.cachedToken = {
        accessToken: data.access_token,
        tokenType: data.token_type || 'Bearer',
        expiresAt,
        refreshToken: data.refresh_token,
      };
    } catch (error) {
      // Clear cached token on error
      this.cachedToken = null;

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to obtain OAuth2 access token: ${message}`);
    }
  }

  /**
   * Gets the current token expiration time.
   *
   * @returns Expiration timestamp in milliseconds, or null if no token cached
   */
  getTokenExpiration(): number | null {
    return this.cachedToken?.expiresAt || null;
  }

  /**
   * Gets the time remaining until token expiration.
   *
   * @returns Milliseconds until expiration, or 0 if expired/no token
   */
  getTimeUntilExpiration(): number {
    if (!this.cachedToken) {
      return 0;
    }
    const remaining = this.cachedToken.expiresAt - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Clears the cached token.
   * The next call to getAuthHeaders() will fetch a new token.
   */
  clearCache(): void {
    this.cachedToken = null;
  }

  /**
   * Prevents accidental serialization with credentials.
   *
   * @returns Object with redacted credentials
   */
  toJSON(): Record<string, unknown> {
    return {
      type: 'ClientCredentialsAuthProvider',
      clientId: this.clientId,
      clientSecret: '***REDACTED***',
      tokenEndpoint: this.tokenEndpoint,
      scopes: this.scopes,
      hasToken: !!this.cachedToken,
      isExpired: this.isExpired(),
    };
  }

  /**
   * Prevents accidental logging with credentials.
   *
   * @returns String representation with redacted credentials
   */
  toString(): string {
    return `[ClientCredentialsAuthProvider: clientId=${this.clientId}, endpoint=${this.tokenEndpoint}]`;
  }

  /**
   * Prevents inspection of credentials in Node.js.
   *
   * @returns Redacted representation
   */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return this.toString();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a Client Credentials authentication provider.
 *
 * @param options - Client credentials options
 * @returns A new ClientCredentialsAuthProvider instance
 * @throws {Error} If any required parameter is invalid
 *
 * @example
 * ```typescript
 * import { createClientCredentialsAuthProvider } from '@llmdevops/weaviate-integration/auth';
 *
 * const provider = createClientCredentialsAuthProvider({
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-client-secret',
 *   tokenEndpoint: 'https://auth.weaviate.io/oauth2/token',
 *   scopes: ['weaviate.read', 'weaviate.write'],
 * });
 *
 * const headers = await provider.getAuthHeaders();
 * ```
 */
export function createClientCredentialsAuthProvider(options: {
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
  scopes?: string[];
}): ClientCredentialsAuthProvider {
  return new ClientCredentialsAuthProvider(options);
}

/**
 * Creates a Client Credentials provider from environment variables.
 *
 * Expected environment variables:
 * - WEAVIATE_CLIENT_ID (or custom prefix)
 * - WEAVIATE_CLIENT_SECRET (or custom prefix)
 * - WEAVIATE_TOKEN_ENDPOINT (or custom prefix)
 * - WEAVIATE_SCOPES (optional, comma-separated)
 *
 * @param envPrefix - Environment variable prefix (default: 'WEAVIATE')
 * @returns A new ClientCredentialsAuthProvider instance
 * @throws {Error} If any required environment variable is not set
 *
 * @example
 * ```typescript
 * import { createClientCredentialsAuthProviderFromEnv } from '@llmdevops/weaviate-integration/auth';
 *
 * // Uses WEAVIATE_* environment variables
 * const provider = createClientCredentialsAuthProviderFromEnv();
 *
 * // Or use custom prefix
 * const provider2 = createClientCredentialsAuthProviderFromEnv('MY_APP');
 * // Expects: MY_APP_CLIENT_ID, MY_APP_CLIENT_SECRET, MY_APP_TOKEN_ENDPOINT
 * ```
 */
export function createClientCredentialsAuthProviderFromEnv(
  envPrefix: string = 'WEAVIATE'
): ClientCredentialsAuthProvider {
  const clientId = process.env[`${envPrefix}_CLIENT_ID`];
  const clientSecret = process.env[`${envPrefix}_CLIENT_SECRET`];
  const tokenEndpoint = process.env[`${envPrefix}_TOKEN_ENDPOINT`];
  const scopesStr = process.env[`${envPrefix}_SCOPES`];

  if (!clientId) {
    throw new Error(`Environment variable ${envPrefix}_CLIENT_ID is not set`);
  }
  if (!clientSecret) {
    throw new Error(`Environment variable ${envPrefix}_CLIENT_SECRET is not set`);
  }
  if (!tokenEndpoint) {
    throw new Error(`Environment variable ${envPrefix}_TOKEN_ENDPOINT is not set`);
  }

  const scopes = scopesStr ? scopesStr.split(',').map(s => s.trim()) : undefined;

  return new ClientCredentialsAuthProvider({
    clientId,
    clientSecret,
    tokenEndpoint,
    scopes,
  });
}
