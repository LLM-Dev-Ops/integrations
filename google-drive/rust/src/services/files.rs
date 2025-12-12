//! Files service for Google Drive API.
//!
//! This module provides comprehensive file operations for Google Drive including:
//! - CRUD operations (create, read, update, delete, copy)
//! - Upload operations (simple, multipart, resumable)
//! - Download operations (direct and streaming)
//! - Export operations (Google Workspace files)
//! - Folder operations (create, move)
//! - Utility operations (generate IDs, empty trash)

use crate::client::RequestExecutor;
use crate::errors::{GoogleDriveError, GoogleDriveResult};
use crate::transport::{HttpMethod, RequestBody};
use crate::types::*;
use bytes::Bytes;
use futures::Stream;
use std::sync::Arc;

/// Service for file operations.
pub struct FilesService {
    executor: Arc<RequestExecutor>,
}

impl FilesService {
    /// Creates a new files service.
    pub(crate) fn new(executor: Arc<RequestExecutor>) -> Self {
        Self { executor }
    }

    // ========================================================================
    // CRUD Operations
    // ========================================================================

    /// Creates a new file with metadata only.
    ///
    /// # Arguments
    ///
    /// * `request` - File creation request with metadata
    ///
    /// # Returns
    ///
    /// The created file metadata
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use integrations_google_drive::*;
    /// # use integrations_google_drive::types::CreateFileRequest;
    /// # async fn example(client: GoogleDriveClient) -> GoogleDriveResult<()> {
    /// let request = CreateFileRequest {
    ///     name: "My Document".to_string(),
    ///     mime_type: Some("text/plain".to_string()),
    ///     parents: Some(vec!["folder_id".to_string()]),
    ///     ..Default::default()
    /// };
    ///
    /// let file = client.files().create(request).await?;
    /// println!("Created file: {} ({})", file.name, file.id);
    /// # Ok(())
    /// # }
    /// ```
    pub async fn create(&self, request: CreateFileRequest) -> GoogleDriveResult<DriveFile> {
        // Validate request
        if request.name.is_empty() {
            return Err(GoogleDriveError::Request(
                crate::errors::RequestError::MissingParameter("name is required".to_string())
            ));
        }

        // Serialize request body
        let body = serde_json::to_vec(&request)
            .map_err(|e| GoogleDriveError::Request(
                crate::errors::RequestError::ValidationError(format!("Failed to serialize request: {}", e))
            ))?;

        self.executor
            .execute_request(HttpMethod::POST, "/files", Some(RequestBody::Bytes(Bytes::from(body))))
            .await
    }

    /// Gets file metadata.
    ///
    /// # Arguments
    ///
    /// * `file_id` - The ID of the file
    /// * `params` - Optional parameters for the request
    ///
    /// # Returns
    ///
    /// File metadata
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use integrations_google_drive::*;
    /// # use integrations_google_drive::types::GetFileParams;
    /// # async fn example(client: GoogleDriveClient) -> GoogleDriveResult<()> {
    /// let file = client.files().get("file_id", None).await?;
    /// println!("File: {} ({})", file.name, file.mime_type);
    /// # Ok(())
    /// # }
    /// ```
    pub async fn get(
        &self,
        file_id: &str,
        params: Option<GetFileParams>,
    ) -> GoogleDriveResult<DriveFile> {
        // Validate file ID
        if file_id.is_empty() {
            return Err(GoogleDriveError::Request(
                crate::errors::RequestError::MissingParameter("file_id is required".to_string())
            ));
        }

        let mut path = format!("/files/{}", urlencoding::encode(file_id));

        // Add query parameters if provided
        if let Some(p) = params {
            let mut query_parts = Vec::new();

            if let Some(ack) = p.acknowledge_abuse {
                if ack {
                    query_parts.push("acknowledgeAbuse=true".to_string());
                }
            }
            if let Some(fields) = p.fields {
                query_parts.push(format!("fields={}", urlencoding::encode(&fields)));
            }
            if let Some(supports_all) = p.supports_all_drives {
                if supports_all {
                    query_parts.push("supportsAllDrives=true".to_string());
                }
            }

            if !query_parts.is_empty() {
                path.push('?');
                path.push_str(&query_parts.join("&"));
            }
        }

        self.executor
            .execute_request(HttpMethod::GET, &path, None)
            .await
    }

