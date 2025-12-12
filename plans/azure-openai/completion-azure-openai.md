# SPARC Phase 5: Completion — Azure OpenAI Integration

**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/azure/openai`

*Implementation roadmap, file structure, and final deliverables*

---

## 1. Implementation File Structure

### 1.1 Rust Implementation

```
integrations/
└── azure/
    └── openai/
        └── rust/
            ├── Cargo.toml
            ├── README.md
            ├── src/
            │   ├── lib.rs                      # Public API exports
            │   ├── client.rs                   # AzureOpenAIClient implementation
            │   ├── config.rs                   # AzureOpenAIConfig and builders
            │   │
            │   ├── deployment/
            │   │   ├── mod.rs
            │   │   ├── registry.rs             # DeploymentRegistry
            │   │   ├── types.rs                # AzureDeployment, AzureRegion
            │   │   └── resolution.rs           # Model hint resolution
            │   │
            │   ├── services/
            │   │   ├── mod.rs
            │   │   ├── chat/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # ChatService implementation
            │   │   │   ├── request.rs          # ChatRequest types
            │   │   │   ├── response.rs         # ChatResponse types
            │   │   │   └── stream.rs           # ChatStream implementation
            │   │   ├── embedding/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # EmbeddingService implementation
            │   │   │   ├── request.rs          # EmbeddingRequest types
            │   │   │   └── response.rs         # EmbeddingResponse types
            │   │   ├── image/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # ImageService implementation
            │   │   │   ├── request.rs          # ImageRequest types
            │   │   │   └── response.rs         # ImageResponse types
            │   │   └── audio/
            │   │       ├── mod.rs
            │   │       ├── service.rs          # AudioService implementation
            │   │       ├── transcription.rs    # Transcription types
            │   │       └── translation.rs      # Translation types
            │   │
            │   ├── auth/
            │   │   ├── mod.rs
            │   │   ├── provider.rs             # AzureCredentialProvider trait
            │   │   ├── api_key.rs              # ApiKeyCredentialProvider
            │   │   ├── azure_ad.rs             # AzureAdTokenProvider
            │   │   ├── managed_identity.rs     # ManagedIdentityCredentialProvider
            │   │   └── secret.rs               # SecretString wrapper
            │   │
            │   ├── infra/
            │   │   ├── mod.rs
            │   │   ├── url_builder.rs          # Azure URL construction
            │   │   ├── sse_parser.rs           # SSE stream parsing
            │   │   └── api_version.rs          # ApiVersion enum and parsing
            │   │
            │   ├── content_filter/
            │   │   ├── mod.rs
            │   │   ├── types.rs                # ContentFilterResult types
            │   │   ├── extraction.rs           # Extract filter results
            │   │   └── handler.rs              # Filter violation handling
            │   │
            │   ├── adapter/
            │   │   ├── mod.rs
            │   │   ├── model_adapter.rs        # Platform ModelAdapter impl
            │   │   ├── request_convert.rs      # Unified → Azure conversion
            │   │   └── response_convert.rs     # Azure → Unified conversion
            │   │
            │   ├── ruvvector/
            │   │   ├── mod.rs
            │   │   ├── service.rs              # RuvVectorService
            │   │   ├── embeddings.rs           # Embedding storage
            │   │   ├── search.rs               # Similarity search
            │   │   └── migrations.rs           # Database migrations
            │   │
            │   ├── types/
            │   │   ├── mod.rs
            │   │   ├── message.rs              # ChatMessage, Role types
            │   │   ├── usage.rs                # TokenUsage types
            │   │   ├── tool.rs                 # Tool, ToolCall types
            │   │   ├── model_family.rs         # ModelFamily enum
            │   │   └── capability.rs           # ModelCapability enum
            │   │
            │   ├── error.rs                    # AzureOpenAIError types
            │   └── validation.rs               # Input validation functions
            │
            └── tests/
                ├── unit/
                │   ├── deployment/
                │   │   ├── registry_test.rs
                │   │   └── resolution_test.rs
                │   ├── services/
                │   │   ├── chat_test.rs
                │   │   ├── embedding_test.rs
                │   │   └── stream_test.rs
                │   ├── auth/
                │   │   ├── api_key_test.rs
                │   │   ├── azure_ad_test.rs
                │   │   └── managed_identity_test.rs
                │   ├── infra/
                │   │   ├── url_builder_test.rs
                │   │   ├── sse_parser_test.rs
                │   │   └── api_version_test.rs
                │   ├── content_filter/
                │   │   └── extraction_test.rs
                │   └── error_test.rs
                │
                ├── integration/
                │   ├── common/
                │   │   └── mod.rs              # Test utilities, mock server
                │   ├── chat_integration_test.rs
                │   ├── embedding_integration_test.rs
                │   ├── streaming_integration_test.rs
                │   ├── auth_integration_test.rs
                │   └── ruvvector_integration_test.rs
                │
                ├── contract/
                │   ├── mod.rs                  # Contract test setup
                │   ├── chat_contract_test.rs
                │   ├── embedding_contract_test.rs
                │   └── error_contract_test.rs
                │
                ├── fixtures/
                │   ├── requests/
                │   │   ├── chat_simple.json
                │   │   ├── chat_with_tools.json
                │   │   ├── chat_with_vision.json
                │   │   ├── embedding_single.json
                │   │   └── embedding_batch.json
                │   ├── responses/
                │   │   ├── chat_success.json
                │   │   ├── chat_with_filter.json
                │   │   ├── chat_tool_call.json
                │   │   ├── embedding_success.json
                │   │   └── errors/
                │   │       ├── content_filter.json
                │   │       ├── rate_limited.json
                │   │       ├── deployment_not_found.json
                │   │       ├── auth_failed.json
                │   │       └── context_length.json
                │   └── streaming/
                │       ├── chat_stream_simple.txt
                │       ├── chat_stream_tool_call.txt
                │       ├── chat_stream_filtered.txt
                │       └── chat_stream_with_usage.txt
                │
                └── mocks/
                    ├── mod.rs
                    ├── transport.rs            # MockHttpTransport
                    ├── credentials.rs          # MockCredentialProvider
                    └── responses.rs            # Canned Azure responses
