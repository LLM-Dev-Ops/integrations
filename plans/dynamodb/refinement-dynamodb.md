# DynamoDB Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/dynamodb`

---

## 1. Hot Partition Handling

### 1.1 Write Sharding Pattern

```rust
/// Shard key prefix for high-cardinality partitions
struct ShardedKey {
    base_key: String,
    shard_count: u32,
}

impl ShardedKey {
    fn new(base_key: &str, shard_count: u32) -> Self {
        Self {
            base_key: base_key.to_string(),
            shard_count,
        }
    }

    /// Generate sharded key for writes (random distribution)
    fn write_key(&self) -> String {
        let shard = rand::random::<u32>() % self.shard_count;
        format!("{}#SHARD#{}", self.base_key, shard)
    }

    /// Generate all shard keys for scatter-gather reads
    fn read_keys(&self) -> Vec<String> {
        (0..self.shard_count)
            .map(|shard| format!("{}#SHARD#{}", self.base_key, shard))
            .collect()
    }
}

impl TableClient {
    /// Write to sharded partition
    async fn put_item_sharded<T: Serialize>(
        &self,
        sharded_key: &ShardedKey,
        sort_key: &str,
        item: &T,
    ) -> Result<()> {
        let pk = sharded_key.write_key();
        let mut item_map = serde_dynamo::to_item(item)?;
        item_map.insert(self.pk_name.clone(), AttributeValue::S(pk));
        item_map.insert(self.sk_name.clone().unwrap(), AttributeValue::S(sort_key.to_string()));

        self.put_item_raw(item_map).await
    }

    /// Query across all shards (scatter-gather)
    async fn query_sharded<T: DeserializeOwned>(
        &self,
        sharded_key: &ShardedKey,
        sk_condition: Option<SortKeyCondition>,
    ) -> Result<Vec<T>> {
        let queries = sharded_key.read_keys().into_iter().map(|pk| {
            let mut builder = self.query_builder().partition_key(pk);
            if let Some(ref cond) = sk_condition {
                builder = builder.sort_key_condition(cond.clone());
            }
            builder.execute::<T>()
        });

        let results = futures::future::try_join_all(queries).await?;
        Ok(results.into_iter().flat_map(|r| r.items).collect())
    }
}
```

### 1.2 Adaptive Capacity Monitoring

```rust
struct CapacityMonitor {
    table_name: String,
    window: Duration,
    samples: RwLock<VecDeque<CapacitySample>>,
    throttle_threshold: f64,
}

struct CapacitySample {
    timestamp: Instant,
    consumed_rcu: f64,
    consumed_wcu: f64,
    throttled: bool,
}

impl CapacityMonitor {
    fn record_operation(&self, consumed: &ConsumedCapacity, throttled: bool) {
        let sample = CapacitySample {
            timestamp: Instant::now(),
            consumed_rcu: consumed.read_capacity_units.unwrap_or(0.0),
            consumed_wcu: consumed.write_capacity_units.unwrap_or(0.0),
            throttled,
        };

        let mut samples = self.samples.write().unwrap();
        samples.push_back(sample);

        // Trim old samples
        let cutoff = Instant::now() - self.window;
        while samples.front().map(|s| s.timestamp < cutoff).unwrap_or(false) {
            samples.pop_front();
        }
    }

    fn throttle_rate(&self) -> f64 {
        let samples = self.samples.read().unwrap();
        if samples.is_empty() {
            return 0.0;
        }

        let throttled_count = samples.iter().filter(|s| s.throttled).count();
        throttled_count as f64 / samples.len() as f64
    }

    fn should_backoff(&self) -> bool {
        self.throttle_rate() > self.throttle_threshold
    }

    fn average_consumed(&self) -> (f64, f64) {
        let samples = self.samples.read().unwrap();
        if samples.is_empty() {
            return (0.0, 0.0);
        }

        let total_rcu: f64 = samples.iter().map(|s| s.consumed_rcu).sum();
        let total_wcu: f64 = samples.iter().map(|s| s.consumed_wcu).sum();
        let count = samples.len() as f64;

        (total_rcu / count, total_wcu / count)
    }
}
```

