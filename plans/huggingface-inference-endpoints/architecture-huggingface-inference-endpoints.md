# SPARC Phase 3: Architecture — Hugging Face Inference Endpoints Integration

**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/huggingface/inference-endpoints`

---

## 1. Architecture Overview

### 1.1 Design Philosophy

| Principle | Application |
|-----------|-------------|
| **Thin Adapter** | Minimal HF-specific logic; delegate to shared modules |
| **Multi-Provider** | Route to HF serverless, dedicated endpoints, or 20+ third-party providers |
| **Task Flexibility** | Support 30+ inference tasks via unified service interfaces |
| **Cold Start Aware** | Graceful handling of scale-to-zero and model loading delays |
| **Endpoint Lifecycle** | Full management API for dedicated endpoints |

### 1.2 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Provider Resolver Pattern | Abstract routing logic for serverless vs dedicated vs third-party |
| Task-Based Service Split | Separate services for chat, text-gen, embeddings, image, audio |
| Lazy Service Initialization | Only instantiate services when first accessed |
| Endpoint Cache | Cache endpoint URLs to avoid repeated management API calls |
| Cold Start Orchestration | Configurable auto-wait with exponential backoff |

---

## 2. C4 Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM CONTEXT                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                           ┌─────────────────┐                               │
│                           │   Application   │                               │
│                           │    (Client)     │                               │
│                           └────────┬────────┘                               │
│                                    │                                        │
│                                    ▼                                        │
│                    ┌───────────────────────────────┐                        │
│                    │                               │                        │
│                    │   HF Inference Endpoints      │                        │
│                    │       Integration             │                        │
│                    │                               │                        │
│                    └───────────────┬───────────────┘                        │
│                                    │                                        │
│              ┌─────────────────────┼─────────────────────┐                  │
│              │                     │                     │                  │
│              ▼                     ▼                     ▼                  │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐          │
│   │  HF Serverless  │   │  HF Dedicated   │   │  Third-Party    │          │
│   │  Inference API  │   │   Endpoints     │   │   Providers     │          │
│   │                 │   │                 │   │ (Together,Groq) │          │
│   └─────────────────┘   └─────────────────┘   └─────────────────┘          │
│                                                                              │
│              ┌─────────────────────┴─────────────────────┐                  │
│              │                                           │                  │
│              ▼                                           ▼                  │
│   ┌─────────────────┐                         ┌─────────────────┐          │
│   │  HF Management  │                         │    RuvVector    │          │
│   │      API        │                         │   (pgvector)    │          │
│   └─────────────────┘                         └─────────────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. C4 Container Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CONTAINER DIAGRAM                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    HF Inference Integration                          │    │
│  │                                                                      │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │    │
│  │  │   Chat      │  │  Text Gen   │  │  Embedding  │  │   Image    │  │    │
│  │  │  Service    │  │  Service    │  │  Service    │  │  Service   │  │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘  │    │
│  │         │                │                │               │         │    │
│  │  ┌──────┴────────────────┴────────────────┴───────────────┴──────┐  │    │
│  │  │                                                                │  │    │
│  │  │                    Provider Resolver                           │  │    │
│  │  │   (Route to Serverless / Dedicated / Third-Party)             │  │    │
│  │  │                                                                │  │    │
│  │  └───────────────────────────┬────────────────────────────────────┘  │    │
│  │                              │                                       │    │
│  │  ┌─────────────┐  ┌──────────┴──────────┐  ┌─────────────────────┐  │    │
│  │  │  Endpoint   │  │   Cold Start        │  │    Audio Service    │  │    │
│  │  │  Management │  │   Handler           │  │   (ASR, TTS)        │  │    │
│  │  │  Service    │  │                     │  │                     │  │    │
│  │  └──────┬──────┘  └─────────────────────┘  └─────────────────────┘  │    │
│  │         │                                                            │    │
│  └─────────┼────────────────────────────────────────────────────────────┘    │
│            │                                                                  │
│  ┌─────────┼────────────────────────────────────────────────────────────┐    │
│  │         │              Shared Infrastructure                          │    │
│  │         ▼                                                             │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │    │
│  │  │ Credentials │  │ Resilience  │  │Observability│  │  Database   │  │    │
│  │  │ (HF Token)  │  │(Retry/CB)   │  │(Trace/Logs) │  │ (RuvVector) │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │    │
│  │                                                                       │    │
│  └───────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. C4 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           COMPONENT DIAGRAM                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        HfInferenceClient                             │    │
│  │                                                                      │    │
│  │   ┌──────────────────────────────────────────────────────────────┐  │    │
│  │   │                    Service Accessors                          │  │    │
│  │   │  chat() → ChatService                                        │  │    │
│  │   │  text_generation() → TextGenerationService                   │  │    │
│  │   │  embeddings() → EmbeddingService                             │  │    │
│  │   │  image() → ImageService                                      │  │    │
│  │   │  audio() → AudioService                                      │  │    │
│  │   │  endpoints() → EndpointManagementService                     │  │    │
│  │   └──────────────────────────────────────────────────────────────┘  │    │
│  │                                                                      │    │
│  └──────────────────────────────┬───────────────────────────────────────┘    │
│                                 │                                            │
│         ┌───────────────────────┼───────────────────────┐                   │
│         │                       │                       │                   │
│         ▼                       ▼                       ▼                   │
│  ┌─────────────┐      ┌─────────────────┐      ┌─────────────────┐         │
│  │ ChatService │      │ProviderResolver │      │ EndpointMgmt    │         │
│  │             │      │                 │      │    Service      │         │
│  │ complete()  │      │ resolve_url()   │      │                 │         │
│  │ stream()    │◄────►│ resolve_endpoint│◄────►│ list()          │         │
│  │             │      │ get_target()    │      │ create()        │         │
│  └─────────────┘      │                 │      │ pause/resume()  │         │
│         │             └─────────────────┘      │ scale_to_zero() │         │
│         │                     │                │ wait_for_ready()│         │
│         │                     │                └─────────────────┘         │
│         │                     │                        │                    │
│         ▼                     ▼                        ▼                    │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │                     Cold Start Handler                           │       │
│  │                                                                  │       │
│  │   execute_with_cold_start_handling()                            │       │
│  │   wait_and_retry()                                              │       │
│  │   detect_model_loading()                                        │       │
│  │                                                                  │       │
│  └──────────────────────────────┬──────────────────────────────────┘       │
│                                 │                                           │
│                                 ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │                      HTTP Transport Layer                        │       │
│  │                                                                  │       │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │       │
│  │   │  Request    │  │  Response   │  │   SSE Stream Parser     │ │       │
│  │   │  Builder    │  │  Parser     │  │   (HF Format)           │ │       │
│  │   └─────────────┘  └─────────────┘  └─────────────────────────┘ │       │
│  │                                                                  │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Provider Routing Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PROVIDER ROUTING FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                         ┌─────────────────┐                                 │
│                         │  Inference      │                                 │
│                         │  Request        │                                 │
│                         └────────┬────────┘                                 │
│                                  │                                          │
│                                  ▼                                          │
│                    ┌─────────────────────────┐                              │
│                    │   Provider Resolver     │                              │
│                    │                         │                              │
│                    │  1. Check explicit      │                              │
│                    │     provider param      │                              │
│                    │  2. Use default_provider│                              │
│                    │  3. Fallback to         │                              │
│                    │     serverless          │                              │
│                    └────────────┬────────────┘                              │
│                                 │                                           │
│              ┌──────────────────┼──────────────────┐                        │
│              │                  │                  │                        │
│              ▼                  ▼                  ▼                        │
│   ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐              │
│   │   HF Serverless │ │  HF Dedicated   │ │  Third-Party    │              │
│   │                 │ │   Endpoint      │ │   Provider      │              │
│   │ api-inference.  │ │                 │ │                 │              │
│   │ huggingface.co  │ │ {name}.{region}.│ │ Together, Groq, │              │
│   │                 │ │ {vendor}.       │ │ Fireworks, etc. │              │
│   │ /models/{model} │ │ endpoints.hf.co │ │                 │              │
│   └────────┬────────┘ └────────┬────────┘ └────────┬────────┘              │
│            │                   │                   │                        │
│            │                   ▼                   │                        │
│            │        ┌─────────────────┐            │                        │
│            │        │ Endpoint Cache  │            │                        │
│            │        │ (URL + Status)  │            │                        │
│            │        └─────────────────┘            │                        │
│            │                                       │                        │
│            └───────────────────┬───────────────────┘                        │
│                                │                                            │
│                                ▼                                            │
│                    ┌─────────────────────┐                                  │
│                    │  InferenceTarget    │                                  │
│                    │                     │                                  │
│                    │  - url: String      │                                  │
│                    │  - provider_type    │                                  │
│                    │  - model: String    │                                  │
│                    └─────────────────────┘                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Cold Start Handling Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        COLD START HANDLING FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                    ┌─────────────────────┐                                  │
│                    │   Inference Request │                                  │
│                    └──────────┬──────────┘                                  │
│                               │                                             │
│                               ▼                                             │
│                    ┌─────────────────────┐                                  │
│                    │  Send HTTP Request  │                                  │
│                    └──────────┬──────────┘                                  │
│                               │                                             │
│                               ▼                                             │
│                    ┌─────────────────────┐                                  │
│                    │  Response Status?   │                                  │
│                    └──────────┬──────────┘                                  │
│                               │                                             │
│         ┌─────────────────────┼─────────────────────┐                       │
│         │                     │                     │                       │
│         ▼                     ▼                     ▼                       │
│   ┌───────────┐        ┌───────────┐        ┌───────────┐                  │
│   │  200 OK   │        │  503      │        │  Other    │                  │
│   │           │        │           │        │  Error    │                  │
│   └─────┬─────┘        └─────┬─────┘        └─────┬─────┘                  │
│         │                    │                    │                         │
│         ▼                    ▼                    ▼                         │
│   ┌───────────┐        ┌───────────────────┐  ┌───────────┐                │
│   │  Return   │        │ Parse Response    │  │  Return   │                │
│   │  Success  │        │ Body              │  │  Error    │                │
│   └───────────┘        └─────────┬─────────┘  └───────────┘                │
│                                  │                                          │
│                                  ▼                                          │
│                    ┌─────────────────────────┐                              │
│                    │ Contains "loading" or   │                              │
│                    │ "initializing"?         │                              │
│                    └───────────┬─────────────┘                              │
│                                │                                            │
│              ┌─────────────────┴─────────────────┐                          │
│              │ YES                               │ NO                       │
│              ▼                                   ▼                          │
│   ┌─────────────────────┐             ┌─────────────────┐                  │
│   │ auto_wait_for_model │             │ Return 503      │                  │
│   │ enabled?            │             │ Error           │                  │
│   └──────────┬──────────┘             └─────────────────┘                  │
│              │                                                              │
│     ┌────────┴────────┐                                                     │
│     │ YES             │ NO                                                  │
│     ▼                 ▼                                                     │
│ ┌─────────────┐  ┌─────────────────┐                                       │
│ │Wait & Retry │  │ Return          │                                       │
│ │ Loop        │  │ ModelLoading    │                                       │
│ │             │  │ Error           │                                       │
│ └──────┬──────┘  └─────────────────┘                                       │
│        │                                                                    │
│        ▼                                                                    │
│ ┌─────────────────────────────────────────┐                                │
│ │  Exponential Backoff Loop               │                                │
│ │                                         │                                │
│ │  while elapsed < cold_start_timeout:    │                                │
│ │    sleep(min(2^retry, 30) seconds)      │                                │
│ │    retry request                        │                                │
│ │    if 200: return success               │                                │
│ │    if not 503: return error             │                                │
│ │                                         │                                │
│ │  return ColdStartTimeoutError           │                                │
│ └─────────────────────────────────────────┘                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Task Type Routing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TASK TYPE ROUTING                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                      InferenceTask Enum                             │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                    │                                        │
│     ┌──────────────┬───────────────┼───────────────┬──────────────┐         │
│     │              │               │               │              │         │
│     ▼              ▼               ▼               ▼              ▼         │
│  ┌──────┐     ┌──────────┐    ┌──────────┐   ┌──────────┐   ┌──────────┐   │
│  │ Text │     │  Vision  │    │  Audio   │   │  Tabular │   │  Video   │   │
│  └──┬───┘     └────┬─────┘    └────┬─────┘   └────┬─────┘   └────┬─────┘   │
│     │              │               │              │              │          │
│     │              │               │              │              │          │
│ ┌───┴────┐    ┌────┴────┐    ┌────┴────┐    ┌────┴────┐    ┌────┴────┐    │
│ │Chat    │    │Image    │    │ASR      │    │Table QA │    │Text2Vid │    │
│ │Complet.│    │Classif. │    │         │    │         │    │         │    │
│ │        │    │         │    │         │    │         │    │         │    │
│ │TextGen │    │Object   │    │TTS      │    │Tab.Class│    │Img2Vid  │    │
│ │        │    │Detect.  │    │         │    │         │    │         │    │
│ │Summary │    │         │    │Audio    │    │Tab.Regr │    │         │    │
│ │        │    │Image    │    │Classif. │    │         │    │         │    │
│ │Transl. │    │Segment. │    │         │    │         │    │         │    │
│ │        │    │         │    │Audio2   │    │         │    │         │    │
│ │Text    │    │Text2Img │    │Audio    │    │         │    │         │    │
│ │Classif.│    │         │    │         │    │         │    │         │    │
│ │        │    │Img2Img  │    │         │    │         │    │         │    │
│ │Token   │    │         │    │         │    │         │    │         │    │
│ │Classif.│    │Img2Text │    │         │    │         │    │         │    │
│ │        │    │         │    │         │    │         │    │         │    │
│ │QA      │    │VQA      │    │         │    │         │    │         │    │
│ │        │    │         │    │         │    │         │    │         │    │
│ │Feature │    │DocVQA   │    │         │    │         │    │         │    │
│ │Extract.│    │         │    │         │    │         │    │         │    │
│ │        │    │ZeroShot │    │         │    │         │    │         │    │
│ │FillMask│    │ImgClass │    │         │    │         │    │         │    │
│ │        │    │         │    │         │    │         │    │         │    │
│ │ZeroShot│    │         │    │         │    │         │    │         │    │
│ │Class.  │    │         │    │         │    │         │    │         │    │
│ │        │    │         │    │         │    │         │    │         │    │
│ │Sentence│    │         │    │         │    │         │    │         │    │
│ │Similar.│    │         │    │         │    │         │    │         │    │
│ └────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘    │
│                                                                              │
│  Service Mapping:                                                           │
│  ─────────────────────────────────────────────────────────────────────      │
│  │ Task Category │ Service              │ Primary Methods            │      │
│  ├───────────────┼──────────────────────┼────────────────────────────│      │
│  │ Chat/TextGen  │ ChatService          │ complete(), stream()       │      │
│  │               │ TextGenerationSvc    │ generate(), stream()       │      │
│  │ Embeddings    │ EmbeddingService     │ create(), create_batch()   │      │
│  │ Vision        │ ImageService         │ generate(), classify(),    │      │
│  │               │                      │ detect(), caption()        │      │
│  │ Audio         │ AudioService         │ transcribe(), synthesize() │      │
│  │ Tabular       │ TabularService       │ query(), classify()        │      │
│  │ Video         │ VideoService         │ generate()                 │      │
│  └───────────────┴──────────────────────┴────────────────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Module Structure

### 8.1 Rust Crate Structure

```
integrations/huggingface/inference-endpoints/rust/
├── Cargo.toml
├── src/
│   ├── lib.rs                          # Public API exports
│   ├── client.rs                       # HfInferenceClient impl
│   ├── config.rs                       # HfInferenceConfig
│   │
│   ├── providers/
│   │   ├── mod.rs
│   │   ├── resolver.rs                 # ProviderResolver
│   │   ├── types.rs                    # InferenceProvider enum
│   │   ├── serverless.rs               # HF Serverless routing
│   │   ├── dedicated.rs                # Dedicated endpoint routing
│   │   └── third_party.rs              # Together, Groq, etc.
│   │
│   ├── services/
│   │   ├── mod.rs
│   │   ├── chat/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs              # ChatServiceImpl
│   │   │   ├── request.rs              # ChatRequest types
│   │   │   ├── response.rs             # ChatResponse types
│   │   │   └── stream.rs               # ChatStream
│   │   ├── text_generation/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs              # TextGenerationServiceImpl
│   │   │   ├── request.rs              # Native HF request format
│   │   │   ├── response.rs             # Native HF response format
│   │   │   └── stream.rs               # TextGenerationStream
│   │   ├── embedding/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs              # EmbeddingServiceImpl
│   │   │   ├── request.rs
│   │   │   └── response.rs
│   │   ├── image/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs              # ImageServiceImpl
│   │   │   ├── generation.rs           # Text-to-image
│   │   │   ├── classification.rs       # Image classification
│   │   │   ├── detection.rs            # Object detection
│   │   │   └── types.rs                # ImageInput, ImageOutput
│   │   └── audio/
│   │       ├── mod.rs
│   │       ├── service.rs              # AudioServiceImpl
│   │       ├── asr.rs                  # Speech recognition
│   │       ├── tts.rs                  # Text-to-speech
│   │       └── types.rs                # AudioInput, AudioOutput
│   │
│   ├── endpoints/
│   │   ├── mod.rs
│   │   ├── service.rs                  # EndpointManagementServiceImpl
│   │   ├── types.rs                    # EndpointConfig, EndpointInfo
│   │   ├── lifecycle.rs                # pause, resume, scale_to_zero
│   │   └── cache.rs                    # Endpoint URL cache
│   │
│   ├── cold_start/
│   │   ├── mod.rs
│   │   ├── handler.rs                  # ColdStartHandler
│   │   ├── detector.rs                 # Model loading detection
│   │   └── config.rs                   # ColdStartConfig
│   │
│   ├── auth/
│   │   ├── mod.rs
│   │   ├── token_provider.rs           # HfTokenProvider
│   │   └── secret.rs                   # SecretString (reuse)
│   │
│   ├── infra/
│   │   ├── mod.rs
│   │   ├── request_builder.rs          # HTTP request construction
│   │   ├── response_parser.rs          # Response parsing
│   │   ├── sse_parser.rs               # HF SSE format parser
│   │   └── multimodal.rs               # Image/audio data handling
│   │
│   ├── adapter/
│   │   ├── mod.rs
│   │   ├── model_adapter.rs            # Platform ModelAdapter impl
│   │   ├── request_convert.rs          # Unified → HF conversion
│   │   └── response_convert.rs         # HF → Unified conversion
│   │
│   ├── ruvvector/
│   │   ├── mod.rs
│   │   ├── storage.rs                  # HfEmbeddingStorage
│   │   └── search.rs                   # Similarity search
│   │
│   ├── tasks/
│   │   ├── mod.rs
│   │   └── types.rs                    # InferenceTask enum (30+)
│   │
│   ├── types/
│   │   ├── mod.rs
│   │   ├── message.rs                  # ChatMessage types
│   │   ├── usage.rs                    # TokenUsage
│   │   ├── tool.rs                     # Tool, ToolCall
│   │   └── compute.rs                  # Accelerator, InstanceType
│   │
│   ├── error.rs                        # HfError types
│   └── validation.rs                   # Input validation
│
└── tests/
    ├── unit/
    ├── integration/
    ├── contract/
    └── fixtures/
