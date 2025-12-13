# Jira Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/jira`

---

## 1. Core Data Structures

### 1.1 Configuration

```pseudocode
STRUCT JiraConfig:
    site_url: String              # https://{site}.atlassian.net
    auth_method: AuthMethod       # ApiToken | OAuth | ConnectJwt
    api_version: String           # "3" (default)
    timeout: Duration             # Request timeout
    max_retries: u32              # Retry attempts
    rate_limit_rps: u32           # Requests per second
    bulk_batch_size: u32          # Max issues per bulk (50)

ENUM AuthMethod:
    ApiToken { email: String, token: SecretString }
    OAuth { client_id: String, client_secret: SecretString, refresh_token: SecretString }
    ConnectJwt { shared_secret: SecretString, issuer: String }
```

### 1.2 Issue Types

```pseudocode
STRUCT Issue:
    id: String
    key: String                   # PROJ-123
    self_url: String
    fields: IssueFields
    changelog: Option<Changelog>

STRUCT IssueFields:
    summary: String
    description: Option<AtlassianDoc>
    status: Status
    priority: Option<Priority>
    assignee: Option<User>
    reporter: Option<User>
    issue_type: IssueType
    project: Project
    labels: Vec<String>
    components: Vec<Component>
    created: DateTime
    updated: DateTime
    custom_fields: HashMap<String, JsonValue>

STRUCT Status:
    id: String
    name: String
    category: StatusCategory      # TODO | IN_PROGRESS | DONE

STRUCT Transition:
    id: String
    name: String
    to: Status
    has_screen: bool
    fields: HashMap<String, FieldMeta>
```

### 1.3 Webhook Types

```pseudocode
STRUCT WebhookEvent:
    timestamp: i64
    webhook_event: String         # jira:issue_created, jira:issue_updated
    issue_event_type: String
    issue: Option<Issue>
    changelog: Option<Changelog>
    user: Option<User>

STRUCT Changelog:
    items: Vec<ChangelogItem>

STRUCT ChangelogItem:
    field: String
    field_type: String
    from: Option<String>
    from_string: Option<String>
    to: Option<String>
    to_string: Option<String>
```

---

## 2. Client Core

### 2.1 JiraClient

```pseudocode
STRUCT JiraClient:
    config: JiraConfig
    http: HttpClient
    auth_provider: AuthProvider
    rate_limiter: RateLimiter
    circuit_breaker: CircuitBreaker
    metrics: MetricsCollector

FUNCTION new(config: JiraConfig) -> Result<JiraClient>:
    VALIDATE config.site_url is valid URL
    VALIDATE config.auth_method has required fields

    http = HttpClient::new(config.timeout)
    auth_provider = create_auth_provider(config.auth_method)
    rate_limiter = RateLimiter::new(config.rate_limit_rps)
    circuit_breaker = CircuitBreaker::new(
        failure_threshold: 5,
        success_threshold: 2,
        reset_timeout: Duration::seconds(30)
    )

    RETURN Ok(JiraClient { config, http, auth_provider, rate_limiter, circuit_breaker, metrics })

FUNCTION execute_request<T>(self, request: Request) -> Result<T>:
    span = tracing::span("jira.request", method: request.method, path: request.path)

    # Check circuit breaker
    IF NOT circuit_breaker.allow_request():
        RETURN Err(JiraError::ServiceUnavailable("Circuit open"))

    # Apply rate limiting
    rate_limiter.acquire().await

    # Add authentication
    request = auth_provider.authenticate(request).await?

    # Execute with retry
    result = execute_with_retry(|| {
        response = http.execute(request.clone()).await
        handle_response(response)
    }, config.max_retries).await

    # Update circuit breaker
    MATCH result:
        Ok(_) => circuit_breaker.record_success()
        Err(e) IF e.is_server_error() => circuit_breaker.record_failure()

    metrics.record_request(request.path, result.is_ok())
    RETURN result

FUNCTION handle_response<T>(response: Response) -> Result<T>:
    MATCH response.status:
        200..299 =>
            RETURN Ok(response.json::<T>().await?)
        400 =>
            error = response.json::<JiraErrorResponse>().await?
            RETURN Err(JiraError::ValidationError(error.messages))
        401 =>
            RETURN Err(JiraError::AuthenticationError("Unauthorized"))
        403 =>
            RETURN Err(JiraError::PermissionDenied(response.text().await?))
        404 =>
            RETURN Err(JiraError::NotFound(response.text().await?))
        409 =>
            RETURN Err(JiraError::WorkflowError(response.json().await?))
        429 =>
            retry_after = response.header("Retry-After").unwrap_or(60)
            RETURN Err(JiraError::RateLimited(retry_after))
        500..599 =>
            RETURN Err(JiraError::ServerError(response.status))
```

