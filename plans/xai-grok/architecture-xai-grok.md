# SPARC Phase 2: Architecture — xAI Grok Integration

**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/xai/grok`

---

## 1. Architecture Overview

### 1.1 Executive Summary

The xAI Grok Integration Module implements a **thin adapter layer** that:

1. **Provides unified access** to Grok model variants (Grok-4, Grok-3, Grok-3-Mini, Grok-2-Image)
2. **Leverages OpenAI-compatible API** format for simplified integration
3. **Captures Grok-specific features** (reasoning_content, Live Search)
4. **Reuses shared infrastructure** from existing integrations
5. **Integrates with RuvVector** for embeddings and state persistence

### 1.2 Key Architectural Decisions

| Decision | Rationale | Trade-offs |
|----------|-----------|------------|
| **Thin adapter layer** | Minimize duplication, leverage shared infra | Limited xAI-specific customization |
| **OpenAI-compatible client** | xAI API mirrors OpenAI format | May miss xAI-specific optimizations |
| **Model registry pattern** | Track capabilities per model variant | Configuration overhead |
| **Reasoning content passthrough** | Grok-3 specific feature | Additional response field handling |
| **Optional Live Search** | Cost-aware ($25/1K sources) | Feature flag complexity |

### 1.3 Architecture Constraints

| Constraint | Source | Impact |
|------------|--------|--------|
| Thin adapter only | Design principle | No duplicate logic from shared modules |
| No xAI SDK dependency | Forbidden dep policy | Custom HTTP client |
| OpenAI-compatible format | xAI API design | Simplified request/response mapping |
| Bearer token auth | xAI API requirement | Single auth method |
| Rust + TypeScript | Multi-language support | Maintain API parity |

### 1.4 xAI Grok-Specific Considerations

| Consideration | Description |
|---------------|-------------|
| **OpenAI compatibility** | Base URL change enables OpenAI SDK usage |
| **Reasoning content** | Grok-3 models return `reasoning_content` field |
| **Live Search** | Agentic tool for real-time web/X search |
| **Model aliases** | `grok-4-latest`, `grok-3` resolve to specific versions |
| **Vision support** | Grok-4 and grok-vision-beta support image inputs |

---

## 2. Design Principles

### 2.1 Thin Adapter Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         THIN ADAPTER PRINCIPLE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  xAI Grok Module                    Shared Modules                           │
│  ┌──────────────────────┐          ┌──────────────────────┐                 │
│  │ GrokClient           │          │ shared/credentials   │                 │
│  │                      │─────────►│ (reuse)              │                 │
│  │ • ChatService        │          └──────────────────────┘                 │
│  │ • EmbeddingService   │          ┌──────────────────────┐                 │
│  │ • ImageService       │─────────►│ shared/resilience    │                 │
│  │ • ModelRegistry      │          │ (reuse)              │                 │
│  └──────────────────────┘          └──────────────────────┘                 │
│           │                        ┌──────────────────────┐                 │
│           │                        │ shared/observability │                 │
│           └───────────────────────►│ (reuse)              │                 │
│                                    └──────────────────────┘                 │
│                                    ┌──────────────────────┐                 │
│                                    │ shared/database      │                 │
│                                    │ (RuvVector)          │                 │
│                                    └──────────────────────┘                 │
│                                                                              │
│  GROK MODULE OWNS:                 SHARED MODULES OWN:                      │
│  • Model variant routing           • API key retrieval                      │
│  • Request format construction     • Retry logic                            │
│  • Response parsing                • Circuit breaker                        │
│  • Reasoning content extraction    • Rate limiting                          │
│  • Live Search tool handling       • Logging/metrics/tracing                │
│  • Streaming chunk parsing         • Database connectivity                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Model Registry Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MODEL REGISTRY PATTERN                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                        Platform Request                                      │
│                    ┌────────────────────┐                                   │
│                    │ UnifiedModelRequest │                                   │
│                    │ model_hint: "grok-4"│                                   │
│                    └─────────┬──────────┘                                   │
│                              │                                               │
│                              ▼                                               │
│                    ┌────────────────────┐                                   │
│                    │   ModelRegistry    │                                   │
│                    │                    │                                   │
│                    │ resolve("grok-4")  │                                   │
│                    └─────────┬──────────┘                                   │
│                              │                                               │
│         ┌────────────────────┼────────────────────┐                         │
│         │                    │                    │                         │
│         ▼                    ▼                    ▼                         │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │  GrokModel  │     │  GrokModel  │     │  GrokModel  │                   │
│  │   Grok4     │     │   Grok3     │     │ Grok3Mini   │                   │
│  │             │     │             │     │             │                   │
│  │ context:    │     │ context:    │     │ context:    │                   │
│  │ 256K        │     │ 131K        │     │ 131K        │                   │
│  │ vision: ✓   │     │ reasoning:✓ │     │ reasoning:✓ │                   │
│  │ tools: ✓    │     │ tools: ✓    │     │ fast: ✓     │                   │
│  └─────────────┘     └─────────────┘     └─────────────┘                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Dependency Inversion

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DEPENDENCY INVERSION PRINCIPLE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  High-level: GrokClientImpl                                                 │
│       ↓ depends on abstraction                                              │
│  Interface: HttpTransport trait (from shared)                               │
│       ↑ implements                                                          │
│  Low-level: ReqwestHttpTransport                                            │
│                                                                              │
│  High-level: GrokClientImpl                                                 │
│       ↓ depends on abstraction                                              │
│  Interface: CredentialProvider trait (from shared/credentials)              │
│       ↑ implements                                                          │
│  Low-level: ApiKeyCredentialProvider                                        │
│                                                                              │
│  High-level: GrokClientImpl                                                 │
│       ↓ depends on abstraction                                              │
│  Interface: ResilienceOrchestrator (from shared/resilience)                 │
│       ↑ implements                                                          │
│  Low-level: RetryExecutor + CircuitBreaker + RateLimiter                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. C4 Model Diagrams

### 3.1 Context Diagram (Level 1)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM CONTEXT                                  │
└─────────────────────────────────────────────────────────────────────────────┘

                        ┌───────────────────────────┐
                        │      Application          │
                        │      Developer            │
                        │                           │
                        │  Uses Grok module to      │
                        │  invoke models:           │
                        │  Grok-4, Grok-3, etc.     │
                        └─────────────┬─────────────┘
                                      │
                                      │ Uses
                                      ▼
┌───────────────────┐    ┌───────────────────────────┐    ┌───────────────────┐
│                   │    │                           │    │                   │
│  Shared           │◄───│   xAI Grok Integration   │───►│  xAI API          │
│  Modules          │    │   Module                  │    │                   │
│                   │    │                           │    │ api.x.ai/v1       │
│ • credentials     │    │  Thin adapter providing   │    │                   │
│ • resilience      │    │  unified access to:       │    │ • /chat/completions
│ • observability   │    │  • Grok-4, Grok-4.1       │    │ • /embeddings     │
│ • database        │    │  • Grok-3, Grok-3-Mini    │    │ • /images         │
│                   │    │  • Grok-2-Image           │    │ • /models         │
│                   │    │  • Vision, Live Search    │    │                   │
└───────────────────┘    └───────────────────────────┘    └───────────────────┘
```

