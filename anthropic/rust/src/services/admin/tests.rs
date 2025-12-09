//! Comprehensive integration tests for Admin API services.
//!
//! These tests use London-School TDD with mocks to verify the behavior
//! of all admin services.

use super::*;
use crate::errors::AnthropicError;
use crate::mocks::{MockAuthManager, MockHttpTransport, MockResilienceOrchestrator};
use bytes::Bytes;
use http::{Method, Response, StatusCode};
use mockall::predicate::*;
use std::sync::Arc;
use url::Url;

// Helper function to create mock services
fn create_mocks() -> (
    Arc<MockHttpTransport>,
    Arc<MockAuthManager>,
    Arc<MockResilienceOrchestrator>,
    Url,
) {
    let transport = Arc::new(MockHttpTransport::new());
    let auth_manager = Arc::new(MockAuthManager::new());
    let resilience = Arc::new(MockResilienceOrchestrator::new());
    let base_url = Url::parse("https://api.anthropic.com").unwrap();

    (transport, auth_manager, resilience, base_url)
}

mod organizations_tests {
    use super::*;

    #[tokio::test]
    async fn test_organizations_lifecycle() {
        let (mut transport, mut auth_manager, mut resilience, base_url) = create_mocks();

        // Setup mock expectations
        auth_manager
            .expect_get_headers()
            .times(2)
            .returning(|| http::HeaderMap::new());

        // Test GET organization
        let org = Organization {
            id: "org-123".to_string(),
            name: "Test Org".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
        };

        let org_json = serde_json::to_vec(&org).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, _| {
                method == &Method::GET && url.path() == "/v1/organizations/me"
            })
            .returning(move |_, _, _, _| {
                Ok(Response::builder()
                    .status(StatusCode::OK)
                    .body(Bytes::from(org_json.clone()))
                    .unwrap())
            });

        // Test UPDATE organization
        let updated_org = Organization {
            id: "org-123".to_string(),
            name: "Updated Org".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-02T00:00:00Z".to_string(),
        };

        let updated_json = serde_json::to_vec(&updated_org).unwrap();
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
                    .body(Bytes::from(updated_json.clone()))
                    .unwrap())
            });

        resilience
            .expect_execute()
            .times(2)
            .returning(|_, f| Box::pin(async move { f().await }));

        let service = OrganizationsServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
            base_url,
        );

        // Get organization
        let result = service.get().await;
        assert!(result.is_ok());
        let org = result.unwrap();
        assert_eq!(org.name, "Test Org");

        // Update organization
        let update_req = UpdateOrganizationRequest {
            name: "Updated Org".to_string(),
        };
        let result = service.update(update_req).await;
        assert!(result.is_ok());
        let org = result.unwrap();
        assert_eq!(org.name, "Updated Org");
    }
}

mod workspaces_tests {
    use super::*;

