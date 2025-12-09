# AWS S3 Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/aws-s3`

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

This specification defines the requirements, interfaces, and constraints for the AWS S3 Integration Module within the LLM-Dev-Ops Integration Repository. It serves as the authoritative source for what the module must accomplish, providing a production-ready, type-safe interface for interacting with Amazon Simple Storage Service (S3).

### 1.2 Audience

- Implementation developers (Rust and TypeScript)
- QA engineers designing test strategies
- Architects reviewing integration patterns
- Security reviewers assessing credential handling
- DevOps engineers configuring S3 access

### 1.3 Methodology

This specification follows:
- **SPARC Methodology**: Specification -> Pseudocode -> Architecture -> Refinement -> Completion
- **London-School TDD**: Interface-first design enabling mock-based testing
- **SOLID Principles**: Clean, maintainable, extensible design

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The AWS S3 Integration Module provides a production-ready, type-safe interface for interacting with Amazon S3's object storage service. It abstracts HTTP communication via the S3 REST API, handles AWS authentication (Signature V4), manages resilience patterns, and provides comprehensive observability—all while maintaining clean dependency boundaries.

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Object Operations** | Type-safe wrappers for S3 object operations (put, get, delete, list, head, copy) |
| **Bucket Operations** | Bucket management including creation, deletion, and configuration |
| **Multipart Uploads** | Large file upload management with resumable transfers |
| **Streaming** | Streaming uploads and downloads for large objects |
| **Presigned URLs** | Generation of time-limited presigned URLs for direct access |
| **Authentication** | AWS Signature V4 signing with secure credential handling |
| **Transport** | HTTP/HTTPS communication with connection pooling |
| **Resilience Integration** | Hooks for retry, circuit breaker, and rate limiting primitives |
| **Observability** | Tracing spans, metrics emission, structured logging |
| **Error Mapping** | Translation of S3 errors to typed domain errors |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Object Operations | PutObject, GetObject, DeleteObject, DeleteObjects, HeadObject, CopyObject, ListObjectsV2 |
| Bucket Operations | CreateBucket, DeleteBucket, HeadBucket, ListBuckets, GetBucketLocation |
| Multipart Uploads | CreateMultipartUpload, UploadPart, CompleteMultipartUpload, AbortMultipartUpload, ListParts |
| Presigned URLs | Generate presigned GET/PUT URLs with configurable expiration |
| Object Metadata | User-defined metadata, content-type, cache-control, content-disposition |
| Object Tagging | GetObjectTagging, PutObjectTagging, DeleteObjectTagging |
| Server-Side Encryption | SSE-S3, SSE-KMS, SSE-C support |
| Storage Classes | Standard, Intelligent-Tiering, Glacier, Deep Archive |
| Dual Language | Rust (primary) and TypeScript implementations |

#### Out of Scope

| Item | Reason |
|------|--------|
| Other AWS services | Separate integration modules (DynamoDB, Lambda, etc.) |
| ruvbase (Layer 0) | External dependency, not implemented here |
| S3 Select | Query-in-place feature, complex parsing requirements |
| S3 Batch Operations | Asynchronous batch job management |
| S3 Object Lock | Legal hold and retention, compliance feature |
| S3 Replication | Cross-region/same-region replication configuration |
| S3 Access Points | Simplified access management |
| S3 Inventory | Bucket inventory reports |
| CloudFront Integration | CDN integration, separate concern |
| Transfer Acceleration | Requires separate endpoint configuration |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| No direct HTTP client dependency exposure | Encapsulation, testability |
| Async-first design | I/O-bound operations, efficiency |
| Zero `unsafe` in public API (Rust) | Safety guarantees |
| No panics in production paths | Reliability |
| Trait-based abstractions | London-School TDD, mockability |
| Semantic versioning | API stability |
| AWS Signature V4 only | Industry standard, required by S3 |
| Streaming by default for large objects | Memory efficiency |

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
| `reqwest` | 0.11+ | HTTP client (behind transport trait) |
| `serde` | 1.x | Serialization |
| `serde_json` | 1.x | JSON handling |
| `quick-xml` | 0.31+ | XML parsing (S3 responses) |
| `async-trait` | 0.1+ | Async trait support |
| `thiserror` | 1.x | Error derivation |
| `secrecy` | 0.8+ | Secret string handling |
| `url` | 2.x | URL parsing |
| `bytes` | 1.x | Byte buffer handling |
| `futures` | 0.3+ | Stream utilities |
| `pin-project` | 1.x | Pin projection for streams |
| `ring` | 0.17+ | HMAC-SHA256 for AWS Signature V4 |
| `hex` | 0.4+ | Hexadecimal encoding |
| `base64` | 0.21+ | Base64 encoding for checksums |
| `chrono` | 0.4+ | Date/time handling for signatures |
| `percent-encoding` | 2.x | URL encoding for signatures |
| `md-5` | 0.10+ | MD5 for Content-MD5 headers |
| `sha2` | 0.10+ | SHA256 for payload hashing |

### 3.3 External Dependencies (TypeScript)

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | 5.x | Language |
| `node-fetch` / native fetch | Latest | HTTP client |
| `zod` | 3.x | Runtime type validation |
| `fast-xml-parser` | 4.x | XML parsing |
| `@noble/hashes` | 1.x | SHA256, HMAC for signing |

### 3.4 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `ruvbase` | Layer 0, external to this module |
| `aws-sdk-s3` | This module IS the S3 integration |
| `@aws-sdk/client-s3` | This module IS the S3 integration |
| `integrations-openai` | No cross-integration dependencies |
| `integrations-anthropic` | No cross-integration dependencies |
| Any other integration module | Isolated module design |

---

## 4. API Coverage

### 4.1 Object Operations

#### 4.1.1 PutObject

