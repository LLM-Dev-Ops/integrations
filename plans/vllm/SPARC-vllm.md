# SPARC Development Cycle: vLLM Self-Hosted Inference Runtime Integration

**Master Index Document**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/vllm`

---

## Overview

This document contains the complete SPARC development cycle for the vLLM Integration Module. vLLM is a high-throughput, memory-efficient inference and serving engine for LLMs, designed for self-hosted deployments. This integration provides a thin adapter layer connecting the LLM Dev Ops platform to self-hosted vLLM runtimes.

### Key Differentiators from Cloud LLM Providers

| Aspect | vLLM (Self-Hosted) | Cloud Providers (Anthropic, OpenAI) |
|--------|-------------------|-------------------------------------|
| Deployment | User-managed infrastructure | Managed service |
| Models | Any HuggingFace-compatible model | Provider-specific models |
| Scaling | User-controlled, multi-GPU | Auto-scaled by provider |
| Cost Model | Infrastructure cost only | Per-token pricing |
| Latency | Network-local, predictable | Variable, network-dependent |
| Features | PagedAttention, continuous batching | Provider-specific |

---

## SPARC Phases

| Phase | Section | Status |
|-------|---------|--------|
| **S**pecification | [Section 1](#1-specification-phase) | IN PROGRESS |
| **P**seudocode | [Section 2](#2-pseudocode-phase) | PENDING |
| **A**rchitecture | [Section 3](#3-architecture-phase) | PENDING |
| **R**efinement (Interfaces) | [Section 4](#4-interfaces-phase) | PENDING |
| **C**ompletion (Constraints + Open Questions) | [Section 5](#5-constraints-and-open-questions) | PENDING |

---

# 1. SPECIFICATION PHASE

## 1.1 Executive Summary

This specification defines a thin adapter layer for integrating self-hosted vLLM inference runtimes into the LLM Dev Ops platform. The adapter provides:

- **OpenAI-compatible API access** to vLLM servers
- **High-throughput batching** for enterprise workloads
- **Streaming response handling** with back-pressure support
- **Model hot-swapping** without service interruption
- **Simulation/replay** of inference workloads for testing and capacity planning

### 1.1.1 Design Philosophy

This integration is a **thin adapter**, not a vLLM management system:

| Responsibility | This Module | External (Out of Scope) |
|----------------|-------------|------------------------|
| API communication | Yes | - |
| Request routing | Yes | - |
| Response streaming | Yes | - |
| Model registry awareness | Yes | - |
| Server deployment | - | Infrastructure/K8s |
| GPU allocation | - | Infrastructure |
| Model downloading | - | vLLM server |
| Load balancing | - | Ingress/Service mesh |

## 1.2 Module Purpose and Scope

### 1.2.1 Purpose Statement

The vLLM Integration Module provides a production-ready, type-safe interface for interacting with self-hosted vLLM inference servers. It abstracts the OpenAI-compatible API, manages connection pools, handles streaming responses, and integrates with the platform's shared infrastructure for authentication, metrics, and resilience.

### 1.2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **API Abstraction** | Type-safe wrappers for vLLM's OpenAI-compatible endpoints |
| **Connection Management** | Pool management for multiple vLLM server instances |
| **Streaming** | SSE parsing for streaming completions |
| **Batching** | Client-side request batching for high-throughput |
| **Model Discovery** | Query available models from vLLM servers |
| **Health Monitoring** | Server health and readiness checks |
| **Metrics Collection** | Gather vLLM-specific metrics (KV cache, queue depth) |

### 1.2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Chat Completions API | `/v1/chat/completions` with streaming |
| Completions API | `/v1/completions` (legacy text completion) |
| Embeddings API | `/v1/embeddings` (if model supports) |
| Models API | `/v1/models` for model discovery |
| Tokenization API | `/tokenize` and `/detokenize` |
| Health Endpoints | `/health`, `/health/ready`, `/health/live` |
| Metrics Endpoint | `/metrics` (Prometheus format) |
| Multi-server routing | Connect to multiple vLLM instances |
| Hot-swap support | Detect model changes, update routing |

#### Out of Scope

| Item | Reason |
|------|--------|
| vLLM server deployment | Infrastructure concern |
| Model downloading/loading | vLLM server responsibility |
| GPU memory management | vLLM engine handles this |
| Kubernetes orchestration | Platform infrastructure |
| Load balancing | Service mesh / ingress |
| Model fine-tuning | Separate workflow |

## 1.3 vLLM API Specification

### 1.3.1 Base Configuration

```
Base URL: http(s)://{vllm-host}:{port}
Default Port: 8000
API Version: OpenAI-compatible (v1)
Authentication: Bearer token (optional, configurable)
```

### 1.3.2 Chat Completions Endpoint

**Endpoint:** `POST /v1/chat/completions`

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
  "top_k": 50,
  "frequency_penalty": 0.0,
  "presence_penalty": 0.0,
  "repetition_penalty": 1.0,
  "stream": false,
  "stop": ["\n\n"],
  "n": 1,
  "best_of": 1,
  "logprobs": null,
  "echo": false,
  "seed": null,
  "skip_special_tokens": true,
  "spaces_between_special_tokens": true,
  "guided_json": null,
  "guided_regex": null,
  "guided_choice": null,
  "guided_grammar": null
}
```

