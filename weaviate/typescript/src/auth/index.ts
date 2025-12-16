/**
 * Weaviate Authentication Module
 *
 * Provides authentication providers for various Weaviate authentication methods:
 * - No authentication (for local development)
 * - API Key authentication (Bearer tokens)
 * - OIDC authentication with token refresh support
 * - OAuth2 Client Credentials flow with automatic token management
 *
 * @module @llmdevops/weaviate-integration/auth
 *
 * @example
 * ```typescript
 * import {
 *   createAuthProvider,
 *   AuthType,
 *   ApiKeyAuthProvider,
 *   OidcAuthProvider,
 *   ClientCredentialsAuthProvider,
 *   NoopAuthProvider
 * } from '@llmdevops/weaviate-integration/auth';
 *
 * // Factory function (recommended)
 * const provider = createAuthProvider({
 *   method: AuthType.ApiKey,
 *   apiKey: 'your-api-key'
 * });
 *
 * // Or use specific providers directly
 * const apiKeyProvider = new ApiKeyAuthProvider('your-api-key');
 * const oidcProvider = new OidcAuthProvider({ token: 'your-token' });
 * const ccProvider = new ClientCredentialsAuthProvider({
 *   clientId: 'client-id',
 *   clientSecret: 'client-secret',
 *   tokenEndpoint: 'https://auth.example.com/oauth2/token'
 * });
 *
 * // Get auth headers
 * const headers = await provider.getAuthHeaders();
 * ```
 */

// ============================================================================
// Core Types and Interfaces
// ============================================================================

export type {
  AuthProvider,
  WeaviateAuthConfig,
  ApiKeyAuthConfig,
  OidcAuthConfig,
  ClientCredentialsAuthConfig,
  NoAuthConfig,
  CachedToken,
  TokenRefreshCallback,
  OAuth2TokenResponse,
} from './types.js';

export { AuthType } from './types.js';

// ============================================================================
// No Authentication
// ============================================================================

export {
  NoopAuthProvider,
  createNoopAuthProvider,
} from './noop.js';

// ============================================================================
// API Key Authentication
// ============================================================================

export {
  ApiKeyAuthProvider,
  createApiKeyAuthProvider,
  createApiKeyAuthProviderFromEnv,
} from './api-key.js';

// ============================================================================
// OIDC Authentication
// ============================================================================

export {
  OidcAuthProvider,
  createOidcAuthProvider,
  createOidcAuthProviderWithRefresh,
} from './oidc.js';

// ============================================================================
// Client Credentials OAuth2 Authentication
// ============================================================================

export {
  ClientCredentialsAuthProvider,
  createClientCredentialsAuthProvider,
  createClientCredentialsAuthProviderFromEnv,
} from './client-credentials.js';

// ============================================================================
// Factory Functions
// ============================================================================

export {
  createAuthProvider,
  createAuthProviderFromEnv,
  hasAuthentication,
  validateAuthConfig,
} from './factory.js';

// ============================================================================
// Default Export
// ============================================================================

/**
 * Default export for convenience.
 * Provides the factory function as the default export.
 *
 * @example
 * ```typescript
 * import createAuth from '@llmdevops/weaviate-integration/auth';
 *
 * const provider = createAuth({
 *   method: AuthType.ApiKey,
 *   apiKey: 'your-key'
 * });
 * ```
 */
export { createAuthProvider as default } from './factory.js';
