# GitHub Actions Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/github/actions`

---

## 1. Client Initialization

```
FUNCTION create_actions_client(config: GitHubActionsConfig) -> ActionsClient:
    // Validate configuration
    VALIDATE config.owner IS NOT empty
    VALIDATE config.repo IS NOT empty
    VALIDATE config.auth IS valid

    // Build base URL
    base_url = config.base_url OR "https://api.github.com"

    // Initialize HTTP client with resilience
    http_client = shared/resilience.create_http_client(
        base_url: base_url,
        timeout_ms: config.request_timeout_ms,
        retry_policy: RetryPolicy(
            max_attempts: config.max_retries,
            retryable_status: [429, 500, 502, 503, 504]
        )
    )

    // Initialize adaptive rate limiter (uses X-RateLimit headers)
    rate_limiter = shared/resilience.create_adaptive_rate_limiter(
        initial_rate: config.requests_per_second,
        header_remaining: "X-RateLimit-Remaining",
        header_reset: "X-RateLimit-Reset"
    )

    // Initialize circuit breaker
    circuit_breaker = shared/resilience.create_circuit_breaker(
        failure_threshold: 5,
        reset_timeout_ms: 30000
    )

    // Initialize auth provider
    auth_provider = github/auth.create_provider(config.auth)

    RETURN ActionsClient(
        http_client: http_client,
        rate_limiter: rate_limiter,
        circuit_breaker: circuit_breaker,
        auth_provider: auth_provider,
        owner: config.owner,
        repo: config.repo,
        config: config
    )
```

---

## 2. Workflow Operations

### 2.1 List Workflows

```
FUNCTION list_workflows(
    client: ActionsClient,
    options: PaginationOptions
) -> WorkflowList:
    params = QueryParams()
    params.add("per_page", options.per_page OR 30)
    params.add("page", options.page OR 1)

    response = CALL execute_request(
        client,
        "GET",
        FORMAT("/repos/{}/{}/actions/workflows", client.owner, client.repo),
        params
    )

    workflows = []
    FOR item IN response.workflows:
        workflows.APPEND(parse_workflow(item))

    RETURN WorkflowList(
        workflows: workflows,
        total_count: response.total_count
    )
```

### 2.2 Get Workflow

```
FUNCTION get_workflow(
    client: ActionsClient,
    workflow_id: WorkflowId  // i64 or filename string
) -> Workflow:
    path = FORMAT("/repos/{}/{}/actions/workflows/{}",
        client.owner, client.repo, workflow_id)

    response = CALL execute_request(client, "GET", path, QueryParams())

    RETURN parse_workflow(response)
```

### 2.3 Enable/Disable Workflow

```
FUNCTION set_workflow_state(
    client: ActionsClient,
    workflow_id: WorkflowId,
    enabled: bool
) -> void:
    endpoint = IF enabled THEN "enable" ELSE "disable"
    path = FORMAT("/repos/{}/{}/actions/workflows/{}/{}",
        client.owner, client.repo, workflow_id, endpoint)

    CALL execute_request(client, "PUT", path, QueryParams())

    shared/observability.emit_counter("actions.workflow.state_change", 1, {
        enabled: enabled
    })
```

---

## 3. Workflow Run Operations

### 3.1 Dispatch Workflow

```
FUNCTION dispatch_workflow(
    client: ActionsClient,
    workflow_id: WorkflowId,
    request: DispatchRequest
) -> WorkflowRun:
    // Validate ref
    VALIDATE request.ref IS NOT empty

    // Validate inputs against workflow definition
    workflow = CALL get_workflow(client, workflow_id)
    CALL validate_inputs(workflow, request.inputs)

    path = FORMAT("/repos/{}/{}/actions/workflows/{}/dispatches",
        client.owner, client.repo, workflow_id)

    body = {
        "ref": request.ref,
        "inputs": request.inputs
    }

    // Dispatch returns 204, need to find the created run
    CALL execute_request(client, "POST", path, QueryParams(), body)

    // Wait briefly for run to appear
    SLEEP(1000)

    // Find the run we just created
    run = CALL find_recent_dispatch_run(client, workflow_id, request.ref)

    shared/observability.emit_counter("actions.dispatches", 1, {
        workflow_id: workflow_id
    })

    RETURN run
```

### 3.2 Find Recent Dispatch Run

