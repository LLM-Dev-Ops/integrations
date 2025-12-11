//! Validation functions for cached content operations.

use crate::error::{GeminiError, GeminiResult, RequestError, ValidationDetail};
use crate::types::{CreateCachedContentRequest, UpdateCachedContentRequest};

/// Validate a create cached content request.
pub fn validate_create_request(request: &CreateCachedContentRequest) -> GeminiResult<()> {
    let mut details = Vec::new();

    // Validate model is required and not empty
    if request.model.is_empty() {
        details.push(ValidationDetail {
            field: "model".to_string(),
            description: "Model is required and must not be empty".to_string(),
        });
    }

    // Validate contents is required and not empty
    if request.contents.is_empty() {
        details.push(ValidationDetail {
            field: "contents".to_string(),
            description: "Contents is required and must not be empty".to_string(),
        });
    }

    // Validate each content has at least one part
    for (idx, content) in request.contents.iter().enumerate() {
        if content.parts.is_empty() {
            details.push(ValidationDetail {
                field: format!("contents[{}].parts", idx),
                description: "Content must have at least one part".to_string(),
            });
        }
    }

    // Validate either ttl or expire_time is set (XOR - exactly one, not both)
    match (&request.ttl, &request.expire_time) {
        (None, None) => {
            details.push(ValidationDetail {
                field: "ttl/expire_time".to_string(),
                description: "Either ttl or expire_time must be set (exactly one is required)".to_string(),
            });
        }
        (Some(_), Some(_)) => {
            details.push(ValidationDetail {
                field: "ttl/expire_time".to_string(),
                description: "Only one of ttl or expire_time can be set (not both)".to_string(),
            });
        }
        (Some(ttl), None) => {
            // Validate TTL format if set
            if let Err(err) = validate_ttl_format(ttl) {
                details.extend(err);
            }
        }
        (None, Some(_)) => {
            // expire_time is valid - it should be an ISO 8601 timestamp
            // The API will validate the actual timestamp format
        }
    }

    if !details.is_empty() {
        return Err(GeminiError::Request(RequestError::ValidationError {
            message: "Invalid create cached content request".to_string(),
            details,
        }));
    }

    Ok(())
}

/// Validate an update cached content request.
pub fn validate_update_request(request: &UpdateCachedContentRequest) -> GeminiResult<()> {
    let mut details = Vec::new();

    // At least one field must be set for update
    if request.ttl.is_none() && request.expire_time.is_none() {
        details.push(ValidationDetail {
            field: "request".to_string(),
            description: "At least one of ttl or expire_time must be set for update".to_string(),
        });
    }

    // Both ttl and expire_time cannot be set
    if request.ttl.is_some() && request.expire_time.is_some() {
        details.push(ValidationDetail {
            field: "ttl/expire_time".to_string(),
            description: "Only one of ttl or expire_time can be set (not both)".to_string(),
        });
    }

    // Validate TTL format if set
    if let Some(ttl) = &request.ttl {
        if let Err(err) = validate_ttl_format(ttl) {
            details.extend(err);
        }
    }

    if !details.is_empty() {
        return Err(GeminiError::Request(RequestError::ValidationError {
            message: "Invalid update cached content request".to_string(),
            details,
        }));
    }

    Ok(())
}

/// Validate cached content name format.
pub fn validate_cached_content_name(name: &str) -> GeminiResult<()> {
    let mut details = Vec::new();

    if name.is_empty() {
        details.push(ValidationDetail {
            field: "name".to_string(),
            description: "Cached content name must not be empty".to_string(),
        });
    }

    if !details.is_empty() {
        return Err(GeminiError::Request(RequestError::ValidationError {
            message: "Invalid cached content name".to_string(),
            details,
        }));
    }

    Ok(())
}

