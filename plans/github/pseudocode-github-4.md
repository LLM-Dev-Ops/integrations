# GitHub Integration Module - Pseudocode (Part 4)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/github`
**File:** 4 of 4 - Users, Organizations, Gists, Webhooks, GraphQL, Testing

---

## Table of Contents (Part 4)

1. [Users Service](#1-users-service)
2. [Organizations Service](#2-organizations-service)
3. [Gists Service](#3-gists-service)
4. [Webhooks Service](#4-webhooks-service)
5. [GraphQL Client](#5-graphql-client)
6. [Testing Patterns](#6-testing-patterns)
7. [Observability Patterns](#7-observability-patterns)

---

## 1. Users Service

### 1.1 Users Service Interface

```
TRAIT UsersService {
  // Authenticated user operations
  ASYNC FUNCTION get_authenticated() -> Result<User, GitHubError>
  ASYNC FUNCTION update_authenticated(request: UpdateUserRequest) -> Result<User, GitHubError>

  // User lookup
  ASYNC FUNCTION get(username: &str) -> Result<User, GitHubError>
  ASYNC FUNCTION list(params: Option<ListUsersParams>) -> Result<Paginated<User>, GitHubError>

  // Sub-services
  FUNCTION emails() -> &EmailsService
  FUNCTION ssh_keys() -> &SshKeysService
  FUNCTION gpg_keys() -> &GpgKeysService
  FUNCTION followers() -> &FollowersService
}

STRUCT UsersServiceImpl {
  transport: Arc<HttpTransport>,
  auth_manager: Arc<AuthManager>,
  resilience: Arc<ResilienceOrchestrator>,
  rate_limit_tracker: Arc<RateLimitTracker>,
  base_url: Url,
  api_version: String,
  user_agent: String,
  logger: Logger,
  tracer: Tracer,

  emails_service: Option<EmailsServiceImpl>,
  ssh_keys_service: Option<SshKeysServiceImpl>,
  gpg_keys_service: Option<GpgKeysServiceImpl>,
  followers_service: Option<FollowersServiceImpl>
}
```

### 1.2 Get Authenticated User

```
ASYNC FUNCTION users_service.get_authenticated() -> Result<User, GitHubError>
  span <- self.tracer.start_span("github.users.get_authenticated")

  TRY
    // Verify authentication is configured
    IF NOT self.auth_manager.is_authenticated() THEN
      RETURN Error(AuthenticationError::BadCredentials {
        message: "Authentication required for this endpoint".to_string()
      })
    END IF

    result <- self.resilience.execute(
      "get_authenticated_user",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: GET,
          endpoint: "/user",
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        user <- parse_response::<User>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        RETURN Ok(user)
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

### 1.3 Get User by Username

```
ASYNC FUNCTION users_service.get(username: &str) -> Result<User, GitHubError>
  span <- self.tracer.start_span("github.users.get", {
    username: username.to_string()
  })

  TRY
    IF username.is_empty() THEN
      RETURN Error(RequestError::ValidationError {
        message: "Username is required".to_string(),
        errors: None,
        documentation_url: None
      })
    END IF

    result <- self.resilience.execute(
      "get_user",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: GET,
          endpoint: build_user_path(username, ""),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        user <- parse_response::<User>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        RETURN Ok(user)
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

### 1.4 Emails Sub-Service

```
TRAIT EmailsService {
  ASYNC FUNCTION list() -> Result<Vec<Email>, GitHubError>
  ASYNC FUNCTION add(emails: Vec<String>) -> Result<Vec<Email>, GitHubError>
  ASYNC FUNCTION delete(emails: Vec<String>) -> Result<(), GitHubError>
  ASYNC FUNCTION set_visibility(visibility: EmailVisibility) -> Result<Vec<Email>, GitHubError>
}

ASYNC FUNCTION emails_service.list() -> Result<Vec<Email>, GitHubError>
  span <- self.tracer.start_span("github.users.emails.list")

  TRY
    result <- self.resilience.execute(
      "list_emails",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: GET,
          endpoint: "/user/emails",
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        emails <- parse_response::<Vec<Email>>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        RETURN Ok(emails)
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

STRUCT Email {
  email: String,
  primary: bool,
  verified: bool,
  visibility: Option<String>
}

ENUM EmailVisibility {
  Public,
  Private
}
```

### 1.5 Followers Sub-Service

```
TRAIT FollowersService {
  ASYNC FUNCTION list_followers(username: Option<&str>) -> Result<Paginated<User>, GitHubError>
  ASYNC FUNCTION list_following(username: Option<&str>) -> Result<Paginated<User>, GitHubError>
  ASYNC FUNCTION is_following(username: &str) -> Result<bool, GitHubError>
  ASYNC FUNCTION follow(username: &str) -> Result<(), GitHubError>
  ASYNC FUNCTION unfollow(username: &str) -> Result<(), GitHubError>
}

ASYNC FUNCTION followers_service.follow(username: &str) -> Result<(), GitHubError>
  span <- self.tracer.start_span("github.users.followers.follow", {
    username: username.to_string()
  })

  TRY
    result <- self.resilience.execute(
      "follow_user",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: PUT,
          endpoint: format("/user/following/{}", url_encode(username)),
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

        self.logger.info("User followed", {
          username: username.to_string()
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

---

## 2. Organizations Service

### 2.1 Organizations Service Interface

```
TRAIT OrganizationsService {
  // Organization operations
  ASYNC FUNCTION list_for_user(username: Option<&str>) -> Result<Paginated<Organization>, GitHubError>
  ASYNC FUNCTION get(org: &str) -> Result<Organization, GitHubError>
  ASYNC FUNCTION update(org: &str, request: UpdateOrganizationRequest) -> Result<Organization, GitHubError>

  // Sub-services
  FUNCTION members() -> &MembersService
  FUNCTION teams() -> &TeamsService
}

STRUCT OrganizationsServiceImpl {
  transport: Arc<HttpTransport>,
  auth_manager: Arc<AuthManager>,
  resilience: Arc<ResilienceOrchestrator>,
  rate_limit_tracker: Arc<RateLimitTracker>,
  base_url: Url,
  api_version: String,
  user_agent: String,
  logger: Logger,
  tracer: Tracer,

  members_service: Option<MembersServiceImpl>,
  teams_service: Option<TeamsServiceImpl>
}
```

### 2.2 Get Organization

```
ASYNC FUNCTION organizations_service.get(org: &str) -> Result<Organization, GitHubError>
  span <- self.tracer.start_span("github.organizations.get", {
    org: org.to_string()
  })

  TRY
    result <- self.resilience.execute(
      "get_organization",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: GET,
          endpoint: build_org_path(org, ""),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: None,
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        organization <- parse_response::<Organization>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        RETURN Ok(organization)
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

STRUCT Organization {
  login: String,
  id: u64,
  node_id: String,
  url: String,
  repos_url: String,
  events_url: String,
  hooks_url: String,
  issues_url: String,
  members_url: String,
  public_members_url: String,
  avatar_url: String,
  description: Option<String>,
  name: Option<String>,
  company: Option<String>,
  blog: Option<String>,
  location: Option<String>,
  email: Option<String>,
  twitter_username: Option<String>,
  is_verified: bool,
  has_organization_projects: bool,
  has_repository_projects: bool,
  public_repos: u32,
  public_gists: u32,
  followers: u32,
  following: u32,
  html_url: String,
  created_at: String,
  updated_at: String,
  type_: String
}
```

### 2.3 Teams Sub-Service

```
TRAIT TeamsService {
  ASYNC FUNCTION list(org: &str) -> Result<Paginated<Team>, GitHubError>
  ASYNC FUNCTION get(org: &str, team_slug: &str) -> Result<Team, GitHubError>
  ASYNC FUNCTION create(org: &str, request: CreateTeamRequest) -> Result<Team, GitHubError>
  ASYNC FUNCTION update(org: &str, team_slug: &str, request: UpdateTeamRequest) -> Result<Team, GitHubError>
  ASYNC FUNCTION delete(org: &str, team_slug: &str) -> Result<(), GitHubError>
  ASYNC FUNCTION list_members(org: &str, team_slug: &str) -> Result<Paginated<User>, GitHubError>
  ASYNC FUNCTION add_member(org: &str, team_slug: &str, username: &str, role: TeamRole) -> Result<TeamMembership, GitHubError>
  ASYNC FUNCTION remove_member(org: &str, team_slug: &str, username: &str) -> Result<(), GitHubError>
  ASYNC FUNCTION list_repos(org: &str, team_slug: &str) -> Result<Paginated<Repository>, GitHubError>
  ASYNC FUNCTION add_repo(org: &str, team_slug: &str, owner: &str, repo: &str, permission: TeamPermission) -> Result<(), GitHubError>
  ASYNC FUNCTION remove_repo(org: &str, team_slug: &str, owner: &str, repo: &str) -> Result<(), GitHubError>
}

ASYNC FUNCTION teams_service.create(
  org: &str,
  request: CreateTeamRequest
) -> Result<Team, GitHubError>

  span <- self.tracer.start_span("github.organizations.teams.create", {
    org: org.to_string(),
    name: request.name.clone()
  })

  TRY
    IF request.name.is_empty() THEN
      RETURN Error(RequestError::ValidationError {
        message: "Team name is required".to_string(),
        errors: None,
        documentation_url: None
      })
    END IF

    result <- self.resilience.execute(
      "create_team",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: POST,
          endpoint: build_org_path(org, "/teams"),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(request),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        team <- parse_response::<Team>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        self.logger.info("Team created", {
          org: org.to_string(),
          team_slug: team.slug.clone(),
          team_id: team.id
        })

        RETURN Ok(team)
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

STRUCT Team {
  id: u64,
  node_id: String,
  url: String,
  html_url: String,
  name: String,
  slug: String,
  description: Option<String>,
  privacy: TeamPrivacy,
  permission: String,
  members_url: String,
  repositories_url: String,
  parent: Option<Box<Team>>
}

ENUM TeamPrivacy {
  Secret,
  Closed
}

ENUM TeamRole {
  Member,
  Maintainer
}

ENUM TeamPermission {
  Pull,
  Triage,
  Push,
  Maintain,
  Admin
}

STRUCT CreateTeamRequest {
  name: String,
  description: Option<String>,
  maintainers: Option<Vec<String>>,
  repo_names: Option<Vec<String>>,
  privacy: Option<TeamPrivacy>,
  permission: Option<TeamPermission>,
  parent_team_id: Option<u64>
}
```

---

## 3. Gists Service

### 3.1 Gists Service Interface

```
TRAIT GistsService {
  ASYNC FUNCTION list(params: Option<ListGistsParams>) -> Result<Paginated<Gist>, GitHubError>
  ASYNC FUNCTION list_public(params: Option<ListGistsParams>) -> Result<Paginated<Gist>, GitHubError>
  ASYNC FUNCTION list_starred(params: Option<ListGistsParams>) -> Result<Paginated<Gist>, GitHubError>
  ASYNC FUNCTION get(gist_id: &str) -> Result<Gist, GitHubError>
  ASYNC FUNCTION create(request: CreateGistRequest) -> Result<Gist, GitHubError>
  ASYNC FUNCTION update(gist_id: &str, request: UpdateGistRequest) -> Result<Gist, GitHubError>
  ASYNC FUNCTION delete(gist_id: &str) -> Result<(), GitHubError>
  ASYNC FUNCTION star(gist_id: &str) -> Result<(), GitHubError>
  ASYNC FUNCTION unstar(gist_id: &str) -> Result<(), GitHubError>
  ASYNC FUNCTION is_starred(gist_id: &str) -> Result<bool, GitHubError>
  ASYNC FUNCTION fork(gist_id: &str) -> Result<Gist, GitHubError>
  ASYNC FUNCTION list_forks(gist_id: &str) -> Result<Paginated<GistFork>, GitHubError>

  FUNCTION comments() -> &GistCommentsService
}
```

### 3.2 Create Gist

```
ASYNC FUNCTION gists_service.create(
  request: CreateGistRequest
) -> Result<Gist, GitHubError>

  span <- self.tracer.start_span("github.gists.create", {
    files_count: request.files.len(),
    public: request.public.unwrap_or(false)
  })

  TRY
    // Validate request
    IF request.files.is_empty() THEN
      RETURN Error(RequestError::ValidationError {
        message: "At least one file is required".to_string(),
        errors: None,
        documentation_url: None
      })
    END IF

    FOR EACH (filename, file) IN request.files DO
      IF filename.is_empty() THEN
        RETURN Error(RequestError::ValidationError {
          message: "File name cannot be empty".to_string(),
          errors: None,
          documentation_url: None
        })
      END IF
      IF file.content.is_empty() THEN
        RETURN Error(RequestError::ValidationError {
          message: format("Content for file '{}' cannot be empty", filename),
          errors: None,
          documentation_url: None
        })
      END IF
    END FOR

    result <- self.resilience.execute(
      "create_gist",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: POST,
          endpoint: "/gists",
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(request),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        gist <- parse_response::<Gist>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        self.logger.info("Gist created", {
          gist_id: gist.id.clone(),
          public: gist.public,
          files_count: gist.files.len()
        })

        RETURN Ok(gist)
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

STRUCT Gist {
  id: String,
  url: String,
  forks_url: String,
  commits_url: String,
  node_id: String,
  git_pull_url: String,
  git_push_url: String,
  html_url: String,
  files: HashMap<String, GistFile>,
  public: bool,
  created_at: String,
  updated_at: String,
  description: Option<String>,
  comments: u32,
  user: Option<User>,
  owner: Option<User>,
  truncated: bool
}

STRUCT GistFile {
  filename: String,
  type_: String,
  language: Option<String>,
  raw_url: String,
  size: u64,
  truncated: bool,
  content: Option<String>
}

STRUCT CreateGistRequest {
  description: Option<String>,
  files: HashMap<String, GistFileInput>,
  public: Option<bool>
}

STRUCT GistFileInput {
  content: String
}
```

---

## 4. Webhooks Service

### 4.1 Webhooks Service Interface

```
TRAIT WebhooksService {
  // Repository webhooks
  ASYNC FUNCTION list_for_repo(owner: &str, repo: &str) -> Result<Paginated<Webhook>, GitHubError>
  ASYNC FUNCTION get_for_repo(owner: &str, repo: &str, hook_id: u64) -> Result<Webhook, GitHubError>
  ASYNC FUNCTION create_for_repo(owner: &str, repo: &str, request: CreateWebhookRequest) -> Result<Webhook, GitHubError>
  ASYNC FUNCTION update_for_repo(owner: &str, repo: &str, hook_id: u64, request: UpdateWebhookRequest) -> Result<Webhook, GitHubError>
  ASYNC FUNCTION delete_for_repo(owner: &str, repo: &str, hook_id: u64) -> Result<(), GitHubError>
  ASYNC FUNCTION ping_for_repo(owner: &str, repo: &str, hook_id: u64) -> Result<(), GitHubError>

  // Organization webhooks
  ASYNC FUNCTION list_for_org(org: &str) -> Result<Paginated<Webhook>, GitHubError>
  ASYNC FUNCTION create_for_org(org: &str, request: CreateWebhookRequest) -> Result<Webhook, GitHubError>

  // Webhook payload handling
  FUNCTION verify_signature(payload: &[u8], signature: &str, secret: &SecretString) -> Result<bool, GitHubError>
  FUNCTION parse_payload(event_type: &str, payload: &[u8]) -> Result<WebhookEvent, GitHubError>
}
```

### 4.2 Create Repository Webhook

```
ASYNC FUNCTION webhooks_service.create_for_repo(
  owner: &str,
  repo: &str,
  request: CreateWebhookRequest
) -> Result<Webhook, GitHubError>

  span <- self.tracer.start_span("github.webhooks.create_for_repo", {
    owner: owner.to_string(),
    repo: repo.to_string(),
    events: request.events.clone()
  })

  TRY
    // Validate request
    IF request.config.url.is_empty() THEN
      RETURN Error(RequestError::ValidationError {
        message: "Webhook URL is required".to_string(),
        errors: None,
        documentation_url: None
      })
    END IF

    // Validate URL format
    TRY
      url <- parse_url(request.config.url)?
      IF url.scheme() != "https" THEN
        RETURN Error(RequestError::ValidationError {
          message: "Webhook URL must use HTTPS".to_string(),
          errors: None,
          documentation_url: None
        })
      END IF
    CATCH
      RETURN Error(RequestError::ValidationError {
        message: "Invalid webhook URL format".to_string(),
        errors: None,
        documentation_url: None
      })
    END TRY

    result <- self.resilience.execute(
      "create_repo_webhook",
      RateLimitResource::Core,
      || async {
        http_request <- build_request(
          method: POST,
          endpoint: build_repo_path(owner, repo, "/hooks"),
          base_url: self.base_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(request),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?
        webhook <- parse_response::<Webhook>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        self.logger.info("Repository webhook created", {
          owner: owner.to_string(),
          repo: repo.to_string(),
          hook_id: webhook.id,
          events: webhook.events.clone()
        })

        RETURN Ok(webhook)
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

STRUCT Webhook {
  id: u64,
  type_: String,
  name: String,
  active: bool,
  events: Vec<String>,
  config: WebhookConfig,
  updated_at: String,
  created_at: String,
  url: String,
  test_url: String,
  ping_url: String,
  deliveries_url: Option<String>,
  last_response: Option<WebhookLastResponse>
}

STRUCT WebhookConfig {
  url: String,
  content_type: Option<String>,
  secret: Option<String>,
  insecure_ssl: Option<String>
}

STRUCT CreateWebhookRequest {
  name: Option<String>,  // Always "web" for GitHub webhooks
  config: WebhookConfigInput,
  events: Vec<String>,
  active: Option<bool>
}

STRUCT WebhookConfigInput {
  url: String,
  content_type: Option<String>,  // "json" or "form"
  secret: Option<String>,
  insecure_ssl: Option<String>
}
```

### 4.3 Webhook Signature Verification

```
FUNCTION webhooks_service.verify_signature(
  payload: &[u8],
  signature: &str,
  secret: &SecretString
) -> Result<bool, GitHubError>

  // GitHub provides two signature headers:
  // X-Hub-Signature: sha1=<hex>
  // X-Hub-Signature-256: sha256=<hex>
  // We prefer SHA-256

  // Parse signature format
  IF signature.starts_with("sha256=") THEN
    expected_signature <- signature[7..]
    algorithm <- "sha256"
  ELSE IF signature.starts_with("sha1=") THEN
    expected_signature <- signature[5..]
    algorithm <- "sha1"
    self.logger.warn("Using deprecated SHA-1 signature verification")
  ELSE
    RETURN Error(WebhookError::InvalidSignature {
      message: "Unknown signature format".to_string()
    })
  END IF

  // Compute HMAC
  computed_signature <- MATCH algorithm
    CASE "sha256":
      compute_hmac_sha256(secret.expose_secret().as_bytes(), payload)
    CASE "sha1":
      compute_hmac_sha1(secret.expose_secret().as_bytes(), payload)
    CASE _:
      RETURN Error(WebhookError::InvalidSignature {
        message: format("Unsupported algorithm: {}", algorithm)
      })
  END MATCH

  // Convert to hex
  computed_hex <- hex_encode(computed_signature)

  // Constant-time comparison to prevent timing attacks
  is_valid <- constant_time_compare(computed_hex.as_bytes(), expected_signature.as_bytes())

  IF NOT is_valid THEN
    self.logger.warn("Webhook signature verification failed")
  END IF

  RETURN Ok(is_valid)
END FUNCTION

FUNCTION compute_hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8>
  // Use ring or similar crypto library
  hmac_key <- hmac::Key::new(hmac::HMAC_SHA256, key)
  signature <- hmac::sign(hmac_key, data)
  RETURN signature.as_ref().to_vec()
END FUNCTION

FUNCTION constant_time_compare(a: &[u8], b: &[u8]) -> bool
  IF a.len() != b.len() THEN
    RETURN false
  END IF

  result <- 0u8
  FOR i IN 0..a.len() DO
    result <- result | (a[i] ^ b[i])
  END FOR

  RETURN result == 0
END FUNCTION
```

### 4.4 Webhook Payload Parsing

```
FUNCTION webhooks_service.parse_payload(
  event_type: &str,
  payload: &[u8]
) -> Result<WebhookEvent, GitHubError>

  TRY
    json_value <- deserialize_json::<serde_json::Value>(payload)?

    event <- MATCH event_type
      CASE "push":
        WebhookEvent::Push(deserialize_json::<PushEvent>(payload)?)

      CASE "pull_request":
        WebhookEvent::PullRequest(deserialize_json::<PullRequestEvent>(payload)?)

      CASE "issues":
        WebhookEvent::Issues(deserialize_json::<IssuesEvent>(payload)?)

      CASE "issue_comment":
        WebhookEvent::IssueComment(deserialize_json::<IssueCommentEvent>(payload)?)

      CASE "create":
        WebhookEvent::Create(deserialize_json::<CreateEvent>(payload)?)

      CASE "delete":
        WebhookEvent::Delete(deserialize_json::<DeleteEvent>(payload)?)

      CASE "release":
        WebhookEvent::Release(deserialize_json::<ReleaseEvent>(payload)?)

      CASE "workflow_run":
        WebhookEvent::WorkflowRun(deserialize_json::<WorkflowRunEvent>(payload)?)

      CASE "workflow_job":
        WebhookEvent::WorkflowJob(deserialize_json::<WorkflowJobEvent>(payload)?)

      CASE "check_run":
        WebhookEvent::CheckRun(deserialize_json::<CheckRunEvent>(payload)?)

      CASE "check_suite":
        WebhookEvent::CheckSuite(deserialize_json::<CheckSuiteEvent>(payload)?)

      CASE "deployment":
        WebhookEvent::Deployment(deserialize_json::<DeploymentEvent>(payload)?)

      CASE "deployment_status":
        WebhookEvent::DeploymentStatus(deserialize_json::<DeploymentStatusEvent>(payload)?)

      CASE "repository":
        WebhookEvent::Repository(deserialize_json::<RepositoryEvent>(payload)?)

      CASE "member":
        WebhookEvent::Member(deserialize_json::<MemberEvent>(payload)?)

      CASE "team":
        WebhookEvent::Team(deserialize_json::<TeamEvent>(payload)?)

      CASE "organization":
        WebhookEvent::Organization(deserialize_json::<OrganizationEvent>(payload)?)

      CASE "ping":
        WebhookEvent::Ping(deserialize_json::<PingEvent>(payload)?)

      CASE _:
        WebhookEvent::Unknown {
          event_type: event_type.to_string(),
          payload: json_value
        }
    END MATCH

    RETURN Ok(event)

  CATCH DeserializeError AS e
    RETURN Error(WebhookError::PayloadParseError {
      message: e.to_string(),
      event_type: event_type.to_string()
    })
  END TRY
END FUNCTION

ENUM WebhookEvent {
  Push(PushEvent),
  PullRequest(PullRequestEvent),
  Issues(IssuesEvent),
  IssueComment(IssueCommentEvent),
  Create(CreateEvent),
  Delete(DeleteEvent),
  Release(ReleaseEvent),
  WorkflowRun(WorkflowRunEvent),
  WorkflowJob(WorkflowJobEvent),
  CheckRun(CheckRunEvent),
  CheckSuite(CheckSuiteEvent),
  Deployment(DeploymentEvent),
  DeploymentStatus(DeploymentStatusEvent),
  Repository(RepositoryEvent),
  Member(MemberEvent),
  Team(TeamEvent),
  Organization(OrganizationEvent),
  Ping(PingEvent),
  Unknown { event_type: String, payload: serde_json::Value }
}

STRUCT PushEvent {
  ref_: String,
  before: String,
  after: String,
  created: bool,
  deleted: bool,
  forced: bool,
  base_ref: Option<String>,
  compare: String,
  commits: Vec<PushCommit>,
  head_commit: Option<PushCommit>,
  repository: Repository,
  pusher: Pusher,
  sender: User
}

STRUCT PullRequestEvent {
  action: String,  // opened, closed, reopened, synchronize, etc.
  number: u64,
  pull_request: PullRequest,
  repository: Repository,
  sender: User,
  installation: Option<Installation>
}
```

---

## 5. GraphQL Client

### 5.1 GraphQL Interface

```
TRAIT GraphQLClient {
  ASYNC FUNCTION query<Q: GraphQLQuery>(query: Q) -> Result<Q::Response, GitHubError>
  ASYNC FUNCTION query_raw(query: String, variables: Option<serde_json::Value>) -> Result<serde_json::Value, GitHubError>
}

STRUCT GraphQLClientImpl {
  transport: Arc<HttpTransport>,
  auth_manager: Arc<AuthManager>,
  resilience: Arc<ResilienceOrchestrator>,
  rate_limit_tracker: Arc<RateLimitTracker>,
  graphql_url: Url,
  api_version: String,
  user_agent: String,
  logger: Logger,
  tracer: Tracer
}
```

### 5.2 GraphQL Query Execution

```
ASYNC FUNCTION graphql_client.query<Q: GraphQLQuery>(
  query: Q
) -> Result<Q::Response, GitHubError>

  span <- self.tracer.start_span("github.graphql.query", {
    operation_name: Q::operation_name()
  })

  TRY
    result <- self.resilience.execute(
      "graphql_query",
      RateLimitResource::GraphQL,
      || async {
        // Build GraphQL request body
        request_body <- GraphQLRequest {
          query: Q::query_body(),
          variables: query.variables(),
          operation_name: Some(Q::operation_name().to_string())
        }

        http_request <- build_request(
          method: POST,
          endpoint: "",  // graphql_url is the full URL
          base_url: self.graphql_url,
          auth_manager: self.auth_manager,
          api_version: self.api_version,
          user_agent: self.user_agent,
          body: Some(request_body),
          extra_headers: HeaderMap::new(),
          query_params: None
        )?

        response <- self.transport.send(http_request).await?

        // Parse GraphQL response
        graphql_response <- parse_response::<GraphQLResponse<Q::ResponseData>>(
          response,
          self.rate_limit_tracker.clone(),
          self.logger.clone()
        )?

        // Check for GraphQL errors
        IF graphql_response.errors IS Some AND NOT graphql_response.errors.unwrap().is_empty() THEN
          errors <- graphql_response.errors.unwrap()
          first_error <- errors[0].clone()

          // Map GraphQL errors to appropriate error types
          IF first_error.type_ == Some("RATE_LIMITED") THEN
            RETURN Error(GitHubError::GraphQL(GraphQLError::RateLimitExceeded {
              message: first_error.message
            }))
          ELSE IF first_error.type_ == Some("MAX_NODE_LIMIT_EXCEEDED") THEN
            RETURN Error(GitHubError::GraphQL(GraphQLError::NodeLimitExceeded {
              message: first_error.message
            }))
          ELSE
            RETURN Error(GitHubError::GraphQL(GraphQLError::QueryError {
              message: first_error.message,
              path: first_error.path,
              locations: first_error.locations
            }))
          END IF
        END IF

        IF graphql_response.data IS None THEN
          RETURN Error(GitHubError::Response(ResponseError::EmptyResponse))
        END IF

        RETURN Ok(Q::Response::from_data(graphql_response.data.unwrap()))
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

STRUCT GraphQLRequest {
  query: String,
  variables: Option<serde_json::Value>,
  operation_name: Option<String>
}

STRUCT GraphQLResponse<T> {
  data: Option<T>,
  errors: Option<Vec<GraphQLErrorItem>>
}

STRUCT GraphQLErrorItem {
  message: String,
  type_: Option<String>,
  path: Option<Vec<String>>,
  locations: Option<Vec<GraphQLLocation>>
}

STRUCT GraphQLLocation {
  line: u32,
  column: u32
}

// Trait for type-safe GraphQL queries
TRAIT GraphQLQuery {
  TYPE ResponseData
  TYPE Response

  FUNCTION query_body() -> &'static str
  FUNCTION operation_name() -> &'static str
  FUNCTION variables(&self) -> Option<serde_json::Value>
}
```

---

## 6. Testing Patterns

### 6.1 Mock Service Implementation

```
// London-School TDD: Mock implementations for all services
STRUCT MockRepositoriesService {
  responses: HashMap<String, MockResponse>,
  call_history: Mutex<Vec<(String, serde_json::Value)>>
}

IMPL MockRepositoriesService {
  FUNCTION new() -> Self
    RETURN MockRepositoriesService {
      responses: HashMap::new(),
      call_history: Mutex::new(Vec::new())
    }
  END FUNCTION

  FUNCTION expect_get(owner: &str, repo: &str, response: Result<Repository, GitHubError>) -> &mut Self
    key <- format!("get:{}:{}", owner, repo)
    self.responses.insert(key, MockResponse::from(response))
    RETURN self
  END FUNCTION

  FUNCTION expect_list_for_user(response: Result<Paginated<Repository>, GitHubError>) -> &mut Self
    self.responses.insert("list_for_user".to_string(), MockResponse::from(response))
    RETURN self
  END FUNCTION

  FUNCTION verify_called(method: &str) -> bool
    RETURN self.call_history.lock().iter().any(|(m, _)| m == method)
  END FUNCTION

  FUNCTION get_calls(method: &str) -> Vec<serde_json::Value>
    RETURN self.call_history.lock()
      .iter()
      .filter(|(m, _)| m == method)
      .map(|(_, args)| args.clone())
      .collect()
  END FUNCTION
}

IMPL RepositoriesService FOR MockRepositoriesService {
  ASYNC FUNCTION get(owner: &str, repo: &str) -> Result<Repository, GitHubError>
    // Record call
    self.call_history.lock().push((
      "get".to_string(),
      json!({ "owner": owner, "repo": repo })
    ))

    // Return configured response
    key <- format!("get:{}:{}", owner, repo)
    IF let Some(response) <- self.responses.get(&key) THEN
      RETURN response.clone().into()
    ELSE
      RETURN Error(GitHubError::Resource(ResourceError::NotFound {
        message: "Mock not configured".to_string(),
        documentation_url: None
      }))
    END IF
  END FUNCTION

  // Similar implementations for other methods...
}
```

### 6.2 Mock HTTP Transport

```
STRUCT MockHttpTransport {
  responses: Vec<MockHttpResponse>,
  current_index: AtomicUsize,
  call_history: Mutex<Vec<HttpRequest>>
}

IMPL MockHttpTransport {
  FUNCTION new() -> Self
    RETURN MockHttpTransport {
      responses: Vec::new(),
      current_index: AtomicUsize::new(0),
      call_history: Mutex::new(Vec::new())
    }
  END FUNCTION

  FUNCTION add_response(status: StatusCode, body: serde_json::Value) -> &mut Self
    self.responses.push(MockHttpResponse {
      status: status,
      headers: HeaderMap::new(),
      body: serialize_json(body).unwrap().into()
    })
    RETURN self
  END FUNCTION

  FUNCTION add_response_with_headers(
    status: StatusCode,
    body: serde_json::Value,
    headers: HeaderMap
  ) -> &mut Self
    self.responses.push(MockHttpResponse {
      status: status,
      headers: headers,
      body: serialize_json(body).unwrap().into()
    })
    RETURN self
  END FUNCTION

  FUNCTION add_error(error: TransportError) -> &mut Self
    self.responses.push(MockHttpResponse::Error(error))
    RETURN self
  END FUNCTION

  FUNCTION get_request_history() -> Vec<HttpRequest>
    RETURN self.call_history.lock().clone()
  END FUNCTION
}

IMPL HttpTransport FOR MockHttpTransport {
  ASYNC FUNCTION send(request: HttpRequest) -> Result<HttpResponse, TransportError>
    // Record request
    self.call_history.lock().push(request.clone())

    // Get next response
    index <- self.current_index.fetch_add(1, Ordering::SeqCst)
    IF index >= self.responses.len() THEN
      PANIC("MockHttpTransport: No more responses configured")
    END IF

    response <- self.responses[index].clone()
    MATCH response
      CASE MockHttpResponse::Success { status, headers, body }:
        RETURN Ok(HttpResponse {
          status: status,
          headers: headers,
          body: body,
          latency: Duration::from_millis(1)
        })
      CASE MockHttpResponse::Error(e):
        RETURN Error(e)
    END MATCH
  END FUNCTION
}
```

### 6.3 Test Fixtures

```
MODULE test_fixtures {
  FUNCTION sample_repository() -> Repository
    RETURN Repository {
      id: 12345,
      node_id: "R_kgDOBcLq2A".to_string(),
      name: "test-repo".to_string(),
      full_name: "octocat/test-repo".to_string(),
      owner: sample_user(),
      private: false,
      html_url: "https://github.com/octocat/test-repo".to_string(),
      description: Some("A test repository".to_string()),
      fork: false,
      url: "https://api.github.com/repos/octocat/test-repo".to_string(),
      created_at: "2024-01-01T00:00:00Z".to_string(),
      updated_at: "2024-06-01T00:00:00Z".to_string(),
      pushed_at: "2024-06-01T00:00:00Z".to_string(),
      default_branch: "main".to_string(),
      // ... other fields with defaults
    }
  END FUNCTION

  FUNCTION sample_user() -> User
    RETURN User {
      login: "octocat".to_string(),
      id: 1,
      node_id: "MDQ6VXNlcjE=".to_string(),
      avatar_url: "https://github.com/images/error/octocat_happy.gif".to_string(),
      type_: "User".to_string(),
      site_admin: false,
      // ... other fields
    }
  END FUNCTION

  FUNCTION sample_issue() -> Issue
    RETURN Issue {
      id: 1,
      node_id: "MDU6SXNzdWUx".to_string(),
      number: 1347,
      title: "Found a bug".to_string(),
      body: Some("I'm having a problem with this.".to_string()),
      state: "open".to_string(),
      user: sample_user(),
      labels: Vec::new(),
      assignee: None,
      assignees: Vec::new(),
      milestone: None,
      locked: false,
      comments: 0,
      created_at: "2024-01-01T00:00:00Z".to_string(),
      updated_at: "2024-01-01T00:00:00Z".to_string(),
      closed_at: None,
      // ... other fields
    }
  END FUNCTION

  FUNCTION sample_pull_request() -> PullRequest
    // Similar implementation
  END FUNCTION

  // Rate limit headers for testing
  FUNCTION rate_limit_headers(remaining: u32, limit: u32) -> HeaderMap
    headers <- HeaderMap::new()
    headers.insert("X-RateLimit-Limit", limit.to_string())
    headers.insert("X-RateLimit-Remaining", remaining.to_string())
    headers.insert("X-RateLimit-Reset", (Utc::now() + Duration::from_secs(3600)).timestamp().to_string())
    headers.insert("X-RateLimit-Used", (limit - remaining).to_string())
    headers.insert("X-RateLimit-Resource", "core")
    RETURN headers
  END FUNCTION
}
```

### 6.4 Integration Test Helpers

```
MODULE integration_tests {
  // Skip integration tests if no GitHub token available
  FUNCTION skip_without_token()
    IF read_env("GITHUB_TOKEN") IS None THEN
      println!("Skipping integration test: GITHUB_TOKEN not set")
      RETURN
    END IF
  END FUNCTION

  // Create a test client with real credentials
  ASYNC FUNCTION create_integration_client() -> Result<GitHubClient, GitHubError>
    skip_without_token()
    RETURN create_github_client_from_env()
  END FUNCTION

  // Create a unique test repository name
  FUNCTION unique_repo_name(prefix: &str) -> String
    RETURN format!("{}-{}", prefix, Uuid::new_v4().to_string()[..8])
  END FUNCTION

  // Cleanup helper for test repositories
  ASYNC FUNCTION cleanup_test_repo(client: &GitHubClient, owner: &str, repo: &str)
    TRY
      client.repositories().delete(owner, repo).await
      println!("Cleaned up test repository: {}/{}", owner, repo)
    CATCH e
      println!("Warning: Failed to clean up test repository: {}", e)
    END TRY
  END FUNCTION
}
```

---

## 7. Observability Patterns

### 7.1 Metrics Collection

```
STRUCT GitHubMetrics {
  requests_total: Counter,
  request_duration_seconds: Histogram,
  errors_total: Counter,
  rate_limit_remaining: Gauge,
  rate_limit_hits_total: Counter,
  circuit_breaker_state: Gauge,
  pagination_requests_total: Counter
}

FUNCTION create_github_metrics(registry: &MetricsRegistry) -> GitHubMetrics
  RETURN GitHubMetrics {
    requests_total: registry.counter(
      "github_requests_total",
      "Total number of GitHub API requests",
      &["service", "operation", "method", "status"]
    ),

    request_duration_seconds: registry.histogram(
      "github_request_duration_seconds",
      "Duration of GitHub API requests in seconds",
      &["service", "operation", "method"],
      vec![0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
    ),

    errors_total: registry.counter(
      "github_errors_total",
      "Total number of GitHub API errors",
      &["service", "error_type"]
    ),

    rate_limit_remaining: registry.gauge(
      "github_rate_limit_remaining",
      "Remaining rate limit for GitHub API",
      &["resource"]
    ),

    rate_limit_hits_total: registry.counter(
      "github_rate_limit_hits_total",
      "Total number of rate limit hits",
      &["type"]
    ),

    circuit_breaker_state: registry.gauge(
      "github_circuit_breaker_state",
      "Current circuit breaker state (0=closed, 1=half_open, 2=open)",
      &["resource"]
    ),

    pagination_requests_total: registry.counter(
      "github_pagination_requests_total",
      "Total number of pagination requests",
      &["service", "operation"]
    )
  }
END FUNCTION

FUNCTION record_request(
  metrics: &GitHubMetrics,
  service: &str,
  operation: &str,
  method: &str,
  status: &str,
  duration: Duration
)
  metrics.requests_total.inc(&[service, operation, method, status])
  metrics.request_duration_seconds.observe(duration.as_secs_f64(), &[service, operation, method])
END FUNCTION

FUNCTION record_error(
  metrics: &GitHubMetrics,
  service: &str,
  error_type: &str
)
  metrics.errors_total.inc(&[service, error_type])
END FUNCTION

FUNCTION update_rate_limit(
  metrics: &GitHubMetrics,
  resource: &str,
  remaining: u32
)
  metrics.rate_limit_remaining.set(remaining as f64, &[resource])
END FUNCTION
```

### 7.2 Structured Logging

```
FUNCTION log_request(
  logger: &Logger,
  service: &str,
  operation: &str,
  params: HashMap<String, String>
)
  logger.debug("GitHub API request", {
    service: service,
    operation: operation,
    params: params
  })
END FUNCTION

FUNCTION log_response(
  logger: &Logger,
  service: &str,
  operation: &str,
  status: u16,
  duration_ms: u64,
  rate_limit_remaining: Option<u32>
)
  level <- IF status >= 400 THEN LogLevel::Warn ELSE LogLevel::Debug END IF

  logger.log(level, "GitHub API response", {
    service: service,
    operation: operation,
    status: status,
    duration_ms: duration_ms,
    rate_limit_remaining: rate_limit_remaining
  })
END FUNCTION

FUNCTION log_error(
  logger: &Logger,
  service: &str,
  operation: &str,
  error: &GitHubError,
  duration_ms: u64
)
  level <- IF error.is_retryable() THEN LogLevel::Warn ELSE LogLevel::Error END IF

  logger.log(level, "GitHub API error", {
    service: service,
    operation: operation,
    error_type: error.error_type(),
    error_message: error.to_string(),
    retryable: error.is_retryable(),
    duration_ms: duration_ms
  })
END FUNCTION
```

### 7.3 Tracing Span Attributes

```
FUNCTION create_operation_span(
  tracer: &Tracer,
  service: &str,
  operation: &str,
  attributes: HashMap<String, String>
) -> Span

  span <- tracer.start_span(format!("github.{}.{}", service, operation))

  span.set_attribute("github.service", service)
  span.set_attribute("github.operation", operation)

  FOR EACH (key, value) IN attributes DO
    span.set_attribute(format!("github.{}", key), value)
  END FOR

  RETURN span
END FUNCTION

FUNCTION complete_span_success(
  span: &mut Span,
  duration: Duration,
  rate_limit_info: Option<RateLimitInfo>
)
  span.set_status(SpanStatus::Ok)
  span.set_attribute("github.duration_ms", duration.as_millis() as i64)

  IF rate_limit_info IS Some THEN
    info <- rate_limit_info.unwrap()
    span.set_attribute("github.rate_limit.remaining", info.remaining as i64)
    span.set_attribute("github.rate_limit.limit", info.limit as i64)
  END IF
END FUNCTION

FUNCTION complete_span_error(
  span: &mut Span,
  error: &GitHubError,
  duration: Duration
)
  span.set_status(SpanStatus::Error)
  span.set_attribute("github.duration_ms", duration.as_millis() as i64)
  span.set_attribute("github.error.type", error.error_type())
  span.set_attribute("github.error.message", error.to_string())
  span.set_attribute("github.error.retryable", error.is_retryable())

  IF let Some(status) <- error.status_code() THEN
    span.set_attribute("http.status_code", status.as_u16() as i64)
  END IF
END FUNCTION
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial pseudocode (Part 4) |

---

**End of Pseudocode Phase**

*The next phase (Architecture) will provide detailed system design, component diagrams, and deployment considerations.*
