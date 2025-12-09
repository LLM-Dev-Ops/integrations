pub mod auth;
pub mod client;
pub mod errors;
pub mod resilience;
pub mod services;
pub mod transport;
pub mod types;

#[cfg(test)]
pub mod mocks;
#[cfg(test)]
pub mod fixtures;

pub use client::{OpenAIClient, OpenAIClientBuilder, OpenAIClientImpl};
pub use errors::{OpenAIError, OpenAIResult};
pub use types::OpenAIConfig;

pub use services::{
    audio::{
        AudioService, SpeechRequest, TranscriptionRequest, TranslationRequest,
        TranscriptionResponse, SpeechVoice, SpeechResponseFormat, AudioResponseFormat,
    },
    batches::{BatchService, BatchRequest, BatchStatus},
    chat::{ChatCompletionRequest, ChatCompletionResponse, ChatCompletionService, ChatMessage},
    embeddings::{EmbeddingsRequest, EmbeddingsResponse, EmbeddingsService},
    files::{
        FileObject, FilePurpose, FileService, FileUploadRequest, FileListResponse,
        FileDeleteResponse,
    },
    images::{
        ImageGenerationRequest, ImageService, ImageEditRequest, ImageVariationRequest,
        ImageResponse, ImageData, ImageSize, ImageQuality, ImageStyle, ImageResponseFormat,
    },
    models::{Model, ModelService},
    moderations::{ModerationRequest, ModerationResponse, ModerationService},
};

#[cfg(feature = "assistants")]
pub use services::assistants::{
    Assistant, AssistantService, Message, MessageService, Run, RunService, Thread, ThreadService,
    VectorStore, VectorStoreService,
};

#[cfg(feature = "fine-tuning")]
pub use services::fine_tuning::{FineTuningJob, FineTuningService};

pub mod prelude {
    pub use crate::client::{OpenAIClient, OpenAIClientBuilder};
    pub use crate::errors::{OpenAIError, OpenAIResult};
    pub use crate::services::chat::{ChatCompletionRequest, ChatCompletionService, ChatMessage};
    pub use crate::services::embeddings::{EmbeddingsRequest, EmbeddingsService};
    pub use crate::types::OpenAIConfig;
}
