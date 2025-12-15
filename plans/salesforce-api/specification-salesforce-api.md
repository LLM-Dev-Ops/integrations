# Salesforce API Integration - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-15
**Module:** `integrations/salesforce_api`

---

## 1. Overview

### 1.1 Purpose

This specification defines the Salesforce API Integration Module—a thin adapter layer enabling the LLM Dev Ops platform to interact with Salesforce for CRM data access, workflow automation, event-driven integrations, and enterprise system synchronization.

### 1.2 Key Salesforce Characteristics

| Feature | Behavior |
|---------|----------|
| **Authentication** | OAuth 2.0 (JWT Bearer, Web Server, Username-Password flows) |
| **API Versions** | REST API, SOQL, Bulk API 2.0, Streaming API, Pub/Sub API |
| **Rate Limits** | Per-org limits (API calls, concurrent requests, bulk jobs) |
| **Multi-tenancy** | Org-specific endpoints, sandboxes, production |
| **Events** | Platform Events, Change Data Capture (CDC), Pub/Sub gRPC |

### 1.3 Methodology

- **SPARC**: Specification → Pseudocode → Architecture → Refinement → Completion
- **London-School TDD**: Interface-first design with mock-based testing
- **Thin Adapter**: Delegate to shared primitives, no orchestration duplication

---

## 2. Module Scope

### 2.1 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Object CRUD** | Create, read, update, delete SObjects via REST API |
| **SOQL Queries** | Execute queries with pagination, relationship traversal |
| **Bulk Operations** | Large-scale data operations via Bulk API 2.0 |
| **Event Handling** | Subscribe to Platform Events, CDC, Pub/Sub streams |
| **Webhook Processing** | Receive and validate outbound messages |
| **Authentication** | OAuth 2.0 token management (delegate to shared-auth) |
| **Rate Limit Awareness** | Track and respect org API limits |
| **Simulation Support** | Record/replay Salesforce interactions |

### 2.2 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| SObject CRUD | Single record, composite, batch operations |
| SOQL/SOSL | Query execution, pagination, explain plans |
| Bulk API 2.0 | Jobs, batches, CSV handling |
| Describe API | Object/field metadata (read-only) |
| Platform Events | Publish and subscribe |
| Change Data Capture | Subscribe to object changes |
| Pub/Sub API | gRPC-based event streaming |
| Outbound Messages | Webhook receiver/validator |
| Limits API | Query org API usage |
| Dual Language | Rust and TypeScript implementations |

#### Out of Scope

| Item | Reason |
|------|--------|
| Org provisioning | Admin concern, not runtime |
| Custom object creation | Schema management external |
| Apex execution | Direct code execution not supported |
| Metadata API | Deployment concern |
| Tooling API | Developer tooling |
| User management | Admin/security scope |
| Permission set assignment | Admin scope |
| Flow/Process Builder | Design-time concern |

### 2.3 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| OAuth 2.0 only | Standard Salesforce auth |
| API version pinning | Stability across updates |
| Async-first | Network-bound operations |
| Shared auth module | Credential management |
| No direct HTTP exposure | Encapsulation |

---

## 3. Dependency Policy

### 3.1 Internal Dependencies

| Primitive | Purpose |
|-----------|---------|
| `shared-auth` | OAuth token management, refresh |
| `shared-logging` | Structured logging |
| `shared-metrics` | Prometheus metrics |
| `shared-tracing` | Distributed tracing |
| `shared-retry` | Retry with backoff |
| `shared-circuit-breaker` | Fault isolation |
| `shared-config` | Configuration management |

### 3.2 External Dependencies (Rust)

| Crate | Purpose |
|-------|---------|
| `tokio` | Async runtime |
| `reqwest` | HTTP client |
| `serde` / `serde_json` | JSON serialization |
| `tonic` | gRPC client (Pub/Sub API) |
| `csv` | Bulk API CSV handling |
| `chrono` | Datetime handling |

### 3.3 External Dependencies (TypeScript)

| Package | Purpose |
|---------|---------|
| `jsforce` | Reference only (not used directly) |
| `csv-parse` / `csv-stringify` | Bulk API CSV |
| `@grpc/grpc-js` | Pub/Sub gRPC client |

