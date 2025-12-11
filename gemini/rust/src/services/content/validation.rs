//! Validation functions for content generation requests.

use crate::error::{GeminiError, GeminiResult, RequestError, ValidationDetail};
use crate::types::{GenerateContentRequest, GenerationConfig, Part, Content, CountTokensRequest};

/// Validate a generate content request.
pub fn validate_generate_request(request: &GenerateContentRequest) -> GeminiResult<()> {
    let mut details = Vec::new();

    // Validate contents are not empty
    if request.contents.is_empty() {
        details.push(ValidationDetail {
            field: "contents".to_string(),
            description: "Contents array cannot be empty".to_string(),
        });
    }

    // Validate each content has parts
    for (idx, content) in request.contents.iter().enumerate() {
        if content.parts.is_empty() {
            details.push(ValidationDetail {
                field: format!("contents[{}].parts", idx),
                description: "Content must have at least one part".to_string(),
            });
        }

        // Validate each part
        for (part_idx, part) in content.parts.iter().enumerate() {
            if let Err(e) = validate_part(part, &format!("contents[{}].parts[{}]", idx, part_idx)) {
                if let GeminiError::Request(RequestError::ValidationError { details: part_details, .. }) = e {
                    details.extend(part_details);
                }
            }
        }
    }

    // Validate system instruction if present
    if let Some(system_instruction) = &request.system_instruction {
        if system_instruction.parts.is_empty() {
            details.push(ValidationDetail {
                field: "system_instruction.parts".to_string(),
                description: "System instruction must have at least one part".to_string(),
            });
        }

        for (part_idx, part) in system_instruction.parts.iter().enumerate() {
            if let Err(e) = validate_part(part, &format!("system_instruction.parts[{}]", part_idx)) {
                if let GeminiError::Request(RequestError::ValidationError { details: part_details, .. }) = e {
                    details.extend(part_details);
                }
            }
        }
    }

    // Validate generation config if present
    if let Some(config) = &request.generation_config {
        if let Err(e) = validate_generation_config(config) {
            if let GeminiError::Request(RequestError::ValidationError { details: config_details, .. }) = e {
                details.extend(config_details);
            }
        }
    }

    if !details.is_empty() {
        return Err(GeminiError::Request(RequestError::ValidationError {
            message: "Invalid generate content request".to_string(),
            details,
        }));
    }

    Ok(())
}

/// Validate a part.
pub fn validate_part(part: &Part, field_prefix: &str) -> GeminiResult<()> {
    let mut details = Vec::new();

    match part {
        Part::Text { text } => {
            if text.is_empty() {
                details.push(ValidationDetail {
                    field: format!("{}.text", field_prefix),
                    description: "Text cannot be empty".to_string(),
                });
            }
        }
        Part::InlineData { inline_data } => {
            if inline_data.mime_type.is_empty() {
                details.push(ValidationDetail {
                    field: format!("{}.inline_data.mime_type", field_prefix),
                    description: "MIME type is required".to_string(),
                });
            }
            if inline_data.data.is_empty() {
                details.push(ValidationDetail {
                    field: format!("{}.inline_data.data", field_prefix),
                    description: "Data cannot be empty".to_string(),
                });
            }
        }
        Part::FileData { file_data } => {
            if file_data.file_uri.is_empty() {
                details.push(ValidationDetail {
                    field: format!("{}.file_data.file_uri", field_prefix),
                    description: "File URI is required".to_string(),
                });
            }
        }
        Part::FunctionCall { function_call } => {
            if function_call.name.is_empty() {
                details.push(ValidationDetail {
                    field: format!("{}.function_call.name", field_prefix),
                    description: "Function name is required".to_string(),
                });
            }
        }
        Part::FunctionResponse { function_response } => {
            if function_response.name.is_empty() {
                details.push(ValidationDetail {
                    field: format!("{}.function_response.name", field_prefix),
                    description: "Function name is required".to_string(),
                });
            }
        }
        Part::ExecutableCode { executable_code } => {
            if executable_code.language.is_empty() {
                details.push(ValidationDetail {
                    field: format!("{}.executable_code.language", field_prefix),
                    description: "Language is required".to_string(),
                });
            }
            if executable_code.code.is_empty() {
                details.push(ValidationDetail {
                    field: format!("{}.executable_code.code", field_prefix),
                    description: "Code cannot be empty".to_string(),
                });
            }
        }
        Part::CodeExecutionResult { code_execution_result } => {
            if code_execution_result.outcome.is_empty() {
                details.push(ValidationDetail {
                    field: format!("{}.code_execution_result.outcome", field_prefix),
                    description: "Outcome is required".to_string(),
                });
            }
        }
    }

    if !details.is_empty() {
        return Err(GeminiError::Request(RequestError::ValidationError {
            message: format!("Invalid part at {}", field_prefix),
            details,
        }));
    }

    Ok(())
}

