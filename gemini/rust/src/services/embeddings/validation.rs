//! Validation functions for embeddings requests.

use crate::error::{GeminiError, GeminiResult, RequestError, ValidationDetail};
use crate::types::{EmbedContentRequest, Part, TaskType};

/// Maximum output dimensionality for embeddings (text-embedding-004).
const MAX_OUTPUT_DIMENSIONALITY: i32 = 768;

/// Minimum output dimensionality for embeddings.
const MIN_OUTPUT_DIMENSIONALITY: i32 = 1;

/// Maximum batch size for batch embed requests.
pub const MAX_BATCH_SIZE: usize = 100;

/// Validate an embed content request.
pub fn validate_embed_request(request: &EmbedContentRequest) -> GeminiResult<()> {
    let mut details = Vec::new();

    // Validate content has at least one part
    if request.content.parts.is_empty() {
        details.push(ValidationDetail {
            field: "content.parts".to_string(),
            description: "Content must have at least one part".to_string(),
        });
    }

    // Validate that content only contains text parts (no inline_data, file_data, etc.)
    for (idx, part) in request.content.parts.iter().enumerate() {
        match part {
            Part::Text { text } => {
                // Valid - embeddings only support text parts
                if text.is_empty() {
                    details.push(ValidationDetail {
                        field: format!("content.parts[{}].text", idx),
                        description: "Text cannot be empty".to_string(),
                    });
                }
            }
            Part::InlineData { .. } => {
                details.push(ValidationDetail {
                    field: format!("content.parts[{}]", idx),
                    description: "Embeddings do not support inline_data parts, only text parts are allowed".to_string(),
                });
            }
            Part::FileData { .. } => {
                details.push(ValidationDetail {
                    field: format!("content.parts[{}]", idx),
                    description: "Embeddings do not support file_data parts, only text parts are allowed".to_string(),
                });
            }
            Part::FunctionCall { .. } => {
                details.push(ValidationDetail {
                    field: format!("content.parts[{}]", idx),
                    description: "Embeddings do not support function_call parts, only text parts are allowed".to_string(),
                });
            }
            Part::FunctionResponse { .. } => {
                details.push(ValidationDetail {
                    field: format!("content.parts[{}]", idx),
                    description: "Embeddings do not support function_response parts, only text parts are allowed".to_string(),
                });
            }
            Part::ExecutableCode { .. } => {
                details.push(ValidationDetail {
                    field: format!("content.parts[{}]", idx),
                    description: "Embeddings do not support executable_code parts, only text parts are allowed".to_string(),
                });
            }
            Part::CodeExecutionResult { .. } => {
                details.push(ValidationDetail {
                    field: format!("content.parts[{}]", idx),
                    description: "Embeddings do not support code_execution_result parts, only text parts are allowed".to_string(),
                });
            }
        }
    }

    // Validate output_dimensionality if present (1-768)
    if let Some(dim) = request.output_dimensionality {
        if dim < MIN_OUTPUT_DIMENSIONALITY || dim > MAX_OUTPUT_DIMENSIONALITY {
            details.push(ValidationDetail {
                field: "output_dimensionality".to_string(),
                description: format!(
                    "Output dimensionality must be between {} and {}",
                    MIN_OUTPUT_DIMENSIONALITY, MAX_OUTPUT_DIMENSIONALITY
                ),
            });
        }
    }

    // Validate title is only provided for RETRIEVAL_DOCUMENT task type
    if request.title.is_some() {
        match request.task_type {
            Some(TaskType::RetrievalDocument) => {
                // Valid - title is allowed for RETRIEVAL_DOCUMENT
            }
            _ => {
                details.push(ValidationDetail {
                    field: "title".to_string(),
                    description: "Title can only be provided for RETRIEVAL_DOCUMENT task type".to_string(),
                });
            }
        }
    }

    if !details.is_empty() {
        return Err(GeminiError::Request(RequestError::ValidationError {
            message: "Invalid embed content request".to_string(),
            details,
        }));
    }

    Ok(())
}

