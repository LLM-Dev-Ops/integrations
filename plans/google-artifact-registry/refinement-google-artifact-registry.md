# Google Artifact Registry Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/google-artifact-registry`

---

## 1. Edge Cases and Error Handling

### 1.1 Authentication Edge Cases

| Scenario | Handling |
|----------|----------|
| Service account key expired | Return `AuthenticationError::KeyExpired` with rotation guidance |
| Workload identity not configured | Fall back to ADC, log warning |
| Metadata server unreachable (non-GKE) | Timeout after 2s, try next auth method |
| Token refresh during request | Queue requests, refresh once, retry all |
| Concurrent token refresh | Use mutex to prevent thundering herd |
| Scoped token insufficient | Re-request with expanded scope |

```rust
// Concurrent token refresh protection
async fn get_token_with_lock(&self, scopes: &[&str]) -> Result<String> {
    // Fast path: check cache without lock
    if let Some(token) = self.try_cached_token().await {
        return Ok(token);
    }

    // Slow path: acquire lock, double-check, then refresh
    let _guard = self.refresh_mutex.lock().await;

    // Double-check after acquiring lock
    if let Some(token) = self.try_cached_token().await {
        return Ok(token);
    }

    self.refresh_token(scopes).await
}
```

### 1.2 Regional Edge Cases

| Scenario | Handling |
|----------|----------|
| Repository in different region than config | Use repository's actual location from metadata |
| Location unavailable/maintenance | Return `LocationUnavailable` with retry guidance |
| Cross-region blob mount | Not supported by GAR, upload blob to target |
| Invalid location string | Validate against known locations list |
| Multi-region vs regional mismatch | Detect from repository format field |

```rust
fn resolve_location(&self, image: &ImageReference) -> Result<String> {
    // Priority: explicit > repository metadata > config default > "us"
    if let Some(loc) = &image.location {
        return self.validate_location(loc);
    }

    if let Ok(repo) = self.get_repository_metadata(&image.repository).await {
        return Ok(repo.location);
    }

    Ok(self.config.default_location.clone().unwrap_or("us".to_string()))
}
```

### 1.3 Manifest Edge Cases

| Scenario | Handling |
|----------|----------|
| Manifest list (multi-arch) | Parse and allow platform selection |
| OCI index vs Docker manifest list | Handle both media types |
| Schema version mismatch | Support v1 (legacy) and v2 |
| Manifest too large (>4MB) | Stream instead of buffering |
| Digest mismatch on GET | Return `DigestMismatch` error |
| Tag pointing to deleted manifest | Return `ManifestNotFound` |

```rust
fn parse_manifest(content_type: &str, body: &[u8]) -> Result<Manifest> {
    match content_type {
        "application/vnd.docker.distribution.manifest.v2+json" =>
            parse_docker_v2(body),
        "application/vnd.docker.distribution.manifest.list.v2+json" =>
            parse_docker_manifest_list(body),
        "application/vnd.oci.image.manifest.v1+json" =>
            parse_oci_manifest(body),
        "application/vnd.oci.image.index.v1+json" =>
            parse_oci_index(body),
        _ => Err(ArtifactRegistryError::UnsupportedMediaType(content_type.into()))
    }
}
```

---

## 2. Multi-Architecture Support

### 2.1 Manifest List Handling

```rust
struct ManifestList {
    schema_version: u32,
    media_type: String,
    manifests: Vec<PlatformManifest>,
}

struct PlatformManifest {
    media_type: String,
    digest: String,
    size: u64,
    platform: Platform,
}

struct Platform {
    architecture: String,  // amd64, arm64, arm, etc.
    os: String,            // linux, windows, darwin
    variant: Option<String>, // v7, v8 for ARM
    os_version: Option<String>, // Windows version
}

impl DockerService {
    async fn get_manifest_for_platform(
        &self,
        image: &ImageReference,
        platform: &Platform,
    ) -> Result<Manifest> {
        let manifest_list = self.get_manifest(image).await?;

        match manifest_list {
            Manifest::List(list) => {
                let platform_manifest = list.manifests.iter()
                    .find(|m| m.platform.matches(platform))
                    .ok_or(ArtifactRegistryError::PlatformNotFound {
                        requested: platform.clone(),
                        available: list.manifests.iter()
                            .map(|m| m.platform.clone())
                            .collect(),
                    })?;

                // Fetch the actual manifest by digest
                let digest_ref = image.with_reference(
                    TagOrDigest::Digest(platform_manifest.digest.clone())
                );
                self.get_manifest(&digest_ref).await
            }
            Manifest::Single(m) => Ok(Manifest::Single(m)),
        }
    }

    fn default_platform() -> Platform {
        Platform {
            architecture: std::env::consts::ARCH.to_string(),
            os: std::env::consts::OS.to_string(),
            variant: None,
            os_version: None,
        }
    }
}
```

