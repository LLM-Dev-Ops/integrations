//! Retry logic with exponential backoff.

use crate::errors::CohereError;
use std::future::Future;
use std::time::Duration;

/// Configuration for retry behavior
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retry attempts
    pub max_retries: u32,
    /// Initial delay between retries
    pub initial_delay: Duration,
    /// Maximum delay between retries
    pub max_delay: Duration,
    /// Multiplier for exponential backoff
    pub multiplier: f64,
    /// Jitter factor (0.0 to 1.0) to randomize delays
    pub jitter: f64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_delay: Duration::from_millis(500),
            max_delay: Duration::from_secs(30),
            multiplier: 2.0,
            jitter: 0.1,
        }
    }
}

impl RetryConfig {
    /// Create a new retry configuration with default values
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the maximum number of retries
    pub fn with_max_retries(mut self, max_retries: u32) -> Self {
        self.max_retries = max_retries;
        self
    }

    /// Set the initial delay
    pub fn with_initial_delay(mut self, delay: Duration) -> Self {
        self.initial_delay = delay;
        self
    }

    /// Set the maximum delay
    pub fn with_max_delay(mut self, delay: Duration) -> Self {
        self.max_delay = delay;
        self
    }

    /// Set the backoff multiplier
    pub fn with_multiplier(mut self, multiplier: f64) -> Self {
        self.multiplier = multiplier;
        self
    }

    /// Set the jitter factor
    pub fn with_jitter(mut self, jitter: f64) -> Self {
        self.jitter = jitter.clamp(0.0, 1.0);
        self
    }

    /// Calculate the delay for a given attempt number
    pub fn calculate_delay(&self, attempt: u32) -> Duration {
        let base_delay = self.initial_delay.as_millis() as f64
            * self.multiplier.powi(attempt.saturating_sub(1) as i32);

        let delay_ms = base_delay.min(self.max_delay.as_millis() as f64);

        // Apply jitter
        let jitter_range = delay_ms * self.jitter;
        let jitter_offset = rand::random::<f64>() * jitter_range * 2.0 - jitter_range;
        let final_delay_ms = (delay_ms + jitter_offset).max(0.0);

        Duration::from_millis(final_delay_ms as u64)
    }
}

/// Context passed to retry hooks
#[derive(Debug, Clone)]
pub struct RetryContext {
    /// Current attempt number (1-based)
    pub attempt: u32,
    /// Maximum attempts allowed
    pub max_attempts: u32,
    /// The error from the last attempt
    pub last_error: Option<CohereError>,
    /// Delay before the next attempt
    pub next_delay: Duration,
}

/// Decision returned by retry hooks
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RetryDecision {
    /// Retry the operation
    Retry,
    /// Do not retry, fail immediately
    DoNotRetry,
    /// Use default retry behavior
    Default,
}

/// Hook for customizing retry behavior
pub trait RetryHook: Send + Sync {
    /// Called before each retry attempt
    fn on_retry(&self, context: &RetryContext) -> RetryDecision;
}

/// Default retry hook that uses standard behavior
#[derive(Debug, Default)]
pub struct DefaultRetryHook;

impl RetryHook for DefaultRetryHook {
    fn on_retry(&self, _context: &RetryContext) -> RetryDecision {
        RetryDecision::Default
    }
}

/// Executor for retry operations
pub struct RetryExecutor {
    config: RetryConfig,
    hook: Box<dyn RetryHook>,
}

impl RetryExecutor {
    /// Create a new retry executor with default configuration
    pub fn new() -> Self {
        Self::with_config(RetryConfig::default())
    }

    /// Create a new retry executor with custom configuration
    pub fn with_config(config: RetryConfig) -> Self {
        Self {
            config,
            hook: Box::new(DefaultRetryHook),
        }
    }

    /// Set a custom retry hook
    pub fn with_hook(mut self, hook: impl RetryHook + 'static) -> Self {
        self.hook = Box::new(hook);
        self
    }

