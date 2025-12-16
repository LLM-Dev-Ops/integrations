/**
 * Authentication Provider Factory
 *
 * Provides factory functions to create authentication providers from configuration.
 * @module @llmdevops/weaviate-integration/auth/factory
 */

import type { AuthProvider, WeaviateAuthConfig } from './types.js';
import { AuthType } from './types.js';
import { NoopAuthProvider } from './noop.js';
import { ApiKeyAuthProvider } from './api-key.js';
import { OidcAuthProvider } from './oidc.js';
import { ClientCredentialsAuthProvider } from './client-credentials.js';

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates an authentication provider based on the provided configuration.
 *
 * This is a convenience factory function that automatically creates the
 * appropriate authentication provider based on the auth method specified
 * in the configuration.
 *
 * Supported authentication methods:
 * - None: No authentication (for local/testing)
 * - ApiKey: Bearer token authentication
 * - Oidc: OpenID Connect token authentication
 * - ClientCredentials: OAuth2 client credentials flow
 *
 * @param config - Authentication configuration
 * @returns An AuthProvider instance
 * @throws {Error} If configuration is invalid or method is not supported
 *
 * @example
 * ```typescript
 * import { createAuthProvider, AuthType } from '@llmdevops/weaviate-integration/auth';
 *
 * // No authentication
 * const noAuthProvider = createAuthProvider({
 *   method: AuthType.None,
 * });
 *
 * // API Key authentication
 * const apiKeyProvider = createAuthProvider({
 *   method: AuthType.ApiKey,
 *   apiKey: 'your-api-key',
 * });
 *
 * // OIDC authentication
 * const oidcProvider = createAuthProvider({
 *   method: AuthType.Oidc,
 *   token: 'your-oidc-token',
 * });
 *
 * // Client Credentials OAuth2
 * const ccProvider = createAuthProvider({
 *   method: AuthType.ClientCredentials,
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-client-secret',
 *   tokenEndpoint: 'https://auth.weaviate.io/oauth2/token',
 *   scopes: ['weaviate.read', 'weaviate.write'],
 * });
 * ```
 */
export function createAuthProvider(config: WeaviateAuthConfig): AuthProvider {
  switch (config.method) {
    case AuthType.None:
      return new NoopAuthProvider();

    case AuthType.ApiKey:
      return new ApiKeyAuthProvider(config.apiKey);

    case AuthType.Oidc:
      return new OidcAuthProvider({
        token: config.token,
        refreshToken: config.refreshToken,
        expiresIn: config.expiresIn,
        refreshCallback: config.refreshCallback,
      });

    case AuthType.ClientCredentials:
      return new ClientCredentialsAuthProvider({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        tokenEndpoint: config.tokenEndpoint,
        scopes: config.scopes,
      });

    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = config;
      throw new Error(
        `Unsupported authentication method: ${(_exhaustive as WeaviateAuthConfig).method}`
      );
  }
}

/**
 * Creates an authentication provider from environment variables.
 *
 * This function attempts to detect the authentication method based on
 * available environment variables and creates the appropriate provider.
 *
 * Detection priority:
 * 1. Client Credentials: If WEAVIATE_CLIENT_ID is set
 * 2. OIDC: If WEAVIATE_OIDC_TOKEN is set
 * 3. API Key: If WEAVIATE_API_KEY is set
 * 4. None: If none of the above
 *
 * @param envPrefix - Environment variable prefix (default: 'WEAVIATE')
 * @returns An AuthProvider instance
 *
 * @example
 * ```typescript
 * import { createAuthProviderFromEnv } from '@llmdevops/weaviate-integration/auth';
 *
 * // Auto-detects from WEAVIATE_* environment variables
 * const provider = createAuthProviderFromEnv();
 *
 * // Use custom prefix
 * const customProvider = createAuthProviderFromEnv('MY_APP');
 * ```
 */
