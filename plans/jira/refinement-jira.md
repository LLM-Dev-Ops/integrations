# Jira Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/jira`

---

## 1. Edge Cases

### 1.1 Issue Operations

| Edge Case | Handling Strategy |
|-----------|-------------------|
| Issue key format variations | Accept both `PROJ-123` and `10001` (numeric ID) |
| Deleted issue access | Return `IssueNotFound` with clear message |
| Issue moved to different project | Key changes; track by ID if persistence needed |
| Custom field not on screen | Skip field silently or return `FieldNotEditable` |
| Required field missing | Return `ValidationError` with field list |
| Field value exceeds limit | Truncate with warning or reject based on config |
| Unicode in summary/description | Preserve; Jira supports full Unicode |
| Empty description | Convert to null, not empty ADF document |

```rust
// Issue key normalization
fn normalize_issue_identifier(input: &str) -> IssueIdentifier {
    if input.chars().all(|c| c.is_ascii_digit()) {
        IssueIdentifier::Id(input.to_string())
    } else if ISSUE_KEY_REGEX.is_match(input) {
        IssueIdentifier::Key(input.to_uppercase())
    } else {
        IssueIdentifier::Invalid(input.to_string())
    }
}

// Handle moved issues
async fn get_issue_resilient(&self, key: &str) -> Result<Issue> {
    match self.get(key, &[]).await {
        Ok(issue) => Ok(issue),
        Err(JiraError::NotFound(_)) if key.contains('-') => {
            // Issue might have been moved; search by summary if we have it cached
            Err(JiraError::IssueMoved {
                original_key: key.to_string(),
                hint: "Issue may have been moved to a different project"
            })
        }
        Err(e) => Err(e)
    }
}
```

### 1.2 Workflow Transitions

| Edge Case | Handling Strategy |
|-----------|-------------------|
| Transition requires screen | Fetch required fields, validate before transition |
| Transition has validators | Pre-check conditions, return descriptive error |
| Parallel transitions same issue | Use optimistic locking; second request may fail |
| Transition to same status | No-op or return `AlreadyInStatus` |
| Workflow changed mid-operation | Refresh transitions and retry once |
| Post-function failure | Transition may succeed but side effects fail |

```rust
// Pre-check transition validity
async fn validate_transition(
    &self,
    issue_key: &str,
    transition_id: &str,
    fields: &HashMap<String, Value>
) -> Result<TransitionValidation> {
    let transitions = self.get_transitions(issue_key).await?;

    let transition = transitions.iter()
        .find(|t| t.id == transition_id)
        .ok_or(JiraError::TransitionNotAllowed {
            issue_key: issue_key.to_string(),
            transition_id: transition_id.to_string(),
            available: transitions.iter().map(|t| t.name.clone()).collect()
        })?;

    // Check required fields
    let missing_fields: Vec<_> = transition.fields.iter()
        .filter(|(_, meta)| meta.required && !fields.contains_key(*_))
        .map(|(name, _)| name.clone())
        .collect();

    if !missing_fields.is_empty() {
        return Ok(TransitionValidation::MissingFields(missing_fields));
    }

    Ok(TransitionValidation::Valid)
}

// Handle "already in status" gracefully
async fn transition_idempotent(
    &self,
    issue_key: &str,
    target_status: &str,
    fields: Option<HashMap<String, Value>>
) -> Result<TransitionResult> {
    let issue = self.get(issue_key, &[]).await?;

    if issue.fields.status.name.eq_ignore_ascii_case(target_status) {
        return Ok(TransitionResult::AlreadyInStatus);
    }

    self.transition_by_name(issue_key, target_status, fields).await?;
    Ok(TransitionResult::Transitioned)
}
```

### 1.3 Webhook Processing

| Edge Case | Handling Strategy |
|-----------|-------------------|
| Duplicate webhook delivery | Idempotency cache with 24h TTL |
| Out-of-order events | Include sequence number in event; process with ordering |
| Webhook secret rotation | Support multiple secrets during rotation window |
| Malformed payload | Log and return 400; don't crash |
| Unknown event type | Log and acknowledge (200); forward to dead-letter |
| Payload too large | Reject with 413 if > 1MB |