### 2.2 Platform Matching

```rust
impl Platform {
    fn matches(&self, other: &Platform) -> bool {
        // Architecture must match
        if !self.arch_matches(&other.architecture) {
            return false;
        }

        // OS must match
        if self.os.to_lowercase() != other.os.to_lowercase() {
            return false;
        }

        // Variant: if specified in request, must match
        if let Some(req_variant) = &other.variant {
            if self.variant.as_ref() != Some(req_variant) {
                return false;
            }
        }

        true
    }

    fn arch_matches(&self, other: &str) -> bool {
        let normalized_self = Self::normalize_arch(&self.architecture);
        let normalized_other = Self::normalize_arch(other);
        normalized_self == normalized_other
    }

    fn normalize_arch(arch: &str) -> &str {
        match arch.to_lowercase().as_str() {
            "x86_64" | "x86-64" | "amd64" => "amd64",
            "aarch64" | "arm64" => "arm64",
            "armv7l" | "armhf" | "arm" => "arm",
            other => other,
        }
    }
}
```

---

## 3. Blob Upload Refinements

### 3.1 Resumable Upload

```rust
struct UploadSession {
    upload_url: String,
    image: ImageReference,
    digest: String,
    total_size: u64,
    uploaded_bytes: u64,
    chunk_size: usize,
    started_at: Instant,
}

impl DockerService {
    async fn resumable_upload(
        &self,
        image: &ImageReference,
        data: &[u8],
        session: Option<UploadSession>,
    ) -> Result<String> {
        let digest = format!("sha256:{}", sha256_hex(data));

        // Resume or start new
        let mut session = match session {
            Some(s) if s.digest == digest => s,
            _ => self.initiate_upload(image, data.len() as u64, &digest).await?,
        };

        while session.uploaded_bytes < session.total_size {
            let start = session.uploaded_bytes as usize;
            let end = std::cmp::min(start + session.chunk_size, data.len());
            let chunk = &data[start..end];

            match self.upload_chunk(&mut session, chunk).await {
                Ok(()) => {
                    session.uploaded_bytes = end as u64;
                }
                Err(e) if e.is_retryable() => {
                    // Save session state for resume
                    self.save_session(&session).await?;
                    return Err(e);
                }
                Err(e) => return Err(e),
            }
        }

        self.complete_upload(&session).await
    }

    async fn upload_chunk(&self, session: &mut UploadSession, chunk: &[u8]) -> Result<()> {
        let range_start = session.uploaded_bytes;
        let range_end = range_start + chunk.len() as u64 - 1;

        let response = self.http_client.patch(&session.upload_url)
            .header("Authorization", format!("Bearer {}", self.get_token().await?))
            .header("Content-Type", "application/octet-stream")
            .header("Content-Length", chunk.len().to_string())
            .header("Content-Range", format!("{}-{}", range_start, range_end))
            .body(chunk.to_vec())
            .send().await?;

        if response.status() == StatusCode::ACCEPTED {
            // Update URL for next chunk
            if let Some(location) = response.headers().get("Location") {
                session.upload_url = location.to_str()?.to_string();
            }
            Ok(())
        } else if response.status() == StatusCode::RANGE_NOT_SATISFIABLE {
            // Server has different offset, query and adjust
            let server_offset = self.query_upload_progress(session).await?;
            session.uploaded_bytes = server_offset;
            Err(ArtifactRegistryError::UploadOffsetMismatch {
                expected: range_start,
                actual: server_offset
            })
        } else {
            Err(self.parse_registry_error(response).await)
        }
    }
}
```

