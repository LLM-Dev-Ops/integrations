//! Circuit Breaker
//!
//! Circuit breaker pattern for protecting OAuth2 endpoints.

use async_trait::async_trait;
use std::future::Future;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::error::{NetworkError, OAuth2Error};

/// Circuit state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    /// Circuit is closed, requests flow normally.
    Closed,
    /// Circuit is open, requests are rejected.
    Open,
    /// Circuit is half-open, limited requests allowed.
    HalfOpen,
}

/// Circuit breaker configuration.
#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    /// Number of failures before opening circuit.
    pub failure_threshold: u32,
    /// Number of successes to close circuit from half-open.
    pub success_threshold: u32,
    /// Duration to keep circuit open before half-open.
    pub open_duration: Duration,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            success_threshold: 2,
            open_duration: Duration::from_secs(30),
        }
    }
}

/// Default circuit breaker configuration.
pub const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = CircuitBreakerConfig {
    failure_threshold: 5,
    success_threshold: 2,
    open_duration: Duration::from_secs(30),
};

/// Circuit breaker statistics.
#[derive(Debug, Clone, Default)]
pub struct CircuitBreakerStats {
    pub total_requests: u32,
    pub successful_requests: u32,
    pub failed_requests: u32,
    pub rejected_requests: u32,
    pub state_transitions: u32,
}

/// Circuit breaker interface.
#[async_trait]
pub trait CircuitBreaker: Send + Sync {
    /// Execute an operation through the circuit breaker.
    async fn execute<T, F, Fut>(&self, operation: F) -> Result<T, OAuth2Error>
    where
        T: Send,
        F: Fn() -> Fut + Send + Sync,
        Fut: Future<Output = Result<T, OAuth2Error>> + Send;

    /// Get current circuit state.
    fn state(&self) -> CircuitState;

    /// Reset the circuit breaker.
    fn reset(&self);

    /// Get circuit breaker statistics.
    fn get_stats(&self) -> CircuitBreakerStats;
}

/// Circuit breaker state tracking.
struct CircuitBreakerState {
    state: CircuitState,
    failure_count: u32,
    success_count: u32,
    last_failure_time: Option<Instant>,
}

/// OAuth2 circuit breaker implementation.
pub struct OAuth2CircuitBreaker {
    config: CircuitBreakerConfig,
    state: Mutex<CircuitBreakerState>,
    stats: Mutex<CircuitBreakerStats>,
}

impl OAuth2CircuitBreaker {
    /// Create new circuit breaker.
    pub fn new(config: CircuitBreakerConfig) -> Self {
        Self {
            config,
            state: Mutex::new(CircuitBreakerState {
                state: CircuitState::Closed,
                failure_count: 0,
                success_count: 0,
                last_failure_time: None,
            }),
            stats: Mutex::new(CircuitBreakerStats::default()),
        }
    }

    fn record_success(&self) {
        let mut state = self.state.lock().unwrap();
        let mut stats = self.stats.lock().unwrap();

        stats.successful_requests += 1;

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
                    stats.state_transitions += 1;
                }
            }
            CircuitState::Open => {}
        }
    }

    fn record_failure(&self) {
        let mut state = self.state.lock().unwrap();
        let mut stats = self.stats.lock().unwrap();

        stats.failed_requests += 1;

        match state.state {
            CircuitState::Closed => {
                state.failure_count += 1;
                state.last_failure_time = Some(Instant::now());

                if state.failure_count >= self.config.failure_threshold {
                    state.state = CircuitState::Open;
                    stats.state_transitions += 1;
                }
            }
            CircuitState::HalfOpen => {
                state.state = CircuitState::Open;
                state.success_count = 0;
                state.last_failure_time = Some(Instant::now());
                stats.state_transitions += 1;
            }
            CircuitState::Open => {}
        }
    }

    fn check_state(&self) -> CircuitState {
        let mut state = self.state.lock().unwrap();

        if state.state == CircuitState::Open {
            if let Some(last_failure) = state.last_failure_time {
                if last_failure.elapsed() >= self.config.open_duration {
                    state.state = CircuitState::HalfOpen;
                    state.success_count = 0;
                    let mut stats = self.stats.lock().unwrap();
                    stats.state_transitions += 1;
                }
            }
        }

        state.state
    }
}

impl Default for OAuth2CircuitBreaker {
    fn default() -> Self {
        Self::new(CircuitBreakerConfig::default())
    }
}

