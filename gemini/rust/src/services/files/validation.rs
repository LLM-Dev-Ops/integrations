//! Validation functions for file operations.

use crate::error::{GeminiError, GeminiResult, RequestError, ValidationDetail};
use crate::types::UploadFileRequest;

/// Maximum file size for upload (2GB).
pub const MAX_FILE_SIZE: usize = 2 * 1024 * 1024 * 1024; // 2_147_483_648 bytes

/// Maximum display name length (reasonable limit).
const MAX_DISPLAY_NAME_LENGTH: usize = 256;

/// Validate an upload file request.
pub fn validate_upload_request(request: &UploadFileRequest) -> GeminiResult<()> {
    let mut details = Vec::new();

    // Validate MIME type is not empty
    if request.mime_type.is_empty() {
        details.push(ValidationDetail {
            field: "mime_type".to_string(),
            description: "MIME type must not be empty".to_string(),
        });
    }

    // Validate file size (max 2GB)
    if request.file_data.len() > MAX_FILE_SIZE {
        details.push(ValidationDetail {
            field: "file_data".to_string(),
            description: format!(
                "File size {} bytes exceeds maximum of {} bytes (2GB)",
                request.file_data.len(),
                MAX_FILE_SIZE
            ),
        });
    }

    // Validate file data is not empty
    if request.file_data.is_empty() {
        details.push(ValidationDetail {
            field: "file_data".to_string(),
            description: "File data must not be empty".to_string(),
        });
    }

    // Validate display name length if present
    if let Some(ref display_name) = request.display_name {
        if display_name.is_empty() {
            details.push(ValidationDetail {
                field: "display_name".to_string(),
                description: "Display name must not be empty if provided".to_string(),
            });
        }

        if display_name.len() > MAX_DISPLAY_NAME_LENGTH {
            details.push(ValidationDetail {
                field: "display_name".to_string(),
                description: format!(
                    "Display name length {} exceeds maximum of {}",
                    display_name.len(),
                    MAX_DISPLAY_NAME_LENGTH
                ),
            });
        }
    }

    if !details.is_empty() {
        return Err(GeminiError::Request(RequestError::ValidationError {
            message: "Invalid upload file request".to_string(),
            details,
        }));
    }

    Ok(())
}

/// Validate file name format.
pub fn validate_file_name(name: &str) -> GeminiResult<()> {
    let mut details = Vec::new();

    if name.is_empty() {
        details.push(ValidationDetail {
            field: "name".to_string(),
            description: "File name must not be empty".to_string(),
        });
    }

    if !details.is_empty() {
        return Err(GeminiError::Request(RequestError::ValidationError {
            message: "Invalid file name".to_string(),
            details,
        }));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_upload_request_valid() {
        let request = UploadFileRequest {
            display_name: Some("test.txt".to_string()),
            file_data: vec![1, 2, 3, 4, 5],
            mime_type: "text/plain".to_string(),
        };

        assert!(validate_upload_request(&request).is_ok());
    }

    #[test]
    fn test_validate_upload_request_empty_mime_type() {
        let request = UploadFileRequest {
            display_name: Some("test.txt".to_string()),
            file_data: vec![1, 2, 3, 4, 5],
            mime_type: "".to_string(),
        };

        let result = validate_upload_request(&request);
        assert!(result.is_err());
        if let Err(GeminiError::Request(RequestError::ValidationError { details, .. })) = result {
            assert!(details.iter().any(|d| d.field == "mime_type"));
        }
    }

    #[test]
    fn test_validate_upload_request_empty_file_data() {
        let request = UploadFileRequest {
            display_name: Some("test.txt".to_string()),
            file_data: vec![],
            mime_type: "text/plain".to_string(),
        };

        let result = validate_upload_request(&request);
        assert!(result.is_err());
        if let Err(GeminiError::Request(RequestError::ValidationError { details, .. })) = result {
            assert!(details.iter().any(|d| d.field == "file_data"));
        }
    }

    #[test]
    fn test_validate_upload_request_file_too_large() {
        let request = UploadFileRequest {
            display_name: Some("huge.bin".to_string()),
            file_data: vec![0; MAX_FILE_SIZE + 1],
            mime_type: "application/octet-stream".to_string(),
        };

        let result = validate_upload_request(&request);
        assert!(result.is_err());
        if let Err(GeminiError::Request(RequestError::ValidationError { details, .. })) = result {
            assert!(details.iter().any(|d| d.field == "file_data" && d.description.contains("exceeds maximum")));
        }
    }

    #[test]
    fn test_validate_upload_request_empty_display_name() {
        let request = UploadFileRequest {
            display_name: Some("".to_string()),
            file_data: vec![1, 2, 3],
            mime_type: "text/plain".to_string(),
        };

        let result = validate_upload_request(&request);
        assert!(result.is_err());
        if let Err(GeminiError::Request(RequestError::ValidationError { details, .. })) = result {
            assert!(details.iter().any(|d| d.field == "display_name"));
        }
    }

    #[test]
    fn test_validate_upload_request_display_name_too_long() {
        let long_name = "a".repeat(MAX_DISPLAY_NAME_LENGTH + 1);
        let request = UploadFileRequest {
            display_name: Some(long_name),
            file_data: vec![1, 2, 3],
            mime_type: "text/plain".to_string(),
        };

        let result = validate_upload_request(&request);
        assert!(result.is_err());
        if let Err(GeminiError::Request(RequestError::ValidationError { details, .. })) = result {
            assert!(details.iter().any(|d| d.field == "display_name" && d.description.contains("exceeds maximum")));
        }
    }

    #[test]
    fn test_validate_upload_request_no_display_name() {
        let request = UploadFileRequest {
            display_name: None,
            file_data: vec![1, 2, 3],
            mime_type: "text/plain".to_string(),
        };

        assert!(validate_upload_request(&request).is_ok());
    }

    #[test]
    fn test_validate_file_name_valid() {
        assert!(validate_file_name("files/my-file-123").is_ok());
        assert!(validate_file_name("my-file").is_ok());
    }

    #[test]
    fn test_validate_file_name_empty() {
        assert!(validate_file_name("").is_err());
    }
}
