//! Organizations service for the Admin API.

use crate::auth::AuthManager;
use crate::errors::AnthropicResult;
use crate::resilience::ResilienceOrchestrator;
use crate::transport::HttpTransport;
use async_trait::async_trait;
use bytes::Bytes;
use http::Method;
use std::sync::Arc;
use url::Url;

use super::types::{Organization, UpdateOrganizationRequest};

/// Trait for organizations service operations
#[async_trait]
pub trait OrganizationsService: Send + Sync {
    /// Get the current organization
    ///
    /// Returns the organization associated with the authenticated API key.
    async fn get(&self) -> AnthropicResult<Organization>;

    /// Update the current organization
    ///
    /// # Arguments
    ///
    /// * `request` - The update request with new organization details
    async fn update(&self, request: UpdateOrganizationRequest) -> AnthropicResult<Organization>;
}

/// Implementation of the organizations service
pub struct OrganizationsServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,
    base_url: Url,
}

impl OrganizationsServiceImpl {
    /// Create a new organizations service
    pub fn new(
        transport: Arc<dyn HttpTransport>,
        auth_manager: Arc<dyn AuthManager>,
        resilience: Arc<dyn ResilienceOrchestrator>,
        base_url: Url,
    ) -> Self {
        Self {
            transport,
            auth_manager,
            resilience,
            base_url,
        }
    }
}

#[async_trait]
impl OrganizationsService for OrganizationsServiceImpl {
    async fn get(&self) -> AnthropicResult<Organization> {
        let url = self
            .base_url
            .join("/v1/organizations/me")
            .map_err(|e| crate::errors::AnthropicError::Configuration {
                message: format!("Invalid URL: {}", e),
            })?;

        let headers = self.auth_manager.get_headers();

        self.resilience
            .execute("organizations.get", || async {
                let response = self
                    .transport
                    .send(Method::GET, url.clone(), headers.clone(), None)
                    .await?;

                let org: Organization = serde_json::from_slice(response.body().as_ref())?;
                Ok(org)
            })
            .await
    }

    async fn update(&self, request: UpdateOrganizationRequest) -> AnthropicResult<Organization> {
        let url = self
            .base_url
            .join("/v1/organizations/me")
            .map_err(|e| crate::errors::AnthropicError::Configuration {
                message: format!("Invalid URL: {}", e),
            })?;

        let headers = self.auth_manager.get_headers();
        let body = serde_json::to_vec(&request)?;

        self.resilience
            .execute("organizations.update", || async {
                let response = self
                    .transport
                    .send(
                        Method::POST,
                        url.clone(),
                        headers.clone(),
                        Some(Bytes::from(body.clone())),
                    )
                    .await?;

                let org: Organization = serde_json::from_slice(response.body().as_ref())?;
                Ok(org)
            })
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::AnthropicError;
    use crate::mocks::{MockAuthManager, MockHttpTransport, MockResilienceOrchestrator};
    use http::{Response, StatusCode};
    use mockall::predicate::*;

    fn setup_service() -> (
        OrganizationsServiceImpl,
        Arc<MockHttpTransport>,
        Arc<MockAuthManager>,
        Arc<MockResilienceOrchestrator>,
    ) {
        let transport = Arc::new(MockHttpTransport::new());
        let auth_manager = Arc::new(MockAuthManager::new());
        let resilience = Arc::new(MockResilienceOrchestrator::new());
        let base_url = Url::parse("https://api.anthropic.com").unwrap();

        let service = OrganizationsServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
            base_url,
        );

        (service, transport, auth_manager, resilience)
    }

    #[tokio::test]
    async fn test_get_organization() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        let expected_org = Organization {
            id: "org-123".to_string(),
            name: "Test Organization".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-02T00:00:00Z".to_string(),
        };

        auth_manager
            .expect_get_headers()
            .times(1)
            .returning(|| http::HeaderMap::new());

        let org_json = serde_json::to_vec(&expected_org).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, body| {
                method == &Method::GET
                    && url.path() == "/v1/organizations/me"
                    && body.is_none()
            })
            .returning(move |_, _, _, _| {
                Ok(Response::builder()
                    .status(StatusCode::OK)
                    .body(Bytes::from(org_json.clone()))
                    .unwrap())
            });

        resilience
            .expect_execute()
            .times(1)
            .returning(|_, f| Box::pin(async move { f().await }));

        let result = service.get().await;
        assert!(result.is_ok());
        let org = result.unwrap();
        assert_eq!(org.id, "org-123");
        assert_eq!(org.name, "Test Organization");
    }

    #[tokio::test]
    async fn test_update_organization() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        let request = UpdateOrganizationRequest {
            name: "Updated Organization".to_string(),
        };

        let expected_org = Organization {
            id: "org-123".to_string(),
            name: "Updated Organization".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-03T00:00:00Z".to_string(),
        };

        auth_manager
            .expect_get_headers()
            .times(1)
            .returning(|| http::HeaderMap::new());

        let org_json = serde_json::to_vec(&expected_org).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, body| {
                method == &Method::POST
                    && url.path() == "/v1/organizations/me"
                    && body.is_some()
            })
            .returning(move |_, _, _, _| {
                Ok(Response::builder()
                    .status(StatusCode::OK)
                    .body(Bytes::from(org_json.clone()))
                    .unwrap())
            });

        resilience
            .expect_execute()
            .times(1)
            .returning(|_, f| Box::pin(async move { f().await }));

        let result = service.update(request).await;
        assert!(result.is_ok());
        let org = result.unwrap();
        assert_eq!(org.name, "Updated Organization");
    }

    #[tokio::test]
    async fn test_get_organization_error() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        auth_manager
            .expect_get_headers()
            .times(1)
            .returning(|| http::HeaderMap::new());

        transport
            .expect_send()
            .times(1)
            .returning(|_, _, _, _| {
                Err(AnthropicError::Authentication {
                    message: "Invalid API key".to_string(),
                })
            });

        resilience
            .expect_execute()
            .times(1)
            .returning(|_, f| Box::pin(async move { f().await }));

        let result = service.get().await;
        assert!(result.is_err());
        assert!(matches!(result, Err(AnthropicError::Authentication { .. })));
    }
}
