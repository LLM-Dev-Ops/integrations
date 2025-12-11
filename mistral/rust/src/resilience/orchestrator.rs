//! Resilience orchestrator combining retry, circuit breaker, and rate limiting.

use async_trait::async_trait;
use std::future::Future;
use std::sync::Arc;

use super::{
    CircuitBreaker, CircuitBreakerConfig, RateLimiter, RateLimiterConfig, RetryConfig,
    RetryExecutor,
};
use crate::errors::{MistralError, MistralResult};

/// Configuration for the resilience orchestrator.
#[derive(Debug, Clone)]
pub struct ResilienceConfig {
    /// Retry configuration.
    pub retry: RetryConfig,
    /// Circuit breaker configuration.
    pub circuit_breaker: CircuitBreakerConfig,
    /// Rate limiter configuration.
    pub rate_limiter: RateLimiterConfig,
}

impl Default for ResilienceConfig {
    fn default() -> Self {
        Self {
            retry: RetryConfig::default(),
            circuit_breaker: CircuitBreakerConfig::default(),
            rate_limiter: RateLimiterConfig::default(),
        }
    }
}

/// Trait for resilience orchestrators.
#[async_trait]
pub trait ResilienceOrchestrator: Send + Sync {
    /// Executes an operation with resilience patterns applied.
    async fn execute<F, Fut, T>(&self, operation: &str, f: F) -> MistralResult<T>
    where
        F: Fn() -> Fut + Send + Sync,
        Fut: Future<Output = MistralResult<T>> + Send,
        T: Send;
}

/// Default resilience orchestrator implementation.
pub struct DefaultResilienceOrchestrator {
    retry_executor: RetryExecutor,
    circuit_breaker: Arc<CircuitBreaker>,
    rate_limiter: Arc<RateLimiter>,
}

impl DefaultResilienceOrchestrator {
    /// Creates a new resilience orchestrator.
    pub fn new(config: ResilienceConfig) -> Self {
        Self {
            retry_executor: RetryExecutor::new(config.retry),
            circuit_breaker: Arc::new(CircuitBreaker::new(config.circuit_breaker)),
            rate_limiter: Arc::new(RateLimiter::new(config.rate_limiter)),
        }
    }

    /// Creates a builder for configuration.
    pub fn builder() -> ResilienceOrchestratorBuilder {
        ResilienceOrchestratorBuilder::new()
    }

    /// Creates a passthrough orchestrator that doesn't apply resilience patterns.
    pub fn passthrough() -> Self {
        Self {
            retry_executor: RetryExecutor::new(RetryConfig {
                max_retries: 0,
                ..Default::default()
            }),
            circuit_breaker: Arc::new(CircuitBreaker::new(CircuitBreakerConfig {
                failure_threshold: u32::MAX,
                ..Default::default()
            })),
            rate_limiter: Arc::new(RateLimiter::new(RateLimiterConfig {
                max_concurrent_requests: usize::MAX,
                ..Default::default()
            })),
        }
    }

    /// Returns the circuit breaker.
    pub fn circuit_breaker(&self) -> &CircuitBreaker {
        &self.circuit_breaker
    }

    /// Returns the rate limiter.
    pub fn rate_limiter(&self) -> &RateLimiter {
        &self.rate_limiter
    }
}

#[async_trait]
impl ResilienceOrchestrator for DefaultResilienceOrchestrator {
    async fn execute<F, Fut, T>(&self, operation: &str, f: F) -> MistralResult<T>
    where
        F: Fn() -> Fut + Send + Sync,
        Fut: Future<Output = MistralResult<T>> + Send,
        T: Send,
    {
        // Check circuit breaker first (fail fast)
        self.circuit_breaker.allow_request().await?;

        // Acquire rate limit permit
        let _permit = self.rate_limiter.acquire().await?;

        // Execute with retry logic
        let circuit_breaker = self.circuit_breaker.clone();

        let result = self
            .retry_executor
            .execute(operation, || async {
                // Check circuit breaker on each retry
                circuit_breaker.allow_request().await?;
                f().await
            })
            .await;

        // Record result in circuit breaker
        match &result {
            Ok(_) => self.circuit_breaker.record_success().await,
            Err(err) if err.should_circuit_break() => {
                self.circuit_breaker.record_failure().await;
            }
            Err(_) => {
                // Don't count non-circuit-breaking errors
            }
        }

        result
    }
}

