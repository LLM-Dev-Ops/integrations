# Pseudocode: Ollama Integration Module

## SPARC Phase 3: Pseudocode

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/ollama`

---

## Table of Contents

1. [Module Structure Overview](#1-module-structure-overview)
2. [Configuration Module](#2-configuration-module)
3. [Client Core](#3-client-core)
4. [HTTP Transport Layer](#4-http-transport-layer)
5. [Services Implementation](#5-services-implementation)
6. [Streaming Infrastructure](#6-streaming-infrastructure)
7. [Simulation Layer](#7-simulation-layer)
8. [Error Handling](#8-error-handling)

---

## 1. Module Structure Overview

### 1.1 Public API Exports (Rust)

```rust
// lib.rs - Public API surface

// Re-export client
pub use client::{OllamaClient, OllamaClientBuilder};

// Re-export configuration
pub use config::OllamaConfig;

// Re-export services
pub use services::{
    ChatService,
    GenerateService,
    EmbeddingsService,
    ModelsService,
};

// Re-export types
pub use types::{
    // Chat types
    ChatRequest, ChatResponse, ChatChunk,
    Message, Role,

    // Generate types
    GenerateRequest, GenerateResponse, GenerateChunk,

    // Embeddings types
    EmbeddingsRequest, EmbeddingsResponse,

    // Model types
    ModelList, ModelSummary, ModelInfo,
    RunningModelList, RunningModel, ModelDetails,

    // Options
    ModelOptions,

    // Health
    HealthStatus,
};

// Re-export simulation
pub use simulation::{
    SimulationMode, RecordStorage, TimingMode,
    Recording, RecordEntry,
};

// Re-export errors
pub use error::{OllamaError, OllamaResult};

// Version constant
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
```

### 1.2 Public API Exports (TypeScript)

```typescript
// index.ts - Public API surface

// Client exports
export { OllamaClient, OllamaClientBuilder } from './client';
export { OllamaConfig } from './config';

// Service exports
export { ChatService } from './services/chat';
export { GenerateService } from './services/generate';
export { EmbeddingsService } from './services/embeddings';
export { ModelsService } from './services/models';

// Type exports
export {
    // Chat types
    ChatRequest, ChatResponse, ChatChunk,
    Message, Role,

    // Generate types
    GenerateRequest, GenerateResponse, GenerateChunk,

    // Embeddings types
    EmbeddingsRequest, EmbeddingsResponse,

    // Model types
    ModelList, ModelSummary, ModelInfo,
    RunningModelList, RunningModel, ModelDetails,

    // Options
    ModelOptions,

    // Health
    HealthStatus,
} from './types';

// Simulation exports
export {
    SimulationMode, RecordStorage, TimingMode,
    Recording, RecordEntry,
} from './simulation';

// Error exports
export { OllamaError, OllamaErrorCode } from './errors';

// Version
export const VERSION = '__VERSION__';
```

---

## 2. Configuration Module

### 2.1 Configuration Types (Rust)

```rust
// config.rs

use std::time::Duration;
use secrecy::SecretString;

/// Default values
const DEFAULT_BASE_URL: &str = "http://localhost:11434";
const DEFAULT_TIMEOUT_SECS: u64 = 120;
const DEFAULT_MAX_RETRIES: u32 = 3;

/// Ollama client configuration
STRUCT OllamaConfig {
    /// Base URL for Ollama server
    base_url: String,

    /// Request timeout duration
    timeout: Duration,

    /// Maximum retry attempts for transient errors
    max_retries: u32,

    /// Optional authentication token (for proxied setups)
    auth_token: Option<SecretString>,

    /// Default model to use
    default_model: Option<String>,

    /// Default headers for all requests
    default_headers: HashMap<String, String>,

    /// Simulation mode configuration
    simulation_mode: SimulationMode,
}

IMPL OllamaConfig {
    /// Create new configuration with defaults
    FUNCTION new() -> Self {
        Self {
            base_url: DEFAULT_BASE_URL.to_string(),
            timeout: Duration::from_secs(DEFAULT_TIMEOUT_SECS),
            max_retries: DEFAULT_MAX_RETRIES,
            auth_token: None,
            default_model: None,
            default_headers: HashMap::new(),
            simulation_mode: SimulationMode::Disabled,
        }
    }

    /// Get base URL
    FUNCTION base_url(&self) -> &str {
        &self.base_url
    }

    /// Get timeout
    FUNCTION timeout(&self) -> Duration {
        self.timeout
    }

    /// Check if connecting to remote (non-localhost)
    FUNCTION is_remote(&self) -> bool {
        !self.base_url.contains("localhost") &&
        !self.base_url.contains("127.0.0.1")
    }

    /// Validate configuration
    FUNCTION validate(&self) -> Result<(), OllamaError> {
        // Validate base URL format
        IF !self.base_url.starts_with("http://") &&
           !self.base_url.starts_with("https://") THEN
            RETURN Err(OllamaError::ValidationError {
                message: "Base URL must start with http:// or https://".to_string(),
                field: Some("base_url".to_string()),
                value: Some(self.base_url.clone()),
            })
        END IF

        // Validate timeout is reasonable
        IF self.timeout.as_secs() == 0 THEN
            RETURN Err(OllamaError::ValidationError {
                message: "Timeout must be greater than 0".to_string(),
                field: Some("timeout".to_string()),
                value: None,
            })
        END IF

        // Warn if connecting to remote without auth
        IF self.is_remote() && self.auth_token.is_none() THEN
            tracing::warn!("Connecting to remote Ollama without authentication")
        END IF

        Ok(())
    }
}
```

### 2.2 Configuration Builder (Rust)

```rust
// config.rs (continued)

/// Builder for OllamaConfig
STRUCT OllamaClientBuilder {
    base_url: Option<String>,
    timeout: Option<Duration>,
    max_retries: Option<u32>,
    auth_token: Option<SecretString>,
    default_model: Option<String>,
    default_headers: HashMap<String, String>,
    simulation_mode: SimulationMode,
}