### 3.2 Container Diagram (Level 2)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CONTAINER DIAGRAM                               │
│                         xAI Grok Integration Module                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          Grok Integration Module                             │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                          Public API Container                        │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ GrokClient   │  │ Model        │  │ Model        │             │    │
│  │   │ Factory      │  │ Registry     │  │ Adapter      │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Service Container                             │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ Chat         │  │ Embedding    │  │ Image        │             │    │
│  │   │ Service      │  │ Service      │  │ Service      │             │    │
│  │   │              │  │              │  │              │             │    │
│  │   │ • complete   │  │ • create     │  │ • generate   │             │    │
│  │   │ • stream     │  │              │  │              │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐                               │    │
│  │   │ LiveSearch   │  │ Reasoning    │                               │    │
│  │   │ Handler      │  │ Extractor    │                               │    │
│  │   │ (optional)   │  │ (Grok-3)     │                               │    │
│  │   └──────────────┘  └──────────────┘                               │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Infrastructure Container                          │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ Request      │  │ Response     │  │ SSE Stream   │             │    │
│  │   │ Builder      │  │ Parser       │  │ Parser       │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐                               │    │
│  │   │ Error        │  │ Auth         │                               │    │
│  │   │ Mapper       │  │ Provider     │                               │    │
│  │   └──────────────┘  └──────────────┘                               │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           │                           │                           │
           ▼                           ▼                           ▼
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│ shared/credentials   │  │  shared/resilience   │  │ shared/observability │
│ (reuse)              │  │  (reuse)             │  │ (reuse)              │
│                      │  │                      │  │                      │
│ • ApiKeyProvider     │  │ • RetryExecutor      │  │ • Tracer             │
│                      │  │ • CircuitBreaker     │  │ • MetricsRecorder    │
│                      │  │ • RateLimiter        │  │ • Logger             │
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘
```

### 3.3 Component Diagram (Level 3)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          COMPONENT ARCHITECTURE                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            GrokClientImpl                                    │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Service Registry                               │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │  │
│  │  │   Chat      │ │  Embedding  │ │   Image     │ │   Model     │     │  │
│  │  │   Service   │ │  Service    │ │   Service   │ │   Registry  │     │  │
│  │  │             │ │             │ │             │ │             │     │  │
│  │  │ • complete  │ │ • create    │ │ • generate  │ │ • resolve   │     │  │
│  │  │ • stream    │ │             │ │             │ │ • list      │     │  │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘     │  │
│  │         │               │               │               │             │  │
│  └─────────┼───────────────┼───────────────┼───────────────┼─────────────┘  │
│            │               │               │               │                 │
│            └───────────────┴───────┬───────┴───────────────┘                 │
│                                    │                                         │
│                                    ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      Core Infrastructure                               │  │
│  │                                                                        │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │  │
│  │  │   Request       │  │   Response      │  │   Auth          │        │  │
│  │  │   Builder       │  │   Parser        │  │   Provider      │        │  │
│  │  │   (OpenAI fmt)  │  │   + Reasoning   │  │   (delegated)   │        │  │
│  │  │                 │  │                 │  │                 │        │  │
│  │  │ • build_chat()  │  │ • parse()       │  │ • get_header()  │        │  │
│  │  │ • build_embed() │  │ • extract_      │  │                 │        │  │
│  │  │ • build_image() │  │   reasoning()   │  │                 │        │  │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘        │  │
│  │           │                    │                    │                  │  │
│  └───────────┼────────────────────┼────────────────────┼──────────────────┘  │
│              │                    │                    │                     │
└──────────────┼────────────────────┼────────────────────┼─────────────────────┘
               │                    │                    │
               ▼                    ▼                    ▼
┌──────────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ shared/http          │ │ shared/resilience│ │ shared/credentials│
│ (transport)          │ │ (retry, CB)      │ │ (API key)         │
└──────────────────────┘ └──────────────────┘ └──────────────────┘
```

