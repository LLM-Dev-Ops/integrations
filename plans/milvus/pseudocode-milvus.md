# SPARC Phase 2: Pseudocode - Milvus Integration

## 1. Core Structures

### 1.1 Client Structure
```
STRUCT MilvusClient {
    config: Arc<MilvusConfig>
    pool: Arc<ConnectionPool>
    credentials: Arc<dyn CredentialProvider>
    simulation: Arc<SimulationLayer>
    metrics: Arc<MetricsCollector>
    collection_cache: Arc<RwLock<CollectionCache>>
}

STRUCT MilvusConfig {
    host: String
    port: u16
    auth: AuthConfig
    tls: Option<TlsConfig>
    pool_config: PoolConfig
    timeout: Duration
    retry_config: RetryConfig
    default_consistency: ConsistencyLevel
    auto_load: bool                // Auto-load collections on access
}

ENUM AuthConfig {
    Token(SecretString),
    UserPass { username: String, password: SecretString },
    None
}

ENUM ConsistencyLevel {
    Strong,
    Session,
    Bounded,
    Eventually,
    Customized(u64)  // Guarantee timestamp
}
```

### 1.2 Connection Pool
```
STRUCT ConnectionPool {
    connections: Vec<PooledConnection>
    config: PoolConfig
    semaphore: Semaphore
    endpoint: String
    tls_config: Option<TlsConfig>
}

STRUCT PooledConnection {
    id: ConnectionId
    channel: GrpcChannel
    created_at: Instant
    last_used: Instant
    state: ConnectionState
}

STRUCT GrpcChannel {
    inner: tonic::Channel
    interceptor: AuthInterceptor
}
```

### 1.3 Entity Types
```
STRUCT Entity {
    fields: HashMap<String, FieldValue>
}

ENUM FieldValue {
    Int64(i64),
    Float(f32),
    Double(f64),
    Bool(bool),
    String(String),
    VarChar(String),
    JSON(JsonValue),
    FloatVector(Vec<f32>),
    BinaryVector(Vec<u8>),
    SparseFloatVector(HashMap<u32, f32>),
    Array(Vec<FieldValue>)
}

STRUCT FieldData {
    field_name: String
    values: Vec<FieldValue>
}
```

---

## 2. Client Initialization

### 2.1 Build Client
```
FUNCTION build_client(config: MilvusConfig) -> Result<MilvusClient>:
    // Validate configuration
    validate_config(config)?

    // Build endpoint
    endpoint = build_endpoint(config.host, config.port, config.tls)

    // Initialize gRPC channel with TLS if configured
    channel = create_grpc_channel(endpoint, config.tls)?

    // Initialize connection pool
    pool = ConnectionPool::new(
        config: config.pool_config,
        endpoint: endpoint,
        tls_config: config.tls
    )

    // Initialize credential provider
    credentials = create_credential_provider(config.auth)

    // Initialize simulation layer
    simulation = SimulationLayer::new(
        mode: SimulationMode::from_env(),
        storage: SimulationStorage::default()
    )

    // Initialize metrics
    metrics = MetricsCollector::new("milvus")

    // Initialize collection cache
    collection_cache = RwLock::new(CollectionCache::new(
        ttl: Duration::minutes(5)
    ))

    RETURN Ok(MilvusClient {
        config: Arc::new(config),
        pool: Arc::new(pool),
        credentials: Arc::new(credentials),
        simulation: Arc::new(simulation),
        metrics: Arc::new(metrics),
        collection_cache: Arc::new(collection_cache)
    })

FUNCTION build_endpoint(host: String, port: u16, tls: Option<TlsConfig>) -> String:
    scheme = IF tls.is_some() THEN "https" ELSE "http"
    RETURN format!("{}://{}:{}", scheme, host, port)

FUNCTION create_grpc_channel(
    endpoint: String,
    tls: Option<TlsConfig>
) -> Result<tonic::Channel>:
    builder = Channel::from_shared(endpoint)?
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))

    IF tls IS Some(tls_config):
        // Configure TLS
        client_tls = ClientTlsConfig::new()

        IF tls_config.ca_cert IS Some(ca):
            ca_cert = Certificate::from_pem(read_file(ca)?)
            client_tls = client_tls.ca_certificate(ca_cert)

        IF tls_config.client_cert IS Some(cert) AND tls_config.client_key IS Some(key):
            identity = Identity::from_pem(read_file(cert)?, read_file(key)?)
            client_tls = client_tls.identity(identity)

        IF tls_config.server_name IS Some(name):
            client_tls = client_tls.domain_name(name)

        builder = builder.tls_config(client_tls)?

    RETURN builder.connect().await
```

