# SPARC Phase 2: Architecture — Azure OpenAI Integration

**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/azure/openai`

---

## 1. Architecture Overview

### 1.1 Executive Summary

The Azure OpenAI Integration Module implements a **thin adapter layer** that:

1. **Translates Azure OpenAI API semantics** (deployments, API versions, resource endpoints) to platform conventions
2. **Reuses shared infrastructure** from existing Azure integrations (`azure/credentials`)
3. **Delegates resilience** to shared primitives (`shared/resilience`)
4. **Integrates with RuvVector** for embeddings and state persistence
5. **Handles Azure-specific concerns** (content filtering, deployment routing) without embedding infrastructure logic

### 1.2 Key Architectural Decisions

| Decision | Rationale | Trade-offs |
|----------|-----------|------------|
| **Thin adapter layer** | Minimize duplication, leverage shared infra | Limited Azure-specific customization |
| **Deployment-based routing** | Azure uses deployments, not model IDs | Requires deployment registry |
| **Dual auth support** | API Key + Azure AD for enterprise | Additional complexity |
| **Per-deployment circuit breakers** | Isolate failures by deployment | Memory overhead |
| **API version pinning** | Azure requires explicit versions | Must track version compatibility |
| **Content filter passthrough** | Report but don't process filters | Caller handles policy |

### 1.3 Architecture Constraints

| Constraint | Source | Impact |
|------------|--------|--------|
| Thin adapter only | Design principle | No duplicate logic from shared modules |
| No Azure SDK | Forbidden dependency policy | Custom HTTP client, credential handling |
| Deployment abstraction | Azure OpenAI model | Must map deployments to capabilities |
| API version required | Azure OpenAI API | Every request needs `api-version` param |
| Rust + TypeScript | Multi-language support | Maintain API parity |

### 1.4 Azure OpenAI-Specific Considerations

| Consideration | Description |
|---------------|-------------|
| **Endpoint format** | `https://{resource}.openai.azure.com/openai/deployments/{deployment}/{op}?api-version={ver}` |
| **Deployment model** | Models accessed via deployment names, not model IDs |
| **API versions** | Required query param, different features per version |
| **Content filtering** | Azure AI Content Safety integrated, results in responses |
| **Regional availability** | Different models available in different Azure regions |
| **Authentication** | API Key header (`api-key`) or Azure AD Bearer token |

---

## 2. Design Principles

### 2.1 Thin Adapter Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         THIN ADAPTER PRINCIPLE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Azure OpenAI Module                Shared Modules                           │
│  ┌──────────────────────┐          ┌──────────────────────┐                 │
│  │ AzureOpenAIClient    │          │ azure/credentials    │                 │
│  │                      │─────────►│ (reuse)              │                 │
│  │ • ChatService        │          └──────────────────────┘                 │
│  │ • EmbeddingService   │          ┌──────────────────────┐                 │
│  │ • DeploymentRegistry │─────────►│ shared/resilience    │                 │
│  └──────────────────────┘          │ (reuse)              │                 │
│           │                        └──────────────────────┘                 │
│           │                        ┌──────────────────────┐                 │
│           └───────────────────────►│ shared/observability │                 │
│                                    │ (reuse)              │                 │
│                                    └──────────────────────┘                 │
│                                    ┌──────────────────────┐                 │
│                                    │ shared/database      │                 │
│                                    │ (RuvVector)          │                 │
│                                    └──────────────────────┘                 │
│                                                                              │
│  AZURE OPENAI MODULE OWNS:         SHARED MODULES OWN:                      │
│  • Deployment routing              • Azure AD token acquisition             │
│  • API version management          • API key retrieval                      │
│  • Request URL construction        • Retry logic                            │
│  • Response normalization          • Circuit breaker                        │
│  • Content filter extraction       • Rate limiting                          │
│  • Streaming chunk parsing         • Logging/metrics/tracing                │
│                                    • Database connectivity                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Deployment-Based Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DEPLOYMENT-BASED ROUTING                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                        Platform Request                                      │
│                    ┌────────────────────┐                                   │
│                    │ UnifiedModelRequest │                                   │
│                    │ model_hint: "gpt-4" │                                   │
│                    └─────────┬──────────┘                                   │
│                              │                                               │
│                              ▼                                               │
│                    ┌────────────────────┐                                   │
│                    │ DeploymentRegistry │                                   │
│                    │                    │                                   │
│                    │ resolve("gpt-4")   │                                   │
│                    └─────────┬──────────┘                                   │
│                              │                                               │
│         ┌────────────────────┼────────────────────┐                         │
│         │                    │                    │                         │
│         ▼                    ▼                    ▼                         │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │ Deployment  │     │ Deployment  │     │ Deployment  │                   │
│  │ "gpt4-prod" │     │ "gpt4-dev"  │     │ "gpt4o-exp" │                   │
│  │             │     │             │     │             │                   │
│  │ resource:   │     │ resource:   │     │ resource:   │                   │
│  │ myorg-eastus│     │ myorg-west  │     │ myorg-eastus│                   │
│  │ region:     │     │ region:     │     │ region:     │                   │
│  │ eastus      │     │ westus2     │     │ eastus      │                   │
│  │ api_version:│     │ api_version:│     │ api_version:│                   │
│  │ 2024-06-01  │     │ 2024-06-01  │     │ 2024-08-01  │                   │
│  └─────────────┘     └─────────────┘     └─────────────┘                   │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │ https://myorg-eastus.openai.azure.com/openai/deployments/    │           │
│  │        gpt4-prod/chat/completions?api-version=2024-06-01     │           │
│  └──────────────────────────────────────────────────────────────┘           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Dependency Inversion (Shared Infrastructure)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DEPENDENCY INVERSION PRINCIPLE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  High-level: AzureOpenAIClientImpl                                          │
│       ↓ depends on abstraction                                              │
│  Interface: HttpTransport trait (from shared)                               │
│       ↑ implements                                                          │
│  Low-level: ReqwestHttpTransport                                            │
│                                                                              │
│  High-level: AzureOpenAIClientImpl                                          │
│       ↓ depends on abstraction                                              │
│  Interface: AzureCredentialProvider trait (from azure/credentials)          │
│       ↑ implements                                                          │
│  Low-level: ApiKeyProvider | AzureAdTokenProvider | ManagedIdentityProvider │
│                                                                              │
│  High-level: AzureOpenAIClientImpl                                          │
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
                        │  Uses Azure OpenAI module │
                        │  to invoke GPT-4, GPT-4o, │
                        │  embeddings via Azure     │
                        └─────────────┬─────────────┘
                                      │
                                      │ Uses
                                      ▼
