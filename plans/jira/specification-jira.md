# Jira Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/jira`

---

## 1. Overview

### 1.1 Document Purpose

This specification defines requirements for the Jira Integration Module, providing a production-ready interface for issue management, workflow automation, and state tracking via Jira REST API and webhooks within the LLM Dev Ops platform.

### 1.2 Methodology

- **SPARC**: Specification → Pseudocode → Architecture → Refinement → Completion
- **London-School TDD**: Interface-first, mock-based testing
- **Thin Adapter Pattern**: Minimal logic, delegating to shared primitives

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The Jira Integration Module provides a **thin adapter layer** that:
- Creates, reads, updates, and deletes issues
- Executes workflow transitions with validation
- Manages issue fields, comments, and attachments
- Processes webhook events for automation triggers
- Queries issues via JQL (Jira Query Language)
- Tracks issue history and changelog
- Supports bulk operations for batch processing
- Enables simulation/replay of workflow interactions

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Issue CRUD** | Create, read, update, delete issues |
| **Transitions** | Execute workflow state transitions |
| **Field Management** | Get/set standard and custom fields |
| **Comments** | Add, edit, delete issue comments |
| **Attachments** | Upload and download attachments |
| **JQL Search** | Query issues with pagination |
| **Webhooks** | Receive and validate webhook events |
| **Bulk Operations** | Batch issue updates and transitions |
| **Changelog** | Track issue history and field changes |
| **Permission Scoping** | Validate user/app permissions |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Issue lifecycle | Create, update, delete, transition |
| Field operations | Standard fields, custom fields |
| Comments/attachments | Full CRUD operations |
| JQL queries | Search with pagination |
| Webhook processing | Event validation and dispatch |
| Bulk operations | Batch updates (up to 50 issues) |
| Workflow transitions | With field validation |
| Issue links | Create/delete relationships |
| Watchers | Add/remove watchers |
| Dual language | Rust (primary) and TypeScript |

#### Out of Scope

| Item | Reason |
|------|--------|
| Project creation | Admin configuration |
| Workflow design | Jira administration |
| Permission schemes | Tenant administration |
| Board/sprint management | Agile-specific module |
| Tempo/time tracking | Third-party plugin |
| Custom field creation | Schema administration |
| User management | Atlassian admin |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| Async-first | I/O-bound operations |
| No panics | Reliability |
| Trait-based | Testability |
| OAuth 2.0 / API tokens | Atlassian standard |
| Rate limit compliance | API sustainability |

---

## 3. Dependency Policy

### 3.1 Shared Modules

| Module | Purpose |
|--------|---------|
| `shared/credentials` | Atlassian API tokens/OAuth |
| `shared/resilience` | Retry, circuit breaker |
| `shared/observability` | Logging, metrics, tracing |
| `shared/http` | HTTP transport |

### 3.2 External Dependencies (Rust)

| Crate | Purpose |
|-------|---------|
| `tokio` | Async runtime |
| `reqwest` | HTTP client |
| `serde` / `serde_json` | Serialization |
| `async-trait` | Async trait support |
| `thiserror` | Error derivation |
| `chrono` | Timestamps |
| `hmac` / `sha256` | Webhook signatures |

### 3.3 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `jira-rs` | This module IS the integration |
| Full Atlassian SDK | Use internal implementations |

---

## 4. API Coverage

### 4.1 Jira REST API Endpoints

**Base URL:** `https://{site}.atlassian.net/rest/api/3`

#### Issue Operations

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Create issue | POST | `/issue` |
| Get issue | GET | `/issue/{issueIdOrKey}` |
| Update issue | PUT | `/issue/{issueIdOrKey}` |
| Delete issue | DELETE | `/issue/{issueIdOrKey}` |
| Get transitions | GET | `/issue/{issueIdOrKey}/transitions` |
| Do transition | POST | `/issue/{issueIdOrKey}/transitions` |
| Get changelog | GET | `/issue/{issueIdOrKey}/changelog` |

#### Search Operations

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Search (JQL) | POST | `/search` |
| Get fields | GET | `/field` |

#### Comment Operations

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Get comments | GET | `/issue/{issueIdOrKey}/comment` |
| Add comment | POST | `/issue/{issueIdOrKey}/comment` |
| Update comment | PUT | `/issue/{issueIdOrKey}/comment/{id}` |
| Delete comment | DELETE | `/issue/{issueIdOrKey}/comment/{id}` |

#### Attachment Operations

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Add attachment | POST | `/issue/{issueIdOrKey}/attachments` |
| Get attachment | GET | `/attachment/{id}` |
| Delete attachment | DELETE | `/attachment/{id}` |

