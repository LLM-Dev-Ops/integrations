//! Apps service implementation.

use super::*;
use crate::auth::AuthManager;
use crate::errors::SlackResult;
use crate::resilience::{DefaultRetryPolicy, ResilienceOrchestrator};
use crate::transport::{HttpTransport, TransportRequest};
use async_trait::async_trait;
use std::sync::Arc;
use tracing::instrument;

/// Trait for apps service operations
#[async_trait]
pub trait AppsServiceTrait: Send + Sync {
    /// Open a WebSocket connection for Socket Mode
    async fn connections_open(
        &self,
        request: ConnectionsOpenRequest,
    ) -> SlackResult<ConnectionsOpenResponse>;

    /// List authorizations for an event
    async fn event_authorizations_list(
        &self,
        request: EventAuthorizationsListRequest,
    ) -> SlackResult<EventAuthorizationsListResponse>;

    /// Uninstall the app
    async fn uninstall(&self, request: UninstallRequest) -> SlackResult<UninstallResponse>;
}

/// Apps service implementation
pub struct AppsService {
    transport: Arc<dyn HttpTransport>,
    auth: AuthManager,
    base_url: String,
    resilience: Arc<ResilienceOrchestrator>,
}

impl AppsService {
    /// Create a new apps service
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
impl AppsServiceTrait for AppsService {
    #[instrument(skip(self))]
    async fn connections_open(
        &self,
        request: ConnectionsOpenRequest,
    ) -> SlackResult<ConnectionsOpenResponse> {
        let url = self.build_url("apps.connections.open");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("apps.connections.open", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(event_context = %request.event_context))]
    async fn event_authorizations_list(
        &self,
        request: EventAuthorizationsListRequest,
    ) -> SlackResult<EventAuthorizationsListResponse> {
        let url = self.build_url("apps.event.authorizations.list");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("apps.event.authorizations.list", &DefaultRetryPolicy, || {
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
    async fn uninstall(&self, request: UninstallRequest) -> SlackResult<UninstallResponse> {
        let url = self.build_url("apps.uninstall");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("apps.uninstall", &DefaultRetryPolicy, || {
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
