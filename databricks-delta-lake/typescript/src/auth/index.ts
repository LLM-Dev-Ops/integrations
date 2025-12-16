/**
 * Databricks Delta Lake Authentication Module
 *
 * Provides authentication providers for various Databricks authentication methods:
 * - Personal Access Token (PAT) authentication
 * - OAuth 2.0 M2M authentication with token refresh
 * - Azure AD Service Principal authentication
 *
 * @module @llmdevops/databricks-integration/auth
 *
 * @example
 * ```typescript
 * import {
 *   createAuthProvider,
 *   PatAuthProvider,
 *   OAuthProvider,
 *   ServicePrincipalProvider
 * } from '@llmdevops/databricks-integration/auth';
 *
 * // Personal Access Token
 * const patProvider = new PatAuthProvider('dapi...');
 * const token = await patProvider.getToken();
 *
 * // OAuth 2.0 M2M
 * const oauthProvider = new OAuthProvider({
 *   workspaceUrl: 'https://my-workspace.cloud.databricks.com',
 *   clientId: 'my-client-id',
 *   clientSecret: 'my-client-secret',
 *   scopes: ['sql', 'all-apis']
 * });
 *
 * // Azure Service Principal
 * const spProvider = new ServicePrincipalProvider({
 *   tenantId: 'my-tenant-id',
 *   clientId: 'my-client-id',
 *   clientSecret: 'my-client-secret'
 * });
 * ```
 */

// ============================================================================
// Secure Token Handling
// ============================================================================

/**
 * SecretString class for secure handling of sensitive tokens.
 * Prevents accidental logging or serialization of secrets.
 */
export class SecretString {
  private readonly value: string;

  constructor(value: string) {
    if (!value || value.trim() === '') {
      throw new Error('SecretString cannot be empty');
    }
    this.value = value;
  }

  /**
   * Exposes the secret value. Use with caution.
   */
  expose(): string {
    return this.value;
  }

  /**
   * Prevents accidental serialization of secrets.
   */
  toJSON(): string {
    return '***REDACTED***';
  }

  /**
   * Prevents accidental logging of secrets.
   */
  toString(): string {
    return '***REDACTED***';
  }

  /**
   * Prevents inspection of secrets.
   */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return '***REDACTED***';
  }
}

// ============================================================================
// Core Types
// ============================================================================

/**
 * Cached token interface with expiration tracking.
 */
export interface CachedToken {
  /** The access token */
  token: string;
  /** Token expiration timestamp (milliseconds since epoch) */
  expiresAt: number;
  /** Token type (e.g., 'Bearer') */
  tokenType?: string;
}

/**
 * Configuration for Personal Access Token authentication.
 */
export interface PatAuthConfig {
  /** Personal Access Token */
  token: string;
}

/**
 * Configuration for OAuth 2.0 M2M authentication.
 */
export interface OAuthConfig {
  /** Databricks workspace URL */
  workspaceUrl: string;
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret */
  clientSecret: string;
  /** OAuth scopes (default: ['all-apis']) */
  scopes?: string[];
}

/**
 * Configuration for Azure AD Service Principal authentication.
 */
export interface ServicePrincipalConfig {
  /** Azure AD tenant ID */
  tenantId: string;
  /** Service Principal client ID */
  clientId: string;
  /** Service Principal client secret */
  clientSecret: string;
}

/**
 * Union type for all authentication configurations.
 */
export type AuthConfig =
  | { method: 'pat'; config: PatAuthConfig }
  | { method: 'oauth'; config: OAuthConfig }
  | { method: 'service_principal'; config: ServicePrincipalConfig };

// ============================================================================
// AuthProvider Interface
// ============================================================================

/**
 * Interface that all authentication providers must implement.
 */
export interface AuthProvider {
  /**
   * Gets the current valid token.
   * Automatically refreshes if expired or near expiration.
   *
   * @returns Promise resolving to the access token
   * @throws {AuthenticationError} If token cannot be obtained
   */
  getToken(): Promise<string>;

  /**
   * Forces a token refresh regardless of expiration status.
   *
   * @returns Promise that resolves when refresh is complete
   * @throws {AuthenticationError} If token refresh fails
   */
  refreshToken(): Promise<void>;

