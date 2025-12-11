/**
 * Well-Known OAuth2 Providers
 *
 * Pre-configured provider settings for popular OAuth2/OIDC providers.
 */

import { ProviderConfig } from "../types";

/**
 * Google OAuth2/OIDC provider configuration.
 */
export const GoogleProvider: ProviderConfig = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
  introspectionEndpoint: undefined, // Google doesn't support introspection
  deviceAuthorizationEndpoint: "https://oauth2.googleapis.com/device/code",
  jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
  issuer: "https://accounts.google.com",
  scopesSupported: ["openid", "profile", "email"],
  grantTypesSupported: [
    "authorization_code",
    "refresh_token",
    "urn:ietf:params:oauth:grant-type:device_code",
  ],
  tokenEndpointAuthMethodsSupported: ["client_secret_post", "client_secret_basic"],
};

/**
 * GitHub OAuth2 provider configuration.
 */
export const GitHubProvider: ProviderConfig = {
  authorizationEndpoint: "https://github.com/login/oauth/authorize",
  tokenEndpoint: "https://github.com/login/oauth/access_token",
  revocationEndpoint: undefined, // GitHub doesn't support standard revocation
  introspectionEndpoint: undefined, // GitHub doesn't support introspection
  deviceAuthorizationEndpoint: "https://github.com/login/device/code",
  jwksUri: undefined, // GitHub doesn't use JWTs
  issuer: "https://github.com",
  scopesSupported: ["repo", "user", "gist", "admin:org", "workflow"],
  grantTypesSupported: [
    "authorization_code",
    "urn:ietf:params:oauth:grant-type:device_code",
  ],
  tokenEndpointAuthMethodsSupported: ["client_secret_post"],
};

/**
 * Microsoft Identity Platform (Azure AD) provider configuration.
 * Note: Uses common tenant. Replace with specific tenant for single-tenant apps.
 */
export const MicrosoftProvider: ProviderConfig = {
  authorizationEndpoint:
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  revocationEndpoint: undefined, // Use logout endpoint instead
  introspectionEndpoint: undefined, // Use Graph API instead
  deviceAuthorizationEndpoint:
    "https://login.microsoftonline.com/common/oauth2/v2.0/devicecode",
  jwksUri: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
  issuer: "https://login.microsoftonline.com/common/v2.0",
  scopesSupported: ["openid", "profile", "email", "offline_access"],
  grantTypesSupported: [
    "authorization_code",
    "refresh_token",
    "client_credentials",
    "urn:ietf:params:oauth:grant-type:device_code",
  ],
  tokenEndpointAuthMethodsSupported: ["client_secret_post", "client_secret_basic"],
};

/**
 * Create Microsoft provider for specific tenant.
 */
export function createMicrosoftProviderForTenant(tenantId: string): ProviderConfig {
  return {
    authorizationEndpoint:
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
    tokenEndpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    revocationEndpoint: undefined,
    introspectionEndpoint: undefined,
    deviceAuthorizationEndpoint:
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`,
    jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    scopesSupported: ["openid", "profile", "email", "offline_access"],
    grantTypesSupported: [
      "authorization_code",
      "refresh_token",
      "client_credentials",
      "urn:ietf:params:oauth:grant-type:device_code",
    ],
    tokenEndpointAuthMethodsSupported: ["client_secret_post", "client_secret_basic"],
  };
}

/**
 * Okta provider configuration template.
 */
export function createOktaProvider(domain: string): ProviderConfig {
  const baseUrl = domain.startsWith("https://") ? domain : `https://${domain}`;
  return {
    authorizationEndpoint: `${baseUrl}/oauth2/default/v1/authorize`,
    tokenEndpoint: `${baseUrl}/oauth2/default/v1/token`,
    revocationEndpoint: `${baseUrl}/oauth2/default/v1/revoke`,
    introspectionEndpoint: `${baseUrl}/oauth2/default/v1/introspect`,
    deviceAuthorizationEndpoint: `${baseUrl}/oauth2/default/v1/device/authorize`,
    jwksUri: `${baseUrl}/oauth2/default/v1/keys`,
    issuer: `${baseUrl}/oauth2/default`,
    scopesSupported: ["openid", "profile", "email", "offline_access"],
    grantTypesSupported: [
      "authorization_code",
      "refresh_token",
      "client_credentials",
      "urn:ietf:params:oauth:grant-type:device_code",
    ],
    tokenEndpointAuthMethodsSupported: [
      "client_secret_basic",
      "client_secret_post",
      "none",
    ],
  };
}

/**
 * Auth0 provider configuration template.
 */
export function createAuth0Provider(domain: string): ProviderConfig {
  const baseUrl = domain.startsWith("https://") ? domain : `https://${domain}`;
  return {
    authorizationEndpoint: `${baseUrl}/authorize`,
    tokenEndpoint: `${baseUrl}/oauth/token`,
    revocationEndpoint: `${baseUrl}/oauth/revoke`,
    introspectionEndpoint: undefined, // Auth0 doesn't support standard introspection
    deviceAuthorizationEndpoint: `${baseUrl}/oauth/device/code`,
    jwksUri: `${baseUrl}/.well-known/jwks.json`,
    issuer: `${baseUrl}/`,
    scopesSupported: ["openid", "profile", "email", "offline_access"],
    grantTypesSupported: [
      "authorization_code",
      "refresh_token",
      "client_credentials",
      "urn:ietf:params:oauth:grant-type:device_code",
    ],
    tokenEndpointAuthMethodsSupported: [
      "client_secret_basic",
      "client_secret_post",
      "none",
    ],
  };
}

/**
 * Well-known providers namespace.
 */
export const WellKnownProviders = {
  google: GoogleProvider,
  github: GitHubProvider,
  microsoft: MicrosoftProvider,
  createMicrosoftForTenant: createMicrosoftProviderForTenant,
  createOkta: createOktaProvider,
  createAuth0: createAuth0Provider,
} as const;
