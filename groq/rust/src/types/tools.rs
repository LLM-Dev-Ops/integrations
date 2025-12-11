//! Tool and function calling types.

use serde::{Deserialize, Serialize};

use crate::errors::GroqError;

/// Tool definition for function calling.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tool {
    /// Tool type (always "function").
    #[serde(rename = "type")]
    pub type_: String,

    /// Function definition.
    pub function: FunctionDefinition,
}

impl Tool {
    /// Creates a new function tool.
    pub fn function(
        name: impl Into<String>,
        description: impl Into<String>,
        parameters: serde_json::Value,
    ) -> Self {
        Self {
            type_: "function".to_string(),
            function: FunctionDefinition {
                name: name.into(),
                description: Some(description.into()),
                parameters: Some(parameters),
            },
        }
    }

    /// Validates the tool definition.
    pub fn validate(&self) -> Result<(), String> {
        if self.type_ != "function" {
            return Err(format!("Unknown tool type: {}", self.type_));
        }

        if self.function.name.is_empty() {
            return Err("Function name is required".to_string());
        }

        // Validate function name format (alphanumeric and underscores)
        if !self
            .function
            .name
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_')
        {
            return Err(
                "Function name must contain only alphanumeric characters and underscores"
                    .to_string(),
            );
        }

        Ok(())
    }
}

/// Function definition within a tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionDefinition {
    /// Function name.
    pub name: String,

    /// Function description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// JSON Schema for function parameters.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<serde_json::Value>,
}

/// Tool call from the model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    /// Unique tool call ID.
    pub id: String,

    /// Tool type (always "function").
    #[serde(rename = "type")]
    pub type_: String,

    /// Function call details.
    pub function: FunctionCall,
}

/// Function call details.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    /// Function name.
    pub name: String,

    /// Function arguments as JSON string.
    pub arguments: String,
}

impl FunctionCall {
    /// Parses the arguments as a specific type.
    pub fn parse_arguments<T: serde::de::DeserializeOwned>(&self) -> Result<T, GroqError> {
        serde_json::from_str(&self.arguments).map_err(|e| GroqError::Validation {
            message: format!("Failed to parse function arguments: {}", e),
            param: Some("arguments".to_string()),
            value: Some(self.arguments.clone()),
        })
    }
}

/// Tool call delta for streaming responses.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ToolCallDelta {
    /// Index of the tool call.
    pub index: u32,

    /// Tool call ID (only in first chunk).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,

    /// Tool type (only in first chunk).
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub type_: Option<String>,

    /// Function delta.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function: Option<FunctionDelta>,
}

/// Function call delta for streaming.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct FunctionDelta {
    /// Function name (only in first chunk).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    /// Partial arguments.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<String>,
}

/// Tool choice configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ToolChoice {
    /// Simple mode (auto, none, required).
    Mode(ToolChoiceMode),

    /// Specific function.
    Function {
        /// Type (always "function").
        #[serde(rename = "type")]
        type_: String,
        /// Function specification.
        function: ToolChoiceFunction,
    },
}

impl ToolChoice {
    /// Let the model decide whether to call tools.
    pub fn auto() -> Self {
        Self::Mode(ToolChoiceMode::Auto)
    }

    /// Don't call any tools.
    pub fn none() -> Self {
        Self::Mode(ToolChoiceMode::None)
    }

    /// Require tool calls.
    pub fn required() -> Self {
        Self::Mode(ToolChoiceMode::Required)
    }

    /// Call a specific function.
    pub fn function(name: impl Into<String>) -> Self {
        Self::Function {
            type_: "function".to_string(),
            function: ToolChoiceFunction { name: name.into() },
        }
    }
}

/// Tool choice mode.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolChoiceMode {
    /// Model decides whether to call tools.
    Auto,
    /// Don't call any tools.
    None,
    /// Must call at least one tool.
    Required,
}

/// Function specification for tool choice.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolChoiceFunction {
    /// Function name.
    pub name: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_creation() {
        let tool = Tool::function(
            "get_weather",
            "Get the current weather",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The city and state"
                    }
                },
                "required": ["location"]
            }),
        );

        assert_eq!(tool.type_, "function");
        assert_eq!(tool.function.name, "get_weather");
        assert!(tool.validate().is_ok());
    }

    #[test]
    fn test_tool_validation_empty_name() {
        let tool = Tool {
            type_: "function".to_string(),
            function: FunctionDefinition {
                name: "".to_string(),
                description: None,
                parameters: None,
            },
        };

        assert!(tool.validate().is_err());
    }

    #[test]
    fn test_tool_validation_invalid_name() {
        let tool = Tool {
            type_: "function".to_string(),
            function: FunctionDefinition {
                name: "invalid-name".to_string(),
                description: None,
                parameters: None,
            },
        };

        assert!(tool.validate().is_err());
    }

    #[test]
    fn test_function_call_parse_arguments() {
        let call = FunctionCall {
            name: "test".to_string(),
            arguments: r#"{"key": "value"}"#.to_string(),
        };

        let args: serde_json::Value = call.parse_arguments().unwrap();
        assert_eq!(args["key"], "value");
    }

    #[test]
    fn test_tool_choice_serialization() {
        let auto = ToolChoice::auto();
        let json = serde_json::to_string(&auto).unwrap();
        assert_eq!(json, r#""auto""#);

        let func = ToolChoice::function("get_weather");
        let json = serde_json::to_string(&func).unwrap();
        assert!(json.contains("get_weather"));
    }
}