### 2.2 Authentication Interceptor
```
STRUCT AuthInterceptor {
    credentials: Arc<dyn CredentialProvider>
}

IMPL Interceptor FOR AuthInterceptor:
    FUNCTION call(request: Request<()>) -> Result<Request<()>>:
        auth = self.credentials.get_auth()?

        MATCH auth:
            AuthConfig::Token(token) => {
                request.metadata_mut().insert(
                    "authorization",
                    format!("Bearer {}", token.expose_secret())
                )
            }
            AuthConfig::UserPass { username, password } => {
                request.metadata_mut().insert("username", username)
                request.metadata_mut().insert("password", password.expose_secret())
            }
            AuthConfig::None => {}

        RETURN Ok(request)
```

---

## 3. Vector Operations

### 3.1 Insert Entities
```
FUNCTION insert(
    client: MilvusClient,
    request: InsertRequest
) -> Result<InsertResponse>:
    timer = client.metrics.start_timer("insert")

    // Check simulation mode
    IF client.simulation.is_replay_mode():
        RETURN client.simulation.get_recorded_response(
            fingerprint: generate_fingerprint("insert", request)
        )

    // Ensure collection is loaded if auto_load enabled
    IF client.config.auto_load:
        ensure_collection_loaded(client, request.collection_name).await?

    // Validate fields
    validate_insert_request(request)?

    // Chunk if necessary (max 10000 per request)
    num_rows = get_row_count(request.fields)
    chunks = chunk_insert_request(request, max_size: 10000)

    all_ids = []
    FOR chunk IN chunks:
        // Build gRPC request
        grpc_request = build_insert_request(chunk)

        // Execute with retry
        response = execute_with_retry(
            client,
            service: MilvusService::Insert,
            request: grpc_request
        )?

        all_ids.extend(response.ids)
    END FOR

    result = InsertResponse {
        insert_count: all_ids.len(),
        ids: all_ids
    }

    client.simulation.record_if_enabled("insert", request, result)
    timer.observe_duration()
    client.metrics.increment("entities_inserted", all_ids.len())

    RETURN Ok(result)

FUNCTION validate_insert_request(request: InsertRequest) -> Result<()>:
    IF request.collection_name.is_empty():
        RETURN Err(ValidationError::EmptyCollectionName)

    IF request.fields.is_empty():
        RETURN Err(ValidationError::NoFields)

    // All fields must have same row count
    row_counts = request.fields.map(|f| f.values.len()).collect_set()
    IF row_counts.len() > 1:
        RETURN Err(ValidationError::InconsistentRowCount)

    // Validate vector dimensions
    FOR field IN request.fields:
        IF field.values[0] IS FieldValue::FloatVector(v):
            FOR vec IN field.values:
                IF vec.len() != v.len():
                    RETURN Err(ValidationError::InconsistentDimensions)

    RETURN Ok(())
```

### 3.2 Upsert Entities
```
FUNCTION upsert(
    client: MilvusClient,
    request: UpsertRequest
) -> Result<UpsertResponse>:
    timer = client.metrics.start_timer("upsert")

    IF client.simulation.is_replay_mode():
        RETURN client.simulation.get_recorded_response(
            fingerprint: generate_fingerprint("upsert", request)
        )

    IF client.config.auto_load:
        ensure_collection_loaded(client, request.collection_name).await?

    validate_insert_request(request)?  // Same validation as insert

    chunks = chunk_insert_request(request, max_size: 10000)

    upsert_count = 0
    FOR chunk IN chunks:
        grpc_request = build_upsert_request(chunk)

        response = execute_with_retry(
            client,
            service: MilvusService::Upsert,
            request: grpc_request
        )?

        upsert_count += response.upsert_count
    END FOR

    result = UpsertResponse { upsert_count }

    client.simulation.record_if_enabled("upsert", request, result)
    timer.observe_duration()
    client.metrics.increment("entities_upserted", upsert_count)

    RETURN Ok(result)
```

