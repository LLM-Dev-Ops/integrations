# Google Cloud Logging Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/gcl`

---

## 1. Core Client Interface (Rust)

### 1.1 GclClient

```rust
pub struct GclClient {
    config: GclConfig,
    auth: Arc<dyn GcpAuthProvider>,
    transport: Arc<GrpcTransport>,
    buffer: Arc<LogBuffer>,
    circuit_breaker: Arc<CircuitBreaker>,
    flush_handle: Option<JoinHandle<()>>,
}

impl GclClient {
    pub fn new(config: GclConfig) -> Result<Self, GclError>;
    pub fn builder() -> GclClientBuilder;
    pub fn writer(&self) -> LogWriter;
    pub fn querier(&self) -> LogQuerier;
    pub fn tailer(&self) -> LogTailer;
    pub fn mock() -> MockGclClient;
    pub async fn shutdown(self) -> Result<(), GclError>;
}

pub struct GclClientBuilder {
    project_id: Option<String>,
    credentials: Option<GcpCredentials>,
    log_id: Option<String>,
    resource: Option<MonitoredResource>,
    buffer_config: BufferConfig,
    retry_config: RetryConfig,
    circuit_breaker_config: CircuitBreakerConfig,
    default_labels: HashMap<String, String>,
}

impl GclClientBuilder {
    pub fn new() -> Self;
    pub fn project_id(self, id: impl Into<String>) -> Self;
    pub fn credentials(self, creds: GcpCredentials) -> Self;
    pub fn log_id(self, id: impl Into<String>) -> Self;
    pub fn resource(self, resource: MonitoredResource) -> Self;
    pub fn buffer_config(self, config: BufferConfig) -> Self;
    pub fn default_label(self, key: impl Into<String>, value: impl Into<String>) -> Self;
    pub fn build(self) -> Result<GclClient, GclError>;
}
```

### 1.2 Configuration Types

```rust
#[derive(Clone, Debug)]
pub struct GclConfig {
    pub project_id: String,
    pub log_id: String,
    pub resource: MonitoredResource,
    pub credentials: GcpCredentials,
    pub buffer_config: BufferConfig,
    pub retry_config: RetryConfig,
    pub circuit_breaker_config: CircuitBreakerConfig,
    pub default_labels: HashMap<String, String>,
    pub endpoint: Option<String>,
}

#[derive(Clone, Debug)]
pub struct BufferConfig {
    pub max_entries: usize,           // Default: 1000
    pub max_bytes: usize,             // Default: 10MB
    pub flush_threshold: usize,       // Default: 500
    pub flush_interval: Duration,     // Default: 1s
    pub flush_byte_threshold: usize,  // Default: 5MB
}

impl Default for BufferConfig {
    fn default() -> Self {
        Self {
            max_entries: 1000,
            max_bytes: 10 * 1024 * 1024,
            flush_threshold: 500,
            flush_interval: Duration::from_secs(1),
            flush_byte_threshold: 5 * 1024 * 1024,
        }
    }
}
```

---

## 2. Service Interfaces

### 2.1 LogWriter

```rust
#[async_trait]
pub trait LogWriterTrait: Send + Sync {
    async fn write(&self, entry: LogEntry) -> Result<(), GclError>;
    async fn write_batch(&self, entries: Vec<LogEntry>) -> Result<BatchWriteResult, GclError>;
    async fn flush(&self) -> Result<(), GclError>;
}

pub struct LogWriter {
    client: Arc<GclClientInner>,
}

impl LogWriter {
    pub fn entry(&self, severity: Severity) -> LogEntryBuilder;
}

pub struct LogEntryBuilder {
    writer: LogWriter,
    entry: LogEntry,
}

impl LogEntryBuilder {
    pub fn message(self, msg: impl Into<String>) -> Self;
    pub fn json_payload<T: Serialize>(self, payload: T) -> Result<Self, GclError>;
    pub fn label(self, key: impl Into<String>, value: impl Into<String>) -> Self;
    pub fn trace(self, trace_id: impl Into<String>) -> Self;
    pub fn span(self, span_id: impl Into<String>) -> Self;
    pub fn source_location(self, file: &str, line: u32, function: &str) -> Self;
    pub fn insert_id(self, id: impl Into<String>) -> Self;
    pub async fn send(self) -> Result<(), GclError>;
}

#[derive(Clone, Debug)]
pub struct BatchWriteResult {
    pub success_count: usize,
    pub failure_count: usize,
    pub failures: Vec<(String, GclError)>, // (insert_id, error)
}
```

### 2.2 LogQuerier

