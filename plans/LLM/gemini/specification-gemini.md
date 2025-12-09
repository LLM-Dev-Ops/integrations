# SPARC Specification: Google Gemini Integration Module

**Specification Phase Document**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/gemini`

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
11. [Testing Requirements](#11-testing-requirements)
12. [Configuration](#12-configuration)
13. [Acceptance Criteria](#13-acceptance-criteria)

---

## 1. Overview

### 1.1 Document Purpose

This specification defines the requirements, interfaces, and constraints for the Google Gemini Integration Module within the LLM-Dev-Ops Integration Repository. It serves as the authoritative source for what the module must accomplish, following the SPARC methodology and London-School TDD principles.

### 1.2 Audience

- Implementation developers (Rust and TypeScript)
- QA engineers designing test strategies
- Architects reviewing integration patterns
- Security reviewers assessing credential handling

### 1.3 Methodology

This specification follows:
- **SPARC Methodology**: Specification → Pseudocode → Architecture → Refinement → Completion
- **London-School TDD**: Interface-first design enabling mock-based testing
- **SOLID Principles**: Clean, maintainable, extensible design

### 1.4 API Version

| Attribute | Value |
|-----------|-------|
| Base URL | `https://generativelanguage.googleapis.com` |
| API Version | v1beta / v1 |
| Auth Method | API Key (URL parameter or header) |
| Content-Type | `application/json` |

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The Google Gemini Integration Module provides a production-ready, type-safe interface for interacting with Google's Generative AI (Gemini) API. It abstracts HTTP communication, handles authentication, manages resilience patterns, and provides comprehensive observability—all while maintaining clean dependency boundaries.

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **API Abstraction** | Type-safe wrappers for all Gemini API endpoints |
| **Authentication** | Secure management of API keys with proper credential handling |
| **Transport** | HTTP/HTTPS communication with connection pooling |
| **Streaming** | Server-sent-style chunked response parsing for streaming responses |
| **Serialization** | JSON serialization/deserialization with strict type validation |
| **Resilience Integration** | Hooks for retry, circuit breaker, and rate limiting primitives |
| **Observability** | Tracing spans, metrics emission, structured logging |
| **Error Mapping** | Translation of API errors to typed domain errors |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Generate Content API | Sync and streaming content generation |
| Embed Content API | Text embedding generation |
| Count Tokens API | Token counting for content |
| Models API | List and get model information |
| Files API | Upload, list, get, and delete files |
| Cached Content API | Content caching for reduced latency |
| Tuned Models API | Fine-tuned model management |
| Safety Settings | Content filtering configuration |
| Tool/Function Calling | Tool definitions and function execution |
| Multi-modal Input | Text, images, audio, video, documents |
| Grounding | Google Search grounding support |
| Code Execution | Built-in code execution tool |
| Dual Language | Rust (primary) and TypeScript implementations |

#### Out of Scope

| Item | Reason |
|------|--------|
| Other LLM providers | Separate integration modules (OpenAI, Anthropic, etc.) |
| ruvbase (Layer 0) | External dependency, not implemented here |
| Business logic | Application-layer concern |
| Prompt engineering | Higher-level abstraction |
| Vertex AI | Separate authentication model (OAuth2/Service Account) |
| AI Studio UI | Web interface, not API |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| No direct HTTP client dependency exposure | Encapsulation, testability |
| Async-first design | I/O-bound operations, efficiency |
| Zero `unsafe` in public API (Rust) | Safety guarantees |
| No panics in production paths | Reliability |
| Trait-based abstractions | London-School TDD, mockability |
| Semantic versioning | API stability |

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
| `integrations-types` | Shared type definitions (SecretString) | `integrations_types` |
| `integrations-config` | Configuration management | `integrations_config` |

### 3.2 External Dependencies (Rust)

| Crate | Version | Purpose |
|-------|---------|---------|
| `tokio` | 1.x | Async runtime |
| `reqwest` | 0.11+ | HTTP client (behind transport trait) |
| `serde` | 1.x | Serialization framework |
| `serde_json` | 1.x | JSON serialization |
| `thiserror` | 1.x | Error derive macros |
| `async-trait` | 0.1+ | Async trait support |
| `secrecy` | 0.8+ | Secret string handling |
| `tracing` | 0.1+ | Instrumentation |
| `futures` | 0.3+ | Async utilities |
| `bytes` | 1.x | Byte buffer utilities |
| `url` | 2.x | URL parsing |
| `base64` | 0.21+ | Base64 encoding for inline data |
| `mime` | 0.3+ | MIME type handling |

### 3.3 External Dependencies (TypeScript)

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | 5.x | Language |
| `undici` / native fetch | Latest | HTTP client |
| `zod` | 3.x | Runtime type validation |

### 3.4 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `ruvbase` | Layer 0, external to this module |
| `integrations-openai` | No cross-integration dependencies |
| `integrations-anthropic` | No cross-integration dependencies |
| `integrations-mistral` | No cross-integration dependencies |
| `integrations-cohere` | No cross-integration dependencies |
| Any LLM-specific crate | This module IS the LLM integration |

---

## 4. API Coverage

### 4.1 Generate Content API

The primary API for text generation with Gemini models.

