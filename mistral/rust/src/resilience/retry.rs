//! Retry logic with exponential backoff and jitter.

use async_trait::async_trait;
use std::future::Future;
use std::sync::Arc;
use std::time::Duration;

use crate::errors::{MistralError, MistralResult};

/// Configuration for retry behavior.
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retry attempts.
    pub max_retries: u32,
    /// Initial backoff delay.
    pub initial_backoff: Duration,
    /// Maximum backoff delay.
    pub max_backoff: Duration,
    /// Backoff multiplier.
    pub backoff_multiplier: f64,
    /// Jitter factor (0.0 to 1.0).
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

/// Context passed to retry hooks.
#[derive(Debug, Clone)]
pub struct RetryContext {
    /// Current attempt number (1-indexed).
    pub attempt: u32,
    /// The error that triggered the retry.
    pub error: String,
    /// The calculated delay before retry.
    pub delay: Duration,
    /// The operation being retried.
    pub operation: String,
}

/// Decision returned by retry hooks.
#[derive(Debug, Clone)]
pub enum RetryDecision {
    /// Use default retry behavior.
    Default,
    /// Retry with a custom delay.
    Retry(Duration),
    /// Abort and return the error.
    Abort,
}

/// Hook for custom retry behavior.
#[async_trait]
pub trait RetryHook: Send + Sync {
    /// Called before each retry attempt.
    async fn on_retry(&self, context: RetryContext) -> RetryDecision;
}

/// Retry executor with exponential backoff.
pub struct RetryExecutor {
    config: RetryConfig,
    hook: Option<Arc<dyn RetryHook>>,
}

impl RetryExecutor {
    /// Creates a new retry executor.
    pub fn new(config: RetryConfig) -> Self {
        Self { config, hook: None }
    }

    /// Sets a retry hook.
    pub fn with_hook(mut self, hook: Arc<dyn RetryHook>) -> Self {
        self.hook = Some(hook);
        self
    }

    /// Executes an operation with retry logic.
    pub async fn execute<F, Fut, T>(
        &self,
        operation: &str,
        f: F,
    ) -> MistralResult<T>
    where
        F: Fn() -> Fut + Send,
        Fut: Future<Output = MistralResult<T>> + Send,
        T: Send,
    {
        let mut last_error: Option<MistralError> = None;

        for attempt in 0..=self.config.max_retries {
            match f().await {
                Ok(result) => return Ok(result),
                Err(error) => {
                    // Check if error is retryable
                    if !error.is_retryable() || attempt == self.config.max_retries {
                        return Err(error);
                    }

                    // Calculate delay
                    let server_retry_after = error.retry_after();
                    let delay = self.calculate_backoff(attempt, server_retry_after);

                    // Create context and call hook
                    let context = RetryContext {
                        attempt: attempt + 1,
                        error: error.to_string(),
                        delay,
                        operation: operation.to_string(),
                    };

                    let final_delay = if let Some(hook) = &self.hook {
                        match hook.on_retry(context).await {
                            RetryDecision::Default => delay,
                            RetryDecision::Retry(custom_delay) => custom_delay,
                            RetryDecision::Abort => return Err(error),
                        }
                    } else {
                        delay
                    };

                    // Sleep before retry
                    tokio::time::sleep(final_delay).await;
                    last_error = Some(error);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| MistralError::Internal {
            message: "Retry loop completed without result".to_string(),
            request_id: None,
        }))
    }

    /// Calculates the backoff delay with jitter.
    fn calculate_backoff(
        &self,
        attempt: u32,
        server_retry_after: Option<Duration>,
    ) -> Duration {
        // Use server's retry-after if available
        if let Some(retry_after) = server_retry_after {
            return retry_after;
        }

        // Calculate exponential backoff
        let base_delay = self.config.initial_backoff.as_secs_f64()
            * self.config.backoff_multiplier.powi(attempt as i32);

        // Cap at max backoff
        let capped_delay = base_delay.min(self.config.max_backoff.as_secs_f64());

        // Add jitter
        let jitter_range = capped_delay * self.config.jitter;
        let jitter = (rand::random::<f64>() * 2.0 - 1.0) * jitter_range;
        let final_delay = (capped_delay + jitter).max(0.0);

        Duration::from_secs_f64(final_delay)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_retry_success_first_attempt() {
        let executor = RetryExecutor::new(RetryConfig::default());

        let result = executor
            .execute("test", || async { Ok::<_, MistralError>(42) })
            .await;

        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn test_retry_non_retryable_error() {
        let executor = RetryExecutor::new(RetryConfig::default());

        let result = executor
            .execute("test", || async {
                Err::<i32, _>(MistralError::Authentication {
                    message: "Invalid key".to_string(),
                })
            })
            .await;

        assert!(matches!(result, Err(MistralError::Authentication { .. })));
    }

    #[tokio::test]
    async fn test_backoff_calculation() {
        let executor = RetryExecutor::new(RetryConfig {
            initial_backoff: Duration::from_secs(1),
            max_backoff: Duration::from_secs(60),
            backoff_multiplier: 2.0,
            jitter: 0.0, // No jitter for predictable testing
            ..Default::default()
        });

        let delay0 = executor.calculate_backoff(0, None);
        let delay1 = executor.calculate_backoff(1, None);
        let delay2 = executor.calculate_backoff(2, None);

        assert_eq!(delay0.as_secs(), 1);
        assert_eq!(delay1.as_secs(), 2);
        assert_eq!(delay2.as_secs(), 4);
    }

    #[tokio::test]
    async fn test_server_retry_after_respected() {
        let executor = RetryExecutor::new(RetryConfig::default());

        let server_delay = Duration::from_secs(30);
        let delay = executor.calculate_backoff(0, Some(server_delay));

        assert_eq!(delay, server_delay);
    }
}
