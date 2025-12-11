//! Resilience patterns for the Slack client.
//!
//! Provides retry logic, circuit breaker, and rate limiting.

pub mod circuit_breaker;
pub mod orchestrator;
pub mod rate_limiter;
pub mod retry;

pub use circuit_breaker::{CircuitBreaker, CircuitBreakerConfig, CircuitState};
pub use orchestrator::{ResilienceOrchestrator, ResilienceOrchestratorConfig};
pub use rate_limiter::{RateLimiter, RateLimiterConfig};
pub use retry::{RetryConfig, RetryPolicy};
