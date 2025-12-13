# Refinement: Google Cloud Pub/Sub Integration Module

## SPARC Phase 4: Refinement

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/google-cloud-pubsub`

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
| Crates | snake_case | `google_cloud_pubsub` |
| Modules | snake_case | `streaming_pull` |
| Types | PascalCase | `PubSubMessage` |
| Traits | PascalCase | `MessagePublisher` |
| Functions | snake_case | `create_subscription` |
| Methods | snake_case | `publish_batch` |
| Constants | SCREAMING_SNAKE | `DEFAULT_ACK_DEADLINE` |
| Type parameters | PascalCase, single letter | `T`, `M` |
| Lifetimes | lowercase, short | `'a`, `'msg` |

#### 1.1.4 Error Handling Patterns

```rust
// GOOD: Use Result with typed errors
pub async fn publish(&self, message: PubSubMessage) -> Result<PublishResult, PubSubError> {
    self.validate_message(&message)?;
    // ...
}

// GOOD: Use ? operator for propagation
let response = self.client.publish(request).await?;

// GOOD: Map errors with context
let message_id = response.message_ids
    .pop()
    .ok_or_else(|| PubSubError::InternalError {
        message: "No message ID returned from publish".to_string(),
        source: None,
    })?;

// GOOD: Chain errors with context
let config = self.load_config()
    .map_err(|e| PubSubError::ConfigurationError {
        message: format!("Failed to load Pub/Sub config: {}", e),
        source: Some(Box::new(e)),
    })?;

// BAD: Never use unwrap() in library code
let response = self.client.publish(request).await.unwrap(); // PROHIBITED

// BAD: Never use expect() in library code
let id = response.message_ids.first().expect("should have id"); // PROHIBITED
```

#### 1.1.5 Async Patterns

```rust
// GOOD: Use async/await
pub async fn publish(&self, message: PubSubMessage) -> Result<PublishResult, PubSubError> {
    let response = self.client.publish(request).await?;
    Ok(response)
}

// GOOD: Use streams for iteration
while let Some(message) = stream.next().await {
    process_message(message?).await?;
}

// BAD: Don't hold locks across await points
let guard = self.state.lock().await;
self.client.publish(request).await?; // Lock held across await - PROHIBITED
drop(guard);

// GOOD: Release lock before await
{
    let mut guard = self.state.lock().await;
    guard.prepare_message();
} // Lock released here
self.client.publish(request).await?; // Safe

// GOOD: Use select! for concurrent operations with cancellation
tokio::select! {
    result = stream.next() => handle_message(result),
    _ = shutdown.recv() => break,
}
```

#### 1.1.6 gRPC and Protocol Buffer Patterns

```rust
// GOOD: Use builder pattern for protobuf messages
let request = PublishRequest {
    topic: format!("projects/{}/topics/{}", project_id, topic_name),
    messages: vec![PubsubMessage {
        data: message.data.clone(),
        attributes: message.attributes.clone(),
        ordering_key: message.ordering_key.clone().unwrap_or_default(),
        ..Default::default()
    }],
};

// GOOD: Handle gRPC status codes appropriately
match status.code() {
    Code::Ok => Ok(response),
    Code::NotFound => Err(PubSubError::ResourceNotFound { .. }),
    Code::PermissionDenied => Err(PubSubError::PermissionDenied { .. }),
    Code::ResourceExhausted => Err(PubSubError::QuotaExceeded { .. }),
    Code::Unavailable | Code::Aborted => Err(PubSubError::ServiceUnavailable { .. }),
    _ => Err(PubSubError::GrpcError { .. }),
}

// GOOD: Use interceptors for auth and tracing
let channel = Channel::from_static(PUBSUB_ENDPOINT)
    .tls_config(tls_config)?
    .connect()
    .await?;

let client = PublisherClient::with_interceptor(channel, auth_interceptor);
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
| Files | kebab-case | `streaming-pull.ts` |
| Classes | PascalCase | `PubSubPublisher` |
| Interfaces | PascalCase | `PubSubMessage` |
| Types | PascalCase | `AckDeadline` |
| Functions | camelCase | `createSubscription` |
| Methods | camelCase | `publishBatch` |
| Variables | camelCase | `messageId` |
| Constants | SCREAMING_SNAKE | `DEFAULT_ACK_DEADLINE` |
| Enums | PascalCase | `AckStatus.Success` |

