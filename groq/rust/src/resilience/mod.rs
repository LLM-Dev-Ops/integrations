//! Resilience layer for the Groq client.
//!
//! Provides retry policies, circuit breaker, and rate limiting for
//! reliable API communication.

mod circuit_breaker;
mod rate_limit;
mod retry;

pub use circuit_breaker::{CircuitBreaker, CircuitBreakerConfig, CircuitState};
pub use rate_limit::{RateLimitInfo, RateLimitManager, RateLimitType};
pub use retry::{RetryConfig, RetryPolicy};

use std::future::Future;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

use crate::errors::GroqError;

/// Configuration for the resilience orchestrator.
#[derive(Debug, Clone)]
pub struct ResilienceConfig {
    /// Retry configuration.
    pub retry: RetryConfig,
    /// Circuit breaker configuration.
    pub circuit_breaker: CircuitBreakerConfig,
    /// Enable rate limit tracking.
    pub track_rate_limits: bool,
}

impl Default for ResilienceConfig {
    fn default() -> Self {
        Self {
            retry: RetryConfig::default(),
            circuit_breaker: CircuitBreakerConfig::default(),
            track_rate_limits: true,
        }
    }
}

/// Orchestrates retry, circuit breaker, and rate limiting.
pub struct ResilienceOrchestrator {
    retry_policy: RetryPolicy,
    circuit_breaker: Arc<RwLock<CircuitBreaker>>,
    rate_limiter: Arc<RwLock<RateLimitManager>>,
}

impl ResilienceOrchestrator {
    /// Creates a new resilience orchestrator.
    pub fn new(config: ResilienceConfig) -> Self {
        Self {
            retry_policy: RetryPolicy::new(config.retry),
            circuit_breaker: Arc::new(RwLock::new(CircuitBreaker::new(config.circuit_breaker))),
            rate_limiter: Arc::new(RwLock::new(RateLimitManager::new())),
        }
    }

    /// Creates with default configuration.
    pub fn default_config() -> Self {
        Self::new(ResilienceConfig::default())
    }

    /// Executes an operation with resilience patterns applied.
    pub async fn execute<F, Fut, T>(&self, operation: F) -> Result<T, GroqError>
    where
        F: Fn() -> Fut,
        Fut: Future<Output = Result<T, GroqError>>,
    {
        // Check circuit breaker
        {
            let cb = self.circuit_breaker.read().await;
            if !cb.allow_request() {
                return Err(GroqError::CircuitOpen);
            }
        }

        // Check rate limits
        {
            let rate_limiter = self.rate_limiter.read().await;
            if let Some(wait) = rate_limiter.should_wait() {
                tracing::info!(wait_ms = wait.as_millis(), "Rate limit throttling");
                tokio::time::sleep(wait).await;
            }
        }

        // Execute with retry
        let result = self.retry_policy.execute(&operation).await;

        // Update circuit breaker based on result
        {
            let mut cb = self.circuit_breaker.write().await;
            match &result {
                Ok(_) => cb.record_success(),
                Err(e) if e.should_circuit_break() => cb.record_failure(),
                Err(_) => {} // Non-circuit-breaking errors don't affect CB
            }
        }

        result
    }

    /// Updates rate limit information from response headers.
    pub async fn update_rate_limits(&self, headers: &std::collections::HashMap<String, String>) {
        let mut rate_limiter = self.rate_limiter.write().await;
        rate_limiter.update_from_headers(headers);
    }

    /// Returns the rate limiter for direct access.
    pub fn rate_limiter(&self) -> Arc<RwLock<RateLimitManager>> {
        Arc::clone(&self.rate_limiter)
    }

    /// Returns the circuit breaker for direct access.
    pub fn circuit_breaker(&self) -> Arc<RwLock<CircuitBreaker>> {
        Arc::clone(&self.circuit_breaker)
    }

    /// Checks if the circuit breaker is open.
    pub async fn is_circuit_open(&self) -> bool {
        let cb = self.circuit_breaker.read().await;
        matches!(cb.state(), CircuitState::Open)
    }

    /// Gets current rate limit info.
    pub async fn rate_limit_info(&self) -> RateLimitInfo {
        let rate_limiter = self.rate_limiter.read().await;
        rate_limiter.info()
    }
}

impl Default for ResilienceOrchestrator {
    fn default() -> Self {
        Self::default_config()
    }
}

impl std::fmt::Debug for ResilienceOrchestrator {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ResilienceOrchestrator")
            .field("retry_policy", &self.retry_policy)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_orchestrator_success() {
        let orchestrator = ResilienceOrchestrator::default();

        let result = orchestrator
            .execute(|| async { Ok::<_, GroqError>("success") })
            .await;

        assert_eq!(result.unwrap(), "success");
    }

    #[tokio::test]
    async fn test_orchestrator_circuit_breaker() {
        let config = ResilienceConfig {
            circuit_breaker: CircuitBreakerConfig {
                failure_threshold: 2,
                success_threshold: 1,
                open_duration: Duration::from_millis(100),
            },
            ..Default::default()
        };

        let orchestrator = ResilienceOrchestrator::new(config);

        // Cause failures to open circuit
        for _ in 0..3 {
            let _ = orchestrator
                .execute(|| async {
                    Err::<(), _>(GroqError::Server {
                        message: "error".to_string(),
                        status_code: 500,
                        request_id: None,
                    })
                })
                .await;
        }

        // Circuit should be open
        assert!(orchestrator.is_circuit_open().await);

        // Requests should fail with CircuitOpen
        let result = orchestrator
            .execute(|| async { Ok::<_, GroqError>("success") })
            .await;

        assert!(matches!(result, Err(GroqError::CircuitOpen)));
    }
}
