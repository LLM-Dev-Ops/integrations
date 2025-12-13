# GitLab Pipelines Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/gitlab-pipelines`

---

## 1. Edge Cases

### 1.1 Pipeline Operations

| Edge Case | Handling Strategy |
|-----------|-------------------|
| Project ID formats | Accept both numeric ID and URL-encoded path |
| Pipeline already canceled | Return success (idempotent) |
| Pipeline already succeeded | Return `CannotCancel` with current status |
| Retry on successful pipeline | Return `CannotRetry` error |
| Empty variables array | Omit from request body |
| Variable with special chars | URL-encode in trigger endpoint |
| Protected ref trigger | Check permissions, return clear error |
| Missing CI configuration | Handle `NoYamlFile` error |

```rust
// Project identifier normalization
fn normalize_project_id(input: &str) -> ProjectIdentifier {
    if input.chars().all(|c| c.is_ascii_digit()) {
        ProjectIdentifier::Id(input.parse().unwrap())
    } else {
        // URL-encode path: "org/repo" -> "org%2Frepo"
        ProjectIdentifier::Path(urlencoding::encode(input).to_string())
    }
}

// Idempotent cancel
async fn cancel_idempotent(&self, project_id: i64, pipeline_id: i64) -> Result<Pipeline> {
    let pipeline = self.get(project_id, pipeline_id).await?;

    match pipeline.status {
        PipelineStatus::Canceled => {
            // Already canceled, return current state
            Ok(pipeline)
        }
        PipelineStatus::Success | PipelineStatus::Failed | PipelineStatus::Skipped => {
            Err(GitLabError::CannotCancel {
                pipeline_id,
                status: pipeline.status,
                reason: "Pipeline already in terminal state",
            })
        }
        _ => {
            self.cancel(project_id, pipeline_id).await
        }
    }
}

// Handle missing .gitlab-ci.yml
fn handle_pipeline_creation_error(error: &GitLabErrorResponse) -> GitLabError {
    if error.message.contains("does not have a .gitlab-ci.yml") {
        GitLabError::PipelineCreationFailed {
            reason: "Missing .gitlab-ci.yml configuration file",
            suggestion: "Ensure the repository contains a valid .gitlab-ci.yml",
        }
    } else if error.message.contains("Reference not found") {
        GitLabError::InvalidRef {
            ref_: error.ref_.clone(),
            reason: "Branch or tag does not exist",
        }
    } else {
        GitLabError::PipelineCreationFailed {
            reason: error.message.clone(),
            suggestion: None,
        }
    }
}
```

### 1.2 Job Operations

| Edge Case | Handling Strategy |
|-----------|-------------------|
| Job log too large | Stream with Range headers, warn on truncation |
| ANSI codes in logs | Option to strip or preserve |
| Job not yet started | Return empty log, not error |
| Manual job without permission | Return `PermissionDenied` |
| Job artifacts expired | Return `ArtifactNotFound` with expiry info |
| Concurrent job retry | Handle race condition gracefully |

```rust
// Large log handling with streaming
async fn get_log_chunked(
    &self,
    project_id: i64,
    job_id: i64,
    options: LogOptions,
) -> Result<LogStream> {
    const MAX_CHUNK_SIZE: usize = 1024 * 1024; // 1MB chunks

    let mut offset = 0;
    let mut total_size = 0;

    loop {
        let request = Request::get(format!(
            "/projects/{}/jobs/{}/trace",
            project_id, job_id
        ))
        .header("Range", format!("bytes={}-{}", offset, offset + MAX_CHUNK_SIZE));

        let response = self.client.http.execute(request).await?;

        match response.status() {
            StatusCode::PARTIAL_CONTENT => {
                let chunk = response.bytes().await?;
                let chunk_len = chunk.len();

                if options.strip_ansi {
                    let cleaned = strip_ansi_codes(&chunk);
                    yield LogChunk::Data(cleaned);
                } else {
                    yield LogChunk::Data(chunk);
                }

                offset += chunk_len;
                total_size += chunk_len;

                // Check for max size limit
                if let Some(max) = options.max_size {
                    if total_size >= max {
                        yield LogChunk::Truncated { total_size, max_size: max };
                        break;
                    }
                }
            }
            StatusCode::OK => {
                // Full content (small log)
                let content = response.bytes().await?;
                yield LogChunk::Data(content);
                break;
            }
            StatusCode::RANGE_NOT_SATISFIABLE => {
                // Reached end of log
                break;
            }
            _ => {
                return Err(GitLabError::LogsNotAvailable(job_id));
            }
        }
    }
}

// ANSI code stripping
fn strip_ansi_codes(input: &[u8]) -> Vec<u8> {
    let re = regex::bytes::Regex::new(r"\x1b\[[0-9;]*[a-zA-Z]").unwrap();
    re.replace_all(input, &b""[..]).to_vec()
}
```

