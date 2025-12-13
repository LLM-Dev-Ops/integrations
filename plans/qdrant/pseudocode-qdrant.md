# Qdrant Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/qdrant`

---

## 1. Core Client

### 1.1 QdrantClient

```pseudocode
CLASS QdrantClient:
    inner: QdrantGrpcClient
    config: QdrantConfig
    circuit_breaker: CircuitBreaker
    metrics: MetricsRecorder

    FUNCTION new(config: QdrantConfig) -> Result<Self>:
        // Build connection URL
        url = format!("{}:{}", config.host, config.port)

        // Configure TLS if enabled
        tls_config = IF config.tls_enabled:
            TlsConfig::new()
                .with_ca_cert(config.ca_cert)
                .with_verify(config.verify_tls)
        ELSE:
            None

        // Build client with optional API key
        client_builder = QdrantClientBuilder::new(url)
            .with_timeout(config.timeout)

        IF config.api_key IS Some(key):
            client_builder = client_builder.with_api_key(key.expose())

        IF tls_config IS Some(tls):
            client_builder = client_builder.with_tls_config(tls)

        inner = client_builder.build().await?

        circuit_breaker = CircuitBreaker::new(
            failure_threshold: 5,
            reset_timeout: Duration::from_secs(30)
        )

        RETURN Ok(Self { inner, config, circuit_breaker, metrics })

    FUNCTION collection(self, name: &str) -> CollectionClient:
        RETURN CollectionClient::new(self.clone(), name.to_string())

    ASYNC FUNCTION health_check(self) -> Result<HealthStatus>:
        response = self.inner.health_check().await?
        RETURN Ok(HealthStatus {
            title: response.title,
            version: response.version,
            status: response.status
        })

    ASYNC FUNCTION list_collections(self) -> Result<Vec<CollectionInfo>>:
        span = tracing::span!("qdrant.list_collections")

        response = self.execute_with_resilience(|| {
            self.inner.list_collections()
        }).await?

        RETURN response.collections.map(|c| CollectionInfo {
            name: c.name,
            status: c.status,
            vectors_count: c.vectors_count,
            points_count: c.points_count
        })

    ASYNC FUNCTION execute_with_resilience<T, F>(self, operation: F) -> Result<T>:
        IF NOT self.circuit_breaker.allow():
            RETURN Err(QdrantError::CircuitBreakerOpen)

        result = retry_with_backoff(
            max_attempts: self.config.max_retries,
            base_delay: Duration::from_millis(100),
            operation
        ).await

        MATCH result:
            Ok(value) =>
                self.circuit_breaker.record_success()
                Ok(value)
            Err(e) IF is_transient_error(&e) =>
                self.circuit_breaker.record_failure()
                Err(e)
            Err(e) =>
                Err(e)
```

### 1.2 Configuration

```pseudocode
STRUCT QdrantConfig:
    host: String
    port: u16
    api_key: Option<SecretString>
    tls_enabled: bool
    ca_cert: Option<PathBuf>
    verify_tls: bool
    timeout: Duration
    max_retries: u32
    connection_pool_size: u32

    FUNCTION from_env() -> Result<Self>:
        host = env::var("QDRANT_HOST").unwrap_or("localhost".to_string())
        port = env::var("QDRANT_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(6334)

        api_key = env::var("QDRANT_API_KEY")
            .ok()
            .map(SecretString::new)

        tls_enabled = env::var("QDRANT_TLS_ENABLED")
            .map(|v| v == "true")
            .unwrap_or(api_key.is_some())  // Enable TLS if API key present

        RETURN Ok(Self {
            host,
            port,
            api_key,
            tls_enabled,
            ca_cert: env::var("QDRANT_CA_CERT").ok().map(PathBuf::from),
            verify_tls: env::var("QDRANT_VERIFY_TLS").map(|v| v != "false").unwrap_or(true),
            timeout: Duration::from_secs(30),
            max_retries: 3,
            connection_pool_size: 10
        })

    FUNCTION cloud(url: &str, api_key: &str) -> Self:
        // Parse Qdrant Cloud URL
        parsed = Url::parse(url)?
        host = parsed.host_str().ok_or("Invalid host")?

        RETURN Self {
            host: host.to_string(),
            port: 6334,
            api_key: Some(SecretString::new(api_key)),
            tls_enabled: true,
            ca_cert: None,
            verify_tls: true,
            timeout: Duration::from_secs(30),
            max_retries: 3,
            connection_pool_size: 10
        }
```