/// Validate generation configuration.
pub fn validate_generation_config(config: &GenerationConfig) -> GeminiResult<()> {
    let mut details = Vec::new();

    // Validate temperature (0.0 - 2.0)
    if let Some(temp) = config.temperature {
        if temp < 0.0 || temp > 2.0 {
            details.push(ValidationDetail {
                field: "generation_config.temperature".to_string(),
                description: "Temperature must be between 0.0 and 2.0".to_string(),
            });
        }
    }

    // Validate top_p (0.0 - 1.0)
    if let Some(top_p) = config.top_p {
        if top_p < 0.0 || top_p > 1.0 {
            details.push(ValidationDetail {
                field: "generation_config.top_p".to_string(),
                description: "top_p must be between 0.0 and 1.0".to_string(),
            });
        }
    }

    // Validate top_k (>= 1)
    if let Some(top_k) = config.top_k {
        if top_k < 1 {
            details.push(ValidationDetail {
                field: "generation_config.top_k".to_string(),
                description: "top_k must be >= 1".to_string(),
            });
        }
    }

    // Validate max_output_tokens (>= 1)
    if let Some(max_tokens) = config.max_output_tokens {
        if max_tokens < 1 {
            details.push(ValidationDetail {
                field: "generation_config.max_output_tokens".to_string(),
                description: "max_output_tokens must be >= 1".to_string(),
            });
        }
    }

    // Validate candidate_count (1-8)
    if let Some(count) = config.candidate_count {
        if count < 1 || count > 8 {
            details.push(ValidationDetail {
                field: "generation_config.candidate_count".to_string(),
                description: "candidate_count must be between 1 and 8".to_string(),
            });
        }
    }

    if !details.is_empty() {
        return Err(GeminiError::Request(RequestError::ValidationError {
            message: "Invalid generation config".to_string(),
            details,
        }));
    }

    Ok(())
}

/// Validate model name.
pub fn validate_model_name(model: &str) -> GeminiResult<()> {
    let mut details = Vec::new();

    // Model name must not be empty
    if model.is_empty() {
        details.push(ValidationDetail {
            field: "model".to_string(),
            description: "Model name must not be empty".to_string(),
        });
    } else {
        // Model name must either start with "models/" or be a known model name
        // Allow both "models/gemini-1.5-pro" and "gemini-1.5-pro" formats
        let is_valid = model.starts_with("models/") ||
                      !model.contains('/'); // Simple check: if no slash, it's a base model name

        if !is_valid {
            details.push(ValidationDetail {
                field: "model".to_string(),
                description: "Model name must either start with 'models/' or be a simple model name without slashes".to_string(),
            });
        }
    }

    if !details.is_empty() {
        return Err(GeminiError::Request(RequestError::ValidationError {
            message: "Invalid model name".to_string(),
            details,
        }));
    }

    Ok(())
}