---

## 3. Issue Service

### 3.1 Issue Operations

```pseudocode
TRAIT IssueService:
    async fn create(input: CreateIssueInput) -> Result<Issue>
    async fn get(issue_key: &str, expand: &[&str]) -> Result<Issue>
    async fn update(issue_key: &str, input: UpdateIssueInput) -> Result<()>
    async fn delete(issue_key: &str) -> Result<()>
    async fn get_transitions(issue_key: &str) -> Result<Vec<Transition>>
    async fn transition(issue_key: &str, input: TransitionInput) -> Result<()>

STRUCT IssueServiceImpl:
    client: JiraClient

FUNCTION create(self, input: CreateIssueInput) -> Result<Issue>:
    span = tracing::span("jira.issue.create", project: input.project_key)

    # Build request body
    body = {
        "fields": {
            "project": { "key": input.project_key },
            "issuetype": { "name": input.issue_type },
            "summary": input.summary,
            "description": input.description.map(to_atlassian_doc),
            ...input.custom_fields
        }
    }

    # Validate required fields
    VALIDATE input.summary.len() > 0
    VALIDATE input.project_key matches PROJECT_KEY_PATTERN

    request = Request::post("/rest/api/3/issue")
        .json(body)

    response = client.execute_request::<CreateIssueResponse>(request).await?

    # Fetch full issue to return
    issue = self.get(&response.key, &["names"]).await?

    metrics.increment("jira_issues_created_total", project: input.project_key)
    log::info!("Created issue {}", issue.key)

    RETURN Ok(issue)

FUNCTION get(self, issue_key: &str, expand: &[&str]) -> Result<Issue>:
    span = tracing::span("jira.issue.get", issue_key: redact(issue_key))

    VALIDATE issue_key matches ISSUE_KEY_PATTERN

    query = if expand.is_empty() { "" } else {
        format!("?expand={}", expand.join(","))
    }

    request = Request::get(format!("/rest/api/3/issue/{}{}", issue_key, query))

    RETURN client.execute_request::<Issue>(request).await

FUNCTION update(self, issue_key: &str, input: UpdateIssueInput) -> Result<()>:
    span = tracing::span("jira.issue.update", issue_key: redact(issue_key))

    body = {
        "fields": input.fields,
        "update": input.operations  # For add/remove operations
    }

    # Optionally notify users
    query = if input.notify_users { "" } else { "?notifyUsers=false" }

    request = Request::put(format!("/rest/api/3/issue/{}{}", issue_key, query))
        .json(body)

    client.execute_request::<()>(request).await?

    log::info!("Updated issue {}", issue_key)
    RETURN Ok(())

FUNCTION delete(self, issue_key: &str) -> Result<()>:
    span = tracing::span("jira.issue.delete", issue_key: redact(issue_key))

    request = Request::delete(format!("/rest/api/3/issue/{}", issue_key))

    client.execute_request::<()>(request).await?

    log::info!("Deleted issue {}", issue_key)
    RETURN Ok(())
```

### 3.2 Workflow Transitions

