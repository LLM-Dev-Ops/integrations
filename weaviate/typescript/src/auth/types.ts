/**
 * Authentication Types and Interfaces
 *
 * Defines the core types and interfaces for Weaviate authentication.
 * @module @llmdevops/weaviate-integration/auth/types
 */

// ============================================================================
// Auth Provider Interface
// ============================================================================

/**
 * Interface that all authentication providers must implement.
 *
 * Provides a consistent way to obtain authentication headers for Weaviate API requests.
 */
export interface AuthProvider {
  /**
   * Gets the authentication headers for API requests.
   * This may trigger a token refresh if credentials are expired.
   *
   * @returns Promise resolving to headers object
   * @throws {AuthenticationError} If credentials cannot be obtained
   */
  getAuthHeaders(): Promise<Record<string, string>>;

  /**
   * Checks if the current credentials are expired.
   *
   * @returns true if credentials are expired, false otherwise
   */
  isExpired(): boolean;

  /**
   * Refreshes the credentials if applicable.
   * Some providers (like API key) may not need refresh.
   *
   * @returns Promise that resolves when refresh is complete
   * @throws {AuthenticationError} If credentials cannot be refreshed
   */
  refresh?(): Promise<void>;
}

// ============================================================================
// Auth Type Enum
// ============================================================================

/**
 * Supported authentication types for Weaviate.
 */
export enum AuthType {
  /** No authentication (for local/testing environments) */
  None = 'none',
  /** API Key authentication via Bearer token */
  ApiKey = 'api_key',
  /** OpenID Connect (OIDC) token authentication */
  Oidc = 'oidc',
  /** OAuth2 Client Credentials flow */
  ClientCredentials = 'client_credentials',
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for API Key authentication.
 */
export interface ApiKeyAuthConfig {
  /** Authentication method type */
  method: AuthType.ApiKey;
  /** The API key for authentication */
  apiKey: string;
}

/**
 * Configuration for OIDC authentication.
 */
export interface OidcAuthConfig {
  /** Authentication method type */
  method: AuthType.Oidc;
  /** OIDC access token */
  token: string;
  /** Optional token refresh callback */
  refreshCallback?: TokenRefreshCallback;
  /** Token expiration time in seconds (if known) */
  expiresIn?: number;
  /** Optional refresh token */
  refreshToken?: string;
}

/**
 * Configuration for Client Credentials OAuth2 flow.
 */
export interface ClientCredentialsAuthConfig {
  /** Authentication method type */
  method: AuthType.ClientCredentials;
  /** OAuth2 client ID */
  clientId: string;
  /** OAuth2 client secret */
  clientSecret: string;
  /** OAuth2 scopes to request */
  scopes?: string[];
  /** OAuth2 token endpoint URL */
  tokenEndpoint: string;
}

/**
 * Configuration for no authentication.
 */
export interface NoAuthConfig {
  /** Authentication method type */
  method: AuthType.None;
}

/**
 * Union type for all authentication configurations.
 */
export type WeaviateAuthConfig =
  | NoAuthConfig
  | ApiKeyAuthConfig
  | OidcAuthConfig
  | ClientCredentialsAuthConfig;

// ============================================================================
// Token Types
// ============================================================================

/**
 * Cached token interface with expiration tracking.
 */
export interface CachedToken {
  /** The access token */
  accessToken: string;
  /** Token type (e.g., 'Bearer') */
  tokenType: string;
  /** Token expiration timestamp (milliseconds since epoch) */
  expiresAt: number;
  /** Optional refresh token */
  refreshToken?: string;
}

/**
 * Token refresh callback function.
 *
 * This function should implement the logic to refresh a token
 * using a refresh token or other mechanism.
 *
 * @param currentToken - The current (possibly expired) access token
 * @param refreshToken - The refresh token (if available)
 * @returns Promise resolving to the new token information
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
 * OAuth2 token response structure.
 */
export interface OAuth2TokenResponse {
  /** The access token */
  access_token: string;
  /** Token type (usually 'Bearer') */
  token_type: string;
  /** Token lifetime in seconds */
  expires_in: number;
  /** Optional scope string */
  scope?: string;
  /** Optional refresh token */
  refresh_token?: string;
}