#### 4.1.1 Generate Content (Non-Streaming)

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /v1beta/models/{model}:generateContent` |
| Authentication | API key (query param `key` or header `x-goog-api-key`) |
| Request Format | JSON |
| Response Format | JSON |

**Request Parameters:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GENERATE CONTENT REQUEST                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GenerateContentRequest:                                                    │
│  {                                                                          │
│      "contents": [                          // Required                     │
│          {                                                                  │
│              "role": "user" | "model",                                      │
│              "parts": [                                                     │
│                  { "text": "string" },                                      │
│                  { "inlineData": { "mimeType": "...", "data": "base64" }},  │
│                  { "fileData": { "mimeType": "...", "fileUri": "..." }},    │
│                  { "functionCall": { "name": "...", "args": {...} }},       │
│                  { "functionResponse": { "name": "...", "response": {...}}} │
│              ]                                                              │
│          }                                                                  │
│      ],                                                                     │
│      "systemInstruction": {                 // Optional                     │
│          "role": "system",                                                  │
│          "parts": [{ "text": "..." }]                                       │
│      },                                                                     │
│      "tools": [                             // Optional                     │
│          {                                                                  │
│              "functionDeclarations": [                                      │
│                  {                                                          │
│                      "name": "string",                                      │
│                      "description": "string",                               │
│                      "parameters": { OpenAPI Schema }                       │
│                  }                                                          │
│              ]                                                              │
│          },                                                                 │
│          { "codeExecution": {} },           // Enable code execution        │
│          { "googleSearchRetrieval": {} }    // Enable Google Search         │
│      ],                                                                     │
│      "toolConfig": {                        // Optional                     │
│          "functionCallingConfig": {                                         │
│              "mode": "AUTO" | "ANY" | "NONE",                               │
│              "allowedFunctionNames": ["..."]                                │
│          }                                                                  │
│      },                                                                     │
│      "safetySettings": [                    // Optional                     │
│          {                                                                  │
│              "category": "HARM_CATEGORY_*",                                 │
│              "threshold": "BLOCK_*_AND_ABOVE"                               │
│          }                                                                  │
│      ],                                                                     │
│      "generationConfig": {                  // Optional                     │
│          "temperature": 0.0-2.0,                                            │
│          "topP": 0.0-1.0,                                                   │
│          "topK": integer,                                                   │
│          "maxOutputTokens": integer,                                        │
│          "stopSequences": ["..."],                                          │
│          "candidateCount": 1-8,                                             │
│          "responseMimeType": "text/plain" | "application/json",             │
│          "responseSchema": { OpenAPI Schema }  // For JSON mode             │
│      },                                                                     │
│      "cachedContent": "string"              // Cached content name          │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Response Schema:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GENERATE CONTENT RESPONSE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GenerateContentResponse:                                                   │
│  {                                                                          │
│      "candidates": [                                                        │
│          {                                                                  │
│              "content": {                                                   │
│                  "role": "model",                                           │
│                  "parts": [                                                 │
│                      { "text": "string" },                                  │
│                      { "functionCall": { "name": "...", "args": {...} }},   │
│                      { "executableCode": { "language": "...", "code": ""}}, │
│                      { "codeExecutionResult": { "outcome": "...", ... }}    │
│                  ]                                                          │
│              },                                                             │
│              "finishReason": "STOP" | "MAX_TOKENS" | "SAFETY" |             │
│                              "RECITATION" | "OTHER" | "BLOCKLIST" |         │
│                              "PROHIBITED_CONTENT" | "SPII",                 │
│              "safetyRatings": [                                             │
│                  {                                                          │
│                      "category": "HARM_CATEGORY_*",                         │
│                      "probability": "NEGLIGIBLE" | "LOW" | "MEDIUM" | "HIGH"│
│                  }                                                          │
│              ],                                                             │
│              "citationMetadata": {                                          │
│                  "citationSources": [                                       │
│                      { "startIndex": int, "endIndex": int, "uri": "..." }   │
│                  ]                                                          │
│              },                                                             │
│              "groundingMetadata": {                                         │
│                  "webSearchQueries": ["..."],                               │
│                  "searchEntryPoint": { ... },                               │
│                  "groundingChunks": [ ... ],                                │
│                  "groundingSupports": [ ... ]                               │
│              },                                                             │
│              "index": integer,                                              │
│              "tokenCount": integer                                          │
│          }                                                                  │
│      ],                                                                     │
│      "usageMetadata": {                                                     │
│          "promptTokenCount": integer,                                       │
│          "candidatesTokenCount": integer,                                   │
│          "totalTokenCount": integer,                                        │
│          "cachedContentTokenCount": integer                                 │
│      },                                                                     │
│      "modelVersion": "string"                                               │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 4.1.2 Stream Generate Content

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /v1beta/models/{model}:streamGenerateContent` |
| Response Format | Chunked JSON (newline-delimited) |

**Streaming Response:**

Each chunk is a complete `GenerateContentResponse` object with partial content. Chunks are separated by newlines and contain incremental updates to the response.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STREAMING RESPONSE FORMAT                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Streaming chunks are JSON objects separated by newlines:                   │
│                                                                             │
│  {"candidates":[{"content":{"parts":[{"text":"Hello"}],"role":"model"}}]}   │
│  {"candidates":[{"content":{"parts":[{"text":" World"}],"role":"model"}}]}  │
│  {"candidates":[{"content":{"parts":[{"text":"!"}],"role":"model"},         │
│   "finishReason":"STOP"}],"usageMetadata":{...}}                            │
│                                                                             │
│  Note: Unlike OpenAI/Anthropic SSE, Gemini uses plain JSON chunks.          │
│  Each chunk contains complete JSON that can be parsed independently.        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Embed Content API

Generate embeddings for text content.

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /v1beta/models/{model}:embedContent` |
| Batch Endpoint | `POST /v1beta/models/{model}:batchEmbedContents` |

**Request Schema:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       EMBED CONTENT REQUEST                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  EmbedContentRequest:                                                       │
│  {                                                                          │
│      "model": "models/text-embedding-004",  // Required                     │
│      "content": {                           // Required                     │
│          "parts": [{ "text": "..." }]                                       │
│      },                                                                     │
│      "taskType": "RETRIEVAL_QUERY" |        // Optional                     │
│                  "RETRIEVAL_DOCUMENT" |                                     │
│                  "SEMANTIC_SIMILARITY" |                                    │
│                  "CLASSIFICATION" |                                         │
│                  "CLUSTERING",                                              │
│      "title": "string",                     // Optional (for RETRIEVAL_DOC) │
│      "outputDimensionality": integer        // Optional (truncate output)   │
│  }                                                                          │
│                                                                             │
│  BatchEmbedContentsRequest:                                                 │
│  {                                                                          │
│      "requests": [EmbedContentRequest, ...]                                 │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Response Schema:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       EMBED CONTENT RESPONSE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  EmbedContentResponse:                                                      │
│  {                                                                          │
│      "embedding": {                                                         │
│          "values": [float, float, ...]      // Embedding vector             │
│      }                                                                      │
│  }                                                                          │
│                                                                             │
│  BatchEmbedContentsResponse:                                                │
│  {                                                                          │
│      "embeddings": [                                                        │
│          { "values": [...] },                                               │
│          ...                                                                │
│      ]                                                                      │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Count Tokens API

Count tokens for content without generating a response.

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /v1beta/models/{model}:countTokens` |

