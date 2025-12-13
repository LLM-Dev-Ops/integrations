# Buildkite Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/buildkite`

---

## 1. Client Initialization

```
FUNCTION create_buildkite_client(config: BuildkiteConfig) -> BuildkiteClient:
    // Validate configuration
    VALIDATE config.organization_slug IS NOT empty
    VALIDATE config.auth IS valid

    // Build base URL
    base_url = config.api_base_url OR "https://api.buildkite.com/v2"

    // Initialize HTTP client with resilience
    http_client = shared/resilience.create_http_client(
        base_url: base_url,
        timeout_ms: config.request_timeout_ms,
        retry_policy: RetryPolicy(
            max_attempts: config.max_retries,
            retryable_status: [429, 500, 502, 503, 504]
        )
    )

    // Initialize rate limiter (200 req/min = ~3.3 req/sec)
    rate_limiter = shared/resilience.create_rate_limiter(
        requests_per_second: config.requests_per_second OR 3.0
    )

    // Initialize circuit breaker
    circuit_breaker = shared/resilience.create_circuit_breaker(
        failure_threshold: 5,
        reset_timeout_ms: 30000
    )

    // Initialize auth provider
    auth_provider = buildkite/auth.create_provider(config.auth)

    RETURN BuildkiteClient(
        http_client: http_client,
        rate_limiter: rate_limiter,
        circuit_breaker: circuit_breaker,
        auth_provider: auth_provider,
        org_slug: config.organization_slug,
        config: config
    )
```

---

## 2. Pipeline Operations

### 2.1 List Pipelines

```
FUNCTION list_pipelines(
    client: BuildkiteClient,
    options: PaginationOptions
) -> PipelineList:
    params = QueryParams()
    params.add("per_page", options.per_page OR 30)
    params.add("page", options.page OR 1)

    response = CALL execute_request(
        client,
        "GET",
        FORMAT("/organizations/{}/pipelines", client.org_slug),
        params
    )

    pipelines = []
    FOR item IN response:
        pipelines.APPEND(parse_pipeline(item))

    // Extract pagination from Link header
    pagination = parse_link_header(response.headers.get("Link"))

    RETURN PipelineList(
        pipelines: pipelines,
        next_page: pagination.next,
        total_count: response.headers.get("X-Total-Count")
    )
```

### 2.2 Get Pipeline

```
FUNCTION get_pipeline(client: BuildkiteClient, pipeline_slug: String) -> Pipeline:
    path = FORMAT("/organizations/{}/pipelines/{}",
        client.org_slug, pipeline_slug)

    response = CALL execute_request(client, "GET", path, QueryParams())

    RETURN parse_pipeline(response)
```

---

## 3. Build Operations

### 3.1 Create Build

```
FUNCTION create_build(
    client: BuildkiteClient,
    pipeline_slug: String,
    request: CreateBuildRequest
) -> Build:
    // Validate request
    VALIDATE request.commit IS NOT empty
    VALIDATE request.branch IS NOT empty

    path = FORMAT("/organizations/{}/pipelines/{}/builds",
        client.org_slug, pipeline_slug)

    body = {
        "commit": request.commit,
        "branch": request.branch
    }

    // Add optional fields
    IF request.message IS NOT null:
        body["message"] = request.message

    IF request.author IS NOT null:
        body["author"] = {
            "name": request.author.name,
            "email": request.author.email
        }

    IF request.env IS NOT null AND request.env.length > 0:
        body["env"] = request.env

    IF request.meta_data IS NOT null AND request.meta_data.length > 0:
        body["meta_data"] = request.meta_data

    IF request.ignore_pipeline_branch_filters:
        body["ignore_pipeline_branch_filters"] = true

    IF request.clean_checkout:
        body["clean_checkout"] = true

    response = CALL execute_request(client, "POST", path, QueryParams(), body)

    build = parse_build(response)

    shared/observability.emit_counter("buildkite.builds.created", 1, {
        pipeline: pipeline_slug,
        branch: request.branch
    })

    RETURN build
```

### 3.2 List Builds

