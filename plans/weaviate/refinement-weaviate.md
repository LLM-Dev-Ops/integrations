# Weaviate Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/vector/weaviate`

---

## 1. Edge Cases and Failure Modes

### 1.1 Vector Dimension Mismatch

```
Scenario: Vector provided doesn't match class configuration

Detection:
- HTTP 422 with "vector dimensions" error
- Mismatch between input vector length and schema

Mitigation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Cache vector dimensions per class from schema              │
│  2. Validate vector length before sending request              │
│  3. Provide clear error message with expected dimensions       │
│  4. Support automatic padding/truncation (optional, warned)    │
└─────────────────────────────────────────────────────────────────┘

Implementation:
FUNCTION validate_vector(client: WeaviateClient,
                        class_name: String,
                        vector: Vec<f32>) -> Result<()>:
    // Get cached schema
    schema = client.schema_cache.get_class(class_name)

    IF schema.vector_index_config.skip:
        RETURN Ok(())  // Class doesn't use vectors

    expected_dim = get_vector_dimension(schema)

    IF vector.len() != expected_dim:
        RAISE InvalidVector {
            message: "Vector dimension mismatch",
            expected: expected_dim,
            actual: vector.len(),
            class: class_name
        }

    RETURN Ok(())

FUNCTION get_vector_dimension(schema: ClassDefinition) -> u32:
    // Check module config for vectorizer dimension
    IF schema.module_config.contains("text2vec-openai"):
        RETURN schema.module_config["text2vec-openai"]["dimensions"] OR 1536

    IF schema.module_config.contains("text2vec-cohere"):
        RETURN schema.module_config["text2vec-cohere"]["dimensions"] OR 4096

    // Default based on common models
    RETURN 1536
```

### 1.2 Batch Partial Failures

```
Scenario: Some objects in batch fail while others succeed

Detection:
- BatchResponse with failed > 0
- Individual error messages per object

Mitigation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Return detailed error info per failed object               │
│  2. Support retry of failed objects only                       │
│  3. Provide idempotent batch with deterministic IDs            │
│  4. Track success/failure metrics per batch                    │
│  5. Option to fail-fast or continue on error                   │
└─────────────────────────────────────────────────────────────────┘

Implementation:
FUNCTION batch_create_with_retry(client: WeaviateClient,
                                 objects: Vec<BatchObject>,
                                 options: BatchOptions) -> BatchResult:
    max_retries = options.max_retries OR 3
    remaining = objects.clone()
    all_successful = []
    all_failed = []

    FOR attempt IN 1..=max_retries:
        IF remaining.is_empty():
            BREAK

        result = batch_create(client, remaining, options)

        // Collect successful
        successful_ids = result.get_successful_ids()
        all_successful.extend(successful_ids)

        // Identify retriable failures
        retriable = []
        FOR error IN result.errors:
            obj = remaining[error.index]

            IF is_retriable_batch_error(error):
                retriable.push(obj)
            ELSE:
                all_failed.push(BatchFailure {
                    object: obj,
                    error: error,
                    attempts: attempt
                })

        remaining = retriable

        IF remaining.not_empty() AND attempt < max_retries:
            backoff = 100 * 2^attempt
            SLEEP backoff
            LOG warn "Retrying failed batch objects"
                count=remaining.len()
                attempt=attempt

    // Any remaining are final failures
    FOR obj IN remaining:
        all_failed.push(BatchFailure {
            object: obj,
            error: "Max retries exceeded",
            attempts: max_retries
        })

    RETURN BatchResult {
        successful: all_successful,
        failed: all_failed,
        total_attempts: attempt
    }

FUNCTION is_retriable_batch_error(error: BatchError) -> bool:
    // Retry on transient errors only
    RETURN error.message.contains("timeout") OR
           error.message.contains("temporarily unavailable") OR
           error.message.contains("rate limit")
```

### 1.3 Tenant Not Active

