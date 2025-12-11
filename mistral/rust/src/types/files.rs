//! File types for Mistral API.

use serde::{Deserialize, Serialize};

/// Purpose of an uploaded file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FilePurpose {
    /// Fine-tuning training data.
    FineTune,
    /// Batch processing input.
    Batch,
}

/// File upload request.
#[derive(Debug, Clone)]
pub struct FileUploadRequest {
    /// The file content.
    pub file: Vec<u8>,
    /// The filename.
    pub filename: String,
    /// The purpose of the file.
    pub purpose: FilePurpose,
}

impl FileUploadRequest {
    /// Creates a new file upload request.
    pub fn new(file: Vec<u8>, filename: impl Into<String>, purpose: FilePurpose) -> Self {
        Self {
            file,
            filename: filename.into(),
            purpose,
        }
    }
}

/// Uploaded file information.
#[derive(Debug, Clone, Deserialize)]
pub struct FileObject {
    /// File ID.
    pub id: String,
    /// Object type.
    pub object: String,
    /// File size in bytes.
    pub bytes: u64,
    /// Creation timestamp.
    pub created_at: i64,
    /// Filename.
    pub filename: String,
    /// File purpose.
    pub purpose: FilePurpose,
    /// Sample type for fine-tuning files.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sample_type: Option<String>,
    /// Number of lines in the file.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub num_lines: Option<u32>,
    /// Source of the file.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

/// Response from listing files.
#[derive(Debug, Clone, Deserialize)]
pub struct FileListResponse {
    /// Object type.
    pub object: String,
    /// List of files.
    pub data: Vec<FileObject>,
}

/// Response from deleting a file.
#[derive(Debug, Clone, Deserialize)]
pub struct FileDeleteResponse {
    /// File ID.
    pub id: String,
    /// Object type.
    pub object: String,
    /// Whether the file was deleted.
    pub deleted: bool,
}

/// Signed URL response for file download.
#[derive(Debug, Clone, Deserialize)]
pub struct FileSignedUrlResponse {
    /// The signed URL.
    pub url: String,
    /// Expiration timestamp.
    pub expires_at: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_file_purpose_serialization() {
        assert_eq!(
            serde_json::to_string(&FilePurpose::FineTune).unwrap(),
            "\"fine_tune\""
        );
        assert_eq!(
            serde_json::to_string(&FilePurpose::Batch).unwrap(),
            "\"batch\""
        );
    }

    #[test]
    fn test_file_upload_request_creation() {
        let request = FileUploadRequest::new(
            vec![1, 2, 3],
            "test.jsonl",
            FilePurpose::FineTune,
        );
        assert_eq!(request.filename, "test.jsonl");
        assert_eq!(request.purpose, FilePurpose::FineTune);
    }

    #[test]
    fn test_file_object_deserialization() {
        let json = r#"{
            "id": "file-123",
            "object": "file",
            "bytes": 1024,
            "created_at": 1700000000,
            "filename": "training.jsonl",
            "purpose": "fine_tune"
        }"#;

        let file: FileObject = serde_json::from_str(json).unwrap();
        assert_eq!(file.id, "file-123");
        assert_eq!(file.bytes, 1024);
        assert_eq!(file.purpose, FilePurpose::FineTune);
    }
}
