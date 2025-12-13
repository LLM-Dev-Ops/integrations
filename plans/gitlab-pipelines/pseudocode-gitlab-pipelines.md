# GitLab Pipelines Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/gitlab-pipelines`

---

## 1. Core Data Structures

### 1.1 Configuration

```pseudocode
STRUCT GitLabConfig:
    base_url: String              # https://gitlab.com or self-hosted
    token: SecretString           # Access token
    token_type: TokenType         # Personal | Project | Group | Trigger
    timeout: Duration             # Request timeout
    max_retries: u32              # Retry attempts
    rate_limit_rps: u32           # Requests per second
    poll_interval: Duration       # Status polling interval

ENUM TokenType:
    PersonalAccessToken
    ProjectAccessToken
    GroupAccessToken
    TriggerToken
    CIJobToken
```

### 1.2 Pipeline Types

```pseudocode
STRUCT Pipeline:
    id: i64
    iid: i64                      # Project-scoped ID
    project_id: i64
    sha: String
    ref_: String
    status: PipelineStatus
    source: PipelineSource
    created_at: DateTime
    updated_at: DateTime
    started_at: Option<DateTime>
    finished_at: Option<DateTime>
    duration: Option<i64>         # Seconds
    queued_duration: Option<i64>
    web_url: String
    user: Option<User>

ENUM PipelineStatus:
    Created
    WaitingForResource
    Preparing
    Pending
    Running
    Success
    Failed
    Canceled
    Skipped
    Manual
    Scheduled

ENUM PipelineSource:
    Push
    Web
    Trigger
    Schedule
    Api
    External
    Pipeline
    Chat
    WebIde
    MergeRequestEvent
    ParentPipeline
```

### 1.3 Job Types

```pseudocode
STRUCT Job:
    id: i64
    name: String
    stage: String
    status: JobStatus
    ref_: String
    created_at: DateTime
    started_at: Option<DateTime>
    finished_at: Option<DateTime>
    duration: Option<f64>
    queued_duration: Option<f64>
    allow_failure: bool
    pipeline: PipelineRef
    artifacts: Vec<Artifact>
    runner: Option<Runner>
    web_url: String
    manual: bool
    playable: bool
    retryable: bool
    cancelable: bool

ENUM JobStatus:
    Created
    Pending
    Running
    Success
    Failed
    Canceled
    Skipped
    Manual
    Preparing
    WaitingForResource

STRUCT Artifact:
    filename: String
    size: i64
    file_type: String
    expire_at: Option<DateTime>
```

### 1.4 Webhook Types

```pseudocode
STRUCT WebhookEvent:
    object_kind: String           # "pipeline" | "build"
    object_attributes: ObjectAttributes
    project: ProjectInfo
    builds: Option<Vec<BuildInfo>>
    user: Option<User>

STRUCT PipelineAttributes:
    id: i64
    ref_: String
    status: PipelineStatus
    stages: Vec<String>
    created_at: DateTime
    finished_at: Option<DateTime>
    duration: Option<i64>
    variables: Vec<Variable>

STRUCT JobAttributes:
    id: i64
    name: String
    stage: String
    status: JobStatus
    build_duration: Option<f64>
    build_allow_failure: bool
```

---

## 2. Client Core

### 2.1 GitLabClient

