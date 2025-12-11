//! Integration tests for content generation service.

use integrations_gemini::mocks::{MockAuthManager, MockHttpTransport};
use integrations_gemini::services::content::ContentServiceImpl;
use integrations_gemini::services::ContentService;
use integrations_gemini::observability::{create_noop_stack, GeminiMetrics};
use integrations_gemini::types::{
    Content, Part, Role, GenerateContentRequest, CountTokensRequest,
    GenerationConfig, SafetySetting, HarmCategory, HarmBlockThreshold,
    FinishReason, BlockReason,
};
use integrations_gemini::{GeminiConfig, GeminiError};
use secrecy::SecretString;
use std::sync::Arc;
use bytes::Bytes;

/// Helper to create a test content service with mock transport.
fn create_test_service(transport: Arc<MockHttpTransport>) -> ContentServiceImpl {
    let config = Arc::new(
        GeminiConfig::builder()
            .api_key(SecretString::new("test-key".into()))
            .build()
            .unwrap()
    );

    let auth_manager = Arc::new(MockAuthManager::new("test-key"));
    let (logger, tracer, _metrics_recorder) = create_noop_stack();
    let metrics = GeminiMetrics::new(Arc::new(_metrics_recorder));

    ContentServiceImpl::new(config, transport, auth_manager, logger, tracer, metrics)
}

#[tokio::test]
async fn test_generate_content_success() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let success_json = r#"{
        "candidates": [{
            "content": {
                "parts": [{"text": "The capital of France is Paris."}],
                "role": "model"
            },
            "finishReason": "STOP",
            "index": 0,
            "safetyRatings": [
                {"category": "HARM_CATEGORY_HARASSMENT", "probability": "NEGLIGIBLE"}
            ]
        }],
        "usageMetadata": {
            "promptTokenCount": 10,
            "candidatesTokenCount": 8,
            "totalTokenCount": 18
        }
    }"#;
    transport.enqueue_json_response(200, success_json);

    let service = create_test_service(transport.clone());
    let request = GenerateContentRequest {
        contents: vec![Content {
            role: Some(Role::User),
            parts: vec![Part::Text { text: "What is the capital of France?".to_string() }],
        }],
        system_instruction: None,
        tools: None,
        tool_config: None,
        safety_settings: None,
        generation_config: None,
        cached_content: None,
    };

    // Act
    let response = service.generate("gemini-1.5-pro", request).await;

    // Assert
    assert!(response.is_ok(), "Expected successful response");
    let response = response.unwrap();
    assert!(response.candidates.is_some());
    let candidates = response.candidates.unwrap();
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].finish_reason, Some(FinishReason::Stop));

    // Verify usage metadata
    assert!(response.usage_metadata.is_some());
    let usage = response.usage_metadata.unwrap();
    assert_eq!(usage.prompt_token_count, 10);
    assert_eq!(usage.candidates_token_count, Some(8));
    assert_eq!(usage.total_token_count, 18);

    // Verify request was made
    transport.verify_request_count(1);
    transport.verify_request(0, integrations_gemini::transport::HttpMethod::Post, "generateContent");
}

#[tokio::test]
async fn test_generate_content_with_generation_config() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    transport.enqueue_json_response(200, r#"{
        "candidates": [{"content": {"parts": [{"text": "Response"}], "role": "model"}}],
        "usageMetadata": {"promptTokenCount": 5, "totalTokenCount": 10}
    }"#);

    let service = create_test_service(transport.clone());
    let request = GenerateContentRequest {
        contents: vec![Content {
            role: Some(Role::User),
            parts: vec![Part::Text { text: "Hello".to_string() }],
        }],
        system_instruction: None,
        tools: None,
        tool_config: None,
        safety_settings: None,
        generation_config: Some(GenerationConfig {
            temperature: Some(0.7),
            top_p: Some(0.9),
            top_k: Some(40),
            max_output_tokens: Some(2048),
            stop_sequences: None,
            candidate_count: Some(1),
            response_mime_type: None,
            response_schema: None,
        }),
        cached_content: None,
    };

    // Act
    let response = service.generate("gemini-1.5-pro", request).await;

    // Assert
    assert!(response.is_ok());

    // Verify the request body contains generation config
    let requests = transport.get_requests();
    assert_eq!(requests.len(), 1);
    let body = requests[0].body.as_ref().unwrap();
    let body_str = String::from_utf8_lossy(body);
    assert!(body_str.contains("temperature"));
    assert!(body_str.contains("0.7"));
}

