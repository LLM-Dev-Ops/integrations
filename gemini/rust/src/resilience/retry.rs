//! Retry logic with exponential backoff for the Gemini API client.
//!
//! Provides configurable retry mechanisms that respect rate limit headers
//! and implement exponential backoff with jitter.

use std::time::Duration;
use tokio::time::sleep;
use crate::error::GeminiError;

/// Configuration for retry behavior.
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retry attempts.
    pub max_retries: u32,
    /// Initial delay before the first retry.
    pub initial_delay: Duration,
    /// Maximum delay between retries.
    pub max_delay: Duration,
    /// Multiplier for exponential backoff (e.g., 2.0 for doubling).
    pub multiplier: f64,
    /// Jitter factor (0.0 to 1.0) to add randomness to delays.
    pub jitter: f64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_delay: Duration::from_millis(1000),
            max_delay: Duration::from_secs(60),
            multiplier: 2.0,
            jitter: 0.1,
        }
    }
}

impl RetryConfig {
    /// Creates a new retry configuration with custom settings.
    pub fn new(
        max_retries: u32,
        initial_delay: Duration,
        max_delay: Duration,
        multiplier: f64,
        jitter: f64,
    ) -> Self {
        Self {
            max_retries,
            initial_delay,
            max_delay,
            multiplier,
            jitter,
        }
    }

    /// Creates a configuration with no retries.
    pub fn no_retry() -> Self {
        Self {
            max_retries: 0,
            ..Default::default()
        }
    }

    /// Creates a configuration for aggressive retries.
    pub fn aggressive() -> Self {
        Self {
            max_retries: 5,
            initial_delay: Duration::from_millis(500),
            max_delay: Duration::from_secs(30),
            multiplier: 2.0,
            jitter: 0.2,
        }
    }
}

/// Executes operations with retry logic and exponential backoff.
pub struct RetryExecutor {
    config: RetryConfig,
}

impl RetryExecutor {
    /// Creates a new retry executor with the given configuration.
    pub fn new(config: RetryConfig) -> Self {
        Self { config }
    }

    /// Creates a retry executor with default configuration.
    pub fn with_defaults() -> Self {
        Self::new(RetryConfig::default())
    }

    /// Executes an operation with retry logic.
    ///
    /// # Arguments
    ///
    /// * `operation` - A closure that returns a future producing a Result
    ///
    /// # Returns
    ///
    /// The result of the operation after retries are exhausted or success is achieved.
    ///
    /// # Behavior
    ///
    /// - Retries only if the error is retryable (network errors, rate limits, server errors)
    /// - Respects retry-after headers from 429 responses
    /// - Uses exponential backoff with jitter for other retryable errors
    /// - Stops retrying when max_retries is reached or error is not retryable
    pub async fn execute<F, Fut, T>(&self, operation: F) -> Result<T, GeminiError>
    where
        F: Fn() -> Fut,
        Fut: std::future::Future<Output = Result<T, GeminiError>>,
    {
        let mut attempts = 0;
        let mut delay = self.config.initial_delay;

        loop {
            match operation().await {
                Ok(result) => {
                    if attempts > 0 {
                        tracing::info!(
                            "Operation succeeded after {} retry attempts",
                            attempts
                        );
                    }
                    return Ok(result);
                }
                Err(e) if e.is_retryable() && attempts < self.config.max_retries => {
                    attempts += 1;

                    // Use retry-after from error if provided, otherwise exponential backoff
                    let wait_duration = e.retry_after().unwrap_or(delay);
                    let jittered = self.add_jitter(wait_duration);

                    tracing::warn!(
                        "Retryable error encountered (attempt {}/{}): {}. Waiting {:?} before retry.",
                        attempts,
                        self.config.max_retries,
                        e,
                        jittered
                    );

                    sleep(jittered).await;

                    // Calculate next delay using exponential backoff
                    delay = std::cmp::min(
                        Duration::from_secs_f64(delay.as_secs_f64() * self.config.multiplier),
                        self.config.max_delay,
                    );
                }
                Err(e) => {
                    if attempts > 0 {
                        tracing::error!(
                            "Operation failed after {} retry attempts: {}",
                            attempts,
                            e
                        );
                    }
                    return Err(e);
                }
            }
        }
    }