IMPL OllamaClientBuilder {
    /// Create new builder
    FUNCTION new() -> Self {
        Self {
            base_url: None,
            timeout: None,
            max_retries: None,
            auth_token: None,
            default_model: None,
            default_headers: HashMap::new(),
            simulation_mode: SimulationMode::Disabled,
        }
    }

    /// Set base URL
    FUNCTION base_url(mut self, url: impl Into<String>) -> Self {
        self.base_url = Some(url.into())
        self
    }

    /// Set base URL from environment variable
    FUNCTION base_url_from_env(mut self) -> Self {
        IF LET Ok(url) = std::env::var("OLLAMA_HOST") THEN
            self.base_url = Some(url)
        END IF
        self
    }

    /// Set timeout in seconds
    FUNCTION timeout_secs(mut self, secs: u64) -> Self {
        self.timeout = Some(Duration::from_secs(secs))
        self
    }

    /// Set timeout duration
    FUNCTION timeout(mut self, duration: Duration) -> Self {
        self.timeout = Some(duration)
        self
    }

    /// Set max retries
    FUNCTION max_retries(mut self, count: u32) -> Self {
        self.max_retries = Some(count)
        self
    }

    /// Set authentication token
    FUNCTION auth_token(mut self, token: impl Into<SecretString>) -> Self {
        self.auth_token = Some(token.into())
        self
    }

    /// Set default model
    FUNCTION default_model(mut self, model: impl Into<String>) -> Self {
        self.default_model = Some(model.into())
        self
    }

    /// Set default model from environment variable
    FUNCTION default_model_from_env(mut self) -> Self {
        IF LET Ok(model) = std::env::var("OLLAMA_MODEL") THEN
            self.default_model = Some(model)
        END IF
        self
    }

    /// Add default header
    FUNCTION default_header(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.default_headers.insert(name.into(), value.into())
        self
    }

    /// Enable simulation recording mode
    FUNCTION record_to(mut self, storage: RecordStorage) -> Self {
        self.simulation_mode = SimulationMode::Recording { storage }
        self
    }

    /// Enable simulation replay mode
    FUNCTION replay_from(mut self, source: RecordStorage, timing: TimingMode) -> Self {
        self.simulation_mode = SimulationMode::Replay { source, timing }
        self
    }

    /// Build client
    FUNCTION build(self) -> Result<OllamaClient, OllamaError> {
        LET config = OllamaConfig {
            base_url: self.base_url.unwrap_or_else(|| DEFAULT_BASE_URL.to_string()),
            timeout: self.timeout.unwrap_or_else(|| Duration::from_secs(DEFAULT_TIMEOUT_SECS)),
            max_retries: self.max_retries.unwrap_or(DEFAULT_MAX_RETRIES),
            auth_token: self.auth_token,
            default_model: self.default_model,
            default_headers: self.default_headers,
            simulation_mode: self.simulation_mode,
        }

        // Validate configuration
        config.validate()?

        // Build client
        OllamaClient::from_config(config)
    }
}

IMPL Default FOR OllamaClientBuilder {
    FUNCTION default() -> Self {
        Self::new()
    }
}
```

### 2.3 Configuration Types (TypeScript)

```typescript
// config.ts

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_RETRIES = 3;

/**
 * Ollama client configuration
 */
interface OllamaConfig {
    readonly baseUrl: string;
    readonly timeoutMs: number;
    readonly maxRetries: number;
    readonly authToken?: string;
    readonly defaultModel?: string;
    readonly defaultHeaders: Record<string, string>;
    readonly simulationMode: SimulationMode;
}

/**
 * Configuration builder for OllamaConfig
 */
class OllamaClientBuilder {
    private _baseUrl?: string;
    private _timeoutMs?: number;
    private _maxRetries?: number;
    private _authToken?: string;
    private _defaultModel?: string;
    private _defaultHeaders: Record<string, string> = {};
    private _simulationMode: SimulationMode = { type: 'disabled' };

    /**
     * Set base URL
     */
    baseUrl(url: string): this {
        this._baseUrl = url;
        return this;
    }

    /**
     * Set base URL from environment variable
     */
    baseUrlFromEnv(): this {
        const url = process.env.OLLAMA_HOST;
        if (url) {
            this._baseUrl = url;
        }
        return this;
    }

    /**
     * Set timeout in milliseconds
     */
    timeoutMs(ms: number): this {
        this._timeoutMs = ms;
        return this;
    }

    /**
     * Set max retries
     */
    maxRetries(count: number): this {
        this._maxRetries = count;
        return this;
    }

    /**
     * Set authentication token
     */
    authToken(token: string): this {
        this._authToken = token;
        return this;
    }

    /**
     * Set default model
     */
    defaultModel(model: string): this {
        this._defaultModel = model;
        return this;
    }

    /**
     * Set default model from environment variable
     */
    defaultModelFromEnv(): this {
        const model = process.env.OLLAMA_MODEL;
        if (model) {
            this._defaultModel = model;
        }
        return this;
    }

    /**
     * Add default header
     */
    defaultHeader(name: string, value: string): this {
        this._defaultHeaders[name] = value;
        return this;
    }

    /**
     * Enable simulation recording mode
     */
    recordTo(storage: RecordStorage): this {
        this._simulationMode = { type: 'recording', storage };
        return this;
    }

    /**
     * Enable simulation replay mode
     */
    replayFrom(source: RecordStorage, timing: TimingMode = 'instant'): this {
        this._simulationMode = { type: 'replay', source, timing };
        return this;
    }

    /**
     * Build client
     */
    build(): OllamaClient {
        const config: OllamaConfig = {
            baseUrl: this._baseUrl ?? DEFAULT_BASE_URL,
            timeoutMs: this._timeoutMs ?? DEFAULT_TIMEOUT_MS,
            maxRetries: this._maxRetries ?? DEFAULT_MAX_RETRIES,
            authToken: this._authToken,
            defaultModel: this._defaultModel,
            defaultHeaders: this._defaultHeaders,
            simulationMode: this._simulationMode,
        };

        // Validate
        this.validate(config);

        return new OllamaClient(config);
    }

    private validate(config: OllamaConfig): void {
        IF !config.baseUrl.startsWith('http://') &&
           !config.baseUrl.startsWith('https://') THEN
            THROW new OllamaError('Base URL must start with http:// or https://');
        END IF

        IF config.timeoutMs <= 0 THEN
            THROW new OllamaError('Timeout must be greater than 0');
        END IF

        // Warn if connecting to remote without auth
        IF this.isRemote(config) && !config.authToken THEN
            console.warn('Connecting to remote Ollama without authentication');
        END IF
    }

    private isRemote(config: OllamaConfig): boolean {
        return !config.baseUrl.includes('localhost') &&
               !config.baseUrl.includes('127.0.0.1');
    }
}
```

---

## 3. Client Core

### 3.1 OllamaClient (Rust)

```rust
// client.rs

use std::sync::Arc;

/// Main Ollama client
STRUCT OllamaClient {
    config: Arc<OllamaConfig>,
    transport: Arc<dyn HttpTransport>,
    simulation: Arc<SimulationLayer>,
    chat: ChatService,
    generate: GenerateService,
    embeddings: EmbeddingsService,
    models: ModelsService,
}

