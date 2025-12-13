# Pseudocode: GitLab Integration Module

## SPARC Phase 2: Pseudocode

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/gitlab`

---

## Table of Contents

1. [Core Types](#1-core-types)
2. [Configuration](#2-configuration)
3. [Client Structure](#3-client-structure)
4. [Repository Operations](#4-repository-operations)
5. [Merge Request Operations](#5-merge-request-operations)
6. [Pipeline Operations](#6-pipeline-operations)
7. [Job Operations](#7-job-operations)
8. [Webhook Handling](#8-webhook-handling)
9. [Rate Limiting](#9-rate-limiting)
10. [Simulation Layer](#10-simulation-layer)
11. [Error Handling](#11-error-handling)

---

## 1. Core Types

### 1.1 Reference Types

```
ENUM ProjectRef {
    Id(u64),
    Path(String),
    Url(String)
}

FUNCTION ProjectRef.to_encoded_path() -> Result<String>:
    MATCH self:
        Id(id) -> RETURN Ok(id.to_string())
        Path(path) -> RETURN Ok(url_encode(path))
        Url(url) -> RETURN extract_project_path(url).map(url_encode)

STRUCT MergeRequestRef {
    project: ProjectRef,
    iid: u64
}

STRUCT PipelineRef {
    project: ProjectRef,
    id: u64
}

STRUCT JobRef {
    project: ProjectRef,
    id: u64
}

ENUM CommitRef {
    Sha(String),
    Branch(String),
    Tag(String)
}
```

### 1.2 Status Types

```
ENUM PipelineStatus {
    Created, WaitingForResource, Preparing, Pending,
    Running, Success, Failed, Canceled, Skipped,
    Manual, Scheduled
}

ENUM JobStatus {
    Created, Pending, Running, Success, Failed,
    Canceled, Skipped, Manual, Waiting
}

ENUM MergeRequestState {
    Opened, Closed, Merged, Locked, All
}

ENUM MergeStatus {
    CanBeMerged, CannotBeMerged, Checking,
    CannotBeMergedRecheck, Unchecked
}
```

### 1.3 Resource Types

```
STRUCT Project {
    id: u64,
    name: String,
    path_with_namespace: String,
    default_branch: String,
    web_url: String,
    visibility: Visibility
}

STRUCT MergeRequest {
    id: u64,
    iid: u64,
    title: String,
    description: Option<String>,
    state: MergeRequestState,
    merge_status: MergeStatus,
    source_branch: String,
    target_branch: String,
    author: User,
    web_url: String,
    has_conflicts: bool,
    draft: bool
}

STRUCT Pipeline {
    id: u64,
    status: PipelineStatus,
    ref_: String,
    sha: String,
    web_url: String,
    created_at: DateTime,
    updated_at: DateTime
}

STRUCT Job {
    id: u64,
    name: String,
    stage: String,
    status: JobStatus,
    web_url: String,
    duration: Option<f64>,
    started_at: Option<DateTime>,
    finished_at: Option<DateTime>
}
```

---

## 2. Configuration

```
STRUCT GitLabConfig {
    base_url: String,              // "https://gitlab.com" or self-hosted
    api_version: String,           // "v4"
    timeout: Duration,             // 30s
    log_timeout: Duration,         // 300s for streaming logs
    max_retries: u32,              // 3
    rate_limit: RateLimitConfig,
    simulation_mode: SimulationMode
}

STRUCT RateLimitConfig {
    requests_per_minute: u32,      // 2000 for authenticated
    burst_size: u32,               // 100
    retry_after_buffer: Duration   // 100ms
}

ENUM SimulationMode {
    Disabled,
    Recording { path: PathBuf },
    Replay { path: PathBuf }
}