### 3.2 Cross-Repository Mount

```rust
impl DockerService {
    async fn mount_or_upload(
        &self,
        target: &ImageReference,
        digest: &str,
        source_repo: Option<&str>,
        data: &[u8],
    ) -> Result<String> {
        // Try mount first if source provided and same project
        if let Some(source) = source_repo {
            if self.same_project(target, source) {
                match self.try_mount(target, digest, source).await {
                    Ok(()) => return Ok(digest.to_string()),
                    Err(e) => {
                        tracing::debug!("Mount failed, falling back to upload: {}", e);
                    }
                }
            }
        }

        // Fall back to regular upload
        self.upload_blob(target, data).await
    }

    async fn try_mount(
        &self,
        target: &ImageReference,
        digest: &str,
        source_repo: &str,
    ) -> Result<()> {
        let token = self.get_docker_token(target, &["push", "pull"]).await?;

        let url = format!(
            "https://{}/v2/{}/blobs/uploads/?mount={}&from={}",
            target.registry_url(),
            target.full_name(),
            digest,
            source_repo
        );

        let response = self.http_client.post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send().await?;

        // 201 = mounted successfully, 202 = mount failed, upload initiated
        if response.status() == StatusCode::CREATED {
            Ok(())
        } else {
            Err(ArtifactRegistryError::MountFailed(digest.to_string()))
        }
    }
}
```

---

## 4. Vulnerability Refinements

### 4.1 Scan Status Handling

```rust
enum ScanStatus {
    NotScanned,
    Scanning,
    Completed { timestamp: DateTime<Utc> },
    Failed { reason: String },
}

impl VulnerabilityService {
    async fn get_scan_status(&self, image: &ImageReference) -> Result<ScanStatus> {
        let digest = match &image.reference {
            TagOrDigest::Digest(d) => d.clone(),
            TagOrDigest::Tag(_) => {
                // Resolve tag to digest first
                let manifest = self.docker_service.get_manifest(image).await?;
                manifest.digest()
            }
        };

        let occurrences = self.list_occurrences_for_resource(image, &digest).await?;

        // Check for DISCOVERY occurrence
        let discovery = occurrences.iter()
            .find(|o| o.kind == "DISCOVERY");

        match discovery {
            None => Ok(ScanStatus::NotScanned),
            Some(d) => match d.discovery.analysis_status.as_str() {
                "SCANNING" => Ok(ScanStatus::Scanning),
                "FINISHED_SUCCESS" => Ok(ScanStatus::Completed {
                    timestamp: d.update_time.parse()?,
                }),
                "FINISHED_FAILED" => Ok(ScanStatus::Failed {
                    reason: d.discovery.analysis_status_error.clone()
                        .unwrap_or_default(),
                }),
                _ => Ok(ScanStatus::NotScanned),
            }
        }
    }

    async fn wait_for_scan(
        &self,
        image: &ImageReference,
        timeout: Duration,
    ) -> Result<VulnerabilityReport> {
        let deadline = Instant::now() + timeout;
        let mut interval = Duration::from_secs(5);

        loop {
            match self.get_scan_status(image).await? {
                ScanStatus::Completed { .. } => {
                    return self.get_vulnerabilities(image).await;
                }
                ScanStatus::Failed { reason } => {
                    return Err(ArtifactRegistryError::ScanFailed(reason));
                }
                ScanStatus::NotScanned | ScanStatus::Scanning => {
                    if Instant::now() > deadline {
                        return Err(ArtifactRegistryError::ScanTimeout);
                    }
                    tokio::time::sleep(interval).await;
                    interval = std::cmp::min(interval * 2, Duration::from_secs(30));
                }
            }
        }
    }
}
```

### 4.2 SBOM Integration

