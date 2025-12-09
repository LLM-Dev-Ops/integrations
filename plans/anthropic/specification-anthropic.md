# Anthropic Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/anthropic`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Module Purpose and Scope](#2-module-purpose-and-scope)
3. [Dependency Policy](#3-dependency-policy)
4. [API Coverage](#4-api-coverage)
5. [Interface Definitions](#5-interface-definitions)
6. [Error Taxonomy](#6-error-taxonomy)
7. [Resilience Hooks](#7-resilience-hooks)
8. [Security Requirements](#8-security-requirements)
9. [Observability Requirements](#9-observability-requirements)
10. [Performance Requirements](#10-performance-requirements)
11. [Future-Proofing](#11-future-proofing)
12. [Acceptance Criteria](#12-acceptance-criteria)

---

## 1. Overview

### 1.1 Document Purpose

This specification defines the requirements, interfaces, and constraints for the Anthropic Integration Module within the LLM-Dev-Ops Integration Repository. It serves as the authoritative source for what the module must accomplish.

### 1.2 Audience

- Implementation developers (Rust and TypeScript)
- QA engineers designing test strategies
- Architects reviewing integration patterns
- Security reviewers assessing credential handling

### 1.3 Methodology

This specification follows:
- **SPARC Methodology**: Specification → Pseudocode → Architecture → Refinement → Completion
- **London-School TDD**: Interface-first design enabling mock-based testing
- **SOLID Principles**: Clean, maintainable, extensible design

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The Anthropic Integration Module provides a production-ready, type-safe interface for interacting with Anthropic's Claude API. It abstracts HTTP communication, handles authentication, manages resilience patterns, and provides comprehensive observability—all while maintaining clean dependency boundaries.

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **API Abstraction** | Type-safe wrappers for all Anthropic API endpoints |
| **Authentication** | Secure management of API keys with proper credential handling |
| **Transport** | HTTP/HTTPS communication with connection pooling |
| **Streaming** | Server-Sent Events (SSE) parsing for streaming responses |
| **Serialization** | JSON serialization/deserialization with strict type validation |
| **Resilience Integration** | Hooks for retry, circuit breaker, and rate limiting primitives |
| **Observability** | Tracing spans, metrics emission, structured logging |
| **Error Mapping** | Translation of API errors to typed domain errors |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Messages API | Sync and streaming message creation |
| Models API | List available models |
| Token Counting | Estimate token counts for messages |
| Message Batches API | Batch processing for large workloads |
| Admin API | Organization and workspace management |
| Beta Features | Extended thinking, PDF support, prompt caching |
| Dual Language | Rust (primary) and TypeScript implementations |

#### Out of Scope

| Item | Reason |
|------|--------|
| Other LLM providers | Separate integration modules (OpenAI, Google, etc.) |
| ruvbase (Layer 0) | External dependency, not implemented here |
| Business logic | Application-layer concern |
| Prompt engineering | Higher-level abstraction |
| Model fine-tuning | Not currently offered by Anthropic API |
| Caching implementation | Uses primitive hook, does not implement |
| Embeddings | Not currently offered by Anthropic API |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| No direct HTTP client dependency exposure | Encapsulation, testability |
| Async-first design | I/O-bound operations, efficiency |
| Zero `unsafe` in public API (Rust) | Safety guarantees |
| No panics in production paths | Reliability |
| Trait-based abstractions | London-School TDD, mockability |
| Semantic versioning | API stability |

---

## 3. Dependency Policy

### 3.1 Allowed Dependencies

The module may depend ONLY on the following Integration Repo primitives:

| Primitive | Purpose | Import Path |
|-----------|---------|-------------|
| `integrations-errors` | Base error types and traits | `integrations_errors` |
| `integrations-retry` | Retry executor with backoff strategies | `integrations_retry` |
| `integrations-circuit-breaker` | Circuit breaker state machine | `integrations_circuit_breaker` |
| `integrations-rate-limit` | Rate limiting (token bucket, sliding window) | `integrations_rate_limit` |
| `integrations-tracing` | Distributed tracing abstraction | `integrations_tracing` |
| `integrations-logging` | Structured logging abstraction | `integrations_logging` |
| `integrations-types` | Shared type definitions | `integrations_types` |
| `integrations-config` | Configuration management | `integrations_config` |

### 3.2 External Dependencies (Rust)

| Crate | Version | Purpose |
|-------|---------|---------|
| `tokio` | 1.x | Async runtime |
| `reqwest` | 0.11+ | HTTP client (behind transport trait) |
| `serde` | 1.x | Serialization |
| `serde_json` | 1.x | JSON handling |
| `async-trait` | 0.1+ | Async trait support |
| `thiserror` | 1.x | Error derivation |
| `secrecy` | 0.8+ | Secret string handling |
| `url` | 2.x | URL parsing |
| `bytes` | 1.x | Byte buffer handling |
| `futures` | 0.3+ | Stream utilities |
| `pin-project` | 1.x | Pin projection for streams |

### 3.3 External Dependencies (TypeScript)

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | 5.x | Language |
| `node-fetch` / native fetch | Latest | HTTP client |
| `zod` | 3.x | Runtime type validation |
| `eventsource-parser` | 1.x | SSE parsing |

### 3.4 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `ruvbase` | Layer 0, external to this module |
| `integrations-openai` | No cross-integration dependencies |
| `integrations-google` | No cross-integration dependencies |
| Any LLM-specific crate | This module IS the LLM integration |

---

## 4. API Coverage

### 4.1 Messages API

The primary API for interacting with Claude models.

#### 4.1.1 Create Message

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /v1/messages` |
| Authentication | API key (x-api-key header) |
| Request Format | JSON |
| Response Format | JSON or SSE (streaming) |
| Idempotency | Not guaranteed |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Model identifier (e.g., "claude-sonnet-4-20250514") |
| `max_tokens` | integer | Yes | Maximum tokens to generate |
| `messages` | array | Yes | Conversation messages |
| `system` | string/array | No | System prompt(s) |
| `metadata` | object | No | Request metadata (user_id) |
| `stop_sequences` | array | No | Custom stop sequences |
| `stream` | boolean | No | Enable streaming |
| `temperature` | number | No | Sampling temperature (0-1) |
| `top_p` | number | No | Nucleus sampling |
| `top_k` | integer | No | Top-k sampling |
| `tools` | array | No | Tool definitions |
| `tool_choice` | object | No | Tool selection control |

**Message Types:**

| Role | Content Types | Description |
|------|---------------|-------------|
| `user` | text, image, document | User input |
| `assistant` | text, tool_use | Model response |

**Content Block Types:**

| Type | Fields | Description |
|------|--------|-------------|
| `text` | `text: string` | Plain text content |
| `image` | `source: {type, media_type, data}` | Base64-encoded image |
| `document` | `source: {type, media_type, data}` | PDF document (beta) |
| `tool_use` | `id, name, input` | Tool invocation |
| `tool_result` | `tool_use_id, content, is_error` | Tool response |

#### 4.1.2 Streaming Messages

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /v1/messages` (with `stream: true`) |
| Response Format | Server-Sent Events (SSE) |
| Event Types | See below |

**SSE Event Types:**

| Event | Description | Payload |
|-------|-------------|---------|
| `message_start` | Message creation started | `{type, message}` |
| `content_block_start` | New content block | `{type, index, content_block}` |
| `content_block_delta` | Incremental content | `{type, index, delta}` |
| `content_block_stop` | Content block complete | `{type, index}` |
| `message_delta` | Message-level update | `{type, delta, usage}` |
| `message_stop` | Message complete | `{type}` |
| `ping` | Keep-alive | `{type}` |
| `error` | Error occurred | `{type, error}` |

### 4.2 Models API

List available Claude models.

| Attribute | Value |
|-----------|-------|
| Endpoint | `GET /v1/models` |
| Authentication | API key |
| Pagination | Cursor-based |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `data` | array | List of model objects |
| `has_more` | boolean | More results available |
| `first_id` | string | First model ID in list |
| `last_id` | string | Last model ID in list |

**Model Object:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Model identifier |
| `type` | string | Always "model" |
| `display_name` | string | Human-readable name |
| `created_at` | string | ISO 8601 timestamp |

### 4.3 Token Counting API

Count tokens for messages without making a completion request.

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /v1/messages/count_tokens` |
| Authentication | API key |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Model identifier |
| `messages` | array | Yes | Messages to count |
| `system` | string/array | No | System prompt(s) |
| `tools` | array | No | Tool definitions |

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| `input_tokens` | integer | Token count |

### 4.4 Message Batches API

Process large numbers of messages asynchronously.

#### 4.4.1 Create Batch

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST /v1/messages/batches` |
| Max Requests | 10,000 per batch |
| Max Size | 32 MB |

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `requests` | array | Yes | Array of batch requests |

**Batch Request Object:**

| Field | Type | Description |
|-------|------|-------------|
| `custom_id` | string | Client-provided ID |
| `params` | object | Message creation parameters |

#### 4.4.2 Batch Operations

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List batches | `/v1/messages/batches` | GET |
| Get batch | `/v1/messages/batches/{id}` | GET |
| Get results | `/v1/messages/batches/{id}/results` | GET |
| Cancel batch | `/v1/messages/batches/{id}/cancel` | POST |

**Batch Status Values:**

| Status | Description |
|--------|-------------|
| `in_progress` | Processing |
| `ended` | Completed (check results) |
| `canceling` | Cancel requested |
| `canceled` | Canceled |
| `expired` | Timed out |

### 4.5 Admin API

Organization and workspace management (requires Admin API key).

#### 4.5.1 Organization Management

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Get organization | `/v1/organizations/{id}` | GET |
| List members | `/v1/organizations/{id}/members` | GET |
| Add member | `/v1/organizations/{id}/members` | POST |
| Update member | `/v1/organizations/{id}/members/{user_id}` | POST |
| Remove member | `/v1/organizations/{id}/members/{user_id}` | DELETE |

#### 4.5.2 Workspace Management

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List workspaces | `/v1/organizations/{id}/workspaces` | GET |
| Create workspace | `/v1/organizations/{id}/workspaces` | POST |
| Get workspace | `/v1/workspaces/{id}` | GET |
| Update workspace | `/v1/workspaces/{id}` | POST |
| Archive workspace | `/v1/workspaces/{id}` | DELETE |

#### 4.5.3 API Keys Management

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List API keys | `/v1/organizations/{id}/api_keys` | GET |
| Get API key | `/v1/api_keys/{id}` | GET |
| Update API key | `/v1/api_keys/{id}` | POST |

#### 4.5.4 Invites Management

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List invites | `/v1/organizations/{id}/invites` | GET |
| Create invite | `/v1/organizations/{id}/invites` | POST |
| Get invite | `/v1/invites/{id}` | GET |
| Delete invite | `/v1/invites/{id}` | DELETE |

### 4.6 Beta Features

#### 4.6.1 Extended Thinking

Enable Claude to show reasoning process (claude-sonnet-4-20250514 and claude-3-7-sonnet-20250219).

**Additional Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `thinking.type` | string | "enabled" |
| `thinking.budget_tokens` | integer | Max thinking tokens |

**Additional Content Block:**

| Type | Fields | Description |
|------|--------|-------------|
| `thinking` | `thinking: string` | Model's reasoning |

#### 4.6.2 PDF Support

Process PDF documents as input.

**Document Source:**

```json
{
  "type": "document",
  "source": {
    "type": "base64",
    "media_type": "application/pdf",
    "data": "<base64-encoded-pdf>"
  }
}
```

#### 4.6.3 Prompt Caching

Cache portions of prompts for reduced latency and cost.

**Cache Control:**

| Field | Type | Description |
|-------|------|-------------|
| `cache_control.type` | string | "ephemeral" |

**Usage Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `cache_creation_input_tokens` | integer | Tokens written to cache |
| `cache_read_input_tokens` | integer | Tokens read from cache |

---

## 5. Interface Definitions

### 5.1 Rust Interfaces

#### 5.1.1 Client Interface

```rust
/// Main client for interacting with Anthropic's API.
#[async_trait]
pub trait AnthropicClient: Send + Sync {
    /// Access the messages service.
    fn messages(&self) -> &dyn MessagesService;

    /// Access the models service.
    fn models(&self) -> &dyn ModelsService;

    /// Access the message batches service.
    fn batches(&self) -> &dyn MessageBatchesService;

    /// Access the admin service (if authorized).
    fn admin(&self) -> Option<&dyn AdminService>;
}

/// Factory for creating Anthropic clients.
pub trait AnthropicClientFactory: Send + Sync {
    /// Create a new client with the given configuration.
    fn create(&self, config: AnthropicConfig) -> Result<Arc<dyn AnthropicClient>, AnthropicError>;
}
```

#### 5.1.2 Messages Service Interface

```rust
/// Service for message-based interactions with Claude.
#[async_trait]
pub trait MessagesService: Send + Sync {
    /// Create a message (non-streaming).
    async fn create(
        &self,
        request: CreateMessageRequest,
    ) -> Result<Message, AnthropicError>;

    /// Create a message with streaming response.
    async fn create_stream(
        &self,
        request: CreateMessageRequest,
    ) -> Result<MessageStream, AnthropicError>;

    /// Count tokens for a message request.
    async fn count_tokens(
        &self,
        request: CountTokensRequest,
    ) -> Result<TokenCount, AnthropicError>;
}
```

#### 5.1.3 Models Service Interface

```rust
/// Service for listing available models.
#[async_trait]
pub trait ModelsService: Send + Sync {
    /// List all available models.
    async fn list(
        &self,
        params: Option<ListModelsParams>,
    ) -> Result<ModelList, AnthropicError>;

    /// Get a specific model by ID.
    async fn get(
        &self,
        model_id: &str,
    ) -> Result<Model, AnthropicError>;
}
```

#### 5.1.4 Message Batches Service Interface

```rust
/// Service for batch message processing.
#[async_trait]
pub trait MessageBatchesService: Send + Sync {
    /// Create a new message batch.
    async fn create(
        &self,
        request: CreateBatchRequest,
    ) -> Result<MessageBatch, AnthropicError>;

    /// List all message batches.
    async fn list(
        &self,
        params: Option<ListBatchesParams>,
    ) -> Result<BatchList, AnthropicError>;

    /// Get a specific batch by ID.
    async fn get(
        &self,
        batch_id: &str,
    ) -> Result<MessageBatch, AnthropicError>;

    /// Get batch results (streaming JSONL).
    async fn get_results(
        &self,
        batch_id: &str,
    ) -> Result<BatchResultsStream, AnthropicError>;

    /// Cancel a batch.
    async fn cancel(
        &self,
        batch_id: &str,
    ) -> Result<MessageBatch, AnthropicError>;
}
```

#### 5.1.5 Admin Service Interface

```rust
/// Service for organization administration.
#[async_trait]
pub trait AdminService: Send + Sync {
    /// Organization management.
    fn organizations(&self) -> &dyn OrganizationsService;

    /// Workspace management.
    fn workspaces(&self) -> &dyn WorkspacesService;

    /// API key management.
    fn api_keys(&self) -> &dyn ApiKeysService;

    /// Invite management.
    fn invites(&self) -> &dyn InvitesService;
}

#[async_trait]
pub trait OrganizationsService: Send + Sync {
    async fn get(&self, org_id: &str) -> Result<Organization, AnthropicError>;
    async fn list_members(&self, org_id: &str, params: Option<ListParams>)
        -> Result<MemberList, AnthropicError>;
    async fn add_member(&self, org_id: &str, request: AddMemberRequest)
        -> Result<Member, AnthropicError>;
    async fn update_member(&self, org_id: &str, user_id: &str, request: UpdateMemberRequest)
        -> Result<Member, AnthropicError>;
    async fn remove_member(&self, org_id: &str, user_id: &str)
        -> Result<(), AnthropicError>;
}

#[async_trait]
pub trait WorkspacesService: Send + Sync {
    async fn list(&self, org_id: &str, params: Option<ListParams>)
        -> Result<WorkspaceList, AnthropicError>;
    async fn create(&self, org_id: &str, request: CreateWorkspaceRequest)
        -> Result<Workspace, AnthropicError>;
    async fn get(&self, workspace_id: &str) -> Result<Workspace, AnthropicError>;
    async fn update(&self, workspace_id: &str, request: UpdateWorkspaceRequest)
        -> Result<Workspace, AnthropicError>;
    async fn archive(&self, workspace_id: &str) -> Result<Workspace, AnthropicError>;
}

#[async_trait]
pub trait ApiKeysService: Send + Sync {
    async fn list(&self, org_id: &str, params: Option<ListParams>)
        -> Result<ApiKeyList, AnthropicError>;
    async fn get(&self, key_id: &str) -> Result<ApiKeyInfo, AnthropicError>;
    async fn update(&self, key_id: &str, request: UpdateApiKeyRequest)
        -> Result<ApiKeyInfo, AnthropicError>;
}

#[async_trait]
pub trait InvitesService: Send + Sync {
    async fn list(&self, org_id: &str, params: Option<ListParams>)
        -> Result<InviteList, AnthropicError>;
    async fn create(&self, org_id: &str, request: CreateInviteRequest)
        -> Result<Invite, AnthropicError>;
    async fn get(&self, invite_id: &str) -> Result<Invite, AnthropicError>;
    async fn delete(&self, invite_id: &str) -> Result<(), AnthropicError>;
}
```

#### 5.1.6 Transport Interface

```rust
/// HTTP transport abstraction for testability.
#[async_trait]
pub trait HttpTransport: Send + Sync {
    /// Send an HTTP request and receive a response.
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError>;

    /// Send a streaming request and receive an SSE stream.
    async fn send_streaming(
        &self,
        request: HttpRequest,
    ) -> Result<SseStream, TransportError>;
}

/// HTTP request representation.
pub struct HttpRequest {
    pub method: HttpMethod,
    pub url: Url,
    pub headers: HeaderMap,
    pub body: Option<Bytes>,
    pub timeout: Option<Duration>,
}

/// HTTP response representation.
pub struct HttpResponse {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub body: Bytes,
}
```

#### 5.1.7 Configuration Types

```rust
/// Configuration for the Anthropic client.
#[derive(Clone)]
pub struct AnthropicConfig {
    /// API key (required).
    pub api_key: SecretString,

    /// Base URL for the API.
    pub base_url: Url,

    /// API version header value.
    pub api_version: String,

    /// Default timeout for requests.
    pub timeout: Duration,

    /// Maximum retries for transient failures.
    pub max_retries: u32,

    /// Retry configuration.
    pub retry_config: RetryConfig,

    /// Circuit breaker configuration.
    pub circuit_breaker_config: CircuitBreakerConfig,

    /// Rate limit configuration.
    pub rate_limit_config: Option<RateLimitConfig>,

    /// Beta features to enable.
    pub beta_features: Vec<BetaFeature>,
}

impl Default for AnthropicConfig {
    fn default() -> Self {
        Self {
            api_key: SecretString::new("".to_string()),
            base_url: Url::parse("https://api.anthropic.com").unwrap(),
            api_version: "2023-06-01".to_string(),
            timeout: Duration::from_secs(600), // 10 minutes for long responses
            max_retries: 3,
            retry_config: RetryConfig::default(),
            circuit_breaker_config: CircuitBreakerConfig::default(),
            rate_limit_config: None,
            beta_features: Vec::new(),
        }
    }
}

/// Beta features that can be enabled.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum BetaFeature {
    /// Extended thinking (claude-sonnet-4-20250514)
    ExtendedThinking,
    /// PDF document support
    PdfSupport,
    /// Prompt caching
    PromptCaching,
    /// Token counting
    TokenCounting,
    /// Message batches
    MessageBatches,
    /// Computer use
    ComputerUse,
    /// Custom beta feature string
    Custom(String),
}
```

### 5.2 TypeScript Interfaces

#### 5.2.1 Client Interface

```typescript
/**
 * Main client for interacting with Anthropic's API.
 */
interface AnthropicClient {
  /** Access the messages service. */
  readonly messages: MessagesService;

  /** Access the models service. */
  readonly models: ModelsService;

  /** Access the message batches service. */
  readonly batches: MessageBatchesService;

  /** Access the admin service (if authorized). */
  readonly admin?: AdminService;
}

/**
 * Factory for creating Anthropic clients.
 */
interface AnthropicClientFactory {
  create(config: AnthropicConfig): AnthropicClient;
}
```

#### 5.2.2 Messages Service Interface

```typescript
/**
 * Service for message-based interactions with Claude.
 */
interface MessagesService {
  /**
   * Create a message (non-streaming).
   */
  create(request: CreateMessageRequest): Promise<Message>;

  /**
   * Create a message with streaming response.
   */
  createStream(request: CreateMessageRequest): AsyncIterable<MessageStreamEvent>;

  /**
   * Count tokens for a message request.
   */
  countTokens(request: CountTokensRequest): Promise<TokenCount>;
}
```

#### 5.2.3 Request/Response Types

```typescript
/**
 * Request to create a message.
 */
interface CreateMessageRequest {
  /** Model identifier. */
  model: string;

  /** Maximum tokens to generate. */
  max_tokens: number;

  /** Conversation messages. */
  messages: MessageParam[];

  /** System prompt(s). */
  system?: string | SystemBlock[];

  /** Request metadata. */
  metadata?: MessageMetadata;

  /** Custom stop sequences. */
  stop_sequences?: string[];

  /** Enable streaming. */
  stream?: boolean;

  /** Sampling temperature (0-1). */
  temperature?: number;

  /** Nucleus sampling. */
  top_p?: number;

  /** Top-k sampling. */
  top_k?: number;

  /** Tool definitions. */
  tools?: Tool[];

  /** Tool selection control. */
  tool_choice?: ToolChoice;

  /** Extended thinking configuration (beta). */
  thinking?: ThinkingConfig;
}

/**
 * Message parameter for requests.
 */
type MessageParam = {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
};

/**
 * Content block types.
 */
type ContentBlock =
  | TextBlock
  | ImageBlock
  | DocumentBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock;

interface TextBlock {
  type: 'text';
  text: string;
  cache_control?: CacheControl;
}

interface ImageBlock {
  type: 'image';
  source: ImageSource;
  cache_control?: CacheControl;
}

interface DocumentBlock {
  type: 'document';
  source: DocumentSource;
  cache_control?: CacheControl;
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

/**
 * Message response.
 */
interface Message {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ContentBlock[];
  model: string;
  stop_reason: StopReason | null;
  stop_sequence: string | null;
  usage: Usage;
}

type StopReason = 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';

interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}
```

#### 5.2.4 Streaming Types

```typescript
/**
 * Server-sent event types for streaming.
 */
type MessageStreamEvent =
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent
  | PingEvent
  | ErrorEvent;

interface MessageStartEvent {
  type: 'message_start';
  message: Message;
}

interface ContentBlockStartEvent {
  type: 'content_block_start';
  index: number;
  content_block: ContentBlock;
}

interface ContentBlockDeltaEvent {
  type: 'content_block_delta';
  index: number;
  delta: ContentDelta;
}

type ContentDelta =
  | { type: 'text_delta'; text: string }
  | { type: 'input_json_delta'; partial_json: string }
  | { type: 'thinking_delta'; thinking: string };

interface ContentBlockStopEvent {
  type: 'content_block_stop';
  index: number;
}

interface MessageDeltaEvent {
  type: 'message_delta';
  delta: {
    stop_reason: StopReason | null;
    stop_sequence: string | null;
  };
  usage: { output_tokens: number };
}

interface MessageStopEvent {
  type: 'message_stop';
}

interface PingEvent {
  type: 'ping';
}

interface ErrorEvent {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}
```

#### 5.2.5 Configuration Types

```typescript
/**
 * Configuration for the Anthropic client.
 */
interface AnthropicConfig {
  /** API key (required). */
  apiKey: string;

  /** Base URL for the API. */
  baseUrl?: string;

  /** API version header value. */
  apiVersion?: string;

  /** Default timeout in milliseconds. */
  timeout?: number;

  /** Maximum retries for transient failures. */
  maxRetries?: number;

  /** Retry configuration. */
  retryConfig?: RetryConfig;

  /** Circuit breaker configuration. */
  circuitBreakerConfig?: CircuitBreakerConfig;

  /** Rate limit configuration. */
  rateLimitConfig?: RateLimitConfig;

  /** Beta features to enable. */
  betaFeatures?: BetaFeature[];
}

type BetaFeature =
  | 'extended-thinking'
  | 'pdf-support'
  | 'prompt-caching'
  | 'token-counting'
  | 'message-batches'
  | 'computer-use'
  | string;
```

---

## 6. Error Taxonomy

### 6.1 Error Hierarchy

```
AnthropicError
├── ConfigurationError
│   ├── MissingApiKey
│   ├── InvalidBaseUrl
│   └── InvalidConfiguration
│
├── AuthenticationError
│   ├── InvalidApiKey
│   ├── ExpiredApiKey
│   └── InsufficientPermissions
│
├── RequestError
│   ├── ValidationError
│   ├── InvalidModel
│   ├── InvalidParameter
│   └── PayloadTooLarge
│
├── RateLimitError
│   ├── TooManyRequests
│   ├── TokenLimitExceeded
│   └── ConcurrentRequestLimit
│
├── NetworkError
│   ├── ConnectionFailed
│   ├── Timeout
│   ├── DnsResolutionFailed
│   └── TlsError
│
├── ServerError
│   ├── InternalError
│   ├── Overloaded
│   └── ServiceUnavailable
│
├── ResponseError
│   ├── DeserializationError
│   ├── UnexpectedFormat
│   ├── StreamInterrupted
│   └── MalformedSse
│
├── ContentError
│   ├── ContentFiltered
│   ├── UnsupportedContent
│   └── ContentTooLarge
│
└── ResourceError
    ├── BatchNotFound
    ├── ModelNotFound
    └── OrganizationNotFound
```

### 6.2 Error Type Definitions (Rust)

```rust
/// Top-level error type for the Anthropic integration.
#[derive(Debug, thiserror::Error)]
pub enum AnthropicError {
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    #[error("Authentication error: {0}")]
    Authentication(#[from] AuthenticationError),

    #[error("Request error: {0}")]
    Request(#[from] RequestError),

    #[error("Rate limit error: {0}")]
    RateLimit(#[from] RateLimitError),

    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    #[error("Server error: {0}")]
    Server(#[from] ServerError),

    #[error("Response error: {0}")]
    Response(#[from] ResponseError),

    #[error("Content error: {0}")]
    Content(#[from] ContentError),

    #[error("Resource error: {0}")]
    Resource(#[from] ResourceError),
}

impl AnthropicError {
    /// Returns true if the error is retryable.
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            AnthropicError::RateLimit(_)
                | AnthropicError::Network(NetworkError::Timeout { .. })
                | AnthropicError::Network(NetworkError::ConnectionFailed { .. })
                | AnthropicError::Server(ServerError::Overloaded { .. })
                | AnthropicError::Server(ServerError::ServiceUnavailable { .. })
        )
    }

    /// Returns the retry delay hint if available.
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            AnthropicError::RateLimit(e) => e.retry_after,
            AnthropicError::Server(ServerError::Overloaded { retry_after, .. }) => *retry_after,
            _ => None,
        }
    }

    /// Returns the HTTP status code if applicable.
    pub fn status_code(&self) -> Option<StatusCode> {
        match self {
            AnthropicError::Authentication(_) => Some(StatusCode::UNAUTHORIZED),
            AnthropicError::Request(RequestError::ValidationError { .. }) => {
                Some(StatusCode::BAD_REQUEST)
            }
            AnthropicError::RateLimit(_) => Some(StatusCode::TOO_MANY_REQUESTS),
            AnthropicError::Server(ServerError::InternalError { .. }) => {
                Some(StatusCode::INTERNAL_SERVER_ERROR)
            }
            AnthropicError::Server(ServerError::Overloaded { .. }) => {
                Some(StatusCode::SERVICE_UNAVAILABLE)
            }
            _ => None,
        }
    }
}
```

### 6.3 Error Mapping from HTTP

| HTTP Status | Error Type | Retryable |
|-------------|------------|-----------|
| 400 | `RequestError::ValidationError` | No |
| 401 | `AuthenticationError::InvalidApiKey` | No |
| 403 | `AuthenticationError::InsufficientPermissions` | No |
| 404 | `ResourceError::*` | No |
| 413 | `RequestError::PayloadTooLarge` | No |
| 429 | `RateLimitError::TooManyRequests` | Yes |
| 500 | `ServerError::InternalError` | Yes (limited) |
| 503 | `ServerError::ServiceUnavailable` | Yes |
| 529 | `ServerError::Overloaded` | Yes |

---

## 7. Resilience Hooks

### 7.1 Retry Integration

The module integrates with `integrations-retry` for automatic retry of transient failures.

```rust
/// Retry configuration for Anthropic requests.
pub struct AnthropicRetryConfig {
    /// Base configuration from primitives.
    pub base: RetryConfig,

    /// Override retry behavior per error type.
    pub error_overrides: HashMap<ErrorCategory, RetryBehavior>,
}

/// How to handle retries for a specific error category.
pub enum RetryBehavior {
    /// Use default retry logic.
    Default,
    /// Never retry this error.
    NoRetry,
    /// Retry with specific configuration.
    Custom(RetryConfig),
}
```

**Default Retry Behavior:**

| Error Type | Retry | Max Attempts | Base Delay |
|------------|-------|--------------|------------|
| `RateLimitError` | Yes | 5 | Use `retry_after` or 60s |
| `NetworkError::Timeout` | Yes | 3 | 1s |
| `NetworkError::Connection` | Yes | 3 | 1s |
| `ServerError::Overloaded` | Yes | 3 | Use `retry_after` or 30s |
| `ServerError::5xx` | Yes | 2 | 5s |
| All others | No | - | - |

### 7.2 Circuit Breaker Integration

The module integrates with `integrations-circuit-breaker` to prevent cascading failures.

```rust
/// Circuit breaker configuration for Anthropic.
pub struct AnthropicCircuitBreakerConfig {
    /// Base configuration from primitives.
    pub base: CircuitBreakerConfig,

    /// Failure threshold before opening.
    pub failure_threshold: u32,

    /// Success threshold to close.
    pub success_threshold: u32,

    /// Time before attempting half-open.
    pub reset_timeout: Duration,
}

impl Default for AnthropicCircuitBreakerConfig {
    fn default() -> Self {
        Self {
            base: CircuitBreakerConfig::default(),
            failure_threshold: 5,
            success_threshold: 3,
            reset_timeout: Duration::from_secs(30),
        }
    }
}
```

**State Transitions:**

```
CLOSED --[failures >= threshold]--> OPEN
OPEN --[reset_timeout elapsed]--> HALF_OPEN
HALF_OPEN --[success >= threshold]--> CLOSED
HALF_OPEN --[any failure]--> OPEN
```

### 7.3 Rate Limit Integration

The module integrates with `integrations-rate-limit` for client-side rate limiting.

```rust
/// Rate limit configuration for Anthropic.
pub struct AnthropicRateLimitConfig {
    /// Requests per minute limit.
    pub requests_per_minute: Option<u32>,

    /// Tokens per minute limit.
    pub tokens_per_minute: Option<u32>,

    /// Concurrent request limit.
    pub max_concurrent_requests: Option<u32>,
}
```

**Rate Limit Handling:**

1. **Client-side limiting**: Pre-emptively limit requests based on configuration
2. **Server response**: Parse `retry-after` header from 429 responses
3. **Adaptive throttling**: Reduce rate when approaching limits

---

## 8. Security Requirements

### 8.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| API keys never logged | Use `SecretString`, redact in Debug |
| API keys not in stack traces | Zero on drop, no Display impl |
| API keys encrypted at rest | Delegate to config primitive |
| API keys in memory protected | `secrecy` crate with `Zeroize` |

### 8.2 Transport Security

| Requirement | Implementation |
|-------------|----------------|
| TLS 1.2+ only | Configure in HTTP client |
| Certificate validation | Enable by default |
| No insecure fallback | Fail on TLS errors |

### 8.3 Input Validation

| Requirement | Implementation |
|-------------|----------------|
| Validate all user input | Before sending to API |
| Sanitize for logging | Truncate, redact PII |
| Prevent injection | Type-safe builders |

### 8.4 Output Handling

| Requirement | Implementation |
|-------------|----------------|
| Response validation | Type-checked deserialization |
| Content filtering | Preserve API filtering |
| Error message safety | No credential exposure |

---

## 9. Observability Requirements

### 9.1 Tracing

Every API call must create a trace span with:

| Attribute | Type | Description |
|-----------|------|-------------|
| `anthropic.service` | string | Service name (e.g., "messages") |
| `anthropic.operation` | string | Operation name (e.g., "create") |
| `anthropic.model` | string | Model identifier |
| `anthropic.request_id` | string | Anthropic request ID |
| `anthropic.input_tokens` | integer | Input token count |
| `anthropic.output_tokens` | integer | Output token count |
| `anthropic.stop_reason` | string | Why generation stopped |
| `anthropic.stream` | boolean | Streaming enabled |
| `error.type` | string | Error category (if failed) |
| `error.message` | string | Error message (if failed) |

### 9.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `anthropic_requests_total` | Counter | `service`, `operation`, `model`, `status` |
| `anthropic_request_duration_seconds` | Histogram | `service`, `operation`, `model` |
| `anthropic_tokens_total` | Counter | `model`, `direction` (input/output) |
| `anthropic_streaming_chunks_total` | Counter | `model` |
| `anthropic_errors_total` | Counter | `service`, `error_type` |
| `anthropic_rate_limit_hits_total` | Counter | `type` |
| `anthropic_circuit_breaker_state` | Gauge | `state` (closed/open/half_open) |
| `anthropic_cache_hits_total` | Counter | `type` (creation/read) |

### 9.3 Logging

| Level | When |
|-------|------|
| `ERROR` | Non-retryable failures, configuration errors |
| `WARN` | Retryable failures, rate limits, circuit breaker trips |
| `INFO` | Request completion, batch status changes |
| `DEBUG` | Request/response details (sanitized) |
| `TRACE` | SSE events, internal state transitions |

**Log Fields:**

| Field | Description |
|-------|-------------|
| `request_id` | Anthropic request ID |
| `model` | Model identifier |
| `operation` | API operation |
| `duration_ms` | Request duration |
| `tokens.input` | Input tokens |
| `tokens.output` | Output tokens |
| `error.type` | Error category |
| `error.code` | Error code |
| `retry.attempt` | Current retry attempt |

---

## 10. Performance Requirements

### 10.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| Request serialization | < 1ms | < 5ms |
| Response deserialization | < 5ms | < 20ms |
| SSE chunk parsing | < 0.1ms | < 1ms |
| Token counting | < 100ms | < 500ms |

### 10.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Concurrent requests | 100+ (configurable) |
| Streaming throughput | Line-rate with API |
| Batch submission | 10,000 requests/batch |

### 10.3 Resource Limits

| Resource | Limit |
|----------|-------|
| Memory per request | < 1MB typical |
| Memory per stream | < 100KB + content |
| Connection pool size | Configurable (default: 20) |
| Request body size | Match API limits |

---

## 11. Future-Proofing

### 11.1 Extensibility Points

| Extension Point | Mechanism |
|-----------------|-----------|
| New API endpoints | Add new service trait + implementation |
| New content types | Extend `ContentBlock` enum |
| New beta features | Add to `BetaFeature` enum |
| Custom transport | Implement `HttpTransport` trait |
| Custom retry logic | Implement retry hooks |

### 11.2 Version Compatibility

| Aspect | Strategy |
|--------|----------|
| API version header | Configurable, default to latest stable |
| Response fields | `#[serde(flatten)]` for unknown fields |
| Request fields | Builder pattern with optional fields |
| Breaking changes | Major version bump, migration guide |

### 11.3 Deprecation Policy

1. **Announce**: Minimum 1 minor version before removal
2. **Warn**: Log warning when deprecated feature used
3. **Document**: Migration path in release notes
4. **Remove**: Only in major version

---

## 12. Acceptance Criteria

### 12.1 Functional Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| FC-1 | Create message (sync) works | Integration test |
| FC-2 | Create message (stream) works | Integration test |
| FC-3 | All SSE event types parsed | Unit tests |
| FC-4 | Token counting returns count | Integration test |
| FC-5 | Model listing works | Integration test |
| FC-6 | Batch creation works | Integration test |
| FC-7 | Batch status polling works | Integration test |
| FC-8 | All error types mapped correctly | Unit tests |
| FC-9 | Tool use/result cycle works | Integration test |
| FC-10 | Extended thinking works (beta) | Integration test |
| FC-11 | PDF support works (beta) | Integration test |
| FC-12 | Prompt caching works (beta) | Integration test |
| FC-13 | Admin API works (when authorized) | Integration test |

### 12.2 Non-Functional Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| NFC-1 | No panics in production paths | Fuzzing, review |
| NFC-2 | Memory bounded during streaming | Profiling |
| NFC-3 | Credentials never logged | Audit, tests |
| NFC-4 | TLS 1.2+ enforced | Configuration |
| NFC-5 | Retry respects backoff | Mock tests |
| NFC-6 | Circuit breaker trips correctly | State tests |
| NFC-7 | Rate limiting works | Timing tests |
| NFC-8 | All requests traced | Integration tests |
| NFC-9 | Metrics emitted correctly | Integration tests |
| NFC-10 | Test coverage > 80% | Coverage report |

### 12.3 Documentation Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| DC-1 | All public APIs documented | Doc coverage |
| DC-2 | Examples for common operations | Doc review |
| DC-3 | Error handling documented | Doc review |
| DC-4 | Configuration options documented | Doc review |
| DC-5 | Migration guides for breaking changes | Release notes |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial specification |

---

**End of Specification Phase**

*The next phase (Pseudocode) will provide detailed algorithmic descriptions for implementing each component.*
