# AWS Bedrock Integration Module - Architecture (Part 1)

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/aws/bedrock`
**Part:** 1 of 2 - System Design & Component Architecture

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Design Principles](#2-design-principles)
3. [C4 Model Diagrams](#3-c4-model-diagrams)
4. [Component Architecture](#4-component-architecture)
5. [Model Family Services Design](#5-model-family-services-design)
6. [Module Structure](#6-module-structure)
7. [Rust Crate Organization](#7-rust-crate-organization)
8. [TypeScript Package Organization](#8-typescript-package-organization)

---

## 1. Architecture Overview

### 1.1 Executive Summary

The AWS Bedrock Integration Module implements a **thin adapter layer** architecture that:

1. **Unifies access** to multiple model families (Amazon Titan, Anthropic Claude, Meta LLaMA) through a consistent interface
2. **Reuses shared infrastructure** from existing AWS integrations (`aws/credentials`, `aws/signing`)
3. **Delegates resilience** to shared primitives (`shared/resilience`)
4. **Integrates with RuvVector** for embeddings and state persistence

### 1.2 Key Architectural Decisions

| Decision | Rationale | Trade-offs |
|----------|-----------|------------|
| **Thin adapter layer** | Minimize code duplication, leverage existing infra | Limited customization per model |
| **Model family services** | Clear API per family (Titan/Claude/LLaMA) | Three separate service interfaces |
| **Unified invoke interface** | Model-agnostic operations | Request/response translation overhead |
| **Shared credential chain** | Reuse from aws/ses, aws/s3 | Coupled to AWS credential patterns |
| **AWS Event Stream parsing** | Bedrock uses event stream, not SSE | Different from Anthropic direct API |
| **RuvVector for state** | Centralized vector storage | Optional dependency |

### 1.3 Architecture Constraints

| Constraint | Source | Impact |
|------------|--------|--------|
| Thin adapter only | Design principle | No duplicate logic from shared modules |
| Shared AWS credentials | Reuse from aws/ses | Must use same credential chain pattern |
| Model family isolation | Specification | Separate services per family |
| No AWS SDK dependency | Forbidden dep policy | Custom signing, credential handling |
| Rust + TypeScript | Multi-language support | Maintain API parity |

### 1.4 Bedrock-Specific Considerations

| Consideration | Description |
|---------------|-------------|
| **Two service endpoints** | `bedrock-runtime` (invoke) vs `bedrock` (control plane) |
| **AWS Event Stream** | Streaming uses AWS event stream format, not SSE |
| **Model ID routing** | Request format varies by model family |
| **Regional endpoints** | Different regions support different models |
| **Token counting** | Via response headers, not all models support |

---

## 2. Design Principles

### 2.1 Thin Adapter Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         THIN ADAPTER PRINCIPLE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Bedrock Module                    Shared Modules                            │
│  ┌──────────────────────┐         ┌──────────────────────┐                  │
│  │ BedrockClient        │         │ aws/credentials      │                  │
│  │                      │────────►│ (reuse)              │                  │
│  │ • TitanService       │         └──────────────────────┘                  │
│  │ • ClaudeService      │         ┌──────────────────────┐                  │
│  │ • LlamaService       │────────►│ aws/signing          │                  │
│  │ • ModelDiscovery     │         │ (reuse)              │                  │
│  └──────────────────────┘         └──────────────────────┘                  │
│           │                       ┌──────────────────────┐                  │
│           │                       │ shared/resilience    │                  │
│           └──────────────────────►│ (reuse)              │                  │
│                                   └──────────────────────┘                  │
│                                   ┌──────────────────────┐                  │
│                                   │ shared/observability │                  │
│                                   │ (reuse)              │                  │
│                                   └──────────────────────┘                  │
│                                   ┌──────────────────────┐                  │
│                                   │ shared/database      │                  │
│                                   │ (RuvVector)          │                  │
│                                   └──────────────────────┘                  │
│                                                                              │
│  BEDROCK MODULE OWNS:              SHARED MODULES OWN:                       │
│  • Model family routing            • AWS credential chain                    │
│  • Request format translation      • SigV4 signing                          │
│  • Response format translation     • Retry logic                            │
│  • Event stream parsing            • Circuit breaker                        │
│  • Model-specific validation       • Rate limiting                          │
│                                    • Logging/metrics/tracing                │
│                                    • Database connectivity                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Model Family Isolation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MODEL FAMILY ISOLATION                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                           BedrockClient                                      │
│                    ┌────────────┴────────────┐                              │
│                    │                         │                              │
│   ┌────────────────┼─────────────────────────┼────────────────┐             │
│   │                │                         │                │             │
│   ▼                ▼                         ▼                ▼             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐                │
│  │  Titan   │  │  Claude  │  │  LLaMA   │  │   Model      │                │
│  │ Service  │  │ Service  │  │ Service  │  │  Discovery   │                │
│  │          │  │          │  │          │  │   Service    │                │
│  │ • generate│ │ • create │  │ • generate│ │              │                │
│  │ • embed  │  │   Message│  │ • generate│ │ • list       │                │
│  │ • image  │  │ • create │  │   Stream  │ │ • get        │                │
│  │ • stream │  │   Stream │  │          │  │              │                │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘                │
│       │             │             │               │                         │
│       └─────────────┴──────┬──────┴───────────────┘                         │
│                            │                                                 │
│                            ▼                                                 │
│              ┌─────────────────────────────┐                                │
│              │   Model-Specific Request    │                                │
│              │   Format Translation        │                                │
│              │                             │                                │
│              │  Titan: { inputText, ... }  │                                │
│              │  Claude: { messages, ... }  │                                │
│              │  LLaMA: { prompt, ... }     │                                │
│              └─────────────────────────────┘                                │
│                                                                              │
│  Each service encapsulates:                                                  │
│  • Model-specific request serialization                                      │
│  • Model-specific response deserialization                                   │
│  • Model-specific streaming format parsing                                   │
│  • Model-specific validation rules                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Dependency Inversion (Shared Infrastructure)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DEPENDENCY INVERSION PRINCIPLE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  High-level: BedrockServiceImpl                                              │
│       ↓ depends on abstraction                                               │
│  Interface: HttpTransport trait (from shared)                                │
│       ↑ implements                                                           │
│  Low-level: ReqwestHttpTransport                                             │
│                                                                              │
│  High-level: BedrockServiceImpl                                              │
│       ↓ depends on abstraction                                               │
│  Interface: AwsSigner trait (from aws/signing)                               │
│       ↑ implements                                                           │
│  Low-level: AwsSignerV4Impl                                                  │
│                                                                              │
│  High-level: BedrockServiceImpl                                              │
│       ↓ depends on abstraction                                               │
│  Interface: CredentialsProvider trait (from aws/credentials)                 │
│       ↑ implements                                                           │
│  Low-level: ChainCredentialsProvider (Env → Profile → IMDS)                  │
│                                                                              │
│  High-level: BedrockServiceImpl                                              │
│       ↓ depends on abstraction                                               │
│  Interface: ResilienceOrchestrator (from shared/resilience)                  │
│       ↑ implements                                                           │
│  Low-level: RetryExecutor + CircuitBreaker + RateLimiter                     │
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
                        │  Uses Bedrock module      │
                        │  to invoke models:        │
                        │  Titan, Claude, LLaMA     │
                        └─────────────┬─────────────┘
                                      │
                                      │ Uses
                                      ▼
┌───────────────────┐    ┌───────────────────────────┐    ┌───────────────────┐
│                   │    │                           │    │                   │
│  Shared AWS       │◄───│   AWS Bedrock Integration │───►│  AWS Bedrock      │
│  Modules          │    │   Module                  │    │  Service          │
│                   │    │                           │    │                   │
│  • aws/credentials│    │  Thin adapter providing   │    │ bedrock-runtime   │
│  • aws/signing    │    │  unified access to:       │    │  • InvokeModel    │
│                   │    │  • Amazon Titan           │    │  • InvokeStream   │
│                   │    │  • Anthropic Claude       │    │                   │
│                   │    │  • Meta LLaMA             │    │ bedrock           │
│                   │    │                           │    │  • ListModels     │
│                   │    │  Rust + TypeScript        │    │  • GetModel       │
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
│                       AWS Bedrock Integration Module                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          Bedrock Integration Module                          │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                          Public API Container                        │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ Bedrock      │  │ Model Family │  │ Unified      │             │    │
│  │   │ Client       │  │ Services     │  │ Invoke       │             │    │
│  │   │ Factory      │  │              │  │ Interface    │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     Model Family Services Container                  │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ Titan        │  │ Claude       │  │ LLaMA        │             │    │
│  │   │ Service      │  │ Service      │  │ Service      │             │    │
│  │   │              │  │ (Bedrock)    │  │              │             │    │
│  │   │ • generate   │  │              │  │ • generate   │             │    │
│  │   │ • embed      │  │ • create     │  │ • generate   │             │    │
│  │   │ • image      │  │   Message    │  │   Stream     │             │    │
│  │   │ • stream     │  │ • stream     │  │              │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐                               │    │
│  │   │ Model        │  │ Event Stream │                               │    │
│  │   │ Discovery    │  │ Parser       │                               │    │
│  │   │              │  │              │                               │    │
│  │   │ • list       │  │ • Titan fmt  │                               │    │
│  │   │ • get        │  │ • Claude fmt │                               │    │
│  │   │              │  │ • LLaMA fmt  │                               │    │
│  │   └──────────────┘  └──────────────┘                               │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Translation Layer Container                       │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ Request      │  │ Response     │  │ Error        │             │    │
│  │   │ Translator   │  │ Translator   │  │ Mapper       │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           │                           │                           │
           ▼                           ▼                           ▼
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│   aws/credentials    │  │   aws/signing        │  │  shared/resilience   │
│   (reuse)            │  │   (reuse)            │  │  (reuse)             │
│                      │  │                      │  │                      │
│ • ChainProvider      │  │ • SigV4 Signer       │  │ • RetryExecutor      │
│ • EnvProvider        │  │ • Request signing    │  │ • CircuitBreaker     │
│ • ProfileProvider    │  │                      │  │ • RateLimiter        │
│ • IMDSProvider       │  │                      │  │                      │
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘
```