```pseudocode
FUNCTION get_transitions(self, issue_key: &str) -> Result<Vec<Transition>>:
    span = tracing::span("jira.issue.transitions", issue_key: redact(issue_key))

    request = Request::get(format!(
        "/rest/api/3/issue/{}/transitions?expand=transitions.fields",
        issue_key
    ))

    response = client.execute_request::<TransitionsResponse>(request).await?
    RETURN Ok(response.transitions)

FUNCTION transition(self, issue_key: &str, input: TransitionInput) -> Result<()>:
    span = tracing::span("jira.issue.transition",
        issue_key: redact(issue_key),
        transition_id: input.transition_id
    )

    # Get current issue for logging
    current = self.get(issue_key, &[]).await?
    from_status = current.fields.status.name.clone()

    # Validate transition is available
    available = self.get_transitions(issue_key).await?
    transition = available.iter()
        .find(|t| t.id == input.transition_id)
        .ok_or(JiraError::TransitionNotAllowed(input.transition_id))?

    # Build request
    body = {
        "transition": { "id": input.transition_id },
        "fields": input.fields,
        "update": input.update
    }

    request = Request::post(format!("/rest/api/3/issue/{}/transitions", issue_key))
        .json(body)

    client.execute_request::<()>(request).await?

    metrics.increment("jira_transitions_total",
        from_status: from_status,
        to_status: transition.to.name
    )

    log::info!("Transitioned {} from {} to {}",
        issue_key, from_status, transition.to.name)

    RETURN Ok(())

FUNCTION transition_by_name(self, issue_key: &str, status_name: &str, fields: Option<Fields>) -> Result<()>:
    # Find transition by target status name
    transitions = self.get_transitions(issue_key).await?

    transition = transitions.iter()
        .find(|t| t.to.name.eq_ignore_ascii_case(status_name))
        .ok_or(JiraError::TransitionNotAllowed(status_name))?

    input = TransitionInput {
        transition_id: transition.id.clone(),
        fields: fields.unwrap_or_default(),
        update: None
    }

    RETURN self.transition(issue_key, input).await
```

---

## 4. Search Service

### 4.1 JQL Search

```pseudocode
TRAIT SearchService:
    async fn search(jql: &str, options: SearchOptions) -> Result<SearchResult>
    async fn search_all(jql: &str) -> Result<Vec<Issue>>

STRUCT SearchOptions:
    start_at: u32                 # Pagination offset
    max_results: u32              # Page size (max 100)
    fields: Vec<String>           # Fields to return
    expand: Vec<String>           # Expansions
    validate_query: bool          # Validate JQL syntax

STRUCT SearchResult:
    issues: Vec<Issue>
    start_at: u32
    max_results: u32
    total: u32
    is_last: bool

FUNCTION search(self, jql: &str, options: SearchOptions) -> Result<SearchResult>:
    span = tracing::span("jira.search", jql_hash: hash(jql))

    # Validate JQL if requested
    IF options.validate_query:
        validate_jql(jql)?

    body = {
        "jql": jql,
        "startAt": options.start_at,
        "maxResults": min(options.max_results, 100),
        "fields": options.fields,
        "expand": options.expand
    }

    request = Request::post("/rest/api/3/search")
        .json(body)

    response = client.execute_request::<SearchResponse>(request).await?

    result = SearchResult {
        issues: response.issues,
        start_at: response.start_at,
        max_results: response.max_results,
        total: response.total,
        is_last: response.start_at + response.issues.len() >= response.total
    }

    span.set_attribute("result_count", result.issues.len())
    RETURN Ok(result)

FUNCTION search_all(self, jql: &str) -> Result<Vec<Issue>>:
    # Paginate through all results
    all_issues = Vec::new()
    start_at = 0

    LOOP:
        result = self.search(jql, SearchOptions {
            start_at,
            max_results: 100,
            fields: vec!["*all"],
            ..default()
        }).await?

        all_issues.extend(result.issues)

        IF result.is_last:
            BREAK

        start_at = start_at + result.max_results

    RETURN Ok(all_issues)

FUNCTION validate_jql(jql: &str) -> Result<()>:
    # Basic JQL validation
    IF jql.is_empty():
        RETURN Err(JiraError::InvalidJql("Empty JQL"))

    # Check for balanced parentheses
    IF NOT balanced_parens(jql):
        RETURN Err(JiraError::InvalidJql("Unbalanced parentheses"))

    # Check for valid operators
    VALID_OPERATORS = ["=", "!=", "~", "!~", ">", ">=", "<", "<=", "IN", "NOT IN", "IS", "IS NOT"]
    # Validation logic...

    RETURN Ok(())
```

---

## 5. Comment Service

### 5.1 Comment Operations