```

### 1.2 TypeScript Implementation

```
integrations/
└── azure/
    └── openai/
        └── typescript/
            ├── package.json
            ├── tsconfig.json
            ├── tsconfig.build.json
            ├── README.md
            ├── src/
            │   ├── index.ts                    # Public API exports
            │   ├── client.ts                   # AzureOpenAIClient implementation
            │   ├── config.ts                   # AzureOpenAIConfig types
            │   │
            │   ├── deployment/
            │   │   ├── index.ts
            │   │   ├── registry.ts             # DeploymentRegistry
            │   │   ├── types.ts                # AzureDeployment types
            │   │   └── resolution.ts           # Model hint resolution
            │   │
            │   ├── services/
            │   │   ├── index.ts
            │   │   ├── chat/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts          # ChatService
            │   │   │   ├── request.ts          # Request types
            │   │   │   ├── response.ts         # Response types
            │   │   │   └── stream.ts           # ChatStream (AsyncIterable)
            │   │   ├── embedding/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts          # EmbeddingService
            │   │   │   ├── request.ts          # Request types
            │   │   │   └── response.ts         # Response types
            │   │   ├── image/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts          # ImageService
            │   │   │   └── types.ts            # Request/Response types
            │   │   └── audio/
            │   │       ├── index.ts
            │   │       ├── service.ts          # AudioService
            │   │       └── types.ts            # Request/Response types
            │   │
            │   ├── auth/
            │   │   ├── index.ts
            │   │   ├── provider.ts             # AzureCredentialProvider interface
            │   │   ├── api-key.ts              # ApiKeyCredentialProvider
            │   │   ├── azure-ad.ts             # AzureAdTokenProvider
            │   │   └── managed-identity.ts     # ManagedIdentityCredentialProvider
            │   │
            │   ├── infra/
            │   │   ├── index.ts
            │   │   ├── url-builder.ts          # Azure URL construction
            │   │   ├── sse-parser.ts           # SSE stream parsing
            │   │   └── api-version.ts          # ApiVersion enum
            │   │
            │   ├── content-filter/
            │   │   ├── index.ts
            │   │   ├── types.ts                # ContentFilterResult types
            │   │   └── handler.ts              # Filter handling
            │   │
            │   ├── adapter/
            │   │   ├── index.ts
            │   │   ├── model-adapter.ts        # ModelAdapter implementation
            │   │   └── converters.ts           # Request/Response conversion
            │   │
            │   ├── ruvvector/
            │   │   ├── index.ts
            │   │   ├── service.ts              # RuvVectorService
            │   │   └── embeddings.ts           # Embedding storage
            │   │
            │   ├── types/
            │   │   ├── index.ts
            │   │   ├── message.ts              # ChatMessage types
            │   │   ├── usage.ts                # TokenUsage types
            │   │   ├── tool.ts                 # Tool types
            │   │   └── enums.ts                # ModelFamily, Capability enums
            │   │
            │   ├── error.ts                    # AzureOpenAIError class
            │   └── validation.ts               # Input validation
            │
            └── tests/
                ├── unit/
                │   ├── deployment/
                │   │   ├── registry.test.ts
                │   │   └── resolution.test.ts
                │   ├── services/
                │   │   ├── chat.test.ts
                │   │   ├── embedding.test.ts
                │   │   └── stream.test.ts
                │   ├── auth/
                │   │   ├── api-key.test.ts
                │   │   └── azure-ad.test.ts
                │   ├── infra/
                │   │   ├── url-builder.test.ts
                │   │   └── sse-parser.test.ts
                │   └── error.test.ts
                │
                ├── integration/
                │   ├── setup.ts                # Test setup
                │   ├── chat.integration.test.ts
                │   ├── embedding.integration.test.ts
                │   └── streaming.integration.test.ts
                │
                └── fixtures/
                    ├── requests/
                    ├── responses/
                    └── streaming/
