//! Device Authorization Types
//!
//! Types for OAuth2 Device Authorization Flow (RFC 8628).

use serde::{Deserialize, Serialize};

use super::TokenResponse;

/// Device code request parameters.
#[derive(Clone, Debug, Default)]
pub struct DeviceCodeParams {
    /// Scopes to request.
    pub scopes: Option<Vec<String>>,
}

/// Device authorization response.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeviceAuthorizationResponse {
    /// Device verification code (not shown to user).
    pub device_code: String,
    /// User code to display.
    pub user_code: String,
    /// URI for user to visit.
    pub verification_uri: String,
    /// URI with code pre-filled (optional).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verification_uri_complete: Option<String>,
    /// Lifetime in seconds.
    pub expires_in: u64,
    /// Minimum polling interval in seconds.
    #[serde(default)]
    pub interval: Option<u64>,
}

impl DeviceAuthorizationResponse {
    /// Get polling interval (default 5 seconds per RFC 8628).
    pub fn polling_interval(&self) -> u64 {
        self.interval.unwrap_or(5)
    }
}

/// Result of polling for device token.
#[derive(Clone, Debug)]
pub enum DeviceTokenResult {
    /// Token received successfully.
    Success(TokenResponse),
    /// Authorization still pending (user hasn't completed yet).
    Pending,
    /// Slow down - increase polling interval.
    SlowDown { new_interval: u64 },
    /// Device code expired.
    Expired,
    /// Access denied by user.
    AccessDenied,
}

impl DeviceTokenResult {
    /// Check if polling should continue.
    pub fn should_continue_polling(&self) -> bool {
        matches!(self, Self::Pending | Self::SlowDown { .. })
    }

    /// Check if authorization succeeded.
    pub fn is_success(&self) -> bool {
        matches!(self, Self::Success(_))
    }

    /// Get tokens if successful.
    pub fn into_tokens(self) -> Option<TokenResponse> {
        match self {
            Self::Success(tokens) => Some(tokens),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_device_authorization_response() {
        let json = r#"{
            "device_code": "dev123",
            "user_code": "ABCD-1234",
            "verification_uri": "https://example.com/device",
            "verification_uri_complete": "https://example.com/device?user_code=ABCD-1234",
            "expires_in": 1800,
            "interval": 5
        }"#;

        let response: DeviceAuthorizationResponse = serde_json::from_str(json).unwrap();
        assert_eq!(response.device_code, "dev123");
        assert_eq!(response.user_code, "ABCD-1234");
        assert_eq!(response.verification_uri, "https://example.com/device");
        assert_eq!(response.expires_in, 1800);
        assert_eq!(response.polling_interval(), 5);
    }

    #[test]
    fn test_device_authorization_response_defaults() {
        let json = r#"{
            "device_code": "dev123",
            "user_code": "ABCD-1234",
            "verification_uri": "https://example.com/device",
            "expires_in": 1800
        }"#;

        let response: DeviceAuthorizationResponse = serde_json::from_str(json).unwrap();
        assert!(response.verification_uri_complete.is_none());
        assert!(response.interval.is_none());
        // Default polling interval is 5
        assert_eq!(response.polling_interval(), 5);
    }

    #[test]
    fn test_device_token_result() {
        assert!(DeviceTokenResult::Pending.should_continue_polling());
        assert!(DeviceTokenResult::SlowDown { new_interval: 10 }.should_continue_polling());
        assert!(!DeviceTokenResult::Expired.should_continue_polling());
        assert!(!DeviceTokenResult::AccessDenied.should_continue_polling());
    }
}
