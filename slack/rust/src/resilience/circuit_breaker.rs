//! Circuit breaker pattern for fault tolerance.

use crate::errors::{ServerError, SlackError, SlackResult};
use parking_lot::RwLock;
use std::future::Future;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tracing::{debug, info, warn};

/// Circuit breaker state
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    /// Circuit is closed, requests pass through
    Closed,
    /// Circuit is open, requests are rejected
    Open,
    /// Circuit is half-open, testing if service is healthy
    HalfOpen,
}

/// Configuration for circuit breaker
#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    /// Number of failures before opening circuit
    pub failure_threshold: u32,
    /// Number of successes in half-open to close circuit
    pub success_threshold: u32,
    /// How long to wait before transitioning to half-open
    pub open_timeout: Duration,
    /// Maximum concurrent requests in half-open state
    pub half_open_max_requests: u32,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            success_threshold: 3,
            open_timeout: Duration::from_secs(30),
            half_open_max_requests: 3,
        }
    }
}

impl CircuitBreakerConfig {
    /// Create a new configuration
    pub fn new() -> Self {
        Self::default()
    }

    /// Set failure threshold
    pub fn failure_threshold(mut self, n: u32) -> Self {
        self.failure_threshold = n;
        self
    }

    /// Set success threshold
    pub fn success_threshold(mut self, n: u32) -> Self {
        self.success_threshold = n;
        self
    }

    /// Set open timeout
    pub fn open_timeout(mut self, timeout: Duration) -> Self {
        self.open_timeout = timeout;
        self
    }

    /// Set half-open max requests
    pub fn half_open_max_requests(mut self, n: u32) -> Self {
        self.half_open_max_requests = n;
        self
    }
}

/// Internal circuit breaker state
struct CircuitBreakerState {
    state: CircuitState,
    failure_count: u32,
    success_count: u32,
    last_failure_time: Option<Instant>,
    half_open_requests: u32,
}

impl Default for CircuitBreakerState {
    fn default() -> Self {
        Self {
            state: CircuitState::Closed,
            failure_count: 0,
            success_count: 0,
            last_failure_time: None,
            half_open_requests: 0,
        }
    }
}

/// Circuit breaker implementation
pub struct CircuitBreaker {
    config: CircuitBreakerConfig,
    state: RwLock<CircuitBreakerState>,
    // Metrics
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
            state: RwLock::new(CircuitBreakerState::default()),
            total_calls: AtomicU64::new(0),
            total_failures: AtomicU64::new(0),
            total_rejections: AtomicU64::new(0),
        }
    }

    /// Get the current circuit state
    pub fn state(&self) -> CircuitState {
        let mut state = self.state.write();
        self.maybe_transition_to_half_open(&mut state);
        state.state
    }

    /// Check if circuit allows requests
    pub fn is_available(&self) -> bool {
        let state = self.state();
        matches!(state, CircuitState::Closed | CircuitState::HalfOpen)
    }

    /// Execute an operation through the circuit breaker
    pub async fn execute<F, Fut, T>(&self, operation: F) -> SlackResult<T>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = SlackResult<T>>,
    {
        self.total_calls.fetch_add(1, Ordering::Relaxed);

        // Check if we can proceed
        if !self.try_acquire() {
            self.total_rejections.fetch_add(1, Ordering::Relaxed);
            return Err(SlackError::Server(ServerError::ServiceUnavailable));
        }

        // Execute the operation
        match operation().await {
            Ok(result) => {
                self.record_success();
                Ok(result)
            }
            Err(error) => {
                if self.should_count_failure(&error) {
                    self.record_failure();
                }
                Err(error)
            }
        }
    }

    /// Try to acquire permission to make a request
    fn try_acquire(&self) -> bool {
        let mut state = self.state.write();

        // Check for state transition from open to half-open
        self.maybe_transition_to_half_open(&mut state);

        match state.state {
            CircuitState::Closed => true,
            CircuitState::Open => false,
            CircuitState::HalfOpen => {
                if state.half_open_requests < self.config.half_open_max_requests {
                    state.half_open_requests += 1;
                    true
                } else {
                    false
                }
            }
        }
    }

    /// Record a successful operation
    fn record_success(&self) {
        let mut state = self.state.write();

        match state.state {
            CircuitState::Closed => {
                // Reset failure count on success
                state.failure_count = 0;
            }
            CircuitState::HalfOpen => {
                state.success_count += 1;
                state.half_open_requests = state.half_open_requests.saturating_sub(1);

                if state.success_count >= self.config.success_threshold {
                    info!("Circuit breaker transitioning to CLOSED");
                    state.state = CircuitState::Closed;
                    state.failure_count = 0;
                    state.success_count = 0;
                }
            }
            CircuitState::Open => {
                // Shouldn't happen, but handle gracefully
                warn!("Success recorded while circuit is open");
            }
        }
    }

    /// Record a failed operation
    fn record_failure(&self) {
        self.total_failures.fetch_add(1, Ordering::Relaxed);

        let mut state = self.state.write();

        match state.state {
            CircuitState::Closed => {
                state.failure_count += 1;
                state.last_failure_time = Some(Instant::now());

                if state.failure_count >= self.config.failure_threshold {
                    warn!(
                        failure_count = state.failure_count,
                        "Circuit breaker transitioning to OPEN"
                    );
                    state.state = CircuitState::Open;
                }
            }
            CircuitState::HalfOpen => {
                // Any failure in half-open returns to open
                warn!("Circuit breaker returning to OPEN from half-open");
                state.state = CircuitState::Open;
                state.last_failure_time = Some(Instant::now());
                state.success_count = 0;
                state.half_open_requests = 0;
            }
            CircuitState::Open => {
                // Update last failure time
                state.last_failure_time = Some(Instant::now());
            }
        }
    }

    /// Check if circuit should transition from open to half-open
    fn maybe_transition_to_half_open(&self, state: &mut CircuitBreakerState) {
        if state.state == CircuitState::Open {
            if let Some(last_failure) = state.last_failure_time {
                if last_failure.elapsed() >= self.config.open_timeout {
                    debug!("Circuit breaker transitioning to HALF_OPEN");
                    state.state = CircuitState::HalfOpen;
                    state.success_count = 0;
                    state.half_open_requests = 0;
                }
            }
        }
    }

    /// Check if an error should count as a failure
    fn should_count_failure(&self, error: &SlackError) -> bool {
        // Only count server errors and network errors as circuit breaker failures
        matches!(
            error,
            SlackError::Network(_) | SlackError::Server(_)
        )
    }

    /// Reset the circuit breaker to closed state
    pub fn reset(&self) {
        let mut state = self.state.write();
        state.state = CircuitState::Closed;
        state.failure_count = 0;
        state.success_count = 0;
        state.last_failure_time = None;
        state.half_open_requests = 0;
        debug!("Circuit breaker reset to CLOSED");
    }

    /// Get total call count
    pub fn total_calls(&self) -> u64 {
        self.total_calls.load(Ordering::Relaxed)
    }

    /// Get total failure count
    pub fn total_failures(&self) -> u64 {
        self.total_failures.load(Ordering::Relaxed)
    }

    /// Get total rejection count
    pub fn total_rejections(&self) -> u64 {
        self.total_rejections.load(Ordering::Relaxed)
    }

    /// Get failure rate (0.0 to 1.0)
    pub fn failure_rate(&self) -> f64 {
        let total = self.total_calls.load(Ordering::Relaxed);
        if total == 0 {
            return 0.0;
        }
        self.total_failures.load(Ordering::Relaxed) as f64 / total as f64
    }
}

