//! Groq AI Client Library
//!
//! A production-ready Rust client for the Groq API with ultra-low latency
//! LPU (Language Processing Unit) inference. Provides comprehensive support
//! for chat completions, audio transcription/translation, and model management.
//!
//! # Features
//!
//! - **Ultra-Low Latency**: Optimized for Groq's LPU hardware (< 2ms client overhead)
//! - **Chat Completions**: Sync and streaming with tool use, vision, and JSON mode
//! - **Audio**: Whisper-powered transcription and translation
//! - **Resilience**: Automatic retries, circuit breaker, rate limiting
//! - **Observability**: Tracing, metrics, structured logging
//! - **Type Safety**: Comprehensive type definitions with builder patterns
//! - **Async/Await**: Built on Tokio for high-performance async I/O
//!
//! # Quick Start
//!
//! ```rust,no_run
//! use groq_client::{GroqClient, ChatRequest, Message};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let client = GroqClient::builder()
//!         .api_key("gsk_your_api_key")
//!         .build()?;
//!
//!     let request = ChatRequest::builder()
//!         .model("llama-3.3-70b-versatile")
//!         .user("Hello, Groq!")
//!         .build()?;
//!
//!     let response = client.chat().create(request).await?;
//!     println!("{}", response.content().unwrap_or_default());
//!     Ok(())
//! }
//! ```
//!
//! # Streaming Example
//!
//! ```rust,no_run
//! use groq_client::{GroqClient, ChatRequest};
//! use futures::StreamExt;
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let client = GroqClient::builder()
//!         .api_key("gsk_your_api_key")
//!         .build()?;
//!
//!     let request = ChatRequest::builder()
//!         .model("llama-3.3-70b-versatile")
//!         .user("Tell me a story")
//!         .build()?;
//!
//!     let mut stream = client.chat().create_stream(request).await?;
//!
//!     while let Some(chunk) = stream.next().await {
//!         if let Ok(chunk) = chunk {
//!             if let Some(content) = chunk.choices.first()
//!                 .and_then(|c| c.delta.content.as_ref())
//!             {
//!                 print!("{}", content);
//!             }
//!         }
//!     }
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
pub use client::{GroqClient, GroqClientBuilder};
pub use config::GroqConfig;
pub use errors::{GroqError, GroqResult};

// Type re-exports
pub use types::chat::{
    ChatChunk, ChatRequest, ChatResponse, Choice, ChunkChoice, Delta, Message,
    AssistantMessage, Content, ContentPart, FinishReason, ImageDetail, ImageUrl,
    ResponseFormat, ResponseFormatType, Role, StreamOptions, Usage,
};
pub use types::audio::{
    AudioFormat, Granularity, Segment, TranscriptionRequest, TranscriptionResponse,
    TranslationRequest, TranslationResponse, Word,
};
pub use types::models::{Model, ModelList};
pub use types::tools::{FunctionCall, FunctionDefinition, Tool, ToolCall, ToolChoice};
pub use types::common::GroqMetadata;

/// Mock implementations for testing.
#[cfg(any(test, feature = "mocks"))]
pub mod mocks;
