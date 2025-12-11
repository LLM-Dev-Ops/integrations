//! Configuration error types for the SES client.

use thiserror::Error;

/// Errors that can occur during configuration.
#[derive(Debug, Error)]
pub enum ConfigError {
    /// A required configuration field is missing.
    #[error("Missing required configuration: {field}")]
    MissingField {
        /// The name of the missing field.
        field: String,
    },

    /// Invalid configuration value or combination.
    #[error("Invalid configuration: {message}")]
    Invalid {
        /// Description of the configuration issue.
        message: String,
    },

    /// Error reading from environment variables.
    #[error("Environment error: {message}")]
    Environment {
        /// Description of the environment error.
        message: String,
    },
}
