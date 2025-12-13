# Qdrant Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/qdrant`

---

## 1. Connection Management Refinements

### 1.1 Connection Pool

```rust
struct ConnectionPool {
    connections: Vec<QdrantConnection>,
    config: PoolConfig,
    health_checker: HealthChecker,
    current_index: AtomicUsize,
}

struct PoolConfig {
    size: usize,
    max_idle_time: Duration,
    health_check_interval: Duration,
}

impl ConnectionPool {
    async fn new(config: QdrantConfig, pool_config: PoolConfig) -> Result<Self> {
        let mut connections = Vec::with_capacity(pool_config.size);

        for _ in 0..pool_config.size {
            let conn = QdrantConnection::new(&config).await?;
            connections.push(conn);
        }

        let health_checker = HealthChecker::new(pool_config.health_check_interval);

        Ok(Self {
            connections,
            config: pool_config,
            health_checker,
            current_index: AtomicUsize::new(0),
        })
    }

    fn get_connection(&self) -> &QdrantConnection {
        // Round-robin selection
        let index = self.current_index.fetch_add(1, Ordering::Relaxed) % self.connections.len();
        &self.connections[index]
    }

    async fn health_check_all(&self) -> Vec<HealthStatus> {
        let futures = self.connections.iter()
            .map(|conn| conn.health_check());

        futures::future::join_all(futures).await
    }

    async fn reconnect_unhealthy(&mut self) {
        for (i, conn) in self.connections.iter_mut().enumerate() {
            if !conn.is_healthy().await {
                tracing::warn!(connection = i, "Reconnecting unhealthy connection");
                match QdrantConnection::new(&self.config).await {
                    Ok(new_conn) => *conn = new_conn,
                    Err(e) => tracing::error!(error = %e, "Failed to reconnect"),
                }
            }
        }
    }
}
```

### 1.2 Automatic Reconnection

```rust
impl QdrantClient {
    async fn execute_with_reconnect<T, F, Fut>(&self, operation: F) -> Result<T>
    where
        F: Fn() -> Fut,
        Fut: Future<Output = Result<T>>,
    {
        match operation().await {
            Ok(result) => Ok(result),
            Err(QdrantError::Connection(ConnectionError::Disconnected)) => {
                tracing::warn!("Connection lost, attempting reconnect");

                // Attempt reconnect
                self.reconnect().await?;

                // Retry operation once
                operation().await
            }
            Err(e) => Err(e),
        }
    }

    async fn reconnect(&self) -> Result<()> {
        let mut inner = self.inner.write().await;
        inner.grpc_client = QdrantClientBuilder::new(&inner.config)
            .build()
            .await?;
        Ok(())
    }
}
```

---

## 2. Batch Operation Refinements

### 2.1 Adaptive Batch Sizing

```rust
struct AdaptiveBatcher {
    min_batch_size: usize,
    max_batch_size: usize,
    current_batch_size: AtomicUsize,
    success_threshold: f64,
    recent_results: RwLock<VecDeque<BatchResult>>,
}

impl AdaptiveBatcher {
    fn new(min: usize, max: usize) -> Self {
        Self {
            min_batch_size: min,
            max_batch_size: max,
            current_batch_size: AtomicUsize::new((min + max) / 2),
            success_threshold: 0.95,
            recent_results: RwLock::new(VecDeque::with_capacity(10)),
        }
    }

    fn record_result(&self, result: BatchResult) {
        let mut results = self.recent_results.write().unwrap();
        if results.len() >= 10 {
            results.pop_front();
        }
        results.push_back(result);

        // Adjust batch size based on success rate
        let success_rate = results.iter()
            .filter(|r| r.success)
            .count() as f64 / results.len() as f64;

        let current = self.current_batch_size.load(Ordering::Relaxed);

        if success_rate >= self.success_threshold && current < self.max_batch_size {
            // Increase batch size
            let new_size = (current * 12 / 10).min(self.max_batch_size);
            self.current_batch_size.store(new_size, Ordering::Relaxed);
        } else if success_rate < 0.8 && current > self.min_batch_size {
            // Decrease batch size
            let new_size = (current * 8 / 10).max(self.min_batch_size);
            self.current_batch_size.store(new_size, Ordering::Relaxed);
        }
    }

    fn get_batch_size(&self) -> usize {
        self.current_batch_size.load(Ordering::Relaxed)
    }
}
```

