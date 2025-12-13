# Refinement: Jenkins Integration Module

## SPARC Phase 4: Refinement

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/jenkins`

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
struct JenkinsClient;             // PascalCase for types
fn trigger_build();               // snake_case for functions
const CRUMB_CACHE_TTL: u64 = 300; // SCREAMING_SNAKE for constants
type Result<T> = std::result::Result<T, JenkinsError>;

// Error handling with thiserror
#[derive(Debug, thiserror::Error)]
pub enum JenkinsError {
    #[error("Job not found: {0}")]
    NotFound(String),

    #[error("Queue timeout after {0:?}")]
    QueueTimeout(Duration),

    #[error("CSRF crumb fetch failed: {message}")]
    CrumbFetchFailed { message: String },
}

// Builder pattern
impl JenkinsConfigBuilder {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            ..Default::default()
        }
    }

    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    pub fn build(self) -> Result<JenkinsConfig> {
        Ok(JenkinsConfig {
            base_url: self.base_url.trim_end_matches('/').to_string(),
            timeout: self.timeout.unwrap_or(Duration::from_secs(30)),
            ..Default::default()
        })
    }
}
```

### 1.2 Documentation Standards

```rust
/// Triggers a build for the specified job with optional parameters.
///
/// # Arguments
///
/// * `job` - Reference to the job (simple name, folder path, or URL)
/// * `params` - Optional build parameters as key-value pairs
///
/// # Returns
///
/// Returns a `QueueRef` that can be used to track the build's progress
/// through the queue until it starts executing.
///
/// # Errors
///
/// * `JenkinsError::NotFound` - Job does not exist
/// * `JenkinsError::Forbidden` - Insufficient permissions
/// * `JenkinsError::NoQueueLocation` - Server didn't return queue location
///
/// # Example
///
/// ```rust
/// let queue_ref = client.trigger_build(
///     JobRef::Folder(vec!["ci".into(), "build-app".into()]),
///     Some(hashmap! {
///         "BRANCH" => "main",
///         "DEPLOY" => "true",
///     }),
/// ).await?;
///
/// let build = client.wait_for_build(queue_ref, Duration::from_secs(60)).await?;
/// ```
pub async fn trigger_build(
    &self,
    job: JobRef,
    params: Option<HashMap<String, String>>,
) -> Result<QueueRef>
```

### 1.3 Module Organization

```rust
// lib.rs - clean exports
pub mod client;
pub mod operations;
pub mod types;
pub mod error;

pub use client::{JenkinsClient, JenkinsConfig, JenkinsConfigBuilder};
pub use types::*;
pub use error::JenkinsError;

// Prelude for common imports
pub mod prelude {
    pub use crate::{
        JenkinsClient, JenkinsConfig,
        JobRef, BuildRef, QueueRef,
        Build, BuildResult, BuildStatus,
        PipelineRun, Stage, StageStatus,
        JenkinsError,
    };
}
```

---

## 2. Interface Contracts

### 2.1 Client Trait

```rust
#[async_trait]
pub trait JenkinsOperations: Send + Sync {
    // Jobs
    async fn get_job(&self, job: JobRef) -> Result<Job>;
    async fn list_jobs(&self, folder: Option<JobRef>) -> Result<Vec<JobSummary>>;
    async fn trigger_build(&self, job: JobRef, params: Option<HashMap<String, String>>) -> Result<QueueRef>;
    async fn enable_job(&self, job: JobRef) -> Result<()>;
    async fn disable_job(&self, job: JobRef) -> Result<()>;

    // Builds
    async fn get_build(&self, job: JobRef, build: BuildRef) -> Result<Build>;
    async fn get_build_status(&self, job: JobRef, build: BuildRef) -> Result<BuildStatus>;
    async fn abort_build(&self, job: JobRef, build: BuildRef) -> Result<()>;
    async fn get_console_output(&self, job: JobRef, build: BuildRef) -> Result<String>;

    // Queue
    async fn get_queue_item(&self, queue: QueueRef) -> Result<QueueItem>;
    async fn cancel_queue_item(&self, queue: QueueRef) -> Result<()>;
    async fn wait_for_build(&self, queue: QueueRef, timeout: Duration) -> Result<BuildRef>;

