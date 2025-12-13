# Specification: Jenkins Integration Module

## SPARC Phase 1: Specification

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/jenkins`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Goals and Non-Goals](#2-goals-and-non-goals)
3. [Jenkins API Overview](#3-jenkins-api-overview)
4. [Functional Requirements](#4-functional-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [Data Models](#6-data-models)
7. [Integration Points](#7-integration-points)
8. [Security Considerations](#8-security-considerations)
9. [Constraints](#9-constraints)

---

## 1. Overview

### 1.1 Purpose

This module provides a thin adapter layer connecting the LLM Dev Ops platform to Jenkins for CI/CD automation, enabling job triggering, pipeline monitoring, build status tracking, and artifact awareness via the Jenkins REST API.

### 1.2 Scope

```
┌─────────────────────────────────────────────────────────────────┐
│                    JENKINS INTEGRATION SCOPE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  IN SCOPE:                                                       │
│  ├── Job Operations (trigger, status, abort)                    │
│  ├── Build Operations (info, logs, parameters)                  │
│  ├── Pipeline Operations (stages, nodes, steps)                 │
│  ├── Queue Operations (status, cancel)                          │
│  ├── Artifact Operations (list, download metadata)              │
│  ├── Folder Navigation (list jobs, nested folders)              │
│  ├── View Operations (list jobs in view)                        │
│  ├── Crumb/CSRF Support (automatic handling)                    │
│  └── Simulation Layer (record/replay)                           │
│                                                                  │
│  OUT OF SCOPE:                                                   │
│  ├── Jenkins server provisioning                                │
│  ├── Plugin installation/management                             │
│  ├── Node/agent management                                      │
│  ├── Credential management                                      │
│  ├── User/permission management                                 │
│  ├── Job/pipeline definition (Jenkinsfile)                      │
│  └── Jenkins configuration (system settings)                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Goals and Non-Goals

### 2.1 Goals

| ID | Goal |
|----|------|
| G1 | Trigger jobs and pipelines with parameters |
| G2 | Monitor build status and progress |
| G3 | Stream build console output |
| G4 | Track pipeline stage execution |
| G5 | Access build artifacts metadata |
| G6 | Navigate folder hierarchies |
| G7 | Enable simulation/replay for CI/CD |
| G8 | Support multiple Jenkins instances |

### 2.2 Non-Goals

| ID | Non-Goal | Rationale |
|----|----------|-----------|
| NG1 | Server provisioning | Infrastructure management |
| NG2 | Plugin management | Server administration |
| NG3 | Node/agent setup | Infrastructure management |
| NG4 | Credential storage | Security boundary |
| NG5 | Jenkinsfile authoring | Development activity |
| NG6 | System configuration | Server administration |

---

## 3. Jenkins API Overview

### 3.1 API Characteristics

| Aspect | Detail |
|--------|--------|
| Base URL | `https://jenkins.example.com` |
| Auth | Basic Auth (user + API token) |
| Format | JSON (via `/api/json`) |
| CSRF | Crumb token required for mutations |
| Rate Limit | No built-in limits (server-dependent) |

### 3.2 Core Resources

| Resource | Endpoints |
|----------|-----------|
| Jobs | `/job/{name}/api/json` |
| Builds | `/job/{name}/{number}/api/json` |
| Queue | `/queue/api/json`, `/queue/item/{id}/api/json` |
| Pipelines | `/job/{name}/{number}/wfapi/describe` |
| Artifacts | `/job/{name}/{number}/artifact/*` |
| Console | `/job/{name}/{number}/consoleText` |
| Crumb | `/crumbIssuer/api/json` |

### 3.3 Authentication Methods

| Method | Usage |
|--------|-------|
| Basic Auth | Username + API Token |
| API Token | Per-user generated token |
| SSO/LDAP | Via shared auth integration |

### 3.4 Crumb/CSRF Handling

