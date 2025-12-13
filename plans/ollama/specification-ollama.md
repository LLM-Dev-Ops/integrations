# Specification: Ollama Integration Module

## SPARC Phase 1: Specification

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/ollama`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Scope and Objectives](#2-scope-and-objectives)
3. [Ollama API Overview](#3-ollama-api-overview)
4. [Functional Requirements](#4-functional-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [System Constraints](#6-system-constraints)
7. [Interface Specifications](#7-interface-specifications)
8. [Data Models](#8-data-models)
9. [Error Handling Specification](#9-error-handling-specification)
10. [Developer Workflow Scenarios](#10-developer-workflow-scenarios)
11. [Acceptance Criteria](#11-acceptance-criteria)
12. [Glossary](#12-glossary)

---

## 1. Executive Summary

### 1.1 Purpose

This specification defines the requirements for the Ollama integration module within the LLM-Dev-Ops Integration Repository. Ollama provides local LLM inference capabilities, enabling developers to run models on their own hardware without external API dependencies.

### 1.2 Key Differentiators

Ollama's unique value proposition centers on:

- **Local Inference**: Run models on local hardware without internet dependency
- **Zero API Costs**: No per-token or per-request charges
- **Privacy**: Data never leaves the local environment
- **Model Flexibility**: Easy model switching and customization
- **Developer-First**: Rapid iteration without rate limits
- **OpenAI-Compatible**: Familiar API patterns for easy adoption

### 1.3 Module Goals

1. Provide a thin adapter layer connecting LLM Dev Ops to local Ollama runtime
2. Support rapid iteration workflows for local development
3. Enable offline inference capabilities
4. Facilitate model switching without code changes
5. Support streaming responses for interactive applications
6. Enable simulation/replay of inference calls for testing
7. Integrate with existing shared primitives (auth, logging, metrics, memory)

### 1.4 Design Philosophy

This integration is explicitly a **thin adapter layer**:
- No duplication of infrastructure, deployment, or core orchestration logic
- Leverage existing shared authentication, logging, metrics, and vector memory
- Focus on local and developer-scale workflows
- Minimal overhead for maximum performance

### 1.5 Supported Models (via Ollama)

| Model Family | Examples | Use Case |
|-------------|----------|----------|
| Llama | llama3.2, llama3.1, llama2 | General purpose |
| Mistral | mistral, mixtral | Efficient inference |
| CodeLlama | codellama | Code generation |
| Gemma | gemma2, gemma | Lightweight tasks |
| Phi | phi3, phi | Small footprint |
| Qwen | qwen2.5, qwen2 | Multilingual |
| DeepSeek | deepseek-coder | Code-focused |
| Custom | Any GGUF model | User-defined |

---

## 2. Scope and Objectives

### 2.1 In Scope

| Category | Items |
|----------|-------|
| Chat Completions | Synchronous and streaming chat |
| Text Generation | Raw completion API |
| Model Management | List, pull, show, delete models |
| Embeddings | Local embedding generation |
| Health Checks | Server status and connectivity |
| Simulation/Replay | Record and replay inference calls |
| Configuration | Flexible endpoint and model configuration |

### 2.2 Out of Scope

| Category | Reason |
|----------|--------|
| Model Training | Ollama focuses on inference only |
| Fine-tuning | Not supported by Ollama |
| Model Hosting | User manages their own Ollama instance |
| Cloud Deployment | This is for local inference only |
| GPU Management | Handled by Ollama runtime |
| Model Downloads | Ollama CLI handles this |

### 2.3 Objectives

| ID | Objective | Success Metric |
|----|-----------|----------------|
| OBJ-001 | Complete API coverage | 100% of Ollama endpoints |
| OBJ-002 | Type safety | Zero runtime type errors |
| OBJ-003 | Minimal overhead | < 1ms client-side latency |
| OBJ-004 | Offline capability | Works without internet |
| OBJ-005 | Test coverage | > 80% line coverage |
| OBJ-006 | Simulation support | Full record/replay |

---

## 3. Ollama API Overview

### 3.1 Base URL

```
http://localhost:11434
```

Default local endpoint; configurable for remote Ollama instances.

### 3.2 Authentication

Ollama does not require authentication by default. Optional token-based auth when running behind a proxy.

### 3.3 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/generate` | POST | Generate text completion |
| `/api/chat` | POST | Chat completion (sync/stream) |
| `/api/embeddings` | POST | Generate embeddings |
| `/api/tags` | GET | List local models |
| `/api/show` | POST | Show model details |
| `/api/pull` | POST | Pull model from registry |
| `/api/push` | POST | Push model to registry |
| `/api/delete` | DELETE | Delete local model |
| `/api/copy` | POST | Copy model |
| `/api/create` | POST | Create model from Modelfile |
| `/api/ps` | GET | List running models |
| `/` | GET | Health check |