IMPL OllamaClient {
    /// Create client from configuration
    FUNCTION from_config(config: OllamaConfig) -> Result<Self, OllamaError> {
        LET config = Arc::new(config)

        // Create transport
        LET transport: Arc<dyn HttpTransport> = Arc::new(
            HttpTransportImpl::new(config.clone())?
        )

        // Create simulation layer
        LET simulation = Arc::new(SimulationLayer::new(
            config.simulation_mode.clone(),
            transport.clone(),
        ))

        // Create services (all share transport and simulation)
        LET chat = ChatService::new(simulation.clone(), config.clone())
        LET generate = GenerateService::new(simulation.clone(), config.clone())
        LET embeddings = EmbeddingsService::new(simulation.clone(), config.clone())
        LET models = ModelsService::new(simulation.clone(), config.clone())

        Ok(Self {
            config,
            transport,
            simulation,
            chat,
            generate,
            embeddings,
            models,
        })
    }

    /// Get chat service
    FUNCTION chat(&self) -> &ChatService {
        &self.chat
    }

    /// Get generate service
    FUNCTION generate(&self) -> &GenerateService {
        &self.generate
    }

    /// Get embeddings service
    FUNCTION embeddings(&self) -> &EmbeddingsService {
        &self.embeddings
    }

    /// Get models service
    FUNCTION models(&self) -> &ModelsService {
        &self.models
    }

    /// Check server health
    ASYNC FUNCTION health(&self) -> Result<HealthStatus, OllamaError> {
        // Try to connect to root endpoint
        LET response = self.transport.get("/").await

        MATCH response {
            Ok(_) => Ok(HealthStatus {
                running: true,
                version: None // Could parse from response headers
            }),
            Err(OllamaError::ConnectionError { .. }) => Ok(HealthStatus {
                running: false,
                version: None,
            }),
            Err(e) => Err(e),
        }
    }

    /// Get configuration
    FUNCTION config(&self) -> &OllamaConfig {
        &self.config
    }

    /// Set simulation mode at runtime
    FUNCTION set_simulation_mode(&self, mode: SimulationMode) {
        self.simulation.set_mode(mode)
    }

    /// Save recordings (if in recording mode)
    ASYNC FUNCTION save_recordings(&self, path: &Path) -> Result<(), OllamaError> {
        self.simulation.save_to_file(path).await
    }

    /// Load recordings (for replay mode)
    ASYNC FUNCTION load_recordings(&self, path: &Path) -> Result<(), OllamaError> {
        self.simulation.load_from_file(path).await
    }
}

// Implement builder access
IMPL OllamaClient {
    /// Create a new builder
    FUNCTION builder() -> OllamaClientBuilder {
        OllamaClientBuilder::new()
    }
}
```

### 3.2 OllamaClient (TypeScript)

```typescript
// client.ts

/**
 * Main Ollama client
 */
class OllamaClient {
    private readonly config: OllamaConfig;
    private readonly transport: HttpTransport;
    private readonly simulation: SimulationLayer;

    readonly chat: ChatService;
    readonly generate: GenerateService;
    readonly embeddings: EmbeddingsService;
    readonly models: ModelsService;

    constructor(config: OllamaConfig) {
        this.config = config;

        // Create transport
        this.transport = new HttpTransportImpl(config);

        // Create simulation layer
        this.simulation = new SimulationLayer(
            config.simulationMode,
            this.transport
        );

        // Create services
        this.chat = new ChatService(this.simulation, config);
        this.generate = new GenerateService(this.simulation, config);
        this.embeddings = new EmbeddingsService(this.simulation, config);
        this.models = new ModelsService(this.simulation, config);
    }

    /**
     * Check server health
     */
    async health(): Promise<HealthStatus> {
        TRY
            await this.transport.get('/');
            return { running: true };
        CATCH (error)
            IF error instanceof OllamaError &&
               error.code === 'CONNECTION_ERROR' THEN
                return { running: false };
            END IF
            THROW error;
        END TRY
    }

    /**
     * Get configuration
     */
    getConfig(): OllamaConfig {
        return this.config;
    }

    /**
     * Set simulation mode at runtime
     */
    setSimulationMode(mode: SimulationMode): void {
        this.simulation.setMode(mode);
    }

    /**
     * Save recordings to file
     */
    async saveRecordings(path: string): Promise<void> {
        await this.simulation.saveToFile(path);
    }

    /**
     * Load recordings from file
     */
    async loadRecordings(path: string): Promise<void> {
        await this.simulation.loadFromFile(path);
    }

    /**
     * Create a new builder
     */
    static builder(): OllamaClientBuilder {
        return new OllamaClientBuilder();
    }
}
```

---

## 4. HTTP Transport Layer

### 4.1 Transport Trait (Rust)

```rust
// transport/mod.rs

/// HTTP transport abstraction
#[async_trait]
TRAIT HttpTransport: Send + Sync {
    /// Send GET request
    ASYNC FUNCTION get(&self, path: &str) -> Result<Response, OllamaError>;

    /// Send POST request with JSON body
    ASYNC FUNCTION post<T: Serialize>(&self, path: &str, body: &T)
        -> Result<Response, OllamaError>;

    /// Send POST request and receive streaming response
    ASYNC FUNCTION post_streaming<T: Serialize>(&self, path: &str, body: &T)
        -> Result<impl Stream<Item = Result<Bytes, OllamaError>>, OllamaError>;

    /// Check if server is reachable
    ASYNC FUNCTION is_reachable(&self) -> bool;
}
```

### 4.2 Transport Implementation (Rust)

```rust
// transport/http.rs

use reqwest::Client;

/// HTTP transport implementation using reqwest
STRUCT HttpTransportImpl {
    client: Client,
    config: Arc<OllamaConfig>,
}

IMPL HttpTransportImpl {
    /// Create new transport
    FUNCTION new(config: Arc<OllamaConfig>) -> Result<Self, OllamaError> {
        LET client = Client::builder()
            .timeout(config.timeout())
            .pool_max_idle_per_host(10)
            .build()
            .map_err(|e| OllamaError::InternalError {
                message: format!("Failed to create HTTP client: {}", e),
                status_code: None,
            })?

        Ok(Self { client, config })
    }

    /// Build URL for path
    FUNCTION build_url(&self, path: &str) -> String {
        format!("{}{}", self.config.base_url(), path)
    }

    /// Add default headers to request
    FUNCTION add_headers(&self, request: RequestBuilder) -> RequestBuilder {
        LET mut request = request

        // Add content type
        request = request.header("Content-Type", "application/json")

        // Add auth token if present
        IF LET Some(ref token) = self.config.auth_token THEN
            request = request.header("Authorization",
                format!("Bearer {}", token.expose_secret()))
        END IF

        // Add custom headers
        FOR (name, value) IN &self.config.default_headers DO
            request = request.header(name, value)
        END FOR

        request
    }

    /// Handle response status
    ASYNC FUNCTION handle_response(&self, response: reqwest::Response)
        -> Result<Response, OllamaError> {

        LET status = response.status()

        IF status.is_success() THEN
            Ok(Response {
                status: status.as_u16(),
                body: response.bytes().await?,
            })
        ELSE
            // Parse error response
            LET body = response.text().await.unwrap_or_default()

            MATCH status.as_u16() {
                404 => Err(OllamaError::ModelNotFound {
                    model: self.extract_model_from_error(&body),
                    available: None,
                }),
                _ => Err(OllamaError::InternalError {
                    message: body,
                    status_code: Some(status.as_u16()),
                }),
            }
        END IF
    }
}

