/**
 * Token types for Azure Active Directory OAuth2.
 *
 * Following the SPARC specification for Azure AD integration.
 */

/**
 * Access token returned from Azure AD.
 */
export interface AccessToken {
  /** The access token value. */
  token: string;
  /** Token type (typically "Bearer"). */
  tokenType: string;
  /** Timestamp when the token expires. */
  expiresOn: Date;
  /** Scopes granted for this token. */
  scopes: string[];
  /** Tenant ID for the token. */
  tenantId: string;
}

/**
 * Full token response from Azure AD.
 */
export interface TokenResponse {
  /** Access token. */
  accessToken: AccessToken;
  /** Refresh token (if requested). */
  refreshToken?: string;
  /** ID token (for OpenID Connect). */
  idToken?: string;
  /** Token lifetime in seconds. */
  expiresIn: number;
}

/**
 * Device code response for device code flow.
 */
export interface DeviceCodeResponse {
  /** Device code to poll for token. */
  deviceCode: string;
  /** User code to display. */
  userCode: string;
  /** URL for user to navigate to. */
  verificationUri: string;
  /** Device code expiration in seconds. */
  expiresIn: number;
  /** Polling interval in seconds. */
  interval: number;
  /** Message to display to user. */
  message: string;
}

/**
 * Authorization URL result.
 */
export interface AuthorizationUrl {
  /** Authorization URL to redirect user to. */
  url: string;
  /** State parameter for CSRF protection. */
  state: string;
  /** PKCE code verifier. */
  codeVerifier: string;
}