---

## 2. Collection Operations

### 2.1 CollectionClient

```pseudocode
CLASS CollectionClient:
    client: QdrantClient
    collection_name: String

    ASYNC FUNCTION create(self, config: CollectionConfig) -> Result<()>:
        span = tracing::span!("qdrant.collection.create",
            collection = self.collection_name,
            vector_size = config.vector_size,
            distance = config.distance.as_str()
        )

        vectors_config = VectorsConfig::Single(VectorParams {
            size: config.vector_size,
            distance: config.distance.into(),
            on_disk: config.on_disk,
            hnsw_config: config.hnsw_config.map(Into::into),
            quantization_config: config.quantization.map(Into::into)
        })

        request = CreateCollection {
            collection_name: self.collection_name.clone(),
            vectors_config: Some(vectors_config),
            shard_number: config.shard_number,
            replication_factor: config.replication_factor,
            write_consistency_factor: config.write_consistency_factor,
            on_disk_payload: config.on_disk_payload,
            ..Default::default()
        }

        self.client.execute_with_resilience(|| {
            self.client.inner.create_collection(request.clone())
        }).await?

        metrics::counter!("qdrant_collections_created_total").increment(1)
        RETURN Ok(())

    ASYNC FUNCTION create_with_named_vectors(self, configs: HashMap<String, VectorConfig>) -> Result<()>:
        vectors_config = VectorsConfig::Multi(
            configs.into_iter()
                .map(|(name, cfg)| (name, VectorParams {
                    size: cfg.size,
                    distance: cfg.distance.into(),
                    on_disk: cfg.on_disk,
                    ..Default::default()
                }))
                .collect()
        )

        request = CreateCollection {
            collection_name: self.collection_name.clone(),
            vectors_config: Some(vectors_config),
            ..Default::default()
        }

        self.client.inner.create_collection(request).await?
        RETURN Ok(())

    ASYNC FUNCTION info(self) -> Result<CollectionInfo>:
        span = tracing::span!("qdrant.collection.info", collection = self.collection_name)

        response = self.client.execute_with_resilience(|| {
            self.client.inner.collection_info(&self.collection_name)
        }).await?

        RETURN Ok(CollectionInfo {
            name: self.collection_name.clone(),
            status: response.status,
            vectors_count: response.vectors_count,
            points_count: response.points_count,
            segments_count: response.segments_count,
            config: parse_collection_config(response.config)
        })

    ASYNC FUNCTION exists(self) -> Result<bool>:
        response = self.client.inner.collection_exists(&self.collection_name).await?
        RETURN Ok(response.exists)

    ASYNC FUNCTION delete(self) -> Result<()>:
        self.client.inner.delete_collection(&self.collection_name).await?
        metrics::counter!("qdrant_collections_deleted_total").increment(1)
        RETURN Ok(())

    ASYNC FUNCTION update_params(self, params: UpdateParams) -> Result<()>:
        request = UpdateCollection {
            collection_name: self.collection_name.clone(),
            optimizers_config: params.optimizers.map(Into::into),
            params: params.collection_params.map(Into::into),
            ..Default::default()
        }

        self.client.inner.update_collection(request).await?
        RETURN Ok(())
```

### 2.2 Collection Configuration

```pseudocode
STRUCT CollectionConfig:
    vector_size: u64
    distance: Distance
    on_disk: bool
    hnsw_config: Option<HnswConfig>
    quantization: Option<QuantizationConfig>
    shard_number: Option<u32>
    replication_factor: Option<u32>
    write_consistency_factor: Option<u32>
    on_disk_payload: Option<bool>

    FUNCTION default_with_size(size: u64) -> Self:
        RETURN Self {
            vector_size: size,
            distance: Distance::Cosine,
            on_disk: false,
            hnsw_config: None,
            quantization: None,
            shard_number: None,
            replication_factor: None,
            write_consistency_factor: None,
            on_disk_payload: None
        }

    FUNCTION with_distance(mut self, distance: Distance) -> Self:
        self.distance = distance
        RETURN self

    FUNCTION with_hnsw(mut self, m: u64, ef_construct: u64) -> Self:
        self.hnsw_config = Some(HnswConfig { m, ef_construct, ..Default::default() })
        RETURN self

    FUNCTION with_scalar_quantization(mut self) -> Self:
        self.quantization = Some(QuantizationConfig::Scalar(ScalarQuantization {
            type_: QuantizationType::Int8,
            quantile: Some(0.99),
            always_ram: Some(true)
        }))
        RETURN self

ENUM Distance:
    Cosine
    Euclidean
    Dot
    Manhattan
```

