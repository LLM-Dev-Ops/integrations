# AWS CloudWatch Logs Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/aws/cloudwatch-logs`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Module Purpose and Scope](#2-module-purpose-and-scope)
3. [Dependency Policy](#3-dependency-policy)
4. [API Coverage](#4-api-coverage)
5. [Interface Definitions](#5-interface-definitions)
6. [Error Taxonomy](#6-error-taxonomy)
7. [Resilience Hooks](#7-resilience-hooks)
8. [Security Requirements](#8-security-requirements)
9. [Observability Requirements](#9-observability-requirements)
10. [Performance Requirements](#10-performance-requirements)
11. [Testing and Simulation](#11-testing-and-simulation)
12. [Future-Proofing](#12-future-proofing)
13. [Acceptance Criteria](#13-acceptance-criteria)

---

## 1. Overview

### 1.1 Document Purpose

This specification defines requirements, interfaces, and constraints for the AWS CloudWatch Logs Integration Module. It serves as a thin adapter layer enabling the LLM Dev Ops platform to emit, query, and correlate logs within AWS CloudWatch Logs while leveraging shared repository infrastructure.

### 1.2 Audience

- Implementation developers (Rust and TypeScript)
- QA engineers designing test strategies
- Architects reviewing integration patterns
- Security reviewers assessing credential handling
- DevOps engineers configuring observability pipelines

### 1.3 Methodology

- **SPARC Methodology**: Specification -> Pseudocode -> Architecture -> Refinement -> Completion
- **London-School TDD**: Interface-first design enabling mock-based testing
- **Thin Adapter Pattern**: Minimal logic, delegating to shared primitives

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The AWS CloudWatch Logs Integration Module provides a production-ready, type-safe interface for log operations via AWS CloudWatch Logs. It is a **thin adapter layer** that:
- Emits structured logs to CloudWatch Logs log groups
- Queries logs using CloudWatch Logs Insights
- Correlates logs across services using trace IDs and request IDs
- Manages retention policies programmatically
- Supports log stream simulation and replay for testing
- Leverages existing AWS credential chain from `aws/credentials`
- Delegates resilience, observability, and state to shared primitives

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Log Emission** | Put log events to CloudWatch Logs streams |
| **Structured Logging** | Format logs as structured JSON with correlation IDs |
| **Log Querying** | Execute CloudWatch Logs Insights queries |
| **Cross-Service Correlation** | Correlate logs via trace IDs, request IDs, span IDs |
| **Retention Management** | Configure and manage log group retention policies |
| **Log Group Management** | Create, describe, and delete log groups/streams |
| **Stream Simulation** | Replay and simulate log streams for testing |
| **Credential Delegation** | Use shared AWS credential chain (no duplication) |
| **Resilience Hooks** | Integrate with shared retry, circuit breaker, rate limiting |
| **Observability Hooks** | Emit metrics and traces via shared primitives |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| CloudWatch Logs API | PutLogEvents, GetLogEvents, FilterLogEvents |
| CloudWatch Logs Insights | StartQuery, GetQueryResults, StopQuery |
| Log Group Management | CreateLogGroup, DeleteLogGroup, DescribeLogGroups |
| Log Stream Management | CreateLogStream, DeleteLogStream, DescribeLogStreams |
| Retention Policies | PutRetentionPolicy, DeleteRetentionPolicy |
| Subscription Filters | PutSubscriptionFilter, DescribeSubscriptionFilters |
| Metric Filters | PutMetricFilter, DescribeMetricFilters |
| Log Correlation | Trace ID, request ID, span ID injection/extraction |
| Testing Support | Log stream simulation, replay, mock log generation |
| Dual Language | Rust (primary) and TypeScript implementations |

#### Out of Scope

| Item | Reason |
|------|--------|
| CloudWatch Metrics | Separate integration (different API) |
| CloudWatch Alarms | Separate integration |
| CloudWatch Events/EventBridge | Separate integration |
| Log Storage/Archival | Use S3 integration for archival |
| Log Analysis/ML | Use separate analytics integrations |
| Credential Implementation | Use shared `aws/credentials` |
| Resilience Implementation | Use shared primitives |
| Vector Database Implementation | Use shared RuvVector module |
| Core Logging Abstractions | Use shared `integrations-logging` |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| Thin adapter only | No duplicate logic from shared modules |
| Async-first design | I/O-bound operations |
| Structured JSON logs | CloudWatch Logs Insights query support |
| Correlation ID injection | Cross-service traceability |
| Shared credential chain | Reuse from aws/ses, aws/s3, aws/bedrock |
| Shared observability | Delegate to existing logging/metrics |
| Batch log emission | Efficiency and rate limit compliance |

---

## 3. Dependency Policy

### 3.1 Allowed Internal Dependencies

| Module | Purpose | Import Path |
|--------|---------|-------------|
| `aws/credentials` | AWS credential chain (shared) | `@integrations/aws-credentials` |
| `aws/signing` | SigV4 request signing | `@integrations/aws-signing` |
| `shared/resilience` | Retry, circuit breaker, rate limiting | `@integrations/resilience` |
| `shared/observability` | Logging, metrics, tracing abstractions | `@integrations/observability` |
| `integrations-logging` | Shared logging abstractions | `integrations_logging` |
| `integrations-tracing` | Distributed tracing abstraction | `integrations_tracing` |

### 3.2 External Dependencies (Rust)

| Crate | Version | Purpose |
|-------|---------|---------|
| `tokio` | 1.x | Async runtime |
| `serde` | 1.x | Serialization |
| `serde_json` | 1.x | JSON handling |
| `async-trait` | 0.1+ | Async trait support |
| `thiserror` | 1.x | Error derivation |
| `bytes` | 1.x | Byte buffer handling |
| `chrono` | 0.4+ | Timestamp handling |
| `uuid` | 1.x | Correlation ID generation |

### 3.3 External Dependencies (TypeScript)

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | 5.x | Language |
| `zod` | 3.x | Runtime type validation |
| `uuid` | 9.x | Correlation ID generation |

### 3.4 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `@aws-sdk/client-cloudwatch-logs` | Must use internal credential/signing |
| `winston` | Use shared logging abstractions |
| `pino` | Use shared logging abstractions |
| External HTTP clients | Use shared transport |

---

## 4. API Coverage

### 4.1 Log Event Operations

#### 4.1.1 PutLogEvents

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /` with `Logs_20140328.PutLogEvents` |
| Service | `logs` |
| Authentication | SigV4 |
| Max Events | 10,000 per batch |
| Max Batch Size | 1 MB |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `logGroupName` | string | Yes | Target log group |
| `logStreamName` | string | Yes | Target log stream |
| `logEvents` | array | Yes | Array of log events |
| `sequenceToken` | string | No | Deprecated (auto-managed) |

**Log Event Structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `timestamp` | integer | Yes | Unix epoch milliseconds |
| `message` | string | Yes | Log message (JSON recommended) |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `nextSequenceToken` | string | Next token (deprecated) |
| `rejectedLogEventsInfo` | object | Info about rejected events |

#### 4.1.2 GetLogEvents

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /` with `Logs_20140328.GetLogEvents` |
| Max Results | 10,000 events |
| Pagination | Forward/backward token based |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `logGroupName` | string | Yes | Source log group |
| `logStreamName` | string | Yes | Source log stream |
| `startTime` | integer | No | Start timestamp (epoch ms) |
| `endTime` | integer | No | End timestamp (epoch ms) |
| `startFromHead` | boolean | No | Start from earliest |
| `limit` | integer | No | Max events to return |
| `nextToken` | string | No | Pagination token |

#### 4.1.3 FilterLogEvents

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /` with `Logs_20140328.FilterLogEvents` |
| Max Results | 10,000 events |
| Cross-Stream | Queries across multiple streams |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `logGroupName` | string | Yes | Source log group |
| `logGroupIdentifier` | string | No | ARN alternative |
| `logStreamNames` | array | No | Filter to specific streams |
| `logStreamNamePrefix` | string | No | Stream name prefix filter |
| `startTime` | integer | No | Start timestamp |
| `endTime` | integer | No | End timestamp |
| `filterPattern` | string | No | CloudWatch filter pattern |
| `limit` | integer | No | Max events |
| `nextToken` | string | No | Pagination token |

### 4.2 CloudWatch Logs Insights

#### 4.2.1 StartQuery

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /` with `Logs_20140328.StartQuery` |
| Query Language | CloudWatch Logs Insights |
| Max Query Time | 60 minutes |
| Max Log Groups | 50 per query |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `logGroupNames` | array | Yes* | Log groups to query |
| `logGroupIdentifiers` | array | Yes* | ARN alternatives |
| `startTime` | integer | Yes | Query start (epoch seconds) |
| `endTime` | integer | Yes | Query end (epoch seconds) |
| `queryString` | string | Yes | Insights query |
| `limit` | integer | No | Max results (default 1000) |

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| `queryId` | string | Query identifier |

#### 4.2.2 GetQueryResults

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /` with `Logs_20140328.GetQueryResults` |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `queryId` | string | Yes | Query to check |

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Scheduled, Running, Complete, Failed, Cancelled, Timeout, Unknown |
| `results` | array | Query results (array of field arrays) |
| `statistics` | object | Query statistics |
| `encryptionKey` | string | KMS key if encrypted |

#### 4.2.3 StopQuery

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /` with `Logs_20140328.StopQuery` |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `queryId` | string | Yes | Query to cancel |

### 4.3 Log Group Management

#### 4.3.1 CreateLogGroup

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /` with `Logs_20140328.CreateLogGroup` |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `logGroupName` | string | Yes | Group name |
| `kmsKeyId` | string | No | KMS key for encryption |
| `tags` | object | No | Resource tags |
| `logGroupClass` | string | No | STANDARD or INFREQUENT_ACCESS |

#### 4.3.2 DeleteLogGroup

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /` with `Logs_20140328.DeleteLogGroup` |

#### 4.3.3 DescribeLogGroups

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /` with `Logs_20140328.DescribeLogGroups` |
| Pagination | Token based |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `logGroupNamePrefix` | string | No | Prefix filter |
| `logGroupNamePattern` | string | No | Pattern filter |
| `includeLinkedAccounts` | boolean | No | Cross-account |
| `limit` | integer | No | Max results |
| `nextToken` | string | No | Pagination |

### 4.4 Log Stream Management

#### 4.4.1 CreateLogStream

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /` with `Logs_20140328.CreateLogStream` |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `logGroupName` | string | Yes | Parent group |
| `logStreamName` | string | Yes | Stream name |

#### 4.4.2 DeleteLogStream

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /` with `Logs_20140328.DeleteLogStream` |

#### 4.4.3 DescribeLogStreams

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /` with `Logs_20140328.DescribeLogStreams` |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `logGroupName` | string | Yes | Parent group |
| `logStreamNamePrefix` | string | No | Prefix filter |
| `orderBy` | string | No | LogStreamName or LastEventTime |
| `descending` | boolean | No | Sort order |
| `limit` | integer | No | Max results |
| `nextToken` | string | No | Pagination |

### 4.5 Retention Policy

#### 4.5.1 PutRetentionPolicy

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /` with `Logs_20140328.PutRetentionPolicy` |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `logGroupName` | string | Yes | Target group |
| `retentionInDays` | integer | Yes | Retention period |

**Valid Retention Values:** 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653

#### 4.5.2 DeleteRetentionPolicy

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /` with `Logs_20140328.DeleteRetentionPolicy` |

### 4.6 Subscription Filters

#### 4.6.1 PutSubscriptionFilter

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /` with `Logs_20140328.PutSubscriptionFilter` |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `logGroupName` | string | Yes | Source group |
| `filterName` | string | Yes | Filter name |
| `filterPattern` | string | Yes | Filter pattern |
| `destinationArn` | string | Yes | Lambda/Kinesis/Firehose ARN |
| `roleArn` | string | No | IAM role for delivery |
| `distribution` | string | No | Random or ByLogStream |

#### 4.6.2 DescribeSubscriptionFilters

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /` with `Logs_20140328.DescribeSubscriptionFilters` |

#### 4.6.3 DeleteSubscriptionFilter

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /` with `Logs_20140328.DeleteSubscriptionFilter` |

### 4.7 Metric Filters

#### 4.7.1 PutMetricFilter

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /` with `Logs_20140328.PutMetricFilter` |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `logGroupName` | string | Yes | Source group |
| `filterName` | string | Yes | Filter name |
| `filterPattern` | string | Yes | Filter pattern |
| `metricTransformations` | array | Yes | Metric definitions |

#### 4.7.2 DescribeMetricFilters

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /` with `Logs_20140328.DescribeMetricFilters` |

---

## 5. Interface Definitions

### 5.1 Rust Interfaces

#### 5.1.1 Client Interface

```rust
/// Main client for AWS CloudWatch Logs operations.
#[async_trait]
pub trait CloudWatchLogsClient: Send + Sync {
    /// Access log event operations.
    fn events(&self) -> &dyn LogEventsService;

    /// Access CloudWatch Logs Insights queries.
    fn insights(&self) -> &dyn InsightsService;

    /// Access log group management.
    fn groups(&self) -> &dyn LogGroupsService;

    /// Access log stream management.
    fn streams(&self) -> &dyn LogStreamsService;

    /// Access retention policy management.
    fn retention(&self) -> &dyn RetentionService;

    /// Access subscription filter management.
    fn subscriptions(&self) -> &dyn SubscriptionService;

    /// Access metric filter management.
    fn metrics(&self) -> &dyn MetricFilterService;

    /// Get current configuration.
    fn config(&self) -> &CloudWatchLogsConfig;
}
```

#### 5.1.2 Log Events Service

```rust
/// Service for log event operations.
#[async_trait]
pub trait LogEventsService: Send + Sync {
    /// Put log events to a stream (batch).
    async fn put(
        &self,
        request: PutLogEventsRequest,
    ) -> Result<PutLogEventsResponse, CloudWatchLogsError>;

    /// Put a single structured log event.
    async fn put_structured(
        &self,
        log_group: &str,
        log_stream: &str,
        event: StructuredLogEvent,
    ) -> Result<(), CloudWatchLogsError>;

    /// Get log events from a stream.
    async fn get(
        &self,
        request: GetLogEventsRequest,
    ) -> Result<GetLogEventsResponse, CloudWatchLogsError>;

    /// Filter log events across streams.
    async fn filter(
        &self,
        request: FilterLogEventsRequest,
    ) -> Result<FilterLogEventsResponse, CloudWatchLogsError>;

    /// Get all events matching filter (auto-pagination).
    fn filter_all(
        &self,
        request: FilterLogEventsRequest,
    ) -> impl Stream<Item = Result<FilteredLogEvent, CloudWatchLogsError>> + Send;
}

/// Structured log event with correlation support.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StructuredLogEvent {
    /// Log level.
    pub level: LogLevel,
    /// Log message.
    pub message: String,
    /// Timestamp (auto-generated if None).
    pub timestamp: Option<i64>,
    /// Trace ID for correlation.
    pub trace_id: Option<String>,
    /// Request ID for correlation.
    pub request_id: Option<String>,
    /// Span ID for correlation.
    pub span_id: Option<String>,
    /// Service name.
    pub service: Option<String>,
    /// Additional structured fields.
    pub fields: HashMap<String, serde_json::Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum LogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
    Fatal,
}
```

#### 5.1.3 Insights Service

```rust
/// Service for CloudWatch Logs Insights queries.
#[async_trait]
pub trait InsightsService: Send + Sync {
    /// Start an Insights query.
    async fn start_query(
        &self,
        request: StartQueryRequest,
    ) -> Result<StartQueryResponse, CloudWatchLogsError>;

    /// Get query results.
    async fn get_results(
        &self,
        query_id: &str,
    ) -> Result<GetQueryResultsResponse, CloudWatchLogsError>;

    /// Stop a running query.
    async fn stop_query(
        &self,
        query_id: &str,
    ) -> Result<(), CloudWatchLogsError>;

    /// Execute query and wait for results (convenience).
    async fn query(
        &self,
        request: StartQueryRequest,
        timeout: Duration,
    ) -> Result<QueryResults, CloudWatchLogsError>;

    /// Query logs by trace ID (correlation).
    async fn query_by_trace_id(
        &self,
        log_groups: Vec<String>,
        trace_id: &str,
        time_range: TimeRange,
    ) -> Result<Vec<CorrelatedLogEvent>, CloudWatchLogsError>;

    /// Query logs by request ID (correlation).
    async fn query_by_request_id(
        &self,
        log_groups: Vec<String>,
        request_id: &str,
        time_range: TimeRange,
    ) -> Result<Vec<CorrelatedLogEvent>, CloudWatchLogsError>;
}

/// Time range for queries.
#[derive(Clone, Debug)]
pub struct TimeRange {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
}

/// Correlated log event with parsed fields.
#[derive(Clone, Debug)]
pub struct CorrelatedLogEvent {
    pub timestamp: DateTime<Utc>,
    pub message: String,
    pub log_group: String,
    pub log_stream: String,
    pub trace_id: Option<String>,
    pub request_id: Option<String>,
    pub span_id: Option<String>,
    pub service: Option<String>,
    pub level: Option<LogLevel>,
    pub fields: HashMap<String, serde_json::Value>,
}
```

#### 5.1.4 Log Groups Service

```rust
/// Service for log group management.
#[async_trait]
pub trait LogGroupsService: Send + Sync {
    /// Create a log group.
    async fn create(
        &self,
        request: CreateLogGroupRequest,
    ) -> Result<(), CloudWatchLogsError>;

    /// Delete a log group.
    async fn delete(
        &self,
        log_group_name: &str,
    ) -> Result<(), CloudWatchLogsError>;

    /// Describe log groups.
    async fn describe(
        &self,
        request: DescribeLogGroupsRequest,
    ) -> Result<DescribeLogGroupsResponse, CloudWatchLogsError>;

    /// List all log groups (auto-pagination).
    fn list_all(
        &self,
        prefix: Option<&str>,
    ) -> impl Stream<Item = Result<LogGroup, CloudWatchLogsError>> + Send;

    /// Check if log group exists.
    async fn exists(&self, log_group_name: &str) -> Result<bool, CloudWatchLogsError>;
}
```

#### 5.1.5 Log Streams Service

```rust
/// Service for log stream management.
#[async_trait]
pub trait LogStreamsService: Send + Sync {
    /// Create a log stream.
    async fn create(
        &self,
        log_group_name: &str,
        log_stream_name: &str,
    ) -> Result<(), CloudWatchLogsError>;

    /// Delete a log stream.
    async fn delete(
        &self,
        log_group_name: &str,
        log_stream_name: &str,
    ) -> Result<(), CloudWatchLogsError>;

    /// Describe log streams.
    async fn describe(
        &self,
        request: DescribeLogStreamsRequest,
    ) -> Result<DescribeLogStreamsResponse, CloudWatchLogsError>;

    /// List all streams in a group (auto-pagination).
    fn list_all(
        &self,
        log_group_name: &str,
        prefix: Option<&str>,
    ) -> impl Stream<Item = Result<LogStream, CloudWatchLogsError>> + Send;

    /// Ensure stream exists (create if not).
    async fn ensure_exists(
        &self,
        log_group_name: &str,
        log_stream_name: &str,
    ) -> Result<(), CloudWatchLogsError>;
}
```

#### 5.1.6 Retention Service

```rust
/// Service for retention policy management.
#[async_trait]
pub trait RetentionService: Send + Sync {
    /// Set retention policy.
    async fn set(
        &self,
        log_group_name: &str,
        retention_days: RetentionDays,
    ) -> Result<(), CloudWatchLogsError>;

    /// Remove retention policy (infinite retention).
    async fn remove(
        &self,
        log_group_name: &str,
    ) -> Result<(), CloudWatchLogsError>;

    /// Get current retention policy.
    async fn get(
        &self,
        log_group_name: &str,
    ) -> Result<Option<RetentionDays>, CloudWatchLogsError>;
}

/// Valid retention periods in days.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RetentionDays {
    Days1 = 1,
    Days3 = 3,
    Days5 = 5,
    Days7 = 7,
    Days14 = 14,
    Days30 = 30,
    Days60 = 60,
    Days90 = 90,
    Days120 = 120,
    Days150 = 150,
    Days180 = 180,
    Days365 = 365,
    Days400 = 400,
    Days545 = 545,
    Days731 = 731,
    Days1096 = 1096,
    Days1827 = 1827,
    Days2192 = 2192,
    Days2557 = 2557,
    Days2922 = 2922,
    Days3288 = 3288,
    Days3653 = 3653,
}
```

#### 5.1.7 Configuration Types

```rust
/// Configuration for CloudWatch Logs client.
#[derive(Clone)]
pub struct CloudWatchLogsConfig {
    /// AWS region.
    pub region: String,
    /// Credential provider (shared).
    pub credentials: Arc<dyn CredentialProvider>,
    /// Request timeout.
    pub timeout: Duration,
    /// Batch settings for PutLogEvents.
    pub batch_config: BatchConfig,
    /// Resilience configuration (shared).
    pub resilience: ResilienceConfig,
    /// Observability hooks (shared).
    pub observability: ObservabilityConfig,
    /// Default log group (optional).
    pub default_log_group: Option<String>,
    /// Default retention policy.
    pub default_retention: Option<RetentionDays>,
}

/// Batch configuration for log emission.
#[derive(Clone, Debug)]
pub struct BatchConfig {
    /// Maximum events per batch.
    pub max_events: usize,
    /// Maximum batch size in bytes.
    pub max_bytes: usize,
    /// Maximum wait time before flushing.
    pub flush_interval: Duration,
}

impl Default for BatchConfig {
    fn default() -> Self {
        Self {
            max_events: 10_000,
            max_bytes: 1_048_576, // 1 MB
            flush_interval: Duration::from_secs(5),
        }
    }
}
```

### 5.2 TypeScript Interfaces

#### 5.2.1 Client Interface

```typescript
/**
 * Main client for AWS CloudWatch Logs operations.
 */
interface CloudWatchLogsClient {
  /** Log event operations. */
  readonly events: LogEventsService;

  /** CloudWatch Logs Insights queries. */
  readonly insights: InsightsService;

  /** Log group management. */
  readonly groups: LogGroupsService;

  /** Log stream management. */
  readonly streams: LogStreamsService;

  /** Retention policy management. */
  readonly retention: RetentionService;

  /** Subscription filter management. */
  readonly subscriptions: SubscriptionService;

  /** Metric filter management. */
  readonly metrics: MetricFilterService;

  /** Current configuration. */
  getConfig(): Readonly<CloudWatchLogsConfig>;
}
```

#### 5.2.2 Service Interfaces

```typescript
interface LogEventsService {
  put(request: PutLogEventsRequest): Promise<PutLogEventsResponse>;
  putStructured(
    logGroup: string,
    logStream: string,
    event: StructuredLogEvent
  ): Promise<void>;
  get(request: GetLogEventsRequest): Promise<GetLogEventsResponse>;
  filter(request: FilterLogEventsRequest): Promise<FilterLogEventsResponse>;
  filterAll(request: FilterLogEventsRequest): AsyncIterable<FilteredLogEvent>;
}

interface InsightsService {
  startQuery(request: StartQueryRequest): Promise<StartQueryResponse>;
  getResults(queryId: string): Promise<GetQueryResultsResponse>;
  stopQuery(queryId: string): Promise<void>;
  query(request: StartQueryRequest, timeoutMs: number): Promise<QueryResults>;
  queryByTraceId(
    logGroups: string[],
    traceId: string,
    timeRange: TimeRange
  ): Promise<CorrelatedLogEvent[]>;
  queryByRequestId(
    logGroups: string[],
    requestId: string,
    timeRange: TimeRange
  ): Promise<CorrelatedLogEvent[]>;
}

interface LogGroupsService {
  create(request: CreateLogGroupRequest): Promise<void>;
  delete(logGroupName: string): Promise<void>;
  describe(request: DescribeLogGroupsRequest): Promise<DescribeLogGroupsResponse>;
  listAll(prefix?: string): AsyncIterable<LogGroup>;
  exists(logGroupName: string): Promise<boolean>;
}

interface LogStreamsService {
  create(logGroupName: string, logStreamName: string): Promise<void>;
  delete(logGroupName: string, logStreamName: string): Promise<void>;
  describe(request: DescribeLogStreamsRequest): Promise<DescribeLogStreamsResponse>;
  listAll(logGroupName: string, prefix?: string): AsyncIterable<LogStream>;
  ensureExists(logGroupName: string, logStreamName: string): Promise<void>;
}

interface RetentionService {
  set(logGroupName: string, retentionDays: RetentionDays): Promise<void>;
  remove(logGroupName: string): Promise<void>;
  get(logGroupName: string): Promise<RetentionDays | null>;
}
```

#### 5.2.3 Request/Response Types

```typescript
/** Structured log event with correlation support. */
interface StructuredLogEvent {
  level: LogLevel;
  message: string;
  timestamp?: number;
  traceId?: string;
  requestId?: string;
  spanId?: string;
  service?: string;
  fields?: Record<string, unknown>;
}

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** Time range for queries. */
interface TimeRange {
  start: Date;
  end: Date;
}

/** Correlated log event. */
interface CorrelatedLogEvent {
  timestamp: Date;
  message: string;
  logGroup: string;
  logStream: string;
  traceId?: string;
  requestId?: string;
  spanId?: string;
  service?: string;
  level?: LogLevel;
  fields: Record<string, unknown>;
}

/** Valid retention periods. */
type RetentionDays =
  | 1 | 3 | 5 | 7 | 14 | 30 | 60 | 90 | 120 | 150 | 180
  | 365 | 400 | 545 | 731 | 1096 | 1827 | 2192 | 2557 | 2922 | 3288 | 3653;

/** Configuration for CloudWatch Logs client. */
interface CloudWatchLogsConfig {
  region: string;
  credentials: CredentialProvider | AwsCredentials;
  timeout?: number;
  batchConfig?: BatchConfig;
  resilience?: ResilienceConfig;
  observability?: ObservabilityConfig;
  defaultLogGroup?: string;
  defaultRetention?: RetentionDays;
}

/** Batch configuration. */
interface BatchConfig {
  maxEvents?: number;
  maxBytes?: number;
  flushIntervalMs?: number;
}
```

---

## 6. Error Taxonomy

### 6.1 Error Hierarchy

```
CloudWatchLogsError
|-- ConfigurationError
|   |-- MissingRegion
|   |-- InvalidCredentials
|   +-- InvalidEndpoint
|
|-- AuthenticationError
|   |-- CredentialsExpired
|   |-- SignatureInvalid
|   +-- AccessDenied
|
|-- ResourceError
|   |-- LogGroupNotFound
|   |-- LogStreamNotFound
|   |-- ResourceAlreadyExists
|   +-- LimitExceeded
|
|-- RequestError
|   |-- ValidationError
|   |-- InvalidSequenceToken
|   |-- InvalidParameter
|   +-- DataAlreadyAccepted
|
|-- QueryError
|   |-- QueryNotFound
|   |-- QueryFailed
|   |-- QueryTimeout
|   +-- MalformedQuery
|
|-- RateLimitError
|   |-- ThrottlingException
|   |-- ServiceQuotaExceeded
|   +-- TooManyRequests
|
|-- ServerError
|   |-- InternalServerError
|   |-- ServiceUnavailable
|   +-- UnrecognizedClient
|
+-- BatchError
    |-- RejectedLogEvents
    |-- TooOldLogEvent
    |-- TooNewLogEvent
    +-- ExpiredLogEvent
```

### 6.2 Error Mapping

| AWS Error Code | CloudWatchLogsError | Retryable |
|----------------|---------------------|-----------|
| `ResourceNotFoundException` | `ResourceError::LogGroupNotFound` | No |
| `ResourceAlreadyExistsException` | `ResourceError::ResourceAlreadyExists` | No |
| `LimitExceededException` | `ResourceError::LimitExceeded` | No |
| `InvalidParameterException` | `RequestError::InvalidParameter` | No |
| `InvalidSequenceTokenException` | `RequestError::InvalidSequenceToken` | Yes |
| `DataAlreadyAcceptedException` | `RequestError::DataAlreadyAccepted` | No |
| `ThrottlingException` | `RateLimitError::ThrottlingException` | Yes |
| `ServiceQuotaExceededException` | `RateLimitError::ServiceQuotaExceeded` | Yes |
| `ServiceUnavailableException` | `ServerError::ServiceUnavailable` | Yes |
| `MalformedQueryException` | `QueryError::MalformedQuery` | No |
| `UnrecognizedClientException` | `ServerError::UnrecognizedClient` | No |

---

## 7. Resilience Hooks

### 7.1 Shared Retry Integration

Delegates to `shared/resilience`:

| Error Type | Retry | Max Attempts | Strategy |
|------------|-------|--------------|----------|
| `ThrottlingException` | Yes | 5 | Exponential with jitter |
| `ServiceUnavailable` | Yes | 3 | Exponential |
| `InvalidSequenceToken` | Yes | 3 | Immediate (refresh token) |
| `InternalServerError` | Yes | 3 | Exponential |
| All others | No | - | - |

### 7.2 Shared Circuit Breaker Integration

Uses `shared/resilience` circuit breaker:
- Failure threshold: 5
- Reset timeout: 30s
- Half-open test requests: 1

### 7.3 Shared Rate Limiter Integration

Configurable via `shared/resilience`:
- Per-region rate limits
- Token bucket algorithm
- Respects `Retry-After` headers
- Service quota awareness

### 7.4 Batch Buffer Management

For PutLogEvents:
- Buffer events until batch threshold
- Flush on max_events, max_bytes, or flush_interval
- Automatic retry on sequence token issues
- Graceful shutdown with buffer drain

---

## 8. Security Requirements

### 8.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| Use shared credential chain | Delegate to `aws/credentials` |
| Support IMDS for EC2 | Via shared provider |
| Support profile credentials | Via shared provider |
| Support environment variables | Via shared provider |
| Credential refresh | Automatic via cached provider |

### 8.2 Request Signing

| Requirement | Implementation |
|-------------|----------------|
| SigV4 signing | Use `aws/signing` module |
| Region-aware signing | Configured per-client |
| Service name | `logs` |

### 8.3 Transport Security

| Requirement | Implementation |
|-------------|----------------|
| TLS 1.2+ only | AWS default |
| Certificate validation | Enabled |

### 8.4 Log Content Security

| Requirement | Implementation |
|-------------|----------------|
| Sensitive data handling | PII filtering before emission |
| KMS encryption support | Via log group configuration |
| Access control | IAM policy based |

---

## 9. Observability Requirements

### 9.1 Tracing (Shared)

Delegates to `shared/observability`:

| Attribute | Type | Description |
|-----------|------|-------------|
| `cloudwatch.service` | string | `logs` |
| `cloudwatch.operation` | string | Operation name |
| `cloudwatch.log_group` | string | Log group name |
| `cloudwatch.log_stream` | string | Log stream name |
| `cloudwatch.region` | string | AWS region |
| `cloudwatch.events_count` | integer | Events in batch |
| `cloudwatch.bytes_sent` | integer | Bytes sent |
| `cloudwatch.query_id` | string | Insights query ID |

### 9.2 Metrics (Shared)

Emits via `shared/observability`:

| Metric | Type | Labels |
|--------|------|--------|
| `cloudwatch_logs_put_events_total` | Counter | `log_group`, `status` |
| `cloudwatch_logs_events_batch_size` | Histogram | `log_group` |
| `cloudwatch_logs_bytes_sent_total` | Counter | `log_group` |
| `cloudwatch_logs_queries_total` | Counter | `status` |
| `cloudwatch_logs_query_duration_seconds` | Histogram | |
| `cloudwatch_logs_errors_total` | Counter | `error_type`, `operation` |
| `cloudwatch_logs_buffer_size` | Gauge | `log_group` |

### 9.3 Logging (Shared)

Uses `shared/observability` logging:

| Level | When |
|-------|------|
| `ERROR` | Auth failures, configuration errors, batch failures |
| `WARN` | Throttling, retries, rejected events |
| `INFO` | Batch flush, query completion |
| `DEBUG` | Request/response details |
| `TRACE` | Event details, signing details |

---

## 10. Performance Requirements

### 10.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| Request signing | < 5ms | < 20ms |
| PutLogEvents (batch) | < 100ms | < 500ms |
| GetLogEvents | < 200ms | < 1000ms |
| FilterLogEvents | < 500ms | < 2000ms |
| StartQuery | < 100ms | < 500ms |
| GetQueryResults | < 100ms | < 500ms |

### 10.2 Throughput

| Metric | Target |
|--------|--------|
| PutLogEvents batches/sec | 10+ per stream |
| Concurrent queries | 20+ |
| Events per batch | Up to 10,000 |

### 10.3 Resource Limits

| Resource | Limit |
|----------|-------|
| Memory per batch | < 2MB |
| Buffer size | Configurable (default: 10MB) |
| Connection pool | Configurable (default: 10) |

---

## 11. Testing and Simulation

### 11.1 Log Stream Simulation

```rust
/// Service for simulating log streams in testing.
#[async_trait]
pub trait LogSimulationService: Send + Sync {
    /// Generate mock log events.
    async fn generate_events(
        &self,
        config: SimulationConfig,
    ) -> Result<Vec<StructuredLogEvent>, CloudWatchLogsError>;

    /// Replay events from a log stream to another.
    async fn replay(
        &self,
        source: ReplaySource,
        target: ReplayTarget,
        options: ReplayOptions,
    ) -> Result<ReplayResult, CloudWatchLogsError>;

    /// Create an in-memory mock log stream.
    fn mock_stream(&self) -> MockLogStream;
}

/// Configuration for log simulation.
#[derive(Clone, Debug)]
pub struct SimulationConfig {
    /// Number of events to generate.
    pub count: usize,
    /// Time range for events.
    pub time_range: TimeRange,
    /// Event templates.
    pub templates: Vec<LogTemplate>,
    /// Error injection rate (0.0-1.0).
    pub error_rate: f32,
    /// Service names to simulate.
    pub services: Vec<String>,
}

/// Replay source configuration.
#[derive(Clone, Debug)]
pub enum ReplaySource {
    /// Replay from CloudWatch Logs.
    CloudWatch {
        log_group: String,
        log_stream: Option<String>,
        filter: Option<String>,
        time_range: TimeRange,
    },
    /// Replay from file.
    File {
        path: PathBuf,
        format: LogFormat,
    },
    /// Replay from in-memory events.
    Memory {
        events: Vec<StructuredLogEvent>,
    },
}

/// Replay target configuration.
#[derive(Clone, Debug)]
pub enum ReplayTarget {
    /// Target CloudWatch Logs.
    CloudWatch {
        log_group: String,
        log_stream: String,
    },
    /// Target in-memory buffer.
    Memory,
    /// Target callback function.
    Callback,
}

/// Replay options.
#[derive(Clone, Debug)]
pub struct ReplayOptions {
    /// Time scaling factor (1.0 = real-time).
    pub time_scale: f32,
    /// Transform events during replay.
    pub transform: Option<Box<dyn Fn(StructuredLogEvent) -> StructuredLogEvent>>,
    /// Add delay between events.
    pub inter_event_delay: Option<Duration>,
}
```

### 11.2 Mock Log Stream

```rust
/// In-memory mock log stream for testing.
pub struct MockLogStream {
    events: Arc<RwLock<Vec<StructuredLogEvent>>>,
    subscribers: Arc<RwLock<Vec<Sender<StructuredLogEvent>>>>,
}

impl MockLogStream {
    /// Create new mock stream.
    pub fn new() -> Self;

    /// Put event to mock stream.
    pub async fn put(&self, event: StructuredLogEvent);

    /// Get all events.
    pub async fn get_all(&self) -> Vec<StructuredLogEvent>;

    /// Subscribe to new events.
    pub fn subscribe(&self) -> Receiver<StructuredLogEvent>;

    /// Filter events.
    pub async fn filter(&self, predicate: impl Fn(&StructuredLogEvent) -> bool) -> Vec<StructuredLogEvent>;

    /// Clear all events.
    pub async fn clear(&self);
}
```

---

## 12. Future-Proofing

### 12.1 Extensibility Points

| Extension | Mechanism |
|-----------|-----------|
| New API operations | Extend service traits |
| Custom log formats | Pluggable formatters |
| Log destinations | Subscription filter support |
| Query languages | Abstract query interface |
| Cross-account | ARN-based identifiers |

### 12.2 Version Compatibility

| Aspect | Strategy |
|--------|----------|
| API version | Target current CloudWatch Logs API |
| Response fields | Ignore unknown fields |
| Request fields | Builder pattern with optional fields |
| Breaking changes | Major version bump |

---

## 13. Acceptance Criteria

### 13.1 Functional Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| FC-1 | PutLogEvents works (single event) | Integration test |
| FC-2 | PutLogEvents works (batch) | Integration test |
| FC-3 | Structured log emission works | Integration test |
| FC-4 | GetLogEvents works | Integration test |
| FC-5 | FilterLogEvents works | Integration test |
| FC-6 | Auto-pagination works | Integration test |
| FC-7 | StartQuery works | Integration test |
| FC-8 | GetQueryResults works | Integration test |
| FC-9 | Query by trace ID works | Integration test |
| FC-10 | Query by request ID works | Integration test |
| FC-11 | CreateLogGroup works | Integration test |
| FC-12 | CreateLogStream works | Integration test |
| FC-13 | SetRetentionPolicy works | Integration test |
| FC-14 | Subscription filters work | Integration test |
| FC-15 | Metric filters work | Integration test |
| FC-16 | All error types mapped | Unit tests |

### 13.2 Non-Functional Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| NFC-1 | Uses shared credential chain | Code review |
| NFC-2 | Uses shared resilience | Code review |
| NFC-3 | Uses shared observability | Code review |
| NFC-4 | No duplicate infrastructure | Code review |
| NFC-5 | Structured logging by default | Integration test |
| NFC-6 | Correlation ID injection | Integration test |
| NFC-7 | Test coverage > 80% | Coverage report |

### 13.3 Simulation Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| SC-1 | Log stream simulation works | Unit test |
| SC-2 | Log replay works | Integration test |
| SC-3 | Mock log stream works | Unit test |
| SC-4 | Time scaling works | Unit test |
| SC-5 | Error injection works | Unit test |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial specification |

---

**End of Specification Phase**

*Next: Architecture phase will define component structure, data flow, and integration patterns.*
