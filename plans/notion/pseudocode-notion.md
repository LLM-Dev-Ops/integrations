# Pseudocode: Notion Integration Module

## SPARC Phase 2: Pseudocode

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/notion`

---

## Table of Contents

1. [Core Types](#1-core-types)
2. [Configuration](#2-configuration)
3. [Client Structure](#3-client-structure)
4. [Page Operations](#4-page-operations)
5. [Database Operations](#5-database-operations)
6. [Block Operations](#6-block-operations)
7. [Search Operations](#7-search-operations)
8. [Property Handling](#8-property-handling)
9. [Rate Limiting](#9-rate-limiting)
10. [Simulation Layer](#10-simulation-layer)
11. [Error Handling](#11-error-handling)

---

## 1. Core Types

### 1.1 Reference Types

```
ENUM PageRef {
    Id(String),
    Url(String)
}

FUNCTION PageRef.to_id() -> Result<String>:
    MATCH self:
        Id(id) -> RETURN Ok(id)
        Url(url) -> RETURN extract_notion_id(url)

ENUM DatabaseRef {
    Id(String),
    Url(String)
}

STRUCT BlockRef {
    id: String
}

ENUM ParentRef {
    Page(PageRef),
    Database(DatabaseRef),
    Block(BlockRef),
    Workspace
}
```

### 1.2 Rich Text

```
STRUCT RichText {
    content: String,
    annotations: Annotations,
    link: Option<String>
}

STRUCT Annotations {
    bold: bool,
    italic: bool,
    strikethrough: bool,
    underline: bool,
    code: bool,
    color: Color
}

ENUM Color {
    Default, Gray, Brown, Orange, Yellow,
    Green, Blue, Purple, Pink, Red,
    GrayBackground, BrownBackground, ...
}

FUNCTION RichText.plain(text: String) -> RichText:
    RETURN RichText {
        content: text,
        annotations: Annotations::default(),
        link: None
    }
```

### 1.3 Block Types

```
ENUM BlockContent {
    Paragraph { rich_text: Vec<RichText> },
    Heading1 { rich_text: Vec<RichText>, is_toggleable: bool },
    Heading2 { rich_text: Vec<RichText>, is_toggleable: bool },
    Heading3 { rich_text: Vec<RichText>, is_toggleable: bool },
    BulletedListItem { rich_text: Vec<RichText> },
    NumberedListItem { rich_text: Vec<RichText> },
    ToDo { rich_text: Vec<RichText>, checked: bool },
    Toggle { rich_text: Vec<RichText> },
    Code { rich_text: Vec<RichText>, language: String },
    Quote { rich_text: Vec<RichText> },
    Callout { rich_text: Vec<RichText>, icon: Icon },
    Divider,
    TableOfContents { color: Color },
    Bookmark { url: String, caption: Vec<RichText> },
    Image { source: FileSource },
    Video { source: FileSource },
    Embed { url: String },
    Table { table_width: u32, has_column_header: bool, has_row_header: bool },
    TableRow { cells: Vec<Vec<RichText>> },
    ChildPage { title: String },
    ChildDatabase { title: String },
    Unsupported { type_name: String }
}

STRUCT Block {
    id: String,
    parent: ParentRef,
    created_time: DateTime,
    last_edited_time: DateTime,
    has_children: bool,
    archived: bool,
    content: BlockContent
}
```

---

## 2. Configuration

```
STRUCT NotionConfig {
    api_version: String,           // "2022-06-28"
    base_url: String,              // "https://api.notion.com/v1"
    timeout: Duration,             // 30s
    max_retries: u32,              // 3
    rate_limit: RateLimitConfig,
    simulation_mode: SimulationMode
}

STRUCT RateLimitConfig {
    requests_per_second: f64,      // 3.0
    burst_size: u32,               // 10
    retry_after_buffer: Duration   // 100ms
}

ENUM SimulationMode {
    Disabled,
    Recording { path: PathBuf },
    Replay { path: PathBuf }
}