┌───────────────────┐    ┌───────────────────────────┐    ┌───────────────────┐
│                   │    │                           │    │                   │
│  Shared Azure     │◄───│  Azure OpenAI Integration │───►│  Azure OpenAI     │
│  Modules          │    │  Module                   │    │  Service          │
│                   │    │                           │    │                   │
│ • azure/credentials    │  Thin adapter providing   │    │ {resource}.openai │
│                   │    │  unified access to:       │    │  .azure.com       │
│                   │    │  • GPT-4, GPT-4o          │    │                   │
│                   │    │  • GPT-3.5-Turbo          │    │ • /chat/completions
│                   │    │  • Embeddings             │    │ • /embeddings     │
│                   │    │  • DALL-E, Whisper        │    │ • /images         │
│                   │    │                           │    │ • /audio          │
└───────────────────┘    └───────────────────────────┘    └───────────────────┘
         │                            │
         │                            │ Uses
         │                            ▼
         │               ┌───────────────────────────┐
         │               │   Shared Infrastructure   │
         │               │                           │
         └──────────────►│  • shared/resilience     │
                         │  • shared/observability   │
                         │  • shared/database        │
                         │    (RuvVector)            │
                         └───────────────────────────┘
```

### 3.2 Container Diagram (Level 2)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CONTAINER DIAGRAM                               │
│                       Azure OpenAI Integration Module                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        Azure OpenAI Integration Module                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                          Public API Container                        │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ AzureOpenAI  │  │ Deployment   │  │ Model        │             │    │
│  │   │ Client       │  │ Registry     │  │ Adapter      │             │    │
│  │   │ Factory      │  │              │  │ (Platform)   │             │    │
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
│  │   │ • stream     │  │ • batch      │  │              │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐                               │    │
│  │   │ Audio        │  │ Content      │                               │    │
│  │   │ Service      │  │ Filter       │                               │    │
│  │   │              │  │ Handler      │                               │    │
│  │   │ • transcribe │  │              │                               │    │
│  │   │ • translate  │  │ • extract    │                               │    │
│  │   └──────────────┘  │ • report     │                               │    │
│  │                     └──────────────┘                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Infrastructure Container                          │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ URL          │  │ Request      │  │ Response     │             │    │
│  │   │ Builder      │  │ Signer       │  │ Parser       │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐                               │    │
│  │   │ SSE Stream   │  │ Error        │                               │    │
│  │   │ Parser       │  │ Mapper       │                               │    │
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
│  azure/credentials   │  │  shared/resilience   │  │ shared/observability │
│  (reuse)             │  │  (reuse)             │  │ (reuse)              │
│                      │  │                      │  │                      │
│ • ApiKeyProvider     │  │ • RetryExecutor      │  │ • Tracer             │
│ • AzureAdProvider    │  │ • CircuitBreaker     │  │ • MetricsRecorder    │
│ • ManagedIdentity    │  │ • RateLimiter        │  │ • Logger             │
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘
```

