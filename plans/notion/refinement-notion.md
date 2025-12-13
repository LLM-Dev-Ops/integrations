# Refinement: Notion Integration Module

## SPARC Phase 4: Refinement

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/notion`

---

## Table of Contents

1. [Code Standards](#1-code-standards)
2. [Interface Contracts](#2-interface-contracts)
3. [Validation Rules](#3-validation-rules)
4. [Security Hardening](#4-security-hardening)
5. [Performance Optimization](#5-performance-optimization)
6. [Testing Strategy](#6-testing-strategy)
7. [CI/CD Configuration](#7-cicd-configuration)
8. [Observability](#8-observability)

---

## 1. Code Standards

### 1.1 Rust Conventions

```rust
// Naming conventions
struct NotionClient;              // PascalCase for types
fn create_page();                 // snake_case for functions
const MAX_BLOCKS_PER_REQUEST: u32 = 100;  // SCREAMING_SNAKE for constants
type Result<T> = std::result::Result<T, NotionError>;  // Type aliases

// Error handling - use thiserror
#[derive(Debug, thiserror::Error)]
pub enum NotionError {
    #[error("Invalid request: {message}")]
    InvalidRequest { message: String },

    #[error("Rate limited, retry after {retry_after:?}")]
    RateLimited { retry_after: Duration },

    #[error("Not found: {object_type} with id {id}")]
    NotFound { object_type: String, id: String },
}

// Builder pattern for complex types
impl NotionConfigBuilder {
    pub fn new() -> Self { Self::default() }
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }
    pub fn build(self) -> Result<NotionConfig> {
        // Validate and construct
    }
}
```

### 1.2 Documentation Standards

```rust
/// Creates a new page in Notion.
///
/// # Arguments
///
/// * `request` - The page creation request containing parent, properties, and optional content
///
/// # Returns
///
/// Returns the created `Page` with its assigned ID and timestamps.
///
/// # Errors
///
/// * `NotionError::InvalidRequest` - If the parent or properties are invalid
/// * `NotionError::Forbidden` - If the integration lacks permission
/// * `NotionError::RateLimited` - If rate limit exceeded (auto-retried)
///
/// # Example
///
/// ```rust
/// let page = client.create_page(CreatePageRequest {
///     parent: ParentRef::Database(db_ref),
///     properties: hashmap! {
///         "Name" => PropertyValue::title("My Page"),
///     },
///     children: None,
///     icon: None,
///     cover: None,
/// }).await?;
/// ```
pub async fn create_page(&self, request: CreatePageRequest) -> Result<Page>
```

### 1.3 Module Organization

```rust
// lib.rs - clean public exports
pub mod client;
pub mod types;
pub mod error;

pub use client::{NotionClient, NotionConfig, NotionConfigBuilder};
pub use types::*;
pub use error::NotionError;

// Prelude for common imports
pub mod prelude {
    pub use crate::{
        NotionClient, NotionConfig, NotionConfigBuilder,
        PageRef, DatabaseRef, BlockRef, ParentRef,
        Block, BlockContent, RichText,
        PropertyValue, Filter, FilterBuilder,
        Page, Database, PaginatedResults,
        NotionError,
    };
}
```

---

## 2. Interface Contracts

### 2.1 Client Trait

```rust
#[async_trait]
pub trait NotionOperations: Send + Sync {
    // Pages
    async fn create_page(&self, request: CreatePageRequest) -> Result<Page>;
    async fn get_page(&self, page_ref: PageRef) -> Result<Page>;
    async fn update_page(&self, page_ref: PageRef, request: UpdatePageRequest) -> Result<Page>;
    async fn archive_page(&self, page_ref: PageRef) -> Result<Page>;

    // Databases
    async fn get_database(&self, db_ref: DatabaseRef) -> Result<Database>;
    async fn query_database(&self, db_ref: DatabaseRef, query: DatabaseQuery) -> Result<PaginatedResults<Page>>;

    // Blocks
    async fn get_block(&self, block_ref: BlockRef) -> Result<Block>;
    async fn get_block_children(&self, block_ref: BlockRef, cursor: Option<String>) -> Result<PaginatedResults<Block>>;
    async fn append_block_children(&self, block_ref: BlockRef, children: Vec<BlockContent>) -> Result<Vec<Block>>;
    async fn update_block(&self, block_ref: BlockRef, content: BlockContent) -> Result<Block>;
    async fn delete_block(&self, block_ref: BlockRef) -> Result<()>;

