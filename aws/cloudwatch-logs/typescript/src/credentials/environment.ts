/**
 * Environment variable credential provider.
 *
 * This module provides a credential provider that reads AWS credentials
 * from environment variables, following AWS SDK conventions.
 *
 * @module credentials/environment
 */

import { AwsCredentials, CredentialProvider } from './types.js';
import { CredentialError } from './error.js';

/**
 * Standard AWS environment variable names for credentials.
 */
export const AWS_ENV_VARS = {
  ACCESS_KEY_ID: 'AWS_ACCESS_KEY_ID',
  SECRET_ACCESS_KEY: 'AWS_SECRET_ACCESS_KEY',
  SESSION_TOKEN: 'AWS_SESSION_TOKEN',
} as const;

/**
 * Provider that retrieves AWS credentials from environment variables.
 *
 * This provider reads credentials from the standard AWS environment variables:
 * - AWS_ACCESS_KEY_ID: The access key ID
 * - AWS_SECRET_ACCESS_KEY: The secret access key
 * - AWS_SESSION_TOKEN: Optional session token for temporary credentials
 *
 * This is typically the first provider tried in a credential chain, as it
 * allows for easy credential override in development and deployment scenarios.
 *
 * @example
 * ```typescript
 * // Set environment variables
 * process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
 * process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
 *
 * const provider = new EnvironmentCredentialProvider();
 * const credentials = await provider.getCredentials();
 * ```
 *
 * @example With session token
 * ```typescript
 * process.env.AWS_ACCESS_KEY_ID = 'ASIAIOSFODNN7EXAMPLE';
 * process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
 * process.env.AWS_SESSION_TOKEN = 'AQoDYXdzEJr...';
 *
 * const provider = new EnvironmentCredentialProvider();
 * const credentials = await provider.getCredentials();
 * ```
 */
export class EnvironmentCredentialProvider implements CredentialProvider {
  /**
   * Creates a new environment credential provider.
   *
   * @param env - Optional environment object to use instead of process.env (useful for testing)
   */
  constructor(private readonly env: Record<string, string | undefined> = process.env) {}

  /**
   * Retrieves AWS credentials from environment variables.
   *
   * @returns Promise resolving to credentials from environment
   * @throws {CredentialError} If required environment variables are not set or are empty
   */
  public async getCredentials(): Promise<AwsCredentials> {
    const accessKeyId = this.env[AWS_ENV_VARS.ACCESS_KEY_ID];
    const secretAccessKey = this.env[AWS_ENV_VARS.SECRET_ACCESS_KEY];
    const sessionToken = this.env[AWS_ENV_VARS.SESSION_TOKEN];

    // Validate access key ID
    if (!accessKeyId || accessKeyId.trim() === '') {
      throw new CredentialError(
        `${AWS_ENV_VARS.ACCESS_KEY_ID} environment variable not set or empty`,
        'MISSING'
      );
    }

    // Validate secret access key
    if (!secretAccessKey || secretAccessKey.trim() === '') {
      throw new CredentialError(
        `${AWS_ENV_VARS.SECRET_ACCESS_KEY} environment variable not set or empty`,
        'MISSING'
      );
    }

    // Build credentials object
    const credentials: AwsCredentials = {
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
    };

    // Add session token if present
    if (sessionToken && sessionToken.trim() !== '') {
      credentials.sessionToken = sessionToken.trim();
    }

    return credentials;
  }

  /**
   * Checks if credentials are expired.
   *
   * Environment credentials don't have expiration metadata, so this always
   * returns false. The credentials themselves may still be invalid or revoked,
   * but that can only be determined by attempting to use them.
   *
   * @returns false - environment credentials don't expire
   */
  public isExpired(): boolean {
    return false;
  }
}