```rust
struct SBOM {
    format: SBOMFormat,
    packages: Vec<SBOMPackage>,
    generated_at: DateTime<Utc>,
}

enum SBOMFormat {
    SPDX,
    CycloneDX,
}

struct SBOMPackage {
    name: String,
    version: String,
    purl: Option<String>,  // Package URL
    licenses: Vec<String>,
    supplier: Option<String>,
}

impl VulnerabilityService {
    async fn get_sbom(&self, image: &ImageReference) -> Result<Option<SBOM>> {
        let occurrences = self.list_occurrences(
            &image.project,
            Some(&format!(
                "resourceUrl=\"{}\" AND kind=\"SBOM_REFERENCE\"",
                self.build_resource_uri(image)
            ))
        ).await?;

        if let Some(sbom_ref) = occurrences.first() {
            let sbom_uri = &sbom_ref.sbom_reference.payload.sbom_uri;
            let sbom_data = self.fetch_sbom_content(sbom_uri).await?;
            Ok(Some(self.parse_sbom(&sbom_data)?))
        } else {
            Ok(None)
        }
    }
}
```

---

## 5. Cleanup Policy Integration

### 5.1 Policy Retrieval

```rust
struct CleanupPolicy {
    name: String,
    action: CleanupAction,
    condition: CleanupCondition,
    most_recent_versions: Option<MostRecentVersions>,
}

enum CleanupAction {
    Delete,
    Keep,
}

struct CleanupCondition {
    tag_state: Option<TagState>,
    tag_prefixes: Vec<String>,
    version_name_prefixes: Vec<String>,
    package_name_prefixes: Vec<String>,
    older_than: Option<Duration>,
    newer_than: Option<Duration>,
}

impl RepositoryService {
    async fn get_cleanup_policies(&self, location: &str, repo: &str) -> Result<Vec<CleanupPolicy>> {
        let repository = self.get(location, repo).await?;
        Ok(repository.cleanup_policies.unwrap_or_default())
    }

    async fn preview_cleanup(
        &self,
        location: &str,
        repo: &str,
    ) -> Result<CleanupPreview> {
        let policies = self.get_cleanup_policies(location, repo).await?;
        let versions = self.client.packages().list_all_versions(location, repo).await?;

        let mut to_delete = Vec::new();
        let mut to_keep = Vec::new();

        for version in versions {
            let action = self.evaluate_policies(&policies, &version);
            match action {
                CleanupAction::Delete => to_delete.push(version),
                CleanupAction::Keep => to_keep.push(version),
            }
        }

        Ok(CleanupPreview { to_delete, to_keep })
    }
}
```

---

## 6. Concurrency Patterns

### 6.1 Parallel Operations

```rust
impl DockerService {
    async fn push_image(
        &self,
        image: &ImageReference,
        manifest: &Manifest,
        layers: &[LayerData],
    ) -> Result<String> {
        // Upload config and layers in parallel
        let config_future = self.upload_blob(image, &manifest.config_data);

        let layer_futures: Vec<_> = layers.iter()
            .map(|layer| self.upload_blob(image, &layer.data))
            .collect();

        // Use bounded concurrency
        let semaphore = Arc::new(Semaphore::new(5));
        let layer_results: Vec<Result<String>> = futures::future::join_all(
            layer_futures.into_iter().map(|fut| {
                let sem = semaphore.clone();
                async move {
                    let _permit = sem.acquire().await?;
                    fut.await
                }
            })
        ).await;

        // Wait for config
        let config_digest = config_future.await?;

        // Check all layers succeeded
        let layer_digests: Vec<String> = layer_results
            .into_iter()
            .collect::<Result<Vec<_>>>()?;

        // Push manifest
        self.put_manifest(image, manifest).await
    }
}
```

### 6.2 Rate Limiting

```rust
struct RateLimiter {
    read_limiter: Arc<Mutex<TokenBucket>>,
    write_limiter: Arc<Mutex<TokenBucket>>,
}

impl RateLimiter {
    fn new(config: &QuotaConfig) -> Self {
        Self {
            read_limiter: Arc::new(Mutex::new(TokenBucket::new(
                config.read_requests_per_minute,
                Duration::from_secs(60),
            ))),
            write_limiter: Arc::new(Mutex::new(TokenBucket::new(
                config.write_requests_per_minute,
                Duration::from_secs(60),
            ))),
        }
    }

    async fn acquire_read(&self) -> Result<()> {
        self.read_limiter.lock().await.acquire().await
    }

    async fn acquire_write(&self) -> Result<()> {
        self.write_limiter.lock().await.acquire().await
    }
}
```

