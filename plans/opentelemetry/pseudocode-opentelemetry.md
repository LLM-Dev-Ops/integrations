# OpenTelemetry Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/opentelemetry`

---

## 1. SDK Initialization

### 1.1 Telemetry Provider

```pseudocode
CLASS TelemetryProvider:
    tracer_provider: TracerProvider
    meter_provider: MeterProvider
    logger_provider: LoggerProvider
    config: TelemetryConfig
    shutdown_handles: Vec<ShutdownHandle>

    FUNCTION init(config: TelemetryConfig) -> Result<Self>:
        // Build resource with service metadata
        resource = Resource::builder()
            .with_service_name(&config.service_name)
            .with_service_version(&config.service_version)
            .with_deployment_environment(&config.environment)
            .with_attributes(config.resource_attributes.clone())
            .build()

        // Initialize tracer provider
        tracer_provider = Self::init_tracer_provider(&config, resource.clone())?

        // Initialize meter provider
        meter_provider = Self::init_meter_provider(&config, resource.clone())?

        // Initialize logger provider
        logger_provider = Self::init_logger_provider(&config, resource.clone())?

        // Set global providers
        opentelemetry::global::set_tracer_provider(tracer_provider.clone())
        opentelemetry::global::set_meter_provider(meter_provider.clone())

        RETURN Ok(Self {
            tracer_provider,
            meter_provider,
            logger_provider,
            config,
            shutdown_handles: Vec::new()
        })

    FUNCTION init_tracer_provider(config: &TelemetryConfig, resource: Resource) -> Result<TracerProvider>:
        // Configure sampler
        sampler = MATCH config.sampling:
            SamplingConfig::AlwaysOn => Sampler::AlwaysOn
            SamplingConfig::AlwaysOff => Sampler::AlwaysOff
            SamplingConfig::TraceIdRatio(rate) => Sampler::TraceIdRatio(rate)
            SamplingConfig::ParentBased(inner) => Sampler::ParentBased(Box::new(inner))

        // Configure exporter
        exporter = Self::build_span_exporter(&config.exporter)?

        // Configure batch processor
        batch_config = BatchConfig::default()
            .with_max_queue_size(config.batch.max_queue_size)
            .with_max_export_batch_size(config.batch.max_batch_size)
            .with_scheduled_delay(config.batch.batch_timeout)

        processor = BatchSpanProcessor::builder(exporter, batch_config).build()

        // Build provider
        provider = TracerProvider::builder()
            .with_resource(resource)
            .with_sampler(sampler)
            .with_span_processor(processor)
            .build()

        RETURN Ok(provider)

    FUNCTION build_span_exporter(config: &ExporterConfig) -> Result<SpanExporter>:
        MATCH config.protocol:
            Protocol::OtlpGrpc =>
                OtlpGrpcExporter::builder()
                    .with_endpoint(&config.endpoint)
                    .with_timeout(config.timeout)
                    .with_tls_config(config.tls.clone())
                    .with_headers(config.headers.clone())
                    .build()

            Protocol::OtlpHttp =>
                OtlpHttpExporter::builder()
                    .with_endpoint(&config.endpoint)
                    .with_timeout(config.timeout)
                    .with_headers(config.headers.clone())
                    .build()

            Protocol::Stdout =>
                StdoutExporter::new()

    ASYNC FUNCTION shutdown(self) -> Result<()>:
        tracing::info!("Shutting down telemetry providers")

        // Shutdown with timeout
        timeout_result = tokio::time::timeout(
            Duration::from_secs(10),
            async {
                self.tracer_provider.shutdown()?;
                self.meter_provider.shutdown()?;
                self.logger_provider.shutdown()?;
                Ok(())
            }
        ).await

        MATCH timeout_result:
            Ok(Ok(())) => Ok(())
            Ok(Err(e)) => Err(OtelError::ShutdownError(e))
            Err(_) => Err(OtelError::FlushTimeout)

    FUNCTION tracer(self, name: &str) -> Tracer:
        RETURN self.tracer_provider.tracer(name)

    FUNCTION meter(self, name: &str) -> Meter:
        RETURN self.meter_provider.meter(name)
```

### 1.2 Configuration