```
FUNCTION list_builds(
    client: BuildkiteClient,
    options: ListBuildsOptions
) -> BuildList:
    // Determine path based on scope
    path = IF options.pipeline_slug IS NOT null:
        FORMAT("/organizations/{}/pipelines/{}/builds",
            client.org_slug, options.pipeline_slug)
    ELSE:
        FORMAT("/organizations/{}/builds", client.org_slug)

    params = QueryParams()
    params.add("per_page", options.per_page OR 30)
    params.add("page", options.page OR 1)

    // Add filters
    params.add_optional("branch", options.branch)
    params.add_optional("commit", options.commit)
    params.add_optional("state", options.state)
    params.add_optional("creator", options.creator)
    params.add_optional("created_from", options.created_from)
    params.add_optional("created_to", options.created_to)
    params.add_optional("finished_from", options.finished_from)

    // Include metadata filters
    FOR key, value IN options.meta_data_filters:
        params.add(FORMAT("meta_data[{}]", key), value)

    response = CALL execute_request(client, "GET", path, params)

    builds = []
    FOR item IN response:
        builds.APPEND(parse_build(item))

    RETURN BuildList(
        builds: builds,
        next_page: parse_link_header(response.headers).next
    )
```

### 3.3 Get Build

```
FUNCTION get_build(
    client: BuildkiteClient,
    pipeline_slug: String,
    build_number: i32
) -> Build:
    path = FORMAT("/organizations/{}/pipelines/{}/builds/{}",
        client.org_slug, pipeline_slug, build_number)

    response = CALL execute_request(client, "GET", path, QueryParams())

    RETURN parse_build(response)
```

### 3.4 Cancel Build

```
FUNCTION cancel_build(
    client: BuildkiteClient,
    pipeline_slug: String,
    build_number: i32
) -> Build:
    path = FORMAT("/organizations/{}/pipelines/{}/builds/{}/cancel",
        client.org_slug, pipeline_slug, build_number)

    TRY:
        response = CALL execute_request(client, "PUT", path, QueryParams())
        build = parse_build(response)

        shared/observability.emit_counter("buildkite.builds.cancelled", 1)

        RETURN build
    CATCH error IF error.status == 422:
        // Build already finished
        LOG.info("Build {} already finished", build_number)
        RETURN CALL get_build(client, pipeline_slug, build_number)
```

### 3.5 Rebuild

```
FUNCTION rebuild(
    client: BuildkiteClient,
    pipeline_slug: String,
    build_number: i32
) -> Build:
    path = FORMAT("/organizations/{}/pipelines/{}/builds/{}/rebuild",
        client.org_slug, pipeline_slug, build_number)

    response = CALL execute_request(client, "PUT", path, QueryParams())

    new_build = parse_build(response)

    shared/observability.emit_counter("buildkite.builds.rebuilt", 1)

    RETURN new_build
```

### 3.6 Wait for Build Completion

```
FUNCTION wait_for_completion(
    client: BuildkiteClient,
    pipeline_slug: String,
    build_number: i32,
    options: WaitOptions
) -> Build:
    timeout_at = now() + options.timeout OR Duration::minutes(60)
    poll_interval = options.poll_interval OR Duration::seconds(10)

    WHILE now() < timeout_at:
        build = CALL get_build(client, pipeline_slug, build_number)

        IF is_terminal_state(build.state):
            RETURN build

        // Check if blocked and auto-unblock not enabled
        IF build.state == "blocked" AND NOT options.auto_unblock:
            RETURN build

        shared/observability.emit_gauge("buildkite.build.progress", {
            build_number: build_number,
            state: build.state
        })

        SLEEP(poll_interval)

    THROW Timeout("Build did not complete in time")

FUNCTION is_terminal_state(state: BuildState) -> bool:
    RETURN state IN [Passed, Failed, Canceled, Skipped, NotRun]
```

---

## 4. Job Operations

### 4.1 List Jobs

```
FUNCTION list_jobs(
    client: BuildkiteClient,
    pipeline_slug: String,
    build_number: i32
) -> Vec<Job>:
    // Jobs are embedded in build response
    build = CALL get_build(client, pipeline_slug, build_number)

    RETURN build.jobs
```

### 4.2 Get Job

```
FUNCTION get_job(
    client: BuildkiteClient,
    pipeline_slug: String,
    build_number: i32,
    job_id: String
) -> Job:
    path = FORMAT("/organizations/{}/pipelines/{}/builds/{}/jobs/{}",
        client.org_slug, pipeline_slug, build_number, job_id)

    response = CALL execute_request(client, "GET", path, QueryParams())

    RETURN parse_job(response)
```

### 4.3 Retry Job

