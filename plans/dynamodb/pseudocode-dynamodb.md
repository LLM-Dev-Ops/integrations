# DynamoDB Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/dynamodb`

---

## 1. Core Client

### 1.1 DynamoDbClient

```pseudocode
CLASS DynamoDbClient:
    config: DynamoDbConfig
    client: AwsDynamoDbClient
    circuit_breaker: CircuitBreaker
    metrics: MetricsCollector

    CONSTRUCTOR(config: DynamoDbConfig):
        self.config = config
        self.client = self.create_aws_client(config).await
        self.circuit_breaker = CircuitBreaker::new(config.circuit_breaker)
        self.metrics = MetricsCollector::new("dynamodb")

    ASYNC FUNCTION create_aws_client(config: &DynamoDbConfig) -> AwsDynamoDbClient:
        aws_config = aws_config::defaults(BehaviorVersion::latest())

        aws_config = MATCH &config.auth:
            AuthConfig::Credentials { access_key, secret_key } =>
                aws_config.credentials_provider(
                    Credentials::new(access_key, secret_key.expose(), None, None, "static")
                )
            AuthConfig::Profile { profile_name } =>
                aws_config.profile_name(profile_name)
            AuthConfig::Role { role_arn, external_id } =>
                aws_config.credentials_provider(
                    AssumeRoleProvider::new(role_arn, external_id)
                )
            AuthConfig::WebIdentity { role_arn, token_file } =>
                aws_config.credentials_provider(
                    WebIdentityTokenCredentialsProvider::new(role_arn, token_file)
                )
            AuthConfig::Environment =>
                aws_config  // Use default chain

        IF let Some(region) = &config.region:
            aws_config = aws_config.region(Region::new(region.clone()))

        IF let Some(endpoint) = &config.endpoint_url:
            aws_config = aws_config.endpoint_url(endpoint)

        sdk_config = aws_config.load().await
        RETURN AwsDynamoDbClient::new(&sdk_config)

    FUNCTION table(&self, name: &str) -> TableClient:
        RETURN TableClient::new(self, name.to_string())
```

### 1.2 Configuration

```pseudocode
STRUCT DynamoDbConfig:
    region: Option<String>
    endpoint_url: Option<String>        // For local DynamoDB
    auth: AuthConfig
    retry_config: RetryConfig
    circuit_breaker: CircuitBreakerConfig
    timeout: Duration

ENUM AuthConfig:
    Credentials { access_key: String, secret_key: SecretString }
    Profile { profile_name: String }
    Role { role_arn: String, external_id: Option<String> }
    WebIdentity { role_arn: String, token_file: String }
    Environment

STRUCT Key:
    partition_key: AttributeValue
    sort_key: Option<AttributeValue>

    FUNCTION new(pk: impl Into<AttributeValue>) -> Self:
        RETURN Self { partition_key: pk.into(), sort_key: None }

    FUNCTION with_sort_key(mut self, sk: impl Into<AttributeValue>) -> Self:
        self.sort_key = Some(sk.into())
        RETURN self

    FUNCTION to_key_map(&self, pk_name: &str, sk_name: Option<&str>) -> HashMap<String, AttributeValue>:
        map = HashMap::new()
        map.insert(pk_name.to_string(), self.partition_key.clone())
        IF let (Some(sk), Some(sk_name)) = (&self.sort_key, sk_name):
            map.insert(sk_name.to_string(), sk.clone())
        RETURN map
```

---

## 2. Table Client

### 2.1 TableClient Structure

```pseudocode
CLASS TableClient:
    client: &DynamoDbClient
    table_name: String
    pk_name: String
    sk_name: Option<String>

    FUNCTION new(client: &DynamoDbClient, table_name: String) -> Self:
        RETURN Self {
            client,
            table_name,
            pk_name: "PK".to_string(),
            sk_name: Some("SK".to_string()),
        }

    FUNCTION with_key_schema(mut self, pk: &str, sk: Option<&str>) -> Self:
        self.pk_name = pk.to_string()
        self.sk_name = sk.map(|s| s.to_string())
        RETURN self
```

### 2.2 GetItem

