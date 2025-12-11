//! Client interface and factory for Gemini API.
//!
//! Provides the main `GeminiClient` implementation with builder pattern,
//! lazy-initialized services, and factory methods for client creation.

mod builder;
mod client;
mod traits;

// Re-export public API
pub use builder::GeminiClientBuilder;
pub use client::{create_client, create_client_from_env, GeminiClientImpl};
pub use traits::{GeminiClient, GeminiClientFactory};
