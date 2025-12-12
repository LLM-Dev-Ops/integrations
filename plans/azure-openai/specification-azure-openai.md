# SPARC Phase 1: Specification — Azure OpenAI Integration

## 1. Overview

### 1.1 Purpose

This specification defines a **thin adapter layer** for Azure OpenAI Service integration within the LLM Dev Ops orchestration platform. The module enables access to OpenAI models (GPT-4, GPT-4o, GPT-3.5-Turbo, text-embedding-ada-002, DALL-E, Whisper) hosted on Microsoft Azure infrastructure, translating Azure-specific concerns into the platform's unified model interface.

### 1.2 Scope Boundaries

**In Scope:**
- Azure OpenAI REST API client implementation
- Deployment-based model routing (Azure uses deployments, not direct model IDs)
- Azure-specific authentication (API Key and Azure AD/Entra ID)
- Azure endpoint URL construction (`https://{resource-name}.openai.azure.com/`)
- API version management (e.g., `2024-02-01`, `2024-06-01`)
- Response normalization to platform-standard format
- Content filter result handling (Azure AI Content Safety integration)
- Token usage extraction and reporting

**Out of Scope:**
- Azure resource provisioning (resource groups, deployments, quotas)
- Azure subscription management
- Network infrastructure (VNets, Private Endpoints)
- Core orchestration logic (handled by `shared/orchestration`)
- Resilience patterns (handled by `shared/resilience`)
- Observability infrastructure (handled by `shared/observability`)
- Vector memory operations (handled by `shared/database` / RuvVector)
- Credential storage (handled by `azure/credentials`)

### 1.3 Design Philosophy

Following the **thin adapter pattern**, this module:
1. Translates Azure OpenAI API semantics to platform conventions
2. Delegates cross-cutting concerns to shared primitives
3. Contains zero infrastructure or provisioning logic
4. Maintains stateless request/response handling
5. Exposes deployment configuration without managing Azure resources

---

## 2. Azure OpenAI API Coverage

### 2.1 Supported Endpoints

| Endpoint Category | Azure API Path | Priority |
|-------------------|----------------|----------|
| Chat Completions | `/openai/deployments/{deployment-id}/chat/completions` | P0 |
| Completions (Legacy) | `/openai/deployments/{deployment-id}/completions` | P1 |
| Embeddings | `/openai/deployments/{deployment-id}/embeddings` | P0 |
| Image Generation | `/openai/deployments/{deployment-id}/images/generations` | P2 |
| Audio Transcription | `/openai/deployments/{deployment-id}/audio/transcriptions` | P2 |
| Audio Translation | `/openai/deployments/{deployment-id}/audio/translations` | P2 |

### 2.2 Azure-Specific URL Structure

```
https://{resource-name}.openai.azure.com/openai/deployments/{deployment-id}/{operation}?api-version={api-version}
```

**Components:**
- `resource-name`: Azure OpenAI resource name (user-defined during provisioning)
- `deployment-id`: Model deployment name (maps to underlying model)
- `operation`: API operation (chat/completions, embeddings, etc.)
- `api-version`: Required query parameter (e.g., `2024-06-01`)

### 2.3 Model-to-Deployment Mapping

Azure OpenAI requires deployment names rather than model identifiers. The adapter maintains a deployment registry:

```
DeploymentConfig {
    deployment_id: string        // Azure deployment name
    model_id: string             // Underlying model (gpt-4, gpt-4o, etc.)
    resource_name: string        // Azure resource name
    region: string               // Azure region (eastus, westeurope, etc.)
    api_version: string          // API version for this deployment
    capabilities: ModelCapabilities
}
```

---

## 3. Authentication Strategy

### 3.1 Supported Authentication Methods

| Method | Header/Mechanism | Use Case |
|--------|------------------|----------|
| API Key | `api-key: {key}` | Development, simple deployments |
| Azure AD (Entra ID) | `Authorization: Bearer {token}` | Enterprise, managed identity |

### 3.2 Authentication Flow

```
AzureOpenAIAuth:
    IF azure_ad_enabled:
        token = azure/credentials::acquire_token(
            scope="https://cognitiveservices.azure.com/.default"
        )
        RETURN ("Authorization", "Bearer " + token)
    ELSE:
        key = azure/credentials::get_api_key(resource_name)
        RETURN ("api-key", key)
```

### 3.3 Credential Delegation

All credential operations delegate to `azure/credentials`:
- `acquire_token()`: Azure AD token acquisition with refresh
- `get_api_key()`: Secure key retrieval from vault/config
- Token caching and refresh handled by credential provider

---

## 4. Interface Definitions

