# Docker Hub Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/docker-hub`

---

## 1. Edge Cases

### 1.1 Image Reference Parsing

| Edge Case | Handling Strategy |
|-----------|-------------------|
| No registry specified | Default to `registry-1.docker.io` |
| No namespace specified | Default to `library` for official images |
| Tag with special chars | URL-encode, validate allowed chars |
| Digest format variations | Accept `sha256:` prefix, validate hex |
| Port in registry URL | Parse correctly `myregistry:5000/image` |
| Nested namespaces | Support `org/team/image` format |

```rust
// Comprehensive image reference parsing
fn parse_image_reference(input: &str) -> Result<ImageReference> {
    // Patterns:
    // nginx -> library/nginx:latest @ registry-1.docker.io
    // nginx:1.21 -> library/nginx:1.21 @ registry-1.docker.io
    // myuser/myapp -> myuser/myapp:latest @ registry-1.docker.io
    // myuser/myapp:v1.0 -> myuser/myapp:v1.0 @ registry-1.docker.io
    // myuser/myapp@sha256:abc -> myuser/myapp@sha256:abc @ registry-1.docker.io
    // gcr.io/project/image:tag -> project/image:tag @ gcr.io

    let (registry, remainder) = extract_registry(input)?;
    let (namespace, repository, reference) = parse_name_reference(remainder)?;

    // Default namespace for Docker Hub official images
    let namespace = if registry == "registry-1.docker.io" && namespace.is_none() {
        "library".to_string()
    } else {
        namespace.unwrap_or_default()
    };

    // Default tag
    let reference = reference.unwrap_or(Reference::Tag("latest".to_string()));

    Ok(ImageReference {
        registry: registry.unwrap_or("registry-1.docker.io".to_string()),
        namespace,
        repository,
        reference,
    })
}

fn validate_tag(tag: &str) -> Result<()> {
    // Tags can contain: a-z, A-Z, 0-9, _, ., -
    // Must start with alphanumeric
    // Max 128 characters

    if tag.is_empty() || tag.len() > 128 {
        return Err(DockerHubError::InvalidTag("Tag length invalid"));
    }

    if !tag.chars().next().unwrap().is_alphanumeric() {
        return Err(DockerHubError::InvalidTag("Tag must start with alphanumeric"));
    }

    if !tag.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '.' || c == '-') {
        return Err(DockerHubError::InvalidTag("Invalid characters in tag"));
    }

    Ok(())
}

fn validate_digest(digest: &str) -> Result<()> {
    // Format: algorithm:hex
    // Common: sha256:64-char-hex

    let parts: Vec<&str> = digest.splitn(2, ':').collect();
    if parts.len() != 2 {
        return Err(DockerHubError::InvalidDigest("Missing algorithm prefix"));
    }

    let (algorithm, hash) = (parts[0], parts[1]);

    match algorithm {
        "sha256" if hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit()) => Ok(()),
        "sha512" if hash.len() == 128 && hash.chars().all(|c| c.is_ascii_hexdigit()) => Ok(()),
        _ => Err(DockerHubError::InvalidDigest("Unsupported or malformed digest")),
    }
}
```

### 1.2 Manifest Handling

| Edge Case | Handling Strategy |
|-----------|-------------------|
| Multi-arch manifest list | Return list, provide platform filter |
| OCI vs Docker format | Accept both, normalize internally |
| Missing Content-Digest | Compute from body |
| Schema version 1 | Reject with clear error |
| Foreign layers | Handle URLs in layer descriptors |
| Empty layers | Valid for scratch images |