**Request Schema:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       COUNT TOKENS REQUEST                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CountTokensRequest:                                                        │
│  {                                                                          │
│      "contents": [...],                     // Same as generateContent      │
│      "generateContentRequest": {...}        // Or full request object       │
│  }                                                                          │
│                                                                             │
│  Response:                                                                  │
│  {                                                                          │
│      "totalTokens": integer,                                                │
│      "cachedContentTokenCount": integer     // If using cached content      │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Models API

List and retrieve model information.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            MODELS API                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  List Models                                                                │
│  Endpoint: GET /v1beta/models                                               │
│  Query Params: ?pageSize=int&pageToken=string                               │
│                                                                             │
│  Response:                                                                  │
│  {                                                                          │
│      "models": [                                                            │
│          {                                                                  │
│              "name": "models/gemini-2.0-flash",                             │
│              "version": "2.0",                                              │
│              "displayName": "Gemini 2.0 Flash",                             │
│              "description": "...",                                          │
│              "inputTokenLimit": 1048576,                                    │
│              "outputTokenLimit": 8192,                                      │
│              "supportedGenerationMethods": [                                │
│                  "generateContent",                                         │
│                  "countTokens"                                              │
│              ],                                                             │
│              "temperature": 1.0,                                            │
│              "topP": 0.95,                                                  │
│              "topK": 64,                                                    │
│              "maxTemperature": 2.0                                          │
│          }                                                                  │
│      ],                                                                     │
│      "nextPageToken": "string"                                              │
│  }                                                                          │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Get Model                                                                  │
│  Endpoint: GET /v1beta/models/{model}                                       │
│                                                                             │
│  Response: Same as single model object above                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.5 Files API

Upload and manage files for use with Gemini.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             FILES API                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Upload File (Resumable)                                                    │
│  Endpoint: POST /upload/v1beta/files                                        │
│  Headers: X-Goog-Upload-Protocol: resumable                                 │
│           X-Goog-Upload-Command: start                                      │
│           X-Goog-Upload-Header-Content-Length: <size>                       │
│           X-Goog-Upload-Header-Content-Type: <mime-type>                    │
│                                                                             │
│  Request Body (JSON):                                                       │
│  {                                                                          │
│      "file": {                                                              │
│          "displayName": "string"            // Optional                     │
│      }                                                                      │
│  }                                                                          │
│                                                                             │
│  Upload Response (Headers):                                                 │
│  X-Goog-Upload-URL: <resumable-upload-url>                                  │
│                                                                             │
│  Then upload bytes to the resumable URL.                                    │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  List Files                                                                 │
│  Endpoint: GET /v1beta/files                                                │
│  Query Params: ?pageSize=int&pageToken=string                               │
│                                                                             │
│  Response:                                                                  │
│  {                                                                          │
│      "files": [                                                             │
│          {                                                                  │
│              "name": "files/abc123",                                        │
│              "displayName": "myfile.pdf",                                   │
│              "mimeType": "application/pdf",                                 │
│              "sizeBytes": "123456",                                         │
│              "createTime": "2025-01-01T00:00:00Z",                          │
│              "updateTime": "2025-01-01T00:00:00Z",                          │
│              "expirationTime": "2025-01-03T00:00:00Z",                      │
│              "sha256Hash": "base64-hash",                                   │
│              "uri": "https://generativelanguage.googleapis.com/...",        │
│              "state": "PROCESSING" | "ACTIVE" | "FAILED"                    │
│          }                                                                  │
│      ],                                                                     │
│      "nextPageToken": "string"                                              │
│  }                                                                          │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Get File                                                                   │
│  Endpoint: GET /v1beta/files/{file}                                         │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Delete File                                                                │
│  Endpoint: DELETE /v1beta/files/{file}                                      │
│                                                                             │
│  Response: Empty (204 No Content)                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.6 Cached Content API

Create and manage cached content for reduced latency.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CACHED CONTENT API                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Create Cached Content                                                      │
│  Endpoint: POST /v1beta/cachedContents                                      │
│                                                                             │
│  Request:                                                                   │
│  {                                                                          │
│      "model": "models/gemini-1.5-flash-001",                                │
│      "displayName": "string",               // Optional                     │
│      "contents": [...],                     // Content to cache             │
│      "systemInstruction": {...},            // Optional                     │
│      "tools": [...],                        // Optional                     │
│      "ttl": "3600s" | "expireTime": "..."   // Duration or timestamp        │
│  }                                                                          │
│                                                                             │
│  Response (CachedContent):                                                  │
│  {                                                                          │
│      "name": "cachedContents/abc123",                                       │
│      "displayName": "string",                                               │
│      "model": "models/gemini-1.5-flash-001",                                │
│      "createTime": "timestamp",                                             │
│      "updateTime": "timestamp",                                             │
│      "expireTime": "timestamp",                                             │
│      "usageMetadata": {                                                     │
│          "totalTokenCount": integer                                         │
│      }                                                                      │
│  }                                                                          │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  List Cached Contents                                                       │
│  Endpoint: GET /v1beta/cachedContents                                       │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Get Cached Content                                                         │
│  Endpoint: GET /v1beta/cachedContents/{cachedContent}                       │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Update Cached Content                                                      │
│  Endpoint: PATCH /v1beta/cachedContents/{cachedContent}                     │
│  Query Params: ?updateMask=ttl,expireTime                                   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Delete Cached Content                                                      │
│  Endpoint: DELETE /v1beta/cachedContents/{cachedContent}                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.7 API Endpoint Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1beta/models` | GET | List models |
| `/v1beta/models/{model}` | GET | Get model |
| `/v1beta/models/{model}:generateContent` | POST | Generate content (sync) |
| `/v1beta/models/{model}:streamGenerateContent` | POST | Generate content (stream) |
| `/v1beta/models/{model}:countTokens` | POST | Count tokens |
| `/v1beta/models/{model}:embedContent` | POST | Generate embedding |
| `/v1beta/models/{model}:batchEmbedContents` | POST | Batch embeddings |
| `/upload/v1beta/files` | POST | Upload file |
| `/v1beta/files` | GET | List files |
| `/v1beta/files/{file}` | GET | Get file |
| `/v1beta/files/{file}` | DELETE | Delete file |
| `/v1beta/cachedContents` | POST | Create cached content |
| `/v1beta/cachedContents` | GET | List cached contents |
| `/v1beta/cachedContents/{id}` | GET | Get cached content |
| `/v1beta/cachedContents/{id}` | PATCH | Update cached content |
| `/v1beta/cachedContents/{id}` | DELETE | Delete cached content |

---

## 5. Interface Definitions

### 5.1 Rust Interfaces

#### 5.1.1 Client Interface

```rust
/// Main client for interacting with Google Gemini API.
#[async_trait]
pub trait GeminiClient: Send + Sync {
    /// Access the content generation service.
    fn content(&self) -> &dyn ContentService;

    /// Access the embeddings service.
    fn embeddings(&self) -> &dyn EmbeddingsService;

    /// Access the models service.
    fn models(&self) -> &dyn ModelsService;

    /// Access the files service.
    fn files(&self) -> &dyn FilesService;

    /// Access the cached content service.
    fn cached_content(&self) -> &dyn CachedContentService;
}

/// Factory for creating Gemini clients.
pub trait GeminiClientFactory: Send + Sync {
    /// Create a new client with the given configuration.
    fn create(&self, config: GeminiConfig) -> Result<Arc<dyn GeminiClient>, GeminiError>;
}
```

#### 5.1.2 Content Service Interface

```rust
/// Service for content generation with Gemini models.
#[async_trait]
pub trait ContentService: Send + Sync {
    /// Generate content (non-streaming).
    async fn generate(
        &self,
        model: &str,
        request: GenerateContentRequest,
    ) -> Result<GenerateContentResponse, GeminiError>;

    /// Generate content with streaming response.
    async fn generate_stream(
        &self,
        model: &str,
        request: GenerateContentRequest,
    ) -> Result<ContentStream, GeminiError>;

    /// Count tokens for content.
    async fn count_tokens(
        &self,
        model: &str,
        request: CountTokensRequest,
    ) -> Result<CountTokensResponse, GeminiError>;
}
```

#### 5.1.3 Embeddings Service Interface

```rust
/// Service for generating embeddings.
#[async_trait]
pub trait EmbeddingsService: Send + Sync {
    /// Generate embedding for single content.
    async fn embed(
        &self,
        model: &str,
        request: EmbedContentRequest,
    ) -> Result<EmbedContentResponse, GeminiError>;

    /// Generate embeddings for multiple contents.
    async fn batch_embed(
        &self,
        model: &str,
        requests: Vec<EmbedContentRequest>,
    ) -> Result<BatchEmbedContentsResponse, GeminiError>;
}
```

#### 5.1.4 Models Service Interface

```rust
/// Service for listing and retrieving model information.
#[async_trait]
pub trait ModelsService: Send + Sync {
    /// List all available models.
    async fn list(
        &self,
        params: Option<ListModelsParams>,
    ) -> Result<ListModelsResponse, GeminiError>;

    /// Get a specific model by name.
    async fn get(
        &self,
        model: &str,
    ) -> Result<Model, GeminiError>;
}
```

#### 5.1.5 Files Service Interface

```rust
/// Service for file upload and management.
#[async_trait]
pub trait FilesService: Send + Sync {
    /// Upload a file.
    async fn upload(
        &self,
        request: UploadFileRequest,
    ) -> Result<File, GeminiError>;

    /// List uploaded files.
    async fn list(
        &self,
        params: Option<ListFilesParams>,
    ) -> Result<ListFilesResponse, GeminiError>;

    /// Get file metadata.
    async fn get(
        &self,
        file_name: &str,
    ) -> Result<File, GeminiError>;

    /// Delete a file.
    async fn delete(
        &self,
        file_name: &str,
    ) -> Result<(), GeminiError>;
}
```

#### 5.1.6 Cached Content Service Interface

```rust
/// Service for cached content management.
#[async_trait]
pub trait CachedContentService: Send + Sync {
    /// Create cached content.
    async fn create(
        &self,
        request: CreateCachedContentRequest,
    ) -> Result<CachedContent, GeminiError>;

    /// List cached contents.
    async fn list(
        &self,
        params: Option<ListCachedContentsParams>,
    ) -> Result<ListCachedContentsResponse, GeminiError>;

    /// Get cached content.
    async fn get(
        &self,
        name: &str,
    ) -> Result<CachedContent, GeminiError>;

    /// Update cached content TTL.
    async fn update(
        &self,
        name: &str,
        request: UpdateCachedContentRequest,
    ) -> Result<CachedContent, GeminiError>;

    /// Delete cached content.
    async fn delete(
        &self,
        name: &str,
    ) -> Result<(), GeminiError>;
}
```

#### 5.1.7 Transport Interface

```rust
/// HTTP transport abstraction for testability.
#[async_trait]
pub trait HttpTransport: Send + Sync {
    /// Send an HTTP request and receive a response.
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError>;

    /// Send a streaming request and receive a chunked response stream.
    async fn send_streaming(
        &self,
        request: HttpRequest,
    ) -> Result<ChunkedStream, TransportError>;
}
```

#### 5.1.8 Core Data Types (Rust)

```rust
/// Content part variants.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Part {
    Text { text: String },
    InlineData { inline_data: Blob },
    FileData { file_data: FileData },
    FunctionCall { function_call: FunctionCall },
    FunctionResponse { function_response: FunctionResponse },
    ExecutableCode { executable_code: ExecutableCode },
    CodeExecutionResult { code_execution_result: CodeExecutionResult },
}

