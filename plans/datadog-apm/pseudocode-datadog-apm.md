# Datadog APM Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-14
**Module:** `integrations/datadog-apm`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Client Initialization](#2-client-initialization)
3. [Configuration](#3-configuration)
4. [Tracing Operations](#4-tracing-operations)
5. [Context Propagation](#5-context-propagation)
6. [Metrics Operations](#6-metrics-operations)
7. [Log Correlation](#7-log-correlation)
8. [LLM Instrumentation](#8-llm-instrumentation)
9. [Agent Tracing](#9-agent-tracing)
10. [Error Tracking](#10-error-tracking)
11. [Testing Support](#11-testing-support)

---

## 1. Overview

### 1.1 Pseudocode Conventions

```
CLASS ClassName:
    field: Type

    FUNCTION method(param: Type) -> ReturnType:
        // Comments explain intent
        variable = expression
        IF condition:
            action
        FOR item IN collection:
            process(item)
        RETURN value
```

### 1.2 London-School TDD Mapping

Each interface serves as a **contract** for:
1. **Production implementations** - Real Datadog APM emission
2. **Test doubles (mocks)** - Captured telemetry for assertions
3. **Dependency injection** - Composable, testable architecture

---

## 2. Client Initialization

### 2.1 DatadogAPMClient Interface

```pseudocode
INTERFACE DatadogAPMClient:
    FUNCTION startSpan(name: string, options?: SpanOptions) -> Span
    FUNCTION getCurrentSpan() -> Span | null
    FUNCTION injectContext(carrier: Carrier) -> void
    FUNCTION extractContext(carrier: Carrier) -> SpanContext | null
    FUNCTION increment(name: string, value?: number, tags?: Tags) -> void
    FUNCTION gauge(name: string, value: number, tags?: Tags) -> void
    FUNCTION histogram(name: string, value: number, tags?: Tags) -> void
    FUNCTION distribution(name: string, value: number, tags?: Tags) -> void
    FUNCTION flush() -> Promise<void>
    FUNCTION shutdown() -> Promise<void>

CLASS DatadogAPMClientImpl IMPLEMENTS DatadogAPMClient:
    tracer: DatadogTracer
    metricsClient: DogStatsDClient
    config: DatadogAPMConfig
    logger: Logger
    isShutdown: boolean

    FUNCTION constructor(config: DatadogAPMConfig):
        this.config = validateConfig(config)
        this.logger = config.logger ?? new NoopLogger()
        this.isShutdown = false

        // Initialize tracer
        this.tracer = initTracer(config)

        // Initialize metrics client
        this.metricsClient = initMetricsClient(config)

        this.logger.info("Datadog APM client initialized", {
            service: config.service,
            env: config.env,
            version: config.version
        })

    FUNCTION initTracer(config: DatadogAPMConfig) -> DatadogTracer:
        tracerOptions = {
            service: config.service,
            env: config.env,
            version: config.version,
            hostname: config.agentHost,
            port: config.agentPort,
            sampleRate: config.sampleRate,
            runtimeMetrics: false,  // Handled separately
            logInjection: false,    // Manual correlation
            tags: buildGlobalTags(config)
        }

        RETURN ddTrace.init(tracerOptions)

    FUNCTION initMetricsClient(config: DatadogAPMConfig) -> DogStatsDClient:
        clientOptions = {
            host: config.statsdHost ?? config.agentHost,
            port: config.statsdPort ?? 8125,
            prefix: config.metricsPrefix ?? "llmdevops.",
            globalTags: buildGlobalTags(config),
            maxBufferSize: config.metricsBufferSize ?? 8192,
            flushInterval: config.metricsFlushInterval ?? 2000
        }

        RETURN new StatsD(clientOptions)

    FUNCTION buildGlobalTags(config: DatadogAPMConfig) -> Tags:
        tags = {
            env: config.env,
            service: config.service,
            version: config.version
        }

        // Merge custom tags
        IF config.globalTags:
            tags = { ...tags, ...config.globalTags }

        RETURN tags
```

### 2.2 Client Factory

```pseudocode
CLASS DatadogAPMClientFactory:
    STATIC instance: DatadogAPMClient | null = null

    STATIC FUNCTION create(config: DatadogAPMConfig) -> DatadogAPMClient:
        IF DatadogAPMClientFactory.instance:
            throw new ConfigurationError("Client already initialized")

        DatadogAPMClientFactory.instance = new DatadogAPMClientImpl(config)
        RETURN DatadogAPMClientFactory.instance

    STATIC FUNCTION createMock() -> MockDatadogAPMClient:
        RETURN new MockDatadogAPMClient()

    STATIC FUNCTION getInstance() -> DatadogAPMClient:
        IF NOT DatadogAPMClientFactory.instance:
            throw new ConfigurationError("Client not initialized")

        RETURN DatadogAPMClientFactory.instance

    STATIC FUNCTION reset():
        IF DatadogAPMClientFactory.instance:
            DatadogAPMClientFactory.instance.shutdown()
            DatadogAPMClientFactory.instance = null
```

---

## 3. Configuration

### 3.1 Configuration Types

```pseudocode
INTERFACE DatadogAPMConfig:
    // Required - Unified service tagging
    service: string
    env: string
    version: string

    // Agent connection
    agentHost?: string          // Default: "localhost"
    agentPort?: number          // Default: 8126
    statsdHost?: string         // Default: agentHost
    statsdPort?: number         // Default: 8125

    // Sampling
    sampleRate?: number         // Default: 1.0 (100%)
    prioritySampling?: boolean  // Default: true

    // Metrics
    metricsPrefix?: string      // Default: "llmdevops."
    metricsBufferSize?: number  // Default: 8192
    metricsFlushInterval?: number // Default: 2000ms

    // Buffers
    traceBufferSize?: number    // Default: 1000
    flushTimeout?: number       // Default: 10000ms

    // Security
    apiKey?: string             // For direct API submission
    redactionRules?: RedactionRule[]

    // Custom tags
    globalTags?: Tags

    // Logging
    logger?: Logger

INTERFACE RedactionRule:
    pattern: RegExp | string
    replacement: string
    applyTo: "tags" | "logs" | "all"
```

### 3.2 Configuration Validation

```pseudocode
FUNCTION validateConfig(config: DatadogAPMConfig) -> DatadogAPMConfig:
    errors = []

    // Required fields
    IF NOT config.service OR config.service.trim() === "":
        errors.push("service is required")

    IF NOT config.env OR config.env.trim() === "":
        errors.push("env is required")

    IF NOT config.version OR config.version.trim() === "":
        errors.push("version is required")

    // Validate service name format
    IF config.service AND NOT isValidServiceName(config.service):
        errors.push("service must match [a-z0-9_-]+")

    // Validate sample rate
    IF config.sampleRate !== undefined:
        IF config.sampleRate < 0 OR config.sampleRate > 1:
            errors.push("sampleRate must be between 0 and 1")

    // Validate ports
    IF config.agentPort AND (config.agentPort < 1 OR config.agentPort > 65535):
        errors.push("agentPort must be valid port number")

    IF errors.length > 0:
        throw new ConfigurationError(errors.join("; "))

    // Apply defaults
    RETURN {
        ...config,
        agentHost: config.agentHost ?? "localhost",
        agentPort: config.agentPort ?? 8126,
        statsdHost: config.statsdHost ?? config.agentHost ?? "localhost",
        statsdPort: config.statsdPort ?? 8125,
        sampleRate: config.sampleRate ?? 1.0,
        prioritySampling: config.prioritySampling ?? true,
        metricsPrefix: config.metricsPrefix ?? "llmdevops.",
        metricsBufferSize: config.metricsBufferSize ?? 8192,
        metricsFlushInterval: config.metricsFlushInterval ?? 2000,
        traceBufferSize: config.traceBufferSize ?? 1000,
        flushTimeout: config.flushTimeout ?? 10000,
        redactionRules: config.redactionRules ?? []
    }

FUNCTION isValidServiceName(name: string) -> boolean:
    RETURN /^[a-z0-9_-]+$/.test(name)
```

### 3.3 Environment Configuration

```pseudocode
FUNCTION configFromEnvironment() -> DatadogAPMConfig:
    RETURN {
        service: process.env.DD_SERVICE ?? process.env.OTEL_SERVICE_NAME,
        env: process.env.DD_ENV ?? process.env.NODE_ENV ?? "development",
        version: process.env.DD_VERSION ?? "0.0.0",

        agentHost: process.env.DD_AGENT_HOST ?? "localhost",
        agentPort: parseInt(process.env.DD_TRACE_AGENT_PORT ?? "8126"),
        statsdHost: process.env.DD_DOGSTATSD_HOST,
        statsdPort: parseInt(process.env.DD_DOGSTATSD_PORT ?? "8125"),

        sampleRate: parseFloat(process.env.DD_TRACE_SAMPLE_RATE ?? "1.0"),
        prioritySampling: process.env.DD_PRIORITY_SAMPLING !== "false",

        apiKey: process.env.DD_API_KEY,

        globalTags: parseGlobalTags(process.env.DD_TAGS)
    }

FUNCTION parseGlobalTags(tagsString?: string) -> Tags:
    IF NOT tagsString:
        RETURN {}

    tags = {}
    pairs = tagsString.split(",")

    FOR pair IN pairs:
        [key, value] = pair.split(":")
        IF key AND value:
            tags[key.trim()] = value.trim()

    RETURN tags
```

---

## 4. Tracing Operations

### 4.1 Span Interface

```pseudocode
INTERFACE Span:
    traceId: string
    spanId: string
    parentId?: string
    name: string
    service: string
    resource: string
    startTime: number
    duration?: number
    tags: Tags
    error: boolean
    metrics: Record<string, number>

    FUNCTION setTag(key: string, value: TagValue) -> Span
    FUNCTION setError(error: Error) -> Span
    FUNCTION addEvent(name: string, attributes?: Tags) -> Span
    FUNCTION finish(endTime?: number) -> void
    FUNCTION context() -> SpanContext

INTERFACE SpanOptions:
    resource?: string
    type?: SpanType
    tags?: Tags
    childOf?: Span | SpanContext
    startTime?: number

ENUM SpanType:
    WEB = "web"
    HTTP = "http"
    SQL = "sql"
    CACHE = "cache"
    CUSTOM = "custom"
    LLM = "llm"
    AGENT = "agent"
```

### 4.2 Span Management

```pseudocode
CLASS SpanImpl IMPLEMENTS Span:
    private ddSpan: DatadogSpan
    private client: DatadogAPMClient
    private finished: boolean

    FUNCTION constructor(ddSpan: DatadogSpan, client: DatadogAPMClient):
        this.ddSpan = ddSpan
        this.client = client
        this.finished = false

    FUNCTION setTag(key: string, value: TagValue) -> Span:
        IF this.finished:
            this.client.logger.warn("Cannot set tag on finished span")
            RETURN this

        // Apply redaction if needed
        redactedValue = this.client.redact(key, value)
        this.ddSpan.setTag(key, redactedValue)
        RETURN this

    FUNCTION setError(error: Error) -> Span:
        IF this.finished:
            RETURN this

        this.ddSpan.setTag("error", true)
        this.ddSpan.setTag("error.type", error.name)
        this.ddSpan.setTag("error.message", error.message)

        IF error.stack:
            this.ddSpan.setTag("error.stack", error.stack)

        RETURN this

    FUNCTION addEvent(name: string, attributes?: Tags) -> Span:
        // Datadog doesn't have native events; use tags with timestamp
        timestamp = Date.now()
        eventKey = `event.${timestamp}.${name}`

        IF attributes:
            FOR [key, value] IN Object.entries(attributes):
                this.setTag(`${eventKey}.${key}`, value)
        ELSE:
            this.setTag(eventKey, true)

        RETURN this

    FUNCTION finish(endTime?: number) -> void:
        IF this.finished:
            RETURN

        this.finished = true
        this.ddSpan.finish(endTime)

    FUNCTION context() -> SpanContext:
        ddContext = this.ddSpan.context()
        RETURN {
            traceId: ddContext.toTraceId(),
            spanId: ddContext.toSpanId(),
            samplingPriority: ddContext.samplingPriority
        }

    // Getters
    GET traceId() -> string:
        RETURN this.ddSpan.context().toTraceId()

    GET spanId() -> string:
        RETURN this.ddSpan.context().toSpanId()
```

### 4.3 Span Creation

```pseudocode
FUNCTION client.startSpan(name: string, options?: SpanOptions) -> Span:
    IF this.isShutdown:
        throw new TracingError("Client is shutdown")

    spanOptions = {
        childOf: options?.childOf?.context() ?? this.tracer.scope().active(),
        tags: {
            ...options?.tags,
            "span.type": options?.type ?? SpanType.CUSTOM
        },
        startTime: options?.startTime
    }

    IF options?.resource:
        spanOptions.tags["resource.name"] = options.resource

    ddSpan = this.tracer.startSpan(name, spanOptions)

    span = new SpanImpl(ddSpan, this)

    this.logger.debug("Span started", {
        name: name,
        traceId: span.traceId,
        spanId: span.spanId
    })

    RETURN span

FUNCTION client.getCurrentSpan() -> Span | null:
    activeSpan = this.tracer.scope().active()

    IF NOT activeSpan:
        RETURN null

    RETURN new SpanImpl(activeSpan, this)

// Convenience wrapper for automatic span management
ASYNC FUNCTION client.trace<T>(
    name: string,
    fn: (span: Span) -> Promise<T>,
    options?: SpanOptions
) -> Promise<T>:
    span = this.startSpan(name, options)

    TRY:
        result = await fn(span)
        RETURN result

    CATCH error:
        span.setError(error)
        throw error

    FINALLY:
        span.finish()
```

---

## 5. Context Propagation

### 5.1 Propagator Interface

```pseudocode
INTERFACE Carrier:
    get(key: string) -> string | null
    set(key: string, value: string) -> void

INTERFACE SpanContext:
    traceId: string
    spanId: string
    samplingPriority?: number
    origin?: string

CLASS HeaderCarrier IMPLEMENTS Carrier:
    private headers: Record<string, string>

    FUNCTION constructor(headers?: Record<string, string>):
        this.headers = headers ?? {}

    FUNCTION get(key: string) -> string | null:
        // Case-insensitive lookup
        lowerKey = key.toLowerCase()
        FOR [k, v] IN Object.entries(this.headers):
            IF k.toLowerCase() === lowerKey:
                RETURN v
        RETURN null

    FUNCTION set(key: string, value: string) -> void:
        this.headers[key] = value

    FUNCTION toObject() -> Record<string, string>:
        RETURN { ...this.headers }
```

### 5.2 Context Injection

```pseudocode
// Datadog headers
CONST DD_TRACE_ID = "x-datadog-trace-id"
CONST DD_PARENT_ID = "x-datadog-parent-id"
CONST DD_SAMPLING_PRIORITY = "x-datadog-sampling-priority"
CONST DD_ORIGIN = "x-datadog-origin"
CONST DD_TAGS = "x-datadog-tags"

// W3C headers
CONST W3C_TRACEPARENT = "traceparent"
CONST W3C_TRACESTATE = "tracestate"

FUNCTION client.injectContext(carrier: Carrier) -> void:
    span = this.getCurrentSpan()

    IF NOT span:
        this.logger.debug("No active span for context injection")
        RETURN

    context = span.context()

    // Inject Datadog headers (primary)
    carrier.set(DD_TRACE_ID, context.traceId)
    carrier.set(DD_PARENT_ID, context.spanId)

    IF context.samplingPriority !== undefined:
        carrier.set(DD_SAMPLING_PRIORITY, String(context.samplingPriority))

    IF context.origin:
        carrier.set(DD_ORIGIN, context.origin)

    // Inject W3C TraceContext (for interop)
    traceparent = formatTraceparent(context)
    carrier.set(W3C_TRACEPARENT, traceparent)

    tracestate = formatTracestate(context, this.config.service)
    carrier.set(W3C_TRACESTATE, tracestate)

FUNCTION formatTraceparent(context: SpanContext) -> string:
    // Format: {version}-{trace-id}-{parent-id}-{flags}
    version = "00"
    traceId = padTraceId(context.traceId, 32)
    parentId = padTraceId(context.spanId, 16)
    flags = context.samplingPriority > 0 ? "01" : "00"

    RETURN `${version}-${traceId}-${parentId}-${flags}`

FUNCTION formatTracestate(context: SpanContext, service: string) -> string:
    ddState = `dd=s:${context.samplingPriority ?? 1};o:${context.origin ?? ""}`
    RETURN ddState
```

### 5.3 Context Extraction

```pseudocode
FUNCTION client.extractContext(carrier: Carrier) -> SpanContext | null:
    // Try Datadog headers first
    ddContext = extractDatadogContext(carrier)
    IF ddContext:
        RETURN ddContext

    // Fall back to W3C TraceContext
    w3cContext = extractW3CContext(carrier)
    IF w3cContext:
        RETURN w3cContext

    RETURN null

FUNCTION extractDatadogContext(carrier: Carrier) -> SpanContext | null:
    traceId = carrier.get(DD_TRACE_ID)
    parentId = carrier.get(DD_PARENT_ID)

    IF NOT traceId OR NOT parentId:
        RETURN null

    samplingPriority = carrier.get(DD_SAMPLING_PRIORITY)
    origin = carrier.get(DD_ORIGIN)

    RETURN {
        traceId: traceId,
        spanId: parentId,
        samplingPriority: samplingPriority ? parseInt(samplingPriority) : undefined,
        origin: origin ?? undefined
    }

FUNCTION extractW3CContext(carrier: Carrier) -> SpanContext | null:
    traceparent = carrier.get(W3C_TRACEPARENT)

    IF NOT traceparent:
        RETURN null

    // Parse: {version}-{trace-id}-{parent-id}-{flags}
    parts = traceparent.split("-")

    IF parts.length !== 4:
        RETURN null

    [version, traceId, parentId, flags] = parts

    IF version !== "00":
        this.logger.warn("Unknown traceparent version", { version })

    // Convert 128-bit trace ID to Datadog 64-bit
    ddTraceId = convertW3CTraceId(traceId)

    RETURN {
        traceId: ddTraceId,
        spanId: parentId,
        samplingPriority: flags === "01" ? 1 : 0
    }

FUNCTION convertW3CTraceId(w3cTraceId: string) -> string:
    // Datadog uses lower 64 bits
    IF w3cTraceId.length === 32:
        RETURN w3cTraceId.substring(16)
    RETURN w3cTraceId
```

---

## 6. Metrics Operations

### 6.1 Metrics Client Interface

```pseudocode
INTERFACE MetricsClient:
    FUNCTION increment(name: string, value?: number, tags?: Tags) -> void
    FUNCTION decrement(name: string, value?: number, tags?: Tags) -> void
    FUNCTION gauge(name: string, value: number, tags?: Tags) -> void
    FUNCTION histogram(name: string, value: number, tags?: Tags) -> void
    FUNCTION distribution(name: string, value: number, tags?: Tags) -> void
    FUNCTION timing(name: string, value: number, tags?: Tags) -> void
    FUNCTION set(name: string, value: string | number, tags?: Tags) -> void
    FUNCTION flush() -> Promise<void>
    FUNCTION close() -> Promise<void>
```

### 6.2 Metrics Implementation

```pseudocode
FUNCTION client.increment(name: string, value: number = 1, tags?: Tags) -> void:
    IF this.isShutdown:
        RETURN

    metricName = this.formatMetricName(name)
    formattedTags = this.formatTags(tags)

    this.metricsClient.increment(metricName, value, formattedTags)

    this.logger.trace("Metric increment", {
        name: metricName,
        value: value
    })

FUNCTION client.decrement(name: string, value: number = 1, tags?: Tags) -> void:
    this.increment(name, -value, tags)

FUNCTION client.gauge(name: string, value: number, tags?: Tags) -> void:
    IF this.isShutdown:
        RETURN

    metricName = this.formatMetricName(name)
    formattedTags = this.formatTags(tags)

    this.metricsClient.gauge(metricName, value, formattedTags)

FUNCTION client.histogram(name: string, value: number, tags?: Tags) -> void:
    IF this.isShutdown:
        RETURN

    metricName = this.formatMetricName(name)
    formattedTags = this.formatTags(tags)

    this.metricsClient.histogram(metricName, value, formattedTags)

FUNCTION client.distribution(name: string, value: number, tags?: Tags) -> void:
    IF this.isShutdown:
        RETURN

    metricName = this.formatMetricName(name)
    formattedTags = this.formatTags(tags)

    this.metricsClient.distribution(metricName, value, formattedTags)

FUNCTION client.timing(name: string, value: number, tags?: Tags) -> void:
    // Timing is histogram in milliseconds
    this.histogram(name, value, tags)

FUNCTION client.formatMetricName(name: string) -> string:
    // Prefix already applied by StatsD client
    // Ensure valid metric name format
    RETURN name.replace(/[^a-zA-Z0-9_.]/g, "_")

FUNCTION client.formatTags(tags?: Tags) -> string[]:
    IF NOT tags:
        RETURN []

    RETURN Object.entries(tags).map(([key, value]) =>
        `${this.sanitizeTagKey(key)}:${this.sanitizeTagValue(value)}`
    )

FUNCTION client.sanitizeTagKey(key: string) -> string:
    RETURN key.replace(/[^a-zA-Z0-9_.-]/g, "_").toLowerCase()

FUNCTION client.sanitizeTagValue(value: TagValue) -> string:
    strValue = String(value)
    // Remove special characters, limit length
    RETURN strValue.replace(/[,|]/g, "_").substring(0, 200)
```

### 6.3 Timing Helpers

```pseudocode
CLASS Timer:
    private startTime: number
    private client: DatadogAPMClient
    private metricName: string
    private tags: Tags

    FUNCTION constructor(client: DatadogAPMClient, metricName: string, tags?: Tags):
        this.client = client
        this.metricName = metricName
        this.tags = tags ?? {}
        this.startTime = performance.now()

    FUNCTION stop() -> number:
        elapsed = performance.now() - this.startTime
        this.client.timing(this.metricName, elapsed, this.tags)
        RETURN elapsed

    FUNCTION addTag(key: string, value: TagValue) -> Timer:
        this.tags[key] = value
        RETURN this

FUNCTION client.startTimer(metricName: string, tags?: Tags) -> Timer:
    RETURN new Timer(this, metricName, tags)

// Convenience decorator for timing functions
FUNCTION timed(metricName: string, tags?: Tags):
    RETURN FUNCTION decorator(target, propertyKey, descriptor):
        originalMethod = descriptor.value

        descriptor.value = ASYNC FUNCTION(...args):
            timer = getDatadogClient().startTimer(metricName, tags)
            TRY:
                result = await originalMethod.apply(this, args)
                timer.addTag("status", "success")
                RETURN result
            CATCH error:
                timer.addTag("status", "error")
                throw error
            FINALLY:
                timer.stop()

        RETURN descriptor
```

---

## 7. Log Correlation

### 7.1 Log Context Injection

```pseudocode
INTERFACE LogContext:
    dd: {
        trace_id: string
        span_id: string
        service: string
        env: string
        version: string
    }

FUNCTION client.getLogContext() -> LogContext | null:
    span = this.getCurrentSpan()

    IF NOT span:
        RETURN null

    context = span.context()

    RETURN {
        dd: {
            trace_id: context.traceId,
            span_id: context.spanId,
            service: this.config.service,
            env: this.config.env,
            version: this.config.version
        }
    }

FUNCTION client.injectLogContext(logRecord: Record<string, any>) -> Record<string, any>:
    logContext = this.getLogContext()

    IF NOT logContext:
        RETURN logRecord

    RETURN {
        ...logRecord,
        ...logContext
    }
```

### 7.2 Logger Wrapper

```pseudocode
CLASS CorrelatedLogger:
    private baseLogger: Logger
    private client: DatadogAPMClient

    FUNCTION constructor(baseLogger: Logger, client: DatadogAPMClient):
        this.baseLogger = baseLogger
        this.client = client

    FUNCTION trace(message: string, context?: Record<string, any>):
        this.log("trace", message, context)

    FUNCTION debug(message: string, context?: Record<string, any>):
        this.log("debug", message, context)

    FUNCTION info(message: string, context?: Record<string, any>):
        this.log("info", message, context)

    FUNCTION warn(message: string, context?: Record<string, any>):
        this.log("warn", message, context)

    FUNCTION error(message: string, context?: Record<string, any>):
        this.log("error", message, context)

    PRIVATE FUNCTION log(level: string, message: string, context?: Record<string, any>):
        enrichedContext = this.client.injectLogContext(context ?? {})
        this.baseLogger[level](message, enrichedContext)
```

---

## 8. LLM Instrumentation

### 8.1 LLM Span Interface

```pseudocode
INTERFACE LLMSpanOptions:
    provider: string              // "anthropic", "openai", etc.
    model: string                 // "claude-3-opus", "gpt-4"
    requestType: LLMRequestType   // "chat", "completion", "embed"
    streaming?: boolean
    maxTokens?: number
    temperature?: number
    parentSpan?: Span

ENUM LLMRequestType:
    CHAT = "chat"
    COMPLETION = "completion"
    EMBED = "embed"
    FUNCTION_CALL = "function_call"

INTERFACE LLMSpan EXTENDS Span:
    FUNCTION recordTokens(input: number, output: number) -> LLMSpan
    FUNCTION setFinishReason(reason: string) -> LLMSpan
    FUNCTION recordStreamChunk() -> LLMSpan
```

### 8.2 LLM Span Implementation

```pseudocode
CLASS LLMSpanImpl EXTENDS SpanImpl IMPLEMENTS LLMSpan:
    private inputTokens: number = 0
    private outputTokens: number = 0
    private streamChunks: number = 0

    STATIC FUNCTION create(
        client: DatadogAPMClient,
        name: string,
        options: LLMSpanOptions
    ) -> LLMSpan:
        span = client.startSpan(name, {
            type: SpanType.LLM,
            resource: `${options.provider}.${options.requestType}`,
            childOf: options.parentSpan,
            tags: {
                "llm.provider": options.provider,
                "llm.model": options.model,
                "llm.request_type": options.requestType,
                "llm.streaming": options.streaming ?? false
            }
        })

        IF options.maxTokens:
            span.setTag("llm.max_tokens", options.maxTokens)

        IF options.temperature !== undefined:
            span.setTag("llm.temperature", options.temperature)

        RETURN new LLMSpanImpl(span.ddSpan, client)

    FUNCTION recordTokens(input: number, output: number) -> LLMSpan:
        this.inputTokens = input
        this.outputTokens = output

        this.setTag("llm.input_tokens", input)
        this.setTag("llm.output_tokens", output)
        this.setTag("llm.total_tokens", input + output)

        // Also emit as metrics
        this.client.histogram("llm.tokens.input", input, {
            model: this.getTag("llm.model"),
            provider: this.getTag("llm.provider")
        })

        this.client.histogram("llm.tokens.output", output, {
            model: this.getTag("llm.model"),
            provider: this.getTag("llm.provider")
        })

        RETURN this

    FUNCTION setFinishReason(reason: string) -> LLMSpan:
        this.setTag("llm.finish_reason", reason)
        RETURN this

    FUNCTION recordStreamChunk() -> LLMSpan:
        this.streamChunks++
        RETURN this

    OVERRIDE FUNCTION finish(endTime?: number) -> void:
        IF this.streamChunks > 0:
            this.setTag("llm.stream_chunks", this.streamChunks)

        super.finish(endTime)
```

### 8.3 LLM Tracing Helper

```pseudocode
FUNCTION client.startLLMSpan(name: string, options: LLMSpanOptions) -> LLMSpan:
    RETURN LLMSpanImpl.create(this, name, options)

// Convenience wrapper
ASYNC FUNCTION client.traceLLM<T>(
    name: string,
    options: LLMSpanOptions,
    fn: (span: LLMSpan) -> Promise<T>
) -> Promise<T>:
    span = this.startLLMSpan(name, options)
    startTime = performance.now()

    TRY:
        result = await fn(span)

        // Record latency metric
        latency = performance.now() - startTime
        this.histogram("llm.request.latency", latency, {
            provider: options.provider,
            model: options.model,
            request_type: options.requestType
        })

        this.increment("llm.requests", 1, {
            provider: options.provider,
            model: options.model,
            status: "success"
        })

        RETURN result

    CATCH error:
        span.setError(error)

        this.increment("llm.requests", 1, {
            provider: options.provider,
            model: options.model,
            status: "error",
            error_type: error.name
        })

        throw error

    FINALLY:
        span.finish()
```

---

## 9. Agent Tracing

### 9.1 Agent Span Interface

```pseudocode
INTERFACE AgentSpanOptions:
    agentName: string
    agentType?: string
    parentSpan?: Span

INTERFACE AgentStepSpanOptions:
    stepNumber: number
    stepType?: string
    toolName?: string

INTERFACE AgentSpan EXTENDS Span:
    FUNCTION startStep(name: string, options: AgentStepSpanOptions) -> Span
    FUNCTION recordToolCall(toolName: string, duration: number, success: boolean) -> AgentSpan
    FUNCTION setTotalSteps(count: number) -> AgentSpan
    FUNCTION linkParentAgent(parentAgentSpan: AgentSpan) -> AgentSpan
```

### 9.2 Agent Span Implementation

```pseudocode
CLASS AgentSpanImpl EXTENDS SpanImpl IMPLEMENTS AgentSpan:
    private stepCount: number = 0
    private toolCalls: number = 0

    STATIC FUNCTION create(
        client: DatadogAPMClient,
        name: string,
        options: AgentSpanOptions
    ) -> AgentSpan:
        span = client.startSpan(name, {
            type: SpanType.AGENT,
            resource: options.agentName,
            childOf: options.parentSpan,
            tags: {
                "agent.name": options.agentName,
                "agent.type": options.agentType ?? "generic"
            }
        })

        RETURN new AgentSpanImpl(span.ddSpan, client)

    FUNCTION startStep(name: string, options: AgentStepSpanOptions) -> Span:
        this.stepCount++

        stepSpan = this.client.startSpan(name, {
            type: SpanType.CUSTOM,
            resource: `step.${options.stepNumber}`,
            childOf: this,
            tags: {
                "agent.step": options.stepNumber,
                "agent.step_type": options.stepType ?? "execution"
            }
        })

        IF options.toolName:
            stepSpan.setTag("agent.tool", options.toolName)

        RETURN stepSpan

    FUNCTION recordToolCall(toolName: string, duration: number, success: boolean) -> AgentSpan:
        this.toolCalls++

        this.client.increment("agent.tool_calls", 1, {
            agent: this.getTag("agent.name"),
            tool: toolName,
            status: success ? "success" : "error"
        })

        this.client.histogram("agent.tool_duration", duration, {
            agent: this.getTag("agent.name"),
            tool: toolName
        })

        RETURN this

    FUNCTION setTotalSteps(count: number) -> AgentSpan:
        this.setTag("agent.total_steps", count)
        RETURN this

    FUNCTION linkParentAgent(parentAgentSpan: AgentSpan) -> AgentSpan:
        this.setTag("agent.parent", parentAgentSpan.getTag("agent.name"))
        this.setTag("agent.parent_trace_id", parentAgentSpan.traceId)
        RETURN this

    OVERRIDE FUNCTION finish(endTime?: number) -> void:
        this.setTag("agent.step_count", this.stepCount)
        this.setTag("agent.tool_call_count", this.toolCalls)

        // Emit agent metrics
        this.client.increment("agent.executions", 1, {
            agent: this.getTag("agent.name"),
            type: this.getTag("agent.type")
        })

        this.client.histogram("agent.steps", this.stepCount, {
            agent: this.getTag("agent.name")
        })

        super.finish(endTime)
```

### 9.3 Agent Tracing Helper

```pseudocode
FUNCTION client.startAgentSpan(name: string, options: AgentSpanOptions) -> AgentSpan:
    RETURN AgentSpanImpl.create(this, name, options)

ASYNC FUNCTION client.traceAgent<T>(
    name: string,
    options: AgentSpanOptions,
    fn: (span: AgentSpan) -> Promise<T>
) -> Promise<T>:
    span = this.startAgentSpan(name, options)
    startTime = performance.now()

    TRY:
        result = await fn(span)

        latency = performance.now() - startTime
        this.histogram("agent.execution_time", latency, {
            agent: options.agentName,
            type: options.agentType
        })

        RETURN result

    CATCH error:
        span.setError(error)

        this.increment("agent.errors", 1, {
            agent: options.agentName,
            error_type: error.name
        })

        throw error

    FINALLY:
        span.finish()
```

---

## 10. Error Tracking

### 10.1 Error Capture

```pseudocode
INTERFACE ErrorTrackingOptions:
    span?: Span
    tags?: Tags
    fingerprint?: string[]

FUNCTION client.captureError(error: Error, options?: ErrorTrackingOptions) -> void:
    span = options?.span ?? this.getCurrentSpan()

    IF span:
        span.setError(error)

    // Emit error metrics
    this.increment("errors", 1, {
        error_type: error.name,
        ...options?.tags
    })

    // Log with correlation
    this.logger.error("Error captured", {
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack
        },
        ...this.getLogContext()
    })
```

### 10.2 Error Boundary Wrapper

```pseudocode
ASYNC FUNCTION client.withErrorTracking<T>(
    fn: () -> Promise<T>,
    options?: ErrorTrackingOptions
) -> Promise<T>:
    TRY:
        RETURN await fn()

    CATCH error:
        this.captureError(error, options)
        throw error
```

---

## 11. Testing Support

### 11.1 Mock Client

```pseudocode
CLASS MockDatadogAPMClient IMPLEMENTS DatadogAPMClient:
    capturedSpans: CapturedSpan[]
    capturedMetrics: CapturedMetric[]
    capturedLogs: CapturedLog[]
    config: DatadogAPMConfig

    FUNCTION constructor():
        this.capturedSpans = []
        this.capturedMetrics = []
        this.capturedLogs = []
        this.config = {
            service: "test-service",
            env: "test",
            version: "0.0.0"
        }

    FUNCTION startSpan(name: string, options?: SpanOptions) -> Span:
        captured = {
            name: name,
            options: options,
            tags: {},
            events: [],
            error: null,
            startTime: Date.now(),
            endTime: null
        }

        this.capturedSpans.push(captured)
        RETURN new MockSpan(captured)

    FUNCTION increment(name: string, value: number = 1, tags?: Tags) -> void:
        this.capturedMetrics.push({
            type: "counter",
            name: name,
            value: value,
            tags: tags ?? {},
            timestamp: Date.now()
        })

    FUNCTION gauge(name: string, value: number, tags?: Tags) -> void:
        this.capturedMetrics.push({
            type: "gauge",
            name: name,
            value: value,
            tags: tags ?? {},
            timestamp: Date.now()
        })

    FUNCTION histogram(name: string, value: number, tags?: Tags) -> void:
        this.capturedMetrics.push({
            type: "histogram",
            name: name,
            value: value,
            tags: tags ?? {},
            timestamp: Date.now()
        })

    // Test assertions
    FUNCTION assertSpanCreated(name: string, tags?: Tags) -> void:
        span = this.capturedSpans.find(s => s.name === name)
        IF NOT span:
            throw new AssertionError(`Span "${name}" not found`)

        IF tags:
            FOR [key, value] IN Object.entries(tags):
                IF span.tags[key] !== value:
                    throw new AssertionError(
                        `Span tag "${key}" expected "${value}", got "${span.tags[key]}"`
                    )

    FUNCTION assertMetricRecorded(name: string, type: string, tags?: Tags) -> void:
        metric = this.capturedMetrics.find(m =>
            m.name === name AND m.type === type
        )
        IF NOT metric:
            throw new AssertionError(`Metric "${name}" (${type}) not found`)

    FUNCTION getSpans(filter?: { name?: string, tags?: Tags }) -> CapturedSpan[]:
        spans = this.capturedSpans

        IF filter?.name:
            spans = spans.filter(s => s.name === filter.name)

        IF filter?.tags:
            spans = spans.filter(s =>
                Object.entries(filter.tags).every(([k, v]) => s.tags[k] === v)
            )

        RETURN spans

    FUNCTION getMetrics(filter?: { name?: string, type?: string }) -> CapturedMetric[]:
        metrics = this.capturedMetrics

        IF filter?.name:
            metrics = metrics.filter(m => m.name === filter.name)

        IF filter?.type:
            metrics = metrics.filter(m => m.type === filter.type)

        RETURN metrics

    FUNCTION reset() -> void:
        this.capturedSpans = []
        this.capturedMetrics = []
        this.capturedLogs = []

    ASYNC FUNCTION flush() -> Promise<void>:
        // No-op for mock
        RETURN

    ASYNC FUNCTION shutdown() -> Promise<void>:
        // No-op for mock
        RETURN
```

### 11.2 Test Fixtures

```pseudocode
FUNCTION createTestSpanFixture(overrides?: Partial<CapturedSpan>) -> CapturedSpan:
    RETURN {
        name: "test-span",
        traceId: "abc123",
        spanId: "def456",
        tags: {},
        events: [],
        error: null,
        startTime: Date.now(),
        endTime: null,
        ...overrides
    }

FUNCTION createTestMetricFixture(overrides?: Partial<CapturedMetric>) -> CapturedMetric:
    RETURN {
        type: "counter",
        name: "test.metric",
        value: 1,
        tags: {},
        timestamp: Date.now(),
        ...overrides
    }

FUNCTION createLLMSpanFixture(overrides?: Partial<LLMSpanOptions>) -> LLMSpanOptions:
    RETURN {
        provider: "anthropic",
        model: "claude-3-opus",
        requestType: LLMRequestType.CHAT,
        streaming: false,
        ...overrides
    }

FUNCTION createAgentSpanFixture(overrides?: Partial<AgentSpanOptions>) -> AgentSpanOptions:
    RETURN {
        agentName: "test-agent",
        agentType: "generic",
        ...overrides
    }
```

---

## 12. Shutdown and Cleanup

### 12.1 Graceful Shutdown

```pseudocode
ASYNC FUNCTION client.flush() -> Promise<void>:
    IF this.isShutdown:
        RETURN

    this.logger.debug("Flushing telemetry...")

    promises = [
        this.flushTraces(),
        this.flushMetrics()
    ]

    TRY:
        await Promise.all(promises)
        this.logger.debug("Flush completed")

    CATCH error:
        this.logger.error("Flush failed", { error: error.message })
        throw new ExportError("Flush failed: " + error.message)

ASYNC FUNCTION client.shutdown() -> Promise<void>:
    IF this.isShutdown:
        RETURN

    this.logger.info("Shutting down Datadog APM client...")

    TRY:
        // Flush with timeout
        await Promise.race([
            this.flush(),
            this.timeout(this.config.flushTimeout)
        ])

    CATCH error:
        this.logger.warn("Shutdown flush timeout or error", {
            error: error.message
        })

    FINALLY:
        this.isShutdown = true
        this.metricsClient.close()
        this.logger.info("Datadog APM client shutdown complete")

PRIVATE FUNCTION client.timeout(ms: number) -> Promise<never>:
    RETURN new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), ms)
    )
```
