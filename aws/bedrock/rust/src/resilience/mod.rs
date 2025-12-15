//! Resilience layer for Bedrock operations.
//!
//! This module provides retry logic, circuit breaker, and rate limiting
//! following the patterns from the shared resilience module.

use crate::config::RetryConfig;
use crate::error::BedrockError;
use parking_lot::Mutex;
use std::future::Future;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::time::{Duration, Instant};
use tracing::{debug, warn};

/// Circuit breaker states.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    /// Circuit is closed, requests flow normally.
    Closed,
    /// Circuit is open, requests are rejected.
    Open,
    /// Circuit is testing, limited requests allowed.
    HalfOpen,
}

/// Circuit breaker configuration.
#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    /// Number of failures before opening the circuit.
    pub failure_threshold: u32,
    /// Duration to keep circuit open before testing.
    pub reset_timeout: Duration,
    /// Number of successful requests in half-open state to close.
    pub success_threshold: u32,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            reset_timeout: Duration::from_secs(30),
            success_threshold: 3,
        }
    }
}

/// Circuit breaker implementation.
pub struct CircuitBreaker {
    config: CircuitBreakerConfig,
    state: Mutex<CircuitState>,
    failure_count: AtomicUsize,
    success_count: AtomicUsize,
    last_failure_time: AtomicU64,
}

impl CircuitBreaker {
    /// Create a new circuit breaker.
    pub fn new(config: CircuitBreakerConfig) -> Self {
        Self {
            config,
            state: Mutex::new(CircuitState::Closed),
            failure_count: AtomicUsize::new(0),
            success_count: AtomicUsize::new(0),
            last_failure_time: AtomicU64::new(0),
        }
    }

    /// Check if a request is allowed.
    pub fn is_allowed(&self) -> bool {
        let state = *self.state.lock();

        match state {
            CircuitState::Closed => true,
            CircuitState::Open => {
                // Check if enough time has passed to try half-open
                let last_failure = Duration::from_millis(self.last_failure_time.load(Ordering::SeqCst));
                let now = Duration::from_millis(
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64,
                );

                if now.saturating_sub(last_failure) >= self.config.reset_timeout {
                    let mut state = self.state.lock();
                    if *state == CircuitState::Open {
                        *state = CircuitState::HalfOpen;
                        self.success_count.store(0, Ordering::SeqCst);
                    }
                    true
                } else {
                    false
                }
            }
            CircuitState::HalfOpen => true,
        }
    }

    /// Record a successful request.
    pub fn record_success(&self) {
        let state = *self.state.lock();

        match state {
            CircuitState::Closed => {
                // Reset failure count on success
                self.failure_count.store(0, Ordering::SeqCst);
            }
            CircuitState::HalfOpen => {
                let count = self.success_count.fetch_add(1, Ordering::SeqCst) + 1;
                if count >= self.config.success_threshold as usize {
                    let mut state = self.state.lock();
                    *state = CircuitState::Closed;
                    self.failure_count.store(0, Ordering::SeqCst);
                    debug!("Circuit breaker closed after {} successes", count);
                }
            }
            CircuitState::Open => {}
        }
    }

    /// Record a failed request.
    pub fn record_failure(&self) {
        let mut state = self.state.lock();

        match *state {
            CircuitState::Closed => {
                let count = self.failure_count.fetch_add(1, Ordering::SeqCst) + 1;
                if count >= self.config.failure_threshold as usize {
                    *state = CircuitState::Open;
                    self.last_failure_time.store(
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_millis() as u64,
                        Ordering::SeqCst,
                    );
                    warn!("Circuit breaker opened after {} failures", count);
                }
            }
            CircuitState::HalfOpen => {
                // Any failure in half-open returns to open
                *state = CircuitState::Open;
                self.last_failure_time.store(
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64,
                    Ordering::SeqCst,
                );
                debug!("Circuit breaker reopened after failure in half-open state");
            }
            CircuitState::Open => {}
        }
    }

    /// Get the current state.
    pub fn state(&self) -> CircuitState {
        *self.state.lock()
    }

    /// Reset the circuit breaker.
    pub fn reset(&self) {
        let mut state = self.state.lock();
        *state = CircuitState::Closed;
        self.failure_count.store(0, Ordering::SeqCst);
        self.success_count.store(0, Ordering::SeqCst);
    }
}

/// Retry policy implementation.
pub struct RetryPolicy {
    config: RetryConfig,
}

impl RetryPolicy {
    /// Create a new retry policy.
    pub fn new(config: RetryConfig) -> Self {
        Self { config }
    }

