//! Authentication module for the Mistral client.
//!
//! Handles API key authentication and header generation.

use async_trait::async_trait;
use std::collections::HashMap;

use crate::config::MistralConfig;

/// Trait for authentication managers.
#[async_trait]
pub trait AuthManager: Send + Sync {
    /// Returns the authentication headers.
    fn get_headers(&self) -> HashMap<String, String>;

    /// Validates the API key format.
    fn validate_api_key(&self) -> Result<(), String>;
}

/// Bearer token authentication manager.
pub struct BearerAuthManager {
    api_key: String,
    custom_headers: Vec<(String, String)>,
}

impl BearerAuthManager {
    /// Creates a new bearer auth manager from config.
    pub fn new(config: &MistralConfig) -> Self {
        Self {
            api_key: config.api_key().to_string(),
            custom_headers: config.custom_headers.clone(),
        }
    }

    /// Creates a new bearer auth manager with an API key.
    pub fn with_api_key(api_key: impl Into<String>) -> Self {
        Self {
            api_key: api_key.into(),
            custom_headers: Vec::new(),
        }
    }
}

#[async_trait]
impl AuthManager for BearerAuthManager {
    fn get_headers(&self) -> HashMap<String, String> {
        let mut headers = HashMap::new();

        // Authorization header
        headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", self.api_key),
        );

        // Content-Type header
        headers.insert("Content-Type".to_string(), "application/json".to_string());

        // Accept header
        headers.insert("Accept".to_string(), "application/json".to_string());

        // Custom headers
        for (key, value) in &self.custom_headers {
            headers.insert(key.clone(), value.clone());
        }

        headers
    }

    fn validate_api_key(&self) -> Result<(), String> {
        if self.api_key.is_empty() {
            return Err("API key cannot be empty".to_string());
        }

        // Mistral API keys are typically non-empty strings
        // We don't enforce a specific format as Mistral may use different key formats
        if self.api_key.len() < 8 {
            return Err("API key appears to be too short".to_string());
        }

        Ok(())
    }
}

impl std::fmt::Debug for BearerAuthManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BearerAuthManager")
            .field("api_key", &"[REDACTED]")
            .field("custom_headers", &self.custom_headers.len())
            .finish()
    }
}

/// Mock auth manager for testing.
#[cfg(test)]
pub struct MockAuthManager {
    headers: HashMap<String, String>,
    validation_result: Result<(), String>,
}

#[cfg(test)]
impl MockAuthManager {
    /// Creates a new mock auth manager.
    pub fn new() -> Self {
        let mut headers = HashMap::new();
        headers.insert("Authorization".to_string(), "Bearer mock-key".to_string());
        headers.insert("Content-Type".to_string(), "application/json".to_string());

        Self {
            headers,
            validation_result: Ok(()),
        }
    }

    /// Sets the headers to return.
    pub fn with_headers(mut self, headers: HashMap<String, String>) -> Self {
        self.headers = headers;
        self
    }

    /// Sets the validation result.
    pub fn with_validation_result(mut self, result: Result<(), String>) -> Self {
        self.validation_result = result;
        self
    }
}

#[cfg(test)]
#[async_trait]
impl AuthManager for MockAuthManager {
    fn get_headers(&self) -> HashMap<String, String> {
        self.headers.clone()
    }

    fn validate_api_key(&self) -> Result<(), String> {
        self.validation_result.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bearer_auth_headers() {
        let auth = BearerAuthManager::with_api_key("test-api-key");
        let headers = auth.get_headers();

        assert_eq!(
            headers.get("Authorization"),
            Some(&"Bearer test-api-key".to_string())
        );
        assert_eq!(
            headers.get("Content-Type"),
            Some(&"application/json".to_string())
        );
    }

    #[test]
    fn test_bearer_auth_validation() {
        let auth = BearerAuthManager::with_api_key("valid-api-key");
        assert!(auth.validate_api_key().is_ok());

        let auth = BearerAuthManager::with_api_key("");
        assert!(auth.validate_api_key().is_err());

        let auth = BearerAuthManager::with_api_key("short");
        assert!(auth.validate_api_key().is_err());
    }

    #[test]
    fn test_bearer_auth_debug_redacts_key() {
        let auth = BearerAuthManager::with_api_key("secret-key");
        let debug_str = format!("{:?}", auth);

        assert!(debug_str.contains("[REDACTED]"));
        assert!(!debug_str.contains("secret-key"));
    }
}
