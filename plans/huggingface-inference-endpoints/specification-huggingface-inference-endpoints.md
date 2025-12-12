# SPARC Phase 1: Specification — Hugging Face Inference Endpoints Integration

**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/huggingface/inference-endpoints`

---

## 1. Executive Summary

This document specifies the integration adapter for Hugging Face Inference Endpoints, a managed service for deploying ML models on dedicated, autoscaling infrastructure. The integration supports dedicated endpoints (user-deployed models) and serverless inference API, providing access to 30+ task types including text generation, chat completion, embeddings, image generation, audio processing, and more.

### 1.1 Key Differentiators

| Feature | Hugging Face Inference Endpoints |
|---------|----------------------------------|
| Deployment Model | Dedicated endpoints + Serverless API |
| Model Source | Hugging Face Hub (200K+ models) |
| Task Types | 30+ (text, vision, audio, multimodal) |
| Endpoint Management | Full lifecycle (create, update, pause, resume, delete) |
| Scaling | Autoscaling with scale-to-zero |
| Providers | HF-native + 20+ third-party (Together, Replicate, Fireworks, etc.) |
| Security | Public, Protected (token), Private (VPC) |

---

## 2. API Specification

### 2.1 Base URLs

| Service | Base URL |
|---------|----------|
| Inference Endpoints Management | `https://api.endpoints.huggingface.cloud` |
| Serverless Inference API | `https://api-inference.huggingface.co` |
| Dedicated Endpoint (dynamic) | `https://{endpoint-name}.{region}.{vendor}.endpoints.huggingface.cloud` |
| Router API | `https://router.huggingface.co` |

### 2.2 Authentication

```
Authorization: Bearer {HF_TOKEN}
```

| Method | Description |
|--------|-------------|
| Bearer Token | User Access Token from huggingface.co/settings/tokens |
| Fine-grained Token | Scoped tokens with specific permissions |

Required scopes for Inference Endpoints:
- `read` - Query endpoints, run inference
- `write` - Create, update, delete endpoints
- `admin` - Full management access

### 2.3 Endpoint Management API

#### 2.3.1 List Endpoints

```
GET /v2/endpoint/{namespace}
```

**Response:**
```json
{
  "items": [
    {
      "name": "my-endpoint",
      "status": {
        "state": "running",
        "message": "Endpoint is running"
      },
      "url": "https://my-endpoint.us-east-1.aws.endpoints.huggingface.cloud",
      "model": {
        "repository": "meta-llama/Llama-2-7b-chat-hf",
        "revision": "main",
        "task": "text-generation",
        "framework": "pytorch"
      },
      "compute": {
        "accelerator": "gpu",
        "instanceType": "nvidia-a10g",
        "instanceSize": "medium",
        "scaling": {
          "minReplica": 1,
          "maxReplica": 4,
          "scaleToZeroTimeout": 15
        }
      },
      "provider": {
        "vendor": "aws",
        "region": "us-east-1"
      },
      "type": "protected",
      "createdAt": "2025-01-15T10:30:00Z",
      "updatedAt": "2025-01-15T12:00:00Z"
    }
  ]
}
```

#### 2.3.2 Create Endpoint

```
POST /v2/endpoint/{namespace}
Content-Type: application/json

{
  "name": "my-llm-endpoint",
  "type": "protected",
  "model": {
    "repository": "meta-llama/Llama-2-7b-chat-hf",
    "revision": "main",
    "task": "text-generation",
    "framework": "pytorch"
  },
  "provider": {
    "vendor": "aws",
    "region": "us-east-1"
  },
  "compute": {
    "accelerator": "gpu",
    "instanceType": "nvidia-a10g",
    "instanceSize": "medium",
    "scaling": {
      "minReplica": 1,
      "maxReplica": 4,
      "scaleToZeroTimeout": 15
    }
  },
  "custom": {
    "image": {
      "url": "ghcr.io/huggingface/text-generation-inference:latest"
    },
    "env": {
      "MAX_TOTAL_TOKENS": "4096"
    },
    "secrets": {}
  }
}
```

#### 2.3.3 Update Endpoint

```
PUT /v2/endpoint/{namespace}/{name}
```

#### 2.3.4 Delete Endpoint

```
DELETE /v2/endpoint/{namespace}/{name}
```

#### 2.3.5 Endpoint Lifecycle Operations