```pseudocode
STRUCT GitLabClient:
    config: GitLabConfig
    http: HttpClient
    rate_limiter: RateLimiter
    circuit_breaker: CircuitBreaker
    metrics: MetricsCollector

FUNCTION new(config: GitLabConfig) -> Result<GitLabClient>:
    VALIDATE config.base_url is valid URL
    VALIDATE config.token is not empty

    http = HttpClient::new(config.timeout)
    rate_limiter = RateLimiter::new(config.rate_limit_rps)
    circuit_breaker = CircuitBreaker::new(
        failure_threshold: 5,
        success_threshold: 2,
        reset_timeout: Duration::seconds(30)
    )

    RETURN Ok(GitLabClient { config, http, rate_limiter, circuit_breaker, metrics })

FUNCTION execute_request<T>(self, request: Request) -> Result<T>:
    span = tracing::span("gitlab.request", method: request.method, path: request.path)

    # Check circuit breaker
    IF NOT circuit_breaker.allow_request():
        RETURN Err(GitLabError::ServiceUnavailable("Circuit open"))

    # Apply rate limiting
    rate_limiter.acquire().await

    # Add authentication header
    request = add_auth_header(request, config.token, config.token_type)

    # Execute with retry
    result = execute_with_retry(|| {
        response = http.execute(request.clone()).await
        handle_response(response)
    }, config.max_retries).await

    # Update circuit breaker and metrics
    MATCH result:
        Ok(_) => circuit_breaker.record_success()
        Err(e) IF e.is_server_error() => circuit_breaker.record_failure()

    # Track rate limit headers
    IF let Some(remaining) = response.header("RateLimit-Remaining"):
        metrics.gauge("gitlab_rate_limit_remaining", remaining)

    RETURN result

FUNCTION add_auth_header(request: Request, token: &SecretString, token_type: TokenType) -> Request:
    MATCH token_type:
        PersonalAccessToken | ProjectAccessToken | GroupAccessToken =>
            request.header("PRIVATE-TOKEN", token.expose())
        TriggerToken =>
            # Trigger tokens go in body, not header
            request
        CIJobToken =>
            request.header("JOB-TOKEN", token.expose())

FUNCTION handle_response<T>(response: Response) -> Result<T>:
    MATCH response.status:
        200..299 =>
            RETURN Ok(response.json::<T>().await?)
        400 =>
            error = response.json::<GitLabErrorResponse>().await?
            RETURN Err(GitLabError::PipelineError(error.message))
        401 =>
            RETURN Err(GitLabError::AuthenticationError("Unauthorized"))
        403 =>
            RETURN Err(GitLabError::PermissionDenied(response.text().await?))
        404 =>
            RETURN Err(GitLabError::NotFound(response.text().await?))
        429 =>
            reset_at = response.header("RateLimit-Reset")
            RETURN Err(GitLabError::RateLimited(reset_at))
        500..599 =>
            RETURN Err(GitLabError::ServerError(response.status))
```

---

## 3. Pipeline Service

### 3.1 Pipeline Operations

