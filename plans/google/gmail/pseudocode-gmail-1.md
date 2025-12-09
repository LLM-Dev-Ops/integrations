# Google Gmail Integration Module - Pseudocode (Part 1)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/google-gmail`
**Part:** 1 of 4 - Core Infrastructure & OAuth 2.0 Authentication

---

## Table of Contents

1. [Overview](#1-overview)
2. [Client Initialization](#2-client-initialization)
3. [Configuration Management](#3-configuration-management)
4. [OAuth 2.0 Authentication](#4-oauth-20-authentication)
5. [Token Management](#5-token-management)
6. [HTTP Transport Layer](#6-http-transport-layer)
7. [Request Builder](#7-request-builder)
8. [Response Parser](#8-response-parser)
9. [Error Handling](#9-error-handling)

---

## 1. Overview

### 1.1 Document Purpose

This pseudocode document provides detailed algorithmic descriptions for implementing the core infrastructure of the Google Gmail Integration Module. It covers client initialization, OAuth 2.0 authentication, token management, HTTP transport, and request/response handling.

### 1.2 Pseudocode Conventions

```
FUNCTION name(params) -> ReturnType
  // Comments explain intent
  statement
  IF condition THEN
    action
  ELSE
    alternative
  END IF

  FOR item IN collection DO
    process(item)
  END FOR

  TRY
    risky_operation()
  CATCH ErrorType AS e
    handle_error(e)
  END TRY

  RETURN value
END FUNCTION

STRUCT StructName {
  field: Type,
  optional_field: Option<Type>,
}

TRAIT TraitName {
  FUNCTION method(self, params) -> ReturnType
}

ENUM EnumName {
  Variant1,
  Variant2(Data),
}

ASYNC FUNCTION async_name(params) -> ReturnType
  // Async operation with await
  result <- AWAIT async_operation()
  RETURN result
END FUNCTION
```

### 1.3 Part Overview

This is Part 1 of 4, covering:
- Client initialization and factory pattern
- Configuration management and validation
- OAuth 2.0 authentication flows
- Token management and refresh
- HTTP transport layer
- Request/response handling
- Core error handling

---

## 2. Client Initialization

### 2.1 Gmail Client Factory

```pseudocode
STRUCT GmailClientImpl {
    config: GmailConfig,
    transport: Arc<dyn HttpTransport>,
    auth_provider: Arc<dyn AuthProvider>,
    retry_executor: Arc<RetryExecutor>,
    circuit_breaker: Arc<CircuitBreaker>,
    rate_limiter: Option<Arc<RateLimiter>>,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,

    // Lazy-initialized services
    messages_service: OnceCell<Arc<MessagesServiceImpl>>,
    threads_service: OnceCell<Arc<ThreadsServiceImpl>>,
    labels_service: OnceCell<Arc<LabelsServiceImpl>>,
    drafts_service: OnceCell<Arc<DraftsServiceImpl>>,
    history_service: OnceCell<Arc<HistoryServiceImpl>>,
    attachments_service: OnceCell<Arc<AttachmentsServiceImpl>>,
    settings_service: OnceCell<Arc<SettingsServiceImpl>>,
    users_service: OnceCell<Arc<UsersServiceImpl>>,
}

FUNCTION create_gmail_client(config: GmailConfig) -> Result<Arc<GmailClientImpl>, GmailError>
    // Step 1: Validate configuration
    validate_config(&config)?

    // Step 2: Initialize logger from primitives
    logger <- get_logger_from_primitive("google-gmail")
    logger.info("Initializing Gmail client", {
        base_url: config.base_url,
        default_user_id: config.default_user_id
    })

    // Step 3: Initialize tracer from primitives
    tracer <- get_tracer_from_primitive("google-gmail")

    // Step 4: Initialize authentication provider based on config
    auth_provider <- initialize_auth_provider(&config)?

    // Step 5: Build retry executor from integrations-retry primitive
    retry_executor <- create_retry_executor(RetryConfig {
        max_retries: config.max_retries,
        initial_backoff: Duration::from_millis(500),
        max_backoff: Duration::from_secs(60),
        backoff_multiplier: 2.0,
        jitter: 0.1,
        retryable_errors: [
            QuotaError::UserRateLimitExceeded,
            QuotaError::ConcurrentLimitExceeded,
            NetworkError::Timeout,
            NetworkError::ConnectionFailed,
            ServerError::BackendError,
            ServerError::ServiceUnavailable,
        ],
        // Special handling for expired tokens
        should_refresh_auth: |error| {
            MATCH error {
                GmailError::Authentication(AuthenticationError::ExpiredToken { .. }) => true,
                _ => false
            }
        }
    })

    // Step 6: Build circuit breaker from integrations-circuit-breaker primitive
    circuit_breaker <- create_circuit_breaker(CircuitBreakerConfig {
        failure_threshold: config.circuit_breaker_config.failure_threshold,
        success_threshold: config.circuit_breaker_config.success_threshold,
        reset_timeout: config.circuit_breaker_config.reset_timeout,
        failure_predicate: |error| {
            MATCH error {
                GmailError::Server(_) => true,
                GmailError::Network(_) => true,
                GmailError::Quota(QuotaError::ConcurrentLimitExceeded { .. }) => true,
                _ => false
            }
        }
    })

    // Step 7: Build rate limiter from integrations-rate-limit primitive (optional)
    rate_limiter <- IF config.rate_limit_config IS Some(rl_config) THEN
        Some(create_rate_limiter(GmailRateLimiterConfig {
            queries_per_second: rl_config.queries_per_second.unwrap_or(250),
            max_concurrent: rl_config.max_concurrent_requests.unwrap_or(25),
            daily_sending_limit: rl_config.daily_sending_limit,
            max_batch_size: rl_config.max_batch_size,
        }))
    ELSE
        None
    END IF

    // Step 8: Build HTTP transport with TLS 1.2+
    transport <- create_http_transport(HttpTransportConfig {
        timeout: config.timeout,
        connect_timeout: Duration::from_secs(10),
        tls_config: TlsConfig {
            min_version: TlsVersion::TLS_1_2,
            verify_certificates: true,
        },
        pool_config: ConnectionPoolConfig {
            max_idle_per_host: 20,
            idle_timeout: Duration::from_secs(90),
        },
    })

    // Step 9: Assemble client with lazy service initialization
    client <- GmailClientImpl {
        config: config,
        transport: Arc::new(transport),
        auth_provider: auth_provider,
        retry_executor: Arc::new(retry_executor),
        circuit_breaker: Arc::new(circuit_breaker),
        rate_limiter: rate_limiter.map(Arc::new),
        logger: logger,
        tracer: tracer,
        messages_service: OnceCell::new(),
        threads_service: OnceCell::new(),
        labels_service: OnceCell::new(),
        drafts_service: OnceCell::new(),
        history_service: OnceCell::new(),
        attachments_service: OnceCell::new(),
        settings_service: OnceCell::new(),
        users_service: OnceCell::new(),
    }

    logger.info("Gmail client initialized successfully")
    RETURN Ok(Arc::new(client))
END FUNCTION
```

### 2.2 Service Accessor Implementation

```pseudocode
IMPL GmailClient FOR GmailClientImpl {
    FUNCTION messages(self) -> &dyn MessagesService
        self.messages_service.get_or_init(|| {
            Arc::new(MessagesServiceImpl::new(
                self.config.clone(),
                self.transport.clone(),
                self.auth_provider.clone(),
                self.retry_executor.clone(),
                self.circuit_breaker.clone(),
                self.rate_limiter.clone(),
                self.logger.clone(),
                self.tracer.clone(),
            ))
        })
    END FUNCTION

    FUNCTION threads(self) -> &dyn ThreadsService
        self.threads_service.get_or_init(|| {
            Arc::new(ThreadsServiceImpl::new(
                self.config.clone(),
                self.transport.clone(),
                self.auth_provider.clone(),
                self.retry_executor.clone(),
                self.circuit_breaker.clone(),
                self.rate_limiter.clone(),
                self.logger.clone(),
                self.tracer.clone(),
            ))
        })
    END FUNCTION

    FUNCTION labels(self) -> &dyn LabelsService
        self.labels_service.get_or_init(|| {
            Arc::new(LabelsServiceImpl::new(
                self.config.clone(),
                self.transport.clone(),
                self.auth_provider.clone(),
                self.retry_executor.clone(),
                self.circuit_breaker.clone(),
                self.rate_limiter.clone(),
                self.logger.clone(),
                self.tracer.clone(),
            ))
        })
    END FUNCTION

    FUNCTION drafts(self) -> &dyn DraftsService
        self.drafts_service.get_or_init(|| {
            Arc::new(DraftsServiceImpl::new(
                self.config.clone(),
                self.transport.clone(),
                self.auth_provider.clone(),
                self.retry_executor.clone(),
                self.circuit_breaker.clone(),
                self.rate_limiter.clone(),
                self.logger.clone(),
                self.tracer.clone(),
            ))
        })
    END FUNCTION

    FUNCTION history(self) -> &dyn HistoryService
        self.history_service.get_or_init(|| {
            Arc::new(HistoryServiceImpl::new(
                self.config.clone(),
                self.transport.clone(),
                self.auth_provider.clone(),
                self.retry_executor.clone(),
                self.circuit_breaker.clone(),
                self.rate_limiter.clone(),
                self.logger.clone(),
                self.tracer.clone(),
            ))
        })
    END FUNCTION

    FUNCTION attachments(self) -> &dyn AttachmentsService
        self.attachments_service.get_or_init(|| {
            Arc::new(AttachmentsServiceImpl::new(
                self.config.clone(),
                self.transport.clone(),
                self.auth_provider.clone(),
                self.retry_executor.clone(),
                self.circuit_breaker.clone(),
                self.rate_limiter.clone(),
                self.logger.clone(),
                self.tracer.clone(),
            ))
        })
    END FUNCTION

    FUNCTION settings(self) -> &dyn SettingsService
        self.settings_service.get_or_init(|| {
            Arc::new(SettingsServiceImpl::new(
                self.config.clone(),
                self.transport.clone(),
                self.auth_provider.clone(),
                self.retry_executor.clone(),
                self.circuit_breaker.clone(),
                self.rate_limiter.clone(),
                self.logger.clone(),
                self.tracer.clone(),
            ))
        })
    END FUNCTION

    FUNCTION users(self) -> &dyn UsersService
        self.users_service.get_or_init(|| {
            Arc::new(UsersServiceImpl::new(
                self.config.clone(),
                self.transport.clone(),
                self.auth_provider.clone(),
                self.retry_executor.clone(),
                self.circuit_breaker.clone(),
                self.rate_limiter.clone(),
                self.logger.clone(),
                self.tracer.clone(),
            ))
        })
    END FUNCTION

    ASYNC FUNCTION batch<T: BatchRequest>(self, requests: Vec<T>) -> Result<Vec<BatchResponse<T::Response>>, GmailError>
        // Validate batch size
        IF requests.len() > MAX_BATCH_SIZE THEN
            RETURN Err(GmailError::Request(RequestError::ValidationError {
                message: format!("Batch size {} exceeds maximum {}", requests.len(), MAX_BATCH_SIZE)
            }))
        END IF

        // Build batch request
        batch_request <- build_batch_request(requests)?

        // Execute with resilience
        response <- self.execute_with_resilience(batch_request).await?

        // Parse batch response
        parse_batch_response(response)
    END FUNCTION

    ASYNC FUNCTION quota_status(self) -> Result<QuotaStatus, GmailError>
        // Gmail API doesn't have a direct quota endpoint
        // Return cached quota information from rate limiter
        IF self.rate_limiter IS Some(limiter) THEN
            RETURN Ok(limiter.get_quota_status())
        ELSE
            RETURN Ok(QuotaStatus::default())
        END IF
    END FUNCTION
}
```

### 2.3 Client Builder Pattern

```pseudocode
STRUCT GmailClientBuilder {
    auth_config: Option<GmailAuthConfig>,
    base_url: Option<Url>,
    timeout: Duration,
    max_retries: u32,
    retry_config: Option<RetryConfig>,
    circuit_breaker_config: Option<CircuitBreakerConfig>,
    rate_limit_config: Option<GmailRateLimitConfig>,
    default_user_id: String,
    user_agent: Option<String>,
}

IMPL GmailClientBuilder {
    FUNCTION new() -> Self
        Self {
            auth_config: None,
            base_url: None,
            timeout: Duration::from_secs(60),
            max_retries: 3,
            retry_config: None,
            circuit_breaker_config: None,
            rate_limit_config: None,
            default_user_id: "me".to_string(),
            user_agent: None,
        }
    END FUNCTION

    FUNCTION with_service_account(mut self, key_file: PathBuf) -> Self
        self.auth_config = Some(GmailAuthConfig::ServiceAccount {
            key_file: key_file,
            subject: None,
            scopes: vec![GmailScopes::GMAIL_MODIFY.to_string()],
        })
        self
    END FUNCTION

    FUNCTION with_service_account_key(mut self, key: ServiceAccountKey) -> Self
        self.auth_config = Some(GmailAuthConfig::ServiceAccountKey {
            key: key,
            subject: None,
            scopes: vec![GmailScopes::GMAIL_MODIFY.to_string()],
        })
        self
    END FUNCTION

    FUNCTION with_access_token(mut self, token: impl Into<SecretString>) -> Self
        self.auth_config = Some(GmailAuthConfig::AccessToken(token.into()))
        self
    END FUNCTION

    FUNCTION with_refresh_token(
        mut self,
        client_id: String,
        client_secret: impl Into<SecretString>,
        refresh_token: impl Into<SecretString>
    ) -> Self
        self.auth_config = Some(GmailAuthConfig::RefreshToken {
            client_id: client_id,
            client_secret: client_secret.into(),
            refresh_token: refresh_token.into(),
        })
        self
    END FUNCTION

    FUNCTION with_application_default_credentials(mut self) -> Self
        self.auth_config = Some(GmailAuthConfig::ApplicationDefault)
        self
    END FUNCTION

    FUNCTION impersonate_user(mut self, email: impl Into<String>) -> Self
        // Set subject for service account impersonation
        IF let Some(GmailAuthConfig::ServiceAccount { ref mut subject, .. }) = self.auth_config THEN
            *subject = Some(email.into())
        ELSE IF let Some(GmailAuthConfig::ServiceAccountKey { ref mut subject, .. }) = self.auth_config THEN
            *subject = Some(email.into())
        END IF
        self
    END FUNCTION

    FUNCTION with_scopes(mut self, scopes: Vec<String>) -> Self
        MATCH &mut self.auth_config {
            Some(GmailAuthConfig::ServiceAccount { ref mut scopes: s, .. }) => *s = scopes,
            Some(GmailAuthConfig::ServiceAccountKey { ref mut scopes: s, .. }) => *s = scopes,
            _ => {}
        }
        self
    END FUNCTION

    FUNCTION base_url(mut self, url: impl Into<Url>) -> Self
        self.base_url = Some(url.into())
        self
    END FUNCTION

    FUNCTION timeout(mut self, timeout: Duration) -> Self
        self.timeout = timeout
        self
    END FUNCTION

    FUNCTION max_retries(mut self, retries: u32) -> Self
        self.max_retries = retries
        self
    END FUNCTION

    FUNCTION retry_config(mut self, config: RetryConfig) -> Self
        self.retry_config = Some(config)
        self
    END FUNCTION

    FUNCTION circuit_breaker_config(mut self, config: CircuitBreakerConfig) -> Self
        self.circuit_breaker_config = Some(config)
        self
    END FUNCTION

    FUNCTION rate_limit_config(mut self, config: GmailRateLimitConfig) -> Self
        self.rate_limit_config = Some(config)
        self
    END FUNCTION

    FUNCTION default_user_id(mut self, user_id: impl Into<String>) -> Self
        self.default_user_id = user_id.into()
        self
    END FUNCTION

    FUNCTION user_agent(mut self, user_agent: impl Into<String>) -> Self
        self.user_agent = Some(user_agent.into())
        self
    END FUNCTION

    FUNCTION build(self) -> Result<Arc<dyn GmailClient>, GmailError>
        // Resolve auth config
        auth_config <- self.auth_config
            .ok_or(ConfigurationError::MissingAuth)?

        // Build config
        config <- GmailConfig {
            auth: auth_config,
            base_url: self.base_url.unwrap_or_else(|| {
                Url::parse("https://gmail.googleapis.com").unwrap()
            }),
            timeout: self.timeout,
            max_retries: self.max_retries,
            retry_config: self.retry_config.unwrap_or_default(),
            circuit_breaker_config: self.circuit_breaker_config.unwrap_or_default(),
            rate_limit_config: self.rate_limit_config,
            user_agent: self.user_agent.unwrap_or_else(|| {
                format!("integrations-gmail/{}", env!("CARGO_PKG_VERSION"))
            }),
            default_user_id: self.default_user_id,
        }

        create_gmail_client(config)
    END FUNCTION
}
```

---

## 3. Configuration Management

### 3.1 Configuration Validation

```pseudocode
FUNCTION validate_config(config: &GmailConfig) -> Result<(), ConfigurationError>
    // Validate base URL
    IF config.base_url.scheme() != "https" THEN
        RETURN Err(ConfigurationError::InvalidBaseUrl {
            url: config.base_url.to_string(),
            reason: "Gmail API requires HTTPS"
        })
    END IF

    // Validate auth config
    validate_auth_config(&config.auth)?

    // Validate timeout
    IF config.timeout < Duration::from_secs(1) THEN
        RETURN Err(ConfigurationError::InvalidConfiguration {
            field: "timeout",
            reason: "Timeout must be at least 1 second"
        })
    END IF

    IF config.timeout > Duration::from_secs(600) THEN
        RETURN Err(ConfigurationError::InvalidConfiguration {
            field: "timeout",
            reason: "Timeout must not exceed 600 seconds"
        })
    END IF

    // Validate user ID
    IF config.default_user_id.is_empty() THEN
        RETURN Err(ConfigurationError::InvalidConfiguration {
            field: "default_user_id",
            reason: "User ID cannot be empty"
        })
    END IF

    // Validate rate limit config if present
    IF config.rate_limit_config IS Some(rl_config) THEN
        IF rl_config.max_batch_size > MAX_BATCH_SIZE THEN
            RETURN Err(ConfigurationError::InvalidConfiguration {
                field: "max_batch_size",
                reason: format!("Batch size cannot exceed {}", MAX_BATCH_SIZE)
            })
        END IF
    END IF

    Ok(())
END FUNCTION

FUNCTION validate_auth_config(auth: &GmailAuthConfig) -> Result<(), ConfigurationError>
    MATCH auth {
        GmailAuthConfig::ServiceAccount { key_file, scopes, .. } => {
            IF NOT key_file.exists() THEN
                RETURN Err(ConfigurationError::InvalidAuthConfig {
                    reason: format!("Service account key file not found: {:?}", key_file)
                })
            END IF
            IF scopes.is_empty() THEN
                RETURN Err(ConfigurationError::InvalidAuthConfig {
                    reason: "At least one scope must be specified"
                })
            END IF
            validate_scopes(scopes)?
        }

        GmailAuthConfig::ServiceAccountKey { key, scopes, .. } => {
            IF key.client_email.is_empty() THEN
                RETURN Err(ConfigurationError::InvalidAuthConfig {
                    reason: "Service account client_email is required"
                })
            END IF
            IF key.private_key.expose_secret().is_empty() THEN
                RETURN Err(ConfigurationError::InvalidAuthConfig {
                    reason: "Service account private_key is required"
                })
            END IF
            IF scopes.is_empty() THEN
                RETURN Err(ConfigurationError::InvalidAuthConfig {
                    reason: "At least one scope must be specified"
                })
            END IF
            validate_scopes(scopes)?
        }

        GmailAuthConfig::AccessToken(token) => {
            IF token.expose_secret().is_empty() THEN
                RETURN Err(ConfigurationError::InvalidAuthConfig {
                    reason: "Access token cannot be empty"
                })
            END IF
        }

        GmailAuthConfig::RefreshToken { client_id, client_secret, refresh_token } => {
            IF client_id.is_empty() THEN
                RETURN Err(ConfigurationError::InvalidAuthConfig {
                    reason: "Client ID is required for refresh token auth"
                })
            END IF
            IF client_secret.expose_secret().is_empty() THEN
                RETURN Err(ConfigurationError::InvalidAuthConfig {
                    reason: "Client secret is required for refresh token auth"
                })
            END IF
            IF refresh_token.expose_secret().is_empty() THEN
                RETURN Err(ConfigurationError::InvalidAuthConfig {
                    reason: "Refresh token cannot be empty"
                })
            END IF
        }

        GmailAuthConfig::ApiKey(key) => {
            IF key.expose_secret().is_empty() THEN
                RETURN Err(ConfigurationError::InvalidAuthConfig {
                    reason: "API key cannot be empty"
                })
            END IF
        }

        GmailAuthConfig::ApplicationDefault => {
            // ADC will be validated at runtime
            Ok(())
        }
    }

    Ok(())
END FUNCTION

FUNCTION validate_scopes(scopes: &[String]) -> Result<(), ConfigurationError>
    valid_scopes <- [
        GmailScopes::MAIL_GOOGLE_COM,
        GmailScopes::GMAIL_MODIFY,
        GmailScopes::GMAIL_READONLY,
        GmailScopes::GMAIL_COMPOSE,
        GmailScopes::GMAIL_SEND,
        GmailScopes::GMAIL_INSERT,
        GmailScopes::GMAIL_LABELS,
        GmailScopes::GMAIL_SETTINGS_BASIC,
        GmailScopes::GMAIL_SETTINGS_SHARING,
        GmailScopes::GMAIL_METADATA,
    ]

    FOR scope IN scopes DO
        IF NOT valid_scopes.contains(&scope.as_str()) THEN
            RETURN Err(ConfigurationError::InvalidAuthConfig {
                reason: format!("Unknown Gmail scope: {}", scope)
            })
        END IF
    END FOR

    Ok(())
END FUNCTION
```

### 3.2 Configuration from Environment

```pseudocode
FUNCTION create_gmail_client_from_env() -> Result<Arc<dyn GmailClient>, GmailError>
    // Try to detect authentication method from environment

    // Option 1: Service account key file
    IF env::var("GOOGLE_APPLICATION_CREDENTIALS").is_ok() THEN
        key_file <- PathBuf::from(env::var("GOOGLE_APPLICATION_CREDENTIALS")?)
        subject <- env::var("GMAIL_IMPERSONATE_USER").ok()

        RETURN GmailClientBuilder::new()
            .with_service_account(key_file)
            .impersonate_user(subject.unwrap_or_default())
            .build()
    END IF

    // Option 2: Access token from environment
    IF let Ok(token) = env::var("GMAIL_ACCESS_TOKEN") THEN
        RETURN GmailClientBuilder::new()
            .with_access_token(token)
            .build()
    END IF

    // Option 3: OAuth credentials for refresh
    IF let (Ok(client_id), Ok(client_secret), Ok(refresh_token)) = (
        env::var("GMAIL_CLIENT_ID"),
        env::var("GMAIL_CLIENT_SECRET"),
        env::var("GMAIL_REFRESH_TOKEN")
    ) THEN
        RETURN GmailClientBuilder::new()
            .with_refresh_token(client_id, client_secret, refresh_token)
            .build()
    END IF

    // Option 4: Application Default Credentials
    RETURN GmailClientBuilder::new()
        .with_application_default_credentials()
        .build()
END FUNCTION
```

---

## 4. OAuth 2.0 Authentication

### 4.1 Auth Provider Interface

```pseudocode
TRAIT AuthProvider: Send + Sync {
    // Get a valid access token, refreshing if necessary
    ASYNC FUNCTION get_access_token(self) -> Result<SecretString, AuthenticationError>

    // Force refresh the token
    ASYNC FUNCTION refresh_token(self) -> Result<SecretString, AuthenticationError>

    // Check if token needs refresh
    FUNCTION needs_refresh(self) -> bool

    // Get the auth header value
    ASYNC FUNCTION get_auth_header(self) -> Result<String, AuthenticationError>
}
```

### 4.2 Service Account Auth Provider

```pseudocode
STRUCT ServiceAccountAuthProvider {
    client_email: String,
    private_key: SecretString,
    private_key_id: String,
    token_uri: String,
    subject: Option<String>,
    scopes: Vec<String>,

    // Cached token
    cached_token: RwLock<Option<CachedToken>>,

    // HTTP client for token requests
    http_client: reqwest::Client,

    logger: Arc<dyn Logger>,
}

STRUCT CachedToken {
    access_token: SecretString,
    expires_at: Instant,
}

IMPL ServiceAccountAuthProvider {
    FUNCTION new(
        key: ServiceAccountKey,
        subject: Option<String>,
        scopes: Vec<String>,
        logger: Arc<dyn Logger>,
    ) -> Result<Self, AuthenticationError>
        // Parse and validate private key
        validate_private_key(&key.private_key)?

        Ok(Self {
            client_email: key.client_email,
            private_key: key.private_key,
            private_key_id: key.private_key_id,
            token_uri: key.token_uri,
            subject: subject,
            scopes: scopes,
            cached_token: RwLock::new(None),
            http_client: reqwest::Client::builder()
                .timeout(Duration::from_secs(30))
                .build()?,
            logger: logger,
        })
    END FUNCTION

    FUNCTION create_jwt(self) -> Result<String, AuthenticationError>
        now <- SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs()

        // JWT Header
        header <- JwtHeader {
            alg: "RS256",
            typ: "JWT",
            kid: self.private_key_id.clone(),
        }

        // JWT Claims
        claims <- JwtClaims {
            iss: self.client_email.clone(),
            scope: self.scopes.join(" "),
            aud: self.token_uri.clone(),
            iat: now,
            exp: now + 3600,  // 1 hour
            sub: self.subject.clone(),
        }

        // Sign JWT with RS256
        TRY
            token <- encode_jwt(header, claims, &self.private_key)?
            RETURN Ok(token)
        CATCH jwt_error AS e
            self.logger.error("Failed to create JWT", { error: e.to_string() })
            RETURN Err(AuthenticationError::JwtCreationFailed {
                reason: e.to_string()
            })
        END TRY
    END FUNCTION

    ASYNC FUNCTION exchange_jwt_for_token(self, jwt: &str) -> Result<TokenResponse, AuthenticationError>
        // Build token request
        request_body <- form_urlencoded::Serializer::new(String::new())
            .append_pair("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
            .append_pair("assertion", jwt)
            .finish()

        self.logger.debug("Exchanging JWT for access token", {
            token_uri: self.token_uri
        })

        // Send request
        TRY
            response <- self.http_client
                .post(&self.token_uri)
                .header("Content-Type", "application/x-www-form-urlencoded")
                .body(request_body)
                .send()
                .await?

            IF NOT response.status().is_success() THEN
                error_body <- response.text().await?
                self.logger.error("Token exchange failed", {
                    status: response.status(),
                    error: error_body
                })
                RETURN Err(AuthenticationError::ServiceAccountError {
                    message: format!("Token exchange failed: {}", error_body)
                })
            END IF

            token_response <- response.json::<TokenResponse>().await?
            RETURN Ok(token_response)
        CATCH reqwest_error AS e
            self.logger.error("Token exchange request failed", { error: e.to_string() })
            RETURN Err(AuthenticationError::ServiceAccountError {
                message: e.to_string()
            })
        END TRY
    END FUNCTION
}

IMPL AuthProvider FOR ServiceAccountAuthProvider {
    ASYNC FUNCTION get_access_token(self) -> Result<SecretString, AuthenticationError>
        // Check cache first
        cached <- self.cached_token.read().await
        IF cached IS Some(token) AND token.expires_at > Instant::now() + Duration::from_secs(60) THEN
            RETURN Ok(token.access_token.clone())
        END IF
        DROP cached  // Release read lock

        // Need to refresh
        self.refresh_token().await
    END FUNCTION

    ASYNC FUNCTION refresh_token(self) -> Result<SecretString, AuthenticationError>
        self.logger.debug("Refreshing service account token")

        // Create JWT
        jwt <- self.create_jwt()?

        // Exchange for access token
        token_response <- self.exchange_jwt_for_token(&jwt).await?

        // Cache the token
        expires_at <- Instant::now() + Duration::from_secs(token_response.expires_in as u64)

        cached_token <- CachedToken {
            access_token: SecretString::new(token_response.access_token),
            expires_at: expires_at,
        }

        // Update cache
        *self.cached_token.write().await = Some(cached_token.clone())

        self.logger.info("Service account token refreshed", {
            expires_in_secs: token_response.expires_in
        })

        Ok(cached_token.access_token)
    END FUNCTION

    FUNCTION needs_refresh(self) -> bool
        IF let Some(token) = self.cached_token.blocking_read().as_ref() THEN
            // Refresh if less than 5 minutes remaining
            token.expires_at < Instant::now() + Duration::from_secs(300)
        ELSE
            true
        END IF
    END FUNCTION

    ASYNC FUNCTION get_auth_header(self) -> Result<String, AuthenticationError>
        token <- self.get_access_token().await?
        Ok(format!("Bearer {}", token.expose_secret()))
    END FUNCTION
}
```

### 4.3 Refresh Token Auth Provider

```pseudocode
STRUCT RefreshTokenAuthProvider {
    client_id: String,
    client_secret: SecretString,
    refresh_token: SecretString,

    // Cached access token
    cached_token: RwLock<Option<CachedToken>>,

    // HTTP client
    http_client: reqwest::Client,

    logger: Arc<dyn Logger>,
}

CONST GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token"

IMPL RefreshTokenAuthProvider {
    FUNCTION new(
        client_id: String,
        client_secret: SecretString,
        refresh_token: SecretString,
        logger: Arc<dyn Logger>,
    ) -> Self
        Self {
            client_id: client_id,
            client_secret: client_secret,
            refresh_token: refresh_token,
            cached_token: RwLock::new(None),
            http_client: reqwest::Client::builder()
                .timeout(Duration::from_secs(30))
                .build()
                .expect("Failed to create HTTP client"),
            logger: logger,
        }
    END FUNCTION
}

IMPL AuthProvider FOR RefreshTokenAuthProvider {
    ASYNC FUNCTION get_access_token(self) -> Result<SecretString, AuthenticationError>
        // Check cache first
        cached <- self.cached_token.read().await
        IF cached IS Some(token) AND token.expires_at > Instant::now() + Duration::from_secs(60) THEN
            RETURN Ok(token.access_token.clone())
        END IF
        DROP cached

        self.refresh_token().await
    END FUNCTION

    ASYNC FUNCTION refresh_token(self) -> Result<SecretString, AuthenticationError>
        self.logger.debug("Refreshing access token using refresh token")

        // Build refresh request
        request_body <- form_urlencoded::Serializer::new(String::new())
            .append_pair("client_id", &self.client_id)
            .append_pair("client_secret", self.client_secret.expose_secret())
            .append_pair("refresh_token", self.refresh_token.expose_secret())
            .append_pair("grant_type", "refresh_token")
            .finish()

        TRY
            response <- self.http_client
                .post(GOOGLE_TOKEN_URL)
                .header("Content-Type", "application/x-www-form-urlencoded")
                .body(request_body)
                .send()
                .await?

            IF NOT response.status().is_success() THEN
                error_body <- response.text().await.unwrap_or_default()

                // Check for specific error types
                IF error_body.contains("invalid_grant") THEN
                    RETURN Err(AuthenticationError::InvalidCredentials {
                        message: "Refresh token is invalid or expired"
                    })
                END IF

                RETURN Err(AuthenticationError::RefreshFailed {
                    message: error_body
                })
            END IF

            token_response <- response.json::<TokenResponse>().await?

            // Cache the new token
            expires_at <- Instant::now() + Duration::from_secs(token_response.expires_in as u64)

            cached_token <- CachedToken {
                access_token: SecretString::new(token_response.access_token),
                expires_at: expires_at,
            }

            *self.cached_token.write().await = Some(cached_token.clone())

            self.logger.info("Access token refreshed", {
                expires_in_secs: token_response.expires_in
            })

            Ok(cached_token.access_token)
        CATCH reqwest_error AS e
            self.logger.error("Token refresh request failed", { error: e.to_string() })
            RETURN Err(AuthenticationError::RefreshFailed {
                message: e.to_string()
            })
        END TRY
    END FUNCTION

    FUNCTION needs_refresh(self) -> bool
        IF let Some(token) = self.cached_token.blocking_read().as_ref() THEN
            token.expires_at < Instant::now() + Duration::from_secs(300)
        ELSE
            true
        END IF
    END FUNCTION

    ASYNC FUNCTION get_auth_header(self) -> Result<String, AuthenticationError>
        token <- self.get_access_token().await?
        Ok(format!("Bearer {}", token.expose_secret()))
    END FUNCTION
}
```

### 4.4 Static Token Auth Provider

```pseudocode
STRUCT StaticTokenAuthProvider {
    access_token: SecretString,
}

IMPL StaticTokenAuthProvider {
    FUNCTION new(access_token: SecretString) -> Self
        Self { access_token }
    END FUNCTION
}

IMPL AuthProvider FOR StaticTokenAuthProvider {
    ASYNC FUNCTION get_access_token(self) -> Result<SecretString, AuthenticationError>
        Ok(self.access_token.clone())
    END FUNCTION

    ASYNC FUNCTION refresh_token(self) -> Result<SecretString, AuthenticationError>
        // Static token cannot be refreshed
        Err(AuthenticationError::RefreshFailed {
            message: "Static access token cannot be refreshed"
        })
    END FUNCTION

    FUNCTION needs_refresh(self) -> bool
        false  // No way to know, assume valid
    END FUNCTION

    ASYNC FUNCTION get_auth_header(self) -> Result<String, AuthenticationError>
        Ok(format!("Bearer {}", self.access_token.expose_secret()))
    END FUNCTION
}
```

### 4.5 Application Default Credentials Provider

```pseudocode
STRUCT ApplicationDefaultCredentialsProvider {
    inner: RwLock<Option<Arc<dyn AuthProvider>>>,
    logger: Arc<dyn Logger>,
}

IMPL ApplicationDefaultCredentialsProvider {
    FUNCTION new(logger: Arc<dyn Logger>) -> Self
        Self {
            inner: RwLock::new(None),
            logger: logger,
        }
    END FUNCTION

    ASYNC FUNCTION initialize(self) -> Result<(), AuthenticationError>
        // Try different ADC sources in order

        // 1. GOOGLE_APPLICATION_CREDENTIALS environment variable
        IF let Ok(key_path) = env::var("GOOGLE_APPLICATION_CREDENTIALS") THEN
            self.logger.debug("Using GOOGLE_APPLICATION_CREDENTIALS", { path: key_path })

            TRY
                key_file <- fs::read_to_string(&key_path).await?
                key <- serde_json::from_str::<ServiceAccountKey>(&key_file)?

                provider <- ServiceAccountAuthProvider::new(
                    key,
                    None,
                    vec![GmailScopes::GMAIL_MODIFY.to_string()],
                    self.logger.clone(),
                )?

                *self.inner.write().await = Some(Arc::new(provider))
                RETURN Ok(())
            CATCH e AS error
                self.logger.warn("Failed to load GOOGLE_APPLICATION_CREDENTIALS", {
                    error: error.to_string()
                })
            END TRY
        END IF

        // 2. Well-known file location (~/.config/gcloud/application_default_credentials.json)
        IF let Some(home) = dirs::home_dir() THEN
            well_known_path <- home
                .join(".config")
                .join("gcloud")
                .join("application_default_credentials.json")

            IF well_known_path.exists() THEN
                self.logger.debug("Using well-known ADC file", { path: well_known_path })

                TRY
                    key_file <- fs::read_to_string(&well_known_path).await?
                    adc <- serde_json::from_str::<AdcCredentials>(&key_file)?

                    // ADC can be either service account or authorized user
                    provider <- MATCH adc.credential_type.as_str() {
                        "authorized_user" => {
                            Arc::new(RefreshTokenAuthProvider::new(
                                adc.client_id.unwrap(),
                                SecretString::new(adc.client_secret.unwrap()),
                                SecretString::new(adc.refresh_token.unwrap()),
                                self.logger.clone(),
                            )) as Arc<dyn AuthProvider>
                        }
                        "service_account" => {
                            Arc::new(ServiceAccountAuthProvider::new(
                                ServiceAccountKey {
                                    client_email: adc.client_email.unwrap(),
                                    private_key: SecretString::new(adc.private_key.unwrap()),
                                    private_key_id: adc.private_key_id.unwrap(),
                                    token_uri: adc.token_uri.unwrap_or(GOOGLE_TOKEN_URL.to_string()),
                                },
                                None,
                                vec![GmailScopes::GMAIL_MODIFY.to_string()],
                                self.logger.clone(),
                            )?) as Arc<dyn AuthProvider>
                        }
                        _ => {
                            RETURN Err(AuthenticationError::InvalidCredentials {
                                message: format!("Unknown credential type: {}", adc.credential_type)
                            })
                        }
                    }

                    *self.inner.write().await = Some(provider)
                    RETURN Ok(())
                CATCH e AS error
                    self.logger.warn("Failed to load well-known ADC file", {
                        error: error.to_string()
                    })
                END TRY
            END IF
        END IF

        // 3. GCE Metadata Server (for running on GCP)
        TRY
            IF is_running_on_gce().await THEN
                self.logger.debug("Using GCE metadata server for credentials")
                provider <- GceMetadataAuthProvider::new(self.logger.clone())
                *self.inner.write().await = Some(Arc::new(provider))
                RETURN Ok(())
            END IF
        CATCH _ AS e
            // Not running on GCE
        END TRY

        Err(AuthenticationError::InvalidCredentials {
            message: "No valid Application Default Credentials found"
        })
    END FUNCTION
}

IMPL AuthProvider FOR ApplicationDefaultCredentialsProvider {
    ASYNC FUNCTION get_access_token(self) -> Result<SecretString, AuthenticationError>
        // Initialize on first use
        IF self.inner.read().await.is_none() THEN
            self.initialize().await?
        END IF

        inner <- self.inner.read().await
            .as_ref()
            .ok_or(AuthenticationError::InvalidCredentials {
                message: "ADC not initialized"
            })?
            .clone()

        inner.get_access_token().await
    END FUNCTION

    ASYNC FUNCTION refresh_token(self) -> Result<SecretString, AuthenticationError>
        inner <- self.inner.read().await
            .as_ref()
            .ok_or(AuthenticationError::InvalidCredentials {
                message: "ADC not initialized"
            })?
            .clone()

        inner.refresh_token().await
    END FUNCTION

    FUNCTION needs_refresh(self) -> bool
        IF let Some(inner) = self.inner.blocking_read().as_ref() THEN
            inner.needs_refresh()
        ELSE
            true
        END IF
    END FUNCTION

    ASYNC FUNCTION get_auth_header(self) -> Result<String, AuthenticationError>
        token <- self.get_access_token().await?
        Ok(format!("Bearer {}", token.expose_secret()))
    END FUNCTION
}
```

---

## 5. Token Management

### 5.1 Token Response Structure

```pseudocode
STRUCT TokenResponse {
    access_token: String,
    expires_in: i64,
    token_type: String,
    scope: Option<String>,
    refresh_token: Option<String>,
}
```

### 5.2 Auth Provider Factory

```pseudocode
FUNCTION initialize_auth_provider(config: &GmailConfig) -> Result<Arc<dyn AuthProvider>, GmailError>
    logger <- get_logger_from_primitive("google-gmail-auth")

    MATCH &config.auth {
        GmailAuthConfig::ServiceAccount { key_file, subject, scopes } => {
            // Load key file
            key_json <- fs::read_to_string(key_file)
                .map_err(|e| ConfigurationError::InvalidAuthConfig {
                    reason: format!("Failed to read service account key file: {}", e)
                })?

            key <- serde_json::from_str::<ServiceAccountKey>(&key_json)
                .map_err(|e| ConfigurationError::InvalidAuthConfig {
                    reason: format!("Failed to parse service account key: {}", e)
                })?

            provider <- ServiceAccountAuthProvider::new(
                key,
                subject.clone(),
                scopes.clone(),
                logger,
            )?

            Ok(Arc::new(provider))
        }

        GmailAuthConfig::ServiceAccountKey { key, subject, scopes } => {
            provider <- ServiceAccountAuthProvider::new(
                key.clone(),
                subject.clone(),
                scopes.clone(),
                logger,
            )?

            Ok(Arc::new(provider))
        }

        GmailAuthConfig::AccessToken(token) => {
            Ok(Arc::new(StaticTokenAuthProvider::new(token.clone())))
        }

        GmailAuthConfig::RefreshToken { client_id, client_secret, refresh_token } => {
            Ok(Arc::new(RefreshTokenAuthProvider::new(
                client_id.clone(),
                client_secret.clone(),
                refresh_token.clone(),
                logger,
            )))
        }

        GmailAuthConfig::ApiKey(key) => {
            Ok(Arc::new(ApiKeyAuthProvider::new(key.clone())))
        }

        GmailAuthConfig::ApplicationDefault => {
            Ok(Arc::new(ApplicationDefaultCredentialsProvider::new(logger)))
        }
    }
END FUNCTION
```

---

## 6. HTTP Transport Layer

### 6.1 Gmail HTTP Transport

```pseudocode
STRUCT GmailHttpTransport {
    inner: reqwest::Client,
    base_url: Url,
    user_agent: String,
    logger: Arc<dyn Logger>,
}

IMPL GmailHttpTransport {
    FUNCTION new(config: HttpTransportConfig, base_url: Url, user_agent: String, logger: Arc<dyn Logger>) -> Self
        inner <- reqwest::Client::builder()
            .timeout(config.timeout)
            .connect_timeout(config.connect_timeout)
            .min_tls_version(tls::Version::TLS_1_2)
            .pool_max_idle_per_host(config.pool_config.max_idle_per_host)
            .pool_idle_timeout(config.pool_config.idle_timeout)
            .build()
            .expect("Failed to build HTTP client")

        Self {
            inner: inner,
            base_url: base_url,
            user_agent: user_agent,
            logger: logger,
        }
    END FUNCTION
}

IMPL HttpTransport FOR GmailHttpTransport {
    ASYNC FUNCTION send(self, request: HttpRequest) -> Result<HttpResponse, TransportError>
        // Build reqwest request
        url <- self.resolve_url(&request.url)?

        req_builder <- self.inner.request(request.method.into(), url)
            .header("User-Agent", &self.user_agent)

        // Add headers
        FOR (name, value) IN request.headers DO
            req_builder <- req_builder.header(name, value)
        END FOR

        // Add body
        req_builder <- MATCH request.body {
            Some(RequestBody::Json(json)) => req_builder.json(&json),
            Some(RequestBody::Bytes(bytes)) => req_builder.body(bytes),
            Some(RequestBody::Multipart(parts)) => {
                multipart_form <- build_multipart(parts)?
                req_builder.multipart(multipart_form)
            }
            None => req_builder,
        }

        // Add timeout override if specified
        IF let Some(timeout) = request.timeout THEN
            req_builder <- req_builder.timeout(timeout)
        END IF

        // Send request
        self.logger.debug("Sending HTTP request", {
            method: request.method.to_string(),
            url: url.to_string(),
        })

        start_time <- Instant::now()

        TRY
            response <- req_builder.send().await?

            elapsed <- start_time.elapsed()
            status <- response.status()
            headers <- response.headers().clone()
            body <- response.bytes().await?

            self.logger.debug("Received HTTP response", {
                status: status.as_u16(),
                duration_ms: elapsed.as_millis(),
                body_size: body.len(),
            })

            Ok(HttpResponse {
                status: status,
                headers: headers,
                body: body,
            })
        CATCH reqwest_error AS e
            self.logger.error("HTTP request failed", {
                error: e.to_string(),
                duration_ms: start_time.elapsed().as_millis(),
            })

            IF e.is_timeout() THEN
                RETURN Err(TransportError::Timeout)
            ELSE IF e.is_connect() THEN
                RETURN Err(TransportError::ConnectionFailed {
                    reason: e.to_string()
                })
            ELSE
                RETURN Err(TransportError::Other {
                    reason: e.to_string()
                })
            END IF
        END TRY
    END FUNCTION

    ASYNC FUNCTION send_raw(self, request: HttpRequest) -> Result<Bytes, TransportError>
        response <- self.send(request).await?

        IF NOT response.status.is_success() THEN
            RETURN Err(TransportError::HttpError {
                status: response.status,
                body: String::from_utf8_lossy(&response.body).to_string(),
            })
        END IF

        Ok(response.body)
    END FUNCTION

    ASYNC FUNCTION send_batch(self, requests: Vec<HttpRequest>) -> Result<Vec<HttpResponse>, TransportError>
        // Build multipart batch request
        boundary <- format!("batch_{}", Uuid::new_v4())

        batch_body <- build_batch_body(&requests, &boundary)?

        batch_request <- HttpRequest {
            method: HttpMethod::POST,
            url: Url::parse(&format!("{}/batch/gmail/v1", self.base_url))?,
            headers: {
                let mut headers = HeaderMap::new();
                headers.insert("Content-Type", format!("multipart/mixed; boundary={}", boundary).parse()?);
                headers
            },
            body: Some(RequestBody::Bytes(batch_body.into())),
            timeout: None,
        }

        response <- self.send(batch_request).await?

        // Parse batch response
        parse_batch_response_body(&response.body, &boundary)
    END FUNCTION

    ASYNC FUNCTION send_resumable(
        self,
        init_request: HttpRequest,
        data: impl Stream<Item = Result<Bytes, GmailError>> + Send + 'static,
        total_size: u64,
    ) -> Result<HttpResponse, TransportError>
        // Step 1: Initialize resumable upload
        init_response <- self.send(init_request).await?

        IF init_response.status != StatusCode::OK THEN
            RETURN Err(TransportError::HttpError {
                status: init_response.status,
                body: String::from_utf8_lossy(&init_response.body).to_string(),
            })
        END IF

        // Get upload URI from response
        upload_uri <- init_response.headers
            .get("Location")
            .ok_or(TransportError::Other {
                reason: "Missing upload URI in resumable upload response"
            })?
            .to_str()?
            .to_string()

        self.logger.debug("Resumable upload initialized", {
            upload_uri: upload_uri,
            total_size: total_size,
        })

        // Step 2: Upload data in chunks
        uploaded <- 0u64

        WHILE let Some(chunk_result) = data.next().await DO
            chunk <- chunk_result.map_err(|e| TransportError::Other {
                reason: e.to_string()
            })?

            chunk_size <- chunk.len() as u64
            end_byte <- uploaded + chunk_size - 1

            // Build chunk upload request
            content_range <- format!("bytes {}-{}/{}", uploaded, end_byte, total_size)

            chunk_request <- HttpRequest {
                method: HttpMethod::PUT,
                url: Url::parse(&upload_uri)?,
                headers: {
                    let mut headers = HeaderMap::new();
                    headers.insert("Content-Length", chunk_size.to_string().parse()?);
                    headers.insert("Content-Range", content_range.parse()?);
                    headers
                },
                body: Some(RequestBody::Bytes(chunk)),
                timeout: None,
            }

            chunk_response <- self.send(chunk_request).await?

            // Check response status
            IF chunk_response.status == StatusCode::RESUME_INCOMPLETE THEN
                // Upload not complete, continue
                uploaded <- uploaded + chunk_size
                self.logger.debug("Chunk uploaded", {
                    uploaded: uploaded,
                    total: total_size,
                })
            ELSE IF chunk_response.status.is_success() THEN
                // Upload complete
                self.logger.info("Resumable upload complete", {
                    total_size: total_size,
                })
                RETURN Ok(chunk_response)
            ELSE
                RETURN Err(TransportError::HttpError {
                    status: chunk_response.status,
                    body: String::from_utf8_lossy(&chunk_response.body).to_string(),
                })
            END IF
        END WHILE

        Err(TransportError::Other {
            reason: "Upload stream ended before upload complete"
        })
    END FUNCTION
}
```

---

## 7. Request Builder

### 7.1 Gmail Request Builder

```pseudocode
STRUCT GmailRequestBuilder {
    base_url: Url,
    method: HttpMethod,
    path: String,
    query_params: Vec<(String, String)>,
    headers: HeaderMap,
    body: Option<RequestBody>,
    timeout: Option<Duration>,
}

IMPL GmailRequestBuilder {
    FUNCTION new(base_url: Url, method: HttpMethod, path: impl Into<String>) -> Self
        Self {
            base_url: base_url,
            method: method,
            path: path.into(),
            query_params: Vec::new(),
            headers: HeaderMap::new(),
            body: None,
            timeout: None,
        }
    END FUNCTION

    FUNCTION query_param(mut self, key: impl Into<String>, value: impl Into<String>) -> Self
        self.query_params.push((key.into(), value.into()))
        self
    END FUNCTION

    FUNCTION query_param_opt(mut self, key: impl Into<String>, value: Option<impl Into<String>>) -> Self
        IF let Some(v) = value THEN
            self.query_params.push((key.into(), v.into()))
        END IF
        self
    END FUNCTION

    FUNCTION query_params<K, V>(mut self, params: impl IntoIterator<Item = (K, V)>) -> Self
        WHERE K: Into<String>, V: Into<String>
        FOR (k, v) IN params DO
            self.query_params.push((k.into(), v.into()))
        END FOR
        self
    END FUNCTION

    FUNCTION header(mut self, key: impl Into<String>, value: impl Into<String>) -> Self
        self.headers.insert(key.into().parse().unwrap(), value.into().parse().unwrap())
        self
    END FUNCTION

    FUNCTION json_body<T: Serialize>(mut self, body: &T) -> Result<Self, GmailError>
        json_string <- serde_json::to_string(body)?
        self.body = Some(RequestBody::Json(serde_json::from_str(&json_string)?))
        self.headers.insert("Content-Type", "application/json".parse().unwrap())
        Ok(self)
    END FUNCTION

    FUNCTION raw_body(mut self, body: Bytes, content_type: &str) -> Self
        self.body = Some(RequestBody::Bytes(body))
        self.headers.insert("Content-Type", content_type.parse().unwrap())
        self
    END FUNCTION

    FUNCTION multipart_body(mut self, parts: Vec<MultipartPart>) -> Self
        self.body = Some(RequestBody::Multipart(parts))
        self
    END FUNCTION

    FUNCTION timeout(mut self, timeout: Duration) -> Self
        self.timeout = Some(timeout)
        self
    END FUNCTION

    FUNCTION build(self) -> Result<HttpRequest, GmailError>
        // Build URL with path and query params
        url <- self.base_url.join(&self.path)?

        IF NOT self.query_params.is_empty() THEN
            query_string <- self.query_params
                .iter()
                .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(v)))
                .collect::<Vec<_>>()
                .join("&")

            url.set_query(Some(&query_string))
        END IF

        Ok(HttpRequest {
            method: self.method,
            url: url,
            headers: self.headers,
            body: self.body,
            timeout: self.timeout,
        })
    END FUNCTION
}
```

### 7.2 Request Helpers

```pseudocode
FUNCTION build_messages_list_request(
    base_url: &Url,
    user_id: &str,
    params: Option<&ListMessagesParams>,
) -> Result<HttpRequest, GmailError>
    builder <- GmailRequestBuilder::new(
        base_url.clone(),
        HttpMethod::GET,
        format!("/gmail/v1/users/{}/messages", user_id),
    )

    IF let Some(p) = params THEN
        builder <- builder
            .query_param_opt("maxResults", p.max_results.map(|v| v.to_string()))
            .query_param_opt("pageToken", p.page_token.clone())
            .query_param_opt("q", p.q.clone())
            .query_param_opt("includeSpamTrash", p.include_spam_trash.map(|v| v.to_string()))

        IF let Some(label_ids) = &p.label_ids THEN
            FOR label_id IN label_ids DO
                builder <- builder.query_param("labelIds", label_id)
            END FOR
        END IF
    END IF

    builder.build()
END FUNCTION

FUNCTION build_message_get_request(
    base_url: &Url,
    user_id: &str,
    message_id: &str,
    format: Option<MessageFormat>,
) -> Result<HttpRequest, GmailError>
    builder <- GmailRequestBuilder::new(
        base_url.clone(),
        HttpMethod::GET,
        format!("/gmail/v1/users/{}/messages/{}", user_id, message_id),
    )

    IF let Some(fmt) = format THEN
        format_str <- MATCH fmt {
            MessageFormat::Minimal => "minimal",
            MessageFormat::Full => "full",
            MessageFormat::Raw => "raw",
            MessageFormat::Metadata => "metadata",
        }
        builder <- builder.query_param("format", format_str)
    END IF

    builder.build()
END FUNCTION

FUNCTION build_message_send_request(
    base_url: &Url,
    user_id: &str,
    request: &SendMessageRequest,
    upload_type: UploadType,
) -> Result<HttpRequest, GmailError>
    MATCH upload_type {
        UploadType::Simple => {
            GmailRequestBuilder::new(
                base_url.clone(),
                HttpMethod::POST,
                format!("/gmail/v1/users/{}/messages/send", user_id),
            )
            .json_body(request)?
            .build()
        }

        UploadType::Multipart => {
            // Build multipart request with metadata and raw message
            metadata <- serde_json::json!({
                "threadId": request.thread_id,
            })

            parts <- vec![
                MultipartPart {
                    content_type: "application/json".to_string(),
                    content: serde_json::to_vec(&metadata)?,
                },
                MultipartPart {
                    content_type: "message/rfc822".to_string(),
                    content: base64::decode_config(&request.raw, base64::URL_SAFE)?,
                },
            ]

            GmailRequestBuilder::new(
                base_url.clone(),
                HttpMethod::POST,
                format!("/upload/gmail/v1/users/{}/messages/send", user_id),
            )
            .query_param("uploadType", "multipart")
            .multipart_body(parts)
            .build()
        }

        UploadType::Resumable => {
            // Initialize resumable upload
            GmailRequestBuilder::new(
                base_url.clone(),
                HttpMethod::POST,
                format!("/upload/gmail/v1/users/{}/messages/send", user_id),
            )
            .query_param("uploadType", "resumable")
            .header("X-Upload-Content-Type", "message/rfc822")
            .header("X-Upload-Content-Length", request.raw.len().to_string())
            .json_body(&serde_json::json!({
                "threadId": request.thread_id,
            }))?
            .build()
        }
    }
END FUNCTION
```

---

## 8. Response Parser

### 8.1 Gmail Response Parser

```pseudocode
STRUCT GmailResponseParser {
    logger: Arc<dyn Logger>,
}

IMPL GmailResponseParser {
    FUNCTION new(logger: Arc<dyn Logger>) -> Self
        Self { logger }
    END FUNCTION

    FUNCTION parse<T: DeserializeOwned>(self, response: &HttpResponse) -> Result<T, GmailError>
        // Check for error response
        IF NOT response.status.is_success() THEN
            RETURN Err(self.parse_error_response(response)?)
        END IF

        // Parse successful response
        TRY
            result <- serde_json::from_slice::<T>(&response.body)?
            Ok(result)
        CATCH serde_error AS e
            self.logger.error("Failed to parse response", {
                error: e.to_string(),
                body: String::from_utf8_lossy(&response.body).to_string(),
            })
            Err(GmailError::Response(ResponseError::DeserializationError {
                message: e.to_string()
            }))
        END TRY
    END FUNCTION

    FUNCTION parse_error_response(self, response: &HttpResponse) -> Result<GmailError, GmailError>
        // Try to parse as Google API error
        TRY
            error_response <- serde_json::from_slice::<GoogleApiErrorResponse>(&response.body)?
            error <- error_response.error

            RETURN Ok(self.map_google_error(response.status, &error))
        CATCH _ AS e
            // Not a standard Google API error, create generic error
            RETURN Ok(self.map_status_to_error(
                response.status,
                String::from_utf8_lossy(&response.body).to_string(),
            ))
        END TRY
    END FUNCTION

    FUNCTION map_google_error(self, status: StatusCode, error: &GoogleApiError) -> GmailError
        // Extract error details
        domain <- error.errors.first().map(|e| e.domain.clone()).unwrap_or_default()
        reason <- error.errors.first().map(|e| e.reason.clone()).unwrap_or_default()
        message <- error.message.clone()

        MATCH (status.as_u16(), reason.as_str()) {
            (400, "invalidArgument") | (400, "badRequest") => {
                GmailError::Request(RequestError::InvalidParameter {
                    message: message
                })
            }

            (400, "failedPrecondition") => {
                GmailError::Request(RequestError::ValidationError {
                    message: message
                })
            }

            (401, _) => {
                GmailError::Authentication(AuthenticationError::InvalidCredentials {
                    message: message
                })
            }

            (403, "accessNotConfigured") => {
                GmailError::Authorization(AuthorizationError::AccessDenied {
                    message: message,
                    domain: domain,
                    reason: reason,
                })
            }

            (403, "domainPolicy") => {
                GmailError::Authorization(AuthorizationError::DomainPolicy {
                    message: message,
                    domain: domain,
                    reason: reason,
                })
            }

            (403, "dailyLimitExceeded") => {
                GmailError::Quota(QuotaError::DailyLimitExceeded {
                    message: message,
                    domain: domain,
                    reason: reason,
                })
            }

            (403, "userRateLimitExceeded") | (403, "rateLimitExceeded") => {
                GmailError::Quota(QuotaError::UserRateLimitExceeded {
                    message: message,
                    domain: domain,
                    reason: reason,
                    retry_after: None,
                })
            }

            (404, _) => {
                // Determine resource type from error details
                IF message.contains("message") OR message.contains("Message") THEN
                    GmailError::Resource(ResourceError::MessageNotFound {
                        message_id: extract_id_from_message(&message),
                    })
                ELSE IF message.contains("thread") OR message.contains("Thread") THEN
                    GmailError::Resource(ResourceError::ThreadNotFound {
                        thread_id: extract_id_from_message(&message),
                    })
                ELSE IF message.contains("label") OR message.contains("Label") THEN
                    GmailError::Resource(ResourceError::LabelNotFound {
                        label_id: extract_id_from_message(&message),
                    })
                ELSE IF message.contains("draft") OR message.contains("Draft") THEN
                    GmailError::Resource(ResourceError::DraftNotFound {
                        draft_id: extract_id_from_message(&message),
                    })
                ELSE
                    GmailError::Resource(ResourceError::MessageNotFound {
                        message_id: "unknown".to_string(),
                    })
                END IF
            }

            (429, _) => {
                GmailError::Quota(QuotaError::UserRateLimitExceeded {
                    message: message,
                    domain: domain,
                    reason: reason,
                    retry_after: None,  // Would need to check Retry-After header
                })
            }

            (500, _) => {
                GmailError::Server(ServerError::InternalError {
                    message: message
                })
            }

            (503, _) => {
                GmailError::Server(ServerError::ServiceUnavailable {
                    message: message,
                    retry_after: None,
                })
            }

            _ => {
                GmailError::Server(ServerError::BackendError {
                    message: format!("Unexpected error: {} - {}", status, message)
                })
            }
        }
    END FUNCTION

    FUNCTION map_status_to_error(self, status: StatusCode, body: String) -> GmailError
        MATCH status.as_u16() {
            400 => GmailError::Request(RequestError::ValidationError { message: body }),
            401 => GmailError::Authentication(AuthenticationError::InvalidCredentials { message: body }),
            403 => GmailError::Authorization(AuthorizationError::AccessDenied {
                message: body,
                domain: String::new(),
                reason: String::new(),
            }),
            404 => GmailError::Resource(ResourceError::MessageNotFound { message_id: "unknown".to_string() }),
            429 => GmailError::Quota(QuotaError::UserRateLimitExceeded {
                message: body,
                domain: String::new(),
                reason: String::new(),
                retry_after: None,
            }),
            500 => GmailError::Server(ServerError::InternalError { message: body }),
            503 => GmailError::Server(ServerError::ServiceUnavailable {
                message: body,
                retry_after: None,
            }),
            _ => GmailError::Server(ServerError::BackendError { message: body }),
        }
    END FUNCTION
}

STRUCT GoogleApiErrorResponse {
    error: GoogleApiError,
}

STRUCT GoogleApiError {
    code: i32,
    message: String,
    errors: Vec<GoogleApiErrorDetail>,
    status: Option<String>,
}

STRUCT GoogleApiErrorDetail {
    domain: String,
    reason: String,
    message: String,
    location_type: Option<String>,
    location: Option<String>,
}
```

---

## 9. Error Handling

### 9.1 Request Execution with Resilience

```pseudocode
STRUCT RequestExecutor {
    transport: Arc<dyn HttpTransport>,
    auth_provider: Arc<dyn AuthProvider>,
    retry_executor: Arc<RetryExecutor>,
    circuit_breaker: Arc<CircuitBreaker>,
    rate_limiter: Option<Arc<RateLimiter>>,
    response_parser: GmailResponseParser,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,
}

IMPL RequestExecutor {
    ASYNC FUNCTION execute<T: DeserializeOwned>(
        self,
        request: HttpRequest,
        operation: &str,
        span_attributes: HashMap<String, String>,
    ) -> Result<T, GmailError>
        // Create trace span
        span <- self.tracer.start_span(operation, span_attributes)

        // Check circuit breaker
        IF NOT self.circuit_breaker.allow_request() THEN
            span.set_status(SpanStatus::Error)
            span.set_attribute("error.type", "circuit_breaker_open")
            RETURN Err(GmailError::Server(ServerError::ServiceUnavailable {
                message: "Circuit breaker is open".to_string(),
                retry_after: Some(self.circuit_breaker.time_until_half_open()),
            }))
        END IF

        // Apply rate limiting
        IF let Some(limiter) = &self.rate_limiter THEN
            TRY
                limiter.acquire().await?
            CATCH _ AS e
                span.set_status(SpanStatus::Error)
                span.set_attribute("error.type", "rate_limit")
                RETURN Err(GmailError::Quota(QuotaError::ConcurrentLimitExceeded {
                    message: "Rate limit exceeded".to_string(),
                    domain: "client".to_string(),
                    reason: "rateLimitExceeded".to_string(),
                    retry_after: Some(Duration::from_secs(1)),
                }))
            END TRY
        END IF

        // Execute with retry
        result <- self.retry_executor.execute(|| async {
            self.execute_once::<T>(&request, &span).await
        }).await

        // Record result
        MATCH &result {
            Ok(_) => {
                self.circuit_breaker.record_success()
                span.set_status(SpanStatus::Ok)
            }
            Err(e) => {
                IF e.is_retryable() THEN
                    self.circuit_breaker.record_failure()
                END IF
                span.set_status(SpanStatus::Error)
                span.set_attribute("error.type", format!("{:?}", e))
            }
        }

        span.end()
        result
    END FUNCTION

    ASYNC FUNCTION execute_once<T: DeserializeOwned>(
        self,
        request: &HttpRequest,
        span: &Span,
    ) -> Result<T, GmailError>
        // Get auth header
        auth_header <- self.auth_provider.get_auth_header().await?

        // Clone and add auth header to request
        request_with_auth <- request.clone()
        request_with_auth.headers.insert("Authorization", auth_header.parse()?)

        // Send request
        start_time <- Instant::now()
        response <- self.transport.send(request_with_auth).await
            .map_err(|e| self.map_transport_error(e))?

        elapsed <- start_time.elapsed()

        // Record metrics
        span.set_attribute("http.status_code", response.status.as_u16().to_string())
        span.set_attribute("http.response_size", response.body.len().to_string())
        span.set_attribute("http.duration_ms", elapsed.as_millis().to_string())

        // Parse response
        self.response_parser.parse(&response)
    END FUNCTION

    FUNCTION map_transport_error(self, error: TransportError) -> GmailError
        MATCH error {
            TransportError::Timeout => {
                GmailError::Network(NetworkError::Timeout {
                    message: "Request timed out".to_string()
                })
            }
            TransportError::ConnectionFailed { reason } => {
                GmailError::Network(NetworkError::ConnectionFailed {
                    message: reason
                })
            }
            TransportError::TlsError { reason } => {
                GmailError::Network(NetworkError::TlsError {
                    message: reason
                })
            }
            TransportError::HttpError { status, body } => {
                self.response_parser.map_status_to_error(status, body)
            }
            TransportError::Other { reason } => {
                GmailError::Network(NetworkError::ConnectionFailed {
                    message: reason
                })
            }
        }
    END FUNCTION
}
```

### 9.2 Error Recovery and Retry Logic

```pseudocode
FUNCTION create_gmail_retry_executor(config: RetryConfig) -> RetryExecutor
    RetryExecutor::new(RetryConfig {
        max_retries: config.max_retries,
        initial_backoff: config.initial_backoff,
        max_backoff: config.max_backoff,
        backoff_multiplier: config.backoff_multiplier,
        jitter: config.jitter,

        should_retry: |error: &GmailError, attempt: u32| {
            // Check if error is retryable
            IF NOT error.is_retryable() THEN
                RETURN RetryDecision::DoNotRetry
            END IF

            // Check max retries
            IF attempt >= config.max_retries THEN
                RETURN RetryDecision::DoNotRetry
            END IF

            // Check for retry-after hint
            IF let Some(retry_after) = error.retry_after() THEN
                RETURN RetryDecision::RetryAfter(retry_after)
            END IF

            // Special handling for token expiry
            IF MATCHES!(error, GmailError::Authentication(AuthenticationError::ExpiredToken { .. })) THEN
                // Retry immediately after refresh
                RETURN RetryDecision::RetryAfter(Duration::ZERO)
            END IF

            RetryDecision::RetryWithBackoff
        },

        on_retry: |error: &GmailError, attempt: u32, delay: Duration| {
            // Log retry attempt
            log::warn!("Retrying Gmail request", {
                attempt: attempt,
                delay_ms: delay.as_millis(),
                error: error.to_string(),
            })

            // Refresh token if needed
            IF MATCHES!(error, GmailError::Authentication(AuthenticationError::ExpiredToken { .. })) THEN
                // Token refresh will happen on next request automatically
            END IF
        },
    })
END FUNCTION

ENUM RetryDecision {
    DoNotRetry,
    RetryWithBackoff,
    RetryAfter(Duration),
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial pseudocode - Part 1 |

---

**End of Part 1**

*Part 2 will cover Message and Thread Operations, including MIME construction and Base64url encoding.*
