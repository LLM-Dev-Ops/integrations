//! Connection pooling for efficient HTTP connection management.
//!
//! This module provides connection pooling functionality to optimize HTTP
//! communication by reusing connections and implementing health checking.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;
use tokio::sync::Semaphore;

use crate::error::{SesError, SesResult};

/// Configuration for connection pooling.
#[derive(Debug, Clone)]
pub struct PoolConfig {
    /// Maximum number of idle connections to maintain per host.
    pub max_idle_per_host: usize,

    /// How long an idle connection can remain in the pool before being closed.
    pub idle_timeout: Duration,

    /// Maximum lifetime for a connection (None = no limit).
    pub max_lifetime: Option<Duration>,
}

impl Default for PoolConfig {
    fn default() -> Self {
        Self {
            max_idle_per_host: 10,
            idle_timeout: Duration::from_secs(90),
            max_lifetime: Some(Duration::from_secs(300)),
        }
    }
}

/// Connection pool for managing HTTP connections.
///
/// This pool manages connection limits and ensures that connections are
/// properly reused and cleaned up. It uses a semaphore-based approach to
/// limit the number of concurrent connections.
pub struct ConnectionPool {
    /// Configuration for the pool
    config: PoolConfig,

    /// Semaphore to limit concurrent connections
    semaphore: Semaphore,

    /// Current number of active connections
    active_connections: AtomicUsize,

    /// Total number of connections created
    total_connections: AtomicUsize,

    /// Number of connection reuses
    connection_reuses: AtomicUsize,
}

impl ConnectionPool {
    /// Create a new connection pool with the given configuration.
    ///
    /// # Arguments
    ///
    /// * `config` - Pool configuration
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::{ConnectionPool, PoolConfig};
    ///
    /// let config = PoolConfig::default();
    /// let pool = ConnectionPool::new(config);
    /// ```
    pub fn new(config: PoolConfig) -> Self {
        let max_connections = config.max_idle_per_host;

        Self {
            config,
            semaphore: Semaphore::new(max_connections),
            active_connections: AtomicUsize::new(0),
            total_connections: AtomicUsize::new(0),
            connection_reuses: AtomicUsize::new(0),
        }
    }

    /// Acquire a connection from the pool.
    ///
    /// This will wait if the maximum number of connections is already in use.
    ///
    /// # Returns
    ///
    /// `Ok(())` when a connection is available, or an error if acquisition fails.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::{ConnectionPool, PoolConfig};
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let pool = ConnectionPool::new(PoolConfig::default());
    ///
    /// // Acquire a connection
    /// pool.acquire().await?;
    ///
    /// // Use the connection...
    ///
    /// // Release the connection
    /// pool.release();
    /// # Ok(())
    /// # }
    /// ```
    pub async fn acquire(&self) -> SesResult<()> {
        // Try to acquire a permit from the semaphore
        let _permit = self
            .semaphore
            .acquire()
            .await
            .map_err(|e| SesError::Transport {
                message: format!("Failed to acquire connection from pool: {}", e),
                source: None,
                retryable: true,
            })?;

        // Increment active connections
        let active = self.active_connections.fetch_add(1, Ordering::Relaxed) + 1;

        // Check if this is a new connection or reuse
        if active > self.total_connections.load(Ordering::Relaxed) {
            self.total_connections.fetch_add(1, Ordering::Relaxed);
        } else {
            self.connection_reuses.fetch_add(1, Ordering::Relaxed);
        }

        // Forget the permit so it stays acquired until release() is called
        std::mem::forget(_permit);

        Ok(())
    }

    /// Release a connection back to the pool.
    ///
    /// This should be called after a request completes to make the connection
    /// available for reuse.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::{ConnectionPool, PoolConfig};
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let pool = ConnectionPool::new(PoolConfig::default());
    ///
    /// pool.acquire().await?;
    /// // Use connection...
    /// pool.release();
    /// # Ok(())
    /// # }
    /// ```
    pub fn release(&self) {
        // Decrement active connections
        self.active_connections.fetch_sub(1, Ordering::Relaxed);

        // Add a permit back to the semaphore
        self.semaphore.add_permits(1);
    }

    /// Get the current number of active connections.
    ///
    /// # Returns
    ///
    /// The number of currently active connections.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::{ConnectionPool, PoolConfig};
    ///
    /// let pool = ConnectionPool::new(PoolConfig::default());
    /// assert_eq!(pool.active_connections(), 0);
    /// ```
    pub fn active_connections(&self) -> usize {
        self.active_connections.load(Ordering::Relaxed)
    }

