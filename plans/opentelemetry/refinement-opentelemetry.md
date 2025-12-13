# OpenTelemetry Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/opentelemetry`

---

## 1. Overview

This refinement document details production hardening patterns, performance optimizations, edge case handling, and advanced implementation strategies for the OpenTelemetry Integration Module.

---

## 2. Performance Optimizations

### 2.1 Zero-Allocation Span Creation

```rust
// OPTIMIZATION: Pre-allocated attribute storage
// Avoids heap allocation for common span patterns

pub struct SpanAttributePool {
    pools: [ArrayVec<KeyValue, 16>; 64],  // 64 pre-allocated attribute arrays
    next_index: AtomicUsize,
}

impl SpanAttributePool {
    pub fn acquire(&self) -> &mut ArrayVec<KeyValue, 16> {
        let idx = self.next_index.fetch_add(1, Ordering::Relaxed) % 64;
        // Return pre-allocated array, avoiding heap allocation
        &mut self.pools[idx]
    }

    pub fn release(&self, _attrs: &mut ArrayVec<KeyValue, 16>) {
        // Array returns to pool automatically via index wrap
    }
}

// USAGE: Fast span creation path
impl SpanBuilder {
    pub fn start_fast(&self, name: &'static str) -> FastSpan {
        let attrs = self.pool.acquire();
        FastSpan {
            name,
            attrs,
            start: Instant::now(),
            // Use stack-allocated IDs when possible
            trace_id: self.context.trace_id(),
            span_id: generate_span_id_inline(),
        }
    }
}

// BENCHMARK TARGET: < 500ns for span creation with 4 attributes
```

### 2.2 Efficient String Interning

```rust
// OPTIMIZATION: Intern common attribute keys and values
// Reduces memory and comparison overhead

use std::sync::Arc;
use dashmap::DashMap;

pub struct StringInterner {
    strings: DashMap<u64, Arc<str>>,  // Hash -> Interned string
}

impl StringInterner {
    pub fn intern(&self, s: &str) -> Arc<str> {
        let hash = self.hash(s);

        // Fast path: already interned
        if let Some(interned) = self.strings.get(&hash) {
            return Arc::clone(&interned);
        }

        // Slow path: intern new string
        let interned: Arc<str> = Arc::from(s);
        self.strings.insert(hash, Arc::clone(&interned));
        interned
    }

    // Pre-intern common OTel attribute keys
    pub fn pre_intern_common(&self) {
        let common = [
            "service.name",
            "service.version",
            "gen_ai.system",
            "gen_ai.request.model",
            "gen_ai.usage.input_tokens",
            "gen_ai.usage.output_tokens",
            "http.method",
            "http.url",
            "http.status_code",
        ];

        for key in common {
            self.intern(key);
        }
    }
}
```

### 2.3 Lock-Free Queue Implementation

```rust
// OPTIMIZATION: Lock-free MPSC queue for span submission
// Eliminates contention in high-throughput scenarios

use crossbeam_queue::ArrayQueue;

pub struct LockFreeSpanQueue {
    queue: ArrayQueue<SpanData>,
    dropped_count: AtomicU64,
    capacity: usize,
}

impl LockFreeSpanQueue {
    pub fn new(capacity: usize) -> Self {
        Self {
            queue: ArrayQueue::new(capacity),
            dropped_count: AtomicU64::new(0),
            capacity,
        }
    }

    pub fn push(&self, span: SpanData) -> Result<(), SpanData> {
        match self.queue.push(span) {
            Ok(()) => Ok(()),
            Err(span) => {
                self.dropped_count.fetch_add(1, Ordering::Relaxed);
                // Log drop but don't fail application
                tracing::warn!(
                    dropped_total = self.dropped_count.load(Ordering::Relaxed),
                    "span queue full, dropping span"
                );
                Err(span)
            }
        }
    }

    pub fn pop_batch(&self, max_size: usize) -> Vec<SpanData> {
        let mut batch = Vec::with_capacity(max_size);
        while batch.len() < max_size {
            match self.queue.pop() {
                Some(span) => batch.push(span),
                None => break,
            }
        }
        batch
    }

    pub fn len(&self) -> usize {
        self.queue.len()
    }
}
```

### 2.4 Batch Compression Optimization

```rust
// OPTIMIZATION: Compress batches in parallel with serialization
// Reduces export latency for large batches

use flate2::write::GzEncoder;
use flate2::Compression;

pub struct OptimizedBatchExporter {
    compression_level: Compression,
    // Pre-allocated compression buffer
    compression_buffer: Vec<u8>,
}

impl OptimizedBatchExporter {
    pub async fn export_batch(&mut self, spans: Vec<SpanData>) -> Result<(), ExportError> {
        // Serialize to protobuf
        let proto_bytes = self.serialize_to_proto(&spans)?;

        // Compress only if beneficial (threshold: 1KB)
        let payload = if proto_bytes.len() > 1024 {
            self.compress(&proto_bytes)?
        } else {
            proto_bytes
        };

        // Export with appropriate content-encoding
        self.send_payload(payload).await
    }

    fn compress(&mut self, data: &[u8]) -> Result<Vec<u8>, ExportError> {
        self.compression_buffer.clear();

        let mut encoder = GzEncoder::new(
            &mut self.compression_buffer,
            self.compression_level,
        );

        encoder.write_all(data)?;
        encoder.finish()?;

        Ok(std::mem::take(&mut self.compression_buffer))
    }
}
```

---

## 3. Context Propagation Refinements

### 3.1 Efficient Header Extraction

