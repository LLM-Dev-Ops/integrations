//! Circuit breaker pattern implementation for the Gemini API client.
//!
//! Prevents cascading failures by temporarily stopping requests to a failing service
//! and allowing it time to recover.

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::RwLock;
use std::time::{Duration, Instant};
use crate::error::GeminiError;

/// Configuration for the circuit breaker.
#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    /// Number of consecutive failures before opening the circuit.
    pub failure_threshold: u32,
    /// Number of consecutive successes in half-open state before closing the circuit.
    pub success_threshold: u32,
    /// Duration to wait in open state before transitioning to half-open.
    pub timeout: Duration,
    /// Window duration for tracking failures (rolling window).
    pub window_duration: Duration,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            success_threshold: 2,
            timeout: Duration::from_secs(60),
            window_duration: Duration::from_secs(120),
        }
    }
}

impl CircuitBreakerConfig {
    /// Creates a new circuit breaker configuration.
    pub fn new(
        failure_threshold: u32,
        success_threshold: u32,
        timeout: Duration,
        window_duration: Duration,
    ) -> Self {
        Self {
            failure_threshold,
            success_threshold,
            timeout,
            window_duration,
        }
    }

    /// Creates a sensitive configuration that opens quickly.
    pub fn sensitive() -> Self {
        Self {
            failure_threshold: 3,
            success_threshold: 2,
            timeout: Duration::from_secs(30),
            window_duration: Duration::from_secs(60),
        }
    }

    /// Creates a lenient configuration that tolerates more failures.
    pub fn lenient() -> Self {
        Self {
            failure_threshold: 10,
            success_threshold: 3,
            timeout: Duration::from_secs(120),
            window_duration: Duration::from_secs(300),
        }
    }
}

/// The state of the circuit breaker.
#[derive(Debug, Clone, PartialEq)]
pub enum CircuitState {
    /// Circuit is closed, requests flow normally.
    Closed,
    /// Circuit is open, requests are rejected until timeout expires.
    Open { until: Instant },
    /// Circuit is half-open, allowing limited requests to test recovery.
    HalfOpen,
}

/// Circuit breaker that prevents cascading failures.
pub struct CircuitBreaker {
    config: CircuitBreakerConfig,
    state: RwLock<CircuitState>,
    failure_count: AtomicU32,
    success_count: AtomicU32,
    last_failure_time: RwLock<Option<Instant>>,
}

impl CircuitBreaker {
    /// Creates a new circuit breaker with the given configuration.
    pub fn new(config: CircuitBreakerConfig) -> Self {
        Self {
            config,
            state: RwLock::new(CircuitState::Closed),
            failure_count: AtomicU32::new(0),
            success_count: AtomicU32::new(0),
            last_failure_time: RwLock::new(None),
        }
    }

    /// Creates a circuit breaker with default configuration.
    pub fn with_defaults() -> Self {
        Self::new(CircuitBreakerConfig::default())
    }

    /// Checks if the circuit allows a request to proceed.
    ///
    /// # Returns
    ///
    /// - `Ok(())` if the request can proceed
    /// - `Err(GeminiError)` if the circuit is open and rejecting requests
    pub fn check(&self) -> Result<(), GeminiError> {
        let state = self.state.read().unwrap();

        match *state {
            CircuitState::Closed => Ok(()),
            CircuitState::HalfOpen => Ok(()),
            CircuitState::Open { until } => {
                if Instant::now() >= until {
                    // Timeout expired, transition to half-open
                    drop(state);
                    self.transition_to_half_open();
                    Ok(())
                } else {
                    Err(GeminiError::Server(crate::error::ServerError::ServiceUnavailable {
                        retry_after: Some(until.saturating_duration_since(Instant::now())),
                    }))
                }
            }
        }
    }

