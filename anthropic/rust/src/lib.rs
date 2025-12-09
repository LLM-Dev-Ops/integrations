//! # Anthropic Claude API Client
//!
//! Production-ready Rust client for the Anthropic Claude API.
//!
//! ## Features
//!
//! - Full API coverage: Messages, Models, Token Counting, Batches, Admin APIs
//! - Streaming support with Server-Sent Events (SSE)
//! - Beta features: Extended thinking, PDF support, Prompt caching, Computer use
//! - Built-in resilience patterns (retry, rate limiting, circuit breaker)
//! - Comprehensive observability (tracing, logging, metrics)
//! - Secure credential handling with `SecretString`
//! - Type-safe request/response models
//! - London-School TDD with mock support
//!
//! ## Quick Start
//!
//! ```rust,no_run
//! use integrations_anthropic::{create_client, AnthropicConfig};
//! use secrecy::SecretString;
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     // Create client from configuration
//!     let config = AnthropicConfig::builder()
//!         .api_key(SecretString::new("sk-ant-...".to_string()))
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
//! - `types` - Common types (Usage, StopReason, Role, etc.)
//! - `mocks` - Mock implementations for testing
//! - `fixtures` - Test fixtures and helper data

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
pub use client::{create_client, create_client_from_env, AnthropicClient, AnthropicClientImpl};
pub use config::{AnthropicConfig, AnthropicConfigBuilder, BetaFeature};
pub use errors::{AnthropicError, AnthropicResult};
pub use observability::{
    DefaultTracer, InMemoryMetricsCollector, LogFormat, LogLevel, LoggingConfig, MetricsCollector,
    NoopMetricsCollector, NoopTracer, RequestSpan, SpanStatus, Tracer,
};
pub use resilience::{
    CircuitBreaker, CircuitBreakerConfig, CircuitState, DefaultResilienceOrchestrator,
    RateLimitConfig, RateLimiter, ResilienceConfig, ResilienceOrchestrator, RetryConfig,
};
pub use transport::{HttpTransport, ReqwestTransport};
pub use types::{Role, StopReason, Usage};

// Service re-exports
pub use services::messages::{
    MessagesService, MessagesServiceImpl, Message, MessageParam, MessageContent,
    ContentBlock, CreateMessageRequest, CountTokensRequest, TokenCount, MessageStream,
};
pub use services::models::{ModelsService, ModelsServiceImpl, ModelInfo, ModelListResponse};

#[cfg(feature = "admin")]
pub use services::admin::{
    // Services
    OrganizationsService, OrganizationsServiceImpl, WorkspacesService, WorkspacesServiceImpl,
    ApiKeysService, ApiKeysServiceImpl, InvitesService, InvitesServiceImpl, UsersService,
    UsersServiceImpl,
    // Types
    Organization, Workspace, WorkspaceMember, WorkspaceMemberRole, ApiKey, ApiKeyWithSecret,
    ApiKeyStatus, Invite, InviteStatus, User,
    // Requests
    UpdateOrganizationRequest, CreateWorkspaceRequest, UpdateWorkspaceRequest,
    AddWorkspaceMemberRequest, UpdateWorkspaceMemberRequest, CreateApiKeyRequest,
    UpdateApiKeyRequest, CreateInviteRequest,
    // List types
    ListParams, ListResponse,
};

#[cfg(feature = "batches")]
pub use services::batches::{
    BatchesService, BatchesServiceImpl, MessageBatch, CreateBatchRequest, BatchRequest,
    BatchListParams, BatchListResponse, BatchResultsResponse, BatchStatus, BatchProcessingStatus,
};

#[cfg(feature = "beta")]
pub use services::beta::{
    // Types
    TokenCountRequest, TokenCountResponse, ComputerTool, ComputerToolType, ComputerToolResult,
    ComputerToolResultContent, ComputerImageSource, SystemPromptWithCache, CacheUsage,
    // Extended Thinking
    ExtendedThinkingExt, extract_thinking_blocks, has_thinking_blocks,
    extract_text_without_thinking, get_extended_thinking_beta_header,
    // PDF Support
    create_pdf_content, create_pdf_content_from_base64, create_cacheable_pdf_content,
    validate_pdf_bytes, validate_pdf_base64, extract_pdf_blocks, get_pdf_support_beta_header,
    // Prompt Caching
    CacheableContent, CacheableSystemPromptBuilder, cacheable_system_prompt,
    cache_last_n_blocks, cache_tools, get_prompt_caching_beta_header,
    // Token Counting
    TokenCountingService, TokenCountingServiceImpl, get_token_counting_beta_header,
    // Computer Use
    create_computer_use_tools, ComputerToolResultBuilder, create_text_result,
    create_screenshot_result, create_error_result, get_computer_use_beta_header,
    validate_screen_dimensions,
};

/// The default Anthropic API base URL
pub const DEFAULT_BASE_URL: &str = "https://api.anthropic.com";

/// The default API version
pub const DEFAULT_API_VERSION: &str = "2023-06-01";

/// The default request timeout (10 minutes for long-running requests)
pub const DEFAULT_TIMEOUT_SECS: u64 = 600;

/// The default maximum number of retry attempts
pub const DEFAULT_MAX_RETRIES: u32 = 3;
