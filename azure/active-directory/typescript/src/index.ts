/**
 * Azure Active Directory OAuth2 Integration
 *
 * A thin adapter layer for Azure AD (Microsoft Entra ID) authentication.
 * Provides OAuth2/OIDC flows for enterprise-scale identity workflows.
 *
 * @packageDocumentation
 */

// Main client
export {
  AzureAdClient,
  createAzureAdClient,
  createAzureAdClientFromEnv,
  type AzureAdClientOptions,
} from "./client/index.js";

// Configuration
export {
  AzureAdConfigBuilder,
  createConfigBuilder,
  type AzureAdConfig,
  type SimulationMode,
  type CacheConfig,
  type RetryConfig,
  type CircuitBreakerConfig,
  DEFAULT_CACHE_CONFIG,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_AUTHORITY,
} from "./config.js";

// Types
export type {
  AccessToken,
  TokenResponse,
  DeviceCodeResponse,
  AuthorizationUrl,
  TokenClaims,
  CredentialType,
  SecretCredential,
  CertificateCredential,
  ManagedIdentityCredential,
  NoCredential,
} from "./types/index.js";

// Errors
export {
  AzureAdError,
  isRetryable,
  fromOAuthError,
  networkError,
  configError,
  invalidCredentials,
  expiredToken,
  invalidToken,
  managedIdentityUnavailable,
  simulationNoMatch,
  type AzureAdErrorCode,
} from "./error.js";

// Flows (for advanced usage)
export { acquireTokenClientCredentials } from "./flows/client-credentials.js";
export {
  getAuthorizationUrl,
  acquireTokenByAuthCode,
  type AuthCodeParams,
} from "./flows/authorization-code.js";
export {
  initiateDeviceCode,
  acquireTokenByDeviceCode,
} from "./flows/device-code.js";
export {
  acquireTokenManagedIdentity,
  isManagedIdentityAvailable,
} from "./flows/managed-identity.js";

// Token management
export { TokenCache, createTokenCache } from "./token/cache.js";
export {
  JwksCache,
  validateClaims,
  verifySignature,
  createJwksCache,
  type JsonWebKey,
  type JwksDocument,
} from "./token/validation.js";

// Crypto utilities
export { generatePkce, generateState, base64UrlDecode } from "./crypto/pkce.js";
export {
  parseJwtHeader,
  parseJwtPayload,
  createClientAssertion,
  type JwtHeader,
  type ClientAssertionClaims,
} from "./crypto/jwt.js";

// Simulation
export {
  SimulationLayer,
  createSimulationLayer,
  SimulationStorage,
  type RecordedAuthInteraction,
  type SerializedTokenRequest,
  type SerializedTokenResponse,
  type MockTokenTemplate,
} from "./simulation/index.js";

// Observability
export {
  type Logger,
  type MetricsCollector,
  type Tracer,
  type SpanContext,
  type LogLevel,
  ConsoleLogger,
  NoopLogger,
  NoopMetricsCollector,
  NoopTracer,
  createConsoleLogger,
  createNoopLogger,
  createNoopMetricsCollector,
  createNoopTracer,
  MetricNames,
} from "./observability/index.js";

// Resilience
export {
  CircuitBreaker,
  RetryExecutor,
  ResilientExecutor,
  createCircuitBreaker,
  createRetryExecutor,
  createResilientExecutor,
  type CircuitState,
} from "./resilience/index.js";