```
FUNCTION retry_job(
    client: BuildkiteClient,
    pipeline_slug: String,
    build_number: i32,
    job_id: String
) -> Job:
    path = FORMAT("/organizations/{}/pipelines/{}/builds/{}/jobs/{}/retry",
        client.org_slug, pipeline_slug, build_number, job_id)

    response = CALL execute_request(client, "PUT", path, QueryParams())

    shared/observability.emit_counter("buildkite.jobs.retried", 1)

    RETURN parse_job(response)
```

### 4.4 Unblock Job

```
FUNCTION unblock_job(
    client: BuildkiteClient,
    pipeline_slug: String,
    build_number: i32,
    job_id: String,
    request: UnblockRequest
) -> Job:
    path = FORMAT("/organizations/{}/pipelines/{}/builds/{}/jobs/{}/unblock",
        client.org_slug, pipeline_slug, build_number, job_id)

    body = {}
    IF request.unblocker IS NOT null:
        body["unblocker"] = {
            "id": request.unblocker.id,
            "name": request.unblocker.name,
            "email": request.unblocker.email
        }

    IF request.fields.length > 0:
        body["fields"] = request.fields

    response = CALL execute_request(client, "PUT", path, QueryParams(), body)

    shared/observability.emit_counter("buildkite.jobs.unblocked", 1)

    RETURN parse_job(response)
```

### 4.5 Get Job Log

```
FUNCTION get_job_log(
    client: BuildkiteClient,
    pipeline_slug: String,
    build_number: i32,
    job_id: String
) -> JobLog:
    path = FORMAT("/organizations/{}/pipelines/{}/builds/{}/jobs/{}/log",
        client.org_slug, pipeline_slug, build_number, job_id)

    response = CALL execute_request(
        client, "GET", path, QueryParams(),
        accept: "text/plain"
    )

    RETURN JobLog(
        content: response.body,
        size: response.headers.get("Content-Length"),
        header_times: parse_header_times(response.body)
    )
```

---

## 5. Artifact Operations

### 5.1 List Artifacts

```
FUNCTION list_artifacts(
    client: BuildkiteClient,
    pipeline_slug: String,
    build_number: i32,
    options: PaginationOptions
) -> ArtifactList:
    path = FORMAT("/organizations/{}/pipelines/{}/builds/{}/artifacts",
        client.org_slug, pipeline_slug, build_number)

    params = QueryParams()
    params.add("per_page", options.per_page OR 30)
    params.add("page", options.page OR 1)

    response = CALL execute_request(client, "GET", path, params)

    artifacts = []
    FOR item IN response:
        artifacts.APPEND(parse_artifact(item))

    RETURN ArtifactList(
        artifacts: artifacts,
        next_page: parse_link_header(response.headers).next
    )
```

### 5.2 Download Artifact

```
FUNCTION download_artifact(
    client: BuildkiteClient,
    pipeline_slug: String,
    build_number: i32,
    artifact_id: String
) -> ArtifactContent:
    // Get artifact metadata first
    artifact = CALL get_artifact(client, pipeline_slug, build_number, artifact_id)

    IF artifact.state != ArtifactState::Finished:
        THROW ArtifactNotFound("Artifact not ready: " + artifact.state)

    // Download from the download_url
    content = CALL execute_stream_request(client, "GET", artifact.download_url)

    shared/observability.emit_histogram("buildkite.artifacts.download_bytes",
        content.len(), { path: artifact.path })

    RETURN ArtifactContent(
        artifact: artifact,
        content: content
    )
```

### 5.3 List Job Artifacts

```
FUNCTION list_job_artifacts(
    client: BuildkiteClient,
    pipeline_slug: String,
    build_number: i32,
    job_id: String
) -> Vec<Artifact>:
    path = FORMAT("/organizations/{}/pipelines/{}/builds/{}/jobs/{}/artifacts",
        client.org_slug, pipeline_slug, build_number, job_id)

    response = CALL execute_request(client, "GET", path, QueryParams())

    artifacts = []
    FOR item IN response:
        artifacts.APPEND(parse_artifact(item))

    RETURN artifacts
```

---

## 6. Annotation Operations

### 6.1 List Annotations

```
FUNCTION list_annotations(
    client: BuildkiteClient,
    pipeline_slug: String,
    build_number: i32
) -> Vec<Annotation>:
    path = FORMAT("/organizations/{}/pipelines/{}/builds/{}/annotations",
        client.org_slug, pipeline_slug, build_number)

    response = CALL execute_request(client, "GET", path, QueryParams())

    annotations = []
    FOR item IN response:
        annotations.APPEND(parse_annotation(item))

    RETURN annotations
```