```
POST /v2/endpoint/{namespace}/{name}/pause
POST /v2/endpoint/{namespace}/{name}/resume
POST /v2/endpoint/{namespace}/{name}/scale-to-zero
```

### 2.4 Endpoint Status States

| State | Description |
|-------|-------------|
| `pending` | Endpoint is being created |
| `initializing` | Container is starting |
| `running` | Endpoint is ready for inference |
| `updating` | Configuration change in progress |
| `paused` | Manually paused, not charged |
| `scaledToZero` | Auto-scaled to zero, will cold-start on request |
| `failed` | Deployment failed |

---

## 3. Inference Task Types

### 3.1 Text Generation Tasks

| Task | Endpoint | Streaming | Description |
|------|----------|-----------|-------------|
| `text-generation` | `/generate` | Yes | Completion/generation |
| `chat-completion` | `/v1/chat/completions` | Yes | OpenAI-compatible chat |
| `summarization` | `/summarize` | No | Text summarization |
| `translation` | `/translate` | No | Language translation |

### 3.2 Text Understanding Tasks

| Task | Endpoint | Description |
|------|----------|-------------|
| `text-classification` | `/classify` | Sentiment, topic classification |
| `token-classification` | `/ner` | NER, POS tagging |
| `question-answering` | `/question-answering` | Extractive QA |
| `fill-mask` | `/fill-mask` | Masked language modeling |
| `zero-shot-classification` | `/zero-shot-classification` | Classification without training |
| `sentence-similarity` | `/sentence-similarity` | Semantic similarity |

### 3.3 Embedding / Feature Extraction

| Task | Endpoint | Description |
|------|----------|-------------|
| `feature-extraction` | `/embeddings` or `/feature-extraction` | Vector embeddings |

### 3.4 Vision Tasks

| Task | Endpoint | Description |
|------|----------|-------------|
| `image-classification` | `/classify` | Image categorization |
| `object-detection` | `/detect` | Bounding box detection |
| `image-segmentation` | `/segment` | Pixel-wise segmentation |
| `image-to-text` | `/image-to-text` | Captioning, OCR |
| `text-to-image` | `/text-to-image` | Image generation (SD, DALL-E) |
| `image-to-image` | `/image-to-image` | Style transfer, inpainting |
| `zero-shot-image-classification` | `/zero-shot-image-classification` | CLIP-style classification |
| `visual-question-answering` | `/visual-question-answering` | VQA |
| `document-question-answering` | `/document-question-answering` | Document VQA |

### 3.5 Audio Tasks

| Task | Endpoint | Description |
|------|----------|-------------|
| `automatic-speech-recognition` | `/asr` | Speech-to-text |
| `audio-classification` | `/audio-classification` | Audio categorization |
| `text-to-speech` | `/text-to-speech` | Speech synthesis |
| `audio-to-audio` | `/audio-to-audio` | Enhancement, separation |

### 3.6 Video Tasks

| Task | Endpoint | Description |
|------|----------|-------------|
| `text-to-video` | `/text-to-video` | Video generation |
| `image-to-video` | `/image-to-video` | Image animation |

### 3.7 Tabular Tasks

| Task | Endpoint | Description |
|------|----------|-------------|
| `table-question-answering` | `/table-question-answering` | SQL-like queries on tables |
| `tabular-classification` | `/tabular-classification` | Structured data classification |
| `tabular-regression` | `/tabular-regression` | Structured data regression |

---

## 4. Request/Response Formats

### 4.1 Chat Completion (OpenAI-Compatible)

**Request:**
```json
{
  "model": "meta-llama/Llama-2-7b-chat-hf",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ],
  "max_tokens": 512,
  "temperature": 0.7,
  "top_p": 0.9,
  "stream": false,
  "tools": [...],
  "tool_choice": "auto"
}
```