---

## 2. Testing Requirements

### 2.1 Test Categories

#### 2.1.1 Unit Tests

| Component | Coverage Target | Key Test Cases |
|-----------|-----------------|----------------|
| PubSubClient | 90% | Configuration, connection, shutdown |
| PubSubPublisher | 90% | Single/batch publish, ordering, retry |
| PubSubSubscriber | 90% | Pull, streaming pull, ack/nack |
| MessageBatcher | 95% | Batching logic, flush triggers, ordering |
| FlowController | 95% | Byte limits, message limits, blocking |
| SimulationLayer | 95% | Record, replay, matching, timing |
| PubSubConfig | 90% | Validation, defaults, builder |
| Error handling | 90% | All error types, conversion, retryable |

#### 2.1.2 Integration Tests

| Scenario | Description | Prerequisites |
|----------|-------------|---------------|
| Basic publish | Publish single message, verify delivery | Pub/Sub emulator or real |
| Batch publish | Publish batch, verify all delivered | Pub/Sub emulator or real |
| Ordered publish | Publish with ordering key, verify order | Pub/Sub emulator or real |
| Streaming pull | Subscribe, receive messages, ack | Pub/Sub emulator or real |
| Flow control | Verify backpressure under load | Pub/Sub emulator or real |
| Dead letter | Verify DLQ routing on nack | Pub/Sub emulator or real |
| Reconnection | Handle connection drops | Pub/Sub emulator |
| Auth refresh | Token refresh during long sessions | ADC configured |

#### 2.1.3 Simulation Tests

| Scenario | Description | Mode |
|----------|-------------|------|
| Recording | Capture publish/subscribe operations | Recording |
| Replay exact | Return recorded responses | Replay |
| Replay timing | Simulate original timing | Replay + Realistic |
| No match | Handle missing recording | Replay |
| Persistence | Save/load recordings | File storage |
| Streaming record | Record streaming pull sessions | Recording |
| Streaming replay | Replay streaming pull | Replay |
| Ordered replay | Maintain message order in replay | Replay |

### 2.2 Test Fixtures

#### 2.2.1 Message Fixtures

```rust
// tests/fixtures/messages.rs

pub fn simple_message() -> PubSubMessage {
    PubSubMessage {
        data: b"Hello, Pub/Sub!".to_vec(),
        attributes: HashMap::new(),
        ordering_key: None,
        publish_time: None,
        message_id: None,
    }
}

pub fn message_with_attributes() -> PubSubMessage {
    let mut attributes = HashMap::new();
    attributes.insert("event_type".to_string(), "user.created".to_string());
    attributes.insert("source".to_string(), "user-service".to_string());
    attributes.insert("version".to_string(), "1.0".to_string());

    PubSubMessage {
        data: b"{\"user_id\": \"123\", \"email\": \"user@example.com\"}".to_vec(),
        attributes,
        ordering_key: None,
        publish_time: None,
        message_id: None,
    }
}

pub fn ordered_message(ordering_key: &str, sequence: u32) -> PubSubMessage {
    PubSubMessage {
        data: format!("{{\"sequence\": {}}}", sequence).into_bytes(),
        attributes: HashMap::new(),
        ordering_key: Some(ordering_key.to_string()),
        publish_time: None,
        message_id: None,
    }
}

pub fn batch_messages(count: usize) -> Vec<PubSubMessage> {
    (0..count)
        .map(|i| PubSubMessage {
            data: format!("Message {}", i).into_bytes(),
            attributes: HashMap::new(),
            ordering_key: None,
            publish_time: None,
            message_id: None,
        })
        .collect()
}
```

#### 2.2.2 Response Fixtures

```rust
// tests/fixtures/responses.rs

pub fn publish_response(message_ids: Vec<&str>) -> PublishResponse {
    PublishResponse {
        message_ids: message_ids.into_iter().map(String::from).collect(),
    }
}

pub fn received_message(message_id: &str, data: &[u8], ack_id: &str) -> ReceivedMessage {
    ReceivedMessage {
        ack_id: ack_id.to_string(),
        message: Some(PubsubMessage {
            data: data.to_vec(),
            message_id: message_id.to_string(),
            publish_time: Some(prost_types::Timestamp {
                seconds: 1702468800,
                nanos: 0,
            }),
            attributes: HashMap::new(),
            ordering_key: String::new(),
        }),
        delivery_attempt: 1,
    }
}

pub fn streaming_pull_response(messages: Vec<ReceivedMessage>) -> StreamingPullResponse {
    StreamingPullResponse {
        received_messages: messages,
        acknowledge_confirmation: None,
        modify_ack_deadline_confirmation: None,
        subscription_properties: None,
    }
}
```