```pseudocode
TRAIT PipelineService:
    async fn create(project_id: i64, input: CreatePipelineInput) -> Result<Pipeline>
    async fn get(project_id: i64, pipeline_id: i64) -> Result<Pipeline>
    async fn list(project_id: i64, options: ListOptions) -> Result<PaginatedResult<Pipeline>>
    async fn cancel(project_id: i64, pipeline_id: i64) -> Result<Pipeline>
    async fn retry(project_id: i64, pipeline_id: i64) -> Result<Pipeline>
    async fn delete(project_id: i64, pipeline_id: i64) -> Result<()>
    async fn get_variables(project_id: i64, pipeline_id: i64) -> Result<Vec<Variable>>

STRUCT CreatePipelineInput:
    ref_: String                  # Branch or tag
    variables: Vec<Variable>      # Pipeline variables

STRUCT Variable:
    key: String
    value: String
    variable_type: VariableType   # EnvVar | File

FUNCTION create(self, project_id: i64, input: CreatePipelineInput) -> Result<Pipeline>:
    span = tracing::span("gitlab.pipeline.create",
        project_id: project_id,
        ref: input.ref_
    )

    # Validate ref format
    VALIDATE input.ref_ is not empty
    VALIDATE input.ref_ matches REF_PATTERN

    # Build request body
    body = {
        "ref": input.ref_,
        "variables": input.variables.iter().map(|v| {
            { "key": v.key, "value": v.value, "variable_type": v.variable_type }
        }).collect()
    }

    request = Request::post(format!("/projects/{}/pipeline", project_id))
        .json(body)

    pipeline = client.execute_request::<Pipeline>(request).await?

    metrics.increment("gitlab_pipelines_triggered_total",
        project: project_id,
        ref: input.ref_,
        source: "api"
    )

    log::info!("Created pipeline {} for project {}", pipeline.id, project_id)
    RETURN Ok(pipeline)

FUNCTION cancel(self, project_id: i64, pipeline_id: i64) -> Result<Pipeline>:
    span = tracing::span("gitlab.pipeline.cancel",
        project_id: project_id,
        pipeline_id: pipeline_id
    )

    # Check if cancelable
    current = self.get(project_id, pipeline_id).await?
    IF NOT current.status.is_cancelable():
        RETURN Err(GitLabError::CannotCancel {
            pipeline_id,
            status: current.status
        })

    request = Request::post(format!(
        "/projects/{}/pipelines/{}/cancel",
        project_id, pipeline_id
    ))

    pipeline = client.execute_request::<Pipeline>(request).await?

    log::info!("Canceled pipeline {}", pipeline_id)
    RETURN Ok(pipeline)

FUNCTION retry(self, project_id: i64, pipeline_id: i64) -> Result<Pipeline>:
    span = tracing::span("gitlab.pipeline.retry",
        project_id: project_id,
        pipeline_id: pipeline_id
    )

    # Check if retryable
    current = self.get(project_id, pipeline_id).await?
    IF NOT current.status.is_retryable():
        RETURN Err(GitLabError::CannotRetry {
            pipeline_id,
            status: current.status
        })

    request = Request::post(format!(
        "/projects/{}/pipelines/{}/retry",
        project_id, pipeline_id
    ))

    pipeline = client.execute_request::<Pipeline>(request).await?

    log::info!("Retried pipeline {}", pipeline_id)
    RETURN Ok(pipeline)
```

### 3.2 Trigger Token Operations

```pseudocode
FUNCTION trigger_with_token(
    self,
    project_id: i64,
    trigger_token: &SecretString,
    ref_: &str,
    variables: HashMap<String, String>
) -> Result<Pipeline>:
    span = tracing::span("gitlab.pipeline.trigger", project_id: project_id)

    # Build form data (trigger endpoint uses form, not JSON)
    form = FormData::new()
        .field("token", trigger_token.expose())
        .field("ref", ref_)

    FOR (key, value) IN variables:
        form = form.field(format!("variables[{}]", key), value)

    request = Request::post(format!("/projects/{}/trigger/pipeline", project_id))
        .form(form)

    pipeline = client.execute_request::<Pipeline>(request).await?

    metrics.increment("gitlab_pipelines_triggered_total",
        project: project_id,
        ref: ref_,
        source: "trigger"
    )

    RETURN Ok(pipeline)
```

---

## 4. Job Service

### 4.1 Job Operations

