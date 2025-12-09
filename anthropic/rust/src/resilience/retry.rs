use crate::errors::AnthropicError;
use async_trait::async_trait;
use std::future::Future;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;

/// Configuration for retry behavior
#[derive(Debug, Clone)]
pub struct RetryConfig {
    pub max_retries: u32,
    pub initial_backoff: Duration,
    pub max_backoff: Duration,
    pub backoff_multiplier: f64,
    pub jitter: f64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_backoff: Duration::from_secs(1),
            max_backoff: Duration::from_secs(60),
            backoff_multiplier: 2.0,
            jitter: 0.1,
        }
    }
}

/// Retry executor that handles retry logic with exponential backoff
pub struct RetryExecutor {
    config: RetryConfig,
    retry_hook: Option<Arc<dyn RetryHook>>,
}

impl RetryExecutor {
    /// Create a new retry executor with the given configuration
    pub fn new(config: RetryConfig) -> Self {
        Self {
            config,
            retry_hook: None,
        }
    }

    /// Add a retry hook for custom retry logic
    pub fn with_hook(mut self, hook: Arc<dyn RetryHook>) -> Self {
        self.retry_hook = Some(hook);
        self
    }

    /// Execute the given operation with retry logic
    pub async fn execute<F, Fut, T>(
        &self,
        operation: &str,
        f: F,
    ) -> Result<T, AnthropicError>
    where
        F: Fn() -> Fut + Send,
        Fut: Future<Output = Result<T, AnthropicError>> + Send,
        T: Send,
    {
        let mut attempt = 0;
        let mut last_error = None;

        while attempt <= self.config.max_retries {
            attempt += 1;

            match f().await {
                Ok(result) => return Ok(result),
                Err(e) if !e.is_retryable() => return Err(e),
                Err(e) => {
                    last_error = Some(e.clone());

                    if attempt > self.config.max_retries {
                        break;
                    }

                    let delay = self.calculate_backoff(attempt, e.retry_after());

                    if let Some(hook) = &self.retry_hook {
                        match hook
                            .on_retry(RetryContext {
                                attempt,
                                error: e.clone(),
                                delay,
                                operation: operation.to_string(),
                            })
                            .await
                        {
                            RetryDecision::Abort => return Err(e),
                            RetryDecision::Retry(custom_delay) => {
                                sleep(custom_delay).await;
                                continue;
                            }
                            RetryDecision::Default => {}
                        }
                    }

                    sleep(delay).await;
                }
            }
        }

        Err(last_error.unwrap())
    }

    /// Calculate the backoff delay for a given attempt
    fn calculate_backoff(
        &self,
        attempt: u32,
        server_retry_after: Option<Duration>,
    ) -> Duration {
        let base_delay = self.config.initial_backoff.as_millis() as f64
            * self.config.backoff_multiplier.powi((attempt - 1) as i32);

        // Add jitter
        let jitter_range = base_delay * self.config.jitter;
        let jitter = rand::random::<f64>() * jitter_range * 2.0 - jitter_range;
        let delay_ms = (base_delay + jitter).min(self.config.max_backoff.as_millis() as f64);

        let calculated = Duration::from_millis(delay_ms.max(100.0) as u64);

        // Use server's retry-after if longer
        match server_retry_after {
            Some(server_delay) if server_delay > calculated => server_delay,
            _ => calculated,
        }
    }
}

/// Hook for custom retry behavior
#[async_trait]
pub trait RetryHook: Send + Sync {
    async fn on_retry(&self, context: RetryContext) -> RetryDecision;
}

/// Context information for a retry attempt
#[derive(Debug, Clone)]
pub struct RetryContext {
    pub attempt: u32,
    pub error: AnthropicError,
    pub delay: Duration,
    pub operation: String,
}

/// Decision on how to proceed with a retry
#[derive(Debug)]
pub enum RetryDecision {
    /// Use the default retry behavior
    Default,
    /// Retry with a custom delay
    Retry(Duration),
    /// Abort the retry and return the error
    Abort,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::{RateLimitError, ServerError};

    #[tokio::test]
    async fn test_retry_executor_succeeds_on_first_attempt() {
        let config = RetryConfig::default();
        let executor = RetryExecutor::new(config);

        let mut attempt_count = 0;
        let result = executor
            .execute("test", || {
                let count = attempt_count;
                attempt_count += 1;
                async move {
                    if count == 0 {
                        Ok(42)
                    } else {
                        Err(AnthropicError::Unknown("Should not retry".to_string()))
                    }
                }
            })
            .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
        assert_eq!(attempt_count, 1);
    }

