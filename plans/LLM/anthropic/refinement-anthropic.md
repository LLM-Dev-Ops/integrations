# SPARC Refinement: Anthropic Integration Module

**Refinement Phase Document**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/anthropic`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Code Standards](#2-code-standards)
3. [Rust Implementation Standards](#3-rust-implementation-standards)
4. [TypeScript Implementation Standards](#4-typescript-implementation-standards)
5. [Testing Requirements](#5-testing-requirements)
6. [Test Coverage Targets](#6-test-coverage-targets)
7. [Performance Benchmarks](#7-performance-benchmarks)
8. [Documentation Standards](#8-documentation-standards)
9. [Review Criteria](#9-review-criteria)
10. [Quality Gates](#10-quality-gates)
11. [Continuous Integration](#11-continuous-integration)
12. [Pre-Release Checklist](#12-pre-release-checklist)

---

## 1. Overview

### 1.1 Purpose

This document defines the refinement criteria, code standards, testing requirements, and quality gates for the Anthropic Integration Module. All implementations must meet these standards before being considered complete.

### 1.2 Scope

- Rust crate: `integrations-anthropic`
- TypeScript package: `@anthropic/integrations-anthropic`
- All associated tests, documentation, and CI/CD configurations

### 1.3 Compliance

All code contributions MUST:
- Pass all automated quality gates
- Meet minimum test coverage thresholds
- Adhere to coding standards defined herein
- Be reviewed and approved by at least one maintainer

---

## 2. Code Standards

### 2.1 General Principles

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CODE QUALITY PRINCIPLES                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. CLARITY OVER CLEVERNESS                                                 │
│     • Code should be readable by developers unfamiliar with the project     │
│     • Prefer explicit over implicit                                         │
│     • Avoid "clever" one-liners that sacrifice readability                  │
│                                                                             │
│  2. SINGLE RESPONSIBILITY                                                   │
│     • Each function/method does one thing well                              │
│     • Each module has a clear, focused purpose                              │
│     • Avoid god objects and kitchen-sink modules                            │
│                                                                             │
│  3. FAIL FAST, FAIL CLEARLY                                                 │
│     • Validate inputs at boundaries                                         │
│     • Return meaningful error messages                                      │
│     • Never swallow errors silently                                         │
│                                                                             │
│  4. DEFENSIVE PROGRAMMING                                                   │
│     • Don't trust external input                                            │
│     • Handle edge cases explicitly                                          │
│     • Use type system to prevent invalid states                             │
│                                                                             │
│  5. TESTABILITY BY DESIGN                                                   │
│     • Dependencies injected, not hardcoded                                  │
│     • Side effects isolated to boundaries                                   │
│     • Pure functions where possible                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Naming Conventions

| Element | Rust | TypeScript |
|---------|------|------------|
| Types/Structs/Classes | `PascalCase` | `PascalCase` |
| Functions/Methods | `snake_case` | `camelCase` |
| Variables | `snake_case` | `camelCase` |
| Constants | `SCREAMING_SNAKE_CASE` | `SCREAMING_SNAKE_CASE` |
| Modules/Files | `snake_case` | `kebab-case` or `camelCase` |
| Traits/Interfaces | `PascalCase` | `IPascalCase` or `PascalCase` |
| Enums | `PascalCase` | `PascalCase` |
| Enum Variants | `PascalCase` | `PascalCase` |

### 2.3 File Organization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FILE ORGANIZATION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Each source file should follow this order:                                 │
│                                                                             │
│  1. File-level documentation (module doc comment)                           │
│  2. Imports/use statements (grouped and sorted)                             │
│  3. Constants                                                               │
│  4. Type definitions (structs, enums, type aliases)                         │
│  5. Trait definitions (Rust) / Interface definitions (TypeScript)           │
│  6. Trait implementations / Class implementations                           │
│  7. Function implementations                                                │
│  8. Tests (in-file for unit tests)                                          │
│                                                                             │
│  Import grouping order:                                                     │
│  1. Standard library                                                        │
│  2. External crates/packages                                                │
│  3. Internal crates/packages (workspace members)                            │
│  4. Local modules (crate/package internal)                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Line Length and Formatting

| Language | Max Line Length | Formatter | Config File |
|----------|-----------------|-----------|-------------|
| Rust | 100 characters | `rustfmt` | `rustfmt.toml` |
| TypeScript | 100 characters | `prettier` | `.prettierrc` |
| Markdown | 80 characters (soft) | - | - |

---

## 3. Rust Implementation Standards

### 3.1 Rust Edition and MSRV

```toml
# Minimum Supported Rust Version
rust-version = "1.75.0"