```pseudocode
IMPL TableClient:
    ASYNC FUNCTION get_item<T: DeserializeOwned>(&self, key: Key) -> Result<Option<T>>:
        RETURN self.get_item_with_options(key, GetItemOptions::default()).await

    ASYNC FUNCTION get_item_with_options<T: DeserializeOwned>(
        &self,
        key: Key,
        options: GetItemOptions,
    ) -> Result<Option<T>>:
        span = tracing::span!("dynamodb.get_item", table = %self.table_name)

        request = self.client.client.get_item()
            .table_name(&self.table_name)
            .set_key(Some(key.to_key_map(&self.pk_name, self.sk_name.as_deref())))
            .consistent_read(options.consistent_read)

        IF let Some(projection) = &options.projection:
            request = request.projection_expression(projection)
            request = self.apply_expression_names(request, &options.expression_names)

        response = self.client.circuit_breaker.call(|| async {
            self.execute_with_retry(|| request.clone().send()).await
        }).await?

        self.record_consumed_capacity(&response.consumed_capacity, "get_item")

        MATCH response.item:
            Some(item) => Ok(Some(serde_dynamo::from_item(item)?))
            None => Ok(None)

STRUCT GetItemOptions:
    consistent_read: bool
    projection: Option<String>
    expression_names: HashMap<String, String>
    return_consumed_capacity: bool
```

### 2.3 PutItem

```pseudocode
IMPL TableClient:
    ASYNC FUNCTION put_item<T: Serialize>(&self, item: &T) -> Result<()>:
        RETURN self.put_item_with_options(item, PutItemOptions::default()).await

    ASYNC FUNCTION put_item_with_options<T: Serialize>(
        &self,
        item: &T,
        options: PutItemOptions,
    ) -> Result<PutItemOutput>:
        span = tracing::span!("dynamodb.put_item", table = %self.table_name)

        item_map = serde_dynamo::to_item(item)?

        request = self.client.client.put_item()
            .table_name(&self.table_name)
            .set_item(Some(item_map))

        IF let Some(condition) = &options.condition_expression:
            request = request.condition_expression(condition)
            request = self.apply_expression_names(request, &options.expression_names)
            request = self.apply_expression_values(request, &options.expression_values)

        IF options.return_old_values:
            request = request.return_values(ReturnValue::AllOld)

        response = self.client.circuit_breaker.call(|| async {
            self.execute_with_retry(|| request.clone().send()).await
        }).await
        .map_err(|e| self.convert_conditional_error(e))?

        self.record_consumed_capacity(&response.consumed_capacity, "put_item")

        RETURN Ok(PutItemOutput {
            old_item: response.attributes.map(|a| serde_dynamo::from_item(a)).transpose()?,
        })

STRUCT PutItemOptions:
    condition_expression: Option<String>
    expression_names: HashMap<String, String>
    expression_values: HashMap<String, AttributeValue>
    return_old_values: bool

    FUNCTION if_not_exists() -> Self:
        Self {
            condition_expression: Some("attribute_not_exists(#pk)".to_string()),
            expression_names: [("#pk".to_string(), "PK".to_string())].into(),
            ..Default::default()
        }
```

### 2.4 UpdateItem

