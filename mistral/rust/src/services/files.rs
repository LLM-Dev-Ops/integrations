//! Files service.

use async_trait::async_trait;

use crate::errors::MistralError;
use crate::types::files::{
    FileDeleteResponse, FileListResponse, FileObject, FileSignedUrlResponse, FileUploadRequest,
};

/// Files service trait.
#[async_trait]
pub trait FilesService: Send + Sync {
    /// Lists all uploaded files.
    async fn list(&self) -> Result<FileListResponse, MistralError>;

    /// Retrieves a specific file.
    async fn retrieve(&self, file_id: &str) -> Result<FileObject, MistralError>;

    /// Uploads a file.
    async fn upload(&self, request: FileUploadRequest) -> Result<FileObject, MistralError>;

    /// Deletes a file.
    async fn delete(&self, file_id: &str) -> Result<FileDeleteResponse, MistralError>;

    /// Gets a signed URL for downloading a file.
    async fn get_signed_url(&self, file_id: &str) -> Result<FileSignedUrlResponse, MistralError>;
}

/// Default implementation of the files service.
pub struct DefaultFilesService<T> {
    transport: T,
}

impl<T> DefaultFilesService<T> {
    /// Creates a new files service.
    pub fn new(transport: T) -> Self {
        Self { transport }
    }
}

#[async_trait]
impl<T> FilesService for DefaultFilesService<T>
where
    T: crate::transport::HttpTransport + Send + Sync,
{
    async fn list(&self) -> Result<FileListResponse, MistralError> {
        let response = self.transport
            .get("/v1/files")
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }

    async fn retrieve(&self, file_id: &str) -> Result<FileObject, MistralError> {
        let path = format!("/v1/files/{}", file_id);
        let response = self.transport
            .get(&path)
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }

    async fn upload(&self, request: FileUploadRequest) -> Result<FileObject, MistralError> {
        let response = self.transport
            .post_multipart(
                "/v1/files",
                request.file,
                &request.filename,
                &serde_json::to_string(&request.purpose)
                    .map_err(|e| MistralError::Serialization { message: e.to_string() })?
                    .trim_matches('"'),
            )
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }

    async fn delete(&self, file_id: &str) -> Result<FileDeleteResponse, MistralError> {
        let path = format!("/v1/files/{}", file_id);
        let response = self.transport
            .delete(&path)
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }

    async fn get_signed_url(&self, file_id: &str) -> Result<FileSignedUrlResponse, MistralError> {
        let path = format!("/v1/files/{}/url", file_id);
        let response = self.transport
            .get(&path)
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::files::FilePurpose;

    #[test]
    fn test_file_upload_request_creation() {
        let request = FileUploadRequest::new(
            vec![1, 2, 3, 4],
            "test.jsonl",
            FilePurpose::FineTune,
        );

        assert_eq!(request.filename, "test.jsonl");
        assert_eq!(request.file.len(), 4);
        assert_eq!(request.purpose, FilePurpose::FineTune);
    }
}
