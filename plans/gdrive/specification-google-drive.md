# Google Drive Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/google-drive`

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

This specification defines the requirements, interfaces, and constraints for the Google Drive Integration Module within the LLM-Dev-Ops Integration Repository. It serves as the authoritative source for what the module must accomplish when interacting with the Google Drive REST API v3.

### 1.2 Audience

- Implementation developers (Rust and TypeScript)
- QA engineers designing test strategies
- Architects reviewing integration patterns
- Security reviewers assessing credential handling
- DevOps engineers integrating with cloud storage workflows

### 1.3 Methodology

This specification follows:
- **SPARC Methodology**: Specification -> Pseudocode -> Architecture -> Refinement -> Completion
- **London-School TDD**: Interface-first design enabling mock-based testing
- **SOLID Principles**: Clean, maintainable, extensible design

### 1.4 Google Drive API Overview

Google Drive provides a REST API for managing files and folders in Google Drive:
- **API Version**: v3 (current stable release)
- **Base URL**: `https://www.googleapis.com/drive/v3`
- **Upload URL**: `https://www.googleapis.com/upload/drive/v3`
- **Authentication**: OAuth 2.0 and Service Accounts

The module provides comprehensive coverage of file operations, folder management, permissions, comments, revisions, and change tracking.

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The Google Drive Integration Module provides a production-ready, type-safe interface for interacting with Google Drive's REST API v3. It abstracts HTTP communication, handles OAuth 2.0 and Service Account authentication, manages resilience patterns, and provides comprehensive observability—all while maintaining clean dependency boundaries.

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **File Operations** | Type-safe wrappers for file CRUD operations (create, read, update, delete, copy, move) |
| **Folder Management** | Folder creation, listing, hierarchy traversal |
| **Permissions** | Share files/folders, manage access levels, transfer ownership |
| **Comments** | Add, retrieve, update, delete comments on files |
| **Revisions** | Access file revision history, download specific versions |
| **Change Tracking** | Monitor changes to files and folders via change tokens |
| **Export** | Export Google Workspace files to various formats |
| **Upload Management** | Simple, multipart, and resumable uploads for large files |
| **Download Streaming** | Efficient streaming downloads for large files |
| **Authentication** | OAuth 2.0 flows and Service Account JWT authentication |
| **Transport** | HTTPS communication with connection pooling |
| **Pagination** | Automatic handling of cursor-based pagination (nextPageToken) |
| **Resilience Integration** | Hooks for retry, circuit breaker, and rate limiting primitives |
| **Observability** | Tracing spans, metrics emission, structured logging |
| **Error Mapping** | Translation of API errors to typed domain errors |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Files API | create, get, list, update, delete, copy, export, generateIds |
| Upload Operations | simple upload, multipart upload, resumable upload |
| Download Operations | get content, export content, streaming downloads |
| Folders | create folders, list children, traverse hierarchy |
| Permissions API | create, get, list, update, delete permissions |
| Comments API | create, get, list, update, delete comments |
| Replies API | create, get, list, update, delete comment replies |
| Revisions API | get, list, update, delete revisions |
| Changes API | list changes, get start page token, watch changes |
| About API | get storage quota, user info, supported formats |
| Drives API | Shared drives management (list, get, create, update, delete) |
| Team Drives | Legacy team drives support via Drives API |
| Dual Language | Rust (primary) and TypeScript implementations |

#### Out of Scope

| Item | Reason |
|------|--------|
| Other Google APIs | Separate integration modules (Sheets, Docs, Calendar) |
| ruvbase (Layer 0) | External dependency, not implemented here |
| Google Picker API | Browser-side UI component, not server integration |
| Realtime API | Deprecated by Google |
| Google Drive Activity API | Separate API with different patterns |
| Google Cloud Storage | Different service (GCS), requires separate module |
| Google Drive Android/iOS SDKs | Mobile-specific, not server integration |
| Drive Labels API | Specialized metadata labeling feature |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| No direct HTTP client dependency exposure | Encapsulation, testability |
| Async-first design | I/O-bound operations, efficiency |
| Zero `unsafe` in public API (Rust) | Safety guarantees |
| No panics in production paths | Reliability |
| Trait-based abstractions | London-School TDD, mockability |
| Semantic versioning | API stability |
| OAuth 2.0 / Service Account only | Google's required auth mechanisms |
| Cursor-based pagination | Google Drive's pagination model |
| Streaming for large files | Memory efficiency |
| Resumable uploads for large files | Reliability, resume on failure |

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
| `base64` | 0.21+ | Base64 encoding |
| `jsonwebtoken` | 9.x | JWT handling for Service Accounts |
| `mime` | 0.3+ | MIME type handling |
| `percent-encoding` | 2.x | URL encoding |
| `tokio-util` | 0.7+ | Async utilities (codec, io) |
| `pin-project` | 1.x | Pin projection for streams |

### 3.3 External Dependencies (TypeScript)

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | 5.x | Language |
| `node-fetch` / native fetch | Latest | HTTP client |
| `zod` | 3.x | Runtime type validation |
| `jose` | 5.x | JWT handling for Service Accounts |

### 3.4 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `ruvbase` | Layer 0, external to this module |
| `integrations-openai` | No cross-integration dependencies |
| `integrations-anthropic` | No cross-integration dependencies |
| `integrations-github` | No cross-integration dependencies |
| `googleapis` | This module IS the Google Drive integration |
| `google-auth-library` | Auth handled internally |
| Any other integration module | Isolated module design |

---

## 4. API Coverage

### 4.1 Files API

Primary API for managing files in Google Drive.

#### 4.1.1 Files: create

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /drive/v3/files` |
| Upload Endpoint | `POST /upload/drive/v3/files` |
| Authentication | OAuth 2.0 / Service Account |
| Request Format | JSON (metadata) + Binary (content) |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uploadType` | string | Conditional | `media`, `multipart`, or `resumable` |
| `ignoreDefaultVisibility` | boolean | No | Ignore default visibility settings |
| `keepRevisionForever` | boolean | No | Keep revision permanently |
| `ocrLanguage` | string | No | OCR language hint |
| `supportsAllDrives` | boolean | No | Support shared drives |
| `useContentAsIndexableText` | boolean | No | Index content for search |

**Request Body (File Metadata):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | File name |
| `mimeType` | string | No | MIME type |
| `description` | string | No | File description |
| `parents` | array | No | Parent folder IDs |
| `properties` | object | No | Custom properties |
| `appProperties` | object | No | App-specific properties |
| `starred` | boolean | No | Star the file |
| `folderColorRgb` | string | No | Folder color (folders only) |
| `contentHints` | object | No | Content hints (thumbnail, indexable text) |
| `contentRestrictions` | array | No | Content restrictions |
| `copyRequiresWriterPermission` | boolean | No | Require writer permission to copy |
| `shortcutDetails` | object | No | Shortcut target (shortcuts only) |
| `writersCanShare` | boolean | No | Allow writers to share |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `kind` | string | Always "drive#file" |
| `id` | string | File ID |
| `name` | string | File name |
| `mimeType` | string | MIME type |
| `description` | string | Description |
| `starred` | boolean | Is starred |
| `trashed` | boolean | Is in trash |
| `explicitlyTrashed` | boolean | Explicitly trashed |
| `parents` | array | Parent folder IDs |
| `properties` | object | Custom properties |
| `appProperties` | object | App-specific properties |
| `spaces` | array | Spaces ("drive", "appDataFolder", "photos") |
| `version` | string | Monotonically increasing version number |
| `webContentLink` | string | Download link (with auth) |
| `webViewLink` | string | View link in Drive |
| `iconLink` | string | Icon URL |
| `hasThumbnail` | boolean | Has thumbnail |
| `thumbnailLink` | string | Thumbnail URL |
| `thumbnailVersion` | string | Thumbnail version |
| `viewedByMe` | boolean | Viewed by requesting user |
| `viewedByMeTime` | datetime | Last viewed time |
| `createdTime` | datetime | Creation time |
| `modifiedTime` | datetime | Last modification time |
| `modifiedByMeTime` | datetime | Modified by me time |
| `modifiedByMe` | boolean | Modified by requesting user |
| `sharedWithMeTime` | datetime | Shared time |
| `sharingUser` | object | User who shared |
| `owners` | array | Owner list |
| `teamDriveId` | string | Team drive ID (deprecated) |
| `driveId` | string | Shared drive ID |
| `lastModifyingUser` | object | Last modifier |
| `shared` | boolean | Is shared |
| `ownedByMe` | boolean | Owned by requesting user |
| `capabilities` | object | User capabilities on file |
| `viewersCanCopyContent` | boolean | Viewers can copy |
| `copyRequiresWriterPermission` | boolean | Copy requires writer |
| `writersCanShare` | boolean | Writers can share |
| `permissions` | array | Permission list |
| `permissionIds` | array | Permission ID list |
| `hasAugmentedPermissions` | boolean | Has augmented permissions |
| `originalFilename` | string | Original upload filename |
| `fullFileExtension` | string | Full file extension |
| `fileExtension` | string | Final file extension |
| `md5Checksum` | string | MD5 checksum |
| `sha1Checksum` | string | SHA1 checksum |
| `sha256Checksum` | string | SHA256 checksum |
| `size` | string | File size in bytes |
| `quotaBytesUsed` | string | Quota used |
| `headRevisionId` | string | Current revision ID |
| `contentHints` | object | Content hints |
| `imageMediaMetadata` | object | Image metadata |
| `videoMediaMetadata` | object | Video metadata |
| `isAppAuthorized` | boolean | App authorized |
| `exportLinks` | object | Export format links |
| `shortcutDetails` | object | Shortcut details |
| `contentRestrictions` | array | Content restrictions |
| `resourceKey` | string | Resource key |
| `linkShareMetadata` | object | Link share metadata |
| `labelInfo` | object | Label information |