```pseudocode
TRAIT JobService:
    async fn list(project_id: i64, pipeline_id: i64, options: ListOptions) -> Result<Vec<Job>>
    async fn get(project_id: i64, job_id: i64) -> Result<Job>
    async fn get_log(project_id: i64, job_id: i64) -> Result<String>
    async fn retry(project_id: i64, job_id: i64) -> Result<Job>
    async fn cancel(project_id: i64, job_id: i64) -> Result<Job>
    async fn play(project_id: i64, job_id: i64, variables: Option<Vec<Variable>>) -> Result<Job>
    async fn erase(project_id: i64, job_id: i64) -> Result<Job>

FUNCTION list(self, project_id: i64, pipeline_id: i64, options: ListOptions) -> Result<Vec<Job>>:
    span = tracing::span("gitlab.job.list",
        project_id: project_id,
        pipeline_id: pipeline_id
    )

    request = Request::get(format!(
        "/projects/{}/pipelines/{}/jobs",
        project_id, pipeline_id
    ))
    .query("per_page", options.per_page.unwrap_or(100))
    .query("page", options.page.unwrap_or(1))

    IF let Some(scope) = options.scope:
        request = request.query("scope[]", scope)

    jobs = client.execute_request::<Vec<Job>>(request).await?

    span.set_attribute("job_count", jobs.len())
    RETURN Ok(jobs)

FUNCTION get_log(self, project_id: i64, job_id: i64) -> Result<String>:
    span = tracing::span("gitlab.job.log",
        project_id: project_id,
        job_id: job_id
    )

    request = Request::get(format!(
        "/projects/{}/jobs/{}/trace",
        project_id, job_id
    ))

    # Log endpoint returns plain text, not JSON
    response = client.http.execute(request).await?

    IF response.status != 200:
        RETURN Err(GitLabError::LogsNotAvailable(job_id))

    log_content = response.text().await?

    span.set_attribute("bytes", log_content.len())
    RETURN Ok(log_content)

FUNCTION play(self, project_id: i64, job_id: i64, variables: Option<Vec<Variable>>) -> Result<Job>:
    span = tracing::span("gitlab.job.play",
        project_id: project_id,
        job_id: job_id
    )

    # Verify job is playable
    job = self.get(project_id, job_id).await?
    IF NOT job.playable:
        RETURN Err(GitLabError::JobNotPlayable {
            job_id,
            status: job.status
        })

    body = match variables:
        Some(vars) => { "job_variables_attributes": vars }
        None => {}

    request = Request::post(format!(
        "/projects/{}/jobs/{}/play",
        project_id, job_id
    ))
    .json(body)

    job = client.execute_request::<Job>(request).await?

    log::info!("Played manual job {}", job_id)
    RETURN Ok(job)
```

---

## 5. Artifact Service

### 5.1 Artifact Operations

```pseudocode
TRAIT ArtifactService:
    async fn download(project_id: i64, job_id: i64) -> Result<Bytes>
    async fn download_file(project_id: i64, job_id: i64, path: &str) -> Result<Bytes>
    async fn browse(project_id: i64, job_id: i64, path: Option<&str>) -> Result<Vec<ArtifactEntry>>

STRUCT ArtifactEntry:
    name: String
    size: Option<i64>
    mode: String                  # File mode (e.g., "100644")

FUNCTION download(self, project_id: i64, job_id: i64) -> Result<Bytes>:
    span = tracing::span("gitlab.artifact.download",
        project_id: project_id,
        job_id: job_id
    )

    request = Request::get(format!(
        "/projects/{}/jobs/{}/artifacts",
        project_id, job_id
    ))

    response = client.http.execute(request).await?

    MATCH response.status:
        200 =>
            bytes = response.bytes().await?
            span.set_attribute("size", bytes.len())
            metrics.counter("gitlab_artifacts_downloaded_bytes", bytes.len())
            RETURN Ok(bytes)
        404 =>
            RETURN Err(GitLabError::ArtifactNotFound(job_id))
        _ =>
            RETURN Err(GitLabError::ServerError(response.status))

FUNCTION download_file(self, project_id: i64, job_id: i64, path: &str) -> Result<Bytes>:
    span = tracing::span("gitlab.artifact.download_file",
        project_id: project_id,
        job_id: job_id,
        path: path
    )

    # URL-encode the path
    encoded_path = urlencoding::encode(path)

    request = Request::get(format!(
        "/projects/{}/jobs/{}/artifacts/{}",
        project_id, job_id, encoded_path
    ))

    response = client.http.execute(request).await?

    MATCH response.status:
        200 => RETURN Ok(response.bytes().await?)
        404 => RETURN Err(GitLabError::ArtifactNotFound(job_id))
        _ => RETURN Err(GitLabError::ServerError(response.status))
```

---

## 6. Status Polling

### 6.1 Pipeline Waiter