```pseudocode
IMPL TableClient:
    ASYNC FUNCTION update_item(
        &self,
        key: Key,
        update: UpdateExpression,
    ) -> Result<UpdateItemOutput>:
        RETURN self.update_item_with_options(key, update, UpdateItemOptions::default()).await

    ASYNC FUNCTION update_item_with_options(
        &self,
        key: Key,
        update: UpdateExpression,
        options: UpdateItemOptions,
    ) -> Result<UpdateItemOutput>:
        span = tracing::span!("dynamodb.update_item", table = %self.table_name)

        request = self.client.client.update_item()
            .table_name(&self.table_name)
            .set_key(Some(key.to_key_map(&self.pk_name, self.sk_name.as_deref())))
            .update_expression(update.expression)
            .set_expression_attribute_names(Some(update.names))
            .set_expression_attribute_values(Some(update.values))

        IF let Some(condition) = &options.condition_expression:
            request = request.condition_expression(condition)

        IF options.return_new_values:
            request = request.return_values(ReturnValue::AllNew)
        ELSE IF options.return_old_values:
            request = request.return_values(ReturnValue::AllOld)

        response = self.client.circuit_breaker.call(|| async {
            self.execute_with_retry(|| request.clone().send()).await
        }).await
        .map_err(|e| self.convert_conditional_error(e))?

        RETURN Ok(UpdateItemOutput {
            attributes: response.attributes.map(|a| serde_dynamo::from_item(a)).transpose()?,
        })

STRUCT UpdateExpression:
    expression: String
    names: HashMap<String, String>
    values: HashMap<String, AttributeValue>

IMPL UpdateExpression:
    FUNCTION new() -> Self:
        Self { expression: String::new(), names: HashMap::new(), values: HashMap::new() }

    FUNCTION set(mut self, attr: &str, value: impl Into<AttributeValue>) -> Self:
        name_key = format!("#{}", attr)
        value_key = format!(":{}", attr)

        IF self.expression.is_empty():
            self.expression = format!("SET {} = {}", name_key, value_key)
        ELSE IF self.expression.starts_with("SET"):
            self.expression = format!("{}, {} = {}", self.expression, name_key, value_key)
        ELSE:
            self.expression = format!("{} SET {} = {}", self.expression, name_key, value_key)

        self.names.insert(name_key, attr.to_string())
        self.values.insert(value_key, value.into())
        RETURN self

    FUNCTION increment(mut self, attr: &str, delta: i64) -> Self:
        name_key = format!("#{}", attr)
        value_key = format!(":{}_delta", attr)

        IF self.expression.is_empty():
            self.expression = format!("SET {} = {} + {}", name_key, name_key, value_key)
        ELSE:
            self.expression = format!("{}, {} = {} + {}", self.expression, name_key, name_key, value_key)

        self.names.insert(name_key, attr.to_string())
        self.values.insert(value_key, AttributeValue::N(delta.to_string()))
        RETURN self

    FUNCTION remove(mut self, attr: &str) -> Self:
        name_key = format!("#{}", attr)

        IF self.expression.contains("REMOVE"):
            self.expression = format!("{}, {}", self.expression, name_key)
        ELSE:
            self.expression = format!("{} REMOVE {}", self.expression, name_key)

        self.names.insert(name_key, attr.to_string())
        RETURN self
```

### 2.5 DeleteItem

```pseudocode
IMPL TableClient:
    ASYNC FUNCTION delete_item(&self, key: Key) -> Result<()>:
        self.delete_item_with_options(key, DeleteItemOptions::default()).await?
        Ok(())

    ASYNC FUNCTION delete_item_with_options(
        &self,
        key: Key,
        options: DeleteItemOptions,
    ) -> Result<DeleteItemOutput>:
        span = tracing::span!("dynamodb.delete_item", table = %self.table_name)

        request = self.client.client.delete_item()
            .table_name(&self.table_name)
            .set_key(Some(key.to_key_map(&self.pk_name, self.sk_name.as_deref())))

        IF let Some(condition) = &options.condition_expression:
            request = request.condition_expression(condition)
            request = self.apply_expression_names(request, &options.expression_names)
            request = self.apply_expression_values(request, &options.expression_values)

        IF options.return_old_values:
            request = request.return_values(ReturnValue::AllOld)

        response = self.client.circuit_breaker.call(|| async {
            self.execute_with_retry(|| request.clone().send()).await
        }).await
        .map_err(|e| self.convert_conditional_error(e))?

        RETURN Ok(DeleteItemOutput {
            old_item: response.attributes.map(|a| serde_dynamo::from_item(a)).transpose()?,
        })
```

---

## 3. Query and Scan

### 3.1 Query Operations

