//! AWS Bedrock Integration Module
//!
//! Production-ready, type-safe interface for interacting with AWS Bedrock
//! supporting Amazon Titan, Anthropic Claude, and Meta LLaMA model families.
//!
//! # Features
//!
//! - **Unified API**: Single interface for all model families
//! - **Model Family Support**: Titan (text + embeddings), Claude, LLaMA
//! - **Streaming**: AWS Event Stream parsing for real-time responses
//! - **AWS Signature V4**: Complete signing implementation
//! - **Resilience**: Retry, circuit breaker, rate limiting
//! - **Observability**: Tracing, structured logging
//!
//! # Quick Start
//!
//! ```rust,no_run
//! use aws_bedrock::{BedrockClient, BedrockClientBuilder, Message, UnifiedInvokeRequest};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), aws_bedrock::BedrockError> {
//!     // Create client from environment
//!     let client = BedrockClientBuilder::new()
//!         .from_env()
//!         .build()?;
//!
//!     // Invoke a model
//!     let request = UnifiedInvokeRequest::new(
//!         "amazon.titan-text-express-v1",
//!         vec![Message::user("Hello, how are you?")]
//!     )
//!     .with_max_tokens(100);
//!
//!     let response = client.invoke(request).await?;
//!     println!("Response: {}", response.content);
//!     Ok(())
//! }
//! ```
//!
//! # Model Families
//!
//! ## Amazon Titan
//!
//! ```rust,no_run
//! use aws_bedrock::{BedrockClientBuilder, Message, UnifiedInvokeRequest, TitanEmbedRequest};
//!
//! # async fn example() -> Result<(), aws_bedrock::BedrockError> {
//! let client = BedrockClientBuilder::new().from_env().build()?;
//!
//! // Text generation
//! let response = client.invoke(
//!     UnifiedInvokeRequest::new("amazon.titan-text-express-v1", vec![
//!         Message::user("Explain quantum computing")
//!     ])
//! ).await?;
//!
//! // Embeddings
//! let embed_response = client.embed(
//!     TitanEmbedRequest::new("Hello, world!").with_dimensions(1024),
//!     "amazon.titan-embed-text-v2:0"
//! ).await?;
//! println!("Embedding dimensions: {}", embed_response.embedding.len());
//! # Ok(())
//! # }
//! ```
//!
//! ## Anthropic Claude
//!
//! ```rust,no_run
//! use aws_bedrock::{BedrockClientBuilder, Message, UnifiedInvokeRequest};
//!
//! # async fn example() -> Result<(), aws_bedrock::BedrockError> {
//! let client = BedrockClientBuilder::new().from_env().build()?;
//!
//! let response = client.invoke(
//!     UnifiedInvokeRequest::new(
//!         "anthropic.claude-3-sonnet-20240229-v1:0",
//!         vec![Message::user("Write a haiku about Rust")]
//!     )
//!     .with_system("You are a poetry expert.")
//!     .with_max_tokens(100)
//! ).await?;
//! # Ok(())
//! # }
//! ```
//!
//! ## Meta LLaMA
//!
//! ```rust,no_run
//! use aws_bedrock::{BedrockClientBuilder, Message, UnifiedInvokeRequest};
//!
//! # async fn example() -> Result<(), aws_bedrock::BedrockError> {
//! let client = BedrockClientBuilder::new().from_env().build()?;
//!
//! let response = client.invoke(
//!     UnifiedInvokeRequest::new(
//!         "meta.llama3-70b-instruct-v1:0",
//!         vec![Message::user("What is machine learning?")]
//!     )
//! ).await?;
//! # Ok(())
//! # }
//! ```
//!
//! # Streaming
//!
//! ```rust,no_run
//! use aws_bedrock::{BedrockClient, BedrockClientBuilder, Message, UnifiedInvokeRequest};
//! use futures::StreamExt;
//!
//! # async fn example() -> Result<(), aws_bedrock::BedrockError> {
//! let client = BedrockClientBuilder::new().from_env().build()?;
//!
//! let request = UnifiedInvokeRequest::new(
//!     "anthropic.claude-3-sonnet-20240229-v1:0",
//!     vec![Message::user("Tell me a story")]
//! );
//!
//! let mut stream = client.invoke_stream(request);
//!
//! while let Some(chunk) = stream.next().await {
//!     match chunk {
//!         Ok(c) => print!("{}", c.delta),
//!         Err(e) => eprintln!("Error: {:?}", e),
//!     }
//! }
//! # Ok(())
//! # }
//! ```

#![warn(missing_docs)]
#![warn(rustdoc::missing_crate_level_docs)]
#![deny(unsafe_code)]

pub mod client;
pub mod config;
pub mod credentials;
pub mod error;
pub mod mocks;
pub mod resilience;
pub mod services;
pub mod signing;
pub mod streaming;
pub mod types;

// Re-export main types at crate root

// Client
pub use client::{BedrockClient, BedrockClientBuilder, BedrockClientImpl};

// Configuration
pub use config::{BedrockConfig, BedrockConfigBuilder, RetryConfig, StreamConfig, BEDROCK_REGIONS};

// Credentials
pub use credentials::{
    AwsCredentials, ChainCredentialsProvider, CredentialsProvider, EnvCredentialsProvider,
    ProfileCredentialsProvider, StaticCredentialsProvider,
};

