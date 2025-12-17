/**
 * Authentication providers for Salesforce client following SPARC specification.
 *
 * Supports JWT Bearer flow and OAuth 2.0 refresh token authentication.
 */

import * as crypto from 'crypto';
import { AuthMethod, SecretString } from '../config/index.js';
import { AuthenticationError, TokenRefreshFailedError } from '../errors/index.js';
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
  refresh?(): Promise<void>;
  /** Check if credentials are valid/not expired */
  isValid(): boolean;
}

// ============================================================================
// JWT Bearer Auth Provider
// ============================================================================

/**
 * OAuth token state.
 */
interface OAuthTokenState {
  accessToken: string;
  instanceUrl: string;
  expiresAt: number;
}

/**
 * JWT Bearer authentication provider for Salesforce.
 *
 * Uses the OAuth 2.0 JWT Bearer flow to obtain access tokens.
 * Creates a JWT assertion signed with RS256 using the private key,
 * then exchanges it for an access token.
 */
export class JwtBearerAuthProvider implements AuthProvider {
  private readonly clientId: string;
  private readonly privateKey: SecretString;
  private readonly username: string;
  private readonly tokenUrl: string;
  private readonly logger: Logger;
  private tokenState: OAuthTokenState | null = null;
  private refreshPromise: Promise<void> | null = null;

  constructor(options: {
    clientId: string;
    privateKey: string;
    username: string;
    instanceUrl?: string;
    tokenUrl?: string;
    logger?: Logger;
  }) {
    this.clientId = options.clientId;
    this.privateKey = new SecretString(options.privateKey);
    this.username = options.username;
    // Instance URL comes from token response in JWT Bearer flow
    this.tokenUrl = options.tokenUrl ?? 'https://login.salesforce.com/services/oauth2/token';
    this.logger = options.logger ?? new NoopLogger();
  }

  async getAuthHeaders(): Promise<Headers> {
    if (!this.isValid()) {
      await this.refresh();
    }

    if (!this.tokenState) {
      throw new AuthenticationError('No valid OAuth token available');
    }

    return {
      Authorization: `Bearer ${this.tokenState.accessToken}`,
    };
  }

  isValid(): boolean {
    if (!this.tokenState) return false;
    // Consider token invalid if it expires within 60 seconds
    return this.tokenState.expiresAt > Date.now() + 60000;
  }

  async refresh(): Promise<void> {
    // Prevent concurrent refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefresh();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<void> {
    this.logger.debug('Refreshing JWT Bearer token');

    // Create JWT assertion
    const jwt = this.createJwtAssertion();

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    });

    try {
      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error('JWT Bearer token exchange failed', { status: response.status, error: errorText });
        throw new TokenRefreshFailedError(`Token exchange failed: ${response.status}`);
      }

      const data = await response.json() as {
        access_token: string;
        instance_url: string;
        token_type: string;
        issued_at: string;
      };

      // Salesforce doesn't return expires_in for JWT Bearer flow
      // Tokens are typically valid for 15 minutes (900 seconds)
      const expiresIn = 900;

      this.tokenState = {
        accessToken: data.access_token,
        instanceUrl: data.instance_url,
        expiresAt: Date.now() + expiresIn * 1000,
      };

      this.logger.info('JWT Bearer token obtained successfully');
    } catch (error) {
      if (error instanceof TokenRefreshFailedError) {
        throw error;
      }
      throw new TokenRefreshFailedError(`Token exchange failed: ${(error as Error).message}`);
    }
  }

  /**
   * Creates a JWT assertion for the JWT Bearer flow.
   *
   * JWT Claims:
   * - iss: OAuth client_id (consumer key)
   * - sub: Salesforce username
   * - aud: Token endpoint URL
   * - exp: Expiration time (3 minutes from now)
   */
  private createJwtAssertion(): string {
    const now = Math.floor(Date.now() / 1000);

    // JWT header
    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };

    // JWT payload
    const payload = {
      iss: this.clientId,
      sub: this.username,
      aud: this.tokenUrl,
      exp: now + 180, // 3 minutes
    };

    const headerBase64 = this.base64UrlEncode(JSON.stringify(header));
    const payloadBase64 = this.base64UrlEncode(JSON.stringify(payload));
    const signatureInput = `${headerBase64}.${payloadBase64}`;

    // Create RS256 signature
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    sign.end();

    const signature = sign.sign(this.privateKey.expose(), 'base64url');

    return `${signatureInput}.${signature}`;
  }

  private base64UrlEncode(str: string): string {
    return Buffer.from(str)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Gets the instance URL from the last token response.
   */
  getInstanceUrl(): string | undefined {
    return this.tokenState?.instanceUrl;
  }
}

// ============================================================================
// Refresh Token Auth Provider
// ============================================================================

/**
 * OAuth 2.0 Refresh Token authentication provider for Salesforce.
 *
 * Uses the refresh_token grant type to obtain and refresh access tokens.
 */
export class RefreshTokenAuthProvider implements AuthProvider {
  private readonly clientId: string;
  private readonly clientSecret: SecretString;
  private readonly refreshToken: SecretString;
  private readonly tokenUrl: string;
  private tokenState: OAuthTokenState | null = null;
  private refreshPromise: Promise<void> | null = null;
  private readonly logger: Logger;

