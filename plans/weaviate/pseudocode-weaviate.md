# Weaviate Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/vector/weaviate`

---

## 1. Client Initialization

```
FUNCTION create_weaviate_client(config: WeaviateConfig) -> WeaviateClient:
    // Validate configuration
    VALIDATE config.endpoint IS NOT empty
    VALIDATE config.endpoint IS valid URL

    // Initialize auth provider
    auth_provider = create_auth_provider(config.auth)

    // Create HTTP client for REST API
    http_client = HttpClient.new(
        base_url: config.endpoint,
        timeout: config.timeout_ms,
        auth_provider: auth_provider
    )

    // Create gRPC client if endpoint provided
    grpc_client = None
    IF config.grpc_endpoint IS NOT NULL:
        grpc_client = GrpcClient.new(
            endpoint: config.grpc_endpoint,
            pool_size: config.pool_size,
            idle_timeout: config.idle_timeout_ms,
            auth_provider: auth_provider
        )

    // Initialize resilience components
    circuit_breaker = resilience.create_circuit_breaker(
        name: "weaviate-{config.endpoint}",
        failure_threshold: config.circuit_breaker_threshold,
        reset_timeout_ms: 30000
    )

    retry_policy = resilience.create_retry_policy(
        max_attempts: config.max_retries,
        base_delay_ms: config.retry_backoff_ms,
        retryable_errors: [RateLimited, ServiceUnavailable, InternalError,
                          Timeout, ConnectionError]
    )

    // Verify connectivity
    health_check(http_client)

    RETURN WeaviateClient {
        config: config,
        http: http_client,
        grpc: grpc_client,
        auth: auth_provider,
        circuit_breaker: circuit_breaker,
        retry_policy: retry_policy,
        metrics: observability.get_metrics_client("weaviate")
    }

FUNCTION create_auth_provider(auth: WeaviateAuth) -> AuthProvider:
    MATCH auth:
        None => NoOpAuthProvider.new()

        ApiKey { key } => ApiKeyAuthProvider.new(key)

        Oidc { token } => OidcAuthProvider.new(token)

        ClientCredentials { client_id, client_secret, scopes } =>
            ClientCredentialsProvider.new(client_id, client_secret, scopes)

FUNCTION close_client(client: WeaviateClient):
    IF client.grpc IS NOT NULL:
        client.grpc.close()
    client.http.close()
    LOG info "Weaviate client closed"
```

---

## 2. Object Operations

