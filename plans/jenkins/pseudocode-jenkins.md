# Pseudocode: Jenkins Integration Module

## SPARC Phase 2: Pseudocode

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/jenkins`

---

## Table of Contents

1. [Core Types](#1-core-types)
2. [Configuration](#2-configuration)
3. [Client Structure](#3-client-structure)
4. [Crumb Management](#4-crumb-management)
5. [Job Operations](#5-job-operations)
6. [Build Operations](#6-build-operations)
7. [Pipeline Operations](#7-pipeline-operations)
8. [Queue Operations](#8-queue-operations)
9. [Console Streaming](#9-console-streaming)
10. [Simulation Layer](#10-simulation-layer)
11. [Error Handling](#11-error-handling)

---

## 1. Core Types

### 1.1 Reference Types

```
ENUM JobRef {
    Simple(String),
    Folder(Vec<String>),
    Url(String)
}

FUNCTION JobRef.to_path() -> String:
    MATCH self:
        Simple(name) -> RETURN format!("/job/{}", url_encode(name))
        Folder(parts) ->
            path = parts.iter()
                .map(|p| format!("/job/{}", url_encode(p)))
                .collect::<String>()
            RETURN path
        Url(url) -> RETURN extract_job_path(url)

ENUM BuildRef {
    Number(u64),
    Last,
    LastSuccessful,
    LastFailed,
    LastStable,
    LastUnstable
}

FUNCTION BuildRef.to_path() -> String:
    MATCH self:
        Number(n) -> RETURN n.to_string()
        Last -> RETURN "lastBuild"
        LastSuccessful -> RETURN "lastSuccessfulBuild"
        LastFailed -> RETURN "lastFailedBuild"
        LastStable -> RETURN "lastStableBuild"
        LastUnstable -> RETURN "lastUnstableBuild"

STRUCT QueueRef {
    id: u64
}
```

### 1.2 Status Types

```
ENUM BuildResult {
    Success,
    Unstable,
    Failure,
    NotBuilt,
    Aborted,
    Unknown(String)
}

FUNCTION BuildResult.from_str(s: &str) -> Self:
    MATCH s.to_uppercase():
        "SUCCESS" -> Success
        "UNSTABLE" -> Unstable
        "FAILURE" -> Failure
        "NOT_BUILT" -> NotBuilt
        "ABORTED" -> Aborted
        other -> Unknown(other.to_string())

ENUM BuildStatus {
    Building,
    Queued(QueueRef),
    Completed(BuildResult),
    Unknown
}

ENUM StageStatus {
    Success,
    Failed,
    Aborted,
    InProgress,
    NotRun,
    Paused,
    Unknown
}
```

### 1.3 Resource Types

```
STRUCT Job {
    name: String,
    url: String,
    color: String,
    buildable: bool,
    in_queue: bool,
    last_build: Option<BuildInfo>,
    health_report: Vec<HealthReport>,
    property: Vec<Property>
}

STRUCT Build {
    number: u64,
    url: String,
    result: Option<BuildResult>,
    building: bool,
    duration: u64,
    estimated_duration: u64,
    timestamp: u64,
    display_name: String,
    description: Option<String>,
    actions: Vec<Action>
}

STRUCT PipelineRun {
    id: String,
    name: String,
    status: String,
    start_time_millis: u64,
    duration_millis: u64,
    end_time_millis: Option<u64>,
    stages: Vec<Stage>
}

STRUCT Stage {
    id: String,
    name: String,
    status: StageStatus,
    start_time_millis: u64,
    duration_millis: u64,
    pause_duration_millis: u64,
    exec_node: Option<String>
}
```

---

## 2. Configuration

```
STRUCT JenkinsConfig {
    base_url: String,
    timeout: Duration,
    log_timeout: Duration,
    max_retries: u32,
    crumb_enabled: bool,
    simulation_mode: SimulationMode
}

ENUM SimulationMode {
    Disabled,
    Recording { path: PathBuf },
    Replay { path: PathBuf }
}