    #[tokio::test]
    async fn test_retry_executor_retries_on_retryable_error() {
        let config = RetryConfig {
            max_retries: 3,
            initial_backoff: Duration::from_millis(10),
            ..Default::default()
        };
        let executor = RetryExecutor::new(config);

        let mut attempt_count = 0;
        let result = executor
            .execute("test", || {
                let count = attempt_count;
                attempt_count += 1;
                async move {
                    if count < 2 {
                        Err(AnthropicError::Server {
                            message: "Service unavailable".to_string(),
                            status_code: Some(503),
                        })
                    } else {
                        Ok(42)
                    }
                }
            })
            .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
        assert_eq!(attempt_count, 3);
    }

    #[tokio::test]
    async fn test_retry_executor_respects_non_retryable_error() {
        let config = RetryConfig::default();
        let executor = RetryExecutor::new(config);

        let mut attempt_count = 0;
        let result = executor
            .execute("test", || {
                attempt_count += 1;
                async move {
                    Err(AnthropicError::Authentication(
                        crate::errors::AuthenticationError::InvalidApiKey(
                            "Invalid key".to_string(),
                        ),
                    ))
                }
            })
            .await;

        assert!(result.is_err());
        assert_eq!(attempt_count, 1); // Should not retry
    }

    #[tokio::test]
    async fn test_retry_executor_respects_max_retries() {
        let config = RetryConfig {
            max_retries: 2,
            initial_backoff: Duration::from_millis(10),
            ..Default::default()
        };
        let executor = RetryExecutor::new(config);

        let mut attempt_count = 0;
        let result = executor
            .execute("test", || {
                attempt_count += 1;
                async move {
                    Err(AnthropicError::Server {
                        message: "Service unavailable".to_string(),
                        status_code: Some(503),
                    })
                }
            })
            .await;

        assert!(result.is_err());
        assert_eq!(attempt_count, 3); // Initial + 2 retries
    }

    #[test]
    fn test_calculate_backoff() {
        let config = RetryConfig {
            max_retries: 5,
            initial_backoff: Duration::from_millis(100),
            max_backoff: Duration::from_secs(10),
            backoff_multiplier: 2.0,
            jitter: 0.0, // No jitter for predictable tests
        };

        let executor = RetryExecutor::new(config);

        let delay1 = executor.calculate_backoff(1, None);
        assert!(delay1.as_millis() >= 100 && delay1.as_millis() <= 100);

        let delay2 = executor.calculate_backoff(2, None);
        assert!(delay2.as_millis() >= 200 && delay2.as_millis() <= 200);

        let delay3 = executor.calculate_backoff(3, None);
        assert!(delay3.as_millis() >= 400 && delay3.as_millis() <= 400);
    }

    #[test]
    fn test_calculate_backoff_respects_max() {
        let config = RetryConfig {
            max_retries: 10,
            initial_backoff: Duration::from_millis(100),
            max_backoff: Duration::from_secs(5),
            backoff_multiplier: 2.0,
            jitter: 0.0,
        };

        let executor = RetryExecutor::new(config);

        let delay = executor.calculate_backoff(10, None);
        assert!(delay <= Duration::from_secs(5));
    }

    #[test]
    fn test_calculate_backoff_uses_server_retry_after() {
        let config = RetryConfig::default();
        let executor = RetryExecutor::new(config);

        let server_delay = Duration::from_secs(30);
        let delay = executor.calculate_backoff(1, Some(server_delay));
        assert_eq!(delay, server_delay);
    }

    struct TestRetryHook;

    #[async_trait]
    impl RetryHook for TestRetryHook {
        async fn on_retry(&self, _context: RetryContext) -> RetryDecision {
            RetryDecision::Abort
        }
    }

    #[tokio::test]
    async fn test_retry_hook_abort() {
        let config = RetryConfig::default();
        let executor = RetryExecutor::new(config).with_hook(Arc::new(TestRetryHook));

        let mut attempt_count = 0;
        let result = executor
            .execute("test", || {
                attempt_count += 1;
                async move {
                    Err(AnthropicError::Server {
                        message: "Service unavailable".to_string(),
                        status_code: Some(503),
                    })
                }
            })
            .await;

        assert!(result.is_err());
        assert_eq!(attempt_count, 1); // Hook aborted retry
    }
}
