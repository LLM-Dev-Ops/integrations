//! Integration tests using WireMock
//!
//! These tests verify the complete integration with OpenAI API using a mock HTTP server.
//! They test the full request/response cycle including serialization, authentication,
//! and error handling.

pub mod chat_completions;
pub mod embeddings;

use wiremock::{Mock, MockServer, ResponseTemplate};
use wiremock::matchers::{method, path, header};

/// Helper to create a mock server with authentication
pub async fn setup_mock_server() -> MockServer {
    MockServer::start().await
}

/// Helper to create an authenticated mock response
pub fn mock_with_auth(path_matcher: &str, method_matcher: &str) -> Mock {
    Mock::given(method(method_matcher))
        .and(path(path_matcher))
        .and(header("Authorization", "Bearer test-api-key"))
}

/// Helper to create error response templates
pub fn error_response(status: u16, error_body: serde_json::Value) -> ResponseTemplate {
    ResponseTemplate::new(status).set_body_json(error_body)
}

/// Helper to create success response templates
pub fn success_response(body: serde_json::Value) -> ResponseTemplate {
    ResponseTemplate::new(200).set_body_json(body)
}
