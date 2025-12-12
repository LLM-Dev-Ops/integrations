//! Result type and extension methods for SES operations.
//!
//! This module provides a type alias for SES operations and useful extension
//! methods for working with SES results. It includes:
//!
//! - [`SesResult<T>`]: Type alias for `Result<T, SesError>`
//! - Extension methods for retry logic
//! - Extension methods for handling common error cases
//!
//! # Examples
//!
//! ```rust
//! use integrations_aws_ses::error::{SesResult, SesResultExt};
//!
//! async fn send_email() -> SesResult<String> {
//!     // ... email sending logic
//!     Ok("message-id".to_string())
//! }
//!
//! # async fn example() -> SesResult<()> {
//! let result = send_email()
//!     .await
//!     .map_not_found("default-message-id".to_string())?;
//! # Ok(())
//! # }
//! ```

use super::SesError;
use std::time::Duration;

/// Result type alias for SES operations.
///
/// This is a convenience type alias that represents the result of SES operations.
/// It is equivalent to `Result<T, SesError>`.
///
/// # Examples
///
/// ```rust
/// use integrations_aws_ses::error::SesResult;
///
/// fn validate_email(email: &str) -> SesResult<()> {
///     if email.contains('@') {
///         Ok(())
///     } else {
///         Err(integrations_aws_ses::error::SesError::Validation {
///             message: "Invalid email address".to_string(),
///             field: Some("email".to_string()),
///         })
///     }
/// }
/// ```
pub type SesResult<T> = Result<T, SesError>;

/// Extension methods for [`SesResult`].
///
/// This trait provides additional methods for working with SES results,
/// including retry logic and common error handling patterns.
pub trait SesResultExt<T> {
    /// Map a not found error to a default value.
    ///
    /// This method is useful when a resource not being found is not an error
    /// condition, but should instead return a default value.
    ///
    /// # Arguments
    ///
    /// * `default` - The default value to return if a not found error occurs
    ///
    /// # Returns
    ///
    /// The original result if successful, or the default value if a not found
    /// error occurred. Other errors are propagated.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::error::{SesResult, SesResultExt, SesError};
    ///
    /// fn get_template_name() -> SesResult<String> {
    ///     Err(SesError::TemplateNotFound {
    ///         name: "welcome".to_string(),
    ///     })
    /// }
    ///
    /// # fn example() -> SesResult<()> {
    /// let template = get_template_name().map_not_found("default".to_string())?;
    /// assert_eq!(template, "default");
    /// # Ok(())
    /// # }
    /// ```
    fn map_not_found(self, default: T) -> SesResult<T>;

    /// Check if the error is retryable.
    ///
    /// Returns `true` if the result is an error and the error is retryable,
    /// `false` otherwise.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::error::{SesResult, SesResultExt, SesError};
    ///
    /// let result: SesResult<()> = Err(SesError::RateLimited {
    ///     message: "Throttled".to_string(),
    ///     retry_after: None,
    /// });
    ///
    /// assert!(result.is_retryable());
    /// ```
    fn is_retryable(&self) -> bool;

    /// Get the retry delay if the error suggests one.
    ///
    /// Returns `Some(Duration)` if the error is retryable and suggests a
    /// specific retry delay, `None` otherwise.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::error::{SesResult, SesResultExt, SesError};
    /// use std::time::Duration;
    ///
    /// let result: SesResult<()> = Err(SesError::RateLimited {
    ///     message: "Throttled".to_string(),
    ///     retry_after: Some(Duration::from_secs(60)),
    /// });
    ///
    /// assert_eq!(result.retry_delay(), Some(Duration::from_secs(60)));
    /// ```
    fn retry_delay(&self) -> Option<Duration>;

    /// Map configuration errors to include additional context.
    ///
    /// This method allows adding context to configuration errors while
    /// preserving the original error information.
    ///
    /// # Arguments
    ///
    /// * `context` - Additional context to add to configuration errors
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::error::{SesResult, SesResultExt, SesError};
    ///
    /// fn load_config() -> SesResult<()> {
    ///     Err(SesError::Configuration {
    ///         message: "Missing region".to_string(),
    ///         source: None,
    ///     })
    /// }
    ///
    /// # fn example() -> SesResult<()> {
    /// let result = load_config().with_config_context("Failed to initialize SES client");
    /// # Ok(())
    /// # }
    /// ```
    fn with_config_context(self, context: &str) -> SesResult<T>;
}