    /// Get the total number of connections created.
    ///
    /// # Returns
    ///
    /// The total number of connections that have been created since the pool was initialized.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::{ConnectionPool, PoolConfig};
    ///
    /// let pool = ConnectionPool::new(PoolConfig::default());
    /// assert_eq!(pool.total_connections(), 0);
    /// ```
    pub fn total_connections(&self) -> usize {
        self.total_connections.load(Ordering::Relaxed)
    }

    /// Get the number of connection reuses.
    ///
    /// # Returns
    ///
    /// The number of times connections have been reused.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::{ConnectionPool, PoolConfig};
    ///
    /// let pool = ConnectionPool::new(PoolConfig::default());
    /// assert_eq!(pool.connection_reuses(), 0);
    /// ```
    pub fn connection_reuses(&self) -> usize {
        self.connection_reuses.load(Ordering::Relaxed)
    }

    /// Get the idle timeout duration.
    ///
    /// # Returns
    ///
    /// The duration after which idle connections are closed.
    pub fn idle_timeout(&self) -> Duration {
        self.config.idle_timeout
    }

    /// Get the maximum connection lifetime.
    ///
    /// # Returns
    ///
    /// The maximum duration a connection can exist, or None if unlimited.
    pub fn max_lifetime(&self) -> Option<Duration> {
        self.config.max_lifetime
    }

    /// Check the health of the connection pool.
    ///
    /// # Returns
    ///
    /// `true` if the pool is healthy, `false` otherwise.
    ///
    /// A pool is considered healthy if:
    /// - Active connections are within the configured limit
    /// - There are available permits in the semaphore
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::{ConnectionPool, PoolConfig};
    ///
    /// let pool = ConnectionPool::new(PoolConfig::default());
    /// assert!(pool.is_healthy());
    /// ```
    pub fn is_healthy(&self) -> bool {
        let active = self.active_connections.load(Ordering::Relaxed);
        let max = self.config.max_idle_per_host;

        // Pool is healthy if we're not at max capacity
        active < max && self.semaphore.available_permits() > 0
    }

    /// Get pool statistics.
    ///
    /// # Returns
    ///
    /// A `PoolStats` struct containing current pool statistics.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::{ConnectionPool, PoolConfig};
    ///
    /// let pool = ConnectionPool::new(PoolConfig::default());
    /// let stats = pool.stats();
    /// println!("Active: {}, Total: {}, Reuses: {}",
    ///     stats.active_connections,
    ///     stats.total_connections,
    ///     stats.connection_reuses
    /// );
    /// ```
    pub fn stats(&self) -> PoolStats {
        PoolStats {
            active_connections: self.active_connections(),
            total_connections: self.total_connections(),
            connection_reuses: self.connection_reuses(),
            available_permits: self.semaphore.available_permits(),
            max_idle_per_host: self.config.max_idle_per_host,
        }
    }
}

/// Statistics for a connection pool.
#[derive(Debug, Clone)]
pub struct PoolStats {
    /// Current number of active connections
    pub active_connections: usize,

    /// Total number of connections created
    pub total_connections: usize,

    /// Number of connection reuses
    pub connection_reuses: usize,

    /// Number of available connection permits
    pub available_permits: usize,

    /// Maximum idle connections per host
    pub max_idle_per_host: usize,
}

impl PoolStats {
    /// Calculate the connection reuse rate.
    ///
    /// # Returns
    ///
    /// The percentage of requests that reused an existing connection (0.0 to 1.0).
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::PoolStats;
    ///
    /// let stats = PoolStats {
    ///     active_connections: 5,
    ///     total_connections: 10,
    ///     connection_reuses: 90,
    ///     available_permits: 5,
    ///     max_idle_per_host: 10,
    /// };
    ///
    /// let reuse_rate = stats.reuse_rate();
    /// assert_eq!(reuse_rate, 0.9); // 90% reuse rate
    /// ```
    pub fn reuse_rate(&self) -> f64 {
        let total_requests = self.total_connections + self.connection_reuses;
        if total_requests == 0 {
            0.0
        } else {
            self.connection_reuses as f64 / total_requests as f64
        }
    }

