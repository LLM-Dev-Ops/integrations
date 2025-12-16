/**
 * Snowflake Authentication Module
 *
 * Provides credential providers for various Snowflake authentication methods:
 * - Password authentication
 * - Key-pair (JWT) authentication with RSA private keys
 * - OAuth authentication with token refresh support
 *
 * @module @llmdevops/snowflake-integration/auth
 *
 * @example
 * ```typescript
 * import {
 *   createPasswordProvider,
 *   createKeyPairProvider,
 *   createOAuthProvider
 * } from '@llmdevops/snowflake-integration/auth';
 *
 * // Password authentication
 * const passwordProvider = createPasswordProvider({
 *   method: 'password',
 *   username: 'myuser',
 *   password: 'mypassword'
 * });
 *
 * // Key-pair authentication
 * const keyPairProvider = createKeyPairProvider({
 *   method: 'keypair',
 *   username: 'myuser',
 *   privateKeyPath: '/path/to/key.pem'
 * });
 *
 * // OAuth authentication
 * const oauthProvider = createOAuthProvider({
 *   config: {
 *     method: 'oauth',
 *     token: 'my-access-token'
 *   }
 * });
 *
 * // Get credentials
 * const credentials = await passwordProvider.getCredentials();
 * ```
 */

// ============================================================================
// Core Types and Interfaces
// ============================================================================

export type {
  Credentials,
  CredentialProvider,
} from './provider.js';

export {
  BaseCredentialProvider,
} from './provider.js';

// ============================================================================
// Password Authentication
// ============================================================================

export {
  PasswordCredentialProvider,
  createPasswordProvider,
} from './password.js';

// ============================================================================
// Key-Pair Authentication
// ============================================================================

export {
  KeyPairCredentialProvider,
  createKeyPairProvider,
} from './keypair.js';

// ============================================================================
// OAuth Authentication
// ============================================================================

export type {
  TokenRefreshCallback,
  OAuthProviderOptions,
} from './oauth.js';

export {
  OAuthCredentialProvider,
  createOAuthProvider,
  createSimpleOAuthProvider,
} from './oauth.js';

// ============================================================================
// Factory Function
// ============================================================================

import type { AuthConfig } from '../config/index.js';
import { ConfigurationError } from '../errors/index.js';
import type { CredentialProvider } from './provider.js';
import { createPasswordProvider } from './password.js';
import { createKeyPairProvider } from './keypair.js';
import { createSimpleOAuthProvider } from './oauth.js';

/**
 * Creates a credential provider based on the authentication configuration.
 *
 * This is a convenience factory function that automatically creates the
 * appropriate credential provider based on the auth method specified in
 * the configuration.
 *
 * @param config - Authentication configuration
 * @returns A credential provider instance
 * @throws {ConfigurationError} If auth method is not supported
 *
 * @example
 * ```typescript
 * import { createCredentialProvider } from '@llmdevops/snowflake-integration/auth';
 *
 * const provider = createCredentialProvider({
 *   method: 'password',
 *   username: 'myuser',
 *   password: 'mypassword'
 * });
 *
 * const credentials = await provider.getCredentials();
 * ```
 */
export function createCredentialProvider(config: AuthConfig): CredentialProvider {
  switch (config.method) {
    case 'password':
      return createPasswordProvider(config);

    case 'keypair':
      return createKeyPairProvider(config);

    case 'oauth':
      return createSimpleOAuthProvider(config);

    case 'external_browser':
      throw new ConfigurationError(
        'External browser authentication is not yet implemented. ' +
        'Please use password, keypair, or oauth authentication methods.'
      );

    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = config;
      throw new ConfigurationError(
        `Unsupported authentication method: ${(_exhaustive as AuthConfig).method}`
      );
  }
}
