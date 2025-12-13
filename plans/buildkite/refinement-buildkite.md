# Buildkite Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/buildkite`

---

## 1. Edge Cases and Error Handling

### 1.1 Build Operations

| Edge Case | Detection | Handling |
|-----------|-----------|----------|
| Pipeline not found | 404 response | Throw `PipelineNotFound` with slug |
| Build already finished | 422 on cancel | Log info, return current build state |
| Build blocked indefinitely | State check | Include in wait response, don't timeout |
| Concurrent build triggers | Multiple builds created | Return the created build, log warning |
| Invalid commit SHA | 422 + "commit" | Throw `InvalidBuildRequest` with hint |
| Branch doesn't exist | 422 + "branch" | Throw `InvalidBuildRequest` |
| Empty environment vars | Validation | Allow empty map, filter null values |
| Metadata key too long | 422 response | Throw `InvalidBuildRequest`, key limit 1KB |
| Metadata value too long | 422 response | Throw `InvalidBuildRequest`, value limit 100KB |

### 1.2 Job Operations

| Edge Case | Detection | Handling |
|-----------|-----------|----------|
| Job not found | 404 response | Throw `JobNotFound` with job ID |
| Unblock non-block job | 422 + "block" | Throw `JobNotBlockable` |
| Retry already passed job | Job state check | Allow retry, Buildkite handles |
| Retry job in progress | 422 response | Throw `InvalidOperation` |
| Job log not ready | 404 on log | Return empty, retry on next poll |
| Very large log file | Size > 50MB | Stream download, warn in logs |
| Parallel job identification | Index check | Include parallel_group_index in response |
| Soft-failed job | soft_failed flag | Include in state, don't treat as failure |

### 1.3 Artifact Operations

| Edge Case | Detection | Handling |
|-----------|-----------|----------|
| Artifact not found | 404 response | Throw `ArtifactNotFound` |
| Artifact still uploading | state != Finished | Wait and retry, or throw if timeout |
| Artifact expired | 404 after retention | Throw with expiry hint |
| Large artifact (>1GB) | Size check | Stream download, progress callback |
| Artifact download redirect | 302 response | Follow redirect automatically |
| Corrupted artifact | SHA1 mismatch | Throw `ArtifactCorrupted`, retry once |

### 1.4 Annotation Operations

| Edge Case | Detection | Handling |
|-----------|-----------|----------|
| Duplicate context | Append behavior | Use append=true or replace |
| Invalid markdown | Buildkite renders | Let Buildkite handle, may show raw |
| Annotation too large | 422 response | Throw `InvalidAnnotation`, limit ~1MB |
| Build finished | May still work | Allow annotations on finished builds |

### 1.5 Rate Limiting

| Edge Case | Detection | Handling |
|-----------|-----------|----------|
| Rate limit hit | 429 response | Wait per Retry-After, exponential backoff |
| Near rate limit | Track request count | Proactive slowdown at 80% capacity |
| Burst of requests | Multiple 429s | Queue requests, process sequentially |
| Rate limit reset | Time check | Resume normal rate after reset |

---

## 2. Performance Optimizations

### 2.1 Request Batching

```
Optimization                     Benefit               Implementation
────────────────────────────────────────────────────────────────────
Parallel job status fetch       ~70% latency reduction  Promise.all/join!
Parallel artifact list          ~60% latency reduction  Concurrent per job
Build list with jobs embedded   Fewer round trips       Single request
Log fetch pipelining            ~50% latency reduction  Stream processing
```

### 2.2 Polling Optimization

```
FUNCTION optimized_wait_for_completion(
    client: BuildkiteClient,
    pipeline_slug: String,
    build_number: i32,
    options: WaitOptions
) -> Build:
    // Adaptive polling interval based on build age
    base_interval = options.poll_interval OR 10_000  // 10s

    build = CALL get_build(client, pipeline_slug, build_number)
    build_age = now() - build.created_at

    WHILE NOT is_terminal_state(build.state):
        // Newer builds change faster, poll more frequently
        interval = IF build_age < Duration::minutes(2):
            base_interval
        ELSE IF build_age < Duration::minutes(10):
            base_interval * 2
        ELSE:
            base_interval * 3

        // Check for blocked state
        IF build.state == BuildState::Blocked:
            IF options.auto_unblock:
                CALL handle_blocked_build(client, build)
            ELSE:
                // Longer interval for blocked builds
                interval = base_interval * 5

        SLEEP(interval)
        build = CALL get_build(client, pipeline_slug, build_number)
        build_age = now() - build.created_at

    RETURN build
```