---

## 7. Testing Refinements

### 7.1 Mock Scenarios

```rust
#[cfg(test)]
mod tests {
    struct MockScenario {
        name: &'static str,
        setup: Box<dyn Fn(&mut MockProvider)>,
        expected_error: Option<ArtifactRegistryError>,
    }

    fn auth_scenarios() -> Vec<MockScenario> {
        vec![
            MockScenario {
                name: "service_account_success",
                setup: Box::new(|mock| {
                    mock.expect_token()
                        .returning(|| Ok(TokenResponse {
                            access_token: "test-token".into(),
                            expires_in: 3600,
                        }));
                }),
                expected_error: None,
            },
            MockScenario {
                name: "token_expired_refresh_success",
                setup: Box::new(|mock| {
                    mock.expect_token()
                        .times(1)
                        .returning(|| Err(AuthError::TokenExpired));
                    mock.expect_refresh()
                        .returning(|| Ok(TokenResponse {
                            access_token: "new-token".into(),
                            expires_in: 3600,
                        }));
                }),
                expected_error: None,
            },
            MockScenario {
                name: "metadata_server_timeout",
                setup: Box::new(|mock| {
                    mock.expect_metadata_token()
                        .returning(|| Err(AuthError::Timeout));
                    mock.expect_adc_token()
                        .returning(|| Ok(TokenResponse {
                            access_token: "adc-token".into(),
                            expires_in: 3600,
                        }));
                }),
                expected_error: None,
            },
        ]
    }

    fn manifest_scenarios() -> Vec<MockScenario> {
        vec![
            MockScenario {
                name: "multi_arch_manifest_list",
                setup: Box::new(|mock| {
                    mock.seed_manifest("test/image:latest", Manifest::List(ManifestList {
                        manifests: vec![
                            platform_manifest("amd64", "linux", "sha256:amd64..."),
                            platform_manifest("arm64", "linux", "sha256:arm64..."),
                        ],
                        ..Default::default()
                    }));
                }),
                expected_error: None,
            },
            MockScenario {
                name: "platform_not_found",
                setup: Box::new(|mock| {
                    mock.seed_manifest("test/image:latest", Manifest::List(ManifestList {
                        manifests: vec![
                            platform_manifest("amd64", "linux", "sha256:amd64..."),
                        ],
                        ..Default::default()
                    }));
                }),
                expected_error: Some(ArtifactRegistryError::PlatformNotFound { .. }),
            },
        ]
    }
}
```

### 7.2 Property-Based Tests

```rust
#[cfg(test)]
mod property_tests {
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn digest_verification_never_passes_mismatch(
            data in prop::collection::vec(any::<u8>(), 1..10000),
            corrupt_byte in any::<usize>(),
        ) {
            let digest = compute_digest(&data);

            let mut corrupted = data.clone();
            let idx = corrupt_byte % corrupted.len();
            corrupted[idx] = corrupted[idx].wrapping_add(1);

            let result = verify_digest(&corrupted, &digest);
            prop_assert!(result.is_err());
        }

        #[test]
        fn location_parsing_roundtrips(
            region in "[a-z]{2,4}-[a-z]{4,10}[0-9]?",
        ) {
            let endpoint = format!("{}-docker.pkg.dev", region);
            let parsed = parse_registry_endpoint(&endpoint);
            prop_assert_eq!(parsed.location, region);
        }

        #[test]
        fn image_reference_serialization_roundtrips(
            project in "[a-z][a-z0-9-]{4,28}[a-z0-9]",
            repo in "[a-z][a-z0-9-]{0,62}",
            image in "[a-z][a-z0-9._-]{0,127}",
            tag in "[a-zA-Z0-9._-]{1,128}",
        ) {
            let reference = ImageReference {
                location: "us-central1".into(),
                project,
                repository: repo,
                image,
                reference: TagOrDigest::Tag(tag),
            };

            let serialized = reference.to_string();
            let parsed = ImageReference::parse(&serialized)?;
            prop_assert_eq!(reference, parsed);
        }
    }
}
```

---

## 8. Performance Optimizations

### 8.1 Connection Pooling