export function createAuthProviderFromEnv(
  envPrefix: string = 'WEAVIATE'
): AuthProvider {
  // Check for Client Credentials OAuth2
  const clientId = process.env[`${envPrefix}_CLIENT_ID`];
  if (clientId) {
    const clientSecret = process.env[`${envPrefix}_CLIENT_SECRET`];
    const tokenEndpoint = process.env[`${envPrefix}_TOKEN_ENDPOINT`];

    if (!clientSecret) {
      throw new Error(
        `${envPrefix}_CLIENT_ID is set but ${envPrefix}_CLIENT_SECRET is missing`
      );
    }
    if (!tokenEndpoint) {
      throw new Error(
        `${envPrefix}_CLIENT_ID is set but ${envPrefix}_TOKEN_ENDPOINT is missing`
      );
    }

    const scopesStr = process.env[`${envPrefix}_SCOPES`];
    const scopes = scopesStr
      ? scopesStr.split(',').map(s => s.trim())
      : undefined;

    return createAuthProvider({
      method: AuthType.ClientCredentials,
      clientId,
      clientSecret,
      tokenEndpoint,
      scopes,
    });
  }

  // Check for OIDC token
  const oidcToken = process.env[`${envPrefix}_OIDC_TOKEN`];
  if (oidcToken) {
    const expiresInStr = process.env[`${envPrefix}_OIDC_EXPIRES_IN`];
    const expiresIn = expiresInStr ? parseInt(expiresInStr, 10) : undefined;

    return createAuthProvider({
      method: AuthType.Oidc,
      token: oidcToken,
      expiresIn,
    });
  }

  // Check for API Key
  const apiKey = process.env[`${envPrefix}_API_KEY`];
  if (apiKey) {
    return createAuthProvider({
      method: AuthType.ApiKey,
      apiKey,
    });
  }

  // Default to no authentication
  return createAuthProvider({
    method: AuthType.None,
  });
}

/**
 * Type guard to check if a config uses authentication.
 *
 * @param config - Configuration to check
 * @returns true if authentication is configured, false for no auth
 *
 * @example
 * ```typescript
 * import { hasAuthentication, AuthType } from '@llmdevops/weaviate-integration/auth';
 *
 * const config = { method: AuthType.ApiKey, apiKey: '...' };
 * if (hasAuthentication(config)) {
 *   console.log('Authentication is configured');
 * }
 * ```
 */
export function hasAuthentication(config: WeaviateAuthConfig): boolean {
  return config.method !== AuthType.None;
}

/**
 * Validates an authentication configuration without creating a provider.
 *
 * @param config - Configuration to validate
 * @returns true if valid, throws error otherwise
 * @throws {Error} If configuration is invalid
 *
 * @example
 * ```typescript
 * import { validateAuthConfig, AuthType } from '@llmdevops/weaviate-integration/auth';
 *
 * try {
 *   validateAuthConfig({
 *     method: AuthType.ApiKey,
 *     apiKey: 'my-key',
 *   });
 *   console.log('Configuration is valid');
 * } catch (error) {
 *   console.error('Invalid configuration:', error.message);
 * }
 * ```
 */
export function validateAuthConfig(config: WeaviateAuthConfig): boolean {
  switch (config.method) {
    case AuthType.None:
      // No validation needed
      return true;

    case AuthType.ApiKey:
      if (!config.apiKey || config.apiKey.trim() === '') {
        throw new Error('API key cannot be empty');
      }
      return true;

    case AuthType.Oidc:
      if (!config.token || config.token.trim() === '') {
        throw new Error('OIDC token cannot be empty');
      }
      return true;

    case AuthType.ClientCredentials:
      if (!config.clientId || config.clientId.trim() === '') {
        throw new Error('Client ID cannot be empty');
      }
      if (!config.clientSecret || config.clientSecret.trim() === '') {
        throw new Error('Client secret cannot be empty');
      }
      if (!config.tokenEndpoint || config.tokenEndpoint.trim() === '') {
        throw new Error('Token endpoint cannot be empty');
      }
      // Validate token endpoint is a valid URL
      try {
        new URL(config.tokenEndpoint);
      } catch {
        throw new Error(`Invalid token endpoint URL: ${config.tokenEndpoint}`);
      }
      return true;

    default:
      const _exhaustive: never = config;
      throw new Error(
        `Unsupported authentication method: ${(_exhaustive as WeaviateAuthConfig).method}`
      );
  }
}
