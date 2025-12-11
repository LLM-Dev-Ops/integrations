//! Rate limiter using token bucket algorithm.

use crate::errors::{RateLimitError, SlackError, SlackResult};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tracing::{debug, warn};

/// Configuration for rate limiter
#[derive(Debug, Clone)]
pub struct RateLimiterConfig {
    /// Maximum tokens (requests) in the bucket
    pub max_tokens: u32,
    /// Tokens refilled per second
    pub refill_rate: f64,
    /// Whether to wait for tokens or fail immediately
    pub wait_for_tokens: bool,
    /// Maximum time to wait for tokens
    pub max_wait: Duration,
}

impl Default for RateLimiterConfig {
    fn default() -> Self {
        Self {
            max_tokens: 50,
            refill_rate: 50.0,
            wait_for_tokens: true,
            max_wait: Duration::from_secs(60),
        }
    }
}

impl RateLimiterConfig {
    /// Create a new configuration
    pub fn new() -> Self {
        Self::default()
    }

    /// Set maximum tokens
    pub fn max_tokens(mut self, n: u32) -> Self {
        self.max_tokens = n;
        self
    }

    /// Set refill rate (tokens per second)
    pub fn refill_rate(mut self, rate: f64) -> Self {
        self.refill_rate = rate;
        self
    }

    /// Set whether to wait for tokens
    pub fn wait_for_tokens(mut self, wait: bool) -> Self {
        self.wait_for_tokens = wait;
        self
    }

    /// Set maximum wait time
    pub fn max_wait(mut self, duration: Duration) -> Self {
        self.max_wait = duration;
        self
    }

    /// Create config for Slack Tier 1 rate limit (1/min)
    pub fn tier1() -> Self {
        Self {
            max_tokens: 1,
            refill_rate: 1.0 / 60.0,
            wait_for_tokens: true,
            max_wait: Duration::from_secs(120),
        }
    }

    /// Create config for Slack Tier 2 rate limit (20/min)
    pub fn tier2() -> Self {
        Self {
            max_tokens: 20,
            refill_rate: 20.0 / 60.0,
            wait_for_tokens: true,
            max_wait: Duration::from_secs(60),
        }
    }

    /// Create config for Slack Tier 3 rate limit (50/min)
    pub fn tier3() -> Self {
        Self {
            max_tokens: 50,
            refill_rate: 50.0 / 60.0,
            wait_for_tokens: true,
            max_wait: Duration::from_secs(60),
        }
    }

    /// Create config for Slack Tier 4 rate limit (100/min)
    pub fn tier4() -> Self {
        Self {
            max_tokens: 100,
            refill_rate: 100.0 / 60.0,
            wait_for_tokens: true,
            max_wait: Duration::from_secs(60),
        }
    }
}

/// Token bucket state
struct TokenBucket {
    tokens: f64,
    last_refill: Instant,
    config: RateLimiterConfig,
}

impl TokenBucket {
    fn new(config: RateLimiterConfig) -> Self {
        Self {
            tokens: config.max_tokens as f64,
            last_refill: Instant::now(),
            config,
        }
    }

    fn refill(&mut self) {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refill).as_secs_f64();
        let new_tokens = elapsed * self.config.refill_rate;
        self.tokens = (self.tokens + new_tokens).min(self.config.max_tokens as f64);
        self.last_refill = now;
    }

    fn try_acquire(&mut self, tokens: f64) -> bool {
        self.refill();
        if self.tokens >= tokens {
            self.tokens -= tokens;
            true
        } else {
            false
        }
    }

    fn time_until_available(&mut self, tokens: f64) -> Duration {
        self.refill();
        if self.tokens >= tokens {
            return Duration::ZERO;
        }
        let needed = tokens - self.tokens;
        let seconds = needed / self.config.refill_rate;
        Duration::from_secs_f64(seconds)
    }

    fn update_from_headers(&mut self, remaining: Option<u32>, reset_after: Option<Duration>) {
        if let Some(remaining) = remaining {
            self.tokens = remaining as f64;
        }
        if let Some(_reset_after) = reset_after {
            // Update last_refill based on reset_after
            self.last_refill = Instant::now();
        }
    }
}

