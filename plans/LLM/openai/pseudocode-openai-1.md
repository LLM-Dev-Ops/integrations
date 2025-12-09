# OpenAI Integration Module - Pseudocode (Part 1)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-08
**Module:** `integrations/openai`
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

This document provides pseudocode algorithms for the core infrastructure components of the OpenAI Integration Module. The pseudocode is language-agnostic but maps directly to Rust and TypeScript implementations.

### Pseudocode Conventions

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

---

## 2. Client Initialization

### 2.1 Client Factory

```
FUNCTION create_openai_client(config: OpenAIConfig) -> Result<OpenAIClient, OpenAIError>
  // Step 1: Validate configuration
  validation_result <- validate_config(config)
  IF validation_result IS Error THEN
    RETURN Error(ConfigurationError::InvalidConfiguration(validation_result.message))
  END IF

  // Step 2: Initialize dependencies from primitives
  logger <- get_logger_from_primitive("openai")
  tracer <- get_tracer_from_primitive("openai")

  // Step 3: Build retry executor from primitive
  retry_config <- RetryConfig {
    max_retries: config.max_retries,
    initial_backoff: 500ms,
    max_backoff: 60s,
    backoff_multiplier: 2.0,
    jitter: 0.1
  }
  retry_executor <- create_retry_executor(retry_config)

  // Step 4: Build rate limiter from primitive
  rate_limiter <- create_rate_limiter(RateLimitConfig {
    requests_per_minute: config.rpm_limit OR DEFAULT_RPM,
    tokens_per_minute: config.tpm_limit OR DEFAULT_TPM,
    auto_adjust: true
  })

  // Step 5: Build circuit breaker from primitive
  circuit_breaker <- create_circuit_breaker(CircuitBreakerConfig {
    failure_threshold: 5,
    success_threshold: 3,
    failure_window: 60s,
    recovery_timeout: 30s
  })

  // Step 6: Build HTTP transport
  transport <- create_http_transport(HttpTransportConfig {
    timeout: config.timeout,
    tls_config: TlsConfig::default(),
    proxy: config.proxy
  })

  // Step 7: Build auth manager
  auth_manager <- create_auth_manager(
    api_key: config.api_key,
    organization_id: config.organization_id,
    project_id: config.project_id
  )

  // Step 8: Assemble client
  client <- OpenAIClientImpl {
    config: config,
    transport: transport,
    auth_manager: auth_manager,
    retry_executor: retry_executor,
    rate_limiter: rate_limiter,
    circuit_breaker: circuit_breaker,
    logger: logger,
    tracer: tracer,

    // Lazy-initialized services
    chat_service: None,
    embeddings_service: None,
    files_service: None,
    batches_service: None,
    models_service: None,
    images_service: None,
    audio_service: None,
    moderations_service: None,
    fine_tuning_service: None,
    assistants_service: None
  }

  logger.info("OpenAI client initialized", {
    base_url: config.base_url,
    organization_id: config.organization_id IS Some
  })

  RETURN Ok(client)
END FUNCTION
```

### 2.2 Client from Environment

```
FUNCTION create_openai_client_from_env() -> Result<OpenAIClient, OpenAIError>
  // Step 1: Read required API key
  api_key <- read_env("OPENAI_API_KEY")
  IF api_key IS None THEN
    RETURN Error(ConfigurationError::MissingApiKey)
  END IF

  // Step 2: Read optional configuration
  organization_id <- read_env("OPENAI_ORG_ID")
  project_id <- read_env("OPENAI_PROJECT_ID")
  base_url <- read_env("OPENAI_BASE_URL")
  timeout_str <- read_env("OPENAI_TIMEOUT")
  max_retries_str <- read_env("OPENAI_MAX_RETRIES")

  // Step 3: Parse optional values with defaults
  timeout <- IF timeout_str IS Some THEN
    parse_duration(timeout_str) OR DEFAULT_TIMEOUT
  ELSE
    DEFAULT_TIMEOUT
  END IF

  max_retries <- IF max_retries_str IS Some THEN
    parse_u32(max_retries_str) OR DEFAULT_MAX_RETRIES
  ELSE
    DEFAULT_MAX_RETRIES
  END IF

  // Step 4: Build config
  config <- OpenAIConfig {
    api_key: SecretString::new(api_key),
    organization_id: organization_id,
    project_id: project_id,
    base_url: base_url OR DEFAULT_BASE_URL,
    timeout: timeout,
    max_retries: max_retries,
    default_headers: HeaderMap::new()
  }

  RETURN create_openai_client(config)
END FUNCTION
```