    /// Adds random jitter to a duration to prevent thundering herd.
    ///
    /// # Arguments
    ///
    /// * `duration` - The base duration
    ///
    /// # Returns
    ///
    /// The duration with added jitter (randomness within +/- jitter percentage)
    fn add_jitter(&self, duration: Duration) -> Duration {
        use std::collections::hash_map::RandomState;
        use std::hash::{BuildHasher, Hash, Hasher};

        // Create a simple pseudo-random number using a hash-based approach
        // This avoids the need for the rand crate while still providing jitter
        let state = RandomState::new();
        let mut hasher = state.build_hasher();
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
            .hash(&mut hasher);

        let hash = hasher.finish();
        let random_factor = (hash % 10000) as f64 / 10000.0; // 0.0 to 1.0

        let jitter_range = duration.as_secs_f64() * self.config.jitter;
        let jitter = random_factor * jitter_range * 2.0 - jitter_range;

        Duration::from_secs_f64((duration.as_secs_f64() + jitter).max(0.0))
    }

    /// Returns the retry configuration.
    pub fn config(&self) -> &RetryConfig {
        &self.config
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::{NetworkError, RateLimitError, ServerError};
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    #[tokio::test]
    async fn test_retry_succeeds_eventually() {
        let executor = RetryExecutor::with_defaults();
        let attempts = Arc::new(AtomicU32::new(0));
        let attempts_clone = attempts.clone();

        let result = executor
            .execute(|| async {
                let count = attempts_clone.fetch_add(1, Ordering::SeqCst);
                if count < 2 {
                    Err(GeminiError::Network(NetworkError::Timeout {
                        duration: Duration::from_secs(10),
                    }))
                } else {
                    Ok("success")
                }
            })
            .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "success");
        assert_eq!(attempts.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn test_retry_exhausts_attempts() {
        let config = RetryConfig {
            max_retries: 2,
            initial_delay: Duration::from_millis(1),
            ..Default::default()
        };
        let executor = RetryExecutor::new(config);
        let attempts = Arc::new(AtomicU32::new(0));
        let attempts_clone = attempts.clone();

        let result = executor
            .execute(|| async {
                attempts_clone.fetch_add(1, Ordering::SeqCst);
                Err(GeminiError::Network(NetworkError::Timeout {
                    duration: Duration::from_secs(10),
                }))
            })
            .await;

        assert!(result.is_err());
        assert_eq!(attempts.load(Ordering::SeqCst), 3); // Initial attempt + 2 retries
    }

    #[tokio::test]
    async fn test_non_retryable_error() {
        let executor = RetryExecutor::with_defaults();
        let attempts = Arc::new(AtomicU32::new(0));
        let attempts_clone = attempts.clone();

        let result = executor
            .execute(|| async {
                attempts_clone.fetch_add(1, Ordering::SeqCst);
                Err(GeminiError::Configuration(
                    crate::error::ConfigurationError::MissingApiKey,
                ))
            })
            .await;

        assert!(result.is_err());
        assert_eq!(attempts.load(Ordering::SeqCst), 1); // No retries
    }

    #[tokio::test]
    async fn test_retry_after_header() {
        let config = RetryConfig {
            max_retries: 2,
            initial_delay: Duration::from_millis(10),
            ..Default::default()
        };
        let executor = RetryExecutor::new(config);
        let attempts = Arc::new(AtomicU32::new(0));
        let attempts_clone = attempts.clone();

        let start = std::time::Instant::now();
        let result = executor
            .execute(|| async {
                let count = attempts_clone.fetch_add(1, Ordering::SeqCst);
                if count < 1 {
                    Err(GeminiError::RateLimit(RateLimitError::TooManyRequests {
                        retry_after: Some(Duration::from_millis(50)),
                    }))
                } else {
                    Ok("success")
                }
            })
            .await;

        let elapsed = start.elapsed();
        assert!(result.is_ok());
        // Should wait at least 50ms for retry-after, but with jitter it could vary
        assert!(elapsed >= Duration::from_millis(40));
    }

    #[test]
    fn test_retry_config_default() {
        let config = RetryConfig::default();
        assert_eq!(config.max_retries, 3);
        assert_eq!(config.initial_delay, Duration::from_millis(1000));
        assert_eq!(config.max_delay, Duration::from_secs(60));
        assert_eq!(config.multiplier, 2.0);
        assert_eq!(config.jitter, 0.1);
    }

    #[test]
    fn test_retry_config_no_retry() {
        let config = RetryConfig::no_retry();
        assert_eq!(config.max_retries, 0);
    }

    #[test]
    fn test_retry_config_aggressive() {
        let config = RetryConfig::aggressive();
        assert_eq!(config.max_retries, 5);
        assert_eq!(config.initial_delay, Duration::from_millis(500));
    }

    #[test]
    fn test_add_jitter() {
        let executor = RetryExecutor::with_defaults();
        let duration = Duration::from_secs(10);
        let jittered = executor.add_jitter(duration);

        // With 10% jitter on 10 seconds, should be between 9 and 11 seconds
        assert!(jittered >= Duration::from_secs(9));
        assert!(jittered <= Duration::from_secs(11));
    }
}