```
FUNCTION create_object(client: WeaviateClient,
                       class_name: String,
                       properties: Map<String, PropertyValue>,
                       options: CreateOptions) -> WeaviateObject:
    span = observability.start_span("weaviate.create_object")

    TRY:
        // Build object
        object = WeaviateObject {
            id: options.id OR generate_uuid(),
            class_name: class_name,
            properties: properties,
            vector: options.vector,
            tenant: options.tenant
        }

        // Validate object
        IF options.validate:
            validate_object(client, object)

        // Execute with resilience
        result = client.retry_policy.execute(() => {
            IF NOT client.circuit_breaker.allow_request():
                RAISE CircuitBreakerOpen()

            response = client.http.post(
                path: "/v1/objects",
                body: serialize_object(object),
                params: { consistency_level: options.consistency_level }
            )

            IF response.status != 200:
                handle_error_response(response)

            client.circuit_breaker.record_success()
            RETURN deserialize_object(response.body)
        })

        client.metrics.increment("object.create.success")
        RETURN result
    CATCH error:
        client.metrics.increment("object.create.error", tags: {error_type: error.type})
        span.record_error(error)
        RAISE
    FINALLY:
        span.end()

FUNCTION get_object(client: WeaviateClient,
                    class_name: String,
                    id: UUID,
                    options: GetOptions) -> Option<WeaviateObject>:
    span = observability.start_span("weaviate.get_object")

    TRY:
        params = {
            include: build_include_params(options),
            tenant: options.tenant,
            consistency_level: options.consistency_level
        }

        response = client.retry_policy.execute(() => {
            client.http.get(
                path: "/v1/objects/{class_name}/{id}",
                params: params
            )
        })

        IF response.status == 404:
            RETURN None

        IF response.status != 200:
            handle_error_response(response)

        RETURN Some(deserialize_object(response.body))
    FINALLY:
        span.end()

FUNCTION update_object(client: WeaviateClient,
                       class_name: String,
                       id: UUID,
                       properties: Map<String, PropertyValue>,
                       options: UpdateOptions) -> WeaviateObject:
    span = observability.start_span("weaviate.update_object")

    TRY:
        body = {
            class: class_name,
            id: id,
            properties: properties
        }

        IF options.vector IS NOT NULL:
            body.vector = options.vector

        response = client.retry_policy.execute(() => {
            IF options.merge:
                // PATCH for merge update
                client.http.patch(
                    path: "/v1/objects/{class_name}/{id}",
                    body: body,
                    params: { tenant: options.tenant }
                )
            ELSE:
                // PUT for full replace
                client.http.put(
                    path: "/v1/objects/{class_name}/{id}",
                    body: body,
                    params: { tenant: options.tenant }
                )
        })

        IF response.status != 200:
            handle_error_response(response)

        client.metrics.increment("object.update.success")
        RETURN deserialize_object(response.body)
    FINALLY:
        span.end()

FUNCTION delete_object(client: WeaviateClient,
                       class_name: String,
                       id: UUID,
                       options: DeleteOptions):
    span = observability.start_span("weaviate.delete_object")

    TRY:
        response = client.retry_policy.execute(() => {
            client.http.delete(
                path: "/v1/objects/{class_name}/{id}",
                params: {
                    tenant: options.tenant,
                    consistency_level: options.consistency_level
                }
            )
        })

        IF response.status == 404 AND NOT options.ignore_not_found:
            RAISE ObjectNotFound(class_name, id)

        IF response.status != 204:
            handle_error_response(response)

        client.metrics.increment("object.delete.success")
    FINALLY:
        span.end()

FUNCTION exists(client: WeaviateClient,
                class_name: String,
                id: UUID,
                tenant: Option<String>) -> bool:
    response = client.http.head(
        path: "/v1/objects/{class_name}/{id}",
        params: { tenant: tenant }
    )
    RETURN response.status == 204
```

---

## 3. Batch Operations

```
FUNCTION batch_create(client: WeaviateClient,
                      objects: Vec<BatchObject>,
                      options: BatchOptions) -> BatchResponse:
    span = observability.start_span("weaviate.batch_create")
    start_time = now()

    TRY:
        // Chunk into batches
        batch_size = options.batch_size OR client.config.batch_size
        chunks = objects.chunks(batch_size)

        all_results = []
        total_success = 0
        total_failed = 0
        all_errors = []

        FOR chunk IN chunks:
            // Prefer gRPC for batch operations
            IF client.grpc IS NOT NULL:
                result = batch_create_grpc(client, chunk, options)
            ELSE:
                result = batch_create_rest(client, chunk, options)

            total_success += result.successful
            total_failed += result.failed
            all_errors.extend(result.errors)

            // Record progress
            client.metrics.record_counter("batch.objects_created", result.successful)

        response = BatchResponse {
            successful: total_success,
            failed: total_failed,
            errors: all_errors
        }

        LOG info "Batch create completed"
            total=objects.len()
            success=total_success
            failed=total_failed
            duration_ms=now() - start_time

        RETURN response
    FINALLY:
        span.end()

FUNCTION batch_create_grpc(client: WeaviateClient,
                           objects: Vec<BatchObject>,
                           options: BatchOptions) -> BatchResponse:
    // Build gRPC request
    request = BatchObjectsRequest {
        objects: objects.map(o => to_grpc_object(o)),
        consistency_level: to_grpc_consistency(options.consistency_level)
    }

    // Execute
    response = client.grpc.batch_objects(request)

    // Parse response
    errors = []
    successful = 0
    failed = 0

    FOR (idx, result) IN response.results.enumerate():
        IF result.error IS NOT NULL:
            failed += 1
            errors.push(BatchError {
                index: idx,
                object_id: objects[idx].id,
                error_message: result.error.message
            })
        ELSE:
            successful += 1

    RETURN BatchResponse { successful, failed, errors }

FUNCTION batch_create_rest(client: WeaviateClient,
                           objects: Vec<BatchObject>,
                           options: BatchOptions) -> BatchResponse:
    body = {
        objects: objects.map(o => serialize_batch_object(o))
    }

    response = client.http.post(
        path: "/v1/batch/objects",
        body: body,
        params: { consistency_level: options.consistency_level }
    )

    IF response.status != 200:
        handle_error_response(response)

    RETURN parse_batch_response(response.body)

FUNCTION batch_delete(client: WeaviateClient,
                      class_name: String,
                      filter: WhereFilter,
                      options: BatchDeleteOptions) -> BatchDeleteResponse:
    span = observability.start_span("weaviate.batch_delete")

    TRY:
        body = {
            match: {
                class: class_name,
                where: serialize_filter(filter)
            },
            dryRun: options.dry_run,
            output: "verbose"
        }

        IF options.tenant IS NOT NULL:
            body.match.tenant = options.tenant

        response = client.http.delete(
            path: "/v1/batch/objects",
            body: body
        )

        IF response.status != 200:
            handle_error_response(response)

        result = deserialize_batch_delete_response(response.body)

        LOG info "Batch delete completed"
            class=class_name
            matched=result.matched
            deleted=result.deleted
            dry_run=options.dry_run

        RETURN result
    FINALLY:
        span.end()
```