CLASS JenkinsConfigBuilder {
    config: JenkinsConfig

    FUNCTION new(base_url: String) -> Self:
        RETURN Self {
            config: JenkinsConfig {
                base_url: base_url.trim_end_matches('/').to_string(),
                timeout: Duration::from_secs(30),
                log_timeout: Duration::from_secs(300),
                max_retries: 3,
                crumb_enabled: true,
                simulation_mode: SimulationMode::Disabled
            }
        }

    FUNCTION timeout(duration: Duration) -> Self:
        self.config.timeout = duration
        RETURN self

    FUNCTION disable_crumb() -> Self:
        self.config.crumb_enabled = false
        RETURN self

    FUNCTION simulation(mode: SimulationMode) -> Self:
        self.config.simulation_mode = mode
        RETURN self

    FUNCTION build() -> JenkinsConfig:
        RETURN self.config
}
```

---

## 3. Client Structure

```
STRUCT JenkinsClient {
    config: Arc<JenkinsConfig>,
    auth: Arc<dyn TokenProvider>,
    http_client: Arc<HttpClient>,
    crumb_cache: Arc<RwLock<Option<Crumb>>>,
    simulation: Arc<SimulationLayer>,
    metrics: Arc<MetricsCollector>
}

STRUCT Crumb {
    field: String,
    value: String,
    expires_at: Instant
}

FUNCTION JenkinsClient.new(
    config: JenkinsConfig,
    auth: Arc<dyn TokenProvider>
) -> Result<Self>:

    http_client = HttpClient::builder()
        .timeout(config.timeout)
        .pool_max_idle_per_host(5)
        .build()?

    RETURN Ok(Self {
        config: Arc::new(config),
        auth,
        http_client: Arc::new(http_client),
        crumb_cache: Arc::new(RwLock::new(None)),
        simulation: Arc::new(SimulationLayer::new(config.simulation_mode)),
        metrics: Arc::new(MetricsCollector::new("jenkins"))
    })

FUNCTION JenkinsClient.url(path: &str) -> String:
    RETURN format!("{}{}", self.config.base_url, path)

FUNCTION JenkinsClient.request<T>(
    method: Method,
    path: String,
    body: Option<Value>
) -> Result<T>:

    // Check simulation replay
    IF self.simulation.is_replay():
        cache_key = self.simulation.cache_key(method, path, body)
        IF cached = self.simulation.get(cache_key):
            RETURN deserialize(cached)

    // Get auth credentials
    credentials = self.auth.get_credentials().await?

    // Build base request
    request = self.http_client
        .request(method.clone(), self.url(&path))
        .basic_auth(credentials.username, Some(credentials.token.expose()))
        .header("Accept", "application/json")

    // Add crumb for mutations
    IF method != GET AND self.config.crumb_enabled:
        crumb = self.get_or_fetch_crumb().await?
        request = request.header(&crumb.field, &crumb.value)

    IF body IS Some(b):
        request = request.json(b)

    // Execute with retry
    response = self.execute_with_retry(request, method, path).await?

    // Record if in recording mode
    IF self.simulation.is_recording():
        cache_key = self.simulation.cache_key(method, path, body)
        self.simulation.record(cache_key, response.clone())

    RETURN deserialize(response)

FUNCTION JenkinsClient.execute_with_retry(
    request: Request,
    method: Method,
    path: String
) -> Result<Response>:
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

                // Crumb expired - refresh and retry
                IF status == 403 AND method != GET:
                    self.invalidate_crumb().await
                    IF retries == 0:
                        retries += 1
                        crumb = self.fetch_crumb().await?
                        request = request.header(&crumb.field, &crumb.value)
                        CONTINUE

                IF status.is_server_error() AND retries < self.config.max_retries:
                    retries += 1
                    delay = exponential_backoff(retries)
                    sleep(delay).await
                    CONTINUE

                RETURN Err(JenkinsError::from_response(response))

            Err(e):
                IF retries < self.config.max_retries:
                    retries += 1
                    delay = exponential_backoff(retries)
                    sleep(delay).await
                    CONTINUE
                RETURN Err(JenkinsError::Network(e))
