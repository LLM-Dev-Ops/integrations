# Anthropic Integration Module - Pseudocode (Part 1)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/anthropic`
**File:** 1 of 4 - Core Infrastructure

---

## Table of Contents (Part 1)

1. [Overview](#1-overview)
2. [Client Initialization](#2-client-initialization)
3. [Configuration Management](#3-configuration-management)
4. [HTTP Transport Layer](#4-http-transport-layer)
5. [Request Builder](#5-request-builder)
6. [Response Parser](#6-response-parser)
7. [Authentication Manager](#7-authentication-manager)

---

## 1. Overview

This document provides pseudocode algorithms for the core infrastructure components of the Anthropic Integration Module. The pseudocode is language-agnostic but maps directly to Rust and TypeScript implementations.

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
1. **Production implementations** - Real HTTP clients, actual API calls
2. **Test doubles (mocks)** - Controlled responses for unit testing
3. **Dependency injection** - Composable, testable architecture

```
// Test Example Pattern
MOCK MessagesService {
  create: returns predefined Message
  create_stream: returns predefined MessageStream
  count_tokens: returns predefined TokenCount
}

// Inject mock into client for isolated testing
test_client <- AnthropicClientImpl::with_mock_services(mock_services)
```

---

## 2. Client Initialization

### 2.1 Client Factory

```
FUNCTION create_anthropic_client(config: AnthropicConfig) -> Result<AnthropicClient, AnthropicError>
  // Step 1: Validate configuration
  validation_result <- validate_config(config)
  IF validation_result IS Error THEN
    RETURN Error(ConfigurationError::InvalidConfiguration(validation_result.message))
  END IF

  // Step 2: Initialize dependencies from Integration Repo primitives
  logger <- get_logger_from_primitive("anthropic")
  tracer <- get_tracer_from_primitive("anthropic")

  // Step 3: Build retry executor from integrations-retry primitive
  retry_config <- RetryConfig {
    max_retries: config.max_retries,
    initial_backoff: 1000ms,
    max_backoff: 60s,
    backoff_multiplier: 2.0,
    jitter: 0.1,
    retryable_errors: [RateLimitError, NetworkTimeout, ServerOverloaded]
  }
  retry_executor <- create_retry_executor(retry_config)

  // Step 4: Build rate limiter from integrations-rate-limit primitive
  rate_limiter <- IF config.rate_limit_config IS Some THEN
    create_rate_limiter(config.rate_limit_config)
  ELSE
    create_rate_limiter(RateLimitConfig {
      requests_per_minute: None,  // Use API limits
      tokens_per_minute: None,
      max_concurrent_requests: 100,
      auto_adjust: true
    })
  END IF

  // Step 5: Build circuit breaker from integrations-circuit-breaker primitive
  circuit_breaker <- create_circuit_breaker(CircuitBreakerConfig {
    failure_threshold: config.circuit_breaker_config.failure_threshold OR 5,
    success_threshold: config.circuit_breaker_config.success_threshold OR 3,
    failure_window: 60s,
    reset_timeout: config.circuit_breaker_config.reset_timeout OR 30s
  })

  // Step 6: Build HTTP transport
  transport <- create_http_transport(HttpTransportConfig {
    timeout: config.timeout,
    tls_config: TlsConfig {
      min_version: TlsVersion::TLS_1_2,
      verify_certificates: true
    },
    proxy: None,
    connection_pool_size: 20
  })

  // Step 7: Build authentication manager
  auth_manager <- create_auth_manager(
    api_key: config.api_key,
    api_version: config.api_version,
    beta_features: config.beta_features
  )

  // Step 8: Assemble client with lazy service initialization
  client <- AnthropicClientImpl {
    config: config,
    transport: transport,
    auth_manager: auth_manager,
    retry_executor: retry_executor,
    rate_limiter: rate_limiter,
    circuit_breaker: circuit_breaker,
    logger: logger,
    tracer: tracer,

    // Lazy-initialized services (London-School: inject mocks for testing)
    messages_service: None,
    models_service: None,
    batches_service: None,
    admin_service: None
  }

  logger.info("Anthropic client initialized", {
    base_url: config.base_url,
    api_version: config.api_version,
    beta_features: config.beta_features.len()
  })

  RETURN Ok(client)
END FUNCTION
```

### 2.2 Client from Environment

```
FUNCTION create_anthropic_client_from_env() -> Result<AnthropicClient, AnthropicError>
  // Step 1: Read required API key
  api_key <- read_env("ANTHROPIC_API_KEY")
  IF api_key IS None THEN
    RETURN Error(ConfigurationError::MissingApiKey)
  END IF

  // Step 2: Read optional configuration
  base_url <- read_env("ANTHROPIC_BASE_URL")
  api_version <- read_env("ANTHROPIC_API_VERSION")
  timeout_str <- read_env("ANTHROPIC_TIMEOUT")
  max_retries_str <- read_env("ANTHROPIC_MAX_RETRIES")

  // Step 3: Parse optional values with defaults
  timeout <- IF timeout_str IS Some THEN
    parse_duration(timeout_str) OR DEFAULT_TIMEOUT
  ELSE
    DEFAULT_TIMEOUT  // 600s for long responses
  END IF

  max_retries <- IF max_retries_str IS Some THEN
    parse_u32(max_retries_str) OR DEFAULT_MAX_RETRIES
  ELSE
    DEFAULT_MAX_RETRIES  // 3
  END IF

  // Step 4: Build config
  config <- AnthropicConfig {
    api_key: SecretString::new(api_key),
    base_url: base_url OR "https://api.anthropic.com",
    api_version: api_version OR "2023-06-01",
    timeout: timeout,
    max_retries: max_retries,
    retry_config: RetryConfig::default(),
    circuit_breaker_config: CircuitBreakerConfig::default(),
    rate_limit_config: None,
    beta_features: Vec::new()
  }

  RETURN create_anthropic_client(config)
END FUNCTION
```

### 2.3 Service Accessor Pattern (Dependency Injection Point)

```
// London-School TDD: Services are interfaces that can be mocked
FUNCTION client.messages() -> &MessagesService
  // Lazy initialization with double-checked locking
  IF self.messages_service IS None THEN
    LOCK self.service_mutex
      IF self.messages_service IS None THEN
        self.messages_service <- Some(MessagesServiceImpl::new(
          transport: self.transport.clone(),
          auth_manager: self.auth_manager.clone(),
          retry_executor: self.retry_executor.clone(),
          rate_limiter: self.rate_limiter.clone(),
          circuit_breaker: self.circuit_breaker.clone(),
          base_url: self.config.base_url.clone(),
          logger: self.logger.clone(),
          tracer: self.tracer.clone()
        ))
      END IF
    END LOCK
  END IF

  RETURN self.messages_service.as_ref().unwrap()
END FUNCTION

FUNCTION client.models() -> &ModelsService
  // Same lazy initialization pattern
  IF self.models_service IS None THEN
    LOCK self.service_mutex
      IF self.models_service IS None THEN
        self.models_service <- Some(ModelsServiceImpl::new(
          transport: self.transport.clone(),
          auth_manager: self.auth_manager.clone(),
          retry_executor: self.retry_executor.clone(),
          rate_limiter: self.rate_limiter.clone(),
          circuit_breaker: self.circuit_breaker.clone(),
          base_url: self.config.base_url.clone(),
          logger: self.logger.clone(),
          tracer: self.tracer.clone()
        ))
      END IF
    END LOCK
  END IF

  RETURN self.models_service.as_ref().unwrap()
END FUNCTION

FUNCTION client.batches() -> &MessageBatchesService
  // Same lazy initialization pattern
  IF self.batches_service IS None THEN
    LOCK self.service_mutex
      IF self.batches_service IS None THEN
        self.batches_service <- Some(MessageBatchesServiceImpl::new(
          transport: self.transport.clone(),
          auth_manager: self.auth_manager.clone(),
          retry_executor: self.retry_executor.clone(),
          rate_limiter: self.rate_limiter.clone(),
          circuit_breaker: self.circuit_breaker.clone(),
          base_url: self.config.base_url.clone(),
          logger: self.logger.clone(),
          tracer: self.tracer.clone()
        ))
      END IF
    END LOCK
  END IF

  RETURN self.batches_service.as_ref().unwrap()
END FUNCTION

FUNCTION client.admin() -> Option<&AdminService>
  // Admin service only available if API key has admin permissions
  // This is detected at runtime based on API responses
  IF self.admin_service IS None THEN
    // Admin service is optional - return None if not initialized
    RETURN None
  END IF

  RETURN Some(self.admin_service.as_ref().unwrap())
END FUNCTION
```

### 2.4 Client with Mock Services (Testing Support)

```
// London-School TDD: Factory for creating test clients with mocked services
FUNCTION create_test_client(mock_config: MockConfig) -> AnthropicClient
  RETURN AnthropicClientImpl {
    config: AnthropicConfig::default(),
    transport: mock_config.transport OR MockHttpTransport::new(),
    auth_manager: MockAuthManager::new(),
    retry_executor: MockRetryExecutor::new(),
    rate_limiter: MockRateLimiter::new(),
    circuit_breaker: MockCircuitBreaker::new(),
    logger: MockLogger::new(),
    tracer: MockTracer::new(),

    // Pre-inject mock services
    messages_service: mock_config.messages_service,
    models_service: mock_config.models_service,
    batches_service: mock_config.batches_service,
    admin_service: mock_config.admin_service
  }
END FUNCTION

// Mock configuration builder for fluent test setup
STRUCT MockConfig {
  transport: Option<MockHttpTransport>,
  messages_service: Option<MockMessagesService>,
  models_service: Option<MockModelsService>,
  batches_service: Option<MockBatchesService>,
  admin_service: Option<MockAdminService>
}

FUNCTION MockConfig::new() -> MockConfig
  RETURN MockConfig {
    transport: None,
    messages_service: None,
    models_service: None,
    batches_service: None,
    admin_service: None
  }
END FUNCTION

FUNCTION MockConfig.with_messages_service(service: MockMessagesService) -> MockConfig
  self.messages_service <- Some(service)
  RETURN self
END FUNCTION
```

---

## 3. Configuration Management

### 3.1 Configuration Validation

```
FUNCTION validate_config(config: AnthropicConfig) -> Result<(), ValidationError>
  errors <- []

  // Validate API key (required)
  IF config.api_key.expose_secret().is_empty() THEN
    errors.push("API key is required")
  ELSE IF NOT config.api_key.expose_secret().starts_with("sk-ant-") THEN
    // Warning only - custom deployments may use different formats
    log_warning("API key does not match expected format (sk-ant-*)")
  END IF

  // Validate base URL
  TRY
    parsed_url <- parse_url(config.base_url)
    IF parsed_url.scheme NOT IN ["https"] THEN
      // Only allow HTTP in development
      IF is_production_environment() THEN
        errors.push("Base URL must use HTTPS in production")
      ELSE
        log_warning("Using HTTP in non-production environment")
      END IF
    END IF
  CATCH ParseError
    errors.push("Invalid base URL format")
  END TRY

  // Validate API version format
  IF NOT is_valid_api_version(config.api_version) THEN
    errors.push("API version must be in YYYY-MM-DD format")
  END IF

  // Validate timeout
  IF config.timeout < 1s THEN
    errors.push("Timeout must be at least 1 second")
  ELSE IF config.timeout > 3600s THEN
    errors.push("Timeout cannot exceed 3600 seconds (1 hour)")
  END IF

  // Validate max retries
  IF config.max_retries > 10 THEN
    errors.push("Max retries cannot exceed 10")
  END IF

  // Validate beta features
  FOR EACH feature IN config.beta_features DO
    IF NOT is_valid_beta_feature(feature) THEN
      errors.push(format("Unknown beta feature: {}", feature))
    END IF
  END FOR

  // Return result
  IF errors.is_empty() THEN
    RETURN Ok(())
  ELSE
    RETURN Error(ValidationError { messages: errors })
  END IF
END FUNCTION

FUNCTION is_valid_api_version(version: String) -> bool
  // Format: YYYY-MM-DD
  TRY
    date <- parse_date(version, "YYYY-MM-DD")
    // Check reasonable date range (2023-01-01 to future)
    RETURN date >= Date(2023, 1, 1) AND date <= Date::now() + 365.days()
  CATCH
    RETURN false
  END TRY
END FUNCTION

FUNCTION is_valid_beta_feature(feature: BetaFeature) -> bool
  CONST KNOWN_BETA_FEATURES = [
    BetaFeature::ExtendedThinking,
    BetaFeature::PdfSupport,
    BetaFeature::PromptCaching,
    BetaFeature::TokenCounting,
    BetaFeature::MessageBatches,
    BetaFeature::ComputerUse
  ]

  MATCH feature
    CASE BetaFeature::Custom(name):
      // Custom features are allowed but logged
      log_info("Using custom beta feature", { name })
      RETURN true
    CASE _:
      RETURN feature IN KNOWN_BETA_FEATURES
  END MATCH
END FUNCTION
```

### 3.2 Configuration Builder Pattern

```
STRUCT AnthropicConfigBuilder {
  api_key: Option<SecretString>,
  base_url: Option<String>,
  api_version: Option<String>,
  timeout: Option<Duration>,
  max_retries: Option<u32>,
  retry_config: Option<RetryConfig>,
  circuit_breaker_config: Option<CircuitBreakerConfig>,
  rate_limit_config: Option<RateLimitConfig>,
  beta_features: Vec<BetaFeature>
}

FUNCTION AnthropicConfigBuilder::new() -> AnthropicConfigBuilder
  RETURN AnthropicConfigBuilder {
    api_key: None,
    base_url: None,
    api_version: None,
    timeout: None,
    max_retries: None,
    retry_config: None,
    circuit_breaker_config: None,
    rate_limit_config: None,
    beta_features: Vec::new()
  }
END FUNCTION

FUNCTION builder.api_key(key: String) -> AnthropicConfigBuilder
  self.api_key <- Some(SecretString::new(key))
  RETURN self
END FUNCTION

FUNCTION builder.base_url(url: String) -> AnthropicConfigBuilder
  self.base_url <- Some(url)
  RETURN self
END FUNCTION

FUNCTION builder.api_version(version: String) -> AnthropicConfigBuilder
  self.api_version <- Some(version)
  RETURN self
END FUNCTION

FUNCTION builder.timeout(timeout: Duration) -> AnthropicConfigBuilder
  self.timeout <- Some(timeout)
  RETURN self
END FUNCTION

FUNCTION builder.max_retries(retries: u32) -> AnthropicConfigBuilder
  self.max_retries <- Some(retries)
  RETURN self
END FUNCTION

FUNCTION builder.retry_config(config: RetryConfig) -> AnthropicConfigBuilder
  self.retry_config <- Some(config)
  RETURN self
END FUNCTION

FUNCTION builder.circuit_breaker_config(config: CircuitBreakerConfig) -> AnthropicConfigBuilder
  self.circuit_breaker_config <- Some(config)
  RETURN self
END FUNCTION

FUNCTION builder.rate_limit_config(config: RateLimitConfig) -> AnthropicConfigBuilder
  self.rate_limit_config <- Some(config)
  RETURN self
END FUNCTION

FUNCTION builder.enable_beta(feature: BetaFeature) -> AnthropicConfigBuilder
  IF feature NOT IN self.beta_features THEN
    self.beta_features.push(feature)
  END IF
  RETURN self
END FUNCTION

FUNCTION builder.build() -> Result<AnthropicConfig, ConfigurationError>
  // API key is required
  IF self.api_key IS None THEN
    RETURN Error(ConfigurationError::MissingApiKey)
  END IF

  config <- AnthropicConfig {
    api_key: self.api_key.unwrap(),
    base_url: Url::parse(self.base_url OR DEFAULT_BASE_URL)?,
    api_version: self.api_version OR DEFAULT_API_VERSION,
    timeout: self.timeout OR DEFAULT_TIMEOUT,
    max_retries: self.max_retries OR DEFAULT_MAX_RETRIES,
    retry_config: self.retry_config OR RetryConfig::default(),
    circuit_breaker_config: self.circuit_breaker_config OR CircuitBreakerConfig::default(),
    rate_limit_config: self.rate_limit_config,
    beta_features: self.beta_features
  }

  // Validate before returning
  validate_config(config)?

  RETURN Ok(config)
END FUNCTION
```

### 3.3 Default Constants

```
CONST DEFAULT_BASE_URL = "https://api.anthropic.com"
CONST DEFAULT_API_VERSION = "2023-06-01"
CONST DEFAULT_TIMEOUT = Duration::from_secs(600)  // 10 minutes
CONST DEFAULT_MAX_RETRIES = 3
CONST DEFAULT_CONNECT_TIMEOUT = Duration::from_secs(10)
CONST DEFAULT_CONNECTION_POOL_SIZE = 20
```

---

## 4. HTTP Transport Layer

### 4.1 Transport Interface (London-School TDD Contract)

```
// Interface that can be mocked for testing
TRAIT HttpTransport {
  // Send a standard HTTP request
  ASYNC FUNCTION send(request: HttpRequest) -> Result<HttpResponse, TransportError>

  // Send a streaming request and receive an SSE stream
  ASYNC FUNCTION send_streaming(request: HttpRequest) -> Result<SseStream, TransportError>
}

// Production implementation
STRUCT HttpTransportImpl {
  client: HttpClient,
  default_timeout: Duration,
  connection_pool: ConnectionPool,
  logger: Logger
}

// Mock implementation for testing
STRUCT MockHttpTransport {
  responses: Vec<MockResponse>,
  current_index: AtomicUsize,
  call_history: Vec<HttpRequest>
}
```

### 4.2 Transport Initialization

```
FUNCTION create_http_transport(config: HttpTransportConfig) -> HttpTransport
  // Build TLS configuration (TLS 1.2+ only)
  tls_config <- TlsConfigBuilder::new()
    .min_protocol_version(TlsVersion::TLS_1_2)
    .enable_sni(true)
    .enable_certificate_validation(true)

  IF config.tls_config.custom_ca_certs IS Some THEN
    FOR EACH cert IN config.tls_config.custom_ca_certs DO
      tls_config.add_root_certificate(cert)
    END FOR
  END IF

  // Never allow disabling certificate validation in production
  IF NOT config.tls_config.verify_certificates THEN
    IF is_production_environment() THEN
      PANIC("Certificate verification cannot be disabled in production")
    END IF
    log_warning("Certificate verification disabled - DEVELOPMENT ONLY")
    tls_config.danger_accept_invalid_certs(true)
  END IF

  // Build HTTP client
  client_builder <- HttpClientBuilder::new()
    .timeout(config.timeout)
    .connect_timeout(config.connect_timeout OR DEFAULT_CONNECT_TIMEOUT)
    .pool_idle_timeout(90s)
    .pool_max_idle_per_host(config.connection_pool_size OR DEFAULT_CONNECTION_POOL_SIZE)
    .tls_config(tls_config.build())
    .user_agent(format("anthropic-integration/{}", VERSION))

  IF config.proxy IS Some THEN
    client_builder.proxy(config.proxy)
  END IF

  // Initialize connection pool
  connection_pool <- ConnectionPool::new(
    max_connections: config.connection_pool_size OR DEFAULT_CONNECTION_POOL_SIZE,
    idle_timeout: 90s
  )

  RETURN HttpTransportImpl {
    client: client_builder.build(),
    default_timeout: config.timeout,
    connection_pool: connection_pool,
    logger: get_logger("anthropic.transport")
  }
END FUNCTION
```

### 4.3 Request Execution

```
FUNCTION transport.send(request: HttpRequest) -> Result<HttpResponse, TransportError>
  // Start timing
  start_time <- now()
  request_id <- generate_request_id()

  self.logger.debug("Sending HTTP request", {
    request_id,
    method: request.method,
    url: request.url.to_string(),
    timeout: request.timeout OR self.default_timeout
  })

  TRY
    // Execute HTTP request with timeout
    response <- self.client
      .execute(request)
      .timeout(request.timeout OR self.default_timeout)
      .await

    // Record latency
    latency <- now() - start_time

    self.logger.debug("HTTP response received", {
      request_id,
      status: response.status().as_u16(),
      latency_ms: latency.as_millis()
    })

    RETURN Ok(HttpResponse {
      status: response.status(),
      headers: response.headers().clone(),
      body: response.bytes().await?,
      latency: latency
    })

  CATCH ConnectError AS e
    latency <- now() - start_time
    self.logger.error("Connection failed", {
      request_id,
      error: e.to_string(),
      latency_ms: latency.as_millis()
    })

    IF e.is_dns_error() THEN
      RETURN Error(TransportError::DnsResolutionFailed {
        host: request.url.host().to_string(),
        message: e.to_string()
      })
    END IF

    RETURN Error(TransportError::ConnectionFailed {
      message: e.to_string()
    })

  CATCH TimeoutError
    latency <- now() - start_time
    self.logger.warn("Request timeout", {
      request_id,
      timeout: request.timeout OR self.default_timeout,
      latency_ms: latency.as_millis()
    })

    RETURN Error(TransportError::Timeout {
      duration: request.timeout OR self.default_timeout
    })

  CATCH TlsError AS e
    self.logger.error("TLS error", {
      request_id,
      error: e.to_string()
    })

    RETURN Error(TransportError::TlsError {
      message: e.to_string()
    })

  CATCH IoError AS e
    self.logger.error("I/O error", {
      request_id,
      error: e.to_string()
    })

    RETURN Error(TransportError::ConnectionFailed {
      message: e.to_string()
    })
  END TRY
END FUNCTION
```

### 4.4 Streaming Request Execution

```
FUNCTION transport.send_streaming(request: HttpRequest) -> Result<SseStream, TransportError>
  start_time <- now()
  request_id <- generate_request_id()

  self.logger.debug("Sending streaming HTTP request", {
    request_id,
    method: request.method,
    url: request.url.to_string()
  })

  TRY
    // Execute request without consuming body
    response <- self.client
      .execute(request)
      .await

    // Check status before creating stream
    IF NOT response.status().is_success() THEN
      // Read error body
      body <- response.bytes().await?
      RETURN Error(TransportError::HttpError {
        status: response.status(),
        body: body
      })
    END IF

    // Verify SSE content type
    content_type <- response.headers().get("Content-Type")
    IF content_type IS None OR NOT content_type.contains("text/event-stream") THEN
      self.logger.warn("Unexpected content type for streaming", {
        request_id,
        content_type: content_type
      })
      // Continue anyway - server may not set header correctly
    END IF

    self.logger.debug("Streaming response started", {
      request_id,
      status: response.status().as_u16()
    })

    // Create SSE stream wrapper
    stream <- SseStream::new(
      response_body: response.bytes_stream(),
      request_id: request_id,
      logger: self.logger.clone()
    )

    RETURN Ok(stream)

  CATCH error
    // Same error handling as non-streaming
    latency <- now() - start_time
    self.logger.error("Streaming request failed", {
      request_id,
      error: error.to_string(),
      latency_ms: latency.as_millis()
    })

    RETURN Error(map_transport_error(error))
  END TRY
END FUNCTION
```

---

## 5. Request Builder

### 5.1 Base Request Building

```
FUNCTION build_request(
  method: HttpMethod,
  endpoint: String,
  base_url: Url,
  auth_manager: AuthManager,
  body: Option<RequestBody>,
  extra_headers: HeaderMap
) -> Result<HttpRequest, RequestError>

  // Step 1: Build URL (ensure endpoint starts with /)
  normalized_endpoint <- IF endpoint.starts_with("/") THEN
    endpoint
  ELSE
    "/" + endpoint
  END IF

  url <- base_url.join(normalized_endpoint)?

  // Step 2: Create request builder
  request_builder <- HttpRequest::builder()
    .method(method)
    .url(url)

  // Step 3: Add authentication headers (includes API key, version, beta features)
  auth_headers <- auth_manager.get_headers()
  FOR EACH (key, value) IN auth_headers DO
    request_builder.header(key, value)
  END FOR

  // Step 4: Add standard headers
  request_builder.header("Content-Type", "application/json")
  request_builder.header("Accept", "application/json")

  // Step 5: Add extra headers (can override defaults)
  FOR EACH (key, value) IN extra_headers DO
    request_builder.header(key, value)
  END FOR

  // Step 6: Add body if present
  IF body IS Some THEN
    serialized <- serialize_json(body.data)?
    request_builder.body(serialized)
  END IF

  // Step 7: Build and return
  RETURN Ok(request_builder.build())
END FUNCTION
```

### 5.2 Streaming Request Building

```
FUNCTION build_streaming_request(
  endpoint: String,
  base_url: Url,
  auth_manager: AuthManager,
  body: RequestBody
) -> Result<HttpRequest, RequestError>

  // Ensure stream flag is set in body
  body_with_stream <- body.clone()
  body_with_stream.set("stream", true)

  // Build standard request
  request <- build_request(
    method: POST,
    endpoint: endpoint,
    base_url: base_url,
    auth_manager: auth_manager,
    body: Some(body_with_stream),
    extra_headers: HeaderMap::new()
  )?

  // Add streaming-specific headers
  request.headers_mut().insert("Accept", "text/event-stream")
  request.headers_mut().insert("Cache-Control", "no-cache")
  request.headers_mut().insert("Connection", "keep-alive")

  RETURN Ok(request)
END FUNCTION
```

### 5.3 Request Body Serialization

```
FUNCTION serialize_request_body<T: Serialize>(body: T) -> Result<Bytes, RequestError>
  TRY
    json_string <- serialize_json(body)

    // Log body size for debugging (not content)
    log_debug("Request body serialized", {
      size_bytes: json_string.len()
    })

    // Check size limits
    IF json_string.len() > MAX_REQUEST_BODY_SIZE THEN
      RETURN Error(RequestError::PayloadTooLarge {
        size: json_string.len(),
        max_size: MAX_REQUEST_BODY_SIZE
      })
    END IF

    RETURN Ok(Bytes::from(json_string))

  CATCH SerializationError AS e
    RETURN Error(RequestError::SerializationError {
      message: e.to_string()
    })
  END TRY
END FUNCTION

CONST MAX_REQUEST_BODY_SIZE = 32 * 1024 * 1024  // 32 MB (Anthropic batch limit)
```

---

## 6. Response Parser

### 6.1 JSON Response Parsing

```
FUNCTION parse_response<T: Deserialize>(
  response: HttpResponse,
  logger: Logger
) -> Result<T, ResponseError>

  // Step 1: Check content type
  content_type <- response.headers.get("Content-Type")
  IF content_type IS None OR NOT content_type.contains("application/json") THEN
    logger.warn("Unexpected content type", {
      content_type: content_type,
      status: response.status.as_u16()
    })
    // Continue anyway - response may still be valid JSON
  END IF

  // Step 2: Get body bytes
  body_bytes <- response.body

  // Step 3: Check for empty body
  IF body_bytes.is_empty() THEN
    RETURN Error(ResponseError::EmptyResponse)
  END IF

  // Step 4: Attempt deserialization
  TRY
    parsed <- deserialize_json::<T>(body_bytes)?
    RETURN Ok(parsed)

  CATCH DeserializeError AS e
    // Try to extract error details from raw JSON
    TRY
      error_response <- deserialize_json::<AnthropicErrorResponse>(body_bytes)?
      RETURN Error(ResponseError::ApiError {
        error_type: error_response.error.type,
        message: error_response.error.message
      })
    CATCH
      // Could not parse as error either
      logger.error("Failed to parse response", {
        error: e.to_string(),
        body_preview: truncate(utf8_lossy(body_bytes), 500)
      })

      RETURN Error(ResponseError::DeserializationError {
        message: e.to_string(),
        body_preview: truncate(utf8_lossy(body_bytes), 200)
      })
    END TRY
  END TRY
END FUNCTION
```

### 6.2 Error Response Parsing

```
FUNCTION parse_error_response(
  status: StatusCode,
  body: Bytes,
  headers: HeaderMap
) -> AnthropicError

  // Try to parse as Anthropic error response
  TRY
    error_response <- deserialize_json::<AnthropicErrorResponse>(body)?
    error_info <- error_response.error

    // Map to specific error type based on status and error info
    MATCH status.as_u16()
      CASE 400:
        // Bad Request - validation error
        RETURN RequestError::ValidationError {
          error_type: error_info.type,
          message: error_info.message
        }

      CASE 401:
        // Unauthorized - authentication error
        IF error_info.type == "authentication_error" THEN
          RETURN AuthenticationError::InvalidApiKey {
            message: error_info.message
          }
        ELSE
          RETURN AuthenticationError::InsufficientPermissions {
            message: error_info.message
          }
        END IF

      CASE 403:
        // Forbidden - permission denied
        RETURN AuthenticationError::InsufficientPermissions {
          message: error_info.message
        }

      CASE 404:
        // Not Found - resource not found
        RETURN ResourceError::NotFound {
          resource_type: extract_resource_type(error_info.message),
          message: error_info.message
        }

      CASE 413:
        // Payload Too Large
        RETURN RequestError::PayloadTooLarge {
          message: error_info.message
        }

      CASE 429:
        // Rate Limited
        retry_after <- parse_retry_after(headers)
        IF error_info.type == "rate_limit_error" THEN
          RETURN RateLimitError::TooManyRequests {
            retry_after: retry_after,
            message: error_info.message
          }
        ELSE
          RETURN RateLimitError::TokenLimitExceeded {
            message: error_info.message
          }
        END IF

      CASE 500:
        // Internal Server Error
        RETURN ServerError::InternalError {
          message: error_info.message
        }

      CASE 503:
        // Service Unavailable
        retry_after <- parse_retry_after(headers)
        RETURN ServerError::ServiceUnavailable {
          retry_after: retry_after,
          message: error_info.message
        }

      CASE 529:
        // Overloaded (Anthropic-specific)
        retry_after <- parse_retry_after(headers)
        RETURN ServerError::Overloaded {
          retry_after: retry_after,
          message: error_info.message
        }

      CASE _:
        // Unknown status code
        RETURN ServerError::InternalError {
          message: error_info.message
        }
    END MATCH

  CATCH DeserializeError
    // Could not parse error body - create generic error
    RETURN ResponseError::UnexpectedFormat {
      status: status.as_u16(),
      body_preview: truncate(utf8_lossy(body), 200)
    }
  END TRY
END FUNCTION
```

### 6.3 Retry-After Header Parsing

```
FUNCTION parse_retry_after(headers: HeaderMap) -> Option<Duration>
  // Check standard Retry-After header
  retry_after_header <- headers.get("Retry-After")

  IF retry_after_header IS Some THEN
    // Could be seconds (integer) or HTTP date
    TRY
      seconds <- parse_u64(retry_after_header)
      RETURN Some(Duration::from_secs(seconds))
    CATCH
      TRY
        // Try parsing as HTTP date
        date <- parse_http_date(retry_after_header)
        duration <- date - now()
        IF duration > Duration::ZERO THEN
          RETURN Some(duration)
        ELSE
          RETURN None
        END IF
      CATCH
        // Could not parse header
        RETURN None
      END TRY
    END TRY
  END IF

  // Check Anthropic-specific headers
  rate_limit_reset <- headers.get("x-ratelimit-reset")
  IF rate_limit_reset IS Some THEN
    TRY
      reset_time <- parse_iso8601(rate_limit_reset)
      duration <- reset_time - now()
      IF duration > Duration::ZERO THEN
        RETURN Some(duration)
      END IF
    CATCH
      // Ignore parse errors
    END TRY
  END IF

  RETURN None
END FUNCTION
```

### 6.4 Rate Limit Header Parsing

```
FUNCTION parse_rate_limit_headers(headers: HeaderMap) -> RateLimitHeaders
  RETURN RateLimitHeaders {
    // Request limits
    requests_limit: headers.get("x-ratelimit-limit-requests")
      .and_then(parse_u32),

    requests_remaining: headers.get("x-ratelimit-remaining-requests")
      .and_then(parse_u32),

    requests_reset: headers.get("x-ratelimit-reset-requests")
      .and_then(parse_iso8601),

    // Token limits
    tokens_limit: headers.get("x-ratelimit-limit-tokens")
      .and_then(parse_u32),

    tokens_remaining: headers.get("x-ratelimit-remaining-tokens")
      .and_then(parse_u32),

    tokens_reset: headers.get("x-ratelimit-reset-tokens")
      .and_then(parse_iso8601),

    // Anthropic request ID
    request_id: headers.get("request-id")
      .map(to_string)
  }
END FUNCTION

STRUCT RateLimitHeaders {
  requests_limit: Option<u32>,
  requests_remaining: Option<u32>,
  requests_reset: Option<DateTime>,
  tokens_limit: Option<u32>,
  tokens_remaining: Option<u32>,
  tokens_reset: Option<DateTime>,
  request_id: Option<String>
}
```

---

## 7. Authentication Manager

### 7.1 Auth Manager Interface (London-School TDD Contract)

```
// Interface for authentication - mockable for testing
TRAIT AuthManager {
  // Get authentication headers for a request
  FUNCTION get_headers() -> HeaderMap

  // Validate the API key format
  FUNCTION validate_api_key() -> Result<(), ConfigurationError>

  // Sanitize headers for logging (redact sensitive values)
  FUNCTION sanitize_headers_for_logging(headers: HeaderMap) -> HashMap<String, String>
}

// Production implementation
STRUCT AuthManagerImpl {
  api_key: SecretString,
  api_version: String,
  beta_features: Vec<BetaFeature>
}

// Mock implementation for testing
STRUCT MockAuthManager {
  expected_calls: Vec<ExpectedCall>,
  call_count: AtomicUsize
}
```

### 7.2 Auth Manager Initialization

```
FUNCTION create_auth_manager(
  api_key: SecretString,
  api_version: String,
  beta_features: Vec<BetaFeature>
) -> AuthManager

  RETURN AuthManagerImpl {
    api_key: api_key,
    api_version: api_version,
    beta_features: beta_features
  }
END FUNCTION
```

### 7.3 Header Generation

```
FUNCTION auth_manager.get_headers() -> HeaderMap
  headers <- HeaderMap::new()

  // Add API key header (x-api-key format for Anthropic)
  headers.insert(
    "x-api-key",
    self.api_key.expose_secret()
  )

  // Add API version header (required by Anthropic)
  headers.insert(
    "anthropic-version",
    self.api_version
  )

  // Add beta features header if any enabled
  IF NOT self.beta_features.is_empty() THEN
    beta_header_value <- self.beta_features
      .map(|f| f.to_header_string())
      .join(",")

    headers.insert(
      "anthropic-beta",
      beta_header_value
    )
  END IF

  RETURN headers
END FUNCTION

FUNCTION BetaFeature.to_header_string() -> String
  MATCH self
    CASE BetaFeature::ExtendedThinking:
      RETURN "extended-thinking-2024-12-20"
    CASE BetaFeature::PdfSupport:
      RETURN "pdfs-2024-09-25"
    CASE BetaFeature::PromptCaching:
      RETURN "prompt-caching-2024-07-31"
    CASE BetaFeature::TokenCounting:
      RETURN "token-counting-2024-11-01"
    CASE BetaFeature::MessageBatches:
      RETURN "message-batches-2024-09-24"
    CASE BetaFeature::ComputerUse:
      RETURN "computer-use-2024-10-22"
    CASE BetaFeature::Custom(name):
      RETURN name
  END MATCH
END FUNCTION
```

### 7.4 Header Sanitization for Logging

```
FUNCTION auth_manager.sanitize_headers_for_logging(headers: HeaderMap) -> HashMap<String, String>
  CONST SENSITIVE_HEADERS = [
    "x-api-key",
    "authorization"
  ]

  CONST PARTIAL_REDACT_HEADERS = [
    "anthropic-version",
    "anthropic-beta"
  ]

  sanitized <- HashMap::new()

  FOR EACH (key, value) IN headers DO
    key_lower <- key.to_lowercase()

    IF key_lower IN SENSITIVE_HEADERS THEN
      // Completely redact
      sanitized.insert(key_lower, "[REDACTED]")
    ELSE IF key_lower IN PARTIAL_REDACT_HEADERS THEN
      // Show header exists but not full value
      sanitized.insert(key_lower, format("[SET: {} chars]", value.len()))
    ELSE
      // Safe to log
      sanitized.insert(key_lower, value.to_string())
    END IF
  END FOR

  RETURN sanitized
END FUNCTION
```

### 7.5 API Key Validation

```
FUNCTION auth_manager.validate_api_key() -> Result<(), ConfigurationError>
  key <- self.api_key.expose_secret()

  // Check not empty
  IF key.is_empty() THEN
    RETURN Error(ConfigurationError::MissingApiKey)
  END IF

  // Check minimum length (Anthropic keys are typically 100+ characters)
  IF key.len() < 40 THEN
    RETURN Error(ConfigurationError::InvalidConfiguration {
      message: "API key appears too short"
    })
  END IF

  // Check format (warning only for flexibility with custom deployments)
  IF NOT key.starts_with("sk-ant-") THEN
    log_warning("API key format unexpected - may be valid for custom deployments", {
      prefix: key[0..min(7, key.len())]
    })
  END IF

  RETURN Ok(())
END FUNCTION
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial pseudocode (Part 1) |

---

**Continued in Part 2: Resilience, Messages Service, Streaming Handler**