```
FUNCTION find_recent_dispatch_run(
    client: ActionsClient,
    workflow_id: WorkflowId,
    ref: String
) -> WorkflowRun:
    max_attempts = 10
    delay_ms = 1000

    FOR attempt IN 1..max_attempts:
        runs = CALL list_runs(client, ListRunsOptions(
            workflow_id: Some(workflow_id),
            branch: extract_branch(ref),
            event: "workflow_dispatch",
            per_page: 5
        ))

        // Find most recent run that matches
        FOR run IN runs.workflow_runs:
            IF run.head_sha == resolve_ref(ref) OR
               run.created_at > now() - Duration::seconds(60):
                RETURN run

        SLEEP(delay_ms)
        delay_ms = delay_ms * 2  // Exponential backoff

    THROW RunNotFound("Dispatch run not found after polling")
```

### 3.3 List Workflow Runs

```
FUNCTION list_runs(
    client: ActionsClient,
    options: ListRunsOptions
) -> WorkflowRunList:
    // Determine path based on workflow filter
    path = IF options.workflow_id IS NOT null:
        FORMAT("/repos/{}/{}/actions/workflows/{}/runs",
            client.owner, client.repo, options.workflow_id)
    ELSE:
        FORMAT("/repos/{}/{}/actions/runs", client.owner, client.repo)

    params = QueryParams()
    params.add_optional("branch", options.branch)
    params.add_optional("event", options.event)
    params.add_optional("status", options.status)
    params.add_optional("actor", options.actor)
    params.add_optional("created", options.created)  // ISO date range
    params.add("per_page", options.per_page OR 30)
    params.add("page", options.page OR 1)
    params.add_optional("exclude_pull_requests", options.exclude_prs)

    response = CALL execute_request(client, "GET", path, params)

    runs = []
    FOR item IN response.workflow_runs:
        runs.APPEND(parse_workflow_run(item))

    RETURN WorkflowRunList(
        workflow_runs: runs,
        total_count: response.total_count
    )
```

### 3.4 Get Workflow Run

```
FUNCTION get_run(client: ActionsClient, run_id: i64) -> WorkflowRun:
    path = FORMAT("/repos/{}/{}/actions/runs/{}",
        client.owner, client.repo, run_id)

    response = CALL execute_request(client, "GET", path, QueryParams())

    RETURN parse_workflow_run(response)
```

### 3.5 Wait for Run Completion

```
FUNCTION wait_for_completion(
    client: ActionsClient,
    run_id: i64,
    options: WaitOptions
) -> WorkflowRun:
    timeout_at = now() + options.timeout OR Duration::minutes(60)
    poll_interval = options.poll_interval OR Duration::seconds(10)

    WHILE now() < timeout_at:
        run = CALL get_run(client, run_id)

        IF run.status == "completed":
            RETURN run

        IF run.status == "cancelled":
            THROW RunCancelled(run_id)

        // Emit progress
        shared/observability.emit_gauge("actions.run.progress", {
            run_id: run_id,
            status: run.status
        })

        SLEEP(poll_interval)

    THROW Timeout("Workflow run did not complete in time")
```

### 3.6 Rerun Workflow

```
FUNCTION rerun(client: ActionsClient, run_id: i64) -> WorkflowRun:
    path = FORMAT("/repos/{}/{}/actions/runs/{}/rerun",
        client.owner, client.repo, run_id)

    CALL execute_request(client, "POST", path, QueryParams())

    // Fetch the new run
    SLEEP(1000)
    RETURN CALL get_run(client, run_id)
```

### 3.7 Rerun Failed Jobs

```
FUNCTION rerun_failed_jobs(client: ActionsClient, run_id: i64) -> WorkflowRun:
    path = FORMAT("/repos/{}/{}/actions/runs/{}/rerun-failed-jobs",
        client.owner, client.repo, run_id)

    CALL execute_request(client, "POST", path, QueryParams())

    SLEEP(1000)
    RETURN CALL get_run(client, run_id)
```

### 3.8 Cancel Run

```
FUNCTION cancel_run(client: ActionsClient, run_id: i64) -> void:
    path = FORMAT("/repos/{}/{}/actions/runs/{}/cancel",
        client.owner, client.repo, run_id)

    TRY:
        CALL execute_request(client, "POST", path, QueryParams())
    CATCH error IF error.status == 409:
        // Run already completed or cancelled
        LOG.info("Run {} already in terminal state", run_id)

    shared/observability.emit_counter("actions.runs.cancelled", 1)
```

---

## 4. Job Operations

### 4.1 List Jobs

