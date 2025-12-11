//! Integration tests for embeddings service.

use integrations_gemini::mocks::{MockAuthManager, MockHttpTransport};
use integrations_gemini::services::embeddings::EmbeddingsServiceImpl;
use integrations_gemini::services::EmbeddingsService;
use integrations_gemini::types::{Content, Part, EmbedContentRequest, TaskType};
use integrations_gemini::{GeminiConfig, GeminiError};
use secrecy::SecretString;
use std::sync::Arc;

/// Helper to create a test embeddings service with mock transport.
fn create_test_service(transport: Arc<MockHttpTransport>) -> EmbeddingsServiceImpl {
    let config = Arc::new(
        GeminiConfig::builder()
            .api_key(SecretString::new("test-key".into()))
            .build()
            .unwrap()
    );

    let auth_manager = Arc::new(MockAuthManager::new("test-key"));

    EmbeddingsServiceImpl::new(config, transport, auth_manager)
}

#[tokio::test]
async fn test_embed_single_success() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let embed_json = r#"{
        "embedding": {
            "values": [0.1, 0.2, 0.3, 0.4, 0.5]
        }
    }"#;
    transport.enqueue_json_response(200, embed_json);

    let service = create_test_service(transport.clone());
    let request = EmbedContentRequest {
        model: "text-embedding-004".to_string(),
        content: Content {
            role: None,
            parts: vec![Part::Text { text: "Hello world".to_string() }],
        },
        task_type: None,
        title: None,
        output_dimensionality: None,
    };

    // Act
    let response = service.embed("text-embedding-004", request).await;

    // Assert
    assert!(response.is_ok(), "Expected successful embedding response");
    let response = response.unwrap();
    assert_eq!(response.embedding.values.len(), 5);
    assert_eq!(response.embedding.values[0], 0.1);

    // Verify request was made
    transport.verify_request_count(1);
    transport.verify_request(0, integrations_gemini::transport::HttpMethod::Post, "embedContent");
}

#[tokio::test]
async fn test_embed_with_task_type() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    transport.enqueue_json_response(200, r#"{"embedding": {"values": [0.1, 0.2]}}"#);

    let service = create_test_service(transport.clone());
    let request = EmbedContentRequest {
        model: "text-embedding-004".to_string(),
        content: Content {
            role: None,
            parts: vec![Part::Text { text: "Search query".to_string() }],
        },
        task_type: Some(TaskType::RetrievalQuery),
        title: None,
        output_dimensionality: None,
    };

    // Act
    let response = service.embed("text-embedding-004", request).await;

    // Assert
    assert!(response.is_ok());

    // Verify request includes task type
    let requests = transport.get_requests();
    let body = requests[0].body.as_ref().unwrap();
    let body_str = String::from_utf8_lossy(body);
    assert!(body_str.contains("taskType"));
    assert!(body_str.contains("RETRIEVAL_QUERY"));
}

#[tokio::test]
async fn test_embed_with_retrieval_document_and_title() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    transport.enqueue_json_response(200, r#"{"embedding": {"values": [0.1]}}"#);

    let service = create_test_service(transport.clone());
    let request = EmbedContentRequest {
        model: "text-embedding-004".to_string(),
        content: Content {
            role: None,
            parts: vec![Part::Text { text: "Document content".to_string() }],
        },
        task_type: Some(TaskType::RetrievalDocument),
        title: Some("My Document".to_string()),
        output_dimensionality: None,
    };

    // Act
    let response = service.embed("text-embedding-004", request).await;

    // Assert
    assert!(response.is_ok());

    // Verify request includes title
    let requests = transport.get_requests();
    let body = requests[0].body.as_ref().unwrap();
    let body_str = String::from_utf8_lossy(body);
    assert!(body_str.contains("title"));
    assert!(body_str.contains("My Document"));
}

#[tokio::test]
async fn test_embed_with_output_dimensionality() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    transport.enqueue_json_response(200, r#"{"embedding": {"values": [0.1, 0.2]}}"#);

    let service = create_test_service(transport.clone());
    let request = EmbedContentRequest {
        model: "text-embedding-004".to_string(),
        content: Content {
            role: None,
            parts: vec![Part::Text { text: "Test".to_string() }],
        },
        task_type: None,
        title: None,
        output_dimensionality: Some(256),
    };

    // Act
    let response = service.embed("text-embedding-004", request).await;

    // Assert
    assert!(response.is_ok());

    // Verify request includes dimensionality
    let requests = transport.get_requests();
    let body = requests[0].body.as_ref().unwrap();
    let body_str = String::from_utf8_lossy(body);
    assert!(body_str.contains("outputDimensionality"));
    assert!(body_str.contains("256"));
}