```rust
// REFINEMENT: Optimize header parsing for high-throughput HTTP servers

pub struct OptimizedExtractor {
    // Pre-compiled regex for traceparent validation
    traceparent_pattern: Regex,
}

impl OptimizedExtractor {
    pub fn extract_from_headers(&self, headers: &HeaderMap) -> Option<SpanContext> {
        // Fast path: check header existence first
        let traceparent = headers.get("traceparent")?;

        // Validate format without full regex (faster)
        let bytes = traceparent.as_bytes();
        if bytes.len() != 55 {
            return None;  // Invalid length, skip regex
        }

        // Quick structural validation
        if bytes[2] != b'-' || bytes[35] != b'-' || bytes[52] != b'-' {
            return None;
        }

        // Parse components directly (avoid string allocation)
        let version = parse_hex_u8(&bytes[0..2])?;
        if version != 0 {
            return None;  // Only version 00 supported
        }

        let trace_id = TraceId::from_hex(&bytes[3..35]).ok()?;
        let span_id = SpanId::from_hex(&bytes[36..52]).ok()?;
        let flags = parse_hex_u8(&bytes[53..55])?;

        Some(SpanContext::new(
            trace_id,
            span_id,
            TraceFlags::new(flags),
            true,  // Remote
            TraceState::default(),
        ))
    }
}

#[inline]
fn parse_hex_u8(bytes: &[u8]) -> Option<u8> {
    let high = hex_digit(bytes[0])?;
    let low = hex_digit(bytes[1])?;
    Some((high << 4) | low)
}

#[inline]
fn hex_digit(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}
```

### 3.2 Baggage Size Limits

```rust
// REFINEMENT: Enforce baggage size limits per W3C spec

pub struct BaggageValidator {
    max_entries: usize,        // Default: 180
    max_entry_bytes: usize,    // Default: 4096
    max_total_bytes: usize,    // Default: 8192
}

impl BaggageValidator {
    pub fn validate_and_truncate(&self, baggage: &mut Baggage) -> ValidationResult {
        let mut total_bytes = 0;
        let mut entries_to_remove = Vec::new();
        let mut warnings = Vec::new();

        for (idx, (key, value)) in baggage.entries().enumerate() {
            // Check entry count
            if idx >= self.max_entries {
                entries_to_remove.push(key.clone());
                warnings.push(format!("exceeded max entries ({})", self.max_entries));
                continue;
            }

            // Check entry size
            let entry_bytes = key.len() + value.len() + 1;  // +1 for '='
            if entry_bytes > self.max_entry_bytes {
                entries_to_remove.push(key.clone());
                warnings.push(format!("entry '{}' exceeds size limit", key));
                continue;
            }

            // Check total size
            total_bytes += entry_bytes + 1;  // +1 for ',' separator
            if total_bytes > self.max_total_bytes {
                entries_to_remove.push(key.clone());
                warnings.push("exceeded total baggage size".to_string());
            }
        }

        // Remove invalid entries
        for key in entries_to_remove {
            baggage.remove(&key);
        }

        ValidationResult { warnings }
    }
}
```

### 3.3 Context Storage Optimization

```rust
// REFINEMENT: Thread-local context storage for async runtimes

use tokio::task_local;

task_local! {
    static CURRENT_CONTEXT: RefCell<Context>;
}

pub struct AsyncContextManager;

impl AsyncContextManager {
    /// Run future with context attached
    pub async fn with_context<F, T>(ctx: Context, fut: F) -> T
    where
        F: Future<Output = T>,
    {
        CURRENT_CONTEXT
            .scope(RefCell::new(ctx), fut)
            .await
    }

    /// Get current context (cheap clone via Arc)
    pub fn current() -> Context {
        CURRENT_CONTEXT
            .try_with(|ctx| ctx.borrow().clone())
            .unwrap_or_else(|_| Context::new())
    }

    /// Attach span to current context
    pub fn with_span<S: Span>(span: S) -> Context {
        Self::current().with_span(span)
    }
}

// USAGE: Propagate context across async boundaries
async fn handle_request(req: Request) -> Response {
    let ctx = extractor.extract(&req.headers());

    AsyncContextManager::with_context(ctx, async {
        let span = tracer.start("handle_request");
        let _guard = span.enter();

        // Context automatically available in nested async calls
        let result = process_with_llm().await;

        span.end();
        result
    }).await
}
```

---

## 4. LLM Tracing Refinements

### 4.1 Streaming Response Tracing

```rust
// REFINEMENT: Trace streaming LLM responses with proper timing

pub struct StreamingLLMSpan {
    inner: Span,
    first_token_time: Option<Instant>,
    token_count: AtomicU32,
    start_time: Instant,
}

impl StreamingLLMSpan {
    pub fn new(tracer: &Tracer, model: &str) -> Self {
        let span = tracer
            .span_builder("gen_ai.chat")
            .with_kind(SpanKind::Client)
            .with_attribute(KeyValue::new("gen_ai.request.model", model.to_string()))
            .with_attribute(KeyValue::new("gen_ai.response.streaming", true))
            .start(tracer);

        Self {
            inner: span,
            first_token_time: None,
            token_count: AtomicU32::new(0),
            start_time: Instant::now(),
        }
    }

    pub fn record_token(&mut self, token: &str) {
        // Record time to first token
        if self.first_token_time.is_none() {
            self.first_token_time = Some(Instant::now());
            let ttft = self.first_token_time.unwrap() - self.start_time;
            self.inner.set_attribute(KeyValue::new(
                "gen_ai.response.time_to_first_token_ms",
                ttft.as_millis() as i64,
            ));

            self.inner.add_event(
                "first_token",
                vec![KeyValue::new("token_preview", token.chars().take(10).collect::<String>())],
            );
        }

        self.token_count.fetch_add(1, Ordering::Relaxed);
    }

    pub fn finish(mut self, finish_reason: &str) {
        let total_time = self.start_time.elapsed();
        let token_count = self.token_count.load(Ordering::Relaxed);

        // Calculate tokens per second
        let tokens_per_sec = if total_time.as_secs_f64() > 0.0 {
            token_count as f64 / total_time.as_secs_f64()
        } else {
            0.0
        };

        self.inner.set_attribute(KeyValue::new(
            "gen_ai.usage.output_tokens",
            token_count as i64,
        ));
        self.inner.set_attribute(KeyValue::new(
            "gen_ai.response.finish_reason",
            finish_reason.to_string(),
        ));
        self.inner.set_attribute(KeyValue::new(
            "gen_ai.response.tokens_per_second",
            tokens_per_sec,
        ));
        self.inner.set_attribute(KeyValue::new(
            "gen_ai.response.total_duration_ms",
            total_time.as_millis() as i64,
        ));

        self.inner.end();
    }
}
```

### 4.2 Token Cost Calculation

