//! Conversations service implementation.

use super::*;
use crate::auth::AuthManager;
use crate::errors::SlackResult;
use crate::resilience::{DefaultRetryPolicy, ResilienceOrchestrator};
use crate::transport::{HttpTransport, TransportRequest};
use crate::types::ChannelId;
use async_trait::async_trait;
use std::sync::Arc;
use tracing::instrument;

/// Trait for conversations service operations
#[async_trait]
pub trait ConversationsServiceTrait: Send + Sync {
    /// Create a new channel
    async fn create(&self, request: CreateConversationRequest) -> SlackResult<CreateConversationResponse>;

    /// Archive a conversation
    async fn archive(&self, request: ArchiveConversationRequest) -> SlackResult<ArchiveConversationResponse>;

    /// Unarchive a conversation
    async fn unarchive(&self, request: UnarchiveConversationRequest) -> SlackResult<ArchiveConversationResponse>;

    /// Close a DM or MPIM
    async fn close(&self, request: CloseConversationRequest) -> SlackResult<CloseConversationResponse>;

    /// Get conversation history
    async fn history(&self, request: ConversationHistoryRequest) -> SlackResult<ConversationHistoryResponse>;

    /// Get conversation info
    async fn info(&self, request: ConversationInfoRequest) -> SlackResult<ConversationInfoResponse>;

    /// Invite users to a conversation
    async fn invite(&self, request: InviteToConversationRequest) -> SlackResult<InviteToConversationResponse>;

    /// Join a public channel
    async fn join(&self, request: JoinConversationRequest) -> SlackResult<JoinConversationResponse>;

    /// Kick a user from a conversation
    async fn kick(&self, request: KickFromConversationRequest) -> SlackResult<KickFromConversationResponse>;

    /// Leave a conversation
    async fn leave(&self, request: LeaveConversationRequest) -> SlackResult<LeaveConversationResponse>;

    /// List conversations
    async fn list(&self, request: ListConversationsRequest) -> SlackResult<ListConversationsResponse>;

    /// List conversation members
    async fn members(&self, request: ConversationMembersRequest) -> SlackResult<ConversationMembersResponse>;

    /// Open or create a DM/MPIM
    async fn open(&self, request: OpenConversationRequest) -> SlackResult<OpenConversationResponse>;

    /// Rename a conversation
    async fn rename(&self, request: RenameConversationRequest) -> SlackResult<RenameConversationResponse>;

    /// Get thread replies
    async fn replies(&self, request: ConversationRepliesRequest) -> SlackResult<ConversationRepliesResponse>;

    /// Set conversation purpose
    async fn set_purpose(&self, request: SetConversationPurposeRequest) -> SlackResult<SetConversationPurposeResponse>;

    /// Set conversation topic
    async fn set_topic(&self, request: SetConversationTopicRequest) -> SlackResult<SetConversationTopicResponse>;

    /// Mark conversation as read
    async fn mark(&self, request: MarkConversationRequest) -> SlackResult<MarkConversationResponse>;
}

/// Conversations service implementation
#[derive(Clone)]
pub struct ConversationsService {
    transport: Arc<dyn HttpTransport>,
    auth: AuthManager,
    base_url: String,
    resilience: Arc<ResilienceOrchestrator>,
}

impl ConversationsService {
    /// Create a new conversations service
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
impl ConversationsServiceTrait for ConversationsService {
    #[instrument(skip(self), fields(channel_name = %request.name))]
    async fn create(&self, request: CreateConversationRequest) -> SlackResult<CreateConversationResponse> {
        let url = self.build_url("conversations.create");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("conversations.create", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(channel = %request.channel))]
    async fn archive(&self, request: ArchiveConversationRequest) -> SlackResult<ArchiveConversationResponse> {
        let url = self.build_url("conversations.archive");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("conversations.archive", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(channel = %request.channel))]
    async fn unarchive(&self, request: UnarchiveConversationRequest) -> SlackResult<ArchiveConversationResponse> {
        let url = self.build_url("conversations.unarchive");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("conversations.unarchive", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(channel = %request.channel))]
    async fn close(&self, request: CloseConversationRequest) -> SlackResult<CloseConversationResponse> {
        let url = self.build_url("conversations.close");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("conversations.close", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(channel = %request.channel))]
    async fn history(&self, request: ConversationHistoryRequest) -> SlackResult<ConversationHistoryResponse> {
        let url = self.build_url("conversations.history");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("conversations.history", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(channel = %request.channel))]
    async fn info(&self, request: ConversationInfoRequest) -> SlackResult<ConversationInfoResponse> {
        let url = self.build_url("conversations.info");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("conversations.info", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(channel = %request.channel))]
    async fn invite(&self, request: InviteToConversationRequest) -> SlackResult<InviteToConversationResponse> {
        let url = self.build_url("conversations.invite");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("conversations.invite", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(channel = %request.channel))]
    async fn join(&self, request: JoinConversationRequest) -> SlackResult<JoinConversationResponse> {
        let url = self.build_url("conversations.join");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("conversations.join", &DefaultRetryPolicy, || {
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
    async fn kick(&self, request: KickFromConversationRequest) -> SlackResult<KickFromConversationResponse> {
        let url = self.build_url("conversations.kick");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("conversations.kick", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(channel = %request.channel))]
    async fn leave(&self, request: LeaveConversationRequest) -> SlackResult<LeaveConversationResponse> {
        let url = self.build_url("conversations.leave");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("conversations.leave", &DefaultRetryPolicy, || {
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
    async fn list(&self, request: ListConversationsRequest) -> SlackResult<ListConversationsResponse> {
        let url = self.build_url("conversations.list");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("conversations.list", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(channel = %request.channel))]
    async fn members(&self, request: ConversationMembersRequest) -> SlackResult<ConversationMembersResponse> {
        let url = self.build_url("conversations.members");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("conversations.members", &DefaultRetryPolicy, || {
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
    async fn open(&self, request: OpenConversationRequest) -> SlackResult<OpenConversationResponse> {
        let url = self.build_url("conversations.open");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("conversations.open", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(channel = %request.channel, new_name = %request.name))]
    async fn rename(&self, request: RenameConversationRequest) -> SlackResult<RenameConversationResponse> {
        let url = self.build_url("conversations.rename");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("conversations.rename", &DefaultRetryPolicy, || {
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
    async fn replies(&self, request: ConversationRepliesRequest) -> SlackResult<ConversationRepliesResponse> {
        let url = self.build_url("conversations.replies");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("conversations.replies", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(channel = %request.channel))]
    async fn set_purpose(&self, request: SetConversationPurposeRequest) -> SlackResult<SetConversationPurposeResponse> {
        let url = self.build_url("conversations.setPurpose");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("conversations.setPurpose", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(channel = %request.channel))]
    async fn set_topic(&self, request: SetConversationTopicRequest) -> SlackResult<SetConversationTopicResponse> {
        let url = self.build_url("conversations.setTopic");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("conversations.setTopic", &DefaultRetryPolicy, || {
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
    async fn mark(&self, request: MarkConversationRequest) -> SlackResult<MarkConversationResponse> {
        let url = self.build_url("conversations.mark");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("conversations.mark", &DefaultRetryPolicy, || {
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
