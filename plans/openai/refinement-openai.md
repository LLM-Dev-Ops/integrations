# OpenAI Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-08
**Module:** `integrations/openai`

---

## Table of Contents

1. [Refinement Overview](#1-refinement-overview)
2. [Code Standards](#2-code-standards)
3. [Implementation Guidelines](#3-implementation-guidelines)
4. [Error Handling Guidelines](#4-error-handling-guidelines)
5. [Testing Guidelines](#5-testing-guidelines)
6. [Documentation Standards](#6-documentation-standards)
7. [Review Criteria](#7-review-criteria)
8. [Performance Guidelines](#8-performance-guidelines)
9. [Security Guidelines](#9-security-guidelines)
10. [Iteration Process](#10-iteration-process)
11. [Quality Gates](#11-quality-gates)
12. [Known Edge Cases](#12-known-edge-cases)

---

## 1. Refinement Overview

### 1.1 Purpose

The Refinement phase ensures that implementation adheres to established standards, addresses edge cases, and produces production-quality code. This document provides concrete guidelines for developers implementing the OpenAI Integration Module.

### 1.2 Refinement Goals

| Goal | Description | Measurement |
|------|-------------|-------------|
| **Correctness** | All functionality matches specification | 100% test pass rate |
| **Reliability** | Graceful handling of failures | Zero unhandled panics |
| **Maintainability** | Clean, documented code | Code review approval |
| **Performance** | Meets latency/throughput targets | Benchmark validation |
| **Security** | No credential leaks or vulnerabilities | Security audit pass |

### 1.3 Refinement Checklist

```
□ All public APIs documented with examples
□ All error conditions handled and tested
□ All edge cases identified and addressed
□ Performance benchmarks meet targets
□ Security review completed
□ Integration tests pass with mock server
□ Code coverage > 80%
□ No clippy warnings (Rust) / ESLint errors (TS)
□ Documentation reviewed for accuracy
□ Changelog updated
```

---

## 2. Code Standards

### 2.1 Rust Code Standards

#### Naming Conventions

```rust
// Modules: snake_case
mod chat_completion;
mod rate_limiter;

// Types: PascalCase
struct ChatCompletionRequest { }
enum OpenAIError { }
trait HttpTransport { }

// Functions/Methods: snake_case
fn create_client() -> Result<Client, Error> { }
async fn send_request(&self) -> Result<Response, Error> { }

// Constants: SCREAMING_SNAKE_CASE
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_RETRIES: u32 = 3;

// Type parameters: Single uppercase or descriptive PascalCase
fn parse<T: DeserializeOwned>(data: &[u8]) -> Result<T, Error> { }
fn execute<Req, Resp>(request: Req) -> Result<Resp, Error> { }
```

#### Code Organization

```rust
// File structure order:
// 1. Module documentation
// 2. Imports (std, external, internal)
// 3. Constants
// 4. Type definitions
// 5. Trait definitions
// 6. Implementations
// 7. Private helpers
// 8. Tests (in same file or separate)

//! Chat completion service implementation.
//!
//! This module provides the [`ChatCompletionService`] trait and its
//! implementation for interacting with OpenAI's chat completions API.

use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::transport::HttpTransport;
use crate::errors::OpenAIError;

const ENDPOINT: &str = "/chat/completions";

/// Request for creating a chat completion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionRequest {
    // fields...
}

/// Service for chat completion operations.
#[async_trait]
pub trait ChatCompletionService: Send + Sync {
    async fn create(&self, request: ChatCompletionRequest)
        -> Result<ChatCompletionResponse, OpenAIError>;
}

/// Implementation of [`ChatCompletionService`].
pub struct ChatCompletionServiceImpl {
    // fields...
}

#[async_trait]
impl ChatCompletionService for ChatCompletionServiceImpl {
    async fn create(&self, request: ChatCompletionRequest)
        -> Result<ChatCompletionResponse, OpenAIError> {
        // implementation...
    }
}

// Private helpers
fn validate_request(request: &ChatCompletionRequest) -> Result<(), OpenAIError> {
    // implementation...
}

#[cfg(test)]
mod tests {
    use super::*;
    // tests...
}
```

#### Error Handling Patterns

```rust
// DO: Use Result for fallible operations
pub fn create_client(config: Config) -> Result<Client, OpenAIError> {
    let api_key = config.api_key
        .ok_or(ConfigurationError::MissingApiKey)?;
    // ...
}

// DO: Use ? operator for error propagation
async fn execute(&self, request: Request) -> Result<Response, OpenAIError> {
    let http_request = self.build_request(request)?;
    let http_response = self.transport.send(http_request).await?;
    let response = self.parse_response(http_response)?;
    Ok(response)
}

// DO: Provide context with errors
fn parse_response(data: &[u8]) -> Result<Response, OpenAIError> {
    serde_json::from_slice(data)
        .map_err(|e| ResponseError::DeserializationError {
            message: e.to_string(),
            body_preview: String::from_utf8_lossy(&data[..200.min(data.len())]).to_string(),
        })
}

// DON'T: Use unwrap() in production code
// BAD:
let value = some_option.unwrap();

// GOOD:
let value = some_option.ok_or(SomeError::MissingValue)?;

// DON'T: Ignore errors silently
// BAD:
let _ = fallible_operation();

// GOOD:
if let Err(e) = fallible_operation() {
    self.logger.warn("Operation failed", &[("error", e.to_string())]);
}
```

#### Async Patterns

```rust
// DO: Use async/await consistently
async fn fetch_data(&self) -> Result<Data, Error> {
    let response = self.client.get(url).await?;
    let data = response.json().await?;
    Ok(data)
}

// DO: Use select for timeouts
async fn fetch_with_timeout(&self) -> Result<Data, Error> {
    tokio::select! {
        result = self.fetch_data() => result,
        _ = tokio::time::sleep(self.timeout) => {
            Err(NetworkError::Timeout { duration: self.timeout })
        }
    }
}

// DO: Use spawn for fire-and-forget operations
fn record_metrics(&self, metrics: Metrics) {
    let recorder = self.metrics_recorder.clone();
    tokio::spawn(async move {
        if let Err(e) = recorder.record(metrics).await {
            // Log but don't fail the main operation
            tracing::warn!("Failed to record metrics: {}", e);
        }
    });
}

// DON'T: Block in async context
// BAD:
async fn process(&self) {
    std::thread::sleep(Duration::from_secs(1)); // Blocks thread!
}

// GOOD:
async fn process(&self) {
    tokio::time::sleep(Duration::from_secs(1)).await;
}
```

### 2.2 TypeScript Code Standards

#### Naming Conventions

```typescript
// Files: kebab-case
// chat-completion.ts
// rate-limiter.ts

// Interfaces: PascalCase with 'I' prefix optional (prefer without)
interface ChatCompletionRequest { }
interface OpenAIConfig { }

// Types: PascalCase
type ChatMessage = SystemMessage | UserMessage | AssistantMessage;

// Classes: PascalCase
class ChatCompletionServiceImpl implements ChatCompletionService { }

// Functions: camelCase
function createClient(config: OpenAIConfig): OpenAIClient { }
async function sendRequest(request: Request): Promise<Response> { }

// Constants: SCREAMING_SNAKE_CASE or camelCase for complex objects
const DEFAULT_TIMEOUT = 60000;
const MAX_RETRIES = 3;
const defaultConfig: Readonly<OpenAIConfig> = { /* ... */ };

// Private members: prefix with underscore or use #
class Service {
  private _transport: HttpTransport;
  #rateLimiter: RateLimiter;
}
```

#### Type Safety

```typescript
// DO: Use strict types, avoid 'any'
interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;  // Optional with specific type
}

// DO: Use discriminated unions for variants
type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string };

// DO: Use branded types for IDs
type FileId = string & { readonly __brand: 'FileId' };
type BatchId = string & { readonly __brand: 'BatchId' };

function createFileId(id: string): FileId {
  return id as FileId;
}

// DO: Use const assertions for literals
const ENDPOINTS = {
  chat: '/chat/completions',
  embeddings: '/embeddings',
} as const;

// DON'T: Use 'any'
// BAD:
function process(data: any): any { }

// GOOD:
function process<T extends JsonValue>(data: T): ProcessedResult<T> { }
```

#### Error Handling

```typescript
// DO: Use custom error classes
export class OpenAIError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'OpenAIError';
  }
}

// DO: Use Result pattern for expected failures
type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };

async function safeFetch<T>(url: string): Promise<Result<T, OpenAIError>> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, error: mapHttpError(response) };
    }
    const data = await response.json();
    return { success: true, value: data as T };
  } catch (e) {
    return { success: false, error: wrapError(e) };
  }
}

// DO: Use type guards
function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof OpenAIError && error.code === 'rate_limit_exceeded';
}

// DON'T: Catch and rethrow without context
// BAD:
try {
  await doSomething();
} catch (e) {
  throw e;  // No added context
}

// GOOD:
try {
  await doSomething();
} catch (e) {
  throw new OpenAIError(
    `Failed to process request: ${e.message}`,
    'PROCESSING_ERROR',
    undefined,
    false,
  );
}
```

---

## 3. Implementation Guidelines

### 3.1 Service Implementation Pattern

```rust
// Standard service implementation pattern (Rust)

pub struct ChatCompletionServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<AuthManager>,
    resilience: Arc<ResilienceOrchestrator>,
    base_url: Url,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,
}

impl ChatCompletionServiceImpl {
    /// Creates a new chat completion service.
    pub fn new(
        transport: Arc<dyn HttpTransport>,
        auth_manager: Arc<AuthManager>,
        resilience: Arc<ResilienceOrchestrator>,
        base_url: Url,
        logger: Arc<dyn Logger>,
        tracer: Arc<dyn Tracer>,
    ) -> Self {
        Self {
            transport,
            auth_manager,
            resilience,
            base_url,
            logger,
            tracer,
        }
    }
}

#[async_trait]
impl ChatCompletionService for ChatCompletionServiceImpl {
    async fn create(
        &self,
        request: ChatCompletionRequest,
    ) -> Result<ChatCompletionResponse, OpenAIError> {
        // 1. Start tracing span
        let span = self.tracer.start_span("openai.chat.create");
        span.set_attribute("model", request.model.clone());

        // 2. Validate request
        self.validate_request(&request)?;

        // 3. Execute with resilience
        let result = self.resilience.execute(
            "chat.create",
            || async {
                self.execute_request(&request).await
            }
        ).await;

        // 4. Record outcome
        match &result {
            Ok(response) => {
                span.set_status(SpanStatus::Ok);
                if let Some(usage) = &response.usage {
                    span.set_attribute("tokens.total", usage.total_tokens);
                }
            }
            Err(e) => {
                span.record_error(e);
                span.set_status(SpanStatus::Error);
            }
        }

        span.end();
        result
    }
}
```

### 3.2 Request Validation Pattern

```rust
// Validation should be thorough but fast

fn validate_request(&self, request: &ChatCompletionRequest) -> Result<(), OpenAIError> {
    let mut errors = Vec::new();

    // Required fields
    if request.model.is_empty() {
        errors.push(ValidationDetail {
            field: "model".to_string(),
            message: "Model is required".to_string(),
        });
    }

    if request.messages.is_empty() {
        errors.push(ValidationDetail {
            field: "messages".to_string(),
            message: "At least one message is required".to_string(),
        });
    }

    // Range validations
    if let Some(temp) = request.temperature {
        if !(0.0..=2.0).contains(&temp) {
            errors.push(ValidationDetail {
                field: "temperature".to_string(),
                message: "Temperature must be between 0 and 2".to_string(),
            });
        }
    }

    if let Some(n) = request.n {
        if n == 0 || n > 128 {
            errors.push(ValidationDetail {
                field: "n".to_string(),
                message: "n must be between 1 and 128".to_string(),
            });
        }
    }

    // Semantic validations
    if request.max_tokens.is_some() && request.max_completion_tokens.is_some() {
        errors.push(ValidationDetail {
            field: "max_tokens".to_string(),
            message: "Cannot specify both max_tokens and max_completion_tokens".to_string(),
        });
    }

    // Return result
    if errors.is_empty() {
        Ok(())
    } else {
        Err(RequestError::ValidationError {
            message: "Request validation failed".to_string(),
            details: errors,
        }.into())
    }
}
```

### 3.3 Streaming Implementation Pattern

```rust
// Streaming must handle backpressure and cleanup properly

pub struct ChatCompletionStream {
    inner: Pin<Box<dyn Stream<Item = Result<Bytes, Error>> + Send>>,
    buffer: String,
    state: StreamState,
    circuit_breaker: Arc<CircuitBreaker>,
    usage_tracker: UsageTracker,
}

enum StreamState {
    Reading,
    Done,
    Error(OpenAIError),
}

impl Stream for ChatCompletionStream {
    type Item = Result<ChatCompletionChunk, OpenAIError>;

    fn poll_next(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Self::Item>> {
        loop {
            // Check if we're done
            match &self.state {
                StreamState::Done => return Poll::Ready(None),
                StreamState::Error(e) => {
                    let error = e.clone();
                    self.state = StreamState::Done;
                    return Poll::Ready(Some(Err(error)));
                }
                StreamState::Reading => {}
            }

            // Try to parse from buffer first
            if let Some(event) = self.try_parse_event() {
                match event {
                    SSEEvent::Data(data) => {
                        if data.trim() == "[DONE]" {
                            self.state = StreamState::Done;
                            self.circuit_breaker.record_success();
                            return Poll::Ready(None);
                        }

                        match serde_json::from_str::<ChatCompletionChunk>(&data) {
                            Ok(chunk) => {
                                self.usage_tracker.track(&chunk);
                                return Poll::Ready(Some(Ok(chunk)));
                            }
                            Err(e) => {
                                // Log but continue - may be partial JSON
                                tracing::warn!("Failed to parse chunk: {}", e);
                            }
                        }
                    }
                    SSEEvent::Comment | SSEEvent::Retry(_) => {
                        // Ignore, continue reading
                    }
                }
            }

            // Need more data - poll inner stream
            match Pin::new(&mut self.inner).poll_next(cx) {
                Poll::Ready(Some(Ok(bytes))) => {
                    self.buffer.push_str(&String::from_utf8_lossy(&bytes));
                    // Loop to try parsing again
                }
                Poll::Ready(Some(Err(e))) => {
                    self.circuit_breaker.record_failure();
                    self.state = StreamState::Error(NetworkError::from(e).into());
                    // Will return error on next poll
                }
                Poll::Ready(None) => {
                    // Stream ended without [DONE]
                    if !matches!(self.state, StreamState::Done) {
                        self.circuit_breaker.record_failure();
                        return Poll::Ready(Some(Err(
                            ResponseError::StreamInterrupted {
                                message: "Stream ended without [DONE] marker".to_string(),
                            }.into()
                        )));
                    }
                    return Poll::Ready(None);
                }
                Poll::Pending => return Poll::Pending,
            }
        }
    }
}

// Cleanup on drop
impl Drop for ChatCompletionStream {
    fn drop(&mut self) {
        // Record final usage metrics
        self.usage_tracker.finalize();
    }
}
```

---

## 4. Error Handling Guidelines

### 4.1 Error Classification

| Error Type | Retryable | User Action | Logging Level |
|------------|-----------|-------------|---------------|
| `ConfigurationError` | No | Fix configuration | ERROR |
| `AuthenticationError` | No | Check API key | ERROR |
| `ValidationError` | No | Fix request | WARN |
| `RateLimitError` | Yes | Wait and retry | WARN |
| `NetworkError::Timeout` | Yes | Retry | WARN |
| `NetworkError::Connection` | Yes | Retry | WARN |
| `ServerError::5xx` | Yes (limited) | Retry | ERROR |
| `ContentPolicyError` | No | Modify content | WARN |
| `ResourceError::NotFound` | No | Check resource ID | INFO |

### 4.2 Error Context Guidelines

```rust
// DO: Include relevant context in errors
Err(OpenAIError::Request(RequestError::ValidationError {
    message: format!(
        "Invalid temperature value: {}. Must be between 0 and 2.",
        request.temperature
    ),
    details: vec![ValidationDetail {
        field: "temperature".to_string(),
        message: "Value out of range".to_string(),
    }],
}))

// DO: Preserve error chains
async fn fetch_and_parse(&self) -> Result<Data, OpenAIError> {
    let response = self.transport.send(request).await
        .map_err(|e| NetworkError::ConnectionFailed {
            message: format!("Failed to connect to {}: {}", self.base_url, e),
            is_dns: e.is_dns_error(),
        })?;

    let data = serde_json::from_slice(&response.body)
        .map_err(|e| ResponseError::DeserializationError {
            message: format!("Failed to parse response: {}", e),
            body_preview: truncate(&response.body, 200),
        })?;

    Ok(data)
}

// DON'T: Lose error context
// BAD:
.map_err(|_| OpenAIError::Unknown)?

// GOOD:
.map_err(|e| OpenAIError::from(e))?
```

### 4.3 Error Recovery Patterns

```rust
// Pattern: Retry with exponential backoff
async fn with_retry<T, F, Fut>(
    &self,
    operation: &str,
    f: F,
) -> Result<T, OpenAIError>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, OpenAIError>>,
{
    let mut attempt = 0;
    let mut last_error = None;

    while attempt < self.config.max_retries {
        attempt += 1;

        match f().await {
            Ok(result) => return Ok(result),
            Err(e) if e.is_retryable() => {
                let delay = self.calculate_backoff(attempt, e.retry_after());

                self.logger.info("Retrying after error", &[
                    ("operation", operation),
                    ("attempt", &attempt.to_string()),
                    ("delay_ms", &delay.as_millis().to_string()),
                    ("error", &e.to_string()),
                ]);

                tokio::time::sleep(delay).await;
                last_error = Some(e);
            }
            Err(e) => return Err(e),
        }
    }

    Err(last_error.unwrap())
}

// Pattern: Graceful degradation
async fn get_with_fallback(&self, id: &str) -> Result<Resource, OpenAIError> {
    match self.primary_fetch(id).await {
        Ok(resource) => Ok(resource),
        Err(e) if e.is_retryable() => {
            self.logger.warn("Primary fetch failed, using cache", &[
                ("id", id),
                ("error", &e.to_string()),
            ]);
            self.cache.get(id).ok_or(e)
        }
        Err(e) => Err(e),
    }
}
```

---

## 5. Testing Guidelines

### 5.1 Test Organization

```
tests/
├── unit/                    # Fast, isolated tests
│   ├── validation_tests.rs
│   ├── serialization_tests.rs
│   └── error_mapping_tests.rs
│
├── integration/             # Tests with mocked external services
│   ├── chat_completion_tests.rs
│   ├── streaming_tests.rs
│   └── resilience_tests.rs
│
├── contract/                # API contract verification
│   └── openai_api_tests.rs
│
└── fixtures/                # Test data
    ├── requests/
    └── responses/
```

### 5.2 Test Patterns

```rust
// Unit test pattern
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_request_rejects_empty_model() {
        // Arrange
        let request = ChatCompletionRequest {
            model: "".to_string(),
            messages: vec![user_message("Hello")],
            ..Default::default()
        };

        // Act
        let result = validate_request(&request);

        // Assert
        assert!(result.is_err());
        let error = result.unwrap_err();
        assert!(matches!(error, OpenAIError::Request(RequestError::ValidationError { .. })));
    }

    #[test]
    fn validate_request_accepts_valid_request() {
        // Arrange
        let request = ChatCompletionRequest {
            model: "gpt-4".to_string(),
            messages: vec![user_message("Hello")],
            ..Default::default()
        };

        // Act
        let result = validate_request(&request);

        // Assert
        assert!(result.is_ok());
    }
}

// Integration test pattern with mocks
#[tokio::test]
async fn chat_completion_returns_response() {
    // Arrange
    let mock_transport = MockHttpTransport::new()
        .with_response(mock_chat_response());

    let service = ChatCompletionServiceImpl::new(
        Arc::new(mock_transport),
        Arc::new(mock_auth_manager()),
        Arc::new(mock_resilience()),
        parse_url("https://api.openai.com/v1"),
        Arc::new(NullLogger),
        Arc::new(NullTracer),
    );

    let request = ChatCompletionRequest {
        model: "gpt-4".to_string(),
        messages: vec![user_message("Hello")],
        ..Default::default()
    };

    // Act
    let result = service.create(request).await;

    // Assert
    assert!(result.is_ok());
    let response = result.unwrap();
    assert_eq!(response.choices.len(), 1);
    assert!(response.choices[0].message.content.is_some());
}

// Error scenario testing
#[tokio::test]
async fn chat_completion_retries_on_rate_limit() {
    // Arrange
    let mock_transport = MockHttpTransport::new()
        .with_response(mock_rate_limit_response())  // First call
        .with_response(mock_chat_response());       // Retry succeeds

    let service = create_test_service(mock_transport);

    // Act
    let result = service.create(valid_request()).await;

    // Assert
    assert!(result.is_ok());
    assert_eq!(mock_transport.call_count(), 2);
}
```

### 5.3 Test Coverage Requirements

| Component | Minimum Coverage | Target Coverage |
|-----------|------------------|-----------------|
| Public API | 90% | 95% |
| Error handling | 85% | 95% |
| Validation | 95% | 100% |
| Serialization | 90% | 95% |
| Resilience patterns | 85% | 90% |
| Internal helpers | 70% | 80% |
| **Overall** | **80%** | **90%** |

---

## 6. Documentation Standards

### 6.1 Code Documentation

```rust
/// Creates a chat completion using the OpenAI API.
///
/// This method sends a request to the `/chat/completions` endpoint and returns
/// the model's response. For streaming responses, use [`create_stream`] instead.
///
/// # Arguments
///
/// * `request` - The chat completion request containing the model, messages,
///   and optional parameters.
///
/// # Returns
///
/// Returns `Ok(ChatCompletionResponse)` on success, or an `OpenAIError` if the
/// request fails.
///
/// # Errors
///
/// This method can return the following errors:
///
/// * [`ValidationError`] - If the request parameters are invalid
/// * [`AuthenticationError`] - If the API key is invalid or expired
/// * [`RateLimitError`] - If the rate limit is exceeded (retryable)
/// * [`ServerError`] - If the OpenAI API returns a 5xx error
///
/// # Examples
///
/// ```rust
/// use integrations_openai::{ChatCompletionRequest, ChatMessage};
///
/// let request = ChatCompletionRequest {
///     model: "gpt-4".to_string(),
///     messages: vec![
///         ChatMessage::system("You are a helpful assistant."),
///         ChatMessage::user("Hello!"),
///     ],
///     ..Default::default()
/// };
///
/// let response = client.chat().create(request).await?;
/// println!("Response: {}", response.choices[0].message.content.unwrap());
/// ```
///
/// # See Also
///
/// * [`create_stream`] - For streaming responses
/// * [`ChatCompletionRequest`] - Request parameters
/// * [`ChatCompletionResponse`] - Response structure
pub async fn create(
    &self,
    request: ChatCompletionRequest,
) -> Result<ChatCompletionResponse, OpenAIError> {
    // implementation
}
```

### 6.2 TypeScript Documentation

```typescript
/**
 * Creates a chat completion using the OpenAI API.
 *
 * This method sends a request to the `/chat/completions` endpoint and returns
 * the model's response. For streaming responses, use {@link createStream} instead.
 *
 * @param request - The chat completion request containing the model, messages,
 *   and optional parameters.
 * @returns A promise that resolves to the chat completion response.
 *
 * @throws {ValidationError} If the request parameters are invalid.
 * @throws {AuthenticationError} If the API key is invalid or expired.
 * @throws {RateLimitError} If the rate limit is exceeded (retryable).
 * @throws {ServerError} If the OpenAI API returns a 5xx error.
 *
 * @example
 * ```typescript
 * const response = await client.chat.create({
 *   model: 'gpt-4',
 *   messages: [
 *     { role: 'system', content: 'You are a helpful assistant.' },
 *     { role: 'user', content: 'Hello!' },
 *   ],
 * });
 *
 * console.log(response.choices[0].message.content);
 * ```
 *
 * @see {@link createStream} for streaming responses
 * @see {@link ChatCompletionRequest} for request parameters
 * @see {@link ChatCompletionResponse} for response structure
 */
async create(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  // implementation
}
```

---

## 7. Review Criteria

### 7.1 Code Review Checklist

```markdown
## Functionality
- [ ] Implementation matches specification
- [ ] All acceptance criteria met
- [ ] Edge cases handled
- [ ] Error conditions covered

## Code Quality
- [ ] Follows naming conventions
- [ ] No code duplication
- [ ] Functions are focused (single responsibility)
- [ ] No dead code or commented-out code

## Error Handling
- [ ] All errors are properly typed
- [ ] Error messages are descriptive
- [ ] Errors include relevant context
- [ ] Retryable errors are marked correctly

## Testing
- [ ] Unit tests cover happy path
- [ ] Unit tests cover error cases
- [ ] Integration tests with mocks
- [ ] Test coverage meets minimum (80%)

## Documentation
- [ ] Public APIs documented
- [ ] Examples provided
- [ ] Complex logic has comments
- [ ] README updated if needed

## Security
- [ ] No credentials in code
- [ ] Sensitive data not logged
- [ ] Input validation present
- [ ] No SQL/command injection vectors

## Performance
- [ ] No unnecessary allocations
- [ ] No blocking in async code
- [ ] Appropriate use of caching
- [ ] No N+1 query patterns
```

### 7.2 Pull Request Template

```markdown
## Summary
Brief description of the changes.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Refactoring

## Related Issues
Closes #123

## Changes Made
- Change 1
- Change 2

## Testing Done
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests pass locally
- [ ] No new warnings introduced
```

---

## 8. Performance Guidelines

### 8.1 Optimization Rules

```rust
// Rule 1: Avoid unnecessary allocations in hot paths
// BAD:
fn process(&self, data: &str) -> String {
    let parts: Vec<&str> = data.split(',').collect();  // Allocates Vec
    parts.join(";")  // Allocates String
}

// GOOD:
fn process(&self, data: &str) -> impl Iterator<Item = &str> {
    data.split(',')  // Returns iterator, no allocation
}

// Rule 2: Use appropriate collection sizes
// BAD:
let mut results = Vec::new();  // Will reallocate as it grows
for item in large_collection {
    results.push(process(item));
}

// GOOD:
let mut results = Vec::with_capacity(large_collection.len());
for item in large_collection {
    results.push(process(item));
}

// Rule 3: Clone only when necessary
// BAD:
fn process(&self, data: String) {  // Takes ownership, forces caller to clone
    // ...
}

// GOOD:
fn process(&self, data: &str) {  // Borrows, no clone needed
    // ...
}

// Rule 4: Use async appropriately
// BAD: Sequential when parallel is possible
async fn fetch_all(&self, ids: &[String]) -> Vec<Result<Data, Error>> {
    let mut results = Vec::new();
    for id in ids {
        results.push(self.fetch_one(id).await);  // Sequential!
    }
    results
}

// GOOD: Parallel execution
async fn fetch_all(&self, ids: &[String]) -> Vec<Result<Data, Error>> {
    futures::future::join_all(
        ids.iter().map(|id| self.fetch_one(id))
    ).await
}
```

### 8.2 Benchmark Requirements

```rust
// Every performance-critical path should have benchmarks
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn benchmark_serialization(c: &mut Criterion) {
    let request = create_sample_request();

    c.bench_function("serialize_chat_request", |b| {
        b.iter(|| {
            serde_json::to_vec(black_box(&request)).unwrap()
        })
    });
}

fn benchmark_validation(c: &mut Criterion) {
    let request = create_sample_request();

    c.bench_function("validate_chat_request", |b| {
        b.iter(|| {
            validate_request(black_box(&request)).unwrap()
        })
    });
}

criterion_group!(benches, benchmark_serialization, benchmark_validation);
criterion_main!(benches);
```

---

## 9. Security Guidelines

### 9.1 Credential Handling

```rust
// ALWAYS use SecretString for credentials
use secrecy::{ExposeSecret, SecretString};

pub struct AuthManager {
    api_key: SecretString,  // Zeroized on drop
}

impl AuthManager {
    pub fn get_headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        // Only expose briefly for header creation
        headers.insert(
            "Authorization",
            format!("Bearer {}", self.api_key.expose_secret())
                .parse()
                .unwrap(),
        );
        headers
    }
}

// NEVER log credentials
impl std::fmt::Debug for AuthManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AuthManager")
            .field("api_key", &"[REDACTED]")
            .finish()
    }
}
```

### 9.2 Input Validation

```rust
// Validate all external input
fn validate_user_input(input: &str) -> Result<&str, ValidationError> {
    // Length limits
    if input.len() > MAX_INPUT_LENGTH {
        return Err(ValidationError::TooLong);
    }

    // Character validation if needed
    if input.contains('\0') {
        return Err(ValidationError::InvalidCharacter);
    }

    Ok(input)
}

// Sanitize output in logs
fn sanitize_for_logging(data: &str) -> String {
    if data.len() > 200 {
        format!("{}... (truncated)", &data[..200])
    } else {
        data.to_string()
    }
}
```

---

## 10. Iteration Process

### 10.1 Development Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ITERATION WORKFLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

  1. Feature Branch
     └─► Create branch from main: feature/chat-completion-service

  2. TDD Cycle (London School)
     └─► Write interface test
     └─► Implement interface
     └─► Write unit tests with mocks
     └─► Implement functionality
     └─► Refactor

  3. Local Validation
     └─► cargo test / npm test
     └─► cargo clippy / npm run lint
     └─► cargo fmt / npm run format

  4. Pull Request
     └─► Create PR with template
     └─► Automated CI checks
     └─► Code review

  5. Iteration
     └─► Address review feedback
     └─► Update tests if needed
     └─► Re-review

  6. Merge
     └─► Squash and merge
     └─► Delete feature branch
```

### 10.2 Feedback Integration

| Feedback Source | Response Time | Action |
|-----------------|---------------|--------|
| CI failure | Immediate | Fix before review |
| Code review | < 24 hours | Address or discuss |
| Security scan | Immediate | Fix critical, plan others |
| Performance regression | < 48 hours | Investigate and fix |
| User bug report | < 1 week | Triage and prioritize |

---

## 11. Quality Gates

### 11.1 Pre-Commit Gates

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: rust-fmt
        name: Rust Format
        entry: cargo fmt --check
        language: system
        types: [rust]

      - id: rust-clippy
        name: Rust Clippy
        entry: cargo clippy -- -D warnings
        language: system
        types: [rust]

      - id: rust-test
        name: Rust Tests
        entry: cargo test --lib
        language: system
        types: [rust]
```

### 11.2 CI Pipeline Gates

| Gate | Requirement | Blocking |
|------|-------------|----------|
| Build | Compiles without errors | Yes |
| Lint | No warnings | Yes |
| Unit Tests | 100% pass | Yes |
| Integration Tests | 100% pass | Yes |
| Coverage | > 80% | Yes |
| Security Scan | No critical/high | Yes |
| Performance | No regressions > 10% | Yes |
| Documentation | Builds without errors | Yes |

### 11.3 Release Gates

| Gate | Requirement |
|------|-------------|
| All CI gates pass | Required |
| Code review approved | Required |
| CHANGELOG updated | Required |
| Version bumped | Required |
| Documentation updated | Required |
| No known critical bugs | Required |
| Performance benchmarks reviewed | Required |

---

## 12. Known Edge Cases

### 12.1 API Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Empty messages array | Validation error |
| Message with empty content | Allow (valid for tool calls) |
| Very long prompt (>128k tokens) | Pass through, let API error |
| Unicode in prompts | Pass through, properly encoded |
| Null vs missing fields | Treat as equivalent |
| Unknown response fields | Preserve in `extra` map |
| Streaming with `n > 1` | Not supported, validation error |
| Function calling with streaming | Supported, special handling |

### 12.2 Network Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Connection reset mid-stream | Retry if buffer empty, error if partial |
| DNS resolution failure | Retry with backoff |
| TLS handshake failure | Error (no retry - likely config issue) |
| Slow response (> timeout) | Abort and retry |
| Partial JSON response | Buffer and wait for more |
| Server returns wrong content-type | Attempt parse anyway, warn |

### 12.3 Concurrency Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Rate limit hit during parallel requests | Queue excess, retry with backoff |
| Circuit breaker trips mid-batch | Fail remaining, return partial |
| Token bucket exhausted | Block until refill |
| Connection pool exhausted | Queue with timeout |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-08 | SPARC Generator | Initial refinement document |

---

**End of Refinement Phase**

*The next phase (Completion) will provide the final summary, deliverables checklist, and sign-off criteria.*