```
Scenario: Query against inactive or offloaded tenant

Detection:
- HTTP 422 with "tenant not active" error
- Tenant status is Inactive or Offloaded

Mitigation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Check tenant status before operations                      │
│  2. Auto-activate tenant option (with warning)                 │
│  3. Clear error message with activation instructions           │
│  4. Cache tenant status with short TTL                         │
└─────────────────────────────────────────────────────────────────┘

Implementation:
FUNCTION ensure_tenant_active(client: WeaviateClient,
                              class_name: String,
                              tenant_name: String,
                              options: TenantOptions):
    tenant = get_tenant(client, class_name, tenant_name)

    IF tenant IS NULL:
        RAISE TenantNotFound(class_name, tenant_name)

    IF tenant.activity_status == Active:
        RETURN  // Ready

    IF tenant.activity_status == Inactive:
        IF options.auto_activate:
            LOG info "Auto-activating tenant" class=class_name tenant=tenant_name
            activate_tenant(client, class_name, tenant_name)
            RETURN
        ELSE:
            RAISE TenantNotActive {
                class: class_name,
                tenant: tenant_name,
                status: "inactive",
                message: "Tenant is inactive. Call activate_tenant() first."
            }

    IF tenant.activity_status == Offloaded:
        RAISE TenantNotActive {
            class: class_name,
            tenant: tenant_name,
            status: "offloaded",
            message: "Tenant is offloaded to cold storage. Activation may take time."
        }
```

### 1.4 Cross-Reference Cycles

```
Scenario: Creating reference that causes circular dependency

Detection:
- Deep reference chains during traversal
- Potential infinite loops in graph queries

Mitigation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Limit reference depth in queries (default: 3)             │
│  2. Detect cycles during validation (optional)                 │
│  3. Warn on deep reference chains                              │
│  4. Support explicit depth parameter in queries                │
└─────────────────────────────────────────────────────────────────┘

Implementation:
FUNCTION validate_reference_depth(query: GraphQLQuery, max_depth: u32 = 3):
    depth = calculate_reference_depth(query)

    IF depth > max_depth:
        RAISE InvalidQuery {
            message: "Reference depth exceeds maximum",
            depth: depth,
            max_depth: max_depth
        }

FUNCTION calculate_reference_depth(query: GraphQLQuery) -> u32:
    // Parse query to find nested reference selections
    depth = 0
    current = query.selection

    WHILE current.has_reference_fields():
        depth += 1
        current = current.reference_selection

    RETURN depth
```

### 1.5 Large Result Set Memory

```
Scenario: Search returns too many results, causing memory issues

Detection:
- High memory usage during result parsing
- Slow response times for large limit values

Mitigation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Enforce maximum limit (default: 10000)                     │
│  2. Support pagination with offset/after cursor                │
│  3. Stream results for very large queries                      │
│  4. Warn when approaching limits                               │
└─────────────────────────────────────────────────────────────────┘

Implementation:
FUNCTION validate_search_limit(limit: u32, options: SearchOptions):
    max_limit = options.max_limit OR 10000

    IF limit > max_limit:
        IF options.strict:
            RAISE InvalidQuery {
                message: "Limit exceeds maximum",
                limit: limit,
                max_limit: max_limit
            }
        ELSE:
            LOG warn "Limit reduced to maximum" requested=limit applied=max_limit
            RETURN max_limit

    RETURN limit

FUNCTION paginate_search(client: WeaviateClient,
                        class_name: String,
                        query: SearchQuery,
                        page_size: u32 = 100) -> SearchIterator:
    RETURN SearchIterator {
        client: client,
        class_name: class_name,
        query: query,
        page_size: page_size,
        offset: 0,
        exhausted: false,

        FUNCTION next_page() -> Option<Vec<SearchHit>>:
            IF exhausted:
                RETURN None

            query.limit = page_size
            query.offset = offset

            result = execute_search(client, class_name, query)

            IF result.objects.len() < page_size:
                exhausted = true

            offset += result.objects.len()
            RETURN Some(result.objects)
    }
```

### 1.6 Schema Cache Staleness

