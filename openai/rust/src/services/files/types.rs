use bytes::Bytes;
use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct FileObject {
    pub id: String,
    pub object: String,
    pub bytes: u64,
    pub created_at: i64,
    pub filename: String,
    pub purpose: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_details: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FilePurpose {
    Assistants,
    AssistantsOutput,
    Batch,
    BatchOutput,
    FineTune,
    FineTuneResults,
    Vision,
}

impl fmt::Display for FilePurpose {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            FilePurpose::Assistants => "assistants",
            FilePurpose::AssistantsOutput => "assistants_output",
            FilePurpose::Batch => "batch",
            FilePurpose::BatchOutput => "batch_output",
            FilePurpose::FineTune => "fine_tune",
            FilePurpose::FineTuneResults => "fine_tune_results",
            FilePurpose::Vision => "vision",
        };
        write!(f, "{}", s)
    }
}

#[derive(Debug, Clone)]
pub struct FileUploadRequest {
    pub file_data: Bytes,
    pub filename: String,
    pub purpose: FilePurpose,
}

impl FileUploadRequest {
    pub fn new(file_data: Bytes, filename: impl Into<String>, purpose: FilePurpose) -> Self {
        Self {
            file_data,
            filename: filename.into(),
            purpose,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct FileListResponse {
    pub object: String,
    pub data: Vec<FileObject>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct FileDeleteResponse {
    pub id: String,
    pub object: String,
    pub deleted: bool,
}

#[derive(Debug, Clone)]
pub enum FileContent {
    Text(String),
    Binary(Bytes),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_file_purpose_display() {
        assert_eq!(FilePurpose::FineTune.to_string(), "fine_tune");
        assert_eq!(FilePurpose::Assistants.to_string(), "assistants");
        assert_eq!(FilePurpose::Vision.to_string(), "vision");
    }

    #[test]
    fn test_file_upload_request() {
        let request = FileUploadRequest::new(
            Bytes::from("test data"),
            "test.txt",
            FilePurpose::FineTune,
        );
        assert_eq!(request.filename, "test.txt");
        assert_eq!(request.purpose, FilePurpose::FineTune);
    }
}