#[async_trait]
IMPL HttpTransport FOR HttpTransportImpl {
    ASYNC FUNCTION get(&self, path: &str) -> Result<Response, OllamaError> {
        LET url = self.build_url(path)

        LET request = self.add_headers(self.client.get(&url))

        LET response = request.send().await
            .map_err(|e| self.map_reqwest_error(e))?

        self.handle_response(response).await
    }

    ASYNC FUNCTION post<T: Serialize>(&self, path: &str, body: &T)
        -> Result<Response, OllamaError> {

        LET url = self.build_url(path)

        LET request = self.add_headers(self.client.post(&url))
            .json(body)

        LET response = request.send().await
            .map_err(|e| self.map_reqwest_error(e))?

        self.handle_response(response).await
    }

    ASYNC FUNCTION post_streaming<T: Serialize>(&self, path: &str, body: &T)
        -> Result<impl Stream<Item = Result<Bytes, OllamaError>>, OllamaError> {

        LET url = self.build_url(path)

        LET request = self.add_headers(self.client.post(&url))
            .json(body)

        LET response = request.send().await
            .map_err(|e| self.map_reqwest_error(e))?

        IF !response.status().is_success() THEN
            RETURN Err(self.handle_error_response(response).await)
        END IF

        // Return byte stream
        Ok(response.bytes_stream().map(|result| {
            result.map_err(|e| OllamaError::StreamError {
                message: e.to_string(),
                partial_response: None,
            })
        }))
    }

    ASYNC FUNCTION is_reachable(&self) -> bool {
        self.get("/").await.is_ok()
    }
}

IMPL HttpTransportImpl {
    /// Map reqwest errors to OllamaError
    FUNCTION map_reqwest_error(&self, error: reqwest::Error) -> OllamaError {
        IF error.is_connect() THEN
            OllamaError::ServerNotRunning {
                message: "Cannot connect to Ollama server".to_string(),
                hint: "Run 'ollama serve' or start the Ollama application".to_string(),
            }
        ELSE IF error.is_timeout() THEN
            OllamaError::TimeoutError {
                message: "Request timed out".to_string(),
                timeout: self.config.timeout(),
                operation: "HTTP request".to_string(),
            }
        ELSE
            OllamaError::ConnectionError {
                message: error.to_string(),
                address: self.config.base_url().to_string(),
                cause: None,
            }
        END IF
    }
}
```

---

## 5. Services Implementation

### 5.1 Chat Service (Rust)

```rust
// services/chat.rs

/// Chat completions service
STRUCT ChatService {
    simulation: Arc<SimulationLayer>,
    config: Arc<OllamaConfig>,
}

IMPL ChatService {
    /// Create new chat service
    FUNCTION new(simulation: Arc<SimulationLayer>, config: Arc<OllamaConfig>) -> Self {
        Self { simulation, config }
    }

    /// Create chat completion (synchronous)
    ASYNC FUNCTION create(&self, request: ChatRequest) -> Result<ChatResponse, OllamaError> {
        // Validate request
        self.validate_request(&request)?

        // Resolve model (use default if not specified)
        LET request = self.resolve_model(request)?

        // Build request body
        LET body = ChatRequestBody {
            model: request.model.clone(),
            messages: request.messages.clone(),
            format: request.format.clone(),
            options: request.options.clone(),
            stream: Some(false),
            keep_alive: request.keep_alive,
        }

        // Execute through simulation layer (handles recording/replay)
        LET response = self.simulation
            .execute("chat", &body, |transport, body| async move {
                transport.post("/api/chat", body).await
            })
            .await?

        // Parse response
        LET chat_response: ChatResponse = serde_json::from_slice(&response.body)
            .map_err(|e| OllamaError::InternalError {
                message: format!("Failed to parse response: {}", e),
                status_code: None,
            })?

        Ok(chat_response)
    }

    /// Create streaming chat completion
    ASYNC FUNCTION create_stream(&self, request: ChatRequest)
        -> Result<impl Stream<Item = Result<ChatChunk, OllamaError>>, OllamaError> {

        // Validate request
        self.validate_request(&request)?

        // Resolve model
        LET request = self.resolve_model(request)?

        // Build request body with stream: true
        LET body = ChatRequestBody {
            model: request.model.clone(),
            messages: request.messages.clone(),
            format: request.format.clone(),
            options: request.options.clone(),
            stream: Some(true),
            keep_alive: request.keep_alive,
        }

        // Execute streaming through simulation layer
        LET stream = self.simulation
            .execute_streaming("chat", &body, |transport, body| async move {
                transport.post_streaming("/api/chat", body).await
            })
            .await?

        // Parse NDJSON stream
        Ok(NdjsonParser::new(stream))
    }

    /// Validate chat request
    FUNCTION validate_request(&self, request: &ChatRequest) -> Result<(), OllamaError> {
        // Check messages not empty
        IF request.messages.is_empty() THEN
            RETURN Err(OllamaError::ValidationError {
                message: "Messages cannot be empty".to_string(),
                field: Some("messages".to_string()),
                value: None,
            })
        END IF

        // Validate message roles
        FOR message IN &request.messages DO
            MATCH message.role {
                Role::System | Role::User | Role::Assistant => {},
                _ => RETURN Err(OllamaError::ValidationError {
                    message: format!("Invalid role: {:?}", message.role),
                    field: Some("messages.role".to_string()),
                    value: None,
                }),
            }
        END FOR

        Ok(())
    }

    /// Resolve model (use default if not specified)
    FUNCTION resolve_model(&self, mut request: ChatRequest) -> Result<ChatRequest, OllamaError> {
        IF request.model.is_empty() THEN
            request.model = self.config.default_model
                .clone()
                .ok_or_else(|| OllamaError::ValidationError {
                    message: "Model is required".to_string(),
                    field: Some("model".to_string()),
                    value: None,
                })?
        END IF

        Ok(request)
    }
}
```

### 5.2 Generate Service (Rust)

```rust
// services/generate.rs

/// Text generation service
STRUCT GenerateService {
    simulation: Arc<SimulationLayer>,
    config: Arc<OllamaConfig>,
}

