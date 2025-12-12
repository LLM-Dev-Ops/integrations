//! Resumable upload operations for Google Drive.
//!
//! This module provides resumable upload functionality for large files (up to 5TB).
//! Resumable uploads allow uploading large files in chunks with automatic retry and
//! recovery from interruptions.
//!
//! # Features
//! - Chunk-based uploading with configurable chunk size (must be multiple of 256KB)
//! - Automatic status querying and resume capability
//! - Stream-based uploads for memory efficiency
//! - Proper error handling and recovery
//! - 308 Resume Incomplete handling
//!
//! # Example
//! ```no_run
//! use integrations_google_drive::GoogleDriveClient;
//! use bytes::Bytes;
//!
//! # async fn example(client: GoogleDriveClient) -> Result<(), Box<dyn std::error::Error>> {
//! // Initiate a resumable upload
//! let session = client.files()
//!     .create_resumable("large_file.zip", 104857600, "application/zip")
//!     .await?;
//!
//! // Upload content in chunks
//! let content = vec![0u8; 104857600];
//! let file = session.upload_bytes(Bytes::from(content)).await?;
//! # Ok(())
//! # }
//! ```

use crate::errors::*;
use crate::types::DriveFile;
use bytes::Bytes;
use futures::Stream;
use futures::StreamExt;
use reqwest::{Client as HttpClient, StatusCode};
use std::io;
use tracing::{debug, info, warn};

/// Minimum chunk size for resumable uploads (256KB).
pub const MIN_CHUNK_SIZE: usize = 256 * 1024;

/// Default chunk size for resumable uploads (8MB).
pub const DEFAULT_CHUNK_SIZE: usize = 8 * 1024 * 1024;

/// Maximum file size for resumable uploads (5TB).
pub const MAX_FILE_SIZE: u64 = 5 * 1024 * 1024 * 1024 * 1024;

/// Resumable upload session for large files (up to 5TB).
///
/// This struct manages a resumable upload session, allowing large files to be
/// uploaded in chunks. The session can be resumed after interruptions by querying
/// the server for the current upload status.
///
/// # Protocol
/// 1. Initiate upload: POST with metadata, receive upload URI
/// 2. Upload chunks: PUT to upload URI with Content-Range header
/// 3. On interruption: PUT with Content-Range: bytes */{total} to query status
/// 4. Resume: Continue from bytes_received offset
pub struct ResumableUploadSession {
    /// The resumable upload URI received from the server.
    upload_uri: String,

    /// Total size of the file being uploaded.
    total_size: u64,

    /// Number of bytes successfully uploaded.
    bytes_uploaded: u64,

    /// Chunk size for uploads (must be multiple of 256KB).
    chunk_size: usize,

    /// HTTP client for making requests.
    http_client: HttpClient,
}

impl ResumableUploadSession {
    /// Creates a new resumable upload session.
    ///
    /// # Arguments
    /// * `upload_uri` - The resumable upload URI from the initiation response
    /// * `total_size` - Total size of the file to upload
    /// * `chunk_size` - Size of each chunk (must be multiple of 256KB)
    ///
    /// # Errors
    /// Returns an error if the chunk size is not a multiple of 256KB.
    pub fn new(upload_uri: String, total_size: u64, chunk_size: usize) -> GoogleDriveResult<Self> {
        // Validate chunk size (must be multiple of 256KB)
        if chunk_size < MIN_CHUNK_SIZE {
            return Err(GoogleDriveError::Upload(UploadError::ChunkSizeMismatch(
                format!("Chunk size must be at least {} bytes (256KB)", MIN_CHUNK_SIZE)
            )));
        }

        if chunk_size % MIN_CHUNK_SIZE != 0 {
            return Err(GoogleDriveError::Upload(UploadError::ChunkSizeMismatch(
                format!("Chunk size must be a multiple of {} bytes (256KB)", MIN_CHUNK_SIZE)
            )));
        }

        // Validate total size
        if total_size > MAX_FILE_SIZE {
            return Err(GoogleDriveError::Upload(UploadError::UploadSizeExceeded(
                format!("File size {} exceeds maximum of {} bytes (5TB)", total_size, MAX_FILE_SIZE)
            )));
        }

        Ok(Self {
            upload_uri,
            total_size,
            bytes_uploaded: 0,
            chunk_size,
            http_client: HttpClient::new(),
        })
    }

