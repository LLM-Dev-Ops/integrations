//! Service implementations for the Cohere API.
//!
//! This module contains implementations for all Cohere API endpoints organized by service:
//!
//! ## Core Services
//! - `chat` - Chat/conversation API with streaming and RAG support
//! - `generate` - Text generation API with streaming support
//! - `embed` - Text embedding API
//! - `rerank` - Semantic reranking API
//!
//! ## Additional Services
//! - `classify` - Text classification API
//! - `summarize` - Text summarization API
//! - `tokenize` - Tokenization and detokenization API
//! - `models` - Model listing and information API
//!
//! ## Management Services (feature-gated)
//! - `datasets` - Dataset management (requires 'datasets' feature)
//! - `connectors` - Connector management (requires 'connectors' feature)
//! - `finetune` - Fine-tuning management (requires 'finetune' feature)

pub mod chat;
pub mod classify;
pub mod embed;
pub mod generate;
pub mod models;
pub mod rerank;
pub mod summarize;
pub mod tokenize;

#[cfg(feature = "datasets")]
pub mod datasets;

#[cfg(feature = "connectors")]
pub mod connectors;

#[cfg(feature = "finetune")]
pub mod finetune;
