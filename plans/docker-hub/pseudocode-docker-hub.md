# Docker Hub Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/docker-hub`

---

## 1. Core Data Structures

### 1.1 Configuration

```pseudocode
STRUCT DockerHubConfig:
    hub_url: String               # https://hub.docker.com
    registry_url: String          # https://registry-1.docker.io
    auth_url: String              # https://auth.docker.io
    username: Option<String>
    password: Option<SecretString>
    access_token: Option<SecretString>  # PAT
    timeout: Duration
    max_retries: u32
    chunk_size: usize             # For blob uploads (5MB default)

STRUCT ImageReference:
    registry: String              # registry-1.docker.io
    namespace: String             # library or username
    repository: String            # nginx
    reference: Reference          # Tag or Digest

ENUM Reference:
    Tag(String)                   # "latest", "v1.0.0"
    Digest(String)                # "sha256:abc123..."
```

### 1.2 Manifest Types

```pseudocode
STRUCT ManifestV2:
    schema_version: u32           # 2
    media_type: String
    config: Descriptor
    layers: Vec<Descriptor>

STRUCT ManifestList:
    schema_version: u32           # 2
    media_type: String            # application/vnd.docker.distribution.manifest.list.v2+json
    manifests: Vec<PlatformManifest>

STRUCT PlatformManifest:
    media_type: String
    size: i64
    digest: String
    platform: Platform

STRUCT Platform:
    architecture: String          # amd64, arm64
    os: String                    # linux, windows
    variant: Option<String>       # v7, v8

STRUCT Descriptor:
    media_type: String
    size: i64
    digest: String
    urls: Option<Vec<String>>
```

### 1.3 Authentication Types

```pseudocode
STRUCT AuthToken:
    token: SecretString
    expires_at: Option<DateTime>
    scope: String

STRUCT HubJwtToken:
    token: SecretString
    refresh_token: Option<SecretString>
    expires_in: i64

STRUCT TokenRequest:
    service: String               # registry.docker.io
    scope: String                 # repository:library/nginx:pull,push
```

### 1.4 Vulnerability Types

```pseudocode
STRUCT ScanOverview:
    scan_status: ScanStatus
    last_scanned: Option<DateTime>
    vulnerability_summary: VulnerabilitySummary

ENUM ScanStatus:
    Pending
    Scanning
    Completed
    Failed
    NotScanned

STRUCT VulnerabilitySummary:
    critical: u32
    high: u32
    medium: u32
    low: u32
    unknown: u32
```

---

## 2. Client Core

### 2.1 DockerHubClient

```pseudocode
STRUCT DockerHubClient:
    config: DockerHubConfig
    http: HttpClient
    hub_token: RwLock<Option<HubJwtToken>>
    registry_tokens: RwLock<HashMap<String, AuthToken>>  # scope -> token
    rate_limiter: RateLimiter
    circuit_breaker: CircuitBreaker
    metrics: MetricsCollector

FUNCTION new(config: DockerHubConfig) -> Result<DockerHubClient>:
    VALIDATE config.hub_url is valid URL
    VALIDATE config.registry_url is valid URL

    http = HttpClient::new(config.timeout)
    rate_limiter = RateLimiter::new()
    circuit_breaker = CircuitBreaker::new(
        failure_threshold: 5,
        success_threshold: 2,
        reset_timeout: Duration::seconds(30)
    )

    RETURN Ok(DockerHubClient { config, http, ... })

FUNCTION execute_hub_request<T>(self, request: Request) -> Result<T>:
    span = tracing::span("docker.hub.request", path: request.path)

    # Ensure we have a hub JWT token
    token = self.ensure_hub_token().await?

    request = request.header("Authorization", format!("JWT {}", token.expose()))

    RETURN execute_with_retry(request).await

FUNCTION execute_registry_request<T>(self, request: Request, scope: &str) -> Result<T>:
    span = tracing::span("docker.registry.request", path: request.path)

    # Check circuit breaker
    IF NOT circuit_breaker.allow_request():
        RETURN Err(DockerHubError::ServiceUnavailable("Circuit open"))

    # Get bearer token for scope
    token = self.ensure_registry_token(scope).await?

    request = request.header("Authorization", format!("Bearer {}", token.expose()))

    result = execute_with_retry(|| {
        response = http.execute(request.clone()).await
        track_rate_limits(&response)
        handle_response(response)
    }).await

    MATCH result:
        Ok(_) => circuit_breaker.record_success()
        Err(e) IF e.is_server_error() => circuit_breaker.record_failure()

    RETURN result

FUNCTION track_rate_limits(response: &Response):
    IF let Some(remaining) = response.header("RateLimit-Remaining"):
        metrics.gauge("docker_rate_limit_remaining", remaining.parse())

    IF let Some(limit) = response.header("RateLimit-Limit"):
        # Parse "100;w=21600" format
        parts = limit.split(';')
        IF let Some(count) = parts.next():
            metrics.gauge("docker_rate_limit_total", count.parse())
```