CLASS GitLabConfigBuilder {
    config: GitLabConfig

    FUNCTION new() -> Self:
        RETURN Self {
            config: GitLabConfig {
                base_url: "https://gitlab.com".to_string(),
                api_version: "v4".to_string(),
                timeout: Duration::from_secs(30),
                log_timeout: Duration::from_secs(300),
                max_retries: 3,
                rate_limit: RateLimitConfig::default(),
                simulation_mode: SimulationMode::Disabled
            }
        }

    FUNCTION base_url(url: String) -> Self:
        self.config.base_url = url.trim_end_matches('/').to_string()
        RETURN self

    FUNCTION simulation(mode: SimulationMode) -> Self:
        self.config.simulation_mode = mode
        RETURN self

    FUNCTION build() -> GitLabConfig:
        RETURN self.config
}
```

---

## 3. Client Structure

```
STRUCT GitLabClient {
    config: Arc<GitLabConfig>,
    auth: Arc<dyn TokenProvider>,
    http_client: Arc<HttpClient>,
    rate_limiter: Arc<RateLimiter>,
    simulation: Arc<SimulationLayer>,
    metrics: Arc<MetricsCollector>
}

FUNCTION GitLabClient.new(
    config: GitLabConfig,
    auth: Arc<dyn TokenProvider>
) -> Result<Self>:

    http_client = HttpClient::builder()
        .timeout(config.timeout)
        .pool_max_idle_per_host(10)
        .build()?

    rate_limiter = RateLimiter::new(config.rate_limit)
    simulation = SimulationLayer::new(config.simulation_mode)
    metrics = MetricsCollector::new("gitlab")

    RETURN Ok(Self {
        config: Arc::new(config),
        auth,
        http_client: Arc::new(http_client),
        rate_limiter: Arc::new(rate_limiter),
        simulation: Arc::new(simulation),
        metrics: Arc::new(metrics)
    })

FUNCTION GitLabClient.api_url(endpoint: String) -> String:
    RETURN format!("{}/api/{}{}",
        self.config.base_url,
        self.config.api_version,
        endpoint
    )

FUNCTION GitLabClient.request<T>(
    method: Method,
    endpoint: String,
    body: Option<Value>
) -> Result<T>:

    // Check simulation replay
    IF self.simulation.is_replay():
        cache_key = self.simulation.cache_key(method, endpoint, body)
        IF cached = self.simulation.get(cache_key):
            RETURN deserialize(cached)

    // Acquire rate limit permit
    self.rate_limiter.acquire().await

    // Build request
    token = self.auth.get_token().await?
    url = self.api_url(endpoint)

    request = self.http_client
        .request(method, url)
        .header("PRIVATE-TOKEN", token.expose())
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

FUNCTION GitLabClient.execute_with_retry(request: Request) -> Result<Response>:
    retries = 0

    LOOP:
        start = Instant::now()
        result = request.clone().send().await

        self.metrics.record_request(start.elapsed())

        MATCH result:
            Ok(response):
                // Update rate limit from headers
                self.update_rate_limit_from_headers(response.headers())

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

                RETURN Err(GitLabError::from_response(response))

            Err(e):
                IF retries < self.config.max_retries:
                    retries += 1
                    delay = exponential_backoff(retries)
                    sleep(delay).await
                    CONTINUE
                RETURN Err(GitLabError::Network(e))

FUNCTION GitLabClient.update_rate_limit_from_headers(headers: Headers):
    IF limit = headers.get("RateLimit-Limit"):
        self.rate_limiter.update_limit(parse_int(limit))
    IF remaining = headers.get("RateLimit-Remaining"):
        self.rate_limiter.update_remaining(parse_int(remaining))
    IF reset = headers.get("RateLimit-Reset"):
        self.rate_limiter.update_reset(parse_timestamp(reset))
```

---

## 4. Repository Operations

### 4.1 File Operations

```
FUNCTION GitLabClient.get_file(
    project: ProjectRef,
    path: String,
    ref_: CommitRef
) -> Result<FileContent>:
    project_id = project.to_encoded_path()?
    file_path = url_encode(path)
    ref_param = ref_.to_string()

    endpoint = format!("/projects/{}/repository/files/{}?ref={}",
        project_id, file_path, ref_param)

    response = self.request(GET, endpoint, None).await?

    RETURN FileContent {
        file_name: response["file_name"].as_str(),
        file_path: response["file_path"].as_str(),
        size: response["size"].as_u64(),
        encoding: response["encoding"].as_str(),
        content: decode_content(response["content"].as_str(), response["encoding"]),
        ref_: response["ref"].as_str(),
        blob_id: response["blob_id"].as_str(),
        commit_id: response["commit_id"].as_str()
    }

