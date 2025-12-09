pub mod audio;
pub mod batches;
pub mod chat;
pub mod embeddings;
pub mod files;
pub mod images;
pub mod models;
pub mod moderations;

#[cfg(feature = "assistants")]
pub mod assistants;

#[cfg(feature = "fine-tuning")]
pub mod fine_tuning;
