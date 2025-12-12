//! Resilience patterns for Google Drive API.
//!
//! This module provides retry, circuit breaker, and rate limiting capabilities
//! for handling transient failures and managing API quotas.

use crate::errors::GoogleDriveError;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{RwLock, Semaphore};

/// Retry configuration for exponential backoff.
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retry attempts.
    pub max_attempts: u32,
    /// Initial backoff duration.
    pub initial_backoff: Duration,
    /// Maximum backoff duration.
    pub max_backoff: Duration,
    /// Multiplier for exponential backoff.
    pub multiplier: f64,
    /// Whether to add jitter to backoff.
    pub jitter: bool,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            initial_backoff: Duration::from_secs(1),
            max_backoff: Duration::from_secs(60),
            multiplier: 2.0,
            jitter: true,
        }
    }
}

/// Circuit breaker configuration.
#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    /// Number of consecutive failures to open circuit.
    pub failure_threshold: u32,
    /// Number of consecutive successes to close circuit.
    pub success_threshold: u32,
    /// Time to wait before attempting half-open state.
    pub reset_timeout: Duration,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            success_threshold: 3,
            reset_timeout: Duration::from_secs(60),
        }
    }
}

/// Rate limit configuration.
#[derive(Debug, Clone)]
pub struct RateLimitConfig {
    /// Maximum queries per 100 seconds per user.
    pub queries_per_100_seconds: u32,
    /// Daily limit for the project.
    pub daily_limit: u64,
    /// Whether to respect Retry-After headers.
    pub respect_retry_after: bool,
    /// Maximum concurrent requests.
    pub max_concurrent: u32,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            queries_per_100_seconds: 1000,
            daily_limit: 10_000_000,
            respect_retry_after: true,
            max_concurrent: 10,
        }
    }
}

/// Retry executor with exponential backoff.
pub struct RetryExecutor {
    config: RetryConfig,
}

impl RetryExecutor {
    /// Creates a new retry executor.
    pub fn new(config: RetryConfig) -> Self {
        Self { config }
    }

    /// Executes an operation with retry logic.
    pub async fn execute<F, Fut, T>(&self, mut operation: F) -> Result<T, GoogleDriveError>
    where
        F: FnMut() -> Fut,
        Fut: std::future::Future<Output = Result<T, GoogleDriveError>>,
    {
        let mut attempt = 0;

        loop {
            match operation().await {
                Ok(result) => return Ok(result),
                Err(error) => {
                    attempt += 1;

                    // Check if we should retry
                    if !is_retryable(&error) || attempt >= self.config.max_attempts {
                        return Err(error);
                    }

                    // Calculate backoff duration
                    let backoff = error
                        .retry_after()
                        .unwrap_or_else(|| calculate_backoff(attempt, &self.config));

                    // Wait before retrying
                    tokio::time::sleep(backoff).await;
                }
            }
        }
    }
}

/// Circuit breaker state machine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    /// Circuit is closed, requests pass through.
    Closed,
    /// Circuit is open, requests are rejected immediately.
    Open,
    /// Circuit is half-open, testing if service recovered.
    HalfOpen,
}

/// Circuit breaker for preventing cascading failures.
pub struct CircuitBreaker {
    config: CircuitBreakerConfig,
    state: Arc<RwLock<CircuitBreakerState>>,
}

#[derive(Debug)]
struct CircuitBreakerState {
    state: CircuitState,
    failure_count: u32,
    success_count: u32,
    last_failure_time: Option<tokio::time::Instant>,
}

impl CircuitBreaker {
    /// Creates a new circuit breaker.
    pub fn new(config: CircuitBreakerConfig) -> Self {
        Self {
            config,
            state: Arc::new(RwLock::new(CircuitBreakerState {
                state: CircuitState::Closed,
                failure_count: 0,
                success_count: 0,
                last_failure_time: None,
            })),
        }
    }

    /// Checks if the circuit allows requests.
    pub async fn is_call_permitted(&self) -> bool {
        let mut state = self.state.write().await;
        self.transition_state(&mut state);
        state.state != CircuitState::Open
    }

    /// Records a successful call.
    pub async fn record_success(&self) {
        let mut state = self.state.write().await;
        match state.state {
            CircuitState::Closed => {
                state.failure_count = 0;
            }
            CircuitState::HalfOpen => {
                state.success_count += 1;
                if state.success_count >= self.config.success_threshold {
                    state.state = CircuitState::Closed;
                    state.failure_count = 0;
                    state.success_count = 0;
                }
            }
            CircuitState::Open => {
                // Should not happen, but reset to half-open
                state.state = CircuitState::HalfOpen;
                state.success_count = 1;
            }
        }
    }

    /// Records a failed call.
    pub async fn record_failure(&self) {
        let mut state = self.state.write().await;
        match state.state {
            CircuitState::Closed => {
                state.failure_count += 1;
                if state.failure_count >= self.config.failure_threshold {
                    state.state = CircuitState::Open;
                    state.last_failure_time = Some(tokio::time::Instant::now());
                }
            }
            CircuitState::HalfOpen => {
                state.state = CircuitState::Open;
                state.last_failure_time = Some(tokio::time::Instant::now());
                state.success_count = 0;
            }
            CircuitState::Open => {
                state.last_failure_time = Some(tokio::time::Instant::now());
            }
        }
    }

    /// Gets the current circuit state.
    pub async fn state(&self) -> CircuitState {
        let state = self.state.read().await;
        state.state
    }

    fn transition_state(&self, state: &mut CircuitBreakerState) {
        if state.state == CircuitState::Open {
            if let Some(last_failure) = state.last_failure_time {
                if last_failure.elapsed() >= self.config.reset_timeout {
                    state.state = CircuitState::HalfOpen;
                    state.success_count = 0;
                }
            }
        }
    }
}

