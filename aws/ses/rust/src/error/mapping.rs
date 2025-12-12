//! AWS error response mapping for SES v2 API.
//!
//! This module handles the parsing and mapping of AWS error responses to
//! appropriate [`SesError`] variants. It provides functionality to:
//!
//! - Parse AWS error responses from JSON bodies
//! - Map AWS error codes to specific SesError variants
//! - Determine retryability based on error type and HTTP status
//! - Extract request IDs for debugging
//!
//! # Error Response Format
//!
//! AWS SES v2 returns errors in the following JSON format:
//!
//! ```json
//! {
//!   "__type": "MessageRejected",
//!   "message": "Email address is not verified",
//!   "requestId": "abc-123-def-456"
//! }
//! ```
//!
//! # Examples
//!
//! ```rust
//! use integrations_aws_ses::error::{map_aws_error, parse_error_response};
//!
//! # async fn example() -> Result<(), Box<dyn std::error::Error>> {
//! let error_json = r#"{"__type": "MessageRejected", "message": "Invalid email"}"#;
//! let error_response = parse_error_response(error_json)?;
//! let ses_error = map_aws_error(&error_response, 400);
//! # Ok(())
//! # }
//! ```

use super::{QuotaType, SesError};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// AWS error response structure.
///
/// This structure represents the JSON error response format returned by
/// AWS SES v2 API. The error type is typically provided in the `__type`
/// field, which may include a namespace prefix.
///
/// # Examples
///
/// ```rust
/// use integrations_aws_ses::error::AwsErrorResponse;
///
/// let error = AwsErrorResponse {
///     error_type: "MessageRejected".to_string(),
///     message: "Email address not verified".to_string(),
///     request_id: Some("abc-123".to_string()),
/// };
/// ```
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AwsErrorResponse {
    /// The AWS error type/code.
    ///
    /// This field may be named `__type`, `Type`, or `code` in the JSON response.
    /// It may include a namespace prefix (e.g., "com.amazon.coral.service#MessageRejected")
    /// which is automatically stripped.
    #[serde(alias = "__type", alias = "Type", alias = "code")]
    pub error_type: String,

    /// Human-readable error message.
    ///
    /// This field may be named `message` or `Message` in the JSON response.
    #[serde(alias = "Message")]
    pub message: String,

    /// AWS request ID for debugging and support.
    ///
    /// This field may be named `requestId` or `RequestId` in the JSON response.
    #[serde(
        alias = "requestId",
        alias = "RequestId",
        skip_serializing_if = "Option::is_none"
    )]
    pub request_id: Option<String>,
}

/// Parse an AWS error response from a JSON string.
///
/// This function parses the error response body returned by AWS SES v2.
/// It handles various field name formats and strips namespace prefixes
/// from error types.
///
/// # Arguments
///
/// * `body` - The JSON error response body as a string
///
/// # Returns
///
/// Returns the parsed [`AwsErrorResponse`] or a serialization error.
///
/// # Examples
///
/// ```rust
/// use integrations_aws_ses::error::parse_error_response;
///
/// # fn example() -> Result<(), Box<dyn std::error::Error>> {
/// let json = r#"{"__type": "ValidationException", "message": "Invalid parameter"}"#;
/// let error = parse_error_response(json)?;
/// assert_eq!(error.error_type, "ValidationException");
/// # Ok(())
/// # }
/// ```
///
/// # Errors
///
/// Returns [`SesError::Serialization`] if the JSON cannot be parsed.
pub fn parse_error_response(body: &str) -> Result<AwsErrorResponse, SesError> {
    let mut response: AwsErrorResponse = serde_json::from_str(body)?;

    // Strip namespace prefix from error type if present
    // Example: "com.amazon.coral.service#MessageRejected" -> "MessageRejected"
    if let Some(hash_pos) = response.error_type.rfind('#') {
        response.error_type = response.error_type[hash_pos + 1..].to_string();
    }

    Ok(response)
}