#[tokio::test]
async fn test_generate_content_safety_blocked() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let safety_blocked_json = r#"{
        "promptFeedback": {
            "blockReason": "SAFETY",
            "safetyRatings": [
                {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "probability": "HIGH"}
            ]
        }
    }"#;
    transport.enqueue_json_response(200, safety_blocked_json);

    let service = create_test_service(transport.clone());
    let request = GenerateContentRequest {
        contents: vec![Content {
            role: Some(Role::User),
            parts: vec![Part::Text { text: "Unsafe content".to_string() }],
        }],
        system_instruction: None,
        tools: None,
        tool_config: None,
        safety_settings: None,
        generation_config: None,
        cached_content: None,
    };

    // Act
    let response = service.generate("gemini-1.5-pro", request).await;

    // Assert
    assert!(response.is_err(), "Expected safety block error");
    match response.unwrap_err() {
        GeminiError::Content(integrations_gemini::error::ContentError::SafetyBlocked { reason, safety_ratings }) => {
            assert!(reason.contains("Safety"));
            assert_eq!(safety_ratings.len(), 1);
        }
        e => panic!("Expected ContentError::SafetyBlocked, got {:?}", e),
    }
}

#[tokio::test]
async fn test_generate_content_recitation_blocked() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let recitation_json = r#"{
        "candidates": [{
            "content": {"parts": [], "role": "model"},
            "finishReason": "RECITATION",
            "safetyRatings": []
        }]
    }"#;
    transport.enqueue_json_response(200, recitation_json);

    let service = create_test_service(transport.clone());
    let request = GenerateContentRequest {
        contents: vec![Content {
            role: Some(Role::User),
            parts: vec![Part::Text { text: "Test".to_string() }],
        }],
        system_instruction: None,
        tools: None,
        tool_config: None,
        safety_settings: None,
        generation_config: None,
        cached_content: None,
    };

    // Act
    let response = service.generate("gemini-1.5-pro", request).await;

    // Assert
    assert!(response.is_err(), "Expected recitation block error");
    match response.unwrap_err() {
        GeminiError::Content(integrations_gemini::error::ContentError::RecitationBlocked { .. }) => {
            // Expected
        }
        e => panic!("Expected ContentError::RecitationBlocked, got {:?}", e),
    }
}

#[tokio::test]
async fn test_generate_content_validation_error_empty_contents() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    let request = GenerateContentRequest {
        contents: vec![], // Empty contents - invalid
        system_instruction: None,
        tools: None,
        tool_config: None,
        safety_settings: None,
        generation_config: None,
        cached_content: None,
    };

    // Act
    let response = service.generate("gemini-1.5-pro", request).await;

    // Assert
    assert!(response.is_err(), "Expected validation error");
    match response.unwrap_err() {
        GeminiError::Request(integrations_gemini::error::RequestError::ValidationError { message, details }) => {
            assert!(message.contains("Invalid generate content request"));
            assert!(!details.is_empty());
        }
        e => panic!("Expected RequestError::ValidationError, got {:?}", e),
    }
}

#[tokio::test]
async fn test_generate_content_validation_error_empty_parts() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    let request = GenerateContentRequest {
        contents: vec![Content {
            role: Some(Role::User),
            parts: vec![], // Empty parts - invalid
        }],
        system_instruction: None,
        tools: None,
        tool_config: None,
        safety_settings: None,
        generation_config: None,
        cached_content: None,
    };

    // Act
    let response = service.generate("gemini-1.5-pro", request).await;

    // Assert
    assert!(response.is_err(), "Expected validation error");
}

#[tokio::test]
async fn test_generate_content_validation_error_invalid_temperature() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    let request = GenerateContentRequest {
        contents: vec![Content {
            role: Some(Role::User),
            parts: vec![Part::Text { text: "Hello".to_string() }],
        }],
        system_instruction: None,
        tools: None,
        tool_config: None,
        safety_settings: None,
        generation_config: Some(GenerationConfig {
            temperature: Some(3.0), // Invalid: max is 2.0
            top_p: None,
            top_k: None,
            max_output_tokens: None,
            stop_sequences: None,
            candidate_count: None,
            response_mime_type: None,
            response_schema: None,
        }),
        cached_content: None,
    };

    // Act
    let response = service.generate("gemini-1.5-pro", request).await;

    // Assert
    assert!(response.is_err(), "Expected validation error for invalid temperature");
}