```

---

## 4. Crumb Management

```
FUNCTION JenkinsClient.get_or_fetch_crumb() -> Result<Crumb>:
    // Check cache
    cache = self.crumb_cache.read().await
    IF let Some(crumb) = cache.as_ref():
        IF crumb.expires_at > Instant::now():
            RETURN Ok(crumb.clone())
    drop(cache)

    // Fetch new crumb
    RETURN self.fetch_crumb().await

FUNCTION JenkinsClient.fetch_crumb() -> Result<Crumb>:
    credentials = self.auth.get_credentials().await?

    response = self.http_client
        .get(self.url("/crumbIssuer/api/json"))
        .basic_auth(credentials.username, Some(credentials.token.expose()))
        .send()
        .await?

    IF NOT response.status().is_success():
        IF response.status() == 404:
            // Crumb issuer not enabled
            RETURN Err(JenkinsError::CrumbNotEnabled)
        RETURN Err(JenkinsError::from_response(response))

    json: Value = response.json().await?

    crumb = Crumb {
        field: json["crumbRequestField"].as_str().unwrap().to_string(),
        value: json["crumb"].as_str().unwrap().to_string(),
        expires_at: Instant::now() + Duration::from_secs(300) // 5 min cache
    }

    // Update cache
    cache = self.crumb_cache.write().await
    *cache = Some(crumb.clone())

    RETURN Ok(crumb)

FUNCTION JenkinsClient.invalidate_crumb():
    cache = self.crumb_cache.write().await
    *cache = None
```

---

## 5. Job Operations

### 5.1 Get Job

```
FUNCTION JenkinsClient.get_job(job_ref: JobRef) -> Result<Job>:
    path = format!("{}/api/json", job_ref.to_path())

    response = self.request(GET, path, None).await?
    RETURN Job::from_response(response)

FUNCTION JenkinsClient.job_exists(job_ref: JobRef) -> Result<bool>:
    MATCH self.get_job(job_ref).await:
        Ok(_) -> RETURN Ok(true)
        Err(JenkinsError::NotFound { .. }) -> RETURN Ok(false)
        Err(e) -> RETURN Err(e)
```

### 5.2 List Jobs

```
FUNCTION JenkinsClient.list_jobs(folder: Option<JobRef>) -> Result<Vec<JobSummary>>:
    path = MATCH folder:
        Some(ref_) -> format!("{}/api/json?tree=jobs[name,url,color]", ref_.to_path())
        None -> "/api/json?tree=jobs[name,url,color]".to_string()

    response = self.request(GET, path, None).await?

    jobs = response["jobs"].as_array()
        .map(|arr| arr.iter().map(JobSummary::from_json).collect())
        .unwrap_or_default()

    RETURN Ok(jobs)

FUNCTION JenkinsClient.list_view_jobs(view_name: &str) -> Result<Vec<JobSummary>>:
    path = format!("/view/{}/api/json?tree=jobs[name,url,color]",
        url_encode(view_name))

    response = self.request(GET, path, None).await?

    RETURN response["jobs"].as_array()
        .map(|arr| arr.iter().map(JobSummary::from_json).collect())
        .unwrap_or_default()
```

### 5.3 Trigger Build

```
FUNCTION JenkinsClient.trigger_build(
    job_ref: JobRef,
    params: Option<HashMap<String, String>>
) -> Result<QueueRef>:

    path = MATCH params:
        Some(p) IF NOT p.is_empty() ->
            format!("{}/buildWithParameters", job_ref.to_path())
        _ ->
            format!("{}/build", job_ref.to_path())

    // Build form data for parameters
    body = params.map(|p| {
        p.iter().map(|(k, v)| format!("{}={}", k, url_encode(v))).collect()
    })

    response = self.request_raw(POST, path, body).await?

    // Extract queue item ID from Location header
    location = response.headers()
        .get("Location")
        .ok_or(JenkinsError::NoQueueLocation)?
        .to_str()?

    // Location: https://jenkins/queue/item/123/
    queue_id = extract_queue_id(location)?

    RETURN Ok(QueueRef { id: queue_id })

