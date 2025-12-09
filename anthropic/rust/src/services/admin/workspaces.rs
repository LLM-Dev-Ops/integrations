//! Workspaces service for the Admin API.

use crate::auth::AuthManager;
use crate::errors::AnthropicResult;
use crate::resilience::ResilienceOrchestrator;
use crate::transport::HttpTransport;
use async_trait::async_trait;
use bytes::Bytes;
use http::Method;
use std::sync::Arc;
use url::Url;

use super::types::{
    AddWorkspaceMemberRequest, CreateWorkspaceRequest, ListParams, ListResponse,
    UpdateWorkspaceMemberRequest, UpdateWorkspaceRequest, Workspace, WorkspaceMember,
};

/// Trait for workspaces service operations
#[async_trait]
pub trait WorkspacesService: Send + Sync {
    /// List all workspaces
    async fn list(&self, params: Option<ListParams>) -> AnthropicResult<ListResponse<Workspace>>;

    /// Get a specific workspace by ID
    async fn get(&self, workspace_id: &str) -> AnthropicResult<Workspace>;

    /// Create a new workspace
    async fn create(&self, request: CreateWorkspaceRequest) -> AnthropicResult<Workspace>;

    /// Update a workspace
    async fn update(
        &self,
        workspace_id: &str,
        request: UpdateWorkspaceRequest,
    ) -> AnthropicResult<Workspace>;

    /// Archive a workspace
    async fn archive(&self, workspace_id: &str) -> AnthropicResult<Workspace>;

    /// List members of a workspace
    async fn list_members(
        &self,
        workspace_id: &str,
        params: Option<ListParams>,
    ) -> AnthropicResult<ListResponse<WorkspaceMember>>;

    /// Add a member to a workspace
    async fn add_member(
        &self,
        workspace_id: &str,
        request: AddWorkspaceMemberRequest,
    ) -> AnthropicResult<WorkspaceMember>;

    /// Get a specific workspace member
    async fn get_member(
        &self,
        workspace_id: &str,
        user_id: &str,
    ) -> AnthropicResult<WorkspaceMember>;

    /// Update a workspace member's role
    async fn update_member(
        &self,
        workspace_id: &str,
        user_id: &str,
        request: UpdateWorkspaceMemberRequest,
    ) -> AnthropicResult<WorkspaceMember>;

    /// Remove a member from a workspace
    async fn remove_member(&self, workspace_id: &str, user_id: &str) -> AnthropicResult<()>;
}

/// Implementation of the workspaces service
pub struct WorkspacesServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,
    base_url: Url,
}

impl WorkspacesServiceImpl {
    /// Create a new workspaces service
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
impl WorkspacesService for WorkspacesServiceImpl {
    async fn list(&self, params: Option<ListParams>) -> AnthropicResult<ListResponse<Workspace>> {
        let url = self.build_list_url("/v1/organizations/workspaces", params)?;
        let headers = self.auth_manager.get_headers();

        self.resilience
            .execute("workspaces.list", || async {
                let response = self
                    .transport
                    .send(Method::GET, url.clone(), headers.clone(), None)
                    .await?;

                let list: ListResponse<Workspace> =
                    serde_json::from_slice(response.body().as_ref())?;
                Ok(list)
            })
            .await
    }

    async fn get(&self, workspace_id: &str) -> AnthropicResult<Workspace> {
        let url = self
            .base_url
            .join(&format!("/v1/organizations/workspaces/{}", workspace_id))
            .map_err(|e| crate::errors::AnthropicError::Configuration {
                message: format!("Invalid URL: {}", e),
            })?;

        let headers = self.auth_manager.get_headers();

        self.resilience
            .execute("workspaces.get", || async {
                let response = self
                    .transport
                    .send(Method::GET, url.clone(), headers.clone(), None)
                    .await?;

                let workspace: Workspace = serde_json::from_slice(response.body().as_ref())?;
                Ok(workspace)
            })
            .await
    }

    async fn create(&self, request: CreateWorkspaceRequest) -> AnthropicResult<Workspace> {
        let url = self
            .base_url
            .join("/v1/organizations/workspaces")
            .map_err(|e| crate::errors::AnthropicError::Configuration {
                message: format!("Invalid URL: {}", e),
            })?;

        let headers = self.auth_manager.get_headers();
        let body = serde_json::to_vec(&request)?;

        self.resilience
            .execute("workspaces.create", || async {
                let response = self
                    .transport
                    .send(
                        Method::POST,
                        url.clone(),
                        headers.clone(),
                        Some(Bytes::from(body.clone())),
                    )
                    .await?;

                let workspace: Workspace = serde_json::from_slice(response.body().as_ref())?;
                Ok(workspace)
            })
            .await
    }