---

## 2. Conditional Expression Patterns

### 2.1 Optimistic Locking

```rust
struct VersionedItem<T> {
    data: T,
    version: u64,
}

impl TableClient {
    /// Put item only if version matches (optimistic lock)
    async fn put_versioned<T: Serialize>(
        &self,
        key: Key,
        item: &T,
        expected_version: u64,
    ) -> Result<u64> {
        let new_version = expected_version + 1;
        let mut item_map = serde_dynamo::to_item(item)?;
        item_map.insert("version".to_string(), AttributeValue::N(new_version.to_string()));

        let options = PutItemOptions {
            condition_expression: Some("version = :expected".to_string()),
            expression_values: [(":expected".to_string(), AttributeValue::N(expected_version.to_string()))].into(),
            ..Default::default()
        };

        self.put_item_with_options(&item_map, options).await?;
        Ok(new_version)
    }

    /// Update with optimistic locking
    async fn update_versioned(
        &self,
        key: Key,
        update: UpdateExpression,
        expected_version: u64,
    ) -> Result<u64> {
        let new_version = expected_version + 1;

        let mut update = update
            .set("version", new_version);

        let options = UpdateItemOptions {
            condition_expression: Some("version = :expected_version".to_string()),
            expression_values: [(":expected_version".to_string(),
                AttributeValue::N(expected_version.to_string()))].into(),
            return_new_values: true,
            ..Default::default()
        };

        let result = self.update_item_with_options(key, update, options).await?;
        Ok(new_version)
    }

    /// Retry update with version conflict handling
    async fn update_with_retry<T, F>(
        &self,
        key: Key,
        max_retries: u32,
        update_fn: F,
    ) -> Result<T>
    where
        F: Fn(&T) -> UpdateExpression,
        T: DeserializeOwned + Clone,
    {
        let mut attempts = 0;

        loop {
            // Get current item with version
            let current: VersionedItem<T> = self.get_item(key.clone()).await?
                .ok_or(DynamoDbError::ItemNotFound)?;

            let update = update_fn(&current.data);

            match self.update_versioned(key.clone(), update, current.version).await {
                Ok(_) => {
                    let updated: T = self.get_item(key).await?.unwrap();
                    return Ok(updated);
                }
                Err(DynamoDbError::ConditionalCheck(_)) if attempts < max_retries => {
                    attempts += 1;
                    let delay = Duration::from_millis(50 * 2_u64.pow(attempts));
                    tokio::time::sleep(delay).await;
                }
                Err(e) => return Err(e),
            }
        }
    }
}
```

### 2.2 Conditional Expression Builder

