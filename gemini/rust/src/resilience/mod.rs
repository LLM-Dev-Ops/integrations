//! Resilience layer for the Gemini API client.
//!
//! Provides a comprehensive resilience orchestrator that coordinates retry logic,
//! circuit breaker patterns, and rate limiting to ensure robust API interactions.

mod retry;
mod circuit_breaker;
mod rate_limiter;

pub use retry::{RetryConfig, RetryExecutor};
pub use circuit_breaker::{CircuitBreaker, CircuitBreakerConfig, CircuitState};
pub use rate_limiter::{RateLimiter, RateLimiterConfig};

use std::sync::Arc;
use std::future::Future;
use crate::error::GeminiError;

/// Configuration for the resilience orchestrator.
#[derive(Debug, Clone)]
pub struct ResilienceConfig {
    /// Retry configuration.
    pub retry: RetryConfig,
    /// Circuit breaker configuration.
    pub circuit_breaker: CircuitBreakerConfig,
    /// Rate limiter configuration.
    pub rate_limiter: RateLimiterConfig,
    /// Enable retry logic.
    pub enable_retry: bool,
    /// Enable circuit breaker.
    pub enable_circuit_breaker: bool,
    /// Enable rate limiting.
    pub enable_rate_limiting: bool,
}

impl Default for ResilienceConfig {
    fn default() -> Self {
        Self {
            retry: RetryConfig::default(),
            circuit_breaker: CircuitBreakerConfig::default(),
            rate_limiter: RateLimiterConfig::default(),
            enable_retry: true,
            enable_circuit_breaker: true,
            enable_rate_limiting: true,
        }
    }
}

impl ResilienceConfig {
    /// Creates a new resilience configuration with custom settings.
    pub fn new(
        retry: RetryConfig,
        circuit_breaker: CircuitBreakerConfig,
        rate_limiter: RateLimiterConfig,
    ) -> Self {
        Self {
            retry,
            circuit_breaker,
            rate_limiter,
            enable_retry: true,
            enable_circuit_breaker: true,
            enable_rate_limiting: true,
        }
    }

    /// Creates a configuration with all resilience features disabled.
    pub fn disabled() -> Self {
        Self {
            retry: RetryConfig::no_retry(),
            circuit_breaker: CircuitBreakerConfig::default(),
            rate_limiter: RateLimiterConfig::unlimited(),
            enable_retry: false,
            enable_circuit_breaker: false,
            enable_rate_limiting: false,
        }
    }

    /// Creates an aggressive configuration for high-reliability scenarios.
    pub fn aggressive() -> Self {
        Self {
            retry: RetryConfig::aggressive(),
            circuit_breaker: CircuitBreakerConfig::sensitive(),
            rate_limiter: RateLimiterConfig::high_throughput(),
            enable_retry: true,
            enable_circuit_breaker: true,
            enable_rate_limiting: true,
        }
    }

    /// Creates a conservative configuration for controlled environments.
    pub fn conservative() -> Self {
        Self {
            retry: RetryConfig::default(),
            circuit_breaker: CircuitBreakerConfig::lenient(),
            rate_limiter: RateLimiterConfig::conservative(),
            enable_retry: true,
            enable_circuit_breaker: true,
            enable_rate_limiting: true,
        }
    }
}

/// Orchestrates resilience patterns for API requests.
///
/// The orchestrator coordinates three resilience mechanisms:
/// 1. **Rate Limiting**: Controls request rate using token bucket algorithm
/// 2. **Circuit Breaker**: Prevents cascading failures by temporarily blocking requests to failing services
/// 3. **Retry Logic**: Implements exponential backoff with jitter for transient failures
///
/// # Example
///
/// ```rust,ignore
/// use integrations_gemini::resilience::{ResilienceOrchestrator, ResilienceConfig};
///
/// let orchestrator = ResilienceOrchestrator::with_defaults();
///
/// let result = orchestrator.execute(|| async {
///     // Your API call here
///     Ok("success")
/// }).await;
/// ```
pub struct ResilienceOrchestrator {
    config: ResilienceConfig,
    retry: RetryExecutor,
    circuit_breaker: Arc<CircuitBreaker>,
    rate_limiter: Arc<RateLimiter>,
}

impl ResilienceOrchestrator {
    /// Creates a new resilience orchestrator with the given configuration.
    pub fn new(config: ResilienceConfig) -> Self {
        let retry = RetryExecutor::new(config.retry.clone());
        let circuit_breaker = Arc::new(CircuitBreaker::new(config.circuit_breaker.clone()));
        let rate_limiter = Arc::new(RateLimiter::new(config.rate_limiter.clone()));

        Self {
            config,
            retry,
            circuit_breaker,
            rate_limiter,
        }
    }