### 3.4 OpenAI-Compatible Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | OpenAI-compatible chat |
| `/v1/completions` | POST | OpenAI-compatible completion |
| `/v1/embeddings` | POST | OpenAI-compatible embeddings |
| `/v1/models` | GET | OpenAI-compatible model list |

### 3.5 Rate Limits

None enforced by Ollama. Performance bounded by local hardware.

---

## 4. Functional Requirements

### 4.1 Chat Completions

#### FR-CHAT-001: Synchronous Chat Completion

**Description:** Execute a synchronous chat completion request.

**Input:**
- Model identifier (required)
- Messages array (required)
- Options (optional): temperature, top_p, top_k, num_predict, etc.
- Format (optional): json for structured output
- Keep alive (optional): model unload timeout

**Output:**
- Generated message content
- Model name
- Created timestamp
- Total duration
- Load duration
- Prompt eval count/duration
- Eval count/duration

**Acceptance Criteria:**
- [ ] Returns well-formed completion response
- [ ] Validates model availability
- [ ] Handles model loading transparently
- [ ] Reports accurate timing metrics

#### FR-CHAT-002: Streaming Chat Completion

**Description:** Execute a streaming chat completion with newline-delimited JSON.

**Input:** Same as FR-CHAT-001 with `stream: true`

**Output:**
- Stream of JSON objects with incremental content
- Final object includes complete metrics

**Acceptance Criteria:**
- [ ] Delivers tokens as generated
- [ ] Handles NDJSON format correctly
- [ ] Supports stream cancellation
- [ ] Provides metrics in final chunk

#### FR-CHAT-003: Multi-Turn Conversations

**Description:** Support conversations with message history.

**Message Roles:**
- `system`: System instructions
- `user`: User messages
- `assistant`: Model responses

**Acceptance Criteria:**
- [ ] Maintains conversation context
- [ ] Validates role sequences
- [ ] Respects context window limits

### 4.2 Text Generation

#### FR-GEN-001: Raw Text Generation

**Description:** Generate text from a prompt without chat formatting.

**Input:**
- Model identifier (required)
- Prompt (required)
- Options (optional): temperature, top_p, top_k, etc.
- System prompt (optional)
- Template (optional)
- Context (optional): conversation context array
- Raw mode (optional): bypass templating

**Output:**
- Generated text response
- Context array for continuation
- Timing metrics

**Acceptance Criteria:**
- [ ] Generates coherent completions
- [ ] Supports context continuation
- [ ] Handles raw mode correctly

### 4.3 Embeddings

#### FR-EMB-001: Generate Embeddings

**Description:** Generate vector embeddings for text.

**Input:**
- Model identifier (required)
- Prompt or Input (required): text to embed
- Options (optional): model parameters

**Output:**
- Embedding vector (float array)

**Acceptance Criteria:**
- [ ] Returns correct dimension vectors
- [ ] Supports batch embedding
- [ ] Validates embedding model

### 4.4 Model Management

#### FR-MODEL-001: List Models

**Description:** List locally available models.

**Output:**
- Array of model objects
- Each includes: name, size, digest, modified date

**Acceptance Criteria:**
- [ ] Returns complete model list
- [ ] Includes model metadata
- [ ] Handles empty model list

#### FR-MODEL-002: Show Model Details

**Description:** Get detailed information about a model.

**Input:**
- Model name (required)

**Output:**
- License
- Modelfile
- Parameters
- Template
- System prompt
- Details (family, parameter size, quantization)

**Acceptance Criteria:**
- [ ] Returns complete model info
- [ ] Handles model not found
- [ ] Parses Modelfile correctly

#### FR-MODEL-003: Check Running Models

**Description:** List models currently loaded in memory.

**Output:**
- Array of running models
- Each includes: name, size, VRAM usage, expires_at