```rust
struct ConditionBuilder {
    expressions: Vec<String>,
    names: HashMap<String, String>,
    values: HashMap<String, AttributeValue>,
}

impl ConditionBuilder {
    fn new() -> Self {
        Self {
            expressions: Vec::new(),
            names: HashMap::new(),
            values: HashMap::new(),
        }
    }

    fn attribute_exists(mut self, attr: &str) -> Self {
        let name_key = format!("#{}", attr);
        self.expressions.push(format!("attribute_exists({})", name_key));
        self.names.insert(name_key, attr.to_string());
        self
    }

    fn attribute_not_exists(mut self, attr: &str) -> Self {
        let name_key = format!("#{}", attr);
        self.expressions.push(format!("attribute_not_exists({})", name_key));
        self.names.insert(name_key, attr.to_string());
        self
    }

    fn equals(mut self, attr: &str, value: impl Into<AttributeValue>) -> Self {
        let name_key = format!("#{}", attr);
        let value_key = format!(":{}", attr);
        self.expressions.push(format!("{} = {}", name_key, value_key));
        self.names.insert(name_key, attr.to_string());
        self.values.insert(value_key, value.into());
        self
    }

    fn less_than(mut self, attr: &str, value: impl Into<AttributeValue>) -> Self {
        let name_key = format!("#{}", attr);
        let value_key = format!(":{}_lt", attr);
        self.expressions.push(format!("{} < {}", name_key, value_key));
        self.names.insert(name_key, attr.to_string());
        self.values.insert(value_key, value.into());
        self
    }

    fn contains(mut self, attr: &str, value: &str) -> Self {
        let name_key = format!("#{}", attr);
        let value_key = format!(":{}_contains", attr);
        self.expressions.push(format!("contains({}, {})", name_key, value_key));
        self.names.insert(name_key, attr.to_string());
        self.values.insert(value_key, AttributeValue::S(value.to_string()));
        self
    }

    fn and(mut self, other: ConditionBuilder) -> Self {
        if !self.expressions.is_empty() && !other.expressions.is_empty() {
            let combined = format!(
                "({}) AND ({})",
                self.expressions.join(" AND "),
                other.expressions.join(" AND ")
            );
            self.expressions = vec![combined];
        } else {
            self.expressions.extend(other.expressions);
        }
        self.names.extend(other.names);
        self.values.extend(other.values);
        self
    }

    fn or(mut self, other: ConditionBuilder) -> Self {
        if !self.expressions.is_empty() && !other.expressions.is_empty() {
            let combined = format!(
                "({}) OR ({})",
                self.expressions.join(" AND "),
                other.expressions.join(" AND ")
            );
            self.expressions = vec![combined];
        }
        self.names.extend(other.names);
        self.values.extend(other.values);
        self
    }

    fn build(self) -> ConditionExpression {
        ConditionExpression {
            expression: self.expressions.join(" AND "),
            names: self.names,
            values: self.values,
        }
    }
}

// Usage
let condition = ConditionBuilder::new()
    .attribute_exists("PK")
    .equals("status", "active")
    .less_than("retry_count", 3)
    .build();
```

---

## 3. Transaction Refinements

### 3.1 Idempotent Transactions

```rust
impl TransactionBuilder {
    /// Create idempotent transaction with client token
    fn with_idempotency(mut self, operation_id: &str) -> Self {
        // Generate deterministic token from operation ID
        let token = format!("{}_{}", operation_id, self.compute_content_hash());
        self.client_request_token = Some(token);
        self
    }

    fn compute_content_hash(&self) -> String {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();

        for op in &self.operations {
            hasher.update(format!("{:?}", op).as_bytes());
        }

        format!("{:x}", hasher.finalize())[..16].to_string()
    }
}

impl DynamoDbClient {
    /// Execute transaction with automatic idempotency
    async fn transact_write_idempotent(
        &self,
        operation_id: &str,
        operations: Vec<TransactWriteItem>,
    ) -> Result<()> {
        let builder = TransactionBuilder::new(self)
            .with_operations(operations)
            .with_idempotency(operation_id);

        match builder.execute().await {
            Ok(()) => Ok(()),
            Err(DynamoDbError::Transaction(TransactionError::IdempotentParameterMismatch)) => {
                // Same token, different content - this is a bug
                Err(DynamoDbError::Transaction(TransactionError::IdempotentParameterMismatch))
            }
            Err(e) => Err(e),
        }
    }
}
```

### 3.2 Transaction Conflict Handling

```rust
impl TransactionBuilder {
    async fn execute_with_conflict_retry(self, max_retries: u32) -> Result<()> {
        let mut attempts = 0;

        loop {
            match self.clone().execute().await {
                Ok(()) => return Ok(()),
                Err(DynamoDbError::Transaction(TransactionError::TransactionConflict))
                    if attempts < max_retries =>
                {
                    attempts += 1;
                    // Exponential backoff with jitter
                    let delay = Duration::from_millis(100 * 2_u64.pow(attempts))
                        + Duration::from_millis(rand::random::<u64>() % 50);

                    tracing::warn!(
                        attempt = attempts,
                        max_retries = max_retries,
                        "Transaction conflict, retrying"
                    );

                    tokio::time::sleep(delay).await;
                }
                Err(e) => return Err(e),
            }
        }
    }
}

/// Parse transaction cancellation reasons
fn parse_cancellation_reasons(error: &TransactionCanceledException) -> Vec<CancellationReason> {
    error.cancellation_reasons
        .as_ref()
        .map(|reasons| {
            reasons.iter().map(|r| {
                CancellationReason {
                    code: r.code.clone(),
                    message: r.message.clone(),
                    item: r.item.clone(),
                }
            }).collect()
        })
        .unwrap_or_default()
}
```