    // Search
    async fn search(&self, query: SearchQuery) -> Result<PaginatedResults<SearchResult>>;
}
```

### 2.2 Token Provider Contract

```rust
#[async_trait]
pub trait TokenProvider: Send + Sync {
    /// Returns a valid access token.
    /// Implementation should handle refresh if needed.
    async fn get_token(&self) -> Result<SecretString>;

    /// Invalidates the current token, forcing refresh on next call.
    async fn invalidate(&self);
}

// Shared auth integration
pub struct SharedAuthTokenProvider {
    auth_client: Arc<dyn AuthClient>,
    integration_id: String,
}

impl TokenProvider for SharedAuthTokenProvider {
    async fn get_token(&self) -> Result<SecretString> {
        self.auth_client
            .get_integration_token(&self.integration_id)
            .await
            .map_err(|e| NotionError::Unauthorized {
                message: e.to_string()
            })
    }
}
```

### 2.3 Property Value Contract

```rust
impl PropertyValue {
    /// Creates a title property from plain text.
    pub fn title(text: &str) -> Self {
        PropertyValue::Title(vec![RichText::plain(text.to_string())])
    }

    /// Creates a rich text property from plain text.
    pub fn rich_text(text: &str) -> Self {
        PropertyValue::RichText(vec![RichText::plain(text.to_string())])
    }

    /// Creates a number property.
    pub fn number(n: f64) -> Self {
        PropertyValue::Number(Some(n))
    }

    /// Creates a select property by name.
    pub fn select(name: &str) -> Self {
        PropertyValue::Select(Some(SelectOption {
            name: name.to_string(),
            id: None,
            color: None,
        }))
    }

    /// Creates a checkbox property.
    pub fn checkbox(checked: bool) -> Self {
        PropertyValue::Checkbox(checked)
    }

    /// Creates a date property.
    pub fn date(start: DateTime<Utc>, end: Option<DateTime<Utc>>) -> Self {
        PropertyValue::Date(Some(DateValue { start, end, time_zone: None }))
    }

    /// Checks if this property is read-only.
    pub fn is_read_only(&self) -> bool {
        matches!(self,
            PropertyValue::Rollup(_) |
            PropertyValue::Formula(_) |
            PropertyValue::CreatedTime(_) |
            PropertyValue::LastEditedTime(_) |
            PropertyValue::CreatedBy(_) |
            PropertyValue::LastEditedBy(_)
        )
    }
}
```

---

## 3. Validation Rules

### 3.1 Input Validation

```rust
impl PageRef {
    pub fn to_id(&self) -> Result<String> {
        match self {
            PageRef::Id(id) => validate_notion_id(id),
            PageRef::Url(url) => extract_and_validate_id(url),
        }
    }
}

fn validate_notion_id(id: &str) -> Result<String> {
    // Notion IDs are UUIDs (with or without hyphens)
    let normalized = id.replace("-", "");

    if normalized.len() != 32 {
        return Err(NotionError::InvalidId {
            input: id.to_string(),
        });
    }

    if !normalized.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(NotionError::InvalidId {
            input: id.to_string(),
        });
    }

    // Return with hyphens for API compatibility
    Ok(format!(
        "{}-{}-{}-{}-{}",
        &normalized[0..8],
        &normalized[8..12],
        &normalized[12..16],
        &normalized[16..20],
        &normalized[20..32]
    ))
}

fn extract_and_validate_id(url: &str) -> Result<String> {
    // Patterns:
    // https://www.notion.so/workspace/Page-Title-abc123def456...
    // https://notion.so/abc123def456...

    let url_parsed = Url::parse(url)
        .map_err(|_| NotionError::InvalidUrl { input: url.to_string() })?;

    if !["notion.so", "www.notion.so"].contains(&url_parsed.host_str().unwrap_or("")) {
        return Err(NotionError::InvalidUrl { input: url.to_string() });
    }

    // Extract last path segment, get last 32 hex chars
    let path = url_parsed.path();
    let last_segment = path.split('/').last().unwrap_or("");

    // Remove any query params from segment
    let clean_segment = last_segment.split('?').next().unwrap_or("");

    // Find 32-char hex ID (may be at end after title)
    let hex_chars: String = clean_segment
        .chars()
        .rev()
        .take_while(|c| c.is_ascii_hexdigit())
        .collect::<String>()
        .chars()
        .rev()
        .collect();

    if hex_chars.len() >= 32 {
        validate_notion_id(&hex_chars[hex_chars.len()-32..])
    } else {
        Err(NotionError::InvalidUrl { input: url.to_string() })
    }
}
```

### 3.2 Content Validation

```rust
const MAX_RICH_TEXT_LENGTH: usize = 2000;
const MAX_BLOCKS_PER_REQUEST: usize = 100;
const MAX_URL_LENGTH: usize = 2000;