#### Bulk Operations

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Bulk create | POST | `/issue/bulk` |
| Bulk edit | POST | `/issue/bulkEdit` |

#### Link Operations

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Create link | POST | `/issueLink` |
| Delete link | DELETE | `/issueLink/{linkId}` |
| Get link types | GET | `/issueLinkType` |

### 4.2 Issue Response Structure

```json
{
  "id": "10001",
  "key": "PROJ-123",
  "self": "https://site.atlassian.net/rest/api/3/issue/10001",
  "fields": {
    "summary": "Issue title",
    "description": { "type": "doc", "content": [...] },
    "status": { "id": "1", "name": "Open" },
    "priority": { "id": "3", "name": "Medium" },
    "assignee": { "accountId": "..." },
    "reporter": { "accountId": "..." },
    "created": "2025-01-01T00:00:00.000Z",
    "updated": "2025-01-02T00:00:00.000Z",
    "customfield_10001": "custom value"
  }
}
```

### 4.3 Webhook Event Structure

```json
{
  "timestamp": 1704067200000,
  "webhookEvent": "jira:issue_updated",
  "issue_event_type_name": "issue_generic",
  "issue": { "id": "10001", "key": "PROJ-123", ... },
  "changelog": {
    "items": [
      { "field": "status", "from": "1", "to": "2" }
    ]
  }
}
```

---

## 5. Error Taxonomy

### 5.1 Error Hierarchy

```
JiraError
├── ConfigurationError
│   ├── InvalidSiteUrl
│   ├── InvalidProjectKey
│   └── InvalidCredentials
│
├── AuthenticationError
│   ├── TokenExpired
│   ├── InvalidApiToken
│   ├── InsufficientScopes
│   └── OAuthRefreshFailed
│
├── AccessError
│   ├── IssueNotFound
│   ├── ProjectNotFound
│   ├── PermissionDenied
│   ├── IssueLocked
│   └── TransitionNotAllowed
│
├── ValidationError
│   ├── InvalidFieldValue
│   ├── RequiredFieldMissing
│   ├── InvalidJql
│   ├── InvalidTransition
│   └── AttachmentTooLarge
│
├── WorkflowError
│   ├── TransitionConditionFailed
│   ├── ValidatorFailed
│   └── PostFunctionFailed
│
├── RateLimitError
│   ├── ThrottledRequest
│   └── TooManyRequests
│
├── NetworkError
│   ├── ConnectionFailed
│   ├── Timeout
│   └── DnsResolutionFailed
│
└── ServerError
    ├── InternalError
    └── ServiceUnavailable
```

### 5.2 HTTP Status Mapping

| Status | Error Type | Retryable |
|--------|------------|-----------|
| 400 | `ValidationError` | No |
| 401 | `AuthenticationError` | Yes (refresh) |
| 403 | `AccessError::PermissionDenied` | No |
| 404 | `AccessError::IssueNotFound` | No |
| 409 | `WorkflowError` | No |
| 429 | `RateLimitError` | Yes |
| 500 | `ServerError::InternalError` | Yes |
| 503 | `ServerError::ServiceUnavailable` | Yes |

---

## 6. Resilience Requirements

### 6.1 Retry Configuration

| Error Type | Retry | Max Attempts | Backoff |
|------------|-------|--------------|---------|
| `RateLimitError` (429) | Yes | 5 | Respect Retry-After |
| `ServiceUnavailable` (503) | Yes | 3 | Exponential (2s base) |
| `InternalError` (500) | Yes | 3 | Exponential (1s base) |
| `Timeout` | Yes | 3 | Fixed (1s) |
| `OAuthRefreshFailed` | Yes | 2 | Fixed (500ms) |

### 6.2 Rate Limiting (Client-Side)

| Limit Type | Default | Notes |
|------------|---------|-------|
| Requests per second | 10 | Per API token |
| Bulk operations | 50 | Issues per request |
| Search results | 100 | Per page (max) |
| Attachments | 10MB | Per file |

### 6.3 Circuit Breaker

| Parameter | Default |
|-----------|---------|
| Failure threshold | 5 failures |
| Success threshold | 2 successes |
| Reset timeout | 30 seconds |

---

## 7. Observability Requirements

### 7.1 Tracing Spans

| Span | Attributes |
|------|------------|
| `jira.issue.create` | `project_key`, `issue_type` |
| `jira.issue.get` | `issue_key` |
| `jira.issue.update` | `issue_key`, `fields_updated` |
| `jira.issue.transition` | `issue_key`, `from_status`, `to_status` |
| `jira.search` | `jql_hash`, `result_count` |
| `jira.webhook.receive` | `event_type`, `issue_key` |
| `jira.bulk.update` | `issue_count`, `success_count` |