    /// Gets the resumable upload URI.
    pub fn upload_uri(&self) -> &str {
        &self.upload_uri
    }

    /// Gets the total size of the upload.
    pub fn total_size(&self) -> u64 {
        self.total_size
    }

    /// Gets the number of bytes uploaded so far.
    pub fn bytes_uploaded(&self) -> u64 {
        self.bytes_uploaded
    }

    /// Gets the configured chunk size.
    pub fn chunk_size(&self) -> usize {
        self.chunk_size
    }

    /// Uploads a single chunk of data.
    ///
    /// # Arguments
    /// * `chunk` - The data chunk to upload
    /// * `offset` - The byte offset where this chunk starts
    ///
    /// # Returns
    /// - `UploadChunkResult::InProgress` with bytes received if more chunks are needed
    /// - `UploadChunkResult::Complete` with the file metadata if upload is complete
    ///
    /// # Protocol
    /// Sends a PUT request to the upload URI with:
    /// - Content-Length: size of the chunk
    /// - Content-Range: bytes {offset}-{offset+len-1}/{total}
    ///
    /// Expected responses:
    /// - 308 Resume Incomplete: More chunks needed (Range header indicates bytes received)
    /// - 200/201 OK: Upload complete (response contains file metadata)
    pub async fn upload_chunk(&mut self, chunk: Bytes, offset: u64) -> GoogleDriveResult<UploadChunkResult> {
        if chunk.is_empty() {
            return Err(GoogleDriveError::Upload(UploadError::InvalidUploadRequest(
                "Cannot upload empty chunk".to_string()
            )));
        }

        let chunk_len = chunk.len() as u64;
        let end = offset + chunk_len - 1;

        // Build Content-Range header: bytes {start}-{end}/{total}
        let content_range = format!("bytes {}-{}/{}", offset, end, self.total_size);

        debug!(
            upload_uri = %self.upload_uri,
            offset = offset,
            chunk_size = chunk_len,
            total_size = self.total_size,
            "Uploading chunk"
        );

        // Send PUT request with chunk
        let response = self.http_client
            .put(&self.upload_uri)
            .header("Content-Length", chunk_len.to_string())
            .header("Content-Range", &content_range)
            .body(chunk)
            .send()
            .await
            .map_err(|e| {
                warn!(error = %e, "Failed to upload chunk");
                GoogleDriveError::Upload(UploadError::UploadInterrupted(
                    format!("Network error during upload: {}", e)
                ))
            })?;

        let status = response.status();

        match status {
            // Upload complete
            StatusCode::OK | StatusCode::CREATED => {
                info!(
                    total_size = self.total_size,
                    "Resumable upload completed successfully"
                );

                let file = response
                    .json::<DriveFile>()
                    .await
                    .map_err(|e| GoogleDriveError::Response(ResponseError::DeserializationError(
                        format!("Failed to deserialize file response: {}", e)
                    )))?;

                self.bytes_uploaded = self.total_size;
                Ok(UploadChunkResult::Complete(file))
            }

            // Resume incomplete - more chunks needed
            StatusCode::PERMANENT_REDIRECT => {
                let bytes_received = Self::parse_range_header(&response)?;

                debug!(
                    bytes_received = bytes_received,
                    total_size = self.total_size,
                    percent = (bytes_received as f64 / self.total_size as f64 * 100.0),
                    "Upload in progress"
                );

                self.bytes_uploaded = bytes_received;
                Ok(UploadChunkResult::InProgress { bytes_received })
            }

            // Upload session not found (expired)
            StatusCode::NOT_FOUND => {
                warn!("Resumable upload session expired");
                Err(GoogleDriveError::Upload(UploadError::ResumableUploadExpired(
                    "Upload session expired. Please initiate a new upload.".to_string()
                )))
            }

            // Client errors (400-499)
            StatusCode::BAD_REQUEST | StatusCode::FORBIDDEN | StatusCode::UNAUTHORIZED => {
                let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
                warn!(status = %status, error = %error_text, "Upload request failed");
                Err(GoogleDriveError::Upload(UploadError::UploadFailed(
                    format!("Upload failed with status {}: {}", status, error_text)
                )))
            }

            // Server errors (500-599) - retryable
            s if s.is_server_error() => {
                warn!(status = %status, "Server error during upload");
                Err(GoogleDriveError::Upload(UploadError::UploadInterrupted(
                    format!("Server error: {}", status)
                )))
            }

            // Unexpected status
            _ => {
                warn!(status = %status, "Unexpected status code");
                Err(GoogleDriveError::Upload(UploadError::UploadFailed(
                    format!("Unexpected status code: {}", status)
                )))
            }
        }
    }

