//! Pins service for Slack API.
//!
//! Provides methods for pinning and unpinning items in channels.

use crate::auth::AuthManager;
use crate::errors::SlackResult;
use crate::resilience::{DefaultRetryPolicy, ResilienceOrchestrator};
use crate::transport::{HttpTransport, TransportRequest};
use crate::types::{ChannelId, Message, Timestamp};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::instrument;

/// Request to pin an item
#[derive(Debug, Clone, Serialize)]
pub struct PinRequest {
    /// Channel to pin in
    pub channel: ChannelId,
    /// Message timestamp to pin
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<Timestamp>,
}

impl PinRequest {
    /// Pin a message
    pub fn message(channel: impl Into<ChannelId>, timestamp: impl Into<Timestamp>) -> Self {
        Self {
            channel: channel.into(),
            timestamp: Some(timestamp.into()),
        }
    }
}

/// Response from pins.add
#[derive(Debug, Clone, Deserialize)]
pub struct PinResponse {
    /// Success indicator
    pub ok: bool,
}

/// Request to unpin an item
#[derive(Debug, Clone, Serialize)]
pub struct UnpinRequest {
    /// Channel to unpin from
    pub channel: ChannelId,
    /// Message timestamp to unpin
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<Timestamp>,
}

impl UnpinRequest {
    /// Unpin a message
    pub fn message(channel: impl Into<ChannelId>, timestamp: impl Into<Timestamp>) -> Self {
        Self {
            channel: channel.into(),
            timestamp: Some(timestamp.into()),
        }
    }
}

/// Request to list pins
#[derive(Debug, Clone, Serialize)]
pub struct ListPinsRequest {
    /// Channel to list pins for
    pub channel: ChannelId,
}

impl ListPinsRequest {
    /// Create a new request
    pub fn new(channel: impl Into<ChannelId>) -> Self {
        Self {
            channel: channel.into(),
        }
    }
}

/// Response from pins.list
#[derive(Debug, Clone, Deserialize)]
pub struct ListPinsResponse {
    /// Success indicator
    pub ok: bool,
    /// List of pinned items
    #[serde(default)]
    pub items: Vec<PinnedItem>,
}

/// Pinned item
#[derive(Debug, Clone, Deserialize)]
pub struct PinnedItem {
    /// Item type
    #[serde(rename = "type")]
    pub item_type: String,
    /// Channel ID
    #[serde(default)]
    pub channel: Option<String>,
    /// Created timestamp (Unix)
    #[serde(default)]
    pub created: Option<i64>,
    /// User who pinned
    #[serde(default)]
    pub created_by: Option<String>,
    /// Message (if message type)
    #[serde(default)]
    pub message: Option<Message>,
}

/// Trait for pins service operations
#[async_trait]
pub trait PinsServiceTrait: Send + Sync {
    /// Pin an item to a channel
    async fn add(&self, request: PinRequest) -> SlackResult<PinResponse>;

    /// Unpin an item from a channel
    async fn remove(&self, request: UnpinRequest) -> SlackResult<PinResponse>;

    /// List pinned items in a channel
    async fn list(&self, request: ListPinsRequest) -> SlackResult<ListPinsResponse>;
}

/// Pins service implementation
#[derive(Clone)]
pub struct PinsService {
    transport: Arc<dyn HttpTransport>,
    auth: AuthManager,
    base_url: String,
    resilience: Arc<ResilienceOrchestrator>,
}

impl PinsService {
    /// Create a new pins service
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
impl PinsServiceTrait for PinsService {
    #[instrument(skip(self), fields(channel = %request.channel))]
    async fn add(&self, request: PinRequest) -> SlackResult<PinResponse> {
        let url = self.build_url("pins.add");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("pins.add", &DefaultRetryPolicy, || {
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
    async fn remove(&self, request: UnpinRequest) -> SlackResult<PinResponse> {
        let url = self.build_url("pins.remove");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("pins.remove", &DefaultRetryPolicy, || {
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
    async fn list(&self, request: ListPinsRequest) -> SlackResult<ListPinsResponse> {
        let url = self.build_url("pins.list");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("pins.list", &DefaultRetryPolicy, || {
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
