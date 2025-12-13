# Specification: Notion Integration Module

## SPARC Phase 1: Specification

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/notion`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Goals and Non-Goals](#2-goals-and-non-goals)
3. [Notion API Overview](#3-notion-api-overview)
4. [Functional Requirements](#4-functional-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [Data Models](#6-data-models)
7. [Integration Points](#7-integration-points)
8. [Security Considerations](#8-security-considerations)
9. [Constraints](#9-constraints)

---

## 1. Overview

### 1.1 Purpose

This module provides a thin adapter layer connecting the LLM Dev Ops platform to Notion for knowledge management, structured content, configuration records, and collaborative documentation workflows via the Notion API.

### 1.2 Scope

```
┌─────────────────────────────────────────────────────────────────┐
│                    NOTION INTEGRATION SCOPE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  IN SCOPE:                                                       │
│  ├── Page Operations (CRUD, content blocks)                     │
│  ├── Database Operations (query, create entries)                │
│  ├── Block Operations (read, append, update, delete)            │
│  ├── Property Handling (all property types)                     │
│  ├── Search (workspace-wide, filtered)                          │
│  ├── User/Bot Info (read-only)                                  │
│  ├── Comments (read, create)                                    │
│  └── Simulation Layer (record/replay)                           │
│                                                                  │
│  OUT OF SCOPE:                                                   │
│  ├── Workspace creation/management                              │
│  ├── Database schema management                                 │
│  ├── Permission/sharing management                              │
│  ├── OAuth flow implementation (uses shared auth)               │
│  ├── File upload/hosting                                        │
│  └── Real-time collaboration/webhooks                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Goals and Non-Goals

### 2.1 Goals

| ID | Goal |
|----|------|
| G1 | Enable page CRUD with rich block content |
| G2 | Support database queries with filters and sorts |
| G3 | Handle all Notion property types |
| G4 | Provide workspace-wide search |
| G5 | Enable simulation/replay for CI/CD |
| G6 | Integrate with shared authentication |
| G7 | Support enterprise-scale content workflows |

### 2.2 Non-Goals

| ID | Non-Goal | Rationale |
|----|----------|-----------|
| NG1 | Workspace provisioning | Infrastructure management |
| NG2 | Schema migrations | Database administration |
| NG3 | Permission management | Security administration |
| NG4 | Real-time sync | Complexity, not thin adapter |
| NG5 | File hosting | Use dedicated storage integrations |

---

## 3. Notion API Overview

### 3.1 API Characteristics

| Aspect | Detail |
|--------|--------|
| Base URL | `https://api.notion.com/v1` |
| Auth | Bearer token (Integration or OAuth) |
| Version Header | `Notion-Version: 2022-06-28` |
| Format | JSON |
| Rate Limit | 3 requests/second average |

### 3.2 Core Resources

| Resource | Endpoints |
|----------|-----------|
| Pages | `/pages`, `/pages/{id}` |
| Databases | `/databases`, `/databases/{id}/query` |
| Blocks | `/blocks/{id}`, `/blocks/{id}/children` |
| Users | `/users`, `/users/{id}`, `/users/me` |
| Search | `/search` |
| Comments | `/comments` |

### 3.3 Rate Limiting

| Limit Type | Value | Behavior |
|------------|-------|----------|
| Average | 3 req/sec | Sustained rate |
| Burst | Higher | Short bursts allowed |
| Retry-After | Header | Honor on 429 |

---

## 4. Functional Requirements

### 4.1 Page Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-PAGE-001 | Create page in parent (page/database) | P0 |
| FR-PAGE-002 | Retrieve page with properties | P0 |
| FR-PAGE-003 | Update page properties | P0 |
| FR-PAGE-004 | Archive page (soft delete) | P1 |
| FR-PAGE-005 | Restore archived page | P2 |

### 4.2 Database Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-DB-001 | Query database with filters | P0 |
| FR-DB-002 | Query with sorts | P0 |
| FR-DB-003 | Query with pagination | P0 |
| FR-DB-004 | Retrieve database schema | P0 |
| FR-DB-005 | Create database entry (page) | P0 |

### 4.3 Block Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-BLK-001 | Retrieve block | P0 |
| FR-BLK-002 | Retrieve block children (paginated) | P0 |
| FR-BLK-003 | Append block children | P0 |
| FR-BLK-004 | Update block | P1 |
| FR-BLK-005 | Delete block | P1 |
| FR-BLK-006 | Retrieve all nested blocks (recursive) | P1 |

### 4.4 Search Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-SEARCH-001 | Search workspace by query | P0 |
| FR-SEARCH-002 | Filter by object type (page/database) | P0 |
| FR-SEARCH-003 | Paginated results | P0 |

### 4.5 Property Handling

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-PROP-001 | Title property | P0 |
| FR-PROP-002 | Rich text property | P0 |
| FR-PROP-003 | Number property | P0 |
| FR-PROP-004 | Select/Multi-select | P0 |
| FR-PROP-005 | Date property | P0 |
| FR-PROP-006 | Checkbox property | P0 |
| FR-PROP-007 | URL property | P1 |
| FR-PROP-008 | Email property | P1 |
| FR-PROP-009 | Phone property | P1 |
| FR-PROP-010 | Relation property | P1 |
| FR-PROP-011 | Rollup property (read-only) | P2 |
| FR-PROP-012 | Formula property (read-only) | P2 |
| FR-PROP-013 | People property | P1 |
| FR-PROP-014 | Files property (references only) | P2 |
| FR-PROP-015 | Status property | P1 |

### 4.6 User Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-USER-001 | Get current bot user | P0 |
| FR-USER-002 | List workspace users | P1 |
| FR-USER-003 | Retrieve user by ID | P1 |