```rust
// Multi-secret validation during rotation
fn validate_signature_multi(
    request: &WebhookRequest,
    secrets: &[SecretString]
) -> Result<()> {
    let signature = extract_signature(&request.headers)?;

    for secret in secrets {
        if validate_with_secret(&request.body, &signature, secret).is_ok() {
            return Ok(());
        }
    }

    Err(JiraError::InvalidWebhook("Signature mismatch with all secrets"))
}

// Event ordering for consistency
struct OrderedEventProcessor {
    pending: BTreeMap<u64, WebhookEvent>,  // Keyed by sequence
    last_processed: AtomicU64,
}

impl OrderedEventProcessor {
    async fn process(&self, event: WebhookEvent) -> Result<()> {
        let seq = event.sequence.unwrap_or(0);
        let last = self.last_processed.load(Ordering::SeqCst);

        if seq <= last {
            // Already processed or duplicate
            return Ok(());
        }

        if seq == last + 1 {
            // In order, process immediately
            self.handle_event(event).await?;
            self.last_processed.store(seq, Ordering::SeqCst);

            // Process any buffered events
            self.flush_pending().await?;
        } else {
            // Out of order, buffer
            self.pending.insert(seq, event);
        }

        Ok(())
    }
}
```

---

## 2. Error Recovery

### 2.1 Retry Strategies

```rust
// Jira-specific retry configuration
struct JiraRetryPolicy {
    base_delay: Duration,
    max_delay: Duration,
    max_attempts: u32,
}

impl JiraRetryPolicy {
    fn should_retry(&self, error: &JiraError, attempt: u32) -> RetryDecision {
        if attempt >= self.max_attempts {
            return RetryDecision::DoNotRetry;
        }

        match error {
            // Rate limited - respect Retry-After
            JiraError::RateLimited(retry_after) => {
                RetryDecision::RetryAfter(Duration::from_secs(*retry_after as u64))
            }

            // Server errors - exponential backoff
            JiraError::ServerError(status) if *status >= 500 => {
                let delay = self.exponential_backoff(attempt);
                RetryDecision::RetryAfter(delay)
            }

            // OAuth token expired - refresh and retry immediately
            JiraError::AuthenticationError(msg) if msg.contains("expired") => {
                RetryDecision::RefreshAuthAndRetry
            }

            // Transient network errors
            JiraError::NetworkError(NetworkError::Timeout) |
            JiraError::NetworkError(NetworkError::ConnectionReset) => {
                RetryDecision::RetryAfter(self.base_delay)
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

enum RetryDecision {
    DoNotRetry,
    RetryAfter(Duration),
    RefreshAuthAndRetry,
}
```

### 2.2 Partial Failure Recovery

```rust
// Bulk operation with partial failure handling
async fn bulk_create_with_recovery(
    &self,
    inputs: Vec<CreateIssueInput>
) -> Result<BulkCreateResult> {
    let result = self.bulk_create(inputs.clone()).await?;

    if result.errors.is_empty() {
        return Ok(result);
    }

    // Categorize failures
    let (retryable, permanent): (Vec<_>, Vec<_>) = result.errors
        .into_iter()
        .partition(|e| is_retryable_bulk_error(e));

    if retryable.is_empty() {
        return Ok(BulkCreateResult {
            issues: result.issues,
            errors: permanent,
        });
    }

    // Retry failed items individually
    let retry_inputs: Vec<_> = retryable.iter()
        .filter_map(|e| inputs.get(e.index as usize).cloned())
        .collect();

    let mut additional_issues = Vec::new();
    let mut final_errors = permanent;

    for (i, input) in retry_inputs.into_iter().enumerate() {
        match self.create_issue(input).await {
            Ok(issue) => additional_issues.push(issue),
            Err(e) => final_errors.push(BulkError {
                index: retryable[i].index,
                errors: vec![e.to_string()],
                ..Default::default()
            })
        }
    }

    Ok(BulkCreateResult {
        issues: [result.issues, additional_issues].concat(),
        errors: final_errors,
    })
}

fn is_retryable_bulk_error(error: &BulkError) -> bool {
    error.errors.iter().any(|msg| {
        msg.contains("timeout") ||
        msg.contains("temporary") ||
        msg.contains("try again")
    })
}
```

### 2.3 Circuit Breaker Recovery