FUNCTION extract_queue_id(location: &str) -> Result<u64>:
    // Parse: .../queue/item/{id}/
    parts: Vec<&str> = location.trim_end_matches('/').split('/').collect()
    id_str = parts.last().ok_or(JenkinsError::InvalidQueueLocation)?

    RETURN id_str.parse()
        .map_err(|_| JenkinsError::InvalidQueueLocation)
```

### 5.4 Enable/Disable Job

```
FUNCTION JenkinsClient.enable_job(job_ref: JobRef) -> Result<()>:
    path = format!("{}/enable", job_ref.to_path())
    self.request_raw(POST, path, None).await?
    RETURN Ok(())

FUNCTION JenkinsClient.disable_job(job_ref: JobRef) -> Result<()>:
    path = format!("{}/disable", job_ref.to_path())
    self.request_raw(POST, path, None).await?
    RETURN Ok(())
```

---

## 6. Build Operations

### 6.1 Get Build

```
FUNCTION JenkinsClient.get_build(
    job_ref: JobRef,
    build_ref: BuildRef
) -> Result<Build>:
    path = format!("{}/{}/api/json", job_ref.to_path(), build_ref.to_path())

    response = self.request(GET, path, None).await?
    RETURN Build::from_response(response)

FUNCTION JenkinsClient.get_build_status(
    job_ref: JobRef,
    build_ref: BuildRef
) -> Result<BuildStatus>:
    build = self.get_build(job_ref, build_ref).await?

    IF build.building:
        RETURN Ok(BuildStatus::Building)

    MATCH build.result:
        Some(result) -> RETURN Ok(BuildStatus::Completed(result))
        None -> RETURN Ok(BuildStatus::Unknown)
```

### 6.2 List Builds

```
FUNCTION JenkinsClient.list_builds(
    job_ref: JobRef,
    limit: Option<u32>
) -> Result<Vec<BuildSummary>>:
    tree = "builds[number,url,result,building,timestamp,duration]"
    range = limit.map(|l| format!("{{0,{}}}", l)).unwrap_or_default()

    path = format!("{}/api/json?tree={}{}",
        job_ref.to_path(), tree, range)

    response = self.request(GET, path, None).await?

    RETURN response["builds"].as_array()
        .map(|arr| arr.iter().map(BuildSummary::from_json).collect())
        .unwrap_or_default()
```

### 6.3 Abort Build

```
FUNCTION JenkinsClient.abort_build(
    job_ref: JobRef,
    build_ref: BuildRef
) -> Result<()>:
    path = format!("{}/{}/stop", job_ref.to_path(), build_ref.to_path())

    self.request_raw(POST, path, None).await?
    RETURN Ok(())
```

### 6.4 Get Build Parameters

```
FUNCTION JenkinsClient.get_build_parameters(
    job_ref: JobRef,
    build_ref: BuildRef
) -> Result<HashMap<String, String>>:
    build = self.get_build(job_ref, build_ref).await?

    params = HashMap::new()

    FOR action IN build.actions:
        IF action._class == "hudson.model.ParametersAction":
            FOR param IN action.parameters.unwrap_or_default():
                params.insert(param.name, param.value.to_string())

    RETURN Ok(params)
```

---

## 7. Pipeline Operations

```
FUNCTION JenkinsClient.get_pipeline_run(
    job_ref: JobRef,
    build_ref: BuildRef
) -> Result<PipelineRun>:
    path = format!("{}/{}/wfapi/describe",
        job_ref.to_path(), build_ref.to_path())

    response = self.request(GET, path, None).await?
    RETURN PipelineRun::from_response(response)

