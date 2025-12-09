# Quick Test Reference Card

## Import Statements

```rust
// In service tests
use super::*;
use crate::errors::OpenAIError;
use crate::fixtures::*;
use crate::mocks::{MockAuthManager, MockHttpTransport, MockResilienceOrchestrator};
use http::Method;
use std::sync::Arc;

// In integration tests
use integrations_openai::prelude::*;
use serde_json::json;
use wiremock::matchers::{method, path};
use wiremock::{Mock, ResponseTemplate};
```

## Common Test Patterns

### Basic Service Test

```rust
#[tokio::test]
async fn test_service_operation_success() {
    // Arrange
    let mock_transport = MockHttpTransport::new()
        .with_json_response(fixture_response());

    let service = create_test_service(
        mock_transport.clone(),
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = /* create request */;

    // Act
    let result = service.operation(request).await;

    // Assert
    assert!(result.is_ok());
    assert!(mock_transport.verify_request(Method::POST, "/endpoint"));
}
```

### Error Test

```rust
#[tokio::test]
async fn test_service_operation_error() {
    let mock_transport = MockHttpTransport::new()
        .with_error_response(OpenAIError::rate_limit("Rate limit"));

    let service = create_test_service(
        mock_transport,
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let result = service.operation(request).await;

    assert!(result.is_err());
    matches!(result.unwrap_err(), OpenAIError::RateLimit { .. });
}
```

### Authentication Error Test

```rust
#[tokio::test]
async fn test_service_operation_auth_error() {
    let mock_transport = MockHttpTransport::new();
    let mock_auth = MockAuthManager::new()
        .with_error("Invalid API key");

    let service = create_test_service(
        mock_transport.clone(),
        mock_auth,
        MockResilienceOrchestrator::passthrough(),
    );

    let result = service.operation(request).await;

    assert!(result.is_err());
    assert_eq!(mock_transport.request_count(), 0); // No request made
}
```

### Integration Test

```rust
#[tokio::test]
async fn test_integration_operation() {
    let mock_server = setup_mock_server().await;

    Mock::given(method("POST"))
        .and(path("/endpoint"))
        .respond_with(ResponseTemplate::new(200).set_body_json(response))
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
        .unwrap();

    let result = client.service().operation(request).await;
    assert!(result.is_ok());
}
```

## Available Fixtures

### Chat Completions
```rust
chat_completion_response()
chat_completion_response_with_multiple_choices()
chat_completion_response_with_tool_calls()
chat_completion_response_with_length_finish()
chat_completion_response_with_content_filter()
ChatCompletionResponseBuilder::new()...build()
```

### Embeddings
```rust
embeddings_response()
embeddings_response_multiple_inputs()
embeddings_response_3_small()
embeddings_response_3_large()
embeddings_response_custom_dimensions()
EmbeddingsResponseBuilder::new()...build()
```

### Errors
```rust
error_401_invalid_api_key()
error_429_rate_limit()
error_429_quota_exceeded()
error_500_internal_server_error()
error_503_service_unavailable()
error_400_invalid_request()
error_400_missing_parameter()
error_404_not_found()
error_400_context_length_exceeded()
error_403_permission_denied()
error_400_content_policy_violation()
ErrorResponseBuilder::new()...build()
```

### Models
```rust
list_models_response()
retrieve_model_response()
```

### Files
```rust
file_object_response()
list_files_response()
delete_file_response()
```

### Images
```rust
image_generation_response()
image_generation_response_b64()
image_edit_response()
image_variation_response()
```

### Audio
```rust
transcription_response()
transcription_response_verbose()
translation_response()
speech_audio_bytes()
```

### Moderations
```rust
moderation_response_safe()
moderation_response_flagged()
```

### Batches
```rust
batch_response_validating()
batch_response_completed()
list_batches_response()
```

### Streams
```rust
chat_stream_chunk()
chat_stream_chunk_final()
chat_stream_chunk_tool_call()
chat_stream_sequence()
```

