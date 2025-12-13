# Specification: Snowflake Integration Module

## SPARC Phase 1: Specification

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/snowflake`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Goals and Non-Goals](#2-goals-and-non-goals)
3. [Snowflake Platform Overview](#3-snowflake-platform-overview)
4. [Functional Requirements](#4-functional-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [Data Models](#6-data-models)
7. [Integration Points](#7-integration-points)
8. [Security Considerations](#8-security-considerations)
9. [Constraints](#9-constraints)

---

## 1. Overview

### 1.1 Purpose

This module provides a thin adapter layer connecting the LLM DevOps platform to Snowflake for cloud data warehouse operations, enabling analytical queries, batch data ingestion, feature extraction, and reporting workflows without duplicating account provisioning, warehouse management, or core orchestration logic.

### 1.2 Scope

```
┌─────────────────────────────────────────────────────────────────┐
│                   SNOWFLAKE INTEGRATION SCOPE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  IN SCOPE:                                                       │
│  ├── Connection Management (session pooling, multi-account)     │
│  ├── Query Execution (sync, async, streaming)                   │
│  ├── Batch Data Ingestion (COPY INTO, staged uploads)           │
│  ├── Result Set Handling (pagination, streaming, export)        │
│  ├── Warehouse Awareness (sizing hints, auto-suspend)           │
│  ├── Cost Monitoring (query cost estimation, credits)           │
│  ├── Secure Data Sharing (reader accounts, shares)              │
│  ├── Query Optimization (clustering hints, caching)             │
│  ├── Metadata Operations (schema discovery, statistics)         │
│  └── Simulation Layer (query record/replay)                     │
│                                                                  │
│  OUT OF SCOPE:                                                   │
│  ├── Account provisioning and management                        │
│  ├── Warehouse creation/configuration                           │
│  ├── User/role administration                                   │
│  ├── Data governance policies                                   │
│  ├── Snowpipe setup and management                              │
│  ├── Time travel configuration                                  │
│  └── Replication setup                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Goals and Non-Goals

### 2.1 Goals

| ID | Goal |
|----|------|
| G1 | Execute analytical queries with result streaming |
| G2 | Ingest batch data via staging and COPY INTO |
| G3 | Support warehouse size awareness for workload routing |
| G4 | Provide query cost estimation and monitoring |
| G5 | Enable secure data sharing access |
| G6 | Support async query execution with polling |
| G7 | Expose metadata for schema discovery |
| G8 | Enable simulation/replay for CI/CD testing |

### 2.2 Non-Goals

| ID | Non-Goal | Rationale |
|----|----------|-----------|
| NG1 | Account provisioning | Infrastructure concern |
| NG2 | Warehouse management | DBA operations |
| NG3 | User administration | Security boundary |
| NG4 | Snowpipe configuration | Streaming infrastructure |
| NG5 | Data governance setup | Policy management |
| NG6 | ORM functionality | Use raw SQL/query builders |

---

## 3. Snowflake Platform Overview

### 3.1 Connection Characteristics

| Aspect | Detail |
|--------|--------|
| Protocol | HTTPS (REST API / SQL API) |
| Default Port | 443 |
| Authentication | Password, Key-pair, OAuth, SSO |
| Session | Stateful with session tokens |
| Concurrency | Per-warehouse query slots |

### 3.2 Driver Options

| Driver | Usage |
|--------|-------|
| snowflake-connector (Python) | Reference implementation |
| gosnowflake (Go) | Native Go driver |
| JDBC/ODBC | Cross-platform |
| Snowflake SQL API | REST-based, async-native |

### 3.3 Connection String Format

```
snowflake://<user>:<password>@<account>/<database>/<schema>?warehouse=<wh>&role=<role>

Account formats:
  <org>-<account>                    # Preferred
  <account>.<region>                 # Legacy
  <account>.<region>.<cloud>         # Full qualification

Examples:
  snowflake://user:pass@myorg-myaccount/analytics/public?warehouse=COMPUTE_WH
  snowflake://user@myorg-myaccount?authenticator=externalbrowser
```

### 3.4 Warehouse Sizing

| Size | Credits/Hour | Typical Use |
|------|--------------|-------------|
| X-Small | 1 | Development, light queries |
| Small | 2 | Small workloads |
| Medium | 4 | Standard analytics |
| Large | 8 | Complex queries |
| X-Large | 16 | Heavy analytics |
| 2X-Large | 32 | Data processing |
| 3X-Large | 64 | Large-scale ETL |
| 4X-Large | 128 | Massive workloads |

