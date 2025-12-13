# Refinement: Ollama Integration Module

## SPARC Phase 4: Refinement

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/ollama`

---

## Table of Contents

1. [Code Standards](#1-code-standards)
2. [Testing Requirements](#2-testing-requirements)
3. [Interface Contracts](#3-interface-contracts)
4. [Constraints and Invariants](#4-constraints-and-invariants)
5. [Performance Requirements](#5-performance-requirements)
6. [Quality Gates](#6-quality-gates)
7. [CI/CD Configuration](#7-cicd-configuration)
8. [Open Questions](#8-open-questions)

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
merge_derives = true
use_field_init_shorthand = true
use_try_shorthand = true
imports_granularity = "Module"
group_imports = "StdExternalCrate"
```

#### 1.1.2 Linting (Clippy)

```toml
# Cargo.toml
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

# Allow these exceptions
module_name_repetitions = "allow"
must_use_candidate = "allow"
```

#### 1.1.3 Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Crates | snake_case | `ollama` |
| Modules | snake_case | `chat_service` |
| Types | PascalCase | `ChatRequest` |
| Traits | PascalCase | `HttpTransport` |
| Functions | snake_case | `create_stream` |
| Methods | snake_case | `build_request` |
| Constants | SCREAMING_SNAKE | `DEFAULT_BASE_URL` |
| Type parameters | PascalCase, single letter | `T`, `S` |
| Lifetimes | lowercase, short | `'a`, `'req` |

#### 1.1.4 Error Handling Patterns

```rust
// GOOD: Use Result with typed errors
pub async fn create(&self, request: ChatRequest) -> Result<ChatResponse, OllamaError> {
    self.validate_request(&request)?;
    // ...
}

// GOOD: Use ? operator for propagation
let response = self.transport.post("/api/chat", &body).await?;

// GOOD: Map errors with context
let body = serde_json::to_vec(&request)
    .map_err(|e| OllamaError::InternalError {
        message: format!("Failed to serialize request: {}", e),
        status_code: None,
    })?;

// BAD: Never use unwrap() in library code
let response = self.transport.post(path, &body).await.unwrap(); // ❌

// BAD: Never use expect() in library code
let body = response.body.expect("body should exist"); // ❌
```

#### 1.1.5 Async Patterns

```rust
// GOOD: Use async/await
pub async fn create(&self, request: ChatRequest) -> Result<ChatResponse, OllamaError> {
    let response = self.transport.post("/api/chat", &body).await?;
    Ok(response)
}

// GOOD: Use streams for iteration
while let Some(chunk) = stream.next().await {
    process_chunk(chunk?)?;
}

// BAD: Don't hold locks across await points
let guard = self.state.lock().await;
self.transport.post(path, &body).await?; // ❌ Lock held across await
drop(guard);

// GOOD: Release lock before await
{
    let mut guard = self.state.lock().await;
    guard.update_something();
} // Lock released here
self.transport.post(path, &body).await?; // ✓
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
| Types | PascalCase | `SimulationMode` |
| Functions | camelCase | `createStream` |
| Methods | camelCase | `buildRequest` |
| Variables | camelCase | `chatResponse` |
| Constants | SCREAMING_SNAKE | `DEFAULT_BASE_URL` |
| Enums | PascalCase | `Role.User` |

---

## 2. Testing Requirements

### 2.1 Test Categories

#### 2.1.1 Unit Tests

| Component | Coverage Target | Key Test Cases |
|-----------|-----------------|----------------|
| ChatService | 90% | Request validation, response parsing, streaming |
| GenerateService | 90% | Prompt handling, context continuation, raw mode |
| EmbeddingsService | 90% | Single/batch embeddings, model validation |
| ModelsService | 85% | List, show, running, delete operations |
| NdjsonParser | 95% | Partial lines, UTF-8, malformed JSON |
| SimulationLayer | 95% | Record, replay, matching, timing |
| OllamaConfig | 90% | Validation, defaults, builder |
| Error handling | 90% | All error types, conversion, retryable |

#### 2.1.2 Integration Tests

| Scenario | Description | Prerequisites |
|----------|-------------|---------------|
| Basic chat | Send chat request, receive response | Running Ollama |
| Streaming chat | Stream chat response, verify chunks | Running Ollama |
| Model switching | Use different models in sequence | Multiple models |
| Generate text | Text completion with context | Running Ollama |
| Embeddings | Generate embeddings, verify dimensions | Embedding model |
| Model list | List and show model details | Any model |
| Health check | Verify server status | Running Ollama |
| Error recovery | Handle server restart | Ollama control |

#### 2.1.3 Simulation Tests

| Scenario | Description | Mode |
|----------|-------------|------|
| Recording | Capture requests/responses | Recording |
| Replay exact | Return recorded responses | Replay |
| Replay timing | Simulate original timing | Replay + Realistic |
| No match | Handle missing recording | Replay |
| Persistence | Save/load recordings | File storage |
| Streaming record | Record streamed responses | Recording |
| Streaming replay | Replay streamed responses | Replay |

### 2.2 Test Fixtures

#### 2.2.1 Request Fixtures

```rust
// tests/fixtures/requests.rs

