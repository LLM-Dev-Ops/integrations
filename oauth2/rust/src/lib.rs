//! OAuth2 Integration Module
//!
//! Complete OAuth2/OIDC authentication integration following SPARC methodology.
//!
//! # Features
//!
//! - Authorization Code Flow (RFC 6749 Section 4.1)
//! - Authorization Code with PKCE (RFC 7636)
//! - Client Credentials Flow (RFC 6749 Section 4.4)
//! - Device Authorization Flow (RFC 8628)
//! - Token Refresh (RFC 6749 Section 6)
//! - Token Introspection (RFC 7662)
//! - Token Revocation (RFC 7009)
//! - OIDC Discovery (RFC 8414)
//!
//! # Example
//!
//! ```rust,ignore
//! use oauth2_integration::{OAuth2Client, oauth2_config, ClientAuthMethod};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     // Build configuration using the fluent builder
//!     let config = oauth2_config()
//!         .client_id("my-client-id")
//!         .client_secret("my-client-secret")
//!         .authorization_endpoint("https://provider.com/authorize")
//!         .token_endpoint("https://provider.com/token")
//!         .auth_method(ClientAuthMethod::ClientSecretBasic)
//!         .add_default_scope("openid")
//!         .add_default_scope("profile")
//!         .build()?;
//!
//!     // Create the OAuth2 client
//!     let client = OAuth2Client::new(config)?;
//!
//!     // Build authorization URL with PKCE
//!     let auth_url = client.build_pkce_authorization_url(
//!         oauth2_integration::PkceAuthorizationParams {
//!             redirect_uri: "https://myapp.com/callback".to_string(),
//!             scopes: Some(vec!["openid".to_string(), "profile".to_string()]),
//!             ..Default::default()
//!         }
//!     );
//!
//!     println!("Authorization URL: {}", auth_url.url);
//!     println!("Code verifier (save this): {}", auth_url.code_verifier);
//!
//!     Ok(())
//! }
//! ```
//!
//! # Architecture
//!
//! The module is organized into several sub-modules:
//!
//! - `types`: OAuth2 data structures and configuration types
//! - `error`: Comprehensive error hierarchy with error mapping
//! - `core`: Core infrastructure (HTTP transport, state management, PKCE, discovery)
//! - `flows`: OAuth2 flow implementations (auth code, PKCE, client credentials, device)
//! - `token`: Token lifecycle management (storage, manager, introspection, revocation)
//! - `builders`: Fluent builders for configuration
//! - `client`: High-level OAuth2 client combining all functionality

pub mod builders;
pub mod client;
pub mod core;
pub mod error;
pub mod flows;
pub mod resilience;
pub mod telemetry;
pub mod token;
pub mod types;

// Re-export main client
pub use client::{oauth2_client, OAuth2Client};

// Re-export builders
pub use builders::{oauth2_config, OAuth2ConfigBuilder};

// Re-export errors
pub use error::{
    create_error_from_response, get_user_message, map_authorization_error, map_token_error,
    parse_error_response, AuthorizationError, ConfigurationError, DeviceFlowError, NetworkError,
    OAuth2Error, OAuth2ErrorResponse, OAuth2Result, ProtocolError, ProviderError, StorageError,
    TokenError,
};

// Re-export types
pub use types::{
    // Config
    ClientAuthMethod, ClientCredentials, GrantType, OAuth2Config, OIDCDiscoveryDocument,
    ProviderConfig,
    // Token
    AccessToken, RefreshTokenParams, StoredTokens, TokenResponse,
    // Auth
    AuthorizationParams, AuthorizationUrl, ClientCredentialsParams, CodeExchangeRequest,
    PkceAuthorizationParams, PkceAuthorizationUrl, PkceCodeExchangeRequest, PkceMethod,
    PkceParams, Prompt,
    // Callback
    CallbackParams, StateMetadata,
    // Device
    DeviceAuthorizationResponse, DeviceCodeParams, DeviceTokenResult,
    // Introspection
    IntrospectionParams, IntrospectionResponse, RevocationParams, TokenTypeHint,
};

// Re-export core components
pub use core::{
    // Transport
    HttpMethod, HttpRequest, HttpResponse, HttpTransport, MockHttpTransport,
    ReqwestHttpTransport,
    // State
    InMemoryStateManager, MockStateManager, StateManager,
    // PKCE
    DefaultPkceGenerator, MockPkceGenerator, PkceGenerator,
    // Discovery
    DefaultDiscoveryClient, DiscoveryClient, MockDiscoveryClient,
};

// Re-export flows
pub use flows::{
    // Authorization Code
    AuthorizationCodeFlow, AuthorizationCodeFlowImpl, MockAuthorizationCodeFlow,
    // PKCE
    MockPkceAuthorizationCodeFlow, PkceAuthorizationCodeFlow, PkceAuthorizationCodeFlowImpl,
    // Client Credentials
    ClientCredentialsFlow, ClientCredentialsFlowImpl, ClientCredentialsRequest,
    MockClientCredentialsFlow,
    // Device
    DeviceAuthorizationFlow, DeviceAuthorizationFlowImpl, MockDeviceAuthorizationFlow,
};

// Re-export token management
pub use token::{
    // Storage
    InMemoryTokenStorage, MockTokenStorage, TokenStorage,
    // Manager
    DefaultTokenManager, MockTokenManager, TokenManager, TokenManagerConfig,
    // Introspection
    DefaultTokenIntrospector, MockTokenIntrospector, TokenIntrospector,
    // Revocation
    DefaultTokenRevoker, MockTokenRevoker, TokenRevoker,
};

// Re-export resilience
pub use resilience::{
    // Retry
    create_mock_retry_executor, create_retry_executor, MockRetryExecutor, OAuth2RetryExecutor,
    RetryConfig, RetryExecutor, RetryStats, DEFAULT_RETRY_CONFIG,
    // Circuit Breaker
    create_circuit_breaker, create_mock_circuit_breaker, CircuitBreaker, CircuitBreakerConfig,
    CircuitBreakerStats, CircuitState, MockCircuitBreaker, OAuth2CircuitBreaker,
    DEFAULT_CIRCUIT_BREAKER_CONFIG,
    // Rate Limiter
    create_mock_rate_limiter, create_rate_limiter, MockRateLimiter, RateLimiter,
    RateLimiterConfig, RateLimiterStats, TokenBucketRateLimiter, DEFAULT_RATE_LIMITS,
};

// Re-export telemetry
pub use telemetry::{
    // Metrics
    create_in_memory_metrics, no_op_metrics, Counter, Gauge, Histogram, InMemoryMetrics,
    MetricEntry, MetricLabels, NoOpMetrics, OAuth2Metrics,
    // Tracing
    create_in_memory_tracer, no_op_tracer, InMemorySpan, InMemoryTracer, NoOpSpan, NoOpTracer,
    OAuth2SpanAttributes, OAuth2SpanNames, Span, SpanAttributes, SpanStatus, Tracer,
    // Logging
    create_console_logger, create_in_memory_logger, no_op_logger, ConsoleLogger, InMemoryLogger,
    LogEntry, LogLevel, Logger, NoOpLogger, OAuth2LogContext,
};