### 2.3 Caching Strategy

```
Cache Key Pattern                TTL         Invalidation Trigger
────────────────────────────────────────────────────────────────────
pipeline:list:{org}             5 min        Manual refresh
pipeline:{slug}                 10 min       Webhook: pipeline.*
build:{number}:completed        30 min       None (immutable)
build:{number}:in_progress      0            Never cache
jobs:{build}:completed          30 min       None (immutable)
artifacts:{build}               5 min        Webhook: build.finished
clusters:{org}                  10 min       Manual refresh
agents:{org}                    1 min        Webhook: agent.*

Never Cached:
- Build status during active polling
- Log content (stream directly)
- Artifact content (stream directly)
```

### 2.4 Connection Management

```
Pool Configuration:
  max_connections_per_host: 10
  idle_timeout_ms: 90000
  connection_timeout_ms: 10000

Request Distribution:
  - Reuse connections for sequential API calls
  - Separate pool for artifact downloads (larger timeouts)
  - Keep connections warm during polling loops
```

---

## 3. Security Hardening

### 3.1 Input Validation

```
FUNCTION validate_create_build_request(
    request: CreateBuildRequest
) -> Result<(), ValidationError>:
    // Commit validation
    IF request.commit.is_empty():
        RETURN Err(ValidationError("Commit is required"))

    IF NOT is_valid_sha_or_ref(request.commit):
        RETURN Err(ValidationError("Invalid commit format"))

    // Branch validation
    IF request.branch.is_empty():
        RETURN Err(ValidationError("Branch is required"))

    IF request.branch.length > 255:
        RETURN Err(ValidationError("Branch name too long"))

    IF request.branch.contains_control_chars():
        RETURN Err(ValidationError("Branch contains invalid characters"))

    // Environment variable validation
    IF request.env IS NOT null:
        FOR key, value IN request.env:
            IF key.starts_with("BUILDKITE"):
                RETURN Err(ValidationError("Cannot set BUILDKITE_* env vars"))
            IF value.length > 65535:
                RETURN Err(ValidationError("Env value too long"))

    // Metadata validation
    IF request.meta_data IS NOT null:
        FOR key, value IN request.meta_data:
            IF key.length > 1024:
                RETURN Err(ValidationError("Metadata key too long"))
            IF value.length > 102400:  // 100KB
                RETURN Err(ValidationError("Metadata value too long"))

    RETURN Ok(())
```

### 3.2 Webhook Security

```
FUNCTION validate_webhook_request(
    token_header: String,
    expected_token: SecretString
) -> Result<(), SecurityError>:
    // Require token
    IF token_header.is_empty():
        RETURN Err(SecurityError("Missing X-Buildkite-Token header"))

    // Constant-time comparison
    IF NOT constant_time_compare(token_header, expected_token.expose()):
        LOG.warn("Webhook token mismatch")
        RETURN Err(SecurityError("Invalid webhook token"))

    RETURN Ok(())
```

### 3.3 Credential Protection

```
Credential Handling:
─────────────────────────────────────────────────────────────────────
Credential Type          Storage              Access Pattern
─────────────────────────────────────────────────────────────────────
API Token                SecretString         Load once, reuse
Webhook Token            SecretString         Load per request

Memory Protection:
- All tokens use SecretString (zeroize on drop)
- No token logging (redact in all log statements)
- Tokens not included in error messages
```

### 3.4 Audit Logging

```
Logged Events:
  - Build create (pipeline, branch, commit_prefix, user_hash)
  - Build cancel (pipeline, build_number, user_hash)
  - Job unblock (pipeline, build_number, job_id, user_hash)
  - Job retry (pipeline, build_number, job_id, user_hash)
  - Webhook received (event_type, build_number, valid)
  - Auth token used (scope_hash)

Not Logged:
  - Environment variable values
  - Metadata values
  - Artifact content
  - Log content
  - Token values
  - Unblock field values (may contain secrets)
```

---

## 4. Error Recovery Strategies

### 4.1 Build Creation Retry

```
FUNCTION create_build_with_retry(
    client: BuildkiteClient,
    pipeline_slug: String,
    request: CreateBuildRequest,
    options: RetryOptions
) -> Result<Build, BuildkiteError>:
    max_attempts = options.max_attempts OR 3
    attempt = 0

    WHILE attempt < max_attempts:
        TRY:
            build = CALL create_build(client, pipeline_slug, request)
            RETURN Ok(build)

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

    THROW BuildkiteError("Create build failed after retries")
```

