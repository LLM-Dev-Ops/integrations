//! Resilience patterns for SMTP operations.
//!
//! Implements retry with exponential backoff, circuit breaker,
//! and rate limiting for robust email sending.

use std::future::Future;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};
use tokio::time::sleep;

use crate::config::{CircuitBreakerConfig, OnLimitBehavior, RateLimitConfig, RetryConfig};
use crate::errors::{SmtpError, SmtpErrorKind, SmtpResult};

/// Retry executor with exponential backoff.
#[derive(Debug, Clone)]
pub struct RetryExecutor {
    config: RetryConfig,
}

impl RetryExecutor {
    /// Creates a new retry executor.
    pub fn new(config: RetryConfig) -> Self {
        Self { config }
    }

    /// Executes an async operation with retry logic.
    pub async fn execute<F, Fut, T>(&self, mut operation: F) -> SmtpResult<T>
    where
        F: FnMut() -> Fut,
        Fut: Future<Output = SmtpResult<T>>,
    {
        if !self.config.enabled {
            return operation().await;
        }

        let mut attempt = 0;
        let mut last_error: Option<SmtpError> = None;

        while attempt < self.config.max_attempts {
            match operation().await {
                Ok(result) => return Ok(result),
                Err(e) => {
                    if !e.is_retryable() || attempt + 1 >= self.config.max_attempts {
                        return Err(e);
                    }

                    last_error = Some(e);
                    attempt += 1;

                    let delay = self.calculate_delay(attempt);
                    #[cfg(feature = "tracing")]
                    tracing::warn!(
                        attempt = attempt,
                        max_attempts = self.config.max_attempts,
                        delay_ms = delay.as_millis(),
                        "Retrying operation after failure"
                    );

                    sleep(delay).await;
                }
            }
        }

        Err(last_error.unwrap_or_else(|| {
            SmtpError::new(SmtpErrorKind::Unknown, "Retry exhausted")
        }))
    }

    /// Calculates the delay for a given attempt.
    fn calculate_delay(&self, attempt: u32) -> Duration {
        let base_delay = self.config.initial_delay.as_millis() as f64
            * self.config.multiplier.powi(attempt as i32 - 1);

        let delay_ms = base_delay.min(self.config.max_delay.as_millis() as f64);

        // Add jitter if enabled
        let final_delay = if self.config.jitter {
            let jitter = rand::random::<f64>() * 0.3 * delay_ms;
            delay_ms + jitter
        } else {
            delay_ms
        };

        Duration::from_millis(final_delay as u64)
    }
}

impl Default for RetryExecutor {
    fn default() -> Self {
        Self::new(RetryConfig::default())
    }
}

/// Circuit breaker states.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    /// Circuit is closed, requests flow normally.
    Closed,
    /// Circuit is open, requests are rejected.
    Open,
    /// Circuit is half-open, allowing test requests.
    HalfOpen,
}

/// Circuit breaker for preventing cascading failures.
#[derive(Debug)]
pub struct CircuitBreaker {
    config: CircuitBreakerConfig,
    state: RwLock<CircuitState>,
    failure_count: AtomicU32,
    success_count: AtomicU32,
    last_failure_time: RwLock<Option<Instant>>,
    opened_at: RwLock<Option<Instant>>,
}

impl CircuitBreaker {
    /// Creates a new circuit breaker.
    pub fn new(config: CircuitBreakerConfig) -> Self {
        Self {
            config,
            state: RwLock::new(CircuitState::Closed),
            failure_count: AtomicU32::new(0),
            success_count: AtomicU32::new(0),
            last_failure_time: RwLock::new(None),
            opened_at: RwLock::new(None),
        }
    }

    /// Returns the current circuit state.
    pub fn state(&self) -> CircuitState {
        self.check_state_transition();
        *self.state.read().unwrap()
    }

    /// Returns true if the circuit allows requests.
    pub fn is_allowed(&self) -> bool {
        if !self.config.enabled {
            return true;
        }
        self.state() != CircuitState::Open
    }

    /// Executes an operation with circuit breaker protection.
    pub async fn execute<F, Fut, T>(&self, operation: F) -> SmtpResult<T>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = SmtpResult<T>>,
    {
        if !self.config.enabled {
            return operation().await;
        }

        if !self.is_allowed() {
            return Err(SmtpError::circuit_open());
        }

        match operation().await {
            Ok(result) => {
                self.record_success();
                Ok(result)
            }
            Err(e) => {
                self.record_failure(&e);
                Err(e)
            }
        }
    }

    /// Records a successful operation.
    pub fn record_success(&self) {
        let state = *self.state.read().unwrap();
        match state {
            CircuitState::Closed => {
                self.failure_count.store(0, Ordering::SeqCst);
            }
            CircuitState::HalfOpen => {
                let count = self.success_count.fetch_add(1, Ordering::SeqCst) + 1;
                if count >= self.config.success_threshold {
                    self.close();
                }
            }
            CircuitState::Open => {}
        }
    }