### 2.3 Mock Implementations

```rust
// tests/mocks/pubsub_client.rs

pub struct MockPubSubClient {
    publish_responses: Arc<RwLock<VecDeque<Result<PublishResponse, Status>>>>,
    published_messages: Arc<RwLock<Vec<PublishRequest>>>,
    pull_responses: Arc<RwLock<VecDeque<Result<PullResponse, Status>>>>,
}

impl MockPubSubClient {
    pub fn new() -> Self {
        Self {
            publish_responses: Arc::new(RwLock::new(VecDeque::new())),
            published_messages: Arc::new(RwLock::new(Vec::new())),
            pull_responses: Arc::new(RwLock::new(VecDeque::new())),
        }
    }

    pub fn expect_publish_response(&self, response: Result<PublishResponse, Status>) {
        self.publish_responses.write().unwrap().push_back(response);
    }

    pub fn verify_published(&self) -> Vec<PublishRequest> {
        self.published_messages.read().unwrap().clone()
    }
}

#[async_trait]
impl PublisherClient for MockPubSubClient {
    async fn publish(&self, request: PublishRequest) -> Result<PublishResponse, Status> {
        // Record request
        self.published_messages.write().unwrap().push(request);

        // Return queued response
        self.publish_responses
            .write()
            .unwrap()
            .pop_front()
            .unwrap_or_else(|| Err(Status::internal("No mock response configured")))
    }
}

// Mock streaming pull
pub struct MockStreamingPull {
    messages: Arc<Mutex<VecDeque<StreamingPullResponse>>>,
    acks_received: Arc<Mutex<Vec<String>>>,
}

impl MockStreamingPull {
    pub fn new(messages: Vec<StreamingPullResponse>) -> Self {
        Self {
            messages: Arc::new(Mutex::new(messages.into())),
            acks_received: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn get_acks(&self) -> Vec<String> {
        self.acks_received.lock().unwrap().clone()
    }
}
```

---

## 3. Interface Contracts

### 3.1 Publisher Interface Contracts

#### 3.1.1 PubSubPublisher Contract

```rust
/// Publisher interface contract
trait PublisherContract {
    /// Preconditions:
    /// - message.data MUST NOT exceed 10MB
    /// - message.attributes keys MUST NOT exceed 256 bytes each
    /// - message.attributes values MUST NOT exceed 1024 bytes each
    /// - Total attributes MUST NOT exceed 100
    /// - ordering_key, if present, MUST NOT exceed 1024 bytes
    ///
    /// Postconditions:
    /// - Returns PublishResult with message_id on success
    /// - Message is durably stored in Pub/Sub
    /// - Ordering is preserved for same ordering_key
    ///
    /// Invariants:
    /// - Never modifies the original message
    /// - Thread-safe (can be called concurrently)
    /// - Batching is transparent to caller
    async fn publish(&self, message: PubSubMessage) -> Result<PublishResult, PubSubError>;

    /// Preconditions:
    /// - All messages in batch satisfy single-message preconditions
    /// - Batch size MUST NOT exceed 1000 messages
    /// - Total batch size MUST NOT exceed 10MB
    ///
    /// Postconditions:
    /// - Returns Vec<PublishResult> with message_ids
    /// - All messages are published atomically per ordering_key
    /// - Partial failure returns error with details
    async fn publish_batch(&self, messages: Vec<PubSubMessage>)
        -> Result<Vec<PublishResult>, PubSubError>;

    /// Preconditions: None (safe to call anytime)
    ///
    /// Postconditions:
    /// - All pending messages are sent
    /// - Returns after all acknowledgments received
    /// - No messages are lost
    async fn flush(&self) -> Result<(), PubSubError>;
}
```

#### 3.1.2 MessageBatcher Contract

