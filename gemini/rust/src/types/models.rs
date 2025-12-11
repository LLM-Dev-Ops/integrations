//! Model-related types for the Gemini API.
//!
//! This module contains types for working with Gemini models.

use serde::{Deserialize, Serialize};

/// Information about a Gemini model.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Model {
    /// The resource name of the model.
    pub name: String,
    /// The version of the model.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// The display name of the model.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// The description of the model.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// The input token limit.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_token_limit: Option<i32>,
    /// The output token limit.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_token_limit: Option<i32>,
    /// Supported generation methods.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supported_generation_methods: Option<Vec<String>>,
    /// The default temperature.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    /// The default top_p.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    /// The default top_k.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<i32>,
    /// The maximum temperature.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_temperature: Option<f32>,
}

/// Response from listing models.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ListModelsResponse {
    /// The list of models.
    pub models: Vec<Model>,
    /// Token for the next page.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_page_token: Option<String>,
}

/// Parameters for listing models.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct ListModelsParams {
    /// The page size.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_size: Option<i32>,
    /// The page token.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_token: Option<String>,
}
