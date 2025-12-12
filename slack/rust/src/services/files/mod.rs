//! Files service for Slack API.
//!
//! Provides methods for uploading, listing, and managing files.

use crate::auth::AuthManager;
use crate::errors::SlackResult;
use crate::resilience::{DefaultRetryPolicy, ResilienceOrchestrator};
use crate::transport::{FileUpload, HttpTransport, MultipartRequest, TransportRequest};
use crate::types::{ChannelId, Cursor, File, FileId, ResponseMetadata, UserId};
use async_trait::async_trait;
use bytes::Bytes;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::instrument;

/// Request to upload a file
#[derive(Debug, Clone)]
pub struct UploadFileRequest {
    /// Channels to share file with
    pub channels: Option<Vec<ChannelId>>,
    /// File content
    pub content: Option<Bytes>,
    /// Filename
    pub filename: Option<String>,
    /// File type
    pub filetype: Option<String>,
    /// Initial comment
    pub initial_comment: Option<String>,
    /// Thread timestamp to post to
    pub thread_ts: Option<String>,
    /// Title for the file
    pub title: Option<String>,
}

impl UploadFileRequest {
    /// Create a new upload request with content
    pub fn with_content(content: impl Into<Bytes>, filename: impl Into<String>) -> Self {
        Self {
            channels: None,
            content: Some(content.into()),
            filename: Some(filename.into()),
            filetype: None,
            initial_comment: None,
            thread_ts: None,
            title: None,
        }
    }

    /// Set channels to share with
    pub fn channels(mut self, channels: Vec<ChannelId>) -> Self {
        self.channels = Some(channels);
        self
    }

    /// Set file type
    pub fn filetype(mut self, filetype: impl Into<String>) -> Self {
        self.filetype = Some(filetype.into());
        self
    }

    /// Set initial comment
    pub fn initial_comment(mut self, comment: impl Into<String>) -> Self {
        self.initial_comment = Some(comment.into());
        self
    }

    /// Set thread
    pub fn thread_ts(mut self, ts: impl Into<String>) -> Self {
        self.thread_ts = Some(ts.into());
        self
    }

    /// Set title
    pub fn title(mut self, title: impl Into<String>) -> Self {
        self.title = Some(title.into());
        self
    }
}

/// Response from files.upload
#[derive(Debug, Clone, Deserialize)]
pub struct UploadFileResponse {
    /// Success indicator
    pub ok: bool,
    /// Uploaded file
    pub file: File,
}

/// Request to list files
#[derive(Debug, Clone, Serialize, Default)]
pub struct ListFilesRequest {
    /// Filter by channel
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel: Option<ChannelId>,
    /// Filter by user
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<UserId>,
    /// Pagination cursor
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<Cursor>,
    /// Number of results
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<i32>,
    /// Page number
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<i32>,
    /// Filter by file type
    #[serde(skip_serializing_if = "Option::is_none")]
    pub types: Option<String>,
    /// Oldest timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ts_from: Option<i64>,
    /// Latest timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ts_to: Option<i64>,
}

impl ListFilesRequest {
    /// Create a new request
    pub fn new() -> Self {
        Self::default()
    }

    /// Filter by channel
    pub fn channel(mut self, channel: impl Into<ChannelId>) -> Self {
        self.channel = Some(channel.into());
        self
    }

    /// Filter by user
    pub fn user(mut self, user: impl Into<UserId>) -> Self {
        self.user = Some(user.into());
        self
    }

    /// Set page size
    pub fn count(mut self, n: i32) -> Self {
        self.count = Some(n);
        self
    }

    /// Filter by type (e.g., "images", "gdocs", "pdfs")
    pub fn types(mut self, types: impl Into<String>) -> Self {
        self.types = Some(types.into());
        self
    }
}

/// Response from files.list
#[derive(Debug, Clone, Deserialize)]
pub struct ListFilesResponse {
    /// Success indicator
    pub ok: bool,
    /// List of files
    #[serde(default)]
    pub files: Vec<File>,
    /// Paging info
    #[serde(default)]
    pub paging: Option<PagingInfo>,
    /// Response metadata
    #[serde(default)]
    pub response_metadata: Option<ResponseMetadata>,
}

/// Paging info for file list
#[derive(Debug, Clone, Deserialize)]
pub struct PagingInfo {
    /// Items per page
    pub count: i32,
    /// Total items
    pub total: i32,
    /// Current page
    pub page: i32,
    /// Total pages
    pub pages: i32,
}

/// Request to get file info
#[derive(Debug, Clone, Serialize)]
pub struct GetFileInfoRequest {
    /// File ID
    pub file: FileId,
    /// Include comments count
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<i32>,
    /// Page for comments
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<i32>,
    /// Cursor for pagination
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<Cursor>,
}

impl GetFileInfoRequest {
    /// Create a new request
    pub fn new(file: impl Into<FileId>) -> Self {
        Self {
            file: file.into(),
            count: None,
            page: None,
            cursor: None,
        }
    }
}

/// Response from files.info
#[derive(Debug, Clone, Deserialize)]
pub struct GetFileInfoResponse {
    /// Success indicator
    pub ok: bool,
    /// File info
    pub file: File,
    /// Comments on the file
    #[serde(default)]
    pub comments: Vec<FileComment>,
    /// Response metadata
    #[serde(default)]
    pub response_metadata: Option<ResponseMetadata>,
}

/// File comment
#[derive(Debug, Clone, Deserialize)]
pub struct FileComment {
    /// Comment ID
    pub id: String,
    /// Comment text
    pub comment: String,
    /// User who commented
    pub user: UserId,
    /// Comment timestamp
    pub created: i64,
}