### 1.3 Polling Edge Cases

| Edge Case | Handling Strategy |
|-----------|-------------------|
| Pipeline stuck in pending | Configurable max pending time |
| Status oscillation | Debounce callbacks |
| API unavailable during poll | Retry with backoff, don't fail immediately |
| Pipeline deleted mid-wait | Return specific error |
| Long-running pipeline | Progressive backoff to reduce API calls |

```rust
// Resilient polling with stuck detection
struct ResilientPipelineWaiter {
    client: GitLabClient,
    config: WaiterConfig,
}

struct WaiterConfig {
    poll_interval: Duration,
    max_wait: Duration,
    max_pending_time: Duration,
    max_consecutive_errors: u32,
    backoff_factor: f64,
}

async fn wait_with_stuck_detection(
    &self,
    project_id: i64,
    pipeline_id: i64,
) -> Result<Pipeline> {
    let start = Instant::now();
    let mut last_status = None;
    let mut status_since = Instant::now();
    let mut consecutive_errors = 0;
    let mut current_interval = self.config.poll_interval;

    loop {
        // Check overall timeout
        if start.elapsed() > self.config.max_wait {
            return Err(GitLabError::Timeout {
                pipeline_id,
                waited: start.elapsed(),
            });
        }

        // Fetch status with error tolerance
        let result = self.client.pipelines().get(project_id, pipeline_id).await;

        match result {
            Ok(pipeline) => {
                consecutive_errors = 0;

                // Check for stuck in pending
                if pipeline.status == PipelineStatus::Pending {
                    if last_status != Some(PipelineStatus::Pending) {
                        status_since = Instant::now();
                    } else if status_since.elapsed() > self.config.max_pending_time {
                        return Err(GitLabError::PipelineStuck {
                            pipeline_id,
                            status: pipeline.status,
                            stuck_duration: status_since.elapsed(),
                        });
                    }
                }

                // Update tracking
                if last_status != Some(pipeline.status) {
                    status_since = Instant::now();
                    // Reset interval on status change
                    current_interval = self.config.poll_interval;
                }
                last_status = Some(pipeline.status);

                // Check terminal
                if pipeline.status.is_terminal() {
                    return Ok(pipeline);
                }

                // Progressive backoff for long-running pipelines
                if start.elapsed() > Duration::minutes(5) {
                    current_interval = std::cmp::min(
                        current_interval.mul_f64(self.config.backoff_factor),
                        Duration::seconds(30),
                    );
                }
            }
            Err(e) => {
                consecutive_errors += 1;

                if consecutive_errors > self.config.max_consecutive_errors {
                    return Err(GitLabError::PollingFailed {
                        pipeline_id,
                        last_error: Box::new(e),
                        consecutive_errors,
                    });
                }

                tracing::warn!(
                    "Poll error (attempt {}): {}",
                    consecutive_errors, e
                );
            }
        }

        tokio::time::sleep(current_interval).await;
    }
}
```

---

## 2. Error Recovery

### 2.1 Retry Strategies

