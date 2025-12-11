//! Resilience orchestrator combining all patterns.

use super::{
    CircuitBreaker, CircuitBreakerConfig, RateLimitConfig, RateLimiter, RetryConfig, RetryExecutor,
};
use crate::errors::{CohereError, CohereResult};
use std::future::Future;
use std::sync::Arc;

/// Configuration for the resilience orchestrator
#[derive(Debug, Clone)]
pub struct ResilienceConfig {
    /// Retry configuration
    pub retry: RetryConfig,
    /// Circuit breaker configuration
    pub circuit_breaker: CircuitBreakerConfig,
    /// Rate limit configuration
    pub rate_limit: RateLimitConfig,
    /// Whether to enable retry
    pub enable_retry: bool,
    /// Whether to enable circuit breaker
    pub enable_circuit_breaker: bool,
    /// Whether to enable rate limiting
    pub enable_rate_limit: bool,
}

impl Default for ResilienceConfig {
    fn default() -> Self {
        Self {
            retry: RetryConfig::default(),
            circuit_breaker: CircuitBreakerConfig::default(),
            rate_limit: RateLimitConfig::default(),
            enable_retry: true,
            enable_circuit_breaker: true,
            enable_rate_limit: true,
        }
    }
}

impl ResilienceConfig {
    /// Create a new resilience configuration
    pub fn new() -> Self {
        Self::default()
    }

    /// Set retry configuration
    pub fn with_retry(mut self, config: RetryConfig) -> Self {
        self.retry = config;
        self
    }

    /// Set circuit breaker configuration
    pub fn with_circuit_breaker(mut self, config: CircuitBreakerConfig) -> Self {
        self.circuit_breaker = config;
        self
    }

    /// Set rate limit configuration
    pub fn with_rate_limit(mut self, config: RateLimitConfig) -> Self {
        self.rate_limit = config;
        self
    }

    /// Enable or disable retry
    pub fn enable_retry(mut self, enable: bool) -> Self {
        self.enable_retry = enable;
        self
    }

    /// Enable or disable circuit breaker
    pub fn enable_circuit_breaker(mut self, enable: bool) -> Self {
        self.enable_circuit_breaker = enable;
        self
    }

    /// Enable or disable rate limiting
    pub fn enable_rate_limit(mut self, enable: bool) -> Self {
        self.enable_rate_limit = enable;
        self
    }
}

/// Trait for resilience orchestration
pub trait ResilienceOrchestrator: Send + Sync {
    /// Execute an operation with full resilience support
    fn execute<'a, F, Fut, T>(
        &'a self,
        operation: F,
    ) -> std::pin::Pin<Box<dyn Future<Output = CohereResult<T>> + Send + 'a>>
    where
        F: Fn() -> Fut + Send + Sync + 'a,
        Fut: Future<Output = CohereResult<T>> + Send + 'a,
        T: Send + 'a;
}

/// Builder for ResilienceOrchestrator
pub struct ResilienceOrchestratorBuilder {
    config: ResilienceConfig,
}

impl ResilienceOrchestratorBuilder {
    /// Create a new builder
    pub fn new() -> Self {
        Self {
            config: ResilienceConfig::default(),
        }
    }

    /// Set the full configuration
    pub fn with_config(mut self, config: ResilienceConfig) -> Self {
        self.config = config;
        self
    }

    /// Set retry configuration
    pub fn retry(mut self, config: RetryConfig) -> Self {
        self.config.retry = config;
        self
    }

    /// Set circuit breaker configuration
    pub fn circuit_breaker(mut self, config: CircuitBreakerConfig) -> Self {
        self.config.circuit_breaker = config;
        self
    }

    /// Set rate limit configuration
    pub fn rate_limit(mut self, config: RateLimitConfig) -> Self {
        self.config.rate_limit = config;
        self
    }

    /// Build the orchestrator
    pub fn build(self) -> DefaultResilienceOrchestrator {
        DefaultResilienceOrchestrator::new(self.config)
    }
}

impl Default for ResilienceOrchestratorBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// Default implementation of resilience orchestrator
pub struct DefaultResilienceOrchestrator {
    config: ResilienceConfig,
    retry_executor: RetryExecutor,
    circuit_breaker: Arc<CircuitBreaker>,
    rate_limiter: Arc<RateLimiter>,
}