#[async_trait]
impl CircuitBreaker for OAuth2CircuitBreaker {
    async fn execute<T, F, Fut>(&self, operation: F) -> Result<T, OAuth2Error>
    where
        T: Send,
        F: Fn() -> Fut + Send + Sync,
        Fut: Future<Output = Result<T, OAuth2Error>> + Send,
    {
        {
            let mut stats = self.stats.lock().unwrap();
            stats.total_requests += 1;
        }

        let current_state = self.check_state();

        if current_state == CircuitState::Open {
            let mut stats = self.stats.lock().unwrap();
            stats.rejected_requests += 1;
            return Err(OAuth2Error::Network(NetworkError::ConnectionError {
                message: "Circuit breaker is open".to_string(),
            }));
        }

        match operation().await {
            Ok(result) => {
                self.record_success();
                Ok(result)
            }
            Err(error) => {
                self.record_failure();
                Err(error)
            }
        }
    }

    fn state(&self) -> CircuitState {
        self.check_state()
    }

    fn reset(&self) {
        let mut state = self.state.lock().unwrap();
        state.state = CircuitState::Closed;
        state.failure_count = 0;
        state.success_count = 0;
        state.last_failure_time = None;
    }

    fn get_stats(&self) -> CircuitBreakerStats {
        self.stats.lock().unwrap().clone()
    }
}

/// Mock circuit breaker for testing.
#[derive(Default)]
pub struct MockCircuitBreaker {
    state: Mutex<CircuitState>,
    stats: Mutex<CircuitBreakerStats>,
    execution_count: AtomicU32,
}

impl MockCircuitBreaker {
    /// Create new mock circuit breaker.
    pub fn new() -> Self {
        Self {
            state: Mutex::new(CircuitState::Closed),
            stats: Mutex::new(CircuitBreakerStats::default()),
            execution_count: AtomicU32::new(0),
        }
    }

    /// Set circuit state.
    pub fn set_state(&self, state: CircuitState) -> &Self {
        *self.state.lock().unwrap() = state;
        self
    }

    /// Get execution count.
    pub fn get_execution_count(&self) -> u32 {
        self.execution_count.load(Ordering::SeqCst)
    }
}

#[async_trait]
impl CircuitBreaker for MockCircuitBreaker {
    async fn execute<T, F, Fut>(&self, operation: F) -> Result<T, OAuth2Error>
    where
        T: Send,
        F: Fn() -> Fut + Send + Sync,
        Fut: Future<Output = Result<T, OAuth2Error>> + Send,
    {
        let current_state = *self.state.lock().unwrap();

        if current_state == CircuitState::Open {
            return Err(OAuth2Error::Network(NetworkError::ConnectionError {
                message: "Mock circuit breaker is open".to_string(),
            }));
        }

        self.execution_count.fetch_add(1, Ordering::SeqCst);
        operation().await
    }

    fn state(&self) -> CircuitState {
        *self.state.lock().unwrap()
    }

    fn reset(&self) {
        *self.state.lock().unwrap() = CircuitState::Closed;
    }

    fn get_stats(&self) -> CircuitBreakerStats {
        self.stats.lock().unwrap().clone()
    }
}

/// Create circuit breaker.
pub fn create_circuit_breaker(config: CircuitBreakerConfig) -> impl CircuitBreaker {
    OAuth2CircuitBreaker::new(config)
}

/// Create mock circuit breaker for testing.
pub fn create_mock_circuit_breaker() -> MockCircuitBreaker {
    MockCircuitBreaker::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_circuit_state() {
        let cb = OAuth2CircuitBreaker::new(CircuitBreakerConfig::default());
        assert_eq!(cb.state(), CircuitState::Closed);
    }

    #[tokio::test]
    async fn test_successful_execution() {
        let cb = OAuth2CircuitBreaker::new(CircuitBreakerConfig::default());

        let result = cb
            .execute(|| async { Ok::<_, OAuth2Error>("success") })
            .await;

        assert!(result.is_ok());
        assert_eq!(cb.state(), CircuitState::Closed);
    }

    #[tokio::test]
    async fn test_mock_circuit_breaker_open() {
        let cb = MockCircuitBreaker::new();
        cb.set_state(CircuitState::Open);

        let result = cb
            .execute(|| async { Ok::<_, OAuth2Error>("success") })
            .await;

        assert!(result.is_err());
        assert_eq!(cb.get_execution_count(), 0);
    }
}