### 2.2 Parallel Batch Upsert

```rust
impl CollectionClient {
    async fn upsert_parallel(
        &self,
        points: Vec<Point>,
        config: ParallelUpsertConfig,
    ) -> Result<BatchUpsertResult> {
        let batch_size = config.batch_size.unwrap_or(100);
        let concurrency = config.concurrency.unwrap_or(4);

        let batches: Vec<Vec<Point>> = points
            .chunks(batch_size)
            .map(|c| c.to_vec())
            .collect();

        let semaphore = Arc::new(Semaphore::new(concurrency));
        let results = Arc::new(Mutex::new(Vec::new()));
        let errors = Arc::new(Mutex::new(Vec::new()));

        let futures = batches.into_iter().enumerate().map(|(idx, batch)| {
            let sem = semaphore.clone();
            let client = self.clone();
            let results = results.clone();
            let errors = errors.clone();

            async move {
                let _permit = sem.acquire().await?;

                match client.upsert(batch.clone()).await {
                    Ok(result) => {
                        results.lock().await.push((idx, result));
                    }
                    Err(e) => {
                        errors.lock().await.push((idx, batch, e));
                    }
                }

                Ok::<_, QdrantError>(())
            }
        });

        futures::future::try_join_all(futures).await?;

        let results = Arc::try_unwrap(results).unwrap().into_inner();
        let errors = Arc::try_unwrap(errors).unwrap().into_inner();

        Ok(BatchUpsertResult {
            total_points: points.len(),
            successful_batches: results.len(),
            failed_batches: errors.len(),
            errors: errors.into_iter().map(|(idx, _, e)| (idx, e)).collect(),
        })
    }
}

struct ParallelUpsertConfig {
    batch_size: Option<usize>,
    concurrency: Option<usize>,
    retry_failed: bool,
}
```

### 2.3 Batch Search with Result Aggregation

```rust
impl CollectionClient {
    async fn search_many(
        &self,
        queries: Vec<Vec<f32>>,
        config: BatchSearchConfig,
    ) -> Result<Vec<Vec<ScoredPoint>>> {
        // Use native batch search for efficiency
        let requests: Vec<SearchRequest> = queries.into_iter()
            .map(|q| SearchRequest::new(q, config.limit)
                .with_filter(config.filter.clone())
                .with_score_threshold(config.score_threshold))
            .collect();

        let results = self.search_batch(requests).await?;

        // Post-process: deduplicate if requested
        if config.deduplicate {
            return Ok(self.deduplicate_results(results));
        }

        Ok(results)
    }

    fn deduplicate_results(&self, results: Vec<Vec<ScoredPoint>>) -> Vec<Vec<ScoredPoint>> {
        let mut seen: HashSet<String> = HashSet::new();

        results.into_iter()
            .map(|batch| {
                batch.into_iter()
                    .filter(|point| seen.insert(point.id.to_string()))
                    .collect()
            })
            .collect()
    }
}
```

---

## 3. Search Refinements

### 3.1 Hybrid Search (Dense + Sparse)