**Response:**
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1734000000,
  "model": "meta-llama/Llama-2-7b-chat-hf",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 10,
    "total_tokens": 35
  }
}
```

### 4.2 Text Generation

**Request:**
```json
{
  "inputs": "The quick brown fox",
  "parameters": {
    "max_new_tokens": 100,
    "temperature": 0.8,
    "top_p": 0.95,
    "top_k": 50,
    "repetition_penalty": 1.1,
    "do_sample": true,
    "return_full_text": false,
    "stop": ["\n", "###"]
  },
  "options": {
    "use_cache": true,
    "wait_for_model": true
  }
}
```

**Response:**
```json
[
  {
    "generated_text": " jumps over the lazy dog.",
    "details": {
      "finish_reason": "stop",
      "generated_tokens": 8,
      "seed": 12345
    }
  }
]
```

### 4.3 Feature Extraction (Embeddings)

**Request:**
```json
{
  "inputs": "This is a sentence to embed.",
  "parameters": {
    "normalize": true,
    "truncate": true
  }
}
```

**Response:**
```json
[[0.123, -0.456, 0.789, ...]]
```

### 4.4 Text-to-Image

**Request:**
```json
{
  "inputs": "A beautiful sunset over mountains",
  "parameters": {
    "negative_prompt": "blurry, low quality",
    "height": 512,
    "width": 512,
    "num_inference_steps": 30,
    "guidance_scale": 7.5,
    "seed": 42
  }
}
```

**Response:** Binary image data (PNG/JPEG) or base64-encoded string.

### 4.5 Streaming Format (SSE)

```
data: {"token": {"text": "Hello"}, "generated_text": null, "details": null}

data: {"token": {"text": " world"}, "generated_text": null, "details": null}

data: {"token": {"text": "!"}, "generated_text": "Hello world!", "details": {"finish_reason": "stop"}}

data: [DONE]
```

---

## 5. Compute Configuration

### 5.1 Accelerators

| Accelerator | Description |
|-------------|-------------|
| `cpu` | CPU-only instances |
| `gpu` | NVIDIA GPU instances |
| `inferentia` | AWS Inferentia2 |
| `tpu` | Google TPU |

### 5.2 Instance Types (GPU)

| Instance Type | GPU | Memory | Use Case |
|---------------|-----|--------|----------|
| `nvidia-t4` | T4 | 16GB | Small models, inference |
| `nvidia-l4` | L4 | 24GB | Medium models |
| `nvidia-a10g` | A10G | 24GB | Medium-large models |
| `nvidia-a100` | A100 | 40/80GB | Large models, LLMs |
| `nvidia-h100` | H100 | 80GB | Very large models |

### 5.3 Instance Sizes

| Size | vCPU | Memory | Typical Config |
|------|------|--------|----------------|
| `x1` | 1 | 2GB | Tiny models |
| `x2` | 2 | 4GB | Small models |
| `x4` | 4 | 8GB | Medium models |
| `x8` | 8 | 16GB | Large models |
| `xlarge` | 16+ | 32GB+ | Very large models |

### 5.4 Regions

| Vendor | Regions |
|--------|---------|
| AWS | us-east-1, us-west-2, eu-west-1, ap-northeast-1 |
| Azure | eastus, westeurope |
| GCP | us-central1, europe-west4 |

### 5.5 Scaling Configuration

```json
{
  "scaling": {
    "minReplica": 1,
    "maxReplica": 10,
    "scaleToZeroTimeout": 15
  }
}
```

| Parameter | Description | Default |
|-----------|-------------|---------|
| `minReplica` | Minimum instances (≥0 for scale-to-zero) | 1 |
| `maxReplica` | Maximum instances | 2 |
| `scaleToZeroTimeout` | Minutes before scaling to zero | 15 |

---

## 6. Third-Party Inference Providers

HF Inference supports routing to third-party providers:

| Provider | Capabilities |
|----------|--------------|
| `together` | LLMs, embeddings |
| `fireworks-ai` | LLMs, fast inference |
| `replicate` | Image/video generation |
| `fal-ai` | Image/video generation |
| `groq` | Fast LLM inference |
| `cerebras` | Fast LLM inference |
| `sambanova` | LLMs |
| `cohere` | Embeddings, rerank |
| `openai` | GPT models |
| `novita` | Image generation |

Provider selection:
```python
client = InferenceClient(provider="together")
```

---

## 7. Error Taxonomy

### 7.1 HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request (invalid parameters) |
| 401 | Unauthorized (invalid/missing token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Endpoint or model not found |
| 422 | Validation error |
| 429 | Rate limited |
| 500 | Server error |
| 502 | Bad gateway (endpoint unhealthy) |
| 503 | Service unavailable (endpoint scaling) |
| 504 | Gateway timeout |

### 7.2 Error Response Format

```json
{
  "error": "Model not found",
  "error_type": "NotFoundError",
  "warnings": ["Token count exceeds model limit"]
}
```

### 7.3 Specific Error Types

| Error Type | Description | Retry |
|------------|-------------|-------|
| `ValidationError` | Invalid input parameters | No |
| `AuthenticationError` | Invalid or expired token | No |
| `ModelNotFoundError` | Model/endpoint doesn't exist | No |
| `ModelLoadingError` | Model failed to load | Maybe |
| `InferenceTimeoutError` | Request timed out | Yes |
| `RateLimitError` | Too many requests | Yes (with backoff) |
| `QuotaExceededError` | Account quota exceeded | No |
| `EndpointPausedError` | Endpoint is paused | No |
| `EndpointScaledToZeroError` | Cold start in progress | Yes (wait) |

---

## 8. Interface Definitions

### 8.1 Core Types (Rust)

```rust
/// Hugging Face Inference Endpoints client configuration
pub struct HfInferenceConfig {
    pub token: SecretString,
    pub base_url: Option<String>,
    pub timeout: Duration,
    pub default_provider: Option<InferenceProvider>,
    pub resilience: ResilienceConfig,
}

