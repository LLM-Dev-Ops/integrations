# Architecture: Google Gemini Integration Module - Part 2

**Data Flow, State Management, and Concurrency Patterns**
**Version:** 1.0.0
**Date:** 2025-12-09
**Status:** SPARC Phase 3

---

## Table of Contents

1. [Data Flow Architecture](#1-data-flow-architecture)
2. [Request/Response Pipeline](#2-requestresponse-pipeline)
3. [Streaming Architecture](#3-streaming-architecture)
4. [State Management](#4-state-management)
5. [Concurrency Patterns](#5-concurrency-patterns)
6. [Error Flow and Recovery](#6-error-flow-and-recovery)
7. [Resilience Patterns](#7-resilience-patterns)

---

## 1. Data Flow Architecture

### 1.1 High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW OVERVIEW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

                          User Application
                                 │
                                 │ GenerateContentRequest
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            GeminiClient                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 1. Request Validation                                                │    │
│  │    - Validate contents not empty                                     │    │
│  │    - Validate parts structure                                        │    │
│  │    - Validate generation config                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                 │                                            │
│                                 ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 2. Service Dispatch                                                  │    │
│  │    - Route to ContentService                                         │    │
│  │    - Lazy service initialization                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                 │                                            │
│                                 ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 3. Request Building                                                  │    │
│  │    - Merge with defaults                                             │    │
│  │    - Apply model resolution                                          │    │
│  │    - Build endpoint path                                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                 │                                            │
│                                 ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 4. Resilience Orchestration                                          │    │
│  │    - Check circuit breaker state                                     │    │
│  │    - Acquire rate limit token                                        │    │
│  │    - Wrap with retry logic                                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                 │                                            │
│                                 ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 5. HTTP Transport                                                    │    │
│  │    - Apply authentication                                            │    │
│  │    - Serialize body to JSON                                          │    │
│  │    - Send HTTPS request                                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                 │                                            │
└─────────────────────────────────┼────────────────────────────────────────────┘
                                  │
                                  │ HTTPS/TLS 1.2+
                                  ▼
                         ┌─────────────────┐
                         │  Gemini API     │
                         │  (Google Cloud) │
                         └────────┬────────┘
                                  │
                                  │ JSON Response
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Response Pipeline                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 6. Response Parsing                                                  │    │
│  │    - Check HTTP status                                               │    │
│  │    - Parse JSON body                                                 │    │
│  │    - Deserialize to typed response                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                 │                                            │
│                                 ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 7. Rate Limit Update                                                 │    │
│  │    - Extract rate limit headers                                      │    │
│  │    - Sync with local rate limiter                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                 │                                            │
│                                 ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 8. Safety Check                                                      │    │
│  │    - Check prompt_feedback for blocks                                │    │
│  │    - Return ContentBlockedError if blocked                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                 │                                            │
│                                 ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 9. Metrics & Logging                                                 │    │
│  │    - Record latency histogram                                        │    │
│  │    - Record token usage                                              │    │
│  │    - Log completion                                                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                 │                                            │
└─────────────────────────────────┼────────────────────────────────────────────┘
                                  │
                                  ▼
                          GenerateContentResponse
                                  │
                                  ▼
                          User Application
```

### 1.2 Request Transformation Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REQUEST TRANSFORMATION PIPELINE                           │
└─────────────────────────────────────────────────────────────────────────────┘

User Request (Domain Type)
│
│  GenerateContentRequest {
│    model: Some("gemini-1.5-pro"),
│    contents: [...],
│    generation_config: Some(GenerationConfig { temperature: 0.7, ... }),
│    safety_settings: [],
│    ...
│  }
│
├──────────────────────────────────────────────────────────────────────────────┐
│  1. Merge Defaults                                                           │
│                                                                              │
│  GenerateContentRequest {                                                    │
│    model: "gemini-1.5-pro",  // Resolved                                    │
│    contents: [...],                                                          │
│    generation_config: GenerationConfig {                                     │
│      temperature: 0.7,                                                       │
│      max_output_tokens: None,  // Default                                    │
│    },                                                                        │
│    safety_settings: [...],  // From client defaults                          │
│  }                                                                           │
└──────────────────────────────────────────────────────────────────────────────┘
│
├──────────────────────────────────────────────────────────────────────────────┐
│  2. Build HTTP Request                                                       │
│                                                                              │
│  HttpRequest {                                                               │
│    method: POST,                                                             │
│    url: "https://generativelanguage.googleapis.com/v1beta/                  │
│          models/gemini-1.5-pro:generateContent",                            │
│    headers: {                                                                │
│      "x-goog-api-key": "sk-...",                                            │
│      "Content-Type": "application/json",                                     │
│    },                                                                        │
│    body: serialized JSON,                                                    │
│  }                                                                           │
└──────────────────────────────────────────────────────────────────────────────┘
│
├──────────────────────────────────────────────────────────────────────────────┐
│  3. Serialized Request Body                                                  │
│                                                                              │
│  {                                                                           │
│    "contents": [                                                             │
│      {                                                                       │
│        "role": "user",                                                       │
│        "parts": [{ "text": "What is the capital of France?" }]              │
│      }                                                                       │
│    ],                                                                        │
│    "generationConfig": {                                                     │
│      "temperature": 0.7                                                      │
│    },                                                                        │
│    "safetySettings": [...]                                                   │
│  }                                                                           │
└──────────────────────────────────────────────────────────────────────────────┘
│
▼
Network Transmission
```

---

## 2. Request/Response Pipeline

### 2.1 Request Pipeline Stages

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        REQUEST PIPELINE STAGES                               │
└─────────────────────────────────────────────────────────────────────────────┘

Stage 1: Validation
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  fn validate_request(request: &GenerateContentRequest) -> Result<()>         │
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │ Contents Check  │───►│  Parts Check    │───►│ Config Check    │          │
│  │                 │    │                 │    │                 │          │
│  │ • Not empty     │    │ • Valid types   │    │ • temp: 0.0-2.0 │          │
│  │ • Valid roles   │    │ • No empty text │    │ • top_p: 0.0-1.0│          │
│  └─────────────────┘    └─────────────────┘    │ • top_k >= 1    │          │
│                                                 └─────────────────┘          │
│                                                                              │
│  Returns: Ok(()) or Err(ValidationError)                                     │
└──────────────────────────────────────────────────────────────────────────────┘

Stage 2: Context Building
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  fn build_request_context(operation: &str, model: &str) -> RequestContext    │
│                                                                              │
│  RequestContext {                                                            │
│    operation: "generateContent",                                             │
│    model: "gemini-1.5-pro",                                                 │
│    request_id: "req-abc123",  // Generated UUID                             │
│    attributes: { ... },                                                      │
│  }                                                                           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

Stage 3: HTTP Request Construction
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  fn build_http_request(&self, path: &str, body: &T) -> HttpRequest          │
│                                                                              │
│  1. Construct URL from base_url + api_version + path                        │
│  2. Apply authentication (x-goog-api-key header)                            │
│  3. Add standard headers (Content-Type, User-Agent)                         │
│  4. Serialize body to JSON                                                  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

Stage 4: Resilience Wrapping
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  resilience.execute(|| async { transport.send(request) }, &context)         │
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │   Circuit    │───►│ Rate Limit   │───►│    Retry     │                   │
│  │   Breaker    │    │   Check      │    │    Logic     │                   │
│  │              │    │              │    │              │                   │
│  │ state: Closed│    │ await permit │    │ max_retries=3│                   │
│  │              │    │              │    │ backoff=exp  │                   │
│  └──────────────┘    └──────────────┘    └──────────────┘                   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

Stage 5: Transport Execution
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  async fn send(&self, request: HttpRequest) -> Result<HttpResponse>         │
│                                                                              │
│  • TLS handshake (TLS 1.2+)                                                 │
│  • Connection pooling                                                        │
│  • Request serialization                                                     │
│  • Send over network                                                         │
│  • Receive response                                                          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Response Pipeline Stages

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       RESPONSE PIPELINE STAGES                               │
└─────────────────────────────────────────────────────────────────────────────┘

Stage 1: HTTP Response Reception
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  HttpResponse {                                                              │
│    status: 200 OK,                                                           │
│    headers: {                                                                │
│      "Content-Type": "application/json",                                     │
│      "x-ratelimit-remaining-requests": "59",                                │
│      "x-ratelimit-remaining-tokens": "99000",                               │
│    },                                                                        │
│    body: Bytes,                                                              │
│  }                                                                           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

Stage 2: Status Code Handling
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  fn handle_status(status: StatusCode, body: &[u8]) -> Result<()>            │
│                                                                              │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐     │
│  │  200-299    │   │  400-499    │   │  429        │   │  500-599    │     │
│  │  Success    │   │  Client Err │   │  Rate Limit │   │  Server Err │     │
│  │             │   │             │   │             │   │             │     │
│  │  Continue   │   │ Parse error │   │ Extract     │   │ Retry or    │     │
│  │  parsing    │   │ from body   │   │ retry-after │   │ fail        │     │
│  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

Stage 3: JSON Deserialization
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  fn parse_response<T: DeserializeOwned>(body: &[u8]) -> Result<T>           │
│                                                                              │
│  {                                                                           │
│    "candidates": [{                                                          │
│      "content": {                                                            │
│        "role": "model",                                                      │
│        "parts": [{ "text": "Paris is the capital of France." }]             │
│      },                                                                      │
│      "finishReason": "STOP",                                                │
│      "index": 0                                                              │
│    }],                                                                       │
│    "usageMetadata": {                                                        │
│      "promptTokenCount": 8,                                                  │
│      "candidatesTokenCount": 12,                                            │
│      "totalTokenCount": 20                                                   │
│    }                                                                         │
│  }                                                                           │
│                                        │                                     │
│                                        ▼                                     │
│  GenerateContentResponse {                                                   │
│    candidates: Vec<Candidate>,                                               │
│    prompt_feedback: Option<PromptFeedback>,                                  │
│    usage_metadata: Option<UsageMetadata>,                                    │
│  }                                                                           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

Stage 4: Safety Validation
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  fn check_safety(response: &GenerateContentResponse) -> Result<()>          │
│                                                                              │
│  IF prompt_feedback.block_reason.is_some() THEN:                            │
│    RETURN Err(ContentBlockedError {                                          │
│      reason: "SAFETY",                                                       │
│      safety_ratings: [...],                                                  │
│    })                                                                        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

Stage 5: Metrics Recording
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  fn record_metrics(response: &GenerateContentResponse, latency: Duration)   │
│                                                                              │
│  metrics.record_histogram("gemini.request.duration_ms", latency.as_millis())│
│  metrics.record_histogram("gemini.tokens.prompt", prompt_tokens)            │
│  metrics.record_histogram("gemini.tokens.completion", completion_tokens)    │
│  metrics.increment("gemini.requests.total", &[("status", "success")])       │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Streaming Architecture

### 3.1 Streaming Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STREAMING DATA FLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

User Application
│
│  generate_content_stream(request)
▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ContentService                                    │
│                                                                              │
│  1. Validate request                                                         │
│  2. Build streaming endpoint path                                            │
│  3. Build HTTP request with Accept: application/json                         │
│  4. Execute via resilience orchestrator                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
│
│  HTTP Request to /v1beta/models/{model}:streamGenerateContent
▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Gemini API (Google)                                  │
│                                                                              │
│  Returns: Chunked Transfer-Encoding with JSON array                          │
│                                                                              │
│  [{"candidates":[{"content":{"parts":[{"text":"Paris"}]}}]},               │
│  {"candidates":[{"content":{"parts":[{"text":" is"}]}}]},                  │
│  {"candidates":[{"content":{"parts":[{"text":" the"}]}}]},                 │
│  ...                                                                         │
│  {"candidates":[...],"usageMetadata":{...}}]                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
│
│  Chunked bytes
▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ChunkedJsonParser                                    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Buffer: "[{\"candidates\":[{\"content...\"Paris\"}]}}]},\n"           │ │
│  │                                                                        │ │
│  │ 1. Skip array opening bracket '['                                      │ │
│  │ 2. Find complete JSON object { ... }                                   │ │
│  │ 3. Parse to GenerateContentChunk                                       │ │
│  │ 4. Skip comma/newline separator                                        │ │
│  │ 5. Repeat until ']' or EOF                                             │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
│
│  Stream<Result<GenerateContentChunk, GeminiError>>
▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       User Application                                       │
│                                                                              │
│  while let Some(chunk) = stream.next().await {                              │
│      let chunk = chunk?;                                                     │
│      if let Some(text) = chunk.candidates[0].content.parts[0].text {        │
│          print!("{}", text);                                                 │
│      }                                                                       │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Chunked JSON Parser State Machine

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CHUNKED JSON PARSER STATE MACHINE                         │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌──────────────────────┐
                         │    INITIAL STATE     │
                         │   started: false     │
                         │   finished: false    │
                         │   buffer: ""         │
                         └──────────┬───────────┘
                                    │
                                    │ receive bytes
                                    ▼
                         ┌──────────────────────┐
                         │   WAIT FOR ARRAY     │
                         │   Look for '['       │
                         └──────────┬───────────┘
                                    │
                                    │ found '['
                                    │ started = true
                                    ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │                                                                       │
    │  ┌─────────────────────────────────────────────────────────────────┐  │
    │  │                    PARSE OBJECTS LOOP                            │  │
    │  │                                                                  │  │
    │  │  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │  │
    │  │  │ Skip whitespace│───►│Extract object│───►│Parse JSON    │    │  │
    │  │  │ and commas    │    │ { ... }      │    │ to Chunk     │    │  │
    │  │  └──────────────┘     └──────────────┘     └──────────────┘    │  │
    │  │         ▲                                         │             │  │
    │  │         │                                         │             │  │
    │  │         └──────── yield Ok(chunk) ────────────────┘             │  │
    │  │                                                                  │  │
    │  └─────────────────────────────────────────────────────────────────┘  │
    │                                                                       │
    └───────────────────────────────┬───────────────────────────────────────┘
                                    │
                                    │ found ']'
                                    │ finished = true
                                    ▼
                         ┌──────────────────────┐
                         │   FINISHED STATE     │
                         │   Return None        │
                         └──────────────────────┘


JSON Object Extraction Algorithm:
─────────────────────────────────

fn extract_json_object(input: &str) -> Option<(&str, &str)>:
    IF NOT input.starts_with('{') THEN RETURN None

    LET depth = 0
    LET in_string = false
    LET escape_next = false

    FOR (i, ch) IN input.char_indices():
        IF escape_next THEN:
            escape_next = false
            CONTINUE

        MATCH ch:
            '\\' => IF in_string THEN escape_next = true
            '"'  => in_string = NOT in_string
            '{'  => IF NOT in_string THEN depth += 1
            '}'  => IF NOT in_string THEN:
                depth -= 1
                IF depth == 0 THEN:
                    RETURN Some((&input[..=i], &input[i+1..]))

    RETURN None  // Incomplete object
```

### 3.3 Streaming vs Non-Streaming Comparison

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STREAMING VS NON-STREAMING                                │
└─────────────────────────────────────────────────────────────────────────────┘

Non-Streaming Request:
─────────────────────
                  Request
User ─────────────────────────────────────────────────────────────►  API
      ◄────────────────────────────────────────────────────────────
                  Complete Response (wait for all tokens)

Timeline:  |-------- latency (high) --------|
           Request                           Response

Streaming Request:
─────────────────
                  Request
User ─────────────────────────────────────────────────────────────►  API
      ◄─ chunk 1 ◄─ chunk 2 ◄─ chunk 3 ◄─ ... ◄─ final chunk ─────
                  Progressive Response

Timeline:  |-- time to first token (low) --|
           Request  Chunk1  Chunk2  Chunk3 ... ChunkN

Memory Comparison:
─────────────────

Non-Streaming:
┌─────────────────────────────────────────────────────────────────┐
│  Memory: O(n) where n = total response size                     │
│  Must buffer entire response before returning                   │
└─────────────────────────────────────────────────────────────────┘

Streaming:
┌─────────────────────────────────────────────────────────────────┐
│  Memory: O(1) per chunk                                          │
│  Process and discard each chunk immediately                      │
│  Buffer only for incomplete JSON object boundaries               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. State Management

### 4.1 Client State

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CLIENT STATE                                        │
└─────────────────────────────────────────────────────────────────────────────┘

GeminiClient State:
───────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  GeminiClient {                                                              │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────────┐  │
│    │ Immutable Configuration (set at construction)                        │  │
│    │                                                                      │  │
│    │  config: GeminiConfig {                                              │  │
│    │    base_url: Url,                                                    │  │
│    │    api_version: String,                                              │  │
│    │    timeout: Duration,                                                │  │
│    │    retry_config: RetryConfig,                                        │  │
│    │    circuit_breaker_config: CircuitBreakerConfig,                     │  │
│    │    rate_limit_config: RateLimitConfig,                               │  │
│    │  }                                                                   │  │
│    └─────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────────┐  │
│    │ Shared Infrastructure (Arc for thread-safety)                        │  │
│    │                                                                      │  │
│    │  transport: Arc<dyn HttpTransport>                                   │  │
│    │  auth_manager: Arc<dyn AuthProvider>                                 │  │
│    │  resilience: Arc<ResilienceOrchestrator>                            │  │
│    │  logger: Arc<dyn Logger>                                             │  │
│    │  tracer: Arc<dyn Tracer>                                             │  │
│    │  metrics: Arc<dyn MetricsRecorder>                                   │  │
│    └─────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────────┐  │
│    │ Lazy-Initialized Services (OnceCell)                                 │  │
│    │                                                                      │  │
│    │  content_service: OnceCell<ContentService>                           │  │
│    │  embeddings_service: OnceCell<EmbeddingsService>                     │  │
│    │  models_service: OnceCell<ModelsService>                             │  │
│    │  files_service: OnceCell<FilesService>                               │  │
│    │  cached_content_service: OnceCell<CachedContentService>              │  │
│    └─────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Resilience State

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RESILIENCE STATE                                      │
└─────────────────────────────────────────────────────────────────────────────┘

ResilienceOrchestrator State:
────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  ResilienceOrchestrator {                                                    │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────────┐  │
│    │ Circuit Breaker State                                                │  │
│    │                                                                      │  │
│    │  state: AtomicState (Closed | Open | HalfOpen)                      │  │
│    │  failure_count: AtomicU32                                           │  │
│    │  success_count: AtomicU32 (for HalfOpen)                            │  │
│    │  last_failure_time: AtomicInstant                                   │  │
│    │                                                                      │  │
│    │  Transitions:                                                        │  │
│    │  ┌────────┐  failure_count    ┌────────┐  recovery    ┌──────────┐  │  │
│    │  │ Closed │ >=threshold       │  Open  │  timeout     │ HalfOpen │  │  │
│    │  │        │ ───────────────►  │        │ ──────────►  │          │  │  │
│    │  └────────┘                   └────────┘              └──────────┘  │  │
│    │      ▲                                                     │        │  │
│    │      │              success_count >= threshold             │        │  │
│    │      └─────────────────────────────────────────────────────┘        │  │
│    │                                                                      │  │
│    └─────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────────┐  │
│    │ Rate Limiter State                                                   │  │
│    │                                                                      │  │
│    │  tokens_remaining: AtomicI64                                        │  │
│    │  requests_remaining: AtomicI64                                      │  │
│    │  window_reset_time: AtomicInstant                                   │  │
│    │  pending_permits: Semaphore                                         │  │
│    │                                                                      │  │
│    │  Synced from response headers:                                       │  │
│    │  • x-ratelimit-remaining-requests                                    │  │
│    │  • x-ratelimit-remaining-tokens                                      │  │
│    │  • x-ratelimit-reset                                                │  │
│    │                                                                      │  │
│    └─────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────────┐  │
│    │ Retry State (per request)                                           │  │
│    │                                                                      │  │
│    │  attempt_count: u32                                                  │  │
│    │  last_error: Option<GeminiError>                                     │  │
│    │  next_delay: Duration                                                │  │
│    │                                                                      │  │
│    └─────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Models Cache State

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MODELS CACHE STATE                                   │
└─────────────────────────────────────────────────────────────────────────────┘

ModelsCache State:
─────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  ModelsCache {                                                               │
│                                                                              │
│    models: RwLock<HashMap<String, CachedModel>>                             │
│    ttl: Duration  // Default: 1 hour                                        │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────────┐  │
│    │ Cache Entry                                                          │  │
│    │                                                                      │  │
│    │  "models/gemini-1.5-pro" => CachedModel {                           │  │
│    │    model: Model {                                                    │  │
│    │      name: "models/gemini-1.5-pro",                                 │  │
│    │      display_name: "Gemini 1.5 Pro",                                │  │
│    │      input_token_limit: 2097152,                                    │  │
│    │      output_token_limit: 8192,                                       │  │
│    │      supported_generation_methods: ["generateContent", ...],         │  │
│    │    },                                                                │  │
│    │    cached_at: Instant,                                               │  │
│    │  }                                                                   │  │
│    └─────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│    Cache Operations:                                                         │
│    • get(name) - Returns cached if not expired, else None                   │
│    • insert(name, model) - Stores with current timestamp                    │
│    • is_expired(entry) - cached_at + ttl < now                              │
│                                                                              │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Concurrency Patterns

### 5.1 Thread Safety Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       THREAD SAFETY MODEL                                    │
└─────────────────────────────────────────────────────────────────────────────┘

GeminiClient Thread Safety:
──────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  GeminiClient: Send + Sync                                                   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ All fields are either:                                               │    │
│  │ • Immutable after construction (config)                              │    │
│  │ • Thread-safe shared (Arc<T> where T: Send + Sync)                   │    │
│  │ • Interior mutability with synchronization (OnceCell, RwLock)        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Safe to share across threads:                                               │
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                     │
│  │  Thread 1   │    │  Thread 2   │    │  Thread 3   │                     │
│  │             │    │             │    │             │                     │
│  │  Arc::clone │    │  Arc::clone │    │  Arc::clone │                     │
│  │     ↓       │    │     ↓       │    │     ↓       │                     │
│  └─────────────┘    └─────────────┘    └─────────────┘                     │
│         │                  │                  │                             │
│         └──────────────────┼──────────────────┘                             │
│                            ▼                                                 │
│                  ┌─────────────────┐                                        │
│                  │  GeminiClient   │                                        │
│                  │  (shared state) │                                        │
│                  └─────────────────┘                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Concurrent Request Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONCURRENT REQUEST HANDLING                               │
└─────────────────────────────────────────────────────────────────────────────┘

Multiple concurrent requests share:
──────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Request 1 ───┐                                                              │
│               │    ┌───────────────────────────────────────────────────┐    │
│  Request 2 ───┼───►│           Shared ResilienceOrchestrator           │    │
│               │    │                                                    │    │
│  Request 3 ───┘    │  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │    │
│                    │  │ Rate Limit  │  │   Circuit   │  │  Retry    │ │    │
│                    │  │  Semaphore  │  │   Breaker   │  │  Logic    │ │    │
│                    │  │             │  │   (Atomic)  │  │ (per-req) │ │    │
│                    │  │ Coordinates │  │             │  │           │ │    │
│                    │  │ concurrent  │  │ Shared      │  │ Isolated  │ │    │
│                    │  │ access      │  │ state       │  │ per call  │ │    │
│                    │  └─────────────┘  └─────────────┘  └───────────┘ │    │
│                    │                                                    │    │
│                    └───────────────────────────────────────────────────┘    │
│                                         │                                    │
│                                         ▼                                    │
│                    ┌───────────────────────────────────────────────────┐    │
│                    │           Shared HTTP Connection Pool              │    │
│                    │                                                    │    │
│                    │  Connection pooling handled by reqwest/hyper       │    │
│                    │  Automatic connection reuse and keep-alive         │    │
│                    │                                                    │    │
│                    └───────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Rate Limit Coordination:
───────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Request 1: await rate_limiter.acquire()  ←── Blocks if limit reached       │
│  Request 2: await rate_limiter.acquire()  ←── Waits for permit              │
│  Request 3: await rate_limiter.acquire()  ←── Queued                        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Rate Limiter Semaphore                        │    │
│  │                                                                      │    │
│  │  permits: 10 (concurrent requests)                                   │    │
│  │  tokens_remaining: 100000 (from server headers)                      │    │
│  │                                                                      │    │
│  │  Fairness: FIFO ordering for blocked requests                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Async Runtime Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ASYNC RUNTIME INTEGRATION                                │
└─────────────────────────────────────────────────────────────────────────────┘

Rust (Tokio):
────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  #[tokio::main]                                                              │
│  async fn main() {                                                           │
│      let client = GeminiClient::from_env()?;                                 │
│                                                                              │
│      // Concurrent requests                                                  │
│      let (res1, res2) = tokio::join!(                                       │
│          client.content().generate_content(req1),                           │
│          client.content().generate_content(req2),                           │
│      );                                                                      │
│                                                                              │
│      // Streaming                                                            │
│      let stream = client.content().generate_content_stream(req3).await?;    │
│      tokio::pin!(stream);                                                    │
│      while let Some(chunk) = stream.next().await {                          │
│          // Process chunk                                                    │
│      }                                                                       │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

TypeScript (Node.js):
───────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  async function main() {                                                     │
│      const client = new GeminiClient({ apiKey: process.env.GEMINI_API_KEY });│
│                                                                              │
│      // Concurrent requests                                                  │
│      const [res1, res2] = await Promise.all([                               │
│          client.content.generateContent(req1),                              │
│          client.content.generateContent(req2),                              │
│      ]);                                                                     │
│                                                                              │
│      // Streaming                                                            │
│      const stream = await client.content.generateContentStream(req3);       │
│      for await (const chunk of stream) {                                    │
│          // Process chunk                                                    │
│      }                                                                       │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Error Flow and Recovery

### 6.1 Error Propagation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ERROR PROPAGATION                                     │
└─────────────────────────────────────────────────────────────────────────────┘

                              User Application
                                     ▲
                                     │
                                     │ GeminiError
                                     │
                         ┌───────────┴───────────┐
                         │     Error Mapping     │
                         │                       │
                         │ • Categorize by type  │
                         │ • Add context         │
                         │ • Determine retryable │
                         └───────────┬───────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Transport      │      │   Resilience    │      │   Service       │
│  Layer Errors   │      │  Layer Errors   │      │  Layer Errors   │
│                 │      │                 │      │                 │
│ • Connection    │      │ • CircuitOpen   │      │ • Validation    │
│ • Timeout       │      │ • RateLimited   │      │ • ContentBlocked│
│ • TLS           │      │ • RetryExhausted│      │ • NotFound      │
│ • DNS           │      │                 │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
         │                           │                           │
         ▼                           ▼                           ▼
┌───────────────────────────────────────────────────────────────────┐
│                         GeminiError Enum                           │
│                                                                    │
│  ConfigurationError { kind, message }                              │
│  AuthenticationError { kind, message }                             │
│  RequestError { kind, message, param }                             │
│  ResponseError { kind, message, body_preview }                     │
│  ResourceError { kind, message, resource }                         │
│  RateLimitError { kind, message, retry_after }                     │
│  ServerError { kind, message, request_id }                         │
│  NetworkError { kind, message, source }                            │
│  ContentBlockedError { reason, safety_ratings }                    │
│  CircuitBreakerOpen { message }                                    │
│  TimeoutError { message, duration }                                │
│                                                                    │
└───────────────────────────────────────────────────────────────────┘
```

### 6.2 Recovery Strategies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RECOVERY STRATEGIES                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          RETRYABLE ERRORS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Error Type                     Strategy                                     │
│  ─────────────────────────────────────────────────────────────               │
│  RateLimitError                 Wait for retry_after, then retry            │
│  ServerError::ServiceUnavailable Wait with exponential backoff              │
│  ServerError::ModelOverloaded   Wait with exponential backoff               │
│  NetworkError::Timeout          Retry with same timeout                     │
│  NetworkError::ConnectionFailed  Retry with exponential backoff             │
│                                                                              │
│  Retry Configuration:                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  max_retries: 3                                                      │    │
│  │  initial_delay: 1000ms                                               │    │
│  │  max_delay: 60000ms                                                  │    │
│  │  multiplier: 2.0                                                     │    │
│  │  jitter: 0.1 (10%)                                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Backoff Sequence: 1s → 2s → 4s (with ±10% jitter)                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        NON-RETRYABLE ERRORS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Error Type                     User Action Required                         │
│  ─────────────────────────────────────────────────────────────               │
│  ConfigurationError             Fix configuration and recreate client       │
│  AuthenticationError::InvalidKey Provide valid API key                      │
│  RequestError::ValidationError  Fix request parameters                      │
│  ContentBlockedError            Modify content or safety settings           │
│  ResourceError::NotFound        Use existing resource or create new         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        CIRCUIT BREAKER RECOVERY                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  When circuit is OPEN:                                                       │
│  • Return CircuitBreakerOpen error immediately                              │
│  • No network request made                                                   │
│  • Client should wait or use fallback                                       │
│                                                                              │
│  Recovery:                                                                   │
│  • After recovery_timeout (30s default), circuit moves to HALF_OPEN         │
│  • Single test request allowed                                               │
│  • Success → CLOSED (normal operation)                                       │
│  • Failure → OPEN (reset recovery timer)                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Resilience Patterns

### 7.1 Resilience Orchestrator Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RESILIENCE ORCHESTRATOR FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

execute<T>(operation: F, context: &RequestContext) -> Result<T, GeminiError>
│
├─── 1. Check Circuit Breaker ───────────────────────────────────────────────┐
│                                                                             │
│    MATCH circuit_breaker.check_state():                                     │
│        Open => RETURN Err(CircuitBreakerOpen)                              │
│        HalfOpen => allow_single_request = true                             │
│        Closed => proceed normally                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
│
├─── 2. Acquire Rate Limit Permit ───────────────────────────────────────────┐
│                                                                             │
│    AWAIT rate_limiter.acquire_permit():                                     │
│        Success => proceed with permit                                       │
│        WouldBlock => await until permit available                          │
│        Timeout => RETURN Err(RateLimitError)                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
│
├─── 3. Start Trace Span ────────────────────────────────────────────────────┐
│                                                                             │
│    span = tracer.start_span("gemini.request", context)                     │
│    span.set_attribute("operation", context.operation)                       │
│    span.set_attribute("model", context.model)                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
│
├─── 4. Execute with Retry ──────────────────────────────────────────────────┐
│                                                                             │
│    FOR attempt IN 1..=max_retries:                                         │
│        │                                                                    │
│        ├── Execute operation                                               │
│        │   result = AWAIT operation()                                      │
│        │                                                                    │
│        ├── Handle result                                                   │
│        │   MATCH result:                                                    │
│        │       Ok(response) => {                                           │
│        │           update_circuit_breaker(Success)                         │
│        │           update_rate_limit_from_headers(response.headers)        │
│        │           RETURN Ok(response)                                     │
│        │       }                                                            │
│        │       Err(e) if e.is_retryable() => {                             │
│        │           record_retry_metric(attempt)                            │
│        │           delay = calculate_backoff(attempt, e.retry_after())     │
│        │           AWAIT sleep(delay)                                      │
│        │           CONTINUE                                                │
│        │       }                                                            │
│        │       Err(e) => {                                                 │
│        │           update_circuit_breaker(Failure)                         │
│        │           RETURN Err(e)                                           │
│        │       }                                                            │
│        │                                                                    │
│    RETURN Err(RetryExhausted { last_error })                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
│
└─── 5. End Trace Span ──────────────────────────────────────────────────────┐
                                                                              │
     span.set_status(result.is_ok() ? Ok : Error(error.to_string()))        │
     span.end()                                                               │
                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Backoff Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKOFF STRATEGY                                     │
└─────────────────────────────────────────────────────────────────────────────┘

Exponential Backoff with Jitter:
───────────────────────────────

calculate_backoff(attempt: u32, retry_after: Option<Duration>) -> Duration:

    // If server specifies retry-after, use it
    IF let Some(retry_after) = retry_after THEN:
        RETURN retry_after

    // Otherwise, exponential backoff
    base_delay = initial_delay * (multiplier ^ (attempt - 1))

    // Cap at max_delay
    delay = min(base_delay, max_delay)

    // Add jitter (±10%)
    jitter_range = delay * jitter_factor
    jitter = random(-jitter_range, +jitter_range)

    RETURN delay + jitter


Example with defaults (initial=1s, multiplier=2, jitter=10%):
────────────────────────────────────────────────────────────

    Attempt 1: 1.0s ± 0.1s  →  ~0.9s to 1.1s
    Attempt 2: 2.0s ± 0.2s  →  ~1.8s to 2.2s
    Attempt 3: 4.0s ± 0.4s  →  ~3.6s to 4.4s
    Attempt 4: 8.0s ± 0.8s  →  ~7.2s to 8.8s
    ...
    (capped at max_delay: 60s)


Visual Timeline:
───────────────

    │ Attempt 1    │ Attempt 2      │ Attempt 3          │
    ├──────────────┼────────────────┼────────────────────┤
    │   Request    │    Request     │     Request        │
    │   Failure    │    Failure     │     Success        │
    │              │                │                    │
    │──── 1s ─────│──── 2s ───────│                    │
          ↑              ↑
        backoff        backoff
```

---

## Document Navigation

| Previous | Current | Next |
|----------|---------|------|
| [Architecture Part 1](./architecture-gemini-1.md) | Architecture Part 2 | [Architecture Part 3](./architecture-gemini-3.md) |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial architecture part 2 |

---

**Architecture Phase Status: Part 2 COMPLETE**

*Data flow, state management, and concurrency patterns documented.*