    async fn update(
        &self,
        workspace_id: &str,
        request: UpdateWorkspaceRequest,
    ) -> AnthropicResult<Workspace> {
        let url = self
            .base_url
            .join(&format!("/v1/organizations/workspaces/{}", workspace_id))
            .map_err(|e| crate::errors::AnthropicError::Configuration {
                message: format!("Invalid URL: {}", e),
            })?;

        let headers = self.auth_manager.get_headers();
        let body = serde_json::to_vec(&request)?;

        self.resilience
            .execute("workspaces.update", || async {
                let response = self
                    .transport
                    .send(
                        Method::POST,
                        url.clone(),
                        headers.clone(),
                        Some(Bytes::from(body.clone())),
                    )
                    .await?;

                let workspace: Workspace = serde_json::from_slice(response.body().as_ref())?;
                Ok(workspace)
            })
            .await
    }

    async fn archive(&self, workspace_id: &str) -> AnthropicResult<Workspace> {
        let url = self
            .base_url
            .join(&format!(
                "/v1/organizations/workspaces/{}/archive",
                workspace_id
            ))
            .map_err(|e| crate::errors::AnthropicError::Configuration {
                message: format!("Invalid URL: {}", e),
            })?;

        let headers = self.auth_manager.get_headers();

        self.resilience
            .execute("workspaces.archive", || async {
                let response = self
                    .transport
                    .send(Method::POST, url.clone(), headers.clone(), None)
                    .await?;

                let workspace: Workspace = serde_json::from_slice(response.body().as_ref())?;
                Ok(workspace)
            })
            .await
    }

    async fn list_members(
        &self,
        workspace_id: &str,
        params: Option<ListParams>,
    ) -> AnthropicResult<ListResponse<WorkspaceMember>> {
        let url = self.build_list_url(
            &format!("/v1/organizations/workspaces/{}/members", workspace_id),
            params,
        )?;

        let headers = self.auth_manager.get_headers();

        self.resilience
            .execute("workspaces.list_members", || async {
                let response = self
                    .transport
                    .send(Method::GET, url.clone(), headers.clone(), None)
                    .await?;

                let list: ListResponse<WorkspaceMember> =
                    serde_json::from_slice(response.body().as_ref())?;
                Ok(list)
            })
            .await
    }

    async fn add_member(
        &self,
        workspace_id: &str,
        request: AddWorkspaceMemberRequest,
    ) -> AnthropicResult<WorkspaceMember> {
        let url = self
            .base_url
            .join(&format!("/v1/organizations/workspaces/{}/members", workspace_id))
            .map_err(|e| crate::errors::AnthropicError::Configuration {
                message: format!("Invalid URL: {}", e),
            })?;

        let headers = self.auth_manager.get_headers();
        let body = serde_json::to_vec(&request)?;

        self.resilience
            .execute("workspaces.add_member", || async {
                let response = self
                    .transport
                    .send(
                        Method::POST,
                        url.clone(),
                        headers.clone(),
                        Some(Bytes::from(body.clone())),
                    )
                    .await?;

                let member: WorkspaceMember = serde_json::from_slice(response.body().as_ref())?;
                Ok(member)
            })
            .await
    }

    async fn get_member(
        &self,
        workspace_id: &str,
        user_id: &str,
    ) -> AnthropicResult<WorkspaceMember> {
        let url = self
            .base_url
            .join(&format!(
                "/v1/organizations/workspaces/{}/members/{}",
                workspace_id, user_id
            ))
            .map_err(|e| crate::errors::AnthropicError::Configuration {
                message: format!("Invalid URL: {}", e),
            })?;

        let headers = self.auth_manager.get_headers();

        self.resilience
            .execute("workspaces.get_member", || async {
                let response = self
                    .transport
                    .send(Method::GET, url.clone(), headers.clone(), None)
                    .await?;

                let member: WorkspaceMember = serde_json::from_slice(response.body().as_ref())?;
                Ok(member)
            })
            .await
    }

    async fn update_member(
        &self,
        workspace_id: &str,
        user_id: &str,
        request: UpdateWorkspaceMemberRequest,
    ) -> AnthropicResult<WorkspaceMember> {
        let url = self
            .base_url
            .join(&format!(
                "/v1/organizations/workspaces/{}/members/{}",
                workspace_id, user_id
            ))
            .map_err(|e| crate::errors::AnthropicError::Configuration {
                message: format!("Invalid URL: {}", e),
            })?;

        let headers = self.auth_manager.get_headers();
        let body = serde_json::to_vec(&request)?;

        self.resilience
            .execute("workspaces.update_member", || async {
                let response = self
                    .transport
                    .send(
                        Method::POST,
                        url.clone(),
                        headers.clone(),
                        Some(Bytes::from(body.clone())),
                    )
                    .await?;

                let member: WorkspaceMember = serde_json::from_slice(response.body().as_ref())?;
                Ok(member)
            })
            .await
    }