FUNCTION GitLabClient.get_file_raw(
    project: ProjectRef,
    path: String,
    ref_: CommitRef
) -> Result<Bytes>:
    project_id = project.to_encoded_path()?
    file_path = url_encode(path)
    ref_param = ref_.to_string()

    endpoint = format!("/projects/{}/repository/files/{}/raw?ref={}",
        project_id, file_path, ref_param)

    // Returns raw bytes, not JSON
    RETURN self.request_raw(GET, endpoint).await

FUNCTION GitLabClient.create_or_update_file(
    project: ProjectRef,
    path: String,
    request: CreateFileRequest
) -> Result<FileCommit>:
    project_id = project.to_encoded_path()?
    file_path = url_encode(path)

    endpoint = format!("/projects/{}/repository/files/{}", project_id, file_path)

    body = {
        "branch": request.branch,
        "commit_message": request.commit_message,
        "content": base64_encode(request.content),
        "encoding": "base64"
    }

    IF request.author_email IS Some(email):
        body["author_email"] = email
    IF request.author_name IS Some(name):
        body["author_name"] = name
    IF request.start_branch IS Some(branch):
        body["start_branch"] = branch

    // Use PUT for update, POST for create
    method = IF request.is_update THEN PUT ELSE POST
    response = self.request(method, endpoint, Some(body)).await?

    RETURN FileCommit::from_response(response)

FUNCTION GitLabClient.delete_file(
    project: ProjectRef,
    path: String,
    branch: String,
    commit_message: String
) -> Result<()>:
    project_id = project.to_encoded_path()?
    file_path = url_encode(path)

    endpoint = format!("/projects/{}/repository/files/{}", project_id, file_path)

    body = {
        "branch": branch,
        "commit_message": commit_message
    }

    self.request(DELETE, endpoint, Some(body)).await?
    RETURN Ok(())
```

### 4.2 Branch Operations

```
FUNCTION GitLabClient.list_branches(
    project: ProjectRef,
    search: Option<String>,
    page: Option<u32>
) -> Result<PaginatedResults<Branch>>:
    project_id = project.to_encoded_path()?

    query = build_query_params([
        ("search", search),
        ("page", page.map(|p| p.to_string())),
        ("per_page", Some("100"))
    ])

    endpoint = format!("/projects/{}/repository/branches?{}", project_id, query)

    response = self.request_with_pagination(GET, endpoint).await?
    RETURN response

FUNCTION GitLabClient.create_branch(
    project: ProjectRef,
    branch: String,
    ref_: CommitRef
) -> Result<Branch>:
    project_id = project.to_encoded_path()?

    endpoint = format!("/projects/{}/repository/branches", project_id)

    body = {
        "branch": branch,
        "ref": ref_.to_string()
    }

    response = self.request(POST, endpoint, Some(body)).await?
    RETURN Branch::from_response(response)

FUNCTION GitLabClient.delete_branch(
    project: ProjectRef,
    branch: String
) -> Result<()>:
    project_id = project.to_encoded_path()?
    branch_encoded = url_encode(branch)

    endpoint = format!("/projects/{}/repository/branches/{}",
        project_id, branch_encoded)

    self.request(DELETE, endpoint, None).await?
    RETURN Ok(())
```

### 4.3 Commit Operations

```
FUNCTION GitLabClient.get_commit(
    project: ProjectRef,
    sha: String
) -> Result<Commit>:
    project_id = project.to_encoded_path()?

    endpoint = format!("/projects/{}/repository/commits/{}", project_id, sha)

    response = self.request(GET, endpoint, None).await?
    RETURN Commit::from_response(response)

