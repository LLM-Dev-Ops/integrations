//! Users service for the Admin API.

use crate::auth::AuthManager;
use crate::errors::AnthropicResult;
use crate::resilience::ResilienceOrchestrator;
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::Method;
use std::sync::Arc;
use url::Url;

use super::types::{ListParams, ListResponse, User};

/// Trait for users service operations
#[async_trait]
pub trait UsersService: Send + Sync {
    /// List all users in the organization
    async fn list(&self, params: Option<ListParams>) -> AnthropicResult<ListResponse<User>>;

    /// Get a specific user by ID
    async fn get(&self, user_id: &str) -> AnthropicResult<User>;

    /// Get the current authenticated user
    async fn get_me(&self) -> AnthropicResult<User>;
}

/// Implementation of the users service
pub struct UsersServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,
    base_url: Url,
}

impl UsersServiceImpl {
    /// Create a new users service
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
impl UsersService for UsersServiceImpl {
    async fn list(&self, params: Option<ListParams>) -> AnthropicResult<ListResponse<User>> {
        let url = self.build_list_url("/v1/organizations/users", params)?;
        let headers = self.auth_manager.get_headers();

        self.resilience
            .execute("users.list", || async {
                let response = self
                    .transport
                    .send(Method::GET, url.clone(), headers.clone(), None)
                    .await?;

                let list: ListResponse<User> = serde_json::from_slice(response.body().as_ref())?;
                Ok(list)
            })
            .await
    }

    async fn get(&self, user_id: &str) -> AnthropicResult<User> {
        let url = self
            .base_url
            .join(&format!("/v1/organizations/users/{}", user_id))
            .map_err(|e| crate::errors::AnthropicError::Configuration {
                message: format!("Invalid URL: {}", e),
            })?;

        let headers = self.auth_manager.get_headers();

        self.resilience
            .execute("users.get", || async {
                let response = self
                    .transport
                    .send(Method::GET, url.clone(), headers.clone(), None)
                    .await?;

                let user: User = serde_json::from_slice(response.body().as_ref())?;
                Ok(user)
            })
            .await
    }

    async fn get_me(&self) -> AnthropicResult<User> {
        let url = self
            .base_url
            .join("/v1/organizations/users/me")
            .map_err(|e| crate::errors::AnthropicError::Configuration {
                message: format!("Invalid URL: {}", e),
            })?;

        let headers = self.auth_manager.get_headers();

        self.resilience
            .execute("users.get_me", || async {
                let response = self
                    .transport
                    .send(Method::GET, url.clone(), headers.clone(), None)
                    .await?;

                let user: User = serde_json::from_slice(response.body().as_ref())?;
                Ok(user)
            })
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::AnthropicError;
    use crate::mocks::{MockAuthManager, MockHttpTransport, MockResilienceOrchestrator};
    use bytes::Bytes;
    use http::{Response, StatusCode};
    use mockall::predicate::*;

    fn setup_service() -> (
        UsersServiceImpl,
        Arc<MockHttpTransport>,
        Arc<MockAuthManager>,
        Arc<MockResilienceOrchestrator>,
    ) {
        let transport = Arc::new(MockHttpTransport::new());
        let auth_manager = Arc::new(MockAuthManager::new());
        let resilience = Arc::new(MockResilienceOrchestrator::new());
        let base_url = Url::parse("https://api.anthropic.com").unwrap();

        let service = UsersServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
            base_url,
        );

        (service, transport, auth_manager, resilience)
    }

    #[tokio::test]
    async fn test_list_users() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

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
                    && url.path() == "/v1/organizations/users"
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
        assert_eq!(list.data[0].id, "user-123");
    }

    #[tokio::test]
    async fn test_get_user() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        let expected_user = User {
            id: "user-123".to_string(),
            email: "user@example.com".to_string(),
            name: Some("Test User".to_string()),
            created_at: "2024-01-01T00:00:00Z".to_string(),
        };

        auth_manager
            .expect_get_headers()
            .times(1)
            .returning(|| http::HeaderMap::new());

        let json = serde_json::to_vec(&expected_user).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, body| {
                method == &Method::GET
                    && url.path() == "/v1/organizations/users/user-123"
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

        let result = service.get("user-123").await;
        assert!(result.is_ok());
        let user = result.unwrap();
        assert_eq!(user.id, "user-123");
        assert_eq!(user.email, "user@example.com");
    }

    #[tokio::test]
    async fn test_get_me() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        let expected_user = User {
            id: "user-me".to_string(),
            email: "me@example.com".to_string(),
            name: Some("Current User".to_string()),
            created_at: "2024-01-01T00:00:00Z".to_string(),
        };

        auth_manager
            .expect_get_headers()
            .times(1)
            .returning(|| http::HeaderMap::new());

        let json = serde_json::to_vec(&expected_user).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, body| {
                method == &Method::GET
                    && url.path() == "/v1/organizations/users/me"
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

        let result = service.get_me().await;
        assert!(result.is_ok());
        let user = result.unwrap();
        assert_eq!(user.id, "user-me");
        assert_eq!(user.name, Some("Current User".to_string()));
    }

    #[tokio::test]
    async fn test_list_with_params() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        let params = ListParams {
            before_id: None,
            after_id: Some("user-100".to_string()),
            limit: Some(50),
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
                    && url.path() == "/v1/organizations/users"
                    && url.query().is_some()
                    && url.query().unwrap().contains("after_id=user-100")
                    && url.query().unwrap().contains("limit=50")
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

    #[tokio::test]
    async fn test_get_user_not_found() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        auth_manager
            .expect_get_headers()
            .times(1)
            .returning(|| http::HeaderMap::new());

        transport
            .expect_send()
            .times(1)
            .returning(|_, _, _, _| {
                Err(AnthropicError::NotFound {
                    message: "User not found".to_string(),
                    resource_type: "user".to_string(),
                })
            });

        resilience
            .expect_execute()
            .times(1)
            .returning(|_, f| Box::pin(async move { f().await }));

        let result = service.get("user-nonexistent").await;
        assert!(result.is_err());
        assert!(matches!(result, Err(AnthropicError::NotFound { .. })));
    }
}
