//! Rate limit tracking and management.

use std::collections::HashMap;
use std::time::{Duration, Instant};

/// Type of rate limit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RateLimitType {
    /// Request-based rate limit.
    Requests,
    /// Token-based rate limit.
    Tokens,
}

/// Rate limit information.
#[derive(Debug, Clone)]
pub struct RateLimitInfo {
    /// Request limit.
    pub requests_limit: Option<u32>,
    /// Remaining requests.
    pub requests_remaining: Option<u32>,
    /// Request limit reset time.
    pub requests_reset: Option<Duration>,
    /// Token limit.
    pub tokens_limit: Option<u32>,
    /// Remaining tokens.
    pub tokens_remaining: Option<u32>,
    /// Token limit reset time.
    pub tokens_reset: Option<Duration>,
}

impl Default for RateLimitInfo {
    fn default() -> Self {
        Self {
            requests_limit: None,
            requests_remaining: None,
            requests_reset: None,
            tokens_limit: None,
            tokens_remaining: None,
            tokens_reset: None,
        }
    }
}

/// Rate limit manager.
#[derive(Debug)]
pub struct RateLimitManager {
    info: RateLimitInfo,
    last_update: Option<Instant>,
    /// Threshold percentage below which to start throttling (0.1 = 10%).
    throttle_threshold: f64,
}

impl RateLimitManager {
    /// Creates a new rate limit manager.
    pub fn new() -> Self {
        Self {
            info: RateLimitInfo::default(),
            last_update: None,
            throttle_threshold: 0.10, // Start throttling at 10% remaining
        }
    }

    /// Creates with a custom throttle threshold.
    pub fn with_throttle_threshold(threshold: f64) -> Self {
        Self {
            info: RateLimitInfo::default(),
            last_update: None,
            throttle_threshold: threshold,
        }
    }

    /// Updates rate limit info from response headers.
    pub fn update_from_headers(&mut self, headers: &HashMap<String, String>) {
        // Parse request rate limits
        if let Some(limit) = headers
            .get("x-ratelimit-limit-requests")
            .and_then(|v| v.parse().ok())
        {
            self.info.requests_limit = Some(limit);
        }

        if let Some(remaining) = headers
            .get("x-ratelimit-remaining-requests")
            .and_then(|v| v.parse().ok())
        {
            self.info.requests_remaining = Some(remaining);
        }

        if let Some(reset) = headers
            .get("x-ratelimit-reset-requests")
            .and_then(|v| parse_reset_time(v))
        {
            self.info.requests_reset = Some(reset);
        }

        // Parse token rate limits
        if let Some(limit) = headers
            .get("x-ratelimit-limit-tokens")
            .and_then(|v| v.parse().ok())
        {
            self.info.tokens_limit = Some(limit);
        }

        if let Some(remaining) = headers
            .get("x-ratelimit-remaining-tokens")
            .and_then(|v| v.parse().ok())
        {
            self.info.tokens_remaining = Some(remaining);
        }

        if let Some(reset) = headers
            .get("x-ratelimit-reset-tokens")
            .and_then(|v| parse_reset_time(v))
        {
            self.info.tokens_reset = Some(reset);
        }

        self.last_update = Some(Instant::now());
    }

    /// Checks if we should wait before making a request.
    ///
    /// Returns `Some(duration)` if we should wait, `None` if we can proceed.
    pub fn should_wait(&self) -> Option<Duration> {
        // Check request rate limit
        if let (Some(limit), Some(remaining)) =
            (self.info.requests_limit, self.info.requests_remaining)
        {
            let ratio = remaining as f64 / limit as f64;
            if ratio < self.throttle_threshold {
                if let Some(reset) = self.info.requests_reset {
                    // Calculate wait time proportional to how close we are to limit
                    let wait_ratio = 1.0 - (ratio / self.throttle_threshold);
                    let wait = Duration::from_millis((reset.as_millis() as f64 * wait_ratio) as u64);
                    return Some(wait.min(reset));
                }
            }
        }

        // Check token rate limit
        if let (Some(limit), Some(remaining)) =
            (self.info.tokens_limit, self.info.tokens_remaining)
        {
            let ratio = remaining as f64 / limit as f64;
            if ratio < self.throttle_threshold {
                if let Some(reset) = self.info.tokens_reset {
                    let wait_ratio = 1.0 - (ratio / self.throttle_threshold);
                    let wait = Duration::from_millis((reset.as_millis() as f64 * wait_ratio) as u64);
                    return Some(wait.min(reset));
                }
            }
        }

        None
    }

    /// Returns the current rate limit info.
    pub fn info(&self) -> RateLimitInfo {
        self.info.clone()
    }

    /// Returns true if we have any rate limit information.
    pub fn has_info(&self) -> bool {
        self.last_update.is_some()
    }

