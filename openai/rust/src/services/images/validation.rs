use crate::errors::{OpenAIError, OpenAIResult, ValidationError};
use crate::services::images::ImageGenerationRequest;

pub struct ImageRequestValidator;

impl ImageRequestValidator {
    pub fn validate(request: &ImageGenerationRequest) -> OpenAIResult<()> {
        if request.prompt.is_empty() {
            return Err(OpenAIError::Validation(
                ValidationError::MissingRequiredField("prompt".to_string()),
            ));
        }

        if let Some(n) = request.n {
            if n == 0 || n > 10 {
                return Err(OpenAIError::Validation(ValidationError::ValueOutOfRange {
                    field: "n".to_string(),
                    min: "1".to_string(),
                    max: "10".to_string(),
                    value: n.to_string(),
                }));
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_valid_request() {
        let request = ImageGenerationRequest::new("A cat");
        assert!(ImageRequestValidator::validate(&request).is_ok());
    }

    #[test]
    fn test_validate_empty_prompt() {
        let request = ImageGenerationRequest::new("");
        assert!(ImageRequestValidator::validate(&request).is_err());
    }
}
