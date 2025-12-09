# SPARC Specification: Mistral Integration Module

**Specification Phase Document**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/mistral`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Module Requirements](#2-module-requirements)
3. [Dependency Constraints](#3-dependency-constraints)
4. [API Coverage](#4-api-coverage)
5. [Data Types](#5-data-types)
6. [Error Taxonomy](#6-error-taxonomy)
7. [Resilience Hooks](#7-resilience-hooks)
8. [Security Requirements](#8-security-requirements)
9. [Observability Requirements](#9-observability-requirements)
10. [Testing Requirements](#10-testing-requirements)
11. [Configuration](#11-configuration)
12. [Acceptance Criteria](#12-acceptance-criteria)

---

## 1. Overview

### 1.1 Purpose

This specification defines the requirements for the Mistral Integration Module (`integrations-mistral`), a production-ready client library for interacting with Mistral AI's API services. The module provides type-safe access to Mistral's chat completions, embeddings, models, files, fine-tuning, agents, and batch processing capabilities.

### 1.2 Scope

The module covers:
- Chat completions API (sync and streaming)
- Function calling / Tool use
- Embeddings API
- Models API (list, get, delete, update)
- Files API (upload, list, retrieve, delete)
- Fine-tuning jobs API
- Agents API (agents, agent completions)
- Batch processing API
- Fill-in-the-middle (FIM) completions
- JSON mode and structured outputs

### 1.3 Target Platforms

| Platform | Language | Runtime |
|----------|----------|---------|
| Primary | Rust | Tokio async runtime |
| Secondary | TypeScript | Node.js 18+ |

### 1.4 API Version

| Attribute | Value |
|-----------|-------|
| Base URL | `https://api.mistral.ai` |
| API Version | v1 |
| Auth Header | `Authorization: Bearer {api_key}` |
| Content-Type | `application/json` |

---

## 2. Module Requirements

### 2.1 Functional Requirements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FUNCTIONAL REQUIREMENTS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  FR-001: Chat Completions                                                   │
│  ├── FR-001.1: Synchronous chat completion requests                         │
│  ├── FR-001.2: Streaming chat completion with SSE                           │
│  ├── FR-001.3: Multi-turn conversation support                              │
│  ├── FR-001.4: System message support                                       │
│  ├── FR-001.5: Function/tool calling                                        │
│  ├── FR-001.6: JSON mode responses                                          │
│  ├── FR-001.7: Response format (json_object, json_schema)                   │
│  └── FR-001.8: Safe prompt mode                                             │
│                                                                             │
│  FR-002: FIM Completions (Fill-in-the-Middle)                               │
│  ├── FR-002.1: Code completion with prefix/suffix                           │
│  ├── FR-002.2: Streaming FIM responses                                      │
│  └── FR-002.3: Stop tokens support                                          │
│                                                                             │
│  FR-003: Embeddings                                                         │
│  ├── FR-003.1: Text embedding generation                                    │
│  ├── FR-003.2: Batch embedding requests                                     │
│  └── FR-003.3: Encoding format selection (float, base64)                    │
│                                                                             │
│  FR-004: Models                                                             │
│  ├── FR-004.1: List available models                                        │
│  ├── FR-004.2: Retrieve model details                                       │
│  ├── FR-004.3: Delete fine-tuned model                                      │
│  └── FR-004.4: Update fine-tuned model                                      │
│                                                                             │
│  FR-005: Files                                                              │
│  ├── FR-005.1: Upload file (for fine-tuning)                                │
│  ├── FR-005.2: List uploaded files                                          │
│  ├── FR-005.3: Retrieve file details                                        │
│  ├── FR-005.4: Delete file                                                  │
│  └── FR-005.5: Download file content                                        │
│                                                                             │
│  FR-006: Fine-Tuning Jobs                                                   │
│  ├── FR-006.1: Create fine-tuning job                                       │
│  ├── FR-006.2: List fine-tuning jobs                                        │
│  ├── FR-006.3: Retrieve job details                                         │
│  ├── FR-006.4: Cancel fine-tuning job                                       │
│  └── FR-006.5: Start fine-tuning job                                        │
│                                                                             │
│  FR-007: Agents                                                             │
│  ├── FR-007.1: Create agent                                                 │
│  ├── FR-007.2: List agents                                                  │
│  ├── FR-007.3: Retrieve agent details                                       │
│  ├── FR-007.4: Update agent                                                 │
│  ├── FR-007.5: Delete agent                                                 │
│  └── FR-007.6: Agent completions (sync and streaming)                       │
│                                                                             │
│  FR-008: Batch Processing                                                   │
│  ├── FR-008.1: Create batch job                                             │
│  ├── FR-008.2: List batch jobs                                              │
│  ├── FR-008.3: Retrieve batch job status                                    │
│  ├── FR-008.4: Cancel batch job                                             │
│  └── FR-008.5: Get batch job results                                        │
│                                                                             │
│  FR-009: Classifiers                                                        │
│  ├── FR-009.1: Moderate content                                             │
│  └── FR-009.2: Classify text                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Non-Functional Requirements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     NON-FUNCTIONAL REQUIREMENTS                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  NFR-001: Performance                                                       │
│  ├── Request serialization: < 100 μs for typical requests                   │
│  ├── Response parsing: < 200 μs for typical responses                       │
│  ├── Memory per request: < 100 KB overhead                                  │
│  └── Concurrent requests: Support 1000+ simultaneous                        │
│                                                                             │
│  NFR-002: Reliability                                                       │
│  ├── Automatic retry with exponential backoff                               │
│  ├── Circuit breaker for failure isolation                                  │
│  ├── Client-side rate limiting                                              │
│  └── Graceful degradation under load                                        │
│                                                                             │
│  NFR-003: Security                                                          │
│  ├── TLS 1.2+ for all connections                                           │
│  ├── API key protection (SecretString)                                      │
│  ├── No credential logging                                                  │
│  └── Input validation at boundaries                                         │
│                                                                             │
│  NFR-004: Observability                                                     │
│  ├── Distributed tracing (OpenTelemetry compatible)                         │
│  ├── Metrics collection (request count, latency, errors)                    │
│  ├── Structured logging with redaction                                      │
│  └── Request/response correlation IDs                                       │
│                                                                             │
│  NFR-005: Maintainability                                                   │
│  ├── 80%+ test coverage                                                     │
│  ├── London-School TDD with mocks                                           │
│  ├── Comprehensive API documentation                                        │
│  └── Semantic versioning                                                    │
│                                                                             │
│  NFR-006: Compatibility                                                     │
│  ├── Rust MSRV: 1.75.0                                                      │
│  ├── Node.js: 18+                                                           │
│  └── No breaking changes to public API without major version bump           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Dependency Constraints

