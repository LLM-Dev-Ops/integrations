# OpenAI Integration Testing Guide

This document describes the comprehensive TDD test scaffolds created for the Rust OpenAI integration module, following the London School TDD approach.

## Overview

The test structure includes:
- **Mock Traits**: Isolated testing with mock implementations
- **Test Fixtures**: Reusable sample data and response builders
- **Service Unit Tests**: Comprehensive tests for each service
- **Integration Tests**: End-to-end tests using WireMock

## Test Structure

```
openai/rust/
├── src/
│   ├── mocks/              # Mock implementations for testing
│   │   ├── mod.rs
│   │   ├── mock_transport.rs
│   │   ├── mock_auth.rs
│   │   └── mock_resilience.rs
│   ├── fixtures/           # Test data and response builders
│   │   ├── mod.rs
│   │   ├── chat_fixtures.rs
│   │   ├── embeddings_fixtures.rs
│   │   ├── error_fixtures.rs
│   │   ├── model_fixtures.rs
│   │   ├── file_fixtures.rs
│   │   ├── image_fixtures.rs
│   │   ├── audio_fixtures.rs
│   │   ├── moderation_fixtures.rs
│   │   ├── batch_fixtures.rs
│   │   └── stream_fixtures.rs
│   └── services/
│       ├── chat/tests.rs
│       ├── embeddings/tests.rs
│       ├── files/tests.rs
│       ├── models/tests.rs
│       ├── images/tests.rs
│       ├── audio/tests.rs
│       ├── moderations/tests.rs
│       ├── batches/tests.rs
│       ├── fine_tuning/tests.rs
│       └── assistants/tests.rs
└── tests/
    └── integration/
        ├── mod.rs
        ├── chat_completions.rs
        └── embeddings.rs
```

## Mock Traits

### MockHttpTransport

Mock implementation of the `HttpTransport` trait for testing HTTP operations.

**Features:**
- Configure expected JSON responses
- Configure error responses
- Configure streaming responses
- Verify requests were made with specific parameters
- Track request count and history

**Example:**
```rust
use crate::mocks::MockHttpTransport;

let mock_transport = MockHttpTransport::new()
    .with_json_response(chat_completion_response())
    .with_error_response(OpenAIError::rate_limit("Rate limit exceeded"));

// Use in tests
assert!(mock_transport.verify_request(Method::POST, "/chat/completions"));
assert_eq!(mock_transport.request_count(), 1);
```

### MockAuthManager

Mock implementation of the `AuthManager` trait for testing authentication.

**Features:**
- Configure success/failure behavior
- Track authentication call count
- Simulate authentication errors

**Example:**
```rust
use crate::mocks::MockAuthManager;

let mock_auth = MockAuthManager::new()
    .with_error("Invalid API key");

// Use in tests
assert_eq!(mock_auth.auth_call_count(), 1);
```

### MockResilienceOrchestrator

Mock implementation of the `ResilienceOrchestrator` trait for testing retry and circuit breaker logic.

**Features:**
- Passthrough mode (no resilience logic)
- Configure retry behavior
- Configure failure after N attempts
- Track execution count

**Example:**
```rust
use crate::mocks::MockResilienceOrchestrator;

let mock_resilience = MockResilienceOrchestrator::new()
    .with_failure_after(2);

assert_eq!(mock_resilience.execution_count(), 3);
```

## Test Fixtures

### Chat Fixtures

Located in `src/fixtures/chat_fixtures.rs`

**Provided fixtures:**
- `chat_completion_response()` - Basic successful response
- `chat_completion_response_with_multiple_choices()` - Multiple response options
- `chat_completion_response_with_tool_calls()` - Function calling response
- `chat_completion_response_with_length_finish()` - Response with length limit
- `chat_completion_response_with_content_filter()` - Filtered content response
- `ChatCompletionResponseBuilder` - Builder for custom responses

**Example:**
```rust
use crate::fixtures::*;

let response = ChatCompletionResponseBuilder::new()
    .with_id("chatcmpl-custom")
    .with_model("gpt-4")
    .with_content("Custom response")
    .with_tokens(10, 20)
    .build();
```

### Embeddings Fixtures

Located in `src/fixtures/embeddings_fixtures.rs`

**Provided fixtures:**
- `embeddings_response()` - Single input response
- `embeddings_response_multiple_inputs()` - Multiple embeddings
- `embeddings_response_3_small()` - text-embedding-3-small model
- `embeddings_response_3_large()` - text-embedding-3-large model
- `embeddings_response_custom_dimensions()` - Custom dimension count
- `EmbeddingsResponseBuilder` - Builder for custom responses

### Error Fixtures

Located in `src/fixtures/error_fixtures.rs`