    /// Uploads content from a stream.
    ///
    /// This method reads chunks from the provided stream and uploads them sequentially.
    /// It handles buffering and ensures each upload chunk is the correct size.
    ///
    /// # Arguments
    /// * `stream` - Stream of byte chunks to upload
    ///
    /// # Returns
    /// The uploaded file metadata on success.
    ///
    /// # Example
    /// ```no_run
    /// use futures::stream;
    /// use bytes::Bytes;
    ///
    /// # async fn example(session: integrations_google_drive::services::upload::ResumableUploadSession) -> Result<(), Box<dyn std::error::Error>> {
    /// let chunks = vec![Bytes::from(vec![0u8; 1024]); 100];
    /// let stream = stream::iter(chunks.into_iter().map(Ok));
    /// let file = session.upload_stream(stream).await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn upload_stream<S>(&mut self, stream: S) -> GoogleDriveResult<DriveFile>
    where
        S: Stream<Item = Result<Bytes, io::Error>> + Send,
    {
        let mut stream = Box::pin(stream.map(|result| {
            result.map_err(|e| GoogleDriveError::Network(NetworkError::ConnectionFailed(
                format!("Stream error: {}", e)
            )))
        }));

        let mut buffer = Vec::new();
        let mut offset = self.bytes_uploaded;

        info!(
            total_size = self.total_size,
            chunk_size = self.chunk_size,
            "Starting stream upload"
        );

        // Read chunks from stream
        while let Some(result) = stream.next().await {
            let chunk = result?;
            buffer.extend_from_slice(&chunk);

            // Upload when buffer reaches chunk size
            while buffer.len() >= self.chunk_size {
                let upload_chunk = Bytes::from(buffer.drain(..self.chunk_size).collect::<Vec<u8>>());

                match self.upload_chunk(upload_chunk, offset).await? {
                    UploadChunkResult::Complete(file) => {
                        info!("Upload completed from stream");
                        return Ok(file);
                    }
                    UploadChunkResult::InProgress { bytes_received } => {
                        offset = bytes_received;
                    }
                }
            }
        }

        // Upload remaining data (last chunk can be smaller)
        if !buffer.is_empty() {
            let upload_chunk = Bytes::from(buffer);
            match self.upload_chunk(upload_chunk, offset).await? {
                UploadChunkResult::Complete(file) => {
                    info!("Upload completed with final chunk");
                    return Ok(file);
                }
                UploadChunkResult::InProgress { .. } => {
                    return Err(GoogleDriveError::Upload(UploadError::UploadFailed(
                        "Upload incomplete after all data sent".to_string()
                    )));
                }
            }
        }

        Err(GoogleDriveError::Upload(UploadError::UploadFailed(
            "Stream ended unexpectedly".to_string()
        )))
    }

    /// Uploads content from bytes.
    ///
    /// This is a convenience method for uploading content that is already in memory.
    /// For large files, consider using `upload_stream` instead to avoid loading the
    /// entire file into memory.
    ///
    /// # Arguments
    /// * `content` - The complete file content to upload
    ///
    /// # Returns
    /// The uploaded file metadata on success.
    pub async fn upload_bytes(&mut self, content: Bytes) -> GoogleDriveResult<DriveFile> {
        if content.len() as u64 != self.total_size {
            return Err(GoogleDriveError::Upload(UploadError::InvalidUploadRequest(
                format!(
                    "Content size {} does not match declared total size {}",
                    content.len(),
                    self.total_size
                )
            )));
        }

        let mut offset = self.bytes_uploaded;
        let content_len = content.len();

        info!(
            total_size = self.total_size,
            chunk_size = self.chunk_size,
            num_chunks = (content_len + self.chunk_size - 1) / self.chunk_size,
            "Starting byte upload"
        );

        let mut pos = offset as usize;

        while pos < content_len {
            let end = std::cmp::min(pos + self.chunk_size, content_len);
            let chunk = content.slice(pos..end);

            match self.upload_chunk(chunk, offset).await? {
                UploadChunkResult::Complete(file) => {
                    info!("Upload completed");
                    return Ok(file);
                }
                UploadChunkResult::InProgress { bytes_received } => {
                    offset = bytes_received;
                    pos = bytes_received as usize;
                }
            }
        }

        Err(GoogleDriveError::Upload(UploadError::UploadFailed(
            "Upload loop ended without completion".to_string()
        )))
    }

