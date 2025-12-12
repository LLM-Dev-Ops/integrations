# SPARC Phase 5: Completion — xAI Grok Integration

**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/xai/grok`

*Implementation roadmap, file structure, and final deliverables*

---

## 1. Implementation File Structure

### 1.1 Rust Implementation

```
integrations/
└── xai/
    └── grok/
        └── rust/
            ├── Cargo.toml
            ├── README.md
            ├── src/
            │   ├── lib.rs                      # Public API exports
            │   ├── client.rs                   # GrokClient implementation
            │   ├── config.rs                   # GrokConfig and builders
            │   │
            │   ├── models/
            │   │   ├── mod.rs
            │   │   ├── registry.rs             # ModelRegistry
            │   │   ├── types.rs                # GrokModel enum
            │   │   └── capabilities.rs         # GrokCapabilities struct
            │   │
            │   ├── services/
            │   │   ├── mod.rs
            │   │   ├── chat/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # ChatService implementation
            │   │   │   ├── request.rs          # GrokChatRequest types
            │   │   │   ├── response.rs         # GrokChatResponse types
            │   │   │   └── stream.rs           # ChatStream implementation
            │   │   ├── embedding/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # EmbeddingService implementation
            │   │   │   ├── request.rs          # EmbeddingRequest types
            │   │   │   └── response.rs         # EmbeddingResponse types
            │   │   └── image/
            │   │       ├── mod.rs
            │   │       ├── service.rs          # ImageService implementation
            │   │       ├── request.rs          # ImageGenerationRequest
            │   │       └── response.rs         # ImageGenerationResponse
            │   │
            │   ├── reasoning/
            │   │   ├── mod.rs
            │   │   ├── extractor.rs            # ReasoningExtractor
            │   │   ├── types.rs                # ReasoningContent types
            │   │   └── accumulator.rs          # StreamAccumulator for reasoning
            │   │
            │   ├── live_search/
            │   │   ├── mod.rs
            │   │   ├── tool.rs                 # Live Search tool definition
            │   │   ├── handler.rs              # LiveSearchHandler
            │   │   └── cost.rs                 # Cost tracking
            │   │
            │   ├── auth/
            │   │   ├── mod.rs
            │   │   ├── provider.rs             # CredentialProvider trait
            │   │   ├── api_key.rs              # ApiKeyCredentialProvider
            │   │   └── secret.rs               # SecretString wrapper
            │   │
            │   ├── infra/
            │   │   ├── mod.rs
            │   │   ├── request_builder.rs      # HTTP request construction
            │   │   ├── response_parser.rs      # Response parsing
            │   │   └── sse_parser.rs           # SSE stream parsing
            │   │
            │   ├── adapter/
            │   │   ├── mod.rs
            │   │   ├── model_adapter.rs        # Platform ModelAdapter impl
            │   │   ├── request_convert.rs      # Unified → Grok conversion
            │   │   └── response_convert.rs     # Grok → Unified conversion
            │   │
            │   ├── ruvvector/
            │   │   ├── mod.rs
            │   │   ├── service.rs              # GrokEmbeddingStorage
            │   │   ├── embeddings.rs           # Embedding storage
            │   │   └── search.rs               # Similarity search
            │   │
            │   ├── types/
            │   │   ├── mod.rs
            │   │   ├── message.rs              # ChatMessage, Role types
            │   │   ├── usage.rs                # TokenUsage types
            │   │   ├── tool.rs                 # Tool, ToolCall types
            │   │   └── multimodal.rs           # Vision content types
            │   │
            │   ├── error.rs                    # GrokError types
            │   └── validation.rs               # Input validation functions
            │
            └── tests/
                ├── unit/
                │   ├── models/
                │   │   ├── registry_test.rs
                │   │   └── capabilities_test.rs
                │   ├── services/
                │   │   ├── chat_test.rs
                │   │   ├── embedding_test.rs
                │   │   ├── image_test.rs
                │   │   └── stream_test.rs
                │   ├── reasoning/
                │   │   ├── extractor_test.rs
                │   │   └── accumulator_test.rs
                │   ├── live_search/
                │   │   ├── tool_test.rs
                │   │   └── cost_test.rs
                │   ├── auth/
                │   │   └── api_key_test.rs
                │   ├── infra/
                │   │   ├── request_builder_test.rs
                │   │   ├── response_parser_test.rs
                │   │   └── sse_parser_test.rs
                │   └── error_test.rs
                │
                ├── integration/
                │   ├── common/
                │   │   └── mod.rs              # Test utilities, mock server
                │   ├── chat_integration_test.rs
                │   ├── chat_reasoning_test.rs  # Grok-3 reasoning tests
                │   ├── embedding_integration_test.rs
                │   ├── streaming_integration_test.rs
                │   ├── vision_integration_test.rs
                │   ├── live_search_integration_test.rs
                │   └── ruvvector_integration_test.rs
                │
                ├── contract/
                │   ├── mod.rs                  # Contract test setup
                │   ├── chat_contract_test.rs
                │   ├── reasoning_contract_test.rs
                │   ├── embedding_contract_test.rs
                │   └── error_contract_test.rs
                │
                ├── fixtures/
                │   ├── requests/
                │   │   ├── chat_simple.json
                │   │   ├── chat_with_tools.json
                │   │   ├── chat_with_vision.json
                │   │   ├── chat_grok3_reasoning.json
                │   │   ├── embedding_single.json
                │   │   ├── embedding_batch.json
                │   │   └── image_generation.json
                │   ├── responses/
                │   │   ├── chat_success.json
                │   │   ├── chat_grok3_with_reasoning.json
                │   │   ├── chat_tool_call.json
                │   │   ├── chat_live_search.json
                │   │   ├── embedding_success.json
                │   │   ├── image_success.json
                │   │   └── errors/
                │   │       ├── rate_limited.json
                │   │       ├── model_not_found.json
                │   │       ├── auth_failed.json
                │   │       ├── context_length.json
                │   │       └── capacity_exceeded.json
                │   └── streaming/
                │       ├── chat_stream_simple.txt
                │       ├── chat_stream_grok3_reasoning.txt
                │       ├── chat_stream_tool_call.txt
                │       └── chat_stream_with_usage.txt
                │
                └── mocks/
                    ├── mod.rs
                    ├── transport.rs            # MockHttpTransport
                    ├── credentials.rs          # MockCredentialProvider
                    └── responses.rs            # Canned xAI responses
