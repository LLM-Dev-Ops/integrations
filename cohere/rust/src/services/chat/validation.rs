//! Validation for chat requests.

use super::types::ChatRequest;
use crate::errors::{CohereError, CohereResult, ValidationDetail};

/// Validate a chat request
pub fn validate_chat_request(request: &ChatRequest) -> CohereResult<()> {
    let mut errors = Vec::new();

    // Validate message
    if request.message.is_empty() {
        errors.push(ValidationDetail::new("message", "Message cannot be empty"));
    }

    // Validate temperature
    if let Some(temp) = request.temperature {
        if !(0.0..=5.0).contains(&temp) {
            errors.push(ValidationDetail::with_value(
                "temperature",
                "Temperature must be between 0.0 and 5.0",
                temp.to_string(),
            ));
        }
    }

    // Validate max_tokens
    if let Some(max) = request.max_tokens {
        if max == 0 {
            errors.push(ValidationDetail::with_value(
                "max_tokens",
                "max_tokens must be greater than 0",
                max.to_string(),
            ));
        }
        if max > 4096 {
            errors.push(ValidationDetail::with_value(
                "max_tokens",
                "max_tokens cannot exceed 4096",
                max.to_string(),
            ));
        }
    }

    // Validate top-k
    if let Some(k) = request.k {
        if k == 0 {
            errors.push(ValidationDetail::with_value(
                "k",
                "k must be greater than 0",
                k.to_string(),
            ));
        }
    }

    // Validate top-p
    if let Some(p) = request.p {
        if !(0.0..=1.0).contains(&p) {
            errors.push(ValidationDetail::with_value(
                "p",
                "p must be between 0.0 and 1.0",
                p.to_string(),
            ));
        }
    }

    // Validate frequency_penalty
    if let Some(fp) = request.frequency_penalty {
        if !(-2.0..=2.0).contains(&fp) {
            errors.push(ValidationDetail::with_value(
                "frequency_penalty",
                "frequency_penalty must be between -2.0 and 2.0",
                fp.to_string(),
            ));
        }
    }

    // Validate presence_penalty
    if let Some(pp) = request.presence_penalty {
        if !(-2.0..=2.0).contains(&pp) {
            errors.push(ValidationDetail::with_value(
                "presence_penalty",
                "presence_penalty must be between -2.0 and 2.0",
                pp.to_string(),
            ));
        }
    }

    // Validate stop sequences
    if let Some(ref seqs) = request.stop_sequences {
        if seqs.len() > 5 {
            errors.push(ValidationDetail::with_value(
                "stop_sequences",
                "Cannot have more than 5 stop sequences",
                seqs.len().to_string(),
            ));
        }
    }

    // Validate tools
    if let Some(ref tools) = request.tools {
        for (i, tool) in tools.iter().enumerate() {
            if tool.name.is_empty() {
                errors.push(ValidationDetail::new(
                    format!("tools[{}].name", i),
                    "Tool name cannot be empty",
                ));
            }
            if tool.description.is_empty() {
                errors.push(ValidationDetail::new(
                    format!("tools[{}].description", i),
                    "Tool description cannot be empty",
                ));
            }
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(CohereError::Validation {
            message: format!("Chat request validation failed: {} error(s)", errors.len()),
            details: errors,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_valid_request() {
        let request = ChatRequest::new("Hello, how are you?");
        assert!(validate_chat_request(&request).is_ok());
    }

    #[test]
    fn test_validate_empty_message() {
        let request = ChatRequest::new("");
        let result = validate_chat_request(&request);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_invalid_temperature() {
        let mut request = ChatRequest::new("Hello");
        request.temperature = Some(10.0);
        let result = validate_chat_request(&request);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_invalid_max_tokens() {
        let mut request = ChatRequest::new("Hello");
        request.max_tokens = Some(0);
        let result = validate_chat_request(&request);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_invalid_p() {
        let mut request = ChatRequest::new("Hello");
        request.p = Some(1.5);
        let result = validate_chat_request(&request);
        assert!(result.is_err());
    }
}