fn validate_rich_text(texts: &[RichText]) -> Result<()> {
    for text in texts {
        if text.content.len() > MAX_RICH_TEXT_LENGTH {
            return Err(NotionError::InvalidRequest {
                message: format!(
                    "Rich text content exceeds {} characters",
                    MAX_RICH_TEXT_LENGTH
                ),
            });
        }
    }
    Ok(())
}

fn validate_blocks(blocks: &[BlockContent]) -> Result<()> {
    if blocks.len() > MAX_BLOCKS_PER_REQUEST {
        return Err(NotionError::InvalidRequest {
            message: format!(
                "Cannot append more than {} blocks per request",
                MAX_BLOCKS_PER_REQUEST
            ),
        });
    }

    for block in blocks {
        validate_block_content(block)?;
    }
    Ok(())
}

fn validate_block_content(block: &BlockContent) -> Result<()> {
    match block {
        BlockContent::Paragraph { rich_text } |
        BlockContent::Heading1 { rich_text, .. } |
        BlockContent::Heading2 { rich_text, .. } |
        BlockContent::Heading3 { rich_text, .. } |
        BlockContent::BulletedListItem { rich_text } |
        BlockContent::NumberedListItem { rich_text } |
        BlockContent::Quote { rich_text } => {
            validate_rich_text(rich_text)?;
        }
        BlockContent::Bookmark { url, .. } |
        BlockContent::Embed { url } => {
            if url.len() > MAX_URL_LENGTH {
                return Err(NotionError::InvalidRequest {
                    message: "URL exceeds maximum length".to_string(),
                });
            }
        }
        _ => {}
    }
    Ok(())
}
```

### 3.3 Filter Validation

```rust
fn validate_filter(filter: &Filter) -> Result<()> {
    match filter {
        Filter::And(filters) | Filter::Or(filters) => {
            if filters.is_empty() {
                return Err(NotionError::InvalidRequest {
                    message: "Compound filter must have at least one condition".to_string(),
                });
            }
            if filters.len() > 100 {
                return Err(NotionError::InvalidRequest {
                    message: "Filter cannot have more than 100 conditions".to_string(),
                });
            }
            for f in filters {
                validate_filter(f)?;
            }
        }
        Filter::Property { property, .. } => {
            if property.is_empty() {
                return Err(NotionError::InvalidRequest {
                    message: "Property name cannot be empty".to_string(),
                });
            }
        }
        Filter::Timestamp { .. } => {}
    }
    Ok(())
}
```

---

## 4. Security Hardening

### 4.1 Token Protection

```rust
use secrecy::{ExposeSecret, SecretString, Zeroize};

pub struct NotionClient {
    auth: Arc<dyn TokenProvider>,
    // Token never stored directly
}

impl NotionClient {
    async fn build_request(&self, method: Method, endpoint: &str) -> Result<Request> {
        let token = self.auth.get_token().await?;

        // Token exposed only for header construction
        let request = self.http_client
            .request(method, format!("{}{}", self.config.base_url, endpoint))
            .header("Authorization", format!("Bearer {}", token.expose_secret()))
            .header("Notion-Version", &self.config.api_version)
            .header("Content-Type", "application/json");

        // token goes out of scope and is zeroized

        Ok(request)
    }
}

// Redact tokens in logs
impl std::fmt::Debug for NotionClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NotionClient")
            .field("config", &self.config)
            .field("auth", &"[REDACTED]")
            .finish()
    }
}
```

### 4.2 Request Sanitization

```rust
fn sanitize_for_logging(body: &Value) -> Value {
    let mut sanitized = body.clone();

    // Remove potentially sensitive property values
    if let Some(props) = sanitized.get_mut("properties") {
        if let Some(obj) = props.as_object_mut() {
            for (key, value) in obj.iter_mut() {
                // Redact email, phone properties
                if key.to_lowercase().contains("email") ||
                   key.to_lowercase().contains("phone") ||
                   key.to_lowercase().contains("password") ||
                   key.to_lowercase().contains("secret") ||
                   key.to_lowercase().contains("token") {
                    *value = json!("[REDACTED]");
                }
            }
        }
    }

    sanitized
}