    /// Queries the current upload status.
    ///
    /// This method sends a special PUT request to the upload URI to determine how many
    /// bytes the server has successfully received. Use this to resume an interrupted upload.
    ///
    /// # Protocol
    /// Sends a PUT request with:
    /// - Content-Length: 0
    /// - Content-Range: bytes */{total}
    ///
    /// Expected responses:
    /// - 308 Resume Incomplete: Upload in progress (Range header indicates bytes received)
    /// - 200/201 OK: Upload already complete
    ///
    /// # Returns
    /// The current upload status including bytes received.
    pub async fn query_status(&self) -> GoogleDriveResult<UploadStatus> {
        debug!(
            upload_uri = %self.upload_uri,
            total_size = self.total_size,
            "Querying upload status"
        );

        // Send empty PUT with Content-Range: bytes */total
        let response = self.http_client
            .put(&self.upload_uri)
            .header("Content-Length", "0")
            .header("Content-Range", format!("bytes */{}", self.total_size))
            .send()
            .await
            .map_err(|e| GoogleDriveError::Network(NetworkError::ConnectionFailed(
                format!("Failed to query status: {}", e)
            )))?;

        let status = response.status();

        match status {
            // Upload complete
            StatusCode::OK | StatusCode::CREATED => {
                info!("Upload status: complete");
                Ok(UploadStatus {
                    bytes_received: self.total_size,
                    total_size: self.total_size,
                    is_complete: true,
                })
            }

            // Resume incomplete
            StatusCode::PERMANENT_REDIRECT => {
                let bytes_received = Self::parse_range_header(&response)?;

                debug!(
                    bytes_received = bytes_received,
                    total_size = self.total_size,
                    percent = (bytes_received as f64 / self.total_size as f64 * 100.0),
                    "Upload status: in progress"
                );

                Ok(UploadStatus {
                    bytes_received,
                    total_size: self.total_size,
                    is_complete: false,
                })
            }

            // Upload session not found
            StatusCode::NOT_FOUND => {
                warn!("Upload session not found");
                Err(GoogleDriveError::Upload(UploadError::ResumableUploadExpired(
                    "Upload session no longer exists".to_string()
                )))
            }

            _ => {
                warn!(status = %status, "Unexpected status when querying upload status");
                Err(GoogleDriveError::Upload(UploadError::UploadFailed(
                    format!("Failed to query upload status: {}", status)
                )))
            }
        }
    }

    /// Resumes an interrupted upload.
    ///
    /// This method queries the server for the current status and updates the internal
    /// `bytes_uploaded` counter. After calling this method, you can continue uploading
    /// from the next chunk.
    ///
    /// # Returns
    /// The current upload status.
    ///
    /// # Example
    /// ```no_run
    /// # async fn example(mut session: integrations_google_drive::services::upload::ResumableUploadSession) -> Result<(), Box<dyn std::error::Error>> {
    /// // After an interruption, resume the upload
    /// let status = session.resume().await?;
    /// println!("Resuming from {} bytes", status.bytes_received);
    ///
    /// // Continue uploading from where we left off
    /// // session.upload_bytes(remaining_content).await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn resume(&mut self) -> GoogleDriveResult<UploadStatus> {
        let status = self.query_status().await?;
        self.bytes_uploaded = status.bytes_received;

        info!(
            bytes_received = status.bytes_received,
            total_size = status.total_size,
            "Resumed upload"
        );