---

## 4. Vector Search Operations

```
FUNCTION near_vector(client: WeaviateClient,
                     class_name: String,
                     query: NearVectorQuery) -> SearchResult:
    span = observability.start_span("weaviate.near_vector")

    TRY:
        // Validate vector dimensions
        schema = get_cached_schema(client, class_name)
        validate_vector_dimensions(query.vector, schema)

        // Build GraphQL query
        graphql = build_near_vector_graphql(class_name, query)

        // Execute
        result = execute_graphql(client, graphql)

        // Parse results
        search_result = parse_search_result(result, class_name)

        client.metrics.record_histogram("search.near_vector.latency_ms", span.duration())
        client.metrics.increment("search.near_vector.success")

        RETURN search_result
    FINALLY:
        span.end()

FUNCTION build_near_vector_graphql(class_name: String, query: NearVectorQuery) -> String:
    // Build properties selection
    properties = query.properties.join(" ")
    IF query.with_vector:
        additional = "_additional { id distance certainty vector }"
    ELSE:
        additional = "_additional { id distance certainty }"

    // Build nearVector clause
    near_vector_clause = "nearVector: { vector: [{query.vector.join(", ")}]"
    IF query.certainty IS NOT NULL:
        near_vector_clause += ", certainty: {query.certainty}"
    IF query.distance IS NOT NULL:
        near_vector_clause += ", distance: {query.distance}"
    near_vector_clause += " }"

    // Build where clause
    where_clause = ""
    IF query.filter IS NOT NULL:
        where_clause = "where: " + serialize_filter_graphql(query.filter)

    // Compose query
    RETURN """
    {
        Get {
            {class_name}(
                {near_vector_clause}
                {where_clause}
                limit: {query.limit}
                offset: {query.offset OR 0}
            ) {
                {properties}
                {additional}
            }
        }
    }
    """

FUNCTION near_object(client: WeaviateClient,
                     class_name: String,
                     query: NearObjectQuery) -> SearchResult:
    span = observability.start_span("weaviate.near_object")

    TRY:
        // Build beacon
        beacon = "weaviate://localhost/{query.class_name}/{query.id}"

        graphql = build_near_object_graphql(class_name, beacon, query)
        result = execute_graphql(client, graphql)

        RETURN parse_search_result(result, class_name)
    FINALLY:
        span.end()

FUNCTION near_text(client: WeaviateClient,
                   class_name: String,
                   query: NearTextQuery) -> SearchResult:
    span = observability.start_span("weaviate.near_text")

    TRY:
        // Validate class has text2vec module
        validate_vectorizer(client, class_name)

        graphql = build_near_text_graphql(class_name, query)
        result = execute_graphql(client, graphql)

        client.metrics.increment("search.near_text.success")
        RETURN parse_search_result(result, class_name)
    FINALLY:
        span.end()

FUNCTION build_near_text_graphql(class_name: String, query: NearTextQuery) -> String:
    concepts = query.concepts.map(c => "\"" + escape(c) + "\"").join(", ")

    near_text_clause = "nearText: { concepts: [{concepts}]"

    IF query.certainty IS NOT NULL:
        near_text_clause += ", certainty: {query.certainty}"

    IF query.move_to IS NOT NULL:
        move_concepts = query.move_to.concepts.map(c => "\"" + escape(c) + "\"").join(", ")
        near_text_clause += ", moveTo: { concepts: [{move_concepts}], force: {query.move_to.force} }"

    IF query.move_away IS NOT NULL:
        away_concepts = query.move_away.concepts.map(c => "\"" + escape(c) + "\"").join(", ")
        near_text_clause += ", moveAwayFrom: { concepts: [{away_concepts}], force: {query.move_away.force} }"

    near_text_clause += " }"

    RETURN build_get_query(class_name, near_text_clause, query)
```