CLASS NotionConfigBuilder {
    config: NotionConfig

    FUNCTION new() -> Self:
        RETURN Self { config: NotionConfig::default() }

    FUNCTION api_version(version: String) -> Self:
        self.config.api_version = version
        RETURN self

    FUNCTION timeout(duration: Duration) -> Self:
        self.config.timeout = duration
        RETURN self

    FUNCTION simulation(mode: SimulationMode) -> Self:
        self.config.simulation_mode = mode
        RETURN self

    FUNCTION build() -> NotionConfig:
        RETURN self.config
}
```

---

## 3. Client Structure

```
STRUCT NotionClient {
    config: Arc<NotionConfig>,
    auth: Arc<dyn TokenProvider>,      // Shared auth
    http_client: Arc<HttpClient>,
    rate_limiter: Arc<RateLimiter>,
    simulation: Arc<SimulationLayer>,
    metrics: Arc<MetricsCollector>
}

FUNCTION NotionClient.new(
    config: NotionConfig,
    auth: Arc<dyn TokenProvider>
) -> Result<Self>:

    http_client = HttpClient::builder()
        .timeout(config.timeout)
        .build()?

    rate_limiter = RateLimiter::new(config.rate_limit)
    simulation = SimulationLayer::new(config.simulation_mode)
    metrics = MetricsCollector::new("notion")

    RETURN Ok(Self {
        config: Arc::new(config),
        auth,
        http_client: Arc::new(http_client),
        rate_limiter: Arc::new(rate_limiter),
        simulation: Arc::new(simulation),
        metrics: Arc::new(metrics)
    })

FUNCTION NotionClient.request<T>(
    method: Method,
    endpoint: String,
    body: Option<Value>
) -> Result<T>:

    // Check simulation replay first
    IF self.simulation.is_replay():
        cache_key = self.simulation.cache_key(method, endpoint, body)
        IF cached = self.simulation.get(cache_key):
            RETURN deserialize(cached)

    // Acquire rate limit permit
    self.rate_limiter.acquire().await

    // Build request
    token = self.auth.get_token().await?

    request = self.http_client
        .request(method, format!("{}{}", self.config.base_url, endpoint))
        .header("Authorization", format!("Bearer {}", token.expose()))
        .header("Notion-Version", self.config.api_version)
        .header("Content-Type", "application/json")

    IF body IS Some(b):
        request = request.json(b)

    // Execute with retry
    response = self.execute_with_retry(request).await?

    // Record if in recording mode
    IF self.simulation.is_recording():
        cache_key = self.simulation.cache_key(method, endpoint, body)
        self.simulation.record(cache_key, response.clone())

    RETURN deserialize(response)

FUNCTION NotionClient.execute_with_retry(request: Request) -> Result<Response>:
    retries = 0

    LOOP:
        start = Instant::now()
        result = request.clone().send().await

        self.metrics.record_request(start.elapsed())

        MATCH result:
            Ok(response):
                status = response.status()

                IF status.is_success():
                    RETURN Ok(response)

                IF status == 429:
                    retry_after = parse_retry_after(response.headers())
                    self.metrics.increment("rate_limited")
                    sleep(retry_after).await
                    CONTINUE

                IF status.is_server_error() AND retries < self.config.max_retries:
                    retries += 1
                    delay = exponential_backoff(retries)
                    sleep(delay).await
                    CONTINUE

                RETURN Err(NotionError::from_response(response))

            Err(e):
                IF retries < self.config.max_retries:
                    retries += 1
                    delay = exponential_backoff(retries)
                    sleep(delay).await
                    CONTINUE
                RETURN Err(NotionError::Network(e))
```

---

## 4. Page Operations

### 4.1 Create Page

```
STRUCT CreatePageRequest {
    parent: ParentRef,
    properties: HashMap<String, PropertyValue>,
    children: Option<Vec<BlockContent>>,
    icon: Option<Icon>,
    cover: Option<FileSource>
}

FUNCTION NotionClient.create_page(request: CreatePageRequest) -> Result<Page>:
    // Build parent object
    parent_json = MATCH request.parent:
        Page(ref_) -> { "page_id": ref_.to_id()? }
        Database(ref_) -> { "database_id": ref_.to_id()? }
        _ -> RETURN Err(InvalidParent)

    // Build properties
    properties_json = serialize_properties(request.properties)

    body = {
        "parent": parent_json,
        "properties": properties_json
    }

    IF request.children IS Some(children):
        body["children"] = serialize_blocks(children)

    IF request.icon IS Some(icon):
        body["icon"] = serialize_icon(icon)

    IF request.cover IS Some(cover):
        body["cover"] = serialize_file_source(cover)

    response = self.request(POST, "/pages", Some(body)).await?
    RETURN Page::from_response(response)