**Acceptance Criteria:**
- [ ] Returns accurate running state
- [ ] Shows memory usage
- [ ] Reports expiration time

### 4.5 Health and Connectivity

#### FR-HEALTH-001: Health Check

**Description:** Verify Ollama server is running.

**Output:**
- Server status (running/unavailable)
- Version information (if available)

**Acceptance Criteria:**
- [ ] Detects server availability
- [ ] Reports connection errors clearly
- [ ] Supports timeout configuration

### 4.6 Simulation and Replay

#### FR-SIM-001: Record Inference Calls

**Description:** Record inference requests and responses for replay.

**Input:**
- Enable recording mode
- Storage location (memory or file)

**Output:**
- Recorded request/response pairs
- Timestamps and metadata

**Acceptance Criteria:**
- [ ] Captures complete request/response
- [ ] Stores timing information
- [ ] Supports file persistence

#### FR-SIM-002: Replay Inference Calls

**Description:** Replay recorded inference without hitting Ollama.

**Input:**
- Replay mode enabled
- Recording source

**Output:**
- Replayed responses matching original timing

**Acceptance Criteria:**
- [ ] Returns recorded responses
- [ ] Simulates timing optionally
- [ ] Reports replay status

### 4.7 OpenAI Compatibility Mode

#### FR-COMPAT-001: OpenAI-Compatible Chat

**Description:** Use OpenAI-compatible endpoint for easy migration.

**Acceptance Criteria:**
- [ ] Matches OpenAI request format
- [ ] Returns OpenAI response format
- [ ] Supports streaming

---

## 5. Non-Functional Requirements

### 5.1 Performance

#### NFR-PERF-001: Client Latency Overhead

**Requirement:** Client-side processing adds < 1ms latency.

**Rationale:** Local inference should minimize any additional overhead.

**Measurement:** p99 latency of client processing (excluding inference).

#### NFR-PERF-002: Streaming First Token

**Requirement:** First streamed token delivered within 10ms of receipt.

**Rationale:** Local streaming should be near-instantaneous.

**Measurement:** Time from NDJSON line receipt to callback.

#### NFR-PERF-003: Memory Efficiency

**Requirement:** Streaming uses bounded memory regardless of response size.

**Rationale:** Long generation should not cause memory issues.

**Measurement:** Memory profile during long streaming response.

#### NFR-PERF-004: Connection Reuse

**Requirement:** HTTP connections reused for sequential requests.

**Rationale:** Connection setup overhead impacts latency.

**Measurement:** Connection metrics during request sequences.

### 5.2 Reliability

#### NFR-REL-001: Graceful Reconnection

**Requirement:** Automatic reconnection when Ollama restarts.

**Retryable Conditions:**
- Connection refused (server starting)
- Connection reset
- Timeout errors

**Configuration:**
- Max retries: configurable (default: 3)
- Initial delay: configurable (default: 500ms)
- Max delay: configurable (default: 5s)

#### NFR-REL-002: Model Loading Handling

**Requirement:** Transparently handle model loading delays.

**Behavior:**
- Detect when model is loading
- Report loading progress if available
- Timeout configuration for slow loads

#### NFR-REL-003: Graceful Degradation

**Requirement:** Clear errors when server unavailable.

**Behavior:**
- Specific error for server not running
- Guidance on starting Ollama
- Offline mode indication

### 5.3 Security

#### NFR-SEC-001: Local-Only Default

**Requirement:** Default to localhost connections only.

**Implementation:**
- Default base URL is localhost
- Warn when connecting to remote endpoints
- Support explicit remote configuration

#### NFR-SEC-002: Optional Authentication

**Requirement:** Support token authentication when needed.

**Implementation:**
- Optional Bearer token configuration
- Header injection for proxied setups
- Credential protection in logs

#### NFR-SEC-003: Input Validation

**Requirement:** Validate all inputs before transmission.

**Validation:**
- Parameter type checking
- Range validation
- Model name sanitization

### 5.4 Observability

#### NFR-OBS-001: Distributed Tracing

**Requirement:** All operations emit trace spans.

**Span Attributes:**
- `ollama.model`: Model identifier
- `ollama.operation`: Operation type
- `ollama.prompt_tokens`: Input token count (if available)
- `ollama.completion_tokens`: Output token count
- `ollama.total_duration_ms`: Total inference time
- `ollama.load_duration_ms`: Model load time (if applicable)

