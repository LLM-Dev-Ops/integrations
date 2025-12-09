use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Configuration for circuit breaker behavior
#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    pub failure_threshold: u32,
    pub success_threshold: u32,
    pub failure_window: Duration,
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

/// Circuit breaker state
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CircuitState {
    /// Circuit is closed, requests flow normally
    Closed,
    /// Circuit is open, requests are blocked
    Open,
    /// Circuit is half-open, testing if service recovered
    HalfOpen,
}

/// Circuit breaker implementation
pub struct CircuitBreaker {
    config: CircuitBreakerConfig,
    state: Mutex<CircuitState>,
    failure_count: AtomicU32,
    success_count: AtomicU32,
    last_failure_time: AtomicU64,
    state_changed_at: AtomicU64,
    hook: Option<std::sync::Arc<dyn CircuitBreakerHook>>,
}

impl CircuitBreaker {
    /// Create a new circuit breaker with the given configuration
    pub fn new(config: CircuitBreakerConfig) -> Self {
        Self {
            config,
            state: Mutex::new(CircuitState::Closed),
            failure_count: AtomicU32::new(0),
            success_count: AtomicU32::new(0),
            last_failure_time: AtomicU64::new(0),
            state_changed_at: AtomicU64::new(now_millis()),
            hook: None,
        }
    }

    /// Add a hook for circuit breaker state changes
    pub fn with_hook(mut self, hook: std::sync::Arc<dyn CircuitBreakerHook>) -> Self {
        self.hook = Some(hook);
        self
    }

    /// Check if the circuit breaker is open (blocking requests)
    pub fn is_open(&self) -> bool {
        let state = *self.state.lock().unwrap();
        match state {
            CircuitState::Closed => false,
            CircuitState::Open => {
                let elapsed = self.time_since_state_change();
                if elapsed >= self.config.reset_timeout {
                    self.transition_to(CircuitState::HalfOpen);
                    false
                } else {
                    true
                }
            }
            CircuitState::HalfOpen => false,
        }
    }

    /// Get the time until the circuit transitions to half-open
    pub fn time_until_half_open(&self) -> Option<Duration> {
        let state = *self.state.lock().unwrap();
        if state != CircuitState::Open {
            return None;
        }

        let elapsed = self.time_since_state_change();
        if elapsed >= self.config.reset_timeout {
            Some(Duration::ZERO)
        } else {
            Some(self.config.reset_timeout - elapsed)
        }
    }

    /// Get the current state of the circuit breaker
    pub fn state(&self) -> CircuitState {
        *self.state.lock().unwrap()
    }

    /// Record a successful request
    pub fn record_success(&self) {
        let mut state = self.state.lock().unwrap();
        match *state {
            CircuitState::HalfOpen => {
                let successes = self.success_count.fetch_add(1, Ordering::SeqCst) + 1;
                if successes >= self.config.success_threshold {
                    drop(state);
                    self.transition_to(CircuitState::Closed);
                }
            }
            CircuitState::Closed => {
                // Reset failure window if expired
                if self.time_since_last_failure() > self.config.failure_window {
                    self.failure_count.store(0, Ordering::SeqCst);
                }
            }
            _ => {}
        }
    }

    /// Record a failed request
    pub fn record_failure(&self) {
        let mut state = self.state.lock().unwrap();
        self.last_failure_time
            .store(now_millis(), Ordering::SeqCst);

        match *state {
            CircuitState::Closed => {
                let failures = self.failure_count.fetch_add(1, Ordering::SeqCst) + 1;
                if failures >= self.config.failure_threshold {
                    drop(state);
                    self.transition_to(CircuitState::Open);
                }
            }
            CircuitState::HalfOpen => {
                drop(state);
                self.transition_to(CircuitState::Open);
            }
            _ => {}
        }
    }

    fn transition_to(&self, new_state: CircuitState) {
        let mut state = self.state.lock().unwrap();
        let old_state = *state;
        *state = new_state;
        self.state_changed_at
            .store(now_millis(), Ordering::SeqCst);
        self.success_count.store(0, Ordering::SeqCst);

        if old_state == CircuitState::Closed && new_state == CircuitState::Open {
            // Reset failure count when opening
            self.failure_count.store(0, Ordering::SeqCst);
        } else if new_state == CircuitState::Closed {
            // Reset both counts when closing
            self.failure_count.store(0, Ordering::SeqCst);
        }

        drop(state);
        self.notify_state_change(old_state, new_state);
    }

    fn notify_state_change(&self, old: CircuitState, new: CircuitState) {
        if let Some(hook) = &self.hook {
            hook.on_state_change(old, new);
        }
    }

    fn time_since_state_change(&self) -> Duration {
        let now = now_millis();
        let changed = self.state_changed_at.load(Ordering::SeqCst);
        Duration::from_millis(now.saturating_sub(changed))
    }

    fn time_since_last_failure(&self) -> Duration {
        let now = now_millis();
        let last_failure = self.last_failure_time.load(Ordering::SeqCst);
        if last_failure == 0 {
            Duration::from_secs(u64::MAX)
        } else {
            Duration::from_millis(now.saturating_sub(last_failure))
        }
    }
}

