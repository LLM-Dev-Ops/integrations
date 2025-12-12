//! Search service implementation.

use super::*;
use crate::auth::AuthManager;
use crate::errors::SlackResult;
use crate::resilience::{DefaultRetryPolicy, ResilienceOrchestrator};
use crate::transport::{HttpTransport, TransportRequest};
use async_trait::async_trait;
use std::sync::Arc;
use tracing::instrument;

/// Trait for search service operations
#[async_trait]
pub trait SearchServiceTrait: Send + Sync {
    /// Search for messages
    async fn messages(
        &self,
        request: SearchMessagesRequest,
    ) -> SlackResult<SearchMessagesResponse>;

    /// Search for files
    async fn files(&self, request: SearchFilesRequest) -> SlackResult<SearchFilesResponse>;

    /// Search for both messages and files
    async fn all(&self, request: SearchAllRequest) -> SlackResult<SearchAllResponse>;
}

/// Search service implementation
pub struct SearchService {
    transport: Arc<dyn HttpTransport>,
    auth: AuthManager,
    base_url: String,
    resilience: Arc<ResilienceOrchestrator>,
}

impl SearchService {
    /// Create a new search service
    pub fn new(
        transport: Arc<dyn HttpTransport>,
        auth: AuthManager,
        base_url: String,
        resilience: Arc<ResilienceOrchestrator>,
    ) -> Self {
        Self {
            transport,
            auth,
            base_url,
            resilience,
        }
    }

    fn build_url(&self, endpoint: &str) -> String {
        format!("{}/{}", self.base_url.trim_end_matches('/'), endpoint)
    }
}

#[async_trait]
impl SearchServiceTrait for SearchService {
    #[instrument(skip(self), fields(query = %request.query))]
    async fn messages(
        &self,
        request: SearchMessagesRequest,
    ) -> SlackResult<SearchMessagesResponse> {
        let url = self.build_url("search.messages");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("search.messages", &DefaultRetryPolicy, || {
                let url = url.clone();
                let headers = headers.clone();
                let request = request.clone();
                let transport = transport.clone();
                async move {
                    transport
                        .send_json(TransportRequest::post(url, headers, request))
                        .await
                }
            })
            .await
    }

    #[instrument(skip(self), fields(query = %request.query))]
    async fn files(&self, request: SearchFilesRequest) -> SlackResult<SearchFilesResponse> {
        let url = self.build_url("search.files");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("search.files", &DefaultRetryPolicy, || {
                let url = url.clone();
                let headers = headers.clone();
                let request = request.clone();
                let transport = transport.clone();
                async move {
                    transport
                        .send_json(TransportRequest::post(url, headers, request))
                        .await
                }
            })
            .await
    }

    #[instrument(skip(self), fields(query = %request.query))]
    async fn all(&self, request: SearchAllRequest) -> SlackResult<SearchAllResponse> {
        let url = self.build_url("search.all");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("search.all", &DefaultRetryPolicy, || {
                let url = url.clone();
                let headers = headers.clone();
                let request = request.clone();
                let transport = transport.clone();
                async move {
                    transport
                        .send_json(TransportRequest::post(url, headers, request))
                        .await
                }
            })
            .await
    }
}
