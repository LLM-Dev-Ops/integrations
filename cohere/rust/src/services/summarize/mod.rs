//! Summarize service for text summarization.

mod service;
mod types;

pub use service::{SummarizeService, SummarizeServiceImpl};
pub use types::{
    SummarizeExtractiveness, SummarizeFormat, SummarizeLength, SummarizeRequest,
    SummarizeRequestBuilder, SummarizeResponse,
};