```

### 4.2 Retrieve Page

```
FUNCTION NotionClient.get_page(page_ref: PageRef) -> Result<Page>:
    page_id = page_ref.to_id()?
    endpoint = format!("/pages/{}", page_id)

    response = self.request(GET, endpoint, None).await?
    RETURN Page::from_response(response)

FUNCTION NotionClient.get_page_property(
    page_ref: PageRef,
    property_id: String
) -> Result<PropertyValue>:
    page_id = page_ref.to_id()?
    endpoint = format!("/pages/{}/properties/{}", page_id, property_id)

    response = self.request(GET, endpoint, None).await?
    RETURN PropertyValue::from_response(response)
```

### 4.3 Update Page

```
STRUCT UpdatePageRequest {
    properties: Option<HashMap<String, PropertyValue>>,
    icon: Option<Icon>,
    cover: Option<FileSource>,
    archived: Option<bool>
}

FUNCTION NotionClient.update_page(
    page_ref: PageRef,
    request: UpdatePageRequest
) -> Result<Page>:
    page_id = page_ref.to_id()?
    endpoint = format!("/pages/{}", page_id)

    body = {}

    IF request.properties IS Some(props):
        body["properties"] = serialize_properties(props)

    IF request.icon IS Some(icon):
        body["icon"] = serialize_icon(icon)

    IF request.cover IS Some(cover):
        body["cover"] = serialize_file_source(cover)

    IF request.archived IS Some(archived):
        body["archived"] = archived

    response = self.request(PATCH, endpoint, Some(body)).await?
    RETURN Page::from_response(response)
```

### 4.4 Archive/Restore Page

```
FUNCTION NotionClient.archive_page(page_ref: PageRef) -> Result<Page>:
    RETURN self.update_page(page_ref, UpdatePageRequest {
        archived: Some(true),
        ..Default::default()
    }).await

FUNCTION NotionClient.restore_page(page_ref: PageRef) -> Result<Page>:
    RETURN self.update_page(page_ref, UpdatePageRequest {
        archived: Some(false),
        ..Default::default()
    }).await
```

---

## 5. Database Operations

### 5.1 Query Database

```
STRUCT DatabaseQuery {
    filter: Option<Filter>,
    sorts: Vec<Sort>,
    start_cursor: Option<String>,
    page_size: Option<u32>          // Max 100
}

STRUCT Sort {
    property: Option<String>,
    timestamp: Option<TimestampSort>,
    direction: SortDirection
}

ENUM SortDirection { Ascending, Descending }
ENUM TimestampSort { CreatedTime, LastEditedTime }

FUNCTION NotionClient.query_database(
    database_ref: DatabaseRef,
    query: DatabaseQuery
) -> Result<PaginatedResults<Page>>:
    db_id = database_ref.to_id()?
    endpoint = format!("/databases/{}/query", db_id)

    body = {}

    IF query.filter IS Some(filter):
        body["filter"] = serialize_filter(filter)

    IF NOT query.sorts.is_empty():
        body["sorts"] = serialize_sorts(query.sorts)

    IF query.start_cursor IS Some(cursor):
        body["start_cursor"] = cursor

    IF query.page_size IS Some(size):
        body["page_size"] = min(size, 100)

    response = self.request(POST, endpoint, Some(body)).await?

    RETURN PaginatedResults {
        results: response["results"].iter().map(Page::from_json).collect(),
        next_cursor: response["next_cursor"].as_str().map(String::from),
        has_more: response["has_more"].as_bool().unwrap_or(false)
    }

FUNCTION NotionClient.query_database_all(
    database_ref: DatabaseRef,
    query: DatabaseQuery
) -> Result<Vec<Page>>:
    all_results = Vec::new()
    cursor = None

    LOOP:
        query_with_cursor = query.clone().with_cursor(cursor)
        page = self.query_database(database_ref, query_with_cursor).await?

        all_results.extend(page.results)

        IF NOT page.has_more:
            BREAK

        cursor = page.next_cursor

    RETURN Ok(all_results)