/// Inference provider selection
pub enum InferenceProvider {
    HfInference,          // Serverless API
    Dedicated(String),    // Dedicated endpoint URL
    Together,
    FireworksAi,
    Replicate,
    FalAi,
    Groq,
    Cerebras,
    // ... other providers
}

/// Endpoint configuration for dedicated endpoints
pub struct EndpointConfig {
    pub name: String,
    pub namespace: String,
    pub model: ModelConfig,
    pub compute: ComputeConfig,
    pub provider: CloudProvider,
    pub endpoint_type: EndpointType,
    pub custom: Option<CustomConfig>,
}

/// Model configuration
pub struct ModelConfig {
    pub repository: String,
    pub revision: Option<String>,
    pub task: InferenceTask,
    pub framework: ModelFramework,
}

/// Compute configuration
pub struct ComputeConfig {
    pub accelerator: Accelerator,
    pub instance_type: String,
    pub instance_size: String,
    pub scaling: ScalingConfig,
}

/// Scaling configuration
pub struct ScalingConfig {
    pub min_replica: u32,
    pub max_replica: u32,
    pub scale_to_zero_timeout: Option<u32>,
}

/// Endpoint status
pub enum EndpointStatus {
    Pending,
    Initializing,
    Running,
    Updating,
    Paused,
    ScaledToZero,
    Failed(String),
}

/// Endpoint security type
pub enum EndpointType {
    Public,
    Protected,
    Private,
}

/// Inference task type
pub enum InferenceTask {
    // Text generation
    TextGeneration,
    ChatCompletion,
    Summarization,
    Translation,
    // Text understanding
    TextClassification,
    TokenClassification,
    QuestionAnswering,
    FillMask,
    ZeroShotClassification,
    SentenceSimilarity,
    // Embeddings
    FeatureExtraction,
    // Vision
    ImageClassification,
    ObjectDetection,
    ImageSegmentation,
    ImageToText,
    TextToImage,
    ImageToImage,
    ZeroShotImageClassification,
    VisualQuestionAnswering,
    DocumentQuestionAnswering,
    // Audio
    AutomaticSpeechRecognition,
    AudioClassification,
    TextToSpeech,
    AudioToAudio,
    // Video
    TextToVideo,
    ImageToVideo,
    // Tabular
    TableQuestionAnswering,
    TabularClassification,
    TabularRegression,
    // Custom
    Custom(String),
}

/// Cloud provider
pub struct CloudProvider {
    pub vendor: CloudVendor,
    pub region: String,
}

pub enum CloudVendor {
    Aws,
    Azure,
    Gcp,
}

pub enum Accelerator {
    Cpu,
    Gpu,
    Inferentia,
    Tpu,
}

pub enum ModelFramework {
    PyTorch,
    TensorFlow,
    Custom,
}
```

### 8.2 Service Traits

```rust
/// Main client trait
#[async_trait]
pub trait HfInferenceClient: Send + Sync {
    fn chat(&self) -> &dyn ChatService;
    fn text_generation(&self) -> &dyn TextGenerationService;
    fn embeddings(&self) -> &dyn EmbeddingService;
    fn image(&self) -> &dyn ImageService;
    fn audio(&self) -> &dyn AudioService;
    fn endpoints(&self) -> &dyn EndpointManagementService;
}