---

## 3. Authentication Service

### 3.1 Hub Authentication

```pseudocode
TRAIT AuthService:
    async fn login() -> Result<HubJwtToken>
    async fn refresh_hub_token() -> Result<HubJwtToken>
    async fn get_registry_token(scope: &str) -> Result<AuthToken>

FUNCTION login(self) -> Result<HubJwtToken>:
    span = tracing::span("docker.auth.login")

    # Determine auth method
    (username, password) = MATCH (&config.username, &config.password, &config.access_token):
        (Some(u), Some(p), _) => (u, p)
        (Some(u), _, Some(pat)) => (u, pat)
        _ => RETURN Err(DockerHubError::InvalidCredentials("No credentials provided"))

    body = {
        "username": username,
        "password": password.expose()
    }

    request = Request::post(format!("{}/v2/users/login", config.hub_url))
        .json(body)

    response = http.execute(request).await?

    MATCH response.status:
        200 =>
            token_response = response.json::<LoginResponse>().await?
            token = HubJwtToken {
                token: SecretString::new(token_response.token),
                refresh_token: token_response.refresh_token.map(SecretString::new),
                expires_in: token_response.expires_in.unwrap_or(300)
            }
            *hub_token.write().await = Some(token.clone())
            log::info!("Successfully logged in to Docker Hub")
            RETURN Ok(token)
        401 =>
            RETURN Err(DockerHubError::InvalidCredentials("Bad username or password"))
        _ =>
            RETURN Err(DockerHubError::AuthenticationError(response.text().await?))

FUNCTION ensure_hub_token(self) -> Result<SecretString>:
    # Check existing token
    {
        let token = hub_token.read().await
        IF let Some(t) = &*token:
            IF NOT is_token_expired(t):
                RETURN Ok(t.token.clone())
    }

    # Need to login or refresh
    IF let Some(existing) = hub_token.read().await.as_ref():
        IF let Some(refresh) = &existing.refresh_token:
            TRY refresh_hub_token(refresh).await
            CATCH => login().await
    ELSE:
        login().await
```

### 3.2 Registry Token (Bearer)

```pseudocode
FUNCTION get_registry_token(self, scope: &str) -> Result<AuthToken>:
    span = tracing::span("docker.auth.token", scope: scope)

    # Check cache
    {
        let tokens = registry_tokens.read().await
        IF let Some(token) = tokens.get(scope):
            IF NOT is_token_expired(token):
                RETURN Ok(token.clone())
    }

    # Request new token
    url = format!(
        "{}/token?service=registry.docker.io&scope={}",
        config.auth_url,
        urlencoding::encode(scope)
    )

    request = Request::get(url)

    # Add basic auth if credentials available
    IF let (Some(user), Some(pass)) = (&config.username, &config.password):
        request = request.basic_auth(user, pass.expose())

    response = http.execute(request).await?

    MATCH response.status:
        200 =>
            token_response = response.json::<TokenResponse>().await?
            token = AuthToken {
                token: SecretString::new(token_response.token),
                expires_at: token_response.expires_in.map(|s| now() + Duration::seconds(s)),
                scope: scope.to_string()
            }

            # Cache token
            registry_tokens.write().await.insert(scope.to_string(), token.clone())

            RETURN Ok(token)
        401 =>
            RETURN Err(DockerHubError::UnauthorizedScope(scope.to_string()))
        _ =>
            RETURN Err(DockerHubError::AuthenticationError(response.text().await?))

FUNCTION build_scope(image: &ImageReference, actions: &[&str]) -> String:
    # repository:library/nginx:pull,push
    format!(
        "repository:{}/{}:{}",
        image.namespace,
        image.repository,
        actions.join(",")
    )
```