```

### 5.2 Retrieve Database

```
FUNCTION NotionClient.get_database(database_ref: DatabaseRef) -> Result<Database>:
    db_id = database_ref.to_id()?
    endpoint = format!("/databases/{}", db_id)

    response = self.request(GET, endpoint, None).await?
    RETURN Database::from_response(response)

STRUCT Database {
    id: String,
    title: Vec<RichText>,
    description: Vec<RichText>,
    properties: HashMap<String, PropertySchema>,
    parent: ParentRef,
    url: String,
    archived: bool,
    created_time: DateTime,
    last_edited_time: DateTime
}
```

---

## 6. Block Operations

### 6.1 Retrieve Block

```
FUNCTION NotionClient.get_block(block_ref: BlockRef) -> Result<Block>:
    endpoint = format!("/blocks/{}", block_ref.id)

    response = self.request(GET, endpoint, None).await?
    RETURN Block::from_response(response)
```

### 6.2 Get Block Children

```
FUNCTION NotionClient.get_block_children(
    block_ref: BlockRef,
    start_cursor: Option<String>,
    page_size: Option<u32>
) -> Result<PaginatedResults<Block>>:
    endpoint = format!("/blocks/{}/children", block_ref.id)

    query_params = Vec::new()
    IF start_cursor IS Some(cursor):
        query_params.push(format!("start_cursor={}", cursor))
    IF page_size IS Some(size):
        query_params.push(format!("page_size={}", min(size, 100)))

    IF NOT query_params.is_empty():
        endpoint = format!("{}?{}", endpoint, query_params.join("&"))

    response = self.request(GET, endpoint, None).await?

    RETURN PaginatedResults {
        results: response["results"].iter().map(Block::from_json).collect(),
        next_cursor: response["next_cursor"].as_str().map(String::from),
        has_more: response["has_more"].as_bool().unwrap_or(false)
    }

FUNCTION NotionClient.get_all_block_children(
    block_ref: BlockRef
) -> Result<Vec<Block>>:
    all_blocks = Vec::new()
    cursor = None

    LOOP:
        page = self.get_block_children(block_ref, cursor, Some(100)).await?
        all_blocks.extend(page.results)

        IF NOT page.has_more:
            BREAK

        cursor = page.next_cursor

    RETURN Ok(all_blocks)
```

### 6.3 Recursive Block Retrieval

```
FUNCTION NotionClient.get_blocks_recursive(
    block_ref: BlockRef
) -> Result<Vec<Block>>:
    blocks = self.get_all_block_children(block_ref).await?
    result = Vec::new()

    FOR block IN blocks:
        result.push(block.clone())

        IF block.has_children:
            child_ref = BlockRef { id: block.id.clone() }
            children = self.get_blocks_recursive(child_ref).await?
            result.extend(children)

    RETURN Ok(result)

// Async stream version for memory efficiency
FUNCTION NotionClient.stream_blocks_recursive(
    block_ref: BlockRef
) -> impl Stream<Item = Result<Block>>:
    async_stream::stream! {
        blocks = self.get_all_block_children(block_ref).await?

        FOR block IN blocks:
            yield Ok(block.clone())

            IF block.has_children:
                child_ref = BlockRef { id: block.id.clone() }
                child_stream = self.stream_blocks_recursive(child_ref)

                pin_mut!(child_stream)
                WHILE let Some(child) = child_stream.next().await:
                    yield child
    }
```

### 6.4 Append Block Children

```
FUNCTION NotionClient.append_block_children(
    block_ref: BlockRef,
    children: Vec<BlockContent>
) -> Result<Vec<Block>>:
    // API limit: 100 blocks per request
    IF children.len() > 100:
        RETURN self.append_block_children_batched(block_ref, children).await

    endpoint = format!("/blocks/{}/children", block_ref.id)

    body = {
        "children": serialize_blocks(children)
    }

    response = self.request(PATCH, endpoint, Some(body)).await?

    RETURN response["results"].iter().map(Block::from_json).collect()

FUNCTION NotionClient.append_block_children_batched(
    block_ref: BlockRef,
    children: Vec<BlockContent>
) -> Result<Vec<Block>>:
    all_results = Vec::new()

    FOR chunk IN children.chunks(100):
        results = self.append_block_children(block_ref, chunk.to_vec()).await?
        all_results.extend(results)

    RETURN Ok(all_results)