impl<T> SesResultExt<T> for SesResult<T> {
    fn map_not_found(self, default: T) -> SesResult<T> {
        match self {
            Ok(value) => Ok(value),
            Err(error) => match error {
                SesError::TemplateNotFound { .. }
                | SesError::ConfigurationSetNotFound { .. }
                | SesError::ContactListNotFound { .. } => Ok(default),
                SesError::AwsApi { code, .. } if code == "NotFoundException" => Ok(default),
                other => Err(other),
            },
        }
    }

    fn is_retryable(&self) -> bool {
        match self {
            Ok(_) => false,
            Err(error) => error.is_retryable(),
        }
    }

    fn retry_delay(&self) -> Option<Duration> {
        match self {
            Ok(_) => None,
            Err(error) => error.retry_after(),
        }
    }

    fn with_config_context(self, context: &str) -> SesResult<T> {
        self.map_err(|error| match error {
            SesError::Configuration { message, source } => SesError::Configuration {
                message: format!("{}: {}", context, message),
                source,
            },
            other => other,
        })
    }
}

/// Retry helper for executing operations with automatic retry logic.
///
/// This function executes an async operation with exponential backoff retry logic.
/// It respects the retry hints provided by SES errors and implements a maximum
/// retry limit.
///
/// # Arguments
///
/// * `max_attempts` - Maximum number of retry attempts
/// * `initial_delay` - Initial delay between retries
/// * `max_delay` - Maximum delay between retries
/// * `operation` - The async operation to execute
///
/// # Returns
///
/// The result of the operation, or the last error if all retries are exhausted.
///
/// # Examples
///
/// ```rust
/// use integrations_aws_ses::error::{SesResult, retry_with_backoff};
/// use std::time::Duration;
///
/// # async fn example() -> SesResult<String> {
/// let result = retry_with_backoff(
///     3,
///     Duration::from_millis(100),
///     Duration::from_secs(10),
///     || async {
///         // Your operation here
///         Ok("success".to_string())
///     }
/// ).await?;
/// # Ok(result)
/// # }
/// ```
pub async fn retry_with_backoff<F, Fut, T>(
    max_attempts: u32,
    initial_delay: Duration,
    max_delay: Duration,
    mut operation: F,
) -> SesResult<T>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = SesResult<T>>,
{
    let mut attempt = 0;
    let mut delay = initial_delay;

    loop {
        attempt += 1;

        match operation().await {
            Ok(result) => return Ok(result),
            Err(error) => {
                // If error is not retryable or we've exhausted attempts, return the error
                if !error.is_retryable() || attempt >= max_attempts {
                    return Err(error);
                }

                // Calculate delay: use error's suggested delay or exponential backoff
                let retry_delay = error
                    .retry_after()
                    .unwrap_or_else(|| std::cmp::min(delay, max_delay));

                // Wait before retrying
                tokio::time::sleep(retry_delay).await;

                // Exponential backoff for next iteration
                delay = std::cmp::min(delay * 2, max_delay);
            }
        }
    }
}