FUNCTION GitLabClient.list_commits(
    project: ProjectRef,
    query: CommitQuery
) -> Result<PaginatedResults<Commit>>:
    project_id = project.to_encoded_path()?

    params = build_query_params([
        ("ref_name", query.ref_name),
        ("since", query.since.map(|d| d.to_rfc3339())),
        ("until", query.until.map(|d| d.to_rfc3339())),
        ("path", query.path),
        ("page", query.page.map(|p| p.to_string())),
        ("per_page", Some("100"))
    ])

    endpoint = format!("/projects/{}/repository/commits?{}", project_id, params)

    RETURN self.request_with_pagination(GET, endpoint).await

FUNCTION GitLabClient.compare(
    project: ProjectRef,
    from: CommitRef,
    to: CommitRef
) -> Result<CompareResult>:
    project_id = project.to_encoded_path()?

    endpoint = format!("/projects/{}/repository/compare?from={}&to={}",
        project_id, from.to_string(), to.to_string())

    response = self.request(GET, endpoint, None).await?
    RETURN CompareResult::from_response(response)
```

---

## 5. Merge Request Operations

### 5.1 CRUD Operations

```
FUNCTION GitLabClient.create_merge_request(
    project: ProjectRef,
    request: CreateMergeRequest
) -> Result<MergeRequest>:
    project_id = project.to_encoded_path()?

    endpoint = format!("/projects/{}/merge_requests", project_id)

    body = {
        "source_branch": request.source_branch,
        "target_branch": request.target_branch,
        "title": request.title
    }

    IF request.description IS Some(desc):
        body["description"] = desc
    IF request.assignee_id IS Some(id):
        body["assignee_id"] = id
    IF request.reviewer_ids IS Some(ids):
        body["reviewer_ids"] = ids
    IF request.labels IS Some(labels):
        body["labels"] = labels.join(",")
    IF request.draft IS Some(draft):
        body["draft"] = draft
    IF request.squash IS Some(squash):
        body["squash"] = squash
    IF request.remove_source_branch IS Some(remove):
        body["remove_source_branch"] = remove

    response = self.request(POST, endpoint, Some(body)).await?
    RETURN MergeRequest::from_response(response)

FUNCTION GitLabClient.get_merge_request(
    mr_ref: MergeRequestRef
) -> Result<MergeRequest>:
    project_id = mr_ref.project.to_encoded_path()?

    endpoint = format!("/projects/{}/merge_requests/{}", project_id, mr_ref.iid)

    response = self.request(GET, endpoint, None).await?
    RETURN MergeRequest::from_response(response)

FUNCTION GitLabClient.update_merge_request(
    mr_ref: MergeRequestRef,
    request: UpdateMergeRequest
) -> Result<MergeRequest>:
    project_id = mr_ref.project.to_encoded_path()?

    endpoint = format!("/projects/{}/merge_requests/{}", project_id, mr_ref.iid)

    body = {}
    IF request.title IS Some(title):
        body["title"] = title
    IF request.description IS Some(desc):
        body["description"] = desc
    IF request.state_event IS Some(event):
        body["state_event"] = event  // "close" or "reopen"
    IF request.target_branch IS Some(branch):
        body["target_branch"] = branch
    IF request.labels IS Some(labels):
        body["labels"] = labels.join(",")

    response = self.request(PUT, endpoint, Some(body)).await?
    RETURN MergeRequest::from_response(response)

FUNCTION GitLabClient.list_merge_requests(
    project: ProjectRef,
    query: MergeRequestQuery
) -> Result<PaginatedResults<MergeRequest>>:
    project_id = project.to_encoded_path()?

    params = build_query_params([
        ("state", query.state.map(|s| s.to_string())),
        ("scope", query.scope),
        ("author_id", query.author_id.map(|id| id.to_string())),
        ("assignee_id", query.assignee_id.map(|id| id.to_string())),
        ("source_branch", query.source_branch),
        ("target_branch", query.target_branch),
        ("search", query.search),
        ("order_by", query.order_by),
        ("sort", query.sort),
        ("page", query.page.map(|p| p.to_string())),
        ("per_page", Some("100"))
    ])

    endpoint = format!("/projects/{}/merge_requests?{}", project_id, params)

    RETURN self.request_with_pagination(GET, endpoint).await