#### 4.1.2 Files: get

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /drive/v3/files/{fileId}` |
| Authentication | OAuth 2.0 / Service Account |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fileId` | string | Yes | File ID |
| `acknowledgeAbuse` | boolean | No | Acknowledge abuse flag |
| `fields` | string | No | Fields to return |
| `supportsAllDrives` | boolean | No | Support shared drives |
| `includePermissionsForView` | string | No | Include permissions for view |
| `includeLabels` | string | No | Include label IDs |

#### 4.1.3 Files: get (download content)

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /drive/v3/files/{fileId}?alt=media` |
| Authentication | OAuth 2.0 / Service Account |
| Response Format | Binary |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fileId` | string | Yes | File ID |
| `acknowledgeAbuse` | boolean | No | Acknowledge abuse flag |
| `Range` | header | No | Byte range for partial download |

#### 4.1.4 Files: list

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /drive/v3/files` |
| Authentication | OAuth 2.0 / Service Account |
| Response Format | JSON |
| Pagination | Cursor-based (nextPageToken) |
| Default Page Size | 100 |
| Max Page Size | 1000 |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `corpora` | string | No | "user", "drive", "allDrives" |
| `driveId` | string | No | Shared drive ID |
| `includeItemsFromAllDrives` | boolean | No | Include shared drive items |
| `includePermissionsForView` | string | No | Include permissions for view |
| `includeLabels` | string | No | Include label IDs |
| `orderBy` | string | No | Sort order (e.g., "modifiedTime desc") |
| `pageSize` | integer | No | Results per page (1-1000) |
| `pageToken` | string | No | Page token for continuation |
| `q` | string | No | Query string (search filter) |
| `spaces` | string | No | Spaces to query |
| `supportsAllDrives` | boolean | No | Support shared drives |
| `fields` | string | No | Fields to return |

**Query String Syntax (`q` parameter):**

| Operator | Example | Description |
|----------|---------|-------------|
| `contains` | `name contains 'hello'` | Name contains |
| `=` | `mimeType = 'application/pdf'` | Exact match |
| `!=` | `trashed != true` | Not equal |
| `<`, `>`, `<=`, `>=` | `modifiedTime > '2024-01-01'` | Comparison |
| `in` | `'parent_id' in parents` | In array |
| `and`, `or`, `not` | `(a and b) or c` | Boolean logic |

**Common Query Patterns:**

| Pattern | Query |
|---------|-------|
| Files in folder | `'folder_id' in parents` |
| By MIME type | `mimeType = 'application/pdf'` |
| Not in trash | `trashed = false` |
| Starred files | `starred = true` |
| Shared with me | `sharedWithMe = true` |
| Recent files | `modifiedTime > '2024-01-01T00:00:00'` |
| By name | `name = 'document.pdf'` |
| Folders only | `mimeType = 'application/vnd.google-apps.folder'` |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `kind` | string | Always "drive#fileList" |
| `nextPageToken` | string | Token for next page |
| `incompleteSearch` | boolean | Search was incomplete |
| `files` | array | File list |

#### 4.1.5 Files: update

| Attribute | Value |
|-----------|-------|
| Endpoint | `PATCH /drive/v3/files/{fileId}` |
| Upload Endpoint | `PATCH /upload/drive/v3/files/{fileId}` |
| Authentication | OAuth 2.0 / Service Account |
| Request Format | JSON (metadata) + Binary (content) |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fileId` | string | Yes | File ID |
| `uploadType` | string | Conditional | Upload type if updating content |
| `addParents` | string | No | Parent IDs to add |
| `removeParents` | string | No | Parent IDs to remove |
| `keepRevisionForever` | boolean | No | Keep revision permanently |
| `ocrLanguage` | string | No | OCR language hint |
| `supportsAllDrives` | boolean | No | Support shared drives |
| `useContentAsIndexableText` | boolean | No | Index content |
| `includePermissionsForView` | string | No | Include permissions |
| `includeLabels` | string | No | Include labels |

#### 4.1.6 Files: delete

| Attribute | Value |
|-----------|-------|
| Endpoint | `DELETE /drive/v3/files/{fileId}` |
| Authentication | OAuth 2.0 / Service Account |
| Response Format | Empty (204 No Content) |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fileId` | string | Yes | File ID |
| `supportsAllDrives` | boolean | No | Support shared drives |
| `enforceSingleParent` | boolean | No | Enforce single parent |

#### 4.1.7 Files: copy

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /drive/v3/files/{fileId}/copy` |
| Authentication | OAuth 2.0 / Service Account |
| Request Format | JSON |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fileId` | string | Yes | Source file ID |
| `ignoreDefaultVisibility` | boolean | No | Ignore default visibility |
| `keepRevisionForever` | boolean | No | Keep revision |
| `ocrLanguage` | string | No | OCR language |
| `supportsAllDrives` | boolean | No | Support shared drives |
| `includePermissionsForView` | string | No | Include permissions |
| `includeLabels` | string | No | Include labels |

**Request Body (optional metadata overrides):**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | New name |
| `parents` | array | Destination parents |
| `description` | string | New description |
| `properties` | object | Custom properties |
| `appProperties` | object | App properties |
| `starred` | boolean | Star the copy |
| `contentRestrictions` | array | Content restrictions |
| `copyRequiresWriterPermission` | boolean | Copy permission |
| `writersCanShare` | boolean | Writers can share |

#### 4.1.8 Files: export

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /drive/v3/files/{fileId}/export` |
| Authentication | OAuth 2.0 / Service Account |
| Response Format | Binary (exported content) |
| Max Size | 10 MB |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fileId` | string | Yes | File ID (Google Workspace file) |
| `mimeType` | string | Yes | Export MIME type |

**Supported Export Formats:**

| Source Type | Export MIME Types |
|-------------|-------------------|
| Google Docs | `text/plain`, `text/html`, `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/rtf`, `application/epub+zip` |
| Google Sheets | `text/csv`, `text/tab-separated-values`, `application/pdf`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.oasis.opendocument.spreadsheet` |
| Google Slides | `application/pdf`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`, `text/plain` |
| Google Drawings | `application/pdf`, `image/png`, `image/jpeg`, `image/svg+xml` |
| Google Apps Script | `application/vnd.google-apps.script+json` |

#### 4.1.9 Files: generateIds

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /drive/v3/files/generateIds` |
| Authentication | OAuth 2.0 / Service Account |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `count` | integer | No | Number of IDs (default 10, max 1000) |
| `space` | string | No | Space for IDs ("drive" or "appDataFolder") |
| `type` | string | No | ID type ("files" or "shortcuts") |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `kind` | string | Always "drive#generatedIds" |
| `space` | string | Space |
| `ids` | array | Generated file IDs |

#### 4.1.10 Files: emptyTrash

| Attribute | Value |
|-----------|-------|
| Endpoint | `DELETE /drive/v3/files/trash` |
| Authentication | OAuth 2.0 / Service Account |
| Response Format | Empty (204 No Content) |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `driveId` | string | No | Shared drive ID |
| `enforceSingleParent` | boolean | No | Enforce single parent |

### 4.2 Upload Operations

#### 4.2.1 Simple Upload

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /upload/drive/v3/files?uploadType=media` |
| Max Size | 5 MB |
| Use Case | Small files, simple metadata |

**Headers:**

| Header | Value |
|--------|-------|
| `Content-Type` | File MIME type |
| `Content-Length` | File size |

#### 4.2.2 Multipart Upload

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /upload/drive/v3/files?uploadType=multipart` |
| Max Size | 5 MB |
| Use Case | Small files with full metadata |

**Headers:**

| Header | Value |
|--------|-------|
| `Content-Type` | `multipart/related; boundary=<boundary>` |
| `Content-Length` | Total size |

**Body Structure:**

```
--<boundary>
Content-Type: application/json; charset=UTF-8

{file metadata JSON}
--<boundary>
Content-Type: <file MIME type>

<file content>
--<boundary>--
```

