# Pseudocode: Groq Integration Module (Part 1)

## SPARC Phase 2: Pseudocode - Core Infrastructure

**Version:** 1.0.0
**Date:** 2025-01-15
**Status:** Draft
**Module:** `integrations/groq`

---

## Table of Contents

1. [Module Structure Overview](#1-module-structure-overview)
2. [Configuration Module](#2-configuration-module)
3. [Client Core](#3-client-core)
4. [HTTP Transport Layer](#4-http-transport-layer)
5. [Authentication Provider](#5-authentication-provider)
6. [Resilience Orchestrator](#6-resilience-orchestrator)
7. [Streaming Infrastructure](#7-streaming-infrastructure)
8. [Rate Limit Manager](#8-rate-limit-manager)

---

## 1. Module Structure Overview

### 1.1 Rust Crate Structure

```
groq/
├── Cargo.toml
├── src/
│   ├── lib.rs                    # Public API exports
│   ├── client.rs                 # GroqClient implementation
│   ├── config.rs                 # Configuration types and builder
│   ├── error.rs                  # Error types
│   ├── transport/
│   │   ├── mod.rs
│   │   ├── http.rs               # HTTP transport implementation
│   │   └── streaming.rs          # SSE streaming handler
│   ├── auth/
│   │   ├── mod.rs
│   │   └── api_key.rs            # API key authentication
│   ├── services/
│   │   ├── mod.rs
│   │   ├── chat.rs               # Chat completions service
│   │   ├── audio.rs              # Audio transcription/translation
│   │   └── models.rs             # Models listing service
│   ├── types/
│   │   ├── mod.rs
│   │   ├── chat.rs               # Chat request/response types
│   │   ├── audio.rs              # Audio request/response types
│   │   ├── models.rs             # Model types
│   │   └── common.rs             # Shared types
│   ├── resilience/
│   │   ├── mod.rs
│   │   └── orchestrator.rs       # Resilience coordination
│   └── observability/
│       ├── mod.rs
│       ├── tracing.rs            # Distributed tracing
│       └── metrics.rs            # Metrics collection
└── tests/
    ├── integration/
    ├── unit/
    └── fixtures/
```

### 1.2 TypeScript Package Structure

```
groq/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  # Public exports
│   ├── client.ts                 # GroqClient class
│   ├── config.ts                 # Configuration types
│   ├── errors.ts                 # Error classes
│   ├── transport/
│   │   ├── index.ts
│   │   ├── http.ts               # HTTP transport
│   │   └── streaming.ts          # SSE handler
│   ├── auth/
│   │   ├── index.ts
│   │   └── api-key.ts            # API key auth
│   ├── services/
│   │   ├── index.ts
│   │   ├── chat.ts               # Chat service
│   │   ├── audio.ts              # Audio service
│   │   └── models.ts             # Models service
│   ├── types/
│   │   ├── index.ts
│   │   ├── chat.ts               # Chat types
│   │   ├── audio.ts              # Audio types
│   │   └── models.ts             # Model types
│   └── resilience/
│       ├── index.ts
│       └── orchestrator.ts       # Resilience coordination
└── tests/
    ├── unit/
    └── integration/
```

### 1.3 Public API Exports (Rust)

```rust
// lib.rs - Public API surface

// Re-export client
pub use client::{GroqClient, GroqClientBuilder};

// Re-export configuration
pub use config::{GroqConfig, GroqConfigBuilder};

// Re-export services
pub use services::{
    ChatService,
    AudioService,
    ModelsService,
};

// Re-export types
pub use types::{
    // Chat types
    ChatRequest, ChatRequestBuilder,
    ChatResponse, ChatChunk,
    Message, MessageBuilder,
    Role, Content, ContentPart,
    Tool, ToolChoice, ToolCall,
    ResponseFormat, ResponseFormatType,
    StreamOptions,
    Usage, GroqMetadata,

    // Audio types
    TranscriptionRequest, TranscriptionRequestBuilder,
    TranscriptionResponse,
    TranslationRequest, TranslationRequestBuilder,
    TranslationResponse,
    AudioFile, AudioFormat, Granularity,
    Word, Segment,

    // Model types
    Model, ModelList,

    // Common types
    FinishReason,
};

// Re-export errors
pub use error::{GroqError, GroqResult};

// Version constant
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
```

### 1.4 Public API Exports (TypeScript)

```typescript
// index.ts - Public API surface

// Client exports
export { GroqClient, GroqClientBuilder } from './client';
export { GroqConfig, GroqConfigBuilder } from './config';

// Service exports
export { ChatService } from './services/chat';
export { AudioService } from './services/audio';
export { ModelsService } from './services/models';

// Type exports
export {
    // Chat types
    ChatRequest,
    ChatResponse,
    ChatChunk,
    Message,
    Role,
    Content,
    ContentPart,
    Tool,
    ToolChoice,
    ToolCall,
    ResponseFormat,
    StreamOptions,
    Usage,
    GroqMetadata,

    // Audio types
    TranscriptionRequest,
    TranscriptionResponse,
    TranslationRequest,
    TranslationResponse,
    AudioFormat,
    Granularity,
    Word,
    Segment,

    // Model types
    Model,
    ModelList,

    // Common
    FinishReason,
} from './types';

// Error exports
export { GroqError, GroqErrorCode } from './errors';

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
use primitives::{RetryConfig, CircuitBreakerConfig, RateLimitConfig};

/// Default values
const DEFAULT_BASE_URL: &str = "https://api.groq.com/openai/v1";
const DEFAULT_TIMEOUT_SECS: u64 = 60;
const DEFAULT_MAX_RETRIES: u32 = 3;

/// Groq client configuration
STRUCT GroqConfig {
    /// API key for authentication (secret)
    api_key: SecretString,

    /// Base URL for API requests
    base_url: String,

    /// Request timeout duration
    timeout: Duration,

    /// Maximum retry attempts
    max_retries: u32,

    /// Retry configuration from primitives
    retry_config: RetryConfig,

    /// Circuit breaker configuration from primitives
    circuit_breaker_config: CircuitBreakerConfig,

    /// Rate limit configuration from primitives
    rate_limit_config: Option<RateLimitConfig>,

    /// Default headers for all requests
    default_headers: HashMap<String, String>,
}

IMPL GroqConfig {
    /// Create new configuration with API key
    FUNCTION new(api_key: SecretString) -> Self {
        Self {
            api_key,
            base_url: DEFAULT_BASE_URL.to_string(),
            timeout: Duration::from_secs(DEFAULT_TIMEOUT_SECS),
            max_retries: DEFAULT_MAX_RETRIES,
            retry_config: RetryConfig::default(),
            circuit_breaker_config: CircuitBreakerConfig::default(),
            rate_limit_config: None,
            default_headers: HashMap::new(),
        }
    }

    /// Get API key reference
    FUNCTION api_key(&self) -> &SecretString {
        &self.api_key
    }

    /// Get base URL
    FUNCTION base_url(&self) -> &str {
        &self.base_url
    }

    /// Get timeout
    FUNCTION timeout(&self) -> Duration {
        self.timeout
    }

    /// Validate configuration
    FUNCTION validate(&self) -> Result<(), GroqError> {
        // Validate API key is not empty
        IF self.api_key.expose_secret().is_empty() THEN
            RETURN Err(GroqError::ValidationError {
                message: "API key cannot be empty".to_string(),
                param: Some("api_key".to_string()),
                value: None,
            })
        END IF

        // Validate base URL format
        IF !self.base_url.starts_with("https://") THEN
            RETURN Err(GroqError::ValidationError {
                message: "Base URL must use HTTPS".to_string(),
                param: Some("base_url".to_string()),
                value: Some(self.base_url.clone()),
            })
        END IF

        // Validate timeout is reasonable
        IF self.timeout.as_secs() == 0 THEN
            RETURN Err(GroqError::ValidationError {
                message: "Timeout must be greater than 0".to_string(),
                param: Some("timeout".to_string()),
                value: Some(self.timeout.as_secs().to_string()),
            })
        END IF

        Ok(())
    }
}
```

### 2.2 Configuration Builder (Rust)

```rust
// config.rs (continued)

/// Builder for GroqConfig
STRUCT GroqConfigBuilder {
    api_key: Option<SecretString>,
    base_url: Option<String>,
    timeout: Option<Duration>,
    max_retries: Option<u32>,
    retry_config: Option<RetryConfig>,
    circuit_breaker_config: Option<CircuitBreakerConfig>,
    rate_limit_config: Option<RateLimitConfig>,
    default_headers: HashMap<String, String>,
}

IMPL GroqConfigBuilder {
    /// Create new builder
    FUNCTION new() -> Self {
        Self {
            api_key: None,
            base_url: None,
            timeout: None,
            max_retries: None,
            retry_config: None,
            circuit_breaker_config: None,
            rate_limit_config: None,
            default_headers: HashMap::new(),
        }
    }

    /// Set API key
    FUNCTION api_key(mut self, key: impl Into<SecretString>) -> Self {
        self.api_key = Some(key.into())
        self
    }

    /// Set API key from environment variable
    FUNCTION api_key_from_env(mut self, var_name: &str) -> Result<Self, GroqError> {
        LET key = std::env::var(var_name)
            .map_err(|_| GroqError::AuthenticationError {
                message: format!("Environment variable {} not found", var_name),
                api_key_hint: None,
            })?

        self.api_key = Some(SecretString::new(key))
        Ok(self)
    }

    /// Set base URL
    FUNCTION base_url(mut self, url: impl Into<String>) -> Self {
        self.base_url = Some(url.into())
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

    /// Set retry configuration
    FUNCTION retry_config(mut self, config: RetryConfig) -> Self {
        self.retry_config = Some(config)
        self
    }

    /// Set circuit breaker configuration
    FUNCTION circuit_breaker_config(mut self, config: CircuitBreakerConfig) -> Self {
        self.circuit_breaker_config = Some(config)
        self
    }

    /// Set rate limit configuration
    FUNCTION rate_limit_config(mut self, config: RateLimitConfig) -> Self {
        self.rate_limit_config = Some(config)
        self
    }

    /// Add default header
    FUNCTION default_header(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.default_headers.insert(name.into(), value.into())
        self
    }

    /// Build configuration
    FUNCTION build(self) -> Result<GroqConfig, GroqError> {
        LET api_key = self.api_key.ok_or_else(|| GroqError::ValidationError {
            message: "API key is required".to_string(),
            param: Some("api_key".to_string()),
            value: None,
        })?

        LET config = GroqConfig {
            api_key,
            base_url: self.base_url.unwrap_or_else(|| DEFAULT_BASE_URL.to_string()),
            timeout: self.timeout.unwrap_or_else(|| Duration::from_secs(DEFAULT_TIMEOUT_SECS)),
            max_retries: self.max_retries.unwrap_or(DEFAULT_MAX_RETRIES),
            retry_config: self.retry_config.unwrap_or_default(),
            circuit_breaker_config: self.circuit_breaker_config.unwrap_or_default(),
            rate_limit_config: self.rate_limit_config,
            default_headers: self.default_headers,
        }

        // Validate before returning
        config.validate()?

        Ok(config)
    }
}

IMPL Default FOR GroqConfigBuilder {
    FUNCTION default() -> Self {
        Self::new()
    }
}
```

### 2.3 Configuration Types (TypeScript)

```typescript
// config.ts

import { SecretString } from 'primitives/types';
import { RetryConfig, CircuitBreakerConfig, RateLimitConfig } from 'primitives';

const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_MAX_RETRIES = 3;

/**
 * Groq client configuration
 */
interface GroqConfig {
    readonly apiKey: SecretString;
    readonly baseUrl: string;
    readonly timeoutMs: number;
    readonly maxRetries: number;
    readonly retryConfig: RetryConfig;
    readonly circuitBreakerConfig: CircuitBreakerConfig;
    readonly rateLimitConfig?: RateLimitConfig;
    readonly defaultHeaders: Record<string, string>;
}

/**
 * Configuration builder for GroqConfig
 */
class GroqConfigBuilder {
    private _apiKey?: SecretString;
    private _baseUrl?: string;
    private _timeoutMs?: number;
    private _maxRetries?: number;
    private _retryConfig?: RetryConfig;
    private _circuitBreakerConfig?: CircuitBreakerConfig;
    private _rateLimitConfig?: RateLimitConfig;
    private _defaultHeaders: Record<string, string> = {};

    /**
     * Set API key
     */
    apiKey(key: string | SecretString): this {
        this._apiKey = typeof key === 'string'
            ? new SecretString(key)
            : key;
        return this;
    }

    /**
     * Set API key from environment variable
     */
    apiKeyFromEnv(varName: string = 'GROQ_API_KEY'): this {
        const key = process.env[varName];
        IF (!key) THEN
            THROW new GroqError({
                code: 'authentication_error',
                message: `Environment variable ${varName} not found`,
            });
        END IF
        this._apiKey = new SecretString(key);
        return this;
    }

    /**
     * Set base URL
     */
    baseUrl(url: string): this {
        this._baseUrl = url;
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
     * Set retry configuration
     */
    retryConfig(config: RetryConfig): this {
        this._retryConfig = config;
        return this;
    }

    /**
     * Set circuit breaker configuration
     */
    circuitBreakerConfig(config: CircuitBreakerConfig): this {
        this._circuitBreakerConfig = config;
        return this;
    }

    /**
     * Set rate limit configuration
     */
    rateLimitConfig(config: RateLimitConfig): this {
        this._rateLimitConfig = config;
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
     * Build configuration
     */
    build(): GroqConfig {
        IF (!this._apiKey) THEN
            THROW new GroqError({
                code: 'validation_error',
                message: 'API key is required',
                param: 'apiKey',
            });
        END IF

        const config: GroqConfig = {
            apiKey: this._apiKey,
            baseUrl: this._baseUrl ?? DEFAULT_BASE_URL,
            timeoutMs: this._timeoutMs ?? DEFAULT_TIMEOUT_MS,
            maxRetries: this._maxRetries ?? DEFAULT_MAX_RETRIES,
            retryConfig: this._retryConfig ?? RetryConfig.default(),
            circuitBreakerConfig: this._circuitBreakerConfig ?? CircuitBreakerConfig.default(),
            rateLimitConfig: this._rateLimitConfig,
            defaultHeaders: { ...this._defaultHeaders },
        };

        // Validate
        this.validate(config);

        return config;
    }

    /**
     * Validate configuration
     */
    private validate(config: GroqConfig): void {
        IF (config.apiKey.expose().length === 0) THEN
            THROW new GroqError({
                code: 'validation_error',
                message: 'API key cannot be empty',
                param: 'apiKey',
            });
        END IF

        IF (!config.baseUrl.startsWith('https://')) THEN
            THROW new GroqError({
                code: 'validation_error',
                message: 'Base URL must use HTTPS',
                param: 'baseUrl',
            });
        END IF

        IF (config.timeoutMs <= 0) THEN
            THROW new GroqError({
                code: 'validation_error',
                message: 'Timeout must be greater than 0',
                param: 'timeoutMs',
            });
        END IF
    }
}

export { GroqConfig, GroqConfigBuilder };
```

---

## 3. Client Core

### 3.1 GroqClient (Rust)

```rust
// client.rs

use std::sync::Arc;
use tokio::sync::RwLock;

/// Main Groq client
STRUCT GroqClient {
    /// Client configuration
    config: Arc<GroqConfig>,

    /// HTTP transport layer
    transport: Arc<dyn HttpTransport>,

    /// Authentication provider
    auth: Arc<dyn AuthProvider>,

    /// Resilience orchestrator
    resilience: Arc<ResilienceOrchestrator>,

    /// Rate limit manager
    rate_limiter: Arc<RwLock<RateLimitManager>>,

    /// Chat service instance
    chat_service: ChatService,

    /// Audio service instance
    audio_service: AudioService,

    /// Models service instance
    models_service: ModelsService,
}

IMPL GroqClient {
    /// Create client from configuration
    FUNCTION new(config: GroqConfig) -> Result<Self, GroqError> {
        // Validate configuration
        config.validate()?

        LET config = Arc::new(config)

        // Create transport
        LET transport = Arc::new(HttpTransportImpl::new(
            config.base_url().to_string(),
            config.timeout(),
        )?)

        // Create auth provider
        LET auth = Arc::new(ApiKeyAuth::new(config.api_key().clone()))

        // Create resilience orchestrator using primitives
        LET resilience = Arc::new(ResilienceOrchestrator::new(
            config.retry_config.clone(),
            config.circuit_breaker_config.clone(),
        ))

        // Create rate limit manager
        LET rate_limiter = Arc::new(RwLock::new(
            RateLimitManager::new(config.rate_limit_config.clone())
        ))

        // Create services
        LET chat_service = ChatService::new(
            transport.clone(),
            auth.clone(),
            resilience.clone(),
            rate_limiter.clone(),
        )

        LET audio_service = AudioService::new(
            transport.clone(),
            auth.clone(),
            resilience.clone(),
            rate_limiter.clone(),
        )

        LET models_service = ModelsService::new(
            transport.clone(),
            auth.clone(),
            resilience.clone(),
            rate_limiter.clone(),
        )

        Ok(Self {
            config,
            transport,
            auth,
            resilience,
            rate_limiter,
            chat_service,
            audio_service,
            models_service,
        })
    }

    /// Get chat service
    FUNCTION chat(&self) -> &ChatService {
        &self.chat_service
    }

    /// Get audio service
    FUNCTION audio(&self) -> &AudioService {
        &self.audio_service
    }

    /// Get models service
    FUNCTION models(&self) -> &ModelsService {
        &self.models_service
    }

    /// Get client configuration
    FUNCTION config(&self) -> &GroqConfig {
        &self.config
    }

    /// Perform health check
    ASYNC FUNCTION health_check(&self) -> Result<HealthStatus, GroqError> {
        // Try to list models as health check
        LET start = Instant::now()

        MATCH self.models_service.list().await {
            Ok(_) => Ok(HealthStatus {
                healthy: true,
                latency_ms: start.elapsed().as_millis() as u64,
                message: None,
            }),
            Err(e) => Ok(HealthStatus {
                healthy: false,
                latency_ms: start.elapsed().as_millis() as u64,
                message: Some(e.to_string()),
            }),
        }
    }

    /// Get current rate limit status
    ASYNC FUNCTION rate_limit_status(&self) -> RateLimitStatus {
        self.rate_limiter.read().await.status()
    }
}

/// Health status result
STRUCT HealthStatus {
    healthy: bool,
    latency_ms: u64,
    message: Option<String>,
}
```

### 3.2 Client Builder (Rust)

```rust
// client.rs (continued)

/// Builder for GroqClient
STRUCT GroqClientBuilder {
    config_builder: GroqConfigBuilder,
    transport: Option<Arc<dyn HttpTransport>>,
    auth: Option<Arc<dyn AuthProvider>>,
}

IMPL GroqClientBuilder {
    /// Create new builder
    FUNCTION new() -> Self {
        Self {
            config_builder: GroqConfigBuilder::new(),
            transport: None,
            auth: None,
        }
    }

    /// Set API key
    FUNCTION api_key(mut self, key: impl Into<SecretString>) -> Self {
        self.config_builder = self.config_builder.api_key(key)
        self
    }

    /// Set API key from environment
    FUNCTION api_key_from_env(mut self, var_name: &str) -> Result<Self, GroqError> {
        self.config_builder = self.config_builder.api_key_from_env(var_name)?
        Ok(self)
    }

    /// Set base URL
    FUNCTION base_url(mut self, url: impl Into<String>) -> Self {
        self.config_builder = self.config_builder.base_url(url)
        self
    }

    /// Set timeout
    FUNCTION timeout(mut self, duration: Duration) -> Self {
        self.config_builder = self.config_builder.timeout(duration)
        self
    }

    /// Set timeout in seconds
    FUNCTION timeout_secs(mut self, secs: u64) -> Self {
        self.config_builder = self.config_builder.timeout_secs(secs)
        self
    }

    /// Set max retries
    FUNCTION max_retries(mut self, count: u32) -> Self {
        self.config_builder = self.config_builder.max_retries(count)
        self
    }

    /// Set retry configuration
    FUNCTION retry_config(mut self, config: RetryConfig) -> Self {
        self.config_builder = self.config_builder.retry_config(config)
        self
    }

    /// Set circuit breaker configuration
    FUNCTION circuit_breaker_config(mut self, config: CircuitBreakerConfig) -> Self {
        self.config_builder = self.config_builder.circuit_breaker_config(config)
        self
    }

    /// Set rate limit configuration
    FUNCTION rate_limit_config(mut self, config: RateLimitConfig) -> Self {
        self.config_builder = self.config_builder.rate_limit_config(config)
        self
    }

    /// Add default header
    FUNCTION default_header(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.config_builder = self.config_builder.default_header(name, value)
        self
    }

    /// Set custom transport (for testing)
    FUNCTION with_transport(mut self, transport: Arc<dyn HttpTransport>) -> Self {
        self.transport = Some(transport)
        self
    }

    /// Set custom auth provider (for testing)
    FUNCTION with_auth(mut self, auth: Arc<dyn AuthProvider>) -> Self {
        self.auth = Some(auth)
        self
    }

    /// Build client
    FUNCTION build(self) -> Result<GroqClient, GroqError> {
        LET config = self.config_builder.build()?

        // Use custom transport or create default
        LET transport = self.transport.unwrap_or_else(|| {
            Arc::new(HttpTransportImpl::new(
                config.base_url().to_string(),
                config.timeout(),
            ).expect("Failed to create transport"))
        })

        // Use custom auth or create default
        LET auth = self.auth.unwrap_or_else(|| {
            Arc::new(ApiKeyAuth::new(config.api_key().clone()))
        })

        // Create with custom components
        GroqClient::with_components(config, transport, auth)
    }
}

IMPL GroqClient {
    /// Create client with custom components (for testing)
    FUNCTION with_components(
        config: GroqConfig,
        transport: Arc<dyn HttpTransport>,
        auth: Arc<dyn AuthProvider>,
    ) -> Result<Self, GroqError> {
        LET config = Arc::new(config)

        LET resilience = Arc::new(ResilienceOrchestrator::new(
            config.retry_config.clone(),
            config.circuit_breaker_config.clone(),
        ))

        LET rate_limiter = Arc::new(RwLock::new(
            RateLimitManager::new(config.rate_limit_config.clone())
        ))

        LET chat_service = ChatService::new(
            transport.clone(),
            auth.clone(),
            resilience.clone(),
            rate_limiter.clone(),
        )

        LET audio_service = AudioService::new(
            transport.clone(),
            auth.clone(),
            resilience.clone(),
            rate_limiter.clone(),
        )

        LET models_service = ModelsService::new(
            transport.clone(),
            auth.clone(),
            resilience.clone(),
            rate_limiter.clone(),
        )

        Ok(Self {
            config,
            transport,
            auth,
            resilience,
            rate_limiter,
            chat_service,
            audio_service,
            models_service,
        })
    }
}
```

### 3.3 GroqClient (TypeScript)

```typescript
// client.ts

import { ChatService } from './services/chat';
import { AudioService } from './services/audio';
import { ModelsService } from './services/models';
import { HttpTransport, HttpTransportImpl } from './transport/http';
import { AuthProvider, ApiKeyAuth } from './auth/api-key';
import { ResilienceOrchestrator } from './resilience/orchestrator';
import { RateLimitManager } from './resilience/rate-limit';
import { GroqConfig, GroqConfigBuilder } from './config';
import { GroqError } from './errors';

/**
 * Health check status
 */
interface HealthStatus {
    healthy: boolean;
    latencyMs: number;
    message?: string;
}

/**
 * Main Groq client
 */
class GroqClient {
    private readonly _config: GroqConfig;
    private readonly _transport: HttpTransport;
    private readonly _auth: AuthProvider;
    private readonly _resilience: ResilienceOrchestrator;
    private readonly _rateLimiter: RateLimitManager;

    private readonly _chatService: ChatService;
    private readonly _audioService: AudioService;
    private readonly _modelsService: ModelsService;

    /**
     * Private constructor - use builder
     */
    private constructor(
        config: GroqConfig,
        transport: HttpTransport,
        auth: AuthProvider,
    ) {
        this._config = config;
        this._transport = transport;
        this._auth = auth;

        // Create resilience orchestrator
        this._resilience = new ResilienceOrchestrator(
            config.retryConfig,
            config.circuitBreakerConfig,
        );

        // Create rate limiter
        this._rateLimiter = new RateLimitManager(config.rateLimitConfig);

        // Create services
        this._chatService = new ChatService(
            this._transport,
            this._auth,
            this._resilience,
            this._rateLimiter,
        );

        this._audioService = new AudioService(
            this._transport,
            this._auth,
            this._resilience,
            this._rateLimiter,
        );

        this._modelsService = new ModelsService(
            this._transport,
            this._auth,
            this._resilience,
            this._rateLimiter,
        );
    }

    /**
     * Create client from config
     */
    static create(config: GroqConfig): GroqClient {
        const transport = new HttpTransportImpl(
            config.baseUrl,
            config.timeoutMs,
        );

        const auth = new ApiKeyAuth(config.apiKey);

        return new GroqClient(config, transport, auth);
    }

    /**
     * Create client with custom components (for testing)
     */
    static withComponents(
        config: GroqConfig,
        transport: HttpTransport,
        auth: AuthProvider,
    ): GroqClient {
        return new GroqClient(config, transport, auth);
    }

    /**
     * Get chat service
     */
    get chat(): ChatService {
        return this._chatService;
    }

    /**
     * Get audio service
     */
    get audio(): AudioService {
        return this._audioService;
    }

    /**
     * Get models service
     */
    get models(): ModelsService {
        return this._modelsService;
    }

    /**
     * Get configuration
     */
    get config(): GroqConfig {
        return this._config;
    }

    /**
     * Perform health check
     */
    async healthCheck(): Promise<HealthStatus> {
        const start = Date.now();

        TRY {
            await this._modelsService.list();
            return {
                healthy: true,
                latencyMs: Date.now() - start,
            };
        } CATCH (error) {
            return {
                healthy: false,
                latencyMs: Date.now() - start,
                message: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Get current rate limit status
     */
    rateLimitStatus(): RateLimitStatus {
        return this._rateLimiter.status();
    }
}

/**
 * Builder for GroqClient
 */
class GroqClientBuilder {
    private _configBuilder: GroqConfigBuilder;
    private _transport?: HttpTransport;
    private _auth?: AuthProvider;

    constructor() {
        this._configBuilder = new GroqConfigBuilder();
    }

    /**
     * Set API key
     */
    apiKey(key: string): this {
        this._configBuilder.apiKey(key);
        return this;
    }

    /**
     * Set API key from environment
     */
    apiKeyFromEnv(varName: string = 'GROQ_API_KEY'): this {
        this._configBuilder.apiKeyFromEnv(varName);
        return this;
    }

    /**
     * Set base URL
     */
    baseUrl(url: string): this {
        this._configBuilder.baseUrl(url);
        return this;
    }

    /**
     * Set timeout in milliseconds
     */
    timeoutMs(ms: number): this {
        this._configBuilder.timeoutMs(ms);
        return this;
    }

    /**
     * Set max retries
     */
    maxRetries(count: number): this {
        this._configBuilder.maxRetries(count);
        return this;
    }

    /**
     * Set custom transport (for testing)
     */
    withTransport(transport: HttpTransport): this {
        this._transport = transport;
        return this;
    }

    /**
     * Set custom auth (for testing)
     */
    withAuth(auth: AuthProvider): this {
        this._auth = auth;
        return this;
    }

    /**
     * Build client
     */
    build(): GroqClient {
        const config = this._configBuilder.build();

        IF (this._transport && this._auth) THEN
            return GroqClient.withComponents(config, this._transport, this._auth);
        END IF

        return GroqClient.create(config);
    }
}

export { GroqClient, GroqClientBuilder, HealthStatus };
```

---

## 4. HTTP Transport Layer

### 4.1 Transport Trait (Rust)

```rust
// transport/mod.rs

use async_trait::async_trait;

/// HTTP transport interface
#[async_trait]
TRAIT HttpTransport: Send + Sync {
    /// Send HTTP request
    ASYNC FUNCTION send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError>;

    /// Send streaming HTTP request
    ASYNC FUNCTION send_streaming(&self, request: HttpRequest) -> Result<StreamingResponse, TransportError>;

    /// Send multipart form data
    ASYNC FUNCTION send_multipart(&self, request: MultipartRequest) -> Result<HttpResponse, TransportError>;
}

/// HTTP request representation
STRUCT HttpRequest {
    method: HttpMethod,
    path: String,
    headers: HashMap<String, String>,
    body: Option<Vec<u8>>,
    timeout: Option<Duration>,
}

/// HTTP response representation
STRUCT HttpResponse {
    status: u16,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

/// Streaming response
STRUCT StreamingResponse {
    status: u16,
    headers: HashMap<String, String>,
    stream: Pin<Box<dyn Stream<Item = Result<Bytes, TransportError>> + Send>>,
}

/// Multipart request
STRUCT MultipartRequest {
    path: String,
    headers: HashMap<String, String>,
    parts: Vec<MultipartPart>,
    timeout: Option<Duration>,
}

/// Multipart form part
ENUM MultipartPart {
    Text { name: String, value: String },
    File { name: String, filename: String, content_type: String, data: Vec<u8> },
}

/// Transport error
ENUM TransportError {
    ConnectionError { message: String },
    TimeoutError { timeout: Duration },
    TlsError { message: String },
    InvalidResponse { message: String },
}
```

### 4.2 HTTP Transport Implementation (Rust)

```rust
// transport/http.rs

use reqwest::{Client, ClientBuilder};
use std::time::Duration;

/// HTTP transport implementation using reqwest
STRUCT HttpTransportImpl {
    client: Client,
    base_url: String,
}

IMPL HttpTransportImpl {
    /// Create new transport
    FUNCTION new(base_url: String, timeout: Duration) -> Result<Self, TransportError> {
        LET client = ClientBuilder::new()
            .timeout(timeout)
            .pool_max_idle_per_host(10)
            .tcp_keepalive(Duration::from_secs(60))
            .min_tls_version(reqwest::tls::Version::TLS_1_2)
            .build()
            .map_err(|e| TransportError::ConnectionError {
                message: e.to_string(),
            })?

        Ok(Self { client, base_url })
    }

    /// Build full URL
    FUNCTION build_url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }
}

#[async_trait]
IMPL HttpTransport FOR HttpTransportImpl {
    ASYNC FUNCTION send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError> {
        // Create span for tracing
        LET span = tracing::info_span!(
            "http_request",
            method = %request.method,
            path = %request.path,
        )

        async move {
            LET url = self.build_url(&request.path)

            // Build request
            LET mut req_builder = match request.method {
                HttpMethod::Get => self.client.get(&url),
                HttpMethod::Post => self.client.post(&url),
                HttpMethod::Delete => self.client.delete(&url),
            }

            // Add headers
            FOR (name, value) IN request.headers {
                req_builder = req_builder.header(&name, &value)
            }

            // Add body if present
            IF LET Some(body) = request.body {
                req_builder = req_builder.body(body)
            }

            // Override timeout if specified
            IF LET Some(timeout) = request.timeout {
                req_builder = req_builder.timeout(timeout)
            }

            // Execute request
            LET response = req_builder.send().await
                .map_err(|e| {
                    IF e.is_timeout() {
                        TransportError::TimeoutError {
                            timeout: request.timeout.unwrap_or(Duration::from_secs(60)),
                        }
                    } ELSE IF e.is_connect() {
                        TransportError::ConnectionError {
                            message: e.to_string(),
                        }
                    } ELSE {
                        TransportError::InvalidResponse {
                            message: e.to_string(),
                        }
                    }
                })?

            // Extract response
            LET status = response.status().as_u16()
            LET headers = response.headers()
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
                .collect()
            LET body = response.bytes().await
                .map_err(|e| TransportError::InvalidResponse {
                    message: e.to_string(),
                })?
                .to_vec()

            Ok(HttpResponse { status, headers, body })
        }.instrument(span).await
    }

    ASYNC FUNCTION send_streaming(&self, request: HttpRequest) -> Result<StreamingResponse, TransportError> {
        LET url = self.build_url(&request.path)

        LET mut req_builder = self.client.post(&url)

        FOR (name, value) IN request.headers {
            req_builder = req_builder.header(&name, &value)
        }

        IF LET Some(body) = request.body {
            req_builder = req_builder.body(body)
        }

        LET response = req_builder.send().await
            .map_err(|e| TransportError::ConnectionError {
                message: e.to_string(),
            })?

        LET status = response.status().as_u16()
        LET headers = response.headers()
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect()

        // Convert to byte stream
        LET stream = response.bytes_stream()
            .map_err(|e| TransportError::InvalidResponse {
                message: e.to_string(),
            })

        Ok(StreamingResponse {
            status,
            headers,
            stream: Box::pin(stream),
        })
    }

    ASYNC FUNCTION send_multipart(&self, request: MultipartRequest) -> Result<HttpResponse, TransportError> {
        LET url = self.build_url(&request.path)

        // Build multipart form
        LET mut form = reqwest::multipart::Form::new()

        FOR part IN request.parts {
            form = MATCH part {
                MultipartPart::Text { name, value } => {
                    form.text(name, value)
                },
                MultipartPart::File { name, filename, content_type, data } => {
                    LET part = reqwest::multipart::Part::bytes(data)
                        .file_name(filename)
                        .mime_str(&content_type)
                        .map_err(|e| TransportError::InvalidResponse {
                            message: e.to_string(),
                        })?
                    form.part(name, part)
                },
            }
        }

        LET mut req_builder = self.client.post(&url).multipart(form)

        FOR (name, value) IN request.headers {
            req_builder = req_builder.header(&name, &value)
        }

        IF LET Some(timeout) = request.timeout {
            req_builder = req_builder.timeout(timeout)
        }

        LET response = req_builder.send().await
            .map_err(|e| TransportError::ConnectionError {
                message: e.to_string(),
            })?

        LET status = response.status().as_u16()
        LET headers = response.headers()
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect()
        LET body = response.bytes().await
            .map_err(|e| TransportError::InvalidResponse {
                message: e.to_string(),
            })?
            .to_vec()

        Ok(HttpResponse { status, headers, body })
    }
}
```

### 4.3 HTTP Transport (TypeScript)

```typescript
// transport/http.ts

import axios, { AxiosInstance, AxiosResponse } from 'axios';

/**
 * HTTP transport interface
 */
interface HttpTransport {
    send(request: HttpRequest): Promise<HttpResponse>;
    sendStreaming(request: HttpRequest): Promise<StreamingResponse>;
    sendMultipart(request: MultipartRequest): Promise<HttpResponse>;
}

/**
 * HTTP request
 */
interface HttpRequest {
    method: 'GET' | 'POST' | 'DELETE';
    path: string;
    headers: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
}

/**
 * HTTP response
 */
interface HttpResponse {
    status: number;
    headers: Record<string, string>;
    body: unknown;
}

/**
 * Streaming response
 */
interface StreamingResponse {
    status: number;
    headers: Record<string, string>;
    stream: AsyncIterable<Uint8Array>;
}

/**
 * Multipart request
 */
interface MultipartRequest {
    path: string;
    headers: Record<string, string>;
    parts: MultipartPart[];
    timeoutMs?: number;
}

/**
 * Multipart part
 */
type MultipartPart =
    | { type: 'text'; name: string; value: string }
    | { type: 'file'; name: string; filename: string; contentType: string; data: Buffer };

/**
 * HTTP transport implementation
 */
class HttpTransportImpl implements HttpTransport {
    private readonly client: AxiosInstance;
    private readonly baseUrl: string;

    constructor(baseUrl: string, timeoutMs: number) {
        this.baseUrl = baseUrl;
        this.client = axios.create({
            baseURL: baseUrl,
            timeout: timeoutMs,
            validateStatus: () => true, // Don't throw on non-2xx
        });
    }

    async send(request: HttpRequest): Promise<HttpResponse> {
        const response = await this.client.request({
            method: request.method,
            url: request.path,
            headers: request.headers,
            data: request.body,
            timeout: request.timeoutMs,
        });

        return {
            status: response.status,
            headers: this.normalizeHeaders(response.headers),
            body: response.data,
        };
    }

    async sendStreaming(request: HttpRequest): Promise<StreamingResponse> {
        const response = await this.client.request({
            method: request.method,
            url: request.path,
            headers: request.headers,
            data: request.body,
            responseType: 'stream',
            timeout: request.timeoutMs,
        });

        return {
            status: response.status,
            headers: this.normalizeHeaders(response.headers),
            stream: this.toAsyncIterable(response.data),
        };
    }

    async sendMultipart(request: MultipartRequest): Promise<HttpResponse> {
        const FormData = (await import('form-data')).default;
        const form = new FormData();

        FOR (const part of request.parts) {
            IF (part.type === 'text') THEN
                form.append(part.name, part.value);
            ELSE IF (part.type === 'file') THEN
                form.append(part.name, part.data, {
                    filename: part.filename,
                    contentType: part.contentType,
                });
            END IF
        }

        const response = await this.client.post(request.path, form, {
            headers: {
                ...request.headers,
                ...form.getHeaders(),
            },
            timeout: request.timeoutMs,
        });

        return {
            status: response.status,
            headers: this.normalizeHeaders(response.headers),
            body: response.data,
        };
    }

    private normalizeHeaders(headers: unknown): Record<string, string> {
        const result: Record<string, string> = {};
        IF (headers && typeof headers === 'object') THEN
            FOR (const [key, value] of Object.entries(headers)) {
                result[key.toLowerCase()] = String(value);
            }
        END IF
        return result;
    }

    private async *toAsyncIterable(stream: NodeJS.ReadableStream): AsyncIterable<Uint8Array> {
        FOR await (const chunk of stream) {
            yield chunk as Uint8Array;
        }
    }
}

export { HttpTransport, HttpTransportImpl, HttpRequest, HttpResponse, StreamingResponse, MultipartRequest, MultipartPart };
```

---

## 5. Authentication Provider

### 5.1 Auth Trait (Rust)

```rust
// auth/mod.rs

use async_trait::async_trait;

/// Authentication provider interface
#[async_trait]
TRAIT AuthProvider: Send + Sync {
    /// Apply authentication to request headers
    FUNCTION apply_auth(&self, headers: &mut HashMap<String, String>);

    /// Get authentication scheme name
    FUNCTION scheme(&self) -> &str;

    /// Validate credentials
    FUNCTION validate(&self) -> Result<(), GroqError>;
}
```

### 5.2 API Key Auth (Rust)

```rust
// auth/api_key.rs

use secrecy::{SecretString, ExposeSecret};

/// API key authentication provider
STRUCT ApiKeyAuth {
    api_key: SecretString,
}

IMPL ApiKeyAuth {
    /// Create new API key auth
    FUNCTION new(api_key: SecretString) -> Self {
        Self { api_key }
    }

    /// Get hint for debugging (last 4 characters)
    FUNCTION key_hint(&self) -> String {
        LET key = self.api_key.expose_secret()
        IF key.len() > 4 {
            format!("...{}", &key[key.len()-4..])
        } ELSE {
            "****".to_string()
        }
    }
}

#[async_trait]
IMPL AuthProvider FOR ApiKeyAuth {
    FUNCTION apply_auth(&self, headers: &mut HashMap<String, String>) {
        headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", self.api_key.expose_secret()),
        )
    }

    FUNCTION scheme(&self) -> &str {
        "Bearer"
    }

    FUNCTION validate(&self) -> Result<(), GroqError> {
        LET key = self.api_key.expose_secret()

        IF key.is_empty() {
            RETURN Err(GroqError::AuthenticationError {
                message: "API key cannot be empty".to_string(),
                api_key_hint: None,
            })
        }

        // Groq keys typically start with "gsk_"
        IF !key.starts_with("gsk_") {
            tracing::warn!(
                "API key does not match expected Groq format (gsk_*), key_hint={}",
                self.key_hint()
            )
        }

        Ok(())
    }
}
```

### 5.3 API Key Auth (TypeScript)

```typescript
// auth/api-key.ts

import { SecretString } from 'primitives/types';
import { GroqError } from '../errors';

/**
 * Authentication provider interface
 */
interface AuthProvider {
    applyAuth(headers: Record<string, string>): void;
    scheme(): string;
    validate(): void;
}

/**
 * API key authentication
 */
class ApiKeyAuth implements AuthProvider {
    private readonly apiKey: SecretString;

    constructor(apiKey: SecretString) {
        this.apiKey = apiKey;
    }

    /**
     * Apply authentication to headers
     */
    applyAuth(headers: Record<string, string>): void {
        headers['Authorization'] = `Bearer ${this.apiKey.expose()}`;
    }

    /**
     * Get authentication scheme
     */
    scheme(): string {
        return 'Bearer';
    }

    /**
     * Validate credentials
     */
    validate(): void {
        const key = this.apiKey.expose();

        IF (key.length === 0) THEN
            THROW new GroqError({
                code: 'authentication_error',
                message: 'API key cannot be empty',
            });
        END IF

        // Groq keys typically start with "gsk_"
        IF (!key.startsWith('gsk_')) THEN
            console.warn('API key does not match expected Groq format (gsk_*)');
        END IF
    }

    /**
     * Get hint for debugging
     */
    keyHint(): string {
        const key = this.apiKey.expose();
        IF (key.length > 4) THEN
            return `...${key.slice(-4)}`;
        END IF
        return '****';
    }
}

export { AuthProvider, ApiKeyAuth };
```

---

## 6. Resilience Orchestrator

### 6.1 Orchestrator (Rust)

```rust
// resilience/orchestrator.rs

use primitives::{
    retry::{RetryPolicy, RetryConfig},
    circuit_breaker::{CircuitBreaker, CircuitBreakerConfig, CircuitState},
};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Resilience orchestrator coordinates retry and circuit breaker
STRUCT ResilienceOrchestrator {
    retry_policy: RetryPolicy,
    circuit_breaker: Arc<RwLock<CircuitBreaker>>,
}

IMPL ResilienceOrchestrator {
    /// Create new orchestrator
    FUNCTION new(
        retry_config: RetryConfig,
        circuit_breaker_config: CircuitBreakerConfig,
    ) -> Self {
        Self {
            retry_policy: RetryPolicy::new(retry_config),
            circuit_breaker: Arc::new(RwLock::new(
                CircuitBreaker::new(circuit_breaker_config)
            )),
        }
    }

    /// Execute operation with resilience
    ASYNC FUNCTION execute<F, T, E>(&self, operation: F) -> Result<T, GroqError>
    WHERE
        F: Fn() -> Future<Output = Result<T, E>> + Send,
        E: Into<GroqError>,
    {
        // Check circuit breaker state
        {
            LET cb = self.circuit_breaker.read().await
            IF cb.state() == CircuitState::Open {
                RETURN Err(GroqError::ServerError {
                    message: "Circuit breaker is open".to_string(),
                    status_code: 503,
                    request_id: None,
                })
            }
        }

        LET mut last_error: Option<GroqError> = None
        LET mut attempts = 0

        LOOP {
            attempts += 1

            // Execute operation
            MATCH operation().await {
                Ok(result) => {
                    // Record success
                    self.circuit_breaker.write().await.record_success()
                    RETURN Ok(result)
                },
                Err(e) => {
                    LET error: GroqError = e.into()

                    // Record failure
                    self.circuit_breaker.write().await.record_failure()

                    // Check if retryable
                    IF !error.is_retryable() {
                        RETURN Err(error)
                    }

                    // Check retry policy
                    IF !self.retry_policy.should_retry(attempts) {
                        RETURN Err(error)
                    }

                    // Calculate delay
                    LET delay = self.retry_policy.delay_for_attempt(attempts)

                    // Log retry
                    tracing::warn!(
                        attempt = attempts,
                        delay_ms = delay.as_millis(),
                        error = %error,
                        "Retrying after error"
                    )

                    // Wait before retry
                    tokio::time::sleep(delay).await

                    last_error = Some(error)
                }
            }
        }
    }

    /// Execute with custom retry decision
    ASYNC FUNCTION execute_with_retry_after<F, T, E>(
        &self,
        operation: F,
        retry_after: Option<Duration>,
    ) -> Result<T, GroqError>
    WHERE
        F: Fn() -> Future<Output = Result<T, E>> + Send,
        E: Into<GroqError>,
    {
        // If retry_after is specified, use it instead of backoff
        IF LET Some(delay) = retry_after {
            tokio::time::sleep(delay).await
        }

        self.execute(operation).await
    }

    /// Get circuit breaker state
    ASYNC FUNCTION circuit_state(&self) -> CircuitState {
        self.circuit_breaker.read().await.state()
    }

    /// Reset circuit breaker (for testing)
    ASYNC FUNCTION reset_circuit(&self) {
        self.circuit_breaker.write().await.reset()
    }
}
```

### 6.2 Orchestrator (TypeScript)

```typescript
// resilience/orchestrator.ts

import { RetryPolicy, RetryConfig } from 'primitives/retry';
import { CircuitBreaker, CircuitBreakerConfig, CircuitState } from 'primitives/circuit-breaker';
import { GroqError } from '../errors';

/**
 * Resilience orchestrator
 */
class ResilienceOrchestrator {
    private readonly retryPolicy: RetryPolicy;
    private readonly circuitBreaker: CircuitBreaker;

    constructor(
        retryConfig: RetryConfig,
        circuitBreakerConfig: CircuitBreakerConfig,
    ) {
        this.retryPolicy = new RetryPolicy(retryConfig);
        this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
    }

    /**
     * Execute operation with resilience
     */
    async execute<T>(operation: () => Promise<T>): Promise<T> {
        // Check circuit breaker
        IF (this.circuitBreaker.state === CircuitState.Open) THEN
            THROW new GroqError({
                code: 'server_error',
                message: 'Circuit breaker is open',
                statusCode: 503,
            });
        END IF

        let lastError: GroqError | undefined;
        let attempts = 0;

        WHILE (true) {
            attempts++;

            TRY {
                const result = await operation();
                this.circuitBreaker.recordSuccess();
                return result;
            } CATCH (error) {
                const groqError = error instanceof GroqError
                    ? error
                    : new GroqError({ code: 'unknown_error', message: String(error) });

                this.circuitBreaker.recordFailure();

                IF (!groqError.isRetryable()) THEN
                    THROW groqError;
                END IF

                IF (!this.retryPolicy.shouldRetry(attempts)) THEN
                    THROW groqError;
                END IF

                const delay = this.retryPolicy.delayForAttempt(attempts);

                console.warn(
                    `Retrying after error (attempt ${attempts}, delay ${delay}ms):`,
                    groqError.message
                );

                await this.sleep(delay);
                lastError = groqError;
            }
        }
    }

    /**
     * Execute with retry-after header
     */
    async executeWithRetryAfter<T>(
        operation: () => Promise<T>,
        retryAfterMs?: number,
    ): Promise<T> {
        IF (retryAfterMs !== undefined) THEN
            await this.sleep(retryAfterMs);
        END IF

        return this.execute(operation);
    }

    /**
     * Get circuit state
     */
    get circuitState(): CircuitState {
        return this.circuitBreaker.state;
    }

    /**
     * Reset circuit (for testing)
     */
    resetCircuit(): void {
        this.circuitBreaker.reset();
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export { ResilienceOrchestrator };
```

---

## 7. Streaming Infrastructure

### 7.1 SSE Parser (Rust)

```rust
// transport/streaming.rs

use futures::{Stream, StreamExt};
use pin_project::pin_project;

/// SSE event
STRUCT SseEvent {
    event: Option<String>,
    data: String,
    id: Option<String>,
    retry: Option<u64>,
}

/// SSE parser that converts byte stream to events
#[pin_project]
STRUCT SseParser<S> {
    #[pin]
    stream: S,
    buffer: String,
    current_event: SseEventBuilder,
}

STRUCT SseEventBuilder {
    event: Option<String>,
    data: Vec<String>,
    id: Option<String>,
    retry: Option<u64>,
}

IMPL SseEventBuilder {
    FUNCTION new() -> Self {
        Self {
            event: None,
            data: Vec::new(),
            id: None,
            retry: None,
        }
    }

    FUNCTION build(self) -> Option<SseEvent> {
        IF self.data.is_empty() {
            RETURN None
        }

        Some(SseEvent {
            event: self.event,
            data: self.data.join("\n"),
            id: self.id,
            retry: self.retry,
        })
    }

    FUNCTION reset(&mut self) {
        self.event = None;
        self.data.clear();
        self.id = None;
        self.retry = None;
    }
}

IMPL<S> SseParser<S>
WHERE
    S: Stream<Item = Result<Bytes, TransportError>>,
{
    FUNCTION new(stream: S) -> Self {
        Self {
            stream,
            buffer: String::new(),
            current_event: SseEventBuilder::new(),
        }
    }

    FUNCTION parse_line(&mut self, line: &str) -> Option<SseEvent> {
        // Empty line signals end of event
        IF line.is_empty() {
            LET event = std::mem::replace(
                &mut self.current_event,
                SseEventBuilder::new(),
            ).build()
            RETURN event
        }

        // Comment line
        IF line.starts_with(':') {
            RETURN None
        }

        // Parse field: value
        LET (field, value) = IF LET Some(colon_pos) = line.find(':') {
            LET field = &line[..colon_pos]
            LET value = line[colon_pos + 1..].trim_start()
            (field, value)
        } ELSE {
            (line, "")
        }

        MATCH field {
            "event" => self.current_event.event = Some(value.to_string()),
            "data" => self.current_event.data.push(value.to_string()),
            "id" => self.current_event.id = Some(value.to_string()),
            "retry" => {
                IF LET Ok(ms) = value.parse::<u64>() {
                    self.current_event.retry = Some(ms)
                }
            },
            _ => {} // Ignore unknown fields
        }

        None
    }
}

IMPL<S> Stream FOR SseParser<S>
WHERE
    S: Stream<Item = Result<Bytes, TransportError>> + Unpin,
{
    TYPE Item = Result<SseEvent, GroqError>;

    FUNCTION poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        LET this = self.project()

        LOOP {
            // Check buffer for complete lines
            IF LET Some(newline_pos) = this.buffer.find('\n') {
                LET line = this.buffer[..newline_pos].trim_end_matches('\r').to_string()
                *this.buffer = this.buffer[newline_pos + 1..].to_string()

                IF LET Some(event) = this.parse_line(&line) {
                    RETURN Poll::Ready(Some(Ok(event)))
                }
                CONTINUE
            }

            // Need more data
            MATCH this.stream.poll_next(cx) {
                Poll::Ready(Some(Ok(bytes))) => {
                    MATCH String::from_utf8(bytes.to_vec()) {
                        Ok(text) => this.buffer.push_str(&text),
                        Err(e) => RETURN Poll::Ready(Some(Err(GroqError::StreamError {
                            message: format!("Invalid UTF-8 in stream: {}", e),
                            partial_content: None,
                        }))),
                    }
                },
                Poll::Ready(Some(Err(e))) => {
                    RETURN Poll::Ready(Some(Err(GroqError::NetworkError {
                        message: e.to_string(),
                        cause: None,
                    })))
                },
                Poll::Ready(None) => {
                    // Stream ended - flush any remaining event
                    IF !this.buffer.is_empty() {
                        LET line = std::mem::take(this.buffer)
                        IF LET Some(event) = this.parse_line(&line) {
                            RETURN Poll::Ready(Some(Ok(event)))
                        }
                    }
                    RETURN Poll::Ready(None)
                },
                Poll::Pending => RETURN Poll::Pending,
            }
        }
    }
}
```

### 7.2 Chat Stream (Rust)

```rust
// transport/streaming.rs (continued)

/// Chat completion stream
#[pin_project]
STRUCT ChatStream {
    #[pin]
    sse_parser: SseParser<StreamingResponse>,
    done: bool,
    accumulated_content: String,
}

IMPL ChatStream {
    FUNCTION new(response: StreamingResponse) -> Result<Self, GroqError> {
        // Verify status code
        IF response.status != 200 {
            RETURN Err(GroqError::ServerError {
                message: format!("Unexpected status code: {}", response.status),
                status_code: response.status,
                request_id: response.headers.get("x-request-id").cloned(),
            })
        }

        Ok(Self {
            sse_parser: SseParser::new(response.stream),
            done: false,
            accumulated_content: String::new(),
        })
    }

    /// Collect all chunks into complete response
    ASYNC FUNCTION collect(self) -> Result<ChatResponse, GroqError> {
        LET mut chunks = Vec::new()

        pin_mut!(self)

        WHILE LET Some(chunk) = self.next().await {
            chunks.push(chunk?)
        }

        // Build response from chunks
        ChatResponse::from_chunks(chunks)
    }
}

IMPL Stream FOR ChatStream {
    TYPE Item = Result<ChatChunk, GroqError>;

    FUNCTION poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        LET this = self.project()

        IF *this.done {
            RETURN Poll::Ready(None)
        }

        MATCH this.sse_parser.poll_next(cx) {
            Poll::Ready(Some(Ok(event))) => {
                // Check for done marker
                IF event.data == "[DONE]" {
                    *this.done = true
                    RETURN Poll::Ready(None)
                }

                // Parse chunk
                MATCH serde_json::from_str::<ChatChunk>(&event.data) {
                    Ok(chunk) => {
                        // Accumulate content
                        IF LET Some(content) = chunk.choices.first()
                            .and_then(|c| c.delta.content.as_ref())
                        {
                            this.accumulated_content.push_str(content)
                        }
                        Poll::Ready(Some(Ok(chunk)))
                    },
                    Err(e) => Poll::Ready(Some(Err(GroqError::StreamError {
                        message: format!("Failed to parse chunk: {}", e),
                        partial_content: Some(this.accumulated_content.clone()),
                    }))),
                }
            },
            Poll::Ready(Some(Err(e))) => Poll::Ready(Some(Err(e))),
            Poll::Ready(None) => {
                *this.done = true
                Poll::Ready(None)
            },
            Poll::Pending => Poll::Pending,
        }
    }
}
```

### 7.3 Chat Stream (TypeScript)

```typescript
// transport/streaming.ts

import { ChatChunk, ChatResponse } from '../types/chat';
import { GroqError } from '../errors';

/**
 * SSE event
 */
interface SseEvent {
    event?: string;
    data: string;
    id?: string;
    retry?: number;
}

/**
 * SSE parser
 */
class SseParser {
    private buffer = '';
    private currentEvent: Partial<SseEvent> = {};
    private currentData: string[] = [];

    /**
     * Parse incoming chunk and yield events
     */
    *parse(chunk: string): Generator<SseEvent> {
        this.buffer += chunk;

        WHILE (true) {
            const newlinePos = this.buffer.indexOf('\n');
            IF (newlinePos === -1) THEN
                break;
            END IF

            const line = this.buffer.slice(0, newlinePos).replace(/\r$/, '');
            this.buffer = this.buffer.slice(newlinePos + 1);

            const event = this.parseLine(line);
            IF (event) THEN
                yield event;
            END IF
        }
    }

    private parseLine(line: string): SseEvent | null {
        // Empty line = end of event
        IF (line === '') THEN
            IF (this.currentData.length > 0) THEN
                const event: SseEvent = {
                    event: this.currentEvent.event,
                    data: this.currentData.join('\n'),
                    id: this.currentEvent.id,
                    retry: this.currentEvent.retry,
                };
                this.currentEvent = {};
                this.currentData = [];
                return event;
            END IF
            return null;
        END IF

        // Comment
        IF (line.startsWith(':')) THEN
            return null;
        END IF

        // Field: value
        const colonPos = line.indexOf(':');
        const field = colonPos !== -1 ? line.slice(0, colonPos) : line;
        const value = colonPos !== -1 ? line.slice(colonPos + 1).trimStart() : '';

        SWITCH (field) {
            CASE 'event':
                this.currentEvent.event = value;
                break;
            CASE 'data':
                this.currentData.push(value);
                break;
            CASE 'id':
                this.currentEvent.id = value;
                break;
            CASE 'retry':
                const retry = parseInt(value, 10);
                IF (!isNaN(retry)) THEN
                    this.currentEvent.retry = retry;
                END IF
                break;
        }

        return null;
    }

    /**
     * Flush remaining event
     */
    flush(): SseEvent | null {
        IF (this.currentData.length > 0) THEN
            const event: SseEvent = {
                event: this.currentEvent.event,
                data: this.currentData.join('\n'),
                id: this.currentEvent.id,
                retry: this.currentEvent.retry,
            };
            this.currentEvent = {};
            this.currentData = [];
            return event;
        END IF
        return null;
    }
}

/**
 * Chat completion stream
 */
class ChatStream implements AsyncIterable<ChatChunk> {
    private readonly stream: AsyncIterable<Uint8Array>;
    private accumulatedContent = '';

    constructor(stream: AsyncIterable<Uint8Array>) {
        this.stream = stream;
    }

    async *[Symbol.asyncIterator](): AsyncIterator<ChatChunk> {
        const parser = new SseParser();
        const decoder = new TextDecoder();

        FOR await (const chunk of this.stream) {
            const text = decoder.decode(chunk, { stream: true });

            FOR (const event of parser.parse(text)) {
                IF (event.data === '[DONE]') THEN
                    return;
                END IF

                TRY {
                    const chatChunk = JSON.parse(event.data) as ChatChunk;

                    // Accumulate content
                    const content = chatChunk.choices[0]?.delta?.content;
                    IF (content) THEN
                        this.accumulatedContent += content;
                    END IF

                    yield chatChunk;
                } CATCH (error) {
                    THROW new GroqError({
                        code: 'stream_error',
                        message: `Failed to parse chunk: ${error}`,
                        partialContent: this.accumulatedContent,
                    });
                }
            }
        }

        // Flush any remaining event
        const finalEvent = parser.flush();
        IF (finalEvent && finalEvent.data !== '[DONE]') THEN
            TRY {
                yield JSON.parse(finalEvent.data) as ChatChunk;
            } CATCH (error) {
                // Ignore parse errors at end
            }
        END IF
    }

    /**
     * Collect all chunks into response
     */
    async collect(): Promise<ChatResponse> {
        const chunks: ChatChunk[] = [];

        FOR await (const chunk of this) {
            chunks.push(chunk);
        }

        return ChatResponse.fromChunks(chunks);
    }
}

export { SseParser, SseEvent, ChatStream };
```

---

## 8. Rate Limit Manager

### 8.1 Rate Limit Manager (Rust)

```rust
// resilience/rate_limit.rs

use std::time::{Duration, Instant};
use primitives::rate_limit::RateLimitConfig;

/// Rate limit status from Groq headers
STRUCT RateLimitStatus {
    /// Request limits
    requests_limit: Option<u32>,
    requests_remaining: Option<u32>,
    requests_reset: Option<Duration>,

    /// Token limits
    tokens_limit: Option<u32>,
    tokens_remaining: Option<u32>,
    tokens_reset: Option<Duration>,

    /// Last update time
    updated_at: Instant,
}

/// Rate limit manager tracks and applies rate limits
STRUCT RateLimitManager {
    config: Option<RateLimitConfig>,
    status: RateLimitStatus,
}

IMPL RateLimitManager {
    FUNCTION new(config: Option<RateLimitConfig>) -> Self {
        Self {
            config,
            status: RateLimitStatus {
                requests_limit: None,
                requests_remaining: None,
                requests_reset: None,
                tokens_limit: None,
                tokens_remaining: None,
                tokens_reset: None,
                updated_at: Instant::now(),
            },
        }
    }

    /// Update status from response headers
    FUNCTION update_from_headers(&mut self, headers: &HashMap<String, String>) {
        IF LET Some(v) = headers.get("x-ratelimit-limit-requests") {
            self.status.requests_limit = v.parse().ok()
        }

        IF LET Some(v) = headers.get("x-ratelimit-remaining-requests") {
            self.status.requests_remaining = v.parse().ok()
        }

        IF LET Some(v) = headers.get("x-ratelimit-reset-requests") {
            self.status.requests_reset = parse_duration(v)
        }

        IF LET Some(v) = headers.get("x-ratelimit-limit-tokens") {
            self.status.tokens_limit = v.parse().ok()
        }

        IF LET Some(v) = headers.get("x-ratelimit-remaining-tokens") {
            self.status.tokens_remaining = v.parse().ok()
        }

        IF LET Some(v) = headers.get("x-ratelimit-reset-tokens") {
            self.status.tokens_reset = parse_duration(v)
        }

        self.status.updated_at = Instant::now()
    }

    /// Check if we should wait before next request
    FUNCTION should_wait(&self) -> Option<Duration> {
        // Check if we're near the limit
        IF LET (Some(remaining), Some(reset)) = (
            self.status.requests_remaining,
            self.status.requests_reset,
        ) {
            IF remaining == 0 {
                RETURN Some(reset)
            }

            // Proactive throttling when below 10% capacity
            IF LET Some(limit) = self.status.requests_limit {
                IF remaining < limit / 10 {
                    // Wait a fraction of reset time
                    RETURN Some(reset / 2)
                }
            }
        }

        None
    }

    /// Get current status
    FUNCTION status(&self) -> RateLimitStatus {
        self.status.clone()
    }

    /// Check if rate limited
    FUNCTION is_rate_limited(&self) -> bool {
        self.status.requests_remaining == Some(0) ||
        self.status.tokens_remaining == Some(0)
    }
}

/// Parse duration from Groq format (e.g., "2s", "100ms")
FUNCTION parse_duration(s: &str) -> Option<Duration> {
    IF s.ends_with("ms") {
        s[..s.len()-2].parse::<u64>().ok().map(Duration::from_millis)
    } ELSE IF s.ends_with('s') {
        s[..s.len()-1].parse::<u64>().ok().map(Duration::from_secs)
    } ELSE IF s.ends_with('m') {
        s[..s.len()-1].parse::<u64>().ok().map(|m| Duration::from_secs(m * 60))
    } ELSE {
        s.parse::<u64>().ok().map(Duration::from_secs)
    }
}
```

### 8.2 Rate Limit Manager (TypeScript)

```typescript
// resilience/rate-limit.ts

import { RateLimitConfig } from 'primitives/rate-limit';

/**
 * Rate limit status from Groq headers
 */
interface RateLimitStatus {
    requestsLimit?: number;
    requestsRemaining?: number;
    requestsResetMs?: number;
    tokensLimit?: number;
    tokensRemaining?: number;
    tokensResetMs?: number;
    updatedAt: number;
}

/**
 * Rate limit manager
 */
class RateLimitManager {
    private readonly config?: RateLimitConfig;
    private _status: RateLimitStatus = {
        updatedAt: Date.now(),
    };

    constructor(config?: RateLimitConfig) {
        this.config = config;
    }

    /**
     * Update status from response headers
     */
    updateFromHeaders(headers: Record<string, string>): void {
        const reqLimit = headers['x-ratelimit-limit-requests'];
        IF (reqLimit) THEN
            this._status.requestsLimit = parseInt(reqLimit, 10);
        END IF

        const reqRemaining = headers['x-ratelimit-remaining-requests'];
        IF (reqRemaining) THEN
            this._status.requestsRemaining = parseInt(reqRemaining, 10);
        END IF

        const reqReset = headers['x-ratelimit-reset-requests'];
        IF (reqReset) THEN
            this._status.requestsResetMs = this.parseDuration(reqReset);
        END IF

        const tokLimit = headers['x-ratelimit-limit-tokens'];
        IF (tokLimit) THEN
            this._status.tokensLimit = parseInt(tokLimit, 10);
        END IF

        const tokRemaining = headers['x-ratelimit-remaining-tokens'];
        IF (tokRemaining) THEN
            this._status.tokensRemaining = parseInt(tokRemaining, 10);
        END IF

        const tokReset = headers['x-ratelimit-reset-tokens'];
        IF (tokReset) THEN
            this._status.tokensResetMs = this.parseDuration(tokReset);
        END IF

        this._status.updatedAt = Date.now();
    }

    /**
     * Check if we should wait
     */
    shouldWait(): number | undefined {
        IF (this._status.requestsRemaining === 0 && this._status.requestsResetMs) THEN
            return this._status.requestsResetMs;
        END IF

        // Proactive throttling at 10% capacity
        IF (
            this._status.requestsLimit !== undefined &&
            this._status.requestsRemaining !== undefined &&
            this._status.requestsResetMs !== undefined
        ) THEN
            IF (this._status.requestsRemaining < this._status.requestsLimit / 10) THEN
                return Math.floor(this._status.requestsResetMs / 2);
            END IF
        END IF

        return undefined;
    }

    /**
     * Get current status
     */
    status(): RateLimitStatus {
        return { ...this._status };
    }

    /**
     * Check if rate limited
     */
    isRateLimited(): boolean {
        return this._status.requestsRemaining === 0 ||
               this._status.tokensRemaining === 0;
    }

    /**
     * Parse duration string
     */
    private parseDuration(s: string): number {
        IF (s.endsWith('ms')) THEN
            return parseInt(s.slice(0, -2), 10);
        ELSE IF (s.endsWith('s')) THEN
            return parseInt(s.slice(0, -1), 10) * 1000;
        ELSE IF (s.endsWith('m')) THEN
            return parseInt(s.slice(0, -1), 10) * 60 * 1000;
        ELSE THEN
            return parseInt(s, 10) * 1000;
        END IF
    }
}

export { RateLimitManager, RateLimitStatus };
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-GROQ-PSEUDO-001 |
| Version | 1.0.0 |
| Created | 2025-01-15 |
| Last Modified | 2025-01-15 |
| Author | SPARC Methodology |
| Status | Draft |
| Part | 1 of 2 |

---

**End of Pseudocode Part 1**

*Continue to pseudocode-groq-2.md for service implementations*
