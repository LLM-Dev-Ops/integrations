//! Rerank service for semantic reranking.
//!
//! This module provides the Rerank API implementation for:
//! - Semantic reranking of documents
//! - Query-document relevance scoring

mod service;
mod types;

pub use service::{RerankService, RerankServiceImpl};
pub use types::{
    RerankDocument, RerankRequest, RerankRequestBuilder, RerankResponse, RerankResult,
};
