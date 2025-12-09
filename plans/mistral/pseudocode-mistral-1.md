# SPARC Pseudocode: Mistral Integration Module

**Part 1 of 3: Core Infrastructure**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/mistral`

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

### 2.1 MistralClient Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MISTRAL CLIENT                                       │
├─────────────────────────────────────────────────────────────────────────────┤

[INTERFACE]
STRUCTURE MistralClient:
    // Immutable configuration
    config: ClientConfig

    // Core components [DEPENDENCY]
    transport: Arc<dyn HttpTransport>           [MOCK]
    auth_manager: Arc<dyn AuthProvider>         [MOCK]
    resilience: Arc<ResilienceOrchestrator>     [MOCK]

    // Service facades (lazy initialized)
    chat_service: OnceCell<ChatService>
    fim_service: OnceCell<FimService>
    embeddings_service: OnceCell<EmbeddingsService>
    models_service: OnceCell<ModelsService>
    files_service: OnceCell<FilesService>
    fine_tuning_service: OnceCell<FineTuningService>
    agents_service: OnceCell<AgentsService>
    batch_service: OnceCell<BatchService>
    classifiers_service: OnceCell<ClassifiersService>

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

STRUCTURE MistralClientBuilder:
    api_key: Option<SecretString>
    base_url: Option<Url>
    timeout: Option<Duration>
    connect_timeout: Option<Duration>
    max_retries: Option<u32>
    retry_config: Option<RetryConfig>
    circuit_breaker_config: Option<CircuitBreakerConfig>
    rate_limit_config: Option<RateLimitConfig>
    http_client: Option<Arc<dyn HttpTransport>>
    logger: Option<Arc<dyn Logger>>
    tracer: Option<Arc<dyn Tracer>>

[TEST:unit]
FUNCTION MistralClientBuilder::new() -> Self:
    RETURN MistralClientBuilder {
        api_key: None,
        base_url: None,
        timeout: None,
        connect_timeout: None,
        max_retries: None,
        retry_config: None,
        circuit_breaker_config: None,
        rate_limit_config: None,
        http_client: None,
        logger: None,
        tracer: None
    }

[TEST:unit]
FUNCTION MistralClientBuilder::api_key(self, key: SecretString) -> Self:
    self.api_key = Some(key)
    RETURN self

[TEST:unit]
FUNCTION MistralClientBuilder::base_url(self, url: Url) -> Self:
    self.base_url = Some(url)
    RETURN self

[TEST:unit]
FUNCTION MistralClientBuilder::timeout(self, duration: Duration) -> Self:
    self.timeout = Some(duration)
    RETURN self

[TEST:unit]
FUNCTION MistralClientBuilder::build(self) -> Result<MistralClient, MistralError>:
    // Resolve API key
    LET api_key = self.api_key
        .OR_ELSE(|| load_from_env("MISTRAL_API_KEY"))
        .OK_OR(MistralError::ConfigurationError {
            message: "API key not provided",
            field: Some("api_key")
        })?

    // Build configuration
    LET config = ClientConfig {
        api_key: api_key,
        base_url: self.base_url.unwrap_or(DEFAULT_BASE_URL),
        timeout: self.timeout.unwrap_or(DEFAULT_TIMEOUT),
        connect_timeout: self.connect_timeout.unwrap_or(DEFAULT_CONNECT_TIMEOUT),
        max_retries: self.max_retries.unwrap_or(DEFAULT_MAX_RETRIES),
        retry_config: self.retry_config.unwrap_or_default(),
        circuit_breaker_config: self.circuit_breaker_config.unwrap_or_default(),
        rate_limit_config: self.rate_limit_config.unwrap_or_default()
    }

    // Validate configuration
    config.validate()?

    // Build transport
    LET transport = self.http_client.unwrap_or_else(|| {
        Arc::new(ReqwestTransport::new(&config))
    })

    // Build auth manager
    LET auth_manager = Arc::new(BearerAuthProvider::new(config.api_key.clone()))

    // Build resilience orchestrator
    LET resilience = Arc::new(ResilienceOrchestrator::new(
        config.retry_config.clone(),
        config.circuit_breaker_config.clone(),
        config.rate_limit_config.clone()
    ))

    // Build observability
    LET logger = self.logger.unwrap_or_else(|| Arc::new(DefaultLogger::new()))
    LET tracer = self.tracer.unwrap_or_else(|| Arc::new(DefaultTracer::new()))
    LET metrics = Arc::new(DefaultMetricsRecorder::new())

    RETURN Ok(MistralClient {
        config,
        transport,
        auth_manager,
        resilience,
        chat_service: OnceCell::new(),
        fim_service: OnceCell::new(),
        embeddings_service: OnceCell::new(),
        models_service: OnceCell::new(),
        files_service: OnceCell::new(),
        fine_tuning_service: OnceCell::new(),
        agents_service: OnceCell::new(),
        batch_service: OnceCell::new(),
        classifiers_service: OnceCell::new(),
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
FUNCTION MistralClient::new(config: ClientConfig) -> Result<Self, MistralError>:
    MistralClientBuilder::new()
        .api_key(config.api_key)
        .base_url(config.base_url)
        .timeout(config.timeout)
        .build()

[TEST:unit]
FUNCTION MistralClient::from_env() -> Result<Self, MistralError>:
    MistralClientBuilder::new().build()

[TEST:unit]
FUNCTION MistralClient::builder() -> MistralClientBuilder:
    MistralClientBuilder::new()

└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Service Accessors

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SERVICE ACCESSORS                                      │
├─────────────────────────────────────────────────────────────────────────────┤

[TEST:unit]
FUNCTION MistralClient::chat(&self) -> &ChatService:
    self.chat_service.get_or_init(|| {
        ChatService::new(
            Arc::clone(&self.transport),
            Arc::clone(&self.auth_manager),
            Arc::clone(&self.resilience),
            self.config.clone()
        )
    })

[TEST:unit]
FUNCTION MistralClient::fim(&self) -> &FimService:
    self.fim_service.get_or_init(|| {
        FimService::new(
            Arc::clone(&self.transport),
            Arc::clone(&self.auth_manager),
            Arc::clone(&self.resilience),
            self.config.clone()
        )
    })

[TEST:unit]
FUNCTION MistralClient::embeddings(&self) -> &EmbeddingsService:
    self.embeddings_service.get_or_init(|| {
        EmbeddingsService::new(
            Arc::clone(&self.transport),
            Arc::clone(&self.auth_manager),
            Arc::clone(&self.resilience),
            self.config.clone()
        )
    })

[TEST:unit]
FUNCTION MistralClient::models(&self) -> &ModelsService:
    self.models_service.get_or_init(|| {
        ModelsService::new(
            Arc::clone(&self.transport),
            Arc::clone(&self.auth_manager),
            Arc::clone(&self.resilience),
            self.config.clone()
        )
    })

[TEST:unit]
FUNCTION MistralClient::files(&self) -> &FilesService:
    self.files_service.get_or_init(|| {
        FilesService::new(
            Arc::clone(&self.transport),
            Arc::clone(&self.auth_manager),
            Arc::clone(&self.resilience),
            self.config.clone()
        )
    })

[TEST:unit]
FUNCTION MistralClient::fine_tuning(&self) -> &FineTuningService:
    self.fine_tuning_service.get_or_init(|| {
        FineTuningService::new(
            Arc::clone(&self.transport),
            Arc::clone(&self.auth_manager),
            Arc::clone(&self.resilience),
            self.config.clone()
        )
    })

[TEST:unit]
FUNCTION MistralClient::agents(&self) -> &AgentsService:
    self.agents_service.get_or_init(|| {
        AgentsService::new(
            Arc::clone(&self.transport),
            Arc::clone(&self.auth_manager),
            Arc::clone(&self.resilience),
            self.config.clone()
        )
    })

[TEST:unit]
FUNCTION MistralClient::batch(&self) -> &BatchService:
    self.batch_service.get_or_init(|| {
        BatchService::new(
            Arc::clone(&self.transport),
            Arc::clone(&self.auth_manager),
            Arc::clone(&self.resilience),
            self.config.clone()
        )
    })

[TEST:unit]
FUNCTION MistralClient::classifiers(&self) -> &ClassifiersService:
    self.classifiers_service.get_or_init(|| {
        ClassifiersService::new(
            Arc::clone(&self.transport),
            Arc::clone(&self.auth_manager),
            Arc::clone(&self.resilience),
            self.config.clone()
        )
    })

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Configuration Management

### 3.1 ClientConfig Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CLIENT CONFIG                                         │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE ClientConfig:
    // Authentication
    api_key: SecretString

    // Connection settings
    base_url: Url                           // Default: https://api.mistral.ai
    timeout: Duration                       // Default: 120s
    connect_timeout: Duration               // Default: 30s

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

CONSTANTS:
    DEFAULT_BASE_URL = "https://api.mistral.ai"
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
FUNCTION ClientConfig::validate(&self) -> Result<(), MistralError>:
    // Validate base URL
    IF NOT self.base_url.scheme().starts_with("https") THEN:
        RETURN Err(MistralError::ConfigurationError {
            message: "Base URL must use HTTPS",
            field: Some("base_url")
        })

    // Validate timeouts
    IF self.timeout < Duration::from_secs(1) THEN:
        RETURN Err(MistralError::ConfigurationError {
            message: "Timeout must be at least 1 second",
            field: Some("timeout")
        })

    IF self.connect_timeout > self.timeout THEN:
        RETURN Err(MistralError::ConfigurationError {
            message: "Connect timeout cannot exceed request timeout",
            field: Some("connect_timeout")
        })

    // Validate retry settings
    IF self.max_retries > 10 THEN:
        RETURN Err(MistralError::ConfigurationError {
            message: "Max retries cannot exceed 10",
            field: Some("max_retries")
        })

    RETURN Ok(())

[TEST:unit]
FUNCTION ClientConfig::default() -> Self:
    RETURN ClientConfig {
        api_key: SecretString::new(String::new()),  // Must be set
        base_url: Url::parse(DEFAULT_BASE_URL).unwrap(),
        timeout: DEFAULT_TIMEOUT,
        connect_timeout: DEFAULT_CONNECT_TIMEOUT,
        max_retries: DEFAULT_MAX_RETRIES,
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
FUNCTION ReqwestTransport::new(config: &ClientConfig) -> Self:
    LET client = reqwest::Client::builder()
        .timeout(config.timeout)
        .connect_timeout(config.connect_timeout)
        .pool_max_idle_per_host(config.pool_max_idle_per_host)
        .pool_idle_timeout(config.pool_idle_timeout)
        .min_tls_version(TlsVersion::TLS_1_2)
        .https_only(true)
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
    path: Option<String>
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
        PANIC("No more mock responses configured")

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

    IF actual_count != expected_count THEN:
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

        IF LET Some(ref path) = expected.path:
            ASSERT(actual.request.url.path().contains(path),
                "Call {} path mismatch", i)

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
    auth_manager: Arc<dyn AuthProvider>

[TEST:unit]
FUNCTION RequestBuilder::new(base_url: Url, auth_manager: Arc<dyn AuthProvider>) -> Self:
    RETURN RequestBuilder { base_url, auth_manager }

[TEST:unit]
FUNCTION RequestBuilder::build_request<T: Serialize>(
    &self,
    method: HttpMethod,
    path: &str,
    body: Option<&T>,
    extra_headers: Option<HeaderMap>
) -> Result<HttpRequest, MistralError>:

    // Build URL
    LET url = self.base_url.join(path)
        .map_err(|e| MistralError::ConfigurationError {
            message: format!("Invalid path: {}", e),
            field: Some("path")
        })?

    // Build headers
    LET mut headers = HeaderMap::new()
    headers.insert("Content-Type", "application/json")
    headers.insert("Accept", "application/json")
    headers.insert("User-Agent", format!("mistral-rust/{}", VERSION))

    // Add auth header
    LET auth_header = self.auth_manager.get_auth_header()?
    headers.insert("Authorization", auth_header)

    // Add extra headers
    IF LET Some(extra) = extra_headers:
        FOR (name, value) IN extra:
            headers.insert(name, value)

    // Serialize body
    LET body_bytes = IF LET Some(b) = body:
        Some(serde_json::to_vec(b)
            .map_err(|e| MistralError::SerializationError {
                message: format!("Failed to serialize request: {}", e),
                source: Box::new(e)
            })?
            .into())
    ELSE:
        None

    RETURN Ok(HttpRequest {
        method,
        url,
        headers,
        body: body_bytes,
        timeout: None
    })

[TEST:unit]
FUNCTION RequestBuilder::build_multipart_request(
    &self,
    path: &str,
    form: MultipartForm
) -> Result<HttpRequest, MistralError>:

    LET url = self.base_url.join(path)?

    LET mut headers = HeaderMap::new()
    LET boundary = generate_boundary()
    headers.insert("Content-Type", format!("multipart/form-data; boundary={}", boundary))

    LET auth_header = self.auth_manager.get_auth_header()?
    headers.insert("Authorization", auth_header)

    LET body = form.to_bytes(&boundary)?

    RETURN Ok(HttpRequest {
        method: HttpMethod::POST,
        url,
        headers,
        body: Some(body),
        timeout: None
    })

[TEST:unit]
FUNCTION RequestBuilder::build_streaming_request<T: Serialize>(
    &self,
    path: &str,
    body: &T
) -> Result<HttpRequest, MistralError>:

    LET mut headers = HeaderMap::new()
    headers.insert("Accept", "text/event-stream")
    headers.insert("Cache-Control", "no-cache")

    RETURN self.build_request(HttpMethod::POST, path, Some(body), Some(headers))

└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Endpoint Paths

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ENDPOINT PATHS                                        │
├─────────────────────────────────────────────────────────────────────────────┤

MODULE endpoints:
    // Chat endpoints
    CONST CHAT_COMPLETIONS: &str = "/v1/chat/completions"

    // FIM endpoints
    CONST FIM_COMPLETIONS: &str = "/v1/fim/completions"

    // Embeddings endpoints
    CONST EMBEDDINGS: &str = "/v1/embeddings"

    // Models endpoints
    CONST MODELS: &str = "/v1/models"
    FUNCTION model(id: &str) -> String: format!("/v1/models/{}", id)

    // Files endpoints
    CONST FILES: &str = "/v1/files"
    FUNCTION file(id: &str) -> String: format!("/v1/files/{}", id)
    FUNCTION file_content(id: &str) -> String: format!("/v1/files/{}/content", id)

    // Fine-tuning endpoints
    CONST FINE_TUNING_JOBS: &str = "/v1/fine_tuning/jobs"
    FUNCTION fine_tuning_job(id: &str) -> String: format!("/v1/fine_tuning/jobs/{}", id)
    FUNCTION fine_tuning_job_cancel(id: &str) -> String:
        format!("/v1/fine_tuning/jobs/{}/cancel", id)
    FUNCTION fine_tuning_job_start(id: &str) -> String:
        format!("/v1/fine_tuning/jobs/{}/start", id)

    // Agents endpoints
    CONST AGENTS: &str = "/v1/agents"
    FUNCTION agent(id: &str) -> String: format!("/v1/agents/{}", id)
    FUNCTION agent_completions(id: &str) -> String:
        format!("/v1/agents/{}/completions", id)

    // Batch endpoints
    CONST BATCH_JOBS: &str = "/v1/batch/jobs"
    FUNCTION batch_job(id: &str) -> String: format!("/v1/batch/jobs/{}", id)
    FUNCTION batch_job_cancel(id: &str) -> String:
        format!("/v1/batch/jobs/{}/cancel", id)

    // Classifier endpoints
    CONST MODERATIONS: &str = "/v1/moderations"
    CONST CLASSIFIERS: &str = "/v1/classifiers"

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
    // No state needed - all methods are pure functions

[TEST:unit]
FUNCTION ResponseParser::parse_response<T: DeserializeOwned>(
    response: &HttpResponse
) -> Result<T, MistralError>:

    // Check status code first
    IF NOT response.status.is_success() THEN:
        RETURN Err(Self::parse_error_response(response))

    // Parse JSON body
    serde_json::from_slice(&response.body)
        .map_err(|e| MistralError::DeserializationError {
            message: format!("Failed to parse response: {}", e),
            source: Box::new(e)
        })

[TEST:unit]
FUNCTION ResponseParser::parse_error_response(response: &HttpResponse) -> MistralError:
    // Try to parse as API error
    LET error_body: Result<ApiErrorResponse, _> = serde_json::from_slice(&response.body)

    LET (message, param, code) = MATCH error_body:
        Ok(api_error) => (
            api_error.message,
            api_error.param,
            api_error.code
        ),
        Err(_) => (
            String::from_utf8_lossy(&response.body).to_string(),
            None,
            None
        )

    // Map status code to error type
    MATCH response.status.as_u16():
        400 => MistralError::InvalidRequestError { message, param, code },
        401 => MistralError::AuthenticationError { message },
        403 => MistralError::PermissionError { message },
        404 => MistralError::NotFoundError { message, resource: param },
        422 => MistralError::ValidationError {
            message,
            field: param.unwrap_or_default(),
            value: None
        },
        429 => MistralError::RateLimitError {
            message,
            retry_after: Self::parse_retry_after(&response.headers)
        },
        500 => MistralError::InternalError {
            message,
            request_id: Self::extract_request_id(&response.headers)
        },
        502 => MistralError::ServiceError { message },
        503 => MistralError::ServiceUnavailableError {
            message,
            retry_after: Self::parse_retry_after(&response.headers)
        },
        504 => MistralError::TimeoutError {
            message,
            duration: Duration::from_secs(0)
        },
        _ => MistralError::InternalError {
            message,
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
        .and_then(|v| v.to_str().ok())
        .map(String::from)

[TEST:unit]
FUNCTION ResponseParser::extract_rate_limit_info(headers: &HeaderMap) -> RateLimitInfo:
    RETURN RateLimitInfo {
        limit_requests: Self::parse_header_u32(headers, "x-ratelimit-limit-requests"),
        limit_tokens: Self::parse_header_u32(headers, "x-ratelimit-limit-tokens"),
        remaining_requests: Self::parse_header_u32(headers, "x-ratelimit-remaining-requests"),
        remaining_tokens: Self::parse_header_u32(headers, "x-ratelimit-remaining-tokens"),
        reset_requests: Self::parse_header_timestamp(headers, "x-ratelimit-reset-requests"),
        reset_tokens: Self::parse_header_timestamp(headers, "x-ratelimit-reset-tokens")
    }

FUNCTION ResponseParser::parse_header_u32(headers: &HeaderMap, name: &str) -> Option<u32>:
    headers.get(name)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())

└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 API Error Response Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     API ERROR RESPONSE                                      │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE ApiErrorResponse:
    object: String              // "error"
    message: String             // Human-readable message
    type_: String               // Error type (e.g., "invalid_request_error")
    param: Option<String>       // Parameter that caused error
    code: Option<String>        // Error code

STRUCTURE RateLimitInfo:
    limit_requests: Option<u32>
    limit_tokens: Option<u32>
    remaining_requests: Option<u32>
    remaining_tokens: Option<u32>
    reset_requests: Option<Instant>
    reset_tokens: Option<Instant>

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
    FUNCTION get_auth_header(&self) -> Result<HeaderValue, MistralError>

    [TEST:unit]
    FUNCTION get_redacted_key(&self) -> String

└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Bearer Auth Provider

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BEARER AUTH PROVIDER                                     │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE BearerAuthProvider:
    api_key: SecretString

[TEST:unit]
FUNCTION BearerAuthProvider::new(api_key: SecretString) -> Self:
    RETURN BearerAuthProvider { api_key }

IMPL AuthProvider FOR BearerAuthProvider:

    [TEST:unit]
    FUNCTION get_auth_header(&self) -> Result<HeaderValue, MistralError>:
        LET key = self.api_key.expose_secret()

        IF key.is_empty() THEN:
            RETURN Err(MistralError::AuthenticationError {
                message: "API key is empty".to_string()
            })

        LET header_value = format!("Bearer {}", key)

        HeaderValue::from_str(&header_value)
            .map_err(|e| MistralError::AuthenticationError {
                message: format!("Invalid API key format: {}", e)
            })

    [TEST:unit]
    FUNCTION get_redacted_key(&self) -> String:
        LET key = self.api_key.expose_secret()
        IF key.len() <= 8 THEN:
            RETURN "****".to_string()

        LET visible_chars = 4
        LET prefix = &key[..visible_chars]
        LET suffix = &key[key.len()-visible_chars..]

        RETURN format!("{}...{}", prefix, suffix)

└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Mock Auth Provider

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     MOCK AUTH PROVIDER                                      │
├─────────────────────────────────────────────────────────────────────────────┤

[MOCK]
STRUCTURE MockAuthProvider:
    return_header: Option<HeaderValue>
    return_error: Option<MistralError>
    call_count: AtomicUsize

[TEST:unit]
FUNCTION MockAuthProvider::new() -> Self:
    RETURN MockAuthProvider {
        return_header: Some(HeaderValue::from_static("Bearer test-key")),
        return_error: None,
        call_count: AtomicUsize::new(0)
    }

FUNCTION MockAuthProvider::returning_error(error: MistralError) -> Self:
    RETURN MockAuthProvider {
        return_header: None,
        return_error: Some(error),
        call_count: AtomicUsize::new(0)
    }

IMPL AuthProvider FOR MockAuthProvider:

    FUNCTION get_auth_header(&self) -> Result<HeaderValue, MistralError>:
        self.call_count.fetch_add(1, Ordering::SeqCst)

        IF LET Some(ref error) = self.return_error:
            RETURN Err(error.clone())

        Ok(self.return_header.clone().unwrap())

    FUNCTION get_redacted_key(&self) -> String:
        "test...key".to_string()

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

    LET retry_executor = Arc::new(ExponentialBackoffRetry::new(retry_config))
    LET circuit_breaker = Arc::new(DefaultCircuitBreaker::new(circuit_breaker_config))
    LET rate_limiter = Arc::new(TokenBucketRateLimiter::new(rate_limit_config))
    LET logger = Arc::new(DefaultLogger::new())

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
) -> Result<T, MistralError>
WHERE F: Fn() -> Future<Output = Result<T, MistralError>>:

    // 1. Check circuit breaker state
    IF self.circuit_breaker.is_open() THEN:
        self.logger.warn("Circuit breaker is open", context)
        RETURN Err(MistralError::CircuitBreakerOpen {
            message: "Circuit breaker is open, request rejected"
        })

    // 2. Check rate limits
    TRY:
        AWAIT self.rate_limiter.acquire_permit(context)
    CATCH RateLimitExceeded AS e:
        self.logger.warn("Rate limit exceeded", context)
        RETURN Err(MistralError::RateLimitError {
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
        Err(_) => {} // Don't count non-retryable errors

    RETURN result

[TEST:unit]
FUNCTION ResilienceOrchestrator::is_retryable(error: &MistralError) -> bool:
    MATCH error:
        MistralError::RateLimitError { .. } => true,
        MistralError::InternalError { .. } => true,
        MistralError::ServiceError { .. } => true,
        MistralError::ServiceUnavailableError { .. } => true,
        MistralError::TimeoutError { .. } => true,
        MistralError::ConnectionError { .. } => true,
        _ => false

[TEST:unit]
FUNCTION ResilienceOrchestrator::is_circuit_breaker_failure(error: &MistralError) -> bool:
    MATCH error:
        MistralError::InternalError { .. } => true,
        MistralError::ServiceError { .. } => true,
        MistralError::ServiceUnavailableError { .. } => true,
        MistralError::TimeoutError { .. } => true,
        MistralError::ConnectionError { .. } => true,
        _ => false

└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Rate Limit Synchronization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  RATE LIMIT SYNCHRONIZATION                                 │
├─────────────────────────────────────────────────────────────────────────────┤

[TEST:unit]
FUNCTION ResilienceOrchestrator::update_rate_limits(
    &self,
    rate_limit_info: &RateLimitInfo
):
    // Update local rate limiter with server-provided limits
    IF LET Some(remaining) = rate_limit_info.remaining_requests:
        self.rate_limiter.set_remaining_requests(remaining)

    IF LET Some(remaining) = rate_limit_info.remaining_tokens:
        self.rate_limiter.set_remaining_tokens(remaining)

    IF LET Some(reset_time) = rate_limit_info.reset_requests:
        self.rate_limiter.set_reset_time(reset_time)

    self.logger.debug(
        format!("Updated rate limits: requests={:?}, tokens={:?}",
            rate_limit_info.remaining_requests,
            rate_limit_info.remaining_tokens),
        &RequestContext::empty()
    )

[TEST:unit]
FUNCTION ResilienceOrchestrator::handle_retry_after(
    &self,
    retry_after: Duration
):
    self.rate_limiter.pause_until(Instant::now() + retry_after)

    self.logger.info(
        format!("Rate limited, pausing for {:?}", retry_after),
        &RequestContext::empty()
    )

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
    rate_limit_error: Option<MistralError>
    retry_behavior: MockRetryBehavior

ENUM MockRetryBehavior:
    PassThrough           // Execute once, no retry
    FailThenSucceed(u32)  // Fail n times, then succeed
    AlwaysFail            // Always fail

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

FUNCTION MockResilienceOrchestrator::with_rate_limit_error() -> Self:
    RETURN MockResilienceOrchestrator {
        should_allow: false,
        circuit_state: CircuitState::Closed,
        rate_limit_error: Some(MistralError::RateLimitError {
            message: "Rate limit exceeded".to_string(),
            retry_after: Some(Duration::from_secs(30))
        }),
        retry_behavior: MockRetryBehavior::PassThrough
    }

[ASYNC]
FUNCTION MockResilienceOrchestrator::execute<F, T>(
    &self,
    operation: F,
    _context: &RequestContext
) -> Result<T, MistralError>
WHERE F: Fn() -> Future<Output = Result<T, MistralError>>:

    IF self.circuit_state == CircuitState::Open THEN:
        RETURN Err(MistralError::CircuitBreakerOpen {
            message: "Circuit breaker is open"
        })

    IF LET Some(ref error) = self.rate_limit_error:
        RETURN Err(error.clone())

    // Execute the operation
    AWAIT operation()

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Document Navigation

| Previous | Current | Next |
|----------|---------|------|
| [Specification](./specification-mistral.md) | Pseudocode Part 1 | [Pseudocode Part 2](./pseudocode-mistral-2.md) |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial core infrastructure pseudocode |

---

**Continued in Part 2: Services and Streaming**