### 3.3 Search Vectors
```
FUNCTION search(
    client: MilvusClient,
    request: SearchRequest
) -> Result<SearchResponse>:
    timer = client.metrics.start_timer("search")

    IF client.simulation.is_replay_mode():
        RETURN client.simulation.get_recorded_response(
            fingerprint: generate_fingerprint("search", request)
        )

    IF client.config.auto_load:
        ensure_collection_loaded(client, request.collection_name).await?

    // Validate search request
    validate_search_request(request)?

    // Build search parameters based on index type
    search_params = build_search_params(request.params)

    // Build gRPC request
    grpc_request = milvus::SearchRequest {
        collection_name: request.collection_name,
        partition_names: request.partition_names.unwrap_or_default(),
        dsl: build_filter_dsl(request.filter),
        placeholder_group: serialize_vectors(request.vector_field, request.vectors),
        dsl_type: DslType::BoolExprV1,
        output_fields: request.output_fields,
        search_params: search_params,
        nq: request.vectors.len(),
        guarantee_timestamp: get_guarantee_timestamp(
            request.consistency_level.unwrap_or(client.config.default_consistency)
        )
    }

    // Execute
    response = execute_with_retry(
        client,
        service: MilvusService::Search,
        request: grpc_request
    )?

    // Parse results
    result = parse_search_response(response, request.vectors.len())

    client.simulation.record_if_enabled("search", request, result)
    timer.observe_duration()
    client.metrics.histogram("search_result_count", result.total_hits())
    client.metrics.increment("searches_executed", 1)

    RETURN Ok(result)

FUNCTION validate_search_request(request: SearchRequest) -> Result<()>:
    IF request.collection_name.is_empty():
        RETURN Err(ValidationError::EmptyCollectionName)

    IF request.vectors.is_empty():
        RETURN Err(ValidationError::NoVectors)

    IF request.top_k == 0 OR request.top_k > 16384:
        RETURN Err(ValidationError::InvalidTopK)

    IF request.vector_field.is_empty():
        RETURN Err(ValidationError::EmptyVectorField)

    // All vectors must have same dimension
    dim = request.vectors[0].len()
    FOR vec IN request.vectors:
        IF vec.len() != dim:
            RETURN Err(ValidationError::InconsistentDimensions)

    RETURN Ok(())

FUNCTION build_search_params(params: SearchParams) -> Vec<KeyValuePair>:
    result = []

    // Add metric type
    result.push(("metric_type", params.metric_type.to_string()))

    // Add index-specific params
    MATCH params.index_type:
        IVF_FLAT | IVF_SQ8 | IVF_PQ => {
            nprobe = params.params.get("nprobe").unwrap_or(10)
            result.push(("nprobe", nprobe.to_string()))
        }
        HNSW => {
            ef = params.params.get("ef").unwrap_or(64)
            result.push(("ef", ef.to_string()))
        }
        DISKANN => {
            search_list = params.params.get("search_list").unwrap_or(100)
            result.push(("search_list", search_list.to_string()))
        }
        AUTOINDEX => {
            level = params.params.get("level").unwrap_or(1)
            result.push(("level", level.to_string()))
        }
        FLAT => {}

    RETURN result
```