```

### 5.2 Merge Operations

```
FUNCTION GitLabClient.merge_merge_request(
    mr_ref: MergeRequestRef,
    options: MergeOptions
) -> Result<MergeRequest>:
    project_id = mr_ref.project.to_encoded_path()?

    endpoint = format!("/projects/{}/merge_requests/{}/merge",
        project_id, mr_ref.iid)

    body = {}
    IF options.merge_commit_message IS Some(msg):
        body["merge_commit_message"] = msg
    IF options.squash_commit_message IS Some(msg):
        body["squash_commit_message"] = msg
    IF options.squash IS Some(squash):
        body["squash"] = squash
    IF options.should_remove_source_branch IS Some(remove):
        body["should_remove_source_branch"] = remove
    IF options.merge_when_pipeline_succeeds IS Some(when):
        body["merge_when_pipeline_succeeds"] = when
    IF options.sha IS Some(sha):
        body["sha"] = sha  // Ensure MR hasn't changed

    response = self.request(PUT, endpoint, Some(body)).await?
    RETURN MergeRequest::from_response(response)

FUNCTION GitLabClient.approve_merge_request(
    mr_ref: MergeRequestRef,
    sha: Option<String>
) -> Result<MergeRequestApproval>:
    project_id = mr_ref.project.to_encoded_path()?

    endpoint = format!("/projects/{}/merge_requests/{}/approve",
        project_id, mr_ref.iid)

    body = {}
    IF sha IS Some(s):
        body["sha"] = s

    response = self.request(POST, endpoint, Some(body)).await?
    RETURN MergeRequestApproval::from_response(response)

FUNCTION GitLabClient.unapprove_merge_request(
    mr_ref: MergeRequestRef
) -> Result<()>:
    project_id = mr_ref.project.to_encoded_path()?

    endpoint = format!("/projects/{}/merge_requests/{}/unapprove",
        project_id, mr_ref.iid)

    self.request(POST, endpoint, None).await?
    RETURN Ok(())
```

### 5.3 MR Comments

```
FUNCTION GitLabClient.add_mr_note(
    mr_ref: MergeRequestRef,
    body: String
) -> Result<Note>:
    project_id = mr_ref.project.to_encoded_path()?

    endpoint = format!("/projects/{}/merge_requests/{}/notes",
        project_id, mr_ref.iid)

    request_body = { "body": body }

    response = self.request(POST, endpoint, Some(request_body)).await?
    RETURN Note::from_response(response)

FUNCTION GitLabClient.list_mr_notes(
    mr_ref: MergeRequestRef,
    page: Option<u32>
) -> Result<PaginatedResults<Note>>:
    project_id = mr_ref.project.to_encoded_path()?

    params = build_query_params([
        ("page", page.map(|p| p.to_string())),
        ("per_page", Some("100")),
        ("sort", Some("asc"))
    ])

    endpoint = format!("/projects/{}/merge_requests/{}/notes?{}",
        project_id, mr_ref.iid, params)

    RETURN self.request_with_pagination(GET, endpoint).await
```

---

## 6. Pipeline Operations

```
FUNCTION GitLabClient.list_pipelines(
    project: ProjectRef,
    query: PipelineQuery
) -> Result<PaginatedResults<Pipeline>>:
    project_id = project.to_encoded_path()?

    params = build_query_params([
        ("status", query.status.map(|s| s.to_string())),
        ("ref", query.ref_),
        ("sha", query.sha),
        ("username", query.username),
        ("order_by", query.order_by),
        ("sort", query.sort),
        ("page", query.page.map(|p| p.to_string())),
        ("per_page", Some("100"))
    ])

    endpoint = format!("/projects/{}/pipelines?{}", project_id, params)

    RETURN self.request_with_pagination(GET, endpoint).await

FUNCTION GitLabClient.get_pipeline(
    pipeline_ref: PipelineRef
) -> Result<Pipeline>:
    project_id = pipeline_ref.project.to_encoded_path()?

    endpoint = format!("/projects/{}/pipelines/{}",
        project_id, pipeline_ref.id)

    response = self.request(GET, endpoint, None).await?
    RETURN Pipeline::from_response(response)