```rust
// REFINEMENT: Automatic cost calculation based on model pricing

pub struct TokenCostCalculator {
    pricing: HashMap<String, ModelPricing>,
}

#[derive(Clone)]
pub struct ModelPricing {
    pub input_cost_per_1k: f64,   // USD per 1K input tokens
    pub output_cost_per_1k: f64,  // USD per 1K output tokens
}

impl TokenCostCalculator {
    pub fn new() -> Self {
        let mut pricing = HashMap::new();

        // Anthropic models
        pricing.insert("claude-3-opus".to_string(), ModelPricing {
            input_cost_per_1k: 0.015,
            output_cost_per_1k: 0.075,
        });
        pricing.insert("claude-3-sonnet".to_string(), ModelPricing {
            input_cost_per_1k: 0.003,
            output_cost_per_1k: 0.015,
        });
        pricing.insert("claude-3-haiku".to_string(), ModelPricing {
            input_cost_per_1k: 0.00025,
            output_cost_per_1k: 0.00125,
        });

        // OpenAI models
        pricing.insert("gpt-4-turbo".to_string(), ModelPricing {
            input_cost_per_1k: 0.01,
            output_cost_per_1k: 0.03,
        });
        pricing.insert("gpt-4o".to_string(), ModelPricing {
            input_cost_per_1k: 0.005,
            output_cost_per_1k: 0.015,
        });

        Self { pricing }
    }

    pub fn calculate_cost(
        &self,
        model: &str,
        input_tokens: u32,
        output_tokens: u32,
    ) -> Option<f64> {
        // Normalize model name (handle versioned names)
        let base_model = self.normalize_model_name(model);

        let pricing = self.pricing.get(&base_model)?;

        let input_cost = (input_tokens as f64 / 1000.0) * pricing.input_cost_per_1k;
        let output_cost = (output_tokens as f64 / 1000.0) * pricing.output_cost_per_1k;

        Some(input_cost + output_cost)
    }

    fn normalize_model_name(&self, model: &str) -> String {
        // Strip version suffixes: "claude-3-opus-20240229" -> "claude-3-opus"
        let parts: Vec<&str> = model.split('-').collect();
        if parts.len() > 3 && parts.last().map(|s| s.parse::<u32>().is_ok()).unwrap_or(false) {
            parts[..parts.len()-1].join("-")
        } else {
            model.to_string()
        }
    }
}

// Integration with LLMSpan
impl LLMSpan {
    pub fn record_usage_with_cost(
        &mut self,
        input_tokens: u32,
        output_tokens: u32,
        calculator: &TokenCostCalculator,
    ) {
        self.record_tokens(input_tokens, output_tokens);

        if let Some(cost) = calculator.calculate_cost(&self.model, input_tokens, output_tokens) {
            self.inner.set_attribute(KeyValue::new(
                "gen_ai.usage.cost_usd",
                cost,
            ));
        }
    }
}
```

### 4.3 Agent Decision Tracing

```rust
// REFINEMENT: Detailed tracing of agent decision-making

pub struct AgentDecisionTracer {
    tracer: Tracer,
    current_run: Option<Span>,
}

impl AgentDecisionTracer {
    pub fn trace_reasoning_step(&self, step: &ReasoningStep) -> Span {
        let span = self.tracer
            .span_builder("agent.reasoning")
            .with_kind(SpanKind::Internal)
            .start(&self.tracer);

        span.set_attribute(KeyValue::new("agent.reasoning.type", step.reasoning_type.clone()));
        span.set_attribute(KeyValue::new("agent.reasoning.confidence", step.confidence));

        // Add structured reasoning data as event
        span.add_event(
            "reasoning_details",
            vec![
                KeyValue::new("thought", step.thought.clone()),
                KeyValue::new("options_considered", step.options.len() as i64),
                KeyValue::new("selected_action", step.selected_action.clone()),
            ],
        );

        span
    }

    pub fn trace_tool_selection(&self, selection: &ToolSelection) -> Span {
        let span = self.tracer
            .span_builder("agent.tool_selection")
            .with_kind(SpanKind::Internal)
            .start(&self.tracer);

        span.set_attribute(KeyValue::new("agent.tool.name", selection.tool_name.clone()));
        span.set_attribute(KeyValue::new("agent.tool.reason", selection.reason.clone()));

        // Record available tools considered
        for (idx, tool) in selection.available_tools.iter().enumerate() {
            span.set_attribute(KeyValue::new(
                format!("agent.tool.available.{}", idx),
                tool.clone(),
            ));
        }

        span
    }

    pub fn trace_memory_retrieval(&self, query: &str, results: &[MemoryResult]) -> Span {
        let span = self.tracer
            .span_builder("agent.memory_retrieval")
            .with_kind(SpanKind::Internal)
            .start(&self.tracer);

        span.set_attribute(KeyValue::new("agent.memory.query_length", query.len() as i64));
        span.set_attribute(KeyValue::new("agent.memory.results_count", results.len() as i64));

        // Record top results with scores
        for (idx, result) in results.iter().take(5).enumerate() {
            span.set_attribute(KeyValue::new(
                format!("agent.memory.result.{}.score", idx),
                result.score,
            ));
            span.set_attribute(KeyValue::new(
                format!("agent.memory.result.{}.source", idx),
                result.source.clone(),
            ));
        }

        span
    }
}
```

---

## 5. Error Handling Refinements

### 5.1 Graceful Export Degradation