| Attribute | Value |
|-----------|-------|
| Endpoint | `PUT /{Bucket}/{Key}` |
| Authentication | AWS Signature V4 |
| Request Format | Binary (object content) |
| Response Format | XML (headers only) |
| Idempotency | Yes (same key overwrites) |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucket` | string | Yes | Target bucket name |
| `key` | string | Yes | Object key (path) |
| `body` | bytes/stream | Yes | Object content |
| `content_type` | string | No | MIME type |
| `content_encoding` | string | No | Content encoding (gzip, etc.) |
| `content_disposition` | string | No | Suggested filename |
| `content_language` | string | No | Content language |
| `cache_control` | string | No | Cache directives |
| `metadata` | map | No | User-defined metadata (x-amz-meta-*) |
| `storage_class` | enum | No | Storage tier |
| `server_side_encryption` | enum | No | SSE type |
| `sse_kms_key_id` | string | No | KMS key for SSE-KMS |
| `sse_customer_algorithm` | string | No | SSE-C algorithm |
| `sse_customer_key` | bytes | No | SSE-C key |
| `sse_customer_key_md5` | string | No | SSE-C key MD5 |
| `acl` | enum | No | Canned ACL |
| `tagging` | string | No | URL-encoded tags |
| `content_md5` | string | No | Base64 MD5 checksum |
| `checksum_algorithm` | enum | No | CRC32, CRC32C, SHA1, SHA256 |
| `checksum_value` | string | No | Checksum value |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `e_tag` | string | Object ETag (MD5 or multipart) |
| `version_id` | string | Version ID (if versioning enabled) |
| `expiration` | string | Expiration rule info |
| `server_side_encryption` | enum | Applied encryption |
| `sse_kms_key_id` | string | KMS key used |
| `checksum_crc32` | string | CRC32 if requested |
| `checksum_crc32c` | string | CRC32C if requested |
| `checksum_sha1` | string | SHA1 if requested |
| `checksum_sha256` | string | SHA256 if requested |

#### 4.1.2 GetObject

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /{Bucket}/{Key}` |
| Authentication | AWS Signature V4 |
| Response Format | Binary (object content) |
| Streaming | Yes (chunked transfer) |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucket` | string | Yes | Source bucket name |
| `key` | string | Yes | Object key |
| `range` | string | No | Byte range (e.g., "bytes=0-1023") |
| `if_match` | string | No | ETag condition |
| `if_none_match` | string | No | ETag exclusion |
| `if_modified_since` | datetime | No | Modified condition |
| `if_unmodified_since` | datetime | No | Unmodified condition |
| `version_id` | string | No | Specific version |
| `sse_customer_algorithm` | string | No | SSE-C algorithm |
| `sse_customer_key` | bytes | No | SSE-C key |
| `sse_customer_key_md5` | string | No | SSE-C key MD5 |
| `response_content_type` | string | No | Override Content-Type |
| `response_content_disposition` | string | No | Override Content-Disposition |
| `response_content_encoding` | string | No | Override Content-Encoding |
| `response_content_language` | string | No | Override Content-Language |
| `response_cache_control` | string | No | Override Cache-Control |
| `response_expires` | string | No | Override Expires |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `body` | stream | Object content stream |
| `content_length` | integer | Object size in bytes |
| `content_type` | string | MIME type |
| `content_encoding` | string | Content encoding |
| `content_disposition` | string | Disposition header |
| `content_language` | string | Content language |
| `cache_control` | string | Cache directives |
| `e_tag` | string | Object ETag |
| `last_modified` | datetime | Last modification time |
| `metadata` | map | User-defined metadata |
| `version_id` | string | Version ID |
| `delete_marker` | boolean | Is delete marker |
| `storage_class` | enum | Storage tier |
| `server_side_encryption` | enum | Encryption type |
| `sse_kms_key_id` | string | KMS key used |
| `content_range` | string | Range returned (for partial) |
| `accept_ranges` | string | "bytes" if range supported |
| `expires` | datetime | Expiration time |
| `restore` | string | Glacier restore status |
| `object_lock_mode` | enum | Lock mode |
| `object_lock_retain_until_date` | datetime | Retention date |
| `object_lock_legal_hold_status` | enum | Legal hold status |
| `parts_count` | integer | Multipart count |

#### 4.1.3 DeleteObject

| Attribute | Value |
|-----------|-------|
| Endpoint | `DELETE /{Bucket}/{Key}` |
| Authentication | AWS Signature V4 |
| Response Format | Headers only (204 No Content) |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucket` | string | Yes | Bucket name |
| `key` | string | Yes | Object key |
| `version_id` | string | No | Specific version to delete |
| `mfa` | string | No | MFA device serial + code |
| `bypass_governance_retention` | boolean | No | Bypass governance mode |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `delete_marker` | boolean | Delete marker created |
| `version_id` | string | Version ID affected |

#### 4.1.4 DeleteObjects (Batch Delete)

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /{Bucket}?delete` |
| Authentication | AWS Signature V4 |
| Request Format | XML |
| Response Format | XML |
| Max Objects | 1000 per request |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucket` | string | Yes | Bucket name |
| `objects` | array | Yes | Objects to delete |
| `quiet` | boolean | No | Suppress successful deletions in response |
| `mfa` | string | No | MFA device serial + code |
| `bypass_governance_retention` | boolean | No | Bypass governance mode |

**Object in Delete Request:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | Yes | Object key |
| `version_id` | string | No | Specific version |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `deleted` | array | Successfully deleted objects |
| `errors` | array | Failed deletions |

#### 4.1.5 HeadObject

| Attribute | Value |
|-----------|-------|
| Endpoint | `HEAD /{Bucket}/{Key}` |
| Authentication | AWS Signature V4 |
| Response Format | Headers only |

**Request Parameters:**

Same as GetObject (excluding response overrides).

**Response Fields:**

Same as GetObject (excluding body).

#### 4.1.6 CopyObject

| Attribute | Value |
|-----------|-------|
| Endpoint | `PUT /{Bucket}/{Key}` |
| Authentication | AWS Signature V4 |
| Request Header | `x-amz-copy-source: /{source-bucket}/{source-key}` |
| Response Format | XML |
| Max Size | 5 GB (use multipart for larger) |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source_bucket` | string | Yes | Source bucket |
| `source_key` | string | Yes | Source key |
| `source_version_id` | string | No | Source version |
| `bucket` | string | Yes | Destination bucket |
| `key` | string | Yes | Destination key |
| `metadata_directive` | enum | No | COPY or REPLACE |
| `tagging_directive` | enum | No | COPY or REPLACE |
| `copy_source_if_match` | string | No | ETag condition |
| `copy_source_if_none_match` | string | No | ETag exclusion |
| `copy_source_if_modified_since` | datetime | No | Modified condition |
| `copy_source_if_unmodified_since` | datetime | No | Unmodified condition |
| Plus all PutObject parameters for destination |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `e_tag` | string | Destination ETag |
| `last_modified` | datetime | Copy timestamp |
| `copy_source_version_id` | string | Source version copied |
| `version_id` | string | Destination version |

#### 4.1.7 ListObjectsV2

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /{Bucket}?list-type=2` |
| Authentication | AWS Signature V4 |
| Response Format | XML |
| Pagination | Continuation token based |
| Max Keys | 1000 per request (default) |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucket` | string | Yes | Bucket name |
| `prefix` | string | No | Key prefix filter |
| `delimiter` | string | No | Hierarchy delimiter (e.g., "/") |
| `max_keys` | integer | No | Max results (1-1000) |
| `continuation_token` | string | No | Pagination token |
| `start_after` | string | No | Start listing after key |
| `fetch_owner` | boolean | No | Include owner info |
| `encoding_type` | string | No | "url" for URL encoding |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `is_truncated` | boolean | More results available |
| `contents` | array | Object list |
| `common_prefixes` | array | Common prefixes (folders) |
| `name` | string | Bucket name |
| `prefix` | string | Applied prefix |
| `delimiter` | string | Applied delimiter |
| `max_keys` | integer | Max keys requested |
| `key_count` | integer | Keys returned |
| `continuation_token` | string | Token used |
| `next_continuation_token` | string | Next page token |
| `start_after` | string | Start after value |
| `encoding_type` | string | Encoding used |

**Object in Contents:**

| Field | Type | Description |
|-------|------|-------------|
| `key` | string | Object key |
| `last_modified` | datetime | Last modification |
| `e_tag` | string | Object ETag |
| `size` | integer | Size in bytes |
| `storage_class` | enum | Storage tier |
| `owner` | object | Owner info (if requested) |
| `checksum_algorithm` | array | Checksum algorithms |

### 4.2 Bucket Operations

#### 4.2.1 CreateBucket

| Attribute | Value |
|-----------|-------|
| Endpoint | `PUT /{Bucket}` |
| Authentication | AWS Signature V4 |
| Request Format | XML (for non-us-east-1) |
| Response Format | Headers only |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucket` | string | Yes | Bucket name (globally unique) |
| `location_constraint` | string | No | Region (required outside us-east-1) |
| `acl` | enum | No | Canned ACL |
| `object_ownership` | enum | No | BucketOwnerPreferred, BucketOwnerEnforced, ObjectWriter |
| `object_lock_enabled_for_bucket` | boolean | No | Enable Object Lock |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `location` | string | Bucket location URL |

#### 4.2.2 DeleteBucket

| Attribute | Value |
|-----------|-------|
| Endpoint | `DELETE /{Bucket}` |
| Authentication | AWS Signature V4 |
| Response Format | Headers only (204 No Content) |
| Precondition | Bucket must be empty |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucket` | string | Yes | Bucket name |

#### 4.2.3 HeadBucket

| Attribute | Value |
|-----------|-------|
| Endpoint | `HEAD /{Bucket}` |
| Authentication | AWS Signature V4 |
| Response Format | Headers only |
| Use Case | Check bucket existence and access |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucket` | string | Yes | Bucket name |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `bucket_region` | string | Bucket region |
| `access_point_alias` | boolean | Is access point alias |