### 3.3 Component Diagram (Level 3)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          COMPONENT ARCHITECTURE                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            BedrockClientImpl                                 │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Service Registry                               │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │  │
│  │  │   Titan     │ │   Claude    │ │   LLaMA     │ │   Model     │     │  │
│  │  │   Service   │ │   Service   │ │   Service   │ │   Discovery │     │  │
│  │  │             │ │             │ │             │ │             │     │  │
│  │  │ • generate  │ │ • create    │ │ • generate  │ │ • list      │     │  │
│  │  │ • embed     │ │   Message   │ │ • generate  │ │ • get       │     │  │
│  │  │ • image     │ │ • create    │ │   Stream    │ │             │     │  │
│  │  │ • stream    │ │   Stream    │ │             │ │             │     │  │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘     │  │
│  │         │               │               │               │             │  │
│  └─────────┼───────────────┼───────────────┼───────────────┼─────────────┘  │
│            │               │               │               │                 │
│            └───────────────┴───────┬───────┴───────────────┘                 │
│                                    │                                         │
│                                    ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      Shared Infrastructure                             │  │
│  │                                                                        │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │  │
│  │  │   Resilience    │  │   HTTP          │  │   AWS           │        │  │
│  │  │   Orchestrator  │  │   Transport     │  │   Signer        │        │  │
│  │  │   (shared)      │  │   (shared)      │  │   (shared)      │        │  │
│  │  │                 │  │                 │  │                 │        │  │
│  │  │ • Retry         │  │ • Connection    │  │ • SigV4         │        │  │
│  │  │ • Rate Limit    │  │ • TLS 1.2+      │  │ • bedrock-      │        │  │
│  │  │ • Circuit Break │  │ • Event Stream  │  │   runtime       │        │  │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘        │  │
│  │           │                    │                    │                  │  │
│  └───────────┼────────────────────┼────────────────────┼──────────────────┘  │
│              │                    │                    │                     │
└──────────────┼────────────────────┼────────────────────┼─────────────────────┘
               │                    │                    │
               ▼                    ▼                    ▼
