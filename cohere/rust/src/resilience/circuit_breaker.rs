//! Circuit breaker implementation.

use crate::errors::CohereError;
use parking_lot::RwLock;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

/// State of the circuit breaker
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    /// Circuit is closed, requests are allowed
    Closed,
    /// Circuit is open, requests are rejected
    Open,
    /// Circuit is half-open, allowing test requests
    HalfOpen,
}

/// Configuration for the circuit breaker
#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    /// Number of failures before opening the circuit
    pub failure_threshold: u32,
    /// Duration to wait before transitioning from open to half-open
    pub reset_timeout: Duration,
    /// Number of successful requests in half-open state to close the circuit
    pub success_threshold: u32,
    /// Window duration for counting failures
    pub failure_window: Duration,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            reset_timeout: Duration::from_secs(30),
            success_threshold: 3,
            failure_window: Duration::from_secs(60),
        }
    }
}

impl CircuitBreakerConfig {
    /// Create a new circuit breaker configuration
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the failure threshold
    pub fn with_failure_threshold(mut self, threshold: u32) -> Self {
        self.failure_threshold = threshold;
        self
    }

    /// Set the reset timeout
    pub fn with_reset_timeout(mut self, timeout: Duration) -> Self {
        self.reset_timeout = timeout;
        self
    }

    /// Set the success threshold
    pub fn with_success_threshold(mut self, threshold: u32) -> Self {
        self.success_threshold = threshold;
        self
    }

    /// Set the failure window
    pub fn with_failure_window(mut self, window: Duration) -> Self {
        self.failure_window = window;
        self
    }
}

/// Hook for circuit breaker state changes
pub trait CircuitBreakerHook: Send + Sync {
    /// Called when circuit state changes
    fn on_state_change(&self, old_state: CircuitState, new_state: CircuitState);

    /// Called when a request is rejected due to open circuit
    fn on_rejected(&self);
}

/// Default circuit breaker hook (does nothing)
#[derive(Debug, Default)]
pub struct DefaultCircuitBreakerHook;

impl CircuitBreakerHook for DefaultCircuitBreakerHook {
    fn on_state_change(&self, _old_state: CircuitState, _new_state: CircuitState) {}
    fn on_rejected(&self) {}
}

/// Internal state for the circuit breaker
struct CircuitBreakerState {
    state: CircuitState,
    failure_count: u32,
    success_count: u32,
    last_failure_time: Option<Instant>,
    opened_at: Option<Instant>,
}

/// Circuit breaker implementation
pub struct CircuitBreaker {
    config: CircuitBreakerConfig,
    state: RwLock<CircuitBreakerState>,
    hook: Box<dyn CircuitBreakerHook>,
    total_calls: AtomicU64,
    total_failures: AtomicU64,
    total_rejections: AtomicU64,
}

impl CircuitBreaker {
    /// Create a new circuit breaker with default configuration
    pub fn new() -> Self {
        Self::with_config(CircuitBreakerConfig::default())
    }

    /// Create a new circuit breaker with custom configuration
    pub fn with_config(config: CircuitBreakerConfig) -> Self {
        Self {
            config,
            state: RwLock::new(CircuitBreakerState {
                state: CircuitState::Closed,
                failure_count: 0,
                success_count: 0,
                last_failure_time: None,
                opened_at: None,
            }),
            hook: Box::new(DefaultCircuitBreakerHook),
            total_calls: AtomicU64::new(0),
            total_failures: AtomicU64::new(0),
            total_rejections: AtomicU64::new(0),
        }
    }

    /// Set a custom hook
    pub fn with_hook(mut self, hook: impl CircuitBreakerHook + 'static) -> Self {
        self.hook = Box::new(hook);
        self
    }

    /// Get the current circuit state
    pub fn state(&self) -> CircuitState {
        let mut state = self.state.write();
        self.maybe_transition(&mut state);
        state.state
    }

    /// Check if the circuit allows a request
    pub fn allow_request(&self) -> bool {
        let mut state = self.state.write();
        self.maybe_transition(&mut state);

        match state.state {
            CircuitState::Closed => true,
            CircuitState::Open => {
                self.total_rejections.fetch_add(1, Ordering::Relaxed);
                self.hook.on_rejected();
                false
            }
            CircuitState::HalfOpen => true, // Allow test request
        }
    }

    /// Record a successful request
    pub fn record_success(&self) {
        self.total_calls.fetch_add(1, Ordering::Relaxed);

        let mut state = self.state.write();

        match state.state {
            CircuitState::Closed => {
                // Reset failure count on success in closed state
                state.failure_count = 0;
            }
            CircuitState::HalfOpen => {
                state.success_count += 1;
                if state.success_count >= self.config.success_threshold {
                    self.transition(&mut state, CircuitState::Closed);
                }
            }
            CircuitState::Open => {
                // Shouldn't happen, but reset success count
                state.success_count = 0;
            }
        }
    }