### 4.2 Polling Recovery

```
FUNCTION resilient_poll(
    client: BuildkiteClient,
    pipeline_slug: String,
    build_number: i32,
    options: PollOptions
) -> Build:
    consecutive_errors = 0
    max_consecutive_errors = 5
    last_known_state = null

    WHILE true:
        TRY:
            build = CALL get_build(client, pipeline_slug, build_number)
            consecutive_errors = 0
            last_known_state = build

            IF is_terminal_state(build.state):
                RETURN build

        CATCH RateLimited:
            consecutive_errors += 1
            SLEEP(options.poll_interval * 2)

        CATCH ServiceUnavailable:
            consecutive_errors += 1
            LOG.warn("Service unavailable during poll, attempt {}", consecutive_errors)

        CATCH BuildNotFound:
            // Build was deleted
            IF last_known_state IS NOT null:
                LOG.warn("Build {} deleted during polling", build_number)
                RETURN last_known_state
            THROW

        IF consecutive_errors >= max_consecutive_errors:
            LOG.error("Too many consecutive errors polling build {}", build_number)
            IF last_known_state IS NOT null:
                RETURN last_known_state
            THROW ServiceUnavailable("Polling failed")

        SLEEP(options.poll_interval)
```

### 4.3 Log Streaming Recovery

```
FUNCTION resilient_log_stream(
    client: BuildkiteClient,
    pipeline_slug: String,
    build_number: i32,
    callback: Fn(LogChunk) -> void
) -> void:
    completed_jobs = Set()
    retry_queue = []

    WHILE true:
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
                        exit_status: job.exit_status
                    ))
                    completed_jobs.ADD(job.id)
                CATCH error:
                    LOG.warn("Failed to fetch log for job {}: {}", job.id, error)
                    retry_queue.APPEND(job.id)

        // Retry failed log fetches
        FOR job_id IN retry_queue.clone():
            TRY:
                log = CALL get_job_log(client, pipeline_slug, build_number, job_id)
                callback(LogChunk(job_id: job_id, content: log.content))
                completed_jobs.ADD(job_id)
                retry_queue.REMOVE(job_id)
            CATCH:
                PASS

        IF is_terminal_state(build.state):
            // Final attempt for remaining jobs
            FOR job_id IN retry_queue:
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
LinkHeaderParser        100%             All rel types, edge cases
BuildStateMachine       100%             All state transitions
ErrorMapper             100%             All status codes
InputValidator          95%              Edge cases, injection
WebhookValidator        100%             Token comparison

Unit Test Examples:
- parse_link_header_with_next() - Extract next page URL
- parse_link_header_empty() - Handle no pagination
- state_machine_blocked_to_running() - Unblock transition
- state_machine_rejects_invalid() - Invalid transitions
- validate_commit_sha() - Valid/invalid SHA formats
- validate_env_vars_no_buildkite() - Reject BUILDKITE_* vars
```

### 5.2 Integration Test Scenarios

```
Scenario                         Dependencies        Assertions
────────────────────────────────────────────────────────────────────
Create and wait for build       Wiremock            Build completes, state correct
Build with block step           Wiremock            Blocked state, unblock works
Job log retrieval               Wiremock            Content matches
Artifact download               Wiremock + files    Content integrity
Rate limit handling             Wiremock            Backoff timing
Circuit breaker activation      Wiremock            State transitions
Webhook token validation        None                Reject invalid, accept valid
Pagination traversal            Wiremock            All pages fetched
```

### 5.3 End-to-End Test Scenarios

```
E2E Scenario                    Prerequisites       Timeout
────────────────────────────────────────────────────────────────────
Create build on test pipeline   Live org            120s
Wait for build completion       Live org            300s
Cancel running build            Live org            60s
Retry failed job                Live org            60s
Download artifact               Live org            60s
Unblock manual step             Live org + manual   180s

Note: E2E tests gated by BUILDKITE_E2E_ENABLED env var
      Requires test organization with specific pipeline configurations
```

### 5.4 Simulation Test Strategy

```
Mock Scenario                   Purpose
────────────────────────────────────────────────────────────────────
Happy path build               Basic functionality
Build with block step          Block/unblock flow
Build failure                  Error state handling
Rate limit simulation          Backoff verification
Service unavailable            Circuit breaker testing
Webhook flood                  Throughput testing
Concurrent builds              Race condition testing
Long-running build             Timeout handling
Parallel jobs                  Job group handling
```