**Response:**
```json
{
  "id": "cmpl-abc123",
  "object": "chat.completion",
  "created": 1702488000,
  "model": "meta-llama/Llama-2-7b-chat-hf",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop",
      "logprobs": null
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 10,
    "total_tokens": 35
  }
}
```

### 1.3.3 vLLM-Specific Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `best_of` | int | Generate `best_of` sequences, return best | 1 |
| `use_beam_search` | bool | Use beam search instead of sampling | false |
| `top_k` | int | Top-k sampling | -1 (disabled) |
| `min_p` | float | Minimum probability threshold | 0.0 |
| `repetition_penalty` | float | Penalize repeated tokens | 1.0 |
| `length_penalty` | float | Beam search length penalty | 1.0 |
| `early_stopping` | bool | Stop beam search early | false |
| `ignore_eos` | bool | Ignore end-of-sequence token | false |
| `min_tokens` | int | Minimum tokens to generate | 0 |
| `skip_special_tokens` | bool | Skip special tokens in output | true |
| `spaces_between_special_tokens` | bool | Add spaces between special tokens | true |

### 1.3.4 Guided Generation (Structured Output)

vLLM supports constrained decoding:

| Parameter | Type | Description |
|-----------|------|-------------|
| `guided_json` | object/string | JSON schema for output |
| `guided_regex` | string | Regex pattern for output |
| `guided_choice` | array | List of valid choices |
| `guided_grammar` | string | Context-free grammar (EBNF) |

### 1.3.5 Streaming Response (SSE)

