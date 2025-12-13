# Google BigQuery Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/gcp/bigquery`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Design Principles](#2-design-principles)
3. [C4 Model Diagrams](#3-c4-model-diagrams)
4. [Component Architecture](#4-component-architecture)
5. [Service Architecture](#5-service-architecture)
6. [Data Flow Architecture](#6-data-flow-architecture)
7. [Cost Tracking Architecture](#7-cost-tracking-architecture)
8. [Storage API Architecture](#8-storage-api-architecture)
9. [Module Structure](#9-module-structure)
10. [Rust Crate Organization](#10-rust-crate-organization)
11. [TypeScript Package Organization](#11-typescript-package-organization)
12. [Testing Architecture](#12-testing-architecture)

---

## 1. Architecture Overview

### 1.1 Executive Summary

The Google BigQuery Integration Module implements a **thin adapter layer** architecture that:

1. **Executes SQL queries** with cost estimation and dry-run support
2. **Ingests data** via batch (load jobs) and streaming (insertAll, Storage Write API)
3. **Exports data** to GCS in multiple formats
4. **Tracks costs** with query estimation and job cost reporting
5. **Reuses shared infrastructure** from existing GCP integrations (`gcp/auth`)
6. **Delegates resilience** to shared primitives (`shared/resilience`)
7. **Supports testing** via workload simulation and replay

### 1.2 Key Architectural Decisions

| Decision | Rationale | Trade-offs |
|----------|-----------|------------|
| **Thin adapter layer** | Minimize duplication, leverage existing infra | Limited customization |
| **Dual transport** | REST API for queries, gRPC for Storage API | Two transport stacks |
| **Cost-aware by default** | Prevent runaway query costs | Extra dry-run latency |
| **Lazy service init** | Reduce startup overhead | First-call latency |
| **Shared credential chain** | Reuse from gcp/auth | Coupled to GCP patterns |
| **Async-first design** | Long-running queries/jobs | Requires async runtime |

### 1.3 Architecture Constraints

| Constraint | Source | Impact |
|------------|--------|--------|
| Thin adapter only | Design principle | No duplicate logic from shared modules |
| Shared GCP credentials | Reuse from gcp/auth | Must use same credential chain |
| No Google SDK dependency | Forbidden dep policy | Custom transport handling |
| REST + gRPC transport | BigQuery API design | Dual transport implementation |
| Rust + TypeScript | Multi-language support | Maintain API parity |

### 1.4 BigQuery-Specific Considerations

| Consideration | Description |
|---------------|-------------|
| **Dual API surface** | REST API for jobs/queries, gRPC for Storage API |
| **Job-based operations** | Query, load, extract are async jobs |
| **Cost model** | On-demand: $5/TB processed, streaming: $0.01/200MB |
| **Slot-based execution** | Query parallelism via slots |
| **Location affinity** | Jobs run in dataset's location |
| **Storage API benefits** | 10x faster reads, exactly-once writes |

---

## 2. Design Principles

### 2.1 Thin Adapter Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         THIN ADAPTER PRINCIPLE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  BigQuery Module                     Shared Modules                          │
│  ┌──────────────────────┐           ┌──────────────────────┐                │
│  │ BigQueryClient       │           │ gcp/auth             │                │
│  │                      │──────────►│ (reuse)              │                │
│  │ • QueryService       │           └──────────────────────┘                │
│  │ • JobService         │           ┌──────────────────────┐                │
│  │ • StreamingService   │──────────►│ shared/resilience    │                │
│  │ • LoadService        │           │ (reuse)              │                │
│  │ • ExportService      │           └──────────────────────┘                │
│  │ • StorageReadService │           ┌──────────────────────┐                │
│  │ • StorageWriteService│──────────►│ shared/observability │                │
│  │ • CostService        │           │ (reuse)              │                │
│  └──────────────────────┘           └──────────────────────┘                │
│                                                                              │
│  BIGQUERY MODULE OWNS:               SHARED MODULES OWN:                    │
│  • Query execution                   • GCP credential chain                 │
│  • Job management                    • OAuth2 token refresh                 │
│  • Streaming inserts                 • Retry logic                          │
│  • Batch load/export                 • Circuit breaker                      │
│  • Storage API (gRPC)                • Rate limiting                        │
│  • Cost estimation                   • Logging/metrics/tracing              │
│  • Simulation/replay                 │                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Cost-Aware Query Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       COST-AWARE QUERY PATTERN                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Application Code                                                            │
│       │                                                                      │
│       │ execute(query)                                                       │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        QueryService                                  │    │
│  │                                                                      │    │
│  │  1. Check if cost limit configured                                   │    │
│  │     └─► IF max_bytes_billed IS Some                                  │    │
│  │                                                                      │    │
│  │  2. Optional: Dry-run for cost estimation                           │    │
│  │     └─► POST /queries { dryRun: true }                              │    │
│  │     └─► Get totalBytesProcessed                                      │    │
│  │     └─► Check against limit                                          │    │
│  │                                                                      │    │
│  │  3. Execute query with maximumBytesBilled                           │    │
│  │     └─► POST /queries { maximumBytesBilled: limit }                 │    │
│  │                                                                      │    │
│  │  4. Record cost metrics                                              │    │
│  │     └─► bigquery_bytes_billed_total                                  │    │
│  │     └─► bigquery_estimated_cost_usd                                  │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│       │                                                                      │
│       │ Result or BytesLimitExceeded error                                  │
│       ▼                                                                      │
│  Application Code                                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Dependency Inversion

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DEPENDENCY INVERSION PRINCIPLE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  High-level: BigQueryServiceImpl                                             │
│       ↓ depends on abstraction                                               │
│  Interface: HttpTransport trait (from shared)                                │
│       ↑ implements                                                           │
│  Low-level: ReqwestHttpTransport                                             │
│                                                                              │
│  High-level: StorageReadServiceImpl                                          │
│       ↓ depends on abstraction                                               │
│  Interface: GrpcTransport trait                                              │
│       ↑ implements                                                           │
│  Low-level: TonicGrpcTransport                                               │
│                                                                              │
│  High-level: BigQueryServiceImpl                                             │
│       ↓ depends on abstraction                                               │
│  Interface: CredentialsProvider trait (from gcp/auth)                        │
│       ↑ implements                                                           │
│  Low-level: GcpCredentialsChain (ADC → ServiceAccount → Metadata)            │
│                                                                              │
│  High-level: BigQueryServiceImpl                                             │
│       ↓ depends on abstraction                                               │
│  Interface: ResilienceOrchestrator (from shared/resilience)                  │
│       ↑ implements                                                           │
│  Low-level: RetryExecutor + CircuitBreaker + RateLimiter                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. C4 Model Diagrams

### 3.1 Context Diagram (Level 1)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM CONTEXT                                  │
└─────────────────────────────────────────────────────────────────────────────┘

                        ┌───────────────────────────┐
                        │      Data Engineer        │
                        │                           │
                        │  Uses BigQuery module to: │
                        │  • Run analytics queries  │
                        │  • Load/export data       │
                        │  • Stream real-time data  │
                        │  • Monitor query costs    │
                        └─────────────┬─────────────┘
                                      │
                                      │ Uses
                                      ▼
┌───────────────────┐    ┌───────────────────────────┐    ┌───────────────────┐
│                   │    │                           │    │                   │
│  Shared GCP       │◄───│   BigQuery Integration    │───►│  Google BigQuery  │
│  Modules          │    │   Module                  │    │  Service          │
│                   │    │                           │    │                   │
│  • gcp/auth       │    │  Thin adapter providing:  │    │ • Jobs API        │
│                   │    │  • Query execution        │    │ • Datasets API    │
│                   │    │  • Cost estimation        │    │ • Tables API      │
│                   │    │  • Batch load/export      │    │ • Streaming API   │
└───────────────────┘    │  • Streaming inserts      │    │ • Storage Read    │
         │               │  • Storage API access     │    │ • Storage Write   │
         │               │  • Simulation/replay      │    │                   │
         │               │                           │    │                   │
         │               │  Rust + TypeScript        │    │                   │
         │               └───────────────────────────┘    └───────────────────┘
         │                            │
         │                            │ Uses
         │                            ▼
         │               ┌───────────────────────────┐
         │               │   Shared Infrastructure   │
         │               │                           │
         └──────────────►│  • shared/resilience     │
                         │  • shared/observability   │
                         │  • integrations-logging   │
                         │  • integrations-tracing   │
                         └───────────────────────────┘
```

### 3.2 Container Diagram (Level 2)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CONTAINER DIAGRAM                               │
│                        BigQuery Integration Module                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        BigQuery Integration Module                           │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                          Public API Layer                            │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ BigQuery     │  │ Service      │  │ Configuration│             │    │
│  │   │ Client       │  │ Accessors    │  │ Builder      │             │    │
│  │   │ Factory      │  │              │  │              │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      REST API Services Layer                         │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ Query        │  │ Job          │  │ Streaming    │             │    │
│  │   │ Service      │  │ Service      │  │ Service      │             │    │
│  │   │              │  │              │  │              │             │    │
│  │   │ • execute    │  │ • get        │  │ • insertAll  │             │    │
│  │   │ • executeAsync│ │ • list       │  │ • buffered   │             │    │
│  │   │ • dryRun     │  │ • cancel     │  │   Insert     │             │    │
│  │   │ • stream     │  │ • waitFor    │  │              │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ Load         │  │ Export       │  │ Cost         │             │    │
│  │   │ Service      │  │ Service      │  │ Service      │             │    │
│  │   │              │  │              │  │              │             │    │
│  │   │ • fromGcs    │  │ • toGcs      │  │ • estimate   │             │    │
│  │   │ • fromFile   │  │              │  │ • getJobCost │             │    │
│  │   │ • fromMemory │  │              │  │ • setLimit   │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐                                │    │
│  │   │ Dataset      │  │ Table        │                                │    │
│  │   │ Service      │  │ Service      │                                │    │
│  │   │              │  │              │                                │    │
│  │   │ • create     │  │ • create     │                                │    │
│  │   │ • get        │  │ • get        │                                │    │
│  │   │ • list       │  │ • list       │                                │    │
│  │   │ • delete     │  │ • delete     │                                │    │
│  │   └──────────────┘  └──────────────┘                                │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      gRPC Storage API Layer                          │    │
│  │                                                                      │    │
│  │   ┌──────────────────────────┐  ┌──────────────────────────┐        │    │
│  │   │ Storage Read Service     │  │ Storage Write Service    │        │    │
│  │   │                          │  │                          │        │    │
│  │   │ • createSession          │  │ • createStream           │        │    │
│  │   │ • readStream             │  │ • appendRows             │        │    │
│  │   │ • readAll (parallel)     │  │ • finalizeStream         │        │    │
│  │   │                          │  │ • batchCommit            │        │    │
│  │   │ Arrow/Avro format        │  │ Exactly-once semantics   │        │    │
│  │   └──────────────────────────┘  └──────────────────────────┘        │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Infrastructure Layer                         │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ HTTP         │  │ gRPC         │  │ Credentials  │             │    │
│  │   │ Transport    │  │ Transport    │  │ Provider     │             │    │
│  │   │ (REST API)   │  │ (Storage API)│  │ (gcp/auth)   │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Component Diagram (Level 3)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            COMPONENT DIAGRAM                                 │
│                              Query Service                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            QueryServiceImpl                                  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Public Interface                               │  │
│  │                                                                        │  │
│  │  execute(QueryRequest) ─────────────────────────────────────────────► │  │
│  │  executeAsync(QueryRequest) ────────────────────────────────────────► │  │
│  │  dryRun(query: String) ─────────────────────────────────────────────► │  │
│  │  executeStream(QueryRequest) ───────────────────────────────────────► │  │
│  │  executeParameterized(query, params) ───────────────────────────────► │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                     │                                        │
│                                     ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       Internal Components                              │  │
│  │                                                                        │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │  │
│  │  │ Request Builder │  │ Cost Checker    │  │ Response Parser │       │  │
│  │  │                 │  │                 │  │                 │       │  │
│  │  │ • buildQuery    │  │ • checkLimit    │  │ • parseRows     │       │  │
│  │  │   Request       │  │ • dryRunFirst   │  │ • parseSchema   │       │  │
│  │  │ • buildJob      │  │ • calculate     │  │ • parseStats    │       │  │
│  │  │   Config        │  │   Cost          │  │ • parseErrors   │       │  │
│  │  │ • serialize     │  │                 │  │                 │       │  │
│  │  │   Params        │  │                 │  │                 │       │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘       │  │
│  │                                                                        │  │
│  │  ┌─────────────────┐  ┌─────────────────┐                             │  │
│  │  │ Pagination      │  │ Metrics         │                             │  │
│  │  │ Handler         │  │ Recorder        │                             │  │
│  │  │                 │  │                 │                             │  │
│  │  │ • nextPage      │  │ • recordQuery   │                             │  │
│  │  │ • streamAll     │  │ • recordBytes   │                             │  │
│  │  │                 │  │ • recordLatency │                             │  │
│  │  └─────────────────┘  └─────────────────┘                             │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                     │                                        │
│                                     ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Dependencies                                   │  │
│  │                                                                        │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │  │
│  │  │ HttpTransport   │  │ Credentials     │  │ Resilience      │       │  │
│  │  │ (shared)        │  │ Provider        │  │ Orchestrator    │       │  │
│  │  │                 │  │ (gcp/auth)      │  │ (shared)        │       │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘       │  │
│  │                                                                        │  │
│  │  ┌─────────────────┐                                                  │  │
│  │  │ Observability   │                                                  │  │
│  │  │ (shared)        │                                                  │  │
│  │  └─────────────────┘                                                  │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Component Architecture

### 4.1 BigQuery Client Component

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BigQueryClient Component                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         BigQueryClientImpl                           │    │
│  │                                                                      │    │
│  │  config: BigQueryConfig                                              │    │
│  │  http_transport: Arc<dyn HttpTransport>                              │    │
│  │  grpc_transport: Arc<dyn GrpcTransport>                              │    │
│  │  credentials: Arc<dyn CredentialsProvider>                           │    │
│  │  resilience: Arc<ResilienceOrchestrator>                             │    │
│  │  observability: Arc<ObservabilityContext>                            │    │
│  │  cost_limit: Option<i64>                                             │    │
│  │                                                                      │    │
│  │  // Lazy-initialized services (Once<T> pattern)                      │    │
│  │  query_service: OnceCell<QueryServiceImpl>                           │    │
│  │  job_service: OnceCell<JobServiceImpl>                               │    │
│  │  streaming_service: OnceCell<StreamingServiceImpl>                   │    │
│  │  load_service: OnceCell<LoadServiceImpl>                             │    │
│  │  export_service: OnceCell<ExportServiceImpl>                         │    │
│  │  storage_read_service: OnceCell<StorageReadServiceImpl>              │    │
│  │  storage_write_service: OnceCell<StorageWriteServiceImpl>            │    │
│  │  cost_service: OnceCell<CostServiceImpl>                             │    │
│  │  dataset_service: OnceCell<DatasetServiceImpl>                       │    │
│  │  table_service: OnceCell<TableServiceImpl>                           │    │
│  │  simulation_service: OnceCell<SimulationServiceImpl>                 │    │
│  │                                                                      │    │
│  │  // Service accessors                                                │    │
│  │  fn queries(&self) -> &QueryService                                  │    │
│  │  fn jobs(&self) -> &JobService                                       │    │
│  │  fn streaming(&self) -> &StreamingService                            │    │
│  │  fn loading(&self) -> &LoadService                                   │    │
│  │  fn exports(&self) -> &ExportService                                 │    │
│  │  fn storage_read(&self) -> &StorageReadService                       │    │
│  │  fn storage_write(&self) -> &StorageWriteService                     │    │
│  │  fn costs(&self) -> &CostService                                     │    │
│  │  fn datasets(&self) -> &DatasetService                               │    │
│  │  fn tables(&self) -> &TableService                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Configuration Component

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Configuration Component                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         BigQueryConfig                               │    │
│  │                                                                      │    │
│  │  project_id: String                    // Required                   │    │
│  │  location: String                      // Default: "US"              │    │
│  │  credentials: CredentialProvider       // From gcp/auth              │    │
│  │  timeout: Duration                     // Default: 60s               │    │
│  │  default_dataset: Option<DatasetRef>   // Optional default           │    │
│  │  maximum_bytes_billed: Option<i64>     // Cost cap                   │    │
│  │  resilience: ResilienceConfig          // From shared                │    │
│  │  observability: ObservabilityConfig    // From shared                │    │
│  │  pricing: BigQueryPricing              // For cost calculation       │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         BigQueryPricing                              │    │
│  │                                                                      │    │
│  │  on_demand_per_tb: f64              // Default: $5.00                │    │
│  │  streaming_per_gb: f64              // Default: $0.01                │    │
│  │  storage_active_per_gb: f64         // Default: $0.02/month          │    │
│  │  storage_long_term_per_gb: f64      // Default: $0.01/month          │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    BigQueryConfigBuilder                             │    │
│  │                                                                      │    │
│  │  project_id(String) ──────────────────────────────────────────────► │    │
│  │  location(String) ────────────────────────────────────────────────► │    │
│  │  credentials(CredentialProvider) ─────────────────────────────────► │    │
│  │  timeout(Duration) ───────────────────────────────────────────────► │    │
│  │  default_dataset(DatasetRef) ─────────────────────────────────────► │    │
│  │  maximum_bytes_billed(i64) ───────────────────────────────────────► │    │
│  │  build() -> Result<BigQueryConfig, ConfigError>                      │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Service Architecture

### 5.1 Query Service Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Query Service Architecture                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                          QueryService Trait                           │   │
│  │                                                                       │   │
│  │  execute(QueryRequest) -> Result<QueryResponse>                       │   │
│  │  executeAsync(QueryRequest) -> Result<QueryJob>                       │   │
│  │  dryRun(query) -> Result<QueryDryRunResult>                          │   │
│  │  executeStream(QueryRequest) -> Stream<Row>                          │   │
│  │  executeParameterized(query, params) -> Result<QueryResponse>        │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                     │                                        │
│                                     │ implements                             │
│                                     ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        QueryServiceImpl                               │   │
│  │                                                                       │   │
│  │  project_id: String                                                   │   │
│  │  location: String                                                     │   │
│  │  http_transport: Arc<dyn HttpTransport>                               │   │
│  │  credentials: Arc<dyn CredentialsProvider>                            │   │
│  │  resilience: Arc<ResilienceOrchestrator>                              │   │
│  │  observability: Arc<ObservabilityContext>                             │   │
│  │  default_dataset: Option<DatasetReference>                            │   │
│  │  cost_limit: Option<i64>                                              │   │
│  │  pricing: BigQueryPricing                                             │   │
│  │                                                                       │   │
│  │  // Internal helpers                                                  │   │
│  │  build_query_request(QueryRequest) -> HttpRequest                     │   │
│  │  parse_query_response(HttpResponse) -> QueryResponse                  │   │
│  │  calculate_cost(bytes) -> f64                                         │   │
│  │  record_metrics(QueryResponse)                                        │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Query Execution Flow:                                                       │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐   │
│  │ Validate│───►│ Build   │───►│ Execute │───►│ Parse   │───►│ Record  │   │
│  │ Request │    │ Request │    │ HTTP    │    │ Response│    │ Metrics │   │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Job Service Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Job Service Architecture                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Job State Machine:                                                          │
│                                                                              │
│       ┌──────────┐                                                           │
│       │  PENDING │                                                           │
│       └────┬─────┘                                                           │
│            │                                                                 │
│            ▼                                                                 │
│       ┌──────────┐     cancel()    ┌───────────┐                            │
│       │ RUNNING  │────────────────►│ CANCELLED │                            │
│       └────┬─────┘                 └───────────┘                            │
│            │                                                                 │
│            ▼                                                                 │
│       ┌──────────┐                 ┌───────────┐                            │
│       │   DONE   │                 │  FAILED   │                            │
│       │ (success)│                 │ (error)   │                            │
│       └──────────┘                 └───────────┘                            │
│                                                                              │
│  Job Polling Strategy:                                                       │
│                                                                              │
│  Initial Poll ──► 1s ──► 1.5s ──► 2.25s ──► ... ──► 30s (max)              │
│                     │                                                        │
│                     └── Backoff factor: 1.5x                                 │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                          JobService Trait                             │   │
│  │                                                                       │   │
│  │  get(job_id, location) -> Result<Job>                                │   │
│  │  list(ListJobsRequest) -> Result<ListJobsResponse>                   │   │
│  │  cancel(job_id, location) -> Result<()>                              │   │
│  │  waitForCompletion(job_id, timeout, poll) -> Result<Job>             │   │
│  │  watch(job_id, poll) -> Stream<JobStatus>                            │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Streaming Service Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Streaming Service Architecture                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Direct Insert Flow:                                                         │
│                                                                              │
│  ┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │  Rows   │───►│ Validate    │───►│ POST        │───►│ Handle      │      │
│  │ (JSON)  │    │ & Serialize │    │ /insertAll  │    │ Errors      │      │
│  └─────────┘    └─────────────┘    └─────────────┘    └─────────────┘      │
│                                                                              │
│  Buffered Insert Architecture:                                               │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       BufferedInserter                               │    │
│  │                                                                      │    │
│  │  ┌─────────────────────────────────────────────────────────────┐   │    │
│  │  │                     Row Buffer                               │   │    │
│  │  │                                                              │   │    │
│  │  │  buffer: Vec<InsertRow>                                      │   │    │
│  │  │  buffer_size: AtomicUsize (bytes)                            │   │    │
│  │  │                                                              │   │    │
│  │  │  Flush Triggers:                                             │   │    │
│  │  │  • max_rows reached (default: 500)                           │   │    │
│  │  │  • max_bytes reached (default: 1MB)                          │   │    │
│  │  │  • flush_interval elapsed (default: 1s)                      │   │    │
│  │  │                                                              │   │    │
│  │  └─────────────────────────────────────────────────────────────┘   │    │
│  │                            │                                        │    │
│  │                            │ flush()                                │    │
│  │                            ▼                                        │    │
│  │  ┌─────────────────────────────────────────────────────────────┐   │    │
│  │  │                   StreamingService                           │   │    │
│  │  │                                                              │   │    │
│  │  │  insertAll(table, rows, options)                             │   │    │
│  │  │                                                              │   │    │
│  │  └─────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Error Handling:                                                             │
│  • insertErrors: Array of per-row errors                                     │
│  • skipInvalidRows: Continue despite errors                                  │
│  • ignoreUnknownValues: Skip unknown fields                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Data Flow Architecture

### 6.1 Query Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         QUERY EXECUTION FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Application                                                                 │
│      │                                                                       │
│      │ client.queries().execute(request)                                    │
│      ▼                                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        QueryService                                  │    │
│  │                                                                      │    │
│  │  1. Validate request                                                 │    │
│  │  2. Check cost limit (optional dry-run)                             │    │
│  │  3. Build authenticated HTTP request                                 │    │
│  │     └─► POST /bigquery/v2/projects/{project}/queries                │    │
│  │     └─► Authorization: Bearer {token}                                │    │
│  │     └─► Body: { query, useLegacySql, maximumBytesBilled, ... }      │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│      │                                                                       │
│      │ Execute via ResilienceOrchestrator                                   │
│      ▼                                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     shared/resilience                                │    │
│  │                                                                      │    │
│  │  retry(                                                              │    │
│  │    operation: HTTP POST,                                             │    │
│  │    retryable: [rateLimitExceeded, backendError, internalError]      │    │
│  │  )                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│      │                                                                       │
│      ▼                                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       BigQuery REST API                              │    │
│  │                                                                      │    │
│  │  POST https://bigquery.googleapis.com/bigquery/v2/projects/         │    │
│  │       {project}/queries                                              │    │
│  │                                                                      │    │
│  │  Response:                                                           │    │
│  │  {                                                                   │    │
│  │    "jobReference": { "projectId", "jobId", "location" },            │    │
│  │    "schema": { "fields": [...] },                                   │    │
│  │    "rows": [...],                                                   │    │
│  │    "totalBytesProcessed": "123456789",                              │    │
│  │    "cacheHit": false,                                               │    │
│  │    "jobComplete": true                                              │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│      │                                                                       │
│      ▼                                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        QueryService                                  │    │
│  │                                                                      │    │
│  │  4. Parse response                                                   │    │
│  │  5. Record metrics (bytes processed, cost, latency)                 │    │
│  │  6. Return QueryResponse                                            │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│      │                                                                       │
│      ▼                                                                       │
│  Application (receives QueryResponse with rows, schema, stats)              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Batch Load Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BATCH LOAD FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────┐      │
│  │                          Load Sources                              │      │
│  │                                                                    │      │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │      │
│  │  │ GCS Files   │  │ Local File  │  │ Memory Data │               │      │
│  │  │ (gs://...)  │  │ (path)      │  │ (bytes)     │               │      │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘               │      │
│  │         │                │                │                       │      │
│  │         │                │  Upload to GCS │  Upload to GCS        │      │
│  │         │                └────────┬───────┴───────┘               │      │
│  │         │                         │                               │      │
│  │         └─────────────────────────┼───────────────────────────────┘      │
│  │                                   │                                       │
│  │                                   ▼                                       │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  │                        LoadService                               │    │
│  │  │                                                                  │    │
│  │  │  Create Load Job:                                                │    │
│  │  │  {                                                               │    │
│  │  │    "configuration": {                                            │    │
│  │  │      "load": {                                                   │    │
│  │  │        "sourceUris": ["gs://bucket/file.json"],                 │    │
│  │  │        "sourceFormat": "NEWLINE_DELIMITED_JSON",                │    │
│  │  │        "destinationTable": { "projectId", "datasetId", "tableId"},│   │
│  │  │        "writeDisposition": "WRITE_APPEND",                      │    │
│  │  │        "autodetect": true                                       │    │
│  │  │      }                                                           │    │
│  │  │    }                                                             │    │
│  │  │  }                                                               │    │
│  │  │                                                                  │    │
│  │  └─────────────────────────────────────────────────────────────────┘    │
│  │                                   │                                       │
│  │                                   │ POST /jobs                            │
│  │                                   ▼                                       │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  │                        BigQuery                                  │    │
│  │  │                                                                  │    │
│  │  │  Job Created ──► PENDING ──► RUNNING ──► DONE                   │    │
│  │  │                                                                  │    │
│  │  └─────────────────────────────────────────────────────────────────┘    │
│  │                                   │                                       │
│  │                                   │ Poll via JobService                   │
│  │                                   ▼                                       │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  │                        JobService                                │    │
│  │  │                                                                  │    │
│  │  │  waitForCompletion(job_id, timeout, poll_interval)              │    │
│  │  │                                                                  │    │
│  │  └─────────────────────────────────────────────────────────────────┘    │
│  │                                                                          │
│  └──────────────────────────────────────────────────────────────────────────┘
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Cost Tracking Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        COST TRACKING ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                          CostService                                  │   │
│  │                                                                       │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │                    Cost Estimation                           │    │   │
│  │  │                                                              │    │   │
│  │  │  estimateQueryCost(query)                                    │    │   │
│  │  │      │                                                       │    │   │
│  │  │      └─► dryRun(query)                                       │    │   │
│  │  │          └─► totalBytesProcessed                             │    │   │
│  │  │              └─► calculateCost(bytes)                        │    │   │
│  │  │                  └─► bytes / 1TB * $5.00                     │    │   │
│  │  │                                                              │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │                                                                       │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │                    Cost Limit Enforcement                    │    │   │
│  │  │                                                              │    │   │
│  │  │  setCostLimit(max_bytes)                                     │    │   │
│  │  │      └─► Store in client config                              │    │   │
│  │  │                                                              │    │   │
│  │  │  Query with limit:                                           │    │   │
│  │  │  {                                                           │    │   │
│  │  │    "query": "SELECT ...",                                    │    │   │
│  │  │    "maximumBytesBilled": "1000000000"  ◄── 1 GB limit        │    │   │
│  │  │  }                                                           │    │   │
│  │  │                                                              │    │   │
│  │  │  If exceeded: bytesBilledLimitExceeded error                │    │   │
│  │  │                                                              │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │                                                                       │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │                    Job Cost Retrieval                        │    │   │
│  │  │                                                              │    │   │
│  │  │  getJobCost(job_id)                                          │    │   │
│  │  │      │                                                       │    │   │
│  │  │      └─► jobService.get(job_id)                              │    │   │
│  │  │          └─► job.statistics.totalBytesProcessed              │    │   │
│  │  │          └─► job.statistics.totalBytesBilled                 │    │   │
│  │  │          └─► job.statistics.totalSlotMs                      │    │   │
│  │  │              └─► calculateCost(bytes)                        │    │   │
│  │  │                                                              │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         Cost Metrics                                  │   │
│  │                                                                       │   │
│  │  bigquery_bytes_processed_total{project, operation}                  │   │
│  │  bigquery_bytes_billed_total{project}                                │   │
│  │  bigquery_estimated_cost_usd{project}                                │   │
│  │  bigquery_queries_total{project, cache_hit}                          │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Cost Calculation Formula:                                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                                                                       │   │
│  │  bytes_billed = roundUp(bytes_processed, 10MB)                       │   │
│  │  cost_usd = (bytes_billed / 1TB) * pricing.on_demand_per_tb          │   │
│  │                                                                       │   │
│  │  Minimum billing: 10 MB per query                                    │   │
│  │  Default price: $5.00 per TB                                         │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Storage API Architecture

### 8.1 Storage Read API

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       STORAGE READ API ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      StorageReadService                               │   │
│  │                                                                       │   │
│  │  Transport: gRPC (tonic)                                             │   │
│  │  Endpoint: bigquerystorage.googleapis.com                            │   │
│  │  Format: Arrow (default) or Avro                                     │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Read Session Architecture:                                                  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       CreateReadSession                              │    │
│  │                                                                      │    │
│  │  Request:                                                            │    │
│  │  {                                                                   │    │
│  │    parent: "projects/{project}",                                    │    │
│  │    read_session: {                                                  │    │
│  │      table: "projects/.../datasets/.../tables/...",                 │    │
│  │      data_format: ARROW,                                            │    │
│  │      read_options: {                                                │    │
│  │        selected_fields: ["col1", "col2"],   // Column projection    │    │
│  │        row_restriction: "col1 > 100"        // Row filtering        │    │
│  │      }                                                              │    │
│  │    },                                                               │    │
│  │    max_stream_count: 10                                             │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  │  Response:                                                           │    │
│  │  {                                                                   │    │
│  │    name: "projects/.../locations/.../sessions/...",                 │    │
│  │    streams: [                                                       │    │
│  │      { name: "stream-1" },                                          │    │
│  │      { name: "stream-2" },                                          │    │
│  │      ...                                                            │    │
│  │    ]                                                                │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Parallel Read Architecture:                                                 │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │                      BigQuery Table                                  │    │
│  │                           │                                          │    │
│  │         ┌─────────────────┼─────────────────┐                       │    │
│  │         │                 │                 │                        │    │
│  │         ▼                 ▼                 ▼                        │    │
│  │    ┌─────────┐       ┌─────────┐       ┌─────────┐                  │    │
│  │    │ Stream 1│       │ Stream 2│       │ Stream N│                  │    │
│  │    └────┬────┘       └────┬────┘       └────┬────┘                  │    │
│  │         │                 │                 │                        │    │
│  │         │ ReadRows        │ ReadRows        │ ReadRows              │    │
│  │         │ (gRPC stream)   │ (gRPC stream)   │ (gRPC stream)         │    │
│  │         ▼                 ▼                 ▼                        │    │
│  │    ┌─────────┐       ┌─────────┐       ┌─────────┐                  │    │
│  │    │ Arrow   │       │ Arrow   │       │ Arrow   │                  │    │
│  │    │ Batches │       │ Batches │       │ Batches │                  │    │
│  │    └────┬────┘       └────┬────┘       └────┬────┘                  │    │
│  │         │                 │                 │                        │    │
│  │         └─────────────────┼─────────────────┘                       │    │
│  │                           │                                          │    │
│  │                           ▼                                          │    │
│  │                  FuturesUnordered<Stream<ArrowBatch>>               │    │
│  │                           │                                          │    │
│  │                           ▼                                          │    │
│  │                    Application Code                                  │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Storage Write API

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STORAGE WRITE API ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Write Stream Modes:                                                         │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │   COMMITTED     │  │    PENDING      │  │    BUFFERED     │             │
│  │                 │  │                 │  │                 │             │
│  │ • Immediate     │  │ • Atomic commit │  │ • Best-effort   │             │
│  │   visibility    │  │ • Exactly-once  │  │ • Low latency   │             │
│  │ • Auto-commit   │  │ • Multi-stream  │  │ • No guarantee  │             │
│  │   per append    │  │   transaction   │  │                 │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                              │
│  Write Flow (PENDING mode for exactly-once):                                │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  1. CreateWriteStream(table, PENDING)                               │    │
│  │         │                                                           │    │
│  │         └─► Returns: stream_name                                    │    │
│  │                                                                      │    │
│  │  2. AppendRows(stream_name, rows) [repeated]                        │    │
│  │         │                                                           │    │
│  │         └─► Returns: offset (for exactly-once verification)         │    │
│  │                                                                      │    │
│  │  3. FinalizeWriteStream(stream_name)                                │    │
│  │         │                                                           │    │
│  │         └─► Returns: row_count                                      │    │
│  │                                                                      │    │
│  │  4. BatchCommitWriteStreams(table, [stream_names])                  │    │
│  │         │                                                           │    │
│  │         └─► Atomically commits all streams                          │    │
│  │         └─► Returns: commit_time                                    │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Parallel Write Architecture:                                                │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │    │
│  │  │  Writer 1   │  │  Writer 2   │  │  Writer N   │                  │    │
│  │  │  Stream A   │  │  Stream B   │  │  Stream N   │                  │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │    │
│  │         │                │                │                          │    │
│  │         │ AppendRows     │ AppendRows     │ AppendRows              │    │
│  │         ▼                ▼                ▼                          │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │                      BigQuery Table                          │    │    │
│  │  │                      (Pending State)                         │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  │                              │                                       │    │
│  │                              │ BatchCommitWriteStreams               │    │
│  │                              ▼                                       │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │                      BigQuery Table                          │    │    │
│  │  │                    (Committed State)                         │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Module Structure

```
integrations/
└── gcp/
    └── bigquery/
        ├── rust/
        │   ├── Cargo.toml
        │   ├── src/
        │   │   ├── lib.rs
        │   │   ├── client.rs
        │   │   ├── config.rs
        │   │   ├── error.rs
        │   │   ├── services/
        │   │   │   ├── mod.rs
        │   │   │   ├── query.rs
        │   │   │   ├── job.rs
        │   │   │   ├── streaming.rs
        │   │   │   ├── load.rs
        │   │   │   ├── export.rs
        │   │   │   ├── storage_read.rs
        │   │   │   ├── storage_write.rs
        │   │   │   ├── cost.rs
        │   │   │   ├── dataset.rs
        │   │   │   └── table.rs
        │   │   ├── types/
        │   │   │   ├── mod.rs
        │   │   │   ├── query.rs
        │   │   │   ├── job.rs
        │   │   │   ├── table.rs
        │   │   │   ├── schema.rs
        │   │   │   └── row.rs
        │   │   ├── transport/
        │   │   │   ├── mod.rs
        │   │   │   ├── http.rs
        │   │   │   └── grpc.rs
        │   │   └── simulation/
        │   │       ├── mod.rs
        │   │       ├── mock.rs
        │   │       ├── replay.rs
        │   │       └── generator.rs
        │   └── tests/
        │       ├── unit/
        │       ├── integration/
        │       └── fixtures/
        │
        └── typescript/
            ├── package.json
            ├── tsconfig.json
            ├── src/
            │   ├── index.ts
            │   ├── client.ts
            │   ├── config.ts
            │   ├── error.ts
            │   ├── services/
            │   │   ├── index.ts
            │   │   ├── query.ts
            │   │   ├── job.ts
            │   │   ├── streaming.ts
            │   │   ├── load.ts
            │   │   ├── export.ts
            │   │   ├── storageRead.ts
            │   │   ├── storageWrite.ts
            │   │   ├── cost.ts
            │   │   ├── dataset.ts
            │   │   └── table.ts
            │   ├── types/
            │   │   └── index.ts
            │   └── simulation/
            │       └── index.ts
            └── tests/
                ├── unit/
                └── integration/
```

---

## 10. Rust Crate Organization

### 10.1 Cargo.toml

```toml
[package]
name = "integrations-gcp-bigquery"
version = "0.1.0"
edition = "2021"

[lib]
name = "integrations_gcp_bigquery"
path = "src/lib.rs"

[dependencies]
# Shared primitives
integrations-gcp-auth = { path = "../../gcp/auth" }
integrations-shared-resilience = { path = "../../shared/resilience" }
integrations-shared-observability = { path = "../../shared/observability" }

# Async runtime
tokio = { version = "1.35", features = ["full"] }
futures = "0.3"
async-stream = "0.3"

# HTTP client
reqwest = { version = "0.11", features = ["rustls-tls", "json"] }

# gRPC client
tonic = { version = "0.10", features = ["tls"] }
prost = "0.12"

# Arrow for Storage API
arrow = { version = "50", features = ["ipc"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Time
chrono = { version = "0.4", features = ["serde"] }

# Error handling
thiserror = "1.0"

# Lazy initialization
once_cell = "1.19"

[dev-dependencies]
tokio-test = "0.4"
mockall = "0.12"
wiremock = "0.5"
tempfile = "3.9"

[features]
default = []
test-support = ["wiremock"]
simulation = []
```

### 10.2 Public Exports (lib.rs)

```rust
// Client
pub use client::{BigQueryClient, BigQueryClientBuilder};
pub use config::{BigQueryConfig, BigQueryConfigBuilder, BigQueryPricing};

// Services
pub use services::{
    QueryService, JobService, StreamingService,
    LoadService, ExportService, CostService,
    StorageReadService, StorageWriteService,
    DatasetService, TableService,
};

// Types
pub use types::{
    QueryRequest, QueryResponse, QueryDryRunResult,
    Job, JobStatus, JobReference, JobStatistics,
    TableReference, TableSchema, SchemaField,
    Row, InsertRow, InsertOptions,
    Dataset, Table,
    ReadSession, WriteStream, WriteStreamMode,
    CostEstimate, JobCost,
};

// Errors
pub use error::{BigQueryError, BigQueryErrorKind};

// Simulation (feature-gated)
#[cfg(feature = "simulation")]
pub use simulation::{MockBigQuery, WorkloadReplay, DataGenerator};
```

---

## 11. TypeScript Package Organization

### 11.1 package.json

```json
{
  "name": "@integrations/gcp-bigquery",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration"
  },
  "dependencies": {
    "@integrations/gcp-auth": "workspace:*",
    "@integrations/shared-resilience": "workspace:*",
    "@integrations/shared-observability": "workspace:*",
    "@grpc/grpc-js": "^1.9.0",
    "apache-arrow": "^15.0.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.11",
    "jest": "^29.7.0",
    "typescript": "^5.3.3",
    "msw": "^2.0.11"
  }
}
```

### 11.2 Public Exports (index.ts)

```typescript
// Client
export { BigQueryClient, BigQueryClientBuilder } from './client';
export { BigQueryConfig, BigQueryConfigBuilder, BigQueryPricing } from './config';

// Services
export {
  QueryService,
  JobService,
  StreamingService,
  LoadService,
  ExportService,
  CostService,
  StorageReadService,
  StorageWriteService,
  DatasetService,
  TableService,
} from './services';

// Types
export {
  QueryRequest,
  QueryResponse,
  QueryDryRunResult,
  Job,
  JobStatus,
  TableReference,
  TableSchema,
  Row,
  InsertRow,
  Dataset,
  Table,
  CostEstimate,
  JobCost,
} from './types';

// Errors
export { BigQueryError, BigQueryErrorKind } from './error';
```

---

## 12. Testing Architecture

### 12.1 Test Categories

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TESTING ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Unit Tests                                   │    │
│  │                                                                      │    │
│  │  • Query request/response serialization                             │    │
│  │  • Cost calculation logic                                           │    │
│  │  • Parameter serialization                                          │    │
│  │  • Schema parsing                                                   │    │
│  │  • Error mapping                                                    │    │
│  │  • Row conversion                                                   │    │
│  │  • Job state machine                                                │    │
│  │                                                                      │    │
│  │  Coverage Target: >90%                                              │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      Integration Tests                               │    │
│  │                                                                      │    │
│  │  • Query execution flow (wiremock)                                  │    │
│  │  • Job lifecycle (create → poll → complete)                         │    │
│  │  • Streaming insert flow                                            │    │
│  │  • Cost estimation flow                                             │    │
│  │  • Error handling scenarios                                         │    │
│  │  • Retry/circuit breaker behavior                                   │    │
│  │                                                                      │    │
│  │  Mock Server: wiremock (Rust), msw (TypeScript)                     │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       E2E Tests (Optional)                           │    │
│  │                                                                      │    │
│  │  • Real BigQuery queries (gated by env var)                         │    │
│  │  • Storage API reads/writes                                         │    │
│  │  • Cost verification                                                │    │
│  │                                                                      │    │
│  │  Requires: BIGQUERY_E2E_TESTS=true + credentials                    │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Mock Server Setup

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MOCK SERVER ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        MockBigQueryServer                             │   │
│  │                                                                       │   │
│  │  Endpoints:                                                           │   │
│  │                                                                       │   │
│  │  POST /bigquery/v2/projects/{project}/queries                        │   │
│  │    └─► Mock query execution                                          │   │
│  │                                                                       │   │
│  │  POST /bigquery/v2/projects/{project}/jobs                           │   │
│  │    └─► Mock job creation                                             │   │
│  │                                                                       │   │
│  │  GET /bigquery/v2/projects/{project}/jobs/{jobId}                    │   │
│  │    └─► Mock job status                                               │   │
│  │                                                                       │   │
│  │  POST /bigquery/v2/.../insertAll                                     │   │
│  │    └─► Mock streaming insert                                         │   │
│  │                                                                       │   │
│  │  Configurable:                                                        │   │
│  │  • Response data (rows, schema)                                      │   │
│  │  • Error injection                                                   │   │
│  │  • Latency simulation                                                │   │
│  │  • Job state progression                                             │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial architecture |

---

**End of Architecture Phase**

*Next: Refinement phase will cover edge cases, performance optimization, and security hardening.*