```pseudocode
STRUCT TelemetryConfig:
    service_name: String
    service_version: String
    environment: String
    resource_attributes: HashMap<String, String>
    exporter: ExporterConfig
    sampling: SamplingConfig
    batch: BatchConfig
    redaction: RedactionConfig

    FUNCTION from_env() -> Result<Self>:
        RETURN Ok(Self {
            service_name: env::var("OTEL_SERVICE_NAME")
                .unwrap_or_else(|_| "unknown".to_string()),

            service_version: env::var("OTEL_SERVICE_VERSION")
                .unwrap_or_else(|_| "0.0.0".to_string()),

            environment: env::var("OTEL_DEPLOYMENT_ENVIRONMENT")
                .or_else(|_| env::var("ENV"))
                .unwrap_or_else(|_| "development".to_string()),

            resource_attributes: Self::parse_resource_attributes(),

            exporter: ExporterConfig::from_env()?,

            sampling: SamplingConfig::from_env()?,

            batch: BatchConfig::default(),

            redaction: RedactionConfig::default()
        })

    FUNCTION parse_resource_attributes() -> HashMap<String, String>:
        env::var("OTEL_RESOURCE_ATTRIBUTES")
            .map(|s| s.split(',')
                .filter_map(|kv| {
                    let parts: Vec<_> = kv.splitn(2, '=').collect();
                    if parts.len() == 2 {
                        Some((parts[0].to_string(), parts[1].to_string()))
                    } else {
                        None
                    }
                })
                .collect())
            .unwrap_or_default()

STRUCT ExporterConfig:
    protocol: Protocol
    endpoint: String
    timeout: Duration
    headers: HashMap<String, String>
    tls: Option<TlsConfig>

    FUNCTION from_env() -> Result<Self>:
        protocol = env::var("OTEL_EXPORTER_OTLP_PROTOCOL")
            .map(|p| match p.as_str() {
                "grpc" => Protocol::OtlpGrpc,
                "http/protobuf" => Protocol::OtlpHttp,
                _ => Protocol::OtlpGrpc
            })
            .unwrap_or(Protocol::OtlpGrpc)

        endpoint = env::var("OTEL_EXPORTER_OTLP_ENDPOINT")
            .unwrap_or_else(|_| "http://localhost:4317".to_string())

        headers = Self::parse_headers()

        RETURN Ok(Self {
            protocol,
            endpoint,
            timeout: Duration::from_secs(30),
            headers,
            tls: None
        })

    FUNCTION parse_headers() -> HashMap<String, String>:
        env::var("OTEL_EXPORTER_OTLP_HEADERS")
            .map(|s| s.split(',')
                .filter_map(|kv| {
                    let parts: Vec<_> = kv.splitn(2, '=').collect();
                    if parts.len() == 2 {
                        Some((parts[0].to_string(), parts[1].to_string()))
                    } else {
                        None
                    }
                })
                .collect())
            .unwrap_or_default()
```

---

## 2. Tracing Operations

### 2.1 Span Management

