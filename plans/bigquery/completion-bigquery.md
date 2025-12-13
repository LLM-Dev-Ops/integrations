# Google BigQuery Integration Completion

## SPARC Phase 5: Completion

*Implementation roadmap, file structure, and final deliverables*

---

## 1. Implementation File Structure

### 1.1 Rust Implementation

```
integrations/
└── gcp/
    └── bigquery/
        └── rust/
            ├── Cargo.toml
            ├── README.md
            ├── src/
            │   ├── lib.rs                      # Public API exports
            │   ├── client.rs                   # BigQueryClient implementation
            │   ├── config.rs                   # BigQueryConfig and builders
            │   │
            │   ├── services/
            │   │   ├── mod.rs
            │   │   ├── query/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # QueryService implementation
            │   │   │   ├── execute.rs          # Sync query execution
            │   │   │   ├── async_query.rs      # Async query execution
            │   │   │   ├── dry_run.rs          # Dry-run cost estimation
            │   │   │   ├── streaming.rs        # Query result streaming
            │   │   │   ├── parameterized.rs    # Parameterized queries
            │   │   │   ├── request.rs          # Query request types
            │   │   │   └── response.rs         # Query response types
            │   │   ├── job/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # JobService implementation
            │   │   │   ├── get.rs              # Get job operations
            │   │   │   ├── wait.rs             # Wait for completion (polling)
            │   │   │   ├── cancel.rs           # Cancel job operations
            │   │   │   ├── list.rs             # List jobs operations
            │   │   │   └── types.rs            # Job types
            │   │   ├── streaming/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # StreamingService implementation
            │   │   │   ├── insert_all.rs       # insertAll operations
            │   │   │   ├── buffered.rs         # BufferedInserter
            │   │   │   ├── request.rs          # Streaming request types
            │   │   │   └── response.rs         # Streaming response types
            │   │   ├── load/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # LoadService implementation
            │   │   │   ├── gcs.rs              # Load from GCS
            │   │   │   ├── file.rs             # Load from local file
            │   │   │   ├── memory.rs           # Load from memory buffer
            │   │   │   └── types.rs            # Load job types
            │   │   ├── export/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # ExportService implementation
            │   │   │   ├── gcs.rs              # Export to GCS
            │   │   │   └── types.rs            # Export job types
            │   │   ├── storage_read/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # StorageReadService (gRPC)
            │   │   │   ├── session.rs          # Read session management
            │   │   │   ├── stream.rs           # Stream reading (Arrow)
            │   │   │   ├── parallel.rs         # Parallel read operations
            │   │   │   └── types.rs            # Storage Read types
            │   │   ├── storage_write/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # StorageWriteService (gRPC)
            │   │   │   ├── stream.rs           # Write stream management
            │   │   │   ├── append.rs           # AppendRows operations
            │   │   │   ├── commit.rs           # Commit/finalize operations
            │   │   │   └── types.rs            # Storage Write types
            │   │   ├── cost/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # CostService implementation
            │   │   │   ├── estimate.rs         # Cost estimation logic
            │   │   │   ├── limits.rs           # Byte limit management
            │   │   │   └── types.rs            # Cost types
            │   │   ├── dataset/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # DatasetService implementation
            │   │   │   ├── crud.rs             # Create, get, delete, list
            │   │   │   └── types.rs            # Dataset types
            │   │   └── table/
            │   │       ├── mod.rs
            │   │       ├── service.rs          # TableService implementation
            │   │       ├── crud.rs             # Create, get, delete, list
            │   │       ├── schema.rs           # Schema operations
            │   │       └── types.rs            # Table types
            │   │
            │   ├── transport/
            │   │   ├── mod.rs
            │   │   ├── rest.rs                 # REST API transport (reqwest)
            │   │   ├── grpc.rs                 # gRPC transport (tonic)
            │   │   └── channel.rs              # gRPC channel management
            │   │
            │   ├── arrow/
            │   │   ├── mod.rs
            │   │   ├── reader.rs               # Arrow IPC reader
            │   │   ├── converter.rs            # Arrow to Row conversion
            │   │   └── schema.rs               # BigQuery to Arrow schema mapping
            │   │
            │   ├── simulation/
            │   │   ├── mod.rs
            │   │   ├── mock_client.rs          # MockBigQueryClient
            │   │   ├── replay.rs               # Query replay functionality
            │   │   ├── generator.rs            # Test data generator
            │   │   └── types.rs                # Simulation types
            │   │
            │   ├── types/
            │   │   ├── mod.rs
            │   │   ├── query.rs                # QueryRequest, QueryResponse
            │   │   ├── job.rs                  # Job, JobReference, JobStatus
            │   │   ├── table.rs                # Table, TableReference
            │   │   ├── dataset.rs              # Dataset, DatasetReference
            │   │   ├── schema.rs               # TableSchema, TableFieldSchema
            │   │   ├── row.rs                  # TableRow, TableCell
            │   │   ├── parameter.rs            # QueryParameter types
            │   │   └── cost.rs                 # CostEstimate, BytesBilled
            │   │
            │   ├── builders/
            │   │   ├── mod.rs
            │   │   ├── client_builder.rs       # Client configuration builder
            │   │   ├── query_builder.rs        # Query builder
            │   │   ├── load_builder.rs         # Load job builder
            │   │   └── export_builder.rs       # Export job builder
            │   │
            │   ├── error.rs                    # BigQueryError and error types
            │   └── util.rs                     # Utility functions
            │
            └── tests/
                ├── unit/
                │   ├── services/
                │   │   ├── query_test.rs
                │   │   ├── job_test.rs
                │   │   ├── streaming_test.rs
                │   │   ├── load_test.rs
                │   │   ├── export_test.rs
                │   │   ├── storage_read_test.rs
                │   │   ├── storage_write_test.rs
                │   │   ├── cost_test.rs
                │   │   ├── dataset_test.rs
                │   │   └── table_test.rs
                │   ├── transport/
                │   │   ├── rest_test.rs
                │   │   └── grpc_test.rs
                │   ├── arrow/
                │   │   ├── reader_test.rs
                │   │   └── converter_test.rs
                │   ├── types/
                │   │   ├── query_test.rs
                │   │   ├── job_test.rs
                │   │   ├── schema_test.rs
                │   │   └── parameter_test.rs
                │   └── error_test.rs
                │
                ├── integration/
                │   ├── common/
                │   │   └── mod.rs              # Test utilities, mock server setup
                │   ├── query_integration_test.rs
                │   ├── job_integration_test.rs
                │   ├── streaming_integration_test.rs
                │   ├── load_integration_test.rs
                │   ├── storage_api_integration_test.rs
                │   ├── cost_integration_test.rs
                │   └── simulation_integration_test.rs
                │
                ├── e2e/
                │   ├── mod.rs                  # E2E test setup (real BigQuery)
                │   ├── query_e2e_test.rs
                │   ├── streaming_e2e_test.rs
                │   ├── load_e2e_test.rs
                │   └── storage_api_e2e_test.rs
                │
                ├── fixtures/
                │   ├── requests/
                │   │   ├── query_sync.json
                │   │   ├── query_async.json
                │   │   ├── query_dry_run.json
                │   │   ├── query_parameterized.json
                │   │   ├── insert_all.json
                │   │   ├── load_gcs.json
                │   │   └── export_gcs.json
                │   ├── responses/
                │   │   ├── query_success.json
                │   │   ├── query_async_pending.json
                │   │   ├── query_async_complete.json
                │   │   ├── dry_run_result.json
                │   │   ├── job_status_running.json
                │   │   ├── job_status_done.json
                │   │   ├── insert_all_success.json
                │   │   ├── insert_all_partial.json
                │   │   └── errors/
                │   │       ├── invalid_query.json
                │   │       ├── quota_exceeded.json
                │   │       ├── bytes_billed_exceeded.json
                │   │       ├── table_not_found.json
                │   │       └── rate_limited.json
                │   ├── arrow/
                │   │   ├── sample_batch.arrow
                │   │   └── large_batch.arrow
                │   └── data/
                │       ├── sample_rows.json
                │       └── replay_scenario.json
                │
                └── mocks/
                    ├── mod.rs
                    ├── rest_transport.rs       # MockRestTransport
                    ├── grpc_transport.rs       # MockGrpcTransport
                    ├── credentials.rs          # MockCredentialProvider
                    └── responses.rs            # Canned BigQuery responses
```

### 1.2 TypeScript Implementation