#### 4.2.3 Resumable Upload

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /upload/drive/v3/files?uploadType=resumable` |
| Max Size | 5 TB |
| Use Case | Large files, unreliable networks |
| Chunk Size | 256 KB minimum (multiple of) |

**Step 1: Initiate Upload**

| Attribute | Value |
|-----------|-------|
| Method | POST |
| Header | `X-Upload-Content-Type: <file MIME type>` |
| Header | `X-Upload-Content-Length: <file size>` |
| Body | File metadata (JSON) |
| Response | 200 OK with `Location` header containing resumable URI |

**Step 2: Upload Content**

| Attribute | Value |
|-----------|-------|
| Method | PUT |
| URL | Resumable URI from Location header |
| Header | `Content-Length: <chunk size>` |
| Header | `Content-Range: bytes <start>-<end>/<total>` |
| Body | File content chunk |

**Step 3: Resume (on failure)**

| Attribute | Value |
|-----------|-------|
| Method | PUT |
| URL | Resumable URI |
| Header | `Content-Length: 0` |
| Header | `Content-Range: bytes */<total>` |
| Response | 308 Resume Incomplete with `Range` header showing bytes received |

### 4.3 Permissions API

#### 4.3.1 Permissions: create

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /drive/v3/files/{fileId}/permissions` |
| Authentication | OAuth 2.0 / Service Account |
| Request Format | JSON |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fileId` | string | Yes | File ID |
| `emailMessage` | string | No | Custom email message |
| `enforceSingleParent` | boolean | No | Enforce single parent |
| `moveToNewOwnersRoot` | boolean | No | Move to new owner's root |
| `sendNotificationEmail` | boolean | No | Send email notification |
| `supportsAllDrives` | boolean | No | Support shared drives |
| `transferOwnership` | boolean | No | Transfer ownership |
| `useDomainAdminAccess` | boolean | No | Use domain admin access |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `role` | string | Yes | Permission role |
| `type` | string | Yes | Grantee type |
| `emailAddress` | string | Conditional | Email for user/group type |
| `domain` | string | Conditional | Domain for domain type |
| `allowFileDiscovery` | boolean | No | Allow discovery (anyone type) |
| `expirationTime` | datetime | No | Permission expiration |
| `view` | string | No | View type |
| `pendingOwner` | boolean | No | Pending ownership transfer |

**Permission Roles:**

| Role | Description |
|------|-------------|
| `owner` | Full ownership |
| `organizer` | Shared drive organizer |
| `fileOrganizer` | Can organize files |
| `writer` | Can edit |
| `commenter` | Can comment |
| `reader` | Can view |

**Permission Types:**

| Type | Description |
|------|-------------|
| `user` | Specific user (by email) |
| `group` | Google Group (by email) |
| `domain` | Entire domain |
| `anyone` | Anyone with link |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `kind` | string | Always "drive#permission" |
| `id` | string | Permission ID |
| `type` | string | Permission type |
| `role` | string | Permission role |
| `emailAddress` | string | Grantee email |
| `domain` | string | Grantee domain |
| `displayName` | string | Display name |
| `photoLink` | string | Photo URL |
| `expirationTime` | datetime | Expiration time |
| `teamDrivePermissionDetails` | array | Team drive details |
| `permissionDetails` | array | Permission details |
| `allowFileDiscovery` | boolean | Discoverable |
| `deleted` | boolean | Is deleted |
| `view` | string | View type |
| `pendingOwner` | boolean | Pending owner |

#### 4.3.2 Permissions: list

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /drive/v3/files/{fileId}/permissions` |
| Authentication | OAuth 2.0 / Service Account |
| Response Format | JSON |
| Pagination | Cursor-based |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fileId` | string | Yes | File ID |
| `pageSize` | integer | No | Results per page (1-100) |
| `pageToken` | string | No | Page token |
| `supportsAllDrives` | boolean | No | Support shared drives |
| `useDomainAdminAccess` | boolean | No | Use domain admin access |
| `includePermissionsForView` | string | No | Include permissions for view |

#### 4.3.3 Permissions: get

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /drive/v3/files/{fileId}/permissions/{permissionId}` |
| Authentication | OAuth 2.0 / Service Account |
| Response Format | JSON |

#### 4.3.4 Permissions: update

| Attribute | Value |
|-----------|-------|
| Endpoint | `PATCH /drive/v3/files/{fileId}/permissions/{permissionId}` |
| Authentication | OAuth 2.0 / Service Account |
| Request Format | JSON |
| Response Format | JSON |

**Request Body:**

| Field | Type | Description |
|-------|------|-------------|
| `role` | string | New role |
| `expirationTime` | datetime | New expiration |
| `pendingOwner` | boolean | Pending ownership |

#### 4.3.5 Permissions: delete

| Attribute | Value |
|-----------|-------|
| Endpoint | `DELETE /drive/v3/files/{fileId}/permissions/{permissionId}` |
| Authentication | OAuth 2.0 / Service Account |
| Response Format | Empty (204 No Content) |

### 4.4 Comments API

#### 4.4.1 Comments: create

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /drive/v3/files/{fileId}/comments` |
| Authentication | OAuth 2.0 / Service Account |
| Request Format | JSON |
| Response Format | JSON |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | Yes | Comment text (plain text) |
| `anchor` | string | No | Anchor location in file |
| `quotedFileContent` | object | No | Quoted content from file |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `kind` | string | Always "drive#comment" |
| `id` | string | Comment ID |
| `createdTime` | datetime | Creation time |
| `modifiedTime` | datetime | Modification time |
| `author` | object | Comment author |
| `htmlContent` | string | HTML formatted content |
| `content` | string | Plain text content |
| `deleted` | boolean | Is deleted |
| `resolved` | boolean | Is resolved |
| `quotedFileContent` | object | Quoted content |
| `anchor` | string | Anchor location |
| `replies` | array | Reply list |

#### 4.4.2 Comments: list

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /drive/v3/files/{fileId}/comments` |
| Authentication | OAuth 2.0 / Service Account |
| Response Format | JSON |
| Pagination | Cursor-based |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fileId` | string | Yes | File ID |
| `includeDeleted` | boolean | No | Include deleted comments |
| `pageSize` | integer | No | Results per page (1-100) |
| `pageToken` | string | No | Page token |
| `startModifiedTime` | string | No | Filter by modified time |

#### 4.4.3 Comments: get, update, delete

Standard CRUD operations following the same patterns as above.

### 4.5 Replies API

#### 4.5.1 Replies: create

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /drive/v3/files/{fileId}/comments/{commentId}/replies` |
| Authentication | OAuth 2.0 / Service Account |
| Request Format | JSON |
| Response Format | JSON |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | Yes | Reply text |
| `action` | string | No | Action ("resolve" or "reopen") |

### 4.6 Revisions API

#### 4.6.1 Revisions: list

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /drive/v3/files/{fileId}/revisions` |
| Authentication | OAuth 2.0 / Service Account |
| Response Format | JSON |
| Pagination | Cursor-based |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fileId` | string | Yes | File ID |
| `pageSize` | integer | No | Results per page (1-1000) |
| `pageToken` | string | No | Page token |

**Response Fields (Revision):**

| Field | Type | Description |
|-------|------|-------------|
| `kind` | string | Always "drive#revision" |
| `id` | string | Revision ID |
| `mimeType` | string | MIME type |
| `modifiedTime` | datetime | Modification time |
| `keepForever` | boolean | Keep permanently |
| `published` | boolean | Is published |
| `publishedLink` | string | Published link |
| `publishAuto` | boolean | Auto-publish |
| `publishedOutsideDomain` | boolean | Published outside domain |
| `lastModifyingUser` | object | Last modifier |
| `originalFilename` | string | Original filename |
| `md5Checksum` | string | MD5 checksum |
| `size` | string | Size in bytes |
| `exportLinks` | object | Export links |

#### 4.6.2 Revisions: get

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /drive/v3/files/{fileId}/revisions/{revisionId}` |
| Download | Add `?alt=media` for content |

#### 4.6.3 Revisions: update, delete

Standard operations for managing revisions.

### 4.7 Changes API

#### 4.7.1 Changes: getStartPageToken

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /drive/v3/changes/startPageToken` |
| Authentication | OAuth 2.0 / Service Account |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `driveId` | string | No | Shared drive ID |
| `supportsAllDrives` | boolean | No | Support shared drives |
| `teamDriveId` | string | No | Team drive ID (deprecated) |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `kind` | string | Always "drive#startPageToken" |
| `startPageToken` | string | Token for changes.list |

