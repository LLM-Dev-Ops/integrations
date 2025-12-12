//! About API service.

use crate::client::GoogleDriveClient;
use crate::error::GoogleDriveResult;
use crate::types::*;
use serde::{Deserialize, Serialize};

/// Service for about/quota operations.
pub struct AboutService<'a> {
    client: &'a GoogleDriveClient,
}

impl<'a> AboutService<'a> {
    /// Creates a new about service.
    pub fn new(client: &'a GoogleDriveClient) -> Self {
        Self { client }
    }

    /// Gets information about the user's Drive account.
    pub async fn get(&self, params: Option<GetAboutParams>) -> GoogleDriveResult<About> {
        if let Some(p) = params {
            self.client.get_with_params("/about", &p).await
        } else {
            // Default to requesting storageQuota
            let default_params = GetAboutParams {
                fields: Some("storageQuota,user".to_string()),
            };
            self.client.get_with_params("/about", &default_params).await
        }
    }

    /// Gets storage quota information.
    pub async fn get_storage_quota(&self) -> GoogleDriveResult<StorageQuota> {
        let params = GetAboutParams {
            fields: Some("storageQuota".to_string()),
        };
        let about: About = self.client.get_with_params("/about", &params).await?;
        about.storage_quota.ok_or_else(|| {
            crate::error::GoogleDriveError::response(
                "Storage quota not present in response".to_string()
            )
        })
    }
}

// Request/Response types

/// Parameters for getting about information.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GetAboutParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<String>,
}
