# SPARC Architecture: Anthropic Integration Module

**Part 2 of 3: Data Flow, State Management, and Concurrency Patterns**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/anthropic`

---

## Table of Contents

8. [Data Flow Architecture](#8-data-flow-architecture)
9. [Request/Response Pipeline](#9-requestresponse-pipeline)
10. [Streaming Architecture](#10-streaming-architecture)
11. [State Management](#11-state-management)
12. [Concurrency Patterns](#12-concurrency-patterns)
13. [Error Propagation](#13-error-propagation)

---

## 8. Data Flow Architecture

### 8.1 High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW OVERVIEW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐                                                            │
│  │ Application │                                                            │
│  └──────┬──────┘                                                            │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         CLIENT LAYER                                 │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │    │
│  │  │ AnthropicClient│  │ ClientConfig │  │ SecretString │               │    │
│  │  └───────┬──────┘  └──────────────┘  └──────────────┘               │    │
│  │          │                                                           │    │
│  └──────────┼───────────────────────────────────────────────────────────┘    │
│             │                                                               │
│             ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        SERVICE LAYER                                 │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │    │
│  │  │MessagesService│  │ ModelsService│  │BatchesService│               │    │
│  │  └───────┬──────┘  └───────┬──────┘  └───────┬──────┘               │    │
│  │          │                 │                 │                       │    │
│  │          └────────────────┬┴─────────────────┘                       │    │
│  │                           │                                          │    │
│  └───────────────────────────┼──────────────────────────────────────────┘    │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       RESILIENCE LAYER                               │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │    │
│  │  │ResilienceOrch │  │RetryExecutor │  │CircuitBreaker│               │    │
│  │  └───────┬──────┘  └───────┬──────┘  └───────┬──────┘               │    │
│  │          │                 │                 │                       │    │
│  │          └────────────────┬┴─────────────────┘                       │    │
│  │                           │                                          │    │
│  │  ┌──────────────┐  ┌──────────────┐                                  │    │
│  │  │ RateLimiter  │  │ RateLimitMgr │                                  │    │
│  │  └───────┬──────┘  └───────┬──────┘                                  │    │
│  │          └────────────────┬┘                                         │    │
│  │                           │                                          │    │
│  └───────────────────────────┼──────────────────────────────────────────┘    │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       TRANSPORT LAYER                                │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │    │
│  │  │RequestBuilder│  │HttpTransport │  │ResponseParser│               │    │
│  │  └───────┬──────┘  └───────┬──────┘  └───────┬──────┘               │    │
│  │          │                 │                 │                       │    │
│  │          └────────────────┬┴─────────────────┘                       │    │
│  │                           │                                          │    │
│  └───────────────────────────┼──────────────────────────────────────────┘    │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        NETWORK I/O                                   │    │
│  │               HTTPS/TLS 1.2+ → api.anthropic.com                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Request Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          REQUEST DATA FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐                                                        │
│  │ CreateMessageReq│  Input DTO                                             │
│  │  - model        │                                                        │
│  │  - messages[]   │                                                        │
│  │  - max_tokens   │                                                        │
│  │  - system       │                                                        │
│  │  - metadata     │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │   VALIDATION    │  Validate all fields                                   │
│  │  - Required     │  - max_tokens > 0                                      │
│  │  - Constraints  │  - messages not empty                                  │
│  │  - Types        │  - model is valid                                      │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ REQUEST BUILDER │  Build HTTP request                                    │
│  │  - Headers      │  - x-api-key: ****                                     │
│  │  - Body (JSON)  │  - anthropic-version: 2023-06-01                       │
│  │  - URL          │  - Content-Type: application/json                      │
│  │  - Beta flags   │  - anthropic-beta: extended-thinking-2025-01-01        │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │   RATE LIMIT    │  Check/acquire capacity                                │
│  │  - Token bucket │  - Requests/min limit                                  │
│  │  - Wait/reject  │  - Tokens/min limit                                    │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │CIRCUIT BREAKER  │  Check circuit state                                   │
│  │  - Closed: OK   │  - Open: fail fast                                     │
│  │  - Half-open    │  - Allow probe request                                 │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │   HTTP SEND     │  Execute request                                       │
│  │  - TLS 1.2+     │  - Connection pooling                                  │
│  │  - Timeout      │  - Keep-alive                                          │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│      NETWORK I/O                                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Response Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RESPONSE DATA FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│      NETWORK I/O                                                            │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │  HTTP RESPONSE  │  Raw HTTP response                                     │
│  │  - Status code  │  - 200, 4xx, 5xx                                       │
│  │  - Headers      │  - request-id, rate limit headers                      │
│  │  - Body         │  - JSON or SSE stream                                  │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ HEADER EXTRACT  │  Extract metadata                                      │
│  │  - request-id   │  - For correlation                                     │
│  │  - rate limits  │  - Update rate limiter state                           │
│  │  - retry-after  │  - For backoff calculation                             │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │                    STATUS CODE ROUTING                       │            │
│  │                                                              │            │
│  │   200 OK ─────────► Success Path                             │            │
│  │   429 Rate Limit ──► Rate Limit Handler                      │            │
│  │   500-599 ─────────► Server Error (may retry)                │            │
│  │   529 Overloaded ──► Overload Handler (special retry)        │            │
│  │   400 Bad Request ─► Client Error (no retry)                 │            │
│  │   401 Unauthorized ► Auth Error (no retry)                   │            │
│  │   403 Forbidden ───► Permission Error (no retry)             │            │
│  │   404 Not Found ───► Resource Error (no retry)               │            │
│  │                                                              │            │
│  └─────────────────────────────────────────────────────────────┘            │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ RESPONSE PARSER │  Parse JSON body                                       │
│  │  - Deserialize  │  - Into strongly-typed struct                          │
│  │  - Validate     │  - Check required fields                               │
│  │  - Transform    │  - Convert to domain types                             │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ MessageResponse │  Output DTO                                            │
│  │  - id           │                                                        │
│  │  - content[]    │                                                        │
│  │  - stop_reason  │                                                        │
│  │  - usage        │                                                        │
│  │  - model        │                                                        │
│  └─────────────────┘                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Request/Response Pipeline

### 9.1 Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       REQUEST/RESPONSE PIPELINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         MIDDLEWARE CHAIN                             │    │
│  │                                                                      │    │
│  │   Request ─►┌────────┐─►┌────────┐─►┌────────┐─►┌────────┐─► API     │    │
│  │             │Logging │  │ Rate   │  │Circuit │  │ Retry  │           │    │
│  │   Response◄─│        │◄─│ Limit  │◄─│Breaker │◄─│        │◄─ API     │    │
│  │             └────────┘  └────────┘  └────────┘  └────────┘           │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      MIDDLEWARE INTERFACES                           │    │
│  │                                                                      │    │
│  │  trait RequestMiddleware {                                           │    │
│  │      fn process_request(&self, req: &mut Request) -> Result<()>;     │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  │  trait ResponseMiddleware {                                          │    │
│  │      fn process_response(&self, resp: &mut Response) -> Result<()>;  │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  │  trait Pipeline {                                                    │    │
│  │      fn add_middleware(&mut self, mw: Box<dyn Middleware>);          │    │
│  │      fn execute(&self, req: Request) -> Result<Response>;            │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Request Building Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      REQUEST BUILDING PIPELINE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ STAGE 1: Endpoint Resolution                                          │  │
│  │                                                                        │  │
│  │   Service Method ──► Endpoint Mapping ──► Full URL                     │  │
│  │                                                                        │  │
│  │   messages.create() ──► POST /v1/messages                              │  │
│  │   models.list()     ──► GET /v1/models                                 │  │
│  │   models.get(id)    ──► GET /v1/models/{id}                            │  │
│  │   batches.create()  ──► POST /v1/messages/batches                      │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ STAGE 2: Header Assembly                                              │  │
│  │                                                                        │  │
│  │   Required Headers:                                                    │  │
│  │   ┌─────────────────────────────────────────────────────────────────┐ │  │
│  │   │ x-api-key: sk-ant-****                                          │ │  │
│  │   │ anthropic-version: 2023-06-01                                   │ │  │
│  │   │ Content-Type: application/json                                  │ │  │
│  │   └─────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                        │  │
│  │   Conditional Headers:                                                 │  │
│  │   ┌─────────────────────────────────────────────────────────────────┐ │  │
│  │   │ anthropic-beta: extended-thinking-2025-01-01,pdfs-2024-09-25    │ │  │
│  │   │ x-request-id: {client-request-id}                               │ │  │
│  │   └─────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ STAGE 3: Body Serialization                                           │  │
│  │                                                                        │  │
│  │   Domain Object ──► JSON Serialization ──► Request Body                │  │
│  │                                                                        │  │
│  │   CreateMessageRequest {                                               │  │
│  │       model: "claude-sonnet-4-20250514",                               │  │
│  │       max_tokens: 1024,                                                │  │
│  │       messages: [...]                                                  │  │
│  │   }                                                                    │  │
│  │           │                                                            │  │
│  │           ▼                                                            │  │
│  │   {                                                                    │  │
│  │       "model": "claude-sonnet-4-20250514",                             │  │
│  │       "max_tokens": 1024,                                              │  │
│  │       "messages": [...]                                                │  │
│  │   }                                                                    │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ STAGE 4: Request Finalization                                         │  │
│  │                                                                        │  │
│  │   HTTP Request Object:                                                 │  │
│  │   ┌─────────────────────────────────────────────────────────────────┐ │  │
│  │   │ Method: POST                                                    │ │  │
│  │   │ URL: https://api.anthropic.com/v1/messages                      │ │  │
│  │   │ Headers: { x-api-key, anthropic-version, ... }                  │ │  │
│  │   │ Body: { "model": ..., "messages": ... }                         │ │  │
│  │   │ Timeout: 300s                                                   │ │  │
│  │   └─────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Response Parsing Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      RESPONSE PARSING PIPELINE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ STAGE 1: Status Classification                                        │  │
│  │                                                                        │  │
│  │   HTTP Status ──► Classification ──► Handler Selection                 │  │
│  │                                                                        │  │
│  │   ┌────────────┬──────────────────────────────────────────────────┐   │  │
│  │   │ Status     │ Classification                                   │   │  │
│  │   ├────────────┼──────────────────────────────────────────────────┤   │  │
│  │   │ 200        │ Success → Parse body                             │   │  │
│  │   │ 400        │ InvalidRequest → No retry                        │   │  │
│  │   │ 401        │ AuthenticationError → No retry                   │   │  │
│  │   │ 403        │ PermissionError → No retry                       │   │  │
│  │   │ 404        │ NotFoundError → No retry                         │   │  │
│  │   │ 422        │ InvalidRequest → No retry                        │   │  │
│  │   │ 429        │ RateLimitError → Retry with backoff              │   │  │
│  │   │ 500        │ InternalError → Retry                            │   │  │
│  │   │ 529        │ OverloadedError → Retry with longer backoff      │   │  │
│  │   └────────────┴──────────────────────────────────────────────────┘   │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ STAGE 2: Error Body Parsing (for 4xx/5xx)                             │  │
│  │                                                                        │  │
│  │   Error Response Body:                                                 │  │
│  │   {                                                                    │  │
│  │       "type": "error",                                                 │  │
│  │       "error": {                                                       │  │
│  │           "type": "rate_limit_error",                                  │  │
│  │           "message": "Rate limit exceeded"                             │  │
│  │       }                                                                │  │
│  │   }                                                                    │  │
│  │           │                                                            │  │
│  │           ▼                                                            │  │
│  │   AnthropicError {                                                     │  │
│  │       error_type: RateLimitError,                                      │  │
│  │       message: "Rate limit exceeded",                                  │  │
│  │       request_id: Some("req_123"),                                     │  │
│  │       retry_after: Some(Duration::from_secs(30))                       │  │
│  │   }                                                                    │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ STAGE 3: Success Body Parsing                                         │  │
│  │                                                                        │  │
│  │   JSON Body ──► Deserialize ──► Domain Object                          │  │
│  │                                                                        │  │
│  │   {                                                                    │  │
│  │       "id": "msg_abc123",                                              │  │
│  │       "type": "message",                                               │  │
│  │       "role": "assistant",                                             │  │
│  │       "content": [...],                                                │  │
│  │       "model": "claude-sonnet-4-20250514",                             │  │
│  │       "stop_reason": "end_turn",                                       │  │
│  │       "usage": { "input_tokens": 10, "output_tokens": 50 }             │  │
│  │   }                                                                    │  │
│  │           │                                                            │  │
│  │           ▼                                                            │  │
│  │   MessageResponse {                                                    │  │
│  │       id: "msg_abc123",                                                │  │
│  │       content: vec![ContentBlock::Text(...)],                          │  │
│  │       model: "claude-sonnet-4-20250514",                               │  │
│  │       stop_reason: StopReason::EndTurn,                                │  │
│  │       usage: Usage { input: 10, output: 50 }                           │  │
│  │   }                                                                    │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Streaming Architecture

### 10.1 SSE Stream Processing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SSE STREAMING ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      STREAM INITIALIZATION                           │    │
│  │                                                                      │    │
│  │   CreateMessageRequest { stream: true }                              │    │
│  │                   │                                                  │    │
│  │                   ▼                                                  │    │
│  │   HTTP Response (chunked, text/event-stream)                         │    │
│  │                   │                                                  │    │
│  │                   ▼                                                  │    │
│  │   SSEParser::new(response.body_stream())                             │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       SSE EVENT STREAM                               │    │
│  │                                                                      │    │
│  │   Raw Bytes ──► Line Parser ──► Event Parser ──► Typed Events        │    │
│  │                                                                      │    │
│  │   "event: message_start\n"                                           │    │
│  │   "data: {...}\n\n"                                                  │    │
│  │           │                                                          │    │
│  │           ▼                                                          │    │
│  │   SSEEvent {                                                         │    │
│  │       event: "message_start",                                        │    │
│  │       data: "{...}"                                                  │    │
│  │   }                                                                  │    │
│  │           │                                                          │    │
│  │           ▼                                                          │    │
│  │   StreamEvent::MessageStart(MessageStartEvent {...})                 │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Stream Event State Machine

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STREAM EVENT STATE MACHINE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐                                                          │
│   │   INITIAL    │                                                          │
│   └──────┬───────┘                                                          │
│          │ message_start                                                    │
│          ▼                                                                  │
│   ┌──────────────┐                                                          │
│   │MESSAGE_ACTIVE│◄─────────────────────────────────────────┐               │
│   └──────┬───────┘                                          │               │
│          │                                                  │               │
│          ├─── content_block_start ───►┌────────────────┐    │               │
│          │                            │ CONTENT_BLOCK  │    │               │
│          │                            │    ACTIVE      │    │               │
│          │                            └───────┬────────┘    │               │
│          │                                    │             │               │
│          │           ┌────────────────────────┤             │               │
│          │           │                        │             │               │
│          │           ▼                        ▼             │               │
│          │   ┌──────────────┐   ┌───────────────────────┐   │               │
│          │   │ content_block│   │content_block_stop     │───┘               │
│          │   │    _delta    │   │(return to MSG_ACTIVE) │                   │
│          │   └──────────────┘   └───────────────────────┘                   │
│          │           │                                                      │
│          │           └──── (repeat for streaming text) ────►                │
│          │                                                                  │
│          │ message_delta (final usage stats)                                │
│          ▼                                                                  │
│   ┌──────────────┐                                                          │
│   │ MESSAGE_DONE │                                                          │
│   └──────┬───────┘                                                          │
│          │ message_stop                                                     │
│          ▼                                                                  │
│   ┌──────────────┐                                                          │
│   │   COMPLETE   │                                                          │
│   └──────────────┘                                                          │
│                                                                             │
│   Event Types:                                                              │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │ message_start      - Initial message metadata                      │    │
│   │ content_block_start - New content block beginning                  │    │
│   │ content_block_delta - Incremental content (text, tool_use)         │    │
│   │ content_block_stop  - Content block complete                       │    │
│   │ message_delta       - Usage stats update                           │    │
│   │ message_stop        - Stream complete                              │    │
│   │ ping                - Keep-alive (ignored for state)               │    │
│   │ error               - Stream error (terminal)                      │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.3 Extended Thinking Stream Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   EXTENDED THINKING STREAM FLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Request with thinking: { budget_tokens: 10000 }                            │
│                                                                             │
│  Timeline:                                                                  │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  │ message_start                                                            │
│  │     └─► MessageStartEvent { message: { id, model, ... } }                │
│  │                                                                          │
│  │ content_block_start (index: 0, type: thinking)                           │
│  │     └─► ContentBlockStart { type: "thinking" }                           │
│  │                                                                          │
│  │ content_block_delta (thinking content)                                   │
│  │     └─► ThinkingDelta { thinking: "Let me analyze..." }                  │
│  │     └─► ThinkingDelta { thinking: "First, I'll..." }                     │
│  │     └─► ... (multiple deltas)                                            │
│  │                                                                          │
│  │ content_block_stop (index: 0)                                            │
│  │     └─► Thinking block complete                                          │
│  │                                                                          │
│  │ content_block_start (index: 1, type: text)                               │
│  │     └─► ContentBlockStart { type: "text" }                               │
│  │                                                                          │
│  │ content_block_delta (text content)                                       │
│  │     └─► TextDelta { text: "Based on..." }                                │
│  │     └─► TextDelta { text: "my analysis..." }                             │
│  │                                                                          │
│  │ content_block_stop (index: 1)                                            │
│  │     └─► Text block complete                                              │
│  │                                                                          │
│  │ message_delta                                                            │
│  │     └─► MessageDelta { usage: { output_tokens, thinking_tokens } }       │
│  │                                                                          │
│  │ message_stop                                                             │
│  ▼     └─► Stream complete                                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.4 Stream Accumulator Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STREAM ACCUMULATOR PATTERN                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Purpose: Reconstruct full MessageResponse from stream events               │
│                                                                             │
│  struct StreamAccumulator {                                                 │
│      message_id: Option<String>,                                            │
│      model: Option<String>,                                                 │
│      role: Role,                                                            │
│      content_blocks: Vec<ContentBlock>,                                     │
│      current_block: Option<PartialContentBlock>,                            │
│      stop_reason: Option<StopReason>,                                       │
│      usage: Option<Usage>,                                                  │
│  }                                                                          │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Accumulator State Transitions                                          │ │
│  │                                                                         │ │
│  │ message_start ──► Set message_id, model, role                          │ │
│  │                                                                         │ │
│  │ content_block_start ──► Create new PartialContentBlock                 │ │
│  │                         Store in current_block                         │ │
│  │                                                                         │ │
│  │ content_block_delta ──► Append to current_block.content                │ │
│  │                         (text += delta.text)                           │ │
│  │                         (thinking += delta.thinking)                   │ │
│  │                                                                         │ │
│  │ content_block_stop ──► Finalize current_block                          │ │
│  │                        Push to content_blocks                          │ │
│  │                        Clear current_block                             │ │
│  │                                                                         │ │
│  │ message_delta ──► Update usage stats                                   │ │
│  │                   Update stop_reason                                   │ │
│  │                                                                         │ │
│  │ message_stop ──► Mark complete                                         │ │
│  │                  Return accumulated MessageResponse                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  impl StreamAccumulator {                                                   │
│      fn process_event(&mut self, event: StreamEvent) -> Option<()>;         │
│      fn is_complete(&self) -> bool;                                         │
│      fn into_message(self) -> Result<MessageResponse>;                      │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. State Management

### 11.1 Client State

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLIENT STATE MANAGEMENT                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      IMMUTABLE STATE                                 │    │
│  │                                                                      │    │
│  │   Shared across all requests (Arc<T>):                               │    │
│  │                                                                      │    │
│  │   ┌─────────────────────┐  ┌─────────────────────┐                   │    │
│  │   │   ClientConfig      │  │   HttpClient        │                   │    │
│  │   │   - base_url        │  │   - connection pool │                   │    │
│  │   │   - api_version     │  │   - TLS config      │                   │    │
│  │   │   - timeouts        │  │   - proxy settings  │                   │    │
│  │   │   - beta_features   │  │                     │                   │    │
│  │   └─────────────────────┘  └─────────────────────┘                   │    │
│  │                                                                      │    │
│  │   ┌─────────────────────┐  ┌─────────────────────┐                   │    │
│  │   │  AuthProvider       │  │   Logger            │                   │    │
│  │   │   - SecretString    │  │   - log level       │                   │    │
│  │   │   - redacted view   │  │   - targets         │                   │    │
│  │   └─────────────────────┘  └─────────────────────┘                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       MUTABLE STATE                                  │    │
│  │                                                                      │    │
│  │   Protected by synchronization primitives:                           │    │
│  │                                                                      │    │
│  │   ┌─────────────────────┐                                            │    │
│  │   │ CircuitBreakerState │  Arc<RwLock<T>> or Arc<Mutex<T>>           │    │
│  │   │   - state: Closed/Open/HalfOpen                                  │    │
│  │   │   - failure_count                                                │    │
│  │   │   - success_count                                                │    │
│  │   │   - last_failure_time                                            │    │
│  │   │   - open_until                                                   │    │
│  │   └─────────────────────┘                                            │    │
│  │                                                                      │    │
│  │   ┌─────────────────────┐                                            │    │
│  │   │  RateLimiterState   │  Arc<Mutex<T>>                             │    │
│  │   │   - tokens (bucket)                                              │    │
│  │   │   - last_refill_time                                             │    │
│  │   │   - window_requests (sliding)                                    │    │
│  │   └─────────────────────┘                                            │    │
│  │                                                                      │    │
│  │   ┌─────────────────────┐                                            │    │
│  │   │    MetricsState     │  Arc<AtomicU64> for counters               │    │
│  │   │   - request_count                                                │    │
│  │   │   - error_count                                                  │    │
│  │   │   - latency_histogram                                            │    │
│  │   └─────────────────────┘                                            │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Service State Isolation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SERVICE STATE ISOLATION                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  AnthropicClient                                                            │
│  │                                                                          │
│  ├─► MessagesService ──► Isolated rate limits (messages endpoint)           │
│  │                                                                          │
│  ├─► ModelsService ───► Isolated rate limits (models endpoint)              │
│  │                                                                          │
│  ├─► BatchesService ──► Isolated rate limits (batches endpoint)             │
│  │                                                                          │
│  └─► AdminService ────► Isolated rate limits (admin endpoints)              │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Shared Components (via Arc)                                            │ │
│  │                                                                         │ │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │ │
│  │   │  HttpClient  │  │  AuthProvider │  │   Logger     │                 │ │
│  │   │   (shared)   │  │   (shared)    │  │  (shared)    │                 │ │
│  │   └──────────────┘  └──────────────┘  └──────────────┘                 │ │
│  │                                                                         │ │
│  │   ┌──────────────────────────────────────────────────┐                 │ │
│  │   │          Circuit Breaker (per-endpoint)          │                 │ │
│  │   │  /messages: Closed  │  /models: HalfOpen        │                 │ │
│  │   │  /batches: Closed   │  /admin/*: Closed         │                 │ │
│  │   └──────────────────────────────────────────────────┘                 │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  Benefits:                                                                  │
│  • Failure in one service doesn't affect others                             │
│  • Rate limits properly isolated per endpoint                               │
│  • Connection pool shared for efficiency                                    │
│  • Configuration consistent across services                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.3 Request-Scoped State

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       REQUEST-SCOPED STATE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Each request carries isolated context:                                     │
│                                                                             │
│  struct RequestContext {                                                    │
│      // Tracing                                                             │
│      span: tracing::Span,         // Request-specific span                  │
│      trace_id: TraceId,           // Distributed trace ID                   │
│      parent_span_id: Option<SpanId>,                                        │
│                                                                             │
│      // Request metadata                                                    │
│      request_id: String,          // Client-generated ID                    │
│      start_time: Instant,         // For latency calculation                │
│      attempt_number: u32,         // Current retry attempt                  │
│                                                                             │
│      // Deadline management                                                 │
│      deadline: Option<Instant>,   // Absolute deadline                      │
│      remaining_timeout: Duration, // Decremented on retry                   │
│  }                                                                          │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Request Context Flow                                                   │ │
│  │                                                                         │ │
│  │   Client.send()                                                         │ │
│  │       │                                                                 │ │
│  │       ├─► Create RequestContext with fresh span                         │ │
│  │       │                                                                 │ │
│  │       ├─► Retry loop (attempt 1, 2, 3...)                               │ │
│  │       │       │                                                         │ │
│  │       │       ├─► Update attempt_number                                 │ │
│  │       │       ├─► Calculate remaining_timeout                           │ │
│  │       │       ├─► Create child span for attempt                         │ │
│  │       │       └─► Execute request                                       │ │
│  │       │                                                                 │ │
│  │       └─► Close span, record metrics                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Concurrency Patterns

### 12.1 Async Runtime Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ASYNC RUNTIME MODEL                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      RUST (Tokio Runtime)                            │    │
│  │                                                                      │    │
│  │   ┌──────────────────────────────────────────────────────────────┐   │    │
│  │   │                    Tokio Multi-Thread                        │   │    │
│  │   │                                                              │   │    │
│  │   │   Worker Thread 1 ─── Task Queue ─── Executor                │   │    │
│  │   │   Worker Thread 2 ─── Task Queue ─── Executor                │   │    │
│  │   │   Worker Thread N ─── Task Queue ─── Executor                │   │    │
│  │   │                                                              │   │    │
│  │   │   Features Used:                                             │   │    │
│  │   │   • tokio::spawn for concurrent tasks                        │   │    │
│  │   │   • tokio::select! for racing futures                        │   │    │
│  │   │   • tokio::time for delays and timeouts                      │   │    │
│  │   │   • tokio::sync for channels and mutexes                     │   │    │
│  │   │                                                              │   │    │
│  │   └──────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                  TYPESCRIPT (Node.js Event Loop)                     │    │
│  │                                                                      │    │
│  │   ┌──────────────────────────────────────────────────────────────┐   │    │
│  │   │                    Event Loop Phases                         │   │    │
│  │   │                                                              │   │    │
│  │   │   Timers ─► Callbacks ─► Idle ─► Poll ─► Check ─► Close      │   │    │
│  │   │      │                                                       │   │    │
│  │   │      └──────────────────────────────────────────────────┐    │   │    │
│  │   │                                                         │    │   │    │
│  │   │   Features Used:                                        │    │   │    │
│  │   │   • Promise/async-await for async flow                  │    │   │    │
│  │   │   • setTimeout for delays                               │    │   │    │
│  │   │   • AbortController for cancellation                    │    │   │    │
│  │   │   • EventEmitter for streaming                          │    │   │    │
│  │   │                                                              │   │    │
│  │   └──────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Concurrent Request Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONCURRENT REQUEST HANDLING                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Pattern: Multiple concurrent requests with shared client                   │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Rust Example                                                           │ │
│  │                                                                         │ │
│  │   let client = Arc::new(AnthropicClient::new(config));                 │ │
│  │                                                                         │ │
│  │   // Spawn multiple concurrent requests                                │ │
│  │   let handles: Vec<_> = requests.into_iter()                           │ │
│  │       .map(|req| {                                                     │ │
│  │           let client = Arc::clone(&client);                            │ │
│  │           tokio::spawn(async move {                                    │ │
│  │               client.messages().create(req).await                      │ │
│  │           })                                                           │ │
│  │       })                                                               │ │
│  │       .collect();                                                      │ │
│  │                                                                         │ │
│  │   // Await all results                                                 │ │
│  │   let results = futures::future::join_all(handles).await;              │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ TypeScript Example                                                     │ │
│  │                                                                         │ │
│  │   const client = new AnthropicClient(config);                          │ │
│  │                                                                         │ │
│  │   // Concurrent requests with Promise.all                              │ │
│  │   const results = await Promise.all(                                   │ │
│  │       requests.map(req => client.messages.create(req))                 │ │
│  │   );                                                                   │ │
│  │                                                                         │ │
│  │   // Or with Promise.allSettled for partial failures                   │ │
│  │   const settled = await Promise.allSettled(                            │ │
│  │       requests.map(req => client.messages.create(req))                 │ │
│  │   );                                                                   │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.3 Synchronization Primitives

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SYNCHRONIZATION PRIMITIVES                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Circuit Breaker State: RwLock<CircuitState>                            │ │
│  │                                                                         │ │
│  │   Read (shared access):                                                │ │
│  │   • Check if circuit is open                                           │ │
│  │   • Multiple readers allowed                                           │ │
│  │                                                                         │ │
│  │   Write (exclusive access):                                            │ │
│  │   • Transition state                                                   │ │
│  │   • Update failure counters                                            │ │
│  │   • Single writer, blocks readers                                      │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Rate Limiter State: Mutex<TokenBucket>                                 │ │
│  │                                                                         │ │
│  │   Always exclusive:                                                    │ │
│  │   • Check and decrement tokens                                         │ │
│  │   • Refill tokens based on time                                        │ │
│  │   • Must be atomic operation                                           │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Metrics Counters: AtomicU64                                            │ │
│  │                                                                         │ │
│  │   Lock-free operations:                                                │ │
│  │   • fetch_add for incrementing counters                                │ │
│  │   • load for reading values                                            │ │
│  │   • compare_exchange for conditional updates                           │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ TypeScript Equivalents                                                 │ │
│  │                                                                         │ │
│  │   • No true mutexes (single-threaded)                                  │ │
│  │   • Use async queues for ordered access                                │ │
│  │   • Promise chains for sequential operations                           │ │
│  │   • AsyncLock pattern for critical sections                            │ │
│  │                                                                         │ │
│  │   class AsyncLock {                                                    │ │
│  │       private queue: Promise<void> = Promise.resolve();                │ │
│  │                                                                         │ │
│  │       async acquire<T>(fn: () => Promise<T>): Promise<T> {             │ │
│  │           const release = new Deferred<void>();                        │ │
│  │           const prev = this.queue;                                     │ │
│  │           this.queue = release.promise;                                │ │
│  │           await prev;                                                  │ │
│  │           try {                                                        │ │
│  │               return await fn();                                       │ │
│  │           } finally {                                                  │ │
│  │               release.resolve();                                       │ │
│  │           }                                                            │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.4 Cancellation Patterns

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CANCELLATION PATTERNS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Rust: CancellationToken + tokio::select!                               │ │
│  │                                                                         │ │
│  │   struct CancellableRequest {                                          │ │
│  │       cancel_token: CancellationToken,                                 │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   impl CancellableRequest {                                            │ │
│  │       async fn execute<F, T>(&self, future: F) -> Result<T>            │ │
│  │       where                                                            │ │
│  │           F: Future<Output = Result<T>>,                               │ │
│  │       {                                                                │ │
│  │           tokio::select! {                                             │ │
│  │               result = future => result,                               │ │
│  │               _ = self.cancel_token.cancelled() => {                   │ │
│  │                   Err(Error::Cancelled)                                │ │
│  │               }                                                        │ │
│  │           }                                                            │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ TypeScript: AbortController                                            │ │
│  │                                                                         │ │
│  │   async function createMessage(                                        │ │
│  │       request: CreateMessageRequest,                                   │ │
│  │       options?: { signal?: AbortSignal }                               │ │
│  │   ): Promise<MessageResponse> {                                        │ │
│  │       const response = await fetch(url, {                              │ │
│  │           method: 'POST',                                              │ │
│  │           body: JSON.stringify(request),                               │ │
│  │           signal: options?.signal,                                     │ │
│  │       });                                                              │ │
│  │                                                                         │ │
│  │       if (options?.signal?.aborted) {                                  │ │
│  │           throw new AbortError('Request aborted');                     │ │
│  │       }                                                                │ │
│  │                                                                         │ │
│  │       return parseResponse(response);                                  │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   // Usage                                                             │ │
│  │   const controller = new AbortController();                            │ │
│  │   setTimeout(() => controller.abort(), 30000);                         │ │
│  │   await client.messages.create(req, { signal: controller.signal });    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.5 Connection Pool Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CONNECTION POOL MANAGEMENT                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ HTTP/2 Connection Multiplexing                                         │ │
│  │                                                                         │ │
│  │   ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │   │                    Connection Pool                              │  │ │
│  │   │                                                                 │  │ │
│  │   │   ┌─────────────┐                                               │  │ │
│  │   │   │ Connection 1│ ◄── Stream 1 (Request A)                      │  │ │
│  │   │   │   (HTTP/2)  │ ◄── Stream 2 (Request B)                      │  │ │
│  │   │   │            │ ◄── Stream 3 (Request C)                      │  │ │
│  │   │   └─────────────┘                                               │  │ │
│  │   │                                                                 │  │ │
│  │   │   ┌─────────────┐                                               │  │ │
│  │   │   │ Connection 2│ ◄── Stream 1 (Request D)                      │  │ │
│  │   │   │   (HTTP/2)  │ ◄── Stream 2 (Request E)                      │  │ │
│  │   │   └─────────────┘                                               │  │ │
│  │   │                                                                 │  │ │
│  │   │   Settings:                                                     │  │ │
│  │   │   • pool_max_idle_per_host: 10                                  │  │ │
│  │   │   • pool_idle_timeout: 90s                                      │  │ │
│  │   │   • http2_only: true (for api.anthropic.com)                    │  │ │
│  │   │                                                                 │  │ │
│  │   └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Rust (reqwest/hyper)                                                   │ │
│  │                                                                         │ │
│  │   let client = reqwest::Client::builder()                              │ │
│  │       .pool_max_idle_per_host(10)                                      │ │
│  │       .pool_idle_timeout(Duration::from_secs(90))                      │ │
│  │       .http2_prior_knowledge()  // Force HTTP/2                        │ │
│  │       .build()?;                                                       │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ TypeScript (undici/node-fetch)                                         │ │
│  │                                                                         │ │
│  │   import { Agent } from 'undici';                                      │ │
│  │                                                                         │ │
│  │   const agent = new Agent({                                            │ │
│  │       connections: 10,                                                 │ │
│  │       pipelining: 1,                                                   │ │
│  │       keepAliveTimeout: 90000,                                         │ │
│  │   });                                                                  │ │
│  │                                                                         │ │
│  │   const response = await fetch(url, { dispatcher: agent });            │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Error Propagation

### 13.1 Error Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ERROR FLOW ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      ERROR ORIGINATION POINTS                        │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │    │
│  │   │  Validation  │  │   Network    │  │    API       │               │    │
│  │   │   Errors     │  │   Errors     │  │   Errors     │               │    │
│  │   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │    │
│  │          │                 │                 │                       │    │
│  │          └─────────────────┼─────────────────┘                       │    │
│  │                            │                                         │    │
│  │                            ▼                                         │    │
│  │   ┌─────────────────────────────────────────────────────────────┐    │    │
│  │   │              AnthropicError (unified error type)            │    │    │
│  │   │                                                             │    │    │
│  │   │   enum AnthropicError {                                     │    │    │
│  │   │       // Client-side errors                                 │    │    │
│  │   │       ConfigurationError { message, field },                │    │    │
│  │   │       ValidationError { message, field, value },            │    │    │
│  │   │       SerializationError { message, source },               │    │    │
│  │   │                                                             │    │    │
│  │   │       // Network errors                                     │    │    │
│  │   │       ConnectionError { message, source },                  │    │    │
│  │   │       TimeoutError { message, duration },                   │    │    │
│  │   │       TlsError { message, source },                         │    │    │
│  │   │                                                             │    │    │
│  │   │       // API errors (from HTTP response)                    │    │    │
│  │   │       InvalidRequestError { message, param },               │    │    │
│  │   │       AuthenticationError { message },                      │    │    │
│  │   │       PermissionError { message },                          │    │    │
│  │   │       NotFoundError { message, resource },                  │    │    │
│  │   │       RateLimitError { message, retry_after },              │    │    │
│  │   │       ApiError { message, code },                           │    │    │
│  │   │       OverloadedError { message, retry_after },             │    │    │
│  │   │   }                                                         │    │    │
│  │   │                                                             │    │    │
│  │   └─────────────────────────────────────────────────────────────┘    │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.2 Error Propagation Chain

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ERROR PROPAGATION CHAIN                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Application Code                                                          │
│         ▲                                                                   │
│         │ AnthropicError (rich context)                                     │
│         │                                                                   │
│   ┌─────┴─────────────────────────────────────────────────────────────┐     │
│   │                         CLIENT LAYER                               │     │
│   │                                                                    │     │
│   │   fn create_message() -> Result<MessageResponse, AnthropicError>   │     │
│   │                                                                    │     │
│   │   • Catches service errors                                         │     │
│   │   • Adds request context (request_id, model)                       │     │
│   │   • Logs error with span                                           │     │
│   │   • Returns typed error                                            │     │
│   │                                                                    │     │
│   └─────────────────────────────────────────────────────────────────────┘     │
│         ▲                                                                   │
│         │ ServiceError                                                      │
│         │                                                                   │
│   ┌─────┴─────────────────────────────────────────────────────────────┐     │
│   │                        SERVICE LAYER                               │     │
│   │                                                                    │     │
│   │   • Validates request                                              │     │
│   │   • Delegates to resilience layer                                  │     │
│   │   • Transforms transport errors                                    │     │
│   │                                                                    │     │
│   └─────────────────────────────────────────────────────────────────────┘     │
│         ▲                                                                   │
│         │ ResilienceError (retry exhausted, circuit open)                   │
│         │                                                                   │
│   ┌─────┴─────────────────────────────────────────────────────────────┐     │
│   │                       RESILIENCE LAYER                             │     │
│   │                                                                    │     │
│   │   • Retry logic (wraps transport errors)                           │     │
│   │   • Circuit breaker (may short-circuit)                            │     │
│   │   • Rate limiter (may reject)                                      │     │
│   │                                                                    │     │
│   └─────────────────────────────────────────────────────────────────────┘     │
│         ▲                                                                   │
│         │ TransportError (HTTP, TLS, timeout)                               │
│         │                                                                   │
│   ┌─────┴─────────────────────────────────────────────────────────────┐     │
│   │                       TRANSPORT LAYER                              │     │
│   │                                                                    │     │
│   │   • HTTP client errors                                             │     │
│   │   • Response parsing errors                                        │     │
│   │   • API error responses                                            │     │
│   │                                                                    │     │
│   └─────────────────────────────────────────────────────────────────────┘     │
│         ▲                                                                   │
│         │ std::io::Error, reqwest::Error, serde_json::Error                 │
│         │                                                                   │
│   ┌─────┴─────────────────────────────────────────────────────────────┐     │
│   │                        EXTERNAL CRATES                             │     │
│   │                                                                    │     │
│   │   reqwest, hyper, tokio, serde_json, etc.                          │     │
│   │                                                                    │     │
│   └─────────────────────────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.3 Error Context Enrichment

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ERROR CONTEXT ENRICHMENT                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Each layer adds context to errors:                                         │
│                                                                             │
│  Original Error (from reqwest):                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ reqwest::Error { kind: Request, url: "...", source: hyper::Error }     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                              │                                              │
│                              ▼                                              │
│  Transport Layer wraps:                                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ TransportError::Connection {                                           │ │
│  │     message: "Failed to connect to api.anthropic.com",                 │ │
│  │     source: reqwest::Error { ... },                                    │ │
│  │     url: "https://api.anthropic.com/v1/messages",                      │ │
│  │ }                                                                      │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                              │                                              │
│                              ▼                                              │
│  Resilience Layer wraps:                                                    │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ ResilienceError::RetryExhausted {                                      │ │
│  │     message: "All 3 retry attempts failed",                            │ │
│  │     attempts: 3,                                                       │ │
│  │     total_duration: Duration::from_secs(15),                           │ │
│  │     last_error: TransportError::Connection { ... },                    │ │
│  │ }                                                                      │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                              │                                              │
│                              ▼                                              │
│  Client Layer wraps:                                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ AnthropicError::ConnectionError {                                      │ │
│  │     message: "Failed to create message after 3 retries",               │ │
│  │     request_id: "client-req-123",                                      │ │
│  │     model: "claude-sonnet-4-20250514",                                 │ │
│  │     operation: "messages.create",                                      │ │
│  │     source: ResilienceError::RetryExhausted { ... },                   │ │
│  │ }                                                                      │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  Final error includes:                                                      │
│  • Human-readable message                                                   │
│  • Request identification (request_id, model, operation)                    │
│  • Retry information (attempts, duration)                                   │
│  • Full error chain for debugging                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.4 Retryability Classification

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     RETRYABILITY CLASSIFICATION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Error Classification for Retry Decisions                               │ │
│  │                                                                         │ │
│  │   trait Retryable {                                                    │ │
│  │       fn is_retryable(&self) -> bool;                                  │ │
│  │       fn retry_after(&self) -> Option<Duration>;                       │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  │   ┌─────────────────────┬────────────┬─────────────────────────────┐   │ │
│  │   │ Error Type          │ Retryable? │ Notes                       │   │ │
│  │   ├─────────────────────┼────────────┼─────────────────────────────┤   │ │
│  │   │ ConnectionError     │ Yes        │ Transient network issue     │   │ │
│  │   │ TimeoutError        │ Yes        │ May succeed on retry        │   │ │
│  │   │ RateLimitError      │ Yes        │ Use retry-after header      │   │ │
│  │   │ OverloadedError     │ Yes        │ Longer backoff              │   │ │
│  │   │ InternalServerError │ Yes        │ 500-series errors           │   │ │
│  │   │ InvalidRequestError │ No         │ Won't succeed without fix   │   │ │
│  │   │ AuthenticationError │ No         │ Credentials won't change    │   │ │
│  │   │ PermissionError     │ No         │ Access won't change         │   │ │
│  │   │ NotFoundError       │ No         │ Resource doesn't exist      │   │ │
│  │   │ ValidationError     │ No         │ Client-side, fix required   │   │ │
│  │   └─────────────────────┴────────────┴─────────────────────────────┘   │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Implementation                                                         │ │
│  │                                                                         │ │
│  │   impl Retryable for AnthropicError {                                  │ │
│  │       fn is_retryable(&self) -> bool {                                 │ │
│  │           matches!(                                                    │ │
│  │               self,                                                    │ │
│  │               Self::ConnectionError { .. }                             │ │
│  │               | Self::TimeoutError { .. }                              │ │
│  │               | Self::RateLimitError { .. }                            │ │
│  │               | Self::OverloadedError { .. }                           │ │
│  │               | Self::ApiError { code, .. } if code >= 500             │ │
│  │           )                                                            │ │
│  │       }                                                                │ │
│  │                                                                         │ │
│  │       fn retry_after(&self) -> Option<Duration> {                      │ │
│  │           match self {                                                 │ │
│  │               Self::RateLimitError { retry_after, .. } => *retry_after,│ │
│  │               Self::OverloadedError { retry_after, .. } => *retry_after│ │
│  │               _ => None,                                               │ │
│  │           }                                                            │ │
│  │       }                                                                │ │
│  │   }                                                                    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Document Navigation

| Previous | Current | Next |
|----------|---------|------|
| [Part 1: System Overview](./architecture-anthropic-1.md) | Part 2: Data Flow & Concurrency | [Part 3: Integration & Observability](./architecture-anthropic-3.md) |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial data flow and concurrency architecture |

---

**Continued in Part 3: Integration, Observability, and Deployment**