        Ok(status)
    }

    /// Cancels the upload.
    ///
    /// This sends a DELETE request to the upload URI to cancel the upload session.
    /// Note that Google Drive upload sessions automatically expire after a period of
    /// inactivity, so explicit cancellation is optional.
    ///
    /// # Returns
    /// Ok(()) on successful cancellation.
    pub async fn cancel(&self) -> GoogleDriveResult<()> {
        debug!(upload_uri = %self.upload_uri, "Cancelling upload");

        // Send DELETE to upload URI
        let response = self.http_client
            .delete(&self.upload_uri)
            .send()
            .await
            .map_err(|e| GoogleDriveError::Network(NetworkError::ConnectionFailed(
                format!("Failed to cancel upload: {}", e)
            )))?;

        // Accept 204 No Content or 499 Client Closed Request
        let status = response.status();
        if status == StatusCode::NO_CONTENT || status.as_u16() == 499 {
            info!("Upload cancelled successfully");
            Ok(())
        } else {
            // Other responses are okay - upload might already be gone
            debug!(status = %status, "Upload cancel returned status");
            Ok(())
        }
    }

    /// Parses the Range header from a 308 response.
    ///
    /// The Range header format is: `bytes=0-{last_byte_received}`
    /// We add 1 to convert from the last byte position to the count of bytes received.
    fn parse_range_header(response: &reqwest::Response) -> GoogleDriveResult<u64> {
        let range_header = response
            .headers()
            .get("Range")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| GoogleDriveError::Upload(UploadError::InvalidUploadRequest(
                "Missing Range header in 308 response".to_string()
            )))?;

        // Format: "bytes=0-42" means bytes 0 through 42 inclusive (43 bytes total)
        let bytes_received = range_header
            .strip_prefix("bytes=0-")
            .and_then(|s| s.parse::<u64>().ok())
            .map(|n| n + 1) // Add 1 because range is inclusive
            .ok_or_else(|| GoogleDriveError::Upload(UploadError::InvalidUploadRequest(
                format!("Invalid Range header format: {}", range_header)
            )))?;

        Ok(bytes_received)
    }
}

/// Result of uploading a chunk.
#[derive(Debug)]
pub enum UploadChunkResult {
    /// More chunks are needed. Contains the number of bytes received so far.
    InProgress { bytes_received: u64 },

    /// Upload is complete. Contains the final file metadata.
    Complete(DriveFile),
}

/// Status of a resumable upload.
#[derive(Debug, Clone)]
pub struct UploadStatus {
    /// Number of bytes successfully received by the server.
    pub bytes_received: u64,

    /// Total size of the file being uploaded.
    pub total_size: u64,

    /// Whether the upload is complete.
    pub is_complete: bool,
}

impl UploadStatus {
    /// Returns the upload progress as a percentage (0.0 to 100.0).
    pub fn progress_percent(&self) -> f64 {
        if self.total_size == 0 {
            0.0
        } else {
            (self.bytes_received as f64 / self.total_size as f64) * 100.0
        }
    }

    /// Returns the number of bytes remaining to upload.
    pub fn bytes_remaining(&self) -> u64 {
        self.total_size.saturating_sub(self.bytes_received)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chunk_size_validation() {
        // Valid chunk sizes
        assert!(ResumableUploadSession::new(
            "http://example.com/upload".to_string(),
            1024 * 1024,
            256 * 1024
        ).is_ok());

        assert!(ResumableUploadSession::new(
            "http://example.com/upload".to_string(),
            1024 * 1024,
            8 * 1024 * 1024
        ).is_ok());

        // Too small
        assert!(ResumableUploadSession::new(
            "http://example.com/upload".to_string(),
            1024 * 1024,
            128 * 1024
        ).is_err());

        // Not a multiple of 256KB
        assert!(ResumableUploadSession::new(
            "http://example.com/upload".to_string(),
            1024 * 1024,
            300 * 1024
        ).is_err());
    }

    #[test]
    fn test_upload_status_progress() {
        let status = UploadStatus {
            bytes_received: 50,
            total_size: 100,
            is_complete: false,
        };

        assert_eq!(status.progress_percent(), 50.0);
        assert_eq!(status.bytes_remaining(), 50);

        let complete_status = UploadStatus {
            bytes_received: 100,
            total_size: 100,
            is_complete: true,
        };

        assert_eq!(complete_status.progress_percent(), 100.0);
        assert_eq!(complete_status.bytes_remaining(), 0);
    }

    #[test]
    fn test_constants() {
        assert_eq!(MIN_CHUNK_SIZE, 256 * 1024);
        assert_eq!(DEFAULT_CHUNK_SIZE, 8 * 1024 * 1024);
        assert_eq!(MAX_FILE_SIZE, 5 * 1024 * 1024 * 1024 * 1024);
    }
}
