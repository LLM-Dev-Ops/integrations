use crate::auth::AuthProvider;
use crate::errors::{AuthenticationError, ConfigurationError, OpenAIError, OpenAIResult};
use async_trait::async_trait;
use http::HeaderMap;
use secrecy::{ExposeSecret, Secret, SecretString};

/// API key provider for OpenAI authentication
pub struct ApiKeyProvider {
    api_key: SecretString,
    organization_id: Option<String>,
    project_id: Option<String>,
}

impl ApiKeyProvider {
    /// Creates a new ApiKeyProvider with a secret string
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            api_key: SecretString::new(api_key.into()),
            organization_id: None,
            project_id: None,
        }
    }

    /// Creates a new ApiKeyProvider from an existing SecretString
    pub fn from_secret(api_key: SecretString) -> Self {
        Self {
            api_key,
            organization_id: None,
            project_id: None,
        }
    }

    /// Sets the organization ID
    pub fn with_organization(mut self, org_id: impl Into<String>) -> Self {
        self.organization_id = Some(org_id.into());
        self
    }

    /// Sets the project ID
    pub fn with_project(mut self, project_id: impl Into<String>) -> Self {
        self.project_id = Some(project_id.into());
        self
    }

    /// Validates the API key format
    pub fn validate(&self) -> OpenAIResult<()> {
        let key = self.api_key.expose_secret();

        if key.is_empty() {
            return Err(OpenAIError::Configuration(
                ConfigurationError::MissingApiKey("API key is empty".to_string()),
            ));
        }

        if key.len() < 10 {
            return Err(OpenAIError::Configuration(
                ConfigurationError::InvalidApiKeyFormat(
                    "API key is too short (minimum 10 characters)".to_string(),
                ),
            ));
        }

        if !key.starts_with("sk-") {
            return Err(OpenAIError::Configuration(
                ConfigurationError::InvalidApiKeyFormat(
                    "API key must start with 'sk-'".to_string(),
                ),
            ));
        }

        Ok(())
    }

    fn validate_key_format(key: &str) -> bool {
        !key.is_empty() && key.len() > 10 && key.starts_with("sk-")
    }
}

#[async_trait]
impl AuthProvider for ApiKeyProvider {
    async fn authenticate(&self, headers: &mut HeaderMap) -> OpenAIResult<()> {
        let api_key = self.api_key.expose_secret();

        if !Self::validate_key_format(api_key) {
            return Err(OpenAIError::Authentication(
                AuthenticationError::InvalidApiKey(
                    "API key must start with 'sk-' and be at least 10 characters".to_string(),
                ),
            ));
        }

        // Add Authorization header
        let auth_value = format!("Bearer {}", api_key);
        headers.insert(
            "Authorization",
            auth_value.parse().map_err(|_| {
                OpenAIError::Authentication(AuthenticationError::InvalidApiKey(
                    "Failed to create Authorization header".to_string(),
                ))
            })?,
        );

        // Add OpenAI-Organization header if present
        if let Some(org_id) = &self.organization_id {
            headers.insert(
                "OpenAI-Organization",
                org_id.parse().map_err(|_| {
                    OpenAIError::Authentication(AuthenticationError::InvalidOrganizationId(
                        "Invalid organization ID format".to_string(),
                    ))
                })?,
            );
        }

        // Add OpenAI-Project header if present
        if let Some(project_id) = &self.project_id {
            headers.insert(
                "OpenAI-Project",
                project_id.parse().map_err(|_| {
                    OpenAIError::Authentication(AuthenticationError::InvalidProjectId(
                        "Invalid project ID format".to_string(),
                    ))
                })?,
            );
        }

        Ok(())
    }

    fn is_valid(&self) -> bool {
        let api_key = self.api_key.expose_secret();
        Self::validate_key_format(api_key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_key_format() {
        assert!(ApiKeyProvider::validate_key_format("sk-test123456"));
        assert!(!ApiKeyProvider::validate_key_format("invalid"));
        assert!(!ApiKeyProvider::validate_key_format("sk-short"));
        assert!(!ApiKeyProvider::validate_key_format(""));
    }

    #[tokio::test]
    async fn test_authenticate() {
        let provider = ApiKeyProvider::from_string("sk-test123456".to_string());
        let mut headers = HeaderMap::new();

        let result = provider.authenticate(&mut headers).await;
        assert!(result.is_ok());
        assert!(headers.contains_key("Authorization"));
        assert_eq!(
            headers.get("Authorization").unwrap(),
            "Bearer sk-test123456"
        );
    }

    #[test]
    fn test_is_valid() {
        let provider = ApiKeyProvider::from_string("sk-test123456".to_string());
        assert!(provider.is_valid());

        let invalid_provider = ApiKeyProvider::from_string("invalid".to_string());
        assert!(!invalid_provider.is_valid());
    }
}