#[tokio::test]
async fn test_embed_validation_error_empty_parts() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    let request = EmbedContentRequest {
        model: "text-embedding-004".to_string(),
        content: Content {
            role: None,
            parts: vec![], // Empty parts - invalid
        },
        task_type: None,
        title: None,
        output_dimensionality: None,
    };

    // Act
    let response = service.embed("text-embedding-004", request).await;

    // Assert
    assert!(response.is_err(), "Expected validation error");
    match response.unwrap_err() {
        GeminiError::Request(integrations_gemini::error::RequestError::ValidationError { .. }) => {
            // Expected
        }
        e => panic!("Expected RequestError::ValidationError, got {:?}", e),
    }
}

#[tokio::test]
async fn test_embed_validation_error_empty_text() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    let request = EmbedContentRequest {
        model: "text-embedding-004".to_string(),
        content: Content {
            role: None,
            parts: vec![Part::Text { text: "".to_string() }], // Empty text - invalid
        },
        task_type: None,
        title: None,
        output_dimensionality: None,
    };

    // Act
    let response = service.embed("text-embedding-004", request).await;

    // Assert
    assert!(response.is_err(), "Expected validation error");
}

#[tokio::test]
async fn test_embed_validation_error_non_text_part() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    let request = EmbedContentRequest {
        model: "text-embedding-004".to_string(),
        content: Content {
            role: None,
            parts: vec![Part::InlineData {
                inline_data: integrations_gemini::types::Blob {
                    mime_type: "image/png".to_string(),
                    data: "base64data".to_string(),
                },
            }], // Non-text part - invalid for embeddings
        },
        task_type: None,
        title: None,
        output_dimensionality: None,
    };

    // Act
    let response = service.embed("text-embedding-004", request).await;

    // Assert
    assert!(response.is_err(), "Expected validation error for non-text part");
}

#[tokio::test]
async fn test_embed_validation_error_invalid_dimensionality() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    let request = EmbedContentRequest {
        model: "text-embedding-004".to_string(),
        content: Content {
            role: None,
            parts: vec![Part::Text { text: "Hello".to_string() }],
        },
        task_type: None,
        title: None,
        output_dimensionality: Some(1000), // Invalid: max is 768
    };

    // Act
    let response = service.embed("text-embedding-004", request).await;

    // Assert
    assert!(response.is_err(), "Expected validation error for invalid dimensionality");
}

#[tokio::test]
async fn test_embed_validation_error_title_without_retrieval_document() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    let request = EmbedContentRequest {
        model: "text-embedding-004".to_string(),
        content: Content {
            role: None,
            parts: vec![Part::Text { text: "Hello".to_string() }],
        },
        task_type: Some(TaskType::SemanticSimilarity),
        title: Some("Title".to_string()), // Invalid: title only for RETRIEVAL_DOCUMENT
        output_dimensionality: None,
    };

    // Act
    let response = service.embed("text-embedding-004", request).await;

    // Assert
    assert!(response.is_err(), "Expected validation error for title without RETRIEVAL_DOCUMENT");
}

#[tokio::test]
async fn test_batch_embed_success() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let batch_json = r#"{
        "embeddings": [
            {"values": [0.1, 0.2]},
            {"values": [0.3, 0.4]},
            {"values": [0.5, 0.6]}
        ]
    }"#;
    transport.enqueue_json_response(200, batch_json);

    let service = create_test_service(transport.clone());
    let requests = vec![
        EmbedContentRequest {
            model: "text-embedding-004".to_string(),
            content: Content {
                role: None,
                parts: vec![Part::Text { text: "First text".to_string() }],
            },
            task_type: None,
            title: None,
            output_dimensionality: None,
        },
        EmbedContentRequest {
            model: "text-embedding-004".to_string(),
            content: Content {
                role: None,
                parts: vec![Part::Text { text: "Second text".to_string() }],
            },
            task_type: None,
            title: None,
            output_dimensionality: None,
        },
        EmbedContentRequest {
            model: "text-embedding-004".to_string(),
            content: Content {
                role: None,
                parts: vec![Part::Text { text: "Third text".to_string() }],
            },
            task_type: None,
            title: None,
            output_dimensionality: None,
        },
    ];

    // Act
    let response = service.batch_embed("text-embedding-004", requests).await;

    // Assert
    assert!(response.is_ok(), "Expected successful batch embedding response");
    let response = response.unwrap();
    assert_eq!(response.embeddings.len(), 3);

    // Verify request was made to batch endpoint
    transport.verify_request_count(1);
    transport.verify_request(0, integrations_gemini::transport::HttpMethod::Post, "batchEmbedContents");
}

