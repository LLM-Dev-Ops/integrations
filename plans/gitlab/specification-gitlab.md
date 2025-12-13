# Specification: GitLab Integration Module

## SPARC Phase 1: Specification

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/gitlab`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Goals and Non-Goals](#2-goals-and-non-goals)
3. [GitLab API Overview](#3-gitlab-api-overview)
4. [Functional Requirements](#4-functional-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [Data Models](#6-data-models)
7. [Integration Points](#7-integration-points)
8. [Security Considerations](#8-security-considerations)
9. [Constraints](#9-constraints)

---

## 1. Overview

### 1.1 Purpose

This module provides a thin adapter layer connecting the LLM Dev Ops platform to GitLab for source control operations, CI/CD pipeline management, merge request workflows, and project automation via the GitLab REST API.

### 1.2 Scope

```
┌─────────────────────────────────────────────────────────────────┐
│                    GITLAB INTEGRATION SCOPE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  IN SCOPE:                                                       │
│  ├── Repository Operations (files, branches, commits)           │
│  ├── Merge Request Workflows (create, review, merge)            │
│  ├── Pipeline Operations (trigger, status, cancel, retry)       │
│  ├── Job Operations (logs, artifacts, retry)                    │
│  ├── Issue Operations (create, update, comment)                 │
│  ├── Webhook Events (receive and process)                       │
│  ├── Project Metadata (read-only)                               │
│  └── Simulation Layer (record/replay)                           │
│                                                                  │
│  OUT OF SCOPE:                                                   │
│  ├── Repository hosting/creation                                │
│  ├── Runner provisioning/management                             │
│  ├── Group/organization management                              │
│  ├── User management                                            │
│  ├── GitLab instance administration                             │
│  ├── Git protocol operations (use git CLI)                      │
│  └── Container registry management                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Goals and Non-Goals

### 2.1 Goals

| ID | Goal |
|----|------|
| G1 | Enable merge request automation workflows |
| G2 | Trigger and monitor CI/CD pipelines |
| G3 | Access repository files and metadata |
| G4 | Process webhook events for automation |
| G5 | Support issue tracking integration |
| G6 | Enable simulation/replay for CI/CD |
| G7 | Integrate with shared authentication |
| G8 | Support GitLab.com and self-hosted instances |

### 2.2 Non-Goals

| ID | Non-Goal | Rationale |
|----|----------|-----------|
| NG1 | Repository hosting | Infrastructure management |
| NG2 | Runner provisioning | Infrastructure management |
| NG3 | Instance administration | Security boundary |
| NG4 | Git protocol operations | Use native git CLI |
| NG5 | Container registry | Separate integration |
| NG6 | Package registry | Separate integration |

---

## 3. GitLab API Overview

### 3.1 API Characteristics

| Aspect | Detail |
|--------|--------|
| Base URL | `https://gitlab.com/api/v4` or self-hosted |
| Auth | Personal Access Token or OAuth2 |
| Format | JSON |
| Rate Limit | Varies by tier (2000/min authenticated) |
| Pagination | Keyset or offset-based |

### 3.2 Core Resources

| Resource | Endpoints |
|----------|-----------|
| Projects | `/projects/{id}` |
| Repositories | `/projects/{id}/repository/*` |
| Merge Requests | `/projects/{id}/merge_requests/*` |
| Pipelines | `/projects/{id}/pipelines/*` |
| Jobs | `/projects/{id}/jobs/*` |
| Issues | `/projects/{id}/issues/*` |
| Commits | `/projects/{id}/repository/commits/*` |
| Branches | `/projects/{id}/repository/branches/*` |

### 3.3 Rate Limiting

| Tier | Limit | Behavior |
|------|-------|----------|
| Authenticated | 2000/min | RateLimit-* headers |
| Unauthenticated | 500/min | RateLimit-* headers |
| Search | 10/min | Separate limit |
| Import/Export | 6/min | Separate limit |

### 3.4 Webhook Events

| Event | Trigger |
|-------|---------|
| Push | Code pushed to repository |
| Merge Request | MR created, updated, merged |
| Pipeline | Pipeline status change |
| Job | Job status change |
| Issue | Issue created, updated, closed |
| Note | Comment added |
| Tag Push | Tag created/deleted |

---

## 4. Functional Requirements