---

## 4. Functional Requirements

### 4.1 Connection Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-CONN-001 | Create connection with authentication | P0 |
| FR-CONN-002 | Support key-pair authentication | P0 |
| FR-CONN-003 | Support OAuth authentication | P1 |
| FR-CONN-004 | Session token management | P0 |
| FR-CONN-005 | Connection pooling | P0 |
| FR-CONN-006 | Multi-account support | P1 |
| FR-CONN-007 | Role switching within session | P1 |
| FR-CONN-008 | Warehouse switching within session | P1 |

### 4.2 Query Execution

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-QUERY-001 | Execute synchronous queries | P0 |
| FR-QUERY-002 | Execute async queries with polling | P0 |
| FR-QUERY-003 | Cancel running queries | P0 |
| FR-QUERY-004 | Query timeout configuration | P0 |
| FR-QUERY-005 | Parameterized queries | P0 |
| FR-QUERY-006 | Multi-statement execution | P1 |
| FR-QUERY-007 | Query tagging for tracking | P1 |
| FR-QUERY-008 | Result cache utilization | P1 |

### 4.3 Result Handling

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-RES-001 | Fetch all results | P0 |
| FR-RES-002 | Streaming result iteration | P0 |
| FR-RES-003 | Chunked result fetching | P0 |
| FR-RES-004 | Result export to formats (CSV, JSON, Parquet) | P1 |
| FR-RES-005 | Large result set handling (>100MB) | P0 |
| FR-RES-006 | Column metadata extraction | P0 |
| FR-RES-007 | Type conversion to native types | P0 |

### 4.4 Data Ingestion

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-ING-001 | Stage file upload (PUT) | P0 |
| FR-ING-002 | COPY INTO from stage | P0 |
| FR-ING-003 | Bulk insert via VALUES | P1 |
| FR-ING-004 | File format specification | P0 |
| FR-ING-005 | Error handling modes (CONTINUE, ABORT) | P0 |
| FR-ING-006 | Load history tracking | P1 |
| FR-ING-007 | External stage support (S3, GCS, Azure) | P1 |

### 4.5 Warehouse Awareness

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-WH-001 | Query warehouse status | P0 |
| FR-WH-002 | Warehouse size hints for routing | P0 |
| FR-WH-003 | Auto-suspend awareness | P1 |
| FR-WH-004 | Queue depth monitoring | P1 |
| FR-WH-005 | Multi-cluster warehouse awareness | P2 |

### 4.6 Cost Monitoring

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-COST-001 | Query cost estimation (pre-execution) | P1 |
| FR-COST-002 | Credit consumption tracking | P0 |
| FR-COST-003 | Query profile extraction | P1 |
| FR-COST-004 | Cost alerts/thresholds | P2 |
| FR-COST-005 | Historical cost analysis | P2 |

### 4.7 Metadata Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-META-001 | List databases | P0 |
| FR-META-002 | List schemas | P0 |
| FR-META-003 | List tables/views | P0 |
| FR-META-004 | Describe table schema | P0 |
| FR-META-005 | Table statistics (row count, size) | P1 |
| FR-META-006 | Query history access | P1 |

### 4.8 Secure Data Sharing

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-SHARE-001 | Access shared databases | P1 |
| FR-SHARE-002 | List available shares | P1 |
| FR-SHARE-003 | Query shared data | P1 |

### 4.9 Simulation

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-SIM-001 | Record query and results | P1 |
| FR-SIM-002 | Replay recorded queries | P1 |
| FR-SIM-003 | Query fingerprinting | P1 |

---

## 5. Non-Functional Requirements

### 5.1 Performance

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-PERF-001 | Connection establishment | <2s |
| NFR-PERF-002 | Simple query first byte | <500ms |
| NFR-PERF-003 | Result streaming throughput | >100MB/s |
| NFR-PERF-004 | Concurrent query support | 8+ per warehouse |

### 5.2 Reliability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-REL-001 | Session reconnection | Automatic |
| NFR-REL-002 | Query retry on transient errors | 3 attempts |
| NFR-REL-003 | Graceful timeout handling | Configurable |
| NFR-REL-004 | Connection health checks | Periodic |

### 5.3 Security

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-SEC-001 | TLS encryption | Required |
| NFR-SEC-002 | Credential handling | SecretString |
| NFR-SEC-003 | No credential logging | Redacted |
| NFR-SEC-004 | Private key protection | Encrypted storage |
| NFR-SEC-005 | Network policy compliance | Configurable |