impl DefaultResilienceOrchestrator {
    /// Create a new orchestrator with default configuration
    pub fn new(config: ResilienceConfig) -> Self {
        let retry_executor = RetryExecutor::with_config(config.retry.clone());
        let circuit_breaker = Arc::new(CircuitBreaker::with_config(config.circuit_breaker.clone()));
        let rate_limiter = Arc::new(RateLimiter::with_config(config.rate_limit.clone()));

        Self {
            config,
            retry_executor,
            circuit_breaker,
            rate_limiter,
        }
    }

    /// Create a builder
    pub fn builder() -> ResilienceOrchestratorBuilder {
        ResilienceOrchestratorBuilder::new()
    }

    /// Get the circuit breaker
    pub fn circuit_breaker(&self) -> Arc<CircuitBreaker> {
        self.circuit_breaker.clone()
    }

    /// Get the rate limiter
    pub fn rate_limiter(&self) -> Arc<RateLimiter> {
        self.rate_limiter.clone()
    }

    /// Get the configuration
    pub fn config(&self) -> &ResilienceConfig {
        &self.config
    }
}

impl ResilienceOrchestrator for DefaultResilienceOrchestrator {
    fn execute<'a, F, Fut, T>(
        &'a self,
        operation: F,
    ) -> std::pin::Pin<Box<dyn Future<Output = CohereResult<T>> + Send + 'a>>
    where
        F: Fn() -> Fut + Send + Sync + 'a,
        Fut: Future<Output = CohereResult<T>> + Send + 'a,
        T: Send + 'a,
    {
        let circuit_breaker = self.circuit_breaker.clone();
        let rate_limiter = self.rate_limiter.clone();
        let enable_cb = self.config.enable_circuit_breaker;
        let enable_rl = self.config.enable_rate_limit;
        let enable_retry = self.config.enable_retry;
        let retry_config = self.config.retry.clone();

        Box::pin(async move {
            // Check circuit breaker first
            if enable_cb && !circuit_breaker.allow_request() {
                return Err(CohereError::Server {
                    message: "Circuit breaker is open".to_string(),
                    status_code: Some(503),
                });
            }

            // Acquire rate limit permit
            if enable_rl {
                rate_limiter.acquire().await?;
            }

            // Execute with retry
            let result = if enable_retry {
                let retry_executor = RetryExecutor::with_config(retry_config);
                retry_executor.execute(&operation).await
            } else {
                operation().await
            };

            // Update circuit breaker based on result
            if enable_cb {
                match &result {
                    Ok(_) => circuit_breaker.record_success(),
                    Err(e) if e.is_retryable() => circuit_breaker.record_failure(),
                    _ => {}
                }
            }

            result
        })
    }
}

impl Default for DefaultResilienceOrchestrator {
    fn default() -> Self {
        Self::new(ResilienceConfig::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    #[test]
    fn test_resilience_config_builder() {
        let config = ResilienceConfig::new()
            .with_retry(RetryConfig::new().with_max_retries(5))
            .enable_circuit_breaker(false);

        assert_eq!(config.retry.max_retries, 5);
        assert!(!config.enable_circuit_breaker);
    }

    #[test]
    fn test_orchestrator_builder() {
        let orchestrator = DefaultResilienceOrchestrator::builder()
            .retry(RetryConfig::new().with_max_retries(2))
            .build();

        assert_eq!(orchestrator.config().retry.max_retries, 2);
    }

    #[tokio::test]
    async fn test_orchestrator_execute_success() {
        let orchestrator = DefaultResilienceOrchestrator::builder()
            .with_config(
                ResilienceConfig::new()
                    .enable_retry(false)
                    .enable_circuit_breaker(false)
                    .enable_rate_limit(false),
            )
            .build();

        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();

        let result: CohereResult<String> = orchestrator
            .execute(move || {
                let counter = counter_clone.clone();
                async move {
                    counter.fetch_add(1, Ordering::SeqCst);
                    Ok("success".to_string())
                }
            })
            .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "success");
        assert_eq!(counter.load(Ordering::SeqCst), 1);
    }
}
