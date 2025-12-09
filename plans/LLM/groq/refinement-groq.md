# Refinement: Groq Integration Module

## SPARC Phase 4: Refinement

**Version:** 1.0.0
**Date:** 2025-01-15
**Status:** Draft
**Module:** `integrations/groq`

---

## Table of Contents

1. [Code Standards](#1-code-standards)
2. [Testing Requirements](#2-testing-requirements)
3. [Performance Benchmarks](#3-performance-benchmarks)
4. [Documentation Standards](#4-documentation-standards)
5. [Code Review Criteria](#5-code-review-criteria)
6. [Quality Gates](#6-quality-gates)
7. [CI/CD Configuration](#7-cicd-configuration)
8. [Release Checklist](#8-release-checklist)

---

## 1. Code Standards

### 1.1 Rust Code Standards

#### 1.1.1 Formatting (rustfmt)

```toml
# rustfmt.toml
edition = "2021"
max_width = 100
hard_tabs = false
tab_spaces = 4
newline_style = "Unix"
use_small_heuristics = "Default"
reorder_imports = true
reorder_modules = true
remove_nested_parens = true
edition = "2021"
merge_derives = true
use_field_init_shorthand = true
use_try_shorthand = true
force_explicit_abi = true
imports_granularity = "Module"
group_imports = "StdExternalCrate"
```

#### 1.1.2 Linting (Clippy)

```toml
# Cargo.toml or .clippy.toml
[lints.clippy]
# Deny these lints (errors)
unwrap_used = "deny"
expect_used = "deny"
panic = "deny"
todo = "deny"
unimplemented = "deny"
dbg_macro = "deny"

# Warn on these
pedantic = "warn"
nursery = "warn"
missing_docs = "warn"
missing_errors_doc = "warn"
missing_panics_doc = "warn"
missing_safety_doc = "warn"

# Allow these exceptions
module_name_repetitions = "allow"
must_use_candidate = "allow"
```

#### 1.1.3 Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Crates | snake_case | `groq` |
| Modules | snake_case | `chat_service` |
| Types | PascalCase | `ChatRequest` |
| Traits | PascalCase | `HttpTransport` |
| Functions | snake_case | `create_stream` |
| Methods | snake_case | `build_request` |
| Constants | SCREAMING_SNAKE | `DEFAULT_TIMEOUT` |
| Statics | SCREAMING_SNAKE | `MAX_RETRIES` |
| Type parameters | PascalCase, single letter | `T`, `E` |
| Lifetimes | lowercase, short | `'a`, `'req` |

#### 1.1.4 Error Handling Patterns

```rust
// GOOD: Use Result with typed errors
pub fn create(&self, request: ChatRequest) -> Result<ChatResponse, GroqError> {
    request.validate()?;
    // ...
}

// GOOD: Use ? operator for propagation
let response = self.transport.send(request).await?;

// GOOD: Map errors with context
let body = serde_json::to_vec(&request)
    .map_err(|e| GroqError::ValidationError {
        message: format!("Failed to serialize request: {}", e),
        param: None,
        value: None,
    })?;

// BAD: Never use unwrap() in library code
let response = self.transport.send(request).await.unwrap(); // ❌

// BAD: Never use expect() in library code
let body = response.body.expect("body should exist"); // ❌
```

#### 1.1.5 Async Patterns

```rust
// GOOD: Use async/await, not block_on
pub async fn create(&self, request: ChatRequest) -> Result<ChatResponse, GroqError> {
    let response = self.transport.send(http_request).await?;
    Ok(response)
}

// GOOD: Use tokio::spawn for concurrent operations
let handles: Vec<_> = requests
    .into_iter()
    .map(|req| tokio::spawn(async move { process(req).await }))
    .collect();

// GOOD: Use streams for iteration
while let Some(chunk) = stream.next().await {
    process_chunk(chunk?)?;
}

// BAD: Don't hold locks across await points
let guard = self.state.lock().await;
self.transport.send(request).await?; // ❌ Lock held across await
drop(guard);

// GOOD: Release lock before await
{
    let mut guard = self.state.lock().await;
    guard.update_something();
} // Lock released here
self.transport.send(request).await?; // ✓
```

#### 1.1.6 Documentation Standards

```rust
/// Creates a new chat completion.
///
/// This method sends a synchronous chat completion request to the Groq API
/// and returns the complete response once generated.
///
/// # Arguments
///
/// * `request` - The chat completion request containing messages and parameters
///
/// # Returns
///
/// Returns `Ok(ChatResponse)` on success, containing the generated completion
/// and usage statistics.
///
/// # Errors
///
/// Returns `Err(GroqError)` if:
/// - The request validation fails (`GroqError::ValidationError`)
/// - Authentication fails (`GroqError::AuthenticationError`)
/// - Rate limits are exceeded (`GroqError::RateLimitError`)
/// - The API returns an error (`GroqError::ServerError`)
///
/// # Examples
///
/// ```rust
/// use groq::{GroqClient, ChatRequest};
///
/// # async fn example() -> Result<(), groq::GroqError> {
/// let client = GroqClient::builder()
///     .api_key("gsk_...")
///     .build()?;
///
/// let request = ChatRequest::builder()
///     .model("llama-3.3-70b-versatile")
///     .user("Hello!")
///     .build()?;
///
/// let response = client.chat().create(request).await?;
/// println!("{}", response.content().unwrap_or_default());
/// # Ok(())
/// # }
/// ```
pub async fn create(&self, request: ChatRequest) -> Result<ChatResponse, GroqError> {
    // implementation
}
```

### 1.2 TypeScript Code Standards

#### 1.2.1 Formatting (Prettier)

```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "quoteProps": "as-needed",
  "trailingComma": "es5",
  "bracketSpacing": true,
  "arrowParens": "avoid",
  "endOfLine": "lf"
}
```

#### 1.2.2 Linting (ESLint)

```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/explicit-function-return-type": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/await-thenable": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/strict-boolean-expressions": "warn",
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "eqeqeq": ["error", "always"],
    "no-throw-literal": "error"
  }
}
```

#### 1.2.3 Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files | kebab-case | `chat-service.ts` |
| Classes | PascalCase | `ChatService` |
| Interfaces | PascalCase | `ChatRequest` |
| Types | PascalCase | `FinishReason` |
| Functions | camelCase | `createStream` |
| Methods | camelCase | `buildRequest` |
| Variables | camelCase | `chatResponse` |
| Constants | SCREAMING_SNAKE | `DEFAULT_TIMEOUT_MS` |
| Enums | PascalCase | `Role.User` |
| Type parameters | PascalCase | `T`, `TResponse` |

#### 1.2.4 Type Safety Patterns

```typescript
// GOOD: Use strict types, never 'any'
interface ChatRequest {
  model: string;
  messages: Message[];
  temperature?: number;
}

// GOOD: Use type guards
function isToolCall(choice: Choice): choice is ToolCallChoice {
  return choice.message.tool_calls !== undefined;
}

// GOOD: Use discriminated unions
type Content =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: ImageUrl };

// GOOD: Use branded types for IDs
type ModelId = string & { readonly __brand: 'ModelId' };

// BAD: Never use 'any'
function process(data: any): any { } // ❌

// BAD: Never use type assertions without guards
const response = data as ChatResponse; // ❌
```

#### 1.2.5 Error Handling Patterns

```typescript
// GOOD: Use custom error class
class GroqError extends Error {
  constructor(
    public readonly code: GroqErrorCode,
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'GroqError';
  }
}

// GOOD: Always handle promise rejections
async function createChat(request: ChatRequest): Promise<ChatResponse> {
  try {
    const response = await this.transport.send(httpRequest);
    return this.parseResponse(response);
  } catch (error) {
    if (error instanceof GroqError) {
      throw error;
    }
    throw new GroqError('unknown_error', String(error));
  }
}

// GOOD: Use Result pattern for expected failures
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

#### 1.2.6 Documentation Standards

```typescript
/**
 * Creates a new chat completion.
 *
 * Sends a synchronous chat completion request to the Groq API
 * and returns the complete response once generated.
 *
 * @param request - The chat completion request containing messages and parameters
 * @returns Promise resolving to the chat response with generated content and usage
 * @throws {GroqError} With code 'validation_error' if request validation fails
 * @throws {GroqError} With code 'authentication_error' if API key is invalid
 * @throws {GroqError} With code 'rate_limit_error' if rate limits exceeded
 *
 * @example
 * ```typescript
 * const client = new GroqClientBuilder()
 *   .apiKey('gsk_...')
 *   .build();
 *
 * const response = await client.chat.create({
 *   model: 'llama-3.3-70b-versatile',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 *
 * console.log(response.choices[0].message.content);
 * ```
 */
async create(request: ChatRequest): Promise<ChatResponse> {
  // implementation
}
```

### 1.3 Common Standards

#### 1.3.1 File Organization

```
# Each file should have:
1. License header (if applicable)
2. Module documentation
3. Imports (grouped and sorted)
4. Constants
5. Types/Interfaces
6. Main implementation
7. Helper functions (private)
8. Tests (in separate file or mod tests)
```

#### 1.3.2 Import Organization

```rust
// Rust: Group imports
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tracing::instrument;

use crate::error::GroqError;
use crate::transport::HttpTransport;
```

```typescript
// TypeScript: Group imports
// External packages
import axios from 'axios';
import { z } from 'zod';

// Internal modules
import { GroqError } from '../errors';
import { HttpTransport } from '../transport';

// Types
import type { ChatRequest, ChatResponse } from '../types';
```

---

## 2. Testing Requirements

### 2.1 Coverage Targets

| Metric | Target | Minimum |
|--------|--------|---------|
| Line Coverage | 85% | 80% |
| Branch Coverage | 75% | 70% |
| Function Coverage | 95% | 90% |

### 2.2 Test Categories

#### 2.2.1 Unit Tests

```rust
// Rust unit test example
#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::fixtures::*;
    use crate::tests::mocks::MockHttpTransport;

    #[tokio::test]
    async fn test_create_chat_success() {
        // Arrange
        let mock_transport = Arc::new(MockHttpTransport::new());
        let expected = create_chat_response("Hello!");
        mock_transport.queue_json(200, &expected).await;

        let service = create_test_chat_service(mock_transport.clone());
        let request = ChatRequest::builder()
            .model("llama-3.3-70b-versatile")
            .user("Hi")
            .build()
            .unwrap();

        // Act
        let response = service.create(request).await;

        // Assert
        assert!(response.is_ok());
        let response = response.unwrap();
        assert_eq!(response.content(), Some("Hello!"));

        // Verify request was sent correctly
        let sent = mock_transport.last_request().await.unwrap();
        assert_eq!(sent.path, "/chat/completions");
    }

    #[tokio::test]
    async fn test_create_chat_validation_error() {
        // Arrange
        let service = create_test_chat_service_default();
        let request = ChatRequest::builder()
            .model("") // Invalid: empty model
            .user("Hi")
            .build();

        // Assert
        assert!(request.is_err());
        assert!(matches!(
            request.unwrap_err(),
            GroqError::ValidationError { .. }
        ));
    }

    #[tokio::test]
    async fn test_create_chat_rate_limit() {
        // Arrange
        let mock_transport = Arc::new(MockHttpTransport::new());
        mock_transport.queue_error_response(429, "rate_limit_exceeded", "Too many requests").await;
        mock_transport.queue_json(200, &create_chat_response("OK")).await;

        let service = create_test_chat_service_with_retry(mock_transport.clone());
        let request = create_test_chat_request();

        // Act
        let response = service.create(request).await;

        // Assert - should succeed after retry
        assert!(response.is_ok());
        assert_eq!(mock_transport.request_count().await, 2);
    }
}
```

```typescript
// TypeScript unit test example
describe('ChatService', () => {
  let mockTransport: MockHttpTransport;
  let service: ChatService;

  beforeEach(() => {
    mockTransport = new MockHttpTransport();
    service = createTestChatService(mockTransport);
  });

  describe('create', () => {
    it('should return chat response on success', async () => {
      // Arrange
      const expected = createChatResponse('Hello!');
      mockTransport.queueJson(200, expected);

      const request: ChatRequest = {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'Hi' }],
      };

      // Act
      const response = await service.create(request);

      // Assert
      expect(response.choices[0].message.content).toBe('Hello!');
      expect(mockTransport.lastRequest?.path).toBe('/chat/completions');
    });

    it('should throw validation error for empty model', async () => {
      const request: ChatRequest = {
        model: '',
        messages: [{ role: 'user', content: 'Hi' }],
      };

      await expect(service.create(request)).rejects.toThrow(GroqError);
      await expect(service.create(request)).rejects.toMatchObject({
        code: 'validation_error',
      });
    });

    it('should retry on rate limit', async () => {
      mockTransport.queueError(429, 'rate_limit_exceeded', 'Too many requests');
      mockTransport.queueJson(200, createChatResponse('OK'));

      const request = createTestChatRequest();
      const response = await service.create(request);

      expect(response.choices[0].message.content).toBe('OK');
      expect(mockTransport.requestCount).toBe(2);
    });
  });
});
```

#### 2.2.2 Integration Tests

```rust
// Integration test with real API (requires GROQ_API_KEY)
#[tokio::test]
#[ignore] // Run with: cargo test -- --ignored
async fn test_real_api_chat_completion() {
    let api_key = std::env::var("GROQ_API_KEY")
        .expect("GROQ_API_KEY must be set for integration tests");

    let client = GroqClient::builder()
        .api_key(api_key)
        .build()
        .expect("Failed to build client");

    let request = ChatRequest::builder()
        .model("llama-3.3-70b-versatile")
        .system("You are a helpful assistant. Keep responses brief.")
        .user("What is 2+2?")
        .max_tokens(50)
        .build()
        .unwrap();

    let response = client.chat().create(request).await;

    assert!(response.is_ok(), "API call failed: {:?}", response.err());
    let response = response.unwrap();
    assert!(response.content().is_some());
    assert!(response.usage.total_tokens > 0);
}

#[tokio::test]
#[ignore]
async fn test_real_api_streaming() {
    let api_key = std::env::var("GROQ_API_KEY").unwrap();
    let client = GroqClient::builder().api_key(api_key).build().unwrap();

    let request = ChatRequest::builder()
        .model("llama-3.3-70b-versatile")
        .user("Count to 5")
        .max_tokens(50)
        .build()
        .unwrap();

    let stream = client.chat().create_stream(request).await.unwrap();
    let response = stream.collect().await.unwrap();

    assert!(response.content().is_some());
}
```

#### 2.2.3 Property-Based Tests

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn test_temperature_validation(temp in -10.0f32..10.0f32) {
        let result = ChatRequest::builder()
            .model("test-model")
            .user("test")
            .temperature(temp)
            .build();

        if temp >= 0.0 && temp <= 2.0 {
            assert!(result.is_ok());
        } else {
            assert!(matches!(result, Err(GroqError::ValidationError { .. })));
        }
    }

    #[test]
    fn test_sse_parser_handles_arbitrary_input(data in ".*") {
        let mut parser = SseParser::new();
        // Should not panic on any input
        let _ = parser.parse(&data);
    }
}
```

#### 2.2.4 Contract Tests

```rust
#[tokio::test]
async fn test_api_contract_chat_response() {
    // Verify response matches expected schema
    let json = r#"{
        "id": "chatcmpl-123",
        "object": "chat.completion",
        "created": 1705312345,
        "model": "llama-3.3-70b-versatile",
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "Hello!"
            },
            "finish_reason": "stop"
        }],
        "usage": {
            "prompt_tokens": 10,
            "completion_tokens": 5,
            "total_tokens": 15
        }
    }"#;

    let response: Result<ChatResponse, _> = serde_json::from_str(json);
    assert!(response.is_ok(), "Failed to parse: {:?}", response.err());

    let response = response.unwrap();
    assert_eq!(response.id, "chatcmpl-123");
    assert_eq!(response.choices[0].message.content, Some("Hello!".to_string()));
}
```

### 2.3 Test Organization

```
tests/
├── common/
│   ├── mod.rs              # Test utilities export
│   ├── mocks.rs            # MockHttpTransport, MockAuthProvider
│   └── fixtures.rs         # create_chat_response, etc.
│
├── unit/
│   ├── mod.rs
│   ├── chat_service_test.rs
│   ├── audio_service_test.rs
│   ├── models_service_test.rs
│   ├── config_test.rs
│   ├── request_builder_test.rs
│   ├── response_parsing_test.rs
│   ├── error_mapping_test.rs
│   ├── sse_parser_test.rs
│   ├── rate_limit_test.rs
│   └── circuit_breaker_test.rs
│
├── integration/
│   ├── mod.rs
│   ├── chat_integration.rs     # Real API tests
│   ├── streaming_integration.rs
│   ├── audio_integration.rs
│   └── resilience_integration.rs
│
└── property/
    ├── mod.rs
    └── validation_props.rs     # Property-based tests
```

---

## 3. Performance Benchmarks

### 3.1 Latency Targets

| Operation | p50 Target | p99 Target | Max Acceptable |
|-----------|------------|------------|----------------|
| Client overhead (sync) | < 1ms | < 2ms | < 5ms |
| Client overhead (stream) | < 0.5ms | < 1ms | < 2ms |
| First token overhead | < 10ms | < 25ms | < 50ms |
| SSE parsing per chunk | < 0.1ms | < 0.5ms | < 1ms |
| Request serialization | < 0.5ms | < 1ms | < 2ms |
| Response parsing | < 0.5ms | < 1ms | < 2ms |

### 3.2 Throughput Targets

| Metric | Target | Minimum |
|--------|--------|---------|
| Requests per second (single client) | > 100 | > 50 |
| Concurrent streams | > 50 | > 20 |
| Memory per stream | < 1MB | < 5MB |

### 3.3 Benchmark Implementation

```rust
// benches/chat_bench.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};

fn bench_request_serialization(c: &mut Criterion) {
    let request = ChatRequest::builder()
        .model("llama-3.3-70b-versatile")
        .system("You are helpful.")
        .user("Hello!")
        .temperature(0.7)
        .max_tokens(100)
        .build()
        .unwrap();

    c.bench_function("request_serialization", |b| {
        b.iter(|| {
            black_box(serde_json::to_vec(&request).unwrap())
        })
    });
}

fn bench_response_parsing(c: &mut Criterion) {
    let json = include_str!("../tests/fixtures/chat_response.json");

    c.bench_function("response_parsing", |b| {
        b.iter(|| {
            black_box(serde_json::from_str::<ChatResponse>(json).unwrap())
        })
    });
}

fn bench_sse_parsing(c: &mut Criterion) {
    let sse_data = include_str!("../tests/fixtures/sse_stream.txt");

    c.bench_function("sse_parsing", |b| {
        b.iter(|| {
            let mut parser = SseParser::new();
            let events: Vec<_> = parser.parse(sse_data).collect();
            black_box(events)
        })
    });
}

fn bench_concurrent_requests(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();

    c.bench_function("concurrent_10_requests", |b| {
        b.iter(|| {
            rt.block_on(async {
                let mock = Arc::new(MockHttpTransport::new());
                for _ in 0..10 {
                    mock.queue_json(200, &create_chat_response("OK")).await;
                }

                let client = create_test_client(mock);
                let futures: Vec<_> = (0..10)
                    .map(|_| client.chat().create(create_test_request()))
                    .collect();

                black_box(futures::future::join_all(futures).await)
            })
        })
    });
}

criterion_group!(
    benches,
    bench_request_serialization,
    bench_response_parsing,
    bench_sse_parsing,
    bench_concurrent_requests,
);
criterion_main!(benches);
```

### 3.4 Memory Profiling

```rust
// Memory usage test for streaming
#[test]
fn test_streaming_memory_bounded() {
    use std::alloc::{GlobalAlloc, Layout, System};
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct TrackingAllocator;
    static ALLOCATED: AtomicUsize = AtomicUsize::new(0);

    unsafe impl GlobalAlloc for TrackingAllocator {
        unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
            ALLOCATED.fetch_add(layout.size(), Ordering::SeqCst);
            System.alloc(layout)
        }
        unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
            ALLOCATED.fetch_sub(layout.size(), Ordering::SeqCst);
            System.dealloc(ptr, layout)
        }
    }

    // Test that streaming 100KB doesn't allocate more than 10MB
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let initial = ALLOCATED.load(Ordering::SeqCst);

        // Simulate large stream
        let large_stream = create_large_sse_stream(100_000); // 100KB
        let stream = ChatStream::new(large_stream);

        while let Some(chunk) = stream.next().await {
            let _ = chunk;
            let current = ALLOCATED.load(Ordering::SeqCst);
            assert!(current - initial < 10_000_000, "Memory exceeded 10MB");
        }
    });
}
```

---

## 4. Documentation Standards

### 4.1 Required Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| README.md | Package root | Quick start, installation |
| API Reference | Generated (rustdoc/typedoc) | Complete API docs |
| CHANGELOG.md | Package root | Version history |
| MIGRATION.md | Package root | Breaking change guide |
| examples/ | Package root | Working code examples |

### 4.2 README Template

```markdown
# Groq

