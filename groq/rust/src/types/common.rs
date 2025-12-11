//! Common types shared across the Groq API.

use serde::{Deserialize, Serialize};

/// Groq-specific metadata returned in responses.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GroqMetadata {
    /// Request ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,

    /// Groq-specific usage information.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<GroqUsage>,
}

/// Groq-specific timing information.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GroqUsage {
    /// Time spent in queue (seconds).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub queue_time: Option<f64>,

    /// Time spent processing prompt (seconds).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_time: Option<f64>,

    /// Time spent generating completion (seconds).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completion_time: Option<f64>,

    /// Total time (seconds).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_time: Option<f64>,
}
