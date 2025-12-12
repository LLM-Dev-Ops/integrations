# SPARC Phase 1: Specification — xAI Grok Integration

## 1. Overview

### 1.1 Purpose

This specification defines a **thin adapter layer** for xAI Grok API integration within the LLM Dev Ops orchestration platform. The module enables access to Grok model variants (Grok-4, Grok-3, Grok-3-Mini, Grok-2) via xAI's OpenAI-compatible REST API, translating platform conventions to xAI-specific semantics.

### 1.2 Scope Boundaries

**In Scope:**
- xAI Grok REST API client implementation
- Chat completions (streaming and non-streaming)
- Embeddings generation
- Image generation (Grok-2-Image)
- Model variant routing (Grok-4, Grok-3, Grok-3-Mini)
- Function calling / Tool use
- Live Search integration (agentic search)
- Response normalization to platform-standard format
- Token usage extraction and reporting

**Out of Scope:**
- xAI account management or billing
- Fine-tuning operations (deferred to future phase)
- X platform data access beyond Live Search API
- Core orchestration logic (handled by `shared/orchestration`)
- Resilience patterns (handled by `shared/resilience`)
- Observability infrastructure (handled by `shared/observability`)
- Vector memory operations (handled by `shared/database` / RuvVector)
- Credential storage (handled by `shared/credentials`)

### 1.3 Design Philosophy

Following the **thin adapter pattern**, this module:
1. Translates xAI Grok API semantics to platform conventions
2. Delegates cross-cutting concerns to shared primitives
3. Contains zero infrastructure or account management logic
4. Maintains stateless request/response handling
5. Exposes model capabilities without managing xAI resources

---

## 2. xAI Grok API Coverage

### 2.1 Supported Endpoints

| Endpoint Category | API Path | Priority |
|-------------------|----------|----------|
| Chat Completions | `/v1/chat/completions` | P0 |
| Embeddings | `/v1/embeddings` | P1 |
| Image Generation | `/v1/images/generations` | P2 |
| Models List | `/v1/models` | P1 |
| Live Search | `/v1/chat/completions` (with tools) | P2 |

### 2.2 Base URL

```
https://api.x.ai/v1
```

**SDK Compatibility:** The xAI API is fully compatible with OpenAI and Anthropic SDKs by changing the base URL.

### 2.3 Model Variants

| Model ID | Alias | Context Window | Capabilities | Priority |
|----------|-------|----------------|--------------|----------|
| `grok-4` | `grok-4-latest` | 256K tokens | Chat, reasoning, coding, vision | P0 |
| `grok-4.1` | - | 256K tokens | Enhanced reasoning, thinking mode | P0 |
| `grok-3-beta` | `grok-3` | 131K tokens | Chat, reasoning, math, coding | P0 |
| `grok-3-mini-beta` | `grok-3-mini` | 131K tokens | Fast inference, reasoning_content | P1 |
| `grok-2-image-1212` | `grok-2-image` | N/A | Text-to-image generation | P2 |
| `grok-vision-beta` | - | 128K tokens | Vision + chat | P1 |

### 2.4 Model Capabilities Matrix

| Capability | Grok-4 | Grok-3 | Grok-3-Mini | Grok-2-Image |
|------------|--------|--------|-------------|--------------|
| Chat Completion | ✅ | ✅ | ✅ | ❌ |
| Streaming | ✅ | ✅ | ✅ | ❌ |
| Function Calling | ✅ | ✅ | ✅ | ❌ |
| Vision | ✅ | ❌ | ❌ | ❌ |
| Reasoning Content | ❌ | ✅ | ✅ | ❌ |
| Image Generation | ❌ | ❌ | ❌ | ✅ |
| Live Search | ✅ | ✅ | ✅ | ❌ |

---

## 3. Authentication Strategy

### 3.1 Authentication Method

| Method | Header | Source |
|--------|--------|--------|
| API Key | `Authorization: Bearer {api_key}` | console.x.ai |

### 3.2 Authentication Flow

```
XaiGrokAuth:
    api_key = shared/credentials::get_api_key("xai")
    RETURN ("Authorization", "Bearer " + api_key)
```

### 3.3 Credential Delegation

All credential operations delegate to `shared/credentials`:
- `get_api_key("xai")`: Secure key retrieval from vault/config
- Key rotation handled by credential provider

---

## 4. Interface Definitions

### 4.1 Core Types