### 4.1 Repository Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-REPO-001 | Get file content by path | P0 |
| FR-REPO-002 | List directory contents | P0 |
| FR-REPO-003 | Create/update file | P0 |
| FR-REPO-004 | Delete file | P1 |
| FR-REPO-005 | Get file blame | P2 |
| FR-REPO-006 | Compare branches/commits | P1 |
| FR-REPO-007 | List branches | P0 |
| FR-REPO-008 | Create branch | P0 |
| FR-REPO-009 | Delete branch | P1 |
| FR-REPO-010 | Get commit details | P0 |
| FR-REPO-011 | List commits | P0 |

### 4.2 Merge Request Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-MR-001 | Create merge request | P0 |
| FR-MR-002 | Get merge request details | P0 |
| FR-MR-003 | Update merge request | P0 |
| FR-MR-004 | List merge requests | P0 |
| FR-MR-005 | Merge merge request | P0 |
| FR-MR-006 | Close merge request | P1 |
| FR-MR-007 | Reopen merge request | P2 |
| FR-MR-008 | Get MR changes (diff) | P0 |
| FR-MR-009 | Get MR commits | P1 |
| FR-MR-010 | Add MR comment | P0 |
| FR-MR-011 | List MR comments | P1 |
| FR-MR-012 | Approve merge request | P0 |
| FR-MR-013 | Unapprove merge request | P1 |
| FR-MR-014 | Get MR approvals | P1 |

### 4.3 Pipeline Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-PIPE-001 | List pipelines | P0 |
| FR-PIPE-002 | Get pipeline details | P0 |
| FR-PIPE-003 | Create pipeline (trigger) | P0 |
| FR-PIPE-004 | Cancel pipeline | P0 |
| FR-PIPE-005 | Retry pipeline | P0 |
| FR-PIPE-006 | Delete pipeline | P2 |
| FR-PIPE-007 | Get pipeline jobs | P0 |
| FR-PIPE-008 | Get pipeline variables | P1 |

### 4.4 Job Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-JOB-001 | Get job details | P0 |
| FR-JOB-002 | Get job log (trace) | P0 |
| FR-JOB-003 | Retry job | P0 |
| FR-JOB-004 | Cancel job | P0 |
| FR-JOB-005 | Download job artifacts | P1 |
| FR-JOB-006 | Play manual job | P0 |
| FR-JOB-007 | Erase job | P2 |

### 4.5 Issue Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-ISSUE-001 | Create issue | P1 |
| FR-ISSUE-002 | Get issue details | P1 |
| FR-ISSUE-003 | Update issue | P1 |
| FR-ISSUE-004 | List issues | P1 |
| FR-ISSUE-005 | Close issue | P1 |
| FR-ISSUE-006 | Add issue comment | P1 |
| FR-ISSUE-007 | List issue comments | P2 |

### 4.6 Project Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-PROJ-001 | Get project details | P0 |
| FR-PROJ-002 | List project members | P1 |
| FR-PROJ-003 | Get project variables | P1 |

### 4.7 Webhook Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-HOOK-001 | Validate webhook signature | P0 |
| FR-HOOK-002 | Parse push event | P0 |
| FR-HOOK-003 | Parse MR event | P0 |
| FR-HOOK-004 | Parse pipeline event | P0 |
| FR-HOOK-005 | Parse job event | P1 |
| FR-HOOK-006 | Parse issue event | P1 |
| FR-HOOK-007 | Parse note event | P1 |

### 4.8 Simulation

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-SIM-001 | Record API interactions | P1 |
| FR-SIM-002 | Replay recorded interactions | P1 |
| FR-SIM-003 | Content hashing for verification | P1 |

---

## 5. Non-Functional Requirements

### 5.1 Performance

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-PERF-001 | API call p99 | <500ms |
| NFR-PERF-002 | File download | >10 MB/s |
| NFR-PERF-003 | Webhook processing | <100ms |
| NFR-PERF-004 | Log streaming | Real-time |

### 5.2 Reliability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-REL-001 | Retry on 5xx | 3 attempts |
| NFR-REL-002 | Retry on 429 | Honor Retry-After |
| NFR-REL-003 | Exponential backoff | 1s, 2s, 4s |
| NFR-REL-004 | Request timeout | 30s (300s for logs) |