```

### 8.2 TypeScript Package Structure

```
integrations/huggingface/inference-endpoints/typescript/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                        # Public exports
│   ├── client.ts                       # HfInferenceClient
│   ├── config.ts                       # HfInferenceConfig
│   │
│   ├── providers/
│   │   ├── index.ts
│   │   ├── resolver.ts                 # ProviderResolver
│   │   ├── types.ts                    # InferenceProvider
│   │   └── third-party.ts              # Third-party routing
│   │
│   ├── services/
│   │   ├── index.ts
│   │   ├── chat/
│   │   ├── text-generation/
│   │   ├── embedding/
│   │   ├── image/
│   │   └── audio/
│   │
│   ├── endpoints/
│   │   ├── index.ts
│   │   ├── service.ts
│   │   └── types.ts
│   │
│   ├── cold-start/
│   │   ├── index.ts
│   │   └── handler.ts
│   │
│   ├── adapter/
│   │   ├── index.ts
│   │   └── model-adapter.ts
│   │
│   ├── tasks/
│   │   └── types.ts
│   │
│   ├── types/
│   │   └── index.ts
│   │
│   └── error.ts
│
└── tests/
```

---

## 9. Data Flow Diagrams

### 9.1 Chat Completion Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CHAT COMPLETION DATA FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Client                                                                      │
│    │                                                                         │
│    │ ChatRequest {                                                           │
│    │   model: "meta-llama/Llama-2-7b-chat-hf",                              │
│    │   messages: [...],                                                      │
│    │   max_tokens: 512,                                                      │
│    │   provider: Some(Dedicated("my-endpoint"))                             │
│    │ }                                                                       │
│    │                                                                         │
│    ▼                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      ChatService.complete()                          │    │
│  └───────────────────────────────┬─────────────────────────────────────┘    │
│                                  │                                          │
│                                  ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      ProviderResolver.resolve_url()                  │    │
│  │                                                                      │    │
│  │  Input: model, task=ChatCompletion, provider=Dedicated               │    │
│  │  Output: InferenceTarget {                                           │    │
│  │    url: "https://my-endpoint.us-east-1.aws.endpoints.hf.cloud",      │    │
│  │    provider_type: DedicatedEndpoint                                  │    │
│  │  }                                                                   │    │
│  └───────────────────────────────┬─────────────────────────────────────┘    │
│                                  │                                          │
│                                  ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      build_chat_request_body()                       │    │
│  │                                                                      │    │
│  │  {                                                                   │    │
│  │    "model": "meta-llama/Llama-2-7b-chat-hf",                        │    │
│  │    "messages": [                                                     │    │
│  │      {"role": "user", "content": "Hello!"}                          │    │
│  │    ],                                                                │    │
│  │    "max_tokens": 512                                                 │    │
│  │  }                                                                   │    │
│  └───────────────────────────────┬─────────────────────────────────────┘    │
│                                  │                                          │
│                                  ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │              execute_with_cold_start_handling()                      │    │
│  │                                                                      │    │
│  │  POST {target.url}/v1/chat/completions                              │    │
│  │  Headers:                                                            │    │
│  │    Authorization: Bearer {HF_TOKEN}                                  │    │
│  │    Content-Type: application/json                                    │    │
│  └───────────────────────────────┬─────────────────────────────────────┘    │
│                                  │                                          │
│                                  ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      parse_chat_response()                           │    │
│  │                                                                      │    │
│  │  ChatResponse {                                                      │    │
│  │    id: "chatcmpl-xxx",                                               │    │
│  │    choices: [{                                                       │    │
│  │      message: { role: "assistant", content: "Hi there!" }            │    │
│  │    }],                                                               │    │
│  │    usage: { prompt_tokens: 10, completion_tokens: 5 }                │    │
│  │  }                                                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Streaming Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STREAMING DATA FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Client                        HF Endpoint                                   │
│    │                               │                                        │
│    │ stream(ChatRequest)           │                                        │
│    ├──────────────────────────────►│                                        │
│    │                               │                                        │
│    │    HTTP Response (SSE)        │                                        │
│    │◄──────────────────────────────┤                                        │
│    │                               │                                        │
│    │                                                                         │
│    ▼                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         SSE Parser                                   │    │
│  │                                                                      │    │
│  │  Input Stream:                                                       │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │ data: {"id":"..","choices":[{"delta":{"content":"Hi"}}]}    │    │    │
│  │  │                                                              │    │    │
│  │  │ data: {"id":"..","choices":[{"delta":{"content":" there"}}]}│    │    │
│  │  │                                                              │    │    │
│  │  │ data: {"id":"..","choices":[{"delta":{"content":"!"}}],     │    │    │
│  │  │        "usage":{"prompt_tokens":10,"completion_tokens":3}}   │    │    │
│  │  │                                                              │    │    │
│  │  │ data: [DONE]                                                 │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └───────────────────────────────┬─────────────────────────────────────┘    │
│                                  │                                          │
│                                  ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         ChatStream                                   │    │
│  │                                                                      │    │
│  │  impl Stream<Item = Result<ChatChunk, Error>>                       │    │
│  │                                                                      │    │
│  │  Yields:                                                             │    │
│  │    ChatChunk { delta: { content: "Hi" } }                           │    │
│  │    ChatChunk { delta: { content: " there" } }                       │    │
│  │    ChatChunk { delta: { content: "!" }, usage: Some(...) }          │    │
│  │    Stream ends                                                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Backpressure:                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Bounded channel (capacity: 100)                                     │    │
│  │  If consumer is slow, producer waits                                 │    │
│  │  Prevents memory exhaustion on long responses                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Endpoint Management Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ENDPOINT MANAGEMENT ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                    ┌─────────────────────────┐                              │
│                    │ EndpointManagementSvc   │                              │
│                    └───────────┬─────────────┘                              │
│                                │                                            │
│     ┌──────────────────────────┼──────────────────────────┐                 │
│     │                          │                          │                 │
│     ▼                          ▼                          ▼                 │
│  ┌─────────┐            ┌─────────────┐            ┌─────────────┐         │
│  │ CRUD    │            │ Lifecycle   │            │ Monitoring  │         │
│  │         │            │             │            │             │         │
│  │ list()  │            │ pause()     │            │ get()       │         │
│  │ create()│            │ resume()    │            │ wait_for_   │         │
│  │ update()│            │ scale_to_   │            │   running() │         │
│  │ delete()│            │   zero()    │            │             │         │
│  └────┬────┘            └──────┬──────┘            └──────┬──────┘         │
│       │                        │                          │                 │
│       └────────────────────────┼──────────────────────────┘                 │
│                                │                                            │
│                                ▼                                            │
│                    ┌─────────────────────────┐                              │
│                    │   HF Management API     │                              │
│                    │                         │                              │
│                    │  api.endpoints.         │                              │
│                    │  huggingface.cloud      │                              │
│                    │                         │                              │
│                    │  /v2/endpoint/{ns}      │                              │
│                    │  /v2/endpoint/{ns}/{n}  │                              │
│                    │  /v2/endpoint/.../pause │                              │
│                    │  /v2/endpoint/.../resume│                              │
│                    └───────────┬─────────────┘                              │
│                                │                                            │
│                                ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       Endpoint Cache                                 │    │
│  │                                                                      │    │
│  │   DashMap<String, EndpointInfo>                                     │    │
│  │                                                                      │    │
│  │   Key: "{namespace}:{endpoint_name}"                                │    │
│  │   Value: EndpointInfo {                                              │    │
│  │     name, status, url, model, compute, ...                          │    │
│  │   }                                                                  │    │
│  │                                                                      │    │
│  │   TTL: Refreshed on access, invalidated on lifecycle changes        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Endpoint States:                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   ┌─────────┐     ┌──────────────┐     ┌─────────┐                  │    │
│  │   │ pending │────►│ initializing │────►│ running │                  │    │
│  │   └─────────┘     └──────────────┘     └────┬────┘                  │    │
│  │                                             │                        │    │
│  │                    ┌────────────────────────┼────────────────┐       │    │
│  │                    │                        │                │       │    │
│  │                    ▼                        ▼                ▼       │    │
│  │              ┌──────────┐           ┌────────────┐    ┌─────────┐   │    │
│  │              │  paused  │           │scaledToZero│    │ updating│   │    │
│  │              └─────┬────┘           └──────┬─────┘    └────┬────┘   │    │
│  │                    │                       │               │        │    │
│  │                    │       resume()        │   request     │        │    │
│  │                    └───────────────────────┴───────────────┘        │    │
│  │                                    │                                │    │
│  │                                    ▼                                │    │
│  │                              ┌─────────┐                            │    │
│  │                              │ running │                            │    │
│  │                              └─────────┘                            │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Integration Points

### 11.1 Shared Module Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SHARED MODULE INTEGRATION                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    HF Inference Integration                          │    │
│  └───────────────────────────────┬─────────────────────────────────────┘    │
│                                  │                                          │
│         ┌────────────────────────┼────────────────────────┐                 │
│         │                        │                        │                 │
│         ▼                        ▼                        ▼                 │
│  ┌─────────────┐         ┌─────────────┐         ┌─────────────┐           │
│  │   shared/   │         │   shared/   │         │   shared/   │           │
│  │ credentials │         │ resilience  │         │observability│           │
│  │             │         │             │         │             │           │
│  │ Credential  │         │ RetryExec   │         │  Tracer     │           │
│  │  Provider   │         │ CircuitBrkr │         │  Metrics    │           │
│  │ SecretStr   │         │ RateLimiter │         │  Logger     │           │
│  └─────────────┘         └─────────────┘         └─────────────┘           │
│                                                                              │
│         ┌────────────────────────┼────────────────────────┐                 │
│         │                        │                        │                 │
│         ▼                        ▼                        ▼                 │
│  ┌─────────────┐         ┌─────────────┐         ┌─────────────┐           │
│  │   shared/   │         │   shared/   │         │  Platform   │           │
│  │    http     │         │  database   │         │ Orchestrator│           │
│  │             │         │             │         │             │           │
│  │ HttpTransp. │         │ RuvVector   │         │ ModelAdapter│           │
│  │ TlsConfig   │         │ pgvector    │         │ UnifiedReq  │           │
│  │             │         │             │         │ UnifiedResp │           │
│  └─────────────┘         └─────────────┘         └─────────────┘           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Platform ModelAdapter Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MODEL ADAPTER INTEGRATION                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                   Platform Orchestrator                              │    │
│  │                                                                      │    │
│  │   invoke(provider: "hf-inference-endpoints", request)               │    │
│  └───────────────────────────────┬─────────────────────────────────────┘    │
│                                  │                                          │
│                                  ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                   HfInferenceAdapter                                 │    │
│  │                                                                      │    │
│  │   impl ModelAdapter {                                                │    │
│  │     provider_id() -> "hf-inference-endpoints"                       │    │
│  │                                                                      │    │
│  │     supported_capabilities() -> [                                   │    │
│  │       ChatCompletion, TextGeneration, Streaming,                    │    │
│  │       Embeddings, ImageGeneration, AudioTranscription,              │    │
│  │       TextToSpeech, FunctionCalling                                 │    │
│  │     ]                                                                │    │
│  │                                                                      │    │
│  │     invoke(UnifiedRequest) -> UnifiedResponse                       │    │
│  │     invoke_stream(UnifiedRequest) -> UnifiedStream                  │    │
│  │   }                                                                  │    │
│  └───────────────────────────────┬─────────────────────────────────────┘    │
│                                  │                                          │
│              ┌───────────────────┼───────────────────┐                      │
│              │                   │                   │                      │
│              ▼                   ▼                   ▼                      │
│  ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐         │
│  │ convert_to_hf_    │ │ HfInferenceClient │ │ convert_to_       │         │
│  │ chat_request()    │ │                   │ │ unified_response()│         │
│  │                   │ │ chat()            │ │                   │         │
│  │ UnifiedRequest    │ │ embeddings()      │ │ HfResponse →      │         │
│  │ → ChatRequest     │ │ image()           │ │ UnifiedResponse   │         │
│  └───────────────────┘ └───────────────────┘ └───────────────────┘         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Error Handling Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ERROR HANDLING ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         HfError Enum                                 │    │
│  │                                                                      │    │
│  │  ├── ValidationError { message }                                    │    │
│  │  ├── AuthenticationError { message }                                │    │
│  │  ├── PermissionDenied { message }                                   │    │
│  │  ├── NotFound { resource, message }                                 │    │
│  │  ├── RateLimited { retry_after_ms, message }                        │    │
│  │  ├── ModelLoading { message }           ◄── Cold start specific     │    │
│  │  ├── ColdStartTimeout { model, waited } ◄── Cold start specific     │    │
│  │  ├── EndpointPaused { endpoint }        ◄── Endpoint specific       │    │
│  │  ├── EndpointFailed { endpoint, msg }   ◄── Endpoint specific       │    │
│  │  ├── EndpointUnhealthy { message }                                  │    │
│  │  ├── ServiceUnavailable { message }                                 │    │
│  │  ├── GatewayTimeout { message }                                     │    │
│  │  ├── ServerError { status_code, message }                           │    │
│  │  └── NetworkError { source }                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Retry Classification:                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  ┌────────────────────┬─────────────────────────────────────────┐   │    │
│  │  │ Error Type         │ Retry Decision                          │   │    │
│  │  ├────────────────────┼─────────────────────────────────────────┤   │    │
│  │  │ RateLimited        │ RetryAfter(retry_after_ms)              │   │    │
│  │  │ ServiceUnavailable │ RetryWithBackoff                        │   │    │
│  │  │ GatewayTimeout     │ RetryWithBackoff                        │   │    │
│  │  │ ServerError (5xx)  │ RetryWithBackoff                        │   │    │
│  │  │ NetworkError       │ RetryWithBackoff                        │   │    │
│  │  │ ModelLoading       │ DoNotRetry (handled by cold start)      │   │    │
│  │  │ ValidationError    │ DoNotRetry                              │   │    │
│  │  │ AuthenticationError│ DoNotRetry                              │   │    │
│  │  │ EndpointPaused     │ DoNotRetry                              │   │    │
│  │  │ Others             │ DoNotRetry                              │   │    │
│  │  └────────────────────┴─────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Circuit Breaker:                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Per-Endpoint Circuit Breakers:                                     │    │
│  │  - Key: "{provider_type}:{model_or_endpoint}"                       │    │
│  │  - Config: failure_threshold=5, timeout=30s                         │    │
│  │                                                                      │    │
│  │  Example keys:                                                       │    │
│  │  - "serverless:meta-llama/Llama-2-7b-chat-hf"                       │    │
│  │  - "dedicated:my-endpoint"                                          │    │
│  │  - "together:mistralai/Mixtral-8x7B"                                │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Security Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SECURITY ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Token Handling:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   ┌─────────────────┐                                               │    │
│  │   │  SecretString   │  - Wraps HF_TOKEN                             │    │
│  │   │                 │  - Zeroize on drop                            │    │
│  │   │  impl Debug:    │  - Debug prints "[REDACTED]"                  │    │
│  │   │    "[REDACTED]" │  - Never logged                               │    │
│  │   └─────────────────┘                                               │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Endpoint Security Levels:                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   ┌──────────────┬─────────────────────────────────────────────┐    │    │
│  │   │ Level        │ Description                                  │    │    │
│  │   ├──────────────┼─────────────────────────────────────────────┤    │    │
│  │   │ Public       │ No auth required, anyone can access         │    │    │
│  │   │ Protected    │ HF token required (default)                 │    │    │
│  │   │ Private      │ VPC PrivateLink only (AWS/Azure)            │    │    │
│  │   └──────────────┴─────────────────────────────────────────────┘    │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Data Protection:                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   Never Log:                                                        │    │
│  │   - HF_TOKEN                                                        │    │
│  │   - Prompt content                                                  │    │
│  │   - Response content                                                │    │
│  │   - Embedding vectors                                               │    │
│  │   - Image/audio data                                                │    │
│  │                                                                      │    │
│  │   Safe to Log:                                                      │    │
│  │   - Model ID                                                        │    │
│  │   - Endpoint name                                                   │    │
│  │   - Token counts                                                    │    │
│  │   - Latency metrics                                                 │    │
│  │   - Error types (not messages with user content)                    │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  TLS Configuration:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   - Minimum TLS version: 1.2                                        │    │
│  │   - All HF endpoints use HTTPS                                      │    │
│  │   - Certificate validation enabled                                  │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 14. Open Questions Resolution

| Question | Resolution |
|----------|------------|
| OQ-1: How to handle model-specific parameters across 30+ task types? | **Task-specific parameter structs** - Each service (chat, embedding, image, audio) has its own request types with task-appropriate parameters |
| OQ-2: Manage endpoints or assume pre-deployed? | **Support both** - EndpointManagementService for CRUD, plus inference services work with any provider type |
| OQ-3: How to select optimal provider? | **ProviderResolver** - Explicit provider parameter, or default_provider config, or fallback to serverless |
| OQ-4: Namespace scoping? | **Config parameter** - `default_namespace` in config, can be overridden per-request |
| OQ-5: Cold-start waiting automatic or explicit? | **Configurable** - `auto_wait_for_model` flag (default: true) with `cold_start_timeout` |
| OQ-6: Multimodal inputs? | **ImageInput/AudioInput enums** - Accept file paths, URLs, base64, or raw bytes |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial architecture |

---

**End of Architecture Phase**

*Next Phase: Refinement — optimization, edge cases, and production hardening.*
