//! Test fixtures and sample data
//!
//! This module provides sample API responses, error responses, and test data builders
//! for use in unit and integration tests. Following the London School TDD approach,
//! these fixtures allow for consistent and realistic test data.

#[cfg(test)]
mod chat_fixtures;
#[cfg(test)]
mod embeddings_fixtures;
#[cfg(test)]
mod error_fixtures;
#[cfg(test)]
mod model_fixtures;
#[cfg(test)]
mod file_fixtures;
#[cfg(test)]
mod image_fixtures;
#[cfg(test)]
mod audio_fixtures;
#[cfg(test)]
mod moderation_fixtures;
#[cfg(test)]
mod batch_fixtures;
#[cfg(test)]
mod stream_fixtures;

#[cfg(test)]
pub use chat_fixtures::*;
#[cfg(test)]
pub use embeddings_fixtures::*;
#[cfg(test)]
pub use error_fixtures::*;
#[cfg(test)]
pub use model_fixtures::*;
#[cfg(test)]
pub use file_fixtures::*;
#[cfg(test)]
pub use image_fixtures::*;
#[cfg(test)]
pub use audio_fixtures::*;
#[cfg(test)]
pub use moderation_fixtures::*;
#[cfg(test)]
pub use batch_fixtures::*;
#[cfg(test)]
pub use stream_fixtures::*;