### 6.2 Create Annotation

```
FUNCTION create_annotation(
    client: BuildkiteClient,
    pipeline_slug: String,
    build_number: i32,
    request: CreateAnnotationRequest
) -> Annotation:
    path = FORMAT("/organizations/{}/pipelines/{}/builds/{}/annotations",
        client.org_slug, pipeline_slug, build_number)

    body = {
        "context": request.context,
        "style": request.style.to_string(),
        "body": request.body
    }

    IF request.append IS NOT null:
        body["append"] = request.append

    response = CALL execute_request(client, "POST", path, QueryParams(), body)

    RETURN parse_annotation(response)
```

---

## 7. Metadata Operations

### 7.1 Get Metadata

```
FUNCTION get_metadata(
    client: BuildkiteClient,
    pipeline_slug: String,
    build_number: i32,
    key: String
) -> String:
    path = FORMAT("/organizations/{}/pipelines/{}/builds/{}/meta_data/{}",
        client.org_slug, pipeline_slug, build_number, key)

    response = CALL execute_request(client, "GET", path, QueryParams())

    RETURN response.value
```

### 7.2 Set Metadata

```
FUNCTION set_metadata(
    client: BuildkiteClient,
    pipeline_slug: String,
    build_number: i32,
    key: String,
    value: String
) -> void:
    path = FORMAT("/organizations/{}/pipelines/{}/builds/{}/meta_data/{}",
        client.org_slug, pipeline_slug, build_number, key)

    body = {
        "value": value
    }

    CALL execute_request(client, "POST", path, QueryParams(), body)
```

### 7.3 List Metadata Keys

```
FUNCTION list_metadata_keys(
    client: BuildkiteClient,
    pipeline_slug: String,
    build_number: i32
) -> Vec<String>:
    path = FORMAT("/organizations/{}/pipelines/{}/builds/{}/meta_data",
        client.org_slug, pipeline_slug, build_number)

    response = CALL execute_request(client, "GET", path, QueryParams())

    RETURN response.keys
```

---

## 8. Cluster Operations

### 8.1 List Clusters

```
FUNCTION list_clusters(client: BuildkiteClient) -> Vec<Cluster>:
    path = FORMAT("/organizations/{}/clusters", client.org_slug)

    response = CALL execute_request(client, "GET", path, QueryParams())

    clusters = []
    FOR item IN response:
        clusters.APPEND(parse_cluster(item))

    RETURN clusters
```

### 8.2 List Queues

```
FUNCTION list_queues(
    client: BuildkiteClient,
    cluster_id: String
) -> Vec<Queue>:
    path = FORMAT("/organizations/{}/clusters/{}/queues",
        client.org_slug, cluster_id)

    response = CALL execute_request(client, "GET", path, QueryParams())

    queues = []
    FOR item IN response:
        queues.APPEND(parse_queue(item))

    RETURN queues
```

---

## 9. Agent Operations

### 9.1 List Agents

```
FUNCTION list_agents(
    client: BuildkiteClient,
    options: ListAgentsOptions
) -> AgentList:
    path = FORMAT("/organizations/{}/agents", client.org_slug)

    params = QueryParams()
    params.add("per_page", options.per_page OR 30)
    params.add("page", options.page OR 1)
    params.add_optional("name", options.name)
    params.add_optional("hostname", options.hostname)
    params.add_optional("version", options.version)

    response = CALL execute_request(client, "GET", path, params)

    agents = []
    FOR item IN response:
        agents.APPEND(parse_agent(item))

    RETURN AgentList(
        agents: agents,
        next_page: parse_link_header(response.headers).next
    )
```

### 9.2 Get Agent

```
FUNCTION get_agent(client: BuildkiteClient, agent_id: String) -> Agent:
    path = FORMAT("/organizations/{}/agents/{}", client.org_slug, agent_id)

    response = CALL execute_request(client, "GET", path, QueryParams())

    RETURN parse_agent(response)
```

---

## 10. Webhook Processing

### 10.1 Process Webhook Event

```
FUNCTION process_webhook_event(
    client: BuildkiteClient,
    payload: Bytes,
    token_header: String,
    expected_token: SecretString
) -> WebhookPayload:
    // Validate token
    IF NOT buildkite/auth.validate_webhook_token(token_header, expected_token):
        THROW InvalidWebhookSignature()

    // Parse payload
    event = parse_json(payload)

    // Determine event type from the event field
    event_type = parse_webhook_event_type(event.event)

    webhook_payload = WebhookPayload(
        event: event_type,
        build: parse_build_optional(event.build),
        job: parse_job_optional(event.job),
        agent: parse_agent_optional(event.agent),
        pipeline: parse_pipeline_ref(event.pipeline),
        sender: parse_creator(event.sender)
    )

    shared/observability.emit_counter("buildkite.webhooks.received", 1, {
        event_type: event_type.to_string()
    })

    RETURN webhook_payload
```

