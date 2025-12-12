//! Usergroups service implementation.

use super::*;
use crate::auth::AuthManager;
use crate::errors::SlackResult;
use crate::resilience::{DefaultRetryPolicy, ResilienceOrchestrator};
use crate::transport::{HttpTransport, TransportRequest};
use async_trait::async_trait;
use std::sync::Arc;
use tracing::instrument;

/// Trait for usergroups service operations
#[async_trait]
pub trait UsergroupsServiceTrait: Send + Sync {
    /// Create a usergroup
    async fn create(
        &self,
        request: CreateUsergroupRequest,
    ) -> SlackResult<CreateUsergroupResponse>;

    /// Disable a usergroup
    async fn disable(
        &self,
        request: DisableUsergroupRequest,
    ) -> SlackResult<DisableUsergroupResponse>;

    /// Enable a usergroup
    async fn enable(
        &self,
        request: EnableUsergroupRequest,
    ) -> SlackResult<EnableUsergroupResponse>;

    /// List all usergroups
    async fn list(
        &self,
        request: ListUsergroupsRequest,
    ) -> SlackResult<ListUsergroupsResponse>;

    /// Update a usergroup
    async fn update(
        &self,
        request: UpdateUsergroupRequest,
    ) -> SlackResult<UpdateUsergroupResponse>;

    /// List users in a usergroup
    async fn users_list(&self, request: UsersListRequest) -> SlackResult<UsersListResponse>;

    /// Update users in a usergroup
    async fn users_update(&self, request: UsersUpdateRequest)
        -> SlackResult<UsersUpdateResponse>;
}

/// Usergroups service implementation
pub struct UsergroupsService {
    transport: Arc<dyn HttpTransport>,
    auth: AuthManager,
    base_url: String,
    resilience: Arc<ResilienceOrchestrator>,
}

impl UsergroupsService {
    /// Create a new usergroups service
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
impl UsergroupsServiceTrait for UsergroupsService {
    #[instrument(skip(self), fields(name = %request.name))]
    async fn create(
        &self,
        request: CreateUsergroupRequest,
    ) -> SlackResult<CreateUsergroupResponse> {
        let url = self.build_url("usergroups.create");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("usergroups.create", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(usergroup = %request.usergroup))]
    async fn disable(
        &self,
        request: DisableUsergroupRequest,
    ) -> SlackResult<DisableUsergroupResponse> {
        let url = self.build_url("usergroups.disable");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("usergroups.disable", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(usergroup = %request.usergroup))]
    async fn enable(
        &self,
        request: EnableUsergroupRequest,
    ) -> SlackResult<EnableUsergroupResponse> {
        let url = self.build_url("usergroups.enable");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("usergroups.enable", &DefaultRetryPolicy, || {
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
    async fn list(
        &self,
        request: ListUsergroupsRequest,
    ) -> SlackResult<ListUsergroupsResponse> {
        let url = self.build_url("usergroups.list");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("usergroups.list", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(usergroup = %request.usergroup))]
    async fn update(
        &self,
        request: UpdateUsergroupRequest,
    ) -> SlackResult<UpdateUsergroupResponse> {
        let url = self.build_url("usergroups.update");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("usergroups.update", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(usergroup = %request.usergroup))]
    async fn users_list(&self, request: UsersListRequest) -> SlackResult<UsersListResponse> {
        let url = self.build_url("usergroups.users.list");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("usergroups.users.list", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(usergroup = %request.usergroup))]
    async fn users_update(
        &self,
        request: UsersUpdateRequest,
    ) -> SlackResult<UsersUpdateResponse> {
        let url = self.build_url("usergroups.users.update");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("usergroups.users.update", &DefaultRetryPolicy, || {
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
