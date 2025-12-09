//! Unit tests for fine-tuning service

use super::*;
use crate::errors::OpenAIError;
use crate::mocks::{MockAuthManager, MockHttpTransport, MockResilienceOrchestrator};
use http::Method;
use serde_json::json;
use std::sync::Arc;

fn create_test_service(
    transport: MockHttpTransport,
    auth: MockAuthManager,
    resilience: MockResilienceOrchestrator,
) -> FineTuningServiceImpl {
    FineTuningServiceImpl::new(Arc::new(transport), Arc::new(auth), Arc::new(resilience))
}

fn fine_tuning_job_response() -> serde_json::Value {
    json!({
        "id": "ftjob-abc123",
        "object": "fine_tuning.job",
        "model": "gpt-3.5-turbo-0613",
        "created_at": 1677610602,
        "finished_at": null,
        "fine_tuned_model": null,
        "organization_id": "org-123",
        "result_files": [],
        "status": "pending",
        "validation_file": null,
        "training_file": "file-abc123"
    })
}

#[tokio::test]
async fn test_create_fine_tuning_job_success() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(fine_tuning_job_response());

    let service = create_test_service(
        mock_transport.clone(),
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = FineTuningJobRequest {
        training_file: "file-abc123".to_string(),
        model: "gpt-3.5-turbo".to_string(),
        hyperparameters: None,
        suffix: None,
        validation_file: None,
    };

    let result = service.create(request).await;

    assert!(result.is_ok());
    let job = result.unwrap();
    assert_eq!(job.id, "ftjob-abc123");
    assert!(mock_transport.verify_request(Method::POST, "/fine_tuning/jobs"));
}

#[tokio::test]
async fn test_list_fine_tuning_jobs_success() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(json!({
            "object": "list",
            "data": [fine_tuning_job_response()],
            "has_more": false
        }));

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let result = service.list(None, None).await;

    assert!(result.is_ok());
    let response = result.unwrap();
    assert_eq!(response.data.len(), 1);
}

#[tokio::test]
async fn test_retrieve_fine_tuning_job_success() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(fine_tuning_job_response());

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let result = service.retrieve("ftjob-abc123").await;

    assert!(result.is_ok());
    let job = result.unwrap();
    assert_eq!(job.id, "ftjob-abc123");
}

#[tokio::test]
async fn test_cancel_fine_tuning_job_success() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(fine_tuning_job_response());

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let result = service.cancel("ftjob-abc123").await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_create_fine_tuning_job_authentication_error() {
    let mock_transport = MockHttpTransport::new();
    let mock_auth = MockAuthManager::new().with_error("Invalid API key");

    let service = create_test_service(mock_transport, mock_auth, MockResilienceOrchestrator::passthrough());

    let request = FineTuningJobRequest {
        training_file: "file-abc123".to_string(),
        model: "gpt-3.5-turbo".to_string(),
        hyperparameters: None,
        suffix: None,
        validation_file: None,
    };

    let result = service.create(request).await;
    assert!(result.is_err());
}
