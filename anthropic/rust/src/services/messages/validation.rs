//! Request validation for the Messages API

use super::types::{
    CreateMessageRequest, CountTokensRequest, MessageParam, MessageContent, Role, ToolChoice,
};
use crate::error::ValidationError;

/// Validate a create message request
pub fn validate_create_message_request(
    request: &CreateMessageRequest,
) -> Result<(), ValidationError> {
    // Validate model
    if request.model.is_empty() {
        return Err(ValidationError::Required {
            field: "model".to_string(),
        });
    }

    // Validate max_tokens
    if request.max_tokens == 0 {
        return Err(ValidationError::Invalid {
            field: "max_tokens".to_string(),
            reason: "must be greater than 0".to_string(),
        });
    }

    // Validate max_tokens upper limit (typical limit is 4096 for most models)
    if request.max_tokens > 8192 {
        return Err(ValidationError::OutOfRange {
            field: "max_tokens".to_string(),
            reason: "exceeds maximum of 8192".to_string(),
        });
    }

    // Validate messages
    if request.messages.is_empty() {
        return Err(ValidationError::Required {
            field: "messages".to_string(),
        });
    }

    // Validate message alternation (should alternate between user and assistant)
    // First message should be from user
    if let Some(first_message) = request.messages.first() {
        if first_message.role != Role::User {
            return Err(ValidationError::InvalidMessageFormat(
                "First message must be from user".to_string(),
            ));
        }
    }

    // Check for consecutive messages from the same role
    let mut last_role: Option<Role> = None;
    for (i, message) in request.messages.iter().enumerate() {
        if let Some(last) = last_role {
            if last == message.role {
                return Err(ValidationError::InvalidMessageFormat(format!(
                    "Messages must alternate between user and assistant (violation at index {})",
                    i
                )));
            }
        }
        last_role = Some(message.role);

        // Validate message content
        validate_message_content(&message.content)?;
    }

    // Validate temperature
    if let Some(temp) = request.temperature {
        if !(0.0..=1.0).contains(&temp) {
            return Err(ValidationError::OutOfRange {
                field: "temperature".to_string(),
                reason: "must be between 0.0 and 1.0".to_string(),
            });
        }
    }

    // Validate top_p
    if let Some(top_p) = request.top_p {
        if !(0.0..=1.0).contains(&top_p) {
            return Err(ValidationError::OutOfRange {
                field: "top_p".to_string(),
                reason: "must be between 0.0 and 1.0".to_string(),
            });
        }
    }

    // Validate top_k
    if let Some(top_k) = request.top_k {
        if top_k == 0 {
            return Err(ValidationError::Invalid {
                field: "top_k".to_string(),
                reason: "must be greater than 0".to_string(),
            });
        }
    }

    // Validate tools
    if let Some(tools) = &request.tools {
        if tools.is_empty() {
            return Err(ValidationError::Invalid {
                field: "tools".to_string(),
                reason: "if provided, must not be empty".to_string(),
            });
        }

        for tool in tools {
            if tool.name.is_empty() {
                return Err(ValidationError::InvalidTool(
                    "Tool name cannot be empty".to_string(),
                ));
            }
            if tool.description.is_empty() {
                return Err(ValidationError::InvalidTool(
                    "Tool description cannot be empty".to_string(),
                ));
            }
            // Validate that input_schema is an object
            if !tool.input_schema.is_object() {
                return Err(ValidationError::InvalidTool(
                    "Tool input_schema must be a JSON object".to_string(),
                ));
            }
        }
    }

    // Validate tool_choice
    if let Some(tool_choice) = &request.tool_choice {
        if request.tools.is_none() {
            return Err(ValidationError::Invalid {
                field: "tool_choice".to_string(),
                reason: "cannot be set without tools".to_string(),
            });
        }

        // If tool_choice is a specific tool, validate it exists
        if let ToolChoice::Tool { name } = tool_choice {
            let tools = request.tools.as_ref().unwrap();
            if !tools.iter().any(|t| t.name == *name) {
                return Err(ValidationError::Invalid {
                    field: "tool_choice".to_string(),
                    reason: format!("tool '{}' not found in tools list", name),
                });
            }
        }
    }

    // Validate thinking config
    if let Some(thinking) = &request.thinking {
        if thinking.thinking_type != "enabled" {
            return Err(ValidationError::Invalid {
                field: "thinking.type".to_string(),
                reason: "must be 'enabled'".to_string(),
            });
        }
        if let Some(budget) = thinking.budget_tokens {
            if budget == 0 {
                return Err(ValidationError::Invalid {
                    field: "thinking.budget_tokens".to_string(),
                    reason: "must be greater than 0".to_string(),
                });
            }
        }
    }

    Ok(())
}

/// Validate message content
fn validate_message_content(content: &MessageContent) -> Result<(), ValidationError> {
    match content {
        MessageContent::Text(text) => {
            if text.is_empty() {
                return Err(ValidationError::Invalid {
                    field: "message.content".to_string(),
                    reason: "text content cannot be empty".to_string(),
                });
            }
        }
        MessageContent::Blocks(blocks) => {
            if blocks.is_empty() {
                return Err(ValidationError::Invalid {
                    field: "message.content".to_string(),
                    reason: "content blocks cannot be empty".to_string(),
                });
            }
        }
    }
    Ok(())
}

