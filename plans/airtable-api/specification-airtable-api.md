# Specification: Airtable API Integration Module

## SPARC Phase 1: Specification

**Version:** 1.0.0
**Date:** 2025-12-14
**Status:** Draft
**Module:** `integrations/airtable-api`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Goals and Non-Goals](#2-goals-and-non-goals)
3. [Airtable API Overview](#3-airtable-api-overview)
4. [Functional Requirements](#4-functional-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [Data Models](#6-data-models)
7. [Integration Points](#7-integration-points)
8. [Security Considerations](#8-security-considerations)
9. [Constraints](#9-constraints)

---

## 1. Overview

### 1.1 Purpose

This module provides a thin adapter layer connecting the LLM Dev Ops platform to Airtable for structured data workflows including configuration tables, lightweight databases, workflow state persistence, experiment tracking, and simulation inputs/outputs. It enables enterprise-scale data operations while delegating base setup, schema management, and core orchestration to the consuming application.

### 1.2 Scope

```
+------------------------------------------------------------------+
|                    AIRTABLE INTEGRATION SCOPE                     |
+------------------------------------------------------------------+
|                                                                   |
|  IN SCOPE:                                                        |
|  +-- Record Operations (create, read, update, delete)            |
|  +-- Batch Operations (up to 10 records per request)             |
|  +-- List Records (filtering, sorting, view selection)           |
|  +-- Pagination Handling (offset-based iteration)                |
|  +-- Field Type Support (all standard Airtable types)            |
|  +-- Base/Table Metadata Retrieval                               |
|  +-- Webhook Registration (change notifications)                 |
|  +-- Rate Limit Awareness (backoff, queuing)                     |
|  +-- Simulation Layer (record/replay for CI/CD)                  |
|                                                                   |
|  OUT OF SCOPE:                                                    |
|  +-- Base creation/provisioning                                  |
|  +-- Schema/field definition                                     |
|  +-- View creation/management                                    |
|  +-- User/collaborator administration                            |
|  +-- Workspace management                                        |
|  +-- Automations configuration                                   |
|  +-- Interface/app building                                      |
|                                                                   |
+------------------------------------------------------------------+
```

---

## 2. Goals and Non-Goals

### 2.1 Goals

| ID | Goal |
|----|------|
| G1 | Execute CRUD operations on Airtable records |
| G2 | Support batch operations within API limits |
| G3 | Handle pagination transparently for large datasets |
| G4 | Respect rate limits with intelligent backoff |
| G5 | Process webhook events for change notifications |
| G6 | Retrieve base/table metadata for discovery |
| G7 | Enable simulation/replay for CI/CD testing |
| G8 | Integrate with shared auth, logging, metrics |

### 2.2 Non-Goals

| ID | Non-Goal | Rationale |
|----|----------|-----------|
| NG1 | Base provisioning | Airtable UI/admin responsibility |
| NG2 | Schema management | Application-layer concern |
| NG3 | View configuration | UI-driven setup |
| NG4 | User permissions | Workspace admin function |
| NG5 | Automation rules | Airtable native feature |
| NG6 | Complex joins | Use linked records instead |

---

## 3. Airtable API Overview

### 3.1 Connection Characteristics

| Aspect | Detail |
|--------|--------|
| Protocol | HTTPS REST |
| Base URL | `https://api.airtable.com/v0` |
| Auth | Bearer token (PAT or OAuth) |
| Content-Type | `application/json` |
| Rate Limit | 5 requests/second per base |

### 3.2 Authentication Methods

| Method | Usage |
|--------|-------|
| Personal Access Token (PAT) | Server-side, scoped permissions |
| OAuth 2.0 | User-delegated access |
| API Key (Legacy) | Deprecated, avoid |

### 3.3 Resource Hierarchy

```
Workspace
+-- Base (app_xxx)
    +-- Table (tbl_xxx)
        +-- Field (fld_xxx)
        +-- View (viw_xxx)
        +-- Record (rec_xxx)
```

### 3.4 Rate Limits

| Tier | Limit | Behavior |
|------|-------|----------|
| Standard | 5 req/sec per base | 429 with Retry-After |
| Batch | 10 records per request | 422 if exceeded |
| List | 100 records per page | Pagination required |

---

## 4. Functional Requirements

### 4.1 Record Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-REC-001 | Create single record | P0 |
| FR-REC-002 | Retrieve record by ID | P0 |
| FR-REC-003 | Update record by ID | P0 |
| FR-REC-004 | Delete record by ID | P0 |
| FR-REC-005 | Create batch records (up to 10) | P0 |
| FR-REC-006 | Update batch records (up to 10) | P0 |
| FR-REC-007 | Delete batch records (up to 10) | P0 |
| FR-REC-008 | Upsert records (match on fields) | P1 |

### 4.2 List and Query

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-LIST-001 | List records with pagination | P0 |
| FR-LIST-002 | Filter by formula | P0 |
| FR-LIST-003 | Sort by field(s) | P0 |
| FR-LIST-004 | Select specific fields | P1 |
| FR-LIST-005 | Filter by view | P1 |
| FR-LIST-006 | Iterator/stream abstraction | P0 |
| FR-LIST-007 | Cell format selection (string/json) | P2 |

### 4.3 Metadata

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-META-001 | List bases in workspace | P1 |
| FR-META-002 | Get base schema (tables, fields) | P0 |
| FR-META-003 | Get table schema | P1 |
| FR-META-004 | List available views | P2 |

### 4.4 Webhooks

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-WH-001 | Create webhook for table | P1 |
| FR-WH-002 | List webhooks | P1 |
| FR-WH-003 | Delete webhook | P1 |
| FR-WH-004 | Refresh webhook (extend expiry) | P1 |
| FR-WH-005 | Parse webhook payload | P0 |
| FR-WH-006 | Verify webhook HMAC signature | P0 |
| FR-WH-007 | Fetch changed records (cursor-based) | P1 |

### 4.5 Rate Limit Handling

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-RL-001 | Detect 429 responses | P0 |
| FR-RL-002 | Parse Retry-After header | P0 |
| FR-RL-003 | Implement backoff queue | P0 |
| FR-RL-004 | Per-base rate tracking | P1 |
| FR-RL-005 | Concurrent request throttling | P1 |

### 4.6 Simulation

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-SIM-001 | Record API interactions | P1 |
| FR-SIM-002 | Replay recorded interactions | P1 |
| FR-SIM-003 | Mock webhook events | P1 |
| FR-SIM-004 | Deterministic test data | P2 |

---

## 5. Non-Functional Requirements

### 5.1 Performance

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-PERF-001 | Single record operation p99 | <300ms |
| NFR-PERF-002 | Batch operation p99 | <500ms |
| NFR-PERF-003 | Pagination fetch p99 | <400ms |
| NFR-PERF-004 | Webhook verification p99 | <5ms |
| NFR-PERF-005 | Concurrent base operations | 10+ bases |

### 5.2 Reliability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-REL-001 | Retry on 5xx errors | 3 attempts, exponential |
| NFR-REL-002 | Retry on 429 | Use Retry-After |
| NFR-REL-003 | Idempotent creates | Client-generated IDs |
| NFR-REL-004 | Webhook delivery tolerance | At-least-once |
| NFR-REL-005 | Circuit breaker | On sustained failures |

### 5.3 Security

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-SEC-001 | TLS encryption | Required (1.2+) |
| NFR-SEC-002 | Token handling | SecretString type |
| NFR-SEC-003 | Webhook HMAC verification | Mandatory |
| NFR-SEC-004 | No credential logging | Redacted |
| NFR-SEC-005 | Scoped token permissions | Minimal required |

---

## 6. Data Models

### 6.1 Configuration Types

```
AirtableConfig
+-- api_token: SecretString
+-- webhook_secret: Option<SecretString>
+-- base_url: Url
+-- timeout: Duration
+-- max_retries: u32
+-- rate_limit_strategy: RateLimitStrategy

RateLimitStrategy
+-- Blocking (wait for slot)
+-- Queued (background queue)
+-- FailFast (return error)
```

### 6.2 Record Types

```
Record
+-- id: String (rec_xxx)
+-- created_time: DateTime
+-- fields: HashMap<String, FieldValue>

FieldValue
+-- Text(String)
+-- Number(f64)
+-- Checkbox(bool)
+-- Date(NaiveDate)
+-- DateTime(DateTime)
+-- SingleSelect(String)
+-- MultiSelect(Vec<String>)
+-- User(UserRef)
+-- Attachment(Vec<Attachment>)
+-- LinkedRecords(Vec<String>)
+-- Lookup(Vec<FieldValue>)
+-- Formula(FormulaResult)
+-- Rollup(RollupResult)
+-- Currency(f64)
+-- Percent(f64)
+-- Duration(i64)
+-- Rating(u8)
+-- Url(String)
+-- Email(String)
+-- Phone(String)
+-- Barcode(String)
+-- Button(ButtonConfig)
+-- Null

Attachment
+-- id: String
+-- url: String
+-- filename: String
+-- size: u64
+-- type: String
+-- thumbnails: Option<Thumbnails>
```

### 6.3 Query Types

```
ListRecordsRequest
+-- base_id: String
+-- table_id: String
+-- filter_by_formula: Option<String>
+-- sort: Option<Vec<SortField>>
+-- fields: Option<Vec<String>>
+-- view: Option<String>
+-- page_size: Option<u32>
+-- offset: Option<String>
+-- cell_format: CellFormat

SortField
+-- field: String
+-- direction: SortDirection

ListRecordsResponse
+-- records: Vec<Record>
+-- offset: Option<String>
```

### 6.4 Webhook Types

```
Webhook
+-- id: String
+-- mac_secret_base64: String
+-- notification_url: Option<String>
+-- cursor_for_next_payload: u64
+-- are_notifications_enabled: bool
+-- expiration_time: DateTime

WebhookPayload
+-- base: WebhookBase
+-- webhook: WebhookMeta
+-- timestamp: DateTime

WebhookChange
+-- table_id: String
+-- record_id: String
+-- change_type: ChangeType (created/changed/destroyed)
+-- changed_fields: Option<Vec<String>>
```

### 6.5 Metadata Types

```
Base
+-- id: String (app_xxx)
+-- name: String
+-- permission_level: PermissionLevel

TableSchema
+-- id: String (tbl_xxx)
+-- name: String
+-- primary_field_id: String
+-- fields: Vec<FieldSchema>
+-- views: Vec<ViewSchema>

FieldSchema
+-- id: String (fld_xxx)
+-- name: String
+-- type: FieldType
+-- options: Option<FieldOptions>
```

---

## 7. Integration Points

### 7.1 Shared Primitives

| Primitive | Usage |
|-----------|-------|
| Authentication | Token provider, rotation support |
| Logging | Structured operation logging |
| Metrics | Request counts, latencies, errors |
| Retry | Exponential backoff with jitter |
| Circuit Breaker | Prevent cascade on API outage |

### 7.2 Platform Integration

| Integration | Purpose |
|-------------|---------|
| Vector Memory | Store record embeddings for RAG |
| Event Bus | Publish webhook changes |
| Workflow Engine | Trigger on record changes |
| Config Service | Read from config tables |

### 7.3 Observability Hooks

```
Tracing Spans:
+-- airtable.record.create
+-- airtable.record.batch_update
+-- airtable.list.paginate
+-- airtable.webhook.process

Metrics:
+-- airtable_requests_total{base, operation, status}
+-- airtable_request_duration_seconds{operation}
+-- airtable_rate_limit_waits_total{base}
+-- airtable_webhook_events_total{table, type}
+-- airtable_pagination_pages_total{base, table}
```

---

## 8. Security Considerations

### 8.1 Authentication

| Aspect | Requirement |
|--------|-------------|
| Token Storage | SecretString, never logged |
| Token Rotation | Support hot reload |
| Scoped Permissions | Minimal required scopes |
| OAuth Tokens | Secure refresh flow |

### 8.2 Webhook Security

| Aspect | Requirement |
|--------|-------------|
| HMAC Verification | Mandatory, fail-closed |
| Secret Handling | Base64 decoded, secure compare |
| HTTPS Only | Enforce TLS on endpoints |
| Expiry Management | Auto-refresh before expiry |

### 8.3 Data Handling

| Concern | Mitigation |
|---------|------------|
| PII in Records | Field-level redaction in logs |
| Attachment URLs | Time-limited, don't cache |
| Error Messages | No tokens in responses |
| Audit Trail | Log record IDs, not content |

---

## 9. Constraints

### 9.1 Technical Constraints

| Constraint | Description |
|------------|-------------|
| TC-001 | 5 requests/second per base |
| TC-002 | 10 records max per batch |
| TC-003 | 100 records max per list page |
| TC-004 | 100KB max request payload |
| TC-005 | Webhooks expire after 7 days |
| TC-006 | Formula filter string limit |

### 9.2 Design Constraints

| Constraint | Description |
|------------|-------------|
| DC-001 | Thin adapter only, no business logic |
| DC-002 | No schema creation/modification |
| DC-003 | Uses shared auth/logging/metrics |
| DC-004 | No cross-integration dependencies |
| DC-005 | Webhook handlers must be idempotent |

### 9.3 Operational Constraints

| Constraint | Workaround |
|------------|------------|
| Rate limit sharing | Per-base tracking |
| Webhook expiry | Auto-refresh cron |
| Eventual consistency | Polling fallback |
| No transactions | Application-level compensation |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-AIRTABLE-SPEC-001 |
| Version | 1.0.0 |
| Created | 2025-12-14 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Specification Document**

*Proceed to Pseudocode phase upon approval.*