### 4.1 Core Types

```rust
/// Azure OpenAI deployment configuration
pub struct AzureDeployment {
    pub deployment_id: String,
    pub resource_name: String,
    pub region: AzureRegion,
    pub api_version: ApiVersion,
    pub model_family: ModelFamily,
}

/// Azure-specific regions
pub enum AzureRegion {
    EastUS,
    EastUS2,
    WestUS,
    WestUS2,
    WestEurope,
    NorthEurope,
    SoutheastAsia,
    AustraliaEast,
    JapanEast,
    // ... additional regions
    Custom(String),
}

/// Supported API versions
pub enum ApiVersion {
    V2024_02_01,
    V2024_06_01,
    V2024_08_01_Preview,
    Custom(String),
}

/// Model family classification
pub enum ModelFamily {
    GPT4,
    GPT4o,
    GPT35Turbo,
    Embedding,
    DALLE,
    Whisper,
}
```

### 4.2 Request/Response Types

```rust
/// Chat completion request (Azure format)
pub struct AzureChatRequest {
    pub messages: Vec<ChatMessage>,
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub max_tokens: Option<u32>,
    pub stop: Option<Vec<String>>,
    pub presence_penalty: Option<f32>,
    pub frequency_penalty: Option<f32>,
    pub stream: Option<bool>,
    pub user: Option<String>,
    // Azure-specific
    pub data_sources: Option<Vec<AzureDataSource>>,  // Azure OpenAI on Your Data
}

/// Chat completion response (Azure format)
pub struct AzureChatResponse {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<ChatChoice>,
    pub usage: TokenUsage,
    // Azure-specific
    pub prompt_filter_results: Option<Vec<ContentFilterResult>>,
    pub system_fingerprint: Option<String>,
}

/// Azure content filter result
pub struct ContentFilterResult {
    pub prompt_index: u32,
    pub content_filter_results: ContentFilterCategories,
}

pub struct ContentFilterCategories {
    pub hate: FilterSeverity,
    pub self_harm: FilterSeverity,
    pub sexual: FilterSeverity,
    pub violence: FilterSeverity,
}

pub struct FilterSeverity {
    pub filtered: bool,
    pub severity: String,  // safe, low, medium, high
}
```

### 4.3 Client Interface

```rust
#[async_trait]
pub trait AzureOpenAIClient: Send + Sync {
    /// Execute chat completion
    async fn chat_completion(
        &self,
        deployment: &AzureDeployment,
        request: AzureChatRequest,
    ) -> Result<AzureChatResponse, AzureOpenAIError>;

    /// Execute streaming chat completion
    async fn chat_completion_stream(
        &self,
        deployment: &AzureDeployment,
        request: AzureChatRequest,
    ) -> Result<impl Stream<Item = Result<ChatChunk, AzureOpenAIError>>, AzureOpenAIError>;

    /// Generate embeddings
    async fn create_embedding(
        &self,
        deployment: &AzureDeployment,
        input: EmbeddingInput,
    ) -> Result<EmbeddingResponse, AzureOpenAIError>;

    /// List available deployments (from configuration, not Azure API)
    fn list_deployments(&self) -> Vec<AzureDeployment>;

    /// Get deployment by ID
    fn get_deployment(&self, deployment_id: &str) -> Option<AzureDeployment>;
}
```

### 4.4 Adapter Interface (Platform Integration)

```rust
impl ModelAdapter for AzureOpenAIAdapter {
    /// Convert platform request to Azure format and execute
    async fn invoke(
        &self,
        request: UnifiedModelRequest,
    ) -> Result<UnifiedModelResponse, AdapterError> {
        let deployment = self.resolve_deployment(&request.model_hint)?;
        let azure_request = self.to_azure_request(request)?;
        let azure_response = self.client.chat_completion(&deployment, azure_request).await?;
        self.to_unified_response(azure_response)
    }

    fn provider_id(&self) -> &'static str {
        "azure-openai"
    }

    fn supported_capabilities(&self) -> Vec<ModelCapability> {
        vec![
            ModelCapability::ChatCompletion,
            ModelCapability::Streaming,
            ModelCapability::Embeddings,
            ModelCapability::FunctionCalling,
            ModelCapability::Vision,
        ]
    }
}
```

---

## 5. Error Taxonomy

### 5.1 Azure-Specific Error Categories