```rust
/// Batcher interface contract
trait BatcherContract {
    /// Preconditions:
    /// - Message satisfies size constraints
    ///
    /// Postconditions:
    /// - Message is added to batch
    /// - Batch is flushed if threshold reached
    /// - Returns future that completes when message is published
    ///
    /// Invariants:
    /// - Messages with same ordering_key stay in same batch
    /// - Batch never exceeds configured limits
    /// - Flush triggers are: max_messages, max_bytes, max_delay
    async fn add(&self, message: PubSubMessage) -> impl Future<Output = Result<PublishResult, PubSubError>>;

    /// Invariants:
    /// - Current batch size never exceeds max_bytes
    /// - Current batch count never exceeds max_messages
    fn current_batch_size(&self) -> (usize, usize); // (messages, bytes)
}
```

### 3.2 Subscriber Interface Contracts

#### 3.2.1 PubSubSubscriber Contract

```rust
/// Subscriber interface contract
trait SubscriberContract {
    /// Preconditions:
    /// - Subscription exists and is accessible
    /// - max_messages > 0 and <= 1000
    ///
    /// Postconditions:
    /// - Returns up to max_messages received messages
    /// - Messages have ack deadline extended
    /// - Empty vec if no messages available
    ///
    /// Invariants:
    /// - Messages are delivered at-least-once
    /// - Message order preserved for same ordering_key
    async fn pull(&self, max_messages: i32) -> Result<Vec<ReceivedMessage>, PubSubError>;

    /// Preconditions: None
    ///
    /// Postconditions:
    /// - Returns Stream of ReceivedMessage
    /// - Stream continues until cancelled or error
    /// - Flow control is applied automatically
    ///
    /// Invariants:
    /// - Backpressure is respected
    /// - Messages are auto-extended while processing
    /// - Connection is maintained/reconnected transparently
    async fn streaming_pull(&self) -> Result<impl Stream<Item = Result<ReceivedMessage, PubSubError>>, PubSubError>;

    /// Preconditions:
    /// - ack_id is valid (from received message)
    ///
    /// Postconditions:
    /// - Message is acknowledged
    /// - Message will not be redelivered
    ///
    /// Invariants:
    /// - Ack is idempotent (duplicate acks are safe)
    async fn ack(&self, ack_id: &str) -> Result<(), PubSubError>;

    /// Preconditions:
    /// - ack_id is valid (from received message)
    ///
    /// Postconditions:
    /// - Message is negatively acknowledged
    /// - Message will be redelivered (subject to DLQ policy)
    async fn nack(&self, ack_id: &str) -> Result<(), PubSubError>;

    /// Preconditions:
    /// - ack_id is valid
    /// - deadline is within allowed range (0-600 seconds)
    ///
    /// Postconditions:
    /// - Ack deadline is extended
    async fn modify_ack_deadline(&self, ack_id: &str, deadline_seconds: i32) -> Result<(), PubSubError>;
}
```

### 3.3 Simulation Layer Contract

```rust
/// Simulation layer interface contract
trait SimulationLayerContract {
    /// Preconditions:
    /// - In Recording mode: client MUST be connected to real Pub/Sub
    /// - In Replay mode: recordings MUST be loaded
    ///
    /// Postconditions:
    /// - In Disabled mode: passes through to client unchanged
    /// - In Recording mode: response is recorded before returning
    /// - In Replay mode: recorded response is returned
    ///
    /// Invariants:
    /// - Mode can be changed at runtime
    /// - Recording order matches operation order
    /// - Replay is deterministic for same recordings
    async fn intercept_publish(
        &self,
        topic: &str,
        messages: &[PubSubMessage],
        executor: impl Future<Output = Result<PublishResponse, Status>>,
    ) -> Result<PublishResponse, PubSubError>;

    async fn intercept_pull(
        &self,
        subscription: &str,
        max_messages: i32,
        executor: impl Future<Output = Result<PullResponse, Status>>,
    ) -> Result<Vec<ReceivedMessage>, PubSubError>;

    /// Recording persistence contract:
    /// - Recordings are JSON-serializable
    /// - File format is versioned
    /// - Loading validates format version
    async fn save_recordings(&self, path: &Path) -> Result<(), PubSubError>;
    async fn load_recordings(&self, path: &Path) -> Result<(), PubSubError>;
}
```

### 3.4 Type Contracts

#### 3.4.1 PubSubMessage Type Contract