```rust
// GitLab-specific retry configuration
struct GitLabRetryPolicy {
    base_delay: Duration,
    max_delay: Duration,
    max_attempts: u32,
}

impl GitLabRetryPolicy {
    fn should_retry(&self, error: &GitLabError, attempt: u32) -> RetryDecision {
        if attempt >= self.max_attempts {
            return RetryDecision::DoNotRetry;
        }

        match error {
            // Rate limited - respect RateLimit-Reset header
            GitLabError::RateLimited { reset_at } => {
                if let Some(reset) = reset_at {
                    let wait = *reset - Instant::now();
                    if wait > Duration::ZERO {
                        return RetryDecision::RetryAfter(wait);
                    }
                }
                RetryDecision::RetryAfter(Duration::seconds(60))
            }

            // Server errors - exponential backoff
            GitLabError::ServerError(status) if *status >= 500 => {
                RetryDecision::RetryAfter(self.exponential_backoff(attempt))
            }

            // Service unavailable - longer backoff
            GitLabError::ServiceUnavailable => {
                RetryDecision::RetryAfter(self.exponential_backoff(attempt) * 2)
            }

            // Network errors - quick retry
            GitLabError::NetworkError(NetworkError::Timeout) |
            GitLabError::NetworkError(NetworkError::ConnectionReset) => {
                RetryDecision::RetryAfter(self.base_delay)
            }

            // Not found during creation (race condition)
            GitLabError::NotFound(_) if attempt == 0 => {
                // Might be eventual consistency, retry once
                RetryDecision::RetryAfter(Duration::millis(500))
            }

            // All other errors - do not retry
            _ => RetryDecision::DoNotRetry
        }
    }

    fn exponential_backoff(&self, attempt: u32) -> Duration {
        let delay = self.base_delay * 2u32.pow(attempt);
        std::cmp::min(delay, self.max_delay)
    }
}
```

### 2.2 Multi-Pipeline Failure Handling

```rust
// Coordinator with partial failure handling
async fn wait_all_with_recovery(
    &self,
    pipelines: Vec<(i64, i64)>,
    options: CoordinatorOptions,
) -> Result<CoordinatorResult> {
    let handles: Vec<_> = pipelines
        .iter()
        .map(|(project_id, pipeline_id)| {
            let waiter = self.create_waiter();
            let proj = *project_id;
            let pipe = *pipeline_id;

            tokio::spawn(async move {
                let result = waiter
                    .wait_for_completion(proj, pipe, None)
                    .await;
                (proj, pipe, result)
            })
        })
        .collect();

    let results = futures::future::join_all(handles).await;

    let mut succeeded = Vec::new();
    let mut failed = Vec::new();
    let mut errors = Vec::new();

    for result in results {
        match result {
            Ok((proj, pipe, Ok(pipeline))) => {
                if pipeline.status == PipelineStatus::Success {
                    succeeded.push(pipeline);
                } else {
                    failed.push(pipeline);
                }
            }
            Ok((proj, pipe, Err(e))) => {
                errors.push(PipelineError {
                    project_id: proj,
                    pipeline_id: pipe,
                    error: e,
                });
            }
            Err(join_error) => {
                errors.push(PipelineError {
                    project_id: 0,
                    pipeline_id: 0,
                    error: GitLabError::InternalError(join_error.to_string()),
                });
            }
        }
    }

    // Determine overall result based on options
    let overall_status = if errors.is_empty() && failed.is_empty() {
        CoordinatorStatus::AllSucceeded
    } else if options.fail_fast && (!errors.is_empty() || !failed.is_empty()) {
        CoordinatorStatus::Failed
    } else if succeeded.is_empty() {
        CoordinatorStatus::AllFailed
    } else {
        CoordinatorStatus::PartialSuccess
    };

    Ok(CoordinatorResult {
        status: overall_status,
        succeeded,
        failed,
        errors,
    })
}
```

### 2.3 Webhook Replay

```rust
// Webhook event replay for missed events
struct WebhookReplayManager {
    storage: Arc<dyn WebhookStorage>,
    handler: WebhookHandler,
}

impl WebhookReplayManager {
    async fn replay_from(
        &self,
        project_id: i64,
        since: DateTime<Utc>,
    ) -> Result<ReplayResult> {
        // Fetch pipeline events from GitLab API (not webhooks)
        let pipelines = self.client.pipelines().list(
            project_id,
            ListOptions {
                updated_after: Some(since),
                per_page: 100,
                order_by: "updated_at",
                ..default()
            }
        ).await?;

        let mut replayed = 0;
        let mut errors = Vec::new();

        for pipeline in pipelines.items {
            // Construct synthetic webhook event
            let event = WebhookEvent {
                object_kind: "pipeline".to_string(),
                object_attributes: PipelineAttributes {
                    id: pipeline.id,
                    ref_: pipeline.ref_.clone(),
                    status: pipeline.status,
                    // ... other fields
                },
                project: ProjectInfo { id: project_id, .. },
                ..default()
            };

            // Process through normal handler
            match self.handler.handle_pipeline_event(event).await {
                Ok(_) => replayed += 1,
                Err(e) => errors.push((pipeline.id, e)),
            }
        }

        Ok(ReplayResult { replayed, errors })
    }
}
```