```pseudocode
IMPL TableClient:
    ASYNC FUNCTION query<T: DeserializeOwned>(&self, pk: impl Into<AttributeValue>) -> Result<Vec<T>>:
        query = QueryBuilder::new(self)
            .partition_key(pk)
            .build()

        RETURN self.execute_query(query).await

    FUNCTION query_builder(&self) -> QueryBuilder:
        RETURN QueryBuilder::new(self)

CLASS QueryBuilder:
    table: &TableClient
    partition_key: Option<AttributeValue>
    sort_key_condition: Option<SortKeyCondition>
    index_name: Option<String>
    filter_expression: Option<String>
    projection: Option<String>
    expression_names: HashMap<String, String>
    expression_values: HashMap<String, AttributeValue>
    limit: Option<i32>
    scan_forward: bool
    consistent_read: bool

    FUNCTION partition_key(mut self, pk: impl Into<AttributeValue>) -> Self:
        self.partition_key = Some(pk.into())
        RETURN self

    FUNCTION sort_key_equals(mut self, sk: impl Into<AttributeValue>) -> Self:
        self.sort_key_condition = Some(SortKeyCondition::Equals(sk.into()))
        RETURN self

    FUNCTION sort_key_begins_with(mut self, prefix: &str) -> Self:
        self.sort_key_condition = Some(SortKeyCondition::BeginsWith(prefix.to_string()))
        RETURN self

    FUNCTION sort_key_between(mut self, start: impl Into<AttributeValue>, end: impl Into<AttributeValue>) -> Self:
        self.sort_key_condition = Some(SortKeyCondition::Between(start.into(), end.into()))
        RETURN self

    FUNCTION index(mut self, index_name: &str) -> Self:
        self.index_name = Some(index_name.to_string())
        RETURN self

    FUNCTION filter(mut self, expression: &str) -> Self:
        self.filter_expression = Some(expression.to_string())
        RETURN self

    FUNCTION limit(mut self, limit: i32) -> Self:
        self.limit = Some(limit)
        RETURN self

    FUNCTION descending(mut self) -> Self:
        self.scan_forward = false
        RETURN self

    ASYNC FUNCTION execute<T: DeserializeOwned>(self) -> Result<QueryResult<T>>:
        self.table.execute_query(self.build()).await

    FUNCTION build(self) -> QueryRequest:
        pk = self.partition_key.expect("Partition key required")
        pk_name = self.table.pk_name.clone()
        sk_name = self.table.sk_name.clone()

        key_condition = format!("#{} = :pk", pk_name)
        names = HashMap::from([(format!("#{}", pk_name), pk_name.clone())])
        values = HashMap::from([(":pk".to_string(), pk)])

        IF let Some(sk_cond) = self.sort_key_condition:
            sk_name = sk_name.expect("Sort key required for sort key condition")
            (sk_expr, sk_names, sk_values) = sk_cond.to_expression(&sk_name)
            key_condition = format!("{} AND {}", key_condition, sk_expr)
            names.extend(sk_names)
            values.extend(sk_values)

        RETURN QueryRequest {
            table_name: self.table.table_name.clone(),
            index_name: self.index_name,
            key_condition_expression: key_condition,
            filter_expression: self.filter_expression,
            projection_expression: self.projection,
            expression_names: names,
            expression_values: values,
            limit: self.limit,
            scan_index_forward: self.scan_forward,
            consistent_read: self.consistent_read,
        }

IMPL TableClient:
    ASYNC FUNCTION execute_query<T: DeserializeOwned>(&self, request: QueryRequest) -> Result<QueryResult<T>>:
        span = tracing::span!("dynamodb.query", table = %self.table_name)

        aws_request = self.client.client.query()
            .table_name(&request.table_name)
            .key_condition_expression(&request.key_condition_expression)
            .set_index_name(request.index_name)
            .set_filter_expression(request.filter_expression)
            .set_projection_expression(request.projection_expression)
            .set_expression_attribute_names(Some(request.expression_names))
            .set_expression_attribute_values(Some(request.expression_values))
            .set_limit(request.limit)
            .scan_index_forward(request.scan_index_forward)
            .consistent_read(request.consistent_read)

        response = self.client.circuit_breaker.call(|| async {
            self.execute_with_retry(|| aws_request.clone().send()).await
        }).await?

        items = response.items.unwrap_or_default()
            .into_iter()
            .map(|item| serde_dynamo::from_item(item))
            .collect::<Result<Vec<T>, _>>()?

        RETURN Ok(QueryResult {
            items,
            last_evaluated_key: response.last_evaluated_key,
            count: response.count.unwrap_or(0) as usize,
            scanned_count: response.scanned_count.unwrap_or(0) as usize,
        })
```