    // Pipelines
    async fn get_pipeline_run(&self, job: JobRef, build: BuildRef) -> Result<PipelineRun>;
    async fn get_stage_logs(&self, job: JobRef, build: BuildRef, stage_id: &str) -> Result<String>;
}
```

### 2.2 Credential Provider Contract

```rust
/// Credentials for Jenkins Basic Auth.
pub struct JenkinsCredentials {
    pub username: String,
    pub token: SecretString,
}

#[async_trait]
pub trait CredentialProvider: Send + Sync {
    /// Returns credentials for Jenkins authentication.
    async fn get_credentials(&self) -> Result<JenkinsCredentials>;

    /// Invalidates cached credentials.
    async fn invalidate(&self);
}

// Static credential provider
pub struct StaticCredentialProvider {
    credentials: JenkinsCredentials,
}

impl CredentialProvider for StaticCredentialProvider {
    async fn get_credentials(&self) -> Result<JenkinsCredentials> {
        Ok(self.credentials.clone())
    }

    async fn invalidate(&self) {
        // Static credentials don't refresh
    }
}

// Shared auth integration
pub struct SharedAuthCredentialProvider {
    auth_client: Arc<dyn AuthClient>,
    jenkins_id: String,
}

impl CredentialProvider for SharedAuthCredentialProvider {
    async fn get_credentials(&self) -> Result<JenkinsCredentials> {
        self.auth_client
            .get_service_credentials(&self.jenkins_id)
            .await
            .map_err(|e| JenkinsError::Unauthorized { message: e.to_string() })
    }
}
```

### 2.3 Console Stream Contract

```rust
/// Stream of console output chunks.
pub trait ConsoleStream: Stream<Item = Result<String>> + Send {}

impl JenkinsClient {
    /// Streams console output as it becomes available.
    ///
    /// Returns immediately with a stream that yields log chunks.
    /// The stream completes when the build finishes.
    pub fn stream_console_output(
        &self,
        job: JobRef,
        build: BuildRef,
    ) -> impl ConsoleStream + '_ {
        // Implementation returns async_stream
    }
}
```

---

## 3. Validation Rules

### 3.1 Job Reference Validation

```rust
impl JobRef {
    pub fn to_path(&self) -> Result<String> {
        match self {
            JobRef::Simple(name) => {
                validate_job_name(name)?;
                Ok(format!("/job/{}", urlencoding::encode(name)))
            }
            JobRef::Folder(parts) => {
                for part in parts {
                    validate_job_name(part)?;
                }
                let path = parts
                    .iter()
                    .map(|p| format!("/job/{}", urlencoding::encode(p)))
                    .collect::<String>();
                Ok(path)
            }
            JobRef::Url(url) => {
                extract_job_path(url)
            }
        }
    }
}

fn validate_job_name(name: &str) -> Result<()> {
    if name.is_empty() {
        return Err(JenkinsError::InvalidJobRef {
            input: name.to_string(),
        });
    }

    // Jenkins job name restrictions
    let invalid_chars = ['/', '\\', '<', '>', '|', '?', '*', '"', ':'];
    for ch in invalid_chars {
        if name.contains(ch) {
            return Err(JenkinsError::InvalidJobRef {
                input: name.to_string(),
            });
        }
    }

    // Cannot start or end with space/dot
    if name.starts_with(' ') || name.ends_with(' ') ||
       name.starts_with('.') || name.ends_with('.') {
        return Err(JenkinsError::InvalidJobRef {
            input: name.to_string(),
        });
    }

    Ok(())
}