### 3.1 Allowed Dependencies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ALLOWED DEPENDENCIES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Integration Repo Primitives (REQUIRED):                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ integrations-errors        Base error types and traits              │    │
│  │ integrations-retry         Retry executor with backoff strategies   │    │
│  │ integrations-circuit-breaker  Circuit breaker state machine         │    │
│  │ integrations-rate-limit    Rate limiting (token bucket, sliding)    │    │
│  │ integrations-tracing       Distributed tracing abstraction          │    │
│  │ integrations-logging       Structured logging abstraction           │    │
│  │ integrations-types         Shared type definitions (SecretString)   │    │
│  │ integrations-config        Configuration management                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  External Crates (Rust):                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ tokio          Async runtime                                        │    │
│  │ reqwest        HTTP client                                          │    │
│  │ serde          Serialization framework                              │    │
│  │ serde_json     JSON serialization                                   │    │
│  │ thiserror      Error derive macros                                  │    │
│  │ tracing        Instrumentation                                      │    │
│  │ futures        Async utilities                                      │    │
│  │ bytes          Byte buffer utilities                                │    │
│  │ url            URL parsing                                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  External Packages (TypeScript):                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ typescript     Language                                             │    │
│  │ undici         HTTP client                                          │    │
│  │ zod            Runtime validation                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Forbidden Dependencies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FORBIDDEN DEPENDENCIES                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ╳ ruvbase                    Layer 0 - not allowed in integrations         │
│  ╳ integrations-openai        No cross-module dependencies                  │
│  ╳ integrations-anthropic     No cross-module dependencies                  │
│  ╳ integrations-google        No cross-module dependencies                  │
│  ╳ integrations-*             Any other provider module                     │
│                                                                             │
│  Rationale:                                                                 │
│  • Each integration module must be independently usable                     │
│  • No coupling between provider implementations                             │
│  • Shared functionality goes in primitives only                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. API Coverage

