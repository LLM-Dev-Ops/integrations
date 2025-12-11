/**
 * OAuth2 Token Types
 *
 * Token-related type definitions following RFC 6749.
 */

/**
 * Token response from OAuth2 provider (RFC 6749 Section 5.1).
 */
export interface TokenResponse {
  /** The access token issued by the authorization server */
  accessToken: string;
  /** The type of the token (typically "Bearer") */
  tokenType: string;
  /** Lifetime in seconds of the access token */
  expiresIn?: number;
  /** Refresh token for obtaining new access tokens */
  refreshToken?: string;
  /** Scope of the access token */
  scope?: string;
  /** ID token for OpenID Connect */
  idToken?: string;
  /** Additional provider-specific fields */
  extra?: Record<string, unknown>;
}

/**
 * Stored tokens with expiration tracking.
 */
export interface StoredTokens {
  /** The access token (wrapped for security) */
  accessToken: SecretString;
  /** Token type */
  tokenType: string;
  /** When the access token expires */
  expiresAt?: Date;
  /** Refresh token if available */
  refreshToken?: SecretString;
  /** Granted scopes */
  scopes: string[];
  /** ID token if using OIDC */
  idToken?: SecretString;
  /** When tokens were stored */
  storedAt: Date;
  /** Custom metadata */
  metadata?: Record<string, string>;
}

/**
 * Access token for API calls.
 */
export interface AccessToken {
  /** The token value (wrapped for security) */
  token: SecretString;
  /** Token type (e.g., "Bearer") */
  tokenType: string;
  /** Scopes this token grants */
  scopes: string[];
  /** When the token expires */
  expiresAt?: Date;
}

/**
 * Secret string wrapper to prevent accidental exposure.
 */
export class SecretString {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  /**
   * Expose the secret value. Use with caution.
   */
  expose(): string {
    return this.value;
  }

  /**
   * Create a Bearer authorization header value.
   */
  asBearerHeader(): string {
    return `Bearer ${this.value}`;
  }

  /**
   * Returns redacted string for logging/debugging.
   */
  toString(): string {
    return "[REDACTED]";
  }

  /**
   * Returns redacted string for JSON serialization.
   */
  toJSON(): string {
    return "[REDACTED]";
  }
}

/**
 * Check if tokens are expiring within threshold.
 */
export function isExpiringSoon(
  tokens: StoredTokens,
  thresholdSeconds: number = 60
): boolean {
  if (!tokens.expiresAt) {
    return false;
  }
  const now = new Date();
  const threshold = new Date(now.getTime() + thresholdSeconds * 1000);
  return tokens.expiresAt <= threshold;
}

/**
 * Check if tokens are expired.
 */
export function isExpired(tokens: StoredTokens): boolean {
  if (!tokens.expiresAt) {
    return false;
  }
  return tokens.expiresAt <= new Date();
}

/**
 * Check if tokens have a refresh token.
 */
export function hasRefreshToken(tokens: StoredTokens): boolean {
  return tokens.refreshToken !== undefined;
}

/**
 * Convert TokenResponse to StoredTokens.
 */
export function toStoredTokens(
  response: TokenResponse,
  metadata?: Record<string, string>
): StoredTokens {
  const now = new Date();
  const expiresAt = response.expiresIn
    ? new Date(now.getTime() + response.expiresIn * 1000)
    : undefined;

  return {
    accessToken: new SecretString(response.accessToken),
    tokenType: response.tokenType,
    expiresAt,
    refreshToken: response.refreshToken
      ? new SecretString(response.refreshToken)
      : undefined,
    scopes: response.scope ? response.scope.split(" ") : [],
    idToken: response.idToken
      ? new SecretString(response.idToken)
      : undefined,
    storedAt: now,
    metadata,
  };
}

/**
 * Convert StoredTokens to AccessToken.
 */
export function toAccessToken(stored: StoredTokens): AccessToken {
  return {
    token: stored.accessToken,
    tokenType: stored.tokenType,
    scopes: stored.scopes,
    expiresAt: stored.expiresAt,
  };
}