#[tokio::test]
async fn test_count_tokens_success() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let count_json = r#"{
        "totalTokens": 25
    }"#;
    transport.enqueue_json_response(200, count_json);

    let service = create_test_service(transport.clone());
    let request = CountTokensRequest {
        contents: Some(vec![Content {
            role: Some(Role::User),
            parts: vec![Part::Text { text: "Hello, how are you?".to_string() }],
        }]),
        generate_content_request: None,
    };

    // Act
    let response = service.count_tokens("gemini-1.5-pro", request).await;

    // Assert
    assert!(response.is_ok());
    let response = response.unwrap();
    assert_eq!(response.total_tokens, 25);

    // Verify request
    transport.verify_request_count(1);
    transport.verify_request(0, integrations_gemini::transport::HttpMethod::Post, "countTokens");
}

#[tokio::test]
async fn test_generate_stream_success() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());

    // Gemini streaming format: array of JSON objects
    let stream_chunk1 = Bytes::from(r#"[{"candidates":[{"content":{"parts":[{"text":"Hello"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":1,"totalTokenCount":6}},"#);
    let stream_chunk2 = Bytes::from(r#"{"candidates":[{"content":{"parts":[{"text":" world"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":2,"totalTokenCount":7}}]"#);

    transport.enqueue_streaming_response(vec![stream_chunk1, stream_chunk2]);

    let service = create_test_service(transport.clone());
    let request = GenerateContentRequest {
        contents: vec![Content {
            role: Some(Role::User),
            parts: vec![Part::Text { text: "Say hello".to_string() }],
        }],
        system_instruction: None,
        tools: None,
        tool_config: None,
        safety_settings: None,
        generation_config: None,
        cached_content: None,
    };

    // Act
    let stream = service.generate_stream("gemini-1.5-pro", request).await;

    // Assert
    assert!(stream.is_ok());
    let mut stream = stream.unwrap();

    use futures::StreamExt;
    let mut chunk_count = 0;
    while let Some(result) = stream.next().await {
        assert!(result.is_ok(), "Stream chunk should be valid");
        chunk_count += 1;
    }

    assert_eq!(chunk_count, 2, "Should receive 2 chunks");

    // Verify request was made to streaming endpoint
    transport.verify_request_count(1);
    transport.verify_request(0, integrations_gemini::transport::HttpMethod::Post, "streamGenerateContent");
}

#[tokio::test]
async fn test_generate_network_error() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    transport.enqueue_error(integrations_gemini::transport::TransportError::Connection {
        message: "Network connection failed".to_string(),
        source: None,
    });

    let service = create_test_service(transport);
    let request = GenerateContentRequest {
        contents: vec![Content {
            role: Some(Role::User),
            parts: vec![Part::Text { text: "Hello".to_string() }],
        }],
        system_instruction: None,
        tools: None,
        tool_config: None,
        safety_settings: None,
        generation_config: None,
        cached_content: None,
    };

    // Act
    let response = service.generate("gemini-1.5-pro", request).await;

    // Assert
    assert!(response.is_err());
    match response.unwrap_err() {
        GeminiError::Network(_) => {
            // Expected
        }
        e => panic!("Expected NetworkError, got {:?}", e),
    }
}

#[tokio::test]
async fn test_generate_with_system_instruction() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    transport.enqueue_json_response(200, r#"{
        "candidates": [{"content": {"parts": [{"text": "I am a helpful assistant."}], "role": "model"}}],
        "usageMetadata": {"promptTokenCount": 10, "totalTokenCount": 15}
    }"#);

    let service = create_test_service(transport.clone());
    let request = GenerateContentRequest {
        contents: vec![Content {
            role: Some(Role::User),
            parts: vec![Part::Text { text: "Who are you?".to_string() }],
        }],
        system_instruction: Some(Content {
            role: None,
            parts: vec![Part::Text { text: "You are a helpful AI assistant.".to_string() }],
        }),
        tools: None,
        tool_config: None,
        safety_settings: None,
        generation_config: None,
        cached_content: None,
    };

    // Act
    let response = service.generate("gemini-1.5-pro", request).await;

    // Assert
    assert!(response.is_ok());

    // Verify request includes system instruction
    let requests = transport.get_requests();
    let body = requests[0].body.as_ref().unwrap();
    let body_str = String::from_utf8_lossy(body);
    assert!(body_str.contains("systemInstruction"));
    assert!(body_str.contains("helpful AI assistant"));
}