    /// Records a failed operation.
    pub fn record_failure(&self, error: &SmtpError) {
        // Only count failures that should trip the circuit
        if !self.should_count_failure(error) {
            return;
        }

        *self.last_failure_time.write().unwrap() = Some(Instant::now());

        let state = *self.state.read().unwrap();
        match state {
            CircuitState::Closed => {
                let count = self.failure_count.fetch_add(1, Ordering::SeqCst) + 1;

                // Check if we should open the circuit
                if count >= self.config.failure_threshold {
                    // Verify failures are within the window
                    if self.failures_within_window() {
                        self.open();
                    }
                }
            }
            CircuitState::HalfOpen => {
                // Any failure in half-open reopens the circuit
                self.open();
            }
            CircuitState::Open => {}
        }
    }

    /// Resets the circuit breaker.
    pub fn reset(&self) {
        *self.state.write().unwrap() = CircuitState::Closed;
        self.failure_count.store(0, Ordering::SeqCst);
        self.success_count.store(0, Ordering::SeqCst);
        *self.last_failure_time.write().unwrap() = None;
        *self.opened_at.write().unwrap() = None;
    }

    fn open(&self) {
        *self.state.write().unwrap() = CircuitState::Open;
        *self.opened_at.write().unwrap() = Some(Instant::now());
        self.success_count.store(0, Ordering::SeqCst);

        #[cfg(feature = "tracing")]
        tracing::warn!("Circuit breaker opened");
    }

    fn close(&self) {
        *self.state.write().unwrap() = CircuitState::Closed;
        self.failure_count.store(0, Ordering::SeqCst);
        self.success_count.store(0, Ordering::SeqCst);
        *self.opened_at.write().unwrap() = None;

        #[cfg(feature = "tracing")]
        tracing::info!("Circuit breaker closed");
    }

    fn half_open(&self) {
        *self.state.write().unwrap() = CircuitState::HalfOpen;
        self.success_count.store(0, Ordering::SeqCst);

        #[cfg(feature = "tracing")]
        tracing::info!("Circuit breaker half-open");
    }

    fn check_state_transition(&self) {
        let state = *self.state.read().unwrap();
        if state == CircuitState::Open {
            if let Some(opened_at) = *self.opened_at.read().unwrap() {
                if opened_at.elapsed() >= self.config.recovery_timeout {
                    self.half_open();
                }
            }
        }
    }

    fn should_count_failure(&self, error: &SmtpError) -> bool {
        // Only count certain types of failures
        matches!(
            error.kind(),
            SmtpErrorKind::ConnectionRefused
                | SmtpErrorKind::ConnectionTimeout
                | SmtpErrorKind::ConnectionReset
                | SmtpErrorKind::ServerShutdown
                | SmtpErrorKind::ReadTimeout
                | SmtpErrorKind::WriteTimeout
        )
    }

    fn failures_within_window(&self) -> bool {
        if let Some(last_failure) = *self.last_failure_time.read().unwrap() {
            last_failure.elapsed() < self.config.failure_window
        } else {
            false
        }
    }
}

impl Default for CircuitBreaker {
    fn default() -> Self {
        Self::new(CircuitBreakerConfig::default())
    }
}

/// Rate limiter using token bucket algorithm.
#[derive(Debug)]
pub struct RateLimiter {
    config: RateLimitConfig,
    tokens: AtomicU32,
    last_refill: RwLock<Instant>,
    window_start: RwLock<Instant>,
    requests_in_window: AtomicU32,
}

impl RateLimiter {
    /// Creates a new rate limiter.
    pub fn new(config: RateLimitConfig) -> Self {
        let max_tokens = config.max_emails.unwrap_or(u32::MAX);
        Self {
            config,
            tokens: AtomicU32::new(max_tokens),
            last_refill: RwLock::new(Instant::now()),
            window_start: RwLock::new(Instant::now()),
            requests_in_window: AtomicU32::new(0),
        }
    }

    /// Checks if a request is allowed.
    pub fn is_allowed(&self) -> bool {
        if !self.config.enabled {
            return true;
        }

        self.refill_tokens();

        if let Some(max) = self.config.max_emails {
            let current = self.requests_in_window.load(Ordering::SeqCst);
            if current >= max {
                return false;
            }
        }

        true
    }

    /// Acquires permission to send, waiting if necessary.
    pub async fn acquire(&self) -> SmtpResult<()> {
        if !self.config.enabled {
            return Ok(());
        }

        loop {
            self.refill_tokens();

            if self.is_allowed() {
                self.requests_in_window.fetch_add(1, Ordering::SeqCst);
                return Ok(());
            }

            match self.config.on_limit {
                OnLimitBehavior::Reject => {
                    return Err(SmtpError::rate_limit("Rate limit exceeded"));
                }
                OnLimitBehavior::Wait | OnLimitBehavior::WaitWithTimeout => {
                    let wait_time = self.time_until_available();
                    sleep(wait_time).await;
                }
            }
        }
    }

