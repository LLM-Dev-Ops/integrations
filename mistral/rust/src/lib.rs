//! Mistral AI Client Library
//!
//! A production-ready Rust client for the Mistral AI API with comprehensive
//! support for chat completions, embeddings, models, files, fine-tuning,
//! agents, batch processing, and more.
//!
//! # Features
//!
//! - **Full API Coverage**: Chat, Embeddings, Models, Files, Fine-tuning, Agents, Batch
//! - **Streaming Support**: Real-time streaming via Server-Sent Events
//! - **Resilience**: Automatic retries, circuit breaker, rate limiting
//! - **Observability**: Tracing, metrics, structured logging
//! - **Type Safety**: Comprehensive type definitions with builder patterns
//! - **Async/Await**: Built on Tokio for high-performance async I/O
//!
//! # Quick Start
//!
//! ```rust,no_run
//! use mistral_client::{MistralClient, ChatCompletionRequest, Message};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let client = MistralClient::builder()
//!         .api_key("your-api-key")
//!         .build()?;
//!
//!     let request = ChatCompletionRequest::builder()
//!         .model("mistral-large-latest")
//!         .messages(vec![Message::user("Hello, Mistral!")])
//!         .build();
//!
//!     let response = client.chat().create(request).await?;
//!     println!("{}", response.choices[0].message.content.as_deref().unwrap_or(""));
//!     Ok(())
//! }
//! ```

#![warn(missing_docs)]
#![forbid(unsafe_code)]

pub mod auth;
pub mod client;
pub mod config;
pub mod errors;
pub mod observability;
pub mod resilience;
pub mod services;
pub mod transport;
pub mod types;

// Re-exports for convenience
pub use client::{MistralClient, MistralClientBuilder};
pub use config::MistralConfig;
pub use errors::{MistralError, MistralResult};

// Type re-exports
pub use types::chat::{
    ChatCompletionRequest, ChatCompletionResponse, ChatChoice, Message, MessageContent,
    AssistantMessage, UserMessage, SystemMessage, ToolMessage,
};
pub use types::common::{Usage, FinishReason, Role};
pub use types::embeddings::{EmbeddingRequest, EmbeddingResponse};
pub use types::models::{Model, ModelListResponse};
pub use types::tools::{Tool, ToolCall, ToolChoice, FunctionDefinition};

/// Mock implementations for testing.
#[cfg(any(test, feature = "mocks"))]
pub mod mocks;