    /// Records a successful operation.
    pub fn record_success(&self) {
        let state = self.state.read().unwrap().clone();

        match state {
            CircuitState::HalfOpen => {
                let successes = self.success_count.fetch_add(1, Ordering::SeqCst) + 1;
                tracing::debug!(
                    "Circuit breaker recorded success in half-open state ({}/{})",
                    successes,
                    self.config.success_threshold
                );

                if successes >= self.config.success_threshold {
                    drop(state);
                    self.transition_to_closed();
                }
            }
            CircuitState::Closed => {
                // Reset failure count on success in closed state
                self.failure_count.store(0, Ordering::SeqCst);
            }
            CircuitState::Open { .. } => {
                // Ignore successes in open state
            }
        }
    }

    /// Records a failed operation.
    pub fn record_failure(&self) {
        let state = self.state.read().unwrap().clone();

        // Update last failure time
        *self.last_failure_time.write().unwrap() = Some(Instant::now());

        match state {
            CircuitState::Closed => {
                let failures = self.failure_count.fetch_add(1, Ordering::SeqCst) + 1;
                tracing::warn!(
                    "Circuit breaker recorded failure in closed state ({}/{})",
                    failures,
                    self.config.failure_threshold
                );

                if failures >= self.config.failure_threshold {
                    // Check if failures are within the window
                    if self.is_within_window() {
                        drop(state);
                        self.transition_to_open();
                    }
                }
            }
            CircuitState::HalfOpen => {
                // Any failure in half-open immediately opens the circuit
                drop(state);
                self.transition_to_open();
            }
            CircuitState::Open { .. } => {
                // Already open, do nothing
            }
        }
    }

    /// Checks if the last failure is within the configured window.
    fn is_within_window(&self) -> bool {
        if let Some(last_failure) = *self.last_failure_time.read().unwrap() {
            let elapsed = Instant::now().saturating_duration_since(last_failure);
            elapsed <= self.config.window_duration
        } else {
            false
        }
    }

    /// Transitions the circuit to the closed state.
    fn transition_to_closed(&self) {
        tracing::info!("Circuit breaker transitioning to CLOSED state");
        *self.state.write().unwrap() = CircuitState::Closed;
        self.failure_count.store(0, Ordering::SeqCst);
        self.success_count.store(0, Ordering::SeqCst);
    }

    /// Transitions the circuit to the half-open state.
    fn transition_to_half_open(&self) {
        tracing::info!("Circuit breaker transitioning to HALF-OPEN state");
        *self.state.write().unwrap() = CircuitState::HalfOpen;
        self.success_count.store(0, Ordering::SeqCst);
    }

    /// Transitions the circuit to the open state.
    fn transition_to_open(&self) {
        let until = Instant::now() + self.config.timeout;
        tracing::warn!(
            "Circuit breaker transitioning to OPEN state for {:?}",
            self.config.timeout
        );
        *self.state.write().unwrap() = CircuitState::Open { until };
        self.failure_count.store(0, Ordering::SeqCst);
        self.success_count.store(0, Ordering::SeqCst);
    }

    /// Returns the current state of the circuit.
    pub fn state(&self) -> CircuitState {
        self.state.read().unwrap().clone()
    }

    /// Returns the current failure count.
    pub fn failure_count(&self) -> u32 {
        self.failure_count.load(Ordering::SeqCst)
    }

    /// Returns the current success count (in half-open state).
    pub fn success_count(&self) -> u32 {
        self.success_count.load(Ordering::SeqCst)
    }

    /// Resets the circuit breaker to closed state.
    pub fn reset(&self) {
        self.transition_to_closed();
    }
}

impl std::fmt::Debug for CircuitBreaker {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CircuitBreaker")
            .field("config", &self.config)
            .field("state", &self.state())
            .field("failure_count", &self.failure_count())
            .field("success_count", &self.success_count())
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn test_circuit_breaker_initial_state() {
        let cb = CircuitBreaker::with_defaults();
        assert_eq!(cb.state(), CircuitState::Closed);
        assert_eq!(cb.failure_count(), 0);
        assert_eq!(cb.success_count(), 0);
    }

    #[test]
    fn test_circuit_opens_after_threshold() {
        let config = CircuitBreakerConfig {
            failure_threshold: 3,
            success_threshold: 2,
            timeout: Duration::from_millis(100),
            window_duration: Duration::from_secs(10),
        };
        let cb = CircuitBreaker::new(config);

        // Record failures
        cb.record_failure();
        cb.record_failure();
        assert_eq!(cb.state(), CircuitState::Closed);

        cb.record_failure();
        assert!(matches!(cb.state(), CircuitState::Open { .. }));
    }