### 3.4 Query Entities
```
FUNCTION query(
    client: MilvusClient,
    request: QueryRequest
) -> Result<QueryResponse>:
    timer = client.metrics.start_timer("query")

    IF client.simulation.is_replay_mode():
        RETURN client.simulation.get_recorded_response(
            fingerprint: generate_fingerprint("query", request)
        )

    IF client.config.auto_load:
        ensure_collection_loaded(client, request.collection_name).await?

    // Validate query
    validate_query_request(request)?

    // Build gRPC request
    grpc_request = milvus::QueryRequest {
        collection_name: request.collection_name,
        partition_names: request.partition_names.unwrap_or_default(),
        expr: request.filter,
        output_fields: request.output_fields,
        travel_timestamp: 0,
        guarantee_timestamp: get_guarantee_timestamp(
            request.consistency_level.unwrap_or(client.config.default_consistency)
        )
    }

    // Add limit and offset if specified
    IF request.limit IS Some(limit):
        grpc_request.query_params.push(("limit", limit.to_string()))
    IF request.offset IS Some(offset):
        grpc_request.query_params.push(("offset", offset.to_string()))

    // Execute
    response = execute_with_retry(
        client,
        service: MilvusService::Query,
        request: grpc_request
    )?

    // Parse results
    result = parse_query_response(response)

    client.simulation.record_if_enabled("query", request, result)
    timer.observe_duration()

    RETURN Ok(result)

FUNCTION validate_query_request(request: QueryRequest) -> Result<()>:
    IF request.collection_name.is_empty():
        RETURN Err(ValidationError::EmptyCollectionName)

    IF request.filter.is_empty():
        RETURN Err(ValidationError::EmptyFilter)

    IF request.limit IS Some(l) AND l > 16384:
        RETURN Err(ValidationError::LimitTooLarge)

    RETURN Ok(())
```

### 3.5 Delete Entities
```
FUNCTION delete(
    client: MilvusClient,
    request: DeleteRequest
) -> Result<DeleteResponse>:
    timer = client.metrics.start_timer("delete")

    IF client.simulation.is_replay_mode():
        RETURN client.simulation.get_recorded_response(
            fingerprint: generate_fingerprint("delete", request)
        )

    // Validate
    IF request.collection_name.is_empty():
        RETURN Err(ValidationError::EmptyCollectionName)
    IF request.filter.is_empty():
        RETURN Err(ValidationError::EmptyFilter)

    // Build gRPC request
    grpc_request = milvus::DeleteRequest {
        collection_name: request.collection_name,
        partition_name: request.partition_name.unwrap_or_default(),
        expr: request.filter
    }

    // Execute
    response = execute_with_retry(
        client,
        service: MilvusService::Delete,
        request: grpc_request
    )?

    result = DeleteResponse {
        delete_count: response.delete_count
    }

    client.simulation.record_if_enabled("delete", request, result)
    timer.observe_duration()
    client.metrics.increment("entities_deleted", result.delete_count)

    RETURN Ok(result)
```

---

## 4. Collection Operations

### 4.1 Collection Management
```
FUNCTION list_collections(client: MilvusClient) -> Result<Vec<String>>:
    grpc_request = milvus::ShowCollectionsRequest {
        type: ShowType::All
    }

    response = execute_with_retry(
        client,
        service: MilvusService::ShowCollections,
        request: grpc_request
    )?

    RETURN Ok(response.collection_names)

FUNCTION describe_collection(
    client: MilvusClient,
    collection_name: String
) -> Result<CollectionInfo>:
    // Check cache first
    IF let Some(cached) = client.collection_cache.read().get(&collection_name):
        IF NOT cached.is_expired():
            RETURN Ok(cached.value.clone())

    grpc_request = milvus::DescribeCollectionRequest {
        collection_name: collection_name.clone()
    }

    response = execute_with_retry(
        client,
        service: MilvusService::DescribeCollection,
        request: grpc_request
    )?

    info = CollectionInfo {
        name: response.collection_name,
        description: response.description,
        num_entities: get_collection_stats(client, collection_name).await?.row_count,
        schema: parse_schema(response.schema),
        load_state: get_load_state(client, collection_name).await?,
        created_timestamp: response.created_timestamp
    }

    // Update cache
    client.collection_cache.write().insert(collection_name, info.clone())

    RETURN Ok(info)

FUNCTION get_load_state(
    client: MilvusClient,
    collection_name: String
) -> Result<LoadState>:
    grpc_request = milvus::GetLoadStateRequest {
        collection_name: collection_name
    }

    response = execute_with_retry(
        client,
        service: MilvusService::GetLoadState,
        request: grpc_request
    )?

    RETURN Ok(parse_load_state(response.state))
```