#### NFR-OBS-002: Structured Logging

**Requirement:** Consistent, structured log output.

**Log Levels:**
- ERROR: Failures and connection errors
- WARN: Model loading delays, retries
- INFO: Request/response summaries
- DEBUG: Detailed operation data
- TRACE: Full payloads

#### NFR-OBS-003: Metrics

**Requirement:** Expose operational metrics.

**Metrics:**
- `ollama_requests_total`: Request count by model, status
- `ollama_request_duration_seconds`: Latency histogram
- `ollama_tokens_total`: Token usage by type
- `ollama_model_load_duration_seconds`: Model loading time
- `ollama_connection_status`: Server connectivity status

### 5.5 Developer Experience

#### NFR-DX-001: Quick Start

**Requirement:** Minimal configuration for basic usage.

**Implementation:**
- Default localhost endpoint
- Auto-detect running server
- Sensible defaults for all options

#### NFR-DX-002: Model Switching

**Requirement:** Easy model switching without code changes.

**Implementation:**
- Environment variable for default model
- Runtime model selection
- Model availability checking

#### NFR-DX-003: Offline Mode Detection

**Requirement:** Clear indication when offline.

**Implementation:**
- Detect server unavailability
- Provide helpful error messages
- Support graceful fallback

---

## 6. System Constraints

### 6.1 Dependency Constraints

#### CON-DEP-001: No Cross-Module Dependencies

**Constraint:** Module MUST NOT depend on other integration modules.

**Prohibited:**
- OpenAI integration
- Anthropic integration
- Groq integration
- Any other provider module

#### CON-DEP-002: Shared Primitives Only

**Constraint:** Use existing shared infrastructure.

**Allowed Primitives:**
| Primitive | Purpose |
|-----------|---------|
| `errors` | Common error types |
| `retry` | Retry logic |
| `circuit-breaker` | Circuit breaker |
| `tracing` | Distributed tracing |
| `logging` | Structured logging |
| `types` | Common types |
| `config` | Configuration |

#### CON-DEP-003: Thin Adapter Layer

**Constraint:** Module MUST remain a thin adapter.

**Requirements:**
- No custom infrastructure
- No deployment logic
- No orchestration duplication
- Delegate to shared primitives

### 6.2 Technical Constraints

#### CON-TECH-001: Async-First Design

**Constraint:** All I/O operations must be async.

**Rationale:** Non-blocking for responsive applications.

#### CON-TECH-002: Local-First Design

**Constraint:** Optimize for local inference scenarios.

**Rationale:** Primary use case is developer-scale workflows.

#### CON-TECH-003: Streaming via NDJSON

**Constraint:** Streaming must use newline-delimited JSON.

**Rationale:** Ollama API uses NDJSON for streaming responses.

### 6.3 Design Constraints

#### CON-DES-001: London-School TDD

**Constraint:** Follow London-School TDD principles.

**Requirements:**
- Interface-first design
- Mock-based testing
- Dependency injection

#### CON-DES-002: SOLID Principles

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
interface OllamaClient {
    // Chat completions
    chat(): ChatService

    // Text generation
    generate(): GenerateService

    // Embeddings
    embeddings(): EmbeddingsService

    // Model management
    models(): ModelsService

    // Health check
    health(): Result<HealthStatus>

    // Configuration
    config(): ClientConfig

    // Simulation mode
    set_simulation_mode(mode: SimulationMode): void
}
```

### 7.2 Chat Service Interface

```
interface ChatService {
    // Synchronous completion
    create(request: ChatRequest): Result<ChatResponse>

    // Streaming completion
    create_stream(request: ChatRequest): Result<Stream<ChatChunk>>

    // OpenAI-compatible endpoint
    create_openai_compatible(request: OpenAIChatRequest): Result<OpenAIChatResponse>
}
```

### 7.3 Generate Service Interface

```
interface GenerateService {
    // Synchronous generation
    create(request: GenerateRequest): Result<GenerateResponse>

    // Streaming generation
    create_stream(request: GenerateRequest): Result<Stream<GenerateChunk>>
}
```

### 7.4 Embeddings Service Interface

```
interface EmbeddingsService {
    // Generate embeddings
    create(request: EmbeddingsRequest): Result<EmbeddingsResponse>