### 3.2 Pagination

```pseudocode
IMPL TableClient:
    FUNCTION query_paginator<T: DeserializeOwned>(&self, request: QueryRequest) -> QueryPaginator<T>:
        RETURN QueryPaginator::new(self, request)

CLASS QueryPaginator<T>:
    table: &TableClient
    request: QueryRequest
    last_key: Option<HashMap<String, AttributeValue>>
    finished: bool

    ASYNC FUNCTION next_page(&mut self) -> Result<Option<QueryResult<T>>>:
        IF self.finished:
            RETURN Ok(None)

        request = self.request.clone()
        request.exclusive_start_key = self.last_key.take()

        result = self.table.execute_query(request).await?

        self.last_key = result.last_evaluated_key.clone()
        IF self.last_key.is_none():
            self.finished = true

        RETURN Ok(Some(result))

    ASYNC FUNCTION collect_all(&mut self) -> Result<Vec<T>>:
        all_items = Vec::new()

        WHILE let Some(page) = self.next_page().await?:
            all_items.extend(page.items)

        RETURN Ok(all_items)

    FUNCTION into_stream(self) -> impl Stream<Item = Result<T>>:
        async_stream::try_stream! {
            mut paginator = self
            WHILE let Some(page) = paginator.next_page().await?:
                FOR item IN page.items:
                    yield item
        }
```

### 3.3 Scan Operations

```pseudocode
IMPL TableClient:
    ASYNC FUNCTION scan<T: DeserializeOwned>(&self) -> Result<Vec<T>>:
        paginator = self.scan_paginator(ScanRequest::default())
        RETURN paginator.collect_all().await

    ASYNC FUNCTION scan_parallel<T: DeserializeOwned + Send>(
        &self,
        total_segments: u32,
    ) -> Result<Vec<T>>:
        futures = (0..total_segments).map(|segment| {
            let table = self.clone()
            async move {
                let request = ScanRequest {
                    segment: Some(segment),
                    total_segments: Some(total_segments),
                    ..Default::default()
                }
                table.scan_paginator(request).collect_all().await
            }
        })

        results = futures::future::try_join_all(futures).await?
        RETURN Ok(results.into_iter().flatten().collect())
```

---

## 4. Batch Operations

### 4.1 BatchGetItem

```pseudocode
IMPL TableClient:
    ASYNC FUNCTION batch_get<T: DeserializeOwned>(&self, keys: Vec<Key>) -> Result<BatchGetResult<T>>:
        IF keys.is_empty():
            RETURN Ok(BatchGetResult::empty())

        IF keys.len() > 100:
            RETURN Err(DynamoDbError::TooManyItems(keys.len(), 100))

        span = tracing::span!("dynamodb.batch_get", table = %self.table_name, count = keys.len())

        keys_and_attributes = KeysAndAttributes::builder()
            .set_keys(Some(
                keys.iter()
                    .map(|k| k.to_key_map(&self.pk_name, self.sk_name.as_deref()))
                    .collect()
            ))
            .build()?

        request = self.client.client.batch_get_item()
            .request_items(&self.table_name, keys_and_attributes)

        response = self.client.circuit_breaker.call(|| async {
            self.execute_with_retry(|| request.clone().send()).await
        }).await?

        items = response.responses
            .and_then(|r| r.get(&self.table_name).cloned())
            .unwrap_or_default()
            .into_iter()
            .map(|item| serde_dynamo::from_item(item))
            .collect::<Result<Vec<T>, _>>()?

        unprocessed = response.unprocessed_keys
            .and_then(|u| u.get(&self.table_name).cloned())
            .map(|k| k.keys.unwrap_or_default().len())
            .unwrap_or(0)

        IF unprocessed > 0:
            metrics::counter!("dynamodb_batch_unprocessed_items").increment(unprocessed as u64)
            tracing::warn!(unprocessed = unprocessed, "Batch get has unprocessed keys")

        RETURN Ok(BatchGetResult { items, unprocessed_count: unprocessed })

    ASYNC FUNCTION batch_get_all<T: DeserializeOwned>(&self, keys: Vec<Key>) -> Result<Vec<T>>:
        // Handle more than 100 keys by chunking
        all_items = Vec::new()

        FOR chunk IN keys.chunks(100):
            result = self.batch_get(chunk.to_vec()).await?
            all_items.extend(result.items)

            // Retry unprocessed keys with backoff
            IF result.unprocessed_count > 0:
                // Would need to track and retry unprocessed keys
                tracing::warn!("Some keys were not processed")

        RETURN Ok(all_items)
```