    /// Lists files with optional query parameters.
    ///
    /// # Arguments
    ///
    /// * `params` - Optional parameters for filtering and pagination
    ///
    /// # Returns
    ///
    /// A paginated list of files
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use integrations_google_drive::*;
    /// # use integrations_google_drive::types::ListFilesParams;
    /// # async fn example(client: GoogleDriveClient) -> GoogleDriveResult<()> {
    /// let params = ListFilesParams {
    ///     q: Some("name contains 'report'".to_string()),
    ///     page_size: Some(100),
    ///     ..Default::default()
    /// };
    ///
    /// let file_list = client.files().list(Some(params)).await?;
    /// for file in file_list.files {
    ///     println!("{}: {}", file.name, file.id);
    /// }
    /// # Ok(())
    /// # }
    /// ```
    pub async fn list(&self, params: Option<ListFilesParams>) -> GoogleDriveResult<FileList> {
        // Validate page size if provided
        if let Some(ref p) = params {
            if let Some(page_size) = p.page_size {
                if page_size < 1 || page_size > 1000 {
                    return Err(GoogleDriveError::Request(
                        crate::errors::RequestError::InvalidParameter(
                            "pageSize must be between 1 and 1000".to_string()
                        )
                    ));
                }
            }
        }

        let mut path = "/files".to_string();

        // Build query parameters
        if let Some(p) = params {
            let mut query_parts = Vec::new();

            if let Some(corpora) = p.corpora {
                query_parts.push(format!("corpora={}", urlencoding::encode(&corpora)));
            }
            if let Some(drive_id) = p.drive_id {
                query_parts.push(format!("driveId={}", urlencoding::encode(&drive_id)));
            }
            if let Some(include_all) = p.include_items_from_all_drives {
                if include_all {
                    query_parts.push("includeItemsFromAllDrives=true".to_string());
                }
            }
            if let Some(order_by) = p.order_by {
                query_parts.push(format!("orderBy={}", urlencoding::encode(&order_by)));
            }
            if let Some(page_size) = p.page_size {
                query_parts.push(format!("pageSize={}", page_size));
            }
            if let Some(page_token) = p.page_token {
                query_parts.push(format!("pageToken={}", urlencoding::encode(&page_token)));
            }
            if let Some(q) = p.q {
                query_parts.push(format!("q={}", urlencoding::encode(&q)));
            }
            if let Some(spaces) = p.spaces {
                query_parts.push(format!("spaces={}", urlencoding::encode(&spaces)));
            }
            if let Some(supports_all) = p.supports_all_drives {
                if supports_all {
                    query_parts.push("supportsAllDrives=true".to_string());
                }
            }
            if let Some(fields) = p.fields {
                query_parts.push(format!("fields={}", urlencoding::encode(&fields)));
            }

            if !query_parts.is_empty() {
                path.push('?');
                path.push_str(&query_parts.join("&"));
            }
        }

        self.executor
            .execute_request(HttpMethod::GET, &path, None)
            .await
    }

