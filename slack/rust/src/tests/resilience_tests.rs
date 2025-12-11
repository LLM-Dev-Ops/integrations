//! Resilience layer tests.

use crate::resilience::{
    circuit_breaker::{CircuitBreaker, CircuitBreakerConfig, CircuitState},
    rate_limiter::{RateLimiter, RateLimitTier, SlidingWindowLimiter, TokenBucket},
    retry::{RetryConfig, RetryStrategy, calculate_delay, is_retryable_error},
};
use crate::errors::SlackError;
use std::time::Duration;

#[test]
fn test_retry_config_defaults() {
    let config = RetryConfig::default();
    assert_eq!(config.max_retries, 3);
    assert!(config.initial_delay > Duration::ZERO);
}

#[test]
fn test_retry_config_builder() {
    let config = RetryConfig::builder()
        .max_retries(5)
        .initial_delay(Duration::from_millis(500))
        .max_delay(Duration::from_secs(30))
        .build();

    assert_eq!(config.max_retries, 5);
    assert_eq!(config.initial_delay, Duration::from_millis(500));
    assert_eq!(config.max_delay, Duration::from_secs(30));
}

#[test]
fn test_calculate_delay_exponential_backoff() {
    let config = RetryConfig::builder()
        .initial_delay(Duration::from_secs(1))
        .backoff_multiplier(2.0)
        .jitter_factor(0.0)
        .build();

    let delay0 = calculate_delay(0, &config);
    let delay1 = calculate_delay(1, &config);
    let delay2 = calculate_delay(2, &config);

    assert_eq!(delay0, Duration::from_secs(1));
    assert_eq!(delay1, Duration::from_secs(2));
    assert_eq!(delay2, Duration::from_secs(4));
}

#[test]
fn test_calculate_delay_caps_at_max() {
    let config = RetryConfig::builder()
        .initial_delay(Duration::from_secs(1))
        .max_delay(Duration::from_secs(5))
        .backoff_multiplier(2.0)
        .jitter_factor(0.0)
        .build();

    let delay = calculate_delay(10, &config);
    assert_eq!(delay, Duration::from_secs(5));
}

#[test]
fn test_is_retryable_error() {
    let config = RetryConfig::default();

    // Rate limit errors are retryable
    let rate_limit = SlackError::RateLimit {
        retry_after: Some(30),
        message: "Rate limited".to_string(),
    };
    assert!(is_retryable_error(&rate_limit, &config));

    // Network errors are retryable
    let network = SlackError::Network("Connection failed".to_string());
    assert!(is_retryable_error(&network, &config));

    // Server errors are retryable
    let server = SlackError::Server("Internal error".to_string());
    assert!(is_retryable_error(&server, &config));

    // Authentication errors are not retryable
    let auth = SlackError::Authentication("Invalid token".to_string());
    assert!(!is_retryable_error(&auth, &config));
}

#[test]
fn test_circuit_breaker_starts_closed() {
    let cb = CircuitBreaker::new(CircuitBreakerConfig::default());
    assert_eq!(cb.state(), CircuitState::Closed);
}

#[test]
fn test_circuit_breaker_opens_after_failures() {
    let config = CircuitBreakerConfig {
        failure_threshold: 3,
        ..Default::default()
    };
    let cb = CircuitBreaker::new(config);

    cb.record_failure();
    cb.record_failure();
    assert_eq!(cb.state(), CircuitState::Closed);

    cb.record_failure();
    assert_eq!(cb.state(), CircuitState::Open);
}

#[test]
fn test_circuit_breaker_resets_on_success() {
    let config = CircuitBreakerConfig {
        failure_threshold: 3,
        ..Default::default()
    };
    let cb = CircuitBreaker::new(config);

    cb.record_failure();
    cb.record_failure();
    cb.record_success();

    // Failure count should be reset
    cb.record_failure();
    cb.record_failure();
    assert_eq!(cb.state(), CircuitState::Closed);
}

#[test]
fn test_circuit_breaker_is_allowed() {
    let config = CircuitBreakerConfig {
        failure_threshold: 2,
        ..Default::default()
    };
    let cb = CircuitBreaker::new(config);

    assert!(cb.is_allowed());

    cb.record_failure();
    cb.record_failure();

    assert!(!cb.is_allowed());
}

#[test]
fn test_circuit_breaker_metrics() {
    let cb = CircuitBreaker::new(CircuitBreakerConfig::default());

    cb.record_success();
    cb.record_success();
    cb.record_failure();

    let metrics = cb.metrics();
    assert_eq!(metrics.success_count, 2);
    assert_eq!(metrics.failure_count, 1);
    assert_eq!(metrics.total_count, 3);
}

#[test]
fn test_token_bucket_basic() {
    let bucket = TokenBucket::new(10, 1.0);

    assert!(bucket.try_consume(1));
    assert_eq!(bucket.available_tokens(), 9);
}

#[test]
fn test_token_bucket_exhaustion() {
    let bucket = TokenBucket::new(2, 0.001);

    assert!(bucket.try_consume(1));
    assert!(bucket.try_consume(1));
    assert!(!bucket.try_consume(1));
}

#[test]
fn test_sliding_window_limiter() {
    let limiter = SlidingWindowLimiter::new(5, Duration::from_secs(60));

    assert!(limiter.try_acquire());
    assert!(limiter.try_acquire());
    assert_eq!(limiter.remaining_requests(), 3);
}

#[test]
fn test_sliding_window_exhaustion() {
    let limiter = SlidingWindowLimiter::new(2, Duration::from_secs(60));

    assert!(limiter.try_acquire());
    assert!(limiter.try_acquire());
    assert!(!limiter.try_acquire());
}

#[test]
fn test_rate_limiter_tiers() {
    let limiter = RateLimiter::new(RateLimitTier::Tier1);

    // Tier 1 allows 1 request per minute
    assert!(limiter.is_allowed("test.endpoint"));
    assert!(!limiter.is_allowed("test.endpoint"));

    // Different endpoints are tracked separately
    assert!(limiter.is_allowed("other.endpoint"));
}

#[test]
fn test_rate_limiter_reset() {
    let limiter = RateLimiter::new(RateLimitTier::Tier1);

    limiter.is_allowed("test");
    limiter.reset(Some("test"));

    assert!(limiter.is_allowed("test"));
}

#[test]
fn test_rate_limit_tier_values() {
    assert_eq!(RateLimitTier::Tier1.requests_per_minute(), 1);
    assert_eq!(RateLimitTier::Tier2.requests_per_minute(), 20);
    assert_eq!(RateLimitTier::Tier3.requests_per_minute(), 50);
    assert_eq!(RateLimitTier::Tier4.requests_per_minute(), 100);
}
