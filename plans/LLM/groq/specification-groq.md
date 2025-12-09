# Specification: Groq Integration Module

## SPARC Phase 1: Specification

**Version:** 1.0.0
**Date:** 2025-01-15
**Status:** Draft
**Module:** `integrations/groq`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Scope and Objectives](#2-scope-and-objectives)
3. [Groq API Overview](#3-groq-api-overview)
4. [Functional Requirements](#4-functional-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [System Constraints](#6-system-constraints)
7. [Interface Specifications](#7-interface-specifications)
8. [Data Models](#8-data-models)
9. [Error Handling Specification](#9-error-handling-specification)
10. [Use Case Scenarios](#10-use-case-scenarios)
11. [Acceptance Criteria](#11-acceptance-criteria)
12. [Glossary](#12-glossary)

---

## 1. Executive Summary

### 1.1 Purpose

This specification defines the requirements for the Groq integration module within the LLM-Dev-Ops Integration Repository. Groq provides ultra-low-latency inference for large language models through their custom Language Processing Unit (LPU) hardware, offering the fastest inference speeds in the industry.

### 1.2 Key Differentiators

Groq's unique value proposition centers on:

- **Ultra-Low Latency**: Sub-100ms response times for most queries
- **High Throughput**: Thousands of tokens per second
- **OpenAI-Compatible API**: Familiar interface for developers
- **Specialized Hardware**: Custom LPU inference engine
- **Consistent Performance**: Predictable latency without batching delays

### 1.3 Module Goals

1. Provide type-safe, idiomatic access to Groq's API
2. Support all production Groq endpoints
3. Leverage ultra-fast inference for real-time applications
4. Enable streaming for immediate token delivery
5. Integrate seamlessly with shared primitives
6. Maintain zero dependencies on other integration modules

### 1.4 Supported Models

| Model | Context Window | Use Case |
|-------|---------------|----------|
| llama-3.3-70b-versatile | 128K | General purpose, high quality |
| llama-3.1-70b-versatile | 128K | General purpose |
| llama-3.1-8b-instant | 128K | Fast responses, lower cost |
| llama-3.2-1b-preview | 128K | Ultra-fast, lightweight |
| llama-3.2-3b-preview | 128K | Fast, balanced |
| llama-3.2-11b-vision-preview | 128K | Multimodal vision |
| llama-3.2-90b-vision-preview | 128K | Large multimodal |
| mixtral-8x7b-32768 | 32K | Mixture of experts |
| gemma-7b-it | 8K | Instruction tuned |
| gemma2-9b-it | 8K | Improved instruction tuning |
| whisper-large-v3 | N/A | Audio transcription |
| whisper-large-v3-turbo | N/A | Fast audio transcription |
| distil-whisper-large-v3-en | N/A | English transcription |

---

## 2. Scope and Objectives

### 2.1 In Scope

| Category | Items |
|----------|-------|
| Chat Completions | Synchronous and streaming chat |
| Vision | Image understanding with vision models |
| Audio | Transcription and translation |
| Tool Use | Function calling with JSON schema |
| JSON Mode | Structured output generation |
| Models | Model listing and information |
| Authentication | API key management |
| Resilience | Retry, circuit breaker, rate limiting |
| Observability | Tracing, logging, metrics |

### 2.2 Out of Scope

| Category | Reason |
|----------|--------|
| Fine-tuning | Not available in Groq API |
| Embeddings | Not currently offered by Groq |
| Batch API | Groq focuses on real-time inference |
| File uploads | Not supported |
| Assistants API | Not available |
| Image generation | Not offered |

### 2.3 Objectives

| ID | Objective | Success Metric |
|----|-----------|----------------|
| OBJ-001 | Complete API coverage | 100% of production endpoints |
| OBJ-002 | Type safety | Zero runtime type errors |
| OBJ-003 | Low overhead | < 2ms client-side latency |
| OBJ-004 | Streaming efficiency | First token < 50ms overhead |
| OBJ-005 | Test coverage | > 80% line coverage |
| OBJ-006 | Documentation | 100% public API documented |

---

## 3. Groq API Overview

### 3.1 Base URL

```
https://api.groq.com/openai/v1
```

### 3.2 Authentication

All requests require an API key in the Authorization header:

```
Authorization: Bearer gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3.3 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/chat/completions` | POST | Chat completions (sync/stream) |
| `/audio/transcriptions` | POST | Audio to text |
| `/audio/translations` | POST | Audio to English text |
| `/models` | GET | List available models |
| `/models/{model}` | GET | Get model details |

### 3.4 Rate Limits

Groq implements rate limiting based on:

| Limit Type | Description |
|------------|-------------|
| Requests per minute (RPM) | Total API calls |
| Requests per day (RPD) | Daily request quota |
| Tokens per minute (TPM) | Input + output tokens |
| Tokens per day (TPD) | Daily token quota |

Rate limits vary by model and account tier.

### 3.5 Response Headers

| Header | Description |
|--------|-------------|
| `x-ratelimit-limit-requests` | Request limit |
| `x-ratelimit-limit-tokens` | Token limit |
| `x-ratelimit-remaining-requests` | Remaining requests |
| `x-ratelimit-remaining-tokens` | Remaining tokens |
| `x-ratelimit-reset-requests` | Request limit reset time |
| `x-ratelimit-reset-tokens` | Token limit reset time |
| `x-request-id` | Unique request identifier |

---

## 4. Functional Requirements

### 4.1 Chat Completions

#### FR-CHAT-001: Synchronous Chat Completion

**Description:** Execute a synchronous chat completion request.

**Input:**
- Model identifier (required)
- Messages array (required)
- Temperature (optional, 0.0-2.0)
- Max tokens (optional)
- Top P (optional, 0.0-1.0)
- Stop sequences (optional)
- Frequency penalty (optional, -2.0-2.0)
- Presence penalty (optional, -2.0-2.0)
- Response format (optional)
- Seed (optional)
- User identifier (optional)

**Output:**
- Completion ID
- Model used
- Created timestamp
- Choices array with message content
- Usage statistics (prompt tokens, completion tokens, total tokens)
- System fingerprint

**Acceptance Criteria:**
- [ ] Returns well-formed completion response
- [ ] Validates all input parameters
- [ ] Handles model-specific constraints
- [ ] Includes accurate token usage

#### FR-CHAT-002: Streaming Chat Completion

**Description:** Execute a streaming chat completion with Server-Sent Events.

**Input:** Same as FR-CHAT-001 with `stream: true`

**Output:**
- Stream of delta chunks
- Each chunk contains incremental content
- Final chunk includes usage statistics (with `stream_options.include_usage`)

**Acceptance Criteria:**
- [ ] Delivers tokens as they're generated
- [ ] Handles SSE format correctly
- [ ] Supports stream cancellation
- [ ] Provides usage in final chunk when requested

#### FR-CHAT-003: Multi-Turn Conversations

**Description:** Support conversations with message history.

**Message Roles:**
- `system`: System instructions
- `user`: User messages
- `assistant`: Model responses
- `tool`: Tool call results

**Acceptance Criteria:**
- [ ] Maintains conversation context
- [ ] Validates role sequences
- [ ] Enforces context window limits

#### FR-CHAT-004: Tool/Function Calling

**Description:** Support function calling for external integrations.

**Input:**
- Tools array with function definitions
- Tool choice (auto, none, required, or specific function)

**Tool Definition:**
```
{
  type: "function",
  function: {
    name: string,
    description: string,
    parameters: JSON Schema
  }
}
```

**Output:**
- Tool calls array with function name and arguments
- Finish reason: "tool_calls"

**Acceptance Criteria:**
- [ ] Validates JSON schema for parameters
- [ ] Returns properly formatted tool calls
- [ ] Supports parallel tool calls
- [ ] Handles tool choice constraints

#### FR-CHAT-005: JSON Mode

**Description:** Force structured JSON output.

**Input:**
- Response format: `{ type: "json_object" }`

**Acceptance Criteria:**
- [ ] Returns valid JSON in response
- [ ] Validates JSON structure
- [ ] Handles parsing errors gracefully

#### FR-CHAT-006: Vision Support

**Description:** Process images with vision-capable models.

**Input:**
- Content array with text and image parts
- Image as URL or base64 encoded

**Image Content:**
```
{
  type: "image_url",
  image_url: {
    url: string,  // URL or data:image/...;base64,...
    detail: "low" | "high" | "auto"  // optional
  }
}
```

**Supported Models:**
- llama-3.2-11b-vision-preview
- llama-3.2-90b-vision-preview

**Acceptance Criteria:**
- [ ] Processes images via URL
- [ ] Processes base64-encoded images
- [ ] Validates vision model selection
- [ ] Handles image size constraints

### 4.2 Audio Services

#### FR-AUDIO-001: Audio Transcription

**Description:** Transcribe audio to text using Whisper models.

**Input:**
- Audio file (required) - file, file path, or bytes
- Model (required) - whisper-large-v3, whisper-large-v3-turbo, distil-whisper-large-v3-en
- Language (optional) - ISO 639-1 code
- Prompt (optional) - context/vocabulary hints
- Response format (optional) - json, text, verbose_json, srt, vtt
- Temperature (optional) - 0.0-1.0
- Timestamp granularities (optional) - word, segment

**Supported Formats:**
- flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm

**Output:**
- Transcribed text
- Language detected (verbose_json)
- Duration (verbose_json)
- Word-level timestamps (verbose_json with word granularity)
- Segment timestamps (verbose_json)

**Acceptance Criteria:**
- [ ] Transcribes audio accurately
- [ ] Supports all audio formats
- [ ] Returns appropriate response format
- [ ] Provides timestamps when requested

#### FR-AUDIO-002: Audio Translation

**Description:** Translate audio to English text.

**Input:** Same as FR-AUDIO-001

**Output:**
- English translation of audio content
- Same metadata options as transcription

**Acceptance Criteria:**
- [ ] Translates non-English audio to English
- [ ] Maintains accuracy of translation
- [ ] Supports all input formats

### 4.3 Models Service

#### FR-MODELS-001: List Models

**Description:** Retrieve available models.

**Output:**
- Array of model objects
- Each model includes: id, object, created, owned_by

**Acceptance Criteria:**
- [ ] Returns complete model list
- [ ] Includes model metadata
- [ ] Handles pagination if needed

#### FR-MODELS-002: Get Model Details

**Description:** Retrieve specific model information.

**Input:**
- Model ID (required)

**Output:**
- Model ID
- Object type
- Created timestamp
- Owned by

**Acceptance Criteria:**
- [ ] Returns model details
- [ ] Handles non-existent models
- [ ] Validates model ID format

### 4.4 Client Management

#### FR-CLIENT-001: Client Initialization

**Description:** Create and configure Groq client instance.

**Configuration:**
- API key (required)
- Base URL (optional, default: https://api.groq.com/openai/v1)
- Timeout (optional, default: 60s)
- Max retries (optional, default: 3)
- Custom headers (optional)

**Acceptance Criteria:**
- [ ] Validates API key format
- [ ] Applies default configuration
- [ ] Supports custom base URL
- [ ] Enables header customization

#### FR-CLIENT-002: Request Timeout

**Description:** Configure and enforce request timeouts.

**Acceptance Criteria:**
- [ ] Applies configured timeout
- [ ] Supports per-request timeout override
- [ ] Handles timeout errors gracefully

#### FR-CLIENT-003: Concurrent Requests

**Description:** Support multiple simultaneous requests.

**Acceptance Criteria:**
- [ ] Thread-safe client operations
- [ ] Connection pooling
- [ ] No request interference

---

## 5. Non-Functional Requirements

### 5.1 Performance

#### NFR-PERF-001: Client Latency Overhead

**Requirement:** Client-side processing adds < 2ms latency.

**Rationale:** Groq's value is ultra-low latency; client overhead must be minimal.

**Measurement:** p99 latency of client processing (excluding network).

#### NFR-PERF-002: Streaming First Token

**Requirement:** First streamed token delivered within 50ms of receipt.

**Rationale:** Real-time applications need immediate token delivery.

**Measurement:** Time from SSE event receipt to application callback.

#### NFR-PERF-003: Memory Efficiency

**Requirement:** Streaming uses bounded memory regardless of response size.

**Rationale:** Large responses should not cause memory issues.

**Measurement:** Memory profile during 100K token streaming response.

#### NFR-PERF-004: Connection Reuse

**Requirement:** HTTP connections reused for sequential requests.

**Rationale:** Connection setup overhead impacts latency.

**Measurement:** Connection metrics during request sequences.

### 5.2 Reliability

#### NFR-REL-001: Retry with Backoff

**Requirement:** Automatic retry for transient failures with exponential backoff.

**Retryable Conditions:**
- HTTP 429 (Rate Limited)
- HTTP 500 (Internal Server Error)
- HTTP 502 (Bad Gateway)
- HTTP 503 (Service Unavailable)
- HTTP 504 (Gateway Timeout)
- Network connection errors
- Timeout errors

**Configuration:**
- Max retries: configurable (default: 3)
- Initial delay: configurable (default: 1s)
- Max delay: configurable (default: 60s)
- Backoff multiplier: configurable (default: 2.0)
- Jitter: enabled by default

#### NFR-REL-002: Circuit Breaker

**Requirement:** Circuit breaker prevents cascade failures.

**States:**
- Closed: Normal operation
- Open: Requests fail fast
- Half-Open: Limited requests to test recovery

**Thresholds:**
- Failure threshold: configurable (default: 5)
- Success threshold: configurable (default: 3)
- Reset timeout: configurable (default: 30s)

#### NFR-REL-003: Rate Limit Handling

**Requirement:** Respect and handle Groq rate limits gracefully.

**Behavior:**
- Parse rate limit headers
- Proactive throttling when approaching limits
- Queue requests when rate limited
- Expose rate limit status to callers

#### NFR-REL-004: Graceful Degradation

**Requirement:** Provide meaningful errors when service unavailable.

**Behavior:**
- Clear error messages
- Retry-After header respect
- Partial response handling

### 5.3 Security

#### NFR-SEC-001: Credential Protection

**Requirement:** API keys never logged or exposed.

**Implementation:**
- SecretString wrapper for API keys
- Redacted logging
- Secure memory handling

#### NFR-SEC-002: TLS Enforcement

**Requirement:** All connections use TLS 1.2 or higher.

**Implementation:**
- Reject non-HTTPS URLs
- Certificate validation
- No TLS downgrade

#### NFR-SEC-003: Input Validation

**Requirement:** Validate all inputs before transmission.

**Validation:**
- Parameter type checking
- Range validation
- Schema validation for tool definitions

#### NFR-SEC-004: Audit Logging

**Requirement:** Security-relevant events are logged.

**Events:**
- Authentication failures
- Rate limit exceeded
- Configuration changes

### 5.4 Observability

#### NFR-OBS-001: Distributed Tracing

**Requirement:** All operations emit trace spans.

**Span Attributes:**
- `groq.model`: Model identifier
- `groq.operation`: Operation type
- `groq.tokens.prompt`: Input token count
- `groq.tokens.completion`: Output token count
- `groq.request_id`: Groq request ID
- `groq.latency_ms`: Response time

#### NFR-OBS-002: Structured Logging

**Requirement:** Consistent, structured log output.

**Log Levels:**
- ERROR: Failures and exceptions
- WARN: Rate limits, retries
- INFO: Request/response summaries
- DEBUG: Detailed operation data
- TRACE: Full payloads (excluding secrets)

#### NFR-OBS-003: Metrics

**Requirement:** Expose operational metrics.

**Metrics:**
- `groq_requests_total`: Request count by model, status
- `groq_request_duration_seconds`: Latency histogram
- `groq_tokens_total`: Token usage by type
- `groq_rate_limit_remaining`: Current rate limit headroom
- `groq_circuit_breaker_state`: Circuit breaker status

### 5.5 Maintainability

#### NFR-MAINT-001: Code Coverage

**Requirement:** Minimum 80% line coverage, 70% branch coverage.

#### NFR-MAINT-002: Documentation

**Requirement:** All public APIs documented with examples.

#### NFR-MAINT-003: Semantic Versioning

**Requirement:** Follow semver for all releases.

---

## 6. System Constraints

### 6.1 Dependency Constraints

#### CON-DEP-001: No Cross-Module Dependencies

**Constraint:** Module MUST NOT depend on other integration modules.

**Prohibited:**
- OpenAI integration
- Anthropic integration
- Mistral integration
- Cohere integration
- Any other provider module

#### CON-DEP-002: Shared Primitives Only

**Constraint:** External dependencies limited to shared primitives.

**Allowed Primitives:**
| Primitive | Purpose |
|-----------|---------|
| `errors` | Common error types |
| `retry` | Retry logic |
| `circuit-breaker` | Circuit breaker |
| `rate-limit` | Rate limiting |
| `tracing` | Distributed tracing |
| `logging` | Structured logging |
| `types` | Common types |
| `config` | Configuration |

#### CON-DEP-003: No ruvbase

**Constraint:** Module MUST NOT implement or reference ruvbase.

### 6.2 Technical Constraints

#### CON-TECH-001: Async-First Design

**Constraint:** All I/O operations must be async.

**Rationale:** Non-blocking for high-throughput applications.

#### CON-TECH-002: OpenAI Compatibility

**Constraint:** API design should align with OpenAI patterns where applicable.

**Rationale:** Groq's API is OpenAI-compatible; familiar patterns reduce learning curve.

#### CON-TECH-003: Streaming via SSE

**Constraint:** Streaming must use Server-Sent Events.

**Rationale:** Groq API uses SSE for streaming responses.

### 6.3 Design Constraints

#### CON-DES-001: London-School TDD

**Constraint:** Follow London-School TDD principles.

**Requirements:**
- Interface-first design
- Mock-based testing
- Dependency injection
- Test doubles at boundaries

#### CON-DES-002: Hexagonal Architecture

**Constraint:** Use ports and adapters pattern.

**Structure:**
- Ports: Service interfaces
- Adapters: HTTP implementation
- Core: Business logic

#### CON-DES-003: SOLID Principles

**Constraint:** Adhere to SOLID design principles.

| Principle | Application |
|-----------|-------------|
| Single Responsibility | One service per concern |
| Open/Closed | Extension via interfaces |
| Liskov Substitution | Mock substitutability |
| Interface Segregation | Fine-grained ports |
| Dependency Inversion | Depend on abstractions |

---

## 7. Interface Specifications

### 7.1 Client Interface

```
interface GroqClient {
    // Chat completions
    chat(): ChatService

    // Audio services
    audio(): AudioService

    // Models service
    models(): ModelsService

    // Client configuration
    config(): ClientConfig

    // Health check
    health_check(): Result<HealthStatus>
}
```

### 7.2 Chat Service Interface

```
interface ChatService {
    // Synchronous completion
    create(request: ChatRequest): Result<ChatResponse>

    // Streaming completion
    create_stream(request: ChatRequest): Result<Stream<ChatChunk>>

    // With timeout override
    create_with_timeout(request: ChatRequest, timeout: Duration): Result<ChatResponse>
}
```

### 7.3 Audio Service Interface

```
interface AudioService {
    // Transcribe audio to text
    transcribe(request: TranscriptionRequest): Result<TranscriptionResponse>

    // Translate audio to English
    translate(request: TranslationRequest): Result<TranslationResponse>
}
```

### 7.4 Models Service Interface

```
interface ModelsService {
    // List all available models
    list(): Result<ModelList>

    // Get specific model details
    get(model_id: String): Result<Model>
}
```

### 7.5 Configuration Interface

```
interface ClientConfig {
    // API key (secret)
    api_key: SecretString

    // Base URL
    base_url: String

    // Request timeout
    timeout: Duration

    // Retry configuration
    retry_config: RetryConfig

    // Circuit breaker configuration
    circuit_breaker_config: CircuitBreakerConfig

    // Rate limit configuration
    rate_limit_config: RateLimitConfig

    // Custom headers
    default_headers: Map<String, String>
}
```

### 7.6 Builder Interface

```
interface GroqClientBuilder {
    // Set API key
    api_key(key: SecretString): Self

    // Set base URL
    base_url(url: String): Self

    // Set timeout
    timeout(duration: Duration): Self

    // Set max retries
    max_retries(count: u32): Self

    // Set retry config
    retry_config(config: RetryConfig): Self

    // Set circuit breaker config
    circuit_breaker_config(config: CircuitBreakerConfig): Self

    // Set rate limit config
    rate_limit_config(config: RateLimitConfig): Self

    // Add default header
    default_header(name: String, value: String): Self

    // Build client
    build(): Result<GroqClient>
}
```

---

## 8. Data Models

### 8.1 Chat Models

#### ChatRequest

```
ChatRequest {
    model: String                           // Required: model ID
    messages: Vec<Message>                  // Required: conversation messages
    temperature: Option<f32>                // Optional: 0.0-2.0
    max_tokens: Option<u32>                 // Optional: max completion tokens
    top_p: Option<f32>                      // Optional: 0.0-1.0
    stop: Option<Vec<String>>               // Optional: stop sequences
    frequency_penalty: Option<f32>          // Optional: -2.0-2.0
    presence_penalty: Option<f32>           // Optional: -2.0-2.0
    response_format: Option<ResponseFormat> // Optional: json_object
    seed: Option<i64>                       // Optional: for reproducibility
    tools: Option<Vec<Tool>>                // Optional: function definitions
    tool_choice: Option<ToolChoice>         // Optional: auto|none|required|specific
    user: Option<String>                    // Optional: end-user ID
    stream: Option<bool>                    // Optional: enable streaming
    stream_options: Option<StreamOptions>   // Optional: streaming configuration
}
```

#### Message

```
Message {
    role: Role                              // system|user|assistant|tool
    content: Content                        // text or multipart content
    name: Option<String>                    // Optional: participant name
    tool_calls: Option<Vec<ToolCall>>       // For assistant messages
    tool_call_id: Option<String>            // For tool messages
}

enum Role {
    System,
    User,
    Assistant,
    Tool
}

enum Content {
    Text(String),
    Parts(Vec<ContentPart>)
}

enum ContentPart {
    Text { text: String },
    ImageUrl {
        image_url: ImageUrl
    }
}

struct ImageUrl {
    url: String,                            // URL or base64 data URI
    detail: Option<ImageDetail>             // low|high|auto
}

enum ImageDetail {
    Low,
    High,
    Auto
}
```

#### ChatResponse

```
ChatResponse {
    id: String                              // Unique completion ID
    object: String                          // "chat.completion"
    created: i64                            // Unix timestamp
    model: String                           // Model used
    choices: Vec<Choice>                    // Response choices
    usage: Usage                            // Token usage
    system_fingerprint: Option<String>      // System identifier
    x_groq: Option<GroqMetadata>           // Groq-specific metadata
}

struct Choice {
    index: u32                              // Choice index
    message: AssistantMessage               // Generated message
    finish_reason: FinishReason             // stop|length|tool_calls|content_filter
    logprobs: Option<LogProbs>              // Token log probabilities
}

struct AssistantMessage {
    role: Role                              // Always "assistant"
    content: Option<String>                 // Generated text
    tool_calls: Option<Vec<ToolCall>>       // Function calls
}

enum FinishReason {
    Stop,
    Length,
    ToolCalls,
    ContentFilter
}

struct Usage {
    prompt_tokens: u32                      // Input tokens
    completion_tokens: u32                  // Output tokens
    total_tokens: u32                       // Total tokens
    prompt_time: Option<f64>                // Prompt processing time
    completion_time: Option<f64>            // Completion generation time
    total_time: Option<f64>                 // Total processing time
}
```

#### ChatChunk (Streaming)

```
ChatChunk {
    id: String                              // Completion ID
    object: String                          // "chat.completion.chunk"
    created: i64                            // Unix timestamp
    model: String                           // Model used
    choices: Vec<ChunkChoice>               // Delta choices
    usage: Option<Usage>                    // Final chunk only
    x_groq: Option<GroqMetadata>           // Groq-specific metadata
}

struct ChunkChoice {
    index: u32                              // Choice index
    delta: Delta                            // Incremental content
    finish_reason: Option<FinishReason>     // Set on final chunk
    logprobs: Option<LogProbs>              // Token log probabilities
}

struct Delta {
    role: Option<Role>                      // First chunk only
    content: Option<String>                 // Incremental text
    tool_calls: Option<Vec<ToolCallDelta>>  // Incremental tool calls
}

struct ToolCallDelta {
    index: u32                              // Tool call index
    id: Option<String>                      // First delta only
    type: Option<String>                    // First delta only
    function: Option<FunctionDelta>         // Function details
}

struct FunctionDelta {
    name: Option<String>                    // First delta only
    arguments: Option<String>               // Incremental arguments
}
```

### 8.2 Tool Models

```
struct Tool {
    type: String                            // "function"
    function: FunctionDefinition            // Function specification
}

struct FunctionDefinition {
    name: String                            // Function name
    description: Option<String>             // Function description
    parameters: Option<JsonSchema>          // JSON Schema for parameters
}

struct ToolCall {
    id: String                              // Unique tool call ID
    type: String                            // "function"
    function: FunctionCall                  // Function invocation
}

struct FunctionCall {
    name: String                            // Function name
    arguments: String                       // JSON arguments string
}

enum ToolChoice {
    Auto,                                   // Model decides
    None,                                   // No tool use
    Required,                               // Must use a tool
    Function { name: String }               // Specific function
}
```

### 8.3 Audio Models

#### TranscriptionRequest

```
TranscriptionRequest {
    file: AudioFile                         // Required: audio data
    model: String                           // Required: whisper model
    language: Option<String>                // Optional: ISO 639-1 code
    prompt: Option<String>                  // Optional: context hint
    response_format: Option<AudioFormat>    // Optional: output format
    temperature: Option<f32>                // Optional: 0.0-1.0
    timestamp_granularities: Option<Vec<Granularity>> // Optional: word|segment
}

enum AudioFile {
    Path(PathBuf),                          // File path
    Bytes { data: Vec<u8>, filename: String }, // Raw bytes
    Url(String)                             // URL (if supported)
}

enum AudioFormat {
    Json,                                   // JSON response
    Text,                                   // Plain text
    VerboseJson,                            // Detailed JSON
    Srt,                                    // SubRip subtitle
    Vtt                                     // WebVTT subtitle
}

enum Granularity {
    Word,
    Segment
}
```

#### TranscriptionResponse

```
TranscriptionResponse {
    text: String                            // Transcribed text
    task: Option<String>                    // "transcribe"
    language: Option<String>                // Detected language
    duration: Option<f64>                   // Audio duration in seconds
    words: Option<Vec<Word>>                // Word-level timestamps
    segments: Option<Vec<Segment>>          // Segment-level timestamps
}

struct Word {
    word: String                            // Word text
    start: f64                              // Start time (seconds)
    end: f64                                // End time (seconds)
}

struct Segment {
    id: u32                                 // Segment ID
    start: f64                              // Start time (seconds)
    end: f64                                // End time (seconds)
    text: String                            // Segment text
    tokens: Vec<u32>                        // Token IDs
    temperature: f64                        // Generation temperature
    avg_logprob: f64                        // Average log probability
    compression_ratio: f64                  // Compression ratio
    no_speech_prob: f64                     // No speech probability
}
```

#### TranslationRequest

```
TranslationRequest {
    file: AudioFile                         // Required: audio data
    model: String                           // Required: whisper model
    prompt: Option<String>                  // Optional: context hint
    response_format: Option<AudioFormat>    // Optional: output format
    temperature: Option<f32>                // Optional: 0.0-1.0
}
```

#### TranslationResponse

```
TranslationResponse {
    text: String                            // Translated English text
    task: Option<String>                    // "translate"
    language: Option<String>                // Source language
    duration: Option<f64>                   // Audio duration
    segments: Option<Vec<Segment>>          // Segment timestamps
}
```

### 8.4 Models Data

```
struct ModelList {
    object: String                          // "list"
    data: Vec<Model>                        // Available models
}

struct Model {
    id: String                              // Model identifier
    object: String                          // "model"
    created: i64                            // Creation timestamp
    owned_by: String                        // Owner identifier
}
```

### 8.5 Response Format

```
struct ResponseFormat {
    type: ResponseFormatType                // Format type
}

enum ResponseFormatType {
    Text,                                   // Default text
    JsonObject                              // Structured JSON
}

struct StreamOptions {
    include_usage: Option<bool>             // Include usage in final chunk
}
```

### 8.6 Groq-Specific Metadata

```
struct GroqMetadata {
    id: Option<String>                      // Internal request ID
    usage: Option<GroqUsage>                // Detailed timing
}

struct GroqUsage {
    queue_time: Option<f64>                 // Time in queue (seconds)
    prompt_time: Option<f64>                // Prompt processing time
    completion_time: Option<f64>            // Completion generation time
    total_time: Option<f64>                 // Total request time
}
```

---

## 9. Error Handling Specification

### 9.1 Error Categories

| Category | HTTP Status | Retryable | Description |
|----------|-------------|-----------|-------------|
| Authentication | 401 | No | Invalid API key |
| Authorization | 403 | No | Insufficient permissions |
| NotFound | 404 | No | Resource not found |
| Validation | 400 | No | Invalid request parameters |
| RateLimit | 429 | Yes | Rate limit exceeded |
| ServerError | 500 | Yes | Internal server error |
| ServiceUnavailable | 503 | Yes | Service temporarily unavailable |
| Timeout | - | Yes | Request timeout |
| Network | - | Yes | Connection error |

### 9.2 Error Response Format

```
GroqError {
    error: ErrorDetail {
        message: String                     // Human-readable message
        type: String                        // Error type
        code: Option<String>                // Error code
        param: Option<String>               // Related parameter
    }
}
```

### 9.3 Error Type Hierarchy

```
enum GroqError {
    // Authentication errors
    AuthenticationError {
        message: String,
        api_key_hint: Option<String>        // Last 4 chars for debugging
    },

    // Authorization errors
    AuthorizationError {
        message: String,
        required_permission: Option<String>
    },

    // Validation errors
    ValidationError {
        message: String,
        param: Option<String>,
        value: Option<String>
    },

    // Rate limit errors
    RateLimitError {
        message: String,
        retry_after: Option<Duration>,
        limit_type: RateLimitType           // requests|tokens
    },

    // Model errors
    ModelError {
        message: String,
        model: String,
        available_models: Option<Vec<String>>
    },

    // Content filter errors
    ContentFilterError {
        message: String,
        filtered_categories: Vec<String>
    },

    // Context length errors
    ContextLengthError {
        message: String,
        max_context: u32,
        requested: u32
    },

    // Server errors
    ServerError {
        message: String,
        status_code: u16,
        request_id: Option<String>
    },

    // Timeout errors
    TimeoutError {
        message: String,
        timeout: Duration,
        operation: String
    },

    // Network errors
    NetworkError {
        message: String,
        cause: Option<String>
    },

    // Streaming errors
    StreamError {
        message: String,
        partial_content: Option<String>
    }
}

enum RateLimitType {
    Requests,
    Tokens
}
```

### 9.4 Error Mapping

| Groq Error Type | Internal Error Type |
|-----------------|---------------------|
| `invalid_api_key` | `AuthenticationError` |
| `insufficient_quota` | `RateLimitError` |
| `invalid_request_error` | `ValidationError` |
| `model_not_found` | `ModelError` |
| `context_length_exceeded` | `ContextLengthError` |
| `content_filter` | `ContentFilterError` |
| `server_error` | `ServerError` |
| `service_unavailable` | `ServerError` |

---

## 10. Use Case Scenarios

### 10.1 UC-001: Real-Time Chat Application

**Actor:** Application Developer

**Preconditions:**
- Valid Groq API key
- Network connectivity

**Flow:**
1. Developer initializes Groq client with API key
2. Developer creates chat request with user message
3. Developer calls streaming chat completion
4. System returns token stream
5. Application displays tokens as received
6. Stream completes with finish reason

**Postconditions:**
- Complete response delivered
- Token usage recorded
- Latency metrics captured

**Sequence Diagram:**
```
Developer        GroqClient         ChatService         Groq API
    |                |                   |                  |
    |--create()----->|                   |                  |
    |                |--create_stream()-->|                 |
    |                |                   |--POST /chat----->|
    |                |                   |<--SSE stream-----|
    |<--Stream<Chunk>|<------------------|                  |
    |    (tokens)    |                   |                  |
    |<--final chunk--|                   |                  |
    |    (usage)     |                   |                  |
```

### 10.2 UC-002: Function Calling Integration

**Actor:** Application Developer

**Preconditions:**
- Valid Groq API key
- Function definitions prepared

**Flow:**
1. Developer defines tool functions with JSON schemas
2. Developer creates chat request with tools
3. System returns tool call with arguments
4. Application executes function with arguments
5. Developer sends tool result back
6. System returns final response

**Sequence Diagram:**
```
Developer        GroqClient         Groq API         External Tool
    |                |                  |                  |
    |--create()----->|                  |                  |
    |  (with tools)  |--POST /chat----->|                  |
    |                |<--tool_calls-----|                  |
    |<--ToolCall-----|                  |                  |
    |                |                  |                  |
    |--------------------------------------------execute-->|
    |<-------------------------------------------result----|
    |                |                  |                  |
    |--create()----->|                  |                  |
    |  (tool result) |--POST /chat----->|                  |
    |                |<--completion-----|                  |
    |<--Response-----|                  |                  |
```

### 10.3 UC-003: Vision Analysis

**Actor:** Application Developer

**Preconditions:**
- Valid Groq API key
- Image accessible (URL or base64)
- Vision-capable model available

**Flow:**
1. Developer prepares image content (URL or base64)
2. Developer creates chat request with image and text
3. Developer specifies vision model
4. System processes multimodal content
5. Model returns image analysis

**Sequence Diagram:**
```
Developer        GroqClient         Groq API
    |                |                  |
    |--create()----->|                  |
    | (image+text)   |--POST /chat----->|
    |                |   (multimodal)   |
    |                |<--completion-----|
    |<--Response-----|                  |
    |  (analysis)    |                  |
```

### 10.4 UC-004: Audio Transcription

**Actor:** Application Developer

**Preconditions:**
- Valid Groq API key
- Audio file available
- Whisper model access

**Flow:**
1. Developer loads audio file
2. Developer creates transcription request
3. System uploads audio to Groq
4. Whisper model processes audio
5. System returns transcription with timestamps

**Sequence Diagram:**
```
Developer        GroqClient       AudioService        Groq API
    |                |                 |                  |
    |--transcribe()-->|                |                  |
    |                |--transcribe()--->|                 |
    |                |                 |--POST /audio---->|
    |                |                 |   (multipart)    |
    |                |                 |<--transcription--|
    |<--Response-----|<----------------|                  |
    |  (text+times)  |                 |                  |
```

### 10.5 UC-005: JSON Structured Output

**Actor:** Application Developer

**Preconditions:**
- Valid Groq API key

**Flow:**
1. Developer creates request with JSON response format
2. Developer includes schema guidance in prompt
3. System requests JSON mode completion
4. Model returns structured JSON
5. Application parses and validates JSON

**Sequence Diagram:**
```
Developer        GroqClient         Groq API
    |                |                  |
    |--create()----->|                  |
    | (json_object)  |--POST /chat----->|
    |                |  (response_fmt)  |
    |                |<--JSON response--|
    |<--Response-----|                  |
    |  (valid JSON)  |                  |
    |                |                  |
    |--parse JSON----|                  |
```

### 10.6 UC-006: Rate Limit Recovery

**Actor:** System

**Preconditions:**
- Active request stream
- Rate limit approaching

**Flow:**
1. System sends request
2. Groq returns 429 with rate limit info
3. System parses retry-after header
4. System waits for specified duration
5. System retries request
6. Request succeeds

**Sequence Diagram:**
```
GroqClient       RetryPolicy        Groq API
    |                |                  |
    |--request------>|                  |
    |                |--POST /chat----->|
    |                |<--429 + headers--|
    |                |                  |
    |                |--parse headers---|
    |                |--wait(retry_after)|
    |                |                  |
    |                |--POST /chat----->|
    |                |<--200 response---|
    |<--response-----|                  |
```

---

## 11. Acceptance Criteria

### 11.1 Chat Service Acceptance

| ID | Criterion | Test Method |
|----|-----------|-------------|
| AC-CHAT-001 | Synchronous completion returns valid response | Unit test |
| AC-CHAT-002 | Streaming delivers tokens incrementally | Integration test |
| AC-CHAT-003 | Multi-turn context preserved | Integration test |
| AC-CHAT-004 | Tool calls formatted correctly | Unit test |
| AC-CHAT-005 | JSON mode returns valid JSON | Unit test |
| AC-CHAT-006 | Vision models process images | Integration test |
| AC-CHAT-007 | Temperature affects randomness | Property test |
| AC-CHAT-008 | Max tokens limits output | Unit test |
| AC-CHAT-009 | Stop sequences terminate generation | Unit test |

### 11.2 Audio Service Acceptance

| ID | Criterion | Test Method |
|----|-----------|-------------|
| AC-AUDIO-001 | Transcription returns text | Integration test |
| AC-AUDIO-002 | Translation produces English | Integration test |
| AC-AUDIO-003 | Timestamps accurate | Integration test |
| AC-AUDIO-004 | All audio formats supported | Unit test |
| AC-AUDIO-005 | Language detection works | Integration test |

### 11.3 Models Service Acceptance

| ID | Criterion | Test Method |
|----|-----------|-------------|
| AC-MODELS-001 | List returns all models | Integration test |
| AC-MODELS-002 | Get returns model details | Integration test |
| AC-MODELS-003 | Invalid model returns error | Unit test |

### 11.4 Client Acceptance

| ID | Criterion | Test Method |
|----|-----------|-------------|
| AC-CLIENT-001 | Builder validates configuration | Unit test |
| AC-CLIENT-002 | Timeout enforced | Integration test |
| AC-CLIENT-003 | Concurrent requests work | Load test |
| AC-CLIENT-004 | Connection pooling active | Performance test |

### 11.5 Resilience Acceptance

| ID | Criterion | Test Method |
|----|-----------|-------------|
| AC-RES-001 | Retry on transient errors | Unit test |
| AC-RES-002 | Circuit breaker trips on failures | Unit test |
| AC-RES-003 | Rate limits respected | Integration test |
| AC-RES-004 | Backoff delays applied | Unit test |

### 11.6 Security Acceptance

| ID | Criterion | Test Method |
|----|-----------|-------------|
| AC-SEC-001 | API key not logged | Log inspection |
| AC-SEC-002 | TLS 1.2+ enforced | Integration test |
| AC-SEC-003 | Inputs validated | Fuzz test |

---

## 12. Glossary

| Term | Definition |
|------|------------|
| **LPU** | Language Processing Unit - Groq's custom inference hardware |
| **SSE** | Server-Sent Events - streaming protocol for real-time data |
| **Token** | Basic unit of text processing (approximately 4 characters) |
| **Whisper** | OpenAI's speech recognition model, hosted by Groq |
| **Tool** | Function that the model can invoke during generation |
| **JSON Mode** | Response format ensuring valid JSON output |
| **Circuit Breaker** | Pattern to prevent cascade failures |
| **Rate Limit** | API usage restrictions per time period |
| **Context Window** | Maximum tokens the model can process |
| **Temperature** | Parameter controlling response randomness |
| **Top P** | Nucleus sampling parameter |
| **Finish Reason** | Why the model stopped generating |
| **SecretString** | Wrapper type preventing accidental secret exposure |
| **Hexagonal Architecture** | Ports and adapters design pattern |
| **London-School TDD** | Test-driven development emphasizing mocks and interfaces |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-GROQ-SPEC-001 |
| Version | 1.0.0 |
| Created | 2025-01-15 |
| Last Modified | 2025-01-15 |
| Author | SPARC Methodology |
| Status | Draft |
| Classification | Internal |

---

## Appendix A: Groq API Response Examples

### A.1 Chat Completion Response

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1705312345,
  "model": "llama-3.3-70b-versatile",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop",
      "logprobs": null
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 9,
    "total_tokens": 19,
    "prompt_time": 0.001,
    "completion_time": 0.008,
    "total_time": 0.009
  },
  "system_fingerprint": "fp_abc123",
  "x_groq": {
    "id": "req_abc123",
    "usage": {
      "queue_time": 0.0001,
      "prompt_time": 0.001,
      "completion_time": 0.008,
      "total_time": 0.009
    }
  }
}
```

### A.2 Streaming Chunk

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion.chunk",
  "created": 1705312345,
  "model": "llama-3.3-70b-versatile",
  "choices": [
    {
      "index": 0,
      "delta": {
        "content": "Hello"
      },
      "finish_reason": null,
      "logprobs": null
    }
  ]
}
```

### A.3 Tool Call Response

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1705312345,
  "model": "llama-3.3-70b-versatile",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "function": {
              "name": "get_weather",
              "arguments": "{\"location\": \"San Francisco\", \"unit\": \"celsius\"}"
            }
          }
        ]
      },
      "finish_reason": "tool_calls",
      "logprobs": null
    }
  ],
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 25,
    "total_tokens": 75
  }
}
```

### A.4 Transcription Response (Verbose JSON)

```json
{
  "task": "transcribe",
  "language": "english",
  "duration": 10.5,
  "text": "Hello, this is a test transcription.",
  "words": [
    {"word": "Hello", "start": 0.0, "end": 0.5},
    {"word": "this", "start": 0.6, "end": 0.8},
    {"word": "is", "start": 0.9, "end": 1.0},
    {"word": "a", "start": 1.1, "end": 1.2},
    {"word": "test", "start": 1.3, "end": 1.6},
    {"word": "transcription", "start": 1.7, "end": 2.3}
  ],
  "segments": [
    {
      "id": 0,
      "start": 0.0,
      "end": 2.5,
      "text": "Hello, this is a test transcription.",
      "tokens": [50364, 2425, 11, 341, 307],
      "temperature": 0.0,
      "avg_logprob": -0.25,
      "compression_ratio": 1.2,
      "no_speech_prob": 0.01
    }
  ]
}
```

### A.5 Error Response

```json
{
  "error": {
    "message": "Invalid API key provided",
    "type": "invalid_api_key",
    "code": "invalid_api_key",
    "param": null
  }
}
```

---

## Appendix B: Rate Limit Headers

```
x-ratelimit-limit-requests: 30
x-ratelimit-limit-tokens: 30000
x-ratelimit-remaining-requests: 29
x-ratelimit-remaining-tokens: 29950
x-ratelimit-reset-requests: 2s
x-ratelimit-reset-tokens: 100ms
x-request-id: req_abc123
```

---

**End of Specification Document**

*SPARC Phase 1 Complete - Awaiting "Next phase." to proceed to Pseudocode*
