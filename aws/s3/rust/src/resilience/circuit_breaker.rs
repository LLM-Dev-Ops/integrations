//! Circuit breaker implementation for S3 operations.

use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::RwLock;
use std::time::{Duration, Instant};
use tracing::{debug, info, warn};

/// Circuit breaker state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    /// Circuit is closed, requests flow normally.
    Closed,
    /// Circuit is open, requests are rejected.
    Open,
    /// Circuit is half-open, testing if service recovered.
    HalfOpen,
}

impl std::fmt::Display for CircuitState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CircuitState::Closed => write!(f, "closed"),
            CircuitState::Open => write!(f, "open"),
            CircuitState::HalfOpen => write!(f, "half-open"),
        }
    }
}

/// Circuit breaker configuration.
#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    /// Number of failures before opening the circuit.
    pub failure_threshold: u32,
    /// Number of successes in half-open state to close circuit.
    pub success_threshold: u32,
    /// Duration to wait before transitioning from open to half-open.
    pub open_duration: Duration,
    /// Sliding window duration for counting failures.
    pub window_duration: Duration,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            success_threshold: 2,
            open_duration: Duration::from_secs(30),
            window_duration: Duration::from_secs(60),
        }
    }
}

impl CircuitBreakerConfig {
    /// Create a new circuit breaker configuration.
    pub fn new(failure_threshold: u32) -> Self {
        Self {
            failure_threshold,
            ..Default::default()
        }
    }

    /// Set the success threshold for half-open state.
    pub fn with_success_threshold(mut self, threshold: u32) -> Self {
        self.success_threshold = threshold;
        self
    }

    /// Set the duration to wait in open state.
    pub fn with_open_duration(mut self, duration: Duration) -> Self {
        self.open_duration = duration;
        self
    }

    /// Set the sliding window duration.
    pub fn with_window_duration(mut self, duration: Duration) -> Self {
        self.window_duration = duration;
        self
    }
}

/// Circuit breaker for protecting against cascading failures.
pub struct CircuitBreaker {
    config: CircuitBreakerConfig,
    state: RwLock<CircuitState>,
    failure_count: AtomicU32,
    success_count: AtomicU32,
    last_failure_time: RwLock<Option<Instant>>,
    opened_at: RwLock<Option<Instant>>,
}

impl CircuitBreaker {
    /// Create a new circuit breaker with the given configuration.
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

    /// Check if a request is allowed through the circuit.
    pub fn is_allowed(&self) -> bool {
        let current_state = self.current_state();

        match current_state {
            CircuitState::Closed => true,
            CircuitState::Open => {
                // Check if we should transition to half-open
                if let Some(opened_at) = *self.opened_at.read().unwrap() {
                    if opened_at.elapsed() >= self.config.open_duration {
                        self.transition_to(CircuitState::HalfOpen);
                        return true;
                    }
                }
                false
            }
            CircuitState::HalfOpen => true,
        }
    }

    /// Record a successful operation.
    pub fn record_success(&self) {
        let current_state = self.current_state();

        match current_state {
            CircuitState::Closed => {
                // Reset failure count on success
                self.failure_count.store(0, Ordering::SeqCst);
            }
            CircuitState::HalfOpen => {
                let count = self.success_count.fetch_add(1, Ordering::SeqCst) + 1;
                debug!(
                    success_count = count,
                    threshold = self.config.success_threshold,
                    "Circuit breaker recorded success in half-open state"
                );

                if count >= self.config.success_threshold {
                    self.transition_to(CircuitState::Closed);
                }
            }
            CircuitState::Open => {
                // Shouldn't happen, but ignore
            }
        }
    }

    /// Record a failed operation.
    pub fn record_failure(&self) {
        let current_state = self.current_state();
        *self.last_failure_time.write().unwrap() = Some(Instant::now());

        match current_state {
            CircuitState::Closed => {
                // Check if failures are within the window
                self.cleanup_old_failures();

                let count = self.failure_count.fetch_add(1, Ordering::SeqCst) + 1;
                debug!(
                    failure_count = count,
                    threshold = self.config.failure_threshold,
                    "Circuit breaker recorded failure"
                );

                if count >= self.config.failure_threshold {
                    self.transition_to(CircuitState::Open);
                }
            }
            CircuitState::HalfOpen => {
                // Single failure in half-open state opens the circuit
                warn!("Circuit breaker failure in half-open state, opening circuit");
                self.transition_to(CircuitState::Open);
            }
            CircuitState::Open => {
                // Already open, ignore
            }
        }
    }