pub fn chat_request_simple() -> ChatRequest {
    ChatRequest {
        model: "llama3.2".to_string(),
        messages: vec![
            Message {
                role: Role::User,
                content: "Hello!".to_string(),
                images: None,
            }
        ],
        format: None,
        options: None,
        stream: None,
        keep_alive: None,
    }
}

pub fn chat_request_with_system() -> ChatRequest {
    ChatRequest {
        model: "llama3.2".to_string(),
        messages: vec![
            Message {
                role: Role::System,
                content: "You are a helpful assistant.".to_string(),
                images: None,
            },
            Message {
                role: Role::User,
                content: "What is 2+2?".to_string(),
                images: None,
            }
        ],
        format: None,
        options: Some(ModelOptions {
            temperature: Some(0.7),
            ..Default::default()
        }),
        stream: None,
        keep_alive: None,
    }
}

pub fn generate_request_simple() -> GenerateRequest {
    GenerateRequest {
        model: "llama3.2".to_string(),
        prompt: "Complete this: The quick brown".to_string(),
        system: None,
        template: None,
        context: None,
        options: None,
        stream: None,
        raw: None,
        keep_alive: None,
        images: None,
    }
}

pub fn embeddings_request() -> EmbeddingsRequest {
    EmbeddingsRequest {
        model: "nomic-embed-text".to_string(),
        prompt: Some("Hello, world!".to_string()),
        input: None,
        options: None,
        keep_alive: None,
    }
}
```

#### 2.2.2 Response Fixtures

```rust
// tests/fixtures/responses.rs

pub fn chat_response_simple() -> ChatResponse {
    ChatResponse {
        model: "llama3.2".to_string(),
        created_at: "2025-12-13T10:00:00Z".to_string(),
        message: Message {
            role: Role::Assistant,
            content: "Hello! How can I help you today?".to_string(),
            images: None,
        },
        done: true,
        done_reason: Some("stop".to_string()),
        total_duration: Some(1_500_000_000), // 1.5 seconds
        load_duration: Some(500_000_000),
        prompt_eval_count: Some(10),
        prompt_eval_duration: Some(200_000_000),
        eval_count: Some(15),
        eval_duration: Some(800_000_000),
    }
}

pub fn chat_chunks() -> Vec<ChatChunk> {
    vec![
        ChatChunk {
            model: "llama3.2".to_string(),
            created_at: "2025-12-13T10:00:00Z".to_string(),
            message: Message {
                role: Role::Assistant,
                content: "Hello".to_string(),
                images: None,
            },
            done: false,
            ..Default::default()
        },
        ChatChunk {
            model: "llama3.2".to_string(),
            created_at: "2025-12-13T10:00:00Z".to_string(),
            message: Message {
                role: Role::Assistant,
                content: "!".to_string(),
                images: None,
            },
            done: false,
            ..Default::default()
        },
        ChatChunk {
            model: "llama3.2".to_string(),
            created_at: "2025-12-13T10:00:00Z".to_string(),
            message: Message {
                role: Role::Assistant,
                content: "".to_string(),
                images: None,
            },
            done: true,
            done_reason: Some("stop".to_string()),
            total_duration: Some(1_000_000_000),
            eval_count: Some(2),
            ..Default::default()
        },
    ]
}
```

### 2.3 Mock Implementations

```rust
// tests/mocks/transport.rs