---

## 11. Log Streaming

### 11.1 Stream Build Logs

```
FUNCTION stream_build_logs(
    client: BuildkiteClient,
    pipeline_slug: String,
    build_number: i32,
    callback: Fn(LogChunk) -> void
) -> void:
    completed_jobs = Set()
    poll_interval = client.config.log_poll_interval_ms
    max_attempts = client.config.log_max_poll_attempts
    attempts = 0

    WHILE attempts < max_attempts:
        build = CALL get_build(client, pipeline_slug, build_number)

        FOR job IN build.jobs:
            IF job.type != JobType::Script:
                CONTINUE

            IF is_job_finished(job.state) AND job.id NOT IN completed_jobs:
                TRY:
                    log = CALL get_job_log(client, pipeline_slug, build_number, job.id)
                    callback(LogChunk(
                        job_id: job.id,
                        job_name: job.name OR job.label,
                        content: log.content,
                        is_complete: true
                    ))
                    completed_jobs.ADD(job.id)
                CATCH error:
                    LOG.warn("Failed to fetch log for job {}: {}", job.id, error)

        IF is_terminal_state(build.state):
            BREAK

        SLEEP(poll_interval)
        attempts += 1

FUNCTION is_job_finished(state: JobState) -> bool:
    RETURN state IN [Passed, Failed, Canceled, TimedOut, Skipped, Expired]
```

---

## 12. Request Execution

### 12.1 Execute Request

```
FUNCTION execute_request(
    client: BuildkiteClient,
    method: String,
    path: String,
    params: QueryParams,
    body: Option<Object>,
    accept: Option<String>
) -> Object:
    span = shared/observability.start_span("buildkite.request", {
        method: method,
        path: path
    })

    TRY:
        // Acquire rate limit token
        CALL client.rate_limiter.acquire()

        // Check circuit breaker
        IF client.circuit_breaker.is_open():
            THROW ServiceUnavailable("Circuit breaker open")

        // Get API token
        token = CALL client.auth_provider.get_api_token()

        // Build request
        url = client.base_url + path + params.to_query_string()
        headers = {
            "Authorization": FORMAT("Bearer {}", token.expose()),
            "Content-Type": "application/json",
            "Accept": accept OR "application/json"
        }

        // Execute with retry
        response = CALL client.http_client.request(
            method: method,
            url: url,
            headers: headers,
            body: body.map(b => serialize_json(b))
        )

        // Handle response
        IF response.status >= 200 AND response.status < 300:
            client.circuit_breaker.record_success()
            IF response.body.is_empty():
                RETURN {}
            IF accept == "text/plain":
                RETURN { body: response.body_text, headers: response.headers }
            RETURN parse_json(response.body)
        ELSE:
            error = map_http_error(response.status, response.body)
            IF is_server_error(response.status):
                client.circuit_breaker.record_failure()
            THROW error

    CATCH error:
        span.record_error(error)
        THROW

    FINALLY:
        span.end()
```

### 12.2 Error Mapping

```
FUNCTION map_http_error(status: i32, body: Bytes) -> BuildkiteError:
    error_response = TRY parse_json(body) CATCH {}
    message = error_response.message OR "Unknown error"

    MATCH status:
        CASE 401:
            RETURN Unauthorized(message)
        CASE 403:
            RETURN AccessDenied(message)
        CASE 404:
            IF message.contains("pipeline"):
                RETURN PipelineNotFound(message)
            IF message.contains("build"):
                RETURN BuildNotFound(message)
            IF message.contains("job"):
                RETURN JobNotFound(message)
            IF message.contains("artifact"):
                RETURN ArtifactNotFound(message)
            RETURN NotFound(message)
        CASE 422:
            IF message.contains("finished"):
                RETURN BuildAlreadyFinished(message)
            IF message.contains("block"):
                RETURN JobNotBlockable(message)
            RETURN InvalidBuildRequest(message)
        CASE 429:
            retry_after = error_response.retry_after OR 60
            RETURN RateLimited(retry_after)
        CASE 503:
            RETURN ServiceUnavailable(message)
        DEFAULT:
            RETURN BuildkiteError(status, message)
```

