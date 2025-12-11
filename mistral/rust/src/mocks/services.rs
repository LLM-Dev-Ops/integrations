//! Mock service implementations for testing.

use async_trait::async_trait;
use futures::Stream;
use std::collections::HashMap;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

use crate::errors::{MistralError, MistralResult};
use crate::services::{
    AgentsService, BatchService, ChatService, EmbeddingsService, FilesService, FineTuningService,
    ListBatchJobsParams, ListFineTuningJobsParams, ModelsService,
};
use crate::types::agents::{AgentCompletionChunk, AgentCompletionRequest, AgentCompletionResponse};
use crate::types::batch::{BatchJob, BatchListResponse, CreateBatchRequest};
use crate::types::chat::{ChatCompletionChunk, ChatCompletionRequest, ChatCompletionResponse};
use crate::types::embeddings::{EmbeddingRequest, EmbeddingResponse};
use crate::types::files::{
    FileDeleteResponse, FileListResponse, FileObject, FileSignedUrlResponse, FileUploadRequest,
};
use crate::types::fine_tuning::{
    CreateFineTuningJobRequest, FineTuningCheckpoint, FineTuningEvent, FineTuningJob,
    FineTuningJobListResponse,
};
use crate::types::models::{
    ArchiveModelResponse, DeleteModelResponse, Model, ModelListResponse, UnarchiveModelResponse,
    UpdateModelRequest,
};

/// Mock chat service.
pub struct MockChatService {
    responses: Arc<Mutex<Vec<ChatCompletionResponse>>>,
    error: Arc<Mutex<Option<MistralError>>>,
}

impl Default for MockChatService {
    fn default() -> Self {
        Self::new()
    }
}

impl MockChatService {
    /// Creates a new mock chat service.
    pub fn new() -> Self {
        Self {
            responses: Arc::new(Mutex::new(Vec::new())),
            error: Arc::new(Mutex::new(None)),
        }
    }

    /// Sets the response to return.
    pub fn set_response(&self, response: ChatCompletionResponse) {
        self.responses.lock().unwrap().push(response);
    }

    /// Sets an error to return.
    pub fn set_error(&self, error: MistralError) {
        *self.error.lock().unwrap() = Some(error);
    }
}

#[async_trait]
impl ChatService for MockChatService {
    async fn create(&self, _request: ChatCompletionRequest) -> MistralResult<ChatCompletionResponse> {
        if let Some(err) = self.error.lock().unwrap().take() {
            return Err(err);
        }

        self.responses
            .lock()
            .unwrap()
            .pop()
            .ok_or_else(|| MistralError::Internal {
                message: "No mock response configured".to_string(),
                request_id: None,
            })
    }

    async fn create_stream(
        &self,
        _request: ChatCompletionRequest,
    ) -> MistralResult<Pin<Box<dyn Stream<Item = MistralResult<ChatCompletionChunk>> + Send>>> {
        Err(MistralError::Internal {
            message: "Streaming not implemented in mock".to_string(),
            request_id: None,
        })
    }
}

/// Mock embeddings service.
pub struct MockEmbeddingsService {
    response: Arc<Mutex<Option<EmbeddingResponse>>>,
}

impl Default for MockEmbeddingsService {
    fn default() -> Self {
        Self::new()
    }
}

impl MockEmbeddingsService {
    /// Creates a new mock embeddings service.
    pub fn new() -> Self {
        Self {
            response: Arc::new(Mutex::new(None)),
        }
    }

    /// Sets the response to return.
    pub fn set_response(&self, response: EmbeddingResponse) {
        *self.response.lock().unwrap() = Some(response);
    }
}

#[async_trait]
impl EmbeddingsService for MockEmbeddingsService {
    async fn create(&self, _request: EmbeddingRequest) -> MistralResult<EmbeddingResponse> {
        self.response
            .lock()
            .unwrap()
            .take()
            .ok_or_else(|| MistralError::Internal {
                message: "No mock response configured".to_string(),
                request_id: None,
            })
    }
}

/// Mock models service.
pub struct MockModelsService {
    models: Arc<Mutex<Vec<Model>>>,
}

impl Default for MockModelsService {
    fn default() -> Self {
        Self::new()
    }
}