```
integrations/
└── gcp/
    └── bigquery/
        └── typescript/
            ├── package.json
            ├── tsconfig.json
            ├── README.md
            ├── src/
            │   ├── index.ts                    # Public API exports
            │   ├── client.ts                   # BigQueryClient implementation
            │   ├── config.ts                   # BigQueryConfig and builders
            │   │
            │   ├── services/
            │   │   ├── index.ts
            │   │   ├── query/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts          # QueryService
            │   │   │   ├── execute.ts          # Sync query execution
            │   │   │   ├── asyncQuery.ts       # Async query execution
            │   │   │   ├── dryRun.ts           # Dry-run cost estimation
            │   │   │   ├── streaming.ts        # Query result streaming
            │   │   │   ├── request.ts          # Query request types
            │   │   │   └── response.ts         # Query response types
            │   │   ├── job/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts          # JobService
            │   │   │   ├── wait.ts             # Wait for completion
            │   │   │   └── types.ts            # Job types
            │   │   ├── streaming/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts          # StreamingService
            │   │   │   ├── insertAll.ts        # insertAll operations
            │   │   │   ├── buffered.ts         # BufferedInserter
            │   │   │   └── types.ts            # Streaming types
            │   │   ├── load/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts          # LoadService
            │   │   │   └── types.ts            # Load types
            │   │   ├── export/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts          # ExportService
            │   │   │   └── types.ts            # Export types
            │   │   ├── storageRead/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts          # StorageReadService (gRPC)
            │   │   │   ├── session.ts          # Read session management
            │   │   │   └── types.ts            # Storage Read types
            │   │   ├── storageWrite/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts          # StorageWriteService (gRPC)
            │   │   │   ├── stream.ts           # Write stream management
            │   │   │   └── types.ts            # Storage Write types
            │   │   ├── cost/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts          # CostService
            │   │   │   └── types.ts            # Cost types
            │   │   ├── dataset/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts          # DatasetService
            │   │   │   └── types.ts            # Dataset types
            │   │   └── table/
            │   │       ├── index.ts
            │   │       ├── service.ts          # TableService
            │   │       └── types.ts            # Table types
            │   │
            │   ├── transport/
            │   │   ├── index.ts
            │   │   ├── rest.ts                 # REST API transport
            │   │   └── grpc.ts                 # gRPC transport
            │   │
            │   ├── arrow/
            │   │   ├── index.ts
            │   │   ├── reader.ts               # Arrow IPC reader
            │   │   └── converter.ts            # Arrow to Row conversion
            │   │
            │   ├── simulation/
            │   │   ├── index.ts
            │   │   ├── mockClient.ts           # MockBigQueryClient
            │   │   ├── replay.ts               # Query replay
            │   │   └── generator.ts            # Test data generator
            │   │
            │   ├── types/
            │   │   ├── index.ts
            │   │   ├── query.ts                # Query types
            │   │   ├── job.ts                  # Job types
            │   │   ├── table.ts                # Table types
            │   │   ├── dataset.ts              # Dataset types
            │   │   ├── schema.ts               # Schema types
            │   │   ├── row.ts                  # Row types
            │   │   ├── parameter.ts            # Parameter types
            │   │   └── cost.ts                 # Cost types
            │   │
            │   ├── builders/
            │   │   ├── index.ts
            │   │   ├── clientBuilder.ts        # Client configuration builder
            │   │   ├── queryBuilder.ts         # Query builder
            │   │   ├── loadBuilder.ts          # Load job builder
            │   │   └── exportBuilder.ts        # Export job builder
            │   │
            │   ├── error.ts                    # BigQueryError types
            │   └── util.ts                     # Utilities
            │
            └── tests/
                ├── unit/
                │   ├── services/
                │   │   ├── query.test.ts
                │   │   ├── job.test.ts
                │   │   ├── streaming.test.ts
                │   │   ├── load.test.ts
                │   │   ├── storageRead.test.ts
                │   │   ├── storageWrite.test.ts
                │   │   ├── cost.test.ts
                │   │   ├── dataset.test.ts
                │   │   └── table.test.ts
                │   ├── transport/
                │   │   ├── rest.test.ts
                │   │   └── grpc.test.ts
                │   ├── arrow/
                │   │   └── converter.test.ts
                │   └── types/
                │       └── validation.test.ts
                │
                ├── integration/
                │   ├── setup.ts                # Mock server setup
                │   ├── query.integration.test.ts
                │   ├── job.integration.test.ts
                │   ├── streaming.integration.test.ts
                │   └── storageApi.integration.test.ts
                │
                └── mocks/
                    ├── index.ts
                    ├── restTransport.ts        # MockRestTransport
                    ├── grpcTransport.ts        # MockGrpcTransport
                    └── credentials.ts          # MockCredentialProvider
```

---

## 2. Implementation Order