# Edition
edition = "2021"
```

### 3.2 Cargo Clippy Lints

```toml
# Cargo.toml or .cargo/config.toml
[lints.rust]
unsafe_code = "forbid"
missing_docs = "warn"

[lints.clippy]
# Correctness
correctness = "deny"

# Suspicious
suspicious = "warn"

# Style
style = "warn"

# Complexity
complexity = "warn"

# Performance
perf = "warn"

# Pedantic (selective)
pedantic = "warn"
must_use_candidate = "allow"
module_name_repetitions = "allow"

# Restriction (selective)
unwrap_used = "warn"
expect_used = "warn"
panic = "warn"
todo = "warn"
unimplemented = "warn"
dbg_macro = "warn"
print_stdout = "warn"
print_stderr = "warn"
```

### 3.3 Error Handling Standards

```rust
// ✅ GOOD: Use Result with typed errors
pub fn create_message(request: CreateMessageRequest) -> Result<MessageResponse, AnthropicError> {
    // ...
}

// ✅ GOOD: Use ? operator for propagation
pub async fn send_request(&self, request: Request) -> Result<Response, TransportError> {
    let response = self.client
        .request(request.method, &request.url)
        .headers(request.headers)
        .body(request.body)
        .send()
        .await
        .map_err(|e| TransportError::Connection {
            message: "Failed to send request".into(),
            source: Some(Box::new(e)),
        })?;

    Ok(response)
}

// ❌ BAD: Using unwrap in library code
pub fn parse_response(body: &str) -> MessageResponse {
    serde_json::from_str(body).unwrap() // NEVER do this
}

// ❌ BAD: Using expect without good reason
pub fn get_api_key() -> String {
    std::env::var("API_KEY").expect("API_KEY must be set") // Panics are bad
}
```

### 3.4 Async Standards

```rust
// ✅ GOOD: Async functions return impl Future or are marked async
pub async fn create_message(&self, request: CreateMessageRequest) -> Result<MessageResponse> {
    // ...
}

// ✅ GOOD: Use tokio::select! for racing futures
async fn execute_with_timeout<F, T>(&self, future: F, timeout: Duration) -> Result<T>
where
    F: Future<Output = Result<T>>,
{
    tokio::select! {
        result = future => result,
        _ = tokio::time::sleep(timeout) => {
            Err(AnthropicError::TimeoutError {
                message: "Request timed out".into(),
                duration: timeout,
            })
        }
    }
}

// ✅ GOOD: Use Send + Sync bounds where needed for thread safety
pub trait HttpTransport: Send + Sync {
    fn send(&self, request: Request) -> impl Future<Output = Result<Response>> + Send;
}

// ❌ BAD: Blocking in async context
pub async fn bad_example() {
    std::thread::sleep(Duration::from_secs(1)); // Blocks the executor!
}
```

### 3.5 Documentation Standards

```rust
//! Module-level documentation explaining the purpose.
//!
//! # Examples
//!
//! ```rust
//! use integrations_anthropic::AnthropicClient;
//!
//! let client = AnthropicClient::new(config)?;
//! ```