---

## 3. Performance Optimizations

### 3.1 Batch Status Fetching

```rust
// Fetch multiple pipeline statuses efficiently
async fn get_pipelines_batch(
    &self,
    project_id: i64,
    pipeline_ids: &[i64],
) -> Result<HashMap<i64, Pipeline>> {
    // GitLab doesn't have batch endpoint, so we parallelize
    const MAX_CONCURRENT: usize = 10;

    let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT));
    let client = self.client.clone();

    let futures: Vec<_> = pipeline_ids
        .iter()
        .map(|&id| {
            let sem = semaphore.clone();
            let client = client.clone();
            async move {
                let _permit = sem.acquire().await;
                let result = client.pipelines().get(project_id, id).await;
                (id, result)
            }
        })
        .collect();

    let results = futures::future::join_all(futures).await;

    let mut pipelines = HashMap::new();
    for (id, result) in results {
        if let Ok(pipeline) = result {
            pipelines.insert(id, pipeline);
        }
    }

    Ok(pipelines)
}
```

### 3.2 Response Caching

```rust
// Cache for slow-changing data
struct GitLabCache {
    project_info: RwLock<HashMap<i64, CachedProject>>,
    triggers: RwLock<HashMap<i64, CachedTriggers>>,
    ttl: Duration,
}

struct CachedProject {
    project: Project,
    fetched_at: Instant,
}

impl GitLabCache {
    async fn get_project_with_cache(
        &self,
        client: &GitLabClient,
        project_id: i64,
    ) -> Result<Project> {
        // Check cache
        {
            let cache = self.project_info.read().await;
            if let Some(cached) = cache.get(&project_id) {
                if cached.fetched_at.elapsed() < self.ttl {
                    return Ok(cached.project.clone());
                }
            }
        }

        // Fetch and cache
        let project = client.get_project(project_id).await?;
        {
            let mut cache = self.project_info.write().await;
            cache.insert(project_id, CachedProject {
                project: project.clone(),
                fetched_at: Instant::now(),
            });
        }

        Ok(project)
    }
}
```

### 3.3 Connection Pooling

```rust
// HTTP client with GitLab-optimized settings
fn create_gitlab_http_client(config: &GitLabConfig) -> Result<reqwest::Client> {
    reqwest::Client::builder()
        // Connection pooling
        .pool_max_idle_per_host(20)
        .pool_idle_timeout(Duration::from_secs(90))

        // Timeouts
        .connect_timeout(Duration::from_secs(10))
        .timeout(config.timeout)

        // Keep-alive for long polling scenarios
        .tcp_keepalive(Duration::from_secs(60))

        // HTTP/2 for multiplexing (GitLab supports it)
        .http2_prior_knowledge()
        .http2_keep_alive_interval(Duration::from_secs(30))

        // Compression
        .gzip(true)

        // TLS
        .min_tls_version(tls::Version::TLS_1_2)
        .https_only(true)

        .build()
        .map_err(|e| GitLabError::ConfigurationError(e.to_string()))
}
```

---

## 4. Security Hardening

### 4.1 Input Validation

