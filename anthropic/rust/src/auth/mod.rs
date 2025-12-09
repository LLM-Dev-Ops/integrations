//! Authentication and authorization for the Anthropic API.

use crate::config::BetaFeature;
use async_trait::async_trait;
use http::HeaderMap;
use secrecy::{ExposeSecret, SecretString};

/// Trait for managing authentication headers
#[async_trait]
pub trait AuthManager: Send + Sync {
    /// Get the authentication headers for a request
    fn get_headers(&self) -> HeaderMap;

    /// Validate the API key format
    fn validate_api_key(&self) -> Result<(), String>;
}

/// Bearer token authentication manager
pub struct BearerAuthManager {
    api_key: SecretString,
    api_version: String,
    beta_features: Vec<BetaFeature>,
}

impl BearerAuthManager {
    /// Create a new bearer authentication manager
    pub fn new(
        api_key: SecretString,
        api_version: String,
        beta_features: Vec<BetaFeature>,
    ) -> Self {
        Self {
            api_key,
            api_version,
            beta_features,
        }
    }
}

#[async_trait]
impl AuthManager for BearerAuthManager {
    fn get_headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();

        // Add API key header
        headers.insert(
            "x-api-key",
            self.api_key.expose_secret().parse().unwrap(),
        );

        // Add API version header
        headers.insert(
            "anthropic-version",
            self.api_version.parse().unwrap(),
        );

        // Add beta features header if any
        if !self.beta_features.is_empty() {
            let beta_header = self
                .beta_features
                .iter()
                .map(|f| f.header_value())
                .collect::<Vec<_>>()
                .join(",");

            headers.insert(
                "anthropic-beta",
                beta_header.parse().unwrap(),
            );
        }

        // Add content type
        headers.insert(
            "content-type",
            "application/json".parse().unwrap(),
        );

        headers
    }

    fn validate_api_key(&self) -> Result<(), String> {
        let key = self.api_key.expose_secret();

        if key.is_empty() {
            return Err("API key cannot be empty".to_string());
        }

        if !key.starts_with("sk-ant-") {
            return Err("API key must start with 'sk-ant-'".to_string());
        }

        if key.len() < 20 {
            return Err("API key is too short".to_string());
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bearer_auth_manager_headers() {
        let manager = BearerAuthManager::new(
            SecretString::new("sk-ant-test123456789012345".to_string()),
            "2023-06-01".to_string(),
            vec![],
        );

        let headers = manager.get_headers();

        assert_eq!(
            headers.get("x-api-key").unwrap(),
            "sk-ant-test123456789012345"
        );
        assert_eq!(
            headers.get("anthropic-version").unwrap(),
            "2023-06-01"
        );
        assert_eq!(
            headers.get("content-type").unwrap(),
            "application/json"
        );
    }

    #[test]
    fn test_bearer_auth_manager_with_beta() {
        let manager = BearerAuthManager::new(
            SecretString::new("sk-ant-test123456789012345".to_string()),
            "2023-06-01".to_string(),
            vec![BetaFeature::ExtendedThinking, BetaFeature::PdfSupport],
        );

        let headers = manager.get_headers();

        let beta_header = headers.get("anthropic-beta").unwrap().to_str().unwrap();
        assert!(beta_header.contains("extended-thinking-2024-12-20"));
        assert!(beta_header.contains("pdfs-2024-09-25"));
    }

    #[test]
    fn test_validate_api_key() {
        let manager = BearerAuthManager::new(
            SecretString::new("sk-ant-test123456789012345".to_string()),
            "2023-06-01".to_string(),
            vec![],
        );

        assert!(manager.validate_api_key().is_ok());

        let invalid_manager = BearerAuthManager::new(
            SecretString::new("invalid-key".to_string()),
            "2023-06-01".to_string(),
            vec![],
        );

        assert!(invalid_manager.validate_api_key().is_err());
    }
}
