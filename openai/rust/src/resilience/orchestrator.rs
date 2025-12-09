use crate::errors::{OpenAIError, OpenAIResult};
use async_trait::async_trait;
use std::future::Future;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tokio::time::sleep;

#[async_trait]
pub trait ResilienceOrchestrator: Send + Sync {
    async fn execute<F, Fut, T>(&self, operation: F) -> OpenAIResult<T>
    where
        F: Fn() -> Fut + Send + Sync,
        Fut: Future<Output = OpenAIResult<T>> + Send,
        T: Send;
}

#[derive(Debug, Clone)]
pub struct ResilienceConfig {
    pub max_retries: u32,
    pub initial_delay: Duration,
    pub max_delay: Duration,
    pub multiplier: f64,
    pub jitter: bool,
    pub circuit_breaker_enabled: bool,
    pub circuit_breaker_threshold: u32,
    pub circuit_breaker_timeout: Duration,
}

impl Default for ResilienceConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_delay: Duration::from_millis(1000),
            max_delay: Duration::from_secs(60),
            multiplier: 2.0,
            jitter: true,
            circuit_breaker_enabled: true,
            circuit_breaker_threshold: 5,
            circuit_breaker_timeout: Duration::from_secs(30),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    Closed,
    Open,
    HalfOpen,
}

pub struct CircuitBreaker {
    state: RwLock<CircuitState>,
    failure_count: AtomicU32,
    last_failure_time: AtomicU64,
    threshold: u32,
    timeout: Duration,
}

impl CircuitBreaker {
    pub fn new(threshold: u32, timeout: Duration) -> Self {
        Self {
            state: RwLock::new(CircuitState::Closed),
            failure_count: AtomicU32::new(0),
            last_failure_time: AtomicU64::new(0),
            threshold,
            timeout,
        }
    }

    pub async fn can_execute(&self) -> bool {
        let state = *self.state.read().await;
        match state {
            CircuitState::Closed => true,
            CircuitState::Open => {
                let last_failure = self.last_failure_time.load(Ordering::SeqCst);
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as u64;
                if now - last_failure > self.timeout.as_millis() as u64 {
                    let mut state = self.state.write().await;
                    *state = CircuitState::HalfOpen;
                    true
                } else {
                    false
                }
            }
            CircuitState::HalfOpen => true,
        }
    }

    pub async fn record_success(&self) {
        self.failure_count.store(0, Ordering::SeqCst);
        let mut state = self.state.write().await;
        *state = CircuitState::Closed;
    }

    pub async fn record_failure(&self) {
        let count = self.failure_count.fetch_add(1, Ordering::SeqCst) + 1;
        self.last_failure_time.store(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
            Ordering::SeqCst,
        );

        if count >= self.threshold {
            let mut state = self.state.write().await;
            *state = CircuitState::Open;
        }
    }

    pub async fn state(&self) -> CircuitState {
        *self.state.read().await
    }
}

pub struct DefaultResilienceOrchestrator {
    config: ResilienceConfig,
    circuit_breaker: Option<Arc<CircuitBreaker>>,
}

impl DefaultResilienceOrchestrator {
    pub fn new(config: ResilienceConfig) -> Self {
        let circuit_breaker = if config.circuit_breaker_enabled {
            Some(Arc::new(CircuitBreaker::new(
                config.circuit_breaker_threshold,
                config.circuit_breaker_timeout,
            )))
        } else {
            None
        };

        Self { config, circuit_breaker }
    }

    pub fn passthrough() -> Self {
        Self::new(ResilienceConfig {
            max_retries: 0,
            circuit_breaker_enabled: false,
            ..Default::default()
        })
    }

    fn calculate_delay(&self, attempt: u32) -> Duration {
        let base_delay = self.config.initial_delay.as_millis() as f64
            * self.config.multiplier.powi(attempt as i32);

        let delay_ms = base_delay.min(self.config.max_delay.as_millis() as f64);

        let final_delay = if self.config.jitter {
            let jitter = rand_jitter(delay_ms);
            delay_ms + jitter
        } else {
            delay_ms
        };

        Duration::from_millis(final_delay as u64)
    }
}

fn rand_jitter(base: f64) -> f64 {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};

    let mut hasher = RandomState::new().build_hasher();
    hasher.write_u64(std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos() as u64);
    let random = hasher.finish() as f64 / u64::MAX as f64;

    base * 0.5 * (random - 0.5)
}