/// Rate limiter implementation
pub struct RateLimiter {
    /// Global bucket for all requests
    global_bucket: Mutex<TokenBucket>,
    /// Per-endpoint buckets
    endpoint_buckets: Mutex<HashMap<String, TokenBucket>>,
    /// Default configuration for new endpoints
    default_config: RateLimiterConfig,
}

impl RateLimiter {
    /// Create a new rate limiter with default configuration
    pub fn new() -> Self {
        Self::with_config(RateLimiterConfig::default())
    }

    /// Create a new rate limiter with custom configuration
    pub fn with_config(config: RateLimiterConfig) -> Self {
        Self {
            global_bucket: Mutex::new(TokenBucket::new(config.clone())),
            endpoint_buckets: Mutex::new(HashMap::new()),
            default_config: config,
        }
    }

    /// Try to acquire a token for an endpoint
    pub async fn acquire(&self, endpoint: &str) -> SlackResult<()> {
        self.acquire_n(endpoint, 1.0).await
    }

    /// Try to acquire multiple tokens for an endpoint
    pub async fn acquire_n(&self, endpoint: &str, tokens: f64) -> SlackResult<()> {
        // Check global limit first
        let wait_time = {
            let mut global = self.global_bucket.lock();
            if global.try_acquire(tokens) {
                Duration::ZERO
            } else if self.default_config.wait_for_tokens {
                let wait = global.time_until_available(tokens);
                if wait > self.default_config.max_wait {
                    return Err(SlackError::RateLimit(RateLimitError::RateLimited {
                        retry_after: wait,
                        tier: None,
                    }));
                }
                wait
            } else {
                return Err(SlackError::RateLimit(RateLimitError::TooManyRequests));
            }
        };

        if !wait_time.is_zero() {
            debug!(
                endpoint,
                wait_ms = wait_time.as_millis(),
                "Waiting for rate limit"
            );
            tokio::time::sleep(wait_time).await;

            // Try again after waiting
            let mut global = self.global_bucket.lock();
            if !global.try_acquire(tokens) {
                return Err(SlackError::RateLimit(RateLimitError::TooManyRequests));
            }
        }

        // Check per-endpoint limit
        let endpoint_wait = {
            let mut buckets = self.endpoint_buckets.lock();
            let bucket = buckets
                .entry(endpoint.to_string())
                .or_insert_with(|| TokenBucket::new(self.default_config.clone()));

            if bucket.try_acquire(tokens) {
                Duration::ZERO
            } else if self.default_config.wait_for_tokens {
                bucket.time_until_available(tokens)
            } else {
                return Err(SlackError::RateLimit(RateLimitError::TooManyRequests));
            }
        };

        if !endpoint_wait.is_zero() {
            if endpoint_wait > self.default_config.max_wait {
                return Err(SlackError::RateLimit(RateLimitError::RateLimited {
                    retry_after: endpoint_wait,
                    tier: None,
                }));
            }

            debug!(
                endpoint,
                wait_ms = endpoint_wait.as_millis(),
                "Waiting for endpoint rate limit"
            );
            tokio::time::sleep(endpoint_wait).await;

            let mut buckets = self.endpoint_buckets.lock();
            if let Some(bucket) = buckets.get_mut(endpoint) {
                if !bucket.try_acquire(tokens) {
                    return Err(SlackError::RateLimit(RateLimitError::TooManyRequests));
                }
            }
        }

        Ok(())
    }