```pseudocode
TRAIT CommentService:
    async fn list(issue_key: &str, options: PaginationOptions) -> Result<Vec<Comment>>
    async fn add(issue_key: &str, body: &str, visibility: Option<Visibility>) -> Result<Comment>
    async fn update(issue_key: &str, comment_id: &str, body: &str) -> Result<Comment>
    async fn delete(issue_key: &str, comment_id: &str) -> Result<()>

STRUCT Comment:
    id: String
    body: AtlassianDoc
    author: User
    created: DateTime
    updated: DateTime
    visibility: Option<Visibility>

STRUCT Visibility:
    type_: String                 # "group" or "role"
    value: String                 # Group name or role name

FUNCTION add(self, issue_key: &str, body: &str, visibility: Option<Visibility>) -> Result<Comment>:
    span = tracing::span("jira.comment.add", issue_key: redact(issue_key))

    request_body = {
        "body": to_atlassian_doc(body),
        "visibility": visibility
    }

    request = Request::post(format!("/rest/api/3/issue/{}/comment", issue_key))
        .json(request_body)

    comment = client.execute_request::<Comment>(request).await?

    log::info!("Added comment {} to issue {}", comment.id, issue_key)
    RETURN Ok(comment)

FUNCTION to_atlassian_doc(text: &str) -> AtlassianDoc:
    # Convert plain text to Atlassian Document Format
    RETURN {
        "type": "doc",
        "version": 1,
        "content": [
            {
                "type": "paragraph",
                "content": [
                    { "type": "text", "text": text }
                ]
            }
        ]
    }
```

---

## 6. Bulk Operations

### 6.1 Bulk Service

```pseudocode
TRAIT BulkService:
    async fn create_issues(inputs: Vec<CreateIssueInput>) -> Result<BulkCreateResult>
    async fn update_issues(updates: Vec<BulkUpdate>) -> Result<BulkUpdateResult>
    async fn transition_issues(transitions: Vec<BulkTransition>) -> Result<BulkTransitionResult>

STRUCT BulkCreateResult:
    issues: Vec<Issue>
    errors: Vec<BulkError>

STRUCT BulkError:
    index: u32
    issue_key: Option<String>
    errors: Vec<String>

FUNCTION create_issues(self, inputs: Vec<CreateIssueInput>) -> Result<BulkCreateResult>:
    span = tracing::span("jira.bulk.create", count: inputs.len())

    # Validate batch size
    IF inputs.len() > config.bulk_batch_size:
        RETURN Err(JiraError::ValidationError(
            format!("Batch size {} exceeds max {}", inputs.len(), config.bulk_batch_size)
        ))

    # Build bulk request
    issue_updates = inputs.iter().map(|input| {
        {
            "fields": {
                "project": { "key": input.project_key },
                "issuetype": { "name": input.issue_type },
                "summary": input.summary,
                ...input.custom_fields
            }
        }
    }).collect()

    body = { "issueUpdates": issue_updates }

    request = Request::post("/rest/api/3/issue/bulk")
        .json(body)

    response = client.execute_request::<BulkCreateResponse>(request).await?

    # Process results
    result = BulkCreateResult {
        issues: response.issues,
        errors: response.errors.iter().enumerate()
            .filter_map(|(i, e)| e.map(|err| BulkError { index: i, errors: err }))
            .collect()
    }

    metrics.increment("jira_bulk_operations_total", operation: "create")
    log::info!("Bulk created {} issues, {} errors",
        result.issues.len(), result.errors.len())

    RETURN Ok(result)

FUNCTION transition_issues(self, transitions: Vec<BulkTransition>) -> Result<BulkTransitionResult>:
    span = tracing::span("jira.bulk.transition", count: transitions.len())

    # Execute transitions concurrently with limited parallelism
    semaphore = Semaphore::new(10)  # Max 10 concurrent

    results = futures::join_all(
        transitions.iter().map(|t| {
            let permit = semaphore.acquire().await
            async move {
                let result = issue_service.transition(&t.issue_key, t.input.clone()).await
                drop(permit)
                (t.issue_key.clone(), result)
            }
        })
    ).await

    # Aggregate results
    successes = results.iter().filter(|(_, r)| r.is_ok()).count()
    failures = results.iter()
        .filter_map(|(key, r)| r.err().map(|e| (key.clone(), e)))
        .collect()

    RETURN Ok(BulkTransitionResult { successes, failures })
```

---

## 7. Webhook Handler

### 7.1 Webhook Processing

