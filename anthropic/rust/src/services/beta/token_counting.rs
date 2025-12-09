//! Token Counting Service
//!
//! This module provides the beta token counting API, which allows
//! counting tokens before sending requests to optimize costs.

use async_trait::async_trait;
use http::Method;
use std::sync::Arc;

use crate::auth::AuthManager;
use crate::errors::AnthropicResult;
use crate::resilience::ResilienceOrchestrator;
use crate::transport::HttpTransport;

use super::types::{TokenCountRequest, TokenCountResponse};

/// Token counting service trait
#[async_trait]
pub trait TokenCountingService: Send + Sync {
    /// Count tokens for a given request
    ///
    /// # Arguments
    /// * `request` - The token count request containing model and messages
    ///
    /// # Returns
    /// The number of input tokens that would be consumed
    ///
    /// # Errors
    /// Returns an error if the API request fails
    async fn count_tokens(&self, request: TokenCountRequest) -> AnthropicResult<TokenCountResponse>;
}

/// Implementation of the token counting service
pub struct TokenCountingServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthManager>,
    resilience: Arc<dyn ResilienceOrchestrator>,
}

impl TokenCountingServiceImpl {
    /// Create a new token counting service
    pub fn new(
        transport: Arc<dyn HttpTransport>,
        auth_manager: Arc<dyn AuthManager>,
        resilience: Arc<dyn ResilienceOrchestrator>,
    ) -> Self {
        Self {
            transport,
            auth_manager,
            resilience,
        }
    }
}

#[async_trait]
impl TokenCountingService for TokenCountingServiceImpl {
    async fn count_tokens(&self, request: TokenCountRequest) -> AnthropicResult<TokenCountResponse> {
        let mut headers = http::HeaderMap::new();
        self.auth_manager.apply_auth(&mut headers).await?;

        // Add beta header for token counting
        headers.insert(
            "anthropic-beta",
            get_token_counting_beta_header()
                .parse()
                .expect("Valid header value"),
        );

        self.resilience
            .execute(async {
                self.transport
                    .request::<TokenCountRequest, TokenCountResponse>(
                        Method::POST,
                        "/v1/messages/count_tokens",
                        Some(&request),
                        Some(headers.clone()),
                    )
                    .await
            })
            .await
    }
}

/// Get the beta header value for token counting
pub fn get_token_counting_beta_header() -> &'static str {
    "token-counting-2024-11-01"
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mocks::{MockAuthManager, MockHttpTransport, MockResilienceOrchestrator};
    use crate::services::messages::MessageParam;

    #[test]
    fn test_token_counting_service_creation() {
        let transport = Arc::new(MockHttpTransport::new());
        let auth = Arc::new(MockAuthManager::new());
        let resilience = Arc::new(MockResilienceOrchestrator::new());

        let _service = TokenCountingServiceImpl::new(transport, auth, resilience);
    }

    #[test]
    fn test_token_count_request_builder() {
        let messages = vec![
            MessageParam::user("Hello, how are you?"),
            MessageParam::assistant("I'm doing well, thank you!"),
        ];

        let request = TokenCountRequest::new("claude-3-5-sonnet-20241022", messages.clone())
            .with_system("You are a helpful assistant");

        assert_eq!(request.model, "claude-3-5-sonnet-20241022");
        assert_eq!(request.messages.len(), 2);
        assert!(request.system.is_some());
    }

    #[tokio::test]
    async fn test_count_tokens_success() {
        let mut transport = MockHttpTransport::new();
        transport
            .expect_request()
            .times(1)
            .returning(|_, _, _, _| {
                Box::pin(async {
                    Ok(TokenCountResponse {
                        input_tokens: 42,
                    })
                })
            });

        let mut auth = MockAuthManager::new();
        auth.expect_apply_auth()
            .times(1)
            .returning(|_| Box::pin(async { Ok(()) }));

        let mut resilience = MockResilienceOrchestrator::new();
        resilience
            .expect_execute()
            .times(1)
            .returning(|fut| Box::pin(fut));

        let service = TokenCountingServiceImpl::new(
            Arc::new(transport),
            Arc::new(auth),
            Arc::new(resilience),
        );

        let request = TokenCountRequest::new(
            "claude-3-5-sonnet-20241022",
            vec![MessageParam::user("Hello")],
        );

        let response = service.count_tokens(request).await.unwrap();
        assert_eq!(response.input_tokens, 42);
    }

    #[test]
    fn test_beta_header() {
        assert_eq!(get_token_counting_beta_header(), "token-counting-2024-11-01");
    }

    #[test]
    fn test_token_count_request_with_tools() {
        use crate::services::messages::Tool;

        let messages = vec![MessageParam::user("What's the weather?")];
        let tools = vec![Tool::new(
            "get_weather",
            "Get weather information",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "location": {"type": "string"}
                }
            }),
        )];

        let request = TokenCountRequest::new("claude-3-5-sonnet-20241022", messages)
            .with_tools(tools);

        assert!(request.tools.is_some());
        assert_eq!(request.tools.as_ref().unwrap().len(), 1);
    }

    #[test]
    fn test_token_count_response_serialization() {
        let response = TokenCountResponse { input_tokens: 100 };
        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("\"input_tokens\":100"));

        let deserialized: TokenCountResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.input_tokens, 100);
    }
}