```rust
// REFINEMENT: Multi-level fallback for export failures

pub struct ResilientExporter {
    primary: Box<dyn SpanExporter>,
    fallback: Box<dyn SpanExporter>,
    local_buffer: RwLock<VecDeque<SpanData>>,
    config: ResilienceConfig,
    consecutive_failures: AtomicU32,
}

#[derive(Clone)]
pub struct ResilienceConfig {
    pub max_local_buffer: usize,
    pub failure_threshold: u32,
    pub recovery_probe_interval: Duration,
}

impl ResilientExporter {
    pub async fn export(&self, spans: Vec<SpanData>) -> ExportResult {
        let failures = self.consecutive_failures.load(Ordering::Relaxed);

        // If too many failures, go directly to fallback
        if failures >= self.config.failure_threshold {
            return self.export_with_fallback(spans).await;
        }

        // Try primary exporter
        match self.primary.export(spans.clone()).await {
            Ok(()) => {
                self.consecutive_failures.store(0, Ordering::Relaxed);
                self.drain_local_buffer().await;
                Ok(())
            }
            Err(e) => {
                self.consecutive_failures.fetch_add(1, Ordering::Relaxed);
                tracing::warn!(error = ?e, "primary export failed, using fallback");
                self.export_with_fallback(spans).await
            }
        }
    }

    async fn export_with_fallback(&self, spans: Vec<SpanData>) -> ExportResult {
        // Try fallback exporter
        match self.fallback.export(spans.clone()).await {
            Ok(()) => Ok(()),
            Err(e) => {
                tracing::error!(error = ?e, "fallback export also failed, buffering locally");
                self.buffer_locally(spans);
                // Don't fail the application
                Ok(())
            }
        }
    }

    fn buffer_locally(&self, spans: Vec<SpanData>) {
        let mut buffer = self.local_buffer.write().unwrap();

        for span in spans {
            if buffer.len() >= self.config.max_local_buffer {
                // Drop oldest
                buffer.pop_front();
            }
            buffer.push_back(span);
        }
    }

    async fn drain_local_buffer(&self) {
        let spans: Vec<_> = {
            let mut buffer = self.local_buffer.write().unwrap();
            buffer.drain(..).collect()
        };

        if !spans.is_empty() {
            tracing::info!(count = spans.len(), "draining local buffer after recovery");
            // Best effort, don't fail if this doesn't work
            let _ = self.primary.export(spans).await;
        }
    }
}
```

### 5.2 Span Error Enrichment

```rust
// REFINEMENT: Automatic error enrichment with context

pub struct ErrorEnricher;

impl ErrorEnricher {
    pub fn enrich_span_with_error(span: &mut dyn Span, error: &dyn std::error::Error) {
        // Set error status
        span.set_status(Status::error(error.to_string()));

        // Record exception event with full chain
        let mut attributes = vec![
            KeyValue::new("exception.type", std::any::type_name_of_val(error).to_string()),
            KeyValue::new("exception.message", error.to_string()),
        ];

        // Capture error chain
        let mut chain = Vec::new();
        let mut current: Option<&dyn std::error::Error> = Some(error);
        while let Some(e) = current {
            chain.push(e.to_string());
            current = e.source();
        }

        if chain.len() > 1 {
            attributes.push(KeyValue::new(
                "exception.chain",
                chain.join(" -> "),
            ));
        }

        // Capture backtrace if available
        #[cfg(feature = "backtrace")]
        if let Some(bt) = error.backtrace() {
            attributes.push(KeyValue::new(
                "exception.stacktrace",
                bt.to_string(),
            ));
        }

        span.add_event("exception", attributes);
    }

    pub fn enrich_llm_error(span: &mut dyn Span, error: &LLMError) {
        Self::enrich_span_with_error(span, error);

        // Add LLM-specific error attributes
        match error {
            LLMError::RateLimited { retry_after } => {
                span.set_attribute(KeyValue::new("gen_ai.error.type", "rate_limited"));
                if let Some(retry) = retry_after {
                    span.set_attribute(KeyValue::new(
                        "gen_ai.error.retry_after_ms",
                        retry.as_millis() as i64,
                    ));
                }
            }
            LLMError::TokenLimitExceeded { limit, requested } => {
                span.set_attribute(KeyValue::new("gen_ai.error.type", "token_limit"));
                span.set_attribute(KeyValue::new("gen_ai.error.token_limit", *limit as i64));
                span.set_attribute(KeyValue::new("gen_ai.error.tokens_requested", *requested as i64));
            }
            LLMError::ContentFiltered { reason } => {
                span.set_attribute(KeyValue::new("gen_ai.error.type", "content_filtered"));
                span.set_attribute(KeyValue::new("gen_ai.error.filter_reason", reason.clone()));
            }
            _ => {
                span.set_attribute(KeyValue::new("gen_ai.error.type", "unknown"));
            }
        }
    }
}
```

### 5.3 Circuit Breaker for Exporters

```rust
// REFINEMENT: Circuit breaker pattern for export protection

pub struct ExportCircuitBreaker {
    state: AtomicU8,  // 0=Closed, 1=Open, 2=HalfOpen
    failure_count: AtomicU32,
    last_failure: AtomicU64,  // Unix timestamp
    config: CircuitBreakerConfig,
}

#[derive(Clone)]
pub struct CircuitBreakerConfig {
    pub failure_threshold: u32,
    pub reset_timeout: Duration,
    pub half_open_max_calls: u32,
}

const STATE_CLOSED: u8 = 0;
const STATE_OPEN: u8 = 1;
const STATE_HALF_OPEN: u8 = 2;

impl ExportCircuitBreaker {
    pub fn can_execute(&self) -> bool {
        match self.state.load(Ordering::Relaxed) {
            STATE_CLOSED => true,
            STATE_OPEN => {
                // Check if reset timeout has passed
                let last = self.last_failure.load(Ordering::Relaxed);
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_secs();

                if now - last >= self.config.reset_timeout.as_secs() {
                    // Transition to half-open
                    self.state.store(STATE_HALF_OPEN, Ordering::Relaxed);
                    true
                } else {
                    false
                }
            }
            STATE_HALF_OPEN => true,
            _ => false,
        }
    }

    pub fn record_success(&self) {
        self.failure_count.store(0, Ordering::Relaxed);
        self.state.store(STATE_CLOSED, Ordering::Relaxed);
    }

    pub fn record_failure(&self) {
        let failures = self.failure_count.fetch_add(1, Ordering::Relaxed) + 1;

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        self.last_failure.store(now, Ordering::Relaxed);

        if failures >= self.config.failure_threshold {
            self.state.store(STATE_OPEN, Ordering::Relaxed);
            tracing::warn!(
                failures = failures,
                "circuit breaker opened for exporter"
            );
        }
    }
}
```

---

## 6. Security Refinements

### 6.1 Advanced Attribute Redaction