```pseudocode
TRAIT WebhookHandler:
    async fn handle(request: WebhookRequest) -> Result<WebhookResponse>
    fn validate_signature(request: &WebhookRequest, secret: &str) -> Result<()>

STRUCT WebhookRequest:
    headers: HashMap<String, String>
    body: Vec<u8>
    timestamp: DateTime

FUNCTION handle(self, request: WebhookRequest) -> Result<WebhookResponse>:
    span = tracing::span("jira.webhook.receive")

    # Validate signature
    IF let Some(secret) = config.webhook_secret:
        validate_signature(&request, &secret)?

    # Validate timestamp (prevent replay)
    event_timestamp = request.headers.get("X-Atlassian-Webhook-Timestamp")
        .and_then(|t| t.parse::<i64>().ok())
        .ok_or(JiraError::InvalidWebhook("Missing timestamp"))?

    age = now() - DateTime::from_timestamp(event_timestamp / 1000)
    IF age > Duration::minutes(5):
        RETURN Err(JiraError::InvalidWebhook("Stale webhook"))

    # Parse event
    event = serde_json::from_slice::<WebhookEvent>(&request.body)?

    span.set_attribute("event_type", &event.webhook_event)
    IF let Some(issue) = &event.issue:
        span.set_attribute("issue_key", redact(&issue.key))

    # Check for duplicate (idempotency)
    webhook_id = request.headers.get("X-Atlassian-Webhook-Identifier")
    IF let Some(id) = webhook_id:
        IF idempotency_cache.contains(id):
            log::debug!("Duplicate webhook {}, skipping", id)
            RETURN Ok(WebhookResponse::Duplicate)
        idempotency_cache.insert(id, now(), ttl: Duration::hours(24))

    # Dispatch to handlers
    MATCH event.webhook_event.as_str():
        "jira:issue_created" => handle_issue_created(event).await
        "jira:issue_updated" => handle_issue_updated(event).await
        "jira:issue_deleted" => handle_issue_deleted(event).await
        "comment_created" => handle_comment_created(event).await
        _ => log::debug!("Unhandled webhook event: {}", event.webhook_event)

    metrics.increment("jira_webhook_events_total", event_type: event.webhook_event)

    RETURN Ok(WebhookResponse::Processed)

FUNCTION validate_signature(request: &WebhookRequest, secret: &str) -> Result<()>:
    signature = request.headers.get("X-Hub-Signature")
        .or(request.headers.get("X-Atlassian-Webhook-Signature"))
        .ok_or(JiraError::InvalidWebhook("Missing signature"))?

    # Parse signature format: "sha256=<hex>"
    (algorithm, provided_sig) = signature.split_once('=')
        .ok_or(JiraError::InvalidWebhook("Invalid signature format"))?

    # Compute expected signature
    expected_sig = MATCH algorithm:
        "sha256" => hmac_sha256(secret, &request.body).to_hex()
        "sha1" => hmac_sha1(secret, &request.body).to_hex()
        _ => RETURN Err(JiraError::InvalidWebhook("Unsupported algorithm"))

    # Constant-time comparison
    IF NOT constant_time_eq(provided_sig, &expected_sig):
        RETURN Err(JiraError::InvalidWebhook("Signature mismatch"))

    RETURN Ok(())
```

### 7.2 Event Handlers

```pseudocode
FUNCTION handle_issue_updated(event: WebhookEvent) -> Result<()>:
    issue = event.issue.ok_or(JiraError::InvalidWebhook("Missing issue"))?
    changelog = event.changelog

    # Check for status change
    IF let Some(cl) = changelog:
        FOR item IN cl.items:
            IF item.field == "status":
                log::info!("Issue {} transitioned: {} -> {}",
                    issue.key, item.from_string, item.to_string)

                # Emit event for automation
                event_bus.publish(StatusChangedEvent {
                    issue_key: issue.key.clone(),
                    from_status: item.from_string.clone(),
                    to_status: item.to_string.clone(),
                    timestamp: event.timestamp
                }).await

    RETURN Ok(())
```

---

## 8. Authentication Provider

### 8.1 Auth Methods