impl MockModelsService {
    /// Creates a new mock models service.
    pub fn new() -> Self {
        Self {
            models: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Adds a model.
    pub fn add_model(&self, model: Model) {
        self.models.lock().unwrap().push(model);
    }
}

#[async_trait]
impl ModelsService for MockModelsService {
    async fn list(&self) -> MistralResult<ModelListResponse> {
        Ok(ModelListResponse {
            object: "list".to_string(),
            data: self.models.lock().unwrap().clone(),
        })
    }

    async fn retrieve(&self, model_id: &str) -> MistralResult<Model> {
        self.models
            .lock()
            .unwrap()
            .iter()
            .find(|m| m.id == model_id)
            .cloned()
            .ok_or_else(|| MistralError::NotFound {
                message: format!("Model {} not found", model_id),
                resource: Some(model_id.to_string()),
            })
    }

    async fn delete(&self, model_id: &str) -> MistralResult<DeleteModelResponse> {
        Ok(DeleteModelResponse {
            id: model_id.to_string(),
            object: "model".to_string(),
            deleted: true,
        })
    }

    async fn update(&self, model_id: &str, _request: UpdateModelRequest) -> MistralResult<Model> {
        self.retrieve(model_id).await
    }

    async fn archive(&self, model_id: &str) -> MistralResult<ArchiveModelResponse> {
        Ok(ArchiveModelResponse {
            id: model_id.to_string(),
            object: "model".to_string(),
            archived: true,
        })
    }

    async fn unarchive(&self, model_id: &str) -> MistralResult<UnarchiveModelResponse> {
        Ok(UnarchiveModelResponse {
            id: model_id.to_string(),
            object: "model".to_string(),
            archived: false,
        })
    }
}

/// Mock files service.
pub struct MockFilesService {
    files: Arc<Mutex<HashMap<String, FileObject>>>,
}

impl Default for MockFilesService {
    fn default() -> Self {
        Self::new()
    }
}

impl MockFilesService {
    /// Creates a new mock files service.
    pub fn new() -> Self {
        Self {
            files: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Adds a file.
    pub fn add_file(&self, file: FileObject) {
        self.files.lock().unwrap().insert(file.id.clone(), file);
    }
}

#[async_trait]
impl FilesService for MockFilesService {
    async fn list(&self) -> MistralResult<FileListResponse> {
        Ok(FileListResponse {
            object: "list".to_string(),
            data: self.files.lock().unwrap().values().cloned().collect(),
        })
    }

    async fn retrieve(&self, file_id: &str) -> MistralResult<FileObject> {
        self.files
            .lock()
            .unwrap()
            .get(file_id)
            .cloned()
            .ok_or_else(|| MistralError::NotFound {
                message: format!("File {} not found", file_id),
                resource: Some(file_id.to_string()),
            })
    }

    async fn upload(&self, request: FileUploadRequest) -> MistralResult<FileObject> {
        let file = FileObject {
            id: format!("file-{}", uuid::Uuid::new_v4()),
            object: "file".to_string(),
            bytes: request.file.len() as u64,
            created_at: chrono::Utc::now().timestamp(),
            filename: request.filename,
            purpose: request.purpose,
            sample_type: None,
            num_lines: None,
            source: None,
        };
        self.files.lock().unwrap().insert(file.id.clone(), file.clone());
        Ok(file)
    }

    async fn delete(&self, file_id: &str) -> MistralResult<FileDeleteResponse> {
        self.files.lock().unwrap().remove(file_id);
        Ok(FileDeleteResponse {
            id: file_id.to_string(),
            object: "file".to_string(),
            deleted: true,
        })
    }

    async fn get_signed_url(&self, file_id: &str) -> MistralResult<FileSignedUrlResponse> {
        Ok(FileSignedUrlResponse {
            url: format!("https://files.mistral.ai/{}", file_id),
            expires_at: chrono::Utc::now().timestamp() + 3600,
        })
    }
}

/// Mock fine-tuning service.
pub struct MockFineTuningService {
    jobs: Arc<Mutex<HashMap<String, FineTuningJob>>>,
}

impl Default for MockFineTuningService {
    fn default() -> Self {
        Self::new()
    }
}

impl MockFineTuningService {
    /// Creates a new mock fine-tuning service.
    pub fn new() -> Self {
        Self {
            jobs: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Adds a job.
    pub fn add_job(&self, job: FineTuningJob) {
        self.jobs.lock().unwrap().insert(job.id.clone(), job);
    }
}

#[async_trait]
impl FineTuningService for MockFineTuningService {
    async fn list(
        &self,
        _params: Option<ListFineTuningJobsParams>,
    ) -> MistralResult<FineTuningJobListResponse> {
        Ok(FineTuningJobListResponse {
            object: "list".to_string(),
            data: self.jobs.lock().unwrap().values().cloned().collect(),
            total: Some(self.jobs.lock().unwrap().len() as u32),
        })
    }

    async fn retrieve(&self, job_id: &str) -> MistralResult<FineTuningJob> {
        self.jobs
            .lock()
            .unwrap()
            .get(job_id)
            .cloned()
            .ok_or_else(|| MistralError::NotFound {
                message: format!("Job {} not found", job_id),
                resource: Some(job_id.to_string()),
            })
    }

    async fn create(&self, _request: CreateFineTuningJobRequest) -> MistralResult<FineTuningJob> {
        Err(MistralError::Internal {
            message: "Create not implemented in mock".to_string(),
            request_id: None,
        })
    }

    async fn cancel(&self, job_id: &str) -> MistralResult<FineTuningJob> {
        self.retrieve(job_id).await
    }

    async fn start(&self, job_id: &str) -> MistralResult<FineTuningJob> {
        self.retrieve(job_id).await
    }

    async fn list_events(&self, _job_id: &str) -> MistralResult<Vec<FineTuningEvent>> {
        Ok(Vec::new())
    }

    async fn list_checkpoints(&self, _job_id: &str) -> MistralResult<Vec<FineTuningCheckpoint>> {
        Ok(Vec::new())
    }
}

/// Mock agents service.
pub struct MockAgentsService {
    response: Arc<Mutex<Option<AgentCompletionResponse>>>,
}

impl Default for MockAgentsService {
    fn default() -> Self {
        Self::new()
    }
}

impl MockAgentsService {
    /// Creates a new mock agents service.
    pub fn new() -> Self {
        Self {
            response: Arc::new(Mutex::new(None)),
        }
    }

    /// Sets the response to return.
    pub fn set_response(&self, response: AgentCompletionResponse) {
        *self.response.lock().unwrap() = Some(response);
    }
}

#[async_trait]
impl AgentsService for MockAgentsService {
    async fn complete(
        &self,
        _request: AgentCompletionRequest,
    ) -> MistralResult<AgentCompletionResponse> {
        self.response
            .lock()
            .unwrap()
            .take()
            .ok_or_else(|| MistralError::Internal {
                message: "No mock response configured".to_string(),
                request_id: None,
            })
    }

    async fn complete_stream(
        &self,
        _request: AgentCompletionRequest,
    ) -> MistralResult<Pin<Box<dyn Stream<Item = MistralResult<AgentCompletionChunk>> + Send>>> {
        Err(MistralError::Internal {
            message: "Streaming not implemented in mock".to_string(),
            request_id: None,
        })
    }
}

/// Mock batch service.
pub struct MockBatchService {
    batches: Arc<Mutex<HashMap<String, BatchJob>>>,
}

impl Default for MockBatchService {
    fn default() -> Self {
        Self::new()
    }
}

impl MockBatchService {
    /// Creates a new mock batch service.
    pub fn new() -> Self {
        Self {
            batches: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Adds a batch.
    pub fn add_batch(&self, batch: BatchJob) {
        self.batches.lock().unwrap().insert(batch.id.clone(), batch);
    }
}

#[async_trait]
impl BatchService for MockBatchService {
    async fn list(&self, _params: Option<ListBatchJobsParams>) -> MistralResult<BatchListResponse> {
        Ok(BatchListResponse {
            object: "list".to_string(),
            data: self.batches.lock().unwrap().values().cloned().collect(),
            total: Some(self.batches.lock().unwrap().len() as u32),
        })
    }

    async fn retrieve(&self, batch_id: &str) -> MistralResult<BatchJob> {
        self.batches
            .lock()
            .unwrap()
            .get(batch_id)
            .cloned()
            .ok_or_else(|| MistralError::NotFound {
                message: format!("Batch {} not found", batch_id),
                resource: Some(batch_id.to_string()),
            })
    }

    async fn create(&self, _request: CreateBatchRequest) -> MistralResult<BatchJob> {
        Err(MistralError::Internal {
            message: "Create not implemented in mock".to_string(),
            request_id: None,
        })
    }

    async fn cancel(&self, batch_id: &str) -> MistralResult<BatchJob> {
        self.retrieve(batch_id).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::chat::{ChatChoice, Message, AssistantMessage};
    use crate::types::common::Usage;

    #[tokio::test]
    async fn test_mock_chat_service() {
        let service = MockChatService::new();

        let response = ChatCompletionResponse {
            id: "test-123".to_string(),
            object: "chat.completion".to_string(),
            model: "mistral-large-latest".to_string(),
            created: 1234567890,
            choices: vec![ChatChoice {
                index: 0,
                message: AssistantMessage {
                    content: Some("Hello!".to_string()),
                    tool_calls: None,
                    prefix: None,
                },
                finish_reason: Some(crate::types::common::FinishReason::Stop),
            }],
            usage: Usage::new(10, 5),
        };

        service.set_response(response);

        let request = ChatCompletionRequest::new(
            "mistral-large-latest",
            vec![Message::user("Hi")],
        );

        let result = service.create(request).await.unwrap();
        assert_eq!(result.id, "test-123");
    }

    #[tokio::test]
    async fn test_mock_models_service() {
        let service = MockModelsService::new();

        let models = service.list().await.unwrap();
        assert!(models.data.is_empty());
    }

    #[tokio::test]
    async fn test_mock_files_service() {
        let service = MockFilesService::new();

        let request = FileUploadRequest::new(
            vec![1, 2, 3],
            "test.jsonl",
            crate::types::files::FilePurpose::FineTune,
        );

        let file = service.upload(request).await.unwrap();
        assert!(!file.id.is_empty());
        assert_eq!(file.bytes, 3);
    }
}