#### 4.2.4 ListBuckets

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /` |
| Authentication | AWS Signature V4 |
| Response Format | XML |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `buckets` | array | Bucket list |
| `owner` | object | Account owner info |

**Bucket in List:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Bucket name |
| `creation_date` | datetime | Creation timestamp |

#### 4.2.5 GetBucketLocation

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /{Bucket}?location` |
| Authentication | AWS Signature V4 |
| Response Format | XML |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucket` | string | Yes | Bucket name |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `location_constraint` | string | Region (null for us-east-1) |

### 4.3 Multipart Upload Operations

#### 4.3.1 CreateMultipartUpload

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /{Bucket}/{Key}?uploads` |
| Authentication | AWS Signature V4 |
| Response Format | XML |

**Request Parameters:**

All PutObject metadata parameters plus:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucket` | string | Yes | Bucket name |
| `key` | string | Yes | Object key |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `bucket` | string | Bucket name |
| `key` | string | Object key |
| `upload_id` | string | Multipart upload ID |
| `server_side_encryption` | enum | Applied encryption |
| `sse_kms_key_id` | string | KMS key used |

#### 4.3.2 UploadPart

| Attribute | Value |
|-----------|-------|
| Endpoint | `PUT /{Bucket}/{Key}?partNumber={n}&uploadId={id}` |
| Authentication | AWS Signature V4 |
| Request Format | Binary (part content) |
| Part Size | 5 MB minimum (except last), 5 GB maximum |
| Max Parts | 10,000 |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucket` | string | Yes | Bucket name |
| `key` | string | Yes | Object key |
| `upload_id` | string | Yes | Multipart upload ID |
| `part_number` | integer | Yes | Part number (1-10000) |
| `body` | bytes/stream | Yes | Part content |
| `content_length` | integer | Yes | Part size |
| `content_md5` | string | No | Base64 MD5 |
| `checksum_algorithm` | enum | No | Checksum type |
| `checksum_value` | string | No | Checksum |
| `sse_customer_algorithm` | string | No | SSE-C algorithm |
| `sse_customer_key` | bytes | No | SSE-C key |
| `sse_customer_key_md5` | string | No | SSE-C key MD5 |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `e_tag` | string | Part ETag |
| `checksum_crc32` | string | CRC32 if requested |
| `checksum_crc32c` | string | CRC32C if requested |
| `checksum_sha1` | string | SHA1 if requested |
| `checksum_sha256` | string | SHA256 if requested |
| `server_side_encryption` | enum | Encryption used |
| `sse_kms_key_id` | string | KMS key |

#### 4.3.3 CompleteMultipartUpload

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /{Bucket}/{Key}?uploadId={id}` |
| Authentication | AWS Signature V4 |
| Request Format | XML (part list) |
| Response Format | XML |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucket` | string | Yes | Bucket name |
| `key` | string | Yes | Object key |
| `upload_id` | string | Yes | Multipart upload ID |
| `parts` | array | Yes | Completed parts |
| `checksum_crc32` | string | No | Final CRC32 |
| `checksum_crc32c` | string | No | Final CRC32C |
| `checksum_sha1` | string | No | Final SHA1 |
| `checksum_sha256` | string | No | Final SHA256 |

**Part in Request:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `part_number` | integer | Yes | Part number |
| `e_tag` | string | Yes | Part ETag |
| `checksum_crc32` | string | No | Part CRC32 |
| `checksum_crc32c` | string | No | Part CRC32C |
| `checksum_sha1` | string | No | Part SHA1 |
| `checksum_sha256` | string | No | Part SHA256 |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `location` | string | Object URL |
| `bucket` | string | Bucket name |
| `key` | string | Object key |
| `e_tag` | string | Composite ETag |
| `checksum_crc32` | string | Final CRC32 |
| `checksum_crc32c` | string | Final CRC32C |
| `checksum_sha1` | string | Final SHA1 |
| `checksum_sha256` | string | Final SHA256 |
| `expiration` | string | Expiration info |
| `server_side_encryption` | enum | Encryption used |
| `version_id` | string | Version ID |
| `sse_kms_key_id` | string | KMS key |

#### 4.3.4 AbortMultipartUpload

| Attribute | Value |
|-----------|-------|
| Endpoint | `DELETE /{Bucket}/{Key}?uploadId={id}` |
| Authentication | AWS Signature V4 |
| Response Format | Headers only (204 No Content) |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucket` | string | Yes | Bucket name |
| `key` | string | Yes | Object key |
| `upload_id` | string | Yes | Upload ID to abort |

#### 4.3.5 ListParts

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /{Bucket}/{Key}?uploadId={id}` |
| Authentication | AWS Signature V4 |
| Response Format | XML |
| Pagination | Part number marker based |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucket` | string | Yes | Bucket name |
| `key` | string | Yes | Object key |
| `upload_id` | string | Yes | Upload ID |
| `max_parts` | integer | No | Max parts to return |
| `part_number_marker` | integer | No | Start after part number |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `bucket` | string | Bucket name |
| `key` | string | Object key |
| `upload_id` | string | Upload ID |
| `initiator` | object | Upload initiator |
| `owner` | object | Object owner |
| `storage_class` | enum | Storage tier |
| `parts` | array | Part list |
| `is_truncated` | boolean | More parts available |
| `next_part_number_marker` | integer | Next page marker |
| `max_parts` | integer | Max parts requested |
| `checksum_algorithm` | enum | Checksum algorithm |

**Part in Response:**

| Field | Type | Description |
|-------|------|-------------|
| `part_number` | integer | Part number |
| `last_modified` | datetime | Upload time |
| `e_tag` | string | Part ETag |
| `size` | integer | Part size |
| `checksum_crc32` | string | CRC32 |
| `checksum_crc32c` | string | CRC32C |
| `checksum_sha1` | string | SHA1 |
| `checksum_sha256` | string | SHA256 |

### 4.4 Presigned URL Operations

#### 4.4.1 Generate Presigned GET URL

| Attribute | Value |
|-----------|-------|
| Operation | Client-side URL generation |
| Signature | AWS Signature V4 (query string) |
| Max Expiration | 7 days (604800 seconds) |

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucket` | string | Yes | Bucket name |
| `key` | string | Yes | Object key |
| `expires_in` | duration | Yes | URL validity period |
| `version_id` | string | No | Specific version |
| `response_content_type` | string | No | Override Content-Type |
| `response_content_disposition` | string | No | Override Content-Disposition |
| `response_content_encoding` | string | No | Override Content-Encoding |
| `response_content_language` | string | No | Override Content-Language |
| `response_cache_control` | string | No | Override Cache-Control |
| `response_expires` | string | No | Override Expires |

#### 4.4.2 Generate Presigned PUT URL

| Attribute | Value |
|-----------|-------|
| Operation | Client-side URL generation |
| Signature | AWS Signature V4 (query string) |
| Max Expiration | 7 days (604800 seconds) |

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucket` | string | Yes | Bucket name |
| `key` | string | Yes | Object key |
| `expires_in` | duration | Yes | URL validity period |
| `content_type` | string | No | Required Content-Type for upload |
| `content_length` | integer | No | Required Content-Length |
| `checksum_algorithm` | enum | No | Required checksum |
| `storage_class` | enum | No | Storage tier |
| `server_side_encryption` | enum | No | Encryption type |
| `sse_kms_key_id` | string | No | KMS key for SSE-KMS |
| `metadata` | map | No | Required metadata |
| `tagging` | string | No | Object tags |
| `acl` | enum | No | Canned ACL |

### 4.5 Object Tagging Operations

#### 4.5.1 GetObjectTagging

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /{Bucket}/{Key}?tagging` |
| Authentication | AWS Signature V4 |
| Response Format | XML |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucket` | string | Yes | Bucket name |
| `key` | string | Yes | Object key |
| `version_id` | string | No | Specific version |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `tag_set` | array | Tag list |
| `version_id` | string | Version ID |

**Tag:**

| Field | Type | Description |
|-------|------|-------------|
| `key` | string | Tag key |
| `value` | string | Tag value |

#### 4.5.2 PutObjectTagging

| Attribute | Value |
|-----------|-------|
| Endpoint | `PUT /{Bucket}/{Key}?tagging` |
| Authentication | AWS Signature V4 |
| Request Format | XML |
| Response Format | Headers only |
| Max Tags | 10 per object |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucket` | string | Yes | Bucket name |
| `key` | string | Yes | Object key |
| `version_id` | string | No | Specific version |
| `tag_set` | array | Yes | Tags to set |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `version_id` | string | Version ID |