```pseudocode
CLASS SpanBuilder:
    tracer: Tracer
    name: String
    kind: SpanKind
    attributes: Vec<KeyValue>
    links: Vec<Link>
    parent: Option<Context>

    FUNCTION new(tracer: Tracer, name: &str) -> Self:
        RETURN Self {
            tracer,
            name: name.to_string(),
            kind: SpanKind::Internal,
            attributes: Vec::new(),
            links: Vec::new(),
            parent: None
        }

    FUNCTION with_kind(mut self, kind: SpanKind) -> Self:
        self.kind = kind
        RETURN self

    FUNCTION with_attribute(mut self, key: &str, value: impl Into<AttributeValue>) -> Self:
        self.attributes.push(KeyValue::new(key, value.into()))
        RETURN self

    FUNCTION with_attributes(mut self, attrs: impl IntoIterator<Item = KeyValue>) -> Self:
        self.attributes.extend(attrs)
        RETURN self

    FUNCTION with_link(mut self, span_context: SpanContext) -> Self:
        self.links.push(Link::new(span_context, Vec::new()))
        RETURN self

    FUNCTION with_parent(mut self, context: Context) -> Self:
        self.parent = Some(context)
        RETURN self

    FUNCTION start(self) -> Span:
        builder = self.tracer.span_builder(self.name)
            .with_kind(self.kind)
            .with_attributes(self.attributes)
            .with_links(self.links)

        IF self.parent IS Some(ctx):
            builder = builder.with_parent_context(ctx)

        RETURN builder.start(&self.tracer)

    FUNCTION start_with_context(self) -> (Span, Context):
        span = self.start()
        context = Context::current_with_span(span.clone())
        RETURN (span, context)

CLASS TracingHelper:
    tracer: Tracer
    redaction: RedactionConfig

    FUNCTION new(tracer: Tracer, redaction: RedactionConfig) -> Self:
        RETURN Self { tracer, redaction }

    FUNCTION span(self, name: &str) -> SpanBuilder:
        RETURN SpanBuilder::new(self.tracer.clone(), name)

    ASYNC FUNCTION trace<T, F, Fut>(self, name: &str, f: F) -> Result<T>
    WHERE F: FnOnce() -> Fut, Fut: Future<Output = Result<T>>:
        span = self.span(name).start()
        context = Context::current_with_span(span.clone())
        _guard = context.attach()

        result = f().await

        MATCH &result:
            Ok(_) => span.set_status(Status::Ok),
            Err(e) =>
                span.set_status(Status::Error { description: e.to_string() })
                span.record_exception(e)

        span.end()
        RETURN result

    FUNCTION add_event(span: &Span, name: &str, attributes: Vec<KeyValue>):
        span.add_event(name, attributes)

    FUNCTION set_attribute(span: &Span, key: &str, value: impl Into<AttributeValue>):
        span.set_attribute(KeyValue::new(key, value.into()))

    FUNCTION record_exception(span: &Span, error: &dyn Error):
        span.record_exception(error)
        span.set_status(Status::Error {
            description: error.to_string()
        })
```

### 2.2 Context Propagation

```pseudocode
CLASS ContextPropagator:
    propagator: CompositePropagator

    FUNCTION new() -> Self:
        propagator = CompositePropagator::new(vec![
            Box::new(TraceContextPropagator::new()),
            Box::new(BaggagePropagator::new())
        ])

        opentelemetry::global::set_text_map_propagator(propagator.clone())

        RETURN Self { propagator }

    FUNCTION inject_http_headers(context: &Context) -> HashMap<String, String>:
        injector = HashMapInjector::new()
        opentelemetry::global::get_text_map_propagator(|prop| {
            prop.inject_context(context, &mut injector)
        })
        RETURN injector.into_map()

    FUNCTION extract_http_headers(headers: &HashMap<String, String>) -> Context:
        extractor = HashMapExtractor::new(headers)
        opentelemetry::global::get_text_map_propagator(|prop| {
            prop.extract(&extractor)
        })

    FUNCTION inject_grpc_metadata(context: &Context, metadata: &mut MetadataMap):
        injector = MetadataMapInjector::new(metadata)
        opentelemetry::global::get_text_map_propagator(|prop| {
            prop.inject_context(context, &mut injector)
        })

    FUNCTION extract_grpc_metadata(metadata: &MetadataMap) -> Context:
        extractor = MetadataMapExtractor::new(metadata)
        opentelemetry::global::get_text_map_propagator(|prop| {
            prop.extract(&extractor)
        })

    FUNCTION get_trace_id(context: &Context) -> Option<String>:
        span_context = context.span().span_context()
        IF span_context.is_valid():
            RETURN Some(span_context.trace_id().to_string())
        RETURN None

    FUNCTION get_span_id(context: &Context) -> Option<String>:
        span_context = context.span().span_context()
        IF span_context.is_valid():
            RETURN Some(span_context.span_id().to_string())
        RETURN None

STRUCT Baggage:
    items: HashMap<String, String>

    FUNCTION set(mut self, key: &str, value: &str) -> Self:
        self.items.insert(key.to_string(), value.to_string())
        RETURN self

    FUNCTION get(self, key: &str) -> Option<&str>:
        RETURN self.items.get(key).map(|s| s.as_str())

    FUNCTION attach_to_context(self, context: &Context) -> Context:
        baggage = opentelemetry::baggage::Baggage::from_iter(
            self.items.into_iter().map(|(k, v)| (k, v))
        )
        context.with_baggage(baggage)
```

---

## 3. Metrics Operations

### 3.1 Metric Instruments