```

### 1.2 TypeScript Implementation

```
integrations/
└── xai/
    └── grok/
        └── typescript/
            ├── package.json
            ├── tsconfig.json
            ├── tsconfig.build.json
            ├── README.md
            ├── src/
            │   ├── index.ts                    # Public API exports
            │   ├── client.ts                   # GrokClient implementation
            │   ├── config.ts                   # GrokConfig types
            │   │
            │   ├── models/
            │   │   ├── index.ts
            │   │   ├── registry.ts             # ModelRegistry
            │   │   ├── types.ts                # GrokModel types
            │   │   └── capabilities.ts         # GrokCapabilities
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
            │   │   └── image/
            │   │       ├── index.ts
            │   │       ├── service.ts          # ImageService
            │   │       └── types.ts            # Request/Response types
            │   │
            │   ├── reasoning/
            │   │   ├── index.ts
            │   │   ├── extractor.ts            # ReasoningExtractor
            │   │   ├── types.ts                # ReasoningContent types
            │   │   └── accumulator.ts          # StreamAccumulator
            │   │
            │   ├── live-search/
            │   │   ├── index.ts
            │   │   ├── tool.ts                 # Live Search tool
            │   │   ├── handler.ts              # LiveSearchHandler
            │   │   └── cost.ts                 # Cost tracking
            │   │
            │   ├── auth/
            │   │   ├── index.ts
            │   │   ├── provider.ts             # CredentialProvider interface
            │   │   └── api-key.ts              # ApiKeyCredentialProvider
            │   │
            │   ├── infra/
            │   │   ├── index.ts
            │   │   ├── request-builder.ts      # HTTP request construction
            │   │   ├── response-parser.ts      # Response parsing
            │   │   └── sse-parser.ts           # SSE stream parsing
            │   │
            │   ├── adapter/
            │   │   ├── index.ts
            │   │   ├── model-adapter.ts        # ModelAdapter implementation
            │   │   └── converters.ts           # Request/Response conversion
            │   │
            │   ├── ruvvector/
            │   │   ├── index.ts
            │   │   ├── service.ts              # GrokEmbeddingStorage
            │   │   └── embeddings.ts           # Embedding storage
            │   │
            │   ├── types/
            │   │   ├── index.ts
            │   │   ├── message.ts              # ChatMessage types
            │   │   ├── usage.ts                # TokenUsage types
            │   │   ├── tool.ts                 # Tool types
            │   │   └── multimodal.ts           # Vision content types
            │   │
            │   ├── error.ts                    # GrokError class
            │   └── validation.ts               # Input validation
            │
            └── tests/
                ├── unit/
                │   ├── models/
                │   │   ├── registry.test.ts
                │   │   └── capabilities.test.ts
                │   ├── services/
                │   │   ├── chat.test.ts
                │   │   ├── embedding.test.ts
                │   │   └── stream.test.ts
                │   ├── reasoning/
                │   │   ├── extractor.test.ts
                │   │   └── accumulator.test.ts
                │   ├── live-search/
                │   │   ├── tool.test.ts
                │   │   └── cost.test.ts
                │   ├── infra/
                │   │   ├── request-builder.test.ts
                │   │   └── sse-parser.test.ts
                │   └── error.test.ts
                │
                ├── integration/
                │   ├── setup.ts                # Test setup
                │   ├── chat.integration.test.ts
                │   ├── chat-reasoning.integration.test.ts
                │   ├── embedding.integration.test.ts
                │   ├── streaming.integration.test.ts
                │   └── vision.integration.test.ts
                │
                └── fixtures/
                    ├── requests/
                    ├── responses/
                    └── streaming/
