//! Retry logic with exponential backoff for transient failures.

use crate::errors::{SlackError, SlackResult};
use std::future::Future;
use std::time::Duration;
use tracing::{debug, warn};

/// Configuration for retry behavior
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retry attempts
    pub max_retries: u32,
    /// Initial delay before first retry
    pub initial_delay: Duration,
    /// Maximum delay between retries
    pub max_delay: Duration,
    /// Multiplier for exponential backoff
    pub multiplier: f64,
    /// Whether to add jitter to delays
    pub with_jitter: bool,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_delay: Duration::from_millis(500),
            max_delay: Duration::from_secs(30),
            multiplier: 2.0,
            with_jitter: true,
        }
    }
}

impl RetryConfig {
    /// Create a new retry configuration
    pub fn new() -> Self {
        Self::default()
    }

    /// Set maximum retries
    pub fn max_retries(mut self, n: u32) -> Self {
        self.max_retries = n;
        self
    }

    /// Set initial delay
    pub fn initial_delay(mut self, delay: Duration) -> Self {
        self.initial_delay = delay;
        self
    }

    /// Set maximum delay
    pub fn max_delay(mut self, delay: Duration) -> Self {
        self.max_delay = delay;
        self
    }

    /// Set backoff multiplier
    pub fn multiplier(mut self, m: f64) -> Self {
        self.multiplier = m;
        self
    }

    /// Enable or disable jitter
    pub fn with_jitter(mut self, jitter: bool) -> Self {
        self.with_jitter = jitter;
        self
    }

    /// Calculate delay for a given attempt number
    pub fn delay_for_attempt(&self, attempt: u32) -> Duration {
        let base_delay = self.initial_delay.as_millis() as f64
            * self.multiplier.powi(attempt.saturating_sub(1) as i32);
        let capped_delay = base_delay.min(self.max_delay.as_millis() as f64);

        let final_delay = if self.with_jitter {
            // Add jitter: random value between 0.5 and 1.5 of the delay
            let jitter_factor = 0.5 + rand_jitter() * 1.0;
            capped_delay * jitter_factor
        } else {
            capped_delay
        };

        Duration::from_millis(final_delay as u64)
    }
}

/// Simple pseudo-random jitter (0.0 to 1.0)
fn rand_jitter() -> f64 {
    use std::time::SystemTime;
    let seed = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    // Simple LCG for jitter - good enough for delay randomization
    ((seed.wrapping_mul(1103515245).wrapping_add(12345)) % 100) as f64 / 100.0
}

/// Retry policy for determining if an error should be retried
pub trait RetryPolicy: Send + Sync {
    /// Check if an error is retryable
    fn is_retryable(&self, error: &SlackError) -> bool;

    /// Get the retry delay for an error (may override calculated delay)
    fn get_retry_delay(&self, error: &SlackError) -> Option<Duration>;
}

/// Default retry policy
#[derive(Debug, Clone, Default)]
pub struct DefaultRetryPolicy;

impl RetryPolicy for DefaultRetryPolicy {
    fn is_retryable(&self, error: &SlackError) -> bool {
        error.is_retryable()
    }

    fn get_retry_delay(&self, error: &SlackError) -> Option<Duration> {
        error.retry_after()
    }
}

/// Execute an operation with retry logic
pub async fn with_retry<F, Fut, T>(
    config: &RetryConfig,
    policy: &dyn RetryPolicy,
    operation: F,
) -> SlackResult<T>
where
    F: Fn() -> Fut,
    Fut: Future<Output = SlackResult<T>>,
{
    let mut attempt = 0;
    let mut last_error: Option<SlackError> = None;

    loop {
        attempt += 1;

        match operation().await {
            Ok(result) => {
                if attempt > 1 {
                    debug!(attempt, "Operation succeeded after retry");
                }
                return Ok(result);
            }
            Err(error) => {
                // Check if we should retry
                if attempt > config.max_retries || !policy.is_retryable(&error) {
                    warn!(
                        attempt,
                        max_retries = config.max_retries,
                        retryable = policy.is_retryable(&error),
                        error = %error,
                        "Operation failed permanently"
                    );
                    return Err(error);
                }

                // Calculate delay
                let delay = policy
                    .get_retry_delay(&error)
                    .unwrap_or_else(|| config.delay_for_attempt(attempt));

                debug!(
                    attempt,
                    delay_ms = delay.as_millis(),
                    error = %error,
                    "Retrying after transient error"
                );

                tokio::time::sleep(delay).await;
                last_error = Some(error);
            }
        }
    }
}

