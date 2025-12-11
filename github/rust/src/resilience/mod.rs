//! Resilience patterns for GitHub API client.

use crate::errors::{GitHubError, GitHubErrorKind, GitHubResult, RateLimitInfo};
use chrono::{DateTime, Utc};
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio::time::sleep;

/// Retry executor with exponential backoff.
pub struct RetryExecutor {
    max_attempts: u32,
    initial_backoff: Duration,
    max_backoff: Duration,
    multiplier: f64,
    jitter: f64,
}

impl RetryExecutor {
    /// Creates a new retry executor.
    pub fn new(
        max_attempts: u32,
        initial_backoff: Duration,
        max_backoff: Duration,
        multiplier: f64,
        jitter: f64,
    ) -> Self {
        Self {
            max_attempts,
            initial_backoff,
            max_backoff,
            multiplier,
            jitter,
        }
    }

    /// Executes an operation with retry logic.
    pub async fn execute<F, Fut, T>(&self, mut operation: F) -> GitHubResult<T>
    where
        F: FnMut() -> Fut,
        Fut: std::future::Future<Output = GitHubResult<T>>,
    {
        let mut attempt = 0;
        let mut last_error: Option<GitHubError> = None;

        while attempt < self.max_attempts {
            match operation().await {
                Ok(result) => return Ok(result),
                Err(e) => {
                    attempt += 1;

                    if !e.is_retryable() || attempt >= self.max_attempts {
                        return Err(e);
                    }

                    // Calculate backoff
                    let delay = if let Some(retry_after) = e.retry_after() {
                        Duration::from_secs(retry_after)
                    } else {
                        self.calculate_backoff(attempt)
                    };

                    tracing::debug!(
                        attempt = attempt,
                        delay_ms = delay.as_millis(),
                        error = %e,
                        "Retrying after error"
                    );

                    sleep(delay).await;
                    last_error = Some(e);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| {
            GitHubError::new(GitHubErrorKind::Unknown, "Retry exhausted without error")
        }))
    }

    /// Calculates backoff duration for an attempt.
    fn calculate_backoff(&self, attempt: u32) -> Duration {
        let base = self.initial_backoff.as_millis() as f64
            * self.multiplier.powi(attempt.saturating_sub(1) as i32);
        let capped = base.min(self.max_backoff.as_millis() as f64);

        // Add jitter
        let jitter_range = capped * self.jitter;
        let jitter_value = rand_jitter() * jitter_range * 2.0 - jitter_range;
        let final_delay = (capped + jitter_value).max(0.0);

        Duration::from_millis(final_delay as u64)
    }
}

/// Simple random jitter (0.0 to 1.0).
fn rand_jitter() -> f64 {
    use std::time::SystemTime;
    let nanos = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .subsec_nanos();
    (nanos as f64) / (u32::MAX as f64)
}

/// Circuit breaker states.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    /// Circuit is closed (normal operation).
    Closed,
    /// Circuit is open (failing fast).
    Open,
    /// Circuit is half-open (testing recovery).
    HalfOpen,
}

/// Circuit breaker for preventing cascading failures.
pub struct CircuitBreaker {
    state: Arc<RwLock<CircuitState>>,
    failure_count: AtomicU32,
    success_count: AtomicU32,
    failure_threshold: u32,
    success_threshold: u32,
    reset_timeout: Duration,
    last_failure_time: Arc<RwLock<Option<DateTime<Utc>>>>,
}

impl CircuitBreaker {
    /// Creates a new circuit breaker.
    pub fn new(failure_threshold: u32, success_threshold: u32, reset_timeout: Duration) -> Self {
        Self {
            state: Arc::new(RwLock::new(CircuitState::Closed)),
            failure_count: AtomicU32::new(0),
            success_count: AtomicU32::new(0),
            failure_threshold,
            success_threshold,
            reset_timeout,
            last_failure_time: Arc::new(RwLock::new(None)),
        }
    }

    /// Gets the current circuit state.
    pub async fn state(&self) -> CircuitState {
        self.check_reset().await;
        *self.state.read().await
    }

    /// Checks if the circuit allows requests.
    pub async fn allow_request(&self) -> bool {
        let state = self.state().await;
        matches!(state, CircuitState::Closed | CircuitState::HalfOpen)
    }

    /// Records a successful request.
    pub async fn record_success(&self) {
        let mut state = self.state.write().await;

        match *state {
            CircuitState::HalfOpen => {
                let count = self.success_count.fetch_add(1, Ordering::SeqCst) + 1;
                if count >= self.success_threshold {
                    *state = CircuitState::Closed;
                    self.failure_count.store(0, Ordering::SeqCst);
                    self.success_count.store(0, Ordering::SeqCst);
                    tracing::info!("Circuit breaker closed after recovery");
                }
            }
            CircuitState::Closed => {
                self.failure_count.store(0, Ordering::SeqCst);
            }
            _ => {}
        }
    }