/// Creates a new message using the Anthropic API.
///
/// This method sends a request to the `/v1/messages` endpoint and returns
/// the generated response.
///
/// # Arguments
///
/// * `request` - The message creation request containing model, messages, and parameters.
///
/// # Returns
///
/// Returns `Ok(MessageResponse)` on success, or an `AnthropicError` on failure.
///
/// # Errors
///
/// This function will return an error if:
/// - The API key is invalid (`AuthenticationError`)
/// - The request is malformed (`InvalidRequestError`)
/// - Rate limits are exceeded (`RateLimitError`)
/// - The API is overloaded (`OverloadedError`)
///
/// # Examples
///
/// ```rust
/// use integrations_anthropic::{AnthropicClient, CreateMessageRequest};
///
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// let client = AnthropicClient::from_env()?;
/// let request = CreateMessageRequest::builder()
///     .model("claude-sonnet-4-20250514")
///     .max_tokens(1024)
///     .messages(vec![message("user", "Hello!")])
///     .build();
///
/// let response = client.messages().create(request).await?;
/// println!("Response: {}", response.content[0].text());
/// # Ok(())
/// # }
/// ```
pub async fn create(&self, request: CreateMessageRequest) -> Result<MessageResponse, AnthropicError> {
    // ...
}
```

### 3.6 Rustfmt Configuration

```toml
# rustfmt.toml
edition = "2021"
max_width = 100
hard_tabs = false
tab_spaces = 4
newline_style = "Auto"
use_small_heuristics = "Default"
reorder_imports = true
reorder_modules = true
remove_nested_parens = true
format_strings = false
format_macro_matchers = false
format_macro_bodies = true
merge_derives = true
use_try_shorthand = true
use_field_init_shorthand = true
force_explicit_abi = true
imports_granularity = "Module"
group_imports = "StdExternalCrate"
```

---

## 4. TypeScript Implementation Standards

### 4.1 TypeScript Version and Target

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noImplicitThis": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

### 4.2 ESLint Configuration

```javascript
// eslint.config.js
export default [
  {
    rules: {
      // TypeScript specific
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",

      // General
      "no-console": "warn",
      "no-debugger": "error",
      "no-alert": "error",
      "prefer-const": "error",
      "no-var": "error",
      "eqeqeq": ["error", "always"],
    }
  }
];
```

### 4.3 Error Handling Standards

```typescript
// ✅ GOOD: Use typed errors with proper error classes
export class AnthropicError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'AnthropicError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class RateLimitError extends AnthropicError {
  constructor(
    message: string,
    public readonly retryAfter?: number,
    requestId?: string,
  ) {
    super(message, 'rate_limit_error', 429, requestId);
    this.name = 'RateLimitError';
  }
}

// ✅ GOOD: Always handle promise rejections
async function createMessage(request: CreateMessageRequest): Promise<MessageResponse> {
  try {
    const response = await this.transport.send(request);
    return this.parseResponse(response);
  } catch (error) {
    if (error instanceof AnthropicError) {
      throw error;
    }
    throw new AnthropicError(
      `Unexpected error: ${error instanceof Error ? error.message : 'Unknown'}`,
      'internal_error',
    );
  }
}

// ❌ BAD: Untyped error handling
async function badExample(): Promise<void> {
  try {
    await doSomething();
  } catch (e) {
    console.log(e); // No type information, no proper handling
  }
}
```

### 4.4 Async Standards

```typescript
// ✅ GOOD: Properly typed async functions
async function fetchWithTimeout<T>(
  promise: Promise<T>,
  timeout: number,
  signal?: AbortSignal,
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(`Request timed out after ${timeout}ms`));
    }, timeout);

    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new AbortError('Request aborted'));
    });
  });

  return Promise.race([promise, timeoutPromise]);
}

// ✅ GOOD: Use AbortController for cancellation
async function createMessageWithCancellation(
  request: CreateMessageRequest,
  options?: { signal?: AbortSignal },
): Promise<MessageResponse> {
  const response = await fetch(this.url, {
    method: 'POST',
    headers: this.headers,
    body: JSON.stringify(request),
    signal: options?.signal,
  });

  return this.parseResponse(response);
}

// ❌ BAD: Fire and forget without error handling
function badAsyncExample(): void {
  doAsyncThing(); // Promise ignored, errors swallowed
}
```

### 4.5 Prettier Configuration

```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "quoteProps": "as-needed",
  "trailingComma": "all",
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

---

## 5. Testing Requirements

### 5.1 Test Categories

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TEST CATEGORIES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  UNIT TESTS (London-School TDD)                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Test individual components in isolation                           │    │
│  │ • Mock all external dependencies                                    │    │
│  │ • Fast execution (< 10ms per test)                                  │    │
│  │ • High coverage of business logic                                   │    │
│  │ • Run on every commit                                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  INTEGRATION TESTS                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Test component interactions                                       │    │
│  │ • Use mock HTTP servers (wiremock, nock)                            │    │
│  │ • Verify request/response serialization                             │    │
│  │ • Test resilience patterns (retry, circuit breaker)                 │    │
│  │ • Run on every PR                                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  CONTRACT TESTS                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Verify API contract compliance                                    │    │
│  │ • Test against API schema/OpenAPI spec                              │    │
│  │ • Catch breaking changes early                                      │    │
│  │ • Run on release branches                                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  E2E TESTS (Optional, requires API key)                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Test against real Anthropic API                                   │    │
│  │ • Verify actual functionality                                       │    │
│  │ • Run manually or on release                                        │    │
│  │ • Requires ANTHROPIC_API_KEY environment variable                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Test Structure (AAA Pattern)

