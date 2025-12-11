//! # Cohere API Client
//!
//! Production-ready Rust client for the Cohere API.
//!
//! ## Features
//!
//! - Full API coverage: Chat, Generate, Embed, Rerank, Classify, Summarize, Tokenize
//! - Management APIs: Models, Datasets, Connectors, Fine-tuning
//! - Streaming support with Server-Sent Events (SSE)
//! - Built-in resilience patterns (retry, rate limiting, circuit breaker)
//! - Comprehensive observability (tracing, logging, metrics)
//! - Secure credential handling with `SecretString`
//! - Type-safe request/response models
//! - London-School TDD with mock support
//!
//! ## Quick Start
//!
//! ```rust,no_run
//! use integrations_cohere::{create_client, CohereConfig};
//! use secrecy::SecretString;
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     // Create client from configuration
//!     let config = CohereConfig::builder()
//!         .api_key(SecretString::new("your-api-key".to_string()))
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
//! - `auth` - Authentication and header management
//! - `transport` - HTTP transport layer and SSE streaming
//! - `errors` - Error types and taxonomy
//! - `types` - Common types (Usage, EmbeddingType, etc.)
//! - `resilience` - Retry, circuit breaker, rate limiting
//! - `observability` - Tracing, logging, metrics
//! - `services` - API service implementations

#![warn(missing_docs)]
#![warn(clippy::all)]
#![allow(dead_code)] // Allow during initial development

// Public modules
pub mod auth;
pub mod client;
pub mod config;
pub mod errors;
pub mod observability;
pub mod resilience;
pub mod services;
pub mod transport;
pub mod types;

// Development/testing modules
#[cfg(test)]
pub mod mocks;
#[cfg(test)]
pub mod fixtures;

// Re-exports for convenience
pub use auth::{AuthManager, BearerAuthManager};
pub use client::{create_client, create_client_from_env, CohereClient, CohereClientImpl};
pub use config::{CohereConfig, CohereConfigBuilder};
pub use errors::{CohereError, CohereResult};
pub use observability::{
    DefaultTracer, InMemoryMetricsCollector, LogFormat, LogLevel, LoggingConfig, MetricsCollector,
    NoopMetricsCollector, NoopTracer, RequestSpan, SpanStatus, Tracer,
};
pub use resilience::{
    CircuitBreaker, CircuitBreakerConfig, CircuitState, DefaultResilienceOrchestrator,
    RateLimitConfig, RateLimiter, ResilienceConfig, ResilienceOrchestrator, RetryConfig,
};
pub use transport::{HttpTransport, ReqwestTransport};
pub use types::{
    ApiMeta, BilledUnits, EmbeddingType, GenerationId, InputType, TruncateOption, Usage,
};

// Service re-exports
pub use services::chat::{
    ChatMessage, ChatRequest, ChatResponse, ChatService, ChatServiceImpl, ChatStream,
    ChatStreamEvent, Citation, Connector as ChatConnector, Document, SearchQuery, SearchResult,
    Tool, ToolCall, ToolResult,
};
pub use services::generate::{
    GenerateRequest, GenerateResponse, GenerateService, GenerateServiceImpl, GenerateStream,
    GenerateStreamEvent, Generation, Generations, TokenLikelihood,
};
pub use services::embed::{
    EmbedRequest, EmbedResponse, EmbedService, EmbedServiceImpl, Embedding, EmbedJob,
    EmbedJobRequest, EmbedJobStatus,
};
pub use services::rerank::{
    RerankDocument, RerankRequest, RerankResponse, RerankResult, RerankService, RerankServiceImpl,
};
pub use services::classify::{
    ClassificationResult, ClassifyExample, ClassifyRequest, ClassifyResponse, ClassifyService,
    ClassifyServiceImpl, LabelConfidence,
};
pub use services::summarize::{
    SummarizeExtractiveness, SummarizeFormat, SummarizeLength, SummarizeRequest,
    SummarizeResponse, SummarizeService, SummarizeServiceImpl,
};
pub use services::tokenize::{
    DetokenizeRequest, DetokenizeResponse, TokenizeRequest, TokenizeResponse, TokenizeService,
    TokenizeServiceImpl,
};
pub use services::models::{ModelInfo, ModelListResponse, ModelsService, ModelsServiceImpl};

#[cfg(feature = "datasets")]
pub use services::datasets::{
    CreateDatasetRequest, Dataset, DatasetPart, DatasetStatus, DatasetType, DatasetUsage,
    DatasetsService, DatasetsServiceImpl,
};

#[cfg(feature = "connectors")]
pub use services::connectors::{
    Connector, ConnectorAuthType, ConnectorOAuth, ConnectorServiceAccount, ConnectorsService,
    ConnectorsServiceImpl, CreateConnectorRequest, UpdateConnectorRequest,
};

#[cfg(feature = "finetune")]
pub use services::finetune::{
    CreateFinetuneRequest, FineTuneHyperparameters, FineTuneSettings, FineTuneStatus,
    FinetuneModel, FinetuneService, FinetuneServiceImpl, ListFinetuneResponse,
};

/// The default Cohere API base URL
pub const DEFAULT_BASE_URL: &str = "https://api.cohere.ai";

/// The default API version
pub const DEFAULT_API_VERSION: &str = "2024-01-01";

/// The default request timeout (5 minutes)
pub const DEFAULT_TIMEOUT_SECS: u64 = 300;

/// The default maximum number of retry attempts
pub const DEFAULT_MAX_RETRIES: u32 = 3;