    #[tokio::test]
    async fn test_workspace_crud_operations() {
        let (mut transport, mut auth_manager, mut resilience, base_url) = create_mocks();

        auth_manager
            .expect_get_headers()
            .times(4)
            .returning(|| http::HeaderMap::new());

        // CREATE workspace
        let workspace = Workspace {
            id: "ws-new".to_string(),
            name: "New Workspace".to_string(),
            organization_id: "org-123".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            archived_at: None,
        };

        let ws_json = serde_json::to_vec(&workspace).unwrap();
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
                    .body(Bytes::from(ws_json.clone()))
                    .unwrap())
            });

        // GET workspace
        let get_json = serde_json::to_vec(&workspace).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, _| {
                method == &Method::GET && url.path() == "/v1/organizations/workspaces/ws-new"
            })
            .returning(move |_, _, _, _| {
                Ok(Response::builder()
                    .status(StatusCode::OK)
                    .body(Bytes::from(get_json.clone()))
                    .unwrap())
            });

        // UPDATE workspace
        let updated_ws = Workspace {
            id: "ws-new".to_string(),
            name: "Updated Workspace".to_string(),
            organization_id: "org-123".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            archived_at: None,
        };

        let update_json = serde_json::to_vec(&updated_ws).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, body| {
                method == &Method::POST
                    && url.path() == "/v1/organizations/workspaces/ws-new"
                    && body.is_some()
            })
            .returning(move |_, _, _, _| {
                Ok(Response::builder()
                    .status(StatusCode::OK)
                    .body(Bytes::from(update_json.clone()))
                    .unwrap())
            });

        // ARCHIVE workspace
        let archived_ws = Workspace {
            id: "ws-new".to_string(),
            name: "Updated Workspace".to_string(),
            organization_id: "org-123".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            archived_at: Some("2024-01-02T00:00:00Z".to_string()),
        };

        let archive_json = serde_json::to_vec(&archived_ws).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, _| {
                method == &Method::POST
                    && url.path() == "/v1/organizations/workspaces/ws-new/archive"
            })
            .returning(move |_, _, _, _| {
                Ok(Response::builder()
                    .status(StatusCode::OK)
                    .body(Bytes::from(archive_json.clone()))
                    .unwrap())
            });

        resilience
            .expect_execute()
            .times(4)
            .returning(|_, f| Box::pin(async move { f().await }));

        let service = WorkspacesServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
            base_url,
        );

        // Create
        let create_req = CreateWorkspaceRequest {
            name: "New Workspace".to_string(),
        };
        let result = service.create(create_req).await;
        assert!(result.is_ok());

        // Get
        let result = service.get("ws-new").await;
        assert!(result.is_ok());

        // Update
        let update_req = UpdateWorkspaceRequest {
            name: Some("Updated Workspace".to_string()),
        };
        let result = service.update("ws-new", update_req).await;
        assert!(result.is_ok());

        // Archive
        let result = service.archive("ws-new").await;
        assert!(result.is_ok());
        let ws = result.unwrap();
        assert!(ws.archived_at.is_some());
    }

    #[tokio::test]
    async fn test_workspace_member_management() {
        let (mut transport, mut auth_manager, mut resilience, base_url) = create_mocks();

        auth_manager
            .expect_get_headers()
            .times(3)
            .returning(|| http::HeaderMap::new());

        // ADD member
        let member = WorkspaceMember {
            user_id: "user-123".to_string(),
            workspace_id: "ws-123".to_string(),
            role: WorkspaceMemberRole::WorkspaceDeveloper,
            added_at: "2024-01-01T00:00:00Z".to_string(),
        };

        let member_json = serde_json::to_vec(&member).unwrap();
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
                    .body(Bytes::from(member_json.clone()))
                    .unwrap())
            });

        // UPDATE member
        let updated_member = WorkspaceMember {
            user_id: "user-123".to_string(),
            workspace_id: "ws-123".to_string(),
            role: WorkspaceMemberRole::WorkspaceAdmin,
            added_at: "2024-01-01T00:00:00Z".to_string(),
        };

        let update_json = serde_json::to_vec(&updated_member).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, body| {
                method == &Method::POST
                    && url.path() == "/v1/organizations/workspaces/ws-123/members/user-123"
                    && body.is_some()
            })
            .returning(move |_, _, _, _| {
                Ok(Response::builder()
                    .status(StatusCode::OK)
                    .body(Bytes::from(update_json.clone()))
                    .unwrap())
            });

        // REMOVE member
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
            .times(3)
            .returning(|_, f| Box::pin(async move { f().await }));

        let service = WorkspacesServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
            base_url,
        );

        // Add member
        let add_req = AddWorkspaceMemberRequest {
            user_id: "user-123".to_string(),
            role: WorkspaceMemberRole::WorkspaceDeveloper,
        };
        let result = service.add_member("ws-123", add_req).await;
        assert!(result.is_ok());

        // Update member
        let update_req = UpdateWorkspaceMemberRequest {
            role: WorkspaceMemberRole::WorkspaceAdmin,
        };
        let result = service.update_member("ws-123", "user-123", update_req).await;
        assert!(result.is_ok());
        let member = result.unwrap();
        assert_eq!(member.role, WorkspaceMemberRole::WorkspaceAdmin);

        // Remove member
        let result = service.remove_member("ws-123", "user-123").await;
        assert!(result.is_ok());
    }
}

mod api_keys_tests {
    use super::*;

