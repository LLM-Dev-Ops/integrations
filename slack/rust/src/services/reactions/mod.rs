//! Reactions service for Slack API.
//!
//! Provides methods for adding and managing emoji reactions.

use crate::auth::AuthManager;
use crate::errors::SlackResult;
use crate::resilience::{DefaultRetryPolicy, ResilienceOrchestrator};
use crate::transport::{HttpTransport, TransportRequest};
use crate::types::{ChannelId, Cursor, FileId, Message, ResponseMetadata, Timestamp, UserId};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::instrument;

/// Request to add a reaction
#[derive(Debug, Clone, Serialize)]
pub struct AddReactionRequest {
    /// Channel containing the message
    pub channel: ChannelId,
    /// Emoji name (without colons)
    pub name: String,
    /// Message timestamp
    pub timestamp: Timestamp,
}

impl AddReactionRequest {
    /// Create a new request
    pub fn new(
        channel: impl Into<ChannelId>,
        name: impl Into<String>,
        timestamp: impl Into<Timestamp>,
    ) -> Self {
        Self {
            channel: channel.into(),
            name: name.into(),
            timestamp: timestamp.into(),
        }
    }
}

/// Response from reactions.add
#[derive(Debug, Clone, Deserialize)]
pub struct AddReactionResponse {
    /// Success indicator
    pub ok: bool,
}

/// Request to remove a reaction
#[derive(Debug, Clone, Serialize)]
pub struct RemoveReactionRequest {
    /// Channel containing the message
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel: Option<ChannelId>,
    /// Emoji name (without colons)
    pub name: String,
    /// Message timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<Timestamp>,
    /// File ID (alternative to channel+timestamp)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<FileId>,
    /// File comment ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_comment: Option<String>,
}

impl RemoveReactionRequest {
    /// Remove reaction from a message
    pub fn message(
        channel: impl Into<ChannelId>,
        name: impl Into<String>,
        timestamp: impl Into<Timestamp>,
    ) -> Self {
        Self {
            channel: Some(channel.into()),
            name: name.into(),
            timestamp: Some(timestamp.into()),
            file: None,
            file_comment: None,
        }
    }

    /// Remove reaction from a file
    pub fn file(file: impl Into<FileId>, name: impl Into<String>) -> Self {
        Self {
            channel: None,
            name: name.into(),
            timestamp: None,
            file: Some(file.into()),
            file_comment: None,
        }
    }
}

/// Response from reactions.remove
#[derive(Debug, Clone, Deserialize)]
pub struct RemoveReactionResponse {
    /// Success indicator
    pub ok: bool,
}

/// Request to get reactions
#[derive(Debug, Clone, Serialize)]
pub struct GetReactionsRequest {
    /// Channel containing the item
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel: Option<ChannelId>,
    /// Message timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<Timestamp>,
    /// File ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<FileId>,
    /// File comment ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_comment: Option<String>,
    /// Include full item
    #[serde(skip_serializing_if = "Option::is_none")]
    pub full: Option<bool>,
}

impl GetReactionsRequest {
    /// Get reactions for a message
    pub fn message(channel: impl Into<ChannelId>, timestamp: impl Into<Timestamp>) -> Self {
        Self {
            channel: Some(channel.into()),
            timestamp: Some(timestamp.into()),
            file: None,
            file_comment: None,
            full: None,
        }
    }

    /// Get reactions for a file
    pub fn file(file: impl Into<FileId>) -> Self {
        Self {
            channel: None,
            timestamp: None,
            file: Some(file.into()),
            file_comment: None,
            full: None,
        }
    }

    /// Include full item
    pub fn full(mut self, full: bool) -> Self {
        self.full = Some(full);
        self
    }
}

/// Response from reactions.get
#[derive(Debug, Clone, Deserialize)]
pub struct GetReactionsResponse {
    /// Success indicator
    pub ok: bool,
    /// Type of item
    #[serde(rename = "type")]
    pub item_type: String,
    /// Channel (if message)
    #[serde(default)]
    pub channel: Option<String>,
    /// Message (if message)
    #[serde(default)]
    pub message: Option<Message>,
    /// File (if file)
    #[serde(default)]
    pub file: Option<crate::types::File>,
}

