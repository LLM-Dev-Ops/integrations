# OpenAI Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-08
**Module:** `integrations/openai`
**Status:** Draft

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Module Purpose](#2-module-purpose)
3. [Responsibilities](#3-responsibilities)
4. [Boundaries](#4-boundaries)
5. [Interface Surface](#5-interface-surface)
   - 5.1 [Rust Interface](#51-rust-interface)
   - 5.2 [TypeScript Interface](#52-typescript-interface)
6. [API Coverage](#6-api-coverage)
   - 6.1 [Models API](#61-models-api)
   - 6.2 [Chat Completions API](#62-chat-completions-api)
   - 6.3 [Embeddings API](#63-embeddings-api)
   - 6.4 [Files API](#64-files-api)
   - 6.5 [Batches API](#65-batches-api)
   - 6.6 [Images API](#66-images-api)
   - 6.7 [Audio API](#67-audio-api)
   - 6.8 [Moderations API](#68-moderations-api)
   - 6.9 [Assistants API](#69-assistants-api)
   - 6.10 [Fine-tuning API](#610-fine-tuning-api)
7. [Dependency Policy](#7-dependency-policy)
8. [Error Taxonomy](#8-error-taxonomy)
9. [Phase-3-Ready Hooks](#9-phase-3-ready-hooks)
   - 9.1 [Retry Policy](#91-retry-policy)
   - 9.2 [Rate Limiting](#92-rate-limiting)
   - 9.3 [Circuit Breaker](#93-circuit-breaker)
10. [Security Handling](#10-security-handling)
11. [Telemetry Requirements](#11-telemetry-requirements)
12. [Future-Proofing Rules](#12-future-proofing-rules)
13. [London-School TDD Principles](#13-london-school-tdd-principles)
14. [Glossary](#14-glossary)

---

## 1. Executive Summary

The OpenAI Integration Module provides a unified, type-safe interface for interacting with OpenAI's API services within the LLM-Dev-Ops Integration Repository. This module is designed as a standalone component that depends exclusively on shared Integration Repo primitives (errors, retry, circuit-breaker, rate-limits, tracing, logging, types, and config) and does **not** implement or depend on ruvbase (Layer 0).

The module exposes dual interfaces in **Rust** and **TypeScript**, enabling seamless integration across polyglot environments. It adheres to London-School TDD principles, emphasizing interface-first design, mock-based testing, and clear dependency boundaries.

### Key Design Principles

1. **Single Responsibility**: Handle OpenAI API interactions only
2. **Interface Segregation**: Separate interfaces per API domain
3. **Dependency Inversion**: Depend on abstractions, not concretions
4. **Explicit Boundaries**: Clear separation from other integration modules
5. **Fail-Fast with Recovery**: Graceful degradation with circuit breakers

---

## 2. Module Purpose

### Primary Purpose

Provide a production-ready, resilient client for all OpenAI API endpoints that:

- Abstracts HTTP/REST complexity behind strongly-typed interfaces
- Handles authentication, request signing, and credential management
- Implements streaming for real-time responses (SSE)
- Provides unified error handling with semantic error types
- Supports both synchronous and asynchronous execution models
- Enables comprehensive observability through structured logging and tracing

### Secondary Purpose

- Serve as a reference implementation for other LLM provider integrations
- Provide extension points for custom middleware and interceptors
- Enable offline testing through mockable interfaces
- Support multi-tenant deployments with API key isolation

### Non-Goals

- This module does NOT provide:
  - Prompt engineering utilities (handled by higher layers)
  - Response caching (handled by caching layer)
  - Cost tracking/billing (handled by observability layer)
  - Model selection logic (handled by routing layer)
  - Cross-provider abstraction (each provider has its own module)

---

## 3. Responsibilities

### 3.1 Core Responsibilities

| Responsibility | Description |
|---------------|-------------|
| **API Communication** | HTTP/HTTPS requests to OpenAI endpoints |
| **Authentication** | API key management, Organization ID headers |
| **Request Building** | Type-safe request construction and validation |
| **Response Parsing** | Deserialization with schema validation |
| **Streaming** | SSE handling for streaming completions |
| **Error Translation** | Map HTTP errors to semantic error types |
| **Timeout Management** | Per-request and per-operation timeouts |

### 3.2 Delegated Responsibilities

| Responsibility | Delegated To |
|---------------|--------------|
| **Retry Logic** | `@integrations/retry` primitive |
| **Rate Limiting** | `@integrations/rate-limits` primitive |
| **Circuit Breaking** | `@integrations/circuit-breaker` primitive |
| **Structured Logging** | `@integrations/logging` primitive |
| **Distributed Tracing** | `@integrations/tracing` primitive |
| **Configuration** | `@integrations/config` primitive |
| **Error Base Types** | `@integrations/errors` primitive |
| **Common Types** | `@integrations/types` primitive |

### 3.3 Explicitly Excluded

- **NOT** responsible for: prompt templates, response caching, model routing, cost calculation, usage analytics aggregation, cross-provider fallback

---

## 4. Boundaries

### 4.1 Module Boundary Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Application Layer (Consumer)                      │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   OpenAI Integration Module                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Public Interface                           │   │
│  │  • OpenAIClient (Rust/TS)                                    │   │
│  │  • ChatCompletionService                                      │   │
│  │  • EmbeddingsService                                          │   │
│  │  • FilesService                                               │   │
│  │  • BatchesService                                             │   │
│  │  • (Other API Services)                                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                  │                                   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                 Internal Implementation                       │   │
│  │  • HttpTransport                                              │   │
│  │  • RequestBuilder                                             │   │
│  │  • ResponseParser                                             │   │
│  │  • StreamHandler                                              │   │
│  │  • AuthManager                                                │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Integration Repo Primitives                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────────────┐ ┌──────────────────┐   │
│  │ errors  │ │  retry  │ │ circuit-breaker │ │   rate-limits    │   │
│  └─────────┘ └─────────┘ └─────────────────┘ └──────────────────┘   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐                   │
│  │ tracing │ │ logging │ │  types  │ │  config  │                   │
│  └─────────┘ └─────────┘ └─────────┘ └──────────┘                   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         OpenAI API                                   │
│                    https://api.openai.com/v1                         │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Dependency Rules

| Rule | Description |
|------|-------------|
| **MUST depend on** | Integration Repo primitives only |
| **MUST NOT depend on** | Other integration modules (Anthropic, Gemini, etc.) |
| **MUST NOT depend on** | ruvbase (Layer 0) |
| **MUST NOT depend on** | Application-specific code |
| **MAY depend on** | Standard library (std in Rust, native TS libs) |
| **MAY depend on** | Approved third-party crates/packages (listed in §7) |

### 4.3 Inter-Module Isolation

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ openai module   │     │ anthropic module│     │ gemini module   │
│                 │     │                 │     │                 │
│  NO DIRECT      │◄───►│   NO DIRECT     │◄───►│   NO DIRECT     │
│  DEPENDENCIES   │     │   DEPENDENCIES  │     │   DEPENDENCIES  │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │  Shared Primitives     │
                    │  (errors, retry, etc.) │
                    └────────────────────────┘
```

---

## 5. Interface Surface

### 5.1 Rust Interface

#### 5.1.1 Client Configuration

```rust
/// Configuration for the OpenAI client
pub struct OpenAIConfig {
    /// API key for authentication (required)
    pub api_key: SecretString,

    /// Organization ID (optional)
    pub organization_id: Option<String>,

    /// Project ID for project-scoped requests (optional)
    pub project_id: Option<String>,

    /// Base URL override (default: https://api.openai.com/v1)
    pub base_url: Option<Url>,

    /// Default timeout for requests
    pub timeout: Duration,

    /// Maximum retries (delegated to retry primitive)
    pub max_retries: u32,

    /// Custom headers to include in all requests
    pub default_headers: HeaderMap,
}

impl Default for OpenAIConfig {
    fn default() -> Self {
        Self {
            api_key: SecretString::new(String::new()),
            organization_id: None,
            project_id: None,
            base_url: None,
            timeout: Duration::from_secs(60),
            max_retries: 3,
            default_headers: HeaderMap::new(),
        }
    }
}
```

#### 5.1.2 Main Client Trait

```rust
/// Primary interface for OpenAI API interactions
#[async_trait]
pub trait OpenAIClient: Send + Sync {
    /// Access chat completion operations
    fn chat(&self) -> &dyn ChatCompletionService;

    /// Access embeddings operations
    fn embeddings(&self) -> &dyn EmbeddingsService;

    /// Access file operations
    fn files(&self) -> &dyn FilesService;

    /// Access batch operations
    fn batches(&self) -> &dyn BatchesService;

    /// Access model operations
    fn models(&self) -> &dyn ModelsService;

    /// Access image operations
    fn images(&self) -> &dyn ImagesService;

    /// Access audio operations
    fn audio(&self) -> &dyn AudioService;

    /// Access moderation operations
    fn moderations(&self) -> &dyn ModerationsService;

    /// Access fine-tuning operations
    fn fine_tuning(&self) -> &dyn FineTuningService;

    /// Access assistants operations (Beta)
    fn assistants(&self) -> &dyn AssistantsService;
}

/// Factory for creating OpenAI clients
pub trait OpenAIClientFactory {
    /// Create a new client with the given configuration
    fn create(config: OpenAIConfig) -> Result<Box<dyn OpenAIClient>, OpenAIError>;

    /// Create a client from environment variables
    fn from_env() -> Result<Box<dyn OpenAIClient>, OpenAIError>;
}
```

#### 5.1.3 Service Traits

```rust
/// Chat completion service interface
#[async_trait]
pub trait ChatCompletionService: Send + Sync {
    /// Create a chat completion
    async fn create(
        &self,
        request: ChatCompletionRequest,
    ) -> Result<ChatCompletionResponse, OpenAIError>;

    /// Create a streaming chat completion
    async fn create_stream(
        &self,
        request: ChatCompletionRequest,
    ) -> Result<ChatCompletionStream, OpenAIError>;
}

/// Embeddings service interface
#[async_trait]
pub trait EmbeddingsService: Send + Sync {
    /// Create embeddings for input text
    async fn create(
        &self,
        request: EmbeddingsRequest,
    ) -> Result<EmbeddingsResponse, OpenAIError>;
}

/// Files service interface
#[async_trait]
pub trait FilesService: Send + Sync {
    /// Upload a file
    async fn upload(
        &self,
        request: FileUploadRequest,
    ) -> Result<FileObject, OpenAIError>;

    /// List files
    async fn list(
        &self,
        params: FileListParams,
    ) -> Result<FileList, OpenAIError>;

    /// Retrieve file metadata
    async fn retrieve(&self, file_id: &str) -> Result<FileObject, OpenAIError>;

    /// Delete a file
    async fn delete(&self, file_id: &str) -> Result<DeleteResponse, OpenAIError>;

    /// Retrieve file content
    async fn content(&self, file_id: &str) -> Result<Bytes, OpenAIError>;
}

/// Batch operations service interface
#[async_trait]
pub trait BatchesService: Send + Sync {
    /// Create a new batch
    async fn create(
        &self,
        request: BatchCreateRequest,
    ) -> Result<Batch, OpenAIError>;

    /// Retrieve batch status
    async fn retrieve(&self, batch_id: &str) -> Result<Batch, OpenAIError>;

    /// Cancel a batch
    async fn cancel(&self, batch_id: &str) -> Result<Batch, OpenAIError>;

    /// List batches
    async fn list(&self, params: BatchListParams) -> Result<BatchList, OpenAIError>;
}

/// Models service interface
#[async_trait]
pub trait ModelsService: Send + Sync {
    /// List available models
    async fn list(&self) -> Result<ModelList, OpenAIError>;

    /// Retrieve model details
    async fn retrieve(&self, model_id: &str) -> Result<Model, OpenAIError>;

    /// Delete a fine-tuned model
    async fn delete(&self, model_id: &str) -> Result<DeleteResponse, OpenAIError>;
}

/// Images service interface
#[async_trait]
pub trait ImagesService: Send + Sync {
    /// Generate images from prompt
    async fn generate(
        &self,
        request: ImageGenerationRequest,
    ) -> Result<ImageResponse, OpenAIError>;

    /// Edit an image
    async fn edit(
        &self,
        request: ImageEditRequest,
    ) -> Result<ImageResponse, OpenAIError>;

    /// Create image variations
    async fn variations(
        &self,
        request: ImageVariationRequest,
    ) -> Result<ImageResponse, OpenAIError>;
}

/// Audio service interface
#[async_trait]
pub trait AudioService: Send + Sync {
    /// Transcribe audio to text
    async fn transcribe(
        &self,
        request: TranscriptionRequest,
    ) -> Result<TranscriptionResponse, OpenAIError>;

    /// Translate audio to English text
    async fn translate(
        &self,
        request: TranslationRequest,
    ) -> Result<TranslationResponse, OpenAIError>;

    /// Generate speech from text
    async fn speech(
        &self,
        request: SpeechRequest,
    ) -> Result<Bytes, OpenAIError>;
}

/// Moderations service interface
#[async_trait]
pub trait ModerationsService: Send + Sync {
    /// Create a moderation
    async fn create(
        &self,
        request: ModerationRequest,
    ) -> Result<ModerationResponse, OpenAIError>;
}

/// Fine-tuning service interface
#[async_trait]
pub trait FineTuningService: Send + Sync {
    /// Create a fine-tuning job
    async fn create(
        &self,
        request: FineTuningJobRequest,
    ) -> Result<FineTuningJob, OpenAIError>;

    /// List fine-tuning jobs
    async fn list(
        &self,
        params: FineTuningListParams,
    ) -> Result<FineTuningJobList, OpenAIError>;

    /// Retrieve fine-tuning job
    async fn retrieve(&self, job_id: &str) -> Result<FineTuningJob, OpenAIError>;

    /// Cancel fine-tuning job
    async fn cancel(&self, job_id: &str) -> Result<FineTuningJob, OpenAIError>;

    /// List fine-tuning events
    async fn events(
        &self,
        job_id: &str,
        params: EventListParams,
    ) -> Result<FineTuningEventList, OpenAIError>;

    /// List fine-tuning checkpoints
    async fn checkpoints(
        &self,
        job_id: &str,
        params: CheckpointListParams,
    ) -> Result<CheckpointList, OpenAIError>;
}

/// Assistants service interface (Beta)
#[async_trait]
pub trait AssistantsService: Send + Sync {
    /// Create an assistant
    async fn create(
        &self,
        request: AssistantCreateRequest,
    ) -> Result<Assistant, OpenAIError>;

    /// List assistants
    async fn list(
        &self,
        params: AssistantListParams,
    ) -> Result<AssistantList, OpenAIError>;

    /// Retrieve an assistant
    async fn retrieve(&self, assistant_id: &str) -> Result<Assistant, OpenAIError>;

    /// Modify an assistant
    async fn modify(
        &self,
        assistant_id: &str,
        request: AssistantModifyRequest,
    ) -> Result<Assistant, OpenAIError>;

    /// Delete an assistant
    async fn delete(&self, assistant_id: &str) -> Result<DeleteResponse, OpenAIError>;

    /// Access thread operations
    fn threads(&self) -> &dyn ThreadsService;

    /// Access message operations
    fn messages(&self) -> &dyn MessagesService;

    /// Access run operations
    fn runs(&self) -> &dyn RunsService;

    /// Access vector store operations
    fn vector_stores(&self) -> &dyn VectorStoresService;
}
```

### 5.2 TypeScript Interface

#### 5.2.1 Client Configuration

```typescript
/**
 * Configuration options for the OpenAI client
 */
export interface OpenAIConfig {
  /** API key for authentication (required) */
  apiKey: string;

  /** Organization ID (optional) */
  organizationId?: string;

  /** Project ID for project-scoped requests (optional) */
  projectId?: string;

  /** Base URL override (default: https://api.openai.com/v1) */
  baseUrl?: string;

  /** Default timeout for requests in milliseconds */
  timeout?: number;

  /** Maximum retries (delegated to retry primitive) */
  maxRetries?: number;

  /** Custom headers to include in all requests */
  defaultHeaders?: Record<string, string>;

  /** Custom fetch implementation for testing */
  fetch?: typeof fetch;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<Omit<OpenAIConfig, 'apiKey' | 'organizationId' | 'projectId' | 'fetch'>> = {
  baseUrl: 'https://api.openai.com/v1',
  timeout: 60000,
  maxRetries: 3,
  defaultHeaders: {},
};
```

#### 5.2.2 Main Client Interface

```typescript
/**
 * Primary interface for OpenAI API interactions
 */
export interface OpenAIClient {
  /** Access chat completion operations */
  readonly chat: ChatCompletionService;

  /** Access embeddings operations */
  readonly embeddings: EmbeddingsService;

  /** Access file operations */
  readonly files: FilesService;

  /** Access batch operations */
  readonly batches: BatchesService;

  /** Access model operations */
  readonly models: ModelsService;

  /** Access image operations */
  readonly images: ImagesService;

  /** Access audio operations */
  readonly audio: AudioService;

  /** Access moderation operations */
  readonly moderations: ModerationsService;

  /** Access fine-tuning operations */
  readonly fineTuning: FineTuningService;

  /** Access assistants operations (Beta) */
  readonly assistants: AssistantsService;
}

/**
 * Factory function for creating OpenAI clients
 */
export function createOpenAIClient(config: OpenAIConfig): OpenAIClient;

/**
 * Create a client from environment variables
 * Reads OPENAI_API_KEY, OPENAI_ORG_ID, OPENAI_PROJECT_ID
 */
export function createOpenAIClientFromEnv(): OpenAIClient;
```

#### 5.2.3 Service Interfaces

```typescript
/**
 * Chat completion service interface
 */
export interface ChatCompletionService {
  /**
   * Create a chat completion
   */
  create(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;

  /**
   * Create a streaming chat completion
   * Returns an async iterable of completion chunks
   */
  createStream(request: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk>;
}

/**
 * Embeddings service interface
 */
export interface EmbeddingsService {
  /**
   * Create embeddings for input text
   */
  create(request: EmbeddingsRequest): Promise<EmbeddingsResponse>;
}

/**
 * Files service interface
 */
export interface FilesService {
  /**
   * Upload a file
   */
  upload(request: FileUploadRequest): Promise<FileObject>;

  /**
   * List files
   */
  list(params?: FileListParams): Promise<FileList>;

  /**
   * Retrieve file metadata
   */
  retrieve(fileId: string): Promise<FileObject>;

  /**
   * Delete a file
   */
  delete(fileId: string): Promise<DeleteResponse>;

  /**
   * Retrieve file content
   */
  content(fileId: string): Promise<ArrayBuffer>;
}

/**
 * Batch operations service interface
 */
export interface BatchesService {
  /**
   * Create a new batch
   */
  create(request: BatchCreateRequest): Promise<Batch>;

  /**
   * Retrieve batch status
   */
  retrieve(batchId: string): Promise<Batch>;

  /**
   * Cancel a batch
   */
  cancel(batchId: string): Promise<Batch>;

  /**
   * List batches
   */
  list(params?: BatchListParams): Promise<BatchList>;
}

/**
 * Models service interface
 */
export interface ModelsService {
  /**
   * List available models
   */
  list(): Promise<ModelList>;

  /**
   * Retrieve model details
   */
  retrieve(modelId: string): Promise<Model>;

  /**
   * Delete a fine-tuned model
   */
  delete(modelId: string): Promise<DeleteResponse>;
}

/**
 * Images service interface
 */
export interface ImagesService {
  /**
   * Generate images from prompt
   */
  generate(request: ImageGenerationRequest): Promise<ImageResponse>;

  /**
   * Edit an image
   */
  edit(request: ImageEditRequest): Promise<ImageResponse>;

  /**
   * Create image variations
   */
  variations(request: ImageVariationRequest): Promise<ImageResponse>;
}

/**
 * Audio service interface
 */
export interface AudioService {
  /**
   * Transcribe audio to text
   */
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResponse>;

  /**
   * Translate audio to English text
   */
  translate(request: TranslationRequest): Promise<TranslationResponse>;

  /**
   * Generate speech from text
   */
  speech(request: SpeechRequest): Promise<ArrayBuffer>;
}

/**
 * Moderations service interface
 */
export interface ModerationsService {
  /**
   * Create a moderation
   */
  create(request: ModerationRequest): Promise<ModerationResponse>;
}

/**
 * Fine-tuning service interface
 */
export interface FineTuningService {
  /**
   * Create a fine-tuning job
   */
  create(request: FineTuningJobRequest): Promise<FineTuningJob>;

  /**
   * List fine-tuning jobs
   */
  list(params?: FineTuningListParams): Promise<FineTuningJobList>;

  /**
   * Retrieve fine-tuning job
   */
  retrieve(jobId: string): Promise<FineTuningJob>;

  /**
   * Cancel fine-tuning job
   */
  cancel(jobId: string): Promise<FineTuningJob>;

  /**
   * List fine-tuning events
   */
  events(jobId: string, params?: EventListParams): Promise<FineTuningEventList>;

  /**
   * List fine-tuning checkpoints
   */
  checkpoints(jobId: string, params?: CheckpointListParams): Promise<CheckpointList>;
}

/**
 * Assistants service interface (Beta)
 */
export interface AssistantsService {
  /**
   * Create an assistant
   */
  create(request: AssistantCreateRequest): Promise<Assistant>;

  /**
   * List assistants
   */
  list(params?: AssistantListParams): Promise<AssistantList>;

  /**
   * Retrieve an assistant
   */
  retrieve(assistantId: string): Promise<Assistant>;

  /**
   * Modify an assistant
   */
  modify(assistantId: string, request: AssistantModifyRequest): Promise<Assistant>;

  /**
   * Delete an assistant
   */
  delete(assistantId: string): Promise<DeleteResponse>;

  /** Access thread operations */
  readonly threads: ThreadsService;

  /** Access message operations */
  readonly messages: MessagesService;

  /** Access run operations */
  readonly runs: RunsService;

  /** Access vector store operations */
  readonly vectorStores: VectorStoresService;
}
```

---

## 6. API Coverage

### 6.1 Models API

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| `/models` | GET | Full | List all models |
| `/models/{model}` | GET | Full | Retrieve model |
| `/models/{model}` | DELETE | Full | Delete fine-tuned model |

#### Request/Response Types (Rust)

```rust
/// Model object
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Model {
    pub id: String,
    pub object: String,  // Always "model"
    pub created: i64,
    pub owned_by: String,
}

/// List of models response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelList {
    pub object: String,  // Always "list"
    pub data: Vec<Model>,
}

/// Delete response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteResponse {
    pub id: String,
    pub object: String,
    pub deleted: bool,
}
```

### 6.2 Chat Completions API

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| `/chat/completions` | POST | Full | Sync and streaming |

#### Supported Features

- [x] Standard completions
- [x] Streaming completions (SSE)
- [x] Function calling / Tools
- [x] JSON mode / Structured outputs
- [x] Vision (image inputs)
- [x] Seed for reproducibility
- [x] Logprobs
- [x] Parallel tool calls
- [x] Response format (text/json_object/json_schema)

#### Request/Response Types (Rust)

```rust
/// Chat completion request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionRequest {
    /// Model ID (required)
    pub model: String,

    /// Messages array (required)
    pub messages: Vec<ChatMessage>,

    /// Sampling temperature (0-2)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,

    /// Nucleus sampling
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,

    /// Number of completions
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n: Option<u32>,

    /// Enable streaming
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,

    /// Stream options
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream_options: Option<StreamOptions>,

    /// Stop sequences
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop: Option<StopSequence>,

    /// Maximum tokens to generate
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,

    /// Maximum completion tokens (newer parameter)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_completion_tokens: Option<u32>,

    /// Presence penalty (-2.0 to 2.0)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presence_penalty: Option<f32>,

    /// Frequency penalty (-2.0 to 2.0)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frequency_penalty: Option<f32>,

    /// Logit bias
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logit_bias: Option<HashMap<String, f32>>,

    /// Return log probabilities
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logprobs: Option<bool>,

    /// Top logprobs to return
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_logprobs: Option<u32>,

    /// User identifier
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,

    /// Response format
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_format: Option<ResponseFormat>,

    /// Seed for reproducibility
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<i64>,

    /// Tools (function calling)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<Tool>>,

    /// Tool choice
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<ToolChoice>,

    /// Parallel tool calls
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parallel_tool_calls: Option<bool>,

    /// Service tier
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service_tier: Option<String>,
}

/// Chat message
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "role")]
pub enum ChatMessage {
    #[serde(rename = "system")]
    System { content: String, name: Option<String> },

    #[serde(rename = "user")]
    User { content: UserContent, name: Option<String> },

    #[serde(rename = "assistant")]
    Assistant {
        content: Option<String>,
        name: Option<String>,
        tool_calls: Option<Vec<ToolCall>>,
        refusal: Option<String>,
    },

    #[serde(rename = "tool")]
    Tool { content: String, tool_call_id: String },
}

/// User content (text or multimodal)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum UserContent {
    Text(String),
    Parts(Vec<ContentPart>),
}

/// Content part for multimodal input
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ContentPart {
    #[serde(rename = "text")]
    Text { text: String },

    #[serde(rename = "image_url")]
    ImageUrl { image_url: ImageUrl },
}

/// Chat completion response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionResponse {
    pub id: String,
    pub object: String,
    pub created: i64,
    pub model: String,
    pub choices: Vec<ChatChoice>,
    pub usage: Option<Usage>,
    pub system_fingerprint: Option<String>,
    pub service_tier: Option<String>,
}

/// Streaming chunk
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionChunk {
    pub id: String,
    pub object: String,
    pub created: i64,
    pub model: String,
    pub choices: Vec<ChunkChoice>,
    pub system_fingerprint: Option<String>,
    pub usage: Option<Usage>,
}
```

### 6.3 Embeddings API

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| `/embeddings` | POST | Full | All models supported |

#### Request/Response Types (Rust)

```rust
/// Embeddings request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingsRequest {
    /// Input text or array of texts
    pub input: EmbeddingsInput,

    /// Model ID (required)
    pub model: String,

    /// Encoding format (float or base64)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encoding_format: Option<EncodingFormat>,

    /// Number of dimensions (for models that support it)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dimensions: Option<u32>,

    /// User identifier
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
}

/// Embeddings input
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum EmbeddingsInput {
    Single(String),
    Multiple(Vec<String>),
    TokenIds(Vec<i32>),
    MultipleTokenIds(Vec<Vec<i32>>),
}

/// Embeddings response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingsResponse {
    pub object: String,
    pub data: Vec<Embedding>,
    pub model: String,
    pub usage: EmbeddingsUsage,
}

/// Individual embedding
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Embedding {
    pub object: String,
    pub index: u32,
    pub embedding: EmbeddingData,
}

/// Embedding data (float array or base64)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum EmbeddingData {
    Float(Vec<f32>),
    Base64(String),
}
```

### 6.4 Files API

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| `/files` | POST | Full | Upload files |
| `/files` | GET | Full | List files |
| `/files/{file_id}` | GET | Full | Retrieve file |
| `/files/{file_id}` | DELETE | Full | Delete file |
| `/files/{file_id}/content` | GET | Full | Download content |

#### Supported Purposes

- `assistants` - For Assistants API
- `batch` - For Batch API
- `fine-tune` - For fine-tuning
- `vision` - For vision input

#### Request/Response Types (Rust)

```rust
/// File upload request
#[derive(Debug)]
pub struct FileUploadRequest {
    /// File content (multipart)
    pub file: FileData,

    /// Purpose of the file
    pub purpose: FilePurpose,
}

/// File data for upload
#[derive(Debug)]
pub struct FileData {
    /// File name
    pub name: String,

    /// File content
    pub content: Bytes,

    /// MIME type
    pub content_type: Option<String>,
}

/// File purpose
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FilePurpose {
    Assistants,
    Batch,
    FineTune,
    Vision,
}

/// File object response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileObject {
    pub id: String,
    pub object: String,
    pub bytes: u64,
    pub created_at: i64,
    pub filename: String,
    pub purpose: String,
    pub status: Option<String>,
    pub status_details: Option<String>,
}

/// File list parameters
#[derive(Debug, Clone, Default, Serialize)]
pub struct FileListParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub purpose: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub after: Option<String>,
}

/// File list response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileList {
    pub object: String,
    pub data: Vec<FileObject>,
    pub has_more: bool,
}
```

### 6.5 Batches API

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| `/batches` | POST | Full | Create batch |
| `/batches/{batch_id}` | GET | Full | Retrieve batch |
| `/batches/{batch_id}/cancel` | POST | Full | Cancel batch |
| `/batches` | GET | Full | List batches |

#### Request/Response Types (Rust)

```rust
/// Batch create request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchCreateRequest {
    /// Input file ID (required)
    pub input_file_id: String,

    /// Endpoint for batch processing
    pub endpoint: BatchEndpoint,

    /// Completion window (currently only "24h")
    pub completion_window: String,

    /// Optional metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, String>>,
}

/// Supported batch endpoints
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BatchEndpoint {
    #[serde(rename = "/v1/chat/completions")]
    ChatCompletions,

    #[serde(rename = "/v1/embeddings")]
    Embeddings,

    #[serde(rename = "/v1/completions")]
    Completions,
}

/// Batch object
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Batch {
    pub id: String,
    pub object: String,
    pub endpoint: String,
    pub errors: Option<BatchErrors>,
    pub input_file_id: String,
    pub completion_window: String,
    pub status: BatchStatus,
    pub output_file_id: Option<String>,
    pub error_file_id: Option<String>,
    pub created_at: i64,
    pub in_progress_at: Option<i64>,
    pub expires_at: Option<i64>,
    pub finalizing_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub failed_at: Option<i64>,
    pub expired_at: Option<i64>,
    pub cancelling_at: Option<i64>,
    pub cancelled_at: Option<i64>,
    pub request_counts: Option<BatchRequestCounts>,
    pub metadata: Option<HashMap<String, String>>,
}

/// Batch status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BatchStatus {
    Validating,
    Failed,
    InProgress,
    Finalizing,
    Completed,
    Expired,
    Cancelling,
    Cancelled,
}
```

### 6.6 Images API

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| `/images/generations` | POST | Full | DALL-E generation |
| `/images/edits` | POST | Full | Image editing |
| `/images/variations` | POST | Full | Create variations |

#### Request/Response Types (Rust)

```rust
/// Image generation request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageGenerationRequest {
    /// Prompt describing desired image
    pub prompt: String,

    /// Model (dall-e-2 or dall-e-3)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,

    /// Number of images (1-10 for dall-e-2, 1 for dall-e-3)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n: Option<u32>,

    /// Quality (standard or hd, dall-e-3 only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quality: Option<String>,

    /// Response format (url or b64_json)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_format: Option<String>,

    /// Size
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,

    /// Style (vivid or natural, dall-e-3 only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<String>,

    /// User identifier
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
}

/// Image response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageResponse {
    pub created: i64,
    pub data: Vec<ImageData>,
}

/// Individual image data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub b64_json: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub revised_prompt: Option<String>,
}
```

### 6.7 Audio API

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| `/audio/transcriptions` | POST | Full | Whisper transcription |
| `/audio/translations` | POST | Full | Whisper translation |
| `/audio/speech` | POST | Full | Text-to-speech |

#### Request/Response Types (Rust)

```rust
/// Transcription request
#[derive(Debug)]
pub struct TranscriptionRequest {
    /// Audio file
    pub file: FileData,

    /// Model (whisper-1)
    pub model: String,

    /// Language (ISO-639-1)
    pub language: Option<String>,

    /// Prompt for context
    pub prompt: Option<String>,

    /// Response format (json, text, srt, verbose_json, vtt)
    pub response_format: Option<String>,

    /// Temperature
    pub temperature: Option<f32>,

    /// Timestamp granularities (word, segment)
    pub timestamp_granularities: Option<Vec<String>>,
}

/// Transcription response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionResponse {
    pub text: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub task: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub words: Option<Vec<Word>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub segments: Option<Vec<Segment>>,
}

/// Speech request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeechRequest {
    /// Model (tts-1 or tts-1-hd)
    pub model: String,

    /// Input text
    pub input: String,

    /// Voice (alloy, echo, fable, onyx, nova, shimmer)
    pub voice: String,

    /// Response format (mp3, opus, aac, flac, wav, pcm)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_format: Option<String>,

    /// Speed (0.25 to 4.0)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed: Option<f32>,
}
```

### 6.8 Moderations API

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| `/moderations` | POST | Full | Content moderation |

#### Request/Response Types (Rust)

```rust
/// Moderation request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModerationRequest {
    /// Input text or array
    pub input: ModerationInput,

    /// Model (text-moderation-latest, text-moderation-stable, omni-moderation-latest)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// Moderation input
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ModerationInput {
    Single(String),
    Multiple(Vec<String>),
    Multimodal(Vec<ModerationInputItem>),
}

/// Moderation response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModerationResponse {
    pub id: String,
    pub model: String,
    pub results: Vec<ModerationResult>,
}

/// Moderation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModerationResult {
    pub flagged: bool,
    pub categories: ModerationCategories,
    pub category_scores: ModerationCategoryScores,
    pub category_applied_input_types: Option<HashMap<String, Vec<String>>>,
}
```

### 6.9 Assistants API

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| `/assistants` | POST | Full (Beta) | Create assistant |
| `/assistants` | GET | Full (Beta) | List assistants |
| `/assistants/{id}` | GET | Full (Beta) | Retrieve assistant |
| `/assistants/{id}` | POST | Full (Beta) | Modify assistant |
| `/assistants/{id}` | DELETE | Full (Beta) | Delete assistant |
| `/threads` | POST | Full (Beta) | Create thread |
| `/threads/{id}` | GET | Full (Beta) | Retrieve thread |
| `/threads/{id}` | POST | Full (Beta) | Modify thread |
| `/threads/{id}` | DELETE | Full (Beta) | Delete thread |
| `/threads/{id}/messages` | POST | Full (Beta) | Create message |
| `/threads/{id}/messages` | GET | Full (Beta) | List messages |
| `/threads/{id}/messages/{msg}` | GET | Full (Beta) | Retrieve message |
| `/threads/{id}/messages/{msg}` | POST | Full (Beta) | Modify message |
| `/threads/{id}/messages/{msg}` | DELETE | Full (Beta) | Delete message |
| `/threads/{id}/runs` | POST | Full (Beta) | Create run |
| `/threads/{id}/runs` | GET | Full (Beta) | List runs |
| `/threads/{id}/runs/{run}` | GET | Full (Beta) | Retrieve run |
| `/threads/{id}/runs/{run}` | POST | Full (Beta) | Modify run |
| `/threads/{id}/runs/{run}/cancel` | POST | Full (Beta) | Cancel run |
| `/threads/{id}/runs/{run}/submit_tool_outputs` | POST | Full (Beta) | Submit tool outputs |
| `/threads/{id}/runs/{run}/steps` | GET | Full (Beta) | List run steps |
| `/threads/{id}/runs/{run}/steps/{step}` | GET | Full (Beta) | Retrieve run step |
| `/threads/runs` | POST | Full (Beta) | Create thread and run |
| `/vector_stores` | POST | Full (Beta) | Create vector store |
| `/vector_stores` | GET | Full (Beta) | List vector stores |
| `/vector_stores/{id}` | GET | Full (Beta) | Retrieve vector store |
| `/vector_stores/{id}` | POST | Full (Beta) | Modify vector store |
| `/vector_stores/{id}` | DELETE | Full (Beta) | Delete vector store |
| `/vector_stores/{id}/files` | POST | Full (Beta) | Create vector store file |
| `/vector_stores/{id}/files` | GET | Full (Beta) | List vector store files |
| `/vector_stores/{id}/files/{file}` | GET | Full (Beta) | Retrieve vector store file |
| `/vector_stores/{id}/files/{file}` | DELETE | Full (Beta) | Delete vector store file |
| `/vector_stores/{id}/file_batches` | POST | Full (Beta) | Create file batch |
| `/vector_stores/{id}/file_batches/{batch}` | GET | Full (Beta) | Retrieve file batch |
| `/vector_stores/{id}/file_batches/{batch}/cancel` | POST | Full (Beta) | Cancel file batch |
| `/vector_stores/{id}/file_batches/{batch}/files` | GET | Full (Beta) | List batch files |

### 6.10 Fine-tuning API

| Endpoint | Method | Support Level | Notes |
|----------|--------|---------------|-------|
| `/fine_tuning/jobs` | POST | Full | Create job |
| `/fine_tuning/jobs` | GET | Full | List jobs |
| `/fine_tuning/jobs/{id}` | GET | Full | Retrieve job |
| `/fine_tuning/jobs/{id}/cancel` | POST | Full | Cancel job |
| `/fine_tuning/jobs/{id}/events` | GET | Full | List events |
| `/fine_tuning/jobs/{id}/checkpoints` | GET | Full | List checkpoints |

---

## 7. Dependency Policy

### 7.1 Required Dependencies (Integration Repo Primitives)

| Primitive | Purpose | Interface |
|-----------|---------|-----------|
| `@integrations/errors` | Base error types and traits | `IntegrationError` trait |
| `@integrations/retry` | Retry logic with backoff | `RetryPolicy`, `RetryExecutor` |
| `@integrations/circuit-breaker` | Circuit breaker pattern | `CircuitBreaker` trait |
| `@integrations/rate-limits` | Rate limiting enforcement | `RateLimiter` trait |
| `@integrations/tracing` | Distributed tracing | `Span`, `Tracer` traits |
| `@integrations/logging` | Structured logging | `Logger` trait |
| `@integrations/types` | Common type definitions | Shared types |
| `@integrations/config` | Configuration management | `ConfigProvider` trait |

### 7.2 Approved Third-Party Dependencies

#### Rust Crates

| Crate | Version | Purpose | Justification |
|-------|---------|---------|---------------|
| `reqwest` | ^0.12 | HTTP client | Industry standard, async support |
| `tokio` | ^1.0 | Async runtime | Required by reqwest |
| `serde` | ^1.0 | Serialization | De-facto standard |
| `serde_json` | ^1.0 | JSON handling | Required for API |
| `secrecy` | ^0.8 | Secret handling | Secure credential management |
| `bytes` | ^1.0 | Byte buffers | Efficient data handling |
| `futures` | ^0.3 | Async utilities | Stream handling |
| `async-trait` | ^0.1 | Async traits | Ergonomic async interfaces |
| `thiserror` | ^1.0 | Error derivation | Clean error types |
| `url` | ^2.0 | URL parsing | Safe URL handling |
| `http` | ^1.0 | HTTP types | Standard types |
| `mime` | ^0.3 | MIME types | Content type handling |
| `base64` | ^0.22 | Base64 encoding | Embedding format support |
| `pin-project-lite` | ^0.2 | Pin projection | Stream implementation |

#### TypeScript Packages

| Package | Version | Purpose | Justification |
|---------|---------|---------|---------------|
| None beyond primitives | - | - | Zero external dependencies |

### 7.3 Forbidden Dependencies

| Category | Examples | Reason |
|----------|----------|--------|
| Other integration modules | `@integrations/anthropic`, `@integrations/gemini` | Module isolation |
| ruvbase | `ruvbase`, `layer-0` | Layer separation |
| ORM/Database | `diesel`, `sqlx`, `prisma` | Out of scope |
| Web frameworks | `actix-web`, `axum`, `express` | Out of scope |
| ML/AI libraries | `candle`, `ort`, `tensorflow.js` | Out of scope |

---

## 8. Error Taxonomy

### 8.1 Error Hierarchy

```
OpenAIError (root)
├── ConfigurationError
│   ├── MissingApiKey
│   ├── InvalidBaseUrl
│   └── InvalidConfiguration
├── AuthenticationError
│   ├── InvalidApiKey
│   ├── ExpiredApiKey
│   └── InsufficientPermissions
├── RequestError
│   ├── ValidationError
│   │   ├── MissingRequiredField
│   │   ├── InvalidFieldValue
│   │   └── MalformedRequest
│   ├── SerializationError
│   └── TooManyTokens
├── NetworkError
│   ├── ConnectionFailed
│   ├── Timeout
│   ├── DnsResolutionFailed
│   └── SslError
├── RateLimitError
│   ├── TooManyRequests
│   ├── QuotaExceeded
│   └── TokenLimitExceeded
├── ServerError
│   ├── InternalServerError
│   ├── ServiceUnavailable
│   ├── BadGateway
│   └── Overloaded
├── ResponseError
│   ├── DeserializationError
│   ├── UnexpectedResponse
│   ├── InvalidContentType
│   └── StreamInterrupted
├── ResourceError
│   ├── NotFound
│   ├── AlreadyExists
│   ├── Deleted
│   └── InvalidState
└── ContentPolicyError
    ├── ContentFiltered
    ├── SafetyViolation
    └── RefusedByModel
```

### 8.2 Error Type Definitions (Rust)

```rust
use thiserror::Error;
use integrations_errors::IntegrationError;

/// Root error type for OpenAI integration
#[derive(Error, Debug)]
pub enum OpenAIError {
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    #[error("Authentication error: {0}")]
    Authentication(#[from] AuthenticationError),

    #[error("Request error: {0}")]
    Request(#[from] RequestError),

    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    #[error("Rate limit error: {0}")]
    RateLimit(#[from] RateLimitError),

    #[error("Server error: {0}")]
    Server(#[from] ServerError),

    #[error("Response error: {0}")]
    Response(#[from] ResponseError),

    #[error("Resource error: {0}")]
    Resource(#[from] ResourceError),

    #[error("Content policy error: {0}")]
    ContentPolicy(#[from] ContentPolicyError),
}

impl IntegrationError for OpenAIError {
    fn error_code(&self) -> &'static str {
        match self {
            Self::Configuration(_) => "OPENAI_CONFIG",
            Self::Authentication(_) => "OPENAI_AUTH",
            Self::Request(_) => "OPENAI_REQUEST",
            Self::Network(_) => "OPENAI_NETWORK",
            Self::RateLimit(_) => "OPENAI_RATE_LIMIT",
            Self::Server(_) => "OPENAI_SERVER",
            Self::Response(_) => "OPENAI_RESPONSE",
            Self::Resource(_) => "OPENAI_RESOURCE",
            Self::ContentPolicy(_) => "OPENAI_CONTENT_POLICY",
        }
    }

    fn is_retryable(&self) -> bool {
        matches!(
            self,
            Self::Network(NetworkError::Timeout)
                | Self::Network(NetworkError::ConnectionFailed)
                | Self::RateLimit(RateLimitError::TooManyRequests)
                | Self::Server(ServerError::ServiceUnavailable)
                | Self::Server(ServerError::Overloaded)
                | Self::Response(ResponseError::StreamInterrupted)
        )
    }

    fn retry_after(&self) -> Option<Duration> {
        match self {
            Self::RateLimit(RateLimitError::TooManyRequests { retry_after }) => *retry_after,
            Self::Server(ServerError::ServiceUnavailable { retry_after }) => *retry_after,
            _ => None,
        }
    }

    fn http_status(&self) -> Option<u16> {
        match self {
            Self::Authentication(_) => Some(401),
            Self::RateLimit(_) => Some(429),
            Self::Resource(ResourceError::NotFound) => Some(404),
            Self::Server(ServerError::InternalServerError) => Some(500),
            Self::Server(ServerError::ServiceUnavailable { .. }) => Some(503),
            Self::Server(ServerError::BadGateway) => Some(502),
            _ => None,
        }
    }
}

#[derive(Error, Debug)]
pub enum ConfigurationError {
    #[error("API key is missing")]
    MissingApiKey,

    #[error("Invalid base URL: {url}")]
    InvalidBaseUrl { url: String },

    #[error("Invalid configuration: {message}")]
    InvalidConfiguration { message: String },
}

#[derive(Error, Debug)]
pub enum AuthenticationError {
    #[error("Invalid API key")]
    InvalidApiKey,

    #[error("API key has expired")]
    ExpiredApiKey,

    #[error("Insufficient permissions: {required}")]
    InsufficientPermissions { required: String },
}

#[derive(Error, Debug)]
pub enum RateLimitError {
    #[error("Too many requests")]
    TooManyRequests { retry_after: Option<Duration> },

    #[error("Quota exceeded: {message}")]
    QuotaExceeded { message: String },

    #[error("Token limit exceeded: {limit} tokens")]
    TokenLimitExceeded { limit: u32 },
}

#[derive(Error, Debug)]
pub enum ServerError {
    #[error("Internal server error")]
    InternalServerError,

    #[error("Service unavailable")]
    ServiceUnavailable { retry_after: Option<Duration> },

    #[error("Bad gateway")]
    BadGateway,

    #[error("Server overloaded")]
    Overloaded,
}
```

### 8.3 Error Mapping from HTTP Status

| HTTP Status | Error Type | Retryable |
|-------------|------------|-----------|
| 400 | `RequestError::ValidationError` | No |
| 401 | `AuthenticationError::InvalidApiKey` | No |
| 403 | `AuthenticationError::InsufficientPermissions` | No |
| 404 | `ResourceError::NotFound` | No |
| 409 | `ResourceError::AlreadyExists` | No |
| 422 | `RequestError::ValidationError` | No |
| 429 | `RateLimitError::TooManyRequests` | Yes |
| 500 | `ServerError::InternalServerError` | Yes (limited) |
| 502 | `ServerError::BadGateway` | Yes |
| 503 | `ServerError::ServiceUnavailable` | Yes |
| 504 | `NetworkError::Timeout` | Yes |

---

## 9. Phase-3-Ready Hooks

### 9.1 Retry Policy

#### 9.1.1 Retry Configuration

```rust
/// Retry configuration for OpenAI requests
pub struct OpenAIRetryConfig {
    /// Maximum number of retry attempts
    pub max_retries: u32,

    /// Initial backoff duration
    pub initial_backoff: Duration,

    /// Maximum backoff duration
    pub max_backoff: Duration,

    /// Backoff multiplier
    pub backoff_multiplier: f64,

    /// Jitter factor (0.0 to 1.0)
    pub jitter: f64,

    /// Retryable status codes
    pub retryable_status_codes: Vec<u16>,
}

impl Default for OpenAIRetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_backoff: Duration::from_millis(500),
            max_backoff: Duration::from_secs(60),
            backoff_multiplier: 2.0,
            jitter: 0.1,
            retryable_status_codes: vec![429, 500, 502, 503, 504],
        }
    }
}
```

#### 9.1.2 Retry Hook Interface

```rust
/// Hook for customizing retry behavior
#[async_trait]
pub trait RetryHook: Send + Sync {
    /// Called before each retry attempt
    async fn on_retry(
        &self,
        attempt: u32,
        error: &OpenAIError,
        next_delay: Duration,
    ) -> RetryDecision;

    /// Called when all retries are exhausted
    async fn on_exhausted(&self, error: &OpenAIError, attempts: u32);
}

/// Decision returned by retry hook
pub enum RetryDecision {
    /// Proceed with retry after specified delay
    Retry(Duration),

    /// Abort retrying immediately
    Abort,

    /// Use default behavior
    Default,
}
```

### 9.2 Rate Limiting

#### 9.2.1 Rate Limit Configuration

```rust
/// Rate limit configuration
pub struct OpenAIRateLimitConfig {
    /// Requests per minute (RPM)
    pub requests_per_minute: Option<u32>,

    /// Tokens per minute (TPM)
    pub tokens_per_minute: Option<u32>,

    /// Requests per day (RPD)
    pub requests_per_day: Option<u32>,

    /// Tokens per day (TPD)
    pub tokens_per_day: Option<u64>,

    /// Enable automatic rate limit adjustment from headers
    pub auto_adjust: bool,

    /// Queue requests when rate limited
    pub queue_requests: bool,

    /// Maximum queue size
    pub max_queue_size: usize,
}
```

#### 9.2.2 Rate Limit Hook Interface

```rust
/// Hook for customizing rate limit behavior
#[async_trait]
pub trait RateLimitHook: Send + Sync {
    /// Called when a request is about to be rate limited
    async fn on_rate_limit(
        &self,
        request_id: &str,
        limit_type: RateLimitType,
        retry_after: Option<Duration>,
    ) -> RateLimitDecision;

    /// Called when rate limit headers are received
    async fn on_rate_limit_update(&self, headers: &RateLimitHeaders);
}

/// Type of rate limit hit
pub enum RateLimitType {
    RequestsPerMinute,
    TokensPerMinute,
    RequestsPerDay,
    TokensPerDay,
    ServerEnforced,
}

/// Decision returned by rate limit hook
pub enum RateLimitDecision {
    /// Wait and retry
    Wait(Duration),

    /// Queue the request
    Queue,

    /// Reject immediately
    Reject,

    /// Use default behavior
    Default,
}

/// Rate limit headers from OpenAI
pub struct RateLimitHeaders {
    pub limit_requests: Option<u32>,
    pub limit_tokens: Option<u32>,
    pub remaining_requests: Option<u32>,
    pub remaining_tokens: Option<u32>,
    pub reset_requests: Option<Duration>,
    pub reset_tokens: Option<Duration>,
}
```

### 9.3 Circuit Breaker

#### 9.3.1 Circuit Breaker Configuration

```rust
/// Circuit breaker configuration
pub struct OpenAICircuitBreakerConfig {
    /// Failure threshold to open circuit
    pub failure_threshold: u32,

    /// Success threshold to close circuit
    pub success_threshold: u32,

    /// Time window for counting failures
    pub failure_window: Duration,

    /// Time to wait before half-open state
    pub recovery_timeout: Duration,

    /// Endpoints to monitor separately
    pub per_endpoint: bool,

    /// Errors that count as failures
    pub failure_predicates: Vec<CircuitBreakerPredicate>,
}

impl Default for OpenAICircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            success_threshold: 3,
            failure_window: Duration::from_secs(60),
            recovery_timeout: Duration::from_secs(30),
            per_endpoint: false,
            failure_predicates: vec![
                CircuitBreakerPredicate::ServerError,
                CircuitBreakerPredicate::Timeout,
            ],
        }
    }
}
```

#### 9.3.2 Circuit Breaker Hook Interface

```rust
/// Hook for customizing circuit breaker behavior
#[async_trait]
pub trait CircuitBreakerHook: Send + Sync {
    /// Called when circuit state changes
    async fn on_state_change(
        &self,
        from: CircuitState,
        to: CircuitState,
        stats: &CircuitStats,
    );

    /// Called when a request is rejected due to open circuit
    async fn on_rejected(&self, request_id: &str, endpoint: &str);

    /// Called on each request outcome
    async fn on_outcome(&self, outcome: RequestOutcome, endpoint: &str);
}

/// Circuit breaker states
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    Closed,
    Open,
    HalfOpen,
}

/// Circuit statistics
pub struct CircuitStats {
    pub failure_count: u32,
    pub success_count: u32,
    pub total_requests: u64,
    pub last_failure: Option<Instant>,
    pub state_changed_at: Instant,
}
```

---

## 10. Security Handling

### 10.1 Credential Management

#### 10.1.1 API Key Handling

```rust
use secrecy::{ExposeSecret, SecretString, Zeroize};

/// Secure API key wrapper
pub struct ApiKey(SecretString);

impl ApiKey {
    /// Create a new API key from a string
    pub fn new(key: impl Into<String>) -> Self {
        Self(SecretString::new(key.into()))
    }

    /// Create from environment variable
    pub fn from_env(var_name: &str) -> Result<Self, ConfigurationError> {
        std::env::var(var_name)
            .map(Self::new)
            .map_err(|_| ConfigurationError::MissingApiKey)
    }

    /// Expose the key for use in requests (internal only)
    pub(crate) fn expose(&self) -> &str {
        self.0.expose_secret()
    }
}

impl Drop for ApiKey {
    fn drop(&mut self) {
        // SecretString handles zeroization
    }
}

// Prevent accidental logging
impl std::fmt::Debug for ApiKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ApiKey([REDACTED])")
    }
}

impl std::fmt::Display for ApiKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("[REDACTED]")
    }
}
```

#### 10.1.2 Credential Sources (Priority Order)

1. **Explicit Configuration** - Passed directly to client constructor
2. **Environment Variables** - `OPENAI_API_KEY`, `OPENAI_ORG_ID`, `OPENAI_PROJECT_ID`
3. **Configuration File** - Loaded via `@integrations/config` primitive

### 10.2 Request Security

#### 10.2.1 Header Sanitization

```rust
/// Headers that must never be logged
const SENSITIVE_HEADERS: &[&str] = &[
    "authorization",
    "x-api-key",
    "openai-organization",
    "openai-project",
];

/// Sanitize headers for logging
pub fn sanitize_headers_for_logging(headers: &HeaderMap) -> HashMap<String, String> {
    headers
        .iter()
        .map(|(k, v)| {
            let key = k.as_str().to_lowercase();
            let value = if SENSITIVE_HEADERS.contains(&key.as_str()) {
                "[REDACTED]".to_string()
            } else {
                v.to_str().unwrap_or("[INVALID]").to_string()
            };
            (key, value)
        })
        .collect()
}
```

#### 10.2.2 TLS Configuration

```rust
/// TLS configuration requirements
pub struct TlsConfig {
    /// Minimum TLS version (must be 1.2 or higher)
    pub min_version: TlsVersion,

    /// Enable certificate verification
    pub verify_certificates: bool,

    /// Custom CA certificates (optional)
    pub custom_ca_certs: Option<Vec<Certificate>>,
}

impl Default for TlsConfig {
    fn default() -> Self {
        Self {
            min_version: TlsVersion::Tls12,
            verify_certificates: true,
            custom_ca_certs: None,
        }
    }
}
```

### 10.3 Data Handling

#### 10.3.1 PII Considerations

| Data Type | Handling | Logging Policy |
|-----------|----------|----------------|
| API Keys | `SecretString` | Never log |
| User messages | Pass-through | Log only with explicit opt-in |
| Model responses | Pass-through | Log only with explicit opt-in |
| File contents | Pass-through | Never log content |
| Embeddings | Pass-through | Log dimensions only |

#### 10.3.2 Logging Levels

```rust
/// Logging configuration for security
pub struct LoggingSecurityConfig {
    /// Log request bodies (default: false)
    pub log_request_bodies: bool,

    /// Log response bodies (default: false)
    pub log_response_bodies: bool,

    /// Maximum body length to log if enabled
    pub max_body_log_length: usize,

    /// Redact patterns in logged content
    pub redaction_patterns: Vec<Regex>,
}

impl Default for LoggingSecurityConfig {
    fn default() -> Self {
        Self {
            log_request_bodies: false,
            log_response_bodies: false,
            max_body_log_length: 1000,
            redaction_patterns: vec![],
        }
    }
}
```

---

## 11. Telemetry Requirements

### 11.1 Metrics

#### 11.1.1 Required Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `openai_requests_total` | Counter | `endpoint`, `status`, `model` | Total requests |
| `openai_request_duration_seconds` | Histogram | `endpoint`, `model` | Request latency |
| `openai_tokens_used_total` | Counter | `model`, `type` (prompt/completion) | Token usage |
| `openai_errors_total` | Counter | `endpoint`, `error_type` | Error counts |
| `openai_rate_limit_hits_total` | Counter | `endpoint`, `limit_type` | Rate limit events |
| `openai_circuit_breaker_state` | Gauge | `endpoint` | Circuit state (0=closed, 1=open, 2=half-open) |
| `openai_retry_attempts_total` | Counter | `endpoint`, `attempt_number` | Retry attempts |
| `openai_streaming_chunks_total` | Counter | `endpoint`, `model` | Streaming chunks received |

#### 11.1.2 Metrics Hook Interface

```rust
/// Hook for emitting metrics
#[async_trait]
pub trait MetricsHook: Send + Sync {
    /// Record a request completion
    fn record_request(
        &self,
        endpoint: &str,
        model: Option<&str>,
        status: RequestStatus,
        duration: Duration,
    );

    /// Record token usage
    fn record_tokens(
        &self,
        model: &str,
        prompt_tokens: u32,
        completion_tokens: u32,
    );

    /// Record an error
    fn record_error(&self, endpoint: &str, error_type: &str);

    /// Record rate limit hit
    fn record_rate_limit(&self, endpoint: &str, limit_type: RateLimitType);

    /// Update circuit breaker state
    fn update_circuit_state(&self, endpoint: &str, state: CircuitState);
}
```

### 11.2 Tracing

#### 11.2.1 Span Structure

```
openai.request (root span)
├── openai.serialize_request
├── openai.rate_limit_check
├── openai.http_request
│   ├── dns.lookup
│   ├── tcp.connect
│   ├── tls.handshake
│   └── http.response
├── openai.deserialize_response
└── openai.retry (if applicable)
    └── openai.http_request (retry attempt)
```

#### 11.2.2 Required Span Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `openai.endpoint` | string | API endpoint path |
| `openai.model` | string | Model ID used |
| `openai.organization_id` | string | Organization ID (if present) |
| `openai.request_id` | string | OpenAI request ID from response |
| `openai.tokens.prompt` | int | Prompt tokens used |
| `openai.tokens.completion` | int | Completion tokens used |
| `openai.streaming` | bool | Whether streaming was used |
| `http.method` | string | HTTP method |
| `http.status_code` | int | HTTP status code |
| `http.url` | string | Request URL (without auth) |

#### 11.2.3 Tracing Hook Interface

```rust
/// Hook for distributed tracing
#[async_trait]
pub trait TracingHook: Send + Sync {
    /// Start a new span for a request
    fn start_span(&self, name: &str, parent: Option<&SpanContext>) -> SpanGuard;

    /// Add an attribute to the current span
    fn set_attribute(&self, key: &str, value: AttributeValue);

    /// Record an error on the current span
    fn record_error(&self, error: &OpenAIError);

    /// Add an event to the current span
    fn add_event(&self, name: &str, attributes: &[(&str, AttributeValue)]);
}
```

### 11.3 Logging

#### 11.3.1 Log Levels

| Level | Use Case |
|-------|----------|
| ERROR | Unrecoverable errors, authentication failures |
| WARN | Rate limits hit, retries exhausted, circuit open |
| INFO | Request start/end, configuration loaded |
| DEBUG | Request/response details (sanitized) |
| TRACE | Full wire-level details (development only) |

#### 11.3.2 Structured Log Fields

```rust
/// Standard log fields for all OpenAI operations
pub struct OpenAILogContext {
    /// Correlation ID for request tracing
    pub correlation_id: String,

    /// API endpoint
    pub endpoint: String,

    /// Model used (if applicable)
    pub model: Option<String>,

    /// Organization ID
    pub organization_id: Option<String>,

    /// OpenAI request ID
    pub request_id: Option<String>,

    /// Duration in milliseconds
    pub duration_ms: Option<u64>,

    /// HTTP status code
    pub status_code: Option<u16>,

    /// Error code (if error)
    pub error_code: Option<String>,
}
```

---

## 12. Future-Proofing Rules

### 12.1 API Version Strategy

#### 12.1.1 Version Handling

```rust
/// API version configuration
pub struct ApiVersionConfig {
    /// Base API version (default: v1)
    pub version: String,

    /// Beta features enabled
    pub enable_beta: bool,

    /// OpenAI-Beta header value
    pub beta_header: Option<String>,
}

impl Default for ApiVersionConfig {
    fn default() -> Self {
        Self {
            version: "v1".to_string(),
            enable_beta: false,
            beta_header: None,
        }
    }
}
```

#### 12.1.2 Deprecation Handling

```rust
/// Deprecation warning hook
#[async_trait]
pub trait DeprecationHook: Send + Sync {
    /// Called when a deprecated feature is used
    fn on_deprecation_warning(
        &self,
        feature: &str,
        sunset_date: Option<&str>,
        replacement: Option<&str>,
    );
}
```

### 12.2 Extension Points

#### 12.2.1 Middleware System

```rust
/// Middleware for request/response interception
#[async_trait]
pub trait Middleware: Send + Sync {
    /// Process outgoing request
    async fn process_request(&self, request: &mut Request) -> Result<(), OpenAIError>;

    /// Process incoming response
    async fn process_response(&self, response: &mut Response) -> Result<(), OpenAIError>;
}

/// Middleware chain builder
pub struct MiddlewareChain {
    middlewares: Vec<Box<dyn Middleware>>,
}

impl MiddlewareChain {
    pub fn new() -> Self {
        Self { middlewares: vec![] }
    }

    pub fn add<M: Middleware + 'static>(mut self, middleware: M) -> Self {
        self.middlewares.push(Box::new(middleware));
        self
    }
}
```

#### 12.2.2 Custom Transport

```rust
/// Custom HTTP transport for testing or special requirements
#[async_trait]
pub trait HttpTransport: Send + Sync {
    /// Send an HTTP request
    async fn send(&self, request: Request) -> Result<Response, NetworkError>;
}
```

### 12.3 Schema Evolution

#### 12.3.1 Unknown Field Handling

```rust
use serde::de::IgnoredAny;

/// Response type with forward compatibility
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionResponse {
    pub id: String,
    pub object: String,
    pub created: i64,
    pub model: String,
    pub choices: Vec<ChatChoice>,
    pub usage: Option<Usage>,
    pub system_fingerprint: Option<String>,
    pub service_tier: Option<String>,

    /// Capture unknown fields for forward compatibility
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}
```

#### 12.3.2 Enumeration Extensibility

```rust
/// Extensible enum pattern for forward compatibility
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FinishReason {
    Stop,
    Length,
    ToolCalls,
    ContentFilter,
    FunctionCall, // Deprecated but supported

    /// Unknown finish reason (forward compatibility)
    #[serde(other)]
    Unknown,
}
```

### 12.4 Compatibility Guidelines

| Rule | Description |
|------|-------------|
| **Additive Changes Only** | New fields MUST be optional |
| **Unknown Fields Preserved** | Use `#[serde(flatten)]` for extra fields |
| **Enum Extensibility** | Use `#[serde(other)]` for unknown variants |
| **Deprecation Period** | 6 months minimum before removal |
| **Version Headers** | Support `OpenAI-Version` header when available |
| **Beta Isolation** | Beta features behind feature flags |

---

## 13. London-School TDD Principles

### 13.1 Interface-First Design

All public types are defined as traits (Rust) or interfaces (TypeScript) before implementation:

```rust
// Define the interface first
#[async_trait]
pub trait ChatCompletionService: Send + Sync {
    async fn create(&self, request: ChatCompletionRequest) -> Result<ChatCompletionResponse, OpenAIError>;
    async fn create_stream(&self, request: ChatCompletionRequest) -> Result<ChatCompletionStream, OpenAIError>;
}

// Implementation comes after tests are written
pub struct ChatCompletionServiceImpl {
    transport: Box<dyn HttpTransport>,
    config: OpenAIConfig,
}

#[async_trait]
impl ChatCompletionService for ChatCompletionServiceImpl {
    // Implementation
}
```

### 13.2 Mock Boundaries

#### 13.2.1 Mockable Dependencies

| Dependency | Mock Strategy |
|------------|---------------|
| HTTP Transport | Mock `HttpTransport` trait |
| Clock/Time | Mock `TimeProvider` trait |
| Random/Jitter | Mock `RandomProvider` trait |
| Configuration | Mock `ConfigProvider` trait |
| Metrics | Mock `MetricsHook` trait |
| Tracing | Mock `TracingHook` trait |

#### 13.2.2 Test Double Patterns

```rust
/// Mock HTTP transport for testing
pub struct MockHttpTransport {
    responses: Vec<MockResponse>,
    calls: Arc<Mutex<Vec<Request>>>,
}

impl MockHttpTransport {
    pub fn new() -> Self {
        Self {
            responses: vec![],
            calls: Arc::new(Mutex::new(vec![])),
        }
    }

    pub fn with_response(mut self, response: MockResponse) -> Self {
        self.responses.push(response);
        self
    }

    pub fn calls(&self) -> Vec<Request> {
        self.calls.lock().unwrap().clone()
    }
}

#[async_trait]
impl HttpTransport for MockHttpTransport {
    async fn send(&self, request: Request) -> Result<Response, NetworkError> {
        self.calls.lock().unwrap().push(request);
        // Return next queued response
    }
}
```

### 13.3 Test Organization

```
tests/
├── unit/
│   ├── client_test.rs
│   ├── chat_completion_test.rs
│   ├── embeddings_test.rs
│   ├── files_test.rs
│   ├── error_handling_test.rs
│   └── serialization_test.rs
├── integration/
│   ├── mock_server_test.rs
│   └── contract_test.rs
└── fixtures/
    ├── chat_completion_response.json
    ├── error_response.json
    └── streaming_chunks.txt
```

### 13.4 Test Categories

| Category | Description | Mocks |
|----------|-------------|-------|
| Unit | Single component behavior | All dependencies mocked |
| Integration | Component interaction | External services mocked |
| Contract | API contract verification | Mock server with real schemas |
| E2E | Full stack (CI only) | Real OpenAI API (limited) |

---

## 14. Glossary

| Term | Definition |
|------|------------|
| **API Key** | Secret credential for authenticating with OpenAI API |
| **Batch API** | OpenAI endpoint for processing multiple requests asynchronously |
| **Circuit Breaker** | Pattern to prevent cascading failures by failing fast |
| **Completion** | Generated text response from a language model |
| **Embedding** | Vector representation of text for semantic similarity |
| **Fine-tuning** | Process of customizing a model on specific data |
| **Integration Repo** | Parent repository containing all LLM provider integrations |
| **London-School TDD** | Test-driven development emphasizing mocks and interfaces |
| **Primitive** | Shared utility module in the Integration Repo |
| **Rate Limiting** | Mechanism to control request frequency |
| **Retry Policy** | Strategy for retrying failed requests |
| **ruvbase** | Layer 0 foundation (explicitly excluded from this module) |
| **SPARC** | Specification → Pseudocode → Architecture → Refinement → Completion |
| **SSE** | Server-Sent Events for streaming responses |
| **Token** | Unit of text for language model processing |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-08 | SPARC Generator | Initial specification |

---

**End of Specification Phase**

*This document defines the complete specification for the OpenAI Integration Module. The next phase (Pseudocode) will provide algorithmic implementations for each interface defined here.*