FUNCTION JenkinsClient.get_pipeline_stages(
    job_ref: JobRef,
    build_ref: BuildRef
) -> Result<Vec<Stage>>:
    run = self.get_pipeline_run(job_ref, build_ref).await?
    RETURN Ok(run.stages)

FUNCTION JenkinsClient.get_stage_logs(
    job_ref: JobRef,
    build_ref: BuildRef,
    stage_id: &str
) -> Result<String>:
    // First get the node ID for the stage
    path = format!("{}/{}/wfapi/describe",
        job_ref.to_path(), build_ref.to_path())

    run = self.request(GET, path, None).await?

    // Find stage and get its node
    stage = run["stages"].as_array()
        .and_then(|stages| stages.iter().find(|s| s["id"] == stage_id))
        .ok_or(JenkinsError::StageNotFound)?

    // Get log from execution node
    node_id = stage["_links"]["self"]["href"].as_str()
        .ok_or(JenkinsError::StageNotFound)?

    log_path = format!("{}/log", node_id)
    response = self.request_raw(GET, log_path, None).await?

    RETURN Ok(response.text().await?)

FUNCTION JenkinsClient.submit_input(
    job_ref: JobRef,
    build_ref: BuildRef,
    input_id: &str,
    parameters: HashMap<String, Value>
) -> Result<()>:
    path = format!("{}/{}/wfapi/inputSubmit?inputId={}",
        job_ref.to_path(), build_ref.to_path(), input_id)

    body = { "parameter": parameters }

    self.request_raw(POST, path, Some(body)).await?
    RETURN Ok(())

FUNCTION JenkinsClient.abort_input(
    job_ref: JobRef,
    build_ref: BuildRef,
    input_id: &str
) -> Result<()>:
    path = format!("{}/{}/input/{}/abort",
        job_ref.to_path(), build_ref.to_path(), input_id)

    self.request_raw(POST, path, None).await?
    RETURN Ok(())
```

---

## 8. Queue Operations

```
FUNCTION JenkinsClient.get_queue_item(queue_ref: QueueRef) -> Result<QueueItem>:
    path = format!("/queue/item/{}/api/json", queue_ref.id)

    response = self.request(GET, path, None).await?
    RETURN QueueItem::from_response(response)

FUNCTION JenkinsClient.cancel_queue_item(queue_ref: QueueRef) -> Result<()>:
    path = format!("/queue/cancelItem?id={}", queue_ref.id)

    self.request_raw(POST, path, None).await?
    RETURN Ok(())

FUNCTION JenkinsClient.list_queue() -> Result<Vec<QueueItem>>:
    path = "/queue/api/json"

    response = self.request(GET, path, None).await?

    RETURN response["items"].as_array()
        .map(|arr| arr.iter().map(QueueItem::from_json).collect())
        .unwrap_or_default()

FUNCTION JenkinsClient.wait_for_build(
    queue_ref: QueueRef,
    timeout: Duration
) -> Result<BuildRef>:
    start = Instant::now()
    poll_interval = Duration::from_secs(1)

    LOOP:
        IF start.elapsed() > timeout:
            RETURN Err(JenkinsError::QueueTimeout)

        item = self.get_queue_item(queue_ref).await?

        // Check if build has started
        IF let Some(executable) = item.executable:
            RETURN Ok(BuildRef::Number(executable.number))

        // Check if cancelled or stuck
        IF item.cancelled:
            RETURN Err(JenkinsError::QueueCancelled)

        IF item.stuck:
            // Continue waiting but log warning
            tracing::warn!("Queue item {} is stuck: {}",
                queue_ref.id, item.why.unwrap_or_default())

        sleep(poll_interval).await

        // Increase poll interval up to 5s
        poll_interval = min(poll_interval * 2, Duration::from_secs(5))
```

---

## 9. Console Streaming

```
FUNCTION JenkinsClient.get_console_output(
    job_ref: JobRef,
    build_ref: BuildRef
) -> Result<String>:
    path = format!("{}/{}/consoleText",
        job_ref.to_path(), build_ref.to_path())

    response = self.request_raw_with_timeout(
        GET, path, None, self.config.log_timeout
    ).await?

    RETURN Ok(response.text().await?)