### 3.3 Component Diagram (Level 3)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          COMPONENT ARCHITECTURE                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          AzureOpenAIClientImpl                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Service Registry                               │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │  │
│  │  │   Chat      │ │  Embedding  │ │   Image     │ │   Audio     │     │  │
│  │  │   Service   │ │  Service    │ │   Service   │ │   Service   │     │  │
│  │  │             │ │             │ │             │ │             │     │  │
│  │  │ • complete  │ │ • create    │ │ • generate  │ │ • transcribe│     │  │
│  │  │ • stream    │ │             │ │             │ │ • translate │     │  │
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
│  │  │   Deployment    │  │   URL           │  │   Auth          │        │  │
│  │  │   Registry      │  │   Builder       │  │   Provider      │        │  │
│  │  │   (config)      │  │   (azure fmt)   │  │   (delegated)   │        │  │
│  │  │                 │  │                 │  │                 │        │  │
│  │  │ • resolve()     │  │ • build()       │  │ • get_header()  │        │  │
│  │  │ • list()        │  │ • with_version()│  │ • refresh()     │        │  │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘        │  │
│  │           │                    │                    │                  │  │
│  └───────────┼────────────────────┼────────────────────┼──────────────────┘  │
│              │                    │                    │                     │
└──────────────┼────────────────────┼────────────────────┼─────────────────────┘
               │                    │                    │
               ▼                    ▼                    ▼
