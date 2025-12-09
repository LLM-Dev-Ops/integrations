use crate::errors::{OpenAIError, OpenAIResult, ValidationError};
use crate::services::files::FileUploadRequest;

pub struct FileRequestValidator;

impl FileRequestValidator {
    const MAX_FILE_SIZE: u64 = 512 * 1024 * 1024;

    pub fn validate(request: &FileUploadRequest) -> OpenAIResult<()> {
        if request.filename.is_empty() {
            return Err(OpenAIError::Validation(
                ValidationError::MissingRequiredField("filename".to_string()),
            ));
        }

        if request.file.is_empty() {
            return Err(OpenAIError::Validation(ValidationError::InvalidParameter {
                parameter: "file".to_string(),
                reason: "file cannot be empty".to_string(),
            }));
        }

        let file_size = request.file.len() as u64;
        if file_size > Self::MAX_FILE_SIZE {
            return Err(OpenAIError::Validation(ValidationError::FileTooLarge {
                max_size: Self::MAX_FILE_SIZE,
                actual_size: file_size,
            }));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::files::FilePurpose;
    use bytes::Bytes;

    #[test]
    fn test_validate_valid_request() {
        let request = FileUploadRequest::new(
            Bytes::from("test data"),
            "test.txt",
            FilePurpose::FineTune,
        );
        assert!(FileRequestValidator::validate(&request).is_ok());
    }

    #[test]
    fn test_validate_empty_filename() {
        let request = FileUploadRequest::new(Bytes::from("test data"), "", FilePurpose::FineTune);
        assert!(FileRequestValidator::validate(&request).is_err());
    }

    #[test]
    fn test_validate_empty_file() {
        let request = FileUploadRequest::new(Bytes::new(), "test.txt", FilePurpose::FineTune);
        assert!(FileRequestValidator::validate(&request).is_err());
    }
}