```rust
// Multi-arch manifest handling
async fn get_manifest_for_platform(
    &self,
    image: &ImageReference,
    platform: &Platform,
) -> Result<ManifestV2> {
    let manifest = self.get(image).await?;

    match manifest {
        Manifest::V2(m) => Ok(m),
        Manifest::List(list) => {
            // Find matching platform
            let matching = list.manifests.iter()
                .find(|m| {
                    m.platform.architecture == platform.architecture &&
                    m.platform.os == platform.os &&
                    m.platform.variant == platform.variant
                })
                .ok_or(DockerHubError::PlatformNotFound {
                    requested: platform.clone(),
                    available: list.manifests.iter()
                        .map(|m| m.platform.clone())
                        .collect(),
                })?;

            // Fetch the specific manifest by digest
            let platform_ref = ImageReference {
                reference: Reference::Digest(matching.digest.clone()),
                ..image.clone()
            };

            match self.get(&platform_ref).await? {
                Manifest::V2(m) => Ok(m),
                _ => Err(DockerHubError::ManifestInvalid("Expected V2 manifest")),
            }
        }
        Manifest::OCI(m) => {
            // Convert OCI to Docker format if needed
            Ok(m.into())
        }
    }
}

// Compute digest from manifest body
fn compute_manifest_digest(body: &[u8]) -> String {
    use sha2::{Sha256, Digest};
    let hash = Sha256::digest(body);
    format!("sha256:{}", hex::encode(hash))
}

// Verify Content-Digest header
fn verify_content_digest(body: &[u8], expected: &str) -> Result<()> {
    let computed = compute_manifest_digest(body);

    if computed != expected {
        return Err(DockerHubError::DigestMismatch {
            expected: expected.to_string(),
            computed,
        });
    }

    Ok(())
}
```

### 1.3 Blob Upload Edge Cases

| Edge Case | Handling Strategy |
|-----------|-------------------|
| Upload interrupted | Resume from last successful chunk |
| Digest mismatch on complete | Fail with clear error, delete partial |
| Zero-length blob | Valid (empty layer), handle specially |
| Very large blob (>1GB) | Stream, never load into memory |
| Cross-repo mount | Try mount first, fall back to upload |
| Upload timeout | Configurable per-chunk timeout |

```rust
// Resumable upload tracking
struct UploadSession {
    uuid: String,
    upload_url: String,
    bytes_uploaded: usize,
    total_size: usize,
    expected_digest: String,
    started_at: Instant,
}

impl UploadSession {
    async fn resume_or_restart(
        &self,
        client: &DockerHubClient,
        image: &ImageReference,
    ) -> Result<String> {
        // Check if upload is still valid
        let status = client.get_upload_status(&self.upload_url).await;

        match status {
            Ok(status) if status.offset == self.bytes_uploaded => {
                // Can resume
                Ok(self.upload_url.clone())
            }
            Ok(status) => {
                // Partial data lost, need to re-upload from status.offset
                tracing::warn!(
                    "Upload session offset mismatch: expected {}, got {}",
                    self.bytes_uploaded, status.offset
                );
                Ok(self.upload_url.clone())
            }
            Err(_) => {
                // Session expired, start new upload
                tracing::info!("Upload session expired, starting new upload");
                client.blobs().initiate_upload(image).await
            }
        }
    }
}

// Cross-repository blob mount
async fn upload_with_mount(
    &self,
    image: &ImageReference,
    digest: &str,
    from_repo: Option<&ImageReference>,
) -> Result<String> {
    // Try mount if source repo provided
    if let Some(from) = from_repo {
        let mount_url = format!(
            "{}/v2/{}/{}/blobs/uploads/?mount={}&from={}/{}",
            self.config.registry_url,
            image.namespace,
            image.repository,
            digest,
            from.namespace,
            from.repository
        );

        let response = self.execute_registry_request_raw(
            Request::post(&mount_url),
            &build_scope(image, &["pull", "push"])
        ).await?;

        match response.status {
            201 => {
                // Mount successful
                tracing::info!("Blob {} mounted from {}", digest, from.full_name());
                return Ok(digest.to_string());
            }
            202 => {
                // Mount failed but upload initiated
                let upload_url = response.headers.get("Location")
                    .ok_or(DockerHubError::BlobUploadInvalid("Missing Location"))?;
                // Continue with regular upload
                return self.complete_upload(upload_url, data, digest).await;
            }
            _ => {}
        }
    }

    // Regular upload
    self.upload(image, data).await
}
```

---

## 2. Error Recovery

### 2.1 Retry Strategies