---

## 3. Point Operations

### 3.1 Points Client

```pseudocode
CLASS CollectionClient (continued):

    ASYNC FUNCTION upsert(self, points: Vec<Point>) -> Result<UpsertResult>:
        span = tracing::span!("qdrant.upsert",
            collection = self.collection_name,
            point_count = points.len()
        )
        timer = metrics::histogram!("qdrant_operation_duration_seconds",
            "operation" => "upsert",
            "collection" => self.collection_name.clone()
        ).start_timer()

        qdrant_points = points.iter()
            .map(|p| PointStruct {
                id: p.id.into(),
                vectors: p.vector.clone().into(),
                payload: p.payload.clone().map(Into::into).unwrap_or_default()
            })
            .collect()

        response = self.client.execute_with_resilience(|| {
            self.client.inner.upsert_points(
                &self.collection_name,
                None,  // wait
                qdrant_points.clone(),
                None   // ordering
            )
        }).await?

        timer.stop()
        metrics::counter!("qdrant_vectors_upserted_total",
            "collection" => self.collection_name.clone()
        ).increment(points.len() as u64)

        RETURN Ok(UpsertResult {
            operation_id: response.operation_id,
            status: response.status
        })

    ASYNC FUNCTION upsert_batch(self, points: Vec<Point>, batch_size: usize) -> Result<BatchUpsertResult>:
        total = points.len()
        batches = points.chunks(batch_size)
        results = Vec::new()

        FOR (idx, batch) IN batches.enumerate():
            tracing::debug!(batch = idx, size = batch.len(), "Upserting batch")

            result = self.upsert(batch.to_vec()).await?
            results.push(result)

            // Small delay between batches to avoid overwhelming server
            IF idx < batches.len() - 1:
                tokio::time::sleep(Duration::from_millis(10)).await

        RETURN Ok(BatchUpsertResult {
            total_points: total,
            batches_processed: results.len(),
            results
        })

    ASYNC FUNCTION get(self, ids: Vec<PointId>) -> Result<Vec<Point>>:
        span = tracing::span!("qdrant.get", collection = self.collection_name, count = ids.len())

        response = self.client.inner.get_points(
            &self.collection_name,
            None,  // consistency
            ids.iter().map(|id| id.clone().into()).collect(),
            Some(true),  // with_payload
            Some(true),  // with_vectors
            None   // read_consistency
        ).await?

        RETURN response.result.into_iter()
            .map(|r| Point::from_retrieved(r))
            .collect()

    ASYNC FUNCTION delete(self, ids: Vec<PointId>) -> Result<DeleteResult>:
        span = tracing::span!("qdrant.delete", collection = self.collection_name, count = ids.len())

        selector = PointsSelector::Points(PointsIdsList {
            ids: ids.into_iter().map(Into::into).collect()
        })

        response = self.client.inner.delete_points(
            &self.collection_name,
            None,  // wait
            selector,
            None   // ordering
        ).await?

        RETURN Ok(DeleteResult {
            operation_id: response.operation_id,
            status: response.status
        })

    ASYNC FUNCTION delete_by_filter(self, filter: Filter) -> Result<DeleteResult>:
        selector = PointsSelector::Filter(filter.into())

        response = self.client.inner.delete_points(
            &self.collection_name,
            None,
            selector,
            None
        ).await?

        RETURN Ok(DeleteResult {
            operation_id: response.operation_id,
            status: response.status
        })

    ASYNC FUNCTION scroll(self, options: ScrollOptions) -> Result<ScrollResult>:
        span = tracing::span!("qdrant.scroll",
            collection = self.collection_name,
            limit = options.limit
        )

        response = self.client.inner.scroll(
            &self.collection_name,
            options.filter.map(Into::into),
            options.offset.map(Into::into),
            Some(options.limit),
            Some(options.with_payload),
            Some(options.with_vectors),
            None  // read_consistency
        ).await?

        points = response.result.into_iter()
            .map(Point::from_retrieved)
            .collect()

        RETURN Ok(ScrollResult {
            points,
            next_offset: response.next_page_offset.map(Into::into)
        })

    ASYNC FUNCTION count(self, filter: Option<Filter>) -> Result<u64>:
        response = self.client.inner.count(
            &self.collection_name,
            filter.map(Into::into),
            Some(true)  // exact
        ).await?

        RETURN Ok(response.count)
```

