# Pseudocode: Cohere Integration Module - Part 1

**Core Infrastructure: Client, Configuration, Transport, Authentication, Resilience**

**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/cohere`
**SPARC Phase:** Pseudocode (1 of 3)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Module Structure](#2-module-structure)
3. [Configuration Management](#3-configuration-management)
4. [Client Initialization](#4-client-initialization)
5. [HTTP Transport Layer](#5-http-transport-layer)
6. [Request Builder](#6-request-builder)
7. [Response Handler](#7-response-handler)
8. [Authentication](#8-authentication)
9. [Resilience Orchestrator](#9-resilience-orchestrator)
10. [Streaming Infrastructure](#10-streaming-infrastructure)

---

## 1. Overview

This document provides detailed pseudocode for the core infrastructure of the Cohere integration module. All pseudocode follows London-School TDD principles with clear interface definitions, dependency injection points, and mock boundaries.

### Design Principles Applied

- **Interface Segregation**: Small, focused interfaces
- **Dependency Inversion**: Depend on abstractions, not concretions
- **Single Responsibility**: Each component has one reason to change
- **Open/Closed**: Open for extension, closed for modification

---

## 2. Module Structure

### 2.1 Rust Crate Organization

```
integrations-cohere/
├── Cargo.toml
├── src/
│   ├── lib.rs                    # Public API exports
│   ├── client.rs                 # CohereClient implementation
│   ├── config.rs                 # Configuration types
│   ├── error.rs                  # Error types
│   ├── transport/
│   │   ├── mod.rs
│   │   ├── http.rs               # HTTP transport
│   │   ├── request.rs            # Request builder
│   │   └── response.rs           # Response handler
│   ├── auth/
│   │   ├── mod.rs
│   │   └── bearer.rs             # Bearer token auth
│   ├── resilience/
│   │   ├── mod.rs
│   │   └── orchestrator.rs       # Resilience coordination
│   ├── streaming/
│   │   ├── mod.rs
│   │   ├── sse.rs                # SSE parser
│   │   └── events.rs             # Event types
│   ├── services/
│   │   ├── mod.rs
│   │   ├── chat.rs               # Chat service
│   │   ├── generate.rs           # Generate service
│   │   ├── embed.rs              # Embed service
│   │   ├── rerank.rs             # Rerank service
│   │   ├── classify.rs           # Classify service
│   │   ├── summarize.rs          # Summarize service
│   │   ├── tokenize.rs           # Tokenize service
│   │   ├── models.rs             # Models service
│   │   ├── datasets.rs           # Datasets service
│   │   ├── connectors.rs         # Connectors service
│   │   └── finetune.rs           # Fine-tuning service
│   └── types/
│       ├── mod.rs
│       ├── chat.rs               # Chat types
│       ├── generate.rs           # Generate types
│       ├── embed.rs              # Embed types
│       ├── rerank.rs             # Rerank types
│       ├── classify.rs           # Classify types
│       ├── summarize.rs          # Summarize types
│       ├── tokenize.rs           # Tokenize types
│       ├── models.rs             # Model types
│       ├── datasets.rs           # Dataset types
│       ├── connectors.rs         # Connector types
│       ├── finetune.rs           # Fine-tune types
│       └── common.rs             # Shared types
└── tests/
    ├── unit/
    ├── integration/
    └── contract/
```

### 2.2 TypeScript Package Organization

```
packages/integrations-cohere/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  # Public exports
│   ├── client.ts                 # CohereClient
│   ├── config.ts                 # Configuration
│   ├── errors.ts                 # Error types
│   ├── transport/
│   │   ├── index.ts
│   │   ├── http.ts
│   │   ├── request.ts
│   │   └── response.ts
│   ├── auth/
│   │   ├── index.ts
│   │   └── bearer.ts
│   ├── resilience/
│   │   ├── index.ts
│   │   └── orchestrator.ts
│   ├── streaming/
│   │   ├── index.ts
│   │   ├── sse.ts
│   │   └── events.ts
│   ├── services/
│   │   ├── index.ts
│   │   ├── chat.ts
│   │   ├── generate.ts
│   │   ├── embed.ts
│   │   ├── rerank.ts
│   │   ├── classify.ts
│   │   ├── summarize.ts
│   │   ├── tokenize.ts
│   │   ├── models.ts
│   │   ├── datasets.ts
│   │   ├── connectors.ts
│   │   └── finetune.ts
│   └── types/
│       └── [type files]
└── tests/
    ├── unit/
    ├── integration/
    └── contract/
```

---

## 3. Configuration Management

### 3.1 Configuration Interface

```pseudocode
INTERFACE ConfigProvider:
    /**
     * Retrieves configuration value by key
     * @param key - Configuration key path (dot-separated)
     * @returns Optional configuration value
     */
    FUNCTION get(key: String) -> Option<ConfigValue>

    /**
     * Retrieves typed configuration value
     * @param key - Configuration key path
     * @returns Typed value or error
     */
    FUNCTION get_typed<T>(key: String) -> Result<T, ConfigError>

    /**
     * Checks if configuration key exists
     */
    FUNCTION has(key: String) -> Boolean
```

### 3.2 Cohere Configuration Types

```pseudocode
STRUCT CohereConfig:
    // API Configuration
    api_key: SecretString           // Required: Cohere API key
    base_url: String                // Default: "https://api.cohere.ai"
    api_version: String             // Default: "v1" (or "v2" for newer endpoints)

    // HTTP Configuration
    http: HttpConfig

    // Resilience Configuration
    resilience: ResilienceConfig

    // Observability Configuration
    observability: ObservabilityConfig

    // Feature Flags
    features: FeatureFlags

STRUCT HttpConfig:
    timeout_ms: u64                 // Default: 30000 (30 seconds)
    connect_timeout_ms: u64         // Default: 10000 (10 seconds)
    pool_max_idle_per_host: u32     // Default: 10
    pool_idle_timeout_ms: u64       // Default: 90000 (90 seconds)
    user_agent: String              // Default: "integrations-cohere/{version}"

STRUCT ResilienceConfig:
    retry: RetryConfig
    circuit_breaker: CircuitBreakerConfig
    rate_limit: RateLimitConfig

STRUCT RetryConfig:
    max_attempts: u32               // Default: 3
    initial_delay_ms: u64           // Default: 1000
    max_delay_ms: u64               // Default: 30000
    multiplier: f64                 // Default: 2.0
    jitter_factor: f64              // Default: 0.1
    retryable_status_codes: List<u16>  // Default: [429, 500, 502, 503, 504]