```
data: {"id":"cmpl-abc","object":"chat.completion.chunk","created":1702488000,"model":"llama","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"cmpl-abc","object":"chat.completion.chunk","created":1702488000,"model":"llama","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"cmpl-abc","object":"chat.completion.chunk","created":1702488000,"model":"llama","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

### 1.3.6 Health Endpoints

| Endpoint | Method | Response | Description |
|----------|--------|----------|-------------|
| `/health` | GET | `{}` | Basic health check |
| `/health/ready` | GET | `{}` | Ready to serve requests |
| `/health/live` | GET | `{}` | Server is alive |

### 1.3.7 Metrics Endpoint

**Endpoint:** `GET /metrics`

**Format:** Prometheus text format

**Key Metrics:**
| Metric | Type | Description |
|--------|------|-------------|
| `vllm:num_requests_running` | Gauge | Active requests |
| `vllm:num_requests_waiting` | Gauge | Queued requests |
| `vllm:gpu_cache_usage_perc` | Gauge | KV cache utilization |
| `vllm:cpu_cache_usage_perc` | Gauge | CPU cache utilization |
| `vllm:avg_prompt_throughput_toks_per_s` | Gauge | Prompt processing rate |
| `vllm:avg_generation_throughput_toks_per_s` | Gauge | Generation rate |

### 1.3.8 Tokenization Endpoints

**Tokenize:** `POST /tokenize`
```json
{"prompt": "Hello world", "add_special_tokens": true}
```
Response: `{"tokens": [1, 15043, 3186], "count": 3}`

**Detokenize:** `POST /detokenize`
```json
{"tokens": [1, 15043, 3186]}
```
Response: `{"prompt": "Hello world"}`

## 1.4 Enterprise Features

### 1.4.1 High-Throughput Batching

The adapter supports client-side request batching:

| Feature | Description |
|---------|-------------|
| **Batch Queue** | Accumulate requests up to batch size or timeout |
| **Concurrent Batches** | Multiple in-flight batches to vLLM |
| **Priority Queuing** | High-priority requests bypass normal queue |
| **Back-pressure** | Reject requests when queue depth exceeded |

**Configuration:**
```rust
pub struct BatchConfig {
    pub max_batch_size: usize,           // Max requests per batch
    pub batch_timeout_ms: u64,           // Flush after timeout
    pub max_queue_depth: usize,          // Back-pressure threshold
    pub max_concurrent_batches: usize,   // Parallel batch limit
}
```

### 1.4.2 Streaming with Back-Pressure

| Feature | Description |
|---------|-------------|
| **Bounded Buffers** | Limit in-memory buffering |
| **Consumer Pacing** | Slow consumers don't overwhelm memory |
| **Graceful Cancellation** | Clean up on client disconnect |
| **Chunk Aggregation** | Batch small chunks for efficiency |

### 1.4.3 Model Hot-Swapping

Support for model changes without adapter restart:

| Operation | Behavior |
|-----------|----------|
| **Model Added** | Discover via `/v1/models`, add to routing |
| **Model Removed** | Drain existing requests, remove from routing |
| **Model Updated** | Atomic switch after new model ready |
| **Health Polling** | Periodic check for model availability |

### 1.4.4 Simulation/Replay

For capacity planning and testing:

| Feature | Description |
|---------|-------------|
| **Request Recording** | Capture request/response pairs |
| **Workload Replay** | Replay recorded workloads at scale |
| **Synthetic Load** | Generate realistic request patterns |
| **Latency Simulation** | Add artificial latency for testing |
| **Mock Mode** | Return recorded responses without server |

## 1.5 Dependency Policy

### 1.5.1 Allowed Dependencies (Shared Modules)

| Module | Purpose |
|--------|---------|
| `shared/credentials` | Token management (if vLLM auth enabled) |
| `shared/resilience` | Retry, circuit breaker, rate limiting |
| `shared/observability` | Tracing, metrics, logging |
| `shared/http` | HTTP transport abstraction |
| `shared/database` | RuvVector for embedding storage |

### 1.5.2 External Dependencies (Rust)

| Crate | Version | Purpose |
|-------|---------|---------|
| `tokio` | 1.x | Async runtime |
| `reqwest` | 0.12+ | HTTP client |
| `serde` / `serde_json` | 1.x | Serialization |
| `futures` | 0.3+ | Stream utilities |
| `async-trait` | 0.1+ | Async trait support |
| `thiserror` | 1.x | Error derivation |
| `url` | 2.x | URL parsing |
| `bytes` | 1.x | Byte buffer handling |
| `parking_lot` | 0.12+ | Synchronization primitives |

### 1.5.3 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| Any vLLM Python bindings | This is a pure API client |
| PyO3 / maturin | No Python interop needed |
| Other LLM integration crates | No cross-provider dependencies |

## 1.6 Error Taxonomy

### 1.6.1 Error Hierarchy

```
VllmError
├── ConfigurationError
│   ├── InvalidServerUrl
│   ├── InvalidTimeout
│   └── InvalidBatchConfig
│
├── ConnectionError
│   ├── ServerUnreachable
│   ├── DnsResolutionFailed
│   ├── TlsError
│   └── ConnectionPoolExhausted
│
├── RequestError
│   ├── InvalidModel
│   ├── InvalidParameters
│   ├── PromptTooLong
│   └── SerializationFailed
│
├── ServerError
│   ├── InternalError
│   ├── ModelNotLoaded
│   ├── OutOfMemory
│   ├── KvCacheExhausted
│   └── ServerOverloaded
│
├── ResponseError
│   ├── DeserializationFailed
│   ├── UnexpectedFormat
│   ├── StreamInterrupted
│   └── MalformedSse
│
├── TimeoutError
│   ├── ConnectionTimeout
│   ├── ReadTimeout
│   └── GenerationTimeout
│
└── RateLimitError
    ├── QueueFull
    └── ConcurrencyExceeded