    /// Execute an operation with retries.
    pub async fn execute<F, Fut, T>(&self, operation: F) -> Result<T, BedrockError>
    where
        F: Fn() -> Fut,
        Fut: Future<Output = Result<T, BedrockError>>,
    {
        let mut attempt = 0;
        let mut last_error: Option<BedrockError> = None;

        while attempt <= self.config.max_retries {
            match operation().await {
                Ok(result) => return Ok(result),
                Err(e) => {
                    if !e.is_retryable() || attempt >= self.config.max_retries {
                        return Err(e);
                    }

                    // Calculate backoff delay
                    let delay = self.calculate_delay(attempt);

                    // Check for retry-after hint
                    let actual_delay = e.retry_after().unwrap_or(delay);

                    debug!(
                        attempt = attempt + 1,
                        max_retries = self.config.max_retries,
                        delay_ms = actual_delay.as_millis(),
                        "Retrying after error: {:?}",
                        e
                    );

                    tokio::time::sleep(actual_delay).await;

                    last_error = Some(e);
                    attempt += 1;
                }
            }
        }

        Err(last_error.unwrap_or_else(|| {
            BedrockError::Network(crate::error::NetworkError::ConnectionFailed {
                message: "Max retries exceeded".to_string(),
            })
        }))
    }

    /// Calculate backoff delay for a given attempt.
    fn calculate_delay(&self, attempt: u32) -> Duration {
        let base = self.config.base_delay.as_millis() as f64;
        let multiplier = self.config.multiplier.powi(attempt as i32);
        let delay_ms = (base * multiplier).min(self.config.max_delay.as_millis() as f64);

        let mut delay = Duration::from_millis(delay_ms as u64);

        // Add jitter if enabled
        if self.config.jitter {
            let jitter = (delay_ms * 0.2) as u64; // 20% jitter
            let random_jitter = rand_jitter(jitter);
            delay = Duration::from_millis(delay_ms as u64 + random_jitter);
        }

        delay.min(self.config.max_delay)
    }
}

/// Simple jitter generation without external dependencies.
fn rand_jitter(max: u64) -> u64 {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};

    let hasher = RandomState::new().build_hasher();
    let hash = hasher.finish();
    hash % (max + 1)
}

/// Combined resilience orchestrator.
pub struct Resilience {
    retry_policy: RetryPolicy,
    circuit_breaker: CircuitBreaker,
}

impl Resilience {
    /// Create a new resilience layer.
    pub fn new(retry_config: RetryConfig, cb_config: CircuitBreakerConfig) -> Self {
        Self {
            retry_policy: RetryPolicy::new(retry_config),
            circuit_breaker: CircuitBreaker::new(cb_config),
        }
    }

    /// Execute an operation with all resilience features.
    pub async fn execute<F, Fut, T>(&self, operation: F) -> Result<T, BedrockError>
    where
        F: Fn() -> Fut,
        Fut: Future<Output = Result<T, BedrockError>>,
    {
        // Check circuit breaker
        if !self.circuit_breaker.is_allowed() {
            return Err(BedrockError::Server(crate::error::ServerError::ServiceUnavailable {
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

    /// Get circuit breaker state.
    pub fn circuit_state(&self) -> CircuitState {
        self.circuit_breaker.state()
    }

    /// Reset circuit breaker.
    pub fn reset_circuit(&self) {
        self.circuit_breaker.reset();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_circuit_breaker_initial_state() {
        let cb = CircuitBreaker::new(CircuitBreakerConfig::default());
        assert_eq!(cb.state(), CircuitState::Closed);
        assert!(cb.is_allowed());
    }

    #[test]
    fn test_circuit_breaker_opens_after_failures() {
        let config = CircuitBreakerConfig {
            failure_threshold: 3,
            ..Default::default()
        };
        let cb = CircuitBreaker::new(config);

        // Record failures
        cb.record_failure();
        assert_eq!(cb.state(), CircuitState::Closed);

        cb.record_failure();
        assert_eq!(cb.state(), CircuitState::Closed);

        cb.record_failure();
        assert_eq!(cb.state(), CircuitState::Open);
    }

    #[test]
    fn test_circuit_breaker_success_resets_failures() {
        let config = CircuitBreakerConfig {
            failure_threshold: 3,
            ..Default::default()
        };
        let cb = CircuitBreaker::new(config);

        cb.record_failure();
        cb.record_failure();
        cb.record_success(); // Should reset failure count

        cb.record_failure();
        cb.record_failure();
        // Still closed because success reset the count
        assert_eq!(cb.state(), CircuitState::Closed);
    }

    #[test]
    fn test_retry_delay_calculation() {
        let config = RetryConfig {
            base_delay: Duration::from_millis(100),
            multiplier: 2.0,
            max_delay: Duration::from_secs(10),
            jitter: false,
            ..Default::default()
        };
        let policy = RetryPolicy::new(config);

        // Attempt 0: 100ms
        assert_eq!(policy.calculate_delay(0).as_millis(), 100);

        // Attempt 1: 200ms
        assert_eq!(policy.calculate_delay(1).as_millis(), 200);

        // Attempt 2: 400ms
        assert_eq!(policy.calculate_delay(2).as_millis(), 400);
    }

    #[tokio::test]
    async fn test_retry_success() {
        let config = RetryConfig {
            max_retries: 3,
            base_delay: Duration::from_millis(1),
            ..Default::default()
        };
        let policy = RetryPolicy::new(config);

        let result: Result<i32, BedrockError> = policy.execute(|| async { Ok(42) }).await;
        assert_eq!(result.unwrap(), 42);
    }
}
