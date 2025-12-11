//! Client tests.

use crate::client::SlackClientImpl;
use crate::config::SlackConfigBuilder;
use crate::errors::{Result, SlackError};
use crate::mocks::MockHttpTransport;
use crate::types::Channel;
use secrecy::SecretString;
use serde_json::json;

#[tokio::test]
async fn test_client_creation() {
    let config = SlackConfigBuilder::new()
        .token(SecretString::new("xoxb-test-token".into()))
        .build()
        .unwrap();

    let client = SlackClientImpl::new(config);
    assert!(client.is_ok());
}

#[tokio::test]
async fn test_client_with_mock_transport() {
    let mut mock = MockHttpTransport::new();
    mock.add_response(
        "conversations.list",
        json!({
            "ok": true,
            "channels": [
                {
                    "id": "C123",
                    "name": "general",
                    "is_channel": true
                }
            ],
            "response_metadata": {
                "next_cursor": ""
            }
        }),
    );

    // Client would use this mock for testing
    let calls = mock.get_calls();
    assert!(calls.is_empty());
}

#[tokio::test]
async fn test_mock_response_matching() {
    let mut mock = MockHttpTransport::new();
    mock.add_response(
        "auth.test",
        json!({
            "ok": true,
            "url": "https://test.slack.com",
            "team": "Test Team",
            "user": "test_user",
            "team_id": "T123",
            "user_id": "U123"
        }),
    );

    mock.add_response(
        "conversations.info",
        json!({
            "ok": true,
            "channel": {
                "id": "C123",
                "name": "general",
                "is_channel": true,
                "is_private": false
            }
        }),
    );

    // Verify responses are stored
    let response = mock.get_response("auth.test");
    assert!(response.is_some());

    let response = mock.get_response("conversations.info");
    assert!(response.is_some());
}

#[tokio::test]
async fn test_error_response() {
    let mut mock = MockHttpTransport::new();
    mock.add_response(
        "conversations.info",
        json!({
            "ok": false,
            "error": "channel_not_found"
        }),
    );

    let response = mock.get_response("conversations.info").unwrap();
    assert!(!response["ok"].as_bool().unwrap());
    assert_eq!(response["error"].as_str().unwrap(), "channel_not_found");
}

#[tokio::test]
async fn test_rate_limit_response() {
    let mut mock = MockHttpTransport::new();
    mock.add_rate_limit_response("chat.postMessage", 30);

    let response = mock.get_response("chat.postMessage").unwrap();
    assert!(!response["ok"].as_bool().unwrap());
    assert_eq!(response["error"].as_str().unwrap(), "rate_limited");
}

#[test]
fn test_slack_error_from_api() {
    let error = SlackError::from_api_error("channel_not_found", None);
    assert!(matches!(error, SlackError::NotFound(_)));

    let error = SlackError::from_api_error("invalid_auth", None);
    assert!(matches!(error, SlackError::Authentication(_)));

    let error = SlackError::from_api_error("rate_limited", None);
    assert!(matches!(error, SlackError::RateLimit { .. }));
}