Ultra-low-latency Groq API client for Rust and TypeScript.

## Features

- 🚀 Ultra-fast inference via Groq's LPU hardware
- 📡 Streaming support with Server-Sent Events
- 🔧 Function/tool calling
- 🖼️ Vision model support
- 🎤 Audio transcription (Whisper)
- 🛡️ Built-in resilience (retry, circuit breaker)
- 📊 Full observability (tracing, metrics)

## Installation

### Rust
```toml
[dependencies]
groq = "0.1"
```

### TypeScript
```bash
npm install @llm-dev-ops/groq
```

## Quick Start

### Rust
```rust
use groq::{GroqClient, ChatRequest};

#[tokio::main]
async fn main() -> Result<(), groq::GroqError> {
    let client = GroqClient::builder()
        .api_key("gsk_...")
        .build()?;

    let response = client.chat().create(
        ChatRequest::builder()
            .model("llama-3.3-70b-versatile")
            .user("Hello!")
            .build()?
    ).await?;

    println!("{}", response.content().unwrap_or_default());
    Ok(())
}
```

### TypeScript
```typescript
import { GroqClientBuilder } from '@llm-dev-ops/groq';

const client = new GroqClientBuilder()
    .apiKey('gsk_...')
    .build();

const response = await client.chat.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: 'Hello!' }]
});

console.log(response.choices[0].message.content);
```