---

## 4. TTL Management

### 4.1 TTL Helpers

```rust
struct TtlConfig {
    attribute_name: String,
    default_duration: Option<Duration>,
}

impl TableClient {
    fn with_ttl(mut self, attribute_name: &str, default_duration: Option<Duration>) -> Self {
        self.ttl_config = Some(TtlConfig {
            attribute_name: attribute_name.to_string(),
            default_duration,
        });
        self
    }

    /// Put item with TTL
    async fn put_item_with_ttl<T: Serialize>(
        &self,
        item: &T,
        ttl_duration: Duration,
    ) -> Result<()> {
        let ttl_config = self.ttl_config.as_ref()
            .ok_or(DynamoDbError::Configuration("TTL not configured".into()))?;

        let ttl_timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() + ttl_duration.as_secs();

        let mut item_map = serde_dynamo::to_item(item)?;
        item_map.insert(
            ttl_config.attribute_name.clone(),
            AttributeValue::N(ttl_timestamp.to_string()),
        );

        self.put_item_raw(item_map).await
    }

    /// Filter out expired items (for consistency before TTL cleanup)
    fn filter_expired<T>(items: Vec<T>, ttl_attr: &str) -> Vec<T>
    where
        T: HasTtl,
    {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        items.into_iter()
            .filter(|item| {
                item.get_ttl()
                    .map(|ttl| ttl > now)
                    .unwrap_or(true) // Keep items without TTL
            })
            .collect()
    }
}

trait HasTtl {
    fn get_ttl(&self) -> Option<u64>;
}
```

### 4.2 TTL-Based Cleanup Patterns

```rust
impl TableClient {
    /// Query with TTL filter to exclude soon-to-expire items
    async fn query_active<T: DeserializeOwned + HasTtl>(
        &self,
        pk: impl Into<AttributeValue>,
        min_remaining_ttl: Duration,
    ) -> Result<Vec<T>> {
        let min_ttl = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() + min_remaining_ttl.as_secs();

        let ttl_attr = self.ttl_config.as_ref()
            .map(|c| c.attribute_name.clone())
            .unwrap_or_else(|| "ttl".to_string());

        let items: Vec<T> = self.query_builder()
            .partition_key(pk)
            .filter(&format!("#{} > :min_ttl OR attribute_not_exists(#{})",
                ttl_attr, ttl_attr))
            .expression_name(&format!("#{}", ttl_attr), &ttl_attr)
            .expression_value(":min_ttl", AttributeValue::N(min_ttl.to_string()))
            .execute()
            .await?
            .items;

        Ok(items)
    }
}
```

---

## 5. Batch Operation Refinements

### 5.1 Unprocessed Item Retry

```rust
impl TableClient {
    async fn batch_write_with_retry(
        &self,
        operations: Vec<WriteRequest>,
        max_retries: u32,
    ) -> Result<BatchWriteReport> {
        let mut remaining = operations;
        let mut total_processed = 0;
        let mut attempts = 0;

        while !remaining.is_empty() && attempts <= max_retries {
            // Chunk into batches of 25
            let chunks: Vec<Vec<WriteRequest>> = remaining
                .chunks(25)
                .map(|c| c.to_vec())
                .collect();

            let mut next_remaining = Vec::new();

            for chunk in chunks {
                let result = self.batch_write(chunk.clone()).await?;
                total_processed += result.processed_count;

                if result.unprocessed_count > 0 {
                    // Extract unprocessed items
                    if let Some(unprocessed) = result.unprocessed_items {
                        next_remaining.extend(unprocessed);
                    }
                }
            }

            if !next_remaining.is_empty() {
                attempts += 1;

                if attempts <= max_retries {
                    // Exponential backoff
                    let delay = Duration::from_millis(50 * 2_u64.pow(attempts));
                    tracing::warn!(
                        unprocessed = next_remaining.len(),
                        attempt = attempts,
                        "Retrying unprocessed items"
                    );
                    tokio::time::sleep(delay).await;
                }
            }

            remaining = next_remaining;
        }

        Ok(BatchWriteReport {
            total_processed,
            unprocessed_count: remaining.len(),
            unprocessed_items: if remaining.is_empty() { None } else { Some(remaining) },
        })
    }
}
```

