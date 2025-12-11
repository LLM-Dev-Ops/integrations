//! Transport layer error types.

/// Transport error.
#[derive(Debug, thiserror::Error)]
pub enum TransportError {
    #[error("Connection error: {0}")]
    Connection(String),
    #[error("Timeout")]
    Timeout,
    #[error("Request error: {0}")]
    Request(String),
}