---

## 4. Repository Service

### 4.1 Repository Operations

```pseudocode
TRAIT RepositoryService:
    async fn list(namespace: &str, options: ListOptions) -> Result<Vec<Repository>>
    async fn get(namespace: &str, repo: &str) -> Result<Repository>
    async fn search(query: &str, options: SearchOptions) -> Result<SearchResult>

STRUCT Repository:
    namespace: String
    name: String
    description: Option<String>
    is_private: bool
    star_count: u64
    pull_count: u64
    last_updated: DateTime

FUNCTION list(self, namespace: &str, options: ListOptions) -> Result<Vec<Repository>>:
    span = tracing::span("docker.repo.list", namespace: namespace)

    url = format!("{}/v2/repositories/{}", config.hub_url, namespace)

    request = Request::get(url)
        .query("page_size", options.page_size.unwrap_or(100))
        .query("page", options.page.unwrap_or(1))

    response = execute_hub_request::<RepositoryListResponse>(request).await?

    span.set_attribute("count", response.results.len())
    RETURN Ok(response.results)

FUNCTION get(self, namespace: &str, repo: &str) -> Result<Repository>:
    span = tracing::span("docker.repo.get", namespace: namespace, repo: repo)

    url = format!("{}/v2/repositories/{}/{}", config.hub_url, namespace, repo)

    request = Request::get(url)

    RETURN execute_hub_request::<Repository>(request).await

FUNCTION search(self, query: &str, options: SearchOptions) -> Result<SearchResult>:
    span = tracing::span("docker.repo.search", query: query)

    url = format!("{}/v2/search/repositories", config.hub_url)

    request = Request::get(url)
        .query("query", query)
        .query("page_size", options.page_size.unwrap_or(25))

    RETURN execute_hub_request::<SearchResult>(request).await
```

---

## 5. Manifest Service

### 5.1 Manifest Operations

```pseudocode
TRAIT ManifestService:
    async fn get(image: &ImageReference) -> Result<Manifest>
    async fn get_raw(image: &ImageReference) -> Result<(String, Bytes)>
    async fn put(image: &ImageReference, manifest: &Manifest) -> Result<String>
    async fn delete(image: &ImageReference) -> Result<()>
    async fn exists(image: &ImageReference) -> Result<bool>

ENUM Manifest:
    V2(ManifestV2)
    List(ManifestList)
    OCI(OciManifest)

FUNCTION get(self, image: &ImageReference) -> Result<Manifest>:
    span = tracing::span("docker.manifest.get",
        image: image.full_name(),
        reference: image.reference.to_string()
    )

    scope = build_scope(image, &["pull"])
    url = format!(
        "{}/v2/{}/{}/manifests/{}",
        config.registry_url,
        image.namespace,
        image.repository,
        image.reference
    )

    # Accept multiple manifest types
    accept_headers = [
        "application/vnd.docker.distribution.manifest.v2+json",
        "application/vnd.docker.distribution.manifest.list.v2+json",
        "application/vnd.oci.image.manifest.v1+json",
        "application/vnd.oci.image.index.v1+json"
    ].join(", ")

    request = Request::get(url)
        .header("Accept", accept_headers)

    response = execute_registry_request_raw(request, &scope).await?

    # Parse based on content type
    content_type = response.headers.get("Content-Type")
        .unwrap_or("application/vnd.docker.distribution.manifest.v2+json")

    digest = response.headers.get("Docker-Content-Digest")
        .ok_or(DockerHubError::ManifestInvalid("Missing digest header"))?

    manifest = parse_manifest(&response.body, content_type)?

    metrics.increment("docker_pulls_total", image: image.full_name())

    RETURN Ok(manifest)

FUNCTION put(self, image: &ImageReference, manifest: &Manifest) -> Result<String>:
    span = tracing::span("docker.manifest.put",
        image: image.full_name(),
        reference: image.reference.to_string()
    )

    scope = build_scope(image, &["pull", "push"])
    url = format!(
        "{}/v2/{}/{}/manifests/{}",
        config.registry_url,
        image.namespace,
        image.repository,
        image.reference
    )

    (content_type, body) = serialize_manifest(manifest)

    request = Request::put(url)
        .header("Content-Type", content_type)
        .body(body)

    response = execute_registry_request_raw(request, &scope).await?

    MATCH response.status:
        201 =>
            digest = response.headers.get("Docker-Content-Digest")
                .ok_or(DockerHubError::ManifestInvalid("Missing digest"))?

            metrics.increment("docker_pushes_total", image: image.full_name())
            log::info!("Pushed manifest {} -> {}", image.full_name(), digest)

            RETURN Ok(digest.to_string())
        _ =>
            RETURN Err(parse_registry_error(response).await)

FUNCTION delete(self, image: &ImageReference) -> Result<()>:
    span = tracing::span("docker.manifest.delete", image: image.full_name())

    # Must delete by digest, not tag
    digest = MATCH &image.reference:
        Reference::Digest(d) => d.clone()
        Reference::Tag(t) =>
            # Resolve tag to digest first
            manifest = self.get(image).await?
            self.compute_digest(&manifest)?

    scope = build_scope(image, &["pull", "push"])
    url = format!(
        "{}/v2/{}/{}/manifests/{}",
        config.registry_url,
        image.namespace,
        image.repository,
        digest
    )

    request = Request::delete(url)

    response = execute_registry_request_raw(request, &scope).await?

    MATCH response.status:
        202 =>
            log::info!("Deleted manifest {}", digest)
            RETURN Ok(())
        _ =>
            RETURN Err(parse_registry_error(response).await)
```