  /**
   * Gets the token type (e.g., 'Bearer', 'Token').
   *
   * @returns The token type string
   */
  tokenType(): string;

  /**
   * Checks if the current token is expired or needs refresh.
   *
   * @returns true if token needs refresh, false otherwise
   */
  isExpired(): boolean;
}

// ============================================================================
// Personal Access Token Provider
// ============================================================================

/**
 * Authentication provider for Personal Access Tokens.
 *
 * PAT authentication uses a static token that doesn't expire.
 * This is the simplest authentication method but requires manual token rotation.
 *
 * @example
 * ```typescript
 * const provider = new PatAuthProvider('dapi1234567890abcdef');
 * const token = await provider.getToken();
 * console.log(provider.tokenType()); // 'Bearer'
 * ```
 */
export class PatAuthProvider implements AuthProvider {
  private readonly token: SecretString;

  /**
   * Creates a new PAT authentication provider.
   *
   * @param token - The Personal Access Token
   * @throws {Error} If token is empty
   */
  constructor(token: string) {
    if (!token || token.trim() === '') {
      throw new Error('Personal Access Token cannot be empty');
    }
    this.token = new SecretString(token);
  }

  /**
   * Gets the PAT token.
   * Since PATs don't expire, this always returns the configured token.
   */
  async getToken(): Promise<string> {
    return this.token.expose();
  }

  /**
   * No-op for PAT since tokens don't expire.
   * This method exists to satisfy the AuthProvider interface.
   */
  async refreshToken(): Promise<void> {
    // PAT tokens don't need refresh
  }

  /**
   * Returns the token type for PAT authentication.
   */
  tokenType(): string {
    return 'Bearer';
  }

  /**
   * PAT tokens never expire (until manually rotated).
   */
  isExpired(): boolean {
    return false;
  }
}

// ============================================================================
// OAuth 2.0 M2M Provider
// ============================================================================

/**
 * OAuth token response from Databricks.
 */
interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

/**
 * Authentication provider for OAuth 2.0 Machine-to-Machine flow.
 *
 * Implements the client credentials grant type with automatic token refresh
 * using a 60-second buffer before expiration.
 *
 * @example
 * ```typescript
 * const provider = new OAuthProvider({
 *   workspaceUrl: 'https://my-workspace.cloud.databricks.com',
 *   clientId: 'my-client-id',
 *   clientSecret: 'my-client-secret',
 *   scopes: ['sql', 'all-apis']
 * });
 *
 * const token = await provider.getToken();
 * ```
 */
export class OAuthProvider implements AuthProvider {
  private readonly workspaceUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: SecretString;
  private readonly scopes: string[];
  private cachedToken: CachedToken | null = null;

  /**
   * Creates a new OAuth authentication provider.
   *
   * @param config - OAuth configuration
   * @throws {Error} If configuration is invalid
   */
  constructor(config: OAuthConfig) {
    this.validateConfig(config);
    this.workspaceUrl = config.workspaceUrl.replace(/\/$/, ''); // Remove trailing slash
    this.clientId = config.clientId;
    this.clientSecret = new SecretString(config.clientSecret);
    this.scopes = config.scopes || ['all-apis'];
  }

  /**
   * Validates the OAuth configuration.
   */
  private validateConfig(config: OAuthConfig): void {
    if (!config.workspaceUrl || config.workspaceUrl.trim() === '') {
      throw new Error('Workspace URL is required for OAuth authentication');
    }
    if (!config.clientId || config.clientId.trim() === '') {
      throw new Error('Client ID is required for OAuth authentication');
    }
    if (!config.clientSecret || config.clientSecret.trim() === '') {
      throw new Error('Client secret is required for OAuth authentication');
    }
  }

  /**
   * Gets the current valid OAuth token.
   * Automatically refreshes if expired or within 60 seconds of expiration.
   */
  async getToken(): Promise<string> {
    if (!this.cachedToken || this.isExpired()) {
      await this.refreshToken();
    }
    return this.cachedToken!.token;
  }