```
FUNCTION list_jobs(
    client: ActionsClient,
    run_id: i64,
    options: ListJobsOptions
) -> JobList:
    path = FORMAT("/repos/{}/{}/actions/runs/{}/jobs",
        client.owner, client.repo, run_id)

    params = QueryParams()
    params.add_optional("filter", options.filter)  // "all" or "latest"
    params.add("per_page", options.per_page OR 30)
    params.add("page", options.page OR 1)

    response = CALL execute_request(client, "GET", path, params)

    jobs = []
    FOR item IN response.jobs:
        jobs.APPEND(parse_job(item))

    RETURN JobList(
        jobs: jobs,
        total_count: response.total_count
    )
```

### 4.2 Get Job

```
FUNCTION get_job(client: ActionsClient, job_id: i64) -> Job:
    path = FORMAT("/repos/{}/{}/actions/jobs/{}",
        client.owner, client.repo, job_id)

    response = CALL execute_request(client, "GET", path, QueryParams())

    RETURN parse_job(response)
```

### 4.3 Get Job Logs

```
FUNCTION get_job_logs(client: ActionsClient, job_id: i64) -> String:
    path = FORMAT("/repos/{}/{}/actions/jobs/{}/logs",
        client.owner, client.repo, job_id)

    // This endpoint returns a redirect to the log URL
    response = CALL execute_request_follow_redirect(
        client, "GET", path, QueryParams(),
        accept: "application/vnd.github.v3.raw"
    )

    RETURN response.body
```

---

## 5. Log Operations

### 5.1 Get Run Logs

```
FUNCTION get_run_logs(client: ActionsClient, run_id: i64) -> Bytes:
    path = FORMAT("/repos/{}/{}/actions/runs/{}/logs",
        client.owner, client.repo, run_id)

    // Returns redirect to zip file
    response = CALL execute_stream_request(client, "GET", path)

    RETURN response.bytes
```

### 5.2 Stream Logs (Polling)

```
FUNCTION stream_logs(
    client: ActionsClient,
    run_id: i64,
    callback: Fn(LogChunk) -> void
) -> void:
    seen_jobs = Set()
    poll_interval = client.config.log_poll_interval_ms
    max_attempts = client.config.log_max_poll_attempts
    attempts = 0

    WHILE attempts < max_attempts:
        run = CALL get_run(client, run_id)
        jobs = CALL list_jobs(client, run_id, { filter: "latest" })

        FOR job IN jobs.jobs:
            IF job.status == "completed" AND job.id NOT IN seen_jobs:
                logs = CALL get_job_logs(client, job.id)
                callback(LogChunk(
                    job_id: job.id,
                    job_name: job.name,
                    content: logs,
                    is_complete: true
                ))
                seen_jobs.ADD(job.id)

        IF run.status == "completed":
            BREAK

        SLEEP(poll_interval)
        attempts += 1
```

### 5.3 Delete Run Logs

```
FUNCTION delete_run_logs(client: ActionsClient, run_id: i64) -> void:
    path = FORMAT("/repos/{}/{}/actions/runs/{}/logs",
        client.owner, client.repo, run_id)

    CALL execute_request(client, "DELETE", path, QueryParams())
```

---

## 6. Artifact Operations

### 6.1 List Artifacts

```
FUNCTION list_artifacts(
    client: ActionsClient,
    run_id: i64,
    options: PaginationOptions
) -> ArtifactList:
    path = FORMAT("/repos/{}/{}/actions/runs/{}/artifacts",
        client.owner, client.repo, run_id)

    params = QueryParams()
    params.add("per_page", options.per_page OR 30)
    params.add("page", options.page OR 1)
    params.add_optional("name", options.name)

    response = CALL execute_request(client, "GET", path, params)

    artifacts = []
    FOR item IN response.artifacts:
        artifacts.APPEND(parse_artifact(item))

    RETURN ArtifactList(
        artifacts: artifacts,
        total_count: response.total_count
    )
```

### 6.2 Download Artifact

```
FUNCTION download_artifact(
    client: ActionsClient,
    artifact_id: i64
) -> ArtifactDownload:
    // Get metadata first
    artifact = CALL get_artifact(client, artifact_id)

    IF artifact.expired:
        THROW ArtifactExpired(artifact_id, artifact.expires_at)

    path = FORMAT("/repos/{}/{}/actions/artifacts/{}/zip",
        client.owner, client.repo, artifact_id)

    // Download as stream (artifacts can be large)
    content = CALL execute_stream_request(client, "GET", path)

    shared/observability.emit_histogram("actions.artifacts.download_bytes",
        content.len(), { artifact_name: artifact.name })

    RETURN ArtifactDownload(
        artifact: artifact,
        content: content
    )
```