---

## 13. Simulation Support

### 13.1 Mock Client

```
FUNCTION create_mock_client(initial_state: MockState) -> MockBuildkiteClient:
    RETURN MockBuildkiteClient(
        pipelines: initial_state.pipelines OR {},
        builds: initial_state.builds OR {},
        jobs: initial_state.jobs OR {},
        artifacts: initial_state.artifacts OR {},
        operation_history: [],
        error_injections: {},
        build_progression: default_build_progression()
    )
```

### 13.2 Simulate Build Progression

```
FUNCTION simulate_build_progression(
    mock: MockBuildkiteClient,
    build_number: i32,
    job_configs: Vec<JobConfig>
) -> void:
    build = mock.builds.get(build_number)
    build.state = BuildState::Running
    build.started_at = now()

    FOR job_config IN job_configs:
        job = create_mock_job(build.id, job_config)
        mock.jobs.insert(job.id, job)

        // Handle block steps
        IF job_config.type == JobType::Block:
            job.state = JobState::Blocked
            build.state = BuildState::Blocked
            build.blocked = true
            CONTINUE

        // Simulate job execution
        job.state = JobState::Running
        job.started_at = now()

        SLEEP(job_config.duration_ms)

        job.state = job_config.expected_state
        job.finished_at = now()
        job.exit_status = IF job_config.expected_state == JobState::Passed THEN 0 ELSE 1

    // Determine build state from jobs
    build.state = determine_build_state(mock.jobs.values())
    build.finished_at = now()
```

### 13.3 Record and Replay

```
FUNCTION record_operation(mock: MockBuildkiteClient, op: Operation) -> void:
    mock.operation_history.APPEND(OperationRecord(
        operation: op,
        timestamp: now(),
        state_snapshot: snapshot_state(mock)
    ))

FUNCTION replay_build(
    mock: MockBuildkiteClient,
    recorded: BuildRecord
) -> ReplayResult:
    // Restore initial state
    mock.builds = recorded.initial_builds
    mock.jobs = recorded.initial_jobs

    // Execute create build
    result = CALL create_build(mock, recorded.pipeline, recorded.request)

    // Compare with recorded result
    matches = compare_builds(result, recorded.expected_build)

    RETURN ReplayResult(
        success: matches,
        actual: result,
        expected: recorded.expected_build
    )
```

---

## 14. Vector Memory Integration

### 14.1 Index Build

```
FUNCTION index_build(
    client: BuildkiteClient,
    pipeline_slug: String,
    build: Build
) -> void:
    // Build searchable content
    job_summaries = build.jobs.map(j => FORMAT("{}: {}",
        j.name OR j.label, j.state))

    content = FORMAT("""
        Pipeline: {}
        Build #{}: {}
        Branch: {}
        Commit: {}
        State: {}
        Jobs: {}
    """, pipeline_slug, build.number, build.message,
        build.branch, build.commit, build.state, join(job_summaries, ", "))

    metadata = {
        pipeline: pipeline_slug,
        build_number: build.number,
        branch: build.branch,
        commit: build.commit,
        state: build.state,
        source: build.source
    }

    CALL shared/vector-memory.store(
        namespace: "buildkite",
        id: FORMAT("build-{}-{}", pipeline_slug, build.number),
        content: content,
        metadata: metadata
    )
```

### 14.2 Search Similar Builds

```
FUNCTION search_similar_builds(
    client: BuildkiteClient,
    query: String,
    options: SearchOptions
) -> Vec<SimilarBuild>:
    results = CALL shared/vector-memory.search(
        namespace: "buildkite",
        query: query,
        limit: options.limit OR 10,
        filter: options.metadata_filter
    )

    similar_builds = []
    FOR result IN results:
        pipeline, build_number = parse_build_id(result.id)
        build = TRY CALL get_build(client, pipeline, build_number) CATCH null
        IF build IS NOT null:
            similar_builds.APPEND(SimilarBuild(
                build: build,
                similarity: result.score
            ))

    RETURN similar_builds
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-buildkite.md | Complete |
| 2. Pseudocode | pseudocode-buildkite.md | Complete |
| 3. Architecture | architecture-buildkite.md | Pending |
| 4. Refinement | refinement-buildkite.md | Pending |
| 5. Completion | completion-buildkite.md | Pending |

---

*Phase 2: Pseudocode - Complete*
