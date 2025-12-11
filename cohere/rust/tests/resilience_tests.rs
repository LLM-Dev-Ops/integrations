//! Tests for resilience patterns.

use cohere_client::resilience::{
    CircuitBreaker, CircuitBreakerConfig, CircuitState,
    RateLimiter, RateLimitConfig,
    RetryConfig, RetryExecutor,
};
use cohere_client::errors::CohereError;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

#[tokio::test]
async fn test_retry_succeeds_on_first_attempt() {
    let config = RetryConfig::default();
    let executor = RetryExecutor::new(config);

    let call_count = Arc::new(AtomicUsize::new(0));
    let count = call_count.clone();

    let result = executor
        .execute(|| async move {
            count.fetch_add(1, Ordering::SeqCst);
            Ok::<_, CohereError>("success".to_string())
        })
        .await;

    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "success");
    assert_eq!(call_count.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn test_retry_retries_on_server_error() {
    let config = RetryConfig {
        max_attempts: 3,
        initial_delay: Duration::from_millis(10),
        max_delay: Duration::from_millis(100),
        ..Default::default()
    };
    let executor = RetryExecutor::new(config);

    let call_count = Arc::new(AtomicUsize::new(0));
    let count = call_count.clone();

    let result = executor
        .execute(|| {
            let c = count.clone();
            async move {
                let n = c.fetch_add(1, Ordering::SeqCst);
                if n < 2 {
                    Err(CohereError::Server {
                        message: "Server error".to_string(),
                        status_code: Some(500),
                    })
                } else {
                    Ok("success".to_string())
                }
            }
        })
        .await;

    assert!(result.is_ok());
    assert_eq!(call_count.load(Ordering::SeqCst), 3);
}

#[tokio::test]
async fn test_retry_does_not_retry_validation_error() {
    let config = RetryConfig {
        max_attempts: 3,
        ..Default::default()
    };
    let executor = RetryExecutor::new(config);

    let call_count = Arc::new(AtomicUsize::new(0));
    let count = call_count.clone();

    let result: Result<String, CohereError> = executor
        .execute(|| {
            let c = count.clone();
            async move {
                c.fetch_add(1, Ordering::SeqCst);
                Err(CohereError::Validation {
                    message: "Invalid request".to_string(),
                    details: vec![],
                })
            }
        })
        .await;

    assert!(result.is_err());
    assert_eq!(call_count.load(Ordering::SeqCst), 1); // No retries
}

#[tokio::test]
async fn test_retry_exhausts_attempts() {
    let config = RetryConfig {
        max_attempts: 3,
        initial_delay: Duration::from_millis(10),
        max_delay: Duration::from_millis(100),
        ..Default::default()
    };
    let executor = RetryExecutor::new(config);

    let call_count = Arc::new(AtomicUsize::new(0));
    let count = call_count.clone();

    let result: Result<String, CohereError> = executor
        .execute(|| {
            let c = count.clone();
            async move {
                c.fetch_add(1, Ordering::SeqCst);
                Err(CohereError::Server {
                    message: "Server error".to_string(),
                    status_code: Some(500),
                })
            }
        })
        .await;

    assert!(result.is_err());
    assert_eq!(call_count.load(Ordering::SeqCst), 3);
}

#[test]
fn test_circuit_breaker_starts_closed() {
    let breaker = CircuitBreaker::new(CircuitBreakerConfig::default());
    assert_eq!(breaker.state(), CircuitState::Closed);
}

#[test]
fn test_circuit_breaker_allows_requests_when_closed() {
    let breaker = CircuitBreaker::new(CircuitBreakerConfig::default());
    assert!(breaker.can_execute());
}

#[test]
fn test_circuit_breaker_opens_after_failures() {
    let config = CircuitBreakerConfig {
        failure_threshold: 3,
        ..Default::default()
    };
    let breaker = CircuitBreaker::new(config);

    breaker.record_failure();
    breaker.record_failure();
    assert_eq!(breaker.state(), CircuitState::Closed);

    breaker.record_failure();
    assert_eq!(breaker.state(), CircuitState::Open);
}

#[test]
fn test_circuit_breaker_blocks_when_open() {
    let config = CircuitBreakerConfig {
        failure_threshold: 1,
        ..Default::default()
    };
    let breaker = CircuitBreaker::new(config);

    breaker.record_failure();
    assert!(!breaker.can_execute());
}

#[tokio::test]
async fn test_circuit_breaker_transitions_to_half_open() {
    let config = CircuitBreakerConfig {
        failure_threshold: 1,
        reset_timeout: Duration::from_millis(10),
        ..Default::default()
    };
    let breaker = CircuitBreaker::new(config);

    breaker.record_failure();
    assert_eq!(breaker.state(), CircuitState::Open);

    tokio::time::sleep(Duration::from_millis(20)).await;
    // Force state check
    let _ = breaker.can_execute();
    assert_eq!(breaker.state(), CircuitState::HalfOpen);
}

#[tokio::test]
async fn test_circuit_breaker_closes_after_successes() {
    let config = CircuitBreakerConfig {
        failure_threshold: 1,
        success_threshold: 2,
        reset_timeout: Duration::from_millis(10),
        ..Default::default()
    };
    let breaker = CircuitBreaker::new(config);

    breaker.record_failure();
    tokio::time::sleep(Duration::from_millis(20)).await;
    let _ = breaker.can_execute();

    assert_eq!(breaker.state(), CircuitState::HalfOpen);

    breaker.record_success();
    assert_eq!(breaker.state(), CircuitState::HalfOpen);

    breaker.record_success();
    assert_eq!(breaker.state(), CircuitState::Closed);
}

#[test]
fn test_rate_limiter_allows_under_limit() {
    let config = RateLimitConfig {
        max_requests: 10,
        window: Duration::from_secs(1),
        ..Default::default()
    };
    let limiter = RateLimiter::new(config);

    for _ in 0..10 {
        assert!(limiter.can_proceed());
        limiter.acquire_sync();
    }
}

#[test]
fn test_rate_limiter_blocks_over_limit() {
    let config = RateLimitConfig {
        max_requests: 2,
        window: Duration::from_secs(10),
        ..Default::default()
    };
    let limiter = RateLimiter::new(config);

    limiter.acquire_sync();
    limiter.acquire_sync();

    assert!(!limiter.can_proceed());
}

#[tokio::test]
async fn test_rate_limiter_refills_over_time() {
    let config = RateLimitConfig {
        max_requests: 5,
        window: Duration::from_millis(100),
        ..Default::default()
    };
    let limiter = RateLimiter::new(config);

    // Drain tokens
    for _ in 0..5 {
        limiter.acquire_sync();
    }
    assert!(!limiter.can_proceed());

    // Wait for refill
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert!(limiter.can_proceed());
}

#[test]
fn test_rate_limiter_returns_tokens_available() {
    let config = RateLimitConfig {
        max_requests: 10,
        window: Duration::from_secs(1),
        ..Default::default()
    };
    let limiter = RateLimiter::new(config);

    assert_eq!(limiter.tokens(), 10);
    limiter.acquire_sync();
    assert_eq!(limiter.tokens(), 9);
}
