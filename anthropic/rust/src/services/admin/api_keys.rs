//! API Keys service for the Admin API.

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
    ApiKey, ApiKeyWithSecret, CreateApiKeyRequest, ListParams, ListResponse, UpdateApiKeyRequest,
};

/// Trait for API keys service operations
#[async_trait]
pub trait ApiKeysService: Send + Sync {
    /// List all API keys
    async fn list(&self, params: Option<ListParams>) -> AnthropicResult<ListResponse<ApiKey>>;

    /// Get a specific API key by ID
    async fn get(&self, api_key_id: &str) -> AnthropicResult<ApiKey>;

    /// Create a new API key
    ///
    /// Returns the API key with the secret. The secret is only returned once,
    /// so it should be stored securely.
    async fn create(&self, request: CreateApiKeyRequest) -> AnthropicResult<ApiKeyWithSecret>;

    /// Update an API key
    async fn update(
        &self,
        api_key_id: &str,
        request: UpdateApiKeyRequest,
    ) -> AnthropicResult<ApiKey>;
}

/// Implementation of the API keys service
pub struct ApiKeysServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,
    base_url: Url,
}

impl ApiKeysServiceImpl {
    /// Create a new API keys service
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
impl ApiKeysService for ApiKeysServiceImpl {
    async fn list(&self, params: Option<ListParams>) -> AnthropicResult<ListResponse<ApiKey>> {
        let url = self.build_list_url("/v1/organizations/api_keys", params)?;
        let headers = self.auth_manager.get_headers();

        self.resilience
            .execute("api_keys.list", || async {
                let response = self
                    .transport
                    .send(Method::GET, url.clone(), headers.clone(), None)
                    .await?;

                let list: ListResponse<ApiKey> =
                    serde_json::from_slice(response.body().as_ref())?;
                Ok(list)
            })
            .await
    }

    async fn get(&self, api_key_id: &str) -> AnthropicResult<ApiKey> {
        let url = self
            .base_url
            .join(&format!("/v1/organizations/api_keys/{}", api_key_id))
            .map_err(|e| crate::errors::AnthropicError::Configuration {
                message: format!("Invalid URL: {}", e),
            })?;

        let headers = self.auth_manager.get_headers();

        self.resilience
            .execute("api_keys.get", || async {
                let response = self
                    .transport
                    .send(Method::GET, url.clone(), headers.clone(), None)
                    .await?;

                let api_key: ApiKey = serde_json::from_slice(response.body().as_ref())?;
                Ok(api_key)
            })
            .await
    }

    async fn create(&self, request: CreateApiKeyRequest) -> AnthropicResult<ApiKeyWithSecret> {
        let url = self
            .base_url
            .join("/v1/organizations/api_keys")
            .map_err(|e| crate::errors::AnthropicError::Configuration {
                message: format!("Invalid URL: {}", e),
            })?;

        let headers = self.auth_manager.get_headers();
        let body = serde_json::to_vec(&request)?;

        self.resilience
            .execute("api_keys.create", || async {
                let response = self
                    .transport
                    .send(
                        Method::POST,
                        url.clone(),
                        headers.clone(),
                        Some(Bytes::from(body.clone())),
                    )
                    .await?;

                let api_key: ApiKeyWithSecret = serde_json::from_slice(response.body().as_ref())?;
                Ok(api_key)
            })
            .await
    }

    async fn update(
        &self,
        api_key_id: &str,
        request: UpdateApiKeyRequest,
    ) -> AnthropicResult<ApiKey> {
        let url = self
            .base_url
            .join(&format!("/v1/organizations/api_keys/{}", api_key_id))
            .map_err(|e| crate::errors::AnthropicError::Configuration {
                message: format!("Invalid URL: {}", e),
            })?;

        let headers = self.auth_manager.get_headers();
        let body = serde_json::to_vec(&request)?;

        self.resilience
            .execute("api_keys.update", || async {
                let response = self
                    .transport
                    .send(
                        Method::POST,
                        url.clone(),
                        headers.clone(),
                        Some(Bytes::from(body.clone())),
                    )
                    .await?;

                let api_key: ApiKey = serde_json::from_slice(response.body().as_ref())?;
                Ok(api_key)
            })
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::AnthropicError;
    use crate::mocks::{MockAuthManager, MockHttpTransport, MockResilienceOrchestrator};
    use crate::services::admin::types::ApiKeyStatus;
    use http::{Response, StatusCode};
    use mockall::predicate::*;

    fn setup_service() -> (
        ApiKeysServiceImpl,
        Arc<MockHttpTransport>,
        Arc<MockAuthManager>,
        Arc<MockResilienceOrchestrator>,
    ) {
        let transport = Arc::new(MockHttpTransport::new());
        let auth_manager = Arc::new(MockAuthManager::new());
        let resilience = Arc::new(MockResilienceOrchestrator::new());
        let base_url = Url::parse("https://api.anthropic.com").unwrap();

        let service = ApiKeysServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
            base_url,
        );

        (service, transport, auth_manager, resilience)
    }