```rust
impl CollectionClient {
    async fn hybrid_search(
        &self,
        dense_vector: Vec<f32>,
        sparse_vector: SparseVector,
        config: HybridSearchConfig,
    ) -> Result<Vec<ScoredPoint>> {
        // Execute both searches in parallel
        let dense_future = self.search(SearchRequest {
            vector: dense_vector,
            vector_name: Some("dense".to_string()),
            limit: config.limit * 2,  // Over-fetch for fusion
            filter: config.filter.clone(),
            ..Default::default()
        });

        let sparse_future = self.search(SearchRequest {
            vector: sparse_vector.to_vec(),
            vector_name: Some("sparse".to_string()),
            limit: config.limit * 2,
            filter: config.filter.clone(),
            ..Default::default()
        });

        let (dense_results, sparse_results) = tokio::try_join!(dense_future, sparse_future)?;

        // Reciprocal Rank Fusion
        let fused = self.rrf_fusion(
            dense_results,
            sparse_results,
            config.dense_weight,
            config.sparse_weight,
        );

        Ok(fused.into_iter().take(config.limit as usize).collect())
    }

    fn rrf_fusion(
        &self,
        dense: Vec<ScoredPoint>,
        sparse: Vec<ScoredPoint>,
        dense_weight: f32,
        sparse_weight: f32,
    ) -> Vec<ScoredPoint> {
        let k = 60.0;  // RRF constant

        let mut scores: HashMap<String, (f32, Option<ScoredPoint>)> = HashMap::new();

        // Score dense results
        for (rank, point) in dense.into_iter().enumerate() {
            let id = point.id.to_string();
            let rrf_score = dense_weight / (k + rank as f32 + 1.0);
            scores.insert(id, (rrf_score, Some(point)));
        }

        // Add sparse scores
        for (rank, point) in sparse.into_iter().enumerate() {
            let id = point.id.to_string();
            let rrf_score = sparse_weight / (k + rank as f32 + 1.0);

            scores.entry(id.clone())
                .and_modify(|(score, _)| *score += rrf_score)
                .or_insert((rrf_score, Some(point)));
        }

        // Sort by fused score
        let mut results: Vec<_> = scores.into_iter()
            .filter_map(|(_, (score, point))| point.map(|mut p| {
                p.score = score;
                p
            }))
            .collect();

        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());
        results
    }
}

struct HybridSearchConfig {
    limit: u64,
    filter: Option<Filter>,
    dense_weight: f32,   // Default: 0.5
    sparse_weight: f32,  // Default: 0.5
}
```

### 3.2 Multi-Stage Search (Coarse + Fine)

```rust
impl CollectionClient {
    async fn multi_stage_search(
        &self,
        vector: Vec<f32>,
        config: MultiStageConfig,
    ) -> Result<Vec<ScoredPoint>> {
        // Stage 1: Coarse search with lower HNSW ef
        let coarse_results = self.search(SearchRequest {
            vector: vector.clone(),
            limit: config.coarse_limit,
            search_params: Some(SearchParams {
                hnsw_ef: Some(config.coarse_ef),
                ..Default::default()
            }),
            with_vectors: Some(true.into()),
            ..Default::default()
        }).await?;

        if coarse_results.is_empty() {
            return Ok(vec![]);
        }

        // Stage 2: Re-rank with exact scoring
        let candidate_ids: Vec<PointId> = coarse_results.iter()
            .map(|p| p.id.clone())
            .collect();

        // Fetch full vectors for exact distance calculation
        let candidates = self.get(candidate_ids).await?;

        // Calculate exact distances
        let mut scored: Vec<ScoredPoint> = candidates.into_iter()
            .map(|point| {
                let exact_score = self.calculate_exact_score(
                    &vector,
                    point.vector.as_dense().unwrap(),
                    config.distance,
                );
                ScoredPoint {
                    id: point.id,
                    score: exact_score,
                    payload: point.payload,
                    vector: Some(point.vector),
                }
            })
            .collect();

        // Sort by exact score
        scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());

        Ok(scored.into_iter().take(config.final_limit as usize).collect())
    }

    fn calculate_exact_score(&self, a: &[f32], b: &[f32], distance: Distance) -> f32 {
        match distance {
            Distance::Cosine => {
                let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
                let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
                let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
                dot / (norm_a * norm_b)
            }
            Distance::Euclidean => {
                let sum: f32 = a.iter().zip(b).map(|(x, y)| (x - y).powi(2)).sum();
                1.0 / (1.0 + sum.sqrt())
            }
            Distance::Dot => {
                a.iter().zip(b).map(|(x, y)| x * y).sum()
            }
        }
    }
}
```