```pseudocode
CLASS MetricsHelper:
    meter: Meter
    counters: HashMap<String, Counter<u64>>
    histograms: HashMap<String, Histogram<f64>>
    gauges: HashMap<String, Gauge<f64>>

    FUNCTION new(meter: Meter) -> Self:
        RETURN Self {
            meter,
            counters: HashMap::new(),
            histograms: HashMap::new(),
            gauges: HashMap::new()
        }

    FUNCTION counter(mut self, name: &str, description: &str, unit: &str) -> Counter<u64>:
        IF NOT self.counters.contains_key(name):
            counter = self.meter
                .u64_counter(name)
                .with_description(description)
                .with_unit(unit)
                .init()
            self.counters.insert(name.to_string(), counter.clone())
            RETURN counter
        RETURN self.counters.get(name).unwrap().clone()

    FUNCTION histogram(mut self, name: &str, description: &str, unit: &str) -> Histogram<f64>:
        IF NOT self.histograms.contains_key(name):
            histogram = self.meter
                .f64_histogram(name)
                .with_description(description)
                .with_unit(unit)
                .init()
            self.histograms.insert(name.to_string(), histogram.clone())
            RETURN histogram
        RETURN self.histograms.get(name).unwrap().clone()

    FUNCTION gauge(mut self, name: &str, description: &str, unit: &str) -> Gauge<f64>:
        IF NOT self.gauges.contains_key(name):
            gauge = self.meter
                .f64_gauge(name)
                .with_description(description)
                .with_unit(unit)
                .init()
            self.gauges.insert(name.to_string(), gauge.clone())
            RETURN gauge
        RETURN self.gauges.get(name).unwrap().clone()

    FUNCTION increment(self, name: &str, value: u64, attributes: &[KeyValue]):
        IF counter = self.counters.get(name):
            counter.add(value, attributes)

    FUNCTION record_histogram(self, name: &str, value: f64, attributes: &[KeyValue]):
        IF histogram = self.histograms.get(name):
            histogram.record(value, attributes)

    FUNCTION set_gauge(self, name: &str, value: f64, attributes: &[KeyValue]):
        IF gauge = self.gauges.get(name):
            gauge.set(value, attributes)
```

### 3.2 Predefined Metrics

```pseudocode
CLASS LLMMetrics:
    token_counter: Counter<u64>
    latency_histogram: Histogram<f64>
    request_counter: Counter<u64>
    error_counter: Counter<u64>
    cost_counter: Counter<f64>

    FUNCTION new(meter: Meter) -> Self:
        token_counter = meter.u64_counter("gen_ai.tokens")
            .with_description("Number of tokens processed")
            .with_unit("token")
            .init()

        latency_histogram = meter.f64_histogram("gen_ai.latency")
            .with_description("LLM request latency")
            .with_unit("ms")
            .init()

        request_counter = meter.u64_counter("gen_ai.requests")
            .with_description("Number of LLM requests")
            .init()

        error_counter = meter.u64_counter("gen_ai.errors")
            .with_description("Number of LLM errors")
            .init()

        cost_counter = meter.f64_counter("gen_ai.cost")
            .with_description("Estimated cost of LLM requests")
            .with_unit("usd")
            .init()

        RETURN Self { token_counter, latency_histogram, request_counter, error_counter, cost_counter }

    FUNCTION record_request(self, model: &str, input_tokens: u64, output_tokens: u64, latency_ms: f64):
        attributes = [
            KeyValue::new("gen_ai.request.model", model),
        ]

        self.request_counter.add(1, &attributes)
        self.token_counter.add(input_tokens, &[
            KeyValue::new("gen_ai.request.model", model),
            KeyValue::new("gen_ai.token.type", "input")
        ])
        self.token_counter.add(output_tokens, &[
            KeyValue::new("gen_ai.request.model", model),
            KeyValue::new("gen_ai.token.type", "output")
        ])
        self.latency_histogram.record(latency_ms, &attributes)

    FUNCTION record_error(self, model: &str, error_type: &str):
        self.error_counter.add(1, &[
            KeyValue::new("gen_ai.request.model", model),
            KeyValue::new("error.type", error_type)
        ])

    FUNCTION record_cost(self, model: &str, cost: f64):
        self.cost_counter.add(cost, &[
            KeyValue::new("gen_ai.request.model", model)
        ])
```