### 4.2 Load/Release Operations
```
FUNCTION load_collection(
    client: MilvusClient,
    collection_name: String,
    replica_number: Option<u32>
) -> Result<()>:
    timer = client.metrics.start_timer("load_collection")

    grpc_request = milvus::LoadCollectionRequest {
        collection_name: collection_name.clone(),
        replica_number: replica_number.unwrap_or(1)
    }

    execute_with_retry(
        client,
        service: MilvusService::LoadCollection,
        request: grpc_request
    )?

    // Wait for load to complete
    wait_for_load_state(client, collection_name, LoadState::Loaded).await?

    timer.observe_duration()
    RETURN Ok(())

FUNCTION release_collection(
    client: MilvusClient,
    collection_name: String
) -> Result<()>:
    grpc_request = milvus::ReleaseCollectionRequest {
        collection_name: collection_name
    }

    execute_with_retry(
        client,
        service: MilvusService::ReleaseCollection,
        request: grpc_request
    )?

    // Invalidate cache
    client.collection_cache.write().remove(&collection_name)

    RETURN Ok(())

FUNCTION ensure_collection_loaded(
    client: MilvusClient,
    collection_name: String
) -> Result<()>:
    load_state = get_load_state(client, collection_name.clone()).await?

    MATCH load_state:
        LoadState::Loaded => RETURN Ok(())
        LoadState::Loading => {
            wait_for_load_state(client, collection_name, LoadState::Loaded).await?
        }
        LoadState::NotLoad | LoadState::LoadFailed => {
            load_collection(client, collection_name, None).await?
        }

    RETURN Ok(())

FUNCTION wait_for_load_state(
    client: MilvusClient,
    collection_name: String,
    target_state: LoadState
) -> Result<()>:
    max_wait = Duration::from_secs(300)
    start = Instant::now()

    LOOP:
        IF start.elapsed() > max_wait:
            RETURN Err(MilvusError::LoadTimeout { collection: collection_name })

        state = get_load_state(client, collection_name.clone()).await?

        IF state == target_state:
            RETURN Ok(())

        IF state == LoadState::LoadFailed:
            RETURN Err(MilvusError::LoadFailed { collection: collection_name })

        sleep(Duration::from_secs(1)).await
```

---

## 5. Partition Operations

### 5.1 Partition Management
```
FUNCTION list_partitions(
    client: MilvusClient,
    collection_name: String
) -> Result<Vec<PartitionInfo>>:
    grpc_request = milvus::ShowPartitionsRequest {
        collection_name: collection_name
    }

    response = execute_with_retry(
        client,
        service: MilvusService::ShowPartitions,
        request: grpc_request
    )?

    partitions = []
    FOR (name, created_ts) IN zip(response.partition_names, response.created_timestamps):
        partitions.push(PartitionInfo {
            name: name,
            num_entities: 0,  // Would need additional call
            load_state: LoadState::Unknown
        })

    RETURN Ok(partitions)

FUNCTION load_partitions(
    client: MilvusClient,
    collection_name: String,
    partition_names: Vec<String>
) -> Result<()>:
    grpc_request = milvus::LoadPartitionsRequest {
        collection_name: collection_name,
        partition_names: partition_names
    }

    execute_with_retry(
        client,
        service: MilvusService::LoadPartitions,
        request: grpc_request
    )?

    RETURN Ok(())

FUNCTION release_partitions(
    client: MilvusClient,
    collection_name: String,
    partition_names: Vec<String>
) -> Result<()>:
    grpc_request = milvus::ReleasePartitionsRequest {
        collection_name: collection_name,
        partition_names: partition_names
    }

    execute_with_retry(
        client,
        service: MilvusService::ReleasePartitions,
        request: grpc_request
    )?

    RETURN Ok(())
```

---

## 6. Consistency Control

### 6.1 Guarantee Timestamp
```
FUNCTION get_guarantee_timestamp(level: ConsistencyLevel) -> u64:
    MATCH level:
        ConsistencyLevel::Strong => {
            // Use max timestamp - forces sync
            RETURN u64::MAX
        }
        ConsistencyLevel::Session => {
            // Use session's last write timestamp
            RETURN get_session_timestamp()
        }
        ConsistencyLevel::Bounded => {
            // Use current time minus bounded staleness
            bounded_ms = 5000  // 5 seconds default
            RETURN current_timestamp_ms() - bounded_ms
        }
        ConsistencyLevel::Eventually => {
            // Use 0 - no guarantee
            RETURN 0
        }
        ConsistencyLevel::Customized(ts) => {
            RETURN ts
        }

FUNCTION update_session_timestamp(timestamp: u64):
    SESSION_TIMESTAMP.store(timestamp, Ordering::Release)

FUNCTION get_session_timestamp() -> u64:
    SESSION_TIMESTAMP.load(Ordering::Acquire)
```