---

## 6. Data Models

### 6.1 Connection Types

```
ConnectionConfig
├── account: String              # org-account identifier
├── user: String                 # username
├── auth: AuthConfig             # authentication method
├── database: Option<String>     # default database
├── schema: Option<String>       # default schema
├── warehouse: Option<String>    # default warehouse
├── role: Option<String>         # default role
├── session_params: HashMap      # session parameters
├── timeout: Duration            # connection timeout
└── pool_config: PoolConfig      # connection pool settings

AuthConfig
├── Password { password: SecretString }
├── KeyPair { private_key: SecretString, passphrase: Option<SecretString> }
├── OAuth { token: SecretString, refresh_token: Option<SecretString> }
├── ExternalBrowser                # SSO flow
└── Okta { url: String }           # Okta SSO

PoolConfig
├── min_connections: u32
├── max_connections: u32
├── idle_timeout: Duration
└── max_lifetime: Duration
```

### 6.2 Query Types

```
QueryRequest
├── sql: String                  # SQL statement
├── params: Vec<QueryParam>      # bind parameters
├── timeout: Option<Duration>    # query timeout
├── warehouse: Option<String>    # warehouse override
├── tag: Option<String>          # query tag
└── async_exec: bool             # async execution flag

QueryParam
├── Null
├── Boolean(bool)
├── Integer(i64)
├── Float(f64)
├── String(String)
├── Binary(Vec<u8>)
├── Date(NaiveDate)
├── Time(NaiveTime)
├── Timestamp(DateTime<Utc>)
├── Array(Vec<QueryParam>)
└── Object(HashMap<String, QueryParam>)

QueryResult
├── query_id: String             # unique query identifier
├── status: QueryStatus          # execution status
├── columns: Vec<ColumnMetadata> # result schema
├── rows: Vec<Row>               # result data (if fetched)
├── stats: QueryStats            # execution statistics
└── warehouse: String            # warehouse used

QueryStatus
├── Running
├── Success
├── Failed { error: String }
├── Cancelled
└── Queued

QueryStats
├── rows_produced: u64
├── bytes_scanned: u64
├── execution_time_ms: u64
├── compilation_time_ms: u64
├── queued_time_ms: u64
├── credits_used: f64
└── partitions_scanned: u64
```

### 6.3 Ingestion Types

```
StageUploadRequest
├── stage: String               # stage name (@~ for user, @%table for table)
├── file_path: PathBuf          # local file path
├── auto_compress: bool         # compress on upload
└── overwrite: bool             # overwrite existing

CopyIntoRequest
├── target_table: String        # destination table
├── stage: String               # source stage
├── file_pattern: Option<String># file pattern (regex)
├── file_format: FileFormat     # format specification
├── copy_options: CopyOptions   # copy behavior
└── transform: Option<String>   # SELECT transformation

FileFormat
├── format_type: FormatType     # CSV, JSON, PARQUET, etc.
├── compression: Compression    # AUTO, GZIP, SNAPPY, etc.
├── field_delimiter: Option<char>
├── record_delimiter: Option<String>
├── skip_header: u32
├── null_if: Vec<String>
├── date_format: Option<String>
└── timestamp_format: Option<String>

CopyOptions
├── on_error: OnError           # CONTINUE, SKIP_FILE, ABORT
├── size_limit: Option<u64>     # bytes per load
├── purge: bool                 # delete after load
├── force: bool                 # reload already loaded files
└── match_by_column_name: MatchMode

LoadResult
├── file: String
├── status: LoadStatus
├── rows_parsed: u64
├── rows_loaded: u64
├── errors_seen: u64
├── first_error: Option<String>
└── first_error_line: Option<u64>
```

### 6.4 Metadata Types

```
DatabaseInfo
├── name: String
├── owner: String
├── created_at: DateTime
├── is_transient: bool
└── comment: Option<String>

SchemaInfo
├── name: String
├── database: String
├── owner: String
├── created_at: DateTime
└── is_managed_access: bool

TableInfo
├── name: String
├── database: String
├── schema: String
├── kind: TableKind             # TABLE, VIEW, MATERIALIZED_VIEW
├── owner: String
├── row_count: Option<u64>
├── bytes: Option<u64>
├── created_at: DateTime
├── clustering_key: Option<String>
└── comment: Option<String>

ColumnMetadata
├── name: String
├── data_type: SnowflakeType
├── nullable: bool
├── default: Option<String>
├── primary_key: bool
├── unique_key: bool
└── comment: Option<String>

SnowflakeType
├── Number { precision: u8, scale: u8 }
├── Float
├── Varchar { length: Option<u32> }
├── Binary { length: Option<u32> }
├── Boolean
├── Date
├── Time { precision: u8 }
├── TimestampNtz { precision: u8 }
├── TimestampLtz { precision: u8 }
├── TimestampTz { precision: u8 }
├── Variant
├── Object
├── Array
└── Geography
```