fn extract_job_path(url: &str) -> Result<String> {
    let parsed = Url::parse(url)
        .map_err(|_| JenkinsError::InvalidJobRef { input: url.to_string() })?;

    let path = parsed.path();

    // Validate path contains /job/ segments
    if !path.contains("/job/") {
        return Err(JenkinsError::InvalidJobRef { input: url.to_string() });
    }

    // Extract everything from first /job/ to end (excluding /api/json etc)
    let job_path = path
        .find("/job/")
        .map(|i| &path[i..])
        .unwrap_or(path);

    // Remove trailing /api/json, /build, etc.
    let clean_path = job_path
        .trim_end_matches("/api/json")
        .trim_end_matches("/build")
        .trim_end_matches("/");

    Ok(clean_path.to_string())
}
```

### 3.2 Build Parameter Validation

```rust
fn validate_build_parameters(params: &HashMap<String, String>) -> Result<()> {
    for (key, value) in params {
        // Key validation
        if key.is_empty() {
            return Err(JenkinsError::BadRequest {
                message: "Parameter name cannot be empty".into(),
            });
        }

        if !key.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
            return Err(JenkinsError::BadRequest {
                message: format!("Invalid parameter name: {}", key),
            });
        }

        // Value length check (prevent extremely large payloads)
        if value.len() > 10_000 {
            return Err(JenkinsError::BadRequest {
                message: format!("Parameter value too long: {}", key),
            });
        }
    }

    Ok(())
}
```

### 3.3 Queue ID Validation

```rust
fn extract_queue_id(location: &str) -> Result<u64> {
    // Expected format: https://jenkins.example.com/queue/item/123/
    let trimmed = location.trim_end_matches('/');

    let id_str = trimmed
        .rsplit('/')
        .next()
        .ok_or(JenkinsError::InvalidQueueLocation)?;

    id_str.parse::<u64>()
        .map_err(|_| JenkinsError::InvalidQueueLocation)
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_extract_queue_id() {
        assert_eq!(
            extract_queue_id("https://jenkins.example.com/queue/item/123/").unwrap(),
            123
        );
        assert_eq!(
            extract_queue_id("http://localhost:8080/queue/item/456").unwrap(),
            456
        );
        assert!(extract_queue_id("invalid").is_err());
    }
}
```

---

## 4. Security Hardening

### 4.1 Credential Protection

```rust
use secrecy::{ExposeSecret, SecretString};

impl JenkinsClient {
    async fn build_request(&self, method: Method, path: &str) -> Result<RequestBuilder> {
        let creds = self.auth.get_credentials().await?;

        let request = self.http_client
            .request(method, self.url(path))
            .basic_auth(&creds.username, Some(creds.token.expose_secret()));

        Ok(request)
    }
}

// Never log credentials
impl std::fmt::Debug for JenkinsCredentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("JenkinsCredentials")
            .field("username", &self.username)
            .field("token", &"[REDACTED]")
            .finish()
    }
}

impl std::fmt::Debug for JenkinsClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("JenkinsClient")
            .field("base_url", &self.config.base_url)
            .field("auth", &"[REDACTED]")
            .finish()
    }
}
```

### 4.2 Crumb Security

```rust
impl CrumbManager {
    /// Fetches a new CSRF crumb from Jenkins.
    async fn fetch_crumb(&self) -> Result<Crumb> {
        let creds = self.auth.get_credentials().await?;

        let response = self.http_client
            .get(format!("{}/crumbIssuer/api/json", self.base_url))
            .basic_auth(&creds.username, Some(creds.token.expose_secret()))
            .send()
            .await?;

        if response.status() == StatusCode::NOT_FOUND {
            return Err(JenkinsError::CrumbNotEnabled);
        }

        if !response.status().is_success() {
            return Err(JenkinsError::CrumbFetchFailed {
                message: response.text().await.unwrap_or_default(),
            });
        }

        let json: Value = response.json().await?;

        Ok(Crumb {
            field: json["crumbRequestField"]
                .as_str()
                .unwrap_or("Jenkins-Crumb")
                .to_string(),
            value: json["crumb"]
                .as_str()
                .ok_or(JenkinsError::CrumbFetchFailed {
                    message: "Missing crumb value".into(),
                })?
                .to_string(),
            expires_at: Instant::now() + Duration::from_secs(CRUMB_CACHE_TTL),
        })
    }
}
```

### 4.3 Console Output Sanitization

```rust
/// Patterns that might contain secrets in console output.
const SENSITIVE_PATTERNS: &[&str] = &[
    "password=",
    "token=",
    "secret=",
    "api_key=",
    "apikey=",
    "auth=",
    "credential",
];

fn sanitize_console_for_logging(content: &str) -> String {
    let mut sanitized = content.to_string();

    for pattern in SENSITIVE_PATTERNS {
        // Find and redact values after pattern
        let re = regex::Regex::new(&format!(
            r"(?i)({})[=:\s]*['\"]?([^'\"\s]+)['\"]?",
            regex::escape(pattern)
        )).unwrap();

        sanitized = re.replace_all(&sanitized, "$1[REDACTED]").to_string();
    }

    sanitized
}

