# OAuth2 Authentication Integration Module - Pseudocode (Part 4)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/oauth2`
**File:** 4 of 4 - Error Handling & Resilience

---

## Table of Contents (Part 4)

17. [Error Types and Mapping](#17-error-types-and-mapping)
18. [Error Recovery Strategies](#18-error-recovery-strategies)
19. [Retry Integration](#19-retry-integration)
20. [Circuit Breaker Integration](#20-circuit-breaker-integration)
21. [Rate Limiting Integration](#21-rate-limiting-integration)
22. [Telemetry Integration](#22-telemetry-integration)
23. [TypeScript Interface Mapping](#23-typescript-interface-mapping)

---

## 17. Error Types and Mapping

### 17.1 OAuth2 Error Hierarchy

```
// Base error type for OAuth2 module
ENUM OAuth2Error {
  // Configuration errors
  Configuration(ConfigurationError),

  // Authorization flow errors
  Authorization(AuthorizationError),

  // Token errors
  Token(TokenError),

  // Protocol errors (invalid responses)
  Protocol(ProtocolError),

  // Provider errors (server-side issues)
  Provider(ProviderError),

  // Network errors
  Network(NetworkError),

  // Storage errors
  Storage(StorageError),

  // Validation errors
  Validation(ValidationError)
}

ENUM ConfigurationError {
  InvalidConfiguration { message: String },
  InvalidRedirectUri { message: String },
  InvalidScope { message: String },
  DiscoveryFailed { message: String },
  UnsupportedFeature { feature: String },
  MissingCredentials { field: String }
}

ENUM AuthorizationError {
  InvalidRequest { description: String, uri: Option<String> },
  UnauthorizedClient { description: String },
  AccessDenied { description: String },
  UnsupportedResponseType { description: String },
  StateMismatch { expected: String, received: String },
  MissingCode { message: String },
  MissingPkceVerifier { message: String },
  InteractionRequired { description: String },
  LoginRequired { description: String },
  ConsentRequired { description: String },
  DeviceCodeExpired { user_code: String },
  Unknown { error: String, description: String, uri: Option<String> }
}

ENUM TokenError {
  NotFound { key: String },
  Expired { key: String },
  NoRefreshToken { key: String },
  RefreshFailed { reason: String },
  InvalidToken { message: String },
  InsufficientScope { required: Vec<String>, actual: Vec<String> }
}

ENUM ProtocolError {
  MissingField { field: String },
  InvalidResponse { message: String },
  UnexpectedResponse { status: u16, body: String },
  UnsupportedGrantType { grant_type: String }
}

ENUM ProviderError {
  ServerError { description: String },
  TemporarilyUnavailable { description: String, retry_after: Option<Duration> },
  InvalidClient { description: String },
  InvalidGrant { description: String },
  InvalidScope { description: String },
  UnauthorizedClient { description: String },
  Unknown { error: String, description: String }
}

ENUM NetworkError {
  ConnectionFailed { message: String },
  DnsResolutionFailed { host: String },
  Timeout,
  TlsError { message: String },
  CircuitOpen { service: String },
  RateLimited { retry_after: Option<Duration> }
}

ENUM StorageError {
  InitializationFailed { message: String },
  ReadFailed { message: String },
  WriteFailed { message: String },
  CorruptedData { message: String }
}

ENUM ValidationError {
  InvalidPkce { message: String },
  InvalidState { message: String },
  JwksFetchFailed { message: String },
  InvalidToken { message: String }
}
```

### 17.2 Error Code Mapping (RFC 6749)

```
FUNCTION map_oauth2_error(error_response: OAuth2ErrorResponse) -> OAuth2Error
  error <- error_response.error.as_str()
  description <- error_response.error_description.unwrap_or_default()

  // RFC 6749 Section 5.2 - Token Endpoint Error Codes
  MATCH error
    // Client authentication failed
    CASE "invalid_client":
      RETURN OAuth2Error::Provider(ProviderError::InvalidClient {
        description: description
      })

    // Invalid grant (authorization code, refresh token, etc.)
    CASE "invalid_grant":
      RETURN OAuth2Error::Provider(ProviderError::InvalidGrant {
        description: description
      })

    // Invalid request parameters
    CASE "invalid_request":
      RETURN OAuth2Error::Protocol(ProtocolError::InvalidResponse {
        message: description
      })

    // Invalid or unknown scope
    CASE "invalid_scope":
      RETURN OAuth2Error::Provider(ProviderError::InvalidScope {
        description: description
      })

    // Client not authorized for this grant type
    CASE "unauthorized_client":
      RETURN OAuth2Error::Provider(ProviderError::UnauthorizedClient {
        description: description
      })

    // Grant type not supported
    CASE "unsupported_grant_type":
      RETURN OAuth2Error::Protocol(ProtocolError::UnsupportedGrantType {
        grant_type: description
      })

    // Response type not supported (authorization endpoint)
    CASE "unsupported_response_type":
      RETURN OAuth2Error::Authorization(AuthorizationError::UnsupportedResponseType {
        description: description
      })

    // User denied authorization
    CASE "access_denied":
      RETURN OAuth2Error::Authorization(AuthorizationError::AccessDenied {
        description: description
      })

    // Server error
    CASE "server_error":
      RETURN OAuth2Error::Provider(ProviderError::ServerError {
        description: description
      })

    // Temporarily unavailable
    CASE "temporarily_unavailable":
      RETURN OAuth2Error::Provider(ProviderError::TemporarilyUnavailable {
        description: description,
        retry_after: None
      })

    // OIDC-specific errors
    CASE "interaction_required":
      RETURN OAuth2Error::Authorization(AuthorizationError::InteractionRequired {
        description: description
      })

    CASE "login_required":
      RETURN OAuth2Error::Authorization(AuthorizationError::LoginRequired {
        description: description
      })

    CASE "consent_required":
      RETURN OAuth2Error::Authorization(AuthorizationError::ConsentRequired {
        description: description
      })

    // Device flow errors (RFC 8628)
    CASE "authorization_pending":
      // Not an error, handled at device flow level
      RETURN OAuth2Error::Provider(ProviderError::Unknown {
        error: error.to_string(),
        description: description
      })

    CASE "slow_down":
      // Handled at device flow level
      RETURN OAuth2Error::Provider(ProviderError::Unknown {
        error: error.to_string(),
        description: description
      })

    CASE "expired_token":
      RETURN OAuth2Error::Token(TokenError::Expired {
        key: description
      })

    // Unknown error
    CASE _:
      RETURN OAuth2Error::Provider(ProviderError::Unknown {
        error: error.to_string(),
        description: description
      })
  END MATCH
END FUNCTION
```

### 17.3 Error Context and Wrapping

```
// Error context for debugging and logging
STRUCT ErrorContext {
  operation: String,
  provider: Option<String>,
  endpoint: Option<String>,
  request_id: Option<String>,
  correlation_id: Option<String>,
  timestamp: Instant,
  extra: HashMap<String, String>
}

IMPL ErrorContext {
  FUNCTION new(operation: String) -> ErrorContext
    RETURN ErrorContext {
      operation: operation,
      provider: None,
      endpoint: None,
      request_id: None,
      correlation_id: None,
      timestamp: Instant::now(),
      extra: HashMap::new()
    }
  END FUNCTION

  FUNCTION with_provider(provider: String) -> Self
    self.provider <- Some(provider)
    RETURN self
  END FUNCTION

  FUNCTION with_endpoint(endpoint: String) -> Self
    self.endpoint <- Some(endpoint)
    RETURN self
  END FUNCTION

  FUNCTION with_request_id(id: String) -> Self
    self.request_id <- Some(id)
    RETURN self
  END FUNCTION
}

// Contextual error wrapper
STRUCT OAuth2ErrorWithContext {
  error: OAuth2Error,
  context: ErrorContext,
  source: Option<Box<dyn Error>>
}

IMPL OAuth2ErrorWithContext {
  FUNCTION new(error: OAuth2Error, context: ErrorContext) -> OAuth2ErrorWithContext
    RETURN OAuth2ErrorWithContext {
      error: error,
      context: context,
      source: None
    }
  END FUNCTION

  FUNCTION with_source(source: Box<dyn Error>) -> Self
    self.source <- Some(source)
    RETURN self
  END FUNCTION
}

// Extension trait for adding context to errors
TRAIT IntoOAuth2Error {
  FUNCTION into_oauth2_error(self, context: ErrorContext) -> OAuth2ErrorWithContext
}

IMPL IntoOAuth2Error FOR TransportError {
  FUNCTION into_oauth2_error(self, context: ErrorContext) -> OAuth2ErrorWithContext
    error <- MATCH self
      CASE TransportError::Timeout:
        OAuth2Error::Network(NetworkError::Timeout)
      CASE TransportError::ConnectionFailed { message }:
        OAuth2Error::Network(NetworkError::ConnectionFailed { message })
      CASE TransportError::DnsResolutionFailed { host }:
        OAuth2Error::Network(NetworkError::DnsResolutionFailed { host })
      CASE TransportError::TlsError { message }:
        OAuth2Error::Network(NetworkError::TlsError { message })
    END MATCH

    RETURN OAuth2ErrorWithContext::new(error, context)
  END FUNCTION
}
```

### 17.4 Error Display and Logging

```
IMPL Display FOR OAuth2Error {
  FUNCTION fmt(&self, f: &mut Formatter) -> fmt::Result
    MATCH self
      CASE OAuth2Error::Configuration(e):
        write(f, "Configuration error: {}", e)
      CASE OAuth2Error::Authorization(e):
        write(f, "Authorization error: {}", e)
      CASE OAuth2Error::Token(e):
        write(f, "Token error: {}", e)
      CASE OAuth2Error::Protocol(e):
        write(f, "Protocol error: {}", e)
      CASE OAuth2Error::Provider(e):
        write(f, "Provider error: {}", e)
      CASE OAuth2Error::Network(e):
        write(f, "Network error: {}", e)
      CASE OAuth2Error::Storage(e):
        write(f, "Storage error: {}", e)
      CASE OAuth2Error::Validation(e):
        write(f, "Validation error: {}", e)
    END MATCH
  END FUNCTION
}

IMPL Display FOR ConfigurationError {
  FUNCTION fmt(&self, f: &mut Formatter) -> fmt::Result
    MATCH self
      CASE ConfigurationError::InvalidConfiguration { message }:
        write(f, "Invalid configuration: {}", message)
      CASE ConfigurationError::InvalidRedirectUri { message }:
        write(f, "Invalid redirect URI: {}", message)
      CASE ConfigurationError::InvalidScope { message }:
        write(f, "Invalid scope: {}", message)
      CASE ConfigurationError::DiscoveryFailed { message }:
        write(f, "OIDC discovery failed: {}", message)
      CASE ConfigurationError::UnsupportedFeature { feature }:
        write(f, "Unsupported feature: {}", feature)
      CASE ConfigurationError::MissingCredentials { field }:
        write(f, "Missing credentials: {}", field)
    END MATCH
  END FUNCTION
}

// Similar implementations for other error types...

// Structured logging helper
FUNCTION log_error(logger: Logger, error: OAuth2Error, context: Option<ErrorContext>)
  fields <- HashMap::new()
  fields.insert("error_type", error.error_type())
  fields.insert("error_message", error.to_string())

  IF context IS Some THEN
    ctx <- context.unwrap()
    fields.insert("operation", ctx.operation)
    IF ctx.provider IS Some THEN
      fields.insert("provider", ctx.provider.unwrap())
    END IF
    IF ctx.endpoint IS Some THEN
      fields.insert("endpoint", ctx.endpoint.unwrap())
    END IF
    IF ctx.request_id IS Some THEN
      fields.insert("request_id", ctx.request_id.unwrap())
    END IF
  END IF

  MATCH error.severity()
    CASE ErrorSeverity::Critical:
      logger.error("OAuth2 error occurred", fields)
    CASE ErrorSeverity::Warning:
      logger.warn("OAuth2 warning", fields)
    CASE ErrorSeverity::Info:
      logger.info("OAuth2 info", fields)
  END MATCH
END FUNCTION

IMPL OAuth2Error {
  FUNCTION error_type(&self) -> &'static str
    MATCH self
      CASE OAuth2Error::Configuration(_) => "configuration"
      CASE OAuth2Error::Authorization(_) => "authorization"
      CASE OAuth2Error::Token(_) => "token"
      CASE OAuth2Error::Protocol(_) => "protocol"
      CASE OAuth2Error::Provider(_) => "provider"
      CASE OAuth2Error::Network(_) => "network"
      CASE OAuth2Error::Storage(_) => "storage"
      CASE OAuth2Error::Validation(_) => "validation"
    END MATCH
  END FUNCTION

  FUNCTION severity(&self) -> ErrorSeverity
    MATCH self
      CASE OAuth2Error::Network(NetworkError::CircuitOpen { .. }):
        ErrorSeverity::Critical
      CASE OAuth2Error::Provider(ProviderError::ServerError { .. }):
        ErrorSeverity::Critical
      CASE OAuth2Error::Storage(StorageError::CorruptedData { .. }):
        ErrorSeverity::Critical
      CASE OAuth2Error::Authorization(AuthorizationError::AccessDenied { .. }):
        ErrorSeverity::Warning
      CASE OAuth2Error::Token(TokenError::Expired { .. }):
        ErrorSeverity::Info
      CASE _:
        ErrorSeverity::Warning
    END MATCH
  END FUNCTION

  FUNCTION is_retryable(&self) -> bool
    MATCH self
      CASE OAuth2Error::Network(NetworkError::Timeout):
        true
      CASE OAuth2Error::Network(NetworkError::ConnectionFailed { .. }):
        true
      CASE OAuth2Error::Provider(ProviderError::ServerError { .. }):
        true
      CASE OAuth2Error::Provider(ProviderError::TemporarilyUnavailable { .. }):
        true
      CASE OAuth2Error::Network(NetworkError::RateLimited { .. }):
        true
      CASE _:
        false
    END MATCH
  END FUNCTION
}

ENUM ErrorSeverity {
  Critical,
  Warning,
  Info
}
```

---

## 18. Error Recovery Strategies

### 18.1 Recovery Strategy Interface

```
TRAIT ErrorRecoveryStrategy {
  // Determine if recovery is possible
  FUNCTION can_recover(error: OAuth2Error) -> bool

  // Attempt recovery
  ASYNC FUNCTION recover(error: OAuth2Error, context: RecoveryContext) -> Result<RecoveryAction, OAuth2Error>
}

STRUCT RecoveryContext {
  operation: String,
  attempt: u32,
  max_attempts: u32,
  tokens_key: Option<String>,
  last_error: Option<OAuth2Error>
}

ENUM RecoveryAction {
  Retry { delay: Duration },
  RefreshToken { key: String },
  Reauthenticate,
  ClearAndRetry,
  Abort { error: OAuth2Error }
}
```

### 18.2 Token Expiry Recovery

```
STRUCT TokenExpiryRecovery {
  token_manager: Arc<TokenManager>,
  logger: Logger
}

IMPL ErrorRecoveryStrategy FOR TokenExpiryRecovery {
  FUNCTION can_recover(error: OAuth2Error) -> bool
    MATCH error
      CASE OAuth2Error::Token(TokenError::Expired { .. }):
        true
      CASE OAuth2Error::Provider(ProviderError::InvalidGrant { description })
        IF description.contains("expired") THEN true ELSE false END IF
      CASE _:
        false
    END MATCH
  END FUNCTION

  ASYNC FUNCTION recover(error: OAuth2Error, context: RecoveryContext) -> Result<RecoveryAction, OAuth2Error>
    key <- context.tokens_key.ok_or_else(|| {
      OAuth2Error::Configuration(ConfigurationError::InvalidConfiguration {
        message: "Token key required for recovery"
      })
    })?

    self.logger.info("Attempting token refresh recovery", {
      key: key,
      attempt: context.attempt
    })

    // Check if we have a refresh token
    stored <- self.token_manager.get_stored_tokens(key.clone()).await?

    IF stored IS None OR NOT stored.as_ref().unwrap().has_refresh_token() THEN
      self.logger.warn("No refresh token available, reauthentication required", {
        key: key
      })
      RETURN Ok(RecoveryAction::Reauthenticate)
    END IF

    // Attempt refresh
    TRY
      self.token_manager.force_refresh(key.clone()).await?
      RETURN Ok(RecoveryAction::Retry { delay: Duration::ZERO })
    CATCH OAuth2Error::Provider(ProviderError::InvalidGrant { .. })
      self.logger.warn("Refresh token invalid, reauthentication required", {
        key: key
      })
      RETURN Ok(RecoveryAction::Reauthenticate)
    END TRY
  END FUNCTION
}
```

### 18.3 Network Error Recovery

```
STRUCT NetworkErrorRecovery {
  max_retries: u32,
  base_delay: Duration,
  max_delay: Duration,
  logger: Logger
}

IMPL ErrorRecoveryStrategy FOR NetworkErrorRecovery {
  FUNCTION can_recover(error: OAuth2Error) -> bool
    MATCH error
      CASE OAuth2Error::Network(NetworkError::Timeout):
        true
      CASE OAuth2Error::Network(NetworkError::ConnectionFailed { .. }):
        true
      CASE OAuth2Error::Network(NetworkError::RateLimited { .. }):
        true
      CASE OAuth2Error::Provider(ProviderError::ServerError { .. }):
        true
      CASE OAuth2Error::Provider(ProviderError::TemporarilyUnavailable { .. }):
        true
      CASE _:
        false
    END MATCH
  END FUNCTION

  ASYNC FUNCTION recover(error: OAuth2Error, context: RecoveryContext) -> Result<RecoveryAction, OAuth2Error>
    IF context.attempt >= context.max_attempts THEN
      self.logger.warn("Max recovery attempts reached", {
        operation: context.operation,
        attempts: context.attempt
      })
      RETURN Ok(RecoveryAction::Abort { error: error })
    END IF

    delay <- self.calculate_delay(error.clone(), context.attempt)

    self.logger.info("Network error recovery scheduled", {
      operation: context.operation,
      attempt: context.attempt,
      delay_ms: delay.as_millis()
    })

    RETURN Ok(RecoveryAction::Retry { delay: delay })
  END FUNCTION
}

IMPL NetworkErrorRecovery {
  FUNCTION calculate_delay(&self, error: OAuth2Error, attempt: u32) -> Duration
    // Check for Retry-After header value
    IF let OAuth2Error::Network(NetworkError::RateLimited { retry_after: Some(duration) }) = error THEN
      RETURN duration
    END IF

    IF let OAuth2Error::Provider(ProviderError::TemporarilyUnavailable { retry_after: Some(duration), .. }) = error THEN
      RETURN duration
    END IF

    // Exponential backoff with jitter
    base_ms <- self.base_delay.as_millis() as u64
    max_ms <- self.max_delay.as_millis() as u64

    // 2^attempt * base, capped at max
    exponential <- min(base_ms * (1 << attempt), max_ms)

    // Add jitter (0-25% of delay)
    jitter <- random_range(0, exponential / 4)

    RETURN Duration::from_millis(exponential + jitter)
  END FUNCTION
}
```

### 18.4 Composite Recovery Strategy

```
STRUCT CompositeRecoveryStrategy {
  strategies: Vec<Arc<dyn ErrorRecoveryStrategy>>,
  logger: Logger
}

IMPL CompositeRecoveryStrategy {
  FUNCTION new() -> CompositeRecoveryStrategy
    RETURN CompositeRecoveryStrategy {
      strategies: vec![],
      logger: get_logger("oauth2.recovery")
    }
  END FUNCTION

  FUNCTION add_strategy(strategy: Arc<dyn ErrorRecoveryStrategy>) -> Self
    self.strategies.push(strategy)
    RETURN self
  END FUNCTION

  FUNCTION with_defaults(token_manager: Arc<TokenManager>) -> Self
    self <- self.add_strategy(Arc::new(TokenExpiryRecovery {
      token_manager: token_manager,
      logger: get_logger("oauth2.recovery.token")
    }))

    self <- self.add_strategy(Arc::new(NetworkErrorRecovery {
      max_retries: 3,
      base_delay: 500.milliseconds(),
      max_delay: 30.seconds(),
      logger: get_logger("oauth2.recovery.network")
    }))

    RETURN self
  END FUNCTION
}

IMPL ErrorRecoveryStrategy FOR CompositeRecoveryStrategy {
  FUNCTION can_recover(error: OAuth2Error) -> bool
    FOR strategy IN self.strategies DO
      IF strategy.can_recover(error.clone()) THEN
        RETURN true
      END IF
    END FOR
    RETURN false
  END FUNCTION

  ASYNC FUNCTION recover(error: OAuth2Error, context: RecoveryContext) -> Result<RecoveryAction, OAuth2Error>
    FOR strategy IN self.strategies DO
      IF strategy.can_recover(error.clone()) THEN
        self.logger.debug("Attempting recovery with strategy", {
          strategy: strategy.name(),
          error: error.to_string()
        })

        RETURN strategy.recover(error.clone(), context.clone()).await
      END IF
    END FOR

    // No strategy can recover
    RETURN Ok(RecoveryAction::Abort { error: error })
  END FUNCTION
}
```

---

## 19. Retry Integration

### 19.1 Retry Executor Wrapper

```
// Wrapper for integrations-retry primitive
STRUCT OAuth2RetryExecutor {
  inner: RetryExecutor,  // From integrations-retry
  config: OAuth2RetryConfig,
  logger: Logger,
  tracer: Tracer
}

STRUCT OAuth2RetryConfig {
  max_retries: u32,
  initial_backoff: Duration,
  max_backoff: Duration,
  backoff_multiplier: f64,
  jitter: f64,
  retryable_errors: Vec<OAuth2ErrorKind>
}

ENUM OAuth2ErrorKind {
  NetworkTimeout,
  ConnectionFailed,
  ServerError5xx,
  RateLimited,
  TemporarilyUnavailable
}

IMPL OAuth2RetryExecutor {
  FUNCTION new(config: OAuth2RetryConfig) -> OAuth2RetryExecutor
    // Convert to integrations-retry config
    inner_config <- RetryConfig {
      max_retries: config.max_retries,
      initial_backoff: config.initial_backoff,
      max_backoff: config.max_backoff,
      backoff_multiplier: config.backoff_multiplier,
      jitter: config.jitter
    }

    RETURN OAuth2RetryExecutor {
      inner: create_retry_executor(inner_config),
      config: config,
      logger: get_logger("oauth2.retry"),
      tracer: get_tracer("oauth2")
    }
  END FUNCTION

  FUNCTION default() -> OAuth2RetryExecutor
    OAuth2RetryExecutor::new(OAuth2RetryConfig {
      max_retries: 3,
      initial_backoff: 500.milliseconds(),
      max_backoff: 30.seconds(),
      backoff_multiplier: 2.0,
      jitter: 0.1,
      retryable_errors: vec![
        OAuth2ErrorKind::NetworkTimeout,
        OAuth2ErrorKind::ConnectionFailed,
        OAuth2ErrorKind::ServerError5xx,
        OAuth2ErrorKind::TemporarilyUnavailable
      ]
    })
  END FUNCTION
}

ASYNC FUNCTION retry_executor.execute<T, F, Fut>(operation: F) -> Result<T, OAuth2Error>
  WHERE
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, OAuth2Error>>

  span <- self.tracer.start_span("oauth2.retry.execute")

  attempt <- 0

  LOOP
    attempt <- attempt + 1
    span.set_attribute("attempt", attempt)

    TRY
      result <- operation().await?
      span.end()
      RETURN Ok(result)

    CATCH OAuth2Error AS e
      IF NOT self.is_retryable(e.clone()) THEN
        self.logger.debug("Non-retryable error", {
          error: e.to_string(),
          attempt: attempt
        })
        span.set_status(Error)
        span.end()
        RETURN Error(e)
      END IF

      IF attempt >= self.config.max_retries THEN
        self.logger.warn("Max retries exceeded", {
          error: e.to_string(),
          attempts: attempt
        })
        span.set_status(Error)
        span.end()
        RETURN Error(e)
      END IF

      delay <- self.calculate_backoff(attempt, e.clone())

      self.logger.info("Retrying after error", {
        error: e.to_string(),
        attempt: attempt,
        delay_ms: delay.as_millis()
      })

      sleep(delay).await
    END TRY
  END LOOP
END FUNCTION

FUNCTION retry_executor.is_retryable(&self, error: OAuth2Error) -> bool
  error_kind <- MATCH error
    CASE OAuth2Error::Network(NetworkError::Timeout):
      Some(OAuth2ErrorKind::NetworkTimeout)
    CASE OAuth2Error::Network(NetworkError::ConnectionFailed { .. }):
      Some(OAuth2ErrorKind::ConnectionFailed)
    CASE OAuth2Error::Provider(ProviderError::ServerError { .. }):
      Some(OAuth2ErrorKind::ServerError5xx)
    CASE OAuth2Error::Network(NetworkError::RateLimited { .. }):
      Some(OAuth2ErrorKind::RateLimited)
    CASE OAuth2Error::Provider(ProviderError::TemporarilyUnavailable { .. }):
      Some(OAuth2ErrorKind::TemporarilyUnavailable)
    CASE _:
      None
  END MATCH

  IF error_kind IS Some THEN
    RETURN self.config.retryable_errors.contains(error_kind.unwrap())
  END IF

  RETURN false
END FUNCTION

FUNCTION retry_executor.calculate_backoff(&self, attempt: u32, error: OAuth2Error) -> Duration
  // Check for explicit retry-after
  IF let OAuth2Error::Network(NetworkError::RateLimited { retry_after: Some(duration) }) = error THEN
    RETURN duration
  END IF

  IF let OAuth2Error::Provider(ProviderError::TemporarilyUnavailable { retry_after: Some(duration), .. }) = error THEN
    RETURN duration
  END IF

  // Exponential backoff
  RETURN self.inner.calculate_backoff(attempt)
END FUNCTION
```

---

## 20. Circuit Breaker Integration

### 20.1 Circuit Breaker Wrapper

```
// Wrapper for integrations-circuit-breaker primitive
STRUCT OAuth2CircuitBreaker {
  inner: CircuitBreaker,  // From integrations-circuit-breaker
  config: OAuth2CircuitBreakerConfig,
  logger: Logger,
  tracer: Tracer
}

STRUCT OAuth2CircuitBreakerConfig {
  failure_threshold: u32,
  success_threshold: u32,
  failure_window: Duration,
  reset_timeout: Duration,
  endpoints: HashMap<String, EndpointConfig>
}

STRUCT EndpointConfig {
  failure_threshold: Option<u32>,
  reset_timeout: Option<Duration>
}

IMPL OAuth2CircuitBreaker {
  FUNCTION new(config: OAuth2CircuitBreakerConfig) -> OAuth2CircuitBreaker
    inner_config <- CircuitBreakerConfig {
      failure_threshold: config.failure_threshold,
      success_threshold: config.success_threshold,
      failure_window: config.failure_window,
      reset_timeout: config.reset_timeout
    }

    RETURN OAuth2CircuitBreaker {
      inner: create_circuit_breaker(inner_config),
      config: config,
      logger: get_logger("oauth2.circuit_breaker"),
      tracer: get_tracer("oauth2")
    }
  END FUNCTION

  FUNCTION default() -> OAuth2CircuitBreaker
    OAuth2CircuitBreaker::new(OAuth2CircuitBreakerConfig {
      failure_threshold: 5,
      success_threshold: 3,
      failure_window: 60.seconds(),
      reset_timeout: 30.seconds(),
      endpoints: HashMap::new()
    })
  END FUNCTION
}

FUNCTION circuit_breaker.allow_request(&self) -> bool
  state <- self.inner.state()

  MATCH state
    CASE CircuitState::Closed:
      RETURN true
    CASE CircuitState::Open:
      self.logger.warn("Circuit breaker is open, rejecting request")
      RETURN false
    CASE CircuitState::HalfOpen:
      self.logger.debug("Circuit breaker is half-open, allowing probe request")
      RETURN true
  END MATCH
END FUNCTION

FUNCTION circuit_breaker.allow_request_for_endpoint(&self, endpoint: String) -> bool
  // Check endpoint-specific circuit breaker if configured
  IF self.config.endpoints.contains_key(endpoint) THEN
    endpoint_cb <- self.get_endpoint_breaker(endpoint)
    RETURN endpoint_cb.allow_request()
  END IF

  RETURN self.allow_request()
END FUNCTION

FUNCTION circuit_breaker.record_success(&self)
  self.inner.record_success()

  IF self.inner.state() == CircuitState::Closed THEN
    self.logger.debug("Circuit breaker closed after successful requests")
  END IF
END FUNCTION

FUNCTION circuit_breaker.record_failure(&self)
  previous_state <- self.inner.state()
  self.inner.record_failure()
  new_state <- self.inner.state()

  IF previous_state != new_state THEN
    self.logger.warn("Circuit breaker state changed", {
      from: format("{:?}", previous_state),
      to: format("{:?}", new_state)
    })
  END IF
END FUNCTION

FUNCTION circuit_breaker.state(&self) -> CircuitState
  RETURN self.inner.state()
END FUNCTION

FUNCTION circuit_breaker.reset(&self)
  self.inner.reset()
  self.logger.info("Circuit breaker manually reset")
END FUNCTION
```

### 20.2 Circuit Breaker Guard

```
// RAII guard for automatic circuit breaker updates
STRUCT CircuitBreakerGuard {
  circuit_breaker: Arc<OAuth2CircuitBreaker>,
  success: AtomicBool
}

IMPL CircuitBreakerGuard {
  FUNCTION new(circuit_breaker: Arc<OAuth2CircuitBreaker>) -> Result<CircuitBreakerGuard, OAuth2Error>
    IF NOT circuit_breaker.allow_request() THEN
      RETURN Error(OAuth2Error::Network(NetworkError::CircuitOpen {
        service: "oauth2"
      }))
    END IF

    RETURN Ok(CircuitBreakerGuard {
      circuit_breaker: circuit_breaker,
      success: AtomicBool::new(false)
    })
  END FUNCTION

  FUNCTION mark_success(&self)
    self.success.store(true, Ordering::Release)
  END FUNCTION
}

IMPL Drop FOR CircuitBreakerGuard {
  FUNCTION drop(&mut self)
    IF self.success.load(Ordering::Acquire) THEN
      self.circuit_breaker.record_success()
    ELSE
      self.circuit_breaker.record_failure()
    END IF
  END FUNCTION
}

// Usage example
ASYNC FUNCTION execute_with_circuit_breaker<T, F, Fut>(
  circuit_breaker: Arc<OAuth2CircuitBreaker>,
  operation: F
) -> Result<T, OAuth2Error>
  WHERE
    F: FnOnce() -> Fut,
    Fut: Future<Output = Result<T, OAuth2Error>>

  guard <- CircuitBreakerGuard::new(circuit_breaker)?

  result <- operation().await

  IF result.is_ok() THEN
    guard.mark_success()
  END IF

  RETURN result
END FUNCTION
```

---

## 21. Rate Limiting Integration

### 21.1 Rate Limiter Wrapper

```
// Wrapper for integrations-rate-limit primitive
STRUCT OAuth2RateLimiter {
  inner: RateLimiter,  // From integrations-rate-limit
  config: OAuth2RateLimitConfig,
  logger: Logger
}

STRUCT OAuth2RateLimitConfig {
  // Requests per minute for each endpoint type
  token_endpoint_rpm: u32,
  authorization_endpoint_rpm: u32,
  introspection_endpoint_rpm: u32,
  revocation_endpoint_rpm: u32,
  device_endpoint_rpm: u32,

  // Concurrent request limits
  max_concurrent_requests: u32,

  // Burst allowance
  burst_size: u32
}

IMPL OAuth2RateLimiter {
  FUNCTION new(config: OAuth2RateLimitConfig) -> OAuth2RateLimiter
    inner_config <- RateLimitConfig {
      default_rpm: 60,
      max_concurrent: config.max_concurrent_requests,
      burst_size: config.burst_size
    }

    RETURN OAuth2RateLimiter {
      inner: create_rate_limiter(inner_config),
      config: config,
      logger: get_logger("oauth2.rate_limiter")
    }
  END FUNCTION

  FUNCTION default() -> OAuth2RateLimiter
    OAuth2RateLimiter::new(OAuth2RateLimitConfig {
      token_endpoint_rpm: 60,
      authorization_endpoint_rpm: 30,
      introspection_endpoint_rpm: 60,
      revocation_endpoint_rpm: 30,
      device_endpoint_rpm: 30,
      max_concurrent_requests: 10,
      burst_size: 5
    })
  END FUNCTION
}

ASYNC FUNCTION rate_limiter.acquire(&self, endpoint_type: &str) -> Result<RateLimitPermit, OAuth2Error>
  rpm <- MATCH endpoint_type
    CASE "token_endpoint" => self.config.token_endpoint_rpm
    CASE "authorization_endpoint" => self.config.authorization_endpoint_rpm
    CASE "introspection_endpoint" => self.config.introspection_endpoint_rpm
    CASE "revocation_endpoint" => self.config.revocation_endpoint_rpm
    CASE "device_endpoint" => self.config.device_endpoint_rpm
    CASE _ => 60  // Default
  END MATCH

  TRY
    permit <- self.inner.acquire_with_rpm(endpoint_type, rpm).await?
    RETURN Ok(permit)

  CATCH RateLimitError::Exceeded { retry_after }
    self.logger.warn("Rate limit exceeded", {
      endpoint: endpoint_type,
      retry_after_ms: retry_after.as_millis()
    })

    RETURN Error(OAuth2Error::Network(NetworkError::RateLimited {
      retry_after: Some(retry_after)
    }))
  END TRY
END FUNCTION

FUNCTION rate_limiter.try_acquire(&self, endpoint_type: &str) -> Option<RateLimitPermit>
  RETURN self.inner.try_acquire(endpoint_type)
END FUNCTION

FUNCTION rate_limiter.get_remaining(&self, endpoint_type: &str) -> u32
  RETURN self.inner.get_remaining(endpoint_type)
END FUNCTION

FUNCTION rate_limiter.reset(&self, endpoint_type: &str)
  self.inner.reset(endpoint_type)
  self.logger.debug("Rate limiter reset for endpoint", {
    endpoint: endpoint_type
  })
END FUNCTION
```

### 21.2 Rate Limit Permit

```
STRUCT RateLimitPermit {
  endpoint: String,
  acquired_at: Instant,
  limiter: Arc<OAuth2RateLimiter>
}

IMPL Drop FOR RateLimitPermit {
  FUNCTION drop(&mut self)
    // Permit automatically released when dropped
    self.limiter.inner.release(self.endpoint.as_str())
  END FUNCTION
}
```

---

## 22. Telemetry Integration

### 22.1 Metrics

```
// Metrics integration with integrations-tracing primitive
STRUCT OAuth2Metrics {
  prefix: String,
  registry: MetricsRegistry  // From integrations-tracing
}

IMPL OAuth2Metrics {
  FUNCTION new(prefix: String) -> OAuth2Metrics
    RETURN OAuth2Metrics {
      prefix: prefix,
      registry: get_metrics_registry()
    }
  END FUNCTION

  // Token operations
  FUNCTION record_token_acquisition(&self, provider: &str, grant_type: &str, success: bool, duration: Duration)
    self.registry.counter(format("{}.token.acquisitions", self.prefix))
      .with_label("provider", provider)
      .with_label("grant_type", grant_type)
      .with_label("success", success.to_string())
      .increment()

    self.registry.histogram(format("{}.token.acquisition_duration_ms", self.prefix))
      .with_label("provider", provider)
      .with_label("grant_type", grant_type)
      .record(duration.as_millis() as f64)
  END FUNCTION

  FUNCTION record_token_refresh(&self, provider: &str, success: bool, duration: Duration)
    self.registry.counter(format("{}.token.refreshes", self.prefix))
      .with_label("provider", provider)
      .with_label("success", success.to_string())
      .increment()

    self.registry.histogram(format("{}.token.refresh_duration_ms", self.prefix))
      .with_label("provider", provider)
      .record(duration.as_millis() as f64)
  END FUNCTION

  FUNCTION record_token_expiry(&self, provider: &str)
    self.registry.counter(format("{}.token.expirations", self.prefix))
      .with_label("provider", provider)
      .increment()
  END FUNCTION

  // Authorization flow
  FUNCTION record_authorization_started(&self, provider: &str, flow: &str)
    self.registry.counter(format("{}.authorization.started", self.prefix))
      .with_label("provider", provider)
      .with_label("flow", flow)
      .increment()
  END FUNCTION

  FUNCTION record_authorization_completed(&self, provider: &str, flow: &str, success: bool, duration: Duration)
    self.registry.counter(format("{}.authorization.completed", self.prefix))
      .with_label("provider", provider)
      .with_label("flow", flow)
      .with_label("success", success.to_string())
      .increment()

    self.registry.histogram(format("{}.authorization.duration_ms", self.prefix))
      .with_label("provider", provider)
      .with_label("flow", flow)
      .record(duration.as_millis() as f64)
  END FUNCTION

  // HTTP operations
  FUNCTION record_http_request(&self, endpoint: &str, method: &str, status: u16, duration: Duration)
    self.registry.counter(format("{}.http.requests", self.prefix))
      .with_label("endpoint", endpoint)
      .with_label("method", method)
      .with_label("status", status.to_string())
      .increment()

    self.registry.histogram(format("{}.http.request_duration_ms", self.prefix))
      .with_label("endpoint", endpoint)
      .record(duration.as_millis() as f64)
  END FUNCTION

  // Errors
  FUNCTION record_error(&self, error_type: &str, provider: Option<&str>)
    counter <- self.registry.counter(format("{}.errors", self.prefix))
      .with_label("error_type", error_type)

    IF provider IS Some THEN
      counter <- counter.with_label("provider", provider.unwrap())
    END IF

    counter.increment()
  END FUNCTION

  // Circuit breaker
  FUNCTION record_circuit_state_change(&self, service: &str, from: &str, to: &str)
    self.registry.counter(format("{}.circuit_breaker.state_changes", self.prefix))
      .with_label("service", service)
      .with_label("from", from)
      .with_label("to", to)
      .increment()
  END FUNCTION

  // Rate limiting
  FUNCTION record_rate_limit_hit(&self, endpoint: &str)
    self.registry.counter(format("{}.rate_limit.hits", self.prefix))
      .with_label("endpoint", endpoint)
      .increment()
  END FUNCTION
}
```

### 22.2 Tracing Spans

```
// Span creation helpers
STRUCT OAuth2Tracer {
  tracer: Tracer  // From integrations-tracing
}

IMPL OAuth2Tracer {
  FUNCTION new() -> OAuth2Tracer
    RETURN OAuth2Tracer {
      tracer: get_tracer("oauth2")
    }
  END FUNCTION

  FUNCTION start_span(&self, name: &str) -> Span
    RETURN self.tracer.start_span(name)
  END FUNCTION

  FUNCTION authorization_span(&self, flow: &str, provider: &str) -> Span
    span <- self.tracer.start_span("oauth2.authorization")
    span.set_attribute("oauth2.flow", flow)
    span.set_attribute("oauth2.provider", provider)
    RETURN span
  END FUNCTION

  FUNCTION token_span(&self, operation: &str, provider: &str) -> Span
    span <- self.tracer.start_span(format("oauth2.token.{}", operation))
    span.set_attribute("oauth2.operation", operation)
    span.set_attribute("oauth2.provider", provider)
    RETURN span
  END FUNCTION

  FUNCTION http_span(&self, method: &str, endpoint: &str) -> Span
    span <- self.tracer.start_span("oauth2.http")
    span.set_attribute("http.method", method)
    span.set_attribute("http.url", sanitize_url(endpoint))
    RETURN span
  END FUNCTION
}

// Span completion helper
STRUCT SpanGuard {
  span: Span,
  success: AtomicBool
}

IMPL SpanGuard {
  FUNCTION new(span: Span) -> SpanGuard
    RETURN SpanGuard {
      span: span,
      success: AtomicBool::new(false)
    }
  END FUNCTION

  FUNCTION mark_success(&self)
    self.success.store(true, Ordering::Release)
  END FUNCTION

  FUNCTION set_attribute(&self, key: &str, value: impl Into<AttributeValue>)
    self.span.set_attribute(key, value)
  END FUNCTION
}

IMPL Drop FOR SpanGuard {
  FUNCTION drop(&mut self)
    IF NOT self.success.load(Ordering::Acquire) THEN
      self.span.set_status(SpanStatus::Error)
    END IF
    self.span.end()
  END FUNCTION
}
```

### 22.3 Logging

```
// Structured logging helpers
STRUCT OAuth2Logger {
  logger: Logger  // From integrations-logging
}

IMPL OAuth2Logger {
  FUNCTION new(component: &str) -> OAuth2Logger
    RETURN OAuth2Logger {
      logger: get_logger(format("oauth2.{}", component))
    }
  END FUNCTION

  // Standard log methods with OAuth2-specific context
  FUNCTION debug(&self, message: &str, context: HashMap<String, String>)
    self.logger.debug(message, context)
  END FUNCTION

  FUNCTION info(&self, message: &str, context: HashMap<String, String>)
    self.logger.info(message, context)
  END FUNCTION

  FUNCTION warn(&self, message: &str, context: HashMap<String, String>)
    self.logger.warn(message, context)
  END FUNCTION

  FUNCTION error(&self, message: &str, context: HashMap<String, String>)
    self.logger.error(message, context)
  END FUNCTION

  // Specialized logging
  FUNCTION log_token_event(&self, event: TokenEvent)
    context <- HashMap::from([
      ("event_type", event.event_type()),
      ("key", event.key.unwrap_or_default()),
      ("provider", event.provider.unwrap_or_default())
    ])

    MATCH event
      CASE TokenEvent::Acquired { .. }:
        self.info("Token acquired", context)
      CASE TokenEvent::Refreshed { .. }:
        self.info("Token refreshed", context)
      CASE TokenEvent::Expired { .. }:
        self.warn("Token expired", context)
      CASE TokenEvent::Revoked { .. }:
        self.info("Token revoked", context)
    END MATCH
  END FUNCTION

  FUNCTION log_authorization_event(&self, event: AuthorizationEvent)
    context <- HashMap::from([
      ("event_type", event.event_type()),
      ("flow", event.flow),
      ("provider", event.provider.unwrap_or_default())
    ])

    MATCH event
      CASE AuthorizationEvent::Started { .. }:
        self.info("Authorization started", context)
      CASE AuthorizationEvent::Completed { success, .. }:
        IF success THEN
          self.info("Authorization completed", context)
        ELSE
          self.warn("Authorization failed", context)
        END IF
      CASE AuthorizationEvent::Cancelled { .. }:
        self.info("Authorization cancelled", context)
    END MATCH
  END FUNCTION
}

ENUM TokenEvent {
  Acquired { key: Option<String>, provider: Option<String>, expires_in: Option<Duration> },
  Refreshed { key: Option<String>, provider: Option<String>, refresh_count: u32 },
  Expired { key: Option<String>, provider: Option<String> },
  Revoked { key: Option<String>, provider: Option<String> }
}

ENUM AuthorizationEvent {
  Started { flow: String, provider: Option<String> },
  Completed { flow: String, provider: Option<String>, success: bool, duration: Duration },
  Cancelled { flow: String, provider: Option<String>, reason: String }
}
```

---

## 23. TypeScript Interface Mapping

### 23.1 Core Types

```typescript
// TypeScript interface mapping for OAuth2 module

// Configuration
interface OAuth2Config {
  provider: ProviderConfig;
  credentials: ClientCredentials;
  defaultScopes?: string[];
  storage?: TokenStorageConfig;
  timeout?: number;  // milliseconds
  retryConfig?: RetryConfig;
  autoRefresh?: boolean;
  refreshThresholdSecs?: number;
}

interface ProviderConfig {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  deviceAuthorizationEndpoint?: string;
  introspectionEndpoint?: string;
  revocationEndpoint?: string;
  userinfoEndpoint?: string;
  jwksUri?: string;
  issuer?: string;
  discoveryUrl?: string;
}

interface ClientCredentials {
  clientId: string;
  clientSecret?: string;  // SecretString equivalent
  authMethod: ClientAuthMethod;
}

type ClientAuthMethod =
  | 'client_secret_basic'
  | 'client_secret_post'
  | 'client_secret_jwt'
  | 'private_key_jwt'
  | 'none';

type TokenStorageConfig =
  | { type: 'in_memory' }
  | { type: 'file'; path: string; encryptionKey?: string }
  | { type: 'custom'; storage: TokenStorage };
```

### 23.2 Client Interface

```typescript
// OAuth2 Client
interface OAuth2Client {
  // Flow accessors
  authorizationCode(): AuthorizationCodeFlow;
  authorizationCodePkce(): AuthorizationCodePkceFlow;
  clientCredentials(): ClientCredentialsFlow;
  deviceAuthorization(): DeviceAuthorizationFlow;

  // Token management
  tokens(): TokenManager;
  introspection(): TokenIntrospection;
  revocation(): TokenRevocation;
}

// Factory functions
function createOAuth2Client(config: OAuth2Config): Promise<OAuth2Client>;
function createOAuth2ClientFromDiscovery(
  issuerUrl: string,
  credentials: ClientCredentials
): Promise<OAuth2Client>;

// Well-known providers
const WellKnownProviders = {
  google(): ProviderConfig;
  github(): ProviderConfig;
  microsoft(): ProviderConfig;
  microsoftTenant(tenantId: string): ProviderConfig;
  okta(domain: string): ProviderConfig;
  auth0(domain: string): ProviderConfig;
};
```

### 23.3 Flow Interfaces

```typescript
// Authorization Code Flow
interface AuthorizationCodeFlow {
  buildAuthorizationUrl(params: AuthorizationParams): AuthorizationUrl;
  exchangeCode(request: CodeExchangeRequest): Promise<TokenResponse>;
  handleCallback(callback: CallbackParams): Promise<TokenResponse>;
}

interface AuthorizationParams {
  redirectUri: string;
  scopes?: string[];
  state?: string;
  responseType?: ResponseType;
  responseMode?: ResponseMode;
  prompt?: Prompt;
  loginHint?: string;
  extraParams?: Record<string, string>;
}

interface AuthorizationUrl {
  url: string;
  state: string;
}

// Authorization Code with PKCE Flow
interface AuthorizationCodePkceFlow {
  buildAuthorizationUrl(params: PkceAuthorizationParams): PkceAuthorizationUrl;
  exchangeCode(request: PkceCodeExchangeRequest): Promise<TokenResponse>;
  handleCallback(callback: CallbackParams): Promise<TokenResponse>;
}

interface PkceAuthorizationUrl extends AuthorizationUrl {
  pkceVerifier: string;  // Must be stored for code exchange
}

// Client Credentials Flow
interface ClientCredentialsFlow {
  requestToken(params?: ClientCredentialsParams): Promise<TokenResponse>;
}

// Device Authorization Flow
interface DeviceAuthorizationFlow {
  requestDeviceCode(params?: DeviceCodeParams): Promise<DeviceAuthorizationResponse>;
  pollToken(deviceCode: string): Promise<DeviceTokenResult>;
  awaitAuthorization(response: DeviceAuthorizationResponse): Promise<TokenResponse>;
}

interface DeviceAuthorizationResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
  interval?: number;
}

type DeviceTokenResult =
  | { type: 'success'; tokens: TokenResponse }
  | { type: 'pending' }
  | { type: 'slow_down'; newInterval: number }
  | { type: 'expired' }
  | { type: 'access_denied' };
```

### 23.4 Token Management Interfaces

```typescript
// Token Response
interface TokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
  refreshToken?: string;
  scope?: string;
  idToken?: string;
  [key: string]: unknown;  // Extra fields
}

// Token Manager
interface TokenManager {
  getAccessToken(key: string): Promise<AccessToken>;
  storeTokens(key: string, response: TokenResponse): Promise<void>;
  getStoredTokens(key: string): Promise<StoredTokens | null>;
  clearTokens(key: string): Promise<void>;
  forceRefresh(key: string): Promise<TokenResponse>;
}

interface AccessToken {
  token: string;
  tokenType: string;
  expiresAt?: Date;
  scopes: string[];

  asBearerHeader(): string;
  isExpired(): boolean;
}

interface StoredTokens {
  accessToken: string;
  tokenType: string;
  expiresAt?: Date;
  refreshToken?: string;
  scopes: string[];
  idToken?: string;
  metadata: TokenMetadata;

  isExpired(): boolean;
  isExpiringSoon(thresholdMs: number): boolean;
  hasRefreshToken(): boolean;
}

// Token Introspection
interface TokenIntrospection {
  introspect(params: IntrospectionParams): Promise<IntrospectionResponse>;
}

interface IntrospectionResponse {
  active: boolean;
  scope?: string;
  clientId?: string;
  username?: string;
  tokenType?: string;
  exp?: number;
  iat?: number;
  sub?: string;
  aud?: string;
  iss?: string;
  [key: string]: unknown;
}

// Token Revocation
interface TokenRevocation {
  revoke(params: RevocationParams): Promise<void>;
  revokeAll(key: string): Promise<void>;
}
```

### 23.5 Error Types

```typescript
// Error hierarchy
type OAuth2Error =
  | ConfigurationError
  | AuthorizationError
  | TokenError
  | ProtocolError
  | ProviderError
  | NetworkError
  | StorageError
  | ValidationError;

interface ConfigurationError {
  type: 'configuration';
  code: 'invalid_configuration' | 'invalid_redirect_uri' | 'invalid_scope' | 'discovery_failed' | 'unsupported_feature' | 'missing_credentials';
  message: string;
}

interface AuthorizationError {
  type: 'authorization';
  code: 'invalid_request' | 'unauthorized_client' | 'access_denied' | 'unsupported_response_type' | 'state_mismatch' | 'missing_code' | 'device_code_expired';
  message: string;
  description?: string;
  uri?: string;
}

interface TokenError {
  type: 'token';
  code: 'not_found' | 'expired' | 'no_refresh_token' | 'refresh_failed' | 'invalid_token' | 'insufficient_scope';
  message: string;
  key?: string;
}

interface ProviderError {
  type: 'provider';
  code: 'server_error' | 'temporarily_unavailable' | 'invalid_client' | 'invalid_grant' | 'invalid_scope' | 'unauthorized_client';
  message: string;
  retryAfter?: number;
}

interface NetworkError {
  type: 'network';
  code: 'connection_failed' | 'dns_resolution_failed' | 'timeout' | 'tls_error' | 'circuit_open' | 'rate_limited';
  message: string;
  retryAfter?: number;
}

// Error utilities
function isRetryable(error: OAuth2Error): boolean;
function isRecoverable(error: OAuth2Error): boolean;
function getErrorCode(error: OAuth2Error): string;
```

### 23.6 Resilience Configuration

```typescript
// Retry configuration
interface RetryConfig {
  maxRetries?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  backoffMultiplier?: number;
  jitter?: number;
  retryableErrors?: OAuth2ErrorCode[];
}

// Circuit breaker configuration
interface CircuitBreakerConfig {
  failureThreshold?: number;
  successThreshold?: number;
  failureWindowMs?: number;
  resetTimeoutMs?: number;
}

// Rate limit configuration
interface RateLimitConfig {
  tokenEndpointRpm?: number;
  authorizationEndpointRpm?: number;
  introspectionEndpointRpm?: number;
  revocationEndpointRpm?: number;
  deviceEndpointRpm?: number;
  maxConcurrentRequests?: number;
  burstSize?: number;
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial pseudocode (Part 4) |

---

## Summary

This completes the pseudocode documentation for the OAuth2 Authentication Integration Module:

- **Part 1**: Core Infrastructure & Configuration
  - Client initialization and factory patterns
  - Configuration management and validation
  - HTTP transport layer
  - OIDC Discovery
  - State management (CSRF protection)
  - PKCE generation

- **Part 2**: Authorization Flows
  - Authorization Code Flow
  - Authorization Code with PKCE Flow
  - Client Credentials Flow
  - Device Authorization Flow

- **Part 3**: Token Management
  - Token storage (in-memory, file-based)
  - Token manager with automatic refresh
  - Token refresh flow
  - Token introspection (RFC 7662)
  - Token revocation (RFC 7009)

- **Part 4**: Error Handling & Resilience
  - Error types and RFC 6749 mapping
  - Error recovery strategies
  - Retry integration
  - Circuit breaker integration
  - Rate limiting integration
  - Telemetry (metrics, tracing, logging)
  - TypeScript interface mapping

All pseudocode follows London-School TDD principles with:
- Clear interface/trait definitions for mocking
- Mock implementations for each component
- Dependency injection patterns
- Test assertion helpers