pub struct MockHttpTransport {
    responses: Arc<RwLock<VecDeque<MockResponse>>>,
    requests: Arc<RwLock<Vec<MockRequest>>>,
}

impl MockHttpTransport {
    pub fn new() -> Self {
        Self {
            responses: Arc::new(RwLock::new(VecDeque::new())),
            requests: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub fn expect_response(&self, response: MockResponse) {
        self.responses.write().unwrap().push_back(response);
    }

    pub fn verify_request(&self, index: usize) -> Option<MockRequest> {
        self.requests.read().unwrap().get(index).cloned()
    }
}

#[async_trait]
impl HttpTransport for MockHttpTransport {
    async fn post<T: Serialize>(&self, path: &str, body: &T)
        -> Result<Response, OllamaError>
    {
        // Record request
        self.requests.write().unwrap().push(MockRequest {
            path: path.to_string(),
            body: serde_json::to_value(body).unwrap(),
        });

        // Return queued response
        let response = self.responses.write().unwrap()
            .pop_front()
            .ok_or_else(|| OllamaError::InternalError {
                message: "No mock response configured".to_string(),
                status_code: None,
            })?;

        match response {
            MockResponse::Success(body) => Ok(Response {
                status: 200,
                body: serde_json::to_vec(&body).unwrap().into(),
            }),
            MockResponse::Error(error) => Err(error),
        }
    }

    // ... other methods
}
```

---

## 3. Interface Contracts

### 3.1 Service Interface Contracts

#### 3.1.1 ChatService Contract

```rust
/// Chat service interface contract
trait ChatServiceContract {
    /// Preconditions:
    /// - request.messages MUST NOT be empty
    /// - request.model MUST be non-empty OR default_model MUST be set
    /// - All messages MUST have valid roles (System, User, Assistant)
    ///
    /// Postconditions:
    /// - Returns ChatResponse with done=true
    /// - Response.message.role MUST be Assistant
    /// - Response metrics (eval_count, etc.) MUST be present
    ///
    /// Invariants:
    /// - Never modifies the original request
    /// - Thread-safe (can be called concurrently)
    async fn create(&self, request: ChatRequest) -> Result<ChatResponse, OllamaError>;

    /// Preconditions: Same as create()
    ///
    /// Postconditions:
    /// - Stream yields ChatChunk items
    /// - Final chunk has done=true
    /// - Final chunk contains metrics
    /// - Stream terminates after done=true chunk
    ///
    /// Invariants:
    /// - Chunks are yielded in order received
    /// - Partial content is valid UTF-8
    /// - Memory usage is bounded regardless of response length
    async fn create_stream(&self, request: ChatRequest)
        -> Result<impl Stream<Item = Result<ChatChunk, OllamaError>>, OllamaError>;
}
```

#### 3.1.2 SimulationLayer Contract

```rust
/// Simulation layer interface contract
trait SimulationLayerContract {
    /// Preconditions:
    /// - In Recording mode: transport MUST be connected
    /// - In Replay mode: recordings MUST be loaded
    ///
    /// Postconditions:
    /// - In Disabled mode: passes through to transport unchanged
    /// - In Recording mode: response is recorded before returning
    /// - In Replay mode: recorded response is returned
    ///
    /// Invariants:
    /// - Mode can be changed at runtime
    /// - Recording order matches request order
    /// - Replay is deterministic for same recordings
    async fn execute<T, B, F, Fut>(
        &self,
        operation: &str,
        body: &B,
        executor: F,
    ) -> Result<Response, OllamaError>;

    /// Recording persistence contract:
    /// - Recordings are JSON-serializable
    /// - File format is versioned
    /// - Loading validates format version
    async fn save_to_file(&self, path: &Path) -> Result<(), OllamaError>;
    async fn load_from_file(&self, path: &Path) -> Result<(), OllamaError>;
}
```

### 3.2 Type Contracts

#### 3.2.1 Message Type Contract

```rust
/// Message type contract
struct Message {
    /// Role MUST be one of: System, User, Assistant
    role: Role,

    /// Content MUST be valid UTF-8
    /// Content MAY be empty (for tool calls in future)
    content: String,

    /// Images MUST be base64-encoded if present
    /// Images are only valid for models with vision support
    images: Option<Vec<String>>,
}

impl Message {
    /// Invariants:
    /// - Role is always valid enum variant
    /// - Content is never null (use empty string)
    /// - Images vector, if present, contains only valid base64
    fn validate(&self) -> Result<(), OllamaError>;
}
```

#### 3.2.2 ModelOptions Type Contract

```rust
/// Model options contract
struct ModelOptions {
    /// Temperature MUST be in range [0.0, 2.0] if set
    temperature: Option<f32>,

    /// Top_p MUST be in range [0.0, 1.0] if set
    top_p: Option<f32>,

    /// Top_k MUST be positive if set
    top_k: Option<i32>,

    /// Num_predict MUST be -1 (infinite) or positive
    num_predict: Option<i32>,

    /// Num_ctx MUST be positive if set
    num_ctx: Option<i32>,

    // ... other options
}

impl ModelOptions {
    /// Validation:
    /// - All numeric options within valid ranges
    /// - Conflicting options detected (e.g., top_p with top_k)
    fn validate(&self) -> Result<(), OllamaError>;
}
```

---

## 4. Constraints and Invariants

### 4.1 System Constraints

#### 4.1.1 Thin Adapter Constraints

| Constraint | Description | Verification |
|------------|-------------|--------------|
| No business logic | Module only translates API calls | Code review |
| No infrastructure | Uses shared primitives only | Dependency check |
| No deployment logic | Not responsible for Ollama lifecycle | Code review |
| No authentication system | Uses shared auth primitive | Dependency check |
| No logging system | Uses shared logging primitive | Dependency check |
| No metrics system | Uses shared metrics primitive | Dependency check |

#### 4.1.2 Dependency Constraints

| Constraint | Enforcement |
|------------|-------------|
| No cross-module deps | CI check: deny dependencies on other integrations |
| Shared primitives only | CI check: allowlist external dependencies |
| No ruvbase | CI check: explicit deny |
| Minimal external crates | Review: justify each new dependency |

### 4.2 Runtime Invariants

#### 4.2.1 Connection Invariants

```
INVARIANT: ConnectionPool
- Connections are reused when possible
- Idle connections are closed after timeout
- Maximum concurrent connections is bounded
- Failed connections are removed from pool

INVARIANT: ServerHealth
- Health check does not block other operations
- Server unavailability is detected within timeout
- Reconnection is automatic on transient failures
```

#### 4.2.2 Streaming Invariants

```
INVARIANT: StreamMemory
- Memory usage does not grow with response size
- Each chunk is processed and released
- Buffer size is bounded (e.g., 64KB)
- Partial lines are accumulated until complete

INVARIANT: StreamOrder
- Chunks are delivered in order received
- No chunk is skipped or duplicated
- Final chunk is always delivered (on success)
- Error terminates stream immediately
```

#### 4.2.3 Simulation Invariants

```
INVARIANT: RecordingIntegrity
- Recording captures complete request/response
- Timing information is accurate
- Recordings are idempotent (same request = same recording)
- Concurrent recordings are isolated

INVARIANT: ReplayDeterminism
- Same recording + same matching mode = same response
- Timing simulation is consistent
- No side effects during replay
- Missing recording = explicit error
```

### 4.3 Error Invariants

```
INVARIANT: ErrorRecovery
- All errors are typed (OllamaError variants)
- Retryable errors are identifiable (is_retryable())
- Recovery hints are provided where applicable
- No panics in error paths

INVARIANT: ErrorContext
- Errors include relevant context (model, operation, etc.)
- Sensitive data is never included in errors
- Stack traces are not exposed to callers
- Errors are serializable (for logging)
```

---

## 5. Performance Requirements

### 5.1 Latency Targets

| Operation | Target (p50) | Target (p99) | Notes |
|-----------|--------------|--------------|-------|
| Client initialization | < 1ms | < 5ms | No network calls |
| Health check | < 10ms | < 50ms | Simple GET request |
| Request serialization | < 0.5ms | < 2ms | JSON encoding |
| Response parsing | < 1ms | < 5ms | JSON decoding |
| Stream chunk parsing | < 0.1ms | < 0.5ms | Per chunk |
| First stream chunk | < 5ms | < 20ms | After server response |

### 5.2 Throughput Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Concurrent requests | 100+ | Bounded by Ollama, not client |
| Stream throughput | Line-rate | No client bottleneck |
| Recording throughput | 1000 ops/sec | In-memory storage |
| Replay throughput | 10000 ops/sec | No I/O during replay |

### 5.3 Resource Limits

| Resource | Limit | Notes |
|----------|-------|-------|
| Memory per request | < 100KB | Excluding response body |
| Memory per stream | < 64KB buffer | Bounded buffer |
| Connection pool size | 10 (default) | Configurable |
| Recording storage | Unbounded (memory) | Use file storage for large tests |

### 5.4 Benchmarks

```rust
// benches/chat_bench.rs

#[bench]
fn bench_request_serialization(b: &mut Bencher) {
    let request = fixtures::chat_request_with_system();
    b.iter(|| {
        serde_json::to_vec(&request).unwrap()
    });
}

#[bench]
fn bench_response_parsing(b: &mut Bencher) {
    let json = include_bytes!("fixtures/chat_response.json");
    b.iter(|| {
        serde_json::from_slice::<ChatResponse>(json).unwrap()
    });
}

#[bench]
fn bench_ndjson_parsing(b: &mut Bencher) {
    let lines = include_str!("fixtures/streaming_response.ndjson");
    b.iter(|| {
        for line in lines.lines() {
            serde_json::from_str::<ChatChunk>(line).unwrap();
        }
    });
}

#[bench]
fn bench_simulation_replay(b: &mut Bencher) {
    let layer = setup_simulation_layer_with_recordings();
    let request = fixtures::chat_request_simple();

    b.iter(|| {
        tokio_test::block_on(async {
            layer.execute("chat", &request, |_, _| async {
                unreachable!() // Should use recording
            }).await.unwrap()
        })
    });
}
```

---

## 6. Quality Gates

### 6.1 Code Quality Gates

| Gate | Threshold | Tool |
|------|-----------|------|
| Test coverage (lines) | > 80% | cargo-llvm-cov |
| Test coverage (branches) | > 70% | cargo-llvm-cov |
| Clippy warnings | 0 | clippy |
| Formatting | 100% | rustfmt |
| Doc coverage | > 90% | cargo-doc |
| Security audit | 0 critical | cargo-audit |

### 6.2 Performance Gates

| Gate | Threshold | Tool |
|------|-----------|------|
| Request serialization p99 | < 2ms | criterion |
| Response parsing p99 | < 5ms | criterion |
| Stream chunk parsing p99 | < 0.5ms | criterion |
| Memory growth | < 1MB/1000 requests | valgrind |

### 6.3 Integration Gates

| Gate | Threshold | Notes |
|------|-----------|-------|
| All unit tests pass | 100% | Required for merge |
| Integration tests pass | 100% | With simulation mode |
| No dependency cycles | 0 | cargo-deny |
| No unsafe code | 0 (or audited) | Manual review |

---

## 7. CI/CD Configuration

### 7.1 GitHub Actions Workflow

```yaml
# .github/workflows/ollama.yml
name: Ollama Integration CI

on:
  push:
    paths:
      - 'ollama/**'
      - '.github/workflows/ollama.yml'
  pull_request:
    paths:
      - 'ollama/**'

jobs:
  test-rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2

      - name: Check formatting
        run: cargo fmt --check
        working-directory: ollama/rust

      - name: Clippy
        run: cargo clippy --all-targets -- -D warnings
        working-directory: ollama/rust

      - name: Unit tests
        run: cargo test --lib
        working-directory: ollama/rust

      - name: Integration tests (simulation mode)
        run: cargo test --test '*' -- --test-threads=1
        working-directory: ollama/rust
        env:
          OLLAMA_SIMULATION: replay

      - name: Coverage
        run: |
          cargo install cargo-llvm-cov
          cargo llvm-cov --lcov --output-path lcov.info
        working-directory: ollama/rust

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ollama/rust/lcov.info

  test-typescript:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: ollama/typescript/package-lock.json

      - name: Install dependencies
        run: npm ci
        working-directory: ollama/typescript

      - name: Lint
        run: npm run lint
        working-directory: ollama/typescript

      - name: Type check
        run: npm run typecheck
        working-directory: ollama/typescript

      - name: Unit tests
        run: npm test -- --coverage
        working-directory: ollama/typescript

      - name: Build
        run: npm run build
        working-directory: ollama/typescript

  # Optional: Integration tests with real Ollama
  integration-test:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Setup Ollama
        run: |
          curl -fsSL https://ollama.ai/install.sh | sh
          ollama serve &
          sleep 5
          ollama pull llama3.2:1b

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Integration tests (real Ollama)
        run: cargo test --test '*' -- --test-threads=1
        working-directory: ollama/rust
        env:
          OLLAMA_HOST: http://localhost:11434
```

### 7.2 Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: rust-fmt
        name: Rust Format
        entry: cargo fmt --
        language: system
        types: [rust]
        pass_filenames: false

      - id: rust-clippy
        name: Rust Clippy
        entry: cargo clippy --all-targets -- -D warnings
        language: system
        types: [rust]
        pass_filenames: false

      - id: rust-test
        name: Rust Tests
        entry: cargo test --lib
        language: system
        types: [rust]
        pass_filenames: false
```

---

## 8. Open Questions

### 8.1 Design Questions

| Question | Options | Decision |
|----------|---------|----------|
| Should we support OpenAI-compatible endpoint? | Native only / Both / OpenAI-compatible only | TBD - Native first, consider OpenAI-compat wrapper |
| How to handle model auto-pull? | No auto-pull / Explicit pull method / Auto-pull on first use | TBD - Explicit pull method preferred |
| Recording file format | JSON / MessagePack / Custom binary | TBD - JSON for readability, consider MessagePack for perf |
| Streaming cancellation | Abort / Graceful shutdown / Both | TBD - Graceful shutdown preferred |

### 8.2 Implementation Questions

| Question | Context | Resolution Path |
|----------|---------|-----------------|
| How to detect model loading state? | Ollama may show model as loading | Monitor /api/ps endpoint |
| Connection pooling strategy? | Balance reuse vs resource usage | Start with reqwest defaults, benchmark |
| Simulation matching algorithm? | Exact vs fuzzy matching | Start strict, add relaxed mode |
| Error message localization? | Support multiple languages | English only initially |

### 8.3 Testing Questions

| Question | Context | Resolution Path |
|----------|---------|-----------------|
| How to test without Ollama? | CI environment may not have Ollama | Simulation mode is primary path |
| Integration test model? | Need small, fast model | Use llama3.2:1b or phi3:mini |
| Recording versioning? | What if Ollama API changes? | Version recordings, validate on load |
| Performance baseline? | Need reproducible benchmarks | Use fixed hardware specs in CI |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-OLLAMA-REFINE-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Refinement Document**

*SPARC Phase 4 Complete - Proceed to Completion phase with "Next phase."*
