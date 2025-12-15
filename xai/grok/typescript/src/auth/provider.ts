/**
 * Credential Provider Interface
 *
 * @module auth/provider
 */

/**
 * Authentication header value.
 */
export interface AuthHeader {
  /** Header name */
  readonly name: string;

  /** Header value */
  readonly value: string;
}

/**
 * Credential provider interface.
 */
export interface CredentialProvider {
  /**
   * Get the authentication header.
   *
   * @returns Authentication header for API requests
   */
  getAuthHeader(): Promise<AuthHeader>;

  /**
   * Refresh credentials if needed.
   *
   * @returns True if refresh was successful
   */
  refresh?(): Promise<boolean>;
}
