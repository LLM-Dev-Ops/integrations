# GitHub Actions Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/github/actions`

---

## 1. Edge Cases and Error Handling

### 1.1 Workflow Dispatch

| Edge Case | Detection | Handling |
|-----------|-----------|----------|
| Workflow doesn't exist | 404 response | Throw `WorkflowNotFound` with workflow ID |
| Workflow disabled | 422 + "disabled" | Throw `WorkflowDisabled`, suggest enabling |
| Invalid ref (branch/tag) | 422 + "ref" | Throw `InvalidInputs` with valid refs hint |
| Missing required inputs | 422 + "inputs" | Throw `InvalidInputs` listing required inputs |
| Input value too long | 422 + "value" | Throw `InvalidInputs` with length limit |
| Dispatch rate limit (500/10min) | 403 + specific message | Throw `RateLimited`, wait and retry |
| Run not found after dispatch | Polling timeout | Throw `RunNotFound` after max attempts |
| Concurrent dispatches same ref | Multiple runs created | Return first matching run |

### 1.2 Workflow Run Operations

| Edge Case | Detection | Handling |
|-----------|-----------|----------|
| Run already completed | 409 on cancel/rerun | Log info, return current state |
| Run in waiting state | Status check | Include pending deployments info |
| Rerun on fork PR | 403 response | Throw `AccessDenied` with fork limitation |
| Run deleted during poll | 404 on get | Throw `RunNotFound`, stop polling |
| Very long running job | Poll timeout | Return partial result, warn in logs |
| Run stuck in queued | No runner available | Include queue position if available |

### 1.3 Job and Log Operations

| Edge Case | Detection | Handling |
|-----------|-----------|----------|
| Job logs not yet available | 404 on logs | Return empty, retry on next poll |
| Logs truncated (large output) | Size > limit | Indicate truncation, provide download link |
| Log download redirect fails | Redirect loop | Fail with clear error message |
| Job in waiting state | Status == "waiting" | Include wait reason (approval, etc.) |
| Matrix job naming | Dynamic names | Match by job ID, not name |
| Composite action steps | Nested steps | Flatten step hierarchy |

### 1.4 Artifact Operations

| Edge Case | Detection | Handling |
|-----------|-----------|----------|
| Artifact expired | 410 Gone | Throw `ArtifactExpired` with expiry date |
| Artifact still uploading | Incomplete flag | Wait and retry, or throw if timeout |
| Very large artifact (>500MB) | Size check | Stream download, progress callback |
| Artifact name collision | Multiple matches | Return all, let caller choose |
| Zip extraction fails | Corrupt archive | Throw `InvalidArtifact` with details |
| Empty artifact | Size == 0 | Return empty content, no error |

### 1.5 Rate Limiting

| Edge Case | Detection | Handling |
|-----------|-----------|----------|
| Primary rate limit hit | 403 + X-RateLimit-Remaining: 0 | Wait until reset, use Retry-After |
| Secondary rate limit | 403 + "secondary rate" | Long backoff (60s+), exponential |
| Abuse detection | 403 + "abuse" | Very long wait, may require manual |
| Rate limit near zero | Remaining < 10 | Slow down proactively |
| Multiple clients same token | Shared limit | Coordinate via external state |

---

## 2. Performance Optimizations

### 2.1 Request Batching

```
Optimization                     Benefit               Implementation
────────────────────────────────────────────────────────────────────
Parallel job status fetch       ~70% latency reduction  Promise.all/join!
Concurrent artifact list        ~60% latency reduction  Parallel per run
Log download pipelining         ~50% latency reduction  Stream processing
Run polling with job prefetch   Fewer round trips       Combined request
```

### 2.2 Polling Optimization

```
FUNCTION optimized_wait_for_completion(
    client: ActionsClient,
    run_id: i64,
    options: WaitOptions
) -> WorkflowRun:
    // Adaptive polling interval based on run age
    base_interval = options.poll_interval OR 10_000  // 10s

    run = CALL get_run(client, run_id)
    run_age = now() - run.created_at

    WHILE NOT run.is_completed():
        // Newer runs change faster, poll more frequently
        interval = IF run_age < Duration::minutes(2):
            base_interval
        ELSE IF run_age < Duration::minutes(10):
            base_interval * 2
        ELSE:
            base_interval * 3

        SLEEP(interval)
        run = CALL get_run(client, run_id)
        run_age = now() - run.created_at

        // Early exit if all jobs completed (before run status updates)
        IF options.check_jobs:
            jobs = CALL list_jobs(client, run_id, {filter: "latest"})
            IF all_jobs_completed(jobs):
                BREAK

    RETURN run
```