```rust
// Circuit breaker with health check
struct JiraCircuitBreaker {
    state: AtomicU8,  // 0=Closed, 1=Open, 2=HalfOpen
    failure_count: AtomicU32,
    last_failure: AtomicInstant,
    config: CircuitBreakerConfig,
}

impl JiraCircuitBreaker {
    async fn execute<F, T>(&self, operation: F) -> Result<T>
    where
        F: Future<Output = Result<T>>,
    {
        match self.get_state() {
            CircuitState::Open => {
                if self.should_attempt_reset() {
                    self.set_state(CircuitState::HalfOpen);
                } else {
                    return Err(JiraError::CircuitOpen {
                        retry_after: self.time_until_reset(),
                    });
                }
            }
            CircuitState::HalfOpen => {
                // Only allow one request through
                if !self.try_acquire_half_open_permit() {
                    return Err(JiraError::CircuitOpen {
                        retry_after: Duration::from_secs(1),
                    });
                }
            }
            CircuitState::Closed => {}
        }

        match operation.await {
            Ok(result) => {
                self.record_success();
                Ok(result)
            }
            Err(e) if e.is_server_error() => {
                self.record_failure();
                Err(e)
            }
            Err(e) => Err(e)  // Don't count client errors
        }
    }

    fn record_success(&self) {
        match self.get_state() {
            CircuitState::HalfOpen => {
                // Reset to closed after success in half-open
                self.failure_count.store(0, Ordering::SeqCst);
                self.set_state(CircuitState::Closed);
            }
            CircuitState::Closed => {
                // Decay failure count on success
                let _ = self.failure_count.fetch_update(
                    Ordering::SeqCst,
                    Ordering::SeqCst,
                    |n| Some(n.saturating_sub(1))
                );
            }
            _ => {}
        }
    }
}
```

---

## 3. Performance Optimizations

### 3.1 Request Batching

```rust
// Automatic request batching for high-throughput scenarios
struct BatchedIssueService {
    inner: IssueServiceImpl,
    pending: Mutex<Vec<PendingCreate>>,
    batch_timeout: Duration,
    batch_size: usize,
}

struct PendingCreate {
    input: CreateIssueInput,
    response_tx: oneshot::Sender<Result<Issue>>,
}

impl BatchedIssueService {
    async fn create(&self, input: CreateIssueInput) -> Result<Issue> {
        let (tx, rx) = oneshot::channel();

        {
            let mut pending = self.pending.lock().await;
            pending.push(PendingCreate { input, response_tx: tx });

            if pending.len() >= self.batch_size {
                let batch = std::mem::take(&mut *pending);
                drop(pending);
                self.flush_batch(batch).await;
            }
        }

        // Start timer for partial batch
        tokio::spawn(self.clone().flush_on_timeout());

        rx.await.map_err(|_| JiraError::InternalError("Batch cancelled"))?
    }

    async fn flush_batch(&self, batch: Vec<PendingCreate>) {
        let inputs: Vec<_> = batch.iter().map(|p| p.input.clone()).collect();

        match self.inner.bulk_create(inputs).await {
            Ok(result) => {
                for (i, pending) in batch.into_iter().enumerate() {
                    let response = if let Some(issue) = result.issues.get(i) {
                        Ok(issue.clone())
                    } else if let Some(error) = result.errors.iter().find(|e| e.index == i as u32) {
                        Err(JiraError::ValidationError(error.errors.clone()))
                    } else {
                        Err(JiraError::InternalError("Missing result"))
                    };
                    let _ = pending.response_tx.send(response);
                }
            }
            Err(e) => {
                for pending in batch {
                    let _ = pending.response_tx.send(Err(e.clone()));
                }
            }
        }
    }
}
```

### 3.2 Response Caching

