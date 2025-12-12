/**
 * OAuth2 Integration Module
 *
 * Complete OAuth2/OIDC authentication integration.
 *
 * @packageDocumentation
 */

// Types
export {
  // Token types
  TokenResponse,
  StoredTokens,
  AccessToken,
  SecretString,
  isExpiringSoon,
  isExpired,
  hasRefreshToken,
  toStoredTokens,
  toAccessToken,

  // Auth types
  AuthorizationParams,
  PkceAuthorizationParams,
  AuthorizationUrl,
  PkceAuthorizationUrl,
  CodeExchangeRequest,
  PkceCodeExchangeRequest,
  ClientCredentialsParams,
  RefreshTokenParams,
  Prompt,

  // Callback types
  CallbackParams,
  StateMetadata,
  parseCallbackUrl,
  isCallbackError,
  isCallbackSuccess,

  // Device types
  DeviceCodeParams,
  DeviceAuthorizationResponse,
  DeviceTokenResult,
  shouldContinuePolling,
  isDeviceAuthSuccess,

  // Introspection types
  IntrospectionParams,
  IntrospectionResponse,
  RevocationParams,
  isTokenActive,
  getTokenRemainingLifetime,

  // Config types
  ProviderConfig,
  ClientCredentials,
  OAuth2Config,
  ClientAuthMethod,
  GrantType,
  OIDCDiscoveryDocument,
  DEFAULT_CONFIG,
  discoveryToProviderConfig,
} from "./types";

// Errors
export {
  OAuth2Error,
  ConfigurationError,
  AuthorizationError,
  TokenError,
  ProviderError,
  NetworkError,
  ProtocolError,
  StorageError,
  isRetryable,
  needsReauth,
  getUserMessage,
  mapAuthorizationError,
  mapTokenError,
  parseErrorResponse,
  createErrorFromResponse,
  OAuth2ErrorResponse,
} from "./error";

// Core components
export {
  // Transport
  HttpRequest,
  HttpResponse,
  HttpTransport,
  FetchHttpTransport,
  MockHttpTransport,
  createTransport,
  createMockTransport,

  // State
  StateManager,
  InMemoryStateManager,
  MockStateManager,
  validateState,
  createStateManager,
  createMockStateManager,

  // PKCE
  PkceMethod,
  PkceParams,
  PkceGenerator,
  DefaultPkceGenerator,
  MockPkceGenerator,
  isValidVerifier,
  createPkceGenerator,
  createMockPkceGenerator,

  // Discovery
  DiscoveryClient,
  DefaultDiscoveryClient,
  MockDiscoveryClient,
  createDiscoveryClient,
  createMockDiscoveryClient,
  createMockDiscoveryDocument,
} from "./core";

// Flows
export {
  // Authorization Code
  AuthorizationCodeFlow,
  AuthorizationCodeFlowImpl,
  MockAuthorizationCodeFlow,
  createMockAuthorizationCodeFlow,

  // PKCE
  AuthorizationCodePkceFlow,
  AuthorizationCodePkceFlowImpl,
  MockAuthorizationCodePkceFlow,
  createMockAuthorizationCodePkceFlow,

  // Client Credentials
  ClientCredentialsFlow,
  CachingClientCredentialsFlow,
  ClientCredentialsFlowImpl,
  CachingClientCredentialsFlowImpl,
  MockClientCredentialsFlow,
  createMockClientCredentialsFlow,

  // Device Authorization
  DeviceAuthorizationFlow,
  DeviceAuthorizationFlowImpl,
  MockDeviceAuthorizationFlow,
  createMockDeviceAuthorizationFlow,
} from "./flows";

// Token management
export {
  // Storage
  TokenStorage,
  InMemoryTokenStorage,
  FileTokenStorage,
  MockTokenStorage,
  createInMemoryStorage,
  createFileStorage,
  createMockTokenStorage,

  // Manager
  TokenManager,
  TokenManagerImpl,
  MockTokenManager,
  createMockTokenManager,

  // Introspection
  TokenIntrospection,
  TokenIntrospectionImpl,
  MockTokenIntrospection,
  createMockTokenIntrospection,

  // Revocation
  TokenRevocation,
  TokenRevocationImpl,
  MockTokenRevocation,
  createMockTokenRevocation,
} from "./token";

// Client
export {
  OAuth2Client,
  OAuth2ClientImpl,
  MockOAuth2Client,
  createMockOAuth2Client,

  // Builder
  OAuth2ConfigBuilder,
  OAuth2ClientBuilder,
  configBuilder,
  clientBuilder,
  forGoogle,
  forGitHub,
  forMicrosoft,
  fromDiscovery,

  // Providers
  WellKnownProviders,
  GoogleProvider,
  GitHubProvider,
  MicrosoftProvider,
  createMicrosoftProviderForTenant,
  createOktaProvider,
  createAuth0Provider,
} from "./client";

// Resilience
export {
  // Retry
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
  RetryExecutor,
  OAuth2RetryExecutor,
  MockRetryExecutor,
  createRetryExecutor,
  createMockRetryExecutor,

  // Circuit Breaker
  CircuitState,
  CircuitBreakerConfig,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  CircuitBreaker,
  OAuth2CircuitBreaker,
  MockCircuitBreaker,
  createCircuitBreaker,
  createMockCircuitBreaker,

  // Rate Limiter
  RateLimiterConfig,
  DEFAULT_RATE_LIMITS,
  RateLimiter,
  TokenBucketRateLimiter,
  MockRateLimiter,
  createRateLimiter,
  createMockRateLimiter,
} from "./resilience";

// Telemetry
export {
  // Metrics
  MetricLabels,
  Counter,
  Gauge,
  Histogram,
  OAuth2Metrics,
  noOpMetrics,
  InMemoryMetrics,
  createInMemoryMetrics,

  // Tracing
  SpanAttributes,
  SpanStatus,
  Span,
  Tracer,
  OAuth2SpanNames,
  OAuth2SpanAttributes,
  noOpTracer,
  InMemorySpan,
  InMemoryTracer,
  createInMemoryTracer,

  // Logging
  LogLevel,
  OAuth2LogContext,
  Logger,
  noOpLogger,
  LogEntry,
  InMemoryLogger,
  ConsoleLogger,
  createInMemoryLogger,
  createConsoleLogger,
} from "./telemetry";