```
Scenario: Cached schema doesn't match actual schema after external update

Detection:
- Validation errors for valid objects
- Missing or extra properties

Mitigation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Short TTL for schema cache (5 minutes default)             │
│  2. Invalidate on schema-related errors                        │
│  3. Force refresh option for operations                        │
│  4. Webhook/event subscription for schema changes (optional)   │
└─────────────────────────────────────────────────────────────────┘

Implementation:
FUNCTION handle_schema_error(client: WeaviateClient, error: WeaviateError):
    IF error.message.contains("property") OR
       error.message.contains("class") OR
       error.message.contains("schema"):
        // Invalidate cache and retry
        class_name = extract_class_name(error)
        client.schema_cache.invalidate(class_name)

        LOG info "Schema cache invalidated due to error" class=class_name

FUNCTION with_schema_refresh<T>(client: WeaviateClient,
                                class_name: String,
                                operation: Fn() -> T) -> T:
    TRY:
        RETURN operation()
    CATCH SchemaError as e:
        client.schema_cache.invalidate(class_name)
        // Retry once with fresh schema
        RETURN operation()
```

---

## 2. Security Hardening

### 2.1 API Key Protection

```
Requirement: API keys never exposed in logs or errors

Implementation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Use SecretString type for API keys                         │
│  2. Implement Debug trait without exposing values              │
│  3. Sanitize headers in error messages                         │
│  4. Clear memory on deallocation                               │
└─────────────────────────────────────────────────────────────────┘

CLASS ApiKeyAuth:
    key: SecretString

    FUNCTION add_auth_header(request: &mut Request):
        request.header("Authorization", "Bearer " + key.expose())

    FUNCTION debug_format() -> String:
        RETURN "ApiKeyAuth { key: [REDACTED] }"

FUNCTION sanitize_request_error(error: HttpError) -> SanitizedError:
    message = error.message

    // Remove authorization header
    message = message.replace_regex(
        r"Authorization:\s*Bearer\s+\S+",
        "Authorization: Bearer [REDACTED]"
    )

    // Remove API key from URL params
    message = message.replace_regex(
        r"api[_-]?key=\S+",
        "api_key=[REDACTED]"
    )

    RETURN SanitizedError { message }
```

### 2.2 Vector Data Protection

```
Requirement: Vector values not logged (may encode sensitive content)

Implementation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Never log raw vector values                                │
│  2. Log only vector metadata (dimension, non-zero count)       │
│  3. Redact vectors in error messages                           │
│  4. Option to disable vector return in responses               │
└─────────────────────────────────────────────────────────────────┘

FUNCTION log_search_operation(operation: String,
                              class_name: String,
                              query: SearchQuery,
                              result: SearchResult):
    LOG info operation
        class = class_name
        vector_dim = query.vector.map(v => v.len())
        filter_present = query.filter IS NOT NULL
        limit = query.limit
        result_count = result.objects.len()
        // Vector values intentionally omitted

FUNCTION redact_vector_in_error(error: WeaviateError) -> WeaviateError:
    message = error.message

    // Redact vector arrays in error messages
    message = message.replace_regex(
        r"\[[-\d., ]{100,}\]",
        "[vector redacted]"
    )

    RETURN error.with_message(message)
```

### 2.3 Tenant Isolation Validation

```
Requirement: Ensure operations respect tenant boundaries

Implementation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Validate tenant parameter present for multi-tenant classes │
│  2. Prevent cross-tenant references                            │
│  3. Audit tenant access patterns                               │
│  4. Support tenant allowlist per client                        │
└─────────────────────────────────────────────────────────────────┘

FUNCTION validate_tenant_access(client: WeaviateClient,
                                class_name: String,
                                tenant: Option<String>):
    schema = client.schema_cache.get_class(class_name)

    IF schema.multi_tenancy_config IS NOT NULL AND schema.multi_tenancy_config.enabled:
        IF tenant IS NULL:
            RAISE InvalidRequest {
                message: "Tenant required for multi-tenant class",
                class: class_name
            }

        IF client.config.tenant_allowlist IS NOT NULL:
            IF NOT client.config.tenant_allowlist.contains(tenant):
                RAISE Forbidden {
                    message: "Tenant not in allowlist",
                    tenant: tenant
                }
    ELSE:
        IF tenant IS NOT NULL:
            LOG warn "Tenant specified for non-multi-tenant class"
                class=class_name
                tenant=tenant
```