## Mock Methods

### MockHttpTransport
```rust
MockHttpTransport::new()
    .with_json_response(json_value)
    .with_error_response(error)
    .with_stream_response(vec![items])
    .with_stream_error(error)
    .with_file_upload_response(result)
    .with_file_download_response(result)

// Verification
mock_transport.verify_request(method, path)
mock_transport.verify_request_with_body(method, path, body_contains)
mock_transport.request_count()
mock_transport.requests()
mock_transport.reset()
```

### MockAuthManager
```rust
MockAuthManager::new()
    .with_error(message)
    .with_success()

// Verification
mock_auth.auth_call_count()
mock_auth.reset()
```

### MockResilienceOrchestrator
```rust
MockResilienceOrchestrator::new()
MockResilienceOrchestrator::passthrough()
    .with_retry(max_retries)
    .with_failure_after(count)

// Verification
mock_resilience.execution_count()
mock_resilience.reset()
```

## Helper Functions

### Service Test Helper
```rust
fn create_test_service(
    transport: MockHttpTransport,
    auth: MockAuthManager,
    resilience: MockResilienceOrchestrator,
) -> ServiceImpl {
    ServiceImpl::new(
        Arc::new(transport),
        Arc::new(auth),
        Arc::new(resilience),
    )
}
```

### Integration Test Helpers
```rust
async fn setup_mock_server() -> MockServer
fn success_response(body: serde_json::Value) -> ResponseTemplate
fn error_response(status: u16, error_body: serde_json::Value) -> ResponseTemplate
```

## Common Commands

```bash
# Run all tests
cargo test

# Run unit tests only
cargo test --lib

# Run integration tests only
cargo test --test '*'

# Run specific service tests
cargo test --lib chat::tests
cargo test --lib embeddings::tests

# Run with output
cargo test -- --nocapture

# Run single test
cargo test test_name

# Run tests matching pattern
cargo test rate_limit

# Show test output
cargo test -- --show-output
```

## Test Checklist

When writing a new test:

- [ ] Import required mocks and fixtures
- [ ] Create test helper function if needed
- [ ] Write test with descriptive name
- [ ] Test happy path
- [ ] Test authentication error
- [ ] Test rate limit error
- [ ] Test invalid request error
- [ ] Verify mock interactions
- [ ] Check request count when needed
- [ ] Use fixtures instead of inline JSON
- [ ] Follow AAA pattern (Arrange, Act, Assert)

## Common Assertions

```rust
// Success
assert!(result.is_ok());
let response = result.unwrap();
assert_eq!(response.id, "expected-id");

// Error
assert!(result.is_err());
matches!(result.unwrap_err(), OpenAIError::Authentication { .. });

// Mock verification
assert!(mock_transport.verify_request(Method::POST, "/endpoint"));
assert_eq!(mock_transport.request_count(), 1);
assert_eq!(mock_auth.auth_call_count(), 1);
assert_eq!(mock_resilience.execution_count(), 1);

// Body verification
assert!(mock_transport.verify_request_with_body(
    Method::POST,
    "/endpoint",
    "expected_string"
));
```

## File Locations

```
Mocks:       src/mocks/
Fixtures:    src/fixtures/
Unit Tests:  src/services/*/tests.rs
Integration: tests/integration/
```

## Quick Tips

1. Always use fixtures for response data
2. Use builder patterns for custom test data
3. Verify mock interactions in assertions
4. Keep tests isolated (no shared state)
5. Use descriptive test names
6. Test both success and error paths
7. Reset mocks between tests if needed
8. Use helper functions to reduce duplication

## Error Types Quick Reference

```rust
OpenAIError::Authentication { message }  // 401
OpenAIError::RateLimit { message }       // 429
OpenAIError::Server { message }          // 500, 503
OpenAIError::InvalidRequest { message }  // 400
OpenAIError::NotFound { message }        // 404
OpenAIError::Internal { message }        // Internal errors
```