    #[test]
    fn test_circuit_rejects_requests_when_open() {
        let config = CircuitBreakerConfig {
            failure_threshold: 2,
            timeout: Duration::from_secs(10),
            ..Default::default()
        };
        let cb = CircuitBreaker::new(config);

        // Open the circuit
        cb.record_failure();
        cb.record_failure();
        assert!(matches!(cb.state(), CircuitState::Open { .. }));

        // Requests should be rejected
        assert!(cb.check().is_err());
    }

    #[test]
    fn test_circuit_transitions_to_half_open() {
        let config = CircuitBreakerConfig {
            failure_threshold: 2,
            timeout: Duration::from_millis(50),
            ..Default::default()
        };
        let cb = CircuitBreaker::new(config);

        // Open the circuit
        cb.record_failure();
        cb.record_failure();
        assert!(matches!(cb.state(), CircuitState::Open { .. }));

        // Wait for timeout
        thread::sleep(Duration::from_millis(60));

        // Check should transition to half-open
        assert!(cb.check().is_ok());
        assert_eq!(cb.state(), CircuitState::HalfOpen);
    }

    #[test]
    fn test_circuit_closes_after_successes_in_half_open() {
        let config = CircuitBreakerConfig {
            failure_threshold: 2,
            success_threshold: 2,
            timeout: Duration::from_millis(50),
            ..Default::default()
        };
        let cb = CircuitBreaker::new(config);

        // Open the circuit
        cb.record_failure();
        cb.record_failure();
        thread::sleep(Duration::from_millis(60));
        cb.check().unwrap(); // Transition to half-open

        assert_eq!(cb.state(), CircuitState::HalfOpen);

        // Record successes
        cb.record_success();
        assert_eq!(cb.state(), CircuitState::HalfOpen);

        cb.record_success();
        assert_eq!(cb.state(), CircuitState::Closed);
    }

    #[test]
    fn test_circuit_reopens_on_failure_in_half_open() {
        let config = CircuitBreakerConfig {
            failure_threshold: 2,
            timeout: Duration::from_millis(50),
            ..Default::default()
        };
        let cb = CircuitBreaker::new(config);

        // Open the circuit
        cb.record_failure();
        cb.record_failure();
        thread::sleep(Duration::from_millis(60));
        cb.check().unwrap(); // Transition to half-open

        assert_eq!(cb.state(), CircuitState::HalfOpen);

        // Failure in half-open should reopen
        cb.record_failure();
        assert!(matches!(cb.state(), CircuitState::Open { .. }));
    }

    #[test]
    fn test_circuit_resets_failure_count_on_success() {
        let config = CircuitBreakerConfig {
            failure_threshold: 3,
            ..Default::default()
        };
        let cb = CircuitBreaker::new(config);

        // Record some failures
        cb.record_failure();
        cb.record_failure();
        assert_eq!(cb.failure_count(), 2);

        // Success should reset the count
        cb.record_success();
        assert_eq!(cb.failure_count(), 0);
    }

    #[test]
    fn test_circuit_reset() {
        let config = CircuitBreakerConfig {
            failure_threshold: 2,
            ..Default::default()
        };
        let cb = CircuitBreaker::new(config);

        // Open the circuit
        cb.record_failure();
        cb.record_failure();
        assert!(matches!(cb.state(), CircuitState::Open { .. }));

        // Reset should close it
        cb.reset();
        assert_eq!(cb.state(), CircuitState::Closed);
        assert_eq!(cb.failure_count(), 0);
    }

    #[test]
    fn test_config_sensitive() {
        let config = CircuitBreakerConfig::sensitive();
        assert_eq!(config.failure_threshold, 3);
        assert_eq!(config.timeout, Duration::from_secs(30));
    }

    #[test]
    fn test_config_lenient() {
        let config = CircuitBreakerConfig::lenient();
        assert_eq!(config.failure_threshold, 10);
        assert_eq!(config.timeout, Duration::from_secs(120));
    }
}
