/**
 * Token claims types for Azure Active Directory.
 *
 * Following the SPARC specification for Azure AD integration.
 */

/**
 * Token claims extracted from JWT.
 */
export interface TokenClaims {
  /** Subject (user/service principal ID). */
  sub: string;
  /** Audience (application ID). */
  aud: string;
  /** Issuer (Azure AD authority). */
  iss: string;
  /** Expiry timestamp (seconds since epoch). */
  exp: number;
  /** Issued at timestamp (seconds since epoch). */
  iat: number;
  /** Not before timestamp (seconds since epoch). */
  nbf?: number;
  /** Object ID (user/service principal). */
  oid?: string;
  /** Tenant ID. */
  tid?: string;
  /** Application ID. */
  appId?: string;
  /** App roles granted. */
  roles: string[];
  /** Delegated scopes (space-separated). */
  scp?: string;
  /** Additional claims. */
  [key: string]: unknown;
}