---

## 4. LLM Tracing

### 4.1 LLM Span Builder

```pseudocode
CLASS LLMSpanBuilder:
    inner: SpanBuilder
    model: String
    provider: String
    redaction: RedactionConfig

    FUNCTION new(tracer: Tracer, operation: &str, model: &str, provider: &str) -> Self:
        inner = SpanBuilder::new(tracer, operation)
            .with_kind(SpanKind::Client)
            .with_attribute("gen_ai.system", provider)
            .with_attribute("gen_ai.request.model", model)

        RETURN Self {
            inner,
            model: model.to_string(),
            provider: provider.to_string(),
            redaction: RedactionConfig::default()
        }

    FUNCTION with_prompt(mut self, prompt: &str) -> Self:
        IF NOT self.redaction.redact_prompts:
            self.inner = self.inner.with_attribute("gen_ai.prompt", prompt)
        ELSE:
            self.inner = self.inner.with_attribute("gen_ai.prompt.length", prompt.len() as i64)
        RETURN self

    FUNCTION with_max_tokens(mut self, max_tokens: u32) -> Self:
        self.inner = self.inner.with_attribute("gen_ai.request.max_tokens", max_tokens as i64)
        RETURN self

    FUNCTION with_temperature(mut self, temperature: f32) -> Self:
        self.inner = self.inner.with_attribute("gen_ai.request.temperature", temperature as f64)
        RETURN self

    FUNCTION start(self) -> LLMSpan:
        span = self.inner.start()
        start_time = Instant::now()
        RETURN LLMSpan {
            span,
            start_time,
            model: self.model,
            redaction: self.redaction
        }

CLASS LLMSpan:
    span: Span
    start_time: Instant
    model: String
    redaction: RedactionConfig

    FUNCTION set_response(mut self, response: &str, finish_reason: &str):
        IF NOT self.redaction.redact_completions:
            self.span.set_attribute(KeyValue::new("gen_ai.completion", response))
        ELSE:
            self.span.set_attribute(KeyValue::new("gen_ai.completion.length", response.len() as i64))

        self.span.set_attribute(KeyValue::new("gen_ai.response.finish_reason", finish_reason))

    FUNCTION set_token_usage(mut self, input_tokens: u64, output_tokens: u64):
        self.span.set_attribute(KeyValue::new("gen_ai.usage.input_tokens", input_tokens as i64))
        self.span.set_attribute(KeyValue::new("gen_ai.usage.output_tokens", output_tokens as i64))
        self.span.set_attribute(KeyValue::new("gen_ai.usage.total_tokens", (input_tokens + output_tokens) as i64))

    FUNCTION set_response_model(mut self, model: &str):
        self.span.set_attribute(KeyValue::new("gen_ai.response.model", model))

    FUNCTION end(mut self):
        latency = self.start_time.elapsed()
        self.span.set_attribute(KeyValue::new("gen_ai.latency_ms", latency.as_millis() as i64))
        self.span.set_status(Status::Ok)
        self.span.end()

    FUNCTION end_with_error(mut self, error: &dyn Error):
        latency = self.start_time.elapsed()
        self.span.set_attribute(KeyValue::new("gen_ai.latency_ms", latency.as_millis() as i64))
        self.span.record_exception(error)
        self.span.set_status(Status::Error { description: error.to_string() })
        self.span.end()
```

### 4.2 Agent Tracing