```rust
// REFINEMENT: Pattern-based sensitive data detection

pub struct AdvancedRedactor {
    patterns: Vec<CompiledPattern>,
    key_blocklist: HashSet<String>,
    value_length_limit: usize,
}

struct CompiledPattern {
    regex: Regex,
    replacement: String,
    description: String,
}

impl AdvancedRedactor {
    pub fn new() -> Self {
        let patterns = vec![
            // API Keys
            CompiledPattern {
                regex: Regex::new(r"sk-[a-zA-Z0-9]{32,}").unwrap(),
                replacement: "[OPENAI_KEY]".to_string(),
                description: "OpenAI API key".to_string(),
            },
            CompiledPattern {
                regex: Regex::new(r"sk-ant-[a-zA-Z0-9\-]{32,}").unwrap(),
                replacement: "[ANTHROPIC_KEY]".to_string(),
                description: "Anthropic API key".to_string(),
            },
            // AWS credentials
            CompiledPattern {
                regex: Regex::new(r"AKIA[0-9A-Z]{16}").unwrap(),
                replacement: "[AWS_ACCESS_KEY]".to_string(),
                description: "AWS access key".to_string(),
            },
            // Email addresses
            CompiledPattern {
                regex: Regex::new(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b").unwrap(),
                replacement: "[EMAIL]".to_string(),
                description: "Email address".to_string(),
            },
            // Credit card numbers
            CompiledPattern {
                regex: Regex::new(r"\b(?:\d{4}[- ]?){3}\d{4}\b").unwrap(),
                replacement: "[CARD_NUMBER]".to_string(),
                description: "Credit card number".to_string(),
            },
            // JWT tokens
            CompiledPattern {
                regex: Regex::new(r"eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*").unwrap(),
                replacement: "[JWT_TOKEN]".to_string(),
                description: "JWT token".to_string(),
            },
        ];

        let key_blocklist = [
            "password",
            "secret",
            "token",
            "api_key",
            "apikey",
            "authorization",
            "auth",
            "credential",
            "private_key",
            "access_token",
            "refresh_token",
        ].iter().map(|s| s.to_string()).collect();

        Self {
            patterns,
            key_blocklist,
            value_length_limit: 4096,
        }
    }

    pub fn redact_attributes(&self, attrs: &mut Vec<KeyValue>) {
        for attr in attrs.iter_mut() {
            // Check key blocklist (case-insensitive)
            let key_lower = attr.key.as_str().to_lowercase();
            if self.key_blocklist.iter().any(|blocked| key_lower.contains(blocked)) {
                attr.value = Value::String("[REDACTED_BY_KEY]".into());
                continue;
            }

            // Apply pattern-based redaction to string values
            if let Value::String(ref mut s) = attr.value {
                let mut redacted = s.to_string();
                for pattern in &self.patterns {
                    redacted = pattern.regex.replace_all(&redacted, &pattern.replacement).to_string();
                }

                // Truncate if too long
                if redacted.len() > self.value_length_limit {
                    redacted.truncate(self.value_length_limit);
                    redacted.push_str("...[TRUNCATED]");
                }

                *s = redacted.into();
            }
        }
    }
}
```

### 6.2 Secure Credential Resolution

```rust
// REFINEMENT: Secure credential management with rotation support

pub struct SecureCredentialResolver {
    env_prefix: String,
    credential_store: Option<Arc<dyn CredentialStore>>,
    cache: RwLock<HashMap<String, CachedCredential>>,
    refresh_interval: Duration,
}

struct CachedCredential {
    value: String,
    expires_at: Instant,
}

impl SecureCredentialResolver {
    pub async fn resolve_header(&self, key: &str) -> Option<String> {
        // Check cache first
        if let Some(cached) = self.get_cached(key) {
            return Some(cached);
        }

        // Try environment variable
        let env_key = format!("{}_{}", self.env_prefix, key.to_uppercase());
        if let Ok(value) = std::env::var(&env_key) {
            return Some(value);
        }

        // Try credential store
        if let Some(store) = &self.credential_store {
            if let Ok(cred) = store.get(key).await {
                self.cache_credential(key, &cred.value, cred.expires_in);
                return Some(cred.value);
            }
        }

        None
    }

    fn get_cached(&self, key: &str) -> Option<String> {
        let cache = self.cache.read().unwrap();
        cache.get(key).and_then(|c| {
            if c.expires_at > Instant::now() {
                Some(c.value.clone())
            } else {
                None
            }
        })
    }

    fn cache_credential(&self, key: &str, value: &str, ttl: Option<Duration>) {
        let mut cache = self.cache.write().unwrap();
        cache.insert(key.to_string(), CachedCredential {
            value: value.to_string(),
            expires_at: Instant::now() + ttl.unwrap_or(self.refresh_interval),
        });
    }
}
```

---

## 7. Metric Refinements

### 7.1 Histogram Bucket Optimization

```rust
// REFINEMENT: Custom histogram buckets for LLM latencies

pub struct LLMHistogramBuckets;

impl LLMHistogramBuckets {
    /// Buckets optimized for LLM response times (ms)
    /// Captures TTFT (fast), streaming (medium), and batch (slow)
    pub fn latency_buckets() -> Vec<f64> {
        vec![
            10.0,    // Very fast (cached)
            50.0,    // Fast TTFT
            100.0,   // Typical TTFT
            250.0,   // Slow TTFT
            500.0,   // Fast full response
            1000.0,  // 1 second
            2500.0,  // 2.5 seconds
            5000.0,  // 5 seconds
            10000.0, // 10 seconds
            30000.0, // 30 seconds (long generation)
            60000.0, // 1 minute (very long)
        ]
    }

    /// Buckets optimized for token counts
    pub fn token_buckets() -> Vec<f64> {
        vec![
            10.0,
            50.0,
            100.0,
            250.0,
            500.0,
            1000.0,
            2000.0,
            4000.0,
            8000.0,
            16000.0,
            32000.0,
            100000.0,  // Large context models
        ]
    }

    /// Buckets for cost (USD)
    pub fn cost_buckets() -> Vec<f64> {
        vec![
            0.0001,   // Fraction of a cent
            0.001,    // Tenth of a cent
            0.01,     // One cent
            0.05,     // Five cents
            0.10,     // Ten cents
            0.25,     // Quarter
            0.50,     // Half dollar
            1.00,     // One dollar
            5.00,     // Five dollars
            10.00,    // Ten dollars
        ]
    }
}

// Apply custom buckets to meter
impl LLMMetrics {
    pub fn new(meter: Meter) -> Self {
        let latency_histogram = meter
            .f64_histogram("gen_ai.client.operation.duration")
            .with_description("LLM operation duration in milliseconds")
            .with_unit(Unit::new("ms"))
            .with_boundaries(LLMHistogramBuckets::latency_buckets())
            .init();

        let token_histogram = meter
            .u64_histogram("gen_ai.client.token.usage")
            .with_description("Token usage per request")
            .with_boundaries(LLMHistogramBuckets::token_buckets())
            .init();

        Self {
            latency_histogram,
            token_histogram,
            // ...
        }
    }
}
```