```rust
/// Message type contract
struct PubSubMessage {
    /// Data MUST NOT exceed 10MB
    /// Data MAY be empty
    data: Vec<u8>,

    /// Attributes keys: max 256 bytes each
    /// Attributes values: max 1024 bytes each
    /// Total attributes: max 100
    attributes: HashMap<String, String>,

    /// Ordering key: max 1024 bytes if present
    /// Messages with same key are delivered in order
    ordering_key: Option<String>,

    /// Set by server on publish (read-only)
    publish_time: Option<Timestamp>,

    /// Set by server on publish (read-only)
    message_id: Option<String>,
}

impl PubSubMessage {
    /// Validation:
    /// - Data size within limits
    /// - Attribute constraints satisfied
    /// - Ordering key length within limits
    fn validate(&self) -> Result<(), PubSubError>;
}
```

#### 3.4.2 FlowControlSettings Contract

```rust
/// Flow control settings contract
struct FlowControlSettings {
    /// Maximum outstanding bytes before blocking
    /// MUST be positive
    max_outstanding_bytes: i64,

    /// Maximum outstanding messages before blocking
    /// MUST be positive
    max_outstanding_messages: i64,

    /// Maximum extension period for ack deadline
    /// MUST be in range [10, 600] seconds
    max_extension_period: Duration,

    /// Minimum extension period for ack deadline
    /// MUST be in range [10, 600] seconds
    /// MUST be <= max_extension_period
    min_extension_period: Duration,
}

impl FlowControlSettings {
    fn validate(&self) -> Result<(), PubSubError>;
}
```

---

## 4. Constraints and Invariants

### 4.1 System Constraints

#### 4.1.1 Thin Adapter Constraints

| Constraint | Description | Verification |
|------------|-------------|--------------|
| No business logic | Module only translates API calls | Code review |
| No infrastructure | No topic/subscription creation | API audit |
| No IAM management | Uses shared auth only | Dependency check |
| No deployment logic | Not responsible for Pub/Sub lifecycle | Code review |
| No logging system | Uses shared logging primitive | Dependency check |
| No metrics system | Uses shared metrics primitive | Dependency check |

#### 4.1.2 Dependency Constraints

| Constraint | Enforcement |
|------------|-------------|
| No cross-module deps | CI check: deny dependencies on other integrations |
| Shared primitives only | CI check: allowlist external dependencies |
| No ruvbase | CI check: explicit deny |
| Minimal external crates | Review: justify each new dependency |
| gRPC dependencies | Allow: tonic, prost, prost-types |
| Auth dependencies | Allow: google-cloud-auth (via shared primitives) |

### 4.2 Runtime Invariants

#### 4.2.1 Connection Invariants

```
INVARIANT: gRPCConnection
- Connections use TLS with Google root certificates
- Channel is reused for all operations
- Reconnection is automatic on transient failures
- Auth tokens are refreshed before expiry

INVARIANT: StreamingPullConnection
- Bidirectional stream is maintained
- Ack/nack/modifyAckDeadline sent on request stream
- Messages received on response stream
- Stream is reconnected on failure with backoff
```

#### 4.2.2 Publishing Invariants

```
INVARIANT: BatchingBehavior
- Messages are batched by ordering key
- Batch is sent when any threshold is reached
- Flush sends all pending batches immediately
- Ordering is preserved within ordering key

INVARIANT: PublishRetry
- Transient errors trigger retry with backoff
- Permanent errors fail immediately
- Ordering key is "paused" on failure until resumed
- Max retries is configurable (default: 3)

INVARIANT: OrderingGuarantee
- Messages with ordering_key published in order
- Failed publish pauses ordering key
- Must call resume_publish(ordering_key) to continue
```

#### 4.2.3 Subscribing Invariants

```
INVARIANT: AtLeastOnceDelivery
- Messages may be delivered multiple times
- Ack removes message from queue
- Nack or deadline expiry triggers redelivery
- DLQ routing after max delivery attempts

INVARIANT: FlowControl
- Outstanding messages limited by count and bytes
- New messages blocked when limits reached
- Ack/nack releases capacity
- Backpressure propagates to server

INVARIANT: AckDeadlineManagement
- Initial deadline set on receipt
- Deadline auto-extended while processing
- Extension stops when message is ack'd/nack'd
- Deadline expiry triggers redelivery
```