/// Validate a count tokens request
pub fn validate_count_tokens_request(
    request: &CountTokensRequest,
) -> Result<(), ValidationError> {
    // Validate model
    if request.model.is_empty() {
        return Err(ValidationError::Required {
            field: "model".to_string(),
        });
    }

    // Validate messages
    if request.messages.is_empty() {
        return Err(ValidationError::Required {
            field: "messages".to_string(),
        });
    }

    // Validate message content
    for message in &request.messages {
        validate_message_content(&message.content)?;
    }

    // Validate tools
    if let Some(tools) = &request.tools {
        if tools.is_empty() {
            return Err(ValidationError::Invalid {
                field: "tools".to_string(),
                reason: "if provided, must not be empty".to_string(),
            });
        }

        for tool in tools {
            if tool.name.is_empty() {
                return Err(ValidationError::InvalidTool(
                    "Tool name cannot be empty".to_string(),
                ));
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::messages::{Tool, ThinkingConfig};

    #[test]
    fn test_validate_valid_request() {
        let request = CreateMessageRequest::new(
            "claude-3-5-sonnet-20241022",
            1024,
            vec![MessageParam {
                role: Role::User,
                content: MessageContent::Text("Hello".to_string()),
            }],
        );

        assert!(validate_create_message_request(&request).is_ok());
    }

    #[test]
    fn test_validate_empty_model() {
        let request = CreateMessageRequest::new(
            "",
            1024,
            vec![MessageParam {
                role: Role::User,
                content: MessageContent::Text("Hello".to_string()),
            }],
        );

        assert!(matches!(
            validate_create_message_request(&request),
            Err(ValidationError::Required { field }) if field == "model"
        ));
    }

    #[test]
    fn test_validate_zero_max_tokens() {
        let request = CreateMessageRequest::new(
            "claude-3-5-sonnet-20241022",
            0,
            vec![MessageParam {
                role: Role::User,
                content: MessageContent::Text("Hello".to_string()),
            }],
        );

        assert!(matches!(
            validate_create_message_request(&request),
            Err(ValidationError::Invalid { field, .. }) if field == "max_tokens"
        ));
    }

    #[test]
    fn test_validate_empty_messages() {
        let request = CreateMessageRequest::new("claude-3-5-sonnet-20241022", 1024, vec![]);

        assert!(matches!(
            validate_create_message_request(&request),
            Err(ValidationError::Required { field }) if field == "messages"
        ));
    }

    #[test]
    fn test_validate_first_message_not_user() {
        let request = CreateMessageRequest::new(
            "claude-3-5-sonnet-20241022",
            1024,
            vec![MessageParam {
                role: Role::Assistant,
                content: MessageContent::Text("Hello".to_string()),
            }],
        );

        assert!(matches!(
            validate_create_message_request(&request),
            Err(ValidationError::InvalidMessageFormat(_))
        ));
    }

    #[test]
    fn test_validate_consecutive_same_role() {
        let request = CreateMessageRequest::new(
            "claude-3-5-sonnet-20241022",
            1024,
            vec![
                MessageParam {
                    role: Role::User,
                    content: MessageContent::Text("Hello".to_string()),
                },
                MessageParam {
                    role: Role::User,
                    content: MessageContent::Text("Hi again".to_string()),
                },
            ],
        );

        assert!(matches!(
            validate_create_message_request(&request),
            Err(ValidationError::InvalidMessageFormat(_))
        ));
    }

    #[test]
    fn test_validate_temperature_out_of_range() {
        let request = CreateMessageRequest::new(
            "claude-3-5-sonnet-20241022",
            1024,
            vec![MessageParam {
                role: Role::User,
                content: MessageContent::Text("Hello".to_string()),
            }],
        )
        .with_temperature(1.5);

        assert!(matches!(
            validate_create_message_request(&request),
            Err(ValidationError::OutOfRange { field, .. }) if field == "temperature"
        ));
    }

    #[test]
    fn test_validate_tools_empty() {
        let request = CreateMessageRequest::new(
            "claude-3-5-sonnet-20241022",
            1024,
            vec![MessageParam {
                role: Role::User,
                content: MessageContent::Text("Hello".to_string()),
            }],
        )
        .with_tools(vec![]);

        assert!(matches!(
            validate_create_message_request(&request),
            Err(ValidationError::Invalid { field, .. }) if field == "tools"
        ));
    }

    #[test]
    fn test_validate_tool_choice_without_tools() {
        let request = CreateMessageRequest::new(
            "claude-3-5-sonnet-20241022",
            1024,
            vec![MessageParam {
                role: Role::User,
                content: MessageContent::Text("Hello".to_string()),
            }],
        )
        .with_tool_choice(ToolChoice::Auto);

        assert!(matches!(
            validate_create_message_request(&request),
            Err(ValidationError::Invalid { field, .. }) if field == "tool_choice"
        ));
    }
}