```rust
// Docker Hub specific retry configuration
struct DockerHubRetryPolicy {
    base_delay: Duration,
    max_delay: Duration,
    max_attempts: u32,
}

impl DockerHubRetryPolicy {
    fn should_retry(&self, error: &DockerHubError, attempt: u32) -> RetryDecision {
        if attempt >= self.max_attempts {
            return RetryDecision::DoNotRetry;
        }

        match error {
            // Rate limited - wait for reset
            DockerHubError::PullLimitExceeded { reset_at, .. } => {
                let wait = *reset_at - Instant::now();
                if wait > Duration::minutes(30) {
                    // Too long to wait
                    RetryDecision::DoNotRetry
                } else {
                    RetryDecision::RetryAfter(wait)
                }
            }

            // Token expired - refresh and retry immediately
            DockerHubError::TokenExpired => {
                RetryDecision::RefreshAuthAndRetry
            }

            // Server errors - exponential backoff
            DockerHubError::ServerError(status) if *status >= 500 => {
                RetryDecision::RetryAfter(self.exponential_backoff(attempt))
            }

            // Network errors - quick retry
            DockerHubError::NetworkError(NetworkError::Timeout) => {
                RetryDecision::RetryAfter(self.base_delay)
            }

            // Blob upload errors - may be resumable
            DockerHubError::BlobUploadInvalid(_) if attempt == 0 => {
                RetryDecision::RetryAfter(Duration::seconds(1))
            }

            // All other errors
            _ => RetryDecision::DoNotRetry
        }
    }
}
```

### 2.2 Partial Upload Recovery

```rust
// Recover from interrupted chunked upload
async fn upload_chunked_with_recovery(
    &self,
    image: &ImageReference,
    data: &[u8],
) -> Result<String> {
    let digest = format!("sha256:{}", sha256_hex(data));
    let total_size = data.len();

    // Check for existing upload session
    let session_key = format!("{}:{}", image.full_name(), digest);
    let session = self.upload_sessions.get(&session_key);

    let (upload_url, start_offset) = if let Some(sess) = session {
        match sess.resume_or_restart(self, image).await {
            Ok(url) => (url, sess.bytes_uploaded),
            Err(_) => {
                let url = self.initiate_upload(image).await?;
                (url, 0)
            }
        }
    } else {
        let url = self.initiate_upload(image).await?;
        (url, 0)
    };

    // Upload remaining chunks
    let mut current_url = upload_url;
    let mut offset = start_offset;

    while offset < total_size {
        let chunk_end = std::cmp::min(offset + self.config.chunk_size, total_size);
        let chunk = &data[offset..chunk_end];

        match self.upload_chunk(&current_url, chunk, offset, chunk_end - 1).await {
            Ok(next_url) => {
                current_url = next_url;
                offset = chunk_end;

                // Save progress
                self.upload_sessions.insert(session_key.clone(), UploadSession {
                    uuid: extract_uuid(&current_url),
                    upload_url: current_url.clone(),
                    bytes_uploaded: offset,
                    total_size,
                    expected_digest: digest.clone(),
                    started_at: Instant::now(),
                });
            }
            Err(e) => {
                tracing::error!("Chunk upload failed at offset {}: {}", offset, e);
                return Err(e);
            }
        }
    }

    // Complete upload
    let result = self.complete_upload(&current_url, &digest).await;

    // Clean up session on success
    if result.is_ok() {
        self.upload_sessions.remove(&session_key);
    }

    result
}
```

### 2.3 Token Refresh Recovery

```rust
// Automatic token refresh on 401
async fn execute_with_auth_recovery<T, F>(
    &self,
    make_request: F,
    scope: &str,
) -> Result<T>
where
    F: Fn() -> Request + Clone,
{
    let mut attempts = 0;
    const MAX_AUTH_RETRIES: u32 = 2;

    loop {
        let token = self.ensure_registry_token(scope).await?;
        let request = make_request()
            .header("Authorization", format!("Bearer {}", token.expose()));

        let response = self.http.execute(request).await?;

        match response.status {
            status if status.is_success() => {
                return response.json::<T>().await
                    .map_err(DockerHubError::from);
            }
            StatusCode::UNAUTHORIZED => {
                attempts += 1;
                if attempts >= MAX_AUTH_RETRIES {
                    return Err(DockerHubError::AuthenticationError(
                        "Failed to authenticate after token refresh"
                    ));
                }

                // Invalidate cached token and retry
                self.invalidate_token(scope).await;
                tracing::info!("Token rejected, refreshing (attempt {})", attempts);
                continue;
            }
            status => {
                return Err(self.parse_error_response(response).await);
            }
        }
    }
}
```

---

## 3. Performance Optimizations

### 3.1 Parallel Layer Operations