---

## 5. Hybrid Search

```
FUNCTION hybrid_search(client: WeaviateClient,
                       class_name: String,
                       query: HybridQuery) -> SearchResult:
    span = observability.start_span("weaviate.hybrid")

    TRY:
        // Build hybrid clause
        hybrid_clause = build_hybrid_clause(query)

        // Build where clause
        where_clause = ""
        IF query.filter IS NOT NULL:
            where_clause = "where: " + serialize_filter_graphql(query.filter)

        properties = query.properties.join(" ")

        graphql = """
        {
            Get {
                {class_name}(
                    hybrid: {hybrid_clause}
                    {where_clause}
                    limit: {query.limit}
                ) {
                    {properties}
                    _additional {
                        id
                        score
                        explainScore
                    }
                }
            }
        }
        """

        result = execute_graphql(client, graphql)

        search_result = parse_search_result(result, class_name)

        client.metrics.record_histogram("search.hybrid.latency_ms", span.duration())
        client.metrics.increment("search.hybrid.success")

        RETURN search_result
    FINALLY:
        span.end()

FUNCTION build_hybrid_clause(query: HybridQuery) -> String:
    clause = "{ query: \"{escape(query.query)}\""

    clause += ", alpha: {query.alpha}"

    IF query.vector IS NOT NULL:
        clause += ", vector: [{query.vector.join(", ")}]"

    MATCH query.fusion_type:
        RankedFusion => clause += ", fusionType: rankedFusion"
        RelativeScoreFusion => clause += ", fusionType: relativeScoreFusion"

    clause += " }"
    RETURN clause

FUNCTION bm25_search(client: WeaviateClient,
                     class_name: String,
                     query: BM25Query) -> SearchResult:
    span = observability.start_span("weaviate.bm25")

    TRY:
        bm25_clause = "{ query: \"{escape(query.query)}\""

        IF query.properties IS NOT NULL:
            props = query.properties.map(p => "\"" + p + "\"").join(", ")
            bm25_clause += ", properties: [{props}]"

        bm25_clause += " }"

        where_clause = ""
        IF query.filter IS NOT NULL:
            where_clause = "where: " + serialize_filter_graphql(query.filter)

        graphql = """
        {
            Get {
                {class_name}(
                    bm25: {bm25_clause}
                    {where_clause}
                    limit: {query.limit}
                ) {
                    {query.properties.join(" ")}
                    _additional { id score }
                }
            }
        }
        """

        result = execute_graphql(client, graphql)
        RETURN parse_search_result(result, class_name)
    FINALLY:
        span.end()
```

