//! Retry policy implementation.

use std::future::Future;
use std::time::Duration;
use tracing::instrument;

use crate::errors::GroqError;

/// Retry configuration.
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retry attempts.
    pub max_retries: u32,
    /// Initial delay between retries.
    pub initial_delay: Duration,
    /// Maximum delay between retries.
    pub max_delay: Duration,
    /// Delay multiplier for exponential backoff.
    pub multiplier: f64,
    /// Whether to add jitter.
    pub jitter: bool,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(10),
            multiplier: 2.0,
            jitter: true,
        }
    }
}

impl RetryConfig {
    /// Creates a new retry configuration.
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets the maximum number of retries.
    pub fn max_retries(mut self, retries: u32) -> Self {
        self.max_retries = retries;
        self
    }

    /// Sets the initial delay.
    pub fn initial_delay(mut self, delay: Duration) -> Self {
        self.initial_delay = delay;
        self
    }

    /// Sets the maximum delay.
    pub fn max_delay(mut self, delay: Duration) -> Self {
        self.max_delay = delay;
        self
    }

    /// Sets the multiplier.
    pub fn multiplier(mut self, mult: f64) -> Self {
        self.multiplier = mult;
        self
    }

    /// Sets whether to use jitter.
    pub fn jitter(mut self, jitter: bool) -> Self {
        self.jitter = jitter;
        self
    }

    /// Creates a configuration with no retries.
    pub fn no_retries() -> Self {
        Self {
            max_retries: 0,
            ..Default::default()
        }
    }
}

/// Retry policy with exponential backoff.
#[derive(Debug)]
pub struct RetryPolicy {
    config: RetryConfig,
}

impl RetryPolicy {
    /// Creates a new retry policy.
    pub fn new(config: RetryConfig) -> Self {
        Self { config }
    }

    /// Creates a retry policy with default configuration.
    pub fn default_policy() -> Self {
        Self::new(RetryConfig::default())
    }

    /// Executes an operation with retries.
    #[instrument(skip(self, operation), fields(max_retries = self.config.max_retries))]
    pub async fn execute<F, Fut, T>(&self, operation: F) -> Result<T, GroqError>
    where
        F: Fn() -> Fut,
        Fut: Future<Output = Result<T, GroqError>>,
    {
        let mut attempt = 0;
        let mut last_error: Option<GroqError> = None;

        loop {
            match operation().await {
                Ok(result) => return Ok(result),
                Err(err) => {
                    if !err.is_retryable() || attempt >= self.config.max_retries {
                        return Err(err);
                    }

                    // Calculate delay
                    let delay = self.calculate_delay(attempt, &err);

                    tracing::info!(
                        attempt = attempt + 1,
                        max_retries = self.config.max_retries,
                        delay_ms = delay.as_millis(),
                        error = %err,
                        "Retrying after error"
                    );

                    tokio::time::sleep(delay).await;
                    last_error = Some(err);
                    attempt += 1;
                }
            }
        }
    }

    /// Calculates the delay for a retry attempt.
    fn calculate_delay(&self, attempt: u32, error: &GroqError) -> Duration {
        // If error has retry-after, use that
        if let Some(retry_after) = error.retry_after() {
            return retry_after;
        }

        // Calculate exponential backoff
        let base_delay = self.config.initial_delay.as_millis() as f64
            * self.config.multiplier.powi(attempt as i32);

        let delay_ms = base_delay.min(self.config.max_delay.as_millis() as f64);

        // Add jitter if enabled (0-25% random variation)
        let delay_ms = if self.config.jitter {
            let jitter = rand::random::<f64>() * 0.25;
            delay_ms * (1.0 + jitter)
        } else {
            delay_ms
        };

        Duration::from_millis(delay_ms as u64)
    }
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self::default_policy()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    #[tokio::test]
    async fn test_retry_success_first_attempt() {
        let policy = RetryPolicy::default();

        let result = policy
            .execute(|| async { Ok::<_, GroqError>("success") })
            .await;

        assert_eq!(result.unwrap(), "success");
    }

    #[tokio::test]
    async fn test_retry_success_after_failures() {
        let config = RetryConfig::new()
            .max_retries(3)
            .initial_delay(Duration::from_millis(10))
            .jitter(false);

        let policy = RetryPolicy::new(config);
        let attempts = Arc::new(AtomicU32::new(0));
        let attempts_clone = Arc::clone(&attempts);

        let result = policy
            .execute(|| {
                let attempts = Arc::clone(&attempts_clone);
                async move {
                    let count = attempts.fetch_add(1, Ordering::SeqCst);
                    if count < 2 {
                        Err(GroqError::Server {
                            message: "error".to_string(),
                            status_code: 500,
                            request_id: None,
                        })
                    } else {
                        Ok("success")
                    }
                }
            })
            .await;

        assert_eq!(result.unwrap(), "success");
        assert_eq!(attempts.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn test_retry_non_retryable_error() {
        let policy = RetryPolicy::default();
        let attempts = Arc::new(AtomicU32::new(0));
        let attempts_clone = Arc::clone(&attempts);

        let result = policy
            .execute(|| {
                let attempts = Arc::clone(&attempts_clone);
                async move {
                    attempts.fetch_add(1, Ordering::SeqCst);
                    Err::<(), _>(GroqError::Authentication {
                        message: "invalid key".to_string(),
                        api_key_hint: None,
                    })
                }
            })
            .await;

        assert!(result.is_err());
        assert_eq!(attempts.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_retry_exhausted() {
        let config = RetryConfig::new()
            .max_retries(2)
            .initial_delay(Duration::from_millis(10))
            .jitter(false);

        let policy = RetryPolicy::new(config);
        let attempts = Arc::new(AtomicU32::new(0));
        let attempts_clone = Arc::clone(&attempts);

        let result = policy
            .execute(|| {
                let attempts = Arc::clone(&attempts_clone);
                async move {
                    attempts.fetch_add(1, Ordering::SeqCst);
                    Err::<(), _>(GroqError::Server {
                        message: "error".to_string(),
                        status_code: 500,
                        request_id: None,
                    })
                }
            })
            .await;

        assert!(result.is_err());
        assert_eq!(attempts.load(Ordering::SeqCst), 3); // 1 initial + 2 retries
    }

    #[test]
    fn test_delay_calculation() {
        let config = RetryConfig::new()
            .initial_delay(Duration::from_millis(100))
            .multiplier(2.0)
            .max_delay(Duration::from_secs(1))
            .jitter(false);

        let policy = RetryPolicy::new(config);
        let error = GroqError::Server {
            message: "error".to_string(),
            status_code: 500,
            request_id: None,
        };

        let delay0 = policy.calculate_delay(0, &error);
        let delay1 = policy.calculate_delay(1, &error);
        let delay2 = policy.calculate_delay(2, &error);

        assert_eq!(delay0.as_millis(), 100);
        assert_eq!(delay1.as_millis(), 200);
        assert_eq!(delay2.as_millis(), 400);
    }

    #[test]
    fn test_delay_respects_max() {
        let config = RetryConfig::new()
            .initial_delay(Duration::from_millis(100))
            .multiplier(10.0)
            .max_delay(Duration::from_millis(500))
            .jitter(false);

        let policy = RetryPolicy::new(config);
        let error = GroqError::Server {
            message: "error".to_string(),
            status_code: 500,
            request_id: None,
        };

        let delay = policy.calculate_delay(3, &error);
        assert_eq!(delay.as_millis(), 500);
    }
}