### 3.2 Point Types

```pseudocode
STRUCT Point:
    id: PointId
    vector: Vector
    payload: Option<Payload>

    FUNCTION new(id: impl Into<PointId>, vector: Vec<f32>) -> Self:
        RETURN Self {
            id: id.into(),
            vector: Vector::Dense(vector),
            payload: None
        }

    FUNCTION with_payload(mut self, payload: impl Into<Payload>) -> Self:
        self.payload = Some(payload.into())
        RETURN self

    FUNCTION from_retrieved(r: RetrievedPoint) -> Self:
        RETURN Self {
            id: r.id.into(),
            vector: r.vectors.into(),
            payload: Some(r.payload.into())
        }

ENUM PointId:
    Uuid(Uuid)
    Num(u64)

ENUM Vector:
    Dense(Vec<f32>)
    Sparse { indices: Vec<u32>, values: Vec<f32> }
    Multi(HashMap<String, Vec<f32>>)

TYPE Payload = HashMap<String, Value>
```

---

## 4. Search Operations

### 4.1 Search Client

```pseudocode
CLASS CollectionClient (continued):

    ASYNC FUNCTION search(self, request: SearchRequest) -> Result<Vec<ScoredPoint>>:
        span = tracing::span!("qdrant.search",
            collection = self.collection_name,
            limit = request.limit,
            has_filter = request.filter.is_some()
        )
        timer = metrics::histogram!("qdrant_operation_duration_seconds",
            "operation" => "search",
            "collection" => self.collection_name.clone()
        ).start_timer()

        response = self.client.execute_with_resilience(|| {
            self.client.inner.search_points(SearchPoints {
                collection_name: self.collection_name.clone(),
                vector: request.vector.clone(),
                filter: request.filter.clone().map(Into::into),
                limit: request.limit,
                offset: request.offset,
                with_payload: Some(request.with_payload.into()),
                with_vectors: Some(request.with_vectors.into()),
                score_threshold: request.score_threshold,
                params: request.search_params.map(Into::into),
                ..Default::default()
            })
        }).await?

        timer.stop()
        metrics::histogram!("qdrant_search_results_total",
            "collection" => self.collection_name.clone()
        ).record(response.result.len() as f64)

        RETURN response.result.into_iter()
            .map(ScoredPoint::from)
            .collect()

    ASYNC FUNCTION search_batch(self, requests: Vec<SearchRequest>) -> Result<Vec<Vec<ScoredPoint>>>:
        span = tracing::span!("qdrant.search_batch",
            collection = self.collection_name,
            batch_size = requests.len()
        )

        search_points = requests.iter()
            .map(|r| SearchPoints {
                collection_name: self.collection_name.clone(),
                vector: r.vector.clone(),
                filter: r.filter.clone().map(Into::into),
                limit: r.limit,
                with_payload: Some(r.with_payload.into()),
                with_vectors: Some(r.with_vectors.into()),
                score_threshold: r.score_threshold,
                ..Default::default()
            })
            .collect()

        response = self.client.inner.search_batch_points(
            &self.collection_name,
            search_points,
            None  // read_consistency
        ).await?

        RETURN response.result.into_iter()
            .map(|batch| batch.result.into_iter().map(ScoredPoint::from).collect())
            .collect()

    ASYNC FUNCTION search_groups(self, request: SearchGroupsRequest) -> Result<Vec<PointGroup>>:
        response = self.client.inner.search_groups(SearchPointGroups {
            collection_name: self.collection_name.clone(),
            vector: request.vector,
            filter: request.filter.map(Into::into),
            limit: request.limit,
            group_by: request.group_by,
            group_size: request.group_size,
            with_payload: Some(request.with_payload.into()),
            ..Default::default()
        }).await?

        RETURN response.result.groups.into_iter()
            .map(PointGroup::from)
            .collect()

    ASYNC FUNCTION recommend(self, request: RecommendRequest) -> Result<Vec<ScoredPoint>>:
        span = tracing::span!("qdrant.recommend",
            collection = self.collection_name,
            positive = request.positive.len(),
            negative = request.negative.len()
        )

        response = self.client.inner.recommend(RecommendPoints {
            collection_name: self.collection_name.clone(),
            positive: request.positive.into_iter().map(Into::into).collect(),
            negative: request.negative.into_iter().map(Into::into).collect(),
            filter: request.filter.map(Into::into),
            limit: request.limit,
            with_payload: Some(request.with_payload.into()),
            with_vectors: Some(request.with_vectors.into()),
            score_threshold: request.score_threshold,
            ..Default::default()
        }).await?

        RETURN response.result.into_iter()
            .map(ScoredPoint::from)
            .collect()
```