/// Validate batch size for batch embed requests.
pub fn validate_batch_size(batch_size: usize) -> GeminiResult<()> {
    if batch_size == 0 {
        return Err(GeminiError::Request(RequestError::ValidationError {
            message: "Invalid batch size".to_string(),
            details: vec![ValidationDetail {
                field: "requests".to_string(),
                description: "Batch must contain at least one request".to_string(),
            }],
        }));
    }

    if batch_size > MAX_BATCH_SIZE {
        return Err(GeminiError::Request(RequestError::ValidationError {
            message: "Batch size exceeds maximum".to_string(),
            details: vec![ValidationDetail {
                field: "requests".to_string(),
                description: format!(
                    "Batch size {} exceeds maximum of {}",
                    batch_size, MAX_BATCH_SIZE
                ),
            }],
        }));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Content;

    #[test]
    fn test_validate_embed_request_valid() {
        let request = EmbedContentRequest {
            model: "models/text-embedding-004".to_string(),
            content: Content {
                role: None,
                parts: vec![Part::Text {
                    text: "Hello world".to_string(),
                }],
            },
            task_type: None,
            title: None,
            output_dimensionality: Some(256),
        };

        assert!(validate_embed_request(&request).is_ok());
    }

    #[test]
    fn test_validate_embed_request_empty_parts() {
        let request = EmbedContentRequest {
            model: "models/text-embedding-004".to_string(),
            content: Content {
                role: None,
                parts: vec![],
            },
            task_type: None,
            title: None,
            output_dimensionality: None,
        };

        assert!(validate_embed_request(&request).is_err());
    }

    #[test]
    fn test_validate_embed_request_empty_text() {
        let request = EmbedContentRequest {
            model: "models/text-embedding-004".to_string(),
            content: Content {
                role: None,
                parts: vec![Part::Text {
                    text: "".to_string(),
                }],
            },
            task_type: None,
            title: None,
            output_dimensionality: None,
        };

        assert!(validate_embed_request(&request).is_err());
    }

    #[test]
    fn test_validate_embed_request_invalid_part_type() {
        use crate::types::InlineData;

        let request = EmbedContentRequest {
            model: "models/text-embedding-004".to_string(),
            content: Content {
                role: None,
                parts: vec![Part::InlineData {
                    inline_data: InlineData {
                        mime_type: "image/png".to_string(),
                        data: "base64data".to_string(),
                    },
                }],
            },
            task_type: None,
            title: None,
            output_dimensionality: None,
        };

        let result = validate_embed_request(&request);
        assert!(result.is_err());
        if let Err(GeminiError::Request(RequestError::ValidationError { details, .. })) = result {
            assert!(details.iter().any(|d| d.description.contains("inline_data")));
        }
    }

    #[test]
    fn test_validate_embed_request_invalid_dimensionality() {
        let request = EmbedContentRequest {
            model: "models/text-embedding-004".to_string(),
            content: Content {
                role: None,
                parts: vec![Part::Text {
                    text: "Hello world".to_string(),
                }],
            },
            task_type: None,
            title: None,
            output_dimensionality: Some(1000), // Invalid: max is 768
        };

        assert!(validate_embed_request(&request).is_err());
    }

    #[test]
    fn test_validate_embed_request_title_without_retrieval_document() {
        let request = EmbedContentRequest {
            model: "models/text-embedding-004".to_string(),
            content: Content {
                role: None,
                parts: vec![Part::Text {
                    text: "Hello world".to_string(),
                }],
            },
            task_type: Some(TaskType::SemanticSimilarity),
            title: Some("My Title".to_string()), // Invalid for non-RETRIEVAL_DOCUMENT
            output_dimensionality: None,
        };

        assert!(validate_embed_request(&request).is_err());
    }

    #[test]
    fn test_validate_embed_request_title_with_retrieval_document() {
        let request = EmbedContentRequest {
            model: "models/text-embedding-004".to_string(),
            content: Content {
                role: None,
                parts: vec![Part::Text {
                    text: "Hello world".to_string(),
                }],
            },
            task_type: Some(TaskType::RetrievalDocument),
            title: Some("My Title".to_string()), // Valid for RETRIEVAL_DOCUMENT
            output_dimensionality: None,
        };

        assert!(validate_embed_request(&request).is_ok());
    }

    #[test]
    fn test_validate_batch_size_valid() {
        assert!(validate_batch_size(1).is_ok());
        assert!(validate_batch_size(50).is_ok());
        assert!(validate_batch_size(100).is_ok());
    }

    #[test]
    fn test_validate_batch_size_zero() {
        assert!(validate_batch_size(0).is_err());
    }

    #[test]
    fn test_validate_batch_size_too_large() {
        assert!(validate_batch_size(101).is_err());
        assert!(validate_batch_size(200).is_err());
    }
}