```rust
/// xAI Grok model identifiers
pub enum GrokModel {
    Grok4,
    Grok4_1,
    Grok3Beta,
    Grok3MiniBeta,
    Grok2Image,
    GrokVisionBeta,
    Custom(String),
}

impl GrokModel {
    pub fn model_id(&self) -> &str {
        match self {
            GrokModel::Grok4 => "grok-4",
            GrokModel::Grok4_1 => "grok-4.1",
            GrokModel::Grok3Beta => "grok-3-beta",
            GrokModel::Grok3MiniBeta => "grok-3-mini-beta",
            GrokModel::Grok2Image => "grok-2-image-1212",
            GrokModel::GrokVisionBeta => "grok-vision-beta",
            GrokModel::Custom(id) => id,
        }
    }

    pub fn context_window(&self) -> Option<u32> {
        match self {
            GrokModel::Grok4 | GrokModel::Grok4_1 => Some(256_000),
            GrokModel::Grok3Beta | GrokModel::Grok3MiniBeta => Some(131_000),
            GrokModel::GrokVisionBeta => Some(128_000),
            GrokModel::Grok2Image => None,
            GrokModel::Custom(_) => None,
        }
    }
}

/// Model capability flags
pub struct GrokCapabilities {
    pub chat: bool,
    pub streaming: bool,
    pub function_calling: bool,
    pub vision: bool,
    pub reasoning_content: bool,
    pub image_generation: bool,
    pub live_search: bool,
}
```

### 4.2 Request/Response Types

```rust
/// Chat completion request
pub struct GrokChatRequest {
    pub model: GrokModel,
    pub messages: Vec<ChatMessage>,
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub max_tokens: Option<u32>,
    pub stop: Option<Vec<String>>,
    pub stream: Option<bool>,
    pub frequency_penalty: Option<f32>,
    pub presence_penalty: Option<f32>,
    pub tools: Option<Vec<Tool>>,
    pub tool_choice: Option<ToolChoice>,
    pub response_format: Option<ResponseFormat>,
    pub seed: Option<i64>,
    pub user: Option<String>,
}

/// Chat completion response
pub struct GrokChatResponse {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<ChatChoice>,
    pub usage: TokenUsage,
    pub system_fingerprint: Option<String>,
}

/// Chat choice with optional reasoning content
pub struct ChatChoice {
    pub index: u32,
    pub message: ChatMessage,
    pub finish_reason: Option<String>,
    pub reasoning_content: Option<String>,  // Grok-3 specific
}

/// Token usage information
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    pub reasoning_tokens: Option<u32>,  // Grok-3 specific
}

/// Response format options
pub enum ResponseFormat {
    Text,
    Json,
    JsonSchema { schema: serde_json::Value },
}
```

### 4.3 Client Interface

```rust
#[async_trait]
pub trait GrokClient: Send + Sync {
    /// Execute chat completion
    async fn chat_completion(
        &self,
        request: GrokChatRequest,
    ) -> Result<GrokChatResponse, GrokError>;

    /// Execute streaming chat completion
    async fn chat_completion_stream(
        &self,
        request: GrokChatRequest,
    ) -> Result<impl Stream<Item = Result<ChatChunk, GrokError>>, GrokError>;

    /// Generate embeddings
    async fn create_embedding(
        &self,
        model: GrokModel,
        input: EmbeddingInput,
    ) -> Result<EmbeddingResponse, GrokError>;

    /// Generate image (Grok-2-Image)
    async fn generate_image(
        &self,
        request: ImageGenerationRequest,
    ) -> Result<ImageGenerationResponse, GrokError>;

    /// List available models
    async fn list_models(&self) -> Result<Vec<ModelInfo>, GrokError>;
}
```

### 4.4 Adapter Interface (Platform Integration)

```rust
impl ModelAdapter for GrokAdapter {
    async fn invoke(
        &self,
        request: UnifiedModelRequest,
    ) -> Result<UnifiedModelResponse, AdapterError> {
        let model = self.resolve_model(&request.model_hint)?;
        let grok_request = self.to_grok_request(request, model)?;
        let grok_response = self.client.chat_completion(grok_request).await?;
        self.to_unified_response(grok_response)
    }

    fn provider_id(&self) -> &'static str {
        "xai-grok"
    }

    fn supported_capabilities(&self) -> Vec<ModelCapability> {
        vec![
            ModelCapability::ChatCompletion,
            ModelCapability::Streaming,
            ModelCapability::FunctionCalling,
            ModelCapability::Vision,
            ModelCapability::ImageGeneration,
            ModelCapability::Embeddings,
        ]
    }
}
```

