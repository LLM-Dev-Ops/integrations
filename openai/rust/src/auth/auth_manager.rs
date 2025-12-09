use crate::auth::{ApiKeyProvider, AuthProvider};
use crate::client::OpenAIConfig;
use crate::errors::OpenAIResult;
use async_trait::async_trait;
use http::HeaderMap;
use std::sync::Arc;

/// Trait for managing authentication in requests
#[async_trait]
pub trait AuthManager: Send + Sync {
    /// Applies authentication headers to the request
    async fn apply_auth(&self, headers: &mut HeaderMap) -> OpenAIResult<()>;

    /// Validates the authentication configuration
    fn validate(&self) -> OpenAIResult<()>;
}

/// Bearer token authentication manager (alias for OpenAIAuthManager)
pub type BearerAuthManager = OpenAIAuthManager;

pub struct OpenAIAuthManager {
    provider: Arc<dyn AuthProvider>,
    organization_id: Option<String>,
    project_id: Option<String>,
}

impl OpenAIAuthManager {
    /// Creates a new OpenAIAuthManager from configuration
    pub fn new(config: &OpenAIConfig) -> Self {
        let mut provider = ApiKeyProvider::new(config.api_key().to_string());

        if let Some(org_id) = &config.organization_id {
            provider = provider.with_organization(org_id.clone());
        }

        if let Some(project_id) = &config.project_id {
            provider = provider.with_project(project_id.clone());
        }

        Self {
            provider: Arc::new(provider),
            organization_id: config.organization_id.clone(),
            project_id: config.project_id.clone(),
        }
    }

    /// Creates a new OpenAIAuthManager with a custom provider
    pub fn with_provider(provider: Arc<dyn AuthProvider>) -> Self {
        Self {
            provider,
            organization_id: None,
            project_id: None,
        }
    }

    /// Sets the organization ID
    pub fn with_organization_id(mut self, org_id: impl Into<String>) -> Self {
        self.organization_id = Some(org_id.into());
        self
    }

    /// Sets the project ID
    pub fn with_project_id(mut self, project_id: impl Into<String>) -> Self {
        self.project_id = Some(project_id.into());
        self
    }
}

#[async_trait]
impl AuthManager for OpenAIAuthManager {
    async fn apply_auth(&self, headers: &mut HeaderMap) -> OpenAIResult<()> {
        self.provider.authenticate(headers).await?;

        if let Some(org_id) = &self.organization_id {
            headers.insert(
                "OpenAI-Organization",
                org_id.parse().map_err(|_| {
                    crate::errors::OpenAIError::Authentication(
                        crate::errors::AuthenticationError::InvalidOrganizationId(
                            "Invalid organization ID format".to_string(),
                        ),
                    )
                })?,
            );
        }

        if let Some(project_id) = &self.project_id {
            headers.insert(
                "OpenAI-Project",
                project_id.parse().map_err(|_| {
                    crate::errors::OpenAIError::Authentication(
                        crate::errors::AuthenticationError::InvalidProjectId(
                            "Invalid project ID format".to_string(),
                        ),
                    )
                })?,
            );
        }

        Ok(())
    }

    fn validate(&self) -> OpenAIResult<()> {
        if !self.provider.is_valid() {
            return Err(crate::errors::OpenAIError::Authentication(
                crate::errors::AuthenticationError::InvalidApiKey(
                    "API key validation failed".to_string(),
                ),
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::client::OpenAIConfig;

    #[tokio::test]
    async fn test_apply_auth() {
        let config = OpenAIConfig::new("test-key").with_organization_id("org-123");
        let manager = OpenAIAuthManager::new(config);
        let mut headers = HeaderMap::new();

        let result = manager.apply_auth(&mut headers).await;
        assert!(result.is_ok());
        assert!(headers.contains_key("Authorization"));
        assert!(headers.contains_key("OpenAI-Organization"));
    }
}