/// Request to delete a file
#[derive(Debug, Clone, Serialize)]
pub struct DeleteFileRequest {
    /// File ID
    pub file: FileId,
}

impl DeleteFileRequest {
    /// Create a new request
    pub fn new(file: impl Into<FileId>) -> Self {
        Self { file: file.into() }
    }
}

/// Response from files.delete
#[derive(Debug, Clone, Deserialize)]
pub struct DeleteFileResponse {
    /// Success indicator
    pub ok: bool,
}

/// Request to share a file
#[derive(Debug, Clone, Serialize)]
pub struct ShareFileRequest {
    /// File ID
    pub file: FileId,
    /// Channel to share to
    pub channel: ChannelId,
}

impl ShareFileRequest {
    /// Create a new request
    pub fn new(file: impl Into<FileId>, channel: impl Into<ChannelId>) -> Self {
        Self {
            file: file.into(),
            channel: channel.into(),
        }
    }
}

/// Response from files.sharedPublicURL
#[derive(Debug, Clone, Deserialize)]
pub struct SharedPublicURLResponse {
    /// Success indicator
    pub ok: bool,
    /// Updated file
    pub file: File,
}

/// Request to revoke public URL
#[derive(Debug, Clone, Serialize)]
pub struct RevokePublicURLRequest {
    /// File ID
    pub file: FileId,
}

impl RevokePublicURLRequest {
    /// Create a new request
    pub fn new(file: impl Into<FileId>) -> Self {
        Self { file: file.into() }
    }
}

/// Trait for files service operations
#[async_trait]
pub trait FilesServiceTrait: Send + Sync {
    /// Upload a file
    async fn upload(&self, request: UploadFileRequest) -> SlackResult<UploadFileResponse>;

    /// List files
    async fn list(&self, request: ListFilesRequest) -> SlackResult<ListFilesResponse>;

    /// Get file info
    async fn info(&self, request: GetFileInfoRequest) -> SlackResult<GetFileInfoResponse>;

    /// Delete a file
    async fn delete(&self, request: DeleteFileRequest) -> SlackResult<DeleteFileResponse>;

    /// Make a file public
    async fn shared_public_url(&self, file: FileId) -> SlackResult<SharedPublicURLResponse>;

    /// Revoke public URL
    async fn revoke_public_url(&self, request: RevokePublicURLRequest) -> SlackResult<DeleteFileResponse>;
}

/// Files service implementation
#[derive(Clone)]
pub struct FilesService {
    transport: Arc<dyn HttpTransport>,
    auth: AuthManager,
    base_url: String,
    resilience: Arc<ResilienceOrchestrator>,
}

impl FilesService {
    /// Create a new files service
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
impl FilesServiceTrait for FilesService {
    #[instrument(skip(self, request))]
    async fn upload(&self, request: UploadFileRequest) -> SlackResult<UploadFileResponse> {
        let url = self.build_url("files.upload");
        let headers = self.auth.get_primary_headers()?;

        let mut multipart = MultipartRequest::new(url.clone(), headers);

        if let Some(channels) = &request.channels {
            multipart = multipart.field(
                "channels",
                channels
                    .iter()
                    .map(|c| c.as_str())
                    .collect::<Vec<_>>()
                    .join(","),
            );
        }

        if let Some(content) = request.content {
            let filename = request.filename.unwrap_or_else(|| "file".to_string());
            multipart = multipart.file(FileUpload::new("file", &filename, content));
        }

        if let Some(filetype) = request.filetype {
            multipart = multipart.field("filetype", filetype);
        }

        if let Some(comment) = request.initial_comment {
            multipart = multipart.field("initial_comment", comment);
        }

        if let Some(thread_ts) = request.thread_ts {
            multipart = multipart.field("thread_ts", thread_ts);
        }

        if let Some(title) = request.title {
            multipart = multipart.field("title", title);
        }

        self.transport.send_multipart(multipart).await
    }

    #[instrument(skip(self))]
    async fn list(&self, request: ListFilesRequest) -> SlackResult<ListFilesResponse> {
        let url = self.build_url("files.list");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("files.list", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(file = %request.file))]
    async fn info(&self, request: GetFileInfoRequest) -> SlackResult<GetFileInfoResponse> {
        let url = self.build_url("files.info");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("files.info", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(file = %request.file))]
    async fn delete(&self, request: DeleteFileRequest) -> SlackResult<DeleteFileResponse> {
        let url = self.build_url("files.delete");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("files.delete", &DefaultRetryPolicy, || {
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

    #[instrument(skip(self), fields(file = %file))]
    async fn shared_public_url(&self, file: FileId) -> SlackResult<SharedPublicURLResponse> {
        let url = self.build_url("files.sharedPublicURL");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        #[derive(Serialize, Clone)]
        struct Request {
            file: FileId,
        }

        self.resilience
            .execute("files.sharedPublicURL", &DefaultRetryPolicy, || {
                let url = url.clone();
                let headers = headers.clone();
                let file = file.clone();
                let transport = transport.clone();
                async move {
                    transport
                        .send_json(TransportRequest::post(url, headers, Request { file }))
                        .await
                }
            })
            .await
    }

    #[instrument(skip(self), fields(file = %request.file))]
    async fn revoke_public_url(&self, request: RevokePublicURLRequest) -> SlackResult<DeleteFileResponse> {
        let url = self.build_url("files.revokePublicURL");
        let headers = self.auth.get_primary_headers()?;
        let transport = self.transport.clone();

        self.resilience
            .execute("files.revokePublicURL", &DefaultRetryPolicy, || {
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
