/**
 * Password Authentication Handler
 *
 * Implements password-based authentication for Snowflake.
 * @module @llmdevops/snowflake-integration/auth/password
 */

import type { PasswordAuthConfig } from '../config/index.js';
import {
  AuthenticationError,
  InvalidCredentialsError,
} from '../errors/index.js';
import { BaseCredentialProvider, type Credentials } from './provider.js';

// ============================================================================
// Password Credential Provider
// ============================================================================

/**
 * Credential provider for password authentication.
 *
 * This provider validates username and password credentials and creates
 * a session with Snowflake. Password credentials do not expire unless
 * the session itself expires.
 *
 * @example
 * ```typescript
 * const provider = new PasswordCredentialProvider({
 *   method: 'password',
 *   username: 'myuser',
 *   password: 'mypassword'
 * });
 * const credentials = await provider.getCredentials();
 * ```
 */
export class PasswordCredentialProvider extends BaseCredentialProvider {
  private readonly config: PasswordAuthConfig;

  /**
   * Creates a new password credential provider.
   *
   * @param config - Password authentication configuration
   * @throws {InvalidCredentialsError} If username or password is missing
   */
  constructor(config: PasswordAuthConfig) {
    super();
    this.validateConfig(config);
    this.config = config;
  }

  /**
   * Validates the password authentication configuration.
   *
   * @param config - Configuration to validate
   * @throws {InvalidCredentialsError} If configuration is invalid
   */
  private validateConfig(config: PasswordAuthConfig): void {
    if (!config.username || config.username.trim() === '') {
      throw new InvalidCredentialsError('Username is required for password authentication');
    }

    if (!config.password || config.password.trim() === '') {
      throw new InvalidCredentialsError('Password is required for password authentication');
    }
  }

  /**
   * Refreshes credentials by validating and returning username/password.
   *
   * For password authentication, there's no actual "refresh" operation -
   * we simply validate and return the configured credentials. The Snowflake
   * SDK will use these credentials to create or maintain a session.
   *
   * @returns Promise resolving to password credentials
   * @throws {AuthenticationError} If credentials cannot be refreshed
   */
  async refreshCredentials(): Promise<Credentials> {
    try {
      this.validateConfig(this.config);

      const credentials: Credentials = {
        method: 'password',
        username: this.config.username,
        password: this.config.password,
        // Password credentials don't have an expiration time
        // The session itself may expire, but that's handled by the connection layer
      };

      this.updateCredentials(credentials);
      return credentials;
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        throw error;
      }
      throw new AuthenticationError(
        'Failed to refresh password credentials',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Password credentials don't expire on their own.
   * Returns false unless the credentials haven't been initialized.
   *
   * @returns Always false for password auth (unless not initialized)
   */
  isExpired(): boolean {
    return this.credentials === null;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a password credential provider from configuration.
 *
 * @param config - Password authentication configuration
 * @returns A new PasswordCredentialProvider instance
 * @throws {InvalidCredentialsError} If configuration is invalid
 *
 * @example
 * ```typescript
 * const provider = createPasswordProvider({
 *   method: 'password',
 *   username: 'myuser',
 *   password: 'mypassword'
 * });
 * ```
 */
export function createPasswordProvider(config: PasswordAuthConfig): PasswordCredentialProvider {
  return new PasswordCredentialProvider(config);
}
