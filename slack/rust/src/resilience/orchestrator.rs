//! Resilience orchestrator combining retry, circuit breaker, and rate limiting.

use super::{
    CircuitBreaker, CircuitBreakerConfig, CircuitState, RateLimiter, RateLimiterConfig,
    RetryConfig, RetryPolicy,
};
use crate::errors::{SlackError, SlackResult};
use std::future::Future;
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, instrument, warn};

/// Configuration for resilience orchestrator
#[derive(Debug, Clone)]
pub struct ResilienceOrchestratorConfig {
    /// Retry configuration
    pub retry: RetryConfig,
    /// Circuit breaker configuration
    pub circuit_breaker: CircuitBreakerConfig,
    /// Rate limiter configuration
    pub rate_limiter: RateLimiterConfig,
    /// Whether to enable circuit breaker
    pub circuit_breaker_enabled: bool,
    /// Whether to enable rate limiting
    pub rate_limiting_enabled: bool,
}

impl Default for ResilienceOrchestratorConfig {
    fn default() -> Self {
        Self {
            retry: RetryConfig::default(),
            circuit_breaker: CircuitBreakerConfig::default(),
            rate_limiter: RateLimiterConfig::default(),
            circuit_breaker_enabled: true,
            rate_limiting_enabled: true,
        }
    }
}

impl ResilienceOrchestratorConfig {
    /// Create a new configuration
    pub fn new() -> Self {
        Self::default()
    }

    /// Set retry configuration
    pub fn retry(mut self, config: RetryConfig) -> Self {
        self.retry = config;
        self
    }

    /// Set circuit breaker configuration
    pub fn circuit_breaker(mut self, config: CircuitBreakerConfig) -> Self {
        self.circuit_breaker = config;
        self
    }

    /// Set rate limiter configuration
    pub fn rate_limiter(mut self, config: RateLimiterConfig) -> Self {
        self.rate_limiter = config;
        self
    }

    /// Enable or disable circuit breaker
    pub fn enable_circuit_breaker(mut self, enabled: bool) -> Self {
        self.circuit_breaker_enabled = enabled;
        self
    }

    /// Enable or disable rate limiting
    pub fn enable_rate_limiting(mut self, enabled: bool) -> Self {
        self.rate_limiting_enabled = enabled;
        self
    }
}

/// Orchestrator for combining resilience patterns
pub struct ResilienceOrchestrator {
    config: ResilienceOrchestratorConfig,
    circuit_breaker: CircuitBreaker,
    rate_limiter: RateLimiter,
}

impl ResilienceOrchestrator {
    /// Create a new orchestrator with default configuration
    pub fn new() -> Self {
        Self::with_config(ResilienceOrchestratorConfig::default())
    }

    /// Create a new orchestrator with custom configuration
    pub fn with_config(config: ResilienceOrchestratorConfig) -> Self {
        Self {
            circuit_breaker: CircuitBreaker::with_config(config.circuit_breaker.clone()),
            rate_limiter: RateLimiter::with_config(config.rate_limiter.clone()),
            config,
        }
    }

    /// Execute an operation with all resilience patterns applied
    #[instrument(skip(self, operation, policy), fields(endpoint = %endpoint))]
    pub async fn execute<F, Fut, T>(
        &self,
        endpoint: &str,
        policy: &dyn RetryPolicy,
        operation: F,
    ) -> SlackResult<T>
    where
        F: Fn() -> Fut,
        Fut: Future<Output = SlackResult<T>>,
    {
        // Check circuit breaker first
        if self.config.circuit_breaker_enabled {
            let state = self.circuit_breaker.state();
            if state == CircuitState::Open {
                warn!(endpoint, "Circuit breaker is open, rejecting request");
                return Err(SlackError::Server(
                    crate::errors::ServerError::ServiceUnavailable,
                ));
            }
        }

        // Apply rate limiting
        if self.config.rate_limiting_enabled {
            self.rate_limiter.acquire(endpoint).await?;
        }

        // Execute with retry
        let mut attempt = 0;
        loop {
            attempt += 1;

            let result = if self.config.circuit_breaker_enabled {
                self.circuit_breaker.execute(&operation).await
            } else {
                operation().await
            };

            match result {
                Ok(value) => {
                    if attempt > 1 {
                        debug!(endpoint, attempt, "Operation succeeded after retry");
                    }
                    return Ok(value);
                }
                Err(error) => {
                    // Check if we should retry
                    if attempt > self.config.retry.max_retries || !policy.is_retryable(&error) {
                        warn!(
                            endpoint,
                            attempt,
                            max_retries = self.config.retry.max_retries,
                            error = %error,
                            "Operation failed permanently"
                        );
                        return Err(error);
                    }

                    // Calculate delay
                    let delay = policy
                        .get_retry_delay(&error)
                        .unwrap_or_else(|| self.config.retry.delay_for_attempt(attempt));

                    debug!(
                        endpoint,
                        attempt,
                        delay_ms = delay.as_millis(),
                        error = %error,
                        "Retrying operation"
                    );

                    tokio::time::sleep(delay).await;
                }
            }
        }
    }

