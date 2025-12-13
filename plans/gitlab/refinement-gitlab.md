# Refinement: GitLab Integration Module

## SPARC Phase 4: Refinement

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/gitlab`

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
struct GitLabClient;              // PascalCase for types
fn create_merge_request();        // snake_case for functions
const MAX_PER_PAGE: u32 = 100;    // SCREAMING_SNAKE for constants
type Result<T> = std::result::Result<T, GitLabError>;

// Error handling with thiserror
#[derive(Debug, thiserror::Error)]
pub enum GitLabError {
    #[error("Rate limited, retry after {retry_after:?}")]
    RateLimited { retry_after: Duration },

    #[error("Resource not found: {resource} with id {id}")]
    NotFound { resource: String, id: String },

    #[error("Webhook validation failed")]
    WebhookValidationFailed,
}

// Builder pattern
impl GitLabConfigBuilder {
    pub fn new() -> Self { Self::default() }

    pub fn base_url(mut self, url: impl Into<String>) -> Self {
        self.base_url = Some(url.into());
        self
    }

    pub fn build(self) -> Result<GitLabConfig> {
        Ok(GitLabConfig {
            base_url: self.base_url.unwrap_or_else(|| "https://gitlab.com".into()),
            ..Default::default()
        })
    }
}
```

### 1.2 Documentation Standards

```rust
/// Creates a new merge request in the specified project.
///
/// # Arguments
///
/// * `project` - Project reference (ID, path, or URL)
/// * `request` - Merge request creation parameters
///
/// # Returns
///
/// Returns the created `MergeRequest` with assigned IID.
///
/// # Errors
///
/// * `GitLabError::BadRequest` - Invalid source/target branch
/// * `GitLabError::Conflict` - MR already exists for branches
/// * `GitLabError::Forbidden` - Insufficient permissions
///
/// # Example
///
/// ```rust
/// let mr = client.create_merge_request(
///     ProjectRef::Path("group/project".into()),
///     CreateMergeRequest {
///         source_branch: "feature".into(),
///         target_branch: "main".into(),
///         title: "Add new feature".into(),
///         ..Default::default()
///     }
/// ).await?;
/// ```
pub async fn create_merge_request(
    &self,
    project: ProjectRef,
    request: CreateMergeRequest,
) -> Result<MergeRequest>
```

### 1.3 Module Organization

```rust
// lib.rs - clean exports
pub mod client;
pub mod operations;
pub mod types;
pub mod webhooks;
pub mod error;

pub use client::{GitLabClient, GitLabConfig, GitLabConfigBuilder};
pub use types::*;
pub use webhooks::{WebhookHandler, WebhookEvent};
pub use error::GitLabError;

// Prelude for common imports
pub mod prelude {
    pub use crate::{
        GitLabClient, GitLabConfig,
        ProjectRef, MergeRequestRef, PipelineRef, JobRef,
        MergeRequest, Pipeline, Job, PipelineStatus, JobStatus,
        WebhookHandler, WebhookEvent,
        GitLabError,
    };
}
```

---

## 2. Interface Contracts

### 2.1 Client Trait

```rust
#[async_trait]
pub trait GitLabOperations: Send + Sync {
    // Repository
    async fn get_file(&self, project: ProjectRef, path: &str, ref_: CommitRef) -> Result<FileContent>;
    async fn create_file(&self, project: ProjectRef, path: &str, req: CreateFileRequest) -> Result<FileCommit>;
    async fn list_branches(&self, project: ProjectRef) -> Result<Vec<Branch>>;

    // Merge Requests
    async fn create_merge_request(&self, project: ProjectRef, req: CreateMergeRequest) -> Result<MergeRequest>;
    async fn get_merge_request(&self, mr_ref: MergeRequestRef) -> Result<MergeRequest>;
    async fn merge(&self, mr_ref: MergeRequestRef, options: MergeOptions) -> Result<MergeRequest>;
    async fn approve(&self, mr_ref: MergeRequestRef) -> Result<()>;

