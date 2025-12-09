//! Invites service for the Admin API.

use crate::auth::AuthManager;
use crate::errors::AnthropicResult;
use crate::resilience::ResilienceOrchestrator;
use crate::transport::HttpTransport;
use async_trait::async_trait;
use bytes::Bytes;
use http::Method;
use std::sync::Arc;
use url::Url;

use super::types::{CreateInviteRequest, Invite, ListParams, ListResponse};

/// Trait for invites service operations
#[async_trait]
pub trait InvitesService: Send + Sync {
    /// List all invites
    async fn list(&self, params: Option<ListParams>) -> AnthropicResult<ListResponse<Invite>>;

    /// Get a specific invite by ID
    async fn get(&self, invite_id: &str) -> AnthropicResult<Invite>;

    /// Create a new invite
    async fn create(&self, request: CreateInviteRequest) -> AnthropicResult<Invite>;

    /// Delete an invite
    async fn delete(&self, invite_id: &str) -> AnthropicResult<()>;
}

/// Implementation of the invites service
pub struct InvitesServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,
    base_url: Url,
}

impl InvitesServiceImpl {
    /// Create a new invites service
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

    fn build_list_url(&self, path: &str, params: Option<ListParams>) -> AnthropicResult<Url> {
        let mut url = self.base_url.join(path).map_err(|e| {
            crate::errors::AnthropicError::Configuration {
                message: format!("Invalid URL: {}", e),
            }
        })?;

        if let Some(params) = params {
            let mut query_pairs = url.query_pairs_mut();
            if let Some(before_id) = params.before_id {
                query_pairs.append_pair("before_id", &before_id);
            }
            if let Some(after_id) = params.after_id {
                query_pairs.append_pair("after_id", &after_id);
            }
            if let Some(limit) = params.limit {
                query_pairs.append_pair("limit", &limit.to_string());
            }
        }

        Ok(url)
    }
}

#[async_trait]
impl InvitesService for InvitesServiceImpl {
    async fn list(&self, params: Option<ListParams>) -> AnthropicResult<ListResponse<Invite>> {
        let url = self.build_list_url("/v1/organizations/invites", params)?;
        let headers = self.auth_manager.get_headers();

        self.resilience
            .execute("invites.list", || async {
                let response = self
                    .transport
                    .send(Method::GET, url.clone(), headers.clone(), None)
                    .await?;

                let list: ListResponse<Invite> =
                    serde_json::from_slice(response.body().as_ref())?;
                Ok(list)
            })
            .await
    }

    async fn get(&self, invite_id: &str) -> AnthropicResult<Invite> {
        let url = self
            .base_url
            .join(&format!("/v1/organizations/invites/{}", invite_id))
            .map_err(|e| crate::errors::AnthropicError::Configuration {
                message: format!("Invalid URL: {}", e),
            })?;

        let headers = self.auth_manager.get_headers();

        self.resilience
            .execute("invites.get", || async {
                let response = self
                    .transport
                    .send(Method::GET, url.clone(), headers.clone(), None)
                    .await?;

                let invite: Invite = serde_json::from_slice(response.body().as_ref())?;
                Ok(invite)
            })
            .await
    }

    async fn create(&self, request: CreateInviteRequest) -> AnthropicResult<Invite> {
        let url = self
            .base_url
            .join("/v1/organizations/invites")
            .map_err(|e| crate::errors::AnthropicError::Configuration {
                message: format!("Invalid URL: {}", e),
            })?;

        let headers = self.auth_manager.get_headers();
        let body = serde_json::to_vec(&request)?;

        self.resilience
            .execute("invites.create", || async {
                let response = self
                    .transport
                    .send(
                        Method::POST,
                        url.clone(),
                        headers.clone(),
                        Some(Bytes::from(body.clone())),
                    )
                    .await?;

                let invite: Invite = serde_json::from_slice(response.body().as_ref())?;
                Ok(invite)
            })
            .await
    }

    async fn delete(&self, invite_id: &str) -> AnthropicResult<()> {
        let url = self
            .base_url
            .join(&format!("/v1/organizations/invites/{}", invite_id))
            .map_err(|e| crate::errors::AnthropicError::Configuration {
                message: format!("Invalid URL: {}", e),
            })?;

        let headers = self.auth_manager.get_headers();

        self.resilience
            .execute("invites.delete", || async {
                self.transport
                    .send(Method::DELETE, url.clone(), headers.clone(), None)
                    .await?;

                Ok(())
            })
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::AnthropicError;
    use crate::mocks::{MockAuthManager, MockHttpTransport, MockResilienceOrchestrator};
    use crate::services::admin::types::{InviteStatus, WorkspaceMemberRole};
    use http::{Response, StatusCode};
    use mockall::predicate::*;

    fn setup_service() -> (
        InvitesServiceImpl,
        Arc<MockHttpTransport>,
        Arc<MockAuthManager>,
        Arc<MockResilienceOrchestrator>,
    ) {
        let transport = Arc::new(MockHttpTransport::new());
        let auth_manager = Arc::new(MockAuthManager::new());
        let resilience = Arc::new(MockResilienceOrchestrator::new());
        let base_url = Url::parse("https://api.anthropic.com").unwrap();

        let service = InvitesServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
            base_url,
        );

        (service, transport, auth_manager, resilience)
    }

    #[tokio::test]
    async fn test_list_invites() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        let invites = vec![Invite {
            id: "inv-123".to_string(),
            email: "user@example.com".to_string(),
            workspace_id: "ws-123".to_string(),
            role: WorkspaceMemberRole::WorkspaceDeveloper,
            status: InviteStatus::Pending,
            created_at: "2024-01-01T00:00:00Z".to_string(),
            expires_at: "2024-01-08T00:00:00Z".to_string(),
        }];