```

---

## 2. Implementation Sequence

### 2.1 Phase 1: Foundation

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
│  │ □ GrokModel enum (Grok4, Grok4_1, Grok3Beta, Grok3MiniBeta, etc.)  │    │
│  │ □ GrokCapabilities struct                                          │    │
│  │ □ GrokError enum                                                   │    │
│  │ □ SecretString wrapper (reuse from shared/credentials)              │    │
│  │ □ TokenUsage struct (with reasoning_tokens)                         │    │
│  │ □ ReasoningContent struct                                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  1.3 Configuration                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ GrokConfig struct                                                 │    │
│  │ □ Config validation functions                                       │    │
│  │ □ Environment loading (from_env)                                    │    │
│  │ □ Config builder pattern                                            │    │
│  │ □ LiveSearchConfig (enabled, max_sources, budget)                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  1.4 Model Registry                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ ModelRegistry struct                                              │    │
│  │ □ Register all models with aliases                                  │    │
│  │ □ resolve() function (exact and partial match)                      │    │
│  │ □ get_capabilities() function                                       │    │
│  │ □ supports_reasoning() helper                                       │    │
│  │ □ supports_vision() helper                                          │    │
│  │ □ list() function                                                   │    │
│  │ □ Unit tests for all resolution scenarios                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Deliverables:                                                              │
│  - Compilable crate with core types                                        │
│  - 100% test coverage on ModelRegistry                                     │
│  - CI pipeline passing                                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Phase 2: Authentication

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 2: AUTHENTICATION                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Priority: P0 - Required for all API calls                                  │
│                                                                              │
│  2.1 Credential Provider Trait                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ Define CredentialProvider trait (reuse from shared/credentials)   │    │
│  │ □ get_auth_header() async method                                    │    │
│  │ □ refresh() async method                                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  2.2 API Key Provider                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ ApiKeyCredentialProvider implementation                           │    │
│  │ □ Bearer token format ("Authorization: Bearer {key}")               │    │
│  │ □ from_env() constructor (XAI_API_KEY)                              │    │
│  │ □ Unit tests                                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Note: xAI currently only supports API key authentication                  │
│  (No Azure AD or Managed Identity equivalent)                               │
│                                                                              │
│  Deliverables:                                                              │
│  - API key provider working                                                 │
│  - 100% test coverage on auth module                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Phase 3: Infrastructure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 3: INFRASTRUCTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Priority: P0 - Required for API communication                              │
│                                                                              │
│  3.1 Request Builder                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ Base URL: https://api.x.ai/v1                                     │    │
│  │ □ build_chat_request_body() function                                │    │
│  │ □ serialize_messages() with multimodal support                      │    │
│  │ □ serialize_tools() function                                        │    │
│  │ □ Live Search tool injection                                        │    │
│  │ □ 100% test coverage                                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  3.2 Response Parser                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ parse_chat_response() function                                    │    │
│  │ □ Reasoning content extraction (Grok-3)                             │    │
│  │ □ Reasoning tokens tracking                                         │    │
│  │ □ Tool call parsing                                                 │    │
│  │ □ Unit tests for all response variations                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  3.3 SSE Parser                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ SseParser struct                                                  │    │
│  │ □ Buffer management for partial events                              │    │
│  │ □ try_parse_event() function                                        │    │
│  │ □ Stream implementation                                             │    │
│  │ □ [DONE] sentinel handling                                          │    │
│  │ □ Reasoning content delta handling                                  │    │
│  │ □ Unit tests with edge cases                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  3.4 Error Mapping                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ parse_error_response() function                                   │    │
│  │ □ HTTP status code mapping (400, 401, 403, 404, 429, 498, 5xx)     │    │
│  │ □ xAI error code extraction (OpenAI-compatible format)              │    │
│  │ □ Retry-After header parsing                                        │    │
│  │ □ Context length exceeded detection                                 │    │
│  │ □ Capacity exceeded (498) handling                                  │    │
│  │ □ Unit tests for all error scenarios                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  3.5 Validation                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ validate_model_hint()                                             │    │
│  │ □ validate_chat_request() (temperature, top_p, max_tokens, etc.)    │    │
│  │ □ validate_request_capabilities() (vision, reasoning)               │    │
│  │ □ validate_image_content() (size, format)                           │    │
│  │ □ Unit tests for all validation rules                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Deliverables:                                                              │
│  - Request construction working                                             │
│  - Response parsing with reasoning support                                  │
│  - SSE parser handling all edge cases                                      │
│  - Error mapping complete for all xAI error codes                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Phase 4: Chat Service

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 4: CHAT SERVICE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Priority: P0 - Core functionality                                          │
│                                                                              │
│  4.1 Request/Response Types                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ GrokChatRequest struct                                            │    │
│  │ □ GrokChatResponse struct                                           │    │
│  │ □ ChatMessage struct (with reasoning_content)                       │    │
│  │ □ ChatChoice struct (with reasoning_content)                        │    │
│  │ □ TokenUsage struct (with reasoning_tokens)                         │    │
│  │ □ Tool and ToolCall types                                           │    │
│  │ □ MultiModalContent types (vision)                                  │    │
│  │ □ Serde serialization/deserialization                               │    │
│  │ □ Unit tests for JSON round-trip                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  4.2 Chat Service Implementation                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ ChatServiceImpl struct                                            │    │
│  │ □ complete() method                                                 │    │
│  │ □ Model capability validation                                       │    │
│  │ □ Reasoning content extraction (Grok-3)                             │    │
│  │ □ Integration with resilience (retry, circuit breaker)              │    │
│  │ □ Observability (tracing spans, metrics)                            │    │
│  │ □ Unit tests with mocked HTTP                                       │    │
│  │ □ Integration tests with WireMock                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  4.3 Streaming Implementation                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ stream() method                                                   │    │
│  │ □ ChatStream struct (implements Stream)                             │    │
│  │ □ ChatChunk struct (with reasoning_content delta)                   │    │
│  │ □ StreamAccumulator for content and reasoning                       │    │
│  │ □ Usage accumulation on final chunk                                 │    │
│  │ □ Idle timeout handling                                             │    │
│  │ □ Backpressure with bounded channel (100 chunks)                    │    │
│  │ □ Unit tests with fixture streams                                   │    │
│  │ □ Integration tests with streaming mock                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  4.4 Function Calling / Tools                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ Tool definition types (OpenAI-compatible)                         │    │
│  │ □ ToolChoice enum (auto, none, required, specific)                  │    │
│  │ □ ToolCall parsing from response                                    │    │
│  │ □ Tool result message construction                                  │    │
│  │ □ Unit tests for tool calling scenarios                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  4.5 Vision Support                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ MultiModalContent serialization                                   │    │
│  │ □ Image URL format                                                  │    │
│  │ □ Base64 image format                                               │    │
│  │ □ Model capability check (Grok-4, grok-vision-beta only)            │    │
│  │ □ Unit tests for vision content                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Deliverables:                                                              │
│  - Chat completions working (sync and streaming)                           │
│  - Reasoning content captured (Grok-3)                                     │
│  - Function calling / tools working                                        │
│  - Vision support working (Grok-4, grok-vision-beta)                       │
│  - Integration tests passing                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.5 Phase 5: Reasoning Module

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PHASE 5: REASONING MODULE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Priority: P0 - Grok-3 specific functionality                               │
│                                                                              │
│  5.1 ReasoningExtractor                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ ReasoningExtractor struct                                         │    │
│  │ □ extract() for non-streaming responses                             │    │
│  │ □ extract_from_stream() for streaming                               │    │
│  │ □ Model capability checking                                         │    │
│  │ □ Empty content handling                                            │    │
│  │ □ Unit tests                                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  5.2 StreamAccumulator                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ StreamAccumulator struct                                          │    │
│  │ □ append_content() (O(1) append)                                    │    │
│  │ □ append_reasoning() (O(1) append)                                  │    │
│  │ □ finalize_content() (single allocation)                            │    │
│  │ □ finalize_reasoning() (single allocation)                          │    │
│  │ □ Performance benchmarks                                            │    │
│  │ □ Unit tests                                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  5.3 Reasoning Integration                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ Include reasoning in unified response metadata                    │    │
│  │ □ Reasoning tokens in metrics                                       │    │
│  │ □ Reasoning content in provider_specific field                      │    │
│  │ □ Integration tests with Grok-3                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Deliverables:                                                              │
│  - Reasoning extraction working for Grok-3 models                          │
│  - Streaming accumulation efficient                                         │
│  - Reasoning exposed in unified response                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.6 Phase 6: Embedding & Image Services

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 6: EMBEDDING & IMAGE SERVICES                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Priority: P1 - Secondary functionality                                     │
│                                                                              │
│  6.1 Embedding Service                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ EmbeddingRequest struct                                           │    │
│  │ □ EmbeddingInput enum (Single, Multiple)                            │    │
│  │ □ EmbeddingResponse struct                                          │    │
│  │ □ EmbeddingServiceImpl struct                                       │    │
│  │ □ create() method (single input)                                    │    │
│  │ □ create_batch() method (multiple inputs)                           │    │
│  │ □ Dimensions parameter support                                      │    │
│  │ □ Encoding format support                                           │    │
│  │ □ Unit tests                                                        │    │
│  │ □ Integration tests                                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  6.2 Image Generation Service (Grok-2-Image)                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ ImageGenerationRequest struct                                     │    │
│  │ □ ImageGenerationResponse struct                                    │    │
│  │ □ ImageServiceImpl struct                                           │    │
│  │ □ generate() method                                                 │    │
│  │ □ Size options                                                      │    │
│  │ □ Response format (url, base64)                                     │    │
│  │ □ Unit tests                                                        │    │
│  │ □ Integration tests                                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Deliverables:                                                              │
│  - Embedding generation working                                            │
│  - Image generation working (Grok-2-Image)                                 │
│  - Integration tests passing                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.7 Phase 7: Live Search

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 7: LIVE SEARCH                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Priority: P2 - Optional functionality ($25/1K sources)                     │
│                                                                              │
│  7.1 Live Search Tool                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ create_live_search_tool() function                                │    │
│  │ □ has_live_search_tool() check                                      │    │
│  │ □ Tool injection when enabled                                       │    │
│  │ □ Unit tests                                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  7.2 Live Search Handler                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ LiveSearchHandler struct                                          │    │
│  │ □ extract_search_results() function                                 │    │
│  │ □ log_search_usage() for cost tracking                              │    │
│  │ □ Unit tests                                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  7.3 Cost Management                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ LiveSearchConfig (enabled, max_sources, daily_budget)             │    │
│  │ □ validate_live_search_request() function                           │    │
│  │ □ Cost metrics (xai_grok_live_search_cost_usd_total)                │    │
│  │ □ Budget exceeded error                                             │    │
│  │ □ Unit tests                                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Deliverables:                                                              │
│  - Live Search tool injection working                                      │
│  - Cost tracking implemented                                               │
│  - Budget management working                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.8 Phase 8: Client Assembly

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PHASE 8: CLIENT ASSEMBLY                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Priority: P0 - User-facing API                                             │
│                                                                              │
│  8.1 Client Implementation                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ GrokClientImpl struct                                             │    │
│  │ □ Builder pattern (GrokClientBuilder)                               │    │
│  │ □ Lazy service initialization (OnceCell)                            │    │
│  │ □ chat() accessor                                                   │    │
│  │ □ embeddings() accessor                                             │    │
│  │ □ images() accessor                                                 │    │
│  │ □ models() accessor (ModelRegistry)                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  8.2 Factory Functions                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ create_grok_client(config)                                        │    │
│  │ □ create_grok_client_from_env()                                     │    │
│  │ □ Error handling for missing config                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  8.3 Public API Exports                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ lib.rs exports                                                    │    │
│  │ □ Prelude module (common imports)                                   │    │
│  │ □ Feature flags (ruvvector, live_search)                            │    │
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

### 2.9 Phase 9: Platform Adapter

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PHASE 9: PLATFORM ADAPTER                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Priority: P1 - Integration with orchestration                              │
│                                                                              │
│  9.1 Model Adapter Implementation                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ GrokAdapter struct                                                │    │
│  │ □ ModelAdapter trait implementation                                 │    │
│  │ □ provider_id() -> "xai-grok"                                       │    │
│  │ □ supported_capabilities() method                                   │    │
│  │ □ invoke() method                                                   │    │
│  │ □ invoke_stream() method                                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  9.2 Request/Response Conversion                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ convert_to_grok_chat_request()                                    │    │
│  │ □ convert_to_grok_embedding_request()                               │    │
│  │ □ convert_to_grok_image_request()                                   │    │
│  │ □ convert_to_unified_response() (with reasoning in metadata)        │    │
│  │ □ convert_to_unified_embedding_response()                           │    │
│  │ □ convert_to_unified_image_response()                               │    │
│  │ □ convert_chunk_to_unified() (with reasoning delta)                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Deliverables:                                                              │
│  - Platform adapter working                                                 │
│  - All conversion functions tested                                         │
│  - Reasoning exposed in provider_specific metadata                         │
│  - Integration with shared/orchestration                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.10 Phase 10: RuvVector Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PHASE 10: RUVVECTOR INTEGRATION                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Priority: P1 - Vector storage integration                                  │
│                                                                              │
│  10.1 Embedding Storage                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ GrokEmbeddingStorage struct                                       │    │
│  │ □ EmbeddingStorage trait implementation                             │    │
│  │ □ store_embedding() method                                          │    │
│  │ □ store_embeddings_batch() method                                   │    │
│  │ □ search_similar() method                                           │    │
│  │ □ delete_embedding() method                                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  10.2 Database Schema                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ □ Embeddings table with provider='xai-grok'                         │    │
│  │ □ pgvector extension usage                                          │    │
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

---

## 3. Test Implementation Plan

### 3.1 Unit Test Matrix

| Component | Test File | Coverage Target | Priority |
|-----------|-----------|-----------------|----------|
| ModelRegistry | `registry_test.rs` | 100% | P0 |
| GrokCapabilities | `capabilities_test.rs` | 100% | P0 |
| SseParser | `sse_parser_test.rs` | 95% | P0 |
| ApiKeyProvider | `api_key_test.rs` | 100% | P0 |
| RequestBuilder | `request_builder_test.rs` | 95% | P0 |
| ResponseParser | `response_parser_test.rs` | 95% | P0 |
| ChatService | `chat_test.rs` | 90% | P0 |
| ChatStream | `stream_test.rs` | 90% | P0 |
| ReasoningExtractor | `extractor_test.rs` | 100% | P0 |
| StreamAccumulator | `accumulator_test.rs` | 100% | P0 |
| EmbeddingService | `embedding_test.rs` | 90% | P1 |
| ImageService | `image_test.rs` | 90% | P1 |
| LiveSearchTool | `tool_test.rs` | 95% | P2 |
| LiveSearchCost | `cost_test.rs` | 100% | P2 |
| ErrorMapping | `error_test.rs` | 100% | P0 |
| Validation | `validation_test.rs` | 100% | P0 |
| ModelAdapter | `adapter_test.rs` | 90% | P1 |

### 3.2 Integration Test Scenarios

| Scenario | Test File | Mock Type | Priority |
|----------|-----------|-----------|----------|
| Chat completion (Grok-4) | `chat_integration_test.rs` | WireMock | P0 |
| Chat completion (Grok-3 with reasoning) | `chat_reasoning_test.rs` | WireMock | P0 |
| Chat with tools | `chat_integration_test.rs` | WireMock | P0 |
| Chat streaming | `streaming_integration_test.rs` | WireMock | P0 |
| Streaming with reasoning | `streaming_integration_test.rs` | WireMock | P0 |
| Vision request (Grok-4) | `vision_integration_test.rs` | WireMock | P0 |
| Rate limit handling | `chat_integration_test.rs` | WireMock | P0 |
| Capacity exceeded (498) | `chat_integration_test.rs` | WireMock | P1 |
| Stream interruption | `streaming_integration_test.rs` | WireMock | P1 |
| Embedding creation | `embedding_integration_test.rs` | WireMock | P1 |
| Batch embeddings | `embedding_integration_test.rs` | WireMock | P1 |
| Image generation | `image_integration_test.rs` | WireMock | P1 |
| Live Search cost tracking | `live_search_integration_test.rs` | WireMock | P2 |
| Circuit breaker trip | `resilience_integration_test.rs` | WireMock | P1 |
| RuvVector storage | `ruvvector_integration_test.rs` | PostgreSQL | P1 |

### 3.3 Contract Tests

```rust
// Contract test example: Verify response parsing matches xAI format
#[test]
fn test_chat_response_contract() {
    // Load recorded xAI response
    let fixture = include_str!("../fixtures/responses/chat_success.json");

    // Parse with our types
    let response: GrokChatResponse = serde_json::from_str(fixture)
        .expect("Should parse xAI response format");

    // Verify key fields
    assert!(!response.id.is_empty());
    assert_eq!(response.object, "chat.completion");
    assert!(!response.choices.is_empty());
    assert!(response.usage.prompt_tokens > 0);
}