---

## 4. Component Architecture

### 4.1 Client Component

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          GrokClient Component                                │
└─────────────────────────────────────────────────────────────────────────────┘

                           <<interface>>
                    ┌──────────────────────┐
                    │     GrokClient       │
                    ├──────────────────────┤
                    │ + chat()             │───► ChatService
                    │ + embeddings()       │───► EmbeddingService
                    │ + images()           │───► ImageService
                    │ + models()           │───► ModelRegistry
                    │ + config()           │───► GrokConfig
                    └──────────┬───────────┘
                               △
                               │ implements
                               │
                    ┌──────────┴───────────┐
                    │   GrokClientImpl     │
                    ├──────────────────────┤
                    │ - config             │
                    │ - transport          │◇───► Arc<dyn HttpTransport>
                    │ - credentials        │◇───► Arc<dyn CredentialProvider>
                    │ - resilience         │◇───► Arc<ResilienceOrchestrator>
                    │ - observability      │◇───► ObservabilityContext
                    │ - model_registry     │◇───► ModelRegistry
                    │ - chat_service       │◇───┐
                    │ - embedding_service  │◇───┤  lazy init
                    │ - image_service      │◇───┘  (OnceCell)
                    │ - ruvvector          │◇───► Option<DatabaseConfig>
                    └──────────────────────┘

