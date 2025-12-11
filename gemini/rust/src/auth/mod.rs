//! Authentication module for Gemini API.

use crate::config::{GeminiConfig, AuthMethod};
use secrecy::{SecretString, ExposeSecret};

/// Authentication manager for Gemini API.
pub trait AuthManager: Send + Sync {
    /// Get the authentication header name and value.
    fn get_auth_header(&self) -> Option<(String, String)>;

    /// Get the authentication query parameter.
    fn get_auth_query_param(&self) -> Option<(String, String)>;

    /// Clone the auth manager into a boxed trait object.
    fn clone_box(&self) -> Box<dyn AuthManager>;
}

/// API key authentication manager.
pub struct ApiKeyAuthManager {
    api_key: SecretString,
    auth_method: AuthMethod,
}

impl ApiKeyAuthManager {
    /// Create a new API key auth manager.
    pub fn new(api_key: SecretString, auth_method: AuthMethod) -> Self {
        Self { api_key, auth_method }
    }

    /// Create from config.
    pub fn from_config(config: &GeminiConfig) -> Self {
        Self::new(config.api_key.clone(), config.auth_method)
    }
}

impl AuthManager for ApiKeyAuthManager {
    fn get_auth_header(&self) -> Option<(String, String)> {
        match self.auth_method {
            AuthMethod::Header => Some((
                "x-goog-api-key".to_string(),
                self.api_key.expose_secret().to_string(),
            )),
            AuthMethod::QueryParam => None,
        }
    }

    fn get_auth_query_param(&self) -> Option<(String, String)> {
        match self.auth_method {
            AuthMethod::QueryParam => Some((
                "key".to_string(),
                self.api_key.expose_secret().to_string(),
            )),
            AuthMethod::Header => None,
        }
    }

    fn clone_box(&self) -> Box<dyn AuthManager> {
        Box::new(Self {
            api_key: self.api_key.clone(),
            auth_method: self.auth_method,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_header_auth() {
        let manager = ApiKeyAuthManager::new(
            SecretString::new("test-key".into()),
            AuthMethod::Header,
        );

        let header = manager.get_auth_header();
        assert!(header.is_some());
        let (name, value) = header.unwrap();
        assert_eq!(name, "x-goog-api-key");
        assert_eq!(value, "test-key");

        assert!(manager.get_auth_query_param().is_none());
    }

    #[test]
    fn test_query_param_auth() {
        let manager = ApiKeyAuthManager::new(
            SecretString::new("test-key".into()),
            AuthMethod::QueryParam,
        );

        assert!(manager.get_auth_header().is_none());

        let param = manager.get_auth_query_param();
        assert!(param.is_some());
        let (name, value) = param.unwrap();
        assert_eq!(name, "key");
        assert_eq!(value, "test-key");
    }
}