    // Batch embeddings
    create_batch(requests: Vec<EmbeddingsRequest>): Result<Vec<EmbeddingsResponse>>
}
```

### 7.5 Models Service Interface

```
interface ModelsService {
    // List local models
    list(): Result<ModelList>

    // Show model details
    show(name: String): Result<ModelInfo>

    // List running models
    running(): Result<RunningModelList>

    // Pull model (optional, may delegate to CLI)
    pull(name: String): Result<PullProgress>

    // Delete model
    delete(name: String): Result<()>

    // Check model availability
    is_available(name: String): Result<bool>
}
```

### 7.6 Configuration Interface

```
interface ClientConfig {
    // Base URL (default: http://localhost:11434)
    base_url: String

    // Request timeout
    timeout: Duration

    // Retry configuration
    retry_config: RetryConfig

    // Default model (optional)
    default_model: Option<String>

    // Optional authentication
    auth_token: Option<SecretString>

    // Custom headers
    default_headers: Map<String, String>
}
```

### 7.7 Builder Interface

```
interface OllamaClientBuilder {
    // Set base URL
    base_url(url: String): Self

    // Set timeout
    timeout(duration: Duration): Self

    // Set default model
    default_model(model: String): Self

    // Set auth token
    auth_token(token: SecretString): Self

    // Set retry config
    retry_config(config: RetryConfig): Self

    // Add default header
    default_header(name: String, value: String): Self

    // Enable simulation mode
    simulation_mode(mode: SimulationMode): Self

    // Build client
    build(): Result<OllamaClient>
}
```

### 7.8 Simulation Interface

```
interface SimulationMode {
    // Disabled - normal operation
    Disabled

    // Recording - capture requests/responses
    Recording { storage: RecordStorage }

    // Replay - return recorded responses
    Replay { source: RecordStorage, timing: TimingMode }
}

interface RecordStorage {
    // In-memory storage
    Memory

    // File-based storage
    File { path: PathBuf }
}

enum TimingMode {
    // Return immediately
    Instant

    // Simulate original timing
    Realistic

    // Custom delay
    Fixed { delay: Duration }
}
```

---

## 8. Data Models

### 8.1 Chat Models

#### ChatRequest

```
ChatRequest {
    model: String                          // Required: model name
    messages: Vec<Message>                 // Required: conversation
    format: Option<String>                 // Optional: "json" for JSON mode
    options: Option<ModelOptions>          // Optional: model parameters
    stream: Option<bool>                   // Optional: enable streaming
    keep_alive: Option<Duration>           // Optional: model unload timeout
}
```

#### Message

```
Message {
    role: Role                             // system|user|assistant
    content: String                        // Message text
    images: Option<Vec<String>>            // Optional: base64 images
}