/// Retry helper with exponential backoff and jitter.
///
/// This function is similar to [`retry_with_backoff`] but adds random jitter
/// to the delay to prevent thundering herd problems when multiple clients
/// retry simultaneously.
///
/// # Arguments
///
/// * `max_attempts` - Maximum number of retry attempts
/// * `initial_delay` - Initial delay between retries
/// * `max_delay` - Maximum delay between retries
/// * `operation` - The async operation to execute
///
/// # Returns
///
/// The result of the operation, or the last error if all retries are exhausted.
///
/// # Examples
///
/// ```rust
/// use integrations_aws_ses::error::{SesResult, retry_with_jitter};
/// use std::time::Duration;
///
/// # async fn example() -> SesResult<String> {
/// let result = retry_with_jitter(
///     5,
///     Duration::from_millis(100),
///     Duration::from_secs(30),
///     || async {
///         // Your operation here
///         Ok("success".to_string())
///     }
/// ).await?;
/// # Ok(result)
/// # }
/// ```
pub async fn retry_with_jitter<F, Fut, T>(
    max_attempts: u32,
    initial_delay: Duration,
    max_delay: Duration,
    mut operation: F,
) -> SesResult<T>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = SesResult<T>>,
{
    use rand::Rng;
    let mut attempt = 0;
    let mut delay = initial_delay;

    loop {
        attempt += 1;

        match operation().await {
            Ok(result) => return Ok(result),
            Err(error) => {
                // If error is not retryable or we've exhausted attempts, return the error
                if !error.is_retryable() || attempt >= max_attempts {
                    return Err(error);
                }

                // Calculate delay with jitter: use error's suggested delay or exponential backoff
                let base_delay = error
                    .retry_after()
                    .unwrap_or_else(|| std::cmp::min(delay, max_delay));

                // Add jitter: +/- 25%
                let jitter_factor = rand::thread_rng().gen_range(0.75..=1.25);
                let jittered_delay =
                    Duration::from_millis((base_delay.as_millis() as f64 * jitter_factor) as u64);

                // Wait before retrying
                tokio::time::sleep(jittered_delay).await;

                // Exponential backoff for next iteration
                delay = std::cmp::min(delay * 2, max_delay);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_not_found_with_template_error() {
        let result: SesResult<String> = Err(SesError::TemplateNotFound {
            name: "welcome".to_string(),
        });

        let mapped = result.map_not_found("default".to_string()).unwrap();
        assert_eq!(mapped, "default");
    }

    #[test]
    fn test_map_not_found_with_config_set_error() {
        let result: SesResult<String> = Err(SesError::ConfigurationSetNotFound {
            name: "my-config".to_string(),
        });

        let mapped = result.map_not_found("default".to_string()).unwrap();
        assert_eq!(mapped, "default");
    }

    #[test]
    fn test_map_not_found_with_contact_list_error() {
        let result: SesResult<String> = Err(SesError::ContactListNotFound {
            name: "subscribers".to_string(),
        });

        let mapped = result.map_not_found("default".to_string()).unwrap();
        assert_eq!(mapped, "default");
    }

    #[test]
    fn test_map_not_found_with_aws_not_found_error() {
        let result: SesResult<String> = Err(SesError::AwsApi {
            code: "NotFoundException".to_string(),
            message: "Not found".to_string(),
            request_id: None,
            retryable: false,
        });

        let mapped = result.map_not_found("default".to_string()).unwrap();
        assert_eq!(mapped, "default");
    }

    #[test]
    fn test_map_not_found_with_success() {
        let result: SesResult<String> = Ok("success".to_string());
        let mapped = result.map_not_found("default".to_string()).unwrap();
        assert_eq!(mapped, "success");
    }

    #[test]
    fn test_map_not_found_with_other_error() {
        let result: SesResult<String> = Err(SesError::Validation {
            message: "Invalid".to_string(),
            field: None,
        });

        assert!(result.map_not_found("default".to_string()).is_err());
    }

    #[test]
    fn test_is_retryable_with_retryable_error() {
        let result: SesResult<()> = Err(SesError::RateLimited {
            message: "Throttled".to_string(),
            retry_after: None,
        });

        assert!(result.is_retryable());
    }

    #[test]
    fn test_is_retryable_with_non_retryable_error() {
        let result: SesResult<()> = Err(SesError::Validation {
            message: "Invalid".to_string(),
            field: None,
        });

        assert!(!result.is_retryable());
    }

    #[test]
    fn test_is_retryable_with_success() {
        let result: SesResult<()> = Ok(());
        assert!(!result.is_retryable());
    }

    #[test]
    fn test_retry_delay_with_rate_limited() {
        let result: SesResult<()> = Err(SesError::RateLimited {
            message: "Throttled".to_string(),
            retry_after: Some(Duration::from_secs(30)),
        });

        assert_eq!(result.retry_delay(), Some(Duration::from_secs(30)));
    }

    #[test]
    fn test_retry_delay_with_no_delay() {
        let result: SesResult<()> = Err(SesError::Transport {
            message: "Connection failed".to_string(),
            source: None,
            retryable: true,
        });

        assert_eq!(result.retry_delay(), None);
    }

    #[test]
    fn test_retry_delay_with_success() {
        let result: SesResult<()> = Ok(());
        assert_eq!(result.retry_delay(), None);
    }

    #[test]
    fn test_with_config_context() {
        let result: SesResult<()> = Err(SesError::Configuration {
            message: "Missing region".to_string(),
            source: None,
        });

        let updated = result.with_config_context("Failed to initialize");

        match updated {
            Err(SesError::Configuration { message, .. }) => {
                assert_eq!(message, "Failed to initialize: Missing region");
            }
            _ => panic!("Expected Configuration error"),
        }
    }

    #[test]
    fn test_with_config_context_non_config_error() {
        let result: SesResult<()> = Err(SesError::Validation {
            message: "Invalid".to_string(),
            field: None,
        });

        let updated = result.with_config_context("Context");

        match updated {
            Err(SesError::Validation { message, .. }) => {
                assert_eq!(message, "Invalid");
            }
            _ => panic!("Expected Validation error"),
        }
    }

    #[tokio::test]
    async fn test_retry_with_backoff_success_first_try() {
        let mut call_count = 0;

        let result = retry_with_backoff(
            3,
            Duration::from_millis(10),
            Duration::from_millis(100),
            || async {
                call_count += 1;
                Ok::<_, SesError>("success")
            },
        )
        .await;

        assert_eq!(result.unwrap(), "success");
        assert_eq!(call_count, 1);
    }

    #[tokio::test]
    async fn test_retry_with_backoff_success_after_retry() {
        let mut call_count = 0;

        let result = retry_with_backoff(
            3,
            Duration::from_millis(10),
            Duration::from_millis(100),
            || async {
                call_count += 1;
                if call_count < 2 {
                    Err(SesError::Transport {
                        message: "Connection failed".to_string(),
                        source: None,
                        retryable: true,
                    })
                } else {
                    Ok::<_, SesError>("success")
                }
            },
        )
        .await;

        assert_eq!(result.unwrap(), "success");
        assert_eq!(call_count, 2);
    }

    #[tokio::test]
    async fn test_retry_with_backoff_non_retryable_error() {
        let mut call_count = 0;

        let result = retry_with_backoff(
            3,
            Duration::from_millis(10),
            Duration::from_millis(100),
            || async {
                call_count += 1;
                Err::<String, _>(SesError::Validation {
                    message: "Invalid".to_string(),
                    field: None,
                })
            },
        )
        .await;

        assert!(result.is_err());
        assert_eq!(call_count, 1); // Should not retry non-retryable errors
    }

    #[tokio::test]
    async fn test_retry_with_backoff_max_attempts_exhausted() {
        let mut call_count = 0;

        let result = retry_with_backoff(
            3,
            Duration::from_millis(10),
            Duration::from_millis(100),
            || async {
                call_count += 1;
                Err::<String, _>(SesError::Transport {
                    message: "Connection failed".to_string(),
                    source: None,
                    retryable: true,
                })
            },
        )
        .await;

        assert!(result.is_err());
        assert_eq!(call_count, 3); // Should try exactly max_attempts times
    }

    #[tokio::test]
    async fn test_retry_with_jitter_success() {
        let mut call_count = 0;

        let result = retry_with_jitter(
            3,
            Duration::from_millis(10),
            Duration::from_millis(100),
            || async {
                call_count += 1;
                if call_count < 2 {
                    Err(SesError::RateLimited {
                        message: "Throttled".to_string(),
                        retry_after: Some(Duration::from_millis(20)),
                    })
                } else {
                    Ok::<_, SesError>("success")
                }
            },
        )
        .await;

        assert_eq!(result.unwrap(), "success");
        assert_eq!(call_count, 2);
    }

    #[tokio::test]
    async fn test_retry_with_jitter_respects_error_delay() {
        let mut call_count = 0;
        let start = std::time::Instant::now();

        let result = retry_with_jitter(
            2,
            Duration::from_millis(10),
            Duration::from_millis(1000),
            || async {
                call_count += 1;
                if call_count < 2 {
                    Err(SesError::RateLimited {
                        message: "Throttled".to_string(),
                        retry_after: Some(Duration::from_millis(50)),
                    })
                } else {
                    Ok::<_, SesError>("success")
                }
            },
        )
        .await;

        let elapsed = start.elapsed();

        assert_eq!(result.unwrap(), "success");
        assert_eq!(call_count, 2);
        // The delay should be roughly 50ms with jitter (+/- 25%)
        // So minimum ~37ms, but we'll be conservative in the test
        assert!(elapsed >= Duration::from_millis(30));
    }
}