/// Map an AWS error response to a specific [`SesError`] variant.
///
/// This function examines the AWS error code and HTTP status to determine
/// the appropriate SesError variant. It also determines retryability based
/// on error type and status code.
///
/// # Arguments
///
/// * `error` - The parsed AWS error response
/// * `status_code` - The HTTP status code
///
/// # Returns
///
/// A specific [`SesError`] variant based on the error type and status.
///
/// # Error Mapping
///
/// The following AWS error codes are mapped to specific variants:
///
/// - `Throttling`, `ThrottlingException` -> [`SesError::RateLimited`]
/// - `ValidationException` -> [`SesError::Validation`]
/// - `MessageRejected` -> [`SesError::AwsApi`] (non-retryable)
/// - `MailFromDomainNotVerifiedException` -> [`SesError::IdentityNotVerified`]
/// - `ConfigurationSetDoesNotExistException` -> [`SesError::ConfigurationSetNotFound`]
/// - `TemplateDoesNotExistException` -> [`SesError::TemplateNotFound`]
/// - `AccountSuspendedException` -> [`SesError::AccountSuspended`]
/// - `SendingPausedException` -> [`SesError::SendingPaused`]
/// - `LimitExceededException` -> [`SesError::QuotaExceeded`]
/// - `NotFoundException` -> Resource-specific not found errors
/// - `InternalFailure`, `ServiceUnavailable` -> [`SesError::AwsApi`] (retryable)
///
/// # Examples
///
/// ```rust
/// use integrations_aws_ses::error::{map_aws_error, AwsErrorResponse};
///
/// let error = AwsErrorResponse {
///     error_type: "MessageRejected".to_string(),
///     message: "Email not verified".to_string(),
///     request_id: Some("abc-123".to_string()),
/// };
///
/// let ses_error = map_aws_error(&error, 400);
/// assert!(!ses_error.is_retryable());
/// ```
pub fn map_aws_error(error: &AwsErrorResponse, status_code: u16) -> SesError {
    match error.error_type.as_str() {
        // Throttling errors
        "Throttling" | "ThrottlingException" | "TooManyRequestsException" => {
            SesError::RateLimited {
                message: error.message.clone(),
                retry_after: calculate_retry_delay(status_code),
            }
        }

        // Validation errors
        "ValidationException" | "InvalidParameterException" | "InvalidParameterValueException" => {
            SesError::Validation {
                message: error.message.clone(),
                field: extract_field_from_message(&error.message),
            }
        }

        // Message rejected (non-retryable)
        "MessageRejected" => SesError::AwsApi {
            code: error.error_type.clone(),
            message: error.message.clone(),
            request_id: error.request_id.clone(),
            retryable: false,
        },

        // Identity/domain not verified
        "MailFromDomainNotVerifiedException" | "EmailAddressNotVerifiedException" => {
            SesError::IdentityNotVerified {
                identity: extract_identity_from_message(&error.message),
            }
        }

        // Configuration set not found
        "ConfigurationSetDoesNotExistException" => SesError::ConfigurationSetNotFound {
            name: extract_resource_name_from_message(&error.message, "configuration set"),
        },

        // Template not found
        "TemplateDoesNotExistException" => SesError::TemplateNotFound {
            name: extract_resource_name_from_message(&error.message, "template"),
        },

        // Account issues
        "AccountSuspendedException" => SesError::AccountSuspended {
            message: error.message.clone(),
        },

        "SendingPausedException" => SesError::SendingPaused {
            message: error.message.clone(),
        },

        // Quota/limit errors
        "LimitExceededException" | "DailyQuotaExceededException" | "MaxSendRateExceededException" => {
            let quota_type = determine_quota_type(&error.error_type, &error.message);
            SesError::QuotaExceeded {
                message: error.message.clone(),
                quota_type,
            }
        }

        // Generic not found - map based on resource type
        "NotFoundException" | "ResourceNotFoundException" => {
            map_not_found_error(error)
        }

        // Internal/service errors (retryable)
        "InternalFailure" | "InternalServiceException" | "InternalServerException" => {
            SesError::AwsApi {
                code: error.error_type.clone(),
                message: error.message.clone(),
                request_id: error.request_id.clone(),
                retryable: true,
            }
        }

        "ServiceUnavailable" | "ServiceUnavailableException" => SesError::AwsApi {
            code: error.error_type.clone(),
            message: error.message.clone(),
            request_id: error.request_id.clone(),
            retryable: true,
        },

        // Default: map based on HTTP status code
        _ => SesError::AwsApi {
            code: error.error_type.clone(),
            message: error.message.clone(),
            request_id: error.request_id.clone(),
            retryable: is_retryable_status(status_code),
        },
    }
}