```rust
#[async_trait]
pub trait LogQuerierTrait: Send + Sync {
    async fn query(&self, request: QueryRequest) -> Result<QueryResponse, GclError>;
    fn query_all(&self, request: QueryRequest) -> BoxStream<'static, Result<LogEntry, GclError>>;
    async fn query_by_trace(&self, trace_id: &str, options: CorrelationOptions) -> Result<CorrelatedLogs, GclError>;
}

pub struct LogQuerier {
    client: Arc<GclClientInner>,
}

impl LogQuerier {
    pub fn filter(&self) -> FilterBuilder;
}

pub struct FilterBuilder {
    querier: LogQuerier,
    parts: Vec<String>,
}

impl FilterBuilder {
    pub fn severity_gte(self, severity: Severity) -> Self;
    pub fn severity_eq(self, severity: Severity) -> Self;
    pub fn resource_type(self, rtype: impl Into<String>) -> Self;
    pub fn label(self, key: impl Into<String>, value: impl Into<String>) -> Self;
    pub fn text_contains(self, text: impl Into<String>) -> Self;
    pub fn json_field(self, path: impl Into<String>, value: impl Into<String>) -> Self;
    pub fn time_range(self, start: DateTime<Utc>, end: DateTime<Utc>) -> Self;
    pub fn trace(self, trace_id: impl Into<String>) -> Self;
    pub fn raw(self, filter: impl Into<String>) -> Self;
    pub fn and(self) -> Self;
    pub fn or(self) -> Self;
    pub fn build(self) -> QueryRequest;
    pub async fn execute(self) -> Result<QueryResponse, GclError>;
    pub fn stream(self) -> BoxStream<'static, Result<LogEntry, GclError>>;
}
```

### 2.3 LogTailer

```rust
#[async_trait]
pub trait LogTailerTrait: Send + Sync {
    async fn tail(&self, request: TailRequest) -> Result<TailStream, GclError>;
}

pub struct LogTailer {
    client: Arc<GclClientInner>,
}

pub struct TailStream {
    inner: Pin<Box<dyn Stream<Item = Result<LogEntry, GclError>> + Send>>,
    handle: TailHandle,
}

impl Stream for TailStream {
    type Item = Result<LogEntry, GclError>;
    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>>;
}

impl TailStream {
    pub fn handle(&self) -> TailHandle;
}

#[derive(Clone)]
pub struct TailHandle {
    cancel_tx: broadcast::Sender<()>,
}

impl TailHandle {
    pub fn cancel(&self);
    pub fn is_active(&self) -> bool;
}
```

---

## 3. Request/Response Types

### 3.1 Log Entry Types

```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LogEntry {
    pub log_name: Option<String>,
    pub resource: Option<MonitoredResource>,
    pub timestamp: Option<DateTime<Utc>>,
    pub receive_timestamp: Option<DateTime<Utc>>,
    pub severity: Severity,
    pub insert_id: Option<String>,
    pub labels: HashMap<String, String>,
    pub text_payload: Option<String>,
    pub json_payload: Option<serde_json::Value>,
    pub trace: Option<String>,
    pub span_id: Option<String>,
    pub trace_sampled: Option<bool>,
    pub source_location: Option<SourceLocation>,
    pub operation: Option<LogEntryOperation>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SourceLocation {
    pub file: String,
    pub line: i64,
    pub function: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LogEntryOperation {
    pub id: String,
    pub producer: String,
    pub first: bool,
    pub last: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MonitoredResource {
    pub r#type: String,
    pub labels: HashMap<String, String>,
}

impl MonitoredResource {
    pub fn global(project_id: &str) -> Self;
    pub fn gce_instance(project_id: &str, zone: &str, instance_id: &str) -> Self;
    pub fn k8s_container(project_id: &str, location: &str, cluster: &str, namespace: &str, pod: &str, container: &str) -> Self;
    pub fn cloud_run_revision(project_id: &str, location: &str, service: &str, revision: &str) -> Self;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[repr(i32)]
pub enum Severity {
    Default = 0,
    Debug = 100,
    Info = 200,
    Notice = 300,
    Warning = 400,
    Error = 500,
    Critical = 600,
    Alert = 700,
    Emergency = 800,
}
```

### 3.2 Query Types

```rust
#[derive(Clone, Debug, Default)]
pub struct QueryRequest {
    pub resource_names: Vec<String>,
    pub filter: Option<String>,
    pub order_by: Option<String>,
    pub page_size: Option<i32>,
    pub page_token: Option<String>,
}

#[derive(Clone, Debug)]
pub struct QueryResponse {
    pub entries: Vec<LogEntry>,
    pub next_page_token: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub struct CorrelationOptions {
    pub resources: Option<Vec<String>>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub include_children: bool,
}

#[derive(Clone, Debug)]
pub struct CorrelatedLogs {
    pub trace_id: String,
    pub entries: Vec<LogEntry>,
    pub span_tree: SpanNode,
    pub services: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct SpanNode {
    pub span_id: String,
    pub service: Option<String>,
    pub entries: Vec<LogEntry>,
    pub children: Vec<SpanNode>,
}
```