### 4.7 Comment Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-CMT-001 | List comments on page/block | P1 |
| FR-CMT-002 | Create comment | P1 |

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
| NFR-PERF-001 | Page retrieve p99 | <500ms |
| NFR-PERF-002 | Database query p99 | <1s |
| NFR-PERF-003 | Block append p99 | <500ms |
| NFR-PERF-004 | Search p99 | <1s |

### 5.2 Reliability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-REL-001 | Retry on 5xx | 3 attempts |
| NFR-REL-002 | Retry on 429 | Honor Retry-After |
| NFR-REL-003 | Exponential backoff | 1s, 2s, 4s |
| NFR-REL-004 | Request timeout | 30s |

### 5.3 Security

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-SEC-001 | TLS required | HTTPS only |
| NFR-SEC-002 | Token handling | SecretString |
| NFR-SEC-003 | No token logging | Redacted |
| NFR-SEC-004 | Input validation | All inputs |

---

## 6. Data Models

### 6.1 Core Types

```
PageRef
├── Id(String)         // UUID
└── Url(String)        // notion.so URL → extract ID

DatabaseRef
├── Id(String)         // UUID
└── Url(String)        // notion.so URL → extract ID

BlockRef
└── Id(String)         // UUID

ParentRef
├── Page(PageRef)
├── Database(DatabaseRef)
├── Block(BlockRef)
└── Workspace
```

### 6.2 Block Types

```
BlockType
├── Paragraph { rich_text }
├── Heading1 { rich_text }
├── Heading2 { rich_text }
├── Heading3 { rich_text }
├── BulletedListItem { rich_text, children? }
├── NumberedListItem { rich_text, children? }
├── ToDo { rich_text, checked }
├── Toggle { rich_text, children? }
├── Code { rich_text, language }
├── Quote { rich_text }
├── Callout { rich_text, icon }
├── Divider
├── TableOfContents
├── Bookmark { url, caption }
├── Image { file_or_external }
├── Video { file_or_external }
├── Embed { url }
├── Table { table_width, children }
├── TableRow { cells }
└── ChildPage { title }
```

### 6.3 Property Types

```
PropertyValue
├── Title(Vec<RichText>)
├── RichText(Vec<RichText>)
├── Number(Option<f64>)
├── Select(Option<SelectOption>)
├── MultiSelect(Vec<SelectOption>)
├── Date(Option<DateValue>)
├── Checkbox(bool)
├── Url(Option<String>)
├── Email(Option<String>)
├── Phone(Option<String>)
├── Relation(Vec<PageRef>)
├── Rollup(RollupValue)      // Read-only
├── Formula(FormulaValue)    // Read-only
├── People(Vec<UserRef>)
├── Files(Vec<FileRef>)
├── Status(Option<StatusOption>)
├── CreatedTime(DateTime)    // Read-only
├── LastEditedTime(DateTime) // Read-only
├── CreatedBy(UserRef)       // Read-only
└── LastEditedBy(UserRef)    // Read-only
```

### 6.4 Filter Types

```
Filter
├── Property { property, condition }
├── And(Vec<Filter>)
├── Or(Vec<Filter>)
└── Timestamp { timestamp, condition }

PropertyCondition (by type)
├── Text: equals, contains, starts_with, ends_with, is_empty
├── Number: equals, greater_than, less_than, etc.
├── Checkbox: equals
├── Select: equals, is_empty
├── Date: equals, before, after, on_or_before, etc.
└── Relation: contains, is_empty
```

---

## 7. Integration Points

### 7.1 Shared Primitives

| Primitive | Usage |
|-----------|-------|
| Authentication | OAuth2 token provider |
| Logging | Structured request/response logging |
| Metrics | Request counts, latencies, errors |
| Retry | Exponential backoff with jitter |

### 7.2 Platform Integration

| Integration | Purpose |
|-------------|---------|
| Vector Memory | Index page content for RAG |
| Knowledge Base | Store documentation references |
| Config Store | Read configuration records |
| Workflow Engine | Trigger on content updates |

---

## 8. Security Considerations

### 8.1 Authentication

- Uses shared OAuth2 integration token
- Supports internal integration tokens
- Token stored as SecretString with zeroization

### 8.2 Authorization Scopes

| Scope | Operations |
|-------|------------|
| Read content | Pages, databases, blocks |
| Update content | Create, update pages/blocks |
| Read comments | List comments |
| Insert comments | Create comments |
| Read user info | User details |

### 8.3 Data Protection

| Concern | Mitigation |
|---------|------------|
| Token exposure | SecretString, no logging |
| Content leakage | Scoped access only |
| Input injection | Validate all inputs |
| Rate abuse | Client-side rate limiting |

---

## 9. Constraints

### 9.1 Technical Constraints

| Constraint | Description |
|------------|-------------|
| TC-001 | Notion API version 2022-06-28 |
| TC-002 | 3 req/sec rate limit |
| TC-003 | 100 block children per append |
| TC-004 | 2000 char limit per rich text |
| TC-005 | Pagination max 100 results |

### 9.2 Design Constraints

| Constraint | Description |
|------------|-------------|
| DC-001 | Thin adapter only |
| DC-002 | No workspace management |
| DC-003 | No schema migrations |
| DC-004 | Uses shared auth primitives |
| DC-005 | No cross-module dependencies |

### 9.3 API Limitations

| Limitation | Workaround |
|------------|------------|
| No batch operations | Sequential with rate limiting |
| No webhooks in API | Polling-based updates |
| Read-only formulas | Accept computed values |
| File upload via URL | Reference external files |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-NOTION-SPEC-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Specification Document**

*Proceed to Pseudocode phase upon approval.*