STRUCT CircuitBreakerConfig:
    failure_threshold: u32          // Default: 5
    success_threshold: u32          // Default: 2
    half_open_max_calls: u32        // Default: 3
    open_duration_ms: u64           // Default: 30000

STRUCT RateLimitConfig:
    requests_per_minute: u32        // Default: 10000
    tokens_per_minute: u32          // Default: 100000
    strategy: RateLimitStrategy     // Default: TokenBucket

ENUM RateLimitStrategy:
    TokenBucket
    SlidingWindow
    FixedWindow

STRUCT ObservabilityConfig:
    tracing_enabled: Boolean        // Default: true
    metrics_enabled: Boolean        // Default: true
    logging_level: LogLevel         // Default: Info
    sensitive_headers_redacted: Boolean  // Default: true

STRUCT FeatureFlags:
    enable_streaming: Boolean       // Default: true
    enable_rag: Boolean             // Default: true
    enable_tool_use: Boolean        // Default: true
    enable_citations: Boolean       // Default: true
```

### 3.3 Configuration Builder

```pseudocode
CLASS CohereConfigBuilder:
    PRIVATE config: CohereConfig

    CONSTRUCTOR():
        // Initialize with defaults
        this.config = CohereConfig.defaults()

    FUNCTION api_key(key: SecretString) -> Self:
        this.config.api_key = key
        RETURN this

    FUNCTION base_url(url: String) -> Self:
        VALIDATE url is valid URL format
        this.config.base_url = url.trim_end_match('/')
        RETURN this

    FUNCTION timeout(duration: Duration) -> Self:
        this.config.http.timeout_ms = duration.as_millis()
        RETURN this

    FUNCTION with_retry(config: RetryConfig) -> Self:
        this.config.resilience.retry = config
        RETURN this

    FUNCTION with_circuit_breaker(config: CircuitBreakerConfig) -> Self:
        this.config.resilience.circuit_breaker = config
        RETURN this

    FUNCTION with_rate_limit(config: RateLimitConfig) -> Self:
        this.config.resilience.rate_limit = config
        RETURN this

    FUNCTION from_env() -> Self:
        // Load from environment variables
        IF env_var("COHERE_API_KEY") EXISTS:
            this.config.api_key = SecretString.from(env_var("COHERE_API_KEY"))

        IF env_var("COHERE_BASE_URL") EXISTS:
            this.config.base_url = env_var("COHERE_BASE_URL")

        IF env_var("COHERE_TIMEOUT_MS") EXISTS:
            this.config.http.timeout_ms = parse_u64(env_var("COHERE_TIMEOUT_MS"))

        IF env_var("COHERE_MAX_RETRIES") EXISTS:
            this.config.resilience.retry.max_attempts = parse_u32(env_var("COHERE_MAX_RETRIES"))

        RETURN this

    FUNCTION build() -> Result<CohereConfig, ConfigError>:
        // Validate required fields
        IF this.config.api_key.is_empty():
            RETURN Err(ConfigError::MissingRequired("api_key"))

        IF NOT is_valid_url(this.config.base_url):
            RETURN Err(ConfigError::InvalidValue("base_url", "must be valid URL"))

        // Validate ranges
        IF this.config.resilience.retry.max_attempts < 1:
            RETURN Err(ConfigError::InvalidValue("max_attempts", "must be >= 1"))

        IF this.config.resilience.retry.multiplier <= 0:
            RETURN Err(ConfigError::InvalidValue("multiplier", "must be > 0"))

        RETURN Ok(this.config.clone())
```

### 3.4 Configuration Validation

```pseudocode
FUNCTION validate_config(config: CohereConfig) -> Result<(), ConfigError>:
    errors: List<String> = []

    // Validate API key
    IF config.api_key.expose_secret().is_empty():
        errors.push("api_key is required")

    // Validate base URL
    IF NOT is_valid_https_url(config.base_url):
        errors.push("base_url must be a valid HTTPS URL")

    // Validate timeouts
    IF config.http.timeout_ms < 1000:
        errors.push("timeout must be at least 1000ms")

    IF config.http.connect_timeout_ms > config.http.timeout_ms:
        errors.push("connect_timeout must be <= timeout")

    // Validate retry config
    IF config.resilience.retry.initial_delay_ms > config.resilience.retry.max_delay_ms:
        errors.push("initial_delay must be <= max_delay")

    // Validate rate limits
    IF config.resilience.rate_limit.requests_per_minute == 0:
        errors.push("requests_per_minute must be > 0")

    IF errors.is_empty():
        RETURN Ok(())
    ELSE:
        RETURN Err(ConfigError::ValidationFailed(errors))
```

---

## 4. Client Initialization

### 4.1 Client Interface

```pseudocode
INTERFACE CohereClientInterface:
    /**
     * Access to Chat service
     */
    FUNCTION chat() -> ChatService

    /**
     * Access to Generate service
     */
    FUNCTION generate() -> GenerateService

    /**
     * Access to Embed service
     */
    FUNCTION embed() -> EmbedService

    /**
     * Access to Rerank service
     */
    FUNCTION rerank() -> RerankService

    /**
     * Access to Classify service
     */
    FUNCTION classify() -> ClassifyService

    /**
     * Access to Summarize service
     */
    FUNCTION summarize() -> SummarizeService

    /**
     * Access to Tokenize service
     */
    FUNCTION tokenize() -> TokenizeService

    /**
     * Access to Models service
     */
    FUNCTION models() -> ModelsService

    /**
     * Access to Datasets service
     */
    FUNCTION datasets() -> DatasetsService

    /**
     * Access to Connectors service
     */
    FUNCTION connectors() -> ConnectorsService

    /**
     * Access to Fine-tuning service
     */
    FUNCTION finetune() -> FinetuneService