┌──────────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Configuration        │ │ shared/http      │ │ azure/credentials│
│ (YAML/Env)           │ │ (transport)      │ │ (auth provider)  │
└──────────────────────┘ └──────────────────┘ └──────────────────┘
```

---

## 4. Component Architecture

### 4.1 Client Component

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AzureOpenAIClient Component                           │
└─────────────────────────────────────────────────────────────────────────────┘

                           <<interface>>
                    ┌──────────────────────┐
                    │  AzureOpenAIClient   │
                    ├──────────────────────┤
                    │ + chat()             │───► ChatService
                    │ + embeddings()       │───► EmbeddingService
                    │ + images()           │───► ImageService
                    │ + audio()            │───► AudioService
                    │ + deployments()      │───► DeploymentRegistry
                    │ + config()           │───► AzureOpenAIConfig
                    └──────────┬───────────┘
                               △
                               │ implements
                               │
                    ┌──────────┴───────────┐
                    │ AzureOpenAIClientImpl│
                    ├──────────────────────┤
                    │ - config             │
                    │ - transport          │◇───► Arc<dyn HttpTransport>
                    │ - credentials        │◇───► Arc<dyn AzureCredentialProvider>
                    │ - resilience         │◇───► Arc<ResilienceOrchestrator>
                    │ - observability      │◇───► ObservabilityContext
                    │ - deployment_registry│◇───► DeploymentRegistry
                    │ - chat_service       │◇───┐
                    │ - embedding_service  │◇───┤  lazy init
                    │ - image_service      │◇───┤  (OnceCell)
                    │ - audio_service      │◇───┘
                    │ - ruvvector          │◇───► Option<DatabaseConfig>
                    └──────────────────────┘

Builder Pattern:
┌─────────────────────────────────────────────────────────────────────────────┐
│  AzureOpenAIClient::builder()                                                │
│    .resource_name("myorg-openai")                                            │
│    .default_api_version(ApiVersion::V2024_06_01)                            │
│    .credential_provider(AzureAdTokenProvider::from_env()?)                   │
│    .timeout(Duration::from_secs(120))                                        │
│    .with_resilience(ResilienceConfig { ... })                                │
│    .with_deployments(vec![...])         // Or load from config              │
│    .with_ruvvector(DatabaseConfig { ... })  // Optional                      │
│    .build()?                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Service Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Service Implementation Pattern                      │
└─────────────────────────────────────────────────────────────────────────────┘

All services follow the same structural pattern:

┌─────────────────────────────────────────────────────────────────────────────┐
│                        ServiceImpl Template                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  struct ChatServiceImpl {                                                    │
│      transport: Arc<dyn HttpTransport>,    // Shared HTTP client            │
│      credentials: Arc<dyn AzureCredentialProvider>, // Auth provider        │
│      resilience: Arc<ResilienceOrchestrator>, // Shared resilience          │
│      observability: ObservabilityContext,  // Shared logging/metrics        │
│      deployment_registry: Arc<DeploymentRegistry>, // Deployment lookup     │
│  }                                                                           │
│                                                                              │
│  impl ChatService for ChatServiceImpl {                                      │
│      async fn complete(&self, request: ChatRequest) -> Result<ChatResponse> {│
│          // 1. Create tracing span (shared observability)                   │
│          let span = self.observability.tracer.start_span("azure_openai.chat");│
│                                                                              │
│          // 2. Resolve deployment                                           │
│          let deployment = self.deployment_registry                          │
│              .resolve(&request.deployment_id)?;                             │
│                                                                              │
│          // 3. Build Azure-specific URL                                     │
│          let url = UrlBuilder::new(&deployment)                             │
│              .operation("chat/completions")                                 │
│              .build();                                                      │
│                                                                              │
│          // 4. Get auth header                                              │
│          let auth_header = self.credentials.get_auth_header().await?;       │
│                                                                              │
│          // 5. Build HTTP request                                           │
│          let http_request = HttpRequest::post(url)                          │
│              .header(auth_header)                                           │
│              .header("Content-Type", "application/json")                    │
│              .json(&request)?;                                              │
│                                                                              │
│          // 6. Execute with resilience (shared)                             │
│          let response = self.resilience.execute(|| async {                  │
│              self.transport.send(http_request.clone()).await                │
│          }).await?;                                                         │
│                                                                              │
│          // 7. Parse response and extract content filter results            │
│          let result = parse_chat_response(response)?;                       │
│                                                                              │
│          // 8. Record metrics (shared observability)                        │
│          self.observability.metrics.record_tokens(                          │
│              deployment.deployment_id,                                      │
│              result.usage.prompt_tokens,                                    │
│              result.usage.completion_tokens                                 │
│          );                                                                 │
│          span.end();                                                        │
│                                                                              │
│          Ok(result)                                                         │
│      }                                                                       │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Deployment Registry

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Deployment Registry Design                            │
└─────────────────────────────────────────────────────────────────────────────┘

<<interface>>
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DeploymentRegistry                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ + resolve(deployment_id: &str) -> Result<AzureDeployment>                   │
│ + resolve_by_model(model_hint: &str) -> Result<AzureDeployment>             │
│ + list() -> Vec<AzureDeployment>                                            │
│ + list_by_capability(cap: ModelCapability) -> Vec<AzureDeployment>          │
│ + register(deployment: AzureDeployment) -> Result<()>                       │
│ + remove(deployment_id: &str) -> Result<()>                                 │
└─────────────────────────────────────────────────────────────────────────────┘

Configuration Sources:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  1. Static Configuration (YAML)                                             │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │ azure_openai:                                                    │     │
│     │   deployments:                                                   │     │
│     │     - deployment_id: "gpt4-production"                          │     │
│     │       resource_name: "myorg-openai-eastus"                      │     │
│     │       region: "eastus"                                           │     │
│     │       api_version: "2024-06-01"                                  │     │
│     │       model_family: "gpt4"                                       │     │
│     │       capabilities: [chat, function_calling, vision]             │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  2. Environment Variables                                                    │
│     AZURE_OPENAI_DEPLOYMENT_GPT4=gpt4-production                            │
│     AZURE_OPENAI_RESOURCE_NAME=myorg-openai-eastus                          │
│                                                                              │
│  3. Runtime Registration (for dynamic scenarios)                            │
│     registry.register(AzureDeployment { ... })                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Resolution Strategy:
┌─────────────────────────────────────────────────────────────────────────────┐
│  resolve_by_model("gpt-4") → looks up deployments with model_family: GPT4   │
│  resolve_by_model("gpt-4o") → looks up deployments with model_family: GPT4o │
│                                                                              │
│  Priority: exact deployment_id match > model_family match > capability match │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 URL Builder

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            URL Builder Design                                │
└─────────────────────────────────────────────────────────────────────────────┘

Azure OpenAI URL Format:
https://{resource-name}.openai.azure.com/openai/deployments/{deployment-id}/{operation}?api-version={version}

┌─────────────────────────────────────────────────────────────────────────────┐
│                              UrlBuilder                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ + new(deployment: &AzureDeployment) -> Self                                 │
│ + operation(op: &str) -> Self         // chat/completions, embeddings, etc. │
│ + api_version(ver: ApiVersion) -> Self // Override deployment default       │
│ + query_param(key: &str, val: &str) -> Self                                 │
│ + build() -> String                                                         │
└─────────────────────────────────────────────────────────────────────────────┘

Usage:
┌─────────────────────────────────────────────────────────────────────────────┐
│  let url = UrlBuilder::new(&deployment)                                      │
│      .operation("chat/completions")                                          │
│      .build();                                                               │
│                                                                              │
│  // Result: https://myorg-eastus.openai.azure.com/openai/deployments/        │
│  //         gpt4-prod/chat/completions?api-version=2024-06-01                │
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
│ Application │───►│ AzureOpenAI     │───►│ Chat            │
│ Code        │    │ Client          │    │ Service         │
└─────────────┘    └─────────────────┘    └────────┬────────┘
                                                   │
                   ┌───────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Request Processing Pipeline                          │
│                                                                              │
│  ┌─────────────────┐                                                        │
│  │ 1. Resolve      │  deployment_registry.resolve(deployment_id)            │
│  │    Deployment   │  → AzureDeployment { resource, region, api_version }   │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ 2. Build URL    │  UrlBuilder::new(&deployment)                          │
│  │                 │    .operation("chat/completions")                      │
│  │                 │    .build()                                            │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ 3. Get Auth     │  credentials.get_auth_header().await                   │
│  │    Header       │  → ("api-key", "xxx") or ("Authorization", "Bearer xxx")│
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ 4. Create       │  HttpRequest::post(url)                                │
│  │    Request      │    .header(auth_header)                                │
│  │                 │    .json(&chat_request)                                │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ 5. Execute with │  resilience.execute(|| transport.send(req)).await      │
│  │    Resilience   │  • Retry on transient errors                           │
│  │                 │  • Circuit breaker per deployment                       │
│  │                 │  • Rate limiting                                        │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ 6. Parse        │  parse_chat_response(http_response)                    │
│  │    Response     │  • Extract content                                     │
│  │                 │  • Extract usage                                        │
│  │                 │  • Extract content_filter_results                       │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ 7. Record       │  metrics.record_request(deployment, latency, tokens)   │
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
│  Azure OpenAI Server                                                         │
│         │                                                                    │
│         │ SSE: data: {"id":"...","choices":[{"delta":{"content":"Hello"}}]}  │
│         │ SSE: data: {"id":"...","choices":[{"delta":{"content":" world"}}]} │
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
│      usage: Option<TokenUsage>,         // Only on final chunk               │
│      prompt_filter_results: Option<Vec<ContentFilterResult>>,                │
│  }                                                                           │
│                                                                              │
│  struct ChunkChoice {                                                        │
│      index: u32,                                                             │
│      delta: ChunkDelta,                 // { role?, content?, tool_calls? }  │
│      finish_reason: Option<String>,     // null until final chunk            │
│      content_filter_results: Option<ContentFilterCategories>,                │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Authentication Flow

### 6.1 API Key Authentication

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        API KEY AUTHENTICATION                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ AzureOpenAI     │───►│ ApiKey          │───►│ azure/credentials│
│ Service         │    │ Provider        │    │ (key store)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘

Flow:
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. Service calls: credentials.get_auth_header(resource_name).await         │
│                                                                              │
│  2. ApiKeyProvider looks up key:                                            │
│     • Environment: AZURE_OPENAI_API_KEY_{RESOURCE_NAME}                     │
│     • Config file: azure_openai.resources.{name}.api_key                    │
│     • Azure Key Vault (optional): keyvault.get_secret("aoai-key-{name}")    │
│                                                                              │
│  3. Returns: ("api-key", "sk-...")                                          │
│                                                                              │
│  4. Request includes header:                                                 │
│     api-key: sk-...                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Azure AD Authentication

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       AZURE AD AUTHENTICATION                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ AzureOpenAI     │───►│ AzureAd         │───►│ Azure AD        │
│ Service         │    │ TokenProvider   │    │ (Entra ID)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘

Flow:
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. Service calls: credentials.get_auth_header().await                      │
│                                                                              │
│  2. AzureAdTokenProvider:                                                   │
│     IF cached_token is valid (not expired - 5min buffer):                   │
│         RETURN ("Authorization", "Bearer " + cached_token)                  │
│     ELSE:                                                                   │
│         token = acquire_token()                                             │
│         cache_token(token)                                                  │
│         RETURN ("Authorization", "Bearer " + token.access_token)            │
│                                                                              │
│  3. acquire_token() options:                                                │
│     • Service Principal: client_credentials flow                            │
│       POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token    │
│       scope=https://cognitiveservices.azure.com/.default                   │
│                                                                              │
│     • Managed Identity: IMDS endpoint                                       │
│       GET http://169.254.169.254/metadata/identity/oauth2/token            │
│       resource=https://cognitiveservices.azure.com                         │
│                                                                              │
│     • Azure CLI: az account get-access-token                               │
│       (for local development)                                               │
│                                                                              │
│  4. Request includes header:                                                 │
│     Authorization: Bearer eyJ0eXAi...                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Error Handling Architecture

### 7.1 Error Classification

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ERROR CLASSIFICATION                                 │
└─────────────────────────────────────────────────────────────────────────────┘

HTTP Response
      │
      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Error Classifier                                    │
│                                                                              │
│  MATCH status_code {                                                         │
│      400 => {                                                                │
│          MATCH error.code {                                                  │
│              "content_filter" => ContentFiltered { ... }                    │
│              "context_length_exceeded" => ContextLengthExceeded { ... }     │
│              _ => ValidationError { ... }                                   │
│          }                                                                   │
│      }                                                                       │
│      401 => AuthenticationError { retry_with_refresh: true }                │
│      403 => AuthorizationError { ... }                                      │
│      404 => DeploymentNotFound { ... }                                      │
│      429 => {                                                                │
│          retry_after = parse_retry_after_header()                           │
│          RateLimited { retry_after_ms }                                     │
│      }                                                                       │
│      500..599 => ServiceError { status_code, message, retryable: true }     │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Retry Classification

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RETRY CLASSIFICATION                                 │
└─────────────────────────────────────────────────────────────────────────────┘

impl RetryClassifier for AzureOpenAIError {
    fn classify(&self) -> RetryDecision {
        match self {
            // Rate limited: use Retry-After header
            RateLimited { retry_after_ms } =>
                RetryDecision::RetryAfter(Duration::from_millis(*retry_after_ms))

            // Auth errors: refresh token and retry once
            AuthenticationError { retry_with_refresh: true } =>
                RetryDecision::RefreshAndRetry

            // Server errors: exponential backoff
            ServiceError { status_code, .. } if *status_code >= 500 =>
                RetryDecision::RetryWithBackoff

            // Network errors: retry with backoff
            NetworkError(_) =>
                RetryDecision::RetryWithBackoff

            // All other errors: do not retry
            _ => RetryDecision::DoNotRetry
        }
    }
}

Retry Policy:
┌─────────────────────────────────────────────────────────────────────────────┐
│  RetryConfig {                                                               │
│      max_attempts: 3,                                                        │
│      initial_backoff: Duration::from_millis(500),                           │
│      max_backoff: Duration::from_secs(30),                                  │
│      backoff_multiplier: 2.0,                                               │
│      jitter: 0.1,  // 10% jitter                                            │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Module Structure

### 8.1 Rust Crate Organization

```
integrations/
├── azure/
│   ├── openai/                          # Azure OpenAI Integration Module
│   │   ├── rust/
│   │   │   ├── Cargo.toml
│   │   │   └── src/
│   │   │       ├── lib.rs               # Crate root, re-exports
│   │   │       │
│   │   │       ├── client/
│   │   │       │   ├── mod.rs
│   │   │       │   ├── config.rs        # AzureOpenAIConfig
│   │   │       │   ├── factory.rs       # Client factory
│   │   │       │   └── client_impl.rs   # AzureOpenAIClientImpl
│   │   │       │
│   │   │       ├── services/
│   │   │       │   ├── mod.rs
│   │   │       │   ├── chat/
│   │   │       │   │   ├── mod.rs
│   │   │       │   │   ├── service.rs   # ChatServiceImpl
│   │   │       │   │   ├── types.rs     # Request/Response types
│   │   │       │   │   └── stream.rs    # ChatStream
│   │   │       │   │
│   │   │       │   ├── embedding/
│   │   │       │   │   ├── mod.rs
│   │   │       │   │   ├── service.rs   # EmbeddingServiceImpl
│   │   │       │   │   └── types.rs
│   │   │       │   │
│   │   │       │   ├── image/
│   │   │       │   │   ├── mod.rs
│   │   │       │   │   ├── service.rs   # ImageServiceImpl
│   │   │       │   │   └── types.rs
│   │   │       │   │
│   │   │       │   └── audio/
│   │   │       │       ├── mod.rs
│   │   │       │       ├── service.rs   # AudioServiceImpl
│   │   │       │       └── types.rs
│   │   │       │
│   │   │       ├── deployment/
│   │   │       │   ├── mod.rs
│   │   │       │   ├── registry.rs      # DeploymentRegistry
│   │   │       │   └── types.rs         # AzureDeployment, ApiVersion
│   │   │       │
│   │   │       ├── adapter/
│   │   │       │   ├── mod.rs
│   │   │       │   └── model_adapter.rs # Platform ModelAdapter impl
│   │   │       │
│   │   │       ├── infra/
│   │   │       │   ├── mod.rs
│   │   │       │   ├── url_builder.rs   # Azure URL construction
│   │   │       │   ├── sse_parser.rs    # SSE stream parsing
│   │   │       │   └── content_filter.rs # Content filter extraction
│   │   │       │
│   │   │       ├── errors/
│   │   │       │   ├── mod.rs
│   │   │       │   ├── error.rs         # AzureOpenAIError enum
│   │   │       │   └── mapping.rs       # HTTP to error mapping
│   │   │       │
│   │   │       ├── ruvvector/
│   │   │       │   ├── mod.rs
│   │   │       │   ├── embeddings.rs    # Store/retrieve embeddings
│   │   │       │   └── state.rs         # Conversation state
│   │   │       │
│   │   │       └── types/
│   │   │           ├── mod.rs
│   │   │           └── common.rs        # ModelFamily, UsageInfo
│   │   │
│   │   ├── typescript/                  # TypeScript implementation
│   │   │   ├── package.json
│   │   │   └── src/
│   │   │       └── ...                  # Mirror Rust structure
│   │   │
│   │   └── tests/
│   │       └── fixtures/                # Shared test fixtures
│   │
│   └── credentials/                     # SHARED - Azure credential chain
│
├── shared/
│   ├── resilience/                      # SHARED - retry, CB, rate limit
│   ├── observability/                   # SHARED - logging, metrics, tracing
│   └── database/                        # SHARED - RuvVector connectivity
│
└── plans/
    └── azure-openai/                    # SPARC documentation
        ├── specification-azure-openai.md
        └── architecture-azure-openai.md