Builder Pattern:
┌─────────────────────────────────────────────────────────────────────────────┐
│  GrokClient::builder()                                                       │
│    .api_key(api_key)                      // Or use env                     │
│    .base_url("https://api.x.ai/v1")       // Default                        │
│    .default_model(GrokModel::Grok3Beta)                                     │
│    .timeout(Duration::from_secs(120))                                        │
│    .with_resilience(ResilienceConfig { ... })                                │
│    .with_live_search(false)               // Opt-in                         │
│    .with_ruvvector(DatabaseConfig { ... }) // Optional                      │
│    .build()?                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Service Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Service Implementation Pattern                        │
└─────────────────────────────────────────────────────────────────────────────┘

All services follow the same structural pattern:

┌─────────────────────────────────────────────────────────────────────────────┐
│                          ServiceImpl Template                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  struct ChatServiceImpl {                                                    │
│      transport: Arc<dyn HttpTransport>,    // Shared HTTP client            │
│      credentials: Arc<dyn CredentialProvider>, // Auth provider             │
│      resilience: Arc<ResilienceOrchestrator>, // Shared resilience          │
│      observability: ObservabilityContext,  // Shared logging/metrics        │
│      base_url: String,                     // https://api.x.ai/v1           │
│  }                                                                           │
│                                                                              │
│  impl ChatService for ChatServiceImpl {                                      │
│      async fn complete(&self, request: GrokChatRequest) -> Result<...> {    │
│          // 1. Create tracing span (shared observability)                   │
│          let span = self.observability.tracer.start_span("grok.chat");      │
│                                                                              │
│          // 2. Get auth header                                              │
│          let auth = self.credentials.get_auth_header("xai").await?;         │
│                                                                              │
│          // 3. Build OpenAI-compatible request                              │
│          let http_request = build_chat_request(                             │
│              base_url: &self.base_url,                                      │
│              request: &request,                                             │
│              auth: auth                                                     │
│          )?;                                                                │
│                                                                              │
│          // 4. Execute with resilience (shared)                             │
│          let response = self.resilience.execute(|| async {                  │
│              self.transport.send(http_request).await                        │
│          }).await?;                                                         │
│                                                                              │
│          // 5. Parse response (extract reasoning_content if present)        │
│          let result = parse_chat_response(response)?;                       │
│                                                                              │
│          // 6. Record metrics (shared observability)                        │
│          self.observability.metrics.record_tokens(...);                     │
│          span.end();                                                        │
│                                                                              │
│          Ok(result)                                                         │
│      }                                                                       │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Model Registry

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Model Registry Design                               │
└─────────────────────────────────────────────────────────────────────────────┘

<<interface>>
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ModelRegistry                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ + resolve(model_hint: &str) -> Result<GrokModel>                            │
│ + list() -> Vec<GrokModelInfo>                                              │
│ + get_capabilities(model: &GrokModel) -> GrokCapabilities                   │
│ + get_context_window(model: &GrokModel) -> Option<u32>                      │
└─────────────────────────────────────────────────────────────────────────────┘

Model Registration:
┌─────────────────────────────────────────────────────────────────────────────┐
│  MODELS = {                                                                  │
│      "grok-4":           GrokModel::Grok4,                                  │
│      "grok-4-latest":    GrokModel::Grok4,        // Alias                  │
│      "grok-4.1":         GrokModel::Grok4_1,                                │
│      "grok-3":           GrokModel::Grok3Beta,    // Alias                  │
│      "grok-3-beta":      GrokModel::Grok3Beta,                              │
│      "grok-3-mini":      GrokModel::Grok3MiniBeta, // Alias                 │
│      "grok-3-mini-beta": GrokModel::Grok3MiniBeta,                          │
│      "grok-2-image":     GrokModel::Grok2Image,   // Alias                  │
│      "grok-2-image-1212":GrokModel::Grok2Image,                             │
│      "grok-vision-beta": GrokModel::GrokVisionBeta,                         │
│  }                                                                           │
│                                                                              │
│  CAPABILITIES = {                                                            │
│      Grok4: { chat: true, streaming: true, tools: true, vision: true,       │
│               reasoning_content: false, live_search: true },                │
│      Grok3Beta: { chat: true, streaming: true, tools: true, vision: false,  │
│                   reasoning_content: true, live_search: true },             │
│      Grok3MiniBeta: { chat: true, streaming: true, tools: true,             │
│                       vision: false, reasoning_content: true,               │
│                       live_search: true },                                  │
│      Grok2Image: { image_generation: true, ... all others false },          │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Data Flow Architecture

### 5.1 Request Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            REQUEST FLOW                                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Application │───►│ GrokClient      │───►│ Chat            │
│ Code        │    │                 │    │ Service         │
└─────────────┘    └─────────────────┘    └────────┬────────┘
                                                   │
                   ┌───────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Request Processing Pipeline                          │
│                                                                              │
│  ┌─────────────────┐                                                        │
│  │ 1. Resolve      │  model_registry.resolve(model_hint)                    │
│  │    Model        │  → GrokModel with capabilities                         │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ 2. Validate     │  Check model supports requested features               │
│  │    Capabilities │  (vision, tools, etc.)                                 │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ 3. Get Auth     │  credentials.get_auth_header("xai").await              │
│  │    Header       │  → ("Authorization", "Bearer {key}")                   │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ 4. Build        │  OpenAI-compatible JSON body                           │
│  │    Request      │  POST https://api.x.ai/v1/chat/completions            │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ 5. Execute with │  resilience.execute(|| transport.send(req)).await      │
│  │    Resilience   │  • Retry on transient errors                           │
│  │                 │  • Circuit breaker per model                            │
│  │                 │  • Rate limiting                                        │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ 6. Parse        │  parse_chat_response(http_response)                    │
│  │    Response     │  • Extract choices                                     │
│  │                 │  • Extract usage (including reasoning_tokens)          │
│  │                 │  • Extract reasoning_content (Grok-3)                  │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ 7. Record       │  metrics.record_request(model, latency, tokens)        │
│  │    Metrics      │  tracer.end_span(span)                                 │
│  └─────────────────┘                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Streaming Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           STREAMING FLOW                                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Application │───►│ ChatService     │───►│ SSE Stream      │
│ Code        │    │ .stream()       │    │ Parser          │
└─────────────┘    └─────────────────┘    └────────┬────────┘
                                                   │
                                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Streaming Pipeline                                   │
│                                                                              │
│  xAI API Server                                                              │
│         │                                                                    │
│         │ SSE: data: {"id":"...","choices":[{"delta":{"content":"Hi"}}]}    │
│         │ SSE: data: {"id":"...","choices":[{"delta":{"content":"!"}}]}     │
│         │ SSE: data: [DONE]                                                  │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────────┐                                                        │
│  │ HTTP Response   │  Content-Type: text/event-stream                       │
│  │ Body Stream     │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ SSE Line        │  Split by "\n\n"                                       │
│  │ Parser          │  Parse "data: {...}" lines                             │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ Chunk           │  Deserialize JSON to ChatChunk                         │
│  │ Deserializer    │  Handle [DONE] sentinel                                │
│  │                 │  Extract reasoning_content delta (Grok-3)              │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ Stream<ChatChunk>│  Yield chunks to caller                               │
│  │ (async iterator)│  Accumulate usage on final chunk                       │
│  └─────────────────┘                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

ChatChunk Structure:
┌─────────────────────────────────────────────────────────────────────────────┐
│  struct ChatChunk {                                                          │
│      id: String,                                                             │
│      object: String,                    // "chat.completion.chunk"           │
│      created: u64,                                                           │
│      model: String,                                                          │
│      choices: Vec<ChunkChoice>,                                              │
│      usage: Option<TokenUsage>,         // On final chunk                    │
│  }                                                                           │
│                                                                              │
│  struct ChunkChoice {                                                        │
│      index: u32,                                                             │
│      delta: ChunkDelta,                 // { role?, content?, tool_calls? }  │
│      finish_reason: Option<String>,                                          │
│      reasoning_content: Option<String>, // Grok-3 specific                   │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Reasoning Content Handling (Grok-3)

### 6.1 Reasoning Content Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REASONING CONTENT HANDLING                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Grok-3 and Grok-3-Mini return a special `reasoning_content` field that     │
│  contains the model's internal reasoning process.                           │
│                                                                              │
│  Response Structure:                                                        │
│  {                                                                          │
│    "choices": [{                                                            │
│      "message": {                                                           │
│        "role": "assistant",                                                 │
│        "content": "The answer is 42.",                                      │
│        "reasoning_content": "Let me think step by step..."                  │
│      },                                                                     │
│      "finish_reason": "stop"                                                │
│    }],                                                                      │
│    "usage": {                                                               │
│      "prompt_tokens": 10,                                                   │
│      "completion_tokens": 50,                                               │
│      "reasoning_tokens": 100,    // Additional metric                       │
│      "total_tokens": 160                                                    │
│    }                                                                        │
│  }                                                                          │
│                                                                              │
│  Unified Response Mapping:                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  UnifiedModelResponse {                                              │    │
│  │      content: "The answer is 42.",                                   │    │
│  │      metadata: {                                                     │    │
│  │          provider_specific: {                                        │    │
│  │              "reasoning_content": "Let me think step by step...",    │    │
│  │              "reasoning_tokens": 100                                 │    │
│  │          }                                                           │    │
│  │      }                                                               │    │
│  │  }                                                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Live Search Integration (Optional)

### 7.1 Live Search Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LIVE SEARCH INTEGRATION                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Live Search is an agentic tool that enables real-time search across:       │
│  • X (Twitter) posts                                                        │
│  • Open web sources                                                         │
│  • Verified databases                                                       │
│                                                                              │
│  Cost: $25 per 1,000 sources retrieved                                      │
│                                                                              │
│  Implementation: Via tools/function calling                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  GrokChatRequest {                                                   │    │
│  │      model: "grok-3-beta",                                          │    │
│  │      messages: [...],                                                │    │
│  │      tools: [{                                                       │    │
│  │          type: "function",                                          │    │
│  │          function: {                                                │    │
│  │              name: "live_search",                                   │    │
│  │              description: "Search X and web for real-time info",    │    │
│  │              parameters: { ... }                                    │    │
│  │          }                                                          │    │
│  │      }],                                                             │    │
│  │      tool_choice: "auto"                                            │    │
│  │  }                                                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Feature Flag: live_search_enabled (default: false)                         │
│  - Opt-in due to cost implications                                         │
│  - Requires explicit configuration                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Module Structure

### 8.1 Rust Crate Organization

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
            │   │   └── capabilities.rs         # GrokCapabilities
            │   │
            │   ├── services/
            │   │   ├── mod.rs
            │   │   ├── chat/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # ChatService implementation
            │   │   │   ├── request.rs          # GrokChatRequest
            │   │   │   ├── response.rs         # GrokChatResponse
            │   │   │   └── stream.rs           # ChatStream
            │   │   ├── embedding/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # EmbeddingService
            │   │   │   └── types.rs            # Request/Response types
            │   │   └── image/
            │   │       ├── mod.rs
            │   │       ├── service.rs          # ImageService
            │   │       └── types.rs            # Request/Response types
            │   │
            │   ├── reasoning/
            │   │   ├── mod.rs
            │   │   └── extractor.rs            # Reasoning content extraction
            │   │
            │   ├── live_search/
            │   │   ├── mod.rs
            │   │   ├── tool.rs                 # Live Search tool definition
            │   │   └── handler.rs              # Response handling
            │   │
            │   ├── adapter/
            │   │   ├── mod.rs
            │   │   ├── model_adapter.rs        # Platform ModelAdapter impl
            │   │   ├── request_convert.rs      # Unified → Grok
            │   │   └── response_convert.rs     # Grok → Unified
            │   │
            │   ├── infra/
            │   │   ├── mod.rs
            │   │   ├── request_builder.rs      # OpenAI-format request building
            │   │   ├── response_parser.rs      # Response parsing
            │   │   └── sse_parser.rs           # SSE stream parsing
            │   │
            │   ├── ruvvector/
            │   │   ├── mod.rs
            │   │   └── embeddings.rs           # Embedding storage
            │   │
            │   ├── error.rs                    # GrokError types
            │   └── types/
            │       ├── mod.rs
            │       ├── message.rs              # ChatMessage types
            │       ├── tool.rs                 # Tool/Function types
            │       └── usage.rs                # TokenUsage types
            │
            └── tests/
                ├── unit/
                │   ├── models/
                │   ├── services/
                │   └── infra/
                ├── integration/
                └── fixtures/
```

### 8.2 Cargo.toml

```toml
[package]
name = "integrations-xai-grok"
version = "0.1.0"
edition = "2021"
description = "xAI Grok Integration Module"

[dependencies]
# Shared modules (REUSE)
integrations-credentials = { path = "../../../shared/credentials" }
integrations-resilience = { path = "../../../shared/resilience" }
integrations-observability = { path = "../../../shared/observability" }
integrations-database = { path = "../../../shared/database", optional = true }

# Third-party dependencies
tokio = { version = "1.0", features = ["rt-multi-thread", "macros", "time"] }
reqwest = { version = "0.12", features = ["json", "stream"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
futures = "0.3"
async-trait = "0.1"
thiserror = "1.0"
tracing = "0.1"

[dev-dependencies]
tokio-test = "0.4"
mockall = "0.12"
wiremock = "0.6"

[features]
default = []
full = ["ruvvector", "live_search"]
ruvvector = ["integrations-database"]
live_search = []
```

### 8.3 TypeScript Package Structure

```
integrations/
└── xai/
    └── grok/
        └── typescript/
            ├── package.json
            ├── tsconfig.json
            ├── src/
            │   ├── index.ts                    # Public API exports
            │   ├── client.ts                   # GrokClient
            │   ├── config.ts                   # Configuration types
            │   │
            │   ├── models/
            │   │   ├── index.ts
            │   │   ├── registry.ts             # ModelRegistry
            │   │   ├── types.ts                # GrokModel types
            │   │   └── capabilities.ts
            │   │
            │   ├── services/
            │   │   ├── index.ts
            │   │   ├── chat/
            │   │   ├── embedding/
            │   │   └── image/
            │   │
            │   ├── reasoning/
            │   │   └── extractor.ts
            │   │
            │   ├── live-search/
            │   │   └── tool.ts
            │   │
            │   ├── adapter/
            │   │   └── model-adapter.ts
            │   │
            │   ├── infra/
            │   │   ├── request-builder.ts
            │   │   ├── response-parser.ts
            │   │   └── sse-parser.ts
            │   │
            │   ├── error.ts
            │   └── types/
            │
            └── tests/
```

---

## 9. Integration Points

### 9.1 Platform Adapter

```rust
impl ModelAdapter for GrokAdapter {
    fn provider_id(&self) -> &'static str {
        "xai-grok"
    }

    fn supported_capabilities(&self) -> Vec<ModelCapability> {
        vec![
            ModelCapability::ChatCompletion,
            ModelCapability::Streaming,
            ModelCapability::FunctionCalling,
            ModelCapability::Vision,
            ModelCapability::Embeddings,
            ModelCapability::ImageGeneration,
        ]
    }

    async fn invoke(
        &self,
        request: UnifiedModelRequest,
    ) -> Result<UnifiedModelResponse, AdapterError> {
        // 1. Resolve model from hint
        let model = self.model_registry.resolve(&request.model_hint)?;

        // 2. Validate capabilities
        let caps = self.model_registry.get_capabilities(&model);
        self.validate_request_capabilities(&request, &caps)?;

        // 3. Convert to Grok format
        let grok_request = self.to_grok_request(request, &model)?;

        // 4. Execute
        let response = self.client.chat().complete(grok_request).await?;

        // 5. Convert to unified format (include reasoning_content in metadata)
        self.to_unified_response(response, &model)
    }
}
```

### 9.2 RuvVector Integration

```rust
impl EmbeddingStorage for GrokEmbeddingStorage {
    async fn store_embedding(
        &self,
        text: &str,
        metadata: EmbeddingMetadata,
    ) -> Result<EmbeddingId, StorageError> {
        // Generate embedding via Grok API
        let embedding = self.client.embeddings().create(EmbeddingRequest {
            model: GrokModel::Grok3Beta,  // Or configured embedding model
            input: text.to_string(),
        }).await?;

        // Store in RuvVector (pgvector)
        self.database.insert_embedding(
            &embedding.data[0].embedding,
            metadata,
        ).await
    }
}
```

---

## 10. Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ERROR HANDLING FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

HTTP Response
      │
      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Error Classifier                                    │
│                                                                              │
│  MATCH status_code {                                                         │
│      400 => ValidationError { parse error body },                           │
│      401 => AuthenticationError { message },                                │
│      403 => PermissionDenied { message },                                   │
│      404 => ModelNotFound { model_id },                                     │
│      429 => RateLimited { parse Retry-After header },                       │
│      498 => CapacityExceeded { message },                                   │
│      500..599 => ServiceError { status, message, retryable: true },         │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Retry Classification:
┌─────────────────────────────────────────────────────────────────────────────┐
│  RateLimited { retry_after } => RetryAfter(duration)                        │
│  CapacityExceeded => RetryAfter(60s)                                        │
│  ServiceError { status >= 500 } => RetryWithBackoff                         │
│  NetworkError => RetryWithBackoff                                           │
│  _ => DoNotRetry                                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Testing Architecture

### 11.1 Test Categories

| Category | Scope | Mock Strategy |
|----------|-------|---------------|
| Unit | Individual components | Mock all dependencies |
| Integration | Service + HTTP | Mock xAI endpoint (WireMock) |
| Contract | API compatibility | Record/replay xAI responses |
| E2E | Full adapter flow | Optional live xAI calls |

### 11.2 Mock Fixtures

```rust
// Model registry fixtures
fn mock_model_registry() -> ModelRegistry;

// Response fixtures
fn mock_grok4_chat_response() -> GrokChatResponse;
fn mock_grok3_response_with_reasoning() -> GrokChatResponse;
fn mock_streaming_chunks() -> Vec<ChatChunk>;
fn mock_rate_limit_response() -> HttpResponse;
fn mock_embedding_response() -> EmbeddingResponse;
fn mock_image_generation_response() -> ImageGenerationResponse;
```

---

## 12. Open Questions Resolution

### From Specification Phase

| Question | Resolution |
|----------|------------|
| Live Search Integration Depth | Optional feature via `live_search` feature flag. Disabled by default due to $25/1K cost. Exposed as tool when enabled. |
| Reasoning Content Handling | Passed through in `metadata.provider_specific.reasoning_content`. Reasoning tokens tracked separately in usage. |
| Vision Input Format | Accept base64-encoded images in message content (OpenAI vision format). Validate on Grok-4 and grok-vision-beta only. |
| Streaming Backpressure | Use bounded channel (capacity: 100 chunks) consistent with Azure OpenAI pattern. |

---

## 13. Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial architecture |

---

**End of Architecture Phase**

*Next Phase: Pseudocode — detailed algorithmic logic for each component.*