---

## 6. Filter Building

```
FUNCTION build_filter(operand: FilterOperand) -> WhereFilter:
    RETURN WhereFilter.Operand(operand)

FUNCTION and_filters(filters: Vec<WhereFilter>) -> WhereFilter:
    VALIDATE filters.len() >= 2
    RETURN WhereFilter.And(filters)

FUNCTION or_filters(filters: Vec<WhereFilter>) -> WhereFilter:
    VALIDATE filters.len() >= 2
    RETURN WhereFilter.Or(filters)

FUNCTION serialize_filter_graphql(filter: WhereFilter) -> String:
    MATCH filter:
        Operand(op) =>
            value_str = serialize_filter_value(op.value)
            operator_str = serialize_operator(op.operator)
            path_str = op.path.map(p => "\"" + p + "\"").join(", ")

            RETURN "{ path: [{path_str}], operator: {operator_str}, {value_str} }"

        And(filters) =>
            operands = filters.map(f => serialize_filter_graphql(f)).join(", ")
            RETURN "{ operator: And, operands: [{operands}] }"

        Or(filters) =>
            operands = filters.map(f => serialize_filter_graphql(f)).join(", ")
            RETURN "{ operator: Or, operands: [{operands}] }"

FUNCTION serialize_operator(op: FilterOperator) -> String:
    MATCH op:
        Equal => "Equal"
        NotEqual => "NotEqual"
        GreaterThan => "GreaterThan"
        GreaterThanEqual => "GreaterThanEqual"
        LessThan => "LessThan"
        LessThanEqual => "LessThanEqual"
        Like => "Like"
        WithinGeoRange => "WithinGeoRange"
        IsNull => "IsNull"
        ContainsAny => "ContainsAny"
        ContainsAll => "ContainsAll"

FUNCTION serialize_filter_value(value: FilterValue) -> String:
    MATCH value:
        Text(s) => "valueText: \"{escape(s)}\""
        Int(i) => "valueInt: {i}"
        Number(n) => "valueNumber: {n}"
        Boolean(b) => "valueBoolean: {b}"
        Date(d) => "valueDate: \"{d.to_rfc3339()}\""
        TextArray(arr) =>
            items = arr.map(s => "\"" + escape(s) + "\"").join(", ")
            "valueText: [{items}]"
        IntArray(arr) => "valueInt: [{arr.join(", ")}]"
        GeoRange { latitude, longitude, distance_km } =>
            "valueGeoRange: { geoCoordinates: { latitude: {latitude}, longitude: {longitude} }, distance: { max: {distance_km * 1000} } }"

FUNCTION validate_filter(client: WeaviateClient,
                         class_name: String,
                         filter: WhereFilter) -> ValidationResult:
    schema = get_cached_schema(client, class_name)

    FUNCTION validate_operand(op: FilterOperand) -> Vec<ValidationError>:
        errors = []

        // Check property exists
        prop_path = op.path.first()
        property = schema.properties.find(p => p.name == prop_path)

        IF property IS NULL:
            errors.push(ValidationError.PropertyNotFound(prop_path))
            RETURN errors

        // Check operator compatibility
        IF NOT is_operator_compatible(op.operator, property.data_type):
            errors.push(ValidationError.IncompatibleOperator(op.operator, property.data_type))

        // Check if property is indexed for filtering
        IF NOT property.index_filterable:
            errors.push(ValidationError.PropertyNotFilterable(prop_path))

        RETURN errors

    errors = collect_validation_errors(filter, validate_operand)
    RETURN ValidationResult { valid: errors.is_empty(), errors }
```

---

## 7. Aggregation Operations