### 2.1 Phase 1: Core Infrastructure (Foundation)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 1: CORE INFRASTRUCTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  1.1   │ error.rs/error.ts      │ shared/errors       │ Error mapping      │
│  1.2   │ types/schema.rs        │ None                │ Schema types       │
│  1.3   │ types/row.rs           │ 1.2                 │ Row types          │
│  1.4   │ types/table.rs         │ 1.2                 │ Table types        │
│  1.5   │ types/dataset.rs       │ None                │ Dataset types      │
│  1.6   │ types/job.rs           │ None                │ Job types          │
│  1.7   │ types/parameter.rs     │ None                │ Parameter types    │
│  1.8   │ types/cost.rs          │ None                │ Cost types         │
│  1.9   │ config.rs/config.ts    │ gcp/auth            │ Config validation  │
│  1.10  │ util.rs/util.ts        │ None                │ Validation helpers │
│                                                                             │
│  Deliverables:                                                              │
│  - BigQueryError enum with all error variants                              │
│  - TableSchema, TableFieldSchema with nested field support                 │
│  - TableRow, TableCell for query results                                   │
│  - Table, TableReference types                                             │
│  - Dataset, DatasetReference types                                         │
│  - Job, JobReference, JobStatus, JobConfiguration types                    │
│  - QueryParameter (positional and named)                                   │
│  - CostEstimate, BytesBilled types                                         │
│  - BigQueryConfig struct with builder                                      │
│  - Project/Dataset/Table ID validation utilities                           │
│                                                                             │
│  Tests:                                                                     │
│  - Error conversion from HTTP status codes                                 │
│  - Schema serialization/deserialization                                    │
│  - Nested field schema handling                                            │
│  - Row/cell type conversion                                                │
│  - Parameter type handling (STRING, INT64, FLOAT64, BOOL, etc.)            │
│  - Config validation (project ID, location)                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Phase 2: Transport Layer

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 2: TRANSPORT LAYER                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  2.1   │ transport/rest.rs      │ gcp/auth, reqwest   │ REST operations    │
│  2.2   │ transport/channel.rs   │ tonic               │ gRPC channel       │
│  2.3   │ transport/grpc.rs      │ 2.2, gcp/auth       │ gRPC operations    │
│                                                                             │
│  Deliverables:                                                              │
│                                                                             │
│  RestTransport:                                                             │
│  - new() - Create with config                                              │
│  - get() - HTTP GET request                                                │
│  - post() - HTTP POST request                                              │
│  - delete() - HTTP DELETE request                                          │
│  - patch() - HTTP PATCH request                                            │
│  - Automatic OAuth2 token injection                                        │
│  - Base URL: https://bigquery.googleapis.com/bigquery/v2                   │
│                                                                             │
│  GrpcChannel:                                                               │
│  - new() - Create gRPC channel                                             │
│  - with_interceptor() - Add auth interceptor                               │
│  - Endpoint: bigquerystorage.googleapis.com:443                            │
│                                                                             │
│  GrpcTransport:                                                             │
│  - Storage Read API client                                                 │
│  - Storage Write API client                                                │
│  - Automatic token refresh                                                 │
│                                                                             │
│  Tests:                                                                     │
│  - REST request/response serialization                                     │
│  - OAuth2 token injection in headers                                       │
│  - gRPC channel creation and authentication                                │
│  - Connection error handling                                               │
│  - Timeout handling                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Phase 3: Query Service

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 3: QUERY SERVICE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  3.1   │ query/request.rs       │ Phase 1             │ Request types      │
│  3.2   │ query/response.rs      │ Phase 1             │ Response parsing   │
│  3.3   │ query/execute.rs       │ 3.1, 3.2, Phase 2   │ Sync queries       │
│  3.4   │ query/async_query.rs   │ 3.1, 3.2, Phase 2   │ Async queries      │
│  3.5   │ query/dry_run.rs       │ 3.1, 3.2            │ Dry-run queries    │
│  3.6   │ query/streaming.rs     │ 3.4                 │ Result streaming   │
│  3.7   │ query/parameterized.rs │ 3.3                 │ Parameterized      │
│  3.8   │ query/service.rs       │ 3.3-3.7             │ Service facade     │
│                                                                             │
│  Deliverables:                                                              │
│                                                                             │
│  QueryService:                                                              │
│  - execute() - Sync query (jobs.query endpoint)                            │
│  - execute_async() - Async query (jobs.insert)                             │
│  - dry_run() - Cost estimation without execution                           │
│  - execute_stream() - Streaming result iterator                            │
│  - execute_parameterized() - Named/positional parameters                   │
│                                                                             │
│  QueryRequest:                                                              │
│  - query: String                                                           │
│  - default_dataset: Option<DatasetReference>                               │
│  - use_legacy_sql: bool (default false)                                    │
│  - maximum_bytes_billed: Option<i64>                                       │
│  - timeout_ms: Option<u64>                                                 │
│  - dry_run: bool                                                           │
│  - use_query_cache: bool                                                   │
│  - query_parameters: Vec<QueryParameter>                                   │
│  - parameter_mode: ParameterMode (NAMED or POSITIONAL)                     │
│  - labels: HashMap<String, String>                                         │
│  - priority: QueryPriority (INTERACTIVE or BATCH)                          │
│                                                                             │
│  Tests:                                                                     │
│  - Sync query request/response                                             │
│  - Async query with job polling                                            │
│  - Dry-run returns totalBytesProcessed                                     │
│  - Query parameter injection                                               │
│  - Result pagination (pageToken handling)                                  │
│  - Query timeout handling                                                  │
│  - maximumBytesBilled enforcement                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Phase 4: Job Service

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 4: JOB SERVICE                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  4.1   │ job/types.rs           │ Phase 1             │ Job types          │
│  4.2   │ job/get.rs             │ 4.1, Phase 2        │ Get job            │
│  4.3   │ job/wait.rs            │ 4.2                 │ Wait for job       │
│  4.4   │ job/cancel.rs          │ 4.1, Phase 2        │ Cancel job         │
│  4.5   │ job/list.rs            │ 4.1, Phase 2        │ List jobs          │
│  4.6   │ job/service.rs         │ 4.2-4.5             │ Service facade     │
│                                                                             │
│  Deliverables:                                                              │
│                                                                             │
│  JobService:                                                                │
│  - get() - Get job by ID                                                   │
│  - wait_for_completion() - Poll until DONE                                 │
│  - cancel() - Cancel running job                                           │
│  - list() - List jobs with filters                                         │
│                                                                             │
│  Polling Strategy:                                                          │
│  - Initial delay: 1 second                                                 │
│  - Max delay: 30 seconds                                                   │
│  - Backoff factor: 1.5                                                     │
│  - Max attempts: configurable (default unlimited with timeout)             │
│                                                                             │
│  Job Status Values:                                                         │
│  - PENDING - Job queued                                                    │
│  - RUNNING - Job executing                                                 │
│  - DONE - Job completed (check errorResult for success/failure)            │
│                                                                             │
│  Tests:                                                                     │
│  - Get job returns full job details                                        │
│  - Wait polls until DONE                                                   │
│  - Exponential backoff applied correctly                                   │
│  - Cancel returns success for running job                                  │
│  - List pagination works correctly                                         │
│  - Job failure detected via errorResult                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.5 Phase 5: Streaming Insert Service

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 5: STREAMING INSERT SERVICE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  5.1   │ streaming/request.rs   │ Phase 1             │ Request types      │
│  5.2   │ streaming/response.rs  │ Phase 1             │ Response types     │
│  5.3   │ streaming/insert_all.rs│ 5.1, 5.2, Phase 2   │ insertAll ops      │
│  5.4   │ streaming/buffered.rs  │ 5.3                 │ BufferedInserter   │
│  5.5   │ streaming/service.rs   │ 5.3, 5.4            │ Service facade     │
│                                                                             │
│  Deliverables:                                                              │
│                                                                             │
│  StreamingService:                                                          │
│  - insert_all() - Insert rows via tabledata.insertAll                      │
│  - buffered_inserter() - Create BufferedInserter                           │
│                                                                             │
│  BufferedInserter:                                                          │
│  - add() - Add row to buffer                                               │
│  - add_batch() - Add multiple rows                                         │
│  - flush() - Manually flush buffer                                         │
│  - close() - Flush and close                                               │
│                                                                             │
│  Buffer Triggers:                                                           │
│  - max_rows: 500 (max 10,000 per API call)                                 │
│  - max_bytes: 5MB (max 10MB per API call)                                  │
│  - flush_interval: 1 second                                                │
│                                                                             │
│  InsertAllRequest:                                                          │
│  - rows: Vec<TableDataInsertAllRequestRows>                                │
│  - skip_invalid_rows: bool                                                 │
│  - ignore_unknown_values: bool                                             │
│  - template_suffix: Option<String>                                         │
│                                                                             │
│  Tests:                                                                     │
│  - insertAll request serialization                                         │
│  - Partial failure handling (insertErrors)                                 │
│  - Skip invalid rows behavior                                              │
│  - Insert ID deduplication                                                 │
│  - Buffer flush triggers correctly                                         │
│  - Row size limit enforcement                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.6 Phase 6: Load & Export Services

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 6: LOAD & EXPORT SERVICES                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  6.1   │ load/types.rs          │ Phase 1             │ Load job types     │
│  6.2   │ load/gcs.rs            │ 6.1, Phase 2, 4     │ Load from GCS      │
│  6.3   │ load/file.rs           │ 6.1, Phase 2        │ Load from file     │
│  6.4   │ load/memory.rs         │ 6.1, Phase 2        │ Load from memory   │
│  6.5   │ load/service.rs        │ 6.2-6.4             │ Service facade     │
│  6.6   │ export/types.rs        │ Phase 1             │ Export job types   │
│  6.7   │ export/gcs.rs          │ 6.6, Phase 2, 4     │ Export to GCS      │
│  6.8   │ export/service.rs      │ 6.7                 │ Service facade     │
│                                                                             │
│  Deliverables:                                                              │
│                                                                             │
│  LoadService:                                                               │
│  - load_from_gcs() - Load from Cloud Storage URIs                          │
│  - load_from_file() - Upload and load local file                           │
│  - load_from_memory() - Load from in-memory buffer                         │
│                                                                             │
│  LoadJobConfig:                                                             │
│  - source_uris: Vec<String>                                                │
│  - source_format: SourceFormat (CSV, JSON, AVRO, PARQUET, ORC)             │
│  - schema: Option<TableSchema>                                             │
│  - schema_update_options: Vec<SchemaUpdateOption>                          │
│  - write_disposition: WriteDisposition (WRITE_TRUNCATE/APPEND/EMPTY)       │
│  - create_disposition: CreateDisposition (CREATE_IF_NEEDED/CREATE_NEVER)   │
│  - max_bad_records: i32                                                    │
│  - null_marker: Option<String>                                             │
│                                                                             │
│  ExportService:                                                             │
│  - export_to_gcs() - Export table to Cloud Storage                         │
│                                                                             │
│  ExportJobConfig:                                                           │
│  - destination_uris: Vec<String>                                           │
│  - destination_format: DestinationFormat (CSV, JSON, AVRO, PARQUET)        │
│  - compression: Compression (GZIP, SNAPPY, DEFLATE, NONE)                  │
│  - print_header: bool                                                      │
│  - field_delimiter: Option<String>                                         │
│                                                                             │
│  Tests:                                                                     │
│  - Load job creation with various formats                                  │
│  - Schema auto-detection option                                            │
│  - Write disposition behavior                                              │
│  - Export job creation                                                     │
│  - Compression options                                                     │
│  - Job completion polling                                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.7 Phase 7: Storage Read API (gRPC)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 7: STORAGE READ API (gRPC)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  7.1   │ arrow/schema.rs        │ Phase 1, arrow      │ Schema mapping     │
│  7.2   │ arrow/reader.rs        │ 7.1                 │ Arrow IPC reader   │
│  7.3   │ arrow/converter.rs     │ 7.1, 7.2            │ Arrow to Row       │
│  7.4   │ storage_read/types.rs  │ Phase 1             │ Storage types      │
│  7.5   │ storage_read/session.rs│ 7.4, Phase 2        │ Session mgmt       │
│  7.6   │ storage_read/stream.rs │ 7.2, 7.5            │ Stream reading     │
│  7.7   │ storage_read/parallel.rs│ 7.6                │ Parallel reads     │
│  7.8   │ storage_read/service.rs│ 7.5-7.7             │ Service facade     │
│                                                                             │
│  Deliverables:                                                              │
│                                                                             │
│  StorageReadService:                                                        │
│  - create_session() - CreateReadSession RPC                                │
│  - read_stream() - ReadRows RPC for single stream                          │
│  - read_all() - Read all streams in parallel                               │
│  - read_with_filter() - Read with row filter                               │
│                                                                             │
│  ReadSession:                                                               │
│  - name: String (session resource name)                                    │
│  - streams: Vec<ReadStream>                                                │
│  - expire_time: Timestamp                                                  │
│  - estimated_row_count: i64                                                │
│                                                                             │
│  CreateReadSessionRequest:                                                  │
│  - parent: String (projects/{project})                                     │
│  - read_session: ReadSession template                                      │
│  - max_stream_count: i32                                                   │
│  - preferred_min_stream_count: i32                                         │
│                                                                             │
│  ReadSession options:                                                       │
│  - table: String (table reference)                                         │
│  - selected_fields: Vec<String> (column projection)                        │
│  - row_restriction: String (SQL WHERE clause)                              │
│  - data_format: DataFormat (ARROW or AVRO)                                 │
│                                                                             │
│  Arrow Processing:                                                          │
│  - Parse Arrow IPC format from ReadRows response                           │
│  - Convert Arrow RecordBatch to TableRow                                   │
│  - Handle nested/repeated fields                                           │
│                                                                             │
│  Tests:                                                                     │
│  - Session creation with column projection                                 │
│  - Single stream reading                                                   │
│  - Parallel stream reading                                                 │
│  - Arrow batch parsing                                                     │
│  - Row filter application                                                  │
│  - Session expiration handling (24 hour limit)                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.8 Phase 8: Storage Write API (gRPC)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 8: STORAGE WRITE API (gRPC)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  8.1   │ storage_write/types.rs │ Phase 1             │ Storage types      │
│  8.2   │ storage_write/stream.rs│ 8.1, Phase 2        │ Stream mgmt        │
│  8.3   │ storage_write/append.rs│ 8.2                 │ AppendRows         │
│  8.4   │ storage_write/commit.rs│ 8.2                 │ Commit/finalize    │
│  8.5   │ storage_write/service.rs│ 8.2-8.4            │ Service facade     │
│                                                                             │
│  Deliverables:                                                              │
│                                                                             │
│  StorageWriteService:                                                       │
│  - create_stream() - CreateWriteStream RPC                                 │
│  - append_rows() - AppendRows RPC (streaming)                              │
│  - finalize_stream() - FinalizeWriteStream RPC                             │
│  - batch_commit() - BatchCommitWriteStreams RPC                            │
│  - flush_rows() - FlushRows RPC                                            │
│                                                                             │
│  WriteStream Types:                                                         │
│  - COMMITTED - Rows visible immediately, at-least-once                     │
│  - PENDING - Rows visible after explicit commit, exactly-once              │
│  - BUFFERED - Server-side buffering, auto-commit at threshold              │
│                                                                             │
│  AppendRowsRequest:                                                         │
│  - write_stream: String (stream name)                                      │
│  - offset: Option<i64> (for exactly-once)                                  │
│  - proto_rows: ProtoRows (serialized row data)                             │
│  - trace_id: Option<String>                                                │
│                                                                             │
│  Exactly-Once Semantics:                                                    │
│  - Use PENDING streams                                                     │
│  - Track offset for each AppendRows call                                   │
│  - Retry with same offset on failure                                       │
│  - FinalizeWriteStream then BatchCommitWriteStreams                        │
│                                                                             │
│  Tests:                                                                     │
│  - Stream creation for each type                                           │
│  - AppendRows with offset tracking                                         │
│  - Commit workflow for PENDING streams                                     │
│  - Buffered stream auto-commit                                             │
│  - Schema mismatch error handling                                          │
│  - Stream finalization                                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.9 Phase 9: Cost Service

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 9: COST SERVICE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  9.1   │ cost/types.rs          │ Phase 1             │ Cost types         │
│  9.2   │ cost/estimate.rs       │ 9.1, Phase 3        │ Cost estimation    │
│  9.3   │ cost/limits.rs         │ 9.1                 │ Limit enforcement  │
│  9.4   │ cost/service.rs        │ 9.2, 9.3            │ Service facade     │
│                                                                             │
│  Deliverables:                                                              │
│                                                                             │
│  CostService:                                                               │
│  - estimate_query_cost() - Dry-run and calculate cost                      │
│  - get_job_cost() - Calculate cost from completed job                      │
│  - set_cost_limit() - Configure maximumBytesBilled                         │
│  - get_pricing_info() - Get current pricing model                          │
│                                                                             │
│  CostEstimate:                                                              │
│  - bytes_processed: i64                                                    │
│  - bytes_billed: i64                                                       │
│  - estimated_cost_usd: f64                                                 │
│  - cache_hit: bool                                                         │
│  - pricing_tier: PricingTier (ON_DEMAND, FLAT_RATE, EDITIONS)              │
│                                                                             │
│  Cost Calculation Formula:                                                  │
│  - On-demand: $5.00 per TB (first 1TB free per month)                      │
│  - bytes_billed = round_up(bytes_processed, 10MB)                          │
│  - Minimum 10MB billed per query                                           │
│  - Cache hits: $0 (bytes_billed = 0)                                       │
│                                                                             │
│  maximumBytesBilled:                                                        │
│  - Set per-query byte limit                                                │
│  - Query fails if estimate exceeds limit                                   │
│  - Returns bytesBilledExceeded error                                       │
│                                                                             │
│  Tests:                                                                     │
│  - Cost calculation for various query sizes                                │
│  - 10MB minimum billing                                                    │
│  - Cache hit = $0                                                          │
│  - maximumBytesBilled enforcement                                          │
│  - Pricing tier detection                                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.10 Phase 10: Dataset & Table Services

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 10: DATASET & TABLE SERVICES                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  10.1  │ dataset/crud.rs        │ Phase 1, 2          │ Dataset CRUD       │
│  10.2  │ dataset/service.rs     │ 10.1                │ Service facade     │
│  10.3  │ table/crud.rs          │ Phase 1, 2          │ Table CRUD         │
│  10.4  │ table/schema.rs        │ Phase 1             │ Schema ops         │
│  10.5  │ table/service.rs       │ 10.3, 10.4          │ Service facade     │
│                                                                             │
│  Deliverables:                                                              │
│                                                                             │
│  DatasetService:                                                            │
│  - create() - datasets.insert                                              │
│  - get() - datasets.get                                                    │
│  - list() - datasets.list                                                  │
│  - delete() - datasets.delete                                              │
│  - update() - datasets.patch                                               │
│                                                                             │
│  TableService:                                                              │
│  - create() - tables.insert                                                │
│  - get() - tables.get                                                      │
│  - list() - tables.list                                                    │
│  - delete() - tables.delete                                                │
│  - update() - tables.patch                                                 │
│  - get_schema() - Get table schema                                         │
│  - update_schema() - Update schema (additive only)                         │
│                                                                             │
│  Note: These services exist for metadata operations.                        │
│  Actual table creation is typically done via:                               │
│  - Query: CREATE TABLE statements                                          │
│  - Load: Load job with create_disposition                                  │
│                                                                             │
│  Tests:                                                                     │
│  - Dataset create/get/list/delete                                          │
│  - Table create/get/list/delete                                            │
│  - Schema retrieval and update                                             │
│  - Access control handling                                                 │
│  - Location validation                                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.11 Phase 11: Simulation & Replay

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 11: SIMULATION & REPLAY                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  11.1  │ simulation/types.rs    │ Phase 1             │ Simulation types   │
│  11.2  │ simulation/generator.rs│ 11.1                │ Data generation    │
│  11.3  │ simulation/mock_client.rs│ All services      │ Mock client        │
│  11.4  │ simulation/replay.rs   │ 11.1, Phase 3       │ Query replay       │
│                                                                             │
│  Deliverables:                                                              │
│                                                                             │
│  MockBigQueryClient:                                                        │
│  - register_query_response() - Canned query results                        │
│  - register_error() - Simulate errors                                      │
│  - set_cost_estimate() - Mock dry-run results                              │
│  - get_executed_queries() - Inspect executed queries                       │
│                                                                             │
│  TestDataGenerator:                                                         │
│  - random_rows() - Generate random table rows                              │
│  - sample_schema() - Generate sample schema                                │
│  - large_dataset() - Generate large test datasets                          │
│                                                                             │
│  QueryReplay:                                                               │
│  - from_file() - Load recorded queries from file                           │
│  - record() - Record query execution for replay                            │
│  - replay() - Execute recorded queries                                     │
│  - compare_results() - Compare replay vs original results                  │
│                                                                             │
│  Tests:                                                                     │
│  - MockClient returns canned responses                                     │
│  - MockClient simulates errors                                             │
│  - Data generator produces valid rows                                      │
│  - Query replay executes same queries                                      │
│  - Result comparison detects differences                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.12 Phase 12: Resilience Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 12: RESILIENCE INTEGRATION                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  12.1  │ Retry integration      │ shared/resilience   │ Retry behavior     │
│  12.2  │ Circuit breaker        │ shared/resilience   │ State transitions  │
│  12.3  │ Rate limiting          │ shared/resilience   │ Throttling         │
│  12.4  │ Tracing integration    │ shared/observability│ Span creation      │
│  12.5  │ Logging integration    │ shared/observability│ Log output         │
│  12.6  │ Metrics integration    │ shared/observability│ Metrics recording  │
│                                                                             │
│  Deliverables:                                                              │
│  - Retry wrapper for transient errors                                      │
│  - Circuit breaker per project/location                                    │
│  - Rate limiter (concurrent queries)                                       │
│  - Distributed tracing spans for all operations                            │
│  - Structured logging with metadata                                        │
│  - Metrics (latency, bytes_billed, rows, errors)                           │
│                                                                             │
│  Retry Classification:                                                      │
│  - Retryable: rateLimitExceeded, backendError, internalError,              │
│               serviceUnavailable, quotaExceeded (some)                     │
│  - Not Retryable: invalidQuery, notFound, accessDenied,                    │
│               duplicate, bytesBilledExceeded, invalidSchema                │
│                                                                             │
│  Tests:                                                                     │
│  - Retry on rateLimitExceeded                                              │
│  - Retry on backendError                                                   │
│  - No retry on invalidQuery                                                │
│  - Circuit opens after threshold failures                                  │
│  - Rate limit respects concurrent query limits                             │
│  - Traces contain required attributes                                      │
│  - Metrics recorded for success and failure                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.13 Phase 13: Client Assembly

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 13: CLIENT ASSEMBLY                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  13.1  │ builders/client_builder│ All phases          │ Client config      │
│  13.2  │ client.rs              │ 13.1                │ Client facade      │
│  13.3  │ lib.rs                 │ 13.2                │ Public exports     │
│                                                                             │
│  Deliverables:                                                              │
│  - BigQueryClientBuilder with type-safe configuration                      │
│  - BigQueryClient with all service accessors                               │
│  - Lazy service initialization                                             │
│  - Public API exports                                                      │
│  - Re-exports of all public types                                          │
│                                                                             │
│  Tests:                                                                     │
│  - Client construction with various configs                                │
│  - Builder requires project_id before build                                │
│  - Service accessor lazy initialization                                    │
│  - All services accessible via client                                      │
│  - Dual transport (REST + gRPC) initialization                             │
│  - Graceful shutdown                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.14 Phase 14: Integration & E2E Testing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 14: INTEGRATION & E2E TESTING                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Order │ Component              │ Dependencies        │ Test Coverage      │
│  ──────┼────────────────────────┼─────────────────────┼────────────────────│
│  14.1  │ Mock server setup      │ wiremock/msw        │ Test environment   │
│  14.2  │ Query integration      │ 14.1                │ Query operations   │
│  14.3  │ Job integration        │ 14.1                │ Job operations     │
│  14.4  │ Streaming integration  │ 14.1                │ Streaming ops      │
│  14.5  │ Storage API integration│ 14.1                │ Storage ops        │
│  14.6  │ Cost integration       │ 14.1                │ Cost operations    │
│  14.7  │ E2E tests (optional)   │ Real BigQuery       │ Live validation    │
│                                                                             │
│  Deliverables:                                                              │
│  - wiremock/msw mock server configuration                                  │
│  - Recorded response fixtures                                              │
│  - Full integration test suite                                             │
│  - E2E test suite (gated by env var)                                       │
│  - CI/CD pipeline configuration                                            │
│                                                                             │
│  Tests:                                                                     │
│  - Full query execution flow with mock BigQuery                            │
│  - Job polling flow with status transitions                                │
│  - Streaming insert with partial failures                                  │
│  - Storage API read session flow                                           │
│  - Cost estimation accuracy                                                │
│  - E2E with real BigQuery (if credentials available)                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Cargo.toml / package.json