FUNCTION GitLabClient.create_pipeline(
    project: ProjectRef,
    ref_: String,
    variables: Option<Vec<PipelineVariable>>
) -> Result<Pipeline>:
    project_id = project.to_encoded_path()?

    endpoint = format!("/projects/{}/pipeline", project_id)

    body = { "ref": ref_ }

    IF variables IS Some(vars):
        body["variables"] = vars.iter().map(|v| {
            { "key": v.key, "value": v.value, "variable_type": v.variable_type }
        }).collect()

    response = self.request(POST, endpoint, Some(body)).await?
    RETURN Pipeline::from_response(response)

FUNCTION GitLabClient.cancel_pipeline(
    pipeline_ref: PipelineRef
) -> Result<Pipeline>:
    project_id = pipeline_ref.project.to_encoded_path()?

    endpoint = format!("/projects/{}/pipelines/{}/cancel",
        project_id, pipeline_ref.id)

    response = self.request(POST, endpoint, None).await?
    RETURN Pipeline::from_response(response)

FUNCTION GitLabClient.retry_pipeline(
    pipeline_ref: PipelineRef
) -> Result<Pipeline>:
    project_id = pipeline_ref.project.to_encoded_path()?

    endpoint = format!("/projects/{}/pipelines/{}/retry",
        project_id, pipeline_ref.id)

    response = self.request(POST, endpoint, None).await?
    RETURN Pipeline::from_response(response)

FUNCTION GitLabClient.get_pipeline_jobs(
    pipeline_ref: PipelineRef,
    scope: Option<Vec<JobStatus>>
) -> Result<PaginatedResults<Job>>:
    project_id = pipeline_ref.project.to_encoded_path()?

    params = build_query_params([
        ("scope[]", scope.map(|s| s.iter().map(|st| st.to_string()).collect())),
        ("per_page", Some("100"))
    ])

    endpoint = format!("/projects/{}/pipelines/{}/jobs?{}",
        project_id, pipeline_ref.id, params)

    RETURN self.request_with_pagination(GET, endpoint).await
```

---

## 7. Job Operations

```
FUNCTION GitLabClient.get_job(
    job_ref: JobRef
) -> Result<Job>:
    project_id = job_ref.project.to_encoded_path()?

    endpoint = format!("/projects/{}/jobs/{}", project_id, job_ref.id)

    response = self.request(GET, endpoint, None).await?
    RETURN Job::from_response(response)

FUNCTION GitLabClient.get_job_log(
    job_ref: JobRef
) -> Result<String>:
    project_id = job_ref.project.to_encoded_path()?

    endpoint = format!("/projects/{}/jobs/{}/trace", project_id, job_ref.id)

    // Use longer timeout for log retrieval
    response = self.request_with_timeout(GET, endpoint, None,
        self.config.log_timeout).await?

    RETURN response.text()

FUNCTION GitLabClient.stream_job_log(
    job_ref: JobRef
) -> impl Stream<Item = Result<String>>:
    project_id = job_ref.project.to_encoded_path()?
    offset = 0

    async_stream::stream! {
        LOOP:
            endpoint = format!("/projects/{}/jobs/{}/trace?offset={}",
                project_id, job_ref.id, offset)

            response = self.request_raw(GET, endpoint).await?

            // Check X-Gitlab-Trace-Size header
            size = response.headers()
                .get("X-Gitlab-Trace-Size")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<usize>().ok())
                .unwrap_or(0)

            IF size > offset:
                content = response.text().await?
                offset = size
                yield Ok(content)

            // Check if job is complete
            job = self.get_job(job_ref).await?
            IF job.status.is_finished():
                BREAK

            sleep(Duration::from_secs(2)).await
    }

FUNCTION GitLabClient.retry_job(
    job_ref: JobRef
) -> Result<Job>:
    project_id = job_ref.project.to_encoded_path()?

    endpoint = format!("/projects/{}/jobs/{}/retry", project_id, job_ref.id)

    response = self.request(POST, endpoint, None).await?
    RETURN Job::from_response(response)