#### 4.2.4 Simulation Invariants

```
INVARIANT: RecordingIntegrity
- Recording captures complete request/response
- Timing information is accurate
- Recordings are idempotent (same request = same recording)
- Concurrent recordings are isolated

INVARIANT: ReplayDeterminism
- Same recording + same matching mode = same response
- Timing simulation is consistent
- No side effects during replay (no network calls)
- Missing recording = explicit error

INVARIANT: StreamingReplay
- Streaming pull can be recorded and replayed
- Message delivery order is preserved
- Ack/nack operations are captured
- Timing between messages can be simulated
```

### 4.3 Error Invariants

```
INVARIANT: ErrorRecovery
- All errors are typed (PubSubError variants)
- Retryable errors are identifiable (is_retryable())
- gRPC status codes are mapped to error types
- Recovery hints are provided where applicable

INVARIANT: ErrorContext
- Errors include relevant context (topic, subscription, message_id)
- Sensitive data is never included in errors
- gRPC metadata is not exposed to callers
- Errors are serializable (for logging)

INVARIANT: OrderingKeyErrors
- Ordering key failure pauses only that key
- Other ordering keys continue functioning
- Clear error indicates which key failed
- Explicit resume required to continue
```

---

## 5. Performance Requirements

### 5.1 Latency Targets

| Operation | Target (p50) | Target (p99) | Notes |
|-----------|--------------|--------------|-------|
| Client initialization | < 50ms | < 200ms | Includes auth token fetch |
| Single publish | < 20ms | < 100ms | With batching disabled |
| Batch publish (100 msgs) | < 30ms | < 150ms | Single API call |
| Streaming pull setup | < 100ms | < 500ms | Initial connection |
| Message receive latency | < 10ms | < 50ms | After publish |
| Ack latency | < 5ms | < 20ms | Batched acks |

### 5.2 Throughput Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Publish throughput | 10,000 msg/sec | With batching |
| Publish bytes | 100 MB/sec | Sustained |
| Subscribe throughput | 10,000 msg/sec | Per subscriber |
| Concurrent publishers | 100+ | Per client |
| Concurrent subscribers | 100+ | Per client |
| Recording throughput | 5,000 ops/sec | In-memory storage |
| Replay throughput | 50,000 ops/sec | No I/O during replay |

### 5.3 Resource Limits

| Resource | Limit | Notes |
|----------|-------|-------|
| Memory per publisher | < 50MB | Including batches |
| Memory per subscriber | < 100MB | Including flow control |
| gRPC channel count | 1 (default) | Can be pooled if needed |
| Outstanding publish bytes | 100MB (default) | Configurable |
| Outstanding subscribe bytes | 100MB (default) | Configurable |
| Outstanding subscribe msgs | 1000 (default) | Configurable |
| Recording storage | Unbounded (memory) | Use file storage for large tests |

### 5.4 Benchmarks