```

### 1.6.2 Error Mapping from HTTP

| HTTP Status | Error Type | Retryable |
|-------------|------------|-----------|
| 400 | `RequestError::InvalidParameters` | No |
| 404 | `RequestError::InvalidModel` | No |
| 408 | `TimeoutError::GenerationTimeout` | Yes |
| 422 | `RequestError::InvalidParameters` | No |
| 500 | `ServerError::InternalError` | Yes (limited) |
| 503 | `ServerError::ServerOverloaded` | Yes |
| 507 | `ServerError::OutOfMemory` | No |

## 1.7 Resilience Requirements

### 1.7.1 Retry Configuration

| Error Type | Retry | Max Attempts | Backoff |
|------------|-------|--------------|---------|
| `ConnectionError` | Yes | 3 | Exponential (1s base) |
| `TimeoutError` | Yes | 2 | Fixed (100ms) |
| `ServerError::Overloaded` | Yes | 3 | Exponential (2s base) |
| `ServerError::InternalError` | Yes | 2 | Fixed (1s) |
| `RequestError::*` | No | - | - |

### 1.7.2 Circuit Breaker

| Parameter | Default |
|-----------|---------|
| Failure threshold | 5 failures |
| Success threshold | 3 successes |
| Reset timeout | 30 seconds |
| Half-open max requests | 3 |

### 1.7.3 Connection Pool

| Parameter | Default |
|-----------|---------|
| Max connections per server | 100 |
| Idle timeout | 90 seconds |
| Connection acquire timeout | 5 seconds |
| Keep-alive interval | 30 seconds |

## 1.8 Observability Requirements

### 1.8.1 Tracing Spans

| Span | Attributes |
|------|------------|
| `vllm.request` | `server`, `model`, `operation`, `stream` |
| `vllm.batch` | `batch_size`, `batch_id` |
| `vllm.stream` | `chunks_received`, `total_tokens` |

### 1.8.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `vllm_requests_total` | Counter | `server`, `model`, `status` |
| `vllm_request_duration_seconds` | Histogram | `server`, `model` |
| `vllm_tokens_total` | Counter | `server`, `model`, `direction` |
| `vllm_stream_chunks_total` | Counter | `server`, `model` |
| `vllm_batch_size` | Histogram | `server` |
| `vllm_queue_depth` | Gauge | `server` |
| `vllm_connection_pool_size` | Gauge | `server` |
| `vllm_server_kv_cache_utilization` | Gauge | `server` |

### 1.8.3 Logging

| Level | When |
|-------|------|
| ERROR | Connection failures, server errors |
| WARN | Retries, circuit breaker trips, queue pressure |
| INFO | Request completion, model changes |
| DEBUG | Request/response details |
| TRACE | SSE chunks, connection pool events |

## 1.9 Performance Requirements

### 1.9.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| Request serialization | < 0.5ms | < 2ms |
| Response deserialization | < 1ms | < 5ms |
| SSE chunk parsing | < 0.1ms | < 0.5ms |
| Health check | < 10ms | < 50ms |

### 1.9.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Concurrent requests | 1000+ per server |
| Batch throughput | 10K+ requests/sec (aggregate) |
| Streaming throughput | Line-rate with vLLM |

## 1.10 Acceptance Criteria

### 1.10.1 Functional Criteria

- [ ] Chat completion (sync) works
- [ ] Chat completion (streaming) works
- [ ] Legacy completions API works
- [ ] Embeddings API works (when supported by model)
- [ ] Model discovery works
- [ ] Health checks work
- [ ] Tokenization works
- [ ] Guided generation works
- [ ] Multi-server routing works
- [ ] Hot-swap detection works

### 1.10.2 Non-Functional Criteria

- [ ] No panics in production paths
- [ ] Memory bounded during streaming
- [ ] Auth tokens never logged
- [ ] Retry respects backoff
- [ ] Circuit breaker trips correctly
- [ ] Metrics emitted correctly
- [ ] Test coverage > 80%

---

# 2. PSEUDOCODE PHASE

## 2.1 Core Client

```pseudocode
CLASS VllmClient:
    FIELDS:
        config: VllmConfig
        http_transport: HttpTransport
        connection_pool: ConnectionPool
        circuit_breaker: CircuitBreaker
        rate_limiter: RateLimiter
        model_registry: ModelRegistry
        metrics: MetricsCollector

    CONSTRUCTOR(config: VllmConfig):
        VALIDATE config
        INITIALIZE http_transport with config.timeout, config.tls
        INITIALIZE connection_pool with config.pool_settings
        INITIALIZE circuit_breaker with config.circuit_breaker_config
        INITIALIZE rate_limiter with config.rate_limit_config
        INITIALIZE model_registry as empty
        INITIALIZE metrics collector

        IF config.auto_discover_models:
            SPAWN background task: discover_models_loop()

    METHOD chat_completion(request: ChatRequest) -> ChatResponse:
        span = START_SPAN("vllm.chat_completion")
        span.set_attribute("model", request.model)
        span.set_attribute("stream", false)

        TRY:
            server = SELECT_SERVER(request.model)
            circuit_breaker.check(server)
            rate_limiter.acquire()

            http_request = BUILD_HTTP_REQUEST(server, "/v1/chat/completions", request)
            response = http_transport.send(http_request)

            IF response.status != 200:
                error = PARSE_ERROR(response)
                circuit_breaker.record_failure(server)
                THROW error

            result = PARSE_JSON(response.body, ChatResponse)
            circuit_breaker.record_success(server)

            EMIT_METRICS(request, result)
            RETURN result
        CATCH error:
            span.record_error(error)
            IF error.is_retryable():
                RETURN RETRY_WITH_BACKOFF(chat_completion, request)
            THROW error
        FINALLY:
            span.end()

    METHOD chat_completion_stream(request: ChatRequest) -> Stream<ChatChunk>:
        span = START_SPAN("vllm.chat_completion_stream")
        span.set_attribute("stream", true)

        server = SELECT_SERVER(request.model)
        circuit_breaker.check(server)
        rate_limiter.acquire()

        request.stream = true
        http_request = BUILD_HTTP_REQUEST(server, "/v1/chat/completions", request)
        sse_stream = http_transport.send_streaming(http_request)

        RETURN TransformStream(sse_stream) where:
            FOR EACH sse_event IN sse_stream:
                IF sse_event.data == "[DONE]":
                    BREAK
                chunk = PARSE_JSON(sse_event.data, ChatChunk)
                YIELD chunk
            span.end()

    METHOD discover_models_loop():
        LOOP FOREVER:
            FOR EACH server IN config.servers:
                TRY:
                    models = FETCH_MODELS(server)
                    model_registry.update(server, models)
                CATCH error:
                    LOG_WARN("Failed to discover models from {server}: {error}")
            SLEEP config.model_discovery_interval