FUNCTION JenkinsClient.stream_console_output(
    job_ref: JobRef,
    build_ref: BuildRef
) -> impl Stream<Item = Result<String>>:
    async_stream::try_stream! {
        offset = 0
        more_data = true

        WHILE more_data:
            path = format!("{}/{}/logText/progressiveText?start={}",
                job_ref.to_path(), build_ref.to_path(), offset)

            response = self.request_raw(GET, path, None).await?

            // Check headers for more data
            more_data = response.headers()
                .get("X-More-Data")
                .and_then(|v| v.to_str().ok())
                .map(|v| v == "true")
                .unwrap_or(false)

            // Get new offset
            new_offset = response.headers()
                .get("X-Text-Size")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(offset)

            // Yield new content
            IF new_offset > offset:
                content = response.text().await?
                offset = new_offset
                yield content

            // If still building, wait before next poll
            IF more_data:
                sleep(Duration::from_secs(1)).await
    }

FUNCTION JenkinsClient.get_console_output_progressive(
    job_ref: JobRef,
    build_ref: BuildRef,
    start: u64
) -> Result<(String, u64, bool)>:
    path = format!("{}/{}/logText/progressiveText?start={}",
        job_ref.to_path(), build_ref.to_path(), start)

    response = self.request_raw(GET, path, None).await?

    more_data = response.headers()
        .get("X-More-Data")
        .and_then(|v| v.to_str().ok())
        .map(|v| v == "true")
        .unwrap_or(false)

    new_offset = response.headers()
        .get("X-Text-Size")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok())
        .unwrap_or(start)

    content = response.text().await?

    RETURN Ok((content, new_offset, more_data))
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
    path: String,
    body: Option<Value>
) -> String:
    hasher = Sha256::new()
    hasher.update(method.as_str().as_bytes())
    hasher.update(path.as_bytes())
    IF body IS Some(b):
        hasher.update(canonical_json(&b).as_bytes())

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
    content_hash = compute_hash(&body)

    recorded = RecordedResponse {
        status: response.status().as_u16(),
        headers: extract_headers(response.headers()),
        body,
        content_hash
    }

    recordings = self.recordings.write().await
    recordings.insert(key, recorded)

    IF let Some(path) = &self.file_path:
        save_recordings(path, &recordings)
```

---

## 11. Error Handling

```
ENUM JenkinsError {
    // API Errors
    BadRequest { message: String },
    Unauthorized { message: String },
    Forbidden { message: String },
    NotFound { resource: String },
    Conflict { message: String },
    InternalError { message: String },
    ServiceUnavailable,

    // Client Errors
    InvalidJobRef { input: String },
    InvalidBuildRef { input: String },
    InvalidQueueLocation,
    NoQueueLocation,
    Network { source: reqwest::Error },
    Timeout,

    // Crumb Errors
    CrumbNotEnabled,
    CrumbFetchFailed { message: String },

    // Queue Errors
    QueueTimeout,
    QueueCancelled,

    // Pipeline Errors
    StageNotFound,
    InputNotFound,

    // Simulation Errors
    SimulationMiss { key: String },
    SimulationCorrupted { path: PathBuf }
}

FUNCTION JenkinsError.from_response(response: Response) -> Self:
    status = response.status()
    body = response.text().await.unwrap_or_default()

    MATCH status.as_u16():
        400 -> BadRequest { message: body }
        401 -> Unauthorized { message: body }
        403 -> Forbidden { message: body }
        404 -> NotFound { resource: "unknown".into() }
        409 -> Conflict { message: body }
        500 -> InternalError { message: body }
        503 -> ServiceUnavailable
        _ -> InternalError { message: body }

FUNCTION JenkinsError.is_retryable() -> bool:
    MATCH self:
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
| Document ID | SPARC-JENKINS-PSEUDO-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Pseudocode Document**

*Proceed to Architecture phase upon approval.*