```pseudocode
CLASS AgentTracer:
    tracer: Tracer
    agent_name: String
    parent_context: Option<Context>

    FUNCTION new(tracer: Tracer, agent_name: &str) -> Self:
        RETURN Self {
            tracer,
            agent_name: agent_name.to_string(),
            parent_context: None
        }

    FUNCTION with_parent(mut self, context: Context) -> Self:
        self.parent_context = Some(context)
        RETURN self

    FUNCTION start_agent_span(self) -> (Span, Context):
        builder = SpanBuilder::new(self.tracer.clone(), format!("agent.{}", self.agent_name))
            .with_kind(SpanKind::Internal)
            .with_attribute("agent.name", self.agent_name.clone())

        IF self.parent_context IS Some(ctx):
            builder = builder.with_parent(ctx)

        RETURN builder.start_with_context()

    FUNCTION trace_step(self, context: &Context, step_name: &str, step_index: u32) -> (Span, Context):
        builder = SpanBuilder::new(self.tracer.clone(), format!("agent.step.{}", step_name))
            .with_kind(SpanKind::Internal)
            .with_parent(context.clone())
            .with_attribute("agent.name", self.agent_name.clone())
            .with_attribute("agent.step", step_name)
            .with_attribute("agent.step_index", step_index as i64)

        RETURN builder.start_with_context()

    FUNCTION trace_tool_call(self, context: &Context, tool_name: &str, tool_input: &str) -> (Span, Context):
        builder = SpanBuilder::new(self.tracer.clone(), format!("agent.tool.{}", tool_name))
            .with_kind(SpanKind::Client)
            .with_parent(context.clone())
            .with_attribute("agent.name", self.agent_name.clone())
            .with_attribute("agent.tool_call", tool_name)
            .with_attribute("agent.tool_input.length", tool_input.len() as i64)

        RETURN builder.start_with_context()

    FUNCTION trace_memory_retrieval(self, context: &Context, query: &str, results_count: u32) -> (Span, Context):
        builder = SpanBuilder::new(self.tracer.clone(), "agent.memory.retrieval")
            .with_kind(SpanKind::Client)
            .with_parent(context.clone())
            .with_attribute("agent.name", self.agent_name.clone())
            .with_attribute("agent.memory.query.length", query.len() as i64)
            .with_attribute("agent.memory.results_count", results_count as i64)

        RETURN builder.start_with_context()

    FUNCTION link_child_agent(parent_context: &Context, child_context: &Context) -> Link:
        RETURN Link::new(
            child_context.span().span_context().clone(),
            vec![KeyValue::new("link.type", "child_agent")]
        )
```

---

## 5. Log Correlation

### 5.1 Log Bridge

```pseudocode
CLASS LogBridge:
    logger_provider: LoggerProvider
    redaction: RedactionConfig

    FUNCTION new(logger_provider: LoggerProvider, redaction: RedactionConfig) -> Self:
        RETURN Self { logger_provider, redaction }

    FUNCTION emit(self, record: LogRecord):
        // Get current trace context
        context = Context::current()
        span_context = context.span().span_context()

        // Build log with trace correlation
        builder = self.logger_provider
            .logger("application")
            .emit_log(record.severity)
            .with_body(record.body)

        IF span_context.is_valid():
            builder = builder
                .with_trace_id(span_context.trace_id())
                .with_span_id(span_context.span_id())
                .with_trace_flags(span_context.trace_flags())

        FOR (key, value) IN record.attributes:
            builder = builder.with_attribute(key, self.maybe_redact(key, value))

        builder.emit()

    FUNCTION maybe_redact(self, key: &str, value: &str) -> String:
        IF self.redaction.should_redact(key):
            RETURN "[REDACTED]"
        RETURN value.to_string()

STRUCT LogRecord:
    severity: Severity
    body: String
    attributes: HashMap<String, String>

    FUNCTION info(body: &str) -> Self:
        RETURN Self {
            severity: Severity::Info,
            body: body.to_string(),
            attributes: HashMap::new()
        }

    FUNCTION error(body: &str) -> Self:
        RETURN Self {
            severity: Severity::Error,
            body: body.to_string(),
            attributes: HashMap::new()
        }

    FUNCTION with_attribute(mut self, key: &str, value: &str) -> Self:
        self.attributes.insert(key.to_string(), value.to_string())
        RETURN self
```

### 5.2 Tracing-Log Integration

```pseudocode
CLASS TracingLogSubscriber:
    // Bridges `tracing` crate events to OTel logs

    FUNCTION new(logger_provider: LoggerProvider) -> Self:
        RETURN Self { logger_provider }

    FUNCTION on_event(self, event: &Event):
        // Convert tracing event to OTel log
        severity = MATCH event.metadata().level():
            Level::ERROR => Severity::Error
            Level::WARN => Severity::Warn
            Level::INFO => Severity::Info
            Level::DEBUG => Severity::Debug
            Level::TRACE => Severity::Trace

        message = format_event_message(event)
        attributes = extract_event_fields(event)

        record = LogRecord {
            severity,
            body: message,
            attributes
        }

        // Get span context from current tracing span
        current_span = tracing::Span::current()
        IF current_span.is_some():
            context = current_span.context()
            // Emit with trace correlation
            self.emit_with_context(record, context)
        ELSE:
            self.emit(record)
```