```

### 6.5 Update Block

```
FUNCTION NotionClient.update_block(
    block_ref: BlockRef,
    content: BlockContent
) -> Result<Block>:
    endpoint = format!("/blocks/{}", block_ref.id)

    body = serialize_block_for_update(content)

    response = self.request(PATCH, endpoint, Some(body)).await?
    RETURN Block::from_response(response)
```

### 6.6 Delete Block

```
FUNCTION NotionClient.delete_block(block_ref: BlockRef) -> Result<()>:
    endpoint = format!("/blocks/{}", block_ref.id)

    self.request(DELETE, endpoint, None).await?
    RETURN Ok(())
```

---

## 7. Search Operations

```
STRUCT SearchQuery {
    query: Option<String>,
    filter: Option<SearchFilter>,
    sort: Option<SearchSort>,
    start_cursor: Option<String>,
    page_size: Option<u32>
}

STRUCT SearchFilter {
    value: SearchFilterValue,
    property: String              // Always "object"
}

ENUM SearchFilterValue { Page, Database }

STRUCT SearchSort {
    direction: SortDirection,
    timestamp: String             // "last_edited_time"
}

FUNCTION NotionClient.search(query: SearchQuery) -> Result<PaginatedResults<SearchResult>>:
    endpoint = "/search"

    body = {}

    IF query.query IS Some(q):
        body["query"] = q

    IF query.filter IS Some(filter):
        body["filter"] = {
            "value": match filter.value {
                Page -> "page",
                Database -> "database"
            },
            "property": "object"
        }

    IF query.sort IS Some(sort):
        body["sort"] = {
            "direction": match sort.direction {
                Ascending -> "ascending",
                Descending -> "descending"
            },
            "timestamp": sort.timestamp
        }

    IF query.start_cursor IS Some(cursor):
        body["start_cursor"] = cursor

    IF query.page_size IS Some(size):
        body["page_size"] = min(size, 100)

    response = self.request(POST, endpoint, Some(body)).await?

    RETURN PaginatedResults {
        results: response["results"].iter().map(SearchResult::from_json).collect(),
        next_cursor: response["next_cursor"].as_str().map(String::from),
        has_more: response["has_more"].as_bool().unwrap_or(false)
    }

ENUM SearchResult {
    Page(Page),
    Database(Database)
}
```

---

## 8. Property Handling

### 8.1 Serialize Properties

```
FUNCTION serialize_properties(
    properties: HashMap<String, PropertyValue>
) -> Value:
    result = {}

    FOR (name, value) IN properties:
        result[name] = MATCH value:
            Title(texts) -> {
                "title": texts.iter().map(serialize_rich_text).collect()
            }
            RichText(texts) -> {
                "rich_text": texts.iter().map(serialize_rich_text).collect()
            }
            Number(n) -> {
                "number": n
            }
            Select(opt) -> {
                "select": opt.map(|o| { "name": o.name })
            }
            MultiSelect(opts) -> {
                "multi_select": opts.iter().map(|o| { "name": o.name }).collect()
            }
            Date(d) -> {
                "date": d.map(serialize_date)
            }
            Checkbox(checked) -> {
                "checkbox": checked
            }
            Url(u) -> {
                "url": u
            }
            Email(e) -> {
                "email": e
            }
            Phone(p) -> {
                "phone_number": p
            }
            Relation(pages) -> {
                "relation": pages.iter().map(|p| { "id": p.to_id().unwrap() }).collect()
            }
            People(users) -> {
                "people": users.iter().map(|u| { "id": u.id }).collect()
            }
            Status(s) -> {
                "status": s.map(|st| { "name": st.name })
            }
            _ -> CONTINUE  // Skip read-only properties

    RETURN result
