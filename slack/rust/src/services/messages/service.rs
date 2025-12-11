//! Messages service implementation.

use super::*;
use crate::auth::AuthManager;
use crate::errors::SlackResult;
use crate::resilience::{DefaultRetryPolicy, ResilienceOrchestrator};
use crate::transport::{HttpTransport, TransportRequest};
use async_trait::async_trait;
use std::sync::Arc;
use tracing::instrument;

/// Trait for messages service operations
#[async_trait]
pub trait MessagesServiceTrait: Send + Sync {
    /// Post a message to a channel
    async fn post(&self, request: PostMessageRequest) -> SlackResult<PostMessageResponse>;

    /// Update an existing message
    async fn update(&self, request: UpdateMessageRequest) -> SlackResult<UpdateMessageResponse>;

    /// Delete a message
    async fn delete(&self, request: DeleteMessageRequest) -> SlackResult<DeleteMessageResponse>;

    /// Get a message's permalink
    async fn get_permalink(&self, request: GetPermalinkRequest) -> SlackResult<GetPermalinkResponse>;

    /// Schedule a message for later
    async fn schedule(&self, request: ScheduleMessageRequest) -> SlackResult<ScheduleMessageResponse>;

    /// Delete a scheduled message
    async fn delete_scheduled(&self, request: DeleteScheduledMessageRequest) -> SlackResult<DeleteScheduledMessageResponse>;

    /// List scheduled messages
    async fn list_scheduled(&self, request: ListScheduledMessagesRequest) -> SlackResult<ListScheduledMessagesResponse>;

    /// Post an ephemeral message (visible only to one user)
    async fn post_ephemeral(&self, request: PostEphemeralRequest) -> SlackResult<PostEphemeralResponse>;
}

/// Messages service implementation
pub struct MessagesService {
    transport: Arc<dyn HttpTransport>,
    auth: AuthManager,
    base_url: String,
    resilience: Arc<ResilienceOrchestrator>,
}

impl MessagesService {
    /// Create a new messages service
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
impl MessagesServiceTrait for MessagesService {
    #[instrument(skip(self), fields(channel = %request.channel))]
    async fn post(&self, request: PostMessageRequest) -> SlackResult<PostMessageResponse> {
        let url = self.build_url("chat.postMessage");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("chat.postMessage", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(channel = %request.channel, ts = %request.ts))]
    async fn update(&self, request: UpdateMessageRequest) -> SlackResult<UpdateMessageResponse> {
        let url = self.build_url("chat.update");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("chat.update", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(channel = %request.channel, ts = %request.ts))]
    async fn delete(&self, request: DeleteMessageRequest) -> SlackResult<DeleteMessageResponse> {
        let url = self.build_url("chat.delete");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("chat.delete", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(channel = %request.channel, ts = %request.message_ts))]
    async fn get_permalink(&self, request: GetPermalinkRequest) -> SlackResult<GetPermalinkResponse> {
        let url = self.build_url("chat.getPermalink");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("chat.getPermalink", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(channel = %request.channel, post_at = request.post_at))]
    async fn schedule(&self, request: ScheduleMessageRequest) -> SlackResult<ScheduleMessageResponse> {
        let url = self.build_url("chat.scheduleMessage");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("chat.scheduleMessage", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(channel = %request.channel, scheduled_id = %request.scheduled_message_id))]
    async fn delete_scheduled(&self, request: DeleteScheduledMessageRequest) -> SlackResult<DeleteScheduledMessageResponse> {
        let url = self.build_url("chat.deleteScheduledMessage");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("chat.deleteScheduledMessage", &DefaultRetryPolicy, || {
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
    async fn list_scheduled(&self, request: ListScheduledMessagesRequest) -> SlackResult<ListScheduledMessagesResponse> {
        let url = self.build_url("chat.scheduledMessages.list");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("chat.scheduledMessages.list", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(channel = %request.channel, user = %request.user))]
    async fn post_ephemeral(&self, request: PostEphemeralRequest) -> SlackResult<PostEphemeralResponse> {
        let url = self.build_url("chat.postEphemeral");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("chat.postEphemeral", &DefaultRetryPolicy, || {
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
