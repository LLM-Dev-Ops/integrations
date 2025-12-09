use crate::errors::{OpenAIError, OpenAIResult, ValidationError};
use crate::services::embeddings::EmbeddingsRequest;

pub struct EmbeddingsRequestValidator;

impl EmbeddingsRequestValidator {
    pub fn validate(request: &EmbeddingsRequest) -> OpenAIResult<()> {
        if request.model.is_empty() {
            return Err(OpenAIError::Validation(
                ValidationError::MissingRequiredField("model".to_string()),
            ));
        }

        if let Some(dimensions) = request.dimensions {
            if dimensions == 0 {
                return Err(OpenAIError::Validation(ValidationError::InvalidParameter {
                    parameter: "dimensions".to_string(),
                    reason: "must be greater than 0".to_string(),
                }));
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::embeddings::{EmbeddingInput, EmbeddingsRequest};

    #[test]
    fn test_validate_valid_request() {
        let request = EmbeddingsRequest::new(
            "text-embedding-3-small",
            EmbeddingInput::Single("test".to_string()),
        );
        assert!(EmbeddingsRequestValidator::validate(&request).is_ok());
    }

    #[test]
    fn test_validate_empty_model() {
        let request = EmbeddingsRequest::new("", EmbeddingInput::Single("test".to_string()));
        assert!(EmbeddingsRequestValidator::validate(&request).is_err());
    }
}