### 2.3 Caching Strategy

```
Cache Key Pattern                TTL         Invalidation Trigger
────────────────────────────────────────────────────────────────────
workflow:list:{owner}/{repo}    5 min        Webhook: workflow.*
workflow:{id}                   10 min       Webhook: workflow.*
run:{id}:completed              30 min       None (immutable)
run:{id}:in_progress            0            Never cache
jobs:{run_id}:completed         30 min       None (immutable)
jobs:{run_id}:in_progress       0            Never cache
artifacts:{run_id}              5 min        Webhook: workflow_run.*
environments:{repo}             5 min        Webhook: deployment.*

Never Cached:
- Run status during active polling
- Log content (stream directly)
- Artifact content (stream directly)
- Secret metadata (security)
```

### 2.4 Connection Management

```
Pool Configuration:
  max_connections_per_host: 20       # Higher for parallel operations
  idle_timeout_ms: 90000             # Keep alive for subsequent calls
  connection_timeout_ms: 10000       # GitHub can be slow sometimes

Request Distribution:
  - Use HTTP/2 for multiplexing when available
  - Keep connections warm during polling loops
  - Close idle connections after extended inactivity
```

---

## 3. Security Hardening

### 3.1 Input Validation

```
FUNCTION validate_dispatch_request(
    workflow: Workflow,
    request: DispatchRequest
) -> Result<(), ValidationError>:
    // Ref validation
    IF request.ref.is_empty():
        RETURN Err(ValidationError("Ref is required"))

    IF request.ref.length > 255:
        RETURN Err(ValidationError("Ref exceeds 255 characters"))

    IF request.ref.contains_control_chars():
        RETURN Err(ValidationError("Ref contains invalid characters"))

    // Validate ref format (branch, tag, or SHA)
    IF NOT is_valid_git_ref(request.ref):
        RETURN Err(ValidationError("Invalid ref format"))

    // Input validation
    FOR key, value IN request.inputs:
        IF key.length > 100:
            RETURN Err(ValidationError("Input key too long"))

        IF value.length > 65535:  # GitHub limit
            RETURN Err(ValidationError("Input value too long"))

        // Check for suspicious patterns (optional)
        IF contains_script_injection(value):
            LOG.warn("Potential script injection in input: {}", key)

    RETURN Ok(())
```

### 3.2 Webhook Security

```
FUNCTION validate_webhook_request(
    payload: Bytes,
    signature_header: String,
    secret: SecretString
) -> Result<(), SecurityError>:
    // Require signature
    IF signature_header.is_empty():
        RETURN Err(SecurityError("Missing signature header"))

    // Parse signature header (sha256=xxx format)
    IF NOT signature_header.starts_with("sha256="):
        RETURN Err(SecurityError("Invalid signature format"))

    expected_sig = signature_header.strip_prefix("sha256=")

    // Compute HMAC-SHA256
    computed = hmac_sha256(secret.expose(), payload)
    computed_hex = hex_encode(computed)

    // Constant-time comparison
    IF NOT constant_time_compare(expected_sig, computed_hex):
        LOG.warn("Webhook signature mismatch")
        RETURN Err(SecurityError("Invalid signature"))

    // Validate payload age (prevent replay)
    timestamp = extract_timestamp(payload)
    IF timestamp < now() - Duration::minutes(5):
        LOG.warn("Webhook payload too old: {}", timestamp)
        RETURN Err(SecurityError("Payload expired"))

    RETURN Ok(())
```

### 3.3 Credential Protection

```
Credential Handling:
─────────────────────────────────────────────────────────────────────
Credential Type          Storage              Access Pattern
─────────────────────────────────────────────────────────────────────
GitHub App private key   SecretString         Load once, cache JWT
PAT token                SecretString         Load on demand
Installation token       SecretString + TTL   Cache with expiry
Webhook secret           SecretString         Load per request

Memory Protection:
- All credentials use SecretString (zeroize on drop)
- JWT cached in memory with 9-minute TTL (10 min validity - 1 min buffer)
- Installation tokens cached with 55-minute TTL (1 hour validity - 5 min buffer)
- No credential logging (redact in all log statements)
```