```

---

## 2. Implementation Sequence

### 2.1 Phase 1: Foundation (Week 1)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 1: FOUNDATION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Priority: P0 - Must complete before any other work                         │
│                                                                              │
│  1.1 Project Setup                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ Create Rust crate structure (Cargo.toml, lib.rs)                  │    │
│  │ □ Create TypeScript package structure (package.json, tsconfig)      │    │
│  │ □ Configure linting (clippy, eslint)                                │    │
│  │ □ Configure formatting (rustfmt, prettier)                          │    │
│  │ □ Set up CI pipeline                                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  1.2 Core Types                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ AzureDeployment struct                                            │    │
│  │ □ AzureRegion enum                                                  │    │
│  │ □ ApiVersion enum                                                   │    │
│  │ □ ModelFamily enum                                                  │    │
│  │ □ ModelCapability enum                                              │    │
│  │ □ AzureOpenAIError enum                                             │    │
│  │ □ SecretString wrapper                                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  1.3 Configuration                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ AzureOpenAIConfig struct                                          │    │
│  │ □ Config validation functions                                       │    │
│  │ □ Environment loading (from_env)                                    │    │
│  │ □ Config builder pattern                                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  1.4 Deployment Registry                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ DeploymentRegistry struct                                         │    │
│  │ □ register() function                                               │    │
│  │ □ resolve() function (exact match)                                  │    │
│  │ □ resolve_by_model() function (hint resolution)                     │    │
│  │ □ list() and list_by_capability() functions                         │    │
│  │ □ Unit tests for all resolution scenarios                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Deliverables:                                                              │
│  - Compilable crate with core types                                        │
│  - 100% test coverage on DeploymentRegistry                                │
│  - CI pipeline passing                                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Phase 2: Authentication (Week 1-2)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 2: AUTHENTICATION                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Priority: P0 - Required for all API calls                                  │
│                                                                              │
│  2.1 Credential Provider Trait                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ Define AzureCredentialProvider trait                              │    │
│  │ □ get_auth_header() async method                                    │    │
│  │ □ refresh() async method                                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  2.2 API Key Provider                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ ApiKeyCredentialProvider implementation                           │    │
│  │ □ from_env() constructor                                            │    │
│  │ □ Unit tests                                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  2.3 Azure AD Token Provider                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ AzureAdTokenProvider implementation                               │    │
│  │ □ Token caching with expiry tracking                                │    │
│  │ □ Concurrent refresh protection (Mutex)                             │    │
│  │ □ acquire_token() for client_credentials flow                       │    │
│  │ □ from_env() constructor                                            │    │
│  │ □ Unit tests with mocked HTTP                                       │    │
│  │ □ Integration test with real Azure AD (optional)                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  2.4 Managed Identity Provider                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ ManagedIdentityCredentialProvider implementation                  │    │
│  │ □ IMDS endpoint communication                                       │    │
│  │ □ User-assigned identity support (client_id param)                  │    │
│  │ □ Timeout handling for non-Azure environments                       │    │
│  │ □ Unit tests with mocked IMDS                                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Deliverables:                                                              │
│  - All three credential providers working                                   │
│  - Token refresh tested under concurrent load                              │
│  - 95%+ test coverage on auth module                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Phase 3: Infrastructure (Week 2)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 3: INFRASTRUCTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Priority: P0 - Required for API communication                              │
│                                                                              │
│  3.1 URL Builder                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ UrlBuilder struct                                                 │    │
│  │ □ operation() method                                                │    │
│  │ □ api_version() method                                              │    │
│  │ □ query() method for additional params                              │    │
│  │ □ build() method                                                    │    │
│  │ □ Convenience functions (build_chat_url, build_embedding_url, etc.) │    │
│  │ □ 100% test coverage                                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  3.2 SSE Parser                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ SseParser struct                                                  │    │
│  │ □ Buffer management for partial events                              │    │
│  │ □ try_parse_event() function                                        │    │
│  │ □ Stream implementation                                             │    │
│  │ □ [DONE] sentinel handling                                          │    │
│  │ □ Unit tests with edge cases (partial events, multi-line)           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  3.3 Error Mapping                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ parse_error_response() function                                   │    │
│  │ □ HTTP status code mapping                                          │    │
│  │ □ Azure error code extraction                                       │    │
│  │ □ Retry-After header parsing                                        │    │
│  │ □ Content filter error extraction                                   │    │
│  │ □ Unit tests for all error scenarios                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  3.4 Validation                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ validate_deployment_id()                                          │    │
│  │ □ validate_resource_name()                                          │    │
│  │ □ validate_api_version()                                            │    │
│  │ □ validate_chat_request()                                           │    │
│  │ □ validate_embedding_request()                                      │    │
│  │ □ Unit tests for all validation rules                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Deliverables:                                                              │
│  - URL construction working for all operations                             │
│  - SSE parser handling all edge cases                                      │
│  - Error mapping complete for all Azure error codes                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Phase 4: Chat Service (Week 2-3)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 4: CHAT SERVICE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Priority: P0 - Core functionality                                          │
│                                                                              │
│  4.1 Request/Response Types                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ ChatRequest struct                                                │    │
│  │ □ ChatResponse struct                                               │    │
│  │ □ ChatMessage struct                                                │    │
│  │ □ ChatChoice struct                                                 │    │
│  │ □ TokenUsage struct                                                 │    │
│  │ □ Tool and ToolCall types                                           │    │
│  │ □ Serde serialization/deserialization                               │    │
│  │ □ Unit tests for JSON round-trip                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  4.2 Chat Service Implementation                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ ChatServiceImpl struct                                            │    │
│  │ □ complete() method                                                 │    │
│  │ □ Integration with resilience (retry, circuit breaker)              │    │
│  │ □ Observability (tracing spans, metrics)                            │    │
│  │ □ Content filter result extraction                                  │    │
│  │ □ Unit tests with mocked HTTP                                       │    │
│  │ □ Integration tests with WireMock                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  4.3 Streaming Implementation                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ stream() method                                                   │    │
│  │ □ ChatStream struct (implements Stream)                             │    │
│  │ □ ChatChunk struct                                                  │    │
│  │ □ Usage accumulation on final chunk                                 │    │
│  │ □ Content filter handling in stream                                 │    │
│  │ □ Idle timeout handling                                             │    │
│  │ □ Unit tests with fixture streams                                   │    │
│  │ □ Integration tests with streaming mock                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  4.4 Function Calling / Tools                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ Tool definition types                                             │    │
│  │ □ ToolChoice enum (auto, none, required, specific)                  │    │
│  │ □ ToolCall parsing from response                                    │    │
│  │ □ Tool result message construction                                  │    │
│  │ □ Unit tests for tool calling scenarios                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Deliverables:                                                              │
│  - Chat completions working (sync and streaming)                           │
│  - Function calling / tools working                                        │
│  - Content filter results captured                                         │
│  - Integration tests passing                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.5 Phase 5: Embedding Service (Week 3)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PHASE 5: EMBEDDING SERVICE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Priority: P0 - Core functionality                                          │
│                                                                              │
│  5.1 Request/Response Types                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ EmbeddingRequest struct                                           │    │
│  │ □ EmbeddingInput enum (Single, Multiple)                            │    │
│  │ □ EmbeddingResponse struct                                          │    │
│  │ □ EmbeddingData struct                                              │    │
│  │ □ EmbeddingUsage struct                                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  5.2 Embedding Service Implementation                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ EmbeddingServiceImpl struct                                       │    │
│  │ □ create() method (single input)                                    │    │
│  │ □ create_batch() method (multiple inputs)                           │    │
│  │ □ Dimensions parameter support                                      │    │
│  │ □ Encoding format support (float, base64)                           │    │
│  │ □ Unit tests                                                        │    │
│  │ □ Integration tests                                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Deliverables:                                                              │
│  - Embedding generation working                                            │
│  - Batch embeddings optimized                                              │
│  - Integration tests passing                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.6 Phase 6: Client Assembly (Week 3)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PHASE 6: CLIENT ASSEMBLY                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Priority: P0 - User-facing API                                             │
│                                                                              │
│  6.1 Client Implementation                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ AzureOpenAIClientImpl struct                                      │    │
│  │ □ Builder pattern (AzureOpenAIClientBuilder)                        │    │
│  │ □ Lazy service initialization (OnceCell)                            │    │
│  │ □ chat() accessor                                                   │    │
│  │ □ embeddings() accessor                                             │    │
│  │ □ images() accessor (P2)                                            │    │
│  │ □ audio() accessor (P2)                                             │    │
│  │ □ deployments() accessor                                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  6.2 Factory Functions                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ create_azure_openai_client(config)                                │    │
│  │ □ create_azure_openai_client_from_env()                             │    │
│  │ □ Error handling for missing config                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  6.3 Public API Exports                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ lib.rs exports                                                    │    │
│  │ □ Prelude module (common imports)                                   │    │
│  │ □ Feature flags (ruvvector, etc.)                                   │    │
│  │ □ Documentation (rustdoc / typedoc)                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Deliverables:                                                              │
│  - Complete client API                                                      │
│  - Builder pattern working                                                  │
│  - Documentation generated                                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.7 Phase 7: Platform Adapter (Week 4)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PHASE 7: PLATFORM ADAPTER                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Priority: P1 - Integration with orchestration                              │
│                                                                              │
│  7.1 Model Adapter Implementation                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ AzureOpenAIAdapter struct                                         │    │
│  │ □ ModelAdapter trait implementation                                 │    │
│  │ □ provider_id() method                                              │    │
│  │ □ supported_capabilities() method                                   │    │
│  │ □ invoke() method                                                   │    │
│  │ □ invoke_stream() method                                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  7.2 Request/Response Conversion                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ convert_to_azure_chat_request()                                   │    │
│  │ □ convert_to_azure_embedding_request()                              │    │
│  │ □ convert_to_unified_response()                                     │    │
│  │ □ convert_to_unified_embedding_response()                           │    │
│  │ □ convert_chunk_to_unified()                                        │    │
│  │ □ Provider-specific metadata handling                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Deliverables:                                                              │
│  - Platform adapter working                                                 │
│  - All conversion functions tested                                         │
│  - Integration with shared/orchestration                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.8 Phase 8: RuvVector Integration (Week 4)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PHASE 8: RUVVECTOR INTEGRATION                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Priority: P1 - Vector storage integration                                  │
│                                                                              │
│  8.1 Embedding Storage                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ AzureOpenAIEmbeddingStorage struct                                │    │
│  │ □ EmbeddingStorage trait implementation                             │    │
│  │ □ store_embedding() method                                          │    │
│  │ □ store_embeddings_batch() method                                   │    │
│  │ □ search_similar() method                                           │    │
│  │ □ delete_embedding() method                                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  8.2 Database Schema                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ Migrations for embeddings table                                   │    │
│  │ □ pgvector extension setup                                          │    │
│  │ □ Index creation for similarity search                              │    │
│  │ □ Metadata JSONB column                                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Deliverables:                                                              │
│  - RuvVector integration working                                           │
│  - Similarity search optimized                                             │
│  - Integration tests with PostgreSQL                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.9 Phase 9: Additional Services (Week 5 - P2)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PHASE 9: ADDITIONAL SERVICES (P2)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Priority: P2 - Extended functionality                                      │
│                                                                              │
│  9.1 Image Service (DALL-E)                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ ImageRequest/ImageResponse types                                  │    │
│  │ □ ImageServiceImpl                                                  │    │
│  │ □ generate() method                                                 │    │
│  │ □ Size and quality options                                          │    │
│  │ □ Unit and integration tests                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  9.2 Audio Service (Whisper)                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ TranscriptionRequest/Response types                               │    │
│  │ □ TranslationRequest/Response types                                 │    │
│  │ □ AudioServiceImpl                                                  │    │
│  │ □ transcribe() method                                               │    │
│  │ □ translate() method                                                │    │
│  │ □ Multipart form handling                                           │    │
│  │ □ Unit and integration tests                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Deliverables:                                                              │
│  - Image generation working (if deployment available)                      │
│  - Audio transcription working (if deployment available)                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Test Implementation Plan

### 3.1 Unit Test Matrix

| Component | Test File | Coverage Target | Priority |
|-----------|-----------|-----------------|----------|
| DeploymentRegistry | `registry_test.rs` | 100% | P0 |
| Model Resolution | `resolution_test.rs` | 100% | P0 |
| UrlBuilder | `url_builder_test.rs` | 100% | P0 |
| ApiVersion | `api_version_test.rs` | 100% | P0 |
| SseParser | `sse_parser_test.rs` | 95% | P0 |
| ApiKeyProvider | `api_key_test.rs` | 100% | P0 |
| AzureAdProvider | `azure_ad_test.rs` | 95% | P0 |
| ManagedIdentity | `managed_identity_test.rs` | 90% | P1 |
| ChatService | `chat_test.rs` | 90% | P0 |
| ChatStream | `stream_test.rs` | 90% | P0 |
| EmbeddingService | `embedding_test.rs` | 90% | P0 |
| ContentFilter | `extraction_test.rs` | 95% | P0 |
| ErrorMapping | `error_test.rs` | 100% | P0 |
| Validation | `validation_test.rs` | 100% | P0 |
| ModelAdapter | `adapter_test.rs` | 90% | P1 |

### 3.2 Integration Test Scenarios

| Scenario | Test File | Mock Type | Priority |
|----------|-----------|-----------|----------|
| Chat completion success | `chat_integration_test.rs` | WireMock | P0 |
| Chat with tools | `chat_integration_test.rs` | WireMock | P0 |
| Chat streaming | `streaming_integration_test.rs` | WireMock | P0 |
| Stream interruption | `streaming_integration_test.rs` | WireMock | P1 |
| Rate limit handling | `chat_integration_test.rs` | WireMock | P0 |
| Content filter trigger | `chat_integration_test.rs` | WireMock | P1 |
| Auth token refresh | `auth_integration_test.rs` | WireMock | P0 |
| Embedding creation | `embedding_integration_test.rs` | WireMock | P0 |
| Batch embeddings | `embedding_integration_test.rs` | WireMock | P1 |
| Circuit breaker trip | `resilience_integration_test.rs` | WireMock | P1 |
| RuvVector storage | `ruvvector_integration_test.rs` | PostgreSQL | P1 |

### 3.3 Contract Tests

```rust
// Contract test example: Verify response parsing matches Azure format
#[test]
fn test_chat_response_contract() {
    // Load recorded Azure response
    let fixture = include_str!("../fixtures/responses/chat_success.json");

    // Parse with our types
    let response: ChatResponse = serde_json::from_str(fixture)
        .expect("Should parse Azure response format");

    // Verify key fields
    assert!(!response.id.is_empty());
    assert_eq!(response.object, "chat.completion");
    assert!(!response.choices.is_empty());
    assert!(response.usage.prompt_tokens > 0);
}