  /**
   * Forces a token refresh by requesting a new token from Databricks.
   *
   * OAuth flow:
   * POST {workspace}/oidc/v1/token
   * Body: {
   *   grant_type: "client_credentials",
   *   client_id: client_id,
   *   client_secret: client_secret,
   *   scope: scopes.join(" ")
   * }
   */
  async refreshToken(): Promise<void> {
    const tokenUrl = `${this.workspaceUrl}/oidc/v1/token`;

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret.expose(),
      scope: this.scopes.join(' '),
    });

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OAuth token request failed: ${response.status} ${response.statusText}. ${errorText}`
        );
      }

      const data: OAuthTokenResponse = await response.json();

      // Calculate expiration time with token lifetime
      const expiresAt = Date.now() + data.expires_in * 1000;

      this.cachedToken = {
        token: data.access_token,
        expiresAt,
        tokenType: data.token_type,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to refresh OAuth token: ${message}`);
    }
  }

  /**
   * Returns the OAuth token type (usually 'Bearer').
   */
  tokenType(): string {
    return this.cachedToken?.tokenType || 'Bearer';
  }

  /**
   * Checks if the token is expired or within 60 seconds of expiration.
   * Uses a 60-second buffer to ensure token validity.
   */
  isExpired(): boolean {
    if (!this.cachedToken) {
      return true;
    }

    // 60-second buffer before expiration
    const bufferMs = 60 * 1000;
    return Date.now() >= this.cachedToken.expiresAt - bufferMs;
  }
}

// ============================================================================
// Azure AD Service Principal Provider
// ============================================================================

/**
 * Azure AD token response.
 */
interface AzureTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  resource?: string;
}

/**
 * Authentication provider for Azure AD Service Principal.
 *
 * Uses Azure AD OAuth 2.0 client credentials flow to obtain tokens
 * for accessing Databricks on Azure.
 *
 * The Databricks resource ID used is: 2ff814a6-3304-4ab8-85cb-cd0e6f879c1d
 *
 * @example
 * ```typescript
 * const provider = new ServicePrincipalProvider({
 *   tenantId: 'my-tenant-id',
 *   clientId: 'my-client-id',
 *   clientSecret: 'my-client-secret'
 * });
 *
 * const token = await provider.getToken();
 * ```
 */
export class ServicePrincipalProvider implements AuthProvider {
  private readonly tenantId: string;
  private readonly clientId: string;
  private readonly clientSecret: SecretString;
  private cachedToken: CachedToken | null = null;

  /**
   * Databricks resource ID for Azure AD authentication.
   * This is the fixed Azure AD app ID for Databricks.
   */
  private static readonly DATABRICKS_RESOURCE_ID = '2ff814a6-3304-4ab8-85cb-cd0e6f879c1d';

  /**
   * Creates a new Service Principal authentication provider.
   *
   * @param config - Service Principal configuration
   * @throws {Error} If configuration is invalid
   */
  constructor(config: ServicePrincipalConfig) {
    this.validateConfig(config);
    this.tenantId = config.tenantId;
    this.clientId = config.clientId;
    this.clientSecret = new SecretString(config.clientSecret);
  }

  /**
   * Validates the Service Principal configuration.
   */
  private validateConfig(config: ServicePrincipalConfig): void {
    if (!config.tenantId || config.tenantId.trim() === '') {
      throw new Error('Tenant ID is required for Service Principal authentication');
    }
    if (!config.clientId || config.clientId.trim() === '') {
      throw new Error('Client ID is required for Service Principal authentication');
    }
    if (!config.clientSecret || config.clientSecret.trim() === '') {
      throw new Error('Client secret is required for Service Principal authentication');
    }
  }

  /**
   * Gets the current valid Azure AD token.
   * Automatically refreshes if expired or within 60 seconds of expiration.
   */
  async getToken(): Promise<string> {
    if (!this.cachedToken || this.isExpired()) {
      await this.refreshToken();
    }
    return this.cachedToken!.token;
  }