### 3.4 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `jsforce` | This module IS the Salesforce integration |
| `salesforce-sdk` | Avoid external SDK coupling |

---

## 4. API Coverage

### 4.1 REST API - SObject Operations

#### Create Record
| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /services/data/vXX.0/sobjects/{SObject}/` |
| Response | `{ "id": "001...", "success": true }` |

#### Read Record
| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /services/data/vXX.0/sobjects/{SObject}/{Id}` |
| Fields | Optional `fields` query parameter |

#### Update Record
| Attribute | Value |
|-----------|-------|
| Endpoint | `PATCH /services/data/vXX.0/sobjects/{SObject}/{Id}` |
| Response | 204 No Content on success |

#### Delete Record
| Attribute | Value |
|-----------|-------|
| Endpoint | `DELETE /services/data/vXX.0/sobjects/{SObject}/{Id}` |
| Response | 204 No Content on success |

#### Composite Requests
| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /services/data/vXX.0/composite` |
| Max | 25 subrequests per call |
| Use Case | Transaction-like operations |

### 4.2 SOQL Query API

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /services/data/vXX.0/query?q={SOQL}` |
| Pagination | `nextRecordsUrl` for batches > 2000 |
| Explain | `GET /services/data/vXX.0/query?explain={SOQL}` |

**Query Parameters:**
- `q`: URL-encoded SOQL query
- `fields`: For relationship queries

### 4.3 Bulk API 2.0

| Operation | Endpoint |
|-----------|----------|
| Create Job | `POST /services/data/vXX.0/jobs/ingest` |
| Upload Data | `PUT /services/data/vXX.0/jobs/ingest/{jobId}/batches` |
| Close Job | `PATCH /services/data/vXX.0/jobs/ingest/{jobId}` |
| Check Status | `GET /services/data/vXX.0/jobs/ingest/{jobId}` |
| Get Results | `GET /services/data/vXX.0/jobs/ingest/{jobId}/successfulResults` |

**Job States:** `Open → UploadComplete → InProgress → JobComplete/Failed/Aborted`

### 4.4 Event APIs

#### Platform Events (Publish)
| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /services/data/vXX.0/sobjects/{EventName}__e` |
| Payload | JSON event fields |

#### Streaming API (Legacy)
| Attribute | Value |
|-----------|-------|
| Protocol | CometD/Bayeux |
| Channels | `/event/{EventName}__e`, `/data/ChangeEvents` |

#### Pub/Sub API (Recommended)
| Attribute | Value |
|-----------|-------|
| Protocol | gRPC |
| Endpoint | `api.pubsub.salesforce.com:7443` |
| Auth | OAuth access token |

### 4.5 Limits API

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /services/data/vXX.0/limits` |
| Key Limits | `DailyApiRequests`, `ConcurrentAsyncGetReportInstances` |

---

## 5. Interface Definitions

### 5.1 Rust Interfaces