    // Pipelines
    async fn create_pipeline(&self, project: ProjectRef, ref_: &str) -> Result<Pipeline>;
    async fn get_pipeline(&self, pipeline_ref: PipelineRef) -> Result<Pipeline>;
    async fn cancel_pipeline(&self, pipeline_ref: PipelineRef) -> Result<Pipeline>;
    async fn retry_pipeline(&self, pipeline_ref: PipelineRef) -> Result<Pipeline>;

    // Jobs
    async fn get_job(&self, job_ref: JobRef) -> Result<Job>;
    async fn get_job_log(&self, job_ref: JobRef) -> Result<String>;
    async fn retry_job(&self, job_ref: JobRef) -> Result<Job>;
    async fn cancel_job(&self, job_ref: JobRef) -> Result<Job>;
}
```

### 2.2 Token Provider Contract

```rust
#[async_trait]
pub trait TokenProvider: Send + Sync {
    /// Returns a valid access token (PAT or OAuth2).
    async fn get_token(&self) -> Result<SecretString>;

    /// Invalidates cached token, forcing refresh.
    async fn invalidate(&self);
}

// Personal Access Token provider
pub struct PatTokenProvider {
    token: SecretString,
}

impl TokenProvider for PatTokenProvider {
    async fn get_token(&self) -> Result<SecretString> {
        Ok(self.token.clone())
    }

    async fn invalidate(&self) {
        // PAT doesn't refresh
    }
}

// OAuth2 provider using shared auth
pub struct OAuth2TokenProvider {
    auth_client: Arc<dyn AuthClient>,
    user_id: String,
}

impl TokenProvider for OAuth2TokenProvider {
    async fn get_token(&self) -> Result<SecretString> {
        self.auth_client
            .get_user_token(&self.user_id, "gitlab")
            .await
            .map_err(|e| GitLabError::Unauthorized { message: e.to_string() })
    }
}
```

### 2.3 Webhook Handler Contract

```rust
pub struct WebhookHandler {
    secret_token: Option<SecretString>,
}

impl WebhookHandler {
    pub fn new(secret_token: Option<SecretString>) -> Self {
        Self { secret_token }
    }

    /// Validates and parses a webhook request.
    pub async fn handle(&self, headers: &HeaderMap, body: Bytes) -> Result<WebhookEvent> {
        self.validate(headers)?;
        self.parse(headers, body)
    }

    /// Validates the X-Gitlab-Token header.
    fn validate(&self, headers: &HeaderMap) -> Result<()>;

    /// Parses the webhook payload based on X-Gitlab-Event.
    fn parse(&self, headers: &HeaderMap, body: Bytes) -> Result<WebhookEvent>;
}
```

---

## 3. Validation Rules

### 3.1 Project Reference Validation

```rust
impl ProjectRef {
    pub fn to_encoded_path(&self) -> Result<String> {
        match self {
            ProjectRef::Id(id) => Ok(id.to_string()),
            ProjectRef::Path(path) => {
                validate_project_path(path)?;
                Ok(urlencoding::encode(path).into_owned())
            }
            ProjectRef::Url(url) => {
                let path = extract_project_path(url)?;
                validate_project_path(&path)?;
                Ok(urlencoding::encode(&path).into_owned())
            }
        }
    }
}

fn validate_project_path(path: &str) -> Result<()> {
    // Must contain exactly one slash (namespace/project)
    let parts: Vec<&str> = path.split('/').collect();

    if parts.len() < 2 {
        return Err(GitLabError::InvalidProjectRef {
            input: path.to_string(),
        });
    }

    // Validate characters (alphanumeric, dash, underscore, dot)
    let valid_chars = |s: &str| {
        s.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.')
    };

    for part in &parts {
        if part.is_empty() || !valid_chars(part) {
            return Err(GitLabError::InvalidProjectRef {
                input: path.to_string(),
            });
        }
    }

    Ok(())
}