#### 4.7.2 Changes: list

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /drive/v3/changes` |
| Authentication | OAuth 2.0 / Service Account |
| Response Format | JSON |
| Pagination | Page token based |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pageToken` | string | Yes | Start page token |
| `driveId` | string | No | Shared drive ID |
| `includeCorpusRemovals` | boolean | No | Include corpus removals |
| `includeItemsFromAllDrives` | boolean | No | Include all drives |
| `includePermissionsForView` | string | No | Include permissions |
| `includeRemoved` | boolean | No | Include removed items |
| `includeLabels` | string | No | Include labels |
| `pageSize` | integer | No | Results per page (1-1000) |
| `restrictToMyDrive` | boolean | No | Restrict to my drive |
| `spaces` | string | No | Spaces to include |
| `supportsAllDrives` | boolean | No | Support shared drives |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `kind` | string | Always "drive#changeList" |
| `nextPageToken` | string | Token for next page |
| `newStartPageToken` | string | New start token (when complete) |
| `changes` | array | Change list |

**Change Object:**

| Field | Type | Description |
|-------|------|-------------|
| `kind` | string | Always "drive#change" |
| `removed` | boolean | File was removed |
| `file` | object | File metadata (if not removed) |
| `fileId` | string | File ID |
| `time` | datetime | Change time |
| `type` | string | "file" or "drive" |
| `changeType` | string | Change type |
| `driveId` | string | Drive ID (for drive changes) |
| `drive` | object | Drive metadata |

#### 4.7.3 Changes: watch

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /drive/v3/changes/watch` |
| Authentication | OAuth 2.0 / Service Account |
| Request Format | JSON |
| Response Format | JSON |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique channel ID |
| `type` | string | Yes | "web_hook" |
| `address` | string | Yes | Webhook URL (HTTPS) |
| `expiration` | string | No | Expiration time (ms since epoch) |
| `token` | string | No | Verification token |
| `params` | object | No | Additional parameters |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `kind` | string | Always "api#channel" |
| `id` | string | Channel ID |
| `resourceId` | string | Resource being watched |
| `resourceUri` | string | Resource URI |
| `expiration` | string | Expiration time |

### 4.8 Drives API (Shared Drives)

#### 4.8.1 Drives: list

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /drive/v3/drives` |
| Authentication | OAuth 2.0 / Service Account |
| Response Format | JSON |
| Pagination | Cursor-based |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pageSize` | integer | No | Results per page (1-100) |
| `pageToken` | string | No | Page token |
| `q` | string | No | Query string |
| `useDomainAdminAccess` | boolean | No | Use domain admin access |

#### 4.8.2 Drives: get

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /drive/v3/drives/{driveId}` |
| Authentication | OAuth 2.0 / Service Account |
| Response Format | JSON |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `kind` | string | Always "drive#drive" |
| `id` | string | Drive ID |
| `name` | string | Drive name |
| `themeId` | string | Theme ID |
| `colorRgb` | string | Color RGB |
| `backgroundImageFile` | object | Background image |
| `backgroundImageLink` | string | Background image URL |
| `capabilities` | object | User capabilities |
| `createdTime` | datetime | Creation time |
| `hidden` | boolean | Is hidden |
| `restrictions` | object | Drive restrictions |
| `orgUnitId` | string | Org unit ID |

#### 4.8.3 Drives: create, update, delete, hide, unhide

Standard CRUD operations for shared drives.

### 4.9 About API

#### 4.9.1 About: get

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /drive/v3/about` |
| Authentication | OAuth 2.0 / Service Account |
| Response Format | JSON |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fields` | string | Yes | Fields to return |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `kind` | string | Always "drive#about" |
| `user` | object | User information |
| `storageQuota` | object | Storage quota info |
| `importFormats` | object | Supported import formats |
| `exportFormats` | object | Supported export formats |
| `maxImportSizes` | object | Max import sizes |
| `maxUploadSize` | string | Max upload size |
| `appInstalled` | boolean | App is installed |
| `folderColorPalette` | array | Available folder colors |
| `driveThemes` | array | Available drive themes |
| `canCreateDrives` | boolean | Can create shared drives |
| `canCreateTeamDrives` | boolean | Can create team drives |

**Storage Quota Object:**

| Field | Type | Description |
|-------|------|-------------|
| `limit` | string | Total storage limit (bytes) |
| `usage` | string | Current usage (bytes) |
| `usageInDrive` | string | Usage in Drive (bytes) |
| `usageInDriveTrash` | string | Usage in trash (bytes) |

---

## 5. Interface Definitions

### 5.1 Rust Interfaces

#### 5.1.1 Client Interface

```rust
/// Main client for interacting with Google Drive API.
#[async_trait]
pub trait GoogleDriveClient: Send + Sync {
    /// Access the files service.
    fn files(&self) -> &dyn FilesService;

    /// Access the permissions service.
    fn permissions(&self) -> &dyn PermissionsService;

    /// Access the comments service.
    fn comments(&self) -> &dyn CommentsService;

    /// Access the replies service.
    fn replies(&self) -> &dyn RepliesService;

    /// Access the revisions service.
    fn revisions(&self) -> &dyn RevisionsService;

    /// Access the changes service.
    fn changes(&self) -> &dyn ChangesService;

    /// Access the drives service (shared drives).
    fn drives(&self) -> &dyn DrivesService;

    /// Access the about service.
    fn about(&self) -> &dyn AboutService;

    /// Get storage quota information.
    async fn get_storage_quota(&self) -> Result<StorageQuota, GoogleDriveError>;
}

/// Factory for creating Google Drive clients.
pub trait GoogleDriveClientFactory: Send + Sync {
    /// Create a new client with the given configuration.
    fn create(&self, config: GoogleDriveConfig) -> Result<Arc<dyn GoogleDriveClient>, GoogleDriveError>;
}
```

#### 5.1.2 Files Service Interface

```rust
/// Service for file operations.
#[async_trait]
pub trait FilesService: Send + Sync {
    /// Create a new file (metadata only).
    async fn create(
        &self,
        request: CreateFileRequest,
    ) -> Result<File, GoogleDriveError>;

    /// Create a file with content (simple upload, <= 5MB).
    async fn create_with_content(
        &self,
        request: CreateFileWithContentRequest,
    ) -> Result<File, GoogleDriveError>;

    /// Create a file with content using multipart upload (metadata + content).
    async fn create_multipart(
        &self,
        request: CreateMultipartRequest,
    ) -> Result<File, GoogleDriveError>;

    /// Create a file with content using resumable upload (large files).
    async fn create_resumable(
        &self,
        request: CreateResumableRequest,
    ) -> Result<ResumableUploadSession, GoogleDriveError>;

    /// Get file metadata.
    async fn get(
        &self,
        file_id: &str,
        params: Option<GetFileParams>,
    ) -> Result<File, GoogleDriveError>;

    /// Download file content.
    async fn download(
        &self,
        file_id: &str,
        params: Option<DownloadParams>,
    ) -> Result<Bytes, GoogleDriveError>;

    /// Download file content as a stream.
    async fn download_stream(
        &self,
        file_id: &str,
        params: Option<DownloadParams>,
    ) -> Result<impl Stream<Item = Result<Bytes, GoogleDriveError>>, GoogleDriveError>;

    /// List files with optional query.
    async fn list(
        &self,
        params: Option<ListFilesParams>,
    ) -> Result<FileList, GoogleDriveError>;

    /// List all files with auto-pagination.
    fn list_all(
        &self,
        params: Option<ListFilesParams>,
    ) -> impl Stream<Item = Result<File, GoogleDriveError>> + Send;

    /// Update file metadata.
    async fn update(
        &self,
        file_id: &str,
        request: UpdateFileRequest,
    ) -> Result<File, GoogleDriveError>;

    /// Update file content.
    async fn update_content(
        &self,
        file_id: &str,
        request: UpdateFileContentRequest,
    ) -> Result<File, GoogleDriveError>;

    /// Delete a file permanently.
    async fn delete(
        &self,
        file_id: &str,
        params: Option<DeleteFileParams>,
    ) -> Result<(), GoogleDriveError>;

    /// Copy a file.
    async fn copy(
        &self,
        file_id: &str,
        request: CopyFileRequest,
    ) -> Result<File, GoogleDriveError>;

    /// Export a Google Workspace file.
    async fn export(
        &self,
        file_id: &str,
        mime_type: &str,
    ) -> Result<Bytes, GoogleDriveError>;

    /// Export a Google Workspace file as stream.
    async fn export_stream(
        &self,
        file_id: &str,
        mime_type: &str,
    ) -> Result<impl Stream<Item = Result<Bytes, GoogleDriveError>>, GoogleDriveError>;

    /// Generate file IDs for pre-creating files.
    async fn generate_ids(
        &self,
        params: Option<GenerateIdsParams>,
    ) -> Result<GeneratedIds, GoogleDriveError>;

    /// Empty the trash.
    async fn empty_trash(
        &self,
        params: Option<EmptyTrashParams>,
    ) -> Result<(), GoogleDriveError>;

    /// Move a file to a different folder.
    async fn move_file(
        &self,
        file_id: &str,
        add_parents: Vec<String>,
        remove_parents: Vec<String>,
    ) -> Result<File, GoogleDriveError>;

    /// Create a folder.
    async fn create_folder(
        &self,
        request: CreateFolderRequest,
    ) -> Result<File, GoogleDriveError>;
}
```