```rust
// Cache for frequently accessed, slow-changing data
struct JiraCache {
    fields: RwLock<Option<CachedFields>>,
    transitions: RwLock<HashMap<String, CachedTransitions>>,  // By project
    issue_types: RwLock<Option<CachedIssueTypes>>,
    ttl: Duration,
}

struct CachedFields {
    fields: Vec<Field>,
    fetched_at: Instant,
}

impl JiraCache {
    async fn get_fields(&self, client: &JiraClient) -> Result<Vec<Field>> {
        // Check cache
        {
            let cache = self.fields.read().await;
            if let Some(cached) = &*cache {
                if cached.fetched_at.elapsed() < self.ttl {
                    return Ok(cached.fields.clone());
                }
            }
        }

        // Fetch and cache
        let fields = client.get_fields().await?;
        {
            let mut cache = self.fields.write().await;
            *cache = Some(CachedFields {
                fields: fields.clone(),
                fetched_at: Instant::now(),
            });
        }

        Ok(fields)
    }

    // Project-scoped transition cache
    async fn get_transitions_for_status(
        &self,
        client: &JiraClient,
        project_key: &str,
        status_id: &str
    ) -> Result<Vec<Transition>> {
        let cache_key = format!("{}:{}", project_key, status_id);

        {
            let cache = self.transitions.read().await;
            if let Some(cached) = cache.get(&cache_key) {
                if cached.fetched_at.elapsed() < self.ttl {
                    return Ok(cached.transitions.clone());
                }
            }
        }

        // Need a sample issue to get transitions
        let sample = client.search(&format!(
            "project = {} AND status = {} ORDER BY updated DESC",
            project_key, status_id
        ), SearchOptions { max_results: 1, ..default() }).await?;

        if let Some(issue) = sample.issues.first() {
            let transitions = client.get_transitions(&issue.key).await?;

            let mut cache = self.transitions.write().await;
            cache.insert(cache_key, CachedTransitions {
                transitions: transitions.clone(),
                fetched_at: Instant::now(),
            });

            return Ok(transitions);
        }

        Ok(vec![])
    }
}
```

### 3.3 Connection Pooling

```rust
// HTTP client with connection pooling
fn create_http_client(config: &JiraConfig) -> Result<reqwest::Client> {
    reqwest::Client::builder()
        // Connection pooling
        .pool_max_idle_per_host(10)
        .pool_idle_timeout(Duration::from_secs(90))

        // Timeouts
        .connect_timeout(Duration::from_secs(10))
        .timeout(config.timeout)

        // Keep-alive
        .tcp_keepalive(Duration::from_secs(60))
        .http2_keep_alive_interval(Duration::from_secs(30))
        .http2_keep_alive_timeout(Duration::from_secs(10))

        // Compression
        .gzip(true)
        .brotli(true)

        // TLS
        .min_tls_version(tls::Version::TLS_1_2)
        .https_only(true)

        .build()
        .map_err(|e| JiraError::ConfigurationError(e.to_string()))
}
```

---

## 4. Security Hardening

### 4.1 Input Validation

```rust
// Comprehensive input validation
struct InputValidator;

impl InputValidator {
    fn validate_issue_key(key: &str) -> Result<()> {
        // Format: PROJECT-123
        if !ISSUE_KEY_REGEX.is_match(key) {
            return Err(JiraError::ValidationError(vec![
                format!("Invalid issue key format: {}", key)
            ]));
        }

        // Length limits
        if key.len() > 50 {
            return Err(JiraError::ValidationError(vec![
                "Issue key too long".to_string()
            ]));
        }

        Ok(())
    }

    fn validate_jql(jql: &str) -> Result<()> {
        // Prevent JQL injection
        let dangerous_patterns = [
            "/*", "*/",           // Comments
            ";",                  // Statement separator
            "UNION", "SELECT",    // SQL-like injection attempts
        ];

        let upper = jql.to_uppercase();
        for pattern in dangerous_patterns {
            if upper.contains(pattern) {
                return Err(JiraError::ValidationError(vec![
                    format!("Potentially dangerous JQL pattern: {}", pattern)
                ]));
            }
        }

        // Length limit
        if jql.len() > 10_000 {
            return Err(JiraError::ValidationError(vec![
                "JQL query too long".to_string()
            ]));
        }

        Ok(())
    }

    fn validate_summary(summary: &str) -> Result<()> {
        if summary.is_empty() {
            return Err(JiraError::ValidationError(vec![
                "Summary cannot be empty".to_string()
            ]));
        }

        if summary.len() > 255 {
            return Err(JiraError::ValidationError(vec![
                "Summary exceeds 255 character limit".to_string()
            ]));
        }

        // Check for control characters
        if summary.chars().any(|c| c.is_control() && c != '\n' && c != '\t') {
            return Err(JiraError::ValidationError(vec![
                "Summary contains invalid control characters".to_string()
            ]));
        }

        Ok(())
    }

    fn sanitize_for_adf(text: &str) -> String {
        // Remove null bytes and other problematic characters
        text.chars()
            .filter(|c| *c != '\0')
            .collect()
    }
}
```

### 4.2 Credential Protection