### 2.3 Service Accessor Pattern

```
FUNCTION client.chat() -> ChatCompletionService
  // Lazy initialization with double-checked locking
  IF self.chat_service IS None THEN
    LOCK self.service_mutex
      IF self.chat_service IS None THEN
        self.chat_service <- Some(ChatCompletionServiceImpl::new(
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

  RETURN self.chat_service.unwrap()
END FUNCTION

// Similar pattern for all other services:
// client.embeddings(), client.files(), client.batches(), etc.
```

---

## 3. Configuration Management

### 3.1 Configuration Validation

```
FUNCTION validate_config(config: OpenAIConfig) -> Result<(), ValidationError>
  errors <- []

  // Validate API key
  IF config.api_key.is_empty() THEN
    errors.push("API key is required")
  ELSE IF NOT config.api_key.starts_with("sk-") THEN
    // Warning only - some deployments use different formats
    log_warning("API key does not match expected format (sk-*)")
  END IF

  // Validate base URL
  IF config.base_url IS Some THEN
    TRY
      parsed_url <- parse_url(config.base_url)
      IF parsed_url.scheme NOT IN ["http", "https"] THEN
        errors.push("Base URL must use http or https scheme")
      END IF
    CATCH ParseError
      errors.push("Invalid base URL format")
    END TRY
  END IF

  // Validate timeout
  IF config.timeout < 1s THEN
    errors.push("Timeout must be at least 1 second")
  ELSE IF config.timeout > 600s THEN
    errors.push("Timeout cannot exceed 600 seconds")
  END IF

  // Validate max retries
  IF config.max_retries > 10 THEN
    errors.push("Max retries cannot exceed 10")
  END IF

  // Return result
  IF errors.is_empty() THEN
    RETURN Ok(())
  ELSE
    RETURN Error(ValidationError { messages: errors })
  END IF
END FUNCTION
```

### 3.2 Configuration Merging

```
FUNCTION merge_configs(base: OpenAIConfig, overrides: PartialConfig) -> OpenAIConfig
  RETURN OpenAIConfig {
    api_key: overrides.api_key OR base.api_key,
    organization_id: overrides.organization_id OR base.organization_id,
    project_id: overrides.project_id OR base.project_id,
    base_url: overrides.base_url OR base.base_url,
    timeout: overrides.timeout OR base.timeout,
    max_retries: overrides.max_retries OR base.max_retries,
    default_headers: merge_headers(base.default_headers, overrides.default_headers)
  }
END FUNCTION

FUNCTION merge_headers(base: HeaderMap, overrides: HeaderMap) -> HeaderMap
  result <- base.clone()
  FOR EACH (key, value) IN overrides DO
    result.insert(key, value)  // Override existing or add new
  END FOR
  RETURN result
END FUNCTION
```

---

## 4. HTTP Transport Layer

### 4.1 Transport Initialization

```
FUNCTION create_http_transport(config: HttpTransportConfig) -> HttpTransport
  // Build TLS configuration
  tls_config <- TlsConfigBuilder::new()
    .min_protocol_version(TlsVersion::TLS_1_2)
    .enable_sni(true)

  IF config.tls_config.custom_ca_certs IS Some THEN
    FOR EACH cert IN config.tls_config.custom_ca_certs DO
      tls_config.add_root_certificate(cert)
    END FOR
  END IF

  IF NOT config.tls_config.verify_certificates THEN
    // Only allow in development
    IF is_production_environment() THEN
      PANIC("Certificate verification cannot be disabled in production")
    END IF
    tls_config.danger_accept_invalid_certs(true)
  END IF

  // Build HTTP client
  client_builder <- HttpClientBuilder::new()
    .timeout(config.timeout)
    .connect_timeout(config.connect_timeout OR 10s)
    .pool_idle_timeout(90s)
    .pool_max_idle_per_host(10)
    .tls_config(tls_config.build())
    .user_agent(format("openai-integration/{}", VERSION))

  IF config.proxy IS Some THEN
    client_builder.proxy(config.proxy)
  END IF

  RETURN HttpTransportImpl {
    client: client_builder.build(),
    default_timeout: config.timeout
  }
END FUNCTION
```

