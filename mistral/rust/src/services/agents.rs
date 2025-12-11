//! Agents service.

use async_trait::async_trait;
use futures::Stream;
use std::pin::Pin;

use crate::errors::MistralError;
use crate::types::agents::{AgentCompletionChunk, AgentCompletionRequest, AgentCompletionResponse};

/// Agents service trait.
#[async_trait]
pub trait AgentsService: Send + Sync {
    /// Creates an agent completion.
    async fn complete(&self, request: AgentCompletionRequest) -> Result<AgentCompletionResponse, MistralError>;

    /// Creates a streaming agent completion.
    async fn complete_stream(
        &self,
        request: AgentCompletionRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<AgentCompletionChunk, MistralError>> + Send>>, MistralError>;
}

/// Default implementation of the agents service.
pub struct DefaultAgentsService<T> {
    transport: T,
}

impl<T> DefaultAgentsService<T> {
    /// Creates a new agents service.
    pub fn new(transport: T) -> Self {
        Self { transport }
    }
}

#[async_trait]
impl<T> AgentsService for DefaultAgentsService<T>
where
    T: crate::transport::HttpTransport + Send + Sync,
{
    async fn complete(&self, request: AgentCompletionRequest) -> Result<AgentCompletionResponse, MistralError> {
        let body = serde_json::to_vec(&request)
            .map_err(|e| MistralError::Serialization { message: e.to_string() })?;

        let response = self.transport
            .post("/v1/agents/completions", body)
            .await?;

        serde_json::from_slice(&response)
            .map_err(|e| MistralError::Deserialization {
                message: e.to_string(),
                body: String::from_utf8_lossy(&response).to_string(),
            })
    }

    async fn complete_stream(
        &self,
        mut request: AgentCompletionRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<AgentCompletionChunk, MistralError>> + Send>>, MistralError> {
        request.stream = Some(true);

        let body = serde_json::to_vec(&request)
            .map_err(|e| MistralError::Serialization { message: e.to_string() })?;

        let stream = self.transport
            .post_stream("/v1/agents/completions", body)
            .await?;

        Ok(stream)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::chat::Message;

    #[test]
    fn test_agent_request_serialization() {
        let request = AgentCompletionRequest::new(
            "agent-123",
            vec![Message::user("Hello!")],
        );

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("agent-123"));
        assert!(json.contains("Hello!"));
    }
}
