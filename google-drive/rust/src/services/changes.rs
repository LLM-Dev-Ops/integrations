//! Change tracking service.

use crate::client::GoogleDriveClient;
use crate::error::GoogleDriveResult;
use crate::types::*;
use futures::stream::Stream;
use serde::{Deserialize, Serialize};

/// Service for change tracking.
pub struct ChangesService<'a> {
    client: &'a GoogleDriveClient,
}

impl<'a> ChangesService<'a> {
    /// Creates a new changes service.
    pub fn new(client: &'a GoogleDriveClient) -> Self {
        Self { client }
    }

    /// Gets the start page token for change tracking.
    pub async fn get_start_page_token(
        &self,
        params: Option<GetStartPageTokenParams>,
    ) -> GoogleDriveResult<StartPageToken> {
        if let Some(p) = params {
            self.client
                .get_with_params("/changes/startPageToken", &p)
                .await
        } else {
            self.client.get("/changes/startPageToken").await
        }
    }

    /// Lists changes since a page token.
    pub async fn list(
        &self,
        page_token: &str,
        params: Option<ListChangesParams>,
    ) -> GoogleDriveResult<ChangeList> {
        let mut list_params = params.unwrap_or_default();
        list_params.page_token = Some(page_token.to_string());
        self.client.get_with_params("/changes", &list_params).await
    }

    /// Lists all changes with auto-pagination.
    pub fn list_all(
        &self,
        start_page_token: &str,
        params: Option<ListChangesParams>,
    ) -> impl Stream<Item = GoogleDriveResult<Change>> + '_ {
        let initial_token = start_page_token.to_string();
        async_stream::stream! {
            let mut page_token = Some(initial_token);

            loop {
                if let Some(token) = page_token {
                    let result = self.list(&token, params.clone()).await;

                    match result {
                        Ok(change_list) => {
                            for change in change_list.changes {
                                yield Ok(change);
                            }

                            // Check if there are more pages
                            if let Some(next) = change_list.next_page_token {
                                page_token = Some(next);
                            } else {
                                break;
                            }
                        }
                        Err(e) => {
                            yield Err(e);
                            break;
                        }
                    }
                } else {
                    break;
                }
            }
        }
    }

    /// Watches for changes via push notifications.
    pub async fn watch(
        &self,
        page_token: &str,
        request: WatchChangesRequest,
    ) -> GoogleDriveResult<Channel> {
        let path = format!("/changes/watch?pageToken={}", page_token);
        self.client.post(&path, &request).await
    }

    /// Stops watching for changes.
    pub async fn stop_watch(&self, channel: &Channel) -> GoogleDriveResult<()> {
        let request = StopChannelRequest {
            id: channel.id.clone(),
            resource_id: channel.resource_id.clone(),
        };
        self.client.post_no_response("/channels/stop", &request).await
    }
}

// Request/Response types

/// Parameters for getting start page token.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GetStartPageTokenParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drive_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_all_drives: Option<bool>,
}

/// Parameters for listing changes.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ListChangesParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drive_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_corpus_removals: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_items_from_all_drives: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_removed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub restrict_to_my_drive: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spaces: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_all_drives: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<String>,
}

/// Request to watch for changes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchChangesRequest {
    pub id: String,
    #[serde(rename = "type")]
    pub channel_type: String,
    pub address: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expiration: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

/// Request to stop a channel.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StopChannelRequest {
    id: String,
    resource_id: String,
}