```

### 8.2 Cargo.toml

```toml
[package]
name = "integrations-azure-openai"
version = "0.1.0"
edition = "2021"
description = "Azure OpenAI Integration Module"

[dependencies]
# Shared Azure modules (REUSE)
integrations-azure-credentials = { path = "../../credentials" }

# Shared infrastructure (REUSE)
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
full = ["ruvvector"]
ruvvector = ["integrations-database"]
```

### 8.3 TypeScript Package Structure

```
azure/openai/typescript/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 # Package entry
│   ├── client/
│   │   ├── index.ts
│   │   ├── config.ts
│   │   ├── factory.ts
│   │   └── client-impl.ts
│   │
│   ├── services/
│   │   ├── index.ts
│   │   ├── chat/
│   │   ├── embedding/
│   │   ├── image/
│   │   └── audio/
│   │
│   ├── deployment/
│   │   ├── index.ts
│   │   ├── registry.ts
│   │   └── types.ts
│   │
│   ├── adapter/
│   │   └── model-adapter.ts
│   │
│   ├── infra/
│   │   ├── url-builder.ts
│   │   ├── sse-parser.ts
│   │   └── content-filter.ts
│   │
│   ├── errors/
│   │   ├── index.ts
│   │   └── error.ts
│   │
│   └── types/
│       └── common.ts
│
└── tests/
    ├── unit/
    └── integration/
