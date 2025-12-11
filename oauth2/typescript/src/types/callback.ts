/**
 * OAuth2 Callback Types
 *
 * Types for handling authorization callbacks.
 */

/**
 * Callback parameters from authorization redirect.
 */
export interface CallbackParams {
  /** Authorization code (on success) */
  code?: string;
  /** State parameter for CSRF validation */
  state?: string;
  /** Error code (on failure) */
  error?: string;
  /** Human-readable error description */
  errorDescription?: string;
  /** URI for error information */
  errorUri?: string;
}

/**
 * Parse callback parameters from URL.
 */
export function parseCallbackUrl(url: string): CallbackParams {
  const parsed = new URL(url);
  const params = parsed.searchParams;

  return {
    code: params.get("code") ?? undefined,
    state: params.get("state") ?? undefined,
    error: params.get("error") ?? undefined,
    errorDescription: params.get("error_description") ?? undefined,
    errorUri: params.get("error_uri") ?? undefined,
  };
}

/**
 * Check if callback contains an error.
 */
export function isCallbackError(callback: CallbackParams): boolean {
  return callback.error !== undefined;
}

/**
 * Check if callback is successful.
 */
export function isCallbackSuccess(callback: CallbackParams): boolean {
  return callback.code !== undefined && callback.error === undefined;
}

/**
 * State metadata for CSRF validation.
 */
export interface StateMetadata {
  /** When the state was created */
  createdAt: Date;
  /** When the state expires */
  expiresAt: Date;
  /** Redirect URI used */
  redirectUri: string;
  /** Requested scopes */
  scopes: string[];
  /** PKCE verifier if using PKCE */
  pkceVerifier?: string;
  /** Custom metadata */
  extra?: Record<string, string>;
}
