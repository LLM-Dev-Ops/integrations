use crate::errors::{OpenAIError, OpenAIResult, ValidationError};
use crate::services::chat::ChatCompletionRequest;

pub struct ChatRequestValidator;

impl ChatRequestValidator {
    pub fn validate(request: &ChatCompletionRequest) -> OpenAIResult<()> {
        if request.messages.is_empty() {
            return Err(OpenAIError::Validation(
                ValidationError::MissingRequiredField("messages".to_string()),
            ));
        }

        if request.model.is_empty() {
            return Err(OpenAIError::Validation(
                ValidationError::MissingRequiredField("model".to_string()),
            ));
        }

        if let Some(temperature) = request.temperature {
            if !(0.0..=2.0).contains(&temperature) {
                return Err(OpenAIError::Validation(ValidationError::ValueOutOfRange {
                    field: "temperature".to_string(),
                    min: "0.0".to_string(),
                    max: "2.0".to_string(),
                    value: temperature.to_string(),
                }));
            }
        }

        if let Some(top_p) = request.top_p {
            if !(0.0..=1.0).contains(&top_p) {
                return Err(OpenAIError::Validation(ValidationError::ValueOutOfRange {
                    field: "top_p".to_string(),
                    min: "0.0".to_string(),
                    max: "1.0".to_string(),
                    value: top_p.to_string(),
                }));
            }
        }

        if let Some(presence_penalty) = request.presence_penalty {
            if !(-2.0..=2.0).contains(&presence_penalty) {
                return Err(OpenAIError::Validation(ValidationError::ValueOutOfRange {
                    field: "presence_penalty".to_string(),
                    min: "-2.0".to_string(),
                    max: "2.0".to_string(),
                    value: presence_penalty.to_string(),
                }));
            }
        }

        if let Some(frequency_penalty) = request.frequency_penalty {
            if !(-2.0..=2.0).contains(&frequency_penalty) {
                return Err(OpenAIError::Validation(ValidationError::ValueOutOfRange {
                    field: "frequency_penalty".to_string(),
                    min: "-2.0".to_string(),
                    max: "2.0".to_string(),
                    value: frequency_penalty.to_string(),
                }));
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::chat::ChatMessage;

    #[test]
    fn test_validate_valid_request() {
        let request = ChatCompletionRequest::new("gpt-4", vec![ChatMessage::user("Hello")]);
        assert!(ChatRequestValidator::validate(&request).is_ok());
    }

    #[test]
    fn test_validate_empty_messages() {
        let request = ChatCompletionRequest::new("gpt-4", vec![]);
        assert!(ChatRequestValidator::validate(&request).is_err());
    }

    #[test]
    fn test_validate_invalid_temperature() {
        let request = ChatCompletionRequest::new("gpt-4", vec![ChatMessage::user("Hello")])
            .with_temperature(3.0);
        assert!(ChatRequestValidator::validate(&request).is_err());
    }
}
