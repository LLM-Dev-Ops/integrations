/**
 * OAuth2 Configuration Types
 *
 * Configuration types for OAuth2 client setup.
 */

/**
 * Client authentication method.
 */
export type ClientAuthMethod =
  | "client_secret_basic"
  | "client_secret_post"
  | "client_secret_jwt"
  | "private_key_jwt"
  | "none";

/**
 * Grant types supported.
 */
export type GrantType =
  | "authorization_code"
  | "refresh_token"
  | "client_credentials"
  | "urn:ietf:params:oauth:grant-type:device_code";

/**
 * OAuth2 provider configuration.
 */
export interface ProviderConfig {
  /** Authorization endpoint URL */
  authorizationEndpoint: string;
  /** Token endpoint URL */
  tokenEndpoint: string;
  /** Token revocation endpoint URL */
  revocationEndpoint?: string;
  /** Token introspection endpoint URL */
  introspectionEndpoint?: string;
  /** Device authorization endpoint URL */
  deviceAuthorizationEndpoint?: string;
  /** JWKS URI for token validation */
  jwksUri?: string;
  /** Issuer identifier */
  issuer?: string;
  /** Supported scopes */
  scopesSupported?: string[];
  /** Supported grant types */
  grantTypesSupported?: GrantType[];
  /** Supported auth methods */
  tokenEndpointAuthMethodsSupported?: ClientAuthMethod[];
}

/**
 * Client credentials.
 */
export interface ClientCredentials {
  /** Client identifier */
  clientId: string;
  /** Client secret (for confidential clients) */
  clientSecret?: string;
  /** Authentication method */
  authMethod?: ClientAuthMethod;
}

/**
 * OAuth2 client configuration.
 */
export interface OAuth2Config {
  /** Provider configuration */
  provider: ProviderConfig;
  /** Client credentials */
  credentials: ClientCredentials;
  /** Default scopes to request */
  defaultScopes?: string[];
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Default token lifetime if not specified in response */
  defaultTokenLifetime?: number;
  /** Maximum token lifetime (cap very large expires_in) */
  maxTokenLifetime?: number;
  /** Clock skew tolerance in seconds */
  clockSkewTolerance?: number;
  /** Token refresh threshold in seconds */
  refreshThreshold?: number;
  /** State expiration in seconds */
  stateExpiration?: number;
  /** PKCE code verifier length */
  pkceVerifierLength?: number;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG = {
  timeout: 30000,
  defaultTokenLifetime: 3600,
  maxTokenLifetime: 90 * 24 * 60 * 60, // 90 days
  clockSkewTolerance: 30,
  refreshThreshold: 300, // 5 minutes
  stateExpiration: 600, // 10 minutes
  pkceVerifierLength: 64,
} as const;

/**
 * OIDC Discovery document structure.
 */
export interface OIDCDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  response_modes_supported?: string[];
  grant_types_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  revocation_endpoint?: string;
  introspection_endpoint?: string;
  device_authorization_endpoint?: string;
  code_challenge_methods_supported?: string[];
}

/**
 * Convert OIDC discovery document to provider config.
 */
export function discoveryToProviderConfig(
  discovery: OIDCDiscoveryDocument
): ProviderConfig {
  return {
    authorizationEndpoint: discovery.authorization_endpoint,
    tokenEndpoint: discovery.token_endpoint,
    revocationEndpoint: discovery.revocation_endpoint,
    introspectionEndpoint: discovery.introspection_endpoint,
    deviceAuthorizationEndpoint: discovery.device_authorization_endpoint,
    jwksUri: discovery.jwks_uri,
    issuer: discovery.issuer,
    scopesSupported: discovery.scopes_supported,
    grantTypesSupported: discovery.grant_types_supported as GrantType[],
    tokenEndpointAuthMethodsSupported:
      discovery.token_endpoint_auth_methods_supported as ClientAuthMethod[],
  };
}
