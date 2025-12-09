mod client_impl;
mod config;
mod factory;

pub use client_impl::OpenAIClientImpl;
pub use config::OpenAIConfig;
pub use factory::OpenAIClientBuilder;

use crate::errors::OpenAIResult;
use crate::services::{
    audio::AudioService, batches::BatchService, chat::ChatCompletionService,
    embeddings::EmbeddingsService, files::FileService, images::ImageService, models::ModelService,
    moderations::ModerationService,
};

#[cfg(feature = "assistants")]
use crate::services::assistants::{
    AssistantService, MessageService, RunService, ThreadService, VectorStoreService,
};

#[cfg(feature = "fine-tuning")]
use crate::services::fine_tuning::FineTuningService;

use async_trait::async_trait;

#[async_trait]
pub trait OpenAIClient: Send + Sync {
    fn chat(&self) -> &dyn ChatCompletionService;
    fn embeddings(&self) -> &dyn EmbeddingsService;
    fn files(&self) -> &dyn FileService;
    fn models(&self) -> &dyn ModelService;
    fn moderations(&self) -> &dyn ModerationService;
    fn images(&self) -> &dyn ImageService;
    fn audio(&self) -> &dyn AudioService;

    #[cfg(feature = "batches")]
    fn batches(&self) -> &dyn BatchService;

    #[cfg(feature = "assistants")]
    fn assistants(&self) -> &dyn AssistantService;

    #[cfg(feature = "assistants")]
    fn threads(&self) -> &dyn ThreadService;

    #[cfg(feature = "assistants")]
    fn messages(&self) -> &dyn MessageService;

    #[cfg(feature = "assistants")]
    fn runs(&self) -> &dyn RunService;

    #[cfg(feature = "assistants")]
    fn vector_stores(&self) -> &dyn VectorStoreService;

    #[cfg(feature = "fine-tuning")]
    fn fine_tuning(&self) -> &dyn FineTuningService;

    async fn health_check(&self) -> OpenAIResult<bool>;
}