IMPL GenerateService {
    /// Create new generate service
    FUNCTION new(simulation: Arc<SimulationLayer>, config: Arc<OllamaConfig>) -> Self {
        Self { simulation, config }
    }

    /// Generate text completion (synchronous)
    ASYNC FUNCTION create(&self, request: GenerateRequest) -> Result<GenerateResponse, OllamaError> {
        // Validate request
        self.validate_request(&request)?

        // Resolve model
        LET request = self.resolve_model(request)?

        // Build request body
        LET body = GenerateRequestBody {
            model: request.model.clone(),
            prompt: request.prompt.clone(),
            system: request.system.clone(),
            template: request.template.clone(),
            context: request.context.clone(),
            options: request.options.clone(),
            stream: Some(false),
            raw: request.raw,
            keep_alive: request.keep_alive,
            images: request.images.clone(),
        }

        // Execute through simulation layer
        LET response = self.simulation
            .execute("generate", &body, |transport, body| async move {
                transport.post("/api/generate", body).await
            })
            .await?

        // Parse response
        LET generate_response: GenerateResponse = serde_json::from_slice(&response.body)?

        Ok(generate_response)
    }

    /// Generate text completion (streaming)
    ASYNC FUNCTION create_stream(&self, request: GenerateRequest)
        -> Result<impl Stream<Item = Result<GenerateChunk, OllamaError>>, OllamaError> {

        // Validate and resolve model
        self.validate_request(&request)?
        LET request = self.resolve_model(request)?

        // Build request body with stream: true
        LET body = GenerateRequestBody {
            model: request.model.clone(),
            prompt: request.prompt.clone(),
            system: request.system.clone(),
            template: request.template.clone(),
            context: request.context.clone(),
            options: request.options.clone(),
            stream: Some(true),
            raw: request.raw,
            keep_alive: request.keep_alive,
            images: request.images.clone(),
        }

        // Execute streaming
        LET stream = self.simulation
            .execute_streaming("generate", &body, |transport, body| async move {
                transport.post_streaming("/api/generate", body).await
            })
            .await?

        // Parse NDJSON stream
        Ok(NdjsonParser::new(stream))
    }

    /// Validate generate request
    FUNCTION validate_request(&self, request: &GenerateRequest) -> Result<(), OllamaError> {
        IF request.prompt.is_empty() THEN
            RETURN Err(OllamaError::ValidationError {
                message: "Prompt cannot be empty".to_string(),
                field: Some("prompt".to_string()),
                value: None,
            })
        END IF

        Ok(())
    }

    /// Resolve model
    FUNCTION resolve_model(&self, mut request: GenerateRequest) -> Result<GenerateRequest, OllamaError> {
        IF request.model.is_empty() THEN
            request.model = self.config.default_model
                .clone()
                .ok_or_else(|| OllamaError::ValidationError {
                    message: "Model is required".to_string(),
                    field: Some("model".to_string()),
                    value: None,
                })?
        END IF

        Ok(request)
    }
}
```

### 5.3 Embeddings Service (Rust)

```rust
// services/embeddings.rs

/// Embeddings service
STRUCT EmbeddingsService {
    simulation: Arc<SimulationLayer>,
    config: Arc<OllamaConfig>,
}

IMPL EmbeddingsService {
    /// Create new embeddings service
    FUNCTION new(simulation: Arc<SimulationLayer>, config: Arc<OllamaConfig>) -> Self {
        Self { simulation, config }
    }

    /// Generate embeddings for text
    ASYNC FUNCTION create(&self, request: EmbeddingsRequest) -> Result<EmbeddingsResponse, OllamaError> {
        // Validate request
        self.validate_request(&request)?

        // Resolve model
        LET request = self.resolve_model(request)?

        // Build request body
        LET body = EmbeddingsRequestBody {
            model: request.model.clone(),
            prompt: request.prompt.clone(),
            input: request.input.clone(),
            options: request.options.clone(),
            keep_alive: request.keep_alive,
        }

        // Execute through simulation layer
        LET response = self.simulation
            .execute("embeddings", &body, |transport, body| async move {
                transport.post("/api/embeddings", body).await
            })
            .await?

        // Parse response
        LET embeddings_response: EmbeddingsResponse = serde_json::from_slice(&response.body)?

        Ok(embeddings_response)
    }

    /// Generate embeddings for multiple texts (batch)
    ASYNC FUNCTION create_batch(&self, requests: Vec<EmbeddingsRequest>)
        -> Result<Vec<EmbeddingsResponse>, OllamaError> {

        // Process requests concurrently with limited parallelism
        LET futures: Vec<_> = requests.into_iter()
            .map(|req| self.create(req))
            .collect()

        futures::future::try_join_all(futures).await
    }

    /// Validate embeddings request
    FUNCTION validate_request(&self, request: &EmbeddingsRequest) -> Result<(), OllamaError> {
        // Must have either prompt or input
        IF request.prompt.is_none() && request.input.is_none() THEN
            RETURN Err(OllamaError::ValidationError {
                message: "Either prompt or input is required".to_string(),
                field: None,
                value: None,
            })
        END IF

        Ok(())
    }

    /// Resolve model
    FUNCTION resolve_model(&self, mut request: EmbeddingsRequest) -> Result<EmbeddingsRequest, OllamaError> {
        IF request.model.is_empty() THEN
            request.model = self.config.default_model
                .clone()
                .ok_or_else(|| OllamaError::ValidationError {
                    message: "Model is required".to_string(),
                    field: Some("model".to_string()),
                    value: None,
                })?
        END IF

        Ok(request)
    }
}
```

### 5.4 Models Service (Rust)

```rust
// services/models.rs

/// Models management service
STRUCT ModelsService {
    simulation: Arc<SimulationLayer>,
    config: Arc<OllamaConfig>,
}

IMPL ModelsService {
    /// Create new models service
    FUNCTION new(simulation: Arc<SimulationLayer>, config: Arc<OllamaConfig>) -> Self {
        Self { simulation, config }
    }

    /// List all local models
    ASYNC FUNCTION list(&self) -> Result<ModelList, OllamaError> {
        LET response = self.simulation
            .execute("list_models", &(), |transport, _| async move {
                transport.get("/api/tags").await
            })
            .await?

        LET model_list: ModelList = serde_json::from_slice(&response.body)?

        Ok(model_list)
    }

    /// Show model details
    ASYNC FUNCTION show(&self, name: &str) -> Result<ModelInfo, OllamaError> {
        LET body = ShowModelRequest { name: name.to_string() }

        LET response = self.simulation
            .execute("show_model", &body, |transport, body| async move {
                transport.post("/api/show", body).await
            })
            .await?

        LET model_info: ModelInfo = serde_json::from_slice(&response.body)?

        Ok(model_info)
    }

    /// List running models
    ASYNC FUNCTION running(&self) -> Result<RunningModelList, OllamaError> {
        LET response = self.simulation
            .execute("running_models", &(), |transport, _| async move {
                transport.get("/api/ps").await
            })
            .await?

        LET running_list: RunningModelList = serde_json::from_slice(&response.body)?

        Ok(running_list)
    }

    /// Check if model is available locally
    ASYNC FUNCTION is_available(&self, name: &str) -> Result<bool, OllamaError> {
        LET models = self.list().await?

        Ok(models.models.iter().any(|m| m.name == name || m.model == name))
    }

    /// Delete model
    ASYNC FUNCTION delete(&self, name: &str) -> Result<(), OllamaError> {
        LET body = DeleteModelRequest { name: name.to_string() }

        self.simulation
            .execute("delete_model", &body, |transport, body| async move {
                transport.post("/api/delete", body).await
            })
            .await?

        Ok(())
    }
}
```

---

## 6. Streaming Infrastructure

### 6.1 NDJSON Parser (Rust)

```rust
// transport/streaming.rs

use futures::{Stream, StreamExt};
use bytes::Bytes;

/// Parser for newline-delimited JSON streams
STRUCT NdjsonParser<S, T> {
    stream: S,
    buffer: String,
    _phantom: PhantomData<T>,
}

