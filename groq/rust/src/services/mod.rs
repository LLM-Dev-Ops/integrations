//! Service implementations for the Groq API.
//!
//! Provides service abstractions for chat completions, audio transcription,
//! and model management.

mod audio;
mod chat;
mod models;

pub use audio::AudioService;
pub use chat::ChatService;
pub use models::ModelsService;