/// Builder for resilience orchestrator.
pub struct ResilienceOrchestratorBuilder {
    retry_config: RetryConfig,
    circuit_breaker_config: CircuitBreakerConfig,
    rate_limiter_config: RateLimiterConfig,
}

impl ResilienceOrchestratorBuilder {
    /// Creates a new builder.
    pub fn new() -> Self {
        Self {
            retry_config: RetryConfig::default(),
            circuit_breaker_config: CircuitBreakerConfig::default(),
            rate_limiter_config: RateLimiterConfig::default(),
        }
    }

    /// Sets retry configuration.
    pub fn retry_config(mut self, config: RetryConfig) -> Self {
        self.retry_config = config;
        self
    }

    /// Sets circuit breaker configuration.
    pub fn circuit_breaker_config(mut self, config: CircuitBreakerConfig) -> Self {
        self.circuit_breaker_config = config;
        self
    }

    /// Sets rate limiter configuration.
    pub fn rate_limiter_config(mut self, config: RateLimiterConfig) -> Self {
        self.rate_limiter_config = config;
        self
    }

    /// Builds the orchestrator.
    pub fn build(self) -> DefaultResilienceOrchestrator {
        DefaultResilienceOrchestrator::new(ResilienceConfig {
            retry: self.retry_config,
            circuit_breaker: self.circuit_breaker_config,
            rate_limiter: self.rate_limiter_config,
        })
    }
}

impl Default for ResilienceOrchestratorBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    #[tokio::test]
    async fn test_orchestrator_success() {
        let orchestrator = DefaultResilienceOrchestrator::new(ResilienceConfig::default());

        let result = orchestrator
            .execute("test", || async { Ok::<_, MistralError>(42) })
            .await;

        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn test_orchestrator_retry_on_transient_error() {
        let orchestrator = DefaultResilienceOrchestrator::new(ResilienceConfig {
            retry: RetryConfig {
                max_retries: 3,
                initial_backoff: std::time::Duration::from_millis(1),
                ..Default::default()
            },
            ..Default::default()
        });

        let attempts = Arc::new(AtomicU32::new(0));
        let attempts_clone = attempts.clone();

        let result = orchestrator
            .execute("test", move || {
                let count = attempts_clone.fetch_add(1, Ordering::Relaxed);
                async move {
                    if count < 2 {
                        Err(MistralError::ServiceUnavailable {
                            message: "Temporary error".to_string(),
                            retry_after: None,
                        })
                    } else {
                        Ok(42)
                    }
                }
            })
            .await;

        assert_eq!(result.unwrap(), 42);
        assert_eq!(attempts.load(Ordering::Relaxed), 3);
    }

    #[tokio::test]
    async fn test_orchestrator_circuit_breaker_opens() {
        let orchestrator = DefaultResilienceOrchestrator::new(ResilienceConfig {
            circuit_breaker: CircuitBreakerConfig {
                failure_threshold: 2,
                ..Default::default()
            },
            retry: RetryConfig {
                max_retries: 0,
                ..Default::default()
            },
            ..Default::default()
        });

        // Trigger failures
        for _ in 0..2 {
            let _ = orchestrator
                .execute::<_, _, i32>("test", || async {
                    Err(MistralError::ServiceUnavailable {
                        message: "Error".to_string(),
                        retry_after: None,
                    })
                })
                .await;
        }

        // Circuit should be open
        let result = orchestrator
            .execute("test", || async { Ok::<_, MistralError>(42) })
            .await;

        assert!(matches!(result, Err(MistralError::CircuitOpen)));
    }
}