### 3.3 Tail Types

```rust
#[derive(Clone, Debug)]
pub struct TailRequest {
    pub resource_names: Vec<String>,
    pub filter: Option<String>,
    pub buffer_window: Option<Duration>,
}

#[derive(Clone, Debug)]
pub struct SuppressionInfo {
    pub reason: SuppressionReason,
    pub suppressed_count: i32,
}

#[derive(Clone, Debug)]
pub enum SuppressionReason {
    RateLimited,
    NotConsumed,
}
```

---

## 4. Error Types

```rust
#[derive(Debug, thiserror::Error)]
pub enum GclError {
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    #[error("Authentication error: {0}")]
    Authentication(#[from] AuthenticationError),

    #[error("Write error: {0}")]
    Write(#[from] WriteError),

    #[error("Query error: {0}")]
    Query(#[from] QueryError),

    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    #[error("Server error: {0}")]
    Server(#[from] ServerError),
}

impl GclError {
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            GclError::Server(ServerError::RateLimited { .. })
                | GclError::Server(ServerError::ServiceUnavailable { .. })
                | GclError::Server(ServerError::InternalError { .. })
                | GclError::Network(NetworkError::Timeout { .. })
                | GclError::Network(NetworkError::ConnectionFailed { .. })
                | GclError::Authentication(AuthenticationError::TokenExpired)
        )
    }

    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            GclError::Server(ServerError::RateLimited { retry_after, .. }) => *retry_after,
            _ => None,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum WriteError {
    #[error("Payload too large: {size} bytes exceeds {max} limit")]
    PayloadTooLarge { size: usize, max: usize },

    #[error("Invalid entry: {reason}")]
    InvalidEntry { reason: String },

    #[error("Partial failure: {success_count} succeeded, {failure_count} failed")]
    PartialFailure { success_count: usize, failure_count: usize },

    #[error("Buffer overflow: buffer full, entry dropped")]
    BufferOverflow,

    #[error("Circuit breaker open")]
    CircuitOpen,
}

#[derive(Debug, thiserror::Error)]
pub enum QueryError {
    #[error("Invalid filter: {reason}")]
    InvalidFilter { reason: String },

    #[error("Invalid time range: start {start} is after end {end}")]
    InvalidTimeRange { start: DateTime<Utc>, end: DateTime<Utc> },

    #[error("Results truncated: too many matches")]
    ResultsTruncated,
}
```

---

## 5. TypeScript Interfaces

```typescript
interface GclClient {
  readonly writer: LogWriter;
  readonly querier: LogQuerier;
  readonly tailer: LogTailer;
  shutdown(): Promise<void>;
}

interface LogWriter {
  write(entry: LogEntry): Promise<void>;
  writeBatch(entries: LogEntry[]): Promise<BatchWriteResult>;
  flush(): Promise<void>;
  entry(severity: Severity): LogEntryBuilder;
}

interface LogEntryBuilder {
  message(msg: string): LogEntryBuilder;
  jsonPayload<T>(payload: T): LogEntryBuilder;
  label(key: string, value: string): LogEntryBuilder;
  trace(traceId: string): LogEntryBuilder;
  span(spanId: string): LogEntryBuilder;
  send(): Promise<void>;
}

interface LogQuerier {
  query(request: QueryRequest): Promise<QueryResponse>;
  queryAll(request: QueryRequest): AsyncIterable<LogEntry>;
  queryByTrace(traceId: string, options?: CorrelationOptions): Promise<CorrelatedLogs>;
  filter(): FilterBuilder;
}

interface FilterBuilder {
  severityGte(severity: Severity): FilterBuilder;
  label(key: string, value: string): FilterBuilder;
  textContains(text: string): FilterBuilder;
  jsonField(path: string, value: string): FilterBuilder;
  timeRange(start: Date, end: Date): FilterBuilder;
  trace(traceId: string): FilterBuilder;
  and(): FilterBuilder;
  or(): FilterBuilder;
  execute(): Promise<QueryResponse>;
  stream(): AsyncIterable<LogEntry>;
}

interface LogTailer {
  tail(request: TailRequest): Promise<TailStream>;
}

interface TailStream extends AsyncIterable<LogEntry> {
  cancel(): void;
  isActive(): boolean;
}

// Types
interface LogEntry {
  logName?: string;
  resource?: MonitoredResource;
  timestamp?: Date;
  severity: Severity;
  insertId?: string;
  labels: Record<string, string>;
  textPayload?: string;
  jsonPayload?: unknown;
  trace?: string;
  spanId?: string;
  sourceLocation?: SourceLocation;
}

interface MonitoredResource {
  type: string;
  labels: Record<string, string>;
}

type Severity = 'DEFAULT' | 'DEBUG' | 'INFO' | 'NOTICE' | 'WARNING' | 'ERROR' | 'CRITICAL' | 'ALERT' | 'EMERGENCY';

interface QueryRequest {
  resourceNames: string[];
  filter?: string;
  orderBy?: string;
  pageSize?: number;
  pageToken?: string;
}

interface QueryResponse {
  entries: LogEntry[];
  nextPageToken?: string;
}

interface TailRequest {
  resourceNames: string[];
  filter?: string;
  bufferWindow?: number; // milliseconds
}

// Configuration
interface GclConfig {
  projectId: string;
  logId: string;
  credentials: GcpCredentials;
  resource?: MonitoredResource;
  bufferConfig?: BufferConfig;
  defaultLabels?: Record<string, string>;
}

interface BufferConfig {
  maxEntries?: number;
  maxBytes?: number;
  flushThreshold?: number;
  flushIntervalMs?: number;
}
```