```rust
// Comprehensive input validation
struct InputValidator;

impl InputValidator {
    fn validate_ref(ref_: &str) -> Result<()> {
        // Git ref format validation
        if ref_.is_empty() {
            return Err(GitLabError::InvalidRef {
                ref_: ref_.to_string(),
                reason: "Ref cannot be empty",
            });
        }

        // Check for dangerous patterns
        let dangerous = ["../", "..\\", "\x00", "~", "^", ":", "?", "*", "["];
        for pattern in dangerous {
            if ref_.contains(pattern) {
                return Err(GitLabError::InvalidRef {
                    ref_: ref_.to_string(),
                    reason: format!("Ref contains invalid character: {}", pattern),
                });
            }
        }

        // Length limit
        if ref_.len() > 255 {
            return Err(GitLabError::InvalidRef {
                ref_: ref_.to_string(),
                reason: "Ref exceeds maximum length",
            });
        }

        Ok(())
    }

    fn validate_variable(variable: &Variable) -> Result<()> {
        // Key validation
        if variable.key.is_empty() {
            return Err(GitLabError::InvalidVariable {
                key: variable.key.clone(),
                reason: "Variable key cannot be empty",
            });
        }

        // Key format (alphanumeric + underscore)
        if !variable.key.chars().all(|c| c.is_alphanumeric() || c == '_') {
            return Err(GitLabError::InvalidVariable {
                key: variable.key.clone(),
                reason: "Variable key must be alphanumeric with underscores only",
            });
        }

        // Value size limit (GitLab limit is 700KB)
        if variable.value.len() > 700 * 1024 {
            return Err(GitLabError::InvalidVariable {
                key: variable.key.clone(),
                reason: "Variable value exceeds 700KB limit",
            });
        }

        Ok(())
    }

    fn validate_project_path(path: &str) -> Result<()> {
        // Must contain exactly one slash (group/project)
        let slash_count = path.chars().filter(|&c| c == '/').count();
        if slash_count < 1 {
            return Err(GitLabError::InvalidProjectPath {
                path: path.to_string(),
                reason: "Project path must be in format 'group/project'",
            });
        }

        // No dangerous characters
        if path.contains("..") || path.contains("//") {
            return Err(GitLabError::InvalidProjectPath {
                path: path.to_string(),
                reason: "Project path contains invalid sequence",
            });
        }

        Ok(())
    }
}
```

### 4.2 Credential Protection

```rust
// Secure token handling
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(ZeroizeOnDrop)]
struct GitLabToken {
    value: SecretString,
    token_type: TokenType,
    scopes: Vec<String>,
}

impl GitLabToken {
    fn add_to_request(&self, mut request: Request) -> Request {
        match self.token_type {
            TokenType::PersonalAccessToken |
            TokenType::ProjectAccessToken |
            TokenType::GroupAccessToken => {
                // Header-based auth
                request = request.header(
                    "PRIVATE-TOKEN",
                    self.value.expose_secret()
                );
            }
            TokenType::CIJobToken => {
                request = request.header(
                    "JOB-TOKEN",
                    self.value.expose_secret()
                );
            }
            TokenType::TriggerToken => {
                // Trigger tokens go in body, handled separately
            }
        }
        request
    }

    fn has_scope(&self, required: &str) -> bool {
        self.scopes.iter().any(|s| s == required || s == "api")
    }

    fn validate_scopes_for_operation(&self, operation: &str) -> Result<()> {
        let required = match operation {
            "read_pipeline" | "read_job" | "read_artifact" => "read_api",
            "create_pipeline" | "cancel_pipeline" | "retry_pipeline" => "api",
            "play_job" | "cancel_job" => "api",
            _ => "api",
        };

        if !self.has_scope(required) {
            return Err(GitLabError::InsufficientScopes {
                required: required.to_string(),
                available: self.scopes.clone(),
            });
        }

        Ok(())
    }
}

// Never log tokens
impl std::fmt::Debug for GitLabToken {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GitLabToken")
            .field("token_type", &self.token_type)
            .field("scopes", &self.scopes)
            .field("value", &"[REDACTED]")
            .finish()
    }
}
```

### 4.3 Webhook Security