```

### 8.2 Deserialize Properties

```
FUNCTION deserialize_properties(json: Value) -> HashMap<String, PropertyValue>:
    result = HashMap::new()

    FOR (name, prop) IN json.as_object():
        prop_type = prop["type"].as_str()

        value = MATCH prop_type:
            "title" -> Title(deserialize_rich_texts(prop["title"]))
            "rich_text" -> RichText(deserialize_rich_texts(prop["rich_text"]))
            "number" -> Number(prop["number"].as_f64())
            "select" -> Select(deserialize_select_option(prop["select"]))
            "multi_select" -> MultiSelect(deserialize_select_options(prop["multi_select"]))
            "date" -> Date(deserialize_date(prop["date"]))
            "checkbox" -> Checkbox(prop["checkbox"].as_bool().unwrap_or(false))
            "url" -> Url(prop["url"].as_str().map(String::from))
            "email" -> Email(prop["email"].as_str().map(String::from))
            "phone_number" -> Phone(prop["phone_number"].as_str().map(String::from))
            "relation" -> Relation(deserialize_relations(prop["relation"]))
            "rollup" -> Rollup(deserialize_rollup(prop["rollup"]))
            "formula" -> Formula(deserialize_formula(prop["formula"]))
            "people" -> People(deserialize_people(prop["people"]))
            "files" -> Files(deserialize_files(prop["files"]))
            "status" -> Status(deserialize_status(prop["status"]))
            "created_time" -> CreatedTime(parse_datetime(prop["created_time"]))
            "last_edited_time" -> LastEditedTime(parse_datetime(prop["last_edited_time"]))
            "created_by" -> CreatedBy(deserialize_user(prop["created_by"]))
            "last_edited_by" -> LastEditedBy(deserialize_user(prop["last_edited_by"]))
            _ -> CONTINUE

        result.insert(name, value)

    RETURN result
```

### 8.3 Filter Building

```
STRUCT FilterBuilder {
    filters: Vec<Filter>
}

FUNCTION FilterBuilder.new() -> Self:
    RETURN Self { filters: Vec::new() }

FUNCTION FilterBuilder.text_equals(property: String, value: String) -> Self:
    self.filters.push(Filter::Property {
        property,
        condition: PropertyCondition::Text(TextCondition::Equals(value))
    })
    RETURN self

FUNCTION FilterBuilder.text_contains(property: String, value: String) -> Self:
    self.filters.push(Filter::Property {
        property,
        condition: PropertyCondition::Text(TextCondition::Contains(value))
    })
    RETURN self

FUNCTION FilterBuilder.checkbox_equals(property: String, value: bool) -> Self:
    self.filters.push(Filter::Property {
        property,
        condition: PropertyCondition::Checkbox(CheckboxCondition::Equals(value))
    })
    RETURN self

FUNCTION FilterBuilder.date_after(property: String, date: DateTime) -> Self:
    self.filters.push(Filter::Property {
        property,
        condition: PropertyCondition::Date(DateCondition::After(date))
    })
    RETURN self

FUNCTION FilterBuilder.and() -> Filter:
    RETURN Filter::And(self.filters.clone())

FUNCTION FilterBuilder.or() -> Filter:
    RETURN Filter::Or(self.filters.clone())
```

---

## 9. Rate Limiting

```
STRUCT RateLimiter {
    permits: Arc<Semaphore>,
    last_request: Arc<Mutex<Instant>>,
    min_interval: Duration,
    retry_after: Arc<AtomicU64>
}

FUNCTION RateLimiter.new(config: RateLimitConfig) -> Self:
    min_interval = Duration::from_secs_f64(1.0 / config.requests_per_second)

    RETURN Self {
        permits: Arc::new(Semaphore::new(config.burst_size as usize)),
        last_request: Arc::new(Mutex::new(Instant::now())),
        min_interval,
        retry_after: Arc::new(AtomicU64::new(0))
    }

FUNCTION RateLimiter.acquire():
    // Check for active retry-after
    retry_until = self.retry_after.load(Ordering::Relaxed)
    IF retry_until > 0:
        now = current_timestamp_ms()
        IF now < retry_until:
            sleep(Duration::from_millis(retry_until - now)).await

    // Acquire semaphore permit
    permit = self.permits.acquire().await

    // Enforce minimum interval
    last = self.last_request.lock().await
    elapsed = last.elapsed()
    IF elapsed < self.min_interval:
        sleep(self.min_interval - elapsed).await

    *last = Instant::now()
    drop(last)

    // Return permit after delay to replenish
    spawn(async move {
        sleep(self.min_interval).await
        drop(permit)
    })