    async fn remove_member(&self, workspace_id: &str, user_id: &str) -> AnthropicResult<()> {
        let url = self
            .base_url
            .join(&format!(
                "/v1/organizations/workspaces/{}/members/{}",
                workspace_id, user_id
            ))
            .map_err(|e| crate::errors::AnthropicError::Configuration {
                message: format!("Invalid URL: {}", e),
            })?;

        let headers = self.auth_manager.get_headers();

        self.resilience
            .execute("workspaces.remove_member", || async {
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
    use crate::services::admin::types::WorkspaceMemberRole;
    use http::{Response, StatusCode};
    use mockall::predicate::*;

    fn setup_service() -> (
        WorkspacesServiceImpl,
        Arc<MockHttpTransport>,
        Arc<MockAuthManager>,
        Arc<MockResilienceOrchestrator>,
    ) {
        let transport = Arc::new(MockHttpTransport::new());
        let auth_manager = Arc::new(MockAuthManager::new());
        let resilience = Arc::new(MockResilienceOrchestrator::new());
        let base_url = Url::parse("https://api.anthropic.com").unwrap();

        let service = WorkspacesServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
            base_url,
        );

        (service, transport, auth_manager, resilience)
    }

    #[tokio::test]
    async fn test_list_workspaces() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        let workspaces = vec![Workspace {
            id: "ws-123".to_string(),
            name: "Test Workspace".to_string(),
            organization_id: "org-123".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            archived_at: None,
        }];

        let list_response = ListResponse {
            data: workspaces,
            has_more: false,
            first_id: Some("ws-123".to_string()),
            last_id: Some("ws-123".to_string()),
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
                    && url.path() == "/v1/organizations/workspaces"
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
        assert_eq!(list.data[0].id, "ws-123");
    }

    #[tokio::test]
    async fn test_create_workspace() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        let request = CreateWorkspaceRequest {
            name: "New Workspace".to_string(),
        };

        let expected_workspace = Workspace {
            id: "ws-new".to_string(),
            name: "New Workspace".to_string(),
            organization_id: "org-123".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            archived_at: None,
        };

        auth_manager
            .expect_get_headers()
            .times(1)
            .returning(|| http::HeaderMap::new());

        let json = serde_json::to_vec(&expected_workspace).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, body| {
                method == &Method::POST
                    && url.path() == "/v1/organizations/workspaces"
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
        let workspace = result.unwrap();
        assert_eq!(workspace.name, "New Workspace");
    }

    #[tokio::test]
    async fn test_archive_workspace() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        let expected_workspace = Workspace {
            id: "ws-123".to_string(),
            name: "Test Workspace".to_string(),
            organization_id: "org-123".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            archived_at: Some("2024-01-02T00:00:00Z".to_string()),
        };

        auth_manager
            .expect_get_headers()
            .times(1)
            .returning(|| http::HeaderMap::new());

        let json = serde_json::to_vec(&expected_workspace).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, _| {
                method == &Method::POST && url.path() == "/v1/organizations/workspaces/ws-123/archive"
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

        let result = service.archive("ws-123").await;
        assert!(result.is_ok());
        let workspace = result.unwrap();
        assert!(workspace.archived_at.is_some());
    }

    #[tokio::test]
    async fn test_add_member() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        let request = AddWorkspaceMemberRequest {
            user_id: "user-123".to_string(),
            role: WorkspaceMemberRole::WorkspaceDeveloper,
        };

        let expected_member = WorkspaceMember {
            user_id: "user-123".to_string(),
            workspace_id: "ws-123".to_string(),
            role: WorkspaceMemberRole::WorkspaceDeveloper,
            added_at: "2024-01-01T00:00:00Z".to_string(),
        };

        auth_manager
            .expect_get_headers()
            .times(1)
            .returning(|| http::HeaderMap::new());

        let json = serde_json::to_vec(&expected_member).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, body| {
                method == &Method::POST
                    && url.path() == "/v1/organizations/workspaces/ws-123/members"
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

        let result = service.add_member("ws-123", request).await;
        assert!(result.is_ok());
        let member = result.unwrap();
        assert_eq!(member.user_id, "user-123");
    }

    #[tokio::test]
    async fn test_remove_member() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        auth_manager
            .expect_get_headers()
            .times(1)
            .returning(|| http::HeaderMap::new());

        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, _| {
                method == &Method::DELETE
                    && url.path() == "/v1/organizations/workspaces/ws-123/members/user-123"
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

        let result = service.remove_member("ws-123", "user-123").await;
        assert!(result.is_ok());
    }
}
