# Google BigQuery Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/gcp/bigquery`

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
11. [Cost Awareness](#11-cost-awareness)
12. [Testing and Simulation](#12-testing-and-simulation)
13. [Acceptance Criteria](#13-acceptance-criteria)

---

## 1. Overview

### 1.1 Document Purpose

This specification defines requirements, interfaces, and constraints for the Google BigQuery Integration Module. It serves as a thin adapter layer enabling the LLM Dev Ops platform to query, ingest, and export analytical data using BigQuery while leveraging shared repository infrastructure.

### 1.2 Audience

- Implementation developers (Rust and TypeScript)
- QA engineers designing test strategies
- Architects reviewing integration patterns
- Security reviewers assessing credential handling
- Data engineers designing analytics workflows

### 1.3 Methodology

- **SPARC Methodology**: Specification -> Pseudocode -> Architecture -> Refinement -> Completion
- **London-School TDD**: Interface-first design enabling mock-based testing
- **Thin Adapter Pattern**: Minimal logic, delegating to shared primitives

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The BigQuery Integration Module provides a production-ready, type-safe interface for BigQuery operations. It is a **thin adapter layer** that:
- Executes SQL queries with cost estimation and dry-run support
- Ingests data via batch and streaming modes
- Exports query results to GCS or other destinations
- Tracks query costs and resource consumption
- Supports query simulation and replay for testing
- Leverages existing GCP credential chain from `gcp/auth`
- Delegates resilience, observability, and state to shared primitives

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Query Execution** | Run SQL queries (sync, async, streaming) |
| **Cost Estimation** | Dry-run queries to estimate bytes processed |
| **Batch Ingestion** | Load data from GCS, local files, or memory |
| **Streaming Ingestion** | Insert rows via streaming API |
| **Data Export** | Export query results to GCS |
| **Job Management** | Monitor, cancel, and list BigQuery jobs |
| **Dataset Management** | Create, describe, delete datasets |
| **Table Management** | Create, describe, delete, patch tables |
| **Query Simulation** | Replay and simulate analytical workloads |
| **Credential Delegation** | Use shared GCP credential chain |
| **Resilience Hooks** | Integrate with shared retry, circuit breaker |
| **Observability Hooks** | Emit metrics and traces via shared primitives |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| BigQuery Jobs API | query, insert, get, list, cancel |
| BigQuery Datasets API | create, delete, get, list, patch |
| BigQuery Tables API | create, delete, get, list, patch, insertAll |
| BigQuery Storage Read API | High-throughput reads via Arrow/Avro |
| BigQuery Storage Write API | High-throughput streaming writes |
| Query Dry-Run | Cost estimation before execution |
| Job Monitoring | Status polling, completion waiting |
| Data Export | Extract to GCS (JSON, Avro, Parquet, CSV) |
| Dual Language | Rust (primary) and TypeScript implementations |

#### Out of Scope

| Item | Reason |
|------|--------|
| BigQuery ML | Separate ML-focused integration |
| BigQuery BI Engine | Separate BI integration |
| Data Transfer Service | Separate orchestration |
| Dataform/dbt | External transformation tools |
| GCS Operations | Use shared `gcp/storage` integration |
| Credential Implementation | Use shared `gcp/auth` |
| Resilience Implementation | Use shared primitives |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| Thin adapter only | No duplicate logic from shared modules |
| Async-first design | Long-running queries |
| Cost-aware by default | Prevent runaway costs |
| Query dry-run support | Cost estimation before execution |
| Shared credential chain | Reuse from gcp/auth |
| Shared observability | Delegate to existing logging/metrics |

---

## 3. Dependency Policy

### 3.1 Allowed Internal Dependencies

| Module | Purpose | Import Path |
|--------|---------|-------------|
| `gcp/auth` | GCP credential chain (shared) | `@integrations/gcp-auth` |
| `shared/resilience` | Retry, circuit breaker, rate limiting | `@integrations/resilience` |
| `shared/observability` | Logging, metrics, tracing | `@integrations/observability` |
| `integrations-logging` | Shared logging abstractions | `integrations_logging` |
| `integrations-tracing` | Distributed tracing | `integrations_tracing` |

### 3.2 External Dependencies (Rust)

| Crate | Version | Purpose |
|-------|---------|---------|
| `tokio` | 1.x | Async runtime |
| `serde` | 1.x | Serialization |
| `serde_json` | 1.x | JSON handling |
| `async-trait` | 0.1+ | Async trait support |
| `thiserror` | 1.x | Error derivation |
| `chrono` | 0.4+ | Timestamp handling |
| `arrow` | 50+ | Arrow format support |
| `tonic` | 0.10+ | gRPC for Storage API |

### 3.3 External Dependencies (TypeScript)

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | 5.x | Language |
| `zod` | 3.x | Runtime type validation |
| `@grpc/grpc-js` | 1.x | gRPC for Storage API |

### 3.4 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `@google-cloud/bigquery` | Must use internal credential/transport |
| External HTTP clients | Use shared transport |

---

## 4. API Coverage

### 4.1 Query Operations

#### 4.1.1 jobs.query (Synchronous Query)

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /bigquery/v2/projects/{projectId}/queries` |
| Max Response | 10MB (default), configurable |
| Timeout | 10 seconds (default), up to 600s |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | SQL query |
| `useLegacySql` | boolean | No | Use legacy SQL (default false) |
| `maxResults` | integer | No | Max rows in first page |
| `timeoutMs` | integer | No | Query timeout |
| `dryRun` | boolean | No | Estimate cost only |
| `useQueryCache` | boolean | No | Use cached results |
| `defaultDataset` | object | No | Default dataset reference |
| `parameterMode` | string | No | POSITIONAL or NAMED |
| `queryParameters` | array | No | Query parameters |
| `labels` | object | No | Job labels |
| `maximumBytesBilled` | string | No | Cost cap |

#### 4.1.2 jobs.insert (Asynchronous Query/Load/Export)

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /bigquery/v2/projects/{projectId}/jobs` |
| Job Types | query, load, extract, copy |

**Query Job Configuration:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | SQL query |
| `destinationTable` | object | No | Write results to table |
| `writeDisposition` | string | No | WRITE_TRUNCATE, WRITE_APPEND, WRITE_EMPTY |
| `createDisposition` | string | No | CREATE_IF_NEEDED, CREATE_NEVER |
| `priority` | string | No | INTERACTIVE, BATCH |
| `allowLargeResults` | boolean | No | Allow >128MB results |
| `flattenResults` | boolean | No | Flatten nested/repeated |
| `maximumBytesBilled` | string | No | Cost cap |

#### 4.1.3 jobs.getQueryResults

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /bigquery/v2/projects/{projectId}/queries/{jobId}` |
| Pagination | Page token based |

#### 4.1.4 jobs.get / jobs.list / jobs.cancel

| Operation | Endpoint |
|-----------|----------|
| Get Job | `GET /bigquery/v2/projects/{projectId}/jobs/{jobId}` |
| List Jobs | `GET /bigquery/v2/projects/{projectId}/jobs` |
| Cancel Job | `POST /bigquery/v2/projects/{projectId}/jobs/{jobId}/cancel` |

### 4.2 Data Ingestion

#### 4.2.1 Load Job (Batch Ingestion)

**Load Configuration:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sourceUris` | array | Yes* | GCS URIs |
| `sourceFormat` | string | No | CSV, JSON, AVRO, PARQUET, ORC |
| `schema` | object | No | Table schema (or autodetect) |
| `destinationTable` | object | Yes | Target table |
| `writeDisposition` | string | No | WRITE_TRUNCATE, WRITE_APPEND |
| `autodetect` | boolean | No | Auto-detect schema |
| `maxBadRecords` | integer | No | Tolerate bad rows |
| `ignoreUnknownValues` | boolean | No | Ignore extra columns |

#### 4.2.2 tabledata.insertAll (Streaming Inserts)

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /bigquery/v2/projects/{projectId}/datasets/{datasetId}/tables/{tableId}/insertAll` |
| Latency | Near real-time |
| Cost | Higher than batch |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `rows` | array | Yes | Rows to insert |
| `skipInvalidRows` | boolean | No | Skip bad rows |
| `ignoreUnknownValues` | boolean | No | Ignore extra fields |
| `templateSuffix` | string | No | Template table suffix |

### 4.3 BigQuery Storage API

#### 4.3.1 Read API (High-Throughput Reads)

| Feature | Description |
|---------|-------------|
| Protocol | gRPC |
| Format | Arrow, Avro |
| Parallelism | Multiple streams |
| Row Filtering | Server-side |
| Column Selection | Server-side projection |

**Key Operations:**

| Operation | Description |
|-----------|-------------|
| CreateReadSession | Initialize read session |
| ReadRows | Stream rows from a read stream |
| SplitReadStream | Split stream for parallelism |

#### 4.3.2 Write API (High-Throughput Writes)

| Feature | Description |
|---------|-------------|
| Protocol | gRPC |
| Modes | Committed, Pending, Buffered |
| Exactly-Once | Via committed mode |
| Parallelism | Multiple write streams |

**Key Operations:**

| Operation | Description |
|-----------|-------------|
| CreateWriteStream | Initialize write stream |
| AppendRows | Append rows to stream |
| FinalizeWriteStream | Finalize pending stream |
| BatchCommitWriteStreams | Commit multiple streams |

### 4.4 Data Export

#### 4.4.1 Extract Job

**Extract Configuration:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sourceTable` | object | Yes | Source table |
| `destinationUris` | array | Yes | GCS destination URIs |
| `destinationFormat` | string | No | CSV, JSON, AVRO, PARQUET |
| `compression` | string | No | NONE, GZIP, DEFLATE, SNAPPY |
| `fieldDelimiter` | string | No | CSV delimiter |
| `printHeader` | boolean | No | Include CSV header |

### 4.5 Resource Management

#### 4.5.1 Datasets

| Operation | Endpoint |
|-----------|----------|
| Create | `POST /bigquery/v2/projects/{projectId}/datasets` |
| Get | `GET /bigquery/v2/projects/{projectId}/datasets/{datasetId}` |
| List | `GET /bigquery/v2/projects/{projectId}/datasets` |
| Delete | `DELETE /bigquery/v2/projects/{projectId}/datasets/{datasetId}` |
| Patch | `PATCH /bigquery/v2/projects/{projectId}/datasets/{datasetId}` |

#### 4.5.2 Tables

| Operation | Endpoint |
|-----------|----------|
| Create | `POST /bigquery/v2/projects/{projectId}/datasets/{datasetId}/tables` |
| Get | `GET /bigquery/v2/projects/{projectId}/datasets/{datasetId}/tables/{tableId}` |
| List | `GET /bigquery/v2/projects/{projectId}/datasets/{datasetId}/tables` |
| Delete | `DELETE /bigquery/v2/projects/{projectId}/datasets/{datasetId}/tables/{tableId}` |
| Patch | `PATCH /bigquery/v2/projects/{projectId}/datasets/{datasetId}/tables/{tableId}` |

---

## 5. Interface Definitions

### 5.1 Rust Interfaces

#### 5.1.1 Client Interface

```rust
/// Main client for BigQuery operations.
#[async_trait]
pub trait BigQueryClient: Send + Sync {
    /// Query operations.
    fn queries(&self) -> &dyn QueryService;

    /// Job management.
    fn jobs(&self) -> &dyn JobService;

    /// Streaming insert operations.
    fn streaming(&self) -> &dyn StreamingService;

    /// Batch load operations.
    fn loading(&self) -> &dyn LoadService;

    /// Export operations.
    fn exports(&self) -> &dyn ExportService;

    /// Dataset management.
    fn datasets(&self) -> &dyn DatasetService;

    /// Table management.
    fn tables(&self) -> &dyn TableService;

    /// Storage Read API (high-throughput).
    fn storage_read(&self) -> &dyn StorageReadService;

    /// Storage Write API (high-throughput).
    fn storage_write(&self) -> &dyn StorageWriteService;

    /// Cost estimation.
    fn costs(&self) -> &dyn CostService;

    /// Current configuration.
    fn config(&self) -> &BigQueryConfig;
}
```

#### 5.1.2 Query Service

```rust
/// Service for query operations.
#[async_trait]
pub trait QueryService: Send + Sync {
    /// Execute query synchronously.
    async fn execute(
        &self,
        request: QueryRequest,
    ) -> Result<QueryResponse, BigQueryError>;

    /// Execute query asynchronously (returns job).
    async fn execute_async(
        &self,
        request: QueryRequest,
    ) -> Result<QueryJob, BigQueryError>;

    /// Dry-run query for cost estimation.
    async fn dry_run(
        &self,
        query: &str,
    ) -> Result<QueryDryRunResult, BigQueryError>;

    /// Execute query with streaming results.
    fn execute_stream(
        &self,
        request: QueryRequest,
    ) -> impl Stream<Item = Result<Row, BigQueryError>> + Send;

    /// Execute parameterized query.
    async fn execute_parameterized(
        &self,
        query: &str,
        parameters: QueryParameters,
    ) -> Result<QueryResponse, BigQueryError>;
}

/// Query request configuration.
#[derive(Clone, Debug)]
pub struct QueryRequest {
    pub query: String,
    pub use_legacy_sql: bool,
    pub use_query_cache: bool,
    pub default_dataset: Option<DatasetReference>,
    pub destination_table: Option<TableReference>,
    pub write_disposition: Option<WriteDisposition>,
    pub priority: QueryPriority,
    pub maximum_bytes_billed: Option<i64>,
    pub labels: HashMap<String, String>,
    pub timeout: Option<Duration>,
    pub parameters: Option<QueryParameters>,
}

/// Query dry-run result with cost estimation.
#[derive(Clone, Debug)]
pub struct QueryDryRunResult {
    pub total_bytes_processed: i64,
    pub estimated_cost_usd: f64,
    pub cache_hit: bool,
    pub schema: Option<TableSchema>,
    pub referenced_tables: Vec<TableReference>,
    pub query_plan: Option<Vec<QueryStage>>,
}

#[derive(Clone, Debug)]
pub enum QueryPriority {
    Interactive,
    Batch,
}

#[derive(Clone, Debug)]
pub enum WriteDisposition {
    WriteTruncate,
    WriteAppend,
    WriteEmpty,
}
```

#### 5.1.3 Job Service

```rust
/// Service for job management.
#[async_trait]
pub trait JobService: Send + Sync {
    /// Get job by ID.
    async fn get(
        &self,
        job_id: &str,
        location: Option<&str>,
    ) -> Result<Job, BigQueryError>;

    /// List jobs with filtering.
    async fn list(
        &self,
        request: ListJobsRequest,
    ) -> Result<ListJobsResponse, BigQueryError>;

    /// Cancel a running job.
    async fn cancel(
        &self,
        job_id: &str,
        location: Option<&str>,
    ) -> Result<(), BigQueryError>;

    /// Wait for job completion.
    async fn wait_for_completion(
        &self,
        job_id: &str,
        timeout: Duration,
        poll_interval: Duration,
    ) -> Result<Job, BigQueryError>;

    /// Stream job status updates.
    fn watch(
        &self,
        job_id: &str,
        poll_interval: Duration,
    ) -> impl Stream<Item = Result<JobStatus, BigQueryError>> + Send;
}

/// Job status enumeration.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum JobStatus {
    Pending,
    Running,
    Done,
    Failed { error: BigQueryError },
}
```

#### 5.1.4 Streaming Service

```rust
/// Service for streaming inserts.
#[async_trait]
pub trait StreamingService: Send + Sync {
    /// Insert rows via streaming API.
    async fn insert_all(
        &self,
        table: &TableReference,
        rows: Vec<InsertRow>,
        options: InsertOptions,
    ) -> Result<InsertAllResponse, BigQueryError>;

    /// Buffered streaming insert with batching.
    fn buffered_insert(
        &self,
        table: &TableReference,
        options: BufferedInsertOptions,
    ) -> BufferedInserter;
}

/// Row to insert with optional insert ID.
#[derive(Clone, Debug)]
pub struct InsertRow {
    pub insert_id: Option<String>,
    pub json: serde_json::Value,
}

/// Streaming insert options.
#[derive(Clone, Debug, Default)]
pub struct InsertOptions {
    pub skip_invalid_rows: bool,
    pub ignore_unknown_values: bool,
    pub template_suffix: Option<String>,
}

/// Buffered insert options.
#[derive(Clone, Debug)]
pub struct BufferedInsertOptions {
    pub max_rows: usize,
    pub max_bytes: usize,
    pub flush_interval: Duration,
    pub insert_options: InsertOptions,
}
```

#### 5.1.5 Load Service

```rust
/// Service for batch load operations.
#[async_trait]
pub trait LoadService: Send + Sync {
    /// Load data from GCS.
    async fn load_from_gcs(
        &self,
        config: LoadJobConfig,
    ) -> Result<Job, BigQueryError>;

    /// Load data from local file (uploads to GCS first).
    async fn load_from_file(
        &self,
        file_path: &Path,
        config: LoadJobConfig,
    ) -> Result<Job, BigQueryError>;

    /// Load data from memory.
    async fn load_from_memory(
        &self,
        data: Vec<u8>,
        format: SourceFormat,
        config: LoadJobConfig,
    ) -> Result<Job, BigQueryError>;
}

/// Load job configuration.
#[derive(Clone, Debug)]
pub struct LoadJobConfig {
    pub destination_table: TableReference,
    pub source_uris: Vec<String>,
    pub source_format: SourceFormat,
    pub schema: Option<TableSchema>,
    pub write_disposition: WriteDisposition,
    pub autodetect: bool,
    pub max_bad_records: u32,
    pub ignore_unknown_values: bool,
    pub labels: HashMap<String, String>,
}

#[derive(Clone, Debug)]
pub enum SourceFormat {
    Csv { options: CsvOptions },
    Json { options: JsonOptions },
    Avro,
    Parquet,
    Orc,
}
```

#### 5.1.6 Storage Read/Write Services

```rust
/// High-throughput read via Storage Read API.
#[async_trait]
pub trait StorageReadService: Send + Sync {
    /// Create a read session.
    async fn create_session(
        &self,
        table: &TableReference,
        options: ReadSessionOptions,
    ) -> Result<ReadSession, BigQueryError>;

    /// Read rows from a stream.
    fn read_stream(
        &self,
        stream_name: &str,
    ) -> impl Stream<Item = Result<ArrowRecordBatch, BigQueryError>> + Send;

    /// Read all rows from session (parallel streams).
    fn read_all(
        &self,
        session: &ReadSession,
        parallelism: usize,
    ) -> impl Stream<Item = Result<ArrowRecordBatch, BigQueryError>> + Send;
}

/// High-throughput write via Storage Write API.
#[async_trait]
pub trait StorageWriteService: Send + Sync {
    /// Create a write stream.
    async fn create_stream(
        &self,
        table: &TableReference,
        mode: WriteStreamMode,
    ) -> Result<WriteStream, BigQueryError>;

    /// Append rows to a stream.
    async fn append_rows(
        &self,
        stream: &WriteStream,
        rows: ArrowRecordBatch,
    ) -> Result<AppendRowsResponse, BigQueryError>;

    /// Finalize a pending write stream.
    async fn finalize_stream(
        &self,
        stream: &WriteStream,
    ) -> Result<i64, BigQueryError>;

    /// Commit multiple streams atomically.
    async fn batch_commit(
        &self,
        table: &TableReference,
        stream_names: Vec<String>,
    ) -> Result<BatchCommitResponse, BigQueryError>;
}

#[derive(Clone, Debug)]
pub enum WriteStreamMode {
    Committed,
    Pending,
    Buffered,
}
```

#### 5.1.7 Cost Service

```rust
/// Service for cost estimation and tracking.
#[async_trait]
pub trait CostService: Send + Sync {
    /// Estimate query cost.
    async fn estimate_query_cost(
        &self,
        query: &str,
    ) -> Result<CostEstimate, BigQueryError>;

    /// Get cost for a completed job.
    async fn get_job_cost(
        &self,
        job_id: &str,
    ) -> Result<JobCost, BigQueryError>;

    /// Set maximum bytes billed for queries.
    fn set_cost_limit(&self, max_bytes: i64);

    /// Get current cost limit.
    fn get_cost_limit(&self) -> Option<i64>;
}

/// Cost estimate for a query.
#[derive(Clone, Debug)]
pub struct CostEstimate {
    pub bytes_processed: i64,
    pub bytes_billed: i64,
    pub estimated_cost_usd: f64,
    pub slot_ms: Option<i64>,
    pub cache_hit: bool,
}

/// Actual cost for a completed job.
#[derive(Clone, Debug)]
pub struct JobCost {
    pub job_id: String,
    pub bytes_processed: i64,
    pub bytes_billed: i64,
    pub actual_cost_usd: f64,
    pub slot_ms: i64,
    pub total_bytes_processed: i64,
}
```

### 5.2 TypeScript Interfaces

```typescript
interface BigQueryClient {
  readonly queries: QueryService;
  readonly jobs: JobService;
  readonly streaming: StreamingService;
  readonly loading: LoadService;
  readonly exports: ExportService;
  readonly datasets: DatasetService;
  readonly tables: TableService;
  readonly storageRead: StorageReadService;
  readonly storageWrite: StorageWriteService;
  readonly costs: CostService;
  getConfig(): Readonly<BigQueryConfig>;
}

interface QueryService {
  execute(request: QueryRequest): Promise<QueryResponse>;
  executeAsync(request: QueryRequest): Promise<QueryJob>;
  dryRun(query: string): Promise<QueryDryRunResult>;
  executeStream(request: QueryRequest): AsyncIterable<Row>;
  executeParameterized(
    query: string,
    parameters: QueryParameters
  ): Promise<QueryResponse>;
}

interface CostService {
  estimateQueryCost(query: string): Promise<CostEstimate>;
  getJobCost(jobId: string): Promise<JobCost>;
  setCostLimit(maxBytes: bigint): void;
  getCostLimit(): bigint | null;
}

interface BigQueryConfig {
  projectId: string;
  location: string;
  credentials: CredentialProvider | GcpCredentials;
  timeout?: number;
  defaultDataset?: DatasetReference;
  maximumBytesBilled?: bigint;
  resilience?: ResilienceConfig;
  observability?: ObservabilityConfig;
}
```

---

## 6. Error Taxonomy

### 6.1 Error Hierarchy

```
BigQueryError
|-- ConfigurationError
|   |-- MissingProjectId
|   |-- InvalidCredentials
|   +-- InvalidLocation
|
|-- AuthenticationError
|   |-- CredentialsExpired
|   |-- AccessDenied
|   +-- InsufficientPermissions
|
|-- ResourceError
|   |-- DatasetNotFound
|   |-- TableNotFound
|   |-- JobNotFound
|   |-- ResourceAlreadyExists
|   +-- QuotaExceeded
|
|-- QueryError
|   |-- InvalidQuery
|   |-- QueryTimeout
|   |-- QueryCancelled
|   |-- BytesLimitExceeded
|   +-- ResponseTooLarge
|
|-- JobError
|   |-- JobFailed
|   |-- JobCancelled
|   +-- JobTimeout
|
|-- StreamingError
|   |-- InsertFailed
|   |-- RowTooLarge
|   |-- InvalidRow
|   +-- QuotaExceeded
|
|-- StorageApiError
|   |-- SessionExpired
|   |-- StreamNotFound
|   |-- CommitFailed
|   +-- SchemaConflict
|
|-- RateLimitError
|   |-- TooManyRequests
|   |-- ConcurrentQueryLimit
|   +-- DailyQueryLimit
|
+-- ServerError
    |-- InternalError
    |-- ServiceUnavailable
    +-- BackendError
```

### 6.2 Error Mapping

| BigQuery Error | BigQueryError | Retryable |
|----------------|---------------|-----------|
| `notFound` (dataset) | `ResourceError::DatasetNotFound` | No |
| `notFound` (table) | `ResourceError::TableNotFound` | No |
| `notFound` (job) | `ResourceError::JobNotFound` | No |
| `duplicate` | `ResourceError::ResourceAlreadyExists` | No |
| `invalidQuery` | `QueryError::InvalidQuery` | No |
| `responseTooLarge` | `QueryError::ResponseTooLarge` | No |
| `quotaExceeded` | `ResourceError::QuotaExceeded` | Yes (with backoff) |
| `rateLimitExceeded` | `RateLimitError::TooManyRequests` | Yes |
| `accessDenied` | `AuthenticationError::AccessDenied` | No |
| `backendError` | `ServerError::BackendError` | Yes |
| `internalError` | `ServerError::InternalError` | Yes |

---

## 7. Resilience Hooks

### 7.1 Shared Retry Integration

Delegates to `shared/resilience`:

| Error Type | Retry | Max Attempts | Strategy |
|------------|-------|--------------|----------|
| `rateLimitExceeded` | Yes | 5 | Exponential with jitter |
| `quotaExceeded` | Yes | 3 | Exponential (longer delays) |
| `backendError` | Yes | 3 | Exponential |
| `internalError` | Yes | 3 | Exponential |
| All others | No | - | - |

### 7.2 Shared Circuit Breaker Integration

Uses `shared/resilience` circuit breaker:
- Failure threshold: 5
- Reset timeout: 60s
- Half-open test requests: 1

### 7.3 Job Polling Strategy

For async jobs:
- Initial poll: 1 second
- Max poll interval: 30 seconds
- Backoff factor: 1.5
- Max wait time: Configurable (default: 1 hour)

---

## 8. Security Requirements

### 8.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| Use shared credential chain | Delegate to `gcp/auth` |
| Support service account JSON | Via shared provider |
| Support application default credentials | Via shared provider |
| Support workload identity | Via shared provider |
| Credential refresh | Automatic via cached provider |

### 8.2 IAM Permissions Required

| Permission | Operations |
|------------|------------|
| `bigquery.jobs.create` | Query, load, export |
| `bigquery.jobs.get` | Job status |
| `bigquery.jobs.list` | List jobs |
| `bigquery.datasets.create` | Create dataset |
| `bigquery.datasets.get` | Get dataset |
| `bigquery.tables.create` | Create table |
| `bigquery.tables.getData` | Query, read |
| `bigquery.tables.updateData` | Insert, load |

### 8.3 Data Security

| Requirement | Implementation |
|-------------|----------------|
| Query result encryption | In-transit TLS |
| Sensitive data masking | Application-level |
| Audit logging | Via BigQuery audit logs |

---

## 9. Observability Requirements

### 9.1 Tracing (Shared)

| Attribute | Type | Description |
|-----------|------|-------------|
| `bigquery.project_id` | string | GCP project |
| `bigquery.location` | string | Processing location |
| `bigquery.job_id` | string | Job identifier |
| `bigquery.operation` | string | Operation type |
| `bigquery.bytes_processed` | integer | Data scanned |
| `bigquery.bytes_billed` | integer | Data billed |
| `bigquery.slot_ms` | integer | Slot time used |
| `bigquery.cache_hit` | boolean | Query cache hit |

### 9.2 Metrics (Shared)

| Metric | Type | Labels |
|--------|------|--------|
| `bigquery_queries_total` | Counter | `project`, `status`, `cache_hit` |
| `bigquery_query_duration_seconds` | Histogram | `project`, `priority` |
| `bigquery_bytes_processed_total` | Counter | `project`, `operation` |
| `bigquery_bytes_billed_total` | Counter | `project` |
| `bigquery_estimated_cost_usd` | Gauge | `project` |
| `bigquery_jobs_total` | Counter | `project`, `type`, `status` |
| `bigquery_streaming_rows_total` | Counter | `project`, `dataset`, `table` |
| `bigquery_errors_total` | Counter | `error_type`, `operation` |

---

## 10. Performance Requirements

### 10.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| Query (cached) | < 500ms | < 2s |
| Query (small) | < 5s | < 30s |
| Dry-run | < 200ms | < 1s |
| Streaming insert | < 100ms | < 500ms |
| Job status poll | < 100ms | < 500ms |
| Storage API read | < 50ms first batch | < 200ms |

### 10.2 Throughput

| Metric | Target |
|--------|--------|
| Concurrent queries | 100+ (slot dependent) |
| Streaming rows/sec | 100,000+ per table |
| Storage API read | 1GB/s+ per session |
| Storage API write | 100MB/s+ per stream |

---

## 11. Cost Awareness

### 11.1 Cost Control Features

| Feature | Description |
|---------|-------------|
| Dry-run by default | Estimate before execute (configurable) |
| Maximum bytes billed | Hard cap per query |
| Cost estimation | USD cost calculation |
| Query cache awareness | Track cache hits |
| Slot usage tracking | Monitor compute usage |

### 11.2 Cost Calculation

```rust
/// Calculate estimated cost for bytes processed.
pub fn calculate_cost(bytes_billed: i64, pricing: &BigQueryPricing) -> f64 {
    // On-demand: $5.00 per TB (varies by region)
    let tb_processed = bytes_billed as f64 / (1024.0 * 1024.0 * 1024.0 * 1024.0);
    tb_processed * pricing.on_demand_per_tb
}

/// BigQuery pricing configuration.
pub struct BigQueryPricing {
    pub on_demand_per_tb: f64,       // Default: $5.00
    pub streaming_per_gb: f64,       // Default: $0.01
    pub storage_active_per_gb: f64,  // Default: $0.02/month
    pub storage_long_term_per_gb: f64, // Default: $0.01/month
}
```

### 11.3 Cost Alerts

| Alert | Condition |
|-------|-----------|
| Query cost exceeded | Query > configured threshold |
| Daily cost exceeded | Cumulative daily > threshold |
| Large query warning | Bytes > 1TB without dry-run |

---

## 12. Testing and Simulation

### 12.1 Query Simulation Service

```rust
/// Service for simulating BigQuery workloads.
#[async_trait]
pub trait SimulationService: Send + Sync {
    /// Create a mock query response.
    fn mock_query_response(
        &self,
        schema: TableSchema,
        rows: Vec<Row>,
    ) -> MockQueryResponse;

    /// Replay a recorded query workload.
    async fn replay_workload(
        &self,
        workload: RecordedWorkload,
        options: ReplayOptions,
    ) -> Result<ReplayResult, BigQueryError>;

    /// Generate synthetic data.
    fn generate_data(
        &self,
        schema: TableSchema,
        count: usize,
        options: DataGenOptions,
    ) -> Vec<Row>;
}

/// Recorded workload for replay.
pub struct RecordedWorkload {
    pub queries: Vec<RecordedQuery>,
    pub time_range: TimeRange,
}

/// Replay options.
pub struct ReplayOptions {
    pub time_scale: f32,
    pub dry_run_only: bool,
    pub capture_costs: bool,
}
```

### 12.2 Mock BigQuery Client

```rust
/// In-memory mock BigQuery for testing.
pub struct MockBigQuery {
    datasets: HashMap<String, MockDataset>,
    jobs: HashMap<String, MockJob>,
    responses: HashMap<String, MockQueryResponse>,
}

impl MockBigQuery {
    pub fn new() -> Self;
    pub fn add_dataset(&mut self, dataset: MockDataset);
    pub fn add_table(&mut self, dataset: &str, table: MockTable);
    pub fn add_query_response(&mut self, query_pattern: &str, response: MockQueryResponse);
    pub fn set_error(&mut self, operation: &str, error: BigQueryError);
}
```

---

## 13. Acceptance Criteria

### 13.1 Functional Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| FC-1 | Sync query execution works | Integration test |
| FC-2 | Async query execution works | Integration test |
| FC-3 | Query dry-run returns cost estimate | Integration test |
| FC-4 | Parameterized queries work | Integration test |
| FC-5 | Query result pagination works | Integration test |
| FC-6 | Streaming insert works | Integration test |
| FC-7 | Batch load from GCS works | Integration test |
| FC-8 | Export to GCS works | Integration test |
| FC-9 | Storage Read API works | Integration test |
| FC-10 | Storage Write API works | Integration test |
| FC-11 | Job monitoring works | Integration test |
| FC-12 | Job cancellation works | Integration test |
| FC-13 | Dataset CRUD works | Integration test |
| FC-14 | Table CRUD works | Integration test |
| FC-15 | Maximum bytes billed enforced | Integration test |
| FC-16 | All error types mapped | Unit tests |

### 13.2 Non-Functional Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| NFC-1 | Uses shared credential chain | Code review |
| NFC-2 | Uses shared resilience | Code review |
| NFC-3 | Uses shared observability | Code review |
| NFC-4 | No duplicate infrastructure | Code review |
| NFC-5 | Cost estimation available | Integration test |
| NFC-6 | Cost limits enforced | Integration test |
| NFC-7 | Test coverage > 80% | Coverage report |

### 13.3 Cost Awareness Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| CA-1 | Dry-run available for all queries | Unit test |
| CA-2 | Cost estimate returned | Integration test |
| CA-3 | Maximum bytes billed configurable | Unit test |
| CA-4 | Cost metrics emitted | Integration test |
| CA-5 | Cache hit tracking works | Integration test |

### 13.4 Simulation Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| SC-1 | Mock BigQuery works | Unit test |
| SC-2 | Query workload replay works | Integration test |
| SC-3 | Synthetic data generation works | Unit test |
| SC-4 | Dry-run replay mode works | Unit test |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial specification |

---

**End of Specification Phase**

*Next: Pseudocode phase will define algorithmic implementations for all services.*
