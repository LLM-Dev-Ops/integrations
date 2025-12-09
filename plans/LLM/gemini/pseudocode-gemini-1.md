# SPARC Pseudocode: Google Gemini Integration Module

**Part 1 of 3: Core Infrastructure**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/gemini`

---

## Table of Contents

1. [Pseudocode Conventions](#1-pseudocode-conventions)
2. [Client Initialization](#2-client-initialization)
3. [Configuration Management](#3-configuration-management)
4. [HTTP Transport Layer](#4-http-transport-layer)
5. [Request Builder](#5-request-builder)
6. [Response Parser](#6-response-parser)
7. [Authentication Manager](#7-authentication-manager)
8. [Resilience Orchestrator](#8-resilience-orchestrator)

---

## 1. Pseudocode Conventions

### 1.1 Notation Standards

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PSEUDOCODE CONVENTIONS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Keywords:                                                                  │
│  • FUNCTION      - Function/method definition                               │
│  • ASYNC FUNCTION - Asynchronous function                                   │
│  • RETURNS       - Return type specification                                │
│  • IF/THEN/ELSE  - Conditional logic                                        │
│  • FOR EACH      - Iteration                                                │
│  • WHILE         - Loop construct                                           │
│  • TRY/CATCH     - Error handling                                           │
│  • THROW         - Raise exception/error                                    │
│  • AWAIT         - Await async operation                                    │
│  • MATCH         - Pattern matching                                         │
│                                                                             │
│  Type Annotations:                                                          │
│  • param: Type   - Parameter with type                                      │
│  • -> Type       - Return type                                              │
│  • Option<T>     - Optional value                                           │
│  • Result<T, E>  - Success or error                                         │
│  • Vec<T>        - Dynamic array/list                                       │
│  • Map<K, V>     - Key-value map                                            │
│                                                                             │
│  Comments:                                                                  │
│  • // Comment    - Single line                                              │
│  • /* ... */     - Multi-line                                               │
│  • [MOCK]        - Mockable dependency                                      │
│  • [TRAIT]       - Interface definition                                     │
│  • [ASYNC]       - Async operation                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 London-School TDD Markers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      TDD MARKERS                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [INTERFACE]     - Public interface (mockable boundary)                     │
│  [DEPENDENCY]    - Injected dependency                                      │
│  [MOCK]          - Component that needs mock implementation                 │
│  [TEST:unit]     - Unit test required                                       │
│  [TEST:integration] - Integration test required                             │
│  [TEST:contract] - Contract test required                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Client Initialization

### 2.1 GeminiClient Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        GEMINI CLIENT                                        │
├─────────────────────────────────────────────────────────────────────────────┤

[INTERFACE]
STRUCTURE GeminiClient:
    // Immutable configuration
    config: GeminiConfig

    // Core components [DEPENDENCY]
    transport: Arc<dyn HttpTransport>           [MOCK]
    auth_manager: Arc<dyn AuthProvider>         [MOCK]
    resilience: Arc<ResilienceOrchestrator>     [MOCK]

    // Service facades (lazy initialized)
    content_service: OnceCell<ContentService>
    embeddings_service: OnceCell<EmbeddingsService>
    models_service: OnceCell<ModelsService>
    files_service: OnceCell<FilesService>
    cached_content_service: OnceCell<CachedContentService>

    // Observability [DEPENDENCY]
    logger: Arc<dyn Logger>                     [MOCK]
    tracer: Arc<dyn Tracer>                     [MOCK]
    metrics: Arc<dyn MetricsRecorder>           [MOCK]

└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Client Builder Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CLIENT BUILDER                                        │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE GeminiClientBuilder:
    api_key: Option<SecretString>
    base_url: Option<Url>
    api_version: Option<String>
    timeout: Option<Duration>
    connect_timeout: Option<Duration>
    max_retries: Option<u32>
    retry_config: Option<RetryConfig>
    circuit_breaker_config: Option<CircuitBreakerConfig>
    rate_limit_config: Option<RateLimitConfig>
    auth_method: Option<AuthMethod>
    http_client: Option<Arc<dyn HttpTransport>>
    logger: Option<Arc<dyn Logger>>
    tracer: Option<Arc<dyn Tracer>>

[TEST:unit]
FUNCTION GeminiClientBuilder::new() -> Self:
    RETURN GeminiClientBuilder {
        api_key: None,
        base_url: None,
        api_version: None,
        timeout: None,
        connect_timeout: None,
        max_retries: None,
        retry_config: None,
        circuit_breaker_config: None,
        rate_limit_config: None,
        auth_method: None,
        http_client: None,
        logger: None,
        tracer: None
    }

[TEST:unit]
FUNCTION GeminiClientBuilder::api_key(self, key: SecretString) -> Self:
    self.api_key = Some(key)
    RETURN self

[TEST:unit]
FUNCTION GeminiClientBuilder::base_url(self, url: Url) -> Self:
    self.base_url = Some(url)
    RETURN self

[TEST:unit]
FUNCTION GeminiClientBuilder::api_version(self, version: String) -> Self:
    self.api_version = Some(version)
    RETURN self

[TEST:unit]
FUNCTION GeminiClientBuilder::timeout(self, duration: Duration) -> Self:
    self.timeout = Some(duration)
    RETURN self

[TEST:unit]
FUNCTION GeminiClientBuilder::auth_method(self, method: AuthMethod) -> Self:
    self.auth_method = Some(method)
    RETURN self

[TEST:unit]
FUNCTION GeminiClientBuilder::build(self) -> Result<GeminiClient, GeminiError>:
    // Resolve API key from multiple sources
    LET api_key = self.api_key
        .OR_ELSE(|| load_from_env("GEMINI_API_KEY"))
        .OR_ELSE(|| load_from_env("GOOGLE_API_KEY"))
        .OK_OR(GeminiError::ConfigurationError {
            kind: ConfigurationErrorKind::MissingApiKey,
            message: "API key not provided. Set GEMINI_API_KEY or GOOGLE_API_KEY environment variable."
        })?

    // Build configuration
    LET config = GeminiConfig {
        api_key: api_key,
        base_url: self.base_url.unwrap_or(DEFAULT_BASE_URL),
        api_version: self.api_version.unwrap_or(DEFAULT_API_VERSION),
        timeout: self.timeout.unwrap_or(DEFAULT_TIMEOUT),
        connect_timeout: self.connect_timeout.unwrap_or(DEFAULT_CONNECT_TIMEOUT),
        max_retries: self.max_retries.unwrap_or(DEFAULT_MAX_RETRIES),
        retry_config: self.retry_config.unwrap_or_default(),
        circuit_breaker_config: self.circuit_breaker_config.unwrap_or_default(),
        rate_limit_config: self.rate_limit_config.unwrap_or_default(),
        auth_method: self.auth_method.unwrap_or(AuthMethod::Header)
    }

    // Validate configuration
    config.validate()?

    // Build transport
    LET transport = self.http_client.unwrap_or_else(|| {
        Arc::new(ReqwestTransport::new(&config))
    })

    // Build auth manager based on method
    LET auth_manager = Arc::new(GeminiAuthProvider::new(
        config.api_key.clone(),
        config.auth_method
    ))

    // Build resilience orchestrator using primitives
    LET resilience = Arc::new(ResilienceOrchestrator::new(
        config.retry_config.clone(),
        config.circuit_breaker_config.clone(),
        config.rate_limit_config.clone()
    ))

    // Build observability components
    LET logger = self.logger.unwrap_or_else(|| Arc::new(DefaultLogger::new("gemini")))
    LET tracer = self.tracer.unwrap_or_else(|| Arc::new(DefaultTracer::new("gemini")))
    LET metrics = Arc::new(DefaultMetricsRecorder::new("gemini"))

    logger.info("Gemini client initialized", {
        base_url: config.base_url.as_str(),
        api_version: config.api_version.as_str(),
        auth_method: config.auth_method
    })

    RETURN Ok(GeminiClient {
        config,
        transport,
        auth_manager,
        resilience,
        content_service: OnceCell::new(),
        embeddings_service: OnceCell::new(),
        models_service: OnceCell::new(),
        files_service: OnceCell::new(),
        cached_content_service: OnceCell::new(),
        logger,
        tracer,
        metrics
    })

└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Client Factory Methods

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      FACTORY METHODS                                        │
├─────────────────────────────────────────────────────────────────────────────┤

[TEST:unit]
FUNCTION GeminiClient::new(config: GeminiConfig) -> Result<Self, GeminiError>:
    GeminiClientBuilder::new()
        .api_key(config.api_key)
        .base_url(config.base_url)
        .api_version(config.api_version)
        .timeout(config.timeout)
        .auth_method(config.auth_method)
        .build()

[TEST:unit]
FUNCTION GeminiClient::from_env() -> Result<Self, GeminiError>:
    // Build with defaults, API key from environment
    GeminiClientBuilder::new().build()

[TEST:unit]
FUNCTION GeminiClient::builder() -> GeminiClientBuilder:
    GeminiClientBuilder::new()

└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Service Accessors

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SERVICE ACCESSORS                                      │
├─────────────────────────────────────────────────────────────────────────────┤

[TEST:unit]
FUNCTION GeminiClient::content(&self) -> &ContentService:
    self.content_service.get_or_init(|| {
        ContentService::new(
            Arc::clone(&self.transport),
            Arc::clone(&self.auth_manager),
            Arc::clone(&self.resilience),
            self.config.clone(),
            Arc::clone(&self.logger),
            Arc::clone(&self.tracer),
            Arc::clone(&self.metrics)
        )
    })

[TEST:unit]
FUNCTION GeminiClient::embeddings(&self) -> &EmbeddingsService:
    self.embeddings_service.get_or_init(|| {
        EmbeddingsService::new(
            Arc::clone(&self.transport),
            Arc::clone(&self.auth_manager),
            Arc::clone(&self.resilience),
            self.config.clone(),
            Arc::clone(&self.logger),
            Arc::clone(&self.tracer),
            Arc::clone(&self.metrics)
        )
    })

[TEST:unit]
FUNCTION GeminiClient::models(&self) -> &ModelsService:
    self.models_service.get_or_init(|| {
        ModelsService::new(
            Arc::clone(&self.transport),
            Arc::clone(&self.auth_manager),
            Arc::clone(&self.resilience),
            self.config.clone(),
            Arc::clone(&self.logger),
            Arc::clone(&self.tracer),
            Arc::clone(&self.metrics)
        )
    })

[TEST:unit]
FUNCTION GeminiClient::files(&self) -> &FilesService:
    self.files_service.get_or_init(|| {
        FilesService::new(
            Arc::clone(&self.transport),
            Arc::clone(&self.auth_manager),
            Arc::clone(&self.resilience),
            self.config.clone(),
            Arc::clone(&self.logger),
            Arc::clone(&self.tracer),
            Arc::clone(&self.metrics)
        )
    })

[TEST:unit]
FUNCTION GeminiClient::cached_content(&self) -> &CachedContentService:
    self.cached_content_service.get_or_init(|| {
        CachedContentService::new(
            Arc::clone(&self.transport),
            Arc::clone(&self.auth_manager),
            Arc::clone(&self.resilience),
            self.config.clone(),
            Arc::clone(&self.logger),
            Arc::clone(&self.tracer),
            Arc::clone(&self.metrics)
        )
    })

└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.5 Client with Mock Services (Testing Support)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MOCK CLIENT FACTORY                                      │
├─────────────────────────────────────────────────────────────────────────────┤

// London-School TDD: Factory for creating test clients with mocked services
STRUCTURE MockGeminiConfig:
    transport: Option<Arc<dyn HttpTransport>>
    auth_manager: Option<Arc<dyn AuthProvider>>
    resilience: Option<Arc<ResilienceOrchestrator>>
    content_service: Option<ContentService>
    embeddings_service: Option<EmbeddingsService>
    models_service: Option<ModelsService>
    files_service: Option<FilesService>
    cached_content_service: Option<CachedContentService>

[TEST:unit]
FUNCTION create_test_client(mock_config: MockGeminiConfig) -> GeminiClient:
    RETURN GeminiClient {
        config: GeminiConfig::default_for_testing(),
        transport: mock_config.transport.unwrap_or_else(|| Arc::new(MockHttpTransport::new())),
        auth_manager: mock_config.auth_manager.unwrap_or_else(|| Arc::new(MockAuthProvider::new())),
        resilience: mock_config.resilience.unwrap_or_else(|| Arc::new(MockResilienceOrchestrator::passthrough())),
        content_service: OnceCell::from(mock_config.content_service),
        embeddings_service: OnceCell::from(mock_config.embeddings_service),
        models_service: OnceCell::from(mock_config.models_service),
        files_service: OnceCell::from(mock_config.files_service),
        cached_content_service: OnceCell::from(mock_config.cached_content_service),
        logger: Arc::new(MockLogger::new()),
        tracer: Arc::new(MockTracer::new()),
        metrics: Arc::new(MockMetricsRecorder::new())
    }

FUNCTION MockGeminiConfig::new() -> MockGeminiConfig:
    RETURN MockGeminiConfig {
        transport: None,
        auth_manager: None,
        resilience: None,
        content_service: None,
        embeddings_service: None,
        models_service: None,
        files_service: None,
        cached_content_service: None
    }

FUNCTION MockGeminiConfig::with_transport(self, transport: Arc<dyn HttpTransport>) -> Self:
    self.transport = Some(transport)
    RETURN self

FUNCTION MockGeminiConfig::with_content_service(self, service: ContentService) -> Self:
    self.content_service = Some(service)
    RETURN self

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Configuration Management

### 3.1 GeminiConfig Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       GEMINI CONFIG                                         │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE GeminiConfig:
    // Authentication
    api_key: SecretString

    // Connection settings
    base_url: Url                           // Default: https://generativelanguage.googleapis.com
    api_version: String                     // Default: "v1beta"
    timeout: Duration                       // Default: 120s
    connect_timeout: Duration               // Default: 30s

    // Authentication method
    auth_method: AuthMethod                 // Default: Header

    // Resilience settings
    max_retries: u32                        // Default: 3
    retry_config: RetryConfig
    circuit_breaker_config: CircuitBreakerConfig
    rate_limit_config: RateLimitConfig

    // HTTP settings
    http2_only: bool                        // Default: false
    pool_max_idle_per_host: usize           // Default: 10
    pool_idle_timeout: Duration             // Default: 90s

    // Observability
    enable_tracing: bool                    // Default: true
    enable_metrics: bool                    // Default: true
    log_level: LogLevel                     // Default: Info

ENUM AuthMethod:
    Header      // Use x-goog-api-key header (recommended)
    QueryParam  // Use ?key= query parameter

CONSTANTS:
    DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com"
    DEFAULT_API_VERSION = "v1beta"
    DEFAULT_TIMEOUT = Duration::from_secs(120)
    DEFAULT_CONNECT_TIMEOUT = Duration::from_secs(30)
    DEFAULT_MAX_RETRIES = 3
    DEFAULT_POOL_MAX_IDLE = 10
    DEFAULT_POOL_IDLE_TIMEOUT = Duration::from_secs(90)

└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Configuration Validation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONFIG VALIDATION                                        │
├─────────────────────────────────────────────────────────────────────────────┤

[TEST:unit]
FUNCTION GeminiConfig::validate(&self) -> Result<(), GeminiError>:
    // Validate API key is not empty
    IF self.api_key.expose_secret().is_empty() THEN:
        RETURN Err(GeminiError::ConfigurationError {
            kind: ConfigurationErrorKind::MissingApiKey,
            message: "API key cannot be empty"
        })

    // Validate base URL uses HTTPS
    IF NOT self.base_url.scheme().starts_with("https") THEN:
        RETURN Err(GeminiError::ConfigurationError {
            kind: ConfigurationErrorKind::InvalidBaseUrl,
            message: "Base URL must use HTTPS"
        })

    // Validate base URL contains expected domain or is custom
    LET host = self.base_url.host_str().unwrap_or("")
    IF NOT host.contains("googleapis.com") AND NOT host.contains("localhost") THEN:
        // Log warning for custom deployments
        log_warning("Using non-standard base URL: {}", host)

    // Validate API version format
    IF NOT self.api_version.starts_with("v1") THEN:
        RETURN Err(GeminiError::ConfigurationError {
            kind: ConfigurationErrorKind::InvalidConfiguration,
            message: "API version must start with 'v1' (e.g., 'v1' or 'v1beta')"
        })

    // Validate timeouts
    IF self.timeout < Duration::from_secs(1) THEN:
        RETURN Err(GeminiError::ConfigurationError {
            kind: ConfigurationErrorKind::InvalidConfiguration,
            message: "Timeout must be at least 1 second"
        })

    IF self.connect_timeout > self.timeout THEN:
        RETURN Err(GeminiError::ConfigurationError {
            kind: ConfigurationErrorKind::InvalidConfiguration,
            message: "Connect timeout cannot exceed request timeout"
        })

    // Validate retry settings
    IF self.max_retries > 10 THEN:
        RETURN Err(GeminiError::ConfigurationError {
            kind: ConfigurationErrorKind::InvalidConfiguration,
            message: "Max retries cannot exceed 10"
        })

    RETURN Ok(())

[TEST:unit]
FUNCTION GeminiConfig::default() -> Self:
    RETURN GeminiConfig {
        api_key: SecretString::new(String::new()),  // Must be set
        base_url: Url::parse(DEFAULT_BASE_URL).unwrap(),
        api_version: DEFAULT_API_VERSION.to_string(),
        timeout: DEFAULT_TIMEOUT,
        connect_timeout: DEFAULT_CONNECT_TIMEOUT,
        max_retries: DEFAULT_MAX_RETRIES,
        auth_method: AuthMethod::Header,
        retry_config: RetryConfig::default(),
        circuit_breaker_config: CircuitBreakerConfig::default(),
        rate_limit_config: RateLimitConfig::default(),
        http2_only: false,
        pool_max_idle_per_host: DEFAULT_POOL_MAX_IDLE,
        pool_idle_timeout: DEFAULT_POOL_IDLE_TIMEOUT,
        enable_tracing: true,
        enable_metrics: true,
        log_level: LogLevel::Info
    }

[TEST:unit]
FUNCTION GeminiConfig::default_for_testing() -> Self:
    LET mut config = GeminiConfig::default()
    config.api_key = SecretString::new("test-api-key")
    config.enable_tracing = false
    config.enable_metrics = false
    RETURN config

└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Resilience Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   RESILIENCE CONFIG                                         │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE RetryConfig:
    max_attempts: u32                       // Default: 3
    initial_delay: Duration                 // Default: 1000ms
    max_delay: Duration                     // Default: 60s
    multiplier: f64                         // Default: 2.0
    jitter: f64                             // Default: 0.25

[TEST:unit]
FUNCTION RetryConfig::default() -> Self:
    RETURN RetryConfig {
        max_attempts: 3,
        initial_delay: Duration::from_millis(1000),
        max_delay: Duration::from_secs(60),
        multiplier: 2.0,
        jitter: 0.25
    }

STRUCTURE CircuitBreakerConfig:
    failure_threshold: u32                  // Default: 5
    success_threshold: u32                  // Default: 3
    open_duration: Duration                 // Default: 30s
    half_open_max_requests: u32             // Default: 1

[TEST:unit]
FUNCTION CircuitBreakerConfig::default() -> Self:
    RETURN CircuitBreakerConfig {
        failure_threshold: 5,
        success_threshold: 3,
        open_duration: Duration::from_secs(30),
        half_open_max_requests: 1
    }

STRUCTURE RateLimitConfig:
    requests_per_minute: Option<u32>        // Default: None (no limit)
    tokens_per_minute: Option<u32>          // Default: None (no limit)
    sync_with_server: bool                  // Default: true

[TEST:unit]
FUNCTION RateLimitConfig::default() -> Self:
    RETURN RateLimitConfig {
        requests_per_minute: None,
        tokens_per_minute: None,
        sync_with_server: true
    }

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. HTTP Transport Layer

### 4.1 Transport Trait

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      HTTP TRANSPORT TRAIT                                   │
├─────────────────────────────────────────────────────────────────────────────┤

[TRAIT] [INTERFACE]
TRAIT HttpTransport: Send + Sync:

    [ASYNC] [TEST:unit]
    FUNCTION send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError>

    [ASYNC] [TEST:unit]
    FUNCTION send_streaming(&self, request: HttpRequest)
        -> Result<impl Stream<Item = Result<Bytes, TransportError>>, TransportError>

STRUCTURE HttpRequest:
    method: HttpMethod
    url: Url
    headers: HeaderMap
    body: Option<Bytes>
    timeout: Option<Duration>

STRUCTURE HttpResponse:
    status: StatusCode
    headers: HeaderMap
    body: Bytes

ENUM HttpMethod:
    GET
    POST
    PUT
    PATCH
    DELETE

ENUM TransportError:
    ConnectionError { message: String, source: Option<Box<dyn Error>> }
    TimeoutError { message: String, duration: Duration }
    TlsError { message: String, source: Option<Box<dyn Error>> }
    InvalidRequest { message: String }
    ResponseError { status: StatusCode, body: String }

└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Reqwest Transport Implementation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REQWEST TRANSPORT                                        │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE ReqwestTransport:
    client: reqwest::Client
    config: TransportConfig

STRUCTURE TransportConfig:
    timeout: Duration
    connect_timeout: Duration
    pool_max_idle_per_host: usize
    pool_idle_timeout: Duration
    http2_only: bool

[TEST:unit]
FUNCTION ReqwestTransport::new(config: &GeminiConfig) -> Self:
    LET client = reqwest::Client::builder()
        .timeout(config.timeout)
        .connect_timeout(config.connect_timeout)
        .pool_max_idle_per_host(config.pool_max_idle_per_host)
        .pool_idle_timeout(config.pool_idle_timeout)
        .min_tls_version(TlsVersion::TLS_1_2)
        .https_only(true)
        .user_agent(format!("gemini-integration/{}", VERSION))
        .build()
        .expect("Failed to build HTTP client")

    RETURN ReqwestTransport {
        client,
        config: TransportConfig {
            timeout: config.timeout,
            connect_timeout: config.connect_timeout,
            pool_max_idle_per_host: config.pool_max_idle_per_host,
            pool_idle_timeout: config.pool_idle_timeout,
            http2_only: config.http2_only
        }
    }

[ASYNC] [TEST:integration]
FUNCTION ReqwestTransport::send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError>:
    // Build reqwest request
    LET mut req_builder = self.client.request(
        request.method.into(),
        request.url.as_str()
    )

    // Add headers
    FOR (name, value) IN request.headers:
        req_builder = req_builder.header(name, value)

    // Add body if present
    IF LET Some(body) = request.body:
        req_builder = req_builder.body(body)

    // Set timeout override if specified
    IF LET Some(timeout) = request.timeout:
        req_builder = req_builder.timeout(timeout)

    // Execute request
    TRY:
        LET response = AWAIT req_builder.send()

        LET status = response.status()
        LET headers = response.headers().clone()
        LET body = AWAIT response.bytes()

        RETURN Ok(HttpResponse { status, headers, body })
    CATCH reqwest::Error AS e:
        IF e.is_timeout() THEN:
            RETURN Err(TransportError::TimeoutError {
                message: "Request timed out",
                duration: self.config.timeout
            })
        ELSE IF e.is_connect() THEN:
            RETURN Err(TransportError::ConnectionError {
                message: format!("Connection failed: {}", e),
                source: Some(Box::new(e))
            })
        ELSE:
            RETURN Err(TransportError::ConnectionError {
                message: format!("Request failed: {}", e),
                source: Some(Box::new(e))
            })

[ASYNC] [TEST:integration]
FUNCTION ReqwestTransport::send_streaming(&self, request: HttpRequest)
    -> Result<impl Stream<Item = Result<Bytes, TransportError>>, TransportError>:

    // Build request
    LET mut req_builder = self.client.request(
        request.method.into(),
        request.url.as_str()
    )

    FOR (name, value) IN request.headers:
        req_builder = req_builder.header(name, value)

    IF LET Some(body) = request.body:
        req_builder = req_builder.body(body)

    // Execute and get streaming response
    TRY:
        LET response = AWAIT req_builder.send()

        IF NOT response.status().is_success() THEN:
            LET body = AWAIT response.bytes()
            RETURN Err(TransportError::ResponseError {
                status: response.status(),
                body: String::from_utf8_lossy(&body).to_string()
            })

        // Return byte stream
        // Note: Gemini uses newline-delimited JSON, not SSE
        LET stream = response.bytes_stream()
            .map(|result| {
                result.map_err(|e| TransportError::ConnectionError {
                    message: format!("Stream error: {}", e),
                    source: Some(Box::new(e))
                })
            })

        RETURN Ok(stream)
    CATCH reqwest::Error AS e:
        RETURN Err(TransportError::ConnectionError {
            message: format!("Request failed: {}", e),
            source: Some(Box::new(e))
        })

└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Mock Transport

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MOCK TRANSPORT                                         │
├─────────────────────────────────────────────────────────────────────────────┤

[MOCK]
STRUCTURE MockHttpTransport:
    expected_requests: Vec<ExpectedRequest>
    responses: Vec<MockResponse>
    call_history: Mutex<Vec<RecordedCall>>
    current_index: AtomicUsize

STRUCTURE ExpectedRequest:
    method: Option<HttpMethod>
    path_contains: Option<String>
    headers: Option<HeaderMap>
    body_matcher: Option<Box<dyn Fn(&Bytes) -> bool>>

STRUCTURE MockResponse:
    status: StatusCode
    headers: HeaderMap
    body: Bytes
    delay: Option<Duration>
    error: Option<TransportError>

STRUCTURE RecordedCall:
    request: HttpRequest
    timestamp: Instant

[TEST:unit]
FUNCTION MockHttpTransport::new() -> Self:
    RETURN MockHttpTransport {
        expected_requests: Vec::new(),
        responses: Vec::new(),
        call_history: Mutex::new(Vec::new()),
        current_index: AtomicUsize::new(0)
    }

FUNCTION MockHttpTransport::expect_request(&mut self) -> &mut ExpectedRequest:
    self.expected_requests.push(ExpectedRequest::default())
    RETURN self.expected_requests.last_mut().unwrap()

FUNCTION MockHttpTransport::returning(&mut self, response: MockResponse) -> &mut Self:
    self.responses.push(response)
    RETURN self

FUNCTION MockHttpTransport::returning_json<T: Serialize>(&mut self, status: StatusCode, body: &T) -> &mut Self:
    LET json = serde_json::to_vec(body).unwrap()
    LET mut headers = HeaderMap::new()
    headers.insert("Content-Type", "application/json")

    self.responses.push(MockResponse {
        status,
        headers,
        body: Bytes::from(json),
        delay: None,
        error: None
    })
    RETURN self

FUNCTION MockHttpTransport::returning_error(&mut self, error: TransportError) -> &mut Self:
    self.responses.push(MockResponse {
        status: StatusCode::INTERNAL_SERVER_ERROR,
        headers: HeaderMap::new(),
        body: Bytes::new(),
        delay: None,
        error: Some(error)
    })
    RETURN self

[ASYNC]
FUNCTION MockHttpTransport::send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError>:
    // Record call
    LET mut history = self.call_history.lock().unwrap()
    history.push(RecordedCall {
        request: request.clone(),
        timestamp: Instant::now()
    })

    // Get response index
    LET index = self.current_index.fetch_add(1, Ordering::SeqCst)

    IF index >= self.responses.len() THEN:
        PANIC("No more mock responses configured. Configure enough responses for all expected calls.")

    LET response = &self.responses[index]

    // Apply delay if configured
    IF LET Some(delay) = response.delay:
        AWAIT tokio::time::sleep(delay)

    // Return error if configured
    IF LET Some(ref error) = response.error:
        RETURN Err(error.clone())

    RETURN Ok(HttpResponse {
        status: response.status,
        headers: response.headers.clone(),
        body: response.body.clone()
    })

FUNCTION MockHttpTransport::verify(&self):
    LET history = self.call_history.lock().unwrap()
    LET expected_count = self.expected_requests.len()
    LET actual_count = history.len()

    IF expected_count > 0 AND actual_count != expected_count THEN:
        PANIC(format!(
            "Expected {} calls, got {}",
            expected_count, actual_count
        ))

    // Verify each call matches expectations
    FOR (i, (expected, actual)) IN self.expected_requests.iter()
        .zip(history.iter()).enumerate():

        IF LET Some(ref method) = expected.method:
            ASSERT_EQ(actual.request.method, *method,
                "Call {} method mismatch", i)

        IF LET Some(ref path) = expected.path_contains:
            ASSERT(actual.request.url.path().contains(path),
                "Call {} path mismatch: expected to contain '{}', got '{}'",
                i, path, actual.request.url.path())

FUNCTION MockHttpTransport::call_count(&self) -> usize:
    self.call_history.lock().unwrap().len()

FUNCTION MockHttpTransport::get_recorded_calls(&self) -> Vec<RecordedCall>:
    self.call_history.lock().unwrap().clone()

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Request Builder

### 5.1 Request Builder Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      REQUEST BUILDER                                        │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE RequestBuilder:
    base_url: Url
    api_version: String
    auth_manager: Arc<dyn AuthProvider>

[TEST:unit]
FUNCTION RequestBuilder::new(
    base_url: Url,
    api_version: String,
    auth_manager: Arc<dyn AuthProvider>
) -> Self:
    RETURN RequestBuilder { base_url, api_version, auth_manager }

[TEST:unit]
FUNCTION RequestBuilder::build_url(&self, path: &str) -> Result<Url, GeminiError>:
    // Path should include version: /v1beta/models/gemini-pro:generateContent
    LET full_path = format!("/{}{}", self.api_version, path)

    self.base_url.join(&full_path)
        .map_err(|e| GeminiError::RequestError {
            kind: RequestErrorKind::InvalidParameter,
            message: format!("Invalid path: {}", e),
            param: Some("path".to_string())
        })

[TEST:unit]
FUNCTION RequestBuilder::build_request<T: Serialize>(
    &self,
    method: HttpMethod,
    path: &str,
    body: Option<&T>,
    extra_headers: Option<HeaderMap>
) -> Result<HttpRequest, GeminiError>:

    // Build URL with API version
    LET url = self.build_url(path)?

    // Apply authentication (adds key to URL or header)
    LET (auth_url, auth_headers) = self.auth_manager.apply_auth(url)?

    // Build headers
    LET mut headers = HeaderMap::new()
    headers.insert("Content-Type", "application/json")
    headers.insert("Accept", "application/json")
    headers.insert("User-Agent", format!("gemini-integration/{}", VERSION))

    // Merge auth headers
    FOR (name, value) IN auth_headers:
        headers.insert(name, value)

    // Add extra headers
    IF LET Some(extra) = extra_headers:
        FOR (name, value) IN extra:
            headers.insert(name, value)

    // Serialize body
    LET body_bytes = IF LET Some(b) = body:
        Some(serde_json::to_vec(b)
            .map_err(|e| GeminiError::RequestError {
                kind: RequestErrorKind::SerializationError,
                message: format!("Failed to serialize request: {}", e),
                param: None
            })?
            .into())
    ELSE:
        None

    RETURN Ok(HttpRequest {
        method,
        url: auth_url,
        headers,
        body: body_bytes,
        timeout: None
    })

[TEST:unit]
FUNCTION RequestBuilder::build_streaming_request<T: Serialize>(
    &self,
    path: &str,
    body: &T
) -> Result<HttpRequest, GeminiError>:

    LET mut headers = HeaderMap::new()
    // Gemini uses chunked JSON, not SSE
    headers.insert("Accept", "application/json")
    headers.insert("Transfer-Encoding", "chunked")

    RETURN self.build_request(HttpMethod::POST, path, Some(body), Some(headers))

[TEST:unit]
FUNCTION RequestBuilder::build_multipart_request(
    &self,
    path: &str,
    form: MultipartForm
) -> Result<HttpRequest, GeminiError>:

    LET url = self.build_url(path)?
    LET (auth_url, auth_headers) = self.auth_manager.apply_auth(url)?

    LET boundary = generate_multipart_boundary()
    LET mut headers = HeaderMap::new()
    headers.insert("Content-Type", format!("multipart/form-data; boundary={}", boundary))

    FOR (name, value) IN auth_headers:
        headers.insert(name, value)

    LET body = form.to_bytes(&boundary)?

    RETURN Ok(HttpRequest {
        method: HttpMethod::POST,
        url: auth_url,
        headers,
        body: Some(body),
        timeout: None
    })

└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Endpoint Paths

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ENDPOINT PATHS                                        │
├─────────────────────────────────────────────────────────────────────────────┤

MODULE endpoints:
    // Models endpoints
    CONST MODELS: &str = "/models"
    FUNCTION model(name: &str) -> String: format!("/models/{}", name)

    // Content generation endpoints
    FUNCTION generate_content(model: &str) -> String:
        format!("/models/{}:generateContent", model)

    FUNCTION stream_generate_content(model: &str) -> String:
        format!("/models/{}:streamGenerateContent", model)

    FUNCTION count_tokens(model: &str) -> String:
        format!("/models/{}:countTokens", model)

    // Embeddings endpoints
    FUNCTION embed_content(model: &str) -> String:
        format!("/models/{}:embedContent", model)

    FUNCTION batch_embed_contents(model: &str) -> String:
        format!("/models/{}:batchEmbedContents", model)

    // Files endpoints (uses different base path for upload)
    CONST FILES: &str = "/files"
    FUNCTION file(name: &str) -> String: format!("/files/{}", name)

    // Upload uses a different endpoint
    CONST UPLOAD_FILES: &str = "/upload/v1beta/files"

    // Cached content endpoints
    CONST CACHED_CONTENTS: &str = "/cachedContents"
    FUNCTION cached_content(name: &str) -> String: format!("/cachedContents/{}", name)

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Response Parser

### 6.1 Response Parser Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      RESPONSE PARSER                                        │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE ResponseParser:
    // Stateless - all methods are pure functions

[TEST:unit]
FUNCTION ResponseParser::parse_response<T: DeserializeOwned>(
    response: &HttpResponse
) -> Result<T, GeminiError>:

    // Check status code first
    IF NOT response.status.is_success() THEN:
        RETURN Err(Self::parse_error_response(response))

    // Check for empty response
    IF response.body.is_empty() THEN:
        RETURN Err(GeminiError::ResponseError {
            kind: ResponseErrorKind::EmptyResponse,
            message: "Empty response body",
            body_preview: None
        })

    // Parse JSON body
    serde_json::from_slice(&response.body)
        .map_err(|e| GeminiError::ResponseError {
            kind: ResponseErrorKind::DeserializationError,
            message: format!("Failed to parse response: {}", e),
            body_preview: Some(truncate_string(
                String::from_utf8_lossy(&response.body).to_string(),
                200
            ))
        })

[TEST:unit]
FUNCTION ResponseParser::parse_error_response(response: &HttpResponse) -> GeminiError:
    // Try to parse as Gemini error response
    LET error_result: Result<GeminiApiError, _> = serde_json::from_slice(&response.body)

    LET (error_code, error_message, error_status, details) = MATCH error_result:
        Ok(api_error) => (
            api_error.error.code,
            api_error.error.message,
            api_error.error.status,
            api_error.error.details
        ),
        Err(_) => (
            response.status.as_u16() as i32,
            String::from_utf8_lossy(&response.body).to_string(),
            None,
            None
        )

    // Map status code to error type
    MATCH response.status.as_u16():
        400 => GeminiError::RequestError {
            kind: RequestErrorKind::ValidationError,
            message: error_message,
            param: Self::extract_field_from_details(&details)
        },
        401 => GeminiError::AuthenticationError {
            kind: AuthenticationErrorKind::InvalidApiKey,
            message: error_message
        },
        403 => GeminiError::AuthenticationError {
            kind: AuthenticationErrorKind::QuotaExceeded,
            message: error_message
        },
        404 => GeminiError::ResourceError {
            kind: ResourceErrorKind::NotFound,
            message: error_message,
            resource: Self::extract_resource_from_message(&error_message)
        },
        413 => GeminiError::RequestError {
            kind: RequestErrorKind::PayloadTooLarge,
            message: error_message,
            param: None
        },
        415 => GeminiError::RequestError {
            kind: RequestErrorKind::UnsupportedMediaType,
            message: error_message,
            param: None
        },
        429 => GeminiError::RateLimitError {
            kind: RateLimitErrorKind::TooManyRequests,
            message: error_message,
            retry_after: Self::parse_retry_after(&response.headers)
        },
        500 => GeminiError::ServerError {
            kind: ServerErrorKind::InternalError,
            message: error_message,
            request_id: Self::extract_request_id(&response.headers)
        },
        503 => GeminiError::ServerError {
            kind: ServerErrorKind::ServiceUnavailable,
            message: error_message,
            retry_after: Self::parse_retry_after(&response.headers)
        },
        _ => GeminiError::ServerError {
            kind: ServerErrorKind::InternalError,
            message: error_message,
            request_id: Self::extract_request_id(&response.headers)
        }

[TEST:unit]
FUNCTION ResponseParser::parse_retry_after(headers: &HeaderMap) -> Option<Duration>:
    headers.get("Retry-After")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok())
        .map(Duration::from_secs)

[TEST:unit]
FUNCTION ResponseParser::extract_request_id(headers: &HeaderMap) -> Option<String>:
    headers.get("x-request-id")
        .or_else(|| headers.get("X-Request-ID"))
        .or_else(|| headers.get("x-goog-request-id"))
        .and_then(|v| v.to_str().ok())
        .map(String::from)

[TEST:unit]
FUNCTION ResponseParser::extract_field_from_details(details: &Option<Vec<ErrorDetail>>) -> Option<String>:
    details.as_ref()
        .and_then(|d| d.first())
        .and_then(|detail| {
            IF detail.type_url.contains("BadRequest") THEN:
                detail.field_violations
                    .as_ref()
                    .and_then(|v| v.first())
                    .map(|fv| fv.field.clone())
            ELSE:
                None
        })

[TEST:unit]
FUNCTION ResponseParser::extract_resource_from_message(message: &str) -> Option<String>:
    // Try to extract resource name from messages like "Model 'models/foo' not found"
    LET patterns = ["models/", "files/", "cachedContents/"]
    FOR pattern IN patterns:
        IF LET Some(start) = message.find(pattern):
            LET end = message[start..].find(['\'', '"', ' ', ')'])
                .unwrap_or(message.len() - start)
            RETURN Some(message[start..start+end].to_string())
    RETURN None

└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 API Error Response Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     API ERROR RESPONSE                                      │
├─────────────────────────────────────────────────────────────────────────────┤

// Gemini API error response format
STRUCTURE GeminiApiError:
    error: GeminiErrorBody

STRUCTURE GeminiErrorBody:
    code: i32
    message: String
    status: Option<String>           // e.g., "INVALID_ARGUMENT"
    details: Option<Vec<ErrorDetail>>

STRUCTURE ErrorDetail:
    type_url: String                 // e.g., "type.googleapis.com/google.rpc.BadRequest"
    field_violations: Option<Vec<FieldViolation>>

STRUCTURE FieldViolation:
    field: String
    description: String

// Content safety block response
STRUCTURE SafetyBlockResponse:
    prompt_feedback: Option<PromptFeedback>
    candidates: Option<Vec<Candidate>>

STRUCTURE PromptFeedback:
    block_reason: Option<String>
    safety_ratings: Vec<SafetyRating>

STRUCTURE SafetyRating:
    category: String
    probability: String
    blocked: Option<bool>

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Authentication Manager

### 7.1 Auth Provider Trait

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AUTH PROVIDER TRAIT                                    │
├─────────────────────────────────────────────────────────────────────────────┤

[TRAIT] [INTERFACE]
TRAIT AuthProvider: Send + Sync:

    [TEST:unit]
    // Apply authentication to URL and/or headers
    FUNCTION apply_auth(&self, url: Url) -> Result<(Url, HeaderMap), GeminiError>

    [TEST:unit]
    // Get redacted key for logging
    FUNCTION get_redacted_key(&self) -> String

    [TEST:unit]
    // Get auth method type
    FUNCTION auth_method(&self) -> AuthMethod

└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Gemini Auth Provider

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GEMINI AUTH PROVIDER                                     │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE GeminiAuthProvider:
    api_key: SecretString
    method: AuthMethod

[TEST:unit]
FUNCTION GeminiAuthProvider::new(api_key: SecretString, method: AuthMethod) -> Self:
    RETURN GeminiAuthProvider { api_key, method }

IMPL AuthProvider FOR GeminiAuthProvider:

    [TEST:unit]
    FUNCTION apply_auth(&self, url: Url) -> Result<(Url, HeaderMap), GeminiError>:
        LET key = self.api_key.expose_secret()

        IF key.is_empty() THEN:
            RETURN Err(GeminiError::AuthenticationError {
                kind: AuthenticationErrorKind::InvalidApiKey,
                message: "API key is empty"
            })

        MATCH self.method:
            AuthMethod::Header => {
                // Use x-goog-api-key header (recommended)
                LET mut headers = HeaderMap::new()
                headers.insert("x-goog-api-key", key.clone())
                RETURN Ok((url, headers))
            },
            AuthMethod::QueryParam => {
                // Append key to URL query parameters
                LET mut url_with_key = url.clone()
                url_with_key.query_pairs_mut()
                    .append_pair("key", key)
                RETURN Ok((url_with_key, HeaderMap::new()))
            }

    [TEST:unit]
    FUNCTION get_redacted_key(&self) -> String:
        LET key = self.api_key.expose_secret()
        IF key.len() <= 8 THEN:
            RETURN "****"

        LET visible_chars = 4
        LET prefix = &key[..visible_chars]
        LET suffix = &key[key.len()-visible_chars..]

        RETURN format!("{}...{}", prefix, suffix)

    FUNCTION auth_method(&self) -> AuthMethod:
        self.method

└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Mock Auth Provider

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     MOCK AUTH PROVIDER                                      │
├─────────────────────────────────────────────────────────────────────────────┤

[MOCK]
STRUCTURE MockAuthProvider:
    should_succeed: bool
    error: Option<GeminiError>
    call_count: AtomicUsize

[TEST:unit]
FUNCTION MockAuthProvider::new() -> Self:
    RETURN MockAuthProvider {
        should_succeed: true,
        error: None,
        call_count: AtomicUsize::new(0)
    }

FUNCTION MockAuthProvider::returning_error(error: GeminiError) -> Self:
    RETURN MockAuthProvider {
        should_succeed: false,
        error: Some(error),
        call_count: AtomicUsize::new(0)
    }

IMPL AuthProvider FOR MockAuthProvider:

    FUNCTION apply_auth(&self, url: Url) -> Result<(Url, HeaderMap), GeminiError>:
        self.call_count.fetch_add(1, Ordering::SeqCst)

        IF NOT self.should_succeed THEN:
            RETURN Err(self.error.clone().unwrap_or_else(|| {
                GeminiError::AuthenticationError {
                    kind: AuthenticationErrorKind::InvalidApiKey,
                    message: "Mock auth failure"
                }
            }))

        LET mut headers = HeaderMap::new()
        headers.insert("x-goog-api-key", "mock-test-key")
        RETURN Ok((url, headers))

    FUNCTION get_redacted_key(&self) -> String:
        "mock...key"

    FUNCTION auth_method(&self) -> AuthMethod:
        AuthMethod::Header

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Resilience Orchestrator

### 8.1 Orchestrator Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   RESILIENCE ORCHESTRATOR                                   │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE ResilienceOrchestrator:
    retry_executor: Arc<dyn RetryExecutor>          [MOCK]
    circuit_breaker: Arc<dyn CircuitBreaker>        [MOCK]
    rate_limiter: Arc<dyn RateLimiter>              [MOCK]
    logger: Arc<dyn Logger>                         [MOCK]

[TEST:unit]
FUNCTION ResilienceOrchestrator::new(
    retry_config: RetryConfig,
    circuit_breaker_config: CircuitBreakerConfig,
    rate_limit_config: RateLimitConfig
) -> Self:

    // Create from integrations-retry primitive
    LET retry_executor = Arc::new(ExponentialBackoffRetry::new(retry_config))

    // Create from integrations-circuit-breaker primitive
    LET circuit_breaker = Arc::new(DefaultCircuitBreaker::new(circuit_breaker_config))

    // Create from integrations-rate-limit primitive
    LET rate_limiter = Arc::new(TokenBucketRateLimiter::new(rate_limit_config))

    // Create from integrations-logging primitive
    LET logger = Arc::new(DefaultLogger::new("gemini.resilience"))

    RETURN ResilienceOrchestrator {
        retry_executor,
        circuit_breaker,
        rate_limiter,
        logger
    }

└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Execute with Resilience

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   EXECUTE WITH RESILIENCE                                   │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION ResilienceOrchestrator::execute<F, T>(
    &self,
    operation: F,
    context: &RequestContext
) -> Result<T, GeminiError>
WHERE F: Fn() -> Future<Output = Result<T, GeminiError>>:

    // 1. Check circuit breaker state
    IF self.circuit_breaker.is_open() THEN:
        self.logger.warn("Circuit breaker is open, rejecting request", context)
        RETURN Err(GeminiError::CircuitBreakerOpen {
            message: "Circuit breaker is open, request rejected. Service may be unavailable."
        })

    // 2. Check rate limits (client-side pre-check)
    TRY:
        AWAIT self.rate_limiter.acquire_permit(context)
    CATCH RateLimitExceeded AS e:
        self.logger.warn("Client-side rate limit exceeded", context)
        RETURN Err(GeminiError::RateLimitError {
            kind: RateLimitErrorKind::TooManyRequests,
            message: "Client-side rate limit exceeded",
            retry_after: Some(e.retry_after)
        })

    // 3. Execute with retry
    LET result = AWAIT self.retry_executor.execute_with_retry(
        operation,
        |error| Self::is_retryable(error),
        |attempt, error, delay| {
            self.logger.info(
                format!("Retry attempt {} after {:?}: {}", attempt, delay, error),
                context
            )
        }
    )

    // 4. Update circuit breaker based on result
    MATCH &result:
        Ok(_) => self.circuit_breaker.record_success(),
        Err(e) IF Self::is_circuit_breaker_failure(e) => {
            self.circuit_breaker.record_failure()
        },
        Err(_) => {} // Don't count non-circuit-breaker errors

    RETURN result

[TEST:unit]
FUNCTION ResilienceOrchestrator::is_retryable(error: &GeminiError) -> bool:
    MATCH error:
        GeminiError::RateLimitError { .. } => true,
        GeminiError::ServerError { kind: ServerErrorKind::InternalError, .. } => true,
        GeminiError::ServerError { kind: ServerErrorKind::ServiceUnavailable, .. } => true,
        GeminiError::ServerError { kind: ServerErrorKind::ModelOverloaded, .. } => true,
        GeminiError::NetworkError { kind: NetworkErrorKind::Timeout, .. } => true,
        GeminiError::NetworkError { kind: NetworkErrorKind::ConnectionFailed, .. } => true,
        GeminiError::ResponseError { kind: ResponseErrorKind::StreamInterrupted, .. } => true,
        _ => false

[TEST:unit]
FUNCTION ResilienceOrchestrator::is_circuit_breaker_failure(error: &GeminiError) -> bool:
    MATCH error:
        GeminiError::ServerError { kind: ServerErrorKind::InternalError, .. } => true,
        GeminiError::ServerError { kind: ServerErrorKind::ServiceUnavailable, .. } => true,
        GeminiError::NetworkError { kind: NetworkErrorKind::Timeout, .. } => true,
        GeminiError::NetworkError { kind: NetworkErrorKind::ConnectionFailed, .. } => true,
        _ => false

└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Rate Limit Synchronization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  RATE LIMIT SYNCHRONIZATION                                 │
├─────────────────────────────────────────────────────────────────────────────┤

[TEST:unit]
FUNCTION ResilienceOrchestrator::update_from_response_headers(
    &self,
    headers: &HeaderMap
):
    // Update local rate limiter with server-provided limits if available
    IF LET Some(remaining) = Self::parse_header_u32(headers, "x-ratelimit-remaining-requests"):
        self.rate_limiter.set_remaining_requests(remaining)

    IF LET Some(remaining) = Self::parse_header_u32(headers, "x-ratelimit-remaining-tokens"):
        self.rate_limiter.set_remaining_tokens(remaining)

    IF LET Some(reset_time) = Self::parse_header_timestamp(headers, "x-ratelimit-reset"):
        self.rate_limiter.set_reset_time(reset_time)

    self.logger.trace(
        "Updated rate limits from response headers",
        &RequestContext::empty()
    )

[TEST:unit]
FUNCTION ResilienceOrchestrator::handle_rate_limit_response(
    &self,
    retry_after: Duration
):
    self.rate_limiter.pause_until(Instant::now() + retry_after)

    self.logger.info(
        format!("Rate limited by server, pausing for {:?}", retry_after),
        &RequestContext::empty()
    )

FUNCTION ResilienceOrchestrator::parse_header_u32(headers: &HeaderMap, name: &str) -> Option<u32>:
    headers.get(name)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())

FUNCTION ResilienceOrchestrator::parse_header_timestamp(headers: &HeaderMap, name: &str) -> Option<Instant>:
    headers.get(name)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| parse_http_date(s).ok())
        .map(|dt| Instant::now() + (dt - SystemTime::now()).unwrap_or(Duration::ZERO))

└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.4 Mock Resilience Orchestrator

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 MOCK RESILIENCE ORCHESTRATOR                                │
├─────────────────────────────────────────────────────────────────────────────┤

[MOCK]
STRUCTURE MockResilienceOrchestrator:
    should_allow: bool
    circuit_state: CircuitState
    rate_limit_error: Option<GeminiError>
    retry_behavior: MockRetryBehavior

ENUM CircuitState:
    Closed
    Open
    HalfOpen

ENUM MockRetryBehavior:
    PassThrough           // Execute once, no retry
    FailThenSucceed(u32)  // Fail n times, then succeed
    AlwaysFail            // Always fail with last error

[TEST:unit]
FUNCTION MockResilienceOrchestrator::passthrough() -> Self:
    RETURN MockResilienceOrchestrator {
        should_allow: true,
        circuit_state: CircuitState::Closed,
        rate_limit_error: None,
        retry_behavior: MockRetryBehavior::PassThrough
    }

FUNCTION MockResilienceOrchestrator::with_open_circuit() -> Self:
    RETURN MockResilienceOrchestrator {
        should_allow: false,
        circuit_state: CircuitState::Open,
        rate_limit_error: None,
        retry_behavior: MockRetryBehavior::PassThrough
    }

FUNCTION MockResilienceOrchestrator::with_rate_limit() -> Self:
    RETURN MockResilienceOrchestrator {
        should_allow: false,
        circuit_state: CircuitState::Closed,
        rate_limit_error: Some(GeminiError::RateLimitError {
            kind: RateLimitErrorKind::TooManyRequests,
            message: "Rate limit exceeded",
            retry_after: Some(Duration::from_secs(30))
        }),
        retry_behavior: MockRetryBehavior::PassThrough
    }

[ASYNC]
FUNCTION MockResilienceOrchestrator::execute<F, T>(
    &self,
    operation: F,
    _context: &RequestContext
) -> Result<T, GeminiError>
WHERE F: Fn() -> Future<Output = Result<T, GeminiError>>:

    // Check circuit breaker
    IF self.circuit_state == CircuitState::Open THEN:
        RETURN Err(GeminiError::CircuitBreakerOpen {
            message: "Mock circuit breaker is open"
        })

    // Check rate limit
    IF LET Some(ref error) = self.rate_limit_error:
        RETURN Err(error.clone())

    // Execute the operation (passthrough for simplicity)
    AWAIT operation()

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Document Navigation

| Previous | Current | Next |
|----------|---------|------|
| [Specification](./specification-gemini.md) | Pseudocode Part 1 | [Pseudocode Part 2](./pseudocode-gemini-2.md) |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial core infrastructure pseudocode |

---

**Continued in Part 2: Services (Content Generation, Embeddings, Models)**