```rust
// Parallel blob downloads with concurrency limit
async fn download_layers_parallel(
    &self,
    image: &ImageReference,
    layers: &[Descriptor],
    max_concurrent: usize,
) -> Result<Vec<(String, Bytes)>> {
    let semaphore = Arc::new(Semaphore::new(max_concurrent));

    let futures: Vec<_> = layers.iter().map(|layer| {
        let sem = semaphore.clone();
        let client = self.clone();
        let image = image.clone();
        let digest = layer.digest.clone();
        let expected_size = layer.size;

        async move {
            let _permit = sem.acquire().await;

            let data = client.blobs().get(&image, &digest).await?;

            // Verify size
            if data.len() as i64 != expected_size {
                return Err(DockerHubError::BlobSizeMismatch {
                    expected: expected_size,
                    actual: data.len() as i64,
                });
            }

            // Verify digest
            let computed = format!("sha256:{}", sha256_hex(&data));
            if computed != digest {
                return Err(DockerHubError::DigestMismatch {
                    expected: digest,
                    computed,
                });
            }

            Ok((digest, data))
        }
    }).collect();

    futures::future::try_join_all(futures).await
}

// Parallel blob uploads
async fn upload_layers_parallel(
    &self,
    image: &ImageReference,
    layers: Vec<(String, Vec<u8>)>,
    max_concurrent: usize,
) -> Result<Vec<String>> {
    let semaphore = Arc::new(Semaphore::new(max_concurrent));

    let futures: Vec<_> = layers.into_iter().map(|(expected_digest, data)| {
        let sem = semaphore.clone();
        let client = self.clone();
        let image = image.clone();

        async move {
            let _permit = sem.acquire().await;

            // Check if blob already exists
            if client.blobs().exists(&image, &expected_digest).await? {
                tracing::debug!("Blob {} already exists", expected_digest);
                return Ok(expected_digest);
            }

            client.blobs().upload(&image, &data).await
        }
    }).collect();

    futures::future::try_join_all(futures).await
}
```

### 3.2 Connection Pooling

```rust
// HTTP client with Docker Hub optimized settings
fn create_docker_http_client(config: &DockerHubConfig) -> Result<reqwest::Client> {
    reqwest::Client::builder()
        // Connection pooling for registry
        .pool_max_idle_per_host(10)
        .pool_idle_timeout(Duration::from_secs(90))

        // Large transfers
        .timeout(config.timeout)
        .connect_timeout(Duration::from_secs(10))

        // Keep-alive for blob transfers
        .tcp_keepalive(Duration::from_secs(60))

        // Compression (manifests, not blobs)
        .gzip(true)

        // TLS
        .min_tls_version(tls::Version::TLS_1_2)
        .https_only(true)

        // Don't follow redirects automatically (registry uses them)
        .redirect(redirect::Policy::none())

        .build()
        .map_err(|e| DockerHubError::ConfigurationError(e.to_string()))
}
```

### 3.3 Manifest Caching

```rust
// Cache for manifests and tags
struct DockerCache {
    manifests: RwLock<LruCache<String, CachedManifest>>,
    tags: RwLock<LruCache<String, CachedTags>>,
    ttl: Duration,
}

struct CachedManifest {
    manifest: Manifest,
    digest: String,
    fetched_at: Instant,
}

impl DockerCache {
    async fn get_manifest_cached(
        &self,
        client: &DockerHubClient,
        image: &ImageReference,
    ) -> Result<Manifest> {
        let cache_key = image.full_name_with_reference();

        // Check cache (only for digests, not tags)
        if matches!(&image.reference, Reference::Digest(_)) {
            let cache = self.manifests.read().await;
            if let Some(cached) = cache.get(&cache_key) {
                if cached.fetched_at.elapsed() < self.ttl {
                    return Ok(cached.manifest.clone());
                }
            }
        }

        // Fetch from registry
        let (manifest, digest) = client.manifests().get_with_digest(image).await?;

        // Cache by digest (immutable)
        let digest_key = format!(
            "{}/{}@{}",
            image.namespace, image.repository, digest
        );

        let mut cache = self.manifests.write().await;
        cache.put(digest_key, CachedManifest {
            manifest: manifest.clone(),
            digest: digest.clone(),
            fetched_at: Instant::now(),
        });

        // Also cache tag -> digest mapping briefly
        if let Reference::Tag(tag) = &image.reference {
            cache.put(cache_key, CachedManifest {
                manifest: manifest.clone(),
                digest,
                fetched_at: Instant::now(),
            });
        }

        Ok(manifest)
    }
}
```