---

## 7. Hybrid Search

### 7.1 Hybrid Search with Reranking
```
FUNCTION hybrid_search(
    client: MilvusClient,
    request: HybridSearchRequest
) -> Result<SearchResponse>:
    timer = client.metrics.start_timer("hybrid_search")

    IF client.simulation.is_replay_mode():
        RETURN client.simulation.get_recorded_response(
            fingerprint: generate_fingerprint("hybrid_search", request)
        )

    // Execute multiple searches
    search_results = []
    FOR search_req IN request.searches:
        result = search(client, search_req).await?
        search_results.push(result)

    // Apply reranking strategy
    merged = MATCH request.rerank_strategy:
        RerankStrategy::RRF { k } => {
            reciprocal_rank_fusion(search_results, k)
        }
        RerankStrategy::WeightedSum { weights } => {
            weighted_score_fusion(search_results, weights)
        }
        RerankStrategy::MaxScore => {
            max_score_fusion(search_results)
        }

    // Apply final top_k
    merged.truncate(request.final_top_k)

    client.simulation.record_if_enabled("hybrid_search", request, merged)
    timer.observe_duration()

    RETURN Ok(merged)

FUNCTION reciprocal_rank_fusion(
    results: Vec<SearchResult>,
    k: u32
) -> SearchResult:
    // RRF score = sum(1 / (k + rank)) for each result set
    scores = HashMap::new()  // id -> score

    FOR result IN results:
        FOR (rank, hit) IN result.hits.enumerate():
            rrf_score = 1.0 / (k as f32 + rank as f32 + 1.0)
            scores.entry(hit.id)
                .and_modify(|s| *s += rrf_score)
                .or_insert(rrf_score)

    // Sort by fused score
    sorted = scores.into_iter()
        .sorted_by(|a, b| b.1.partial_cmp(&a.1).unwrap())
        .collect()

    RETURN SearchResult { hits: sorted }
```

---

## 8. gRPC Execution Layer

### 8.1 Execute with Retry
```
FUNCTION execute_with_retry<Req, Resp>(
    client: MilvusClient,
    service: MilvusService,
    request: Req
) -> Result<Resp>:
    retry_config = client.config.retry_config
    last_error = None

    FOR attempt IN 0..retry_config.max_retries:
        TRY:
            conn = client.pool.acquire().await?
            response = execute_grpc_request(conn, service, request).await?

            // Update session timestamp if applicable
            IF response.has_timestamp():
                update_session_timestamp(response.timestamp)

            RETURN Ok(response)

        CATCH error:
            last_error = Some(error)

            IF NOT is_retryable_grpc_error(error):
                RETURN Err(convert_grpc_error(error))

            backoff = calculate_backoff(
                attempt,
                retry_config.initial_backoff,
                retry_config.max_backoff,
                retry_config.backoff_multiplier
            )

            jitter = random_duration(0, backoff / 4)
            sleep(backoff + jitter).await

            client.metrics.increment("retries", 1)

    RETURN Err(last_error.unwrap_or(MilvusError::MaxRetriesExceeded))

FUNCTION is_retryable_grpc_error(error: tonic::Status) -> bool:
    MATCH error.code():
        Code::Unavailable => true
        Code::ResourceExhausted => true
        Code::Internal => true
        Code::DeadlineExceeded => true
        Code::Aborted => true
        _ => false

FUNCTION convert_grpc_error(error: tonic::Status) -> MilvusError:
    MATCH error.code():
        Code::Unauthenticated => MilvusError::Authentication {
            message: error.message()
        }
        Code::PermissionDenied => MilvusError::Authorization {
            message: error.message()
        }
        Code::NotFound => MilvusError::NotFound {
            resource: extract_resource(error.message())
        }
        Code::ResourceExhausted => MilvusError::RateLimit {
            message: error.message()
        }
        Code::DeadlineExceeded => MilvusError::Timeout {
            duration: client.config.timeout
        }
        _ => MilvusError::Server {
            code: error.code(),
            message: error.message()
        }
```