```
FUNCTION aggregate(client: WeaviateClient,
                   query: AggregateQuery) -> AggregateResult:
    span = observability.start_span("weaviate.aggregate")

    TRY:
        // Build aggregation fields
        field_clauses = query.fields.map(f => build_aggregate_field(f)).join(" ")

        // Build group by
        group_by_clause = ""
        IF query.group_by IS NOT NULL:
            paths = query.group_by.map(p => "\"" + p + "\"").join(", ")
            group_by_clause = "groupBy: [{paths}]"

        // Build where
        where_clause = ""
        IF query.filter IS NOT NULL:
            where_clause = "where: " + serialize_filter_graphql(query.filter)

        // Build tenant
        tenant_clause = ""
        IF query.tenant IS NOT NULL:
            tenant_clause = "tenant: \"{query.tenant}\""

        graphql = """
        {
            Aggregate {
                {query.class_name}(
                    {group_by_clause}
                    {where_clause}
                    {tenant_clause}
                ) {
                    meta { count }
                    groupedBy { path value }
                    {field_clauses}
                }
            }
        }
        """

        result = execute_graphql(client, graphql)
        RETURN parse_aggregate_result(result, query.class_name)
    FINALLY:
        span.end()

FUNCTION build_aggregate_field(field: AggregateField) -> String:
    agg_clauses = field.aggregations.map(agg => {
        MATCH agg:
            Count => "count"
            Sum => "sum"
            Mean => "mean"
            Median => "median"
            Mode => "mode"
            Minimum => "minimum"
            Maximum => "maximum"
            TopOccurrences { limit } => "topOccurrences(limit: {limit}) { value occurs }"
            PointingTo => "pointingTo"
    }).join(" ")

    RETURN "{field.property} { {agg_clauses} }"

FUNCTION count(client: WeaviateClient,
               class_name: String,
               filter: Option<WhereFilter>,
               tenant: Option<String>) -> u64:
    query = AggregateQuery {
        class_name: class_name,
        group_by: None,
        filter: filter,
        tenant: tenant,
        fields: []
    }

    result = aggregate(client, query)
    RETURN result.meta.count
```

---

## 8. Cross-Reference Operations

```
FUNCTION add_reference(client: WeaviateClient,
                       from_class: String,
                       from_id: UUID,
                       property: String,
                       to_class: String,
                       to_id: UUID,
                       options: ReferenceOptions):
    span = observability.start_span("weaviate.add_reference")

    TRY:
        beacon = "weaviate://localhost/{to_class}/{to_id}"

        body = {
            beacon: beacon
        }

        response = client.http.post(
            path: "/v1/objects/{from_class}/{from_id}/references/{property}",
            body: body,
            params: { tenant: options.tenant }
        )

        IF response.status != 200:
            handle_error_response(response)

        LOG debug "Reference added" from="{from_class}/{from_id}" to="{to_class}/{to_id}"
    FINALLY:
        span.end()

FUNCTION delete_reference(client: WeaviateClient,
                          from_class: String,
                          from_id: UUID,
                          property: String,
                          to_class: String,
                          to_id: UUID,
                          options: ReferenceOptions):
    span = observability.start_span("weaviate.delete_reference")

    TRY:
        beacon = "weaviate://localhost/{to_class}/{to_id}"

        body = {
            beacon: beacon
        }

        response = client.http.delete(
            path: "/v1/objects/{from_class}/{from_id}/references/{property}",
            body: body,
            params: { tenant: options.tenant }
        )

        IF response.status != 204:
            handle_error_response(response)
    FINALLY:
        span.end()

FUNCTION update_references(client: WeaviateClient,
                           from_class: String,
                           from_id: UUID,
                           property: String,
                           references: Vec<Reference>,
                           options: ReferenceOptions):
    span = observability.start_span("weaviate.update_references")

    TRY:
        beacons = references.map(r => {
            beacon: "weaviate://localhost/{r.class_name}/{r.id}"
        })

        response = client.http.put(
            path: "/v1/objects/{from_class}/{from_id}/references/{property}",
            body: beacons,
            params: { tenant: options.tenant }
        )

        IF response.status != 200:
            handle_error_response(response)
    FINALLY:
        span.end()
```

---

## 9. Multi-Tenancy Operations

