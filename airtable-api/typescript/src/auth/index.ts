/**
 * Authentication providers for Airtable client following SPARC specification.
 *
 * Supports Personal Access Token (PAT) and OAuth 2.0 authentication.
 */

import { AuthMethod, SecretString } from '../config/index.js';
import { Logger, NoopLogger } from '../observability/index.js';

// ============================================================================
// Auth Provider Interface
// ============================================================================

/**
 * Request headers type.
 */
export type Headers = Record<string, string>;

/**
 * Auth provider interface.
 */
export interface AuthProvider {
  /** Get authentication headers for a request */
  getAuthHeaders(): Promise<Headers>;
  /** Refresh credentials if applicable */
  refreshToken?(): Promise<void>;
  /** Check if credentials are expired */
  isExpired?(): boolean;
}

// ============================================================================
// Personal Access Token Auth Provider
// ============================================================================

/**
 * Personal Access Token authentication provider.
 *
 * Uses Bearer token authentication with Airtable's Personal Access Tokens.
 * PATs do not expire and do not require refresh logic.
 */
export class PatAuthProvider implements AuthProvider {
  private readonly token: SecretString;

  /**
   * Creates a new PAT authentication provider.
   * @param token - The Personal Access Token
   */
  constructor(token: SecretString) {
    this.token = token;
  }

  /**
   * Returns authentication headers with Bearer token.
   * @returns Headers object with Authorization header
   */
  async getAuthHeaders(): Promise<Headers> {
    return {
      'Authorization': `Bearer ${this.token.expose()}`,
    };
  }
}

// ============================================================================
// OAuth 2.0 Auth Provider
// ============================================================================

/**
 * OAuth 2.0 authentication provider with token expiration tracking.
 *
 * Supports automatic token refresh when tokens expire.
 */
export class OAuthAuthProvider implements AuthProvider {
  private readonly accessToken: SecretString;
  private readonly refreshTokenValue?: SecretString;
  private readonly expiresAt?: Date;
  private readonly logger: Logger;

  /**
   * Creates a new OAuth authentication provider.
   * @param accessToken - The OAuth access token
   * @param refreshTokenValue - Optional refresh token for token renewal
   * @param expiresAt - Optional expiration date for the access token
   * @param logger - Optional logger instance
   */
  constructor(
    accessToken: SecretString,
    refreshTokenValue?: SecretString,
    expiresAt?: Date,
    logger?: Logger
  ) {
    this.accessToken = accessToken;
    this.refreshTokenValue = refreshTokenValue;
    this.expiresAt = expiresAt;
    this.logger = logger ?? new NoopLogger();
  }

  /**
   * Returns authentication headers with Bearer token.
   * @returns Headers object with Authorization header
   */
  async getAuthHeaders(): Promise<Headers> {
    return {
      'Authorization': `Bearer ${this.accessToken.expose()}`,
    };
  }

  /**
   * Checks if the access token is expired.
   * @returns true if token is expired or will expire within 60 seconds
   */
  isExpired(): boolean {
    if (!this.expiresAt) {
      return false; // If no expiration date, assume token is valid
    }
    // Consider token expired if it expires within 60 seconds
    const now = new Date();
    const bufferMs = 60000; // 60 seconds
    return this.expiresAt.getTime() - now.getTime() < bufferMs;
  }

  /**
   * Refreshes the access token using the refresh token.
   *
   * @throws Error indicating refresh is not implemented
   * @remarks This is a stub implementation. Actual token refresh logic
   * should be implemented based on Airtable's OAuth 2.0 flow.
   */
  async refreshToken(): Promise<void> {
    this.logger.debug('OAuth token refresh requested');
    throw new Error('OAuth token refresh not implemented. Please implement token refresh logic based on Airtable OAuth 2.0 requirements.');
  }
}

// ============================================================================
// Auth Provider Factory
// ============================================================================

/**
 * Creates an auth provider from an auth method configuration.
 *
 * Factory function that instantiates the appropriate authentication provider
 * based on the provided authentication method.
 *
 * @param auth - The authentication method configuration
 * @param logger - Optional logger instance for observability
 * @returns An AuthProvider implementation
 *
 * @example
 * ```typescript
 * // Create PAT auth provider
 * const patAuth = createAuthProvider({
 *   type: 'pat',
 *   token: 'your-personal-access-token'
 * });
 *
 * // Create OAuth auth provider
 * const oauthAuth = createAuthProvider({
 *   type: 'oauth',
 *   accessToken: 'access-token',
 *   refreshToken: 'refresh-token',
 *   expiresAt: new Date('2024-12-31')
 * }, logger);
 * ```
 */
export function createAuthProvider(auth: AuthMethod, logger?: Logger): AuthProvider {
  switch (auth.type) {
    case 'pat':
      return new PatAuthProvider(auth.token);

    case 'oauth':
      return new OAuthAuthProvider(
        auth.accessToken,
        auth.refreshToken,
        auth.expiresAt,
        logger
      );

    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = auth;
      throw new Error(`Unknown authentication method: ${(_exhaustive as any).type}`);
  }
}