/// Chat completion service
#[async_trait]
pub trait ChatService: Send + Sync {
    async fn complete(&self, request: ChatRequest) -> Result<ChatResponse, HfError>;
    async fn stream(&self, request: ChatRequest) -> Result<ChatStream, HfError>;
}

/// Text generation service
#[async_trait]
pub trait TextGenerationService: Send + Sync {
    async fn generate(&self, request: TextGenerationRequest) -> Result<TextGenerationResponse, HfError>;
    async fn stream(&self, request: TextGenerationRequest) -> Result<TextGenerationStream, HfError>;
}

/// Embedding service
#[async_trait]
pub trait EmbeddingService: Send + Sync {
    async fn create(&self, request: EmbeddingRequest) -> Result<EmbeddingResponse, HfError>;
    async fn create_batch(&self, request: BatchEmbeddingRequest) -> Result<BatchEmbeddingResponse, HfError>;
}

/// Image service
#[async_trait]
pub trait ImageService: Send + Sync {
    async fn generate(&self, request: TextToImageRequest) -> Result<ImageResponse, HfError>;
    async fn classify(&self, request: ImageClassificationRequest) -> Result<ClassificationResponse, HfError>;
    async fn detect(&self, request: ObjectDetectionRequest) -> Result<DetectionResponse, HfError>;
    async fn caption(&self, request: ImageToTextRequest) -> Result<CaptionResponse, HfError>;
}

/// Audio service
#[async_trait]
pub trait AudioService: Send + Sync {
    async fn transcribe(&self, request: AsrRequest) -> Result<TranscriptionResponse, HfError>;
    async fn synthesize(&self, request: TtsRequest) -> Result<AudioResponse, HfError>;
    async fn classify(&self, request: AudioClassificationRequest) -> Result<ClassificationResponse, HfError>;
}

/// Endpoint management service
#[async_trait]
pub trait EndpointManagementService: Send + Sync {
    async fn list(&self, namespace: &str) -> Result<Vec<EndpointInfo>, HfError>;
    async fn get(&self, namespace: &str, name: &str) -> Result<EndpointInfo, HfError>;
    async fn create(&self, config: EndpointConfig) -> Result<EndpointInfo, HfError>;
    async fn update(&self, namespace: &str, name: &str, update: EndpointUpdate) -> Result<EndpointInfo, HfError>;
    async fn delete(&self, namespace: &str, name: &str) -> Result<(), HfError>;
    async fn pause(&self, namespace: &str, name: &str) -> Result<EndpointInfo, HfError>;
    async fn resume(&self, namespace: &str, name: &str) -> Result<EndpointInfo, HfError>;
    async fn scale_to_zero(&self, namespace: &str, name: &str) -> Result<EndpointInfo, HfError>;
    async fn wait_for_running(&self, namespace: &str, name: &str, timeout: Duration) -> Result<EndpointInfo, HfError>;
}
```

### 8.3 Request/Response Types

```rust
/// Chat completion request
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub frequency_penalty: Option<f32>,
    pub presence_penalty: Option<f32>,
    pub stop: Option<Vec<String>>,
    pub stream: Option<bool>,
    pub tools: Option<Vec<Tool>>,
    pub tool_choice: Option<ToolChoice>,
    pub response_format: Option<ResponseFormat>,
}

/// Chat completion response
pub struct ChatResponse {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<ChatChoice>,
    pub usage: TokenUsage,
}

/// Text generation request
pub struct TextGenerationRequest {
    pub inputs: String,
    pub model: Option<String>,
    pub parameters: TextGenerationParameters,
    pub options: Option<InferenceOptions>,
}

pub struct TextGenerationParameters {
    pub max_new_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub top_k: Option<u32>,
    pub repetition_penalty: Option<f32>,
    pub do_sample: Option<bool>,
    pub return_full_text: Option<bool>,
    pub stop: Option<Vec<String>>,
    pub seed: Option<u64>,
}

/// Embedding request
pub struct EmbeddingRequest {
    pub inputs: EmbeddingInput,
    pub model: Option<String>,
    pub normalize: Option<bool>,
    pub truncate: Option<bool>,
    pub prompt_name: Option<String>,
}

pub enum EmbeddingInput {
    Single(String),
    Multiple(Vec<String>),
}

/// Embedding response
pub struct EmbeddingResponse {
    pub embeddings: Vec<Vec<f32>>,
    pub model: String,
    pub usage: Option<EmbeddingUsage>,
}