fn extract_project_path(url: &str) -> Result<String> {
    let parsed = Url::parse(url)
        .map_err(|_| GitLabError::InvalidUrl { input: url.to_string() })?;

    // Remove leading slash and .git suffix
    let path = parsed.path().trim_start_matches('/');
    let path = path.trim_end_matches(".git");

    if path.is_empty() {
        return Err(GitLabError::InvalidUrl { input: url.to_string() });
    }

    Ok(path.to_string())
}
```

### 3.2 Branch Name Validation

```rust
fn validate_branch_name(name: &str) -> Result<()> {
    if name.is_empty() {
        return Err(GitLabError::BadRequest {
            message: "Branch name cannot be empty".into(),
        });
    }

    // Git branch naming rules
    let invalid_patterns = [
        "..", "~", "^", ":", "\\", " ", "?", "*", "[",
    ];

    for pattern in invalid_patterns {
        if name.contains(pattern) {
            return Err(GitLabError::BadRequest {
                message: format!("Branch name cannot contain '{}'", pattern),
            });
        }
    }

    if name.starts_with('/') || name.ends_with('/') || name.ends_with('.') {
        return Err(GitLabError::BadRequest {
            message: "Invalid branch name format".into(),
        });
    }

    Ok(())
}
```

### 3.3 File Path Validation

```rust
fn validate_file_path(path: &str) -> Result<()> {
    if path.is_empty() {
        return Err(GitLabError::BadRequest {
            message: "File path cannot be empty".into(),
        });
    }

    // Prevent directory traversal
    if path.contains("..") {
        return Err(GitLabError::BadRequest {
            message: "Path traversal not allowed".into(),
        });
    }

    // Max path length
    if path.len() > 1024 {
        return Err(GitLabError::BadRequest {
            message: "File path exceeds maximum length".into(),
        });
    }

    Ok(())
}
```

---

## 4. Security Hardening

### 4.1 Token Protection

```rust
use secrecy::{ExposeSecret, SecretString};

impl GitLabClient {
    async fn build_request(&self, method: Method, endpoint: &str) -> Result<RequestBuilder> {
        let token = self.auth.get_token().await?;

        Ok(self.http_client
            .request(method, self.api_url(endpoint))
            .header("PRIVATE-TOKEN", token.expose_secret())
            .header("Content-Type", "application/json"))
    }
}

// Never log tokens
impl std::fmt::Debug for GitLabClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GitLabClient")
            .field("base_url", &self.config.base_url)
            .field("auth", &"[REDACTED]")
            .finish()
    }
}
```

### 4.2 Webhook Validation

```rust
impl WebhookHandler {
    fn validate(&self, headers: &HeaderMap) -> Result<()> {
        let Some(expected) = &self.secret_token else {
            return Ok(()); // No token configured, skip validation
        };

        let received = headers
            .get("X-Gitlab-Token")
            .and_then(|v| v.to_str().ok())
            .ok_or(GitLabError::WebhookValidationFailed)?;

        // Constant-time comparison to prevent timing attacks
        if !constant_time_eq(expected.expose_secret().as_bytes(), received.as_bytes()) {
            return Err(GitLabError::WebhookValidationFailed);
        }

        Ok(())
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }

    let mut result = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        result |= x ^ y;
    }
    result == 0
}
```

### 4.3 Sensitive Data Handling

```rust
fn sanitize_for_logging(body: &Value) -> Value {
    let mut sanitized = body.clone();

    // Redact sensitive fields
    let sensitive_keys = ["private_token", "password", "secret", "token", "key"];

    fn redact(value: &mut Value, keys: &[&str]) {
        match value {
            Value::Object(map) => {
                for (k, v) in map.iter_mut() {
                    if keys.iter().any(|key| k.to_lowercase().contains(key)) {
                        *v = Value::String("[REDACTED]".into());
                    } else {
                        redact(v, keys);
                    }
                }
            }
            Value::Array(arr) => {
                for item in arr {
                    redact(item, keys);
                }
            }
            _ => {}
        }
    }

    redact(&mut sanitized, &sensitive_keys);
    sanitized
}