```rust
// benches/publish_bench.rs

use criterion::{black_box, criterion_group, criterion_main, Criterion, Throughput};

fn bench_message_serialization(c: &mut Criterion) {
    let message = fixtures::message_with_attributes();

    let mut group = c.benchmark_group("serialization");
    group.throughput(Throughput::Elements(1));

    group.bench_function("pubsub_message_to_proto", |b| {
        b.iter(|| {
            let proto: PubsubMessage = black_box(&message).into();
            black_box(proto)
        })
    });

    group.finish();
}

fn bench_batch_assembly(c: &mut Criterion) {
    let messages = fixtures::batch_messages(100);

    let mut group = c.benchmark_group("batching");
    group.throughput(Throughput::Elements(100));

    group.bench_function("assemble_batch_100", |b| {
        b.iter(|| {
            let batch: Vec<PubsubMessage> = black_box(&messages)
                .iter()
                .map(|m| m.into())
                .collect();
            black_box(batch)
        })
    });

    group.finish();
}

fn bench_simulation_replay(c: &mut Criterion) {
    let layer = setup_simulation_layer_with_recordings();
    let message = fixtures::simple_message();

    let mut group = c.benchmark_group("simulation");
    group.throughput(Throughput::Elements(1));

    group.bench_function("replay_publish", |b| {
        b.to_async(tokio::runtime::Runtime::new().unwrap())
            .iter(|| async {
                layer
                    .intercept_publish("test-topic", &[message.clone()], async {
                        unreachable!() // Should use recording
                    })
                    .await
                    .unwrap()
            })
    });

    group.finish();
}

fn bench_flow_control(c: &mut Criterion) {
    let controller = FlowController::new(FlowControlSettings::default());

    let mut group = c.benchmark_group("flow_control");
    group.throughput(Throughput::Elements(1));

    group.bench_function("acquire_release", |b| {
        b.iter(|| {
            let permit = controller.try_acquire(1000).unwrap();
            black_box(permit);
        })
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_message_serialization,
    bench_batch_assembly,
    bench_simulation_replay,
    bench_flow_control,
);
criterion_main!(benches);
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
| Message serialization p99 | < 1ms | criterion |
| Batch assembly (100 msgs) p99 | < 5ms | criterion |
| Simulation replay p99 | < 0.1ms | criterion |
| Memory growth | < 10MB/10000 requests | valgrind |

### 6.3 Integration Gates

| Gate | Threshold | Notes |
|------|-----------|-------|
| All unit tests pass | 100% | Required for merge |
| Integration tests pass | 100% | With simulation or emulator |
| No dependency cycles | 0 | cargo-deny |
| No unsafe code | 0 (or audited) | Manual review |
| gRPC compatibility | All protos compile | buf lint |

---

## 7. CI/CD Configuration

### 7.1 GitHub Actions Workflow

```yaml
# .github/workflows/google-cloud-pubsub.yml
name: Google Cloud Pub/Sub Integration CI

on:
  push:
    paths:
      - 'google-cloud-pubsub/**'
      - '.github/workflows/google-cloud-pubsub.yml'
  pull_request:
    paths:
      - 'google-cloud-pubsub/**'

env:
  CARGO_TERM_COLOR: always
  RUST_BACKTRACE: 1

jobs:
  test-rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt

      - name: Install protoc
        uses: arduino/setup-protoc@v2
        with:
          version: '24.x'

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: google-cloud-pubsub/rust

      - name: Check formatting
        run: cargo fmt --check
        working-directory: google-cloud-pubsub/rust

      - name: Clippy
        run: cargo clippy --all-targets -- -D warnings
        working-directory: google-cloud-pubsub/rust

      - name: Unit tests
        run: cargo test --lib
        working-directory: google-cloud-pubsub/rust

      - name: Integration tests (simulation mode)
        run: cargo test --test '*' -- --test-threads=1
        working-directory: google-cloud-pubsub/rust
        env:
          PUBSUB_SIMULATION: replay

      - name: Coverage
        run: |
          cargo install cargo-llvm-cov
          cargo llvm-cov --lcov --output-path lcov.info
        working-directory: google-cloud-pubsub/rust

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: google-cloud-pubsub/rust/lcov.info
          flags: rust-pubsub

  test-typescript:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: google-cloud-pubsub/typescript/package-lock.json

      - name: Install dependencies
        run: npm ci
        working-directory: google-cloud-pubsub/typescript

      - name: Lint
        run: npm run lint
        working-directory: google-cloud-pubsub/typescript

      - name: Type check
        run: npm run typecheck
        working-directory: google-cloud-pubsub/typescript

      - name: Unit tests
        run: npm test -- --coverage
        working-directory: google-cloud-pubsub/typescript

      - name: Build
        run: npm run build
        working-directory: google-cloud-pubsub/typescript

  # Integration tests with Pub/Sub emulator
  integration-test-emulator:
    runs-on: ubuntu-latest
    services:
      pubsub-emulator:
        image: gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators
        ports:
          - 8085:8085
        options: >-
          --health-cmd "curl -f http://localhost:8085 || exit 1"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        env:
          PUBSUB_PROJECT_ID: test-project

    steps:
      - uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install protoc
        uses: arduino/setup-protoc@v2

      - name: Create test resources
        run: |
          curl -X PUT "http://localhost:8085/v1/projects/test-project/topics/test-topic"
          curl -X PUT "http://localhost:8085/v1/projects/test-project/subscriptions/test-subscription" \
            -H "Content-Type: application/json" \
            -d '{"topic": "projects/test-project/topics/test-topic"}'

      - name: Integration tests (emulator)
        run: cargo test --test '*' -- --test-threads=1
        working-directory: google-cloud-pubsub/rust
        env:
          PUBSUB_EMULATOR_HOST: localhost:8085
          PUBSUB_PROJECT_ID: test-project

  # Optional: Integration tests with real Pub/Sub
  integration-test-real:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install protoc
        uses: arduino/setup-protoc@v2

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Integration tests (real Pub/Sub)
        run: cargo test --test '*' -- --test-threads=1 --ignored
        working-directory: google-cloud-pubsub/rust
        env:
          PUBSUB_PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
