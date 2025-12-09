# Architecture: Mistral Integration Module - Part 2

**Data Flow, Concurrency, and Error Propagation**
**Version:** 1.0.0
**Date:** 2025-12-09
**Status:** COMPLETE

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
│                          DATA FLOW OVERVIEW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

  Application Code
        │
        │ 1. Create Request
        ▼
  ┌─────────────┐
  │   Client    │
  │  API Layer  │
  └──────┬──────┘
         │
         │ 2. Delegate to Service
         ▼
  ┌─────────────┐
  │   Service   │─────────────────┐
  │    Layer    │                 │
  └──────┬──────┘                 │
         │                        │
         │ 3. Build Request       │ 4. Validate
         ▼                        │
  ┌─────────────┐                 │
  │   Request   │◀────────────────┘
  │   Builder   │
  └──────┬──────┘
         │
         │ 5. Apply Auth
         ▼
  ┌─────────────┐
  │    Auth     │
  │  Provider   │
  └──────┬──────┘
         │
         │ 6. Execute with Resilience
         ▼
  ┌─────────────┐
  │ Resilience  │───┐
  │Orchestrator │   │
  └──────┬──────┘   │
         │          │
         │          │ 6a. Retry Loop
         │          │ 6b. Circuit Check
         │          │ 6c. Rate Limit
         │          │
         │ 7. Send  │
         ▼          │
  ┌─────────────┐   │
  │    HTTP     │◀──┘
  │  Transport  │
  └──────┬──────┘
         │
         │ 8. Network I/O
         ▼
  ┌─────────────┐
  │  Mistral    │
  │    API      │
  └──────┬──────┘
         │
         │ 9. HTTP Response
         ▼
  ┌─────────────┐
  │  Response   │
  │   Parser    │
  └──────┬──────┘
         │
         │ 10. Typed Result
         ▼
  Application Code
```

### 8.2 Synchronous Request Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SYNCHRONOUS REQUEST FLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘

Timeline ──────────────────────────────────────────────────────────────────────▶

 App        Client       Service      Resilience     Transport      Mistral
  │            │            │              │              │            │
  │──create()──▶            │              │              │            │
  │            │──chat()────▶              │              │            │
  │            │            │──execute()───▶              │            │
  │            │            │              │              │            │
  │            │            │              │──[check      │            │
  │            │            │              │  circuit]    │            │
  │            │            │              │              │            │
  │            │            │              │──[check      │            │
  │            │            │              │  rate limit] │            │
  │            │            │              │              │            │
  │            │            │              │──send()──────▶            │
  │            │            │              │              │──HTTP──────▶
  │            │            │              │              │            │
  │            │            │              │              │◀──200 OK───│
  │            │            │              │◀─response────│            │
  │            │            │              │              │            │
  │            │            │◀─result──────│              │            │
  │            │◀─response──│              │              │            │
  │◀─result────│            │              │              │            │
  │            │            │              │              │            │
```

### 8.3 Data Transformation Stages

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DATA TRANSFORMATION STAGES                              │
└─────────────────────────────────────────────────────────────────────────────┘

 Stage 1: Application Domain
 ┌────────────────────────────────────────────────────────────────────────────┐
 │  ChatCompletionRequest {                                                    │
 │    model: "mistral-large-latest",                                           │
 │    messages: [Message::User { content: "Hello" }],                          │
 │    temperature: Some(0.7),                                                  │
 │  }                                                                          │
 └────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ Serialize
 Stage 2: JSON Wire Format
 ┌────────────────────────────────────────────────────────────────────────────┐
 │  {                                                                          │
 │    "model": "mistral-large-latest",                                         │
 │    "messages": [{"role": "user", "content": "Hello"}],                      │
 │    "temperature": 0.7                                                       │
 │  }                                                                          │
 └────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ Build HTTP Request
 Stage 3: HTTP Request
 ┌────────────────────────────────────────────────────────────────────────────┐
 │  POST /v1/chat/completions HTTP/1.1                                         │
 │  Host: api.mistral.ai                                                       │
 │  Authorization: Bearer sk-***                                               │
 │  Content-Type: application/json                                             │
 │                                                                             │
 │  {"model":"mistral-large-latest","messages":[...],"temperature":0.7}        │
 └────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ Network Transport (TLS)
 Stage 4: Network (Encrypted)
 ┌────────────────────────────────────────────────────────────────────────────┐
 │  [TLS 1.3 Encrypted Bytes]                                                  │
 └────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ Response
 Stage 5: HTTP Response
 ┌────────────────────────────────────────────────────────────────────────────┐
 │  HTTP/1.1 200 OK                                                            │
 │  Content-Type: application/json                                             │
 │                                                                             │
 │  {"id":"cmpl-xxx","choices":[...],"usage":{...}}                            │
 └────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ Deserialize
 Stage 6: Application Domain
 ┌────────────────────────────────────────────────────────────────────────────┐
 │  ChatCompletionResponse {                                                   │
 │    id: "cmpl-xxx",                                                          │
 │    choices: [...],                                                          │
 │    usage: Usage { prompt_tokens: 10, completion_tokens: 20, ... },          │
 │  }                                                                          │
 └────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Request/Response Pipeline

