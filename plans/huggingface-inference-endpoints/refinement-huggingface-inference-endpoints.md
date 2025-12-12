# SPARC Phase 4: Refinement — Hugging Face Inference Endpoints Integration

**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/huggingface/inference-endpoints`

---

## 1. Refinement Overview

This phase identifies edge cases, performance optimizations, production hardening requirements, and operational concerns for the Hugging Face Inference Endpoints integration.

---

## 2. Cold Start Optimization

### 2.1 Predictive Cold Start Detection

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PREDICTIVE COLD START HANDLING                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Challenge: 503 responses can mean cold start OR actual service failure     │
│                                                                              │
│  Detection Heuristics:                                                       │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                                                                     │     │
│  │  PRIMARY: Parse response body for loading indicators               │     │
│  │  ──────────────────────────────────────────────────────────────── │     │
│  │  ✓ "Model is loading" / "model is currently loading"              │     │
│  │  ✓ "initializing" / "Initializing model"                          │     │
│  │  ✓ "estimated_time" field present in JSON response                │     │
│  │  ✓ "error": "Model ... is currently loading"                      │     │
│  │                                                                     │     │
│  │  SECONDARY: Check X-Wait-For-Model header support                 │     │
│  │  ──────────────────────────────────────────────────────────────── │     │
│  │  HF supports "x-wait-for-model: true" header to auto-wait         │     │
│  │  May timeout after ~10 minutes on HF side                         │     │
│  │                                                                     │     │
│  │  FALLBACK: Endpoint status check (dedicated only)                 │     │
│  │  ──────────────────────────────────────────────────────────────── │     │
│  │  GET /v2/endpoint/{namespace}/{name}                              │     │
│  │  Check status: "scaledToZero" → cold start                        │     │
│  │  Check status: "initializing" → cold start                        │     │
│  │                                                                     │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  Optimized Retry Strategy:                                                  │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                                                                     │     │
│  │  Phase 1: Quick retry (first 30 seconds)                          │     │
│  │  ─────────────────────────────────────────────────────────────── │     │
│  │  Interval: 2s, 4s, 8s, 16s (exponential)                          │     │
│  │  Rationale: Small models may load quickly                         │     │
│  │                                                                     │     │
│  │  Phase 2: Steady state (30s - 3 min)                              │     │
│  │  ─────────────────────────────────────────────────────────────── │     │
│  │  Interval: Fixed 15s                                              │     │
│  │  Rationale: Larger models need consistent polling                 │     │
│  │                                                                     │     │
│  │  Phase 3: Slow poll (3 min - 5 min)                               │     │
│  │  ─────────────────────────────────────────────────────────────── │     │
│  │  Interval: Fixed 30s                                              │     │
│  │  Rationale: Very large models, minimize API calls                 │     │
│  │                                                                     │     │
│  │  Timeout: Configurable, default 5 minutes                         │     │
│  │                                                                     │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Cold Start Metrics

| Metric | Description | Labels |
|--------|-------------|--------|
| `hf_cold_start_detected_total` | Count of cold starts detected | model, endpoint, provider_type |
| `hf_cold_start_wait_duration_seconds` | Time spent waiting for model load | model, endpoint |
| `hf_cold_start_timeout_total` | Count of cold start timeouts | model, endpoint |
| `hf_cold_start_success_total` | Count of successful cold start recoveries | model, endpoint |

---

## 3. Provider Routing Edge Cases

### 3.1 Third-Party Provider Failures

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    THIRD-PARTY PROVIDER EDGE CASES                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Scenario 1: Provider temporarily unavailable                               │
│  ────────────────────────────────────────────────────────────────────────── │
│  Problem: Together/Groq/Fireworks has outage, HF serverless is fine        │
│                                                                              │
│  Solution: Provider fallback chain (optional)                               │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  config.provider_fallback_chain = [                              │       │
│  │    { provider: "together", timeout_ms: 30000 },                  │       │
│  │    { provider: "groq", timeout_ms: 30000 },                      │       │
│  │    { provider: "serverless", timeout_ms: 60000 }                 │       │
│  │  ]                                                                │       │
│  │                                                                   │       │
│  │  Fallback triggers:                                               │       │
│  │  - 5xx errors                                                     │       │
│  │  - Timeout                                                        │       │
│  │  - Circuit breaker open                                           │       │
│  │                                                                   │       │
│  │  Note: Disabled by default (explicit provider = no fallback)     │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Scenario 2: Model not available on specified provider                      │
│  ────────────────────────────────────────────────────────────────────────── │
│  Problem: User requests model X on provider Y, but Y doesn't have it       │
│                                                                              │
│  Solution: Fail fast with clear error                                       │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  Error: ModelNotAvailableOnProvider {                            │       │
│  │    model: "mistralai/Mixtral-8x7B",                              │       │
│  │    provider: "groq",                                              │       │
│  │    message: "Model not available on Groq. Available on:          │       │
│  │              together, fireworks, serverless"                     │       │
│  │  }                                                                │       │
│  │                                                                   │       │
│  │  Implementation: Optional model-provider compatibility cache     │       │
│  │  TTL: 1 hour (models added/removed occasionally)                  │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Scenario 3: Provider-specific rate limits                                  │
│  ────────────────────────────────────────────────────────────────────────── │
│  Problem: Different providers have different rate limits                    │
│                                                                              │
│  Solution: Per-provider rate limiters                                       │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  rate_limiters: Map<InferenceProvider, RateLimiter>              │       │
│  │                                                                   │       │
│  │  - serverless: 1000 req/min (default tier)                       │       │
│  │  - together: Based on account tier                                │       │
│  │  - groq: 30 req/min (free tier)                                  │       │
│  │  - fireworks: Based on account tier                               │       │
│  │  - dedicated: No limit (your infrastructure)                      │       │
│  │                                                                   │       │
│  │  Config: Allow override via provider_rate_limits map              │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Dedicated Endpoint Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DEDICATED ENDPOINT EDGE CASES                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Scenario 1: Endpoint in "paused" state                                     │
│  ────────────────────────────────────────────────────────────────────────── │
│  Problem: User manually paused endpoint, inference request fails           │
│                                                                              │
│  Options:                                                                    │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  A) Auto-resume (if config.auto_resume_paused = true)            │       │
│  │     - Call resume() on endpoint                                   │       │
│  │     - Wait for "running" status                                   │       │
│  │     - Retry inference request                                     │       │
│  │     - Caution: May incur unexpected costs                         │       │
│  │                                                                   │       │
│  │  B) Fail with clear error (default)                              │       │
│  │     - Return EndpointPaused error                                 │       │
│  │     - Include instructions: "Resume with endpoints().resume()"    │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Scenario 2: Endpoint in "failed" state                                     │
│  ────────────────────────────────────────────────────────────────────────── │
│  Problem: Endpoint deployment failed, status = "failed"                    │
│                                                                              │
│  Solution:                                                                   │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  - Return EndpointFailed error with last known error message     │       │
│  │  - Log endpoint failure reason (from HF API)                      │       │
│  │  - Suggest: "Check HF console for deployment logs"               │       │
│  │  - Invalidate endpoint cache entry                                │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Scenario 3: Endpoint URL cache stale                                       │
│  ────────────────────────────────────────────────────────────────────────── │
│  Problem: Endpoint recreated, URL changed, cache has old URL               │
│                                                                              │
│  Solution: Cache invalidation strategy                                      │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  - Cache TTL: 5 minutes (configurable)                           │       │
│  │  - On 404/Connection refused: Invalidate + refetch               │       │
│  │  - On lifecycle operations: Invalidate immediately               │       │
│  │  - Background refresh: Optional periodic refresh for active eps  │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Scenario 4: Endpoint scaling in progress                                   │
│  ────────────────────────────────────────────────────────────────────────── │
│  Problem: Endpoint is scaling (up or down), requests may fail              │
│                                                                              │
│  Solution:                                                                   │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  - Check status: "updating" → wait for stable state              │       │
│  │  - Max wait: 2 minutes for scaling operations                    │       │
│  │  - If min_replicas > 0, at least one replica should be ready     │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Streaming Edge Cases

### 4.1 Stream Interruption Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STREAMING EDGE CASES                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Scenario 1: Connection drop mid-stream                                     │
│  ────────────────────────────────────────────────────────────────────────── │
│  Problem: Network interruption, incomplete response                        │
│                                                                              │
│  Solution:                                                                   │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  StreamState {                                                    │       │
│  │    accumulated_content: String,                                   │       │
│  │    last_chunk_id: Option<String>,                                │       │
│  │    token_count: u32,                                              │       │
│  │  }                                                                │       │
│  │                                                                   │       │
│  │  On disconnect:                                                   │       │
│  │  1. Emit StreamInterrupted event with partial content            │       │
│  │  2. If auto_retry_stream = true:                                 │       │
│  │     - NOT supported (stateless generation)                        │       │
│  │     - Return error with accumulated content for client retry      │       │
│  │  3. Client can use partial content + request continuation        │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Scenario 2: Malformed SSE chunk                                            │
│  ────────────────────────────────────────────────────────────────────────── │
│  Problem: Invalid JSON in data: field                                      │
│                                                                              │
│  Solution:                                                                   │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  - Log warning with raw chunk content                             │       │
│  │  - Skip malformed chunk, continue stream                          │       │
│  │  - If 3+ consecutive malformed chunks: abort stream with error   │       │
│  │  - Increment hf_stream_malformed_chunks_total metric              │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Scenario 3: Missing [DONE] sentinel                                        │
│  ────────────────────────────────────────────────────────────────────────── │
│  Problem: Stream ends without [DONE] marker                                │
│                                                                              │
│  Solution:                                                                   │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  Detection:                                                       │       │
│  │  - Connection closed cleanly (EOF)                                │       │
│  │  - finish_reason present in last chunk                            │       │
│  │                                                                   │       │
│  │  Action:                                                          │       │
│  │  - Treat as normal completion if finish_reason present            │       │
│  │  - Log warning if no finish_reason                                │       │
│  │  - Complete stream gracefully                                     │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Scenario 4: Extremely long stream (context window exhaustion)              │
│  ────────────────────────────────────────────────────────────────────────── │
│  Problem: Stream approaches token limit, sudden truncation                 │
│                                                                              │
│  Solution:                                                                   │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  - Track cumulative token count from usage updates               │       │
│  │  - If finish_reason = "length": stream complete but truncated    │       │
│  │  - Emit warning event when approaching known model limit          │       │
│  │  - Return truncation_info in final response                       │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Scenario 5: Backpressure (slow consumer)                                   │
│  ────────────────────────────────────────────────────────────────────────── │
│  Problem: Consumer slower than producer, memory growth                     │
│                                                                              │
│  Solution:                                                                   │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  - Bounded channel: capacity = 100 chunks                        │       │
│  │  - If buffer full: pause reading from HTTP stream                │       │
│  │  - TCP flow control handles upstream backpressure                 │       │
│  │  - Metric: hf_stream_backpressure_events_total                   │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Multimodal Input Edge Cases

### 5.1 Image Input Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    IMAGE INPUT EDGE CASES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Scenario 1: Large image files                                              │
│  ────────────────────────────────────────────────────────────────────────── │
│  Problem: Images > 10MB cause timeouts or memory issues                    │
│                                                                              │
│  Solution:                                                                   │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  Validation:                                                      │       │
│  │  - Max file size: 20MB (configurable)                            │       │
│  │  - Max dimensions: 4096x4096 pixels                               │       │
│  │                                                                   │       │
│  │  Optimization:                                                    │       │
│  │  - Auto-resize if image exceeds max dimensions                    │       │
│  │  - Preserve aspect ratio                                          │       │
│  │  - Convert to JPEG with quality=85 if PNG > 5MB                  │       │
│  │  - Config: auto_optimize_images = true (default)                  │       │
│  │                                                                   │       │
│  │  Note: Disabled for tasks where quality matters                   │       │
│  │  (e.g., image-to-image, super-resolution)                         │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Scenario 2: Unsupported image format                                       │
│  ────────────────────────────────────────────────────────────────────────── │
│  Problem: HEIC, WebP, TIFF not always supported                            │
│                                                                              │
│  Solution:                                                                   │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  Supported formats (pass through): JPEG, PNG, GIF, BMP           │       │
│  │                                                                   │       │
│  │  Auto-convert (if image crate available):                        │       │
│  │  - WebP → PNG                                                     │       │
│  │  - HEIC → JPEG (requires system library)                         │       │
│  │  - TIFF → PNG                                                     │       │
│  │                                                                   │       │
│  │  If conversion unavailable: Return UnsupportedImageFormat error  │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Scenario 3: Corrupt/invalid image data                                     │
│  ────────────────────────────────────────────────────────────────────────── │
│  Problem: File exists but is not a valid image                             │
│                                                                              │
│  Solution:                                                                   │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  - Validate image magic bytes before upload                       │       │
│  │  - Attempt to decode header (dimensions, format)                  │       │
│  │  - If validation fails: Return InvalidImageData error            │       │
│  │  - Include detected vs expected format in error                   │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Scenario 4: URL image fetch failures                                       │
│  ────────────────────────────────────────────────────────────────────────── │
│  Problem: ImageInput::Url points to unreachable or slow resource           │
│                                                                              │
│  Solution:                                                                   │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  Option A: Pass URL directly to HF (let HF fetch)                │       │
│  │  - Simpler, less bandwidth                                        │       │
│  │  - HF may cache the image                                         │       │
│  │  - Downside: HF timeout is opaque                                 │       │
│  │                                                                   │       │
│  │  Option B: Prefetch and convert to base64                        │       │
│  │  - Timeout: 30 seconds                                            │       │
│  │  - Max size check before full download                            │       │
│  │  - Better error messages                                          │       │
│  │                                                                   │       │
│  │  Config: image_url_handling = "passthrough" | "prefetch"         │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Audio Input Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AUDIO INPUT EDGE CASES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Scenario 1: Long audio files (ASR)                                         │
│  ────────────────────────────────────────────────────────────────────────── │
│  Problem: Files > 30 minutes cause timeouts                                │
│                                                                              │
│  Solution:                                                                   │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  - Max duration: 30 minutes per request                          │       │
│  │  - For longer audio: Chunk into segments                         │       │
│  │                                                                   │       │
│  │  Chunking strategy:                                               │       │
│  │  - Segment length: 5 minutes with 10s overlap                    │       │
│  │  - Process segments in parallel (max 3 concurrent)               │       │
│  │  - Merge transcripts with timestamp alignment                     │       │
│  │                                                                   │       │
│  │  Config: auto_chunk_long_audio = true                            │       │
│  │  Config: max_audio_duration_seconds = 1800                       │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Scenario 2: Unsupported audio format                                       │
│  ────────────────────────────────────────────────────────────────────────── │
│  Problem: OGG, FLAC, AAC may not be supported by all models                │
│                                                                              │
│  Solution:                                                                   │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  Universally supported: WAV, MP3, FLAC (most models)             │       │
│  │                                                                   │       │
│  │  Auto-convert chain:                                              │       │
│  │  - OGG → WAV                                                      │       │
│  │  - AAC → WAV                                                      │       │
│  │  - M4A → WAV                                                      │       │
│  │  - Requires: ffmpeg or symphonia crate                            │       │
│  │                                                                   │       │
│  │  If conversion unavailable: UnsupportedAudioFormat error         │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Scenario 3: Multi-channel audio                                            │
│  ────────────────────────────────────────────────────────────────────────── │
│  Problem: Stereo/multi-channel audio, ASR expects mono                     │
│                                                                              │
│  Solution:                                                                   │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  - Detect channel count from audio header                         │       │
│  │  - If channels > 1 and model expects mono:                       │       │
│  │    - Mix down to mono (average channels)                          │       │
│  │    - Log info about conversion                                    │       │
│  │  - Config: auto_convert_to_mono = true                           │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Rate Limiting & Throttling

### 6.1 Adaptive Rate Limiting

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ADAPTIVE RATE LIMITING                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Problem: HF rate limits vary by account tier, not always documented       │
│                                                                              │
│  Solution: Learn rate limits from response headers                          │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                                                                   │       │
│  │  Headers to parse:                                                │       │
│  │  ─────────────────────────────────────────────────────────────── │       │
│  │  X-RateLimit-Limit: 1000           (requests per window)         │       │
│  │  X-RateLimit-Remaining: 842        (requests left)               │       │
│  │  X-RateLimit-Reset: 1702400000     (window reset timestamp)      │       │
│  │  Retry-After: 30                   (seconds until retry ok)      │       │
│  │                                                                   │       │
│  │  Adaptive behavior:                                               │       │
│  │  ─────────────────────────────────────────────────────────────── │       │
│  │  1. Initialize with conservative defaults (100 req/min)          │       │
│  │  2. On successful response: Update known limits from headers     │       │
│  │  3. On 429: Respect Retry-After exactly                          │       │
│  │  4. Proactive throttle when remaining < 10% of limit             │       │
│  │                                                                   │       │
│  │  Per-provider tracking:                                           │       │
│  │  ─────────────────────────────────────────────────────────────── │       │
│  │  rate_limit_state: Map<InferenceProvider, RateLimitState>        │       │
│  │                                                                   │       │
│  │  struct RateLimitState {                                          │       │
│  │    limit: u32,                                                    │       │
│  │    remaining: u32,                                                │       │
│  │    reset_at: Instant,                                             │       │
│  │    last_updated: Instant,                                         │       │
│  │  }                                                                │       │
│  │                                                                   │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Graceful degradation:                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                                                                   │       │
│  │  When approaching limit (remaining < 10%):                       │       │
│  │  1. Add artificial delay between requests                         │       │
│  │  2. Emit hf_rate_limit_approaching event                         │       │
│  │  3. If queue enabled, queue requests instead of failing          │       │
│  │                                                                   │       │
│  │  When limit exceeded:                                             │       │
│  │  1. Return RateLimited error with retry_after_ms                 │       │
│  │  2. DO NOT retry internally (let caller decide)                  │       │
│  │  3. Log warning with limit details                                │       │
│  │                                                                   │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Connection Management

### 7.1 Connection Pooling Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONNECTION POOLING                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Pool configuration by provider type:                                       │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                                                                   │       │
│  │  HF Serverless (api-inference.huggingface.co):                   │       │
│  │  ─────────────────────────────────────────────────────────────── │       │
│  │  - Pool size: 50 connections (shared across all models)          │       │
│  │  - Idle timeout: 90 seconds                                       │       │
│  │  - HTTP/2 multiplexing enabled                                    │       │
│  │                                                                   │       │
│  │  Dedicated endpoints (*.endpoints.huggingface.cloud):            │       │
│  │  ─────────────────────────────────────────────────────────────── │       │
│  │  - Pool per endpoint: 10 connections                             │       │
│  │  - Idle timeout: 60 seconds                                       │       │
│  │  - Scale with endpoint replica count                              │       │
│  │                                                                   │       │
│  │  Third-party providers:                                           │       │
│  │  ─────────────────────────────────────────────────────────────── │       │
│  │  - Pool per provider: 20 connections                             │       │
│  │  - Idle timeout: 90 seconds                                       │       │
│  │  - HTTP/2 where supported                                         │       │
│  │                                                                   │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Health checks:                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                                                                   │       │
│  │  - Periodic keepalive: Every 30 seconds                          │       │
│  │  - Connection validation before use                               │       │
│  │  - Auto-reconnect on stale connection                             │       │
│  │  - Metric: hf_connection_pool_size gauge                         │       │
│  │                                                                   │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Timeout Configuration

### 8.1 Timeout Matrix

| Operation | Default | Min | Max | Configurable |
|-----------|---------|-----|-----|--------------|
| Connection | 10s | 5s | 30s | Yes |
| Request (non-streaming) | 120s | 30s | 600s | Yes |
| Request (streaming) | 300s | 60s | 900s | Yes |
| Cold start wait | 300s | 60s | 600s | Yes |
| Endpoint management | 60s | 30s | 120s | Yes |
| Image/audio upload | 180s | 60s | 300s | Yes |

### 8.2 Timeout Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TIMEOUT HANDLING STRATEGIES                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Strategy by operation type:                                                │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                                                                   │       │
│  │  Chat/Text Generation:                                            │       │
│  │  ─────────────────────────────────────────────────────────────── │       │
│  │  - Base timeout: 120s                                             │       │
│  │  - Dynamic: Add 1s per 100 max_tokens                            │       │
│  │  - Example: max_tokens=2000 → timeout = 120 + 20 = 140s          │       │
│  │                                                                   │       │
│  │  Embeddings:                                                      │       │
│  │  ─────────────────────────────────────────────────────────────── │       │
│  │  - Base timeout: 60s                                              │       │
│  │  - Batch adjustment: +30s per 100 inputs (batch)                 │       │
│  │                                                                   │       │
│  │  Image Generation:                                                │       │
│  │  ─────────────────────────────────────────────────────────────── │       │
│  │  - Base timeout: 180s                                             │       │
│  │  - SDXL/large models: 300s                                        │       │
│  │  - num_images adjustment: +60s per additional image              │       │
│  │                                                                   │       │
│  │  Audio (ASR):                                                     │       │
│  │  ─────────────────────────────────────────────────────────────── │       │
│  │  - Base timeout: 120s                                             │       │
│  │  - Duration adjustment: +30s per minute of audio                 │       │
│  │                                                                   │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Timeout error handling:                                                    │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                                                                   │       │
│  │  On timeout:                                                      │       │
│  │  1. Abort request immediately                                     │       │
│  │  2. Return GatewayTimeout error (no retry by default)            │       │
│  │  3. Log with operation details (model, params, duration)         │       │
│  │  4. Increment hf_request_timeout_total metric                    │       │
│  │                                                                   │       │
│  │  DO NOT:                                                          │       │
│  │  - Auto-retry timeouts (may cause duplicate processing)          │       │
│  │  - Keep connection open hoping for late response                  │       │
│  │                                                                   │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Caching Strategies

### 9.1 Response Caching

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RESPONSE CACHING                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Cacheable operations:                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                                                                   │       │
│  │  ✓ Embeddings (deterministic)                                    │       │
│  │    - Key: hash(model + input_text + options)                     │       │
│  │    - TTL: 24 hours (embeddings don't change)                     │       │
│  │    - Storage: RuvVector or in-memory LRU                         │       │
│  │                                                                   │       │
│  │  ✓ Classification tasks (deterministic)                          │       │
│  │    - Key: hash(model + input + task)                             │       │
│  │    - TTL: 1 hour                                                  │       │
│  │                                                                   │       │
│  │  ✗ Chat/Text Generation (non-deterministic by default)           │       │
│  │    - Only cache if temperature=0 AND seed is set                 │       │
│  │    - Otherwise, different results expected                        │       │
│  │                                                                   │       │
│  │  ✗ Image/Audio generation (inherently non-deterministic)         │       │
│  │    - Never cache (unless explicit seed request)                  │       │
│  │                                                                   │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Cache key construction:                                                    │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                                                                   │       │
│  │  fn cache_key(request: &EmbeddingRequest) -> String {            │       │
│  │    let mut hasher = Sha256::new();                                │       │
│  │    hasher.update(request.model.as_bytes());                       │       │
│  │    hasher.update(request.input.normalized().as_bytes());         │       │
│  │    if let Some(opts) = &request.options {                        │       │
│  │      hasher.update(opts.canonical_json().as_bytes());            │       │
│  │    }                                                              │       │
│  │    format!("hf:emb:{}", hex::encode(hasher.finalize()))          │       │
│  │  }                                                                │       │
│  │                                                                   │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Cache invalidation:                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                                                                   │       │
│  │  - Model update: Invalidate all entries for that model           │       │
│  │  - TTL expiry: Standard expiration                                │       │
│  │  - Manual: clear_cache(model?) API                               │       │
│  │  - Memory pressure: LRU eviction                                  │       │
│  │                                                                   │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Endpoint Cache Refinement

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ENDPOINT CACHE REFINEMENT                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Cache structure:                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                                                                   │       │
│  │  struct EndpointCache {                                           │       │
│  │    entries: DashMap<String, CachedEndpoint>,                     │       │
│  │    default_ttl: Duration,          // 5 minutes                  │       │
│  │    max_entries: usize,             // 1000                       │       │
│  │  }                                                                │       │
│  │                                                                   │       │
│  │  struct CachedEndpoint {                                          │       │
│  │    info: EndpointInfo,                                            │       │
│  │    cached_at: Instant,                                            │       │
│  │    last_used: Instant,                                            │       │
│  │    hit_count: u64,                                                │       │
│  │  }                                                                │       │
│  │                                                                   │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Cache policies:                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                                                                   │       │
│  │  Read-through:                                                    │       │
│  │  1. Check cache first                                             │       │
│  │  2. If miss or expired: Fetch from HF API                        │       │
│  │  3. Update cache                                                  │       │
│  │  4. Return result                                                 │       │
│  │                                                                   │       │
│  │  Write-through:                                                   │       │
│  │  - On create/update/delete: Update cache + API                   │       │
│  │  - On lifecycle change: Invalidate entry                         │       │
│  │                                                                   │       │
│  │  Background refresh:                                              │       │
│  │  - For active endpoints (hit_count > 10 in last hour)            │       │
│  │  - Refresh before TTL expiry                                      │       │
│  │  - Prevents cache miss latency for hot endpoints                  │       │
│  │                                                                   │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Observability Refinements

### 10.1 Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `hf_request_duration_seconds` | Histogram | model, task, provider, status | Request latency |
| `hf_request_total` | Counter | model, task, provider, status | Request count |
| `hf_tokens_total` | Counter | model, direction (input/output) | Token usage |
| `hf_cold_start_duration_seconds` | Histogram | model, endpoint | Cold start wait time |
| `hf_stream_chunks_total` | Counter | model | Stream chunks received |
| `hf_endpoint_status` | Gauge | endpoint, namespace | Endpoint state (0=down, 1=up) |
| `hf_cache_hit_total` | Counter | cache_type | Cache hits |
| `hf_cache_miss_total` | Counter | cache_type | Cache misses |
| `hf_provider_errors_total` | Counter | provider, error_type | Errors by provider |

### 10.2 Distributed Tracing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DISTRIBUTED TRACING SPANS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Span hierarchy:                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                                                                   │       │
│  │  hf.chat.complete                                                 │       │
│  │  ├── hf.provider.resolve                                         │       │
│  │  │   └── attributes: provider_type, model, endpoint_name         │       │
│  │  ├── hf.request.build                                            │       │
│  │  │   └── attributes: request_size_bytes                          │       │
│  │  ├── hf.cold_start.wait (conditional)                            │       │
│  │  │   └── attributes: wait_duration_ms, retry_count               │       │
│  │  ├── hf.http.request                                              │       │
│  │  │   ├── attributes: method, url, status_code                    │       │
│  │  │   └── events: request_sent, response_received                 │       │
│  │  └── hf.response.parse                                            │       │
│  │      └── attributes: tokens_prompt, tokens_completion            │       │
│  │                                                                   │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Required span attributes:                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                                                                   │       │
│  │  gen_ai.system = "huggingface"                                   │       │
│  │  gen_ai.request.model = "meta-llama/Llama-2-7b-chat-hf"         │       │
│  │  gen_ai.request.max_tokens = 512                                 │       │
│  │  gen_ai.response.finish_reason = "stop"                          │       │
│  │  gen_ai.usage.prompt_tokens = 100                                │       │
│  │  gen_ai.usage.completion_tokens = 50                             │       │
│  │                                                                   │       │
│  │  HF-specific:                                                     │       │
│  │  hf.provider_type = "dedicated"                                  │       │
│  │  hf.endpoint_name = "my-llama-endpoint"                          │       │
│  │  hf.cold_start = true                                             │       │
│  │  hf.task = "text-generation"                                     │       │
│  │                                                                   │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Testing Strategy Refinement

### 11.1 Contract Tests

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONTRACT TEST SCENARIOS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  API Contract Tests (against real HF API, rate-limited):                   │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                                                                   │       │
│  │  chat_completion_contract:                                        │       │
│  │  - Valid request returns 200 with expected schema                 │       │
│  │  - Missing auth returns 401                                       │       │
│  │  - Invalid model returns 404                                      │       │
│  │  - Streaming returns SSE with expected format                     │       │
│  │                                                                   │       │
│  │  text_generation_contract:                                        │       │
│  │  - Native format (inputs/parameters) works                        │       │
│  │  - OpenAI format (messages) works                                 │       │
│  │  - Parameters map correctly                                       │       │
│  │                                                                   │       │
│  │  embedding_contract:                                              │       │
│  │  - Single input returns vector                                    │       │
│  │  - Batch input returns list of vectors                            │       │
│  │  - Vector dimensions match model spec                             │       │
│  │                                                                   │       │
│  │  endpoint_management_contract:                                    │       │
│  │  - List returns array of endpoints                                │       │
│  │  - Create returns endpoint info                                   │       │
│  │  - Lifecycle operations succeed                                   │       │
│  │                                                                   │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  Run frequency: Daily in CI, or on-demand                                  │
│  Environment: Uses HF_TOKEN from secrets, dedicated test namespace         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Chaos Testing Scenarios

| Scenario | Injection Method | Expected Behavior |
|----------|------------------|-------------------|
| Cold start | Mock 503 with "loading" | Wait and retry succeeds |
| Rate limit | Mock 429 with Retry-After | Respect retry delay |
| Timeout | Delay response > timeout | Clean error, no hang |
| Network partition | Drop connections | Reconnect + retry |
| Malformed response | Invalid JSON | Skip chunk, continue |
| Provider failover | Mock provider error | Fallback to next (if enabled) |

---

## 12. Performance Benchmarks

### 12.1 Target Metrics

| Operation | P50 | P95 | P99 | Notes |
|-----------|-----|-----|-----|-------|
| Chat (short) | 200ms | 500ms | 1s | + model inference time |
| Chat (long/streaming) | TTFT <300ms | TTFT <600ms | TTFT <1s | Time to first token |
| Embedding (single) | 50ms | 150ms | 300ms | + model inference |
| Embedding (batch 100) | 200ms | 500ms | 1s | + model inference |
| Provider resolution | <1ms | <2ms | <5ms | Cached |
| Endpoint cache lookup | <0.1ms | <0.5ms | <1ms | DashMap |

### 12.2 Memory Targets

| Component | Target | Max | Notes |
|-----------|--------|-----|-------|
| Idle client | <5MB | 10MB | Per client instance |
| Per-request overhead | <1KB | 5KB | Excluding payload |
| Endpoint cache | <10MB | 50MB | 1000 endpoints |
| Response cache | <100MB | 500MB | Embeddings cache |
| Stream buffer | <1MB | 5MB | Per concurrent stream |

---

## 13. Production Hardening Checklist

### 13.1 Pre-deployment

- [ ] All contract tests passing
- [ ] Load test with 100 concurrent requests
- [ ] Cold start recovery tested
- [ ] Rate limit handling verified
- [ ] Circuit breakers configured per provider
- [ ] Metrics dashboards created
- [ ] Alerting rules defined
- [ ] Runbook documented

### 13.2 Monitoring Alerts

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| High error rate | error_rate > 5% for 5min | Critical | Page on-call |
| Cold start spike | cold_starts > 10/min | Warning | Investigate scale-to-zero |
| P99 latency | p99 > 10s for 10min | Warning | Check model performance |
| Rate limiting | rate_limited > 50/min | Warning | Review rate limits |
| Endpoint failures | endpoint_errors > 5/min | Critical | Check endpoint health |

---

## 14. Configuration Reference

### 14.1 Complete Configuration Schema

```yaml
# HfInferenceConfig
hf_inference:
  # Authentication
  token: "${HF_TOKEN}"                    # Required

  # Provider settings
  default_provider: "serverless"          # serverless | dedicated | together | groq | ...
  default_namespace: "my-org"             # For dedicated endpoints

  # Cold start handling
  auto_wait_for_model: true               # Wait for model to load
  cold_start_timeout_seconds: 300         # Max wait time

  # Endpoint management
  auto_resume_paused: false               # Auto-resume paused endpoints
  endpoint_cache_ttl_seconds: 300         # Endpoint info cache TTL

  # Rate limiting
  provider_rate_limits:                   # Override per-provider limits
    serverless: 1000                      # requests per minute
    groq: 30

  # Timeouts
  connection_timeout_ms: 10000
  request_timeout_ms: 120000
  stream_timeout_ms: 300000

  # Connection pooling
  pool_size_per_host: 50
  pool_idle_timeout_seconds: 90

  # Retry settings
  max_retries: 3
  retry_base_delay_ms: 1000
  retry_max_delay_ms: 30000

  # Caching
  enable_embedding_cache: true
  embedding_cache_ttl_hours: 24
  max_embedding_cache_size_mb: 100

  # Multimodal
  auto_optimize_images: true
  max_image_size_mb: 20
  auto_chunk_long_audio: true
  max_audio_duration_seconds: 1800

  # Observability
  enable_metrics: true
  enable_tracing: true
  trace_sample_rate: 0.1                  # 10% sampling
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial refinement phase |

---

**End of Refinement Phase**

*Next Phase: Completion — implementation finalization and deployment readiness.*