```

### 7.2 Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: rust-fmt-pubsub
        name: Rust Format (Pub/Sub)
        entry: cargo fmt --manifest-path google-cloud-pubsub/rust/Cargo.toml --
        language: system
        types: [rust]
        pass_filenames: false

      - id: rust-clippy-pubsub
        name: Rust Clippy (Pub/Sub)
        entry: cargo clippy --manifest-path google-cloud-pubsub/rust/Cargo.toml --all-targets -- -D warnings
        language: system
        types: [rust]
        pass_filenames: false

      - id: rust-test-pubsub
        name: Rust Tests (Pub/Sub)
        entry: cargo test --manifest-path google-cloud-pubsub/rust/Cargo.toml --lib
        language: system
        types: [rust]
        pass_filenames: false

      - id: proto-lint
        name: Protobuf Lint
        entry: buf lint
        language: system
        types: [proto]
        pass_filenames: false
```

### 7.3 Emulator Docker Compose

```yaml
# docker-compose.test.yml
version: '3.8'

services:
  pubsub-emulator:
    image: gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators
    command: gcloud beta emulators pubsub start --host-port=0.0.0.0:8085 --project=test-project
    ports:
      - "8085:8085"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8085"]
      interval: 5s
      timeout: 5s
      retries: 10

  test-runner:
    build:
      context: .
      dockerfile: Dockerfile.test
    depends_on:
      pubsub-emulator:
        condition: service_healthy
    environment:
      - PUBSUB_EMULATOR_HOST=pubsub-emulator:8085
      - PUBSUB_PROJECT_ID=test-project
    volumes:
      - ./google-cloud-pubsub:/app/google-cloud-pubsub
    command: cargo test --test '*' -- --test-threads=1
```

---

## 8. Open Questions

### 8.1 Design Questions

| Question | Options | Decision |
|----------|---------|----------|
| Should we support exactly-once delivery? | No / Yes (with deduplication) | TBD - At-least-once first, consider exactly-once wrapper |
| How to handle schema validation? | No validation / Schema registry / Custom | TBD - No validation initially, add schema support later |
| Recording file format | JSON / Protobuf / Custom binary | TBD - JSON for readability, consider Protobuf for perf |
| Should we support push subscriptions? | No / Read-only / Full support | TBD - Pull-only initially, push is infrastructure concern |

### 8.2 Implementation Questions

| Question | Context | Resolution Path |
|----------|---------|-----------------|
| How to handle very long-running streams? | Streaming pull may run for hours | Implement keepalive, reconnection, lease renewal |
| Connection pooling strategy? | Single channel vs pool | Start with single channel, add pooling if needed |
| Simulation matching algorithm? | Exact vs fuzzy matching | Start strict (topic + attributes), add relaxed mode |
| Ordering key failure recovery? | Auto-resume vs manual | Start with manual resume, add auto-recovery option |

### 8.3 Testing Questions

| Question | Context | Resolution Path |
|----------|---------|-----------------|
| How to test without GCP? | CI may not have GCP access | Emulator is primary, simulation for unit tests |
| Emulator limitations? | Some features may not be emulated | Document unsupported features, use simulation |
| Recording versioning? | What if Pub/Sub API changes? | Version recordings, validate on load |
| Performance baseline? | Need reproducible benchmarks | Use fixed message sizes, emulator for consistency |

### 8.4 Operational Questions

| Question | Context | Resolution Path |
|----------|---------|-----------------|
| How to monitor backlog? | Subscription backlog growth | Expose metrics for shared metrics primitive |
| Alerting on DLQ? | Dead letter messages need attention | Emit events for orchestration layer |
| Quotas and limits? | GCP has per-project quotas | Document limits, expose quota metrics |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-PUBSUB-REFINE-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Refinement Document**

*SPARC Phase 4 Complete - Proceed to Completion phase with "Next phase."*