---

## 6. Blob Service

### 6.1 Blob Operations

```pseudocode
TRAIT BlobService:
    async fn exists(image: &ImageReference, digest: &str) -> Result<bool>
    async fn get(image: &ImageReference, digest: &str) -> Result<Bytes>
    async fn upload(image: &ImageReference, data: &[u8]) -> Result<String>
    async fn upload_chunked(image: &ImageReference, reader: impl AsyncRead) -> Result<String>
    async fn mount(image: &ImageReference, digest: &str, from: &ImageReference) -> Result<bool>

FUNCTION exists(self, image: &ImageReference, digest: &str) -> Result<bool>:
    span = tracing::span("docker.blob.exists", digest: digest)

    scope = build_scope(image, &["pull"])
    url = format!(
        "{}/v2/{}/{}/blobs/{}",
        config.registry_url,
        image.namespace,
        image.repository,
        digest
    )

    request = Request::head(url)

    response = execute_registry_request_raw(request, &scope).await?

    RETURN Ok(response.status == 200)

FUNCTION upload(self, image: &ImageReference, data: &[u8]) -> Result<String>:
    span = tracing::span("docker.blob.upload", size: data.len())

    # Compute digest
    digest = format!("sha256:{}", sha256_hex(data))

    # Check if already exists
    IF self.exists(image, &digest).await?:
        log::debug!("Blob {} already exists, skipping upload", digest)
        RETURN Ok(digest)

    scope = build_scope(image, &["pull", "push"])

    # Initiate upload
    init_url = format!(
        "{}/v2/{}/{}/blobs/uploads/",
        config.registry_url,
        image.namespace,
        image.repository
    )

    init_request = Request::post(init_url)

    init_response = execute_registry_request_raw(init_request, &scope).await?

    upload_url = init_response.headers.get("Location")
        .ok_or(DockerHubError::BlobUploadInvalid("Missing Location header"))?

    # Single PUT for small blobs
    IF data.len() <= config.chunk_size:
        complete_url = format!("{}?digest={}", upload_url, digest)

        complete_request = Request::put(complete_url)
            .header("Content-Type", "application/octet-stream")
            .header("Content-Length", data.len())
            .body(data.to_vec())

        response = execute_registry_request_raw(complete_request, &scope).await?

        MATCH response.status:
            201 =>
                metrics.counter("docker_bytes_uploaded_total", data.len())
                RETURN Ok(digest)
            _ =>
                RETURN Err(parse_registry_error(response).await)
    ELSE:
        RETURN self.upload_chunked_internal(image, upload_url, data, &digest, &scope).await

FUNCTION upload_chunked_internal(
    self,
    image: &ImageReference,
    upload_url: &str,
    data: &[u8],
    digest: &str,
    scope: &str
) -> Result<String>:
    span = tracing::span("docker.blob.upload.chunked", total_size: data.len())

    current_url = upload_url.to_string()
    offset = 0

    WHILE offset < data.len():
        chunk_end = min(offset + config.chunk_size, data.len())
        chunk = &data[offset..chunk_end]

        patch_request = Request::patch(&current_url)
            .header("Content-Type", "application/octet-stream")
            .header("Content-Range", format!("{}-{}", offset, chunk_end - 1))
            .header("Content-Length", chunk.len())
            .body(chunk.to_vec())

        response = execute_registry_request_raw(patch_request, scope).await?

        MATCH response.status:
            202 =>
                current_url = response.headers.get("Location")
                    .ok_or(DockerHubError::BlobUploadInvalid("Missing Location"))?
                    .to_string()
                offset = chunk_end
                metrics.counter("docker_bytes_uploaded_total", chunk.len())
            _ =>
                RETURN Err(parse_registry_error(response).await)

    # Complete upload
    complete_url = format!("{}?digest={}", current_url, digest)

    complete_request = Request::put(complete_url)
        .header("Content-Length", 0)

    response = execute_registry_request_raw(complete_request, scope).await?

    MATCH response.status:
        201 =>
            log::info!("Uploaded blob {} ({} bytes)", digest, data.len())
            RETURN Ok(digest.to_string())
        _ =>
            RETURN Err(parse_registry_error(response).await)
```

