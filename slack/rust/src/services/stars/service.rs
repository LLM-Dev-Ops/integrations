//! Stars service implementation.

use super::*;
use crate::auth::AuthManager;
use crate::errors::SlackResult;
use crate::resilience::{DefaultRetryPolicy, ResilienceOrchestrator};
use crate::transport::{HttpTransport, TransportRequest};
use async_trait::async_trait;
use std::sync::Arc;
use tracing::instrument;

/// Trait for stars service operations
#[async_trait]
pub trait StarsServiceTrait: Send + Sync {
    /// Add a star to an item
    async fn add(&self, request: AddStarRequest) -> SlackResult<AddStarResponse>;

    /// List starred items
    async fn list(&self, request: ListStarsRequest) -> SlackResult<ListStarsResponse>;

    /// Remove a star from an item
    async fn remove(&self, request: RemoveStarRequest) -> SlackResult<RemoveStarResponse>;
}

/// Stars service implementation
pub struct StarsService {
    transport: Arc<dyn HttpTransport>,
    auth: AuthManager,
    base_url: String,
    resilience: Arc<ResilienceOrchestrator>,
}

impl StarsService {
    /// Create a new stars service
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
impl StarsServiceTrait for StarsService {
    #[instrument(skip(self))]
    async fn add(&self, request: AddStarRequest) -> SlackResult<AddStarResponse> {
        let url = self.build_url("stars.add");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("stars.add", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self))]
    async fn list(&self, request: ListStarsRequest) -> SlackResult<ListStarsResponse> {
        let url = self.build_url("stars.list");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("stars.list", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self))]
    async fn remove(&self, request: RemoveStarRequest) -> SlackResult<RemoveStarResponse> {
        let url = self.build_url("stars.remove");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("stars.remove", &DefaultRetryPolicy, || {
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