### 3.4 Audit Logging

```
Logged Events:
  - Workflow dispatch (workflow_id, ref, user_hash, input_keys)
  - Run operations (run_id, action, user_hash)
  - Artifact access (artifact_id, action, user_hash)
  - Variable changes (variable_name, action, user_hash)
  - Webhook received (event_type, delivery_id, valid)
  - Auth token refresh (token_type, success)

Not Logged:
  - Input values (may contain secrets)
  - Artifact content
  - Log content
  - Variable values
  - Token values
```

---

## 4. Error Recovery Strategies

### 4.1 Dispatch Retry with Deduplication

```
FUNCTION dispatch_with_retry(
    client: ActionsClient,
    workflow_id: WorkflowId,
    request: DispatchRequest,
    options: RetryOptions
) -> Result<WorkflowRun, ActionsError>:
    // Generate idempotency key from inputs
    idempotency_key = hash(workflow_id, request.ref, request.inputs)

    max_attempts = options.max_attempts OR 3
    attempt = 0

    WHILE attempt < max_attempts:
        TRY:
            run = CALL dispatch_workflow(client, workflow_id, request)
            RETURN Ok(run)

        CATCH RateLimited(retry_after):
            attempt += 1
            IF attempt >= max_attempts:
                THROW
            SLEEP(retry_after * 1000)

        CATCH ServiceUnavailable:
            attempt += 1
            IF attempt >= max_attempts:
                THROW
            SLEEP(exponential_backoff(attempt))

        CATCH error:
            // Non-retryable error
            THROW error

    // Check if run was created despite errors
    runs = CALL list_runs(client, {
        workflow_id: workflow_id,
        branch: extract_branch(request.ref),
        created: "> " + (now() - Duration::minutes(5)).to_iso()
    })

    FOR run IN runs.workflow_runs:
        IF matches_dispatch(run, request):
            LOG.info("Found run created by previous attempt: {}", run.id)
            RETURN Ok(run)

    THROW ActionsError("Dispatch failed after retries")
```

### 4.2 Polling Recovery

```
FUNCTION resilient_poll(
    client: ActionsClient,
    run_id: i64,
    options: PollOptions
) -> WorkflowRun:
    consecutive_errors = 0
    max_consecutive_errors = 5
    last_known_state = null

    WHILE true:
        TRY:
            run = CALL get_run(client, run_id)
            consecutive_errors = 0
            last_known_state = run

            IF run.status == "completed":
                RETURN run

        CATCH RateLimited:
            consecutive_errors += 1
            // Double wait time on rate limit
            SLEEP(options.poll_interval * 2)

        CATCH ServiceUnavailable:
            consecutive_errors += 1
            LOG.warn("Service unavailable during poll, attempt {}", consecutive_errors)

        CATCH RunNotFound:
            // Run was deleted
            IF last_known_state IS NOT null:
                LOG.warn("Run {} deleted during polling", run_id)
                RETURN last_known_state
            THROW

        IF consecutive_errors >= max_consecutive_errors:
            LOG.error("Too many consecutive errors polling run {}", run_id)
            IF last_known_state IS NOT null:
                RETURN last_known_state
            THROW ServiceUnavailable("Polling failed")

        SLEEP(options.poll_interval)
```

### 4.3 Log Streaming Recovery

```
FUNCTION resilient_log_stream(
    client: ActionsClient,
    run_id: i64,
    callback: Fn(LogChunk) -> void
) -> void:
    completed_jobs = Set()
    retry_queue = []

    WHILE true:
        run = CALL get_run(client, run_id)
        jobs = CALL list_jobs(client, run_id, {filter: "latest"})

        FOR job IN jobs.jobs:
            IF job.status == "completed" AND job.id NOT IN completed_jobs:
                TRY:
                    logs = CALL get_job_logs(client, job.id)
                    callback(LogChunk(job_id: job.id, content: logs))
                    completed_jobs.ADD(job.id)
                CATCH error:
                    LOG.warn("Failed to fetch logs for job {}: {}", job.id, error)
                    retry_queue.APPEND(job.id)

        // Retry failed log fetches
        FOR job_id IN retry_queue.clone():
            TRY:
                logs = CALL get_job_logs(client, job_id)
                callback(LogChunk(job_id: job_id, content: logs))
                completed_jobs.ADD(job_id)
                retry_queue.REMOVE(job_id)
            CATCH:
                // Keep in retry queue
                PASS

        IF run.status == "completed":
            // Final attempt for any remaining jobs
            FOR job_id IN retry_queue:
                TRY:
                    logs = CALL get_job_logs(client, job_id)
                    callback(LogChunk(job_id: job_id, content: logs))
                CATCH:
                    callback(LogChunk(job_id: job_id, error: "Logs unavailable"))
            BREAK

        SLEEP(client.config.log_poll_interval_ms)
```

