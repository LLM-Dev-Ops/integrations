//! Rate limiter implementation for the Gemini API client.
//!
//! Provides token bucket algorithm to control the rate of requests
//! and prevent exceeding API rate limits.

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::RwLock;
use std::time::{Duration, Instant};
use tokio::time::sleep;
use crate::error::GeminiError;

/// Configuration for the rate limiter.
#[derive(Debug, Clone)]
pub struct RateLimiterConfig {
    /// Maximum number of requests allowed per minute.
    pub requests_per_minute: u32,
    /// Maximum burst size (tokens that can accumulate).
    pub burst_size: u32,
    /// Refill interval in milliseconds.
    pub refill_interval: Duration,
}

impl Default for RateLimiterConfig {
    fn default() -> Self {
        Self {
            requests_per_minute: 60,
            burst_size: 10,
            refill_interval: Duration::from_millis(1000),
        }
    }
}

impl RateLimiterConfig {
    /// Creates a new rate limiter configuration.
    pub fn new(requests_per_minute: u32, burst_size: u32) -> Self {
        Self {
            requests_per_minute,
            burst_size,
            refill_interval: Duration::from_millis(1000),
        }
    }

    /// Creates a configuration for high throughput scenarios.
    pub fn high_throughput() -> Self {
        Self {
            requests_per_minute: 120,
            burst_size: 20,
            refill_interval: Duration::from_millis(500),
        }
    }

    /// Creates a configuration for conservative rate limiting.
    pub fn conservative() -> Self {
        Self {
            requests_per_minute: 30,
            burst_size: 5,
            refill_interval: Duration::from_millis(2000),
        }
    }

    /// Creates a configuration with no rate limiting.
    pub fn unlimited() -> Self {
        Self {
            requests_per_minute: u32::MAX,
            burst_size: u32::MAX,
            refill_interval: Duration::from_millis(1),
        }
    }
}

/// Token bucket rate limiter.
///
/// Uses the token bucket algorithm to control request rate:
/// - Tokens are added to the bucket at a steady rate
/// - Each request consumes a token
/// - If no tokens are available, requests must wait
pub struct RateLimiter {
    config: RateLimiterConfig,
    tokens: AtomicU32,
    last_refill: RwLock<Instant>,
}

impl RateLimiter {
    /// Creates a new rate limiter with the given configuration.
    pub fn new(config: RateLimiterConfig) -> Self {
        let initial_tokens = config.burst_size;
        Self {
            config,
            tokens: AtomicU32::new(initial_tokens),
            last_refill: RwLock::new(Instant::now()),
        }
    }

    /// Creates a rate limiter with default configuration.
    pub fn with_defaults() -> Self {
        Self::new(RateLimiterConfig::default())
    }

    /// Acquires a token, waiting if necessary.
    ///
    /// # Returns
    ///
    /// - `Ok(())` when a token is successfully acquired
    /// - `Err(GeminiError)` if rate limiting fails
    pub async fn acquire(&self) -> Result<(), GeminiError> {
        loop {
            // Refill tokens if enough time has passed
            self.refill();

            // Try to consume a token
            let current = self.tokens.load(Ordering::SeqCst);
            if current > 0 {
                if self.tokens.compare_exchange(
                    current,
                    current - 1,
                    Ordering::SeqCst,
                    Ordering::SeqCst,
                ).is_ok() {
                    tracing::debug!("Rate limiter: token acquired ({} remaining)", current - 1);
                    return Ok(());
                }
                // CAS failed, retry
                continue;
            }

            // No tokens available, calculate wait time
            let wait_duration = self.calculate_wait_time();
            tracing::debug!("Rate limiter: no tokens available, waiting {:?}", wait_duration);
            sleep(wait_duration).await;
        }
    }

    /// Attempts to acquire a token without waiting.
    ///
    /// # Returns
    ///
    /// - `Ok(true)` if a token was acquired
    /// - `Ok(false)` if no tokens are available
    /// - `Err(GeminiError)` if rate limiting fails
    pub fn try_acquire(&self) -> Result<bool, GeminiError> {
        // Refill tokens
        self.refill();

        // Try to consume a token
        let current = self.tokens.load(Ordering::SeqCst);
        if current > 0 {
            if self.tokens.compare_exchange(
                current,
                current - 1,
                Ordering::SeqCst,
                Ordering::SeqCst,
            ).is_ok() {
                tracing::debug!("Rate limiter: token acquired ({} remaining)", current - 1);
                return Ok(true);
            }
        }

        Ok(false)
    }

    /// Refills tokens based on elapsed time.
    fn refill(&self) {
        let now = Instant::now();
        let mut last_refill = self.last_refill.write().unwrap();
        let elapsed = now.duration_since(*last_refill);

        if elapsed >= self.config.refill_interval {
            // Calculate how many tokens to add
            let intervals = elapsed.as_millis() / self.config.refill_interval.as_millis();
            let tokens_per_interval = self.config.requests_per_minute as f64
                / (60_000.0 / self.config.refill_interval.as_millis() as f64);
            let tokens_to_add = (intervals as f64 * tokens_per_interval) as u32;

            if tokens_to_add > 0 {
                let current = self.tokens.load(Ordering::SeqCst);
                let new_tokens = std::cmp::min(current + tokens_to_add, self.config.burst_size);
                self.tokens.store(new_tokens, Ordering::SeqCst);
                *last_refill = now;

                tracing::trace!(
                    "Rate limiter: refilled {} tokens (now {})",
                    tokens_to_add,
                    new_tokens
                );
            }
        }
    }

