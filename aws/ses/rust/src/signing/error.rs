//! Signing error types for AWS SES.
//!
//! This module defines error types specific to AWS Signature V4 signing operations.
//! These errors are used throughout the signing process to provide detailed error information.

use thiserror::Error;

/// Errors that can occur during AWS Signature V4 signing.
#[derive(Debug, Error)]
pub enum SigningError {
    /// A required header was missing from the request.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_aws_ses::signing::SigningError;
    ///
    /// let error = SigningError::MissingHeader {
    ///     header: "host".to_string(),
    /// };
    /// assert_eq!(error.to_string(), "Missing required header: host");
    /// ```
    #[error("Missing required header: {header}")]
    MissingHeader {
        /// The name of the missing header.
        header: String,
    },

    /// The URL provided for signing was invalid.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_aws_ses::signing::SigningError;
    ///
    /// let error = SigningError::InvalidUrl {
    ///     message: "Missing host".to_string(),
    /// };
    /// assert_eq!(error.to_string(), "Invalid URL: Missing host");
    /// ```
    #[error("Invalid URL: {message}")]
    InvalidUrl {
        /// Details about what makes the URL invalid.
        message: String,
    },

    /// The timestamp provided for signing was invalid.
    ///
    /// This can occur if:
    /// - The timestamp is too far in the past or future
    /// - The timestamp format is incorrect
    /// - The presigned URL expiration exceeds maximum allowed
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_aws_ses::signing::SigningError;
    ///
    /// let error = SigningError::InvalidTimestamp {
    ///     message: "Presigned URL expiration exceeds maximum of 604800 seconds".to_string(),
    /// };
    /// ```
    #[error("Invalid timestamp: {message}")]
    InvalidTimestamp {
        /// Details about the timestamp error.
        message: String,
    },

    /// The signing operation failed.
    ///
    /// This is a catch-all error for signing failures that don't fit
    /// into the more specific error categories.
    ///
    /// # Examples
    ///
    /// ```
    /// use integrations_aws_ses::signing::SigningError;
    ///
    /// let error = SigningError::SigningFailed {
    ///     message: "Unable to calculate signature".to_string(),
    /// };
    /// assert_eq!(error.to_string(), "Signing failed: Unable to calculate signature");
    /// ```
    #[error("Signing failed: {message}")]
    SigningFailed {
        /// Details about the signing failure.
        message: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_missing_header_error() {
        let error = SigningError::MissingHeader {
            header: "x-amz-date".to_string(),
        };
        assert_eq!(error.to_string(), "Missing required header: x-amz-date");
    }

    #[test]
    fn test_invalid_url_error() {
        let error = SigningError::InvalidUrl {
            message: "Host not specified".to_string(),
        };
        assert_eq!(error.to_string(), "Invalid URL: Host not specified");
    }

    #[test]
    fn test_invalid_timestamp_error() {
        let error = SigningError::InvalidTimestamp {
            message: "Timestamp too old".to_string(),
        };
        assert_eq!(error.to_string(), "Invalid timestamp: Timestamp too old");
    }

    #[test]
    fn test_signing_failed_error() {
        let error = SigningError::SigningFailed {
            message: "HMAC calculation failed".to_string(),
        };
        assert_eq!(
            error.to_string(),
            "Signing failed: HMAC calculation failed"
        );
    }

    #[test]
    fn test_error_is_send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<SigningError>();
    }
}
