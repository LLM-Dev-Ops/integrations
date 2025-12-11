//! Authentication module for the Groq client.
//!
//! Provides authentication providers for API key-based authentication
//! with secure credential handling.

use async_trait::async_trait;
use secrecy::{ExposeSecret, SecretString};
use std::collections::HashMap;

use crate::errors::GroqError;

/// Authentication provider trait.
///
/// Implementations of this trait provide authentication credentials
/// for API requests.
#[async_trait]
pub trait AuthProvider: Send + Sync {
    /// Apply authentication to request headers.
    fn apply_auth(&self, headers: &mut HashMap<String, String>);

    /// Get the authentication scheme name.
    fn scheme(&self) -> &str;

    /// Validate the credentials.
    fn validate(&self) -> Result<(), GroqError>;
}

/// API key authentication provider.
///
/// Uses Bearer token authentication with the Groq API key.
pub struct ApiKeyAuth {
    api_key: SecretString,
}

impl ApiKeyAuth {
    /// Creates a new API key authentication provider.
    pub fn new(api_key: SecretString) -> Self {
        Self { api_key }
    }

    /// Creates from a string API key.
    pub fn from_string(api_key: impl Into<String>) -> Self {
        Self {
            api_key: SecretString::new(api_key.into()),
        }
    }

    /// Gets a hint of the API key for debugging (last 4 characters).
    pub fn key_hint(&self) -> String {
        let key = self.api_key.expose_secret();
        if key.len() > 4 {
            format!("...{}", &key[key.len() - 4..])
        } else {
            "****".to_string()
        }
    }
}

#[async_trait]
impl AuthProvider for ApiKeyAuth {
    fn apply_auth(&self, headers: &mut HashMap<String, String>) {
        headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", self.api_key.expose_secret()),
        );
    }

    fn scheme(&self) -> &str {
        "Bearer"
    }

    fn validate(&self) -> Result<(), GroqError> {
        let key = self.api_key.expose_secret();

        if key.is_empty() {
            return Err(GroqError::Authentication {
                message: "API key cannot be empty".to_string(),
                api_key_hint: None,
            });
        }

        // Groq keys typically start with "gsk_"
        if !key.starts_with("gsk_") {
            tracing::warn!(
                key_hint = %self.key_hint(),
                "API key does not match expected Groq format (gsk_*)"
            );
        }

        Ok(())
    }
}

impl std::fmt::Debug for ApiKeyAuth {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ApiKeyAuth")
            .field("api_key", &"[REDACTED]")
            .field("key_hint", &self.key_hint())
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_api_key_auth_apply() {
        let auth = ApiKeyAuth::from_string("gsk_test_key_12345");
        let mut headers = HashMap::new();

        auth.apply_auth(&mut headers);

        assert_eq!(
            headers.get("Authorization"),
            Some(&"Bearer gsk_test_key_12345".to_string())
        );
    }

    #[test]
    fn test_api_key_auth_scheme() {
        let auth = ApiKeyAuth::from_string("gsk_test_key");
        assert_eq!(auth.scheme(), "Bearer");
    }

    #[test]
    fn test_api_key_auth_validate_success() {
        let auth = ApiKeyAuth::from_string("gsk_test_key_12345");
        assert!(auth.validate().is_ok());
    }

    #[test]
    fn test_api_key_auth_validate_empty() {
        let auth = ApiKeyAuth::from_string("");
        assert!(auth.validate().is_err());
    }

    #[test]
    fn test_api_key_hint() {
        let auth = ApiKeyAuth::from_string("gsk_test_key_12345");
        assert_eq!(auth.key_hint(), "...2345");
    }

    #[test]
    fn test_api_key_hint_short_key() {
        let auth = ApiKeyAuth::from_string("abc");
        assert_eq!(auth.key_hint(), "****");
    }

    #[test]
    fn test_debug_redacts_key() {
        let auth = ApiKeyAuth::from_string("gsk_secret_key");
        let debug_str = format!("{:?}", auth);

        assert!(debug_str.contains("[REDACTED]"));
        assert!(!debug_str.contains("gsk_secret_key"));
    }
}