```

---

## 9. Integration Points

### 9.1 Platform Adapter

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PLATFORM ADAPTER                                      │
└─────────────────────────────────────────────────────────────────────────────┘

impl ModelAdapter for AzureOpenAIAdapter {
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
            ModelCapability::ImageGeneration,
            ModelCapability::AudioTranscription,
        ]
    }

    async fn invoke(
        &self,
        request: UnifiedModelRequest,
    ) -> Result<UnifiedModelResponse, AdapterError> {
        // 1. Resolve deployment from model hint
        let deployment = self.deployment_registry
            .resolve_by_model(&request.model_hint)?;

        // 2. Convert to Azure format
        let azure_request = self.to_azure_request(request)?;

        // 3. Execute via appropriate service
        let response = match azure_request {
            AzureRequest::Chat(req) => {
                self.client.chat().complete(req).await?
            }
            AzureRequest::Embedding(req) => {
                self.client.embeddings().create(req).await?
            }
            // ...
        };

        // 4. Convert to unified format
        self.to_unified_response(response)
    }
}
```

### 9.2 RuvVector Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RUVVECTOR INTEGRATION                                 │
└─────────────────────────────────────────────────────────────────────────────┘

// Store embeddings from Azure OpenAI in RuvVector
impl EmbeddingStorage for AzureOpenAIRuvVector {
    async fn store_embedding(
        &self,
        text: &str,
        metadata: EmbeddingMetadata,
    ) -> Result<EmbeddingId, StorageError> {
        // 1. Generate embedding via Azure OpenAI
        let embedding = self.client.embeddings().create(EmbeddingRequest {
            deployment_id: self.embedding_deployment.clone(),
            input: text.to_string(),
        }).await?;

        // 2. Store in RuvVector (pgvector)
        let id = self.database.insert_embedding(
            &embedding.data[0].embedding,
            metadata,
        ).await?;

        Ok(id)
    }

