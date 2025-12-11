//! Rate limiter implementation.

use crate::errors::CohereError;
use parking_lot::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

/// Configuration for rate limiting
#[derive(Debug, Clone)]
pub struct RateLimitConfig {
    /// Maximum requests per interval
    pub max_requests: u32,
    /// Time interval for rate limiting
    pub interval: Duration,
    /// Whether to wait for permit or fail immediately
    pub wait_for_permit: bool,
    /// Maximum wait time for a permit
    pub max_wait: Duration,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            max_requests: 100,
            interval: Duration::from_secs(60),
            wait_for_permit: true,
            max_wait: Duration::from_secs(30),
        }
    }
}

impl RateLimitConfig {
    /// Create a new rate limit configuration
    pub fn new() -> Self {
        Self::default()
    }

    /// Set maximum requests per interval
    pub fn with_max_requests(mut self, max: u32) -> Self {
        self.max_requests = max;
        self
    }

    /// Set the time interval
    pub fn with_interval(mut self, interval: Duration) -> Self {
        self.interval = interval;
        self
    }

    /// Set whether to wait for permit
    pub fn with_wait_for_permit(mut self, wait: bool) -> Self {
        self.wait_for_permit = wait;
        self
    }

    /// Set maximum wait time
    pub fn with_max_wait(mut self, max_wait: Duration) -> Self {
        self.max_wait = max_wait;
        self
    }
}

/// Rate limit headers from API response
#[derive(Debug, Clone)]
pub struct RateLimitHeaders {
    /// Maximum requests allowed
    pub limit: Option<u32>,
    /// Remaining requests in current window
    pub remaining: Option<u32>,
    /// Time when rate limit resets (epoch seconds)
    pub reset: Option<u64>,
    /// Retry-after duration if rate limited
    pub retry_after: Option<Duration>,
}

impl RateLimitHeaders {
    /// Parse rate limit headers from HTTP headers
    pub fn from_headers(headers: &http::HeaderMap) -> Self {
        Self {
            limit: headers
                .get("x-ratelimit-limit")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse().ok()),
            remaining: headers
                .get("x-ratelimit-remaining")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse().ok()),
            reset: headers
                .get("x-ratelimit-reset")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse().ok()),
            retry_after: headers
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok())
                .map(Duration::from_secs),
        }
    }

    /// Check if we're rate limited
    pub fn is_rate_limited(&self) -> bool {
        self.retry_after.is_some() || self.remaining == Some(0)
    }

    /// Get wait duration if rate limited
    pub fn wait_duration(&self) -> Option<Duration> {
        if let Some(retry_after) = self.retry_after {
            return Some(retry_after);
        }

        if self.remaining == Some(0) {
            if let Some(reset) = self.reset {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                if reset > now {
                    return Some(Duration::from_secs(reset - now));
                }
            }
        }

        None
    }
}

/// A permit to make a request
#[derive(Debug)]
pub struct RateLimitPermit {
    _private: (),
}

/// Token bucket state
struct TokenBucket {
    tokens: f64,
    last_refill: Instant,
    max_tokens: f64,
    refill_rate: f64, // tokens per millisecond
}

impl TokenBucket {
    fn new(max_tokens: u32, interval: Duration) -> Self {
        let refill_rate = max_tokens as f64 / interval.as_millis() as f64;
        Self {
            tokens: max_tokens as f64,
            last_refill: Instant::now(),
            max_tokens: max_tokens as f64,
            refill_rate,
        }
    }

    fn try_acquire(&mut self) -> bool {
        self.refill();

        if self.tokens >= 1.0 {
            self.tokens -= 1.0;
            true
        } else {
            false
        }
    }

    fn time_until_available(&mut self) -> Duration {
        self.refill();

        if self.tokens >= 1.0 {
            Duration::ZERO
        } else {
            let tokens_needed = 1.0 - self.tokens;
            let ms_needed = (tokens_needed / self.refill_rate).ceil();
            Duration::from_millis(ms_needed as u64)
        }
    }

    fn refill(&mut self) {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refill);
        let new_tokens = elapsed.as_millis() as f64 * self.refill_rate;

        self.tokens = (self.tokens + new_tokens).min(self.max_tokens);
        self.last_refill = now;
    }
}

/// Rate limiter implementation using token bucket algorithm
pub struct RateLimiter {
    config: RateLimitConfig,
    bucket: Mutex<TokenBucket>,
    total_requests: AtomicU64,
    total_limited: AtomicU64,
}

impl RateLimiter {
    /// Create a new rate limiter with default configuration
    pub fn new() -> Self {
        Self::with_config(RateLimitConfig::default())
    }

    /// Create a new rate limiter with custom configuration
    pub fn with_config(config: RateLimitConfig) -> Self {
        let bucket = TokenBucket::new(config.max_requests, config.interval);
        Self {
            bucket: Mutex::new(bucket),
            config,
            total_requests: AtomicU64::new(0),
            total_limited: AtomicU64::new(0),
        }
    }