### 3.1 Rust Cargo.toml

```toml
[package]
name = "integrations-gcp-bigquery"
version = "0.1.0"
edition = "2021"
authors = ["LLM Dev Ops Team"]
description = "Google BigQuery integration for LLM Dev Ops"
license = "LLM-Dev-Ops-PSA-1.0"
repository = "https://github.com/org/integrations"

[lib]
name = "integrations_gcp_bigquery"
path = "src/lib.rs"

[dependencies]
# Shared primitives (workspace dependencies)
integrations-gcp-auth = { path = "../../gcp/auth" }
integrations-shared-resilience = { path = "../../shared/resilience" }
integrations-shared-observability = { path = "../../shared/observability" }
integrations-shared-errors = { path = "../../shared/errors" }
integrations-shared-config = { path = "../../shared/config" }
integrations-logging = { path = "../../logging" }
integrations-tracing = { path = "../../tracing" }

# Async runtime
tokio = { version = "1.35", features = ["full", "sync", "time"] }
futures = "0.3"
async-stream = "0.3"
tokio-stream = "0.1"

# HTTP client (REST API)
reqwest = { version = "0.11", features = ["rustls-tls", "json", "gzip", "stream"] }

# gRPC (Storage API)
tonic = { version = "0.10", features = ["tls", "transport", "gzip"] }
prost = "0.12"
prost-types = "0.12"

# Arrow (Storage Read API)
arrow = { version = "50", features = ["ipc"] }
arrow-array = "50"
arrow-schema = "50"
arrow-ipc = "50"

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Time handling
chrono = { version = "0.4", features = ["serde"] }

# Bytes handling
bytes = "1.5"

# Tracing
tracing = "0.1"

# Lazy initialization
once_cell = "1.19"

# Error handling
thiserror = "1.0"

# URL handling
url = "2.5"

# UUID for request IDs
uuid = { version = "1.6", features = ["v4"] }

# Base64 for protobuf encoding
base64 = "0.21"

[dev-dependencies]
# Testing
tokio-test = "0.4"
mockall = "0.12"
wiremock = "0.5"
tempfile = "3.9"
test-case = "3.3"

# Assertions
pretty_assertions = "1.4"

# Async trait
async-trait = "0.1"

# Mock gRPC
tonic-mock = "0.1"

[build-dependencies]
# Protobuf compilation for Storage API
tonic-build = "0.10"
prost-build = "0.12"

[features]
default = []
test-support = ["wiremock"]
e2e = []
simulation = []
storage-api = []  # Enable gRPC Storage API (adds ~5MB to binary)

[[test]]
name = "unit"
path = "tests/unit/mod.rs"

[[test]]
name = "integration"
path = "tests/integration/mod.rs"
required-features = ["test-support"]

[[test]]
name = "e2e"
path = "tests/e2e/mod.rs"
required-features = ["test-support", "e2e"]
```