```

### 4.2 Client Implementation

```pseudocode
CLASS CohereClient IMPLEMENTS CohereClientInterface:
    PRIVATE config: CohereConfig
    PRIVATE transport: HttpTransport
    PRIVATE auth: AuthProvider
    PRIVATE resilience: ResilienceOrchestrator
    PRIVATE tracer: Tracer
    PRIVATE metrics: MetricsRecorder

    // Lazy-initialized services
    PRIVATE chat_service: Option<ChatService>
    PRIVATE generate_service: Option<GenerateService>
    PRIVATE embed_service: Option<EmbedService>
    PRIVATE rerank_service: Option<RerankService>
    PRIVATE classify_service: Option<ClassifyService>
    PRIVATE summarize_service: Option<SummarizeService>
    PRIVATE tokenize_service: Option<TokenizeService>
    PRIVATE models_service: Option<ModelsService>
    PRIVATE datasets_service: Option<DatasetsService>
    PRIVATE connectors_service: Option<ConnectorsService>
    PRIVATE finetune_service: Option<FinetuneService>

    /**
     * Creates new client with configuration
     */
    STATIC FUNCTION new(config: CohereConfig) -> Result<CohereClient, ClientError>:
        // Validate configuration
        validate_config(config)?

        // Initialize tracer
        tracer = Tracer.new("cohere-client")

        // Initialize metrics
        metrics = MetricsRecorder.new("cohere")

        // Create HTTP transport
        transport = HttpTransport.new(HttpTransportConfig {
            timeout: Duration.from_millis(config.http.timeout_ms),
            connect_timeout: Duration.from_millis(config.http.connect_timeout_ms),
            pool_config: PoolConfig {
                max_idle_per_host: config.http.pool_max_idle_per_host,
                idle_timeout: Duration.from_millis(config.http.pool_idle_timeout_ms),
            },
            user_agent: config.http.user_agent.clone(),
        })?

        // Create auth provider
        auth = BearerTokenAuth.new(config.api_key.clone())

        // Create resilience orchestrator
        resilience = ResilienceOrchestrator.new(
            config.resilience.retry.clone(),
            config.resilience.circuit_breaker.clone(),
            config.resilience.rate_limit.clone(),
        )

        RETURN Ok(CohereClient {
            config,
            transport,
            auth,
            resilience,
            tracer,
            metrics,
            chat_service: None,
            generate_service: None,
            embed_service: None,
            rerank_service: None,
            classify_service: None,
            summarize_service: None,
            tokenize_service: None,
            models_service: None,
            datasets_service: None,
            connectors_service: None,
            finetune_service: None,
        })

    /**
     * Creates client from environment variables
     */
    STATIC FUNCTION from_env() -> Result<CohereClient, ClientError>:
        config = CohereConfigBuilder.new()
            .from_env()
            .build()?

        RETURN CohereClient.new(config)

    /**
     * Creates client with builder pattern
     */
    STATIC FUNCTION builder() -> CohereClientBuilder:
        RETURN CohereClientBuilder.new()

    FUNCTION chat() -> ChatService:
        IF this.chat_service.is_none():
            this.chat_service = Some(ChatService.new(
                this.create_service_context()
            ))
        RETURN this.chat_service.unwrap()

    FUNCTION generate() -> GenerateService:
        IF this.generate_service.is_none():
            this.generate_service = Some(GenerateService.new(
                this.create_service_context()
            ))
        RETURN this.generate_service.unwrap()

    FUNCTION embed() -> EmbedService:
        IF this.embed_service.is_none():
            this.embed_service = Some(EmbedService.new(
                this.create_service_context()
            ))
        RETURN this.embed_service.unwrap()

    FUNCTION rerank() -> RerankService:
        IF this.rerank_service.is_none():
            this.rerank_service = Some(RerankService.new(
                this.create_service_context()
            ))
        RETURN this.rerank_service.unwrap()

    FUNCTION classify() -> ClassifyService:
        IF this.classify_service.is_none():
            this.classify_service = Some(ClassifyService.new(
                this.create_service_context()
            ))
        RETURN this.classify_service.unwrap()

    FUNCTION summarize() -> SummarizeService:
        IF this.summarize_service.is_none():
            this.summarize_service = Some(SummarizeService.new(
                this.create_service_context()
            ))
        RETURN this.summarize_service.unwrap()

    FUNCTION tokenize() -> TokenizeService:
        IF this.tokenize_service.is_none():
            this.tokenize_service = Some(TokenizeService.new(
                this.create_service_context()
            ))
        RETURN this.tokenize_service.unwrap()

    FUNCTION models() -> ModelsService:
        IF this.models_service.is_none():
            this.models_service = Some(ModelsService.new(
                this.create_service_context()
            ))
        RETURN this.models_service.unwrap()

    FUNCTION datasets() -> DatasetsService:
        IF this.datasets_service.is_none():
            this.datasets_service = Some(DatasetsService.new(
                this.create_service_context()
            ))
        RETURN this.datasets_service.unwrap()

    FUNCTION connectors() -> ConnectorsService:
        IF this.connectors_service.is_none():
            this.connectors_service = Some(ConnectorsService.new(
                this.create_service_context()
            ))
        RETURN this.connectors_service.unwrap()

    FUNCTION finetune() -> FinetuneService:
        IF this.finetune_service.is_none():
            this.finetune_service = Some(FinetuneService.new(
                this.create_service_context()
            ))
        RETURN this.finetune_service.unwrap()

    PRIVATE FUNCTION create_service_context() -> ServiceContext:
        RETURN ServiceContext {
            config: this.config.clone(),
            transport: this.transport.clone(),
            auth: this.auth.clone(),
            resilience: this.resilience.clone(),
            tracer: this.tracer.clone(),
            metrics: this.metrics.clone(),
        }
```

### 4.3 Service Context

```pseudocode
STRUCT ServiceContext:
    config: CohereConfig
    transport: Arc<HttpTransport>
    auth: Arc<dyn AuthProvider>
    resilience: Arc<ResilienceOrchestrator>
    tracer: Tracer
    metrics: MetricsRecorder

IMPL ServiceContext:
    /**
     * Creates a request executor with full pipeline
     */
    FUNCTION create_executor() -> RequestExecutor:
        RETURN RequestExecutor.new(
            this.transport.clone(),
            this.auth.clone(),
            this.resilience.clone(),
        )

    /**
     * Gets base URL for API requests
     */
    FUNCTION base_url() -> String:
        RETURN this.config.base_url.clone()

    /**
     * Creates child span for tracing
     */
    FUNCTION span(name: String) -> Span:
        RETURN this.tracer.span(name)

    /**
     * Records metric
     */
    FUNCTION record_metric(name: String, value: f64, tags: Map<String, String>):
        this.metrics.record(name, value, tags)
```

---

## 5. HTTP Transport Layer

### 5.1 Transport Interface

```pseudocode
INTERFACE HttpTransportInterface:
    /**
     * Sends HTTP request and returns response
     */
    ASYNC FUNCTION send(request: HttpRequest) -> Result<HttpResponse, TransportError>

    /**
     * Sends request with streaming response
     */
    ASYNC FUNCTION send_streaming(request: HttpRequest) -> Result<ByteStream, TransportError>

    /**
     * Checks transport health
     */
    ASYNC FUNCTION health_check() -> Result<(), TransportError>
