//! Tool-related types for the Gemini API.
//!
//! This module contains types for defining and configuring tools that the model can use.

use serde::{Deserialize, Serialize};

/// A tool that the model can use.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Tool {
    /// Function declarations available to the model.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_declarations: Option<Vec<FunctionDeclaration>>,
    /// Code execution capability.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code_execution: Option<CodeExecution>,
    /// Google search retrieval capability.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub google_search_retrieval: Option<GoogleSearchRetrieval>,
}

/// Declaration of a function that the model can call.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FunctionDeclaration {
    /// The name of the function.
    pub name: String,
    /// The description of the function.
    pub description: String,
    /// The parameters schema for the function.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<serde_json::Value>,
}

/// Code execution tool configuration.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct CodeExecution {}

/// Google search retrieval tool configuration.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct GoogleSearchRetrieval {}

/// Configuration for tool usage.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ToolConfig {
    /// Function calling configuration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_calling_config: Option<FunctionCallingConfig>,
}

/// Configuration for function calling behavior.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FunctionCallingConfig {
    /// The mode for function calling.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<FunctionCallingMode>,
    /// List of allowed function names.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_function_names: Option<Vec<String>>,
}

/// Mode for function calling.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FunctionCallingMode {
    /// Automatically decide when to call functions.
    Auto,
    /// Always call a function.
    Any,
    /// Never call functions.
    None,
}
