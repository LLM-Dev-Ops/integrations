//! Resilience
//!
//! Resilience patterns for robust OAuth2 operations.
//!
//! This module provides:
//!
//! - **Retry**: Exponential backoff retry with jitter
//! - **Circuit Breaker**: Protection against cascading failures
//! - **Rate Limiter**: Token bucket rate limiting

pub mod circuit_breaker;
pub mod rate_limiter;
pub mod retry;

// Retry
pub use retry::{
    create_mock_retry_executor, create_retry_executor, MockRetryExecutor, OAuth2RetryExecutor,
    RetryConfig, RetryExecutor, RetryStats, DEFAULT_RETRY_CONFIG,
};

// Circuit Breaker
pub use circuit_breaker::{
    create_circuit_breaker, create_mock_circuit_breaker, CircuitBreaker, CircuitBreakerConfig,
    CircuitBreakerStats, CircuitState, MockCircuitBreaker, OAuth2CircuitBreaker,
    DEFAULT_CIRCUIT_BREAKER_CONFIG,
};

// Rate Limiter
pub use rate_limiter::{
    create_mock_rate_limiter, create_rate_limiter, MockRateLimiter, RateLimiter,
    RateLimiterConfig, RateLimiterStats, TokenBucketRateLimiter, DEFAULT_RATE_LIMITS,
};
