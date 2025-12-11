//! Rate limiter implementation using token bucket algorithm.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tokio::sync::{Mutex, Semaphore, SemaphorePermit};

use crate::errors::{MistralError, MistralResult};

/// Configuration for rate limiting.
#[derive(Debug, Clone)]
pub struct RateLimiterConfig {
    /// Maximum concurrent requests.
    pub max_concurrent_requests: usize,
    /// Requests per minute limit (optional).
    pub requests_per_minute: Option<u32>,
    /// Tokens per minute limit (optional).
    pub tokens_per_minute: Option<u32>,
    /// Whether to auto-adjust based on API headers.
    pub auto_adjust: bool,
}

impl Default for RateLimiterConfig {
    fn default() -> Self {
        Self {
            max_concurrent_requests: 100,
            requests_per_minute: None,
            tokens_per_minute: None,
            auto_adjust: true,
        }
    }
}

/// Rate limit information from API headers.
#[derive(Debug, Clone, Default)]
pub struct RateLimitHeaders {
    /// Requests limit.
    pub requests_limit: Option<u32>,
    /// Remaining requests.
    pub requests_remaining: Option<u32>,
    /// Requests reset time.
    pub requests_reset: Option<i64>,
    /// Tokens limit.
    pub tokens_limit: Option<u32>,
    /// Remaining tokens.
    pub tokens_remaining: Option<u32>,
    /// Tokens reset time.
    pub tokens_reset: Option<i64>,
    /// Request ID.
    pub request_id: Option<String>,
}

impl RateLimitHeaders {
    /// Parses rate limit headers from a header map.
    pub fn from_headers(headers: &std::collections::HashMap<String, String>) -> Self {
        Self {
            requests_limit: headers
                .get("x-ratelimit-limit-requests")
                .and_then(|v| v.parse().ok()),
            requests_remaining: headers
                .get("x-ratelimit-remaining-requests")
                .and_then(|v| v.parse().ok()),
            requests_reset: headers
                .get("x-ratelimit-reset-requests")
                .and_then(|v| v.parse().ok()),
            tokens_limit: headers
                .get("x-ratelimit-limit-tokens")
                .and_then(|v| v.parse().ok()),
            tokens_remaining: headers
                .get("x-ratelimit-remaining-tokens")
                .and_then(|v| v.parse().ok()),
            tokens_reset: headers
                .get("x-ratelimit-reset-tokens")
                .and_then(|v| v.parse().ok()),
            request_id: headers.get("x-request-id").cloned(),
        }
    }
}

/// Token bucket for rate limiting.
struct TokenBucket {
    capacity: f64,
    tokens: f64,
    refill_rate: f64, // tokens per second
    last_update: Instant,
}

impl TokenBucket {
    fn new(capacity: u32, refill_rate: f64) -> Self {
        Self {
            capacity: capacity as f64,
            tokens: capacity as f64,
            refill_rate,
            last_update: Instant::now(),
        }
    }

    fn refill(&mut self) {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_update).as_secs_f64();
        self.tokens = (self.tokens + elapsed * self.refill_rate).min(self.capacity);
        self.last_update = now;
    }

    fn try_consume(&mut self, count: u32) -> bool {
        self.refill();
        let count = count as f64;
        if self.tokens >= count {
            self.tokens -= count;
            true
        } else {
            false
        }
    }

    fn time_until_available(&mut self, count: u32) -> Duration {
        self.refill();
        let count = count as f64;
        if self.tokens >= count {
            Duration::ZERO
        } else {
            let needed = count - self.tokens;
            Duration::from_secs_f64(needed / self.refill_rate)
        }
    }
}

/// Rate limiter for controlling request rates.
pub struct RateLimiter {
    config: RateLimiterConfig,
    concurrent_semaphore: Semaphore,
    request_bucket: Mutex<Option<TokenBucket>>,
    token_bucket: Mutex<Option<TokenBucket>>,
}

