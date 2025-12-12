//! Bookmarks service implementation.

use super::*;
use crate::auth::AuthManager;
use crate::errors::SlackResult;
use crate::resilience::{DefaultRetryPolicy, ResilienceOrchestrator};
use crate::transport::{HttpTransport, TransportRequest};
use async_trait::async_trait;
use std::sync::Arc;
use tracing::instrument;

/// Trait for bookmarks service operations
#[async_trait]
pub trait BookmarksServiceTrait: Send + Sync {
    /// Add a bookmark to a channel
    async fn add(&self, request: AddBookmarkRequest) -> SlackResult<AddBookmarkResponse>;

    /// Edit a bookmark
    async fn edit(&self, request: EditBookmarkRequest) -> SlackResult<EditBookmarkResponse>;

    /// List bookmarks in a channel
    async fn list(&self, request: ListBookmarksRequest) -> SlackResult<ListBookmarksResponse>;

    /// Remove a bookmark
    async fn remove(&self, request: RemoveBookmarkRequest) -> SlackResult<RemoveBookmarkResponse>;
}

/// Bookmarks service implementation
pub struct BookmarksService {
    transport: Arc<dyn HttpTransport>,
    auth: AuthManager,
    base_url: String,
    resilience: Arc<ResilienceOrchestrator>,
}

impl BookmarksService {
    /// Create a new bookmarks service
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
impl BookmarksServiceTrait for BookmarksService {
    #[instrument(skip(self), fields(channel = %request.channel_id, title = %request.title))]
    async fn add(&self, request: AddBookmarkRequest) -> SlackResult<AddBookmarkResponse> {
        let url = self.build_url("bookmarks.add");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("bookmarks.add", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(bookmark_id = %request.bookmark_id, channel = %request.channel_id))]
    async fn edit(&self, request: EditBookmarkRequest) -> SlackResult<EditBookmarkResponse> {
        let url = self.build_url("bookmarks.edit");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("bookmarks.edit", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(channel = %request.channel_id))]
    async fn list(&self, request: ListBookmarksRequest) -> SlackResult<ListBookmarksResponse> {
        let url = self.build_url("bookmarks.list");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("bookmarks.list", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(bookmark_id = %request.bookmark_id, channel = %request.channel_id))]
    async fn remove(&self, request: RemoveBookmarkRequest) -> SlackResult<RemoveBookmarkResponse> {
        let url = self.build_url("bookmarks.remove");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("bookmarks.remove", &DefaultRetryPolicy, || {
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