```rust
// Rust Example
#[tokio::test]
async fn test_messages_create_returns_response_on_success() {
    // Arrange
    let mock_transport = MockHttpTransport::new()
        .expect_request()
        .with_method("POST")
        .with_path("/v1/messages")
        .returning(Ok(HttpResponse {
            status: 200,
            body: fixture("messages/success_response.json"),
        }));

    let service = MessagesService::new(Arc::new(mock_transport));
    let request = create_message_request();

    // Act
    let result = service.create(request).await;

    // Assert
    assert!(result.is_ok());
    let response = result.unwrap();
    assert_eq!(response.id, "msg_test123");
    assert_eq!(response.model, "claude-sonnet-4-20250514");
    assert!(matches!(response.stop_reason, Some(StopReason::EndTurn)));

    mock_transport.verify();
}
```

```typescript
// TypeScript Example
describe('MessagesService', () => {
  describe('create', () => {
    it('should return response on success', async () => {
      // Arrange
      const mockTransport = new MockHttpTransport();
      mockTransport.onRequest({
        method: 'POST',
        path: '/v1/messages',
      }).respondWith({
        status: 200,
        body: loadFixture('messages/success_response.json'),
      });

      const service = new MessagesService(mockTransport);
      const request = createMessageRequest();

      // Act
      const result = await service.create(request);

      // Assert
      expect(result.id).toBe('msg_test123');
      expect(result.model).toBe('claude-sonnet-4-20250514');
      expect(result.stopReason).toBe('end_turn');

      mockTransport.verify();
    });
  });
});
```

### 5.3 Mock Requirements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MOCK REQUIREMENTS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Every external dependency MUST have a mock implementation:                 │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Component              │ Mock                                       │    │
│  ├────────────────────────┼────────────────────────────────────────────│    │
│  │ HttpTransport          │ MockHttpTransport                          │    │
│  │ AuthProvider           │ MockAuthProvider                           │    │
│  │ CircuitBreaker         │ MockCircuitBreaker                         │    │
│  │ RateLimiter            │ MockRateLimiter                            │    │
│  │ RetryExecutor          │ MockRetryExecutor                          │    │
│  │ Logger                 │ MockLogger / TestLogger                    │    │
│  │ Clock/Time             │ MockClock                                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Mock capabilities:                                                         │
│  • Configure expected calls                                                 │
│  • Return predefined responses                                              │
│  • Simulate errors and edge cases                                           │
│  • Verify call counts and arguments                                         │
│  • Support async operations                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.4 Test Naming Convention

```
test_<unit>_<scenario>_<expected_outcome>

Examples:
- test_messages_create_returns_response_on_success
- test_messages_create_throws_rate_limit_error_on_429
- test_circuit_breaker_opens_after_failure_threshold
- test_retry_executor_respects_retry_after_header
- test_streaming_handler_accumulates_content_blocks
```

---

## 6. Test Coverage Targets

### 6.1 Coverage Thresholds

| Metric | Minimum | Target | Notes |
|--------|---------|--------|-------|
| Line Coverage | 80% | 90% | All non-trivial lines |
| Branch Coverage | 75% | 85% | All decision points |
| Function Coverage | 90% | 95% | All public functions |
| Statement Coverage | 80% | 90% | All statements |

### 6.2 Coverage Exclusions

The following may be excluded from coverage calculations:

```rust
// Rust: Use #[cfg(not(tarpaulin_include))] or coverage(off)
#[cfg(not(tarpaulin_include))]
impl Debug for SecretString {
    fn fmt(&self, f: &mut Formatter) -> fmt::Result {
        write!(f, "[REDACTED]")
    }
}
```

```typescript
// TypeScript: Use /* istanbul ignore next */
/* istanbul ignore next */
function unreachableCode(): never {
  throw new Error('This should never be reached');
}
```