impl RateLimiter {
    /// Creates a new rate limiter.
    pub fn new(config: RateLimiterConfig) -> Self {
        let request_bucket = config.requests_per_minute.map(|rpm| {
            TokenBucket::new(rpm, rpm as f64 / 60.0)
        });

        let token_bucket = config.tokens_per_minute.map(|tpm| {
            TokenBucket::new(tpm, tpm as f64 / 60.0)
        });

        Self {
            concurrent_semaphore: Semaphore::new(config.max_concurrent_requests),
            request_bucket: Mutex::new(request_bucket),
            token_bucket: Mutex::new(token_bucket),
            config,
        }
    }

    /// Acquires a permit for making a request.
    pub async fn acquire(&self) -> MistralResult<RateLimitPermit<'_>> {
        // Acquire concurrent request permit
        let permit = self
            .concurrent_semaphore
            .acquire()
            .await
            .map_err(|_| MistralError::Internal {
                message: "Rate limiter semaphore closed".to_string(),
                request_id: None,
            })?;

        // Check request bucket
        if let Some(ref mut bucket) = *self.request_bucket.lock().await {
            let wait_time = bucket.time_until_available(1);
            if !wait_time.is_zero() {
                tokio::time::sleep(wait_time).await;
            }
            bucket.try_consume(1);
        }

        Ok(RateLimitPermit { _permit: permit })
    }

    /// Records token usage for rate limiting.
    pub async fn record_tokens(&self, tokens: u32) {
        if let Some(ref mut bucket) = *self.token_bucket.lock().await {
            // Deduct tokens from bucket
            bucket.try_consume(tokens);
        }
    }

    /// Updates rate limits from API response headers.
    pub async fn update_from_headers(&self, headers: &RateLimitHeaders) {
        if !self.config.auto_adjust {
            return;
        }

        // Update request bucket if limit changed
        if let Some(limit) = headers.requests_limit {
            let mut bucket = self.request_bucket.lock().await;
            if bucket.is_none() || bucket.as_ref().map(|b| b.capacity as u32) != Some(limit) {
                *bucket = Some(TokenBucket::new(limit, limit as f64 / 60.0));
            }
        }

        // Update token bucket if limit changed
        if let Some(limit) = headers.tokens_limit {
            let mut bucket = self.token_bucket.lock().await;
            if bucket.is_none() || bucket.as_ref().map(|b| b.capacity as u32) != Some(limit) {
                *bucket = Some(TokenBucket::new(limit, limit as f64 / 60.0));
            }
        }
    }
}

/// Permit for making a rate-limited request.
pub struct RateLimitPermit<'a> {
    _permit: SemaphorePermit<'a>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_rate_limiter_acquire() {
        let limiter = RateLimiter::new(RateLimiterConfig {
            max_concurrent_requests: 2,
            ..Default::default()
        });

        let permit1 = limiter.acquire().await;
        assert!(permit1.is_ok());

        let permit2 = limiter.acquire().await;
        assert!(permit2.is_ok());
    }

    #[tokio::test]
    async fn test_rate_limit_headers_parsing() {
        let mut headers = std::collections::HashMap::new();
        headers.insert("x-ratelimit-limit-requests".to_string(), "100".to_string());
        headers.insert(
            "x-ratelimit-remaining-requests".to_string(),
            "99".to_string(),
        );
        headers.insert("x-request-id".to_string(), "req-123".to_string());

        let rate_headers = RateLimitHeaders::from_headers(&headers);

        assert_eq!(rate_headers.requests_limit, Some(100));
        assert_eq!(rate_headers.requests_remaining, Some(99));
        assert_eq!(rate_headers.request_id, Some("req-123".to_string()));
    }

    #[test]
    fn test_token_bucket() {
        let mut bucket = TokenBucket::new(10, 1.0);

        assert!(bucket.try_consume(5));
        assert!(bucket.try_consume(5));
        assert!(!bucket.try_consume(1));
    }
}