    #[tokio::test]
    async fn test_api_key_lifecycle() {
        let (mut transport, mut auth_manager, mut resilience, base_url) = create_mocks();

        auth_manager
            .expect_get_headers()
            .times(3)
            .returning(|| http::HeaderMap::new());

        // CREATE API key
        let api_key_with_secret = ApiKeyWithSecret {
            api_key: ApiKey {
                id: "key-new".to_string(),
                name: "Test Key".to_string(),
                workspace_id: "ws-123".to_string(),
                created_at: "2024-01-01T00:00:00Z".to_string(),
                status: ApiKeyStatus::Active,
                partial_key_hint: "1234".to_string(),
            },
            api_key_secret: "sk-ant-secret123".to_string(),
        };

        let create_json = serde_json::to_vec(&api_key_with_secret).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, body| {
                method == &Method::POST
                    && url.path() == "/v1/organizations/api_keys"
                    && body.is_some()
            })
            .returning(move |_, _, _, _| {
                Ok(Response::builder()
                    .status(StatusCode::OK)
                    .body(Bytes::from(create_json.clone()))
                    .unwrap())
            });

        // GET API key
        let get_json = serde_json::to_vec(&api_key_with_secret.api_key).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, _| {
                method == &Method::GET && url.path() == "/v1/organizations/api_keys/key-new"
            })
            .returning(move |_, _, _, _| {
                Ok(Response::builder()
                    .status(StatusCode::OK)
                    .body(Bytes::from(get_json.clone()))
                    .unwrap())
            });

        // UPDATE API key (disable)
        let updated_key = ApiKey {
            id: "key-new".to_string(),
            name: "Test Key".to_string(),
            workspace_id: "ws-123".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            status: ApiKeyStatus::Disabled,
            partial_key_hint: "1234".to_string(),
        };

        let update_json = serde_json::to_vec(&updated_key).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, body| {
                method == &Method::POST
                    && url.path() == "/v1/organizations/api_keys/key-new"
                    && body.is_some()
            })
            .returning(move |_, _, _, _| {
                Ok(Response::builder()
                    .status(StatusCode::OK)
                    .body(Bytes::from(update_json.clone()))
                    .unwrap())
            });

        resilience
            .expect_execute()
            .times(3)
            .returning(|_, f| Box::pin(async move { f().await }));

        let service = ApiKeysServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
            base_url,
        );

        // Create
        let create_req = CreateApiKeyRequest {
            name: "Test Key".to_string(),
            workspace_id: "ws-123".to_string(),
        };
        let result = service.create(create_req).await;
        assert!(result.is_ok());
        let key = result.unwrap();
        assert_eq!(key.api_key_secret, "sk-ant-secret123");

        // Get
        let result = service.get("key-new").await;
        assert!(result.is_ok());

        // Update (disable)
        let update_req = UpdateApiKeyRequest {
            name: None,
            status: Some(ApiKeyStatus::Disabled),
        };
        let result = service.update("key-new", update_req).await;
        assert!(result.is_ok());
        let key = result.unwrap();
        assert_eq!(key.status, ApiKeyStatus::Disabled);
    }
}

mod invites_tests {
    use super::*;

    #[tokio::test]
    async fn test_invite_flow() {
        let (mut transport, mut auth_manager, mut resilience, base_url) = create_mocks();

        auth_manager
            .expect_get_headers()
            .times(3)
            .returning(|| http::HeaderMap::new());

        // CREATE invite
        let invite = Invite {
            id: "inv-new".to_string(),
            email: "newuser@example.com".to_string(),
            workspace_id: "ws-123".to_string(),
            role: WorkspaceMemberRole::WorkspaceUser,
            status: InviteStatus::Pending,
            created_at: "2024-01-01T00:00:00Z".to_string(),
            expires_at: "2024-01-08T00:00:00Z".to_string(),
        };

        let create_json = serde_json::to_vec(&invite).unwrap();
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
                    .body(Bytes::from(create_json.clone()))
                    .unwrap())
            });

        // GET invite
        let get_json = serde_json::to_vec(&invite).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, _| {
                method == &Method::GET && url.path() == "/v1/organizations/invites/inv-new"
            })
            .returning(move |_, _, _, _| {
                Ok(Response::builder()
                    .status(StatusCode::OK)
                    .body(Bytes::from(get_json.clone()))
                    .unwrap())
            });

        // DELETE invite
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, _| {
                method == &Method::DELETE && url.path() == "/v1/organizations/invites/inv-new"
            })
            .returning(|_, _, _, _| {
                Ok(Response::builder()
                    .status(StatusCode::NO_CONTENT)
                    .body(Bytes::new())
                    .unwrap())
            });

        resilience
            .expect_execute()
            .times(3)
            .returning(|_, f| Box::pin(async move { f().await }));

        let service = InvitesServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
            base_url,
        );

        // Create invite
        let create_req = CreateInviteRequest {
            email: "newuser@example.com".to_string(),
            workspace_id: "ws-123".to_string(),
            role: WorkspaceMemberRole::WorkspaceUser,
        };
        let result = service.create(create_req).await;
        assert!(result.is_ok());

        // Get invite
        let result = service.get("inv-new").await;
        assert!(result.is_ok());
        let invite = result.unwrap();
        assert_eq!(invite.status, InviteStatus::Pending);

        // Delete invite
        let result = service.delete("inv-new").await;
        assert!(result.is_ok());
    }
}