### 5.3 Security

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-SEC-001 | TLS required | HTTPS only |
| NFR-SEC-002 | Token handling | SecretString |
| NFR-SEC-003 | Webhook validation | X-Gitlab-Token |
| NFR-SEC-004 | No token logging | Redacted |

---

## 6. Data Models

### 6.1 Core Types

```
ProjectRef
├── Id(u64)              // Numeric project ID
├── Path(String)         // namespace/project-name
└── Url(String)          // Full GitLab URL

MergeRequestRef
├── Iid(u64)             // Project-scoped IID
└── Id(u64)              // Global ID

PipelineRef
└── Id(u64)              // Pipeline ID

JobRef
└── Id(u64)              // Job ID

CommitRef
├── Sha(String)          // Full SHA
├── Short(String)        // Short SHA
└── Ref(String)          // Branch/tag name
```

### 6.2 Merge Request States

```
MergeRequestState
├── Opened
├── Closed
├── Merged
├── Locked
└── All (for queries)

MergeStatus
├── CanBeMerged
├── CannotBeMerged
├── Checking
├── CannotBeMergedRecheck
└── Unchecked
```

### 6.3 Pipeline/Job Status

```
PipelineStatus
├── Created
├── WaitingForResource
├── Preparing
├── Pending
├── Running
├── Success
├── Failed
├── Canceled
├── Skipped
├── Manual
└── Scheduled

JobStatus
├── Created
├── Pending
├── Running
├── Success
├── Failed
├── Canceled
├── Skipped
├── Manual
└── Waiting (for resource)
```

### 6.4 Webhook Events

```
WebhookEvent
├── Push { ref, commits, project }
├── MergeRequest { action, mr, project }
├── Pipeline { status, pipeline, project }
├── Job { status, job, project }
├── Issue { action, issue, project }
├── Note { note, noteable_type, project }
└── TagPush { ref, project }

MergeRequestAction
├── Open
├── Close
├── Reopen
├── Update
├── Approved
├── Unapproved
├── Merge
└── UpdateAwardEmoji
```

---

## 7. Integration Points

### 7.1 Shared Primitives

| Primitive | Usage |
|-----------|-------|
| Authentication | OAuth2/PAT token provider |
| Logging | Structured request/response logging |
| Metrics | Request counts, latencies, errors |
| Retry | Exponential backoff with jitter |

### 7.2 Platform Integration

| Integration | Purpose |
|-------------|---------|
| Vector Memory | Index code for semantic search |
| Workflow Engine | Trigger on pipeline/MR events |
| Code Analysis | Process diff content |
| Notification | Alert on pipeline failures |

---

## 8. Security Considerations

### 8.1 Authentication

- Personal Access Token (PAT) with scoped permissions
- OAuth2 for user-delegated access
- Token stored as SecretString with zeroization

### 8.2 Authorization Scopes

| Scope | Operations |
|-------|------------|
| read_api | Read projects, MRs, pipelines |
| api | Full API access |
| read_repository | Read repo files |
| write_repository | Push files |

### 8.3 Webhook Security

| Method | Description |
|--------|-------------|
| Secret Token | X-Gitlab-Token header validation |
| IP Allowlist | Optional GitLab IP ranges |
| TLS | HTTPS required |

### 8.4 Data Protection

| Concern | Mitigation |
|---------|------------|
| Token exposure | SecretString, no logging |
| Code leakage | Scoped project access |
| Secret variables | Never log pipeline vars |
| Artifact content | Stream, don't cache |

---

## 9. Constraints

### 9.1 Technical Constraints

| Constraint | Description |
|------------|-------------|
| TC-001 | GitLab API v4 |
| TC-002 | Rate limits vary by tier |
| TC-003 | Pagination max 100 per page |
| TC-004 | File size limit 10MB via API |
| TC-005 | Job log limit 16MB |

### 9.2 Design Constraints

| Constraint | Description |
|------------|-------------|
| DC-001 | Thin adapter only |
| DC-002 | No repository hosting |
| DC-003 | No runner management |
| DC-004 | Uses shared auth primitives |
| DC-005 | No cross-module dependencies |

### 9.3 API Limitations

| Limitation | Workaround |
|------------|------------|
| Large file operations | Use Git LFS/CLI |
| Binary file handling | Base64 encoding |
| Real-time logs | Polling with offset |
| Search limits | Batch operations |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-GITLAB-SPEC-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Specification Document**

*Proceed to Pseudocode phase upon approval.*