    /// Calculates how long to wait until a token becomes available.
    fn calculate_wait_time(&self) -> Duration {
        // Calculate the time for one token to be added
        let tokens_per_second = self.config.requests_per_minute as f64 / 60.0;
        let millis_per_token = 1000.0 / tokens_per_second;

        Duration::from_millis(millis_per_token as u64)
    }

    /// Returns the current number of available tokens.
    pub fn available_tokens(&self) -> u32 {
        self.refill();
        self.tokens.load(Ordering::SeqCst)
    }

    /// Resets the rate limiter to its initial state.
    pub fn reset(&self) {
        self.tokens.store(self.config.burst_size, Ordering::SeqCst);
        *self.last_refill.write().unwrap() = Instant::now();
        tracing::info!("Rate limiter reset");
    }

    /// Returns the configuration.
    pub fn config(&self) -> &RateLimiterConfig {
        &self.config
    }
}

impl std::fmt::Debug for RateLimiter {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RateLimiter")
            .field("config", &self.config)
            .field("available_tokens", &self.available_tokens())
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn test_rate_limiter_initial_state() {
        let limiter = RateLimiter::with_defaults();
        assert_eq!(limiter.available_tokens(), limiter.config.burst_size);
    }

    #[tokio::test]
    async fn test_rate_limiter_acquire() {
        let config = RateLimiterConfig {
            requests_per_minute: 60,
            burst_size: 5,
            refill_interval: Duration::from_millis(100),
        };
        let limiter = RateLimiter::new(config);

        // Should be able to acquire up to burst_size tokens
        for _ in 0..5 {
            assert!(limiter.acquire().await.is_ok());
        }

        assert_eq!(limiter.available_tokens(), 0);
    }

    #[tokio::test]
    async fn test_rate_limiter_try_acquire() {
        let config = RateLimiterConfig {
            burst_size: 2,
            ..Default::default()
        };
        let limiter = RateLimiter::new(config);

        // Should succeed for available tokens
        assert_eq!(limiter.try_acquire().unwrap(), true);
        assert_eq!(limiter.try_acquire().unwrap(), true);

        // Should fail when no tokens available
        assert_eq!(limiter.try_acquire().unwrap(), false);
    }

    #[tokio::test]
    async fn test_rate_limiter_refill() {
        let config = RateLimiterConfig {
            requests_per_minute: 60,
            burst_size: 5,
            refill_interval: Duration::from_millis(50),
        };
        let limiter = RateLimiter::new(config);

        // Consume all tokens
        for _ in 0..5 {
            limiter.acquire().await.unwrap();
        }
        assert_eq!(limiter.available_tokens(), 0);

        // Wait for refill
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Tokens should be refilled
        let available = limiter.available_tokens();
        assert!(available > 0);
    }

    #[tokio::test]
    async fn test_rate_limiter_waits_for_token() {
        let config = RateLimiterConfig {
            requests_per_minute: 60,
            burst_size: 1,
            refill_interval: Duration::from_millis(100),
        };
        let limiter = RateLimiter::new(config);

        // Consume the token
        limiter.acquire().await.unwrap();

        // Next acquire should wait
        let start = Instant::now();
        limiter.acquire().await.unwrap();
        let elapsed = start.elapsed();

        // Should have waited at least some time
        assert!(elapsed >= Duration::from_millis(50));
    }

    #[test]
    fn test_rate_limiter_reset() {
        let config = RateLimiterConfig {
            burst_size: 5,
            ..Default::default()
        };
        let limiter = RateLimiter::new(config);

        // Consume tokens
        limiter.try_acquire().unwrap();
        limiter.try_acquire().unwrap();
        assert!(limiter.available_tokens() < 5);

        // Reset
        limiter.reset();
        assert_eq!(limiter.available_tokens(), 5);
    }

    #[test]
    fn test_config_high_throughput() {
        let config = RateLimiterConfig::high_throughput();
        assert_eq!(config.requests_per_minute, 120);
        assert_eq!(config.burst_size, 20);
    }

    #[test]
    fn test_config_conservative() {
        let config = RateLimiterConfig::conservative();
        assert_eq!(config.requests_per_minute, 30);
        assert_eq!(config.burst_size, 5);
    }

    #[test]
    fn test_config_unlimited() {
        let config = RateLimiterConfig::unlimited();
        assert_eq!(config.requests_per_minute, u32::MAX);
        assert_eq!(config.burst_size, u32::MAX);
    }

    #[tokio::test]
    async fn test_rate_limiter_concurrent_access() {
        use std::sync::Arc;

        let config = RateLimiterConfig {
            requests_per_minute: 60,
            burst_size: 10,
            refill_interval: Duration::from_millis(100),
        };
        let limiter = Arc::new(RateLimiter::new(config));

        let mut handles = vec![];
        for _ in 0..5 {
            let limiter_clone = limiter.clone();
            let handle = tokio::spawn(async move {
                limiter_clone.acquire().await.unwrap();
            });
            handles.push(handle);
        }

        for handle in handles {
            handle.await.unwrap();
        }

        // All should have succeeded
        assert!(limiter.available_tokens() <= 10);
    }
}