```pseudocode
STRUCT PipelineWaiter:
    client: GitLabClient
    poll_interval: Duration
    max_wait: Duration

FUNCTION wait_for_completion(
    self,
    project_id: i64,
    pipeline_id: i64,
    callback: Option<StatusCallback>
) -> Result<Pipeline>:
    span = tracing::span("gitlab.pipeline.wait",
        project_id: project_id,
        pipeline_id: pipeline_id
    )

    start = Instant::now()
    last_status = None

    LOOP:
        # Check timeout
        IF start.elapsed() > self.max_wait:
            RETURN Err(GitLabError::Timeout {
                pipeline_id,
                waited: start.elapsed()
            })

        # Fetch current status
        pipeline = client.pipelines().get(project_id, pipeline_id).await?

        # Notify callback on status change
        IF last_status != Some(pipeline.status):
            IF let Some(cb) = &callback:
                cb.on_status_change(&pipeline).await
            last_status = Some(pipeline.status)

        # Check if terminal state
        IF pipeline.status.is_terminal():
            log::info!("Pipeline {} completed with status {:?}",
                pipeline_id, pipeline.status)
            RETURN Ok(pipeline)

        # Adaptive polling interval
        interval = calculate_poll_interval(pipeline.status, start.elapsed())
        tokio::time::sleep(interval).await

FUNCTION calculate_poll_interval(status: PipelineStatus, elapsed: Duration) -> Duration:
    base = match status:
        Running => Duration::seconds(5)
        Pending | WaitingForResource => Duration::seconds(10)
        Preparing => Duration::seconds(3)
        _ => Duration::seconds(5)

    # Increase interval over time to reduce API calls
    IF elapsed > Duration::minutes(5):
        base * 2
    ELSE IF elapsed > Duration::minutes(15):
        base * 4
    ELSE:
        base

IMPL PipelineStatus:
    FUNCTION is_terminal(self) -> bool:
        MATCH self:
            Success | Failed | Canceled | Skipped => true
            _ => false

    FUNCTION is_cancelable(self) -> bool:
        MATCH self:
            Running | Pending | WaitingForResource | Preparing => true
            _ => false

    FUNCTION is_retryable(self) -> bool:
        MATCH self:
            Failed | Canceled => true
            _ => false
```

### 6.2 Multi-Pipeline Coordinator

```pseudocode
STRUCT PipelineCoordinator:
    client: GitLabClient
    waiters: HashMap<(i64, i64), JoinHandle<Result<Pipeline>>>

FUNCTION wait_all(
    self,
    pipelines: Vec<(i64, i64)>  # (project_id, pipeline_id)
) -> Result<Vec<Pipeline>>:
    span = tracing::span("gitlab.pipeline.wait_all", count: pipelines.len())

    # Spawn concurrent waiters
    handles = pipelines.iter().map(|(proj, pipe)| {
        let waiter = PipelineWaiter::new(client.clone())
        tokio::spawn(waiter.wait_for_completion(*proj, *pipe, None))
    }).collect::<Vec<_>>()

    # Collect results
    results = futures::join_all(handles).await

    # Process results
    pipelines = Vec::new()
    errors = Vec::new()

    FOR result IN results:
        MATCH result:
            Ok(Ok(pipeline)) => pipelines.push(pipeline)
            Ok(Err(e)) => errors.push(e)
            Err(join_error) => errors.push(GitLabError::InternalError(join_error))

    IF NOT errors.is_empty():
        log::warn!("Some pipelines failed: {:?}", errors)

    RETURN Ok(pipelines)

FUNCTION trigger_and_wait(
    self,
    project_id: i64,
    ref_: &str,
    variables: Vec<Variable>,
    timeout: Duration
) -> Result<Pipeline>:
    # Trigger pipeline
    pipeline = client.pipelines().create(project_id, CreatePipelineInput {
        ref_: ref_.to_string(),
        variables
    }).await?

    # Wait for completion
    waiter = PipelineWaiter::new(client.clone())
        .with_max_wait(timeout)

    waiter.wait_for_completion(project_id, pipeline.id, None).await
```

---

## 7. Webhook Handler