```rust
// Enhanced webhook validation
struct WebhookValidator {
    expected_tokens: Vec<SecretString>,  // Multiple for rotation
    allowed_ips: Option<Vec<IpNetwork>>,
    max_payload_size: usize,
}

impl WebhookValidator {
    fn validate(&self, request: &WebhookRequest) -> Result<()> {
        // 1. Payload size check (before parsing)
        if request.body.len() > self.max_payload_size {
            return Err(GitLabError::InvalidWebhook("Payload too large"));
        }

        // 2. Token validation (constant-time comparison)
        let provided_token = request.headers
            .get("X-Gitlab-Token")
            .ok_or(GitLabError::InvalidWebhook("Missing X-Gitlab-Token"))?;

        let token_valid = self.expected_tokens.iter().any(|expected| {
            constant_time_eq(
                provided_token.as_bytes(),
                expected.expose_secret().as_bytes()
            )
        });

        if !token_valid {
            return Err(GitLabError::InvalidWebhook("Invalid webhook token"));
        }

        // 3. Optional IP validation
        if let Some(allowed) = &self.allowed_ips {
            let source_ip = request.headers
                .get("X-Forwarded-For")
                .or(request.headers.get("X-Real-IP"))
                .and_then(|ip| ip.parse::<IpAddr>().ok());

            if let Some(ip) = source_ip {
                let ip_allowed = allowed.iter().any(|net| net.contains(ip));
                if !ip_allowed {
                    return Err(GitLabError::InvalidWebhook("Source IP not allowed"));
                }
            }
        }

        // 4. Required headers
        if !request.headers.contains_key("X-Gitlab-Event") {
            return Err(GitLabError::InvalidWebhook("Missing X-Gitlab-Event"));
        }

        Ok(())
    }
}
```

---

## 5. Log Processing

### 5.1 ANSI Code Handling

```rust
// Comprehensive ANSI processing
struct LogProcessor {
    strip_ansi: bool,
    convert_to_html: bool,
}

impl LogProcessor {
    fn process(&self, raw: &[u8]) -> ProcessedLog {
        let text = String::from_utf8_lossy(raw);

        if self.convert_to_html {
            ProcessedLog::Html(self.ansi_to_html(&text))
        } else if self.strip_ansi {
            ProcessedLog::Plain(self.strip_ansi_codes(&text))
        } else {
            ProcessedLog::Raw(raw.to_vec())
        }
    }

    fn strip_ansi_codes(&self, input: &str) -> String {
        // Match ANSI escape sequences
        let re = regex::Regex::new(
            r"\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]"
        ).unwrap();
        re.replace_all(input, "").to_string()
    }

    fn ansi_to_html(&self, input: &str) -> String {
        let mut output = String::new();
        let mut current_styles: Vec<&str> = Vec::new();

        // Parse ANSI codes and convert to HTML spans
        let re = regex::Regex::new(r"\x1b\[(\d+(?:;\d+)*)m").unwrap();
        let mut last_end = 0;

        for cap in re.captures_iter(input) {
            let match_start = cap.get(0).unwrap().start();
            let match_end = cap.get(0).unwrap().end();

            // Append text before this code
            output.push_str(&html_escape(&input[last_end..match_start]));

            // Parse codes
            let codes: Vec<u32> = cap[1]
                .split(';')
                .filter_map(|s| s.parse().ok())
                .collect();

            // Close existing spans and open new ones based on codes
            for code in codes {
                match code {
                    0 => {
                        // Reset
                        for _ in &current_styles {
                            output.push_str("</span>");
                        }
                        current_styles.clear();
                    }
                    31 => {
                        output.push_str("<span class=\"ansi-red\">");
                        current_styles.push("red");
                    }
                    32 => {
                        output.push_str("<span class=\"ansi-green\">");
                        current_styles.push("green");
                    }
                    33 => {
                        output.push_str("<span class=\"ansi-yellow\">");
                        current_styles.push("yellow");
                    }
                    // ... other codes
                    _ => {}
                }
            }

            last_end = match_end;
        }

        // Append remaining text
        output.push_str(&html_escape(&input[last_end..]));

        // Close any remaining spans
        for _ in &current_styles {
            output.push_str("</span>");
        }

        output
    }
}
```

### 5.2 Log Search

```rust
// Search within job logs
struct LogSearcher;

impl LogSearcher {
    async fn search_in_log(
        &self,
        client: &GitLabClient,
        project_id: i64,
        job_id: i64,
        pattern: &str,
        options: SearchOptions,
    ) -> Result<Vec<LogMatch>> {
        let log = client.jobs().get_log(project_id, job_id).await?;
        let lines: Vec<&str> = log.lines().collect();

        let regex = if options.regex {
            regex::Regex::new(pattern)?
        } else {
            regex::Regex::new(&regex::escape(pattern))?
        };

        let mut matches = Vec::new();
        let mut context_before: VecDeque<(usize, &str)> = VecDeque::new();

        for (line_num, line) in lines.iter().enumerate() {
            if regex.is_match(line) {
                let before: Vec<_> = context_before.iter().cloned().collect();
                let after: Vec<_> = lines
                    .iter()
                    .enumerate()
                    .skip(line_num + 1)
                    .take(options.context_lines)
                    .map(|(n, l)| (n, *l))
                    .collect();

                matches.push(LogMatch {
                    line_number: line_num,
                    line: line.to_string(),
                    context_before: before,
                    context_after: after,
                });
            }

            // Maintain context window
            context_before.push_back((line_num, line));
            if context_before.len() > options.context_lines {
                context_before.pop_front();
            }
        }

        Ok(matches)
    }
}
```

