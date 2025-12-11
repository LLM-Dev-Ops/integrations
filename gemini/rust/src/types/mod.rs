//! Core types for the Gemini API.
//!
//! This module contains all the request, response, and configuration types
//! needed to interact with the Gemini API.

// Module declarations
pub mod cached_content;
pub mod common;
pub mod content;
pub mod embeddings;
pub mod files;
pub mod generation;
pub mod models;
pub mod safety;
pub mod tools;

// Re-exports for cached content types
pub use cached_content::{
    CachedContent, CachedContentUsageMetadata, CreateCachedContentRequest,
    ListCachedContentsParams, ListCachedContentsResponse, UpdateCachedContentRequest,
};

// Re-exports for common types
pub use common::{CountTokensRequest, CountTokensResponse};

// Re-exports for content types
pub use content::{
    Blob, CodeExecutionResult, Content, ExecutableCode, FileData, FunctionCall, FunctionResponse,
    Part, Role,
};

// Re-exports for embedding types
pub use embeddings::{
    BatchEmbedContentsResponse, EmbedContentRequest, EmbedContentResponse, Embedding, TaskType,
};

// Re-exports for file types
pub use files::{File, FileState, ListFilesParams, ListFilesResponse, UploadFileRequest};

// Re-exports for generation types
pub use generation::{
    BlockReason, Candidate, CitationMetadata, CitationSource, FinishReason,
    GenerateContentRequest, GenerateContentResponse, GenerationConfig, GroundingMetadata,
    PromptFeedback, UsageMetadata,
};

// Re-exports for model types
pub use models::{ListModelsParams, ListModelsResponse, Model};

// Re-exports for safety types
pub use safety::{HarmBlockThreshold, HarmCategory, HarmProbability, SafetyRating, SafetySetting};

// Re-exports for tool types
pub use tools::{
    CodeExecution, FunctionCallingConfig, FunctionCallingMode, FunctionDeclaration,
    GoogleSearchRetrieval, Tool, ToolConfig,
};