| Error Code | HTTP Status | Category | Retry Strategy |
|------------|-------------|----------|----------------|
| `content_filter` | 400 | Content Policy | No retry |
| `context_length_exceeded` | 400 | Validation | No retry |
| `invalid_api_key` | 401 | Authentication | Refresh & retry |
| `token_expired` | 401 | Authentication | Refresh & retry |
| `deployment_not_found` | 404 | Configuration | No retry |
| `rate_limit_exceeded` | 429 | Throttling | Exponential backoff |
| `quota_exceeded` | 429 | Quota | Circuit break |
| `server_error` | 500 | Transient | Retry with backoff |
| `service_unavailable` | 503 | Transient | Retry with backoff |

### 5.2 Error Type Definitions

```rust
#[derive(Debug, thiserror::Error)]
pub enum AzureOpenAIError {
    #[error("Content filtered: {category} - {severity}")]
    ContentFiltered {
        category: String,
        severity: String,
        prompt_index: u32,
    },

    #[error("Deployment not found: {deployment_id}")]
    DeploymentNotFound { deployment_id: String },

    #[error("Authentication failed: {message}")]
    AuthenticationError { message: String, retry_with_refresh: bool },

    #[error("Rate limited: retry after {retry_after_ms}ms")]
    RateLimited { retry_after_ms: u64 },

    #[error("Quota exceeded for deployment {deployment_id}")]
    QuotaExceeded { deployment_id: String },

    #[error("Context length exceeded: {tokens} tokens (max: {max_tokens})")]
    ContextLengthExceeded { tokens: u32, max_tokens: u32 },

    #[error("API version not supported: {version}")]
    UnsupportedApiVersion { version: String },

    #[error("Azure service error: {message}")]
    ServiceError { message: String, status_code: u16 },

    #[error("Network error: {0}")]
    NetworkError(#[from] reqwest::Error),
}
```

---

## 6. Dependency Policy

### 6.1 Required Shared Modules

| Module | Purpose | Integration Point |
|--------|---------|-------------------|
| `azure/credentials` | API key and Azure AD token management | Authentication header construction |
| `shared/resilience` | Retry, circuit breaker, timeout | HTTP client wrapper |
| `shared/observability` | Metrics, tracing, logging | Request/response instrumentation |
| `shared/database` | RuvVector state persistence | Deployment config caching |
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
- Import Azure SDK for resource management
- Contain Azure Resource Manager (ARM) operations
- Store credentials locally (delegate to `azure/credentials`)
- Implement retry logic (delegate to `shared/resilience`)
- Emit metrics directly (delegate to `shared/observability`)

---

## 7. Configuration Schema

### 7.1 Deployment Registry Configuration

```yaml
azure_openai:
  deployments:
    - deployment_id: "gpt-4-production"
      resource_name: "myorg-openai-eastus"
      region: "eastus"
      api_version: "2024-06-01"
      model_family: "gpt4"
      rate_limit_rpm: 10000

    - deployment_id: "gpt-4o-dev"
      resource_name: "myorg-openai-westeurope"
      region: "westeurope"
      api_version: "2024-06-01"
      model_family: "gpt4o"
      rate_limit_rpm: 5000

    - deployment_id: "embedding-ada"
      resource_name: "myorg-openai-eastus"
      region: "eastus"
      api_version: "2024-02-01"
      model_family: "embedding"

  defaults:
    api_version: "2024-06-01"
    timeout_ms: 60000
    auth_method: "api_key"  # or "azure_ad"
```

### 7.2 Environment Variables

```bash
# Per-resource API keys (if using API key auth)
AZURE_OPENAI_API_KEY_EASTUS=<key>
AZURE_OPENAI_API_KEY_WESTEUROPE=<key>

# Azure AD settings (if using Azure AD auth)
AZURE_TENANT_ID=<tenant-id>
AZURE_CLIENT_ID=<client-id>
AZURE_CLIENT_SECRET=<secret>  # or use managed identity

# Optional overrides
AZURE_OPENAI_DEFAULT_API_VERSION=2024-06-01
AZURE_OPENAI_REQUEST_TIMEOUT_MS=60000
```

---

## 8. Resilience Integration

### 8.1 Retry Policy Mapping

```rust
impl RetryClassifier for AzureOpenAIError {
    fn classify(&self) -> RetryDecision {
        match self {
            AzureOpenAIError::RateLimited { retry_after_ms } => {
                RetryDecision::RetryAfter(Duration::from_millis(*retry_after_ms))
            }
            AzureOpenAIError::ServiceError { status_code, .. } if *status_code >= 500 => {
                RetryDecision::RetryWithBackoff
            }
            AzureOpenAIError::AuthenticationError { retry_with_refresh: true, .. } => {
                RetryDecision::RefreshAndRetry
            }
            AzureOpenAIError::NetworkError(_) => RetryDecision::RetryWithBackoff,
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
    // Per-deployment circuit breakers
    scope: CircuitScope::PerDeployment,
}
```