FUNCTION GitLabClient.cancel_job(
    job_ref: JobRef
) -> Result<Job>:
    project_id = job_ref.project.to_encoded_path()?

    endpoint = format!("/projects/{}/jobs/{}/cancel", project_id, job_ref.id)

    response = self.request(POST, endpoint, None).await?
    RETURN Job::from_response(response)

FUNCTION GitLabClient.play_job(
    job_ref: JobRef,
    variables: Option<Vec<JobVariable>>
) -> Result<Job>:
    project_id = job_ref.project.to_encoded_path()?

    endpoint = format!("/projects/{}/jobs/{}/play", project_id, job_ref.id)

    body = {}
    IF variables IS Some(vars):
        body["job_variables_attributes"] = vars

    response = self.request(POST, endpoint, Some(body)).await?
    RETURN Job::from_response(response)

FUNCTION GitLabClient.download_artifacts(
    job_ref: JobRef
) -> Result<Bytes>:
    project_id = job_ref.project.to_encoded_path()?

    endpoint = format!("/projects/{}/jobs/{}/artifacts", project_id, job_ref.id)

    RETURN self.request_raw(GET, endpoint).await
```

---

## 8. Webhook Handling

```
STRUCT WebhookHandler {
    secret_token: Option<SecretString>
}

FUNCTION WebhookHandler.new(secret_token: Option<SecretString>) -> Self:
    RETURN Self { secret_token }

FUNCTION WebhookHandler.validate(
    headers: Headers,
    body: Bytes
) -> Result<()>:
    IF self.secret_token IS Some(expected):
        received = headers.get("X-Gitlab-Token")
            .ok_or(GitLabError::WebhookValidationFailed)?

        IF NOT constant_time_compare(expected.expose(), received):
            RETURN Err(GitLabError::WebhookValidationFailed)

    RETURN Ok(())

FUNCTION WebhookHandler.parse(
    headers: Headers,
    body: Bytes
) -> Result<WebhookEvent>:
    self.validate(headers, body)?

    event_type = headers.get("X-Gitlab-Event")
        .ok_or(GitLabError::InvalidWebhookEvent)?

    payload: Value = serde_json::from_slice(body)?

    MATCH event_type:
        "Push Hook" -> RETURN parse_push_event(payload)
        "Merge Request Hook" -> RETURN parse_mr_event(payload)
        "Pipeline Hook" -> RETURN parse_pipeline_event(payload)
        "Job Hook" -> RETURN parse_job_event(payload)
        "Issue Hook" -> RETURN parse_issue_event(payload)
        "Note Hook" -> RETURN parse_note_event(payload)
        "Tag Push Hook" -> RETURN parse_tag_push_event(payload)
        _ -> RETURN Err(GitLabError::UnknownWebhookEvent(event_type))

FUNCTION parse_push_event(payload: Value) -> Result<WebhookEvent>:
    RETURN Ok(WebhookEvent::Push {
        ref_: payload["ref"].as_str().unwrap().to_string(),
        before: payload["before"].as_str().unwrap().to_string(),
        after: payload["after"].as_str().unwrap().to_string(),
        commits: payload["commits"].as_array()
            .map(|arr| arr.iter().map(Commit::from_json).collect())
            .unwrap_or_default(),
        project: Project::from_json(&payload["project"]),
        user: User::from_json(&payload["user_username"], &payload["user_email"])
    })

FUNCTION parse_mr_event(payload: Value) -> Result<WebhookEvent>:
    action = payload["object_attributes"]["action"].as_str()
        .map(MergeRequestAction::from_str)
        .transpose()?

    RETURN Ok(WebhookEvent::MergeRequest {
        action,
        merge_request: MergeRequest::from_json(&payload["object_attributes"]),
        project: Project::from_json(&payload["project"]),
        user: User::from_json_full(&payload["user"])
    })

FUNCTION parse_pipeline_event(payload: Value) -> Result<WebhookEvent>:
    RETURN Ok(WebhookEvent::Pipeline {
        status: PipelineStatus::from_str(
            payload["object_attributes"]["status"].as_str().unwrap()
        )?,
        pipeline: Pipeline::from_json(&payload["object_attributes"]),
        project: Project::from_json(&payload["project"]),
        builds: payload["builds"].as_array()
            .map(|arr| arr.iter().map(Job::from_json).collect())
            .unwrap_or_default()
    })

