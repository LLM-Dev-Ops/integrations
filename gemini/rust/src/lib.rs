//! # Google Gemini API Client
//!
//! Production-ready Rust client for the Google Gemini (Generative AI) API.
//!
//! ## Features
//!
//! - Full API coverage: Content Generation, Embeddings, Models, Files, Cached Content
//! - Streaming support with chunked JSON response parsing
//! - Multi-modal input support (text, images, audio, video, documents)
//! - Tool/Function calling and code execution
//! - Google Search grounding
//! - Built-in resilience patterns (retry, rate limiting, circuit breaker)
//! - Comprehensive observability (tracing, logging, metrics)
//! - Secure credential handling with `SecretString`
//! - Type-safe request/response models
//! - London-School TDD with mock support
//!
//! ## Quick Start
//!
//! ```rust,no_run
//! use integrations_gemini::{create_client, GeminiConfig};
//! use secrecy::SecretString;
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     // Create client from configuration
//!     let config = GeminiConfig::builder()
//!         .api_key(SecretString::new("your-api-key".into()))
//!         .build()?;
//!
//!     let client = create_client(config)?;
//!
//!     // Or create from environment variables
//!     // let client = create_client_from_env()?;
//!
//!     Ok(())
//! }
//! ```
//!
//! ## Module Organization
//!
//! - `client` - Main client interface and factory functions
//! - `config` - Configuration types and builder
//! - `auth` - Authentication and API key management
//! - `transport` - HTTP transport layer and streaming
//! - `errors` - Error types and taxonomy
//! - `types` - Core types (Content, Part, Role, etc.)
//! - `services` - Service implementations (content, embeddings, models, files, cached_content)

#![warn(missing_docs)]
#![warn(clippy::all)]
#![allow(dead_code)] // Allow during initial development

// Public modules
pub mod auth;
pub mod client;
pub mod config;
pub mod error;
pub mod observability;
pub mod resilience;
pub mod services;
pub mod streaming;
pub mod transport;
pub mod types;

// Development/testing modules - always available for integration tests
pub mod mocks;
pub mod fixtures;

// Re-exports for convenience
pub use auth::{ApiKeyAuthManager, AuthManager};
pub use client::{
    create_client, create_client_from_env,
    GeminiClient, GeminiClientFactory, GeminiClientImpl, GeminiClientBuilder
};
pub use config::{
    AuthMethod, CircuitBreakerConfig, GeminiConfig, GeminiConfigBuilder, LogLevel,
    RateLimitConfig, RetryConfig, DEFAULT_API_VERSION, DEFAULT_BASE_URL,
    DEFAULT_CONNECT_TIMEOUT_SECS, DEFAULT_MAX_RETRIES, DEFAULT_TIMEOUT_SECS,
};
pub use error::{
    // Main error types
    GeminiError,
    GeminiResult,
    // Error categories
    AuthenticationError,
    ConfigurationError,
    ContentError,
    NetworkError,
    RateLimitError,
    RequestError,
    ResourceError,
    ResponseError,
    ServerError,
    ValidationDetail,
    // Error mapping utilities
    map_http_status,
    map_api_error,
};
pub use transport::{
    ChunkedStream, HttpMethod, HttpRequest, HttpResponse, HttpTransport, TransportError,
    RequestBuilder, ResponseParser,
};

// Type re-exports
pub use types::{
    // Content types
    Blob, Content, Part, Role,
    FileData, FunctionCall, FunctionResponse,
    ExecutableCode, CodeExecutionResult,
    // Safety types
    HarmBlockThreshold, HarmCategory, HarmProbability, SafetyRating, SafetySetting,
    // Generation types
    GenerationConfig, FinishReason, UsageMetadata,
    Candidate, CitationMetadata, CitationSource, GroundingMetadata,
    // Tool types
    Tool, ToolConfig, FunctionDeclaration, FunctionCallingConfig, FunctionCallingMode,
    CodeExecution, GoogleSearchRetrieval,
    // Request/Response types
    GenerateContentRequest, GenerateContentResponse,
    CountTokensRequest, CountTokensResponse,
    // Embedding types
    EmbedContentRequest, EmbedContentResponse, BatchEmbedContentsResponse,
    Embedding, TaskType,
    // Model types
    Model, ListModelsParams, ListModelsResponse,
    // File types
    File, FileState, UploadFileRequest, ListFilesParams, ListFilesResponse,
    // Cached content types
    CachedContent, CachedContentUsageMetadata,
    CreateCachedContentRequest, UpdateCachedContentRequest,
    ListCachedContentsParams, ListCachedContentsResponse,
};

// Service re-exports
pub use services::{
    CachedContentService, ContentService, ContentStream, EmbeddingsService, FilesService,
    ModelsService,
};

// Streaming re-exports
pub use streaming::{GeminiChunkParser, StreamAccumulator};

// Observability re-exports
pub use observability::{
    // Logging
    Logger, StructuredLogger, DefaultLogger,
    // Tracing
    Tracer, Span, SpanStatus, TracingTracer, TracingSpan, DefaultTracer,
    // Metrics
    MetricsRecorder, GeminiMetrics, TracingMetricsRecorder, DefaultMetricsRecorder,
    // Factory functions
    create_default_stack, create_noop_stack,
};

// Resilience re-exports
pub use resilience::{
    ResilienceOrchestrator, ResilienceConfig,
    RetryExecutor,
    CircuitBreaker, CircuitState,
    RateLimiter,
};