### 2.4 Input Validation

```
Requirement: Validate all inputs to prevent injection attacks

Implementation:
┌─────────────────────────────────────────────────────────────────┐
│  1. Validate class names against allowed pattern               │
│  2. Validate property paths in filters                         │
│  3. Escape special characters in text values                   │
│  4. Validate beacon URLs format                                │
└─────────────────────────────────────────────────────────────────┘

FUNCTION validate_class_name(name: String) -> Result<()>:
    // Weaviate class names must start with uppercase
    IF NOT name.matches(r"^[A-Z][a-zA-Z0-9_]*$"):
        RAISE InvalidArgument("Invalid class name format: {name}")

    IF name.len() > 256:
        RAISE InvalidArgument("Class name too long: {name.len()} > 256")

    RETURN Ok(())

FUNCTION validate_property_path(path: Vec<String>) -> Result<()>:
    FOR segment IN path:
        IF NOT segment.matches(r"^[a-zA-Z_][a-zA-Z0-9_]*$"):
            RAISE InvalidArgument("Invalid property path segment: {segment}")

    RETURN Ok(())

FUNCTION validate_beacon(beacon: String) -> Result<Reference>:
    // Format: weaviate://localhost/ClassName/uuid
    parsed = parse_beacon_url(beacon)

    IF parsed IS NULL:
        RAISE InvalidArgument("Invalid beacon format: {beacon}")

    validate_class_name(parsed.class_name)?
    validate_uuid(parsed.id)?

    RETURN Ok(Reference {
        beacon: beacon,
        class_name: parsed.class_name,
        id: parsed.id
    })
```

---

## 3. Performance Optimization

### 3.1 gRPC for Batch Operations

```
Optimization: Use gRPC for high-throughput batch imports

Benefits:
┌─────────────────────────────────────────────────────────────────┐
│  - 2-3x faster than REST for batch operations                 │
│  - Binary protocol reduces serialization overhead              │
│  - Connection multiplexing for concurrent requests             │
│  - Streaming support for very large batches                    │
└─────────────────────────────────────────────────────────────────┘

Implementation:
FUNCTION batch_create_optimized(client: WeaviateClient,
                                objects: Vec<BatchObject>,
                                options: BatchOptions) -> BatchResponse:
    // Prefer gRPC for large batches
    IF client.grpc IS NOT NULL AND objects.len() > 10:
        RETURN batch_create_grpc(client, objects, options)
    ELSE:
        RETURN batch_create_rest(client, objects, options)

FUNCTION batch_create_grpc_streaming(client: WeaviateClient,
                                      objects: Iterator<BatchObject>,
                                      options: BatchOptions) -> BatchResponse:
    // Stream objects to gRPC endpoint
    stream = client.grpc.batch_objects_stream()

    successful = 0
    failed = 0
    errors = []

    FOR chunk IN objects.chunks(options.batch_size):
        // Send chunk
        stream.send(chunk)

        // Receive results
        result = stream.receive()
        successful += result.successful
        failed += result.failed
        errors.extend(result.errors)

    stream.close()

    RETURN BatchResponse { successful, failed, errors }
```

### 3.2 Connection Pooling