        let list_response = ListResponse {
            data: invites,
            has_more: false,
            first_id: Some("inv-123".to_string()),
            last_id: Some("inv-123".to_string()),
        };

        auth_manager
            .expect_get_headers()
            .times(1)
            .returning(|| http::HeaderMap::new());

        let json = serde_json::to_vec(&list_response).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, body| {
                method == &Method::GET
                    && url.path() == "/v1/organizations/invites"
                    && body.is_none()
            })
            .returning(move |_, _, _, _| {
                Ok(Response::builder()
                    .status(StatusCode::OK)
                    .body(Bytes::from(json.clone()))
                    .unwrap())
            });

        resilience
            .expect_execute()
            .times(1)
            .returning(|_, f| Box::pin(async move { f().await }));

        let result = service.list(None).await;
        assert!(result.is_ok());
        let list = result.unwrap();
        assert_eq!(list.data.len(), 1);
        assert_eq!(list.data[0].id, "inv-123");
    }

    #[tokio::test]
    async fn test_get_invite() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        let expected_invite = Invite {
            id: "inv-123".to_string(),
            email: "user@example.com".to_string(),
            workspace_id: "ws-123".to_string(),
            role: WorkspaceMemberRole::WorkspaceDeveloper,
            status: InviteStatus::Pending,
            created_at: "2024-01-01T00:00:00Z".to_string(),
            expires_at: "2024-01-08T00:00:00Z".to_string(),
        };

        auth_manager
            .expect_get_headers()
            .times(1)
            .returning(|| http::HeaderMap::new());

        let json = serde_json::to_vec(&expected_invite).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, body| {
                method == &Method::GET
                    && url.path() == "/v1/organizations/invites/inv-123"
                    && body.is_none()
            })
            .returning(move |_, _, _, _| {
                Ok(Response::builder()
                    .status(StatusCode::OK)
                    .body(Bytes::from(json.clone()))
                    .unwrap())
            });

        resilience
            .expect_execute()
            .times(1)
            .returning(|_, f| Box::pin(async move { f().await }));

        let result = service.get("inv-123").await;
        assert!(result.is_ok());
        let invite = result.unwrap();
        assert_eq!(invite.id, "inv-123");
        assert_eq!(invite.email, "user@example.com");
    }

    #[tokio::test]
    async fn test_create_invite() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        let request = CreateInviteRequest {
            email: "newuser@example.com".to_string(),
            workspace_id: "ws-123".to_string(),
            role: WorkspaceMemberRole::WorkspaceUser,
        };

        let expected_invite = Invite {
            id: "inv-new".to_string(),
            email: "newuser@example.com".to_string(),
            workspace_id: "ws-123".to_string(),
            role: WorkspaceMemberRole::WorkspaceUser,
            status: InviteStatus::Pending,
            created_at: "2024-01-01T00:00:00Z".to_string(),
            expires_at: "2024-01-08T00:00:00Z".to_string(),
        };

        auth_manager
            .expect_get_headers()
            .times(1)
            .returning(|| http::HeaderMap::new());

        let json = serde_json::to_vec(&expected_invite).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, body| {
                method == &Method::POST
                    && url.path() == "/v1/organizations/invites"
                    && body.is_some()
            })
            .returning(move |_, _, _, _| {
                Ok(Response::builder()
                    .status(StatusCode::OK)
                    .body(Bytes::from(json.clone()))
                    .unwrap())
            });

        resilience
            .expect_execute()
            .times(1)
            .returning(|_, f| Box::pin(async move { f().await }));

        let result = service.create(request).await;
        assert!(result.is_ok());
        let invite = result.unwrap();
        assert_eq!(invite.email, "newuser@example.com");
        assert_eq!(invite.status, InviteStatus::Pending);
    }

    #[tokio::test]
    async fn test_delete_invite() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        auth_manager
            .expect_get_headers()
            .times(1)
            .returning(|| http::HeaderMap::new());

        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, body| {
                method == &Method::DELETE
                    && url.path() == "/v1/organizations/invites/inv-123"
                    && body.is_none()
            })
            .returning(|_, _, _, _| {
                Ok(Response::builder()
                    .status(StatusCode::NO_CONTENT)
                    .body(Bytes::new())
                    .unwrap())
            });

        resilience
            .expect_execute()
            .times(1)
            .returning(|_, f| Box::pin(async move { f().await }));

        let result = service.delete("inv-123").await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_list_with_pagination() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        let params = ListParams {
            before_id: Some("inv-100".to_string()),
            after_id: None,
            limit: Some(20),
        };

        let list_response = ListResponse {
            data: vec![],
            has_more: true,
            first_id: None,
            last_id: None,
        };

        auth_manager
            .expect_get_headers()
            .times(1)
            .returning(|| http::HeaderMap::new());

        let json = serde_json::to_vec(&list_response).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, body| {
                method == &Method::GET
                    && url.path() == "/v1/organizations/invites"
                    && url.query().is_some()
                    && url.query().unwrap().contains("before_id=inv-100")
                    && url.query().unwrap().contains("limit=20")
                    && body.is_none()
            })
            .returning(move |_, _, _, _| {
                Ok(Response::builder()
                    .status(StatusCode::OK)
                    .body(Bytes::from(json.clone()))
                    .unwrap())
            });

        resilience
            .expect_execute()
            .times(1)
            .returning(|_, f| Box::pin(async move { f().await }));

        let result = service.list(Some(params)).await;
        assert!(result.is_ok());
        let list = result.unwrap();
        assert!(list.has_more);
    }
}