```rust
/// Main Salesforce client interface
#[async_trait]
pub trait SalesforceClient: Send + Sync {
    fn sobjects(&self) -> &dyn SObjectService;
    fn query(&self) -> &dyn QueryService;
    fn bulk(&self) -> &dyn BulkService;
    fn events(&self) -> &dyn EventService;
    fn limits(&self) -> &dyn LimitsService;
}

/// SObject CRUD operations
#[async_trait]
pub trait SObjectService: Send + Sync {
    async fn create(&self, sobject: &str, record: JsonValue) -> Result<CreateResult, SfError>;
    async fn get(&self, sobject: &str, id: &str, fields: Option<&[&str]>) -> Result<JsonValue, SfError>;
    async fn update(&self, sobject: &str, id: &str, record: JsonValue) -> Result<(), SfError>;
    async fn upsert(&self, sobject: &str, ext_id_field: &str, ext_id: &str, record: JsonValue) -> Result<UpsertResult, SfError>;
    async fn delete(&self, sobject: &str, id: &str) -> Result<(), SfError>;
    async fn describe(&self, sobject: &str) -> Result<SObjectDescribe, SfError>;
    async fn composite(&self, requests: Vec<CompositeRequest>) -> Result<CompositeResponse, SfError>;
}

/// SOQL query operations
#[async_trait]
pub trait QueryService: Send + Sync {
    async fn query(&self, soql: &str) -> Result<QueryResult, SfError>;
    async fn query_more(&self, next_url: &str) -> Result<QueryResult, SfError>;
    fn query_all(&self, soql: &str) -> impl Stream<Item = Result<JsonValue, SfError>>;
    async fn explain(&self, soql: &str) -> Result<ExplainResult, SfError>;
}

/// Bulk API 2.0 operations
#[async_trait]
pub trait BulkService: Send + Sync {
    async fn create_job(&self, req: CreateJobRequest) -> Result<BulkJob, SfError>;
    async fn upload_data(&self, job_id: &str, data: impl AsyncRead + Send) -> Result<(), SfError>;
    async fn close_job(&self, job_id: &str) -> Result<BulkJob, SfError>;
    async fn abort_job(&self, job_id: &str) -> Result<BulkJob, SfError>;
    async fn get_job(&self, job_id: &str) -> Result<BulkJob, SfError>;
    async fn get_successful_results(&self, job_id: &str) -> Result<impl AsyncRead, SfError>;
    async fn get_failed_results(&self, job_id: &str) -> Result<impl AsyncRead, SfError>;
}

/// Event handling
#[async_trait]
pub trait EventService: Send + Sync {
    async fn publish(&self, event_name: &str, payload: JsonValue) -> Result<PublishResult, SfError>;
    fn subscribe(&self, channel: &str) -> impl Stream<Item = Result<EventMessage, SfError>>;
    fn subscribe_cdc(&self, objects: &[&str]) -> impl Stream<Item = Result<CdcEvent, SfError>>;
}
```

### 5.2 Configuration

```rust
pub struct SalesforceConfig {
    /// Salesforce org instance URL
    pub instance_url: Url,
    /// API version (e.g., "59.0")
    pub api_version: String,
    /// OAuth client ID
    pub client_id: String,
    /// OAuth credentials (via shared-auth)
    pub credentials: SalesforceCredentials,
    /// Request timeout
    pub timeout: Duration,
    /// Max retries
    pub max_retries: u32,
    /// Enable rate limit tracking
    pub track_limits: bool,
}

pub enum SalesforceCredentials {
    JwtBearer { private_key: SecretString, username: String },
    UsernamePassword { username: String, password: SecretString, security_token: SecretString },
    RefreshToken { refresh_token: SecretString },
    AccessToken { token: SecretString }, // For testing
}
```

### 5.3 TypeScript Interfaces

```typescript
interface SalesforceClient {
  readonly sobjects: SObjectService;
  readonly query: QueryService;
  readonly bulk: BulkService;
  readonly events: EventService;
  readonly limits: LimitsService;
}

interface SalesforceConfig {
  instanceUrl: string;
  apiVersion: string;
  clientId: string;
  credentials: SalesforceCredentials;
  timeout?: number;
  maxRetries?: number;
  trackLimits?: boolean;
}

interface SObjectService {
  create(sobject: string, record: Record<string, unknown>): Promise<CreateResult>;
  get(sobject: string, id: string, fields?: string[]): Promise<Record<string, unknown>>;
  update(sobject: string, id: string, record: Record<string, unknown>): Promise<void>;
  upsert(sobject: string, extIdField: string, extId: string, record: Record<string, unknown>): Promise<UpsertResult>;
  delete(sobject: string, id: string): Promise<void>;
  describe(sobject: string): Promise<SObjectDescribe>;
  composite(requests: CompositeRequest[]): Promise<CompositeResponse>;
}

interface QueryService {
  query(soql: string): Promise<QueryResult>;
  queryMore(nextUrl: string): Promise<QueryResult>;
  queryAll(soql: string): AsyncIterable<Record<string, unknown>>;
  explain(soql: string): Promise<ExplainResult>;
}
```

---

## 6. Error Taxonomy

### 6.1 Error Hierarchy