## Examples

See the [examples](./examples) directory for more detailed examples:

- [Basic Chat](./examples/basic_chat.rs)
- [Streaming](./examples/streaming_chat.rs)
- [Function Calling](./examples/tool_use.rs)
- [Vision](./examples/vision.rs)
- [Audio Transcription](./examples/transcription.rs)

## Documentation

- [API Reference](https://docs.rs/groq)
- [Changelog](./CHANGELOG.md)

## License

MIT OR Apache-2.0
```

### 4.3 Example Requirements

Each example must:
1. Be complete and runnable
2. Include error handling
3. Have comments explaining key concepts
4. Use realistic use cases
5. Be tested in CI

```rust
// examples/basic_chat.rs

//! Basic chat completion example
//!
//! This example demonstrates how to create a simple chat completion
//! using the Groq client.
//!
//! Run with:
//! ```
//! GROQ_API_KEY=your_key cargo run --example basic_chat
//! ```

use groq::{GroqClient, ChatRequest, GroqError};

#[tokio::main]
async fn main() -> Result<(), GroqError> {
    // Initialize client from environment variable
    let client = GroqClient::builder()
        .api_key_from_env("GROQ_API_KEY")?
        .build()?;

    // Build the request
    let request = ChatRequest::builder()
        .model("llama-3.3-70b-versatile")
        .system("You are a helpful assistant.")
        .user("What are the benefits of Rust?")
        .temperature(0.7)
        .max_tokens(500)
        .build()?;

    // Make the API call
    println!("Sending request...");
    let response = client.chat().create(request).await?;

    // Print the response
    println!("\nResponse:");
    println!("{}", response.content().unwrap_or("No content"));

    // Print usage statistics
    println!("\nUsage:");
    println!("  Prompt tokens: {}", response.usage.prompt_tokens);
    println!("  Completion tokens: {}", response.usage.completion_tokens);
    println!("  Total tokens: {}", response.usage.total_tokens);

    // Print Groq-specific timing if available
    if let Some(groq) = &response.x_groq {
        if let Some(usage) = &groq.usage {
            if let Some(total_time) = usage.total_time {
                println!("  Total time: {:.3}s", total_time);
            }
        }
    }

    Ok(())
}
```

---

## 5. Code Review Criteria

### 5.1 Review Checklist

```markdown
## PR Review Checklist

### Code Quality
- [ ] Follows naming conventions
- [ ] No unwrap/expect in library code
- [ ] Proper error handling with typed errors
- [ ] No TODO/FIXME without issue reference
- [ ] No commented-out code

### Design
- [ ] Follows SOLID principles
- [ ] Uses dependency injection
- [ ] Interfaces defined before implementation
- [ ] No cross-module dependencies

### Testing
- [ ] Unit tests for new functionality
- [ ] Tests use mocks (no real API calls)
- [ ] Edge cases covered
- [ ] Error paths tested

### Documentation
- [ ] Public APIs documented
- [ ] Examples provided
- [ ] CHANGELOG updated

### Security
- [ ] No secrets in code
- [ ] Input validation present
- [ ] SecretString used for credentials

### Performance
- [ ] No unnecessary allocations
- [ ] Async properly used
- [ ] No blocking in async context
```

### 5.2 Approval Requirements

| Change Type | Required Approvals | Additional Requirements |
|-------------|-------------------|-------------------------|
| Bug fix | 1 | Tests for the bug |
| Feature | 2 | Documentation, examples |
| Breaking change | 2 | Migration guide |
| Security fix | 2 | Security review |
| Performance | 1 | Benchmarks |

---

## 6. Quality Gates

### 6.1 CI Quality Gates

| Gate | Requirement | Blocking |
|------|-------------|----------|
| Build | Must compile | Yes |
| Lint (Rust) | `cargo clippy` passes | Yes |
| Lint (TS) | `npm run lint` passes | Yes |
| Format (Rust) | `cargo fmt --check` passes | Yes |
| Format (TS) | `prettier --check` passes | Yes |
| Unit Tests | All pass | Yes |
| Coverage | ≥ 80% line coverage | Yes |
| Security Audit | No high/critical vulns | Yes |
| Doc Tests | All pass | Yes |

### 6.2 Release Quality Gates

| Gate | Requirement | Blocking |
|------|-------------|----------|
| All CI Gates | Pass | Yes |
| Integration Tests | Pass | Yes |
| Performance Benchmarks | No regression > 10% | Yes |
| Documentation | Complete | Yes |
| CHANGELOG | Updated | Yes |
| Version | Properly bumped | Yes |
| Examples | All run successfully | Yes |

---

## 7. CI/CD Configuration

### 7.1 GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  CARGO_TERM_COLOR: always
  RUSTFLAGS: -Dwarnings

jobs:
  lint-rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt
      - uses: Swatinem/rust-cache@v2

      - name: Check formatting
        run: cargo fmt --all -- --check

      - name: Clippy
        run: cargo clippy --all-targets --all-features -- -D warnings

  lint-typescript:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: packages/groq-ts
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  test-rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2

      - name: Run tests
        run: cargo test --all-features

      - name: Run doc tests
        run: cargo test --doc

  test-typescript:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: packages/groq-ts
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run test:coverage

      - name: Check coverage
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 80%"
            exit 1
          fi

  coverage-rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2

      - name: Install cargo-llvm-cov
        uses: taiki-e/install-action@cargo-llvm-cov

      - name: Generate coverage
        run: cargo llvm-cov --all-features --lcov --output-path lcov.info

      - name: Check coverage threshold
        run: |
          COVERAGE=$(cargo llvm-cov --all-features --json | jq '.data[0].totals.lines.percent')
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 80%"
            exit 1
          fi

  security-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: rustsec/audit-check@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

  build:
    needs: [lint-rust, lint-typescript, test-rust, test-typescript]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2

      - name: Build Rust
        run: cargo build --release --all-features

      - name: Build TypeScript
        working-directory: packages/groq-ts
        run: |
          npm ci
          npm run build

  integration-tests:
    needs: [build]
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable

      - name: Run integration tests
        env:
          GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
        run: cargo test --all-features -- --ignored
```

### 7.2 Release Workflow

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release-rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable

      - name: Publish to crates.io
        env:
          CARGO_REGISTRY_TOKEN: ${{ secrets.CARGO_REGISTRY_TOKEN }}
        run: cargo publish

  release-typescript:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: packages/groq-ts
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - run: npm ci
      - run: npm run build

      - name: Publish to npm
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: npm publish --access public

  github-release:
    needs: [release-rust, release-typescript]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          generate_release_notes: true
```

---

## 8. Release Checklist

### 8.1 Pre-Release Checklist

```markdown
## Pre-Release Checklist

### Code Quality
- [ ] All CI checks pass
- [ ] Coverage meets thresholds
- [ ] No security vulnerabilities
- [ ] Performance benchmarks acceptable

### Documentation
- [ ] README up to date
- [ ] API docs generated
- [ ] CHANGELOG updated with all changes
- [ ] Migration guide (if breaking changes)
- [ ] Examples tested

### Version
- [ ] Version bumped in Cargo.toml
- [ ] Version bumped in package.json
- [ ] Version follows semver
- [ ] Git tag created

### Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Examples run successfully
- [ ] Manual testing completed
```

### 8.2 Release Steps

```markdown
## Release Process

1. **Prepare Release**
   ```bash
   # Update version
   cargo set-version 0.2.0
   npm version 0.2.0 --no-git-tag-version

   # Update CHANGELOG
   # Add release date and finalize notes

   # Commit
   git add -A
   git commit -m "chore: prepare release v0.2.0"
   ```

2. **Create Tag**
   ```bash
   git tag -a v0.2.0 -m "Release v0.2.0"
   git push origin main --tags
   ```

3. **Monitor Release**
   - Watch CI/CD pipeline
   - Verify crates.io publication
   - Verify npm publication
   - Verify GitHub release

4. **Post-Release**
   - Announce release
   - Update documentation site
   - Close milestone
```

### 8.3 Rollback Procedure

```markdown
## Rollback Procedure

If a release needs to be rolled back:

1. **Yank from crates.io**
   ```bash
   cargo yank --version 0.2.0
   ```

2. **Deprecate npm package**
   ```bash
   npm deprecate @llm-dev-ops/groq@0.2.0 "Critical bug, use 0.1.x"
   ```

3. **Update GitHub Release**
   - Mark as pre-release
   - Add warning notice

4. **Communicate**
   - Post issue explaining problem
   - Notify users via appropriate channels
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-GROQ-REFINE-001 |
| Version | 1.0.0 |
| Created | 2025-01-15 |
| Last Modified | 2025-01-15 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Refinement Phase**

*SPARC Phase 4 Complete - Awaiting "Next phase." to proceed to Completion*