```pseudocode
TRAIT AuthProvider:
    async fn authenticate(request: Request) -> Result<Request>
    async fn refresh() -> Result<()>

STRUCT ApiTokenAuth:
    email: String
    token: SecretString

FUNCTION authenticate(self, request: Request) -> Result<Request>:
    # Basic auth with email:token
    credentials = base64::encode(format!("{}:{}", email, token.expose()))

    RETURN request.header("Authorization", format!("Basic {}", credentials))

STRUCT OAuthProvider:
    client_id: String
    client_secret: SecretString
    refresh_token: SecretString
    access_token: RwLock<Option<AccessToken>>
    token_url: String

FUNCTION authenticate(self, request: Request) -> Result<Request>:
    # Check if we have a valid token
    token = access_token.read().await

    IF token.is_none() OR token.is_expired():
        drop(token)
        self.refresh().await?
        token = access_token.read().await

    RETURN request.header("Authorization",
        format!("Bearer {}", token.unwrap().value.expose()))

FUNCTION refresh(self) -> Result<()>:
    body = {
        "grant_type": "refresh_token",
        "client_id": client_id,
        "client_secret": client_secret.expose(),
        "refresh_token": refresh_token.expose()
    }

    response = http.post(token_url)
        .form(body)
        .send().await?

    token_response = response.json::<TokenResponse>().await?

    new_token = AccessToken {
        value: SecretString::new(token_response.access_token),
        expires_at: now() + Duration::seconds(token_response.expires_in)
    }

    *access_token.write().await = Some(new_token)

    RETURN Ok(())
```

---

## 9. Simulation Layer

### 9.1 Mock Client

```pseudocode
STRUCT MockJiraClient:
    issues: RwLock<HashMap<String, Issue>>
    transitions: HashMap<String, Vec<Transition>>
    recorded_calls: RwLock<Vec<RecordedCall>>
    mode: SimulationMode

ENUM SimulationMode:
    Mock          # Return configured responses
    Record        # Record real calls
    Replay        # Replay recorded calls

FUNCTION create_issue(self, input: CreateIssueInput) -> Result<Issue>:
    MATCH mode:
        Mock =>
            id = uuid::new_v4().to_string()
            key = format!("{}-{}", input.project_key, issues.len() + 1)

            issue = Issue {
                id, key,
                fields: IssueFields {
                    summary: input.summary,
                    status: Status { id: "1", name: "Open", category: TODO },
                    ...
                }
            }

            issues.write().await.insert(key.clone(), issue.clone())
            RETURN Ok(issue)

        Record =>
            result = real_client.create_issue(input.clone()).await
            recorded_calls.write().await.push(RecordedCall {
                method: "create_issue",
                input: serialize(input),
                output: serialize(&result),
                timestamp: now()
            })
            RETURN result

        Replay =>
            call = find_matching_call("create_issue", &input)?
            RETURN deserialize(call.output)

FUNCTION transition(self, issue_key: &str, input: TransitionInput) -> Result<()>:
    MATCH mode:
        Mock =>
            issue = issues.write().await.get_mut(issue_key)
                .ok_or(JiraError::NotFound(issue_key))?

            # Find transition
            available = transitions.get(&issue.fields.status.id)
                .ok_or(JiraError::TransitionNotAllowed)?

            transition = available.iter()
                .find(|t| t.id == input.transition_id)
                .ok_or(JiraError::TransitionNotAllowed)?

            # Apply transition
            issue.fields.status = transition.to.clone()
            issue.fields.updated = now()

            RETURN Ok(())
        ...
```

---

## 10. Rate Limiter

### 10.1 Token Bucket

```pseudocode
STRUCT RateLimiter:
    tokens: AtomicF64
    max_tokens: f64
    refill_rate: f64              # Tokens per second
    last_refill: AtomicInstant

FUNCTION acquire(self) -> Future<()>:
    LOOP:
        # Refill tokens
        now = Instant::now()
        elapsed = now - last_refill.swap(now)
        tokens_to_add = elapsed.as_secs_f64() * refill_rate

        current = tokens.load()
        new_tokens = min(current + tokens_to_add, max_tokens)
        tokens.store(new_tokens)

        # Try to acquire
        IF new_tokens >= 1.0:
            IF tokens.compare_exchange(new_tokens, new_tokens - 1.0):
                RETURN

        # Wait for refill
        wait_time = (1.0 - new_tokens) / refill_rate
        sleep(Duration::from_secs_f64(wait_time)).await
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Pseudocode |

---

**Next Phase:** Architecture - Module structure, component diagrams, data flows, and state machines.