```
Optimization: Efficient connection reuse

Configuration:
┌─────────────────────────────────────────────────────────────────┐
│  HTTP:                                                          │
│  - Keep-alive: true                                             │
│  - Max connections per host: 20                                 │
│  - Idle timeout: 90 seconds                                     │
│                                                                 │
│  gRPC:                                                          │
│  - Channel pool size: 10                                        │
│  - Max concurrent streams: 100 per channel                      │
│  - Keepalive: 30 seconds                                        │
└─────────────────────────────────────────────────────────────────┘

Implementation:
FUNCTION create_http_client(config: TransportConfig) -> HttpClient:
    RETURN HttpClient.builder()
        .pool_max_idle_per_host(20)
        .pool_idle_timeout(Duration.seconds(90))
        .connect_timeout(Duration.seconds(10))
        .keepalive(true)
        .build()

FUNCTION create_grpc_pool(config: TransportConfig) -> GrpcPool:
    channels = []

    FOR i IN 0..config.pool_size:
        channel = Channel.builder(config.endpoint)
            .keepalive_timeout(Duration.seconds(30))
            .concurrency_limit(100)
            .build()
        channels.push(channel)

    RETURN GrpcPool {
        channels: channels,
        next_index: AtomicU32.new(0)
    }

CLASS GrpcPool:
    FUNCTION get_channel() -> Channel:
        // Round-robin channel selection
        index = next_index.fetch_add(1) % channels.len()
        RETURN channels[index]
```

### 3.3 Filter Optimization

```
Optimization: Efficient filter construction and caching

Strategies:
┌─────────────────────────────────────────────────────────────────┐
│  1. Pre-serialize common filters                               │
│  2. Order filters by selectivity (most selective first)        │
│  3. Use indexed properties when available                      │
│  4. Avoid deep AND/OR nesting                                  │
└─────────────────────────────────────────────────────────────────┘

Implementation:
FUNCTION optimize_filter(filter: WhereFilter,
                        schema: ClassDefinition) -> WhereFilter:
    MATCH filter:
        And(filters) =>
            // Sort by estimated selectivity
            sorted = filters.sort_by(f => estimate_selectivity(f, schema))
            RETURN And(sorted.map(f => optimize_filter(f, schema)))

        Or(filters) =>
            // Flatten nested ORs
            flattened = flatten_or_filters(filters)
            RETURN Or(flattened.map(f => optimize_filter(f, schema)))

        Operand(op) =>
            // Check if property is indexed
            property = schema.properties.find(p => p.name == op.path[0])
            IF property IS NOT NULL AND NOT property.index_filterable:
                LOG warn "Filter on non-indexed property may be slow"
                    property=op.path[0]
            RETURN filter

FUNCTION estimate_selectivity(filter: WhereFilter, schema: ClassDefinition) -> f32:
    MATCH filter:
        Operand(op) =>
            MATCH op.operator:
                Equal => 0.1        // High selectivity
                IsNull => 0.05      // Very high selectivity
                Like => 0.3         // Medium selectivity
                GreaterThan => 0.5  // Low selectivity
                ContainsAny => 0.4  // Medium selectivity
        And(_) => 0.1               // Compounds are selective
        Or(_) => 0.8                // ORs are less selective
```

### 3.4 Hybrid Search Tuning

```
Optimization: Tune alpha and fusion for best retrieval quality

Guidelines:
┌─────────────────────────────────────────────────────────────────┐
│  Alpha Tuning:                                                  │
│  - alpha=0.5: Balanced (good default)                          │
│  - alpha=0.7-0.8: Semantic similarity priority                 │
│  - alpha=0.2-0.3: Keyword matching priority                    │
│                                                                 │
│  Fusion Selection:                                              │
│  - RankedFusion: Better for diverse result types               │
│  - RelativeScoreFusion: Better when scores are meaningful      │
└─────────────────────────────────────────────────────────────────┘

Implementation:
FUNCTION adaptive_hybrid_search(client: WeaviateClient,
                                class_name: String,
                                query: String,
                                options: HybridOptions) -> SearchResult:
    // Analyze query to determine optimal alpha
    alpha = determine_optimal_alpha(query)

    // Determine fusion type
    fusion = IF options.prefer_diversity
        THEN FusionType.RankedFusion
        ELSE FusionType.RelativeScoreFusion

    hybrid_query = HybridQuery {
        query: query,
        alpha: alpha,
        fusion_type: fusion,
        limit: options.limit,
        filter: options.filter
    }

    RETURN hybrid_search(client, class_name, hybrid_query)

FUNCTION determine_optimal_alpha(query: String) -> f32:
    // Short queries benefit more from semantic search
    IF query.word_count() <= 3:
        RETURN 0.75

    // Queries with technical terms benefit from BM25
    IF contains_technical_terms(query):
        RETURN 0.4

    // Default balanced
    RETURN 0.5
```

