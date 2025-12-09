# Architecture: Cohere Integration Module - Part 2

**Data Flow, Concurrency, Error Propagation**

**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/cohere`
**SPARC Phase:** Architecture (2 of 3)

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
┌─────────────────────────────────────────────────────────────────────────┐
│                        HIGH-LEVEL DATA FLOW                              │
│                                                                          │
│   User Application                                                       │
│         │                                                                │
│         │ 1. Create Request                                              │
│         ▼                                                                │
│   ┌─────────────┐                                                        │
│   │   Cohere    │                                                        │
│   │   Client    │                                                        │
│   └──────┬──────┘                                                        │
│          │                                                               │
│          │ 2. Route to Service                                           │
│          ▼                                                               │
│   ┌─────────────┐     ┌─────────────┐                                   │
│   │   Service   │────▶│   Request   │                                   │
│   │   Layer     │     │   Builder   │                                   │
│   └──────┬──────┘     └──────┬──────┘                                   │
│          │                   │                                           │
│          │ 3. Validate       │ 4. Build HTTP Request                     │
│          ▼                   ▼                                           │
│   ┌─────────────┐     ┌─────────────┐                                   │
│   │ Validation  │     │    HTTP     │                                   │
│   │   Layer     │     │   Request   │                                   │
│   └──────┬──────┘     └──────┬──────┘                                   │
│          │                   │                                           │
│          └─────────┬─────────┘                                           │
│                    │                                                     │
│                    │ 5. Apply Authentication                             │
│                    ▼                                                     │
│             ┌─────────────┐                                              │
│             │    Auth     │                                              │
│             │  Provider   │                                              │
│             └──────┬──────┘                                              │
│                    │                                                     │
│                    │ 6. Execute with Resilience                          │
│                    ▼                                                     │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    Resilience Orchestrator                       │   │
│   │  ┌────────────┐   ┌────────────┐   ┌────────────┐               │   │
│   │  │Rate Limiter│──▶│   Retry    │──▶│  Circuit   │               │   │
│   │  │   Check    │   │  Wrapper   │   │  Breaker   │               │   │
│   │  └────────────┘   └────────────┘   └────────────┘               │   │
│   └────────────────────────┬────────────────────────────────────────┘   │
│                            │                                             │
│                            │ 7. Send Request                             │
│                            ▼                                             │
│                     ┌─────────────┐                                      │
│                     │    HTTP     │                                      │
│                     │  Transport  │                                      │
│                     └──────┬──────┘                                      │
│                            │                                             │
│                            │ 8. Network I/O                              │
│                            ▼                                             │
│                     ┌─────────────┐                                      │
│                     │   Cohere    │                                      │
│                     │    API      │                                      │
│                     └──────┬──────┘                                      │
│                            │                                             │
│                            │ 9. Response                                 │
│                            ▼                                             │
│                     ┌─────────────┐                                      │
│                     │  Response   │                                      │
│                     │  Handler    │                                      │
│                     └──────┬──────┘                                      │
│                            │                                             │
│                            │ 10. Parse & Return                          │
│                            ▼                                             │
│                       Typed Response                                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Request Flow States

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        REQUEST STATE MACHINE                             │
│                                                                          │
│    ┌──────────┐                                                         │
│    │  Created │                                                         │
│    └────┬─────┘                                                         │
│         │                                                                │
│         ▼                                                                │
│    ┌──────────┐     validation error    ┌──────────┐                    │
│    │Validating│─────────────────────────▶│  Failed  │                    │
│    └────┬─────┘                          └──────────┘                    │
│         │                                     ▲                          │
│         │ valid                               │                          │
│         ▼                                     │                          │
│    ┌──────────┐     rate limited             │                          │
│    │ Rate     │──────────────────────────────┤                          │
│    │ Checking │                              │                          │
│    └────┬─────┘                              │                          │
│         │                                     │                          │
│         │ permitted                           │                          │
│         ▼                                     │                          │
│    ┌──────────┐     circuit open             │                          │
│    │ Circuit  │──────────────────────────────┤                          │
│    │ Checking │                              │                          │
│    └────┬─────┘                              │                          │
│         │                                     │                          │
│         │ allowed                             │                          │
│         ▼                                     │                          │
│    ┌──────────┐                              │                          │
│    │Executing │                              │                          │
│    └────┬─────┘                              │                          │
│         │                                     │                          │
│    ┌────┴────┐                               │                          │
│    │         │                               │                          │
│    ▼         ▼                               │                          │
│ success   failure                            │                          │
│    │         │                               │                          │
│    │    ┌────┴────┐                          │                          │
│    │    │         │                          │                          │
│    │    ▼         ▼                          │                          │
│    │ retryable  non-retryable                │                          │
│    │    │              │                     │                          │
│    │    │              └─────────────────────┤                          │
│    │    │                                    │                          │
│    │    │ retry < max                        │                          │
│    │    ├────────────────┐                   │                          │
│    │    │                │                   │                          │
│    │    │                ▼                   │                          │
│    │    │          ┌──────────┐              │                          │
│    │    │          │ Waiting  │              │                          │
│    │    │          │ (backoff)│              │                          │
│    │    │          └────┬─────┘              │                          │
│    │    │               │                    │                          │
│    │    │               └───▶ Executing      │                          │
│    │    │                                    │                          │
│    │    │ retry >= max                       │                          │
│    │    └────────────────────────────────────┘                          │
│    │                                                                     │
│    ▼                                                                     │
│ ┌──────────┐                                                            │
│ │Completed │                                                            │
│ └──────────┘                                                            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Data Transformation Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DATA TRANSFORMATION PIPELINE                          │
│                                                                          │
│  User-Facing Types           Internal Types           Wire Format        │
│                                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐      │
│  │   ChatRequest   │───▶│ ChatRequestBody │───▶│   JSON Bytes    │      │
│  │                 │    │                 │    │                 │      │
│  │ • message       │    │ • message       │    │ {"message":...} │      │
│  │ • model?        │    │ • model         │    │                 │      │
│  │ • temperature?  │    │ • temperature   │    │                 │      │
│  │ • tools?        │    │ • tools         │    │                 │      │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘      │
│                                                                          │
│         ▲                                              │                 │
│         │                                              │                 │
│         │ Type Conversion                              │ HTTP Request    │
│         │                                              ▼                 │
│                                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐      │
│  │  ChatResponse   │◀───│ChatResponseBody │◀───│   JSON Bytes    │      │
│  │                 │    │                 │    │                 │      │
│  │ • text          │    │ • text          │    │ {"text":...}    │      │
│  │ • citations     │    │ • citations     │    │                 │      │
│  │ • tool_calls    │    │ • tool_calls    │    │                 │      │
│  │ • meta          │    │ • meta          │    │                 │      │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘      │
│                                                                          │
│  Validation:            Serialization:         Transport:                │
│  • Required fields      • serde traits         • HTTP client             │
│  • Value ranges         • Custom serializers   • TLS encryption          │
│  • Type correctness     • Field renaming       • Compression             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Request/Response Pipeline

### 9.1 Request Pipeline Detail

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      REQUEST PIPELINE DETAIL                             │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                         SERVICE LAYER                            │    │
│  │                                                                  │    │
│  │  Input: ChatRequest { message: "Hello", model: Some("cmd-r") }  │    │
│  │                                                                  │    │
│  │  1. Validate Request                                             │    │
│  │     ├─ Check required fields (message non-empty)                 │    │
│  │     ├─ Validate ranges (temperature 0-1)                         │    │
│  │     └─ Validate tool definitions                                 │    │
│  │                                                                  │    │
│  │  2. Apply Defaults                                               │    │
│  │     ├─ model = model.unwrap_or("command-r-plus")                 │    │
│  │     └─ temperature = temperature.unwrap_or(0.3)                  │    │
│  │                                                                  │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                        │
│                                 ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                       REQUEST BUILDER                            │    │
│  │                                                                  │    │
│  │  3. Build Request Body                                           │    │
│  │     ChatRequestBody {                                            │    │
│  │       message: "Hello",                                          │    │
│  │       model: "command-r-plus",                                   │    │
│  │       temperature: 0.3,                                          │    │
│  │       stream: false,                                             │    │
│  │     }                                                            │    │
│  │                                                                  │    │
│  │  4. Serialize to JSON                                            │    │
│  │     serde_json::to_vec(&body)                                    │    │
│  │                                                                  │    │
│  │  5. Build HTTP Request                                           │    │
│  │     HttpRequest {                                                │    │
│  │       method: POST,                                              │    │
│  │       url: "https://api.cohere.ai/v1/chat",                      │    │
│  │       headers: {                                                 │    │
│  │         "Content-Type": "application/json",                      │    │
│  │         "Accept": "application/json",                            │    │
│  │       },                                                         │    │
│  │       body: json_bytes,                                          │    │
│  │     }                                                            │    │
│  │                                                                  │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                        │
│                                 ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                       AUTH PROVIDER                              │    │
│  │                                                                  │    │
│  │  6. Add Authentication                                           │    │
│  │     request.headers.insert(                                      │    │
│  │       "Authorization",                                           │    │
│  │       format!("Bearer {}", api_key.expose_secret())              │    │
│  │     )                                                            │    │
│  │                                                                  │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                        │
│                                 ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                   RESILIENCE ORCHESTRATOR                        │    │
│  │                                                                  │    │
│  │  7. Check Rate Limit                                             │    │
│  │     rate_limiter.acquire(Priority::Normal).await                 │    │
│  │                                                                  │    │
│  │  8. Check Circuit Breaker                                        │    │
│  │     circuit_breaker.is_call_permitted()                          │    │
│  │                                                                  │    │
│  │  9. Execute with Retry                                           │    │
│  │     retry_executor.execute(                                      │    │
│  │       || transport.send(request),                                │    │
│  │       |e| should_retry(e)                                        │    │
│  │     ).await                                                      │    │
│  │                                                                  │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                        │
│                                 ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                       HTTP TRANSPORT                             │    │
│  │                                                                  │    │
│  │  10. Send Request                                                │    │
│  │      client.execute(request).await                               │    │
│  │                                                                  │    │
│  │  11. Receive Response                                            │    │
│  │      HttpResponse {                                              │    │
│  │        status: 200,                                              │    │
│  │        headers: { ... },                                         │    │
│  │        body: response_bytes,                                     │    │
│  │      }                                                           │    │
│  │                                                                  │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Response Pipeline Detail

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      RESPONSE PIPELINE DETAIL                            │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      RESPONSE HANDLER                            │    │
│  │                                                                  │    │
│  │  Input: HttpResponse { status: 200, body: bytes }               │    │
│  │                                                                  │    │
│  │  1. Check Status Code                                            │    │
│  │     match status {                                               │    │
│  │       200..=299 => parse_success(body),                          │    │
│  │       400 => parse_error(BadRequest),                            │    │
│  │       401 => parse_error(Authentication),                        │    │
│  │       429 => parse_error(RateLimited),                           │    │
│  │       500..=599 => parse_error(ServerError),                     │    │
│  │     }                                                            │    │
│  │                                                                  │    │
│  │  2. Parse JSON Body                                              │    │
│  │     serde_json::from_slice::<ChatResponseBody>(&body)            │    │
│  │                                                                  │    │
│  │  3. Validate Response                                            │    │
│  │     ├─ Check required fields present                             │    │
│  │     └─ Validate field types                                      │    │
│  │                                                                  │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                        │
│                                 ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      TYPE CONVERSION                             │    │
│  │                                                                  │    │
│  │  4. Convert to User-Facing Type                                  │    │
│  │     ChatResponse {                                               │    │
│  │       text: body.text,                                           │    │
│  │       generation_id: body.generation_id,                         │    │
│  │       citations: body.citations.map(|c| c.into()),               │    │
│  │       tool_calls: body.tool_calls.map(|tc| tc.into()),           │    │
│  │       meta: ChatResponseMeta {                                   │    │
│  │         tokens: body.meta.tokens.into(),                         │    │
│  │         billed_units: body.meta.billed_units.into(),             │    │
│  │       },                                                         │    │
│  │       finish_reason: body.finish_reason.parse(),                 │    │
│  │     }                                                            │    │
│  │                                                                  │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                        │
│                                 ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                       OBSERVABILITY                              │    │
│  │                                                                  │    │
│  │  5. Record Metrics                                               │    │
│  │     metrics.record_tokens(input, output)                         │    │
│  │     metrics.record_latency(duration)                             │    │
│  │                                                                  │    │
│  │  6. Complete Span                                                │    │
│  │     span.set_attribute("response.tokens", total_tokens)          │    │
│  │     span.end()                                                   │    │
│  │                                                                  │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                        │
│                                 ▼                                        │
│                         Ok(ChatResponse)                                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Streaming Architecture

### 10.1 Streaming Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      STREAMING DATA FLOW                                 │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    COHERE API (SSE)                              │    │
│  │                                                                  │    │
│  │  event: stream-start                                             │    │
│  │  data: {"generation_id":"abc123"}                                │    │
│  │                                                                  │    │
│  │  event: text-generation                                          │    │
│  │  data: {"text":"Hello"}                                          │    │
│  │                                                                  │    │
│  │  event: text-generation                                          │    │
│  │  data: {"text":" world"}                                         │    │
│  │                                                                  │    │
│  │  event: citation-generation                                      │    │
│  │  data: {"citations":[...]}                                       │    │
│  │                                                                  │    │
│  │  event: stream-end                                               │    │
│  │  data: {"finish_reason":"COMPLETE","response":{...}}             │    │
│  │                                                                  │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                        │
│                                 │ Chunked HTTP Response                  │
│                                 ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      HTTP TRANSPORT                              │    │
│  │                                                                  │    │
│  │  response.bytes_stream() -> ByteStream                           │    │
│  │                                                                  │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                        │
│                                 │ Bytes chunks                           │
│                                 ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                       SSE PARSER                                 │    │
│  │                                                                  │    │
│  │  Buffer: "event: text-generation\ndata: {\"text\":\"Hello\"}"   │    │
│  │                                                                  │    │
│  │  1. Accumulate bytes until "\n\n" (event boundary)               │    │
│  │  2. Parse event type from "event:" line                          │    │
│  │  3. Parse data from "data:" line                                 │    │
│  │  4. Yield SSEEvent { event_type, data }                          │    │
│  │                                                                  │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                        │
│                                 │ SSEEvent                               │
│                                 ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    EVENT TYPE MAPPER                             │    │
│  │                                                                  │    │
│  │  match event_type {                                              │    │
│  │    "stream-start" => CohereStreamEvent::StreamStart,             │    │
│  │    "text-generation" => CohereStreamEvent::TextGeneration,       │    │
│  │    "citation-generation" => CohereStreamEvent::CitationGeneration│    │
│  │    "tool-calls-generation" => CohereStreamEvent::ToolCalls,      │    │
│  │    "stream-end" => CohereStreamEvent::StreamEnd,                 │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                        │
│                                 │ CohereStreamEvent                      │
│                                 ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      USER CODE                                   │    │
│  │                                                                  │    │
│  │  let stream = client.chat().chat_stream(request).await?;         │    │
│  │                                                                  │    │
│  │  while let Some(event) = stream.next().await {                   │    │
│  │    match event? {                                                │    │
│  │      TextGeneration { text } => print!("{}", text),              │    │
│  │      CitationGeneration { citations } => save(citations),        │    │
│  │      StreamEnd { response } => return Ok(response),              │    │
│  │    }                                                             │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Stream Event Types

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       STREAM EVENT TYPES                                 │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  CohereStreamEvent                                               │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │                                                                  │    │
│  │  StreamStart                                                     │    │
│  │  ├─ generation_id: String                                        │    │
│  │  │                                                               │    │
│  │  TextGeneration                                                  │    │
│  │  ├─ text: String                                                 │    │
│  │  ├─ is_finished: bool                                            │    │
│  │  │                                                               │    │
│  │  CitationGeneration                                              │    │
│  │  ├─ citations: Vec<Citation>                                     │    │
│  │  │                                                               │    │
│  │  SearchQueriesGeneration                                         │    │
│  │  ├─ search_queries: Vec<SearchQuery>                             │    │
│  │  │                                                               │    │
│  │  SearchResultsGeneration                                         │    │
│  │  ├─ search_results: Vec<SearchResult>                            │    │
│  │  │                                                               │    │
│  │  ToolCallsGeneration                                             │    │
│  │  ├─ tool_calls: Vec<ToolCall>                                    │    │
│  │  │                                                               │    │
│  │  StreamEnd                                                       │    │
│  │  ├─ finish_reason: FinishReason                                  │    │
│  │  ├─ response: ChatResponse                                       │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Event Sequence (Chat):                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐             │
│  │ Stream   │──▶│  Text    │──▶│  Text    │──▶│ Stream   │             │
│  │ Start    │   │   Gen    │   │   Gen    │   │  End     │             │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘             │
│                                                                          │
│  Event Sequence (RAG):                                                   │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌────────┐│
│  │ Stream   │──▶│ Search   │──▶│ Search   │──▶│  Text    │──▶│Citation││
│  │ Start    │   │ Queries  │   │ Results  │   │   Gen    │   │  Gen   ││
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘   └────┬───┘│
│                                                                    │    │
│                                               ┌──────────┐◀────────┘    │
│                                               │ Stream   │              │
│                                               │  End     │              │
│                                               └──────────┘              │
│                                                                          │
│  Event Sequence (Tool Use):                                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                             │
│  │ Stream   │──▶│  Tool    │──▶│ Stream   │                             │
│  │ Start    │   │  Calls   │   │  End     │                             │
│  └──────────┘   └──────────┘   └──────────┘                             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 10.3 Stream Collection Pattern

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    STREAM COLLECTION PATTERN                             │
│                                                                          │
│  Purpose: Collect streaming events into a complete response              │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     StreamCollector                              │    │
│  │                                                                  │    │
│  │  struct StreamCollector {                                        │    │
│  │    text_buffer: StringBuilder,                                   │    │
│  │    citations: Vec<Citation>,                                     │    │
│  │    tool_calls: Vec<ToolCall>,                                    │    │
│  │    search_results: Vec<SearchResult>,                            │    │
│  │    final_response: Option<ChatResponse>,                         │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  impl StreamCollector {                                          │    │
│  │    async fn collect(stream: EventStream) -> CollectedResponse {  │    │
│  │      while let Some(event) = stream.next().await {               │    │
│  │        match event? {                                            │    │
│  │          TextGeneration { text, .. } =>                          │    │
│  │            self.text_buffer.push_str(&text),                     │    │
│  │          CitationGeneration { citations } =>                     │    │
│  │            self.citations.extend(citations),                     │    │
│  │          ToolCallsGeneration { tool_calls } =>                   │    │
│  │            self.tool_calls.extend(tool_calls),                   │    │
│  │          SearchResultsGeneration { search_results } =>           │    │
│  │            self.search_results.extend(search_results),           │    │
│  │          StreamEnd { response, .. } =>                           │    │
│  │            self.final_response = Some(response),                 │    │
│  │        }                                                         │    │
│  │      }                                                           │    │
│  │      self.build_response()                                       │    │
│  │    }                                                             │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Usage:                                                                  │
│                                                                          │
│  // Streaming with real-time handling                                    │
│  let stream = client.chat().chat_stream(request).await?;                 │
│  while let Some(event) = stream.next().await {                           │
│    if let TextGeneration { text } = event? {                             │
│      print!("{}", text);                                                 │
│    }                                                                     │
│  }                                                                       │
│                                                                          │
│  // Collect into single response                                         │
│  let stream = client.chat().chat_stream(request).await?;                 │
│  let response = StreamCollector::new().collect(stream).await?;           │
│  println!("Full text: {}", response.text);                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 11. State Management

### 11.1 Client State

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLIENT STATE                                     │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      CohereClient                                │    │
│  │                                                                  │    │
│  │  Immutable State:                                                │    │
│  │  ├─ config: Arc<CohereConfig>                                    │    │
│  │  │   └─ Configuration cannot change after initialization         │    │
│  │  │                                                               │    │
│  │  ├─ transport: Arc<dyn HttpTransport>                            │    │
│  │  │   └─ Shared across all services                               │    │
│  │  │                                                               │    │
│  │  ├─ auth: Arc<dyn AuthProvider>                                  │    │
│  │  │   └─ Single auth strategy                                     │    │
│  │  │                                                               │    │
│  │  Interior Mutable State:                                         │    │
│  │  ├─ resilience: Arc<ResilienceOrchestrator>                      │    │
│  │  │   └─ Contains mutable circuit breaker and rate limiter state  │    │
│  │  │                                                               │    │
│  │  ├─ services: OnceCell<ServiceCache>                             │    │
│  │  │   └─ Lazy initialization of services                          │    │
│  │  │                                                               │    │
│  │  Observable State:                                               │    │
│  │  ├─ metrics: Arc<MetricsRecorder>                                │    │
│  │  │   └─ Metric counters and histograms                           │    │
│  │  │                                                               │    │
│  │  └─ tracer: Arc<Tracer>                                          │    │
│  │      └─ Active spans (thread-local)                              │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Thread Safety:                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  • CohereClient: Send + Sync                                      │   │
│  │  • Can be shared across threads via Arc<CohereClient>             │   │
│  │  • All internal state protected by Arc or atomics                 │   │
│  │  • No explicit locking required by users                          │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Resilience State

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       RESILIENCE STATE                                   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Circuit Breaker State                         │    │
│  │                                                                  │    │
│  │  States:                                                         │    │
│  │  ┌────────┐     failure >= threshold      ┌────────┐            │    │
│  │  │ CLOSED │──────────────────────────────▶│  OPEN  │            │    │
│  │  └────────┘                               └───┬────┘            │    │
│  │      ▲                                        │                  │    │
│  │      │ success >= threshold                   │ timeout          │    │
│  │      │                                        ▼                  │    │
│  │  ┌───┴────────┐◀─────────────────────────┌────────────┐         │    │
│  │  │ HALF-OPEN  │                          │ HALF-OPEN  │         │    │
│  │  └────────────┘         success          └────────────┘         │    │
│  │      │                                        │                  │    │
│  │      │ failure                                │                  │    │
│  │      └───────────────────▶ OPEN ◀────────────┘                  │    │
│  │                                                                  │    │
│  │  State Variables:                                                │    │
│  │  • state: AtomicU8 (Closed=0, Open=1, HalfOpen=2)               │    │
│  │  • failure_count: AtomicU32                                      │    │
│  │  • success_count: AtomicU32                                      │    │
│  │  • last_failure_time: AtomicU64 (timestamp)                      │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Rate Limiter State                            │    │
│  │                                                                  │    │
│  │  Token Bucket:                                                   │    │
│  │  • tokens: AtomicU32                                             │    │
│  │  • last_refill: AtomicU64 (timestamp)                            │    │
│  │  • capacity: u32                                                 │    │
│  │  • refill_rate: u32 (tokens per second)                          │    │
│  │                                                                  │    │
│  │  Sliding Window:                                                 │    │
│  │  • window_requests: Mutex<VecDeque<Instant>>                     │    │
│  │  • window_size: Duration                                         │    │
│  │  • max_requests: u32                                             │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      Retry State                                 │    │
│  │                                                                  │    │
│  │  Per-Request (not shared):                                       │    │
│  │  • attempt: u32                                                  │    │
│  │  • last_error: Option<Error>                                     │    │
│  │  • next_delay: Duration                                          │    │
│  │                                                                  │    │
│  │  Global (for statistics):                                        │    │
│  │  • total_retries: AtomicU64                                      │    │
│  │  • successful_retries: AtomicU64                                 │    │
│  │  • exhausted_retries: AtomicU64                                  │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Concurrency Patterns

### 12.1 Async Runtime Integration

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ASYNC RUNTIME INTEGRATION                             │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Rust (Tokio)                                  │    │
│  │                                                                  │    │
│  │  // Client operations are async                                  │    │
│  │  async fn chat(&self, req: ChatRequest) -> Result<ChatResponse>  │    │
│  │                                                                  │    │
│  │  // Streaming returns async iterator                             │    │
│  │  async fn chat_stream(&self, req: ChatRequest)                   │    │
│  │    -> Result<impl Stream<Item = Result<Event>>>                  │    │
│  │                                                                  │    │
│  │  // Internal concurrency primitives                              │    │
│  │  tokio::sync::Semaphore      // Concurrent request limiting      │    │
│  │  tokio::sync::RwLock         // Config access                    │    │
│  │  tokio::time::sleep          // Retry backoff                    │    │
│  │  tokio::time::timeout        // Request timeout                  │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                   TypeScript (Promises)                          │    │
│  │                                                                  │    │
│  │  // Client operations return Promises                            │    │
│  │  async chat(req: ChatRequest): Promise<ChatResponse>             │    │
│  │                                                                  │    │
│  │  // Streaming returns AsyncIterable                              │    │
│  │  async *chatStream(req: ChatRequest):                            │    │
│  │    AsyncIterable<CohereStreamEvent>                              │    │
│  │                                                                  │    │
│  │  // Internal patterns                                            │    │
│  │  Promise.race()              // Timeout implementation           │    │
│  │  AbortController             // Request cancellation             │    │
│  │  AsyncIterator               // Stream processing                │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Concurrent Request Patterns

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   CONCURRENT REQUEST PATTERNS                            │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │              Pattern 1: Parallel Independent Requests            │    │
│  │                                                                  │    │
│  │  // Rust                                                         │    │
│  │  let (chat_result, embed_result) = tokio::join!(                 │    │
│  │    client.chat().chat(chat_req),                                 │    │
│  │    client.embed().embed(embed_req),                              │    │
│  │  );                                                              │    │
│  │                                                                  │    │
│  │  // TypeScript                                                   │    │
│  │  const [chatResult, embedResult] = await Promise.all([           │    │
│  │    client.chat().chat(chatReq),                                  │    │
│  │    client.embed().embed(embedReq),                               │    │
│  │  ]);                                                             │    │
│  │                                                                  │    │
│  │  ┌──────────┐  ┌──────────┐                                     │    │
│  │  │   Chat   │  │  Embed   │    Parallel Execution                │    │
│  │  │ Request  │  │ Request  │                                      │    │
│  │  └────┬─────┘  └────┬─────┘                                     │    │
│  │       │             │                                            │    │
│  │       ▼             ▼                                            │    │
│  │  ┌──────────────────────┐                                        │    │
│  │  │   Shared Transport   │                                        │    │
│  │  │   (Connection Pool)  │                                        │    │
│  │  └──────────────────────┘                                        │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │              Pattern 2: Bounded Parallel Processing              │    │
│  │                                                                  │    │
│  │  // Process many embeddings with concurrency limit               │    │
│  │                                                                  │    │
│  │  // Rust (using buffer_unordered)                                │    │
│  │  let results = futures::stream::iter(texts.chunks(96))           │    │
│  │    .map(|batch| client.embed().embed_texts(batch.to_vec()))      │    │
│  │    .buffer_unordered(10)  // Max 10 concurrent requests          │    │
│  │    .collect::<Vec<_>>()                                          │    │
│  │    .await;                                                       │    │
│  │                                                                  │    │
│  │  // TypeScript (using p-limit)                                   │    │
│  │  const limit = pLimit(10);                                       │    │
│  │  const results = await Promise.all(                              │    │
│  │    chunks.map(batch => limit(() =>                               │    │
│  │      client.embed().embedTexts(batch)                            │    │
│  │    ))                                                            │    │
│  │  );                                                              │    │
│  │                                                                  │    │
│  │       ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                           │    │
│  │       │ B1  │ │ B2  │ │ B3  │ │ B4  │  Batches                   │    │
│  │       └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘                           │    │
│  │          │      │      │      │                                  │    │
│  │          ▼      ▼      │      │                                  │    │
│  │       ┌─────────────┐  │      │    Semaphore(10)                 │    │
│  │       │ Processing  │◀─┘      │                                  │    │
│  │       │ (max 10)    │◀────────┘                                  │    │
│  │       └─────────────┘                                            │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │              Pattern 3: Streaming with Backpressure              │    │
│  │                                                                  │    │
│  │  // Consumer controls pace of stream processing                  │    │
│  │                                                                  │    │
│  │  let stream = client.chat().chat_stream(request).await?;         │    │
│  │                                                                  │    │
│  │  // Process with backpressure                                    │    │
│  │  while let Some(event) = stream.next().await {                   │    │
│  │    let text = match event? {                                     │    │
│  │      TextGeneration { text, .. } => text,                        │    │
│  │      _ => continue,                                              │    │
│  │    };                                                            │    │
│  │                                                                  │    │
│  │    // Slow consumer - stream waits                               │    │
│  │    expensive_processing(text).await;                             │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  Server ──▶ Buffer ──▶ Consumer                                  │    │
│  │                │                                                 │    │
│  │                │ Backpressure signal                             │    │
│  │                │ (TCP flow control)                              │    │
│  │                ▼                                                 │    │
│  │          Slower delivery                                         │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 12.3 Thread Safety Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      THREAD SAFETY MODEL                                 │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Ownership Model                               │    │
│  │                                                                  │    │
│  │  // Client can be shared across threads                          │    │
│  │  let client = Arc::new(CohereClient::new(config)?);              │    │
│  │                                                                  │    │
│  │  // Clone Arc for each task                                      │    │
│  │  let client1 = client.clone();                                   │    │
│  │  let client2 = client.clone();                                   │    │
│  │                                                                  │    │
│  │  let handle1 = tokio::spawn(async move {                         │    │
│  │    client1.chat().chat(req1).await                               │    │
│  │  });                                                             │    │
│  │                                                                  │    │
│  │  let handle2 = tokio::spawn(async move {                         │    │
│  │    client2.embed().embed(req2).await                             │    │
│  │  });                                                             │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                 Shared State Synchronization                     │    │
│  │                                                                  │    │
│  │  Component              Synchronization           Access Pattern │    │
│  │  ─────────────────────────────────────────────────────────────  │    │
│  │  Config                 Arc (immutable)           Read-only      │    │
│  │  Transport              Arc (internal sync)       Concurrent     │    │
│  │  Circuit Breaker        Atomic operations         Lock-free      │    │
│  │  Rate Limiter           Atomic + Mutex            Hybrid         │    │
│  │  Metrics                Atomic counters           Lock-free      │    │
│  │  Service Cache          OnceCell                  Init once      │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Rust Send + Sync Bounds                       │    │
│  │                                                                  │    │
│  │  // CohereClient is Send + Sync                                  │    │
│  │  impl Send for CohereClient {}                                   │    │
│  │  impl Sync for CohereClient {}                                   │    │
│  │                                                                  │    │
│  │  // Services are Send + Sync (reference client)                  │    │
│  │  impl<'a> Send for ChatService<'a> {}                            │    │
│  │  impl<'a> Sync for ChatService<'a> {}                            │    │
│  │                                                                  │    │
│  │  // EventStream is Send (can be moved between threads)           │    │
│  │  impl Send for EventStream {}                                    │    │
│  │  // EventStream is NOT Sync (single consumer)                    │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Error Propagation

### 13.1 Error Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          ERROR FLOW                                      │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Error Origin Points                           │    │
│  │                                                                  │    │
│  │  User Input                                                      │    │
│  │     │                                                            │    │
│  │     ▼                                                            │    │
│  │  ┌──────────────┐                                                │    │
│  │  │  Validation  │──▶ ValidationError                             │    │
│  │  │    Layer     │    (missing field, invalid range)              │    │
│  │  └──────────────┘                                                │    │
│  │         │                                                        │    │
│  │         ▼                                                        │    │
│  │  ┌──────────────┐                                                │    │
│  │  │     Auth     │──▶ AuthenticationError                         │    │
│  │  │   Provider   │    (missing key, invalid format)               │    │
│  │  └──────────────┘                                                │    │
│  │         │                                                        │    │
│  │         ▼                                                        │    │
│  │  ┌──────────────┐                                                │    │
│  │  │ Rate Limiter │──▶ RateLimitError                              │    │
│  │  │              │    (quota exceeded)                            │    │
│  │  └──────────────┘                                                │    │
│  │         │                                                        │    │
│  │         ▼                                                        │    │
│  │  ┌──────────────┐                                                │    │
│  │  │   Circuit    │──▶ CircuitOpenError                            │    │
│  │  │   Breaker    │    (service unavailable)                       │    │
│  │  └──────────────┘                                                │    │
│  │         │                                                        │    │
│  │         ▼                                                        │    │
│  │  ┌──────────────┐                                                │    │
│  │  │    HTTP      │──▶ TransportError                              │    │
│  │  │  Transport   │    (timeout, connection, TLS)                  │    │
│  │  └──────────────┘                                                │    │
│  │         │                                                        │    │
│  │         ▼                                                        │    │
│  │  ┌──────────────┐                                                │    │
│  │  │   Cohere     │──▶ ApiError                                    │    │
│  │  │     API      │    (400, 401, 429, 500)                        │    │
│  │  └──────────────┘                                                │    │
│  │         │                                                        │    │
│  │         ▼                                                        │    │
│  │  ┌──────────────┐                                                │    │
│  │  │   Response   │──▶ ParseError                                  │    │
│  │  │   Parser     │    (invalid JSON, missing fields)              │    │
│  │  └──────────────┘                                                │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 13.2 Error Transformation Chain

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ERROR TRANSFORMATION CHAIN                            │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                Transport Layer Error                             │    │
│  │                                                                  │    │
│  │  reqwest::Error                                                  │    │
│  │       │                                                          │    │
│  │       │ impl From<reqwest::Error> for TransportError             │    │
│  │       ▼                                                          │    │
│  │  TransportError::Timeout { duration }                            │    │
│  │  TransportError::Connection { message }                          │    │
│  │  TransportError::TlsError { message }                            │    │
│  │                                                                  │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                        │
│                                 │ impl From<TransportError>              │
│                                 │      for CohereError                   │
│                                 ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                   CohereError (Unified)                          │    │
│  │                                                                  │    │
│  │  CohereError::Timeout { duration }                               │    │
│  │  CohereError::Transient { message, source }                      │    │
│  │  CohereError::ConfigurationError { message }                     │    │
│  │                                                                  │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                 API Response Error                               │    │
│  │                                                                  │    │
│  │  HTTP 400 + {"message": "Invalid model"}                         │    │
│  │       │                                                          │    │
│  │       │ Response handler parsing                                 │    │
│  │       ▼                                                          │    │
│  │  CohereError::BadRequest { message: "Invalid model" }            │    │
│  │                                                                  │    │
│  │  HTTP 429 + {"message": "Rate limit"} + Retry-After: 30          │    │
│  │       │                                                          │    │
│  │       ▼                                                          │    │
│  │  CohereError::RateLimited {                                      │    │
│  │    message: "Rate limit",                                        │    │
│  │    retry_after: Some(Duration::from_secs(30))                    │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                        │
│                                 │ Error enrichment                       │
│                                 ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                  Error Context Addition                          │    │
│  │                                                                  │    │
│  │  CohereError::BadRequest { message }                             │    │
│  │       │                                                          │    │
│  │       │ .context("chat operation")                               │    │
│  │       │ .with_request_id("req-123")                              │    │
│  │       ▼                                                          │    │
│  │  CohereError::BadRequest {                                       │    │
│  │    message: "Invalid model",                                     │    │
│  │    context: Some("chat operation"),                              │    │
│  │    request_id: Some("req-123"),                                  │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 13.3 Error Recovery Patterns

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ERROR RECOVERY PATTERNS                               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │              Pattern 1: Automatic Retry                          │    │
│  │                                                                  │    │
│  │  Error occurs ──▶ Check retryable ──▶ Retry with backoff         │    │
│  │                         │                                        │    │
│  │                         ▼                                        │    │
│  │  ┌────────────────────────────────────────────────────────┐     │    │
│  │  │  Retryable Errors:                                      │     │    │
│  │  │  • RateLimited (use retry_after if present)             │     │    │
│  │  │  • ServiceUnavailable (503)                             │     │    │
│  │  │  • InternalError (500)                                  │     │    │
│  │  │  • Timeout (network level)                              │     │    │
│  │  │  • Transient (connection reset, etc.)                   │     │    │
│  │  └────────────────────────────────────────────────────────┘     │    │
│  │                                                                  │    │
│  │  ┌────────────────────────────────────────────────────────┐     │    │
│  │  │  Non-Retryable Errors:                                  │     │    │
│  │  │  • BadRequest (400)                                     │     │    │
│  │  │  • Authentication (401)                                 │     │    │
│  │  │  • PermissionDenied (403)                               │     │    │
│  │  │  • NotFound (404)                                       │     │    │
│  │  │  • ValidationError (422)                                │     │    │
│  │  └────────────────────────────────────────────────────────┘     │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │              Pattern 2: Circuit Breaker Recovery                 │    │
│  │                                                                  │    │
│  │  ┌────────┐    too many      ┌────────┐    wait    ┌──────────┐ │    │
│  │  │ Closed │───failures──────▶│  Open  │──timeout──▶│Half-Open │ │    │
│  │  └────────┘                  └────────┘            └──────────┘ │    │
│  │      ▲                                                  │       │    │
│  │      │                            success               │       │    │
│  │      └──────────────────────────────────────────────────┘       │    │
│  │                                                                  │    │
│  │  When circuit opens:                                             │    │
│  │  • Fail fast without calling API                                 │    │
│  │  • Return CohereError::ServiceUnavailable                        │    │
│  │  • Allow periodic test requests (half-open)                      │    │
│  │  • Auto-recover when service returns                             │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │              Pattern 3: Fallback Values                          │    │
│  │                                                                  │    │
│  │  // Application-level fallback                                   │    │
│  │  let response = match client.chat().chat(request).await {        │    │
│  │    Ok(response) => response,                                     │    │
│  │    Err(CohereError::ServiceUnavailable { .. }) => {              │    │
│  │      // Use cached response or default                           │    │
│  │      cached_response.unwrap_or(default_response)                 │    │
│  │    }                                                             │    │
│  │    Err(e) => return Err(e.into()),                               │    │
│  │  };                                                              │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │              Pattern 4: Graceful Degradation                     │    │
│  │                                                                  │    │
│  │  // Try primary model, fall back to simpler model                │    │
│  │  let response = client.chat().chat(ChatRequest {                 │    │
│  │    model: Some("command-r-plus"),                                │    │
│  │    ..request.clone()                                             │    │
│  │  }).await.or_else(|_| {                                          │    │
│  │    client.chat().chat(ChatRequest {                              │    │
│  │      model: Some("command-r"),  // Fallback model                │    │
│  │      ..request                                                   │    │
│  │    })                                                            │    │
│  │  }).await?;                                                      │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 13.4 Error Logging and Observability

```
┌─────────────────────────────────────────────────────────────────────────┐
│                  ERROR LOGGING AND OBSERVABILITY                         │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Error Span Attributes                         │    │
│  │                                                                  │    │
│  │  span.set_status(SpanStatus::Error);                             │    │
│  │  span.set_attribute("error.type", error.error_type());           │    │
│  │  span.set_attribute("error.message", error.message());           │    │
│  │  span.set_attribute("error.retryable", error.is_retryable());    │    │
│  │  span.set_attribute("error.status_code", error.status_code());   │    │
│  │  span.record_exception(&error);                                  │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Error Metrics                                 │    │
│  │                                                                  │    │
│  │  cohere_errors_total{                                            │    │
│  │    operation="chat",                                             │    │
│  │    error_type="rate_limited",                                    │    │
│  │    retryable="true",                                             │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  cohere_retry_attempts_total{                                    │    │
│  │    operation="chat",                                             │    │
│  │    outcome="success|exhausted",                                  │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  │  cohere_circuit_breaker_state{                                   │    │
│  │    state="closed|open|half_open",                                │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Structured Error Logs                         │    │
│  │                                                                  │    │
│  │  {                                                               │    │
│  │    "level": "error",                                             │    │
│  │    "message": "Cohere API request failed",                       │    │
│  │    "operation": "chat",                                          │    │
│  │    "error_type": "rate_limited",                                 │    │
│  │    "status_code": 429,                                           │    │
│  │    "retry_after_secs": 30,                                       │    │
│  │    "retryable": true,                                            │    │
│  │    "attempt": 2,                                                 │    │
│  │    "trace_id": "abc123",                                         │    │
│  │    "span_id": "def456",                                          │    │
│  │  }                                                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Summary

This document covers the runtime behavior architecture:

1. **Data Flow**: Request/response transformation pipeline
2. **Request Pipeline**: Step-by-step request processing
3. **Streaming**: SSE parsing and event dispatch
4. **State Management**: Client and resilience state
5. **Concurrency**: Async patterns and thread safety
6. **Error Propagation**: Error flow and recovery patterns

---

**Next Document:** `architecture-cohere-3.md` - Integration, Observability, Security, Deployment

---

*Architecture Phase: Part 2 of 3 Complete*