    /// Resets the rate limit information.
    pub fn reset(&mut self) {
        self.info = RateLimitInfo::default();
        self.last_update = None;
    }

    /// Returns the utilization percentage for requests.
    pub fn request_utilization(&self) -> Option<f64> {
        match (self.info.requests_limit, self.info.requests_remaining) {
            (Some(limit), Some(remaining)) if limit > 0 => {
                Some(1.0 - (remaining as f64 / limit as f64))
            }
            _ => None,
        }
    }

    /// Returns the utilization percentage for tokens.
    pub fn token_utilization(&self) -> Option<f64> {
        match (self.info.tokens_limit, self.info.tokens_remaining) {
            (Some(limit), Some(remaining)) if limit > 0 => {
                Some(1.0 - (remaining as f64 / limit as f64))
            }
            _ => None,
        }
    }
}

impl Default for RateLimitManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Parses reset time from header value.
///
/// Supports formats like "1s", "100ms", "1m", or just seconds as a number.
fn parse_reset_time(value: &str) -> Option<Duration> {
    let value = value.trim();

    // Try parsing as seconds first
    if let Ok(secs) = value.parse::<f64>() {
        return Some(Duration::from_secs_f64(secs));
    }

    // Try parsing with suffix
    if value.ends_with("ms") {
        if let Ok(ms) = value.trim_end_matches("ms").parse::<u64>() {
            return Some(Duration::from_millis(ms));
        }
    } else if value.ends_with('s') {
        if let Ok(secs) = value.trim_end_matches('s').parse::<f64>() {
            return Some(Duration::from_secs_f64(secs));
        }
    } else if value.ends_with('m') {
        if let Ok(mins) = value.trim_end_matches('m').parse::<u64>() {
            return Some(Duration::from_secs(mins * 60));
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_update_from_headers() {
        let mut manager = RateLimitManager::new();

        let mut headers = HashMap::new();
        headers.insert("x-ratelimit-limit-requests".to_string(), "1000".to_string());
        headers.insert(
            "x-ratelimit-remaining-requests".to_string(),
            "999".to_string(),
        );
        headers.insert("x-ratelimit-reset-requests".to_string(), "1s".to_string());
        headers.insert("x-ratelimit-limit-tokens".to_string(), "100000".to_string());
        headers.insert(
            "x-ratelimit-remaining-tokens".to_string(),
            "99000".to_string(),
        );

        manager.update_from_headers(&headers);

        assert_eq!(manager.info.requests_limit, Some(1000));
        assert_eq!(manager.info.requests_remaining, Some(999));
        assert_eq!(manager.info.tokens_limit, Some(100000));
        assert_eq!(manager.info.tokens_remaining, Some(99000));
    }

    #[test]
    fn test_should_wait_no_throttle() {
        let mut manager = RateLimitManager::new();

        let mut headers = HashMap::new();
        headers.insert("x-ratelimit-limit-requests".to_string(), "1000".to_string());
        headers.insert(
            "x-ratelimit-remaining-requests".to_string(),
            "500".to_string(), // 50% remaining, above 10% threshold
        );

        manager.update_from_headers(&headers);

        assert!(manager.should_wait().is_none());
    }

    #[test]
    fn test_should_wait_throttle() {
        let mut manager = RateLimitManager::new();

        let mut headers = HashMap::new();
        headers.insert("x-ratelimit-limit-requests".to_string(), "1000".to_string());
        headers.insert(
            "x-ratelimit-remaining-requests".to_string(),
            "50".to_string(), // 5% remaining, below 10% threshold
        );
        headers.insert("x-ratelimit-reset-requests".to_string(), "60s".to_string());

        manager.update_from_headers(&headers);

        let wait = manager.should_wait();
        assert!(wait.is_some());
        assert!(wait.unwrap().as_secs() <= 60);
    }

    #[test]
    fn test_utilization() {
        let mut manager = RateLimitManager::new();

        let mut headers = HashMap::new();
        headers.insert("x-ratelimit-limit-requests".to_string(), "1000".to_string());
        headers.insert(
            "x-ratelimit-remaining-requests".to_string(),
            "300".to_string(),
        );

        manager.update_from_headers(&headers);

        let utilization = manager.request_utilization().unwrap();
        assert!((utilization - 0.7).abs() < 0.001);
    }

    #[test]
    fn test_parse_reset_time() {
        assert_eq!(parse_reset_time("60"), Some(Duration::from_secs(60)));
        assert_eq!(parse_reset_time("1.5"), Some(Duration::from_secs_f64(1.5)));
        assert_eq!(parse_reset_time("100ms"), Some(Duration::from_millis(100)));
        assert_eq!(parse_reset_time("30s"), Some(Duration::from_secs(30)));
        assert_eq!(parse_reset_time("2m"), Some(Duration::from_secs(120)));
        assert!(parse_reset_time("invalid").is_none());
    }
}