// Only sanitize for logging, not for actual output
fn log_console_chunk(content: &str) {
    tracing::debug!(
        content = %sanitize_console_for_logging(content),
        "Console output chunk"
    );
}
```

---

## 5. Performance Optimization

### 5.1 Connection Pooling

```rust
impl JenkinsClient {
    pub fn new(config: JenkinsConfig, auth: Arc<dyn CredentialProvider>) -> Result<Self> {
        let http_client = reqwest::Client::builder()
            .timeout(config.timeout)
            .connect_timeout(Duration::from_secs(10))
            .pool_max_idle_per_host(5)
            .pool_idle_timeout(Duration::from_secs(60))
            .tcp_keepalive(Duration::from_secs(30))
            .build()?;

        Ok(Self {
            config: Arc::new(config),
            auth,
            http_client: Arc::new(http_client),
            crumb_cache: Arc::new(RwLock::new(None)),
            ..Default::default()
        })
    }
}
```

### 5.2 Efficient Console Streaming

```rust
impl JenkinsClient {
    /// Streams console with adaptive polling.
    pub fn stream_console_output(
        &self,
        job: JobRef,
        build: BuildRef,
    ) -> impl Stream<Item = Result<String>> + '_ {
        async_stream::try_stream! {
            let mut offset = 0u64;
            let mut poll_interval = Duration::from_millis(500);
            let mut consecutive_empty = 0u32;

            loop {
                let (content, new_offset, more_data) = self
                    .get_console_progressive(job.clone(), build.clone(), offset)
                    .await?;

                if new_offset > offset {
                    offset = new_offset;
                    consecutive_empty = 0;
                    poll_interval = Duration::from_millis(500); // Reset
                    yield content;
                } else {
                    consecutive_empty += 1;
                }

                if !more_data {
                    break;
                }

                // Adaptive polling: slow down if nothing new
                if consecutive_empty > 3 {
                    poll_interval = Duration::from_secs(2);
                }
                if consecutive_empty > 10 {
                    poll_interval = Duration::from_secs(5);
                }

                tokio::time::sleep(poll_interval).await;
            }
        }
    }
}
```

### 5.3 Queue Polling Optimization

```rust
impl JenkinsClient {
    pub async fn wait_for_build(
        &self,
        queue: QueueRef,
        timeout: Duration,
    ) -> Result<BuildRef> {
        let start = Instant::now();
        let mut poll_interval = Duration::from_secs(1);
        let max_poll_interval = Duration::from_secs(5);

        loop {
            if start.elapsed() > timeout {
                return Err(JenkinsError::QueueTimeout(timeout));
            }

            let item = self.get_queue_item(queue.clone()).await?;

            // Build started
            if let Some(executable) = item.executable {
                return Ok(BuildRef::Number(executable.number));
            }

            // Cancelled
            if item.cancelled {
                return Err(JenkinsError::QueueCancelled);
            }

            // Still waiting - use exponential backoff
            tokio::time::sleep(poll_interval).await;
            poll_interval = std::cmp::min(poll_interval * 2, max_poll_interval);
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
    fn test_job_ref_simple() {
        let job = JobRef::Simple("my-job".into());
        assert_eq!(job.to_path().unwrap(), "/job/my-job");
    }

    #[test]
    fn test_job_ref_folder() {
        let job = JobRef::Folder(vec!["folder".into(), "subfolder".into(), "job".into()]);
        assert_eq!(job.to_path().unwrap(), "/job/folder/job/subfolder/job/job");
    }

    #[test]
    fn test_job_ref_special_chars() {
        let job = JobRef::Simple("my job (test)".into());
        assert_eq!(job.to_path().unwrap(), "/job/my%20job%20%28test%29");
    }

    #[test]
    fn test_job_ref_invalid() {
        let job = JobRef::Simple("my/job".into());
        assert!(job.to_path().is_err());
    }

    #[test]
    fn test_build_ref_to_path() {
        assert_eq!(BuildRef::Number(123).to_path(), "123");
        assert_eq!(BuildRef::Last.to_path(), "lastBuild");
        assert_eq!(BuildRef::LastSuccessful.to_path(), "lastSuccessfulBuild");
    }

    #[test]
    fn test_build_result_from_str() {
        assert_eq!(BuildResult::from_str("SUCCESS"), BuildResult::Success);
        assert_eq!(BuildResult::from_str("success"), BuildResult::Success);
        assert_eq!(BuildResult::from_str("UNSTABLE"), BuildResult::Unstable);
        assert!(matches!(BuildResult::from_str("CUSTOM"), BuildResult::Unknown(_)));
    }

    #[test]
    fn test_validate_build_parameters() {
        let mut params = HashMap::new();
        params.insert("BRANCH".into(), "main".into());
        assert!(validate_build_parameters(&params).is_ok());

        params.insert("".into(), "value".into());
        assert!(validate_build_parameters(&params).is_err());
    }
}
```

### 6.2 Integration Tests with Simulation

```rust
#[tokio::test]
async fn test_trigger_build_simulation() {
    let config = JenkinsConfig::builder("https://jenkins.example.com")
        .simulation(SimulationMode::Replay {
            path: PathBuf::from("tests/fixtures/trigger_build.json"),
        })
        .build()
        .unwrap();

    let client = JenkinsClient::new(config, mock_credentials()).unwrap();

    let queue_ref = client.trigger_build(
        JobRef::Simple("test-job".into()),
        Some(hashmap! { "BRANCH" => "main" }),
    ).await.unwrap();

    assert!(queue_ref.id > 0);
}

#[tokio::test]
async fn test_get_build_status() {
    let config = JenkinsConfig::builder("https://jenkins.example.com")
        .simulation(SimulationMode::Replay {
            path: PathBuf::from("tests/fixtures/build_status.json"),
        })
        .build()
        .unwrap();

    let client = JenkinsClient::new(config, mock_credentials()).unwrap();

    let status = client.get_build_status(
        JobRef::Simple("test-job".into()),
        BuildRef::Number(42),
    ).await.unwrap();

    assert!(matches!(status, BuildStatus::Completed(BuildResult::Success)));
}

#[tokio::test]
async fn test_pipeline_stages() {
    let config = JenkinsConfig::builder("https://jenkins.example.com")
        .simulation(SimulationMode::Replay {
            path: PathBuf::from("tests/fixtures/pipeline_run.json"),
        })
        .build()
        .unwrap();

    let client = JenkinsClient::new(config, mock_credentials()).unwrap();

    let run = client.get_pipeline_run(
        JobRef::Simple("pipeline-job".into()),
        BuildRef::Number(10),
    ).await.unwrap();

    assert!(!run.stages.is_empty());
    assert_eq!(run.stages[0].name, "Build");
}
```

### 6.3 Crumb Handling Tests

```rust
#[tokio::test]
async fn test_crumb_caching() {
    let config = JenkinsConfig::builder("https://jenkins.example.com")
        .simulation(SimulationMode::Replay {
            path: PathBuf::from("tests/fixtures/crumb_test.json"),
        })
        .build()
        .unwrap();

    let client = JenkinsClient::new(config, mock_credentials()).unwrap();

    // First call fetches crumb
    client.trigger_build(JobRef::Simple("job1".into()), None).await.unwrap();

    // Second call uses cached crumb
    client.trigger_build(JobRef::Simple("job2".into()), None).await.unwrap();

    // Verify only one crumb fetch occurred (check recordings)
}

#[tokio::test]
async fn test_crumb_refresh_on_403() {
    // Test that 403 triggers crumb refresh and retry
    let config = JenkinsConfig::builder("https://jenkins.example.com")
        .simulation(SimulationMode::Replay {
            path: PathBuf::from("tests/fixtures/crumb_expired.json"),
        })
        .build()
        .unwrap();

    let client = JenkinsClient::new(config, mock_credentials()).unwrap();

    // Should succeed after crumb refresh
    let result = client.trigger_build(
        JobRef::Simple("test-job".into()),
        None,
    ).await;

    assert!(result.is_ok());
}
```

---

## 7. CI/CD Configuration

### 7.1 GitHub Actions

```yaml
name: Jenkins Integration CI

on:
  push:
    paths:
      - 'integrations/jenkins/**'
  pull_request:
    paths:
      - 'integrations/jenkins/**'

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
          workspaces: integrations/jenkins

      - name: Format check
        run: cargo fmt --check
        working-directory: integrations/jenkins

      - name: Clippy
        run: cargo clippy --all-targets --all-features
        working-directory: integrations/jenkins

      - name: Build
        run: cargo build --all-features
        working-directory: integrations/jenkins

      - name: Unit tests
        run: cargo test --lib
        working-directory: integrations/jenkins

  integration-tests:
    runs-on: ubuntu-latest
    needs: check
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Integration tests (simulation)
        run: cargo test --test '*' -- --test-threads=1
        working-directory: integrations/jenkins

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
        working-directory: integrations/jenkins

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: integrations/jenkins/lcov.info
```

### 7.2 Cargo.toml

```toml
[package]
name = "jenkins-integration"
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
regex = "1.10"

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
pub struct JenkinsMetrics {
    requests_total: CounterVec,
    request_duration: HistogramVec,
    builds_triggered: Counter,
    builds_completed: CounterVec,
    queue_wait_time: Histogram,
    crumb_refreshes: Counter,
    errors: CounterVec,
}

impl JenkinsMetrics {
    pub fn new(registry: &Registry) -> Self {
        Self {
            requests_total: CounterVec::new(
                Opts::new("jenkins_requests_total", "Total Jenkins API requests"),
                &["method", "endpoint_type", "status"]
            ).unwrap(),

            request_duration: HistogramVec::new(
                HistogramOpts::new(
                    "jenkins_request_duration_seconds",
                    "Jenkins API request duration"
                ).buckets(vec![0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]),
                &["method", "endpoint_type"]
            ).unwrap(),

            builds_triggered: Counter::new(
                "jenkins_builds_triggered_total",
                "Total builds triggered"
            ).unwrap(),

            builds_completed: CounterVec::new(
                Opts::new("jenkins_builds_completed_total", "Completed builds by result"),
                &["result"]
            ).unwrap(),

            queue_wait_time: Histogram::with_opts(
                HistogramOpts::new(
                    "jenkins_queue_wait_seconds",
                    "Time spent waiting in queue"
                ).buckets(vec![1.0, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0])
            ).unwrap(),

            crumb_refreshes: Counter::new(
                "jenkins_crumb_refreshes_total",
                "Number of crumb refresh operations"
            ).unwrap(),

            errors: CounterVec::new(
                Opts::new("jenkins_errors_total", "Errors by type"),
                &["error_type"]
            ).unwrap(),
        }
    }
}
```

### 8.2 Tracing

```rust
impl JenkinsClient {
    #[tracing::instrument(
        skip(self, params),
        fields(
            job = %job.display(),
            has_params = params.is_some(),
        )
    )]
    pub async fn trigger_build(
        &self,
        job: JobRef,
        params: Option<HashMap<String, String>>,
    ) -> Result<QueueRef> {
        let result = self.execute_trigger(job, params).await;

        match &result {
            Ok(queue_ref) => {
                tracing::info!(queue_id = queue_ref.id, "Build triggered");
                self.metrics.builds_triggered.inc();
            }
            Err(e) => {
                tracing::error!(error = %e, "Failed to trigger build");
                self.metrics.errors.with_label_values(&[e.error_type()]).inc();
            }
        }

        result
    }
}
```

### 8.3 Health Check

```rust
impl JenkinsClient {
    /// Performs a health check by accessing the Jenkins API.
    pub async fn health_check(&self) -> Result<HealthStatus> {
        let start = Instant::now();

        // Try to get crumb (lightweight auth check)
        match self.fetch_crumb_if_enabled().await {
            Ok(_) => {
                // Also verify we can list jobs
                match self.request::<Value>(Method::GET, "/api/json?tree=mode", None).await {
                    Ok(response) => Ok(HealthStatus {
                        healthy: true,
                        latency: start.elapsed(),
                        mode: response["mode"].as_str().map(String::from),
                        error: None,
                    }),
                    Err(e) => Ok(HealthStatus {
                        healthy: false,
                        latency: start.elapsed(),
                        mode: None,
                        error: Some(e.to_string()),
                    }),
                }
            }
            Err(e) => Ok(HealthStatus {
                healthy: false,
                latency: start.elapsed(),
                mode: None,
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
| Document ID | SPARC-JENKINS-REFINE-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Refinement Document**

*Proceed to Completion phase upon approval.*