### 3.3 Search with Diversity (MMR)

```rust
impl CollectionClient {
    async fn search_diverse(
        &self,
        vector: Vec<f32>,
        config: DiverseSearchConfig,
    ) -> Result<Vec<ScoredPoint>> {
        // Over-fetch candidates
        let candidates = self.search(SearchRequest {
            vector: vector.clone(),
            limit: config.candidate_limit,
            with_vectors: Some(true.into()),
            ..Default::default()
        }).await?;

        if candidates.is_empty() {
            return Ok(vec![]);
        }

        // Apply Maximal Marginal Relevance
        let selected = self.mmr_select(
            &vector,
            candidates,
            config.limit as usize,
            config.lambda,
        );

        Ok(selected)
    }

    fn mmr_select(
        &self,
        query: &[f32],
        mut candidates: Vec<ScoredPoint>,
        k: usize,
        lambda: f32,
    ) -> Vec<ScoredPoint> {
        let mut selected: Vec<ScoredPoint> = Vec::with_capacity(k);

        while selected.len() < k && !candidates.is_empty() {
            let mut best_idx = 0;
            let mut best_mmr = f32::NEG_INFINITY;

            for (idx, candidate) in candidates.iter().enumerate() {
                let relevance = candidate.score;

                // Calculate max similarity to already selected
                let max_sim = selected.iter()
                    .map(|s| self.vector_similarity(
                        candidate.vector.as_ref().unwrap().as_dense().unwrap(),
                        s.vector.as_ref().unwrap().as_dense().unwrap(),
                    ))
                    .fold(0.0_f32, |a, b| a.max(b));

                let mmr = lambda * relevance - (1.0 - lambda) * max_sim;

                if mmr > best_mmr {
                    best_mmr = mmr;
                    best_idx = idx;
                }
            }

            selected.push(candidates.remove(best_idx));
        }

        selected
    }

    fn vector_similarity(&self, a: &[f32], b: &[f32]) -> f32 {
        let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
        let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
        let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
        dot / (norm_a * norm_b)
    }
}
```

---

## 4. RAG Refinements

### 4.1 Contextual Chunk Retrieval

```rust
impl RagHelper {
    async fn retrieve_with_context(
        &self,
        query_vector: Vec<f32>,
        config: ContextConfig,
    ) -> Result<Vec<ContextualChunk>> {
        // Get initial matches
        let results = self.collection.search(SearchRequest {
            vector: query_vector,
            limit: config.initial_limit,
            filter: config.filter.clone(),
            with_payload: PayloadSelector::All.into(),
            ..Default::default()
        }).await?;

        let mut contextual_chunks = Vec::new();

        for result in results {
            let doc_id = result.payload.as_ref()
                .and_then(|p| p.get("document_id"))
                .and_then(|v| v.as_str())
                .unwrap_or_default();

            let chunk_idx = result.payload.as_ref()
                .and_then(|p| p.get("chunk_index"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;

            // Fetch surrounding chunks
            let context_filter = FilterBuilder::new()
                .field_match("document_id", doc_id)
                .field_between(
                    "chunk_index",
                    (chunk_idx - config.context_before as i32) as f64,
                    (chunk_idx + config.context_after as i32) as f64,
                )
                .build();

            let context = self.collection.scroll(ScrollOptions {
                filter: Some(context_filter),
                limit: (config.context_before + config.context_after + 1) as u32,
                with_payload: true,
                order_by: Some("chunk_index".to_string()),
                ..Default::default()
            }).await?;

            contextual_chunks.push(ContextualChunk {
                main_chunk: result,
                context_chunks: context.points,
                document_id: doc_id.to_string(),
            });
        }

        Ok(contextual_chunks)
    }
}

struct ContextConfig {
    initial_limit: u64,
    context_before: usize,
    context_after: usize,
    filter: Option<Filter>,
}

struct ContextualChunk {
    main_chunk: ScoredPoint,
    context_chunks: Vec<Point>,
    document_id: String,
}
```