#### 5.1.3 Resumable Upload Interface

```rust
/// Resumable upload session for large files.
#[async_trait]
pub trait ResumableUploadSession: Send + Sync {
    /// Get the resumable upload URI.
    fn upload_uri(&self) -> &str;

    /// Upload a chunk of data.
    async fn upload_chunk(
        &self,
        chunk: Bytes,
        offset: u64,
        total_size: u64,
    ) -> Result<UploadChunkResult, GoogleDriveError>;

    /// Upload the entire content from a stream.
    async fn upload_stream(
        &self,
        stream: impl Stream<Item = Result<Bytes, GoogleDriveError>> + Send,
        total_size: u64,
        chunk_size: usize,
    ) -> Result<File, GoogleDriveError>;

    /// Query the current upload status.
    async fn query_status(&self) -> Result<UploadStatus, GoogleDriveError>;

    /// Resume an interrupted upload.
    async fn resume(&self) -> Result<UploadStatus, GoogleDriveError>;

    /// Cancel the upload.
    async fn cancel(&self) -> Result<(), GoogleDriveError>;
}

/// Result of uploading a chunk.
pub enum UploadChunkResult {
    /// More chunks needed.
    InProgress { bytes_received: u64 },
    /// Upload complete.
    Complete(File),
}

/// Status of a resumable upload.
pub struct UploadStatus {
    pub bytes_received: u64,
    pub total_size: u64,
    pub is_complete: bool,
}
```

#### 5.1.4 Permissions Service Interface

```rust
/// Service for permission operations.
#[async_trait]
pub trait PermissionsService: Send + Sync {
    /// Create a new permission.
    async fn create(
        &self,
        file_id: &str,
        request: CreatePermissionRequest,
    ) -> Result<Permission, GoogleDriveError>;

    /// List permissions for a file.
    async fn list(
        &self,
        file_id: &str,
        params: Option<ListPermissionsParams>,
    ) -> Result<PermissionList, GoogleDriveError>;

    /// Get a specific permission.
    async fn get(
        &self,
        file_id: &str,
        permission_id: &str,
        params: Option<GetPermissionParams>,
    ) -> Result<Permission, GoogleDriveError>;

    /// Update a permission.
    async fn update(
        &self,
        file_id: &str,
        permission_id: &str,
        request: UpdatePermissionRequest,
    ) -> Result<Permission, GoogleDriveError>;

    /// Delete a permission.
    async fn delete(
        &self,
        file_id: &str,
        permission_id: &str,
        params: Option<DeletePermissionParams>,
    ) -> Result<(), GoogleDriveError>;
}
```

#### 5.1.5 Changes Service Interface

```rust
/// Service for change tracking.
#[async_trait]
pub trait ChangesService: Send + Sync {
    /// Get the start page token for change tracking.
    async fn get_start_page_token(
        &self,
        params: Option<GetStartPageTokenParams>,
    ) -> Result<StartPageToken, GoogleDriveError>;

    /// List changes since a page token.
    async fn list(
        &self,
        page_token: &str,
        params: Option<ListChangesParams>,
    ) -> Result<ChangeList, GoogleDriveError>;

    /// List all changes with auto-pagination.
    fn list_all(
        &self,
        start_page_token: &str,
        params: Option<ListChangesParams>,
    ) -> impl Stream<Item = Result<Change, GoogleDriveError>> + Send;

    /// Watch for changes via push notifications.
    async fn watch(
        &self,
        page_token: &str,
        request: WatchChangesRequest,
    ) -> Result<Channel, GoogleDriveError>;

    /// Stop watching for changes.
    async fn stop_watch(
        &self,
        channel: &Channel,
    ) -> Result<(), GoogleDriveError>;
}
```

#### 5.1.6 Transport Interface

```rust
/// HTTP transport abstraction for testability.
#[async_trait]
pub trait HttpTransport: Send + Sync {
    /// Send an HTTP request and receive a response.
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError>;

    /// Send a request and receive raw bytes.
    async fn send_raw(&self, request: HttpRequest) -> Result<Bytes, TransportError>;

    /// Send a request and receive a streaming response.
    async fn send_streaming(
        &self,
        request: HttpRequest,
    ) -> Result<impl Stream<Item = Result<Bytes, TransportError>>, TransportError>;
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
    /// Fixed-size bytes.
    Bytes(Bytes),
    /// Streaming body.
    Stream(BoxStream<'static, Result<Bytes, GoogleDriveError>>),
    /// Multipart body.
    Multipart(MultipartBody),
}

/// HTTP response representation.
pub struct HttpResponse {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub body: Bytes,
}
```

#### 5.1.7 Authentication Interface

```rust
/// Authentication provider abstraction.
#[async_trait]
pub trait AuthProvider: Send + Sync {
    /// Get an access token for API requests.
    async fn get_access_token(&self) -> Result<AccessToken, AuthError>;

    /// Force refresh the access token.
    async fn refresh_token(&self) -> Result<AccessToken, AuthError>;

    /// Check if the current token is expired.
    fn is_expired(&self) -> bool;
}

/// Access token with metadata.
pub struct AccessToken {
    /// The token string.
    pub token: SecretString,
    /// Token type (usually "Bearer").
    pub token_type: String,
    /// Expiration time.
    pub expires_at: DateTime<Utc>,
    /// Scopes granted.
    pub scopes: Vec<String>,
}

/// OAuth 2.0 authentication provider.
pub struct OAuth2Provider {
    client_id: String,
    client_secret: SecretString,
    refresh_token: SecretString,
    // Internal state
    cached_token: Option<AccessToken>,
}

/// Service account authentication provider.
pub struct ServiceAccountProvider {
    service_account_email: String,
    private_key: SecretString,
    scopes: Vec<String>,
    subject: Option<String>, // For domain-wide delegation
    // Internal state
    cached_token: Option<AccessToken>,
}
```

#### 5.1.8 Configuration Types

```rust
/// Configuration for the Google Drive client.
#[derive(Clone)]
pub struct GoogleDriveConfig {
    /// Authentication provider.
    pub auth_provider: Arc<dyn AuthProvider>,

    /// Base URL for the API.
    pub base_url: Url,

    /// Upload URL for the API.
    pub upload_url: Url,

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

    /// Chunk size for resumable uploads (must be multiple of 256KB).
    pub upload_chunk_size: usize,

    /// User agent string.
    pub user_agent: String,

    /// Fields to always include in responses.
    pub default_fields: Option<String>,
}

impl Default for GoogleDriveConfig {
    fn default() -> Self {
        Self {
            auth_provider: Arc::new(NoAuthProvider),
            base_url: Url::parse("https://www.googleapis.com/drive/v3").unwrap(),
            upload_url: Url::parse("https://www.googleapis.com/upload/drive/v3").unwrap(),
            timeout: Duration::from_secs(300),
            max_retries: 3,
            retry_config: RetryConfig::default(),
            circuit_breaker_config: CircuitBreakerConfig::default(),
            rate_limit_config: None,
            upload_chunk_size: 8 * 1024 * 1024, // 8MB default
            user_agent: format!("integrations-google-drive/{}", env!("CARGO_PKG_VERSION")),
            default_fields: None,
        }
    }
}

/// OAuth 2.0 scopes for Google Drive.
pub mod scopes {
    /// Full access to Drive files.
    pub const DRIVE: &str = "https://www.googleapis.com/auth/drive";

    /// Read-only access to file metadata and content.
    pub const DRIVE_READONLY: &str = "https://www.googleapis.com/auth/drive.readonly";

    /// Access to files created by the app.
    pub const DRIVE_FILE: &str = "https://www.googleapis.com/auth/drive.file";

    /// Access to app data folder.
    pub const DRIVE_APPDATA: &str = "https://www.googleapis.com/auth/drive.appdata";

    /// Read-only access to file metadata (no content).
    pub const DRIVE_METADATA_READONLY: &str = "https://www.googleapis.com/auth/drive.metadata.readonly";

    /// Access to file metadata (read/write).
    pub const DRIVE_METADATA: &str = "https://www.googleapis.com/auth/drive.metadata";

    /// Access to Google Photos.
    pub const DRIVE_PHOTOS_READONLY: &str = "https://www.googleapis.com/auth/drive.photos.readonly";
}
```

### 5.2 TypeScript Interfaces

#### 5.2.1 Client Interface

