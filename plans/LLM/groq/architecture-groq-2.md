# Architecture: Groq Integration Module (Part 2)

## SPARC Phase 3: Architecture - Data Flow & Operations

**Version:** 1.0.0
**Date:** 2025-01-15
**Status:** Draft
**Module:** `integrations/groq`

---

## Table of Contents

7. [Data Flow Architecture](#7-data-flow-architecture)
8. [State Management](#8-state-management)
9. [Concurrency Model](#9-concurrency-model)
10. [Error Flow](#10-error-flow)
11. [Observability Architecture](#11-observability-architecture)
12. [Security Architecture](#12-security-architecture)
13. [Testing Architecture](#13-testing-architecture)
14. [Deployment Architecture](#14-deployment-architecture)
15. [API Quick Reference](#15-api-quick-reference)

---

## 7. Data Flow Architecture

### 7.1 Request/Response Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                    REQUEST/RESPONSE PIPELINE                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Application                                                         │
│      │                                                               │
│      │ ChatRequest                                                   │
│      ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  1. VALIDATION LAYER                                         │    │
│  │     • Model ID present                                       │    │
│  │     • Messages array non-empty                               │    │
│  │     • Parameter ranges (temperature, top_p, etc.)            │    │
│  │     • Tool definitions valid                                 │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                │                                     │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  2. RATE LIMIT CHECK                                         │    │
│  │     • Check current rate limit status                        │    │
│  │     • Wait if approaching limits                             │    │
│  │     • Proactive throttling at 10% remaining                  │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                │                                     │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  3. REQUEST BUILDING                                         │    │
│  │     • Serialize to JSON                                      │    │
│  │     • Set Content-Type header                                │    │
│  │     • Apply authentication                                   │    │
│  │     • Set Accept header (for streaming)                      │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                │                                     │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  4. RESILIENCE EXECUTION                                     │    │
│  │     • Check circuit breaker state                            │    │
│  │     • Execute HTTP request                                   │    │
│  │     • Handle transient failures with retry                   │    │
│  │     • Record success/failure metrics                         │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                │                                     │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  5. HTTP TRANSPORT                                           │    │
│  │     • TLS 1.2+ connection                                    │    │
│  │     • Connection pooling                                     │    │
│  │     • Timeout enforcement                                    │    │
│  │     • Request transmission                                   │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                │                                     │
│                          NETWORK                                     │
│                                │                                     │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                        GROQ API                              │    │
│  │                                                              │    │
│  │     LPU Inference Engine → Ultra-Low Latency Response        │    │
│  │                                                              │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                │                                     │
│                          NETWORK                                     │
│                                │                                     │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  6. RESPONSE HANDLING                                        │    │
│  │     • Update rate limit status from headers                  │    │
│  │     • Check HTTP status code                                 │    │
│  │     • Parse error responses if non-2xx                       │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                │                                     │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  7. RESPONSE PARSING                                         │    │
│  │     • Deserialize JSON response                              │    │
│  │     • Extract content, usage, metadata                       │    │
│  │     • Parse x_groq timing information                        │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                │                                     │
│                                ▼                                     │
│                           ChatResponse                               │
│                                │                                     │
│                                ▼                                     │
│                           Application                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Streaming Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                      STREAMING DATA FLOW                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Application                                                         │
│      │                                                               │
│      │ create_stream(request)                                        │
│      ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  ChatService                                                 │    │
│  │    • Validate request                                        │    │
│  │    • Set stream: true                                        │    │
│  │    • Check rate limits                                       │    │
│  │    • Build HTTP request with Accept: text/event-stream       │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                │                                     │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  HttpTransport.send_streaming()                              │    │
│  │    • Open streaming connection                               │    │
│  │    • Return StreamingResponse with byte stream               │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                │                                     │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  ChatStream                                                  │    │
│  │    • Wrap StreamingResponse                                  │    │
│  │    • Contains SseParser                                      │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                │                                     │
│                                │ Stream<ChatChunk>                   │
│                                │                                     │
│      ┌─────────────────────────┴─────────────────────────┐          │
│      │                                                    │          │
│      │   ┌────────────────────────────────────────────┐  │          │
│      │   │              SSE Event Stream              │  │          │
│      │   │                                            │  │          │
│      │   │  data: {"id":"...","choices":[{"delta":   │  │          │
│      │   │         {"content":"Hello"}}]}             │  │          │
│      │   │                                            │  │          │
│      │   │  data: {"id":"...","choices":[{"delta":   │  │          │
│      │   │         {"content":" world"}}]}            │  │          │
│      │   │                                            │  │          │
│      │   │  data: {"id":"...","choices":[{"delta":   │  │          │
│      │   │         {},"finish_reason":"stop"}],       │  │          │
│      │   │         "usage":{"prompt_tokens":10,...}}  │  │          │
│      │   │                                            │  │          │
│      │   │  data: [DONE]                              │  │          │
│      │   │                                            │  │          │
│      │   └────────────────────────────────────────────┘  │          │
│      │                                                    │          │
│      └────────────────────────────────────────────────────┘          │
│                                │                                     │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  SseParser                                                   │    │
│  │    • Buffer incoming bytes                                   │    │
│  │    • Parse SSE format (data:, event:, id:, retry:)          │    │
│  │    • Emit complete events on empty line                      │    │
│  │    • Handle [DONE] marker                                    │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                │                                     │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  ChatChunk Parsing                                           │    │
│  │    • Deserialize JSON from event.data                        │    │
│  │    • Extract delta content                                   │    │
│  │    • Accumulate tool calls                                   │    │
│  │    • Detect finish_reason                                    │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                │                                     │
│                                │ for await chunk in stream          │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Application Processing                                      │    │
│  │    • Display tokens as received                              │    │
│  │    • Build complete response incrementally                   │    │
│  │    • Handle tool calls progressively                         │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Optional: stream.collect() → ChatResponse                          │
│    • Accumulates all chunks                                         │
│    • Builds complete ChatResponse                                   │
│    • Includes final usage statistics                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.3 Audio Transcription Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                   AUDIO TRANSCRIPTION FLOW                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Application                                                         │
│      │                                                               │
│      │ TranscriptionRequest { file, model, language, ... }          │
│      ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  AudioService.transcribe()                                   │    │
│  │    • Validate request                                        │    │
│  │    • Verify Whisper model                                    │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                │                                     │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Audio File Resolution                                       │    │
│  │                                                              │    │
│  │    AudioFile::Path(path)                                     │    │
│  │      → Read file from disk                                   │    │
│  │      → Detect MIME type from extension                       │    │
│  │      → Extract filename                                      │    │
│  │                                                              │    │
│  │    AudioFile::Bytes { data, filename }                       │    │
│  │      → Use provided data directly                            │    │
│  │      → Detect MIME type from filename                        │    │
│  │                                                              │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                │                                     │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Multipart Form Building                                     │    │
│  │                                                              │    │
│  │    ┌─────────────────────────────────────────────────────┐  │    │
│  │    │  Part: file                                          │  │    │
│  │    │    filename: "audio.mp3"                            │  │    │
│  │    │    content-type: audio/mpeg                         │  │    │
│  │    │    data: [binary audio data]                        │  │    │
│  │    └─────────────────────────────────────────────────────┘  │    │
│  │    ┌─────────────────────────────────────────────────────┐  │    │
│  │    │  Part: model                                         │  │    │
│  │    │    value: "whisper-large-v3"                        │  │    │
│  │    └─────────────────────────────────────────────────────┘  │    │
│  │    ┌─────────────────────────────────────────────────────┐  │    │
│  │    │  Part: response_format (optional)                    │  │    │
│  │    │    value: "verbose_json"                            │  │    │
│  │    └─────────────────────────────────────────────────────┘  │    │
│  │    ┌─────────────────────────────────────────────────────┐  │    │
│  │    │  Part: timestamp_granularities[] (optional)          │  │    │
│  │    │    values: ["word", "segment"]                      │  │    │
│  │    └─────────────────────────────────────────────────────┘  │    │
│  │                                                              │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                │                                     │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  HttpTransport.send_multipart()                              │    │
│  │    • Build multipart/form-data request                       │    │
│  │    • Apply authentication headers                            │    │
│  │    • POST to /audio/transcriptions                           │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                │                                     │
│                          NETWORK                                     │
│                                │                                     │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                        GROQ API                              │    │
│  │                                                              │    │
│  │     Whisper Model Processing                                 │    │
│  │       • Audio decoding                                       │    │
│  │       • Speech recognition                                   │    │
│  │       • Timestamp generation                                 │    │
│  │                                                              │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                │                                     │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Response Parsing (based on response_format)                 │    │
│  │                                                              │    │
│  │    json/verbose_json:                                        │    │
│  │      → Parse JSON to TranscriptionResponse                   │    │
│  │      → Extract text, language, duration                      │    │
│  │      → Parse words[] and segments[] if present               │    │
│  │                                                              │    │
│  │    text/srt/vtt:                                             │    │
│  │      → Return raw text as response.text                      │    │
│  │                                                              │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                │                                     │
│                                ▼                                     │
│                      TranscriptionResponse                           │
│                                │                                     │
│                                ▼                                     │
│                           Application                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. State Management

### 8.1 Client State

```
┌─────────────────────────────────────────────────────────────────────┐
│                       CLIENT STATE MODEL                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                      GroqClient                              │    │
│  │                                                              │    │
│  │  Immutable State (set at construction):                      │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │  config: Arc<GroqConfig>                             │    │    │
│  │  │    • api_key (SecretString)                          │    │    │
│  │  │    • base_url                                        │    │    │
│  │  │    • timeout                                         │    │    │
│  │  │    • max_retries                                     │    │    │
│  │  │    • default_headers                                 │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  │                                                              │    │
│  │  Shared References (Arc):                                    │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │  transport: Arc<dyn HttpTransport>                   │    │    │
│  │  │    • Connection pool state (internal)                │    │    │
│  │  │    • Keep-alive connections                          │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │  auth: Arc<dyn AuthProvider>                         │    │    │
│  │  │    • API key reference                               │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  │                                                              │    │
│  │  Mutable State (protected):                                  │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │  resilience: Arc<ResilienceOrchestrator>             │    │    │
│  │  │    • Circuit breaker state (RwLock internally)       │    │    │
│  │  │    • Failure counters                                │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │  rate_limiter: Arc<RwLock<RateLimitManager>>         │    │    │
│  │  │    • Current rate limit status                       │    │    │
│  │  │    • Last update timestamp                           │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  State Sharing Pattern:                                             │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │    GroqClient ────────────────────────┐                     │    │
│  │        │                              │                     │    │
│  │        │ Arc clone                    │                     │    │
│  │        ▼                              ▼                     │    │
│  │    ChatService              AudioService                    │    │
│  │        │                              │                     │    │
│  │        │ Same Arc references          │                     │    │
│  │        │                              │                     │    │
│  │        └──────────┬───────────────────┘                     │    │
│  │                   │                                          │    │
│  │                   ▼                                          │    │
│  │    ┌──────────────────────────────┐                         │    │
│  │    │  Shared State:               │                         │    │
│  │    │    • transport (Arc)         │                         │    │
│  │    │    • auth (Arc)              │                         │    │
│  │    │    • resilience (Arc)        │                         │    │
│  │    │    • rate_limiter (Arc)      │                         │    │
│  │    └──────────────────────────────┘                         │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 Circuit Breaker State Machine

```
┌─────────────────────────────────────────────────────────────────────┐
│                  CIRCUIT BREAKER STATE MACHINE                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                        ┌─────────────┐                              │
│                        │   CLOSED    │ ◄─── Initial State           │
│                        │  (Normal)   │                              │
│                        └──────┬──────┘                              │
│                               │                                      │
│                               │ failure_count >= threshold          │
│                               │                                      │
│                               ▼                                      │
│                        ┌─────────────┐                              │
│             ┌─────────►│    OPEN     │                              │
│             │          │ (Fail Fast) │                              │
│             │          └──────┬──────┘                              │
│             │                 │                                      │
│             │                 │ reset_timeout elapsed               │
│             │                 │                                      │
│             │                 ▼                                      │
│             │          ┌─────────────┐                              │
│             │          │  HALF-OPEN  │                              │
│             │          │   (Test)    │                              │
│             │          └──────┬──────┘                              │
│             │                 │                                      │
│             │     ┌───────────┴───────────┐                         │
│             │     │                       │                         │
│             │     ▼                       ▼                         │
│             │  Failure               Success                        │
│             │     │                       │                         │
│             │     │                       │ success_count           │
│             │     │                       │ >= threshold            │
│             └─────┘                       │                         │
│                                           ▼                         │
│                                    ┌─────────────┐                  │
│                                    │   CLOSED    │                  │
│                                    │  (Normal)   │                  │
│                                    └─────────────┘                  │
│                                                                      │
│  State Transitions:                                                  │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  CLOSED → OPEN:                                              │    │
│  │    When: consecutive failures >= failure_threshold (5)       │    │
│  │    Action: Start reset timer                                 │    │
│  │                                                              │    │
│  │  OPEN → HALF_OPEN:                                           │    │
│  │    When: reset_timeout (30s) elapsed                         │    │
│  │    Action: Allow limited test requests                       │    │
│  │                                                              │    │
│  │  HALF_OPEN → CLOSED:                                         │    │
│  │    When: consecutive successes >= success_threshold (3)      │    │
│  │    Action: Reset failure counter                             │    │
│  │                                                              │    │
│  │  HALF_OPEN → OPEN:                                           │    │
│  │    When: Any failure in half-open state                      │    │
│  │    Action: Restart reset timer                               │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Behavior in Each State:                                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  CLOSED:                                                     │    │
│  │    • All requests allowed                                    │    │
│  │    • Track failures                                          │    │
│  │    • Reset on success                                        │    │
│  │                                                              │    │
│  │  OPEN:                                                       │    │
│  │    • All requests immediately fail                           │    │
│  │    • Return GroqError::ServerError (503)                    │    │
│  │    • No network calls made                                   │    │
│  │                                                              │    │
│  │  HALF_OPEN:                                                  │    │
│  │    • Limited requests allowed (1 at a time)                  │    │
│  │    • Test if service recovered                               │    │
│  │    • Quick transition on result                              │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.3 Rate Limit State

```
┌─────────────────────────────────────────────────────────────────────┐
│                      RATE LIMIT STATE MODEL                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   RateLimitManager                           │    │
│  │                                                              │    │
│  │  status: RateLimitStatus                                     │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │                                                      │    │    │
│  │  │  Request Limits:                                     │    │    │
│  │  │    requests_limit: Option<u32>      (from header)    │    │    │
│  │  │    requests_remaining: Option<u32>  (from header)    │    │    │
│  │  │    requests_reset: Option<Duration> (from header)    │    │    │
│  │  │                                                      │    │    │
│  │  │  Token Limits:                                       │    │    │
│  │  │    tokens_limit: Option<u32>        (from header)    │    │    │
│  │  │    tokens_remaining: Option<u32>    (from header)    │    │    │
│  │  │    tokens_reset: Option<Duration>   (from header)    │    │    │
│  │  │                                                      │    │    │
│  │  │  Metadata:                                           │    │    │
│  │  │    updated_at: Instant              (last update)    │    │    │
│  │  │                                                      │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Update Flow:                                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  Response Headers:                                           │    │
│  │    x-ratelimit-limit-requests: 30                           │    │
│  │    x-ratelimit-remaining-requests: 25                       │    │
│  │    x-ratelimit-reset-requests: 2s                           │    │
│  │    x-ratelimit-limit-tokens: 30000                          │    │
│  │    x-ratelimit-remaining-tokens: 28500                      │    │
│  │    x-ratelimit-reset-tokens: 100ms                          │    │
│  │                                                              │    │
│  │           │                                                  │    │
│  │           ▼                                                  │    │
│  │                                                              │    │
│  │  rate_limiter.update_from_headers(headers)                   │    │
│  │           │                                                  │    │
│  │           ▼                                                  │    │
│  │                                                              │    │
│  │  Updated State:                                              │    │
│  │    requests_limit: Some(30)                                  │    │
│  │    requests_remaining: Some(25)                              │    │
│  │    requests_reset: Some(2s)                                  │    │
│  │    tokens_limit: Some(30000)                                 │    │
│  │    tokens_remaining: Some(28500)                             │    │
│  │    tokens_reset: Some(100ms)                                 │    │
│  │    updated_at: now                                           │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Throttling Decision:                                               │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  should_wait() -> Option<Duration>                           │    │
│  │                                                              │    │
│  │  IF requests_remaining == 0:                                 │    │
│  │      RETURN Some(requests_reset)  // Hard limit hit          │    │
│  │                                                              │    │
│  │  IF requests_remaining < requests_limit / 10:                │    │
│  │      RETURN Some(requests_reset / 2)  // Proactive throttle  │    │
│  │                                                              │    │
│  │  RETURN None  // No throttling needed                        │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. Concurrency Model

### 9.1 Thread Safety

```
┌─────────────────────────────────────────────────────────────────────┐
│                      THREAD SAFETY MODEL                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Rust Thread Safety (Send + Sync):                                  │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  GroqClient: Send + Sync                                     │    │
│  │    ├── config: Arc<GroqConfig>           ✓ Send + Sync      │    │
│  │    ├── transport: Arc<dyn HttpTransport> ✓ Send + Sync      │    │
│  │    ├── auth: Arc<dyn AuthProvider>       ✓ Send + Sync      │    │
│  │    ├── resilience: Arc<ResilienceOrch>   ✓ Send + Sync      │    │
│  │    └── rate_limiter: Arc<RwLock<...>>    ✓ Send + Sync      │    │
│  │                                                              │    │
│  │  ChatService: Send + Sync                                    │    │
│  │    • All fields are Arc<T> where T: Send + Sync             │    │
│  │    • Can be safely shared across threads                     │    │
│  │                                                              │    │
│  │  ChatStream: Send (not Sync)                                 │    │
│  │    • Contains mutable state (buffer, parser state)           │    │
│  │    • Can be sent to another thread                           │    │
│  │    • Cannot be shared between threads                        │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Synchronization Primitives:                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  Arc<T>:                                                     │    │
│  │    • Thread-safe reference counting                          │    │
│  │    • Allows shared ownership across threads                  │    │
│  │    • Zero-cost for immutable data                            │    │
│  │                                                              │    │
│  │  RwLock<T>:                                                  │    │
│  │    • Multiple readers OR single writer                       │    │
│  │    • Used for: RateLimitManager, CircuitBreaker              │    │
│  │    • Async-aware (tokio::sync::RwLock)                      │    │
│  │                                                              │    │
│  │  Mutex<T>:                                                   │    │
│  │    • Single access at a time                                 │    │
│  │    • Used for: MockHttpTransport in tests                    │    │
│  │    • Async-aware (tokio::sync::Mutex)                       │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  TypeScript Concurrency:                                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  Single-Threaded Event Loop:                                 │    │
│  │    • No explicit synchronization needed                      │    │
│  │    • Async/await for non-blocking I/O                        │    │
│  │    • Promise-based concurrency                               │    │
│  │                                                              │    │
│  │  State Sharing:                                              │    │
│  │    • Direct object references (no Arc needed)                │    │
│  │    • Mutable state safe due to single thread                 │    │
│  │    • Careful with async gaps (state may change)              │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.2 Concurrent Request Handling

```
┌─────────────────────────────────────────────────────────────────────┐
│                 CONCURRENT REQUEST HANDLING                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Parallel Request Pattern:                                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  // Rust - Multiple concurrent requests                      │    │
│  │  let client = Arc::new(GroqClient::new(config)?);           │    │
│  │                                                              │    │
│  │  let handles: Vec<_> = requests.into_iter()                 │    │
│  │      .map(|req| {                                           │    │
│  │          let client = client.clone();                       │    │
│  │          tokio::spawn(async move {                          │    │
│  │              client.chat().create(req).await                │    │
│  │          })                                                  │    │
│  │      })                                                      │    │
│  │      .collect();                                             │    │
│  │                                                              │    │
│  │  let results = futures::future::join_all(handles).await;    │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Execution Model:                                                   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │     Task 1              Task 2              Task 3           │    │
│  │        │                   │                   │             │    │
│  │        │ rate_limit.read() │                   │             │    │
│  │        ▼                   │                   │             │    │
│  │     [check]                │                   │             │    │
│  │        │                   │ rate_limit.read() │             │    │
│  │        │                   ▼                   │             │    │
│  │        │                [check]                │             │    │
│  │        │                   │                   │             │    │
│  │        │ send request      │                   │ rate_limit  │    │
│  │        ▼                   │                   ▼             │    │
│  │     [HTTP]                 │ send request   [check]          │    │
│  │        │                   ▼                   │             │    │
│  │        │                [HTTP]                 │             │    │
│  │        │                   │                   │ send req    │    │
│  │        │                   │                   ▼             │    │
│  │        │                   │                [HTTP]           │    │
│  │        ▼                   │                   │             │    │
│  │     response               │                   │             │    │
│  │        │                   ▼                   │             │    │
│  │        │ rate_limit.write()│                   │             │    │
│  │        ▼                   │                   │             │    │
│  │     [update]            response               │             │    │
│  │        │                   │                   ▼             │    │
│  │        │                   │ rate_limit.write()│             │    │
│  │        │                   ▼                response         │    │
│  │        │                [update]               │             │    │
│  │                                                │             │    │
│  │                                    rate_limit.write()        │    │
│  │                                                ▼             │    │
│  │                                             [update]         │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Note: RwLock allows concurrent reads, serializes writes            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Error Flow

### 10.1 Error Propagation

```
┌─────────────────────────────────────────────────────────────────────┐
│                      ERROR PROPAGATION FLOW                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Error Sources and Transformations:                                  │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  Transport Layer:                                            │    │
│  │    TransportError::ConnectionError                           │    │
│  │         │                                                    │    │
│  │         └──► GroqError::NetworkError                         │    │
│  │                                                              │    │
│  │    TransportError::TimeoutError                              │    │
│  │         │                                                    │    │
│  │         └──► GroqError::TimeoutError                         │    │
│  │                                                              │    │
│  │    TransportError::TlsError                                  │    │
│  │         │                                                    │    │
│  │         └──► GroqError::NetworkError                         │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  HTTP Status Codes:                                          │    │
│  │    400 Bad Request                                           │    │
│  │         │                                                    │    │
│  │         └──► GroqError::ValidationError                      │    │
│  │                                                              │    │
│  │    401 Unauthorized                                          │    │
│  │         │                                                    │    │
│  │         └──► GroqError::AuthenticationError                  │    │
│  │                                                              │    │
│  │    403 Forbidden                                             │    │
│  │         │                                                    │    │
│  │         └──► GroqError::AuthorizationError                   │    │
│  │                                                              │    │
│  │    404 Not Found                                             │    │
│  │         │                                                    │    │
│  │         └──► GroqError::ModelError                           │    │
│  │                                                              │    │
│  │    429 Too Many Requests                                     │    │
│  │         │                                                    │    │
│  │         └──► GroqError::RateLimitError                       │    │
│  │                                                              │    │
│  │    500-599 Server Errors                                     │    │
│  │         │                                                    │    │
│  │         └──► GroqError::ServerError                          │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  Groq API Error Types:                                       │    │
│  │    invalid_api_key                                           │    │
│  │         │                                                    │    │
│  │         └──► GroqError::AuthenticationError                  │    │
│  │                                                              │    │
│  │    invalid_request_error                                     │    │
│  │         │                                                    │    │
│  │         └──► GroqError::ValidationError                      │    │
│  │                                                              │    │
│  │    model_not_found                                           │    │
│  │         │                                                    │    │
│  │         └──► GroqError::ModelError                           │    │
│  │                                                              │    │
│  │    context_length_exceeded                                   │    │
│  │         │                                                    │    │
│  │         └──► GroqError::ContextLengthError                   │    │
│  │                                                              │    │
│  │    content_filter                                            │    │
│  │         │                                                    │    │
│  │         └──► GroqError::ContentFilterError                   │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  Streaming Errors:                                           │    │
│  │    JSON parse failure                                        │    │
│  │         │                                                    │    │
│  │         └──► GroqError::StreamError (with partial_content)   │    │
│  │                                                              │    │
│  │    Connection dropped                                        │    │
│  │         │                                                    │    │
│  │         └──► GroqError::StreamError (with partial_content)   │    │
│  │                                                              │    │
│  │    Invalid UTF-8                                             │    │
│  │         │                                                    │    │
│  │         └──► GroqError::StreamError                          │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.2 Error Recovery Strategy

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ERROR RECOVERY STRATEGY                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Retryable vs Non-Retryable:                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  RETRYABLE (is_retryable() == true):                         │    │
│  │    ✓ RateLimitError         → Wait for retry_after          │    │
│  │    ✓ ServerError (500-504)  → Exponential backoff           │    │
│  │    ✓ TimeoutError           → Immediate retry               │    │
│  │    ✓ NetworkError           → Exponential backoff           │    │
│  │                                                              │    │
│  │  NON-RETRYABLE (is_retryable() == false):                    │    │
│  │    ✗ AuthenticationError    → Fix API key                   │    │
│  │    ✗ AuthorizationError     → Check permissions             │    │
│  │    ✗ ValidationError        → Fix request                   │    │
│  │    ✗ ModelError             → Use valid model               │    │
│  │    ✗ ContextLengthError     → Reduce input size             │    │
│  │    ✗ ContentFilterError     → Modify content                │    │
│  │    ✗ StreamError            → Cannot retry mid-stream       │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Retry Flow:                                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  Request                                                     │    │
│  │     │                                                        │    │
│  │     ▼                                                        │    │
│  │  ┌───────────────┐                                          │    │
│  │  │   Execute     │                                          │    │
│  │  └───────┬───────┘                                          │    │
│  │          │                                                   │    │
│  │     ┌────┴────┐                                             │    │
│  │     ▼         ▼                                             │    │
│  │  Success    Error                                           │    │
│  │     │         │                                             │    │
│  │     │    is_retryable()?                                    │    │
│  │     │         │                                             │    │
│  │     │    ┌────┴────┐                                        │    │
│  │     │    ▼         ▼                                        │    │
│  │     │   Yes        No                                       │    │
│  │     │    │         │                                        │    │
│  │     │    │         └──► Return Error                        │    │
│  │     │    │                                                  │    │
│  │     │    │ attempts < max_retries?                          │    │
│  │     │    │                                                  │    │
│  │     │    ┌────┴────┐                                        │    │
│  │     │    ▼         ▼                                        │    │
│  │     │   Yes        No                                       │    │
│  │     │    │         │                                        │    │
│  │     │    │         └──► Return Error                        │    │
│  │     │    │                                                  │    │
│  │     │    │ calculate_delay()                                │    │
│  │     │    │   • Base: 1s                                     │    │
│  │     │    │   • Multiplier: 2x                               │    │
│  │     │    │   • Max: 60s                                     │    │
│  │     │    │   • Jitter: ±25%                                 │    │
│  │     │    │   • Or: retry_after header                       │    │
│  │     │    │                                                  │    │
│  │     │    ▼                                                  │    │
│  │     │  sleep(delay)                                         │    │
│  │     │    │                                                  │    │
│  │     │    └──────────────────► Retry (loop back)             │    │
│  │     │                                                       │    │
│  │     ▼                                                       │    │
│  │  Return Success                                             │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 11. Observability Architecture

### 11.1 Tracing Spans

```
┌─────────────────────────────────────────────────────────────────────┐
│                       TRACING SPAN HIERARCHY                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  groq_operation (root span)                                         │
│  ├── Attributes:                                                    │
│  │     operation: "chat.create"                                     │
│  │     model: "llama-3.3-70b-versatile"                            │
│  │     groq.request_id: "req_abc123"                               │
│  │     groq.tokens.prompt: 150                                     │
│  │     groq.tokens.completion: 50                                  │
│  │     groq.latency_ms: 45                                         │
│  │                                                                  │
│  └─── http_request (child span)                                     │
│       ├── Attributes:                                               │
│       │     http.method: "POST"                                     │
│       │     http.url: "/chat/completions"                          │
│       │     http.status_code: 200                                  │
│       │     http.request_content_length: 1024                      │
│       │     http.response_content_length: 512                      │
│       │                                                            │
│       └─── Events:                                                  │
│             request_started                                         │
│             response_received                                       │
│             response_parsed                                         │
│                                                                      │
│  Streaming spans:                                                   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  groq_stream (root span)                                     │    │
│  │  ├── operation: "chat.create_stream"                         │    │
│  │  ├── model: "llama-3.3-70b-versatile"                       │    │
│  │  │                                                          │    │
│  │  └─── stream_processing (child span)                         │    │
│  │       ├── chunks_received: 25                                │    │
│  │       ├── total_content_length: 500                          │    │
│  │       ├── first_token_ms: 15                                 │    │
│  │       └── total_duration_ms: 200                             │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 11.2 Metrics

```
┌─────────────────────────────────────────────────────────────────────┐
│                         METRICS DEFINITIONS                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Counter Metrics:                                                   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  groq_requests_total                                         │    │
│  │    Labels: model, operation, status                          │    │
│  │    Example: groq_requests_total{                             │    │
│  │      model="llama-3.3-70b-versatile",                       │    │
│  │      operation="chat.create",                                │    │
│  │      status="success"                                        │    │
│  │    } 1523                                                    │    │
│  │                                                              │    │
│  │  groq_tokens_total                                           │    │
│  │    Labels: model, type (prompt|completion)                   │    │
│  │    Example: groq_tokens_total{                               │    │
│  │      model="llama-3.3-70b-versatile",                       │    │
│  │      type="completion"                                       │    │
│  │    } 125000                                                  │    │
│  │                                                              │    │
│  │  groq_retries_total                                          │    │
│  │    Labels: model, reason                                     │    │
│  │    Example: groq_retries_total{                              │    │
│  │      model="llama-3.3-70b-versatile",                       │    │
│  │      reason="rate_limit"                                     │    │
│  │    } 42                                                      │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Histogram Metrics:                                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  groq_request_duration_seconds                               │    │
│  │    Labels: model, operation                                  │    │
│  │    Buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]  │    │
│  │    Example: groq_request_duration_seconds_bucket{            │    │
│  │      model="llama-3.3-70b-versatile",                       │    │
│  │      operation="chat.create",                                │    │
│  │      le="0.1"                                                │    │
│  │    } 1450                                                    │    │
│  │                                                              │    │
│  │  groq_streaming_first_token_seconds                          │    │
│  │    Labels: model                                             │    │
│  │    Buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5]             │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Gauge Metrics:                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  groq_rate_limit_remaining                                   │    │
│  │    Labels: type (requests|tokens)                            │    │
│  │    Example: groq_rate_limit_remaining{type="requests"} 25    │    │
│  │                                                              │    │
│  │  groq_circuit_breaker_state                                  │    │
│  │    Values: 0=closed, 1=open, 2=half_open                     │    │
│  │    Example: groq_circuit_breaker_state 0                     │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 12. Security Architecture

### 12.1 Credential Management

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CREDENTIAL MANAGEMENT                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  SecretString Flow:                                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  User provides API key                                       │    │
│  │         │                                                    │    │
│  │         ▼                                                    │    │
│  │  ┌─────────────────────────────────────────┐                │    │
│  │  │  SecretString::new(api_key)             │                │    │
│  │  │    • Wraps key in protective type       │                │    │
│  │  │    • Prevents accidental Display/Debug  │                │    │
│  │  │    • Zeroizes on drop (Rust)            │                │    │
│  │  └─────────────────────────────────────────┘                │    │
│  │         │                                                    │    │
│  │         │ Stored in config                                   │    │
│  │         ▼                                                    │    │
│  │  ┌─────────────────────────────────────────┐                │    │
│  │  │  GroqConfig.api_key: SecretString       │                │    │
│  │  └─────────────────────────────────────────┘                │    │
│  │         │                                                    │    │
│  │         │ Only exposed for auth header                       │    │
│  │         ▼                                                    │    │
│  │  ┌─────────────────────────────────────────┐                │    │
│  │  │  AuthProvider.apply_auth()              │                │    │
│  │  │    headers["Authorization"] =           │                │    │
│  │  │      format!("Bearer {}",               │                │    │
│  │  │        api_key.expose_secret())         │                │    │
│  │  └─────────────────────────────────────────┘                │    │
│  │         │                                                    │    │
│  │         │ Header sent over TLS                               │    │
│  │         ▼                                                    │    │
│  │  ┌─────────────────────────────────────────┐                │    │
│  │  │  HTTPS Request                          │                │    │
│  │  │    Authorization: Bearer gsk_xxx...     │                │    │
│  │  └─────────────────────────────────────────┘                │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Logging Protection:                                                │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  // This will NOT print the actual key                       │    │
│  │  tracing::info!("Config: {:?}", config);                    │    │
│  │  // Output: Config { api_key: SecretString(***), ... }      │    │
│  │                                                              │    │
│  │  // This will NOT compile (no Display impl)                  │    │
│  │  // println!("Key: {}", config.api_key);                    │    │
│  │                                                              │    │
│  │  // Only explicit exposure allowed                           │    │
│  │  let key = config.api_key.expose_secret();                  │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 12.2 Transport Security

```
┌─────────────────────────────────────────────────────────────────────┐
│                      TRANSPORT SECURITY                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  TLS Configuration:                                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  Rust (reqwest):                                             │    │
│  │    ClientBuilder::new()                                      │    │
│  │      .min_tls_version(Version::TLS_1_2)                     │    │
│  │      .danger_accept_invalid_certs(false)  // Never disable  │    │
│  │      .danger_accept_invalid_hostnames(false)                 │    │
│  │                                                              │    │
│  │  TypeScript (axios):                                         │    │
│  │    // Node.js enforces TLS 1.2+ by default                  │    │
│  │    // Custom agent for stricter settings:                    │    │
│  │    const agent = new https.Agent({                          │    │
│  │      minVersion: 'TLSv1.2',                                 │    │
│  │      rejectUnauthorized: true                               │    │
│  │    });                                                       │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  URL Validation:                                                    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  // Only HTTPS allowed                                       │    │
│  │  if !base_url.starts_with("https://") {                     │    │
│  │      return Err(GroqError::ValidationError {                │    │
│  │          message: "Base URL must use HTTPS",                │    │
│  │          param: Some("base_url"),                           │    │
│  │          ...                                                 │    │
│  │      });                                                     │    │
│  │  }                                                           │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Input Validation:                                                  │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  • Model ID format validation                                │    │
│  │  • Message content length limits                             │    │
│  │  • Parameter range enforcement                               │    │
│  │  • Tool definition schema validation                         │    │
│  │  • Image URL/base64 validation                               │    │
│  │  • Audio file format validation                              │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 13. Testing Architecture

### 13.1 Test Pyramid

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TEST PYRAMID                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                            /\                                        │
│                           /  \                                       │
│                          / E2E\        5% - Manual/Exploratory      │
│                         /______\                                     │
│                        /        \                                    │
│                       /Integration\   15% - Real API tests          │
│                      /______________\                                │
│                     /                \                               │
│                    /   Unit Tests     \  80% - Mock-based           │
│                   /____________________\                             │
│                                                                      │
│  Unit Tests (80%):                                                  │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  • Service logic with MockHttpTransport                      │    │
│  │  • Request building and validation                           │    │
│  │  • Response parsing                                          │    │
│  │  • Error mapping                                             │    │
│  │  • SSE parsing                                               │    │
│  │  • Rate limit calculations                                   │    │
│  │  • Circuit breaker state machine                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Integration Tests (15%):                                           │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  • Real API calls (with test key)                           │    │
│  │  • End-to-end request flow                                   │    │
│  │  • Streaming behavior                                        │    │
│  │  • Audio transcription                                       │    │
│  │  • Rate limit handling                                       │    │
│  │  • Error responses                                           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  E2E / Manual (5%):                                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  • Example applications                                      │    │
│  │  • Performance benchmarks                                    │    │
│  │  • Edge case exploration                                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 13.2 Mock Strategy

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MOCK STRATEGY                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Interface-Based Mocking:                                           │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  Production:                                                 │    │
│  │  ┌─────────────────────────────────────────┐                │    │
│  │  │  ChatService                            │                │    │
│  │  │    └── HttpTransportImpl (reqwest)      │                │    │
│  │  │          └── Groq API                   │                │    │
│  │  └─────────────────────────────────────────┘                │    │
│  │                                                              │    │
│  │  Testing:                                                    │    │
│  │  ┌─────────────────────────────────────────┐                │    │
│  │  │  ChatService                            │                │    │
│  │  │    └── MockHttpTransport                │                │    │
│  │  │          └── Queued responses           │                │    │
│  │  └─────────────────────────────────────────┘                │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Mock Components:                                                   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  MockHttpTransport:                                          │    │
│  │    • Queue responses for sequential tests                    │    │
│  │    • Record sent requests for verification                   │    │
│  │    • Simulate errors (timeout, network)                      │    │
│  │    • Simulate streaming with chunked data                    │    │
│  │                                                              │    │
│  │  MockAuthProvider:                                           │    │
│  │    • Always succeeds (for unit tests)                        │    │
│  │    • Verifiable header application                           │    │
│  │                                                              │    │
│  │  Test Fixtures:                                              │    │
│  │    • create_chat_response(content)                          │    │
│  │    • create_streaming_chunks(content)                       │    │
│  │    • create_error_response(status, type)                    │    │
│  │    • create_transcription_response(text)                    │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 14. Deployment Architecture

### 14.1 Package Distribution

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PACKAGE DISTRIBUTION                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Rust Crate:                                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  Registry: crates.io                                         │    │
│  │  Package: groq                                               │    │
│  │                                                              │    │
│  │  Installation:                                               │    │
│  │    cargo add groq                                            │    │
│  │    # or in Cargo.toml:                                       │    │
│  │    groq = "0.1"                                              │    │
│  │                                                              │    │
│  │  Features:                                                   │    │
│  │    • default = ["rustls-tls"]                               │    │
│  │    • native-tls (for platform TLS)                          │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  TypeScript Package:                                                │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  Registry: npm                                               │    │
│  │  Package: @llm-dev-ops/groq                                 │    │
│  │                                                              │    │
│  │  Installation:                                               │    │
│  │    npm install @llm-dev-ops/groq                            │    │
│  │    # or                                                      │    │
│  │    yarn add @llm-dev-ops/groq                               │    │
│  │                                                              │    │
│  │  Exports:                                                    │    │
│  │    • CommonJS (dist/cjs)                                    │    │
│  │    • ESM (dist/esm)                                         │    │
│  │    • Type definitions (dist/types)                          │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 14.2 CI/CD Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CI/CD PIPELINE                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                       PR Pipeline                            │    │
│  │                                                              │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │    │
│  │  │  Lint   │→ │  Build  │→ │  Test   │→ │  Audit  │        │    │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │    │
│  │                                                              │    │
│  │  Lint:                                                       │    │
│  │    • cargo fmt --check                                       │    │
│  │    • cargo clippy                                            │    │
│  │    • npm run lint                                            │    │
│  │                                                              │    │
│  │  Build:                                                      │    │
│  │    • cargo build --all-features                             │    │
│  │    • npm run build                                           │    │
│  │                                                              │    │
│  │  Test:                                                       │    │
│  │    • cargo test                                              │    │
│  │    • npm run test:coverage                                   │    │
│  │                                                              │    │
│  │  Audit:                                                      │    │
│  │    • cargo audit                                             │    │
│  │    • npm audit                                               │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     Release Pipeline                         │    │
│  │                                                              │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │    │
│  │  │  Test   │→ │ Version │→ │ Publish │→ │   Tag   │        │    │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │    │
│  │                                                              │    │
│  │  Test:                                                       │    │
│  │    • Full test suite                                         │    │
│  │    • Integration tests                                       │    │
│  │                                                              │    │
│  │  Version:                                                    │    │
│  │    • Bump version in Cargo.toml                             │    │
│  │    • Bump version in package.json                           │    │
│  │    • Update CHANGELOG                                        │    │
│  │                                                              │    │
│  │  Publish:                                                    │    │
│  │    • cargo publish                                           │    │
│  │    • npm publish                                             │    │
│  │                                                              │    │
│  │  Tag:                                                        │    │
│  │    • Create git tag                                          │    │
│  │    • Create GitHub release                                   │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 15. API Quick Reference

### 15.1 Rust API

```rust
// Client creation
let client = GroqClient::builder()
    .api_key("gsk_...")
    .timeout(Duration::from_secs(60))
    .max_retries(3)
    .build()?;

// Chat completion
let response = client.chat().create(
    ChatRequest::builder()
        .model("llama-3.3-70b-versatile")
        .system("You are helpful.")
        .user("Hello!")
        .temperature(0.7)
        .build()?
).await?;

println!("{}", response.content().unwrap_or_default());

// Streaming
let stream = client.chat().create_stream(request).await?;
while let Some(chunk) = stream.next().await {
    if let Some(content) = chunk?.choices[0].delta.content {
        print!("{}", content);
    }
}

// Audio transcription
let transcription = client.audio().transcribe(
    TranscriptionRequest::builder()
        .file_path("audio.mp3")
        .model("whisper-large-v3")
        .verbose_json()
        .with_word_timestamps()
        .build()?
).await?;

// List models
let models = client.models().list().await?;
```

### 15.2 TypeScript API

```typescript
// Client creation
const client = new GroqClientBuilder()
    .apiKey('gsk_...')
    .timeoutMs(60000)
    .maxRetries(3)
    .build();

// Chat completion
const response = await client.chat.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello!' }
    ],
    temperature: 0.7
});

console.log(response.choices[0].message.content);

// Streaming
const stream = await client.chat.createStream(request);
for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) process.stdout.write(content);
}

// Audio transcription
const transcription = await client.audio.transcribe({
    file: fs.readFileSync('audio.mp3'),
    model: 'whisper-large-v3',
    responseFormat: 'verbose_json',
    timestampGranularities: ['word']
});

// List models
const models = await client.models.list();
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-GROQ-ARCH-002 |
| Version | 1.0.0 |
| Created | 2025-01-15 |
| Last Modified | 2025-01-15 |
| Author | SPARC Methodology |
| Status | Draft |
| Part | 2 of 2 |

---

**End of Architecture Phase**

*SPARC Phase 3 Complete - Awaiting "Next phase." to proceed to Refinement*