### 4.2 Search Types

```pseudocode
STRUCT SearchRequest:
    vector: Vec<f32>
    limit: u64
    offset: Option<u64>
    filter: Option<Filter>
    with_payload: PayloadSelector
    with_vectors: VectorSelector
    score_threshold: Option<f32>
    search_params: Option<SearchParams>

    FUNCTION new(vector: Vec<f32>, limit: u64) -> Self:
        RETURN Self {
            vector,
            limit,
            offset: None,
            filter: None,
            with_payload: PayloadSelector::All,
            with_vectors: VectorSelector::None,
            score_threshold: None,
            search_params: None
        }

    FUNCTION with_filter(mut self, filter: Filter) -> Self:
        self.filter = Some(filter)
        RETURN self

    FUNCTION with_score_threshold(mut self, threshold: f32) -> Self:
        self.score_threshold = Some(threshold)
        RETURN self

    FUNCTION with_hnsw_ef(mut self, ef: u64) -> Self:
        self.search_params = Some(SearchParams { hnsw_ef: Some(ef), ..Default::default() })
        RETURN self

STRUCT ScoredPoint:
    id: PointId
    score: f32
    payload: Option<Payload>
    vector: Option<Vector>

STRUCT RecommendRequest:
    positive: Vec<PointId>
    negative: Vec<PointId>
    limit: u64
    filter: Option<Filter>
    with_payload: PayloadSelector
    with_vectors: VectorSelector
    score_threshold: Option<f32>
```

---

## 5. Filter Builder

### 5.1 Filter Types

```pseudocode
STRUCT Filter:
    must: Vec<Condition>
    should: Vec<Condition>
    must_not: Vec<Condition>
    min_should: Option<MinShould>

    FUNCTION new() -> Self:
        RETURN Self {
            must: Vec::new(),
            should: Vec::new(),
            must_not: Vec::new(),
            min_should: None
        }

    FUNCTION must(mut self, condition: Condition) -> Self:
        self.must.push(condition)
        RETURN self

    FUNCTION should(mut self, condition: Condition) -> Self:
        self.should.push(condition)
        RETURN self

    FUNCTION must_not(mut self, condition: Condition) -> Self:
        self.must_not.push(condition)
        RETURN self

    FUNCTION min_should_match(mut self, count: u64) -> Self:
        self.min_should = Some(MinShould { conditions: self.should.clone(), min_count: count })
        RETURN self

ENUM Condition:
    Field(FieldCondition)
    HasId(Vec<PointId>)
    Nested(NestedCondition)
    Filter(Filter)

STRUCT FieldCondition:
    key: String
    match_value: Option<MatchValue>
    range: Option<Range>
    geo_bounding_box: Option<GeoBoundingBox>
    geo_radius: Option<GeoRadius>
    values_count: Option<ValuesCount>
    is_empty: Option<bool>
    is_null: Option<bool>
```

### 5.2 Filter Builder