impl Default for CircuitBreaker {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Debug for CircuitBreaker {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CircuitBreaker")
            .field("config", &self.config)
            .field("state", &self.state())
            .field("total_calls", &self.total_calls())
            .field("total_failures", &self.total_failures())
            .field("total_rejections", &self.total_rejections())
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::NetworkError;

    #[test]
    fn test_initial_state() {
        let cb = CircuitBreaker::new();
        assert_eq!(cb.state(), CircuitState::Closed);
        assert!(cb.is_available());
    }

    #[tokio::test]
    async fn test_success_keeps_closed() {
        let cb = CircuitBreaker::new();

        for _ in 0..10 {
            let result = cb.execute(|| async { Ok::<_, SlackError>("success") }).await;
            assert!(result.is_ok());
        }

        assert_eq!(cb.state(), CircuitState::Closed);
    }

    #[tokio::test]
    async fn test_failures_open_circuit() {
        let cb = CircuitBreaker::with_config(
            CircuitBreakerConfig::new()
                .failure_threshold(3)
                .open_timeout(Duration::from_millis(100)),
        );

        for _ in 0..3 {
            let _ = cb
                .execute(|| async {
                    Err::<(), _>(SlackError::Network(NetworkError::Timeout))
                })
                .await;
        }

        assert_eq!(cb.state(), CircuitState::Open);
        assert!(!cb.is_available());
    }

    #[tokio::test]
    async fn test_open_rejects_requests() {
        let cb = CircuitBreaker::with_config(
            CircuitBreakerConfig::new()
                .failure_threshold(1)
                .open_timeout(Duration::from_secs(60)),
        );

        // Trip the circuit
        let _ = cb
            .execute(|| async {
                Err::<(), _>(SlackError::Network(NetworkError::Timeout))
            })
            .await;

        assert_eq!(cb.state(), CircuitState::Open);

        // Should be rejected
        let result = cb.execute(|| async { Ok::<_, SlackError>("success") }).await;
        assert!(matches!(
            result,
            Err(SlackError::Server(ServerError::ServiceUnavailable))
        ));
    }

    #[tokio::test]
    async fn test_half_open_transition() {
        let cb = CircuitBreaker::with_config(
            CircuitBreakerConfig::new()
                .failure_threshold(1)
                .open_timeout(Duration::from_millis(10)),
        );

        // Trip the circuit
        let _ = cb
            .execute(|| async {
                Err::<(), _>(SlackError::Network(NetworkError::Timeout))
            })
            .await;

        assert_eq!(cb.state(), CircuitState::Open);

        // Wait for timeout
        tokio::time::sleep(Duration::from_millis(20)).await;

        assert_eq!(cb.state(), CircuitState::HalfOpen);
    }

    #[test]
    fn test_reset() {
        let cb = CircuitBreaker::new();

        // Manually set some state
        {
            let mut state = cb.state.write();
            state.state = CircuitState::Open;
            state.failure_count = 5;
        }

        cb.reset();

        assert_eq!(cb.state(), CircuitState::Closed);
    }
}