FUNCTION RateLimiter.set_retry_after(duration: Duration):
    until = current_timestamp_ms() + duration.as_millis() as u64
    self.retry_after.store(until, Ordering::Relaxed)
```

---

## 10. Simulation Layer

```
STRUCT SimulationLayer {
    mode: SimulationMode,
    recordings: Arc<RwLock<HashMap<String, RecordedResponse>>>,
    file_path: Option<PathBuf>
}

STRUCT RecordedResponse {
    status: u16,
    headers: HashMap<String, String>,
    body: Value,
    content_hash: String
}

FUNCTION SimulationLayer.new(mode: SimulationMode) -> Self:
    file_path = MATCH mode:
        Recording { path } -> Some(path),
        Replay { path } -> Some(path),
        Disabled -> None

    recordings = IF let Some(path) = file_path AND path.exists():
        load_recordings(path)
    ELSE:
        HashMap::new()

    RETURN Self {
        mode,
        recordings: Arc::new(RwLock::new(recordings)),
        file_path
    }

FUNCTION SimulationLayer.cache_key(
    method: Method,
    endpoint: String,
    body: Option<Value>
) -> String:
    hasher = Sha256::new()
    hasher.update(method.as_str().as_bytes())
    hasher.update(endpoint.as_bytes())
    IF body IS Some(b):
        hasher.update(serde_json::to_string(&b).unwrap().as_bytes())

    RETURN hex::encode(hasher.finalize())

FUNCTION SimulationLayer.is_replay() -> bool:
    MATCH self.mode:
        Replay { .. } -> true
        _ -> false

FUNCTION SimulationLayer.is_recording() -> bool:
    MATCH self.mode:
        Recording { .. } -> true
        _ -> false

FUNCTION SimulationLayer.get(key: String) -> Option<RecordedResponse>:
    recordings = self.recordings.read().await
    RETURN recordings.get(&key).cloned()

FUNCTION SimulationLayer.record(key: String, response: Response):
    body = response.json().await.unwrap_or(Value::Null)
    content_hash = compute_content_hash(&body)

    recorded = RecordedResponse {
        status: response.status().as_u16(),
        headers: extract_headers(response.headers()),
        body,
        content_hash
    }

    recordings = self.recordings.write().await
    recordings.insert(key, recorded)

    // Persist to file
    IF let Some(path) = &self.file_path:
        save_recordings(path, &recordings)

FUNCTION SimulationLayer.flush():
    IF let Some(path) = &self.file_path:
        recordings = self.recordings.read().await
        save_recordings(path, &recordings)
```

---

## 11. Error Handling

```
ENUM NotionError {
    // API Errors
    InvalidRequest { message: String },
    Unauthorized { message: String },
    Forbidden { message: String },
    NotFound { object_type: String, id: String },
    Conflict { message: String },
    RateLimited { retry_after: Duration },
    InternalError { message: String },
    ServiceUnavailable,

    // Client Errors
    InvalidId { input: String },
    InvalidUrl { input: String },
    SerializationError { source: serde_json::Error },
    Network { source: reqwest::Error },
    Timeout,

    // Simulation Errors
    SimulationMiss { key: String },
    SimulationCorrupted { path: PathBuf }
}

FUNCTION NotionError.from_response(response: Response) -> Self:
    status = response.status()
    body = response.json().await.unwrap_or_default()
    message = body["message"].as_str().unwrap_or("Unknown error").to_string()

    MATCH status.as_u16():
        400 -> InvalidRequest { message }
        401 -> Unauthorized { message }
        403 -> Forbidden { message }
        404 -> NotFound {
            object_type: body["object"].as_str().unwrap_or("unknown").to_string(),
            id: body["id"].as_str().unwrap_or("").to_string()
        }
        409 -> Conflict { message }
        429 -> RateLimited {
            retry_after: parse_retry_after(response.headers())
        }
        500 -> InternalError { message }
        503 -> ServiceUnavailable
        _ -> InternalError { message }

FUNCTION NotionError.is_retryable() -> bool:
    MATCH self:
        RateLimited { .. } -> true
        InternalError { .. } -> true
        ServiceUnavailable -> true
        Network { .. } -> true
        Timeout -> true
        _ -> false
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-NOTION-PSEUDO-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Pseudocode Document**

*Proceed to Architecture phase upon approval.*