---

## 7. Tag Service

### 7.1 Tag Operations

```pseudocode
TRAIT TagService:
    async fn list(image: &ImageReference) -> Result<Vec<String>>
    async fn delete(image: &ImageReference, tag: &str) -> Result<()>

FUNCTION list(self, image: &ImageReference) -> Result<Vec<String>>:
    span = tracing::span("docker.tag.list", image: image.full_name())

    scope = build_scope(image, &["pull"])
    url = format!(
        "{}/v2/{}/{}/tags/list",
        config.registry_url,
        image.namespace,
        image.repository
    )

    request = Request::get(url)

    response = execute_registry_request::<TagListResponse>(request, &scope).await?

    span.set_attribute("count", response.tags.len())
    RETURN Ok(response.tags)

FUNCTION delete(self, image: &ImageReference, tag: &str) -> Result<()>:
    span = tracing::span("docker.tag.delete", image: image.full_name(), tag: tag)

    # Resolve tag to digest
    tag_ref = ImageReference {
        reference: Reference::Tag(tag.to_string()),
        ..image.clone()
    }

    manifest = self.manifests().get(&tag_ref).await?
    digest = compute_manifest_digest(&manifest)?

    # Delete by digest
    digest_ref = ImageReference {
        reference: Reference::Digest(digest),
        ..image.clone()
    }

    self.manifests().delete(&digest_ref).await
```

---

## 8. Vulnerability Service

### 8.1 Scan Operations

```pseudocode
TRAIT VulnerabilityService:
    async fn get_scan_overview(namespace: &str, repo: &str, digest: &str) -> Result<ScanOverview>
    async fn get_vulnerabilities(namespace: &str, repo: &str, digest: &str) -> Result<Vec<Vulnerability>>

FUNCTION get_scan_overview(self, namespace: &str, repo: &str, digest: &str) -> Result<ScanOverview>:
    span = tracing::span("docker.vulnerability.overview",
        image: format!("{}/{}", namespace, repo),
        digest: digest
    )

    url = format!(
        "{}/v2/repositories/{}/{}/images/{}/vulnerabilities",
        config.hub_url,
        namespace,
        repo,
        digest
    )

    request = Request::get(url)

    response = execute_hub_request::<ScanResponse>(request).await?

    overview = ScanOverview {
        scan_status: response.status,
        last_scanned: response.last_scanned,
        vulnerability_summary: VulnerabilitySummary {
            critical: response.critical_count,
            high: response.high_count,
            medium: response.medium_count,
            low: response.low_count,
            unknown: response.unknown_count
        }
    }

    # Record metrics
    metrics.gauge("docker_vulnerabilities_total",
        overview.vulnerability_summary.critical,
        severity: "critical",
        image: format!("{}/{}", namespace, repo)
    )

    RETURN Ok(overview)
```