---

## 5. Error Taxonomy

### 5.1 Error Categories

| HTTP Status | Error Code | Category | Retry Strategy |
|-------------|------------|----------|----------------|
| 400 | `invalid_request` | Validation | No retry |
| 401 | `authentication_error` | Authentication | Refresh & retry |
| 403 | `permission_denied` | Authorization | No retry |
| 404 | `model_not_found` | Configuration | No retry |
| 429 | `rate_limit_exceeded` | Throttling | Exponential backoff |
| 498 | `capacity_exceeded` | Capacity | Retry later |
| 500 | `internal_error` | Transient | Retry with backoff |
| 502 | `bad_gateway` | Transient | Retry with backoff |
| 503 | `service_unavailable` | Transient | Retry with backoff |

### 5.2 Error Type Definitions

```rust
#[derive(Debug, thiserror::Error)]
pub enum GrokError {
    #[error("Invalid request: {message}")]
    InvalidRequest { message: String },

    #[error("Authentication failed: {message}")]
    AuthenticationError { message: String },

    #[error("Permission denied: {message}")]
    PermissionDenied { message: String },

    #[error("Model not found: {model_id}")]
    ModelNotFound { model_id: String },

    #[error("Rate limited: retry after {retry_after_ms}ms")]
    RateLimited { retry_after_ms: u64 },

    #[error("Capacity exceeded: {message}")]
    CapacityExceeded { message: String },

    #[error("Context length exceeded: {tokens} tokens (max: {max_tokens})")]
    ContextLengthExceeded { tokens: u32, max_tokens: u32 },

    #[error("Service error: {message}")]
    ServiceError { message: String, status_code: u16 },

    #[error("Network error: {0}")]
    NetworkError(#[from] reqwest::Error),

    #[error("Stream error: {message}")]
    StreamError { message: String },
}
```

---

## 6. Dependency Policy

### 6.1 Required Shared Modules

| Module | Purpose | Integration Point |
|--------|---------|-------------------|
| `shared/credentials` | API key management | Authentication header |
| `shared/resilience` | Retry, circuit breaker, timeout | HTTP client wrapper |
| `shared/observability` | Metrics, tracing, logging | Request/response instrumentation |
| `shared/database` | RuvVector state persistence | Embedding storage |
| `shared/orchestration` | Multi-model routing | Adapter registration |

### 6.2 External Dependencies

```toml
[dependencies]
reqwest = { version = "0.12", features = ["json", "stream"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"
async-trait = "0.1"
futures = "0.3"
tracing = "0.1"
```

### 6.3 Dependency Boundaries

**This module MUST NOT:**
- Import xAI SDK directly (use REST API)
- Store credentials locally (delegate to `shared/credentials`)
- Implement retry logic (delegate to `shared/resilience`)
- Emit metrics directly (delegate to `shared/observability`)
- Manage X platform authentication

---

## 7. Configuration Schema

### 7.1 Client Configuration

```yaml
xai_grok:
  base_url: "https://api.x.ai/v1"  # Default
  default_model: "grok-3-beta"
  timeout_ms: 120000

  models:
    - id: "grok-4"
      alias: "grok4"
      capabilities: [chat, streaming, function_calling, vision, live_search]

    - id: "grok-3-beta"
      alias: "grok3"
      capabilities: [chat, streaming, function_calling, reasoning_content]

    - id: "grok-3-mini-beta"
      alias: "grok3-mini"
      capabilities: [chat, streaming, function_calling, reasoning_content]

  live_search:
    enabled: false
    cost_per_1000_sources: 25.00  # USD
```

### 7.2 Environment Variables

```bash
# Required
XAI_API_KEY=<api-key>

# Optional overrides
XAI_BASE_URL=https://api.x.ai/v1
XAI_DEFAULT_MODEL=grok-3-beta
XAI_REQUEST_TIMEOUT_MS=120000
XAI_LIVE_SEARCH_ENABLED=false
```

---

## 8. Resilience Integration

### 8.1 Retry Policy Mapping

```rust
impl RetryClassifier for GrokError {
    fn classify(&self) -> RetryDecision {
        match self {
            GrokError::RateLimited { retry_after_ms } => {
                RetryDecision::RetryAfter(Duration::from_millis(*retry_after_ms))
            }
            GrokError::CapacityExceeded { .. } => {
                RetryDecision::RetryAfter(Duration::from_secs(60))
            }
            GrokError::ServiceError { status_code, .. } if *status_code >= 500 => {
                RetryDecision::RetryWithBackoff
            }
            GrokError::NetworkError(_) => RetryDecision::RetryWithBackoff,
            _ => RetryDecision::DoNotRetry,
        }
    }
}
```

