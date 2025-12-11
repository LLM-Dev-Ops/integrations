//! Credential error types for AWS SES.

use thiserror::Error;

/// Errors that can occur during credential operations.
#[derive(Debug, Error)]
pub enum CredentialError {
    /// Required credentials are missing.
    #[error("Missing credentials: {message}")]
    Missing {
        /// Details about which credentials are missing.
        message: String,
    },

    /// Credentials are invalid or malformed.
    #[error("Invalid credentials: {message}")]
    Invalid {
        /// Details about why the credentials are invalid.
        message: String,
    },

    /// Credentials have expired.
    #[error("Expired credentials")]
    Expired,

    /// Failed to load credentials from a source.
    #[error("Failed to load credentials from {source}: {message}")]
    LoadFailed {
        /// The credential source that failed.
        source: String,
        /// Details about the failure.
        message: String,
    },

    /// IMDS (Instance Metadata Service) error.
    #[error("IMDS error: {message}")]
    ImdsError {
        /// Details about the IMDS error.
        message: String,
    },

    /// Profile configuration error.
    #[error("Profile error: {message}")]
    ProfileError {
        /// Details about the profile error.
        message: String,
    },
}