/// Token usage
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}
```

---

## 9. Constraints

### 9.1 Functional Constraints

| Constraint | Description |
|------------|-------------|
| FC-1 | Must support both dedicated endpoints and serverless inference |
| FC-2 | Must handle all 30+ inference task types through unified interface |
| FC-3 | Must support endpoint lifecycle management (CRUD, pause/resume) |
| FC-4 | Must handle scale-to-zero cold starts gracefully |
| FC-5 | Must support streaming for text generation and chat |
| FC-6 | Must support third-party provider routing |
| FC-7 | Must extract usage statistics when available |

### 9.2 Non-Functional Constraints

| Constraint | Description |
|------------|-------------|
| NFC-1 | Token never logged; use SecretString |
| NFC-2 | Response latency overhead < 15ms |
| NFC-3 | Support concurrent requests to multiple endpoints |
| NFC-4 | Handle cold start delays (up to 5 minutes for large models) |
| NFC-5 | Integrate with shared/resilience for retry/circuit breaker |
| NFC-6 | Integrate with shared/observability for metrics/tracing |

### 9.3 Integration Constraints

| Constraint | Description |
|------------|-------------|
| IC-1 | Implement platform ModelAdapter trait |
| IC-2 | Support RuvVector embedding storage |
| IC-3 | No duplication of shared infra |
| IC-4 | Compatible with multi-model orchestration |

---

## 10. Open Questions

| ID | Question | Impact | Resolution |
|----|----------|--------|------------|
| OQ-1 | How to handle model-specific parameters across 30+ task types? | High | Task-specific parameter structs with validation |
| OQ-2 | Should we manage endpoints or assume pre-deployed? | Medium | Support both: management API + inference-only mode |
| OQ-3 | How to select optimal provider for a given model? | Medium | Provider registry with model-capability mapping |
| OQ-4 | How to handle namespace scoping (user vs org)? | Low | Namespace as config parameter, default to user |
| OQ-5 | Should cold-start waiting be automatic or explicit? | Medium | Configurable: auto-wait with timeout, or return error |
| OQ-6 | How to handle multimodal inputs (images, audio)? | High | Accept file paths, URLs, base64, or byte streams |

---

## 11. Dependencies

### 11.1 Shared Module Dependencies

| Module | Purpose |
|--------|---------|
| `shared/credentials` | Token management, SecretString |
| `shared/resilience` | Retry, circuit breaker, rate limiting |
| `shared/observability` | Tracing, metrics, logging |
| `shared/database` | RuvVector (pgvector) for embeddings |
| `shared/http` | HTTP transport abstraction |

### 11.2 External Dependencies

| Dependency | Purpose |
|------------|---------|
| `reqwest` | HTTP client |
| `tokio` | Async runtime |
| `serde` / `serde_json` | Serialization |
| `futures` | Stream handling |
| `base64` | Image/audio encoding |

---

## 12. Acceptance Criteria

### 12.1 Functional Acceptance

- [ ] Chat completion works with OpenAI-compatible format
- [ ] Text generation works with HF native format
- [ ] Streaming works for chat and text generation
- [ ] Embeddings work with single and batch inputs
- [ ] Image generation works with text-to-image
- [ ] ASR/TTS work for audio tasks
- [ ] Endpoint management (list, create, update, delete) works
- [ ] Endpoint lifecycle (pause, resume, scale-to-zero) works
- [ ] Third-party provider routing works
- [ ] Cold-start handling works with configurable timeout

### 12.2 Non-Functional Acceptance

- [ ] Token never appears in logs
- [ ] Metrics captured for all operations
- [ ] Traces include endpoint name, model, task type
- [ ] RuvVector embedding storage works
- [ ] Platform ModelAdapter integration works

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial specification |

---

**End of Specification Phase**

*Next Phase: Architecture — component design, data flow, and module structure.*

---

## Sources

- [Inference Endpoints Documentation](https://huggingface.co/docs/inference-endpoints/index)
- [API Reference (Swagger)](https://huggingface.co/docs/inference-endpoints/en/api_reference)
- [Hugging Face Hub Package Reference](https://huggingface.co/docs/huggingface_hub/en/package_reference/inference_endpoints)
- [Inference Providers](https://huggingface.co/docs/inference-providers/index)
- [Advanced Setup Guide](https://huggingface.co/docs/inference-endpoints/en/guides/advanced)
