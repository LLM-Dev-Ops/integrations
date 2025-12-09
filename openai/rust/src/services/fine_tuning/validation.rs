use crate::errors::{OpenAIError, OpenAIResult, ValidationError};
use crate::services::fine_tuning::FineTuningJobRequest;

pub struct FineTuningRequestValidator;

impl FineTuningRequestValidator {
    pub fn validate(request: &FineTuningJobRequest) -> OpenAIResult<()> {
        if request.training_file.is_empty() {
            return Err(OpenAIError::Validation(
                ValidationError::MissingRequiredField("training_file".to_string()),
            ));
        }

        if request.model.is_empty() {
            return Err(OpenAIError::Validation(
                ValidationError::MissingRequiredField("model".to_string()),
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
        let request = FineTuningJobRequest::new("file-123", "gpt-3.5-turbo");
        assert!(FineTuningRequestValidator::validate(&request).is_ok());
    }

    #[test]
    fn test_validate_empty_training_file() {
        let request = FineTuningJobRequest::new("", "gpt-3.5-turbo");
        assert!(FineTuningRequestValidator::validate(&request).is_err());
    }
}