#### 4.5.3 DeleteObjectTagging

| Attribute | Value |
|-----------|-------|
| Endpoint | `DELETE /{Bucket}/{Key}?tagging` |
| Authentication | AWS Signature V4 |
| Response Format | Headers only (204 No Content) |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucket` | string | Yes | Bucket name |
| `key` | string | Yes | Object key |
| `version_id` | string | No | Specific version |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `version_id` | string | Version ID |

---

## 5. Interface Definitions

### 5.1 Rust Interfaces

#### 5.1.1 Client Interface

```rust
/// Main client for interacting with AWS S3.
#[async_trait]
pub trait S3Client: Send + Sync {
    /// Access the objects service.
    fn objects(&self) -> &dyn ObjectsService;

    /// Access the buckets service.
    fn buckets(&self) -> &dyn BucketsService;

    /// Access the multipart upload service.
    fn multipart(&self) -> &dyn MultipartService;

    /// Access the presigned URL service.
    fn presign(&self) -> &dyn PresignService;

    /// Access the tagging service.
    fn tagging(&self) -> &dyn TaggingService;
}

/// Factory for creating S3 clients.
pub trait S3ClientFactory: Send + Sync {
    /// Create a new client with the given configuration.
    fn create(&self, config: S3Config) -> Result<Arc<dyn S3Client>, S3Error>;
}
```

#### 5.1.2 Objects Service Interface

```rust
/// Service for S3 object operations.
#[async_trait]
pub trait ObjectsService: Send + Sync {
    /// Upload an object to S3.
    async fn put(
        &self,
        request: PutObjectRequest,
    ) -> Result<PutObjectOutput, S3Error>;

    /// Upload an object from a stream.
    async fn put_stream(
        &self,
        request: PutObjectStreamRequest,
        body: impl Stream<Item = Result<Bytes, S3Error>> + Send + 'static,
    ) -> Result<PutObjectOutput, S3Error>;

    /// Download an object from S3.
    async fn get(
        &self,
        request: GetObjectRequest,
    ) -> Result<GetObjectOutput, S3Error>;

    /// Download an object as a stream.
    async fn get_stream(
        &self,
        request: GetObjectRequest,
    ) -> Result<GetObjectStreamOutput, S3Error>;

    /// Delete an object.
    async fn delete(
        &self,
        request: DeleteObjectRequest,
    ) -> Result<DeleteObjectOutput, S3Error>;

    /// Delete multiple objects.
    async fn delete_objects(
        &self,
        request: DeleteObjectsRequest,
    ) -> Result<DeleteObjectsOutput, S3Error>;

    /// Get object metadata without downloading.
    async fn head(
        &self,
        request: HeadObjectRequest,
    ) -> Result<HeadObjectOutput, S3Error>;

    /// Copy an object.
    async fn copy(
        &self,
        request: CopyObjectRequest,
    ) -> Result<CopyObjectOutput, S3Error>;

    /// List objects in a bucket.
    async fn list(
        &self,
        request: ListObjectsV2Request,
    ) -> Result<ListObjectsV2Output, S3Error>;

    /// List all objects (auto-pagination).
    fn list_all(
        &self,
        request: ListObjectsV2Request,
    ) -> impl Stream<Item = Result<Object, S3Error>> + Send;
}
```

#### 5.1.3 Buckets Service Interface

```rust
/// Service for S3 bucket operations.
#[async_trait]
pub trait BucketsService: Send + Sync {
    /// Create a new bucket.
    async fn create(
        &self,
        request: CreateBucketRequest,
    ) -> Result<CreateBucketOutput, S3Error>;

    /// Delete a bucket.
    async fn delete(
        &self,
        request: DeleteBucketRequest,
    ) -> Result<(), S3Error>;

    /// Check if a bucket exists and is accessible.
    async fn head(
        &self,
        request: HeadBucketRequest,
    ) -> Result<HeadBucketOutput, S3Error>;

    /// List all buckets owned by the account.
    async fn list(&self) -> Result<ListBucketsOutput, S3Error>;

    /// Get bucket location (region).
    async fn get_location(
        &self,
        request: GetBucketLocationRequest,
    ) -> Result<GetBucketLocationOutput, S3Error>;
}
```

#### 5.1.4 Multipart Service Interface

```rust
/// Service for multipart upload operations.
#[async_trait]
pub trait MultipartService: Send + Sync {
    /// Initiate a multipart upload.
    async fn create(
        &self,
        request: CreateMultipartUploadRequest,
    ) -> Result<CreateMultipartUploadOutput, S3Error>;

    /// Upload a part.
    async fn upload_part(
        &self,
        request: UploadPartRequest,
    ) -> Result<UploadPartOutput, S3Error>;

    /// Upload a part from a stream.
    async fn upload_part_stream(
        &self,
        request: UploadPartStreamRequest,
        body: impl Stream<Item = Result<Bytes, S3Error>> + Send + 'static,
    ) -> Result<UploadPartOutput, S3Error>;

    /// Complete a multipart upload.
    async fn complete(
        &self,
        request: CompleteMultipartUploadRequest,
    ) -> Result<CompleteMultipartUploadOutput, S3Error>;

    /// Abort a multipart upload.
    async fn abort(
        &self,
        request: AbortMultipartUploadRequest,
    ) -> Result<(), S3Error>;

    /// List parts of an in-progress upload.
    async fn list_parts(
        &self,
        request: ListPartsRequest,
    ) -> Result<ListPartsOutput, S3Error>;

    /// High-level upload with automatic multipart handling.
    async fn upload(
        &self,
        request: UploadRequest,
        body: impl Stream<Item = Result<Bytes, S3Error>> + Send + 'static,
    ) -> Result<UploadOutput, S3Error>;
}
```

#### 5.1.5 Presign Service Interface

```rust
/// Service for generating presigned URLs.
pub trait PresignService: Send + Sync {
    /// Generate a presigned URL for GET (download).
    fn presign_get(
        &self,
        request: PresignGetRequest,
    ) -> Result<PresignedUrl, S3Error>;

    /// Generate a presigned URL for PUT (upload).
    fn presign_put(
        &self,
        request: PresignPutRequest,
    ) -> Result<PresignedUrl, S3Error>;

    /// Generate a presigned URL for DELETE.
    fn presign_delete(
        &self,
        request: PresignDeleteRequest,
    ) -> Result<PresignedUrl, S3Error>;
}
```

#### 5.1.6 Tagging Service Interface

```rust
/// Service for object tagging operations.
#[async_trait]
pub trait TaggingService: Send + Sync {
    /// Get object tags.
    async fn get(
        &self,
        request: GetObjectTaggingRequest,
    ) -> Result<GetObjectTaggingOutput, S3Error>;

    /// Set object tags.
    async fn put(
        &self,
        request: PutObjectTaggingRequest,
    ) -> Result<PutObjectTaggingOutput, S3Error>;