### 4.2 BatchWriteItem

```pseudocode
IMPL TableClient:
    ASYNC FUNCTION batch_write(&self, operations: Vec<WriteRequest>) -> Result<BatchWriteResult>:
        IF operations.is_empty():
            RETURN Ok(BatchWriteResult::empty())

        IF operations.len() > 25:
            RETURN Err(DynamoDbError::TooManyItems(operations.len(), 25))

        span = tracing::span!("dynamodb.batch_write", table = %self.table_name, count = operations.len())

        request = self.client.client.batch_write_item()
            .request_items(&self.table_name, operations.clone())

        response = self.client.circuit_breaker.call(|| async {
            self.execute_with_retry(|| request.clone().send()).await
        }).await?

        unprocessed = response.unprocessed_items
            .and_then(|u| u.get(&self.table_name).cloned())
            .map(|items| items.len())
            .unwrap_or(0)

        RETURN Ok(BatchWriteResult {
            processed_count: operations.len() - unprocessed,
            unprocessed_count: unprocessed,
        })

    ASYNC FUNCTION batch_put<T: Serialize>(&self, items: Vec<T>) -> Result<BatchWriteResult>:
        operations = items.into_iter()
            .map(|item| {
                let item_map = serde_dynamo::to_item(&item)?
                Ok(WriteRequest::builder()
                    .put_request(PutRequest::builder().set_item(Some(item_map)).build()?)
                    .build()?)
            })
            .collect::<Result<Vec<_>>>()?

        RETURN self.batch_write(operations).await

    ASYNC FUNCTION batch_delete(&self, keys: Vec<Key>) -> Result<BatchWriteResult>:
        operations = keys.into_iter()
            .map(|key| {
                WriteRequest::builder()
                    .delete_request(
                        DeleteRequest::builder()
                            .set_key(Some(key.to_key_map(&self.pk_name, self.sk_name.as_deref())))
                            .build()?
                    )
                    .build()?
            })
            .collect::<Vec<_>>()

        RETURN self.batch_write(operations).await
```

---

## 5. Transactions

### 5.1 TransactWriteItems

```pseudocode
CLASS TransactionBuilder:
    client: &DynamoDbClient
    operations: Vec<TransactWriteItem>
    client_request_token: Option<String>

    FUNCTION new(client: &DynamoDbClient) -> Self:
        Self { client, operations: Vec::new(), client_request_token: None }

    FUNCTION put<T: Serialize>(mut self, table: &str, item: T) -> Result<Self>:
        item_map = serde_dynamo::to_item(&item)?
        self.operations.push(
            TransactWriteItem::builder()
                .put(Put::builder()
                    .table_name(table)
                    .set_item(Some(item_map))
                    .build()?)
                .build()
        )
        RETURN Ok(self)

    FUNCTION put_with_condition<T: Serialize>(
        mut self,
        table: &str,
        item: T,
        condition: &str,
    ) -> Result<Self>:
        item_map = serde_dynamo::to_item(&item)?
        self.operations.push(
            TransactWriteItem::builder()
                .put(Put::builder()
                    .table_name(table)
                    .set_item(Some(item_map))
                    .condition_expression(condition)
                    .build()?)
                .build()
        )
        RETURN Ok(self)

    FUNCTION update(
        mut self,
        table: &str,
        key: Key,
        update: UpdateExpression,
    ) -> Self:
        self.operations.push(
            TransactWriteItem::builder()
                .update(Update::builder()
                    .table_name(table)
                    .set_key(Some(key.to_key_map("PK", Some("SK"))))
                    .update_expression(&update.expression)
                    .set_expression_attribute_names(Some(update.names))
                    .set_expression_attribute_values(Some(update.values))
                    .build()?)
                .build()
        )
        RETURN self

    FUNCTION delete(mut self, table: &str, key: Key) -> Self:
        self.operations.push(
            TransactWriteItem::builder()
                .delete(Delete::builder()
                    .table_name(table)
                    .set_key(Some(key.to_key_map("PK", Some("SK"))))
                    .build()?)
                .build()
        )
        RETURN self

    FUNCTION condition_check(
        mut self,
        table: &str,
        key: Key,
        condition: &str,
    ) -> Self:
        self.operations.push(
            TransactWriteItem::builder()
                .condition_check(ConditionCheck::builder()
                    .table_name(table)
                    .set_key(Some(key.to_key_map("PK", Some("SK"))))
                    .condition_expression(condition)
                    .build()?)
                .build()
        )
        RETURN self

    FUNCTION idempotency_token(mut self, token: &str) -> Self:
        self.client_request_token = Some(token.to_string())
        RETURN self

    ASYNC FUNCTION execute(self) -> Result<()>:
        IF self.operations.is_empty():
            RETURN Ok(())

        IF self.operations.len() > 100:
            RETURN Err(DynamoDbError::TooManyItems(self.operations.len(), 100))

        span = tracing::span!("dynamodb.transact_write", count = self.operations.len())

        request = self.client.client.transact_write_items()
            .set_transact_items(Some(self.operations))
            .set_client_request_token(self.client_request_token)

        self.client.circuit_breaker.call(|| async {
            self.client.execute_with_retry(|| request.clone().send()).await
        }).await
        .map_err(|e| self.convert_transaction_error(e))?

        RETURN Ok(())
```