/// Hook for circuit breaker state changes
pub trait CircuitBreakerHook: Send + Sync {
    fn on_state_change(&self, old_state: CircuitState, new_state: CircuitState);
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;

    #[test]
    fn test_circuit_breaker_starts_closed() {
        let cb = CircuitBreaker::new(CircuitBreakerConfig::default());
        assert_eq!(cb.state(), CircuitState::Closed);
        assert!(!cb.is_open());
    }

    #[test]
    fn test_circuit_breaker_opens_after_threshold() {
        let config = CircuitBreakerConfig {
            failure_threshold: 3,
            ..Default::default()
        };
        let cb = CircuitBreaker::new(config);

        assert_eq!(cb.state(), CircuitState::Closed);
        assert!(!cb.is_open());

        cb.record_failure();
        cb.record_failure();
        assert_eq!(cb.state(), CircuitState::Closed);

        cb.record_failure();
        assert_eq!(cb.state(), CircuitState::Open);
        assert!(cb.is_open());
    }

    #[test]
    fn test_circuit_breaker_resets_on_success() {
        let config = CircuitBreakerConfig {
            failure_threshold: 3,
            success_threshold: 2,
            ..Default::default()
        };
        let cb = CircuitBreaker::new(config);

        cb.record_failure();
        cb.record_failure();
        cb.record_success();

        assert_eq!(cb.state(), CircuitState::Closed);
    }

    #[test]
    fn test_circuit_breaker_half_open_to_closed() {
        let config = CircuitBreakerConfig {
            failure_threshold: 2,
            success_threshold: 2,
            reset_timeout: Duration::from_millis(10),
            ..Default::default()
        };
        let cb = CircuitBreaker::new(config);

        // Open the circuit
        cb.record_failure();
        cb.record_failure();
        assert_eq!(cb.state(), CircuitState::Open);

        // Wait for reset timeout
        std::thread::sleep(Duration::from_millis(20));

        // Should transition to half-open on next check
        assert!(!cb.is_open());
        assert_eq!(cb.state(), CircuitState::HalfOpen);

        // Successful requests should close it
        cb.record_success();
        cb.record_success();
        assert_eq!(cb.state(), CircuitState::Closed);
    }

    #[test]
    fn test_circuit_breaker_half_open_to_open() {
        let config = CircuitBreakerConfig {
            failure_threshold: 2,
            success_threshold: 2,
            reset_timeout: Duration::from_millis(10),
            ..Default::default()
        };
        let cb = CircuitBreaker::new(config);

        // Open the circuit
        cb.record_failure();
        cb.record_failure();
        assert_eq!(cb.state(), CircuitState::Open);

        // Wait for reset timeout
        std::thread::sleep(Duration::from_millis(20));

        // Should transition to half-open
        assert!(!cb.is_open());
        assert_eq!(cb.state(), CircuitState::HalfOpen);

        // Failure should reopen it
        cb.record_failure();
        assert_eq!(cb.state(), CircuitState::Open);
    }

    #[test]
    fn test_time_until_half_open() {
        let config = CircuitBreakerConfig {
            failure_threshold: 2,
            reset_timeout: Duration::from_millis(100),
            ..Default::default()
        };
        let cb = CircuitBreaker::new(config);

        // Circuit is closed, should return None
        assert_eq!(cb.time_until_half_open(), None);

        // Open the circuit
        cb.record_failure();
        cb.record_failure();
        assert_eq!(cb.state(), CircuitState::Open);

        // Should have time remaining
        let time_remaining = cb.time_until_half_open();
        assert!(time_remaining.is_some());
        assert!(time_remaining.unwrap() <= Duration::from_millis(100));
    }

    struct TestHook {
        opened: Arc<AtomicBool>,
        closed: Arc<AtomicBool>,
    }

    impl CircuitBreakerHook for TestHook {
        fn on_state_change(&self, old_state: CircuitState, new_state: CircuitState) {
            if old_state == CircuitState::Closed && new_state == CircuitState::Open {
                self.opened.store(true, Ordering::SeqCst);
            }
            if new_state == CircuitState::Closed {
                self.closed.store(true, Ordering::SeqCst);
            }
        }
    }

    #[test]
    fn test_circuit_breaker_hook() {
        let opened = Arc::new(AtomicBool::new(false));
        let closed = Arc::new(AtomicBool::new(false));
        let hook = Arc::new(TestHook {
            opened: opened.clone(),
            closed: closed.clone(),
        });

        let config = CircuitBreakerConfig {
            failure_threshold: 2,
            success_threshold: 2,
            reset_timeout: Duration::from_millis(10),
            ..Default::default()
        };
        let cb = CircuitBreaker::new(config).with_hook(hook);

        // Open the circuit
        cb.record_failure();
        cb.record_failure();
        assert!(opened.load(Ordering::SeqCst));

        // Wait and transition to half-open
        std::thread::sleep(Duration::from_millis(20));
        cb.is_open();

        // Close the circuit
        cb.record_success();
        cb.record_success();
        assert!(closed.load(Ordering::SeqCst));
    }
}