---

## 4. Security Hardening

### 4.1 Credential Protection

```rust
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(ZeroizeOnDrop)]
struct DockerCredentials {
    username: String,
    password: SecretString,
}

impl DockerCredentials {
    fn build_basic_auth(&self) -> String {
        let credentials = format!("{}:{}", self.username, self.password.expose_secret());
        let encoded = base64::encode(&credentials);
        // credentials string is dropped and zeroized here
        format!("Basic {}", encoded)
    }
}

// Never log credentials
impl std::fmt::Debug for DockerCredentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DockerCredentials")
            .field("username", &self.username)
            .field("password", &"[REDACTED]")
            .finish()
    }
}

// Token handling
#[derive(ZeroizeOnDrop)]
struct AuthToken {
    #[zeroize(skip)]
    scope: String,
    token: SecretString,
    #[zeroize(skip)]
    expires_at: Option<Instant>,
}
```

### 4.2 Digest Verification

```rust
// Strict digest verification for all content
struct ContentVerifier;

impl ContentVerifier {
    fn verify_blob(data: &[u8], expected_digest: &str) -> Result<()> {
        let computed = Self::compute_digest(data);

        if !constant_time_eq(computed.as_bytes(), expected_digest.as_bytes()) {
            return Err(DockerHubError::DigestMismatch {
                expected: expected_digest.to_string(),
                computed,
            });
        }

        Ok(())
    }

    fn verify_manifest(body: &[u8], expected_digest: &str) -> Result<()> {
        // Manifest digest is computed over canonical JSON
        let canonical = Self::canonicalize_json(body)?;
        let computed = Self::compute_digest(&canonical);

        if !constant_time_eq(computed.as_bytes(), expected_digest.as_bytes()) {
            return Err(DockerHubError::DigestMismatch {
                expected: expected_digest.to_string(),
                computed,
            });
        }

        Ok(())
    }

    fn compute_digest(data: &[u8]) -> String {
        use sha2::{Sha256, Digest};
        let hash = Sha256::digest(data);
        format!("sha256:{}", hex::encode(hash))
    }

    fn canonicalize_json(data: &[u8]) -> Result<Vec<u8>> {
        // Parse and re-serialize for canonical form
        let value: serde_json::Value = serde_json::from_slice(data)?;
        serde_json::to_vec(&value).map_err(Into::into)
    }
}
```

### 4.3 Input Validation

```rust
// Comprehensive input validation
struct InputValidator;

impl InputValidator {
    fn validate_repository_name(name: &str) -> Result<()> {
        // Docker repository naming rules
        // - lowercase letters, digits, separators (., _, -, /)
        // - must start with alphanumeric
        // - max 255 characters
        // - no consecutive separators

        if name.is_empty() || name.len() > 255 {
            return Err(DockerHubError::RepositoryNameInvalid("Length invalid"));
        }

        if !name.chars().next().unwrap().is_alphanumeric() {
            return Err(DockerHubError::RepositoryNameInvalid(
                "Must start with alphanumeric"
            ));
        }

        let valid_chars = |c: char| {
            c.is_ascii_lowercase() || c.is_ascii_digit() ||
            c == '.' || c == '_' || c == '-' || c == '/'
        };

        if !name.chars().all(valid_chars) {
            return Err(DockerHubError::RepositoryNameInvalid(
                "Contains invalid characters"
            ));
        }

        // No consecutive separators
        let separators = ['.', '_', '-'];
        for sep in separators {
            if name.contains(&format!("{}{}", sep, sep)) {
                return Err(DockerHubError::RepositoryNameInvalid(
                    "Consecutive separators not allowed"
                ));
            }
        }

        Ok(())
    }

    fn validate_namespace(namespace: &str) -> Result<()> {
        // Namespace rules (Docker Hub username/org)
        // - 2-255 characters
        // - alphanumeric and hyphens
        // - must start with letter

        if namespace.len() < 2 || namespace.len() > 255 {
            return Err(DockerHubError::NamespaceInvalid("Length must be 2-255"));
        }

        if !namespace.chars().next().unwrap().is_ascii_alphabetic() {
            return Err(DockerHubError::NamespaceInvalid("Must start with letter"));
        }

        if !namespace.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            return Err(DockerHubError::NamespaceInvalid("Invalid characters"));
        }

        Ok(())
    }
}
```

