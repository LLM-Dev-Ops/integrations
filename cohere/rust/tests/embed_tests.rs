//! Tests for the Embed service.

use cohere_client::fixtures::{embed_response, embed_response_multi_type};
use cohere_client::mocks::{MockClientBuilder, MockResponse};
use cohere_client::services::embed::{EmbedRequest, EmbedServiceImpl, InputType};
use cohere_client::errors::CohereError;

#[tokio::test]
async fn test_embed_creates_embeddings() {
    let mock_response = embed_response();
    let (service, transport) = MockClientBuilder::new()
        .with_response(MockResponse::json(&mock_response))
        .build(|t, a, u| EmbedServiceImpl::new(t, a, u));

    let request = EmbedRequest::new(vec!["Hello", "World"]);
    let result = service.embed(request).await.unwrap();

    assert!(result.embeddings.is_some());
    let embeddings = result.embeddings.unwrap();
    assert_eq!(embeddings.len(), 2);

    let requests = transport.get_requests();
    assert_eq!(requests.len(), 1);
    assert!(requests[0].url.contains("/embed"));
}

#[tokio::test]
async fn test_embed_with_input_type() {
    let (service, transport) = MockClientBuilder::new()
        .with_response(MockResponse::json(&embed_response()))
        .build(|t, a, u| EmbedServiceImpl::new(t, a, u));

    let request = EmbedRequest::new(vec!["Query text"])
        .input_type(InputType::SearchQuery);

    let _ = service.embed(request).await.unwrap();

    let requests = transport.get_requests();
    let body = requests[0].body.as_ref().unwrap();
    let body_str = String::from_utf8_lossy(body);
    assert!(body_str.contains("search_query"));
}

#[tokio::test]
async fn test_embed_with_multiple_types() {
    let mock_response = embed_response_multi_type();
    let (service, _) = MockClientBuilder::new()
        .with_response(MockResponse::json(&mock_response))
        .build(|t, a, u| EmbedServiceImpl::new(t, a, u));

    let request = EmbedRequest::new(vec!["Test text"])
        .embedding_types(vec!["float", "int8"]);

    let result = service.embed(request).await.unwrap();

    assert!(result.embeddings_by_type.is_some());
    let by_type = result.embeddings_by_type.unwrap();
    assert!(by_type.float.is_some());
    assert!(by_type.int8.is_some());
}

#[tokio::test]
async fn test_embed_validation_empty_texts() {
    let (service, _) = MockClientBuilder::new()
        .with_response(MockResponse::json(&embed_response()))
        .build(|t, a, u| EmbedServiceImpl::new(t, a, u));

    let request = EmbedRequest::new(Vec::<String>::new());
    let result = service.embed(request).await;

    assert!(result.is_err());
    match result.unwrap_err() {
        CohereError::Validation { .. } => {}
        other => panic!("Expected validation error, got {:?}", other),
    }
}

#[tokio::test]
async fn test_embed_validation_too_many_texts() {
    let (service, _) = MockClientBuilder::new()
        .with_response(MockResponse::json(&embed_response()))
        .build(|t, a, u| EmbedServiceImpl::new(t, a, u));

    let texts: Vec<&str> = (0..100).map(|_| "text").collect();
    let request = EmbedRequest::new(texts);
    let result = service.embed(request).await;

    assert!(result.is_err());
    match result.unwrap_err() {
        CohereError::Validation { .. } => {}
        other => panic!("Expected validation error, got {:?}", other),
    }
}

#[tokio::test]
async fn test_embed_job_create() {
    let job_response = serde_json::json!({
        "job_id": "job-123",
        "status": "processing"
    });

    let (service, transport) = MockClientBuilder::new()
        .with_response(MockResponse::json(&job_response))
        .build(|t, a, u| EmbedServiceImpl::new(t, a, u));

    let request = cohere_client::services::embed::EmbedJobRequest {
        dataset_id: "dataset-123".to_string(),
        model: Some("embed-english-v3.0".to_string()),
        input_type: None,
        embedding_types: None,
        truncate: None,
        name: None,
    };

    let result = service.create_job(request).await.unwrap();

    assert_eq!(result.job_id, "job-123");
    assert!(matches!(result.status, cohere_client::services::embed::EmbedJobStatus::Processing));

    let requests = transport.get_requests();
    assert!(requests[0].url.contains("/embed-jobs"));
}

#[tokio::test]
async fn test_embed_job_get() {
    let job_response = serde_json::json!({
        "job_id": "job-123",
        "status": "complete",
        "output_dataset_id": "output-123"
    });

    let (service, transport) = MockClientBuilder::new()
        .with_response(MockResponse::json(&job_response))
        .build(|t, a, u| EmbedServiceImpl::new(t, a, u));

    let result = service.get_job("job-123").await.unwrap();

    assert_eq!(result.job_id, "job-123");
    assert!(matches!(result.status, cohere_client::services::embed::EmbedJobStatus::Complete));
    assert_eq!(result.output_dataset_id, Some("output-123".to_string()));

    let requests = transport.get_requests();
    assert!(requests[0].url.contains("/embed-jobs/job-123"));
}

#[tokio::test]
async fn test_embed_job_list() {
    let list_response = serde_json::json!({
        "embed_jobs": [
            { "job_id": "job-1", "status": "complete" },
            { "job_id": "job-2", "status": "processing" }
        ]
    });

    let (service, _) = MockClientBuilder::new()
        .with_response(MockResponse::json(&list_response))
        .build(|t, a, u| EmbedServiceImpl::new(t, a, u));

    let result = service.list_jobs().await.unwrap();

    assert_eq!(result.len(), 2);
    assert_eq!(result[0].job_id, "job-1");
    assert_eq!(result[1].job_id, "job-2");
}

#[tokio::test]
async fn test_embed_job_cancel() {
    let (service, transport) = MockClientBuilder::new()
        .with_response(MockResponse::json(&serde_json::json!({})))
        .build(|t, a, u| EmbedServiceImpl::new(t, a, u));

    let result = service.cancel_job("job-123").await;

    assert!(result.is_ok());

    let requests = transport.get_requests();
    assert!(requests[0].url.contains("/embed-jobs/job-123/cancel"));
}