```

## 2.2 Batching Layer

```pseudocode
CLASS BatchProcessor:
    FIELDS:
        config: BatchConfig
        pending_queue: BoundedQueue<BatchRequest>
        inflight_batches: AtomicCounter
        client: VllmClient

    METHOD submit(request: ChatRequest) -> Future<ChatResponse>:
        IF pending_queue.len() >= config.max_queue_depth:
            THROW RateLimitError::QueueFull

        promise = CREATE_PROMISE()
        batch_request = BatchRequest(request, promise)
        pending_queue.push(batch_request)

        IF should_flush():
            SPAWN flush_batch()

        RETURN promise.future()

    METHOD should_flush() -> bool:
        RETURN pending_queue.len() >= config.max_batch_size
            OR (pending_queue.len() > 0 AND time_since_first() > config.batch_timeout_ms)

    METHOD flush_batch():
        IF inflight_batches.get() >= config.max_concurrent_batches:
            RETURN  // Back-pressure: wait for existing batches

        inflight_batches.increment()
        batch = pending_queue.drain(config.max_batch_size)

        TRY:
            // vLLM handles batching internally, we just send concurrent requests
            results = PARALLEL FOR EACH req IN batch:
                RETURN client.chat_completion(req.request)

            FOR EACH (result, req) IN ZIP(results, batch):
                req.promise.resolve(result)
        CATCH error:
            FOR EACH req IN batch:
                req.promise.reject(error)
        FINALLY:
            inflight_batches.decrement()
```

## 2.3 Model Registry

```pseudocode
CLASS ModelRegistry:
    FIELDS:
        models: ConcurrentMap<String, ModelInfo>
        server_models: ConcurrentMap<ServerUrl, Set<String>>
        load_balancer: LoadBalancer

    METHOD update(server: ServerUrl, models: List<ModelInfo>):
        old_models = server_models.get(server) OR empty_set()
        new_model_ids = models.map(m => m.id).to_set()

        // Added models
        FOR EACH model IN models:
            IF model.id NOT IN old_models:
                self.models.insert(model.id, model)
                load_balancer.add_endpoint(model.id, server)
                EMIT_EVENT ModelAdded(model.id, server)

        // Removed models
        FOR EACH old_id IN old_models:
            IF old_id NOT IN new_model_ids:
                // Check if model exists on other servers
                IF NOT any_other_server_has(old_id):
                    self.models.remove(old_id)
                load_balancer.remove_endpoint(old_id, server)
                EMIT_EVENT ModelRemoved(old_id, server)

        server_models.insert(server, new_model_ids)

    METHOD select_server(model_id: String) -> ServerUrl:
        IF model_id NOT IN models:
            THROW RequestError::InvalidModel(model_id)
        RETURN load_balancer.select(model_id)
```

## 2.4 Simulation/Replay

```pseudocode
CLASS WorkloadRecorder:
    FIELDS:
        storage: RecordingStorage
        enabled: AtomicBool

    METHOD record(request: ChatRequest, response: ChatResponse, duration: Duration):
        IF NOT enabled.get():
            RETURN

        record = InferenceRecord {
            timestamp: now(),
            request: sanitize(request),  // Remove PII
            response: response,
            latency_ms: duration.as_millis(),
            model: request.model,
            tokens_in: response.usage.prompt_tokens,
            tokens_out: response.usage.completion_tokens,
        }
        storage.append(record)

CLASS WorkloadReplayer:
    FIELDS:
        client: VllmClient
        config: ReplayConfig

    METHOD replay(workload: List<InferenceRecord>) -> ReplayReport:
        results = []

        // Adjust timing based on replay speed
        base_time = workload[0].timestamp

        FOR EACH record IN workload:
            wait_time = (record.timestamp - base_time) / config.speed_multiplier
            SLEEP_UNTIL(start_time + wait_time)

            start = now()
            TRY:
                response = client.chat_completion(record.request)
                results.append(ReplayResult::Success {
                    expected_latency: record.latency_ms,
                    actual_latency: (now() - start).as_millis(),
                    tokens_match: response.usage == record.response.usage,
                })
            CATCH error:
                results.append(ReplayResult::Failure(error))

        RETURN analyze_results(results)
