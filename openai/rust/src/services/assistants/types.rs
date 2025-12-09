use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Assistant {
    pub id: String,
    pub object: String,
    pub created_at: i64,
    pub name: Option<String>,
    pub description: Option<String>,
    pub model: String,
    pub instructions: Option<String>,
    pub tools: Vec<AssistantTool>,
    pub tool_resources: Option<ToolResources>,
    pub metadata: Option<HashMap<String, String>>,
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub response_format: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AssistantTool {
    #[serde(rename = "code_interpreter")]
    CodeInterpreter,
    #[serde(rename = "file_search")]
    FileSearch { file_search: Option<FileSearchConfig> },
    #[serde(rename = "function")]
    Function { function: FunctionDefinition },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileSearchConfig {
    pub max_num_results: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionDefinition {
    pub name: String,
    pub description: Option<String>,
    pub parameters: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResources {
    pub code_interpreter: Option<CodeInterpreterResources>,
    pub file_search: Option<FileSearchResources>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeInterpreterResources {
    pub file_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileSearchResources {
    pub vector_store_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CreateAssistantRequest {
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instructions: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<AssistantTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_resources: Option<ToolResources>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
}

impl CreateAssistantRequest {
    pub fn new(model: impl Into<String>) -> Self {
        Self { model: model.into(), name: None, description: None, instructions: None, tools: None, tool_resources: None, metadata: None, temperature: None, top_p: None }
    }

    pub fn with_name(mut self, name: impl Into<String>) -> Self { self.name = Some(name.into()); self }
    pub fn with_instructions(mut self, instructions: impl Into<String>) -> Self { self.instructions = Some(instructions.into()); self }
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssistantListResponse {
    pub object: String,
    pub data: Vec<Assistant>,
    pub first_id: Option<String>,
    pub last_id: Option<String>,
    pub has_more: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssistantDeleteResponse {
    pub id: String,
    pub object: String,
    pub deleted: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_assistant_request_builder() {
        let request = CreateAssistantRequest::new("gpt-4")
            .with_name("My Assistant")
            .with_instructions("You are a helpful assistant");

        assert_eq!(request.model, "gpt-4");
        assert_eq!(request.name, Some("My Assistant".to_string()));
    }
}