---

## 6. Export Handling

### 6.1 Batch Exporter

```pseudocode
CLASS BatchExportProcessor:
    exporter: SpanExporter
    queue: BoundedQueue<Span>
    config: BatchConfig
    shutdown_signal: CancellationToken

    ASYNC FUNCTION run(self):
        interval = tokio::time::interval(self.config.batch_timeout)

        LOOP:
            SELECT:
                _ = interval.tick() =>
                    self.export_batch().await

                _ = self.shutdown_signal.cancelled() =>
                    self.flush_and_shutdown().await
                    RETURN

    ASYNC FUNCTION export_batch(self):
        batch = self.queue.drain(self.config.max_batch_size)

        IF batch.is_empty():
            RETURN

        timer = Instant::now()

        result = tokio::time::timeout(
            self.config.export_timeout,
            self.exporter.export(batch.clone())
        ).await

        MATCH result:
            Ok(Ok(())) =>
                metrics::counter!("otel_spans_exported_total").increment(batch.len() as u64)
                metrics::histogram!("otel_export_latency_ms").record(timer.elapsed().as_millis() as f64)

            Ok(Err(e)) =>
                tracing::error!(error = %e, "Failed to export spans")
                metrics::counter!("otel_export_errors_total").increment(1)
                // Re-queue if transient error
                IF is_transient_error(&e):
                    self.requeue_batch(batch)

            Err(_) =>
                tracing::warn!(batch_size = batch.len(), "Export timeout, dropping batch")
                metrics::counter!("otel_spans_dropped_total").increment(batch.len() as u64)

    ASYNC FUNCTION flush_and_shutdown(self):
        // Export remaining spans with extended timeout
        remaining = self.queue.drain_all()

        IF NOT remaining.is_empty():
            result = tokio::time::timeout(
                Duration::from_secs(10),
                self.exporter.export(remaining.clone())
            ).await

            MATCH result:
                Ok(Ok(())) => tracing::info!(count = remaining.len(), "Flushed remaining spans")
                _ => tracing::warn!(count = remaining.len(), "Failed to flush remaining spans")

        self.exporter.shutdown().await
```

---

## 7. Redaction

### 7.1 Attribute Redaction

```pseudocode
STRUCT RedactionConfig:
    redact_prompts: bool
    redact_completions: bool
    redact_patterns: Vec<Regex>
    sensitive_keys: HashSet<String>

    FUNCTION default() -> Self:
        RETURN Self {
            redact_prompts: true,
            redact_completions: true,
            redact_patterns: vec![
                Regex::new(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"),  // Email
                Regex::new(r"\b\d{3}-\d{2}-\d{4}\b"),  // SSN
                Regex::new(r"\b(?:sk-|pk_)[a-zA-Z0-9]{20,}\b"),  // API keys
            ],
            sensitive_keys: HashSet::from([
                "password", "secret", "token", "api_key", "authorization",
                "credit_card", "ssn", "gen_ai.prompt", "gen_ai.completion"
            ])
        }

    FUNCTION should_redact(self, key: &str) -> bool:
        RETURN self.sensitive_keys.contains(&key.to_lowercase())

    FUNCTION redact_value(self, value: &str) -> String:
        result = value.to_string()

        FOR pattern IN &self.redact_patterns:
            result = pattern.replace_all(&result, "[REDACTED]").to_string()

        RETURN result

CLASS AttributeSanitizer:
    config: RedactionConfig

    FUNCTION sanitize(self, attributes: Vec<KeyValue>) -> Vec<KeyValue>:
        RETURN attributes.into_iter()
            .map(|kv| {
                IF self.config.should_redact(kv.key.as_str()):
                    KeyValue::new(kv.key, "[REDACTED]")
                ELSE:
                    let value = kv.value.as_str()
                        .map(|s| self.config.redact_value(s))
                        .unwrap_or_else(|| kv.value.to_string());
                    KeyValue::new(kv.key, value)
            })
            .collect()
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Pseudocode |

---

**Next Phase:** Architecture - Component diagrams, module structure, data flow, and integration patterns.