---

## 6. API Compatibility

### 6.1 API Version Handling

```
API Version Strategy:
  Primary: Buildkite REST API v2
  Base URL: https://api.buildkite.com/v2

Response Compatibility:
  - Parse known fields, ignore unknown (forward compatible)
  - Handle missing optional fields gracefully
  - Log warnings for unexpected response structures
```

### 6.2 Response Parsing Resilience

```
FUNCTION parse_build_resilient(json: Value) -> Result<Build, ParseError>:
    // Required fields - fail if missing
    id = json.get("id").as_str().ok_or(ParseError("Missing id"))?
    number = json.get("number").as_i32().ok_or(ParseError("Missing number"))?
    state = json.get("state").as_str().ok_or(ParseError("Missing state"))?

    // Optional fields - use defaults
    message = json.get("message").as_str().unwrap_or("")
    tag = json.get("tag").as_str()
    pull_request = json.get("pull_request").as_object()

    // Parse state with fallback for new values
    parsed_state = TRY parse_build_state(state) CATCH {
        LOG.warn("Unknown build state: {}, treating as running", state)
        BuildState::Running
    }

    // Jobs may be embedded or empty
    jobs = IF json.contains("jobs"):
        json.get("jobs").as_array()
            .unwrap_or(&[])
            .iter()
            .filter_map(|j| TRY parse_job(j) CATCH None)
            .collect()
    ELSE:
        vec![]

    RETURN Build { id, number, state: parsed_state, jobs, ... }
```

---

## 7. Operational Considerations

### 7.1 Health Checks

```
FUNCTION check_health(client: BuildkiteClient) -> HealthStatus:
    checks = []

    // Check API connectivity
    TRY:
        CALL list_pipelines(client, {per_page: 1})
        checks.append(HealthCheck("api", Healthy))
    CATCH RateLimited:
        checks.append(HealthCheck("api", Degraded, "Rate limited"))
    CATCH:
        checks.append(HealthCheck("api", Unhealthy))

    // Check authentication
    TRY:
        token = client.auth_provider.get_api_token()
        // Token exists and is non-empty
        checks.append(HealthCheck("auth", Healthy))
    CATCH:
        checks.append(HealthCheck("auth", Unhealthy))

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
  Level 2: Read-only mode (no build triggers)
  Level 3: Cached data only
  Level 4: Service unavailable

Triggers:
  - Rate limit remaining < 20%  → Level 1
  - Rate limit exhausted        → Level 2 (wait for reset)
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
Log buffer size                 50 MB           Truncate with warning
Webhook processing queue        1000            Drop oldest, warn
In-memory build cache           500 entries     Evict LRU
Request rate                    200/min         Queue with backpressure
```

---

## 8. Monitoring and Alerting

### 8.1 Key Performance Indicators

```
KPI                             Target          Alert Threshold
────────────────────────────────────────────────────────────────────
API success rate                99.5%           < 98%
P50 latency (read ops)          150ms           > 300ms
P99 latency (read ops)          800ms           > 1500ms
Build creation success rate     99%             < 95%
Build completion tracking       100%            Any missed
Rate limit remaining            > 50            < 20
Webhook processing lag          < 5s            > 30s
```

### 8.2 Alerting Rules

```
Alert Name                      Condition                   Severity
────────────────────────────────────────────────────────────────────
BuildkiteAPIDown               Success rate < 50% / 5m      Critical
BuildkiteHighLatency           P99 > 2s / 10m               Warning
BuildkiteRateLimitLow          Remaining < 20 / 5m          Warning
BuildkiteRateLimitExhausted    Remaining = 0                Critical
BuildkiteCircuitOpen           Circuit open > 1m            Critical
BuildkiteBuildFailures         Build errors > 10/m          Warning
BuildkiteWebhookBacklog        Queue > 500 / 5m             Warning
BuildkiteAuthFailure           401 errors > 5/m             Critical
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-buildkite.md | Complete |
| 2. Pseudocode | pseudocode-buildkite.md | Complete |
| 3. Architecture | architecture-buildkite.md | Complete |
| 4. Refinement | refinement-buildkite.md | Complete |
| 5. Completion | completion-buildkite.md | Pending |

---

*Phase 4: Refinement - Complete*