┌──────────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ shared/resilience    │ │ aws/transport    │ │ aws/credentials  │
│ Primitives           │ │ (from aws/ses)   │ │ (from aws/ses)   │
└──────────────────────┘ └──────────────────┘ └──────────────────┘
```

---

## 4. Component Architecture

### 4.1 Client Component

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BedrockClient Component                               │
└─────────────────────────────────────────────────────────────────────────────┘

                           <<interface>>
                    ┌──────────────────────┐
                    │    BedrockClient     │
                    ├──────────────────────┤
                    │ + titan()            │───► TitanService
                    │ + claude()           │───► ClaudeService
                    │ + llama()            │───► LlamaService
                    │ + models()           │───► ModelDiscoveryService
                    │ + config()           │───► BedrockConfig
                    └──────────┬───────────┘
                               △
                               │ implements
                               │
                    ┌──────────┴───────────┐
                    │   BedrockClientImpl  │
                    ├──────────────────────┤
                    │ - config             │
                    │ - transport          │◇───► Arc<dyn HttpTransport>
                    │ - signer             │◇───► Arc<dyn AwsSigner>
                    │ - credentials        │◇───► Arc<dyn CredentialsProvider>
                    │ - resilience         │◇───► Arc<ResilienceOrchestrator>
                    │ - observability      │◇───► ObservabilityContext
                    │ - runtime_endpoint   │
                    │ - control_endpoint   │
                    │ - titan_service      │◇───┐
                    │ - claude_service     │◇───┤  lazy init
                    │ - llama_service      │◇───┤  (OnceCell)
                    │ - models_service     │◇───┘
                    │ - ruvvector          │◇───► Option<DatabaseConfig>
                    └──────────────────────┘

Builder Pattern:
┌─────────────────────────────────────────────────────────────────────────────┐
│  BedrockClient::builder()                                                    │
│    .region("us-east-1")                                                      │
│    .credentials_provider(ChainCredentialsProvider::default())                │
│    .timeout(Duration::from_secs(120))                                        │
│    .with_resilience(ResilienceConfig { ... })                                │
│    .with_ruvvector(DatabaseConfig { ... })       // Optional                 │
│    .build()?                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Model Family Service Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Model Family Service Pattern                             │
└─────────────────────────────────────────────────────────────────────────────┘

All model family services follow the same structural pattern:

┌─────────────────────────────────────────────────────────────────────────────┐
│                      FamilyServiceImpl Template                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  struct FamilyServiceImpl {                                                  │
│      transport: Arc<dyn HttpTransport>,    // Shared HTTP client             │
│      signer: Arc<dyn AwsSigner>,           // Shared request signing         │
│      resilience: Arc<ResilienceOrchestrator>, // Shared resilience          │
│      observability: ObservabilityContext,  // Shared logging/metrics         │
│      endpoint: String,                     // Runtime endpoint               │
│  }                                                                           │
│                                                                              │
│  impl FamilyService for FamilyServiceImpl {                                  │
│      async fn generate(&self, request: Request) -> Result<Response> {        │
│          // 1. Create tracing span (shared observability)                    │
│          let span = self.observability.tracer.start_span("bedrock.family.op");│
│                                                                              │
│          // 2. Validate input (family-specific)                              │
│          validate_request(&request)?;                                        │
│                                                                              │
│          // 3. Translate to family-specific format                           │
│          let body = translate_request(&request)?;                            │
│                                                                              │
│          // 4. Build HTTP request                                            │
│          let http_request = build_bedrock_request(                           │
│              endpoint: &self.endpoint,                                       │
│              model_id: &request.model_id,                                    │
│              body: body,                                                     │
│              signer: &self.signer                                            │
│          )?;                                                                 │
│                                                                              │
│          // 5. Execute with resilience (shared)                              │
│          let response = self.resilience.execute(|| async {                   │
│              self.transport.send(http_request).await                         │
│          }).await?;                                                          │
│                                                                              │
│          // 6. Parse response (family-specific)                              │
│          let result = parse_response(response)?;                             │
│                                                                              │
│          // 7. Record metrics (shared observability)                         │
│          self.observability.metrics.record(...);                             │
│          span.end();                                                         │
│                                                                              │
│          Ok(result)                                                          │
│      }                                                                       │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Request/Response Translation Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Request/Response Translation Flow                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌────────────────────┐
│ UnifiedInvokeRequest│
│ - model_id         │
│ - messages         │
│ - max_tokens       │
│ - temperature      │
└─────────┬──────────┘
          │
          │ detect_model_family(model_id)
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Model Family Router                                   │
│                                                                              │
│  MATCH family {                                                              │
│      Titan  => translate_to_titan_request(unified)                          │
│      Claude => translate_to_claude_request(unified)                         │
│      LLaMA  => translate_to_llama_request(unified)                          │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
          │
          ├──────────────────┬──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Titan Format     │ │ Claude Format    │ │ LLaMA Format     │
│                  │ │                  │ │                  │
│ {                │ │ {                │ │ {                │
│  "inputText":    │ │  "anthropic_     │ │  "prompt":       │
│    "User: ...",  │ │    version": ...,│ │    "<s>[INST]...",│
│  "textGenera-    │ │  "max_tokens":   │ │  "max_gen_len":  │
│    tionConfig":{}│ │    ...,          │ │    ...,          │
│ }                │ │  "messages": []  │ │  "temperature":  │
│                  │ │ }                │ │    ...           │
└────────┬─────────┘ └────────┬─────────┘ └────────┬─────────┘
         │                    │                    │
         └────────────────────┴────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ AWS Bedrock Runtime │
                    │ POST /model/{id}/   │
                    │      invoke         │
                    └─────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Response Translation (reverse)                           │
│                                                                              │
│  parse_titan_response() / parse_claude_response() / parse_llama_response()  │
│                           │                                                  │
│                           ▼                                                  │
│                  ┌─────────────────────┐                                    │
│                  │UnifiedInvokeResponse│                                    │
│                  │ - model_id          │                                    │
│                  │ - content           │                                    │
│                  │ - stop_reason       │                                    │
│                  │ - usage             │                                    │
│                  └─────────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Model Family Services Design

### 5.1 Titan Service Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TitanService Architecture                             │
└─────────────────────────────────────────────────────────────────────────────┘

<<interface>>
┌─────────────────────────────────────────────────────────────────────────────┐
│                            TitanService                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ + generate(request: TitanGenerateRequest) -> Result<TitanGenerateResponse>  │
│ + generate_stream(request) -> Result<TitanStream>                           │
│ + embed(request: TitanEmbedRequest) -> Result<TitanEmbedResponse>           │
│ + generate_image(request: TitanImageRequest) -> Result<TitanImageResponse>  │
└─────────────────────────────────────────────────────────────────────────────┘

Supported Models:
┌─────────────────────────────────────────────────────────────────────────────┐
│  TEXT MODELS                                                                 │
│  ├── amazon.titan-text-premier-v1:0   (highest capability)                   │
│  ├── amazon.titan-text-express-v1     (fast generation)                      │
│  └── amazon.titan-text-lite-v1        (lightweight)                          │
│                                                                              │
│  EMBEDDING MODELS                                                            │
│  ├── amazon.titan-embed-text-v2:0     (1024 dims, configurable)              │
│  └── amazon.titan-embed-text-v1       (1536 dims)                            │
│                                                                              │
│  IMAGE MODELS                                                                │
│  ├── amazon.titan-image-generator-v2:0                                       │
│  └── amazon.titan-image-generator-v1                                         │
└─────────────────────────────────────────────────────────────────────────────┘

Request/Response Format:
┌─────────────────────────────────────────────────────────────────────────────┐
│  Request:                             Response:                              │
│  {                                    {                                      │
│    "inputText": "...",                 "results": [                          │
│    "textGenerationConfig": {             {                                   │
│      "maxTokenCount": 4096,                "outputText": "...",              │
│      "temperature": 0.7,                   "tokenCount": 123,                │
│      "topP": 0.9,                          "completionReason": "FINISH"      │
│      "stopSequences": []                 }                                   │
│    }                                   ]                                     │
│  }                                    }                                      │
│                                                                              │
│  Headers (response):                                                         │
│  x-amzn-bedrock-input-token-count: 50                                        │
│  x-amzn-bedrock-output-token-count: 123                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Claude Service Design (Bedrock Format)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ClaudeService (Bedrock) Architecture                      │
└─────────────────────────────────────────────────────────────────────────────┘

<<interface>>
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ClaudeService                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ + create_message(request) -> Result<ClaudeMessageResponse>                  │
│ + create_message_stream(request) -> Result<ClaudeStream>                    │
└─────────────────────────────────────────────────────────────────────────────┘

Supported Models:
┌─────────────────────────────────────────────────────────────────────────────┐
│  CLAUDE 3.5 MODELS                                                           │
│  ├── anthropic.claude-3-5-sonnet-20241022-v2:0   (latest Sonnet)            │
│  └── anthropic.claude-3-5-haiku-20241022-v1:0    (fast Haiku)               │
│                                                                              │
│  CLAUDE 3 MODELS                                                             │
│  ├── anthropic.claude-3-opus-20240229-v1:0       (most capable)              │
│  ├── anthropic.claude-3-sonnet-20240229-v1:0     (balanced)                  │
│  └── anthropic.claude-3-haiku-20240307-v1:0      (fast)                      │
│                                                                              │
│  CLAUDE 2 MODELS                                                             │
│  ├── anthropic.claude-v2:1                                                   │
│  ├── anthropic.claude-v2                                                     │
│  └── anthropic.claude-instant-v1                                             │
└─────────────────────────────────────────────────────────────────────────────┘

Request Format (Bedrock-specific):
┌─────────────────────────────────────────────────────────────────────────────┐
│  NOTE: Different from direct Anthropic API!                                  │
│                                                                              │
│  Request:                             Response:                              │
│  {                                    {                                      │
│    "anthropic_version":                 "id": "msg_...",                     │
│      "bedrock-2023-05-31",              "type": "message",                   │
│    "max_tokens": 4096,                  "role": "assistant",                 │
│    "messages": [                        "content": [                         │
│      {                                    { "type": "text", "text": "..." }  │
│        "role": "user",                  ],                                   │
│        "content": "..."                 "model": "...",                      │
│      }                                  "stop_reason": "end_turn",           │
│    ],                                   "usage": {                           │
│    "temperature": 0.7,                    "input_tokens": 50,                │
│    "top_p": 0.9,                          "output_tokens": 100               │
│    "top_k": 250,                        }                                    │
│    "system": "...",                   }                                      │
│    "stop_sequences": []                                                      │
│  }                                                                           │
│                                                                              │
│  KEY DIFFERENCE: Uses "anthropic_version" instead of "anthropic-version"    │
│  header used in direct API                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 LLaMA Service Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LlamaService Architecture                             │
└─────────────────────────────────────────────────────────────────────────────┘

<<interface>>
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LlamaService                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ + generate(request: LlamaGenerateRequest) -> Result<LlamaGenerateResponse>  │
│ + generate_stream(request) -> Result<LlamaStream>                           │
└─────────────────────────────────────────────────────────────────────────────┘

Supported Models:
┌─────────────────────────────────────────────────────────────────────────────┐
│  LLAMA 3.2 MODELS                                                            │
│  ├── meta.llama3-2-90b-instruct-v1:0   (largest)                             │
│  ├── meta.llama3-2-11b-instruct-v1:0                                         │
│  ├── meta.llama3-2-3b-instruct-v1:0                                          │
│  └── meta.llama3-2-1b-instruct-v1:0    (smallest)                            │
│                                                                              │
│  LLAMA 3.1 MODELS                                                            │
│  ├── meta.llama3-1-405b-instruct-v1:0  (405B params)                         │
│  ├── meta.llama3-1-70b-instruct-v1:0                                         │
│  └── meta.llama3-1-8b-instruct-v1:0                                          │
│                                                                              │
│  LLAMA 3 MODELS                                                              │
│  ├── meta.llama3-70b-instruct-v1:0                                           │
│  └── meta.llama3-8b-instruct-v1:0                                            │
│                                                                              │
│  LLAMA 2 MODELS                                                              │
│  ├── meta.llama2-70b-chat-v1                                                 │
│  └── meta.llama2-13b-chat-v1                                                 │
└─────────────────────────────────────────────────────────────────────────────┘

Prompt Format (Version-Specific):
┌─────────────────────────────────────────────────────────────────────────────┐
│  LLAMA 3 Format:                                                             │
│  <|begin_of_text|>                                                           │
│  <|start_header_id|>system<|end_header_id|>                                  │
│  {system_prompt}<|eot_id|>                                                   │
│  <|start_header_id|>user<|end_header_id|>                                    │
│  {user_message}<|eot_id|>                                                    │
│  <|start_header_id|>assistant<|end_header_id|>                               │
│                                                                              │
│  LLAMA 2 Format:                                                             │
│  <s>[INST] <<SYS>>                                                           │
│  {system_prompt}                                                             │
│  <</SYS>>                                                                    │
│  {user_message} [/INST]                                                      │
│                                                                              │
│  Request:                             Response:                              │
│  {                                    {                                      │
│    "prompt": "...",                     "generation": "...",                 │
│    "max_gen_len": 2048,                 "prompt_token_count": 50,            │
│    "temperature": 0.7,                  "generation_token_count": 100,       │
│    "top_p": 0.9                         "stop_reason": "stop"                │
│  }                                    }                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.4 Model Discovery Service Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ModelDiscoveryService Architecture                        │
└─────────────────────────────────────────────────────────────────────────────┘

<<interface>>
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ModelDiscoveryService                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ + list(params?: ListModelsParams) -> Result<ModelList>                      │
│ + get(model_id: String) -> Result<ModelInfo>                                │
└─────────────────────────────────────────────────────────────────────────────┘

NOTE: Uses 'bedrock' service (control plane), not 'bedrock-runtime'

API Endpoints:
┌─────────────────────────────────────────────────────────────────────────────┐
│  GET https://bedrock.{region}.amazonaws.com/foundation-models               │
│      ?byProvider=anthropic                                                   │
│      &byOutputModality=TEXT                                                  │
│      &byInferenceType=ON_DEMAND                                              │
│                                                                              │
│  GET https://bedrock.{region}.amazonaws.com/foundation-models/{modelId}     │
└─────────────────────────────────────────────────────────────────────────────┘

Response Structure:
┌─────────────────────────────────────────────────────────────────────────────┐
│  {                                                                           │
│    "modelSummaries": [                                                       │
│      {                                                                       │
│        "modelId": "anthropic.claude-3-sonnet-...",                           │
│        "modelName": "Claude 3 Sonnet",                                       │
│        "providerName": "Anthropic",                                          │
│        "inputModalities": ["TEXT"],                                          │
│        "outputModalities": ["TEXT"],                                         │
│        "responseStreamingSupported": true,                                   │
│        "customizationsSupported": ["FINE_TUNING"],                           │
│        "inferenceTypesSupported": ["ON_DEMAND", "PROVISIONED"]               │
│      }                                                                       │
│    ]                                                                         │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Module Structure

### 6.1 High-Level Module Organization

```
integrations/
├── aws/
│   ├── bedrock/                     # Bedrock Integration Module
│   │   ├── rust/                    # Rust implementation
│   │   │   ├── Cargo.toml
│   │   │   └── src/
│   │   │
│   │   ├── typescript/              # TypeScript implementation
│   │   │   ├── package.json
│   │   │   └── src/
│   │   │
│   │   └── tests/                   # Shared test fixtures
│   │       └── fixtures/
│   │
│   ├── ses/                         # Existing (reuse patterns)
│   ├── s3/                          # Existing (reuse patterns)
│   ├── credentials/                 # SHARED - credential chain
│   └── signing/                     # SHARED - SigV4 signing
│
├── shared/
│   ├── resilience/                  # SHARED - retry, CB, rate limit
│   ├── observability/               # SHARED - logging, metrics, tracing
│   └── database/                    # SHARED - RuvVector connectivity
│
└── plans/
    └── aws-bedrock/                 # SPARC documentation
        ├── specification-aws-bedrock.md
        ├── pseudocode-aws-bedrock-*.md
        ├── architecture-aws-bedrock-*.md
        └── ...