fn log_request(method: &Method, endpoint: &str, body: Option<&Value>) {
    tracing::debug!(
        method = %method,
        endpoint = %endpoint,
        body = ?body.map(sanitize_for_logging),
        "Notion API request"
    );
}
```

### 4.3 URL Validation

```rust
fn validate_external_url(url: &str) -> Result<()> {
    let parsed = Url::parse(url)
        .map_err(|_| NotionError::InvalidRequest {
            message: "Invalid URL format".to_string(),
        })?;

    // Only allow HTTPS
    if parsed.scheme() != "https" {
        return Err(NotionError::InvalidRequest {
            message: "Only HTTPS URLs are allowed".to_string(),
        });
    }

    // Block internal/localhost URLs
    if let Some(host) = parsed.host_str() {
        if host == "localhost" ||
           host == "127.0.0.1" ||
           host == "::1" ||
           host.ends_with(".local") ||
           host.starts_with("10.") ||
           host.starts_with("192.168.") ||
           host.starts_with("172.") {
            return Err(NotionError::InvalidRequest {
                message: "Internal URLs are not allowed".to_string(),
            });
        }
    }

    Ok(())
}
```

---

## 5. Performance Optimization

### 5.1 Connection Pooling

```rust
impl NotionClient {
    pub fn new(config: NotionConfig, auth: Arc<dyn TokenProvider>) -> Result<Self> {
        let http_client = reqwest::Client::builder()
            .timeout(config.timeout)
            .pool_max_idle_per_host(10)
            .pool_idle_timeout(Duration::from_secs(90))
            .tcp_keepalive(Duration::from_secs(60))
            .tcp_nodelay(true)
            .build()?;

        Ok(Self {
            config: Arc::new(config),
            auth,
            http_client: Arc::new(http_client),
            // ...
        })
    }
}
```

### 5.2 Batch Operations

```rust
impl NotionClient {
    /// Appends blocks in batches respecting API limits.
    pub async fn append_block_children_batched(
        &self,
        block_ref: BlockRef,
        children: Vec<BlockContent>,
    ) -> Result<Vec<Block>> {
        let mut all_results = Vec::with_capacity(children.len());

        for chunk in children.chunks(MAX_BLOCKS_PER_REQUEST) {
            let results = self.append_block_children(
                block_ref.clone(),
                chunk.to_vec()
            ).await?;
            all_results.extend(results);
        }

        Ok(all_results)
    }

    /// Queries all pages from a database, handling pagination.
    pub async fn query_database_all(
        &self,
        db_ref: DatabaseRef,
        query: DatabaseQuery,
    ) -> Result<Vec<Page>> {
        let mut all_pages = Vec::new();
        let mut cursor = None;

        loop {
            let mut current_query = query.clone();
            current_query.start_cursor = cursor;

            let page = self.query_database(db_ref.clone(), current_query).await?;
            all_pages.extend(page.results);

            if !page.has_more {
                break;
            }
            cursor = page.next_cursor;
        }

        Ok(all_pages)
    }
}
```

### 5.3 Streaming Block Retrieval

```rust
impl NotionClient {
    /// Streams all blocks recursively for memory-efficient processing.
    pub fn stream_blocks_recursive(
        &self,
        block_ref: BlockRef,
    ) -> impl Stream<Item = Result<Block>> + '_ {
        async_stream::try_stream! {
            let mut stack = vec![block_ref];

            while let Some(current_ref) = stack.pop() {
                let mut cursor = None;

                loop {
                    let page = self.get_block_children(
                        current_ref.clone(),
                        cursor
                    ).await?;

                    for block in page.results {
                        if block.has_children {
                            stack.push(BlockRef { id: block.id.clone() });
                        }
                        yield block;
                    }

                    if !page.has_more {
                        break;
                    }
                    cursor = page.next_cursor;
                }
            }
        }
    }
}
```

---

## 6. Testing Strategy

### 6.1 Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_notion_id_valid() {
        let result = validate_notion_id("abc123def456789012345678abcdef01");
        assert!(result.is_ok());
        assert_eq!(
            result.unwrap(),
            "abc123de-f456-7890-1234-5678abcdef01"
        );
    }

    #[test]
    fn test_validate_notion_id_with_hyphens() {
        let result = validate_notion_id("abc123de-f456-7890-1234-5678abcdef01");
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_notion_id_invalid_length() {
        let result = validate_notion_id("abc123");
        assert!(matches!(result, Err(NotionError::InvalidId { .. })));
    }

    #[test]
    fn test_extract_id_from_url() {
        let url = "https://www.notion.so/workspace/My-Page-abc123def456789012345678abcdef01";
        let result = extract_and_validate_id(url);
        assert!(result.is_ok());
    }

    #[test]
    fn test_property_value_title() {
        let prop = PropertyValue::title("Hello");
        assert!(matches!(prop, PropertyValue::Title(_)));
    }

    #[test]
    fn test_filter_builder() {
        let filter = FilterBuilder::new()
            .text_contains("Name", "test")
            .checkbox_equals("Active", true)
            .and();

        assert!(matches!(filter, Filter::And(_)));
    }
}
```