### 9.1 Pipeline Stages

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REQUEST/RESPONSE PIPELINE                            │
└─────────────────────────────────────────────────────────────────────────────┘

                              REQUEST PATH
                              ════════════
    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
    │Validate │───▶│Serialize│───▶│  Auth   │───▶│ Headers │───▶│Resilient│
    │ Input   │    │  JSON   │    │ Inject  │    │  Add    │    │  Send   │
    └─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
         │                                                            │
         │ Errors                                                     │
         ▼                                                            │
    ┌─────────┐                                                       │
    │Validation│                                                      │
    │  Error   │                                                      │
    └─────────┘                                                       │
                                                                      │
                              RESPONSE PATH                           │
                              ═════════════                           │
                                                                      ▼
    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
    │ Return  │◀───│  Parse  │◀───│ Check   │◀───│ Record  │◀───│ Receive │
    │ Result  │    │Response │    │ Status  │    │ Metrics │    │Response │
    └─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
         ▲              │              │
         │              │              │
    ┌─────────┐    ┌─────────┐    ┌─────────┐
    │ Typed   │    │  Parse  │    │  Map    │
    │ Result  │    │  Error  │    │  Error  │
    └─────────┘    └─────────┘    └─────────┘
```

### 9.2 Request Builder Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REQUEST BUILDER PIPELINE                             │
└─────────────────────────────────────────────────────────────────────────────┘

  RequestBuilder::new(config)
        │
        ▼
  ┌─────────────────────┐
  │ Set HTTP Method     │  POST, GET, DELETE, PATCH
  │ .method(POST)       │
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │ Set URL Path        │  /v1/chat/completions
  │ .path("/v1/...")    │
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │ Add Query Params    │  ?page=1&page_size=10
  │ .query(params)      │  (Optional)
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │ Serialize Body      │  JSON serialization
  │ .json(body)         │  with serde
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │ Add Headers         │  Content-Type, Accept
  │ .header(k, v)       │  User-Agent
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │ Apply Auth          │  Authorization: Bearer
  │ .with_auth(provider)│  [REDACTED in logs]
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │ Set Timeout         │  Per-request timeout
  │ .timeout(duration)  │  (optional override)
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │ Build               │  HttpRequest
  │ .build()            │
  └─────────────────────┘
```

### 9.3 Response Parser Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RESPONSE PARSER PIPELINE                              │
└─────────────────────────────────────────────────────────────────────────────┘

  HttpResponse
        │
        ▼
  ┌─────────────────────┐
  │ Check Status Code   │
  │ 200-299 = Success   │
  │ 4xx/5xx = Error     │
  └──────────┬──────────┘
             │
     ┌───────┴───────┐
     │               │
     ▼               ▼
 Success          Error
     │               │
     ▼               ▼