/// Map a generic NotFoundException to a specific SesError variant.
///
/// Examines the error message to determine which resource was not found.
fn map_not_found_error(error: &AwsErrorResponse) -> SesError {
    let msg_lower = error.message.to_lowercase();

    if msg_lower.contains("configuration set") || msg_lower.contains("configurationset") {
        SesError::ConfigurationSetNotFound {
            name: extract_resource_name_from_message(&error.message, "configuration set"),
        }
    } else if msg_lower.contains("template") {
        SesError::TemplateNotFound {
            name: extract_resource_name_from_message(&error.message, "template"),
        }
    } else if msg_lower.contains("contact list") || msg_lower.contains("contactlist") {
        SesError::ContactListNotFound {
            name: extract_resource_name_from_message(&error.message, "contact list"),
        }
    } else {
        // Generic not found error
        SesError::AwsApi {
            code: error.error_type.clone(),
            message: error.message.clone(),
            request_id: error.request_id.clone(),
            retryable: false,
        }
    }
}

/// Determine the quota type from the error code and message.
fn determine_quota_type(error_type: &str, message: &str) -> QuotaType {
    let msg_lower = message.to_lowercase();

    if error_type.contains("Daily") || msg_lower.contains("daily") || msg_lower.contains("24-hour") {
        QuotaType::Daily
    } else if error_type.contains("SendRate")
        || msg_lower.contains("per second")
        || msg_lower.contains("rate")
    {
        QuotaType::PerSecond
    } else if msg_lower.contains("recipient") || msg_lower.contains("too many recipients") {
        QuotaType::Recipients
    } else if msg_lower.contains("message size") || msg_lower.contains("too large") {
        QuotaType::MessageSize
    } else {
        // Default to daily quota
        QuotaType::Daily
    }
}

/// Extract field name from validation error message.
///
/// Attempts to parse field names from common AWS error message patterns.
fn extract_field_from_message(message: &str) -> Option<String> {
    // Pattern: "Invalid value for parameter 'fieldName'"
    if let Some(start) = message.find("parameter '") {
        let start = start + "parameter '".len();
        if let Some(end) = message[start..].find('\'') {
            return Some(message[start..start + end].to_string());
        }
    }

    // Pattern: "The field 'fieldName' is invalid"
    if let Some(start) = message.find("field '") {
        let start = start + "field '".len();
        if let Some(end) = message[start..].find('\'') {
            return Some(message[start..start + end].to_string());
        }
    }

    None
}

/// Extract identity (email or domain) from error message.
fn extract_identity_from_message(message: &str) -> String {
    // Try to extract email address or domain from the message
    // Pattern: email@domain.com or domain.com
    let words: Vec<&str> = message.split_whitespace().collect();
    for word in words {
        if word.contains('@') || (word.contains('.') && !word.ends_with('.')) {
            return word.trim_matches(|c: char| !c.is_alphanumeric() && c != '@' && c != '.' && c != '-')
                .to_string();
        }
    }

    // If no identity found, return the original message
    message.to_string()
}

/// Extract resource name from error message.
fn extract_resource_name_from_message(message: &str, resource_type: &str) -> String {
    // Pattern: "The [resource_type] 'name' does not exist"
    if let Some(start) = message.find(&format!("{} '", resource_type)) {
        let start = start + resource_type.len() + 2;
        if let Some(end) = message[start..].find('\'') {
            return message[start..start + end].to_string();
        }
    }

    // Pattern: "[resource_type] name does not exist"
    if let Some(start) = message.find(resource_type) {
        let start = start + resource_type.len() + 1;
        let remaining = message[start..].trim();
        if let Some(end) = remaining.find(' ') {
            return remaining[..end].to_string();
        }
    }

    // Return empty string if no name found
    String::new()
}

/// Determine if an HTTP status code indicates a retryable error.
fn is_retryable_status(status_code: u16) -> bool {
    matches!(
        status_code,
        // Server errors (500-599) are generally retryable
        500..=599 |
        // Request timeout
        408 |
        // Too many requests
        429
    )
}

