//! Model discovery service for Bedrock.
//!
//! This module provides operations for listing and getting foundation model details.

use crate::error::BedrockError;
use crate::types::{
    GetModelRequest, GetModelResponse, ListModelsRequest, ListModelsResponse, ModelSummary,
};
use async_trait::async_trait;

/// Models service trait.
#[async_trait]
pub trait ModelsService: Send + Sync {
    /// List available foundation models.
    async fn list(&self, request: ListModelsRequest) -> Result<ListModelsResponse, BedrockError>;

    /// Get details for a specific foundation model.
    async fn get(&self, request: GetModelRequest) -> Result<GetModelResponse, BedrockError>;

    /// List models by provider.
    async fn list_by_provider(&self, provider: &str) -> Result<Vec<ModelSummary>, BedrockError> {
        let response = self
            .list(ListModelsRequest {
                by_provider: Some(provider.to_string()),
                ..Default::default()
            })
            .await?;
        Ok(response.model_summaries)
    }

    /// List models supporting text generation.
    async fn list_text_models(&self) -> Result<Vec<ModelSummary>, BedrockError> {
        let response = self
            .list(ListModelsRequest {
                by_output_modality: Some("TEXT".to_string()),
                ..Default::default()
            })
            .await?;
        Ok(response.model_summaries)
    }

    /// List models supporting embeddings.
    async fn list_embedding_models(&self) -> Result<Vec<ModelSummary>, BedrockError> {
        let response = self
            .list(ListModelsRequest {
                by_output_modality: Some("EMBEDDING".to_string()),
                ..Default::default()
            })
            .await?;
        Ok(response.model_summaries)
    }
}

/// Build query parameters for list models request.
pub fn build_list_query_params(request: &ListModelsRequest) -> Vec<(String, String)> {
    let mut params = Vec::new();

    if let Some(ref provider) = request.by_provider {
        params.push(("byProvider".to_string(), provider.clone()));
    }

    if let Some(ref modality) = request.by_output_modality {
        params.push(("byOutputModality".to_string(), modality.clone()));
    }

    if let Some(ref customization) = request.by_customization_type {
        params.push(("byCustomizationType".to_string(), customization.clone()));
    }

    if let Some(ref inference) = request.by_inference_type {
        params.push(("byInferenceType".to_string(), inference.clone()));
    }

    params
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_list_query_params_empty() {
        let request = ListModelsRequest::default();
        let params = build_list_query_params(&request);
        assert!(params.is_empty());
    }

    #[test]
    fn test_build_list_query_params_full() {
        let request = ListModelsRequest {
            by_provider: Some("amazon".to_string()),
            by_output_modality: Some("TEXT".to_string()),
            by_customization_type: Some("FINE_TUNING".to_string()),
            by_inference_type: Some("ON_DEMAND".to_string()),
        };
        let params = build_list_query_params(&request);

        assert_eq!(params.len(), 4);
        assert!(params.contains(&("byProvider".to_string(), "amazon".to_string())));
        assert!(params.contains(&("byOutputModality".to_string(), "TEXT".to_string())));
    }
}
