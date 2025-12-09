use crate::errors::{OpenAIError, OpenAIResult, ValidationError};
use crate::services::batches::BatchRequest;

pub struct BatchRequestValidator;

impl BatchRequestValidator {
    pub fn validate(request: &BatchRequest) -> OpenAIResult<()> {
        if request.input_file_id.is_empty() {
            return Err(OpenAIError::Validation(
                ValidationError::MissingRequiredField("input_file_id".to_string()),
            ));
        }

        if request.endpoint.is_empty() {
            return Err(OpenAIError::Validation(
                ValidationError::MissingRequiredField("endpoint".to_string()),
            ));
        }

        if request.completion_window.is_empty() {
            return Err(OpenAIError::Validation(
                ValidationError::MissingRequiredField("completion_window".to_string()),
            ));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_valid_request() {
        let request = BatchRequest::new("file-123", "/v1/chat/completions", "24h");
        assert!(BatchRequestValidator::validate(&request).is_ok());
    }

    #[test]
    fn test_validate_empty_input_file_id() {
        let request = BatchRequest::new("", "/v1/chat/completions", "24h");
        assert!(BatchRequestValidator::validate(&request).is_err());
    }
}