### 7.2 Metric Cardinality Control

```rust
// REFINEMENT: Prevent metric cardinality explosion

pub struct CardinalityLimiter {
    limits: HashMap<String, CardinalityLimit>,
    seen_values: RwLock<HashMap<String, HashSet<String>>>,
}

struct CardinalityLimit {
    max_values: usize,
    overflow_value: String,
}

impl CardinalityLimiter {
    pub fn new() -> Self {
        let mut limits = HashMap::new();

        // Limit model names (new models appear frequently)
        limits.insert("gen_ai.request.model".to_string(), CardinalityLimit {
            max_values: 50,
            overflow_value: "other".to_string(),
        });

        // Limit agent names
        limits.insert("agent.name".to_string(), CardinalityLimit {
            max_values: 100,
            overflow_value: "other_agent".to_string(),
        });

        // Limit tool names
        limits.insert("agent.tool.name".to_string(), CardinalityLimit {
            max_values: 200,
            overflow_value: "other_tool".to_string(),
        });

        Self {
            limits,
            seen_values: RwLock::new(HashMap::new()),
        }
    }

    pub fn sanitize_attribute(&self, key: &str, value: String) -> String {
        let Some(limit) = self.limits.get(key) else {
            return value;
        };

        let mut seen = self.seen_values.write().unwrap();
        let values = seen.entry(key.to_string()).or_insert_with(HashSet::new);

        if values.contains(&value) {
            return value;
        }

        if values.len() >= limit.max_values {
            tracing::debug!(
                key = key,
                value = value,
                "cardinality limit reached, using overflow value"
            );
            return limit.overflow_value.clone();
        }

        values.insert(value.clone());
        value
    }
}
```

---

## 8. Sampling Refinements

### 8.1 Priority-Based Sampling

```rust
// REFINEMENT: Sample important spans more frequently

pub struct PrioritySampler {
    base_sampler: Box<dyn Sampler>,
    priority_rules: Vec<PriorityRule>,
}

struct PriorityRule {
    matcher: Box<dyn Fn(&str, &[KeyValue]) -> bool + Send + Sync>,
    sample_rate: f64,
    description: String,
}

impl PrioritySampler {
    pub fn new(base_rate: f64) -> Self {
        let base_sampler = Box::new(TraceIdRatioSampler::new(base_rate));

        let priority_rules = vec![
            // Always sample errors
            PriorityRule {
                matcher: Box::new(|name, attrs| {
                    attrs.iter().any(|kv| {
                        kv.key.as_str() == "error" && kv.value == Value::Bool(true)
                    })
                }),
                sample_rate: 1.0,
                description: "Always sample errors".to_string(),
            },
            // Sample 50% of LLM calls
            PriorityRule {
                matcher: Box::new(|name, _| name.starts_with("gen_ai.")),
                sample_rate: 0.5,
                description: "Sample 50% of LLM calls".to_string(),
            },
            // Sample 100% of slow operations (>5s)
            PriorityRule {
                matcher: Box::new(|_, attrs| {
                    attrs.iter().any(|kv| {
                        kv.key.as_str() == "duration_ms" &&
                        matches!(kv.value, Value::I64(d) if d > 5000)
                    })
                }),
                sample_rate: 1.0,
                description: "Always sample slow operations".to_string(),
            },
        ];

        Self {
            base_sampler,
            priority_rules,
        }
    }
}

impl Sampler for PrioritySampler {
    fn should_sample(
        &self,
        parent_context: Option<&Context>,
        trace_id: TraceId,
        name: &str,
        span_kind: &SpanKind,
        attributes: &[KeyValue],
        links: &[Link],
    ) -> SamplingResult {
        // Check priority rules first
        for rule in &self.priority_rules {
            if (rule.matcher)(name, attributes) {
                if rand::random::<f64>() < rule.sample_rate {
                    return SamplingResult {
                        decision: SamplingDecision::RecordAndSample,
                        attributes: vec![],
                        trace_state: TraceState::default(),
                    };
                }
            }
        }

        // Fall back to base sampler
        self.base_sampler.should_sample(
            parent_context,
            trace_id,
            name,
            span_kind,
            attributes,
            links,
        )
    }
}
```

### 8.2 Tail-Based Sampling Preparation

```rust
// REFINEMENT: Support for tail-based sampling decisions

pub struct TailSamplingBuffer {
    pending_traces: RwLock<HashMap<TraceId, PendingTrace>>,
    ttl: Duration,
    max_traces: usize,
}

struct PendingTrace {
    spans: Vec<SpanData>,
    created_at: Instant,
    has_error: bool,
    has_slow_span: bool,
    llm_tokens: u64,
}

impl TailSamplingBuffer {
    pub fn add_span(&self, span: SpanData) {
        let mut traces = self.pending_traces.write().unwrap();

        let trace = traces
            .entry(span.span_context.trace_id())
            .or_insert_with(|| PendingTrace {
                spans: Vec::new(),
                created_at: Instant::now(),
                has_error: false,
                has_slow_span: false,
                llm_tokens: 0,
            });

        // Update trace metadata
        if span.status.is_error() {
            trace.has_error = true;
        }

        let duration_ms = span.end_time
            .duration_since(span.start_time)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        if duration_ms > 5000 {
            trace.has_slow_span = true;
        }

        // Track LLM token usage
        if let Some(tokens) = span.attributes.get(&Key::new("gen_ai.usage.total_tokens")) {
            if let Value::I64(t) = tokens {
                trace.llm_tokens += *t as u64;
            }
        }

        trace.spans.push(span);
    }

    pub fn should_sample(&self, trace_id: &TraceId) -> bool {
        let traces = self.pending_traces.read().unwrap();

        if let Some(trace) = traces.get(trace_id) {
            // Sample all errors
            if trace.has_error {
                return true;
            }

            // Sample slow traces
            if trace.has_slow_span {
                return true;
            }

            // Sample high-cost traces (>1000 tokens)
            if trace.llm_tokens > 1000 {
                return true;
            }
        }

        false
    }

    pub fn flush_trace(&self, trace_id: &TraceId) -> Option<Vec<SpanData>> {
        let mut traces = self.pending_traces.write().unwrap();
        traces.remove(trace_id).map(|t| t.spans)
    }
}
```