**Provided fixtures:**
- `error_401_invalid_api_key()` - Authentication error
- `error_429_rate_limit()` - Rate limit error
- `error_429_quota_exceeded()` - Quota exceeded error
- `error_500_internal_server_error()` - Server error
- `error_503_service_unavailable()` - Service unavailable
- `error_400_invalid_request()` - Invalid request
- `error_400_missing_parameter()` - Missing parameter
- `error_404_not_found()` - Resource not found
- `error_400_context_length_exceeded()` - Context length exceeded
- `error_403_permission_denied()` - Permission denied
- `error_400_content_policy_violation()` - Content policy violation
- `ErrorResponseBuilder` - Builder for custom errors

### Stream Fixtures

Located in `src/fixtures/stream_fixtures.rs`

**Provided fixtures:**
- `chat_stream_chunk()` - Single stream chunk
- `chat_stream_chunk_final()` - Final chunk with finish reason
- `chat_stream_chunk_tool_call()` - Tool call delta
- `chat_stream_sequence()` - Complete stream sequence

## Service Unit Tests

Each service has comprehensive unit tests covering:

### Test Categories

1. **Happy Path Tests**
   - Successful API calls with valid parameters
   - Different parameter combinations
   - Multiple response scenarios

2. **Error Handling Tests**
   - Authentication errors (401)
   - Rate limit errors (429)
   - Server errors (500, 503)
   - Invalid request errors (400)
   - Not found errors (404)

3. **Validation Tests**
   - Invalid parameters
   - Missing required fields
   - Invalid model names

4. **Streaming Tests** (for chat completions)
   - Successful streaming
   - Stream errors
   - Authentication errors during streaming

5. **Resilience Tests**
   - Verify resilience orchestrator is used
   - Track execution counts

6. **Authentication Tests**
   - Verify auth headers are applied
   - Track authentication calls

### Example Test Pattern

```rust
#[tokio::test]
async fn test_chat_completion_success() {
    // Arrange
    let mock_transport = MockHttpTransport::new()
        .with_json_response(chat_completion_response());

    let service = create_test_service(
        mock_transport.clone(),
        MockAuthManager::new(),
        MockResilienceOrchestrator::passthrough(),
    );

    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![ChatMessage::user("Hello, how are you?")],
    );

    // Act
    let result = service.create(request).await;

    // Assert
    assert!(result.is_ok());
    let response = result.unwrap();
    assert_eq!(response.id, "chatcmpl-123");
    assert!(mock_transport.verify_request(Method::POST, "/chat/completions"));
}
```

## Integration Tests

Integration tests use WireMock to create a mock HTTP server that simulates the OpenAI API.

### Test Structure

Located in `tests/integration/`:
- `mod.rs` - Common helpers and utilities
- `chat_completions.rs` - Chat completion integration tests
- `embeddings.rs` - Embeddings integration tests

### Example Integration Test

```rust
#[tokio::test]
async fn test_chat_completion_integration_success() {
    // Setup mock server
    let mock_server = setup_mock_server().await;

    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(response_body))
        .mount(&mock_server)
        .await;

    // Create client
    let config = OpenAIConfig {
        api_key: "test-api-key".to_string(),
        base_url: Some(mock_server.uri()),
        ..Default::default()
    };

    let client = OpenAIClientBuilder::new()
        .with_config(config)
        .build()
        .expect("Failed to build client");

    // Make request
    let result = client.chat().create(request).await;

    assert!(result.is_ok());
}
```

## Running Tests

### Run All Tests
```bash
cargo test
```

### Run Unit Tests Only
```bash
cargo test --lib
```

### Run Integration Tests Only
```bash
cargo test --test '*'
```

### Run Specific Service Tests
```bash
cargo test --lib chat::tests
cargo test --lib embeddings::tests
```

### Run Tests with Output
```bash
cargo test -- --nocapture
```

### Run Tests in Parallel
```bash
cargo test -- --test-threads=4
```

## Test Coverage

### Chat Completions Service (22 tests)
- ✓ Basic completion success
- ✓ Completion with parameters
- ✓ Multiple choices
- ✓ Tool calls
- ✓ Authentication errors
- ✓ Rate limit errors
- ✓ Server errors
- ✓ Invalid request errors
- ✓ Streaming success
- ✓ Streaming authentication errors
- ✓ System messages
- ✓ Conversation history
- ✓ Length finish reason
- ✓ Content filter
- ✓ Resilience execution
- ✓ Auth headers applied
- ✓ Request builder
- ✓ Message builders

### Embeddings Service (11 tests)
- ✓ Single input success
- ✓ Multiple inputs success
- ✓ Custom dimensions
- ✓ Authentication errors
- ✓ Invalid model errors
- ✓ Rate limit errors
- ✓ Resilience execution
- ✓ text-embedding-3-small model
- ✓ text-embedding-3-large model

### Models Service (5 tests)
- ✓ List models success
- ✓ Retrieve model success
- ✓ Authentication errors
- ✓ Model not found errors