Allowed exclusions:
- Debug/Display implementations for sensitive types
- Unreachable code paths (with `unreachable!()` or `never` type)
- Generated code
- Platform-specific code not under test

### 6.3 Coverage Tools

| Language | Tool | Command |
|----------|------|---------|
| Rust | tarpaulin | `cargo tarpaulin --out Html` |
| Rust | llvm-cov | `cargo llvm-cov --html` |
| TypeScript | c8 | `c8 npm test` |
| TypeScript | istanbul/nyc | `nyc npm test` |

---

## 7. Performance Benchmarks

### 7.1 Benchmark Requirements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PERFORMANCE BENCHMARKS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Request Serialization                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Operation                    │ Target      │ Max Acceptable         │    │
│  ├──────────────────────────────┼─────────────┼────────────────────────│    │
│  │ Simple request serialize     │ < 10 μs     │ < 50 μs                │    │
│  │ Complex request serialize    │ < 100 μs    │ < 500 μs               │    │
│  │ Response deserialize         │ < 50 μs     │ < 200 μs               │    │
│  │ Large response deserialize   │ < 500 μs    │ < 2 ms                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Memory Usage                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Scenario                     │ Target      │ Max Acceptable         │    │
│  ├──────────────────────────────┼─────────────┼────────────────────────│    │
│  │ Client instantiation         │ < 1 MB      │ < 5 MB                 │    │
│  │ Per-request overhead         │ < 10 KB     │ < 100 KB               │    │
│  │ Streaming buffer             │ < 64 KB     │ < 256 KB               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Throughput (with mock server)                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Scenario                     │ Target      │ Min Acceptable         │    │
│  ├──────────────────────────────┼─────────────┼────────────────────────│    │
│  │ Sequential requests          │ > 100 req/s │ > 50 req/s             │    │
│  │ Concurrent requests (10)     │ > 500 req/s │ > 200 req/s            │    │
│  │ Concurrent requests (100)    │ > 1000 req/s│ > 500 req/s            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Benchmark Configuration

```rust
// Rust: Using criterion
use criterion::{criterion_group, criterion_main, Criterion, BenchmarkId};

fn benchmark_request_serialization(c: &mut Criterion) {
    let request = create_message_request();

    c.bench_function("serialize_simple_request", |b| {
        b.iter(|| serde_json::to_string(&request))
    });
}

fn benchmark_response_deserialization(c: &mut Criterion) {
    let json = include_str!("../fixtures/messages/success_response.json");

    c.bench_function("deserialize_response", |b| {
        b.iter(|| serde_json::from_str::<MessageResponse>(json))
    });
}

criterion_group!(benches, benchmark_request_serialization, benchmark_response_deserialization);
criterion_main!(benches);
```

---

## 8. Documentation Standards

### 8.1 Required Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| README.md | Package root | Quick start, installation, basic usage |
| API Reference | Generated | Complete API documentation |
| CHANGELOG.md | Package root | Version history and changes |
| CONTRIBUTING.md | Repo root | Contribution guidelines |
| Examples | `examples/` directory | Working code examples |

### 8.2 Code Documentation Requirements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DOCUMENTATION REQUIREMENTS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  REQUIRED documentation:                                                    │
│  • All public types (structs, enums, classes, interfaces)                   │
│  • All public functions/methods                                             │
│  • All public constants                                                     │
│  • All modules/namespaces                                                   │
│  • Error types and their causes                                             │
│                                                                             │
│  RECOMMENDED documentation:                                                 │
│  • Complex private functions                                                │
│  • Non-obvious algorithms                                                   │
│  • Workarounds with rationale                                               │
│  • Performance-critical sections                                            │
│                                                                             │
│  Documentation MUST include:                                                │
│  • Brief description of purpose                                             │
│  • Parameter descriptions                                                   │
│  • Return value description                                                 │
│  • Error conditions                                                         │
│  • At least one usage example for public APIs                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Example Quality Standards

All examples must:
- Compile/run without errors
- Demonstrate realistic use cases
- Include error handling
- Use meaningful variable names
- Be kept up-to-date with API changes

