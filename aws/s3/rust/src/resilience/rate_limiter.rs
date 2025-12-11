//! Rate limiter implementation for S3 operations.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tracing::{debug, warn};

/// Rate limiter configuration.
#[derive(Debug, Clone)]
pub struct RateLimiterConfig {
    /// Maximum number of requests per second.
    pub requests_per_second: u32,
    /// Maximum burst size.
    pub burst_size: u32,
    /// Whether to wait when rate limited or return immediately.
    pub wait_on_limit: bool,
}

impl Default for RateLimiterConfig {
    fn default() -> Self {
        Self {
            requests_per_second: 100,
            burst_size: 10,
            wait_on_limit: true,
        }
    }
}

impl RateLimiterConfig {
    /// Create a new rate limiter configuration.
    pub fn new(requests_per_second: u32) -> Self {
        Self {
            requests_per_second,
            burst_size: requests_per_second / 10,
            wait_on_limit: true,
        }
    }

    /// Set the burst size.
    pub fn with_burst_size(mut self, size: u32) -> Self {
        self.burst_size = size;
        self
    }

    /// Set whether to wait on limit.
    pub fn with_wait_on_limit(mut self, wait: bool) -> Self {
        self.wait_on_limit = wait;
        self
    }
}

/// Token bucket rate limiter.
pub struct RateLimiter {
    config: RateLimiterConfig,
    /// Current number of available tokens.
    tokens: Mutex<f64>,
    /// Last time tokens were refilled.
    last_refill: Mutex<Instant>,
    /// Total requests made.
    total_requests: AtomicU64,
    /// Total requests that were rate limited.
    limited_requests: AtomicU64,
}

impl RateLimiter {
    /// Create a new rate limiter with the given configuration.
    pub fn new(config: RateLimiterConfig) -> Self {
        Self {
            tokens: Mutex::new(config.burst_size as f64),
            last_refill: Mutex::new(Instant::now()),
            total_requests: AtomicU64::new(0),
            limited_requests: AtomicU64::new(0),
            config,
        }
    }

    /// Acquire a token, waiting if necessary.
    pub async fn acquire(&self) {
        self.total_requests.fetch_add(1, Ordering::Relaxed);

        loop {
            self.refill_tokens();

            let mut tokens = self.tokens.lock().unwrap();
            if *tokens >= 1.0 {
                *tokens -= 1.0;
                return;
            }

            if !self.config.wait_on_limit {
                self.limited_requests.fetch_add(1, Ordering::Relaxed);
                warn!("Rate limit exceeded, request denied");
                return;
            }

            // Calculate wait time
            let wait_time = self.time_until_token();
            drop(tokens);

            self.limited_requests.fetch_add(1, Ordering::Relaxed);
            debug!(
                wait_ms = wait_time.as_millis(),
                "Rate limited, waiting for token"
            );

            tokio::time::sleep(wait_time).await;
        }
    }

    /// Try to acquire a token without waiting.
    /// Returns true if a token was acquired, false otherwise.
    pub fn try_acquire(&self) -> bool {
        self.total_requests.fetch_add(1, Ordering::Relaxed);
        self.refill_tokens();

        let mut tokens = self.tokens.lock().unwrap();
        if *tokens >= 1.0 {
            *tokens -= 1.0;
            true
        } else {
            self.limited_requests.fetch_add(1, Ordering::Relaxed);
            false
        }
    }

    /// Get the current number of available tokens.
    pub fn available_tokens(&self) -> f64 {
        self.refill_tokens();
        *self.tokens.lock().unwrap()
    }

    /// Get the total number of requests made.
    pub fn total_requests(&self) -> u64 {
        self.total_requests.load(Ordering::Relaxed)
    }

    /// Get the number of requests that were rate limited.
    pub fn limited_requests(&self) -> u64 {
        self.limited_requests.load(Ordering::Relaxed)
    }

    /// Get the rate limit configuration.
    pub fn config(&self) -> &RateLimiterConfig {
        &self.config
    }

    /// Reset the rate limiter state.
    pub fn reset(&self) {
        *self.tokens.lock().unwrap() = self.config.burst_size as f64;
        *self.last_refill.lock().unwrap() = Instant::now();
        self.total_requests.store(0, Ordering::Relaxed);
        self.limited_requests.store(0, Ordering::Relaxed);
    }

    fn refill_tokens(&self) {
        let mut tokens = self.tokens.lock().unwrap();
        let mut last_refill = self.last_refill.lock().unwrap();

        let now = Instant::now();
        let elapsed = now.duration_since(*last_refill);
        let new_tokens = elapsed.as_secs_f64() * self.config.requests_per_second as f64;

        *tokens = (*tokens + new_tokens).min(self.config.burst_size as f64);
        *last_refill = now;
    }

    fn time_until_token(&self) -> Duration {
        let tokens = *self.tokens.lock().unwrap();
        let needed = 1.0 - tokens;
        if needed <= 0.0 {
            return Duration::ZERO;
        }

        let seconds = needed / self.config.requests_per_second as f64;
        Duration::from_secs_f64(seconds)
    }
}

impl std::fmt::Debug for RateLimiter {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RateLimiter")
            .field("config", &self.config)
            .field("available_tokens", &self.available_tokens())
            .field("total_requests", &self.total_requests())
            .field("limited_requests", &self.limited_requests())
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = RateLimiterConfig::default();
        assert_eq!(config.requests_per_second, 100);
        assert_eq!(config.burst_size, 10);
        assert!(config.wait_on_limit);
    }

    #[test]
    fn test_custom_config() {
        let config = RateLimiterConfig::new(50)
            .with_burst_size(20)
            .with_wait_on_limit(false);

        assert_eq!(config.requests_per_second, 50);
        assert_eq!(config.burst_size, 20);
        assert!(!config.wait_on_limit);
    }

    #[test]
    fn test_initial_tokens() {
        let config = RateLimiterConfig::new(100).with_burst_size(10);
        let limiter = RateLimiter::new(config);
        assert_eq!(limiter.available_tokens(), 10.0);
    }

    #[test]
    fn test_try_acquire_success() {
        let config = RateLimiterConfig::new(100).with_burst_size(5);
        let limiter = RateLimiter::new(config);

        for _ in 0..5 {
            assert!(limiter.try_acquire());
        }
        assert_eq!(limiter.total_requests(), 5);
    }

    #[test]
    fn test_try_acquire_exhausted() {
        let config = RateLimiterConfig::new(100).with_burst_size(2);
        let limiter = RateLimiter::new(config);

        assert!(limiter.try_acquire());
        assert!(limiter.try_acquire());
        assert!(!limiter.try_acquire());
        assert_eq!(limiter.limited_requests(), 1);
    }

    #[test]
    fn test_reset() {
        let config = RateLimiterConfig::new(100).with_burst_size(5);
        let limiter = RateLimiter::new(config);

        for _ in 0..5 {
            limiter.try_acquire();
        }
        assert!(limiter.available_tokens() < 1.0);

        limiter.reset();
        assert_eq!(limiter.available_tokens(), 5.0);
        assert_eq!(limiter.total_requests(), 0);
        assert_eq!(limiter.limited_requests(), 0);
    }

    #[tokio::test]
    async fn test_acquire_success() {
        let config = RateLimiterConfig::new(100).with_burst_size(5);
        let limiter = RateLimiter::new(config);

        limiter.acquire().await;
        assert_eq!(limiter.total_requests(), 1);
    }
}