  /**
   * Forces a token refresh by requesting a new token from Azure AD.
   *
   * Service Principal flow:
   * POST https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token
   * Body: {
   *   grant_type: "client_credentials",
   *   client_id: client_id,
   *   client_secret: client_secret,
   *   scope: "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d/.default"
   * }
   */
  async refreshToken(): Promise<void> {
    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret.expose(),
      scope: `${ServicePrincipalProvider.DATABRICKS_RESOURCE_ID}/.default`,
    });

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Azure AD token request failed: ${response.status} ${response.statusText}. ${errorText}`
        );
      }

      const data: AzureTokenResponse = await response.json();

      // Calculate expiration time with token lifetime
      const expiresAt = Date.now() + data.expires_in * 1000;

      this.cachedToken = {
        token: data.access_token,
        expiresAt,
        tokenType: data.token_type,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to refresh Azure AD token: ${message}`);
    }
  }

  /**
   * Returns the Azure AD token type (usually 'Bearer').
   */
  tokenType(): string {
    return this.cachedToken?.tokenType || 'Bearer';
  }

  /**
   * Checks if the token is expired or within 60 seconds of expiration.
   * Uses a 60-second buffer to ensure token validity.
   */
  isExpired(): boolean {
    if (!this.cachedToken) {
      return true;
    }

    // 60-second buffer before expiration
    const bufferMs = 60 * 1000;
    return Date.now() >= this.cachedToken.expiresAt - bufferMs;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates an authentication provider based on the configuration.
 *
 * This is a convenience factory function that automatically creates the
 * appropriate authentication provider based on the method specified.
 *
 * @param config - Authentication configuration
 * @returns An AuthProvider instance
 * @throws {Error} If configuration is invalid or method is not supported
 *
 * @example
 * ```typescript
 * // Create PAT provider
 * const patProvider = createAuthProvider({
 *   method: 'pat',
 *   config: { token: 'dapi...' }
 * });
 *
 * // Create OAuth provider
 * const oauthProvider = createAuthProvider({
 *   method: 'oauth',
 *   config: {
 *     workspaceUrl: 'https://my-workspace.cloud.databricks.com',
 *     clientId: 'my-client-id',
 *     clientSecret: 'my-client-secret'
 *   }
 * });
 *
 * // Create Service Principal provider
 * const spProvider = createAuthProvider({
 *   method: 'service_principal',
 *   config: {
 *     tenantId: 'my-tenant-id',
 *     clientId: 'my-client-id',
 *     clientSecret: 'my-client-secret'
 *   }
 * });
 * ```
 */
export function createAuthProvider(config: AuthConfig): AuthProvider {
  switch (config.method) {
    case 'pat':
      return new PatAuthProvider(config.config.token);

    case 'oauth':
      return new OAuthProvider(config.config);

    case 'service_principal':
      return new ServicePrincipalProvider(config.config);

    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = config;
      throw new Error(
        `Unsupported authentication method: ${(config as AuthConfig).method}`
      );
  }
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Base error class for authentication errors.
 */
export class AuthenticationError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'AuthenticationError';

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when authentication credentials are invalid.
 */
export class InvalidCredentialsError extends AuthenticationError {
  constructor(message: string = 'Invalid authentication credentials') {
    super(message);
    this.name = 'InvalidCredentialsError';
  }
}

/**
 * Error thrown when a token has expired.
 */
export class TokenExpiredError extends AuthenticationError {
  constructor(message: string = 'Authentication token has expired') {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

/**
 * Error thrown when token refresh fails.
 */
export class TokenRefreshError extends AuthenticationError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'TokenRefreshError';
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Checks if an error is an authentication error.
 */
export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

/**
 * Validates a token string format (basic validation).
 *
 * @param token - Token to validate
 * @returns true if token appears valid, false otherwise
 */
export function validateTokenFormat(token: string): boolean {
  if (!token || token.trim() === '') {
    return false;
  }

  // Token should be at least 20 characters and contain no whitespace
  return token.length >= 20 && !/\s/.test(token);
}

/**
 * Creates a masked version of a token for logging purposes.
 *
 * @param token - Token to mask
 * @param visibleChars - Number of characters to show at start and end (default: 4)
 * @returns Masked token string
 *
 * @example
 * ```typescript
 * maskToken('dapi1234567890abcdef') // 'dapi...cdef'
 * ```
 */
export function maskToken(token: string, visibleChars: number = 4): string {
  if (token.length <= visibleChars * 2) {
    return '***';
  }
  const start = token.substring(0, visibleChars);
  const end = token.substring(token.length - visibleChars);
  return `${start}...${end}`;
}