#[tokio::test]
async fn test_batch_embed_validation_error_empty_batch() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    // Act
    let response = service.batch_embed("text-embedding-004", vec![]).await;

    // Assert
    assert!(response.is_err(), "Expected validation error for empty batch");
    match response.unwrap_err() {
        GeminiError::Request(integrations_gemini::error::RequestError::ValidationError { .. }) => {
            // Expected
        }
        e => panic!("Expected RequestError::ValidationError, got {:?}", e),
    }
}

#[tokio::test]
async fn test_batch_embed_validation_error_batch_too_large() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let service = create_test_service(transport);

    // Create 101 requests (max is 100)
    let requests: Vec<_> = (0..101)
        .map(|i| EmbedContentRequest {
            model: "text-embedding-004".to_string(),
            content: Content {
                role: None,
                parts: vec![Part::Text { text: format!("Text {}", i) }],
            },
            task_type: None,
            title: None,
            output_dimensionality: None,
        })
        .collect();

    // Act
    let response = service.batch_embed("text-embedding-004", requests).await;

    // Assert
    assert!(response.is_err(), "Expected validation error for batch size exceeding limit");
}

#[tokio::test]
async fn test_embed_api_error_401() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let error_json = r#"{
        "error": {
            "code": 401,
            "message": "Invalid API key",
            "status": "UNAUTHENTICATED"
        }
    }"#;
    transport.enqueue_json_response(401, error_json);

    let service = create_test_service(transport);
    let request = EmbedContentRequest {
        model: "text-embedding-004".to_string(),
        content: Content {
            role: None,
            parts: vec![Part::Text { text: "Hello".to_string() }],
        },
        task_type: None,
        title: None,
        output_dimensionality: None,
    };

    // Act
    let response = service.embed("text-embedding-004", request).await;

    // Assert
    assert!(response.is_err());
    match response.unwrap_err() {
        GeminiError::Authentication(_) => {
            // Expected
        }
        e => panic!("Expected AuthenticationError, got {:?}", e),
    }
}

#[tokio::test]
async fn test_embed_api_error_404() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    let error_json = r#"{
        "error": {
            "code": 404,
            "message": "Model not found",
            "status": "NOT_FOUND"
        }
    }"#;
    transport.enqueue_json_response(404, error_json);

    let service = create_test_service(transport);
    let request = EmbedContentRequest {
        model: "invalid-model".to_string(),
        content: Content {
            role: None,
            parts: vec![Part::Text { text: "Hello".to_string() }],
        },
        task_type: None,
        title: None,
        output_dimensionality: None,
    };

    // Act
    let response = service.embed("invalid-model", request).await;

    // Assert
    assert!(response.is_err());
    match response.unwrap_err() {
        GeminiError::Request(integrations_gemini::error::RequestError::InvalidModel { .. }) => {
            // Expected
        }
        e => panic!("Expected RequestError::InvalidModel, got {:?}", e),
    }
}

#[tokio::test]
async fn test_embed_network_error() {
    // Arrange
    let transport = Arc::new(MockHttpTransport::new());
    transport.enqueue_error(integrations_gemini::transport::TransportError::Connection {
        message: "Connection timeout".to_string(),
        source: None,
    });

    let service = create_test_service(transport);
    let request = EmbedContentRequest {
        model: "text-embedding-004".to_string(),
        content: Content {
            role: None,
            parts: vec![Part::Text { text: "Hello".to_string() }],
        },
        task_type: None,
        title: None,
        output_dimensionality: None,
    };

    // Act
    let response = service.embed("text-embedding-004", request).await;

    // Assert
    assert!(response.is_err());
    match response.unwrap_err() {
        GeminiError::Network(_) => {
            // Expected
        }
        e => panic!("Expected NetworkError, got {:?}", e),
    }
}