### 4.1 Chat Completions API

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CHAT COMPLETIONS API                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Endpoint: POST /v1/chat/completions                                        │
│                                                                             │
│  Request Schema:                                                            │
│  {                                                                          │
│      "model": "mistral-large-latest",           // Required                 │
│      "messages": [                              // Required                 │
│          {                                                                  │
│              "role": "system" | "user" | "assistant" | "tool",              │
│              "content": "string" | ContentPart[],                           │
│              "name": "string",                  // Optional                 │
│              "tool_calls": ToolCall[],          // For assistant            │
│              "tool_call_id": "string"           // For tool responses       │
│          }                                                                  │
│      ],                                                                     │
│      "temperature": 0.0-1.5,                    // Default: 0.7             │
│      "top_p": 0.0-1.0,                          // Default: 1.0             │
│      "max_tokens": integer,                     // Optional                 │
│      "min_tokens": integer,                     // Optional                 │
│      "stream": boolean,                         // Default: false           │
│      "stop": string | string[],                 // Optional                 │
│      "random_seed": integer,                    // Optional                 │
│      "tools": Tool[],                           // Optional                 │
│      "tool_choice": "auto" | "any" | "none" | ToolChoice,                   │
│      "response_format": {                       // Optional                 │
│          "type": "text" | "json_object" | "json_schema",                    │
│          "json_schema": JsonSchema              // For json_schema type     │
│      },                                                                     │
│      "safe_prompt": boolean,                    // Default: false           │
│      "presence_penalty": 0.0-2.0,               // Optional                 │
│      "frequency_penalty": 0.0-2.0               // Optional                 │
│  }                                                                          │
│                                                                             │
│  Response Schema (non-streaming):                                           │
│  {                                                                          │
│      "id": "string",                                                        │
│      "object": "chat.completion",                                           │
│      "created": integer,                        // Unix timestamp           │
│      "model": "string",                                                     │
│      "choices": [                                                           │
│          {                                                                  │
│              "index": integer,                                              │
│              "message": {                                                   │
│                  "role": "assistant",                                       │
│                  "content": "string" | null,                                │
│                  "tool_calls": ToolCall[]                                   │
│              },                                                             │
│              "finish_reason": "stop" | "length" | "tool_calls" | "error"    │
│          }                                                                  │
│      ],                                                                     │
│      "usage": {                                                             │
│          "prompt_tokens": integer,                                          │
│          "completion_tokens": integer,                                      │
│          "total_tokens": integer                                            │
│      }                                                                      │
│  }                                                                          │
│                                                                             │
│  Streaming Response (SSE):                                                  │
│  data: {"id":"...","choices":[{"delta":{"content":"..."}}],...}             │
│  data: [DONE]                                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 FIM Completions API

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FIM COMPLETIONS API                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Endpoint: POST /v1/fim/completions                                         │
│                                                                             │
│  Request Schema:                                                            │
│  {                                                                          │
│      "model": "codestral-latest",               // Required                 │
│      "prompt": "string",                        // Required (prefix)        │
│      "suffix": "string",                        // Optional                 │
│      "temperature": 0.0-1.5,                    // Default: 0.7             │
│      "top_p": 0.0-1.0,                          // Default: 1.0             │
│      "max_tokens": integer,                     // Optional                 │
│      "min_tokens": integer,                     // Optional                 │
│      "stream": boolean,                         // Default: false           │
│      "stop": string | string[],                 // Optional                 │
│      "random_seed": integer                     // Optional                 │
│  }                                                                          │
│                                                                             │
│  Response Schema:                                                           │
│  {                                                                          │
│      "id": "string",                                                        │
│      "object": "fim.completion",                                            │
│      "created": integer,                                                    │
│      "model": "string",                                                     │
│      "choices": [                                                           │
│          {                                                                  │
│              "index": integer,                                              │
│              "message": {                                                   │
│                  "role": "assistant",                                       │
│                  "content": "string"                                        │
│              },                                                             │
│              "finish_reason": "stop" | "length"                             │
│          }                                                                  │
│      ],                                                                     │
│      "usage": {                                                             │
│          "prompt_tokens": integer,                                          │
│          "completion_tokens": integer,                                      │
│          "total_tokens": integer                                            │
│      }                                                                      │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Embeddings API

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EMBEDDINGS API                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Endpoint: POST /v1/embeddings                                              │
│                                                                             │
│  Request Schema:                                                            │
│  {                                                                          │
│      "model": "mistral-embed",                  // Required                 │
│      "input": "string" | string[],              // Required                 │
│      "encoding_format": "float" | "base64"      // Default: "float"         │
│  }                                                                          │
│                                                                             │
│  Response Schema:                                                           │
│  {                                                                          │
│      "id": "string",                                                        │
│      "object": "list",                                                      │
│      "data": [                                                              │
│          {                                                                  │
│              "object": "embedding",                                         │
│              "embedding": number[] | string,    // float array or base64    │
│              "index": integer                                               │
│          }                                                                  │
│      ],                                                                     │
│      "model": "string",                                                     │
│      "usage": {                                                             │
│          "prompt_tokens": integer,                                          │
│          "total_tokens": integer                                            │
│      }                                                                      │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Models API

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            MODELS API                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  List Models                                                                │
│  Endpoint: GET /v1/models                                                   │
│                                                                             │
│  Response Schema:                                                           │
│  {                                                                          │
│      "object": "list",                                                      │
│      "data": [                                                              │
│          {                                                                  │
│              "id": "string",                                                │
│              "object": "model",                                             │
│              "created": integer,                                            │
│              "owned_by": "string",                                          │
│              "capabilities": {                                              │
│                  "completion_chat": boolean,                                │
│                  "completion_fim": boolean,                                 │
│                  "function_calling": boolean,                               │
│                  "fine_tuning": boolean,                                    │
│                  "vision": boolean                                          │
│              },                                                             │
│              "name": "string",                                              │
│              "description": "string",                                       │
│              "max_context_length": integer,                                 │
│              "aliases": string[],                                           │
│              "deprecation": "string" | null,                                │
│              "default_model_temperature": number,                           │
│              "type": "base" | "fine-tuned"                                  │
│          }                                                                  │
│      ]                                                                      │
│  }                                                                          │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Retrieve Model                                                             │
│  Endpoint: GET /v1/models/{model_id}                                        │
│                                                                             │
│  Response: Same as single model object above                                │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Delete Model (fine-tuned only)                                             │
│  Endpoint: DELETE /v1/models/{model_id}                                     │
│                                                                             │
│  Response Schema:                                                           │
│  {                                                                          │
│      "id": "string",                                                        │
│      "object": "model",                                                     │
│      "deleted": true                                                        │
│  }                                                                          │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Update Model (fine-tuned only)                                             │
│  Endpoint: PATCH /v1/models/{model_id}                                      │
│                                                                             │
│  Request Schema:                                                            │
│  {                                                                          │
│      "name": "string",                          // Optional                 │
│      "description": "string"                    // Optional                 │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.5 Files API

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             FILES API                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Upload File                                                                │
│  Endpoint: POST /v1/files                                                   │
│  Content-Type: multipart/form-data                                          │
│                                                                             │
│  Request Form Data:                                                         │
│  {                                                                          │
│      "file": <binary>,                          // Required                 │
│      "purpose": "fine-tune" | "batch"           // Required                 │
│  }                                                                          │
│                                                                             │
│  Response Schema:                                                           │
│  {                                                                          │
│      "id": "string",                                                        │
│      "object": "file",                                                      │
│      "bytes": integer,                                                      │
│      "created_at": integer,                                                 │
│      "filename": "string",                                                  │
│      "purpose": "fine-tune" | "batch",                                      │
│      "sample_type": "pretrain" | "instruct" | null,                         │
│      "num_lines": integer | null,                                           │
│      "source": "upload" | "repository"                                      │
│  }                                                                          │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  List Files                                                                 │
│  Endpoint: GET /v1/files                                                    │
│  Query Params: ?purpose=fine-tune&page=1&page_size=100                      │
│                                                                             │
│  Response Schema:                                                           │
│  {                                                                          │
│      "data": File[],                                                        │
│      "object": "list",                                                      │
│      "total": integer                                                       │
│  }                                                                          │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Retrieve File                                                              │
│  Endpoint: GET /v1/files/{file_id}                                          │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Delete File                                                                │
│  Endpoint: DELETE /v1/files/{file_id}                                       │
│                                                                             │
│  Response Schema:                                                           │
│  {                                                                          │
│      "id": "string",                                                        │
│      "object": "file",                                                      │
│      "deleted": true                                                        │
│  }                                                                          │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Download File                                                              │
│  Endpoint: GET /v1/files/{file_id}/content                                  │
│                                                                             │
│  Response: Raw file bytes                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.6 Fine-Tuning Jobs API

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FINE-TUNING JOBS API                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Create Fine-Tuning Job                                                     │
│  Endpoint: POST /v1/fine_tuning/jobs                                        │
│                                                                             │
│  Request Schema:                                                            │
│  {                                                                          │
│      "model": "string",                         // Required (base model)    │
│      "training_files": string[],                // Required (file IDs)      │
│      "validation_files": string[],              // Optional                 │
│      "hyperparameters": {                       // Optional                 │
│          "learning_rate": number,                                           │
│          "training_steps": integer,                                         │
│          "weight_decay": number,                                            │
│          "warmup_fraction": number,                                         │
│          "epochs": number,                                                  │
│          "fim_ratio": number,                                               │
│          "seq_len": integer                                                 │
│      },                                                                     │
│      "suffix": "string",                        // Optional (model suffix)  │
│      "integrations": Integration[],             // Optional (wandb, etc.)   │
│      "repositories": Repository[],              // Optional                 │
│      "auto_start": boolean                      // Default: true            │
│  }                                                                          │
│                                                                             │
│  Response Schema:                                                           │
│  {                                                                          │
│      "id": "string",                                                        │
│      "object": "fine_tuning.job",                                           │
│      "model": "string",                                                     │
│      "created_at": integer,                                                 │
│      "modified_at": integer,                                                │
│      "finished_at": integer | null,                                         │
│      "status": "QUEUED" | "STARTED" | "VALIDATING" | "VALIDATED" |          │
│               "RUNNING" | "FAILED_VALIDATION" | "FAILED" |                  │
│               "SUCCESS" | "CANCELLED" | "CANCELLATION_REQUESTED",           │
│      "fine_tuned_model": "string" | null,                                   │
│      "training_files": string[],                                            │
│      "validation_files": string[],                                          │
│      "hyperparameters": Hyperparameters,                                    │
│      "suffix": "string" | null,                                             │
│      "integrations": Integration[],                                         │
│      "trained_tokens": integer | null,                                      │
│      "metadata": object                                                     │
│  }                                                                          │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  List Fine-Tuning Jobs                                                      │
│  Endpoint: GET /v1/fine_tuning/jobs                                         │
│  Query Params: ?page=1&page_size=100&model=...&status=...                   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Retrieve Fine-Tuning Job                                                   │
│  Endpoint: GET /v1/fine_tuning/jobs/{job_id}                                │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Cancel Fine-Tuning Job                                                     │
│  Endpoint: POST /v1/fine_tuning/jobs/{job_id}/cancel                        │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Start Fine-Tuning Job                                                      │
│  Endpoint: POST /v1/fine_tuning/jobs/{job_id}/start                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.7 Agents API

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            AGENTS API                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Create Agent                                                               │
│  Endpoint: POST /v1/agents                                                  │
│                                                                             │
│  Request Schema:                                                            │
│  {                                                                          │
│      "model": "string",                         // Required                 │
│      "name": "string",                          // Optional                 │
│      "description": "string",                   // Optional                 │
│      "instructions": "string",                  // Optional (system prompt) │
│      "tools": Tool[],                           // Optional                 │
│      "completion_args": {                       // Optional                 │
│          "temperature": number,                                             │
│          "top_p": number,                                                   │
│          "max_tokens": integer,                                             │
│          "stop": string[]                                                   │
│      }                                                                      │
│  }                                                                          │
│                                                                             │
│  Response Schema:                                                           │
│  {                                                                          │
│      "id": "string",                                                        │
│      "object": "agent",                                                     │
│      "name": "string",                                                      │
│      "description": "string",                                               │
│      "model": "string",                                                     │
│      "instructions": "string",                                              │
│      "tools": Tool[],                                                       │
│      "completion_args": CompletionArgs,                                     │
│      "created_at": integer,                                                 │
│      "updated_at": integer                                                  │
│  }                                                                          │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  List Agents                                                                │
│  Endpoint: GET /v1/agents                                                   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Get Agent                                                                  │
│  Endpoint: GET /v1/agents/{agent_id}                                        │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Update Agent                                                               │
│  Endpoint: PATCH /v1/agents/{agent_id}                                      │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Delete Agent                                                               │
│  Endpoint: DELETE /v1/agents/{agent_id}                                     │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Agent Completions                                                          │
│  Endpoint: POST /v1/agents/{agent_id}/completions                           │
│                                                                             │
│  Request Schema:                                                            │
│  {                                                                          │
│      "messages": Message[],                     // Required                 │
│      "stream": boolean,                         // Default: false           │
│      "max_tokens": integer,                     // Optional (override)      │
│      "stop": string[]                           // Optional (override)      │
│  }                                                                          │
│                                                                             │
│  Response: Same as chat completions                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.8 Batch Jobs API

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          BATCH JOBS API                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Create Batch Job                                                           │
│  Endpoint: POST /v1/batch/jobs                                              │
│                                                                             │
│  Request Schema:                                                            │
│  {                                                                          │
│      "input_files": string[],                   // Required (file IDs)      │
│      "endpoint": "/v1/chat/completions" |                                   │
│                  "/v1/embeddings" |                                         │
│                  "/v1/fim/completions" |                                    │
│                  "/v1/moderations",                                         │
│      "model": "string",                         // Required                 │
│      "metadata": object,                        // Optional                 │
│      "timeout_hours": integer,                  // Default: 24              │
│      "webhook_url": "string"                    // Optional                 │
│  }                                                                          │
│                                                                             │
│  Response Schema:                                                           │
│  {                                                                          │
│      "id": "string",                                                        │
│      "object": "batch",                                                     │
│      "input_files": string[],                                               │
│      "endpoint": "string",                                                  │
│      "model": "string",                                                     │
│      "output_file": "string" | null,                                        │
│      "error_file": "string" | null,                                         │
│      "status": "QUEUED" | "RUNNING" | "SUCCESS" |                           │
│               "FAILED" | "TIMEOUT_EXCEEDED" |                               │
│               "CANCELLATION_REQUESTED" | "CANCELLED",                       │
│      "created_at": integer,                                                 │
│      "started_at": integer | null,                                          │
│      "completed_at": integer | null,                                        │
│      "total_requests": integer,                                             │
│      "completed_requests": integer,                                         │
│      "succeeded_requests": integer,                                         │
│      "failed_requests": integer,                                            │
│      "metadata": object                                                     │
│  }                                                                          │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  List Batch Jobs                                                            │
│  Endpoint: GET /v1/batch/jobs                                               │
│  Query Params: ?page=1&page_size=100&status=...&model=...                   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Get Batch Job                                                              │
│  Endpoint: GET /v1/batch/jobs/{job_id}                                      │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Cancel Batch Job                                                           │
│  Endpoint: POST /v1/batch/jobs/{job_id}/cancel                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.9 Classifiers API

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLASSIFIERS API                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Moderate Content                                                           │
│  Endpoint: POST /v1/moderations                                             │
│                                                                             │
│  Request Schema:                                                            │
│  {                                                                          │
│      "model": "mistral-moderation-latest",      // Optional                 │
│      "input": "string" | string[]               // Required                 │
│  }                                                                          │
│                                                                             │
│  Response Schema:                                                           │
│  {                                                                          │
│      "id": "string",                                                        │
│      "model": "string",                                                     │
│      "results": [                                                           │
│          {                                                                  │
│              "categories": {                                                │
│                  "sexual": boolean,                                         │
│                  "hate_and_discrimination": boolean,                        │
│                  "violence_and_threats": boolean,                           │
│                  "dangerous_and_criminal_content": boolean,                 │
│                  "selfharm": boolean,                                       │
│                  "health": boolean,                                         │
│                  "financial": boolean,                                      │
│                  "law": boolean,                                            │
│                  "pii": boolean                                             │
│              },                                                             │
│              "category_scores": {                                           │
│                  "sexual": number,                                          │
│                  "hate_and_discrimination": number,                         │
│                  ... // Same keys as categories                             │
│              }                                                              │
│          }                                                                  │
│      ]                                                                      │
│  }                                                                          │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Classify Text                                                              │
│  Endpoint: POST /v1/classifiers                                             │
│                                                                             │
│  Request Schema:                                                            │
│  {                                                                          │
│      "model": "string",                         // Required                 │
│      "input": "string" | string[]               // Required                 │
│  }                                                                          │
│                                                                             │
│  Response Schema:                                                           │
│  {                                                                          │
│      "id": "string",                                                        │
│      "model": "string",                                                     │
│      "results": Classification[]                                            │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.10 API Endpoint Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | Chat completions (sync/stream) |
| `/v1/fim/completions` | POST | Fill-in-the-middle completions |
| `/v1/embeddings` | POST | Generate embeddings |
| `/v1/models` | GET | List models |
| `/v1/models/{id}` | GET | Get model |
| `/v1/models/{id}` | DELETE | Delete fine-tuned model |
| `/v1/models/{id}` | PATCH | Update fine-tuned model |
| `/v1/files` | POST | Upload file |
| `/v1/files` | GET | List files |
| `/v1/files/{id}` | GET | Get file |
| `/v1/files/{id}` | DELETE | Delete file |
| `/v1/files/{id}/content` | GET | Download file content |
| `/v1/fine_tuning/jobs` | POST | Create fine-tuning job |
| `/v1/fine_tuning/jobs` | GET | List fine-tuning jobs |
| `/v1/fine_tuning/jobs/{id}` | GET | Get fine-tuning job |
| `/v1/fine_tuning/jobs/{id}/cancel` | POST | Cancel fine-tuning job |
| `/v1/fine_tuning/jobs/{id}/start` | POST | Start fine-tuning job |
| `/v1/agents` | POST | Create agent |
| `/v1/agents` | GET | List agents |
| `/v1/agents/{id}` | GET | Get agent |
| `/v1/agents/{id}` | PATCH | Update agent |
| `/v1/agents/{id}` | DELETE | Delete agent |
| `/v1/agents/{id}/completions` | POST | Agent completions |
| `/v1/batch/jobs` | POST | Create batch job |
| `/v1/batch/jobs` | GET | List batch jobs |
| `/v1/batch/jobs/{id}` | GET | Get batch job |
| `/v1/batch/jobs/{id}/cancel` | POST | Cancel batch job |
| `/v1/moderations` | POST | Moderate content |
| `/v1/classifiers` | POST | Classify text |

---

## 5. Data Types

### 5.1 Core Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CORE TYPES                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Message                                                                    │
│  {                                                                          │
│      role: "system" | "user" | "assistant" | "tool",                        │
│      content: string | ContentPart[],                                       │
│      name?: string,                                                         │
│      tool_calls?: ToolCall[],           // For assistant messages           │
│      tool_call_id?: string              // For tool responses               │
│  }                                                                          │
│                                                                             │
│  ContentPart                                                                │
│  {                                                                          │
│      type: "text" | "image_url",                                            │
│      text?: string,                     // For type: "text"                 │
│      image_url?: {                      // For type: "image_url"            │
│          url: string,                   // URL or base64 data URI           │
│          detail?: "auto" | "low" | "high"                                   │
│      }                                                                      │
│  }                                                                          │
│                                                                             │
│  Tool                                                                       │
│  {                                                                          │
│      type: "function",                                                      │
│      function: {                                                            │
│          name: string,                                                      │
│          description?: string,                                              │
│          parameters?: JsonSchema        // JSON Schema object               │
│      }                                                                      │
│  }                                                                          │
│                                                                             │
│  ToolCall                                                                   │
│  {                                                                          │
│      id: string,                                                            │
│      type: "function",                                                      │
│      function: {                                                            │
│          name: string,                                                      │
│          arguments: string              // JSON string                      │
│      }                                                                      │
│  }                                                                          │
│                                                                             │
│  ToolChoice                                                                 │
│  "auto" | "any" | "none" | {                                                │
│      type: "function",                                                      │
│      function: { name: string }                                             │
│  }                                                                          │
│                                                                             │
│  ResponseFormat                                                             │
│  {                                                                          │
│      type: "text" | "json_object" | "json_schema",                          │
│      json_schema?: {                    // For type: "json_schema"          │
│          name: string,                                                      │
│          description?: string,                                              │
│          schema: JsonSchema,                                                │
│          strict?: boolean                                                   │
│      }                                                                      │
│  }                                                                          │
│                                                                             │
│  Usage                                                                      │
│  {                                                                          │
│      prompt_tokens: integer,                                                │
│      completion_tokens?: integer,       // Not present for embeddings       │
│      total_tokens: integer                                                  │
│  }                                                                          │
│                                                                             │
│  Choice                                                                     │
│  {                                                                          │
│      index: integer,                                                        │
│      message: Message,                  // For non-streaming                │
│      delta?: Message,                   // For streaming                    │
│      finish_reason: "stop" | "length" | "tool_calls" | "error" | null       │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Streaming Event Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       STREAMING EVENT TYPES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SSE Event Format:                                                          │
│  data: <json_payload>                                                       │
│  data: [DONE]                           // Terminal event                   │
│                                                                             │
│  StreamChunk                                                                │
│  {                                                                          │
│      id: string,                                                            │
│      object: "chat.completion.chunk",                                       │
│      created: integer,                                                      │
│      model: string,                                                         │
│      choices: [                                                             │
│          {                                                                  │
│              index: integer,                                                │
│              delta: {                                                       │
│                  role?: "assistant",    // Only in first chunk              │
│                  content?: string,      // Incremental content              │
│                  tool_calls?: ToolCallDelta[]                               │
│              },                                                             │
│              finish_reason: string | null                                   │
│          }                                                                  │
│      ],                                                                     │
│      usage?: Usage                      // Only in final chunk              │
│  }                                                                          │
│                                                                             │
│  ToolCallDelta                                                              │
│  {                                                                          │
│      index: integer,                                                        │
│      id?: string,                       // Only in first delta for call     │
│      type?: "function",                 // Only in first delta              │
│      function?: {                                                           │
│          name?: string,                 // Only in first delta              │
│          arguments?: string             // Incremental JSON                 │
│      }                                                                      │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Model Information Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MODEL INFORMATION TYPES                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Model                                                                      │
│  {                                                                          │
│      id: string,                        // e.g., "mistral-large-latest"     │
│      object: "model",                                                       │
│      created: integer,                  // Unix timestamp                   │
│      owned_by: string,                  // e.g., "mistralai"                │
│      capabilities: ModelCapabilities,                                       │
│      name: string,                      // Human-readable name              │
│      description: string,                                                   │
│      max_context_length: integer,       // e.g., 32768                      │
│      aliases: string[],                 // Alternative model names          │
│      deprecation: string | null,        // Deprecation date if any          │
│      default_model_temperature: number,                                     │
│      type: "base" | "fine-tuned"                                            │
│  }                                                                          │
│                                                                             │
│  ModelCapabilities                                                          │
│  {                                                                          │
│      completion_chat: boolean,                                              │
│      completion_fim: boolean,                                               │
│      function_calling: boolean,                                             │
│      fine_tuning: boolean,                                                  │
│      vision: boolean                                                        │
│  }                                                                          │
│                                                                             │
│  Available Models (as of specification date):                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ mistral-large-latest     - Flagship model                          │    │
│  │ mistral-small-latest     - Cost-efficient model                    │    │
│  │ mistral-medium-latest    - Balanced model (deprecated)             │    │
│  │ codestral-latest         - Code generation model                   │    │
│  │ mistral-embed            - Embedding model                         │    │
│  │ ministral-3b-latest      - Small efficient model                   │    │
│  │ ministral-8b-latest      - Medium efficient model                  │    │
│  │ pixtral-12b-latest       - Vision model                            │    │
│  │ pixtral-large-latest     - Large vision model                      │    │
│  │ mistral-moderation-latest - Content moderation                     │    │
│  │ open-mistral-nemo        - Open weights model                      │    │
│  │ open-codestral-mamba     - Code model with Mamba architecture      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Error Taxonomy

### 6.1 Error Classification

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ERROR CLASSIFICATION                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CLIENT ERRORS (4xx - No Retry)                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ HTTP 400 - Bad Request                                              │    │
│  │   • Invalid request format                                          │    │
│  │   • Missing required parameters                                     │    │
│  │   • Invalid parameter values                                        │    │
│  │   → MistralError::InvalidRequestError                               │    │
│  │                                                                     │    │
│  │ HTTP 401 - Unauthorized                                             │    │
│  │   • Invalid API key                                                 │    │
│  │   • Missing API key                                                 │    │
│  │   • Expired API key                                                 │    │
│  │   → MistralError::AuthenticationError                               │    │
│  │                                                                     │    │
│  │ HTTP 403 - Forbidden                                                │    │
│  │   • Insufficient permissions                                        │    │
│  │   • Account restrictions                                            │    │
│  │   → MistralError::PermissionError                                   │    │
│  │                                                                     │    │
│  │ HTTP 404 - Not Found                                                │    │
│  │   • Model not found                                                 │    │
│  │   • Resource not found                                              │    │
│  │   • Invalid endpoint                                                │    │
│  │   → MistralError::NotFoundError                                     │    │
│  │                                                                     │    │
│  │ HTTP 422 - Unprocessable Entity                                     │    │
│  │   • Validation failed                                               │    │
│  │   • Semantic errors                                                 │    │
│  │   → MistralError::ValidationError                                   │    │
│  │                                                                     │    │
│  │ HTTP 429 - Too Many Requests                                        │    │
│  │   • Rate limit exceeded                                             │    │
│  │   • Quota exhausted                                                 │    │
│  │   → MistralError::RateLimitError (Retryable with backoff)           │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  SERVER ERRORS (5xx - Retryable)                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ HTTP 500 - Internal Server Error                                    │    │
│  │   • Unexpected server error                                         │    │
│  │   → MistralError::InternalError (Retryable)                         │    │
│  │                                                                     │    │
│  │ HTTP 502 - Bad Gateway                                              │    │
│  │   • Gateway error                                                   │    │
│  │   → MistralError::ServiceError (Retryable)                          │    │
│  │                                                                     │    │
│  │ HTTP 503 - Service Unavailable                                      │    │
│  │   • Service temporarily unavailable                                 │    │
│  │   • Maintenance                                                     │    │
│  │   → MistralError::ServiceUnavailableError (Retryable)               │    │
│  │                                                                     │    │
│  │ HTTP 504 - Gateway Timeout                                          │    │
│  │   • Request timeout at gateway                                      │    │
│  │   → MistralError::TimeoutError (Retryable)                          │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  NETWORK ERRORS (Retryable)                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Connection refused                                                  │    │
│  │   → MistralError::ConnectionError                                   │    │
│  │                                                                     │    │
│  │ Connection timeout                                                  │    │
│  │   → MistralError::TimeoutError                                      │    │
│  │                                                                     │    │
│  │ DNS resolution failure                                              │    │
│  │   → MistralError::ConnectionError                                   │    │
│  │                                                                     │    │
│  │ TLS handshake failure                                               │    │
│  │   → MistralError::TlsError                                          │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  CLIENT-SIDE ERRORS (Not Retryable)                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Serialization error                                                 │    │
│  │   → MistralError::SerializationError                                │    │
│  │                                                                     │    │
│  │ Deserialization error                                               │    │
│  │   → MistralError::DeserializationError                              │    │
│  │                                                                     │    │
│  │ Configuration error                                                 │    │
│  │   → MistralError::ConfigurationError                                │    │
│  │                                                                     │    │
│  │ Validation error                                                    │    │
│  │   → MistralError::ValidationError                                   │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Error Response Format

```json
{
    "object": "error",
    "message": "Human-readable error message",
    "type": "invalid_request_error",
    "param": "messages",
    "code": "invalid_messages"
}
```

### 6.3 Error Type Enum

```rust
pub enum MistralError {
    // Client-side errors
    ConfigurationError { message: String, field: Option<String> },
    ValidationError { message: String, field: String, value: Option<String> },
    SerializationError { message: String, source: Box<dyn Error> },
    DeserializationError { message: String, source: Box<dyn Error> },

    // Network errors
    ConnectionError { message: String, source: Option<Box<dyn Error>> },
    TimeoutError { message: String, duration: Duration },
    TlsError { message: String, source: Option<Box<dyn Error>> },

    // API errors
    InvalidRequestError { message: String, param: Option<String>, code: Option<String> },
    AuthenticationError { message: String },
    PermissionError { message: String },
    NotFoundError { message: String, resource: Option<String> },
    RateLimitError { message: String, retry_after: Option<Duration> },
    InternalError { message: String, request_id: Option<String> },
    ServiceError { message: String },
    ServiceUnavailableError { message: String, retry_after: Option<Duration> },

    // Streaming errors
    StreamError { message: String, source: Option<Box<dyn Error>> },

    // Resilience errors
    CircuitBreakerOpen { message: String },
    RetryExhausted { message: String, attempts: u32, last_error: Box<Self> },
}
```

---

## 7. Resilience Hooks

### 7.1 Retry Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RETRY CONFIGURATION                                  │
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
│  • HTTP 502 (Bad Gateway)                                                   │
│  • HTTP 503 (Service Unavailable) - Respect Retry-After header              │
│  • HTTP 504 (Gateway Timeout)                                               │
│  • Connection errors                                                        │
│  • Timeout errors                                                           │
│                                                                             │
│  Non-Retryable Conditions:                                                  │
│  • HTTP 400 (Bad Request)                                                   │
│  • HTTP 401 (Unauthorized)                                                  │
│  • HTTP 403 (Forbidden)                                                     │
│  • HTTP 404 (Not Found)                                                     │
│  • HTTP 422 (Unprocessable Entity)                                          │
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
│  • Rate limit errors (handled by rate limiter)                              │
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
│  │ Chat Completions:                                                   │    │
│  │   requests_per_minute: configurable (default: 60)                   │    │
│  │   tokens_per_minute: configurable (default: 100,000)                │    │
│  │                                                                     │    │
│  │ Embeddings:                                                         │    │
│  │   requests_per_minute: configurable (default: 60)                   │    │
│  │   tokens_per_minute: configurable (default: 1,000,000)              │    │
│  │                                                                     │    │
│  │ Other Endpoints:                                                    │    │
│  │   requests_per_minute: configurable (default: 60)                   │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Server Rate Limit Headers:                                                 │
│  • x-ratelimit-limit-requests                                               │
│  • x-ratelimit-limit-tokens                                                 │
│  • x-ratelimit-remaining-requests                                           │
│  • x-ratelimit-remaining-tokens                                             │
│  • x-ratelimit-reset-requests                                               │
│  • x-ratelimit-reset-tokens                                                 │
│  • Retry-After (on 429)                                                     │
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
│                         AUTHENTICATION                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  API Key Authentication:                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Header: Authorization: Bearer {api_key}                             │    │
│  │                                                                     │    │
│  │ API Key Storage:                                                    │    │
│  │ • Store in SecretString (zeroize on drop)                           │    │
│  │ • Never log or display                                              │    │
│  │ • Load from environment variable (MISTRAL_API_KEY)                  │    │
│  │ • Accept as explicit parameter                                      │    │
│  │                                                                     │    │
│  │ Loading Priority:                                                   │    │
│  │ 1. Explicit parameter                                               │    │
│  │ 2. Environment variable                                             │    │
│  │ 3. Configuration file (optional, not recommended for production)    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Transport Security

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TRANSPORT SECURITY                                   │
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
│                         INPUT VALIDATION                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Request Validation:                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Model: Non-empty, valid model identifier                          │    │
│  │ • Messages: Non-empty array                                         │    │
│  │ • Messages[].role: Valid role enum                                  │    │
│  │ • Messages[].content: Non-empty (or valid ContentPart[])            │    │
│  │ • Temperature: 0.0 ≤ t ≤ 1.5 (if provided)                          │    │
│  │ • Top_p: 0.0 < p ≤ 1.0 (if provided)                                │    │
│  │ • Max_tokens: > 0 (if provided)                                     │    │
│  │ • Stop sequences: Valid strings (if provided)                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Response Validation:                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Verify expected response structure                                │    │
│  │ • Handle missing optional fields gracefully                         │    │
│  │ • Validate enum values                                              │    │
│  │ • Check for malformed JSON                                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Observability Requirements

### 9.1 Tracing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            TRACING                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Span Naming Convention:                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ mistral.client.<operation>                                          │    │
│  │                                                                     │    │
│  │ Examples:                                                           │    │
│  │ • mistral.client.chat.create                                        │    │
│  │ • mistral.client.chat.create_stream                                 │    │
│  │ • mistral.client.embeddings.create                                  │    │
│  │ • mistral.client.models.list                                        │    │
│  │ • mistral.client.files.upload                                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Required Span Attributes:                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • mistral.model                      // Model used                  │    │
│  │ • mistral.operation                  // Operation name              │    │
│  │ • mistral.request_id                 // Client request ID           │    │
│  │ • http.method                        // HTTP method                 │    │
│  │ • http.url                           // Request URL                 │    │
│  │ • http.status_code                   // Response status             │    │
│  │ • http.request_content_length        // Request size                │    │
│  │ • http.response_content_length       // Response size               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Final Span Attributes (after response):                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • mistral.prompt_tokens              // Input token count           │    │
│  │ • mistral.completion_tokens          // Output token count          │    │
│  │ • mistral.total_tokens               // Total token count           │    │
│  │ • mistral.finish_reason              // Completion finish reason    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Metrics

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             METRICS                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Counters:                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ mistral_requests_total                                              │    │
│  │   labels: { service, method, status, model }                        │    │
│  │                                                                     │    │
│  │ mistral_tokens_total                                                │    │
│  │   labels: { service, direction (prompt/completion), model }         │    │
│  │                                                                     │    │
│  │ mistral_errors_total                                                │    │
│  │   labels: { service, error_type, retryable }                        │    │
│  │                                                                     │    │
│  │ mistral_retries_total                                               │    │
│  │   labels: { service, attempt_number }                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Histograms:                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ mistral_request_duration_seconds                                    │    │
│  │   labels: { service, method, status }                               │    │
│  │   buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120]             │    │
│  │                                                                     │    │
│  │ mistral_time_to_first_token_seconds                                 │    │
│  │   labels: { model }                                                 │    │
│  │   buckets: [0.1, 0.25, 0.5, 1, 2, 5]                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Gauges:                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ mistral_rate_limit_remaining                                        │    │
│  │   labels: { limit_type (requests/tokens) }                          │    │
│  │                                                                     │    │
│  │ mistral_circuit_breaker_state                                       │    │
│  │   labels: { service }                                               │    │
│  │   values: 0=closed, 1=half-open, 2=open                             │    │
│  │                                                                     │    │
│  │ mistral_active_streams                                              │    │
│  │   labels: { }                                                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Logging

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             LOGGING                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Log Levels:                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ ERROR: Request failures, authentication errors, circuit breaker     │    │
│  │ WARN:  Rate limit warnings, retries, deprecation warnings           │    │
│  │ INFO:  Request start/completion, stream start/end                   │    │
│  │ DEBUG: Request/response details (redacted), retry attempts          │    │
│  │ TRACE: Full request/response bodies (development only)              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Redaction Rules:                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • API keys: Never logged (SecretString)                             │    │
│  │ • Authorization header: Redacted                                    │    │
│  │ • Message content: Truncated at configurable length                 │    │
│  │ • File content: Not logged                                          │    │
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
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Testing Requirements

### 10.1 Test Categories

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TEST CATEGORIES                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Unit Tests (London-School TDD):                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Test each component in isolation                                  │    │
│  │ • Mock all external dependencies                                    │    │
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
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Contract Tests:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Verify API contract compliance                                    │    │
│  │ • Test against recorded API responses                               │    │
│  │ • Detect breaking changes                                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  E2E Tests (Optional):                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Test against real Mistral API                                     │    │
│  │ • Requires MISTRAL_API_KEY                                          │    │
│  │ • Run manually or on release                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Mock Interfaces

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MOCK INTERFACES                                     │
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
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Configuration

### 11.1 Client Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CLIENT CONFIGURATION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ClientConfig {                                                             │
│      // Required                                                            │
│      api_key: SecretString,                                                 │
│                                                                             │
│      // Optional with defaults                                              │
│      base_url: Url,                    // Default: https://api.mistral.ai   │
│      timeout: Duration,                // Default: 120s                     │
│      connect_timeout: Duration,        // Default: 30s                      │
│      max_retries: u32,                 // Default: 3                        │
│                                                                             │
│      // Resilience settings                                                 │
│      retry_config: RetryConfig,                                             │
│      circuit_breaker_config: CircuitBreakerConfig,                          │
│      rate_limit_config: RateLimitConfig,                                    │
│                                                                             │
│      // HTTP settings                                                       │
│      http2_only: bool,                 // Default: false                    │
│      pool_max_idle_per_host: usize,    // Default: 10                       │
│      pool_idle_timeout: Duration,      // Default: 90s                      │
│                                                                             │
│      // Observability                                                       │
│      enable_tracing: bool,             // Default: true                     │
│      enable_metrics: bool,             // Default: true                     │
│      log_level: LogLevel,              // Default: Info                     │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MISTRAL_API_KEY` | API key for authentication | Yes (if not provided explicitly) |
| `MISTRAL_BASE_URL` | Override base URL | No |
| `MISTRAL_TIMEOUT_SECS` | Request timeout in seconds | No |
| `MISTRAL_MAX_RETRIES` | Maximum retry attempts | No |
| `MISTRAL_LOG_LEVEL` | Logging level | No |

---

## 12. Acceptance Criteria

### 12.1 Functional Acceptance Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| AC-001 | Client can authenticate with API key | Unit + E2E test |
| AC-002 | Chat completions return valid responses | Integration test |
| AC-003 | Streaming delivers incremental chunks | Integration test |
| AC-004 | Tool calling works end-to-end | Integration test |
| AC-005 | Embeddings return correct dimensions | Integration test |
| AC-006 | File upload/download works | Integration test |
| AC-007 | Fine-tuning job lifecycle works | E2E test |
| AC-008 | Agents can be created and used | Integration test |
| AC-009 | Batch jobs can be created and tracked | Integration test |
| AC-010 | Content moderation returns categories | Integration test |

### 12.2 Non-Functional Acceptance Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| AC-011 | Retry handles transient failures | Unit test |
| AC-012 | Circuit breaker prevents cascade failures | Unit test |
| AC-013 | Rate limiter respects limits | Unit test |
| AC-014 | API key never appears in logs | Unit test |
| AC-015 | TLS 1.2+ is enforced | Configuration test |
| AC-016 | Test coverage ≥ 80% | CI gate |
| AC-017 | All public APIs documented | Doc generation |
| AC-018 | Response time < 100μs for serialization | Benchmark |

### 12.3 Definition of Done

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DEFINITION OF DONE                                  │
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
│                                                                             │
│  Documentation Complete:                                                    │
│  ☐ API documentation generated                                              │
│  ☐ README with usage examples                                               │
│  ☐ CHANGELOG updated                                                        │
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
| - | Specification | [Pseudocode](./pseudocode-mistral.md) |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial specification |

---

**SPARC Specification Phase: COMPLETE**

*Awaiting "Next phase." to begin Pseudocode phase.*
