//! Service implementations for the Mistral API.

pub mod chat;
pub mod embeddings;
pub mod models;
pub mod files;
pub mod fine_tuning;
pub mod agents;
pub mod batch;

// Re-export service traits
pub use chat::ChatService;
pub use embeddings::EmbeddingsService;
pub use models::ModelsService;
pub use files::FilesService;
pub use fine_tuning::FineTuningService;
pub use agents::AgentsService;
pub use batch::BatchService;