### 5.2 TransactGetItems

```pseudocode
IMPL DynamoDbClient:
    ASYNC FUNCTION transact_get<T: DeserializeOwned>(
        &self,
        gets: Vec<TransactGet>,
    ) -> Result<Vec<Option<T>>>:
        IF gets.is_empty():
            RETURN Ok(Vec::new())

        IF gets.len() > 100:
            RETURN Err(DynamoDbError::TooManyItems(gets.len(), 100))

        span = tracing::span!("dynamodb.transact_get", count = gets.len())

        items = gets.into_iter()
            .map(|g| TransactGetItem::builder()
                .get(Get::builder()
                    .table_name(&g.table)
                    .set_key(Some(g.key.to_key_map(&g.pk_name, g.sk_name.as_deref())))
                    .set_projection_expression(g.projection)
                    .build()?)
                .build())
            .collect::<Vec<_>>()

        request = self.client.transact_get_items()
            .set_transact_items(Some(items))

        response = self.circuit_breaker.call(|| async {
            self.execute_with_retry(|| request.clone().send()).await
        }).await?

        results = response.responses.unwrap_or_default()
            .into_iter()
            .map(|r| r.item.map(|i| serde_dynamo::from_item(i)).transpose())
            .collect::<Result<Vec<_>>>()?

        RETURN Ok(results)
```

---

## 6. Error Handling

### 6.1 Retry Logic

```pseudocode
IMPL DynamoDbClient:
    ASYNC FUNCTION execute_with_retry<F, Fut, T>(&self, f: F) -> Result<T>
    WHERE F: Fn() -> Fut,
          Fut: Future<Output = Result<T, SdkError>>:

        retry_count = 0
        last_error = None

        WHILE retry_count <= self.config.retry_config.max_attempts:
            MATCH f().await:
                Ok(result) => RETURN Ok(result)
                Err(e) IF self.is_retryable(&e) =>
                    last_error = Some(e)
                    retry_count += 1
                    delay = self.calculate_backoff(retry_count, &e)
                    metrics::counter!("dynamodb_retries_total").increment(1)
                    tokio::time::sleep(delay).await
                Err(e) => RETURN Err(self.convert_error(e))

        RETURN Err(self.convert_error(last_error.unwrap()))

    FUNCTION is_retryable(&self, error: &SdkError) -> bool:
        MATCH error:
            SdkError::ServiceError(e) => MATCH e.err().code():
                Some("ProvisionedThroughputExceededException") => true
                Some("ThrottlingException") => true
                Some("InternalServerError") => true
                Some("ServiceUnavailable") => true
                Some("TransactionConflictException") => true
                _ => false
            SdkError::TimeoutError(_) => true
            SdkError::DispatchFailure(_) => true
            _ => false

    FUNCTION calculate_backoff(&self, attempt: u32, error: &SdkError) -> Duration:
        base = MATCH error:
            _ IF self.is_throttle(error) => Duration::from_millis(50)
            _ => Duration::from_millis(100)

        // Exponential backoff with jitter
        max_delay = Duration::from_secs(20)
        exp_delay = base * 2_u32.pow(attempt - 1)
        capped = exp_delay.min(max_delay)

        // Add jitter: 0-100% of delay
        jitter = rand::random::<f64>()
        Duration::from_millis((capped.as_millis() as f64 * (1.0 + jitter)) as u64)
```

