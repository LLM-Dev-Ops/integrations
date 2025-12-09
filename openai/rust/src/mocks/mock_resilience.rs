//! Mock resilience orchestrator for testing

use crate::errors::{OpenAIError, OpenAIResult, ServerError};
use crate::resilience::ResilienceOrchestrator;
use async_trait::async_trait;
use std::future::Future;
use std::sync::{Arc, Mutex};

/// Mock resilience orchestrator that allows testing retry and circuit breaker behavior
#[derive(Clone)]
pub struct MockResilienceOrchestrator {
    inner: Arc<Mutex<MockResilienceOrchestratorInner>>,
}

struct MockResilienceOrchestratorInner {
    execution_count: usize,
    should_retry: bool,
    max_retries: usize,
    should_fail_after: Option<usize>,
}

impl MockResilienceOrchestrator {
    /// Create a new mock resilience orchestrator with default settings
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(MockResilienceOrchestratorInner {
                execution_count: 0,
                should_retry: false,
                max_retries: 3,
                should_fail_after: None,
            })),
        }
    }

    /// Create a passthrough mock that executes operations without any resilience logic
    pub fn passthrough() -> Self {
        Self::new()
    }

    /// Configure the mock to enable retry behavior
    pub fn with_retry(self, max_retries: usize) -> Self {
        let mut inner = self.inner.lock().unwrap();
        inner.should_retry = true;
        inner.max_retries = max_retries;
        drop(inner);
        self
    }

    /// Configure the mock to fail after a certain number of executions
    pub fn with_failure_after(self, count: usize) -> Self {
        let mut inner = self.inner.lock().unwrap();
        inner.should_fail_after = Some(count);
        drop(inner);
        self
    }

    /// Get the number of times execute was called
    pub fn execution_count(&self) -> usize {
        let inner = self.inner.lock().unwrap();
        inner.execution_count
    }

    /// Reset the mock
    pub fn reset(&self) {
        let mut inner = self.inner.lock().unwrap();
        inner.execution_count = 0;
        inner.should_retry = false;
        inner.max_retries = 3;
        inner.should_fail_after = None;
    }
}

impl Default for MockResilienceOrchestrator {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ResilienceOrchestrator for MockResilienceOrchestrator {
    async fn execute<F, Fut, T>(&self, operation: F) -> OpenAIResult<T>
    where
        F: Fn() -> Fut + Send + Sync,
        Fut: Future<Output = OpenAIResult<T>> + Send,
        T: Send,
    {
        let mut inner = self.inner.lock().unwrap();
        inner.execution_count += 1;
        let count = inner.execution_count;
        let should_fail = inner
            .should_fail_after
            .map(|n| count > n)
            .unwrap_or(false);
        drop(inner);

        if should_fail {
            return Err(OpenAIError::Server(ServerError::InternalError(
                "Mock resilience failure".to_string(),
            )));
        }

        operation().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_resilience_passthrough() {
        let mock = MockResilienceOrchestrator::passthrough();

        let result = mock
            .execute(|| async { Ok::<_, OpenAIError>("test") })
            .await;

        assert!(result.is_ok());
        assert_eq!(mock.execution_count(), 1);
    }

    #[tokio::test]
    async fn test_mock_resilience_failure_after() {
        let mock = MockResilienceOrchestrator::new().with_failure_after(2);

        // First two executions should succeed
        for _ in 0..2 {
            let result = mock
                .execute(|| async { Ok::<_, OpenAIError>("test") })
                .await;
            assert!(result.is_ok());
        }

        // Third execution should fail
        let result = mock
            .execute(|| async { Ok::<_, OpenAIError>("test") })
            .await;
        assert!(result.is_err());
        assert_eq!(mock.execution_count(), 3);
    }
}