┌─────────┐    ┌─────────────────────┐
│ Parse   │    │ Parse Error Body    │
│ JSON    │    │ {"error": {...}}    │
│ Body    │    └──────────┬──────────┘
└────┬────┘               │
     │                    ▼
     │         ┌─────────────────────┐
     │         │ Map to MistralError │
     │         │ - BadRequest        │
     │         │ - RateLimit         │
     │         │ - NotFound          │
     │         │ - etc.              │
     │         └──────────┬──────────┘
     │                    │
     ▼                    ▼
┌─────────┐         ┌─────────┐
│ Typed   │         │  Error  │
│ Result  │         │ Result  │
│ Ok(T)   │         │ Err(E)  │
└─────────┘         └─────────┘
```

---

## 10. Streaming Architecture

### 10.1 SSE Stream Processing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SSE STREAM PROCESSING                               │
└─────────────────────────────────────────────────────────────────────────────┘

  HTTP Response Body (chunked transfer encoding)
        │
        │ Bytes stream
        ▼
  ┌─────────────────────┐
  │    SSE Parser       │
  │                     │
  │ Parse lines:        │
  │ - "data: {...}"     │
  │ - "event: ..."      │
  │ - empty line = end  │
  └──────────┬──────────┘
             │
             │ SseEvent stream
             ▼
  ┌─────────────────────┐
  │   Event Router      │
  │                     │
  │ - data → parse JSON │
  │ - [DONE] → complete │
  │ - error → map error │
  └──────────┬──────────┘
             │
             │ ChatCompletionChunk stream
             ▼
  ┌─────────────────────┐
  │  Stream Accumulator │
  │                     │
  │ - Aggregate content │
  │ - Track tool calls  │
  │ - Build final state │
  └──────────┬──────────┘
             │
             │ StreamEvent
             ▼
  Application Code (async for-each)
```

### 10.2 Streaming State Machine

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STREAMING STATE MACHINE                               │
└─────────────────────────────────────────────────────────────────────────────┘

                        ┌───────────────┐
                        │    IDLE       │
                        │  (Initial)    │
                        └───────┬───────┘
                                │
                                │ First chunk received
                                ▼
                        ┌───────────────┐
                        │   STARTED     │
                        │ (id, model    │
                        │  captured)    │
                        └───────┬───────┘
                                │
           ┌────────────────────┼────────────────────┐
           │                    │                    │
           ▼                    ▼                    ▼
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │  CONTENT    │     │ TOOL_CALL   │     │   ERROR     │
    │  STREAMING  │     │  BUILDING   │     │  (terminal) │
    │             │     │             │     │             │
    │ delta.      │     │ function    │     │ Error event │
    │ content     │     │ arguments   │     │ received    │
    └──────┬──────┘     └──────┬──────┘     └─────────────┘
           │                   │
           │ finish_reason     │ finish_reason
           │ = stop            │ = tool_calls
           │                   │
           └─────────┬─────────┘
                     │
                     ▼
             ┌───────────────┐
             │   COMPLETE    │
             │  (terminal)   │
             │               │
             │ Final usage   │
             │ stats         │
             └───────────────┘


  State Transitions:
  ═══════════════════════════════════════════════════════════════
  IDLE         → STARTED         : First chunk with id
  STARTED      → CONTENT         : delta.content present
  STARTED      → TOOL_CALL       : delta.tool_calls present
  CONTENT      → CONTENT         : More content chunks
  CONTENT      → COMPLETE        : finish_reason = stop
  TOOL_CALL    → TOOL_CALL       : More function args
  TOOL_CALL    → COMPLETE        : finish_reason = tool_calls
  Any          → ERROR           : Error event