// Never log pipeline variables
fn log_pipeline_trigger(project: &str, ref_: &str, has_variables: bool) {
    tracing::info!(
        project = %project,
        ref_ = %ref_,
        has_variables = has_variables,
        "Triggering pipeline"
        // Variables intentionally not logged
    );
}
```

---

## 5. Performance Optimization

### 5.1 Connection Pooling

```rust
impl GitLabClient {
    pub fn new(config: GitLabConfig, auth: Arc<dyn TokenProvider>) -> Result<Self> {
        let http_client = reqwest::Client::builder()
            .timeout(config.timeout)
            .connect_timeout(Duration::from_secs(10))
            .pool_max_idle_per_host(10)
            .pool_idle_timeout(Duration::from_secs(90))
            .tcp_keepalive(Duration::from_secs(60))
            .tcp_nodelay(true)
            .build()?;

        Ok(Self {
            config: Arc::new(config),
            auth,
            http_client: Arc::new(http_client),
            ..Default::default()
        })
    }
}
```

### 5.2 Efficient Pagination

```rust
impl GitLabClient {
    /// Fetches all pages efficiently using keyset pagination when available.
    pub async fn list_all<T: DeserializeOwned>(
        &self,
        endpoint: &str,
    ) -> Result<Vec<T>> {
        let mut all_results = Vec::new();
        let mut next_url = Some(self.api_url(endpoint));

        while let Some(url) = next_url {
            let response = self.request_raw(Method::GET, &url).await?;

            // Check for keyset pagination (more efficient)
            next_url = response
                .headers()
                .get("Link")
                .and_then(|h| h.to_str().ok())
                .and_then(parse_next_link);

            let page: Vec<T> = response.json().await?;
            all_results.extend(page);
        }

        Ok(all_results)
    }
}