    /// Execute without retry (single attempt)
    pub async fn execute_once<F, Fut, T>(&self, endpoint: &str, operation: F) -> SlackResult<T>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = SlackResult<T>>,
    {
        // Check circuit breaker
        if self.config.circuit_breaker_enabled {
            let state = self.circuit_breaker.state();
            if state == CircuitState::Open {
                return Err(SlackError::Server(
                    crate::errors::ServerError::ServiceUnavailable,
                ));
            }
        }

        // Apply rate limiting
        if self.config.rate_limiting_enabled {
            self.rate_limiter.acquire(endpoint).await?;
        }

        // Execute
        if self.config.circuit_breaker_enabled {
            self.circuit_breaker.execute(operation).await
        } else {
            operation().await
        }
    }

    /// Get the circuit breaker state
    pub fn circuit_state(&self) -> CircuitState {
        self.circuit_breaker.state()
    }

    /// Reset the circuit breaker
    pub fn reset_circuit(&self) {
        self.circuit_breaker.reset();
    }

    /// Update rate limit from response headers
    pub fn update_rate_limit(
        &self,
        endpoint: &str,
        remaining: Option<u32>,
        reset_after: Option<Duration>,
    ) {
        self.rate_limiter
            .update_from_headers(endpoint, remaining, reset_after);
    }

    /// Configure rate limit for a specific endpoint
    pub fn configure_endpoint_rate_limit(&self, endpoint: &str, config: RateLimiterConfig) {
        self.rate_limiter.configure_endpoint(endpoint, config);
    }

    /// Get remaining rate limit for an endpoint
    pub fn remaining_rate_limit(&self, endpoint: &str) -> f64 {
        self.rate_limiter.remaining(endpoint)
    }

    /// Get circuit breaker metrics
    pub fn circuit_metrics(&self) -> CircuitMetrics {
        CircuitMetrics {
            state: self.circuit_breaker.state(),
            total_calls: self.circuit_breaker.total_calls(),
            total_failures: self.circuit_breaker.total_failures(),
            total_rejections: self.circuit_breaker.total_rejections(),
            failure_rate: self.circuit_breaker.failure_rate(),
        }
    }
}

impl Default for ResilienceOrchestrator {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Debug for ResilienceOrchestrator {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ResilienceOrchestrator")
            .field("config", &self.config)
            .field("circuit_state", &self.circuit_state())
            .finish()
    }
}

/// Circuit breaker metrics
#[derive(Debug, Clone)]
pub struct CircuitMetrics {
    /// Current state
    pub state: CircuitState,
    /// Total calls
    pub total_calls: u64,
    /// Total failures
    pub total_failures: u64,
    /// Total rejections
    pub total_rejections: u64,
    /// Failure rate (0.0 to 1.0)
    pub failure_rate: f64,
}

/// Create a shared orchestrator
pub fn create_orchestrator() -> Arc<ResilienceOrchestrator> {
    Arc::new(ResilienceOrchestrator::new())
}

/// Create a shared orchestrator with custom configuration
pub fn create_orchestrator_with_config(
    config: ResilienceOrchestratorConfig,
) -> Arc<ResilienceOrchestrator> {
    Arc::new(ResilienceOrchestrator::with_config(config))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::NetworkError;
    use crate::resilience::retry::DefaultRetryPolicy;
    use std::sync::atomic::{AtomicU32, Ordering};

    #[tokio::test]
    async fn test_orchestrator_success() {
        let orchestrator = ResilienceOrchestrator::with_config(
            ResilienceOrchestratorConfig::new()
                .enable_rate_limiting(false)
                .enable_circuit_breaker(false),
        );

        let result = orchestrator
            .execute("test", &DefaultRetryPolicy, || async {
                Ok::<_, SlackError>("success")
            })
            .await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_orchestrator_retry() {
        let attempts = Arc::new(AtomicU32::new(0));
        let attempts_clone = attempts.clone();

        let orchestrator = ResilienceOrchestrator::with_config(
            ResilienceOrchestratorConfig::new()
                .retry(
                    RetryConfig::new()
                        .max_retries(3)
                        .initial_delay(Duration::from_millis(1)),
                )
                .enable_rate_limiting(false)
                .enable_circuit_breaker(false),
        );

        let result = orchestrator
            .execute("test", &DefaultRetryPolicy, || {
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
    async fn test_orchestrator_with_circuit_breaker() {
        let orchestrator = ResilienceOrchestrator::with_config(
            ResilienceOrchestratorConfig::new()
                .circuit_breaker(CircuitBreakerConfig::new().failure_threshold(2))
                .retry(RetryConfig::new().max_retries(0))
                .enable_rate_limiting(false),
        );

        // Trip the circuit breaker
        for _ in 0..2 {
            let _ = orchestrator
                .execute_once("test", || async {
                    Err::<(), _>(SlackError::Network(NetworkError::Timeout))
                })
                .await;
        }

        assert_eq!(orchestrator.circuit_state(), CircuitState::Open);

        // Should be rejected
        let result = orchestrator
            .execute_once("test", || async { Ok::<_, SlackError>("success") })
            .await;

        assert!(result.is_err());
    }

    #[test]
    fn test_circuit_metrics() {
        let orchestrator = ResilienceOrchestrator::new();
        let metrics = orchestrator.circuit_metrics();

        assert_eq!(metrics.state, CircuitState::Closed);
        assert_eq!(metrics.total_calls, 0);
        assert_eq!(metrics.failure_rate, 0.0);
    }
}