```

### 10.3 Stream Accumulator Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       STREAM ACCUMULATOR DESIGN                              │
└─────────────────────────────────────────────────────────────────────────────┘

  struct StreamAccumulator {
      // Identity
      id: Option<String>,
      model: Option<String>,
      created: Option<i64>,

      // Content accumulation per choice
      choices: Vec<ChoiceAccumulator>,

      // Usage (from final chunk)
      usage: Option<Usage>,

      // Timing
      started_at: Instant,
      first_token_at: Option<Instant>,
  }

  struct ChoiceAccumulator {
      index: u32,
      content: String,           // Accumulated text content
      tool_calls: Vec<ToolCallAccumulator>,
      finish_reason: Option<FinishReason>,
  }

  struct ToolCallAccumulator {
      id: String,
      function_name: String,
      arguments: String,         // JSON string being built
  }

  Methods:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  fn process_chunk(&mut self, chunk: ChatCompletionChunk) -> StreamEvent  │
  │                                                                          │
  │  1. Extract and store identity (id, model, created) if first chunk       │
  │  2. For each choice delta:                                               │
  │     - Append content to choice.content                                   │
  │     - Append tool call arguments                                         │
  │     - Update finish_reason if present                                    │
  │  3. Store usage if present (final chunk)                                 │
  │  4. Return appropriate StreamEvent                                       │
  │                                                                          │
  │  fn finalize(&self) -> ChatCompletionResponse                            │
  │                                                                          │
  │  Convert accumulated state to complete response object                   │
  │                                                                          │
  │  fn time_to_first_token(&self) -> Option<Duration>                       │
  │                                                                          │
  │  Calculate TTFT for metrics                                              │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 11. State Management

### 11.1 Client State

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT STATE                                      │
└─────────────────────────────────────────────────────────────────────────────┘

  MistralClient (Immutable after construction)
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  config: ClientConfig          // Immutable configuration                │
  │  ├── base_url: Url             // API base URL                           │
  │  ├── timeout: Duration         // Default request timeout                │
  │  ├── retry: RetryConfig        // Retry parameters                       │
  │  ├── circuit_breaker: CbConfig // Circuit breaker parameters             │
  │  └── rate_limit: RlConfig      // Rate limit parameters                  │
  │                                                                          │
  │  transport: Arc<dyn HttpTransport>    // Shared, thread-safe             │
  │  auth: Arc<dyn AuthProvider>          // Shared, thread-safe             │
  │  resilience: Arc<ResilienceOrchestrator>  // Has internal state          │
  │                                                                          │
  │  services: ServiceRegistry     // Lazy-initialized services              │
  │  ├── chat: OnceCell<ChatService>                                         │
  │  ├── fim: OnceCell<FimService>                                           │
  │  ├── files: OnceCell<FilesService>                                       │
  │  └── ...                                                                 │
  │                                                                          │
  │  observability:                                                          │
  │  ├── tracer: Arc<dyn TracingProvider>                                    │
  │  ├── logger: Arc<dyn LoggingProvider>                                    │
  │  └── metrics: Arc<MistralMetrics>                                        │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Resilience State

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RESILIENCE STATE                                    │
└─────────────────────────────────────────────────────────────────────────────┘

  ResilienceOrchestrator
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  Circuit Breaker State (Atomic)                                          │
  │  ┌───────────────────────────────────────────────────────────────────┐  │
  │  │  state: AtomicU8 (Closed=0, Open=1, HalfOpen=2)                   │  │
  │  │  failure_count: AtomicU32                                         │  │
  │  │  success_count: AtomicU32                                         │  │
  │  │  last_failure: AtomicI64 (timestamp)                              │  │
  │  │  next_attempt: AtomicI64 (timestamp)                              │  │
  │  └───────────────────────────────────────────────────────────────────┘  │
  │                                                                          │
  │  Rate Limiter State (Mutex-protected)                                    │
  │  ┌───────────────────────────────────────────────────────────────────┐  │
  │  │  Token Bucket:                                                     │  │
  │  │  ├── tokens: f64                                                   │  │
  │  │  ├── last_update: Instant                                          │  │
  │  │  └── capacity: f64                                                 │  │
  │  │                                                                    │  │
  │  │  Sliding Window:                                                   │  │
  │  │  ├── window_start: Instant                                         │  │
  │  │  └── request_count: u32                                            │  │
  │  └───────────────────────────────────────────────────────────────────┘  │
  │                                                                          │
  │  Retry State (Per-request, not shared)                                   │
  │  ┌───────────────────────────────────────────────────────────────────┐  │
  │  │  attempt: u32                                                      │  │
  │  │  total_delay: Duration                                             │  │
  │  │  last_error: Option<MistralError>                                  │  │
  │  └───────────────────────────────────────────────────────────────────┘  │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 11.3 Service State

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SERVICE STATE                                     │
└─────────────────────────────────────────────────────────────────────────────┘

  Services are Stateless
  ═══════════════════════════════════════════════════════════════════════════

  ChatServiceImpl
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  // All references, no owned state                                       │
  │  transport: Arc<dyn HttpTransport>      // Shared                        │
  │  resilience: Arc<ResilienceOrchestrator> // Shared                       │
  │  auth: Arc<dyn AuthProvider>            // Shared                        │
  │  tracer: Arc<dyn TracingProvider>       // Shared                        │
  │  logger: Arc<dyn LoggingProvider>       // Shared                        │
  │  config: Arc<ClientConfig>              // Shared                        │
  │                                                                          │
  │  // No mutable state - all request state is local                        │
  └─────────────────────────────────────────────────────────────────────────┘

  Request-Scoped State
  ═══════════════════════════════════════════════════════════════════════════

  Per-request state lives on the stack:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  async fn create(&self, request: ChatRequest) -> Result<ChatResponse>    │
  │  {                                                                       │
  │      let span = self.tracer.start_span(...);  // Request-scoped         │
  │      let http_req = build_request(...);       // Request-scoped         │
  │      let response = self.resilience.execute(  // Retry state internal   │
  │          || self.transport.send(http_req)                                │
  │      ).await?;                                                           │
  │      parse_response(response)                 // No state               │
  │  }                                                                       │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Concurrency Patterns

### 12.1 Async Runtime Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ASYNC RUNTIME MODEL                                 │
└─────────────────────────────────────────────────────────────────────────────┘

  Rust (Tokio)
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                         Tokio Runtime                                    │
  │  ┌────────────────────────────────────────────────────────────────────┐ │
  │  │                    Thread Pool (multi-thread)                      │ │
  │  │                                                                    │ │
  │  │   Worker 1        Worker 2        Worker 3        Worker N        │ │
  │  │   ┌──────┐        ┌──────┐        ┌──────┐        ┌──────┐       │ │
  │  │   │Task A│        │Task C│        │Task E│        │Task G│       │ │
  │  │   │Task B│        │Task D│        │Task F│        │Task H│       │ │
  │  │   └──────┘        └──────┘        └──────┘        └──────┘       │ │
  │  │                                                                    │ │
  │  └────────────────────────────────────────────────────────────────────┘ │
  │                                                                          │
  │  Task Types:                                                             │
  │  • HTTP requests (I/O bound) - yielded during network wait              │
  │  • JSON serialization (CPU bound) - runs to completion                   │
  │  • Stream processing - yielded between chunks                            │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  TypeScript (Node.js Event Loop)
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                        Event Loop                                        │
  │  ┌────────────────────────────────────────────────────────────────────┐ │
  │  │                    Single Thread                                   │ │
  │  │                                                                    │ │
  │  │   ┌─────────────────────────────────────────────────────────────┐ │ │
  │  │   │                    Microtask Queue                          │ │ │
  │  │   │  Promise callbacks, queueMicrotask                          │ │ │
  │  │   └─────────────────────────────────────────────────────────────┘ │ │
  │  │                              │                                     │ │
  │  │                              ▼                                     │ │
  │  │   ┌─────────────────────────────────────────────────────────────┐ │ │
  │  │   │                    Macrotask Queue                          │ │ │
  │  │   │  setTimeout, setImmediate, I/O callbacks                    │ │ │
  │  │   └─────────────────────────────────────────────────────────────┘ │ │
  │  │                                                                    │ │
  │  └────────────────────────────────────────────────────────────────────┘ │
  │                                                                          │
  │  I/O handled by libuv thread pool                                        │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Concurrent Request Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CONCURRENT REQUEST HANDLING                              │
└─────────────────────────────────────────────────────────────────────────────┘

  Multiple Concurrent Requests (Shared Client)
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  let client = Arc::new(MistralClient::new(config));                      │
  │                                                                          │
  │  // Spawn concurrent requests                                            │
  │  let handles: Vec<_> = requests.into_iter().map(|req| {                  │
  │      let client = client.clone();  // Arc clone (cheap)                  │
  │      tokio::spawn(async move {                                           │
  │          client.chat().create(req).await                                 │
  │      })                                                                  │
  │  }).collect();                                                           │
  │                                                                          │
  │  // Await all                                                            │
  │  let results = futures::future::join_all(handles).await;                 │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  Thread Safety Guarantees
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  Component            Thread Safety        Mechanism                     │
  │  ─────────────────────────────────────────────────────────────────────  │
  │  MistralClient        Send + Sync          Arc references only          │
  │  Services             Send + Sync          No mutable state             │
  │  HttpTransport        Send + Sync          Reqwest is thread-safe       │
  │  CircuitBreaker       Send + Sync          Atomics for state            │
  │  RateLimiter          Send + Sync          Mutex for counters           │
  │  AuthProvider         Send + Sync          SecretString is Sync         │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 12.3 Stream Concurrency

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          STREAM CONCURRENCY                                  │
└─────────────────────────────────────────────────────────────────────────────┘

  Single Stream Consumer
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  // Streams are single-consumer by design                                │
  │  let mut stream = client.chat().create_stream(request).await?;          │
  │                                                                          │
  │  while let Some(event) = stream.next().await {                           │
  │      match event? {                                                      │
  │          StreamEvent::ContentDelta(delta) => {                           │
  │              print!("{}", delta.content);                                │
  │          }                                                               │
  │          StreamEvent::Done(response) => {                                │
  │              println!("\n\nUsage: {:?}", response.usage);                │
  │          }                                                               │
  │          _ => {}                                                         │
  │      }                                                                   │
  │  }                                                                       │
  └─────────────────────────────────────────────────────────────────────────┘

  Multiple Parallel Streams
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  // Each stream is independent                                           │
  │  let stream1 = client.chat().create_stream(req1);                        │
  │  let stream2 = client.chat().create_stream(req2);                        │
  │                                                                          │
  │  // Process in parallel with select! or join!                            │
  │  tokio::join!(                                                           │
  │      process_stream(stream1),                                            │
  │      process_stream(stream2),                                            │
  │  );                                                                      │
  │                                                                          │
  │  // Or use futures::stream::select for interleaved processing            │
  │  let merged = futures::stream::select(stream1, stream2);                 │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Error Propagation

### 13.1 Error Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ERROR FLOW                                        │
└─────────────────────────────────────────────────────────────────────────────┘

  Network/Transport Errors
  ═══════════════════════════════════════════════════════════════════════════

  Mistral API
       │
       │ Network failure / Timeout / TLS error
       ▼
  ┌─────────────┐
  │  reqwest    │──▶ reqwest::Error
  │  Error      │
  └──────┬──────┘
         │
         │ Map to transport error
         ▼
  ┌─────────────┐
  │ Transport   │──▶ MistralError::Connection
  │   Layer     │    MistralError::Timeout
  └──────┬──────┘    MistralError::Tls
         │
         │ Resilience handling
         ▼
  ┌─────────────┐
  │ Resilience  │──▶ Retry if retryable
  │   Layer     │    Circuit break if appropriate
  └──────┬──────┘    Rate limit if 429
         │
         │ Final error or success
         ▼
  Application (Result<T, MistralError>)


  API Errors (4xx/5xx)
  ═══════════════════════════════════════════════════════════════════════════

  Mistral API
       │
       │ HTTP 4xx/5xx response
       ▼
  ┌─────────────┐
  │  Response   │──▶ Parse error body JSON
  │   Parser    │    {"error": {"type": "...", "message": "..."}}
  └──────┬──────┘
         │
         │ Map status to error type
         ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │   400 ──▶ MistralError::BadRequest                                       │
  │   401 ──▶ MistralError::Authentication                                   │
  │   403 ──▶ MistralError::Permission                                       │
  │   404 ──▶ MistralError::NotFound                                         │
  │   422 ──▶ MistralError::Validation                                       │
  │   429 ──▶ MistralError::RateLimit (with retry_after)                     │
  │   500 ──▶ MistralError::Internal                                         │
  │   502 ──▶ MistralError::BadGateway                                       │
  │   503 ──▶ MistralError::ServiceUnavailable                               │
  │   504 ──▶ MistralError::GatewayTimeout                                   │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
         │
         │ Check retryability
         ▼
  ┌─────────────┐
  │ Resilience  │──▶ 429, 503 → Retry with backoff
  │   Layer     │    500, 502, 504 → Retry if configured
  └──────┬──────┘    400, 401, 403, 404, 422 → Don't retry
         │
         ▼
  Application (Result<T, MistralError>)
```