fn parse_next_link(link_header: &str) -> Option<String> {
    // Parse Link header: <url>; rel="next"
    for part in link_header.split(',') {
        if part.contains("rel=\"next\"") {
            let url = part
                .split(';')
                .next()?
                .trim()
                .trim_start_matches('<')
                .trim_end_matches('>');
            return Some(url.to_string());
        }
    }
    None
}
```

### 5.3 Job Log Streaming

```rust
impl GitLabClient {
    /// Streams job log with efficient offset-based polling.
    pub fn stream_job_log(&self, job_ref: JobRef) -> impl Stream<Item = Result<String>> + '_ {
        async_stream::try_stream! {
            let mut offset = 0usize;
            let mut consecutive_empty = 0;

            loop {
                let endpoint = format!(
                    "/projects/{}/jobs/{}/trace",
                    job_ref.project.to_encoded_path()?,
                    job_ref.id
                );

                let response = self.request_raw_with_query(
                    Method::GET,
                    &endpoint,
                    &[("offset", &offset.to_string())],
                ).await?;

                // Get new size from header
                let new_size: usize = response
                    .headers()
                    .get("X-Gitlab-Trace-Size")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(offset);

                if new_size > offset {
                    let content = response.text().await?;
                    offset = new_size;
                    consecutive_empty = 0;
                    yield content;
                } else {
                    consecutive_empty += 1;
                }

                // Check job status
                let job = self.get_job(job_ref.clone()).await?;
                if job.status.is_terminal() {
                    // One final fetch to ensure we got everything
                    if new_size > offset {
                        let final_response = self.request_raw_with_query(
                            Method::GET,
                            &endpoint,
                            &[("offset", &offset.to_string())],
                        ).await?;
                        yield final_response.text().await?;
                    }
                    break;
                }

                // Adaptive polling interval
                let delay = if consecutive_empty > 5 {
                    Duration::from_secs(5)
                } else {
                    Duration::from_secs(2)
                };
                tokio::time::sleep(delay).await;
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
    fn test_project_ref_id() {
        let ref_ = ProjectRef::Id(12345);
        assert_eq!(ref_.to_encoded_path().unwrap(), "12345");
    }

    #[test]
    fn test_project_ref_path() {
        let ref_ = ProjectRef::Path("group/project".into());
        assert_eq!(ref_.to_encoded_path().unwrap(), "group%2Fproject");
    }

    #[test]
    fn test_project_ref_nested_path() {
        let ref_ = ProjectRef::Path("group/subgroup/project".into());
        assert_eq!(ref_.to_encoded_path().unwrap(), "group%2Fsubgroup%2Fproject");
    }

    #[test]
    fn test_project_ref_url() {
        let ref_ = ProjectRef::Url("https://gitlab.com/group/project.git".into());
        assert_eq!(ref_.to_encoded_path().unwrap(), "group%2Fproject");
    }

    #[test]
    fn test_invalid_project_path() {
        let ref_ = ProjectRef::Path("invalid".into());
        assert!(ref_.to_encoded_path().is_err());
    }

    #[test]
    fn test_branch_validation_valid() {
        assert!(validate_branch_name("feature/new-thing").is_ok());
        assert!(validate_branch_name("main").is_ok());
    }

    #[test]
    fn test_branch_validation_invalid() {
        assert!(validate_branch_name("feature..branch").is_err());
        assert!(validate_branch_name("branch name").is_err());
    }

    #[test]
    fn test_pipeline_status_terminal() {
        assert!(PipelineStatus::Success.is_terminal());
        assert!(PipelineStatus::Failed.is_terminal());
        assert!(!PipelineStatus::Running.is_terminal());
        assert!(!PipelineStatus::Pending.is_terminal());
    }
}
```

### 6.2 Integration Tests with Simulation

```rust
#[tokio::test]
async fn test_create_merge_request_simulation() {
    let config = GitLabConfig::builder()
        .simulation(SimulationMode::Replay {
            path: PathBuf::from("tests/fixtures/create_mr.json"),
        })
        .build()
        .unwrap();

    let client = GitLabClient::new(config, mock_token_provider()).unwrap();

    let mr = client.create_merge_request(
        ProjectRef::Id(123),
        CreateMergeRequest {
            source_branch: "feature".into(),
            target_branch: "main".into(),
            title: "Test MR".into(),
            ..Default::default()
        },
    ).await.unwrap();

    assert_eq!(mr.title, "Test MR");
    assert_eq!(mr.source_branch, "feature");
    assert_eq!(mr.target_branch, "main");
}

#[tokio::test]
async fn test_pipeline_workflow() {
    let config = GitLabConfig::builder()
        .simulation(SimulationMode::Replay {
            path: PathBuf::from("tests/fixtures/pipeline_workflow.json"),
        })
        .build()
        .unwrap();

    let client = GitLabClient::new(config, mock_token_provider()).unwrap();

    // Trigger pipeline
    let pipeline = client.create_pipeline(
        ProjectRef::Id(123),
        "main",
        None,
    ).await.unwrap();

    assert_eq!(pipeline.status, PipelineStatus::Created);

    // Get pipeline (simulated as running)
    let running = client.get_pipeline(PipelineRef {
        project: ProjectRef::Id(123),
        id: pipeline.id,
    }).await.unwrap();

    assert_eq!(running.status, PipelineStatus::Running);
}
```

### 6.3 Webhook Tests

```rust
#[test]
fn test_webhook_validation_success() {
    let handler = WebhookHandler::new(Some(SecretString::new("secret123".into())));

    let mut headers = HeaderMap::new();
    headers.insert("X-Gitlab-Token", "secret123".parse().unwrap());
    headers.insert("X-Gitlab-Event", "Push Hook".parse().unwrap());

    assert!(handler.validate(&headers).is_ok());
}

#[test]
fn test_webhook_validation_failure() {
    let handler = WebhookHandler::new(Some(SecretString::new("secret123".into())));

    let mut headers = HeaderMap::new();
    headers.insert("X-Gitlab-Token", "wrong_token".parse().unwrap());

    assert!(matches!(
        handler.validate(&headers),
        Err(GitLabError::WebhookValidationFailed)
    ));
}

#[test]
fn test_parse_push_event() {
    let handler = WebhookHandler::new(None);

    let mut headers = HeaderMap::new();
    headers.insert("X-Gitlab-Event", "Push Hook".parse().unwrap());

    let payload = include_bytes!("fixtures/push_event.json");
    let event = handler.parse(&headers, Bytes::from_static(payload)).unwrap();

    assert!(matches!(event, WebhookEvent::Push { .. }));
}

#[test]
fn test_parse_mr_event() {
    let handler = WebhookHandler::new(None);

    let mut headers = HeaderMap::new();
    headers.insert("X-Gitlab-Event", "Merge Request Hook".parse().unwrap());

    let payload = include_bytes!("fixtures/mr_event.json");
    let event = handler.parse(&headers, Bytes::from_static(payload)).unwrap();

    if let WebhookEvent::MergeRequest { action, .. } = event {
        assert_eq!(action, Some(MergeRequestAction::Open));
    } else {
        panic!("Expected MergeRequest event");
    }
}
```

---

## 7. CI/CD Configuration

### 7.1 GitHub Actions

```yaml
name: GitLab Integration CI

on:
  push:
    paths:
      - 'integrations/gitlab/**'
  pull_request:
    paths:
      - 'integrations/gitlab/**'

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
          workspaces: integrations/gitlab

      - name: Format check
        run: cargo fmt --check
        working-directory: integrations/gitlab

      - name: Clippy
        run: cargo clippy --all-targets --all-features
        working-directory: integrations/gitlab

      - name: Build
        run: cargo build --all-features
        working-directory: integrations/gitlab

      - name: Unit tests
        run: cargo test --lib
        working-directory: integrations/gitlab

  integration-tests:
    runs-on: ubuntu-latest
    needs: check
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Integration tests (simulation)
        run: cargo test --test '*' -- --test-threads=1
        working-directory: integrations/gitlab

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
        working-directory: integrations/gitlab

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: integrations/gitlab/lcov.info
```

### 7.2 Cargo.toml

```toml
[package]
name = "gitlab-integration"
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
urlencoding = "2.1"
bytes = "1.5"
http = "0.2"

[dev-dependencies]
tokio-test = "0.4"
mockall = "0.11"
tempfile = "3.8"

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
pub struct GitLabMetrics {
    requests_total: CounterVec,
    request_duration: HistogramVec,
    rate_limit_remaining: Gauge,
    rate_limit_hits: Counter,
    webhook_events: CounterVec,
    errors: CounterVec,
}

impl GitLabMetrics {
    pub fn new(registry: &Registry) -> Self {
        Self {
            requests_total: CounterVec::new(
                Opts::new("gitlab_requests_total", "Total GitLab API requests"),
                &["method", "endpoint", "status"]
            ).unwrap(),

            request_duration: HistogramVec::new(
                HistogramOpts::new(
                    "gitlab_request_duration_seconds",
                    "GitLab API request duration"
                ).buckets(vec![0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]),
                &["method", "endpoint"]
            ).unwrap(),

            rate_limit_remaining: Gauge::new(
                "gitlab_rate_limit_remaining",
                "Remaining API requests before rate limit"
            ).unwrap(),

            rate_limit_hits: Counter::new(
                "gitlab_rate_limit_hits_total",
                "Number of rate limit responses"
            ).unwrap(),

            webhook_events: CounterVec::new(
                Opts::new("gitlab_webhook_events_total", "Webhook events received"),
                &["event_type"]
            ).unwrap(),

            errors: CounterVec::new(
                Opts::new("gitlab_errors_total", "Errors by type"),
                &["error_type"]
            ).unwrap(),
        }
    }
}
```

### 8.2 Tracing

```rust
impl GitLabClient {
    #[tracing::instrument(
        skip(self, request),
        fields(
            project = %project.display(),
            source_branch = %request.source_branch,
            target_branch = %request.target_branch,
        )
    )]
    pub async fn create_merge_request(
        &self,
        project: ProjectRef,
        request: CreateMergeRequest,
    ) -> Result<MergeRequest> {
        let result = self.execute_create_mr(project, request).await;

        match &result {
            Ok(mr) => {
                tracing::info!(mr_iid = mr.iid, "Merge request created");
            }
            Err(e) => {
                tracing::error!(error = %e, "Failed to create merge request");
            }
        }

        result
    }
}
```

### 8.3 Health Check

```rust
impl GitLabClient {
    /// Performs a health check by accessing the API version endpoint.
    pub async fn health_check(&self) -> Result<HealthStatus> {
        let start = Instant::now();

        match self.request::<Value>(Method::GET, "/version", None).await {
            Ok(response) => Ok(HealthStatus {
                healthy: true,
                latency: start.elapsed(),
                version: response["version"].as_str().map(String::from),
                error: None,
            }),
            Err(e) => Ok(HealthStatus {
                healthy: false,
                latency: start.elapsed(),
                version: None,
                error: Some(e.to_string()),
            }),
        }
    }
}
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-GITLAB-REFINE-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Refinement Document**

*Proceed to Completion phase upon approval.*