    /// Record a failed request
    pub fn record_failure(&self) {
        self.total_calls.fetch_add(1, Ordering::Relaxed);
        self.total_failures.fetch_add(1, Ordering::Relaxed);

        let mut state = self.state.write();
        state.last_failure_time = Some(Instant::now());

        match state.state {
            CircuitState::Closed => {
                // Clean up old failures outside the window
                if let Some(last_time) = state.last_failure_time {
                    if last_time.elapsed() > self.config.failure_window {
                        state.failure_count = 0;
                    }
                }

                state.failure_count += 1;
                if state.failure_count >= self.config.failure_threshold {
                    self.transition(&mut state, CircuitState::Open);
                }
            }
            CircuitState::HalfOpen => {
                // Any failure in half-open state reopens the circuit
                self.transition(&mut state, CircuitState::Open);
            }
            CircuitState::Open => {
                // Already open, nothing to do
            }
        }
    }

    /// Get metrics
    pub fn metrics(&self) -> CircuitBreakerMetrics {
        let state = self.state.read();
        CircuitBreakerMetrics {
            state: state.state,
            total_calls: self.total_calls.load(Ordering::Relaxed),
            total_failures: self.total_failures.load(Ordering::Relaxed),
            total_rejections: self.total_rejections.load(Ordering::Relaxed),
            current_failure_count: state.failure_count,
        }
    }

    /// Check if we should transition to a new state
    fn maybe_transition(&self, state: &mut CircuitBreakerState) {
        if state.state == CircuitState::Open {
            if let Some(opened_at) = state.opened_at {
                if opened_at.elapsed() >= self.config.reset_timeout {
                    self.transition(state, CircuitState::HalfOpen);
                }
            }
        }
    }

    /// Transition to a new state
    fn transition(&self, state: &mut CircuitBreakerState, new_state: CircuitState) {
        let old_state = state.state;
        if old_state == new_state {
            return;
        }

        state.state = new_state;

        match new_state {
            CircuitState::Open => {
                state.opened_at = Some(Instant::now());
                state.success_count = 0;
            }
            CircuitState::HalfOpen => {
                state.success_count = 0;
            }
            CircuitState::Closed => {
                state.failure_count = 0;
                state.success_count = 0;
                state.opened_at = None;
            }
        }

        self.hook.on_state_change(old_state, new_state);
    }

    /// Execute an operation with circuit breaker protection
    pub async fn execute<F, Fut, T>(&self, operation: F) -> Result<T, CohereError>
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = Result<T, CohereError>>,
    {
        if !self.allow_request() {
            return Err(CohereError::Server {
                message: "Circuit breaker is open".to_string(),
                status_code: Some(503),
            });
        }

        match operation().await {
            Ok(result) => {
                self.record_success();
                Ok(result)
            }
            Err(error) => {
                if error.is_retryable() {
                    self.record_failure();
                }
                Err(error)
            }
        }
    }
}

impl Default for CircuitBreaker {
    fn default() -> Self {
        Self::new()
    }
}

/// Metrics for the circuit breaker
#[derive(Debug, Clone)]
pub struct CircuitBreakerMetrics {
    /// Current state
    pub state: CircuitState,
    /// Total number of calls
    pub total_calls: u64,
    /// Total number of failures
    pub total_failures: u64,
    /// Total number of rejections
    pub total_rejections: u64,
    /// Current failure count in the window
    pub current_failure_count: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_circuit_breaker_initial_state() {
        let cb = CircuitBreaker::new();
        assert_eq!(cb.state(), CircuitState::Closed);
        assert!(cb.allow_request());
    }

    #[test]
    fn test_circuit_breaker_opens_after_failures() {
        let cb = CircuitBreaker::with_config(
            CircuitBreakerConfig::new()
                .with_failure_threshold(3)
                .with_reset_timeout(Duration::from_secs(1)),
        );

        // Record failures
        for _ in 0..3 {
            cb.record_failure();
        }

        assert_eq!(cb.state(), CircuitState::Open);
        assert!(!cb.allow_request());
    }

    #[test]
    fn test_circuit_breaker_success_resets_count() {
        let cb = CircuitBreaker::with_config(
            CircuitBreakerConfig::new().with_failure_threshold(3),
        );

        cb.record_failure();
        cb.record_failure();
        cb.record_success(); // Should reset failure count

        // Should still be closed
        assert_eq!(cb.state(), CircuitState::Closed);
    }

    #[test]
    fn test_circuit_breaker_metrics() {
        let cb = CircuitBreaker::new();

        cb.record_success();
        cb.record_failure();

        let metrics = cb.metrics();
        assert_eq!(metrics.total_calls, 2);
        assert_eq!(metrics.total_failures, 1);
    }
}
