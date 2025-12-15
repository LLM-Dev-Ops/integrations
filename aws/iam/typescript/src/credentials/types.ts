/**
 * AWS credentials module types.
 *
 * This module defines the core types for AWS credential management,
 * including the credential structure and provider interface.
 *
 * @module credentials/types
 */

/**
 * AWS security credentials for authenticating API requests.
 *
 * These credentials can be long-term (access key ID and secret access key)
 * or temporary (including session token and expiration).
 */
export interface AwsCredentials {
  /**
   * AWS access key ID.
   *
   * This is a unique identifier that AWS uses to identify your account.
   * It is always used in conjunction with a secret access key.
   */
  accessKeyId: string;

  /**
   * AWS secret access key.
   *
   * This is the secret part of your credentials that should never be shared.
   * It is used to sign API requests to prove they came from your account.
   */
  secretAccessKey: string;

  /**
   * Optional session token for temporary credentials.
   *
   * When using temporary security credentials (such as from STS or IAM roles),
   * this token must be included in API requests along with the access key ID
   * and secret access key.
   */
  sessionToken?: string;

  /**
   * Optional expiration time for temporary credentials.
   *
   * When present, indicates when the credentials will expire and need to be
   * refreshed. Typically used with temporary credentials from STS or IAM roles.
   */
  expiration?: Date;
}

/**
 * Provider interface for retrieving AWS credentials.
 *
 * Credential providers implement different strategies for obtaining credentials,
 * such as from environment variables, configuration files, instance metadata,
 * or other sources. Providers can be chained together to try multiple sources.
 */
export interface CredentialProvider {
  /**
   * Retrieves AWS credentials.
   *
   * This method should attempt to obtain valid credentials from the provider's
   * source. If credentials cannot be obtained, it should throw a CredentialError.
   *
   * @returns Promise resolving to valid AWS credentials
   * @throws {CredentialError} If credentials cannot be retrieved
   */
  getCredentials(): Promise<AwsCredentials>;

  /**
   * Checks if the current credentials are expired.
   *
   * Optional method that providers can implement to check credential expiration
   * without making a full getCredentials() call. Useful for caching and
   * refresh logic.
   *
   * @returns true if credentials are expired or not available, false otherwise
   */
  isExpired?(): boolean;
}