---

## 9. Testing Refinements

### 9.1 Span Assertion Helpers

```rust
// REFINEMENT: Fluent assertion API for span testing

pub struct SpanAssertions<'a> {
    spans: &'a [SpanData],
}

impl<'a> SpanAssertions<'a> {
    pub fn new(spans: &'a [SpanData]) -> Self {
        Self { spans }
    }

    pub fn assert_span_count(&self, expected: usize) -> &Self {
        assert_eq!(
            self.spans.len(),
            expected,
            "Expected {} spans, found {}",
            expected,
            self.spans.len()
        );
        self
    }

    pub fn assert_span_exists(&self, name: &str) -> SpanAssertion<'a> {
        let span = self.spans.iter().find(|s| s.name == name);
        assert!(span.is_some(), "Span '{}' not found", name);
        SpanAssertion { span: span.unwrap() }
    }

    pub fn assert_span_order(&self, names: &[&str]) -> &Self {
        let span_names: Vec<_> = self.spans.iter().map(|s| s.name.as_str()).collect();

        let mut last_idx = 0;
        for name in names {
            let idx = span_names.iter().position(|n| n == name);
            assert!(idx.is_some(), "Span '{}' not found in order check", name);
            assert!(
                idx.unwrap() >= last_idx,
                "Span '{}' appears before expected",
                name
            );
            last_idx = idx.unwrap();
        }
        self
    }

    pub fn assert_trace_complete(&self) -> &Self {
        // All spans should have same trace_id
        if let Some(first) = self.spans.first() {
            let trace_id = first.span_context.trace_id();
            for span in self.spans {
                assert_eq!(
                    span.span_context.trace_id(),
                    trace_id,
                    "Span '{}' has different trace_id",
                    span.name
                );
            }
        }
        self
    }
}

pub struct SpanAssertion<'a> {
    span: &'a SpanData,
}

impl<'a> SpanAssertion<'a> {
    pub fn has_attribute(&self, key: &str, expected: impl Into<Value>) -> &Self {
        let expected = expected.into();
        let actual = self.span.attributes.get(&Key::new(key));
        assert!(
            actual.is_some(),
            "Span '{}' missing attribute '{}'",
            self.span.name,
            key
        );
        assert_eq!(
            actual.unwrap(),
            &expected,
            "Span '{}' attribute '{}' mismatch",
            self.span.name,
            key
        );
        self
    }

    pub fn has_status(&self, status: StatusCode) -> &Self {
        assert_eq!(
            self.span.status.code(),
            status,
            "Span '{}' status mismatch",
            self.span.name
        );
        self
    }

    pub fn has_parent(&self, parent_name: &str, spans: &[SpanData]) -> &Self {
        let parent = spans.iter().find(|s| s.name == parent_name);
        assert!(parent.is_some(), "Parent span '{}' not found", parent_name);

        assert_eq!(
            self.span.parent_span_id,
            Some(parent.unwrap().span_context.span_id()),
            "Span '{}' parent mismatch",
            self.span.name
        );
        self
    }

    pub fn has_event(&self, event_name: &str) -> &Self {
        let has_event = self.span.events.iter().any(|e| e.name == event_name);
        assert!(
            has_event,
            "Span '{}' missing event '{}'",
            self.span.name,
            event_name
        );
        self
    }

    pub fn duration_between(&self, min_ms: u64, max_ms: u64) -> &Self {
        let duration = self.span.end_time
            .duration_since(self.span.start_time)
            .unwrap_or_default();
        let duration_ms = duration.as_millis() as u64;

        assert!(
            duration_ms >= min_ms && duration_ms <= max_ms,
            "Span '{}' duration {}ms not in range [{}, {}]",
            self.span.name,
            duration_ms,
            min_ms,
            max_ms
        );
        self
    }
}

// USAGE
#[test]
fn test_llm_tracing() {
    let spans = exporter.get_spans();

    SpanAssertions::new(&spans)
        .assert_span_count(3)
        .assert_trace_complete()
        .assert_span_order(&["agent.run", "gen_ai.chat", "agent.tool_call"])
        .assert_span_exists("gen_ai.chat")
            .has_attribute("gen_ai.request.model", "claude-3-opus")
            .has_attribute("gen_ai.usage.input_tokens", 100i64)
            .has_status(StatusCode::Ok)
            .has_parent("agent.run", &spans);
}
```

### 9.2 Trace Simulation

```rust
// REFINEMENT: Generate realistic trace data for testing

pub struct TraceSimulator {
    tracer: Tracer,
    rng: StdRng,
}

impl TraceSimulator {
    pub fn simulate_llm_request(&mut self, config: LLMSimulationConfig) -> Vec<SpanData> {
        let mut spans = Vec::new();

        // Root span
        let root = self.tracer.start("llm.request");
        let root_ctx = Context::current().with_span(root);

        // Simulate processing time
        let prompt_process_time = self.rng.gen_range(10..50);

        // Create LLM span
        let _guard = root_ctx.attach();
        let llm_span = self.tracer
            .span_builder("gen_ai.chat")
            .with_kind(SpanKind::Client)
            .start(&self.tracer);

        // Simulate LLM latency
        let ttft = self.rng.gen_range(config.min_ttft_ms..config.max_ttft_ms);
        let generation_time = (config.output_tokens as f64 / config.tokens_per_second * 1000.0) as u64;

        // Set attributes
        llm_span.set_attribute(KeyValue::new("gen_ai.request.model", config.model.clone()));
        llm_span.set_attribute(KeyValue::new("gen_ai.usage.input_tokens", config.input_tokens as i64));
        llm_span.set_attribute(KeyValue::new("gen_ai.usage.output_tokens", config.output_tokens as i64));
        llm_span.set_attribute(KeyValue::new("gen_ai.response.time_to_first_token_ms", ttft as i64));

        if config.simulate_error && self.rng.gen_bool(config.error_rate) {
            llm_span.set_status(Status::error("Simulated error"));
            llm_span.add_event("exception", vec![
                KeyValue::new("exception.type", "SimulatedError"),
                KeyValue::new("exception.message", "Simulated LLM error"),
            ]);
        }

        llm_span.end();

        spans
    }

    pub fn simulate_agent_run(&mut self, steps: usize) -> Vec<SpanData> {
        let root = self.tracer.start("agent.run");
        let _guard = Context::current().with_span(root).attach();

        for step in 0..steps {
            let step_span = self.tracer
                .span_builder(&format!("agent.step.{}", step))
                .start(&self.tracer);
            let _step_guard = Context::current().with_span(step_span).attach();

            // Simulate LLM call
            if self.rng.gen_bool(0.8) {
                let llm = self.tracer.start("gen_ai.chat");
                llm.set_attribute(KeyValue::new("gen_ai.request.model", "claude-3-sonnet"));
                llm.end();
            }

            // Simulate tool call
            if self.rng.gen_bool(0.3) {
                let tool = self.tracer.start("agent.tool_call");
                tool.set_attribute(KeyValue::new("agent.tool.name", "search"));
                tool.end();
            }
        }

        Vec::new()
    }
}
```

