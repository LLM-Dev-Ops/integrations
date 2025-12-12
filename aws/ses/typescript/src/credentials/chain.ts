/**
 * Chain credential provider.
 *
 * This module provides a credential provider that tries multiple providers
 * in sequence, returning credentials from the first successful provider.
 *
 * @module credentials/chain
 */

import { AwsCredentials, CredentialProvider } from './types.js';
import { CredentialError } from './error.js';
import { EnvironmentCredentialProvider } from './environment.js';
import { ProfileCredentialProvider } from './profile.js';
import { IMDSCredentialProvider } from './imds.js';

/**
 * Provider that tries multiple credential providers in order.
 *
 * This provider implements a chain of responsibility pattern, attempting
 * to retrieve credentials from each provider in sequence until one succeeds.
 * This is useful for creating fallback chains that work in different
 * environments (local development, EC2, containers, etc.).
 *
 * @example
 * ```typescript
 * const provider = new ChainCredentialProvider([
 *   new EnvironmentCredentialProvider(),
 *   new ProfileCredentialProvider(),
 *   new IMDSCredentialProvider()
 * ]);
 *
 * const credentials = await provider.getCredentials();
 * ```
 *
 * @example With custom providers
 * ```typescript
 * const provider = new ChainCredentialProvider([
 *   new StaticCredentialProvider({ ... }),
 *   new CustomCredentialProvider(),
 * ]);
 * ```
 */
export class ChainCredentialProvider implements CredentialProvider {
  private cachedProvider: CredentialProvider | null = null;
  private readonly errors: Error[] = [];

  /**
   * Creates a new chain credential provider.
   *
   * @param providers - Array of providers to try in order
   * @throws {Error} If providers array is empty
   */
  constructor(private readonly providers: CredentialProvider[]) {
    if (!providers || providers.length === 0) {
      throw new Error('ChainCredentialProvider requires at least one provider');
    }
  }

  /**
   * Retrieves AWS credentials from the first successful provider.
   *
   * Once a provider successfully returns credentials, it is cached and
   * used for subsequent calls (unless its credentials expire).
   *
   * @returns Promise resolving to credentials from first successful provider
   * @throws {CredentialError} If all providers fail
   */
  public async getCredentials(): Promise<AwsCredentials> {
    // Try cached provider first if we have one
    if (this.cachedProvider) {
      try {
        // Check if cached provider has expired credentials
        if (this.cachedProvider.isExpired && !this.cachedProvider.isExpired()) {
          return await this.cachedProvider.getCredentials();
        }
      } catch (error) {
        // Cached provider failed, clear it and try the chain again
        this.cachedProvider = null;
      }
    }

    // Try each provider in order
    this.errors.length = 0;

    for (const provider of this.providers) {
      try {
        const credentials = await provider.getCredentials();

        // Cache the successful provider
        this.cachedProvider = provider;

        return credentials;
      } catch (error) {
        // Store error and continue to next provider
        this.errors.push(error as Error);
      }
    }

    // All providers failed
    throw this.createChainError();
  }

  /**
   * Checks if the cached provider's credentials are expired.
   *
   * @returns true if no cached provider or its credentials are expired
   */
  public isExpired(): boolean {
    if (!this.cachedProvider) {
      return true;
    }

    if (this.cachedProvider.isExpired) {
      return this.cachedProvider.isExpired();
    }

    return false;
  }

  /**
   * Creates an error summarizing all provider failures.
   *
   * @returns CredentialError with details of all failures
   */
  private createChainError(): CredentialError {
    const messages = this.errors.map((error, index) => {
      const provider = this.providers[index];
      const providerName = provider ? provider.constructor.name : 'Unknown';
      return `  ${index + 1}. ${providerName}: ${error.message}`;
    }).join('\n');

    return new CredentialError(
      `Could not load credentials from any provider in the chain:\n${messages}`,
      'LOAD_FAILED'
    );
  }
}

/**
 * Creates a default credential provider chain.
 *
 * This is the standard AWS SDK credential resolution chain:
 * 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 * 2. Shared credentials file (~/.aws/credentials)
 * 3. EC2 Instance Metadata Service
 *
 * This chain works in most AWS environments without configuration.
 *
 * @example
 * ```typescript
 * const provider = defaultProvider();
 * const credentials = await provider.getCredentials();
 * ```
 *
 * @returns ChainCredentialProvider with default provider sequence
 */
export function defaultProvider(): ChainCredentialProvider {
  return new ChainCredentialProvider([
    new EnvironmentCredentialProvider(),
    new ProfileCredentialProvider(),
    new IMDSCredentialProvider(),
  ]);
}