#[test]
fn test_grok3_reasoning_response_contract() {
    // Load recorded Grok-3 response with reasoning
    let fixture = include_str!("../fixtures/responses/chat_grok3_with_reasoning.json");

    let response: GrokChatResponse = serde_json::from_str(fixture)
        .expect("Should parse response with reasoning content");

    // Verify reasoning fields (Grok-3 specific)
    let choice = &response.choices[0];
    assert!(choice.reasoning_content.is_some());
    assert!(response.usage.reasoning_tokens.is_some());
}

#[test]
fn test_live_search_response_contract() {
    let fixture = include_str!("../fixtures/responses/chat_live_search.json");

    let response: GrokChatResponse = serde_json::from_str(fixture)
        .expect("Should parse response with Live Search tool call");

    // Verify tool call structure
    let choice = &response.choices[0];
    assert!(choice.message.tool_calls.is_some());
    let tool_calls = choice.message.tool_calls.as_ref().unwrap();
    assert!(tool_calls.iter().any(|tc| tc.function.name == "live_search"));
}
```

---

## 4. Documentation Deliverables

### 4.1 API Documentation

```
docs/
├── api/
│   ├── client.md               # GrokClient API reference
│   ├── chat.md                 # ChatService API reference
│   ├── embeddings.md           # EmbeddingService API reference
│   ├── images.md               # ImageService API reference
│   ├── streaming.md            # Streaming API guide
│   ├── reasoning.md            # Reasoning content API (Grok-3)
│   ├── errors.md               # Error types and handling
│   └── types.md                # Common types reference
│
├── guides/
│   ├── quickstart.md           # Getting started guide
│   ├── models.md               # Model selection guide
│   ├── reasoning.md            # Working with Grok-3 reasoning
│   ├── vision.md               # Vision input guide
│   ├── live-search.md          # Live Search feature guide
│   ├── streaming.md            # Streaming implementation guide
│   └── ruvvector.md            # RuvVector integration guide
│
└── examples/
    ├── basic-chat.md           # Simple chat example
    ├── grok3-reasoning.md      # Grok-3 reasoning example
    ├── streaming-chat.md       # Streaming example
    ├── function-calling.md     # Tools/function calling example
    ├── vision.md               # Vision input example
    ├── embeddings.md           # Embedding generation example
    └── live-search.md          # Live Search example
