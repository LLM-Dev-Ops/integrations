//! Resilience layer for S3 operations.
//!
//! This module provides retry logic, circuit breaker, and rate limiting.

mod circuit_breaker;
mod rate_limiter;
mod retry;

pub use circuit_breaker::{CircuitBreaker, CircuitBreakerConfig, CircuitState};
pub use rate_limiter::{RateLimiter, RateLimiterConfig};
pub use retry::{RetryConfig, RetryPolicy};

use crate::error::S3Error;
use std::future::Future;
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, warn};

/// Resilience configuration combining retry, circuit breaker, and rate limiting.
#[derive(Debug, Clone)]
pub struct ResilienceConfig {
    /// Retry configuration.
    pub retry: RetryConfig,
    /// Circuit breaker configuration.
    pub circuit_breaker: CircuitBreakerConfig,
    /// Rate limiter configuration.
    pub rate_limiter: Option<RateLimiterConfig>,
}

impl Default for ResilienceConfig {
    fn default() -> Self {
        Self {
            retry: RetryConfig::default(),
            circuit_breaker: CircuitBreakerConfig::default(),
            rate_limiter: None,
        }
    }
}

/// Resilience layer that wraps operations with retry, circuit breaker, and rate limiting.
pub struct Resilience {
    retry_policy: RetryPolicy,
    circuit_breaker: CircuitBreaker,
    rate_limiter: Option<RateLimiter>,
}

impl Resilience {
    /// Create a new resilience layer with the given configuration.
    pub fn new(config: ResilienceConfig) -> Self {
        Self {
            retry_policy: RetryPolicy::new(config.retry),
            circuit_breaker: CircuitBreaker::new(config.circuit_breaker),
            rate_limiter: config.rate_limiter.map(RateLimiter::new),
        }
    }

    /// Execute an operation with resilience features.
    pub async fn execute<F, Fut, T>(&self, operation: F) -> Result<T, S3Error>
    where
        F: Fn() -> Fut,
        Fut: Future<Output = Result<T, S3Error>>,
    {
        // Check rate limiter
        if let Some(limiter) = &self.rate_limiter {
            limiter.acquire().await;
        }

        // Check circuit breaker
        if !self.circuit_breaker.is_allowed() {
            return Err(S3Error::Server(crate::error::ServerError::ServiceUnavailable {
                retry_after: Some(Duration::from_secs(30)),
                request_id: None,
            }));
        }

        // Execute with retry
        let result = self.retry_policy.execute(&operation).await;

        // Update circuit breaker
        match &result {
            Ok(_) => self.circuit_breaker.record_success(),
            Err(e) if e.is_retryable() => self.circuit_breaker.record_failure(),
            _ => {}
        }

        result
    }

    /// Get the current circuit breaker state.
    pub fn circuit_state(&self) -> CircuitState {
        self.circuit_breaker.state()
    }

    /// Reset the circuit breaker.
    pub fn reset_circuit(&self) {
        self.circuit_breaker.reset();
    }
}

impl std::fmt::Debug for Resilience {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Resilience")
            .field("circuit_state", &self.circuit_state())
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_resilience_success() {
        let config = ResilienceConfig::default();
        let resilience = Resilience::new(config);

        let result: Result<i32, S3Error> = resilience.execute(|| async { Ok(42) }).await;
        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn test_resilience_failure() {
        let config = ResilienceConfig {
            retry: RetryConfig {
                max_retries: 0,
                ..Default::default()
            },
            ..Default::default()
        };
        let resilience = Resilience::new(config);

        let result: Result<i32, S3Error> = resilience
            .execute(|| async {
                Err(S3Error::Response(crate::error::ResponseError::InvalidResponse {
                    message: "test".to_string(),
                }))
            })
            .await;

        assert!(result.is_err());
    }
}
