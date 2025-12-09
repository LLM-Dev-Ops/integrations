# Specification: Cohere Integration Module

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-09
**Status:** COMPLETE

---

## Table of Contents

1. [Overview](#1-overview)
2. [Functional Requirements](#2-functional-requirements)
3. [Non-Functional Requirements](#3-non-functional-requirements)
4. [API Coverage](#4-api-coverage)
5. [Data Types](#5-data-types)
6. [Error Taxonomy](#6-error-taxonomy)
7. [Resilience Hooks](#7-resilience-hooks)
8. [Security Requirements](#8-security-requirements)
9. [Observability Requirements](#9-observability-requirements)
10. [Testing Requirements](#10-testing-requirements)
11. [Configuration](#11-configuration)
12. [Constraints](#12-constraints)

---

## 1. Overview

### 1.1 Purpose

The Cohere Integration Module provides production-ready, type-safe client libraries for Rust and TypeScript to interact with Cohere's AI platform APIs. The module enables developers to leverage Cohere's language models for chat, text generation, embeddings, reranking, classification, and document analysis.

### 1.2 Scope

**In Scope:**
- Chat API (conversational AI with tool use)
- Generate API (text generation/completion)
- Embed API (text embeddings)
- Rerank API (semantic reranking)
- Classify API (text classification)
- Summarize API (document summarization)
- Tokenize/Detokenize APIs
- Models API (model listing)
- Datasets API (dataset management)
- Connectors API (RAG connectors)
- Fine-tuning API (custom model training)
- Streaming support (SSE for chat/generate)
- Tool/function calling
- RAG (Retrieval-Augmented Generation) support
- Multi-language embeddings

**Out of Scope:**
- Cohere Coral (web interface)
- Cohere Compass (enterprise search product)
- Layer 0 (ruvbase) integration
- Cross-provider abstractions
- GUI/CLI tooling

### 1.3 Definitions

| Term | Definition |
|------|------------|
| RAG | Retrieval-Augmented Generation - combining retrieval with generation |
| Connector | A data source integration for RAG |
| Rerank | Semantic reordering of documents by relevance |
| Embed | Convert text to vector embeddings |
| BPE | Byte-Pair Encoding tokenization |
| Preamble | System message/instructions for chat |
| Citation | Source reference in generated content |

---

## 2. Functional Requirements

### 2.1 Core Client Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-C01 | Initialize client with API key | Must | Via constructor or environment |
| FR-C02 | Configure base URL | Must | Default: api.cohere.com |
| FR-C03 | Configure request timeout | Must | Default: 120 seconds |
| FR-C04 | Configure retry policy | Must | Exponential backoff |
| FR-C05 | Configure circuit breaker | Should | Prevent cascade failures |
| FR-C06 | Configure rate limiting | Should | Client-side throttling |
| FR-C07 | Support custom HTTP headers | Should | For proxies, tracing |
| FR-C08 | Thread-safe client instance | Must | Safe for concurrent use |
| FR-C09 | Clone/share client cheaply | Should | Arc-based sharing |
| FR-C10 | Builder pattern for configuration | Must | Ergonomic setup |

### 2.2 Chat API Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-CH01 | Create chat completion | Must | Synchronous response |
| FR-CH02 | Stream chat completion | Must | SSE streaming |
| FR-CH03 | Support conversation history | Must | Multi-turn conversations |
| FR-CH04 | Support preamble/system message | Must | Model behavior customization |
| FR-CH05 | Support tool definitions | Must | Function calling |
| FR-CH06 | Support tool results | Must | Tool response handling |
| FR-CH07 | Support connectors (RAG) | Should | Document retrieval |
| FR-CH08 | Support search queries mode | Should | Optimized for search |
| FR-CH09 | Support citation generation | Should | Source attribution |
| FR-CH10 | Support response format | Should | JSON mode |
| FR-CH11 | Configure temperature | Must | Sampling control |
| FR-CH12 | Configure max tokens | Must | Output length limit |
| FR-CH13 | Configure presence/frequency penalty | Should | Repetition control |
| FR-CH14 | Support stop sequences | Should | Custom stop tokens |
| FR-CH15 | Configure seed for reproducibility | Should | Deterministic output |

### 2.3 Generate API Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-G01 | Generate text completion | Must | Single prompt |
| FR-G02 | Stream text completion | Must | SSE streaming |
| FR-G03 | Configure model | Must | Model selection |
| FR-G04 | Configure temperature | Must | Randomness control |
| FR-G05 | Configure max tokens | Must | Output length |
| FR-G06 | Configure top-k sampling | Should | Token selection |
| FR-G07 | Configure top-p (nucleus) sampling | Should | Probability threshold |
| FR-G08 | Configure presence penalty | Should | Topic diversity |
| FR-G09 | Configure frequency penalty | Should | Word repetition |
| FR-G10 | Support stop sequences | Should | Custom stops |
| FR-G11 | Support return likelihoods | Should | Token probabilities |
| FR-G12 | Support truncate option | Should | Input handling |

### 2.4 Embed API Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-E01 | Generate embeddings for texts | Must | Batch support |
| FR-E02 | Support input types | Must | search_document, search_query, classification, clustering |
| FR-E03 | Configure embedding model | Must | embed-english-v3.0, embed-multilingual-v3.0 |
| FR-E04 | Configure truncation | Should | Handle long inputs |
| FR-E05 | Return embedding dimensions | Should | Vector size info |
| FR-E06 | Support embedding compression | Should | int8, uint8, binary, ubinary |
| FR-E07 | Batch size optimization | Should | Efficient batching |

### 2.5 Rerank API Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-R01 | Rerank documents by query | Must | Semantic ordering |
| FR-R02 | Configure rerank model | Must | rerank-english-v3.0, rerank-multilingual-v3.0 |
| FR-R03 | Configure top-n results | Must | Limit returned docs |
| FR-R04 | Return relevance scores | Must | Ranking confidence |
| FR-R05 | Support max chunks per doc | Should | Long document handling |
| FR-R06 | Return document indices | Must | Original order reference |

### 2.6 Classify API Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-CL01 | Classify texts | Must | Multi-class support |
| FR-CL02 | Support few-shot examples | Must | In-context learning |
| FR-CL03 | Configure classification model | Should | Model selection |
| FR-CL04 | Return confidence scores | Must | Per-class probabilities |
| FR-CL05 | Support preset (fine-tuned) | Should | Custom classifiers |
| FR-CL06 | Configure truncation | Should | Input handling |

### 2.7 Summarize API Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-S01 | Summarize text | Must | Document condensation |
| FR-S02 | Configure summary length | Must | paragraph, bullets, auto |
| FR-S03 | Configure summary format | Must | Structured output |
| FR-S04 | Configure extractiveness | Should | Control abstraction level |
| FR-S05 | Support additional command | Should | Custom instructions |
| FR-S06 | Configure temperature | Should | Creativity control |

### 2.8 Tokenize/Detokenize API Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-T01 | Tokenize text | Must | Text to tokens |
| FR-T02 | Detokenize tokens | Must | Tokens to text |
| FR-T03 | Return token strings | Should | Human-readable |
| FR-T04 | Configure model | Must | Model-specific tokenization |

### 2.9 Models API Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-M01 | List available models | Must | Model discovery |
| FR-M02 | Get model details | Should | Capabilities, limits |
| FR-M03 | Filter by endpoint | Should | chat, generate, embed |

### 2.10 Datasets API Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-D01 | Create dataset | Must | For fine-tuning |
| FR-D02 | List datasets | Must | Dataset discovery |
| FR-D03 | Get dataset details | Must | Metadata, status |
| FR-D04 | Delete dataset | Must | Cleanup |
| FR-D05 | Upload dataset file | Must | JSONL, CSV support |
| FR-D06 | Validate dataset | Should | Pre-upload validation |

### 2.11 Connectors API Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-CN01 | Create connector | Must | RAG data source |
| FR-CN02 | List connectors | Must | Connector discovery |
| FR-CN03 | Get connector details | Must | Configuration, status |
| FR-CN04 | Update connector | Should | Modify settings |
| FR-CN05 | Delete connector | Must | Cleanup |
| FR-CN06 | OAuth connector flow | Should | Third-party auth |

### 2.12 Fine-tuning API Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-F01 | Create fine-tuned model | Must | Custom training |
| FR-F02 | List fine-tuned models | Must | Model discovery |
| FR-F03 | Get fine-tuned model details | Must | Training status |
| FR-F04 | Delete fine-tuned model | Must | Cleanup |
| FR-F05 | Configure hyperparameters | Should | Training control |
| FR-F06 | Support evaluation metrics | Should | Quality tracking |

---

## 3. Non-Functional Requirements

### 3.1 Performance Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-P01 | Request serialization overhead | < 5ms p99 | JSON encoding |
| NFR-P02 | Response parsing overhead | < 10ms p99 | JSON decoding |
| NFR-P03 | SSE chunk parsing | < 0.5ms p99 | Per chunk |
| NFR-P04 | Concurrent requests | 500+ | With shared client |
| NFR-P05 | Memory per request | < 100KB | Excluding response |
| NFR-P06 | Connection pool efficiency | 90%+ reuse | Keep-alive |
| NFR-P07 | Time to first token (stream) | < 5ms overhead | Client-side only |

### 3.2 Reliability Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-R01 | Retry transient failures | 3 attempts default | Configurable |
| NFR-R02 | Exponential backoff | 100ms → 30s | With jitter |
| NFR-R03 | Circuit breaker threshold | 5 failures | Configurable |
| NFR-R04 | Circuit breaker recovery | 60s timeout | Half-open test |
| NFR-R05 | Rate limit handling | Respect Retry-After | Automatic wait |
| NFR-R06 | Graceful degradation | Fail fast when circuit open | Clear error |

### 3.3 Security Requirements

| ID | Requirement | Notes |
|----|-------------|-------|
| NFR-S01 | TLS 1.2+ required | No fallback to older versions |
| NFR-S02 | API key protection | SecretString type, never logged |
| NFR-S03 | Credential redaction in logs | Authorization header hidden |
| NFR-S04 | No credential in error messages | Sanitized output |
| NFR-S05 | Memory zeroization | Secrets cleared on drop |
| NFR-S06 | Certificate validation | System trust store |

### 3.4 Observability Requirements

| ID | Requirement | Notes |
|----|-------------|-------|
| NFR-O01 | Distributed tracing | OpenTelemetry compatible |
| NFR-O02 | Structured logging | JSON format support |
| NFR-O03 | Metrics collection | Request count, latency, errors |
| NFR-O04 | Token usage tracking | Prompt and completion tokens |
| NFR-O05 | Stream metrics | TTFT, chunk count, duration |

### 3.5 Compatibility Requirements

| ID | Requirement | Notes |
|----|-------------|-------|
| NFR-C01 | Rust MSRV | 1.75.0 (async traits) |
| NFR-C02 | Node.js version | >= 18.0.0 |
| NFR-C03 | TypeScript version | >= 5.0.0 |
| NFR-C04 | Async runtime (Rust) | Tokio 1.x |
| NFR-C05 | HTTP client (Rust) | reqwest with rustls |

---

## 4. API Coverage

### 4.1 Endpoint Mapping

| Endpoint | Method | Description | Priority |
|----------|--------|-------------|----------|
| `/v1/chat` | POST | Chat completion | Must |
| `/v1/generate` | POST | Text generation | Must |
| `/v1/embed` | POST | Generate embeddings | Must |
| `/v1/rerank` | POST | Rerank documents | Must |
| `/v1/classify` | POST | Text classification | Must |
| `/v1/summarize` | POST | Summarize text | Should |
| `/v1/tokenize` | POST | Tokenize text | Must |
| `/v1/detokenize` | POST | Detokenize tokens | Must |
| `/v1/models` | GET | List models | Must |
| `/v1/models/{model_id}` | GET | Get model | Should |
| `/v1/datasets` | POST | Create dataset | Should |
| `/v1/datasets` | GET | List datasets | Should |
| `/v1/datasets/{id}` | GET | Get dataset | Should |
| `/v1/datasets/{id}` | DELETE | Delete dataset | Should |
| `/v1/connectors` | POST | Create connector | Should |
| `/v1/connectors` | GET | List connectors | Should |
| `/v1/connectors/{id}` | GET | Get connector | Should |
| `/v1/connectors/{id}` | PATCH | Update connector | Should |
| `/v1/connectors/{id}` | DELETE | Delete connector | Should |
| `/v1/finetuning/finetuned-models` | POST | Create fine-tuned model | Should |
| `/v1/finetuning/finetuned-models` | GET | List fine-tuned models | Should |
| `/v1/finetuning/finetuned-models/{id}` | GET | Get fine-tuned model | Should |
| `/v1/finetuning/finetuned-models/{id}` | DELETE | Delete fine-tuned model | Should |

### 4.2 Streaming Endpoints

| Endpoint | Stream Type | Events |
|----------|-------------|--------|
| `/v1/chat` | SSE | text-generation, citation-generation, tool-calls-generation, stream-end |
| `/v1/generate` | SSE | text-generation, stream-end |

### 4.3 Model Support

| Model Family | Models | Capabilities |
|--------------|--------|--------------|
| Command | command-r-plus, command-r, command | Chat, Generate, RAG |
| Command Light | command-light | Chat, Generate (faster) |
| Embed | embed-english-v3.0, embed-multilingual-v3.0, embed-english-light-v3.0, embed-multilingual-light-v3.0 | Embeddings |
| Rerank | rerank-english-v3.0, rerank-multilingual-v3.0, rerank-english-v2.0, rerank-multilingual-v2.0 | Reranking |

---

## 5. Data Types

### 5.1 Chat Types

```
ChatRequest:
  model: String                          # Required: Model ID
  message: String                        # Required: User message
  chat_history: Option<Vec<ChatMessage>> # Previous conversation
  preamble: Option<String>               # System instructions
  conversation_id: Option<String>        # Session tracking
  tools: Option<Vec<Tool>>               # Function definitions
  tool_results: Option<Vec<ToolResult>>  # Tool responses
  connectors: Option<Vec<Connector>>     # RAG sources
  search_queries_only: Option<bool>      # Query extraction mode
  documents: Option<Vec<Document>>       # Inline documents for RAG
  citation_quality: Option<CitationQuality> # Citation precision
  temperature: Option<f64>               # 0.0 to 1.0
  max_tokens: Option<u32>                # Output limit
  max_input_tokens: Option<u32>          # Input limit
  k: Option<u32>                         # Top-k sampling
  p: Option<f64>                         # Top-p sampling
  seed: Option<i64>                      # Reproducibility
  stop_sequences: Option<Vec<String>>    # Stop tokens
  frequency_penalty: Option<f64>         # 0.0 to 1.0
  presence_penalty: Option<f64>          # 0.0 to 1.0
  response_format: Option<ResponseFormat> # JSON mode
  stream: Option<bool>                   # Enable streaming

ChatMessage:
  role: ChatRole                         # USER, CHATBOT, SYSTEM, TOOL
  message: String                        # Content
  tool_calls: Option<Vec<ToolCall>>      # For CHATBOT role
  tool_results: Option<Vec<ToolResult>>  # For TOOL role

ChatRole:
  USER
  CHATBOT
  SYSTEM
  TOOL

ChatResponse:
  id: String                             # Generation ID
  text: String                           # Generated response
  generation_id: String                  # Unique generation identifier
  chat_history: Vec<ChatMessage>         # Full conversation
  finish_reason: FinishReason            # COMPLETE, MAX_TOKENS, STOP_SEQUENCE, TOOL_CALL
  meta: ResponseMeta                     # Usage statistics
  citations: Option<Vec<Citation>>       # Source citations
  documents: Option<Vec<Document>>       # Retrieved documents
  search_queries: Option<Vec<SearchQuery>> # Generated queries
  search_results: Option<Vec<SearchResult>> # Search results
  tool_calls: Option<Vec<ToolCall>>      # Requested tool calls

FinishReason:
  COMPLETE
  MAX_TOKENS
  STOP_SEQUENCE
  TOOL_CALL
  ERROR

ResponseMeta:
  api_version: ApiVersion
  billed_units: BilledUnits
  tokens: Option<TokenCount>
  warnings: Option<Vec<String>>

BilledUnits:
  input_tokens: Option<u32>
  output_tokens: Option<u32>
  search_units: Option<u32>
  classifications: Option<u32>

TokenCount:
  input_tokens: u32
  output_tokens: u32

Tool:
  name: String                           # Function name
  description: String                    # Function description
  parameter_definitions: Option<Map<String, ParameterDefinition>>

ParameterDefinition:
  description: Option<String>
  type: String                           # string, number, boolean, object, array
  required: Option<bool>

ToolCall:
  id: String                             # Tool call ID
  name: String                           # Function name
  parameters: Map<String, Value>         # Function arguments

ToolResult:
  call: ToolCall                         # Original call
  outputs: Vec<Map<String, Value>>       # Tool outputs

Citation:
  start: u32                             # Start index in text
  end: u32                               # End index in text
  text: String                           # Cited text
  document_ids: Vec<String>              # Source document IDs

Document:
  id: Option<String>                     # Document ID
  data: Map<String, String>              # Document content (text, title, etc.)

Connector:
  id: String                             # Connector ID
  options: Option<ConnectorOptions>      # Connector settings

ConnectorOptions:
  search_options: Option<Map<String, Value>>

SearchQuery:
  text: String                           # Query text
  generation_id: String                  # Associated generation

ResponseFormat:
  type: ResponseFormatType               # text, json_object
  schema: Option<JsonSchema>             # For structured output

CitationQuality:
  FAST
  ACCURATE
```

### 5.2 Generate Types

```
GenerateRequest:
  prompt: String                         # Required: Input text
  model: Option<String>                  # Model ID
  num_generations: Option<u32>           # Multiple completions
  max_tokens: Option<u32>                # Output limit
  temperature: Option<f64>               # 0.0 to 5.0
  k: Option<u32>                         # Top-k sampling
  p: Option<f64>                         # Top-p sampling (0.0 to 0.99)
  frequency_penalty: Option<f64>         # 0.0 to 1.0
  presence_penalty: Option<f64>          # 0.0 to 1.0
  stop_sequences: Option<Vec<String>>    # Stop tokens
  return_likelihoods: Option<ReturnLikelihoods> # Token probabilities
  truncate: Option<Truncate>             # Input truncation
  stream: Option<bool>                   # Enable streaming
  seed: Option<i64>                      # Reproducibility

ReturnLikelihoods:
  NONE
  GENERATION
  ALL

Truncate:
  NONE
  START
  END

GenerateResponse:
  id: String                             # Request ID
  generations: Vec<Generation>           # Generated texts
  prompt: Option<String>                 # Echo input
  meta: ResponseMeta                     # Usage stats

Generation:
  id: String                             # Generation ID
  text: String                           # Generated text
  index: Option<u32>                     # Generation index
  likelihood: Option<f64>                # Log likelihood
  token_likelihoods: Option<Vec<TokenLikelihood>> # Per-token
  finish_reason: FinishReason            # Completion reason

TokenLikelihood:
  token: String
  likelihood: f64
```

### 5.3 Embed Types

```
EmbedRequest:
  texts: Vec<String>                     # Required: Input texts
  model: Option<String>                  # Embedding model
  input_type: EmbedInputType             # Required: Use case
  embedding_types: Option<Vec<EmbeddingType>> # Output formats
  truncate: Option<Truncate>             # Input handling

EmbedInputType:
  SEARCH_DOCUMENT                        # For indexing
  SEARCH_QUERY                           # For querying
  CLASSIFICATION                         # For classification
  CLUSTERING                             # For clustering

EmbeddingType:
  FLOAT                                  # float32 (default)
  INT8                                   # int8 quantized
  UINT8                                  # uint8 quantized
  BINARY                                 # binary quantized
  UBINARY                                # unsigned binary

EmbedResponse:
  id: String                             # Request ID
  embeddings: EmbeddingsResult           # Embedding vectors
  texts: Vec<String>                     # Input texts (echo)
  meta: ResponseMeta                     # Usage stats

EmbeddingsResult:
  float: Option<Vec<Vec<f32>>>           # float32 embeddings
  int8: Option<Vec<Vec<i8>>>             # int8 embeddings
  uint8: Option<Vec<Vec<u8>>>            # uint8 embeddings
  binary: Option<Vec<Vec<i8>>>           # binary embeddings
  ubinary: Option<Vec<Vec<u8>>>          # unsigned binary embeddings
```

### 5.4 Rerank Types

```
RerankRequest:
  query: String                          # Required: Search query
  documents: Vec<RerankDocument>         # Required: Documents to rerank
  model: Option<String>                  # Rerank model
  top_n: Option<u32>                     # Number to return
  max_chunks_per_doc: Option<u32>        # Long doc handling
  return_documents: Option<bool>         # Include doc content

RerankDocument:
  text: String                           # Document text

RerankResponse:
  id: String                             # Request ID
  results: Vec<RerankResult>             # Ranked results
  meta: ResponseMeta                     # Usage stats

RerankResult:
  index: u32                             # Original document index
  relevance_score: f64                   # Relevance score (0.0 to 1.0)
  document: Option<RerankDocument>       # Document content (if requested)
```

### 5.5 Classify Types

```
ClassifyRequest:
  inputs: Vec<String>                    # Required: Texts to classify
  examples: Option<Vec<ClassifyExample>> # Few-shot examples
  model: Option<String>                  # Classification model
  preset: Option<String>                 # Fine-tuned classifier ID
  truncate: Option<Truncate>             # Input handling

ClassifyExample:
  text: String                           # Example text
  label: String                          # Example label

ClassifyResponse:
  id: String                             # Request ID
  classifications: Vec<Classification>   # Results
  meta: ResponseMeta                     # Usage stats

Classification:
  id: String                             # Classification ID
  input: String                          # Input text
  prediction: String                     # Predicted label
  predictions: Vec<String>               # Alternate predictions
  confidence: f64                        # Top prediction confidence
  confidences: Vec<LabelConfidence>      # Per-label confidence
  labels: Map<String, LabelConfidence>   # Label scores

LabelConfidence:
  confidence: f64                        # 0.0 to 1.0
```

### 5.6 Summarize Types

```
SummarizeRequest:
  text: String                           # Required: Text to summarize
  model: Option<String>                  # Model ID
  length: Option<SummaryLength>          # Output length
  format: Option<SummaryFormat>          # Output format
  extractiveness: Option<Extractiveness> # Abstraction level
  temperature: Option<f64>               # Creativity (0.0 to 5.0)
  additional_command: Option<String>     # Extra instructions

SummaryLength:
  SHORT
  MEDIUM
  LONG
  AUTO

SummaryFormat:
  PARAGRAPH
  BULLETS
  AUTO

Extractiveness:
  LOW                                    # More abstractive
  MEDIUM
  HIGH                                   # More extractive
  AUTO

SummarizeResponse:
  id: String                             # Request ID
  summary: String                        # Generated summary
  meta: ResponseMeta                     # Usage stats
```

### 5.7 Tokenize/Detokenize Types

```
TokenizeRequest:
  text: String                           # Required: Text to tokenize
  model: String                          # Required: Model for tokenization

TokenizeResponse:
  tokens: Vec<i64>                       # Token IDs
  token_strings: Vec<String>             # Token strings
  meta: ResponseMeta                     # Usage stats

DetokenizeRequest:
  tokens: Vec<i64>                       # Required: Token IDs
  model: String                          # Required: Model for detokenization

DetokenizeResponse:
  text: String                           # Reconstructed text
  meta: ResponseMeta                     # Usage stats
```

### 5.8 Dataset Types

```
CreateDatasetRequest:
  name: String                           # Required: Dataset name
  type: DatasetType                      # Required: Dataset type
  keep_original_file: Option<bool>       # Preserve upload
  skip_malformed_input: Option<bool>     # Error handling
  keep_fields: Option<Vec<String>>       # Fields to keep
  optional_fields: Option<Vec<String>>   # Optional fields
  text_separator: Option<String>         # Field separator
  csv_delimiter: Option<String>          # CSV delimiter
  dry_run: Option<bool>                  # Validation only

DatasetType:
  EMBED_INPUT                            # For embed fine-tuning
  EMBED_RESULT                           # Embedding output
  CLUSTER_INPUT                          # For clustering
  CLUSTER_RESULT                         # Clustering output
  RERANK_INPUT                           # For rerank fine-tuning
  CLASSIFY_INPUT                         # For classification
  CLASSIFY_OUTPUT                        # Classification output
  SUMMARIZE_INPUT                        # For summarization
  SUMMARIZE_OUTPUT                       # Summarization output
  CHAT_INPUT                             # For chat fine-tuning
  GENERATE_INPUT                         # For generation fine-tuning

Dataset:
  id: String                             # Dataset ID
  name: String                           # Dataset name
  dataset_type: DatasetType              # Type
  validation_status: ValidationStatus    # Processing status
  created_at: DateTime                   # Creation time
  updated_at: DateTime                   # Last update
  schema: Option<String>                 # Data schema
  required_fields: Option<Vec<String>>   # Required columns
  preserve_fields: Option<Vec<String>>   # Preserved fields
  dataset_parts: Option<Vec<DatasetPart>> # File parts

ValidationStatus:
  UNKNOWN
  QUEUED
  PROCESSING
  FAILED
  VALIDATED
  SKIPPED

DatasetPart:
  id: String                             # Part ID
  name: String                           # Part name
  url: Option<String>                    # Download URL
  index: Option<u32>                     # Part index
  size_bytes: Option<u64>                # File size
  num_rows: Option<u64>                  # Row count
  original_url: Option<String>           # Original file URL
```

### 5.9 Connector Types

```
CreateConnectorRequest:
  name: String                           # Required: Connector name
  url: String                            # Required: Data source URL
  description: Option<String>            # Connector description
  excludes: Option<Vec<String>>          # Exclusion patterns
  oauth: Option<OAuthConfig>             # OAuth settings
  active: Option<bool>                   # Enable state
  continue_on_failure: Option<bool>      # Error handling
  service_auth: Option<bool>             # Use service auth

OAuthConfig:
  client_id: Option<String>
  client_secret: Option<SecretString>
  authorize_url: Option<String>
  token_url: Option<String>
  scope: Option<String>

Connector:
  id: String                             # Connector ID
  organization_id: Option<String>        # Owner organization
  name: String                           # Connector name
  description: Option<String>            # Description
  url: Option<String>                    # Data source URL
  created_at: DateTime                   # Creation time
  updated_at: DateTime                   # Last update
  excludes: Option<Vec<String>>          # Exclusion patterns
  auth_type: Option<AuthType>            # Authentication type
  oauth: Option<OAuthConfig>             # OAuth config
  auth_status: Option<AuthStatus>        # Auth state
  active: Option<bool>                   # Enable state
  continue_on_failure: Option<bool>      # Error handling

AuthType:
  OAUTH
  SERVICE_AUTH

AuthStatus:
  VALID
  INVALID
```

### 5.10 Fine-tuning Types

```
CreateFinetunedModelRequest:
  name: String                           # Required: Model name
  settings: FinetuneSettings             # Required: Training settings
  base_model: Option<BaseModel>          # Base model selection
  creator_id: Option<String>             # Creator identifier

FinetuneSettings:
  base_model: BaseModel                  # Model to fine-tune
  dataset_id: String                     # Training dataset
  hyperparameters: Option<Hyperparameters> # Training config
  multi_label: Option<bool>              # Multi-label classification

BaseModel:
  base_type: BaseModelType               # Model type

BaseModelType:
  BASE_TYPE_UNSPECIFIED
  BASE_TYPE_GENERATIVE                   # command models
  BASE_TYPE_CLASSIFICATION               # classifier models
  BASE_TYPE_RERANK                       # rerank models
  BASE_TYPE_CHAT                         # chat models

Hyperparameters:
  early_stopping_patience: Option<u32>   # Stop patience
  early_stopping_threshold: Option<f64>  # Stop threshold
  train_batch_size: Option<u32>          # Batch size
  train_epochs: Option<u32>              # Epochs
  learning_rate: Option<f64>             # LR

FinetunedModel:
  id: String                             # Model ID
  name: String                           # Model name
  status: FinetunedModelStatus           # Training status
  settings: FinetuneSettings             # Training config
  base_model: BaseModel                  # Base model
  created_at: DateTime                   # Creation time
  updated_at: DateTime                   # Last update
  completed_at: Option<DateTime>         # Completion time
  creator_id: Option<String>             # Creator

FinetunedModelStatus:
  STATUS_UNSPECIFIED
  STATUS_FINETUNING                      # Training in progress
  STATUS_DEPLOYING_API                   # Deploying
  STATUS_READY                           # Ready to use
  STATUS_FAILED                          # Training failed
  STATUS_DELETED                         # Deleted
  STATUS_TEMPORARILY_OFFLINE             # Temporarily unavailable
  STATUS_PAUSED                          # Paused
  STATUS_QUEUED                          # Queued for training
```

### 5.11 Streaming Types

```
ChatStreamEvent:
  event_type: ChatStreamEventType
  data: ChatStreamData

ChatStreamEventType:
  STREAM_START
  TEXT_GENERATION
  CITATION_GENERATION
  TOOL_CALLS_GENERATION
  TOOL_CALLS_CHUNK
  SEARCH_QUERIES_GENERATION
  SEARCH_RESULTS
  STREAM_END

ChatStreamData:
  # For STREAM_START
  generation_id: Option<String>

  # For TEXT_GENERATION
  text: Option<String>

  # For CITATION_GENERATION
  citations: Option<Vec<Citation>>

  # For TOOL_CALLS_GENERATION
  tool_calls: Option<Vec<ToolCall>>

  # For TOOL_CALLS_CHUNK
  tool_call_delta: Option<ToolCallDelta>

  # For SEARCH_QUERIES_GENERATION
  search_queries: Option<Vec<SearchQuery>>

  # For SEARCH_RESULTS
  search_results: Option<Vec<SearchResult>>
  documents: Option<Vec<Document>>

  # For STREAM_END
  finish_reason: Option<FinishReason>
  response: Option<ChatResponse>

GenerateStreamEvent:
  event_type: GenerateStreamEventType
  data: GenerateStreamData

GenerateStreamEventType:
  STREAM_START
  TEXT_GENERATION
  STREAM_END

GenerateStreamData:
  index: Option<u32>
  text: Option<String>
  is_finished: Option<bool>
  finish_reason: Option<FinishReason>
  response: Option<GenerateResponse>
```

---

## 6. Error Taxonomy

### 6.1 Error Categories

```
CohereError:
  # Client Errors (4xx)
  ├── BadRequest           # 400: Invalid request parameters
  ├── Unauthorized         # 401: Invalid or missing API key
  ├── Forbidden            # 403: Insufficient permissions
  ├── NotFound             # 404: Resource not found
  ├── TooManyRequests      # 429: Rate limit exceeded
  ├── UnprocessableEntity  # 422: Validation failed

  # Server Errors (5xx)
  ├── InternalError        # 500: Server error
  ├── BadGateway           # 502: Upstream error
  ├── ServiceUnavailable   # 503: Temporarily unavailable
  ├── GatewayTimeout       # 504: Request timeout

  # Network Errors
  ├── Connection           # Network connectivity issues
  ├── Timeout              # Request timeout
  ├── Tls                  # TLS/SSL errors

  # Parse Errors
  ├── JsonParse            # JSON parsing failed
  ├── SseParse             # SSE event parsing failed

  # Client-side Validation
  ├── InvalidRequest       # Pre-flight validation

  # Unknown
  └── Unknown              # Unexpected errors
```

### 6.2 Error Structure

```
CohereError:
  type: ErrorType                        # Error category
  message: String                        # Human-readable message
  status_code: Option<u16>               # HTTP status (if applicable)
  request_id: Option<String>             # X-Request-Id header
  retry_after: Option<Duration>          # For 429 errors
  details: Option<Map<String, Value>>    # Additional context

ErrorResponse (API):
  message: String                        # Error message
  status_code: Option<u16>               # Status code
  request_id: Option<String>             # Request ID
```

### 6.3 Error Handling Matrix

| Status Code | Error Type | Retryable | Circuit Breaker |
|-------------|------------|-----------|-----------------|
| 400 | BadRequest | No | No |
| 401 | Unauthorized | No | No |
| 403 | Forbidden | No | No |
| 404 | NotFound | No | No |
| 422 | UnprocessableEntity | No | No |
| 429 | TooManyRequests | Yes (with delay) | No |
| 500 | InternalError | Yes | Yes |
| 502 | BadGateway | Yes | Yes |
| 503 | ServiceUnavailable | Yes (with delay) | Yes |
| 504 | GatewayTimeout | Yes | Yes |
| Network | Connection/Timeout | Yes | Yes |

---

## 7. Resilience Hooks

### 7.1 Retry Configuration

```
RetryConfig:
  max_attempts: u32                      # Default: 3
  initial_delay: Duration                # Default: 100ms
  max_delay: Duration                    # Default: 30s
  backoff_multiplier: f64                # Default: 2.0
  jitter: f64                            # Default: 0.1 (10%)
  retryable_status_codes: Vec<u16>       # Default: [429, 500, 502, 503, 504]
  retry_on_timeout: bool                 # Default: true

Retry Decision Flow:
  1. Check if error is retryable (by type or status code)
  2. Check if max attempts exceeded
  3. Calculate delay: min(initial * multiplier^attempt, max)
  4. Apply jitter: delay * (1 + random(-jitter, jitter))
  5. For 429: use Retry-After header if present
  6. Wait and retry
```

### 7.2 Circuit Breaker Configuration

```
CircuitBreakerConfig:
  failure_threshold: u32                 # Default: 5
  success_threshold: u32                 # Default: 2
  timeout: Duration                      # Default: 60s
  half_open_max_requests: u32            # Default: 1

States:
  Closed:  Normal operation, count failures
  Open:    Reject all requests, return error immediately
  HalfOpen: Allow limited requests to test recovery

Transitions:
  Closed → Open:     failure_count >= failure_threshold
  Open → HalfOpen:   timeout elapsed
  HalfOpen → Closed: success_count >= success_threshold
  HalfOpen → Open:   any failure
```

### 7.3 Rate Limiting Configuration

```
RateLimitConfig:
  requests_per_minute: Option<u32>       # RPM limit
  tokens_per_minute: Option<u32>         # TPM limit
  strategy: RateLimitStrategy            # Token bucket or sliding window

RateLimitStrategy:
  TokenBucket:
    capacity: u32                        # Max tokens
    refill_rate: f64                     # Tokens per second

  SlidingWindow:
    window_size: Duration                # Window duration
    max_requests: u32                    # Max requests in window

Rate Limit Handling:
  1. Check against client-side limits
  2. If exceeded, wait or reject (configurable)
  3. On 429 response, respect Retry-After
  4. Track X-RateLimit-* headers
```

### 7.4 Timeout Configuration

```
TimeoutConfig:
  connect_timeout: Duration              # Default: 10s
  request_timeout: Duration              # Default: 120s
  stream_idle_timeout: Duration          # Default: 60s

Timeout Behavior:
  - Connect: Time to establish TCP connection
  - Request: Total time for request/response cycle
  - Stream: Max idle time between stream chunks
```

---

## 8. Security Requirements

### 8.1 Credential Management

```
Credential Hierarchy:
  1. Explicit API key parameter (highest priority)
  2. COHERE_API_KEY environment variable
  3. Configuration file (lowest priority)

SecretString:
  - Wraps API key and sensitive data
  - Implements Zeroize trait (memory cleared on drop)
  - Debug/Display shows "[REDACTED]"
  - Clone requires explicit action
  - .expose_secret() for actual value

Storage Requirements:
  - Never store in logs
  - Never include in error messages
  - Never serialize to JSON (skip attribute)
  - Zero memory on deallocation
```

### 8.2 Transport Security

```
TLS Requirements:
  - Minimum TLS 1.2
  - Prefer TLS 1.3
  - Use system certificate store
  - Enable certificate validation
  - HTTPS-only (reject http://)

HTTP Security:
  - Authorization: Bearer <api_key>
  - User-Agent: cohere-rust/<version> or cohere-typescript/<version>
  - X-Request-ID: UUID for tracing
  - No credentials in query parameters
```

### 8.3 Input Validation

```
Validation Rules:
  - Max message length: API limits
  - Max tokens: Model-specific limits
  - Temperature: 0.0 to 5.0 (generate), 0.0 to 1.0 (chat)
  - Top-k: 0 to 500
  - Top-p: 0.0 to 0.99
  - Frequency penalty: 0.0 to 1.0
  - Presence penalty: 0.0 to 1.0
  - Model name: Non-empty string
  - Batch sizes: Within limits

Sanitization:
  - Escape special characters in logs
  - Truncate long values in debug output
  - Validate JSON schema before sending
```

---

## 9. Observability Requirements

### 9.1 Tracing

```
Span Hierarchy:
  cohere.<service>.<operation>           # Root span
  ├── cohere.http.request                # HTTP request
  │   ├── cohere.auth                    # Auth header
  │   └── cohere.serialize               # Request serialization
  ├── cohere.http.response               # HTTP response
  │   └── cohere.parse                   # Response parsing
  └── cohere.stream                      # For streaming (if applicable)

Required Attributes:
  - cohere.model: Model ID
  - cohere.operation: chat, generate, embed, etc.
  - cohere.request_id: API request ID
  - http.method: POST, GET, etc.
  - http.status_code: Response status
  - http.url: Endpoint (redacted)

Optional Attributes:
  - cohere.tokens.input: Input token count
  - cohere.tokens.output: Output token count
  - cohere.stream.chunks: Chunk count (streaming)
  - cohere.stream.ttft_ms: Time to first token
```

### 9.2 Metrics

```
Counters:
  cohere_requests_total
    labels: [method, endpoint, status, model]

  cohere_tokens_total
    labels: [type (input/output), model]

  cohere_errors_total
    labels: [type, endpoint, status_code]

  cohere_retries_total
    labels: [endpoint, attempt]

Histograms:
  cohere_request_duration_seconds
    labels: [method, endpoint, model]
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30]

  cohere_stream_duration_seconds
    labels: [model]
    buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120]

  cohere_time_to_first_token_seconds
    labels: [model]
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5]

Gauges:
  cohere_circuit_breaker_state
    labels: [] (0=closed, 1=open, 2=half_open)
```

### 9.3 Logging

```
Log Levels:
  ERROR: Request failures, parse errors, circuit breaker open
  WARN:  Retries, rate limits, deprecation notices
  INFO:  Request/response summaries, client lifecycle
  DEBUG: Request/response details (redacted), timing
  TRACE: Full payloads (opt-in), SSE events

Log Format (Structured):
  {
    "timestamp": "2025-12-09T10:30:00.123Z",
    "level": "info",
    "target": "cohere::services::chat",
    "message": "Chat completion successful",
    "fields": {
      "model": "command-r-plus",
      "request_id": "abc123",
      "input_tokens": 150,
      "output_tokens": 89,
      "duration_ms": 1234
    }
  }

Redaction:
  - API key: "[REDACTED]"
  - Message content: Truncated at DEBUG, hidden at INFO
  - Authorization header: "[REDACTED]"
```

---

## 10. Testing Requirements

### 10.1 Unit Testing

```
Coverage Targets:
  - Line coverage: 80% minimum, 90% target
  - Branch coverage: 70% minimum, 85% target
  - Function coverage: 90% minimum, 95% target

Mock Requirements:
  - MockHttpTransport for all services
  - MockChatService, MockEmbedService, etc.
  - Configurable response queues
  - Request recording for assertions
  - Simulated delays and errors

Test Categories:
  - Request serialization
  - Response deserialization
  - Error mapping
  - Streaming parsing
  - Retry logic
  - Circuit breaker transitions
  - Rate limiting
  - Timeout handling
```

### 10.2 Integration Testing

```
Mock Server:
  - WireMock (Rust) / MSW (TypeScript)
  - Scripted request/response scenarios
  - Delay simulation
  - Error injection
  - SSE stream simulation

Test Scenarios:
  - Full request/response cycle
  - Streaming with multiple chunks
  - Tool calling flow
  - RAG with documents
  - Error recovery
  - Concurrent requests
```

### 10.3 Contract Testing

```
OpenAPI Compliance:
  - Request schema validation
  - Response schema validation
  - Error format verification
  - Header requirements

Compatibility:
  - API version handling
  - Deprecated field handling
  - Unknown field tolerance
```

---

## 11. Configuration

### 11.1 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `COHERE_API_KEY` | API key for authentication | Required |
| `COHERE_BASE_URL` | API base URL | https://api.cohere.com |
| `COHERE_TIMEOUT_SECS` | Request timeout | 120 |
| `COHERE_MAX_RETRIES` | Maximum retry attempts | 3 |
| `COHERE_LOG_LEVEL` | Logging level | info |

### 11.2 Client Configuration

```
ClientConfig:
  api_key: SecretString                  # Required
  base_url: String                       # Default: https://api.cohere.com
  timeout: Duration                      # Default: 120s
  connect_timeout: Duration              # Default: 10s
  retry: RetryConfig                     # Retry settings
  circuit_breaker: CircuitBreakerConfig  # CB settings
  rate_limit: Option<RateLimitConfig>    # Rate limiting
  user_agent: Option<String>             # Custom UA
  default_headers: Map<String, String>   # Custom headers
```

### 11.3 Builder Pattern

```rust
let client = CohereClient::builder()
    .api_key("your-api-key")
    .base_url("https://api.cohere.com")
    .timeout(Duration::from_secs(120))
    .retry(RetryConfig::default())
    .circuit_breaker(CircuitBreakerConfig::default())
    .build()?;
```

---

## 12. Constraints

### 12.1 Dependency Constraints

| Constraint | Description |
|------------|-------------|
| No ruvbase | Must not depend on Layer 0 |
| No cross-provider | Must not depend on other integrations |
| Primitives only | May depend only on integrations-* primitives |
| Stable dependencies | Use stable crate versions |

### 12.2 API Constraints

| Constraint | Value | Notes |
|------------|-------|-------|
| Max chat message | Model-specific | Check model docs |
| Max generate prompt | Model-specific | Check model docs |
| Max embed texts | 96 per request | Batch limit |
| Max rerank docs | 1000 per request | Document limit |
| Max classify inputs | 96 per request | Input limit |
| Rate limits | Tier-based | Check API docs |

### 12.3 Implementation Constraints

| Constraint | Description |
|------------|-------------|
| Async-first | All I/O operations async |
| No blocking | Never block async runtime |
| Thread-safe | Safe for concurrent use |
| Memory-safe | No unsafe without justification |
| UTF-8 | All strings UTF-8 encoded |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial specification |

---

**Specification Phase Status: COMPLETE**

*Awaiting "Next phase." to begin Pseudocode phase.*
