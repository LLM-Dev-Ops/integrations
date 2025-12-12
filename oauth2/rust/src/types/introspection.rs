//! Introspection Types
//!
//! Types for OAuth2 Token Introspection (RFC 7662) and Revocation (RFC 7009).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Token introspection parameters.
#[derive(Clone, Debug)]
pub struct IntrospectionParams {
    /// Token to introspect.
    pub token: String,
    /// Token type hint (access_token or refresh_token).
    pub token_type_hint: Option<TokenTypeHint>,
}

/// Token revocation parameters.
#[derive(Clone, Debug)]
pub struct RevocationParams {
    /// Token to revoke.
    pub token: String,
    /// Token type hint.
    pub token_type_hint: Option<TokenTypeHint>,
}

/// Token type hint.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TokenTypeHint {
    AccessToken,
    RefreshToken,
}

impl TokenTypeHint {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::AccessToken => "access_token",
            Self::RefreshToken => "refresh_token",
        }
    }
}

/// Token introspection response.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IntrospectionResponse {
    /// Whether the token is active.
    pub active: bool,
    /// Granted scopes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    /// Client that requested the token.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    /// Resource owner username.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    /// Token type.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_type: Option<String>,
    /// Expiration timestamp (Unix seconds).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exp: Option<i64>,
    /// Issued-at timestamp (Unix seconds).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub iat: Option<i64>,
    /// Not-before timestamp (Unix seconds).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nbf: Option<i64>,
    /// Subject identifier.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sub: Option<String>,
    /// Audience.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aud: Option<String>,
    /// Issuer.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub iss: Option<String>,
    /// JWT ID.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub jti: Option<String>,
    /// Additional claims.
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

impl IntrospectionResponse {
    /// Check if token is active.
    pub fn is_active(&self) -> bool {
        self.active
    }

    /// Get remaining lifetime in seconds.
    pub fn remaining_lifetime(&self) -> Option<i64> {
        self.exp.map(|exp| {
            let now = chrono::Utc::now().timestamp();
            if exp > now {
                exp - now
            } else {
                0
            }
        })
    }

    /// Get scopes as vector.
    pub fn scopes(&self) -> Vec<String> {
        self.scope
            .as_ref()
            .map(|s| s.split_whitespace().map(String::from).collect())
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_introspection_response_active() {
        let json = r#"{
            "active": true,
            "scope": "openid profile email",
            "client_id": "test-client",
            "username": "test-user",
            "token_type": "Bearer",
            "exp": 1735689600,
            "iat": 1735686000,
            "sub": "user123"
        }"#;

        let response: IntrospectionResponse = serde_json::from_str(json).unwrap();
        assert!(response.is_active());
        assert_eq!(
            response.scopes(),
            vec!["openid", "profile", "email"]
        );
        assert_eq!(response.client_id, Some("test-client".to_string()));
    }

    #[test]
    fn test_introspection_response_inactive() {
        let json = r#"{"active": false}"#;

        let response: IntrospectionResponse = serde_json::from_str(json).unwrap();
        assert!(!response.is_active());
        assert!(response.scope.is_none());
    }

    #[test]
    fn test_token_type_hint() {
        assert_eq!(TokenTypeHint::AccessToken.as_str(), "access_token");
        assert_eq!(TokenTypeHint::RefreshToken.as_str(), "refresh_token");
    }
}