    /// Delete object tags.
    async fn delete(
        &self,
        request: DeleteObjectTaggingRequest,
    ) -> Result<DeleteObjectTaggingOutput, S3Error>;
}
```

#### 5.1.7 Transport Interface

```rust
/// HTTP transport abstraction for testability.
#[async_trait]
pub trait HttpTransport: Send + Sync {
    /// Send an HTTP request and receive a response.
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError>;

    /// Send a request and receive a streaming response.
    async fn send_streaming(
        &self,
        request: HttpRequest,
    ) -> Result<StreamingResponse, TransportError>;
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
    Stream(BoxStream<'static, Result<Bytes, S3Error>>),
}

/// HTTP response representation.
pub struct HttpResponse {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub body: Bytes,
}

/// Streaming HTTP response.
pub struct StreamingResponse {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub body: BoxStream<'static, Result<Bytes, TransportError>>,
}
```

#### 5.1.8 Signer Interface

```rust
/// AWS Signature V4 signer abstraction.
pub trait AwsSigner: Send + Sync {
    /// Sign a request with AWS Signature V4.
    fn sign_request(
        &self,
        request: &mut HttpRequest,
        payload_hash: &str,
        timestamp: DateTime<Utc>,
    ) -> Result<(), SigningError>;

    /// Generate a presigned URL.
    fn presign_url(
        &self,
        method: HttpMethod,
        url: &Url,
        expires_in: Duration,
        timestamp: DateTime<Utc>,
    ) -> Result<Url, SigningError>;
}

/// AWS credentials.
pub struct AwsCredentials {
    /// Access key ID.
    pub access_key_id: String,
    /// Secret access key.
    pub secret_access_key: SecretString,
    /// Session token (for temporary credentials).
    pub session_token: Option<SecretString>,
}

/// Credential provider abstraction.
#[async_trait]
pub trait CredentialsProvider: Send + Sync {
    /// Get current credentials.
    async fn get_credentials(&self) -> Result<AwsCredentials, CredentialsError>;
}
```

#### 5.1.9 Configuration Types

```rust
/// Configuration for the S3 client.
#[derive(Clone)]
pub struct S3Config {
    /// AWS region.
    pub region: String,

    /// Credentials provider.
    pub credentials_provider: Arc<dyn CredentialsProvider>,

    /// Custom endpoint (for S3-compatible services).
    pub endpoint: Option<Url>,

    /// Use path-style addressing (bucket in path, not subdomain).
    pub path_style: bool,

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

    /// Multipart upload threshold (bytes).
    pub multipart_threshold: u64,

    /// Multipart part size (bytes).
    pub multipart_part_size: u64,

    /// Maximum concurrent multipart uploads.
    pub multipart_concurrency: usize,
}

impl Default for S3Config {
    fn default() -> Self {
        Self {
            region: "us-east-1".to_string(),
            credentials_provider: Arc::new(EnvCredentialsProvider),
            endpoint: None,
            path_style: false,
            timeout: Duration::from_secs(300), // 5 minutes
            max_retries: 3,
            retry_config: RetryConfig::default(),
            circuit_breaker_config: CircuitBreakerConfig::default(),
            rate_limit_config: None,
            multipart_threshold: 100 * 1024 * 1024, // 100 MB
            multipart_part_size: 10 * 1024 * 1024,   // 10 MB
            multipart_concurrency: 4,
        }
    }
}

/// Storage class options.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StorageClass {
    Standard,
    ReducedRedundancy,
    StandardIa,
    OnezoneIa,
    IntelligentTiering,
    Glacier,
    GlacierIr,
    DeepArchive,
    Outposts,
    ExpressOnezone,
}

/// Server-side encryption options.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ServerSideEncryption {
    /// SSE-S3 (AES256)
    Aes256,
    /// SSE-KMS
    AwsKms,
    /// SSE-KMS with DSSE
    AwsKmsDsse,
}

/// Checksum algorithm options.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ChecksumAlgorithm {
    Crc32,
    Crc32c,
    Sha1,
    Sha256,
}

/// Canned ACL options.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CannedAcl {
    Private,
    PublicRead,
    PublicReadWrite,
    AuthenticatedRead,
    AwsExecRead,
    BucketOwnerRead,
    BucketOwnerFullControl,
}
```

### 5.2 TypeScript Interfaces

#### 5.2.1 Client Interface

```typescript
/**
 * Main client for interacting with AWS S3.
 */
interface S3Client {
  /** Access the objects service. */
  readonly objects: ObjectsService;

  /** Access the buckets service. */
  readonly buckets: BucketsService;

  /** Access the multipart upload service. */
  readonly multipart: MultipartService;

  /** Access the presigned URL service. */
  readonly presign: PresignService;

  /** Access the tagging service. */
  readonly tagging: TaggingService;
}

/**
 * Factory for creating S3 clients.
 */
interface S3ClientFactory {
  create(config: S3Config): S3Client;
}
```

#### 5.2.2 Objects Service Interface

```typescript
/**
 * Service for S3 object operations.
 */
interface ObjectsService {
  /**
   * Upload an object to S3.
   */
  put(request: PutObjectRequest): Promise<PutObjectOutput>;

  /**
   * Upload an object from a stream.
   */
  putStream(
    request: PutObjectStreamRequest,
    body: ReadableStream<Uint8Array>
  ): Promise<PutObjectOutput>;

  /**
   * Download an object from S3.
   */
  get(request: GetObjectRequest): Promise<GetObjectOutput>;

  /**
   * Download an object as a stream.
   */
  getStream(request: GetObjectRequest): Promise<GetObjectStreamOutput>;

  /**
   * Delete an object.
   */
  delete(request: DeleteObjectRequest): Promise<DeleteObjectOutput>;

  /**
   * Delete multiple objects.
   */
  deleteObjects(request: DeleteObjectsRequest): Promise<DeleteObjectsOutput>;

  /**
   * Get object metadata without downloading.
   */
  head(request: HeadObjectRequest): Promise<HeadObjectOutput>;

  /**
   * Copy an object.
   */
  copy(request: CopyObjectRequest): Promise<CopyObjectOutput>;

  /**
   * List objects in a bucket.
   */
  list(request: ListObjectsV2Request): Promise<ListObjectsV2Output>;

  /**
   * List all objects (auto-pagination).
   */
  listAll(request: ListObjectsV2Request): AsyncIterable<S3Object>;
}
```

#### 5.2.3 Request/Response Types

```typescript
/**
 * Request to put an object.
 */
interface PutObjectRequest {
  /** Bucket name. */
  bucket: string;

  /** Object key. */
  key: string;

  /** Object content. */
  body: Uint8Array | Buffer;

  /** Content type. */
  contentType?: string;

  /** Content encoding. */
  contentEncoding?: string;

  /** Content disposition. */
  contentDisposition?: string;

  /** Content language. */
  contentLanguage?: string;

  /** Cache control. */
  cacheControl?: string;

  /** User-defined metadata. */
  metadata?: Record<string, string>;

  /** Storage class. */
  storageClass?: StorageClass;

  /** Server-side encryption. */
  serverSideEncryption?: ServerSideEncryption;

  /** KMS key ID for SSE-KMS. */
  sseKmsKeyId?: string;

  /** Canned ACL. */
  acl?: CannedAcl;

  /** Object tags (URL-encoded). */
  tagging?: string;

  /** Content MD5 (base64). */
  contentMd5?: string;

  /** Checksum algorithm. */
  checksumAlgorithm?: ChecksumAlgorithm;

  /** Checksum value. */
  checksumValue?: string;
}

/**
 * Response from putting an object.
 */
interface PutObjectOutput {
  /** Object ETag. */
  eTag: string;

  /** Version ID (if versioning enabled). */
  versionId?: string;

  /** Expiration rule info. */
  expiration?: string;

  /** Applied server-side encryption. */
  serverSideEncryption?: ServerSideEncryption;

  /** KMS key used. */
  sseKmsKeyId?: string;

