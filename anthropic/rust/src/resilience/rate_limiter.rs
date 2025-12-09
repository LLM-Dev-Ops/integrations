use crate::errors::AnthropicError;
use chrono::{DateTime, Utc};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tokio::sync::Semaphore;

/// Configuration for rate limiting
#[derive(Debug, Clone)]
pub struct RateLimitConfig {
    pub max_concurrent_requests: usize,
    pub requests_per_minute: Option<u32>,
    pub tokens_per_minute: Option<u32>,
    pub auto_adjust: bool,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            max_concurrent_requests: 100,
            requests_per_minute: None,
            tokens_per_minute: None,
            auto_adjust: true,
        }
    }
}

/// Rate limiter implementation
pub struct RateLimiter {
    config: RateLimitConfig,
    concurrent_semaphore: Semaphore,
    request_bucket: Mutex<Option<TokenBucket>>,
    token_bucket: Mutex<Option<TokenBucket>>,
}

impl RateLimiter {
    /// Create a new rate limiter with the given configuration
    pub fn new(config: RateLimitConfig) -> Self {
        let request_bucket = config
            .requests_per_minute
            .map(|rpm| TokenBucket::new(rpm, rpm as f64 / 60.0));

        let token_bucket = config
            .tokens_per_minute
            .map(|tpm| TokenBucket::new(tpm, tpm as f64 / 60.0));

        Self {
            concurrent_semaphore: Semaphore::new(config.max_concurrent_requests),
            request_bucket: Mutex::new(request_bucket),
            token_bucket: Mutex::new(token_bucket),
            config,
        }
    }

    /// Acquire a permit to make a request
    pub async fn acquire(&self) -> Result<RateLimitPermit, AnthropicError> {
        // Acquire concurrent request permit
        let permit = self
            .concurrent_semaphore
            .acquire()
            .await
            .map_err(|_| AnthropicError::RateLimit {
                message: "Semaphore closed".to_string(),
                retry_after: None,
            })?;

        // Check request rate limit
        if let Some(bucket) = self.request_bucket.lock().unwrap().as_mut() {
            if !bucket.try_consume(1) {
                let wait_time = bucket.time_until_available(1);
                return Err(AnthropicError::RateLimit {
                    message: "Request rate limit exceeded".to_string(),
                    retry_after: Some(wait_time),
                });
            }
        }

        Ok(RateLimitPermit { _permit: permit })
    }

    /// Record tokens used in a request
    pub fn record_tokens(&self, tokens: u32) {
        if let Some(bucket) = self.token_bucket.lock().unwrap().as_mut() {
            bucket.consume(tokens);
        }
    }

    /// Update rate limits based on API response headers
    pub fn update_from_headers(&self, headers: &RateLimitHeaders) {
        if !self.config.auto_adjust {
            return;
        }

        // Log rate limit information for monitoring
        if let (Some(remaining), Some(limit)) = (headers.requests_remaining, headers.requests_limit)
        {
            if remaining < limit / 10 {
                // Less than 10% remaining
                eprintln!(
                    "[WARN] Rate limit warning: {} / {} requests remaining",
                    remaining, limit
                );
            }
        }

        if let (Some(remaining), Some(limit)) = (headers.tokens_remaining, headers.tokens_limit) {
            if remaining < limit / 10 {
                // Less than 10% remaining
                eprintln!(
                    "[WARN] Token limit warning: {} / {} tokens remaining",
                    remaining, limit
                );
            }
        }
    }
}

/// Permit to make a rate-limited request
pub struct RateLimitPermit<'a> {
    _permit: tokio::sync::SemaphorePermit<'a>,
}

/// Token bucket for rate limiting
struct TokenBucket {
    capacity: u32,
    tokens: f64,
    refill_rate: f64,
    last_update: Instant,
}

impl TokenBucket {
    fn new(capacity: u32, refill_rate: f64) -> Self {
        Self {
            capacity,
            tokens: capacity as f64,
            refill_rate,
            last_update: Instant::now(),
        }
    }

    fn try_consume(&mut self, count: u32) -> bool {
        self.refill();
        if self.tokens >= count as f64 {
            self.tokens -= count as f64;
            true
        } else {
            false
        }
    }

    fn consume(&mut self, count: u32) {
        self.refill();
        self.tokens = (self.tokens - count as f64).max(0.0);
    }

    fn refill(&mut self) {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_update).as_secs_f64();
        self.tokens = (self.tokens + elapsed * self.refill_rate).min(self.capacity as f64);
        self.last_update = now;
    }

    fn time_until_available(&self, count: u32) -> Duration {
        if self.tokens >= count as f64 {
            Duration::ZERO
        } else {
            let needed = count as f64 - self.tokens;
            Duration::from_secs_f64(needed / self.refill_rate)
        }
    }
}

/// Rate limit information from API response headers
#[derive(Debug, Clone, Default)]
pub struct RateLimitHeaders {
    pub requests_limit: Option<u32>,
    pub requests_remaining: Option<u32>,
    pub requests_reset: Option<DateTime<Utc>>,
    pub tokens_limit: Option<u32>,
    pub tokens_remaining: Option<u32>,
    pub tokens_reset: Option<DateTime<Utc>>,
    pub request_id: Option<String>,
}