---

## 4. Resilience Patterns

### 4.1 Circuit Breaker Configuration

```
Configuration: Per-endpoint circuit breaker

┌─────────────────────────────────────────────────────────────────┐
│  failure_threshold: 5       # Failures before opening          │
│  success_threshold: 3       # Successes to close               │
│  half_open_requests: 1      # Test requests when half-open     │
│  reset_timeout_ms: 30000    # Time before half-open            │
└─────────────────────────────────────────────────────────────────┘

Implementation:
FUNCTION create_weaviate_circuit_breaker(endpoint: String) -> CircuitBreaker:
    RETURN CircuitBreaker.new(
        name: "weaviate-{endpoint}",
        config: CircuitBreakerConfig {
            failure_threshold: 5,
            success_threshold: 3,
            reset_timeout: Duration.seconds(30),
            // Only count server errors
            record_exceptions: [
                ServiceUnavailable,
                InternalError,
                Timeout,
                ConnectionError
            ],
            // Don't count client errors
            ignore_exceptions: [
                InvalidObject,
                InvalidFilter,
                ObjectNotFound,
                Unauthorized
            ]
        }
    )
```

### 4.2 Retry Policy Configuration

```
Configuration: Error-specific retry behavior

┌─────────────────────────────────────────────────────────────────┐
│  Error Type          │ Retry │ Backoff    │ Max Attempts       │
│─────────────────────────────────────────────────────────────────│
│  RateLimited         │ Yes   │ Exp + Jit  │ 5                  │
│  ServiceUnavailable  │ Yes   │ Exp        │ 3                  │
│  InternalError       │ Yes   │ Exp        │ 3                  │
│  Timeout             │ Yes   │ Linear     │ 2                  │
│  ConnectionError     │ Yes   │ Exp + Jit  │ 3                  │
│  InvalidObject       │ No    │ -          │ -                  │
│  Unauthorized        │ No    │ -          │ -                  │
└─────────────────────────────────────────────────────────────────┘

Implementation:
FUNCTION create_retry_policy() -> RetryPolicy:
    RETURN RetryPolicy.builder()
        .with_error_handler(RateLimited, RetryConfig {
            max_attempts: 5,
            backoff: ExponentialBackoff {
                initial_ms: 1000,
                max_ms: 60000,
                multiplier: 2.0,
                jitter: 0.3
            }
        })
        .with_error_handler(ServiceUnavailable, RetryConfig {
            max_attempts: 3,
            backoff: ExponentialBackoff {
                initial_ms: 500,
                max_ms: 10000,
                multiplier: 2.0
            }
        })
        .with_error_handler(Timeout, RetryConfig {
            max_attempts: 2,
            backoff: LinearBackoff {
                delay_ms: 1000
            }
        })
        .with_default_non_retryable([
            InvalidObject,
            InvalidFilter,
            Unauthorized,
            Forbidden,
            ObjectNotFound,
            ClassNotFound
        ])
        .build()
```

### 4.3 Graceful Degradation