```
SfError
├── ConfigError
│   ├── MissingInstanceUrl
│   ├── InvalidApiVersion
│   └── MissingCredentials
├── AuthError
│   ├── InvalidGrant
│   ├── TokenExpired
│   ├── RefreshFailed
│   └── InsufficientPermissions
├── ApiError
│   ├── NotFound (404)
│   ├── BadRequest (400)
│   ├── Forbidden (403)
│   ├── MethodNotAllowed (405)
│   └── ServerError (5xx)
├── QueryError
│   ├── MalformedQuery
│   ├── InvalidField
│   ├── InvalidSObject
│   └── QueryTimeout
├── BulkError
│   ├── JobFailed
│   ├── InvalidCsv
│   ├── TooManyRecords
│   └── ConcurrencyLimit
├── LimitError
│   ├── DailyLimitExceeded
│   ├── ConcurrentLimitExceeded
│   └── RequestTooLarge
├── NetworkError
│   ├── ConnectionFailed
│   ├── Timeout
│   └── TlsError
└── EventError
    ├── SubscriptionFailed
    ├── ChannelNotFound
    └── ReplayIdInvalid
```

### 6.2 Error Mapping

| HTTP | Salesforce Error | Error Type | Retryable |
|------|------------------|------------|-----------|
| 400 | MALFORMED_QUERY | `QueryError::MalformedQuery` | No |
| 400 | INVALID_FIELD | `QueryError::InvalidField` | No |
| 401 | INVALID_SESSION_ID | `AuthError::TokenExpired` | Yes (refresh) |
| 403 | INSUFFICIENT_ACCESS | `AuthError::InsufficientPermissions` | No |
| 404 | NOT_FOUND | `ApiError::NotFound` | No |
| 429 | REQUEST_LIMIT_EXCEEDED | `LimitError::DailyLimitExceeded` | Yes (backoff) |
| 500 | INTERNAL_ERROR | `ApiError::ServerError` | Yes |
| 503 | SERVICE_UNAVAILABLE | `ApiError::ServerError` | Yes |

### 6.3 Retryability

```rust
impl SfError {
    pub fn is_retryable(&self) -> bool {
        matches!(self,
            SfError::Auth(AuthError::TokenExpired)
            | SfError::Network(NetworkError::Timeout)
            | SfError::Network(NetworkError::ConnectionFailed)
            | SfError::Api(ApiError::ServerError { .. })
            | SfError::Limit(LimitError::ConcurrentLimitExceeded)
        )
    }

    pub fn should_refresh_token(&self) -> bool {
        matches!(self, SfError::Auth(AuthError::TokenExpired))
    }
}
```

---

## 7. Resilience Hooks

### 7.1 Retry Configuration

| Error | Max Attempts | Base Delay | Strategy |
|-------|--------------|------------|----------|
| TokenExpired | 1 | Immediate | Refresh + retry |
| ServerError | 3 | 1s | Exponential |
| ConcurrentLimit | 5 | 2s | Exponential |
| Timeout | 3 | 500ms | Exponential |

### 7.2 Rate Limit Awareness

```rust
pub struct RateLimitTracker {
    daily_limit: u32,
    daily_used: AtomicU32,
    concurrent_limit: u32,
    concurrent_active: AtomicU32,
    last_refresh: Instant,
}

impl RateLimitTracker {
    pub fn check_available(&self) -> RateLimitStatus {
        let remaining = self.daily_limit.saturating_sub(self.daily_used.load(Ordering::Relaxed));

        if remaining == 0 {
            RateLimitStatus::Exhausted
        } else if remaining < self.daily_limit / 10 {
            RateLimitStatus::Low { remaining }
        } else {
            RateLimitStatus::Available { remaining }
        }
    }
}
```

### 7.3 Circuit Breaker

```rust
pub struct SalesforceCircuitBreakerConfig {
    pub failure_threshold: u32,     // Default: 5
    pub success_threshold: u32,     // Default: 3
    pub reset_timeout: Duration,    // Default: 60s
}
```

---

## 8. Observability

### 8.1 Tracing Attributes

| Attribute | Description |
|-----------|-------------|
| `sf.instance_url` | Salesforce instance |
| `sf.api_version` | API version used |
| `sf.sobject` | SObject type |
| `sf.operation` | Operation name |
| `sf.record_id` | Record ID (if applicable) |
| `sf.query` | SOQL query (sanitized) |
| `sf.job_id` | Bulk job ID |
| `error.code` | Salesforce error code |