### 3.2 TypeScript package.json

```json
{
  "name": "@integrations/gcp-bigquery",
  "version": "0.1.0",
  "description": "Google BigQuery integration for LLM Dev Ops",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "build:proto": "grpc_tools_node_protoc --plugin=protoc-gen-ts=./node_modules/.bin/protoc-gen-ts --ts_out=./src/proto --grpc_out=./src/proto -I ./proto ./proto/*.proto",
    "test": "jest",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration",
    "test:e2e": "jest --testPathPattern=e2e",
    "test:coverage": "jest --coverage",
    "lint": "eslint src tests",
    "format": "prettier --write src tests"
  },
  "dependencies": {
    "@integrations/gcp-auth": "workspace:*",
    "@integrations/shared-resilience": "workspace:*",
    "@integrations/shared-observability": "workspace:*",
    "@integrations/shared-errors": "workspace:*",
    "@integrations/shared-config": "workspace:*",
    "@integrations/logging": "workspace:*",
    "@integrations/tracing": "workspace:*",
    "@grpc/grpc-js": "^1.9.13",
    "@grpc/proto-loader": "^0.7.10",
    "apache-arrow": "^15.0.0",
    "google-protobuf": "^3.21.2"
  },
  "devDependencies": {
    "@types/google-protobuf": "^3.15.12",
    "@types/jest": "^29.5.11",
    "@types/node": "^20.10.6",
    "grpc-tools": "^1.12.4",
    "grpc_tools_node_protoc_ts": "^5.3.3",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1",
    "typescript": "^5.3.3",
    "eslint": "^8.56.0",
    "prettier": "^3.1.1",
    "msw": "^2.0.11"
  },
  "peerDependencies": {
    "undici": "^6.2.1"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "license": "LLM-Dev-Ops-PSA-1.0"
}
```

---

## 4. Public API Summary

### 4.1 Rust Public API

```rust
// lib.rs - Public exports

// Client
pub use client::BigQueryClient;
pub use builders::BigQueryClientBuilder;

// Configuration
pub use config::{BigQueryConfig, BigQueryConfigBuilder};

// Query Types
pub use types::query::{
    QueryRequest,
    QueryResponse,
    QueryJob,
    QueryParameter,
    ParameterMode,
    QueryPriority,
};

// Job Types
pub use types::job::{
    Job,
    JobReference,
    JobStatus,
    JobState,
    JobConfiguration,
    JobStatistics,
    ErrorProto,
};

// Table Types
pub use types::table::{
    Table,
    TableReference,
    TableSchema,
    TableFieldSchema,
    TableFieldMode,
    TableFieldType,
};

// Dataset Types
pub use types::dataset::{
    Dataset,
    DatasetReference,
    DatasetAccess,
};

// Row Types
pub use types::row::{
    TableRow,
    TableCell,
    InsertAllRequest,
    InsertAllResponse,
    InsertError,
};

// Cost Types
pub use types::cost::{
    CostEstimate,
    PricingTier,
    BytesBilled,
};

// Service Traits
pub use services::{
    QueryService,
    JobService,
    StreamingService,
    LoadService,
    ExportService,
    StorageReadService,
    StorageWriteService,
    CostService,
    DatasetService,
    TableService,
};

// Streaming Buffer
pub use services::streaming::{
    BufferedInserter,
    BufferedInserterConfig,
};

// Storage API Types
#[cfg(feature = "storage-api")]
pub use services::storage_read::{
    ReadSession,
    ReadStream,
    CreateReadSessionRequest,
};

#[cfg(feature = "storage-api")]
pub use services::storage_write::{
    WriteStream,
    WriteStreamType,
    AppendRowsRequest,
    AppendRowsResponse,
};

// Simulation (feature-gated)
#[cfg(feature = "simulation")]
pub use simulation::{
    MockBigQueryClient,
    TestDataGenerator,
    QueryReplay,
};

// Builders
pub use builders::{
    QueryBuilder,
    LoadBuilder,
    ExportBuilder,
};

// Errors
pub use error::{BigQueryError, BigQueryErrorKind};
```

### 4.2 BigQueryClient Method Summary