---

## 10. TypeScript Refinements

### 10.1 Type-Safe Attribute Builder

```typescript
// REFINEMENT: Type-safe attribute construction

interface LLMAttributes {
  'gen_ai.system': 'anthropic' | 'openai' | 'cohere' | 'google';
  'gen_ai.request.model': string;
  'gen_ai.request.max_tokens'?: number;
  'gen_ai.request.temperature'?: number;
  'gen_ai.usage.input_tokens': number;
  'gen_ai.usage.output_tokens': number;
  'gen_ai.response.finish_reason': 'stop' | 'length' | 'content_filter' | 'tool_use';
}

interface AgentAttributes {
  'agent.name': string;
  'agent.step': number;
  'agent.tool.name'?: string;
  'agent.parent_agent'?: string;
}

type OTelAttributeValue = string | number | boolean | string[] | number[] | boolean[];

class TypedAttributeBuilder<T extends Record<string, OTelAttributeValue>> {
  private attributes: Partial<T> = {};

  set<K extends keyof T>(key: K, value: T[K]): this {
    this.attributes[key] = value;
    return this;
  }

  setIf<K extends keyof T>(condition: boolean, key: K, value: T[K]): this {
    if (condition) {
      this.attributes[key] = value;
    }
    return this;
  }

  build(): Attributes {
    return this.attributes as Attributes;
  }
}

// Usage
const llmAttrs = new TypedAttributeBuilder<LLMAttributes>()
  .set('gen_ai.system', 'anthropic')
  .set('gen_ai.request.model', 'claude-3-opus')
  .set('gen_ai.usage.input_tokens', 100)
  .set('gen_ai.usage.output_tokens', 500)
  .set('gen_ai.response.finish_reason', 'stop')
  .setIf(temperature !== undefined, 'gen_ai.request.temperature', temperature)
  .build();
```

### 10.2 Async Context Management

```typescript
// REFINEMENT: Proper async context propagation in Node.js

import { AsyncLocalStorage } from 'async_hooks';
import { Context, context } from '@opentelemetry/api';

class AsyncContextManager {
  private storage = new AsyncLocalStorage<Context>();

  active(): Context {
    return this.storage.getStore() ?? context.active();
  }

  with<T>(ctx: Context, fn: () => T): T {
    return this.storage.run(ctx, fn);
  }

  async withAsync<T>(ctx: Context, fn: () => Promise<T>): Promise<T> {
    return this.storage.run(ctx, fn);
  }

  bind<T extends (...args: any[]) => any>(ctx: Context, fn: T): T {
    const manager = this;
    return function (this: any, ...args: Parameters<T>): ReturnType<T> {
      return manager.with(ctx, () => fn.apply(this, args));
    } as T;
  }
}

// Decorator for automatic context propagation
function withTracing(spanName: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const tracer = trace.getTracer('app');
      const span = tracer.startSpan(spanName);

      try {
        const result = await context.with(
          trace.setSpan(context.active(), span),
          () => originalMethod.apply(this, args)
        );
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    };

    return descriptor;
  };
}

// Usage
class LLMService {
  @withTracing('llm.complete')
  async complete(prompt: string): Promise<string> {
    // Automatically traced
    return this.client.complete(prompt);
  }
}
```

---

## 11. Production Checklist

### 11.1 Pre-Production Validation

| Category | Check | Status |
|----------|-------|--------|
| **Performance** | Span creation < 1μs | ⬜ |
| **Performance** | No memory leaks under load | ⬜ |
| **Performance** | Queue backpressure tested | ⬜ |
| **Security** | Attribute redaction verified | ⬜ |
| **Security** | No secrets in traces | ⬜ |
| **Security** | TLS configured for export | ⬜ |
| **Reliability** | Graceful shutdown tested | ⬜ |
| **Reliability** | Export failure recovery tested | ⬜ |
| **Reliability** | Circuit breaker thresholds set | ⬜ |
| **Observability** | Self-metrics exported | ⬜ |
| **Observability** | Dropped span alerts configured | ⬜ |

### 11.2 Configuration Checklist

```yaml
# production-config.yaml
opentelemetry:
  service:
    name: "${SERVICE_NAME}"
    version: "${SERVICE_VERSION}"
    environment: production

  tracing:
    sampler:
      type: parent_based_trace_id_ratio
      ratio: 0.1
    batch_processor:
      max_queue_size: 4096
      max_export_batch_size: 512
      scheduled_delay_ms: 5000
      export_timeout_ms: 30000

  exporter:
    otlp:
      endpoint: "${OTEL_COLLECTOR_ENDPOINT}"
      protocol: grpc
      compression: gzip
      headers:
        Authorization: "Bearer ${OTEL_AUTH_TOKEN}"
      tls:
        insecure: false
        ca_cert: "/etc/ssl/certs/ca.pem"

  security:
    redaction:
      enabled: true
      redact_prompts: true
      redact_completions: true
      patterns:
        - "sk-[a-zA-Z0-9]+"
        - "AKIA[0-9A-Z]{16}"

  resilience:
    circuit_breaker:
      failure_threshold: 5
      reset_timeout_s: 60
    fallback_exporter: stdout
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Refinement |

---

**Next Phase:** Completion - Implementation tasks, file manifests, test coverage requirements, and deployment procedures.