```

### 4.2 README Structure

```markdown
# xAI Grok Integration

Thin adapter for xAI Grok API integration.

## Features

- Chat completions (Grok-4, Grok-4.1, Grok-3, Grok-3-Mini)
- Streaming responses
- **Reasoning content** (Grok-3 models)
- Function calling / Tools
- Vision input (Grok-4, grok-vision-beta)
- Embeddings
- Image generation (Grok-2-Image)
- Live Search (optional)
- RuvVector integration

## Model Capabilities

| Model | Context | Vision | Reasoning | Live Search |
|-------|---------|--------|-----------|-------------|
| grok-4 | 256K | ✅ | ❌ | ✅ |
| grok-4.1 | 256K | ✅ | ❌ | ✅ |
| grok-3-beta | 131K | ❌ | ✅ | ✅ |
| grok-3-mini-beta | 131K | ❌ | ✅ | ✅ |
| grok-vision-beta | 128K | ✅ | ❌ | ✅ |
| grok-2-image-1212 | N/A | ❌ | ❌ | ❌ |

## Quick Start

### Installation

```toml
[dependencies]
integrations-xai-grok = "0.1"
```

### Basic Usage

```rust
use integrations_xai_grok::{
    create_grok_client_from_env,
    GrokChatRequest, ChatMessage, Role, GrokModel,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = create_grok_client_from_env()?;

    let response = client.chat().complete(GrokChatRequest {
        model: GrokModel::Grok3Beta,
        messages: vec![
            ChatMessage {
                role: Role::User,
                content: Some("Explain quantum entanglement".to_string()),
                ..Default::default()
            }
        ],
        ..Default::default()
    }).await?;

    println!("{}", response.choices[0].message.content.as_ref().unwrap());

    // Access reasoning content (Grok-3 only)
    if let Some(reasoning) = &response.choices[0].reasoning_content {
        println!("Reasoning: {}", reasoning);
    }

    Ok(())
}
```

