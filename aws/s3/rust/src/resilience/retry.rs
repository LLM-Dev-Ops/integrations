//! Retry policy implementation for S3 operations.

use crate::error::S3Error;
use std::future::Future;
use std::time::Duration;
use tracing::{debug, warn};

/// Retry configuration.
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retry attempts.
    pub max_retries: u32,
    /// Initial backoff duration.
    pub initial_backoff: Duration,
    /// Maximum backoff duration.
    pub max_backoff: Duration,
    /// Backoff multiplier for exponential backoff.
    pub backoff_multiplier: f64,
    /// Add jitter to backoff.
    pub use_jitter: bool,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_backoff: Duration::from_millis(100),
            max_backoff: Duration::from_secs(30),
            backoff_multiplier: 2.0,
            use_jitter: true,
        }
    }
}

impl RetryConfig {
    /// Create a new retry configuration with custom values.
    pub fn new(max_retries: u32) -> Self {
        Self {
            max_retries,
            ..Default::default()
        }
    }

    /// Set the initial backoff duration.
    pub fn with_initial_backoff(mut self, duration: Duration) -> Self {
        self.initial_backoff = duration;
        self
    }

    /// Set the maximum backoff duration.
    pub fn with_max_backoff(mut self, duration: Duration) -> Self {
        self.max_backoff = duration;
        self
    }

    /// Set the backoff multiplier.
    pub fn with_multiplier(mut self, multiplier: f64) -> Self {
        self.backoff_multiplier = multiplier;
        self
    }

    /// Enable or disable jitter.
    pub fn with_jitter(mut self, use_jitter: bool) -> Self {
        self.use_jitter = use_jitter;
        self
    }

    /// Create a no-retry configuration.
    pub fn no_retry() -> Self {
        Self {
            max_retries: 0,
            ..Default::default()
        }
    }
}

/// Retry policy that executes operations with exponential backoff.
pub struct RetryPolicy {
    config: RetryConfig,
}

impl RetryPolicy {
    /// Create a new retry policy with the given configuration.
    pub fn new(config: RetryConfig) -> Self {
        Self { config }
    }

    /// Execute an operation with retry logic.
    pub async fn execute<F, Fut, T>(&self, operation: F) -> Result<T, S3Error>
    where
        F: Fn() -> Fut,
        Fut: Future<Output = Result<T, S3Error>>,
    {
        let mut attempt = 0;
        let mut last_error: Option<S3Error> = None;

        loop {
            match operation().await {
                Ok(result) => {
                    if attempt > 0 {
                        debug!(attempt = attempt, "Operation succeeded after retry");
                    }
                    return Ok(result);
                }
                Err(error) => {
                    if !error.is_retryable() || attempt >= self.config.max_retries {
                        if attempt > 0 {
                            warn!(
                                attempt = attempt,
                                max_retries = self.config.max_retries,
                                error = %error,
                                "Operation failed after all retries"
                            );
                        }
                        return Err(error);
                    }

                    let backoff = self.calculate_backoff(attempt);
                    debug!(
                        attempt = attempt,
                        backoff_ms = backoff.as_millis(),
                        error = %error,
                        "Retrying operation after backoff"
                    );

                    tokio::time::sleep(backoff).await;
                    last_error = Some(error);
                    attempt += 1;
                }
            }
        }
    }

    /// Calculate backoff duration for a given attempt.
    fn calculate_backoff(&self, attempt: u32) -> Duration {
        let base = self.config.initial_backoff.as_millis() as f64;
        let multiplied = base * self.config.backoff_multiplier.powi(attempt as i32);
        let capped = multiplied.min(self.config.max_backoff.as_millis() as f64);

        let final_ms = if self.config.use_jitter {
            // Add jitter: random value between 0 and capped
            let jitter = rand_jitter(capped);
            capped * (0.5 + jitter * 0.5)
        } else {
            capped
        };

        Duration::from_millis(final_ms as u64)
    }

    /// Get the retry configuration.
    pub fn config(&self) -> &RetryConfig {
        &self.config
    }
}

impl std::fmt::Debug for RetryPolicy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RetryPolicy")
            .field("config", &self.config)
            .finish()
    }
}

/// Simple pseudo-random jitter using system time.
/// Returns a value between 0.0 and 1.0.
fn rand_jitter(seed: f64) -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    let combined = (nanos as f64 * seed) % 1000.0;
    combined / 1000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = RetryConfig::default();
        assert_eq!(config.max_retries, 3);
        assert_eq!(config.initial_backoff, Duration::from_millis(100));
        assert_eq!(config.max_backoff, Duration::from_secs(30));
        assert_eq!(config.backoff_multiplier, 2.0);
        assert!(config.use_jitter);
    }

    #[test]
    fn test_no_retry_config() {
        let config = RetryConfig::no_retry();
        assert_eq!(config.max_retries, 0);
    }

    #[test]
    fn test_config_builder() {
        let config = RetryConfig::new(5)
            .with_initial_backoff(Duration::from_millis(200))
            .with_max_backoff(Duration::from_secs(60))
            .with_multiplier(3.0)
            .with_jitter(false);

        assert_eq!(config.max_retries, 5);
        assert_eq!(config.initial_backoff, Duration::from_millis(200));
        assert_eq!(config.max_backoff, Duration::from_secs(60));
        assert_eq!(config.backoff_multiplier, 3.0);
        assert!(!config.use_jitter);
    }

    #[test]
    fn test_backoff_calculation() {
        let config = RetryConfig::new(3)
            .with_initial_backoff(Duration::from_millis(100))
            .with_multiplier(2.0)
            .with_jitter(false);
        let policy = RetryPolicy::new(config);

        let backoff0 = policy.calculate_backoff(0);
        let backoff1 = policy.calculate_backoff(1);
        let backoff2 = policy.calculate_backoff(2);

        assert_eq!(backoff0, Duration::from_millis(100));
        assert_eq!(backoff1, Duration::from_millis(200));
        assert_eq!(backoff2, Duration::from_millis(400));
    }

    #[test]
    fn test_backoff_capped() {
        let config = RetryConfig::new(10)
            .with_initial_backoff(Duration::from_secs(1))
            .with_max_backoff(Duration::from_secs(5))
            .with_multiplier(10.0)
            .with_jitter(false);
        let policy = RetryPolicy::new(config);

        let backoff = policy.calculate_backoff(5);
        assert_eq!(backoff, Duration::from_secs(5));
    }

    #[tokio::test]
    async fn test_retry_success_first_attempt() {
        let policy = RetryPolicy::new(RetryConfig::default());
        let result: Result<i32, S3Error> = policy.execute(|| async { Ok(42) }).await;
        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn test_retry_non_retryable_error() {
        let policy = RetryPolicy::new(RetryConfig::default());
        let result: Result<i32, S3Error> = policy
            .execute(|| async {
                Err(S3Error::Object(crate::error::ObjectError::NotFound {
                    key: "test".to_string(),
                    request_id: None,
                }))
            })
            .await;

        assert!(result.is_err());
    }
}