/// Rate limiter using token bucket algorithm.
pub struct RateLimiter {
    config: RateLimitConfig,
    semaphore: Arc<Semaphore>,
}

impl RateLimiter {
    /// Creates a new rate limiter.
    pub fn new(config: RateLimitConfig) -> Self {
        let permits = config.max_concurrent as usize;
        Self {
            config,
            semaphore: Arc::new(Semaphore::new(permits)),
        }
    }

    /// Acquires a permit to make a request.
    pub async fn acquire(&self) -> Result<SemaphorePermit<'_>, GoogleDriveError> {
        let permit = self
            .semaphore
            .acquire()
            .await
            .map_err(|e| {
                GoogleDriveError::Network(crate::errors::NetworkError::ConnectionFailed(format!(
                    "Failed to acquire rate limit permit: {}",
                    e
                )))
            })?;
        Ok(SemaphorePermit(permit))
    }

    /// Tries to acquire a permit without waiting.
    pub fn try_acquire(&self) -> Option<SemaphorePermit<'_>> {
        self.semaphore.try_acquire().ok().map(SemaphorePermit)
    }
}

/// RAII guard for rate limiter permit.
pub struct SemaphorePermit<'a>(tokio::sync::SemaphorePermit<'a>);

/// Checks if an error is retryable.
pub fn is_retryable(error: &GoogleDriveError) -> bool {
    error.is_retryable()
}

/// Calculates backoff duration for a retry attempt.
pub fn calculate_backoff(attempt: u32, config: &RetryConfig) -> Duration {
    let base = config.initial_backoff.as_secs_f64();
    let exp = config.multiplier.powi(attempt.saturating_sub(1) as i32);
    let mut delay = base * exp;

    // Apply max backoff
    let max = config.max_backoff.as_secs_f64();
    if delay > max {
        delay = max;
    }

    // Apply jitter if enabled
    if config.jitter {
        use rand::Rng;
        let jitter = rand::thread_rng().gen_range(0.0..=delay * 0.1);
        delay += jitter;
    }

    Duration::from_secs_f64(delay)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_retry_config_default() {
        let config = RetryConfig::default();
        assert_eq!(config.max_attempts, 3);
        assert_eq!(config.initial_backoff, Duration::from_secs(1));
        assert_eq!(config.max_backoff, Duration::from_secs(60));
        assert_eq!(config.multiplier, 2.0);
        assert!(config.jitter);
    }

    #[test]
    fn test_circuit_breaker_config_default() {
        let config = CircuitBreakerConfig::default();
        assert_eq!(config.failure_threshold, 5);
        assert_eq!(config.success_threshold, 3);
        assert_eq!(config.reset_timeout, Duration::from_secs(60));
    }

    #[test]
    fn test_rate_limit_config_default() {
        let config = RateLimitConfig::default();
        assert_eq!(config.queries_per_100_seconds, 1000);
        assert_eq!(config.daily_limit, 10_000_000);
        assert!(config.respect_retry_after);
        assert_eq!(config.max_concurrent, 10);
    }

    #[test]
    fn test_calculate_backoff() {
        let config = RetryConfig {
            max_attempts: 3,
            initial_backoff: Duration::from_secs(1),
            max_backoff: Duration::from_secs(60),
            multiplier: 2.0,
            jitter: false,
        };

        let backoff1 = calculate_backoff(1, &config);
        assert_eq!(backoff1, Duration::from_secs(1));

        let backoff2 = calculate_backoff(2, &config);
        assert_eq!(backoff2, Duration::from_secs(2));

        let backoff3 = calculate_backoff(3, &config);
        assert_eq!(backoff3, Duration::from_secs(4));
    }

    #[test]
    fn test_calculate_backoff_max() {
        let config = RetryConfig {
            max_attempts: 10,
            initial_backoff: Duration::from_secs(1),
            max_backoff: Duration::from_secs(10),
            multiplier: 2.0,
            jitter: false,
        };

        let backoff = calculate_backoff(10, &config);
        assert!(backoff <= Duration::from_secs(10));
    }

    #[tokio::test]
    async fn test_circuit_breaker_state_transitions() {
        let config = CircuitBreakerConfig {
            failure_threshold: 2,
            success_threshold: 2,
            reset_timeout: Duration::from_millis(100),
        };
        let cb = CircuitBreaker::new(config);

        // Initially closed
        assert_eq!(cb.state().await, CircuitState::Closed);
        assert!(cb.is_call_permitted().await);

        // Record failures to open circuit
        cb.record_failure().await;
        assert_eq!(cb.state().await, CircuitState::Closed);
        cb.record_failure().await;
        assert_eq!(cb.state().await, CircuitState::Open);
        assert!(!cb.is_call_permitted().await);

        // Wait for reset timeout
        tokio::time::sleep(Duration::from_millis(150)).await;

        // Should transition to half-open
        assert!(cb.is_call_permitted().await);
        assert_eq!(cb.state().await, CircuitState::HalfOpen);

        // Record successes to close circuit
        cb.record_success().await;
        cb.record_success().await;
        assert_eq!(cb.state().await, CircuitState::Closed);
    }

    #[tokio::test]
    async fn test_rate_limiter() {
        let config = RateLimitConfig {
            queries_per_100_seconds: 1000,
            daily_limit: 10_000_000,
            respect_retry_after: true,
            max_concurrent: 2,
        };
        let limiter = RateLimiter::new(config);

        // Should be able to acquire 2 permits
        let _permit1 = limiter.acquire().await.unwrap();
        let _permit2 = limiter.acquire().await.unwrap();

        // Third attempt should not succeed immediately
        let permit3 = limiter.try_acquire();
        assert!(permit3.is_none());
    }
}