enum Role {
    System,
    User,
    Assistant
}
```

#### ChatResponse

```
ChatResponse {
    model: String                          // Model name
    created_at: String                     // ISO timestamp
    message: Message                       // Generated message
    done: bool                             // Completion flag
    done_reason: Option<String>            // stop|length|load
    total_duration: Option<u64>            // Nanoseconds
    load_duration: Option<u64>             // Nanoseconds
    prompt_eval_count: Option<u32>         // Input tokens
    prompt_eval_duration: Option<u64>      // Nanoseconds
    eval_count: Option<u32>                // Output tokens
    eval_duration: Option<u64>             // Nanoseconds
}
```

#### ChatChunk (Streaming)

```
ChatChunk {
    model: String                          // Model name
    created_at: String                     // ISO timestamp
    message: Message                       // Partial message
    done: bool                             // Stream complete
    // Final chunk includes all metrics from ChatResponse
}
```

### 8.2 Generate Models

#### GenerateRequest

```
GenerateRequest {
    model: String                          // Required: model name
    prompt: String                         // Required: input prompt
    system: Option<String>                 // Optional: system prompt
    template: Option<String>               // Optional: custom template
    context: Option<Vec<i64>>              // Optional: context from prev
    options: Option<ModelOptions>          // Optional: model parameters
    stream: Option<bool>                   // Optional: enable streaming
    raw: Option<bool>                      // Optional: skip templating
    keep_alive: Option<Duration>           // Optional: model timeout
    images: Option<Vec<String>>            // Optional: base64 images
}
```

#### GenerateResponse

```
GenerateResponse {
    model: String                          // Model name
    created_at: String                     // ISO timestamp
    response: String                       // Generated text
    done: bool                             // Completion flag
    done_reason: Option<String>            // stop|length|load
    context: Option<Vec<i64>>              // Context for continuation
    total_duration: Option<u64>            // Nanoseconds
    load_duration: Option<u64>             // Nanoseconds
    prompt_eval_count: Option<u32>         // Input tokens
    prompt_eval_duration: Option<u64>      // Nanoseconds
    eval_count: Option<u32>                // Output tokens
    eval_duration: Option<u64>             // Nanoseconds
}
```

### 8.3 Model Options

```
ModelOptions {
    // Generation parameters
    temperature: Option<f32>               // 0.0-2.0
    top_p: Option<f32>                     // 0.0-1.0
    top_k: Option<i32>                     // Vocabulary cutoff
    num_predict: Option<i32>               // Max tokens (-1 infinite)
    stop: Option<Vec<String>>              // Stop sequences

    // Context parameters
    num_ctx: Option<i32>                   // Context window size

    // Performance parameters
    num_batch: Option<i32>                 // Batch size
    num_gpu: Option<i32>                   // GPU layers (-1 auto)
    main_gpu: Option<i32>                  // Primary GPU

    // Sampling parameters
    repeat_penalty: Option<f32>            // Repetition penalty
    presence_penalty: Option<f32>          // Presence penalty
    frequency_penalty: Option<f32>         // Frequency penalty
    seed: Option<i64>                      // Random seed

    // Memory parameters
    num_keep: Option<i32>                  // Tokens to keep

    // Advanced
    mirostat: Option<i32>                  // Mirostat mode (0/1/2)
    mirostat_eta: Option<f32>              // Learning rate
    mirostat_tau: Option<f32>              // Target entropy
}
```

### 8.4 Embeddings Models

#### EmbeddingsRequest

```
EmbeddingsRequest {
    model: String                          // Required: model name
    prompt: Option<String>                 // Ollama native format
    input: Option<EmbeddingInput>          // OpenAI-compatible format
    options: Option<ModelOptions>          // Optional: model parameters
    keep_alive: Option<Duration>           // Optional: model timeout
}

enum EmbeddingInput {
    Single(String),
    Multiple(Vec<String>)
}
```

#### EmbeddingsResponse

```
EmbeddingsResponse {
    model: String                          // Model name
    embeddings: Vec<Vec<f32>>              // Embedding vectors
}
```

### 8.5 Model Management Models

#### ModelList

```
ModelList {
    models: Vec<ModelSummary>              // Available models
}

ModelSummary {
    name: String                           // Model name
    model: String                          // Full model identifier
    modified_at: String                    // ISO timestamp
    size: u64                              // Size in bytes
    digest: String                         // Model digest
    details: ModelDetails                  // Model details
}

ModelDetails {
    parent_model: Option<String>           // Parent model name
    format: String                         // Model format
    family: String                         // Model family
    families: Option<Vec<String>>          // All families
    parameter_size: String                 // e.g., "7B"
    quantization_level: String             // e.g., "Q4_0"
}
```

#### ModelInfo

```
ModelInfo {
    license: Option<String>                // Model license
    modelfile: String                      // Modelfile contents
    parameters: String                     // Model parameters
    template: String                       // Prompt template
    system: Option<String>                 // System prompt
    details: ModelDetails                  // Model details
}
```

#### RunningModelList

```
RunningModelList {
    models: Vec<RunningModel>              // Currently loaded models
}

RunningModel {
    name: String                           // Model name
    model: String                          // Full identifier
    size: u64                              // Memory usage
    digest: String                         // Model digest
    details: ModelDetails                  // Model details
    expires_at: String                     // Unload time
    size_vram: u64                         // VRAM usage
}
```

### 8.6 Health Models

```
HealthStatus {
    running: bool                          // Server is running
    version: Option<String>                // Ollama version
}
```

---

## 9. Error Handling Specification

### 9.1 Error Categories

| Category | Retryable | Description |
|----------|-----------|-------------|
| ConnectionError | Yes | Cannot connect to Ollama |
| ServerNotRunning | Yes | Ollama server not started |
| ModelNotFound | No | Requested model not available |
| ModelLoading | Yes | Model currently loading |
| ValidationError | No | Invalid request parameters |
| ContextLength | No | Prompt exceeds context window |
| Timeout | Yes | Request timed out |
| StreamError | Yes | Streaming interrupted |
| InternalError | Yes | Ollama internal error |

### 9.2 Error Type Hierarchy

```
enum OllamaError {
    // Connection errors
    ConnectionError {
        message: String,
        address: String,
        cause: Option<String>
    },

