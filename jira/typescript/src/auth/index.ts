/**
 * Authentication providers for Jira client following SPARC specification.
 *
 * Supports API token, OAuth 2.0, and Atlassian Connect JWT authentication.
 */

import { AuthMethod, SecretString } from '../config/index.js';
import { AuthenticationError, TokenExpiredError, TokenRefreshFailedError } from '../errors/index.js';
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
// API Token Auth Provider
// ============================================================================

/**
 * API token authentication provider using Basic auth.
 */
export class ApiTokenAuthProvider implements AuthProvider {
  private readonly email: string;
  private readonly token: SecretString;

  constructor(email: string, token: string) {
    this.email = email;
    this.token = new SecretString(token);
  }

  async getAuthHeaders(): Promise<Headers> {
    const credentials = `${this.email}:${this.token.expose()}`;
    const encoded = Buffer.from(credentials).toString('base64');
    return {
      Authorization: `Basic ${encoded}`,
    };
  }

  isValid(): boolean {
    return true; // API tokens don't expire
  }
}

// ============================================================================
// OAuth 2.0 Auth Provider
// ============================================================================

/**
 * OAuth token state.
 */
interface OAuthTokenState {
  accessToken: string;
  expiresAt: number;
}

/**
 * OAuth 2.0 authentication provider with automatic token refresh.
 */
export class OAuthAuthProvider implements AuthProvider {
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
    tokenUrl?: string;
    logger?: Logger;
  }) {
    this.clientId = options.clientId;
    this.clientSecret = new SecretString(options.clientSecret);
    this.refreshToken = new SecretString(options.refreshToken);
    this.tokenUrl = options.tokenUrl ?? 'https://auth.atlassian.com/oauth/token';
    this.logger = options.logger ?? new NoopLogger();

    if (options.accessToken) {
      this.tokenState = {
        accessToken: options.accessToken,
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
        expires_in: number;
        token_type: string;
      };

      this.tokenState = {
        accessToken: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      };

      this.logger.info('OAuth token refreshed successfully');
    } catch (error) {
      if (error instanceof TokenRefreshFailedError) {
        throw error;
      }
      throw new TokenRefreshFailedError(`Token refresh failed: ${(error as Error).message}`);
    }
  }
}

// ============================================================================
// Atlassian Connect JWT Auth Provider
// ============================================================================

/**
 * Atlassian Connect JWT authentication provider.
 */
export class ConnectJwtAuthProvider implements AuthProvider {
  private readonly sharedSecret: SecretString;
  private readonly issuer: string;
  private readonly logger: Logger;

  constructor(options: {
    sharedSecret: string;
    issuer: string;
    logger?: Logger;
  }) {
    this.sharedSecret = new SecretString(options.sharedSecret);
    this.issuer = options.issuer;
    this.logger = options.logger ?? new NoopLogger();
  }

  async getAuthHeaders(): Promise<Headers> {
    const jwt = this.createJwt();
    return {
      Authorization: `JWT ${jwt}`,
    };
  }

  isValid(): boolean {
    return true; // JWT is generated fresh each time
  }

  private createJwt(): string {
    const now = Math.floor(Date.now() / 1000);

    // JWT header
    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };

    // JWT payload
    const payload = {
      iss: this.issuer,
      iat: now,
      exp: now + 180, // 3 minutes
    };

    const headerBase64 = this.base64UrlEncode(JSON.stringify(header));
    const payloadBase64 = this.base64UrlEncode(JSON.stringify(payload));
    const signatureInput = `${headerBase64}.${payloadBase64}`;

    // Create HMAC-SHA256 signature
    const crypto = require('crypto');
    const signature = crypto
      .createHmac('sha256', this.sharedSecret.expose())
      .update(signatureInput)
      .digest('base64url');

    return `${signatureInput}.${signature}`;
  }

  private base64UrlEncode(str: string): string {
    return Buffer.from(str)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
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
    case 'api_token':
      return new ApiTokenAuthProvider(auth.email, auth.token);

    case 'oauth':
      return new OAuthAuthProvider({
        clientId: auth.clientId,
        clientSecret: auth.clientSecret,
        refreshToken: auth.refreshToken,
        accessToken: auth.accessToken,
        logger,
      });

    case 'connect_jwt':
      return new ConnectJwtAuthProvider({
        sharedSecret: auth.sharedSecret,
        issuer: auth.issuer,
        logger,
      });

    default:
      throw new AuthenticationError('Unknown authentication method');
  }
}