---

## 5. Testing Strategy

### 5.1 Unit Test Coverage

```
Component               Coverage Target   Key Test Cases
────────────────────────────────────────────────────────────────────
AdaptiveRateLimiter     100%             Header parsing, backoff calc
RunStateMachine         100%             All state transitions
ErrorMapper             100%             All status codes
InputValidator          95%              Edge cases, injection
WebhookValidator        100%             Signature, replay protection

Unit Test Examples:
- rate_limiter_updates_from_headers() - Parse X-RateLimit-* headers
- rate_limiter_blocks_when_exhausted() - Wait until reset
- state_machine_queued_to_in_progress() - Valid transition
- state_machine_rejects_invalid_transition() - Completed to queued
- error_mapper_secondary_rate_limit() - Detect secondary limit
- validate_inputs_rejects_too_long() - Input length limit
```

### 5.2 Integration Test Scenarios

```
Scenario                         Dependencies        Assertions
────────────────────────────────────────────────────────────────────
Dispatch and wait               Wiremock            Run completes, status correct
List runs with filters          Wiremock            Pagination, filter accuracy
Job log retrieval               Wiremock            Content matches, redirect handled
Artifact download               Wiremock + files    Content integrity, zip valid
Rate limit handling             Wiremock            Backoff timing, retry success
Circuit breaker activation      Wiremock            State transitions correct
Webhook signature validation    None                Reject invalid, accept valid
```

### 5.3 End-to-End Test Scenarios

```
E2E Scenario                    Prerequisites       Timeout
────────────────────────────────────────────────────────────────────
Dispatch simple workflow        Live repo           120s
Dispatch with inputs            Live repo           120s
Wait for completion             Live repo           300s
Cancel running workflow         Live repo           60s
Download artifact               Live repo           60s
Environment approval            Live repo + env     180s

Note: E2E tests gated by GITHUB_ACTIONS_E2E_ENABLED env var
      Requires test repository with specific workflow configurations
```

### 5.4 Simulation Test Strategy

```
Mock Scenario                   Purpose
────────────────────────────────────────────────────────────────────
Happy path dispatch             Basic functionality
Dispatch rate limited           Rate limit handling
Run progression simulation      State machine validation
Job failure mid-run             Partial failure handling
Artifact expiration             Expired artifact handling
Webhook flood                   Throughput testing
Concurrent dispatches           Race condition testing
Long-running workflow           Timeout handling
```

---

## 6. API Compatibility

### 6.1 API Version Handling

```
API Version Strategy:
  Primary: 2022-11-28 (latest stable)
  Header: X-GitHub-Api-Version: 2022-11-28

Version-Specific Handling:
  - All requests include version header
  - Response parsing tolerant of new fields (ignore unknown)
  - Breaking changes detected and logged
  - Fallback behavior for deprecated fields
```

### 6.2 Response Parsing Resilience

```
FUNCTION parse_workflow_run_resilient(json: Value) -> Result<WorkflowRun, ParseError>:
    // Required fields - fail if missing
    id = json.get("id").as_i64().ok_or(ParseError("Missing id"))?
    name = json.get("name").as_str().ok_or(ParseError("Missing name"))?
    status = json.get("status").as_str().ok_or(ParseError("Missing status"))?

    // Optional fields - use defaults
    conclusion = json.get("conclusion").as_str()
    run_attempt = json.get("run_attempt").as_i32().unwrap_or(1)

    // Parse status with fallback for new values
    parsed_status = TRY parse_run_status(status) CATCH {
        LOG.warn("Unknown run status: {}, treating as in_progress", status)
        RunStatus::InProgress
    }

    // Parse conclusion with fallback
    parsed_conclusion = IF conclusion IS NOT null:
        TRY parse_run_conclusion(conclusion) CATCH {
            LOG.warn("Unknown conclusion: {}", conclusion)
            Some(RunConclusion::Neutral)
        }
    ELSE:
        None

    // Ignore unknown fields for forward compatibility
    RETURN WorkflowRun { id, name, status: parsed_status, ... }
```