// Errors
pub use error::{
    AuthenticationError, BedrockError, ConfigurationError, CredentialsError, ModelError,
    NetworkError, RateLimitError, RequestError, ServerError, StreamError,
};

// Services
pub use services::{
    ClaudeService, ClaudeStreamState, FamilyRequest, LlamaService, LlamaStreamState,
    ModelsService, TitanService, UnifiedService,
};

// Resilience
pub use resilience::{CircuitBreaker, CircuitBreakerConfig, CircuitState, Resilience, RetryPolicy};

// Signing
pub use signing::{AwsSigner, BedrockSigner, SignedRequest};

// Streaming
pub use streaming::{EventStreamMessage, EventStreamParser, HeaderValue};

// Types
pub use types::{
    // Common types
    detect_llama_version,
    detect_model_family,
    get_model_limits,
    LlamaVersion,
    Message,
    ModelCapabilities,
    ModelFamily,
    ModelLimits,
    StopReason,
    UsageInfo,
    // Request types
    ClaudeMessage,
    ClaudeRequest,
    GetModelRequest,
    LlamaRequest,
    ListModelsRequest,
    TitanEmbedRequest,
    TitanTextConfig,
    TitanTextRequest,
    UnifiedInvokeRequest,
    // Response types
    ClaudeContentBlock,
    ClaudeResponse,
    ClaudeStreamEvent,
    ClaudeUsage,
    GetModelResponse,
    LlamaResponse,
    LlamaStreamChunk,
    ListModelsResponse,
    ModelDetails,
    ModelSummary,
    TitanEmbedResponse,
    TitanStreamChunk,
    TitanTextResponse,
    TitanTextResult,
    UnifiedInvokeResponse,
    UnifiedStreamChunk,
};

/// Create a new Bedrock client from environment variables.
///
/// This will attempt to read configuration from:
/// - `AWS_REGION` / `AWS_DEFAULT_REGION` for region
/// - `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` for credentials
/// - `AWS_SESSION_TOKEN` for temporary credentials
/// - `AWS_ENDPOINT_URL_BEDROCK` / `AWS_ENDPOINT_URL` for custom endpoints
///
/// # Example
///
/// ```rust,no_run
/// let client = aws_bedrock::create_client_from_env()?;
/// # Ok::<(), aws_bedrock::BedrockError>(())
/// ```
pub fn create_client_from_env() -> Result<impl BedrockClient, BedrockError> {
    BedrockClientBuilder::new().from_env().build()
}

/// Create a new Bedrock client with explicit configuration.
///
/// # Example
///
/// ```rust,no_run
/// use aws_bedrock::{BedrockConfig, AwsCredentials};
///
/// let config = BedrockConfig::builder()
///     .region("us-west-2")
///     .build()?;
///
/// let credentials = AwsCredentials::new("AKID", "SECRET");
///
/// let client = aws_bedrock::create_client(config, credentials)?;
/// # Ok::<(), aws_bedrock::BedrockError>(())
/// ```
pub fn create_client(
    config: BedrockConfig,
    credentials: AwsCredentials,
) -> Result<impl BedrockClient, BedrockError> {
    use std::sync::Arc;

    BedrockClientBuilder::new()
        .config(config)
        .credentials_provider(Arc::new(StaticCredentialsProvider::new(credentials)))
        .build()
}

/// Result type alias for Bedrock operations.
pub type Result<T> = std::result::Result<T, BedrockError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crate_exports() {
        // Verify all major types are exported
        let _ = std::any::type_name::<BedrockError>();
        let _ = std::any::type_name::<BedrockConfig>();
        let _ = std::any::type_name::<AwsCredentials>();
        let _ = std::any::type_name::<UnifiedInvokeRequest>();
        let _ = std::any::type_name::<UnifiedInvokeResponse>();
        let _ = std::any::type_name::<Message>();
        let _ = std::any::type_name::<ModelFamily>();
    }

    #[test]
    fn test_model_family_detection() {
        assert_eq!(
            detect_model_family("amazon.titan-text-express-v1").unwrap(),
            ModelFamily::Titan
        );
        assert_eq!(
            detect_model_family("anthropic.claude-3-sonnet-20240229-v1:0").unwrap(),
            ModelFamily::Claude
        );
        assert_eq!(
            detect_model_family("meta.llama3-70b-instruct-v1:0").unwrap(),
            ModelFamily::Llama
        );
    }

    #[test]
    fn test_message_helpers() {
        let user_msg = Message::user("Hello");
        assert_eq!(user_msg.role, "user");
        assert_eq!(user_msg.content, "Hello");

        let assistant_msg = Message::assistant("Hi there!");
        assert_eq!(assistant_msg.role, "assistant");
        assert_eq!(assistant_msg.content, "Hi there!");
    }

    #[test]
    fn test_unified_request_builder() {
        let request = UnifiedInvokeRequest::new(
            "amazon.titan-text-express-v1",
            vec![Message::user("Test")],
        )
        .with_system("System prompt")
        .with_max_tokens(100)
        .with_temperature(0.7)
        .with_top_p(0.9);

        assert_eq!(request.model_id, "amazon.titan-text-express-v1");
        assert_eq!(request.system, Some("System prompt".to_string()));
        assert_eq!(request.max_tokens, Some(100));
        assert_eq!(request.temperature, Some(0.7));
        assert_eq!(request.top_p, Some(0.9));
    }
}