    /// Try to acquire a permit without waiting
    pub fn try_acquire(&self) -> Option<RateLimitPermit> {
        self.total_requests.fetch_add(1, Ordering::Relaxed);

        let mut bucket = self.bucket.lock();
        if bucket.try_acquire() {
            Some(RateLimitPermit { _private: () })
        } else {
            self.total_limited.fetch_add(1, Ordering::Relaxed);
            None
        }
    }

    /// Acquire a permit, waiting if necessary
    pub async fn acquire(&self) -> Result<RateLimitPermit, CohereError> {
        self.total_requests.fetch_add(1, Ordering::Relaxed);

        // Try to acquire immediately
        {
            let mut bucket = self.bucket.lock();
            if bucket.try_acquire() {
                return Ok(RateLimitPermit { _private: () });
            }
        }

        if !self.config.wait_for_permit {
            self.total_limited.fetch_add(1, Ordering::Relaxed);
            return Err(CohereError::RateLimit {
                message: "Rate limit exceeded".to_string(),
                retry_after: None,
            });
        }

        // Wait for permit
        let start = Instant::now();
        loop {
            let wait_duration = {
                let mut bucket = self.bucket.lock();
                bucket.time_until_available()
            };

            if start.elapsed() + wait_duration > self.config.max_wait {
                self.total_limited.fetch_add(1, Ordering::Relaxed);
                return Err(CohereError::RateLimit {
                    message: "Rate limit wait timeout exceeded".to_string(),
                    retry_after: Some(wait_duration),
                });
            }

            if wait_duration > Duration::ZERO {
                tokio::time::sleep(wait_duration).await;
            }

            let mut bucket = self.bucket.lock();
            if bucket.try_acquire() {
                return Ok(RateLimitPermit { _private: () });
            }
        }
    }

    /// Update rate limits from API response headers
    pub fn update_from_headers(&self, headers: &RateLimitHeaders) {
        // For now, just track headers. In a more advanced implementation,
        // we could sync our bucket with the API's actual limits
        if let Some(remaining) = headers.remaining {
            if remaining == 0 {
                self.total_limited.fetch_add(1, Ordering::Relaxed);
            }
        }
    }

    /// Get metrics
    pub fn metrics(&self) -> RateLimiterMetrics {
        let bucket = self.bucket.lock();
        RateLimiterMetrics {
            total_requests: self.total_requests.load(Ordering::Relaxed),
            total_limited: self.total_limited.load(Ordering::Relaxed),
            available_tokens: bucket.tokens as u32,
            max_tokens: bucket.max_tokens as u32,
        }
    }
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

/// Metrics for the rate limiter
#[derive(Debug, Clone)]
pub struct RateLimiterMetrics {
    /// Total number of requests
    pub total_requests: u64,
    /// Total number of rate limited requests
    pub total_limited: u64,
    /// Currently available tokens
    pub available_tokens: u32,
    /// Maximum tokens
    pub max_tokens: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rate_limit_config() {
        let config = RateLimitConfig::new()
            .with_max_requests(10)
            .with_interval(Duration::from_secs(1));

        assert_eq!(config.max_requests, 10);
        assert_eq!(config.interval, Duration::from_secs(1));
    }

    #[test]
    fn test_rate_limiter_allows_requests() {
        let limiter = RateLimiter::with_config(
            RateLimitConfig::new()
                .with_max_requests(10)
                .with_interval(Duration::from_secs(1)),
        );

        // Should allow first 10 requests
        for _ in 0..10 {
            assert!(limiter.try_acquire().is_some());
        }

        // 11th should fail
        assert!(limiter.try_acquire().is_none());
    }

    #[test]
    fn test_rate_limit_headers_parsing() {
        let mut headers = http::HeaderMap::new();
        headers.insert("x-ratelimit-limit", "100".parse().unwrap());
        headers.insert("x-ratelimit-remaining", "50".parse().unwrap());
        headers.insert("x-ratelimit-reset", "1700000000".parse().unwrap());

        let parsed = RateLimitHeaders::from_headers(&headers);

        assert_eq!(parsed.limit, Some(100));
        assert_eq!(parsed.remaining, Some(50));
        assert_eq!(parsed.reset, Some(1700000000));
    }

    #[test]
    fn test_rate_limit_headers_rate_limited() {
        let mut headers = http::HeaderMap::new();
        headers.insert("x-ratelimit-remaining", "0".parse().unwrap());
        headers.insert("retry-after", "30".parse().unwrap());

        let parsed = RateLimitHeaders::from_headers(&headers);

        assert!(parsed.is_rate_limited());
        assert_eq!(parsed.retry_after, Some(Duration::from_secs(30)));
    }

    #[test]
    fn test_rate_limiter_metrics() {
        let limiter = RateLimiter::with_config(
            RateLimitConfig::new()
                .with_max_requests(5)
                .with_interval(Duration::from_secs(1)),
        );

        for _ in 0..7 {
            let _ = limiter.try_acquire();
        }

        let metrics = limiter.metrics();
        assert_eq!(metrics.total_requests, 7);
        assert_eq!(metrics.total_limited, 2);
    }
}