### 4.2 Document-Level Aggregation

```rust
impl RagHelper {
    async fn retrieve_documents(
        &self,
        query_vector: Vec<f32>,
        config: DocumentRetrievalConfig,
    ) -> Result<Vec<RetrievedDocument>> {
        // Search for chunks
        let chunk_results = self.collection.search(SearchRequest {
            vector: query_vector,
            limit: config.chunk_limit,
            filter: config.filter.clone(),
            ..Default::default()
        }).await?;

        // Group by document
        let mut doc_scores: HashMap<String, (f32, Vec<ScoredPoint>)> = HashMap::new();

        for chunk in chunk_results {
            let doc_id = chunk.payload.as_ref()
                .and_then(|p| p.get("document_id"))
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();

            doc_scores.entry(doc_id)
                .and_modify(|(score, chunks)| {
                    // Aggregate score (max or sum based on config)
                    match config.aggregation {
                        ScoreAggregation::Max => *score = score.max(chunk.score),
                        ScoreAggregation::Sum => *score += chunk.score,
                        ScoreAggregation::Avg => {
                            *score = (*score * chunks.len() as f32 + chunk.score)
                                / (chunks.len() + 1) as f32;
                        }
                    }
                    chunks.push(chunk);
                })
                .or_insert((chunk.score, vec![chunk]));
        }

        // Sort documents by aggregated score
        let mut documents: Vec<_> = doc_scores.into_iter()
            .map(|(doc_id, (score, chunks))| RetrievedDocument {
                document_id: doc_id,
                score,
                chunks,
            })
            .collect();

        documents.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());

        Ok(documents.into_iter().take(config.document_limit).collect())
    }
}

enum ScoreAggregation {
    Max,
    Sum,
    Avg,
}
```

---

## 5. Filter Refinements

### 5.1 Complex Filter Composition

```rust
impl FilterBuilder {
    /// Combine multiple filters with OR
    fn any_of(filters: Vec<Filter>) -> Filter {
        Filter {
            should: filters.into_iter()
                .map(Condition::Filter)
                .collect(),
            ..Default::default()
        }
    }

    /// Combine multiple filters with AND
    fn all_of(filters: Vec<Filter>) -> Filter {
        Filter {
            must: filters.into_iter()
                .map(Condition::Filter)
                .collect(),
            ..Default::default()
        }
    }

    /// Date range helper
    fn date_range(mut self, field: &str, start: DateTime<Utc>, end: DateTime<Utc>) -> Self {
        self.filter.must.push(Condition::Field(FieldCondition {
            key: field.to_string(),
            range: Some(Range {
                gte: Some(start.timestamp() as f64),
                lte: Some(end.timestamp() as f64),
                ..Default::default()
            }),
            ..Default::default()
        }));
        self
    }

    /// Text contains (for indexed text fields)
    fn text_contains(mut self, field: &str, text: &str) -> Self {
        self.filter.must.push(Condition::Field(FieldCondition {
            key: field.to_string(),
            match_value: Some(MatchValue::Text(text.to_string())),
            ..Default::default()
        }));
        self
    }

    /// Geo distance filter
    fn within_radius(mut self, field: &str, lat: f64, lon: f64, radius_m: f64) -> Self {
        self.filter.must.push(Condition::Field(FieldCondition {
            key: field.to_string(),
            geo_radius: Some(GeoRadius {
                center: GeoPoint { lat, lon },
                radius: radius_m,
            }),
            ..Default::default()
        }));
        self
    }

    /// Array contains any
    fn array_contains_any(mut self, field: &str, values: Vec<String>) -> Self {
        self.filter.should.extend(values.into_iter().map(|v| {
            Condition::Field(FieldCondition {
                key: field.to_string(),
                match_value: Some(MatchValue::Keyword(v)),
                ..Default::default()
            })
        }));
        self.filter.min_should = Some(MinShould {
            min_count: 1,
            conditions: self.filter.should.clone(),
        });
        self
    }
}
```