```

### 5.2 HTTP Transport Implementation

```pseudocode
CLASS HttpTransport IMPLEMENTS HttpTransportInterface:
    PRIVATE client: HttpClient          // reqwest/hyper in Rust, fetch/axios in TS
    PRIVATE config: HttpTransportConfig
    PRIVATE tracer: Tracer

    CONSTRUCTOR(config: HttpTransportConfig):
        // Build HTTP client with TLS configuration
        tls_config = TlsConfig {
            min_version: TlsVersion.V1_2,
            verify_certificates: true,
        }

        this.client = HttpClient.builder()
            .timeout(config.timeout)
            .connect_timeout(config.connect_timeout)
            .pool_max_idle_per_host(config.pool_config.max_idle_per_host)
            .pool_idle_timeout(config.pool_config.idle_timeout)
            .user_agent(config.user_agent)
            .tls_config(tls_config)
            .build()

        this.config = config
        this.tracer = Tracer.new("http-transport")

    ASYNC FUNCTION send(request: HttpRequest) -> Result<HttpResponse, TransportError>:
        span = this.tracer.span("http.send")
        span.set_attribute("http.method", request.method)
        span.set_attribute("http.url", request.url.redacted())

        TRY:
            // Convert to client request
            client_request = this.build_client_request(request)

            // Send request
            start_time = Instant.now()
            response = AWAIT this.client.execute(client_request)
            duration = Instant.now() - start_time

            span.set_attribute("http.status_code", response.status())
            span.set_attribute("http.duration_ms", duration.as_millis())

            // Convert response
            http_response = HttpResponse {
                status: response.status(),
                headers: response.headers().clone(),
                body: AWAIT response.bytes(),
            }

            RETURN Ok(http_response)

        CATCH error:
            span.set_error(error)

            IF error IS timeout_error:
                RETURN Err(TransportError::Timeout(this.config.timeout))
            ELSE IF error IS connection_error:
                RETURN Err(TransportError::Connection(error.message()))
            ELSE IF error IS tls_error:
                RETURN Err(TransportError::TlsError(error.message()))
            ELSE:
                RETURN Err(TransportError::Unknown(error.message()))

        FINALLY:
            span.end()

    ASYNC FUNCTION send_streaming(request: HttpRequest) -> Result<ByteStream, TransportError>:
        span = this.tracer.span("http.send_streaming")
        span.set_attribute("http.method", request.method)
        span.set_attribute("http.url", request.url.redacted())

        TRY:
            client_request = this.build_client_request(request)
            response = AWAIT this.client.execute(client_request)

            span.set_attribute("http.status_code", response.status())

            // Check for error status before streaming
            IF response.status() >= 400:
                body = AWAIT response.bytes()
                RETURN Err(TransportError::HttpError(response.status(), body))

            // Return byte stream
            RETURN Ok(response.bytes_stream())

        CATCH error:
            span.set_error(error)
            RETURN Err(TransportError::from(error))

        FINALLY:
            span.end()

    PRIVATE FUNCTION build_client_request(request: HttpRequest) -> ClientRequest:
        builder = this.client.request(request.method, request.url)

        // Add headers
        FOR (name, value) IN request.headers:
            builder = builder.header(name, value)

        // Add body if present
        IF request.body.is_some():
            builder = builder.body(request.body.unwrap())

        RETURN builder.build()

    ASYNC FUNCTION health_check() -> Result<(), TransportError>:
        // Simple connectivity check
        request = HttpRequest {
            method: Method.HEAD,
            url: format!("{}/health", this.config.base_url),
            headers: Map.new(),
            body: None,
        }

        response = AWAIT this.send(request)?

        IF response.status >= 200 AND response.status < 300:
            RETURN Ok(())
        ELSE:
            RETURN Err(TransportError::HealthCheckFailed(response.status))
```

### 5.3 Transport Error Types

```pseudocode
ENUM TransportError:
    Timeout(Duration)               // Request timed out
    Connection(String)              // Connection failed
    TlsError(String)                // TLS/SSL error
    HttpError(StatusCode, Bytes)    // HTTP error response
    HealthCheckFailed(StatusCode)   // Health check failed
    Unknown(String)                 // Unknown error

IMPL TransportError:
    FUNCTION is_retryable() -> Boolean:
        MATCH this:
            Timeout(_) => true
            Connection(_) => true
            HttpError(status, _) => status IN [429, 500, 502, 503, 504]
            _ => false

    FUNCTION status_code() -> Option<StatusCode>:
        MATCH this:
            HttpError(status, _) => Some(status)
            HealthCheckFailed(status) => Some(status)
            _ => None
```

---

## 6. Request Builder

### 6.1 Request Builder Interface

```pseudocode
INTERFACE RequestBuilderInterface:
    /**
     * Sets HTTP method
     */
    FUNCTION method(method: Method) -> Self

    /**
     * Sets request path (appended to base URL)
     */
    FUNCTION path(path: String) -> Self

    /**
     * Adds query parameter
     */
    FUNCTION query(key: String, value: String) -> Self

    /**
     * Adds header
     */
    FUNCTION header(name: String, value: String) -> Self

    /**
     * Sets JSON body
     */
    FUNCTION json<T: Serialize>(body: T) -> Self

    /**
     * Sets multipart form body
     */
    FUNCTION multipart(form: MultipartForm) -> Self

    /**
     * Builds final HTTP request
     */
    FUNCTION build() -> Result<HttpRequest, RequestError>
```

### 6.2 Request Builder Implementation

```pseudocode
CLASS RequestBuilder IMPLEMENTS RequestBuilderInterface:
    PRIVATE base_url: String
    PRIVATE method: Method
    PRIVATE path: String
    PRIVATE query_params: Map<String, String>
    PRIVATE headers: Map<String, String>
    PRIVATE body: Option<RequestBody>

    CONSTRUCTOR(base_url: String):
        this.base_url = base_url
        this.method = Method.GET
        this.path = ""
        this.query_params = Map.new()
        this.headers = Map.new()
        this.body = None

        // Set default headers
        this.headers.insert("Accept", "application/json")

    FUNCTION method(method: Method) -> Self:
        this.method = method
        RETURN this

    FUNCTION path(path: String) -> Self:
        // Ensure path starts with /
        IF NOT path.starts_with('/'):
            this.path = "/" + path
        ELSE:
            this.path = path
        RETURN this

    FUNCTION query(key: String, value: String) -> Self:
        this.query_params.insert(key, value)
        RETURN this

    FUNCTION header(name: String, value: String) -> Self:
        this.headers.insert(name, value)
        RETURN this

    FUNCTION json<T: Serialize>(body: T) -> Self:
        this.headers.insert("Content-Type", "application/json")
        this.body = Some(RequestBody::Json(serialize_json(body)))
        RETURN this

    FUNCTION multipart(form: MultipartForm) -> Self:
        // Content-Type will be set automatically with boundary
        this.body = Some(RequestBody::Multipart(form))
        RETURN this

    FUNCTION build() -> Result<HttpRequest, RequestError>:
        // Build URL with query params
        url = this.base_url + this.path

        IF NOT this.query_params.is_empty():
            query_string = this.query_params
                .entries()
                .map(|(k, v)| format!("{}={}", url_encode(k), url_encode(v)))
                .join("&")
            url = url + "?" + query_string

        // Validate URL
        IF NOT is_valid_url(url):
            RETURN Err(RequestError::InvalidUrl(url))

        // Build body bytes
        body_bytes = MATCH this.body:
            Some(RequestBody::Json(json)) => Some(json.as_bytes())
            Some(RequestBody::Multipart(form)) => Some(form.to_bytes())
            None => None

        RETURN Ok(HttpRequest {
            method: this.method,
            url: url,
            headers: this.headers.clone(),
            body: body_bytes,
        })