    /// Records a failed request.
    pub async fn record_failure(&self) {
        let mut state = self.state.write().await;
        let mut last_failure = self.last_failure_time.write().await;
        *last_failure = Some(Utc::now());

        match *state {
            CircuitState::Closed => {
                let count = self.failure_count.fetch_add(1, Ordering::SeqCst) + 1;
                if count >= self.failure_threshold {
                    *state = CircuitState::Open;
                    tracing::warn!(
                        failures = count,
                        "Circuit breaker opened after threshold reached"
                    );
                }
            }
            CircuitState::HalfOpen => {
                *state = CircuitState::Open;
                self.success_count.store(0, Ordering::SeqCst);
                tracing::warn!("Circuit breaker re-opened after failure in half-open state");
            }
            _ => {}
        }
    }

    /// Checks if the circuit should reset from open to half-open.
    async fn check_reset(&self) {
        let mut state = self.state.write().await;

        if *state == CircuitState::Open {
            let last_failure = self.last_failure_time.read().await;
            if let Some(time) = *last_failure {
                let elapsed = Utc::now().signed_duration_since(time);
                if elapsed.to_std().unwrap_or(Duration::ZERO) >= self.reset_timeout {
                    *state = CircuitState::HalfOpen;
                    self.success_count.store(0, Ordering::SeqCst);
                    tracing::info!("Circuit breaker transitioning to half-open");
                }
            }
        }
    }

    /// Resets the circuit breaker to closed state.
    pub async fn reset(&self) {
        let mut state = self.state.write().await;
        *state = CircuitState::Closed;
        self.failure_count.store(0, Ordering::SeqCst);
        self.success_count.store(0, Ordering::SeqCst);
    }
}

/// Rate limit tracker for GitHub API.
pub struct RateLimitTracker {
    /// Maximum requests allowed.
    limit: AtomicU32,
    /// Remaining requests.
    remaining: AtomicU32,
    /// Reset time (Unix timestamp).
    reset_at: AtomicU64,
    /// Resource category.
    resource: Arc<RwLock<String>>,
    /// Buffer percentage (0.0 to 1.0).
    buffer_percentage: f64,
}

impl RateLimitTracker {
    /// Creates a new rate limit tracker.
    pub fn new(buffer_percentage: f64) -> Self {
        Self {
            limit: AtomicU32::new(5000),
            remaining: AtomicU32::new(5000),
            reset_at: AtomicU64::new(0),
            resource: Arc::new(RwLock::new("core".to_string())),
            buffer_percentage,
        }
    }

    /// Updates rate limit info from response headers.
    pub async fn update(&self, info: &RateLimitInfo) {
        self.limit.store(info.limit, Ordering::SeqCst);
        self.remaining.store(info.remaining, Ordering::SeqCst);
        self.reset_at
            .store(info.reset_at.timestamp() as u64, Ordering::SeqCst);

        if let Some(ref resource) = info.resource {
            let mut r = self.resource.write().await;
            *r = resource.clone();
        }
    }

    /// Gets the remaining requests.
    pub fn remaining(&self) -> u32 {
        self.remaining.load(Ordering::SeqCst)
    }

    /// Gets the rate limit.
    pub fn limit(&self) -> u32 {
        self.limit.load(Ordering::SeqCst)
    }

    /// Gets the reset time.
    pub fn reset_at(&self) -> DateTime<Utc> {
        let timestamp = self.reset_at.load(Ordering::SeqCst);
        DateTime::from_timestamp(timestamp as i64, 0).unwrap_or_else(Utc::now)
    }

    /// Checks if we should throttle (preemptive rate limiting).
    pub fn should_throttle(&self) -> bool {
        let limit = self.limit.load(Ordering::SeqCst) as f64;
        let remaining = self.remaining.load(Ordering::SeqCst) as f64;
        let threshold = limit * self.buffer_percentage;
        remaining <= threshold
    }

    /// Calculates wait time if rate limited.
    pub fn wait_time(&self) -> Option<Duration> {
        let remaining = self.remaining.load(Ordering::SeqCst);
        if remaining > 0 {
            return None;
        }

        let reset_at = self.reset_at();
        let now = Utc::now();
        if reset_at > now {
            Some((reset_at - now).to_std().unwrap_or(Duration::ZERO))
        } else {
            None
        }
    }