  constructor(options: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    accessToken?: string;
    instanceUrl?: string;
    tokenUrl?: string;
    logger?: Logger;
  }) {
    this.clientId = options.clientId;
    this.clientSecret = new SecretString(options.clientSecret);
    this.refreshToken = new SecretString(options.refreshToken);
    this.tokenUrl = options.tokenUrl ?? 'https://login.salesforce.com/services/oauth2/token';
    this.logger = options.logger ?? new NoopLogger();

    if (options.accessToken && options.instanceUrl) {
      this.tokenState = {
        accessToken: options.accessToken,
        instanceUrl: options.instanceUrl,
        expiresAt: Date.now() + 3600 * 1000, // Assume 1 hour if not specified
      };
    }
  }

  async getAuthHeaders(): Promise<Headers> {
    if (!this.isValid()) {
      await this.refresh();
    }

    if (!this.tokenState) {
      throw new AuthenticationError('No valid OAuth token available');
    }

    return {
      Authorization: `Bearer ${this.tokenState.accessToken}`,
    };
  }

  isValid(): boolean {
    if (!this.tokenState) return false;
    // Consider token invalid if it expires within 60 seconds
    return this.tokenState.expiresAt > Date.now() + 60000;
  }

  async refresh(): Promise<void> {
    // Prevent concurrent refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefresh();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<void> {
    this.logger.debug('Refreshing OAuth token');

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret.expose(),
      refresh_token: this.refreshToken.expose(),
    });

    try {
      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error('OAuth token refresh failed', { status: response.status, error: errorText });
        throw new TokenRefreshFailedError(`Token refresh failed: ${response.status}`);
      }

      const data = await response.json() as {
        access_token: string;
        instance_url: string;
        token_type: string;
        issued_at: string;
      };

      // Salesforce doesn't always return expires_in
      // Access tokens typically last 2 hours (7200 seconds)
      const expiresIn = 7200;

      this.tokenState = {
        accessToken: data.access_token,
        instanceUrl: data.instance_url,
        expiresAt: Date.now() + expiresIn * 1000,
      };

      this.logger.info('OAuth token refreshed successfully');
    } catch (error) {
      if (error instanceof TokenRefreshFailedError) {
        throw error;
      }
      throw new TokenRefreshFailedError(`Token refresh failed: ${(error as Error).message}`);
    }
  }

  /**
   * Gets the instance URL from the last token response.
   */
  getInstanceUrl(): string | undefined {
    return this.tokenState?.instanceUrl;
  }
}

// ============================================================================
// Token Manager (Optional Shared Token Caching)
// ============================================================================

/**
 * Token cache entry.
 */
interface TokenCacheEntry {
  accessToken: string;
  instanceUrl: string;
  expiresAt: number;
}

/**
 * Token manager for shared token caching.
 *
 * Provides centralized token storage with instance_url as the key.
 * Useful for sharing tokens across multiple auth provider instances.
 */
export class TokenManager {
  private readonly cache: Map<string, TokenCacheEntry> = new Map();
  private readonly logger: Logger;

  constructor(options: {
    logger?: Logger;
  } = {}) {
    this.logger = options.logger ?? new NoopLogger();
  }

  /**
   * Gets a cached token for the given instance URL.
   */
  getToken(instanceUrl: string): TokenCacheEntry | undefined {
    const entry = this.cache.get(instanceUrl);

    if (!entry) {
      this.logger.debug('No cached token found', { instanceUrl });
      return undefined;
    }

    // Check if token is expired (with 60s buffer)
    if (entry.expiresAt <= Date.now() + 60000) {
      this.logger.debug('Cached token expired', { instanceUrl });
      this.cache.delete(instanceUrl);
      return undefined;
    }

    this.logger.debug('Using cached token', { instanceUrl });
    return entry;
  }

  /**
   * Sets a token in the cache.
   */
  setToken(instanceUrl: string, token: TokenCacheEntry): void {
    this.cache.set(instanceUrl, token);
    this.logger.debug('Token cached', { instanceUrl });
  }

  /**
   * Clears a token from the cache.
   */
  clearToken(instanceUrl: string): void {
    this.cache.delete(instanceUrl);
    this.logger.debug('Token cleared', { instanceUrl });
  }

  /**
   * Clears all tokens from the cache.
   */
  clearAll(): void {
    this.cache.clear();
    this.logger.debug('All tokens cleared');
  }

  /**
   * Gets the number of cached tokens.
   */
  size(): number {
    return this.cache.size;
  }
}

// ============================================================================
// Auth Provider Factory
// ============================================================================

/**
 * Creates an auth provider from an auth method configuration.
 */
export function createAuthProvider(auth: AuthMethod, logger?: Logger): AuthProvider {
  switch (auth.type) {
    case 'jwt_bearer':
      return new JwtBearerAuthProvider({
        clientId: auth.clientId,
        privateKey: auth.privateKey,
        username: auth.username,
        instanceUrl: auth.instanceUrl,
        tokenUrl: auth.tokenUrl,
        logger,
      });

    case 'refresh_token':
      return new RefreshTokenAuthProvider({
        clientId: auth.clientId,
        clientSecret: auth.clientSecret,
        refreshToken: auth.refreshToken,
        accessToken: auth.accessToken,
        instanceUrl: auth.instanceUrl,
        tokenUrl: auth.tokenUrl,
        logger,
      });

    default:
      throw new AuthenticationError('Unknown authentication method');
  }
}