### 6.2 Error Conversion

```pseudocode
IMPL DynamoDbClient:
    FUNCTION convert_error(&self, error: SdkError) -> DynamoDbError:
        MATCH error:
            SdkError::ServiceError(e) => MATCH e.err().code():
                Some("ConditionalCheckFailedException") =>
                    DynamoDbError::ConditionalCheck(ConditionalCheckError::ConditionFailed)
                Some("TransactionCanceledException") =>
                    self.parse_transaction_canceled(e.err())
                Some("ProvisionedThroughputExceededException") =>
                    DynamoDbError::Throughput(ThroughputError::ProvisionedExceeded)
                Some("ResourceNotFoundException") =>
                    DynamoDbError::Service(ServiceError::ResourceNotFound)
                Some("ValidationException") =>
                    DynamoDbError::Validation(ValidationError::InvalidExpression(e.err().message()))
                _ => DynamoDbError::Service(ServiceError::Unknown(e.err().message()))
            SdkError::TimeoutError(_) =>
                DynamoDbError::Service(ServiceError::Timeout)
            _ => DynamoDbError::Service(ServiceError::Unknown(error.to_string()))
```

---

## 7. Simulation Layer

### 7.1 Mock DynamoDB

```pseudocode
CLASS MockDynamoDb:
    tables: HashMap<String, MockTable>
    call_log: Vec<RecordedCall>
    mode: SimulationMode
    latency: Option<Duration>

    FUNCTION new(mode: SimulationMode) -> Self:
        Self {
            tables: HashMap::new(),
            call_log: Vec::new(),
            mode,
            latency: None,
        }

    FUNCTION create_table(&mut self, name: &str, pk: &str, sk: Option<&str>):
        self.tables.insert(name.to_string(), MockTable::new(pk, sk))

    FUNCTION seed_item<T: Serialize>(&mut self, table: &str, item: T):
        item_map = serde_dynamo::to_item(&item).unwrap()
        self.tables.get_mut(table).unwrap().items.push(item_map)

    ASYNC FUNCTION get_item(&mut self, table: &str, key: &Key) -> Option<HashMap<String, AttributeValue>>:
        self.call_log.push(RecordedCall::GetItem { table: table.to_string(), key: key.clone() })

        IF let Some(latency) = self.latency:
            tokio::time::sleep(latency).await

        self.tables.get(table)?.find_item(key)

    FUNCTION verify_operation(&self, op_type: &str) -> Vec<&RecordedCall>:
        self.call_log.iter()
            .filter(|c| c.operation_type() == op_type)
            .collect()
```

---

## 8. Constants

```pseudocode
CONST MAX_BATCH_GET_ITEMS: usize = 100
CONST MAX_BATCH_WRITE_ITEMS: usize = 25
CONST MAX_TRANSACT_ITEMS: usize = 100
CONST MAX_ITEM_SIZE_BYTES: usize = 400 * 1024
CONST MAX_QUERY_RESPONSE_SIZE: usize = 1024 * 1024

CONST DEFAULT_RETRY_MAX_ATTEMPTS: u32 = 10
CONST DEFAULT_RETRY_BASE_DELAY: Duration = Duration::from_millis(50)
CONST DEFAULT_RETRY_MAX_DELAY: Duration = Duration::from_secs(20)
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Pseudocode |

---

**Next Phase:** Architecture - Component diagrams, data flow, partition key patterns, and transaction handling.
