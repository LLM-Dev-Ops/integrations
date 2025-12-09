# OpenAI Integration Module - Architecture (Part 2)

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-08
**Module:** `integrations/openai`
**File:** 2 of 3 - Data Flow, State Management, Concurrency

---

## Table of Contents (Part 2)

8. [Data Flow Architecture](#8-data-flow-architecture)
9. [Request Lifecycle](#9-request-lifecycle)
10. [Streaming Architecture](#10-streaming-architecture)
11. [State Management](#11-state-management)
12. [Concurrency Patterns](#12-concurrency-patterns)
13. [Memory Management](#13-memory-management)

---

## 8. Data Flow Architecture

### 8.1 Request Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REQUEST DATA FLOW                                    │
└─────────────────────────────────────────────────────────────────────────────┘

  User Code                                                        OpenAI API
      │                                                                 ▲
      ▼                                                                 │
┌─────────────┐                                                   ┌─────────────┐
│   Request   │                                                   │   HTTP      │
│   Object    │                                                   │   Request   │
│             │                                                   │             │
│ • model     │                                                   │ • method    │
│ • messages  │                                                   │ • url       │
│ • params    │                                                   │ • headers   │
└──────┬──────┘                                                   │ • body      │
       │                                                          └──────▲──────┘
       ▼                                                                 │
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Validate   │────►│  Serialize  │────►│   Build     │────►│   Auth      │
│  Request    │     │  to JSON    │     │   Request   │     │   Headers   │
│             │     │             │     │             │     │             │
│ • schema    │     │ • serde     │     │ • URL       │     │ • API key   │
│ • ranges    │     │ • camelCase │     │ • method    │     │ • Org ID    │
│ • required  │     │ • optional  │     │ • headers   │     │ • Project   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │                   │
       │ Error             │ Error             │ Error             │
       ▼                   ▼                   ▼                   ▼
  ValidationError    SerializationError   RequestError      ConfigError
```

### 8.2 Response Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RESPONSE DATA FLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

  OpenAI API                                                       User Code
      │                                                                 ▲
      ▼                                                                 │
┌─────────────┐                                                   ┌─────────────┐
│   HTTP      │                                                   │  Response   │
│   Response  │                                                   │  Object     │
│             │                                                   │             │
│ • status    │                                                   │ • id        │
│ • headers   │                                                   │ • choices   │
│ • body      │                                                   │ • usage     │
└──────┬──────┘                                                   └──────▲──────┘
       │                                                                 │
       ▼                                                                 │
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Check     │────►│   Parse     │────►│   Update    │────►│   Record    │
│   Status    │     │   Headers   │     │   Rate      │     │   Metrics   │
│             │     │             │     │   Limits    │     │             │
│ • 2xx → ok  │     │ • rate-limit│     │ • remaining │     │ • latency   │
│ • 4xx → err │     │ • request-id│     │ • tokens    │     │ • tokens    │
│ • 5xx → err │     │ • retry     │     │ • reset     │     │ • status    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │                   │
       │ Success           │                   │                   │
       ▼                   │                   │                   │
┌─────────────┐            │                   │                   │
│ Deserialize │────────────┴───────────────────┴───────────────────┘
│  Response   │
│             │
│ • JSON parse│
│ • type map  │
│ • extra flds│
└──────┬──────┘
       │
       │ Error
       ▼
  ResponseError ────► ErrorMapper ────► OpenAIError
```

### 8.3 Error Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ERROR DATA FLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

  HTTP Error Response
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Error Classification                               │
│                                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │   Status     │   │   Error      │   │   Headers    │   │   Body       │ │
│  │   Code       │   │   Type       │   │              │   │   Content    │ │
│  │              │   │              │   │              │   │              │ │
│  │ 400 → Valid  │   │ invalid_api  │   │ Retry-After  │   │ { error: {   │ │
│  │ 401 → Auth   │   │ rate_limit   │   │ x-ratelimit  │   │   message,   │ │
│  │ 429 → Rate   │   │ server_error │   │ x-request-id │   │   type,      │ │
│  │ 500 → Server │   │ content_filt │   │              │   │   param }}   │ │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘ │
│         │                  │                  │                  │         │
│         └──────────────────┴─────────┬────────┴──────────────────┘         │
│                                      │                                      │
└──────────────────────────────────────┼──────────────────────────────────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │  Error Mapper   │
                              │                 │
                              │ • Classify      │
                              │ • Set retryable │
                              │ • Extract retry │
                              │ • Add context   │
                              └────────┬────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │  OpenAIError    │
                              │                 │
                              │ • error_code()  │
                              │ • is_retryable()│
                              │ • retry_after() │
                              │ • http_status() │
                              └─────────────────┘
```

---

## 9. Request Lifecycle

### 9.1 Complete Request Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        COMPLETE REQUEST LIFECYCLE                            │
└─────────────────────────────────────────────────────────────────────────────┘

     ┌─────────────────────────────────────────────────────────────────┐
     │                      USER SPACE                                  │
     │                                                                  │
     │   client.chat().create(request)                                 │
     │         │                                                        │
     └─────────┼────────────────────────────────────────────────────────┘
               │
               ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │                    SERVICE LAYER                                 │
     │                                                                  │
     │   ┌──────────┐    ┌──────────┐    ┌──────────┐                 │
     │   │ Validate │───►│ Trace    │───►│ Execute  │                 │
     │   │ Request  │    │ Start    │    │ w/Resil. │                 │
     │   └──────────┘    └──────────┘    └────┬─────┘                 │
     │                                        │                        │
     └────────────────────────────────────────┼────────────────────────┘
                                              │
                                              ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │                  RESILIENCE LAYER                                │
     │                                                                  │
     │   ┌──────────────┐                                              │
     │   │ Circuit      │◄─────────────────────────────────┐           │
     │   │ Breaker      │                                  │           │
     │   │ Check        │                                  │           │
     │   └──────┬───────┘                                  │           │
     │          │ Open?                                    │           │
     │          │                                          │           │
     │    ┌─────┴─────┐                                    │           │
     │    │           │                                    │           │
     │    ▼           ▼                                    │           │
     │  [Yes]       [No]                                   │           │
     │    │           │                                    │           │
     │    │     ┌─────▼──────┐                             │           │
     │    │     │ Rate Limit │                             │           │
     │    │     │ Acquire    │                             │           │
     │    │     └─────┬──────┘                             │           │
     │    │           │                                    │           │
     │    │     ┌─────▼──────┐     ┌──────────┐           │           │
     │    │     │ Retry Loop │────►│ Execute  │           │           │
     │    │     │            │◄────│ Request  │           │           │
     │    │     └─────┬──────┘     └────┬─────┘           │           │
     │    │           │                 │                  │           │
     │    │           │           ┌─────┴─────┐           │           │
     │    │           │           │           │           │           │
     │    │           │         [OK]       [Error]        │           │
     │    │           │           │           │           │           │
     │    │           │           │     ┌─────▼─────┐     │           │
     │    │           │           │     │ Retryable?│     │           │
     │    │           │           │     └─────┬─────┘     │           │
     │    │           │           │           │           │           │
     │    │           │           │     ┌─────┴─────┐     │           │
     │    │           │           │   [Yes]       [No]    │           │
     │    │           │           │     │           │     │           │
     │    │           │           │     │     ┌─────▼─────┴───┐       │
     │    │           │           │     │     │ Record        │       │
     │    │           │           │     │     │ Failure       │───────┘
     │    │           │           │     │     └───────────────┘
     │    │           │           │     │
     │    │           │◄──────────┼─────┘ (retry with backoff)
     │    │           │           │
     │    │     ┌─────▼──────┐    │
     │    │     │ Record     │    │
     │    │     │ Success    │────┘
     │    │     └─────┬──────┘
     │    │           │
     │    ▼           ▼
     │  [Err]    [Response]
     │    │           │
     └────┼───────────┼────────────────────────────────────────────────┘
          │           │
          ▼           ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │                    TRANSPORT LAYER                               │
     │                                                                  │
     │   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐ │
     │   │ Build    │───►│ Add Auth │───►│ Execute  │───►│ Parse    │ │
     │   │ Request  │    │ Headers  │    │ HTTP     │    │ Response │ │
     │   └──────────┘    └──────────┘    └──────────┘    └──────────┘ │
     │                                                                  │
     └─────────────────────────────────────────────────────────────────┘
```

### 9.2 Timing Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TIMING DIAGRAM                                      │
└─────────────────────────────────────────────────────────────────────────────┘

Time ──────────────────────────────────────────────────────────────────────────►

Client        Service        Resilience       Transport       OpenAI
  │              │               │                │              │
  │──request()──►│               │                │              │
  │              │               │                │              │
  │              │──validate()───┤                │              │
  │              │◄──────────────┤                │              │
  │              │               │                │              │
  │              │──execute()───►│                │              │
  │              │               │──checkCircuit()│              │
  │              │               │◄───────────────┤              │
  │              │               │                │              │
  │              │               │──acquireRate()─┤              │
  │              │               │◄───────────────┤              │
  │              │               │                │              │
  │              │               │────────────────┼──send()─────►│
  │              │               │                │              │
  │              │               │                │    ┌─────┐   │
  │              │               │                │    │ API │   │
  │              │               │                │    │Call │   │
  │              │               │                │    └─────┘   │
  │              │               │                │              │
  │              │               │◄───────────────┼──response()──│
  │              │               │                │              │
  │              │               │──recordSuccess()              │
  │              │               │◄───────────────┤              │
  │              │               │                │              │
  │              │◄──response()──│                │              │
  │              │               │                │              │
  │◄──response()─│               │                │              │
  │              │               │                │              │

  ├──────────────────────────────────────────────────────────────┤
                    Total Latency (measured)
```

---

## 10. Streaming Architecture

### 10.1 Streaming Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STREAMING ARCHITECTURE                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            OpenAI API                                        │
│                                                                              │
│  POST /chat/completions (stream: true)                                      │
│                                                                              │
│  Response: text/event-stream                                                │
│                                                                              │
│  data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"Hello"}}]}       │
│  data: {"id":"chatcmpl-1","choices":[{"delta":{"content":" world"}}]}      │
│  data: {"id":"chatcmpl-1","choices":[{"delta":{},"finish_reason":"stop"}]} │
│  data: [DONE]                                                               │
│                                                                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    │ HTTP Chunked Transfer
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Transport Layer                                      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      ByteStream (async)                              │    │
│  │                                                                      │    │
│  │   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐         │    │
│  │   │ Chunk 1 │───►│ Chunk 2 │───►│ Chunk 3 │───►│ Chunk N │         │    │
│  │   └─────────┘    └─────────┘    └─────────┘    └─────────┘         │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SSE Parser Layer                                     │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      SSE Event Stream                                │    │
│  │                                                                      │    │
│  │   Buffer: "data: {...}\n\ndata: {...}\n\ndata: [DONE]\n\n"         │    │
│  │                                                                      │    │
│  │   ┌──────────────────────────────────────────────────────────────┐  │    │
│  │   │                    Event Parser                               │  │    │
│  │   │                                                               │  │    │
│  │   │  1. Find "\n\n" boundary                                      │  │    │
│  │   │  2. Parse "data:", "event:", "retry:" prefixes               │  │    │
│  │   │  3. Handle multi-line data                                    │  │    │
│  │   │  4. Detect [DONE] marker                                      │  │    │
│  │   │                                                               │  │    │
│  │   └──────────────────────────────────────────────────────────────┘  │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Chunk Stream Layer                                   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                  AsyncIterator<ChatCompletionChunk>                  │    │
│  │                                                                      │    │
│  │   for await (chunk of stream) {                                     │    │
│  │     console.log(chunk.choices[0].delta.content);                    │    │
│  │   }                                                                  │    │
│  │                                                                      │    │
│  │   // Rust equivalent:                                                │    │
│  │   while let Some(chunk) = stream.next().await {                     │    │
│  │     println!("{}", chunk?.choices[0].delta.content);                │    │
│  │   }                                                                  │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Stream State Machine

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STREAM STATE MACHINE                                    │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────┐
                              │   Created   │
                              └──────┬──────┘
                                     │
                                     │ first poll
                                     ▼
                              ┌─────────────┐
                      ┌──────►│   Reading   │◄──────┐
                      │       └──────┬──────┘       │
                      │              │              │
                      │        ┌─────┴─────┐        │
                      │        │           │        │
                      │        ▼           ▼        │
                      │   [chunk]      [need data]  │
                      │        │           │        │
                      │        │           │        │
                      │        ▼           ▼        │
                      │  ┌──────────┐  ┌──────────┐ │
                      │  │  Yield   │  │  Buffer  │ │
                      │  │  Chunk   │  │  & Read  │─┘
                      │  └────┬─────┘  └──────────┘
                      │       │
                      │       │ continue
                      └───────┘

                              │
                      [DONE] marker
                              │
                              ▼
                       ┌─────────────┐
                       │  Completed  │
                       └──────┬──────┘
                              │
                              │ final usage
                              ▼
                       ┌─────────────┐
                       │    Done     │
                       │  (None)     │
                       └─────────────┘

Error at any state ─────────────────────────►  ┌─────────────┐
                                               │   Errored   │
                                               │ (Some(Err)) │
                                               └─────────────┘
```

### 10.3 Backpressure Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      BACKPRESSURE HANDLING                                   │
└─────────────────────────────────────────────────────────────────────────────┘

  Producer (OpenAI)                              Consumer (Application)
        │                                               │
        │                                               │
        ▼                                               │
  ┌───────────┐                                         │
  │  Chunks   │                                         │
  │ arriving  │                                         │
  │  @ 100/s  │                                         │
  └─────┬─────┘                                         │
        │                                               │
        ▼                                               │
  ┌─────────────────────────────────────────────────────────────┐
  │                      TCP Receive Buffer                      │
  │                                                              │
  │  ┌────────────────────────────────────────────────────────┐ │
  │  │  [chunk][chunk][chunk][chunk][chunk]...                │ │
  │  └────────────────────────────────────────────────────────┘ │
  │                                                              │
  │  When buffer fills → TCP flow control kicks in               │
  │  OpenAI will slow down sending                               │
  │                                                              │
  └─────────────────────────────────────────────────────────────┘
        │                                               │
        ▼                                               │
  ┌─────────────────────────────────────────────────────────────┐
  │                    Application Buffer                        │
  │                                                              │
  │  ┌────────────────────────────────────────────────────────┐ │
  │  │  Internal buffer (configurable, default 64KB)          │ │
  │  └────────────────────────────────────────────────────────┘ │
  │                                                              │
  │  Async iterator only advances when consumer calls .next()   │
  │  If consumer is slow, chunks wait in buffer                 │
  │                                                              │
  └─────────────────────────────────────────────────────────────┘
        │                                               │
        │                                               │
        │◄──────────────────────────────────────────────┤
        │         Consumer pulls chunks                 │
        │                                               │
                                                        ▼
                                              ┌───────────────┐
                                              │ Process chunk │
                                              │   @ 50/s      │
                                              │ (slow consumer)│
                                              └───────────────┘
```

---

## 11. State Management

### 11.1 Client State

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLIENT STATE MANAGEMENT                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          OpenAIClientImpl                                    │
│                                                                              │
│  Immutable State (set at construction):                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  config: OpenAIConfig                                                │    │
│  │  base_url: Url                                                       │    │
│  │  default_headers: HeaderMap                                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Shared Mutable State (thread-safe):                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  transport: Arc<dyn HttpTransport>       // Stateless, pooled conn  │    │
│  │  auth_manager: Arc<AuthManager>          // Immutable credentials   │    │
│  │  resilience: Arc<ResilienceOrchestrator> // Contains mutable state  │    │
│  │  logger: Arc<dyn Logger>                 // Stateless               │    │
│  │  tracer: Arc<dyn Tracer>                 // Stateless               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Lazy-Initialized Services (double-checked locking):                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  services_mutex: Mutex<()>                                           │    │
│  │  chat_service: OnceCell<Arc<ChatCompletionServiceImpl>>             │    │
│  │  embeddings_service: OnceCell<Arc<EmbeddingsServiceImpl>>           │    │
│  │  files_service: OnceCell<Arc<FilesServiceImpl>>                     │    │
│  │  ...                                                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Resilience State

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       RESILIENCE STATE MANAGEMENT                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                       ResilienceOrchestrator                                 │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         CircuitBreaker                                 │  │
│  │                                                                        │  │
│  │  state_mutex: Mutex                                                    │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │  state: CircuitState              // Closed | Open | HalfOpen   │  │  │
│  │  │  state_changed_at: Instant        // When state last changed    │  │  │
│  │  │  failure_count: u32               // Failures in current window │  │  │
│  │  │  success_count: u32               // Successes (half-open)      │  │  │
│  │  │  window_start: Instant            // Current failure window     │  │  │
│  │  │  half_open_requests: u32          // Requests in half-open      │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │  stats: AtomicStats                  // Lock-free metrics             │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │  total_requests: AtomicU64                                      │  │  │
│  │  │  total_successes: AtomicU64                                     │  │  │
│  │  │  total_failures: AtomicU64                                      │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                          RateLimiter                                   │  │
│  │                                                                        │  │
│  │  Token Bucket (thread-safe):                                          │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │  tokens: AtomicU32                // Available tokens           │  │  │
│  │  │  last_refill: AtomicU64           // Timestamp (nanos)          │  │  │
│  │  │  rate_per_second: f64             // Refill rate                │  │  │
│  │  │  max_tokens: u32                  // Bucket capacity            │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │  Server-Reported Limits (updated from headers):                       │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │  limits_mutex: RwLock                                           │  │  │
│  │  │  ┌───────────────────────────────────────────────────────────┐  │  │  │
│  │  │  │  limit_requests: Option<u32>                               │  │  │  │
│  │  │  │  limit_tokens: Option<u32>                                 │  │  │  │
│  │  │  │  remaining_requests: Option<u32>                           │  │  │  │
│  │  │  │  remaining_tokens: Option<u32>                             │  │  │  │
│  │  │  │  reset_requests: Option<Instant>                           │  │  │  │
│  │  │  │  reset_tokens: Option<Instant>                             │  │  │  │
│  │  │  └───────────────────────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.3 Connection Pool State

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONNECTION POOL STATE                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                     HTTP Client (reqwest/fetch)                              │
│                                                                              │
│  Connection Pool:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  api.openai.com:443                                                  │    │
│  │  ┌──────────────────────────────────────────────────────────────┐   │    │
│  │  │  Idle Connections (up to pool_max_idle_per_host = 10)        │   │    │
│  │  │                                                               │   │    │
│  │  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                    │   │    │
│  │  │  │Conn1│ │Conn2│ │Conn3│ │ ... │ │ConnN│                    │   │    │
│  │  │  │     │ │     │ │     │ │     │ │     │                    │   │    │
│  │  │  │idle │ │idle │ │active│ │idle │ │idle │                    │   │    │
│  │  │  │45s  │ │30s  │ │in-use│ │60s  │ │15s  │                    │   │    │
│  │  │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘                    │   │    │
│  │  │                                                               │   │    │
│  │  │  Eviction: idle > pool_idle_timeout (90s) → close            │   │    │
│  │  │                                                               │   │    │
│  │  └──────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  │  Configuration:                                                      │    │
│  │  ┌──────────────────────────────────────────────────────────────┐   │    │
│  │  │  pool_max_idle_per_host: 10                                   │   │    │
│  │  │  pool_idle_timeout: 90s                                       │   │    │
│  │  │  connect_timeout: 10s                                         │   │    │
│  │  │  tcp_keepalive: 60s                                           │   │    │
│  │  └──────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Concurrency Patterns

### 12.1 Concurrent Request Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CONCURRENT REQUEST PATTERN                               │
└─────────────────────────────────────────────────────────────────────────────┘

  // Rust Example

  let client = Arc::new(create_openai_client(config)?);

  let handles: Vec<_> = inputs
      .into_iter()
      .map(|input| {
          let client = Arc::clone(&client);
          tokio::spawn(async move {
              client.embeddings().create(EmbeddingsRequest {
                  model: "text-embedding-3-small".to_string(),
                  input: EmbeddingsInput::Single(input),
                  ..Default::default()
              }).await
          })
      })
      .collect();

  let results = futures::future::join_all(handles).await;


  Thread Model:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  tokio runtime (multi-threaded)                                         │
  │                                                                          │
  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐                    │
  │  │ Worker  │  │ Worker  │  │ Worker  │  │ Worker  │                    │
  │  │ Thread 1│  │ Thread 2│  │ Thread 3│  │ Thread 4│                    │
  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘                    │
  │       │            │            │            │                          │
  │       │  Tasks distributed across workers                               │
  │       │            │            │            │                          │
  │  ┌────▼────┐  ┌────▼────┐  ┌────▼────┐  ┌────▼────┐                    │
  │  │ Task 1  │  │ Task 2  │  │ Task 3  │  │ Task 4  │                    │
  │  │embed(A) │  │embed(B) │  │embed(C) │  │embed(D) │                    │
  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘                    │
  │       │            │            │            │                          │
  │       └────────────┴──────┬─────┴────────────┘                          │
  │                           │                                              │
  │                           ▼                                              │
  │                    ┌─────────────┐                                       │
  │                    │ Shared      │                                       │
  │                    │ Client      │                                       │
  │                    │ (Arc)       │                                       │
  │                    └─────────────┘                                       │
  │                           │                                              │
  │       ┌───────────────────┼───────────────────┐                          │
  │       │                   │                   │                          │
  │       ▼                   ▼                   ▼                          │
  │  ┌─────────┐        ┌─────────┐        ┌─────────┐                      │
  │  │RateLim  │        │Circuit  │        │ConnPool │                      │
  │  │(Atomic) │        │(Mutex)  │        │(Managed)│                      │
  │  └─────────┘        └─────────┘        └─────────┘                      │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Semaphore-Based Concurrency Control

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  SEMAPHORE-BASED CONCURRENCY CONTROL                         │
└─────────────────────────────────────────────────────────────────────────────┘

  // TypeScript Example - Limiting concurrent requests

  async function batchProcess(
    client: OpenAIClient,
    inputs: string[],
    maxConcurrent: number = 10
  ): Promise<EmbeddingsResponse[]> {
    const semaphore = new Semaphore(maxConcurrent);

    return Promise.all(
      inputs.map(async (input) => {
        await semaphore.acquire();
        try {
          return await client.embeddings.create({
            model: 'text-embedding-3-small',
            input: input,
          });
        } finally {
          semaphore.release();
        }
      })
    );
  }


  Execution Model:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  Semaphore (permits = 3)                                                │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  Available: ███ (3/3)                                           │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  │  Task Queue:                                                             │
  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐              │
  │  │  1  │ │  2  │ │  3  │ │  4  │ │  5  │ │  6  │ │  7  │              │
  │  └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘              │
  │     │       │       │       │       │       │       │                  │
  │     ▼       ▼       ▼       │       │       │       │                  │
  │  [running][running][running]│       │       │       │                  │
  │                             │       │       │       │                  │
  │  Semaphore: ░░░ (0/3)      ▼       ▼       ▼       ▼                  │
  │                          [waiting][waiting][waiting][waiting]          │
  │                                                                          │
  │  When task 1 completes:                                                 │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  Task 1 releases permit                                         │    │
  │  │  Semaphore: █░░ (1/3)                                          │    │
  │  │  Task 4 acquires permit                                         │    │
  │  │  Semaphore: ░░░ (0/3)                                          │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 12.3 Lock Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LOCK HIERARCHY                                      │
└─────────────────────────────────────────────────────────────────────────────┘

  To prevent deadlocks, locks must be acquired in this order:

  Level 1 (Highest):
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  services_mutex                                                          │
  │  Purpose: Guard lazy service initialization                              │
  │  Held: Briefly during first access to each service                       │
  └─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
  Level 2:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  circuit_breaker.state_mutex                                             │
  │  Purpose: Guard circuit state transitions                                │
  │  Held: Briefly during state checks and updates                           │
  └─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
  Level 3:
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  rate_limiter.limits_mutex                                               │
  │  Purpose: Guard server-reported limit updates                            │
  │  Held: Briefly when updating from response headers                       │
  └─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
  Level 4 (Lowest):
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  No user-facing locks at this level                                      │
  │  Internal connection pool management handled by HTTP client              │
  └─────────────────────────────────────────────────────────────────────────┘


  Lock-Free Operations (Atomics):
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  • rate_limiter.tokens (AtomicU32)                                       │
  │  • circuit_breaker.stats (AtomicU64s)                                    │
  │  • metrics counters (AtomicU64s)                                         │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Memory Management

### 13.1 Rust Memory Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RUST MEMORY MODEL                                     │
└─────────────────────────────────────────────────────────────────────────────┘

  Ownership Structure:

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  Application                                                             │
  │  │                                                                       │
  │  └─► OpenAIClientImpl (owned)                                           │
  │       │                                                                  │
  │       ├─► config: OpenAIConfig (owned)                                  │
  │       │                                                                  │
  │       ├─► transport: Arc<dyn HttpTransport> (shared)                    │
  │       │    └─► reqwest::Client (internal ownership)                     │
  │       │         └─► Connection pool (managed by reqwest)                │
  │       │                                                                  │
  │       ├─► auth_manager: Arc<AuthManager> (shared)                       │
  │       │    └─► api_key: SecretString (zeroized on drop)                │
  │       │                                                                  │
  │       ├─► resilience: Arc<ResilienceOrchestrator> (shared)              │
  │       │    ├─► circuit_breaker (owned by orchestrator)                  │
  │       │    ├─► rate_limiter (owned by orchestrator)                     │
  │       │    └─► retry_executor (owned by orchestrator)                   │
  │       │                                                                  │
  │       └─► services: OnceCell<Arc<Service>> (lazy, shared when created)  │
  │            └─► ChatCompletionServiceImpl (shared)                       │
  │                 └─► References back to client's Arc components          │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘


  Memory Lifecycle:

  ┌──────────────────────────────────────────────────────────────────────────┐
  │                                                                           │
  │  1. Client Creation                                                       │
  │     ┌─────────────────────────────────────────────────────────────────┐  │
  │     │  Stack: OpenAIConfig (moved into client)                        │  │
  │     │  Heap:  Client struct, Arc internals                            │  │
  │     └─────────────────────────────────────────────────────────────────┘  │
  │                                                                           │
  │  2. Request Processing                                                    │
  │     ┌─────────────────────────────────────────────────────────────────┐  │
  │     │  Stack: Request struct (dropped after serialize)                │  │
  │     │  Heap:  JSON bytes (owned by reqwest, dropped after send)       │  │
  │     │         Response bytes (owned until parsed)                     │  │
  │     │         Parsed response (returned to caller, they own it)       │  │
  │     └─────────────────────────────────────────────────────────────────┘  │
  │                                                                           │
  │  3. Streaming                                                             │
  │     ┌─────────────────────────────────────────────────────────────────┐  │
  │     │  Heap:  SSE buffer (grows as needed, cleared after parsing)     │  │
  │     │         Each chunk (yielded to caller, they own it)             │  │
  │     │  Drop:  Buffer freed when stream dropped                        │  │
  │     └─────────────────────────────────────────────────────────────────┘  │
  │                                                                           │
  │  4. Client Drop                                                           │
  │     ┌─────────────────────────────────────────────────────────────────┐  │
  │     │  Arc<Transport>: decremented, dropped if last ref               │  │
  │     │  Arc<AuthManager>: decremented, api_key zeroized if last ref    │  │
  │     │  Arc<Resilience>: decremented, dropped if last ref              │  │
  │     │  Services: dropped if initialized                               │  │
  │     └─────────────────────────────────────────────────────────────────┘  │
  │                                                                           │
  └──────────────────────────────────────────────────────────────────────────┘
```

### 13.2 TypeScript Memory Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     TYPESCRIPT MEMORY MODEL                                  │
└─────────────────────────────────────────────────────────────────────────────┘

  Object Graph:

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  Application                                                             │
  │  │                                                                       │
  │  └─► client (OpenAIClientImpl)                                          │
  │       │                                                                  │
  │       ├─► config ─────────────────────────────┐                         │
  │       │                                       │                         │
  │       ├─► transport ─────────────────────────┤ Strong references        │
  │       │                                       │ (prevent GC)            │
  │       ├─► authManager ───────────────────────┤                         │
  │       │                                       │                         │
  │       ├─► resilience ────────────────────────┤                         │
  │       │    ├─► circuitBreaker               │                         │
  │       │    ├─► rateLimiter                  │                         │
  │       │    └─► retryExecutor                │                         │
  │       │                                       │                         │
  │       └─► services (lazy Map) ───────────────┘                         │
  │            └─► chatService                                              │
  │                 └─► References parent components                        │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘


  Memory Considerations:

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  1. Closure Captures                                                     │
  │     ┌─────────────────────────────────────────────────────────────────┐ │
  │     │  // Avoid capturing entire client in callbacks                  │ │
  │     │  const { chat } = client;  // Extract only needed service       │ │
  │     │                                                                  │ │
  │     │  // Good: captures only chat service                            │ │
  │     │  const handler = async (msg) => chat.create({ ... });           │ │
  │     │                                                                  │ │
  │     │  // Bad: captures entire client                                 │ │
  │     │  const handler = async (msg) => client.chat.create({ ... });    │ │
  │     └─────────────────────────────────────────────────────────────────┘ │
  │                                                                          │
  │  2. Stream Cleanup                                                       │
  │     ┌─────────────────────────────────────────────────────────────────┐ │
  │     │  // Always consume or explicitly close streams                  │ │
  │     │  const stream = await client.chat.createStream({ ... });        │ │
  │     │                                                                  │ │
  │     │  try {                                                           │ │
  │     │    for await (const chunk of stream) {                          │ │
  │     │      // process chunk                                            │ │
  │     │    }                                                             │ │
  │     │  } finally {                                                     │ │
  │     │    // Stream auto-closes when iteration completes                │ │
  │     │    // Or call stream.return() to close early                     │ │
  │     │  }                                                               │ │
  │     └─────────────────────────────────────────────────────────────────┘ │
  │                                                                          │
  │  3. AbortController for Cancellation                                     │
  │     ┌─────────────────────────────────────────────────────────────────┐ │
  │     │  const controller = new AbortController();                       │ │
  │     │                                                                  │ │
  │     │  // Request with abort signal                                    │ │
  │     │  const promise = client.chat.create({                            │ │
  │     │    model: 'gpt-4',                                               │ │
  │     │    messages: [...],                                              │ │
  │     │  }, { signal: controller.signal });                              │ │
  │     │                                                                  │ │
  │     │  // Cancel if needed                                             │ │
  │     │  controller.abort();                                             │ │
  │     │                                                                  │ │
  │     │  // Releases resources immediately                               │ │
  │     └─────────────────────────────────────────────────────────────────┘ │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 13.3 Buffer Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BUFFER MANAGEMENT                                     │
└─────────────────────────────────────────────────────────────────────────────┘

  SSE Stream Buffer:

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  Initial State:                                                          │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  buffer: ""                                              (empty) │    │
  │  │  capacity: 0                                                     │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  │  After receiving chunks:                                                 │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  buffer: "data: {...}\n\ndata: {...}\n\ndata: {..."             │    │
  │  │          ├─────────────┤├─────────────┤├──────────              │    │
  │  │           complete evt   complete evt   incomplete              │    │
  │  │  capacity: 4096 (grows as needed)                               │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  │  After parsing complete events:                                          │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │  buffer: "data: {..."                                            │    │
  │  │          ├──────────                                             │    │
  │  │           incomplete (kept for next chunk)                       │    │
  │  │  capacity: 4096 (not shrunk - reused)                           │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  │  Optimization: Use ring buffer for large streams                         │
  │  ┌─────────────────────────────────────────────────────────────────┐    │
  │  │                                                                  │    │
  │  │  ┌─────────────────────────────────────────────────────────┐    │    │
  │  │  │    │    │    │data│: {.│..}\│n\nd│ata:│ {..│    │    │  │    │    │
  │  │  └─────────────────────────────────────────────────────────┘    │    │
  │  │        ▲                               ▲                         │    │
  │  │      read                            write                       │    │
  │  │                                                                  │    │
  │  └─────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-08 | SPARC Generator | Initial architecture (Part 2) |

---

**Continued in Part 3: Integration Points, Deployment, and Observability**