IMPL<S, T> NdjsonParser<S, T>
WHERE
    S: Stream<Item = Result<Bytes, OllamaError>> + Unpin,
    T: DeserializeOwned,
{
    /// Create new NDJSON parser
    FUNCTION new(stream: S) -> Self {
        Self {
            stream,
            buffer: String::new(),
            _phantom: PhantomData,
        }
    }

    /// Parse next chunk from stream
    ASYNC FUNCTION next_chunk(&mut self) -> Option<Result<T, OllamaError>> {
        LOOP
            // Check if buffer contains a complete line
            IF LET Some(newline_pos) = self.buffer.find('\n') THEN
                LET line = self.buffer[..newline_pos].to_string()
                self.buffer = self.buffer[newline_pos + 1..].to_string()

                // Skip empty lines
                IF line.trim().is_empty() THEN
                    CONTINUE
                END IF

                // Parse JSON
                MATCH serde_json::from_str::<T>(&line) {
                    Ok(chunk) => RETURN Some(Ok(chunk)),
                    Err(e) => RETURN Some(Err(OllamaError::InternalError {
                        message: format!("Failed to parse JSON: {}", e),
                        status_code: None,
                    })),
                }
            END IF

            // Read more data from stream
            MATCH self.stream.next().await {
                Some(Ok(bytes)) => {
                    // Append to buffer
                    MATCH String::from_utf8(bytes.to_vec()) {
                        Ok(text) => self.buffer.push_str(&text),
                        Err(e) => RETURN Some(Err(OllamaError::StreamError {
                            message: format!("Invalid UTF-8: {}", e),
                            partial_response: Some(self.buffer.clone()),
                        })),
                    }
                },
                Some(Err(e)) => RETURN Some(Err(e)),
                None => {
                    // Stream ended
                    IF self.buffer.trim().is_empty() THEN
                        RETURN None
                    END IF

                    // Try to parse remaining buffer
                    LET line = std::mem::take(&mut self.buffer)
                    IF !line.trim().is_empty() THEN
                        MATCH serde_json::from_str::<T>(&line) {
                            Ok(chunk) => RETURN Some(Ok(chunk)),
                            Err(_) => RETURN None, // Ignore incomplete final chunk
                        }
                    END IF

                    RETURN None
                }
            }
        END LOOP
    }
}

// Implement Stream trait
IMPL<S, T> Stream FOR NdjsonParser<S, T>
WHERE
    S: Stream<Item = Result<Bytes, OllamaError>> + Unpin,
    T: DeserializeOwned,
{
    TYPE Item = Result<T, OllamaError>

    FUNCTION poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        // Use poll-based implementation for actual code
        // This pseudocode shows the async logic
        Box::pin(self.next_chunk()).poll_unpin(cx)
    }
}
```

### 6.2 Chat Stream Types

```rust
// types/chat.rs (streaming types)

/// Chat response chunk (streaming)
#[derive(Debug, Clone, Serialize, Deserialize)]
STRUCT ChatChunk {
    /// Model name
    model: String,

    /// Creation timestamp
    created_at: String,

    /// Partial message
    message: Message,

    /// Stream completion flag
    done: bool,

    /// Completion reason (final chunk only)
    #[serde(skip_serializing_if = "Option::is_none")]
    done_reason: Option<String>,

    /// Total duration in nanoseconds (final chunk only)
    #[serde(skip_serializing_if = "Option::is_none")]
    total_duration: Option<u64>,

    /// Model load duration in nanoseconds (final chunk only)
    #[serde(skip_serializing_if = "Option::is_none")]
    load_duration: Option<u64>,

    /// Prompt evaluation count (final chunk only)
    #[serde(skip_serializing_if = "Option::is_none")]
    prompt_eval_count: Option<u32>,

    /// Prompt evaluation duration (final chunk only)
    #[serde(skip_serializing_if = "Option::is_none")]
    prompt_eval_duration: Option<u64>,

    /// Evaluation count (final chunk only)
    #[serde(skip_serializing_if = "Option::is_none")]
    eval_count: Option<u32>,

    /// Evaluation duration (final chunk only)
    #[serde(skip_serializing_if = "Option::is_none")]
    eval_duration: Option<u64>,
}

IMPL ChatChunk {
    /// Check if this is the final chunk
    FUNCTION is_final(&self) -> bool {
        self.done
    }

    /// Get content from this chunk
    FUNCTION content(&self) -> &str {
        &self.message.content
    }

    /// Get tokens per second (if final chunk)
    FUNCTION tokens_per_second(&self) -> Option<f64> {
        MATCH (self.eval_count, self.eval_duration) {
            (Some(count), Some(duration)) IF duration > 0 => {
                Some(count as f64 / (duration as f64 / 1_000_000_000.0))
            },
            _ => None,
        }
    }
}
```

---

## 7. Simulation Layer

### 7.1 Simulation Types (Rust)

```rust
// simulation/mod.rs

/// Simulation mode configuration
#[derive(Clone)]
ENUM SimulationMode {
    /// Normal operation - pass through to Ollama
    Disabled,

    /// Recording mode - capture requests and responses
    Recording {
        storage: RecordStorage,
    },

    /// Replay mode - return recorded responses
    Replay {
        source: RecordStorage,
        timing: TimingMode,
    },
}

/// Storage backend for recordings
#[derive(Clone)]
ENUM RecordStorage {
    /// In-memory storage (default)
    Memory,

    /// File-based storage
    File {
        path: PathBuf,
    },
}

/// Timing mode for replay
#[derive(Clone)]
ENUM TimingMode {
    /// Return immediately
    Instant,

    /// Simulate original timing
    Realistic,

    /// Use fixed delay
    Fixed {
        delay: Duration,
    },
}

/// Recording entry
#[derive(Clone, Serialize, Deserialize)]
STRUCT RecordEntry {
    /// Unique ID
    id: String,

    /// Timestamp
    timestamp: DateTime<Utc>,

    /// Operation type (chat, generate, embeddings, etc.)
    operation: String,

    /// Model used
    model: String,

    /// Serialized request
    request: Value,

    /// Recorded response
    response: RecordedResponse,

    /// Timing information
    timing: TimingInfo,
}

/// Recorded response
#[derive(Clone, Serialize, Deserialize)]
ENUM RecordedResponse {
    /// Successful response
    Success {
        body: Value,
    },

    /// Streaming response
    Stream {
        chunks: Vec<Value>,
    },

    /// Error response
    Error {
        error: Value,
    },
}

/// Timing information
#[derive(Clone, Serialize, Deserialize)]
STRUCT TimingInfo {
    /// Total duration in milliseconds
    total_duration_ms: u64,

    /// Time to first token (streaming)
    first_token_ms: Option<u64>,

    /// Timing for each chunk (streaming)
    chunk_timings: Option<Vec<u64>>,
}
```

### 7.2 Simulation Layer Implementation (Rust)

```rust
// simulation/layer.rs