```rust
impl ArtifactRegistryClient {
    fn create_http_client(config: &Config) -> reqwest::Client {
        reqwest::Client::builder()
            .pool_max_idle_per_host(config.pool_max_idle.unwrap_or(10))
            .pool_idle_timeout(config.pool_idle_timeout.unwrap_or(Duration::from_secs(90)))
            .tcp_keepalive(Duration::from_secs(60))
            .tcp_nodelay(true)
            .timeout(config.timeout)
            .connect_timeout(Duration::from_secs(10))
            .build()
            .expect("Failed to create HTTP client")
    }
}
```

### 8.2 Response Streaming

```rust
impl DockerService {
    async fn download_blob_streaming(
        &self,
        image: &ImageReference,
        digest: &str,
        writer: &mut impl AsyncWrite + Unpin,
    ) -> Result<u64> {
        let token = self.get_docker_token(image, &["pull"]).await?;

        let url = format!(
            "https://{}/v2/{}/blobs/{}",
            image.registry_url(),
            image.full_name(),
            digest
        );

        let response = self.http_client.get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send().await?;

        let mut hasher = Sha256::new();
        let mut total_bytes = 0u64;
        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            hasher.update(&chunk);
            writer.write_all(&chunk).await?;
            total_bytes += chunk.len() as u64;
        }

        // Verify digest
        let actual_digest = format!("sha256:{:x}", hasher.finalize());
        if actual_digest != digest {
            return Err(ArtifactRegistryError::DigestMismatch {
                expected: digest.to_string(),
                actual: actual_digest,
            });
        }

        Ok(total_bytes)
    }
}
```

---

## 9. Configuration Refinements

### 9.1 Environment Variable Mapping

```rust
impl ArtifactRegistryConfig {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            project_id: env::var("GAR_PROJECT_ID")
                .or_else(|_| env::var("GOOGLE_CLOUD_PROJECT"))
                .or_else(|_| env::var("GCLOUD_PROJECT"))?,
            default_location: env::var("GAR_LOCATION")
                .unwrap_or_else(|_| "us".to_string()),
            credentials: Self::credentials_from_env()?,
            timeout: env::var("GAR_TIMEOUT_SECONDS")
                .ok()
                .and_then(|s| s.parse().ok())
                .map(Duration::from_secs)
                .unwrap_or(Duration::from_secs(30)),
            retry_config: RetryConfig::from_env()?,
            ..Default::default()
        })
    }

    fn credentials_from_env() -> Result<GcpCredentials> {
        // Priority: explicit key > ADC file > workload identity > metadata
        if let Ok(key_path) = env::var("GOOGLE_APPLICATION_CREDENTIALS") {
            let key_data = std::fs::read_to_string(&key_path)?;
            return Ok(GcpCredentials::ServiceAccountKey(
                serde_json::from_str(&key_data)?
            ));
        }

        if let Ok(key_json) = env::var("GAR_SERVICE_ACCOUNT_KEY") {
            return Ok(GcpCredentials::ServiceAccountKey(
                serde_json::from_str(&key_json)?
            ));
        }

        // Fall back to ADC
        Ok(GcpCredentials::ApplicationDefault)
    }
}
```

---

## 10. Logging Refinements

### 10.1 Structured Logging

```rust
impl ArtifactRegistryClient {
    fn log_operation<T>(
        &self,
        operation: &str,
        image: Option<&ImageReference>,
        result: &Result<T>,
        duration: Duration,
    ) {
        let status = if result.is_ok() { "success" } else { "failure" };

        let fields = json!({
            "operation": operation,
            "project": self.config.project_id,
            "location": image.map(|i| &i.location),
            "repository": image.map(|i| &i.repository),
            "image": image.map(|i| &i.image),
            "reference": image.map(|i| i.reference.to_string()),
            "status": status,
            "duration_ms": duration.as_millis(),
        });

        match result {
            Ok(_) => tracing::info!(target: "gar", fields = %fields, "Operation completed"),
            Err(e) => tracing::error!(
                target: "gar",
                fields = %fields,
                error = %e,
                "Operation failed"
            ),
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

**Next Phase:** Completion - Implementation tasks, test coverage requirements, deployment checklist, and operational runbooks.