impl RateLimitHeaders {
    /// Parse rate limit headers from HTTP response
    pub fn from_headers(headers: &http::HeaderMap) -> Self {
        Self {
            requests_limit: headers
                .get("anthropic-ratelimit-requests-limit")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse().ok()),
            requests_remaining: headers
                .get("anthropic-ratelimit-requests-remaining")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse().ok()),
            requests_reset: headers
                .get("anthropic-ratelimit-requests-reset")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.with_timezone(&Utc)),
            tokens_limit: headers
                .get("anthropic-ratelimit-tokens-limit")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse().ok()),
            tokens_remaining: headers
                .get("anthropic-ratelimit-tokens-remaining")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse().ok()),
            tokens_reset: headers
                .get("anthropic-ratelimit-tokens-reset")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.with_timezone(&Utc)),
            request_id: headers
                .get("request-id")
                .and_then(|v| v.to_str().ok())
                .map(String::from),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_rate_limiter_concurrent_limit() {
        let config = RateLimitConfig {
            max_concurrent_requests: 2,
            requests_per_minute: None,
            tokens_per_minute: None,
            auto_adjust: false,
        };
        let limiter = RateLimiter::new(config);

        // Should be able to acquire 2 permits
        let permit1 = limiter.acquire().await;
        assert!(permit1.is_ok());
        let permit2 = limiter.acquire().await;
        assert!(permit2.is_ok());

        // Third should wait (we'll test by dropping one first)
        drop(permit1);
        let permit3 = limiter.acquire().await;
        assert!(permit3.is_ok());
    }

    #[tokio::test]
    async fn test_rate_limiter_request_limit() {
        let config = RateLimitConfig {
            max_concurrent_requests: 100,
            requests_per_minute: Some(10),
            tokens_per_minute: None,
            auto_adjust: false,
        };
        let limiter = RateLimiter::new(config);

        // Acquire 10 permits
        for _ in 0..10 {
            let permit = limiter.acquire().await;
            assert!(permit.is_ok());
        }

        // 11th should fail
        let permit = limiter.acquire().await;
        assert!(permit.is_err());
        if let Err(AnthropicError::RateLimit { retry_after, .. }) = permit {
            assert!(retry_after.is_some());
        } else {
            panic!("Expected rate limit error");
        }
    }

    #[test]
    fn test_token_bucket_try_consume() {
        let mut bucket = TokenBucket::new(10, 1.0);
        assert!(bucket.try_consume(5));
        assert!(bucket.try_consume(5));
        assert!(!bucket.try_consume(1));
    }

    #[test]
    fn test_token_bucket_consume() {
        let mut bucket = TokenBucket::new(10, 1.0);
        bucket.consume(15);
        assert_eq!(bucket.tokens, 0.0);
    }

    #[test]
    fn test_token_bucket_refill() {
        let mut bucket = TokenBucket::new(10, 10.0);
        bucket.consume(10);
        std::thread::sleep(Duration::from_millis(500));
        bucket.refill();
        assert!(bucket.tokens >= 4.0 && bucket.tokens <= 6.0);
    }

    #[test]
    fn test_token_bucket_time_until_available() {
        let mut bucket = TokenBucket::new(10, 1.0);
        bucket.consume(10);
        let time = bucket.time_until_available(5);
        assert!(time >= Duration::from_secs(4) && time <= Duration::from_secs(6));
    }

    #[test]
    fn test_rate_limit_headers_parsing() {
        let mut headers = http::HeaderMap::new();
        headers.insert(
            "anthropic-ratelimit-requests-limit",
            "1000".parse().unwrap(),
        );
        headers.insert(
            "anthropic-ratelimit-requests-remaining",
            "999".parse().unwrap(),
        );
        headers.insert(
            "anthropic-ratelimit-tokens-limit",
            "100000".parse().unwrap(),
        );
        headers.insert(
            "anthropic-ratelimit-tokens-remaining",
            "99000".parse().unwrap(),
        );
        headers.insert("request-id", "req_123".parse().unwrap());

        let rate_limits = RateLimitHeaders::from_headers(&headers);
        assert_eq!(rate_limits.requests_limit, Some(1000));
        assert_eq!(rate_limits.requests_remaining, Some(999));
        assert_eq!(rate_limits.tokens_limit, Some(100000));
        assert_eq!(rate_limits.tokens_remaining, Some(99000));
        assert_eq!(rate_limits.request_id, Some("req_123".to_string()));
    }

    #[tokio::test]
    async fn test_rate_limiter_record_tokens() {
        let config = RateLimitConfig {
            max_concurrent_requests: 100,
            requests_per_minute: None,
            tokens_per_minute: Some(100),
            auto_adjust: false,
        };
        let limiter = RateLimiter::new(config);

        // Record token usage
        limiter.record_tokens(50);
        limiter.record_tokens(50);

        // Token bucket should be depleted
        let bucket = limiter.token_bucket.lock().unwrap();
        if let Some(ref bucket) = *bucket {
            assert!(bucket.tokens < 1.0);
        }
    }
}