### 13.2 Error Type Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ERROR TYPE HIERARCHY                                 │
└─────────────────────────────────────────────────────────────────────────────┘

  MistralError (enum)
  │
  ├── Client Errors (4xx)
  │   ├── BadRequest { message, type, param, code }
  │   ├── Authentication { message }
  │   ├── Permission { message }
  │   ├── NotFound { message, resource }
  │   └── Validation { message, type, errors: Vec<FieldError> }
  │
  ├── Rate Limiting
  │   └── RateLimit { message, retry_after: Option<Duration> }
  │
  ├── Server Errors (5xx)
  │   ├── Internal { message, request_id }
  │   ├── BadGateway { message }
  │   ├── ServiceUnavailable { message, retry_after }
  │   └── GatewayTimeout { message }
  │
  ├── Network Errors
  │   ├── Connection { message, source }
  │   ├── Timeout { message, duration }
  │   └── Tls { message, source }
  │
  ├── Parse Errors
  │   ├── JsonParse { message, source }
  │   └── SseParse { message, line }
  │
  ├── Validation Errors (Client-side)
  │   └── InvalidRequest { field, message }
  │
  └── Unknown { status, message, body }


  Error Traits
  ═══════════════════════════════════════════════════════════════════════════

  impl MistralError {
      fn is_retryable(&self) -> bool
      fn retry_after(&self) -> Option<Duration>
      fn status_code(&self) -> Option<u16>
      fn error_type(&self) -> &str
      fn request_id(&self) -> Option<&str>
  }

  impl std::error::Error for MistralError { ... }
  impl std::fmt::Display for MistralError { ... }
  impl From<reqwest::Error> for MistralError { ... }
  impl From<serde_json::Error> for MistralError { ... }