    /// Get the current circuit state.
    pub fn state(&self) -> CircuitState {
        self.current_state()
    }

    /// Reset the circuit breaker to closed state.
    pub fn reset(&self) {
        info!("Circuit breaker manually reset");
        self.transition_to(CircuitState::Closed);
    }

    /// Get failure count.
    pub fn failure_count(&self) -> u32 {
        self.failure_count.load(Ordering::SeqCst)
    }

    /// Get success count (in half-open state).
    pub fn success_count(&self) -> u32 {
        self.success_count.load(Ordering::SeqCst)
    }

    fn current_state(&self) -> CircuitState {
        *self.state.read().unwrap()
    }

    fn transition_to(&self, new_state: CircuitState) {
        let mut state = self.state.write().unwrap();
        let old_state = *state;

        if old_state == new_state {
            return;
        }

        info!(
            from = %old_state,
            to = %new_state,
            "Circuit breaker state transition"
        );

        match new_state {
            CircuitState::Closed => {
                self.failure_count.store(0, Ordering::SeqCst);
                self.success_count.store(0, Ordering::SeqCst);
                *self.opened_at.write().unwrap() = None;
            }
            CircuitState::Open => {
                *self.opened_at.write().unwrap() = Some(Instant::now());
                self.success_count.store(0, Ordering::SeqCst);
            }
            CircuitState::HalfOpen => {
                self.success_count.store(0, Ordering::SeqCst);
            }
        }

        *state = new_state;
    }

    fn cleanup_old_failures(&self) {
        if let Some(last_failure) = *self.last_failure_time.read().unwrap() {
            if last_failure.elapsed() > self.config.window_duration {
                self.failure_count.store(0, Ordering::SeqCst);
            }
        }
    }
}

impl std::fmt::Debug for CircuitBreaker {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CircuitBreaker")
            .field("state", &self.state())
            .field("failure_count", &self.failure_count())
            .field("success_count", &self.success_count())
            .field("config", &self.config)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = CircuitBreakerConfig::default();
        assert_eq!(config.failure_threshold, 5);
        assert_eq!(config.success_threshold, 2);
        assert_eq!(config.open_duration, Duration::from_secs(30));
        assert_eq!(config.window_duration, Duration::from_secs(60));
    }

    #[test]
    fn test_initial_state_is_closed() {
        let cb = CircuitBreaker::new(CircuitBreakerConfig::default());
        assert_eq!(cb.state(), CircuitState::Closed);
        assert!(cb.is_allowed());
    }

    #[test]
    fn test_opens_after_failure_threshold() {
        let config = CircuitBreakerConfig::new(3);
        let cb = CircuitBreaker::new(config);

        cb.record_failure();
        assert_eq!(cb.state(), CircuitState::Closed);

        cb.record_failure();
        assert_eq!(cb.state(), CircuitState::Closed);

        cb.record_failure();
        assert_eq!(cb.state(), CircuitState::Open);
        assert!(!cb.is_allowed());
    }

    #[test]
    fn test_success_resets_failure_count() {
        let config = CircuitBreakerConfig::new(3);
        let cb = CircuitBreaker::new(config);

        cb.record_failure();
        cb.record_failure();
        assert_eq!(cb.failure_count(), 2);

        cb.record_success();
        assert_eq!(cb.failure_count(), 0);
        assert_eq!(cb.state(), CircuitState::Closed);
    }

    #[test]
    fn test_manual_reset() {
        let config = CircuitBreakerConfig::new(2);
        let cb = CircuitBreaker::new(config);

        cb.record_failure();
        cb.record_failure();
        assert_eq!(cb.state(), CircuitState::Open);

        cb.reset();
        assert_eq!(cb.state(), CircuitState::Closed);
        assert_eq!(cb.failure_count(), 0);
    }

    #[test]
    fn test_state_display() {
        assert_eq!(format!("{}", CircuitState::Closed), "closed");
        assert_eq!(format!("{}", CircuitState::Open), "open");
        assert_eq!(format!("{}", CircuitState::HalfOpen), "half-open");
    }
}
