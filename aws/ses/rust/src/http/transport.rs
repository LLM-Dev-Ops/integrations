//! Transport layer abstraction for HTTP communication.
//!
//! This module provides a pluggable transport layer for sending HTTP requests.
//! The default implementation uses reqwest, but other implementations can be
//! provided for testing or alternative HTTP backends.

use async_trait::async_trait;
use reqwest::{Client, Request, Response};
use std::sync::Arc;
use std::time::Duration;

use crate::error::{SesError, SesResult};
use super::pool::{ConnectionPool, PoolConfig};

/// Trait for HTTP transport implementations.
///
/// This trait abstracts the actual HTTP transport, allowing for different
/// implementations (e.g., reqwest, hyper, mock for testing).
#[async_trait]
pub trait Transport: Send + Sync {
    /// Send an HTTP request and return the response.
    ///
    /// # Arguments
    ///
    /// * `request` - The HTTP request to send
    ///
    /// # Returns
    ///
    /// The HTTP response or an error.
    ///
    /// # Errors
    ///
    /// Returns an error if the request cannot be sent or times out.
    async fn send(&self, request: Request) -> SesResult<Response>;

    /// Clone the transport into a new Arc.
    ///
    /// This is used to create new instances of the transport for use
    /// in different contexts while sharing the underlying connection pool.
    fn clone_box(&self) -> Arc<dyn Transport>;
}

/// Reqwest-based HTTP transport implementation.
///
/// This transport uses the reqwest library for HTTP communication and includes
/// connection pooling for efficient connection reuse.
pub struct ReqwestTransport {
    /// The reqwest HTTP client
    client: Client,

    /// Connection pool for managing connections
    pool: Arc<ConnectionPool>,
}

impl ReqwestTransport {
    /// Create a new reqwest transport with default settings.
    ///
    /// # Arguments
    ///
    /// * `timeout` - Request timeout duration
    /// * `connect_timeout` - Connection timeout duration
    ///
    /// # Returns
    ///
    /// A new `ReqwestTransport` instance or an error if client creation fails.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use std::time::Duration;
    /// use integrations_aws_ses::http::ReqwestTransport;
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let transport = ReqwestTransport::new(
    ///     Duration::from_secs(30),
    ///     Duration::from_secs(10)
    /// )?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn new(timeout: Duration, connect_timeout: Duration) -> SesResult<Self> {
        let pool_config = PoolConfig::default();
        Self::with_pool_config(timeout, connect_timeout, pool_config)
    }

    /// Create a new reqwest transport with custom pool configuration.
    ///
    /// # Arguments
    ///
    /// * `timeout` - Request timeout duration
    /// * `connect_timeout` - Connection timeout duration
    /// * `pool_config` - Connection pool configuration
    ///
    /// # Returns
    ///
    /// A new `ReqwestTransport` instance or an error if client creation fails.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use std::time::Duration;
    /// use integrations_aws_ses::http::{ReqwestTransport, PoolConfig};
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let pool_config = PoolConfig {
    ///     max_idle_per_host: 10,
    ///     idle_timeout: Duration::from_secs(90),
    ///     max_lifetime: Some(Duration::from_secs(300)),
    /// };
    ///
    /// let transport = ReqwestTransport::with_pool_config(
    ///     Duration::from_secs(30),
    ///     Duration::from_secs(10),
    ///     pool_config
    /// )?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn with_pool_config(
        timeout: Duration,
        connect_timeout: Duration,
        pool_config: PoolConfig,
    ) -> SesResult<Self> {
        let client = Client::builder()
            .timeout(timeout)
            .connect_timeout(connect_timeout)
            .pool_idle_timeout(pool_config.idle_timeout)
            .pool_max_idle_per_host(pool_config.max_idle_per_host)
            .tcp_keepalive(Some(Duration::from_secs(60)))
            .http2_keep_alive_interval(Some(Duration::from_secs(30)))
            .http2_keep_alive_timeout(Duration::from_secs(20))
            .http2_keep_alive_while_idle(true)
            .build()
            .map_err(|e| SesError::Transport {
                message: format!("Failed to create HTTP client: {}", e),
                source: Some(Box::new(e)),
                retryable: false,
            })?;

        let pool = Arc::new(ConnectionPool::new(pool_config));

        Ok(Self { client, pool })
    }

    /// Get a reference to the underlying reqwest client.
    ///
    /// This is useful for advanced use cases where direct access to the
    /// reqwest client is needed.
    pub fn client(&self) -> &Client {
        &self.client
    }

    /// Get a reference to the connection pool.
    ///
    /// This is useful for monitoring pool statistics or health.
    pub fn pool(&self) -> &ConnectionPool {
        &self.pool
    }
}

#[async_trait]
impl Transport for ReqwestTransport {
    async fn send(&self, request: Request) -> SesResult<Response> {
        // Acquire a connection slot from the pool
        self.pool.acquire().await?;

        // Execute the request
        let result = self.client.execute(request).await;

        // Release the connection slot back to the pool
        self.pool.release();

        // Convert reqwest error to SesError
        result.map_err(Into::into)
    }

    fn clone_box(&self) -> Arc<dyn Transport> {
        Arc::new(Self {
            client: self.client.clone(),
            pool: Arc::clone(&self.pool),
        })
    }
}

impl Clone for ReqwestTransport {
    fn clone(&self) -> Self {
        Self {
            client: self.client.clone(),
            pool: Arc::clone(&self.pool),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reqwest_transport_creation() {
        let transport = ReqwestTransport::new(
            Duration::from_secs(30),
            Duration::from_secs(10),
        );
        assert!(transport.is_ok());
    }

    #[test]
    fn test_reqwest_transport_with_pool_config() {
        let pool_config = PoolConfig {
            max_idle_per_host: 5,
            idle_timeout: Duration::from_secs(60),
            max_lifetime: Some(Duration::from_secs(300)),
        };

        let transport = ReqwestTransport::with_pool_config(
            Duration::from_secs(30),
            Duration::from_secs(10),
            pool_config,
        );
        assert!(transport.is_ok());
    }

    #[test]
    fn test_reqwest_transport_clone() {
        let transport = ReqwestTransport::new(
            Duration::from_secs(30),
            Duration::from_secs(10),
        )
        .unwrap();

        let cloned = transport.clone();

        // Both should use the same pool (Arc::ptr_eq would be true)
        assert_eq!(
            Arc::as_ptr(&transport.pool),
            Arc::as_ptr(&cloned.pool)
        );
    }

    #[tokio::test]
    async fn test_transport_trait_object() {
        let transport = ReqwestTransport::new(
            Duration::from_secs(30),
            Duration::from_secs(10),
        )
        .unwrap();

        let transport_arc = transport.clone_box();

        // Should be able to use as trait object
        let _: &dyn Transport = &*transport_arc;
    }
}