```rust
impl BigQueryClient {
    // Construction
    pub fn builder() -> BigQueryClientBuilder;
    pub async fn new(config: BigQueryConfig) -> Result<Self, BigQueryError>;
    pub async fn from_env() -> Result<Self, BigQueryError>;

    // Service Accessors (lazy initialization)
    pub fn query(&self) -> &dyn QueryService;
    pub fn jobs(&self) -> &dyn JobService;
    pub fn streaming(&self) -> &dyn StreamingService;
    pub fn load(&self) -> &dyn LoadService;
    pub fn export(&self) -> &dyn ExportService;
    pub fn storage_read(&self) -> &dyn StorageReadService;  // requires storage-api feature
    pub fn storage_write(&self) -> &dyn StorageWriteService; // requires storage-api feature
    pub fn cost(&self) -> &dyn CostService;
    pub fn datasets(&self) -> &dyn DatasetService;
    pub fn tables(&self) -> &dyn TableService;

    // --- Query Convenience Methods ---
    pub async fn execute_query(
        &self,
        sql: &str,
    ) -> Result<QueryResponse, BigQueryError>;

    pub async fn execute_query_with_params(
        &self,
        sql: &str,
        params: Vec<QueryParameter>,
    ) -> Result<QueryResponse, BigQueryError>;

    pub async fn dry_run(
        &self,
        sql: &str,
    ) -> Result<CostEstimate, BigQueryError>;

    pub async fn query_to_stream(
        &self,
        sql: &str,
    ) -> Result<impl Stream<Item = Result<TableRow, BigQueryError>>, BigQueryError>;

    // --- Job Convenience Methods ---
    pub async fn get_job(
        &self,
        job_id: &str,
    ) -> Result<Job, BigQueryError>;

    pub async fn wait_for_job(
        &self,
        job_id: &str,
    ) -> Result<Job, BigQueryError>;

    pub async fn cancel_job(
        &self,
        job_id: &str,
    ) -> Result<(), BigQueryError>;

    // --- Streaming Convenience Methods ---
    pub async fn insert_rows(
        &self,
        table: &TableReference,
        rows: Vec<TableRow>,
    ) -> Result<InsertAllResponse, BigQueryError>;

    pub fn buffered_inserter(
        &self,
        table: TableReference,
        config: BufferedInserterConfig,
    ) -> BufferedInserter;

    // --- Load Convenience Methods ---
    pub async fn load_from_gcs(
        &self,
        table: &TableReference,
        source_uris: &[&str],
        config: LoadJobConfig,
    ) -> Result<Job, BigQueryError>;

    // --- Export Convenience Methods ---
    pub async fn export_to_gcs(
        &self,
        table: &TableReference,
        destination_uri: &str,
        config: ExportJobConfig,
    ) -> Result<Job, BigQueryError>;

    // --- Cost Convenience Methods ---
    pub async fn estimate_cost(
        &self,
        sql: &str,
    ) -> Result<CostEstimate, BigQueryError>;

    pub fn set_max_bytes_billed(
        &mut self,
        max_bytes: i64,
    );

    // --- Dataset Convenience Methods ---
    pub async fn create_dataset(
        &self,
        dataset_id: &str,
    ) -> Result<Dataset, BigQueryError>;

    pub async fn get_dataset(
        &self,
        dataset_id: &str,
    ) -> Result<Dataset, BigQueryError>;

    pub async fn list_datasets(
        &self,
    ) -> Result<Vec<Dataset>, BigQueryError>;

    pub async fn delete_dataset(
        &self,
        dataset_id: &str,
        delete_contents: bool,
    ) -> Result<(), BigQueryError>;

    // --- Table Convenience Methods ---
    pub async fn get_table(
        &self,
        dataset_id: &str,
        table_id: &str,
    ) -> Result<Table, BigQueryError>;

    pub async fn list_tables(
        &self,
        dataset_id: &str,
    ) -> Result<Vec<Table>, BigQueryError>;

    pub async fn get_table_schema(
        &self,
        dataset_id: &str,
        table_id: &str,
    ) -> Result<TableSchema, BigQueryError>;

    // --- Fluent Builder APIs ---
    pub fn query_builder(&self) -> QueryBuilder;
    pub fn load_builder(&self) -> LoadBuilder;
    pub fn export_builder(&self) -> ExportBuilder;

    // --- Health & Utilities ---
    pub async fn health_check(&self) -> HealthStatus;
    pub async fn shutdown(&self) -> Result<(), BigQueryError>;
}
```

### 4.3 Fluent Builder APIs

```rust
// QueryBuilder - Fluent query construction
impl QueryBuilder {
    pub fn new(client: &BigQueryClient) -> Self;

    // Query (required)
    pub fn sql(self, sql: &str) -> Self;

    // Default dataset (optional)
    pub fn default_dataset(self, dataset: &str) -> Self;
    pub fn default_dataset_ref(self, dataset: DatasetReference) -> Self;

    // Parameters
    pub fn param(self, name: &str, value: impl Into<QueryParameterValue>) -> Self;
    pub fn positional_param(self, value: impl Into<QueryParameterValue>) -> Self;
    pub fn params(self, params: Vec<QueryParameter>) -> Self;

    // Options
    pub fn max_bytes_billed(self, max_bytes: i64) -> Self;
    pub fn timeout(self, duration: Duration) -> Self;
    pub fn use_cache(self, use_cache: bool) -> Self;
    pub fn priority(self, priority: QueryPriority) -> Self;
    pub fn label(self, key: &str, value: &str) -> Self;

    // Execution modes
    pub async fn execute(self) -> Result<QueryResponse, BigQueryError>;
    pub async fn execute_async(self) -> Result<Job, BigQueryError>;
    pub async fn dry_run(self) -> Result<CostEstimate, BigQueryError>;
    pub async fn execute_stream(self) -> Result<impl Stream<Item = Result<TableRow, BigQueryError>>, BigQueryError>;
}

// Usage example:
let results = client.query_builder()
    .sql("SELECT * FROM `project.dataset.table` WHERE date = @date AND status = @status")
    .param("date", "2024-01-15")
    .param("status", "active")
    .max_bytes_billed(10_000_000_000) // 10GB limit
    .priority(QueryPriority::Batch)
    .execute()
    .await?;

for row in results.rows() {
    println!("{:?}", row);
}
```

```rust
// LoadBuilder - Fluent load job construction
impl LoadBuilder {
    pub fn new(client: &BigQueryClient) -> Self;

    // Destination (required)
    pub fn destination(self, table: TableReference) -> Self;

    // Source (one required)
    pub fn source_uri(self, uri: &str) -> Self;
    pub fn source_uris(self, uris: &[&str]) -> Self;

    // Format (required)
    pub fn format(self, format: SourceFormat) -> Self;
    pub fn csv(self) -> Self;
    pub fn json(self) -> Self;
    pub fn parquet(self) -> Self;
    pub fn avro(self) -> Self;

    // Schema
    pub fn schema(self, schema: TableSchema) -> Self;
    pub fn autodetect_schema(self) -> Self;

    // Options
    pub fn write_disposition(self, disposition: WriteDisposition) -> Self;
    pub fn create_disposition(self, disposition: CreateDisposition) -> Self;
    pub fn max_bad_records(self, max: i32) -> Self;
    pub fn null_marker(self, marker: &str) -> Self;
    pub fn skip_leading_rows(self, rows: i32) -> Self;  // CSV only

    // Execution
    pub async fn execute(self) -> Result<Job, BigQueryError>;
    pub async fn execute_and_wait(self) -> Result<Job, BigQueryError>;
}

// Usage example:
let job = client.load_builder()
    .destination(table_ref)
    .source_uris(&["gs://bucket/data/*.parquet"])
    .parquet()
    .write_disposition(WriteDisposition::WriteTruncate)
    .autodetect_schema()
    .execute_and_wait()
    .await?;
```

```rust
// ExportBuilder - Fluent export job construction
impl ExportBuilder {
    pub fn new(client: &BigQueryClient) -> Self;

    // Source table (required)
    pub fn source(self, table: TableReference) -> Self;

    // Destination (required)
    pub fn destination_uri(self, uri: &str) -> Self;
    pub fn destination_uris(self, uris: &[&str]) -> Self;

    // Format
    pub fn format(self, format: DestinationFormat) -> Self;
    pub fn csv(self) -> Self;
    pub fn json(self) -> Self;
    pub fn parquet(self) -> Self;
    pub fn avro(self) -> Self;

    // Options
    pub fn compression(self, compression: Compression) -> Self;
    pub fn print_header(self, print: bool) -> Self;  // CSV only
    pub fn field_delimiter(self, delimiter: &str) -> Self;  // CSV only

    // Execution
    pub async fn execute(self) -> Result<Job, BigQueryError>;
    pub async fn execute_and_wait(self) -> Result<Job, BigQueryError>;
}

// Usage example:
let job = client.export_builder()
    .source(table_ref)
    .destination_uri("gs://bucket/export/data-*.parquet")
    .parquet()
    .compression(Compression::Snappy)
    .execute_and_wait()
    .await?;
```

---

## 5. Test Vectors

### 5.1 Request/Response Test Fixtures

```json
// Query Request (jobs.query)
{
  "kind": "bigquery#queryRequest",
  "query": "SELECT name, age FROM `project.dataset.users` WHERE status = @status",
  "useLegacySql": false,
  "parameterMode": "NAMED",
  "queryParameters": [
    {
      "name": "status",
      "parameterType": { "type": "STRING" },
      "parameterValue": { "value": "active" }
    }
  ],
  "maximumBytesBilled": "10000000000",
  "useQueryCache": true,
  "defaultDataset": {
    "projectId": "my-project",
    "datasetId": "my_dataset"
  },
  "timeoutMs": 30000
}

// Query Response (success)
{
  "kind": "bigquery#queryResponse",
  "schema": {
    "fields": [
      { "name": "name", "type": "STRING", "mode": "NULLABLE" },
      { "name": "age", "type": "INTEGER", "mode": "NULLABLE" }
    ]
  },
  "jobReference": {
    "projectId": "my-project",
    "jobId": "job_abc123",
    "location": "US"
  },
  "totalRows": "100",
  "rows": [
    { "f": [{ "v": "Alice" }, { "v": "30" }] },
    { "f": [{ "v": "Bob" }, { "v": "25" }] }
  ],
  "totalBytesProcessed": "1048576",
  "cacheHit": false,
  "jobComplete": true
}

// Dry Run Response
{
  "kind": "bigquery#queryResponse",
  "schema": {
    "fields": [
      { "name": "name", "type": "STRING" },
      { "name": "age", "type": "INTEGER" }
    ]
  },
  "jobReference": {
    "projectId": "my-project",
    "jobId": "job_dry_run_456"
  },
  "totalBytesProcessed": "52428800000",
  "jobComplete": true,
  "cacheHit": false
}

// Async Query Job (jobs.insert request)
{
  "configuration": {
    "query": {
      "query": "SELECT * FROM `project.dataset.large_table`",
      "useLegacySql": false,
      "priority": "BATCH",
      "writeDisposition": "WRITE_TRUNCATE",
      "destinationTable": {
        "projectId": "my-project",
        "datasetId": "my_dataset",
        "tableId": "results_table"
      }
    }
  },
  "jobReference": {
    "projectId": "my-project",
    "jobId": "my-custom-job-id"
  }
}

// Job Status (jobs.get response - running)
{
  "kind": "bigquery#job",
  "id": "my-project:US.job_abc123",
  "jobReference": {
    "projectId": "my-project",
    "jobId": "job_abc123",
    "location": "US"
  },
  "status": {
    "state": "RUNNING"
  },
  "statistics": {
    "creationTime": "1705312800000",
    "startTime": "1705312801000"
  }
}

// Job Status (jobs.get response - done)
{
  "kind": "bigquery#job",
  "id": "my-project:US.job_abc123",
  "jobReference": {
    "projectId": "my-project",
    "jobId": "job_abc123",
    "location": "US"
  },
  "status": {
    "state": "DONE"
  },
  "statistics": {
    "creationTime": "1705312800000",
    "startTime": "1705312801000",
    "endTime": "1705312850000",
    "query": {
      "totalBytesProcessed": "1073741824",
      "totalBytesBilled": "1073741824",
      "cacheHit": false,
      "billingTier": 1
    }
  }
}

// InsertAll Request
{
  "kind": "bigquery#tableDataInsertAllRequest",
  "skipInvalidRows": false,
  "ignoreUnknownValues": false,
  "rows": [
    {
      "insertId": "row1",
      "json": {
        "name": "Alice",
        "age": 30,
        "created_at": "2024-01-15T10:30:00Z"
      }
    },
    {
      "insertId": "row2",
      "json": {
        "name": "Bob",
        "age": 25,
        "created_at": "2024-01-15T10:31:00Z"
      }
    }
  ]
}

// InsertAll Response (success)
{
  "kind": "bigquery#tableDataInsertAllResponse"
}

// InsertAll Response (partial failure)
{
  "kind": "bigquery#tableDataInsertAllResponse",
  "insertErrors": [
    {
      "index": 1,
      "errors": [
        {
          "reason": "invalid",
          "location": "age",
          "message": "Could not convert value to integer"
        }
      ]
    }
  ]
}
```

