# Testing Infrastructure Guide

This document describes the comprehensive test infrastructure for the Gemini integration, covering both Rust and TypeScript implementations.

## Overview

The testing infrastructure follows these principles:

1. **AAA Pattern** (Arrange-Act-Assert): All tests are structured in three clear phases
2. **London-School TDD**: Mock all external dependencies for complete isolation
3. **Comprehensive Fixtures**: Realistic test data covering success and error scenarios
4. **Streaming Support**: Full support for testing streaming responses

## Directory Structure

### Rust

```
rust/
├── src/
│   ├── fixtures/          # Test fixtures
│   │   ├── mod.rs         # Fixture loading utilities
│   │   ├── content/       # Content generation fixtures
│   │   │   ├── success_response.json
│   │   │   └── safety_blocked.json
│   │   └── streaming/     # Streaming response fixtures
│   │       └── chunked_response.txt
│   └── mocks/             # Mock implementations
│       └── mod.rs         # MockHttpTransport, MockAuthManager
└── tests/
    └── mock_example.rs    # Example tests demonstrating patterns
```

### TypeScript

```
typescript/
├── src/
│   ├── __fixtures__/      # Test fixtures
│   │   ├── index.ts       # Fixture loading utilities
│   │   ├── content/       # Content generation fixtures
│   │   │   ├── success-response.json
│   │   │   └── safety-blocked.json
│   │   └── streaming/     # Streaming response fixtures
│   │       └── chunked-response.txt
│   └── __mocks__/         # Mock implementations
│       ├── index.ts       # Re-exports
│       └── http-client.ts # MockHttpClient
└── tests/
    └── mock-example.test.ts # Example tests demonstrating patterns
```

## Rust Testing

### Using Fixtures

```rust
use integrations_gemini::fixtures::{load_fixture, load_json_fixture};

// Load raw text
let content = load_fixture("content/success_response.json");

// Load and parse JSON
let response: serde_json::Value = load_json_fixture("content/success_response.json");
```

### Using Mocks

#### MockHttpTransport

```rust
use integrations_gemini::mocks::MockHttpTransport;
use integrations_gemini::transport::{HttpTransport, HttpRequest, HttpMethod};

#[tokio::test]
async fn test_api_call() {
    // Arrange: Create mock and enqueue response
    let transport = MockHttpTransport::new();
    transport.enqueue_json_response(200, r#"{"status": "ok"}"#);

    // Act: Make request
    let request = HttpRequest {
        method: HttpMethod::Post,
        url: "https://api.example.com".to_string(),
        headers: HashMap::new(),
        body: None,
    };
    let response = transport.send(request).await.unwrap();

    // Assert: Verify response and request
    assert_eq!(response.status, 200);
    transport.verify_request_count(1);
    transport.verify_request(0, HttpMethod::Post, "api.example.com");
}
```

#### Streaming Responses

```rust
#[tokio::test]
async fn test_streaming() {
    // Arrange
    let transport = MockHttpTransport::new();
    let chunks = vec![
        bytes::Bytes::from("chunk1"),
        bytes::Bytes::from("chunk2"),
    ];
    transport.enqueue_streaming_response(chunks);

    // Act
    let request = HttpRequest { /* ... */ };
    let mut stream = transport.send_streaming(request).await.unwrap();

    // Assert
    use futures::StreamExt;
    let mut collected = Vec::new();
    while let Some(chunk) = stream.next().await {
        collected.push(chunk.unwrap());
    }
    assert_eq!(collected.len(), 2);
}
```

#### MockAuthManager

```rust
use integrations_gemini::mocks::MockAuthManager;
use integrations_gemini::auth::AuthManager;

#[test]
fn test_auth() {
    // Arrange
    let auth = MockAuthManager::new("test-key");

    // Act
    let header = auth.get_auth_header();

    // Assert
    assert_eq!(
        header,
        Some(("x-goog-api-key".to_string(), "test-key".to_string()))
    );
}
```

### AAA Pattern Example

```rust
#[tokio::test]
async fn test_content_generation() {
    // ========== ARRANGE ==========
    // Set up mocks
    let transport = MockHttpTransport::new();
    let auth = MockAuthManager::new("test-key");

    // Load fixture
    let fixture = load_fixture("content/success_response.json");
    transport.enqueue_json_response(200, &fixture);

    // Create service with mocks
    let service = ContentService::new(Arc::new(transport), Arc::new(auth));

    // ========== ACT ==========
    let request = GenerateContentRequest {
        contents: vec![Content {
            parts: vec![Part::Text("Hello".to_string())],
            role: Role::User,
        }],
        ..Default::default()
    };
    let response = service.generate_content("gemini-2.0-flash", request).await.unwrap();

    // ========== ASSERT ==========
    assert!(response.candidates.len() > 0);
    assert_eq!(response.usage_metadata.total_token_count, 18);
}
```

## TypeScript Testing

### Using Fixtures

```typescript
import { loadFixture, loadJsonFixture, loadStreamingFixture } from '@integrations/gemini';

// Load raw text
const content = loadFixture('content/success-response.json');

// Load and parse JSON
const response = loadJsonFixture<GenerateContentResponse>('content/success-response.json');

// Load streaming chunks
const chunks = loadStreamingFixture('streaming/chunked-response.txt');
```

### Using Mocks

#### MockHttpClient

```typescript
import { MockHttpClient } from '@integrations/gemini';

describe('API Client Tests', () => {
  let mockClient: MockHttpClient;

  beforeEach(() => {
    mockClient = new MockHttpClient();
  });

  it('should make successful API call', async () => {
    // Arrange: Enqueue response
    mockClient.enqueueJsonResponse(200, { status: 'ok' });

    // Act: Make request
    const response = await mockClient.request('https://api.example.com', {
      method: 'POST',
    });
    const data = await response.json();

    // Assert: Verify response and request
    expect(response.status).toBe(200);
    expect(data.status).toBe('ok');
    mockClient.verifyRequestCount(1);
    mockClient.verifyRequest(0, 'POST', 'api.example.com');
  });
});
```