```typescript
/**
 * Main client for interacting with Google Drive API.
 */
interface GoogleDriveClient {
  /** Access the files service. */
  readonly files: FilesService;

  /** Access the permissions service. */
  readonly permissions: PermissionsService;

  /** Access the comments service. */
  readonly comments: CommentsService;

  /** Access the replies service. */
  readonly replies: RepliesService;

  /** Access the revisions service. */
  readonly revisions: RevisionsService;

  /** Access the changes service. */
  readonly changes: ChangesService;

  /** Access the drives service (shared drives). */
  readonly drives: DrivesService;

  /** Access the about service. */
  readonly about: AboutService;

  /** Get storage quota information. */
  getStorageQuota(): Promise<StorageQuota>;
}

/**
 * Factory for creating Google Drive clients.
 */
interface GoogleDriveClientFactory {
  create(config: GoogleDriveConfig): GoogleDriveClient;
}
```

#### 5.2.2 Configuration Types

```typescript
/**
 * Configuration for the Google Drive client.
 */
interface GoogleDriveConfig {
  /** Authentication provider. */
  auth: AuthProvider | OAuth2Credentials | ServiceAccountCredentials;

  /** Base URL for the API. */
  baseUrl?: string;

  /** Upload URL for the API. */
  uploadUrl?: string;

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

  /** Chunk size for resumable uploads. */
  uploadChunkSize?: number;

  /** User agent string. */
  userAgent?: string;

  /** Fields to always include in responses. */
  defaultFields?: string;
}

/**
 * OAuth 2.0 credentials.
 */
interface OAuth2Credentials {
  type: 'oauth2';
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string;
  expiresAt?: Date;
}

/**
 * Service account credentials.
 */
interface ServiceAccountCredentials {
  type: 'service_account';
  clientEmail: string;
  privateKey: string;
  privateKeyId?: string;
  projectId?: string;
  scopes: string[];
  subject?: string; // For domain-wide delegation
}

/**
 * Authentication provider interface.
 */
interface AuthProvider {
  getAccessToken(): Promise<AccessToken>;
  refreshToken(): Promise<AccessToken>;
  isExpired(): boolean;
}

/**
 * Access token with metadata.
 */
interface AccessToken {
  token: string;
  tokenType: string;
  expiresAt: Date;
  scopes: string[];
}
```

#### 5.2.3 File Types

```typescript
/**
 * Google Drive file representation.
 */
interface DriveFile {
  kind: 'drive#file';
  id: string;
  name: string;
  mimeType: string;
  description?: string;
  starred: boolean;
  trashed: boolean;
  explicitlyTrashed: boolean;
  parents?: string[];
  properties?: Record<string, string>;
  appProperties?: Record<string, string>;
  spaces: string[];
  version: string;
  webContentLink?: string;
  webViewLink?: string;
  iconLink?: string;
  hasThumbnail: boolean;
  thumbnailLink?: string;
  thumbnailVersion?: string;
  viewedByMe: boolean;
  viewedByMeTime?: string;
  createdTime: string;
  modifiedTime: string;
  modifiedByMeTime?: string;
  modifiedByMe: boolean;
  sharedWithMeTime?: string;
  sharingUser?: User;
  owners: User[];
  driveId?: string;
  lastModifyingUser?: User;
  shared: boolean;
  ownedByMe: boolean;
  capabilities: FileCapabilities;
  viewersCanCopyContent: boolean;
  copyRequiresWriterPermission: boolean;
  writersCanShare: boolean;
  permissions?: Permission[];
  permissionIds?: string[];
  hasAugmentedPermissions: boolean;
  originalFilename?: string;
  fullFileExtension?: string;
  fileExtension?: string;
  md5Checksum?: string;
  sha1Checksum?: string;
  sha256Checksum?: string;
  size?: string;
  quotaBytesUsed?: string;
  headRevisionId?: string;
  contentHints?: ContentHints;
  imageMediaMetadata?: ImageMediaMetadata;
  videoMediaMetadata?: VideoMediaMetadata;
  isAppAuthorized: boolean;
  exportLinks?: Record<string, string>;
  shortcutDetails?: ShortcutDetails;
  contentRestrictions?: ContentRestriction[];
  resourceKey?: string;
  linkShareMetadata?: LinkShareMetadata;
}

/**
 * User capabilities on a file.
 */
interface FileCapabilities {
  canAddChildren: boolean;
  canAddFolderFromAnotherDrive: boolean;
  canAddMyDriveParent: boolean;
  canChangeCopyRequiresWriterPermission: boolean;
  canChangeSecurityUpdateEnabled: boolean;
  canChangeViewersCanCopyContent: boolean;
  canComment: boolean;
  canCopy: boolean;
  canDelete: boolean;
  canDeleteChildren: boolean;
  canDownload: boolean;
  canEdit: boolean;
  canListChildren: boolean;
  canModifyContent: boolean;
  canModifyContentRestriction: boolean;
  canModifyLabels: boolean;
  canMoveChildrenOutOfDrive: boolean;
  canMoveChildrenOutOfTeamDrive: boolean;
  canMoveChildrenWithinDrive: boolean;
  canMoveChildrenWithinTeamDrive: boolean;
  canMoveItemIntoTeamDrive: boolean;
  canMoveItemOutOfDrive: boolean;
  canMoveItemOutOfTeamDrive: boolean;
  canMoveItemWithinDrive: boolean;
  canMoveItemWithinTeamDrive: boolean;
  canMoveTeamDriveItem: boolean;
  canReadDrive: boolean;
  canReadLabels: boolean;
  canReadRevisions: boolean;
  canReadTeamDrive: boolean;
  canRemoveChildren: boolean;
  canRemoveMyDriveParent: boolean;
  canRename: boolean;
  canShare: boolean;
  canTrash: boolean;
  canTrashChildren: boolean;
  canUntrash: boolean;
}

/**
 * Permission representation.
 */
interface Permission {
  kind: 'drive#permission';
  id: string;
  type: 'user' | 'group' | 'domain' | 'anyone';
  role: 'owner' | 'organizer' | 'fileOrganizer' | 'writer' | 'commenter' | 'reader';
  emailAddress?: string;
  domain?: string;
  displayName?: string;
  photoLink?: string;
  expirationTime?: string;
  teamDrivePermissionDetails?: TeamDrivePermissionDetails[];
  permissionDetails?: PermissionDetails[];
  allowFileDiscovery?: boolean;
  deleted?: boolean;
  view?: string;
  pendingOwner?: boolean;
}

/**
 * File list response.
 */
interface FileList {
  kind: 'drive#fileList';
  nextPageToken?: string;
  incompleteSearch: boolean;
  files: DriveFile[];
}

/**
 * Request to create a file.
 */
interface CreateFileRequest {
  name: string;
  mimeType?: string;
  description?: string;
  parents?: string[];
  properties?: Record<string, string>;
  appProperties?: Record<string, string>;
  starred?: boolean;
  folderColorRgb?: string;
  contentHints?: ContentHints;
  contentRestrictions?: ContentRestriction[];
  copyRequiresWriterPermission?: boolean;
  shortcutDetails?: ShortcutDetails;
  writersCanShare?: boolean;
}

/**
 * Parameters for listing files.
 */
interface ListFilesParams {
  corpora?: 'user' | 'drive' | 'allDrives';
  driveId?: string;
  includeItemsFromAllDrives?: boolean;
  includePermissionsForView?: string;
  includeLabels?: string;
  orderBy?: string;
  pageSize?: number;
  pageToken?: string;
  q?: string;
  spaces?: string;
  supportsAllDrives?: boolean;
  fields?: string;
}
```

#### 5.2.4 Pagination Types

```typescript
/**
 * Paginated results from Google Drive API.
 */
interface Paginated<T> {
  /** Current page items. */
  items: T[];

  /** Token for next page. */
  nextPageToken?: string;

  /** Was the search incomplete. */
  incompleteSearch?: boolean;

  /** Check if there are more pages. */
  hasNext(): boolean;
}

/**
 * Async iterator over all pages.
 */
interface PageIterator<T> extends AsyncIterable<T> {
  /** Fetch the next page of results. */
  nextPage(): Promise<T[] | null>;

  /** Collect all remaining items. */
  collectAll(): Promise<T[]>;
}
```

---

## 6. Error Taxonomy

### 6.1 Error Hierarchy