### 5.2 Parallel Batch Processing

```rust
impl TableClient {
    /// Process large batch with parallel execution
    async fn batch_write_parallel<T: Serialize + Send + Sync>(
        &self,
        items: Vec<T>,
        concurrency: usize,
    ) -> Result<BatchWriteReport> {
        let semaphore = Arc::new(Semaphore::new(concurrency));
        let chunks: Vec<Vec<T>> = items
            .chunks(25)
            .map(|c| c.to_vec())
            .collect();

        let futures = chunks.into_iter().map(|chunk| {
            let sem = semaphore.clone();
            let table = self.clone();

            async move {
                let _permit = sem.acquire().await?;
                table.batch_put(chunk).await
            }
        });

        let results = futures::future::try_join_all(futures).await?;

        let total_processed: usize = results.iter().map(|r| r.processed_count).sum();
        let total_unprocessed: usize = results.iter().map(|r| r.unprocessed_count).sum();

        Ok(BatchWriteReport {
            total_processed,
            unprocessed_count: total_unprocessed,
            unprocessed_items: None, // Would need to aggregate
        })
    }
}
```

---

## 6. Query Refinements

### 6.1 Efficient Pagination

```rust
impl<T: DeserializeOwned> QueryPaginator<T> {
    /// Collect with limit across pages
    async fn collect_limit(&mut self, limit: usize) -> Result<Vec<T>> {
        let mut results = Vec::with_capacity(limit);

        while results.len() < limit {
            match self.next_page().await? {
                Some(page) => {
                    let remaining = limit - results.len();
                    results.extend(page.items.into_iter().take(remaining));
                }
                None => break,
            }
        }

        Ok(results)
    }

    /// Process pages in parallel (when order doesn't matter)
    async fn process_parallel<F, Fut, R>(
        &mut self,
        concurrency: usize,
        processor: F,
    ) -> Result<Vec<R>>
    where
        F: Fn(Vec<T>) -> Fut + Clone + Send + Sync,
        Fut: Future<Output = Result<Vec<R>>> + Send,
        R: Send,
    {
        let semaphore = Arc::new(Semaphore::new(concurrency));
        let mut handles = Vec::new();

        while let Some(page) = self.next_page().await? {
            let sem = semaphore.clone();
            let proc = processor.clone();
            let items = page.items;

            let handle = tokio::spawn(async move {
                let _permit = sem.acquire().await.unwrap();
                proc(items).await
            });

            handles.push(handle);
        }

        let results = futures::future::try_join_all(handles).await?;
        Ok(results.into_iter()
            .collect::<Result<Vec<_>>>()?
            .into_iter()
            .flatten()
            .collect())
    }
}
```

### 6.2 Consistent Read Patterns

```rust
impl QueryBuilder {
    /// Enable strongly consistent reads
    fn strongly_consistent(mut self) -> Self {
        self.consistent_read = true;
        self
    }

    /// Read-after-write consistency helper
    async fn execute_after_write<T: DeserializeOwned>(
        self,
        write_timestamp: Instant,
        min_delay: Duration,
    ) -> Result<QueryResult<T>> {
        // Ensure minimum delay after write for eventual consistency
        let elapsed = write_timestamp.elapsed();
        if elapsed < min_delay {
            tokio::time::sleep(min_delay - elapsed).await;
        }

        self.strongly_consistent().execute().await
    }
}
```