/// Simulation layer wrapping transport
STRUCT SimulationLayer {
    mode: RwLock<SimulationMode>,
    transport: Arc<dyn HttpTransport>,
    recordings: RwLock<Vec<RecordEntry>>,
    replay_index: AtomicUsize,
}

IMPL SimulationLayer {
    /// Create new simulation layer
    FUNCTION new(mode: SimulationMode, transport: Arc<dyn HttpTransport>) -> Self {
        Self {
            mode: RwLock::new(mode),
            transport,
            recordings: RwLock::new(Vec::new()),
            replay_index: AtomicUsize::new(0),
        }
    }

    /// Set simulation mode
    FUNCTION set_mode(&self, mode: SimulationMode) {
        *self.mode.write().unwrap() = mode
    }

    /// Execute operation through simulation layer
    ASYNC FUNCTION execute<T, B, F, Fut>(
        &self,
        operation: &str,
        body: &B,
        executor: F,
    ) -> Result<Response, OllamaError>
    WHERE
        B: Serialize,
        F: FnOnce(Arc<dyn HttpTransport>, B) -> Fut,
        Fut: Future<Output = Result<Response, OllamaError>>,
    {
        LET mode = self.mode.read().unwrap().clone()

        MATCH mode {
            SimulationMode::Disabled => {
                // Pass through to transport
                executor(self.transport.clone(), body.clone()).await
            },

            SimulationMode::Recording { ref storage } => {
                // Execute and record
                LET start = Instant::now()
                LET result = executor(self.transport.clone(), body.clone()).await
                LET duration = start.elapsed()

                // Record entry
                LET entry = self.create_record_entry(
                    operation,
                    body,
                    &result,
                    duration,
                )

                self.recordings.write().unwrap().push(entry)

                // Persist if file storage
                IF LET RecordStorage::File { ref path } = storage THEN
                    self.persist_recordings(path).await?
                END IF

                result
            },

            SimulationMode::Replay { ref source, ref timing } => {
                // Find matching recording
                LET entry = self.find_matching_recording(operation, body)?

                // Apply timing
                self.apply_timing(&entry.timing, timing).await

                // Return recorded response
                MATCH entry.response {
                    RecordedResponse::Success { ref body } => {
                        Ok(Response {
                            status: 200,
                            body: serde_json::to_vec(body)?.into(),
                        })
                    },
                    RecordedResponse::Error { ref error } => {
                        Err(serde_json::from_value(error.clone())?)
                    },
                    RecordedResponse::Stream { .. } => {
                        Err(OllamaError::SimulationError {
                            message: "Use execute_streaming for streaming operations".to_string(),
                            cause: SimulationErrorCause::RequestMismatch,
                        })
                    },
                }
            },
        }
    }

    /// Execute streaming operation through simulation layer
    ASYNC FUNCTION execute_streaming<B, F, Fut>(
        &self,
        operation: &str,
        body: &B,
        executor: F,
    ) -> Result<impl Stream<Item = Result<Bytes, OllamaError>>, OllamaError>
    WHERE
        B: Serialize,
        F: FnOnce(Arc<dyn HttpTransport>, B) -> Fut,
        Fut: Future<Output = Result<impl Stream<Item = Result<Bytes, OllamaError>>, OllamaError>>,
    {
        LET mode = self.mode.read().unwrap().clone()

        MATCH mode {
            SimulationMode::Disabled => {
                executor(self.transport.clone(), body.clone()).await
            },

            SimulationMode::Recording { ref storage } => {
                // Execute and record chunks
                LET start = Instant::now()
                LET stream = executor(self.transport.clone(), body.clone()).await?

                // Wrap stream to record chunks
                Ok(RecordingStream::new(
                    stream,
                    operation.to_string(),
                    body.clone(),
                    self.recordings.clone(),
                    storage.clone(),
                ))
            },

            SimulationMode::Replay { ref source, ref timing } => {
                // Find matching recording
                LET entry = self.find_matching_recording(operation, body)?

                MATCH entry.response {
                    RecordedResponse::Stream { ref chunks } => {
                        // Create replay stream
                        Ok(ReplayStream::new(
                            chunks.clone(),
                            entry.timing.clone(),
                            timing.clone(),
                        ))
                    },
                    _ => {
                        Err(OllamaError::SimulationError {
                            message: "Recording is not a streaming response".to_string(),
                            cause: SimulationErrorCause::RequestMismatch,
                        })
                    },
                }
            },
        }
    }

    /// Find matching recording for replay
    FUNCTION find_matching_recording<B: Serialize>(
        &self,
        operation: &str,
        body: &B,
    ) -> Result<RecordEntry, OllamaError> {
        LET recordings = self.recordings.read().unwrap()
        LET request_value = serde_json::to_value(body)?

        // Try exact match first
        FOR entry IN recordings.iter() DO
            IF entry.operation == operation && entry.request == request_value THEN
                RETURN Ok(entry.clone())
            END IF
        END FOR

        // Try operation-only match (relaxed)
        FOR entry IN recordings.iter() DO
            IF entry.operation == operation THEN
                RETURN Ok(entry.clone())
            END IF
        END FOR

        // No match found
        Err(OllamaError::SimulationError {
            message: format!("No recording found for operation: {}", operation),
            cause: SimulationErrorCause::NoRecordingFound,
        })
    }

    /// Apply timing delay for replay
    ASYNC FUNCTION apply_timing(&self, recorded: &TimingInfo, mode: &TimingMode) {
        MATCH mode {
            TimingMode::Instant => {
                // No delay
            },
            TimingMode::Realistic => {
                tokio::time::sleep(Duration::from_millis(recorded.total_duration_ms)).await
            },
            TimingMode::Fixed { delay } => {
                tokio::time::sleep(*delay).await
            },
        }
    }

    /// Save recordings to file
    ASYNC FUNCTION save_to_file(&self, path: &Path) -> Result<(), OllamaError> {
        LET recordings = self.recordings.read().unwrap()

        LET recording = Recording {
            version: "1.0".to_string(),
            created_at: Utc::now(),
            entries: recordings.clone(),
        }

        LET json = serde_json::to_string_pretty(&recording)?
        tokio::fs::write(path, json).await?

        Ok(())
    }

    /// Load recordings from file
    ASYNC FUNCTION load_from_file(&self, path: &Path) -> Result<(), OllamaError> {
        LET json = tokio::fs::read_to_string(path).await?
        LET recording: Recording = serde_json::from_str(&json)?

        *self.recordings.write().unwrap() = recording.entries

        Ok(())
    }
}
```

---

## 8. Error Handling

### 8.1 Error Types (Rust)

```rust
// error.rs

use thiserror::Error;

/// Result type alias
pub type OllamaResult<T> = Result<T, OllamaError>;