```
GoogleDriveError
├── ConfigurationError
│   ├── MissingCredentials
│   ├── InvalidCredentials
│   ├── InvalidConfiguration
│   └── MissingScope
│
├── AuthenticationError
│   ├── InvalidToken
│   ├── ExpiredToken
│   ├── RefreshFailed
│   ├── InvalidGrant
│   └── InsufficientPermissions
│
├── AuthorizationError
│   ├── Forbidden
│   ├── InsufficientPermissions
│   ├── FileNotAccessible
│   ├── DomainPolicy
│   └── UserRateLimitExceeded
│
├── RequestError
│   ├── ValidationError
│   ├── InvalidParameter
│   ├── MissingParameter
│   ├── InvalidQuery
│   ├── InvalidRange
│   └── InvalidMimeType
│
├── ResourceError
│   ├── FileNotFound
│   ├── FolderNotFound
│   ├── PermissionNotFound
│   ├── CommentNotFound
│   ├── RevisionNotFound
│   ├── DriveNotFound
│   ├── AlreadyExists
│   └── CannotModify
│
├── QuotaError
│   ├── StorageQuotaExceeded
│   ├── UserRateLimitExceeded
│   ├── DailyLimitExceeded
│   └── ProjectRateLimitExceeded
│
├── UploadError
│   ├── UploadInterrupted
│   ├── UploadFailed
│   ├── InvalidUploadRequest
│   ├── UploadSizeExceeded
│   ├── ResumableUploadExpired
│   └── ChunkSizeMismatch
│
├── ExportError
│   ├── ExportNotSupported
│   ├── ExportSizeExceeded
│   └── InvalidExportFormat
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
│   ├── ServiceUnavailable
│   └── BadGateway
│
└── ResponseError
    ├── DeserializationError
    ├── UnexpectedFormat
    └── InvalidJson
```

### 6.2 Error Type Definitions (Rust)

```rust
/// Top-level error type for the Google Drive integration.
#[derive(Debug, thiserror::Error)]
pub enum GoogleDriveError {
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

    #[error("Upload error: {0}")]
    Upload(#[from] UploadError),

    #[error("Export error: {0}")]
    Export(#[from] ExportError),

    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    #[error("Server error: {0}")]
    Server(#[from] ServerError),

    #[error("Response error: {0}")]
    Response(#[from] ResponseError),
}

impl GoogleDriveError {
    /// Returns true if the error is retryable.
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            GoogleDriveError::Quota(QuotaError::UserRateLimitExceeded { .. })
                | GoogleDriveError::Network(NetworkError::Timeout { .. })
                | GoogleDriveError::Network(NetworkError::ConnectionFailed { .. })
                | GoogleDriveError::Server(ServerError::InternalError { .. })
                | GoogleDriveError::Server(ServerError::ServiceUnavailable { .. })
                | GoogleDriveError::Server(ServerError::BackendError { .. })
                | GoogleDriveError::Upload(UploadError::UploadInterrupted { .. })
        )
    }

    /// Returns the retry delay hint if available.
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            GoogleDriveError::Quota(QuotaError::UserRateLimitExceeded { retry_after, .. }) => {
                *retry_after
            }
            GoogleDriveError::Server(ServerError::ServiceUnavailable { retry_after, .. }) => {
                *retry_after
            }
            _ => None,
        }
    }

    /// Returns the HTTP status code if applicable.
    pub fn status_code(&self) -> Option<StatusCode> {
        match self {
            GoogleDriveError::Authentication(_) => Some(StatusCode::UNAUTHORIZED),
            GoogleDriveError::Authorization(_) => Some(StatusCode::FORBIDDEN),
            GoogleDriveError::Request(_) => Some(StatusCode::BAD_REQUEST),
            GoogleDriveError::Resource(ResourceError::FileNotFound { .. }) => {
                Some(StatusCode::NOT_FOUND)
            }
            GoogleDriveError::Quota(_) => Some(StatusCode::TOO_MANY_REQUESTS),
            GoogleDriveError::Server(ServerError::InternalError { .. }) => {
                Some(StatusCode::INTERNAL_SERVER_ERROR)
            }
            GoogleDriveError::Server(ServerError::ServiceUnavailable { .. }) => {
                Some(StatusCode::SERVICE_UNAVAILABLE)
            }
            _ => None,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum QuotaError {
    #[error("Storage quota exceeded: {message}")]
    StorageQuotaExceeded {
        message: String,
        limit: u64,
        used: u64,
    },

    #[error("User rate limit exceeded: {message}")]
    UserRateLimitExceeded {
        message: String,
        retry_after: Option<Duration>,
    },

    #[error("Daily limit exceeded: {message}")]
    DailyLimitExceeded {
        message: String,
        domain: Option<String>,
    },

    #[error("Project rate limit exceeded: {message}")]
    ProjectRateLimitExceeded {
        message: String,
        retry_after: Option<Duration>,
    },
}
```

### 6.3 Error Mapping from HTTP

| HTTP Status | Error Reason | Error Type | Retryable |
|-------------|--------------|------------|-----------|
| 400 | `invalidParameter` | `RequestError::InvalidParameter` | No |
| 400 | `invalidQuery` | `RequestError::InvalidQuery` | No |
| 400 | `badRequest` | `RequestError::ValidationError` | No |
| 401 | `authError` | `AuthenticationError::InvalidToken` | No |
| 401 | `expired` | `AuthenticationError::ExpiredToken` | No (refresh) |
| 403 | `forbidden` | `AuthorizationError::Forbidden` | No |
| 403 | `insufficientPermissions` | `AuthorizationError::InsufficientPermissions` | No |
| 403 | `domainPolicy` | `AuthorizationError::DomainPolicy` | No |
| 403 | `userRateLimitExceeded` | `QuotaError::UserRateLimitExceeded` | Yes |
| 403 | `rateLimitExceeded` | `QuotaError::ProjectRateLimitExceeded` | Yes |
| 403 | `storageQuotaExceeded` | `QuotaError::StorageQuotaExceeded` | No |
| 404 | `notFound` | `ResourceError::FileNotFound` | No |
| 429 | `rateLimitExceeded` | `QuotaError::UserRateLimitExceeded` | Yes |
| 500 | `internalError` | `ServerError::InternalError` | Yes |
| 502 | `badGateway` | `ServerError::BadGateway` | Yes |
| 503 | `serviceUnavailable` | `ServerError::ServiceUnavailable` | Yes |
| 503 | `backendError` | `ServerError::BackendError` | Yes |

---

## 7. Resilience Hooks

### 7.1 Retry Integration

The module integrates with `integrations-retry` for automatic retry of transient failures.

```rust
/// Retry configuration for Google Drive requests.
pub struct GoogleDriveRetryConfig {
    /// Base configuration from primitives.
    pub base: RetryConfig,

    /// Override retry behavior per error type.
    pub error_overrides: HashMap<ErrorCategory, RetryBehavior>,

    /// Respect Retry-After headers.
    pub respect_retry_after: bool,
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
| `QuotaError::UserRateLimitExceeded` | Yes | 5 | Use `retry-after` or 60s |
| `QuotaError::ProjectRateLimitExceeded` | Yes | 3 | Use `retry-after` or 60s |
| `NetworkError::Timeout` | Yes | 3 | 1s exponential |
| `NetworkError::ConnectionFailed` | Yes | 3 | 1s exponential |
| `ServerError::InternalError` | Yes | 3 | 5s exponential |
| `ServerError::ServiceUnavailable` | Yes | 3 | Use `retry-after` or 30s |
| `ServerError::BackendError` | Yes | 3 | 5s exponential |
| `UploadError::UploadInterrupted` | Yes | 3 | 1s exponential |
| All others | No | - | - |

### 7.2 Circuit Breaker Integration

The module integrates with `integrations-circuit-breaker` to prevent cascading failures.

```rust
/// Circuit breaker configuration for Google Drive.
pub struct GoogleDriveCircuitBreakerConfig {
    /// Base configuration from primitives.
    pub base: CircuitBreakerConfig,

    /// Failure threshold before opening.
    pub failure_threshold: u32,

    /// Success threshold to close.
    pub success_threshold: u32,

    /// Time before attempting half-open.
    pub reset_timeout: Duration,
}