```rust
// ✅ GOOD Example
/// # Examples
///
/// ```rust
/// use integrations_anthropic::{AnthropicClient, CreateMessageRequest, Message};
///
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// // Create client from environment
/// let client = AnthropicClient::from_env()?;
///
/// // Build request with conversation
/// let request = CreateMessageRequest::builder()
///     .model("claude-sonnet-4-20250514")
///     .max_tokens(1024)
///     .messages(vec![
///         Message::user("What is the capital of France?"),
///     ])
///     .build();
///
/// // Send request and handle response
/// let response = client.messages().create(request).await?;
///
/// // Extract and use the response
/// for block in &response.content {
///     if let ContentBlock::Text(text) = block {
///         println!("Claude says: {}", text.text);
///     }
/// }
/// # Ok(())
/// # }
/// ```
```

---

## 9. Review Criteria

### 9.1 Code Review Checklist

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CODE REVIEW CHECKLIST                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  FUNCTIONALITY                                                              │
│  □ Code accomplishes its stated purpose                                     │
│  □ Edge cases are handled                                                   │
│  □ Error handling is appropriate                                            │
│  □ No obvious bugs or logic errors                                          │
│                                                                             │
│  CODE QUALITY                                                               │
│  □ Follows coding standards defined in this document                        │
│  □ Code is readable and maintainable                                        │
│  □ No unnecessary complexity                                                │
│  □ No code duplication (DRY)                                                │
│  □ Functions/methods are appropriately sized                                │
│                                                                             │
│  TESTING                                                                    │
│  □ Adequate test coverage for new code                                      │
│  □ Tests are meaningful (not just coverage padding)                         │
│  □ Tests follow AAA pattern                                                 │
│  □ Mocks are used appropriately                                             │
│  □ Edge cases and error paths are tested                                    │
│                                                                             │
│  DOCUMENTATION                                                              │
│  □ Public APIs are documented                                               │
│  □ Complex logic is explained                                               │
│  □ Examples are provided where helpful                                      │
│  □ CHANGELOG is updated (if applicable)                                     │
│                                                                             │
│  SECURITY                                                                   │
│  □ No hardcoded secrets                                                     │
│  □ Input is validated at boundaries                                         │
│  □ Sensitive data is not logged                                             │
│  □ SecretString is used for credentials                                     │
│                                                                             │
│  PERFORMANCE                                                                │
│  □ No obvious performance issues                                            │
│  □ Async operations don't block                                             │
│  □ Resources are properly released                                          │
│  □ No memory leaks                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Review Process

1. **Self-Review**: Author reviews own code before submitting PR
2. **Automated Checks**: CI runs lints, tests, coverage
3. **Peer Review**: At least one maintainer reviews
4. **Address Feedback**: Author addresses all comments
5. **Approval**: Reviewer approves when satisfied
6. **Merge**: Author or reviewer merges after approval

### 9.3 Review Response Time

| Priority | Initial Response | Full Review |
|----------|------------------|-------------|
| Critical (bug fix) | < 4 hours | < 24 hours |
| High (feature) | < 24 hours | < 48 hours |
| Normal | < 48 hours | < 1 week |
| Low (docs, refactor) | < 1 week | < 2 weeks |

---

## 10. Quality Gates

### 10.1 Pre-Commit Hooks

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
        pass_filenames: false

      - id: rust-clippy
        name: Rust Clippy
        entry: cargo clippy -- -D warnings
        language: system
        types: [rust]
        pass_filenames: false

      - id: typescript-lint
        name: TypeScript Lint
        entry: npm run lint
        language: system
        types: [typescript]
        pass_filenames: false

      - id: typescript-format
        name: TypeScript Format
        entry: npm run format:check
        language: system
        types: [typescript]
        pass_filenames: false
```

### 10.2 CI Quality Gates

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CI QUALITY GATES                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GATE 1: Format & Lint (must pass to proceed)                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • cargo fmt --check                                                 │    │
│  │ • cargo clippy -- -D warnings                                       │    │
│  │ • npm run lint                                                      │    │
│  │ • npm run format:check                                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  GATE 2: Build (must pass to proceed)                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • cargo build --all-features                                        │    │
│  │ • cargo build --no-default-features                                 │    │
│  │ • npm run build                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  GATE 3: Unit Tests (must pass to proceed)                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • cargo test --lib                                                  │    │
│  │ • npm run test:unit                                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  GATE 4: Integration Tests (must pass to proceed)                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • cargo test --test '*'                                             │    │
│  │ • npm run test:integration                                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  GATE 5: Coverage (must meet thresholds)                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Line coverage ≥ 80%                                               │    │
│  │ • Branch coverage ≥ 75%                                             │    │
│  │ • Function coverage ≥ 90%                                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  GATE 6: Documentation (must pass)                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • cargo doc --no-deps                                               │    │
│  │ • npm run docs:build                                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  GATE 7: Security Audit (warnings allowed, critical fails)                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • cargo audit                                                       │    │
│  │ • npm audit                                                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Continuous Integration