```

---

# 3. ARCHITECTURE PHASE

## 3.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    LLM Dev Ops Platform                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐      ┌──────────────────┐                │
│  │   Application    │      │   Orchestration  │                │
│  │     Layer        │      │     Layer        │                │
│  └────────┬─────────┘      └────────┬─────────┘                │
│           │                         │                           │
│           ▼                         ▼                           │
│  ┌──────────────────────────────────────────────────────┐      │
│  │              vLLM Integration Adapter                 │      │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │      │
│  │  │   Client    │ │   Batch     │ │   Model     │     │      │
│  │  │   Layer     │ │  Processor  │ │  Registry   │     │      │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘     │      │
│  │         │               │               │             │      │
│  │         ▼               ▼               ▼             │      │
│  │  ┌─────────────────────────────────────────────┐     │      │
│  │  │           Connection Pool Manager            │     │      │
│  │  │    ┌─────────┐ ┌─────────┐ ┌─────────┐      │     │      │
│  │  │    │ Pool 1  │ │ Pool 2  │ │ Pool N  │      │     │      │
│  │  │    └────┬────┘ └────┬────┘ └────┬────┘      │     │      │
│  │  └─────────┼───────────┼───────────┼───────────┘     │      │
│  └────────────┼───────────┼───────────┼─────────────────┘      │
│               │           │           │                         │
└───────────────┼───────────┼───────────┼─────────────────────────┘
                │           │           │
                ▼           ▼           ▼
        ┌───────────┐ ┌───────────┐ ┌───────────┐
        │  vLLM     │ │  vLLM     │ │  vLLM     │
        │ Server 1  │ │ Server 2  │ │ Server N  │
        │ (GPU 0-3) │ │ (GPU 4-7) │ │ (GPU N)   │
        └───────────┘ └───────────┘ └───────────┘
```

## 3.2 Module Structure

```
integrations/vllm/
├── Cargo.toml
├── src/
│   ├── lib.rs                 # Public API exports
│   ├── client/
│   │   ├── mod.rs             # VllmClient implementation
│   │   ├── config.rs          # Configuration types
│   │   └── builder.rs         # Client builder pattern
│   ├── api/
│   │   ├── mod.rs
│   │   ├── chat.rs            # Chat completions
│   │   ├── completions.rs     # Legacy completions
│   │   ├── embeddings.rs      # Embeddings (optional)
│   │   ├── models.rs          # Model discovery
│   │   └── health.rs          # Health endpoints
│   ├── streaming/
│   │   ├── mod.rs
│   │   ├── sse_parser.rs      # SSE event parsing
│   │   └── backpressure.rs    # Flow control
│   ├── batching/
│   │   ├── mod.rs
│   │   ├── queue.rs           # Request queue
│   │   └── processor.rs       # Batch processor
│   ├── routing/
│   │   ├── mod.rs
│   │   ├── registry.rs        # Model registry
│   │   └── load_balancer.rs   # Server selection
│   ├── simulation/
│   │   ├── mod.rs
│   │   ├── recorder.rs        # Request recording
│   │   ├── replayer.rs        # Workload replay
│   │   └── mock.rs            # Mock server
│   ├── types/
│   │   ├── mod.rs
│   │   ├── request.rs         # Request types
│   │   ├── response.rs        # Response types
│   │   └── error.rs           # Error types
│   └── transport/
│       ├── mod.rs
│       ├── http.rs            # HTTP transport
│       └── pool.rs            # Connection pooling
├── tests/
│   ├── integration/
│   └── unit/
└── benches/
```

## 3.3 Data Flow

```
Request Flow:
─────────────

Application
    │
    ▼
┌─────────────────┐
│  VllmClient     │ ── Validate request
│                 │ ── Select server (LoadBalancer)
│                 │ ── Check circuit breaker
│                 │ ── Acquire rate limit
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  HttpTransport  │ ── Serialize request
│                 │ ── Send HTTP request
│                 │ ── Handle streaming/sync
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  vLLM Server    │ ── Process with PagedAttention
│                 │ ── Generate response
│                 │ ── Stream tokens (if streaming)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  HttpTransport  │ ── Receive response
│                 │ ── Parse SSE (if streaming)
│                 │ ── Deserialize JSON
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  VllmClient     │ ── Update circuit breaker
│                 │ ── Emit metrics
│                 │ ── Return to caller
└─────────────────┘
```

## 3.4 Streaming Architecture

```
SSE Stream Processing:
─────────────────────

HTTP Response Stream
    │
    ▼
┌─────────────────────┐
│    SSE Parser       │ ── Parse "data:" lines
│                     │ ── Handle "event:" types
│                     │ ── Detect "[DONE]" sentinel
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Backpressure       │ ── Bounded channel (capacity N)
│  Buffer             │ ── Block producer if full
│                     │ ── Resume when space available
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Token Aggregator   │ ── Combine small chunks
│  (Optional)         │ ── Batch for efficiency
└──────────┬──────────┘
           │
           ▼
    Consumer (Application)
```

---

# 4. INTERFACES PHASE

## 4.1 Core Traits (Rust)

