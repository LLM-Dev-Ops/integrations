//! Connectors service implementation.

use super::types::{Connector, CreateConnectorRequest, UpdateConnectorRequest};
use crate::auth::AuthManager;
use crate::errors::{CohereError, CohereResult};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::{HeaderMap, Method};
use std::sync::Arc;
use url::Url;

/// Connectors service trait for testability
#[async_trait]
pub trait ConnectorsService: Send + Sync {
    /// Create a new connector
    async fn create(&self, request: CreateConnectorRequest) -> CohereResult<Connector>;

    /// Get a connector by ID
    async fn get(&self, connector_id: &str) -> CohereResult<Connector>;

    /// List all connectors
    async fn list(&self) -> CohereResult<Vec<Connector>>;

    /// Update a connector
    async fn update(
        &self,
        connector_id: &str,
        request: UpdateConnectorRequest,
    ) -> CohereResult<Connector>;

    /// Delete a connector
    async fn delete(&self, connector_id: &str) -> CohereResult<()>;
}

/// Implementation of the Connectors service
pub struct ConnectorsServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    base_url: Url,
}

impl ConnectorsServiceImpl {
    /// Create a new Connectors service
    pub fn new(
        transport: Arc<dyn HttpTransport>,
        auth_manager: Arc<dyn AuthManager>,
        base_url: Url,
    ) -> Self {
        Self {
            transport,
            auth_manager,
            base_url,
        }
    }

    /// Build headers for a request
    fn build_headers(&self) -> HeaderMap {
        self.auth_manager.get_headers()
    }

    /// Build endpoint URL
    fn url(&self, path: &str) -> CohereResult<String> {
        self.base_url
            .join(path)
            .map(|u| u.to_string())
            .map_err(|e| CohereError::Configuration {
                message: format!("Invalid URL: {}", e),
            })
    }
}

#[async_trait]
impl ConnectorsService for ConnectorsServiceImpl {
    async fn create(&self, request: CreateConnectorRequest) -> CohereResult<Connector> {
        // Build URL
        let url = self.url("/v1/connectors")?;

        // Build headers
        let headers = self.build_headers();

        // Serialize request body
        let body = serde_json::to_vec(&request)?;

        // Execute request
        let response = self
            .transport
            .execute(Method::POST, url, headers, Some(body))
            .await?;

        // Parse response
        let connector: Connector = serde_json::from_slice(&response.body)?;

        Ok(connector)
    }

    async fn get(&self, connector_id: &str) -> CohereResult<Connector> {
        // Build URL
        let url = self.url(&format!("/v1/connectors/{}", connector_id))?;

        // Build headers
        let headers = self.build_headers();

        // Execute request
        let response = self
            .transport
            .execute(Method::GET, url, headers, None)
            .await?;

        // Parse response
        let connector: Connector = serde_json::from_slice(&response.body)?;

        Ok(connector)
    }

    async fn list(&self) -> CohereResult<Vec<Connector>> {
        // Build URL
        let url = self.url("/v1/connectors")?;

        // Build headers
        let headers = self.build_headers();

        // Execute request
        let response = self
            .transport
            .execute(Method::GET, url, headers, None)
            .await?;

        // Parse response
        #[derive(serde::Deserialize)]
        struct ListResponse {
            connectors: Vec<Connector>,
        }

        let list_response: ListResponse = serde_json::from_slice(&response.body)?;

        Ok(list_response.connectors)
    }

    async fn update(
        &self,
        connector_id: &str,
        request: UpdateConnectorRequest,
    ) -> CohereResult<Connector> {
        // Build URL
        let url = self.url(&format!("/v1/connectors/{}", connector_id))?;

        // Build headers
        let headers = self.build_headers();

        // Serialize request body
        let body = serde_json::to_vec(&request)?;

        // Execute request
        let response = self
            .transport
            .execute(Method::PATCH, url, headers, Some(body))
            .await?;

        // Parse response
        let connector: Connector = serde_json::from_slice(&response.body)?;

        Ok(connector)
    }

    async fn delete(&self, connector_id: &str) -> CohereResult<()> {
        // Build URL
        let url = self.url(&format!("/v1/connectors/{}", connector_id))?;

        // Build headers
        let headers = self.build_headers();

        // Execute request
        self.transport
            .execute(Method::DELETE, url, headers, None)
            .await?;

        Ok(())
    }
}
