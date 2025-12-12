# AWS Bedrock Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/aws/bedrock`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Module Purpose and Scope](#2-module-purpose-and-scope)
3. [Dependency Policy](#3-dependency-policy)
4. [Model Family Coverage](#4-model-family-coverage)
5. [API Coverage](#5-api-coverage)
6. [Interface Definitions](#6-interface-definitions)
7. [Error Taxonomy](#7-error-taxonomy)
8. [Resilience Hooks](#8-resilience-hooks)
9. [Security Requirements](#9-security-requirements)
10. [Observability Requirements](#10-observability-requirements)
11. [Performance Requirements](#11-performance-requirements)
12. [Future-Proofing](#12-future-proofing)
13. [Acceptance Criteria](#13-acceptance-criteria)

---

## 1. Overview

### 1.1 Document Purpose

This specification defines requirements, interfaces, and constraints for the AWS Bedrock Integration Module. It serves as a thin adapter layer enabling multi-model access (Amazon Titan, Anthropic Claude, Meta LLaMA) through AWS Bedrock's unified API while leveraging shared repository infrastructure.

### 1.2 Audience

- Implementation developers (Rust and TypeScript)
- QA engineers designing test strategies
- Architects reviewing integration patterns
- Security reviewers assessing credential handling

### 1.3 Methodology

- **SPARC Methodology**: Specification → Pseudocode → Architecture → Refinement → Completion
- **London-School TDD**: Interface-first design enabling mock-based testing
- **Thin Adapter Pattern**: Minimal logic, delegating to shared primitives

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The AWS Bedrock Integration Module provides a production-ready, type-safe interface for invoking foundation models via AWS Bedrock. It is a **thin adapter layer** that:
- Unifies access to multiple model families (Titan, Claude, LLaMA)
- Leverages existing AWS credential chain from `aws/ses` and `aws/s3`
- Delegates resilience, observability, and state to shared primitives
- Supports enterprise-scale simulation and telemetry capture

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Model Invocation** | Invoke foundation models via Bedrock Runtime API |
| **Model Family Routing** | Route requests to appropriate model family (Titan/Claude/LLaMA) |
| **Request/Response Translation** | Translate unified interface to model-specific payloads |
| **Streaming Support** | Handle SSE streams from Bedrock Runtime |
| **Credential Delegation** | Use shared AWS credential chain (no duplication) |
| **Resilience Hooks** | Integrate with shared retry, circuit breaker, rate limiting |
| **Observability Hooks** | Emit metrics and traces via shared primitives |
| **RuvVector State** | Store embeddings/state in shared RuvVector Postgres |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Bedrock Runtime API | InvokeModel, InvokeModelWithResponseStream |
| Amazon Titan Models | Titan Text, Titan Embeddings, Titan Image |
| Anthropic Claude Models | Claude 3.x, Claude 2.x via Bedrock |
| Meta LLaMA Models | LLaMA 2, LLaMA 3 via Bedrock |
| Model Discovery | ListFoundationModels, GetFoundationModel |
| Guardrails | ApplyGuardrail (optional) |
| Dual Language | Rust (primary) and TypeScript implementations |

#### Out of Scope

| Item | Reason |
|------|--------|
| Bedrock Agent Runtime | Separate integration (agents, knowledge bases) |
| Bedrock Model Management | Custom model import, fine-tuning |
| Direct Anthropic API | Use `integrations/anthropic` instead |
| Direct Meta API | No direct API exists |
| Credential Implementation | Use shared `aws/credentials` |
| Resilience Implementation | Use shared primitives |
| Vector Database Implementation | Use shared RuvVector module |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| Thin adapter only | No duplicate logic from shared modules |
| Async-first design | I/O-bound operations |
| Model family isolation | Clean distinction between Titan/Claude/LLaMA |
| Shared credential chain | Reuse from aws/ses, aws/s3 |
| Shared observability | Delegate to existing logging/metrics |
| RuvVector integration | State persisted to shared Postgres |

---

## 3. Dependency Policy

### 3.1 Allowed Internal Dependencies

| Module | Purpose | Import Path |
|--------|---------|-------------|
| `aws/credentials` | AWS credential chain (shared with SES/S3) | `@integrations/aws-credentials` |
| `aws/signing` | SigV4 request signing | `@integrations/aws-signing` |
| `shared/database` | RuvVector Postgres connectivity | `@integrations/database` |
| `shared/resilience` | Retry, circuit breaker, rate limiting | `@integrations/resilience` |
| `shared/observability` | Logging, metrics, tracing | `@integrations/observability` |

### 3.2 External Dependencies (Rust)

| Crate | Version | Purpose |
|-------|---------|---------|
| `tokio` | 1.x | Async runtime |
| `serde` | 1.x | Serialization |
| `serde_json` | 1.x | JSON handling |
| `async-trait` | 0.1+ | Async trait support |
| `thiserror` | 1.x | Error derivation |
| `bytes` | 1.x | Byte buffer handling |
| `futures` | 0.3+ | Stream utilities |

### 3.3 External Dependencies (TypeScript)

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | 5.x | Language |

### 3.4 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `@aws-sdk/*` | Must use internal credential/signing implementations |
| `integrations-anthropic` | No cross-integration dependencies |
| `integrations-openai` | No cross-integration dependencies |
| External HTTP clients | Use shared transport |

---

## 4. Model Family Coverage

### 4.1 Amazon Titan Models

| Model ID | Type | Capabilities |
|----------|------|--------------|
| `amazon.titan-text-premier-v1:0` | Text | Chat, completion, reasoning |
| `amazon.titan-text-express-v1` | Text | Fast text generation |
| `amazon.titan-text-lite-v1` | Text | Lightweight text generation |
| `amazon.titan-embed-text-v2:0` | Embedding | Text embeddings (1024 dims) |
| `amazon.titan-embed-text-v1` | Embedding | Text embeddings (1536 dims) |
| `amazon.titan-embed-image-v1` | Embedding | Multimodal embeddings |
| `amazon.titan-image-generator-v1` | Image | Image generation |
| `amazon.titan-image-generator-v2:0` | Image | Advanced image generation |

**Titan Request Format:**
```json
{
  "inputText": "string",
  "textGenerationConfig": {
    "maxTokenCount": 4096,
    "stopSequences": [],
    "temperature": 0.7,
    "topP": 0.9
  }
}
```

### 4.2 Anthropic Claude Models (via Bedrock)

| Model ID | Type | Capabilities |
|----------|------|--------------|
| `anthropic.claude-3-5-sonnet-20241022-v2:0` | Text | Latest Claude 3.5 Sonnet |
| `anthropic.claude-3-5-haiku-20241022-v1:0` | Text | Fast Claude 3.5 Haiku |
| `anthropic.claude-3-opus-20240229-v1:0` | Text | Most capable Claude 3 |
| `anthropic.claude-3-sonnet-20240229-v1:0` | Text | Balanced Claude 3 |
| `anthropic.claude-3-haiku-20240307-v1:0` | Text | Fast Claude 3 |
| `anthropic.claude-v2:1` | Text | Claude 2.1 |
| `anthropic.claude-v2` | Text | Claude 2.0 |
| `anthropic.claude-instant-v1` | Text | Fast Claude Instant |

**Claude Bedrock Request Format:**
```json
{
  "anthropic_version": "bedrock-2023-05-31",
  "max_tokens": 4096,
  "messages": [
    {"role": "user", "content": "string"}
  ],
  "temperature": 0.7,
  "top_p": 0.9,
  "top_k": 250,
  "stop_sequences": []
}
```

### 4.3 Meta LLaMA Models (via Bedrock)

| Model ID | Type | Capabilities |
|----------|------|--------------|
| `meta.llama3-2-90b-instruct-v1:0` | Text | LLaMA 3.2 90B Instruct |
| `meta.llama3-2-11b-instruct-v1:0` | Text | LLaMA 3.2 11B Instruct |
| `meta.llama3-2-3b-instruct-v1:0` | Text | LLaMA 3.2 3B Instruct |
| `meta.llama3-2-1b-instruct-v1:0` | Text | LLaMA 3.2 1B Instruct |
| `meta.llama3-1-405b-instruct-v1:0` | Text | LLaMA 3.1 405B Instruct |
| `meta.llama3-1-70b-instruct-v1:0` | Text | LLaMA 3.1 70B Instruct |
| `meta.llama3-1-8b-instruct-v1:0` | Text | LLaMA 3.1 8B Instruct |
| `meta.llama3-70b-instruct-v1:0` | Text | LLaMA 3 70B Instruct |
| `meta.llama3-8b-instruct-v1:0` | Text | LLaMA 3 8B Instruct |
| `meta.llama2-70b-chat-v1` | Text | LLaMA 2 70B Chat |
| `meta.llama2-13b-chat-v1` | Text | LLaMA 2 13B Chat |

**LLaMA Bedrock Request Format:**
```json
{
  "prompt": "<s>[INST] {user_message} [/INST]",
  "max_gen_len": 2048,
  "temperature": 0.7,
  "top_p": 0.9
}
```

### 4.4 Model Family Distinction Pattern

The adapter maintains clear separation:

```
BedrockClient
├── TitanService      → Amazon Titan models
├── ClaudeService     → Anthropic Claude models
├── LlamaService      → Meta LLaMA models
└── ModelDiscovery    → ListFoundationModels
```

Each service implements model-family-specific:
- Request serialization
- Response deserialization
- Token counting (where applicable)
- Streaming format parsing

---

## 5. API Coverage

### 5.1 Bedrock Runtime API

#### 5.1.1 InvokeModel

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /model/{modelId}/invoke` |
| Service | `bedrock-runtime` |
| Authentication | SigV4 |
| Content-Type | `application/json` |

**Request Headers:**
- `Content-Type: application/json`
- `Accept: application/json`

**Response:**
- Model-specific JSON body
- `x-amzn-bedrock-input-token-count` header
- `x-amzn-bedrock-output-token-count` header

#### 5.1.2 InvokeModelWithResponseStream

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /model/{modelId}/invoke-with-response-stream` |
| Response | Event stream (application/vnd.amazon.eventstream) |

**Event Types:**
- `chunk`: Partial model response
- `internalServerException`: Server error
- `modelStreamErrorException`: Model error
- `throttlingException`: Rate limit
- `validationException`: Input validation error

### 5.2 Bedrock Control Plane API

#### 5.2.1 ListFoundationModels

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /foundation-models` |
| Service | `bedrock` |
| Query Params | `byProvider`, `byOutputModality`, `byInferenceType` |

#### 5.2.2 GetFoundationModel

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /foundation-models/{modelIdentifier}` |

### 5.3 Guardrails (Optional)

#### 5.3.1 ApplyGuardrail

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /guardrail/{guardrailIdentifier}/version/{guardrailVersion}/apply` |
| Purpose | Content filtering, PII redaction |

---

## 6. Interface Definitions

### 6.1 Rust Interfaces

#### 6.1.1 Unified Client Interface

```rust
/// Main client for AWS Bedrock model invocation.
#[async_trait]
pub trait BedrockClient: Send + Sync {
    /// Access Titan model services.
    fn titan(&self) -> &dyn TitanService;

    /// Access Claude model services (via Bedrock).
    fn claude(&self) -> &dyn ClaudeService;

    /// Access LLaMA model services.
    fn llama(&self) -> &dyn LlamaService;

    /// Access model discovery.
    fn models(&self) -> &dyn ModelDiscoveryService;

    /// Get current configuration.
    fn config(&self) -> &BedrockConfig;
}
```

#### 6.1.2 Model Family Services

```rust
/// Service for Amazon Titan models.
#[async_trait]
pub trait TitanService: Send + Sync {
    /// Generate text completion.
    async fn generate(
        &self,
        request: TitanGenerateRequest,
    ) -> Result<TitanGenerateResponse, BedrockError>;

    /// Generate text with streaming.
    async fn generate_stream(
        &self,
        request: TitanGenerateRequest,
    ) -> Result<TitanStream, BedrockError>;

    /// Generate embeddings.
    async fn embed(
        &self,
        request: TitanEmbedRequest,
    ) -> Result<TitanEmbedResponse, BedrockError>;

    /// Generate image.
    async fn generate_image(
        &self,
        request: TitanImageRequest,
    ) -> Result<TitanImageResponse, BedrockError>;
}

/// Service for Anthropic Claude models via Bedrock.
#[async_trait]
pub trait ClaudeService: Send + Sync {
    /// Create message (non-streaming).
    async fn create_message(
        &self,
        request: ClaudeMessageRequest,
    ) -> Result<ClaudeMessageResponse, BedrockError>;

    /// Create message with streaming.
    async fn create_message_stream(
        &self,
        request: ClaudeMessageRequest,
    ) -> Result<ClaudeStream, BedrockError>;
}

/// Service for Meta LLaMA models.
#[async_trait]
pub trait LlamaService: Send + Sync {
    /// Generate text completion.
    async fn generate(
        &self,
        request: LlamaGenerateRequest,
    ) -> Result<LlamaGenerateResponse, BedrockError>;

    /// Generate text with streaming.
    async fn generate_stream(
        &self,
        request: LlamaGenerateRequest,
    ) -> Result<LlamaStream, BedrockError>;
}
```

#### 6.1.3 Model Discovery Service

```rust
/// Service for discovering available models.
#[async_trait]
pub trait ModelDiscoveryService: Send + Sync {
    /// List all foundation models.
    async fn list(
        &self,
        params: Option<ListModelsParams>,
    ) -> Result<ModelList, BedrockError>;

    /// Get specific model details.
    async fn get(
        &self,
        model_id: &str,
    ) -> Result<ModelInfo, BedrockError>;
}
```

#### 6.1.4 Unified Invoke Interface

```rust
/// Unified interface for model invocation (model-agnostic).
#[async_trait]
pub trait UnifiedInvokeService: Send + Sync {
    /// Invoke any model with unified request format.
    async fn invoke(
        &self,
        request: UnifiedInvokeRequest,
    ) -> Result<UnifiedInvokeResponse, BedrockError>;

    /// Invoke with streaming response.
    async fn invoke_stream(
        &self,
        request: UnifiedInvokeRequest,
    ) -> Result<UnifiedStream, BedrockError>;
}

/// Unified request format (translated to model-specific).
pub struct UnifiedInvokeRequest {
    /// Target model ID.
    pub model_id: String,
    /// Input messages/prompt.
    pub messages: Vec<Message>,
    /// Maximum output tokens.
    pub max_tokens: u32,
    /// Sampling temperature.
    pub temperature: Option<f32>,
    /// Top-p sampling.
    pub top_p: Option<f32>,
    /// Stop sequences.
    pub stop_sequences: Option<Vec<String>>,
}
```

#### 6.1.5 Configuration Types

```rust
/// Configuration for Bedrock client.
#[derive(Clone)]
pub struct BedrockConfig {
    /// AWS region.
    pub region: String,
    /// Credential provider (shared).
    pub credentials: Arc<dyn CredentialProvider>,
    /// Request timeout.
    pub timeout: Duration,
    /// Resilience configuration (shared).
    pub resilience: ResilienceConfig,
    /// Observability hooks (shared).
    pub observability: ObservabilityConfig,
    /// RuvVector connection (shared).
    pub ruvvector: Option<DatabaseConfig>,
}

impl BedrockConfig {
    /// Create from environment with shared infrastructure.
    pub fn from_env() -> Result<Self, ConfigError>;
}
```

### 6.2 TypeScript Interfaces

#### 6.2.1 Client Interface

```typescript
/**
 * Main client for AWS Bedrock model invocation.
 */
interface BedrockClient {
  /** Titan model services. */
  readonly titan: TitanService;

  /** Claude model services (via Bedrock). */
  readonly claude: ClaudeService;

  /** LLaMA model services. */
  readonly llama: LlamaService;

  /** Model discovery. */
  readonly models: ModelDiscoveryService;

  /** Current configuration. */
  getConfig(): Readonly<BedrockConfig>;
}
```

#### 6.2.2 Service Interfaces

```typescript
interface TitanService {
  generate(request: TitanGenerateRequest): Promise<TitanGenerateResponse>;
  generateStream(request: TitanGenerateRequest): AsyncIterable<TitanStreamEvent>;
  embed(request: TitanEmbedRequest): Promise<TitanEmbedResponse>;
  generateImage(request: TitanImageRequest): Promise<TitanImageResponse>;
}

interface ClaudeService {
  createMessage(request: ClaudeMessageRequest): Promise<ClaudeMessageResponse>;
  createMessageStream(request: ClaudeMessageRequest): AsyncIterable<ClaudeStreamEvent>;
}

interface LlamaService {
  generate(request: LlamaGenerateRequest): Promise<LlamaGenerateResponse>;
  generateStream(request: LlamaGenerateRequest): AsyncIterable<LlamaStreamEvent>;
}

interface ModelDiscoveryService {
  list(params?: ListModelsParams): Promise<ModelList>;
  get(modelId: string): Promise<ModelInfo>;
}
```

#### 6.2.3 Request/Response Types

```typescript
/** Titan text generation request. */
interface TitanGenerateRequest {
  modelId: TitanTextModel;
  inputText: string;
  textGenerationConfig?: {
    maxTokenCount?: number;
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
  };
}

/** Claude message request (Bedrock format). */
interface ClaudeMessageRequest {
  modelId: ClaudeModel;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
  }>;
  maxTokens: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  system?: string;
}

/** LLaMA generation request. */
interface LlamaGenerateRequest {
  modelId: LlamaModel;
  prompt: string;
  maxGenLen?: number;
  temperature?: number;
  topP?: number;
}

/** Unified invoke request. */
interface UnifiedInvokeRequest {
  modelId: string;
  messages: Message[];
  maxTokens: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
}
```

---

## 7. Error Taxonomy

### 7.1 Error Hierarchy

```
BedrockError
├── ConfigurationError
│   ├── MissingRegion
│   ├── InvalidCredentials
│   └── InvalidEndpoint
│
├── AuthenticationError
│   ├── CredentialsExpired
│   ├── SignatureInvalid
│   └── AccessDenied
│
├── ModelError
│   ├── ModelNotFound
│   ├── ModelNotEnabled
│   ├── UnsupportedModel
│   └── ModelNotReady
│
├── RequestError
│   ├── ValidationError
│   ├── PayloadTooLarge
│   ├── InvalidInput
│   └── UnsupportedContentType
│
├── RateLimitError
│   ├── ThrottlingException
│   ├── ServiceQuotaExceeded
│   └── TooManyRequests
│
├── ServerError
│   ├── InternalServerError
│   ├── ServiceUnavailable
│   └── ModelTimeout
│
├── StreamError
│   ├── StreamInterrupted
│   ├── EventParseError
│   └── IncompleteResponse
│
└── ResourceError
    ├── GuardrailNotFound
    └── RegionNotSupported
```

### 7.2 Error Mapping

| AWS Error Code | BedrockError | Retryable |
|----------------|--------------|-----------|
| `ValidationException` | `RequestError::ValidationError` | No |
| `AccessDeniedException` | `AuthenticationError::AccessDenied` | No |
| `ResourceNotFoundException` | `ModelError::ModelNotFound` | No |
| `ThrottlingException` | `RateLimitError::ThrottlingException` | Yes |
| `ServiceQuotaExceededException` | `RateLimitError::ServiceQuotaExceeded` | Yes |
| `ModelTimeoutException` | `ServerError::ModelTimeout` | Yes |
| `InternalServerException` | `ServerError::InternalServerError` | Yes |
| `ServiceUnavailableException` | `ServerError::ServiceUnavailable` | Yes |
| `ModelStreamErrorException` | `StreamError::StreamInterrupted` | Yes |
| `ModelNotReadyException` | `ModelError::ModelNotReady` | Yes |

---

## 8. Resilience Hooks

### 8.1 Shared Retry Integration

Delegates to `shared/resilience`:

| Error Type | Retry | Max Attempts | Strategy |
|------------|-------|--------------|----------|
| `ThrottlingException` | Yes | 5 | Exponential with jitter |
| `ServiceUnavailable` | Yes | 3 | Exponential |
| `ModelTimeout` | Yes | 2 | Fixed 5s delay |
| `StreamInterrupted` | Yes | 3 | Immediate |
| All others | No | - | - |

### 8.2 Shared Circuit Breaker Integration

Uses `shared/resilience` circuit breaker:
- Failure threshold: 5
- Reset timeout: 30s
- Half-open test requests: 1

### 8.3 Shared Rate Limiter Integration

Configurable via `shared/resilience`:
- Per-model rate limits
- Token bucket algorithm
- Respects `Retry-After` headers

---

## 9. Security Requirements

### 9.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| Use shared credential chain | Delegate to `aws/credentials` |
| Support IMDS for EC2 | Via shared provider |
| Support profile credentials | Via shared provider |
| Support environment variables | Via shared provider |
| Credential refresh | Automatic via cached provider |

### 9.2 Request Signing

| Requirement | Implementation |
|-------------|----------------|
| SigV4 signing | Use `aws/signing` module |
| Region-aware signing | Configured per-client |
| Service name | `bedrock-runtime` or `bedrock` |

### 9.3 Transport Security

| Requirement | Implementation |
|-------------|----------------|
| TLS 1.2+ only | AWS default |
| Certificate validation | Enabled |

---

## 10. Observability Requirements

### 10.1 Tracing (Shared)

Delegates to `shared/observability`:

| Attribute | Type | Description |
|-----------|------|-------------|
| `bedrock.service` | string | `titan`, `claude`, `llama` |
| `bedrock.operation` | string | `invoke`, `invoke_stream` |
| `bedrock.model_id` | string | Full model identifier |
| `bedrock.model_family` | string | `titan`, `claude`, `llama` |
| `bedrock.region` | string | AWS region |
| `bedrock.input_tokens` | integer | Input token count |
| `bedrock.output_tokens` | integer | Output token count |
| `bedrock.latency_ms` | integer | Request latency |

### 10.2 Metrics (Shared)

Emits via `shared/observability`:

| Metric | Type | Labels |
|--------|------|--------|
| `bedrock_requests_total` | Counter | `model_family`, `model_id`, `status` |
| `bedrock_request_duration_seconds` | Histogram | `model_family`, `model_id` |
| `bedrock_tokens_total` | Counter | `model_family`, `direction` |
| `bedrock_errors_total` | Counter | `model_family`, `error_type` |
| `bedrock_stream_chunks_total` | Counter | `model_family` |

### 10.3 Logging (Shared)

Uses `shared/observability` logging:

| Level | When |
|-------|------|
| `ERROR` | Auth failures, configuration errors |
| `WARN` | Throttling, retries, circuit breaker |
| `INFO` | Request completion |
| `DEBUG` | Request/response details |
| `TRACE` | Stream events, signing details |

---

## 11. Performance Requirements

### 11.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| Request signing | < 5ms | < 20ms |
| Request serialization | < 1ms | < 5ms |
| Response parsing | < 5ms | < 20ms |
| Stream event parsing | < 0.5ms | < 2ms |

### 11.2 Throughput

| Metric | Target |
|--------|--------|
| Concurrent requests | 50+ per region |
| Stream throughput | Line-rate with Bedrock |

### 11.3 Resource Limits

| Resource | Limit |
|----------|-------|
| Memory per request | < 1MB |
| Memory per stream | < 100KB + content |
| Connection pool | Configurable (default: 10) |

---

## 12. Future-Proofing

### 12.1 Extensibility Points

| Extension | Mechanism |
|-----------|-----------|
| New model families | Add new service trait |
| New Bedrock APIs | Extend service interfaces |
| Custom guardrails | GuardrailService trait |
| Knowledge bases | Separate integration module |

### 12.2 Model Addition

New models are added without code changes when:
- Model uses existing family's request format
- Model ID follows existing pattern

---

## 13. Acceptance Criteria

### 13.1 Functional Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| FC-1 | Titan text generation works | Integration test |
| FC-2 | Titan embeddings work | Integration test |
| FC-3 | Titan image generation works | Integration test |
| FC-4 | Claude message creation works | Integration test |
| FC-5 | Claude streaming works | Integration test |
| FC-6 | LLaMA generation works | Integration test |
| FC-7 | LLaMA streaming works | Integration test |
| FC-8 | Model listing works | Integration test |
| FC-9 | Unified invoke works | Integration test |
| FC-10 | All error types mapped | Unit tests |

### 13.2 Non-Functional Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| NFC-1 | Uses shared credential chain | Code review |
| NFC-2 | Uses shared resilience | Code review |
| NFC-3 | Uses shared observability | Code review |
| NFC-4 | No duplicate infrastructure | Code review |
| NFC-5 | Model family isolation | Architecture review |
| NFC-6 | Test coverage > 80% | Coverage report |

### 13.3 Integration Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| IC-1 | RuvVector state storage works | Integration test |
| IC-2 | Shared auth works across regions | Integration test |
| IC-3 | Metrics appear in shared collector | Integration test |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial specification |

---

**End of Specification Phase**

*Next: Architecture phase will define component structure and data flow.*