### 6.3 Delete Artifact

```
FUNCTION delete_artifact(client: ActionsClient, artifact_id: i64) -> void:
    path = FORMAT("/repos/{}/{}/actions/artifacts/{}",
        client.owner, client.repo, artifact_id)

    CALL execute_request(client, "DELETE", path, QueryParams())

    shared/observability.emit_counter("actions.artifacts.deleted", 1)
```

---

## 7. Environment Operations

### 7.1 List Environments

```
FUNCTION list_environments(
    client: ActionsClient,
    options: PaginationOptions
) -> EnvironmentList:
    path = FORMAT("/repos/{}/{}/environments", client.owner, client.repo)

    params = QueryParams()
    params.add("per_page", options.per_page OR 30)
    params.add("page", options.page OR 1)

    response = CALL execute_request(client, "GET", path, params)

    environments = []
    FOR item IN response.environments:
        environments.APPEND(parse_environment(item))

    RETURN EnvironmentList(
        environments: environments,
        total_count: response.total_count
    )
```

### 7.2 Get Pending Deployments

```
FUNCTION get_pending_deployments(
    client: ActionsClient,
    run_id: i64
) -> Vec<PendingDeployment>:
    path = FORMAT("/repos/{}/{}/actions/runs/{}/pending_deployments",
        client.owner, client.repo, run_id)

    response = CALL execute_request(client, "GET", path, QueryParams())

    deployments = []
    FOR item IN response:
        deployments.APPEND(parse_pending_deployment(item))

    RETURN deployments
```

### 7.3 Approve Pending Deployment

```
FUNCTION approve_deployment(
    client: ActionsClient,
    run_id: i64,
    environment_ids: Vec<i64>,
    comment: String
) -> void:
    path = FORMAT("/repos/{}/{}/actions/runs/{}/pending_deployments",
        client.owner, client.repo, run_id)

    body = {
        "environment_ids": environment_ids,
        "state": "approved",
        "comment": comment
    }

    CALL execute_request(client, "POST", path, QueryParams(), body)

    shared/observability.emit_counter("actions.deployments.approved", 1)
```

---

## 8. Variable Operations

### 8.1 List Variables

```
FUNCTION list_variables(
    client: ActionsClient,
    scope: VariableScope
) -> VariableList:
    path = MATCH scope:
        CASE Repository:
            FORMAT("/repos/{}/{}/actions/variables", client.owner, client.repo)
        CASE Environment(env_name):
            FORMAT("/repos/{}/{}/environments/{}/variables",
                client.owner, client.repo, env_name)
        CASE Organization:
            FORMAT("/orgs/{}/actions/variables", client.owner)

    response = CALL execute_request(client, "GET", path, QueryParams())

    variables = []
    FOR item IN response.variables:
        variables.APPEND(parse_variable(item))

    RETURN VariableList(
        variables: variables,
        total_count: response.total_count
    )
```

### 8.2 Create/Update Variable

```
FUNCTION set_variable(
    client: ActionsClient,
    name: String,
    value: String,
    scope: VariableScope
) -> Variable:
    path = build_variable_path(client, scope, name)

    // Check if exists
    existing = TRY CALL get_variable(client, name, scope) CATCH null

    body = {
        "name": name,
        "value": value
    }

    IF existing IS NOT null:
        CALL execute_request(client, "PATCH", path, QueryParams(), body)
    ELSE:
        // Create requires different path (no name suffix)
        create_path = build_variable_path(client, scope, null)
        CALL execute_request(client, "POST", create_path, QueryParams(), body)

    RETURN Variable(name: name, value: value, ...)
```

---

## 9. Cache Operations

### 9.1 List Caches

```
FUNCTION list_caches(
    client: ActionsClient,
    options: ListCachesOptions
) -> CacheList:
    path = FORMAT("/repos/{}/{}/actions/caches", client.owner, client.repo)

    params = QueryParams()
    params.add_optional("key", options.key_prefix)
    params.add_optional("ref", options.ref)
    params.add_optional("sort", options.sort)  // "created_at", "last_accessed_at", "size"
    params.add_optional("direction", options.direction)
    params.add("per_page", options.per_page OR 30)
    params.add("page", options.page OR 1)

    response = CALL execute_request(client, "GET", path, params)

    caches = []
    FOR item IN response.actions_caches:
        caches.APPEND(parse_cache(item))

    RETURN CacheList(
        caches: caches,
        total_count: response.total_count
    )
```