/// Validate count tokens request.
pub fn validate_count_tokens_request(request: &CountTokensRequest) -> GeminiResult<()> {
    let mut details = Vec::new();

    // Either contents or generate_content_request must be provided
    if request.contents.is_none() && request.generate_content_request.is_none() {
        details.push(ValidationDetail {
            field: "request".to_string(),
            description: "Either 'contents' or 'generate_content_request' must be provided".to_string(),
        });
    }

    // If both are provided, that's an error
    if request.contents.is_some() && request.generate_content_request.is_some() {
        details.push(ValidationDetail {
            field: "request".to_string(),
            description: "Only one of 'contents' or 'generate_content_request' should be provided".to_string(),
        });
    }

    // Validate contents if provided
    if let Some(contents) = &request.contents {
        if contents.is_empty() {
            details.push(ValidationDetail {
                field: "contents".to_string(),
                description: "Contents array cannot be empty".to_string(),
            });
        }

        for (idx, content) in contents.iter().enumerate() {
            if content.parts.is_empty() {
                details.push(ValidationDetail {
                    field: format!("contents[{}].parts", idx),
                    description: "Content must have at least one part".to_string(),
                });
            }
        }
    }

    // Validate generate_content_request if provided
    if let Some(gen_request) = &request.generate_content_request {
        if let Err(e) = validate_generate_request(gen_request) {
            if let GeminiError::Request(RequestError::ValidationError { details: gen_details, .. }) = e {
                details.extend(gen_details);
            }
        }
    }

    if !details.is_empty() {
        return Err(GeminiError::Request(RequestError::ValidationError {
            message: "Invalid count tokens request".to_string(),
            details,
        }));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Content, Part, Role};

    #[test]
    fn test_validate_generate_request_valid() {
        let request = GenerateContentRequest {
            contents: vec![Content {
                role: Some(Role::User),
                parts: vec![Part::Text {
                    text: "Hello".to_string(),
                }],
            }],
            system_instruction: None,
            tools: None,
            tool_config: None,
            safety_settings: None,
            generation_config: None,
            cached_content: None,
        };

        assert!(validate_generate_request(&request).is_ok());
    }

    #[test]
    fn test_validate_generate_request_empty_contents() {
        let request = GenerateContentRequest {
            contents: vec![],
            system_instruction: None,
            tools: None,
            tool_config: None,
            safety_settings: None,
            generation_config: None,
            cached_content: None,
        };

        assert!(validate_generate_request(&request).is_err());
    }

    #[test]
    fn test_validate_generation_config_invalid_temperature() {
        let config = GenerationConfig {
            temperature: Some(3.0), // Invalid
            top_p: None,
            top_k: None,
            max_output_tokens: None,
            stop_sequences: None,
            candidate_count: None,
            response_mime_type: None,
            response_schema: None,
        };

        assert!(validate_generation_config(&config).is_err());
    }

    #[test]
    fn test_validate_generation_config_valid() {
        let config = GenerationConfig {
            temperature: Some(0.7),
            top_p: Some(0.95),
            top_k: Some(40),
            max_output_tokens: Some(2048),
            stop_sequences: None,
            candidate_count: Some(1),
            response_mime_type: None,
            response_schema: None,
        };

        assert!(validate_generation_config(&config).is_ok());
    }

    #[test]
    fn test_validate_generation_config_invalid_candidate_count() {
        let config = GenerationConfig {
            temperature: None,
            top_p: None,
            top_k: None,
            max_output_tokens: None,
            stop_sequences: None,
            candidate_count: Some(10), // Invalid: max is 8
            response_mime_type: None,
            response_schema: None,
        };

        assert!(validate_generation_config(&config).is_err());
    }

    #[test]
    fn test_validate_model_name_valid() {
        assert!(validate_model_name("gemini-1.5-pro").is_ok());
        assert!(validate_model_name("models/gemini-1.5-pro").is_ok());
        assert!(validate_model_name("text-embedding-004").is_ok());
    }

    #[test]
    fn test_validate_model_name_invalid() {
        assert!(validate_model_name("").is_err());
        assert!(validate_model_name("some/invalid/path").is_err());
    }
}