    // Server not running
    ServerNotRunning {
        message: String,
        hint: String                       // How to start Ollama
    },

    // Model errors
    ModelNotFound {
        model: String,
        available: Option<Vec<String>>
    },

    ModelLoading {
        model: String,
        progress: Option<f32>
    },

    // Validation errors
    ValidationError {
        message: String,
        field: Option<String>,
        value: Option<String>
    },

    // Context errors
    ContextLengthError {
        message: String,
        max_context: u32,
        requested: u32
    },

    // Timeout
    TimeoutError {
        message: String,
        timeout: Duration,
        operation: String
    },

    // Stream errors
    StreamError {
        message: String,
        partial_response: Option<String>
    },

    // Server errors
    InternalError {
        message: String,
        status_code: Option<u16>
    },

    // Simulation errors
    SimulationError {
        message: String,
        cause: SimulationErrorCause
    }
}

enum SimulationErrorCause {
    NoRecordingFound,
    RequestMismatch,
    CorruptedRecording
}
```

### 9.3 Error Recovery Guidance

| Error | Recovery Action |
|-------|----------------|
| ServerNotRunning | Run `ollama serve` or start Ollama app |
| ModelNotFound | Run `ollama pull <model>` |
| ModelLoading | Wait and retry |
| ContextLength | Reduce prompt size |
| Timeout | Increase timeout or use smaller model |

---

## 10. Developer Workflow Scenarios

### 10.1 UC-001: Local Development Iteration

**Actor:** Developer

**Preconditions:**
- Ollama installed and running
- Model pulled locally

**Flow:**
1. Developer initializes Ollama client with defaults
2. Developer sends chat request
3. System routes to local Ollama
4. Model generates response
5. Developer iterates on prompts rapidly

**Benefits:**
- No API costs
- No rate limits
- Instant feedback
- Works offline

### 10.2 UC-002: Model Experimentation

**Actor:** Developer

**Preconditions:**
- Multiple models available locally

**Flow:**
1. Developer lists available models
2. Developer selects model for testing
3. Developer sends identical prompts to different models
4. System returns results for comparison
5. Developer selects best model for use case

**Sequence:**
```
Developer        OllamaClient        Ollama Server
    |                |                    |
    |--list_models-->|                    |
    |                |--GET /api/tags---->|
    |                |<--model list-------|
    |<--ModelList----|                    |
    |                |                    |
    |--chat(model_a)->|                   |
    |                |--POST /api/chat--->|
    |<--response_a---|<-------------------|
    |                |                    |
    |--chat(model_b)->|                   |
    |                |--POST /api/chat--->|
    |<--response_b---|<-------------------|
```

### 10.3 UC-003: Offline Development

**Actor:** Developer

**Preconditions:**
- Ollama and models installed
- No internet connection

**Flow:**
1. Developer initializes client
2. System detects Ollama running locally
3. Developer sends requests
4. All inference happens locally
5. No network calls to external services

**Benefits:**
- Works on airplanes
- Works in secure environments
- No external dependencies

### 10.4 UC-004: Recording for Testing

**Actor:** Developer

**Preconditions:**
- Ollama running
- Test scenarios defined

**Flow:**
1. Developer enables recording mode
2. Developer runs through test scenarios
3. System records all requests/responses
4. Developer saves recordings
5. CI/CD uses replay mode for tests

**Sequence:**
```
Developer        OllamaClient        RecordStorage
    |                |                    |
    |--enable_record->|                   |
    |                |                    |
    |--chat()------->|                    |
    |                |--record request--->|
    |                |--call ollama       |
    |                |--record response-->|
    |<--response-----|                    |
    |                |                    |
    |--save()------->|                    |
    |                |--persist---------->|