/// Calculate retry delay based on HTTP status code.
fn calculate_retry_delay(status_code: u16) -> Option<Duration> {
    match status_code {
        429 => Some(Duration::from_secs(60)), // Rate limited, wait 1 minute
        503 => Some(Duration::from_secs(30)), // Service unavailable, wait 30 seconds
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_error_response_basic() {
        let json = r#"{"__type": "MessageRejected", "message": "Invalid email"}"#;
        let result = parse_error_response(json).unwrap();

        assert_eq!(result.error_type, "MessageRejected");
        assert_eq!(result.message, "Invalid email");
        assert_eq!(result.request_id, None);
    }

    #[test]
    fn test_parse_error_response_with_request_id() {
        let json = r#"{
            "__type": "ValidationException",
            "message": "Invalid parameter",
            "requestId": "abc-123-def"
        }"#;
        let result = parse_error_response(json).unwrap();

        assert_eq!(result.error_type, "ValidationException");
        assert_eq!(result.message, "Invalid parameter");
        assert_eq!(result.request_id, Some("abc-123-def".to_string()));
    }

    #[test]
    fn test_parse_error_response_with_namespace() {
        let json = r#"{
            "__type": "com.amazon.coral.service#MessageRejected",
            "message": "Email not verified"
        }"#;
        let result = parse_error_response(json).unwrap();

        assert_eq!(result.error_type, "MessageRejected");
        assert_eq!(result.message, "Email not verified");
    }

    #[test]
    fn test_parse_error_response_alternate_field_names() {
        let json = r#"{
            "Type": "ThrottlingException",
            "Message": "Too many requests"
        }"#;
        let result = parse_error_response(json).unwrap();

        assert_eq!(result.error_type, "ThrottlingException");
        assert_eq!(result.message, "Too many requests");
    }

    #[test]
    fn test_map_throttling_error() {
        let error = AwsErrorResponse {
            error_type: "Throttling".to_string(),
            message: "Rate exceeded".to_string(),
            request_id: Some("req-123".to_string()),
        };

        let result = map_aws_error(&error, 429);
        assert!(matches!(result, SesError::RateLimited { .. }));
        assert!(result.is_retryable());
        assert_eq!(result.retry_after(), Some(Duration::from_secs(60)));
    }

    #[test]
    fn test_map_throttling_exception() {
        let error = AwsErrorResponse {
            error_type: "ThrottlingException".to_string(),
            message: "Request throttled".to_string(),
            request_id: None,
        };

        let result = map_aws_error(&error, 429);
        assert!(matches!(result, SesError::RateLimited { .. }));
    }

    #[test]
    fn test_map_validation_error() {
        let error = AwsErrorResponse {
            error_type: "ValidationException".to_string(),
            message: "Invalid parameter 'ToAddresses'".to_string(),
            request_id: None,
        };

        let result = map_aws_error(&error, 400);
        match result {
            SesError::Validation { message, field } => {
                assert_eq!(message, "Invalid parameter 'ToAddresses'");
                assert_eq!(field, Some("ToAddresses".to_string()));
            }
            _ => panic!("Expected Validation error"),
        }
    }

    #[test]
    fn test_map_message_rejected() {
        let error = AwsErrorResponse {
            error_type: "MessageRejected".to_string(),
            message: "Email address not verified".to_string(),
            request_id: Some("req-456".to_string()),
        };

        let result = map_aws_error(&error, 400);
        match result {
            SesError::AwsApi {
                code,
                message,
                request_id,
                retryable,
            } => {
                assert_eq!(code, "MessageRejected");
                assert_eq!(message, "Email address not verified");
                assert_eq!(request_id, Some("req-456".to_string()));
                assert!(!retryable);
            }
            _ => panic!("Expected AwsApi error"),
        }
    }

    #[test]
    fn test_map_identity_not_verified() {
        let error = AwsErrorResponse {
            error_type: "MailFromDomainNotVerifiedException".to_string(),
            message: "Domain example.com is not verified".to_string(),
            request_id: None,
        };

        let result = map_aws_error(&error, 400);
        match result {
            SesError::IdentityNotVerified { identity } => {
                assert_eq!(identity, "example.com");
            }
            _ => panic!("Expected IdentityNotVerified error"),
        }
    }

    #[test]
    fn test_map_configuration_set_not_found() {
        let error = AwsErrorResponse {
            error_type: "ConfigurationSetDoesNotExistException".to_string(),
            message: "The configuration set 'my-config-set' does not exist".to_string(),
            request_id: None,
        };

        let result = map_aws_error(&error, 404);
        match result {
            SesError::ConfigurationSetNotFound { name } => {
                assert_eq!(name, "my-config-set");
            }
            _ => panic!("Expected ConfigurationSetNotFound error"),
        }
    }

    #[test]
    fn test_map_template_not_found() {
        let error = AwsErrorResponse {
            error_type: "TemplateDoesNotExistException".to_string(),
            message: "The template 'welcome-email' does not exist".to_string(),
            request_id: None,
        };

        let result = map_aws_error(&error, 404);
        match result {
            SesError::TemplateNotFound { name } => {
                assert_eq!(name, "welcome-email");
            }
            _ => panic!("Expected TemplateNotFound error"),
        }
    }

    #[test]
    fn test_map_account_suspended() {
        let error = AwsErrorResponse {
            error_type: "AccountSuspendedException".to_string(),
            message: "Your account has been suspended".to_string(),
            request_id: None,
        };

        let result = map_aws_error(&error, 400);
        match result {
            SesError::AccountSuspended { message } => {
                assert_eq!(message, "Your account has been suspended");
            }
            _ => panic!("Expected AccountSuspended error"),
        }
    }

    #[test]
    fn test_map_sending_paused() {
        let error = AwsErrorResponse {
            error_type: "SendingPausedException".to_string(),
            message: "Email sending is paused for your account".to_string(),
            request_id: None,
        };

        let result = map_aws_error(&error, 400);
        match result {
            SesError::SendingPaused { message } => {
                assert_eq!(message, "Email sending is paused for your account");
            }
            _ => panic!("Expected SendingPaused error"),
        }
    }

    #[test]
    fn test_map_quota_exceeded_daily() {
        let error = AwsErrorResponse {
            error_type: "DailyQuotaExceededException".to_string(),
            message: "Daily sending quota exceeded".to_string(),
            request_id: None,
        };

        let result = map_aws_error(&error, 400);
        match result {
            SesError::QuotaExceeded { quota_type, .. } => {
                assert_eq!(quota_type, QuotaType::Daily);
            }
            _ => panic!("Expected QuotaExceeded error"),
        }
    }

    #[test]
    fn test_map_quota_exceeded_rate() {
        let error = AwsErrorResponse {
            error_type: "MaxSendRateExceededException".to_string(),
            message: "Maximum sending rate per second exceeded".to_string(),
            request_id: None,
        };

        let result = map_aws_error(&error, 400);
        match result {
            SesError::QuotaExceeded { quota_type, .. } => {
                assert_eq!(quota_type, QuotaType::PerSecond);
            }
            _ => panic!("Expected QuotaExceeded error"),
        }
    }

    #[test]
    fn test_map_internal_failure() {
        let error = AwsErrorResponse {
            error_type: "InternalFailure".to_string(),
            message: "An internal error occurred".to_string(),
            request_id: Some("req-789".to_string()),
        };

        let result = map_aws_error(&error, 500);
        match result {
            SesError::AwsApi { retryable, .. } => {
                assert!(retryable);
            }
            _ => panic!("Expected AwsApi error"),
        }
    }

    #[test]
    fn test_map_service_unavailable() {
        let error = AwsErrorResponse {
            error_type: "ServiceUnavailable".to_string(),
            message: "Service temporarily unavailable".to_string(),
            request_id: None,
        };

        let result = map_aws_error(&error, 503);
        assert!(result.is_retryable());
    }

    #[test]
    fn test_map_not_found_configuration_set() {
        let error = AwsErrorResponse {
            error_type: "NotFoundException".to_string(),
            message: "Configuration set not found".to_string(),
            request_id: None,
        };

        let result = map_aws_error(&error, 404);
        assert!(matches!(result, SesError::ConfigurationSetNotFound { .. }));
    }

    #[test]
    fn test_map_not_found_template() {
        let error = AwsErrorResponse {
            error_type: "NotFoundException".to_string(),
            message: "Template does not exist".to_string(),
            request_id: None,
        };

        let result = map_aws_error(&error, 404);
        assert!(matches!(result, SesError::TemplateNotFound { .. }));
    }

    #[test]
    fn test_map_not_found_contact_list() {
        let error = AwsErrorResponse {
            error_type: "NotFoundException".to_string(),
            message: "Contact list not found".to_string(),
            request_id: None,
        };

        let result = map_aws_error(&error, 404);
        assert!(matches!(result, SesError::ContactListNotFound { .. }));
    }

    #[test]
    fn test_map_unknown_error_retryable() {
        let error = AwsErrorResponse {
            error_type: "UnknownError".to_string(),
            message: "Something went wrong".to_string(),
            request_id: None,
        };

        let result = map_aws_error(&error, 500);
        assert!(result.is_retryable());
    }

    #[test]
    fn test_map_unknown_error_non_retryable() {
        let error = AwsErrorResponse {
            error_type: "UnknownError".to_string(),
            message: "Something went wrong".to_string(),
            request_id: None,
        };

        let result = map_aws_error(&error, 400);
        assert!(!result.is_retryable());
    }

    #[test]
    fn test_extract_field_from_message() {
        let msg1 = "Invalid parameter 'ToAddresses'";
        assert_eq!(
            extract_field_from_message(msg1),
            Some("ToAddresses".to_string())
        );

        let msg2 = "The field 'Subject' is invalid";
        assert_eq!(
            extract_field_from_message(msg2),
            Some("Subject".to_string())
        );

        let msg3 = "Generic error message";
        assert_eq!(extract_field_from_message(msg3), None);
    }

    #[test]
    fn test_extract_identity_from_message() {
        let msg1 = "Email test@example.com is not verified";
        assert_eq!(extract_identity_from_message(msg1), "test@example.com");

        let msg2 = "Domain example.com not verified";
        assert_eq!(extract_identity_from_message(msg2), "example.com");

        let msg3 = "Identity not verified";
        assert_eq!(extract_identity_from_message(msg3), "Identity not verified");
    }

    #[test]
    fn test_extract_resource_name_from_message() {
        let msg1 = "The template 'welcome-email' does not exist";
        assert_eq!(
            extract_resource_name_from_message(msg1, "template"),
            "welcome-email"
        );

        let msg2 = "configuration set my-config does not exist";
        assert_eq!(
            extract_resource_name_from_message(msg2, "configuration set"),
            "my-config"
        );

        let msg3 = "Resource not found";
        assert_eq!(extract_resource_name_from_message(msg3, "template"), "");
    }

    #[test]
    fn test_is_retryable_status() {
        assert!(is_retryable_status(500)); // Internal server error
        assert!(is_retryable_status(502)); // Bad gateway
        assert!(is_retryable_status(503)); // Service unavailable
        assert!(is_retryable_status(504)); // Gateway timeout
        assert!(is_retryable_status(408)); // Request timeout
        assert!(is_retryable_status(429)); // Too many requests

        assert!(!is_retryable_status(400)); // Bad request
        assert!(!is_retryable_status(401)); // Unauthorized
        assert!(!is_retryable_status(403)); // Forbidden
        assert!(!is_retryable_status(404)); // Not found
    }

    #[test]
    fn test_calculate_retry_delay() {
        assert_eq!(calculate_retry_delay(429), Some(Duration::from_secs(60)));
        assert_eq!(calculate_retry_delay(503), Some(Duration::from_secs(30)));
        assert_eq!(calculate_retry_delay(500), None);
        assert_eq!(calculate_retry_delay(400), None);
    }

    #[test]
    fn test_determine_quota_type() {
        assert_eq!(
            determine_quota_type("DailyQuotaExceededException", "Daily limit exceeded"),
            QuotaType::Daily
        );
        assert_eq!(
            determine_quota_type("MaxSendRateExceededException", "Rate per second exceeded"),
            QuotaType::PerSecond
        );
        assert_eq!(
            determine_quota_type("LimitExceededException", "Too many recipients"),
            QuotaType::Recipients
        );
        assert_eq!(
            determine_quota_type("LimitExceededException", "Message size too large"),
            QuotaType::MessageSize
        );
        assert_eq!(
            determine_quota_type("LimitExceededException", "Limit exceeded"),
            QuotaType::Daily
        );
    }
}