### 4.2 Request Execution

```
FUNCTION transport.send(request: HttpRequest) -> Result<HttpResponse, NetworkError>
  // Start timing
  start_time <- now()

  TRY
    // Execute HTTP request
    response <- self.client.execute(request).await

    // Record latency
    latency <- now() - start_time

    RETURN Ok(HttpResponse {
      status: response.status(),
      headers: response.headers().clone(),
      body: response.bytes().await?,
      latency: latency
    })

  CATCH ConnectError AS e
    RETURN Error(NetworkError::ConnectionFailed {
      message: e.to_string(),
      is_dns: e.is_dns_error()
    })

  CATCH TimeoutError
    RETURN Error(NetworkError::Timeout {
      duration: self.default_timeout
    })

  CATCH TlsError AS e
    RETURN Error(NetworkError::SslError {
      message: e.to_string()
    })

  CATCH IoError AS e
    RETURN Error(NetworkError::ConnectionFailed {
      message: e.to_string(),
      is_dns: false
    })
  END TRY
END FUNCTION
```

### 4.3 Connection Pooling

```
FUNCTION transport.get_connection(host: String) -> Result<Connection, NetworkError>
  // Check pool for existing connection
  pool_key <- format("{}:{}", host, port)

  LOCK self.connection_pool
    IF self.connection_pool.contains(pool_key) THEN
      connection <- self.connection_pool.get(pool_key)
      IF connection.is_healthy() THEN
        RETURN Ok(connection)
      ELSE
        // Remove unhealthy connection
        self.connection_pool.remove(pool_key)
      END IF
    END IF
  END LOCK

  // Create new connection
  new_connection <- create_connection(host, port).await?

  LOCK self.connection_pool
    // Double-check another thread didn't create one
    IF NOT self.connection_pool.contains(pool_key) THEN
      self.connection_pool.insert(pool_key, new_connection.clone())
    END IF
  END LOCK

  RETURN Ok(new_connection)
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

  // Step 1: Build URL
  url <- base_url.join(endpoint)?

  // Step 2: Create request builder
  request_builder <- HttpRequest::builder()
    .method(method)
    .url(url)

  // Step 3: Add authentication headers
  auth_headers <- auth_manager.get_headers()
  FOR EACH (key, value) IN auth_headers DO
    request_builder.header(key, value)
  END FOR

  // Step 4: Add standard headers
  request_builder.header("Content-Type", "application/json")
  request_builder.header("Accept", "application/json")

  // Step 5: Add extra headers
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

### 5.2 Multipart Request Building (for Files)

```
FUNCTION build_multipart_request(
  endpoint: String,
  base_url: Url,
  auth_manager: AuthManager,
  parts: Vec<MultipartPart>
) -> Result<HttpRequest, RequestError>

  // Step 1: Build URL
  url <- base_url.join(endpoint)?

  // Step 2: Create multipart form
  form <- MultipartForm::new()

  FOR EACH part IN parts DO
    MATCH part.content_type
      CASE "file":
        form.add_file(
          name: part.name,
          filename: part.filename,
          content: part.data,
          mime_type: part.mime_type OR "application/octet-stream"
        )
      CASE "text":
        form.add_text(
          name: part.name,
          value: part.data
        )
      CASE "json":
        form.add_text(
          name: part.name,
          value: serialize_json(part.data)?
        )
    END MATCH
  END FOR

  // Step 3: Build request with multipart body
  request_builder <- HttpRequest::builder()
    .method(POST)
    .url(url)

  // Step 4: Add auth headers
  auth_headers <- auth_manager.get_headers()
  FOR EACH (key, value) IN auth_headers DO
    request_builder.header(key, value)
  END FOR

  // Step 5: Set multipart body (sets Content-Type automatically with boundary)
  request_builder.multipart(form)

  RETURN Ok(request_builder.build())
