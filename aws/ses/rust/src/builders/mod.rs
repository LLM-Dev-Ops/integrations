//! Builders for constructing AWS SES v2 requests.
//!
//! This module provides fluent builder APIs for constructing various AWS SES v2 requests,
//! making it easier to build complex email sending operations with proper validation.
//!
//! # Builders
//!
//! - [`EmailBuilder`] - For constructing individual email send requests
//! - [`TemplateBuilder`] - For creating email templates
//! - [`BulkEmailBuilder`] - For bulk email sending operations
//!
//! # Examples
//!
//! ## Sending a simple email
//!
//! ```rust
//! use integrations_aws_ses::builders::EmailBuilder;
//!
//! let request = EmailBuilder::new()
//!     .from("sender@example.com")
//!     .to("recipient@example.com")
//!     .subject("Hello World")
//!     .text("This is a plain text email")
//!     .html("<p>This is an HTML email</p>")
//!     .build()?;
//! # Ok::<(), integrations_aws_ses::builders::BuilderError>(())
//! ```
//!
//! ## Creating an email template
//!
//! ```rust
//! use integrations_aws_ses::builders::TemplateBuilder;
//!
//! let request = TemplateBuilder::new()
//!     .name("welcome-email")
//!     .subject("Welcome {{name}}!")
//!     .html("<h1>Welcome {{name}}</h1><p>Thanks for joining!</p>")
//!     .text("Welcome {{name}}! Thanks for joining!")
//!     .build()?;
//! # Ok::<(), integrations_aws_ses::builders::BuilderError>(())
//! ```
//!
//! ## Sending bulk emails
//!
//! ```rust
//! use integrations_aws_ses::builders::BulkEmailBuilder;
//! use integrations_aws_ses::types::{Destination, BulkEmailEntry};
//!
//! let dest1 = Destination::new().add_to("user1@example.com");
//! let entry1 = BulkEmailEntry::new(dest1);
//!
//! let dest2 = Destination::new().add_to("user2@example.com");
//! let entry2 = BulkEmailEntry::new(dest2);
//!
//! let request = BulkEmailBuilder::new()
//!     .from("sender@example.com")
//!     .default_template("newsletter")
//!     .add_recipient(entry1)
//!     .add_recipient(entry2)
//!     .build()?;
//! # Ok::<(), integrations_aws_ses::builders::BuilderError>(())
//! ```

mod email_builder;
mod template_builder;
mod bulk_builder;

pub use email_builder::EmailBuilder;
pub use template_builder::TemplateBuilder;
pub use bulk_builder::BulkEmailBuilder;

use thiserror::Error;

/// Error type for builder operations.
///
/// This error is returned when a builder's `build()` method is called
/// but the builder is in an invalid state (e.g., missing required fields
/// or invalid field values).
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum BuilderError {
    /// A required field is missing.
    ///
    /// This error indicates that a mandatory field was not set before
    /// calling `build()`.
    #[error("Missing required field: {field}")]
    MissingField {
        /// The name of the missing field.
        field: String,
    },

    /// A field has an invalid value.
    ///
    /// This error indicates that a field was set to a value that fails
    /// validation (e.g., empty email address, invalid template syntax).
    #[error("Invalid value for field '{field}': {message}")]
    InvalidValue {
        /// The name of the field with the invalid value.
        field: String,
        /// Description of why the value is invalid.
        message: String,
    },
}

impl BuilderError {
    /// Create a new missing field error.
    pub fn missing_field(field: impl Into<String>) -> Self {
        Self::MissingField {
            field: field.into(),
        }
    }

    /// Create a new invalid value error.
    pub fn invalid_value(field: impl Into<String>, message: impl Into<String>) -> Self {
        Self::InvalidValue {
            field: field.into(),
            message: message.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_builder_error_missing_field() {
        let error = BuilderError::missing_field("from");
        assert_eq!(error.to_string(), "Missing required field: from");

        if let BuilderError::MissingField { field } = error {
            assert_eq!(field, "from");
        } else {
            panic!("Expected MissingField variant");
        }
    }

    #[test]
    fn test_builder_error_invalid_value() {
        let error = BuilderError::invalid_value("email", "Invalid email format");
        assert_eq!(error.to_string(), "Invalid value for field 'email': Invalid email format");

        if let BuilderError::InvalidValue { field, message } = error {
            assert_eq!(field, "email");
            assert_eq!(message, "Invalid email format");
        } else {
            panic!("Expected InvalidValue variant");
        }
    }

    #[test]
    fn test_builder_error_equality() {
        let error1 = BuilderError::missing_field("subject");
        let error2 = BuilderError::missing_field("subject");
        let error3 = BuilderError::missing_field("body");

        assert_eq!(error1, error2);
        assert_ne!(error1, error3);
    }
}