```rust
// Secure credential handling
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(ZeroizeOnDrop)]
struct ApiCredentials {
    email: String,
    #[zeroize(skip)]  // Email is not sensitive
    token: SecretString,
}

impl ApiCredentials {
    fn authenticate(&self, mut request: Request) -> Request {
        // Build auth header in isolated scope
        let header_value = {
            let token = self.token.expose_secret();
            let credentials = format!("{}:{}", self.email, token);
            let encoded = base64::encode(&credentials);
            format!("Basic {}", encoded)
            // credentials and token go out of scope here
        };

        request.headers_mut().insert(
            AUTHORIZATION,
            HeaderValue::from_str(&header_value).unwrap()
        );

        request
    }
}

// Never log credentials
impl std::fmt::Debug for ApiCredentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ApiCredentials")
            .field("email", &self.email)
            .field("token", &"[REDACTED]")
            .finish()
    }
}
```

### 4.3 Rate Limit Abuse Prevention

```rust
// Prevent rate limit abuse from misconfigured clients
struct AdaptiveRateLimiter {
    base_rps: f64,
    current_rps: AtomicF64,
    consecutive_429s: AtomicU32,
    backoff_until: AtomicInstant,
}

impl AdaptiveRateLimiter {
    fn record_rate_limit_response(&self, retry_after: u64) {
        let consecutive = self.consecutive_429s.fetch_add(1, Ordering::SeqCst) + 1;

        // Exponentially reduce rate on repeated 429s
        let reduction_factor = 0.5f64.powi(consecutive as i32);
        let new_rps = (self.base_rps * reduction_factor).max(0.1);

        self.current_rps.store(new_rps, Ordering::SeqCst);

        // Set backoff period
        let backoff = Duration::from_secs(retry_after.max(consecutive as u64 * 10));
        self.backoff_until.store(Instant::now() + backoff, Ordering::SeqCst);

        tracing::warn!(
            consecutive_429s = consecutive,
            new_rps = new_rps,
            backoff_seconds = backoff.as_secs(),
            "Reducing rate limit due to 429 responses"
        );
    }

    fn record_success(&self) {
        // Gradually recover rate after successes
        let _ = self.consecutive_429s.compare_exchange(
            self.consecutive_429s.load(Ordering::SeqCst),
            0,
            Ordering::SeqCst,
            Ordering::SeqCst
        );

        let current = self.current_rps.load(Ordering::SeqCst);
        if current < self.base_rps {
            let new_rps = (current * 1.1).min(self.base_rps);
            self.current_rps.store(new_rps, Ordering::SeqCst);
        }
    }
}
```

---

## 5. Atlassian Document Format (ADF)

### 5.1 Text to ADF Conversion

```rust
// Rich text to ADF conversion
struct AdfBuilder;

impl AdfBuilder {
    fn from_plain_text(text: &str) -> AdfDocument {
        AdfDocument {
            version: 1,
            doc_type: "doc".to_string(),
            content: vec![
                AdfNode::Paragraph {
                    content: vec![AdfNode::Text {
                        text: text.to_string(),
                        marks: vec![]
                    }]
                }
            ]
        }
    }

    fn from_markdown(markdown: &str) -> Result<AdfDocument> {
        let mut content = Vec::new();
        let mut current_paragraph: Vec<AdfNode> = Vec::new();

        for line in markdown.lines() {
            // Headers
            if let Some(header_text) = line.strip_prefix("# ") {
                flush_paragraph(&mut content, &mut current_paragraph);
                content.push(AdfNode::Heading {
                    level: 1,
                    content: vec![AdfNode::Text {
                        text: header_text.to_string(),
                        marks: vec![]
                    }]
                });
            }
            // Bold
            else if line.contains("**") {
                let parts = parse_bold(line);
                current_paragraph.extend(parts);
            }
            // Code blocks
            else if line.starts_with("```") {
                flush_paragraph(&mut content, &mut current_paragraph);
                // Handle code block...
            }
            // Plain text
            else if !line.is_empty() {
                current_paragraph.push(AdfNode::Text {
                    text: format!("{} ", line),
                    marks: vec![]
                });
            }
            // Empty line = new paragraph
            else {
                flush_paragraph(&mut content, &mut current_paragraph);
            }
        }

        flush_paragraph(&mut content, &mut current_paragraph);

        Ok(AdfDocument {
            version: 1,
            doc_type: "doc".to_string(),
            content
        })
    }

    fn to_plain_text(doc: &AdfDocument) -> String {
        let mut output = String::new();

        for node in &doc.content {
            extract_text(node, &mut output);
        }

        output.trim().to_string()
    }
}

