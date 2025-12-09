//! Messages service implementation

use super::types::{
    CreateMessageRequest, CountTokensRequest, Message, TokenCount,
};
use super::validation::{validate_create_message_request, validate_count_tokens_request};
use super::stream::MessageStream;
use crate::auth::AuthManager;
use crate::error::{AnthropicError, ApiErrorResponse};
use crate::transport::HttpTransport;
use async_trait::async_trait;
use http::{HeaderMap, Method};
use std::sync::Arc;
use url::Url;

/// Messages service trait for testability
#[async_trait]
pub trait MessagesService: Send + Sync {
    /// Create a message
    async fn create(&self, request: CreateMessageRequest) -> Result<Message, AnthropicError>;

    /// Create a streaming message
    async fn create_stream(
        &self,
        request: CreateMessageRequest,
    ) -> Result<MessageStream, AnthropicError>;

    /// Count tokens for a message
    async fn count_tokens(
        &self,
        request: CountTokensRequest,
    ) -> Result<TokenCount, AnthropicError>;
}

/// Implementation of the Messages service
pub struct MessagesServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    base_url: Url,
}

impl MessagesServiceImpl {
    /// Create a new Messages service
    pub fn new(
        transport: Arc<dyn HttpTransport>,
        auth_manager: Arc<dyn AuthManager>,
        base_url: Url,
    ) -> Self {
        Self {
            transport,
            auth_manager,
            base_url,
        }
    }

    /// Build headers for a request
    fn build_headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        self.auth_manager.add_auth_headers(&mut headers);
        headers
    }

    /// Parse API error from response
    fn parse_api_error(&self, status: u16, body: &[u8]) -> AnthropicError {
        if let Ok(error_response) = serde_json::from_slice::<ApiErrorResponse>(body) {
            AnthropicError::Api {
                status,
                message: error_response.error.message,
                error_type: error_response.error.error_type,
            }
        } else {
            AnthropicError::Api {
                status,
                message: String::from_utf8_lossy(body).to_string(),
                error_type: "unknown".to_string(),
            }
        }
    }
}

#[async_trait]
impl MessagesService for MessagesServiceImpl {
    async fn create(&self, mut request: CreateMessageRequest) -> Result<Message, AnthropicError> {
        // Validate request
        validate_create_message_request(&request)?;

        // Ensure stream is disabled
        request.stream = Some(false);

        // Build URL
        let url = self.base_url
            .join("/v1/messages")
            .map_err(|e| AnthropicError::Configuration(format!("Invalid URL: {}", e)))?;

        // Build headers
        let headers = self.build_headers();

        // Serialize request body
        let body = serde_json::to_vec(&request)?;

        // Execute request
        let response = self.transport
            .execute(
                Method::POST,
                url.to_string(),
                headers,
                Some(body),
            )
            .await?;

        // Handle response
        if response.status == 200 {
            let message = serde_json::from_slice::<Message>(&response.body)?;
            Ok(message)
        } else {
            Err(self.parse_api_error(response.status, &response.body))
        }
    }

    async fn create_stream(
        &self,
        mut request: CreateMessageRequest,
    ) -> Result<MessageStream, AnthropicError> {
        // Validate request
        validate_create_message_request(&request)?;

        // Enable streaming
        request.stream = Some(true);

        // Build URL
        let url = self.base_url
            .join("/v1/messages")
            .map_err(|e| AnthropicError::Configuration(format!("Invalid URL: {}", e)))?;

        // Build headers
        let headers = self.build_headers();

        // Serialize request body
        let body = serde_json::to_vec(&request)?;

        // Execute streaming request
        let stream = self.transport
            .execute_stream(
                Method::POST,
                url.to_string(),
                headers,
                Some(body),
            )
            .await?;

        // Wrap in MessageStream
        Ok(MessageStream::new(stream))
    }

    async fn count_tokens(
        &self,
        request: CountTokensRequest,
    ) -> Result<TokenCount, AnthropicError> {
        // Validate request
        validate_count_tokens_request(&request)?;

        // Build URL
        let url = self.base_url
            .join("/v1/messages/count_tokens")
            .map_err(|e| AnthropicError::Configuration(format!("Invalid URL: {}", e)))?;

        // Build headers
        let headers = self.build_headers();

        // Serialize request body
        let body = serde_json::to_vec(&request)?;

        // Execute request
        let response = self.transport
            .execute(
                Method::POST,
                url.to_string(),
                headers,
                Some(body),
            )
            .await?;

        // Handle response
        if response.status == 200 {
            let token_count = serde_json::from_slice::<TokenCount>(&response.body)?;
            Ok(token_count)
        } else {
            Err(self.parse_api_error(response.status, &response.body))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::messages::{MessageParam, MessageContent, Role};

    #[tokio::test]
    async fn test_create_message_validates_request() {
        // This is a placeholder - full tests are in tests.rs
        let request = CreateMessageRequest::new(
            "claude-3-5-sonnet-20241022",
            1024,
            vec![MessageParam {
                role: Role::User,
                content: MessageContent::Text("Hello".to_string()),
            }],
        );

        assert!(validate_create_message_request(&request).is_ok());
    }
}