### 8.2 Execute gRPC Request
```
FUNCTION execute_grpc_request<Req, Resp>(
    conn: PooledConnection,
    service: MilvusService,
    request: Req
) -> Result<Resp>:
    // Create service client with interceptor
    client = MilvusServiceClient::with_interceptor(
        conn.channel.clone(),
        conn.interceptor.clone()
    )

    // Execute based on service type
    response = MATCH service:
        MilvusService::Insert => client.insert(request).await?
        MilvusService::Upsert => client.upsert(request).await?
        MilvusService::Delete => client.delete(request).await?
        MilvusService::Search => client.search(request).await?
        MilvusService::Query => client.query(request).await?
        MilvusService::ShowCollections => client.show_collections(request).await?
        MilvusService::DescribeCollection => client.describe_collection(request).await?
        MilvusService::LoadCollection => client.load_collection(request).await?
        MilvusService::ReleaseCollection => client.release_collection(request).await?
        MilvusService::GetLoadState => client.get_load_state(request).await?
        MilvusService::ShowPartitions => client.show_partitions(request).await?
        MilvusService::LoadPartitions => client.load_partitions(request).await?
        MilvusService::ReleasePartitions => client.release_partitions(request).await?

    // Check response status
    IF response.status.error_code != ErrorCode::Success:
        RETURN Err(MilvusError::Server {
            code: response.status.error_code,
            message: response.status.reason
        })

    RETURN Ok(response)
```

---

## 9. Connection Pool Management

### 9.1 Pool Operations
```
FUNCTION pool_acquire(pool: ConnectionPool) -> Result<PooledConnection>:
    permit = pool.semaphore.acquire().await?

    // Try existing connection
    FOR conn IN pool.connections:
        IF conn.state == Available AND NOT is_expired(conn):
            conn.state = InUse
            conn.last_used = Instant::now()
            RETURN Ok(conn)

    // Create new if under limit
    IF pool.connections.len() < pool.config.max_connections:
        conn = create_connection(pool).await?
        pool.connections.push(conn)
        RETURN Ok(conn)

    RETURN pool.wait_for_connection().await

FUNCTION create_connection(pool: ConnectionPool) -> Result<PooledConnection>:
    channel = create_grpc_channel(pool.endpoint, pool.tls_config)?

    RETURN PooledConnection {
        id: generate_connection_id(),
        channel: GrpcChannel {
            inner: channel,
            interceptor: AuthInterceptor::new(pool.credentials.clone())
        },
        created_at: Instant::now(),
        last_used: Instant::now(),
        state: ConnectionState::InUse
    }

FUNCTION pool_release(pool: ConnectionPool, conn: PooledConnection):
    // Check health before returning
    IF is_expired(conn) OR NOT is_healthy(conn):
        remove_connection(pool, conn)
    ELSE:
        conn.state = Available
        conn.last_used = Instant::now()

    pool.semaphore.release()
```

---

## 10. Simulation Layer

### 10.1 Recording and Replay
```
STRUCT SimulationLayer {
    mode: SimulationMode
    storage: Arc<dyn SimulationStorage>
    fingerprinter: OperationFingerprinter
}

FUNCTION simulation_record_if_enabled<R>(
    sim: SimulationLayer,
    operation: String,
    request: impl Serialize,
    response: R
):
    IF sim.mode NOT IN [Record, PassThrough]:
        RETURN

    fingerprint = sim.fingerprinter.generate(operation, request)

    record = SimulationRecord {
        fingerprint: fingerprint,
        operation: operation,
        request: serialize(request),
        response: serialize(response),
        timestamp: Instant::now()
    }

    sim.storage.store(record).await

FUNCTION generate_fingerprint(operation: String, request: impl Serialize) -> String:
    normalized = normalize_request(request)

    hasher = Sha256::new()
    hasher.update(operation.as_bytes())
    hasher.update(serialize_canonical(normalized))

    RETURN hasher.finalize().to_hex()
```

---

## 11. RAG Integration