    #[tokio::test]
    async fn test_list_api_keys() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        let api_keys = vec![ApiKey {
            id: "key-123".to_string(),
            name: "Test Key".to_string(),
            workspace_id: "ws-123".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            status: ApiKeyStatus::Active,
            partial_key_hint: "1234".to_string(),
        }];

        let list_response = ListResponse {
            data: api_keys,
            has_more: false,
            first_id: Some("key-123".to_string()),
            last_id: Some("key-123".to_string()),
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
                    && url.path() == "/v1/organizations/api_keys"
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
        assert_eq!(list.data[0].id, "key-123");
    }

    #[tokio::test]
    async fn test_get_api_key() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        let expected_key = ApiKey {
            id: "key-123".to_string(),
            name: "Test Key".to_string(),
            workspace_id: "ws-123".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            status: ApiKeyStatus::Active,
            partial_key_hint: "1234".to_string(),
        };

        auth_manager
            .expect_get_headers()
            .times(1)
            .returning(|| http::HeaderMap::new());

        let json = serde_json::to_vec(&expected_key).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, body| {
                method == &Method::GET
                    && url.path() == "/v1/organizations/api_keys/key-123"
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

        let result = service.get("key-123").await;
        assert!(result.is_ok());
        let key = result.unwrap();
        assert_eq!(key.id, "key-123");
        assert_eq!(key.name, "Test Key");
    }

    #[tokio::test]
    async fn test_create_api_key() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        let request = CreateApiKeyRequest {
            name: "New Key".to_string(),
            workspace_id: "ws-123".to_string(),
        };

        let expected_key = ApiKeyWithSecret {
            api_key: ApiKey {
                id: "key-new".to_string(),
                name: "New Key".to_string(),
                workspace_id: "ws-123".to_string(),
                created_at: "2024-01-01T00:00:00Z".to_string(),
                status: ApiKeyStatus::Active,
                partial_key_hint: "5678".to_string(),
            },
            api_key_secret: "sk-ant-secret123".to_string(),
        };

        auth_manager
            .expect_get_headers()
            .times(1)
            .returning(|| http::HeaderMap::new());

        let json = serde_json::to_vec(&expected_key).unwrap();
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
                    .body(Bytes::from(json.clone()))
                    .unwrap())
            });

        resilience
            .expect_execute()
            .times(1)
            .returning(|_, f| Box::pin(async move { f().await }));

        let result = service.create(request).await;
        assert!(result.is_ok());
        let key = result.unwrap();
        assert_eq!(key.api_key.name, "New Key");
        assert_eq!(key.api_key_secret, "sk-ant-secret123");
    }

    #[tokio::test]
    async fn test_update_api_key() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        let request = UpdateApiKeyRequest {
            name: Some("Updated Key".to_string()),
            status: Some(ApiKeyStatus::Disabled),
        };

        let expected_key = ApiKey {
            id: "key-123".to_string(),
            name: "Updated Key".to_string(),
            workspace_id: "ws-123".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            status: ApiKeyStatus::Disabled,
            partial_key_hint: "1234".to_string(),
        };

        auth_manager
            .expect_get_headers()
            .times(1)
            .returning(|| http::HeaderMap::new());

        let json = serde_json::to_vec(&expected_key).unwrap();
        transport
            .expect_send()
            .times(1)
            .withf(|method, url, _, body| {
                method == &Method::POST
                    && url.path() == "/v1/organizations/api_keys/key-123"
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

        let result = service.update("key-123", request).await;
        assert!(result.is_ok());
        let key = result.unwrap();
        assert_eq!(key.name, "Updated Key");
        assert_eq!(key.status, ApiKeyStatus::Disabled);
    }

    #[tokio::test]
    async fn test_list_with_params() {
        let (service, mut transport, mut auth_manager, mut resilience) = setup_service();

        let params = ListParams {
            before_id: None,
            after_id: Some("key-100".to_string()),
            limit: Some(10),
        };

        let list_response = ListResponse {
            data: vec![],
            has_more: false,
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
                    && url.path() == "/v1/organizations/api_keys"
                    && url.query().is_some()
                    && url.query().unwrap().contains("after_id=key-100")
                    && url.query().unwrap().contains("limit=10")
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
    }
}
