# Pseudocode: Airtable API Integration Module

## SPARC Phase 2: Pseudocode

**Version:** 1.0.0
**Date:** 2025-12-14
**Status:** Draft
**Module:** `integrations/airtable-api`

---

## Table of Contents

1. [Core Structures](#1-core-structures)
2. [Client Initialization](#2-client-initialization)
3. [Record Operations](#3-record-operations)
4. [Batch Operations](#4-batch-operations)
5. [List and Pagination](#5-list-and-pagination)
6. [Metadata Operations](#6-metadata-operations)
7. [Webhook Management](#7-webhook-management)
8. [Rate Limit Handling](#8-rate-limit-handling)
9. [Simulation Layer](#9-simulation-layer)

---

## 1. Core Structures

### 1.1 Client Structure

```
STRUCT AirtableClient {
    http: Arc<HttpClient>,
    config: Arc<AirtableConfig>,
    credentials: Arc<dyn TokenProvider>,
    rate_limiter: Arc<RateLimiter>,
    simulation: Arc<SimulationLayer>,
    metrics: Arc<MetricsCollector>
}

STRUCT AirtableConfig {
    base_url: Url,
    timeout: Duration,
    max_retries: u32,
    rate_limit_strategy: RateLimitStrategy,
    simulation_mode: SimulationMode
}

ENUM RateLimitStrategy {
    Blocking,      // Wait for rate limit slot
    Queued,        // Queue and process async
    FailFast       // Return error immediately
}

ENUM SimulationMode {
    Disabled,
    Record,
    Replay
}
```

### 1.2 Rate Limiter

```
STRUCT RateLimiter {
    base_slots: DashMap<String, TokenBucket>,
    global_queue: Mutex<VecDeque<PendingRequest>>,
    config: RateLimitConfig
}

STRUCT TokenBucket {
    tokens: AtomicU32,
    last_refill: AtomicU64,
    capacity: u32,          // 5 for Airtable
    refill_rate: Duration   // 200ms per token
}

STRUCT PendingRequest {
    base_id: String,
    operation: BoxFuture<Response>,
    created_at: Instant
}
```

### 1.3 Field Value Types

```
ENUM FieldValue {
    Text(String),
    Number(f64),
    Checkbox(bool),
    Date(NaiveDate),
    DateTime(DateTime<Utc>),
    SingleSelect(String),
    MultiSelect(Vec<String>),
    User(UserRef),
    Attachments(Vec<Attachment>),
    LinkedRecords(Vec<String>),
    Lookup(Vec<Box<FieldValue>>),
    Formula(FormulaResult),
    Rollup(RollupResult),
    Currency { value: f64, symbol: String },
    Percent(f64),
    Duration(i64),
    Rating(u8),
    Url(String),
    Email(String),
    Phone(String),
    Barcode { text: String, type: Option<String> },
    Null
}

STRUCT Record {
    id: String,
    created_time: DateTime<Utc>,
    fields: HashMap<String, FieldValue>
}

STRUCT Attachment {
    id: String,
    url: String,
    filename: String,
    size: u64,
    mime_type: String,
    thumbnails: Option<Thumbnails>
}
```

---

## 2. Client Initialization

### 2.1 Builder Pattern

```
STRUCT AirtableClientBuilder {
    config: AirtableConfig,
    token_provider: Option<Arc<dyn TokenProvider>>,
    http_client: Option<HttpClient>
}

IMPL AirtableClientBuilder {
    FUNCTION new() -> Self:
        Self {
            config: AirtableConfig::default(),
            token_provider: None,
            http_client: None
        }

    FUNCTION with_token(mut self, token: SecretString) -> Self:
        self.token_provider = Some(Arc::new(StaticTokenProvider::new(token)))
        self

    FUNCTION with_token_provider(mut self, provider: Arc<dyn TokenProvider>) -> Self:
        self.token_provider = Some(provider)
        self

    FUNCTION with_timeout(mut self, timeout: Duration) -> Self:
        self.config.timeout = timeout
        self

    FUNCTION with_rate_limit_strategy(mut self, strategy: RateLimitStrategy) -> Self:
        self.config.rate_limit_strategy = strategy
        self

    FUNCTION with_simulation_mode(mut self, mode: SimulationMode) -> Self:
        self.config.simulation_mode = mode
        self

    FUNCTION build(self) -> Result<AirtableClient>:
        LET token_provider = self.token_provider
            .ok_or(Error::MissingCredentials)?

        LET http = self.http_client.unwrap_or_else(||
            HttpClient::builder()
                .timeout(self.config.timeout)
                .build()
        )

        OK(AirtableClient {
            http: Arc::new(http),
            config: Arc::new(self.config),
            credentials: token_provider,
            rate_limiter: Arc::new(RateLimiter::new()),
            simulation: Arc::new(SimulationLayer::new()),
            metrics: Arc::new(MetricsCollector::new())
        })
}
```

### 2.2 Base Handle

```
STRUCT BaseHandle {
    client: Arc<AirtableClient>,
    base_id: String
}

IMPL AirtableClient {
    FUNCTION base(self: &Arc<Self>, base_id: impl Into<String>) -> BaseHandle:
        BaseHandle {
            client: Arc::clone(self),
            base_id: base_id.into()
        }
}

IMPL BaseHandle {
    FUNCTION table(&self, table_id: impl Into<String>) -> TableHandle:
        TableHandle {
            client: Arc::clone(&self.client),
            base_id: self.base_id.clone(),
            table_id: table_id.into()
        }
}

STRUCT TableHandle {
    client: Arc<AirtableClient>,
    base_id: String,
    table_id: String
}
```

---

## 3. Record Operations

### 3.1 Create Record

```
IMPL TableHandle {
    FUNCTION create_record(&self, fields: HashMap<String, FieldValue>)
        -> Result<Record>:

        LET span = tracing::span!("airtable.record.create")
        LET _guard = span.enter()

        // Check simulation mode
        IF self.client.config.simulation_mode == SimulationMode::Replay:
            RETURN self.client.simulation.replay_create(&self.table_id, &fields)

        // Acquire rate limit slot
        self.client.rate_limiter.acquire(&self.base_id).await?

        // Build request
        LET url = format!("{}/{}/{}",
            self.client.config.base_url,
            self.base_id,
            self.table_id
        )

        LET body = json!({
            "fields": serialize_fields(&fields),
            "typecast": true
        })

        // Execute with retry
        LET response = self.client.execute_with_retry(
            Method::POST,
            &url,
            Some(body)
        ).await?

        // Record for simulation
        IF self.client.config.simulation_mode == SimulationMode::Record:
            self.client.simulation.record_create(&self.table_id, &fields, &response)

        // Parse response
        LET record = parse_record(response)?

        self.client.metrics.record_operation("create", "success")
        OK(record)
}
```

### 3.2 Retrieve Record

```
IMPL TableHandle {
    FUNCTION get_record(&self, record_id: &str) -> Result<Record>:
        LET span = tracing::span!("airtable.record.get", record_id)
        LET _guard = span.enter()

        IF self.client.config.simulation_mode == SimulationMode::Replay:
            RETURN self.client.simulation.replay_get(&self.table_id, record_id)

        self.client.rate_limiter.acquire(&self.base_id).await?

        LET url = format!("{}/{}/{}/{}",
            self.client.config.base_url,
            self.base_id,
            self.table_id,
            record_id
        )

        LET response = self.client.execute_with_retry(
            Method::GET,
            &url,
            None
        ).await?

        IF self.client.config.simulation_mode == SimulationMode::Record:
            self.client.simulation.record_get(&self.table_id, record_id, &response)

        parse_record(response)
}
```

### 3.3 Update Record

```
IMPL TableHandle {
    FUNCTION update_record(&self, record_id: &str, fields: HashMap<String, FieldValue>)
        -> Result<Record>:

        LET span = tracing::span!("airtable.record.update", record_id)
        LET _guard = span.enter()

        IF self.client.config.simulation_mode == SimulationMode::Replay:
            RETURN self.client.simulation.replay_update(&self.table_id, record_id, &fields)

        self.client.rate_limiter.acquire(&self.base_id).await?

        LET url = format!("{}/{}/{}/{}",
            self.client.config.base_url,
            self.base_id,
            self.table_id,
            record_id
        )

        LET body = json!({
            "fields": serialize_fields(&fields),
            "typecast": true
        })

        LET response = self.client.execute_with_retry(
            Method::PATCH,
            &url,
            Some(body)
        ).await?

        IF self.client.config.simulation_mode == SimulationMode::Record:
            self.client.simulation.record_update(&self.table_id, record_id, &fields, &response)

        parse_record(response)

    // Replace all fields (PUT)
    FUNCTION replace_record(&self, record_id: &str, fields: HashMap<String, FieldValue>)
        -> Result<Record>:

        // Same as update but uses PUT method
        // Clears any fields not included
        self.client.rate_limiter.acquire(&self.base_id).await?

        LET url = format!("{}/{}/{}/{}",
            self.client.config.base_url,
            self.base_id,
            self.table_id,
            record_id
        )

        LET body = json!({ "fields": serialize_fields(&fields) })

        self.client.execute_with_retry(Method::PUT, &url, Some(body)).await
            .and_then(parse_record)
}
```

### 3.4 Delete Record

```
IMPL TableHandle {
    FUNCTION delete_record(&self, record_id: &str) -> Result<DeletedRecord>:
        LET span = tracing::span!("airtable.record.delete", record_id)
        LET _guard = span.enter()

        IF self.client.config.simulation_mode == SimulationMode::Replay:
            RETURN self.client.simulation.replay_delete(&self.table_id, record_id)

        self.client.rate_limiter.acquire(&self.base_id).await?

        LET url = format!("{}/{}/{}/{}",
            self.client.config.base_url,
            self.base_id,
            self.table_id,
            record_id
        )

        LET response = self.client.execute_with_retry(
            Method::DELETE,
            &url,
            None
        ).await?

        IF self.client.config.simulation_mode == SimulationMode::Record:
            self.client.simulation.record_delete(&self.table_id, record_id, &response)

        OK(DeletedRecord {
            id: response["id"].as_str().unwrap().to_string(),
            deleted: response["deleted"].as_bool().unwrap_or(true)
        })
}
```

---

## 4. Batch Operations

### 4.1 Batch Create

```
CONST MAX_BATCH_SIZE: usize = 10

IMPL TableHandle {
    FUNCTION create_records(&self, records: Vec<HashMap<String, FieldValue>>)
        -> Result<Vec<Record>>:

        LET span = tracing::span!("airtable.record.batch_create", count = records.len())
        LET _guard = span.enter()

        // Validate batch size
        IF records.len() > MAX_BATCH_SIZE:
            RETURN Err(Error::BatchSizeExceeded {
                max: MAX_BATCH_SIZE,
                actual: records.len()
            })

        IF records.is_empty():
            RETURN OK(vec![])

        self.client.rate_limiter.acquire(&self.base_id).await?

        LET url = format!("{}/{}/{}",
            self.client.config.base_url,
            self.base_id,
            self.table_id
        )

        LET body = json!({
            "records": records.iter().map(|r| {
                json!({ "fields": serialize_fields(r) })
            }).collect::<Vec<_>>(),
            "typecast": true
        })

        LET response = self.client.execute_with_retry(
            Method::POST,
            &url,
            Some(body)
        ).await?

        parse_records_array(response)

    // Create with automatic chunking
    FUNCTION create_records_chunked(&self, records: Vec<HashMap<String, FieldValue>>)
        -> Result<Vec<Record>>:

        LET mut results = Vec::new()

        FOR chunk IN records.chunks(MAX_BATCH_SIZE):
            LET chunk_results = self.create_records(chunk.to_vec()).await?
            results.extend(chunk_results)

        OK(results)
}
```

### 4.2 Batch Update

```
IMPL TableHandle {
    FUNCTION update_records(&self, updates: Vec<RecordUpdate>)
        -> Result<Vec<Record>>:

        LET span = tracing::span!("airtable.record.batch_update", count = updates.len())
        LET _guard = span.enter()

        IF updates.len() > MAX_BATCH_SIZE:
            RETURN Err(Error::BatchSizeExceeded {
                max: MAX_BATCH_SIZE,
                actual: updates.len()
            })

        IF updates.is_empty():
            RETURN OK(vec![])

        self.client.rate_limiter.acquire(&self.base_id).await?

        LET url = format!("{}/{}/{}",
            self.client.config.base_url,
            self.base_id,
            self.table_id
        )

        LET body = json!({
            "records": updates.iter().map(|u| {
                json!({
                    "id": u.id,
                    "fields": serialize_fields(&u.fields)
                })
            }).collect::<Vec<_>>(),
            "typecast": true
        })

        LET response = self.client.execute_with_retry(
            Method::PATCH,
            &url,
            Some(body)
        ).await?

        parse_records_array(response)
}

STRUCT RecordUpdate {
    id: String,
    fields: HashMap<String, FieldValue>
}
```

### 4.3 Batch Delete

```
IMPL TableHandle {
    FUNCTION delete_records(&self, record_ids: Vec<String>)
        -> Result<Vec<DeletedRecord>>:

        LET span = tracing::span!("airtable.record.batch_delete", count = record_ids.len())
        LET _guard = span.enter()

        IF record_ids.len() > MAX_BATCH_SIZE:
            RETURN Err(Error::BatchSizeExceeded {
                max: MAX_BATCH_SIZE,
                actual: record_ids.len()
            })

        IF record_ids.is_empty():
            RETURN OK(vec![])

        self.client.rate_limiter.acquire(&self.base_id).await?

        // Delete uses query parameters, not body
        LET url = format!("{}/{}/{}?{}",
            self.client.config.base_url,
            self.base_id,
            self.table_id,
            record_ids.iter()
                .map(|id| format!("records[]={}", id))
                .collect::<Vec<_>>()
                .join("&")
        )

        LET response = self.client.execute_with_retry(
            Method::DELETE,
            &url,
            None
        ).await?

        parse_deleted_array(response)
}
```

### 4.4 Upsert

```
IMPL TableHandle {
    FUNCTION upsert_records(&self, request: UpsertRequest)
        -> Result<UpsertResult>:

        LET span = tracing::span!("airtable.record.upsert", count = request.records.len())
        LET _guard = span.enter()

        IF request.records.len() > MAX_BATCH_SIZE:
            RETURN Err(Error::BatchSizeExceeded {
                max: MAX_BATCH_SIZE,
                actual: request.records.len()
            })

        self.client.rate_limiter.acquire(&self.base_id).await?

        LET url = format!("{}/{}/{}",
            self.client.config.base_url,
            self.base_id,
            self.table_id
        )

        LET body = json!({
            "performUpsert": {
                "fieldsToMergeOn": request.merge_on_fields
            },
            "records": request.records.iter().map(|r| {
                json!({ "fields": serialize_fields(r) })
            }).collect::<Vec<_>>(),
            "typecast": true
        })

        LET response = self.client.execute_with_retry(
            Method::PATCH,
            &url,
            Some(body)
        ).await?

        OK(UpsertResult {
            records: parse_records_array(response["records"].clone())?,
            created_records: response["createdRecords"].as_array()
                .map(|a| a.iter().map(|v| v.as_str().unwrap().to_string()).collect())
                .unwrap_or_default(),
            updated_records: response["updatedRecords"].as_array()
                .map(|a| a.iter().map(|v| v.as_str().unwrap().to_string()).collect())
                .unwrap_or_default()
        })
}

STRUCT UpsertRequest {
    records: Vec<HashMap<String, FieldValue>>,
    merge_on_fields: Vec<String>
}

STRUCT UpsertResult {
    records: Vec<Record>,
    created_records: Vec<String>,
    updated_records: Vec<String>
}
```

---

## 5. List and Pagination

### 5.1 List Builder

```
STRUCT ListRecordsBuilder {
    table: TableHandle,
    filter_by_formula: Option<String>,
    sort: Vec<SortField>,
    fields: Option<Vec<String>>,
    view: Option<String>,
    page_size: u32,
    cell_format: CellFormat,
    time_zone: Option<String>,
    user_locale: Option<String>
}

IMPL TableHandle {
    FUNCTION list(&self) -> ListRecordsBuilder:
        ListRecordsBuilder {
            table: self.clone(),
            filter_by_formula: None,
            sort: vec![],
            fields: None,
            view: None,
            page_size: 100,
            cell_format: CellFormat::Json,
            time_zone: None,
            user_locale: None
        }
}

IMPL ListRecordsBuilder {
    FUNCTION filter_by_formula(mut self, formula: impl Into<String>) -> Self:
        self.filter_by_formula = Some(formula.into())
        self

    FUNCTION sort_by(mut self, field: impl Into<String>, direction: SortDirection) -> Self:
        self.sort.push(SortField {
            field: field.into(),
            direction
        })
        self

    FUNCTION select_fields(mut self, fields: Vec<String>) -> Self:
        self.fields = Some(fields)
        self

    FUNCTION in_view(mut self, view_id: impl Into<String>) -> Self:
        self.view = Some(view_id.into())
        self

    FUNCTION page_size(mut self, size: u32) -> Self:
        self.page_size = size.min(100)  // API max is 100
        self

    FUNCTION cell_format(mut self, format: CellFormat) -> Self:
        self.cell_format = format
        self
}

ENUM SortDirection { Asc, Desc }
ENUM CellFormat { Json, String }
```

### 5.2 Single Page Fetch

```
IMPL ListRecordsBuilder {
    FUNCTION page(&self, offset: Option<&str>) -> Result<ListRecordsResponse>:
        LET span = tracing::span!("airtable.list.page")
        LET _guard = span.enter()

        self.table.client.rate_limiter.acquire(&self.table.base_id).await?

        LET mut params = vec![
            ("pageSize", self.page_size.to_string())
        ]

        IF let Some(formula) = &self.filter_by_formula:
            params.push(("filterByFormula", formula.clone()))

        IF let Some(view) = &self.view:
            params.push(("view", view.clone()))

        IF let Some(fields) = &self.fields:
            FOR field IN fields:
                params.push(("fields[]", field.clone()))

        FOR (idx, sort_field) IN self.sort.iter().enumerate():
            params.push((
                &format!("sort[{}][field]", idx),
                sort_field.field.clone()
            ))
            params.push((
                &format!("sort[{}][direction]", idx),
                match sort_field.direction {
                    SortDirection::Asc => "asc",
                    SortDirection::Desc => "desc"
                }.to_string()
            ))

        IF let Some(off) = offset:
            params.push(("offset", off.to_string()))

        LET url = format!("{}/{}/{}?{}",
            self.table.client.config.base_url,
            self.table.base_id,
            self.table.table_id,
            params.iter()
                .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
                .collect::<Vec<_>>()
                .join("&")
        )

        LET response = self.table.client.execute_with_retry(
            Method::GET,
            &url,
            None
        ).await?

        OK(ListRecordsResponse {
            records: parse_records_array(response["records"].clone())?,
            offset: response["offset"].as_str().map(String::from)
        })
}

STRUCT ListRecordsResponse {
    records: Vec<Record>,
    offset: Option<String>
}
```

### 5.3 Pagination Iterator

```
IMPL ListRecordsBuilder {
    // Fetch all records with automatic pagination
    FUNCTION all(&self) -> Result<Vec<Record>>:
        LET span = tracing::span!("airtable.list.all")
        LET _guard = span.enter()

        LET mut all_records = Vec::new()
        LET mut offset: Option<String> = None

        LOOP:
            LET page = self.page(offset.as_deref()).await?
            all_records.extend(page.records)

            MATCH page.offset:
                Some(next_offset) => offset = Some(next_offset),
                None => BREAK

        OK(all_records)

    // Stream records as async iterator
    FUNCTION stream(&self) -> RecordStream:
        RecordStream {
            builder: self.clone(),
            buffer: VecDeque::new(),
            offset: None,
            exhausted: false
        }
}

STRUCT RecordStream {
    builder: ListRecordsBuilder,
    buffer: VecDeque<Record>,
    offset: Option<String>,
    exhausted: bool
}

IMPL Stream FOR RecordStream {
    TYPE Item = Result<Record>

    FUNCTION poll_next(mut self: Pin<&mut Self>, cx: &mut Context)
        -> Poll<Option<Self::Item>>:

        // Return buffered record if available
        IF let Some(record) = self.buffer.pop_front():
            RETURN Poll::Ready(Some(OK(record)))

        // Stop if exhausted
        IF self.exhausted:
            RETURN Poll::Ready(None)

        // Fetch next page
        LET page = ready!(self.builder.page(self.offset.as_deref()).poll(cx))?

        self.buffer.extend(page.records)

        MATCH page.offset:
            Some(next) => self.offset = Some(next),
            None => self.exhausted = true

        // Return first from new buffer
        MATCH self.buffer.pop_front():
            Some(record) => Poll::Ready(Some(OK(record))),
            None => Poll::Ready(None)
}
```

---

## 6. Metadata Operations

### 6.1 List Bases

```
IMPL AirtableClient {
    FUNCTION list_bases(&self) -> Result<Vec<Base>>:
        LET span = tracing::span!("airtable.meta.list_bases")
        LET _guard = span.enter()

        LET mut all_bases = Vec::new()
        LET mut offset: Option<String> = None

        LOOP:
            LET url = match &offset {
                Some(off) => format!(
                    "{}/meta/bases?offset={}",
                    self.config.base_url,
                    off
                ),
                None => format!("{}/meta/bases", self.config.base_url)
            }

            // Meta endpoints have separate rate limit
            LET response = self.execute_with_retry(
                Method::GET,
                &url,
                None
            ).await?

            LET bases: Vec<Base> = response["bases"].as_array()
                .map(|arr| arr.iter().map(parse_base).collect())
                .unwrap_or_default()?

            all_bases.extend(bases)

            MATCH response["offset"].as_str():
                Some(next) => offset = Some(next.to_string()),
                None => BREAK

        OK(all_bases)
}

STRUCT Base {
    id: String,
    name: String,
    permission_level: PermissionLevel
}

ENUM PermissionLevel {
    None,
    Read,
    Comment,
    Edit,
    Create
}
```

### 6.2 Get Base Schema

```
IMPL BaseHandle {
    FUNCTION schema(&self) -> Result<BaseSchema>:
        LET span = tracing::span!("airtable.meta.schema", base_id = %self.base_id)
        LET _guard = span.enter()

        LET url = format!(
            "{}/meta/bases/{}/tables",
            self.client.config.base_url,
            self.base_id
        )

        LET response = self.client.execute_with_retry(
            Method::GET,
            &url,
            None
        ).await?

        LET tables: Vec<TableSchema> = response["tables"].as_array()
            .map(|arr| arr.iter().map(parse_table_schema).collect())
            .unwrap_or_default()?

        OK(BaseSchema {
            base_id: self.base_id.clone(),
            tables
        })
}

STRUCT BaseSchema {
    base_id: String,
    tables: Vec<TableSchema>
}

STRUCT TableSchema {
    id: String,
    name: String,
    primary_field_id: String,
    fields: Vec<FieldSchema>,
    views: Vec<ViewSchema>
}

STRUCT FieldSchema {
    id: String,
    name: String,
    field_type: FieldType,
    options: Option<FieldOptions>
}

STRUCT ViewSchema {
    id: String,
    name: String,
    view_type: ViewType
}

ENUM ViewType { Grid, Form, Calendar, Gallery, Kanban, Timeline, List }
```

---

## 7. Webhook Management

### 7.1 Create Webhook

```
IMPL BaseHandle {
    FUNCTION create_webhook(&self, request: CreateWebhookRequest)
        -> Result<Webhook>:

        LET span = tracing::span!("airtable.webhook.create")
        LET _guard = span.enter()

        LET url = format!(
            "{}/bases/{}/webhooks",
            self.client.config.base_url,
            self.base_id
        )

        LET body = json!({
            "notificationUrl": request.notification_url,
            "specification": {
                "options": {
                    "filters": {
                        "dataTypes": request.data_types,
                        "recordChangeScope": request.record_change_scope,
                        "sourceOptions": request.source_options
                    }
                }
            }
        })

        LET response = self.client.execute_with_retry(
            Method::POST,
            &url,
            Some(body)
        ).await?

        parse_webhook(response)
}

STRUCT CreateWebhookRequest {
    notification_url: Option<String>,
    data_types: Vec<String>,           // ["tableData", "tableFields", "tableMetadata"]
    record_change_scope: Option<String>, // table ID or None for all
    source_options: Option<SourceOptions>
}

STRUCT Webhook {
    id: String,
    mac_secret_base64: String,
    notification_url: Option<String>,
    cursor_for_next_payload: u64,
    are_notifications_enabled: bool,
    expiration_time: DateTime<Utc>
}
```

### 7.2 Webhook Lifecycle

```
IMPL BaseHandle {
    FUNCTION list_webhooks(&self) -> Result<Vec<Webhook>>:
        LET url = format!(
            "{}/bases/{}/webhooks",
            self.client.config.base_url,
            self.base_id
        )

        LET response = self.client.execute_with_retry(
            Method::GET,
            &url,
            None
        ).await?

        parse_webhooks_array(response["webhooks"].clone())

    FUNCTION refresh_webhook(&self, webhook_id: &str) -> Result<Webhook>:
        LET url = format!(
            "{}/bases/{}/webhooks/{}/refresh",
            self.client.config.base_url,
            self.base_id,
            webhook_id
        )

        LET response = self.client.execute_with_retry(
            Method::POST,
            &url,
            None
        ).await?

        parse_webhook(response)

    FUNCTION delete_webhook(&self, webhook_id: &str) -> Result<()>:
        LET url = format!(
            "{}/bases/{}/webhooks/{}",
            self.client.config.base_url,
            self.base_id,
            webhook_id
        )

        self.client.execute_with_retry(
            Method::DELETE,
            &url,
            None
        ).await?

        OK(())
}
```

### 7.3 Webhook Payload Processing

```
STRUCT WebhookProcessor {
    secrets: HashMap<String, Vec<u8>>  // webhook_id -> decoded secret
}

IMPL WebhookProcessor {
    FUNCTION register_webhook(&mut self, webhook: &Webhook):
        LET secret = base64::decode(&webhook.mac_secret_base64)
            .expect("Valid base64 secret")
        self.secrets.insert(webhook.id.clone(), secret)

    FUNCTION verify_and_parse(&self, headers: &Headers, body: &[u8])
        -> Result<WebhookPayload>:

        LET span = tracing::span!("airtable.webhook.verify")
        LET _guard = span.enter()

        // Extract signature components
        LET signature_header = headers.get("X-Airtable-Content-MAC")
            .ok_or(Error::MissingSignature)?

        // Parse "hmac-sha256=<base64_signature>"
        LET parts: Vec<&str> = signature_header.splitn(2, '=').collect()
        IF parts.len() != 2 || parts[0] != "hmac-sha256":
            RETURN Err(Error::InvalidSignatureFormat)

        LET provided_sig = base64::decode(parts[1])?

        // Try each registered secret (webhook ID in payload identifies source)
        LET payload: WebhookPayload = serde_json::from_slice(body)?

        LET secret = self.secrets.get(&payload.webhook.id)
            .ok_or(Error::UnknownWebhook)?

        // Compute expected HMAC-SHA256
        LET mut mac = HmacSha256::new_from_slice(secret)?
        mac.update(body)

        // Constant-time comparison
        IF !constant_time_eq(&mac.finalize().into_bytes(), &provided_sig):
            RETURN Err(Error::InvalidSignature)

        OK(payload)

    FUNCTION fetch_changes(&self, base: &BaseHandle, webhook_id: &str, cursor: u64)
        -> Result<WebhookChanges>:

        LET url = format!(
            "{}/bases/{}/webhooks/{}/payloads?cursor={}",
            base.client.config.base_url,
            base.base_id,
            webhook_id,
            cursor
        )

        LET response = base.client.execute_with_retry(
            Method::GET,
            &url,
            None
        ).await?

        OK(WebhookChanges {
            payloads: parse_payloads(response["payloads"].clone())?,
            cursor: response["cursor"].as_u64().unwrap_or(cursor),
            might_have_more: response["mightHaveMore"].as_bool().unwrap_or(false)
        })
}

STRUCT WebhookPayload {
    base: WebhookBase,
    webhook: WebhookMeta,
    timestamp: DateTime<Utc>
}

STRUCT WebhookChanges {
    payloads: Vec<ChangePayload>,
    cursor: u64,
    might_have_more: bool
}
```

---

## 8. Rate Limit Handling

### 8.1 Token Bucket Implementation

```
IMPL TokenBucket {
    FUNCTION new(capacity: u32, refill_rate: Duration) -> Self:
        Self {
            tokens: AtomicU32::new(capacity),
            last_refill: AtomicU64::new(now_millis()),
            capacity,
            refill_rate
        }

    FUNCTION try_acquire(&self) -> bool:
        self.refill()

        LOOP:
            LET current = self.tokens.load(Ordering::Acquire)
            IF current == 0:
                RETURN false

            IF self.tokens.compare_exchange(
                current,
                current - 1,
                Ordering::AcqRel,
                Ordering::Relaxed
            ).is_ok():
                RETURN true

    FUNCTION refill(&self):
        LET now = now_millis()
        LET last = self.last_refill.load(Ordering::Acquire)
        LET elapsed = Duration::from_millis(now - last)

        LET tokens_to_add = (elapsed.as_millis() / self.refill_rate.as_millis()) as u32
        IF tokens_to_add == 0:
            RETURN

        IF self.last_refill.compare_exchange(
            last,
            now,
            Ordering::AcqRel,
            Ordering::Relaxed
        ).is_ok():
            LET current = self.tokens.load(Ordering::Acquire)
            LET new_tokens = (current + tokens_to_add).min(self.capacity)
            self.tokens.store(new_tokens, Ordering::Release)
}
```

### 8.2 Rate Limiter with Strategy

```
IMPL RateLimiter {
    FUNCTION new() -> Self:
        Self {
            base_slots: DashMap::new(),
            global_queue: Mutex::new(VecDeque::new()),
            config: RateLimitConfig::default()
        }

    FUNCTION acquire(&self, base_id: &str) -> Result<()>:
        LET bucket = self.base_slots
            .entry(base_id.to_string())
            .or_insert_with(|| TokenBucket::new(5, Duration::from_millis(200)))

        MATCH self.config.strategy:
            RateLimitStrategy::FailFast => {
                IF !bucket.try_acquire():
                    RETURN Err(Error::RateLimitExceeded)
                OK(())
            },

            RateLimitStrategy::Blocking => {
                WHILE !bucket.try_acquire():
                    tokio::time::sleep(Duration::from_millis(50)).await
                OK(())
            },

            RateLimitStrategy::Queued => {
                // Add to queue and return when slot available
                LET (tx, rx) = oneshot::channel()
                {
                    LET mut queue = self.global_queue.lock().await
                    queue.push_back(QueuedRequest {
                        base_id: base_id.to_string(),
                        notify: tx
                    })
                }
                rx.await.map_err(|_| Error::QueueClosed)
            }

    ASYNC FUNCTION handle_rate_limit_response(&self, base_id: &str, retry_after: Duration):
        // Drain the bucket for this base
        IF let Some(bucket) = self.base_slots.get(base_id):
            bucket.tokens.store(0, Ordering::Release)

        // Wait the specified time
        tokio::time::sleep(retry_after).await
}
```

### 8.3 Request Execution with Retry

```
IMPL AirtableClient {
    ASYNC FUNCTION execute_with_retry(
        &self,
        method: Method,
        url: &str,
        body: Option<Value>
    ) -> Result<Value>:

        LET mut attempts = 0
        LET max_attempts = self.config.max_retries + 1

        LOOP:
            attempts += 1

            LET request = self.http.request(method.clone(), url)
                .bearer_auth(self.credentials.get_token().await?.expose())
                .header("Content-Type", "application/json")

            LET request = match &body {
                Some(b) => request.json(b),
                None => request
            }

            LET start = Instant::now()
            LET response = request.send().await?
            LET duration = start.elapsed()

            self.metrics.record_request(method.as_str(), response.status(), duration)

            MATCH response.status():
                StatusCode::OK | StatusCode::CREATED => {
                    RETURN response.json().await
                },

                StatusCode::TOO_MANY_REQUESTS => {
                    IF attempts >= max_attempts:
                        RETURN Err(Error::RateLimitExhausted)

                    LET retry_after = response.headers()
                        .get("Retry-After")
                        .and_then(|v| v.to_str().ok())
                        .and_then(|s| s.parse::<u64>().ok())
                        .map(Duration::from_secs)
                        .unwrap_or(Duration::from_secs(30))

                    tracing::warn!(
                        "Rate limited, waiting {:?} before retry {}/{}",
                        retry_after, attempts, max_attempts
                    )

                    tokio::time::sleep(retry_after).await
                },

                status IF status.is_server_error() => {
                    IF attempts >= max_attempts:
                        RETURN Err(Error::ServerError { status })

                    LET backoff = Duration::from_millis(
                        100 * 2u64.pow(attempts as u32)
                    ) + jitter()

                    tracing::warn!(
                        "Server error {}, retrying in {:?}",
                        status, backoff
                    )

                    tokio::time::sleep(backoff).await
                },

                StatusCode::UNAUTHORIZED => {
                    RETURN Err(Error::Unauthorized)
                },

                StatusCode::NOT_FOUND => {
                    RETURN Err(Error::NotFound { url: url.to_string() })
                },

                StatusCode::UNPROCESSABLE_ENTITY => {
                    LET error_body: Value = response.json().await?
                    RETURN Err(Error::ValidationError {
                        message: error_body["error"]["message"]
                            .as_str()
                            .unwrap_or("Unknown error")
                            .to_string()
                    })
                },

                status => {
                    RETURN Err(Error::UnexpectedStatus { status })
                }
}
```

---

## 9. Simulation Layer

### 9.1 Recording

```
STRUCT SimulationLayer {
    mode: SimulationMode,
    recordings: RwLock<Vec<RecordedInteraction>>,
    replay_index: AtomicUsize
}

STRUCT RecordedInteraction {
    timestamp: DateTime<Utc>,
    operation: OperationType,
    request: RecordedRequest,
    response: RecordedResponse
}

STRUCT RecordedRequest {
    method: String,
    path: String,
    body: Option<Value>
}

STRUCT RecordedResponse {
    status: u16,
    body: Value
}

IMPL SimulationLayer {
    FUNCTION record(&self, interaction: RecordedInteraction):
        IF self.mode != SimulationMode::Record:
            RETURN

        LET mut recordings = self.recordings.write().await
        recordings.push(interaction)

    FUNCTION save_to_file(&self, path: &Path) -> Result<()>:
        LET recordings = self.recordings.read().await
        LET json = serde_json::to_string_pretty(&*recordings)?
        std::fs::write(path, json)?
        OK(())

    FUNCTION load_from_file(&self, path: &Path) -> Result<()>:
        LET content = std::fs::read_to_string(path)?
        LET recordings: Vec<RecordedInteraction> = serde_json::from_str(&content)?
        *self.recordings.write().await = recordings
        OK(())
}
```

### 9.2 Replay

```
IMPL SimulationLayer {
    FUNCTION replay_next(&self, expected_op: OperationType) -> Result<Value>:
        IF self.mode != SimulationMode::Replay:
            RETURN Err(Error::NotInReplayMode)

        LET recordings = self.recordings.read().await
        LET index = self.replay_index.fetch_add(1, Ordering::SeqCst)

        LET interaction = recordings.get(index)
            .ok_or(Error::ReplayExhausted)?

        IF interaction.operation != expected_op:
            RETURN Err(Error::ReplayMismatch {
                expected: expected_op,
                actual: interaction.operation.clone()
            })

        // Simulate network latency for realistic timing
        tokio::time::sleep(Duration::from_millis(10)).await

        IF interaction.response.status >= 400:
            RETURN Err(Error::SimulatedError {
                status: interaction.response.status
            })

        OK(interaction.response.body.clone())

    FUNCTION reset_replay(&self):
        self.replay_index.store(0, Ordering::SeqCst)
}
```

### 9.3 Mock Webhooks

```
STRUCT WebhookSimulator {
    pending_events: Mutex<VecDeque<WebhookPayload>>
}

IMPL WebhookSimulator {
    FUNCTION queue_event(&self, event: WebhookPayload):
        LET mut queue = self.pending_events.lock().await
        queue.push_back(event)

    FUNCTION simulate_record_created(
        &self,
        base_id: &str,
        table_id: &str,
        record: &Record
    ):
        LET payload = WebhookPayload {
            base: WebhookBase { id: base_id.to_string() },
            webhook: WebhookMeta { id: "sim_webhook".to_string() },
            timestamp: Utc::now(),
            action_metadata: ActionMetadata {
                source: "simulated".to_string(),
                source_metadata: None
            },
            payloads: vec![ChangePayload {
                table_id: table_id.to_string(),
                changed_records: vec![ChangedRecord {
                    id: record.id.clone(),
                    created_time: record.created_time,
                    cell_values_by_field_id: Some(record.fields.clone())
                }],
                created_records_by_id: Some([(record.id.clone(), record.clone())].into()),
                changed_records_by_id: None,
                destroyed_record_ids: None
            }]
        }

        self.queue_event(payload).await

    FUNCTION drain_events(&self) -> Vec<WebhookPayload>:
        LET mut queue = self.pending_events.lock().await
        queue.drain(..).collect()
}
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-AIRTABLE-PSEUDO-001 |
| Version | 1.0.0 |
| Created | 2025-12-14 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Pseudocode Document**

*Proceed to Architecture phase upon approval.*
