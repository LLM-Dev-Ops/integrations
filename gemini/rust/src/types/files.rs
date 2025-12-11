//! File-related types for the Gemini API.
//!
//! This module contains types for working with files in Gemini's file service.

use serde::{Deserialize, Serialize};

/// A file stored in Gemini's file service.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct File {
    /// The resource name of the file.
    pub name: String,
    /// The display name of the file.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// The MIME type of the file.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    /// The size of the file in bytes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<String>,
    /// The creation time.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub create_time: Option<String>,
    /// The last update time.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_time: Option<String>,
    /// The expiration time.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expiration_time: Option<String>,
    /// The SHA-256 hash of the file.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256_hash: Option<String>,
    /// The URI of the file.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    /// The state of the file.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<FileState>,
}

/// The state of a file.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FileState {
    /// File is being processed.
    Processing,
    /// File is active and ready to use.
    Active,
    /// File processing failed.
    Failed,
}

/// Request to upload a file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UploadFileRequest {
    /// The display name for the file.
    pub display_name: Option<String>,
    /// The file data.
    pub file_data: Vec<u8>,
    /// The MIME type of the file.
    pub mime_type: String,
}

/// Response from listing files.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ListFilesResponse {
    /// The list of files.
    pub files: Vec<File>,
    /// Token for the next page.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_page_token: Option<String>,
}

/// Parameters for listing files.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct ListFilesParams {
    /// The page size.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_size: Option<i32>,
    /// The page token.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_token: Option<String>,
}