#[test]
fn test_content_filter_response_contract() {
    let fixture = include_str!("../fixtures/responses/chat_with_filter.json");

    let response: ChatResponse = serde_json::from_str(fixture)
        .expect("Should parse response with content filter");

    // Verify content filter fields
    assert!(response.prompt_filter_results.is_some());
    let filters = response.prompt_filter_results.unwrap();
    assert!(!filters.is_empty());
}
```

---

## 4. Documentation Deliverables

### 4.1 API Documentation

```
docs/
├── api/
│   ├── client.md               # AzureOpenAIClient API reference
│   ├── chat.md                 # ChatService API reference
│   ├── embeddings.md           # EmbeddingService API reference
│   ├── streaming.md            # Streaming API guide
│   ├── errors.md               # Error types and handling
│   └── types.md                # Common types reference
│
├── guides/
│   ├── quickstart.md           # Getting started guide
│   ├── authentication.md       # Auth methods guide
│   ├── deployments.md          # Deployment configuration guide
│   ├── streaming.md            # Streaming implementation guide
│   ├── content-filtering.md    # Content filter handling guide
│   └── ruvvector.md            # RuvVector integration guide
│
└── examples/
    ├── basic-chat.md           # Simple chat example
    ├── streaming-chat.md       # Streaming example
    ├── function-calling.md     # Tools/function calling example
    ├── embeddings.md           # Embedding generation example
    └── multi-deployment.md     # Multi-deployment setup example