### 7.1 Webhook Processing

```pseudocode
TRAIT WebhookHandler:
    async fn handle(request: WebhookRequest) -> Result<WebhookResponse>
    fn validate_token(request: &WebhookRequest, expected: &str) -> Result<()>

STRUCT WebhookRequest:
    headers: HashMap<String, String>
    body: Vec<u8>

FUNCTION handle(self, request: WebhookRequest) -> Result<WebhookResponse>:
    span = tracing::span("gitlab.webhook.receive")

    # Validate webhook token
    IF let Some(expected_token) = config.webhook_token:
        validate_token(&request, &expected_token)?

    # Parse event type from header
    event_type = request.headers.get("X-Gitlab-Event")
        .ok_or(GitLabError::InvalidWebhook("Missing X-Gitlab-Event header"))?

    span.set_attribute("event_type", event_type)

    # Parse body
    event = serde_json::from_slice::<WebhookEvent>(&request.body)?

    # Route to appropriate handler
    MATCH event.object_kind.as_str():
        "pipeline" => handle_pipeline_event(event).await
        "build" => handle_job_event(event).await
        "deployment" => handle_deployment_event(event).await
        _ =>
            log::debug!("Unhandled webhook event: {}", event.object_kind)
            RETURN Ok(WebhookResponse::Ignored)

    metrics.increment("gitlab_webhook_events_total", event_type: event.object_kind)

    RETURN Ok(WebhookResponse::Processed)

FUNCTION validate_token(request: &WebhookRequest, expected: &str) -> Result<()>:
    token = request.headers.get("X-Gitlab-Token")
        .ok_or(GitLabError::InvalidWebhook("Missing X-Gitlab-Token header"))?

    IF NOT constant_time_eq(token, expected):
        RETURN Err(GitLabError::InvalidWebhook("Invalid webhook token"))

    RETURN Ok(())

FUNCTION handle_pipeline_event(event: WebhookEvent) -> Result<()>:
    attrs = event.object_attributes
    project = event.project

    log::info!("Pipeline {} in {} transitioned to {:?}",
        attrs.id,
        project.path_with_namespace,
        attrs.status
    )

    # Record metrics
    IF attrs.status.is_terminal():
        metrics.increment("gitlab_pipelines_completed_total",
            project: project.id,
            status: attrs.status
        )

        IF let Some(duration) = attrs.duration:
            metrics.histogram("gitlab_pipeline_duration_seconds",
                duration as f64,
                project: project.id,
                status: attrs.status
            )

    # Emit event for downstream processing
    event_bus.publish(PipelineStatusChanged {
        project_id: project.id,
        pipeline_id: attrs.id,
        status: attrs.status,
        ref_: attrs.ref_,
        timestamp: now()
    }).await

    RETURN Ok(())
```

---

## 8. Log Streaming

### 8.1 Log Streamer

```pseudocode
STRUCT LogStreamer:
    client: GitLabClient
    poll_interval: Duration

FUNCTION stream_log(
    self,
    project_id: i64,
    job_id: i64,
    callback: LogCallback
) -> Result<()>:
    span = tracing::span("gitlab.job.stream_log",
        project_id: project_id,
        job_id: job_id
    )

    last_offset = 0

    LOOP:
        # Check job status
        job = client.jobs().get(project_id, job_id).await?

        # Fetch log with offset
        request = Request::get(format!(
            "/projects/{}/jobs/{}/trace",
            project_id, job_id
        ))
        .header("Range", format!("bytes={}-", last_offset))

        response = client.http.execute(request).await?

        IF response.status == 206:  # Partial Content
            new_content = response.text().await?

            IF NOT new_content.is_empty():
                callback.on_log_chunk(&new_content).await
                last_offset += new_content.len()

        ELSE IF response.status == 200:
            # Full content (small log or no Range support)
            content = response.text().await?
            IF content.len() > last_offset:
                callback.on_log_chunk(&content[last_offset..]).await
                last_offset = content.len()

        # Check if job finished
        IF job.status.is_terminal():
            callback.on_complete(job.status).await
            BREAK

        tokio::time::sleep(self.poll_interval).await

    RETURN Ok(())

TRAIT LogCallback:
    async fn on_log_chunk(chunk: &str)
    async fn on_complete(status: JobStatus)
```

