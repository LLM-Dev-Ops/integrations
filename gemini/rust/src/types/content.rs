//! Content-related types for the Gemini API.
//!
//! This module contains types for representing content, messages, and their parts.

use serde::{Deserialize, Serialize};

/// A part of a content message, which can be text, inline data, file data,
/// function calls, function responses, executable code, or code execution results.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum Part {
    /// Text content.
    Text {
        /// The text content.
        text: String,
    },
    /// Inline binary data.
    InlineData {
        /// The inline data blob.
        inline_data: Blob,
    },
    /// Reference to file data.
    FileData {
        /// The file data reference.
        file_data: FileData,
    },
    /// A function call.
    FunctionCall {
        /// The function call details.
        function_call: FunctionCall,
    },
    /// A function response.
    FunctionResponse {
        /// The function response details.
        function_response: FunctionResponse,
    },
    /// Executable code.
    ExecutableCode {
        /// The executable code details.
        executable_code: ExecutableCode,
    },
    /// Code execution result.
    CodeExecutionResult {
        /// The code execution result details.
        code_execution_result: CodeExecutionResult,
    },
}

/// Binary data blob with MIME type.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Blob {
    /// The MIME type of the data.
    pub mime_type: String,
    /// Base64-encoded binary data.
    pub data: String,
}

/// Reference to file data stored in Gemini's file service.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FileData {
    /// The MIME type of the file.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    /// The URI of the file.
    pub file_uri: String,
}

/// A function call request from the model.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FunctionCall {
    /// The name of the function to call.
    pub name: String,
    /// The arguments to pass to the function.
    pub args: serde_json::Value,
}

/// A function response to send back to the model.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FunctionResponse {
    /// The name of the function that was called.
    pub name: String,
    /// The response data from the function.
    pub response: serde_json::Value,
}

/// Executable code that can be run.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExecutableCode {
    /// The programming language of the code.
    pub language: String,
    /// The code to execute.
    pub code: String,
}

/// The result of code execution.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CodeExecutionResult {
    /// The outcome of the execution.
    pub outcome: String,
    /// The output from the execution, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
}

/// A content message with a role and parts.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Content {
    /// The role of the content author.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<Role>,
    /// The parts of the content.
    pub parts: Vec<Part>,
}

/// The role of a message author.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    /// User role.
    User,
    /// Model role.
    Model,
    /// System role.
    System,
}
