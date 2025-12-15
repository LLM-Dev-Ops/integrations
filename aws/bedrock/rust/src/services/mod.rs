//! Service implementations for AWS Bedrock model families.
//!
//! This module provides model-specific services for:
//! - Amazon Titan (text generation and embeddings)
//! - Anthropic Claude (text generation via Bedrock)
//! - Meta LLaMA (text generation)
//! - Model discovery and management

pub mod claude;
pub mod llama;
pub mod models;
pub mod titan;

pub use claude::{ClaudeService, ClaudeStreamIterator, ClaudeStreamState};
pub use llama::{LlamaService, LlamaStreamIterator, LlamaStreamState};
pub use models::ModelsService;
pub use titan::{TitanService, TitanStreamIterator};

use crate::error::BedrockError;
use crate::types::{
    detect_model_family, ModelFamily, UnifiedInvokeRequest, UnifiedInvokeResponse,
    UnifiedStreamChunk,
};

/// Unified service that routes to appropriate model family.
pub struct UnifiedService;

impl UnifiedService {
    /// Translate a unified request to family-specific format.
    pub fn translate_request(
        request: &UnifiedInvokeRequest,
    ) -> Result<FamilyRequest, BedrockError> {
        let family = detect_model_family(&request.model_id)?;

        match family {
            ModelFamily::Titan => {
                let titan_request = titan::translate_request(request)?;
                Ok(FamilyRequest::Titan(titan_request))
            }
            ModelFamily::Claude => {
                let claude_request = claude::translate_request(request)?;
                Ok(FamilyRequest::Claude(claude_request))
            }
            ModelFamily::Llama => {
                let llama_request = llama::translate_request(request)?;
                Ok(FamilyRequest::Llama(llama_request))
            }
        }
    }

    /// Get the model family for a request.
    pub fn get_family(request: &UnifiedInvokeRequest) -> Result<ModelFamily, BedrockError> {
        detect_model_family(&request.model_id).map_err(Into::into)
    }
}

/// Family-specific request variants.
#[derive(Debug)]
pub enum FamilyRequest {
    /// Titan text generation request.
    Titan(crate::types::TitanTextRequest),
    /// Claude messages API request.
    Claude(crate::types::ClaudeRequest),
    /// LLaMA request.
    Llama(crate::types::LlamaRequest),
}

impl FamilyRequest {
    /// Serialize the request to JSON bytes.
    pub fn to_json_bytes(&self) -> Result<Vec<u8>, BedrockError> {
        let json = match self {
            FamilyRequest::Titan(req) => serde_json::to_vec(req),
            FamilyRequest::Claude(req) => serde_json::to_vec(req),
            FamilyRequest::Llama(req) => serde_json::to_vec(req),
        };

        json.map_err(|e| {
            BedrockError::Request(crate::error::RequestError::Validation {
                message: format!("Failed to serialize request: {}", e),
                request_id: None,
            })
        })
    }

    /// Get the model family.
    pub fn family(&self) -> ModelFamily {
        match self {
            FamilyRequest::Titan(_) => ModelFamily::Titan,
            FamilyRequest::Claude(_) => ModelFamily::Claude,
            FamilyRequest::Llama(_) => ModelFamily::Llama,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Message;

    #[test]
    fn test_translate_titan_request() {
        let request = UnifiedInvokeRequest::new(
            "amazon.titan-text-express-v1",
            vec![Message::user("Hello")],
        );

        let result = UnifiedService::translate_request(&request);
        assert!(result.is_ok());

        match result.unwrap() {
            FamilyRequest::Titan(_) => {}
            _ => panic!("Expected Titan request"),
        }
    }

    #[test]
    fn test_translate_claude_request() {
        let request = UnifiedInvokeRequest::new(
            "anthropic.claude-3-sonnet-20240229-v1:0",
            vec![Message::user("Hello")],
        );

        let result = UnifiedService::translate_request(&request);
        assert!(result.is_ok());

        match result.unwrap() {
            FamilyRequest::Claude(_) => {}
            _ => panic!("Expected Claude request"),
        }
    }

    #[test]
    fn test_translate_llama_request() {
        let request = UnifiedInvokeRequest::new(
            "meta.llama3-70b-instruct-v1:0",
            vec![Message::user("Hello")],
        );

        let result = UnifiedService::translate_request(&request);
        assert!(result.is_ok());

        match result.unwrap() {
            FamilyRequest::Llama(_) => {}
            _ => panic!("Expected LLaMA request"),
        }
    }

    #[test]
    fn test_translate_unknown_model() {
        let request = UnifiedInvokeRequest::new(
            "unknown.model-v1",
            vec![Message::user("Hello")],
        );

        let result = UnifiedService::translate_request(&request);
        assert!(result.is_err());
    }

    #[test]
    fn test_family_request_serialize() {
        let request = UnifiedInvokeRequest::new(
            "amazon.titan-text-express-v1",
            vec![Message::user("Hello")],
        );

        let family_request = UnifiedService::translate_request(&request).unwrap();
        let json = family_request.to_json_bytes();
        assert!(json.is_ok());
    }
}