---

## 6. Testing Considerations

### 6.1 Mock Server

```rust
// Configurable GitLab mock server
struct MockGitLabServer {
    pipelines: Arc<RwLock<HashMap<i64, Pipeline>>>,
    jobs: Arc<RwLock<HashMap<i64, Vec<Job>>>>,
    failure_mode: Arc<AtomicU8>,
    latency: Arc<AtomicU64>,
    rate_limit_remaining: Arc<AtomicI32>,
}

impl MockGitLabServer {
    async fn handle(&self, req: Request) -> Response {
        // Simulate latency
        let latency_ms = self.latency.load(Ordering::SeqCst);
        if latency_ms > 0 {
            tokio::time::sleep(Duration::from_millis(latency_ms)).await;
        }

        // Check failure mode
        match FailureMode::from(self.failure_mode.load(Ordering::SeqCst)) {
            FailureMode::RateLimit => {
                return Response::builder()
                    .status(429)
                    .header("RateLimit-Remaining", "0")
                    .header("RateLimit-Reset", (Utc::now().timestamp() + 60).to_string())
                    .body("Rate limit exceeded")
                    .unwrap();
            }
            FailureMode::ServerError => {
                return Response::builder()
                    .status(500)
                    .body("Internal server error")
                    .unwrap();
            }
            _ => {}
        }

        // Decrement rate limit
        self.rate_limit_remaining.fetch_sub(1, Ordering::SeqCst);

        // Route request
        self.route(req).await
    }

    fn simulate_pipeline_progression(&self, pipeline_id: i64) {
        tokio::spawn(async move {
            let stages = vec!["build", "test", "deploy"];
            let mut status = PipelineStatus::Running;

            for stage in stages {
                tokio::time::sleep(Duration::from_secs(2)).await;
                // Update jobs in stage
            }

            // Final status
            let final_status = if random::<f64>() > 0.1 {
                PipelineStatus::Success
            } else {
                PipelineStatus::Failed
            };

            self.update_pipeline_status(pipeline_id, final_status).await;
        });
    }
}
```

### 6.2 Property-Based Testing

```rust
#[cfg(test)]
mod property_tests {
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn ref_validation_accepts_valid_refs(
            ref_ in "[a-zA-Z][a-zA-Z0-9_-]{0,50}"
        ) {
            let result = InputValidator::validate_ref(&ref_);
            prop_assert!(result.is_ok());
        }

        #[test]
        fn variable_key_validation(
            key in "[a-zA-Z_][a-zA-Z0-9_]{0,50}",
            value in "[ -~]{0,1000}"
        ) {
            let var = Variable { key, value, variable_type: VariableType::EnvVar };
            let result = InputValidator::validate_variable(&var);
            prop_assert!(result.is_ok());
        }

        #[test]
        fn log_stripping_preserves_content(
            text in "[a-zA-Z0-9 ]{1,1000}"
        ) {
            // Text without ANSI codes should be unchanged
            let processor = LogProcessor { strip_ansi: true, convert_to_html: false };
            let result = processor.strip_ansi_codes(&text);
            prop_assert_eq!(text, result);
        }

        #[test]
        fn pipeline_status_terminal_consistency(
            status in prop_oneof![
                Just(PipelineStatus::Success),
                Just(PipelineStatus::Failed),
                Just(PipelineStatus::Canceled),
                Just(PipelineStatus::Running),
                Just(PipelineStatus::Pending),
            ]
        ) {
            // Terminal implies not cancelable
            if status.is_terminal() {
                prop_assert!(!status.is_cancelable());
            }
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

**Next Phase:** Completion - Acceptance criteria verification, implementation checklist, and deployment readiness.
