//! Team service implementation.

use super::*;
use crate::auth::AuthManager;
use crate::errors::SlackResult;
use crate::resilience::{DefaultRetryPolicy, ResilienceOrchestrator};
use crate::transport::{HttpTransport, TransportRequest};
use async_trait::async_trait;
use std::sync::Arc;
use tracing::instrument;

/// Trait for team service operations
#[async_trait]
pub trait TeamServiceTrait: Send + Sync {
    /// Get team/workspace information
    async fn info(&self, request: TeamInfoRequest) -> SlackResult<TeamInfoResponse>;

    /// Get access logs for the team
    async fn access_logs(&self, request: AccessLogsRequest) -> SlackResult<AccessLogsResponse>;

    /// Get billable information for team members
    async fn billable_info(
        &self,
        request: BillableInfoRequest,
    ) -> SlackResult<BillableInfoResponse>;

    /// Get integration activity logs
    async fn integration_logs(
        &self,
        request: IntegrationLogsRequest,
    ) -> SlackResult<IntegrationLogsResponse>;
}

/// Team service implementation
pub struct TeamService {
    transport: Arc<dyn HttpTransport>,
    auth: AuthManager,
    base_url: String,
    resilience: Arc<ResilienceOrchestrator>,
}

impl TeamService {
    /// Create a new team service
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
impl TeamServiceTrait for TeamService {
    #[instrument(skip(self))]
    async fn info(&self, request: TeamInfoRequest) -> SlackResult<TeamInfoResponse> {
        let url = self.build_url("team.info");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("team.info", &DefaultRetryPolicy, || {
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
    async fn access_logs(&self, request: AccessLogsRequest) -> SlackResult<AccessLogsResponse> {
        let url = self.build_url("team.accessLogs");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("team.accessLogs", &DefaultRetryPolicy, || {
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
    async fn billable_info(
        &self,
        request: BillableInfoRequest,
    ) -> SlackResult<BillableInfoResponse> {
        let url = self.build_url("team.billableInfo");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("team.billableInfo", &DefaultRetryPolicy, || {
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
    async fn integration_logs(
        &self,
        request: IntegrationLogsRequest,
    ) -> SlackResult<IntegrationLogsResponse> {
        let url = self.build_url("team.integrationLogs");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("team.integrationLogs", &DefaultRetryPolicy, || {
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