FUNCTION parse_job_event(payload: Value) -> Result<WebhookEvent>:
    RETURN Ok(WebhookEvent::Job {
        status: JobStatus::from_str(payload["build_status"].as_str().unwrap())?,
        job: Job::from_webhook_json(&payload),
        project: Project::from_json(&payload["project"])
    })
```

---

## 9. Rate Limiting

```
STRUCT RateLimiter {
    permits: Arc<Semaphore>,
    limit: Arc<AtomicU32>,
    remaining: Arc<AtomicU32>,
    reset_at: Arc<AtomicU64>,
    min_interval: Duration
}

FUNCTION RateLimiter.new(config: RateLimitConfig) -> Self:
    min_interval = Duration::from_secs(60) / config.requests_per_minute

    RETURN Self {
        permits: Arc::new(Semaphore::new(config.burst_size as usize)),
        limit: Arc::new(AtomicU32::new(config.requests_per_minute)),
        remaining: Arc::new(AtomicU32::new(config.requests_per_minute)),
        reset_at: Arc::new(AtomicU64::new(0)),
        min_interval
    }

FUNCTION RateLimiter.acquire():
    // Check if we need to wait for reset
    remaining = self.remaining.load(Ordering::Relaxed)
    IF remaining == 0:
        reset = self.reset_at.load(Ordering::Relaxed)
        now = current_timestamp()
        IF now < reset:
            sleep(Duration::from_secs(reset - now)).await

    // Acquire permit
    permit = self.permits.acquire().await

    // Decrement remaining
    self.remaining.fetch_sub(1, Ordering::Relaxed)

    // Release permit after interval
    spawn(async move {
        sleep(self.min_interval).await
        drop(permit)
    })

FUNCTION RateLimiter.update_limit(limit: u32):
    self.limit.store(limit, Ordering::Relaxed)

FUNCTION RateLimiter.update_remaining(remaining: u32):
    self.remaining.store(remaining, Ordering::Relaxed)

FUNCTION RateLimiter.update_reset(reset: u64):
    self.reset_at.store(reset, Ordering::Relaxed)
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
        // Sort keys for determinism
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
ENUM GitLabError {
    // API Errors
    BadRequest { message: String },
    Unauthorized { message: String },
    Forbidden { message: String },
    NotFound { resource: String, id: String },
    Conflict { message: String },
    RateLimited { retry_after: Duration },
    InternalError { message: String },
    ServiceUnavailable,

    // Client Errors
    InvalidProjectRef { input: String },
    InvalidUrl { input: String },
    SerializationError { source: serde_json::Error },
    Network { source: reqwest::Error },
    Timeout,

    // Webhook Errors
    WebhookValidationFailed,
    InvalidWebhookEvent,
    UnknownWebhookEvent { event_type: String },

    // Simulation Errors
    SimulationMiss { key: String },
    SimulationCorrupted { path: PathBuf }
}

FUNCTION GitLabError.from_response(response: Response) -> Self:
    status = response.status()
    body = response.json().await.unwrap_or_default()
    message = body["message"].as_str()
        .or(body["error"].as_str())
        .unwrap_or("Unknown error")
        .to_string()

    MATCH status.as_u16():
        400 -> BadRequest { message }
        401 -> Unauthorized { message }
        403 -> Forbidden { message }
        404 -> NotFound {
            resource: body["resource"].as_str().unwrap_or("unknown").to_string(),
            id: "".to_string()
        }
        409 -> Conflict { message }
        429 -> RateLimited {
            retry_after: parse_retry_after(response.headers())
        }
        500 -> InternalError { message }
        503 -> ServiceUnavailable
        _ -> InternalError { message }

FUNCTION GitLabError.is_retryable() -> bool:
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
| Document ID | SPARC-GITLAB-PSEUDO-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Pseudocode Document**

*Proceed to Architecture phase upon approval.*