### Streaming with Reasoning

```rust
use futures::StreamExt;

let mut stream = client.chat().stream(GrokChatRequest {
    model: GrokModel::Grok3Beta,
    messages: vec![/* ... */],
    ..Default::default()
}).await?;

while let Some(chunk) = stream.next().await {
    let chunk = chunk?;
    if let Some(delta) = &chunk.choices[0].delta.content {
        print!("{}", delta);
    }
    // Reasoning arrives as deltas too
    if let Some(reasoning_delta) = &chunk.choices[0].reasoning_content {
        // Process reasoning chunk
    }
}
```

## Configuration

### Environment Variables

```bash
# Required
XAI_API_KEY=xai-your-api-key

# Optional
XAI_BASE_URL=https://api.x.ai/v1
XAI_DEFAULT_MODEL=grok-3-beta
XAI_REQUEST_TIMEOUT_MS=120000

# Live Search (optional, $25/1K sources)
XAI_LIVE_SEARCH_ENABLED=false
XAI_LIVE_SEARCH_MAX_SOURCES=100
XAI_LIVE_SEARCH_DAILY_BUDGET=1000

# RuvVector
RUVVECTOR_ENABLED=true
DATABASE_URL=postgresql://...
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
| Reasoning content (Grok-3) | Extracts reasoning_content and reasoning_tokens | Integration |
| Reasoning streaming | Accumulates reasoning deltas correctly | Integration |
| Function calling | Parses tool_calls, handles tool responses | Unit + Integration |
| Vision (Grok-4) | Accepts and processes image inputs | Integration |
| Embeddings | Returns vector of correct dimensions | Integration |
| Image generation | Returns generated image URL/base64 | Integration |
| API key auth | Successfully authenticates with Bearer token | Integration |
| Model resolution | Resolves by ID and aliases | Unit |
| Capability validation | Rejects vision on non-vision models | Unit |
| Rate limit handling | Respects Retry-After, exponential backoff | Integration |
| Capacity exceeded | Handles 498 status with appropriate retry | Integration |
| Circuit breaker | Opens after failures, recovers after timeout | Integration |
| Live Search | Injects tool when enabled, tracks costs | Integration |

### 5.2 Non-Functional Requirements

| Requirement | Target | Measurement |
|-------------|--------|-------------|
| Request latency overhead | < 10ms | Benchmark |
| Memory per request | < 1KB (excl. response) | Profiling |
| Connection reuse | > 90% | Metrics |
| Streaming accumulation | O(1) append | Benchmark |
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
│  □ SecretString used for API key                                           │
│  □ No sensitive data in logs (prompts, completions, reasoning)             │
│                                                                              │
│  Gate 4: Documentation                                                      │
│  □ All public APIs documented                                               │
│  □ README complete                                                          │
│  □ Examples working                                                         │
│  □ Model capabilities documented                                            │
│  □ CHANGELOG updated                                                        │
│                                                                              │
│  Gate 5: Performance                                                        │
│  □ Benchmarks within targets                                                │
│  □ No memory leaks                                                          │
│  □ Streaming backpressure working                                           │
│  □ Reasoning accumulation efficient                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Dependency Checklist

### 6.1 Shared Module Dependencies

| Module | Status | Integration Point |
|--------|--------|-------------------|
| `shared/credentials` | Required | CredentialProvider trait |
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

[dev-dependencies]
tokio-test = "0.4"
mockall = "0.12"
wiremock = "0.6"
```

