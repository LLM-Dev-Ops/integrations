/**
 * AWS credentials management module for Secrets Manager.
 *
 * This module provides credential management for AWS Secrets Manager,
 * including static and environment-based providers.
 *
 * @example Static credentials
 * ```typescript
 * import { StaticCredentialProvider } from './credentials';
 *
 * const provider = new StaticCredentialProvider({
 *   accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
 *   secretAccessKey: 'wJalrXUtn...'
 * });
 * const credentials = await provider.getCredentials();
 * ```
 *
 * @example Environment credentials
 * ```typescript
 * import { EnvironmentCredentialProvider } from './credentials';
 *
 * const provider = new EnvironmentCredentialProvider();
 * const credentials = await provider.getCredentials();
 * ```
 *
 * @module credentials
 */

import type { AwsCredentials, CredentialProvider } from '../types/index.js';
import { SecretsManagerError } from '../error/index.js';

/**
 * Error thrown when credential operations fail.
 */
export class CredentialError extends SecretsManagerError {
  constructor(message: string) {
    super(message, 'CREDENTIAL', false);
    this.name = 'CredentialError';
  }
}

/**
 * Static credential provider.
 *
 * Provides credentials from a static configuration. Useful for testing
 * or when credentials are provided directly.
 *
 * @example
 * ```typescript
 * const provider = new StaticCredentialProvider({
 *   accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
 *   secretAccessKey: 'wJalrXUtn...',
 *   sessionToken: 'optional-session-token'
 * });
 * ```
 */
export class StaticCredentialProvider implements CredentialProvider {
  private readonly credentials: AwsCredentials;

  /**
   * Create a new static credential provider.
   *
   * @param credentials - AWS credentials to use
   */
  constructor(credentials: AwsCredentials) {
    if (!credentials.accessKeyId || !credentials.secretAccessKey) {
      throw new CredentialError('Access key ID and secret access key are required');
    }
    this.credentials = { ...credentials };
  }

  /**
   * Get the static credentials.
   *
   * @returns Promise resolving to the credentials
   */
  async getCredentials(): Promise<AwsCredentials> {
    return { ...this.credentials };
  }

  /**
   * Check if credentials are expired.
   *
   * Static credentials with no expiration are never expired.
   * Credentials with expiration are expired if the current time is past the expiration.
   *
   * @returns true if credentials are expired
   */
  isExpired(): boolean {
    if (!this.credentials.expiration) {
      return false;
    }
    return Date.now() >= this.credentials.expiration.getTime();
  }
}

/**
 * Environment variable names for AWS credentials.
 */
export const AWS_ENV_VARS = {
  ACCESS_KEY_ID: 'AWS_ACCESS_KEY_ID',
  SECRET_ACCESS_KEY: 'AWS_SECRET_ACCESS_KEY',
  SESSION_TOKEN: 'AWS_SESSION_TOKEN',
  REGION: 'AWS_REGION',
  DEFAULT_REGION: 'AWS_DEFAULT_REGION',
} as const;

/**
 * Environment credential provider.
 *
 * Provides credentials from environment variables:
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - AWS_SESSION_TOKEN (optional)
 *
 * @example
 * ```typescript
 * // Assumes AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set
 * const provider = new EnvironmentCredentialProvider();
 * const credentials = await provider.getCredentials();
 * ```
 */
export class EnvironmentCredentialProvider implements CredentialProvider {
  private credentials: AwsCredentials | null = null;

  /**
   * Get credentials from environment variables.
   *
   * @returns Promise resolving to credentials
   * @throws {CredentialError} If required environment variables are not set
   */
  async getCredentials(): Promise<AwsCredentials> {
    const accessKeyId = process.env[AWS_ENV_VARS.ACCESS_KEY_ID];
    const secretAccessKey = process.env[AWS_ENV_VARS.SECRET_ACCESS_KEY];

    if (!accessKeyId || !secretAccessKey) {
      throw new CredentialError(
        `Missing required environment variables: ${AWS_ENV_VARS.ACCESS_KEY_ID} and ${AWS_ENV_VARS.SECRET_ACCESS_KEY}`
      );
    }

    const sessionToken = process.env[AWS_ENV_VARS.SESSION_TOKEN];

    this.credentials = {
      accessKeyId,
      secretAccessKey,
      sessionToken,
    };

    return { ...this.credentials };
  }

  /**
   * Check if credentials are expired.
   *
   * Environment credentials are never expired (they are re-read each time).
   *
   * @returns false (always)
   */
  isExpired(): boolean {
    return false;
  }

  /**
   * Refresh credentials from environment variables.
   *
   * @returns Promise resolving to fresh credentials
   */
  async refresh(): Promise<AwsCredentials> {
    this.credentials = null;
    return this.getCredentials();
  }
}

/**
 * Chain credential provider.
 *
 * Tries multiple credential providers in order, returning credentials
 * from the first provider that succeeds.
 *
 * @example
 * ```typescript
 * const provider = new ChainCredentialProvider([
 *   new EnvironmentCredentialProvider(),
 *   new StaticCredentialProvider(fallbackCredentials)
 * ]);
 * ```
 */
export class ChainCredentialProvider implements CredentialProvider {
  private readonly providers: CredentialProvider[];
  private activeProvider: CredentialProvider | null = null;
  private cachedCredentials: AwsCredentials | null = null;

  /**
   * Create a new chain credential provider.
   *
   * @param providers - Providers to try in order
   */
  constructor(providers: CredentialProvider[]) {
    if (providers.length === 0) {
      throw new CredentialError('At least one credential provider is required');
    }
    this.providers = providers;
  }

  /**
   * Get credentials from the first successful provider.
   *
   * @returns Promise resolving to credentials
   * @throws {CredentialError} If no provider succeeds
   */
  async getCredentials(): Promise<AwsCredentials> {
    // If we have an active provider that's not expired, use it
    if (this.activeProvider && !this.activeProvider.isExpired() && this.cachedCredentials) {
      return { ...this.cachedCredentials };
    }

    const errors: Error[] = [];

    for (const provider of this.providers) {
      try {
        const credentials = await provider.getCredentials();
        this.activeProvider = provider;
        this.cachedCredentials = credentials;
        return { ...credentials };
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    throw new CredentialError(
      `No credential provider succeeded. Errors:\n${errors.map((e) => `  - ${e.message}`).join('\n')}`
    );
  }

  /**
   * Check if credentials are expired.
   *
   * @returns true if no active provider or if active provider's credentials are expired
   */
  isExpired(): boolean {
    if (!this.activeProvider) {
      return true;
    }
    return this.activeProvider.isExpired();
  }

  /**
   * Refresh credentials.
   *
   * @returns Promise resolving to fresh credentials
   */
  async refresh(): Promise<AwsCredentials> {
    this.activeProvider = null;
    this.cachedCredentials = null;
    return this.getCredentials();
  }
}

/**
 * Create the default credential provider chain.
 *
 * Tries providers in this order:
 * 1. Environment variables
 *
 * @returns Default credential provider
 */
export function defaultProvider(): CredentialProvider {
  return new ChainCredentialProvider([
    new EnvironmentCredentialProvider(),
  ]);
}

export type { AwsCredentials, CredentialProvider };
