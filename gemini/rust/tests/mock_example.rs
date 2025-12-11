//! Example tests demonstrating mock usage and AAA (Arrange-Act-Assert) pattern.
//!
//! These tests showcase London-School TDD with comprehensive mocking.

use integrations_gemini::mocks::{MockAuthManager, MockHttpTransport};
use integrations_gemini::transport::{HttpMethod, HttpRequest, HttpTransport};
use integrations_gemini::fixtures::{load_fixture, load_json_fixture};
use std::collections::HashMap;

#[tokio::test]
async fn test_mock_transport_success_response() {
    // Arrange: Set up mock transport with a success response
    let transport = MockHttpTransport::new();
    let fixture_json = load_fixture("content/success_response.json");
    transport.enqueue_json_response(200, &fixture_json);

    let request = HttpRequest {
        method: HttpMethod::Post,
        url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent".to_string(),
        headers: HashMap::new(),
        body: None,
    };

    // Act: Send the request
    let response = transport.send(request).await.unwrap();

    // Assert: Verify the response
    assert_eq!(response.status, 200);
    let body_str = String::from_utf8(response.body.to_vec()).unwrap();
    assert!(body_str.contains("candidates"));
    assert!(body_str.contains("usageMetadata"));

    // Verify request was recorded
    transport.verify_request_count(1);
    transport.verify_request(0, HttpMethod::Post, "generateContent");
}

#[tokio::test]
async fn test_mock_transport_safety_blocked() {
    // Arrange: Set up mock transport with a safety blocked response
    let transport = MockHttpTransport::new();
    let fixture_json = load_fixture("content/safety_blocked.json");
    transport.enqueue_json_response(400, &fixture_json);

    let request = HttpRequest {
        method: HttpMethod::Post,
        url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent".to_string(),
        headers: HashMap::new(),
        body: None,
    };

    // Act: Send the request
    let response = transport.send(request).await.unwrap();

    // Assert: Verify the safety block response
    assert_eq!(response.status, 400);
    let body_str = String::from_utf8(response.body.to_vec()).unwrap();
    assert!(body_str.contains("promptFeedback"));
    assert!(body_str.contains("SAFETY"));
}

#[tokio::test]
async fn test_mock_transport_multiple_requests() {
    // Arrange: Set up multiple responses
    let transport = MockHttpTransport::new();
    transport.enqueue_json_response(200, r#"{"status": "first"}"#);
    transport.enqueue_json_response(200, r#"{"status": "second"}"#);
    transport.enqueue_json_response(200, r#"{"status": "third"}"#);

    // Act: Make multiple requests
    for i in 0..3 {
        let request = HttpRequest {
            method: HttpMethod::Get,
            url: format!("https://example.com/request-{}", i),
            headers: HashMap::new(),
            body: None,
        };
        transport.send(request).await.unwrap();
    }

    // Assert: Verify all requests were made
    transport.verify_request_count(3);
    let requests = transport.get_requests();
    assert_eq!(requests[0].url, "https://example.com/request-0");
    assert_eq!(requests[1].url, "https://example.com/request-1");
    assert_eq!(requests[2].url, "https://example.com/request-2");
}

#[tokio::test]
async fn test_mock_auth_manager_header_injection() {
    // Arrange: Create mock auth manager
    let auth = MockAuthManager::new("test-api-key-12345");
    let mut request = HttpRequest {
        method: HttpMethod::Post,
        url: "https://generativelanguage.googleapis.com".to_string(),
        headers: HashMap::new(),
        body: None,
    };

    // Act: Apply authentication
    if let Some((name, value)) = auth.get_auth_header() {
        request.headers.insert(name, value);
    }

    // Assert: Verify header was added
    assert_eq!(
        request.headers.get("x-goog-api-key"),
        Some(&"test-api-key-12345".to_string())
    );
}

#[tokio::test]
async fn test_streaming_response_parsing() {
    // Arrange: Set up streaming mock
    let transport = MockHttpTransport::new();
    let chunks = vec![
        bytes::Bytes::from(r#"{"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}"#),
        bytes::Bytes::from(r#"{"candidates":[{"content":{"parts":[{"text":" world"}]}}]}"#),
        bytes::Bytes::from(r#"{"candidates":[{"content":{"parts":[{"text":"!"}]}}]}"#),
    ];
    transport.enqueue_streaming_response(chunks);

    let request = HttpRequest {
        method: HttpMethod::Post,
        url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent".to_string(),
        headers: HashMap::new(),
        body: None,
    };

    // Act: Get streaming response
    let mut stream = transport.send_streaming(request).await.unwrap();

    // Assert: Verify chunks are received
    use futures::StreamExt;
    let mut chunk_count = 0;
    while let Some(chunk_result) = stream.next().await {
        assert!(chunk_result.is_ok());
        chunk_count += 1;
    }
    assert_eq!(chunk_count, 3);
}

#[test]
fn test_json_fixture_loading() {
    // Arrange & Act: Load JSON fixture
    let response: serde_json::Value = load_json_fixture("content/success_response.json");

    // Assert: Verify fixture structure
    assert!(response.get("candidates").is_some());
    assert!(response.get("usageMetadata").is_some());

    let usage = response.get("usageMetadata").unwrap();
    assert_eq!(usage.get("promptTokenCount").unwrap(), 10);
    assert_eq!(usage.get("candidatesTokenCount").unwrap(), 8);
    assert_eq!(usage.get("totalTokenCount").unwrap(), 18);
}

#[test]
fn test_safety_blocked_fixture() {
    // Arrange & Act: Load safety blocked fixture
    let response: serde_json::Value = load_json_fixture("content/safety_blocked.json");

    // Assert: Verify safety block structure
    assert!(response.get("promptFeedback").is_some());
    let feedback = response.get("promptFeedback").unwrap();
    assert_eq!(feedback.get("blockReason").unwrap(), "SAFETY");
}