### 9.2 Delete Cache

```
FUNCTION delete_cache(
    client: ActionsClient,
    cache_id: i64
) -> void:
    path = FORMAT("/repos/{}/{}/actions/caches/{}",
        client.owner, client.repo, cache_id)

    CALL execute_request(client, "DELETE", path, QueryParams())

    shared/observability.emit_counter("actions.caches.deleted", 1)
```

### 9.3 Get Cache Usage

```
FUNCTION get_cache_usage(client: ActionsClient) -> CacheUsage:
    path = FORMAT("/repos/{}/{}/actions/cache/usage",
        client.owner, client.repo)

    response = CALL execute_request(client, "GET", path, QueryParams())

    RETURN CacheUsage(
        full_name: response.full_name,
        active_caches_size_in_bytes: response.active_caches_size_in_bytes,
        active_caches_count: response.active_caches_count
    )
```

---

## 10. Webhook Processing

### 10.1 Process Workflow Event

```
FUNCTION process_webhook_event(
    client: ActionsClient,
    payload: Bytes,
    signature: String,
    secret: SecretString
) -> WorkflowWebhookPayload:
    // Validate signature
    IF NOT github/auth.validate_webhook_signature(payload, signature, secret):
        THROW InvalidWebhookSignature()

    // Parse payload
    event = parse_json(payload)

    // Determine event type from headers/action
    event_type = determine_event_type(event.action, event)

    webhook_payload = WorkflowWebhookPayload(
        action: event.action,
        workflow: parse_workflow_optional(event.workflow),
        workflow_run: parse_workflow_run_optional(event.workflow_run),
        workflow_job: parse_job_optional(event.workflow_job),
        repository: parse_repository_ref(event.repository),
        sender: parse_actor(event.sender)
    )

    // Emit event metric
    shared/observability.emit_counter("actions.webhooks.received", 1, {
        event_type: event_type,
        action: event.action
    })

    RETURN webhook_payload
```

---

## 11. Request Execution

### 11.1 Execute Request

```
FUNCTION execute_request(
    client: ActionsClient,
    method: String,
    path: String,
    params: QueryParams,
    body: Option<Object>
) -> Object:
    span = shared/observability.start_span("actions.request", {
        method: method,
        path: path
    })

    TRY:
        // Acquire rate limit token
        CALL client.rate_limiter.acquire()

        // Check circuit breaker
        IF client.circuit_breaker.is_open():
            THROW ServiceUnavailable("Circuit breaker open")

        // Get access token
        token = CALL client.auth_provider.get_access_token()

        // Build request
        url = client.base_url + path + params.to_query_string()
        headers = {
            "Authorization": FORMAT("Bearer {}", token.expose()),
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        }

        // Execute with retry
        response = CALL client.http_client.request(
            method: method,
            url: url,
            headers: headers,
            body: body.map(b => serialize_json(b))
        )

        // Update rate limiter from response headers
        client.rate_limiter.update_from_headers(response.headers)

        // Handle response
        IF response.status >= 200 AND response.status < 300:
            client.circuit_breaker.record_success()
            IF response.body.is_empty():
                RETURN {}
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

### 11.2 Error Mapping

```
FUNCTION map_http_error(status: i32, body: Bytes) -> ActionsError:
    error_response = TRY parse_json(body) CATCH {}
    message = error_response.message OR "Unknown error"

    MATCH status:
        CASE 401:
            RETURN Unauthorized(message)
        CASE 403:
            IF message.contains("rate limit"):
                RETURN RateLimited(message)
            IF message.contains("secondary rate"):
                RETURN SecondaryRateLimit(message)
            RETURN AccessDenied(message)
        CASE 404:
            IF message.contains("workflow"):
                RETURN WorkflowNotFound(message)
            IF message.contains("run"):
                RETURN RunNotFound(message)
            IF message.contains("job"):
                RETURN JobNotFound(message)
            IF message.contains("artifact"):
                RETURN ArtifactNotFound(message)
            RETURN NotFound(message)
        CASE 409:
            RETURN RunInProgress(message)
        CASE 410:
            RETURN ArtifactExpired(message)
        CASE 422:
            IF message.contains("disabled"):
                RETURN WorkflowDisabled(message)
            RETURN InvalidInputs(message)
        CASE 429:
            RETURN RateLimited(message)
        CASE 503:
            RETURN ServiceUnavailable(message)
        DEFAULT:
            RETURN ActionsError(status, message)
