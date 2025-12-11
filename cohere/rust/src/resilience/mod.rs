//! Resilience patterns for the Cohere API client.
//!
//! This module provides:
//! - Retry with exponential backoff
//! - Circuit breaker pattern
//! - Rate limiting
//! - Orchestrator combining all patterns

mod circuit_breaker;
mod orchestrator;
mod rate_limiter;
mod retry;

pub use circuit_breaker::{CircuitBreaker, CircuitBreakerConfig, CircuitBreakerHook, CircuitState};
pub use orchestrator::{
    DefaultResilienceOrchestrator, ResilienceConfig, ResilienceOrchestrator,
    ResilienceOrchestratorBuilder,
};
pub use rate_limiter::{RateLimitConfig, RateLimitHeaders, RateLimitPermit, RateLimiter};
pub use retry::{RetryConfig, RetryContext, RetryDecision, RetryExecutor, RetryHook};