/// Blob for inline binary data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Blob {
    pub mime_type: String,
    pub data: String, // Base64-encoded
}

/// Reference to an uploaded file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileData {
    pub mime_type: Option<String>,
    pub file_uri: String,
}

/// Function call from the model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub args: serde_json::Value,
}

/// Function response from the client.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionResponse {
    pub name: String,
    pub response: serde_json::Value,
}

/// Content with role and parts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Content {
    pub role: Option<Role>,
    pub parts: Vec<Part>,
}

/// Role in conversation.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Model,
    System,
}

/// Safety setting for content filtering.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetySetting {
    pub category: HarmCategory,
    pub threshold: HarmBlockThreshold,
}

/// Harm category for safety settings.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum HarmCategory {
    #[serde(rename = "HARM_CATEGORY_HARASSMENT")]
    Harassment,
    #[serde(rename = "HARM_CATEGORY_HATE_SPEECH")]
    HateSpeech,
    #[serde(rename = "HARM_CATEGORY_SEXUALLY_EXPLICIT")]
    SexuallyExplicit,
    #[serde(rename = "HARM_CATEGORY_DANGEROUS_CONTENT")]
    DangerousContent,
    #[serde(rename = "HARM_CATEGORY_CIVIC_INTEGRITY")]
    CivicIntegrity,
}

/// Threshold for blocking harmful content.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum HarmBlockThreshold {
    #[serde(rename = "BLOCK_NONE")]
    BlockNone,
    #[serde(rename = "BLOCK_LOW_AND_ABOVE")]
    BlockLowAndAbove,
    #[serde(rename = "BLOCK_MEDIUM_AND_ABOVE")]
    BlockMediumAndAbove,
    #[serde(rename = "BLOCK_ONLY_HIGH")]
    BlockOnlyHigh,
}

/// Generation configuration.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_sequences: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candidate_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_schema: Option<serde_json::Value>,
}

/// Tool definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tool {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_declarations: Option<Vec<FunctionDeclaration>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code_execution: Option<CodeExecution>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub google_search_retrieval: Option<GoogleSearchRetrieval>,
}

/// Function declaration for tools.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionDeclaration {
    pub name: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<serde_json::Value>, // OpenAPI Schema
}

/// Enable code execution tool.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CodeExecution {}

/// Enable Google Search grounding.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct GoogleSearchRetrieval {}

/// Finish reason for generation.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FinishReason {
    Stop,
    MaxTokens,
    Safety,
    Recitation,
    Other,
    Blocklist,
    ProhibitedContent,
    Spii,
}

/// Usage metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageMetadata {
    pub prompt_token_count: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candidates_token_count: Option<i32>,
    pub total_token_count: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_content_token_count: Option<i32>,
}
```

### 5.2 TypeScript Interfaces

#### 5.2.1 Client Interface

```typescript
/**
 * Main client for interacting with Google Gemini API.
 */
interface GeminiClient {
  /** Access the content generation service. */
  readonly content: ContentService;