```pseudocode
CLASS FilterBuilder:
    filter: Filter

    FUNCTION new() -> Self:
        RETURN Self { filter: Filter::new() }

    FUNCTION field_match(mut self, key: &str, value: impl Into<MatchValue>) -> Self:
        self.filter.must.push(Condition::Field(FieldCondition {
            key: key.to_string(),
            match_value: Some(value.into()),
            ..Default::default()
        }))
        RETURN self

    FUNCTION field_match_any(mut self, key: &str, values: Vec<impl Into<MatchValue>>) -> Self:
        self.filter.must.push(Condition::Field(FieldCondition {
            key: key.to_string(),
            match_value: Some(MatchValue::Keywords(values.into_iter().map(Into::into).collect())),
            ..Default::default()
        }))
        RETURN self

    FUNCTION field_range(mut self, key: &str, range: Range) -> Self:
        self.filter.must.push(Condition::Field(FieldCondition {
            key: key.to_string(),
            range: Some(range),
            ..Default::default()
        }))
        RETURN self

    FUNCTION field_gte(mut self, key: &str, value: f64) -> Self:
        RETURN self.field_range(key, Range { gte: Some(value), ..Default::default() })

    FUNCTION field_lte(mut self, key: &str, value: f64) -> Self:
        RETURN self.field_range(key, Range { lte: Some(value), ..Default::default() })

    FUNCTION field_between(mut self, key: &str, min: f64, max: f64) -> Self:
        RETURN self.field_range(key, Range { gte: Some(min), lte: Some(max), ..Default::default() })

    FUNCTION has_id(mut self, ids: Vec<PointId>) -> Self:
        self.filter.must.push(Condition::HasId(ids))
        RETURN self

    FUNCTION field_exists(mut self, key: &str) -> Self:
        self.filter.must.push(Condition::Field(FieldCondition {
            key: key.to_string(),
            is_empty: Some(false),
            ..Default::default()
        }))
        RETURN self

    FUNCTION field_is_null(mut self, key: &str) -> Self:
        self.filter.must.push(Condition::Field(FieldCondition {
            key: key.to_string(),
            is_null: Some(true),
            ..Default::default()
        }))
        RETURN self

    FUNCTION nested(mut self, key: &str, nested_filter: Filter) -> Self:
        self.filter.must.push(Condition::Nested(NestedCondition {
            key: key.to_string(),
            filter: nested_filter
        }))
        RETURN self

    FUNCTION or(mut self, other: FilterBuilder) -> Self:
        self.filter.should.extend(other.filter.must)
        self.filter.should.extend(other.filter.should)
        RETURN self

    FUNCTION not(mut self, condition: Condition) -> Self:
        self.filter.must_not.push(condition)
        RETURN self

    FUNCTION build(self) -> Filter:
        RETURN self.filter

// Usage example
filter = FilterBuilder::new()
    .field_match("category", "electronics")
    .field_range("price", Range { gte: Some(100.0), lte: Some(500.0) })
    .field_match_any("brand", vec!["apple", "samsung"])
    .build()
```

---

## 6. Payload Operations

### 6.1 Payload Management

```pseudocode
CLASS CollectionClient (continued):

    ASYNC FUNCTION set_payload(self, point_ids: Vec<PointId>, payload: Payload) -> Result<()>:
        span = tracing::span!("qdrant.set_payload",
            collection = self.collection_name,
            points = point_ids.len()
        )

        selector = PointsSelector::Points(PointsIdsList {
            ids: point_ids.into_iter().map(Into::into).collect()
        })

        self.client.inner.set_payload(
            &self.collection_name,
            None,  // wait
            selector,
            payload.into(),
            None   // ordering
        ).await?

        RETURN Ok(())

    ASYNC FUNCTION overwrite_payload(self, point_ids: Vec<PointId>, payload: Payload) -> Result<()>:
        selector = PointsSelector::Points(PointsIdsList {
            ids: point_ids.into_iter().map(Into::into).collect()
        })

        self.client.inner.overwrite_payload(
            &self.collection_name,
            None,
            selector,
            payload.into(),
            None
        ).await?

        RETURN Ok(())

    ASYNC FUNCTION delete_payload(self, point_ids: Vec<PointId>, keys: Vec<String>) -> Result<()>:
        selector = PointsSelector::Points(PointsIdsList {
            ids: point_ids.into_iter().map(Into::into).collect()
        })

        self.client.inner.delete_payload(
            &self.collection_name,
            None,
            selector,
            keys,
            None
        ).await?

        RETURN Ok(())

    ASYNC FUNCTION clear_payload(self, point_ids: Vec<PointId>) -> Result<()>:
        selector = PointsSelector::Points(PointsIdsList {
            ids: point_ids.into_iter().map(Into::into).collect()
        })

        self.client.inner.clear_payload(
            &self.collection_name,
            None,
            selector,
            None
        ).await?

        RETURN Ok(())

    ASYNC FUNCTION create_payload_index(self, field: &str, schema: PayloadIndexType) -> Result<()>:
        self.client.inner.create_field_index(
            &self.collection_name,
            field,
            schema.into(),
            None,  // wait
            None   // ordering
        ).await?

        RETURN Ok(())
```

---

## 7. RAG Support

### 7.1 Semantic Search Helper