---

## 7. Operational Considerations

### 7.1 Health Checks

```
FUNCTION check_health(client: ActionsClient) -> HealthStatus:
    checks = []

    // Check API connectivity
    TRY:
        CALL list_workflows(client, {per_page: 1})
        checks.append(HealthCheck("api", Healthy))
    CATCH RateLimited:
        checks.append(HealthCheck("api", Degraded, "Rate limited"))
    CATCH:
        checks.append(HealthCheck("api", Unhealthy))

    // Check authentication
    TRY:
        token = client.auth_provider.get_access_token()
        checks.append(HealthCheck("auth", Healthy))
    CATCH:
        checks.append(HealthCheck("auth", Unhealthy))

    // Check rate limit status
    rate_state = client.rate_limiter.get_state()
    IF rate_state.remaining < 100:
        checks.append(HealthCheck("rate_limit", Degraded,
            FORMAT("Only {} requests remaining", rate_state.remaining)))
    ELSE:
        checks.append(HealthCheck("rate_limit", Healthy))

    // Check circuit breaker
    IF client.circuit_breaker.is_open():
        checks.append(HealthCheck("circuit", Unhealthy, "Circuit open"))
    ELSE:
        checks.append(HealthCheck("circuit", Healthy))

    RETURN aggregate_health(checks)
```

### 7.2 Graceful Degradation

```
Degradation Levels:
  Level 0: Full functionality
  Level 1: Disable parallel operations (reduce request rate)
  Level 2: Read-only mode (no dispatches)
  Level 3: Cached data only
  Level 4: Service unavailable

Triggers:
  - Rate limit remaining < 100  → Level 1
  - Secondary rate limit hit    → Level 2
  - Circuit breaker open        → Level 3
  - Auth failure                → Level 4
  - API errors > 50%            → Level 3
```

### 7.3 Resource Limits

```
Resource                        Limit           Action on Exceed
────────────────────────────────────────────────────────────────────
Concurrent polls                10              Queue additional
Concurrent log streams          5               Queue additional
Artifact download size          1 GB            Stream with progress
Log buffer size                 10 MB           Truncate with warning
Webhook processing queue        1000            Drop oldest, warn
In-memory run cache             1000 entries    Evict LRU
Rate limit buffer               100 requests    Proactive slowdown
```

---

## 8. Monitoring and Alerting

### 8.1 Key Performance Indicators

```
KPI                             Target          Alert Threshold
────────────────────────────────────────────────────────────────────
API success rate                99.5%           < 98%
P50 latency (get ops)           200ms           > 400ms
P99 latency (get ops)           1000ms          > 2000ms
Dispatch success rate           99%             < 95%
Run completion tracking         100%            Any missed
Rate limit remaining            > 500           < 100
Webhook processing lag          < 5s            > 30s
```

### 8.2 Alerting Rules

```
Alert Name                      Condition                   Severity
────────────────────────────────────────────────────────────────────
ActionsAPIDown                 Success rate < 50% / 5m      Critical
ActionsHighLatency             P99 > 3s / 10m               Warning
ActionsRateLimitLow            Remaining < 100 / 5m         Warning
ActionsRateLimitExhausted      Remaining = 0                Critical
ActionsSecondaryRateLimit      Secondary limit hit          Warning
ActionsCircuitOpen             Circuit open > 1m            Critical
ActionsDispatchFailures        Dispatch errors > 10/m       Warning
ActionsWebhookBacklog          Queue > 500 / 5m             Warning
ActionsAuthFailure             401 errors > 5/m             Critical
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-github-actions.md | Complete |
| 2. Pseudocode | pseudocode-github-actions.md | Complete |
| 3. Architecture | architecture-github-actions.md | Complete |
| 4. Refinement | refinement-github-actions.md | Complete |
| 5. Completion | completion-github-actions.md | Pending |

---

*Phase 4: Refinement - Complete*