### 5.2 Filter Validation

```rust
impl FilterBuilder {
    fn validate(&self) -> Result<()> {
        self.validate_filter(&self.filter)
    }

    fn validate_filter(&self, filter: &Filter) -> Result<()> {
        // Check for empty filter
        if filter.must.is_empty() && filter.should.is_empty() && filter.must_not.is_empty() {
            return Err(QdrantError::Validation("Empty filter".to_string()));
        }

        // Validate each condition
        for condition in &filter.must {
            self.validate_condition(condition)?;
        }
        for condition in &filter.should {
            self.validate_condition(condition)?;
        }
        for condition in &filter.must_not {
            self.validate_condition(condition)?;
        }

        Ok(())
    }

    fn validate_condition(&self, condition: &Condition) -> Result<()> {
        match condition {
            Condition::Field(fc) => {
                if fc.key.is_empty() {
                    return Err(QdrantError::Validation("Empty field key".to_string()));
                }
                // Check for conflicting conditions
                let conditions_set = [
                    fc.match_value.is_some(),
                    fc.range.is_some(),
                    fc.geo_radius.is_some(),
                    fc.geo_bounding_box.is_some(),
                ].iter().filter(|&&x| x).count();

                if conditions_set > 1 {
                    return Err(QdrantError::Validation(
                        format!("Field {} has multiple condition types", fc.key)
                    ));
                }
            }
            Condition::Filter(nested) => {
                self.validate_filter(nested)?;
            }
            _ => {}
        }
        Ok(())
    }
}
```

---

## 6. Testing Refinements

### 6.1 Mock Client

```rust
struct MockQdrantClient {
    collections: Arc<RwLock<HashMap<String, MockCollection>>>,
    operation_log: Arc<RwLock<Vec<Operation>>>,
    latency_simulator: Option<LatencySimulator>,
}

struct MockCollection {
    config: CollectionConfig,
    points: HashMap<PointId, Point>,
}

impl MockQdrantClient {
    fn new() -> Self {
        Self {
            collections: Arc::new(RwLock::new(HashMap::new())),
            operation_log: Arc::new(RwLock::new(Vec::new())),
            latency_simulator: None,
        }
    }

    fn with_simulated_latency(mut self, base_ms: u64, variance_ms: u64) -> Self {
        self.latency_simulator = Some(LatencySimulator { base_ms, variance_ms });
        self
    }

    async fn search(&self, collection: &str, request: SearchRequest) -> Result<Vec<ScoredPoint>> {
        self.simulate_latency().await;

        let collections = self.collections.read().await;
        let coll = collections.get(collection)
            .ok_or(QdrantError::Collection(CollectionError::NotFound))?;

        // Simulate vector search with brute force
        let mut scored: Vec<ScoredPoint> = coll.points.values()
            .filter(|p| self.matches_filter(p, &request.filter))
            .map(|p| ScoredPoint {
                id: p.id.clone(),
                score: self.cosine_similarity(&request.vector, p.vector.as_dense().unwrap()),
                payload: p.payload.clone(),
                vector: None,
            })
            .collect();

        scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());

        if let Some(threshold) = request.score_threshold {
            scored.retain(|p| p.score >= threshold);
        }

        Ok(scored.into_iter().take(request.limit as usize).collect())
    }

    fn matches_filter(&self, point: &Point, filter: &Option<Filter>) -> bool {
        match filter {
            None => true,
            Some(f) => self.evaluate_filter(point, f),
        }
    }

    fn evaluate_filter(&self, point: &Point, filter: &Filter) -> bool {
        // All must conditions must match
        let must_match = filter.must.iter().all(|c| self.evaluate_condition(point, c));
        // At least one should condition must match (if any)
        let should_match = filter.should.is_empty() ||
            filter.should.iter().any(|c| self.evaluate_condition(point, c));
        // No must_not condition should match
        let must_not_match = filter.must_not.iter().all(|c| !self.evaluate_condition(point, c));

        must_match && should_match && must_not_match
    }

    async fn simulate_latency(&self) {
        if let Some(sim) = &self.latency_simulator {
            let latency = sim.base_ms + rand::random::<u64>() % sim.variance_ms;
            tokio::time::sleep(Duration::from_millis(latency)).await;
        }
    }
}
```