END FUNCTION
```

### 5.3 Streaming Request Building

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
    logger.warn("Unexpected content type", { content_type: content_type })
    // Continue anyway - some responses may be valid JSON without header
  END IF

  // Step 2: Get body bytes
  body_bytes <- response.body

  // Step 3: Attempt deserialization
  TRY
    parsed <- deserialize_json::<T>(body_bytes)?
    RETURN Ok(parsed)
  CATCH DeserializeError AS e
    // Try to extract error details from raw JSON
    TRY
      error_response <- deserialize_json::<OpenAIErrorResponse>(body_bytes)?
      RETURN Error(ResponseError::ApiError {
        message: error_response.error.message,
        error_type: error_response.error.type,
        code: error_response.error.code,
        param: error_response.error.param
      })
    CATCH
      // Could not parse as error either
      logger.error("Failed to parse response", {
        error: e.to_string(),
        body_preview: truncate(body_bytes.to_string(), 500)
      })
      RETURN Error(ResponseError::DeserializationError {
        message: e.to_string(),
        body_preview: truncate(body_bytes.to_string(), 200)
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
) -> OpenAIError

  // Try to parse as OpenAI error response
  TRY
    error_response <- deserialize_json::<OpenAIErrorResponse>(body)?
    error_info <- error_response.error

    // Map to specific error type based on status and error info
    MATCH status.as_u16()
      CASE 400:
        RETURN RequestError::ValidationError {
          message: error_info.message,
          param: error_info.param,
          code: error_info.code
        }

      CASE 401:
        IF error_info.code == "invalid_api_key" THEN
          RETURN AuthenticationError::InvalidApiKey
        ELSE
          RETURN AuthenticationError::InsufficientPermissions {
            required: error_info.message
          }
        END IF

      CASE 403:
        RETURN AuthenticationError::InsufficientPermissions {
          required: error_info.message
        }

      CASE 404:
        RETURN ResourceError::NotFound {
          resource: error_info.param OR "unknown"
        }

      CASE 409:
        RETURN ResourceError::AlreadyExists {
          resource: error_info.param OR "unknown"
        }

      CASE 422:
        RETURN RequestError::ValidationError {
          message: error_info.message,
          param: error_info.param,
          code: error_info.code
        }

      CASE 429:
        retry_after <- parse_retry_after(headers)
        IF error_info.code == "rate_limit_exceeded" THEN
          RETURN RateLimitError::TooManyRequests { retry_after }
        ELSE IF error_info.code == "insufficient_quota" THEN
          RETURN RateLimitError::QuotaExceeded { message: error_info.message }
        ELSE
          RETURN RateLimitError::TooManyRequests { retry_after }
        END IF

      CASE 500:
        RETURN ServerError::InternalServerError

      CASE 502:
        RETURN ServerError::BadGateway

      CASE 503:
        retry_after <- parse_retry_after(headers)
        RETURN ServerError::ServiceUnavailable { retry_after }

      CASE _:
        RETURN ServerError::InternalServerError
    END MATCH

  CATCH DeserializeError
    // Could not parse error body - create generic error
    RETURN ResponseError::UnexpectedResponse {
      status: status.as_u16(),
      body_preview: truncate(body.to_string(), 200)
    }
  END TRY
END FUNCTION

FUNCTION parse_retry_after(headers: HeaderMap) -> Option<Duration>
  retry_after_header <- headers.get("Retry-After")
  IF retry_after_header IS None THEN
    // Try OpenAI-specific header
    retry_after_header <- headers.get("x-ratelimit-reset-requests")
  END IF

  IF retry_after_header IS Some THEN
    // Could be seconds or HTTP date
    TRY
      seconds <- parse_u64(retry_after_header)
      RETURN Some(Duration::from_secs(seconds))
    CATCH
      TRY
        date <- parse_http_date(retry_after_header)
        RETURN Some(date - now())
      CATCH
        RETURN None
      END TRY
    END TRY
  END IF

  RETURN None
END FUNCTION
```

### 6.3 Rate Limit Header Parsing

