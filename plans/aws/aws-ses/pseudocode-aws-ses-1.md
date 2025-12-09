# AWS SES Integration Module - Pseudocode (Part 1)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/aws-ses`
**File:** 1 of 4 - Core Infrastructure

---

## Table of Contents (Part 1)

1. [Overview](#1-overview)
2. [Client Initialization](#2-client-initialization)
3. [Configuration Management](#3-configuration-management)
4. [HTTP Transport Layer](#4-http-transport-layer)
5. [Request Builder](#5-request-builder)
6. [Response Parser](#6-response-parser)
7. [AWS Signature V4 Signer](#7-aws-signature-v4-signer)
8. [Credentials Provider](#8-credentials-provider)

---

## 1. Overview

This document provides pseudocode algorithms for the core infrastructure components of the AWS SES Integration Module. The pseudocode is language-agnostic but maps directly to Rust and TypeScript implementations.

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

### Constants

```
CONST SES_SERVICE_NAME <- "ses"
CONST SES_API_VERSION <- "2019-09-27"
CONST DEFAULT_REGION <- "us-east-1"
CONST DEFAULT_TIMEOUT <- 30s
CONST DEFAULT_MAX_RETRIES <- 3
CONST MAX_RECIPIENTS_PER_EMAIL <- 50
CONST MAX_MESSAGE_SIZE_BYTES <- 10 * 1024 * 1024  // 10 MB
CONST MAX_BULK_EMAIL_ENTRIES <- 50
CONST MAX_TEMPLATE_SIZE_BYTES <- 500 * 1024  // 500 KB
```

---

## 2. Client Initialization

### 2.1 Client Factory

```
FUNCTION create_ses_client(config: SesConfig) -> Result<SesClient, SesError>
  // Step 1: Validate configuration
  validation_result <- validate_config(config)
  IF validation_result IS Error THEN
    RETURN Error(ConfigurationError::InvalidConfiguration(validation_result.message))
  END IF

  // Step 2: Initialize dependencies from primitives
  logger <- get_logger_from_primitive("ses")
  tracer <- get_tracer_from_primitive("ses")

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
  rate_limiter <- IF config.rate_limit_config IS Some THEN
    create_rate_limiter(config.rate_limit_config)
  ELSE
    create_rate_limiter(RateLimitConfig {
      emails_per_second: 1,  // SES sandbox default
      max_concurrent_requests: 10
    })
  END IF

  // Step 5: Build circuit breaker from primitive
  circuit_breaker <- create_circuit_breaker(config.circuit_breaker_config OR CircuitBreakerConfig {
    failure_threshold: 5,
    success_threshold: 3,
    failure_window: 60s,
    recovery_timeout: 30s
  })

  // Step 6: Build HTTP transport
  transport <- create_http_transport(HttpTransportConfig {
    timeout: config.timeout,
    tls_config: TlsConfig { min_version: TLS_1_2 },
    connection_pool_size: 10
  })

  // Step 7: Build AWS signer
  signer <- create_aws_signer(
    service: SES_SERVICE_NAME,
    region: config.region,
    credentials_provider: config.credentials_provider
  )

  // Step 8: Build endpoint resolver
  endpoint <- IF config.endpoint IS Some THEN
    config.endpoint
  ELSE
    format("https://email.{}.amazonaws.com", config.region)
  END IF

  // Step 9: Assemble client
  client <- SesClientImpl {
    config: config,
    transport: transport,
    signer: signer,
    endpoint: endpoint,
    retry_executor: retry_executor,
    rate_limiter: rate_limiter,
    circuit_breaker: circuit_breaker,
    logger: logger,
    tracer: tracer,

    // Lazy-initialized services
    emails_service: None,
    templates_service: None,
    identities_service: None,
    configuration_sets_service: None,
    suppression_service: None,
    contact_lists_service: None,
    contacts_service: None,
    account_service: None
  }

  logger.info("SES client initialized", {
    region: config.region,
    endpoint: endpoint,
    default_from_address: config.default_from_address IS Some
  })

  RETURN Ok(client)
END FUNCTION
```

### 2.2 Client from Environment

```
FUNCTION create_ses_client_from_env() -> Result<SesClient, SesError>
  // Step 1: Read AWS credentials
  credentials_provider <- create_credentials_provider_chain()

  // Step 2: Read region (required)
  region <- read_env("AWS_REGION") OR read_env("AWS_DEFAULT_REGION")
  IF region IS None THEN
    RETURN Error(ConfigurationError::MissingRegion)
  END IF

  // Step 3: Read optional configuration
  endpoint <- read_env("SES_ENDPOINT")  // For localstack/testing
  timeout_str <- read_env("SES_TIMEOUT")
  max_retries_str <- read_env("SES_MAX_RETRIES")
  default_from <- read_env("SES_DEFAULT_FROM_ADDRESS")
  default_config_set <- read_env("SES_DEFAULT_CONFIGURATION_SET")

  // Step 4: Parse optional values with defaults
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

  // Step 5: Build config
  config <- SesConfig {
    region: region,
    credentials_provider: credentials_provider,
    endpoint: IF endpoint IS Some THEN parse_url(endpoint) ELSE None END IF,
    timeout: timeout,
    max_retries: max_retries,
    default_from_address: default_from,
    default_configuration_set: default_config_set,
    retry_config: RetryConfig::default(),
    circuit_breaker_config: CircuitBreakerConfig::default(),
    rate_limit_config: None
  }

  RETURN create_ses_client(config)
END FUNCTION
```

### 2.3 Service Accessor Pattern

```
FUNCTION client.emails() -> EmailsService
  // Lazy initialization with double-checked locking
  IF self.emails_service IS None THEN
    LOCK self.service_mutex
      IF self.emails_service IS None THEN
        self.emails_service <- Some(EmailsServiceImpl::new(
          transport: self.transport.clone(),
          signer: self.signer.clone(),
          endpoint: self.endpoint.clone(),
          retry_executor: self.retry_executor.clone(),
          rate_limiter: self.rate_limiter.clone(),
          circuit_breaker: self.circuit_breaker.clone(),
          logger: self.logger.clone(),
          tracer: self.tracer.clone(),
          default_from_address: self.config.default_from_address.clone(),
          default_configuration_set: self.config.default_configuration_set.clone()
        ))
      END IF
    END LOCK
  END IF

  RETURN self.emails_service.unwrap()
END FUNCTION

FUNCTION client.templates() -> TemplatesService
  IF self.templates_service IS None THEN
    LOCK self.service_mutex
      IF self.templates_service IS None THEN
        self.templates_service <- Some(TemplatesServiceImpl::new(
          transport: self.transport.clone(),
          signer: self.signer.clone(),
          endpoint: self.endpoint.clone(),
          retry_executor: self.retry_executor.clone(),
          rate_limiter: self.rate_limiter.clone(),
          circuit_breaker: self.circuit_breaker.clone(),
          logger: self.logger.clone(),
          tracer: self.tracer.clone()
        ))
      END IF
    END LOCK
  END IF

  RETURN self.templates_service.unwrap()
END FUNCTION

FUNCTION client.identities() -> IdentitiesService
  IF self.identities_service IS None THEN
    LOCK self.service_mutex
      IF self.identities_service IS None THEN
        self.identities_service <- Some(IdentitiesServiceImpl::new(
          transport: self.transport.clone(),
          signer: self.signer.clone(),
          endpoint: self.endpoint.clone(),
          retry_executor: self.retry_executor.clone(),
          rate_limiter: self.rate_limiter.clone(),
          circuit_breaker: self.circuit_breaker.clone(),
          logger: self.logger.clone(),
          tracer: self.tracer.clone()
        ))
      END IF
    END LOCK
  END IF

  RETURN self.identities_service.unwrap()
END FUNCTION

// Similar patterns for:
// client.configuration_sets() -> ConfigurationSetsService
// client.suppression() -> SuppressionService
// client.contact_lists() -> ContactListsService
// client.contacts() -> ContactsService
// client.account() -> AccountService
```

---

## 3. Configuration Management

### 3.1 Configuration Validation

```
FUNCTION validate_config(config: SesConfig) -> Result<(), ValidationError>
  errors <- []

  // Validate region
  IF config.region.is_empty() THEN
    errors.push("Region is required")
  ELSE IF NOT is_valid_aws_region(config.region) THEN
    errors.push(format("Invalid AWS region: {}", config.region))
  END IF

  // Validate credentials provider
  TRY
    test_credentials <- config.credentials_provider.get_credentials().await
    IF test_credentials.access_key_id.is_empty() THEN
      errors.push("Access key ID is empty")
    END IF
    IF test_credentials.secret_access_key.is_empty() THEN
      errors.push("Secret access key is empty")
    END IF
  CATCH CredentialsError AS e
    errors.push(format("Failed to get credentials: {}", e))
  END TRY

  // Validate endpoint if provided
  IF config.endpoint IS Some THEN
    TRY
      parsed_url <- parse_url(config.endpoint)
      IF parsed_url.scheme NOT IN ["http", "https"] THEN
        errors.push("Endpoint must use http or https scheme")
      END IF
    CATCH ParseError
      errors.push("Invalid endpoint URL format")
    END TRY
  END IF

  // Validate timeout
  IF config.timeout < 1s THEN
    errors.push("Timeout must be at least 1 second")
  ELSE IF config.timeout > 300s THEN
    errors.push("Timeout cannot exceed 300 seconds")
  END IF

  // Validate max retries
  IF config.max_retries > 10 THEN
    errors.push("Max retries cannot exceed 10")
  END IF

  // Validate default from address if provided
  IF config.default_from_address IS Some THEN
    IF NOT is_valid_email_address(config.default_from_address) THEN
      errors.push("Invalid default from address format")
    END IF
  END IF

  // Return result
  IF errors.is_empty() THEN
    RETURN Ok(())
  ELSE
    RETURN Error(ValidationError { messages: errors })
  END IF
END FUNCTION

FUNCTION is_valid_aws_region(region: String) -> bool
  valid_regions <- [
    "us-east-1", "us-east-2", "us-west-1", "us-west-2",
    "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "eu-north-1",
    "ap-south-1", "ap-southeast-1", "ap-southeast-2",
    "ap-northeast-1", "ap-northeast-2", "ap-northeast-3",
    "ca-central-1", "sa-east-1", "me-south-1", "af-south-1"
  ]
  RETURN region IN valid_regions
END FUNCTION

FUNCTION is_valid_email_address(email: String) -> bool
  // RFC 5322 simplified validation
  pattern <- "^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$"
  RETURN regex_match(email, pattern)
END FUNCTION
```

### 3.2 Configuration Builder

```
FUNCTION SesConfigBuilder::new() -> SesConfigBuilder
  RETURN SesConfigBuilder {
    region: None,
    credentials_provider: None,
    endpoint: None,
    timeout: DEFAULT_TIMEOUT,
    max_retries: DEFAULT_MAX_RETRIES,
    default_from_address: None,
    default_configuration_set: None,
    retry_config: None,
    circuit_breaker_config: None,
    rate_limit_config: None
  }
END FUNCTION

FUNCTION SesConfigBuilder::region(self, region: String) -> SesConfigBuilder
  self.region <- Some(region)
  RETURN self
END FUNCTION

FUNCTION SesConfigBuilder::credentials(self, provider: CredentialsProvider) -> SesConfigBuilder
  self.credentials_provider <- Some(provider)
  RETURN self
END FUNCTION

FUNCTION SesConfigBuilder::endpoint(self, endpoint: String) -> SesConfigBuilder
  self.endpoint <- Some(parse_url(endpoint))
  RETURN self
END FUNCTION

FUNCTION SesConfigBuilder::timeout(self, timeout: Duration) -> SesConfigBuilder
  self.timeout <- timeout
  RETURN self
END FUNCTION

FUNCTION SesConfigBuilder::max_retries(self, max_retries: u32) -> SesConfigBuilder
  self.max_retries <- max_retries
  RETURN self
END FUNCTION

FUNCTION SesConfigBuilder::default_from_address(self, address: String) -> SesConfigBuilder
  self.default_from_address <- Some(address)
  RETURN self
END FUNCTION

FUNCTION SesConfigBuilder::default_configuration_set(self, name: String) -> SesConfigBuilder
  self.default_configuration_set <- Some(name)
  RETURN self
END FUNCTION

FUNCTION SesConfigBuilder::retry_config(self, config: RetryConfig) -> SesConfigBuilder
  self.retry_config <- Some(config)
  RETURN self
END FUNCTION

FUNCTION SesConfigBuilder::circuit_breaker_config(self, config: CircuitBreakerConfig) -> SesConfigBuilder
  self.circuit_breaker_config <- Some(config)
  RETURN self
END FUNCTION

FUNCTION SesConfigBuilder::rate_limit_config(self, config: RateLimitConfig) -> SesConfigBuilder
  self.rate_limit_config <- Some(config)
  RETURN self
END FUNCTION

FUNCTION SesConfigBuilder::build(self) -> Result<SesConfig, ConfigurationError>
  // Check required fields
  IF self.region IS None THEN
    RETURN Error(ConfigurationError::MissingRegion)
  END IF

  credentials_provider <- IF self.credentials_provider IS Some THEN
    self.credentials_provider
  ELSE
    create_credentials_provider_chain()
  END IF

  RETURN Ok(SesConfig {
    region: self.region.unwrap(),
    credentials_provider: credentials_provider,
    endpoint: self.endpoint,
    timeout: self.timeout,
    max_retries: self.max_retries,
    default_from_address: self.default_from_address,
    default_configuration_set: self.default_configuration_set,
    retry_config: self.retry_config OR RetryConfig::default(),
    circuit_breaker_config: self.circuit_breaker_config OR CircuitBreakerConfig::default(),
    rate_limit_config: self.rate_limit_config
  })
END FUNCTION
```

---

## 4. HTTP Transport Layer

### 4.1 Transport Initialization

```
FUNCTION create_http_transport(config: HttpTransportConfig) -> HttpTransport
  // Build TLS configuration
  tls_config <- TlsConfigBuilder::new()
    .min_version(TLS_1_2)
    .verify_certificates(true)
    .build()

  // Build connection pool
  pool_config <- ConnectionPoolConfig {
    max_connections: config.connection_pool_size,
    idle_timeout: 90s,
    connection_timeout: 10s
  }

  // Create HTTP client
  http_client <- HttpClientBuilder::new()
    .tls_config(tls_config)
    .pool_config(pool_config)
    .default_timeout(config.timeout)
    .build()

  RETURN HttpTransportImpl {
    client: http_client,
    config: config
  }
END FUNCTION
```

### 4.2 Request Execution

```
FUNCTION transport.send(request: HttpRequest) -> Result<HttpResponse, TransportError>
  // Set timeout
  timeout <- request.timeout OR self.config.timeout

  // Execute request
  TRY
    response <- self.client
      .request(request.method, request.url)
      .headers(request.headers)
      .body(request.body)
      .timeout(timeout)
      .send()
      .await?

    // Read response body
    status <- response.status()
    headers <- response.headers().clone()
    body <- response.bytes().await?

    RETURN Ok(HttpResponse {
      status: status,
      headers: headers,
      body: body
    })

  CATCH TimeoutError
    RETURN Error(TransportError::Timeout { duration: timeout })

  CATCH ConnectionError AS e
    RETURN Error(TransportError::ConnectionFailed { message: e.to_string() })

  CATCH TlsError AS e
    RETURN Error(TransportError::TlsError { message: e.to_string() })

  CATCH DnsError AS e
    RETURN Error(TransportError::DnsResolutionFailed { host: request.url.host() })

  CATCH IoError AS e
    RETURN Error(TransportError::IoError { message: e.to_string() })
  END TRY
END FUNCTION
```

---

## 5. Request Builder

### 5.1 SES Request Builder

```
FUNCTION build_ses_request(
  method: HttpMethod,
  endpoint: Url,
  path: String,
  query_params: Option<Map<String, String>>,
  body: Option<JsonValue>,
  signer: AwsSigner,
  tracer: Tracer
) -> Result<HttpRequest, SesError>

  span <- tracer.start_span("ses.build_request")

  TRY
    // Build URL with path and query params
    url <- endpoint.join(path)?

    IF query_params IS Some THEN
      FOR EACH (key, value) IN query_params DO
        url.query_pairs_mut().append_pair(key, value)
      END FOR
    END IF

    // Serialize body to JSON
    body_bytes <- IF body IS Some THEN
      json_serialize(body)?
    ELSE
      Bytes::new()
    END IF

    // Calculate payload hash
    payload_hash <- sha256_hex(body_bytes)

    // Build initial headers
    headers <- HeaderMap::new()
    headers.insert("Content-Type", "application/json")
    headers.insert("Accept", "application/json")
    headers.insert("X-Amz-Content-Sha256", payload_hash)

    IF body_bytes.len() > 0 THEN
      headers.insert("Content-Length", body_bytes.len().to_string())
    END IF

    // Build request
    request <- HttpRequest {
      method: method,
      url: url,
      headers: headers,
      body: IF body_bytes.len() > 0 THEN Some(body_bytes) ELSE None END IF,
      timeout: None  // Will be set by transport
    }

    // Sign request
    timestamp <- Utc::now()
    signer.sign_request(request, payload_hash, timestamp)?

    span.set_attribute("http.method", method.to_string())
    span.set_attribute("http.url", url.to_string())
    span.end()

    RETURN Ok(request)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 5.2 Email Content Builder

```
FUNCTION build_email_content(content: EmailContent) -> Result<JsonValue, SesError>
  MATCH content
    CASE EmailContent::Simple(simple):
      RETURN build_simple_content(simple)

    CASE EmailContent::Raw(raw):
      RETURN build_raw_content(raw)

    CASE EmailContent::Template(template):
      RETURN build_template_content(template)
  END MATCH
END FUNCTION

FUNCTION build_simple_content(simple: SimpleEmailContent) -> Result<JsonValue, SesError>
  // Validate content
  IF simple.body.text IS None AND simple.body.html IS None THEN
    RETURN Error(RequestError::ValidationError("Email body must have text or HTML content"))
  END IF

  body_json <- {}

  IF simple.body.text IS Some THEN
    body_json["Text"] <- {
      "Data": simple.body.text.data,
      "Charset": simple.body.text.charset OR "UTF-8"
    }
  END IF

  IF simple.body.html IS Some THEN
    body_json["Html"] <- {
      "Data": simple.body.html.data,
      "Charset": simple.body.html.charset OR "UTF-8"
    }
  END IF

  result <- {
    "Simple": {
      "Subject": {
        "Data": simple.subject.data,
        "Charset": simple.subject.charset OR "UTF-8"
      },
      "Body": body_json
    }
  }

  IF simple.headers IS Some THEN
    result["Simple"]["Headers"] <- []
    FOR EACH header IN simple.headers DO
      result["Simple"]["Headers"].push({
        "Name": header.name,
        "Value": header.value
      })
    END FOR
  END IF

  RETURN Ok(result)
END FUNCTION

FUNCTION build_raw_content(raw: RawEmailContent) -> Result<JsonValue, SesError>
  // Validate raw content size
  IF raw.data.len() > MAX_MESSAGE_SIZE_BYTES THEN
    RETURN Error(RequestError::EntityTooLarge {
      size: raw.data.len(),
      max: MAX_MESSAGE_SIZE_BYTES
    })
  END IF

  // Base64 encode the raw MIME message
  encoded <- base64_encode(raw.data)

  RETURN Ok({
    "Raw": {
      "Data": encoded
    }
  })
END FUNCTION

FUNCTION build_template_content(template: TemplateEmailContent) -> Result<JsonValue, SesError>
  // Validate template reference
  IF template.template_name IS None AND template.template_arn IS None THEN
    RETURN Error(RequestError::ValidationError("Template name or ARN is required"))
  END IF

  // Validate template data is valid JSON
  TRY
    json_parse(template.template_data)
  CATCH JsonError
    RETURN Error(RequestError::ValidationError("Template data must be valid JSON"))
  END TRY

  result <- {
    "Template": {
      "TemplateData": template.template_data
    }
  }

  IF template.template_name IS Some THEN
    result["Template"]["TemplateName"] <- template.template_name
  END IF

  IF template.template_arn IS Some THEN
    result["Template"]["TemplateArn"] <- template.template_arn
  END IF

  IF template.headers IS Some THEN
    result["Template"]["Headers"] <- []
    FOR EACH header IN template.headers DO
      result["Template"]["Headers"].push({
        "Name": header.name,
        "Value": header.value
      })
    END FOR
  END IF

  RETURN Ok(result)
END FUNCTION
```

### 5.3 Destination Builder

```
FUNCTION build_destination(destination: Destination) -> Result<JsonValue, SesError>
  // Count total recipients
  total_recipients <- 0

  IF destination.to_addresses IS Some THEN
    total_recipients <- total_recipients + destination.to_addresses.len()
  END IF

  IF destination.cc_addresses IS Some THEN
    total_recipients <- total_recipients + destination.cc_addresses.len()
  END IF

  IF destination.bcc_addresses IS Some THEN
    total_recipients <- total_recipients + destination.bcc_addresses.len()
  END IF

  // Validate recipient count
  IF total_recipients == 0 THEN
    RETURN Error(RequestError::ValidationError("At least one recipient is required"))
  END IF

  IF total_recipients > MAX_RECIPIENTS_PER_EMAIL THEN
    RETURN Error(RequestError::TooManyRecipients {
      count: total_recipients,
      max: MAX_RECIPIENTS_PER_EMAIL
    })
  END IF

  // Validate email addresses
  all_addresses <- []
  IF destination.to_addresses IS Some THEN
    all_addresses.extend(destination.to_addresses)
  END IF
  IF destination.cc_addresses IS Some THEN
    all_addresses.extend(destination.cc_addresses)
  END IF
  IF destination.bcc_addresses IS Some THEN
    all_addresses.extend(destination.bcc_addresses)
  END IF

  FOR EACH address IN all_addresses DO
    IF NOT is_valid_email_address(address) THEN
      RETURN Error(RequestError::InvalidEmailAddress { address })
    END IF
  END FOR

  // Build JSON
  result <- {}

  IF destination.to_addresses IS Some AND destination.to_addresses.len() > 0 THEN
    result["ToAddresses"] <- destination.to_addresses
  END IF

  IF destination.cc_addresses IS Some AND destination.cc_addresses.len() > 0 THEN
    result["CcAddresses"] <- destination.cc_addresses
  END IF

  IF destination.bcc_addresses IS Some AND destination.bcc_addresses.len() > 0 THEN
    result["BccAddresses"] <- destination.bcc_addresses
  END IF

  RETURN Ok(result)
END FUNCTION
```

---

## 6. Response Parser

### 6.1 JSON Response Parser

```
FUNCTION parse_ses_response<T>(
  response: HttpResponse,
  operation: String,
  tracer: Tracer
) -> Result<T, SesError>

  span <- tracer.start_span("ses.parse_response")
  span.set_attribute("http.status_code", response.status.as_u16())

  TRY
    // Check for error status codes
    IF response.status.is_client_error() OR response.status.is_server_error() THEN
      error <- parse_error_response(response, operation)
      span.record_error(error)
      RETURN Error(error)
    END IF

    // Parse success response
    IF response.body.is_empty() THEN
      // Some operations return empty body on success
      IF type_of<T>() == "()" THEN
        span.end()
        RETURN Ok(())
      ELSE
        span.record_error("Empty response body")
        RETURN Error(ResponseError::InvalidResponse("Expected response body"))
      END IF
    END IF

    // Parse JSON body
    TRY
      result <- json_deserialize<T>(response.body)?
      span.end()
      RETURN Ok(result)

    CATCH JsonError AS e
      span.record_error(e)
      RETURN Error(ResponseError::JsonParseError {
        message: e.to_string(),
        body: String::from_utf8_lossy(response.body)
      })
    END TRY

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 6.2 Error Response Parser

```
FUNCTION parse_error_response(response: HttpResponse, operation: String) -> SesError
  // Try to parse as SES error response
  TRY
    error_body <- json_deserialize<SesErrorResponse>(response.body)

    // Map SES error code to our error types
    RETURN map_ses_error(
      status: response.status,
      code: error_body.code,
      message: error_body.message,
      request_id: extract_request_id(response.headers)
    )

  CATCH JsonError
    // Couldn't parse error body, use status code
    RETURN map_http_status_error(response.status, operation)
  END TRY
END FUNCTION

FUNCTION map_ses_error(
  status: StatusCode,
  code: String,
  message: String,
  request_id: Option<String>
) -> SesError

  MATCH code
    // Identity errors
    CASE "NotFoundException" WHERE message.contains("identity"):
      RETURN SesError::Identity(IdentityError::IdentityNotFound { message, request_id })

    CASE "AlreadyExistsException" WHERE message.contains("identity"):
      RETURN SesError::Identity(IdentityError::IdentityAlreadyExists { message, request_id })

    // Template errors
    CASE "NotFoundException" WHERE message.contains("template"):
      RETURN SesError::Template(TemplateError::TemplateNotFound { message, request_id })

    CASE "AlreadyExistsException" WHERE message.contains("template"):
      RETURN SesError::Template(TemplateError::TemplateAlreadyExists { message, request_id })

    CASE "InvalidTemplateException":
      RETURN SesError::Template(TemplateError::InvalidTemplateContent { message, request_id })

    // Configuration set errors
    CASE "NotFoundException" WHERE message.contains("configuration"):
      RETURN SesError::ConfigurationSet(ConfigurationSetError::ConfigurationSetNotFound { message, request_id })

    CASE "AlreadyExistsException" WHERE message.contains("configuration"):
      RETURN SesError::ConfigurationSet(ConfigurationSetError::ConfigurationSetAlreadyExists { message, request_id })

    // Sending errors
    CASE "MessageRejected":
      RETURN SesError::Sending(SendingError::MessageRejected { message, request_id })

    CASE "MailFromDomainNotVerifiedException":
      RETURN SesError::Sending(SendingError::MailFromDomainNotVerified { message, request_id })

    CASE "ConfigurationSetSendingPausedException":
      RETURN SesError::Sending(SendingError::ConfigurationSetSendingPaused { message, request_id })

    CASE "AccountSendingPausedException":
      RETURN SesError::Sending(SendingError::AccountSendingPaused { message, request_id })

    // Quota errors
    CASE "TooManyRequestsException":
      retry_after <- parse_retry_after(message)
      RETURN SesError::Quota(QuotaError::TooManyRequests { message, request_id, retry_after })

    CASE "LimitExceededException":
      RETURN SesError::Quota(QuotaError::AccountThrottled { message, request_id })

    CASE "SendingPausedException":
      RETURN SesError::Quota(QuotaError::DailyQuotaExceeded { message, request_id })

    // Validation errors
    CASE "ValidationException":
      RETURN SesError::Request(RequestError::ValidationError { message, request_id })

    CASE "InvalidParameterValue":
      RETURN SesError::Request(RequestError::InvalidParameterValue { message, request_id })

    CASE "MissingParameter":
      RETURN SesError::Request(RequestError::MissingRequiredParameter { message, request_id })

    // Access errors
    CASE "AccessDeniedException":
      RETURN SesError::Credentials(CredentialsError::InvalidCredentials { message, request_id })

    // Server errors
    CASE "InternalServiceError":
      RETURN SesError::Server(ServerError::InternalError { message, request_id })

    // Default case
    CASE _:
      RETURN map_http_status_error_with_message(status, code, message, request_id)
  END MATCH
END FUNCTION

FUNCTION map_http_status_error(status: StatusCode, operation: String) -> SesError
  MATCH status.as_u16()
    CASE 400:
      RETURN SesError::Request(RequestError::ValidationError {
        message: format("Bad request for operation: {}", operation)
      })

    CASE 401, 403:
      RETURN SesError::Credentials(CredentialsError::InvalidCredentials {
        message: "Access denied"
      })

    CASE 404:
      RETURN SesError::Request(RequestError::ValidationError {
        message: "Resource not found"
      })

    CASE 429:
      RETURN SesError::Quota(QuotaError::TooManyRequests {
        message: "Rate limit exceeded",
        retry_after: None
      })

    CASE 500:
      RETURN SesError::Server(ServerError::InternalError {
        message: "Internal server error"
      })

    CASE 503:
      RETURN SesError::Server(ServerError::ServiceUnavailable {
        message: "Service unavailable",
        retry_after: None
      })

    CASE _:
      RETURN SesError::Response(ResponseError::UnexpectedContent {
        message: format("Unexpected status code: {}", status)
      })
  END MATCH
END FUNCTION

FUNCTION extract_request_id(headers: HeaderMap) -> Option<String>
  RETURN headers.get("x-amzn-requestid")
    OR headers.get("x-amz-request-id")
END FUNCTION
```

---

## 7. AWS Signature V4 Signer

### 7.1 Signer Initialization

```
FUNCTION create_aws_signer(
  service: String,
  region: String,
  credentials_provider: CredentialsProvider
) -> AwsSigner

  RETURN AwsSignerImpl {
    service: service,
    region: region,
    credentials_provider: credentials_provider
  }
END FUNCTION
```

### 7.2 Request Signing

```
FUNCTION signer.sign_request(
  request: &mut HttpRequest,
  payload_hash: String,
  timestamp: DateTime<Utc>
) -> Result<(), SigningError>

  // Step 1: Get credentials
  credentials <- self.credentials_provider.get_credentials().await?

  // Step 2: Format timestamp
  amz_date <- timestamp.format("%Y%m%dT%H%M%SZ")
  date_stamp <- timestamp.format("%Y%m%d")

  // Step 3: Add required headers
  request.headers.insert("X-Amz-Date", amz_date)
  request.headers.insert("Host", request.url.host_str())

  IF credentials.session_token IS Some THEN
    request.headers.insert("X-Amz-Security-Token", credentials.session_token)
  END IF

  // Step 4: Create canonical request
  canonical_request <- create_canonical_request(
    method: request.method,
    uri: request.url.path(),
    query_string: request.url.query() OR "",
    headers: request.headers,
    signed_headers: get_signed_headers(request.headers),
    payload_hash: payload_hash
  )

  // Step 5: Create string to sign
  algorithm <- "AWS4-HMAC-SHA256"
  credential_scope <- format("{}/{}/{}/aws4_request",
    date_stamp, self.region, self.service)

  string_to_sign <- format("{}\n{}\n{}\n{}",
    algorithm,
    amz_date,
    credential_scope,
    sha256_hex(canonical_request)
  )

  // Step 6: Calculate signature
  signing_key <- derive_signing_key(
    secret_key: credentials.secret_access_key,
    date_stamp: date_stamp,
    region: self.region,
    service: self.service
  )

  signature <- hmac_sha256_hex(signing_key, string_to_sign)

  // Step 7: Create authorization header
  signed_headers <- get_signed_headers(request.headers)
  authorization <- format("{} Credential={}/{}, SignedHeaders={}, Signature={}",
    algorithm,
    credentials.access_key_id,
    credential_scope,
    signed_headers,
    signature
  )

  request.headers.insert("Authorization", authorization)

  RETURN Ok(())
END FUNCTION
```

### 7.3 Canonical Request Creation

```
FUNCTION create_canonical_request(
  method: HttpMethod,
  uri: String,
  query_string: String,
  headers: HeaderMap,
  signed_headers: String,
  payload_hash: String
) -> String

  // Canonical URI (URL-encoded path)
  canonical_uri <- uri_encode(uri, false)

  // Canonical query string (sorted by parameter name)
  canonical_query_string <- IF query_string.is_empty() THEN
    ""
  ELSE
    params <- parse_query_string(query_string)
    sorted_params <- sort_by_key(params)
    sorted_params.map(|(k, v)| format("{}={}", uri_encode(k, true), uri_encode(v, true)))
      .join("&")
  END IF

  // Canonical headers (sorted, lowercase names)
  canonical_headers <- ""
  sorted_header_names <- get_sorted_header_names(headers)
  FOR EACH name IN sorted_header_names DO
    value <- headers.get(name).trim()
    canonical_headers <- canonical_headers + format("{}:{}\n", name.to_lowercase(), value)
  END FOR

  // Build canonical request
  RETURN format("{}\n{}\n{}\n{}\n{}\n{}",
    method.to_string(),
    canonical_uri,
    canonical_query_string,
    canonical_headers,
    signed_headers,
    payload_hash
  )
END FUNCTION

FUNCTION get_signed_headers(headers: HeaderMap) -> String
  // Get lowercase, sorted header names
  names <- []
  FOR EACH (name, _) IN headers DO
    lowercase_name <- name.to_lowercase()
    // Skip certain headers
    IF lowercase_name NOT IN ["connection", "user-agent"] THEN
      names.push(lowercase_name)
    END IF
  END FOR

  sort(names)
  RETURN names.join(";")
END FUNCTION

FUNCTION get_sorted_header_names(headers: HeaderMap) -> Vec<String>
  names <- []
  FOR EACH (name, _) IN headers DO
    lowercase_name <- name.to_lowercase()
    IF lowercase_name NOT IN ["connection", "user-agent"] THEN
      names.push(lowercase_name)
    END IF
  END FOR

  sort(names)
  RETURN names
END FUNCTION
```

### 7.4 Signing Key Derivation

```
FUNCTION derive_signing_key(
  secret_key: SecretString,
  date_stamp: String,
  region: String,
  service: String
) -> Bytes

  // Key derivation: kSecret -> kDate -> kRegion -> kService -> kSigning
  k_secret <- format("AWS4{}", secret_key.expose_secret()).as_bytes()
  k_date <- hmac_sha256(k_secret, date_stamp)
  k_region <- hmac_sha256(k_date, region)
  k_service <- hmac_sha256(k_region, service)
  k_signing <- hmac_sha256(k_service, "aws4_request")

  RETURN k_signing
END FUNCTION

FUNCTION hmac_sha256(key: Bytes, message: String) -> Bytes
  // Use ring or @noble/hashes for HMAC-SHA256
  RETURN crypto_hmac_sha256(key, message.as_bytes())
END FUNCTION

FUNCTION hmac_sha256_hex(key: Bytes, message: String) -> String
  hash <- hmac_sha256(key, message)
  RETURN hex_encode(hash)
END FUNCTION

FUNCTION sha256_hex(data: Bytes) -> String
  hash <- crypto_sha256(data)
  RETURN hex_encode(hash)
END FUNCTION

FUNCTION uri_encode(value: String, encode_slash: bool) -> String
  result <- ""
  FOR EACH char IN value DO
    IF is_unreserved_char(char) THEN
      result <- result + char
    ELSE IF char == '/' AND NOT encode_slash THEN
      result <- result + char
    ELSE
      result <- result + percent_encode(char)
    END IF
  END FOR
  RETURN result
END FUNCTION

FUNCTION is_unreserved_char(char: char) -> bool
  // RFC 3986 unreserved characters
  RETURN char.is_alphanumeric() OR char IN ['-', '.', '_', '~']
END FUNCTION
```

---

## 8. Credentials Provider

### 8.1 Credentials Provider Chain

```
FUNCTION create_credentials_provider_chain() -> CredentialsProvider
  // Create chain of providers in priority order
  providers <- [
    EnvCredentialsProvider::new(),
    ProfileCredentialsProvider::new(),
    InstanceMetadataCredentialsProvider::new(),
    EcsTaskCredentialsProvider::new()
  ]

  RETURN CredentialsProviderChain {
    providers: providers,
    cached_credentials: None,
    cache_expiry: None
  }
END FUNCTION
```

### 8.2 Environment Credentials Provider

```
FUNCTION EnvCredentialsProvider::get_credentials(self) -> Result<AwsCredentials, CredentialsError>
  access_key_id <- read_env("AWS_ACCESS_KEY_ID")
  secret_access_key <- read_env("AWS_SECRET_ACCESS_KEY")
  session_token <- read_env("AWS_SESSION_TOKEN")

  IF access_key_id IS None THEN
    RETURN Error(CredentialsError::CredentialsNotFound {
      source: "environment"
    })
  END IF

  IF secret_access_key IS None THEN
    RETURN Error(CredentialsError::CredentialsNotFound {
      source: "environment"
    })
  END IF

  RETURN Ok(AwsCredentials {
    access_key_id: access_key_id,
    secret_access_key: SecretString::new(secret_access_key),
    session_token: IF session_token IS Some THEN Some(SecretString::new(session_token)) ELSE None END IF
  })
END FUNCTION
```

### 8.3 Credentials Provider Chain Execution

```
FUNCTION CredentialsProviderChain::get_credentials(self) -> Result<AwsCredentials, CredentialsError>
  // Check cache
  IF self.cached_credentials IS Some AND self.cache_expiry IS Some THEN
    IF now() < self.cache_expiry THEN
      RETURN Ok(self.cached_credentials.clone())
    END IF
  END IF

  // Try each provider in order
  last_error <- None
  FOR EACH provider IN self.providers DO
    TRY
      credentials <- provider.get_credentials().await

      // Cache credentials (with 5 minute buffer before expiry)
      self.cached_credentials <- Some(credentials.clone())
      IF credentials.expiration IS Some THEN
        self.cache_expiry <- Some(credentials.expiration - 5.minutes())
      ELSE
        self.cache_expiry <- Some(now() + 1.hour())
      END IF

      RETURN Ok(credentials)

    CATCH CredentialsError AS e
      last_error <- Some(e)
      // Continue to next provider
    END TRY
  END FOR

  // All providers failed
  RETURN Error(last_error OR CredentialsError::CredentialsNotFound {
    source: "all providers"
  })
END FUNCTION
```

### 8.4 Instance Metadata Provider (for EC2/ECS)

```
FUNCTION InstanceMetadataCredentialsProvider::get_credentials(self) -> Result<AwsCredentials, CredentialsError>
  // Get IAM role name from instance metadata
  metadata_url <- "http://169.254.169.254/latest/meta-data/iam/security-credentials/"

  TRY
    // First, get token for IMDSv2
    token <- get_imds_token().await?

    // Get role name
    role_response <- http_get(metadata_url, headers: { "X-aws-ec2-metadata-token": token }).await?
    role_name <- role_response.body.trim()

    // Get credentials for role
    creds_url <- format("{}{}", metadata_url, role_name)
    creds_response <- http_get(creds_url, headers: { "X-aws-ec2-metadata-token": token }).await?
    creds_json <- json_parse(creds_response.body)?

    RETURN Ok(AwsCredentials {
      access_key_id: creds_json["AccessKeyId"],
      secret_access_key: SecretString::new(creds_json["SecretAccessKey"]),
      session_token: Some(SecretString::new(creds_json["Token"])),
      expiration: Some(parse_iso8601(creds_json["Expiration"]))
    })

  CATCH error
    RETURN Error(CredentialsError::CredentialsNotFound {
      source: "instance metadata"
    })
  END TRY
END FUNCTION

FUNCTION get_imds_token() -> Result<String, CredentialsError>
  token_url <- "http://169.254.169.254/latest/api/token"

  TRY
    response <- http_put(token_url, headers: {
      "X-aws-ec2-metadata-token-ttl-seconds": "21600"
    }).await?

    RETURN Ok(response.body)
  CATCH error
    RETURN Error(CredentialsError::CredentialsRefreshFailed {
      message: "Failed to get IMDS token"
    })
  END TRY
END FUNCTION
```

---

## End of Part 1

*Part 2 covers: Resilience Orchestrator, Emails Service, Templates Service, Identities Service*
