use crate::errors::AnthropicError;
use crate::resilience::circuit_breaker::{CircuitBreaker, CircuitBreakerConfig};
use crate::resilience::rate_limiter::{RateLimiter, RateLimitConfig};
use crate::resilience::retry::{RetryConfig, RetryExecutor};
use async_trait::async_trait;
use std::future::Future;
use std::sync::Arc;

/// Trait for resilience orchestration
#[async_trait]
pub trait ResilienceOrchestrator: Send + Sync {
    async fn execute<F, Fut, T>(&self, operation: &str, f: F) -> Result<T, AnthropicError>
    where
        F: Fn() -> Fut + Send + Sync,
        Fut: Future<Output = Result<T, AnthropicError>> + Send,
        T: Send;
}

/// Configuration for resilience behavior
#[derive(Debug, Clone)]
pub struct ResilienceConfig {
    pub retry: RetryConfig,
    pub circuit_breaker: CircuitBreakerConfig,
    pub rate_limit: RateLimitConfig,
}

impl Default for ResilienceConfig {
    fn default() -> Self {
        Self {
            retry: RetryConfig::default(),
            circuit_breaker: CircuitBreakerConfig::default(),
            rate_limit: RateLimitConfig::default(),
        }
    }
}

/// Default implementation of resilience orchestrator
pub struct DefaultResilienceOrchestrator {
    retry_executor: RetryExecutor,
    circuit_breaker: Arc<CircuitBreaker>,
    rate_limiter: Arc<RateLimiter>,
}

impl DefaultResilienceOrchestrator {
    /// Create a new resilience orchestrator with the given configuration
    pub fn new(config: ResilienceConfig) -> Self {
        Self {
            retry_executor: RetryExecutor::new(config.retry),
            circuit_breaker: Arc::new(CircuitBreaker::new(config.circuit_breaker)),
            rate_limiter: Arc::new(RateLimiter::new(config.rate_limit)),
        }
    }

    /// Create a builder for configuring the orchestrator
    pub fn builder() -> ResilienceOrchestratorBuilder {
        ResilienceOrchestratorBuilder::new()
    }

    /// Create a passthrough orchestrator with no resilience features
    pub fn passthrough() -> Self {
        Self::new(ResilienceConfig {
            retry: RetryConfig {
                max_retries: 0,
                ..Default::default()
            },
            circuit_breaker: CircuitBreakerConfig {
                failure_threshold: u32::MAX,
                ..Default::default()
            },
            rate_limit: RateLimitConfig {
                max_concurrent_requests: usize::MAX,
                requests_per_minute: None,
                tokens_per_minute: None,
                auto_adjust: false,
            },
        })
    }

    /// Get a reference to the circuit breaker
    pub fn circuit_breaker(&self) -> &CircuitBreaker {
        &self.circuit_breaker
    }

    /// Get a reference to the rate limiter
    pub fn rate_limiter(&self) -> &RateLimiter {
        &self.rate_limiter
    }
}

#[async_trait]
impl ResilienceOrchestrator for DefaultResilienceOrchestrator {
    async fn execute<F, Fut, T>(&self, operation: &str, f: F) -> Result<T, AnthropicError>
    where
        F: Fn() -> Fut + Send + Sync,
        Fut: Future<Output = Result<T, AnthropicError>> + Send,
        T: Send,
    {
        // 1. Check circuit breaker
        if self.circuit_breaker.is_open() {
            return Err(AnthropicError::Server {
                message: "Circuit breaker is open".to_string(),
                status_code: Some(503),
            });
        }

        // 2. Acquire rate limit permit
        let _permit = self.rate_limiter.acquire().await?;

        // 3. Execute with retry
        let circuit_breaker = self.circuit_breaker.clone();
        let result = self
            .retry_executor
            .execute(operation, || async {
                let result = f().await;
                match &result {
                    Ok(_) => circuit_breaker.record_success(),
                    Err(e) if e.is_retryable() => circuit_breaker.record_failure(),
                    Err(_) => {}
                }
                result
            })
            .await;

        result
    }
}

/// Builder for configuring resilience orchestrator
pub struct ResilienceOrchestratorBuilder {
    retry_config: RetryConfig,
    circuit_breaker_config: CircuitBreakerConfig,
    rate_limit_config: RateLimitConfig,
}

impl ResilienceOrchestratorBuilder {
    /// Create a new builder with default configuration
    pub fn new() -> Self {
        Self {
            retry_config: RetryConfig::default(),
            circuit_breaker_config: CircuitBreakerConfig::default(),
            rate_limit_config: RateLimitConfig::default(),
        }
    }