### 6.3 External Dependencies (TypeScript)

```json
{
  "dependencies": {
    "@integrations/credentials": "workspace:*",
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
□ Model capabilities matrix verified
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
□ Alerts configured (including Live Search cost alerts)
□ Runbook updated
□ Team notified
```

---

## 8. Grok-Specific Considerations

### 8.1 Model Evolution Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MODEL EVOLUTION STRATEGY                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  xAI frequently releases new models. Strategy for staying current:          │
│                                                                              │
│  1. Configuration-Driven Models                                             │
│     □ Load model definitions from config file                               │
│     □ Allow runtime model registration                                      │
│     □ GrokModel::Custom variant for unknown models                          │
│                                                                              │
│  2. Capability Discovery                                                    │
│     □ Optional /v1/models endpoint call on startup                         │
│     □ Log unknown models for future support                                 │
│     □ Graceful handling of new capabilities                                 │
│                                                                              │
│  3. Version Tracking                                                        │
│     □ Track model versions in metrics                                       │
│     □ Alert on deprecated model usage                                       │
│     □ Document sunset timelines                                             │
│                                                                              │
│  4. Quarterly Review                                                        │
│     □ Check xAI announcements for new models                               │
│     □ Update ModelRegistry with new entries                                 │
│     □ Update capability matrix in documentation                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Pricing Awareness

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PRICING AWARENESS                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Token Pricing (as of 2025):                                                │
│  ┌─────────────────┬─────────────────┬─────────────────┐                   │
│  │ Model           │ Input (per 1M)  │ Output (per 1M) │                   │
│  ├─────────────────┼─────────────────┼─────────────────┤                   │
│  │ Grok-4          │ $3.00           │ $15.00          │                   │
│  │ Grok-3          │ $2.00           │ $10.00          │                   │
│  │ Grok-3-Mini     │ $0.30           │ $0.50           │                   │
│  └─────────────────┴─────────────────┴─────────────────┘                   │
│                                                                              │
│  Additional Costs:                                                          │
│  - Live Search: $25 per 1,000 sources (significant!)                       │
│  - Reasoning tokens: Included in completion token count                    │
│                                                                              │
│  Cost Tracking Metrics:                                                     │
│  □ xai_grok_tokens_total (model, type=prompt|completion)                   │
│  □ xai_grok_reasoning_tokens_total (model)                                 │
│  □ xai_grok_live_search_sources_total (model)                              │
│  □ xai_grok_live_search_cost_usd_total (model)                             │
│  □ xai_grok_estimated_cost_usd_total (model)                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Reasoning Content Best Practices

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  REASONING CONTENT BEST PRACTICES                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. When to Use Grok-3 with Reasoning                                       │
│     □ Complex multi-step problems                                           │
│     □ Mathematical proofs                                                   │
│     □ Code debugging with explanations                                      │
│     □ Scientific analysis                                                   │
│                                                                              │
│  2. When to Use Grok-4 (No Reasoning)                                       │
│     □ Simple Q&A                                                            │
│     □ Content generation                                                    │
│     □ Vision tasks                                                          │
│     □ When cost optimization is priority                                    │
│                                                                              │
│  3. Exposing Reasoning to Users                                             │
│     □ Always include in provider_specific metadata                         │
│     □ Consider UI for expandable reasoning view                            │
│     □ Track reasoning token costs separately                               │
│                                                                              │
│  4. Streaming Considerations                                                │
│     □ Reasoning may arrive before content                                  │
│     □ Accumulate both streams independently                                 │
│     □ Final chunk has complete usage including reasoning_tokens            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | `specification-xai-grok.md` | ✅ Complete |
| 2. Architecture | `architecture-xai-grok.md` | ✅ Complete |
| 3. Pseudocode | `pseudocode-xai-grok.md` | ✅ Complete |
| 4. Refinement | `refinement-xai-grok.md` | ✅ Complete |
| 5. Completion | `completion-xai-grok.md` | ✅ Complete |

---

## 10. Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial completion document |

---

**End of SPARC Documentation**

*Ready for implementation.*