ENUM RequestBody:
    Json(String)
    Multipart(MultipartForm)
    Raw(Bytes)
```

### 6.3 Cohere-Specific Request Builder

```pseudocode
CLASS CohereRequestBuilder:
    PRIVATE builder: RequestBuilder
    PRIVATE api_version: String

    CONSTRUCTOR(base_url: String, api_version: String):
        this.builder = RequestBuilder.new(base_url)
        this.api_version = api_version

    /**
     * Creates chat completions request
     */
    FUNCTION chat_completion() -> Self:
        this.builder
            .method(Method.POST)
            .path(format!("/{}/chat", this.api_version))
        RETURN this

    /**
     * Creates generate request
     */
    FUNCTION generate() -> Self:
        this.builder
            .method(Method.POST)
            .path(format!("/{}/generate", this.api_version))
        RETURN this

    /**
     * Creates embed request
     */
    FUNCTION embed() -> Self:
        this.builder
            .method(Method.POST)
            .path(format!("/{}/embed", this.api_version))
        RETURN this

    /**
     * Creates rerank request
     */
    FUNCTION rerank() -> Self:
        this.builder
            .method(Method.POST)
            .path(format!("/{}/rerank", this.api_version))
        RETURN this

    /**
     * Creates classify request
     */
    FUNCTION classify() -> Self:
        this.builder
            .method(Method.POST)
            .path(format!("/{}/classify", this.api_version))
        RETURN this

    /**
     * Creates summarize request
     */
    FUNCTION summarize() -> Self:
        this.builder
            .method(Method.POST)
            .path(format!("/{}/summarize", this.api_version))
        RETURN this

    /**
     * Creates tokenize request
     */
    FUNCTION tokenize() -> Self:
        this.builder
            .method(Method.POST)
            .path(format!("/{}/tokenize", this.api_version))
        RETURN this

    /**
     * Creates detokenize request
     */
    FUNCTION detokenize() -> Self:
        this.builder
            .method(Method.POST)
            .path(format!("/{}/detokenize", this.api_version))
        RETURN this

    /**
     * Creates list models request
     */
    FUNCTION list_models() -> Self:
        this.builder
            .method(Method.GET)
            .path(format!("/{}/models", this.api_version))
        RETURN this

    /**
     * Creates get model request
     */
    FUNCTION get_model(model_id: String) -> Self:
        this.builder
            .method(Method.GET)
            .path(format!("/{}/models/{}", this.api_version, model_id))
        RETURN this

    /**
     * Delegates to inner builder
     */
    FUNCTION json<T: Serialize>(body: T) -> Self:
        this.builder.json(body)
        RETURN this

    FUNCTION query(key: String, value: String) -> Self:
        this.builder.query(key, value)
        RETURN this

    FUNCTION build() -> Result<HttpRequest, RequestError>:
        RETURN this.builder.build()
```

---

## 7. Response Handler

### 7.1 Response Handler Interface

```pseudocode
INTERFACE ResponseHandlerInterface:
    /**
     * Parses successful JSON response
     */
    FUNCTION parse_json<T: Deserialize>(response: HttpResponse) -> Result<T, ResponseError>

    /**
     * Parses error response
     */
    FUNCTION parse_error(response: HttpResponse) -> CohereError

    /**
     * Handles response based on status code
     */
    FUNCTION handle<T: Deserialize>(response: HttpResponse) -> Result<T, CohereError>
```

### 7.2 Response Handler Implementation

```pseudocode
CLASS ResponseHandler IMPLEMENTS ResponseHandlerInterface:
    PRIVATE tracer: Tracer

    CONSTRUCTOR():
        this.tracer = Tracer.new("response-handler")

    FUNCTION parse_json<T: Deserialize>(response: HttpResponse) -> Result<T, ResponseError>:
        span = this.tracer.span("parse_json")

        TRY:
            // Decode body as UTF-8
            body_str = String.from_utf8(response.body)?

            // Parse JSON
            result = deserialize_json<T>(body_str)?

            RETURN Ok(result)

        CATCH json_error:
            span.set_error(json_error)
            RETURN Err(ResponseError::JsonParseError(json_error.message()))

        CATCH utf8_error:
            span.set_error(utf8_error)
            RETURN Err(ResponseError::InvalidUtf8)

        FINALLY:
            span.end()

    FUNCTION parse_error(response: HttpResponse) -> CohereError:
        span = this.tracer.span("parse_error")
        span.set_attribute("http.status", response.status)

        TRY:
            // Try to parse as Cohere error response
            body_str = String.from_utf8(response.body.clone())
                .unwrap_or_default()

            error_response = deserialize_json<CohereErrorResponse>(body_str)

            IF error_response.is_ok():
                err = error_response.unwrap()
                RETURN this.map_error_response(response.status, err)
            ELSE:
                // Couldn't parse error body
                RETURN this.map_status_code(response.status, body_str)

        FINALLY:
            span.end()

    FUNCTION handle<T: Deserialize>(response: HttpResponse) -> Result<T, CohereError>:
        span = this.tracer.span("handle_response")
        span.set_attribute("http.status", response.status)

        TRY:
            IF response.status >= 200 AND response.status < 300:
                // Success response
                result = this.parse_json<T>(response)?
                RETURN Ok(result)
            ELSE:
                // Error response
                error = this.parse_error(response)
                RETURN Err(error)

        FINALLY:
            span.end()

    PRIVATE FUNCTION map_error_response(status: StatusCode, err: CohereErrorResponse) -> CohereError:
        MATCH status:
            400 => CohereError::BadRequest {
                message: err.message,
            }
            401 => CohereError::Authentication {
                message: err.message,
            }
            403 => CohereError::PermissionDenied {
                message: err.message,
            }
            404 => CohereError::NotFound {
                message: err.message,
            }
            422 => CohereError::ValidationError {
                message: err.message,
            }
            429 => CohereError::RateLimited {
                message: err.message,
                retry_after: this.extract_retry_after(err),
            }
            500 => CohereError::InternalError {
                message: err.message,
            }
            503 => CohereError::ServiceUnavailable {
                message: err.message,
            }
            _ => CohereError::Unknown {
                status: status,
                message: err.message,
            }

    PRIVATE FUNCTION map_status_code(status: StatusCode, body: String) -> CohereError:
        MATCH status:
            400 => CohereError::BadRequest { message: body }
            401 => CohereError::Authentication { message: "Invalid API key" }
            403 => CohereError::PermissionDenied { message: body }
            404 => CohereError::NotFound { message: body }
            429 => CohereError::RateLimited { message: body, retry_after: None }
            500..=599 => CohereError::InternalError { message: body }
            _ => CohereError::Unknown { status, message: body }

    PRIVATE FUNCTION extract_retry_after(err: CohereErrorResponse) -> Option<Duration>:
        // Check for retry-after in error details
        IF err.retry_after.is_some():
            RETURN Some(Duration.from_secs(err.retry_after.unwrap()))
        RETURN None

