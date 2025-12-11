//! Classify service for text classification.

mod service;
mod types;

pub use service::{ClassifyService, ClassifyServiceImpl};
pub use types::{
    ClassificationResult, ClassifyExample, ClassifyRequest, ClassifyRequestBuilder,
    ClassifyResponse, LabelConfidence,
};