```
1. GET /crumbIssuer/api/json
   Response: { "crumbRequestField": "Jenkins-Crumb", "crumb": "abc123" }

2. Include header in POST/DELETE requests:
   Jenkins-Crumb: abc123
```

---

## 4. Functional Requirements

### 4.1 Job Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-JOB-001 | Get job details | P0 |
| FR-JOB-002 | List jobs in folder/view | P0 |
| FR-JOB-003 | Trigger build (no params) | P0 |
| FR-JOB-004 | Trigger build (with params) | P0 |
| FR-JOB-005 | Get job configuration | P1 |
| FR-JOB-006 | Check if job exists | P0 |
| FR-JOB-007 | Get job health report | P1 |
| FR-JOB-008 | Enable/disable job | P1 |

### 4.2 Build Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-BUILD-001 | Get build details | P0 |
| FR-BUILD-002 | Get build status | P0 |
| FR-BUILD-003 | Get build parameters | P0 |
| FR-BUILD-004 | Get console output (full) | P0 |
| FR-BUILD-005 | Stream console output | P0 |
| FR-BUILD-006 | Abort build | P0 |
| FR-BUILD-007 | Get last build | P0 |
| FR-BUILD-008 | Get last successful build | P1 |
| FR-BUILD-009 | Get last failed build | P1 |
| FR-BUILD-010 | List recent builds | P0 |

### 4.3 Pipeline Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-PIPE-001 | Get pipeline description | P0 |
| FR-PIPE-002 | List pipeline stages | P0 |
| FR-PIPE-003 | Get stage status | P0 |
| FR-PIPE-004 | Get stage logs | P1 |
| FR-PIPE-005 | List pipeline nodes | P1 |
| FR-PIPE-006 | Get node steps | P2 |
| FR-PIPE-007 | Input step handling | P1 |

### 4.4 Queue Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-QUEUE-001 | Get queue item status | P0 |
| FR-QUEUE-002 | Cancel queued item | P0 |
| FR-QUEUE-003 | List queue items | P1 |
| FR-QUEUE-004 | Wait for queue to build | P0 |

### 4.5 Artifact Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-ART-001 | List build artifacts | P0 |
| FR-ART-002 | Get artifact metadata | P0 |
| FR-ART-003 | Download artifact | P1 |
| FR-ART-004 | Get fingerprint | P2 |

### 4.6 Navigation Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-NAV-001 | List root jobs | P0 |
| FR-NAV-002 | List folder contents | P0 |
| FR-NAV-003 | List view jobs | P1 |
| FR-NAV-004 | Get folder details | P1 |
| FR-NAV-005 | Resolve job path | P0 |

### 4.7 Simulation

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
| NFR-PERF-001 | Job trigger p99 | <1s |
| NFR-PERF-002 | Build status p99 | <500ms |
| NFR-PERF-003 | Console streaming | Real-time |
| NFR-PERF-004 | Artifact list p99 | <500ms |

### 5.2 Reliability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-REL-001 | Retry on 5xx | 3 attempts |
| NFR-REL-002 | Retry on connection errors | 3 attempts |
| NFR-REL-003 | Exponential backoff | 1s, 2s, 4s |
| NFR-REL-004 | Request timeout | 30s (300s for logs) |
| NFR-REL-005 | Crumb refresh on 403 | Auto-retry |

### 5.3 Security

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-SEC-001 | TLS required | HTTPS only |
| NFR-SEC-002 | Token handling | SecretString |
| NFR-SEC-003 | No token logging | Redacted |
| NFR-SEC-004 | Crumb caching | Per-session |

---

## 6. Data Models

### 6.1 Core Types

```
JobRef
├── Simple(String)           // "my-job"
├── Folder(Vec<String>)      // ["folder", "subfolder", "job"]
└── Url(String)              // Full Jenkins URL

BuildRef
├── Number(u64)              // Specific build number
├── Last                     // Last build
├── LastSuccessful           // Last successful
├── LastFailed               // Last failed
├── LastStable               // Last stable
└── LastUnstable             // Last unstable

QueueRef
└── Id(u64)                  // Queue item ID
```