STRUCT CohereErrorResponse:
    message: String
    retry_after: Option<u64>
```

---

## 8. Authentication

### 8.1 Auth Provider Interface

```pseudocode
INTERFACE AuthProvider:
    /**
     * Adds authentication to request
     */
    FUNCTION authenticate(request: HttpRequest) -> Result<HttpRequest, AuthError>

    /**
     * Validates credentials without making request
     */
    FUNCTION validate() -> Result<(), AuthError>

    /**
     * Returns auth type for logging (never exposes secrets)
     */
    FUNCTION auth_type() -> String
```

### 8.2 Bearer Token Authentication

```pseudocode
CLASS BearerTokenAuth IMPLEMENTS AuthProvider:
    PRIVATE api_key: SecretString

    CONSTRUCTOR(api_key: SecretString):
        this.api_key = api_key

    FUNCTION authenticate(request: HttpRequest) -> Result<HttpRequest, AuthError>:
        // Validate key before using
        IF this.api_key.expose_secret().is_empty():
            RETURN Err(AuthError::MissingCredentials("API key is empty"))

        // Clone request and add auth header
        authenticated_request = request.clone()
        authenticated_request.headers.insert(
            "Authorization",
            format!("Bearer {}", this.api_key.expose_secret())
        )

        RETURN Ok(authenticated_request)

    FUNCTION validate() -> Result<(), AuthError>:
        key = this.api_key.expose_secret()

        IF key.is_empty():
            RETURN Err(AuthError::MissingCredentials("API key is empty"))

        // Cohere API keys have specific format
        // They typically start with specific prefixes
        IF NOT this.is_valid_key_format(key):
            RETURN Err(AuthError::InvalidCredentials("Invalid API key format"))

        RETURN Ok(())

    FUNCTION auth_type() -> String:
        RETURN "bearer_token"

    PRIVATE FUNCTION is_valid_key_format(key: String) -> Boolean:
        // Basic validation - key should be non-empty and reasonable length
        // Cohere keys are typically 40+ characters
        RETURN key.len() >= 20 AND key.chars().all(|c| c.is_alphanumeric() OR c == '-' OR c == '_')
```

### 8.3 Auth Error Types

```pseudocode
ENUM AuthError:
    MissingCredentials(String)      // Credentials not provided
    InvalidCredentials(String)      // Credentials format invalid
    Expired(String)                 // Credentials expired
    Revoked(String)                 // Credentials revoked

IMPL AuthError:
    FUNCTION is_retryable() -> Boolean:
        // Auth errors are generally not retryable
        RETURN false

    FUNCTION to_cohere_error() -> CohereError:
        MATCH this:
            MissingCredentials(msg) => CohereError::Authentication { message: msg }
            InvalidCredentials(msg) => CohereError::Authentication { message: msg }
            Expired(msg) => CohereError::Authentication { message: msg }
            Revoked(msg) => CohereError::Authentication { message: msg }
```

---

## 9. Resilience Orchestrator

### 9.1 Orchestrator Interface

```pseudocode
INTERFACE ResilienceOrchestratorInterface:
    /**
     * Executes operation with full resilience pipeline
     */
    ASYNC FUNCTION execute<T, F>(
        operation: F,
        context: OperationContext
    ) -> Result<T, CohereError>
    WHERE F: Fn() -> Future<Result<T, CohereError>>

    /**
     * Gets current circuit breaker state
     */
    FUNCTION circuit_state() -> CircuitState

    /**
     * Gets rate limit status
     */
    FUNCTION rate_limit_status() -> RateLimitStatus

    /**
     * Resets resilience state (for testing)
     */
    FUNCTION reset()
```

### 9.2 Operation Context

```pseudocode
STRUCT OperationContext:
    operation_name: String          // For tracing/logging
    endpoint: String                // API endpoint
    idempotent: Boolean             // Whether operation is safe to retry
    priority: Priority              // Request priority for rate limiting
    timeout_override: Option<Duration>  // Override default timeout

ENUM Priority:
    Low
    Normal
    High
    Critical