```

---

## 7. Rust Crate Organization

### 7.1 Crate Structure

```
aws/bedrock/rust/
├── Cargo.toml
├── src/
│   ├── lib.rs                       # Crate root, re-exports
│   │
│   ├── client/                      # Client module
│   │   ├── mod.rs
│   │   ├── config.rs                # BedrockConfig
│   │   ├── factory.rs               # Client factory functions
│   │   └── client_impl.rs           # BedrockClientImpl
│   │
│   ├── services/                    # Model family services
│   │   ├── mod.rs
│   │   ├── titan/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # TitanServiceImpl
│   │   │   ├── types.rs             # Request/Response types
│   │   │   ├── stream.rs            # TitanStream
│   │   │   └── embed.rs             # Embedding operations
│   │   │
│   │   ├── claude/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # ClaudeServiceImpl
│   │   │   ├── types.rs             # Bedrock Claude types
│   │   │   └── stream.rs            # ClaudeStream
│   │   │
│   │   ├── llama/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # LlamaServiceImpl
│   │   │   ├── types.rs             # LLaMA types
│   │   │   ├── stream.rs            # LlamaStream
│   │   │   └── prompt.rs            # Prompt formatting (v2/v3)
│   │   │
│   │   └── discovery/
│   │       ├── mod.rs
│   │       ├── service.rs           # ModelDiscoveryServiceImpl
│   │       └── types.rs
│   │
│   ├── unified/                     # Unified invoke interface
│   │   ├── mod.rs
│   │   ├── invoke.rs                # UnifiedInvokeService
│   │   ├── types.rs                 # Unified request/response
│   │   └── router.rs                # Model family routing
│   │
│   ├── translation/                 # Request/Response translation
│   │   ├── mod.rs
│   │   ├── request.rs               # Unified → Family translation
│   │   └── response.rs              # Family → Unified translation
│   │
│   ├── stream/                      # Event stream parsing
│   │   ├── mod.rs
│   │   ├── parser.rs                # AWS event stream parser
│   │   ├── titan_chunk.rs           # Titan chunk parser
│   │   ├── claude_chunk.rs          # Claude chunk parser
│   │   └── llama_chunk.rs           # LLaMA chunk parser
│   │
│   ├── errors/                      # Error types
│   │   ├── mod.rs
│   │   ├── error.rs                 # BedrockError enum
│   │   └── mapping.rs               # HTTP to error mapping
│   │
│   ├── ruvvector/                   # RuvVector integration
│   │   ├── mod.rs
│   │   ├── embeddings.rs            # Store/retrieve embeddings
│   │   └── state.rs                 # Conversation state
│   │
│   └── types/                       # Shared types
│       ├── mod.rs
│       └── common.rs                # ModelFamily, UsageInfo, etc.
│
├── tests/                           # Integration tests
│   ├── common/
│   │   └── mod.rs                   # Test utilities
│   │
│   ├── titan_tests.rs
│   ├── claude_tests.rs
│   ├── llama_tests.rs
│   └── unified_tests.rs
│
└── examples/                        # Usage examples
    ├── titan_generate.rs
    ├── titan_embed.rs
    ├── claude_message.rs
    ├── llama_generate.rs
    ├── streaming.rs
    └── unified_invoke.rs