```

### 4.2 README Structure

```markdown
# Azure OpenAI Integration

Thin adapter for Azure OpenAI Service integration.

## Features

- Chat completions (GPT-4, GPT-4o, GPT-3.5-Turbo)
- Streaming responses
- Function calling / Tools
- Embeddings
- Content filter handling
- Multiple authentication methods
- Multi-deployment support
- RuvVector integration

## Quick Start

### Installation

```toml
[dependencies]
integrations-azure-openai = "0.1"
```

### Basic Usage

```rust
use integrations_azure_openai::{
    create_azure_openai_client_from_env,
    ChatRequest, ChatMessage, Role,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = create_azure_openai_client_from_env()?;

    let response = client.chat().complete(ChatRequest {
        deployment_id: "gpt4-production".to_string(),
        messages: vec![
            ChatMessage {
                role: Role::User,
                content: Some("Hello!".to_string()),
                ..Default::default()
            }
        ],
        ..Default::default()
    }).await?;

    println!("{}", response.choices[0].message.content.as_ref().unwrap());
    Ok(())
}
```

## Configuration

### Environment Variables

```bash
# API Key authentication
AZURE_OPENAI_API_KEY=your-api-key

# Deployment configuration
AZURE_OPENAI_DEPLOYMENT_0_ID=gpt4-production
AZURE_OPENAI_DEPLOYMENT_0_RESOURCE=myorg-openai-eastus
AZURE_OPENAI_DEPLOYMENT_0_REGION=eastus
AZURE_OPENAI_DEPLOYMENT_0_API_VERSION=2024-06-01
AZURE_OPENAI_DEPLOYMENT_0_MODEL_FAMILY=gpt4

# Or use JSON config
AZURE_OPENAI_CONFIG_PATH=/etc/azure-openai/config.json
```