    async fn search_similar(
        &self,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SimilarityResult>, StorageError> {
        // 1. Generate query embedding
        let query_embedding = self.client.embeddings().create(EmbeddingRequest {
            deployment_id: self.embedding_deployment.clone(),
            input: query.to_string(),
        }).await?;

        // 2. Search RuvVector
        self.database.search_nearest(
            &query_embedding.data[0].embedding,
            limit,
        ).await
    }
}
```

---

## 10. Testing Architecture

### 10.1 Test Categories

| Category | Scope | Mock Strategy |
|----------|-------|---------------|
| Unit | Individual components | Mock all dependencies |
| Integration | Service + Infra | Mock Azure endpoint (WireMock) |
| Contract | API compatibility | Record/replay Azure responses |
| E2E | Full adapter flow | Optional live Azure calls |

### 10.2 Mock Fixtures

```rust
// Mock deployment registry
fn mock_deployment_registry() -> DeploymentRegistry {
    DeploymentRegistry::new(vec![
        AzureDeployment {
            deployment_id: "gpt4-test".to_string(),
            resource_name: "test-resource".to_string(),
            region: AzureRegion::EastUS,
            api_version: ApiVersion::V2024_06_01,
            model_family: ModelFamily::GPT4,
            capabilities: vec![ModelCapability::ChatCompletion],
        },
    ])
}

// Mock Azure API responses
fn mock_chat_response() -> ChatResponse { ... }
fn mock_rate_limit_response() -> HttpResponse { ... }
fn mock_content_filter_response() -> ChatResponse { ... }
fn mock_streaming_chunks() -> Vec<&'static str> { ... }

// Mock credential provider
fn mock_api_key_provider() -> impl AzureCredentialProvider { ... }
fn mock_azure_ad_provider() -> impl AzureCredentialProvider { ... }
```

### 10.3 Integration Test Setup

```rust
#[tokio::test]
async fn test_chat_completion() {
    // 1. Start mock server
    let mock_server = MockServer::start().await;

    // 2. Register mock response
    Mock::given(method("POST"))
        .and(path_regex(r"/openai/deployments/.*/chat/completions"))
        .respond_with(ResponseTemplate::new(200)
            .set_body_json(mock_chat_response()))
        .mount(&mock_server)
        .await;

    // 3. Create client with mock endpoint
    let client = AzureOpenAIClient::builder()
        .base_url(mock_server.uri())
        .credential_provider(mock_api_key_provider())
        .build()
        .unwrap();

    // 4. Execute request
    let response = client.chat().complete(ChatRequest {
        deployment_id: "gpt4-test".to_string(),
        messages: vec![...],
        ..Default::default()
    }).await.unwrap();

    // 5. Assert response
    assert_eq!(response.choices[0].message.content, "Hello!");
}
```

---

## 11. Open Questions Resolution

### From Specification Phase

| Question | Resolution |
|----------|------------|
| Multi-region failover | Delegate to `shared/resilience`. Deployment registry can include backup deployments per model family. Circuit breaker isolation per deployment enables automatic failover. |
| Deployment discovery | Static configuration via YAML/env vars. Runtime registration supported but not Azure Management API integration (out of scope for thin adapter). |
| Azure OpenAI on Your Data | P2 priority. Interface defined but implementation deferred. Data source configuration passed through to Azure API without processing. |
| Streaming backpressure | Use bounded channel (capacity: 100 chunks). If consumer is slow, apply backpressure to HTTP stream read. |

---

## 12. Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial architecture |

---

**End of Architecture Phase**

*Next Phase: Pseudocode — detailed algorithmic logic for each component.*