mod users_tests {
    use super::*;

    #[tokio::test]
    async fn test_user_operations() {
        let (mut transport, mut auth_manager, mut resilience, base_url) = create_mocks();

        auth_manager
            .expect_get_headers()
            .times(2)
            .returning(|| http::HeaderMap::new());

        // LIST users
        let users = vec![User {
            id: "user-123".to_string(),
            email: "user@example.com".to_string(),
            name: Some("Test User".to_string()),
            created_at: "2024-01-01T00:00:00Z".to_string(),
        }];

        let list_response = ListResponse {
            data: users,
            has_more: false,
            first_id: Some("user-123".to_string()),
            last_id: Some("user-123".to_string()),
        };

        let list_json = serde_json::to_vec(&list_response).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, _| {
                method == &Method::GET && url.path() == "/v1/organizations/users"
            })
            .returning(move |_, _, _, _| {
                Ok(Response::builder()
                    .status(StatusCode::OK)
                    .body(Bytes::from(list_json.clone()))
                    .unwrap())
            });

        // GET me
        let me = User {
            id: "user-me".to_string(),
            email: "me@example.com".to_string(),
            name: Some("Current User".to_string()),
            created_at: "2024-01-01T00:00:00Z".to_string(),
        };

        let me_json = serde_json::to_vec(&me).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, _| {
                method == &Method::GET && url.path() == "/v1/organizations/users/me"
            })
            .returning(move |_, _, _, _| {
                Ok(Response::builder()
                    .status(StatusCode::OK)
                    .body(Bytes::from(me_json.clone()))
                    .unwrap())
            });

        resilience
            .expect_execute()
            .times(2)
            .returning(|_, f| Box::pin(async move { f().await }));

        let service = UsersServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
            base_url,
        );

        // List users
        let result = service.list(None).await;
        assert!(result.is_ok());
        let list = result.unwrap();
        assert_eq!(list.data.len(), 1);

        // Get current user
        let result = service.get_me().await;
        assert!(result.is_ok());
        let user = result.unwrap();
        assert_eq!(user.id, "user-me");
    }
}

mod error_handling_tests {
    use super::*;

    #[tokio::test]
    async fn test_authentication_error() {
        let (mut transport, mut auth_manager, mut resilience, base_url) = create_mocks();

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

        let service = OrganizationsServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
            base_url,
        );

        let result = service.get().await;
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            AnthropicError::Authentication { .. }
        ));
    }

    #[tokio::test]
    async fn test_not_found_error() {
        let (mut transport, mut auth_manager, mut resilience, base_url) = create_mocks();

        auth_manager
            .expect_get_headers()
            .times(1)
            .returning(|| http::HeaderMap::new());

        transport
            .expect_send()
            .times(1)
            .returning(|_, _, _, _| {
                Err(AnthropicError::NotFound {
                    message: "Workspace not found".to_string(),
                    resource_type: "workspace".to_string(),
                })
            });

        resilience
            .expect_execute()
            .times(1)
            .returning(|_, f| Box::pin(async move { f().await }));

        let service = WorkspacesServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
            base_url,
        );

        let result = service.get("ws-nonexistent").await;
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            AnthropicError::NotFound { .. }
        ));
    }
}