### 6.2 Integration Tests with Simulation

```rust
#[tokio::test]
async fn test_create_page_simulation() {
    let config = NotionConfig::builder()
        .simulation(SimulationMode::Replay {
            path: PathBuf::from("tests/fixtures/create_page.json"),
        })
        .build()
        .unwrap();

    let client = NotionClient::new(config, mock_token_provider()).unwrap();

    let result = client.create_page(CreatePageRequest {
        parent: ParentRef::Database(DatabaseRef::Id("test-db-id".into())),
        properties: hashmap! {
            "Name".into() => PropertyValue::title("Test Page"),
        },
        children: None,
        icon: None,
        cover: None,
    }).await;

    assert!(result.is_ok());
    let page = result.unwrap();
    assert!(!page.id.is_empty());
}

#[tokio::test]
async fn test_query_database_with_filter() {
    let config = NotionConfig::builder()
        .simulation(SimulationMode::Replay {
            path: PathBuf::from("tests/fixtures/query_database.json"),
        })
        .build()
        .unwrap();

    let client = NotionClient::new(config, mock_token_provider()).unwrap();

    let result = client.query_database(
        DatabaseRef::Id("test-db-id".into()),
        DatabaseQuery {
            filter: Some(Filter::checkbox_equals("Active", true)),
            sorts: vec![],
            start_cursor: None,
            page_size: Some(10),
        },
    ).await;

    assert!(result.is_ok());
    assert!(result.unwrap().results.len() <= 10);
}
```

### 6.3 Error Case Tests

```rust
#[tokio::test]
async fn test_rate_limit_handling() {
    let config = NotionConfig::builder()
        .simulation(SimulationMode::Replay {
            path: PathBuf::from("tests/fixtures/rate_limit.json"),
        })
        .build()
        .unwrap();

    let client = NotionClient::new(config, mock_token_provider()).unwrap();

    // First request triggers 429, should auto-retry
    let start = Instant::now();
    let result = client.get_page(PageRef::Id("test-id".into())).await;

    assert!(result.is_ok());
    // Should have waited for retry-after
    assert!(start.elapsed() >= Duration::from_secs(1));
}

#[tokio::test]
async fn test_not_found_error() {
    let config = NotionConfig::builder()
        .simulation(SimulationMode::Replay {
            path: PathBuf::from("tests/fixtures/not_found.json"),
        })
        .build()
        .unwrap();

    let client = NotionClient::new(config, mock_token_provider()).unwrap();

    let result = client.get_page(PageRef::Id("nonexistent".into())).await;

    assert!(matches!(
        result,
        Err(NotionError::NotFound { object_type, .. }) if object_type == "page"
    ));
}
```

---

## 7. CI/CD Configuration

### 7.1 GitHub Actions

