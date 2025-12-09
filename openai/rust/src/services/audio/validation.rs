use crate::errors::{OpenAIError, OpenAIResult, ValidationError};
use crate::services::audio::SpeechRequest;

pub struct AudioRequestValidator;

impl AudioRequestValidator {
    pub fn validate(request: &SpeechRequest) -> OpenAIResult<()> {
        if request.model.is_empty() {
            return Err(OpenAIError::Validation(
                ValidationError::MissingRequiredField("model".to_string()),
            ));
        }

        if request.input.is_empty() {
            return Err(OpenAIError::Validation(
                ValidationError::MissingRequiredField("input".to_string()),
            ));
        }

        if let Some(speed) = request.speed {
            if !(0.25..=4.0).contains(&speed) {
                return Err(OpenAIError::Validation(ValidationError::ValueOutOfRange {
                    field: "speed".to_string(),
                    min: "0.25".to_string(),
                    max: "4.0".to_string(),
                    value: speed.to_string(),
                }));
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::audio::AudioVoice;

    #[test]
    fn test_validate_valid_request() {
        let request = SpeechRequest::new("tts-1", "Hello", AudioVoice::Alloy);
        assert!(AudioRequestValidator::validate(&request).is_ok());
    }

    #[test]
    fn test_validate_empty_input() {
        let request = SpeechRequest::new("tts-1", "", AudioVoice::Alloy);
        assert!(AudioRequestValidator::validate(&request).is_err());
    }
}