    /// Refills tokens based on elapsed time.
    fn refill_tokens(&self) {
        let mut window_start = self.window_start.write().unwrap();
        let now = Instant::now();

        if now.duration_since(*window_start) >= self.config.window {
            *window_start = now;
            self.requests_in_window.store(0, Ordering::SeqCst);
            if let Some(max) = self.config.max_emails {
                self.tokens.store(max, Ordering::SeqCst);
            }
        }
    }

    /// Returns time until the next request can be made.
    fn time_until_available(&self) -> Duration {
        let window_start = *self.window_start.read().unwrap();
        let elapsed = Instant::now().duration_since(window_start);
        if elapsed >= self.config.window {
            Duration::ZERO
        } else {
            self.config.window - elapsed
        }
    }

    /// Resets the rate limiter.
    pub fn reset(&self) {
        *self.window_start.write().unwrap() = Instant::now();
        self.requests_in_window.store(0, Ordering::SeqCst);
        if let Some(max) = self.config.max_emails {
            self.tokens.store(max, Ordering::SeqCst);
        }
    }
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::new(RateLimitConfig::default())
    }
}

/// Combined resilience orchestrator.
#[derive(Debug)]
pub struct ResilienceOrchestrator {
    retry: RetryExecutor,
    circuit_breaker: Arc<CircuitBreaker>,
    rate_limiter: Arc<RateLimiter>,
}

impl ResilienceOrchestrator {
    /// Creates a new resilience orchestrator.
    pub fn new(
        retry_config: RetryConfig,
        circuit_breaker_config: CircuitBreakerConfig,
        rate_limit_config: RateLimitConfig,
    ) -> Self {
        Self {
            retry: RetryExecutor::new(retry_config),
            circuit_breaker: Arc::new(CircuitBreaker::new(circuit_breaker_config)),
            rate_limiter: Arc::new(RateLimiter::new(rate_limit_config)),
        }
    }

    /// Executes an operation with full resilience protection.
    pub async fn execute<F, Fut, T>(&self, operation: F) -> SmtpResult<T>
    where
        F: FnMut() -> Fut + Clone,
        Fut: Future<Output = SmtpResult<T>>,
    {
        // Rate limit check
        self.rate_limiter.acquire().await?;

        // Circuit breaker with retry
        let circuit_breaker = self.circuit_breaker.clone();
        self.retry
            .execute(|| {
                let cb = circuit_breaker.clone();
                let mut op = operation.clone();
                async move { cb.execute(|| op()).await }
            })
            .await
    }

    /// Returns the circuit breaker.
    pub fn circuit_breaker(&self) -> &Arc<CircuitBreaker> {
        &self.circuit_breaker
    }

    /// Returns the rate limiter.
    pub fn rate_limiter(&self) -> &Arc<RateLimiter> {
        &self.rate_limiter
    }

    /// Resets all resilience state.
    pub fn reset(&self) {
        self.circuit_breaker.reset();
        self.rate_limiter.reset();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_retry_success() {
        let config = RetryConfig {
            max_attempts: 3,
            enabled: true,
            ..Default::default()
        };

        let executor = RetryExecutor::new(config);
        let result: SmtpResult<i32> = executor.execute(|| async { Ok(42) }).await;
        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn test_retry_failure() {
        let config = RetryConfig {
            max_attempts: 2,
            initial_delay: Duration::from_millis(1),
            enabled: true,
            ..Default::default()
        };

        let executor = RetryExecutor::new(config);
        let result: SmtpResult<i32> = executor
            .execute(|| async {
                Err(SmtpError::timeout(SmtpErrorKind::ReadTimeout, "test"))
            })
            .await;

        assert!(result.is_err());
    }

    #[test]
    fn test_circuit_breaker_states() {
        let config = CircuitBreakerConfig {
            failure_threshold: 2,
            recovery_timeout: Duration::from_millis(100),
            success_threshold: 1,
            enabled: true,
            ..Default::default()
        };

        let cb = CircuitBreaker::new(config);
        assert_eq!(cb.state(), CircuitState::Closed);
        assert!(cb.is_allowed());

        // Record failures
        let error = SmtpError::new(SmtpErrorKind::ConnectionRefused, "test");
        cb.record_failure(&error);
        cb.record_failure(&error);

        assert_eq!(cb.state(), CircuitState::Open);
        assert!(!cb.is_allowed());
    }

    #[test]
    fn test_rate_limiter() {
        let config = RateLimitConfig {
            max_emails: Some(2),
            window: Duration::from_secs(60),
            enabled: true,
            on_limit: OnLimitBehavior::Reject,
            ..Default::default()
        };

        let limiter = RateLimiter::new(config);

        assert!(limiter.is_allowed());
        limiter.requests_in_window.fetch_add(1, Ordering::SeqCst);
        assert!(limiter.is_allowed());
        limiter.requests_in_window.fetch_add(1, Ordering::SeqCst);
        assert!(!limiter.is_allowed());
    }
}