#[async_trait]
impl ResilienceOrchestrator for DefaultResilienceOrchestrator {
    async fn execute<F, Fut, T>(&self, operation: F) -> OpenAIResult<T>
    where
        F: Fn() -> Fut + Send + Sync,
        Fut: Future<Output = OpenAIResult<T>> + Send,
        T: Send,
    {
        // Check circuit breaker
        if let Some(ref cb) = self.circuit_breaker {
            if !cb.can_execute().await {
                return Err(OpenAIError::Server(
                    crate::errors::categories::ServerError::ServiceUnavailable(
                        "Circuit breaker is open".to_string()
                    )
                ));
            }
        }

        let mut last_error = None;

        for attempt in 0..=self.config.max_retries {
            match operation().await {
                Ok(result) => {
                    if let Some(ref cb) = self.circuit_breaker {
                        cb.record_success().await;
                    }
                    return Ok(result);
                }
                Err(e) => {
                    if let Some(ref cb) = self.circuit_breaker {
                        cb.record_failure().await;
                    }

                    if !e.is_retryable() || attempt >= self.config.max_retries {
                        return Err(e);
                    }

                    let delay = if let OpenAIError::RateLimit(ref rate_err) = e {
                        rate_err.retry_after()
                            .map(Duration::from_secs)
                            .unwrap_or_else(|| self.calculate_delay(attempt))
                    } else {
                        self.calculate_delay(attempt)
                    };

                    sleep(delay).await;
                    last_error = Some(e);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| {
            OpenAIError::Unknown("Retry loop exited unexpectedly".to_string())
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::categories::{RateLimitError, ServerError};

    #[tokio::test]
    async fn test_circuit_breaker_opens_after_threshold() {
        let cb = CircuitBreaker::new(3, Duration::from_secs(1));

        assert_eq!(cb.state().await, CircuitState::Closed);
        assert!(cb.can_execute().await);

        cb.record_failure().await;
        cb.record_failure().await;
        cb.record_failure().await;

        assert_eq!(cb.state().await, CircuitState::Open);
        assert!(!cb.can_execute().await);
    }

    #[tokio::test]
    async fn test_circuit_breaker_resets_on_success() {
        let cb = CircuitBreaker::new(3, Duration::from_secs(1));

        cb.record_failure().await;
        cb.record_failure().await;
        cb.record_success().await;

        assert_eq!(cb.state().await, CircuitState::Closed);
    }

    #[tokio::test]
    async fn test_resilience_orchestrator_retries() {
        let config = ResilienceConfig {
            max_retries: 2,
            initial_delay: Duration::from_millis(10),
            max_delay: Duration::from_secs(1),
            multiplier: 2.0,
            jitter: false,
            circuit_breaker_enabled: false,
            circuit_breaker_threshold: 5,
            circuit_breaker_timeout: Duration::from_secs(30),
        };

        let orchestrator = DefaultResilienceOrchestrator::new(config);

        let mut attempt_count = 0;
        let result = orchestrator.execute(|| {
            let count = attempt_count;
            attempt_count += 1;
            async move {
                if count < 2 {
                    Err(OpenAIError::Server(ServerError::ServiceUnavailable(
                        "Service temporarily unavailable".to_string()
                    )))
                } else {
                    Ok(42)
                }
            }
        }).await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn test_resilience_orchestrator_respects_non_retryable() {
        let config = ResilienceConfig {
            max_retries: 3,
            initial_delay: Duration::from_millis(10),
            max_delay: Duration::from_secs(1),
            multiplier: 2.0,
            jitter: false,
            circuit_breaker_enabled: false,
            circuit_breaker_threshold: 5,
            circuit_breaker_timeout: Duration::from_secs(30),
        };

        let orchestrator = DefaultResilienceOrchestrator::new(config);

        let result = orchestrator.execute(|| async {
            Err(OpenAIError::Authentication(
                crate::errors::categories::AuthenticationError::InvalidApiKey(
                    "Invalid key".to_string()
                )
            ))
        }).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().is_authentication_error());
    }

    #[test]
    fn test_calculate_delay() {
        let config = ResilienceConfig {
            max_retries: 5,
            initial_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(10),
            multiplier: 2.0,
            jitter: false,
            circuit_breaker_enabled: false,
            circuit_breaker_threshold: 5,
            circuit_breaker_timeout: Duration::from_secs(30),
        };

        let orchestrator = DefaultResilienceOrchestrator::new(config);

        assert_eq!(orchestrator.calculate_delay(0), Duration::from_millis(100));
        assert_eq!(orchestrator.calculate_delay(1), Duration::from_millis(200));
        assert_eq!(orchestrator.calculate_delay(2), Duration::from_millis(400));
    }
}