---

## 5. Rate Limit Handling

### 5.1 Proactive Rate Limit Management

```rust
// Proactive rate limit management
struct RateLimitManager {
    pull_remaining: AtomicI32,
    pull_limit: AtomicI32,
    reset_time: RwLock<Option<Instant>>,
    is_authenticated: bool,
    low_limit_threshold: i32,
}

impl RateLimitManager {
    fn new(is_authenticated: bool) -> Self {
        Self {
            pull_remaining: AtomicI32::new(if is_authenticated { 200 } else { 100 }),
            pull_limit: AtomicI32::new(if is_authenticated { 200 } else { 100 }),
            reset_time: RwLock::new(None),
            is_authenticated,
            low_limit_threshold: 10,
        }
    }

    async fn check_before_pull(&self) -> Result<RateLimitStatus> {
        let remaining = self.pull_remaining.load(Ordering::SeqCst);

        if remaining <= 0 {
            let reset = self.reset_time.read().await;
            if let Some(reset_at) = *reset {
                let wait = reset_at - Instant::now();
                if wait > Duration::ZERO {
                    return Err(DockerHubError::PullLimitExceeded {
                        reset_at,
                        is_authenticated: self.is_authenticated,
                        suggestion: if !self.is_authenticated {
                            Some("Authenticate to increase limit from 100 to 200 pulls/6h")
                        } else {
                            None
                        },
                    });
                }
            }
        }

        if remaining <= self.low_limit_threshold {
            tracing::warn!(
                "Docker Hub rate limit low: {} remaining (limit: {})",
                remaining,
                self.pull_limit.load(Ordering::SeqCst)
            );
        }

        Ok(RateLimitStatus {
            remaining,
            limit: self.pull_limit.load(Ordering::SeqCst),
            reset_at: *self.reset_time.read().await,
        })
    }

    fn update_from_response(&self, headers: &HeaderMap) {
        // RateLimit-Remaining: 95
        if let Some(remaining) = headers.get("RateLimit-Remaining") {
            if let Ok(val) = remaining.to_str().unwrap_or("0").parse::<i32>() {
                self.pull_remaining.store(val, Ordering::SeqCst);
            }
        }

        // RateLimit-Limit: 100;w=21600
        if let Some(limit) = headers.get("RateLimit-Limit") {
            let limit_str = limit.to_str().unwrap_or("");
            if let Some(count_str) = limit_str.split(';').next() {
                if let Ok(count) = count_str.parse::<i32>() {
                    self.pull_limit.store(count, Ordering::SeqCst);
                }
            }

            // Parse window for reset time
            if let Some(window_str) = limit_str.split("w=").nth(1) {
                if let Ok(window_secs) = window_str.parse::<u64>() {
                    let mut reset = self.reset_time.write().unwrap();
                    *reset = Some(Instant::now() + Duration::from_secs(window_secs));
                }
            }
        }
    }
}
```

### 5.2 Rate Limit Aware Operations

```rust
// Batch operations respecting rate limits
async fn pull_images_rate_limited(
    &self,
    images: Vec<ImageReference>,
) -> Result<Vec<ImagePullResult>> {
    let mut results = Vec::new();

    for image in images {
        // Check rate limit before each pull
        let status = self.rate_limiter.check_before_pull().await;

        match status {
            Ok(s) if s.remaining > 0 => {
                // Proceed with pull
                let result = self.pull_image(&image).await;
                results.push(ImagePullResult {
                    image: image.clone(),
                    result,
                    rate_limit_remaining: s.remaining - 1,
                });
            }
            Ok(s) => {
                // At limit, wait or queue
                tracing::info!(
                    "Rate limit reached, waiting until {:?}",
                    s.reset_at
                );

                if let Some(reset) = s.reset_at {
                    let wait = reset - Instant::now();
                    if wait < Duration::minutes(5) {
                        tokio::time::sleep(wait).await;
                        // Retry this image
                        let result = self.pull_image(&image).await;
                        results.push(ImagePullResult {
                            image: image.clone(),
                            result,
                            rate_limit_remaining: self.rate_limiter.pull_remaining.load(Ordering::SeqCst),
                        });
                    } else {
                        results.push(ImagePullResult {
                            image: image.clone(),
                            result: Err(DockerHubError::PullLimitExceeded {
                                reset_at: reset,
                                is_authenticated: self.rate_limiter.is_authenticated,
                                suggestion: None,
                            }),
                            rate_limit_remaining: 0,
                        });
                    }
                }
            }
            Err(e) => {
                results.push(ImagePullResult {
                    image: image.clone(),
                    result: Err(e),
                    rate_limit_remaining: 0,
                });
            }
        }
    }

    Ok(results)
}
```