    /// Set the retry configuration
    pub fn retry_config(mut self, config: RetryConfig) -> Self {
        self.retry_config = config;
        self
    }

    /// Set the circuit breaker configuration
    pub fn circuit_breaker_config(mut self, config: CircuitBreakerConfig) -> Self {
        self.circuit_breaker_config = config;
        self
    }

    /// Set the rate limit configuration
    pub fn rate_limit_config(mut self, config: RateLimitConfig) -> Self {
        self.rate_limit_config = config;
        self
    }

    /// Build the resilience orchestrator
    pub fn build(self) -> DefaultResilienceOrchestrator {
        DefaultResilienceOrchestrator::new(ResilienceConfig {
            retry: self.retry_config,
            circuit_breaker: self.circuit_breaker_config,
            rate_limit: self.rate_limit_config,
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
    async fn test_orchestrator_executes_successfully() {
        let orchestrator = DefaultResilienceOrchestrator::new(ResilienceConfig::default());

        let result = orchestrator
            .execute("test", || async { Ok(42) })
            .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn test_orchestrator_retries_on_retryable_error() {
        let config = ResilienceConfig {
            retry: RetryConfig {
                max_retries: 3,
                initial_backoff: std::time::Duration::from_millis(10),
                ..Default::default()
            },
            circuit_breaker: CircuitBreakerConfig {
                failure_threshold: 100,
                ..Default::default()
            },
            ..Default::default()
        };
        let orchestrator = DefaultResilienceOrchestrator::new(config);

        let attempt_count = Arc::new(AtomicU32::new(0));
        let attempt_count_clone = attempt_count.clone();

        let result = orchestrator
            .execute("test", move || {
                let count = attempt_count_clone.clone();
                async move {
                    let current = count.fetch_add(1, Ordering::SeqCst);
                    if current < 2 {
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
        assert_eq!(attempt_count.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn test_orchestrator_respects_circuit_breaker() {
        let config = ResilienceConfig {
            retry: RetryConfig {
                max_retries: 0,
                ..Default::default()
            },
            circuit_breaker: CircuitBreakerConfig {
                failure_threshold: 2,
                reset_timeout: std::time::Duration::from_millis(100),
                ..Default::default()
            },
            ..Default::default()
        };
        let orchestrator = DefaultResilienceOrchestrator::new(config);

        // Fail twice to open circuit
        for _ in 0..2 {
            let _ = orchestrator
                .execute("test", || async {
                    Err(AnthropicError::Server {
                        message: "Error".to_string(),
                        status_code: Some(503),
                    })
                })
                .await;
        }

        // Circuit should be open
        let result = orchestrator
            .execute("test", || async { Ok(42) })
            .await;

        assert!(result.is_err());
        if let Err(AnthropicError::Server { message, .. }) = result {
            assert!(message.contains("Circuit breaker is open"));
        } else {
            panic!("Expected circuit breaker error");
        }
    }

    #[tokio::test]
    async fn test_orchestrator_respects_rate_limit() {
        let config = ResilienceConfig {
            retry: RetryConfig {
                max_retries: 0,
                ..Default::default()
            },
            rate_limit: RateLimitConfig {
                max_concurrent_requests: 1,
                requests_per_minute: Some(2),
                tokens_per_minute: None,
                auto_adjust: false,
            },
            ..Default::default()
        };
        let orchestrator = DefaultResilienceOrchestrator::new(config);

        // First two should succeed
        let result1 = orchestrator
            .execute("test", || async { Ok(1) })
            .await;
        assert!(result1.is_ok());

        let result2 = orchestrator
            .execute("test", || async { Ok(2) })
            .await;
        assert!(result2.is_ok());

        // Third should fail due to rate limit
        let result3 = orchestrator
            .execute("test", || async { Ok(3) })
            .await;
        assert!(result3.is_err());
        assert!(matches!(result3, Err(AnthropicError::RateLimit { .. })));
    }

    #[tokio::test]
    async fn test_orchestrator_builder() {
        let orchestrator = ResilienceOrchestratorBuilder::new()
            .retry_config(RetryConfig {
                max_retries: 5,
                ..Default::default()
            })
            .circuit_breaker_config(CircuitBreakerConfig {
                failure_threshold: 10,
                ..Default::default()
            })
            .rate_limit_config(RateLimitConfig {
                max_concurrent_requests: 50,
                ..Default::default()
            })
            .build();

        let result = orchestrator
            .execute("test", || async { Ok(42) })
            .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn test_passthrough_orchestrator() {
        let orchestrator = DefaultResilienceOrchestrator::passthrough();

        // Should execute without any resilience features
        let result = orchestrator
            .execute("test", || async { Ok(42) })
            .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
    }
}