### Azure AD Authentication

```bash
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
```

## Documentation

- [API Reference](./docs/api/)
- [Guides](./docs/guides/)
- [Examples](./docs/examples/)

## License

LLMDevOps-PSACL-1.0
```

---

## 5. Acceptance Criteria

### 5.1 Functional Requirements

| Requirement | Acceptance Criteria | Test Type |
|-------------|---------------------|-----------|
| Chat completion | Returns valid response with choices and usage | Integration |
| Streaming | Emits chunks, handles [DONE], accumulates usage | Integration |
| Function calling | Parses tool_calls, handles tool responses | Unit + Integration |
| Embeddings | Returns vector of correct dimensions | Integration |
| API key auth | Successfully authenticates with api-key header | Integration |
| Azure AD auth | Acquires and refreshes tokens | Integration |
| Managed identity | Works in Azure environment | E2E (manual) |
| Deployment resolution | Resolves by ID and model hint | Unit |
| Content filtering | Extracts and reports filter results | Unit + Integration |
| Rate limit handling | Respects Retry-After, exponential backoff | Integration |
| Circuit breaker | Opens after failures, recovers after timeout | Integration |

### 5.2 Non-Functional Requirements

| Requirement | Target | Measurement |
|-------------|--------|-------------|
| Request latency overhead | < 10ms | Benchmark |
| Memory per request | < 1KB (excl. response) | Profiling |
| Connection reuse | > 90% | Metrics |
| Token cache hit rate | > 99% | Metrics |
| Test coverage (unit) | > 90% | Coverage report |
| Test coverage (critical) | 100% | Coverage report |
| Documentation coverage | 100% public API | Doc generation |

### 5.3 Quality Gates

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           QUALITY GATES                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Gate 1: Code Quality                                                       │
│  □ No clippy warnings (Rust)                                               │
│  □ No eslint errors (TypeScript)                                           │
│  □ All code formatted                                                       │
│  □ No unsafe code without justification                                     │
│                                                                              │
│  Gate 2: Test Quality                                                       │
│  □ All unit tests passing                                                   │
│  □ All integration tests passing                                            │
│  □ Coverage targets met                                                     │
│  □ No flaky tests                                                           │
│                                                                              │
│  Gate 3: Security                                                           │
│  □ No secrets in code                                                       │
│  □ Dependency audit clean                                                   │
│  □ SecretString used for credentials                                        │
│  □ No sensitive data in logs                                                │
│                                                                              │
│  Gate 4: Documentation                                                      │
│  □ All public APIs documented                                               │
│  □ README complete                                                          │
│  □ Examples working                                                         │
│  □ CHANGELOG updated                                                        │
│                                                                              │
│  Gate 5: Performance                                                        │
│  □ Benchmarks within targets                                                │
│  □ No memory leaks                                                          │
│  □ Streaming backpressure working                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Dependency Checklist

### 6.1 Shared Module Dependencies

| Module | Status | Integration Point |
|--------|--------|-------------------|
| `azure/credentials` | Required | Credential provider interface |
| `shared/resilience` | Required | RetryExecutor, CircuitBreaker |
| `shared/observability` | Required | Tracer, Metrics, Logger |
| `shared/database` | Optional | RuvVector (PostgreSQL + pgvector) |
| `shared/http` | Required | HttpTransport trait |

### 6.2 External Dependencies (Rust)

```toml
[dependencies]
# Async runtime
tokio = { version = "1.0", features = ["rt-multi-thread", "macros", "time", "sync"] }

