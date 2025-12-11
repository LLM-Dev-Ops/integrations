//! Tool and function calling types.

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

/// A tool available for the model to use.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Tool {
    /// Function tool.
    Function {
        /// Function definition.
        function: FunctionDefinition,
    },
}

impl Tool {
    /// Creates a function tool.
    pub fn function(
        name: impl Into<String>,
        description: impl Into<String>,
        parameters: JsonValue,
    ) -> Self {
        Tool::Function {
            function: FunctionDefinition {
                name: name.into(),
                description: Some(description.into()),
                parameters,
            },
        }
    }
}

/// Function definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionDefinition {
    /// Function name.
    pub name: String,
    /// Function description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// JSON Schema for parameters.
    pub parameters: JsonValue,
}

impl FunctionDefinition {
    /// Creates a new function definition.
    pub fn new(name: impl Into<String>, parameters: JsonValue) -> Self {
        Self {
            name: name.into(),
            description: None,
            parameters,
        }
    }

    /// Sets the description.
    pub fn with_description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }
}

/// Tool choice specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ToolChoice {
    /// String mode (auto, any, none).
    Mode(ToolChoiceMode),
    /// Specific function.
    Function {
        /// Tool type.
        #[serde(rename = "type")]
        tool_type: String,
        /// Function to call.
        function: ToolChoiceFunction,
    },
}

impl ToolChoice {
    /// Auto mode - model decides.
    pub fn auto() -> Self {
        ToolChoice::Mode(ToolChoiceMode::Auto)
    }

    /// Any mode - must use a tool.
    pub fn any() -> Self {
        ToolChoice::Mode(ToolChoiceMode::Any)
    }

    /// None mode - no tools.
    pub fn none() -> Self {
        ToolChoice::Mode(ToolChoiceMode::None)
    }

    /// Specific function.
    pub fn function(name: impl Into<String>) -> Self {
        ToolChoice::Function {
            tool_type: "function".to_string(),
            function: ToolChoiceFunction { name: name.into() },
        }
    }
}

/// Tool choice mode.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolChoiceMode {
    /// Model decides whether to use tools.
    Auto,
    /// Model must use a tool.
    Any,
    /// Model cannot use tools.
    None,
}

/// Function specification for tool choice.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolChoiceFunction {
    /// Function name.
    pub name: String,
}

/// A tool call made by the model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    /// Unique ID for this tool call.
    pub id: String,
    /// Tool type.
    #[serde(rename = "type")]
    pub tool_type: String,
    /// Function call details.
    pub function: FunctionCall,
}

impl ToolCall {
    /// Creates a new tool call.
    pub fn new(id: impl Into<String>, name: impl Into<String>, arguments: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            tool_type: "function".to_string(),
            function: FunctionCall {
                name: name.into(),
                arguments: arguments.into(),
            },
        }
    }
}

/// Function call details.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    /// Function name.
    pub name: String,
    /// JSON-encoded arguments.
    pub arguments: String,
}

impl FunctionCall {
    /// Parses the arguments as JSON.
    pub fn parse_arguments<T: serde::de::DeserializeOwned>(&self) -> Result<T, serde_json::Error> {
        serde_json::from_str(&self.arguments)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_tool_function_creation() {
        let tool = Tool::function(
            "get_weather",
            "Get weather for a city",
            json!({
                "type": "object",
                "properties": {
                    "city": {"type": "string"}
                },
                "required": ["city"]
            }),
        );

        if let Tool::Function { function } = tool {
            assert_eq!(function.name, "get_weather");
            assert_eq!(function.description, Some("Get weather for a city".to_string()));
        } else {
            panic!("Expected Function tool");
        }
    }

    #[test]
    fn test_tool_choice_modes() {
        let auto = ToolChoice::auto();
        assert!(matches!(auto, ToolChoice::Mode(ToolChoiceMode::Auto)));

        let func = ToolChoice::function("get_weather");
        assert!(matches!(func, ToolChoice::Function { .. }));
    }

    #[test]
    fn test_tool_call_argument_parsing() {
        let tool_call = ToolCall::new("tc_1", "get_weather", r#"{"city": "Paris"}"#);

        #[derive(Debug, Deserialize)]
        struct Args {
            city: String,
        }

        let args: Args = tool_call.function.parse_arguments().unwrap();
        assert_eq!(args.city, "Paris");
    }
}
