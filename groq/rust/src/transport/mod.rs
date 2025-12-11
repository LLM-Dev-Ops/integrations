//! HTTP transport layer for the Groq client.
//!
//! Provides the HTTP transport abstraction and implementations for
//! making API requests to Groq, including support for streaming responses.

mod http;
mod streaming;

pub use http::{HttpMethod, HttpRequest, HttpResponse, HttpTransport, HttpTransportImpl};
pub use streaming::{ChatStream, SseEvent, SseParser, StreamingResponse};

use std::collections::HashMap;
use std::time::Duration;

/// Multipart request for file uploads.
#[derive(Debug, Clone)]
pub struct MultipartRequest {
    /// Request path.
    pub path: String,
    /// Request headers.
    pub headers: HashMap<String, String>,
    /// Multipart form parts.
    pub parts: Vec<MultipartPart>,
    /// Request timeout.
    pub timeout: Option<Duration>,
}

/// A part of a multipart form.
#[derive(Debug, Clone)]
pub enum MultipartPart {
    /// Text field.
    Text {
        /// Field name.
        name: String,
        /// Field value.
        value: String,
    },
    /// File field.
    File {
        /// Field name.
        name: String,
        /// File name.
        filename: String,
        /// Content type.
        content_type: String,
        /// File data.
        data: Vec<u8>,
    },
}

/// Transport error types.
#[derive(Debug, thiserror::Error)]
pub enum TransportError {
    /// Connection error.
    #[error("Connection error: {message}")]
    Connection {
        /// Error message.
        message: String,
    },

    /// Timeout error.
    #[error("Timeout after {timeout:?}")]
    Timeout {
        /// Timeout duration.
        timeout: Duration,
    },

    /// TLS error.
    #[error("TLS error: {message}")]
    Tls {
        /// Error message.
        message: String,
    },

    /// Invalid response.
    #[error("Invalid response: {message}")]
    InvalidResponse {
        /// Error message.
        message: String,
    },
}