### 11.1 GitHub Actions Workflow

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
  RUST_BACKTRACE: 1

jobs:
  rust-checks:
    name: Rust Checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - name: Format Check
        run: cargo fmt --check

      - name: Clippy
        run: cargo clippy --all-targets --all-features -- -D warnings

      - name: Build
        run: cargo build --all-features

      - name: Test
        run: cargo test --all-features

      - name: Coverage
        run: |
          cargo install cargo-tarpaulin
          cargo tarpaulin --out Xml --fail-under 80

      - name: Doc
        run: cargo doc --no-deps

  typescript-checks:
    name: TypeScript Checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Format Check
        run: npm run format:check

      - name: Build
        run: npm run build

      - name: Test
        run: npm run test:coverage

      - name: Coverage Check
        run: npm run coverage:check

  security-audit:
    name: Security Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Rust Audit
        run: |
          cargo install cargo-audit
          cargo audit

      - name: NPM Audit
        run: npm audit --audit-level=high
```

### 11.2 Release Workflow

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release-rust:
    name: Publish to crates.io
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable

      - name: Publish
        run: cargo publish
        env:
          CARGO_REGISTRY_TOKEN: ${{ secrets.CARGO_REGISTRY_TOKEN }}

  release-npm:
    name: Publish to npm
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - name: Install & Build
        run: |
          npm ci
          npm run build

      - name: Publish
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## 12. Pre-Release Checklist

### 12.1 Release Checklist

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PRE-RELEASE CHECKLIST                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CODE QUALITY                                                               │
│  □ All quality gates pass                                                   │
│  □ No critical or high security vulnerabilities                             │
│  □ Test coverage meets minimum thresholds                                   │
│  □ All public APIs are documented                                           │
│  □ Examples compile and run correctly                                       │
│                                                                             │
│  TESTING                                                                    │
│  □ Unit tests pass                                                          │
│  □ Integration tests pass                                                   │
│  □ Contract tests pass (if applicable)                                      │
│  □ Manual smoke test performed                                              │
│  □ E2E tests pass (if API key available)                                    │
│                                                                             │
│  DOCUMENTATION                                                              │
│  □ CHANGELOG.md updated with release notes                                  │
│  □ README.md is current                                                     │
│  □ API documentation generated                                              │
│  □ Migration guide written (if breaking changes)                            │
│                                                                             │
│  VERSION                                                                    │
│  □ Version bumped according to semver                                       │
│  □ Version consistent across Cargo.toml and package.json                    │
│  □ Git tag created                                                          │
│                                                                             │
│  COMPATIBILITY                                                              │
│  □ MSRV documented and tested                                               │
│  □ Node.js version requirements documented                                  │
│  □ Dependencies are up to date                                              │
│  □ No deprecated APIs used                                                  │
│                                                                             │
│  FINAL APPROVAL                                                             │
│  □ Release reviewed by maintainer                                           │
│  □ Release notes approved                                                   │
│  □ Publish to crates.io / npm                                               │
│  □ GitHub release created                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Semantic Versioning

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Breaking API change | MAJOR | 1.0.0 → 2.0.0 |
| New feature (backward compatible) | MINOR | 1.0.0 → 1.1.0 |
| Bug fix | PATCH | 1.0.0 → 1.0.1 |
| Documentation only | PATCH | 1.0.0 → 1.0.1 |
| Internal refactor (no API change) | PATCH | 1.0.0 → 1.0.1 |

---

## Document Navigation

| Previous | Current | Next |
|----------|---------|------|
| [Architecture Part 3](./architecture-anthropic-3.md) | Refinement | [Completion](./completion-anthropic.md) |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial refinement criteria |

---

**SPARC Refinement Phase: COMPLETE**

*Awaiting "Next phase." to begin Completion phase.*