fn extract_text(node: &AdfNode, output: &mut String) {
    match node {
        AdfNode::Text { text, .. } => output.push_str(text),
        AdfNode::Paragraph { content } |
        AdfNode::Heading { content, .. } => {
            for child in content {
                extract_text(child, output);
            }
            output.push('\n');
        }
        AdfNode::CodeBlock { content, .. } => {
            output.push_str("```\n");
            for child in content {
                extract_text(child, output);
            }
            output.push_str("\n```\n");
        }
        _ => {}
    }
}
```

### 5.2 ADF Validation

```rust
// Validate ADF document structure
fn validate_adf(doc: &AdfDocument) -> Result<()> {
    if doc.version != 1 {
        return Err(JiraError::ValidationError(vec![
            format!("Unsupported ADF version: {}", doc.version)
        ]));
    }

    for node in &doc.content {
        validate_adf_node(node, 0)?;
    }

    Ok(())
}

fn validate_adf_node(node: &AdfNode, depth: usize) -> Result<()> {
    const MAX_DEPTH: usize = 10;

    if depth > MAX_DEPTH {
        return Err(JiraError::ValidationError(vec![
            "ADF document too deeply nested".to_string()
        ]));
    }

    match node {
        AdfNode::Text { text, .. } => {
            if text.len() > 100_000 {
                return Err(JiraError::ValidationError(vec![
                    "Text node exceeds maximum length".to_string()
                ]));
            }
        }
        AdfNode::Paragraph { content } |
        AdfNode::Heading { content, .. } => {
            for child in content {
                validate_adf_node(child, depth + 1)?;
            }
        }
        _ => {}
    }

    Ok(())
}
```

---

## 6. Testing Considerations

### 6.1 Mock Server Configuration

```rust
// Configurable mock for testing
struct MockJiraServer {
    issues: Arc<RwLock<HashMap<String, Issue>>>,
    workflows: HashMap<String, Vec<Transition>>,
    failure_mode: Arc<AtomicU8>,
    latency: Arc<AtomicU64>,
}

enum FailureMode {
    None = 0,
    RateLimit = 1,
    ServerError = 2,
    Timeout = 3,
    AuthFailure = 4,
}

impl MockJiraServer {
    async fn handle_request(&self, req: Request) -> Response {
        // Simulate latency
        let latency = Duration::from_millis(self.latency.load(Ordering::SeqCst));
        tokio::time::sleep(latency).await;

        // Check failure mode
        match FailureMode::from(self.failure_mode.load(Ordering::SeqCst)) {
            FailureMode::RateLimit => {
                return Response::builder()
                    .status(429)
                    .header("Retry-After", "60")
                    .body("Rate limited")
                    .unwrap();
            }
            FailureMode::ServerError => {
                return Response::builder()
                    .status(500)
                    .body("Internal server error")
                    .unwrap();
            }
            FailureMode::Timeout => {
                tokio::time::sleep(Duration::from_secs(300)).await;
                unreachable!()
            }
            _ => {}
        }

        // Route request
        self.route(req).await
    }

    fn set_failure_mode(&self, mode: FailureMode) {
        self.failure_mode.store(mode as u8, Ordering::SeqCst);
    }

    fn set_latency(&self, ms: u64) {
        self.latency.store(ms, Ordering::SeqCst);
    }
}
```

### 6.2 Property-Based Testing

```rust
// Property tests for JQL parsing
#[cfg(test)]
mod property_tests {
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn jql_roundtrip(
            project in "[A-Z]{2,10}",
            status in prop_oneof!["Open", "In Progress", "Done"],
            assignee in "[a-z]{3,20}"
        ) {
            let jql = format!(
                "project = {} AND status = \"{}\" AND assignee = {}",
                project, status, assignee
            );

            // Should parse without error
            let result = validate_jql(&jql);
            prop_assert!(result.is_ok());
        }

        #[test]
        fn issue_key_valid(
            project in "[A-Z]{2,10}",
            number in 1u32..999999
        ) {
            let key = format!("{}-{}", project, number);
            let result = InputValidator::validate_issue_key(&key);
            prop_assert!(result.is_ok());
        }

        #[test]
        fn adf_text_roundtrip(text in "[ -~]{1,1000}") {
            let adf = AdfBuilder::from_plain_text(&text);
            let extracted = AdfBuilder::to_plain_text(&adf);
            prop_assert_eq!(text.trim(), extracted.trim());
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