### Files Service (8 tests)
- ✓ File upload success
- ✓ List files success
- ✓ Retrieve file success
- ✓ Delete file success
- ✓ Download file success
- ✓ Upload authentication errors

### Images Service (4 tests)
- ✓ Image generation success
- ✓ Base64 response format
- ✓ Authentication errors
- ✓ Invalid prompt errors

### Audio Service (4 tests)
- ✓ Transcription success
- ✓ Translation success
- ✓ Speech generation success
- ✓ Authentication errors

### Moderations Service (4 tests)
- ✓ Safe content response
- ✓ Flagged content response
- ✓ Authentication errors
- ✓ Rate limit errors

### Batches Service (5 tests)
- ✓ Create batch success
- ✓ Retrieve batch completed
- ✓ List batches success
- ✓ Cancel batch success
- ✓ Authentication errors

### Fine-tuning Service (5 tests)
- ✓ Create job success
- ✓ List jobs success
- ✓ Retrieve job success
- ✓ Cancel job success
- ✓ Authentication errors

### Assistants Service (5 tests)
- ✓ Create assistant success
- ✓ List assistants success
- ✓ Retrieve assistant success
- ✓ Delete assistant success
- ✓ Authentication errors

### Integration Tests (7 tests)
- ✓ Chat completion integration success
- ✓ Chat completion authentication error
- ✓ Chat completion rate limit
- ✓ Chat completion with parameters
- ✓ Embeddings integration success
- ✓ Embeddings multiple inputs
- ✓ Embeddings rate limit

## Best Practices

### 1. Use Fixtures for Consistent Data
Always use fixtures instead of hardcoding JSON in tests:
```rust
// Good
let response = chat_completion_response();

// Avoid
let response = json!({"id": "test", ...});
```

### 2. Verify All Interactions
Use mock verification methods to ensure expected behavior:
```rust
assert!(mock_transport.verify_request(Method::POST, "/chat/completions"));
assert_eq!(mock_auth.auth_call_count(), 1);
assert_eq!(mock_resilience.execution_count(), 1);
```

### 3. Test Error Scenarios
Always test both success and failure paths:
```rust
#[tokio::test]
async fn test_success() { /* ... */ }

#[tokio::test]
async fn test_authentication_error() { /* ... */ }

#[tokio::test]
async fn test_rate_limit_error() { /* ... */ }
```

### 4. Use Builder Patterns
For complex test data, use builders:
```rust
let response = ChatCompletionResponseBuilder::new()
    .with_model("gpt-4")
    .with_content("Test")
    .build();
```

### 5. Isolate Tests
Each test should be independent and not rely on shared state:
```rust
fn create_test_service(...) -> ServiceImpl {
    // Create fresh instances for each test
}
```

## Adding New Tests

### Adding a New Service Test

1. Create test file: `src/services/my_service/tests.rs`
2. Add test module to `src/services/my_service/mod.rs`:
   ```rust
   #[cfg(test)]
   mod tests;
   ```
3. Follow the test pattern with helper function and test cases

### Adding New Fixtures

1. Create fixture file: `src/fixtures/my_fixtures.rs`
2. Export from `src/fixtures/mod.rs`:
   ```rust
   #[cfg(test)]
   mod my_fixtures;
   #[cfg(test)]
   pub use my_fixtures::*;
   ```
3. Provide both sample responses and builder patterns

### Adding Integration Tests

1. Create test file: `tests/integration/my_feature.rs`
2. Export from `tests/integration/mod.rs`:
   ```rust
   pub mod my_feature;
   ```
3. Use WireMock for HTTP mocking

## Continuous Integration

Add to CI pipeline:

```yaml
- name: Run tests
  run: |
    cargo test --all-features
    cargo test --no-default-features

- name: Check test coverage
  run: |
    cargo tarpaulin --out Xml

- name: Run integration tests
  run: |
    cargo test --test '*' --all-features
```

## Troubleshooting

### Tests Failing to Compile
- Ensure all dependencies are in `Cargo.toml`
- Check that `#[cfg(test)]` attributes are used correctly
- Verify mock trait implementations match actual traits

### Mock Not Working
- Ensure response is configured before making request
- Check that the correct mock method is used (json/error/stream)
- Verify request parameters match what the mock expects

### Integration Tests Timing Out
- Increase timeout in test configuration
- Check that WireMock server is starting correctly
- Verify network configuration in test environment

## Contributing

When adding new functionality:

1. **Write tests first** (TDD approach)
2. **Add fixtures** for new response types
3. **Cover error cases** not just happy paths
4. **Update this documentation** with new test patterns
5. **Run full test suite** before committing

## Resources

- [Rust Testing Guide](https://doc.rust-lang.org/book/ch11-00-testing.html)
- [WireMock Documentation](https://docs.rs/wiremock/)
- [Mockall Documentation](https://docs.rs/mockall/)
- [London School TDD](https://github.com/testdouble/contributing-tests/wiki/London-school-TDD)