    /// Lists all files with automatic pagination.
    ///
    /// This returns a stream that automatically fetches subsequent pages as needed.
    ///
    /// # Arguments
    ///
    /// * `params` - Optional parameters for filtering
    ///
    /// # Returns
    ///
    /// A stream of files
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use integrations_google_drive::*;
    /// # use integrations_google_drive::types::ListFilesParams;
    /// # use futures::StreamExt;
    /// # async fn example(client: GoogleDriveClient) -> GoogleDriveResult<()> {
    /// let mut stream = client.files().list_all(None);
    ///
    /// while let Some(result) = stream.next().await {
    ///     let file = result?;
    ///     println!("{}: {}", file.name, file.id);
    /// }
    /// # Ok(())
    /// # }
    /// ```
    pub fn list_all(
        &self,
        params: Option<ListFilesParams>,
    ) -> impl Stream<Item = GoogleDriveResult<DriveFile>> + '_ {
        async_stream::stream! {
            let mut page_token: Option<String> = None;

            loop {
                let mut current_params = params.clone().unwrap_or_default();
                current_params.page_token = page_token.clone();

                let result = self.list(Some(current_params)).await;

                match result {
                    Ok(file_list) => {
                        for file in file_list.files {
                            yield Ok(file);
                        }

                        page_token = file_list.next_page_token;
                        if page_token.is_none() {
                            break;
                        }
                    }
                    Err(e) => {
                        yield Err(e);
                        break;
                    }
                }
            }
        }
    }

    /// Updates file metadata.
    ///
    /// # Arguments
    ///
    /// * `file_id` - The ID of the file to update
    /// * `request` - Update request with fields to change
    ///
    /// # Returns
    ///
    /// The updated file metadata
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use integrations_google_drive::*;
    /// # use integrations_google_drive::types::UpdateFileRequest;
    /// # async fn example(client: GoogleDriveClient) -> GoogleDriveResult<()> {
    /// let request = UpdateFileRequest {
    ///     name: Some("New Name".to_string()),
    ///     starred: Some(true),
    ///     ..Default::default()
    /// };
    ///
    /// let file = client.files().update("file_id", request).await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn update(
        &self,
        file_id: &str,
        request: UpdateFileRequest,
    ) -> GoogleDriveResult<DriveFile> {
        // Validate file ID
        if file_id.is_empty() {
            return Err(GoogleDriveError::Request(
                crate::errors::RequestError::MissingParameter("file_id is required".to_string())
            ));
        }

        let path = format!("/files/{}", urlencoding::encode(file_id));

        // Serialize request body
        let body = serde_json::to_vec(&request)
            .map_err(|e| GoogleDriveError::Request(
                crate::errors::RequestError::ValidationError(format!("Failed to serialize request: {}", e))
            ))?;

        self.executor
            .execute_request(HttpMethod::PATCH, &path, Some(RequestBody::Bytes(Bytes::from(body))))
            .await
    }

    /// Deletes a file permanently.
    ///
    /// # Arguments
    ///
    /// * `file_id` - The ID of the file to delete
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use integrations_google_drive::*;
    /// # async fn example(client: GoogleDriveClient) -> GoogleDriveResult<()> {
    /// client.files().delete("file_id").await?;
    /// println!("File deleted");
    /// # Ok(())
    /// # }
    /// ```
    pub async fn delete(&self, file_id: &str) -> GoogleDriveResult<()> {
        // Validate file ID
        if file_id.is_empty() {
            return Err(GoogleDriveError::Request(
                crate::errors::RequestError::MissingParameter("file_id is required".to_string())
            ));
        }

        let path = format!("/files/{}", urlencoding::encode(file_id));

        // Execute request with empty response type
        let _: serde_json::Value = self.executor
            .execute_request(HttpMethod::DELETE, &path, None)
            .await?;

        Ok(())
    }

    /// Copies a file.
    ///
    /// # Arguments
    ///
    /// * `file_id` - The ID of the file to copy
    /// * `request` - Copy request with optional metadata for the copy
    ///
    /// # Returns
    ///
    /// The copied file metadata
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use integrations_google_drive::*;
    /// # use integrations_google_drive::types::CopyFileRequest;
    /// # async fn example(client: GoogleDriveClient) -> GoogleDriveResult<()> {
    /// let request = CopyFileRequest {
    ///     name: Some("Copy of File".to_string()),
    ///     parents: Some(vec!["folder_id".to_string()]),
    ///     ..Default::default()
    /// };
    ///
    /// let copied_file = client.files().copy("file_id", request).await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn copy(
        &self,
        file_id: &str,
        request: CopyFileRequest,
    ) -> GoogleDriveResult<DriveFile> {
        // Validate file ID
        if file_id.is_empty() {
            return Err(GoogleDriveError::Request(
                crate::errors::RequestError::MissingParameter("file_id is required".to_string())
            ));
        }

        let path = format!("/files/{}/copy", urlencoding::encode(file_id));

        // Serialize request body
        let body = serde_json::to_vec(&request)
            .map_err(|e| GoogleDriveError::Request(
                crate::errors::RequestError::ValidationError(format!("Failed to serialize request: {}", e))
            ))?;

        self.executor
            .execute_request(HttpMethod::POST, &path, Some(RequestBody::Bytes(Bytes::from(body))))
            .await
    }

    // ========================================================================
    // Upload Operations
    // ========================================================================

    /// Creates a file with content using simple upload (<= 5MB).
    ///
    /// # Arguments
    ///
    /// * `metadata` - File metadata
    /// * `content` - File content
    /// * `mime_type` - MIME type of the content
    ///
    /// # Returns
    ///
    /// The created file metadata
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use integrations_google_drive::*;
    /// # use integrations_google_drive::types::CreateFileRequest;
    /// # use bytes::Bytes;
    /// # async fn example(client: GoogleDriveClient) -> GoogleDriveResult<()> {
    /// let metadata = CreateFileRequest {
    ///     name: "document.txt".to_string(),
    ///     ..Default::default()
    /// };
    ///
    /// let content = Bytes::from("Hello, World!");
    /// let file = client.files().create_with_content(metadata, content, "text/plain").await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn create_with_content(
        &self,
        metadata: CreateFileRequest,
        content: Bytes,
        mime_type: &str,
    ) -> GoogleDriveResult<DriveFile> {
        // Validate size for simple upload (max 5MB)
        if content.len() > 5 * 1024 * 1024 {
            return Err(GoogleDriveError::Upload(
                crate::errors::UploadError::UploadSizeExceeded(
                    "Simple upload limited to 5MB. Use resumable upload for larger files.".to_string()
                )
            ));
        }

        // Simple upload using multipart
        self.create_multipart(metadata, content, mime_type).await
    }

    /// Creates a file with content using multipart upload (metadata + content, <= 5MB).
    ///
    /// # Arguments
    ///
    /// * `metadata` - File metadata
    /// * `content` - File content
    /// * `mime_type` - MIME type of the content
    ///
    /// # Returns
    ///
    /// The created file metadata
    pub async fn create_multipart(
        &self,
        metadata: CreateFileRequest,
        content: Bytes,
        mime_type: &str,
    ) -> GoogleDriveResult<DriveFile> {
        // Validate size for multipart upload (max 5MB)
        if content.len() > 5 * 1024 * 1024 {
            return Err(GoogleDriveError::Upload(
                crate::errors::UploadError::UploadSizeExceeded(
                    "Multipart upload limited to 5MB. Use resumable upload for larger files.".to_string()
                )
            ));
        }

        // Validate name
        if metadata.name.is_empty() {
            return Err(GoogleDriveError::Request(
                crate::errors::RequestError::MissingParameter("name is required".to_string())
            ));
        }

        // Delegate to upload service
        let upload_service = super::upload::UploadService::new(self.executor.clone());
        upload_service.multipart_upload(metadata, content, mime_type).await
    }

    /// Creates a file with resumable upload session for large files.
    ///
    /// # Arguments
    ///
    /// * `metadata` - File metadata
    /// * `content_length` - Total size of the content in bytes
    /// * `mime_type` - MIME type of the content
    ///
    /// # Returns
    ///
    /// A resumable upload session for uploading the content
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use integrations_google_drive::*;
    /// # use integrations_google_drive::types::CreateFileRequest;
    /// # use bytes::Bytes;
    /// # async fn example(client: GoogleDriveClient) -> GoogleDriveResult<()> {
    /// let metadata = CreateFileRequest {
    ///     name: "large_file.bin".to_string(),
    ///     ..Default::default()
    /// };
    ///
    /// let session = client.files()
    ///     .create_resumable(metadata, 100_000_000, "application/octet-stream")
    ///     .await?;
    ///
    /// // Upload content in chunks
    /// let content = Bytes::from(vec![0u8; 100_000_000]);
    /// let file = session.upload(content).await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn create_resumable(
        &self,
        metadata: CreateFileRequest,
        content_length: u64,
        mime_type: &str,
    ) -> GoogleDriveResult<super::upload::ResumableUploadSession> {
        // Validate name
        if metadata.name.is_empty() {
            return Err(GoogleDriveError::Request(
                crate::errors::RequestError::MissingParameter("name is required".to_string())
            ));
        }

        // Delegate to upload service
        let upload_service = super::upload::UploadService::new(self.executor.clone());
        upload_service.initiate_resumable(metadata, content_length, mime_type).await
    }

    // ========================================================================
    // Download Operations
    // ========================================================================

    /// Downloads file content.
    ///
    /// # Arguments
    ///
    /// * `file_id` - The ID of the file to download
    ///
    /// # Returns
    ///
    /// File content as bytes
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use integrations_google_drive::*;
    /// # async fn example(client: GoogleDriveClient) -> GoogleDriveResult<()> {
    /// let content = client.files().download("file_id").await?;
    /// println!("Downloaded {} bytes", content.len());
    /// # Ok(())
    /// # }
    /// ```
    pub async fn download(&self, file_id: &str) -> GoogleDriveResult<Bytes> {
        // Validate file ID
        if file_id.is_empty() {
            return Err(GoogleDriveError::Request(
                crate::errors::RequestError::MissingParameter("file_id is required".to_string())
            ));
        }

        let path = format!("/files/{}?alt=media", urlencoding::encode(file_id));
        self.executor
            .execute_request_raw(HttpMethod::GET, &path, None)
            .await
    }

    /// Downloads file content as a stream.
    ///
    /// This method is a placeholder for streaming download functionality.
    /// For now, it downloads the entire file and returns it as a single-item stream.
    ///
    /// # Arguments
    ///
    /// * `file_id` - The ID of the file to download
    ///
    /// # Returns
    ///
    /// A stream of file content chunks
    pub async fn download_stream(
        &self,
        file_id: &str,
    ) -> GoogleDriveResult<impl Stream<Item = GoogleDriveResult<Bytes>>> {
        // For now, download the entire file and wrap in a stream
        // TODO: Implement true streaming download
        let content = self.download(file_id).await?;

        Ok(futures::stream::once(async move { Ok(content) }))
    }

    // ========================================================================
    // Export Operations
    // ========================================================================

    /// Exports a Google Workspace file to a specific MIME type.
    ///
    /// # Arguments
    ///
    /// * `file_id` - The ID of the Google Workspace file to export
    /// * `mime_type` - The MIME type to export to
    ///
    /// # Returns
    ///
    /// Exported content as bytes (max 10MB)
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use integrations_google_drive::*;
    /// # async fn example(client: GoogleDriveClient) -> GoogleDriveResult<()> {
    /// // Export Google Doc to PDF
    /// let pdf = client.files()
    ///     .export("doc_id", "application/pdf")
    ///     .await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn export(&self, file_id: &str, mime_type: &str) -> GoogleDriveResult<Bytes> {
        // Validate file ID
        if file_id.is_empty() {
            return Err(GoogleDriveError::Request(
                crate::errors::RequestError::MissingParameter("file_id is required".to_string())
            ));
        }

        // Validate export MIME type
        if !Self::is_valid_export_mime_type(mime_type) {
            return Err(GoogleDriveError::Export(
                crate::errors::ExportError::InvalidExportFormat(
                    format!("Unsupported export format: {}", mime_type)
                )
            ));
        }

        let path = format!(
            "/files/{}/export?mimeType={}",
            urlencoding::encode(file_id),
            urlencoding::encode(mime_type)
        );

        self.executor
            .execute_request_raw(HttpMethod::GET, &path, None)
            .await
    }

    // ========================================================================
    // Folder Operations
    // ========================================================================

    /// Creates a folder.
    ///
    /// # Arguments
    ///
    /// * `request` - Folder creation request
    ///
    /// # Returns
    ///
    /// The created folder metadata
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use integrations_google_drive::*;
    /// # use integrations_google_drive::types::CreateFolderRequest;
    /// # async fn example(client: GoogleDriveClient) -> GoogleDriveResult<()> {
    /// let request = CreateFolderRequest {
    ///     name: "My Folder".to_string(),
    ///     parents: Some(vec!["parent_folder_id".to_string()]),
    ///     ..Default::default()
    /// };
    ///
    /// let folder = client.files().create_folder(request).await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn create_folder(&self, request: CreateFolderRequest) -> GoogleDriveResult<DriveFile> {
        // Validate name
        if request.name.is_empty() {
            return Err(GoogleDriveError::Request(
                crate::errors::RequestError::MissingParameter("name is required".to_string())
            ));
        }

        // Build create file request with folder MIME type
        let create_request = CreateFileRequest {
            name: request.name,
            mime_type: Some("application/vnd.google-apps.folder".to_string()),
            description: request.description,
            parents: request.parents,
            properties: request.properties,
            folder_color_rgb: request.folder_color_rgb,
            ..Default::default()
        };

        self.create(create_request).await
    }

    /// Moves a file to different parent folders.
    ///
    /// # Arguments
    ///
    /// * `file_id` - The ID of the file to move
    /// * `add_parents` - Parent folder IDs to add
    /// * `remove_parents` - Parent folder IDs to remove
    ///
    /// # Returns
    ///
    /// The updated file metadata
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use integrations_google_drive::*;
    /// # async fn example(client: GoogleDriveClient) -> GoogleDriveResult<()> {
    /// // Move file to a new folder
    /// let file = client.files().move_file(
    ///     "file_id",
    ///     &["new_folder_id"],
    ///     &["old_folder_id"]
    /// ).await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn move_file(
        &self,
        file_id: &str,
        add_parents: &[&str],
        remove_parents: &[&str],
    ) -> GoogleDriveResult<DriveFile> {
        // Validate file ID
        if file_id.is_empty() {
            return Err(GoogleDriveError::Request(
                crate::errors::RequestError::MissingParameter("file_id is required".to_string())
            ));
        }

        // Build query parameters
        let mut query_params = Vec::new();
        if !add_parents.is_empty() {
            query_params.push(format!("addParents={}", add_parents.join(",")));
        }
        if !remove_parents.is_empty() {
            query_params.push(format!("removeParents={}", remove_parents.join(",")));
        }

        let mut path = format!("/files/{}", urlencoding::encode(file_id));
        if !query_params.is_empty() {
            path.push('?');
            path.push_str(&query_params.join("&"));
        }

        // PATCH with empty body (changes are in query params)
        let body = serde_json::to_vec(&serde_json::json!({}))
            .map_err(|e| GoogleDriveError::Request(
                crate::errors::RequestError::ValidationError(format!("Failed to serialize empty body: {}", e))
            ))?;

        self.executor
            .execute_request(HttpMethod::PATCH, &path, Some(RequestBody::Bytes(Bytes::from(body))))
            .await
    }

    // ========================================================================
    // Utility Operations
    // ========================================================================

    /// Generates file IDs for pre-creating files.
    ///
    /// # Arguments
    ///
    /// * `count` - Number of IDs to generate (default: 10, max: 1000)
    ///
    /// # Returns
    ///
    /// List of generated file IDs
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use integrations_google_drive::*;
    /// # async fn example(client: GoogleDriveClient) -> GoogleDriveResult<()> {
    /// let ids = client.files().generate_ids(Some(5)).await?;
    /// for id in ids {
    ///     println!("Generated ID: {}", id);
    /// }
    /// # Ok(())
    /// # }
    /// ```
    pub async fn generate_ids(&self, count: Option<u32>) -> GoogleDriveResult<Vec<String>> {
        // Validate count
        if let Some(c) = count {
            if c < 1 || c > 1000 {
                return Err(GoogleDriveError::Request(
                    crate::errors::RequestError::InvalidParameter(
                        "count must be between 1 and 1000".to_string()
                    )
                ));
            }
        }

        let mut path = "/files/generateIds".to_string();
        if let Some(c) = count {
            path.push_str(&format!("?count={}", c));
        }

        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct GeneratedIds {
            ids: Vec<String>,
        }

        let response: GeneratedIds = self.executor
            .execute_request(HttpMethod::GET, &path, None)
            .await?;

        Ok(response.ids)
    }

    /// Empties the trash.
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use integrations_google_drive::*;
    /// # async fn example(client: GoogleDriveClient) -> GoogleDriveResult<()> {
    /// client.files().empty_trash().await?;
    /// println!("Trash emptied");
    /// # Ok(())
    /// # }
    /// ```
    pub async fn empty_trash(&self) -> GoogleDriveResult<()> {
        // Execute DELETE request (no response body expected)
        let _: serde_json::Value = self.executor
            .execute_request(HttpMethod::DELETE, "/files/trash", None)
            .await?;

        Ok(())
    }

    // ========================================================================
    // Helper Methods
    // ========================================================================

    /// Checks if the given MIME type is valid for export operations.
    fn is_valid_export_mime_type(mime_type: &str) -> bool {
        matches!(
            mime_type,
            // Document exports
            "text/plain"
            | "text/html"
            | "application/pdf"
            | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            | "application/rtf"
            | "application/epub+zip"
            | "application/vnd.oasis.opendocument.text"
            // Spreadsheet exports
            | "text/csv"
            | "text/tab-separated-values"
            | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            | "application/vnd.oasis.opendocument.spreadsheet"
            // Presentation exports
            | "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            | "application/vnd.oasis.opendocument.presentation"
            // Drawing exports
            | "image/png"
            | "image/jpeg"
            | "image/svg+xml"
            // Apps Script export
            | "application/vnd.google-apps.script+json"
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_valid_export_mime_type() {
        assert!(FilesService::is_valid_export_mime_type("application/pdf"));
        assert!(FilesService::is_valid_export_mime_type("text/plain"));
        assert!(FilesService::is_valid_export_mime_type("text/csv"));
        assert!(!FilesService::is_valid_export_mime_type("invalid/type"));
    }
}