```rust
/// Main client trait for vLLM interaction
#[async_trait]
pub trait VllmClient: Send + Sync {
    /// Send a chat completion request
    async fn chat_completion(&self, request: ChatRequest) -> Result<ChatResponse, VllmError>;

    /// Send a streaming chat completion request
    async fn chat_completion_stream(
        &self,
        request: ChatRequest,
    ) -> Result<impl Stream<Item = Result<ChatChunk, VllmError>>, VllmError>;

    /// Send a legacy completion request
    async fn completion(&self, request: CompletionRequest) -> Result<CompletionResponse, VllmError>;

    /// Generate embeddings
    async fn embeddings(&self, request: EmbeddingRequest) -> Result<EmbeddingResponse, VllmError>;

    /// List available models
    async fn list_models(&self) -> Result<ModelList, VllmError>;

    /// Tokenize text
    async fn tokenize(&self, request: TokenizeRequest) -> Result<TokenizeResponse, VllmError>;

    /// Detokenize tokens
    async fn detokenize(&self, request: DetokenizeRequest) -> Result<DetokenizeResponse, VllmError>;

    /// Check server health
    async fn health_check(&self, server: Option<&ServerUrl>) -> Result<HealthStatus, VllmError>;

    /// Get server metrics
    async fn metrics(&self, server: &ServerUrl) -> Result<VllmMetrics, VllmError>;
}

/// Batch processor for high-throughput scenarios
#[async_trait]
pub trait BatchProcessor: Send + Sync {
    /// Submit a request to the batch queue
    async fn submit(&self, request: ChatRequest) -> Result<ChatResponse, VllmError>;

    /// Get current queue depth
    fn queue_depth(&self) -> usize;

    /// Force flush pending requests
    async fn flush(&self) -> Result<(), VllmError>;
}

/// Model registry for multi-server environments
pub trait ModelRegistry: Send + Sync {
    /// Get all available models
    fn list_models(&self) -> Vec<ModelInfo>;

    /// Check if a model is available
    fn has_model(&self, model_id: &str) -> bool;

    /// Get server(s) serving a model
    fn get_servers(&self, model_id: &str) -> Vec<ServerUrl>;

    /// Select best server for a model
    fn select_server(&self, model_id: &str) -> Result<ServerUrl, VllmError>;

    /// Register a server and its models
    fn register_server(&self, server: ServerUrl, models: Vec<ModelInfo>);

    /// Unregister a server
    fn unregister_server(&self, server: &ServerUrl);
}

/// Workload simulation interface
#[async_trait]
pub trait WorkloadSimulator: Send + Sync {
    /// Start recording requests
    fn start_recording(&self);

    /// Stop recording and return records
    fn stop_recording(&self) -> Vec<InferenceRecord>;

    /// Replay a workload
    async fn replay(&self, workload: Vec<InferenceRecord>, config: ReplayConfig) -> ReplayReport;

    /// Generate synthetic load
    async fn generate_load(&self, config: LoadGenConfig) -> LoadGenReport;
}
```

## 4.2 Configuration Types

```rust
/// vLLM client configuration
#[derive(Clone, Debug)]
pub struct VllmConfig {
    /// Server endpoints
    pub servers: Vec<ServerConfig>,

    /// Request timeout
    pub timeout: Duration,

    /// Connection pool settings
    pub pool: PoolConfig,

    /// Retry configuration
    pub retry: RetryConfig,

    /// Circuit breaker configuration
    pub circuit_breaker: CircuitBreakerConfig,

    /// Rate limiting configuration
    pub rate_limit: Option<RateLimitConfig>,

    /// Auto-discover models from servers
    pub auto_discover_models: bool,

    /// Model discovery interval
    pub model_discovery_interval: Duration,

    /// Default model (if not specified in request)
    pub default_model: Option<String>,
}

/// Individual server configuration
#[derive(Clone, Debug)]
pub struct ServerConfig {
    /// Server URL (e.g., "http://vllm-server:8000")
    pub url: Url,

    /// Optional authentication token
    pub auth_token: Option<SecretString>,

    /// Server-specific weight for load balancing
    pub weight: u32,

    /// Models served (if known ahead of time)
    pub models: Option<Vec<String>>,
}

/// Connection pool configuration
#[derive(Clone, Debug)]
pub struct PoolConfig {
    /// Max connections per server
    pub max_connections_per_server: usize,

    /// Idle connection timeout
    pub idle_timeout: Duration,

    /// Connection acquire timeout
    pub acquire_timeout: Duration,

    /// Keep-alive interval
    pub keepalive_interval: Duration,
}

/// Batch processing configuration
#[derive(Clone, Debug)]
pub struct BatchConfig {
    /// Maximum requests per batch
    pub max_batch_size: usize,

    /// Flush batch after this timeout
    pub batch_timeout: Duration,

    /// Maximum queue depth before back-pressure
    pub max_queue_depth: usize,

    /// Maximum concurrent batches in flight
    pub max_concurrent_batches: usize,
}
```