---

## 7. Testing Refinements

### 7.1 Mock Scenarios

```rust
#[cfg(test)]
mod tests {
    fn throttling_scenarios() -> Vec<MockScenario> {
        vec![
            MockScenario {
                name: "throttle_then_succeed",
                responses: vec![
                    MockResponse::throttle(),
                    MockResponse::throttle(),
                    MockResponse::success(item!({ "PK": "test" })),
                ],
                expected: ExpectedBehavior::SuccessAfterRetries(2),
            },
            MockScenario {
                name: "max_throttle_exceeded",
                responses: vec![MockResponse::throttle(); 15],
                expected: ExpectedBehavior::FailWith(DynamoDbError::Throughput(_)),
            },
        ]
    }

    fn conditional_scenarios() -> Vec<MockScenario> {
        vec![
            MockScenario {
                name: "condition_failed",
                responses: vec![MockResponse::condition_failed()],
                expected: ExpectedBehavior::FailWith(DynamoDbError::ConditionalCheck(_)),
            },
            MockScenario {
                name: "optimistic_lock_retry",
                responses: vec![
                    MockResponse::condition_failed(),
                    MockResponse::success(item!({ "version": 2 })),
                ],
                expected: ExpectedBehavior::SuccessAfterRetries(1),
            },
        ]
    }

    fn transaction_scenarios() -> Vec<MockScenario> {
        vec![
            MockScenario {
                name: "transaction_conflict_retry",
                responses: vec![
                    MockResponse::transaction_conflict(),
                    MockResponse::success_empty(),
                ],
                expected: ExpectedBehavior::SuccessAfterRetries(1),
            },
            MockScenario {
                name: "transaction_canceled_no_retry",
                responses: vec![MockResponse::transaction_canceled(vec![
                    CancellationReason::condition_check_failed("Item 0"),
                ])],
                expected: ExpectedBehavior::FailWith(DynamoDbError::Transaction(_)),
            },
        ]
    }
}
```

### 7.2 Property-Based Tests

```rust
#[cfg(test)]
mod property_tests {
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn key_serialization_roundtrip(
            pk in "[A-Z]{3,10}#[a-z0-9]{5,20}",
            sk in proptest::option::of("[A-Z]{3,10}#[a-z0-9]{5,20}"),
        ) {
            let key = Key::new(pk.clone());
            let key = match sk {
                Some(s) => key.with_sort_key(s.clone()),
                None => key,
            };

            let map = key.to_key_map("PK", Some("SK"));
            let reconstructed = Key::from_map(&map, "PK", Some("SK"))?;

            prop_assert_eq!(key, reconstructed);
        }

        #[test]
        fn update_expression_valid(
            attrs in prop::collection::vec("[a-z_]{1,20}", 1..5),
            values in prop::collection::vec(any::<i64>(), 1..5),
        ) {
            let mut expr = UpdateExpression::new();

            for (attr, value) in attrs.iter().zip(values.iter()) {
                expr = expr.set(attr, *value);
            }

            // Expression should be valid DynamoDB syntax
            prop_assert!(expr.expression.starts_with("SET "));
            prop_assert_eq!(expr.names.len(), attrs.len());
            prop_assert_eq!(expr.values.len(), values.len());
        }

        #[test]
        fn batch_chunking_preserves_items(
            items in prop::collection::vec(any::<u32>(), 0..200),
        ) {
            let chunks: Vec<Vec<u32>> = items.chunks(25)
                .map(|c| c.to_vec())
                .collect();

            let reconstructed: Vec<u32> = chunks.into_iter().flatten().collect();
            prop_assert_eq!(items, reconstructed);
        }
    }
}
```

---

## 8. Configuration Refinements

### 8.1 Environment Variable Mapping

