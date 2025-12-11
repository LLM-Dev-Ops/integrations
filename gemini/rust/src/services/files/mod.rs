//! Files service for Gemini API.

mod service;
mod validation;

use async_trait::async_trait;
use crate::error::GeminiError;
use crate::types::{File, UploadFileRequest, ListFilesParams, ListFilesResponse};

pub use service::FilesServiceImpl;
pub use validation::{validate_upload_request, validate_file_name, MAX_FILE_SIZE};

/// Service for file upload and management.
#[async_trait]
pub trait FilesService: Send + Sync {
    /// Upload a file.
    async fn upload(&self, request: UploadFileRequest) -> Result<File, GeminiError>;

    /// List uploaded files.
    async fn list(
        &self,
        params: Option<ListFilesParams>,
    ) -> Result<ListFilesResponse, GeminiError>;

    /// Get file metadata.
    async fn get(&self, file_name: &str) -> Result<File, GeminiError>;

    /// Delete a file.
    async fn delete(&self, file_name: &str) -> Result<(), GeminiError>;
}