```
FUNCTION parse_rate_limit_headers(headers: HeaderMap) -> RateLimitHeaders
  RETURN RateLimitHeaders {
    limit_requests: headers.get("x-ratelimit-limit-requests")
      .and_then(parse_u32),

    limit_tokens: headers.get("x-ratelimit-limit-tokens")
      .and_then(parse_u32),

    remaining_requests: headers.get("x-ratelimit-remaining-requests")
      .and_then(parse_u32),

    remaining_tokens: headers.get("x-ratelimit-remaining-tokens")
      .and_then(parse_u32),

    reset_requests: headers.get("x-ratelimit-reset-requests")
      .and_then(parse_duration_string),

    reset_tokens: headers.get("x-ratelimit-reset-tokens")
      .and_then(parse_duration_string)
  }
END FUNCTION

FUNCTION parse_duration_string(s: String) -> Option<Duration>
  // Format: "6m0s" or "100ms" or "1h30m"
  total_ms <- 0

  // Extract hours
  IF s.contains("h") THEN
    parts <- s.split("h")
    hours <- parse_u64(parts[0])?
    total_ms <- total_ms + (hours * 3600000)
    s <- parts[1]
  END IF

  // Extract minutes
  IF s.contains("m") AND NOT s.contains("ms") THEN
    parts <- s.split("m")
    minutes <- parse_u64(parts[0])?
    total_ms <- total_ms + (minutes * 60000)
    s <- parts[1]
  END IF

  // Extract seconds
  IF s.contains("s") AND NOT s.contains("ms") THEN
    parts <- s.split("s")
    seconds <- parse_u64(parts[0])?
    total_ms <- total_ms + (seconds * 1000)
    s <- parts[1]
  END IF

  // Extract milliseconds
  IF s.contains("ms") THEN
    ms <- parse_u64(s.replace("ms", ""))?
    total_ms <- total_ms + ms
  END IF

  IF total_ms > 0 THEN
    RETURN Some(Duration::from_millis(total_ms))
  ELSE
    RETURN None
  END IF
END FUNCTION
```

---

## 7. Authentication Manager

### 7.1 Auth Manager Initialization

```
FUNCTION create_auth_manager(
  api_key: SecretString,
  organization_id: Option<String>,
  project_id: Option<String>
) -> AuthManager

  RETURN AuthManager {
    api_key: api_key,
    organization_id: organization_id,
    project_id: project_id
  }
END FUNCTION
```

### 7.2 Header Generation

```
FUNCTION auth_manager.get_headers() -> HeaderMap
  headers <- HeaderMap::new()

  // Add Authorization header (never logged)
  headers.insert(
    "Authorization",
    format("Bearer {}", self.api_key.expose_secret())
  )

  // Add Organization header if present
  IF self.organization_id IS Some THEN
    headers.insert("OpenAI-Organization", self.organization_id.unwrap())
  END IF

  // Add Project header if present
  IF self.project_id IS Some THEN
    headers.insert("OpenAI-Project", self.project_id.unwrap())
  END IF

  RETURN headers
END FUNCTION
```

### 7.3 Header Sanitization for Logging

```
FUNCTION auth_manager.sanitize_headers_for_logging(headers: HeaderMap) -> HashMap<String, String>
  CONST SENSITIVE_HEADERS = [
    "authorization",
    "x-api-key",
    "openai-organization",
    "openai-project"
  ]

  sanitized <- HashMap::new()

  FOR EACH (key, value) IN headers DO
    key_lower <- key.to_lowercase()

    IF key_lower IN SENSITIVE_HEADERS THEN
      sanitized.insert(key_lower, "[REDACTED]")
    ELSE
      sanitized.insert(key_lower, value.to_string())
    END IF
  END FOR

  RETURN sanitized
END FUNCTION
```

### 7.4 API Key Validation

```
FUNCTION auth_manager.validate_api_key() -> Result<(), ConfigurationError>
  key <- self.api_key.expose_secret()

  // Check not empty
  IF key.is_empty() THEN
    RETURN Error(ConfigurationError::MissingApiKey)
  END IF

  // Check format (warning only for flexibility)
  IF NOT key.starts_with("sk-") THEN
    log_warning("API key format unexpected - may be valid for custom deployments")
  END IF

  // Check minimum length
  IF key.len() < 20 THEN
    RETURN Error(ConfigurationError::InvalidConfiguration {
      message: "API key appears too short"
    })
  END IF

  RETURN Ok(())
END FUNCTION
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-08 | SPARC Generator | Initial pseudocode (Part 1) |

---

**Continued in Part 2: Chat Completions, Embeddings, and Models APIs**