```rust
impl DynamoDbConfig {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            region: env::var("AWS_REGION")
                .or_else(|_| env::var("AWS_DEFAULT_REGION"))
                .ok(),
            endpoint_url: env::var("DYNAMODB_ENDPOINT")
                .or_else(|_| env::var("AWS_ENDPOINT_URL"))
                .ok(),
            auth: Self::auth_from_env()?,
            retry_config: RetryConfig {
                max_attempts: env::var("DYNAMODB_RETRY_MAX_ATTEMPTS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(10),
                base_delay: Duration::from_millis(
                    env::var("DYNAMODB_RETRY_BASE_DELAY_MS")
                        .ok()
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(50)
                ),
                max_delay: Duration::from_secs(
                    env::var("DYNAMODB_RETRY_MAX_DELAY_SECS")
                        .ok()
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(20)
                ),
            },
            ..Default::default()
        })
    }

    fn auth_from_env() -> Result<AuthConfig> {
        // Check for explicit credentials
        if let (Ok(access_key), Ok(secret_key)) = (
            env::var("AWS_ACCESS_KEY_ID"),
            env::var("AWS_SECRET_ACCESS_KEY"),
        ) {
            return Ok(AuthConfig::Credentials {
                access_key,
                secret_key: SecretString::new(secret_key),
            });
        }

        // Check for role assumption
        if let Ok(role_arn) = env::var("AWS_ROLE_ARN") {
            let external_id = env::var("AWS_EXTERNAL_ID").ok();
            return Ok(AuthConfig::Role { role_arn, external_id });
        }

        // Check for web identity (IRSA)
        if let (Ok(role_arn), Ok(token_file)) = (
            env::var("AWS_ROLE_ARN"),
            env::var("AWS_WEB_IDENTITY_TOKEN_FILE"),
        ) {
            return Ok(AuthConfig::WebIdentity { role_arn, token_file });
        }

        // Default to environment chain
        Ok(AuthConfig::Environment)
    }
}
```

---

## 9. Observability Refinements

### 9.1 Consumed Capacity Tracking

```rust
impl TableClient {
    fn record_consumed_capacity(
        &self,
        capacity: &Option<ConsumedCapacity>,
        operation: &str,
    ) {
        if let Some(cap) = capacity {
            if let Some(rcu) = cap.read_capacity_units {
                metrics::counter!("dynamodb_consumed_rcu_total",
                    "table" => self.table_name.clone(),
                    "operation" => operation.to_string()
                ).increment(rcu as u64);
            }

            if let Some(wcu) = cap.write_capacity_units {
                metrics::counter!("dynamodb_consumed_wcu_total",
                    "table" => self.table_name.clone(),
                    "operation" => operation.to_string()
                ).increment(wcu as u64);
            }

            // Track GSI consumption
            if let Some(gsi_caps) = &cap.global_secondary_indexes {
                for (index_name, index_cap) in gsi_caps {
                    if let Some(rcu) = index_cap.read_capacity_units {
                        metrics::counter!("dynamodb_gsi_consumed_rcu_total",
                            "table" => self.table_name.clone(),
                            "index" => index_name.clone()
                        ).increment(rcu as u64);
                    }
                }
            }
        }
    }
}
```

---

## 10. Local Development

### 10.1 Local DynamoDB Support

```rust
impl DynamoDbConfig {
    /// Configure for local DynamoDB
    pub fn local(port: u16) -> Self {
        Self {
            region: Some("local".to_string()),
            endpoint_url: Some(format!("http://localhost:{}", port)),
            auth: AuthConfig::Credentials {
                access_key: "local".to_string(),
                secret_key: SecretString::new("local"),
            },
            ..Default::default()
        }
    }

    /// Auto-detect local vs AWS based on environment
    pub fn auto() -> Result<Self> {
        if env::var("DYNAMODB_LOCAL").is_ok() {
            let port = env::var("DYNAMODB_LOCAL_PORT")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(8000);
            Ok(Self::local(port))
        } else {
            Self::from_env()
        }
    }
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Refinement |

---

**Next Phase:** Completion - Implementation tasks, test coverage requirements, deployment checklist, and operational runbooks.