### 7.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `jira_operations_total` | Counter | `operation`, `status` |
| `jira_operation_latency_seconds` | Histogram | `operation` |
| `jira_issues_created_total` | Counter | `project` |
| `jira_transitions_total` | Counter | `from_status`, `to_status` |
| `jira_webhook_events_total` | Counter | `event_type` |
| `jira_errors_total` | Counter | `error_type` |
| `jira_rate_limit_hits_total` | Counter | - |
| `jira_bulk_operations_total` | Counter | `operation` |

### 7.3 Logging

| Level | When |
|-------|------|
| ERROR | Operation failures, auth errors |
| WARN | Rate limiting, retries, validation failures |
| INFO | Issues created/transitioned, webhooks processed |
| DEBUG | Request/response details |
| TRACE | Full payloads (redacted) |

---

## 8. Security Requirements

### 8.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| API token never logged | `SecretString` wrapper |
| OAuth tokens protected | Token cache with refresh |
| Webhook secrets secured | HMAC validation |

### 8.2 Authentication Methods

| Method | Use Case |
|--------|----------|
| API Token | Basic authentication (user context) |
| OAuth 2.0 | App authentication (3LO) |
| Connect JWT | Atlassian Connect apps |

### 8.3 Permission Scopes

| Scope | Purpose |
|-------|---------|
| `read:jira-work` | Read issues, projects |
| `write:jira-work` | Create/update issues |
| `manage:jira-webhook` | Register webhooks |
| `read:jira-user` | Read user information |

### 8.4 Webhook Security

| Requirement | Implementation |
|-------------|----------------|
| HMAC validation | SHA256 signature verification |
| Timestamp validation | Reject stale events (>5min) |
| Source IP validation | Atlassian IP ranges (optional) |

---

## 9. Performance Requirements

### 9.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| Get issue | < 150ms | < 500ms |
| Create issue | < 300ms | < 1s |
| Update issue | < 250ms | < 800ms |
| Transition | < 300ms | < 1s |
| JQL search (100 results) | < 500ms | < 2s |
| Bulk update (50 issues) | < 2s | < 5s |

### 9.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Operations per second | 10+ |
| Concurrent requests | 50+ |
| Webhook events per second | 100+ |

---

## 10. Enterprise Features

### 10.1 Workflow Automation

| Feature | Description |
|---------|-------------|
| Transition validation | Pre-check conditions before transition |
| Field auto-population | Set fields during transition |
| Chained transitions | Multi-step workflow execution |
| Conditional logic | JQL-based automation triggers |

### 10.2 Bulk Operations

| Feature | Description |
|---------|-------------|
| Batch create | Create up to 50 issues |
| Batch update | Update multiple issues atomically |
| Batch transition | Transition multiple issues |
| Progress tracking | Monitor bulk operation status |

### 10.3 Webhook Processing

| Feature | Description |
|---------|-------------|
| Event filtering | Subscribe to specific events |
| Payload validation | HMAC signature verification |
| Idempotency | Deduplicate webhook deliveries |
| Replay support | Re-process historical events |

### 10.4 Simulation and Replay

| Feature | Description |
|---------|-------------|
| Mock mode | Simulate Jira operations |
| Record mode | Capture API interactions |
| Replay mode | Deterministic testing |
| Dry-run transitions | Validate without executing |

---

## 11. Acceptance Criteria

### 11.1 Functional

- [ ] Issue: Create with required fields
- [ ] Issue: Get by key or ID
- [ ] Issue: Update fields (standard + custom)
- [ ] Issue: Delete issue
- [ ] Issue: Get available transitions
- [ ] Issue: Execute transition with fields
- [ ] Comment: Add, edit, delete
- [ ] Attachment: Upload, download, delete
- [ ] Search: JQL with pagination
- [ ] Search: Field expansion
- [ ] Bulk: Create multiple issues
- [ ] Bulk: Update multiple issues
- [ ] Link: Create/delete issue links
- [ ] Webhook: Receive and validate events
- [ ] Webhook: Event type filtering
- [ ] Changelog: Get issue history

### 11.2 Non-Functional

- [ ] No panics
- [ ] Credentials protected
- [ ] Retry works correctly
- [ ] Circuit breaker functions
- [ ] Issue keys redacted in logs
- [ ] Test coverage > 80%

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Specification |

---

**Next Phase:** Pseudocode - Core algorithms for issue operations, workflow transitions, webhook processing, and bulk operations.