### 8.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `sf_requests_total` | Counter | `operation`, `sobject`, `status` |
| `sf_request_duration_seconds` | Histogram | `operation`, `sobject` |
| `sf_records_processed_total` | Counter | `operation`, `sobject` |
| `sf_errors_total` | Counter | `operation`, `error_code` |
| `sf_rate_limit_remaining` | Gauge | `limit_type` |
| `sf_bulk_job_records_total` | Counter | `job_id`, `status` |
| `sf_events_received_total` | Counter | `channel` |

### 8.3 Logging Levels

| Level | Events |
|-------|--------|
| ERROR | Auth failures, API errors, bulk job failures |
| WARN | Rate limit warnings, retries, token refresh |
| INFO | Operations complete, bulk job status |
| DEBUG | Request/response details (sanitized) |
| TRACE | Full payloads (dev only) |

---

## 9. Simulation Support

### 9.1 Recording Mode

```rust
pub trait SfRecorder: Send + Sync {
    fn record_request(&self, op: &str, sobject: Option<&str>, req: &[u8]);
    fn record_response(&self, op: &str, sobject: Option<&str>, resp: &[u8], duration: Duration);
    fn record_error(&self, op: &str, sobject: Option<&str>, error: &SfError);
}
```

### 9.2 Replay Mode

```rust
pub trait SfReplayer: Send + Sync {
    fn replay_response(&self, op: &str, sobject: Option<&str>) -> Option<ReplayedResponse>;
}
```

### 9.3 Use Cases

- **Testing**: Deterministic tests without Salesforce org
- **CI/CD**: Fast pipelines without network
- **Demo**: Reproducible scenarios
- **Debugging**: Replay production issues

---

## 10. Security Requirements

### 10.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| Keys never logged | `SecretString` with redaction |
| Zero on drop | Zeroize trait |
| Token rotation | Auto-refresh via shared-auth |
| JWT signing | RSA-256 for JWT Bearer |

### 10.2 Permission Scoping

| Requirement | Implementation |
|-------------|----------------|
| Minimal permissions | Connected App with scoped OAuth |
| Field-level security | Respect FLS in queries |
| Record-level security | Respect sharing rules |
| Audit trail | Log all operations |

### 10.3 Transport

| Requirement | Implementation |
|-------------|----------------|
| TLS 1.2+ only | HTTP client config |
| HTTPS enforced | Reject HTTP |
| Certificate validation | Enabled |

---

## 11. Performance Requirements

### 11.1 Latency Targets

| Operation | p50 | p99 |
|-----------|-----|-----|
| Single record CRUD | < 200ms | < 1s |
| SOQL query (< 200 records) | < 300ms | < 2s |
| Composite (25 subrequests) | < 1s | < 5s |
| Bulk job creation | < 500ms | < 2s |

### 11.2 Throughput

| Metric | Target |
|--------|--------|
| Concurrent requests | Respect org limits |
| Bulk records/job | Up to 150M |
| Event throughput | 1000+ events/sec |

### 11.3 Memory

| Resource | Limit |
|----------|-------|
| Per request overhead | < 1MB |
| Bulk CSV streaming | Chunked |
| Event buffer | Configurable |

---

## 12. Acceptance Criteria

### 12.1 Functional

| ID | Criterion |
|----|-----------|
| F1 | Create SObject record works |
| F2 | Get SObject by ID works |
| F3 | Update SObject works |
| F4 | Upsert by external ID works |
| F5 | Delete SObject works |
| F6 | SOQL query works |
| F7 | SOQL pagination works |
| F8 | Composite request works |
| F9 | Bulk job lifecycle works |
| F10 | Platform Event publish works |
| F11 | Pub/Sub subscribe works |
| F12 | Limits API works |
| F13 | Token refresh on expiry works |
| F14 | Simulation record/replay works |

### 12.2 Non-Functional

| ID | Criterion |
|----|-----------|
| NF1 | No panics in production paths |
| NF2 | Credentials never logged |
| NF3 | Rate limits respected |
| NF4 | Retry respects backoff |
| NF5 | Circuit breaker trips correctly |
| NF6 | All requests traced |
| NF7 | Metrics emitted correctly |
| NF8 | Test coverage > 80% |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-15 | SPARC Generator | Initial Specification |

---

**Next Phase:** Pseudocode - Algorithmic descriptions for OAuth flows, SOQL execution, Bulk API orchestration, and event streaming.