```

### 7.2 Cargo.toml

```toml
[package]
name = "integrations-aws-bedrock"
version = "0.1.0"
edition = "2021"
description = "AWS Bedrock Integration Module - Titan, Claude, LLaMA"
license = "LLMDevOps-PSACL-1.0"

[dependencies]
# Shared AWS modules (REUSE)
integrations-aws-credentials = { path = "../../credentials" }
integrations-aws-signing = { path = "../../signing" }

# Shared infrastructure (REUSE)
integrations-resilience = { path = "../../../shared/resilience" }
integrations-observability = { path = "../../../shared/observability" }
integrations-database = { path = "../../../shared/database", optional = true }

# Approved third-party dependencies
tokio = { version = "1.0", features = ["rt-multi-thread", "macros", "time"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
bytes = "1.0"
futures = "0.3"
async-trait = "0.1"
thiserror = "1.0"

[dev-dependencies]
tokio-test = "0.4"
mockall = "0.12"
wiremock = "0.6"

[features]
default = []
full = ["ruvvector", "all-models"]
ruvvector = ["integrations-database"]
all-models = ["titan", "claude", "llama"]
titan = []
claude = []
llama = []

[[example]]
name = "titan_generate"
path = "examples/titan_generate.rs"
required-features = ["titan"]

[[example]]
name = "claude_message"
path = "examples/claude_message.rs"
required-features = ["claude"]
```

### 7.3 Module Visibility and Re-exports

```rust
// src/lib.rs

//! AWS Bedrock Integration Module
//!
//! Provides unified access to AWS Bedrock foundation models:
//! - Amazon Titan (text, embeddings, images)
//! - Anthropic Claude (via Bedrock)
//! - Meta LLaMA
//!
//! # Example
//!
//! ```rust
//! use integrations_aws_bedrock::{BedrockClient, TitanGenerateRequest};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let client = integrations_aws_bedrock::from_env()?;
//!
//!     let response = client.titan().generate(TitanGenerateRequest {
//!         model_id: "amazon.titan-text-express-v1".to_string(),
//!         input_text: "Hello, world!".to_string(),
//!         ..Default::default()
//!     }).await?;
//!
//!     Ok(())
//! }
//! ```

// Re-export public API
pub use client::{BedrockClient, BedrockConfig};
pub use errors::BedrockError;

// Model family services
#[cfg(feature = "titan")]
pub use services::titan::{TitanService, TitanStream};
#[cfg(feature = "titan")]
pub use services::titan::types::*;

#[cfg(feature = "claude")]
pub use services::claude::{ClaudeService, ClaudeStream};
#[cfg(feature = "claude")]
pub use services::claude::types::*;

#[cfg(feature = "llama")]
pub use services::llama::{LlamaService, LlamaStream};
#[cfg(feature = "llama")]
pub use services::llama::types::*;

// Model discovery
pub use services::discovery::{ModelDiscoveryService, ModelInfo, ModelList};

// Unified invoke
pub use unified::{UnifiedInvokeService, UnifiedInvokeRequest, UnifiedInvokeResponse};

// Common types
pub use types::{ModelFamily, UsageInfo, StopReason};

// Factory functions
pub fn create(config: BedrockConfig) -> Result<impl BedrockClient, BedrockError> {
    client::factory::create_bedrock_client(config)
}

pub fn from_env() -> Result<impl BedrockClient, BedrockError> {
    client::factory::create_bedrock_client_from_env()
}

// Internal modules
mod client;
mod services;
mod unified;
mod translation;
mod stream;
mod errors;
mod types;

#[cfg(feature = "ruvvector")]
mod ruvvector;
```

---

## 8. TypeScript Package Organization

### 8.1 Package Structure

```
aws/bedrock/typescript/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
│
├── src/
│   ├── index.ts                     # Package entry, re-exports
│   │
│   ├── client/
│   │   ├── index.ts
│   │   ├── config.ts                # BedrockConfig interface
│   │   ├── factory.ts               # createBedrockClient()
│   │   └── client-impl.ts           # BedrockClientImpl
│   │
│   ├── services/
│   │   ├── index.ts
│   │   ├── titan/
│   │   │   ├── index.ts
│   │   │   ├── service.ts           # TitanServiceImpl
│   │   │   ├── types.ts
│   │   │   ├── stream.ts            # Async iterator
│   │   │   └── embed.ts
│   │   │
│   │   ├── claude/
│   │   │   ├── index.ts
│   │   │   ├── service.ts           # ClaudeServiceImpl
│   │   │   ├── types.ts
│   │   │   └── stream.ts
│   │   │
│   │   ├── llama/
│   │   │   ├── index.ts
│   │   │   ├── service.ts           # LlamaServiceImpl
│   │   │   ├── types.ts
│   │   │   ├── stream.ts
│   │   │   └── prompt.ts            # Prompt formatting
│   │   │
│   │   └── discovery/
│   │       ├── index.ts
│   │       ├── service.ts
│   │       └── types.ts
│   │
│   ├── unified/
│   │   ├── index.ts
│   │   ├── invoke.ts                # UnifiedInvokeService
│   │   ├── types.ts
│   │   └── router.ts
│   │
│   ├── translation/
│   │   ├── index.ts
│   │   ├── request.ts
│   │   └── response.ts
│   │
│   ├── stream/
│   │   ├── index.ts
│   │   ├── parser.ts                # AWS event stream parser
│   │   └── chunks.ts                # Family-specific parsers
│   │
│   ├── errors/
│   │   ├── index.ts
│   │   ├── error.ts                 # BedrockError class
│   │   └── mapping.ts
│   │
│   ├── ruvvector/
│   │   ├── index.ts
│   │   ├── embeddings.ts
│   │   └── state.ts
│   │
│   └── types/
│       ├── index.ts
│       └── common.ts
│
├── tests/
│   ├── unit/
│   │   ├── titan.test.ts
│   │   ├── claude.test.ts
│   │   ├── llama.test.ts
│   │   └── unified.test.ts
│   │
│   └── integration/
│       └── mock-server.test.ts
│
└── examples/
    ├── titan-generate.ts
    ├── titan-embed.ts
    ├── claude-message.ts
    ├── llama-generate.ts
    ├── streaming.ts
    └── unified-invoke.ts
```

### 8.2 package.json

```json
{
  "name": "@integrations/aws-bedrock",
  "version": "0.1.0",
  "description": "AWS Bedrock Integration Module - Titan, Claude, LLaMA",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./titan": {
      "import": "./dist/services/titan/index.mjs",
      "require": "./dist/services/titan/index.js",
      "types": "./dist/services/titan/index.d.ts"
    },
    "./claude": {
      "import": "./dist/services/claude/index.mjs",
      "require": "./dist/services/claude/index.js",
      "types": "./dist/services/claude/index.d.ts"
    },
    "./llama": {
      "import": "./dist/services/llama/index.mjs",
      "require": "./dist/services/llama/index.js",
      "types": "./dist/services/llama/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@integrations/aws-credentials": "workspace:*",
    "@integrations/aws-signing": "workspace:*",
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
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### 8.3 Module Exports (index.ts)

```typescript
// src/index.ts

/**
 * AWS Bedrock Integration Module
 *
 * Provides unified access to AWS Bedrock foundation models:
 * - Amazon Titan (text, embeddings, images)
 * - Anthropic Claude (via Bedrock)
 * - Meta LLaMA
 *
 * @example
 * ```typescript
 * import { createBedrockClient } from '@integrations/aws-bedrock';
 *
 * const client = createBedrockClient({ region: 'us-east-1' });
 *
 * const response = await client.titan.generate({
 *   modelId: 'amazon.titan-text-express-v1',
 *   inputText: 'Hello, world!',
 * });
 * ```
 *
 * @packageDocumentation
 */

// Client exports
export { BedrockClient, BedrockConfig } from './client';
export { createBedrockClient, createBedrockClientFromEnv } from './client/factory';

// Error exports
export { BedrockError } from './errors';
export type {
  ConfigurationError,
  AuthenticationError,
  ModelError,
  RequestError,
  RateLimitError,
  ServerError,
  StreamError,
} from './errors';

// Service interfaces
export type {
  TitanService,
  ClaudeService,
  LlamaService,
  ModelDiscoveryService,
} from './services';

// Titan types
export type {
  TitanGenerateRequest,
  TitanGenerateResponse,
  TitanEmbedRequest,
  TitanEmbedResponse,
  TitanImageRequest,
  TitanImageResponse,
  TitanStream,
} from './services/titan/types';

// Claude types (Bedrock format)
export type {
  ClaudeMessageRequest,
  ClaudeMessageResponse,
  ClaudeStream,
} from './services/claude/types';

// LLaMA types
export type {
  LlamaGenerateRequest,
  LlamaGenerateResponse,
  LlamaStream,
} from './services/llama/types';

// Model discovery types
export type {
  ModelInfo,
  ModelList,
  ListModelsParams,
} from './services/discovery/types';

// Unified invoke types
export type {
  UnifiedInvokeRequest,
  UnifiedInvokeResponse,
} from './unified/types';

// Common types
export { ModelFamily, StopReason } from './types/common';
export type { UsageInfo } from './types/common';
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial architecture - Part 1 |

---

**End of Architecture Part 1**

*Part 2 will cover: Data Flow Architecture, Streaming Architecture, Error Handling Flow, RuvVector Integration, and Testing Architecture.*