#### Streaming Responses

```typescript
it('should handle streaming response', async () => {
  // Arrange
  mockClient.enqueueStreamingResponse([
    { value: 'chunk1', done: false },
    { value: 'chunk2', done: false },
    { value: '', done: true },
  ]);

  // Act
  const response = await mockClient.requestStream('https://api.example.com/stream', {
    method: 'POST',
  });

  // Assert
  const reader = response.body!.getReader();
  const chunks: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(new TextDecoder().decode(value));
  }

  expect(chunks).toHaveLength(2);
});
```

#### Error Responses

```typescript
it('should handle error response', async () => {
  // Arrange
  mockClient.enqueueErrorResponse(404, 'Model not found');

  // Act
  const response = await mockClient.request('https://api.example.com/invalid', {
    method: 'GET',
  });
  const data = await response.json();

  // Assert
  expect(response.status).toBe(404);
  expect(data.error.message).toBe('Model not found');
});
```

### AAA Pattern Example

```typescript
describe('ContentService', () => {
  it('should generate content successfully', async () => {
    // ========== ARRANGE ==========
    // Create mock client
    const mockClient = new MockHttpClient();

    // Load fixture
    const fixture = loadJsonFixture('content/success-response.json');
    mockClient.enqueueJsonResponse(200, fixture);

    // Create service with mock
    const service = new ContentService(mockClient, config);

    // ========== ACT ==========
    const response = await service.generateContent('gemini-2.0-flash', {
      contents: [{ parts: [{ text: 'Hello' }] }],
    });

    // ========== ASSERT ==========
    expect(response.candidates).toHaveLength(1);
    expect(response.usageMetadata.totalTokenCount).toBe(18);
    mockClient.verifyRequestCount(1);
    mockClient.verifyHeader(0, 'Content-Type', 'application/json');
  });
});
```

## Available Fixtures

### Content Generation

#### `content/success_response.json`
A successful content generation response with:
- Single candidate with text response
- Safety ratings (all NEGLIGIBLE)
- Usage metadata (10 prompt tokens, 8 candidate tokens)

#### `content/safety_blocked.json`
A safety-blocked response with:
- Prompt feedback indicating SAFETY block
- High probability for HARM_CATEGORY_DANGEROUS_CONTENT

### Streaming

#### `streaming/chunked_response.txt`
A multi-chunk streaming response with:
- 3 chunks containing "Hello", " world", "!"
- Final chunk includes usage metadata

## Mock Capabilities

### MockHttpTransport (Rust) / MockHttpClient (TypeScript)

Both mock implementations provide:

1. **Response Queueing**: Enqueue multiple responses to be returned in order
2. **Request Recording**: All requests are recorded for verification
3. **Request Verification**: Helper methods to verify requests were made correctly
4. **Header Verification**: Verify specific headers were sent
5. **Streaming Support**: Mock streaming responses with chunked data
6. **Error Simulation**: Enqueue error responses for testing error handling

### MockAuthManager (Rust)

Provides:
- Header-based authentication
- Query parameter-based authentication
- No actual API key validation (safe for testing)

## Best Practices

### 1. Always Use AAA Pattern

```rust
#[test]
fn test_example() {
    // Arrange - Set up test state
    let mock = setup_mock();

    // Act - Execute the code under test
    let result = execute_action();

    // Assert - Verify the results
    assert_eq!(result, expected);
}
```

### 2. Use Fixtures for Realistic Data

```rust
// Good: Use fixtures
let response = load_json_fixture("content/success_response.json");

// Avoid: Inline JSON strings
let response = r#"{"candidates":[...]}"#;
```

### 3. Verify All Interactions

```rust
// Verify request count
transport.verify_request_count(1);

// Verify request details
transport.verify_request(0, HttpMethod::Post, "generateContent");

// Verify headers
transport.verify_header(0, "x-goog-api-key", "test-key");
```

### 4. Test Both Success and Failure Paths

```rust
#[tokio::test]
async fn test_success_case() { /* ... */ }

#[tokio::test]
async fn test_safety_blocked() { /* ... */ }

#[tokio::test]
async fn test_network_error() { /* ... */ }
```

### 5. Isolate Tests with Mocks

```rust
// Good: Mock all external dependencies
let transport = MockHttpTransport::new();
let auth = MockAuthManager::new("test-key");
let service = Service::new(transport, auth);

// Avoid: Real HTTP calls in unit tests
```

## Running Tests

### Rust

```bash
# Run all tests
cargo test

# Run specific test
cargo test test_mock_transport_success_response

# Run with output
cargo test -- --nocapture

# Run integration tests
cargo test --test mock_example
```

### TypeScript

```bash
# Run all tests
npm test

# Run specific test file
npm test -- mock-example.test.ts

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

## Adding New Fixtures

### Rust

1. Create JSON/text file in `src/fixtures/content/` or `src/fixtures/streaming/`
2. Load using `load_fixture()` or `load_json_fixture()`

### TypeScript

1. Create JSON/text file in `src/__fixtures__/content/` or `src/__fixtures__/streaming/`
2. Load using `loadFixture()` or `loadJsonFixture()`

## Contributing

When adding new features:

1. Add corresponding fixtures for new API responses
2. Update mock implementations if new transport methods are needed
3. Follow AAA pattern in all tests
4. Add both success and error case tests
5. Document new fixtures in this guide