# HTTP client
reqwest = { version = "0.12", features = ["json", "stream", "rustls-tls"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Async utilities
futures = "0.3"
async-trait = "0.1"

# Error handling
thiserror = "1.0"

# Observability
tracing = "0.1"

# Security
zeroize = { version = "1.0", features = ["derive"] }

# Concurrent data structures
dashmap = "5.0"
arc-swap = "1.0"

[dev-dependencies]
tokio-test = "0.4"
mockall = "0.12"
wiremock = "0.6"
```

### 6.3 External Dependencies (TypeScript)

```json
{
  "dependencies": {
    "@integrations/azure-credentials": "workspace:*",
    "@integrations/resilience": "workspace:*",
    "@integrations/observability": "workspace:*",
    "@integrations/database": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "msw": "^2.0.0"
  }
}
```

---

## 7. Release Checklist

### 7.1 Pre-Release

```
□ All quality gates passing
□ Version number updated
□ CHANGELOG updated
□ README finalized
□ API documentation generated
□ Examples tested
□ Breaking changes documented
□ Migration guide (if needed)
```

### 7.2 Release

```
□ Git tag created
□ Crate published (crates.io or internal registry)
□ NPM package published (npmjs.com or internal registry)
□ Release notes published
□ Documentation deployed
```

### 7.3 Post-Release

```
□ Smoke test in staging environment
□ Metrics dashboards configured
□ Alerts configured
□ Runbook updated
□ Team notified
```

---

## 8. SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | `specification-azure-openai.md` | ✅ Complete |
| 2. Architecture | `architecture-azure-openai.md` | ✅ Complete |
| 3. Pseudocode | `pseudocode-azure-openai.md` | ✅ Complete |
| 4. Refinement | `refinement-azure-openai.md` | ✅ Complete |
| 5. Completion | `completion-azure-openai.md` | ✅ Complete |

---

## 9. Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial completion document |

---

**End of SPARC Documentation**

*Ready for implementation.*
