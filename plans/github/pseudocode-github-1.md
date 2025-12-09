# GitHub Integration Module - Pseudocode (Part 1)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/github`
**File:** 1 of 4 - Core Infrastructure

---

## Table of Contents (Part 1)

1. [Overview](#1-overview)
2. [Client Initialization](#2-client-initialization)
3. [Configuration Management](#3-configuration-management)
4. [Authentication Manager](#4-authentication-manager)
5. [HTTP Transport Layer](#5-http-transport-layer)
6. [Request Builder](#6-request-builder)
7. [Response Parser](#7-response-parser)
8. [Pagination Handler](#8-pagination-handler)
9. [Rate Limit Tracker](#9-rate-limit-tracker)

---

## 1. Overview

This document provides pseudocode algorithms for the core infrastructure components of the GitHub Integration Module. The pseudocode is language-agnostic but maps directly to Rust and TypeScript implementations.

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
MOCK RepositoriesService {
  list_for_user: returns predefined Paginated<Repository>
  get: returns predefined Repository
  create: returns predefined Repository
}

// Inject mock into client for isolated testing
test_client <- GitHubClientImpl::with_mock_services(mock_services)
```

### 1.3 Module Dependencies

The GitHub module depends ONLY on these Integration Repo primitives:

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

// FORBIDDEN: ruvbase, integrations-openai, integrations-anthropic, etc.
```

---

## 2. Client Initialization

### 2.1 Client Factory

```
FUNCTION create_github_client(config: GitHubConfig) -> Result<GitHubClient, GitHubError>
  // Step 1: Validate configuration
  validation_result <- validate_config(config)
  IF validation_result IS Error THEN
    RETURN Error(ConfigurationError::InvalidConfiguration(validation_result.message))
  END IF

  // Step 2: Initialize dependencies from Integration Repo primitives
  logger <- get_logger_from_primitive("github")
  tracer <- get_tracer_from_primitive("github")

  // Step 3: Build retry executor from integrations-retry primitive
  retry_config <- RetryConfig {
    max_retries: config.max_retries,
    initial_backoff: 1000ms,
    max_backoff: 60s,
    backoff_multiplier: 2.0,
    jitter: 0.1,
    retryable_errors: [RateLimitError, NetworkTimeout, ServerError5xx]
  }
  retry_executor <- create_retry_executor(retry_config)

  // Step 4: Build rate limiter from integrations-rate-limit primitive
  rate_limiter <- IF config.rate_limit_config IS Some THEN
    create_rate_limiter(config.rate_limit_config)
  ELSE
    create_rate_limiter(RateLimitConfig {
      requests_per_hour: None,  // Track from API headers
      max_concurrent_requests: 100,
      auto_adjust: true,
      preemptive_throttle_percent: 10
    })
  END IF

  // Step 5: Build circuit breaker from integrations-circuit-breaker primitive
  circuit_breaker <- create_circuit_breaker(CircuitBreakerConfig {
    failure_threshold: config.circuit_breaker_config.failure_threshold OR 5,
    success_threshold: config.circuit_breaker_config.success_threshold OR 3,
    failure_window: 60s,
    reset_timeout: config.circuit_breaker_config.reset_timeout OR 60s
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
  auth_manager <- create_auth_manager(config.auth)

  // Step 8: Build rate limit tracker
  rate_limit_tracker <- RateLimitTracker::new()

  // Step 9: Assemble client with lazy service initialization
  client <- GitHubClientImpl {
    config: config,
    transport: transport,
    auth_manager: auth_manager,
    retry_executor: retry_executor,
    rate_limiter: rate_limiter,
    circuit_breaker: circuit_breaker,
    rate_limit_tracker: rate_limit_tracker,
    logger: logger,
    tracer: tracer,

    // Lazy-initialized services (London-School: inject mocks for testing)
    repositories_service: None,
    issues_service: None,
    pull_requests_service: None,
    git_service: None,
    actions_service: None,
    users_service: None,
    organizations_service: None,
    search_service: None,
    gists_service: None,
    webhooks_service: None
  }

  logger.info("GitHub client initialized", {
    base_url: config.base_url,
    api_version: config.api_version,
    auth_type: config.auth.type_name()
  })

  RETURN Ok(client)
END FUNCTION
```

### 2.2 Client from Environment

```
FUNCTION create_github_client_from_env() -> Result<GitHubClient, GitHubError>
  // Step 1: Determine authentication method from environment
  auth_config <- detect_auth_from_env()

  // Step 2: Read optional configuration
  base_url <- read_env("GITHUB_API_URL")
  graphql_url <- read_env("GITHUB_GRAPHQL_URL")
  api_version <- read_env("GITHUB_API_VERSION")
  timeout_str <- read_env("GITHUB_TIMEOUT")
  max_retries_str <- read_env("GITHUB_MAX_RETRIES")

  // Step 3: Parse optional values with defaults
  timeout <- IF timeout_str IS Some THEN
    parse_duration(timeout_str) OR DEFAULT_TIMEOUT
  ELSE
    DEFAULT_TIMEOUT  // 30s
  END IF

  max_retries <- IF max_retries_str IS Some THEN
    parse_u32(max_retries_str) OR DEFAULT_MAX_RETRIES
  ELSE
    DEFAULT_MAX_RETRIES  // 3
  END IF

  // Step 4: Build config
  config <- GitHubConfig {
    auth: auth_config,
    base_url: base_url OR DEFAULT_BASE_URL,
    graphql_url: graphql_url OR DEFAULT_GRAPHQL_URL,
    api_version: api_version OR DEFAULT_API_VERSION,
    timeout: timeout,
    max_retries: max_retries,
    retry_config: RetryConfig::default(),
    circuit_breaker_config: CircuitBreakerConfig::default(),
    rate_limit_config: None,
    user_agent: DEFAULT_USER_AGENT
  }

  RETURN create_github_client(config)
END FUNCTION

FUNCTION detect_auth_from_env() -> AuthConfig
  // Priority order: GitHub App > PAT > OAuth > Actions Token > None

  // Check for GitHub App credentials
  app_id <- read_env("GITHUB_APP_ID")
  private_key <- read_env("GITHUB_APP_PRIVATE_KEY")
  installation_id <- read_env("GITHUB_APP_INSTALLATION_ID")

  IF app_id IS Some AND private_key IS Some THEN
    RETURN AuthConfig::GitHubApp {
      app_id: parse_u64(app_id)?,
      private_key: SecretString::new(private_key),
      installation_id: installation_id.map(parse_u64)
    }
  END IF

  // Check for Personal Access Token
  token <- read_env("GITHUB_TOKEN") OR read_env("GH_TOKEN")
  IF token IS Some THEN
    // Detect token type by prefix
    IF token.starts_with("ghs_") THEN
      // GitHub Actions token
      RETURN AuthConfig::ActionsToken(SecretString::new(token))
    ELSE IF token.starts_with("gho_") THEN
      // OAuth token
      RETURN AuthConfig::OAuthToken(SecretString::new(token))
    ELSE
      // Assume PAT (ghp_ prefix or classic format)
      RETURN AuthConfig::PersonalAccessToken(SecretString::new(token))
    END IF
  END IF

  // No authentication configured
  log_warning("No GitHub authentication configured - limited to public endpoints")
  RETURN AuthConfig::None
END FUNCTION
```

### 2.3 Service Accessor Pattern (Dependency Injection Point)

```
// London-School TDD: Services are interfaces that can be mocked
FUNCTION client.repositories() -> &RepositoriesService
  // Lazy initialization with double-checked locking
  IF self.repositories_service IS None THEN
    LOCK self.service_mutex
      IF self.repositories_service IS None THEN
        self.repositories_service <- Some(RepositoriesServiceImpl::new(
          transport: self.transport.clone(),
          auth_manager: self.auth_manager.clone(),
          retry_executor: self.retry_executor.clone(),
          rate_limiter: self.rate_limiter.clone(),
          circuit_breaker: self.circuit_breaker.clone(),
          rate_limit_tracker: self.rate_limit_tracker.clone(),
          base_url: self.config.base_url.clone(),
          api_version: self.config.api_version.clone(),
          logger: self.logger.clone(),
          tracer: self.tracer.clone()
        ))
      END IF
    END LOCK
  END IF

  RETURN self.repositories_service.as_ref().unwrap()
END FUNCTION

FUNCTION client.issues() -> &IssuesService
  IF self.issues_service IS None THEN
    LOCK self.service_mutex
      IF self.issues_service IS None THEN
        self.issues_service <- Some(IssuesServiceImpl::new(
          transport: self.transport.clone(),
          auth_manager: self.auth_manager.clone(),
          retry_executor: self.retry_executor.clone(),
          rate_limiter: self.rate_limiter.clone(),
          circuit_breaker: self.circuit_breaker.clone(),
          rate_limit_tracker: self.rate_limit_tracker.clone(),
          base_url: self.config.base_url.clone(),
          api_version: self.config.api_version.clone(),
          logger: self.logger.clone(),
          tracer: self.tracer.clone()
        ))
      END IF
    END LOCK
  END IF

  RETURN self.issues_service.as_ref().unwrap()
END FUNCTION

FUNCTION client.pull_requests() -> &PullRequestsService
  IF self.pull_requests_service IS None THEN
    LOCK self.service_mutex
      IF self.pull_requests_service IS None THEN
        self.pull_requests_service <- Some(PullRequestsServiceImpl::new(
          transport: self.transport.clone(),
          auth_manager: self.auth_manager.clone(),
          retry_executor: self.retry_executor.clone(),
          rate_limiter: self.rate_limiter.clone(),
          circuit_breaker: self.circuit_breaker.clone(),
          rate_limit_tracker: self.rate_limit_tracker.clone(),
          base_url: self.config.base_url.clone(),
          api_version: self.config.api_version.clone(),
          logger: self.logger.clone(),
          tracer: self.tracer.clone()
        ))
      END IF
    END LOCK
  END IF

  RETURN self.pull_requests_service.as_ref().unwrap()
END FUNCTION

// Similar pattern for: git(), actions(), users(), organizations(),
// search(), gists(), webhooks()

FUNCTION client.graphql<Q: GraphQLQuery>(query: Q) -> Result<Q::Response, GitHubError>
  // Execute GraphQL query using dedicated endpoint
  RETURN execute_graphql_query(
    transport: self.transport,
    auth_manager: self.auth_manager,
    graphql_url: self.config.graphql_url,
    query: query,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    rate_limit_tracker: self.rate_limit_tracker,
    logger: self.logger,
    tracer: self.tracer
  )
END FUNCTION

FUNCTION client.rate_limit() -> Result<RateLimitStatus, GitHubError>
  // Fetch current rate limit status from API
  request <- build_request(
    method: GET,
    endpoint: "/rate_limit",
    base_url: self.config.base_url,
    auth_manager: self.auth_manager,
    body: None,
    extra_headers: HeaderMap::new()
  )?

  response <- self.transport.send(request).await?

  IF response.status.is_success() THEN
    rate_limit_response <- parse_response::<RateLimitResponse>(response)?
    RETURN Ok(rate_limit_response.to_status())
  ELSE
    RETURN Error(parse_error_response(response))
  END IF
END FUNCTION
```

### 2.4 Client with Mock Services (Testing Support)

```
// London-School TDD: Factory for creating test clients with mocked services
FUNCTION create_test_client(mock_config: MockConfig) -> GitHubClient
  RETURN GitHubClientImpl {
    config: GitHubConfig::default(),
    transport: mock_config.transport OR MockHttpTransport::new(),
    auth_manager: MockAuthManager::new(),
    retry_executor: MockRetryExecutor::new(),
    rate_limiter: MockRateLimiter::new(),
    circuit_breaker: MockCircuitBreaker::new(),
    rate_limit_tracker: MockRateLimitTracker::new(),
    logger: MockLogger::new(),
    tracer: MockTracer::new(),

    // Pre-inject mock services
    repositories_service: mock_config.repositories_service,
    issues_service: mock_config.issues_service,
    pull_requests_service: mock_config.pull_requests_service,
    git_service: mock_config.git_service,
    actions_service: mock_config.actions_service,
    users_service: mock_config.users_service,
    organizations_service: mock_config.organizations_service,
    search_service: mock_config.search_service,
    gists_service: mock_config.gists_service,
    webhooks_service: mock_config.webhooks_service
  }
END FUNCTION

// Mock configuration builder for fluent test setup
STRUCT MockConfig {
  transport: Option<MockHttpTransport>,
  repositories_service: Option<MockRepositoriesService>,
  issues_service: Option<MockIssuesService>,
  pull_requests_service: Option<MockPullRequestsService>,
  git_service: Option<MockGitService>,
  actions_service: Option<MockActionsService>,
  users_service: Option<MockUsersService>,
  organizations_service: Option<MockOrganizationsService>,
  search_service: Option<MockSearchService>,
  gists_service: Option<MockGistsService>,
  webhooks_service: Option<MockWebhooksService>
}

FUNCTION MockConfig::new() -> MockConfig
  RETURN MockConfig {
    transport: None,
    repositories_service: None,
    issues_service: None,
    pull_requests_service: None,
    git_service: None,
    actions_service: None,
    users_service: None,
    organizations_service: None,
    search_service: None,
    gists_service: None,
    webhooks_service: None
  }
END FUNCTION

FUNCTION MockConfig.with_repositories_service(service: MockRepositoriesService) -> MockConfig
  self.repositories_service <- Some(service)
  RETURN self
END FUNCTION

// Similar builder methods for all services...
```

---

## 3. Configuration Management

### 3.1 Configuration Validation

```
FUNCTION validate_config(config: GitHubConfig) -> Result<(), ValidationError>
  errors <- []

  // Validate authentication
  auth_validation <- validate_auth_config(config.auth)
  IF auth_validation IS Error THEN
    errors.push(auth_validation.message)
  END IF

  // Validate base URL
  TRY
    parsed_url <- parse_url(config.base_url)
    IF parsed_url.scheme NOT IN ["https", "http"] THEN
      errors.push("Base URL must use HTTPS or HTTP scheme")
    END IF
    IF parsed_url.scheme == "http" AND is_production_environment() THEN
      errors.push("HTTP is not allowed in production - use HTTPS")
    END IF
  CATCH ParseError
    errors.push("Invalid base URL format")
  END TRY

  // Validate GraphQL URL
  TRY
    graphql_url <- parse_url(config.graphql_url)
    IF graphql_url.scheme NOT IN ["https", "http"] THEN
      errors.push("GraphQL URL must use HTTPS or HTTP scheme")
    END IF
  CATCH ParseError
    errors.push("Invalid GraphQL URL format")
  END TRY

  // Validate API version format
  IF NOT is_valid_api_version(config.api_version) THEN
    errors.push("API version must be in YYYY-MM-DD format")
  END IF

  // Validate timeout
  IF config.timeout < 1s THEN
    errors.push("Timeout must be at least 1 second")
  ELSE IF config.timeout > 600s THEN
    errors.push("Timeout cannot exceed 600 seconds (10 minutes)")
  END IF

  // Validate max retries
  IF config.max_retries > 10 THEN
    errors.push("Max retries cannot exceed 10")
  END IF

  // Validate user agent
  IF config.user_agent.is_empty() THEN
    errors.push("User agent is required by GitHub API")
  END IF

  // Return result
  IF errors.is_empty() THEN
    RETURN Ok(())
  ELSE
    RETURN Error(ValidationError { messages: errors })
  END IF
END FUNCTION

FUNCTION validate_auth_config(auth: AuthConfig) -> Result<(), ValidationError>
  MATCH auth
    CASE AuthConfig::None:
      // Valid but limited - log warning
      log_warning("No authentication configured - API access will be severely limited")
      RETURN Ok(())

    CASE AuthConfig::PersonalAccessToken(token):
      IF token.expose_secret().is_empty() THEN
        RETURN Error("Personal access token is empty")
      END IF
      // Classic tokens don't have prefix, fine-grained have ghp_
      RETURN Ok(())

    CASE AuthConfig::GitHubApp { app_id, private_key, installation_id }:
      IF app_id == 0 THEN
        RETURN Error("GitHub App ID must be a positive integer")
      END IF
      IF private_key.expose_secret().is_empty() THEN
        RETURN Error("GitHub App private key is empty")
      END IF
      // Validate private key format (PEM)
      IF NOT private_key.expose_secret().contains("-----BEGIN") THEN
        RETURN Error("GitHub App private key must be in PEM format")
      END IF
      RETURN Ok(())

    CASE AuthConfig::OAuthToken(token):
      IF token.expose_secret().is_empty() THEN
        RETURN Error("OAuth token is empty")
      END IF
      RETURN Ok(())

    CASE AuthConfig::ActionsToken(token):
      IF token.expose_secret().is_empty() THEN
        RETURN Error("Actions token is empty")
      END IF
      IF NOT token.expose_secret().starts_with("ghs_") THEN
        log_warning("Actions token doesn't have expected ghs_ prefix")
      END IF
      RETURN Ok(())
  END MATCH
END FUNCTION

FUNCTION is_valid_api_version(version: String) -> bool
  // Format: YYYY-MM-DD
  TRY
    date <- parse_date(version, "YYYY-MM-DD")
    // Check reasonable date range (2022-01-01 to future)
    RETURN date >= Date(2022, 1, 1) AND date <= Date::now() + 365.days()
  CATCH
    RETURN false
  END TRY
END FUNCTION
```

### 3.2 Configuration Builder Pattern

```
STRUCT GitHubConfigBuilder {
  auth: Option<AuthConfig>,
  base_url: Option<String>,
  graphql_url: Option<String>,
  api_version: Option<String>,
  timeout: Option<Duration>,
  max_retries: Option<u32>,
  retry_config: Option<RetryConfig>,
  circuit_breaker_config: Option<CircuitBreakerConfig>,
  rate_limit_config: Option<RateLimitConfig>,
  user_agent: Option<String>
}

FUNCTION GitHubConfigBuilder::new() -> GitHubConfigBuilder
  RETURN GitHubConfigBuilder {
    auth: None,
    base_url: None,
    graphql_url: None,
    api_version: None,
    timeout: None,
    max_retries: None,
    retry_config: None,
    circuit_breaker_config: None,
    rate_limit_config: None,
    user_agent: None
  }
END FUNCTION

FUNCTION builder.personal_access_token(token: String) -> GitHubConfigBuilder
  self.auth <- Some(AuthConfig::PersonalAccessToken(SecretString::new(token)))
  RETURN self
END FUNCTION

FUNCTION builder.github_app(app_id: u64, private_key: String) -> GitHubConfigBuilder
  self.auth <- Some(AuthConfig::GitHubApp {
    app_id: app_id,
    private_key: SecretString::new(private_key),
    installation_id: None
  })
  RETURN self
END FUNCTION

FUNCTION builder.github_app_installation(
  app_id: u64,
  private_key: String,
  installation_id: u64
) -> GitHubConfigBuilder
  self.auth <- Some(AuthConfig::GitHubApp {
    app_id: app_id,
    private_key: SecretString::new(private_key),
    installation_id: Some(installation_id)
  })
  RETURN self
END FUNCTION

FUNCTION builder.oauth_token(token: String) -> GitHubConfigBuilder
  self.auth <- Some(AuthConfig::OAuthToken(SecretString::new(token)))
  RETURN self
END FUNCTION

FUNCTION builder.base_url(url: String) -> GitHubConfigBuilder
  self.base_url <- Some(url)
  RETURN self
END FUNCTION

FUNCTION builder.graphql_url(url: String) -> GitHubConfigBuilder
  self.graphql_url <- Some(url)
  RETURN self
END FUNCTION

FUNCTION builder.api_version(version: String) -> GitHubConfigBuilder
  self.api_version <- Some(version)
  RETURN self
END FUNCTION

FUNCTION builder.timeout(timeout: Duration) -> GitHubConfigBuilder
  self.timeout <- Some(timeout)
  RETURN self
END FUNCTION

FUNCTION builder.max_retries(retries: u32) -> GitHubConfigBuilder
  self.max_retries <- Some(retries)
  RETURN self
END FUNCTION

FUNCTION builder.retry_config(config: RetryConfig) -> GitHubConfigBuilder
  self.retry_config <- Some(config)
  RETURN self
END FUNCTION

FUNCTION builder.circuit_breaker_config(config: CircuitBreakerConfig) -> GitHubConfigBuilder
  self.circuit_breaker_config <- Some(config)
  RETURN self
END FUNCTION

FUNCTION builder.rate_limit_config(config: RateLimitConfig) -> GitHubConfigBuilder
  self.rate_limit_config <- Some(config)
  RETURN self
END FUNCTION

FUNCTION builder.user_agent(agent: String) -> GitHubConfigBuilder
  self.user_agent <- Some(agent)
  RETURN self
END FUNCTION

FUNCTION builder.build() -> Result<GitHubConfig, ConfigurationError>
  config <- GitHubConfig {
    auth: self.auth OR AuthConfig::None,
    base_url: Url::parse(self.base_url OR DEFAULT_BASE_URL)?,
    graphql_url: Url::parse(self.graphql_url OR DEFAULT_GRAPHQL_URL)?,
    api_version: self.api_version OR DEFAULT_API_VERSION,
    timeout: self.timeout OR DEFAULT_TIMEOUT,
    max_retries: self.max_retries OR DEFAULT_MAX_RETRIES,
    retry_config: self.retry_config OR RetryConfig::default(),
    circuit_breaker_config: self.circuit_breaker_config OR CircuitBreakerConfig::default(),
    rate_limit_config: self.rate_limit_config,
    user_agent: self.user_agent OR DEFAULT_USER_AGENT
  }

  // Validate before returning
  validate_config(config)?

  RETURN Ok(config)
END FUNCTION
```

### 3.3 Default Constants

```
CONST DEFAULT_BASE_URL = "https://api.github.com"
CONST DEFAULT_GRAPHQL_URL = "https://api.github.com/graphql"
CONST DEFAULT_API_VERSION = "2022-11-28"
CONST DEFAULT_TIMEOUT = Duration::from_secs(30)
CONST DEFAULT_MAX_RETRIES = 3
CONST DEFAULT_CONNECT_TIMEOUT = Duration::from_secs(10)
CONST DEFAULT_CONNECTION_POOL_SIZE = 20
CONST DEFAULT_USER_AGENT = "integrations-github/1.0.0"

// Rate limit defaults
CONST DEFAULT_CORE_RATE_LIMIT = 5000        // requests/hour with auth
CONST DEFAULT_SEARCH_RATE_LIMIT = 30        // requests/minute
CONST DEFAULT_GRAPHQL_RATE_LIMIT = 5000     // points/hour
CONST DEFAULT_UNAUTHENTICATED_LIMIT = 60    // requests/hour without auth

// Retry defaults
CONST DEFAULT_INITIAL_BACKOFF = Duration::from_secs(1)
CONST DEFAULT_MAX_BACKOFF = Duration::from_secs(60)
CONST DEFAULT_BACKOFF_MULTIPLIER = 2.0
CONST DEFAULT_JITTER = 0.1
```

---

## 4. Authentication Manager

### 4.1 Auth Manager Interface (London-School TDD Contract)

```
// Interface for authentication - mockable for testing
TRAIT AuthManager {
  // Get authentication headers for a request
  ASYNC FUNCTION get_headers() -> Result<HeaderMap, GitHubError>

  // Get the authentication type name (for logging)
  FUNCTION auth_type_name() -> String

  // Refresh authentication if needed (for GitHub App tokens)
  ASYNC FUNCTION refresh_if_needed() -> Result<(), GitHubError>

  // Check if authentication is configured
  FUNCTION is_authenticated() -> bool

  // Sanitize headers for logging (redact sensitive values)
  FUNCTION sanitize_headers_for_logging(headers: HeaderMap) -> HashMap<String, String>
}

// Production implementation
STRUCT AuthManagerImpl {
  auth_config: AuthConfig,
  // For GitHub App: cached installation token
  cached_token: RwLock<Option<CachedToken>>,
  logger: Logger
}

STRUCT CachedToken {
  token: SecretString,
  expires_at: DateTime<Utc>
}

// Mock implementation for testing
STRUCT MockAuthManager {
  expected_headers: HeaderMap,
  call_count: AtomicUsize
}
```

### 4.2 Auth Manager Initialization

```
FUNCTION create_auth_manager(auth_config: AuthConfig) -> AuthManager
  RETURN AuthManagerImpl {
    auth_config: auth_config,
    cached_token: RwLock::new(None),
    logger: get_logger("github.auth")
  }
END FUNCTION
```

### 4.3 Header Generation for Different Auth Types

```
FUNCTION auth_manager.get_headers() -> Result<HeaderMap, GitHubError>
  headers <- HeaderMap::new()

  MATCH self.auth_config
    CASE AuthConfig::None:
      // No auth headers needed
      self.logger.debug("Making unauthenticated request")

    CASE AuthConfig::PersonalAccessToken(token):
      headers.insert("Authorization", format("Bearer {}", token.expose_secret()))

    CASE AuthConfig::OAuthToken(token):
      headers.insert("Authorization", format("Bearer {}", token.expose_secret()))

    CASE AuthConfig::ActionsToken(token):
      headers.insert("Authorization", format("Bearer {}", token.expose_secret()))

    CASE AuthConfig::GitHubApp { app_id, private_key, installation_id }:
      // GitHub App requires JWT for app-level or installation token
      token <- self.get_github_app_token(app_id, private_key, installation_id).await?
      headers.insert("Authorization", format("Bearer {}", token.expose_secret()))
  END MATCH

  RETURN Ok(headers)
END FUNCTION

FUNCTION auth_manager.get_github_app_token(
  app_id: u64,
  private_key: SecretString,
  installation_id: Option<u64>
) -> Result<SecretString, GitHubError>

  // Check if we have a cached installation token that's still valid
  cached <- self.cached_token.read()
  IF cached IS Some AND cached.expires_at > Utc::now() + 5.minutes() THEN
    RETURN Ok(cached.token.clone())
  END IF
  DROP cached

  // Generate new token
  IF installation_id IS Some THEN
    // Get installation access token
    token <- self.get_installation_token(app_id, private_key, installation_id.unwrap()).await?
    RETURN Ok(token)
  ELSE
    // Use JWT for app-level requests
    jwt <- generate_github_app_jwt(app_id, private_key)?
    RETURN Ok(SecretString::new(jwt))
  END IF
END FUNCTION

FUNCTION auth_manager.get_installation_token(
  app_id: u64,
  private_key: SecretString,
  installation_id: u64
) -> Result<SecretString, GitHubError>

  // Step 1: Generate JWT for the GitHub App
  jwt <- generate_github_app_jwt(app_id, private_key)?

  // Step 2: Request installation access token
  // POST /app/installations/{installation_id}/access_tokens
  // Authorization: Bearer <JWT>

  request <- HttpRequest {
    method: POST,
    url: format("{}/app/installations/{}/access_tokens", DEFAULT_BASE_URL, installation_id),
    headers: HeaderMap::from([
      ("Authorization", format("Bearer {}", jwt)),
      ("Accept", "application/vnd.github+json"),
      ("X-GitHub-Api-Version", DEFAULT_API_VERSION)
    ]),
    body: None,
    timeout: Some(Duration::from_secs(10))
  }

  // Note: This bypasses retry/circuit breaker to avoid recursion
  response <- direct_http_send(request).await?

  IF response.status != 201 THEN
    RETURN Error(AuthenticationError::AppAuthenticationFailed {
      message: format("Failed to get installation token: {}", response.status)
    })
  END IF

  token_response <- parse_json::<InstallationTokenResponse>(response.body)?

  // Cache the token
  cached_token <- CachedToken {
    token: SecretString::new(token_response.token),
    expires_at: parse_iso8601(token_response.expires_at)?
  }

  self.cached_token.write().replace(cached_token.clone())

  self.logger.info("Obtained GitHub App installation token", {
    installation_id: installation_id,
    expires_at: token_response.expires_at
  })

  RETURN Ok(cached_token.token)
END FUNCTION

STRUCT InstallationTokenResponse {
  token: String,
  expires_at: String,
  permissions: HashMap<String, String>,
  repository_selection: String
}
```

### 4.4 JWT Generation for GitHub Apps

```
FUNCTION generate_github_app_jwt(app_id: u64, private_key: SecretString) -> Result<String, GitHubError>
  // GitHub App JWTs have specific requirements:
  // - Algorithm: RS256
  // - Issued at (iat): Current time - 60 seconds (clock drift tolerance)
  // - Expiration (exp): Maximum 10 minutes from issued time
  // - Issuer (iss): GitHub App ID

  now <- Utc::now()

  claims <- JwtClaims {
    iat: (now - 60.seconds()).timestamp(),
    exp: (now + 9.minutes()).timestamp(),  // 9 min to allow for processing time
    iss: app_id.to_string()
  }

  // Parse PEM private key
  TRY
    key <- parse_rsa_private_key_pem(private_key.expose_secret())?
  CATCH ParseError AS e
    RETURN Error(ConfigurationError::InvalidAppCredentials {
      message: format("Failed to parse private key: {}", e)
    })
  END TRY

  // Sign JWT with RS256
  TRY
    jwt <- sign_jwt_rs256(claims, key)?
    RETURN Ok(jwt)
  CATCH SignError AS e
    RETURN Error(ConfigurationError::InvalidAppCredentials {
      message: format("Failed to sign JWT: {}", e)
    })
  END TRY
END FUNCTION
```

### 4.5 Header Sanitization for Logging

```
FUNCTION auth_manager.sanitize_headers_for_logging(headers: HeaderMap) -> HashMap<String, String>
  CONST SENSITIVE_HEADERS = [
    "authorization",
    "x-github-token"
  ]

  sanitized <- HashMap::new()

  FOR EACH (key, value) IN headers DO
    key_lower <- key.to_lowercase()

    IF key_lower IN SENSITIVE_HEADERS THEN
      // Show type of auth but redact token
      IF value.starts_with("Bearer ") THEN
        token <- value[7..]
        IF token.starts_with("ghp_") THEN
          sanitized.insert(key_lower, "Bearer ghp_[REDACTED]")
        ELSE IF token.starts_with("ghs_") THEN
          sanitized.insert(key_lower, "Bearer ghs_[REDACTED]")
        ELSE IF token.starts_with("gho_") THEN
          sanitized.insert(key_lower, "Bearer gho_[REDACTED]")
        ELSE IF token.starts_with("ghu_") THEN
          sanitized.insert(key_lower, "Bearer ghu_[REDACTED]")
        ELSE
          sanitized.insert(key_lower, "Bearer [REDACTED]")
        END IF
      ELSE
        sanitized.insert(key_lower, "[REDACTED]")
      END IF
    ELSE
      // Safe to log
      sanitized.insert(key_lower, value.to_string())
    END IF
  END FOR

  RETURN sanitized
END FUNCTION

FUNCTION auth_manager.auth_type_name() -> String
  MATCH self.auth_config
    CASE AuthConfig::None:
      RETURN "none"
    CASE AuthConfig::PersonalAccessToken(_):
      RETURN "personal_access_token"
    CASE AuthConfig::GitHubApp { .. }:
      RETURN "github_app"
    CASE AuthConfig::OAuthToken(_):
      RETURN "oauth"
    CASE AuthConfig::ActionsToken(_):
      RETURN "actions"
  END MATCH
END FUNCTION

FUNCTION auth_manager.is_authenticated() -> bool
  MATCH self.auth_config
    CASE AuthConfig::None:
      RETURN false
    CASE _:
      RETURN true
  END MATCH
END FUNCTION

FUNCTION auth_manager.refresh_if_needed() -> Result<(), GitHubError>
  MATCH self.auth_config
    CASE AuthConfig::GitHubApp { app_id, private_key, installation_id }:
      IF installation_id IS Some THEN
        // Check if cached token needs refresh
        cached <- self.cached_token.read()
        IF cached IS None OR cached.expires_at < Utc::now() + 5.minutes() THEN
          DROP cached
          // Force refresh
          _ <- self.get_installation_token(app_id, private_key, installation_id.unwrap()).await?
        END IF
      END IF
      RETURN Ok(())

    CASE _:
      // Other auth types don't need refresh
      RETURN Ok(())
  END MATCH
END FUNCTION
```

---

## 5. HTTP Transport Layer

### 5.1 Transport Interface (London-School TDD Contract)

```
// Interface that can be mocked for testing
TRAIT HttpTransport {
  // Send a standard HTTP request
  ASYNC FUNCTION send(request: HttpRequest) -> Result<HttpResponse, TransportError>

  // Send a request and receive raw bytes (for file downloads)
  ASYNC FUNCTION send_raw(request: HttpRequest) -> Result<Bytes, TransportError>
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
  call_history: Mutex<Vec<HttpRequest>>
}
```

### 5.2 Transport Initialization

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
    .redirect(RedirectPolicy::limited(10))  // Follow up to 10 redirects
    .gzip(true)  // Enable gzip compression

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
    logger: get_logger("github.transport")
  }
END FUNCTION
```

### 5.3 Request Execution

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

### 5.4 Raw Download Execution

```
FUNCTION transport.send_raw(request: HttpRequest) -> Result<Bytes, TransportError>
  start_time <- now()
  request_id <- generate_request_id()

  self.logger.debug("Sending download request", {
    request_id,
    method: request.method,
    url: request.url.to_string()
  })

  TRY
    // Execute request
    response <- self.client
      .execute(request)
      .timeout(request.timeout OR self.default_timeout)
      .await

    latency <- now() - start_time

    IF NOT response.status().is_success() THEN
      RETURN Error(TransportError::HttpError {
        status: response.status(),
        body: response.bytes().await?
      })
    END IF

    // Stream body to bytes
    bytes <- response.bytes().await?

    self.logger.debug("Download completed", {
      request_id,
      size_bytes: bytes.len(),
      latency_ms: latency.as_millis()
    })

    RETURN Ok(bytes)

  CATCH error
    latency <- now() - start_time
    self.logger.error("Download failed", {
      request_id,
      error: error.to_string(),
      latency_ms: latency.as_millis()
    })

    RETURN Error(map_transport_error(error))
  END TRY
END FUNCTION
```

---

## 6. Request Builder

### 6.1 Base Request Building

```
FUNCTION build_request(
  method: HttpMethod,
  endpoint: String,
  base_url: Url,
  auth_manager: AuthManager,
  api_version: String,
  user_agent: String,
  body: Option<RequestBody>,
  extra_headers: HeaderMap,
  query_params: Option<HashMap<String, String>>
) -> Result<HttpRequest, RequestError>

  // Step 1: Build URL with query parameters
  normalized_endpoint <- IF endpoint.starts_with("/") THEN
    endpoint
  ELSE
    "/" + endpoint
  END IF

  url <- base_url.join(normalized_endpoint)?

  IF query_params IS Some THEN
    query <- url.query_pairs_mut()
    FOR EACH (key, value) IN query_params DO
      query.append_pair(key, value)
    END FOR
  END IF

  // Step 2: Create request builder
  request_builder <- HttpRequest::builder()
    .method(method)
    .url(url)

  // Step 3: Add authentication headers
  auth_headers <- auth_manager.get_headers().await?
  FOR EACH (key, value) IN auth_headers DO
    request_builder.header(key, value)
  END FOR

  // Step 4: Add standard GitHub headers
  request_builder.header("Accept", "application/vnd.github+json")
  request_builder.header("X-GitHub-Api-Version", api_version)
  request_builder.header("User-Agent", user_agent)

  // Step 5: Add content type for requests with body
  IF body IS Some THEN
    request_builder.header("Content-Type", "application/json")
  END IF

  // Step 6: Add extra headers (can override defaults)
  FOR EACH (key, value) IN extra_headers DO
    request_builder.header(key, value)
  END FOR

  // Step 7: Add body if present
  IF body IS Some THEN
    serialized <- serialize_json(body.data)?
    request_builder.body(serialized)
  END IF

  // Step 8: Build and return
  RETURN Ok(request_builder.build())
END FUNCTION
```

### 6.2 Request Body Serialization

```
FUNCTION serialize_request_body<T: Serialize>(body: T) -> Result<Bytes, RequestError>
  TRY
    json_string <- serialize_json(body)

    // Log body size for debugging (not content)
    log_debug("Request body serialized", {
      size_bytes: json_string.len()
    })

    // Check size limits (GitHub allows up to 100MB for some endpoints)
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

CONST MAX_REQUEST_BODY_SIZE = 100 * 1024 * 1024  // 100 MB
```

### 6.3 URL Path Construction

```
FUNCTION build_repo_path(owner: String, repo: String, path: String) -> String
  // Encode path segments
  encoded_owner <- url_encode_path_segment(owner)
  encoded_repo <- url_encode_path_segment(repo)

  RETURN format("/repos/{}/{}{}", encoded_owner, encoded_repo, path)
END FUNCTION

FUNCTION build_org_path(org: String, path: String) -> String
  encoded_org <- url_encode_path_segment(org)
  RETURN format("/orgs/{}{}", encoded_org, path)
END FUNCTION

FUNCTION build_user_path(username: String, path: String) -> String
  encoded_username <- url_encode_path_segment(username)
  RETURN format("/users/{}{}", encoded_username, path)
END FUNCTION

FUNCTION url_encode_path_segment(segment: String) -> String
  // URL encode but preserve valid path characters
  RETURN percent_encode(segment, NON_ALPHANUMERIC)
END FUNCTION
```

---

## 7. Response Parser

### 7.1 JSON Response Parsing

```
FUNCTION parse_response<T: Deserialize>(
  response: HttpResponse,
  rate_limit_tracker: RateLimitTracker,
  logger: Logger
) -> Result<T, GitHubError>

  // Step 1: Update rate limit tracking from headers
  rate_limit_tracker.update_from_headers(response.headers)

  // Step 2: Check for success status
  IF NOT response.status.is_success() THEN
    RETURN Error(parse_error_response(response.status, response.body, response.headers))
  END IF

  // Step 3: Check content type
  content_type <- response.headers.get("Content-Type")
  IF content_type IS None OR NOT content_type.contains("application/json") THEN
    // GitHub sometimes returns other content types for success responses
    // (e.g., application/vnd.github+json)
    IF content_type IS Some AND NOT content_type.contains("github") THEN
      logger.warn("Unexpected content type", {
        content_type: content_type,
        status: response.status.as_u16()
      })
    END IF
  END IF

  // Step 4: Get body bytes
  body_bytes <- response.body

  // Step 5: Handle empty body
  IF body_bytes.is_empty() THEN
    // Some endpoints return 204 No Content
    IF response.status == 204 THEN
      // Try to return default/empty value if type supports it
      TRY
        RETURN Ok(T::default())
      CATCH
        RETURN Error(ResponseError::EmptyResponse)
      END TRY
    END IF
    RETURN Error(ResponseError::EmptyResponse)
  END IF

  // Step 6: Attempt deserialization
  TRY
    parsed <- deserialize_json::<T>(body_bytes)?
    RETURN Ok(parsed)

  CATCH DeserializeError AS e
    logger.error("Failed to parse response", {
      error: e.to_string(),
      body_preview: truncate(utf8_lossy(body_bytes), 500),
      status: response.status.as_u16()
    })

    RETURN Error(ResponseError::DeserializationError {
      message: e.to_string(),
      body_preview: truncate(utf8_lossy(body_bytes), 200)
    })
  END TRY
END FUNCTION
```

### 7.2 Error Response Parsing

```
FUNCTION parse_error_response(
  status: StatusCode,
  body: Bytes,
  headers: HeaderMap
) -> GitHubError

  // Try to parse as GitHub error response
  TRY
    error_response <- deserialize_json::<GitHubErrorResponse>(body)?

    // Map to specific error type based on status and error info
    MATCH status.as_u16()
      CASE 400:
        RETURN RequestError::ValidationError {
          message: error_response.message,
          errors: error_response.errors,
          documentation_url: error_response.documentation_url
        }

      CASE 401:
        IF contains_any(error_response.message, ["Bad credentials", "token"]) THEN
          RETURN AuthenticationError::InvalidToken {
            message: error_response.message
          }
        ELSE IF contains(error_response.message, "expired") THEN
          RETURN AuthenticationError::ExpiredToken {
            message: error_response.message
          }
        ELSE
          RETURN AuthenticationError::BadCredentials {
            message: error_response.message
          }
        END IF

      CASE 403:
        // Check for rate limiting (special 403 case)
        IF contains(error_response.message, "rate limit") THEN
          retry_after <- parse_rate_limit_reset(headers)
          IF headers.get("X-RateLimit-Remaining") == Some("0") THEN
            RETURN RateLimitError::PrimaryRateLimitExceeded {
              message: error_response.message,
              limit: parse_u32(headers.get("X-RateLimit-Limit")),
              remaining: 0,
              reset: parse_timestamp(headers.get("X-RateLimit-Reset")),
              documentation_url: error_response.documentation_url
            }
          ELSE
            RETURN RateLimitError::SecondaryRateLimitExceeded {
              message: error_response.message,
              retry_after: retry_after,
              documentation_url: error_response.documentation_url
            }
          END IF
        ELSE IF contains(error_response.message, "abuse") THEN
          retry_after <- parse_retry_after(headers)
          RETURN RateLimitError::AbuseDetected {
            message: error_response.message,
            retry_after: retry_after,
            documentation_url: error_response.documentation_url
          }
        ELSE IF contains(error_response.message, "SSO") THEN
          RETURN AuthorizationError::SsoRequired {
            message: error_response.message
          }
        ELSE
          RETURN AuthorizationError::Forbidden {
            message: error_response.message
          }
        END IF

      CASE 404:
        RETURN ResourceError::NotFound {
          message: error_response.message,
          documentation_url: error_response.documentation_url
        }

      CASE 409:
        RETURN ResourceError::Conflict {
          message: error_response.message
        }

      CASE 410:
        RETURN ResourceError::Gone {
          message: error_response.message
        }

      CASE 422:
        RETURN RequestError::UnprocessableEntity {
          message: error_response.message,
          errors: error_response.errors
        }

      CASE 429:
        retry_after <- parse_retry_after(headers)
        RETURN RateLimitError::SecondaryRateLimitExceeded {
          message: error_response.message,
          retry_after: retry_after,
          documentation_url: error_response.documentation_url
        }

      CASE 500:
        RETURN ServerError::InternalError {
          message: error_response.message
        }

      CASE 502:
        RETURN ServerError::BadGateway {
          message: error_response.message
        }

      CASE 503:
        retry_after <- parse_retry_after(headers)
        RETURN ServerError::ServiceUnavailable {
          message: error_response.message,
          retry_after: retry_after
        }

      CASE _:
        RETURN ServerError::InternalError {
          message: error_response.message
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

STRUCT GitHubErrorResponse {
  message: String,
  errors: Option<Vec<GitHubFieldError>>,
  documentation_url: Option<String>
}

STRUCT GitHubFieldError {
  resource: String,
  field: String,
  code: String,
  message: Option<String>
}
```

### 7.3 Retry-After Header Parsing

```
FUNCTION parse_retry_after(headers: HeaderMap) -> Option<Duration>
  // Check standard Retry-After header
  retry_after_header <- headers.get("Retry-After")

  IF retry_after_header IS Some THEN
    TRY
      seconds <- parse_u64(retry_after_header)
      RETURN Some(Duration::from_secs(seconds))
    CATCH
      // Could not parse as seconds
      RETURN None
    END TRY
  END IF

  RETURN None
END FUNCTION

FUNCTION parse_rate_limit_reset(headers: HeaderMap) -> Option<DateTime<Utc>>
  reset_header <- headers.get("X-RateLimit-Reset")

  IF reset_header IS Some THEN
    TRY
      timestamp <- parse_u64(reset_header)
      RETURN Some(DateTime::from_timestamp(timestamp, 0))
    CATCH
      RETURN None
    END TRY
  END IF

  RETURN None
END FUNCTION
```

---

## 8. Pagination Handler

### 8.1 Pagination Interface

```
TRAIT Paginator<T> {
  // Get the current page of results
  FUNCTION current_page() -> &Paginated<T>

  // Fetch the next page
  ASYNC FUNCTION next_page() -> Result<Option<Paginated<T>>, GitHubError>

  // Check if there are more pages
  FUNCTION has_next() -> bool

  // Collect all remaining items
  ASYNC FUNCTION collect_all() -> Result<Vec<T>, GitHubError>

  // Create an async iterator over pages
  FUNCTION pages() -> PagesIterator<T>

  // Create an async iterator over individual items
  FUNCTION items() -> ItemsIterator<T>
}

STRUCT Paginated<T> {
  items: Vec<T>,
  total_count: Option<u64>,
  next_page: Option<String>,
  prev_page: Option<String>,
  first_page: Option<String>,
  last_page: Option<String>
}
```

### 8.2 Link Header Parsing

```
FUNCTION parse_link_header(headers: HeaderMap) -> PaginationLinks
  link_header <- headers.get("Link")

  IF link_header IS None THEN
    RETURN PaginationLinks::empty()
  END IF

  links <- PaginationLinks {
    next: None,
    prev: None,
    first: None,
    last: None
  }

  // Parse Link header format: <url>; rel="type", <url>; rel="type"
  // Example: <https://api.github.com/...?page=2>; rel="next", <https://api.github.com/...?page=5>; rel="last"

  parts <- link_header.split(",")

  FOR EACH part IN parts DO
    part <- part.trim()

    // Extract URL between < and >
    url_start <- part.find("<")
    url_end <- part.find(">")

    IF url_start IS None OR url_end IS None THEN
      CONTINUE
    END IF

    url <- part[url_start + 1..url_end]

    // Extract rel type
    IF part.contains("rel=\"next\"") THEN
      links.next <- Some(url.to_string())
    ELSE IF part.contains("rel=\"prev\"") THEN
      links.prev <- Some(url.to_string())
    ELSE IF part.contains("rel=\"first\"") THEN
      links.first <- Some(url.to_string())
    ELSE IF part.contains("rel=\"last\"") THEN
      links.last <- Some(url.to_string())
    END IF
  END FOR

  RETURN links
END FUNCTION

STRUCT PaginationLinks {
  next: Option<String>,
  prev: Option<String>,
  first: Option<String>,
  last: Option<String>
}
```

### 8.3 Paginator Implementation

```
STRUCT PaginatorImpl<T> {
  transport: Arc<HttpTransport>,
  auth_manager: Arc<AuthManager>,
  rate_limit_tracker: Arc<RateLimitTracker>,
  api_version: String,
  user_agent: String,
  current: Option<Paginated<T>>,
  logger: Logger
}

FUNCTION PaginatorImpl::new<T>(
  initial_response: HttpResponse,
  transport: Arc<HttpTransport>,
  auth_manager: Arc<AuthManager>,
  rate_limit_tracker: Arc<RateLimitTracker>,
  api_version: String,
  user_agent: String,
  logger: Logger
) -> Result<PaginatorImpl<T>, GitHubError>

  // Parse initial response
  items <- parse_response::<Vec<T>>(initial_response.clone(), rate_limit_tracker.clone(), logger.clone())?

  // Parse pagination links
  links <- parse_link_header(initial_response.headers)

  // Try to get total count (if header present)
  total_count <- initial_response.headers
    .get("X-Total-Count")
    .and_then(parse_u64)

  paginated <- Paginated {
    items: items,
    total_count: total_count,
    next_page: links.next,
    prev_page: links.prev,
    first_page: links.first,
    last_page: links.last
  }

  RETURN Ok(PaginatorImpl {
    transport: transport,
    auth_manager: auth_manager,
    rate_limit_tracker: rate_limit_tracker,
    api_version: api_version,
    user_agent: user_agent,
    current: Some(paginated),
    logger: logger
  })
END FUNCTION

FUNCTION paginator.current_page() -> &Paginated<T>
  RETURN self.current.as_ref().unwrap()
END FUNCTION

FUNCTION paginator.has_next() -> bool
  IF self.current IS None THEN
    RETURN false
  END IF
  RETURN self.current.as_ref().unwrap().next_page IS Some
END FUNCTION

ASYNC FUNCTION paginator.next_page() -> Result<Option<Paginated<T>>, GitHubError>
  IF NOT self.has_next() THEN
    RETURN Ok(None)
  END IF

  next_url <- self.current.as_ref().unwrap().next_page.clone().unwrap()

  self.logger.debug("Fetching next page", {
    url: next_url.clone()
  })

  // Build request for next page
  auth_headers <- self.auth_manager.get_headers().await?

  request <- HttpRequest {
    method: GET,
    url: Url::parse(next_url)?,
    headers: auth_headers
      .with("Accept", "application/vnd.github+json")
      .with("X-GitHub-Api-Version", self.api_version.clone())
      .with("User-Agent", self.user_agent.clone()),
    body: None,
    timeout: None
  }

  response <- self.transport.send(request).await?

  // Parse response
  items <- parse_response::<Vec<T>>(response.clone(), self.rate_limit_tracker.clone(), self.logger.clone())?
  links <- parse_link_header(response.headers)

  paginated <- Paginated {
    items: items,
    total_count: self.current.as_ref().unwrap().total_count,  // Preserve from first page
    next_page: links.next,
    prev_page: links.prev,
    first_page: links.first,
    last_page: links.last
  }

  self.current <- Some(paginated.clone())

  RETURN Ok(Some(paginated))
END FUNCTION

ASYNC FUNCTION paginator.collect_all() -> Result<Vec<T>, GitHubError>
  all_items <- Vec::new()

  // Add current page items
  IF self.current IS Some THEN
    all_items.extend(self.current.as_ref().unwrap().items.clone())
  END IF

  // Fetch remaining pages
  WHILE self.has_next() DO
    next <- self.next_page().await?
    IF next IS Some THEN
      all_items.extend(next.items)
    END IF
  END WHILE

  self.logger.debug("Collected all pages", {
    total_items: all_items.len()
  })

  RETURN Ok(all_items)
END FUNCTION
```

### 8.4 Async Iterators

```
STRUCT PagesIterator<T> {
  paginator: PaginatorImpl<T>,
  first_yielded: bool
}

IMPL AsyncIterator FOR PagesIterator<T> {
  TYPE Item = Result<Vec<T>, GitHubError>

  ASYNC FUNCTION next() -> Option<Self::Item>
    IF NOT self.first_yielded THEN
      self.first_yielded <- true
      IF self.paginator.current IS Some THEN
        RETURN Some(Ok(self.paginator.current.as_ref().unwrap().items.clone()))
      ELSE
        RETURN None
      END IF
    END IF

    IF NOT self.paginator.has_next() THEN
      RETURN None
    END IF

    MATCH self.paginator.next_page().await
      CASE Ok(Some(page)):
        RETURN Some(Ok(page.items))
      CASE Ok(None):
        RETURN None
      CASE Err(e):
        RETURN Some(Err(e))
    END MATCH
  END FUNCTION
}

STRUCT ItemsIterator<T> {
  pages_iterator: PagesIterator<T>,
  current_page_items: Vec<T>,
  current_index: usize
}

IMPL AsyncIterator FOR ItemsIterator<T> {
  TYPE Item = Result<T, GitHubError>

  ASYNC FUNCTION next() -> Option<Self::Item>
    // Return next item from current page if available
    IF self.current_index < self.current_page_items.len() THEN
      item <- self.current_page_items[self.current_index].clone()
      self.current_index <- self.current_index + 1
      RETURN Some(Ok(item))
    END IF

    // Fetch next page
    MATCH self.pages_iterator.next().await
      CASE Some(Ok(items)):
        IF items.is_empty() THEN
          RETURN None
        END IF
        self.current_page_items <- items
        self.current_index <- 1
        RETURN Some(Ok(self.current_page_items[0].clone()))
      CASE Some(Err(e)):
        RETURN Some(Err(e))
      CASE None:
        RETURN None
    END MATCH
  END FUNCTION
}
```

---

## 9. Rate Limit Tracker

### 9.1 Rate Limit Tracker Interface

```
TRAIT RateLimitTracker {
  // Update tracking from response headers
  FUNCTION update_from_headers(headers: HeaderMap)

  // Get current rate limit status for a resource
  FUNCTION get_status(resource: RateLimitResource) -> Option<ResourceRateLimit>

  // Check if we should wait before making a request
  FUNCTION should_wait(resource: RateLimitResource) -> Option<Duration>

  // Get all current rate limit statuses
  FUNCTION get_all_statuses() -> HashMap<RateLimitResource, ResourceRateLimit>
}

ENUM RateLimitResource {
  Core,
  Search,
  GraphQL,
  CodeScanningUpload,
  ActionsRunnerRegistration,
  Unknown(String)
}

STRUCT ResourceRateLimit {
  limit: u32,
  remaining: u32,
  reset: DateTime<Utc>,
  used: u32
}
```

### 9.2 Rate Limit Tracker Implementation

```
STRUCT RateLimitTrackerImpl {
  statuses: RwLock<HashMap<RateLimitResource, ResourceRateLimit>>,
  throttle_threshold_percent: u8,  // Start throttling at this percentage remaining
  logger: Logger
}

FUNCTION RateLimitTrackerImpl::new() -> RateLimitTrackerImpl
  RETURN RateLimitTrackerImpl {
    statuses: RwLock::new(HashMap::new()),
    throttle_threshold_percent: 10,  // Default: throttle when <10% remaining
    logger: get_logger("github.rate_limit")
  }
END FUNCTION

FUNCTION tracker.update_from_headers(headers: HeaderMap)
  // Parse rate limit headers
  limit <- headers.get("X-RateLimit-Limit").and_then(parse_u32)
  remaining <- headers.get("X-RateLimit-Remaining").and_then(parse_u32)
  reset <- headers.get("X-RateLimit-Reset").and_then(parse_timestamp)
  used <- headers.get("X-RateLimit-Used").and_then(parse_u32)
  resource <- headers.get("X-RateLimit-Resource")

  IF limit IS None OR remaining IS None OR reset IS None THEN
    // No rate limit headers present
    RETURN
  END IF

  // Determine resource type
  resource_type <- MATCH resource
    CASE Some("core"): RateLimitResource::Core
    CASE Some("search"): RateLimitResource::Search
    CASE Some("graphql"): RateLimitResource::GraphQL
    CASE Some("code_scanning_upload"): RateLimitResource::CodeScanningUpload
    CASE Some("actions_runner_registration"): RateLimitResource::ActionsRunnerRegistration
    CASE Some(other): RateLimitResource::Unknown(other.to_string())
    CASE None: RateLimitResource::Core  // Default to core
  END MATCH

  status <- ResourceRateLimit {
    limit: limit.unwrap(),
    remaining: remaining.unwrap(),
    reset: reset.unwrap(),
    used: used OR 0
  }

  // Update status
  self.statuses.write().insert(resource_type, status.clone())

  // Log if approaching limit
  percent_remaining <- (status.remaining as f64 / status.limit as f64) * 100.0
  IF percent_remaining < self.throttle_threshold_percent as f64 THEN
    self.logger.warn("Approaching rate limit", {
      resource: resource_type.to_string(),
      remaining: status.remaining,
      limit: status.limit,
      reset: status.reset.to_rfc3339(),
      percent_remaining: percent_remaining
    })
  END IF
END FUNCTION

FUNCTION tracker.get_status(resource: RateLimitResource) -> Option<ResourceRateLimit>
  RETURN self.statuses.read().get(resource).cloned()
END FUNCTION

FUNCTION tracker.should_wait(resource: RateLimitResource) -> Option<Duration>
  status <- self.get_status(resource)

  IF status IS None THEN
    RETURN None
  END IF

  status <- status.unwrap()
  now <- Utc::now()

  // If we've exceeded the limit and reset is in the future
  IF status.remaining == 0 AND status.reset > now THEN
    wait_duration <- (status.reset - now).to_std().ok()?

    self.logger.info("Rate limited - waiting for reset", {
      resource: resource.to_string(),
      wait_seconds: wait_duration.as_secs()
    })

    RETURN Some(wait_duration)
  END IF

  // If approaching limit, add small delay
  percent_remaining <- (status.remaining as f64 / status.limit as f64) * 100.0
  IF percent_remaining < self.throttle_threshold_percent as f64 AND status.remaining > 0 THEN
    // Proportional backoff: less remaining = longer wait
    base_delay_ms <- ((self.throttle_threshold_percent as f64 - percent_remaining) * 100.0) as u64

    self.logger.debug("Throttling due to low rate limit", {
      resource: resource.to_string(),
      remaining: status.remaining,
      delay_ms: base_delay_ms
    })

    RETURN Some(Duration::from_millis(base_delay_ms))
  END IF

  RETURN None
END FUNCTION

FUNCTION tracker.get_all_statuses() -> HashMap<RateLimitResource, ResourceRateLimit>
  RETURN self.statuses.read().clone()
END FUNCTION
```

### 9.3 Integration with Request Execution

```
FUNCTION execute_with_rate_limit_tracking<T>(
  operation: String,
  resource: RateLimitResource,
  rate_limit_tracker: RateLimitTracker,
  action: AsyncFn() -> Result<T, GitHubError>
) -> Result<T, GitHubError>

  // Check if we should wait before making request
  wait_duration <- rate_limit_tracker.should_wait(resource)
  IF wait_duration IS Some THEN
    // Sleep for the required duration
    sleep(wait_duration.unwrap()).await
  END IF

  // Execute the action
  RETURN action().await
END FUNCTION
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial pseudocode (Part 1) |

---

**Continued in Part 2: Resilience Orchestration, Repositories Service, Issues Service, Pull Requests Service**