---

## 6. Testing Considerations

### 6.1 Mock Registry

```rust
// Mock Docker registry for testing
struct MockDockerRegistry {
    manifests: Arc<RwLock<HashMap<String, (Manifest, Vec<u8>)>>>,
    blobs: Arc<RwLock<HashMap<String, Vec<u8>>>>,
    tags: Arc<RwLock<HashMap<String, String>>>,  // tag -> digest
    uploads: Arc<RwLock<HashMap<String, UploadState>>>,
    rate_limit: Arc<AtomicI32>,
    failure_mode: Arc<AtomicU8>,
}

struct UploadState {
    data: Vec<u8>,
    expected_digest: Option<String>,
}

impl MockDockerRegistry {
    async fn handle(&self, req: Request) -> Response {
        // Check failure mode
        match FailureMode::from(self.failure_mode.load(Ordering::SeqCst)) {
            FailureMode::RateLimit => {
                return Response::builder()
                    .status(429)
                    .header("RateLimit-Remaining", "0")
                    .header("RateLimit-Limit", "100;w=21600")
                    .body("Rate limit exceeded")
                    .unwrap();
            }
            FailureMode::ServerError => {
                return Response::builder()
                    .status(500)
                    .body("Internal server error")
                    .unwrap();
            }
            _ => {}
        }

        // Decrement rate limit
        self.rate_limit.fetch_sub(1, Ordering::SeqCst);

        // Route request
        let path = req.uri().path();
        let method = req.method();

        match (method, path) {
            (&Method::GET, p) if p.contains("/manifests/") => {
                self.handle_get_manifest(req).await
            }
            (&Method::PUT, p) if p.contains("/manifests/") => {
                self.handle_put_manifest(req).await
            }
            (&Method::HEAD, p) if p.contains("/blobs/") => {
                self.handle_head_blob(req).await
            }
            (&Method::POST, p) if p.contains("/blobs/uploads/") => {
                self.handle_initiate_upload(req).await
            }
            (&Method::PATCH, p) if p.contains("/blobs/uploads/") => {
                self.handle_upload_chunk(req).await
            }
            (&Method::PUT, p) if p.contains("/blobs/uploads/") => {
                self.handle_complete_upload(req).await
            }
            _ => {
                Response::builder()
                    .status(404)
                    .body("Not found")
                    .unwrap()
            }
        }
    }
}
```

### 6.2 Property-Based Testing

```rust
#[cfg(test)]
mod property_tests {
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn image_reference_roundtrip(
            namespace in "[a-z][a-z0-9]{1,20}",
            repo in "[a-z][a-z0-9_-]{1,30}",
            tag in "[a-zA-Z0-9][a-zA-Z0-9._-]{0,50}"
        ) {
            let input = format!("{}/{}:{}", namespace, repo, tag);
            let parsed = parse_image_reference(&input)?;

            prop_assert_eq!(parsed.namespace, namespace);
            prop_assert_eq!(parsed.repository, repo);
            prop_assert_eq!(parsed.reference, Reference::Tag(tag));
        }

        #[test]
        fn digest_computation_deterministic(data in proptest::collection::vec(any::<u8>(), 0..10000)) {
            let digest1 = ContentVerifier::compute_digest(&data);
            let digest2 = ContentVerifier::compute_digest(&data);
            prop_assert_eq!(digest1, digest2);
        }

        #[test]
        fn valid_tags_accepted(tag in "[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}") {
            let result = validate_tag(&tag);
            prop_assert!(result.is_ok());
        }
    }
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Refinement |

---

**Next Phase:** Completion - Acceptance criteria verification, implementation checklist, and deployment readiness.