    /// Execute an operation with retry logic
    pub async fn execute<F, Fut, T>(&self, operation: F) -> Result<T, CohereError>
    where
        F: Fn() -> Fut,
        Fut: Future<Output = Result<T, CohereError>>,
    {
        let mut last_error = None;

        for attempt in 1..=self.config.max_retries + 1 {
            match operation().await {
                Ok(result) => return Ok(result),
                Err(error) => {
                    // Check if error is retryable
                    if !error.is_retryable() {
                        return Err(error);
                    }

                    // Check if we've exhausted retries
                    if attempt > self.config.max_retries {
                        return Err(error);
                    }

                    // Calculate delay, respecting retry-after header
                    let delay = error
                        .retry_after()
                        .unwrap_or_else(|| self.config.calculate_delay(attempt));

                    // Create retry context
                    let context = RetryContext {
                        attempt,
                        max_attempts: self.config.max_retries + 1,
                        last_error: Some(error.clone()),
                        next_delay: delay,
                    };

                    // Check hook decision
                    match self.hook.on_retry(&context) {
                        RetryDecision::DoNotRetry => return Err(error),
                        RetryDecision::Retry | RetryDecision::Default => {
                            // Sleep before retry
                            tokio::time::sleep(delay).await;
                        }
                    }

                    last_error = Some(error);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| CohereError::Internal {
            message: "Retry exhausted without error".to_string(),
        }))
    }
}

impl Default for RetryExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    #[test]
    fn test_retry_config_default() {
        let config = RetryConfig::default();
        assert_eq!(config.max_retries, 3);
        assert_eq!(config.initial_delay, Duration::from_millis(500));
        assert_eq!(config.multiplier, 2.0);
    }

    #[test]
    fn test_retry_config_builder() {
        let config = RetryConfig::new()
            .with_max_retries(5)
            .with_initial_delay(Duration::from_secs(1))
            .with_max_delay(Duration::from_secs(60))
            .with_multiplier(3.0)
            .with_jitter(0.2);

        assert_eq!(config.max_retries, 5);
        assert_eq!(config.initial_delay, Duration::from_secs(1));
        assert_eq!(config.max_delay, Duration::from_secs(60));
        assert_eq!(config.multiplier, 3.0);
        assert_eq!(config.jitter, 0.2);
    }

    #[test]
    fn test_calculate_delay_respects_max() {
        let config = RetryConfig::new()
            .with_initial_delay(Duration::from_secs(1))
            .with_max_delay(Duration::from_secs(5))
            .with_multiplier(10.0)
            .with_jitter(0.0);

        // After several attempts, delay should be capped
        let delay = config.calculate_delay(10);
        assert!(delay <= Duration::from_secs(5) + Duration::from_millis(100));
    }

    #[tokio::test]
    async fn test_retry_executor_success_first_try() {
        let executor = RetryExecutor::new();
        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();

        let result = executor
            .execute(|| {
                let counter = counter_clone.clone();
                async move {
                    counter.fetch_add(1, Ordering::SeqCst);
                    Ok::<_, CohereError>("success".to_string())
                }
            })
            .await;

        assert!(result.is_ok());
        assert_eq!(counter.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_retry_executor_non_retryable_error() {
        let executor = RetryExecutor::with_config(
            RetryConfig::new()
                .with_max_retries(3)
                .with_initial_delay(Duration::from_millis(1)),
        );
        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();

        let result = executor
            .execute(|| {
                let counter = counter_clone.clone();
                async move {
                    counter.fetch_add(1, Ordering::SeqCst);
                    Err::<String, CohereError>(CohereError::Authentication {
                        message: "Invalid key".to_string(),
                    })
                }
            })
            .await;

        assert!(result.is_err());
        // Should only try once since auth errors are not retryable
        assert_eq!(counter.load(Ordering::SeqCst), 1);
    }
}