  /** Access the embeddings service. */
  readonly embeddings: EmbeddingsService;

  /** Access the models service. */
  readonly models: ModelsService;

  /** Access the files service. */
  readonly files: FilesService;

  /** Access the cached content service. */
  readonly cachedContent: CachedContentService;
}

/**
 * Factory for creating Gemini clients.
 */
interface GeminiClientFactory {
  create(config: GeminiConfig): GeminiClient;
}
```

#### 5.2.2 Service Interfaces

```typescript
/**
 * Service for content generation.
 */
interface ContentService {
  generate(model: string, request: GenerateContentRequest): Promise<GenerateContentResponse>;
  generateStream(model: string, request: GenerateContentRequest): AsyncIterable<GenerateContentResponse>;
  countTokens(model: string, request: CountTokensRequest): Promise<CountTokensResponse>;
}

/**
 * Service for embeddings.
 */
interface EmbeddingsService {
  embed(model: string, request: EmbedContentRequest): Promise<EmbedContentResponse>;
  batchEmbed(model: string, requests: EmbedContentRequest[]): Promise<BatchEmbedContentsResponse>;
}

/**
 * Service for models.
 */
interface ModelsService {
  list(params?: ListModelsParams): Promise<ListModelsResponse>;
  get(model: string): Promise<Model>;
}

/**
 * Service for files.
 */
interface FilesService {
  upload(request: UploadFileRequest): Promise<File>;
  list(params?: ListFilesParams): Promise<ListFilesResponse>;
  get(fileName: string): Promise<File>;
  delete(fileName: string): Promise<void>;
}

/**
 * Service for cached content.
 */
interface CachedContentService {
  create(request: CreateCachedContentRequest): Promise<CachedContent>;
  list(params?: ListCachedContentsParams): Promise<ListCachedContentsResponse>;
  get(name: string): Promise<CachedContent>;
  update(name: string, request: UpdateCachedContentRequest): Promise<CachedContent>;
  delete(name: string): Promise<void>;
}
```

#### 5.2.3 Core Types (TypeScript)

```typescript
/**
 * Content part types.
 */
type Part =
  | { text: string }
  | { inlineData: Blob }
  | { fileData: FileData }
  | { functionCall: FunctionCall }
  | { functionResponse: FunctionResponse }
  | { executableCode: ExecutableCode }
  | { codeExecutionResult: CodeExecutionResult };

interface Blob {
  mimeType: string;
  data: string; // Base64
}

interface FileData {
  mimeType?: string;
  fileUri: string;
}

interface FunctionCall {
  name: string;
  args: Record<string, unknown>;
}

interface FunctionResponse {
  name: string;
  response: Record<string, unknown>;
}

interface Content {
  role?: 'user' | 'model' | 'system';
  parts: Part[];
}

interface SafetySetting {
  category: HarmCategory;
  threshold: HarmBlockThreshold;
}

type HarmCategory =
  | 'HARM_CATEGORY_HARASSMENT'
  | 'HARM_CATEGORY_HATE_SPEECH'
  | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
  | 'HARM_CATEGORY_DANGEROUS_CONTENT'
  | 'HARM_CATEGORY_CIVIC_INTEGRITY';

type HarmBlockThreshold =
  | 'BLOCK_NONE'
  | 'BLOCK_LOW_AND_ABOVE'
  | 'BLOCK_MEDIUM_AND_ABOVE'
  | 'BLOCK_ONLY_HIGH';

interface GenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  candidateCount?: number;
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
}

interface Tool {
  functionDeclarations?: FunctionDeclaration[];
  codeExecution?: {};
  googleSearchRetrieval?: {};
}

interface FunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>; // OpenAPI Schema
}

type FinishReason =
  | 'STOP'
  | 'MAX_TOKENS'
  | 'SAFETY'
  | 'RECITATION'
  | 'OTHER'
  | 'BLOCKLIST'
  | 'PROHIBITED_CONTENT'
  | 'SPII';

interface UsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount?: number;
  totalTokenCount: number;
  cachedContentTokenCount?: number;
}

/**
 * Generate content request.
 */
interface GenerateContentRequest {
  contents: Content[];
  systemInstruction?: Content;
  tools?: Tool[];
  toolConfig?: ToolConfig;
  safetySettings?: SafetySetting[];
  generationConfig?: GenerationConfig;
  cachedContent?: string;
}

/**
 * Generate content response.
 */
interface GenerateContentResponse {
  candidates?: Candidate[];
  usageMetadata?: UsageMetadata;
  modelVersion?: string;
}

interface Candidate {
  content: Content;
  finishReason?: FinishReason;
  safetyRatings?: SafetyRating[];
  citationMetadata?: CitationMetadata;
  groundingMetadata?: GroundingMetadata;
  index?: number;
  tokenCount?: number;
}
```

---

## 6. Error Taxonomy

### 6.1 Error Hierarchy

```
GeminiError
├── ConfigurationError
│   ├── MissingApiKey
│   ├── InvalidBaseUrl
│   └── InvalidConfiguration
│
├── AuthenticationError
│   ├── InvalidApiKey
│   ├── ExpiredApiKey
│   └── QuotaExceeded
│
├── RequestError
│   ├── ValidationError
│   ├── InvalidModel
│   ├── InvalidParameter
│   ├── PayloadTooLarge
│   └── UnsupportedMediaType
│
├── RateLimitError
│   ├── TooManyRequests
│   ├── TokenLimitExceeded
│   └── QuotaExceeded
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
│   └── ModelOverloaded
│
├── ResponseError
│   ├── DeserializationError
│   ├── UnexpectedFormat
│   ├── StreamInterrupted
│   └── MalformedChunk
│
├── ContentError
│   ├── SafetyBlocked
│   ├── RecitationBlocked
│   ├── ProhibitedContent
│   └── UnsupportedContent
│
└── ResourceError
    ├── FileNotFound
    ├── FileProcessingFailed
    ├── CachedContentNotFound
    └── ModelNotFound