### 6.2 Property-Based Tests

```rust
#[cfg(test)]
mod property_tests {
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn filter_builder_valid(
            field in "[a-z_]+",
            value in any::<i64>(),
        ) {
            let filter = FilterBuilder::new()
                .field_match(&field, value)
                .build();

            prop_assert!(!filter.must.is_empty());
            prop_assert!(FilterBuilder::from(filter).validate().is_ok());
        }

        #[test]
        fn search_results_ordered_by_score(
            vectors in prop::collection::vec(
                prop::collection::vec(-1.0f32..1.0, 128),
                1..100
            ),
            query in prop::collection::vec(-1.0f32..1.0, 128),
        ) {
            let mock = MockQdrantClient::new();
            // Setup collection with vectors
            // ...

            let results = mock.search("test", SearchRequest::new(query, 10))
                .await
                .unwrap();

            // Verify descending score order
            for window in results.windows(2) {
                prop_assert!(window[0].score >= window[1].score);
            }
        }

        #[test]
        fn batch_upsert_preserves_all_points(
            points in prop::collection::vec(
                (any::<u64>(), prop::collection::vec(-1.0f32..1.0, 128)),
                1..500
            ),
        ) {
            let points: Vec<Point> = points.into_iter()
                .map(|(id, vec)| Point::new(PointId::Num(id), vec))
                .collect();

            let original_count = points.len();

            // Batch should preserve count
            let batches: Vec<_> = points.chunks(100).collect();
            let reconstructed_count: usize = batches.iter().map(|b| b.len()).sum();

            prop_assert_eq!(original_count, reconstructed_count);
        }
    }
}
```

---

## 7. Configuration Refinements

### 7.1 Environment-Based Configuration

```rust
impl QdrantConfig {
    pub fn from_env() -> Result<Self> {
        // Support both QDRANT_URL and separate host/port
        let (host, port, tls) = if let Ok(url) = env::var("QDRANT_URL") {
            Self::parse_url(&url)?
        } else {
            (
                env::var("QDRANT_HOST").unwrap_or_else(|_| "localhost".to_string()),
                env::var("QDRANT_PORT")
                    .ok()
                    .and_then(|p| p.parse().ok())
                    .unwrap_or(6334),
                env::var("QDRANT_TLS").map(|v| v == "true").unwrap_or(false),
            )
        };

        Ok(Self {
            host,
            port,
            api_key: env::var("QDRANT_API_KEY").ok().map(SecretString::new),
            tls_enabled: tls || env::var("QDRANT_API_KEY").is_ok(),
            ca_cert: env::var("QDRANT_CA_CERT").ok().map(PathBuf::from),
            verify_tls: env::var("QDRANT_VERIFY_TLS")
                .map(|v| v != "false")
                .unwrap_or(true),
            timeout: Duration::from_secs(
                env::var("QDRANT_TIMEOUT_SECS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(30)
            ),
            max_retries: env::var("QDRANT_MAX_RETRIES")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(3),
            connection_pool_size: env::var("QDRANT_POOL_SIZE")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(10),
        })
    }

    fn parse_url(url: &str) -> Result<(String, u16, bool)> {
        let parsed = Url::parse(url)?;
        let host = parsed.host_str()
            .ok_or(QdrantError::Config("Invalid URL: no host"))?
            .to_string();
        let port = parsed.port().unwrap_or(6334);
        let tls = parsed.scheme() == "https";
        Ok((host, port, tls))
    }
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Refinement |

---

**Next Phase:** Completion - Implementation tasks, test coverage, deployment checklist, and operational runbooks.