```

---

## 12. Simulation Support

### 12.1 Mock Client

```
FUNCTION create_mock_client(initial_state: MockState) -> MockActionsClient:
    RETURN MockActionsClient(
        workflows: initial_state.workflows OR {},
        runs: initial_state.runs OR {},
        jobs: initial_state.jobs OR {},
        artifacts: initial_state.artifacts OR {},
        operation_history: [],
        error_injections: {},
        run_progression: default_run_progression()
    )
```

### 12.2 Simulate Run Progression

```
FUNCTION simulate_run_progression(
    mock: MockActionsClient,
    run_id: i64,
    jobs_config: Vec<JobConfig>
) -> void:
    run = mock.runs.get(run_id)
    run.status = "in_progress"
    run.run_started_at = now()

    FOR job_config IN jobs_config:
        job = create_mock_job(run_id, job_config)
        mock.jobs.insert(job.id, job)

        // Simulate job execution
        job.status = "in_progress"
        job.started_at = now()

        FOR step IN job_config.steps:
            // Simulate step execution
            SLEEP(step.duration_ms)
            step.status = "completed"
            step.conclusion = step.expected_conclusion

        job.status = "completed"
        job.conclusion = job_config.expected_conclusion
        job.completed_at = now()

    // Determine run conclusion from jobs
    run.status = "completed"
    run.conclusion = determine_run_conclusion(mock.jobs.values())
```

### 12.3 Record and Replay

```
FUNCTION record_operation(mock: MockActionsClient, op: Operation) -> void:
    mock.operation_history.APPEND(OperationRecord(
        operation: op,
        timestamp: now(),
        state_snapshot: snapshot_relevant_state(mock, op)
    ))

FUNCTION replay_dispatch(
    mock: MockActionsClient,
    recorded: DispatchRecord
) -> ReplayResult:
    // Restore workflow state
    mock.workflows = recorded.workflow_state

    // Execute dispatch
    result = CALL dispatch_workflow(mock, recorded.workflow_id, recorded.request)

    // Compare with recorded result
    matches = compare_runs(result, recorded.expected_run)

    RETURN ReplayResult(
        success: matches,
        actual: result,
        expected: recorded.expected_run
    )
```

---

## 13. Vector Memory Integration

### 13.1 Index Workflow Run

```
FUNCTION index_workflow_run(
    client: ActionsClient,
    run: WorkflowRun
) -> void:
    // Build searchable content
    content = build_run_content(run)

    // Get jobs for additional context
    jobs = CALL list_jobs(client, run.id, { filter: "latest" })

    job_summaries = jobs.jobs.map(j => FORMAT("{}: {}",
        j.name, j.conclusion OR j.status))

    metadata = {
        workflow_id: run.workflow_id,
        workflow_name: run.name,
        run_number: run.run_number,
        event: run.event,
        conclusion: run.conclusion,
        branch: run.head_branch,
        jobs: job_summaries
    }

    CALL shared/vector-memory.store(
        namespace: "github-actions",
        id: FORMAT("run-{}", run.id),
        content: content,
        metadata: metadata
    )
```

### 13.2 Search Similar Runs

```
FUNCTION search_similar_runs(
    client: ActionsClient,
    query: String,
    options: SearchOptions
) -> Vec<SimilarRun>:
    results = CALL shared/vector-memory.search(
        namespace: "github-actions",
        query: query,
        limit: options.limit OR 10,
        filter: options.metadata_filter
    )

    similar_runs = []
    FOR result IN results:
        run_id = parse_run_id(result.id)
        run = TRY CALL get_run(client, run_id) CATCH null
        IF run IS NOT null:
            similar_runs.APPEND(SimilarRun(
                run: run,
                similarity: result.score,
                matched_content: result.matched_content
            ))

    RETURN similar_runs
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-github-actions.md | Complete |
| 2. Pseudocode | pseudocode-github-actions.md | Complete |
| 3. Architecture | architecture-github-actions.md | Pending |
| 4. Refinement | refinement-github-actions.md | Pending |
| 5. Completion | completion-github-actions.md | Pending |

---

*Phase 2: Pseudocode - Complete*
