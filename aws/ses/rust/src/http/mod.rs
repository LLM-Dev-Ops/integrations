//! HTTP module for AWS SES API communication.
//!
//! This module provides a comprehensive HTTP client implementation for communicating
//! with the AWS SES v2 API. It includes:
//!
//! - **Transport Layer**: Pluggable transport implementations (reqwest by default)
//! - **HTTP Client**: High-level client with request signing, retry logic, and rate limiting
//! - **Request/Response**: Type-safe request building and response parsing
//! - **Connection Pooling**: Efficient connection reuse and health checking
//!
//! # Architecture
//!
//! ```text
//! ┌─────────────────┐
//! │  SesHttpClient  │  - High-level client
//! │                 │  - Request signing
//! │                 │  - Retry logic
//! │                 │  - Rate limiting
//! └────────┬────────┘
//!          │
//!          ▼
//! ┌─────────────────┐
//! │   Transport     │  - HTTP transport abstraction
//! │                 │  - Connection pooling
//! └────────┬────────┘
//!          │
//!          ▼
//! ┌─────────────────┐
//! │   reqwest       │  - Actual HTTP implementation
//! └─────────────────┘
//! ```
//!
//! # Examples
//!
//! ```rust
//! use integrations_aws_ses::http::{SesHttpClient, HttpClient};
//! use integrations_aws_ses::config::SesConfig;
//!
//! # async fn example() -> Result<(), Box<dyn std::error::Error>> {
//! let config = SesConfig::builder()
//!     .region("us-east-1")
//!     .credentials("access_key", "secret_key")
//!     .build()?;
//!
//! let client = SesHttpClient::new(config).await?;
//!
//! // Use the client to make API requests
//! // let response = client.send_request(request).await?;
//! # Ok(())
//! # }
//! ```

mod client;
mod pool;
mod request;
mod response;
mod transport;

pub use client::SesHttpClient;
pub use pool::{ConnectionPool, PoolConfig};
pub use request::{SesRequest, HttpMethod};
pub use response::SesResponse;
pub use transport::{Transport, ReqwestTransport};

use async_trait::async_trait;
use crate::error::SesResult;

/// Trait for HTTP clients that can send AWS SES requests.
///
/// This trait abstracts the HTTP client implementation, allowing for different
/// backends or mock implementations for testing.
#[async_trait]
pub trait HttpClient: Send + Sync {
    /// Send an HTTP request and return the response.
    ///
    /// # Arguments
    ///
    /// * `request` - The SES request to send
    ///
    /// # Returns
    ///
    /// A `SesResponse` containing the response data, or an error if the request fails.
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - Request signing fails
    /// - Network communication fails
    /// - The server returns an error response
    /// - Response parsing fails
    async fn send_request(&self, request: SesRequest) -> SesResult<SesResponse>;

    /// Get the endpoint URL for this client.
    ///
    /// # Returns
    ///
    /// The base endpoint URL as a string.
    fn endpoint(&self) -> &str;

    /// Get the AWS region for this client.
    ///
    /// # Returns
    ///
    /// The AWS region as a string.
    fn region(&self) -> &str;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_http_module_exports() {
        // Verify that all public types are accessible
        let _: Option<SesHttpClient> = None;
        let _: Option<ConnectionPool> = None;
        let _: Option<PoolConfig> = None;
        let _: Option<SesRequest> = None;
        let _: Option<HttpMethod> = None;
        let _: Option<SesResponse> = None;
        let _: Option<ReqwestTransport> = None;
    }
}