---

## 6. Integration Patterns

### 6.1 With Shared Observability

```rust
use shared::observability::{current_trace_context, TracingProvider};

// Auto-correlation with current trace
let writer = client.writer();
writer.entry(Severity::Info)
    .message("Processing request")
    .json_payload(&request_data)?
    // trace/span auto-injected from current context
    .send()
    .await?;
```

### 6.2 With Shared Credentials

```rust
use shared::credentials::GcpCredentialProvider;

let creds = GcpCredentialProvider::from_env()?;
let client = GclClient::builder()
    .project_id("my-project")
    .credentials(GcpCredentials::from_provider(creds))
    .build()?;
```

### 6.3 Structured Logging Pattern

```rust
// Define application-specific log structure
#[derive(Serialize)]
struct RequestLog {
    request_id: String,
    method: String,
    path: String,
    status: u16,
    duration_ms: u64,
    user_id: Option<String>,
}

// Emit structured log
writer.entry(Severity::Info)
    .json_payload(&RequestLog {
        request_id: "req-123",
        method: "POST",
        path: "/api/inference",
        status: 200,
        duration_ms: 42,
        user_id: Some("user-456".into()),
    })?
    .label("environment", "production")
    .send()
    .await?;
```

### 6.4 Cross-Service Correlation

```rust
// Query all logs for a distributed trace
let correlated = client.querier()
    .query_by_trace("abc123def456", CorrelationOptions {
        include_children: true,
        start_time: Some(Utc::now() - Duration::hours(1)),
        ..Default::default()
    })
    .await?;

// Traverse span tree
fn print_span_tree(node: &SpanNode, depth: usize) {
    let indent = "  ".repeat(depth);
    println!("{}[{}] {} entries", indent, node.span_id, node.entries.len());
    for child in &node.children {
        print_span_tree(child, depth + 1);
    }
}
print_span_tree(&correlated.span_tree, 0);
```

### 6.5 Live Tail with Processing

```rust
let mut stream = client.tailer()
    .tail(TailRequest {
        resource_names: vec![format!("projects/{}", project_id)],
        filter: Some("severity >= ERROR".into()),
        buffer_window: Some(Duration::from_secs(5)),
    })
    .await?;

// Process entries as they arrive
while let Some(result) = stream.next().await {
    match result {
        Ok(entry) => {
            alert_on_error(&entry).await;
        }
        Err(e) if e.is_retryable() => {
            // Stream will auto-reconnect
            continue;
        }
        Err(e) => {
            log::error!("Tail stream failed: {}", e);
            break;
        }
    }
}
```

---

## 7. Mock/Simulation Usage

```rust
#[tokio::test]
async fn test_log_correlation() {
    let mock = GclClient::mock()
        .with_query_response(
            "trace = \"projects/test/traces/abc123\"",
            QueryResponse {
                entries: vec![
                    mock_entry(Severity::Info, "span-1", "Request received"),
                    mock_entry(Severity::Info, "span-2", "Processing"),
                    mock_entry(Severity::Info, "span-1", "Response sent"),
                ],
                next_page_token: None,
            }
        );

    let correlated = mock.querier()
        .query_by_trace("abc123", Default::default())
        .await
        .unwrap();

    assert_eq!(correlated.entries.len(), 3);
    assert_eq!(correlated.span_tree.children.len(), 1);
}

#[tokio::test]
async fn test_buffered_writes() {
    let mock = GclClient::mock()
        .expect_write_batch(|entries| entries.len() >= 2);

    let writer = mock.writer();
    writer.entry(Severity::Info).message("First").send().await.unwrap();
    writer.entry(Severity::Info).message("Second").send().await.unwrap();
    writer.flush().await.unwrap();

    mock.verify().unwrap();
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Refinement phase |

---

**Next Phase:** Completion - Acceptance criteria verification, test coverage requirements, security checklist, and release criteria.