```yaml
name: Notion Integration CI

on:
  push:
    paths:
      - 'integrations/notion/**'
  pull_request:
    paths:
      - 'integrations/notion/**'

env:
  CARGO_TERM_COLOR: always
  RUSTFLAGS: -Dwarnings

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: integrations/notion

      - name: Format check
        run: cargo fmt --check
        working-directory: integrations/notion

      - name: Clippy
        run: cargo clippy --all-targets --all-features
        working-directory: integrations/notion

      - name: Build
        run: cargo build --all-features
        working-directory: integrations/notion

      - name: Unit tests
        run: cargo test --lib
        working-directory: integrations/notion

  integration-tests:
    runs-on: ubuntu-latest
    needs: check
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: integrations/notion

      - name: Integration tests (simulation)
        run: cargo test --test '*' -- --test-threads=1
        working-directory: integrations/notion

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Security audit
        uses: rustsec/audit-check@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

  coverage:
    runs-on: ubuntu-latest
    needs: check
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install cargo-llvm-cov
        uses: taiki-e/install-action@cargo-llvm-cov

      - name: Generate coverage
        run: cargo llvm-cov --lcov --output-path lcov.info
        working-directory: integrations/notion

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: integrations/notion/lcov.info
          fail_ci_if_error: true
```

### 7.2 Cargo.toml

```toml
[package]
name = "notion-integration"
version = "0.1.0"
edition = "2021"
rust-version = "1.75"

[dependencies]
tokio = { version = "1.0", features = ["full"] }
reqwest = { version = "0.11", features = ["json", "stream"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
thiserror = "1.0"
tracing = "0.1"
chrono = { version = "0.4", features = ["serde"] }
secrecy = { version = "0.8", features = ["serde"] }
async-trait = "0.1"
async-stream = "0.3"
futures = "0.3"
sha2 = "0.10"
hex = "0.4"
url = "2.4"

[dev-dependencies]
tokio-test = "0.4"
mockall = "0.11"
tempfile = "3.8"
maplit = "1.0"

[features]
default = []
simulation = []

[lints.rust]
unsafe_code = "forbid"

[lints.clippy]
all = "warn"
pedantic = "warn"
```

---

## 8. Observability

### 8.1 Metrics

```rust
pub struct NotionMetrics {
    requests_total: Counter,
    request_duration: Histogram,
    rate_limit_hits: Counter,
    errors_total: CounterVec,
    active_requests: Gauge,
}

impl NotionMetrics {
    pub fn new(registry: &Registry) -> Self {
        Self {
            requests_total: Counter::new(
                "notion_requests_total",
                "Total Notion API requests"
            ).unwrap(),

            request_duration: Histogram::with_opts(
                HistogramOpts::new(
                    "notion_request_duration_seconds",
                    "Notion API request duration"
                ).buckets(vec![0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0])
            ).unwrap(),

            rate_limit_hits: Counter::new(
                "notion_rate_limit_hits_total",
                "Number of rate limit responses"
            ).unwrap(),

            errors_total: CounterVec::new(
                Opts::new("notion_errors_total", "Total errors by type"),
                &["error_type"]
            ).unwrap(),

            active_requests: Gauge::new(
                "notion_active_requests",
                "Currently active requests"
            ).unwrap(),
        }
    }
}
```

### 8.2 Tracing

```rust
impl NotionClient {
    #[tracing::instrument(
        skip(self, request),
        fields(
            parent_type = ?request.parent.type_name(),
            property_count = request.properties.len(),
        )
    )]
    pub async fn create_page(&self, request: CreatePageRequest) -> Result<Page> {
        let span = tracing::Span::current();

        let result = self.execute_create_page(request).await;

        match &result {
            Ok(page) => {
                span.record("page_id", &page.id);
                tracing::info!("Page created successfully");
            }
            Err(e) => {
                tracing::error!(error = %e, "Failed to create page");
            }
        }

        result
    }
}
```

### 8.3 Health Check

```rust
impl NotionClient {
    /// Performs a health check by retrieving the bot user.
    pub async fn health_check(&self) -> Result<HealthStatus> {
        let start = Instant::now();

        match self.get_bot_user().await {
            Ok(user) => Ok(HealthStatus {
                healthy: true,
                latency: start.elapsed(),
                bot_id: Some(user.id),
                error: None,
            }),
            Err(e) => Ok(HealthStatus {
                healthy: false,
                latency: start.elapsed(),
                bot_id: None,
                error: Some(e.to_string()),
            }),
        }
    }
}

pub struct HealthStatus {
    pub healthy: bool,
    pub latency: Duration,
    pub bot_id: Option<String>,
    pub error: Option<String>,
}
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-NOTION-REFINE-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Refinement Document**

*Proceed to Completion phase upon approval.*
