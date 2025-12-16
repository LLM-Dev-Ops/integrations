/**
 * Authentication provider implementations for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/auth/provider
 */

import { ConfigError } from '../errors/index.js';
import type { AuthProvider, R2Credentials } from './types.js';

/**
 * Static authentication provider using fixed credentials.
 */
export class StaticAuthProvider implements AuthProvider {
  private readonly credentials: R2Credentials;

  /**
   * Creates a new static auth provider.
   *
   * @param credentials - R2 credentials to use
   */
  constructor(credentials: R2Credentials) {
    if (!credentials.accessKeyId || !credentials.secretAccessKey) {
      throw new ConfigError({
        message: 'accessKeyId and secretAccessKey are required',
        code: 'MISSING_CREDENTIALS',
        isRetryable: false,
      });
    }
    this.credentials = credentials;
  }

  /**
   * Returns the static credentials.
   *
   * @returns Promise resolving to R2 credentials
   */
  async getCredentials(): Promise<R2Credentials> {
    return {
      accessKeyId: this.credentials.accessKeyId,
      secretAccessKey: this.credentials.secretAccessKey,
    };
  }
}

/**
 * Environment-based authentication provider.
 * Reads credentials from environment variables.
 */
export class EnvironmentAuthProvider implements AuthProvider {
  /**
   * Environment variable names.
   */
  private static readonly ENV_VARS = {
    ACCESS_KEY_ID: 'R2_ACCESS_KEY_ID',
    SECRET_ACCESS_KEY: 'R2_SECRET_ACCESS_KEY',
  } as const;

  /**
   * Retrieves credentials from environment variables.
   *
   * Environment variables:
   * - R2_ACCESS_KEY_ID (required): R2 access key ID
   * - R2_SECRET_ACCESS_KEY (required): R2 secret access key
   *
   * @returns Promise resolving to R2 credentials
   * @throws {ConfigError} If required environment variables are missing
   */
  async getCredentials(): Promise<R2Credentials> {
    const accessKeyId = process.env[EnvironmentAuthProvider.ENV_VARS.ACCESS_KEY_ID];
    const secretAccessKey = process.env[EnvironmentAuthProvider.ENV_VARS.SECRET_ACCESS_KEY];

    if (!accessKeyId) {
      throw new ConfigError({
        message: `Missing required environment variable: ${EnvironmentAuthProvider.ENV_VARS.ACCESS_KEY_ID}`,
        code: 'MISSING_ACCESS_KEY_ID',
        isRetryable: false,
      });
    }

    if (!secretAccessKey) {
      throw new ConfigError({
        message: `Missing required environment variable: ${EnvironmentAuthProvider.ENV_VARS.SECRET_ACCESS_KEY}`,
        code: 'MISSING_SECRET_ACCESS_KEY',
        isRetryable: false,
      });
    }

    return {
      accessKeyId,
      secretAccessKey,
    };
  }
}
