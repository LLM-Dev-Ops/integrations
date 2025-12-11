/**
 * OAuth2 Authorization Types
 *
 * Types for authorization flow parameters and responses.
 */

/**
 * Prompt values for authorization requests.
 */
export type Prompt = "none" | "login" | "consent" | "select_account";

/**
 * Authorization parameters for authorization code flow.
 */
export interface AuthorizationParams {
  /** URI to redirect after authorization */
  redirectUri: string;
  /** Requested scopes */
  scopes?: string[];
  /** Custom state (auto-generated if not provided) */
  state?: string;
  /** Prompt behavior */
  prompt?: Prompt;
  /** Login hint (email/username) */
  loginHint?: string;
  /** Additional parameters */
  extraParams?: Record<string, string>;
}

/**
 * PKCE authorization parameters.
 */
export interface PkceAuthorizationParams extends AuthorizationParams {
  /** PKCE challenge method (default: S256) */
  challengeMethod?: "S256" | "plain";
}

/**
 * Authorization URL result.
 */
export interface AuthorizationUrl {
  /** Full authorization URL */
  url: string;
  /** State parameter for CSRF validation */
  state: string;
}

/**
 * PKCE authorization URL result.
 */
export interface PkceAuthorizationUrl extends AuthorizationUrl {
  /** PKCE code verifier (keep secret until token exchange) */
  codeVerifier: string;
}

/**
 * Code exchange request.
 */
export interface CodeExchangeRequest {
  /** Authorization code from callback */
  code: string;
  /** Redirect URI used in authorization */
  redirectUri: string;
  /** State for validation */
  state?: string;
}

/**
 * PKCE code exchange request.
 */
export interface PkceCodeExchangeRequest extends CodeExchangeRequest {
  /** PKCE code verifier */
  codeVerifier: string;
}

/**
 * Client credentials request parameters.
 */
export interface ClientCredentialsParams {
  /** Requested scopes */
  scopes?: string[];
  /** Resource indicator (RFC 8707) */
  resource?: string;
  /** Audience for the token */
  audience?: string;
}

/**
 * Refresh token request parameters.
 */
export interface RefreshTokenParams {
  /** The refresh token */
  refreshToken: string;
  /** Scopes to request (subset of original) */
  scopes?: string[];
}