    /// Calculate the pool utilization rate.
    ///
    /// # Returns
    ///
    /// The percentage of pool capacity currently in use (0.0 to 1.0).
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::http::PoolStats;
    ///
    /// let stats = PoolStats {
    ///     active_connections: 7,
    ///     total_connections: 10,
    ///     connection_reuses: 90,
    ///     available_permits: 3,
    ///     max_idle_per_host: 10,
    /// };
    ///
    /// let utilization = stats.utilization_rate();
    /// assert_eq!(utilization, 0.7); // 70% utilized
    /// ```
    pub fn utilization_rate(&self) -> f64 {
        if self.max_idle_per_host == 0 {
            0.0
        } else {
            self.active_connections as f64 / self.max_idle_per_host as f64
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pool_config_default() {
        let config = PoolConfig::default();
        assert_eq!(config.max_idle_per_host, 10);
        assert_eq!(config.idle_timeout, Duration::from_secs(90));
        assert_eq!(config.max_lifetime, Some(Duration::from_secs(300)));
    }

    #[test]
    fn test_pool_creation() {
        let pool = ConnectionPool::new(PoolConfig::default());
        assert_eq!(pool.active_connections(), 0);
        assert_eq!(pool.total_connections(), 0);
        assert_eq!(pool.connection_reuses(), 0);
    }

    #[tokio::test]
    async fn test_pool_acquire_release() {
        let pool = ConnectionPool::new(PoolConfig::default());

        assert_eq!(pool.active_connections(), 0);

        pool.acquire().await.unwrap();
        assert_eq!(pool.active_connections(), 1);
        assert_eq!(pool.total_connections(), 1);

        pool.release();
        assert_eq!(pool.active_connections(), 0);
    }

    #[tokio::test]
    async fn test_pool_multiple_acquires() {
        let config = PoolConfig {
            max_idle_per_host: 3,
            idle_timeout: Duration::from_secs(60),
            max_lifetime: None,
        };
        let pool = ConnectionPool::new(config);

        pool.acquire().await.unwrap();
        pool.acquire().await.unwrap();
        pool.acquire().await.unwrap();

        assert_eq!(pool.active_connections(), 3);
        assert_eq!(pool.total_connections(), 3);

        pool.release();
        pool.release();
        pool.release();

        assert_eq!(pool.active_connections(), 0);
    }

    #[tokio::test]
    async fn test_pool_connection_reuse() {
        let pool = ConnectionPool::new(PoolConfig::default());

        // First connection
        pool.acquire().await.unwrap();
        assert_eq!(pool.total_connections(), 1);
        assert_eq!(pool.connection_reuses(), 0);
        pool.release();

        // Second connection (should be a reuse)
        pool.acquire().await.unwrap();
        assert_eq!(pool.total_connections(), 1);
        assert_eq!(pool.connection_reuses(), 1);
        pool.release();
    }

    #[tokio::test]
    async fn test_pool_max_connections() {
        let config = PoolConfig {
            max_idle_per_host: 2,
            idle_timeout: Duration::from_secs(60),
            max_lifetime: None,
        };
        let pool = std::sync::Arc::new(ConnectionPool::new(config));

        // Acquire max connections
        pool.acquire().await.unwrap();
        pool.acquire().await.unwrap();

        assert_eq!(pool.active_connections(), 2);

        // Try to acquire one more - should wait
        let pool_clone = pool.clone();
        let handle = tokio::spawn(async move {
            pool_clone.acquire().await.unwrap();
        });

        // Give it time to try
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Should still be at 2
        assert_eq!(pool.active_connections(), 2);

        // Release one
        pool.release();

        // Now the spawned task should complete
        tokio::time::timeout(Duration::from_secs(1), handle)
            .await
            .unwrap()
            .unwrap();

        assert_eq!(pool.active_connections(), 2);
    }

    #[test]
    fn test_pool_is_healthy() {
        let pool = ConnectionPool::new(PoolConfig::default());
        assert!(pool.is_healthy());
    }

    #[test]
    fn test_pool_stats() {
        let pool = ConnectionPool::new(PoolConfig::default());
        let stats = pool.stats();

        assert_eq!(stats.active_connections, 0);
        assert_eq!(stats.total_connections, 0);
        assert_eq!(stats.connection_reuses, 0);
        assert_eq!(stats.max_idle_per_host, 10);
    }

    #[test]
    fn test_pool_stats_reuse_rate() {
        let stats = PoolStats {
            active_connections: 5,
            total_connections: 10,
            connection_reuses: 90,
            available_permits: 5,
            max_idle_per_host: 10,
        };

        assert_eq!(stats.reuse_rate(), 0.9);
    }

    #[test]
    fn test_pool_stats_utilization_rate() {
        let stats = PoolStats {
            active_connections: 7,
            total_connections: 10,
            connection_reuses: 90,
            available_permits: 3,
            max_idle_per_host: 10,
        };

        assert_eq!(stats.utilization_rate(), 0.7);
    }

    #[test]
    fn test_pool_stats_reuse_rate_zero_requests() {
        let stats = PoolStats {
            active_connections: 0,
            total_connections: 0,
            connection_reuses: 0,
            available_permits: 10,
            max_idle_per_host: 10,
        };

        assert_eq!(stats.reuse_rate(), 0.0);
    }
}
