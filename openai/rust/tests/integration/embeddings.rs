//! Integration tests for embeddings

use super::*;
use integrations_openai::prelude::*;
use integrations_openai::services::embeddings::EmbeddingsRequest;
use serde_json::json;
use wiremock::matchers::{method, path};
use wiremock::{Mock, ResponseTemplate};

#[tokio::test]
async fn test_embeddings_integration_success() {
    let mock_server = setup_mock_server().await;

    let response_body = json!({
        "object": "list",
        "data": [{
            "object": "embedding",
            "embedding": vec![0.0023064255; 1536],
            "index": 0
        }],
        "model": "text-embedding-ada-002",
        "usage": {
            "prompt_tokens": 8,
            "total_tokens": 8
        }
    });

    Mock::given(method("POST"))
        .and(path("/embeddings"))
        .respond_with(ResponseTemplate::new(200).set_body_json(response_body))
        .mount(&mock_server)
        .await;

    let config = OpenAIConfig {
        api_key: "test-api-key".to_string(),
        base_url: Some(mock_server.uri()),
        ..Default::default()
    };

    let client = OpenAIClientBuilder::new()
        .with_config(config)
        .build()
        .expect("Failed to build client");

    let request = EmbeddingsRequest {
        model: "text-embedding-ada-002".to_string(),
        input: vec!["Test input".to_string()],
        encoding_format: None,
        dimensions: None,
        user: None,
    };

    let result = client.embeddings().create(request).await;

    assert!(result.is_ok());
    let response = result.unwrap();
    assert_eq!(response.model, "text-embedding-ada-002");
    assert_eq!(response.data.len(), 1);
}

#[tokio::test]
async fn test_embeddings_integration_multiple_inputs() {
    let mock_server = setup_mock_server().await;

    let response_body = json!({
        "object": "list",
        "data": [
            {
                "object": "embedding",
                "embedding": vec![0.001; 1536],
                "index": 0
            },
            {
                "object": "embedding",
                "embedding": vec![0.002; 1536],
                "index": 1
            }
        ],
        "model": "text-embedding-ada-002",
        "usage": {
            "prompt_tokens": 16,
            "total_tokens": 16
        }
    });

    Mock::given(method("POST"))
        .and(path("/embeddings"))
        .respond_with(ResponseTemplate::new(200).set_body_json(response_body))
        .mount(&mock_server)
        .await;

    let config = OpenAIConfig {
        api_key: "test-api-key".to_string(),
        base_url: Some(mock_server.uri()),
        ..Default::default()
    };

    let client = OpenAIClientBuilder::new()
        .with_config(config)
        .build()
        .expect("Failed to build client");

    let request = EmbeddingsRequest {
        model: "text-embedding-ada-002".to_string(),
        input: vec!["First input".to_string(), "Second input".to_string()],
        encoding_format: None,
        dimensions: None,
        user: None,
    };

    let result = client.embeddings().create(request).await;

    assert!(result.is_ok());
    let response = result.unwrap();
    assert_eq!(response.data.len(), 2);
}

#[tokio::test]
async fn test_embeddings_integration_rate_limit() {
    let mock_server = setup_mock_server().await;

    let error_body = json!({
        "error": {
            "message": "Rate limit exceeded",
            "type": "rate_limit_error",
            "code": "rate_limit_exceeded"
        }
    });

    Mock::given(method("POST"))
        .and(path("/embeddings"))
        .respond_with(ResponseTemplate::new(429).set_body_json(error_body))
        .mount(&mock_server)
        .await;

    let config = OpenAIConfig {
        api_key: "test-api-key".to_string(),
        base_url: Some(mock_server.uri()),
        ..Default::default()
    };

    let client = OpenAIClientBuilder::new()
        .with_config(config)
        .build()
        .expect("Failed to build client");

    let request = EmbeddingsRequest {
        model: "text-embedding-ada-002".to_string(),
        input: vec!["Test".to_string()],
        encoding_format: None,
        dimensions: None,
        user: None,
    };

    let result = client.embeddings().create(request).await;

    assert!(result.is_err());
}
