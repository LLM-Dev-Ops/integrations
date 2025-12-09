# Google Gmail Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/google-gmail`

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
11. [Future-Proofing](#11-future-proofing)
12. [Acceptance Criteria](#12-acceptance-criteria)

---

## 1. Overview

### 1.1 Document Purpose

This specification defines the requirements, interfaces, and constraints for the Google Gmail Integration Module within the LLM-Dev-Ops Integration Repository. It serves as the authoritative source for what the module must accomplish when interacting with the Gmail REST API (v1).

### 1.2 Audience

- Implementation developers (Rust and TypeScript)
- QA engineers designing test strategies
- Architects reviewing integration patterns
- Security reviewers assessing credential and OAuth handling
- DevOps engineers integrating Gmail functionality into workflows

### 1.3 Methodology

This specification follows:
- **SPARC Methodology**: Specification → Pseudocode → Architecture → Refinement → Completion
- **London-School TDD**: Interface-first design enabling mock-based testing
- **SOLID Principles**: Clean, maintainable, extensible design

### 1.4 Gmail API Overview

The Gmail API provides programmatic access to Gmail mailboxes. The API uses:
- **RESTful HTTP/JSON**: Standard REST conventions with JSON payloads
- **OAuth 2.0**: Authentication and authorization via Google OAuth 2.0
- **Batch Requests**: Support for batching multiple API calls into a single HTTP request
- **Push Notifications**: Real-time notifications via Google Cloud Pub/Sub

This module focuses on comprehensive Gmail API integration including message management, label management, drafts, threads, settings, and push notifications.

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The Google Gmail Integration Module provides a production-ready, type-safe interface for interacting with Google's Gmail REST API (v1). It abstracts HTTP communication, handles OAuth 2.0 authentication (service accounts, user credentials, and application default credentials), manages resilience patterns, and provides comprehensive observability—all while maintaining clean dependency boundaries.

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Message Operations** | Type-safe wrappers for Gmail message CRUD operations |
| **Thread Management** | Thread listing, retrieval, modification, and deletion |
| **Label Management** | Label CRUD operations including system and custom labels |
| **Draft Management** | Draft creation, update, send, and delete operations |
| **Attachment Handling** | Attachment upload, download, and streaming for large files |
| **History & Sync** | History tracking for efficient mailbox synchronization |
| **Settings Management** | User settings, filters, forwarding, vacation responder |
| **Push Notifications** | Pub/Sub watch setup for real-time mailbox notifications |
| **OAuth 2.0 Integration** | Service account, user credentials, token refresh |
| **Transport** | HTTPS communication with connection pooling |
| **Batch Requests** | Efficient batching of multiple API calls |
| **MIME Handling** | RFC 2822 message construction and parsing |
| **Resilience Integration** | Hooks for retry, circuit breaker, and rate limiting primitives |
| **Observability** | Tracing spans, metrics emission, structured logging |
| **Error Mapping** | Translation of API errors to typed domain errors |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Messages API | list, get, insert, send, modify, delete, trash, untrash, batchModify, batchDelete, import |
| Threads API | list, get, modify, delete, trash, untrash |
| Labels API | list, get, create, update, patch, delete |
| Drafts API | list, get, create, update, send, delete |
| History API | list (for efficient sync) |
| Settings API | getAutoForwarding, updateAutoForwarding, filters (CRUD), forwardingAddresses, IMAP/POP settings, language, vacation, sendAs, delegates |
| Users API | getProfile, stop (stop push notifications), watch (start push notifications) |
| Attachments | Upload, download, streaming for large attachments |
| Batch Requests | Batch multiple operations in single HTTP call |
| Push Notifications | Cloud Pub/Sub watch management |
| MIME Construction | RFC 2822 message building with attachments |
| OAuth 2.0 | Service accounts, user credentials, ADC, token refresh |
| Dual Language | Rust (primary) and TypeScript implementations |

#### Out of Scope

| Item | Reason |
|------|--------|
| Other Google services | Separate integration modules (Drive, Calendar, etc.) |
| ruvbase (Layer 0) | External dependency, not implemented here |
| Gmail Add-ons | Add-on framework, separate concern |
| Google Chat | Separate API and integration |
| Google Meet | Separate API and integration |
| Gmail UI customization | Browser extension concern |
| IMAP/SMTP direct access | Use Gmail API, not protocols |
| Gmail offline access | Client-side concern |
| Google Workspace Admin SDK | Separate administrative API |
| Full Pub/Sub management | Use only for Gmail watch; full Pub/Sub is separate module |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| No direct HTTP client dependency exposure | Encapsulation, testability |
| Async-first design | I/O-bound operations, efficiency |
| Zero `unsafe` in public API (Rust) | Safety guarantees |
| No panics in production paths | Reliability |
| Trait-based abstractions | London-School TDD, mockability |
| Semantic versioning | API stability |
| OAuth 2.0 compliance | Google API requirement |
| RFC 2822 compliance | Email format standard |
| Base64url encoding for message data | Gmail API requirement |
| Respect quota limits | Avoid abuse, maintain access |

---

## 3. Dependency Policy

### 3.1 Allowed Dependencies

The module may depend ONLY on the following Integration Repo primitives:

| Primitive | Purpose | Import Path |
|-----------|---------|-------------|
| `integrations-errors` | Base error types and traits | `integrations_errors` |
| `integrations-retry` | Retry executor with backoff strategies | `integrations_retry` |
| `integrations-circuit-breaker` | Circuit breaker state machine | `integrations_circuit_breaker` |
| `integrations-rate-limit` | Rate limiting (token bucket, sliding window) | `integrations_rate_limit` |
| `integrations-tracing` | Distributed tracing abstraction | `integrations_tracing` |
| `integrations-logging` | Structured logging abstraction | `integrations_logging` |
| `integrations-types` | Shared type definitions | `integrations_types` |
| `integrations-config` | Configuration management | `integrations_config` |

### 3.2 External Dependencies (Rust)

| Crate | Version | Purpose |
|-------|---------|---------|
| `tokio` | 1.x | Async runtime |
| `reqwest` | 0.12+ | HTTP client (behind transport trait) |
| `serde` | 1.x | Serialization |
| `serde_json` | 1.x | JSON handling |
| `async-trait` | 0.1+ | Async trait support |
| `thiserror` | 1.x | Error derivation |
| `secrecy` | 0.8+ | Secret string handling |
| `url` | 2.x | URL parsing |
| `bytes` | 1.x | Byte buffer handling |
| `futures` | 0.3+ | Stream utilities |
| `chrono` | 0.4+ | Date/time handling |
| `base64` | 0.22+ | Base64/Base64url encoding for message data |
| `jsonwebtoken` | 9.x | JWT handling for service accounts |
| `mailparse` | 0.14+ | RFC 2822 message parsing |
| `lettre` | 0.11+ | MIME message construction (optional) |
| `mime` | 0.3+ | MIME type handling |
| `uuid` | 1.x | Message ID generation |

### 3.3 External Dependencies (TypeScript)

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | 5.x | Language |
| `node-fetch` / native fetch | Latest | HTTP client |
| `zod` | 3.x | Runtime type validation |
| `jose` | 5.x | JWT handling for service accounts |
| `mailparser` | 3.x | RFC 2822 message parsing |
| `nodemailer` | 6.x | MIME message construction |
| `mime-types` | 2.x | MIME type handling |
| `uuid` | 9.x | Message ID generation |

### 3.4 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `ruvbase` | Layer 0, external to this module |
| `googleapis` | This module IS the Gmail integration |
| `@google-cloud/gmail` | This module IS the Gmail integration |
| `integrations-openai` | No cross-integration dependencies |
| `integrations-anthropic` | No cross-integration dependencies |
| `integrations-aws-s3` | No cross-integration dependencies |
| `integrations-gdrive` | No cross-integration dependencies |
| Any LLM-specific crate | This module is email integration only |

---

## 4. API Coverage

### 4.1 Messages API

Primary API for managing Gmail messages.

#### 4.1.1 List Messages

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /gmail/v1/users/{userId}/messages` |
| Authentication | OAuth 2.0 |
| Response Format | JSON |
| Pagination | Page token based |
| Max Results | 500 per page |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User email or "me" for authenticated user |
| `maxResults` | integer | No | Max messages per page (1-500, default 100) |
| `pageToken` | string | No | Pagination token |
| `q` | string | No | Gmail search query (same as web UI) |
| `labelIds` | array | No | Filter by label IDs |
| `includeSpamTrash` | boolean | No | Include spam/trash (default false) |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `messages` | array | List of message objects with id and threadId |
| `nextPageToken` | string | Token for next page (if more results) |
| `resultSizeEstimate` | integer | Estimated total messages |

#### 4.1.2 Get Message

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /gmail/v1/users/{userId}/messages/{id}` |
| Authentication | OAuth 2.0 |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User email or "me" |
| `id` | string | Yes | Message ID |
| `format` | enum | No | `minimal`, `full`, `raw`, `metadata` (default `full`) |
| `metadataHeaders` | array | No | Headers to include when format=metadata |

**Response Fields (full format):**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Message ID |
| `threadId` | string | Thread ID |
| `labelIds` | array | Applied label IDs |
| `snippet` | string | Short text snippet |
| `historyId` | string | History ID for sync |
| `internalDate` | string | Unix timestamp (ms) of internal date |
| `payload` | object | Message payload (headers, body, parts) |
| `sizeEstimate` | integer | Estimated size in bytes |
| `raw` | string | Base64url encoded RFC 2822 message (if format=raw) |

**Payload Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `partId` | string | Part identifier |
| `mimeType` | string | MIME type |
| `filename` | string | Filename for attachments |
| `headers` | array | Header name/value pairs |
| `body` | object | Body data and attachment info |
| `parts` | array | Child MIME parts (multipart messages) |

#### 4.1.3 Send Message

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /gmail/v1/users/{userId}/messages/send` |
| Authentication | OAuth 2.0 |
| Request Format | JSON with raw message or multipart upload |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User email or "me" |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `raw` | string | Yes | Base64url encoded RFC 2822 message |
| `threadId` | string | No | Thread to reply to |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Sent message ID |
| `threadId` | string | Thread ID |
| `labelIds` | array | Applied labels (includes SENT) |

#### 4.1.4 Insert Message

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /gmail/v1/users/{userId}/messages` |
| Authentication | OAuth 2.0 |
| Request Format | JSON or multipart upload |
| Response Format | JSON |
| Use Case | Insert message directly into mailbox (no sending) |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User email or "me" |
| `internalDateSource` | enum | No | `receivedTime` or `dateHeader` |
| `deleted` | boolean | No | Mark as deleted immediately |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `raw` | string | Yes | Base64url encoded RFC 2822 message |
| `labelIds` | array | No | Labels to apply |
| `threadId` | string | No | Thread to add message to |

#### 4.1.5 Modify Message

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /gmail/v1/users/{userId}/messages/{id}/modify` |
| Authentication | OAuth 2.0 |
| Request Format | JSON |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User email or "me" |
| `id` | string | Yes | Message ID |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `addLabelIds` | array | No | Labels to add |
| `removeLabelIds` | array | No | Labels to remove |

**Response Fields:**

Same as Get Message response.

#### 4.1.6 Delete Message

| Attribute | Value |
|-----------|-------|
| Endpoint | `DELETE /gmail/v1/users/{userId}/messages/{id}` |
| Authentication | OAuth 2.0 |
| Response Format | Empty (204 No Content) |
| Warning | Permanently deletes, bypasses trash |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User email or "me" |
| `id` | string | Yes | Message ID |

#### 4.1.7 Trash Message

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /gmail/v1/users/{userId}/messages/{id}/trash` |
| Authentication | OAuth 2.0 |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User email or "me" |
| `id` | string | Yes | Message ID |

**Response Fields:**

Same as Get Message response (with TRASH label added).

#### 4.1.8 Untrash Message

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /gmail/v1/users/{userId}/messages/{id}/untrash` |
| Authentication | OAuth 2.0 |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User email or "me" |
| `id` | string | Yes | Message ID |

**Response Fields:**

Same as Get Message response (with TRASH label removed).

#### 4.1.9 Batch Modify Messages

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /gmail/v1/users/{userId}/messages/batchModify` |
| Authentication | OAuth 2.0 |
| Request Format | JSON |
| Response Format | Empty (204 No Content) |
| Max Messages | 1000 per request |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ids` | array | Yes | Message IDs to modify |
| `addLabelIds` | array | No | Labels to add |
| `removeLabelIds` | array | No | Labels to remove |

#### 4.1.10 Batch Delete Messages

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /gmail/v1/users/{userId}/messages/batchDelete` |
| Authentication | OAuth 2.0 |
| Request Format | JSON |
| Response Format | Empty (204 No Content) |
| Max Messages | 1000 per request |
| Warning | Permanently deletes, bypasses trash |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ids` | array | Yes | Message IDs to delete |

#### 4.1.11 Import Message

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /gmail/v1/users/{userId}/messages/import` |
| Authentication | OAuth 2.0 |
| Request Format | JSON or multipart upload |
| Response Format | JSON |
| Use Case | Import from external source, processes SPF/DKIM |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User email or "me" |
| `internalDateSource` | enum | No | `receivedTime` or `dateHeader` |
| `neverMarkSpam` | boolean | No | Never mark as spam |
| `processForCalendar` | boolean | No | Process calendar invites |
| `deleted` | boolean | No | Mark as deleted |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `raw` | string | Yes | Base64url encoded RFC 2822 message |
| `labelIds` | array | No | Labels to apply |
| `threadId` | string | No | Thread to add message to |

### 4.2 Threads API

Managing conversation threads.

#### 4.2.1 List Threads

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /gmail/v1/users/{userId}/threads` |
| Authentication | OAuth 2.0 |
| Response Format | JSON |
| Pagination | Page token based |
| Max Results | 500 per page |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User email or "me" |
| `maxResults` | integer | No | Max threads per page (1-500) |
| `pageToken` | string | No | Pagination token |
| `q` | string | No | Gmail search query |
| `labelIds` | array | No | Filter by label IDs |
| `includeSpamTrash` | boolean | No | Include spam/trash |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `threads` | array | Thread objects with id and snippet |
| `nextPageToken` | string | Token for next page |
| `resultSizeEstimate` | integer | Estimated total threads |

#### 4.2.2 Get Thread

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /gmail/v1/users/{userId}/threads/{id}` |
| Authentication | OAuth 2.0 |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User email or "me" |
| `id` | string | Yes | Thread ID |
| `format` | enum | No | `minimal`, `full`, `metadata` (default `full`) |
| `metadataHeaders` | array | No | Headers to include when format=metadata |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Thread ID |
| `snippet` | string | Thread snippet |
| `historyId` | string | History ID for sync |
| `messages` | array | All messages in thread |

#### 4.2.3 Modify Thread

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /gmail/v1/users/{userId}/threads/{id}/modify` |
| Authentication | OAuth 2.0 |
| Request Format | JSON |
| Response Format | JSON |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `addLabelIds` | array | No | Labels to add to all messages |
| `removeLabelIds` | array | No | Labels to remove from all messages |

#### 4.2.4 Delete Thread

| Attribute | Value |
|-----------|-------|
| Endpoint | `DELETE /gmail/v1/users/{userId}/threads/{id}` |
| Authentication | OAuth 2.0 |
| Response Format | Empty (204 No Content) |
| Warning | Permanently deletes entire thread |

#### 4.2.5 Trash Thread

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /gmail/v1/users/{userId}/threads/{id}/trash` |
| Authentication | OAuth 2.0 |
| Response Format | JSON |

#### 4.2.6 Untrash Thread

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /gmail/v1/users/{userId}/threads/{id}/untrash` |
| Authentication | OAuth 2.0 |
| Response Format | JSON |

### 4.3 Labels API

Managing Gmail labels (folders/tags).

#### 4.3.1 System Labels

| Label ID | Name | Type |
|----------|------|------|
| `INBOX` | Inbox | System |
| `SENT` | Sent | System |
| `DRAFT` | Drafts | System |
| `TRASH` | Trash | System |
| `SPAM` | Spam | System |
| `STARRED` | Starred | System |
| `IMPORTANT` | Important | System |
| `UNREAD` | Unread | System |
| `CATEGORY_PERSONAL` | Personal | Category |
| `CATEGORY_SOCIAL` | Social | Category |
| `CATEGORY_PROMOTIONS` | Promotions | Category |
| `CATEGORY_UPDATES` | Updates | Category |
| `CATEGORY_FORUMS` | Forums | Category |

#### 4.3.2 List Labels

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /gmail/v1/users/{userId}/labels` |
| Authentication | OAuth 2.0 |
| Response Format | JSON |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `labels` | array | List of label objects |

**Label Object:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Label ID |
| `name` | string | Display name |
| `type` | enum | `system` or `user` |
| `messageListVisibility` | enum | `show` or `hide` |
| `labelListVisibility` | enum | `labelShow`, `labelShowIfUnread`, `labelHide` |
| `messagesTotal` | integer | Total messages with label |
| `messagesUnread` | integer | Unread messages with label |
| `threadsTotal` | integer | Total threads with label |
| `threadsUnread` | integer | Unread threads with label |
| `color` | object | Text and background color (user labels) |

#### 4.3.3 Get Label

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /gmail/v1/users/{userId}/labels/{id}` |
| Authentication | OAuth 2.0 |
| Response Format | JSON |

#### 4.3.4 Create Label

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /gmail/v1/users/{userId}/labels` |
| Authentication | OAuth 2.0 |
| Request Format | JSON |
| Response Format | JSON |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Label display name |
| `messageListVisibility` | enum | No | `show` or `hide` |
| `labelListVisibility` | enum | No | `labelShow`, `labelShowIfUnread`, `labelHide` |
| `color` | object | No | Text and background color |

**Color Object:**

| Field | Type | Description |
|-------|------|-------------|
| `textColor` | string | Hex color for text (#RRGGBB) |
| `backgroundColor` | string | Hex color for background (#RRGGBB) |

#### 4.3.5 Update Label

| Attribute | Value |
|-----------|-------|
| Endpoint | `PUT /gmail/v1/users/{userId}/labels/{id}` |
| Authentication | OAuth 2.0 |
| Request Format | JSON |
| Response Format | JSON |

**Request Body:**

Full label object (all fields required).

#### 4.3.6 Patch Label

| Attribute | Value |
|-----------|-------|
| Endpoint | `PATCH /gmail/v1/users/{userId}/labels/{id}` |
| Authentication | OAuth 2.0 |
| Request Format | JSON |
| Response Format | JSON |

**Request Body:**

Partial label object (only fields to update).

#### 4.3.7 Delete Label

| Attribute | Value |
|-----------|-------|
| Endpoint | `DELETE /gmail/v1/users/{userId}/labels/{id}` |
| Authentication | OAuth 2.0 |
| Response Format | Empty (204 No Content) |
| Note | Cannot delete system labels |

### 4.4 Drafts API

Managing email drafts.

#### 4.4.1 List Drafts

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /gmail/v1/users/{userId}/drafts` |
| Authentication | OAuth 2.0 |
| Response Format | JSON |
| Pagination | Page token based |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User email or "me" |
| `maxResults` | integer | No | Max drafts per page |
| `pageToken` | string | No | Pagination token |
| `q` | string | No | Gmail search query |
| `includeSpamTrash` | boolean | No | Include spam/trash |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `drafts` | array | Draft objects with id and message |
| `nextPageToken` | string | Token for next page |
| `resultSizeEstimate` | integer | Estimated total drafts |

#### 4.4.2 Get Draft

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /gmail/v1/users/{userId}/drafts/{id}` |
| Authentication | OAuth 2.0 |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User email or "me" |
| `id` | string | Yes | Draft ID |
| `format` | enum | No | `minimal`, `full`, `raw`, `metadata` |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Draft ID |
| `message` | object | Underlying message object |

#### 4.4.3 Create Draft

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /gmail/v1/users/{userId}/drafts` |
| Authentication | OAuth 2.0 |
| Request Format | JSON or multipart upload |
| Response Format | JSON |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message.raw` | string | Yes | Base64url encoded RFC 2822 message |
| `message.threadId` | string | No | Thread for reply drafts |

#### 4.4.4 Update Draft

| Attribute | Value |
|-----------|-------|
| Endpoint | `PUT /gmail/v1/users/{userId}/drafts/{id}` |
| Authentication | OAuth 2.0 |
| Request Format | JSON or multipart upload |
| Response Format | JSON |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message.raw` | string | Yes | Base64url encoded RFC 2822 message |

#### 4.4.5 Send Draft

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /gmail/v1/users/{userId}/drafts/send` |
| Authentication | OAuth 2.0 |
| Request Format | JSON |
| Response Format | JSON |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Draft ID to send |

**Response Fields:**

Same as Message send response.

#### 4.4.6 Delete Draft

| Attribute | Value |
|-----------|-------|
| Endpoint | `DELETE /gmail/v1/users/{userId}/drafts/{id}` |
| Authentication | OAuth 2.0 |
| Response Format | Empty (204 No Content) |
| Note | Deletes draft and underlying message |

### 4.5 History API

Efficient mailbox synchronization.

#### 4.5.1 List History

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /gmail/v1/users/{userId}/history` |
| Authentication | OAuth 2.0 |
| Response Format | JSON |
| Pagination | Page token based |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User email or "me" |
| `startHistoryId` | string | Yes | Starting history ID |
| `maxResults` | integer | No | Max history records |
| `pageToken` | string | No | Pagination token |
| `labelId` | string | No | Filter by label |
| `historyTypes` | array | No | Filter: `messageAdded`, `messageDeleted`, `labelAdded`, `labelRemoved` |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `history` | array | History record objects |
| `nextPageToken` | string | Token for next page |
| `historyId` | string | Current history ID |

**History Record:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | History record ID |
| `messages` | array | Messages in this history record |
| `messagesAdded` | array | Messages added |
| `messagesDeleted` | array | Messages deleted |
| `labelsAdded` | array | Label additions |
| `labelsRemoved` | array | Label removals |

### 4.6 Attachments API

Managing message attachments.

#### 4.6.1 Get Attachment

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /gmail/v1/users/{userId}/messages/{messageId}/attachments/{id}` |
| Authentication | OAuth 2.0 |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User email or "me" |
| `messageId` | string | Yes | Message ID |
| `id` | string | Yes | Attachment ID |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `attachmentId` | string | Attachment ID |
| `size` | integer | Size in bytes |
| `data` | string | Base64url encoded attachment data |

### 4.7 Settings API

Managing user settings.

#### 4.7.1 Auto-Forwarding

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Get | `/gmail/v1/users/{userId}/settings/autoForwarding` | GET |
| Update | `/gmail/v1/users/{userId}/settings/autoForwarding` | PUT |

**Auto-Forwarding Settings:**

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Auto-forwarding enabled |
| `emailAddress` | string | Forwarding email address |
| `disposition` | enum | `leaveInInbox`, `archive`, `trash`, `markRead` |

#### 4.7.2 Filters

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List | `/gmail/v1/users/{userId}/settings/filters` | GET |
| Get | `/gmail/v1/users/{userId}/settings/filters/{id}` | GET |
| Create | `/gmail/v1/users/{userId}/settings/filters` | POST |
| Delete | `/gmail/v1/users/{userId}/settings/filters/{id}` | DELETE |

**Filter Object:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Filter ID |
| `criteria` | object | Match criteria |
| `action` | object | Actions to perform |

**Filter Criteria:**

| Field | Type | Description |
|-------|------|-------------|
| `from` | string | Sender match |
| `to` | string | Recipient match |
| `subject` | string | Subject match |
| `query` | string | Gmail search query |
| `negatedQuery` | string | Negated query |
| `hasAttachment` | boolean | Has attachment |
| `excludeChats` | boolean | Exclude chats |
| `size` | integer | Size threshold |
| `sizeComparison` | enum | `larger` or `smaller` |

**Filter Action:**

| Field | Type | Description |
|-------|------|-------------|
| `addLabelIds` | array | Labels to add |
| `removeLabelIds` | array | Labels to remove |
| `forward` | string | Forward to email |

#### 4.7.3 Forwarding Addresses

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List | `/gmail/v1/users/{userId}/settings/forwardingAddresses` | GET |
| Get | `/gmail/v1/users/{userId}/settings/forwardingAddresses/{forwardingEmail}` | GET |
| Create | `/gmail/v1/users/{userId}/settings/forwardingAddresses` | POST |
| Delete | `/gmail/v1/users/{userId}/settings/forwardingAddresses/{forwardingEmail}` | DELETE |

**Forwarding Address:**

| Field | Type | Description |
|-------|------|-------------|
| `forwardingEmail` | string | Email address |
| `verificationStatus` | enum | `pending`, `accepted` |

#### 4.7.4 IMAP Settings

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Get | `/gmail/v1/users/{userId}/settings/imap` | GET |
| Update | `/gmail/v1/users/{userId}/settings/imap` | PUT |

**IMAP Settings:**

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | IMAP enabled |
| `autoExpunge` | boolean | Auto-expunge |
| `expungeBehavior` | enum | `archive`, `trash`, `deleteForever` |
| `maxFolderSize` | integer | Max folder size |

#### 4.7.5 POP Settings

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Get | `/gmail/v1/users/{userId}/settings/pop` | GET |
| Update | `/gmail/v1/users/{userId}/settings/pop` | PUT |

**POP Settings:**

| Field | Type | Description |
|-------|------|-------------|
| `accessWindow` | enum | `disabled`, `fromNowOn`, `allMail` |
| `disposition` | enum | `leaveInInbox`, `archive`, `trash`, `markRead` |

#### 4.7.6 Vacation Responder

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Get | `/gmail/v1/users/{userId}/settings/vacation` | GET |
| Update | `/gmail/v1/users/{userId}/settings/vacation` | PUT |

**Vacation Settings:**

| Field | Type | Description |
|-------|------|-------------|
| `enableAutoReply` | boolean | Vacation responder enabled |
| `responseSubject` | string | Response subject |
| `responseBodyPlainText` | string | Plain text response |
| `responseBodyHtml` | string | HTML response |
| `restrictToContacts` | boolean | Only respond to contacts |
| `restrictToDomain` | boolean | Only respond within domain |
| `startTime` | string | Start timestamp (ms) |
| `endTime` | string | End timestamp (ms) |

#### 4.7.7 Language Settings

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Get | `/gmail/v1/users/{userId}/settings/language` | GET |
| Update | `/gmail/v1/users/{userId}/settings/language` | PUT |

**Language Settings:**

| Field | Type | Description |
|-------|------|-------------|
| `displayLanguage` | string | Display language code (e.g., "en") |

#### 4.7.8 Send-As Settings

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List | `/gmail/v1/users/{userId}/settings/sendAs` | GET |
| Get | `/gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail}` | GET |
| Create | `/gmail/v1/users/{userId}/settings/sendAs` | POST |
| Update | `/gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail}` | PUT |
| Patch | `/gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail}` | PATCH |
| Delete | `/gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail}` | DELETE |
| Verify | `/gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail}/verify` | POST |

**Send-As Settings:**

| Field | Type | Description |
|-------|------|-------------|
| `sendAsEmail` | string | Send-as email address |
| `displayName` | string | Display name |
| `replyToAddress` | string | Reply-to address |
| `signature` | string | HTML signature |
| `isPrimary` | boolean | Is primary send address |
| `isDefault` | boolean | Is default send address |
| `treatAsAlias` | boolean | Treat as alias |
| `smtpMsa` | object | SMTP server config |
| `verificationStatus` | enum | `pending`, `accepted` |

#### 4.7.9 Delegates

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List | `/gmail/v1/users/{userId}/settings/delegates` | GET |
| Get | `/gmail/v1/users/{userId}/settings/delegates/{delegateEmail}` | GET |
| Create | `/gmail/v1/users/{userId}/settings/delegates` | POST |
| Delete | `/gmail/v1/users/{userId}/settings/delegates/{delegateEmail}` | DELETE |

**Delegate Settings:**

| Field | Type | Description |
|-------|------|-------------|
| `delegateEmail` | string | Delegate email address |
| `verificationStatus` | enum | `pending`, `accepted`, `rejected`, `expired` |

### 4.8 Users API

User profile and push notifications.

#### 4.8.1 Get Profile

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /gmail/v1/users/{userId}/profile` |
| Authentication | OAuth 2.0 |
| Response Format | JSON |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `emailAddress` | string | User's email address |
| `messagesTotal` | integer | Total messages |
| `threadsTotal` | integer | Total threads |
| `historyId` | string | Current history ID |

#### 4.8.2 Watch (Push Notifications)

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /gmail/v1/users/{userId}/watch` |
| Authentication | OAuth 2.0 |
| Request Format | JSON |
| Response Format | JSON |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topicName` | string | Yes | Pub/Sub topic (projects/{project}/topics/{topic}) |
| `labelIds` | array | No | Labels to watch (default: all) |
| `labelFilterAction` | enum | No | `include` or `exclude` |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `historyId` | string | Starting history ID |
| `expiration` | string | Watch expiration (Unix timestamp ms) |

#### 4.8.3 Stop (Push Notifications)

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /gmail/v1/users/{userId}/stop` |
| Authentication | OAuth 2.0 |
| Response Format | Empty (204 No Content) |

### 4.9 Batch Requests

HTTP batch request support for efficiency.

#### 4.9.1 Batch Request Format

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST https://gmail.googleapis.com/batch/gmail/v1` |
| Content-Type | `multipart/mixed; boundary=batch_boundary` |
| Max Requests | 100 per batch |

**Request Structure:**

```
--batch_boundary
Content-Type: application/http
Content-ID: <request1>

GET /gmail/v1/users/me/messages/123

--batch_boundary
Content-Type: application/http
Content-ID: <request2>

GET /gmail/v1/users/me/messages/456

--batch_boundary--
```

**Response Structure:**

```
--batch_response_boundary
Content-Type: application/http
Content-ID: <response-request1>

HTTP/1.1 200 OK
Content-Type: application/json

{...message data...}

--batch_response_boundary
Content-Type: application/http
Content-ID: <response-request2>

HTTP/1.1 200 OK
Content-Type: application/json

{...message data...}

--batch_response_boundary--
```

---

## 5. Interface Definitions

### 5.1 Rust Interfaces

#### 5.1.1 Client Interface

```rust
/// Main client for interacting with Gmail API.
#[async_trait]
pub trait GmailClient: Send + Sync {
    /// Access the messages service.
    fn messages(&self) -> &dyn MessagesService;

    /// Access the threads service.
    fn threads(&self) -> &dyn ThreadsService;

    /// Access the labels service.
    fn labels(&self) -> &dyn LabelsService;

    /// Access the drafts service.
    fn drafts(&self) -> &dyn DraftsService;

    /// Access the history service.
    fn history(&self) -> &dyn HistoryService;

    /// Access the attachments service.
    fn attachments(&self) -> &dyn AttachmentsService;

    /// Access the settings service.
    fn settings(&self) -> &dyn SettingsService;

    /// Access the users service.
    fn users(&self) -> &dyn UsersService;

    /// Execute a batch request.
    async fn batch<T: BatchRequest>(&self, requests: Vec<T>) -> Result<Vec<BatchResponse<T::Response>>, GmailError>;

    /// Get current quota status.
    async fn quota_status(&self) -> Result<QuotaStatus, GmailError>;
}

/// Factory for creating Gmail clients.
pub trait GmailClientFactory: Send + Sync {
    /// Create a new client with the given configuration.
    fn create(&self, config: GmailConfig) -> Result<Arc<dyn GmailClient>, GmailError>;
}
```

#### 5.1.2 Messages Service Interface

```rust
/// Service for Gmail message operations.
#[async_trait]
pub trait MessagesService: Send + Sync {
    /// List messages in the mailbox.
    async fn list(
        &self,
        user_id: &str,
        params: Option<ListMessagesParams>,
    ) -> Result<Paginated<MessageRef>, GmailError>;

    /// List all messages (auto-pagination).
    fn list_all(
        &self,
        user_id: &str,
        params: Option<ListMessagesParams>,
    ) -> impl Stream<Item = Result<MessageRef, GmailError>> + Send;

    /// Get a message by ID.
    async fn get(
        &self,
        user_id: &str,
        message_id: &str,
        format: Option<MessageFormat>,
    ) -> Result<Message, GmailError>;

    /// Get a message with specific metadata headers.
    async fn get_metadata(
        &self,
        user_id: &str,
        message_id: &str,
        metadata_headers: Vec<String>,
    ) -> Result<Message, GmailError>;

    /// Send a message.
    async fn send(
        &self,
        user_id: &str,
        message: SendMessageRequest,
    ) -> Result<Message, GmailError>;

    /// Send a message with large attachments (resumable upload).
    async fn send_with_upload(
        &self,
        user_id: &str,
        message: SendMessageRequest,
        upload_type: UploadType,
    ) -> Result<Message, GmailError>;

    /// Insert a message into the mailbox (no sending).
    async fn insert(
        &self,
        user_id: &str,
        message: InsertMessageRequest,
    ) -> Result<Message, GmailError>;

    /// Import a message (processes SPF/DKIM).
    async fn import(
        &self,
        user_id: &str,
        message: ImportMessageRequest,
    ) -> Result<Message, GmailError>;

    /// Modify a message's labels.
    async fn modify(
        &self,
        user_id: &str,
        message_id: &str,
        request: ModifyMessageRequest,
    ) -> Result<Message, GmailError>;

    /// Permanently delete a message.
    async fn delete(
        &self,
        user_id: &str,
        message_id: &str,
    ) -> Result<(), GmailError>;

    /// Move a message to trash.
    async fn trash(
        &self,
        user_id: &str,
        message_id: &str,
    ) -> Result<Message, GmailError>;

    /// Remove a message from trash.
    async fn untrash(
        &self,
        user_id: &str,
        message_id: &str,
    ) -> Result<Message, GmailError>;

    /// Batch modify multiple messages.
    async fn batch_modify(
        &self,
        user_id: &str,
        request: BatchModifyRequest,
    ) -> Result<(), GmailError>;

    /// Batch delete multiple messages.
    async fn batch_delete(
        &self,
        user_id: &str,
        message_ids: Vec<String>,
    ) -> Result<(), GmailError>;
}
```

#### 5.1.3 Threads Service Interface

```rust
/// Service for Gmail thread operations.
#[async_trait]
pub trait ThreadsService: Send + Sync {
    /// List threads in the mailbox.
    async fn list(
        &self,
        user_id: &str,
        params: Option<ListThreadsParams>,
    ) -> Result<Paginated<ThreadRef>, GmailError>;

    /// List all threads (auto-pagination).
    fn list_all(
        &self,
        user_id: &str,
        params: Option<ListThreadsParams>,
    ) -> impl Stream<Item = Result<ThreadRef, GmailError>> + Send;

    /// Get a thread by ID.
    async fn get(
        &self,
        user_id: &str,
        thread_id: &str,
        format: Option<MessageFormat>,
    ) -> Result<Thread, GmailError>;

    /// Modify a thread's labels.
    async fn modify(
        &self,
        user_id: &str,
        thread_id: &str,
        request: ModifyThreadRequest,
    ) -> Result<Thread, GmailError>;

    /// Permanently delete a thread.
    async fn delete(
        &self,
        user_id: &str,
        thread_id: &str,
    ) -> Result<(), GmailError>;

    /// Move a thread to trash.
    async fn trash(
        &self,
        user_id: &str,
        thread_id: &str,
    ) -> Result<Thread, GmailError>;

    /// Remove a thread from trash.
    async fn untrash(
        &self,
        user_id: &str,
        thread_id: &str,
    ) -> Result<Thread, GmailError>;
}
```

#### 5.1.4 Labels Service Interface

```rust
/// Service for Gmail label operations.
#[async_trait]
pub trait LabelsService: Send + Sync {
    /// List all labels.
    async fn list(
        &self,
        user_id: &str,
    ) -> Result<Vec<Label>, GmailError>;

    /// Get a label by ID.
    async fn get(
        &self,
        user_id: &str,
        label_id: &str,
    ) -> Result<Label, GmailError>;

    /// Create a new label.
    async fn create(
        &self,
        user_id: &str,
        request: CreateLabelRequest,
    ) -> Result<Label, GmailError>;

    /// Update a label (full update).
    async fn update(
        &self,
        user_id: &str,
        label_id: &str,
        request: UpdateLabelRequest,
    ) -> Result<Label, GmailError>;

    /// Patch a label (partial update).
    async fn patch(
        &self,
        user_id: &str,
        label_id: &str,
        request: PatchLabelRequest,
    ) -> Result<Label, GmailError>;

    /// Delete a label.
    async fn delete(
        &self,
        user_id: &str,
        label_id: &str,
    ) -> Result<(), GmailError>;
}
```

#### 5.1.5 Drafts Service Interface

```rust
/// Service for Gmail draft operations.
#[async_trait]
pub trait DraftsService: Send + Sync {
    /// List drafts.
    async fn list(
        &self,
        user_id: &str,
        params: Option<ListDraftsParams>,
    ) -> Result<Paginated<DraftRef>, GmailError>;

    /// Get a draft by ID.
    async fn get(
        &self,
        user_id: &str,
        draft_id: &str,
        format: Option<MessageFormat>,
    ) -> Result<Draft, GmailError>;

    /// Create a new draft.
    async fn create(
        &self,
        user_id: &str,
        request: CreateDraftRequest,
    ) -> Result<Draft, GmailError>;

    /// Update an existing draft.
    async fn update(
        &self,
        user_id: &str,
        draft_id: &str,
        request: UpdateDraftRequest,
    ) -> Result<Draft, GmailError>;

    /// Send a draft.
    async fn send(
        &self,
        user_id: &str,
        draft_id: &str,
    ) -> Result<Message, GmailError>;

    /// Delete a draft.
    async fn delete(
        &self,
        user_id: &str,
        draft_id: &str,
    ) -> Result<(), GmailError>;
}
```

#### 5.1.6 History Service Interface

```rust
/// Service for Gmail history operations (mailbox sync).
#[async_trait]
pub trait HistoryService: Send + Sync {
    /// List history records since a given history ID.
    async fn list(
        &self,
        user_id: &str,
        start_history_id: &str,
        params: Option<ListHistoryParams>,
    ) -> Result<Paginated<HistoryRecord>, GmailError>;

    /// List all history (auto-pagination).
    fn list_all(
        &self,
        user_id: &str,
        start_history_id: &str,
        params: Option<ListHistoryParams>,
    ) -> impl Stream<Item = Result<HistoryRecord, GmailError>> + Send;
}
```

#### 5.1.7 Attachments Service Interface

```rust
/// Service for Gmail attachment operations.
#[async_trait]
pub trait AttachmentsService: Send + Sync {
    /// Get an attachment by ID.
    async fn get(
        &self,
        user_id: &str,
        message_id: &str,
        attachment_id: &str,
    ) -> Result<Attachment, GmailError>;

    /// Stream an attachment (for large files).
    async fn get_stream(
        &self,
        user_id: &str,
        message_id: &str,
        attachment_id: &str,
    ) -> Result<impl Stream<Item = Result<Bytes, GmailError>> + Send, GmailError>;
}
```

#### 5.1.8 Settings Service Interface

```rust
/// Service for Gmail settings operations.
#[async_trait]
pub trait SettingsService: Send + Sync {
    /// Get auto-forwarding settings.
    fn auto_forwarding(&self) -> &dyn AutoForwardingService;

    /// Access filter operations.
    fn filters(&self) -> &dyn FiltersService;

    /// Access forwarding address operations.
    fn forwarding_addresses(&self) -> &dyn ForwardingAddressesService;

    /// Access IMAP settings.
    fn imap(&self) -> &dyn ImapSettingsService;

    /// Access POP settings.
    fn pop(&self) -> &dyn PopSettingsService;

    /// Access vacation responder settings.
    fn vacation(&self) -> &dyn VacationSettingsService;

    /// Access language settings.
    fn language(&self) -> &dyn LanguageSettingsService;

    /// Access send-as settings.
    fn send_as(&self) -> &dyn SendAsSettingsService;

    /// Access delegate settings.
    fn delegates(&self) -> &dyn DelegatesService;
}

#[async_trait]
pub trait FiltersService: Send + Sync {
    async fn list(&self, user_id: &str) -> Result<Vec<Filter>, GmailError>;
    async fn get(&self, user_id: &str, filter_id: &str) -> Result<Filter, GmailError>;
    async fn create(&self, user_id: &str, request: CreateFilterRequest) -> Result<Filter, GmailError>;
    async fn delete(&self, user_id: &str, filter_id: &str) -> Result<(), GmailError>;
}
```

#### 5.1.9 Users Service Interface

```rust
/// Service for Gmail user operations.
#[async_trait]
pub trait UsersService: Send + Sync {
    /// Get user profile.
    async fn get_profile(
        &self,
        user_id: &str,
    ) -> Result<Profile, GmailError>;

    /// Start watching for push notifications.
    async fn watch(
        &self,
        user_id: &str,
        request: WatchRequest,
    ) -> Result<WatchResponse, GmailError>;

    /// Stop watching for push notifications.
    async fn stop(
        &self,
        user_id: &str,
    ) -> Result<(), GmailError>;
}
```

#### 5.1.10 MIME Builder Interface

```rust
/// Builder for constructing RFC 2822 compliant email messages.
pub trait MimeBuilder: Send + Sync {
    /// Create a new simple message.
    fn simple(
        from: &str,
        to: &[&str],
        subject: &str,
        body: &str,
    ) -> Result<MimeMessage, MimeError>;

    /// Create a new HTML message.
    fn html(
        from: &str,
        to: &[&str],
        subject: &str,
        html_body: &str,
        text_body: Option<&str>,
    ) -> Result<MimeMessage, MimeError>;

    /// Create a message with attachments.
    fn with_attachments(
        from: &str,
        to: &[&str],
        subject: &str,
        body: &str,
        attachments: Vec<MimeAttachment>,
    ) -> Result<MimeMessage, MimeError>;

    /// Create a reply message.
    fn reply(
        original: &Message,
        from: &str,
        body: &str,
        reply_all: bool,
    ) -> Result<MimeMessage, MimeError>;

    /// Create a forward message.
    fn forward(
        original: &Message,
        from: &str,
        to: &[&str],
        body: &str,
    ) -> Result<MimeMessage, MimeError>;
}

/// Constructed MIME message.
pub struct MimeMessage {
    /// RFC 2822 formatted message.
    pub raw: Vec<u8>,

    /// Thread ID (for replies).
    pub thread_id: Option<String>,

    /// Message-ID header value.
    pub message_id: String,
}

/// Attachment for MIME messages.
pub struct MimeAttachment {
    pub filename: String,
    pub content_type: String,
    pub data: Vec<u8>,
    pub content_id: Option<String>, // For inline attachments
}
```

#### 5.1.11 Transport Interface

```rust
/// HTTP transport abstraction for testability.
#[async_trait]
pub trait HttpTransport: Send + Sync {
    /// Send an HTTP request and receive a response.
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError>;

    /// Send a request and receive raw bytes (for downloads).
    async fn send_raw(&self, request: HttpRequest) -> Result<Bytes, TransportError>;

    /// Send a batch request.
    async fn send_batch(&self, requests: Vec<HttpRequest>) -> Result<Vec<HttpResponse>, TransportError>;

    /// Send a resumable upload request.
    async fn send_resumable(
        &self,
        init_request: HttpRequest,
        data: impl Stream<Item = Result<Bytes, GmailError>> + Send + 'static,
        total_size: u64,
    ) -> Result<HttpResponse, TransportError>;
}

/// HTTP request representation.
pub struct HttpRequest {
    pub method: HttpMethod,
    pub url: Url,
    pub headers: HeaderMap,
    pub body: Option<RequestBody>,
    pub timeout: Option<Duration>,
}

/// Request body variants.
pub enum RequestBody {
    /// JSON body.
    Json(serde_json::Value),
    /// Binary body.
    Bytes(Bytes),
    /// Multipart body.
    Multipart(Vec<MultipartPart>),
    /// Streaming body.
    Stream(BoxStream<'static, Result<Bytes, GmailError>>),
}

/// HTTP response representation.
pub struct HttpResponse {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub body: Bytes,
}
```

#### 5.1.12 Configuration Types

```rust
/// Configuration for the Gmail client.
#[derive(Clone)]
pub struct GmailConfig {
    /// Authentication configuration.
    pub auth: GmailAuthConfig,

    /// Base URL for the API.
    pub base_url: Url,

    /// Default timeout for requests.
    pub timeout: Duration,

    /// Maximum retries for transient failures.
    pub max_retries: u32,

    /// Retry configuration.
    pub retry_config: RetryConfig,

    /// Circuit breaker configuration.
    pub circuit_breaker_config: CircuitBreakerConfig,

    /// Rate limit configuration.
    pub rate_limit_config: Option<RateLimitConfig>,

    /// User agent string.
    pub user_agent: String,

    /// Default user ID ("me" for authenticated user).
    pub default_user_id: String,
}

impl Default for GmailConfig {
    fn default() -> Self {
        Self {
            auth: GmailAuthConfig::ApplicationDefault,
            base_url: Url::parse("https://gmail.googleapis.com").unwrap(),
            timeout: Duration::from_secs(60),
            max_retries: 3,
            retry_config: RetryConfig::default(),
            circuit_breaker_config: CircuitBreakerConfig::default(),
            rate_limit_config: None,
            user_agent: format!("integrations-gmail/{}", env!("CARGO_PKG_VERSION")),
            default_user_id: "me".to_string(),
        }
    }
}

/// Authentication configuration.
#[derive(Clone)]
pub enum GmailAuthConfig {
    /// Application Default Credentials (ADC).
    ApplicationDefault,

    /// Service account with JSON key file.
    ServiceAccount {
        key_file: PathBuf,
        subject: Option<String>, // User to impersonate
        scopes: Vec<String>,
    },

    /// Service account with key data.
    ServiceAccountKey {
        key: ServiceAccountKey,
        subject: Option<String>,
        scopes: Vec<String>,
    },

    /// OAuth 2.0 access token (pre-obtained).
    AccessToken(SecretString),

    /// OAuth 2.0 refresh token.
    RefreshToken {
        client_id: String,
        client_secret: SecretString,
        refresh_token: SecretString,
    },

    /// API Key (limited functionality).
    ApiKey(SecretString),
}

/// Service account key data.
#[derive(Clone)]
pub struct ServiceAccountKey {
    pub client_email: String,
    pub private_key: SecretString,
    pub private_key_id: String,
    pub token_uri: String,
}

/// OAuth 2.0 scopes for Gmail API.
pub struct GmailScopes;

impl GmailScopes {
    /// Full access to Gmail.
    pub const MAIL_GOOGLE_COM: &'static str = "https://mail.google.com/";

    /// Read, compose, send, and permanently delete emails.
    pub const GMAIL_MODIFY: &'static str = "https://www.googleapis.com/auth/gmail.modify";

    /// Read all resources and metadata.
    pub const GMAIL_READONLY: &'static str = "https://www.googleapis.com/auth/gmail.readonly";

    /// Compose and send emails only.
    pub const GMAIL_COMPOSE: &'static str = "https://www.googleapis.com/auth/gmail.compose";

    /// Send emails only.
    pub const GMAIL_SEND: &'static str = "https://www.googleapis.com/auth/gmail.send";

    /// Insert and import messages only.
    pub const GMAIL_INSERT: &'static str = "https://www.googleapis.com/auth/gmail.insert";

    /// Manage labels only.
    pub const GMAIL_LABELS: &'static str = "https://www.googleapis.com/auth/gmail.labels";

    /// Manage basic mail settings.
    pub const GMAIL_SETTINGS_BASIC: &'static str = "https://www.googleapis.com/auth/gmail.settings.basic";

    /// Manage sensitive mail settings (forwarding, filters).
    pub const GMAIL_SETTINGS_SHARING: &'static str = "https://www.googleapis.com/auth/gmail.settings.sharing";

    /// View your email message metadata.
    pub const GMAIL_METADATA: &'static str = "https://www.googleapis.com/auth/gmail.metadata";
}

/// Message format options.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MessageFormat {
    /// Minimal: only id and threadId.
    Minimal,
    /// Full: all message data parsed.
    Full,
    /// Raw: base64url encoded RFC 2822.
    Raw,
    /// Metadata: headers only.
    Metadata,
}

/// Upload type for sending messages with attachments.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum UploadType {
    /// Simple upload (small files).
    Simple,
    /// Multipart upload (metadata + content).
    Multipart,
    /// Resumable upload (large files).
    Resumable,
}
```

### 5.2 TypeScript Interfaces

#### 5.2.1 Client Interface

```typescript
/**
 * Main client for interacting with Gmail API.
 */
interface GmailClient {
  /** Access the messages service. */
  readonly messages: MessagesService;

  /** Access the threads service. */
  readonly threads: ThreadsService;

  /** Access the labels service. */
  readonly labels: LabelsService;

  /** Access the drafts service. */
  readonly drafts: DraftsService;

  /** Access the history service. */
  readonly history: HistoryService;

  /** Access the attachments service. */
  readonly attachments: AttachmentsService;

  /** Access the settings service. */
  readonly settings: SettingsService;

  /** Access the users service. */
  readonly users: UsersService;

  /** Execute a batch request. */
  batch<T>(requests: BatchRequest<T>[]): Promise<BatchResponse<T>[]>;

  /** Get current quota status. */
  quotaStatus(): Promise<QuotaStatus>;
}

/**
 * Factory for creating Gmail clients.
 */
interface GmailClientFactory {
  create(config: GmailConfig): GmailClient;
}
```

#### 5.2.2 Configuration Types

```typescript
/**
 * Configuration for the Gmail client.
 */
interface GmailConfig {
  /** Authentication configuration. */
  auth: GmailAuthConfig;

  /** Base URL for the API. */
  baseUrl?: string;

  /** Default timeout in milliseconds. */
  timeout?: number;

  /** Maximum retries for transient failures. */
  maxRetries?: number;

  /** Retry configuration. */
  retryConfig?: RetryConfig;

  /** Circuit breaker configuration. */
  circuitBreakerConfig?: CircuitBreakerConfig;

  /** Rate limit configuration. */
  rateLimitConfig?: RateLimitConfig;

  /** User agent string. */
  userAgent?: string;

  /** Default user ID ("me" for authenticated user). */
  defaultUserId?: string;
}

/**
 * Authentication configuration.
 */
type GmailAuthConfig =
  | { type: 'application-default' }
  | { type: 'service-account'; keyFile: string; subject?: string; scopes: string[] }
  | { type: 'service-account-key'; key: ServiceAccountKey; subject?: string; scopes: string[] }
  | { type: 'access-token'; token: string }
  | { type: 'refresh-token'; clientId: string; clientSecret: string; refreshToken: string }
  | { type: 'api-key'; key: string };

/**
 * Service account key data.
 */
interface ServiceAccountKey {
  clientEmail: string;
  privateKey: string;
  privateKeyId: string;
  tokenUri: string;
}
```

#### 5.2.3 Message Types

```typescript
/**
 * Gmail message.
 */
interface Message {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload?: MessagePayload;
  sizeEstimate: number;
  raw?: string;
}

/**
 * Message payload structure.
 */
interface MessagePayload {
  partId?: string;
  mimeType: string;
  filename?: string;
  headers: MessageHeader[];
  body: MessageBody;
  parts?: MessagePayload[];
}

/**
 * Message header.
 */
interface MessageHeader {
  name: string;
  value: string;
}

/**
 * Message body.
 */
interface MessageBody {
  attachmentId?: string;
  size: number;
  data?: string;
}

/**
 * Message reference (minimal).
 */
interface MessageRef {
  id: string;
  threadId: string;
}

/**
 * Request to send a message.
 */
interface SendMessageRequest {
  raw: string;
  threadId?: string;
}

/**
 * Request to modify a message.
 */
interface ModifyMessageRequest {
  addLabelIds?: string[];
  removeLabelIds?: string[];
}

/**
 * Parameters for listing messages.
 */
interface ListMessagesParams {
  maxResults?: number;
  pageToken?: string;
  q?: string;
  labelIds?: string[];
  includeSpamTrash?: boolean;
}
```

#### 5.2.4 Thread Types

```typescript
/**
 * Gmail thread.
 */
interface Thread {
  id: string;
  snippet: string;
  historyId: string;
  messages: Message[];
}

/**
 * Thread reference (minimal).
 */
interface ThreadRef {
  id: string;
  snippet: string;
  historyId: string;
}

/**
 * Request to modify a thread.
 */
interface ModifyThreadRequest {
  addLabelIds?: string[];
  removeLabelIds?: string[];
}

/**
 * Parameters for listing threads.
 */
interface ListThreadsParams {
  maxResults?: number;
  pageToken?: string;
  q?: string;
  labelIds?: string[];
  includeSpamTrash?: boolean;
}
```

#### 5.2.5 Label Types

```typescript
/**
 * Gmail label.
 */
interface Label {
  id: string;
  name: string;
  type: 'system' | 'user';
  messageListVisibility?: 'show' | 'hide';
  labelListVisibility?: 'labelShow' | 'labelShowIfUnread' | 'labelHide';
  messagesTotal?: number;
  messagesUnread?: number;
  threadsTotal?: number;
  threadsUnread?: number;
  color?: LabelColor;
}

/**
 * Label color.
 */
interface LabelColor {
  textColor: string;
  backgroundColor: string;
}

/**
 * Request to create a label.
 */
interface CreateLabelRequest {
  name: string;
  messageListVisibility?: 'show' | 'hide';
  labelListVisibility?: 'labelShow' | 'labelShowIfUnread' | 'labelHide';
  color?: LabelColor;
}
```

#### 5.2.6 Draft Types

```typescript
/**
 * Gmail draft.
 */
interface Draft {
  id: string;
  message: Message;
}

/**
 * Draft reference (minimal).
 */
interface DraftRef {
  id: string;
  message: MessageRef;
}

/**
 * Request to create a draft.
 */
interface CreateDraftRequest {
  message: {
    raw: string;
    threadId?: string;
  };
}

/**
 * Request to update a draft.
 */
interface UpdateDraftRequest {
  message: {
    raw: string;
  };
}
```

#### 5.2.7 History Types

```typescript
/**
 * History record.
 */
interface HistoryRecord {
  id: string;
  messages?: MessageRef[];
  messagesAdded?: { message: MessageRef }[];
  messagesDeleted?: { message: MessageRef }[];
  labelsAdded?: { message: MessageRef; labelIds: string[] }[];
  labelsRemoved?: { message: MessageRef; labelIds: string[] }[];
}

/**
 * Parameters for listing history.
 */
interface ListHistoryParams {
  maxResults?: number;
  pageToken?: string;
  labelId?: string;
  historyTypes?: ('messageAdded' | 'messageDeleted' | 'labelAdded' | 'labelRemoved')[];
}
```

#### 5.2.8 Settings Types

```typescript
/**
 * Auto-forwarding settings.
 */
interface AutoForwardingSettings {
  enabled: boolean;
  emailAddress?: string;
  disposition?: 'leaveInInbox' | 'archive' | 'trash' | 'markRead';
}

/**
 * Filter.
 */
interface Filter {
  id: string;
  criteria: FilterCriteria;
  action: FilterAction;
}

/**
 * Filter criteria.
 */
interface FilterCriteria {
  from?: string;
  to?: string;
  subject?: string;
  query?: string;
  negatedQuery?: string;
  hasAttachment?: boolean;
  excludeChats?: boolean;
  size?: number;
  sizeComparison?: 'larger' | 'smaller';
}

/**
 * Filter action.
 */
interface FilterAction {
  addLabelIds?: string[];
  removeLabelIds?: string[];
  forward?: string;
}

/**
 * Vacation settings.
 */
interface VacationSettings {
  enableAutoReply: boolean;
  responseSubject?: string;
  responseBodyPlainText?: string;
  responseBodyHtml?: string;
  restrictToContacts?: boolean;
  restrictToDomain?: boolean;
  startTime?: string;
  endTime?: string;
}
```

#### 5.2.9 User Types

```typescript
/**
 * User profile.
 */
interface Profile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

/**
 * Watch request.
 */
interface WatchRequest {
  topicName: string;
  labelIds?: string[];
  labelFilterAction?: 'include' | 'exclude';
}

/**
 * Watch response.
 */
interface WatchResponse {
  historyId: string;
  expiration: string;
}
```

#### 5.2.10 MIME Builder Types

```typescript
/**
 * MIME message builder.
 */
interface MimeBuilder {
  /** Create a simple text message. */
  simple(from: string, to: string[], subject: string, body: string): MimeMessage;

  /** Create an HTML message. */
  html(from: string, to: string[], subject: string, htmlBody: string, textBody?: string): MimeMessage;

  /** Create a message with attachments. */
  withAttachments(
    from: string,
    to: string[],
    subject: string,
    body: string,
    attachments: MimeAttachment[]
  ): MimeMessage;

  /** Create a reply message. */
  reply(original: Message, from: string, body: string, replyAll?: boolean): MimeMessage;

  /** Create a forward message. */
  forward(original: Message, from: string, to: string[], body: string): MimeMessage;
}

/**
 * Constructed MIME message.
 */
interface MimeMessage {
  /** Base64url encoded RFC 2822 message. */
  raw: string;

  /** Thread ID (for replies). */
  threadId?: string;

  /** Message-ID header value. */
  messageId: string;
}

/**
 * Attachment for MIME messages.
 */
interface MimeAttachment {
  filename: string;
  contentType: string;
  data: Uint8Array | Buffer;
  contentId?: string;
}
```

#### 5.2.11 Pagination Types

```typescript
/**
 * Paginated results.
 */
interface Paginated<T> {
  items: T[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

/**
 * Async iterator for pagination.
 */
interface PageIterator<T> extends AsyncIterable<T> {
  nextPage(): Promise<T[] | null>;
  collectAll(): Promise<T[]>;
}
```

---

## 6. Error Taxonomy

### 6.1 Error Hierarchy

```
GmailError
├── ConfigurationError
│   ├── MissingAuth
│   ├── InvalidAuthConfig
│   ├── InvalidBaseUrl
│   └── InvalidConfiguration
│
├── AuthenticationError
│   ├── InvalidCredentials
│   ├── ExpiredToken
│   ├── RefreshFailed
│   ├── InsufficientScope
│   ├── ServiceAccountError
│   └── JwtCreationFailed
│
├── AuthorizationError
│   ├── AccessDenied
│   ├── DomainPolicy
│   ├── DelegationDenied
│   └── UserNotFound
│
├── RequestError
│   ├── ValidationError
│   ├── InvalidParameter
│   ├── MissingParameter
│   ├── InvalidMessageFormat
│   ├── InvalidLabelId
│   └── PayloadTooLarge
│
├── ResourceError
│   ├── MessageNotFound
│   ├── ThreadNotFound
│   ├── LabelNotFound
│   ├── DraftNotFound
│   ├── AttachmentNotFound
│   ├── FilterNotFound
│   └── AlreadyExists
│
├── QuotaError
│   ├── DailyLimitExceeded
│   ├── UserRateLimitExceeded
│   ├── ConcurrentLimitExceeded
│   └── MailboxQuotaExceeded
│
├── NetworkError
│   ├── ConnectionFailed
│   ├── Timeout
│   ├── DnsResolutionFailed
│   └── TlsError
│
├── ServerError
│   ├── InternalError
│   ├── BackendError
│   └── ServiceUnavailable
│
├── ResponseError
│   ├── DeserializationError
│   ├── UnexpectedFormat
│   ├── InvalidJson
│   └── BatchPartError
│
├── MimeError
│   ├── InvalidRfc2822
│   ├── EncodingError
│   ├── HeaderParseError
│   └── AttachmentError
│
└── PushNotificationError
    ├── InvalidTopic
    ├── WatchExpired
    └── PubSubError
```

### 6.2 Error Type Definitions (Rust)

```rust
/// Top-level error type for the Gmail integration.
#[derive(Debug, thiserror::Error)]
pub enum GmailError {
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    #[error("Authentication error: {0}")]
    Authentication(#[from] AuthenticationError),

    #[error("Authorization error: {0}")]
    Authorization(#[from] AuthorizationError),

    #[error("Request error: {0}")]
    Request(#[from] RequestError),

    #[error("Resource error: {0}")]
    Resource(#[from] ResourceError),

    #[error("Quota error: {0}")]
    Quota(#[from] QuotaError),

    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    #[error("Server error: {0}")]
    Server(#[from] ServerError),

    #[error("Response error: {0}")]
    Response(#[from] ResponseError),

    #[error("MIME error: {0}")]
    Mime(#[from] MimeError),

    #[error("Push notification error: {0}")]
    PushNotification(#[from] PushNotificationError),
}

impl GmailError {
    /// Returns true if the error is retryable.
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            GmailError::Quota(QuotaError::UserRateLimitExceeded { .. })
                | GmailError::Quota(QuotaError::ConcurrentLimitExceeded { .. })
                | GmailError::Network(NetworkError::Timeout { .. })
                | GmailError::Network(NetworkError::ConnectionFailed { .. })
                | GmailError::Server(ServerError::InternalError { .. })
                | GmailError::Server(ServerError::BackendError { .. })
                | GmailError::Server(ServerError::ServiceUnavailable { .. })
                | GmailError::Authentication(AuthenticationError::ExpiredToken { .. })
        )
    }

    /// Returns the retry delay hint if available.
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            GmailError::Quota(QuotaError::UserRateLimitExceeded { retry_after, .. }) => *retry_after,
            GmailError::Server(ServerError::ServiceUnavailable { retry_after, .. }) => *retry_after,
            _ => None,
        }
    }

    /// Returns the HTTP status code if applicable.
    pub fn status_code(&self) -> Option<StatusCode> {
        match self {
            GmailError::Authentication(_) => Some(StatusCode::UNAUTHORIZED),
            GmailError::Authorization(_) => Some(StatusCode::FORBIDDEN),
            GmailError::Request(_) => Some(StatusCode::BAD_REQUEST),
            GmailError::Resource(ResourceError::MessageNotFound { .. })
            | GmailError::Resource(ResourceError::ThreadNotFound { .. })
            | GmailError::Resource(ResourceError::LabelNotFound { .. })
            | GmailError::Resource(ResourceError::DraftNotFound { .. }) => Some(StatusCode::NOT_FOUND),
            GmailError::Quota(_) => Some(StatusCode::TOO_MANY_REQUESTS),
            GmailError::Server(ServerError::InternalError { .. }) => {
                Some(StatusCode::INTERNAL_SERVER_ERROR)
            }
            GmailError::Server(ServerError::ServiceUnavailable { .. }) => {
                Some(StatusCode::SERVICE_UNAVAILABLE)
            }
            _ => None,
        }
    }

    /// Returns the Google error domain if available.
    pub fn error_domain(&self) -> Option<&str> {
        match self {
            GmailError::Quota(e) => e.domain(),
            GmailError::Authorization(e) => e.domain(),
            _ => None,
        }
    }

    /// Returns the Google error reason if available.
    pub fn error_reason(&self) -> Option<&str> {
        match self {
            GmailError::Quota(e) => e.reason(),
            GmailError::Authorization(e) => e.reason(),
            _ => None,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum QuotaError {
    #[error("Daily sending limit exceeded: {message}")]
    DailyLimitExceeded {
        message: String,
        domain: String,
        reason: String,
    },

    #[error("User rate limit exceeded: {message}")]
    UserRateLimitExceeded {
        message: String,
        domain: String,
        reason: String,
        retry_after: Option<Duration>,
    },

    #[error("Concurrent request limit exceeded: {message}")]
    ConcurrentLimitExceeded {
        message: String,
        domain: String,
        reason: String,
        retry_after: Option<Duration>,
    },

    #[error("Mailbox quota exceeded: {message}")]
    MailboxQuotaExceeded {
        message: String,
        domain: String,
        reason: String,
    },
}

impl QuotaError {
    pub fn domain(&self) -> Option<&str> {
        match self {
            Self::DailyLimitExceeded { domain, .. }
            | Self::UserRateLimitExceeded { domain, .. }
            | Self::ConcurrentLimitExceeded { domain, .. }
            | Self::MailboxQuotaExceeded { domain, .. } => Some(domain),
        }
    }

    pub fn reason(&self) -> Option<&str> {
        match self {
            Self::DailyLimitExceeded { reason, .. }
            | Self::UserRateLimitExceeded { reason, .. }
            | Self::ConcurrentLimitExceeded { reason, .. }
            | Self::MailboxQuotaExceeded { reason, .. } => Some(reason),
        }
    }
}
```

### 6.3 Error Mapping from HTTP/Gmail

| HTTP Status | Gmail Error Reason | Error Type | Retryable |
|-------------|-------------------|------------|-----------|
| 400 | `invalidArgument` | `RequestError::InvalidParameter` | No |
| 400 | `failedPrecondition` | `RequestError::ValidationError` | No |
| 401 | `authError` | `AuthenticationError::InvalidCredentials` | No |
| 403 | `accessNotConfigured` | `AuthorizationError::AccessDenied` | No |
| 403 | `domainPolicy` | `AuthorizationError::DomainPolicy` | No |
| 403 | `dailyLimitExceeded` | `QuotaError::DailyLimitExceeded` | No |
| 403 | `userRateLimitExceeded` | `QuotaError::UserRateLimitExceeded` | Yes |
| 404 | `notFound` | `ResourceError::*NotFound` | No |
| 429 | `rateLimitExceeded` | `QuotaError::UserRateLimitExceeded` | Yes |
| 500 | `backendError` | `ServerError::BackendError` | Yes |
| 503 | `serviceUnavailable` | `ServerError::ServiceUnavailable` | Yes |

---

## 7. Resilience Hooks

### 7.1 Retry Integration

The module integrates with `integrations-retry` for automatic retry of transient failures.

```rust
/// Retry configuration for Gmail requests.
pub struct GmailRetryConfig {
    /// Base configuration from primitives.
    pub base: RetryConfig,

    /// Override retry behavior per error type.
    pub error_overrides: HashMap<ErrorCategory, RetryBehavior>,

    /// Automatically refresh expired tokens.
    pub auto_refresh_tokens: bool,

    /// Maximum exponential backoff delay.
    pub max_backoff: Duration,
}

/// How to handle retries for a specific error category.
pub enum RetryBehavior {
    /// Use default retry logic.
    Default,
    /// Never retry this error.
    NoRetry,
    /// Retry with specific configuration.
    Custom(RetryConfig),
}
```

**Default Retry Behavior:**

| Error Type | Retry | Max Attempts | Base Delay |
|------------|-------|--------------|------------|
| `QuotaError::UserRateLimitExceeded` | Yes | 5 | Exponential with jitter |
| `QuotaError::ConcurrentLimitExceeded` | Yes | 3 | 1s exponential |
| `AuthenticationError::ExpiredToken` | Yes | 1 | Immediate (refresh) |
| `NetworkError::Timeout` | Yes | 3 | 1s exponential |
| `NetworkError::ConnectionFailed` | Yes | 3 | 1s exponential |
| `ServerError::BackendError` | Yes | 3 | 1s exponential |
| `ServerError::ServiceUnavailable` | Yes | 3 | Use Retry-After or 5s |
| All others | No | - | - |

### 7.2 Circuit Breaker Integration

The module integrates with `integrations-circuit-breaker` to prevent cascading failures.

```rust
/// Circuit breaker configuration for Gmail.
pub struct GmailCircuitBreakerConfig {
    /// Base configuration from primitives.
    pub base: CircuitBreakerConfig,

    /// Failure threshold before opening.
    pub failure_threshold: u32,

    /// Success threshold to close.
    pub success_threshold: u32,

    /// Time before attempting half-open.
    pub reset_timeout: Duration,

    /// Separate circuit breakers per user.
    pub per_user: bool,
}

impl Default for GmailCircuitBreakerConfig {
    fn default() -> Self {
        Self {
            base: CircuitBreakerConfig::default(),
            failure_threshold: 5,
            success_threshold: 3,
            reset_timeout: Duration::from_secs(60),
            per_user: false,
        }
    }
}
```

**State Transitions:**

```
CLOSED --[failures >= threshold]--> OPEN
OPEN --[reset_timeout elapsed]--> HALF_OPEN
HALF_OPEN --[success >= threshold]--> CLOSED
HALF_OPEN --[any failure]--> OPEN
```

### 7.3 Rate Limit Integration

The module integrates with `integrations-rate-limit` for client-side rate limiting.

```rust
/// Rate limit configuration for Gmail.
pub struct GmailRateLimitConfig {
    /// Daily sending quota (default 2000/day for personal, varies for Workspace).
    pub daily_sending_limit: Option<u32>,

    /// Per-user queries per second.
    pub queries_per_second: Option<u32>,

    /// Maximum concurrent requests.
    pub max_concurrent_requests: Option<u32>,

    /// Maximum batch size.
    pub max_batch_size: u32,

    /// Pre-emptive throttling based on quota.
    pub preemptive_throttling: bool,
}

impl Default for GmailRateLimitConfig {
    fn default() -> Self {
        Self {
            daily_sending_limit: None, // Determined by account type
            queries_per_second: Some(250), // Default Gmail API QPS
            max_concurrent_requests: Some(25),
            max_batch_size: 100,
            preemptive_throttling: true,
        }
    }
}
```

**Gmail API Quotas:**

| Quota | Default Value | Notes |
|-------|---------------|-------|
| Queries per day | 1,000,000,000 | Shared across project |
| Queries per 100 seconds per user | 25,000 | Per-user limit |
| Concurrent requests | 25 | Per user |
| Sending limit (free) | 500/day | Personal accounts |
| Sending limit (Workspace) | 2,000/day | Business accounts |
| Batch requests | 100 requests | Per batch |

**Rate Limit Handling:**

1. **Track quotas**: Monitor quota usage across requests
2. **Pre-emptive throttling**: Slow down when approaching limits
3. **Exponential backoff**: On quota errors
4. **Per-user isolation**: Track limits per user when acting as multiple users

---

## 8. Security Requirements

### 8.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| Access tokens never logged | Use `SecretString`, redact in Debug |
| Refresh tokens protected | `SecretString` with Zeroize |
| Service account keys secured | Encrypted at rest, zeroed on drop |
| Credentials not in stack traces | No Display impl for secrets |
| Token refresh automatic | Transparent credential refresh |
| Scope minimization | Request minimum required scopes |

### 8.2 OAuth 2.0 Security

| Requirement | Implementation |
|-------------|----------------|
| Use authorization code flow | For user consent scenarios |
| PKCE for public clients | Code challenge/verifier |
| Secure token storage | Encrypted storage abstraction |
| Token validation | Validate expiry before use |
| Scope validation | Verify granted scopes match requested |
| Offline access | Request `access_type=offline` for refresh tokens |

### 8.3 Transport Security

| Requirement | Implementation |
|-------------|----------------|
| TLS 1.2+ only | Configure in HTTP client |
| Certificate validation | Enable by default |
| No insecure fallback | Fail on TLS errors |
| HTTPS only | Reject HTTP URLs |

### 8.4 Input Validation

| Requirement | Implementation |
|-------------|----------------|
| Validate all user input | Before sending to API |
| Sanitize email addresses | RFC 5321 compliance |
| Validate label IDs | Pattern validation |
| Sanitize for logging | Truncate, redact PII |
| MIME injection prevention | Proper header encoding |
| File type validation | For attachments |

### 8.5 Output Handling

| Requirement | Implementation |
|-------------|----------------|
| Response validation | Type-checked deserialization |
| Email content safety | Proper encoding on display |
| Error message safety | No credential exposure |
| Attachment safety | Validate before processing |
| Base64url decoding safety | Handle malformed data |

---

## 9. Observability Requirements

### 9.1 Tracing

Every API call must create a trace span with:

| Attribute | Type | Description |
|-----------|------|-------------|
| `gmail.service` | string | Service name (e.g., "messages") |
| `gmail.operation` | string | Operation name (e.g., "send") |
| `gmail.user_id` | string | User ID (redacted if email) |
| `gmail.message_id` | string | Message ID (if applicable) |
| `gmail.thread_id` | string | Thread ID (if applicable) |
| `gmail.label_ids` | array | Label IDs involved |
| `gmail.message_count` | integer | Number of messages in batch |
| `gmail.format` | string | Message format requested |
| `gmail.upload_type` | string | Upload type (simple/multipart/resumable) |
| `http.status_code` | integer | HTTP response status |
| `error.type` | string | Error category (if failed) |
| `error.message` | string | Error message (if failed) |
| `error.domain` | string | Google error domain |
| `error.reason` | string | Google error reason |

### 9.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `gmail_requests_total` | Counter | `service`, `operation`, `status` |
| `gmail_request_duration_seconds` | Histogram | `service`, `operation` |
| `gmail_messages_sent_total` | Counter | `user_id_hash` |
| `gmail_messages_received_total` | Counter | `user_id_hash` |
| `gmail_bytes_transferred_total` | Counter | `direction` (upload/download) |
| `gmail_attachments_total` | Counter | `operation` (upload/download) |
| `gmail_errors_total` | Counter | `service`, `error_type`, `error_reason` |
| `gmail_retries_total` | Counter | `service`, `attempt` |
| `gmail_quota_usage` | Gauge | `quota_type` |
| `gmail_circuit_breaker_state` | Gauge | `user_id_hash`, `state` |
| `gmail_batch_size` | Histogram | `operation` |
| `gmail_pagination_pages_total` | Counter | `service`, `operation` |

### 9.3 Logging

| Level | When |
|-------|------|
| `ERROR` | Non-retryable failures, configuration errors |
| `WARN` | Quota limits, circuit breaker trips, retryable failures |
| `INFO` | Message send/receive, label modifications |
| `DEBUG` | Request/response details (sanitized), pagination progress |
| `TRACE` | Raw request/response bodies, token operations |

**Log Fields:**

| Field | Description |
|-------|-------------|
| `user_id` | User ID (redacted) |
| `message_id` | Message ID |
| `thread_id` | Thread ID |
| `operation` | API operation |
| `duration_ms` | Request duration |
| `status_code` | HTTP status |
| `error.type` | Error category |
| `error.domain` | Google error domain |
| `error.reason` | Google error reason |
| `retry.attempt` | Current retry attempt |
| `batch.size` | Batch request size |
| `quota.remaining` | Remaining quota (if available) |

---

## 10. Performance Requirements

### 10.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| Request serialization | < 1ms | < 5ms |
| Response deserialization | < 5ms | < 20ms |
| JWT creation | < 10ms | < 50ms |
| Token refresh | < 500ms | < 2s |
| MIME message construction | < 10ms | < 50ms (without attachments) |
| Base64url encoding (1MB) | < 20ms | < 100ms |
| Message list (100 items) | < 200ms + network | < 500ms + network |
| Single message fetch | < 100ms + network | < 300ms + network |

### 10.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Concurrent requests | 25+ (per user, configurable) |
| Batch requests | 100 operations per batch |
| Message send rate | Up to daily limit |
| Pagination throughput | 500 items per request |
| Attachment streaming | Line-rate with network |

### 10.3 Resource Limits

| Resource | Limit |
|----------|-------|
| Memory per request | < 1MB typical (excluding attachments) |
| Memory per message | < 35MB (Gmail message limit) |
| Memory per attachment | Streaming for large files |
| Connection pool size | Configurable (default: 20) |
| Request body size | 35MB (Gmail limit) |
| Batch request size | 100 requests |

---

## 11. Future-Proofing

### 11.1 Extensibility Points

| Extension Point | Mechanism |
|-----------------|-----------|
| New API endpoints | Add new service trait + implementation |
| Custom auth providers | Implement `CredentialsProvider` trait |
| Custom transport | Implement `HttpTransport` trait |
| New message formats | Extend MIME builder |
| Custom retry logic | Implement retry hooks |
| Custom rate limiting | Implement rate limit hooks |
| Webhook handling | Push notification processing |

### 11.2 Version Compatibility

| Aspect | Strategy |
|--------|----------|
| API version | Currently v1, monitor for updates |
| Response fields | `#[serde(flatten)]` for unknown fields |
| Request fields | Builder pattern with optional fields |
| Breaking changes | Major version bump, migration guide |
| Deprecated fields | Warn on use, remove in major version |

### 11.3 Google Workspace Integration

The module should support Google Workspace-specific features:

| Feature | Configuration |
|---------|---------------|
| Domain-wide delegation | Service account impersonation |
| Vault integration | Discovery and retention |
| Admin SDK integration | User provisioning |
| Audit logging | Compliance requirements |

---

## 12. Acceptance Criteria

### 12.1 Functional Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| FC-1 | List messages works | Integration test |
| FC-2 | Get message (all formats) works | Integration test |
| FC-3 | Send message works | Integration test |
| FC-4 | Send message with attachments works | Integration test |
| FC-5 | Insert message works | Integration test |
| FC-6 | Import message works | Integration test |
| FC-7 | Modify message labels works | Integration test |
| FC-8 | Delete/trash/untrash message works | Integration test |
| FC-9 | Batch modify messages works | Integration test |
| FC-10 | Batch delete messages works | Integration test |
| FC-11 | List/get/modify/delete threads work | Integration test |
| FC-12 | Label CRUD operations work | Integration test |
| FC-13 | Draft CRUD and send work | Integration test |
| FC-14 | History list works for sync | Integration test |
| FC-15 | Attachment download works | Integration test |
| FC-16 | Large attachment streaming works | Integration test |
| FC-17 | Settings operations work | Integration test |
| FC-18 | Filter CRUD operations work | Integration test |
| FC-19 | Vacation responder works | Integration test |
| FC-20 | User profile retrieval works | Integration test |
| FC-21 | Push notification watch/stop works | Integration test |
| FC-22 | Batch requests work | Integration test |
| FC-23 | MIME message construction works | Unit tests |
| FC-24 | RFC 2822 parsing works | Unit tests |
| FC-25 | All error types mapped correctly | Unit tests |
| FC-26 | OAuth 2.0 token refresh works | Integration test |
| FC-27 | Service account auth works | Integration test |

### 12.2 Non-Functional Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| NFC-1 | No panics in production paths | Fuzzing, review |
| NFC-2 | Memory bounded during streaming | Profiling |
| NFC-3 | Credentials never logged | Audit, tests |
| NFC-4 | TLS 1.2+ enforced | Configuration |
| NFC-5 | Retry respects backoff | Mock tests |
| NFC-6 | Circuit breaker trips correctly | State tests |
| NFC-7 | Rate limiting works | Timing tests |
| NFC-8 | Quota tracking works | Mock tests |
| NFC-9 | All requests traced | Integration tests |
| NFC-10 | Metrics emitted correctly | Integration tests |
| NFC-11 | Test coverage > 80% | Coverage report |
| NFC-12 | Large messages handled (35MB) | Integration test |
| NFC-13 | Pagination handles large mailboxes | Load test |

### 12.3 Documentation Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| DC-1 | All public APIs documented | Doc coverage |
| DC-2 | Examples for common operations | Doc review |
| DC-3 | Error handling documented | Doc review |
| DC-4 | Configuration options documented | Doc review |
| DC-5 | Authentication methods documented | Doc review |
| DC-6 | Quota and limits documented | Doc review |
| DC-7 | Migration guides for breaking changes | Release notes |
| DC-8 | MIME construction examples | Doc review |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial specification |

---

**End of Specification Phase**

*The next phase (Pseudocode) will provide detailed algorithmic descriptions for implementing each component, including OAuth 2.0 token management, MIME message construction, batch request handling, and history-based synchronization.*
