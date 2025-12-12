//! Retry Logic
//!
//! Exponential backoff retry with jitter for OAuth2 operations.

use async_trait::async_trait;
use std::future::Future;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use crate::error::OAuth2Error;

/// Retry configuration.
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retry attempts.
    pub max_attempts: u32,
    /// Initial delay before first retry.
    pub initial_delay: Duration,
    /// Maximum delay between retries.
    pub max_delay: Duration,
    /// Backoff multiplier.
    pub multiplier: f64,
    /// Jitter factor (0.0-1.0).
    pub jitter: f64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            initial_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(10),
            multiplier: 2.0,
            jitter: 0.1,
        }
    }
}

/// Default retry configuration.
pub const DEFAULT_RETRY_CONFIG: RetryConfig = RetryConfig {
    max_attempts: 3,
    initial_delay: Duration::from_millis(100),
    max_delay: Duration::from_secs(10),
    multiplier: 2.0,
    jitter: 0.1,
};

/// Retry executor interface.
#[async_trait]
pub trait RetryExecutor: Send + Sync {
    /// Execute an operation with retry logic.
    async fn execute<T, F, Fut>(&self, operation: F) -> Result<T, OAuth2Error>
    where
        T: Send,
        F: Fn() -> Fut + Send + Sync,
        Fut: Future<Output = Result<T, OAuth2Error>> + Send;

    /// Check if an error is retryable.
    fn is_retryable(&self, error: &OAuth2Error) -> bool;

    /// Get retry statistics.
    fn get_stats(&self) -> RetryStats;
}

/// Retry statistics.
#[derive(Debug, Clone, Default)]
pub struct RetryStats {
    pub total_attempts: u32,
    pub successful_retries: u32,
    pub failed_operations: u32,
}

/// OAuth2 retry executor implementation.
pub struct OAuth2RetryExecutor {
    config: RetryConfig,
    stats: Mutex<RetryStats>,
}

impl OAuth2RetryExecutor {
    /// Create new retry executor.
    pub fn new(config: RetryConfig) -> Self {
        Self {
            config,
            stats: Mutex::new(RetryStats::default()),
        }
    }

    fn calculate_delay(&self, attempt: u32) -> Duration {
        let base_delay = self.config.initial_delay.as_millis() as f64
            * self.config.multiplier.powi(attempt as i32);

        let capped_delay = base_delay.min(self.config.max_delay.as_millis() as f64);

        // Add jitter
        let jitter_range = capped_delay * self.config.jitter;
        let jitter = (rand::random::<f64>() - 0.5) * 2.0 * jitter_range;
        let final_delay = (capped_delay + jitter).max(0.0);

        Duration::from_millis(final_delay as u64)
    }
}

impl Default for OAuth2RetryExecutor {
    fn default() -> Self {
        Self::new(RetryConfig::default())
    }
}

#[async_trait]
impl RetryExecutor for OAuth2RetryExecutor {
    async fn execute<T, F, Fut>(&self, operation: F) -> Result<T, OAuth2Error>
    where
        T: Send,
        F: Fn() -> Fut + Send + Sync,
        Fut: Future<Output = Result<T, OAuth2Error>> + Send,
    {
        let mut last_error = None;

        for attempt in 0..self.config.max_attempts {
            {
                let mut stats = self.stats.lock().unwrap();
                stats.total_attempts += 1;
            }

            match operation().await {
                Ok(result) => {
                    if attempt > 0 {
                        let mut stats = self.stats.lock().unwrap();
                        stats.successful_retries += 1;
                    }
                    return Ok(result);
                }
                Err(error) => {
                    if !self.is_retryable(&error) || attempt == self.config.max_attempts - 1 {
                        let mut stats = self.stats.lock().unwrap();
                        stats.failed_operations += 1;
                        return Err(error);
                    }

                    last_error = Some(error);
                    let delay = self.calculate_delay(attempt);
                    tokio::time::sleep(delay).await;
                }
            }
        }

        Err(last_error.unwrap_or_else(|| {
            OAuth2Error::Network(crate::error::NetworkError::Timeout {
                message: "Retry exhausted".to_string(),
            })
        }))
    }

    fn is_retryable(&self, error: &OAuth2Error) -> bool {
        error.is_retryable()
    }

    fn get_stats(&self) -> RetryStats {
        self.stats.lock().unwrap().clone()
    }
}

/// Mock retry executor for testing.
#[derive(Default)]
pub struct MockRetryExecutor {
    should_retry: Mutex<bool>,
    execution_count: AtomicU32,
    stats: Mutex<RetryStats>,
}

impl MockRetryExecutor {
    /// Create new mock executor.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set whether to retry.
    pub fn set_should_retry(&self, should_retry: bool) -> &Self {
        *self.should_retry.lock().unwrap() = should_retry;
        self
    }

    /// Get execution count.
    pub fn get_execution_count(&self) -> u32 {
        self.execution_count.load(Ordering::SeqCst)
    }
}

#[async_trait]
impl RetryExecutor for MockRetryExecutor {
    async fn execute<T, F, Fut>(&self, operation: F) -> Result<T, OAuth2Error>
    where
        T: Send,
        F: Fn() -> Fut + Send + Sync,
        Fut: Future<Output = Result<T, OAuth2Error>> + Send,
    {
        self.execution_count.fetch_add(1, Ordering::SeqCst);
        operation().await
    }

    fn is_retryable(&self, _error: &OAuth2Error) -> bool {
        *self.should_retry.lock().unwrap()
    }

    fn get_stats(&self) -> RetryStats {
        self.stats.lock().unwrap().clone()
    }
}

/// Create retry executor.
pub fn create_retry_executor(config: RetryConfig) -> impl RetryExecutor {
    OAuth2RetryExecutor::new(config)
}

/// Create mock retry executor for testing.
pub fn create_mock_retry_executor() -> MockRetryExecutor {
    MockRetryExecutor::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_retry_config_default() {
        let config = RetryConfig::default();
        assert_eq!(config.max_attempts, 3);
        assert_eq!(config.initial_delay, Duration::from_millis(100));
    }

    #[tokio::test]
    async fn test_mock_executor() {
        let executor = MockRetryExecutor::new();

        let result = executor
            .execute(|| async { Ok::<_, OAuth2Error>("success") })
            .await;

        assert!(result.is_ok());
        assert_eq!(executor.get_execution_count(), 1);
    }
}