/// Retry builder for fluent API
pub struct RetryBuilder<F> {
    config: RetryConfig,
    policy: Box<dyn RetryPolicy>,
    operation: F,
}

impl<F, Fut, T> RetryBuilder<F>
where
    F: Fn() -> Fut,
    Fut: Future<Output = SlackResult<T>>,
{
    /// Create a new retry builder
    pub fn new(operation: F) -> Self {
        Self {
            config: RetryConfig::default(),
            policy: Box::new(DefaultRetryPolicy),
            operation,
        }
    }

    /// Set the retry configuration
    pub fn config(mut self, config: RetryConfig) -> Self {
        self.config = config;
        self
    }

    /// Set maximum retries
    pub fn max_retries(mut self, n: u32) -> Self {
        self.config.max_retries = n;
        self
    }

    /// Set the retry policy
    pub fn policy(mut self, policy: impl RetryPolicy + 'static) -> Self {
        self.policy = Box::new(policy);
        self
    }

    /// Execute with retry
    pub async fn execute(self) -> SlackResult<T> {
        with_retry(&self.config, self.policy.as_ref(), self.operation).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::NetworkError;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    #[test]
    fn test_delay_calculation() {
        let config = RetryConfig::new()
            .initial_delay(Duration::from_millis(100))
            .multiplier(2.0)
            .with_jitter(false);

        assert_eq!(config.delay_for_attempt(1), Duration::from_millis(100));
        assert_eq!(config.delay_for_attempt(2), Duration::from_millis(200));
        assert_eq!(config.delay_for_attempt(3), Duration::from_millis(400));
    }

    #[test]
    fn test_delay_with_max() {
        let config = RetryConfig::new()
            .initial_delay(Duration::from_secs(1))
            .max_delay(Duration::from_secs(5))
            .multiplier(10.0)
            .with_jitter(false);

        // 10^2 = 100 seconds, but capped at 5 seconds
        assert_eq!(config.delay_for_attempt(3), Duration::from_secs(5));
    }

    #[tokio::test]
    async fn test_retry_success() {
        let attempts = Arc::new(AtomicU32::new(0));
        let attempts_clone = attempts.clone();

        let config = RetryConfig::new()
            .max_retries(3)
            .initial_delay(Duration::from_millis(1));

        let result = with_retry(&config, &DefaultRetryPolicy, || {
            let attempts = attempts_clone.clone();
            async move {
                let n = attempts.fetch_add(1, Ordering::SeqCst) + 1;
                if n < 3 {
                    Err(SlackError::Network(NetworkError::Timeout))
                } else {
                    Ok("success")
                }
            }
        })
        .await;

        assert!(result.is_ok());
        assert_eq!(attempts.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn test_retry_exhausted() {
        let attempts = Arc::new(AtomicU32::new(0));
        let attempts_clone = attempts.clone();

        let config = RetryConfig::new()
            .max_retries(2)
            .initial_delay(Duration::from_millis(1));

        let result: SlackResult<&str> = with_retry(&config, &DefaultRetryPolicy, || {
            let attempts = attempts_clone.clone();
            async move {
                attempts.fetch_add(1, Ordering::SeqCst);
                Err(SlackError::Network(NetworkError::Timeout))
            }
        })
        .await;

        assert!(result.is_err());
        assert_eq!(attempts.load(Ordering::SeqCst), 3); // Initial + 2 retries
    }

    #[test]
    fn test_default_policy_retryable() {
        let policy = DefaultRetryPolicy;

        assert!(policy.is_retryable(&SlackError::Network(NetworkError::Timeout)));
        assert!(!policy.is_retryable(&SlackError::Authentication(
            crate::errors::AuthenticationError::InvalidAuth
        )));
    }
}
