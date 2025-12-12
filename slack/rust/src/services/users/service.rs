//! Users service implementation.

use super::*;
use crate::auth::AuthManager;
use crate::errors::SlackResult;
use crate::resilience::{DefaultRetryPolicy, ResilienceOrchestrator};
use crate::transport::{HttpTransport, TransportRequest};
use async_trait::async_trait;
use std::sync::Arc;
use tracing::instrument;

/// Trait for users service operations
#[async_trait]
pub trait UsersServiceTrait: Send + Sync {
    /// Get information about a user
    async fn info(&self, request: GetUserRequest) -> SlackResult<GetUserResponse>;

    /// List all users in a workspace
    async fn list(&self, request: ListUsersRequest) -> SlackResult<ListUsersResponse>;

    /// Get a user's presence
    async fn get_presence(&self, request: GetUserPresenceRequest) -> SlackResult<GetUserPresenceResponse>;

    /// Set the authenticated user's presence
    async fn set_presence(&self, request: SetUserPresenceRequest) -> SlackResult<SetUserPresenceResponse>;

    /// Look up a user by email
    async fn lookup_by_email(&self, request: LookupByEmailRequest) -> SlackResult<LookupByEmailResponse>;

    /// Get a user's profile
    async fn get_profile(&self, request: GetUserProfileRequest) -> SlackResult<GetUserProfileResponse>;

    /// Set the authenticated user's profile
    async fn set_profile(&self, request: SetUserProfileRequest) -> SlackResult<SetUserProfileResponse>;

    /// List conversations for a user
    async fn conversations(&self, request: UserConversationsRequest) -> SlackResult<UserConversationsResponse>;

    /// Set the authenticated user's photo
    async fn set_photo(&self, request: SetUserPhotoRequest) -> SlackResult<SetUserPhotoResponse>;

    /// Delete the authenticated user's photo
    async fn delete_photo(&self, request: DeleteUserPhotoRequest) -> SlackResult<DeleteUserPhotoResponse>;
}

/// Users service implementation
#[derive(Clone)]
pub struct UsersService {
    transport: Arc<dyn HttpTransport>,
    auth: AuthManager,
    base_url: String,
    resilience: Arc<ResilienceOrchestrator>,
}

impl UsersService {
    /// Create a new users service
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
impl UsersServiceTrait for UsersService {
    #[instrument(skip(self), fields(user = %request.user))]
    async fn info(&self, request: GetUserRequest) -> SlackResult<GetUserResponse> {
        let url = self.build_url("users.info");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("users.info", &DefaultRetryPolicy, || {
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
    async fn list(&self, request: ListUsersRequest) -> SlackResult<ListUsersResponse> {
        let url = self.build_url("users.list");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("users.list", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(user = %request.user))]
    async fn get_presence(&self, request: GetUserPresenceRequest) -> SlackResult<GetUserPresenceResponse> {
        let url = self.build_url("users.getPresence");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("users.getPresence", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(presence = %request.presence))]
    async fn set_presence(&self, request: SetUserPresenceRequest) -> SlackResult<SetUserPresenceResponse> {
        let url = self.build_url("users.setPresence");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("users.setPresence", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(email = %request.email))]
    async fn lookup_by_email(&self, request: LookupByEmailRequest) -> SlackResult<LookupByEmailResponse> {
        let url = self.build_url("users.lookupByEmail");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("users.lookupByEmail", &DefaultRetryPolicy, || {
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
    async fn get_profile(&self, request: GetUserProfileRequest) -> SlackResult<GetUserProfileResponse> {
        let url = self.build_url("users.profile.get");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("users.profile.get", &DefaultRetryPolicy, || {
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
    async fn set_profile(&self, request: SetUserProfileRequest) -> SlackResult<SetUserProfileResponse> {
        let url = self.build_url("users.profile.set");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("users.profile.set", &DefaultRetryPolicy, || {
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
    async fn conversations(&self, request: UserConversationsRequest) -> SlackResult<UserConversationsResponse> {
        let url = self.build_url("users.conversations");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("users.conversations", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self, request))]
    async fn set_photo(&self, request: SetUserPhotoRequest) -> SlackResult<SetUserPhotoResponse> {
        let url = self.build_url("users.setPhoto");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("users.setPhoto", &DefaultRetryPolicy, || {
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
    async fn delete_photo(&self, request: DeleteUserPhotoRequest) -> SlackResult<DeleteUserPhotoResponse> {
        let url = self.build_url("users.deletePhoto");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("users.deletePhoto", &DefaultRetryPolicy, || {
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