```

### 13.3 Error Context Preservation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ERROR CONTEXT PRESERVATION                              │
└─────────────────────────────────────────────────────────────────────────────┘

  Context Chain
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  // Original error with full context                                     │
  │  MistralError::RateLimit {                                               │
  │      message: "Rate limit exceeded",                                     │
  │      retry_after: Some(Duration::from_secs(30)),                         │
  │  }                                                                       │
  │                                                                          │
  │  // Context added at each layer                                          │
  │  context: ErrorContext {                                                 │
  │      operation: "chat.create",                                           │
  │      request_id: Some("req-abc123"),                                     │
  │      trace_id: Some("trace-xyz"),                                        │
  │      attempt: 3,                                                         │
  │      elapsed: Duration::from_secs(45),                                   │
  │      model: Some("mistral-large-latest"),                                │
  │  }                                                                       │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  Logging with Context
  ═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  // Structured log entry                                                 │
  │  {                                                                       │
  │    "level": "error",                                                     │
  │    "message": "Mistral API error",                                       │
  │    "error": {                                                            │
  │      "type": "rate_limit",                                               │
  │      "message": "Rate limit exceeded",                                   │
  │      "retry_after_secs": 30                                              │
  │    },                                                                    │
  │    "context": {                                                          │
  │      "operation": "chat.create",                                         │
  │      "request_id": "req-abc123",                                         │
  │      "trace_id": "trace-xyz",                                            │
  │      "attempt": 3,                                                       │
  │      "elapsed_ms": 45000,                                                │
  │      "model": "mistral-large-latest"                                     │
  │    },                                                                    │
  │    "timestamp": "2025-12-09T10:30:00Z"                                   │
  │  }                                                                       │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial architecture part 2 |

---

**Architecture Phase Status: Part 2 COMPLETE**

*Data flow, concurrency patterns, and error propagation documented.*
