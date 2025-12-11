//! Rate limiting implementation for the SES client.

use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::time::sleep;

use crate::error::SesError;

/// Configuration for rate limiting.
#[derive(Debug, Clone)]
pub struct RateLimitConfig {
    /// Maximum requests per second.
    pub requests_per_second: f64,

    /// Maximum burst size (token bucket capacity).
    pub burst_size: u32,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            // SES default sending rate is 14 emails per second
            requests_per_second: 14.0,
            burst_size: 50,
        }
    }
}

/// Token bucket rate limiter implementation.
///
/// This uses a token bucket algorithm to enforce rate limits in a thread-safe manner.
pub struct RateLimiter {
    /// Rate limit configuration.
    config: RateLimitConfig,

    /// Current number of available tokens (scaled by 1000 for precision).
    tokens: AtomicU32,

    /// Last time tokens were updated (microseconds since UNIX epoch).
    last_update: AtomicU64,
}

impl RateLimiter {
    /// Create a new rate limiter with the given configuration.
    ///
    /// # Arguments
    ///
    /// * `config` - The rate limit configuration.
    ///
    /// # Example
    ///
    /// ```
    /// use aws_ses_rust::config::{RateLimitConfig, RateLimiter};
    ///
    /// let config = RateLimitConfig::default();
    /// let limiter = RateLimiter::new(config);
    /// ```
    pub fn new(config: RateLimitConfig) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_micros() as u64;

        Self {
            tokens: AtomicU32::new(config.burst_size * 1000),
            last_update: AtomicU64::new(now),
            config,
        }
    }

    /// Acquire a token, waiting if necessary.
    ///
    /// This method will block asynchronously until a token is available.
    ///
    /// # Returns
    ///
    /// `Ok(())` when a token has been acquired, or an error if rate limiting fails.
    ///
    /// # Example
    ///
    /// ```
    /// use aws_ses_rust::config::{RateLimitConfig, RateLimiter};
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let config = RateLimitConfig::default();
    /// let limiter = RateLimiter::new(config);
    ///
    /// limiter.acquire().await?;
    /// // Make SES API call here
    /// # Ok(())
    /// # }
    /// ```
    pub async fn acquire(&self) -> Result<(), SesError> {
        loop {
            if self.try_acquire() {
                return Ok(());
            }

            // Calculate how long to wait for the next token
            let wait_time = self.calculate_wait_time();
            sleep(wait_time).await;
        }
    }

    /// Try to acquire a token without blocking.
    ///
    /// # Returns
    ///
    /// `true` if a token was acquired, `false` if no tokens are available.
    ///
    /// # Example
    ///
    /// ```
    /// use aws_ses_rust::config::{RateLimitConfig, RateLimiter};
    ///
    /// let config = RateLimitConfig::default();
    /// let limiter = RateLimiter::new(config);
    ///
    /// if limiter.try_acquire() {
    ///     // Make SES API call here
    /// } else {
    ///     // Rate limit exceeded, handle accordingly
    /// }
    /// ```
    pub fn try_acquire(&self) -> bool {
        self.refill_tokens();

        loop {
            let current = self.tokens.load(Ordering::Relaxed);

            // Need at least 1000 tokens (representing 1 request)
            if current < 1000 {
                return false;
            }

            // Try to decrement tokens
            let new_value = current - 1000;
            if self.tokens
                .compare_exchange(current, new_value, Ordering::SeqCst, Ordering::Relaxed)
                .is_ok()
            {
                return true;
            }

            // CAS failed, retry
        }
    }

    /// Refill tokens based on elapsed time.
    fn refill_tokens(&self) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_micros() as u64;

        let last = self.last_update.load(Ordering::Relaxed);
        let elapsed_micros = now.saturating_sub(last);

        if elapsed_micros == 0 {
            return;
        }

        // Try to update last_update timestamp
        if self.last_update
            .compare_exchange(last, now, Ordering::SeqCst, Ordering::Relaxed)
            .is_err()
        {
            // Another thread updated it, skip refilling
            return;
        }

        // Calculate tokens to add (scaled by 1000 for precision)
        let tokens_per_micro = self.config.requests_per_second / 1_000_000.0;
        let tokens_to_add = (elapsed_micros as f64 * tokens_per_micro * 1000.0) as u32;

        if tokens_to_add > 0 {
            let max_tokens = self.config.burst_size * 1000;
            loop {
                let current = self.tokens.load(Ordering::Relaxed);
                let new_value = std::cmp::min(current.saturating_add(tokens_to_add), max_tokens);

                if self.tokens
                    .compare_exchange(current, new_value, Ordering::SeqCst, Ordering::Relaxed)
                    .is_ok()
                {
                    break;
                }
            }
        }
    }

    /// Calculate how long to wait for the next token.
    fn calculate_wait_time(&self) -> Duration {
        // Time to generate one token
        let micros_per_token = (1_000_000.0 / self.config.requests_per_second) as u64;
        Duration::from_micros(micros_per_token)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_rate_limit_config() {
        let config = RateLimitConfig::default();
        assert_eq!(config.requests_per_second, 14.0);
        assert_eq!(config.burst_size, 50);
    }

    #[test]
    fn test_rate_limiter_creation() {
        let config = RateLimitConfig::default();
        let limiter = RateLimiter::new(config.clone());

        // Should start with full burst capacity
        assert_eq!(limiter.tokens.load(Ordering::Relaxed), config.burst_size * 1000);
    }

    #[test]
    fn test_try_acquire() {
        let config = RateLimitConfig {
            requests_per_second: 10.0,
            burst_size: 5,
        };
        let limiter = RateLimiter::new(config);

        // Should be able to acquire up to burst_size tokens
        for _ in 0..5 {
            assert!(limiter.try_acquire());
        }

        // Should fail after burst is exhausted (without waiting for refill)
        assert!(!limiter.try_acquire());
    }

    #[tokio::test]
    async fn test_acquire() {
        let config = RateLimitConfig {
            requests_per_second: 100.0, // Fast for testing
            burst_size: 2,
        };
        let limiter = RateLimiter::new(config);

        // Should be able to acquire tokens
        assert!(limiter.acquire().await.is_ok());
        assert!(limiter.acquire().await.is_ok());

        // Third acquire should wait for refill but succeed
        assert!(limiter.acquire().await.is_ok());
    }

    #[test]
    fn test_calculate_wait_time() {
        let config = RateLimitConfig {
            requests_per_second: 10.0,
            burst_size: 5,
        };
        let limiter = RateLimiter::new(config);

        let wait_time = limiter.calculate_wait_time();
        // 1 second / 10 requests = 100ms per token
        assert_eq!(wait_time, Duration::from_millis(100));
    }
}