  /** Checksums if requested. */
  checksumCrc32?: string;
  checksumCrc32c?: string;
  checksumSha1?: string;
  checksumSha256?: string;
}

/**
 * Request to get an object.
 */
interface GetObjectRequest {
  /** Bucket name. */
  bucket: string;

  /** Object key. */
  key: string;

  /** Byte range. */
  range?: string;

  /** ETag condition. */
  ifMatch?: string;

  /** ETag exclusion. */
  ifNoneMatch?: string;

  /** Modified condition. */
  ifModifiedSince?: Date;

  /** Unmodified condition. */
  ifUnmodifiedSince?: Date;

  /** Specific version. */
  versionId?: string;

  /** Response content type override. */
  responseContentType?: string;

  /** Response content disposition override. */
  responseContentDisposition?: string;

  /** Response content encoding override. */
  responseContentEncoding?: string;

  /** Response content language override. */
  responseContentLanguage?: string;

  /** Response cache control override. */
  responseCacheControl?: string;

  /** Response expires override. */
  responseExpires?: string;
}

/**
 * Response from getting an object.
 */
interface GetObjectOutput {
  /** Object content. */
  body: Uint8Array;

  /** Content length. */
  contentLength: number;

  /** Content type. */
  contentType?: string;

  /** Content encoding. */
  contentEncoding?: string;

  /** Content disposition. */
  contentDisposition?: string;

  /** Content language. */
  contentLanguage?: string;

  /** Cache control. */
  cacheControl?: string;

  /** Object ETag. */
  eTag: string;

  /** Last modified time. */
  lastModified: Date;

  /** User-defined metadata. */
  metadata: Record<string, string>;

  /** Version ID. */
  versionId?: string;

  /** Is delete marker. */
  deleteMarker?: boolean;

  /** Storage class. */
  storageClass?: StorageClass;

  /** Server-side encryption. */
  serverSideEncryption?: ServerSideEncryption;

  /** Content range (for partial). */
  contentRange?: string;

  /** Accept ranges. */
  acceptRanges?: string;

  /** Expiration time. */
  expires?: Date;
}

/**
 * Streaming response from getting an object.
 */
interface GetObjectStreamOutput extends Omit<GetObjectOutput, 'body'> {
  /** Object content stream. */
  body: ReadableStream<Uint8Array>;
}

/**
 * S3 object in listing.
 */
interface S3Object {
  /** Object key. */
  key: string;

  /** Last modified time. */
  lastModified: Date;

  /** Object ETag. */
  eTag: string;

  /** Size in bytes. */
  size: number;

  /** Storage class. */
  storageClass: StorageClass;

  /** Owner info. */
  owner?: Owner;

  /** Checksum algorithms. */
  checksumAlgorithm?: ChecksumAlgorithm[];
}

/**
 * Presigned URL result.
 */
interface PresignedUrl {
  /** The presigned URL. */
  url: string;

  /** Expiration time. */
  expiresAt: Date;

  /** Required headers for the request. */
  signedHeaders: Record<string, string>;
}
```

#### 5.2.4 Configuration Types

```typescript
/**
 * Configuration for the S3 client.
 */
interface S3Config {
  /** AWS region. */
  region: string;

  /** Credentials provider. */
  credentials: CredentialsProvider | AwsCredentials;

  /** Custom endpoint (for S3-compatible services). */
  endpoint?: string;

  /** Use path-style addressing. */
  pathStyle?: boolean;

  /** Default timeout in milliseconds. */
  timeout?: number;

  /** Maximum retries. */
  maxRetries?: number;

  /** Retry configuration. */
  retryConfig?: RetryConfig;

  /** Circuit breaker configuration. */
  circuitBreakerConfig?: CircuitBreakerConfig;

  /** Rate limit configuration. */
  rateLimitConfig?: RateLimitConfig;

  /** Multipart upload threshold (bytes). */
  multipartThreshold?: number;

  /** Multipart part size (bytes). */
  multipartPartSize?: number;

  /** Maximum concurrent multipart uploads. */
  multipartConcurrency?: number;
}

type StorageClass =
  | 'STANDARD'
  | 'REDUCED_REDUNDANCY'
  | 'STANDARD_IA'
  | 'ONEZONE_IA'
  | 'INTELLIGENT_TIERING'
  | 'GLACIER'
  | 'GLACIER_IR'
  | 'DEEP_ARCHIVE'
  | 'OUTPOSTS'
  | 'EXPRESS_ONEZONE';

type ServerSideEncryption = 'AES256' | 'aws:kms' | 'aws:kms:dsse';

type ChecksumAlgorithm = 'CRC32' | 'CRC32C' | 'SHA1' | 'SHA256';

type CannedAcl =
  | 'private'
  | 'public-read'
  | 'public-read-write'
  | 'authenticated-read'
  | 'aws-exec-read'
  | 'bucket-owner-read'
  | 'bucket-owner-full-control';

/**
 * AWS credentials.
 */
interface AwsCredentials {
  /** Access key ID. */
  accessKeyId: string;

  /** Secret access key. */
  secretAccessKey: string;

  /** Session token (for temporary credentials). */
  sessionToken?: string;
}

/**
 * Credentials provider interface.
 */
interface CredentialsProvider {
  getCredentials(): Promise<AwsCredentials>;
}
```

---

## 6. Error Taxonomy

### 6.1 Error Hierarchy

```
S3Error
├── ConfigurationError
│   ├── MissingRegion
│   ├── MissingCredentials
│   ├── InvalidEndpoint
│   └── InvalidConfiguration
│
├── CredentialsError
│   ├── CredentialsNotFound
│   ├── CredentialsExpired
│   ├── InvalidCredentials
│   └── CredentialsRefreshFailed
│
├── SigningError
│   ├── InvalidTimestamp
│   ├── SignatureCalculationFailed
│   └── UnsupportedAlgorithm
│
├── RequestError
│   ├── ValidationError
│   ├── InvalidBucketName
│   ├── InvalidObjectKey
│   ├── InvalidRange
│   ├── EntityTooLarge
│   ├── EntityTooSmall
│   └── MissingContentLength
│
├── BucketError
│   ├── BucketNotFound
│   ├── BucketAlreadyExists
│   ├── BucketAlreadyOwnedByYou
│   ├── BucketNotEmpty
│   ├── TooManyBuckets
│   └── InvalidBucketState
│
├── ObjectError
│   ├── ObjectNotFound
│   ├── PreconditionFailed
│   ├── NotModified
│   ├── InvalidObjectState
│   └── ObjectTooLarge
│
├── MultipartError
│   ├── UploadNotFound
│   ├── InvalidPart
│   ├── InvalidPartOrder
│   ├── TooManyParts
│   └── EntityTooSmall
│
├── AccessError
│   ├── AccessDenied
│   ├── InvalidAccessKeyId
│   ├── SignatureDoesNotMatch
│   ├── ExpiredToken
│   └── AccountProblem
│
├── NetworkError
│   ├── ConnectionFailed
│   ├── Timeout
│   ├── DnsResolutionFailed
│   └── TlsError
│
├── ServerError
│   ├── InternalError
│   ├── ServiceUnavailable
│   ├── SlowDown
│   └── BadGateway
│
├── ResponseError
│   ├── XmlParseError
│   ├── InvalidResponse
│   └── UnexpectedContent
│
└── TransferError
    ├── StreamInterrupted
    ├── ChecksumMismatch
    ├── IncompleteBody
    └── UploadAborted