```
Strategy: Degrade gracefully when Weaviate is under pressure

┌─────────────────────────────────────────────────────────────────┐
│  1. Reduce batch sizes when rate limited                       │
│  2. Fallback to cached results when available                  │
│  3. Reduce search limits during high latency                   │
│  4. Skip vector return to reduce payload size                  │
└─────────────────────────────────────────────────────────────────┘

Implementation:
CLASS DegradationManager:
    mode: DegradationMode = Normal
    consecutive_errors: u32 = 0
    last_latency_ms: u64 = 0

    FUNCTION on_success(latency_ms: u64):
        consecutive_errors = 0
        last_latency_ms = latency_ms
        adjust_mode()

    FUNCTION on_error(error: WeaviateError):
        consecutive_errors += 1
        adjust_mode()

    FUNCTION adjust_mode():
        IF consecutive_errors >= 5:
            mode = Degraded
        ELSE IF last_latency_ms > 5000:
            mode = Throttled
        ELSE:
            mode = Normal

    FUNCTION adjust_batch_size(requested: u32) -> u32:
        MATCH mode:
            Normal => requested
            Throttled => min(requested, 50)
            Degraded => min(requested, 10)

    FUNCTION adjust_search_limit(requested: u32) -> u32:
        MATCH mode:
            Normal => requested
            Throttled => min(requested, 100)
            Degraded => min(requested, 20)

    FUNCTION should_include_vector() -> bool:
        MATCH mode:
            Normal => true
            Throttled => true
            Degraded => false
```

---

## 5. Testing Strategy

### 5.1 Unit Tests

```
Coverage Requirements:
┌─────────────────────────────────────────────────────────────────┐
│  Component                    │ Min Coverage │ Focus Areas     │
│─────────────────────────────────────────────────────────────────│
│  Filter Builder               │ 95%          │ All operators   │
│  GraphQL Builder              │ 95%          │ Query variants  │
│  Response Parser              │ 90%          │ Type mapping    │
│  Vector Validation            │ 100%         │ Dimension check │
│  Beacon Parsing               │ 100%         │ Format handling │
│  Error Mapper                 │ 100%         │ All error types │
└─────────────────────────────────────────────────────────────────┘

TEST "filter builder creates valid AND filter":
    filter = Filter::property("year").greater_than(2020)
        .and(Filter::property("category").equal("science"))

    graphql = serialize_filter_graphql(filter)

    ASSERT graphql.contains("operator: And")
    ASSERT graphql.contains("GreaterThan")
    ASSERT graphql.contains("Equal")

TEST "vector validation rejects wrong dimensions":
    mock_schema = create_mock_schema(vector_dim: 1536)

    ASSERT_RAISES InvalidVector:
        validate_vector(mock_client, "Article", vec![0.0; 768])

TEST "beacon parser handles valid format":
    beacon = "weaviate://localhost/Article/550e8400-e29b-41d4-a716-446655440000"
    ref = validate_beacon(beacon)

    ASSERT_EQ ref.class_name, "Article"
    ASSERT_EQ ref.id.to_string(), "550e8400-e29b-41d4-a716-446655440000"
```

### 5.2 Integration Tests

```
Test Scenarios:
┌─────────────────────────────────────────────────────────────────┐
│  1. Object lifecycle (create → get → update → delete)          │
│  2. Batch import with partial failures                         │
│  3. Vector search with filters                                 │
│  4. Hybrid search with varying alpha                           │
│  5. Cross-reference creation and traversal                     │
│  6. Multi-tenant isolation                                     │
│  7. Schema cache refresh on change                             │
│  8. Rate limit handling with retry                             │
└─────────────────────────────────────────────────────────────────┘

TEST "full object lifecycle":
    client = create_test_client()

    // Create
    obj = client.create_object("Article", {
        title: "Test Article",
        content: "Test content"
    }, vector: generate_random_vector(1536))

    ASSERT obj.id IS NOT NULL

    // Get
    retrieved = client.get_object("Article", obj.id)
    ASSERT_EQ retrieved.properties["title"], "Test Article"

    // Update
    client.update_object("Article", obj.id, {
        title: "Updated Title"
    })

    // Verify update
    updated = client.get_object("Article", obj.id)
    ASSERT_EQ updated.properties["title"], "Updated Title"

    // Delete
    client.delete_object("Article", obj.id)

    // Verify deletion
    deleted = client.get_object("Article", obj.id)
    ASSERT deleted IS NULL
```

### 5.3 Simulation Tests

