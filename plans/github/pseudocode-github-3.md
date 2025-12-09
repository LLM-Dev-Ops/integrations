# GitHub Integration Module - Pseudocode (Part 3)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/github`
**File:** 3 of 4 - Git Data, Actions, Search Services

---

## Table of Contents (Part 3)

1. [Git Data Service](#1-git-data-service)
2. [Actions Service](#2-actions-service)
3. [Search Service](#3-search-service)

---

## 1. Git Data Service

### 1.1 Git Data Service Interface

```
TRAIT GitDataService {
  // Blob operations
  FUNCTION blobs() -> &BlobsService

  // Tree operations
  FUNCTION trees() -> &TreesService

  // Commit operations
  FUNCTION commits() -> &GitCommitsService

  // Reference operations
  FUNCTION refs() -> &RefsService

  // Tag operations
  FUNCTION tags() -> &GitTagsService
}

STRUCT GitDataServiceImpl {
  transport: Arc<HttpTransport>,
  auth_manager: Arc<AuthManager>,
  resilience: Arc<ResilienceOrchestrator>,
  rate_limit_tracker: Arc<RateLimitTracker>,
  base_url: Url,
  api_version: String,
  user_agent: String,
  logger: Logger,
  tracer: Tracer,

  blobs_service: Option<BlobsServiceImpl>,
  trees_service: Option<TreesServiceImpl>,
  commits_service: Option<GitCommitsServiceImpl>,
  refs_service: Option<RefsServiceImpl>,
  tags_service: Option<GitTagsServiceImpl>
}
```

### 1.2 Blobs Service

```
TRAIT BlobsService {
  ASYNC FUNCTION get(owner: &str, repo: &str, sha: &str) -> Result<Blob, GitHubError>
  ASYNC FUNCTION create(owner: &str, repo: &str, content: String, encoding: BlobEncoding) -> Result<BlobReference, GitHubError>
}

ENUM BlobEncoding {
  Utf8,
  Base64
}

ASYNC FUNCTION blobs_service.get(
  owner: &str,
  repo: &str,
  sha: &str
) -> Result<Blob, GitHubError>

  span <- self.tracer.start_span("github.git.blobs.get", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    sha: sha.to_string()
  })

  TRY
    result <- self.resilience.execute(
      "get_blob",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: GET,
          endpoint: build_repo_path(owner, repo, format("/git/blobs/{}", sha)),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        blob <- parse_response::<Blob>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        RETURN Ok(blob)
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

ASYNC FUNCTION blobs_service.create(
  owner: &str,
  repo: &str,
  content: String,
  encoding: BlobEncoding
) -> Result<BlobReference, GitHubError>

  span <- self.tracer.start_span("github.git.blobs.create", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    encoding: encoding.to_string()
  })

  TRY
    result <- self.resilience.execute(
      "create_blob",
      RateLimitResource::Core,
      || async {
        request_body <- CreateBlobRequest {
          content: content,
          encoding: encoding.to_string()
        }

        http_request <- build_request(
          method: POST,
          endpoint: build_repo_path(owner, repo, "/git/blobs"),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(request_body),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        blob_ref <- parse_response::<BlobReference>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        self.logger.info("Blob created", {
          owner: owner.to_string(),
          repo: repo.to_string(),
          sha: blob_ref.sha.clone()
        })

        RETURN Ok(blob_ref)
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

STRUCT Blob {
  sha: String,
  node_id: String,
  size: u64,
  url: String,
  content: Option<String>,
  encoding: String
}

STRUCT BlobReference {
  sha: String,
  url: String
}
```

### 1.3 Trees Service

```
TRAIT TreesService {
  ASYNC FUNCTION get(owner: &str, repo: &str, sha: &str, recursive: bool) -> Result<Tree, GitHubError>
  ASYNC FUNCTION create(owner: &str, repo: &str, request: CreateTreeRequest) -> Result<Tree, GitHubError>
}

ASYNC FUNCTION trees_service.get(
  owner: &str,
  repo: &str,
  sha: &str,
  recursive: bool
) -> Result<Tree, GitHubError>

  span <- self.tracer.start_span("github.git.trees.get", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    sha: sha.to_string(),
    recursive: recursive
  })

  TRY
    query_params <- HashMap::new()
    IF recursive THEN
      query_params.insert("recursive", "1")
    END IF

    result <- self.resilience.execute(
      "get_tree",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: GET,
          endpoint: build_repo_path(owner, repo, format("/git/trees/{}", sha)),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: IF query_params.is_empty() THEN None ELSE Some(query_params) END IF
        )?

        response <- self.transport.send(http_request).await?
        tree <- parse_response::<Tree>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        RETURN Ok(tree)
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

ASYNC FUNCTION trees_service.create(
  owner: &str,
  repo: &str,
  request: CreateTreeRequest
) -> Result<Tree, GitHubError>

  span <- self.tracer.start_span("github.git.trees.create", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    entries_count: request.tree.len()
  })

  TRY
    IF request.tree.is_empty() THEN
      RETURN Error(RequestError::ValidationError {
        message: "Tree must have at least one entry".to_string(),
        errors: None,
        documentation_url: None
      })
    END IF

    result <- self.resilience.execute(
      "create_tree",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: POST,
          endpoint: build_repo_path(owner, repo, "/git/trees"),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(request),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        tree <- parse_response::<Tree>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        self.logger.info("Tree created", {
          owner: owner.to_string(),
          repo: repo.to_string(),
          sha: tree.sha.clone()
        })

        RETURN Ok(tree)
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

STRUCT Tree {
  sha: String,
  url: String,
  tree: Vec<TreeEntry>,
  truncated: bool
}

STRUCT TreeEntry {
  path: String,
  mode: String,
  type_: String,
  sha: Option<String>,
  size: Option<u64>,
  url: Option<String>
}

STRUCT CreateTreeRequest {
  tree: Vec<CreateTreeEntry>,
  base_tree: Option<String>
}

STRUCT CreateTreeEntry {
  path: String,
  mode: TreeMode,
  type_: TreeEntryType,
  sha: Option<String>,
  content: Option<String>
}

ENUM TreeMode {
  File,           // 100644
  Executable,     // 100755
  Subdirectory,   // 040000
  Submodule,      // 160000
  Symlink         // 120000
}

FUNCTION TreeMode.to_string() -> String
  MATCH self
    CASE TreeMode::File: RETURN "100644"
    CASE TreeMode::Executable: RETURN "100755"
    CASE TreeMode::Subdirectory: RETURN "040000"
    CASE TreeMode::Submodule: RETURN "160000"
    CASE TreeMode::Symlink: RETURN "120000"
  END MATCH
END FUNCTION
```

### 1.4 Git Commits Service

```
TRAIT GitCommitsService {
  ASYNC FUNCTION get(owner: &str, repo: &str, sha: &str) -> Result<GitCommit, GitHubError>
  ASYNC FUNCTION create(owner: &str, repo: &str, request: CreateCommitRequest) -> Result<GitCommit, GitHubError>
  ASYNC FUNCTION list(owner: &str, repo: &str, params: Option<ListCommitsParams>) -> Result<Paginated<Commit>, GitHubError>
  ASYNC FUNCTION compare(owner: &str, repo: &str, base: &str, head: &str) -> Result<CommitComparison, GitHubError>
}

ASYNC FUNCTION commits_service.create(
  owner: &str,
  repo: &str,
  request: CreateCommitRequest
) -> Result<GitCommit, GitHubError>

  span <- self.tracer.start_span("github.git.commits.create", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    message: request.message.clone()
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

    IF request.tree.is_empty() THEN
      RETURN Error(RequestError::ValidationError {
        message: "Tree SHA is required".to_string(),
        errors: None,
        documentation_url: None
      })
    END IF

    result <- self.resilience.execute(
      "create_commit",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: POST,
          endpoint: build_repo_path(owner, repo, "/git/commits"),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(request),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        commit <- parse_response::<GitCommit>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        self.logger.info("Commit created", {
          owner: owner.to_string(),
          repo: repo.to_string(),
          sha: commit.sha.clone()
        })

        RETURN Ok(commit)
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

ASYNC FUNCTION commits_service.compare(
  owner: &str,
  repo: &str,
  base: &str,
  head: &str
) -> Result<CommitComparison, GitHubError>

  span <- self.tracer.start_span("github.git.commits.compare", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    base: base.to_string(),
    head: head.to_string()
  })

  TRY
    result <- self.resilience.execute(
      "compare_commits",
      RateLimitResource::Core,
      || async {
        // URL encode base and head as they might contain special chars
        encoded_basehead <- format("{}...{}", url_encode(base), url_encode(head))

        http_request <- build_request(
          method: GET,
          endpoint: build_repo_path(owner, repo, format("/compare/{}", encoded_basehead)),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        comparison <- parse_response::<CommitComparison>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        RETURN Ok(comparison)
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

STRUCT CreateCommitRequest {
  message: String,
  tree: String,
  parents: Vec<String>,
  author: Option<CommitAuthor>,
  committer: Option<CommitAuthor>,
  signature: Option<String>
}

STRUCT CommitAuthor {
  name: String,
  email: String,
  date: Option<String>
}

STRUCT GitCommit {
  sha: String,
  node_id: String,
  url: String,
  author: GitUser,
  committer: GitUser,
  message: String,
  tree: TreeReference,
  parents: Vec<ParentCommit>,
  verification: Option<Verification>
}

STRUCT CommitComparison {
  url: String,
  html_url: String,
  permalink_url: String,
  diff_url: String,
  patch_url: String,
  base_commit: Commit,
  merge_base_commit: Commit,
  status: String,  // "ahead", "behind", "diverged", "identical"
  ahead_by: u32,
  behind_by: u32,
  total_commits: u32,
  commits: Vec<Commit>,
  files: Vec<DiffFile>
}
```

### 1.5 References Service

```
TRAIT RefsService {
  ASYNC FUNCTION get(owner: &str, repo: &str, ref_: &str) -> Result<Reference, GitHubError>
  ASYNC FUNCTION list(owner: &str, repo: &str, namespace: Option<&str>) -> Result<Vec<Reference>, GitHubError>
  ASYNC FUNCTION create(owner: &str, repo: &str, ref_: &str, sha: &str) -> Result<Reference, GitHubError>
  ASYNC FUNCTION update(owner: &str, repo: &str, ref_: &str, sha: &str, force: bool) -> Result<Reference, GitHubError>
  ASYNC FUNCTION delete(owner: &str, repo: &str, ref_: &str) -> Result<(), GitHubError>
}

ASYNC FUNCTION refs_service.create(
  owner: &str,
  repo: &str,
  ref_: &str,
  sha: &str
) -> Result<Reference, GitHubError>

  span <- self.tracer.start_span("github.git.refs.create", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    ref: ref_.to_string()
  })

  TRY
    // Validate ref format
    IF NOT ref_.starts_with("refs/") THEN
      RETURN Error(RequestError::ValidationError {
        message: "Reference must start with 'refs/'".to_string(),
        errors: None,
        documentation_url: None
      })
    END IF

    result <- self.resilience.execute(
      "create_ref",
      RateLimitResource::Core,
      || async {
        request_body <- CreateRefRequest {
          ref_: ref_.to_string(),
          sha: sha.to_string()
        }

        http_request <- build_request(
          method: POST,
          endpoint: build_repo_path(owner, repo, "/git/refs"),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(request_body),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        reference <- parse_response::<Reference>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        self.logger.info("Reference created", {
          owner: owner.to_string(),
          repo: repo.to_string(),
          ref: reference.ref_.clone(),
          sha: reference.object.sha.clone()
        })

        RETURN Ok(reference)
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

ASYNC FUNCTION refs_service.update(
  owner: &str,
  repo: &str,
  ref_: &str,
  sha: &str,
  force: bool
) -> Result<Reference, GitHubError>

  span <- self.tracer.start_span("github.git.refs.update", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    ref: ref_.to_string(),
    force: force
  })

  TRY
    result <- self.resilience.execute(
      "update_ref",
      RateLimitResource::Core,
      || async {
        request_body <- UpdateRefRequest {
          sha: sha.to_string(),
          force: force
        }

        // Remove refs/ prefix for the URL path
        ref_path <- IF ref_.starts_with("refs/") THEN
          ref_[5..]
        ELSE
          ref_
        END IF

        http_request <- build_request(
          method: PATCH,
          endpoint: build_repo_path(owner, repo, format("/git/refs/{}", ref_path)),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(request_body),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        reference <- parse_response::<Reference>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        self.logger.info("Reference updated", {
          owner: owner.to_string(),
          repo: repo.to_string(),
          ref: reference.ref_.clone(),
          sha: reference.object.sha.clone(),
          force: force
        })

        RETURN Ok(reference)
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

STRUCT Reference {
  ref_: String,
  node_id: String,
  url: String,
  object: GitObject
}

STRUCT GitObject {
  sha: String,
  type_: String,
  url: String
}
```

---

## 2. Actions Service

### 2.1 Actions Service Interface

```
TRAIT ActionsService {
  FUNCTION workflows() -> &WorkflowsService
  FUNCTION runs() -> &WorkflowRunsService
  FUNCTION jobs() -> &JobsService
  FUNCTION artifacts() -> &ArtifactsService
  FUNCTION secrets() -> &SecretsService
  FUNCTION variables() -> &VariablesService
}

STRUCT ActionsServiceImpl {
  transport: Arc<HttpTransport>,
  auth_manager: Arc<AuthManager>,
  resilience: Arc<ResilienceOrchestrator>,
  rate_limit_tracker: Arc<RateLimitTracker>,
  base_url: Url,
  api_version: String,
  user_agent: String,
  logger: Logger,
  tracer: Tracer,

  workflows_service: Option<WorkflowsServiceImpl>,
  runs_service: Option<WorkflowRunsServiceImpl>,
  jobs_service: Option<JobsServiceImpl>,
  artifacts_service: Option<ArtifactsServiceImpl>,
  secrets_service: Option<SecretsServiceImpl>,
  variables_service: Option<VariablesServiceImpl>
}
```

### 2.2 Workflows Service

```
TRAIT WorkflowsService {
  ASYNC FUNCTION list(owner: &str, repo: &str) -> Result<WorkflowList, GitHubError>
  ASYNC FUNCTION get(owner: &str, repo: &str, workflow_id: WorkflowId) -> Result<Workflow, GitHubError>
  ASYNC FUNCTION dispatch(owner: &str, repo: &str, workflow_id: WorkflowId, request: WorkflowDispatchRequest) -> Result<(), GitHubError>
  ASYNC FUNCTION enable(owner: &str, repo: &str, workflow_id: WorkflowId) -> Result<(), GitHubError>
  ASYNC FUNCTION disable(owner: &str, repo: &str, workflow_id: WorkflowId) -> Result<(), GitHubError>
}

ENUM WorkflowId {
  Id(u64),
  FileName(String)
}

FUNCTION WorkflowId.to_path() -> String
  MATCH self
    CASE WorkflowId::Id(id): RETURN id.to_string()
    CASE WorkflowId::FileName(name): RETURN url_encode(name)
  END MATCH
END FUNCTION

ASYNC FUNCTION workflows_service.list(
  owner: &str,
  repo: &str
) -> Result<WorkflowList, GitHubError>

  span <- self.tracer.start_span("github.actions.workflows.list", {
    owner: owner.to_string(),
    repo: repo.to_string()
  })

  TRY
    result <- self.resilience.execute(
      "list_workflows",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: GET,
          endpoint: build_repo_path(owner, repo, "/actions/workflows"),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        workflow_list <- parse_response::<WorkflowList>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        RETURN Ok(workflow_list)
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

ASYNC FUNCTION workflows_service.dispatch(
  owner: &str,
  repo: &str,
  workflow_id: WorkflowId,
  request: WorkflowDispatchRequest
) -> Result<(), GitHubError>

  span <- self.tracer.start_span("github.actions.workflows.dispatch", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    workflow_id: workflow_id.to_path(),
    ref: request.ref_.clone()
  })

  TRY
    // Validate request
    IF request.ref_.is_empty() THEN
      RETURN Error(RequestError::ValidationError {
        message: "Reference (branch/tag) is required for workflow dispatch".to_string(),
        errors: None,
        documentation_url: None
      })
    END IF

    result <- self.resilience.execute(
      "dispatch_workflow",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: POST,
          endpoint: build_repo_path(owner, repo, format("/actions/workflows/{}/dispatches", workflow_id.to_path())),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(request),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?

        IF response.status != 204 THEN
          RETURN Error(parse_error_response(response.status, response.body, response.headers))
        END IF

        self.logger.info("Workflow dispatched", {
          owner: owner.to_string(),
          repo: repo.to_string(),
          workflow_id: workflow_id.to_path()
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

STRUCT Workflow {
  id: u64,
  node_id: String,
  name: String,
  path: String,
  state: WorkflowState,
  created_at: String,
  updated_at: String,
  url: String,
  html_url: String,
  badge_url: String
}

ENUM WorkflowState {
  Active,
  Deleted,
  DisabledFork,
  DisabledInactivity,
  DisabledManually
}

STRUCT WorkflowList {
  total_count: u32,
  workflows: Vec<Workflow>
}

STRUCT WorkflowDispatchRequest {
  ref_: String,
  inputs: Option<HashMap<String, String>>
}
```

### 2.3 Workflow Runs Service

```
TRAIT WorkflowRunsService {
  ASYNC FUNCTION list(owner: &str, repo: &str, params: Option<ListWorkflowRunsParams>) -> Result<WorkflowRunList, GitHubError>
  ASYNC FUNCTION list_for_workflow(owner: &str, repo: &str, workflow_id: WorkflowId, params: Option<ListWorkflowRunsParams>) -> Result<WorkflowRunList, GitHubError>
  ASYNC FUNCTION get(owner: &str, repo: &str, run_id: u64) -> Result<WorkflowRun, GitHubError>
  ASYNC FUNCTION rerun(owner: &str, repo: &str, run_id: u64) -> Result<(), GitHubError>
  ASYNC FUNCTION rerun_failed_jobs(owner: &str, repo: &str, run_id: u64) -> Result<(), GitHubError>
  ASYNC FUNCTION cancel(owner: &str, repo: &str, run_id: u64) -> Result<(), GitHubError>
  ASYNC FUNCTION delete(owner: &str, repo: &str, run_id: u64) -> Result<(), GitHubError>
  ASYNC FUNCTION download_logs(owner: &str, repo: &str, run_id: u64) -> Result<Bytes, GitHubError>
  ASYNC FUNCTION delete_logs(owner: &str, repo: &str, run_id: u64) -> Result<(), GitHubError>
}

ASYNC FUNCTION runs_service.list(
  owner: &str,
  repo: &str,
  params: Option<ListWorkflowRunsParams>
) -> Result<WorkflowRunList, GitHubError>

  span <- self.tracer.start_span("github.actions.runs.list", {
    owner: owner.to_string(),
    repo: repo.to_string()
  })

  TRY
    query_params <- HashMap::new()
    IF params IS Some THEN
      p <- params.unwrap()
      IF p.actor IS Some THEN
        query_params.insert("actor", p.actor.unwrap())
      END IF
      IF p.branch IS Some THEN
        query_params.insert("branch", p.branch.unwrap())
      END IF
      IF p.event IS Some THEN
        query_params.insert("event", p.event.unwrap())
      END IF
      IF p.status IS Some THEN
        query_params.insert("status", p.status.unwrap().to_string())
      END IF
      IF p.created IS Some THEN
        query_params.insert("created", p.created.unwrap())
      END IF
      IF p.exclude_pull_requests IS Some THEN
        query_params.insert("exclude_pull_requests", p.exclude_pull_requests.unwrap().to_string())
      END IF
      IF p.per_page IS Some THEN
        query_params.insert("per_page", p.per_page.unwrap().to_string())
      END IF
      IF p.page IS Some THEN
        query_params.insert("page", p.page.unwrap().to_string())
      END IF
    END IF

    result <- self.resilience.execute(
      "list_workflow_runs",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: GET,
          endpoint: build_repo_path(owner, repo, "/actions/runs"),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: IF query_params.is_empty() THEN None ELSE Some(query_params) END IF
        )?

        response <- self.transport.send(http_request).await?
        run_list <- parse_response::<WorkflowRunList>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        RETURN Ok(run_list)
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

ASYNC FUNCTION runs_service.cancel(
  owner: &str,
  repo: &str,
  run_id: u64
) -> Result<(), GitHubError>

  span <- self.tracer.start_span("github.actions.runs.cancel", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    run_id: run_id
  })

  TRY
    result <- self.resilience.execute(
      "cancel_workflow_run",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: POST,
          endpoint: build_repo_path(owner, repo, format("/actions/runs/{}/cancel", run_id)),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?

        IF response.status != 202 THEN
          RETURN Error(parse_error_response(response.status, response.body, response.headers))
        END IF

        self.logger.info("Workflow run cancelled", {
          owner: owner.to_string(),
          repo: repo.to_string(),
          run_id: run_id
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

ASYNC FUNCTION runs_service.download_logs(
  owner: &str,
  repo: &str,
  run_id: u64
) -> Result<Bytes, GitHubError>

  span <- self.tracer.start_span("github.actions.runs.download_logs", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    run_id: run_id
  })

  TRY
    result <- self.resilience.execute(
      "download_workflow_logs",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: GET,
          endpoint: build_repo_path(owner, repo, format("/actions/runs/{}/logs", run_id)),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        // This returns a redirect to the actual log file
        // The transport should follow redirects
        bytes <- self.transport.send_raw(http_request).await?

        self.logger.info("Workflow logs downloaded", {
          owner: owner.to_string(),
          repo: repo.to_string(),
          run_id: run_id,
          size_bytes: bytes.len()
        })

        RETURN Ok(bytes)
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

STRUCT WorkflowRun {
  id: u64,
  name: Option<String>,
  node_id: String,
  head_branch: Option<String>,
  head_sha: String,
  run_number: u32,
  run_attempt: Option<u32>,
  event: String,
  status: WorkflowRunStatus,
  conclusion: Option<WorkflowRunConclusion>,
  workflow_id: u64,
  url: String,
  html_url: String,
  created_at: String,
  updated_at: String,
  run_started_at: Option<String>,
  jobs_url: String,
  logs_url: String,
  artifacts_url: String,
  cancel_url: String,
  rerun_url: String
}

ENUM WorkflowRunStatus {
  Queued,
  InProgress,
  Completed,
  Waiting,
  Requested,
  Pending
}

ENUM WorkflowRunConclusion {
  Success,
  Failure,
  Cancelled,
  Skipped,
  TimedOut,
  ActionRequired,
  Neutral,
  Stale,
  StartupFailure
}

STRUCT WorkflowRunList {
  total_count: u32,
  workflow_runs: Vec<WorkflowRun>
}
```

### 2.4 Secrets Service

```
TRAIT SecretsService {
  ASYNC FUNCTION get_public_key(owner: &str, repo: &str) -> Result<PublicKey, GitHubError>
  ASYNC FUNCTION list(owner: &str, repo: &str) -> Result<SecretList, GitHubError>
  ASYNC FUNCTION get(owner: &str, repo: &str, secret_name: &str) -> Result<Secret, GitHubError>
  ASYNC FUNCTION create_or_update(owner: &str, repo: &str, secret_name: &str, encrypted_value: String, key_id: String) -> Result<(), GitHubError>
  ASYNC FUNCTION delete(owner: &str, repo: &str, secret_name: &str) -> Result<(), GitHubError>
}

ASYNC FUNCTION secrets_service.get_public_key(
  owner: &str,
  repo: &str
) -> Result<PublicKey, GitHubError>

  span <- self.tracer.start_span("github.actions.secrets.get_public_key", {
    owner: owner.to_string(),
    repo: repo.to_string()
  })

  TRY
    result <- self.resilience.execute(
      "get_secrets_public_key",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: GET,
          endpoint: build_repo_path(owner, repo, "/actions/secrets/public-key"),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        public_key <- parse_response::<PublicKey>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        RETURN Ok(public_key)
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

ASYNC FUNCTION secrets_service.create_or_update(
  owner: &str,
  repo: &str,
  secret_name: &str,
  encrypted_value: String,
  key_id: String
) -> Result<(), GitHubError>

  span <- self.tracer.start_span("github.actions.secrets.create_or_update", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    secret_name: secret_name.to_string()
  })

  TRY
    // Validate secret name
    IF NOT is_valid_secret_name(secret_name) THEN
      RETURN Error(RequestError::ValidationError {
        message: "Secret name must contain only alphanumeric characters and underscores, and cannot start with GITHUB_".to_string(),
        errors: None,
        documentation_url: None
      })
    END IF

    result <- self.resilience.execute(
      "create_or_update_secret",
      RateLimitResource::Core,
      || async {
        request_body <- CreateSecretRequest {
          encrypted_value: encrypted_value,
          key_id: key_id
        }

        http_request <- build_request(
          method: PUT,
          endpoint: build_repo_path(owner, repo, format("/actions/secrets/{}", url_encode(secret_name))),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(request_body),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?

        // 201 = created, 204 = updated
        IF response.status != 201 AND response.status != 204 THEN
          RETURN Error(parse_error_response(response.status, response.body, response.headers))
        END IF

        self.logger.info("Secret created/updated", {
          owner: owner.to_string(),
          repo: repo.to_string(),
          secret_name: secret_name.to_string()
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

FUNCTION is_valid_secret_name(name: &str) -> bool
  // Must not start with GITHUB_
  IF name.to_uppercase().starts_with("GITHUB_") THEN
    RETURN false
  END IF

  // Must contain only alphanumeric and underscores
  FOR EACH char IN name.chars() DO
    IF NOT (char.is_alphanumeric() OR char == '_') THEN
      RETURN false
    END IF
  END FOR

  // Must not start with a number
  IF name.chars().next().map(|c| c.is_numeric()).unwrap_or(true) THEN
    RETURN false
  END IF

  RETURN true
END FUNCTION

STRUCT PublicKey {
  key_id: String,
  key: String
}

STRUCT Secret {
  name: String,
  created_at: String,
  updated_at: String
}

STRUCT SecretList {
  total_count: u32,
  secrets: Vec<Secret>
}
```

### 2.5 Artifacts Service

```
TRAIT ArtifactsService {
  ASYNC FUNCTION list_for_repo(owner: &str, repo: &str, params: Option<ListArtifactsParams>) -> Result<ArtifactList, GitHubError>
  ASYNC FUNCTION list_for_run(owner: &str, repo: &str, run_id: u64) -> Result<ArtifactList, GitHubError>
  ASYNC FUNCTION get(owner: &str, repo: &str, artifact_id: u64) -> Result<Artifact, GitHubError>
  ASYNC FUNCTION download(owner: &str, repo: &str, artifact_id: u64) -> Result<Bytes, GitHubError>
  ASYNC FUNCTION delete(owner: &str, repo: &str, artifact_id: u64) -> Result<(), GitHubError>
}

ASYNC FUNCTION artifacts_service.download(
  owner: &str,
  repo: &str,
  artifact_id: u64
) -> Result<Bytes, GitHubError>

  span <- self.tracer.start_span("github.actions.artifacts.download", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    artifact_id: artifact_id
  })

  TRY
    result <- self.resilience.execute(
      "download_artifact",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: GET,
          endpoint: build_repo_path(owner, repo, format("/actions/artifacts/{}/zip", artifact_id)),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        // This returns a redirect to the actual artifact file
        bytes <- self.transport.send_raw(http_request).await?

        self.logger.info("Artifact downloaded", {
          owner: owner.to_string(),
          repo: repo.to_string(),
          artifact_id: artifact_id,
          size_bytes: bytes.len()
        })

        RETURN Ok(bytes)
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

STRUCT Artifact {
  id: u64,
  node_id: String,
  name: String,
  size_in_bytes: u64,
  url: String,
  archive_download_url: String,
  expired: bool,
  created_at: String,
  updated_at: String,
  expires_at: String
}

STRUCT ArtifactList {
  total_count: u32,
  artifacts: Vec<Artifact>
}
```

---

## 3. Search Service

### 3.1 Search Service Interface

```
TRAIT SearchService {
  ASYNC FUNCTION repositories(query: &str, params: Option<SearchParams>) -> Result<SearchResult<Repository>, GitHubError>
  ASYNC FUNCTION code(query: &str, params: Option<SearchCodeParams>) -> Result<SearchResult<CodeSearchResult>, GitHubError>
  ASYNC FUNCTION commits(query: &str, params: Option<SearchParams>) -> Result<SearchResult<CommitSearchResult>, GitHubError>
  ASYNC FUNCTION issues(query: &str, params: Option<SearchParams>) -> Result<SearchResult<Issue>, GitHubError>
  ASYNC FUNCTION users(query: &str, params: Option<SearchParams>) -> Result<SearchResult<User>, GitHubError>
  ASYNC FUNCTION topics(query: &str, params: Option<SearchParams>) -> Result<SearchResult<Topic>, GitHubError>
  ASYNC FUNCTION labels(repository_id: u64, query: &str, params: Option<SearchParams>) -> Result<SearchResult<Label>, GitHubError>
}

STRUCT SearchServiceImpl {
  transport: Arc<HttpTransport>,
  auth_manager: Arc<AuthManager>,
  resilience: Arc<ResilienceOrchestrator>,
  rate_limit_tracker: Arc<RateLimitTracker>,
  base_url: Url,
  api_version: String,
  user_agent: String,
  logger: Logger,
  tracer: Tracer
}
```

### 3.2 Search Repositories

```
ASYNC FUNCTION search_service.repositories(
  query: &str,
  params: Option<SearchParams>
) -> Result<SearchResult<Repository>, GitHubError>

  span <- self.tracer.start_span("github.search.repositories", {
    query: query.to_string()
  })

  TRY
    IF query.is_empty() THEN
      RETURN Error(RequestError::ValidationError {
        message: "Search query is required".to_string(),
        errors: None,
        documentation_url: None
      })
    END IF

    query_params <- HashMap::new()
    query_params.insert("q", query.to_string())

    IF params IS Some THEN
      p <- params.unwrap()
      IF p.sort IS Some THEN
        query_params.insert("sort", p.sort.unwrap())
      END IF
      IF p.order IS Some THEN
        query_params.insert("order", p.order.unwrap())
      END IF
      IF p.per_page IS Some THEN
        query_params.insert("per_page", p.per_page.unwrap().to_string())
      END IF
      IF p.page IS Some THEN
        query_params.insert("page", p.page.unwrap().to_string())
      END IF
    END IF

    // Note: Search API has separate rate limit (30 requests/minute)
    result <- self.resilience.execute(
      "search_repositories",
      RateLimitResource::Search,
      || async {
        http_request <- build_request(
          method: GET,
          endpoint: "/search/repositories",
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: Some(query_params)
        )?

        response <- self.transport.send(http_request).await?
        search_result <- parse_response::<SearchResult<Repository>>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        self.logger.debug("Repository search completed", {
          query: query.to_string(),
          total_count: search_result.total_count
        })

        RETURN Ok(search_result)
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

### 3.3 Search Code

```
ASYNC FUNCTION search_service.code(
  query: &str,
  params: Option<SearchCodeParams>
) -> Result<SearchResult<CodeSearchResult>, GitHubError>

  span <- self.tracer.start_span("github.search.code", {
    query: query.to_string()
  })

  TRY
    IF query.is_empty() THEN
      RETURN Error(RequestError::ValidationError {
        message: "Search query is required".to_string(),
        errors: None,
        documentation_url: None
      })
    END IF

    query_params <- HashMap::new()
    query_params.insert("q", query.to_string())

    IF params IS Some THEN
      p <- params.unwrap()
      IF p.sort IS Some THEN
        query_params.insert("sort", p.sort.unwrap())
      END IF
      IF p.order IS Some THEN
        query_params.insert("order", p.order.unwrap())
      END IF
      IF p.per_page IS Some THEN
        query_params.insert("per_page", p.per_page.unwrap().to_string())
      END IF
      IF p.page IS Some THEN
        query_params.insert("page", p.page.unwrap().to_string())
      END IF
    END IF

    result <- self.resilience.execute(
      "search_code",
      RateLimitResource::Search,
      || async {
        // Code search requires specific Accept header
        extra_headers <- HeaderMap::new()
        extra_headers.insert("Accept", "application/vnd.github.text-match+json")

        http_request <- build_request(
          method: GET,
          endpoint: "/search/code",
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: extra_headers,
          query_params: Some(query_params)
        )?

        response <- self.transport.send(http_request).await?
        search_result <- parse_response::<SearchResult<CodeSearchResult>>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        self.logger.debug("Code search completed", {
          query: query.to_string(),
          total_count: search_result.total_count
        })

        RETURN Ok(search_result)
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

### 3.4 Search Issues (includes PRs)

```
ASYNC FUNCTION search_service.issues(
  query: &str,
  params: Option<SearchParams>
) -> Result<SearchResult<Issue>, GitHubError>

  span <- self.tracer.start_span("github.search.issues", {
    query: query.to_string()
  })

  TRY
    IF query.is_empty() THEN
      RETURN Error(RequestError::ValidationError {
        message: "Search query is required".to_string(),
        errors: None,
        documentation_url: None
      })
    END IF

    query_params <- HashMap::new()
    query_params.insert("q", query.to_string())

    IF params IS Some THEN
      p <- params.unwrap()
      IF p.sort IS Some THEN
        query_params.insert("sort", p.sort.unwrap())
      END IF
      IF p.order IS Some THEN
        query_params.insert("order", p.order.unwrap())
      END IF
      IF p.per_page IS Some THEN
        query_params.insert("per_page", p.per_page.unwrap().to_string())
      END IF
      IF p.page IS Some THEN
        query_params.insert("page", p.page.unwrap().to_string())
      END IF
    END IF

    result <- self.resilience.execute(
      "search_issues",
      RateLimitResource::Search,
      || async {
        http_request <- build_request(
          method: GET,
          endpoint: "/search/issues",
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: Some(query_params)
        )?

        response <- self.transport.send(http_request).await?
        search_result <- parse_response::<SearchResult<Issue>>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        self.logger.debug("Issue search completed", {
          query: query.to_string(),
          total_count: search_result.total_count
        })

        RETURN Ok(search_result)
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

### 3.5 Search Types

```
STRUCT SearchResult<T> {
  total_count: u64,
  incomplete_results: bool,
  items: Vec<T>
}

STRUCT SearchParams {
  sort: Option<String>,
  order: Option<String>,  // "asc" or "desc"
  per_page: Option<u32>,
  page: Option<u32>
}

STRUCT SearchCodeParams {
  sort: Option<String>,  // "indexed" only
  order: Option<String>,
  per_page: Option<u32>,
  page: Option<u32>
}

STRUCT CodeSearchResult {
  name: String,
  path: String,
  sha: String,
  url: String,
  git_url: String,
  html_url: String,
  repository: Repository,
  score: f64,
  text_matches: Option<Vec<TextMatch>>
}

STRUCT TextMatch {
  object_url: String,
  object_type: String,
  property: String,
  fragment: String,
  matches: Vec<Match>
}

STRUCT Match {
  text: String,
  indices: Vec<u32>
}

STRUCT CommitSearchResult {
  url: String,
  sha: String,
  html_url: String,
  comments_url: String,
  commit: CommitDetail,
  author: Option<User>,
  committer: Option<User>,
  parents: Vec<ParentCommit>,
  repository: Repository,
  score: f64
}

STRUCT Topic {
  name: String,
  display_name: Option<String>,
  short_description: Option<String>,
  description: Option<String>,
  created_by: Option<String>,
  released: Option<String>,
  created_at: String,
  updated_at: String,
  featured: bool,
  curated: bool,
  score: f64
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial pseudocode (Part 3) |

---

**Continued in Part 4: Users, Organizations, Gists, Webhooks, GraphQL, Testing Patterns**