```

### 9.3 Orchestrator Implementation

```pseudocode
CLASS ResilienceOrchestrator IMPLEMENTS ResilienceOrchestratorInterface:
    PRIVATE retry_executor: RetryExecutor           // From integrations-retry
    PRIVATE circuit_breaker: CircuitBreaker         // From integrations-circuit-breaker
    PRIVATE rate_limiter: RateLimiter               // From integrations-rate-limit
    PRIVATE tracer: Tracer
    PRIVATE metrics: MetricsRecorder

    CONSTRUCTOR(
        retry_config: RetryConfig,
        cb_config: CircuitBreakerConfig,
        rl_config: RateLimitConfig
    ):
        this.retry_executor = RetryExecutor.new(RetryPolicy {
            max_attempts: retry_config.max_attempts,
            backoff: ExponentialBackoff {
                initial: Duration.from_millis(retry_config.initial_delay_ms),
                max: Duration.from_millis(retry_config.max_delay_ms),
                multiplier: retry_config.multiplier,
                jitter: retry_config.jitter_factor,
            },
            retryable_errors: retry_config.retryable_status_codes,
        })

        this.circuit_breaker = CircuitBreaker.new(CircuitBreakerPolicy {
            failure_threshold: cb_config.failure_threshold,
            success_threshold: cb_config.success_threshold,
            half_open_max_calls: cb_config.half_open_max_calls,
            open_duration: Duration.from_millis(cb_config.open_duration_ms),
        })

        this.rate_limiter = MATCH rl_config.strategy:
            TokenBucket => TokenBucketLimiter.new(
                rl_config.requests_per_minute,
                rl_config.tokens_per_minute,
            )
            SlidingWindow => SlidingWindowLimiter.new(
                rl_config.requests_per_minute,
                Duration.from_secs(60),
            )
            FixedWindow => FixedWindowLimiter.new(
                rl_config.requests_per_minute,
                Duration.from_secs(60),
            )

        this.tracer = Tracer.new("resilience-orchestrator")
        this.metrics = MetricsRecorder.new("cohere.resilience")

    ASYNC FUNCTION execute<T, F>(
        operation: F,
        context: OperationContext
    ) -> Result<T, CohereError>:
        span = this.tracer.span("resilience.execute")
        span.set_attribute("operation", context.operation_name)
        span.set_attribute("endpoint", context.endpoint)

        TRY:
            // Step 1: Check circuit breaker
            IF this.circuit_breaker.is_open():
                this.metrics.increment("circuit_breaker.rejected")
                RETURN Err(CohereError::ServiceUnavailable {
                    message: "Circuit breaker is open"
                })

            // Step 2: Acquire rate limit permit
            permit = AWAIT this.rate_limiter.acquire(context.priority)
            IF permit.is_err():
                this.metrics.increment("rate_limit.rejected")
                RETURN Err(CohereError::RateLimited {
                    message: "Rate limit exceeded",
                    retry_after: Some(permit.unwrap_err().retry_after()),
                })

            // Step 3: Execute with retry
            result = AWAIT this.retry_executor.execute(
                || this.execute_with_circuit_breaker(operation, context.clone()),
                |error| this.should_retry(error, context.idempotent),
            )

            RETURN result

        FINALLY:
            span.end()

    PRIVATE ASYNC FUNCTION execute_with_circuit_breaker<T, F>(
        operation: F,
        context: OperationContext
    ) -> Result<T, CohereError>:
        // Attempt to call through circuit breaker
        result = AWAIT this.circuit_breaker.call(|| operation())

        MATCH result:
            Ok(value) =>
                this.metrics.increment("circuit_breaker.success")
                RETURN Ok(value)
            Err(CircuitBreakerError::Open) =>
                this.metrics.increment("circuit_breaker.open")
                RETURN Err(CohereError::ServiceUnavailable {
                    message: "Circuit breaker is open"
                })
            Err(CircuitBreakerError::OperationFailed(err)) =>
                this.metrics.increment("circuit_breaker.failure")
                RETURN Err(err)

    PRIVATE FUNCTION should_retry(error: CohereError, idempotent: Boolean) -> Boolean:
        // Always retry rate limit errors (with backoff)
        IF error IS CohereError::RateLimited:
            RETURN true

        // Retry server errors only for idempotent operations
        IF error IS CohereError::InternalError OR error IS CohereError::ServiceUnavailable:
            RETURN idempotent

        // Retry transient network errors
        IF error IS CohereError::Transient:
            RETURN idempotent

        // Don't retry client errors
        RETURN false

    FUNCTION circuit_state() -> CircuitState:
        RETURN this.circuit_breaker.state()

    FUNCTION rate_limit_status() -> RateLimitStatus:
        RETURN RateLimitStatus {
            remaining_requests: this.rate_limiter.remaining_requests(),
            remaining_tokens: this.rate_limiter.remaining_tokens(),
            reset_at: this.rate_limiter.reset_time(),
        }

    FUNCTION reset():
        this.circuit_breaker.reset()
        this.rate_limiter.reset()
        this.retry_executor.reset_stats()

STRUCT RateLimitStatus:
    remaining_requests: u32
    remaining_tokens: u32
    reset_at: Instant
```

---

## 10. Streaming Infrastructure

### 10.1 SSE Parser Interface

```pseudocode
INTERFACE SSEParserInterface:
    /**
     * Parses SSE byte stream into typed events
     */
    FUNCTION parse<T: Deserialize>(stream: ByteStream) -> EventStream<T>

    /**
     * Parses single SSE event
     */
    FUNCTION parse_event(data: String) -> Result<SSEEvent, ParseError>
```

### 10.2 SSE Event Types

```pseudocode
STRUCT SSEEvent:
    event_type: Option<String>      // Event type (e.g., "text-generation")
    data: String                    // Event data (JSON)
    id: Option<String>              // Event ID
    retry: Option<u64>              // Retry interval in ms

ENUM CohereStreamEvent:
    // Chat streaming events
    StreamStart {
        generation_id: String
    }
    TextGeneration {
        text: String
        is_finished: Boolean
    }
    CitationGeneration {
        citations: List<Citation>
    }
    ToolCallsGeneration {
        tool_calls: List<ToolCall>
    }
    SearchQueriesGeneration {
        search_queries: List<SearchQuery>
    }
    SearchResultsGeneration {
        search_results: List<SearchResult>
    }
    StreamEnd {
        finish_reason: FinishReason
        response: ChatResponse
    }

    // Generate streaming events
    GenerateTextGeneration {
        text: String
        index: u32
        is_finished: Boolean
    }
    GenerateStreamEnd {
        finish_reason: FinishReason
        response: GenerateResponse
    }

    // Error event
    Error {
        message: String
    }
