# OAuth2 Authentication Integration Module - Pseudocode (Part 1)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/oauth2`
**File:** 1 of 4 - Core Infrastructure & Configuration

---

## Table of Contents (Part 1)

1. [Overview](#1-overview)
2. [Client Initialization](#2-client-initialization)
3. [Configuration Management](#3-configuration-management)
4. [HTTP Transport Layer](#4-http-transport-layer)
5. [OIDC Discovery](#5-oidc-discovery)
6. [State Management](#6-state-management)
7. [PKCE Generation](#7-pkce-generation)

---

## 1. Overview

This document provides pseudocode algorithms for the core infrastructure components of the OAuth2 Authentication Integration Module. The pseudocode is language-agnostic but maps directly to Rust and TypeScript implementations.

### 1.1 Pseudocode Conventions

```
FUNCTION name(param: Type) -> ReturnType
  // Comments explain intent
  VARIABLE <- expression
  IF condition THEN
    action
  ELSE
    alternative
  END IF
  FOR EACH item IN collection DO
    process(item)
  END FOR
  WHILE condition DO
    action
  END WHILE
  TRY
    risky_operation()
  CATCH ErrorType AS e
    handle(e)
  END TRY
  RETURN value
END FUNCTION
```

### 1.2 London-School TDD Mapping

Each interface defined here serves as a **contract** for:
1. **Production implementations** - Real HTTP clients, actual OAuth2 providers
2. **Test doubles (mocks)** - Controlled responses for unit testing
3. **Dependency injection** - Composable, testable architecture

```
// Test Example Pattern
MOCK TokenManager {
  get_access_token: returns predefined AccessToken
  refresh: returns predefined TokenResponse
  store_tokens: records call arguments
}

// Inject mock into client for isolated testing
test_client <- OAuth2ClientImpl::with_mock_services(mock_services)
```

### 1.3 Module Dependencies

The OAuth2 module depends ONLY on these Integration Repo primitives:

```
CONST ALLOWED_DEPENDENCIES = [
  "integrations-errors",      // Base error types
  "integrations-retry",       // Retry with backoff
  "integrations-circuit-breaker",  // Fault isolation
  "integrations-rate-limit",  // Request throttling
  "integrations-tracing",     // Distributed tracing
  "integrations-logging",     // Structured logging
  "integrations-types",       // Shared types
  "integrations-config"       // Configuration management
]

// FORBIDDEN: ruvbase, integrations-openai, integrations-github, etc.
```

---

## 2. Client Initialization

### 2.1 Client Factory

```
FUNCTION create_oauth2_client(config: OAuth2Config) -> Result<OAuth2Client, OAuth2Error>
  // Step 1: Validate configuration
  validation_result <- validate_config(config)
  IF validation_result IS Error THEN
    RETURN Error(ConfigurationError::InvalidConfiguration(validation_result.message))
  END IF

  // Step 2: Initialize dependencies from Integration Repo primitives
  logger <- get_logger_from_primitive("oauth2")
  tracer <- get_tracer_from_primitive("oauth2")

  // Step 3: Build retry executor from integrations-retry primitive
  retry_config <- RetryConfig {
    max_retries: config.retry_config.max_retries OR 3,
    initial_backoff: config.retry_config.initial_backoff OR 500ms,
    max_backoff: config.retry_config.max_backoff OR 30s,
    backoff_multiplier: config.retry_config.backoff_multiplier OR 2.0,
    jitter: config.retry_config.jitter OR 0.1,
    retryable_errors: [NetworkTimeout, ServerError5xx, TemporarilyUnavailable]
  }
  retry_executor <- create_retry_executor(retry_config)

  // Step 4: Build rate limiter from integrations-rate-limit primitive
  rate_limiter <- create_rate_limiter(RateLimitConfig {
    token_endpoint_rpm: 60,
    authorization_endpoint_rpm: 30,
    max_concurrent_requests: 10
  })

  // Step 5: Build circuit breaker from integrations-circuit-breaker primitive
  circuit_breaker <- create_circuit_breaker(CircuitBreakerConfig {
    failure_threshold: 5,
    success_threshold: 3,
    failure_window: 60s,
    reset_timeout: 30s
  })

  // Step 6: Build HTTP transport
  transport <- create_http_transport(HttpTransportConfig {
    timeout: config.timeout,
    tls_config: TlsConfig {
      min_version: TlsVersion::TLS_1_2,
      verify_certificates: true
    }
  })

  // Step 7: Initialize token storage
  token_storage <- MATCH config.storage
    CASE TokenStorageConfig::InMemory:
      InMemoryTokenStorage::new()
    CASE TokenStorageConfig::File { path }:
      FileTokenStorage::new(path)?
    CASE TokenStorageConfig::Custom(storage):
      storage
  END MATCH

  // Step 8: Initialize state manager
  state_manager <- StateManager::new(
    entropy_bits: 128,
    expiration: 10.minutes()
  )

  // Step 9: Initialize PKCE generator
  pkce_generator <- PkceGenerator::new(
    verifier_length: 64,
    default_method: PkceMethod::S256
  )

  // Step 10: Assemble client
  client <- OAuth2ClientImpl {
    config: config,
    transport: transport,
    token_storage: token_storage,
    state_manager: state_manager,
    pkce_generator: pkce_generator,
    retry_executor: retry_executor,
    rate_limiter: rate_limiter,
    circuit_breaker: circuit_breaker,
    logger: logger,
    tracer: tracer,

    // Lazy-initialized flow handlers
    authorization_code_flow: None,
    authorization_code_pkce_flow: None,
    client_credentials_flow: None,
    device_authorization_flow: None,
    token_manager: None,
    token_introspection: None,
    token_revocation: None
  }

  logger.info("OAuth2 client initialized", {
    authorization_endpoint: config.provider.authorization_endpoint,
    token_endpoint: config.provider.token_endpoint,
    client_id: config.credentials.client_id,
    auth_method: config.credentials.auth_method
  })

  RETURN Ok(client)
END FUNCTION
```

### 2.2 Client with OIDC Discovery

```
ASYNC FUNCTION create_oauth2_client_from_discovery(
  issuer_url: Url,
  credentials: ClientCredentials
) -> Result<OAuth2Client, OAuth2Error>

  // Step 1: Build discovery URL
  discovery_url <- build_discovery_url(issuer_url)

  // Step 2: Fetch OIDC discovery document
  logger <- get_logger_from_primitive("oauth2")
  logger.info("Fetching OIDC discovery document", {
    discovery_url: discovery_url.to_string()
  })

  transport <- create_http_transport(HttpTransportConfig::default())

  request <- HttpRequest {
    method: GET,
    url: discovery_url,
    headers: HeaderMap::from([
      ("Accept", "application/json")
    ]),
    body: None,
    timeout: Some(30s)
  }

  TRY
    response <- transport.send(request).await
  CATCH NetworkError AS e
    RETURN Error(ConfigurationError::DiscoveryFailed {
      message: format("Failed to fetch discovery document: {}", e)
    })
  END TRY

  IF NOT response.status.is_success() THEN
    RETURN Error(ConfigurationError::DiscoveryFailed {
      message: format("Discovery returned status {}", response.status)
    })
  END IF

  // Step 3: Parse discovery document
  TRY
    discovery <- parse_json::<OIDCDiscoveryDocument>(response.body)?
  CATCH ParseError AS e
    RETURN Error(ConfigurationError::DiscoveryFailed {
      message: format("Invalid discovery document: {}", e)
    })
  END TRY

  // Step 4: Validate discovery document
  validate_discovery_document(discovery)?

  // Step 5: Build provider config from discovery
  provider_config <- ProviderConfig {
    authorization_endpoint: Url::parse(discovery.authorization_endpoint)?,
    token_endpoint: Url::parse(discovery.token_endpoint)?,
    device_authorization_endpoint: discovery.device_authorization_endpoint
      .map(Url::parse)
      .transpose()?,
    introspection_endpoint: discovery.introspection_endpoint
      .map(Url::parse)
      .transpose()?,
    revocation_endpoint: discovery.revocation_endpoint
      .map(Url::parse)
      .transpose()?,
    userinfo_endpoint: discovery.userinfo_endpoint
      .map(Url::parse)
      .transpose()?,
    jwks_uri: discovery.jwks_uri
      .map(Url::parse)
      .transpose()?,
    issuer: Some(discovery.issuer),
    discovery_url: Some(discovery_url)
  }

  logger.info("OIDC discovery completed", {
    issuer: discovery.issuer,
    authorization_endpoint: provider_config.authorization_endpoint,
    token_endpoint: provider_config.token_endpoint
  })

  // Step 6: Build config and create client
  config <- OAuth2Config {
    provider: provider_config,
    credentials: credentials,
    default_scopes: vec!["openid"],
    storage: TokenStorageConfig::InMemory,
    timeout: 30s,
    retry_config: RetryConfig::default(),
    auto_refresh: true,
    refresh_threshold_secs: 60
  }

  RETURN create_oauth2_client(config)
END FUNCTION

FUNCTION build_discovery_url(issuer_url: Url) -> Url
  // OIDC Discovery URL: {issuer}/.well-known/openid-configuration
  path <- issuer_url.path()

  IF path.ends_with("/") THEN
    path <- path[0..path.len()-1]
  END IF

  new_path <- format("{}/.well-known/openid-configuration", path)

  result <- issuer_url.clone()
  result.set_path(new_path)

  RETURN result
END FUNCTION

STRUCT OIDCDiscoveryDocument {
  issuer: String,
  authorization_endpoint: String,
  token_endpoint: String,
  userinfo_endpoint: Option<String>,
  jwks_uri: Option<String>,
  registration_endpoint: Option<String>,
  scopes_supported: Option<Vec<String>>,
  response_types_supported: Vec<String>,
  response_modes_supported: Option<Vec<String>>,
  grant_types_supported: Option<Vec<String>>,
  token_endpoint_auth_methods_supported: Option<Vec<String>>,
  revocation_endpoint: Option<String>,
  revocation_endpoint_auth_methods_supported: Option<Vec<String>>,
  introspection_endpoint: Option<String>,
  introspection_endpoint_auth_methods_supported: Option<Vec<String>>,
  device_authorization_endpoint: Option<String>,
  code_challenge_methods_supported: Option<Vec<String>>,
  // Additional fields captured for forward compatibility
  extra: HashMap<String, serde_json::Value>
}

FUNCTION validate_discovery_document(doc: OIDCDiscoveryDocument) -> Result<(), OAuth2Error>
  errors <- []

  // Required fields
  IF doc.issuer.is_empty() THEN
    errors.push("Missing required field: issuer")
  END IF

  IF doc.authorization_endpoint.is_empty() THEN
    errors.push("Missing required field: authorization_endpoint")
  END IF

  IF doc.token_endpoint.is_empty() THEN
    errors.push("Missing required field: token_endpoint")
  END IF

  // Validate response types
  IF NOT doc.response_types_supported.contains("code") THEN
    errors.push("Provider must support 'code' response type")
  END IF

  // Validate URLs
  TRY
    Url::parse(doc.authorization_endpoint)?
    Url::parse(doc.token_endpoint)?
  CATCH
    errors.push("Invalid endpoint URL format")
  END TRY

  IF NOT errors.is_empty() THEN
    RETURN Error(ConfigurationError::DiscoveryFailed {
      message: errors.join(", ")
    })
  END IF

  RETURN Ok(())
END FUNCTION
```

### 2.3 Service Accessor Pattern

```
// London-School TDD: Services are interfaces that can be mocked
FUNCTION client.authorization_code() -> &AuthorizationCodeFlow
  IF self.authorization_code_flow IS None THEN
    LOCK self.service_mutex
      IF self.authorization_code_flow IS None THEN
        self.authorization_code_flow <- Some(AuthorizationCodeFlowImpl::new(
          config: self.config.clone(),
          transport: self.transport.clone(),
          state_manager: self.state_manager.clone(),
          retry_executor: self.retry_executor.clone(),
          rate_limiter: self.rate_limiter.clone(),
          circuit_breaker: self.circuit_breaker.clone(),
          logger: self.logger.clone(),
          tracer: self.tracer.clone()
        ))
      END IF
    END LOCK
  END IF

  RETURN self.authorization_code_flow.as_ref().unwrap()
END FUNCTION

FUNCTION client.authorization_code_pkce() -> &AuthorizationCodePkceFlow
  IF self.authorization_code_pkce_flow IS None THEN
    LOCK self.service_mutex
      IF self.authorization_code_pkce_flow IS None THEN
        self.authorization_code_pkce_flow <- Some(AuthorizationCodePkceFlowImpl::new(
          config: self.config.clone(),
          transport: self.transport.clone(),
          state_manager: self.state_manager.clone(),
          pkce_generator: self.pkce_generator.clone(),
          retry_executor: self.retry_executor.clone(),
          rate_limiter: self.rate_limiter.clone(),
          circuit_breaker: self.circuit_breaker.clone(),
          logger: self.logger.clone(),
          tracer: self.tracer.clone()
        ))
      END IF
    END LOCK
  END IF

  RETURN self.authorization_code_pkce_flow.as_ref().unwrap()
END FUNCTION

FUNCTION client.client_credentials() -> &ClientCredentialsFlow
  IF self.client_credentials_flow IS None THEN
    LOCK self.service_mutex
      IF self.client_credentials_flow IS None THEN
        self.client_credentials_flow <- Some(ClientCredentialsFlowImpl::new(
          config: self.config.clone(),
          transport: self.transport.clone(),
          retry_executor: self.retry_executor.clone(),
          rate_limiter: self.rate_limiter.clone(),
          circuit_breaker: self.circuit_breaker.clone(),
          logger: self.logger.clone(),
          tracer: self.tracer.clone()
        ))
      END IF
    END LOCK
  END IF

  RETURN self.client_credentials_flow.as_ref().unwrap()
END FUNCTION

FUNCTION client.device_authorization() -> &DeviceAuthorizationFlow
  IF self.device_authorization_flow IS None THEN
    LOCK self.service_mutex
      IF self.device_authorization_flow IS None THEN
        // Check if provider supports device flow
        IF self.config.provider.device_authorization_endpoint IS None THEN
          panic("Device authorization not supported by this provider")
        END IF

        self.device_authorization_flow <- Some(DeviceAuthorizationFlowImpl::new(
          config: self.config.clone(),
          transport: self.transport.clone(),
          retry_executor: self.retry_executor.clone(),
          rate_limiter: self.rate_limiter.clone(),
          circuit_breaker: self.circuit_breaker.clone(),
          logger: self.logger.clone(),
          tracer: self.tracer.clone()
        ))
      END IF
    END LOCK
  END IF

  RETURN self.device_authorization_flow.as_ref().unwrap()
END FUNCTION

FUNCTION client.tokens() -> &TokenManager
  IF self.token_manager IS None THEN
    LOCK self.service_mutex
      IF self.token_manager IS None THEN
        self.token_manager <- Some(TokenManagerImpl::new(
          config: self.config.clone(),
          transport: self.transport.clone(),
          storage: self.token_storage.clone(),
          retry_executor: self.retry_executor.clone(),
          rate_limiter: self.rate_limiter.clone(),
          circuit_breaker: self.circuit_breaker.clone(),
          logger: self.logger.clone(),
          tracer: self.tracer.clone()
        ))
      END IF
    END LOCK
  END IF

  RETURN self.token_manager.as_ref().unwrap()
END FUNCTION

FUNCTION client.introspection() -> &TokenIntrospection
  IF self.token_introspection IS None THEN
    LOCK self.service_mutex
      IF self.token_introspection IS None THEN
        // Check if provider supports introspection
        IF self.config.provider.introspection_endpoint IS None THEN
          panic("Token introspection not supported by this provider")
        END IF

        self.token_introspection <- Some(TokenIntrospectionImpl::new(
          config: self.config.clone(),
          transport: self.transport.clone(),
          retry_executor: self.retry_executor.clone(),
          rate_limiter: self.rate_limiter.clone(),
          circuit_breaker: self.circuit_breaker.clone(),
          logger: self.logger.clone(),
          tracer: self.tracer.clone()
        ))
      END IF
    END LOCK
  END IF

  RETURN self.token_introspection.as_ref().unwrap()
END FUNCTION

FUNCTION client.revocation() -> &TokenRevocation
  IF self.token_revocation IS None THEN
    LOCK self.service_mutex
      IF self.token_revocation IS None THEN
        // Check if provider supports revocation
        IF self.config.provider.revocation_endpoint IS None THEN
          panic("Token revocation not supported by this provider")
        END IF

        self.token_revocation <- Some(TokenRevocationImpl::new(
          config: self.config.clone(),
          transport: self.transport.clone(),
          storage: self.token_storage.clone(),
          retry_executor: self.retry_executor.clone(),
          rate_limiter: self.rate_limiter.clone(),
          circuit_breaker: self.circuit_breaker.clone(),
          logger: self.logger.clone(),
          tracer: self.tracer.clone()
        ))
      END IF
    END LOCK
  END IF

  RETURN self.token_revocation.as_ref().unwrap()
END FUNCTION
```

### 2.4 Mock Client for Testing

```
// London-School TDD: Factory for creating test clients with mocked services
FUNCTION create_test_client(mock_config: MockConfig) -> OAuth2Client
  RETURN OAuth2ClientImpl {
    config: OAuth2Config::default(),
    transport: mock_config.transport OR MockHttpTransport::new(),
    token_storage: mock_config.token_storage OR MockTokenStorage::new(),
    state_manager: MockStateManager::new(),
    pkce_generator: MockPkceGenerator::new(),
    retry_executor: MockRetryExecutor::new(),
    rate_limiter: MockRateLimiter::new(),
    circuit_breaker: MockCircuitBreaker::new(),
    logger: MockLogger::new(),
    tracer: MockTracer::new(),

    // Pre-inject mock services
    authorization_code_flow: mock_config.authorization_code_flow,
    authorization_code_pkce_flow: mock_config.authorization_code_pkce_flow,
    client_credentials_flow: mock_config.client_credentials_flow,
    device_authorization_flow: mock_config.device_authorization_flow,
    token_manager: mock_config.token_manager,
    token_introspection: mock_config.token_introspection,
    token_revocation: mock_config.token_revocation
  }
END FUNCTION

STRUCT MockConfig {
  transport: Option<MockHttpTransport>,
  token_storage: Option<MockTokenStorage>,
  authorization_code_flow: Option<MockAuthorizationCodeFlow>,
  authorization_code_pkce_flow: Option<MockAuthorizationCodePkceFlow>,
  client_credentials_flow: Option<MockClientCredentialsFlow>,
  device_authorization_flow: Option<MockDeviceAuthorizationFlow>,
  token_manager: Option<MockTokenManager>,
  token_introspection: Option<MockTokenIntrospection>,
  token_revocation: Option<MockTokenRevocation>
}
```

---

## 3. Configuration Management

### 3.1 Configuration Validation

```
FUNCTION validate_config(config: OAuth2Config) -> Result<(), ValidationError>
  errors <- []

  // Validate provider configuration
  provider_validation <- validate_provider_config(config.provider)
  IF provider_validation IS Error THEN
    errors.extend(provider_validation.messages)
  END IF

  // Validate credentials
  credentials_validation <- validate_credentials(config.credentials)
  IF credentials_validation IS Error THEN
    errors.extend(credentials_validation.messages)
  END IF

  // Validate timeout
  IF config.timeout < 1s THEN
    errors.push("Timeout must be at least 1 second")
  ELSE IF config.timeout > 300s THEN
    errors.push("Timeout cannot exceed 300 seconds (5 minutes)")
  END IF

  // Validate refresh threshold
  IF config.auto_refresh AND config.refresh_threshold_secs < 10 THEN
    errors.push("Refresh threshold must be at least 10 seconds")
  END IF

  IF config.auto_refresh AND config.refresh_threshold_secs > 3600 THEN
    errors.push("Refresh threshold cannot exceed 3600 seconds (1 hour)")
  END IF

  // Return result
  IF errors.is_empty() THEN
    RETURN Ok(())
  ELSE
    RETURN Error(ValidationError { messages: errors })
  END IF
END FUNCTION

FUNCTION validate_provider_config(provider: ProviderConfig) -> Result<(), ValidationError>
  errors <- []

  // Validate authorization endpoint
  TRY
    auth_url <- Url::parse(provider.authorization_endpoint.to_string())
    IF auth_url.scheme() NOT IN ["https", "http"] THEN
      errors.push("Authorization endpoint must use HTTPS or HTTP scheme")
    END IF
    IF auth_url.scheme() == "http" AND is_production_environment() THEN
      errors.push("HTTP is not allowed in production for authorization endpoint")
    END IF
  CATCH ParseError
    errors.push("Invalid authorization endpoint URL format")
  END TRY

  // Validate token endpoint
  TRY
    token_url <- Url::parse(provider.token_endpoint.to_string())
    IF token_url.scheme() NOT IN ["https", "http"] THEN
      errors.push("Token endpoint must use HTTPS or HTTP scheme")
    END IF
    IF token_url.scheme() == "http" AND is_production_environment() THEN
      errors.push("HTTP is not allowed in production for token endpoint")
    END IF
  CATCH ParseError
    errors.push("Invalid token endpoint URL format")
  END TRY

  // Validate optional endpoints
  IF provider.device_authorization_endpoint IS Some THEN
    TRY
      Url::parse(provider.device_authorization_endpoint.unwrap().to_string())
    CATCH ParseError
      errors.push("Invalid device authorization endpoint URL format")
    END TRY
  END IF

  IF provider.introspection_endpoint IS Some THEN
    TRY
      Url::parse(provider.introspection_endpoint.unwrap().to_string())
    CATCH ParseError
      errors.push("Invalid introspection endpoint URL format")
    END TRY
  END IF

  IF provider.revocation_endpoint IS Some THEN
    TRY
      Url::parse(provider.revocation_endpoint.unwrap().to_string())
    CATCH ParseError
      errors.push("Invalid revocation endpoint URL format")
    END TRY
  END IF

  IF NOT errors.is_empty() THEN
    RETURN Error(ValidationError { messages: errors })
  END IF

  RETURN Ok(())
END FUNCTION

FUNCTION validate_credentials(credentials: ClientCredentials) -> Result<(), ValidationError>
  errors <- []

  // Validate client_id
  IF credentials.client_id.is_empty() THEN
    errors.push("Client ID is required")
  END IF

  IF credentials.client_id.len() > 256 THEN
    errors.push("Client ID exceeds maximum length of 256 characters")
  END IF

  // Validate client_secret for confidential clients
  MATCH credentials.auth_method
    CASE ClientAuthMethod::ClientSecretPost:
    CASE ClientAuthMethod::ClientSecretBasic:
    CASE ClientAuthMethod::ClientSecretJwt:
      IF credentials.client_secret IS None THEN
        errors.push("Client secret is required for this authentication method")
      ELSE IF credentials.client_secret.unwrap().expose_secret().is_empty() THEN
        errors.push("Client secret cannot be empty")
      END IF

    CASE ClientAuthMethod::PrivateKeyJwt:
      // Private key JWT uses a different credential
      IF credentials.client_secret IS Some THEN
        log_warning("Client secret is not used with private_key_jwt authentication")
      END IF

    CASE ClientAuthMethod::None:
      // Public client - no secret required
      IF credentials.client_secret IS Some THEN
        log_warning("Client secret provided but auth method is 'none' (public client)")
      END IF
  END MATCH

  IF NOT errors.is_empty() THEN
    RETURN Error(ValidationError { messages: errors })
  END IF

  RETURN Ok(())
END FUNCTION
```

### 3.2 Configuration Builder

```
STRUCT OAuth2ConfigBuilder {
  provider: Option<ProviderConfig>,
  credentials: Option<ClientCredentials>,
  default_scopes: Vec<String>,
  storage: TokenStorageConfig,
  timeout: Duration,
  retry_config: Option<RetryConfig>,
  auto_refresh: bool,
  refresh_threshold_secs: u64
}

FUNCTION OAuth2ConfigBuilder::new() -> OAuth2ConfigBuilder
  RETURN OAuth2ConfigBuilder {
    provider: None,
    credentials: None,
    default_scopes: vec![],
    storage: TokenStorageConfig::InMemory,
    timeout: 30s,
    retry_config: None,
    auto_refresh: true,
    refresh_threshold_secs: 60
  }
END FUNCTION

FUNCTION builder.provider(config: ProviderConfig) -> OAuth2ConfigBuilder
  self.provider <- Some(config)
  RETURN self
END FUNCTION

FUNCTION builder.authorization_endpoint(url: String) -> OAuth2ConfigBuilder
  IF self.provider IS None THEN
    self.provider <- Some(ProviderConfig::default())
  END IF
  self.provider.as_mut().unwrap().authorization_endpoint <- Url::parse(url).unwrap()
  RETURN self
END FUNCTION

FUNCTION builder.token_endpoint(url: String) -> OAuth2ConfigBuilder
  IF self.provider IS None THEN
    self.provider <- Some(ProviderConfig::default())
  END IF
  self.provider.as_mut().unwrap().token_endpoint <- Url::parse(url).unwrap()
  RETURN self
END FUNCTION

FUNCTION builder.client_id(id: String) -> OAuth2ConfigBuilder
  IF self.credentials IS None THEN
    self.credentials <- Some(ClientCredentials {
      client_id: id,
      client_secret: None,
      auth_method: ClientAuthMethod::None
    })
  ELSE
    self.credentials.as_mut().unwrap().client_id <- id
  END IF
  RETURN self
END FUNCTION

FUNCTION builder.client_secret(secret: String) -> OAuth2ConfigBuilder
  IF self.credentials IS None THEN
    self.credentials <- Some(ClientCredentials {
      client_id: String::new(),
      client_secret: Some(SecretString::new(secret)),
      auth_method: ClientAuthMethod::ClientSecretBasic
    })
  ELSE
    self.credentials.as_mut().unwrap().client_secret <- Some(SecretString::new(secret))
    IF self.credentials.as_ref().unwrap().auth_method == ClientAuthMethod::None THEN
      self.credentials.as_mut().unwrap().auth_method <- ClientAuthMethod::ClientSecretBasic
    END IF
  END IF
  RETURN self
END FUNCTION

FUNCTION builder.auth_method(method: ClientAuthMethod) -> OAuth2ConfigBuilder
  IF self.credentials IS None THEN
    self.credentials <- Some(ClientCredentials {
      client_id: String::new(),
      client_secret: None,
      auth_method: method
    })
  ELSE
    self.credentials.as_mut().unwrap().auth_method <- method
  END IF
  RETURN self
END FUNCTION

FUNCTION builder.scopes(scopes: Vec<String>) -> OAuth2ConfigBuilder
  self.default_scopes <- scopes
  RETURN self
END FUNCTION

FUNCTION builder.add_scope(scope: String) -> OAuth2ConfigBuilder
  self.default_scopes.push(scope)
  RETURN self
END FUNCTION

FUNCTION builder.storage(config: TokenStorageConfig) -> OAuth2ConfigBuilder
  self.storage <- config
  RETURN self
END FUNCTION

FUNCTION builder.in_memory_storage() -> OAuth2ConfigBuilder
  self.storage <- TokenStorageConfig::InMemory
  RETURN self
END FUNCTION

FUNCTION builder.file_storage(path: PathBuf) -> OAuth2ConfigBuilder
  self.storage <- TokenStorageConfig::File { path: path }
  RETURN self
END FUNCTION

FUNCTION builder.timeout(timeout: Duration) -> OAuth2ConfigBuilder
  self.timeout <- timeout
  RETURN self
END FUNCTION

FUNCTION builder.auto_refresh(enabled: bool) -> OAuth2ConfigBuilder
  self.auto_refresh <- enabled
  RETURN self
END FUNCTION

FUNCTION builder.refresh_threshold_secs(secs: u64) -> OAuth2ConfigBuilder
  self.refresh_threshold_secs <- secs
  RETURN self
END FUNCTION

FUNCTION builder.retry_config(config: RetryConfig) -> OAuth2ConfigBuilder
  self.retry_config <- Some(config)
  RETURN self
END FUNCTION

FUNCTION builder.build() -> Result<OAuth2Config, ConfigurationError>
  // Validate required fields
  IF self.provider IS None THEN
    RETURN Error(ConfigurationError::InvalidConfiguration {
      message: "Provider configuration is required"
    })
  END IF

  IF self.credentials IS None THEN
    RETURN Error(ConfigurationError::InvalidConfiguration {
      message: "Client credentials are required"
    })
  END IF

  config <- OAuth2Config {
    provider: self.provider.unwrap(),
    credentials: self.credentials.unwrap(),
    default_scopes: self.default_scopes,
    storage: self.storage,
    timeout: self.timeout,
    retry_config: self.retry_config OR RetryConfig::default(),
    auto_refresh: self.auto_refresh,
    refresh_threshold_secs: self.refresh_threshold_secs
  }

  // Validate before returning
  validate_config(config)?

  RETURN Ok(config)
END FUNCTION
```

### 3.3 Pre-configured Providers

```
// Common OAuth2 providers with pre-configured endpoints
MODULE WellKnownProviders {

  FUNCTION google() -> ProviderConfig
    RETURN ProviderConfig {
      authorization_endpoint: Url::parse("https://accounts.google.com/o/oauth2/v2/auth").unwrap(),
      token_endpoint: Url::parse("https://oauth2.googleapis.com/token").unwrap(),
      device_authorization_endpoint: Some(Url::parse("https://oauth2.googleapis.com/device/code").unwrap()),
      introspection_endpoint: None,  // Not supported
      revocation_endpoint: Some(Url::parse("https://oauth2.googleapis.com/revoke").unwrap()),
      userinfo_endpoint: Some(Url::parse("https://openidconnect.googleapis.com/v1/userinfo").unwrap()),
      jwks_uri: Some(Url::parse("https://www.googleapis.com/oauth2/v3/certs").unwrap()),
      issuer: Some("https://accounts.google.com"),
      discovery_url: Some(Url::parse("https://accounts.google.com/.well-known/openid-configuration").unwrap())
    }
  END FUNCTION

  FUNCTION github() -> ProviderConfig
    RETURN ProviderConfig {
      authorization_endpoint: Url::parse("https://github.com/login/oauth/authorize").unwrap(),
      token_endpoint: Url::parse("https://github.com/login/oauth/access_token").unwrap(),
      device_authorization_endpoint: Some(Url::parse("https://github.com/login/device/code").unwrap()),
      introspection_endpoint: None,
      revocation_endpoint: None,  // GitHub uses DELETE on authorization
      userinfo_endpoint: Some(Url::parse("https://api.github.com/user").unwrap()),
      jwks_uri: None,
      issuer: Some("https://github.com"),
      discovery_url: None  // GitHub doesn't support OIDC discovery
    }
  END FUNCTION

  FUNCTION microsoft() -> ProviderConfig
    // Common endpoint (works for any Microsoft account)
    RETURN ProviderConfig {
      authorization_endpoint: Url::parse("https://login.microsoftonline.com/common/oauth2/v2.0/authorize").unwrap(),
      token_endpoint: Url::parse("https://login.microsoftonline.com/common/oauth2/v2.0/token").unwrap(),
      device_authorization_endpoint: Some(Url::parse("https://login.microsoftonline.com/common/oauth2/v2.0/devicecode").unwrap()),
      introspection_endpoint: None,
      revocation_endpoint: None,
      userinfo_endpoint: Some(Url::parse("https://graph.microsoft.com/oidc/userinfo").unwrap()),
      jwks_uri: Some(Url::parse("https://login.microsoftonline.com/common/discovery/v2.0/keys").unwrap()),
      issuer: Some("https://login.microsoftonline.com/common/v2.0"),
      discovery_url: Some(Url::parse("https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration").unwrap())
    }
  END FUNCTION

  FUNCTION microsoft_tenant(tenant_id: String) -> ProviderConfig
    base <- "https://login.microsoftonline.com"
    RETURN ProviderConfig {
      authorization_endpoint: Url::parse(format("{}/{}/oauth2/v2.0/authorize", base, tenant_id)).unwrap(),
      token_endpoint: Url::parse(format("{}/{}/oauth2/v2.0/token", base, tenant_id)).unwrap(),
      device_authorization_endpoint: Some(Url::parse(format("{}/{}/oauth2/v2.0/devicecode", base, tenant_id)).unwrap()),
      introspection_endpoint: None,
      revocation_endpoint: None,
      userinfo_endpoint: Some(Url::parse("https://graph.microsoft.com/oidc/userinfo").unwrap()),
      jwks_uri: Some(Url::parse(format("{}/{}/discovery/v2.0/keys", base, tenant_id)).unwrap()),
      issuer: Some(format("{}/{}/v2.0", base, tenant_id)),
      discovery_url: Some(Url::parse(format("{}/{}/.well-known/openid-configuration", base, tenant_id)).unwrap())
    }
  END FUNCTION

  FUNCTION okta(domain: String) -> ProviderConfig
    // domain should be like "dev-123456.okta.com"
    base <- format("https://{}", domain)
    RETURN ProviderConfig {
      authorization_endpoint: Url::parse(format("{}/oauth2/v1/authorize", base)).unwrap(),
      token_endpoint: Url::parse(format("{}/oauth2/v1/token", base)).unwrap(),
      device_authorization_endpoint: Some(Url::parse(format("{}/oauth2/v1/device/authorize", base)).unwrap()),
      introspection_endpoint: Some(Url::parse(format("{}/oauth2/v1/introspect", base)).unwrap()),
      revocation_endpoint: Some(Url::parse(format("{}/oauth2/v1/revoke", base)).unwrap()),
      userinfo_endpoint: Some(Url::parse(format("{}/oauth2/v1/userinfo", base)).unwrap()),
      jwks_uri: Some(Url::parse(format("{}/oauth2/v1/keys", base)).unwrap()),
      issuer: Some(base.clone()),
      discovery_url: Some(Url::parse(format("{}/.well-known/openid-configuration", base)).unwrap())
    }
  END FUNCTION

  FUNCTION auth0(domain: String) -> ProviderConfig
    // domain should be like "your-tenant.auth0.com"
    base <- format("https://{}", domain)
    RETURN ProviderConfig {
      authorization_endpoint: Url::parse(format("{}/authorize", base)).unwrap(),
      token_endpoint: Url::parse(format("{}/oauth/token", base)).unwrap(),
      device_authorization_endpoint: Some(Url::parse(format("{}/oauth/device/code", base)).unwrap()),
      introspection_endpoint: None,  // Auth0 uses /userinfo instead
      revocation_endpoint: Some(Url::parse(format("{}/oauth/revoke", base)).unwrap()),
      userinfo_endpoint: Some(Url::parse(format("{}/userinfo", base)).unwrap()),
      jwks_uri: Some(Url::parse(format("{}/.well-known/jwks.json", base)).unwrap()),
      issuer: Some(format("{}/", base)),  // Auth0 issuer has trailing slash
      discovery_url: Some(Url::parse(format("{}/.well-known/openid-configuration", base)).unwrap())
    }
  END FUNCTION
}
```

---

## 4. HTTP Transport Layer

### 4.1 Transport Interface

```
// Interface that can be mocked for testing
TRAIT HttpTransport {
  ASYNC FUNCTION send(request: HttpRequest) -> Result<HttpResponse, TransportError>
}

// Production implementation
STRUCT HttpTransportImpl {
  client: HttpClient,
  default_timeout: Duration,
  logger: Logger
}

// Mock implementation for testing
STRUCT MockHttpTransport {
  responses: Vec<MockResponse>,
  current_index: AtomicUsize,
  call_history: Mutex<Vec<HttpRequest>>
}
```

### 4.2 Transport Initialization

```
FUNCTION create_http_transport(config: HttpTransportConfig) -> HttpTransport
  // Build TLS configuration (TLS 1.2+ only, required for OAuth2)
  tls_config <- TlsConfigBuilder::new()
    .min_protocol_version(TlsVersion::TLS_1_2)
    .enable_sni(true)
    .enable_certificate_validation(true)

  // Build HTTP client
  client_builder <- HttpClientBuilder::new()
    .timeout(config.timeout)
    .connect_timeout(10s)
    .pool_idle_timeout(90s)
    .pool_max_idle_per_host(10)
    .tls_config(tls_config.build())
    .redirect(RedirectPolicy::none())  // OAuth2 redirects are handled by the browser
    .gzip(true)

  RETURN HttpTransportImpl {
    client: client_builder.build(),
    default_timeout: config.timeout,
    logger: get_logger("oauth2.transport")
  }
END FUNCTION
```

### 4.3 Request Execution

```
FUNCTION transport.send(request: HttpRequest) -> Result<HttpResponse, TransportError>
  start_time <- now()
  request_id <- generate_request_id()

  self.logger.debug("Sending HTTP request", {
    request_id,
    method: request.method,
    url: sanitize_url_for_logging(request.url)
  })

  TRY
    response <- self.client
      .execute(request)
      .timeout(request.timeout OR self.default_timeout)
      .await

    latency <- now() - start_time

    self.logger.debug("HTTP response received", {
      request_id,
      status: response.status().as_u16(),
      latency_ms: latency.as_millis()
    })

    RETURN Ok(HttpResponse {
      status: response.status(),
      headers: response.headers().clone(),
      body: response.bytes().await?
    })

  CATCH ConnectError AS e
    self.logger.error("Connection failed", {
      request_id,
      error: e.to_string()
    })

    IF e.is_dns_error() THEN
      RETURN Error(TransportError::DnsResolutionFailed {
        host: request.url.host().to_string()
      })
    END IF

    RETURN Error(TransportError::ConnectionFailed {
      message: e.to_string()
    })

  CATCH TimeoutError
    self.logger.warn("Request timeout", {
      request_id,
      timeout: request.timeout OR self.default_timeout
    })

    RETURN Error(TransportError::Timeout)

  CATCH TlsError AS e
    self.logger.error("TLS error", {
      request_id,
      error: e.to_string()
    })

    RETURN Error(TransportError::TlsError {
      message: e.to_string()
    })
  END TRY
END FUNCTION

FUNCTION sanitize_url_for_logging(url: Url) -> String
  // Remove sensitive query parameters
  CONST SENSITIVE_PARAMS = ["code", "state", "token", "client_secret", "code_verifier"]

  sanitized <- url.clone()

  IF sanitized.query() IS Some THEN
    pairs <- sanitized.query_pairs().collect::<Vec<_>>()
    sanitized.set_query(None)

    FOR EACH (key, value) IN pairs DO
      IF key IN SENSITIVE_PARAMS THEN
        sanitized.query_pairs_mut().append_pair(key, "[REDACTED]")
      ELSE
        sanitized.query_pairs_mut().append_pair(key, value)
      END IF
    END FOR
  END IF

  RETURN sanitized.to_string()
END FUNCTION
```

### 4.4 Token Endpoint Request Builder

```
FUNCTION build_token_request(
  token_endpoint: Url,
  credentials: ClientCredentials,
  grant_params: HashMap<String, String>
) -> Result<HttpRequest, OAuth2Error>

  // Build request body
  body <- HashMap::new()

  // Add grant-specific parameters
  FOR EACH (key, value) IN grant_params DO
    body.insert(key, value)
  END FOR

  // Add client authentication
  headers <- HeaderMap::new()

  MATCH credentials.auth_method
    CASE ClientAuthMethod::ClientSecretBasic:
      // RFC 6749 Section 2.3.1: client_id:client_secret in Authorization header
      credentials_string <- format("{}:{}",
        credentials.client_id,
        credentials.client_secret.unwrap().expose_secret()
      )
      encoded <- base64_encode(credentials_string)
      headers.insert("Authorization", format("Basic {}", encoded))

    CASE ClientAuthMethod::ClientSecretPost:
      // RFC 6749 Section 2.3.1: client_id and client_secret in request body
      body.insert("client_id", credentials.client_id.clone())
      body.insert("client_secret", credentials.client_secret.unwrap().expose_secret().to_string())

    CASE ClientAuthMethod::ClientSecretJwt:
      // RFC 7523: JWT assertion signed with client secret
      assertion <- generate_client_assertion_hs256(
        client_id: credentials.client_id,
        token_endpoint: token_endpoint.to_string(),
        client_secret: credentials.client_secret.unwrap()
      )?
      body.insert("client_id", credentials.client_id.clone())
      body.insert("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer")
      body.insert("client_assertion", assertion)

    CASE ClientAuthMethod::PrivateKeyJwt:
      // RFC 7523: JWT assertion signed with private key
      // Note: private_key would be stored separately from client_secret
      assertion <- generate_client_assertion_rs256(
        client_id: credentials.client_id,
        token_endpoint: token_endpoint.to_string(),
        private_key: get_private_key()?
      )?
      body.insert("client_id", credentials.client_id.clone())
      body.insert("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer")
      body.insert("client_assertion", assertion)

    CASE ClientAuthMethod::None:
      // Public client: only client_id in body
      body.insert("client_id", credentials.client_id.clone())
  END MATCH

  // Encode body as form-urlencoded
  body_string <- form_urlencoded(body)

  headers.insert("Content-Type", "application/x-www-form-urlencoded")
  headers.insert("Accept", "application/json")

  RETURN Ok(HttpRequest {
    method: POST,
    url: token_endpoint,
    headers: headers,
    body: Some(Bytes::from(body_string)),
    timeout: None
  })
END FUNCTION

FUNCTION form_urlencoded(params: HashMap<String, String>) -> String
  parts <- []
  FOR EACH (key, value) IN params DO
    encoded_key <- url_encode(key)
    encoded_value <- url_encode(value)
    parts.push(format("{}={}", encoded_key, encoded_value))
  END FOR
  RETURN parts.join("&")
END FUNCTION
```

---

## 5. OIDC Discovery

### 5.1 Discovery Client

```
STRUCT DiscoveryClient {
  transport: Arc<HttpTransport>,
  cache: RwLock<HashMap<String, CachedDiscovery>>,
  cache_ttl: Duration,
  logger: Logger
}

STRUCT CachedDiscovery {
  document: OIDCDiscoveryDocument,
  fetched_at: Instant,
  expires_at: Instant
}

FUNCTION DiscoveryClient::new(transport: Arc<HttpTransport>) -> DiscoveryClient
  RETURN DiscoveryClient {
    transport: transport,
    cache: RwLock::new(HashMap::new()),
    cache_ttl: 1.hour(),
    logger: get_logger("oauth2.discovery")
  }
END FUNCTION

ASYNC FUNCTION discovery_client.fetch(issuer: Url) -> Result<OIDCDiscoveryDocument, OAuth2Error>
  cache_key <- issuer.to_string()

  // Check cache first
  cached <- self.cache.read().get(cache_key).cloned()
  IF cached IS Some AND cached.expires_at > Instant::now() THEN
    self.logger.debug("Using cached discovery document", {
      issuer: issuer.to_string()
    })
    RETURN Ok(cached.document)
  END IF

  // Fetch fresh document
  discovery_url <- build_discovery_url(issuer)

  self.logger.info("Fetching OIDC discovery document", {
    discovery_url: discovery_url.to_string()
  })

  request <- HttpRequest {
    method: GET,
    url: discovery_url.clone(),
    headers: HeaderMap::from([
      ("Accept", "application/json")
    ]),
    body: None,
    timeout: Some(30s)
  }

  TRY
    response <- self.transport.send(request).await
  CATCH TransportError AS e
    RETURN Error(ConfigurationError::DiscoveryFailed {
      message: format("HTTP request failed: {}", e)
    })
  END TRY

  IF NOT response.status.is_success() THEN
    RETURN Error(ConfigurationError::DiscoveryFailed {
      message: format("Discovery returned status {}", response.status)
    })
  END IF

  TRY
    document <- parse_json::<OIDCDiscoveryDocument>(response.body)?
  CATCH ParseError AS e
    RETURN Error(ConfigurationError::DiscoveryFailed {
      message: format("Failed to parse discovery document: {}", e)
    })
  END TRY

  // Validate issuer matches
  IF document.issuer != issuer.to_string() AND
     document.issuer != issuer.to_string().trim_end_matches('/') THEN
    RETURN Error(ConfigurationError::DiscoveryFailed {
      message: format(
        "Issuer mismatch: expected '{}', got '{}'",
        issuer, document.issuer
      )
    })
  END IF

  // Validate document
  validate_discovery_document(document.clone())?

  // Cache the result
  now <- Instant::now()
  cached_entry <- CachedDiscovery {
    document: document.clone(),
    fetched_at: now,
    expires_at: now + self.cache_ttl
  }
  self.cache.write().insert(cache_key, cached_entry)

  RETURN Ok(document)
END FUNCTION

ASYNC FUNCTION discovery_client.fetch_jwks(jwks_uri: Url) -> Result<JwkSet, OAuth2Error>
  self.logger.debug("Fetching JWKS", {
    jwks_uri: jwks_uri.to_string()
  })

  request <- HttpRequest {
    method: GET,
    url: jwks_uri.clone(),
    headers: HeaderMap::from([
      ("Accept", "application/json")
    ]),
    body: None,
    timeout: Some(30s)
  }

  TRY
    response <- self.transport.send(request).await
  CATCH TransportError AS e
    RETURN Error(ValidationError::JwksFetchFailed {
      message: format("HTTP request failed: {}", e)
    })
  END TRY

  IF NOT response.status.is_success() THEN
    RETURN Error(ValidationError::JwksFetchFailed {
      message: format("JWKS fetch returned status {}", response.status)
    })
  END IF

  TRY
    jwks <- parse_json::<JwkSet>(response.body)?
    RETURN Ok(jwks)
  CATCH ParseError AS e
    RETURN Error(ValidationError::JwksFetchFailed {
      message: format("Failed to parse JWKS: {}", e)
    })
  END TRY
END FUNCTION
```

---

## 6. State Management

### 6.1 State Manager Interface

```
TRAIT StateManager {
  // Generate a new state value
  FUNCTION generate() -> StateToken

  // Validate a state value
  FUNCTION validate(token: String) -> Result<(), OAuth2Error>

  // Store state with metadata
  FUNCTION store(token: StateToken, metadata: StateMetadata) -> Result<(), OAuth2Error>

  // Retrieve and consume state
  FUNCTION consume(token: String) -> Result<StateMetadata, OAuth2Error>

  // Clear expired states
  FUNCTION cleanup_expired()
}

STRUCT StateToken {
  value: String,
  created_at: Instant,
  expires_at: Instant
}

STRUCT StateMetadata {
  redirect_uri: Url,
  scopes: Vec<String>,
  pkce_verifier: Option<PkceVerifier>,
  extra: HashMap<String, String>
}
```

### 6.2 State Manager Implementation

```
STRUCT StateManagerImpl {
  states: RwLock<HashMap<String, StoredState>>,
  entropy_bits: u32,
  expiration: Duration,
  logger: Logger
}

STRUCT StoredState {
  metadata: StateMetadata,
  created_at: Instant,
  expires_at: Instant
}

FUNCTION StateManagerImpl::new(entropy_bits: u32, expiration: Duration) -> StateManagerImpl
  IF entropy_bits < 128 THEN
    panic("State entropy must be at least 128 bits for security")
  END IF

  RETURN StateManagerImpl {
    states: RwLock::new(HashMap::new()),
    entropy_bits: entropy_bits,
    expiration: expiration,
    logger: get_logger("oauth2.state")
  }
END FUNCTION

FUNCTION state_manager.generate() -> StateToken
  // Generate cryptographically secure random bytes
  byte_count <- (self.entropy_bits + 7) / 8
  random_bytes <- secure_random_bytes(byte_count)

  // Encode as URL-safe base64
  value <- base64_url_encode_no_padding(random_bytes)

  now <- Instant::now()

  RETURN StateToken {
    value: value,
    created_at: now,
    expires_at: now + self.expiration
  }
END FUNCTION

FUNCTION state_manager.validate(token: String) -> Result<(), OAuth2Error>
  // Check format
  IF token.len() < 22 THEN  // 128 bits = 22 base64 chars minimum
    RETURN Error(AuthorizationError::StateMismatch {
      expected: "[valid state]",
      received: "[too short]"
    })
  END IF

  // Check if characters are valid base64url
  IF NOT is_valid_base64url(token) THEN
    RETURN Error(AuthorizationError::StateMismatch {
      expected: "[valid state]",
      received: "[invalid characters]"
    })
  END IF

  RETURN Ok(())
END FUNCTION

FUNCTION state_manager.store(token: StateToken, metadata: StateMetadata) -> Result<(), OAuth2Error>
  self.logger.debug("Storing state", {
    state: truncate(token.value, 8) + "...",
    expires_in_secs: (token.expires_at - Instant::now()).as_secs()
  })

  stored <- StoredState {
    metadata: metadata,
    created_at: token.created_at,
    expires_at: token.expires_at
  }

  self.states.write().insert(token.value, stored)

  RETURN Ok(())
END FUNCTION

FUNCTION state_manager.consume(token: String) -> Result<StateMetadata, OAuth2Error>
  self.logger.debug("Consuming state", {
    state: truncate(token, 8) + "..."
  })

  // Remove and return the state atomically
  stored <- self.states.write().remove(token)

  IF stored IS None THEN
    self.logger.warn("State not found - possible CSRF attack", {
      state: truncate(token, 8) + "..."
    })
    RETURN Error(AuthorizationError::StateMismatch {
      expected: "[stored state]",
      received: token
    })
  END IF

  stored <- stored.unwrap()

  // Check expiration
  IF stored.expires_at < Instant::now() THEN
    self.logger.warn("State expired", {
      state: truncate(token, 8) + "...",
      expired_secs_ago: (Instant::now() - stored.expires_at).as_secs()
    })
    RETURN Error(AuthorizationError::StateMismatch {
      expected: "[valid state]",
      received: "[expired state]"
    })
  END IF

  RETURN Ok(stored.metadata)
END FUNCTION

FUNCTION state_manager.cleanup_expired()
  now <- Instant::now()
  removed_count <- 0

  states <- self.states.write()
  states.retain(|_, stored| {
    IF stored.expires_at < now THEN
      removed_count <- removed_count + 1
      RETURN false
    END IF
    RETURN true
  })

  IF removed_count > 0 THEN
    self.logger.debug("Cleaned up expired states", {
      count: removed_count
    })
  END IF
END FUNCTION

// Constant-time comparison for state validation
FUNCTION constant_time_compare(a: String, b: String) -> bool
  IF a.len() != b.len() THEN
    RETURN false
  END IF

  result <- 0u8
  FOR i IN 0..a.len() DO
    result <- result | (a.as_bytes()[i] ^ b.as_bytes()[i])
  END FOR

  RETURN result == 0
END FUNCTION
```

---

## 7. PKCE Generation

### 7.1 PKCE Generator Interface

```
TRAIT PkceGenerator {
  // Generate a new PKCE verifier
  FUNCTION generate_verifier() -> PkceVerifier

  // Generate challenge from verifier
  FUNCTION challenge(verifier: PkceVerifier, method: PkceMethod) -> String
}

STRUCT PkceVerifier {
  value: SecretString
}

ENUM PkceMethod {
  S256,  // SHA-256 (recommended)
  Plain  // Plain text (not recommended)
}
```

### 7.2 PKCE Generator Implementation

```
STRUCT PkceGeneratorImpl {
  verifier_length: usize,
  default_method: PkceMethod,
  logger: Logger
}

// RFC 7636 character set: A-Z, a-z, 0-9, -, ., _, ~
CONST PKCE_CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"

FUNCTION PkceGeneratorImpl::new(verifier_length: usize, default_method: PkceMethod) -> PkceGeneratorImpl
  // RFC 7636 Section 4.1: verifier must be 43-128 characters
  IF verifier_length < 43 THEN
    panic("PKCE verifier length must be at least 43 characters")
  END IF
  IF verifier_length > 128 THEN
    panic("PKCE verifier length cannot exceed 128 characters")
  END IF

  RETURN PkceGeneratorImpl {
    verifier_length: verifier_length,
    default_method: default_method,
    logger: get_logger("oauth2.pkce")
  }
END FUNCTION

FUNCTION pkce_generator.generate_verifier() -> PkceVerifier
  // Generate cryptographically secure random bytes
  random_bytes <- secure_random_bytes(self.verifier_length)

  // Map bytes to PKCE character set
  verifier_chars <- []
  FOR byte IN random_bytes DO
    index <- byte % PKCE_CHARSET.len()
    verifier_chars.push(PKCE_CHARSET[index] as char)
  END FOR

  verifier <- String::from_iter(verifier_chars)

  self.logger.debug("Generated PKCE verifier", {
    length: verifier.len()
  })

  RETURN PkceVerifier {
    value: SecretString::new(verifier)
  }
END FUNCTION

FUNCTION pkce_generator.challenge(verifier: PkceVerifier, method: PkceMethod) -> String
  MATCH method
    CASE PkceMethod::S256:
      // RFC 7636 Section 4.2: BASE64URL(SHA256(code_verifier))
      hash <- sha256(verifier.value.expose_secret().as_bytes())
      challenge <- base64_url_encode_no_padding(hash)
      RETURN challenge

    CASE PkceMethod::Plain:
      // RFC 7636 Section 4.2: code_challenge = code_verifier
      self.logger.warn("Using plain PKCE method - S256 is recommended")
      RETURN verifier.value.expose_secret().to_string()
  END MATCH
END FUNCTION

// PkceVerifier methods
IMPL PkceVerifier {
  FUNCTION new() -> PkceVerifier
    generator <- PkceGeneratorImpl::new(64, PkceMethod::S256)
    RETURN generator.generate_verifier()
  END FUNCTION

  FUNCTION secret(&self) -> &str
    RETURN self.value.expose_secret()
  END FUNCTION

  FUNCTION challenge(&self, method: PkceMethod) -> String
    MATCH method
      CASE PkceMethod::S256:
        hash <- sha256(self.value.expose_secret().as_bytes())
        RETURN base64_url_encode_no_padding(hash)

      CASE PkceMethod::Plain:
        RETURN self.value.expose_secret().to_string()
    END MATCH
  END FUNCTION

  FUNCTION challenge_s256(&self) -> String
    RETURN self.challenge(PkceMethod::S256)
  END FUNCTION
}

// Secure implementations (use crypto library)
FUNCTION sha256(data: &[u8]) -> [u8; 32]
  // Use ring, sha2, or openssl crate
  hasher <- Sha256::new()
  hasher.update(data)
  RETURN hasher.finalize().into()
END FUNCTION

FUNCTION base64_url_encode_no_padding(data: &[u8]) -> String
  // RFC 4648 Section 5: Base64url encoding without padding
  RETURN base64::encode_config(data, base64::URL_SAFE_NO_PAD)
END FUNCTION

FUNCTION secure_random_bytes(count: usize) -> Vec<u8>
  // Use ring, rand, or getrandom crate
  bytes <- vec![0u8; count]
  getrandom::getrandom(&mut bytes).expect("Failed to generate random bytes")
  RETURN bytes
END FUNCTION
```

### 7.3 PKCE Validation

```
FUNCTION validate_pkce_verifier(verifier: String) -> Result<(), OAuth2Error>
  // RFC 7636 Section 4.1: Length requirements
  IF verifier.len() < 43 THEN
    RETURN Error(ValidationError::InvalidPkce {
      message: "Code verifier must be at least 43 characters"
    })
  END IF

  IF verifier.len() > 128 THEN
    RETURN Error(ValidationError::InvalidPkce {
      message: "Code verifier cannot exceed 128 characters"
    })
  END IF

  // RFC 7636 Section 4.1: Character set validation
  FOR char IN verifier.chars() DO
    valid <- (char >= 'A' AND char <= 'Z') OR
             (char >= 'a' AND char <= 'z') OR
             (char >= '0' AND char <= '9') OR
             char == '-' OR char == '.' OR char == '_' OR char == '~'

    IF NOT valid THEN
      RETURN Error(ValidationError::InvalidPkce {
        message: format("Invalid character in code verifier: '{}'", char)
      })
    END IF
  END FOR

  RETURN Ok(())
END FUNCTION

FUNCTION validate_pkce_challenge_method(method: String) -> Result<PkceMethod, OAuth2Error>
  MATCH method.to_uppercase().as_str()
    CASE "S256":
      RETURN Ok(PkceMethod::S256)
    CASE "PLAIN":
      RETURN Ok(PkceMethod::Plain)
    CASE _:
      RETURN Error(ValidationError::InvalidPkce {
        message: format("Unsupported code challenge method: '{}'", method)
      })
  END MATCH
END FUNCTION
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial pseudocode (Part 1) |

---

**Continued in Part 2: Authorization Flows**