### 6.5 Warehouse Types

```
WarehouseInfo
├── name: String
├── state: WarehouseState       # STARTED, SUSPENDED, RESIZING
├── size: WarehouseSize
├── type: WarehouseType         # STANDARD, SNOWPARK_OPTIMIZED
├── min_cluster_count: u8
├── max_cluster_count: u8
├── running_cluster_count: u8
├── queued_queries: u32
├── running_queries: u32
├── auto_suspend_secs: Option<u32>
└── auto_resume: bool

WarehouseSize
├── XSmall
├── Small
├── Medium
├── Large
├── XLarge
├── XXLarge
├── XXXLarge
└── X4Large

CreditUsage
├── warehouse: String
├── start_time: DateTime
├── end_time: DateTime
├── credits_used: f64
├── credits_compute: f64
├── credits_cloud_services: f64
└── query_count: u64
```

---

## 7. Integration Points

### 7.1 Shared Primitives

| Primitive | Usage |
|-----------|-------|
| Authentication | Credential provider for passwords/keys |
| Logging | Structured query and operation logging |
| Metrics | Query counts, latencies, credit usage |
| Retry | Exponential backoff for transient errors |

### 7.2 Platform Integration

| Integration | Purpose |
|-------------|---------|
| Vector Memory | Store feature extractions with metadata |
| Workflow Engine | Trigger on query completion |
| Feature Store | Extract and serve ML features |
| Notification | Alert on cost thresholds, failures |
| Data Catalog | Sync schema metadata |

---

## 8. Security Considerations

### 8.1 Authentication Methods

| Method | Use Case | Security Level |
|--------|----------|----------------|
| Password | Development | Basic |
| Key-pair | Production services | High |
| OAuth | User-facing apps | High |
| External Browser | Interactive SSO | High |
| Okta | Enterprise SSO | High |

### 8.2 Key-Pair Authentication

```
Generation:
  openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out rsa_key.p8
  openssl rsa -in rsa_key.p8 -pubout -out rsa_key.pub

Storage:
  - Private key encrypted at rest
  - Loaded via SecretString
  - Never logged or exposed

Assignment:
  ALTER USER <user> SET RSA_PUBLIC_KEY='<public_key>';
```

### 8.3 Network Security

| Aspect | Requirement |
|--------|-------------|
| TLS | TLS 1.2+ required |
| Network Policy | Support IP allowlisting awareness |
| Private Link | Support privatelink endpoints |
| Proxy | Support HTTPS proxy configuration |

### 8.4 Query Security

| Concern | Mitigation |
|---------|------------|
| SQL Injection | Parameterized queries only |
| Sensitive data | Query result redaction option |
| Query logging | Redact literals in logs |
| Cost abuse | Query cost limits |

---

## 9. Constraints

### 9.1 Technical Constraints

| Constraint | Description |
|------------|-------------|
| TC-001 | Snowflake SQL API or connector required |
| TC-002 | Account must exist and be accessible |
| TC-003 | Warehouse must exist for query execution |
| TC-004 | Result set limit: 100GB default |
| TC-005 | Query timeout: 2 days maximum |
| TC-006 | Statement size limit: 1MB |

### 9.2 Design Constraints

| Constraint | Description |
|------------|-------------|
| DC-001 | Thin adapter only |
| DC-002 | No warehouse creation |
| DC-003 | No user management |
| DC-004 | Uses shared auth primitives |
| DC-005 | No cross-module dependencies |

### 9.3 Operational Constraints

| Constraint | Workaround |
|------------|------------|
| Warehouse cold start | Pre-warm or accept latency |
| Query queue limits | Route to appropriate warehouse |
| Credit limits | Cost monitoring and alerts |
| Result cache expiry | 24-hour window awareness |
| Session timeout | Automatic reconnection |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-SNOW-SPEC-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Specification Document**

*Proceed to Pseudocode phase upon approval.*