```

### 10.3 SSE Parser Implementation

```pseudocode
CLASS SSEParser IMPLEMENTS SSEParserInterface:
    PRIVATE buffer: String
    PRIVATE tracer: Tracer

    CONSTRUCTOR():
        this.buffer = ""
        this.tracer = Tracer.new("sse-parser")

    FUNCTION parse<T: Deserialize>(stream: ByteStream) -> EventStream<T>:
        RETURN EventStream.new(stream, this)

    FUNCTION parse_event(data: String) -> Result<SSEEvent, ParseError>:
        span = this.tracer.span("parse_event")

        TRY:
            event = SSEEvent {
                event_type: None,
                data: "",
                id: None,
                retry: None,
            }

            // Parse SSE format line by line
            FOR line IN data.lines():
                IF line.starts_with("event:"):
                    event.event_type = Some(line[6..].trim())
                ELSE IF line.starts_with("data:"):
                    IF event.data.is_empty():
                        event.data = line[5..].trim()
                    ELSE:
                        event.data = event.data + "\n" + line[5..].trim()
                ELSE IF line.starts_with("id:"):
                    event.id = Some(line[3..].trim())
                ELSE IF line.starts_with("retry:"):
                    event.retry = parse_u64(line[6..].trim()).ok()

            RETURN Ok(event)

        CATCH error:
            span.set_error(error)
            RETURN Err(ParseError::InvalidFormat(error.message()))

        FINALLY:
            span.end()

    FUNCTION parse_cohere_event(sse: SSEEvent) -> Result<CohereStreamEvent, ParseError>:
        // Determine event type from SSE event or infer from data
        event_type = sse.event_type.unwrap_or("message")

        MATCH event_type:
            "stream-start" =>
                data = deserialize_json<StreamStartData>(sse.data)?
                RETURN Ok(CohereStreamEvent::StreamStart {
                    generation_id: data.generation_id
                })

            "text-generation" =>
                data = deserialize_json<TextGenerationData>(sse.data)?
                RETURN Ok(CohereStreamEvent::TextGeneration {
                    text: data.text,
                    is_finished: data.is_finished.unwrap_or(false),
                })

            "citation-generation" =>
                data = deserialize_json<CitationGenerationData>(sse.data)?
                RETURN Ok(CohereStreamEvent::CitationGeneration {
                    citations: data.citations
                })

            "tool-calls-generation" =>
                data = deserialize_json<ToolCallsData>(sse.data)?
                RETURN Ok(CohereStreamEvent::ToolCallsGeneration {
                    tool_calls: data.tool_calls
                })

            "search-queries-generation" =>
                data = deserialize_json<SearchQueriesData>(sse.data)?
                RETURN Ok(CohereStreamEvent::SearchQueriesGeneration {
                    search_queries: data.search_queries
                })

            "search-results" =>
                data = deserialize_json<SearchResultsData>(sse.data)?
                RETURN Ok(CohereStreamEvent::SearchResultsGeneration {
                    search_results: data.search_results
                })

            "stream-end" =>
                data = deserialize_json<StreamEndData>(sse.data)?
                RETURN Ok(CohereStreamEvent::StreamEnd {
                    finish_reason: data.finish_reason,
                    response: data.response,
                })

            _ =>
                // Try to parse as generic message
                RETURN Err(ParseError::UnknownEventType(event_type))

CLASS EventStream<T>:
    PRIVATE byte_stream: ByteStream
    PRIVATE parser: SSEParser
    PRIVATE buffer: String

    CONSTRUCTOR(byte_stream: ByteStream, parser: SSEParser):
        this.byte_stream = byte_stream
        this.parser = parser
        this.buffer = ""

    ASYNC FUNCTION next() -> Option<Result<T, ParseError>>:
        LOOP:
            // Check if we have a complete event in buffer
            IF let Some(event_end) = this.buffer.find("\n\n"):
                event_data = this.buffer[..event_end]
                this.buffer = this.buffer[event_end + 2..]

                // Parse SSE event
                sse_event = this.parser.parse_event(event_data)
                IF sse_event.is_err():
                    RETURN Some(Err(sse_event.unwrap_err()))

                // Parse typed event
                typed_event = this.parser.parse_cohere_event(sse_event.unwrap())
                RETURN Some(typed_event)

            // Read more data
            chunk = AWAIT this.byte_stream.next()
            IF chunk.is_none():
                // Stream ended
                IF NOT this.buffer.is_empty():
                    // Process remaining buffer
                    CONTINUE
                RETURN None

            // Handle chunk errors
            IF chunk.is_err():
                RETURN Some(Err(ParseError::StreamError(chunk.unwrap_err())))

            // Append to buffer
            this.buffer = this.buffer + String.from_utf8_lossy(chunk.unwrap())
```

### 10.4 Stream Collector

```pseudocode
CLASS StreamCollector<T>:
    PRIVATE events: List<T>
    PRIVATE final_response: Option<T>

    CONSTRUCTOR():
        this.events = []
        this.final_response = None

    /**
     * Collects all events from stream
     */
    ASYNC FUNCTION collect(stream: EventStream<CohereStreamEvent>) -> Result<CollectedResponse, CohereError>:
        text_buffer = StringBuilder.new()
        citations = []
        tool_calls = []
        search_results = []

        WHILE event = AWAIT stream.next():
            IF event.is_err():
                RETURN Err(CohereError::StreamError {
                    message: event.unwrap_err().message()
                })

            MATCH event.unwrap():
                CohereStreamEvent::TextGeneration { text, .. } =>
                    text_buffer.append(text)
                    this.events.push(event)

                CohereStreamEvent::CitationGeneration { citations: c } =>
                    citations.extend(c)
                    this.events.push(event)

                CohereStreamEvent::ToolCallsGeneration { tool_calls: tc } =>
                    tool_calls.extend(tc)
                    this.events.push(event)

                CohereStreamEvent::SearchResultsGeneration { search_results: sr } =>
                    search_results.extend(sr)
                    this.events.push(event)

                CohereStreamEvent::StreamEnd { response, .. } =>
                    this.final_response = Some(response)
                    BREAK

                _ =>
                    this.events.push(event)

        RETURN Ok(CollectedResponse {
            text: text_buffer.to_string(),
            citations: citations,
            tool_calls: tool_calls,
            search_results: search_results,
            events: this.events.clone(),
            final_response: this.final_response.clone(),
        })

STRUCT CollectedResponse:
    text: String
    citations: List<Citation>
    tool_calls: List<ToolCall>
    search_results: List<SearchResult>
    events: List<CohereStreamEvent>
    final_response: Option<ChatResponse>
```

---

## Summary

This document covers the core infrastructure for the Cohere integration module:

1. **Module Structure**: Complete Rust crate and TypeScript package organization
2. **Configuration**: Type-safe configuration with builder pattern and validation
3. **Client**: Main client with lazy-initialized services
4. **Transport**: HTTP transport with TLS 1.2+, streaming support
5. **Request Builder**: Fluent API for constructing Cohere API requests
6. **Response Handler**: Status-aware response parsing with error mapping
7. **Authentication**: Bearer token authentication with secure credential handling
8. **Resilience**: Orchestrated retry, circuit breaker, and rate limiting
9. **Streaming**: SSE parser with Cohere-specific event types

---

**Next Document:** `pseudocode-cohere-2.md` - Chat, Generate, Embed, Rerank Services

---

*Pseudocode Phase: Part 1 of 3 Complete*