/// Ollama error types
#[derive(Debug, Error)]
ENUM OllamaError {
    /// Connection error - cannot reach server
    #[error("Connection error: {message}")]
    ConnectionError {
        message: String,
        address: String,
        cause: Option<String>,
    },

    /// Server not running
    #[error("Ollama server not running: {message}")]
    ServerNotRunning {
        message: String,
        hint: String,
    },

    /// Model not found
    #[error("Model not found: {model}")]
    ModelNotFound {
        model: String,
        available: Option<Vec<String>>,
    },

    /// Model still loading
    #[error("Model loading: {model}")]
    ModelLoading {
        model: String,
        progress: Option<f32>,
    },

    /// Validation error
    #[error("Validation error: {message}")]
    ValidationError {
        message: String,
        field: Option<String>,
        value: Option<String>,
    },

    /// Context length exceeded
    #[error("Context length exceeded: {message}")]
    ContextLengthError {
        message: String,
        max_context: u32,
        requested: u32,
    },

    /// Request timeout
    #[error("Request timeout: {message}")]
    TimeoutError {
        message: String,
        timeout: Duration,
        operation: String,
    },

    /// Stream error
    #[error("Stream error: {message}")]
    StreamError {
        message: String,
        partial_response: Option<String>,
    },

    /// Internal error
    #[error("Internal error: {message}")]
    InternalError {
        message: String,
        status_code: Option<u16>,
    },

    /// Simulation error
    #[error("Simulation error: {message}")]
    SimulationError {
        message: String,
        cause: SimulationErrorCause,
    },
}

/// Simulation error causes
#[derive(Debug, Clone)]
ENUM SimulationErrorCause {
    /// No recording found for request
    NoRecordingFound,

    /// Request doesn't match any recording
    RequestMismatch,

    /// Recording file is corrupted
    CorruptedRecording,
}

IMPL OllamaError {
    /// Check if error is retryable
    FUNCTION is_retryable(&self) -> bool {
        MATCH self {
            OllamaError::ServerNotRunning { .. } => true,
            OllamaError::ModelLoading { .. } => true,
            OllamaError::ConnectionError { .. } => true,
            OllamaError::TimeoutError { .. } => true,
            _ => false,
        }
    }

    /// Get recovery hint
    FUNCTION recovery_hint(&self) -> Option<String> {
        MATCH self {
            OllamaError::ServerNotRunning { hint, .. } => Some(hint.clone()),
            OllamaError::ModelNotFound { model, .. } => {
                Some(format!("Run 'ollama pull {}' to download the model", model))
            },
            OllamaError::ModelLoading { .. } => {
                Some("Wait for the model to finish loading".to_string())
            },
            _ => None,
        }
    }
}

// Implement From traits for error conversion
IMPL From<reqwest::Error> FOR OllamaError {
    FUNCTION from(error: reqwest::Error) -> Self {
        IF error.is_connect() THEN
            OllamaError::ServerNotRunning {
                message: error.to_string(),
                hint: "Run 'ollama serve' or start the Ollama application".to_string(),
            }
        ELSE IF error.is_timeout() THEN
            OllamaError::TimeoutError {
                message: error.to_string(),
                timeout: Duration::default(),
                operation: "HTTP request".to_string(),
            }
        ELSE
            OllamaError::ConnectionError {
                message: error.to_string(),
                address: String::new(),
                cause: None,
            }
        END IF
    }
}

IMPL From<serde_json::Error> FOR OllamaError {
    FUNCTION from(error: serde_json::Error) -> Self {
        OllamaError::InternalError {
            message: format!("JSON error: {}", error),
            status_code: None,
        }
    }
}

IMPL From<std::io::Error> FOR OllamaError {
    FUNCTION from(error: std::io::Error) -> Self {
        OllamaError::InternalError {
            message: format!("IO error: {}", error),
            status_code: None,
        }
    }
}
```

### 8.2 Error Types (TypeScript)

```typescript
// errors.ts

/**
 * Ollama error codes
 */
enum OllamaErrorCode {
    CONNECTION_ERROR = 'CONNECTION_ERROR',
    SERVER_NOT_RUNNING = 'SERVER_NOT_RUNNING',
    MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
    MODEL_LOADING = 'MODEL_LOADING',
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    CONTEXT_LENGTH_ERROR = 'CONTEXT_LENGTH_ERROR',
    TIMEOUT_ERROR = 'TIMEOUT_ERROR',
    STREAM_ERROR = 'STREAM_ERROR',
    INTERNAL_ERROR = 'INTERNAL_ERROR',
    SIMULATION_ERROR = 'SIMULATION_ERROR',
}

/**
 * Base Ollama error class
 */
class OllamaError extends Error {
    readonly code: OllamaErrorCode;
    readonly details?: Record<string, unknown>;

    constructor(
        code: OllamaErrorCode,
        message: string,
        details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'OllamaError';
        this.code = code;
        this.details = details;
    }

    /**
     * Check if error is retryable
     */
    isRetryable(): boolean {
        return [
            OllamaErrorCode.SERVER_NOT_RUNNING,
            OllamaErrorCode.MODEL_LOADING,
            OllamaErrorCode.CONNECTION_ERROR,
            OllamaErrorCode.TIMEOUT_ERROR,
        ].includes(this.code);
    }

    /**
     * Get recovery hint
     */
    recoveryHint(): string | undefined {
        SWITCH this.code {
            CASE OllamaErrorCode.SERVER_NOT_RUNNING:
                return "Run 'ollama serve' or start the Ollama application";
            CASE OllamaErrorCode.MODEL_NOT_FOUND:
                const model = this.details?.model as string;
                return `Run 'ollama pull ${model}' to download the model`;
            CASE OllamaErrorCode.MODEL_LOADING:
                return 'Wait for the model to finish loading';
            DEFAULT:
                return undefined;
        }
    }

    /**
     * Create server not running error
     */
    static serverNotRunning(): OllamaError {
        return new OllamaError(
            OllamaErrorCode.SERVER_NOT_RUNNING,
            'Ollama server is not running',
            { hint: "Run 'ollama serve' or start the Ollama application" }
        );
    }

    /**
     * Create model not found error
     */
    static modelNotFound(model: string, available?: string[]): OllamaError {
        return new OllamaError(
            OllamaErrorCode.MODEL_NOT_FOUND,
            `Model not found: ${model}`,
            { model, available }
        );
    }

    /**
     * Create validation error
     */
    static validationError(message: string, field?: string): OllamaError {
        return new OllamaError(
            OllamaErrorCode.VALIDATION_ERROR,
            message,
            { field }
        );
    }

    /**
     * Create timeout error
     */
    static timeout(operation: string, timeoutMs: number): OllamaError {
        return new OllamaError(
            OllamaErrorCode.TIMEOUT_ERROR,
            `${operation} timed out after ${timeoutMs}ms`,
            { operation, timeoutMs }
        );
    }

    /**
     * Create simulation error
     */
    static simulationError(message: string, cause: string): OllamaError {
        return new OllamaError(
            OllamaErrorCode.SIMULATION_ERROR,
            message,
            { cause }
        );
    }
}

export { OllamaError, OllamaErrorCode };
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-OLLAMA-PSEUDO-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Pseudocode Document**

*SPARC Phase 3 Complete - Proceed to Refinement phase with "Next phase."*