```

### 6.2 Error Type Definitions (Rust)

```rust
/// Top-level error type for the S3 integration.
#[derive(Debug, thiserror::Error)]
pub enum S3Error {
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    #[error("Credentials error: {0}")]
    Credentials(#[from] CredentialsError),

    #[error("Signing error: {0}")]
    Signing(#[from] SigningError),

    #[error("Request error: {0}")]
    Request(#[from] RequestError),

    #[error("Bucket error: {0}")]
    Bucket(#[from] BucketError),

    #[error("Object error: {0}")]
    Object(#[from] ObjectError),

    #[error("Multipart error: {0}")]
    Multipart(#[from] MultipartError),

    #[error("Access error: {0}")]
    Access(#[from] AccessError),

    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    #[error("Server error: {0}")]
    Server(#[from] ServerError),

    #[error("Response error: {0}")]
    Response(#[from] ResponseError),

    #[error("Transfer error: {0}")]
    Transfer(#[from] TransferError),
}

impl S3Error {
    /// Returns true if the error is retryable.
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            S3Error::Network(NetworkError::Timeout { .. })
                | S3Error::Network(NetworkError::ConnectionFailed { .. })
                | S3Error::Server(ServerError::InternalError { .. })
                | S3Error::Server(ServerError::ServiceUnavailable { .. })
                | S3Error::Server(ServerError::SlowDown { .. })
                | S3Error::Transfer(TransferError::StreamInterrupted { .. })
        )
    }

    /// Returns the retry delay hint if available.
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            S3Error::Server(ServerError::SlowDown { retry_after, .. }) => *retry_after,
            S3Error::Server(ServerError::ServiceUnavailable { retry_after, .. }) => *retry_after,
            _ => None,
        }
    }

    /// Returns the HTTP status code if applicable.
    pub fn status_code(&self) -> Option<StatusCode> {
        match self {
            S3Error::Access(_) => Some(StatusCode::FORBIDDEN),
            S3Error::Bucket(BucketError::BucketNotFound { .. }) => Some(StatusCode::NOT_FOUND),
            S3Error::Object(ObjectError::ObjectNotFound { .. }) => Some(StatusCode::NOT_FOUND),
            S3Error::Object(ObjectError::PreconditionFailed { .. }) => {
                Some(StatusCode::PRECONDITION_FAILED)
            }
            S3Error::Object(ObjectError::NotModified { .. }) => Some(StatusCode::NOT_MODIFIED),
            S3Error::Request(_) => Some(StatusCode::BAD_REQUEST),
            S3Error::Server(ServerError::InternalError { .. }) => {
                Some(StatusCode::INTERNAL_SERVER_ERROR)
            }
            S3Error::Server(ServerError::ServiceUnavailable { .. }) => {
                Some(StatusCode::SERVICE_UNAVAILABLE)
            }
            S3Error::Server(ServerError::SlowDown { .. }) => Some(StatusCode::SERVICE_UNAVAILABLE),
            _ => None,
        }
    }

    /// Returns the S3 error code if available.
    pub fn s3_error_code(&self) -> Option<&str> {
        match self {
            S3Error::Bucket(e) => e.code(),
            S3Error::Object(e) => e.code(),
            S3Error::Access(e) => e.code(),
            S3Error::Server(e) => e.code(),
            _ => None,
        }
    }
}
```

### 6.3 Error Mapping from HTTP/S3

| HTTP Status | S3 Error Code | Error Type | Retryable |
|-------------|---------------|------------|-----------|
| 301 | PermanentRedirect | `ConfigurationError::WrongRegion` | No |
| 307 | TemporaryRedirect | `ConfigurationError::WrongRegion` | No |
| 400 | InvalidRequest | `RequestError::ValidationError` | No |
| 400 | InvalidBucketName | `RequestError::InvalidBucketName` | No |
| 400 | EntityTooLarge | `RequestError::EntityTooLarge` | No |
| 400 | EntityTooSmall | `MultipartError::EntityTooSmall` | No |
| 400 | InvalidPart | `MultipartError::InvalidPart` | No |
| 400 | InvalidPartOrder | `MultipartError::InvalidPartOrder` | No |
| 400 | TooManyParts | `MultipartError::TooManyParts` | No |
| 403 | AccessDenied | `AccessError::AccessDenied` | No |
| 403 | InvalidAccessKeyId | `AccessError::InvalidAccessKeyId` | No |
| 403 | SignatureDoesNotMatch | `AccessError::SignatureDoesNotMatch` | No |
| 403 | ExpiredToken | `AccessError::ExpiredToken` | No |
| 404 | NoSuchBucket | `BucketError::BucketNotFound` | No |
| 404 | NoSuchKey | `ObjectError::ObjectNotFound` | No |
| 404 | NoSuchUpload | `MultipartError::UploadNotFound` | No |
| 409 | BucketAlreadyExists | `BucketError::BucketAlreadyExists` | No |
| 409 | BucketAlreadyOwnedByYou | `BucketError::BucketAlreadyOwnedByYou` | No |
| 409 | BucketNotEmpty | `BucketError::BucketNotEmpty` | No |
| 412 | PreconditionFailed | `ObjectError::PreconditionFailed` | No |
| 500 | InternalError | `ServerError::InternalError` | Yes |
| 503 | ServiceUnavailable | `ServerError::ServiceUnavailable` | Yes |
| 503 | SlowDown | `ServerError::SlowDown` | Yes |

---

## 7. Resilience Hooks

### 7.1 Retry Integration

The module integrates with `integrations-retry` for automatic retry of transient failures.

```rust
/// Retry configuration for S3 requests.
pub struct S3RetryConfig {
    /// Base configuration from primitives.
    pub base: RetryConfig,

    /// Override retry behavior per error type.
    pub error_overrides: HashMap<ErrorCategory, RetryBehavior>,
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
| `ServerError::SlowDown` | Yes | 5 | Use `retry_after` or 1s exponential |
| `ServerError::InternalError` | Yes | 3 | 1s exponential |
| `ServerError::ServiceUnavailable` | Yes | 3 | Use `retry_after` or 1s |
| `NetworkError::Timeout` | Yes | 3 | 500ms exponential |
| `NetworkError::ConnectionFailed` | Yes | 3 | 500ms exponential |
| `TransferError::StreamInterrupted` | Yes | 2 | 1s |
| All others | No | - | - |

### 7.2 Circuit Breaker Integration

The module integrates with `integrations-circuit-breaker` to prevent cascading failures.

```rust
/// Circuit breaker configuration for S3.
pub struct S3CircuitBreakerConfig {
    /// Base configuration from primitives.
    pub base: CircuitBreakerConfig,

    /// Failure threshold before opening.
    pub failure_threshold: u32,

    /// Success threshold to close.
    pub success_threshold: u32,

    /// Time before attempting half-open.
    pub reset_timeout: Duration,
}

impl Default for S3CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            base: CircuitBreakerConfig::default(),
            failure_threshold: 5,
            success_threshold: 3,
            reset_timeout: Duration::from_secs(30),
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
/// Rate limit configuration for S3.
pub struct S3RateLimitConfig {
    /// Requests per second limit (per bucket or global).
    pub requests_per_second: Option<u32>,

    /// Concurrent request limit.
    pub max_concurrent_requests: Option<u32>,

    /// Bytes per second limit (upload/download).
    pub bytes_per_second: Option<u64>,
}
```

**Rate Limit Handling:**

1. **Client-side limiting**: Pre-emptively limit requests based on configuration
2. **Server response**: Parse `SlowDown` responses and back off
3. **Adaptive throttling**: Reduce rate when receiving 503 responses
4. **Per-bucket isolation**: Option to track limits per bucket

---

## 8. Security Requirements

### 8.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| Access keys never logged | Use `SecretString`, redact in Debug |
| Session tokens protected | `SecretString` with Zeroize |
| Credentials not in stack traces | No Display impl, zero on drop |
| Credentials refreshed automatically | Provider abstraction with caching |
| Support temporary credentials | STS session tokens |
| Support IAM roles | Instance metadata, ECS task role |

### 8.2 AWS Signature Security

| Requirement | Implementation |
|-------------|----------------|
| Signature V4 only | No V2 signature support |
| Timestamp validation | Within 15 minutes |
| Payload hashing | SHA256 for all requests |
| Unsigned payloads | Only for streaming with chunked encoding |
| Secure string comparison | Constant-time comparison |

### 8.3 Transport Security

| Requirement | Implementation |
|-------------|----------------|
| TLS 1.2+ only | Configure in HTTP client |
| Certificate validation | Enable by default |
| No insecure fallback | Fail on TLS errors |
| HTTP not allowed | Force HTTPS endpoints |

### 8.4 Input Validation

| Requirement | Implementation |
|-------------|----------------|
| Bucket name validation | DNS-compatible, 3-63 chars |
| Object key validation | UTF-8, 1-1024 bytes |
| Metadata validation | ASCII printable values |
| Tag validation | Key/value length limits |

### 8.5 Output Handling

| Requirement | Implementation |
|-------------|----------------|
| Response validation | XML schema validation |
| Content verification | ETag/checksum matching |
| Error message safety | No credential exposure |
| Metadata sanitization | Validate before exposing |

---

## 9. Observability Requirements

### 9.1 Tracing

Every API call must create a trace span with:

| Attribute | Type | Description |
|-----------|------|-------------|
| `s3.service` | string | Service name ("s3") |
| `s3.operation` | string | Operation name (e.g., "PutObject") |
| `s3.bucket` | string | Bucket name |
| `s3.key` | string | Object key (if applicable) |
| `s3.region` | string | AWS region |
| `s3.request_id` | string | S3 request ID |
| `s3.extended_request_id` | string | S3 extended request ID |
| `s3.content_length` | integer | Request/response body size |
| `s3.storage_class` | string | Storage class (if applicable) |
| `s3.version_id` | string | Object version ID |
| `error.type` | string | Error category (if failed) |
| `error.message` | string | Error message (if failed) |
| `error.s3_code` | string | S3 error code (if failed) |

### 9.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `s3_requests_total` | Counter | `operation`, `bucket`, `status` |
| `s3_request_duration_seconds` | Histogram | `operation`, `bucket` |
| `s3_bytes_transferred_total` | Counter | `operation`, `bucket`, `direction` |
| `s3_objects_listed_total` | Counter | `bucket` |
| `s3_multipart_parts_total` | Counter | `bucket`, `status` |
| `s3_errors_total` | Counter | `operation`, `error_type`, `s3_code` |
| `s3_retries_total` | Counter | `operation`, `attempt` |
| `s3_circuit_breaker_state` | Gauge | `bucket`, `state` |
| `s3_presigned_urls_total` | Counter | `operation` |

### 9.3 Logging

| Level | When |
|-------|------|
| `ERROR` | Non-retryable failures, configuration errors |
| `WARN` | Retryable failures, rate limits, circuit breaker trips |
| `INFO` | Request completion, multipart upload events |
| `DEBUG` | Request/response details (sanitized) |
| `TRACE` | AWS signing details, internal state transitions |

**Log Fields:**

| Field | Description |
|-------|-------------|
| `request_id` | S3 request ID |
| `extended_request_id` | S3 extended request ID |
| `bucket` | Bucket name |
| `key` | Object key |
| `operation` | S3 operation |
| `duration_ms` | Request duration |
| `bytes_transferred` | Bytes uploaded/downloaded |
| `error.type` | Error category |
| `error.code` | S3 error code |
| `retry.attempt` | Current retry attempt |
| `multipart.upload_id` | Multipart upload ID |
| `multipart.part_number` | Part number |

---

## 10. Performance Requirements

### 10.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| Request signing | < 1ms | < 5ms |
| XML parsing | < 5ms | < 20ms |
| Presigned URL generation | < 1ms | < 5ms |
| Small object upload (< 1MB) | < 100ms + network | < 500ms + network |
| Small object download (< 1MB) | < 50ms + network | < 200ms + network |

### 10.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Concurrent requests | 100+ (configurable) |
| Streaming throughput | Line-rate with network |
| Multipart upload concurrency | 4-16 parts simultaneously |
| ListObjects pagination | 1000 keys per request |

### 10.3 Resource Limits

| Resource | Limit |
|----------|-------|
| Memory per request | < 1MB typical (excluding body) |
| Memory per stream | Configurable buffer size |
| Connection pool size | Configurable (default: 20) |
| Request body size | Up to 5GB (PutObject), 5TB (Multipart) |
| Part size | 5MB minimum, 5GB maximum |
| Maximum parts | 10,000 per multipart upload |

---

## 11. Future-Proofing

### 11.1 Extensibility Points

| Extension Point | Mechanism |
|-----------------|-----------|
| New S3 operations | Add new service trait methods |
| Custom storage classes | Extend `StorageClass` enum |
| New checksum algorithms | Extend `ChecksumAlgorithm` enum |
| S3-compatible services | Configurable endpoint + path style |
| Custom credential providers | Implement `CredentialsProvider` trait |
| Custom transport | Implement `HttpTransport` trait |

### 11.2 Version Compatibility

| Aspect | Strategy |
|--------|----------|
| S3 API version | Maintain compatibility with current S3 API |
| Response fields | Ignore unknown XML elements |
| Request fields | Builder pattern with optional fields |
| Breaking changes | Major version bump, migration guide |

### 11.3 S3-Compatible Services

The module should support S3-compatible services:

| Service | Configuration |
|---------|---------------|
| MinIO | Custom endpoint, path style |
| DigitalOcean Spaces | Custom endpoint, virtual hosted |
| Backblaze B2 | Custom endpoint, path style |
| Cloudflare R2 | Custom endpoint, virtual hosted |
| Wasabi | Custom endpoint, virtual hosted |

---

## 12. Acceptance Criteria

### 12.1 Functional Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| FC-1 | PutObject works (small object) | Integration test |
| FC-2 | PutObject works (streaming) | Integration test |
| FC-3 | GetObject works (full download) | Integration test |
| FC-4 | GetObject works (range request) | Integration test |
| FC-5 | GetObject works (streaming) | Integration test |
| FC-6 | DeleteObject works | Integration test |
| FC-7 | DeleteObjects works (batch) | Integration test |
| FC-8 | HeadObject returns metadata | Integration test |
| FC-9 | CopyObject works (same bucket) | Integration test |
| FC-10 | CopyObject works (cross bucket) | Integration test |
| FC-11 | ListObjectsV2 works | Integration test |
| FC-12 | ListObjectsV2 pagination works | Integration test |
| FC-13 | CreateBucket works | Integration test |
| FC-14 | DeleteBucket works | Integration test |
| FC-15 | HeadBucket works | Integration test |
| FC-16 | ListBuckets works | Integration test |
| FC-17 | Multipart upload works | Integration test |
| FC-18 | Multipart abort works | Integration test |
| FC-19 | ListParts works | Integration test |
| FC-20 | Presigned GET URL works | Integration test |
| FC-21 | Presigned PUT URL works | Integration test |
| FC-22 | Object tagging works | Integration test |
| FC-23 | SSE-S3 encryption works | Integration test |
| FC-24 | SSE-KMS encryption works | Integration test |
| FC-25 | All error types mapped correctly | Unit tests |
| FC-26 | AWS Signature V4 correct | Unit tests, integration test |

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
| NFC-11 | Large file upload works (> 100MB) | Integration test |
| NFC-12 | Works with S3-compatible services | MinIO test |

### 12.3 Documentation Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| DC-1 | All public APIs documented | Doc coverage |
| DC-2 | Examples for common operations | Doc review |
| DC-3 | Error handling documented | Doc review |
| DC-4 | Configuration options documented | Doc review |
| DC-5 | Migration guides for breaking changes | Release notes |
| DC-6 | S3-compatible service setup guide | Doc review |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial specification |

---

**End of Specification Phase**

*The next phase (Pseudocode) will provide detailed algorithmic descriptions for implementing each component, including AWS Signature V4 signing, XML parsing, multipart upload orchestration, and streaming operations.*
