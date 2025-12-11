//! Retry configuration and backoff strategies for the SES client.

use std::time::Duration;
use rand::Rng;

use crate::error::SesError;

/// Configuration for retry behavior.
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retry attempts.
    pub max_attempts: u32,

    /// Initial backoff duration before the first retry.
    pub initial_backoff: Duration,

    /// Maximum backoff duration between retries.
    pub max_backoff: Duration,

    /// Multiplier for exponential backoff.
    pub backoff_multiplier: f64,

    /// Whether to add jitter to backoff delays.
    pub jitter: bool,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            initial_backoff: Duration::from_millis(100),
            max_backoff: Duration::from_secs(20),
            backoff_multiplier: 2.0,
            jitter: true,
        }
    }
}

impl RetryConfig {
    /// Calculate the delay duration for a given retry attempt.
    ///
    /// # Arguments
    ///
    /// * `attempt` - The current retry attempt number (0-indexed).
    ///
    /// # Returns
    ///
    /// The duration to wait before retrying.
    ///
    /// # Example
    ///
    /// ```
    /// use std::time::Duration;
    /// use aws_ses_rust::config::RetryConfig;
    ///
    /// let config = RetryConfig::default();
    /// let delay = config.calculate_delay(0);
    /// assert!(delay >= Duration::from_millis(100));
    /// ```
    pub fn calculate_delay(&self, attempt: u32) -> Duration {
        // Calculate exponential backoff
        let backoff_millis = self.initial_backoff.as_millis() as f64
            * self.backoff_multiplier.powi(attempt as i32);

        let backoff = Duration::from_millis(backoff_millis as u64);

        // Cap at max_backoff
        let capped_backoff = if backoff > self.max_backoff {
            self.max_backoff
        } else {
            backoff
        };

        // Add jitter if enabled
        if self.jitter {
            let jitter_millis = capped_backoff.as_millis() as f64;
            let mut rng = rand::thread_rng();
            let jittered = rng.gen_range(0.0..jitter_millis);
            Duration::from_millis(jittered as u64)
        } else {
            capped_backoff
        }
    }

    /// Determine if an error should be retried.
    ///
    /// # Arguments
    ///
    /// * `attempt` - The current retry attempt number (0-indexed).
    /// * `error` - The error that occurred.
    ///
    /// # Returns
    ///
    /// `true` if the operation should be retried, `false` otherwise.
    ///
    /// # Example
    ///
    /// ```
    /// use aws_ses_rust::config::RetryConfig;
    /// use aws_ses_rust::error::SesError;
    ///
    /// let config = RetryConfig::default();
    /// let error = SesError::ServiceError {
    ///     code: "Throttling".to_string(),
    ///     message: "Rate exceeded".to_string(),
    /// };
    ///
    /// assert!(config.should_retry(0, &error));
    /// assert!(config.should_retry(1, &error));
    /// assert!(!config.should_retry(3, &error)); // Exceeds max_attempts
    /// ```
    pub fn should_retry(&self, attempt: u32, error: &SesError) -> bool {
        // Check if we've exceeded max attempts
        if attempt >= self.max_attempts {
            return false;
        }

        // Check if the error is retryable
        error.is_retryable()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_retry_config() {
        let config = RetryConfig::default();
        assert_eq!(config.max_attempts, 3);
        assert_eq!(config.initial_backoff, Duration::from_millis(100));
        assert_eq!(config.max_backoff, Duration::from_secs(20));
        assert_eq!(config.backoff_multiplier, 2.0);
        assert!(config.jitter);
    }

    #[test]
    fn test_calculate_delay_without_jitter() {
        let config = RetryConfig {
            max_attempts: 3,
            initial_backoff: Duration::from_millis(100),
            max_backoff: Duration::from_secs(20),
            backoff_multiplier: 2.0,
            jitter: false,
        };

        assert_eq!(config.calculate_delay(0), Duration::from_millis(100));
        assert_eq!(config.calculate_delay(1), Duration::from_millis(200));
        assert_eq!(config.calculate_delay(2), Duration::from_millis(400));
    }

    #[test]
    fn test_calculate_delay_with_max_backoff() {
        let config = RetryConfig {
            max_attempts: 10,
            initial_backoff: Duration::from_millis(100),
            max_backoff: Duration::from_millis(500),
            backoff_multiplier: 2.0,
            jitter: false,
        };

        // Attempt 5 would normally be 100 * 2^5 = 3200ms, but capped at 500ms
        assert_eq!(config.calculate_delay(5), Duration::from_millis(500));
    }

    #[test]
    fn test_calculate_delay_with_jitter() {
        let config = RetryConfig::default();

        let delay1 = config.calculate_delay(0);
        let delay2 = config.calculate_delay(0);

        // Both should be within the expected range
        assert!(delay1 <= Duration::from_millis(100));
        assert!(delay2 <= Duration::from_millis(100));
    }

    #[test]
    fn test_should_retry_with_retryable_error() {
        let config = RetryConfig::default();
        let error = SesError::ServiceError {
            code: "Throttling".to_string(),
            message: "Rate exceeded".to_string(),
        };

        assert!(config.should_retry(0, &error));
        assert!(config.should_retry(1, &error));
        assert!(config.should_retry(2, &error));
        assert!(!config.should_retry(3, &error));
    }

    #[test]
    fn test_should_retry_with_non_retryable_error() {
        let config = RetryConfig::default();
        let error = SesError::ValidationError {
            message: "Invalid email".to_string(),
        };

        assert!(!config.should_retry(0, &error));
    }
}
