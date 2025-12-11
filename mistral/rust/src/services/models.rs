//! Models service.

use async_trait::async_trait;

use crate::errors::MistralError;
use crate::types::models::{
    ArchiveModelResponse, DeleteModelResponse, Model, ModelListResponse,
    UnarchiveModelResponse, UpdateModelRequest,
};

/// Models service trait.
#[async_trait]
pub trait ModelsService: Send + Sync {
    /// Lists all available models.
    async fn list(&self) -> Result<ModelListResponse, MistralError>;

    /// Retrieves a specific model.
    async fn retrieve(&self, model_id: &str) -> Result<Model, MistralError>;

    /// Deletes a fine-tuned model.
    async fn delete(&self, model_id: &str) -> Result<DeleteModelResponse, MistralError>;

    /// Updates a fine-tuned model.
    async fn update(&self, model_id: &str, request: UpdateModelRequest) -> Result<Model, MistralError>;

    /// Archives a fine-tuned model.
    async fn archive(&self, model_id: &str) -> Result<ArchiveModelResponse, MistralError>;

    /// Unarchives a fine-tuned model.
    async fn unarchive(&self, model_id: &str) -> Result<UnarchiveModelResponse, MistralError>;
}

/// Default implementation of the models service.
pub struct DefaultModelsService<T> {
    transport: T,
}

impl<T> DefaultModelsService<T> {
    /// Creates a new models service.
    pub fn new(transport: T) -> Self {
        Self { transport }
    }
}

#[async_trait]
impl<T> ModelsService for DefaultModelsService<T>
where
    T: crate::transport::HttpTransport + Send + Sync,
{
    async fn list(&self) -> Result<ModelListResponse, MistralError> {
        let response = self.transport
            .get("/v1/models")
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }

    async fn retrieve(&self, model_id: &str) -> Result<Model, MistralError> {
        let path = format!("/v1/models/{}", model_id);
        let response = self.transport
            .get(&path)
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }

    async fn delete(&self, model_id: &str) -> Result<DeleteModelResponse, MistralError> {
        let path = format!("/v1/models/{}", model_id);
        let response = self.transport
            .delete(&path)
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }

    async fn update(&self, model_id: &str, request: UpdateModelRequest) -> Result<Model, MistralError> {
        let path = format!("/v1/models/{}", model_id);
        let body = serde_json::to_vec(&request)
            .map_err(|e| MistralError::Serialization { message: e.to_string() })?;

        let response = self.transport
            .patch(&path, body)
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }

    async fn archive(&self, model_id: &str) -> Result<ArchiveModelResponse, MistralError> {
        let path = format!("/v1/models/{}/archive", model_id);
        let response = self.transport
            .post(&path, vec![])
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }

    async fn unarchive(&self, model_id: &str) -> Result<UnarchiveModelResponse, MistralError> {
        let path = format!("/v1/models/{}/unarchive", model_id);
        let response = self.transport
            .delete(&path)
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_update_model_request_serialization() {
        let request = UpdateModelRequest {
            name: Some("New Name".to_string()),
            description: None,
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("New Name"));
        assert!(!json.contains("description"));
    }
}