```pseudocode
CLASS RagHelper:
    collection: CollectionClient
    default_limit: u64
    score_threshold: Option<f32>

    FUNCTION new(collection: CollectionClient) -> Self:
        RETURN Self {
            collection,
            default_limit: 10,
            score_threshold: Some(0.7)
        }

    ASYNC FUNCTION retrieve(self, query_vector: Vec<f32>, options: RetrieveOptions) -> Result<Vec<RetrievedDocument>>:
        filter = options.filter.unwrap_or_else(|| FilterBuilder::new().build())

        request = SearchRequest::new(query_vector, options.limit.unwrap_or(self.default_limit))
            .with_filter(filter)
            .with_score_threshold(options.score_threshold.unwrap_or(self.score_threshold.unwrap_or(0.0)))

        results = self.collection.search(request).await?

        RETURN results.into_iter()
            .map(|sp| RetrievedDocument {
                id: sp.id.to_string(),
                score: sp.score,
                content: sp.payload.and_then(|p| p.get("content").cloned()),
                metadata: sp.payload
            })
            .collect()

    ASYNC FUNCTION retrieve_with_context(
        self,
        query_vector: Vec<f32>,
        context_window: u32,
        options: RetrieveOptions
    ) -> Result<Vec<RetrievedChunk>>:
        // Get initial results
        results = self.retrieve(query_vector, options).await?

        // For each result, fetch surrounding chunks
        chunks = Vec::new()
        FOR doc IN results:
            chunk_id = doc.metadata.get("chunk_index")
                .and_then(|v| v.as_u64())
                .unwrap_or(0)

            doc_id = doc.metadata.get("document_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")

            // Fetch context window
            context_filter = FilterBuilder::new()
                .field_match("document_id", doc_id)
                .field_range("chunk_index", Range {
                    gte: Some((chunk_id.saturating_sub(context_window as u64)) as f64),
                    lte: Some((chunk_id + context_window as u64) as f64),
                    ..Default::default()
                })
                .build()

            context_results = self.collection.scroll(ScrollOptions {
                filter: Some(context_filter),
                limit: (context_window * 2 + 1) as u32,
                with_payload: true,
                ..Default::default()
            }).await?

            chunks.push(RetrievedChunk {
                main_chunk: doc,
                context_chunks: context_results.points
            })

        RETURN chunks

STRUCT RetrievedDocument:
    id: String
    score: f32
    content: Option<Value>
    metadata: Option<Payload>

STRUCT RetrieveOptions:
    limit: Option<u64>
    filter: Option<Filter>
    score_threshold: Option<f32>
```

---

## 8. Error Handling

```pseudocode
FUNCTION map_grpc_error(status: tonic::Status) -> QdrantError:
    MATCH status.code():
        Code::NotFound =>
            message = status.message()
            IF message.contains("Collection"):
                QdrantError::Collection(CollectionError::NotFound(extract_name(message)))
            ELSE:
                QdrantError::Point(PointError::NotFound)

        Code::AlreadyExists =>
            QdrantError::Collection(CollectionError::AlreadyExists(extract_name(status.message())))

        Code::InvalidArgument =>
            message = status.message()
            IF message.contains("dimension"):
                QdrantError::Point(PointError::VectorDimensionMismatch)
            ELSE IF message.contains("filter"):
                QdrantError::Search(SearchError::InvalidFilter(message.to_string()))
            ELSE:
                QdrantError::Validation(message.to_string())

        Code::PermissionDenied =>
            QdrantError::Auth(AuthError::PermissionDenied)

        Code::Unauthenticated =>
            QdrantError::Auth(AuthError::InvalidApiKey)

        Code::ResourceExhausted =>
            QdrantError::Service(ServiceError::RateLimited)

        Code::Unavailable =>
            QdrantError::Connection(ConnectionError::ServiceUnavailable)

        Code::DeadlineExceeded =>
            QdrantError::Search(SearchError::Timeout)

        Code::Internal =>
            QdrantError::Service(ServiceError::Internal(status.message().to_string()))

        _ =>
            QdrantError::Unknown(status.message().to_string())

FUNCTION is_transient_error(error: &QdrantError) -> bool:
    MATCH error:
        QdrantError::Connection(_) => true
        QdrantError::Service(ServiceError::RateLimited) => true
        QdrantError::Service(ServiceError::ServiceUnavailable) => true
        QdrantError::Search(SearchError::Timeout) => true
        _ => false
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Pseudocode |

---

**Next Phase:** Architecture - Component diagrams, module structure, data flow, and integration patterns.