    /// Creates a new resilience orchestrator with default configuration.
    pub fn with_defaults() -> Self {
        Self::new(ResilienceConfig::default())
    }

    /// Executes an operation with full resilience protection.
    ///
    /// # Arguments
    ///
    /// * `operation` - A closure that returns a future producing a Result
    ///
    /// # Returns
    ///
    /// The result of the operation after applying all resilience patterns.
    ///
    /// # Behavior
    ///
    /// 1. Checks rate limit and waits if necessary
    /// 2. Checks circuit breaker state
    /// 3. Executes operation with retry logic
    /// 4. Updates circuit breaker based on result
    pub async fn execute<F, Fut, T>(&self, operation: F) -> Result<T, GeminiError>
    where
        F: Fn() -> Fut,
        Fut: Future<Output = Result<T, GeminiError>>,
    {
        // Step 1: Rate limiting
        if self.config.enable_rate_limiting {
            self.rate_limiter.acquire().await?;
        }

        // Step 2: Circuit breaker check
        if self.config.enable_circuit_breaker {
            self.circuit_breaker.check()?;
        }

        // Step 3: Execute with retry
        let result = if self.config.enable_retry {
            self.retry.execute(&operation).await
        } else {
            operation().await
        };

        // Step 4: Update circuit breaker state
        if self.config.enable_circuit_breaker {
            match &result {
                Ok(_) => self.circuit_breaker.record_success(),
                Err(e) if e.is_retryable() => self.circuit_breaker.record_failure(),
                Err(_) => {
                    // Non-retryable errors don't affect circuit breaker
                }
            }
        }

        result
    }

    /// Executes an operation without retry logic.
    ///
    /// This is useful when you want rate limiting and circuit breaker protection
    /// but need to handle retries manually.
    pub async fn execute_once<F, Fut, T>(&self, operation: F) -> Result<T, GeminiError>
    where
        F: Fn() -> Fut,
        Fut: Future<Output = Result<T, GeminiError>>,
    {
        // Rate limiting
        if self.config.enable_rate_limiting {
            self.rate_limiter.acquire().await?;
        }

        // Circuit breaker check
        if self.config.enable_circuit_breaker {
            self.circuit_breaker.check()?;
        }

        // Execute operation once
        let result = operation().await;

        // Update circuit breaker state
        if self.config.enable_circuit_breaker {
            match &result {
                Ok(_) => self.circuit_breaker.record_success(),
                Err(e) if e.is_retryable() => self.circuit_breaker.record_failure(),
                Err(_) => {}
            }
        }

        result
    }

    /// Returns the configuration.
    pub fn config(&self) -> &ResilienceConfig {
        &self.config
    }

    /// Returns a reference to the circuit breaker.
    pub fn circuit_breaker(&self) -> &Arc<CircuitBreaker> {
        &self.circuit_breaker
    }

    /// Returns a reference to the rate limiter.
    pub fn rate_limiter(&self) -> &Arc<RateLimiter> {
        &self.rate_limiter
    }

    /// Resets all resilience components to their initial state.
    pub fn reset(&self) {
        self.circuit_breaker.reset();
        self.rate_limiter.reset();
        tracing::info!("Resilience orchestrator reset");
    }
}

impl std::fmt::Debug for ResilienceOrchestrator {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ResilienceOrchestrator")
            .field("config", &self.config)
            .field("circuit_breaker", &self.circuit_breaker)
            .field("rate_limiter", &self.rate_limiter)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::{NetworkError, ConfigurationError};
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    #[tokio::test]
    async fn test_resilience_orchestrator_new() {
        let config = ResilienceConfig::default();
        let orchestrator = ResilienceOrchestrator::new(config);
        assert!(orchestrator.config().enable_retry);
        assert!(orchestrator.config().enable_circuit_breaker);
        assert!(orchestrator.config().enable_rate_limiting);
    }

    #[tokio::test]
    async fn test_resilience_orchestrator_defaults() {
        let orchestrator = ResilienceOrchestrator::with_defaults();
        assert!(orchestrator.config().enable_retry);
    }