### 5.2 Error Response Fixtures

```json
// Invalid Query
{
  "error": {
    "code": 400,
    "message": "Syntax error: Unexpected identifier \"SELEC\" at [1:1]",
    "errors": [
      {
        "message": "Syntax error: Unexpected identifier \"SELEC\" at [1:1]",
        "domain": "global",
        "reason": "invalidQuery"
      }
    ],
    "status": "INVALID_ARGUMENT"
  }
}

// Table Not Found
{
  "error": {
    "code": 404,
    "message": "Not found: Table my-project:my_dataset.nonexistent_table",
    "errors": [
      {
        "message": "Not found: Table my-project:my_dataset.nonexistent_table",
        "domain": "global",
        "reason": "notFound"
      }
    ],
    "status": "NOT_FOUND"
  }
}

// Quota Exceeded
{
  "error": {
    "code": 403,
    "message": "Exceeded rate limits: Your project exceeded quota for concurrent queries.",
    "errors": [
      {
        "message": "Exceeded rate limits: Your project exceeded quota for concurrent queries.",
        "domain": "global",
        "reason": "rateLimitExceeded"
      }
    ],
    "status": "RESOURCE_EXHAUSTED"
  }
}

// Bytes Billed Exceeded
{
  "error": {
    "code": 400,
    "message": "Query exceeded limit for bytes billed: 10000000000. 52428800000 bytes processed.",
    "errors": [
      {
        "message": "Query exceeded limit for bytes billed: 10000000000. 52428800000 bytes processed.",
        "domain": "global",
        "reason": "bytesBilledExceeded"
      }
    ],
    "status": "INVALID_ARGUMENT"
  }
}

// Access Denied
{
  "error": {
    "code": 403,
    "message": "Access Denied: Table my-project:my_dataset.private_table: User does not have permission to query table my-project:my_dataset.private_table",
    "errors": [
      {
        "message": "Access Denied: Table my-project:my_dataset.private_table",
        "domain": "global",
        "reason": "accessDenied"
      }
    ],
    "status": "PERMISSION_DENIED"
  }
}

// Backend Error (retryable)
{
  "error": {
    "code": 503,
    "message": "Backend Error",
    "errors": [
      {
        "message": "Backend Error",
        "domain": "global",
        "reason": "backendError"
      }
    ],
    "status": "UNAVAILABLE"
  }
}

// Job Failed
{
  "kind": "bigquery#job",
  "status": {
    "state": "DONE",
    "errorResult": {
      "reason": "invalidQuery",
      "message": "Syntax error: Unexpected end of script at [1:20]"
    },
    "errors": [
      {
        "reason": "invalidQuery",
        "message": "Syntax error: Unexpected end of script at [1:20]"
      }
    ]
  }
}
```

### 5.3 Cost Estimation Fixtures

```json
// Small query (10MB)
{
  "bytes_processed": 10485760,
  "bytes_billed": 10485760,
  "estimated_cost_usd": 0.00005,
  "cache_hit": false,
  "pricing_tier": "ON_DEMAND",
  "note": "Minimum 10MB billing applies"
}

// Medium query (1GB)
{
  "bytes_processed": 1073741824,
  "bytes_billed": 1073741824,
  "estimated_cost_usd": 0.005,
  "cache_hit": false,
  "pricing_tier": "ON_DEMAND"
}

// Large query (1TB)
{
  "bytes_processed": 1099511627776,
  "bytes_billed": 1099511627776,
  "estimated_cost_usd": 5.0,
  "cache_hit": false,
  "pricing_tier": "ON_DEMAND"
}

// Cache hit
{
  "bytes_processed": 1073741824,
  "bytes_billed": 0,
  "estimated_cost_usd": 0.0,
  "cache_hit": true,
  "pricing_tier": "ON_DEMAND"
}
```

---

## 6. CI/CD Configuration

### 6.1 GitHub Actions Workflow

```yaml
# .github/workflows/gcp-bigquery-integration.yml
name: GCP BigQuery Integration

on:
  push:
    paths:
      - 'integrations/gcp/bigquery/**'
  pull_request:
    paths:
      - 'integrations/gcp/bigquery/**'

env:
  CARGO_TERM_COLOR: always
  RUST_BACKTRACE: 1

jobs:
  test-rust:
    name: Rust Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt

      - name: Install Protoc
        uses: arduino/setup-protoc@v2
        with:
          version: '24.x'

      - name: Cache cargo
        uses: actions/cache@v3
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            target
          key: ${{ runner.os }}-cargo-bigquery-${{ hashFiles('**/Cargo.lock') }}

      - name: Check formatting
        run: cargo fmt --check
        working-directory: integrations/gcp/bigquery/rust

      - name: Clippy
        run: cargo clippy --all-features -- -D warnings
        working-directory: integrations/gcp/bigquery/rust

      - name: Unit tests
        run: cargo test --test unit
        working-directory: integrations/gcp/bigquery/rust

      - name: Unit tests (with storage-api)
        run: cargo test --test unit --features storage-api
        working-directory: integrations/gcp/bigquery/rust

      - name: Doc tests
        run: cargo test --doc
        working-directory: integrations/gcp/bigquery/rust

  test-typescript:
    name: TypeScript Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci
        working-directory: integrations/gcp/bigquery/typescript

      - name: Build proto files
        run: npm run build:proto
        working-directory: integrations/gcp/bigquery/typescript

      - name: Lint
        run: npm run lint
        working-directory: integrations/gcp/bigquery/typescript

      - name: Type check
        run: npm run build
        working-directory: integrations/gcp/bigquery/typescript

      - name: Unit tests
        run: npm run test:unit
        working-directory: integrations/gcp/bigquery/typescript

  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: [test-rust, test-typescript]
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install Protoc
        uses: arduino/setup-protoc@v2

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run Rust integration tests
        run: cargo test --test integration --features test-support,storage-api
        working-directory: integrations/gcp/bigquery/rust

      - name: Run TypeScript integration tests
        run: npm run test:integration
        working-directory: integrations/gcp/bigquery/typescript

  e2e-tests:
    name: E2E Tests (Manual)
    runs-on: ubuntu-latest
    if: github.event_name == 'workflow_dispatch'
    needs: [integration-tests]
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install Protoc
        uses: arduino/setup-protoc@v2

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_CREDENTIALS }}

      - name: Run E2E tests
        run: cargo test --test e2e --features test-support,e2e,storage-api
        working-directory: integrations/gcp/bigquery/rust
        env:
          BIGQUERY_E2E_TESTS: true
          GOOGLE_CLOUD_PROJECT: ${{ secrets.GCP_PROJECT_ID }}

  coverage:
    name: Code Coverage
    runs-on: ubuntu-latest
    needs: [test-rust, test-typescript]
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: llvm-tools-preview

      - name: Install Protoc
        uses: arduino/setup-protoc@v2

      - name: Install cargo-llvm-cov
        uses: taiki-e/install-action@cargo-llvm-cov

      - name: Generate Rust coverage
        run: cargo llvm-cov --all-features --lcov --output-path lcov.info
        working-directory: integrations/gcp/bigquery/rust

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install npm dependencies
        run: npm ci
        working-directory: integrations/gcp/bigquery/typescript

      - name: Generate TypeScript coverage
        run: npm run test:coverage
        working-directory: integrations/gcp/bigquery/typescript

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: integrations/gcp/bigquery/rust/lcov.info,integrations/gcp/bigquery/typescript/coverage/lcov.info
          flags: gcp-bigquery
```

---

## 7. Documentation Deliverables

### 7.1 README.md Structure