### 6.2 Build Status

```
BuildResult
├── Success
├── Unstable
├── Failure
├── NotBuilt
├── Aborted
└── Unknown(String)

BuildStatus
├── Building
├── Queued
├── Completed(BuildResult)
└── Unknown
```

### 6.3 Pipeline Types

```
PipelineRun
├── id: String
├── name: String
├── status: PipelineStatus
├── start_time: DateTime
├── duration: Duration
├── stages: Vec<Stage>
└── end_time: Option<DateTime>

Stage
├── id: String
├── name: String
├── status: StageStatus
├── start_time: DateTime
├── duration: Duration
└── steps: Vec<Step>

StageStatus
├── Success
├── Failed
├── Aborted
├── InProgress
├── NotRun
├── Paused
└── Unknown
```

### 6.4 Artifact Types

```
Artifact
├── file_name: String
├── relative_path: String
├── size: Option<u64>
└── fingerprint: Option<String>

ArtifactList
├── artifacts: Vec<Artifact>
└── build_ref: BuildRef
```

### 6.5 Queue Types

```
QueueItem
├── id: u64
├── task: QueueTask
├── why: Option<String>
├── blocked: bool
├── buildable: bool
├── stuck: bool
├── executable: Option<BuildRef>
└── in_queue_since: DateTime

QueueTask
├── name: String
├── url: String
└── color: Option<String>
```

---

## 7. Integration Points

### 7.1 Shared Primitives

| Primitive | Usage |
|-----------|-------|
| Authentication | Basic Auth token provider |
| Logging | Structured request/response logging |
| Metrics | Request counts, latencies, errors |
| Retry | Exponential backoff with jitter |

### 7.2 Platform Integration

| Integration | Purpose |
|-------------|---------|
| Vector Memory | Index build logs for search |
| Workflow Engine | Trigger on build completion |
| Notification | Alert on build failures |
| Artifact Store | Reference artifacts for analysis |

---

## 8. Security Considerations

### 8.1 Authentication

- Basic Auth with API token (not password)
- Token stored as SecretString with zeroization
- Support for SSO via shared auth integration

### 8.2 Authorization

| Permission | Operations |
|------------|------------|
| Job/Read | Get job/build info |
| Job/Build | Trigger builds |
| Job/Cancel | Abort builds |
| Job/Configure | Enable/disable |
| Run/Update | Input step response |

### 8.3 CSRF Protection

| Aspect | Handling |
|--------|----------|
| Crumb fetch | On first mutation |
| Crumb cache | Per-session |
| Crumb refresh | On 403 response |
| Header name | From crumbRequestField |

### 8.4 Data Protection

| Concern | Mitigation |
|---------|------------|
| Token exposure | SecretString, no logging |
| Build parameters | Redact secrets |
| Console output | May contain secrets |
| Credentials | Never access directly |

---

## 9. Constraints

### 9.1 Technical Constraints

| Constraint | Description |
|------------|-------------|
| TC-001 | Jenkins REST API (no native client) |
| TC-002 | CSRF protection mandatory |
| TC-003 | No pagination on most endpoints |
| TC-004 | Console output can be very large |
| TC-005 | Queue-to-build transition async |

### 9.2 Design Constraints

| Constraint | Description |
|------------|-------------|
| DC-001 | Thin adapter only |
| DC-002 | No server provisioning |
| DC-003 | No plugin management |
| DC-004 | Uses shared auth primitives |
| DC-005 | No cross-module dependencies |

### 9.3 API Limitations

| Limitation | Workaround |
|------------|------------|
| No real-time events | Polling with progressive intervals |
| Large console logs | Streaming with offset |
| Queue item expiry | Poll until executable |
| No batch operations | Sequential with rate limiting |
| Folder path encoding | URL-encode each segment |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-JENKINS-SPEC-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Specification Document**

*Proceed to Pseudocode phase upon approval.*