/// Validate TTL (Time To Live) format.
/// TTL should be a duration string like "600s" or "3600s".
/// Must be positive and follow the format: number + 's' (seconds).
fn validate_ttl_format(ttl: &str) -> Result<(), Vec<ValidationDetail>> {
    let mut details = Vec::new();

    if ttl.is_empty() {
        details.push(ValidationDetail {
            field: "ttl".to_string(),
            description: "TTL must not be empty".to_string(),
        });
        return Err(details);
    }

    // TTL should end with 's' for seconds
    if !ttl.ends_with('s') {
        details.push(ValidationDetail {
            field: "ttl".to_string(),
            description: "TTL must be in seconds format (e.g., '600s', '3600s')".to_string(),
        });
        return Err(details);
    }

    // Parse the numeric part
    let numeric_part = &ttl[..ttl.len() - 1];
    match numeric_part.parse::<u64>() {
        Ok(seconds) => {
            if seconds == 0 {
                details.push(ValidationDetail {
                    field: "ttl".to_string(),
                    description: "TTL must be positive (greater than 0 seconds)".to_string(),
                });
                return Err(details);
            }
        }
        Err(_) => {
            details.push(ValidationDetail {
                field: "ttl".to_string(),
                description: format!("TTL must be a valid positive number followed by 's' (got: '{}')", ttl),
            });
            return Err(details);
        }
    }

    if !details.is_empty() {
        return Err(details);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Content, Part};

    #[test]
    fn test_validate_create_request_valid_with_ttl() {
        let request = CreateCachedContentRequest {
            model: "models/gemini-1.5-pro".to_string(),
            display_name: Some("Test Cache".to_string()),
            contents: vec![Content {
                role: None,
                parts: vec![Part::Text {
                    text: "System context".to_string(),
                }],
            }],
            system_instruction: None,
            tools: None,
            ttl: Some("3600s".to_string()),
            expire_time: None,
        };

        assert!(validate_create_request(&request).is_ok());
    }

    #[test]
    fn test_validate_create_request_valid_with_expire_time() {
        let request = CreateCachedContentRequest {
            model: "models/gemini-1.5-pro".to_string(),
            display_name: Some("Test Cache".to_string()),
            contents: vec![Content {
                role: None,
                parts: vec![Part::Text {
                    text: "System context".to_string(),
                }],
            }],
            system_instruction: None,
            tools: None,
            ttl: None,
            expire_time: Some("2024-12-31T23:59:59Z".to_string()),
        };

        assert!(validate_create_request(&request).is_ok());
    }

    #[test]
    fn test_validate_create_request_empty_model() {
        let request = CreateCachedContentRequest {
            model: "".to_string(),
            display_name: None,
            contents: vec![Content {
                role: None,
                parts: vec![Part::Text {
                    text: "System context".to_string(),
                }],
            }],
            system_instruction: None,
            tools: None,
            ttl: Some("3600s".to_string()),
            expire_time: None,
        };

        assert!(validate_create_request(&request).is_err());
    }

    #[test]
    fn test_validate_create_request_empty_contents() {
        let request = CreateCachedContentRequest {
            model: "models/gemini-1.5-pro".to_string(),
            display_name: None,
            contents: vec![],
            system_instruction: None,
            tools: None,
            ttl: Some("3600s".to_string()),
            expire_time: None,
        };

        assert!(validate_create_request(&request).is_err());
    }

    #[test]
    fn test_validate_create_request_no_ttl_or_expire_time() {
        let request = CreateCachedContentRequest {
            model: "models/gemini-1.5-pro".to_string(),
            display_name: None,
            contents: vec![Content {
                role: None,
                parts: vec![Part::Text {
                    text: "System context".to_string(),
                }],
            }],
            system_instruction: None,
            tools: None,
            ttl: None,
            expire_time: None,
        };

        assert!(validate_create_request(&request).is_err());
    }

    #[test]
    fn test_validate_create_request_both_ttl_and_expire_time() {
        let request = CreateCachedContentRequest {
            model: "models/gemini-1.5-pro".to_string(),
            display_name: None,
            contents: vec![Content {
                role: None,
                parts: vec![Part::Text {
                    text: "System context".to_string(),
                }],
            }],
            system_instruction: None,
            tools: None,
            ttl: Some("3600s".to_string()),
            expire_time: Some("2024-12-31T23:59:59Z".to_string()),
        };

        assert!(validate_create_request(&request).is_err());
    }

    #[test]
    fn test_validate_ttl_format_valid() {
        assert!(validate_ttl_format("600s").is_ok());
        assert!(validate_ttl_format("3600s").is_ok());
        assert!(validate_ttl_format("86400s").is_ok());
    }

    #[test]
    fn test_validate_ttl_format_invalid() {
        assert!(validate_ttl_format("").is_err());
        assert!(validate_ttl_format("600").is_err()); // Missing 's'
        assert!(validate_ttl_format("0s").is_err()); // Zero is not allowed
        assert!(validate_ttl_format("-100s").is_err()); // Negative
        assert!(validate_ttl_format("abc s").is_err()); // Invalid format
        assert!(validate_ttl_format("600m").is_err()); // Wrong unit
    }

    #[test]
    fn test_validate_update_request_valid() {
        let request = UpdateCachedContentRequest {
            ttl: Some("7200s".to_string()),
            expire_time: None,
        };
        assert!(validate_update_request(&request).is_ok());

        let request2 = UpdateCachedContentRequest {
            ttl: None,
            expire_time: Some("2024-12-31T23:59:59Z".to_string()),
        };
        assert!(validate_update_request(&request2).is_ok());
    }

    #[test]
    fn test_validate_update_request_empty() {
        let request = UpdateCachedContentRequest {
            ttl: None,
            expire_time: None,
        };
        assert!(validate_update_request(&request).is_err());
    }

    #[test]
    fn test_validate_update_request_both_fields() {
        let request = UpdateCachedContentRequest {
            ttl: Some("7200s".to_string()),
            expire_time: Some("2024-12-31T23:59:59Z".to_string()),
        };
        assert!(validate_update_request(&request).is_err());
    }

    #[test]
    fn test_validate_cached_content_name_valid() {
        assert!(validate_cached_content_name("cachedContents/my-cache-123").is_ok());
        assert!(validate_cached_content_name("my-cache").is_ok());
    }

    #[test]
    fn test_validate_cached_content_name_empty() {
        assert!(validate_cached_content_name("").is_err());
    }
}
