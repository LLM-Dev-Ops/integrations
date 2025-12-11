//! Circuit breaker pattern implementation.

use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

use crate::errors::{MistralError, MistralResult};

/// Circuit breaker state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    /// Circuit is closed - requests are allowed.
    Closed,
    /// Circuit is open - requests are blocked.
    Open,
    /// Circuit is half-open - limited requests for testing.
    HalfOpen,
}

/// Configuration for the circuit breaker.
#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    /// Number of failures before opening the circuit.
    pub failure_threshold: u32,
    /// Number of successes needed to close from half-open.
    pub success_threshold: u32,
    /// Window for counting failures.
    pub failure_window: Duration,
    /// Time to wait before transitioning to half-open.
    pub reset_timeout: Duration,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            success_threshold: 3,
            failure_window: Duration::from_secs(60),
            reset_timeout: Duration::from_secs(30),
        }
    }
}

/// Hook for circuit breaker state changes.
pub trait CircuitBreakerHook: Send + Sync {
    /// Called when the circuit state changes.
    fn on_state_change(&self, old_state: CircuitState, new_state: CircuitState);
}

/// Circuit breaker for preventing cascading failures.
pub struct CircuitBreaker {
    config: CircuitBreakerConfig,
    state: Mutex<CircuitState>,
    failure_count: AtomicU32,
    success_count: AtomicU32,
    last_failure_time: AtomicU64,
    state_changed_at: AtomicU64,
    hook: Option<Arc<dyn CircuitBreakerHook>>,
}

impl CircuitBreaker {
    /// Creates a new circuit breaker.
    pub fn new(config: CircuitBreakerConfig) -> Self {
        Self {
            config,
            state: Mutex::new(CircuitState::Closed),
            failure_count: AtomicU32::new(0),
            success_count: AtomicU32::new(0),
            last_failure_time: AtomicU64::new(0),
            state_changed_at: AtomicU64::new(Self::now_millis()),
            hook: None,
        }
    }

    /// Sets a state change hook.
    pub fn with_hook(mut self, hook: Arc<dyn CircuitBreakerHook>) -> Self {
        self.hook = Some(hook);
        self
    }

    /// Returns the current state.
    pub async fn state(&self) -> CircuitState {
        let mut state = self.state.lock().await;
        self.maybe_transition_to_half_open(&mut state);
        *state
    }

    /// Returns true if the circuit is open.
    pub async fn is_open(&self) -> bool {
        self.state().await == CircuitState::Open
    }

    /// Returns the time until the circuit transitions to half-open.
    pub fn time_until_half_open(&self) -> Option<Duration> {
        let state_changed = self.state_changed_at.load(Ordering::Relaxed);
        let now = Self::now_millis();
        let elapsed = Duration::from_millis(now - state_changed);

        if elapsed < self.config.reset_timeout {
            Some(self.config.reset_timeout - elapsed)
        } else {
            None
        }
    }

    /// Records a successful operation.
    pub async fn record_success(&self) {
        let mut state = self.state.lock().await;

        match *state {
            CircuitState::HalfOpen => {
                let successes = self.success_count.fetch_add(1, Ordering::Relaxed) + 1;
                if successes >= self.config.success_threshold {
                    self.transition_to(&mut state, CircuitState::Closed);
                }
            }
            CircuitState::Closed => {
                // Reset failure count on success
                self.failure_count.store(0, Ordering::Relaxed);
            }
            CircuitState::Open => {
                // Shouldn't happen, but handle gracefully
            }
        }
    }

    /// Records a failed operation.
    pub async fn record_failure(&self) {
        let mut state = self.state.lock().await;

        match *state {
            CircuitState::Closed => {
                let failures = self.failure_count.fetch_add(1, Ordering::Relaxed) + 1;
                self.last_failure_time
                    .store(Self::now_millis(), Ordering::Relaxed);

                if failures >= self.config.failure_threshold {
                    self.transition_to(&mut state, CircuitState::Open);
                }
            }
            CircuitState::HalfOpen => {
                // Any failure in half-open returns to open
                self.transition_to(&mut state, CircuitState::Open);
            }
            CircuitState::Open => {
                // Already open, nothing to do
            }
        }
    }

    /// Checks if a request should be allowed.
    pub async fn allow_request(&self) -> MistralResult<()> {
        let mut state = self.state.lock().await;
        self.maybe_transition_to_half_open(&mut state);

        match *state {
            CircuitState::Closed => Ok(()),
            CircuitState::HalfOpen => Ok(()), // Allow test request
            CircuitState::Open => Err(MistralError::CircuitOpen),
        }
    }

    /// Maybe transitions from open to half-open.
    fn maybe_transition_to_half_open(&self, state: &mut CircuitState) {
        if *state == CircuitState::Open {
            let state_changed = self.state_changed_at.load(Ordering::Relaxed);
            let now = Self::now_millis();
            let elapsed = Duration::from_millis(now - state_changed);

            if elapsed >= self.config.reset_timeout {
                self.transition_to(state, CircuitState::HalfOpen);
            }
        }
    }

    /// Transitions to a new state.
    fn transition_to(&self, current: &mut CircuitState, new_state: CircuitState) {
        let old_state = *current;
        *current = new_state;
        self.state_changed_at
            .store(Self::now_millis(), Ordering::Relaxed);

        // Reset counters
        match new_state {
            CircuitState::Closed => {
                self.failure_count.store(0, Ordering::Relaxed);
                self.success_count.store(0, Ordering::Relaxed);
            }
            CircuitState::HalfOpen => {
                self.success_count.store(0, Ordering::Relaxed);
            }
            CircuitState::Open => {
                self.success_count.store(0, Ordering::Relaxed);
            }
        }

        // Notify hook
        if let Some(hook) = &self.hook {
            hook.on_state_change(old_state, new_state);
        }
    }

    /// Returns current time in milliseconds.
    fn now_millis() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_circuit_starts_closed() {
        let cb = CircuitBreaker::new(CircuitBreakerConfig::default());
        assert_eq!(cb.state().await, CircuitState::Closed);
    }

    #[tokio::test]
    async fn test_circuit_opens_after_failures() {
        let cb = CircuitBreaker::new(CircuitBreakerConfig {
            failure_threshold: 3,
            ..Default::default()
        });

        cb.record_failure().await;
        cb.record_failure().await;
        assert_eq!(cb.state().await, CircuitState::Closed);

        cb.record_failure().await;
        assert_eq!(cb.state().await, CircuitState::Open);
    }

    #[tokio::test]
    async fn test_circuit_rejects_when_open() {
        let cb = CircuitBreaker::new(CircuitBreakerConfig {
            failure_threshold: 1,
            ..Default::default()
        });

        cb.record_failure().await;
        assert!(cb.allow_request().await.is_err());
    }

    #[tokio::test]
    async fn test_success_resets_failure_count() {
        let cb = CircuitBreaker::new(CircuitBreakerConfig {
            failure_threshold: 3,
            ..Default::default()
        });

        cb.record_failure().await;
        cb.record_failure().await;
        cb.record_success().await;
        cb.record_failure().await;
        cb.record_failure().await;

        // Should still be closed because success reset the count
        assert_eq!(cb.state().await, CircuitState::Closed);
    }
}