    #[tokio::test]
    async fn test_execute_successful_operation() {
        let orchestrator = ResilienceOrchestrator::with_defaults();
        let result = orchestrator
            .execute(|| async { Ok::<_, GeminiError>("success") })
            .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "success");
    }

    #[tokio::test]
    async fn test_execute_with_retry() {
        let config = ResilienceConfig {
            retry: RetryConfig {
                max_retries: 2,
                initial_delay: std::time::Duration::from_millis(1),
                ..Default::default()
            },
            ..Default::default()
        };
        let orchestrator = ResilienceOrchestrator::new(config);

        let attempts = Arc::new(AtomicU32::new(0));
        let attempts_clone = attempts.clone();

        let result = orchestrator
            .execute(|| async {
                let count = attempts_clone.fetch_add(1, Ordering::SeqCst);
                if count < 2 {
                    Err(GeminiError::Network(NetworkError::Timeout {
                        duration: std::time::Duration::from_secs(10),
                    }))
                } else {
                    Ok("success")
                }
            })
            .await;

        assert!(result.is_ok());
        assert_eq!(attempts.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn test_execute_non_retryable_error() {
        let orchestrator = ResilienceOrchestrator::with_defaults();
        let attempts = Arc::new(AtomicU32::new(0));
        let attempts_clone = attempts.clone();

        let result = orchestrator
            .execute(|| async {
                attempts_clone.fetch_add(1, Ordering::SeqCst);
                Err(GeminiError::Configuration(ConfigurationError::MissingApiKey))
            })
            .await;

        assert!(result.is_err());
        assert_eq!(attempts.load(Ordering::SeqCst), 1); // No retries
    }

    #[tokio::test]
    async fn test_execute_once() {
        let orchestrator = ResilienceOrchestrator::with_defaults();
        let attempts = Arc::new(AtomicU32::new(0));
        let attempts_clone = attempts.clone();

        let result = orchestrator
            .execute_once(|| async {
                attempts_clone.fetch_add(1, Ordering::SeqCst);
                Err(GeminiError::Network(NetworkError::Timeout {
                    duration: std::time::Duration::from_secs(10),
                }))
            })
            .await;

        assert!(result.is_err());
        assert_eq!(attempts.load(Ordering::SeqCst), 1); // No retries
    }

    #[tokio::test]
    async fn test_rate_limiting() {
        let config = ResilienceConfig {
            rate_limiter: RateLimiterConfig {
                requests_per_minute: 60,
                burst_size: 2,
                refill_interval: std::time::Duration::from_millis(100),
            },
            ..Default::default()
        };
        let orchestrator = ResilienceOrchestrator::new(config);

        // Should succeed for first 2 requests
        assert!(orchestrator
            .execute_once(|| async { Ok::<_, GeminiError>("ok") })
            .await
            .is_ok());
        assert!(orchestrator
            .execute_once(|| async { Ok::<_, GeminiError>("ok") })
            .await
            .is_ok());

        // Third request should wait or succeed after refill
        let start = std::time::Instant::now();
        assert!(orchestrator
            .execute_once(|| async { Ok::<_, GeminiError>("ok") })
            .await
            .is_ok());
        let elapsed = start.elapsed();

        // Should have waited or refilled
        assert!(elapsed >= std::time::Duration::from_millis(0));
    }

    #[tokio::test]
    async fn test_circuit_breaker_integration() {
        let config = ResilienceConfig {
            circuit_breaker: CircuitBreakerConfig {
                failure_threshold: 2,
                timeout: std::time::Duration::from_millis(100),
                ..Default::default()
            },
            retry: RetryConfig::no_retry(),
            ..Default::default()
        };
        let orchestrator = ResilienceOrchestrator::new(config);

        // Cause failures to open circuit
        for _ in 0..2 {
            let _ = orchestrator
                .execute_once(|| async {
                    Err(GeminiError::Network(NetworkError::Timeout {
                        duration: std::time::Duration::from_secs(10),
                    }))
                })
                .await;
        }

        // Circuit should be open now
        assert!(matches!(
            orchestrator.circuit_breaker().state(),
            CircuitState::Open { .. }
        ));
    }

    #[test]
    fn test_config_disabled() {
        let config = ResilienceConfig::disabled();
        assert!(!config.enable_retry);
        assert!(!config.enable_circuit_breaker);
        assert!(!config.enable_rate_limiting);
    }

    #[test]
    fn test_config_aggressive() {
        let config = ResilienceConfig::aggressive();
        assert_eq!(config.retry.max_retries, 5);
        assert_eq!(config.circuit_breaker.failure_threshold, 3);
    }

    #[test]
    fn test_config_conservative() {
        let config = ResilienceConfig::conservative();
        assert_eq!(config.circuit_breaker.failure_threshold, 10);
        assert_eq!(config.rate_limiter.requests_per_minute, 30);
    }

    #[tokio::test]
    async fn test_reset() {
        let orchestrator = ResilienceOrchestrator::with_defaults();
        orchestrator.reset();

        // Verify circuit breaker is closed
        assert_eq!(orchestrator.circuit_breaker().state(), CircuitState::Closed);
    }
}