```

### 10.5 UC-005: CI/CD Testing with Replay

**Actor:** CI/CD System

**Preconditions:**
- Recorded interactions available
- No Ollama required

**Flow:**
1. Test harness loads recordings
2. Test harness enables replay mode
3. Tests execute against recorded responses
4. No actual inference occurs
5. Tests are deterministic and fast

**Benefits:**
- No Ollama required in CI
- Deterministic results
- Fast execution
- Offline testing

### 10.6 UC-006: Streaming Interactive Chat

**Actor:** Application

**Preconditions:**
- Ollama running
- Model loaded

**Flow:**
1. Application creates streaming chat request
2. System opens streaming connection
3. Tokens stream to application
4. Application displays tokens progressively
5. Stream completes with final metrics

**Sequence:**
```
Application      OllamaClient        Ollama Server
    |                |                    |
    |--stream_chat-->|                    |
    |                |--POST /api/chat--->|
    |                |   stream: true     |
    |                |<--NDJSON stream----|
    |<--chunk 1------|                    |
    |<--chunk 2------|                    |
    |<--chunk N------|                    |
    |<--final--------|                    |
    |   (metrics)    |                    |
```

---

## 11. Acceptance Criteria

### 11.1 Chat Service Acceptance

| ID | Criterion | Test Method |
|----|-----------|-------------|
| AC-CHAT-001 | Synchronous completion returns valid response | Unit test |
| AC-CHAT-002 | Streaming delivers tokens incrementally | Integration test |
| AC-CHAT-003 | Multi-turn context preserved | Integration test |
| AC-CHAT-004 | JSON mode returns valid JSON | Unit test |
| AC-CHAT-005 | Image input processed correctly | Integration test |
| AC-CHAT-006 | Keep alive parameter respected | Integration test |

### 11.2 Generate Service Acceptance

| ID | Criterion | Test Method |
|----|-----------|-------------|
| AC-GEN-001 | Text generation returns completion | Unit test |
| AC-GEN-002 | Context continuation works | Integration test |
| AC-GEN-003 | Raw mode bypasses template | Unit test |
| AC-GEN-004 | Streaming generation works | Integration test |

### 11.3 Embeddings Service Acceptance

| ID | Criterion | Test Method |
|----|-----------|-------------|
| AC-EMB-001 | Single embedding returns vector | Unit test |
| AC-EMB-002 | Batch embeddings work | Unit test |
| AC-EMB-003 | Embedding dimensions correct | Integration test |

### 11.4 Models Service Acceptance

| ID | Criterion | Test Method |
|----|-----------|-------------|
| AC-MODEL-001 | List returns all local models | Integration test |
| AC-MODEL-002 | Show returns model details | Integration test |
| AC-MODEL-003 | Running returns loaded models | Integration test |
| AC-MODEL-004 | Model not found handled | Unit test |

### 11.5 Health Service Acceptance

| ID | Criterion | Test Method |
|----|-----------|-------------|
| AC-HEALTH-001 | Running server detected | Integration test |
| AC-HEALTH-002 | Stopped server detected | Unit test |
| AC-HEALTH-003 | Timeout handled | Unit test |

### 11.6 Simulation Acceptance

| ID | Criterion | Test Method |
|----|-----------|-------------|
| AC-SIM-001 | Recording captures requests | Unit test |
| AC-SIM-002 | Replay returns recorded responses | Unit test |
| AC-SIM-003 | Timing simulation works | Unit test |
| AC-SIM-004 | File persistence works | Integration test |

### 11.7 Integration Acceptance

| ID | Criterion | Test Method |
|----|-----------|-------------|
| AC-INT-001 | Uses shared logging primitive | Code review |
| AC-INT-002 | Uses shared tracing primitive | Code review |
| AC-INT-003 | Uses shared error types | Code review |
| AC-INT-004 | No cross-module dependencies | Dependency analysis |

---

## 12. Glossary

| Term | Definition |
|------|------------|
| **Ollama** | Local LLM inference runtime |
| **NDJSON** | Newline-delimited JSON streaming format |
| **GGUF** | GPT-Generated Unified Format for models |
| **Context Window** | Maximum tokens model can process |
| **Keep Alive** | Duration to keep model loaded |
| **Thin Adapter** | Minimal integration layer without business logic |
| **Simulation Mode** | Testing mode using recorded responses |
| **Replay** | Returning recorded responses without inference |
| **Recording** | Capturing request/response pairs |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-OLLAMA-SPEC-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |
| Classification | Internal |

---

**End of Specification Document**

*SPARC Phase 1 Complete - Proceed to Architecture phase with "Next phase."*