    /// Waits until rate limit resets if necessary.
    pub async fn wait_if_needed(&self) {
        if let Some(wait_time) = self.wait_time() {
            tracing::warn!(
                wait_secs = wait_time.as_secs(),
                "Rate limit exceeded, waiting for reset"
            );
            sleep(wait_time).await;
        }
    }
}

/// Resilience orchestrator combining retry, circuit breaker, and rate limiting.
pub struct ResilienceOrchestrator {
    retry: RetryExecutor,
    circuit_breaker: CircuitBreaker,
    rate_limit_tracker: RateLimitTracker,
}

impl ResilienceOrchestrator {
    /// Creates a new resilience orchestrator.
    pub fn new(
        retry: RetryExecutor,
        circuit_breaker: CircuitBreaker,
        rate_limit_tracker: RateLimitTracker,
    ) -> Self {
        Self {
            retry,
            circuit_breaker,
            rate_limit_tracker,
        }
    }

    /// Gets the rate limit tracker.
    pub fn rate_limit_tracker(&self) -> &RateLimitTracker {
        &self.rate_limit_tracker
    }

    /// Gets the circuit breaker.
    pub fn circuit_breaker(&self) -> &CircuitBreaker {
        &self.circuit_breaker
    }

    /// Executes an operation with all resilience patterns.
    pub async fn execute<F, Fut, T>(&self, operation: F) -> GitHubResult<T>
    where
        F: FnMut() -> Fut + Clone,
        Fut: std::future::Future<Output = GitHubResult<T>>,
    {
        // Check circuit breaker
        if !self.circuit_breaker.allow_request().await {
            return Err(GitHubError::new(
                GitHubErrorKind::ServiceUnavailable,
                "Circuit breaker is open",
            ));
        }

        // Wait for rate limit if needed
        self.rate_limit_tracker.wait_if_needed().await;

        // Execute with retry
        let result = self.retry.execute(operation).await;

        // Record result in circuit breaker
        match &result {
            Ok(_) => self.circuit_breaker.record_success().await,
            Err(e) if e.is_retryable() => self.circuit_breaker.record_failure().await,
            _ => {}
        }

        result
    }

    /// Updates rate limit info from response.
    pub async fn update_rate_limit(&self, info: &RateLimitInfo) {
        self.rate_limit_tracker.update(info).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_retry_backoff_calculation() {
        let executor = RetryExecutor::new(
            3,
            Duration::from_secs(1),
            Duration::from_secs(60),
            2.0,
            0.0, // No jitter for predictable test
        );

        let backoff1 = executor.calculate_backoff(1);
        let backoff2 = executor.calculate_backoff(2);
        let backoff3 = executor.calculate_backoff(3);

        assert!(backoff1 >= Duration::from_millis(900));
        assert!(backoff1 <= Duration::from_millis(1100));
        assert!(backoff2 >= Duration::from_millis(1800));
        assert!(backoff3 >= Duration::from_millis(3600));
    }

    #[tokio::test]
    async fn test_circuit_breaker_state_transitions() {
        let cb = CircuitBreaker::new(2, 2, Duration::from_millis(100));

        assert_eq!(cb.state().await, CircuitState::Closed);

        // Record failures to open circuit
        cb.record_failure().await;
        cb.record_failure().await;
        assert_eq!(cb.state().await, CircuitState::Open);

        // Wait for reset timeout
        sleep(Duration::from_millis(150)).await;
        assert_eq!(cb.state().await, CircuitState::HalfOpen);

        // Record successes to close circuit
        cb.record_success().await;
        cb.record_success().await;
        assert_eq!(cb.state().await, CircuitState::Closed);
    }

    #[tokio::test]
    async fn test_rate_limit_tracker() {
        let tracker = RateLimitTracker::new(0.1);

        let info = RateLimitInfo {
            limit: 5000,
            remaining: 100,
            reset_at: Utc::now() + chrono::Duration::hours(1),
            retry_after: None,
            resource: Some("core".to_string()),
        };

        tracker.update(&info).await;

        assert_eq!(tracker.limit(), 5000);
        assert_eq!(tracker.remaining(), 100);
        assert!(!tracker.should_throttle()); // 100 > 500 (10% of 5000)
    }

    #[tokio::test]
    async fn test_rate_limit_throttling() {
        let tracker = RateLimitTracker::new(0.1);

        let info = RateLimitInfo {
            limit: 5000,
            remaining: 400, // Below 10% threshold
            reset_at: Utc::now() + chrono::Duration::hours(1),
            retry_after: None,
            resource: Some("core".to_string()),
        };

        tracker.update(&info).await;
        assert!(tracker.should_throttle());
    }
}