```
FUNCTION list_tenants(client: WeaviateClient, class_name: String) -> Vec<Tenant>:
    response = client.http.get(
        path: "/v1/schema/{class_name}/tenants"
    )

    IF response.status == 404:
        RAISE ClassNotFound(class_name)

    IF response.status != 200:
        handle_error_response(response)

    RETURN response.body.map(t => Tenant {
        name: t.name,
        activity_status: parse_tenant_status(t.activityStatus)
    })

FUNCTION get_tenant(client: WeaviateClient,
                    class_name: String,
                    tenant_name: String) -> Option<Tenant>:
    tenants = list_tenants(client, class_name)
    RETURN tenants.find(t => t.name == tenant_name)

FUNCTION activate_tenant(client: WeaviateClient,
                         class_name: String,
                         tenant_name: String):
    update_tenant_status(client, class_name, tenant_name, TenantStatus.Active)

FUNCTION deactivate_tenant(client: WeaviateClient,
                           class_name: String,
                           tenant_name: String):
    update_tenant_status(client, class_name, tenant_name, TenantStatus.Inactive)

FUNCTION update_tenant_status(client: WeaviateClient,
                              class_name: String,
                              tenant_name: String,
                              status: TenantStatus):
    body = [{
        name: tenant_name,
        activityStatus: serialize_tenant_status(status)
    }]

    response = client.http.put(
        path: "/v1/schema/{class_name}/tenants",
        body: body
    )

    IF response.status != 200:
        handle_error_response(response)

    LOG info "Tenant status updated" class=class_name tenant=tenant_name status=status
```

---

## 10. Schema Introspection

```
FUNCTION get_schema(client: WeaviateClient) -> Schema:
    response = client.http.get(path: "/v1/schema")

    IF response.status != 200:
        handle_error_response(response)

    RETURN parse_schema(response.body)

FUNCTION get_class(client: WeaviateClient, class_name: String) -> Option<ClassDefinition>:
    response = client.http.get(path: "/v1/schema/{class_name}")

    IF response.status == 404:
        RETURN None

    IF response.status != 200:
        handle_error_response(response)

    RETURN Some(parse_class_definition(response.body))

FUNCTION list_classes(client: WeaviateClient) -> Vec<String>:
    schema = get_schema(client)
    RETURN schema.classes.map(c => c.name)

FUNCTION get_shards(client: WeaviateClient, class_name: String) -> Vec<ShardInfo>:
    response = client.http.get(path: "/v1/schema/{class_name}/shards")

    IF response.status == 404:
        RAISE ClassNotFound(class_name)

    IF response.status != 200:
        handle_error_response(response)

    RETURN response.body.map(s => ShardInfo {
        name: s.name,
        status: parse_shard_status(s.status),
        object_count: s.objectCount,
        vector_indexing_status: s.vectorIndexingStatus
    })

// Schema caching for validation
CLASS SchemaCache:
    cache: Map<String, CachedClass>
    ttl_seconds: u64 = 300

    FUNCTION get_class(client: WeaviateClient, class_name: String) -> ClassDefinition:
        cached = cache.get(class_name)

        IF cached IS NOT NULL AND NOT cached.is_expired():
            RETURN cached.definition

        // Fetch fresh
        definition = get_class(client, class_name)

        IF definition IS NULL:
            RAISE ClassNotFound(class_name)

        cache.set(class_name, CachedClass {
            definition: definition,
            fetched_at: now()
        })

        RETURN definition

    FUNCTION invalidate(class_name: String):
        cache.remove(class_name)

    FUNCTION invalidate_all():
        cache.clear()
```

---

## 11. GraphQL Execution

