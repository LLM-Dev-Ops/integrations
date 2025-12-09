use crate::errors::{OpenAIError, OpenAIResult, ValidationError};
use crate::services::moderations::{ModerationInput, ModerationRequest};

pub struct ModerationRequestValidator;

impl ModerationRequestValidator {
    pub fn validate(request: &ModerationRequest) -> OpenAIResult<()> {
        match &request.input {
            ModerationInput::Single(text) => {
                if text.is_empty() {
                    return Err(OpenAIError::Validation(
                        ValidationError::MissingRequiredField("input".to_string()),
                    ));
                }
            }
            ModerationInput::Multiple(texts) => {
                if texts.is_empty() {
                    return Err(OpenAIError::Validation(
                        ValidationError::MissingRequiredField("input".to_string()),
                    ));
                }
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
        let request = ModerationRequest::new(ModerationInput::Single("Test".to_string()));
        assert!(ModerationRequestValidator::validate(&request).is_ok());
    }

    #[test]
    fn test_validate_empty_input() {
        let request = ModerationRequest::new(ModerationInput::Single("".to_string()));
        assert!(ModerationRequestValidator::validate(&request).is_err());
    }
}