```
Mock Scenarios:
┌─────────────────────────────────────────────────────────────────┐
│  1. Verify vector similarity ordering                          │
│  2. Test filter evaluation logic                               │
│  3. Simulate batch failures                                    │
│  4. Simulate rate limiting                                     │
│  5. Test tenant isolation in mock                              │
└─────────────────────────────────────────────────────────────────┘

TEST "mock client returns similar vectors first":
    mock = create_mock_client()

    // Insert objects with known vectors
    mock.create_object("Article", { title: "A" }, vector: [1.0, 0.0, 0.0])
    mock.create_object("Article", { title: "B" }, vector: [0.9, 0.1, 0.0])
    mock.create_object("Article", { title: "C" }, vector: [0.0, 1.0, 0.0])

    // Search with query vector
    results = mock.near_vector("Article", {
        vector: [1.0, 0.0, 0.0],
        limit: 3
    })

    // Verify ordering by similarity
    ASSERT_EQ results.objects[0].properties["title"], "A"
    ASSERT_EQ results.objects[1].properties["title"], "B"
    ASSERT_EQ results.objects[2].properties["title"], "C"

TEST "mock client applies filters correctly":
    mock = create_mock_client()

    mock.create_object("Article", { title: "Old", year: 2019 })
    mock.create_object("Article", { title: "New", year: 2023 })

    results = mock.near_vector("Article", {
        vector: [1.0, 0.0, 0.0],
        filter: Filter::property("year").greater_than(2020),
        limit: 10
    })

    ASSERT_EQ results.objects.len(), 1
    ASSERT_EQ results.objects[0].properties["title"], "New"
```

---

## 6. Observability Enhancements

### 6.1 Health Check Endpoint

```
FUNCTION health_check(client: WeaviateClient) -> HealthStatus:
    checks = []

    // Weaviate connectivity
    TRY:
        response = client.http.get("/v1/.well-known/ready", timeout: 5000)
        checks.push(HealthCheck {
            name: "weaviate_ready",
            status: IF response.status == 200 THEN Healthy ELSE Degraded
        })
    CATCH error:
        checks.push(HealthCheck {
            name: "weaviate_ready",
            status: Unhealthy,
            error: error.message
        })

    // Schema cache
    checks.push(HealthCheck {
        name: "schema_cache",
        status: Healthy,
        details: {
            cached_classes: client.schema_cache.size(),
            cache_hits: client.schema_cache.hit_count(),
            cache_misses: client.schema_cache.miss_count()
        }
    })

    // Circuit breaker
    cb_state = client.circuit_breaker.state()
    checks.push(HealthCheck {
        name: "circuit_breaker",
        status: MATCH cb_state:
            Closed => Healthy
            HalfOpen => Degraded
            Open => Unhealthy
    })

    // gRPC connection (if configured)
    IF client.grpc IS NOT NULL:
        grpc_health = client.grpc.check_health()
        checks.push(HealthCheck {
            name: "grpc_connection",
            status: IF grpc_health THEN Healthy ELSE Degraded
        })

    overall = determine_overall_health(checks)
    RETURN HealthStatus { overall, checks }
```

### 6.2 Search Quality Metrics

```
FUNCTION record_search_metrics(query: SearchQuery,
                               result: SearchResult,
                               duration_ms: u64):
    metrics.record_histogram("search.latency_ms", duration_ms,
        tags: { search_type: query.type })

    metrics.record_histogram("search.result_count", result.objects.len(),
        tags: { search_type: query.type })

    IF result.objects.not_empty():
        // Record score distribution
        scores = result.objects.map(o => o.score OR o.certainty OR 0.0)
        metrics.record_histogram("search.top_score", scores[0])
        metrics.record_histogram("search.score_spread",
            scores.first() - scores.last())

    // Record filter complexity
    IF query.filter IS NOT NULL:
        depth = calculate_filter_depth(query.filter)
        metrics.record_histogram("search.filter_depth", depth)
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-weaviate.md | Complete |
| 2. Pseudocode | pseudocode-weaviate.md | Complete |
| 3. Architecture | architecture-weaviate.md | Complete |
| 4. Refinement | refinement-weaviate.md | Complete |
| 5. Completion | completion-weaviate.md | Pending |

---

*Phase 4: Refinement - Complete*
