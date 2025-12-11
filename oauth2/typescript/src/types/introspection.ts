/**
 * OAuth2 Token Introspection Types
 *
 * Types for token introspection (RFC 7662) and revocation (RFC 7009).
 */

/**
 * Token introspection request parameters.
 */
export interface IntrospectionParams {
  /** Token to introspect */
  token: string;
  /** Hint about token type */
  tokenTypeHint?: "access_token" | "refresh_token";
}

/**
 * Token introspection response (RFC 7662 Section 2.2).
 */
export interface IntrospectionResponse {
  /** Whether the token is active */
  active: boolean;
  /** Scopes associated with the token */
  scope?: string;
  /** Client identifier */
  clientId?: string;
  /** Human-readable username */
  username?: string;
  /** Token type */
  tokenType?: string;
  /** Expiration timestamp (Unix epoch) */
  exp?: number;
  /** Issue timestamp (Unix epoch) */
  iat?: number;
  /** Not before timestamp (Unix epoch) */
  nbf?: number;
  /** Subject identifier */
  sub?: string;
  /** Audience */
  aud?: string | string[];
  /** Issuer */
  iss?: string;
  /** JWT ID */
  jti?: string;
  /** Additional fields */
  extra?: Record<string, unknown>;
}

/**
 * Token revocation request parameters.
 */
export interface RevocationParams {
  /** Token to revoke */
  token: string;
  /** Hint about token type */
  tokenTypeHint?: "access_token" | "refresh_token";
}

/**
 * Check if introspected token is valid.
 */
export function isTokenActive(response: IntrospectionResponse): boolean {
  if (!response.active) {
    return false;
  }
  if (response.exp) {
    const now = Math.floor(Date.now() / 1000);
    if (response.exp <= now) {
      return false;
    }
  }
  return true;
}

/**
 * Get remaining lifetime of introspected token in seconds.
 */
export function getTokenRemainingLifetime(
  response: IntrospectionResponse
): number | undefined {
  if (!response.exp) {
    return undefined;
  }
  const now = Math.floor(Date.now() / 1000);
  const remaining = response.exp - now;
  return remaining > 0 ? remaining : 0;
}