```markdown
# Google BigQuery Integration

A thin adapter layer for Google BigQuery integration in the LLM Dev Ops platform,
enabling enterprise-scale analytical queries, data ingestion, and cost-aware operations.

## Features

- **Query Execution**: Sync, async, and streaming query execution
- **Parameterized Queries**: Named and positional query parameters
- **Cost Awareness**: Dry-run queries, byte limits, cost estimation
- **Streaming Insert**: Real-time data ingestion via insertAll API
- **Batch Load/Export**: Load from and export to Cloud Storage
- **Storage API**: High-throughput reads (Arrow) and writes (gRPC)
- **Simulation & Replay**: Mock client and query replay for testing
- **Resilience**: Automatic retry, circuit breaker, rate limiting

## Quick Start

### Rust

```rust
use integrations_gcp_bigquery::{BigQueryClient, QueryBuilder, QueryPriority};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = BigQueryClient::from_env().await?;

    // Execute parameterized query
    let results = client.query_builder()
        .sql("SELECT * FROM `project.dataset.table` WHERE date = @date")
        .param("date", "2024-01-15")
        .max_bytes_billed(10_000_000_000)
        .execute()
        .await?;

    for row in results.rows() {
        println!("{:?}", row);
    }

    // Estimate query cost before execution
    let estimate = client.dry_run(
        "SELECT * FROM `project.dataset.large_table`"
    ).await?;

    println!("Query would process {} bytes, cost ${:.4}",
        estimate.bytes_processed,
        estimate.estimated_cost_usd);

    Ok(())
}
```

### TypeScript

```typescript
import { BigQueryClient, QueryPriority } from '@integrations/gcp-bigquery';

const client = await BigQueryClient.fromEnv();

// Execute parameterized query
const results = await client.queryBuilder()
  .sql('SELECT * FROM `project.dataset.table` WHERE date = @date')
  .param('date', '2024-01-15')
  .maxBytesBilled(10_000_000_000n)
  .execute();

for (const row of results.rows) {
  console.log(row);
}

// Estimate query cost
const estimate = await client.dryRun(
  'SELECT * FROM `project.dataset.large_table`'
);
console.log(`Would process ${estimate.bytesProcessed} bytes`);
```

## API Coverage

| Operation | Service | Status |
|-----------|---------|--------|
| jobs.query | QueryService | ✅ |
| jobs.insert (query) | QueryService | ✅ |
| jobs.get | JobService | ✅ |
| jobs.cancel | JobService | ✅ |
| jobs.list | JobService | ✅ |
| tabledata.insertAll | StreamingService | ✅ |
| jobs.insert (load) | LoadService | ✅ |
| jobs.insert (extract) | ExportService | ✅ |
| CreateReadSession | StorageReadService | ✅ |
| ReadRows | StorageReadService | ✅ |
| CreateWriteStream | StorageWriteService | ✅ |
| AppendRows | StorageWriteService | ✅ |
| datasets.insert/get/list/delete | DatasetService | ✅ |
| tables.insert/get/list/delete | TableService | ✅ |

## Cost Awareness

```rust
// Set default byte limit for all queries
let mut client = BigQueryClient::from_env().await?;
client.set_max_bytes_billed(100_000_000_000); // 100GB limit

// Or per-query limit
let results = client.query_builder()
    .sql("SELECT * FROM `huge_table`")
    .max_bytes_billed(10_000_000_000) // 10GB limit
    .execute()
    .await?;
```

## Configuration

See [Configuration Guide](./docs/configuration.md) for all configuration options.

## License

LLM-Dev-Ops-PSA-1.0
```

### 7.2 API Documentation Sections

1. **Getting Started** - Installation, configuration, authentication
2. **Query Execution** - Sync, async, streaming queries
3. **Parameterized Queries** - Named and positional parameters, type safety
4. **Cost Management** - Dry-run, maximumBytesBilled, cost estimation
5. **Streaming Insert** - insertAll API, BufferedInserter, deduplication
6. **Batch Load** - Load from GCS, formats, schema auto-detection
7. **Batch Export** - Export to GCS, formats, compression
8. **Storage Read API** - High-throughput reads, Arrow format, parallel streams
9. **Storage Write API** - Exactly-once writes, stream types, commit flow
10. **Resource Management** - Datasets, tables, schemas
11. **Simulation & Testing** - MockBigQueryClient, QueryReplay, test fixtures
12. **Error Handling** - Error types, retry strategies, cost exceeded errors

---

## 8. Compliance Matrix

### 8.1 BigQuery API Coverage

| API Operation | Endpoint | Service | Implemented | Tested |
|--------------|----------|---------|-------------|--------|
| jobs.query | POST /query | QueryService | ✅ | ✅ |
| jobs.insert | POST /jobs | QueryService/LoadService/ExportService | ✅ | ✅ |
| jobs.get | GET /jobs/{jobId} | JobService | ✅ | ✅ |
| jobs.cancel | POST /jobs/{jobId}/cancel | JobService | ✅ | ✅ |
| jobs.list | GET /jobs | JobService | ✅ | ✅ |
| jobs.getQueryResults | GET /queries/{jobId} | QueryService | ✅ | ✅ |
| tabledata.insertAll | POST /insertAll | StreamingService | ✅ | ✅ |
| tabledata.list | GET /data | TableService | ✅ | ✅ |
| datasets.insert | POST /datasets | DatasetService | ✅ | ✅ |
| datasets.get | GET /datasets/{datasetId} | DatasetService | ✅ | ✅ |
| datasets.list | GET /datasets | DatasetService | ✅ | ✅ |
| datasets.delete | DELETE /datasets/{datasetId} | DatasetService | ✅ | ✅ |
| datasets.patch | PATCH /datasets/{datasetId} | DatasetService | ✅ | ✅ |
| tables.insert | POST /tables | TableService | ✅ | ✅ |
| tables.get | GET /tables/{tableId} | TableService | ✅ | ✅ |
| tables.list | GET /tables | TableService | ✅ | ✅ |
| tables.delete | DELETE /tables/{tableId} | TableService | ✅ | ✅ |
| tables.patch | PATCH /tables/{tableId} | TableService | ✅ | ✅ |
| CreateReadSession | gRPC | StorageReadService | ✅ | ✅ |
| ReadRows | gRPC | StorageReadService | ✅ | ✅ |
| CreateWriteStream | gRPC | StorageWriteService | ✅ | ✅ |
| AppendRows | gRPC | StorageWriteService | ✅ | ✅ |
| FinalizeWriteStream | gRPC | StorageWriteService | ✅ | ✅ |
| BatchCommitWriteStreams | gRPC | StorageWriteService | ✅ | ✅ |

### 8.2 Integration Repo Primitives Usage

| Primitive | Usage |
|-----------|-------|
| gcp/auth | OAuth2 credential chain for GCP authentication |
| shared/resilience | Retry, circuit breaker, rate limiting |
| shared/observability | Tracing, metrics, logging |
| shared/errors | BigQueryError derives from IntegrationError |
| shared/config | Config validation framework |
| integrations-logging | Shared logging abstractions |
| integrations-tracing | Shared tracing abstractions |

### 8.3 Testing Requirements

| Test Category | Coverage Target | Status |
|--------------|-----------------|--------|
| Unit Tests | >90% | ✅ |
| Integration Tests | All operations | ✅ |
| Mock Coverage | All external calls | ✅ |
| Error Scenarios | All error types | ✅ |
| Edge Cases | As per refinement doc | ✅ |
| E2E Tests | Gated by env var | ✅ |
| Storage API Tests | Feature-gated | ✅ |

### 8.4 Thin Adapter Compliance

| Requirement | Implementation |
|-------------|----------------|
| No data storage | ✅ Delegates to BigQuery |
| No infra provisioning | ✅ Uses existing datasets/tables |
| Uses shared credentials | ✅ gcp/auth |
| Uses shared resilience | ✅ shared/resilience |
| Uses shared observability | ✅ shared/observability |
| BigQuery-specific logic only | ✅ All operations specific to BigQuery |
| Dual transport support | ✅ REST for Jobs API, gRPC for Storage API |

---

## 9. Summary

This completion document provides a comprehensive implementation roadmap for the Google BigQuery integration module, including:

1. **File Structure** - Complete directory layout for Rust and TypeScript implementations with dual transport (REST + gRPC)
2. **Implementation Order** - 14 phases from core infrastructure to E2E testing
3. **Dependencies** - Cargo.toml and package.json with Arrow, tonic, and gRPC dependencies
4. **Public API** - Complete API surface with client methods and fluent builders
5. **Test Vectors** - Request/response fixtures, error responses, cost estimation fixtures
6. **CI/CD** - GitHub Actions workflow with protobuf compilation
7. **Documentation** - README structure and API documentation outline
8. **Compliance** - Full BigQuery API coverage matrix

The implementation follows:
- **Thin Adapter Pattern** - BigQuery-specific logic only, delegate to shared modules
- **Dual Transport** - REST API for Jobs/Tables, gRPC for Storage API
- **Cost Awareness** - Dry-run queries, maximumBytesBilled, cost estimation
- **London-School TDD** - Interface-first design with comprehensive mocking
- **Service Isolation** - Separate services for query, job, streaming, load, export, storage
- **Shared Primitives** - Full integration with gcp/auth, shared/resilience, shared/observability, integrations-logging, integrations-tracing

---

## SPARC Phases Complete

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-bigquery.md | ✅ |
| 2. Pseudocode | pseudocode-bigquery.md | ✅ |
| 3. Architecture | architecture-bigquery.md | ✅ |
| 4. Refinement | refinement-bigquery.md | ✅ |
| 5. Completion | completion-bigquery.md | ✅ |

---

*Phase 5: Completion - Complete*

*Google BigQuery Integration SPARC Documentation Complete*
