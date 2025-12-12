//! Rate Limiter
//!
//! Token bucket rate limiting for OAuth2 API calls.

use async_trait::async_trait;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::error::{NetworkError, OAuth2Error};

/// Rate limiter configuration.
#[derive(Debug, Clone)]
pub struct RateLimiterConfig {
    /// Maximum number of tokens (requests) in the bucket.
    pub max_tokens: u32,
    /// Rate at which tokens are refilled per second.
    pub refill_rate: f64,
    /// Initial number of tokens.
    pub initial_tokens: u32,
}

impl Default for RateLimiterConfig {
    fn default() -> Self {
        Self {
            max_tokens: 100,
            refill_rate: 10.0,
            initial_tokens: 100,
        }
    }
}

/// Default rate limiter configuration.
pub const DEFAULT_RATE_LIMITS: RateLimiterConfig = RateLimiterConfig {
    max_tokens: 100,
    refill_rate: 10.0,
    initial_tokens: 100,
};

/// Rate limiter statistics.
#[derive(Debug, Clone, Default)]
pub struct RateLimiterStats {
    pub total_requests: u32,
    pub allowed_requests: u32,
    pub throttled_requests: u32,
}

/// Rate limiter interface.
#[async_trait]
pub trait RateLimiter: Send + Sync {
    /// Try to acquire a permit.
    async fn acquire(&self) -> Result<(), OAuth2Error>;

    /// Try to acquire a permit without blocking.
    fn try_acquire(&self) -> bool;

    /// Get current available tokens.
    fn available_tokens(&self) -> u32;

    /// Get rate limiter statistics.
    fn get_stats(&self) -> RateLimiterStats;
}

/// Token bucket state.
struct TokenBucketState {
    tokens: f64,
    last_refill: Instant,
}

/// Token bucket rate limiter implementation.
pub struct TokenBucketRateLimiter {
    config: RateLimiterConfig,
    state: Mutex<TokenBucketState>,
    stats: Mutex<RateLimiterStats>,
}

impl TokenBucketRateLimiter {
    /// Create new rate limiter.
    pub fn new(config: RateLimiterConfig) -> Self {
        Self {
            state: Mutex::new(TokenBucketState {
                tokens: config.initial_tokens as f64,
                last_refill: Instant::now(),
            }),
            stats: Mutex::new(RateLimiterStats::default()),
            config,
        }
    }

    fn refill_tokens(&self, state: &mut TokenBucketState) {
        let now = Instant::now();
        let elapsed = now.duration_since(state.last_refill).as_secs_f64();
        let new_tokens = elapsed * self.config.refill_rate;

        state.tokens = (state.tokens + new_tokens).min(self.config.max_tokens as f64);
        state.last_refill = now;
    }
}

impl Default for TokenBucketRateLimiter {
    fn default() -> Self {
        Self::new(RateLimiterConfig::default())
    }
}

#[async_trait]
impl RateLimiter for TokenBucketRateLimiter {
    async fn acquire(&self) -> Result<(), OAuth2Error> {
        loop {
            {
                let mut state = self.state.lock().unwrap();
                let mut stats = self.stats.lock().unwrap();

                stats.total_requests += 1;
                self.refill_tokens(&mut state);

                if state.tokens >= 1.0 {
                    state.tokens -= 1.0;
                    stats.allowed_requests += 1;
                    return Ok(());
                }
            }

            // Calculate wait time
            let wait_ms = (1.0 / self.config.refill_rate * 1000.0) as u64;
            tokio::time::sleep(Duration::from_millis(wait_ms.max(1))).await;
        }
    }

    fn try_acquire(&self) -> bool {
        let mut state = self.state.lock().unwrap();
        let mut stats = self.stats.lock().unwrap();

        stats.total_requests += 1;
        self.refill_tokens(&mut state);

        if state.tokens >= 1.0 {
            state.tokens -= 1.0;
            stats.allowed_requests += 1;
            true
        } else {
            stats.throttled_requests += 1;
            false
        }
    }

    fn available_tokens(&self) -> u32 {
        let mut state = self.state.lock().unwrap();
        self.refill_tokens(&mut state);
        state.tokens as u32
    }

    fn get_stats(&self) -> RateLimiterStats {
        self.stats.lock().unwrap().clone()
    }
}

/// Mock rate limiter for testing.
#[derive(Default)]
pub struct MockRateLimiter {
    should_throttle: Mutex<bool>,
    acquire_count: AtomicU32,
    stats: Mutex<RateLimiterStats>,
}

impl MockRateLimiter {
    /// Create new mock rate limiter.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set whether to throttle requests.
    pub fn set_should_throttle(&self, should_throttle: bool) -> &Self {
        *self.should_throttle.lock().unwrap() = should_throttle;
        self
    }

    /// Get acquire count.
    pub fn get_acquire_count(&self) -> u32 {
        self.acquire_count.load(Ordering::SeqCst)
    }
}

#[async_trait]
impl RateLimiter for MockRateLimiter {
    async fn acquire(&self) -> Result<(), OAuth2Error> {
        self.acquire_count.fetch_add(1, Ordering::SeqCst);

        if *self.should_throttle.lock().unwrap() {
            Err(OAuth2Error::Network(NetworkError::RateLimited {
                retry_after: Some(Duration::from_secs(1)),
            }))
        } else {
            Ok(())
        }
    }

    fn try_acquire(&self) -> bool {
        self.acquire_count.fetch_add(1, Ordering::SeqCst);
        !*self.should_throttle.lock().unwrap()
    }

    fn available_tokens(&self) -> u32 {
        if *self.should_throttle.lock().unwrap() {
            0
        } else {
            100
        }
    }

    fn get_stats(&self) -> RateLimiterStats {
        self.stats.lock().unwrap().clone()
    }
}

/// Create rate limiter.
pub fn create_rate_limiter(config: RateLimiterConfig) -> impl RateLimiter {
    TokenBucketRateLimiter::new(config)
}

/// Create mock rate limiter for testing.
pub fn create_mock_rate_limiter() -> MockRateLimiter {
    MockRateLimiter::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rate_limiter_config_default() {
        let config = RateLimiterConfig::default();
        assert_eq!(config.max_tokens, 100);
        assert_eq!(config.refill_rate, 10.0);
    }

    #[test]
    fn test_try_acquire() {
        let limiter = TokenBucketRateLimiter::new(RateLimiterConfig {
            max_tokens: 10,
            refill_rate: 1.0,
            initial_tokens: 5,
        });

        // Should allow first 5 requests
        for _ in 0..5 {
            assert!(limiter.try_acquire());
        }

        // Should throttle after tokens exhausted
        assert!(!limiter.try_acquire());
    }

    #[tokio::test]
    async fn test_mock_rate_limiter() {
        let limiter = MockRateLimiter::new();

        assert!(limiter.try_acquire());
        assert!(limiter.acquire().await.is_ok());

        limiter.set_should_throttle(true);
        assert!(!limiter.try_acquire());
        assert!(limiter.acquire().await.is_err());
    }
}