impl Default for GoogleDriveCircuitBreakerConfig {
    fn default() -> Self {
        Self {
            base: CircuitBreakerConfig::default(),
            failure_threshold: 5,
            success_threshold: 3,
            reset_timeout: Duration::from_secs(60),
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
/// Rate limit configuration for Google Drive.
pub struct GoogleDriveRateLimitConfig {
    /// Track rate limits from response headers.
    pub track_from_headers: bool,

    /// Pre-emptive rate limiting based on tracked state.
    pub preemptive_throttling: bool,

    /// Maximum queries per 100 seconds per user.
    pub user_queries_per_100_seconds: u32,

    /// Maximum queries per day per project.
    pub project_queries_per_day: u32,

    /// Maximum concurrent requests.
    pub max_concurrent_requests: Option<u32>,
}

impl Default for GoogleDriveRateLimitConfig {
    fn default() -> Self {
        Self {
            track_from_headers: true,
            preemptive_throttling: true,
            user_queries_per_100_seconds: 1000,
            project_queries_per_day: 10_000_000,
            max_concurrent_requests: Some(10),
        }
    }
}
```

**Google Drive Rate Limits:**

| Limit Type | Value | Scope |
|------------|-------|-------|
| Queries per 100 seconds per user | 1,000 | Per user |
| Queries per day | 10,000,000 | Per project |
| Upload bandwidth | Varies | Per user/project |

**Rate Limit Handling:**

1. **Track from errors**: Parse 403/429 responses for rate limit info
2. **Pre-emptive throttling**: Slow down when approaching limits
3. **Respect Retry-After**: Honor server-specified delays
4. **Exponential backoff**: For repeated rate limits

---

## 8. Security Requirements

### 8.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| Access tokens never logged | Use `SecretString`, redact in Debug |
| Refresh tokens protected | `SecretString` with Zeroize |
| Private keys secured | Never store unencrypted, `SecretString` |
| Tokens not in stack traces | No Display impl, zero on drop |
| Service account keys | Load from secure storage only |

### 8.2 OAuth 2.0 Security

| Requirement | Implementation |
|-------------|----------------|
| Use HTTPS for token exchange | Enforce TLS 1.2+ |
| Validate token responses | Check for required fields |
| Store refresh tokens securely | Encrypted at rest |
| Handle token revocation | Clear cached tokens |
| Minimal scope request | Request only needed scopes |

### 8.3 Transport Security

| Requirement | Implementation |
|-------------|----------------|
| TLS 1.2+ only | Configure in HTTP client |
| Certificate validation | Enable by default |
| No insecure fallback | Fail on TLS errors |
| HTTPS required | No HTTP endpoints |

### 8.4 Service Account Security

| Requirement | Implementation |
|-------------|----------------|
| Private key protection | Never expose, rotate regularly |
| JWT signing | Use RS256, short expiration |
| Domain-wide delegation | Minimize subjects, audit |
| Scope restrictions | Limit to required scopes |

### 8.5 Input Validation

| Requirement | Implementation |
|-------------|----------------|
| Validate file IDs | Alphanumeric pattern |
| Validate query syntax | Parse before sending |
| Sanitize file names | Remove unsafe characters |
| Validate MIME types | Against allowed list |

### 8.6 Output Handling

| Requirement | Implementation |
|-------------|----------------|
| Response validation | Type-checked deserialization |
| Sanitize user content | Escape for display |
| Error message safety | No credential exposure |

---

## 9. Observability Requirements

### 9.1 Tracing

Every API call must create a trace span with:

| Attribute | Type | Description |
|-----------|------|-------------|
| `google_drive.service` | string | Service name (e.g., "files") |
| `google_drive.operation` | string | Operation name (e.g., "list") |
| `google_drive.file_id` | string | File ID (if applicable) |
| `google_drive.folder_id` | string | Folder ID (if applicable) |
| `google_drive.drive_id` | string | Shared drive ID (if applicable) |
| `google_drive.query` | string | Query string (sanitized) |
| `google_drive.page_size` | integer | Requested page size |
| `google_drive.upload_type` | string | Upload type (simple/multipart/resumable) |
| `http.method` | string | HTTP method |
| `http.url` | string | Request URL (sanitized) |
| `http.status_code` | integer | HTTP response status |
| `error.type` | string | Error category (if failed) |
| `error.message` | string | Error message (if failed) |

### 9.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `google_drive_requests_total` | Counter | `service`, `operation`, `method`, `status` |
| `google_drive_request_duration_seconds` | Histogram | `service`, `operation`, `method` |
| `google_drive_errors_total` | Counter | `service`, `error_type` |
| `google_drive_rate_limit_hits_total` | Counter | `type` (user/project) |
| `google_drive_circuit_breaker_state` | Gauge | `state` |
| `google_drive_pagination_requests_total` | Counter | `service`, `operation` |
| `google_drive_upload_bytes_total` | Counter | `upload_type` |
| `google_drive_download_bytes_total` | Counter | - |
| `google_drive_upload_duration_seconds` | Histogram | `upload_type` |
| `google_drive_resumable_upload_retries_total` | Counter | - |

### 9.3 Logging

| Level | When |
|-------|------|
| `ERROR` | Non-retryable failures, configuration errors, auth failures |
| `WARN` | Rate limits, circuit breaker trips, retryable failures |
| `INFO` | Request completion, upload progress, large operations |
| `DEBUG` | Request/response details (sanitized), pagination progress |
| `TRACE` | Raw HTTP details, token refresh |

**Log Fields:**

| Field | Description |
|-------|-------------|
| `file_id` | File ID |
| `folder_id` | Folder ID |
| `operation` | API operation |
| `duration_ms` | Request duration |
| `status_code` | HTTP status |
| `error.type` | Error category |
| `error.reason` | Google API error reason |
| `retry.attempt` | Current retry attempt |
| `upload.bytes_sent` | Bytes uploaded |
| `upload.total_size` | Total upload size |
| `upload.upload_id` | Resumable upload ID |

---

## 10. Performance Requirements

### 10.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| Request serialization | < 1ms | < 5ms |
| Response deserialization | < 5ms | < 20ms |
| Token refresh | < 500ms | < 2s |
| Pagination iteration | < 1ms overhead | < 5ms overhead |
| Presigned URL generation | N/A | N/A (not supported) |

### 10.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Concurrent requests | 10-50 (configurable) |
| Sequential pagination | Line-rate with API |
| Upload throughput | Network-limited |
| Download throughput | Network-limited |
| Resumable upload chunks | 8MB default |

### 10.3 Resource Limits

| Resource | Limit |
|----------|-------|
| Memory per request | < 1MB typical |
| Memory per pagination | < 10KB per page |
| Connection pool size | Configurable (default: 10) |
| Upload chunk size | 256KB min, 8MB default, no max |
| Download streaming buffer | Configurable |

---

## 11. Future-Proofing

### 11.1 Extensibility Points

| Extension Point | Mechanism |
|-----------------|-----------|
| New API endpoints | Add new service trait + implementation |
| New file types | Extend MIME type handling |
| New auth methods | Extend `AuthProvider` trait |
| Custom transport | Implement `HttpTransport` trait |
| Custom retry logic | Implement retry hooks |
| New export formats | Extend export format map |

### 11.2 Version Compatibility

| Aspect | Strategy |
|--------|----------|
| API version | Use v3, monitor deprecations |
| Response fields | `#[serde(flatten)]` for unknown fields |
| Request fields | Builder pattern with optional fields |
| Breaking changes | Major version bump, migration guide |
| Preview features | Behind feature flag |

### 11.3 Deprecation Policy

1. **Announce**: Minimum 1 minor version before removal
2. **Warn**: Log warning when deprecated feature used
3. **Document**: Migration path in release notes
4. **Remove**: Only in major version

---

## 12. Acceptance Criteria

### 12.1 Functional Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| FC-1 | Create file with metadata works | Integration test |
| FC-2 | Create file with simple upload works | Integration test |
| FC-3 | Create file with multipart upload works | Integration test |
| FC-4 | Create file with resumable upload works | Integration test |
| FC-5 | Get file metadata works | Integration test |
| FC-6 | Download file content works | Integration test |
| FC-7 | Download file as stream works | Integration test |
| FC-8 | List files with query works | Integration test |
| FC-9 | List files with pagination works | Integration test |
| FC-10 | Update file metadata works | Integration test |
| FC-11 | Update file content works | Integration test |
| FC-12 | Delete file works | Integration test |
| FC-13 | Copy file works | Integration test |
| FC-14 | Move file works | Integration test |
| FC-15 | Create folder works | Integration test |
| FC-16 | Export Google Docs works | Integration test |
| FC-17 | Create permission works | Integration test |
| FC-18 | List permissions works | Integration test |
| FC-19 | Update permission works | Integration test |
| FC-20 | Delete permission works | Integration test |
| FC-21 | Create comment works | Integration test |
| FC-22 | List comments works | Integration test |
| FC-23 | List revisions works | Integration test |
| FC-24 | Download revision works | Integration test |
| FC-25 | Get start page token works | Integration test |
| FC-26 | List changes works | Integration test |
| FC-27 | OAuth 2.0 authentication works | Integration test |
| FC-28 | Service Account authentication works | Integration test |
| FC-29 | Token refresh works | Integration test |
| FC-30 | All error types mapped correctly | Unit tests |
| FC-31 | Shared drives operations work | Integration test |
| FC-32 | About/quota operations work | Integration test |

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
| NFC-8 | All requests traced | Integration tests |
| NFC-9 | Metrics emitted correctly | Integration tests |
| NFC-10 | Test coverage > 80% | Coverage report |
| NFC-11 | Resumable upload can resume | Integration test |
| NFC-12 | Large file upload works (> 100MB) | Integration test |

### 12.3 Documentation Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| DC-1 | All public APIs documented | Doc coverage |
| DC-2 | Examples for common operations | Doc review |
| DC-3 | Error handling documented | Doc review |
| DC-4 | Configuration options documented | Doc review |
| DC-5 | Authentication setup documented | Doc review |
| DC-6 | Migration guides for breaking changes | Release notes |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial specification |

---

**End of Specification Phase**

*The next phase (Pseudocode) will provide detailed algorithmic descriptions for implementing each component, including OAuth 2.0/Service Account authentication, resumable uploads, cursor-based pagination, and streaming operations.*
