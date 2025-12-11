//! Circuit breaker implementation.

use std::time::{Duration, Instant};

/// Circuit breaker state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    /// Circuit is closed, requests flow normally.
    Closed,
    /// Circuit is open, requests are rejected.
    Open,
    /// Circuit is testing, one request allowed.
    HalfOpen,
}

/// Circuit breaker configuration.
#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    /// Number of failures before opening.
    pub failure_threshold: u32,
    /// Number of successes needed to close from half-open.
    pub success_threshold: u32,
    /// Duration to wait before transitioning to half-open.
    pub open_duration: Duration,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            success_threshold: 1,
            open_duration: Duration::from_secs(30),
        }
    }
}

impl CircuitBreakerConfig {
    /// Creates a new configuration.
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets the failure threshold.
    pub fn failure_threshold(mut self, threshold: u32) -> Self {
        self.failure_threshold = threshold;
        self
    }

    /// Sets the success threshold.
    pub fn success_threshold(mut self, threshold: u32) -> Self {
        self.success_threshold = threshold;
        self
    }

    /// Sets the open duration.
    pub fn open_duration(mut self, duration: Duration) -> Self {
        self.open_duration = duration;
        self
    }
}

/// Circuit breaker for protecting against cascading failures.
#[derive(Debug)]
pub struct CircuitBreaker {
    config: CircuitBreakerConfig,
    state: CircuitState,
    failure_count: u32,
    success_count: u32,
    last_failure_time: Option<Instant>,
}

impl CircuitBreaker {
    /// Creates a new circuit breaker.
    pub fn new(config: CircuitBreakerConfig) -> Self {
        Self {
            config,
            state: CircuitState::Closed,
            failure_count: 0,
            success_count: 0,
            last_failure_time: None,
        }
    }

    /// Creates a circuit breaker with default configuration.
    pub fn default_config() -> Self {
        Self::new(CircuitBreakerConfig::default())
    }

    /// Returns the current state.
    pub fn state(&self) -> CircuitState {
        self.state
    }

    /// Checks if a request should be allowed.
    pub fn allow_request(&mut self) -> bool {
        match self.state {
            CircuitState::Closed => true,
            CircuitState::Open => {
                // Check if we should transition to half-open
                if let Some(last_failure) = self.last_failure_time {
                    if last_failure.elapsed() >= self.config.open_duration {
                        tracing::info!("Circuit breaker transitioning to half-open");
                        self.state = CircuitState::HalfOpen;
                        self.success_count = 0;
                        return true;
                    }
                }
                false
            }
            CircuitState::HalfOpen => true,
        }
    }

    /// Records a successful request.
    pub fn record_success(&mut self) {
        match self.state {
            CircuitState::Closed => {
                // Reset failure count on success
                self.failure_count = 0;
            }
            CircuitState::HalfOpen => {
                self.success_count += 1;
                if self.success_count >= self.config.success_threshold {
                    tracing::info!("Circuit breaker closing after successful probes");
                    self.state = CircuitState::Closed;
                    self.failure_count = 0;
                    self.success_count = 0;
                    self.last_failure_time = None;
                }
            }
            CircuitState::Open => {
                // Shouldn't happen, but reset if it does
                self.success_count = 1;
            }
        }
    }

    /// Records a failed request.
    pub fn record_failure(&mut self) {
        match self.state {
            CircuitState::Closed => {
                self.failure_count += 1;
                if self.failure_count >= self.config.failure_threshold {
                    tracing::warn!(
                        failures = self.failure_count,
                        threshold = self.config.failure_threshold,
                        "Circuit breaker opening"
                    );
                    self.state = CircuitState::Open;
                    self.last_failure_time = Some(Instant::now());
                }
            }
            CircuitState::HalfOpen => {
                tracing::info!("Circuit breaker re-opening after failed probe");
                self.state = CircuitState::Open;
                self.last_failure_time = Some(Instant::now());
                self.success_count = 0;
            }
            CircuitState::Open => {
                // Update last failure time
                self.last_failure_time = Some(Instant::now());
            }
        }
    }

    /// Resets the circuit breaker to closed state.
    pub fn reset(&mut self) {
        self.state = CircuitState::Closed;
        self.failure_count = 0;
        self.success_count = 0;
        self.last_failure_time = None;
    }

    /// Returns the number of consecutive failures.
    pub fn failure_count(&self) -> u32 {
        self.failure_count
    }
}

impl Default for CircuitBreaker {
    fn default() -> Self {
        Self::default_config()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_circuit_starts_closed() {
        let cb = CircuitBreaker::default();
        assert_eq!(cb.state(), CircuitState::Closed);
    }

    #[test]
    fn test_circuit_opens_after_failures() {
        let config = CircuitBreakerConfig::new().failure_threshold(3);
        let mut cb = CircuitBreaker::new(config);

        // Record failures up to threshold
        for _ in 0..3 {
            assert!(cb.allow_request());
            cb.record_failure();
        }

        assert_eq!(cb.state(), CircuitState::Open);
        assert!(!cb.allow_request());
    }

    #[test]
    fn test_circuit_success_resets_failures() {
        let config = CircuitBreakerConfig::new().failure_threshold(3);
        let mut cb = CircuitBreaker::new(config);

        cb.record_failure();
        cb.record_failure();
        cb.record_success();

        assert_eq!(cb.failure_count(), 0);
        assert_eq!(cb.state(), CircuitState::Closed);
    }

    #[test]
    fn test_circuit_half_open_after_timeout() {
        let config = CircuitBreakerConfig::new()
            .failure_threshold(1)
            .open_duration(Duration::from_millis(10));
        let mut cb = CircuitBreaker::new(config);

        cb.record_failure();
        assert_eq!(cb.state(), CircuitState::Open);

        // Wait for timeout
        std::thread::sleep(Duration::from_millis(15));

        // Should allow request and transition to half-open
        assert!(cb.allow_request());
        assert_eq!(cb.state(), CircuitState::HalfOpen);
    }

    #[test]
    fn test_circuit_closes_from_half_open() {
        let config = CircuitBreakerConfig::new()
            .failure_threshold(1)
            .success_threshold(2)
            .open_duration(Duration::from_millis(10));
        let mut cb = CircuitBreaker::new(config);

        // Open the circuit
        cb.record_failure();
        std::thread::sleep(Duration::from_millis(15));
        cb.allow_request(); // Transition to half-open

        // Record successes
        cb.record_success();
        assert_eq!(cb.state(), CircuitState::HalfOpen);

        cb.record_success();
        assert_eq!(cb.state(), CircuitState::Closed);
    }

    #[test]
    fn test_circuit_reopens_from_half_open() {
        let config = CircuitBreakerConfig::new()
            .failure_threshold(1)
            .open_duration(Duration::from_millis(10));
        let mut cb = CircuitBreaker::new(config);

        // Open the circuit
        cb.record_failure();
        std::thread::sleep(Duration::from_millis(15));
        cb.allow_request(); // Transition to half-open

        // Fail in half-open
        cb.record_failure();
        assert_eq!(cb.state(), CircuitState::Open);
    }

    #[test]
    fn test_circuit_reset() {
        let config = CircuitBreakerConfig::new().failure_threshold(1);
        let mut cb = CircuitBreaker::new(config);

        cb.record_failure();
        assert_eq!(cb.state(), CircuitState::Open);

        cb.reset();
        assert_eq!(cb.state(), CircuitState::Closed);
        assert_eq!(cb.failure_count(), 0);
    }
}