---

## 9. Simulation Layer

### 9.1 Mock Client

```pseudocode
STRUCT MockGitLabClient:
    pipelines: RwLock<HashMap<i64, Pipeline>>
    jobs: RwLock<HashMap<i64, Job>>
    recorded_calls: RwLock<Vec<RecordedCall>>
    mode: SimulationMode
    pipeline_progression: PipelineProgression

ENUM SimulationMode:
    Mock
    Record
    Replay

STRUCT PipelineProgression:
    stages: Vec<String>
    stage_duration: Duration
    success_rate: f64

FUNCTION create_pipeline(self, project_id: i64, input: CreatePipelineInput) -> Result<Pipeline>:
    MATCH mode:
        Mock =>
            id = generate_mock_id()
            pipeline = Pipeline {
                id,
                iid: pipelines.len() + 1,
                project_id,
                sha: generate_mock_sha(),
                ref_: input.ref_,
                status: PipelineStatus::Pending,
                source: PipelineSource::Api,
                created_at: now(),
                ...
            }

            pipelines.write().await.insert(id, pipeline.clone())

            # Schedule progression
            tokio::spawn(progress_pipeline(id))

            RETURN Ok(pipeline)

        Record =>
            result = real_client.create_pipeline(project_id, input.clone()).await
            recorded_calls.write().await.push(RecordedCall {
                method: "create_pipeline",
                input: serialize((project_id, input)),
                output: serialize(&result),
                timestamp: now()
            })
            RETURN result

        Replay =>
            call = find_matching_call("create_pipeline", (project_id, &input))?
            RETURN deserialize(call.output)

ASYNC FUNCTION progress_pipeline(self, pipeline_id: i64):
    FOR stage IN pipeline_progression.stages:
        # Update pipeline to running
        update_pipeline_status(pipeline_id, PipelineStatus::Running).await

        # Simulate stage execution
        tokio::time::sleep(pipeline_progression.stage_duration).await

    # Determine final status
    final_status = IF random() < pipeline_progression.success_rate:
        PipelineStatus::Success
    ELSE:
        PipelineStatus::Failed

    update_pipeline_status(pipeline_id, final_status).await
```

---

## 10. Rate Limiter

### 10.1 GitLab Rate Limiter

```pseudocode
STRUCT GitLabRateLimiter:
    tokens: AtomicF64
    max_tokens: f64
    refill_rate: f64
    last_refill: AtomicInstant
    reset_time: AtomicOption<Instant>  # From RateLimit-Reset header

FUNCTION acquire(self) -> Future<()>:
    # Check if we're in a rate limit backoff period
    IF let Some(reset) = reset_time.load():
        IF Instant::now() < reset:
            wait_duration = reset - Instant::now()
            log::warn!("Rate limited, waiting {:?}", wait_duration)
            tokio::time::sleep(wait_duration).await
            reset_time.store(None)

    # Standard token bucket
    LOOP:
        refill_tokens()

        current = tokens.load()
        IF current >= 1.0:
            IF tokens.compare_exchange(current, current - 1.0):
                RETURN

        wait_time = (1.0 - current) / refill_rate
        tokio::time::sleep(Duration::from_secs_f64(wait_time)).await

FUNCTION handle_rate_limit_response(self, reset_header: Option<&str>):
    IF let Some(reset) = reset_header:
        IF let Ok(timestamp) = reset.parse::<i64>():
            reset_instant = Instant::from_unix_timestamp(timestamp)
            reset_time.store(Some(reset_instant))
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Pseudocode |

---

**Next Phase:** Architecture - Module structure, component diagrams, data flows, and state machines.