```
FUNCTION execute_graphql(client: WeaviateClient, query: String) -> GraphQLResponse:
    span = observability.start_span("weaviate.graphql")

    TRY:
        body = { query: query }

        response = client.retry_policy.execute(() => {
            IF NOT client.circuit_breaker.allow_request():
                RAISE CircuitBreakerOpen()

            result = client.http.post(
                path: "/v1/graphql",
                body: body
            )

            IF result.status != 200:
                handle_error_response(result)

            client.circuit_breaker.record_success()
            RETURN result
        })

        graphql_response = parse_graphql_response(response.body)

        IF graphql_response.errors IS NOT NULL:
            handle_graphql_errors(graphql_response.errors)

        RETURN graphql_response
    CATCH error:
        client.circuit_breaker.record_failure()
        RAISE
    FINALLY:
        span.end()

FUNCTION handle_graphql_errors(errors: Vec<GraphQLError>):
    // Check for specific error types
    FOR error IN errors:
        IF error.message.contains("class not found"):
            RAISE ClassNotFound(extract_class_name(error.message))
        IF error.message.contains("tenant not found"):
            RAISE TenantNotFound(extract_tenant_name(error.message))
        IF error.message.contains("invalid filter"):
            RAISE InvalidFilter(error.message)

    // Generic GraphQL error
    RAISE WeaviateError.GraphQL(errors)
```

---

## 12. Simulation Layer

```
CLASS MockWeaviateClient:
    objects: Map<String, Map<UUID, WeaviateObject>>   # class -> id -> object
    schema: Schema
    config: MockConfig
    operations: Vec<RecordedOperation>

    FUNCTION create_object(class_name: String,
                          properties: Map,
                          options: CreateOptions) -> WeaviateObject:
        // Record operation
        operations.push(RecordedOperation.CreateObject { class_name, properties })

        // Check for injected error
        IF config.error_on_create IS NOT NULL:
            RAISE config.error_on_create

        // Validate class exists
        IF NOT schema.classes.any(c => c.name == class_name):
            RAISE ClassNotFound(class_name)

        // Create object
        object = WeaviateObject {
            id: options.id OR generate_uuid(),
            class_name: class_name,
            properties: properties,
            vector: options.vector,
            creation_time: now(),
            update_time: now()
        }

        // Store
        IF NOT objects.contains(class_name):
            objects.set(class_name, {})
        objects.get(class_name).set(object.id, object)

        RETURN object

    FUNCTION near_vector(class_name: String, query: NearVectorQuery) -> SearchResult:
        operations.push(RecordedOperation.NearVector { class_name, query })

        IF config.search_results.contains(class_name):
            RETURN config.search_results.get(class_name)

        // Compute similarity against stored objects
        class_objects = objects.get(class_name) OR {}
        hits = []

        FOR (id, obj) IN class_objects:
            IF obj.vector IS NULL:
                CONTINUE

            // Apply filter
            IF query.filter IS NOT NULL AND NOT matches_filter(obj, query.filter):
                CONTINUE

            // Compute similarity
            distance = compute_distance(query.vector, obj.vector, config.distance_metric)
            certainty = 1.0 - distance

            IF query.certainty IS NOT NULL AND certainty < query.certainty:
                CONTINUE
            IF query.distance IS NOT NULL AND distance > query.distance:
                CONTINUE

            hits.push(SearchHit {
                id: id,
                class_name: class_name,
                properties: filter_properties(obj.properties, query.properties),
                vector: IF query.with_vector THEN obj.vector ELSE None,
                distance: Some(distance),
                certainty: Some(certainty)
            })

        // Sort by distance and limit
        hits.sort_by(h => h.distance)
        hits = hits.take(query.limit)

        RETURN SearchResult { objects: hits, total_count: Some(hits.len()) }

    FUNCTION get_recorded_operations() -> Vec<RecordedOperation>:
        RETURN operations.clone()

    FUNCTION reset():
        objects.clear()
        operations.clear()

FUNCTION create_mock_client(schema: Schema) -> MockWeaviateClient:
    RETURN MockWeaviateClient {
        objects: {},
        schema: schema,
        config: MockConfig.default(),
        operations: []
    }
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-weaviate.md | Complete |
| 2. Pseudocode | pseudocode-weaviate.md | Complete |
| 3. Architecture | architecture-weaviate.md | Pending |
| 4. Refinement | refinement-weaviate.md | Pending |
| 5. Completion | completion-weaviate.md | Pending |

---

*Phase 2: Pseudocode - Complete*
