# GitHub Integration Module - Pseudocode (Part 2)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/github`
**File:** 2 of 4 - Resilience & Core Services

---

## Table of Contents (Part 2)

1. [Resilience Orchestration](#1-resilience-orchestration)
2. [Repositories Service](#2-repositories-service)
3. [Issues Service](#3-issues-service)
4. [Pull Requests Service](#4-pull-requests-service)

---

## 1. Resilience Orchestration

### 1.1 Resilience Orchestrator Interface

```
// Coordinates retry, circuit breaker, and rate limiting for all API calls
TRAIT ResilienceOrchestrator {
  // Execute an operation with full resilience protection
  ASYNC FUNCTION execute<T>(
    operation_name: String,
    resource: RateLimitResource,
    action: AsyncFn() -> Result<T, GitHubError>
  ) -> Result<T, GitHubError>

  // Get current circuit breaker state
  FUNCTION circuit_state() -> CircuitState

  // Get current rate limit status
  FUNCTION rate_limit_status() -> RateLimitStatus

  // Reset circuit breaker (for testing)
  FUNCTION reset_circuit_breaker()
}

STRUCT ResilienceOrchestratorImpl {
  retry_executor: RetryExecutor,
  circuit_breaker: CircuitBreaker,
  rate_limiter: RateLimiter,
  rate_limit_tracker: RateLimitTracker,
  logger: Logger,
  tracer: Tracer
}
```

### 1.2 Resilience Orchestrator Implementation

```
FUNCTION create_resilience_orchestrator(
  retry_executor: RetryExecutor,
  circuit_breaker: CircuitBreaker,
  rate_limiter: RateLimiter,
  rate_limit_tracker: RateLimitTracker,
  logger: Logger,
  tracer: Tracer
) -> ResilienceOrchestrator

  RETURN ResilienceOrchestratorImpl {
    retry_executor: retry_executor,
    circuit_breaker: circuit_breaker,
    rate_limiter: rate_limiter,
    rate_limit_tracker: rate_limit_tracker,
    logger: logger,
    tracer: tracer
  }
END FUNCTION

ASYNC FUNCTION orchestrator.execute<T>(
  operation_name: String,
  resource: RateLimitResource,
  action: AsyncFn() -> Result<T, GitHubError>
) -> Result<T, GitHubError>

  // Create tracing span
  span <- self.tracer.start_span("github.operation", {
    operation: operation_name,
    resource: resource.to_string()
  })

  TRY
    // Step 1: Check circuit breaker state
    IF self.circuit_breaker.is_open() THEN
      self.logger.warn("Circuit breaker is open", {
        operation: operation_name
      })
      span.set_error("circuit_breaker_open")
      RETURN Error(GitHubError::CircuitBreakerOpen {
        operation: operation_name
      })
    END IF

    // Step 2: Check rate limit tracker and wait if needed
    wait_duration <- self.rate_limit_tracker.should_wait(resource)
    IF wait_duration IS Some THEN
      self.logger.info("Waiting for rate limit reset", {
        operation: operation_name,
        wait_ms: wait_duration.unwrap().as_millis()
      })
      span.add_event("rate_limit_wait", {
        duration_ms: wait_duration.unwrap().as_millis()
      })
      sleep(wait_duration.unwrap()).await
    END IF

    // Step 3: Acquire rate limiter permit
    permit <- self.rate_limiter.acquire().await
    IF permit IS Error THEN
      self.logger.warn("Rate limit exceeded", {
        operation: operation_name
      })
      span.set_error("rate_limit_exceeded")
      RETURN Error(GitHubError::RateLimit(RateLimitError::SecondaryRateLimitExceeded {
        message: "Client-side rate limit exceeded".to_string(),
        retry_after: Some(Duration::from_secs(60)),
        documentation_url: None
      }))
    END IF

    // Step 4: Execute with retry logic
    result <- self.retry_executor.execute(
      operation_name.clone(),
      || async {
        // Execute the actual action
        action_result <- action().await

        // Record result in circuit breaker
        MATCH action_result
          CASE Ok(_):
            self.circuit_breaker.record_success()
          CASE Err(ref e) IF e.is_retryable():
            self.circuit_breaker.record_failure()
          CASE Err(_):
            // Non-retryable errors don't affect circuit breaker
            ()
        END MATCH

        action_result
      }
    ).await

    // Step 5: Record metrics
    MATCH result
      CASE Ok(_):
        span.set_status(SpanStatus::Ok)
      CASE Err(ref e):
        span.set_error(e.error_type())
        span.set_attribute("error.message", e.to_string())
    END MATCH

    RETURN result

  FINALLY
    span.end()
  END TRY
END FUNCTION

FUNCTION orchestrator.circuit_state() -> CircuitState
  RETURN self.circuit_breaker.state()
END FUNCTION

FUNCTION orchestrator.rate_limit_status() -> RateLimitStatus
  RETURN self.rate_limit_tracker.get_all_statuses()
END FUNCTION

FUNCTION orchestrator.reset_circuit_breaker()
  self.circuit_breaker.reset()
END FUNCTION
```

### 1.3 Retry Logic for GitHub-Specific Errors

```
FUNCTION create_github_retry_executor(config: RetryConfig) -> RetryExecutor
  // Create retry executor with GitHub-specific error classification
  RETURN RetryExecutor::new(
    config: config,
    error_classifier: github_error_classifier,
    backoff_calculator: github_backoff_calculator
  )
END FUNCTION

FUNCTION github_error_classifier(error: GitHubError) -> RetryDecision
  MATCH error
    // Rate limit errors: retry with specific delay
    CASE GitHubError::RateLimit(RateLimitError::PrimaryRateLimitExceeded { reset, .. }):
      wait_duration <- (reset - Utc::now()).to_std().unwrap_or(Duration::from_secs(60))
      RETURN RetryDecision::RetryAfter(wait_duration)

    CASE GitHubError::RateLimit(RateLimitError::SecondaryRateLimitExceeded { retry_after, .. }):
      RETURN RetryDecision::RetryAfter(retry_after OR Duration::from_secs(60))

    CASE GitHubError::RateLimit(RateLimitError::AbuseDetected { retry_after, .. }):
      // Abuse detection requires longer backoff
      RETURN RetryDecision::RetryAfter(retry_after OR Duration::from_secs(120))

    // Network errors: retry with exponential backoff
    CASE GitHubError::Network(NetworkError::Timeout { .. }):
      RETURN RetryDecision::Retry

    CASE GitHubError::Network(NetworkError::ConnectionFailed { .. }):
      RETURN RetryDecision::Retry

    // Server errors: retry with backoff
    CASE GitHubError::Server(ServerError::InternalError { .. }):
      RETURN RetryDecision::Retry

    CASE GitHubError::Server(ServerError::BadGateway { .. }):
      RETURN RetryDecision::Retry

    CASE GitHubError::Server(ServerError::ServiceUnavailable { retry_after, .. }):
      IF retry_after IS Some THEN
        RETURN RetryDecision::RetryAfter(retry_after.unwrap())
      ELSE
        RETURN RetryDecision::Retry
      END IF

    // All other errors: do not retry
    CASE _:
      RETURN RetryDecision::DoNotRetry
  END MATCH
END FUNCTION

FUNCTION github_backoff_calculator(
  attempt: u32,
  base_delay: Duration,
  max_delay: Duration,
  multiplier: f64,
  jitter: f64
) -> Duration

  // Exponential backoff with jitter
  exponential_delay <- base_delay * (multiplier ^ (attempt - 1))

  // Cap at max delay
  capped_delay <- min(exponential_delay, max_delay)

  // Add jitter (±jitter%)
  jitter_range <- capped_delay.as_millis() as f64 * jitter
  jitter_offset <- random_range(-jitter_range, jitter_range)
  final_delay <- capped_delay + Duration::from_millis(jitter_offset as u64)

  RETURN final_delay
END FUNCTION
```

---

## 2. Repositories Service

### 2.1 Repositories Service Interface

```
// Interface for repository operations - mockable for testing
TRAIT RepositoriesService {
  // List repositories for authenticated user
  ASYNC FUNCTION list_for_user(params: Option<ListReposParams>) -> Result<Paginated<Repository>, GitHubError>

  // List repositories for organization
  ASYNC FUNCTION list_for_org(org: &str, params: Option<ListReposParams>) -> Result<Paginated<Repository>, GitHubError>

  // Get repository by owner and name
  ASYNC FUNCTION get(owner: &str, repo: &str) -> Result<Repository, GitHubError>

  // Create repository for authenticated user
  ASYNC FUNCTION create(request: CreateRepositoryRequest) -> Result<Repository, GitHubError>

  // Create repository for organization
  ASYNC FUNCTION create_for_org(org: &str, request: CreateRepositoryRequest) -> Result<Repository, GitHubError>

  // Update repository
  ASYNC FUNCTION update(owner: &str, repo: &str, request: UpdateRepositoryRequest) -> Result<Repository, GitHubError>

  // Delete repository
  ASYNC FUNCTION delete(owner: &str, repo: &str) -> Result<(), GitHubError>

  // Sub-services
  FUNCTION contents() -> &ContentsService
  FUNCTION branches() -> &BranchesService
  FUNCTION releases() -> &ReleasesService
  FUNCTION collaborators() -> &CollaboratorsService
}

STRUCT RepositoriesServiceImpl {
  transport: Arc<HttpTransport>,
  auth_manager: Arc<AuthManager>,
  resilience: Arc<ResilienceOrchestrator>,
  rate_limit_tracker: Arc<RateLimitTracker>,
  base_url: Url,
  api_version: String,
  user_agent: String,
  logger: Logger,
  tracer: Tracer,

  // Sub-services (lazy initialized)
  contents_service: Option<ContentsServiceImpl>,
  branches_service: Option<BranchesServiceImpl>,
  releases_service: Option<ReleasesServiceImpl>,
  collaborators_service: Option<CollaboratorsServiceImpl>
}
```

### 2.2 List Repositories Implementation

```
ASYNC FUNCTION repositories_service.list_for_user(
  params: Option<ListReposParams>
) -> Result<Paginated<Repository>, GitHubError>

  span <- self.tracer.start_span("github.repositories.list_for_user")

  TRY
    // Build query parameters
    query_params <- HashMap::new()
    IF params IS Some THEN
      p <- params.unwrap()
      IF p.visibility IS Some THEN
        query_params.insert("visibility", p.visibility.unwrap().to_string())
      END IF
      IF p.affiliation IS Some THEN
        query_params.insert("affiliation", p.affiliation.unwrap().join(","))
      END IF
      IF p.type_ IS Some THEN
        query_params.insert("type", p.type_.unwrap().to_string())
      END IF
      IF p.sort IS Some THEN
        query_params.insert("sort", p.sort.unwrap().to_string())
      END IF
      IF p.direction IS Some THEN
        query_params.insert("direction", p.direction.unwrap().to_string())
      END IF
      IF p.per_page IS Some THEN
        query_params.insert("per_page", p.per_page.unwrap().to_string())
      END IF
      IF p.page IS Some THEN
        query_params.insert("page", p.page.unwrap().to_string())
      END IF
    END IF

    // Execute with resilience
    result <- self.resilience.execute(
      "list_user_repos",
      RateLimitResource::Core,
      || async {
        request <- build_request(
          method: GET,
          endpoint: "/user/repos",
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: Some(query_params)
        )?

        response <- self.transport.send(request).await?

        // Create paginator
        paginator <- PaginatorImpl::new(
          response,
          self.transport.clone(),
          self.auth_manager.clone(),
          self.rate_limit_tracker.clone(),
          self.api_version.clone(),
          self.user_agent.clone(),
          self.logger.clone()
        )?

        RETURN Ok(paginator.current_page().clone())
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION

ASYNC FUNCTION repositories_service.list_for_org(
  org: &str,
  params: Option<ListReposParams>
) -> Result<Paginated<Repository>, GitHubError>

  span <- self.tracer.start_span("github.repositories.list_for_org", {
    org: org.to_string()
  })

  TRY
    // Build query parameters
    query_params <- HashMap::new()
    IF params IS Some THEN
      p <- params.unwrap()
      IF p.type_ IS Some THEN
        query_params.insert("type", p.type_.unwrap().to_string())
      END IF
      IF p.sort IS Some THEN
        query_params.insert("sort", p.sort.unwrap().to_string())
      END IF
      IF p.direction IS Some THEN
        query_params.insert("direction", p.direction.unwrap().to_string())
      END IF
      IF p.per_page IS Some THEN
        query_params.insert("per_page", p.per_page.unwrap().to_string())
      END IF
      IF p.page IS Some THEN
        query_params.insert("page", p.page.unwrap().to_string())
      END IF
    END IF

    result <- self.resilience.execute(
      "list_org_repos",
      RateLimitResource::Core,
      || async {
        request <- build_request(
          method: GET,
          endpoint: build_org_path(org, "/repos"),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: Some(query_params)
        )?

        response <- self.transport.send(request).await?

        paginator <- PaginatorImpl::new(
          response,
          self.transport.clone(),
          self.auth_manager.clone(),
          self.rate_limit_tracker.clone(),
          self.api_version.clone(),
          self.user_agent.clone(),
          self.logger.clone()
        )?

        RETURN Ok(paginator.current_page().clone())
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION
```

### 2.3 Get Repository Implementation

```
ASYNC FUNCTION repositories_service.get(
  owner: &str,
  repo: &str
) -> Result<Repository, GitHubError>

  span <- self.tracer.start_span("github.repositories.get", {
    owner: owner.to_string(),
    repo: repo.to_string()
  })

  TRY
    result <- self.resilience.execute(
      "get_repo",
      RateLimitResource::Core,
      || async {
        request <- build_request(
          method: GET,
          endpoint: build_repo_path(owner, repo, ""),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(request).await?
        repository <- parse_response::<Repository>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        RETURN Ok(repository)
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION
```

### 2.4 Create Repository Implementation

```
ASYNC FUNCTION repositories_service.create(
  request: CreateRepositoryRequest
) -> Result<Repository, GitHubError>

  span <- self.tracer.start_span("github.repositories.create", {
    name: request.name.clone()
  })

  TRY
    // Validate request
    validate_create_repository_request(request)?

    result <- self.resilience.execute(
      "create_repo",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: POST,
          endpoint: "/user/repos",
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(request),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        repository <- parse_response::<Repository>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        self.logger.info("Repository created", {
          full_name: repository.full_name.clone()
        })

        RETURN Ok(repository)
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION

ASYNC FUNCTION repositories_service.create_for_org(
  org: &str,
  request: CreateRepositoryRequest
) -> Result<Repository, GitHubError>

  span <- self.tracer.start_span("github.repositories.create_for_org", {
    org: org.to_string(),
    name: request.name.clone()
  })

  TRY
    validate_create_repository_request(request)?

    result <- self.resilience.execute(
      "create_org_repo",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: POST,
          endpoint: build_org_path(org, "/repos"),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(request),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        repository <- parse_response::<Repository>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        self.logger.info("Organization repository created", {
          org: org.to_string(),
          full_name: repository.full_name.clone()
        })

        RETURN Ok(repository)
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION

FUNCTION validate_create_repository_request(request: CreateRepositoryRequest) -> Result<(), GitHubError>
  IF request.name.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Repository name is required".to_string(),
      errors: None,
      documentation_url: None
    })
  END IF

  IF request.name.len() > 100 THEN
    RETURN Error(RequestError::ValidationError {
      message: "Repository name cannot exceed 100 characters".to_string(),
      errors: None,
      documentation_url: None
    })
  END IF

  // Validate name format (alphanumeric, hyphen, underscore, dot)
  IF NOT is_valid_repo_name(request.name) THEN
    RETURN Error(RequestError::ValidationError {
      message: "Repository name can only contain alphanumeric characters, hyphens, underscores, and dots".to_string(),
      errors: None,
      documentation_url: None
    })
  END IF

  RETURN Ok(())
END FUNCTION
```

### 2.5 Update and Delete Repository

```
ASYNC FUNCTION repositories_service.update(
  owner: &str,
  repo: &str,
  request: UpdateRepositoryRequest
) -> Result<Repository, GitHubError>

  span <- self.tracer.start_span("github.repositories.update", {
    owner: owner.to_string(),
    repo: repo.to_string()
  })

  TRY
    result <- self.resilience.execute(
      "update_repo",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: PATCH,
          endpoint: build_repo_path(owner, repo, ""),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(request),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        repository <- parse_response::<Repository>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        self.logger.info("Repository updated", {
          full_name: repository.full_name.clone()
        })

        RETURN Ok(repository)
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION

ASYNC FUNCTION repositories_service.delete(
  owner: &str,
  repo: &str
) -> Result<(), GitHubError>

  span <- self.tracer.start_span("github.repositories.delete", {
    owner: owner.to_string(),
    repo: repo.to_string()
  })

  TRY
    result <- self.resilience.execute(
      "delete_repo",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: DELETE,
          endpoint: build_repo_path(owner, repo, ""),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?

        IF response.status != 204 THEN
          RETURN Error(parse_error_response(response.status, response.body, response.headers))
        END IF

        self.logger.info("Repository deleted", {
          owner: owner.to_string(),
          repo: repo.to_string()
        })

        RETURN Ok(())
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION
```

### 2.6 Contents Sub-Service

```
TRAIT ContentsService {
  ASYNC FUNCTION get(owner: &str, repo: &str, path: &str, ref_: Option<&str>) -> Result<Contents, GitHubError>
  ASYNC FUNCTION create_or_update(owner: &str, repo: &str, path: &str, request: CreateOrUpdateFileRequest) -> Result<FileCommitResponse, GitHubError>
  ASYNC FUNCTION delete(owner: &str, repo: &str, path: &str, request: DeleteFileRequest) -> Result<FileCommitResponse, GitHubError>
  ASYNC FUNCTION get_readme(owner: &str, repo: &str, ref_: Option<&str>) -> Result<Contents, GitHubError>
  ASYNC FUNCTION download_archive(owner: &str, repo: &str, format: ArchiveFormat, ref_: Option<&str>) -> Result<Bytes, GitHubError>
}

ASYNC FUNCTION contents_service.get(
  owner: &str,
  repo: &str,
  path: &str,
  ref_: Option<&str>
) -> Result<Contents, GitHubError>

  span <- self.tracer.start_span("github.contents.get", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    path: path.to_string()
  })

  TRY
    query_params <- HashMap::new()
    IF ref_ IS Some THEN
      query_params.insert("ref", ref_.unwrap().to_string())
    END IF

    result <- self.resilience.execute(
      "get_contents",
      RateLimitResource::Core,
      || async {
        // URL encode the path
        encoded_path <- url_encode_path(path)

        http_request <- build_request(
          method: GET,
          endpoint: build_repo_path(owner, repo, format("/contents/{}", encoded_path)),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: IF query_params.is_empty() THEN None ELSE Some(query_params) END IF
        )?

        response <- self.transport.send(http_request).await?
        contents <- parse_response::<Contents>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        RETURN Ok(contents)
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION

ASYNC FUNCTION contents_service.create_or_update(
  owner: &str,
  repo: &str,
  path: &str,
  request: CreateOrUpdateFileRequest
) -> Result<FileCommitResponse, GitHubError>

  span <- self.tracer.start_span("github.contents.create_or_update", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    path: path.to_string()
  })

  TRY
    // Validate request
    IF request.message.is_empty() THEN
      RETURN Error(RequestError::ValidationError {
        message: "Commit message is required".to_string(),
        errors: None,
        documentation_url: None
      })
    END IF

    IF request.content.is_empty() THEN
      RETURN Error(RequestError::ValidationError {
        message: "Content is required".to_string(),
        errors: None,
        documentation_url: None
      })
    END IF

    result <- self.resilience.execute(
      "create_or_update_file",
      RateLimitResource::Core,
      || async {
        encoded_path <- url_encode_path(path)

        http_request <- build_request(
          method: PUT,
          endpoint: build_repo_path(owner, repo, format("/contents/{}", encoded_path)),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(request),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        file_response <- parse_response::<FileCommitResponse>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        self.logger.info("File created/updated", {
          path: path.to_string(),
          sha: file_response.content.sha.clone()
        })

        RETURN Ok(file_response)
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION
```

---

## 3. Issues Service

### 3.1 Issues Service Interface

```
TRAIT IssuesService {
  // List issues
  ASYNC FUNCTION list(owner: &str, repo: &str, params: Option<ListIssuesParams>) -> Result<Paginated<Issue>, GitHubError>

  // Get single issue
  ASYNC FUNCTION get(owner: &str, repo: &str, issue_number: u64) -> Result<Issue, GitHubError>

  // Create issue
  ASYNC FUNCTION create(owner: &str, repo: &str, request: CreateIssueRequest) -> Result<Issue, GitHubError>

  // Update issue
  ASYNC FUNCTION update(owner: &str, repo: &str, issue_number: u64, request: UpdateIssueRequest) -> Result<Issue, GitHubError>

  // Lock issue
  ASYNC FUNCTION lock(owner: &str, repo: &str, issue_number: u64, reason: Option<LockReason>) -> Result<(), GitHubError>

  // Unlock issue
  ASYNC FUNCTION unlock(owner: &str, repo: &str, issue_number: u64) -> Result<(), GitHubError>

  // Sub-services
  FUNCTION comments() -> &IssueCommentsService
  FUNCTION labels() -> &LabelsService
  FUNCTION milestones() -> &MilestonesService
  FUNCTION assignees() -> &AssigneesService
}

STRUCT IssuesServiceImpl {
  transport: Arc<HttpTransport>,
  auth_manager: Arc<AuthManager>,
  resilience: Arc<ResilienceOrchestrator>,
  rate_limit_tracker: Arc<RateLimitTracker>,
  base_url: Url,
  api_version: String,
  user_agent: String,
  logger: Logger,
  tracer: Tracer,

  comments_service: Option<IssueCommentsServiceImpl>,
  labels_service: Option<LabelsServiceImpl>,
  milestones_service: Option<MilestonesServiceImpl>,
  assignees_service: Option<AssigneesServiceImpl>
}
```

### 3.2 List Issues Implementation

```
ASYNC FUNCTION issues_service.list(
  owner: &str,
  repo: &str,
  params: Option<ListIssuesParams>
) -> Result<Paginated<Issue>, GitHubError>

  span <- self.tracer.start_span("github.issues.list", {
    owner: owner.to_string(),
    repo: repo.to_string()
  })

  TRY
    // Build query parameters
    query_params <- HashMap::new()
    IF params IS Some THEN
      p <- params.unwrap()
      IF p.state IS Some THEN
        query_params.insert("state", p.state.unwrap().to_string())
      END IF
      IF p.labels IS Some THEN
        query_params.insert("labels", p.labels.unwrap().join(","))
      END IF
      IF p.assignee IS Some THEN
        query_params.insert("assignee", p.assignee.unwrap().to_string())
      END IF
      IF p.creator IS Some THEN
        query_params.insert("creator", p.creator.unwrap().to_string())
      END IF
      IF p.mentioned IS Some THEN
        query_params.insert("mentioned", p.mentioned.unwrap().to_string())
      END IF
      IF p.milestone IS Some THEN
        query_params.insert("milestone", p.milestone.unwrap().to_string())
      END IF
      IF p.sort IS Some THEN
        query_params.insert("sort", p.sort.unwrap().to_string())
      END IF
      IF p.direction IS Some THEN
        query_params.insert("direction", p.direction.unwrap().to_string())
      END IF
      IF p.since IS Some THEN
        query_params.insert("since", p.since.unwrap().to_rfc3339())
      END IF
      IF p.per_page IS Some THEN
        query_params.insert("per_page", p.per_page.unwrap().to_string())
      END IF
      IF p.page IS Some THEN
        query_params.insert("page", p.page.unwrap().to_string())
      END IF
    END IF

    result <- self.resilience.execute(
      "list_issues",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: GET,
          endpoint: build_repo_path(owner, repo, "/issues"),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: IF query_params.is_empty() THEN None ELSE Some(query_params) END IF
        )?

        response <- self.transport.send(http_request).await?

        paginator <- PaginatorImpl::new(
          response,
          self.transport.clone(),
          self.auth_manager.clone(),
          self.rate_limit_tracker.clone(),
          self.api_version.clone(),
          self.user_agent.clone(),
          self.logger.clone()
        )?

        RETURN Ok(paginator.current_page().clone())
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION
```

### 3.3 Get Issue Implementation

```
ASYNC FUNCTION issues_service.get(
  owner: &str,
  repo: &str,
  issue_number: u64
) -> Result<Issue, GitHubError>

  span <- self.tracer.start_span("github.issues.get", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    issue_number: issue_number
  })

  TRY
    result <- self.resilience.execute(
      "get_issue",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: GET,
          endpoint: build_repo_path(owner, repo, format("/issues/{}", issue_number)),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        issue <- parse_response::<Issue>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        RETURN Ok(issue)
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION
```

### 3.4 Create Issue Implementation

```
ASYNC FUNCTION issues_service.create(
  owner: &str,
  repo: &str,
  request: CreateIssueRequest
) -> Result<Issue, GitHubError>

  span <- self.tracer.start_span("github.issues.create", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    title: request.title.clone()
  })

  TRY
    // Validate request
    IF request.title.is_empty() THEN
      RETURN Error(RequestError::ValidationError {
        message: "Issue title is required".to_string(),
        errors: None,
        documentation_url: None
      })
    END IF

    result <- self.resilience.execute(
      "create_issue",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: POST,
          endpoint: build_repo_path(owner, repo, "/issues"),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(request),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        issue <- parse_response::<Issue>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        self.logger.info("Issue created", {
          owner: owner.to_string(),
          repo: repo.to_string(),
          number: issue.number,
          title: issue.title.clone()
        })

        RETURN Ok(issue)
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION
```

### 3.5 Update Issue Implementation

```
ASYNC FUNCTION issues_service.update(
  owner: &str,
  repo: &str,
  issue_number: u64,
  request: UpdateIssueRequest
) -> Result<Issue, GitHubError>

  span <- self.tracer.start_span("github.issues.update", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    issue_number: issue_number
  })

  TRY
    result <- self.resilience.execute(
      "update_issue",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: PATCH,
          endpoint: build_repo_path(owner, repo, format("/issues/{}", issue_number)),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(request),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        issue <- parse_response::<Issue>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        self.logger.info("Issue updated", {
          owner: owner.to_string(),
          repo: repo.to_string(),
          number: issue.number
        })

        RETURN Ok(issue)
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION
```

### 3.6 Lock/Unlock Issue

```
ASYNC FUNCTION issues_service.lock(
  owner: &str,
  repo: &str,
  issue_number: u64,
  reason: Option<LockReason>
) -> Result<(), GitHubError>

  span <- self.tracer.start_span("github.issues.lock", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    issue_number: issue_number
  })

  TRY
    result <- self.resilience.execute(
      "lock_issue",
      RateLimitResource::Core,
      || async {
        body <- IF reason IS Some THEN
          Some(LockRequest { lock_reason: reason.unwrap().to_string() })
        ELSE
          None
        END IF

        http_request <- build_request(
          method: PUT,
          endpoint: build_repo_path(owner, repo, format("/issues/{}/lock", issue_number)),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: body,
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?

        IF response.status != 204 THEN
          RETURN Error(parse_error_response(response.status, response.body, response.headers))
        END IF

        self.logger.info("Issue locked", {
          owner: owner.to_string(),
          repo: repo.to_string(),
          number: issue_number,
          reason: reason.map(|r| r.to_string())
        })

        RETURN Ok(())
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION

ASYNC FUNCTION issues_service.unlock(
  owner: &str,
  repo: &str,
  issue_number: u64
) -> Result<(), GitHubError>

  span <- self.tracer.start_span("github.issues.unlock", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    issue_number: issue_number
  })

  TRY
    result <- self.resilience.execute(
      "unlock_issue",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: DELETE,
          endpoint: build_repo_path(owner, repo, format("/issues/{}/lock", issue_number)),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?

        IF response.status != 204 THEN
          RETURN Error(parse_error_response(response.status, response.body, response.headers))
        END IF

        self.logger.info("Issue unlocked", {
          owner: owner.to_string(),
          repo: repo.to_string(),
          number: issue_number
        })

        RETURN Ok(())
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION

ENUM LockReason {
  OffTopic,
  TooHeated,
  Resolved,
  Spam
}

FUNCTION LockReason.to_string() -> String
  MATCH self
    CASE LockReason::OffTopic: RETURN "off-topic"
    CASE LockReason::TooHeated: RETURN "too heated"
    CASE LockReason::Resolved: RETURN "resolved"
    CASE LockReason::Spam: RETURN "spam"
  END MATCH
END FUNCTION
```

### 3.7 Issue Comments Sub-Service

```
TRAIT IssueCommentsService {
  ASYNC FUNCTION list(owner: &str, repo: &str, issue_number: u64, params: Option<ListCommentsParams>) -> Result<Paginated<IssueComment>, GitHubError>
  ASYNC FUNCTION get(owner: &str, repo: &str, comment_id: u64) -> Result<IssueComment, GitHubError>
  ASYNC FUNCTION create(owner: &str, repo: &str, issue_number: u64, body: String) -> Result<IssueComment, GitHubError>
  ASYNC FUNCTION update(owner: &str, repo: &str, comment_id: u64, body: String) -> Result<IssueComment, GitHubError>
  ASYNC FUNCTION delete(owner: &str, repo: &str, comment_id: u64) -> Result<(), GitHubError>
}

ASYNC FUNCTION comments_service.create(
  owner: &str,
  repo: &str,
  issue_number: u64,
  body: String
) -> Result<IssueComment, GitHubError>

  span <- self.tracer.start_span("github.issues.comments.create", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    issue_number: issue_number
  })

  TRY
    IF body.is_empty() THEN
      RETURN Error(RequestError::ValidationError {
        message: "Comment body is required".to_string(),
        errors: None,
        documentation_url: None
      })
    END IF

    result <- self.resilience.execute(
      "create_issue_comment",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: POST,
          endpoint: build_repo_path(owner, repo, format("/issues/{}/comments", issue_number)),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(CreateCommentRequest { body: body }),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        comment <- parse_response::<IssueComment>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        self.logger.info("Issue comment created", {
          owner: owner.to_string(),
          repo: repo.to_string(),
          issue_number: issue_number,
          comment_id: comment.id
        })

        RETURN Ok(comment)
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION
```

---

## 4. Pull Requests Service

### 4.1 Pull Requests Service Interface

```
TRAIT PullRequestsService {
  // List pull requests
  ASYNC FUNCTION list(owner: &str, repo: &str, params: Option<ListPullRequestsParams>) -> Result<Paginated<PullRequest>, GitHubError>

  // Get single pull request
  ASYNC FUNCTION get(owner: &str, repo: &str, pull_number: u64) -> Result<PullRequest, GitHubError>

  // Create pull request
  ASYNC FUNCTION create(owner: &str, repo: &str, request: CreatePullRequestRequest) -> Result<PullRequest, GitHubError>

  // Update pull request
  ASYNC FUNCTION update(owner: &str, repo: &str, pull_number: u64, request: UpdatePullRequestRequest) -> Result<PullRequest, GitHubError>

  // List commits in PR
  ASYNC FUNCTION list_commits(owner: &str, repo: &str, pull_number: u64) -> Result<Paginated<Commit>, GitHubError>

  // List files changed in PR
  ASYNC FUNCTION list_files(owner: &str, repo: &str, pull_number: u64) -> Result<Paginated<PullRequestFile>, GitHubError>

  // Check if merged
  ASYNC FUNCTION is_merged(owner: &str, repo: &str, pull_number: u64) -> Result<bool, GitHubError>

  // Merge PR
  ASYNC FUNCTION merge(owner: &str, repo: &str, pull_number: u64, request: MergePullRequestRequest) -> Result<MergeResult, GitHubError>

  // Update PR branch
  ASYNC FUNCTION update_branch(owner: &str, repo: &str, pull_number: u64, expected_head_sha: Option<&str>) -> Result<UpdateBranchResult, GitHubError>

  // Sub-services
  FUNCTION reviews() -> &ReviewsService
  FUNCTION review_comments() -> &ReviewCommentsService
  FUNCTION review_requests() -> &ReviewRequestsService
}

STRUCT PullRequestsServiceImpl {
  transport: Arc<HttpTransport>,
  auth_manager: Arc<AuthManager>,
  resilience: Arc<ResilienceOrchestrator>,
  rate_limit_tracker: Arc<RateLimitTracker>,
  base_url: Url,
  api_version: String,
  user_agent: String,
  logger: Logger,
  tracer: Tracer,

  reviews_service: Option<ReviewsServiceImpl>,
  review_comments_service: Option<ReviewCommentsServiceImpl>,
  review_requests_service: Option<ReviewRequestsServiceImpl>
}
```

### 4.2 List Pull Requests Implementation

```
ASYNC FUNCTION pull_requests_service.list(
  owner: &str,
  repo: &str,
  params: Option<ListPullRequestsParams>
) -> Result<Paginated<PullRequest>, GitHubError>

  span <- self.tracer.start_span("github.pull_requests.list", {
    owner: owner.to_string(),
    repo: repo.to_string()
  })

  TRY
    query_params <- HashMap::new()
    IF params IS Some THEN
      p <- params.unwrap()
      IF p.state IS Some THEN
        query_params.insert("state", p.state.unwrap().to_string())
      END IF
      IF p.head IS Some THEN
        query_params.insert("head", p.head.unwrap().to_string())
      END IF
      IF p.base IS Some THEN
        query_params.insert("base", p.base.unwrap().to_string())
      END IF
      IF p.sort IS Some THEN
        query_params.insert("sort", p.sort.unwrap().to_string())
      END IF
      IF p.direction IS Some THEN
        query_params.insert("direction", p.direction.unwrap().to_string())
      END IF
      IF p.per_page IS Some THEN
        query_params.insert("per_page", p.per_page.unwrap().to_string())
      END IF
      IF p.page IS Some THEN
        query_params.insert("page", p.page.unwrap().to_string())
      END IF
    END IF

    result <- self.resilience.execute(
      "list_pull_requests",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: GET,
          endpoint: build_repo_path(owner, repo, "/pulls"),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: IF query_params.is_empty() THEN None ELSE Some(query_params) END IF
        )?

        response <- self.transport.send(http_request).await?

        paginator <- PaginatorImpl::new(
          response,
          self.transport.clone(),
          self.auth_manager.clone(),
          self.rate_limit_tracker.clone(),
          self.api_version.clone(),
          self.user_agent.clone(),
          self.logger.clone()
        )?

        RETURN Ok(paginator.current_page().clone())
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION
```

### 4.3 Create Pull Request Implementation

```
ASYNC FUNCTION pull_requests_service.create(
  owner: &str,
  repo: &str,
  request: CreatePullRequestRequest
) -> Result<PullRequest, GitHubError>

  span <- self.tracer.start_span("github.pull_requests.create", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    title: request.title.clone(),
    head: request.head.clone(),
    base: request.base.clone()
  })

  TRY
    // Validate request
    IF request.title.is_empty() THEN
      RETURN Error(RequestError::ValidationError {
        message: "Pull request title is required".to_string(),
        errors: None,
        documentation_url: None
      })
    END IF

    IF request.head.is_empty() THEN
      RETURN Error(RequestError::ValidationError {
        message: "Head branch is required".to_string(),
        errors: None,
        documentation_url: None
      })
    END IF

    IF request.base.is_empty() THEN
      RETURN Error(RequestError::ValidationError {
        message: "Base branch is required".to_string(),
        errors: None,
        documentation_url: None
      })
    END IF

    result <- self.resilience.execute(
      "create_pull_request",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: POST,
          endpoint: build_repo_path(owner, repo, "/pulls"),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(request),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        pr <- parse_response::<PullRequest>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        self.logger.info("Pull request created", {
          owner: owner.to_string(),
          repo: repo.to_string(),
          number: pr.number,
          title: pr.title.clone()
        })

        RETURN Ok(pr)
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION
```

### 4.4 Merge Pull Request Implementation

```
ASYNC FUNCTION pull_requests_service.merge(
  owner: &str,
  repo: &str,
  pull_number: u64,
  request: MergePullRequestRequest
) -> Result<MergeResult, GitHubError>

  span <- self.tracer.start_span("github.pull_requests.merge", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    pull_number: pull_number,
    merge_method: request.merge_method.clone().unwrap_or("merge".to_string())
  })

  TRY
    result <- self.resilience.execute(
      "merge_pull_request",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: PUT,
          endpoint: build_repo_path(owner, repo, format("/pulls/{}/merge", pull_number)),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(request),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?

        // 200 = merged successfully
        // 405 = not mergeable
        // 409 = conflict (SHA mismatch)
        IF response.status == 200 THEN
          merge_result <- parse_response::<MergeResult>(
            response,
            self.rate_limit_tracker.clone(),
            self.logger.clone()
          )?

          self.logger.info("Pull request merged", {
            owner: owner.to_string(),
            repo: repo.to_string(),
            number: pull_number,
            sha: merge_result.sha.clone()
          })

          RETURN Ok(merge_result)
        ELSE IF response.status == 405 THEN
          RETURN Error(RequestError::ValidationError {
            message: "Pull request is not mergeable".to_string(),
            errors: None,
            documentation_url: None
          })
        ELSE IF response.status == 409 THEN
          RETURN Error(ResourceError::Conflict {
            message: "SHA does not match current HEAD".to_string()
          })
        ELSE
          RETURN Error(parse_error_response(response.status, response.body, response.headers))
        END IF
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION

STRUCT MergeResult {
  sha: String,
  merged: bool,
  message: String
}
```

### 4.5 Check if Merged

```
ASYNC FUNCTION pull_requests_service.is_merged(
  owner: &str,
  repo: &str,
  pull_number: u64
) -> Result<bool, GitHubError>

  span <- self.tracer.start_span("github.pull_requests.is_merged", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    pull_number: pull_number
  })

  TRY
    result <- self.resilience.execute(
      "check_pr_merged",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: GET,
          endpoint: build_repo_path(owner, repo, format("/pulls/{}/merge", pull_number)),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?

        // 204 = PR is merged
        // 404 = PR is not merged
        IF response.status == 204 THEN
          RETURN Ok(true)
        ELSE IF response.status == 404 THEN
          RETURN Ok(false)
        ELSE
          RETURN Error(parse_error_response(response.status, response.body, response.headers))
        END IF
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION
```

### 4.6 Reviews Sub-Service

```
TRAIT ReviewsService {
  ASYNC FUNCTION list(owner: &str, repo: &str, pull_number: u64) -> Result<Paginated<Review>, GitHubError>
  ASYNC FUNCTION get(owner: &str, repo: &str, pull_number: u64, review_id: u64) -> Result<Review, GitHubError>
  ASYNC FUNCTION create(owner: &str, repo: &str, pull_number: u64, request: CreateReviewRequest) -> Result<Review, GitHubError>
  ASYNC FUNCTION submit(owner: &str, repo: &str, pull_number: u64, review_id: u64, event: ReviewEvent, body: Option<String>) -> Result<Review, GitHubError>
  ASYNC FUNCTION dismiss(owner: &str, repo: &str, pull_number: u64, review_id: u64, message: String) -> Result<Review, GitHubError>
  ASYNC FUNCTION delete(owner: &str, repo: &str, pull_number: u64, review_id: u64) -> Result<(), GitHubError>
}

ENUM ReviewEvent {
  Approve,
  RequestChanges,
  Comment
}

FUNCTION ReviewEvent.to_string() -> String
  MATCH self
    CASE ReviewEvent::Approve: RETURN "APPROVE"
    CASE ReviewEvent::RequestChanges: RETURN "REQUEST_CHANGES"
    CASE ReviewEvent::Comment: RETURN "COMMENT"
  END MATCH
END FUNCTION

ASYNC FUNCTION reviews_service.create(
  owner: &str,
  repo: &str,
  pull_number: u64,
  request: CreateReviewRequest
) -> Result<Review, GitHubError>

  span <- self.tracer.start_span("github.pull_requests.reviews.create", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    pull_number: pull_number,
    event: request.event.clone().map(|e| e.to_string())
  })

  TRY
    result <- self.resilience.execute(
      "create_review",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: POST,
          endpoint: build_repo_path(owner, repo, format("/pulls/{}/reviews", pull_number)),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(request),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        review <- parse_response::<Review>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        self.logger.info("Review created", {
          owner: owner.to_string(),
          repo: repo.to_string(),
          pull_number: pull_number,
          review_id: review.id,
          state: review.state.clone()
        })

        RETURN Ok(review)
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION

STRUCT CreateReviewRequest {
  commit_id: Option<String>,
  body: Option<String>,
  event: Option<ReviewEvent>,
  comments: Option<Vec<ReviewComment>>
}

STRUCT ReviewComment {
  path: String,
  position: Option<u32>,
  line: Option<u32>,
  side: Option<String>,
  start_line: Option<u32>,
  start_side: Option<String>,
  body: String
}
```

### 4.7 Review Requests Sub-Service

```
TRAIT ReviewRequestsService {
  ASYNC FUNCTION list(owner: &str, repo: &str, pull_number: u64) -> Result<ReviewRequests, GitHubError>
  ASYNC FUNCTION request(owner: &str, repo: &str, pull_number: u64, reviewers: Vec<String>, team_reviewers: Vec<String>) -> Result<PullRequest, GitHubError>
  ASYNC FUNCTION remove(owner: &str, repo: &str, pull_number: u64, reviewers: Vec<String>, team_reviewers: Vec<String>) -> Result<(), GitHubError>
}

ASYNC FUNCTION review_requests_service.request(
  owner: &str,
  repo: &str,
  pull_number: u64,
  reviewers: Vec<String>,
  team_reviewers: Vec<String>
) -> Result<PullRequest, GitHubError>

  span <- self.tracer.start_span("github.pull_requests.review_requests.request", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    pull_number: pull_number,
    reviewers_count: reviewers.len(),
    team_reviewers_count: team_reviewers.len()
  })

  TRY
    IF reviewers.is_empty() AND team_reviewers.is_empty() THEN
      RETURN Error(RequestError::ValidationError {
        message: "At least one reviewer or team reviewer is required".to_string(),
        errors: None,
        documentation_url: None
      })
    END IF

    result <- self.resilience.execute(
      "request_reviewers",
      RateLimitResource::Core,
      || async {
        request <- RequestReviewersRequest {
          reviewers: IF reviewers.is_empty() THEN None ELSE Some(reviewers) END IF,
          team_reviewers: IF team_reviewers.is_empty() THEN None ELSE Some(team_reviewers) END IF
        }

        http_request <- build_request(
          method: POST,
          endpoint: build_repo_path(owner, repo, format("/pulls/{}/requested_reviewers", pull_number)),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(request),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        pr <- parse_response::<PullRequest>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        self.logger.info("Review requested", {
          owner: owner.to_string(),
          repo: repo.to_string(),
          pull_number: pull_number
        })

        RETURN Ok(pr)
      }
    ).await

    span.set_status(SpanStatus::Ok)
    RETURN result

  CATCH e
    span.set_error(e.error_type())
    RETURN Error(e)
  FINALLY
    span.end()
  END TRY
END FUNCTION
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial pseudocode (Part 2) |

---

**Continued in Part 3: Git Data Service, Actions Service, Search Service**