## 4.3 Request/Response Types

```rust
/// Chat completion request
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frequency_penalty: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presence_penalty: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repetition_penalty: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<u64>,

    // Guided generation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub guided_json: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub guided_regex: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub guided_choice: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub guided_grammar: Option<String>,
}

/// Chat message
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChatRole {
    System,
    User,
    Assistant,
}

/// Chat completion response
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatResponse {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<ChatChoice>,
    pub usage: TokenUsage,
}

/// Token usage information
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// Streaming chunk
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatChunk {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<ChatChunkChoice>,
}

/// Model information
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub owned_by: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_model_len: Option<u32>,
}
```

## 4.4 TypeScript Interfaces

```typescript
interface VllmClient {
  chatCompletion(request: ChatRequest): Promise<ChatResponse>;
  chatCompletionStream(request: ChatRequest): AsyncIterable<ChatChunk>;
  completion(request: CompletionRequest): Promise<CompletionResponse>;
  embeddings(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  listModels(): Promise<ModelList>;
  tokenize(request: TokenizeRequest): Promise<TokenizeResponse>;
  detokenize(request: DetokenizeRequest): Promise<DetokenizeResponse>;
  healthCheck(server?: string): Promise<HealthStatus>;
  metrics(server: string): Promise<VllmMetrics>;
}

interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  repetition_penalty?: number;
  stop?: string[];
  stream?: boolean;
  seed?: number;
  guided_json?: object | string;
  guided_regex?: string;
  guided_choice?: string[];
  guided_grammar?: string;
}

interface VllmConfig {
  servers: ServerConfig[];
  timeout?: number;
  pool?: PoolConfig;
  retry?: RetryConfig;
  circuitBreaker?: CircuitBreakerConfig;
  rateLimit?: RateLimitConfig;
  autoDiscoverModels?: boolean;
  modelDiscoveryInterval?: number;
  defaultModel?: string;
}
```

---

# 5. CONSTRAINTS AND OPEN QUESTIONS

## 5.1 Functional Constraints

| ID | Constraint | Description |
|----|------------|-------------|
| FC-1 | OpenAI API compatibility | Must use standard OpenAI-compatible endpoints |
| FC-2 | No vLLM server management | Adapter only; deployment is external |
| FC-3 | Stateless adapter | No persistent state between restarts |
| FC-4 | Model agnostic | Work with any vLLM-supported model |
| FC-5 | Shared infra integration | Use platform auth, metrics, tracing |

## 5.2 Non-Functional Constraints

| ID | Constraint | Description |
|----|------------|-------------|
| NFC-1 | Latency overhead < 5ms | Adapter should add minimal latency |
| NFC-2 | Memory bounded | Streaming should not accumulate unbounded data |
| NFC-3 | Concurrent requests | Support 1000+ concurrent requests |
| NFC-4 | Auth tokens protected | Use SecretString, never log tokens |
| NFC-5 | Graceful degradation | Handle server failures without full outage |

## 5.3 Integration Constraints

| ID | Constraint | Description |
|----|------------|-------------|
| IC-1 | Implement ModelAdapter trait | Platform integration requirement |
| IC-2 | RuvVector embedding storage | Store embeddings via shared database |
| IC-3 | No infrastructure duplication | Use shared resilience, observability |
| IC-4 | Multi-model orchestration | Support model selection per request |

## 5.4 Open Questions

| ID | Question | Impact | Proposed Resolution |
|----|----------|--------|---------------------|
| OQ-1 | How to handle vLLM version differences? | Medium | Feature detection via `/version` endpoint |
| OQ-2 | Should we support vLLM's prefix caching API? | Low | Defer to future version |
| OQ-3 | How to expose vLLM-specific metrics? | Medium | Prometheus endpoint passthrough + custom metrics |
| OQ-4 | Multi-LoRA model selection within single server? | High | Support LoRA adapter parameter in request |
| OQ-5 | Should batch mode use vLLM's native batching or client-side? | High | Client-side queuing, vLLM handles internal batching |
| OQ-6 | How to handle tensor parallelism visibility? | Low | Treat as implementation detail of vLLM server |
| OQ-7 | Support for vLLM's speculative decoding? | Medium | Transparent if enabled server-side |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial SPARC document - Specification phase |

---

**SPARC Cycle Status:**

```
╔═══════════════════════════════════════════════════════════════╗
║  ✅ Specification   ✅ Pseudocode   ✅ Architecture             ║
║  ✅ Interfaces      ✅ Constraints/Open Questions               ║
║                                                               ║
║           READY FOR IMPLEMENTATION                            ║
╚═══════════════════════════════════════════════════════════════╝
```