    /// Update rate limit from response headers
    pub fn update_from_headers(
        &self,
        endpoint: &str,
        remaining: Option<u32>,
        reset_after: Option<Duration>,
    ) {
        if remaining.is_none() && reset_after.is_none() {
            return;
        }

        let mut buckets = self.endpoint_buckets.lock();
        let bucket = buckets
            .entry(endpoint.to_string())
            .or_insert_with(|| TokenBucket::new(self.default_config.clone()));

        bucket.update_from_headers(remaining, reset_after);

        if let Some(remaining) = remaining {
            debug!(
                endpoint,
                remaining,
                "Updated rate limit from headers"
            );
        }
    }

    /// Configure rate limit for a specific endpoint
    pub fn configure_endpoint(&self, endpoint: &str, config: RateLimiterConfig) {
        let mut buckets = self.endpoint_buckets.lock();
        buckets.insert(endpoint.to_string(), TokenBucket::new(config));
    }

    /// Get remaining tokens for an endpoint
    pub fn remaining(&self, endpoint: &str) -> f64 {
        let mut buckets = self.endpoint_buckets.lock();
        if let Some(bucket) = buckets.get_mut(endpoint) {
            bucket.refill();
            bucket.tokens
        } else {
            self.default_config.max_tokens as f64
        }
    }

    /// Get remaining global tokens
    pub fn remaining_global(&self) -> f64 {
        let mut global = self.global_bucket.lock();
        global.refill();
        global.tokens
    }

    /// Reset all rate limits
    pub fn reset(&self) {
        let mut global = self.global_bucket.lock();
        global.tokens = global.config.max_tokens as f64;
        global.last_refill = Instant::now();

        let mut buckets = self.endpoint_buckets.lock();
        for bucket in buckets.values_mut() {
            bucket.tokens = bucket.config.max_tokens as f64;
            bucket.last_refill = Instant::now();
        }

        debug!("Rate limits reset");
    }
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Debug for RateLimiter {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RateLimiter")
            .field("config", &self.default_config)
            .field("remaining_global", &self.remaining_global())
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tier_configs() {
        let tier1 = RateLimiterConfig::tier1();
        assert_eq!(tier1.max_tokens, 1);

        let tier4 = RateLimiterConfig::tier4();
        assert_eq!(tier4.max_tokens, 100);
    }

    #[tokio::test]
    async fn test_acquire_success() {
        let limiter = RateLimiter::with_config(RateLimiterConfig::new().max_tokens(10));

        for _ in 0..5 {
            assert!(limiter.acquire("test").await.is_ok());
        }
    }

    #[tokio::test]
    async fn test_acquire_exhausted() {
        let limiter = RateLimiter::with_config(
            RateLimiterConfig::new()
                .max_tokens(2)
                .wait_for_tokens(false),
        );

        assert!(limiter.acquire("test").await.is_ok());
        assert!(limiter.acquire("test").await.is_ok());
        assert!(limiter.acquire("test").await.is_err());
    }

    #[tokio::test]
    async fn test_refill() {
        let limiter = RateLimiter::with_config(
            RateLimiterConfig::new()
                .max_tokens(1)
                .refill_rate(100.0) // 100 per second
                .wait_for_tokens(false),
        );

        assert!(limiter.acquire("test").await.is_ok());
        assert!(limiter.acquire("test").await.is_err());

        tokio::time::sleep(Duration::from_millis(20)).await;

        // Should have refilled
        assert!(limiter.acquire("test").await.is_ok());
    }

    #[test]
    fn test_update_from_headers() {
        let limiter = RateLimiter::with_config(RateLimiterConfig::new().max_tokens(100));

        limiter.update_from_headers("test", Some(5), None);
        assert_eq!(limiter.remaining("test"), 5.0);
    }

    #[test]
    fn test_reset() {
        let limiter = RateLimiter::with_config(RateLimiterConfig::new().max_tokens(10));

        // Drain some tokens
        {
            let mut global = limiter.global_bucket.lock();
            global.tokens = 2.0;
        }

        limiter.reset();

        assert_eq!(limiter.remaining_global(), 10.0);
    }
}