---

## 9. Observability Hooks

### 9.1 Metrics Emitted

| Metric | Type | Labels |
|--------|------|--------|
| `azure_openai_request_duration_ms` | Histogram | deployment, operation, status |
| `azure_openai_tokens_used` | Counter | deployment, token_type (prompt/completion) |
| `azure_openai_requests_total` | Counter | deployment, operation, status |
| `azure_openai_content_filtered_total` | Counter | deployment, filter_category |
| `azure_openai_rate_limit_hits` | Counter | deployment |

### 9.2 Trace Spans

```rust
// Span hierarchy
azure_openai.request
├── azure_openai.auth           // Credential acquisition
├── azure_openai.http           // HTTP request execution
├── azure_openai.parse          // Response parsing
└── azure_openai.transform      // Response normalization
```

### 9.3 Structured Logging

```rust
tracing::info!(
    deployment_id = %deployment.deployment_id,
    resource_name = %deployment.resource_name,
    region = %deployment.region,
    api_version = %deployment.api_version,
    prompt_tokens = response.usage.prompt_tokens,
    completion_tokens = response.usage.completion_tokens,
    "Azure OpenAI request completed"
);
```

---

## 10. Content Filter Handling

### 10.1 Filter Categories

Azure OpenAI includes content filtering via Azure AI Content Safety:
- **Hate**: Content targeting identity groups
- **Self-harm**: Content related to self-harm
- **Sexual**: Sexually explicit content
- **Violence**: Violent content

### 10.2 Filter Response Processing

```rust
fn process_content_filter(
    &self,
    filter_results: &[ContentFilterResult],
) -> Result<(), AzureOpenAIError> {
    for result in filter_results {
        let categories = &result.content_filter_results;

        if categories.hate.filtered {
            return Err(AzureOpenAIError::ContentFiltered {
                category: "hate".to_string(),
                severity: categories.hate.severity.clone(),
                prompt_index: result.prompt_index,
            });
        }
        // Check other categories...
    }
    Ok(())
}
```

---

## 11. Testing Strategy

### 11.1 London-School TDD Approach

1. **Mock-first design**: Define interfaces before implementation
2. **Dependency injection**: All shared modules injected via traits
3. **Behavior verification**: Test interactions, not state

### 11.2 Test Categories

| Category | Scope | Mock Strategy |
|----------|-------|---------------|
| Unit | Individual functions | Mock HTTP client, credentials |
| Integration | Client + Auth | Mock Azure endpoint (WireMock) |
| Contract | API compatibility | Record/replay Azure responses |
| E2E | Full adapter flow | Optional live Azure calls |

### 11.3 Mock Fixtures Required

```rust
// Mock deployment registry
fn mock_deployments() -> Vec<AzureDeployment>;

// Mock Azure API responses
fn mock_chat_response() -> AzureChatResponse;
fn mock_rate_limit_response() -> HttpResponse;
fn mock_content_filter_response() -> AzureChatResponse;

// Mock credential provider
fn mock_credential_provider() -> impl AzureCredentialProvider;
```

---

## 12. Open Questions

### 12.1 Requiring Resolution Before Architecture

1. **Multi-region failover**: Should the adapter support automatic failover between Azure regions, or delegate to `shared/resilience`?

2. **Deployment discovery**: Should deployments be statically configured, or dynamically discovered via Azure Management API?

3. **Azure OpenAI on Your Data**: What level of support for custom data sources (Azure AI Search, Blob Storage)?

4. **Streaming backpressure**: How should the adapter handle slow consumers during SSE streaming?

### 12.2 Deferred to Implementation

1. Token counting implementation (tiktoken vs approximation)
2. Response caching strategy (if any)
3. Batch embedding optimization

---

## 13. Acceptance Criteria

### 13.1 Functional Requirements

- [ ] Chat completions work with GPT-4, GPT-4o, GPT-3.5-Turbo deployments
- [ ] Streaming chat completions emit chunks correctly
- [ ] Embeddings work with text-embedding-ada-002 deployments
- [ ] API key authentication succeeds
- [ ] Azure AD authentication succeeds with token refresh
- [ ] Content filter results are captured and reported
- [ ] Deployment routing resolves correctly from model hints

### 13.2 Non-Functional Requirements

- [ ] Request latency overhead < 10ms (excluding network)
- [ ] Memory allocation per request < 1KB (excluding response body)
- [ ] Zero panics in error paths
- [ ] All errors are typed and actionable
- [ ] Observability hooks fire for all operations

---

## 14. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | System Architect | Initial specification |
