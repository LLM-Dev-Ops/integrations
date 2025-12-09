use crate::auth::AuthManager;
use crate::client::{OpenAIClient, OpenAIConfig};
use crate::errors::OpenAIResult;
use crate::resilience::ResilienceOrchestrator;
use crate::services::{
    audio::{AudioService, AudioServiceImpl},
    batches::{BatchService, BatchServiceImpl},
    chat::{ChatCompletionService, ChatCompletionServiceImpl},
    embeddings::{EmbeddingsService, EmbeddingsServiceImpl},
    files::{FileService, FileServiceImpl},
    images::{ImageService, ImageServiceImpl},
    models::{ModelService, ModelServiceImpl},
    moderations::{ModerationService, ModerationServiceImpl},
};

#[cfg(feature = "assistants")]
use crate::services::assistants::{
    AssistantService, AssistantServiceImpl, MessageService, MessageServiceImpl, RunService,
    RunServiceImpl, ThreadService, ThreadServiceImpl, VectorStoreService, VectorStoreServiceImpl,
};

#[cfg(feature = "fine-tuning")]
use crate::services::fine_tuning::{FineTuningService, FineTuningServiceImpl};

use crate::transport::HttpTransport;
use async_trait::async_trait;
use std::sync::Arc;

pub struct OpenAIClientImpl {
    config: OpenAIConfig,
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,

    chat_service: ChatCompletionServiceImpl,
    embeddings_service: EmbeddingsServiceImpl,
    files_service: FileServiceImpl,
    models_service: ModelServiceImpl,
    moderations_service: ModerationServiceImpl,
    images_service: ImageServiceImpl,
    audio_service: AudioServiceImpl,

    #[cfg(feature = "batches")]
    batches_service: BatchServiceImpl,

    #[cfg(feature = "assistants")]
    assistants_service: AssistantServiceImpl,

    #[cfg(feature = "assistants")]
    threads_service: ThreadServiceImpl,

    #[cfg(feature = "assistants")]
    messages_service: MessageServiceImpl,

    #[cfg(feature = "assistants")]
    runs_service: RunServiceImpl,

    #[cfg(feature = "assistants")]
    vector_stores_service: VectorStoreServiceImpl,

    #[cfg(feature = "fine-tuning")]
    fine_tuning_service: FineTuningServiceImpl,
}

impl OpenAIClientImpl {
    pub fn new(
        config: OpenAIConfig,
        transport: Arc<dyn HttpTransport>,
        auth_manager: Arc<dyn AuthManager>,
        resilience: Arc<dyn ResilienceOrchestrator>,
    ) -> Self {
        let chat_service = ChatCompletionServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
        );

        let embeddings_service = EmbeddingsServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
        );

        let files_service = FileServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
        );

        let models_service = ModelServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
        );

        let moderations_service = ModerationServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
        );

        let images_service = ImageServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
        );

        let audio_service = AudioServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
        );

        #[cfg(feature = "batches")]
        let batches_service = BatchServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
        );

        #[cfg(feature = "assistants")]
        let assistants_service = AssistantServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
        );

        #[cfg(feature = "assistants")]
        let threads_service = ThreadServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
        );

        #[cfg(feature = "assistants")]
        let messages_service = MessageServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
        );

        #[cfg(feature = "assistants")]
        let runs_service = RunServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
        );

        #[cfg(feature = "assistants")]
        let vector_stores_service = VectorStoreServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
        );

        #[cfg(feature = "fine-tuning")]
        let fine_tuning_service = FineTuningServiceImpl::new(
            transport.clone(),
            auth_manager.clone(),
            resilience.clone(),
        );

        Self {
            config,
            transport,
            auth_manager,
            resilience,
            chat_service,
            embeddings_service,
            files_service,
            models_service,
            moderations_service,
            images_service,
            audio_service,
            #[cfg(feature = "batches")]
            batches_service,
            #[cfg(feature = "assistants")]
            assistants_service,
            #[cfg(feature = "assistants")]
            threads_service,
            #[cfg(feature = "assistants")]
            messages_service,
            #[cfg(feature = "assistants")]
            runs_service,
            #[cfg(feature = "assistants")]
            vector_stores_service,
            #[cfg(feature = "fine-tuning")]
            fine_tuning_service,
        }
    }
}

#[async_trait]
impl OpenAIClient for OpenAIClientImpl {
    fn chat(&self) -> &dyn ChatCompletionService {
        &self.chat_service
    }

    fn embeddings(&self) -> &dyn EmbeddingsService {
        &self.embeddings_service
    }

    fn files(&self) -> &dyn FileService {
        &self.files_service
    }

    fn models(&self) -> &dyn ModelService {
        &self.models_service
    }

    fn moderations(&self) -> &dyn ModerationService {
        &self.moderations_service
    }

    fn images(&self) -> &dyn ImageService {
        &self.images_service
    }

    fn audio(&self) -> &dyn AudioService {
        &self.audio_service
    }

    #[cfg(feature = "batches")]
    fn batches(&self) -> &dyn BatchService {
        &self.batches_service
    }

    #[cfg(feature = "assistants")]
    fn assistants(&self) -> &dyn AssistantService {
        &self.assistants_service
    }

    #[cfg(feature = "assistants")]
    fn threads(&self) -> &dyn ThreadService {
        &self.threads_service
    }

    #[cfg(feature = "assistants")]
    fn messages(&self) -> &dyn MessageService {
        &self.messages_service
    }

    #[cfg(feature = "assistants")]
    fn runs(&self) -> &dyn RunService {
        &self.runs_service
    }

    #[cfg(feature = "assistants")]
    fn vector_stores(&self) -> &dyn VectorStoreService {
        &self.vector_stores_service
    }

    #[cfg(feature = "fine-tuning")]
    fn fine_tuning(&self) -> &dyn FineTuningService {
        &self.fine_tuning_service
    }

    async fn health_check(&self) -> OpenAIResult<bool> {
        self.models_service.list().await.map(|_| true)
    }
}