```

### 6.2 Error Type Definitions (Rust)

```rust
/// Top-level error type for the Gemini integration.
#[derive(Debug, thiserror::Error)]
pub enum GeminiError {
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    #[error("Authentication error: {0}")]
    Authentication(#[from] AuthenticationError),

    #[error("Request error: {0}")]
    Request(#[from] RequestError),

    #[error("Rate limit error: {0}")]
    RateLimit(#[from] RateLimitError),

    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    #[error("Server error: {0}")]
    Server(#[from] ServerError),

    #[error("Response error: {0}")]
    Response(#[from] ResponseError),

    #[error("Content error: {0}")]
    Content(#[from] ContentError),

    #[error("Resource error: {0}")]
    Resource(#[from] ResourceError),
}

impl GeminiError {
    /// Returns true if the error is retryable.
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            GeminiError::RateLimit(_)
                | GeminiError::Network(NetworkError::Timeout { .. })
                | GeminiError::Network(NetworkError::ConnectionFailed { .. })
                | GeminiError::Server(ServerError::ServiceUnavailable { .. })
                | GeminiError::Server(ServerError::ModelOverloaded { .. })
        )
    }

    /// Returns the retry delay hint if available.
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            GeminiError::RateLimit(e) => e.retry_after,
            GeminiError::Server(ServerError::ServiceUnavailable { retry_after, .. }) => *retry_after,
            _ => None,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ContentError {
    #[error("Content blocked due to safety settings: {category:?}")]
    SafetyBlocked {
        category: Option<HarmCategory>,
        probability: Option<String>,
    },

    #[error("Content blocked due to recitation")]
    RecitationBlocked,

    #[error("Prohibited content detected")]
    ProhibitedContent,

    #[error("Unsupported content type: {mime_type}")]
    UnsupportedContent { mime_type: String },
}
```

### 6.3 Error Mapping from HTTP

| HTTP Status | Error Type | Retryable |
|-------------|------------|-----------|
| 400 | `RequestError::ValidationError` | No |
| 401 | `AuthenticationError::InvalidApiKey` | No |
| 403 | `AuthenticationError::QuotaExceeded` | No |
| 404 | `ResourceError::*` | No |
| 413 | `RequestError::PayloadTooLarge` | No |
| 415 | `RequestError::UnsupportedMediaType` | No |
| 429 | `RateLimitError::TooManyRequests` | Yes |
| 500 | `ServerError::InternalError` | Yes (limited) |
| 503 | `ServerError::ServiceUnavailable` | Yes |

### 6.4 Gemini-Specific Error Response Format

```json
{
    "error": {
        "code": 400,
        "message": "Request contains an invalid argument.",
        "status": "INVALID_ARGUMENT",
        "details": [
            {
                "@type": "type.googleapis.com/google.rpc.BadRequest",
                "fieldViolations": [
                    {
                        "field": "contents[0].parts[0]",
                        "description": "Invalid value"
                    }
                ]
            }
        ]
    }
}
```

---

## 7. Resilience Hooks

### 7.1 Retry Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RETRY CONFIGURATION                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Default Retry Policy:                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ max_attempts: 3                                                     │    │
│  │ initial_delay: 1000ms                                               │    │
│  │ max_delay: 60000ms                                                  │    │
│  │ multiplier: 2.0                                                     │    │
│  │ jitter: 0.25 (±25%)                                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Retryable Conditions:                                                      │
│  • HTTP 429 (Rate Limit) - Respect Retry-After header                       │
│  • HTTP 500 (Internal Server Error)                                         │
│  • HTTP 503 (Service Unavailable)                                           │
│  • Connection errors                                                        │
│  • Timeout errors                                                           │
│  • Stream interruptions (for streaming requests)                            │
│                                                                             │
│  Non-Retryable Conditions:                                                  │
│  • HTTP 400 (Bad Request)                                                   │
│  • HTTP 401 (Unauthorized)                                                  │
│  • HTTP 403 (Forbidden)                                                     │
│  • HTTP 404 (Not Found)                                                     │
│  • Safety-blocked responses                                                 │
│  • Serialization errors                                                     │
│  • Configuration errors                                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Circuit Breaker Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CIRCUIT BREAKER CONFIGURATION                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Default Circuit Breaker Settings:                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ failure_threshold: 5                 // Failures to open circuit    │    │
│  │ success_threshold: 3                 // Successes to close circuit  │    │
│  │ open_duration: 30s                   // Time circuit stays open     │    │
│  │ half_open_max_requests: 1            // Probe requests in half-open │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  State Transitions:                                                         │
│  • CLOSED → OPEN: failure_threshold consecutive failures                    │
│  • OPEN → HALF_OPEN: open_duration elapsed                                  │
│  • HALF_OPEN → CLOSED: success_threshold successes                          │
│  • HALF_OPEN → OPEN: Any failure                                            │
│                                                                             │
│  Tracked Failures:                                                          │
│  • HTTP 500-599 errors                                                      │
│  • Connection errors                                                        │
│  • Timeout errors                                                           │
│                                                                             │
│  Excluded from Tracking:                                                    │
│  • HTTP 4xx errors (except 429)                                             │
│  • Content safety blocks                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Rate Limiter Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      RATE LIMITER CONFIGURATION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Client-Side Rate Limiting (Token Bucket):                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Configurable limits per endpoint type:                              │    │
│  │                                                                     │    │
│  │ Generate Content:                                                   │    │
│  │   requests_per_minute: configurable (default: 60)                   │    │
│  │   tokens_per_minute: configurable (default: 1,000,000)              │    │
│  │                                                                     │    │
│  │ Embeddings:                                                         │    │
│  │   requests_per_minute: configurable (default: 1500)                 │    │
│  │                                                                     │    │
│  │ Other Endpoints:                                                    │    │
│  │   requests_per_minute: configurable (default: 60)                   │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Server Rate Limit Headers:                                                 │
│  • Retry-After (on 429)                                                     │
│  • x-ratelimit-limit-requests (if provided)                                 │
│  • x-ratelimit-remaining-requests (if provided)                             │
│                                                                             │
│  Synchronization:                                                           │
│  • Update local limits from response headers                                │
│  • Respect Retry-After header on 429                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Security Requirements

### 8.1 Authentication

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUTHENTICATION                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  API Key Authentication:                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Methods (in order of preference):                                   │    │
│  │ 1. Header: x-goog-api-key: {api_key}                                │    │
│  │ 2. Query Parameter: ?key={api_key}                                  │    │
│  │                                                                     │    │
│  │ API Key Storage:                                                    │    │
│  │ • Store in SecretString (zeroize on drop)                           │    │
│  │ • Never log or display                                              │    │
│  │ • Load from environment variable (GOOGLE_API_KEY or GEMINI_API_KEY) │    │
│  │ • Accept as explicit parameter                                      │    │
│  │                                                                     │    │
│  │ Loading Priority:                                                   │    │
│  │ 1. Explicit parameter                                               │    │
│  │ 2. GEMINI_API_KEY environment variable                              │    │
│  │ 3. GOOGLE_API_KEY environment variable                              │    │
│  │ 4. Configuration file (optional, not recommended for production)    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Transport Security

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TRANSPORT SECURITY                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TLS Requirements:                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Minimum TLS version: 1.2                                          │    │
│  │ • Preferred TLS version: 1.3                                        │    │
│  │ • Certificate verification: Always enabled                          │    │
│  │ • No option to disable certificate verification                     │    │
│  │ • Use system CA store or webpki-roots                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  HTTP Security:                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • HTTPS only (no HTTP fallback)                                     │    │
│  │ • HTTP/2 preferred for multiplexing                                 │    │
│  │ • Connection pooling with keep-alive                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Input Validation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INPUT VALIDATION                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Request Validation:                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Model: Non-empty, valid model identifier                          │    │
│  │ • Contents: Non-empty array                                         │    │
│  │ • Parts: At least one part per content                              │    │
│  │ • Temperature: 0.0 ≤ t ≤ 2.0 (if provided)                          │    │
│  │ • Top_p: 0.0 < p ≤ 1.0 (if provided)                                │    │
│  │ • Max_output_tokens: > 0 (if provided)                              │    │
│  │ • Safety settings: Valid category and threshold                     │    │
│  │ • Base64 data: Valid base64 encoding                                │    │
│  │ • MIME types: Valid and supported                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Response Validation:                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Verify expected response structure                                │    │
│  │ • Handle missing optional fields gracefully                         │    │
│  │ • Validate enum values                                              │    │
│  │ • Check for malformed JSON                                          │    │
│  │ • Handle streaming chunk boundaries correctly                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Observability Requirements

### 9.1 Tracing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            TRACING                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Span Naming Convention:                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ gemini.client.<operation>                                           │    │
│  │                                                                     │    │
│  │ Examples:                                                           │    │
│  │ • gemini.client.content.generate                                    │    │
│  │ • gemini.client.content.generate_stream                             │    │
│  │ • gemini.client.content.count_tokens                                │    │
│  │ • gemini.client.embeddings.embed                                    │    │
│  │ • gemini.client.embeddings.batch_embed                              │    │
│  │ • gemini.client.models.list                                         │    │
│  │ • gemini.client.files.upload                                        │    │
│  │ • gemini.client.cached_content.create                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Required Span Attributes:                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • gemini.model                      // Model used                   │    │
│  │ • gemini.operation                  // Operation name               │    │
│  │ • gemini.request_id                 // Client request ID            │    │
│  │ • http.method                       // HTTP method                  │    │
│  │ • http.url                          // Request URL (key redacted)   │    │
│  │ • http.status_code                  // Response status              │    │
│  │ • http.request_content_length       // Request size                 │    │
│  │ • http.response_content_length      // Response size                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Final Span Attributes (after response):                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • gemini.prompt_tokens              // Input token count            │    │
│  │ • gemini.completion_tokens          // Output token count           │    │
│  │ • gemini.total_tokens               // Total token count            │    │
│  │ • gemini.finish_reason              // Completion finish reason     │    │
│  │ • gemini.cached_tokens              // Cached content tokens        │    │
│  │ • gemini.candidate_count            // Number of candidates         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Metrics

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             METRICS                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Counters:                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ gemini_requests_total                                               │    │
│  │   labels: { service, method, status, model }                        │    │
│  │                                                                     │    │
│  │ gemini_tokens_total                                                 │    │
│  │   labels: { service, direction (prompt/completion), model }         │    │
│  │                                                                     │    │
│  │ gemini_errors_total                                                 │    │
│  │   labels: { service, error_type, retryable }                        │    │
│  │                                                                     │    │
│  │ gemini_retries_total                                                │    │
│  │   labels: { service, attempt_number }                               │    │
│  │                                                                     │    │
│  │ gemini_safety_blocks_total                                          │    │
│  │   labels: { category, probability }                                 │    │
│  │                                                                     │    │
│  │ gemini_cache_hits_total                                             │    │
│  │   labels: { model }                                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Histograms:                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ gemini_request_duration_seconds                                     │    │
│  │   labels: { service, method, status }                               │    │
│  │   buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120]             │    │
│  │                                                                     │    │
│  │ gemini_time_to_first_token_seconds                                  │    │
│  │   labels: { model }                                                 │    │
│  │   buckets: [0.1, 0.25, 0.5, 1, 2, 5]                                │    │
│  │                                                                     │    │
│  │ gemini_embedding_dimensions                                         │    │
│  │   labels: { model }                                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Gauges:                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ gemini_rate_limit_remaining                                         │    │
│  │   labels: { limit_type (requests/tokens) }                          │    │
│  │                                                                     │    │
│  │ gemini_circuit_breaker_state                                        │    │
│  │   labels: { service }                                               │    │
│  │   values: 0=closed, 1=half-open, 2=open                             │    │
│  │                                                                     │    │
│  │ gemini_active_streams                                               │    │
│  │   labels: { }                                                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Logging

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             LOGGING                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Log Levels:                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ ERROR: Request failures, authentication errors, circuit breaker     │    │
│  │ WARN:  Rate limit warnings, retries, safety blocks, deprecations    │    │
│  │ INFO:  Request start/completion, stream start/end                   │    │
│  │ DEBUG: Request/response details (redacted), retry attempts          │    │
│  │ TRACE: Full request/response bodies (development only), chunks      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Redaction Rules:                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • API keys: Never logged (SecretString)                             │    │
│  │ • x-goog-api-key header: Redacted                                   │    │
│  │ • ?key= query parameter: Redacted                                   │    │
│  │ • Content text: Truncated at configurable length                    │    │
│  │ • Base64 data: Not logged (show size only)                          │    │
│  │ • File contents: Not logged                                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Structured Fields:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • request_id: Client-generated request ID                           │    │
│  │ • trace_id: Distributed trace ID                                    │    │
│  │ • model: Model identifier                                           │    │
│  │ • operation: Operation name                                         │    │
│  │ • duration_ms: Request duration                                     │    │
│  │ • status_code: HTTP status code                                     │    │
│  │ • error_type: Error classification                                  │    │
│  │ • finish_reason: Generation finish reason                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Performance Requirements

### 10.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| Request serialization | < 1ms | < 5ms |
| Response deserialization | < 5ms | < 20ms |
| Streaming chunk parsing | < 0.5ms | < 2ms |
| Token counting | < 100ms | < 500ms |
| Embedding generation | < 500ms | < 2s |

### 10.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Concurrent requests | 100+ (configurable) |
| Streaming throughput | Line-rate with API |
| Batch embeddings | 100 texts per request |
| File upload | 2GB max file size |

### 10.3 Resource Limits

| Resource | Limit |
|----------|-------|
| Memory per request | < 1MB typical |
| Memory per stream | < 100KB + content |
| Connection pool size | Configurable (default: 20) |
| Request body size | Match API limits |
| Response buffer | 100MB max |

---

## 11. Testing Requirements

### 11.1 Test Categories

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TEST CATEGORIES                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Unit Tests (London-School TDD):                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Test each component in isolation                                  │    │
│  │ • Mock all external dependencies (HttpTransport)                    │    │
│  │ • Verify behavior through mock interactions                         │    │
│  │ • Coverage target: 80%+ line coverage                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Integration Tests:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Test component interactions                                       │    │
│  │ • Use mock HTTP server (wiremock, nock)                             │    │
│  │ • Verify request/response serialization                             │    │
│  │ • Test resilience patterns end-to-end                               │    │
│  │ • Test streaming response parsing                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Contract Tests:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Verify API contract compliance                                    │    │
│  │ • Test against recorded API responses                               │    │
│  │ • Detect breaking changes                                           │    │
│  │ • Validate all content types                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  E2E Tests (Optional):                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Test against real Gemini API                                      │    │
│  │ • Requires GEMINI_API_KEY                                           │    │
│  │ • Run manually or on release                                        │    │
│  │ • Test all content modalities                                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Mock Interfaces

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MOCK INTERFACES                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Required Mocks:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ MockHttpTransport      - HTTP client mock                           │    │
│  │ MockAuthProvider       - Authentication mock                        │    │
│  │ MockCircuitBreaker     - Circuit breaker mock                       │    │
│  │ MockRateLimiter        - Rate limiter mock                          │    │
│  │ MockRetryExecutor      - Retry logic mock                           │    │
│  │ MockLogger             - Logging mock                               │    │
│  │ MockClock              - Time/clock mock                            │    │
│  │ MockStreamParser       - Streaming response parser mock             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Mock Capabilities:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Configure expected method calls                                   │    │
│  │ • Return predefined responses                                       │    │
│  │ • Simulate errors and edge cases                                    │    │
│  │ • Verify call counts and arguments                                  │    │
│  │ • Support async operations                                          │    │
│  │ • Record call history                                               │    │
│  │ • Simulate streaming chunks                                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Configuration

### 12.1 Client Configuration

```rust
/// Configuration for the Gemini client.
#[derive(Clone)]
pub struct GeminiConfig {
    /// API key (required).
    pub api_key: SecretString,

    /// Base URL for the API.
    pub base_url: Url,  // Default: https://generativelanguage.googleapis.com

    /// API version.
    pub api_version: String,  // Default: "v1beta"

    /// Default timeout for requests.
    pub timeout: Duration,  // Default: 120s

    /// Connect timeout.
    pub connect_timeout: Duration,  // Default: 30s

    /// Maximum retries for transient failures.
    pub max_retries: u32,  // Default: 3

    /// Retry configuration.
    pub retry_config: RetryConfig,

    /// Circuit breaker configuration.
    pub circuit_breaker_config: CircuitBreakerConfig,

    /// Rate limit configuration.
    pub rate_limit_config: Option<RateLimitConfig>,

    /// HTTP settings.
    pub http2_only: bool,  // Default: false
    pub pool_max_idle_per_host: usize,  // Default: 10
    pub pool_idle_timeout: Duration,  // Default: 90s

    /// Observability settings.
    pub enable_tracing: bool,  // Default: true
    pub enable_metrics: bool,  // Default: true
    pub log_level: LogLevel,  // Default: Info

    /// Authentication method.
    pub auth_method: AuthMethod,  // Default: Header
}

/// Authentication method for API key.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AuthMethod {
    /// Use x-goog-api-key header (recommended).
    Header,
    /// Use ?key= query parameter.
    QueryParam,
}
```

### 12.2 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Primary API key source | Yes (if not provided explicitly) |
| `GOOGLE_API_KEY` | Fallback API key source | No |
| `GEMINI_BASE_URL` | Override base URL | No |
| `GEMINI_TIMEOUT_SECS` | Request timeout in seconds | No |
| `GEMINI_MAX_RETRIES` | Maximum retry attempts | No |
| `GEMINI_LOG_LEVEL` | Logging level | No |
| `GEMINI_API_VERSION` | API version (v1, v1beta) | No |

---

## 13. Acceptance Criteria

### 13.1 Functional Acceptance Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| AC-001 | Client can authenticate with API key (header) | Unit + E2E test |
| AC-002 | Client can authenticate with API key (query param) | Unit + E2E test |
| AC-003 | Generate content returns valid responses | Integration test |
| AC-004 | Streaming delivers incremental chunks | Integration test |
| AC-005 | Multi-modal input (text + images) works | Integration test |
| AC-006 | Function/tool calling works end-to-end | Integration test |
| AC-007 | Code execution tool works | Integration test |
| AC-008 | Google Search grounding works | Integration test |
| AC-009 | Embeddings return correct dimensions | Integration test |
| AC-010 | Batch embeddings work | Integration test |
| AC-011 | Token counting returns accurate counts | Integration test |
| AC-012 | File upload/download works | Integration test |
| AC-013 | Cached content lifecycle works | Integration test |
| AC-014 | Safety settings are respected | Integration test |
| AC-015 | JSON mode with schema works | Integration test |

### 13.2 Non-Functional Acceptance Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| AC-016 | Retry handles transient failures | Unit test |
| AC-017 | Circuit breaker prevents cascade failures | Unit test |
| AC-018 | Rate limiter respects limits | Unit test |
| AC-019 | API key never appears in logs | Unit test |
| AC-020 | TLS 1.2+ is enforced | Configuration test |
| AC-021 | Test coverage ≥ 80% | CI gate |
| AC-022 | All public APIs documented | Doc generation |
| AC-023 | Response time < 100μs for serialization | Benchmark |
| AC-024 | Streaming handles interruptions gracefully | Unit test |
| AC-025 | Content blocks parsed correctly | Unit test |

### 13.3 Definition of Done

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DEFINITION OF DONE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Code Complete:                                                             │
│  ☐ All functional requirements implemented                                  │
│  ☐ All non-functional requirements met                                      │
│  ☐ Code follows project standards                                           │
│  ☐ No compiler warnings                                                     │
│  ☐ Clippy/ESLint passes                                                     │
│                                                                             │
│  Testing Complete:                                                          │
│  ☐ Unit tests pass                                                          │
│  ☐ Integration tests pass                                                   │
│  ☐ Coverage ≥ 80%                                                           │
│  ☐ No flaky tests                                                           │
│  ☐ Streaming tests pass                                                     │
│  ☐ Multi-modal tests pass                                                   │
│                                                                             │
│  Documentation Complete:                                                    │
│  ☐ API documentation generated                                              │
│  ☐ README with usage examples                                               │
│  ☐ CHANGELOG updated                                                        │
│  ☐ Examples for all content types                                           │
│                                                                             │
│  Security Complete:                                                         │
│  ☐ Security audit passed                                                    │
│  ☐ No credential exposure                                                   │
│  ☐ TLS properly configured                                                  │
│                                                                             │
│  Release Ready:                                                             │
│  ☐ CI pipeline passes                                                       │
│  ☐ Version bumped appropriately                                             │
│  ☐ Release notes written                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Document Navigation

| Previous | Current | Next |
|----------|---------|------|
| - | Specification | [Pseudocode](./pseudocode-gemini-1.md) |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial specification |

---

**SPARC Specification Phase: COMPLETE**

*Awaiting "Next phase." to begin Pseudocode phase.*
