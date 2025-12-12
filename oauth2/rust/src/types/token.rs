//! Token Types
//!
//! OAuth2 token type definitions.

use chrono::{DateTime, Duration, Utc};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Token response from authorization server.
#[derive(Clone, Debug, Deserialize)]
pub struct TokenResponse {
    /// Access token.
    pub access_token: String,
    /// Token type (usually "Bearer").
    #[serde(default = "default_token_type")]
    pub token_type: String,
    /// Expires in seconds.
    #[serde(default)]
    pub expires_in: Option<u64>,
    /// Refresh token.
    #[serde(default)]
    pub refresh_token: Option<String>,
    /// Granted scopes.
    #[serde(default)]
    pub scope: Option<String>,
    /// ID token (OIDC).
    #[serde(default)]
    pub id_token: Option<String>,
    /// Additional fields.
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

fn default_token_type() -> String {
    "Bearer".to_string()
}

/// Stored token set with metadata.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StoredTokens {
    /// Access token (encrypted in storage).
    pub access_token: String,
    /// Token type.
    pub token_type: String,
    /// Expiration time.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<DateTime<Utc>>,
    /// Refresh token (encrypted in storage).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    /// Granted scopes.
    pub scopes: Vec<String>,
    /// ID token (OIDC).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id_token: Option<String>,
    /// When tokens were stored.
    pub stored_at: DateTime<Utc>,
    /// Additional metadata.
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub metadata: HashMap<String, String>,
}

impl StoredTokens {
    /// Create from token response.
    pub fn from_response(response: &TokenResponse) -> Self {
        let now = Utc::now();
        let expires_at = response
            .expires_in
            .map(|secs| now + Duration::seconds(secs as i64));

        let scopes = response
            .scope
            .as_ref()
            .map(|s| s.split_whitespace().map(String::from).collect())
            .unwrap_or_default();

        Self {
            access_token: response.access_token.clone(),
            token_type: response.token_type.clone(),
            expires_at,
            refresh_token: response.refresh_token.clone(),
            scopes,
            id_token: response.id_token.clone(),
            stored_at: now,
            metadata: HashMap::new(),
        }
    }

    /// Check if token is expired.
    pub fn is_expired(&self) -> bool {
        self.expires_at
            .map(|exp| exp <= Utc::now())
            .unwrap_or(false)
    }

    /// Check if token is expiring soon.
    pub fn is_expiring_soon(&self, threshold_secs: i64) -> bool {
        self.expires_at
            .map(|exp| exp <= Utc::now() + Duration::seconds(threshold_secs))
            .unwrap_or(false)
    }

    /// Check if has refresh token.
    pub fn has_refresh_token(&self) -> bool {
        self.refresh_token.is_some()
    }

    /// Get remaining lifetime in seconds.
    pub fn remaining_lifetime(&self) -> Option<i64> {
        self.expires_at.map(|exp| {
            let now = Utc::now();
            if exp > now {
                (exp - now).num_seconds()
            } else {
                0
            }
        })
    }
}

/// Access token wrapper for safe handling.
#[derive(Clone)]
pub struct AccessToken {
    /// Token value (secret).
    value: SecretString,
    /// Token type.
    pub token_type: String,
    /// Expiration time.
    pub expires_at: Option<DateTime<Utc>>,
    /// Associated scopes.
    pub scopes: Vec<String>,
}

impl AccessToken {
    /// Create new access token.
    pub fn new(
        value: String,
        token_type: String,
        expires_at: Option<DateTime<Utc>>,
        scopes: Vec<String>,
    ) -> Self {
        Self {
            value: SecretString::new(value),
            token_type,
            expires_at,
            scopes,
        }
    }

    /// Get token value (for Authorization header).
    pub fn secret(&self) -> &str {
        self.value.expose_secret()
    }

    /// Check if token is expired.
    pub fn is_expired(&self) -> bool {
        self.expires_at
            .map(|exp| exp <= Utc::now())
            .unwrap_or(false)
    }

    /// Get time until expiration.
    pub fn expires_in(&self) -> Option<std::time::Duration> {
        self.expires_at.and_then(|exp| {
            let now = Utc::now();
            if exp > now {
                (exp - now).to_std().ok()
            } else {
                None
            }
        })
    }

    /// Format as Authorization header value.
    pub fn authorization_header(&self) -> String {
        format!("{} {}", self.token_type, self.value.expose_secret())
    }
}

impl From<&StoredTokens> for AccessToken {
    fn from(stored: &StoredTokens) -> Self {
        Self::new(
            stored.access_token.clone(),
            stored.token_type.clone(),
            stored.expires_at,
            stored.scopes.clone(),
        )
    }
}

impl std::fmt::Debug for AccessToken {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AccessToken")
            .field("value", &"[REDACTED]")
            .field("token_type", &self.token_type)
            .field("expires_at", &self.expires_at)
            .field("scopes", &self.scopes)
            .finish()
    }
}

/// Refresh token parameters.
#[derive(Clone, Debug)]
pub struct RefreshTokenParams {
    /// Scopes to request (subset of original).
    pub scopes: Option<Vec<String>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_response_parsing() {
        let json = r#"{
            "access_token": "test-token",
            "token_type": "Bearer",
            "expires_in": 3600,
            "refresh_token": "test-refresh",
            "scope": "openid profile email"
        }"#;

        let response: TokenResponse = serde_json::from_str(json).unwrap();
        assert_eq!(response.access_token, "test-token");
        assert_eq!(response.token_type, "Bearer");
        assert_eq!(response.expires_in, Some(3600));
        assert_eq!(response.refresh_token, Some("test-refresh".to_string()));
        assert_eq!(response.scope, Some("openid profile email".to_string()));
    }

    #[test]
    fn test_stored_tokens_from_response() {
        let response = TokenResponse {
            access_token: "test-token".to_string(),
            token_type: "Bearer".to_string(),
            expires_in: Some(3600),
            refresh_token: Some("test-refresh".to_string()),
            scope: Some("openid profile".to_string()),
            id_token: None,
            extra: HashMap::new(),
        };

        let stored = StoredTokens::from_response(&response);
        assert_eq!(stored.access_token, "test-token");
        assert!(stored.expires_at.is_some());
        assert!(stored.has_refresh_token());
        assert_eq!(stored.scopes, vec!["openid", "profile"]);
    }

    #[test]
    fn test_access_token_authorization_header() {
        let token = AccessToken::new(
            "test-token".to_string(),
            "Bearer".to_string(),
            None,
            Vec::new(),
        );
        assert_eq!(token.authorization_header(), "Bearer test-token");
    }

    #[test]
    fn test_is_expiring_soon() {
        let mut stored = StoredTokens {
            access_token: "test".to_string(),
            token_type: "Bearer".to_string(),
            expires_at: Some(Utc::now() + Duration::seconds(30)),
            refresh_token: None,
            scopes: Vec::new(),
            id_token: None,
            stored_at: Utc::now(),
            metadata: HashMap::new(),
        };

        // Expires in 30 seconds, threshold 60 - should be expiring soon
        assert!(stored.is_expiring_soon(60));
        // Expires in 30 seconds, threshold 10 - should not be expiring soon
        assert!(!stored.is_expiring_soon(10));

        // Already expired
        stored.expires_at = Some(Utc::now() - Duration::seconds(10));
        assert!(stored.is_expired());
    }
}