### 8.2 Circuit Breaker Configuration

```rust
CircuitBreakerConfig {
    failure_threshold: 5,
    success_threshold: 3,
    timeout: Duration::from_secs(30),
    scope: CircuitScope::PerModel,
}
```

---

## 9. Observability Hooks

### 9.1 Metrics Emitted

| Metric | Type | Labels |
|--------|------|--------|
| `xai_grok_request_duration_ms` | Histogram | model, operation, status |
| `xai_grok_tokens_used` | Counter | model, token_type |
| `xai_grok_requests_total` | Counter | model, operation, status |
| `xai_grok_rate_limit_hits` | Counter | model |
| `xai_grok_reasoning_tokens` | Counter | model |

### 9.2 Trace Spans

```
xai_grok.request
├── xai_grok.auth
├── xai_grok.http
├── xai_grok.parse
└── xai_grok.transform
```

### 9.3 Structured Logging

```rust
tracing::info!(
    model = %request.model.model_id(),
    prompt_tokens = response.usage.prompt_tokens,
    completion_tokens = response.usage.completion_tokens,
    reasoning_tokens = ?response.usage.reasoning_tokens,
    finish_reason = ?response.choices[0].finish_reason,
    "xAI Grok request completed"
);
```

---

## 10. Pricing Reference

### 10.1 Token Pricing (as of 2025)

| Model | Input (per 1M) | Output (per 1M) |
|-------|----------------|-----------------|
| Grok-4 | $3.00 | $15.00 |
| Grok-3 | $2.00 | $10.00 |
| Grok-3-Mini | $0.30 | $0.50 |

### 10.2 Additional Costs

| Feature | Cost |
|---------|------|
| Live Search | $25 per 1,000 sources retrieved |
| Image Generation | Per-image pricing |

---

## 11. Testing Strategy

### 11.1 Test Categories

| Category | Scope | Mock Strategy |
|----------|-------|---------------|
| Unit | Individual functions | Mock HTTP client |
| Integration | Client + HTTP | Mock xAI endpoint (WireMock) |
| Contract | API compatibility | Record/replay xAI responses |
| E2E | Full adapter flow | Optional live xAI calls |

### 11.2 Mock Fixtures Required

```rust
fn mock_grok4_response() -> GrokChatResponse;
fn mock_grok3_response_with_reasoning() -> GrokChatResponse;
fn mock_rate_limit_response() -> HttpResponse;
fn mock_streaming_chunks() -> Vec<ChatChunk>;
fn mock_image_generation_response() -> ImageGenerationResponse;
```

---

## 12. Open Questions

### 12.1 Requiring Resolution Before Architecture

1. **Live Search Integration Depth**: Should Live Search be a first-class feature or optional add-on given the $25/1000 sources cost?

2. **Reasoning Content Handling**: How should `reasoning_content` from Grok-3 models be exposed in the unified response format?

3. **Vision Input Format**: What image formats and sizes does Grok-4 vision support, and how should they be validated?

4. **Streaming Backpressure**: Should streaming use the same backpressure strategy as Azure OpenAI (bounded channel)?

### 12.2 Deferred to Implementation

1. Fine-tuning API integration (when available)
2. Batch API support
3. Response caching strategy

---

## 13. Acceptance Criteria

### 13.1 Functional Requirements

- [ ] Chat completions work with Grok-4, Grok-3, Grok-3-Mini
- [ ] Streaming chat completions emit chunks correctly
- [ ] Function calling / tools work correctly
- [ ] Reasoning content captured for Grok-3 models
- [ ] Image generation works with Grok-2-Image
- [ ] API key authentication succeeds
- [ ] Model routing resolves correctly from hints

### 13.2 Non-Functional Requirements

- [ ] Request latency overhead < 10ms (excluding network)
- [ ] Memory allocation per request < 1KB (excluding response)
- [ ] Zero panics in error paths
- [ ] All errors are typed and actionable
- [ ] Observability hooks fire for all operations

---

## 14. References

- [xAI API Documentation](https://docs.x.ai/docs/overview)
- [xAI Models and Pricing](https://docs.x.ai/docs/models)
- [xAI API Overview](https://x.ai/api)
- [Grok 4.1 Announcement](https://x.ai/news/grok-4-1)

---

## 15. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | System Architect | Initial specification |