---

## 9. Webhook Handler

### 9.1 Webhook Processing

```pseudocode
TRAIT WebhookHandler:
    async fn handle(request: WebhookRequest) -> Result<WebhookResponse>
    fn validate(request: &WebhookRequest) -> Result<()>

STRUCT WebhookPayload:
    callback_url: String
    push_data: PushData
    repository: RepositoryData

STRUCT PushData:
    pushed_at: DateTime
    pusher: String
    tag: String
    images: Vec<String>

FUNCTION handle(self, request: WebhookRequest) -> Result<WebhookResponse>:
    span = tracing::span("docker.webhook.receive")

    # Parse payload
    payload = serde_json::from_slice::<WebhookPayload>(&request.body)?

    span.set_attribute("event_type", "push")
    span.set_attribute("repository", &payload.repository.repo_name)

    log::info!("Received webhook: {} pushed {} to {}",
        payload.push_data.pusher,
        payload.push_data.tag,
        payload.repository.repo_name
    )

    # Emit event
    event_bus.publish(ImagePushedEvent {
        repository: payload.repository.repo_name,
        tag: payload.push_data.tag,
        pusher: payload.push_data.pusher,
        timestamp: payload.push_data.pushed_at
    }).await

    metrics.increment("docker_webhook_events_total", event_type: "push")

    RETURN Ok(WebhookResponse::Processed)
```

---

## 10. Rate Limiter

### 10.1 Docker Hub Rate Limiter

```pseudocode
STRUCT DockerRateLimiter:
    pull_remaining: AtomicI32
    pull_limit: AtomicI32
    reset_time: AtomicInstant
    is_authenticated: bool

FUNCTION check_pull_limit(self) -> Result<()>:
    remaining = pull_remaining.load()

    IF remaining <= 0:
        reset = reset_time.load()
        wait_duration = reset - Instant::now()

        IF wait_duration > Duration::ZERO:
            log::warn!("Pull rate limit exceeded, must wait {:?}", wait_duration)
            RETURN Err(DockerHubError::PullLimitExceeded {
                reset_at: reset,
                is_authenticated: self.is_authenticated
            })

    RETURN Ok(())

FUNCTION update_from_headers(self, headers: &HeaderMap):
    IF let Some(remaining) = headers.get("RateLimit-Remaining"):
        pull_remaining.store(remaining.parse().unwrap_or(0))

    IF let Some(limit) = headers.get("RateLimit-Limit"):
        # Parse "100;w=21600" -> limit=100, window=21600s
        IF let Some(count) = limit.split(';').next():
            pull_limit.store(count.parse().unwrap_or(100))

        IF let Some(window) = limit.split("w=").nth(1):
            window_secs = window.parse::<u64>().unwrap_or(21600)
            reset_time.store(Instant::now() + Duration::seconds(window_secs))
```

---

## 11. Simulation Layer

### 11.1 Mock Client

```pseudocode
STRUCT MockDockerHubClient:
    repositories: RwLock<HashMap<String, Repository>>
    manifests: RwLock<HashMap<String, Manifest>>  # digest -> manifest
    blobs: RwLock<HashMap<String, Vec<u8>>>       # digest -> data
    tags: RwLock<HashMap<String, String>>         # image:tag -> digest
    mode: SimulationMode

ENUM SimulationMode:
    Mock
    Record
    Replay

FUNCTION get_manifest(self, image: &ImageReference) -> Result<Manifest>:
    MATCH mode:
        Mock =>
            key = image.full_name_with_reference()

            # Resolve tag to digest
            digest = MATCH &image.reference:
                Reference::Tag(t) =>
                    tags.read().await.get(&format!("{}:{}", image.full_name(), t))
                        .cloned()
                        .ok_or(DockerHubError::ManifestNotFound)?
                Reference::Digest(d) => d.clone()

            manifests.read().await.get(&digest)
                .cloned()
                .ok_or(DockerHubError::ManifestNotFound)

        Record =>
            result = real_client.manifests().get(image).await
            # Store for replay
            recorded_calls.write().await.push(...)
            result

        Replay =>
            find_matching_call("get_manifest", image)
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Pseudocode |

---

**Next Phase:** Architecture - Module structure, component diagrams, data flows, and state machines.