/// Request to list reactions
#[derive(Debug, Clone, Serialize, Default)]
pub struct ListReactionsRequest {
    /// User to list reactions for
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<UserId>,
    /// Pagination cursor
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<Cursor>,
    /// Include full items
    #[serde(skip_serializing_if = "Option::is_none")]
    pub full: Option<bool>,
    /// Number of results per page
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<i32>,
    /// Page number
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<i32>,
    /// Team ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
}

impl ListReactionsRequest {
    /// Create a new request
    pub fn new() -> Self {
        Self::default()
    }

    /// Filter by user
    pub fn user(mut self, user: impl Into<UserId>) -> Self {
        self.user = Some(user.into());
        self
    }

    /// Set cursor
    pub fn cursor(mut self, cursor: impl Into<Cursor>) -> Self {
        self.cursor = Some(cursor.into());
        self
    }

    /// Set page size
    pub fn count(mut self, n: i32) -> Self {
        self.count = Some(n);
        self
    }

    /// Include full items
    pub fn full(mut self, full: bool) -> Self {
        self.full = Some(full);
        self
    }
}

/// Response from reactions.list
#[derive(Debug, Clone, Deserialize)]
pub struct ListReactionsResponse {
    /// Success indicator
    pub ok: bool,
    /// Items with reactions
    #[serde(default)]
    pub items: Vec<ReactionItem>,
    /// Paging info
    #[serde(default)]
    pub paging: Option<ReactionPaging>,
    /// Response metadata
    #[serde(default)]
    pub response_metadata: Option<ResponseMetadata>,
}

/// Item with reactions
#[derive(Debug, Clone, Deserialize)]
pub struct ReactionItem {
    /// Type of item
    #[serde(rename = "type")]
    pub item_type: String,
    /// Channel (for messages)
    #[serde(default)]
    pub channel: Option<String>,
    /// Message (for messages)
    #[serde(default)]
    pub message: Option<Message>,
    /// File (for files)
    #[serde(default)]
    pub file: Option<crate::types::File>,
}

/// Paging info for reactions
#[derive(Debug, Clone, Deserialize)]
pub struct ReactionPaging {
    /// Items per page
    pub count: i32,
    /// Total items
    pub total: i32,
    /// Current page
    pub page: i32,
    /// Total pages
    pub pages: i32,
}

/// Trait for reactions service operations
#[async_trait]
pub trait ReactionsServiceTrait: Send + Sync {
    /// Add a reaction to an item
    async fn add(&self, request: AddReactionRequest) -> SlackResult<AddReactionResponse>;

    /// Remove a reaction from an item
    async fn remove(&self, request: RemoveReactionRequest) -> SlackResult<RemoveReactionResponse>;

    /// Get reactions for an item
    async fn get(&self, request: GetReactionsRequest) -> SlackResult<GetReactionsResponse>;

    /// List items the user has reacted to
    async fn list(&self, request: ListReactionsRequest) -> SlackResult<ListReactionsResponse>;
}

/// Reactions service implementation
pub struct ReactionsService {
    transport: Arc<dyn HttpTransport>,
    auth: AuthManager,
    base_url: String,
    resilience: Arc<ResilienceOrchestrator>,
}

impl ReactionsService {
    /// Create a new reactions service
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
impl ReactionsServiceTrait for ReactionsService {
    #[instrument(skip(self), fields(channel = %request.channel, name = %request.name, ts = %request.timestamp))]
    async fn add(&self, request: AddReactionRequest) -> SlackResult<AddReactionResponse> {
        let url = self.build_url("reactions.add");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("reactions.add", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(name = %request.name))]
    async fn remove(&self, request: RemoveReactionRequest) -> SlackResult<RemoveReactionResponse> {
        let url = self.build_url("reactions.remove");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("reactions.remove", &DefaultRetryPolicy, || {
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
    async fn get(&self, request: GetReactionsRequest) -> SlackResult<GetReactionsResponse> {
        let url = self.build_url("reactions.get");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("reactions.get", &DefaultRetryPolicy, || {
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
    async fn list(&self, request: ListReactionsRequest) -> SlackResult<ListReactionsResponse> {
        let url = self.build_url("reactions.list");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("reactions.list", &DefaultRetryPolicy, || {
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