### 11.1 Retrieval Interface
```
STRUCT RAGRetriever {
    client: Arc<MilvusClient>
    default_collection: String
    default_partition: Option<String>
    default_top_k: u32
    default_params: SearchParams
}

FUNCTION retrieve(
    retriever: RAGRetriever,
    query_embedding: Vec<f32>,
    options: RetrievalOptions
) -> Result<Vec<RetrievalResult>>:
    request = SearchRequest {
        collection_name: options.collection.unwrap_or(retriever.default_collection),
        partition_names: options.partitions.or(
            retriever.default_partition.map(|p| vec![p])
        ),
        vector_field: options.vector_field.unwrap_or("embedding"),
        vectors: vec![query_embedding],
        metric_type: options.metric.unwrap_or(MetricType::COSINE),
        top_k: options.top_k.unwrap_or(retriever.default_top_k),
        params: options.params.unwrap_or(retriever.default_params),
        filter: options.filter,
        output_fields: options.output_fields,
        consistency_level: options.consistency
    }

    response = retriever.client.search(request).await?

    results = response.results[0].hits
        .iter()
        .filter(|h| h.score >= options.min_score.unwrap_or(0.0))
        .map(|h| RetrievalResult {
            id: h.id,
            score: h.score,
            content: h.fields.get("content").cloned(),
            metadata: h.fields.clone()
        })
        .collect()

    RETURN Ok(results)

FUNCTION multi_collection_retrieve(
    retriever: RAGRetriever,
    query_embedding: Vec<f32>,
    collections: Vec<String>,
    options: RetrievalOptions
) -> Result<Vec<RetrievalResult>>:
    // Search all collections in parallel
    results = parallel_map(collections, |collection| {
        retrieve(retriever, query_embedding.clone(), RetrievalOptions {
            collection: Some(collection),
            ..options.clone()
        })
    }).await?

    // Merge and sort by score
    merged = results.into_iter().flatten().collect()
    merged.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap())

    // Apply final limit
    RETURN Ok(merged.take(options.top_k.unwrap_or(retriever.default_top_k)))
```

---

## 12. Batch Operations

### 12.1 Batch Insert
```
FUNCTION batch_insert(
    client: MilvusClient,
    request: BatchInsertRequest
) -> Result<BatchInsertResponse>:
    timer = client.metrics.start_timer("batch_insert")

    // Calculate chunks
    total_rows = get_row_count(request.fields)
    chunk_size = request.options.chunk_size.unwrap_or(10000)
    chunks = chunk_insert_request(request, chunk_size)

    // Determine parallelism
    parallelism = min(
        request.options.max_parallelism.unwrap_or(4),
        chunks.len()
    )

    semaphore = Semaphore::new(parallelism)

    // Process in parallel
    results = parallel_map(chunks, |chunk| {
        permit = semaphore.acquire().await?
        result = insert(client, InsertRequest {
            collection_name: request.collection_name.clone(),
            partition_name: request.partition_name.clone(),
            fields: chunk
        }).await
        drop(permit)

        // Report progress
        IF request.options.progress_callback IS Some(cb):
            cb(BatchProgress {
                completed: current,
                total: chunks.len(),
                inserted: result.insert_count
            })

        result
    }).await?

    // Aggregate
    total_inserted = results.iter().map(|r| r.insert_count).sum()
    errors = results.iter().filter_map(|r| r.err()).collect()

    timer.observe_duration()

    RETURN Ok(BatchInsertResponse {
        total_inserted,
        chunk_count: chunks.len(),
        errors
    })
```

---

## 13. Metrics Collection

```
STRUCT MetricsCollector {
    prefix: String
    registry: MetricsRegistry
}

FUNCTION metrics_for_index_type(
    collector: MetricsCollector,
    index_type: IndexType,
    duration: Duration
):
    histogram = collector.get_or_create_histogram(
        format!("{}_search_duration_seconds", collector.prefix),
        labels: [("index_type", index_type.to_string())]
    )
    histogram.observe(duration.as_secs_f64())

FUNCTION metrics_for_collection(
    collector: MetricsCollector,
    collection: String,
    operation: String
):
    counter = collector.get_or_create_counter(
        format!("{}_operations_total", collector.prefix),
        labels: [
            ("collection", collection),
            ("operation", operation)
        ]
    )
    counter.increment(1)
```
